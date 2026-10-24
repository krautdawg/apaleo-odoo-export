import { formatFinding, type Finding } from '../core/findings.js';
import { decimalToCents, formatCents } from '../core/money.js';
import type { DepositRateTotal, LevyTotal, PostingSummary, SkipReason, VatTotal } from '../posting/index.js';
import { formatTable } from '../cli/table.js';
import type { PeriodPart } from './period.js';

const SKIP_LABELS: Readonly<Record<SkipReason, string>> = {
  VAT_ACCOUNT_LINE: 'apaleo VAT account line (Odoo computes the VAT from the tax of the base line)',
  ZERO_AMOUNT: 'amount 0.00',
  SAME_ACCOUNT: 'both sides on the same Odoo account',
};

export interface SummaryInput {
  propertyId: string;
  part: PeriodPart;
  ledgerLines: number;
  bookings: number;
  /** Absent when posting did not run (for example a day that is not closed). */
  summary?: PostingSummary;
  /** The target's import block (`TargetWriter.importBlock`), once the file is rendered. */
  importBlock?: readonly string[];
  /** The line of the tax return for a rate (`TargetWriter.taxReturnLine`), for example `Kz 86`. */
  taxReturnLine?: TaxReturnLine;
  findings: readonly Finding[];
}

type TaxReturnLine = (ratePercent: number) => string | undefined;

/** `tax_ust_7_skr03 7 % (Kz 86)`, `__import__.ust_10 10 %` for a rate without a line of the tax return, `no tax 0 %` without a tax. */
function taxAndRate(tax: string, ratePercent: number, taxReturnLine: TaxReturnLine): string {
  const line = tax === '' ? undefined : taxReturnLine(ratePercent);
  return `${tax || 'no tax'} ${ratePercent} %${line ? ` (${line})` : ''}`;
}

/** Why the tax per line and apaleo's precise VAT differ by a few cents, and where Odoo's own VAT is, for the Steuerberater. */
export const VAT_ROUNDING_NOTE =
  "The revenue, deposit and write-off sections show apaleo's figures before the base fitting: net is the gross minus apaleo's tax of each line " +
  "rounded to the cent (apaleo per line), and apaleo precise is apaleo's exact tax summed and rounded once, so a difference (per line minus precise) " +
  "of a few cents is this rounding, not an error. Odoo computes the VAT itself from the base of each line; the file fits each base to apaleo's gross, " +
  "and the import block shows per tax the base in the file and Odoo's VAT against apaleo per line (difference Odoo minus apaleo): compare those with Odoo.";

/**
 * The posting summary as aligned text, for the dry run and the protocol file:
 * the import block (with Odoo's VAT per tax, entries, lines and rounding lines),
 * totals per Odoo account, revenue, deposit and write-off VAT per Odoo tax and
 * rate (with the UStVA Kennzahl), Kurtaxe and other levies per account, payments
 * per clearing account, deposits received, released and refunded, accounts
 * receivable, skipped lines and every finding. It renders the totals of the
 * posting run (`PostingSummary`) and computes none of its own.
 */
export function renderSummary({ propertyId, part, ledgerLines, bookings, summary, importBlock, taxReturnLine, findings }: SummaryInput): string {
  const out: string[] = [`Property ${propertyId}, ${part.from} to ${part.to}: ${ledgerLines} apaleo lines, ${bookings} Odoo bookings`, ''];
  if (importBlock) out.push(...importBlock, '');
  if (summary) out.push(...postingSection(summary, taxReturnLine ?? (() => undefined)));
  out.push('Findings:');
  out.push(...(findings.length === 0 ? ['  none'] : findings.map((finding) => `  ${formatFinding(finding)}`)), '');
  return out.join('\n');
}

function postingSection(summary: PostingSummary, taxReturnLine: TaxReturnLine): string[] {
  const vatLines = (totals: readonly VatTotal[]) => vatTotalLines(totals, taxReturnLine);
  const out: string[] = [];
  const section = (title: string, body: string) => out.push(title, body.trimEnd() || '  none', '');

  const accounts = summary.accounts.map((a) => [a.account, formatCents(a.sollCents), formatCents(a.habenCents), formatCents(a.balanceCents)]);
  section(
    'Totals per Odoo account before the base fitting (the side without tax with the gross amount, the side with the tax with the gross amount ' +
      "minus apaleo's tax per line; the bases and rounding lines in the file can differ by a cent per tax, see the import block):",
    formatTable([['account', 'Soll', 'Haben', 'balance'], ...accounts], [1, 2, 3], '  '),
  );

  section("Revenue and apaleo's VAT per Odoo tax and rate, with the UStVA Kennzahl (before the base fitting):", vatLines(summary.revenueByRate));
  section("Deposits and apaleo's VAT per Odoo tax and rate (received minus released, before the base fitting):", vatLines(summary.depositVatByRate));
  section(
    "Written-off receivables (Forderungsverluste) and apaleo's VAT correction per Odoo tax and rate, § 17 UStG: the write-off line is on the refund side and lowers the Kennzahl (before the base fitting):",
    vatTotalLines(summary.writeOffsByRate, taxReturnLine, 'lowers'),
  );
  out.push(VAT_ROUNDING_NOTE, '');
  section(`Kurtaxe and other guest levies per account (apaleo city tax, total ${formatCents(summary.cityTaxCents)}):`, levyLines(summary.levies, taxReturnLine).join('\n'));

  const payments = summary.payments.map((p) => [p.account, formatCents(p.cents)]);
  section('Payments per clearing account:', payments.length === 0 ? '' : formatTable([['account', 'amount'], ...payments], [1], '  '));
  const { receivedCents, releasedCents, refundedCents } = summary.deposits;
  section(
    'Deposits (Anzahlungen) received, released and refunded:',
    formatTable(
      [
        ['received', formatCents(receivedCents)],
        ['released', formatCents(releasedCents)],
        ['of it refunded', formatCents(refundedCents)],
      ],
      [1],
      '  ',
    ),
  );
  section(
    'Deposits per Odoo tax and rate (received: credit on the deposit account, raises the Kennzahl; released and refunded: debit, lowers it; gross and apaleo\'s tax per line):',
    depositRateLines(summary.depositsByRate, taxReturnLine),
  );
  out.push(
    `Accounts receivable (Forderungen Firmenrechnungen, Soll positive): ${formatCents(summary.accountsReceivableCents)}`,
    '',
  );

  const skipped = summary.skipped.map((s) => [SKIP_LABELS[s.reason], String(s.lines), formatCents(s.grossCents)]);
  section('Skipped lines:', skipped.length === 0 ? '' : formatTable([['reason', 'lines', 'gross (unsigned)'], ...skipped], [1, 2], '  '));
  return out;
}

/**
 * `  1590 without tax (no UStVA Kennzahl, ...): 12.60` or
 * `  8300 with tax_ust_7_skr03 7 % (Kz 86): gross 2.14, tax 0.14`, one line per account, tax and rate.
 */
function levyLines(levies: readonly LevyTotal[], taxReturnLine: TaxReturnLine): string[] {
  return levies.map((levy) =>
    levy.tax === ''
      ? `  ${levy.account} without tax (no UStVA Kennzahl, for example a durchlaufender Posten): ${formatCents(levy.grossCents)}`
      : `  ${levy.account} with ${taxAndRate(levy.tax, levy.ratePercent, taxReturnLine)}: gross ${formatCents(levy.grossCents)}, tax ${formatCents(levy.vatCents)}`,
  );
}

/**
 * `tax_ust_7_skr03 7 % (Kz 86): net 112.15, apaleo per line 7.85, gross 120.00, apaleo precise 7.85 (7.85046729), difference (per line minus precise) 0.00`,
 * one line per Odoo tax and rate; bookings without a tax as `no tax 0 %`. Net and the tax per line are apaleo's, before the base fitting;
 * Odoo's modelled VAT per tax is in the target's import block.
 */
function vatTotalLines(totals: readonly VatTotal[], taxReturnLine: TaxReturnLine, effect?: 'lowers'): string {
  // Write-offs are signed as written off; their effect on the tax return is the negated tax.
  const lineOf: TaxReturnLine = (rate) => {
    const line = taxReturnLine(rate);
    return line && effect === 'lowers' ? `lowers ${line}` : line;
  };
  return totals
    .map((t) => {
      const precise = decimalToCents(t.apaleoVat);
      return (
        `  ${taxAndRate(t.tax, t.ratePercent, lineOf)}: net ${formatCents(t.netCents)}, apaleo per line ${formatCents(t.vatCents)}, gross ${formatCents(t.grossCents)}, ` +
        `apaleo precise ${formatCents(precise)} (${t.apaleoVat}), difference (per line minus precise) ${formatCents(t.vatCents - precise)}` +
        (effect === 'lowers' && t.tax !== '' ? `, VAT in the return ${formatCents(-t.vatCents)}` : '')
      );
    })
    .join('\n');
}

/**
 * `  tax_ust_7_skr03 7 % (Kz 86): received 321.00 (tax 21.00), released 321.00 (tax 21.00), of it refunded 107.00 (tax 7.00)`,
 * one line per Odoo tax and rate; deposits without tax as `no tax 0 %`.
 */
function depositRateLines(totals: readonly DepositRateTotal[], taxReturnLine: TaxReturnLine): string {
  const amount = ({ grossCents, vatCents }: DepositRateTotal['received'], taxed: boolean) => `${formatCents(grossCents)}${taxed ? ` (tax ${formatCents(vatCents)})` : ''}`;
  return totals
    .map((t) => {
      const taxed = t.tax !== '';
      return (
        `  ${taxAndRate(t.tax, t.ratePercent, taxReturnLine)}: received ${amount(t.received, taxed)}, released ${amount(t.released, taxed)}, ` +
        `of it refunded ${amount(t.refunded, taxed)}`
      );
    })
    .join('\n');
}
