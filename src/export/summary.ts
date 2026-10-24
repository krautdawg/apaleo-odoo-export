import { formatFinding, type Finding } from '../core/findings.js';
import { decimalToCents, formatCents } from '../core/money.js';
import type { LevyTotal, PostingSummary, SkipReason, VatTotal } from '../posting/index.js';
import { formatTable } from '../cli/table.js';
import type { PeriodPart } from './period.js';

const SKIP_LABELS: Readonly<Record<SkipReason, string>> = {
  VAT_ACCOUNT_LINE: 'apaleo VAT account line (Abacus books the MWST from TaxData)',
  ZERO_AMOUNT: 'amount 0.00',
  SAME_ACCOUNT: 'both sides on the same Abacus account',
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
  /** The line of the tax return for a rate (`TargetWriter.taxReturnLine`), for example `Ziffer 343`. */
  taxReturnLine?: TaxReturnLine;
  findings: readonly Finding[];
}

type TaxReturnLine = (ratePercent: number) => string | undefined;

/** `313 3.8 % (Ziffer 343)`, `V10 10 %` for a rate without a line of the tax return, `no MWST-Code 0 %` without code. */
function codeAndRate(mwstCode: string, ratePercent: number, taxReturnLine: TaxReturnLine): string {
  const line = mwstCode === '' ? undefined : taxReturnLine(ratePercent);
  return `${mwstCode || 'no MWST-Code'} ${ratePercent} %${line ? ` (${line})` : ''}`;
}

/** Why the tax of the bookings and apaleo's VAT differ by a few Rappen, for the Treuhänder. */
export const VAT_ROUNDING_NOTE =
  "Each booking carries apaleo's tax of its line, rounded to the Rappen, while apaleo rounds only the precise total of its lines per day, " +
  "so a difference (apaleo VAT minus tax) of a few Rappen is this rounding, not an error.";

/**
 * The posting summary as aligned text, for the dry run and the protocol file:
 * the import block, totals per Abacus account, revenue, deposit and write-off VAT
 * per MWST-Code and rate (bookings against apaleo, with the Ziffer of the
 * MWST-Abrechnung for a Swiss rate), Kurtaxe and other levies per account, payments per
 * clearing account, deposits received, released and refunded, accounts
 * receivable, skipped lines and every finding. It renders the totals of the
 * posting run (`PostingSummary`) and computes none of its own.
 */
export function renderSummary({ propertyId, part, ledgerLines, bookings, summary, importBlock, taxReturnLine, findings }: SummaryInput): string {
  const out: string[] = [`Property ${propertyId}, ${part.from} to ${part.to}: ${ledgerLines} apaleo lines, ${bookings} Abacus bookings`, ''];
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
    'Totals per Abacus account (Collective account with the gross amount, Single account with the gross amount minus the MWST):',
    formatTable([['account', 'Soll', 'Haben', 'balance'], ...accounts], [1, 2, 3], '  '),
  );

  section('Revenue and MWST per MWST-Code and rate, with the Ziffer of the MWST-Abrechnung for each Swiss rate:', vatLines(summary.revenueByRate));
  section('Deposits and their MWST per MWST-Code and rate (received minus released):', vatLines(summary.depositVatByRate));
  section('Written-off receivables (Debitorenverluste) and the MWST correction per MWST-Code and rate:', vatLines(summary.writeOffsByRate));
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
    `Accounts receivable (Debitoren, Soll positive): ${formatCents(summary.accountsReceivableCents)}`,
    `VAT rounding differences: ${formatCents(summary.roundingCents)}`,
    '',
  );

  const skipped = summary.skipped.map((s) => [SKIP_LABELS[s.reason], String(s.lines), formatCents(s.grossCents)]);
  section('Skipped lines:', skipped.length === 0 ? '' : formatTable([['reason', 'lines', 'gross (unsigned)'], ...skipped], [1, 2], '  '));
  return out;
}

/**
 * `  2210 without MWST: 12.60` or
 * `  3400 with MWST-Code 313 3.8 % (Ziffer 343): gross 2.08, tax 0.08`, one line per account, code and rate.
 */
function levyLines(levies: readonly LevyTotal[], taxReturnLine: TaxReturnLine): string[] {
  return levies.map((levy) =>
    levy.mwstCode === ''
      ? `  ${levy.account} without MWST: ${formatCents(levy.grossCents)}`
      : `  ${levy.account} with MWST-Code ${codeAndRate(levy.mwstCode, levy.ratePercent, taxReturnLine)}: gross ${formatCents(levy.grossCents)}, tax ${formatCents(levy.vatCents)}`,
  );
}

/**
 * `V10 10 %: net 77.46, tax 7.74, gross 85.20, apaleo VAT 7.75, difference 0.01 (apaleo precise 7.74545454)`,
 * or `313 3.8 % (Ziffer 343): …` for a Swiss rate, one line per MWST-Code and rate; bookings without MWST-Code as `no MWST-Code 0 %`.
 */
function vatTotalLines(totals: readonly VatTotal[], taxReturnLine: TaxReturnLine): string {
  return totals
    .map((t) => {
      const apaleo = decimalToCents(t.apaleoVat);
      return (
        `  ${codeAndRate(t.mwstCode, t.ratePercent, taxReturnLine)}: net ${formatCents(t.netCents)}, tax ${formatCents(t.vatCents)}, gross ${formatCents(t.grossCents)}, ` +
        `apaleo VAT ${formatCents(apaleo)}, difference ${formatCents(apaleo - t.vatCents)} (apaleo precise ${t.apaleoVat})`
      );
    })
    .join('\n');
}
