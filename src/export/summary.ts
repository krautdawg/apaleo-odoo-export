import { formatFinding, type Finding } from '../core/findings.js';
import { decimalToCents, formatCents, negateDecimal, sumDecimals } from '../core/money.js';
import type { DepositRateTotal, LevyTotal, PostingSummary, SkipReason, VatTotal } from '../posting/index.js';
import { formatTable } from '../cli/table.js';
import type { PeriodPart } from './period.js';
import type { TargetFileFigures, TargetVatTotal } from './target.js';

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
  /** What the rendered file holds (`TargetWriter.fileFigures`): the target's VAT per tax and its counts. */
  figures?: TargetFileFigures;
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

/** Why Odoo's VAT per tax can differ from apaleo's by a cent, for the Steuerberater (design decision 1). */
export const ODOO_VAT_NOTE =
  "Odoo computes the VAT itself from the base of each line; the file fits each base to the cent so that base plus Odoo's VAT equals apaleo's gross, " +
  "so Odoo's VAT can differ from apaleo's tax per line by a cent per tax and day (the days are listed). Compare these lines with the tax lines per rate in Odoo after the import.";

/** Why the tax per line and apaleo's precise VAT differ by a few cents, and where Odoo's own VAT is, for the Steuerberater. */
export const VAT_ROUNDING_NOTE =
  "The revenue, deposit and write-off sections show apaleo's figures before the base fitting: net is the gross minus apaleo's tax of each line " +
  "rounded to the cent (apaleo per line), and apaleo precise is apaleo's exact tax summed and rounded once, so a difference (per line minus precise) " +
  "of a few cents is this rounding, not an error. Odoo's VAT per tax, from the bases the file fits to apaleo's gross, is in the first section " +
  'and in the import block (difference Odoo minus apaleo): compare those with Odoo.';

/**
 * The posting summary as aligned text, for the dry run and the protocol file
 * (export-run, "Dry run"), in the order of the check after the import (design
 * decision 1): the target's VAT per tax and rate with the UStVA Kennzahl
 * against apaleo's and the days with a difference, revenue and deposit VAT per
 * tax and rate as apaleo charged it, totals per account, Kurtaxe and other
 * levies, payments per clearing account, deposits received, released and
 * refunded, accounts receivable, write-offs per rate, the counts of the file,
 * skipped lines, every finding, and last the target's import block. It renders
 * the totals of the posting run (`PostingSummary`) and of the target
 * (`TargetFileFigures`) and computes none of its own.
 */
export function renderSummary({ propertyId, part, ledgerLines, bookings, summary, importBlock, figures, taxReturnLine, findings }: SummaryInput): string {
  const lineOf = taxReturnLine ?? (() => undefined);
  const out: string[] = [`Property ${propertyId}, ${part.from} to ${part.to}: ${ledgerLines} apaleo lines, ${bookings} Odoo bookings`, ''];
  if (summary && figures) out.push(...targetVatSection(figures.vatByTax, summary, lineOf));
  if (summary) out.push(...postingSection(summary, lineOf, figures));
  out.push('Findings:');
  out.push(...(findings.length === 0 ? ['  none'] : findings.map((finding) => `  ${formatFinding(finding)}`)), '');
  if (importBlock) out.push(...importBlock, '');
  return out.join('\n');
}

/**
 * `  tax_ust_7_skr03 7 % (Kz 86): net 1074.62, Odoo VAT 75.23, apaleo per line 75.22, apaleo precise 75.23 (75.23084112), difference (Odoo minus apaleo) 0.01`
 * per tax of the file, each followed by the days on which Odoo's VAT and apaleo's differ, then `ODOO_VAT_NOTE`.
 * apaleo's precise VAT owed is that of the revenue, deposits and levies with the same tax minus that of the write-offs.
 */
function targetVatSection(totals: readonly TargetVatTotal[], summary: PostingSummary, taxReturnLine: TaxReturnLine): string[] {
  const precise = (total: TargetVatTotal) => {
    const of = (rows: readonly VatTotal[]) => rows.filter((row) => row.ratePercent === total.ratePercent && total.bookingTaxes.includes(row.tax)).map((row) => row.apaleoVat);
    const levies = summary.levies.filter((levy) => levy.ratePercent === total.ratePercent && total.bookingTaxes.includes(levy.tax)).map((levy) => levy.apaleoVat);
    return sumDecimals([...of(summary.revenueByRate), ...of(summary.depositVatByRate), ...levies, ...of(summary.writeOffsByRate).map(negateDecimal)]);
  };
  const lines = totals.flatMap((total) => {
    const exact = precise(total);
    return [
      `  ${taxAndRate(total.tax, total.ratePercent, taxReturnLine)}: net ${formatCents(total.baseCents)}, Odoo VAT ${formatCents(total.vatCents)}, ` +
        `apaleo per line ${formatCents(total.apaleoVatCents)}, apaleo precise ${formatCents(decimalToCents(exact))} (${exact}), ` +
        `difference (Odoo minus apaleo) ${formatCents(total.vatCents - total.apaleoVatCents)}`,
      ...total.days.map(
        (day) => `    ${day.date}: Odoo VAT ${formatCents(day.vatCents)}, apaleo per line ${formatCents(day.apaleoVatCents)}, difference ${formatCents(day.vatCents - day.apaleoVatCents)}`,
      ),
    ];
  });
  return [
    "Odoo's VAT per tax and rate, with the UStVA Kennzahl, as Odoo computes it from the file (revenue, deposits, levies and write-offs with the tax together; net is the base in the file), " +
      "against apaleo's VAT, with the days on which they differ:",
    ...(lines.length === 0 ? ['  none'] : lines),
    ODOO_VAT_NOTE,
    '',
  ];
}

function postingSection(summary: PostingSummary, taxReturnLine: TaxReturnLine, figures: TargetFileFigures | undefined): string[] {
  const vatLines = (totals: readonly VatTotal[]) => vatTotalLines(totals, taxReturnLine);
  const out: string[] = [];
  const section = (title: string, body: string) => out.push(title, body.trimEnd() || '  none', '');

  section("Revenue and apaleo's VAT per Odoo tax and rate, with the UStVA Kennzahl (before the base fitting):", vatLines(summary.revenueByRate));
  section("Deposits and apaleo's VAT per Odoo tax and rate (received minus released, before the base fitting):", vatLines(summary.depositVatByRate));
  out.push(VAT_ROUNDING_NOTE, '');

  const accounts = summary.accounts.map((a) => [a.account, formatCents(a.sollCents), formatCents(a.habenCents), formatCents(a.balanceCents)]);
  section(
    'Totals per Odoo account before the base fitting (the side without tax with the gross amount, the side with the tax with the gross amount ' +
      "minus apaleo's tax per line; the bases and rounding lines in the file can differ by a cent per tax, see the import block):",
    formatTable([['account', 'Soll', 'Haben', 'balance'], ...accounts], [1, 2, 3], '  '),
  );
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
  section(
    "Written-off receivables (Forderungsverluste) and apaleo's VAT correction per Odoo tax and rate, § 17 UStG: the write-off line is on the refund side and lowers the Kennzahl (before the base fitting):",
    vatTotalLines(summary.writeOffsByRate, taxReturnLine, 'lowers'),
  );
  if (figures) {
    out.push(`Entries in the file: ${figures.entries}, with ${figures.lines} lines, of them ${figures.roundingLines} rounding line${figures.roundingLines === 1 ? '' : 's'}`, '');
  }

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
