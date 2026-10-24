import { depositMovement } from '../core/deposits.js';
import type { Finding } from '../core/findings.js';
import { negateDecimal, sumDecimals } from '../core/money.js';
import type { LedgerLine } from '../core/source.js';
import { LEVY_TYPES } from '../mapping/index.js';
import { odooMovements } from '../odoo/target.js';
import type { ApaleoVat } from './apaleo-vat.js';
import type { PostedSide } from './guard.js';
import { SKIP_REASONS, type DepositRateTotal, type LevyTotal, type PostedBooking, type PostingSummary, type SkipReason, type VatTotal } from './types.js';

/** Odoo account codes in numeric order: shorter before longer codes. */
const byNumber = (a: string, b: string) => a.length - b.length || a.localeCompare(b);

/** Signed amount for a type: positive when an account of the type is credited, negative when debited, 0 when absent. */
function creditedAmount(line: LedgerLine, types: ReadonlySet<string> | string): number {
  const has = (type: string) => (typeof types === 'string' ? type === types : types.has(type));
  return (has(line.credit.type) ? line.grossCents : 0) - (has(line.debit.type) ? line.grossCents : 0);
}

/**
 * The gross a side moves, signed as credited (owed), and the tax and net of
 * that gross when the side is the booking's VAT side: apaleo's rounded tax with
 * the sign of the gross, and the gross minus it (the net passed to Odoo).
 */
function owedOn(line: LedgerLine, side: PostedSide, booking: PostedBooking): { net: number; vat: number; tax: string; rate: number } {
  const gross = creditedAmount(line, side.ref.type);
  if (!side.vat || !booking.vat) return { net: gross, vat: 0, tax: '', rate: 0 };
  const vat = Math.sign(gross) * booking.vat.apaleoTaxCents;
  return { net: gross - vat, vat, tax: booking.vat.taxRef, rate: booking.vat.percent };
}

interface VatEntry {
  tax: string;
  rate: number;
  net: number;
  vat: number;
  apaleo: string[];
}

/** Collects the totals of a posting run while bookings are produced. */
export class SummaryBuilder {
  private readonly accounts = new Map<string, { soll: number; haben: number }>();
  private readonly revenue = new Map<string, VatEntry>();
  private readonly depositVat = new Map<string, VatEntry>();
  private readonly writeOffs = new Map<string, VatEntry>();
  private readonly payments = new Map<string, number>();
  private readonly skipped = new Map<SkipReason, { lines: number; gross: number }>();
  private cityTax = 0;
  private readonly levies = new Map<string, LevyTotal>();
  private readonly deposits = { receivedCents: 0, releasedCents: 0, refundedCents: 0 };
  private readonly depositsByRate = new Map<string, DepositRateTotal>();
  private accountsReceivable = 0;

  /** `apaleoVat` is what `apaleoVatOf` gives for the line. */
  addBooking(line: LedgerLine, booking: PostedBooking, debit: PostedSide, credit: PostedSide, apaleoVat: readonly ApaleoVat[]): void {
    for (const [account, cents] of odooMovements(booking)) {
      const entry = this.account(account);
      if (cents > 0) entry.soll += cents;
      else entry.haben -= cents;
    }
    const side = (type: string) => (credit.ref.type === type ? credit : debit.ref.type === type ? debit : undefined);
    const revenue = side('Revenues');
    const deposit = revenue ? undefined : side('Liabilities');
    const vatSide = revenue ?? deposit;
    if (vatSide) {
      const owed = owedOn(line, vatSide, booking);
      addVat(revenue ? this.revenue : this.depositVat, owed, apaleoVat.map((vat) => vat.precise));
    }
    const loss = vatSide ? undefined : side('LossOfAccountsReceivable');
    if (loss) {
      // Written off (positive) when the write-off account is debited, so the owed amounts and apaleo's VAT are negated.
      const owed = owedOn(line, loss, booking);
      addVat(this.writeOffs, { ...owed, net: -owed.net, vat: -owed.vat }, apaleoVat.map((vat) => negateDecimal(vat.precise)));
    }
    this.cityTax += creditedAmount(line, LEVY_TYPES);
    const levy = [credit, debit].find((posted) => LEVY_TYPES.has(posted.ref.type));
    if (levy) this.addLevy(levy, owedOn(line, levy, booking));
    for (const payment of [debit, credit]) {
      if (payment.ref.type !== 'Payments') continue;
      const signed = payment === debit ? line.grossCents : -line.grossCents;
      this.payments.set(payment.row.odooAccount, (this.payments.get(payment.row.odooAccount) ?? 0) + signed);
    }
    const movement = depositMovement(line);
    if (movement?.direction === 'increase') this.deposits.receivedCents += movement.cents;
    if (movement?.direction === 'decrease') this.deposits.releasedCents += movement.cents;
    if (movement?.direction === 'decrease' && movement.viaPayment) this.deposits.refundedCents += movement.cents;
    if (movement) this.addDepositByRate(movement, deposit, booking);
    this.accountsReceivable -= creditedAmount(line, 'AccountsReceivable');
  }

  /**
   * A deposit movement under the Odoo tax and rate of its line: received
   * (credited to the deposit account, invoice side, raises the Kennzahl), or
   * released and, of the released, refunded (debited, refund side, lowers it).
   */
  private addDepositByRate(movement: NonNullable<ReturnType<typeof depositMovement>>, deposit: PostedSide | undefined, booking: PostedBooking): void {
    const taxed = deposit?.vat === true && booking.vat !== undefined;
    const tax = taxed ? (booking.vat?.taxRef ?? '') : '';
    const rate = taxed ? (booking.vat?.percent ?? 0) : 0;
    const vat = taxed ? (booking.vat?.apaleoTaxCents ?? 0) : 0;
    const key = `${tax}\u0000${rate}`;
    const entry = this.depositsByRate.get(key) ?? {
      tax,
      ratePercent: rate,
      received: { grossCents: 0, vatCents: 0 },
      released: { grossCents: 0, vatCents: 0 },
      refunded: { grossCents: 0, vatCents: 0 },
    };
    const add = (total: DepositRateTotal['received']) => {
      total.grossCents += movement.cents;
      total.vatCents += vat;
    };
    if (movement.direction === 'increase') add(entry.received);
    else add(entry.released);
    if (movement.direction === 'decrease' && movement.viaPayment) add(entry.refunded);
    this.depositsByRate.set(key, entry);
  }

  /** A levy line on its Odoo account, with apaleo's tax when the levy side carries the Odoo tax. */
  private addLevy(levy: PostedSide, owed: ReturnType<typeof owedOn>): void {
    const key = `${levy.row.odooAccount}\u0000${owed.tax}\u0000${owed.rate}`;
    const entry = this.levies.get(key) ?? { account: levy.row.odooAccount, tax: owed.tax, ratePercent: owed.rate, grossCents: 0, vatCents: 0 };
    entry.grossCents += owed.net + owed.vat;
    entry.vatCents += owed.vat;
    this.levies.set(key, entry);
  }

  addSkipped(reason: SkipReason, line: LedgerLine): void {
    const entry = this.skipped.get(reason) ?? { lines: 0, gross: 0 };
    entry.lines += 1;
    entry.gross += Math.abs(line.grossCents);
    this.skipped.set(reason, entry);
  }

  build(findings: readonly Finding[]): PostingSummary {
    const counts = new Map<string, number>();
    for (const finding of findings) counts.set(finding.code, (counts.get(finding.code) ?? 0) + 1);
    return {
      accounts: [...this.accounts]
        .sort(([a], [b]) => byNumber(a, b))
        .map(([account, { soll, haben }]) => ({ account, sollCents: soll, habenCents: haben, balanceCents: soll - haben })),
      revenueByRate: vatTotals(this.revenue),
      depositVatByRate: vatTotals(this.depositVat),
      writeOffsByRate: vatTotals(this.writeOffs),
      cityTaxCents: this.cityTax,
      levies: [...this.levies.values()].sort((a, b) => byNumber(a.account, b.account) || a.ratePercent - b.ratePercent || a.tax.localeCompare(b.tax)),
      payments: [...this.payments].sort(([a], [b]) => byNumber(a, b)).map(([account, cents]) => ({ account, cents })),
      deposits: { ...this.deposits },
      depositsByRate: [...this.depositsByRate.values()].sort((a, b) => a.ratePercent - b.ratePercent || a.tax.localeCompare(b.tax)),
      accountsReceivableCents: this.accountsReceivable,
      skipped: SKIP_REASONS.flatMap((reason) => {
        const entry = this.skipped.get(reason);
        return entry ? [{ reason, lines: entry.lines, grossCents: entry.gross }] : [];
      }),
      findings: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => ({ code, count })),
    };
  }

  private account(number: string): { soll: number; haben: number } {
    let entry = this.accounts.get(number);
    if (!entry) {
      entry = { soll: 0, haben: 0 };
      this.accounts.set(number, entry);
    }
    return entry;
  }
}

function addVat(totals: Map<string, VatEntry>, { net, vat, tax, rate }: { net: number; vat: number; tax: string; rate: number }, apaleoPrecise: readonly string[]): void {
  const key = `${tax}\u0000${rate}`;
  const entry = totals.get(key) ?? { tax, rate, net: 0, vat: 0, apaleo: [] };
  entry.net += net;
  entry.vat += vat;
  entry.apaleo.push(...apaleoPrecise);
  totals.set(key, entry);
}

/** One total per Odoo tax and rate, by rate and then tax (no tax first). */
function vatTotals(entries: ReadonlyMap<string, VatEntry>): VatTotal[] {
  return [...entries.values()]
    .sort((a, b) => a.rate - b.rate || a.tax.localeCompare(b.tax))
    .map(({ tax, rate, net, vat, apaleo }) => ({ tax, ratePercent: rate, netCents: net, vatCents: vat, grossCents: net + vat, apaleoVat: sumDecimals(apaleo) }));
}
