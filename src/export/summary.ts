import { formatFinding, type Finding } from '../core/findings.js';
import { decimalToCents, formatCents } from '../core/money.js';
import type { LevyTotal, PostingSummary, SkipReason, VatTotal } from '../posting/index.js';
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
  "Each booking carries apaleo's tax of its line, rounded to the cent, while apaleo rounds only the precise total of its lines per day, " +
  'so a difference (apaleo precise minus tax) of a few cents is this rounding, not an error. Odoo computes the VAT itself from the base of each line; ' +
  "the file fits each base to apaleo's gross, and the import block shows Odoo's VAT against apaleo's per tax.";

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
    'Totals per Odoo account (the side without tax with the gross amount, the side with the tax with the gross amount minus apaleo\'s tax):',
    formatTable([['account', 'Soll', 'Haben', 'balance'], ...accounts], [1, 2, 3], '  '),
  );

  section('Revenue and VAT per Odoo tax and rate, with the UStVA Kennzahl:', vatLines(summary.revenueByRate));
  section('Deposits and their VAT per Odoo tax and rate (received minus released):', vatLines(summary.depositVatByRate));
  section('Written-off receivables (Forderungsverluste) and the VAT correction per Odoo tax and rate:', vatLines(summary.writeOffsByRate));
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
  out.push(
    `Accounts receivable (Forderungen Firmenrechnungen, Soll positive): ${formatCents(summary.accountsReceivableCents)}`,
    '',
  );

  const skipped = summary.skipped.map((s) => [SKIP_LABELS[s.reason], String(s.lines), formatCents(s.grossCents)]);
  section('Skipped lines:', skipped.length === 0 ? '' : formatTable([['reason', 'lines', 'gross (unsigned)'], ...skipped], [1, 2], '  '));
  return out;
}

/**
 * `  1590 without tax: 12.60` or
 * `  8300 with tax_ust_7_skr03 7 % (Kz 86): gross 2.14, tax 0.14`, one line per account, tax and rate.
 */
function levyLines(levies: readonly LevyTotal[], taxReturnLine: TaxReturnLine): string[] {
  return levies.map((levy) =>
    levy.tax === ''
      ? `  ${levy.account} without tax: ${formatCents(levy.grossCents)}`
      : `  ${levy.account} with ${taxAndRate(levy.tax, levy.ratePercent, taxReturnLine)}: gross ${formatCents(levy.grossCents)}, tax ${formatCents(levy.vatCents)}`,
  );
}

/**
 * `tax_ust_7_skr03 7 % (Kz 86): net 112.15, tax 7.85, gross 120.00, apaleo VAT 7.85, difference 0.00 (apaleo precise 7.85046729)`,
 * one line per Odoo tax and rate; bookings without a tax as `no tax 0 %`. The tax is apaleo's per line, rounded to cents.
 */
function vatTotalLines(totals: readonly VatTotal[], taxReturnLine: TaxReturnLine): string {
  return totals
    .map((t) => {
      const apaleo = decimalToCents(t.apaleoVat);
      return (
        `  ${taxAndRate(t.tax, t.ratePercent, taxReturnLine)}: net ${formatCents(t.netCents)}, tax ${formatCents(t.vatCents)}, gross ${formatCents(t.grossCents)}, ` +
        `apaleo VAT ${formatCents(apaleo)}, difference ${formatCents(apaleo - t.vatCents)} (apaleo precise ${t.apaleoVat})`
      );
    })
    .join('\n');
}
