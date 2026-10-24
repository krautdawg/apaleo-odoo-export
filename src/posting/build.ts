import type { ChartIndex } from '../core/chart.js';
import { REPORT_PROBLEM_HINT } from '../core/errors.js';
import type { Finding } from '../core/findings.js';
import type { AccountRef, LedgerLine } from '../core/source.js';
import { NO_TAX_TYPES, VAT_ACCOUNT_TYPES, checkCoverage, resolve, rowRate, taxOf, type Mapping, type MappingRow } from '../mapping/index.js';
import type { Side } from '../odoo/types.js';
import { apaleoVatOf, type ApaleoVat } from './apaleo-vat.js';
import { accountText, lineFinding, percentText, receiptOf, rowText, sideLabel } from './describe.js';
import { guardVat, type PostedSide } from './guard.js';
import { inferReleaseRates, isUntaxedRelease, resolutionRate, type ReleaseRate } from './release.js';
import { SummaryBuilder } from './summary.js';
import { normaliseTaxes, taxPercents } from './taxes.js';
import type { PostedBooking, PostingOptions, PostingResult, SkipReason, SkippedLine } from './types.js';

type LineOutcome =
  | { kind: 'skip'; reason: SkipReason }
  | { kind: 'unmapped' }
  | { kind: 'failed'; findings: Finding[] }
  | {
      kind: 'booked';
      booking: PostedBooking;
      debit: PostedSide;
      credit: PostedSide;
      findings: Finding[];
      /** The booked tax differs by one cent from the VAT apaleo moved for the line. */
      apaleoRounding: boolean;
      /** The VAT rate of the booking (0 without tax). */
      rate: number;
      apaleoVat: ApaleoVat[];
    };

interface PostingContext {
  mapping: Mapping;
  chart: ChartIndex;
  options: PostingOptions;
  releases: ReadonlyMap<LedgerLine, ReleaseRate>;
}

/**
 * Turns ledger lines into Odoo bookings, one booking per line; the Odoo writer
 * nets the bookings of a day into one journal entry. Pure and deterministic:
 * the same lines and mapping always give the same result.
 * Every line is either booked, listed in `skipped` with its reason, or named in
 * an `E-` finding that blocks the export. Unmapped accounts are reported once
 * per account (`E-UNMAPPED`, as in `mapping check --from --to`).
 */
export function buildBookings(lines: readonly LedgerLine[], mapping: Mapping, chart: ChartIndex, options: PostingOptions): PostingResult {
  const releases = inferReleaseRates(lines, chart);
  const context: PostingContext = { mapping, chart, options, releases };
  const rateOf = (line: LedgerLine) => resolutionRate(line, releases);
  const findings: Finding[] = checkCoverage(mapping, lines, chart, { rateOf, version: options.version }).filter(
    (finding) => finding.code === 'E-UNMAPPED',
  );
  const bookings: PostedBooking[] = [];
  const skipped: SkippedLine[] = [];
  const summary = new SummaryBuilder();
  const vatRoundingByRate = new Map<number, number>();

  for (const line of lines) {
    const outcome = postLine(line, context);
    if (outcome.kind === 'skip') {
      skipped.push({ reason: outcome.reason, line });
      summary.addSkipped(outcome.reason, line);
    } else if (outcome.kind === 'failed') {
      findings.push(...outcome.findings);
    } else if (outcome.kind === 'booked') {
      bookings.push(outcome.booking);
      findings.push(...outcome.findings);
      summary.addBooking(line, outcome.booking, outcome.debit, outcome.credit, outcome.apaleoVat);
      if (outcome.apaleoRounding) vatRoundingByRate.set(outcome.rate, (vatRoundingByRate.get(outcome.rate) ?? 0) + 1);
    }
  }
  return { bookings, skipped, findings, summary: summary.build(findings), vatRoundingByRate };
}

function postLine(line: LedgerLine, context: PostingContext): LineOutcome {
  const fail = (code: string, message: string): LineOutcome => ({ kind: 'failed', findings: [lineFinding(code, line, message)] });
  if (VAT_ACCOUNT_TYPES.has(line.debit.type) || VAT_ACCOUNT_TYPES.has(line.credit.type)) {
    return { kind: 'skip', reason: 'VAT_ACCOUNT_LINE' };
  }
  if (line.grossCents === 0) return { kind: 'skip', reason: 'ZERO_AMOUNT' };

  const taxes = normaliseTaxes(line.taxes);
  const percents = taxPercents(taxes);
  if (percents.length > 1) {
    return fail(
      'E-VAT-MIXED',
      `it carries more than one VAT rate (${percents.map(percentText).join(', ')}), but an Odoo base line has one tax. ${REPORT_PROBLEM_HINT}`,
    );
  }
  const release = context.releases.get(line);
  if (release?.kind === 'unknown') {
    return fail(
      'E-VAT-RATE-UNKNOWN',
      `it ${isUntaxedRelease(line) ? 'settles' : 'books'} a guest's deposit without a VAT amount, and its VAT rate cannot be found: ${release.reason}. ` +
        `The export stops rather than book the deposit without VAT. ${REPORT_PROBLEM_HINT}`,
    );
  }

  const rate = resolutionRate(line, context.releases);
  const debitRow = mappedRow(line.debit, rate, context);
  const creditRow = mappedRow(line.credit, rate, context);
  // checkCoverage resolves with the same rate and reports the account once as E-UNMAPPED.
  if (!debitRow || !creditRow) return { kind: 'unmapped' };
  if (debitRow.odooAccount === creditRow.odooAccount) return { kind: 'skip', reason: 'SAME_ACCOUNT' };

  const d = postedSide(line.debit, debitRow);
  const c = postedSide(line.credit, creditRow);
  for (const side of [d, c]) {
    if (side.kind === 'no-tax-type') {
      return fail(
        'E-TAX-NOT-ALLOWED',
        `${accountText(side.ref)} uses ${rowText(side.row)}, which has the Odoo tax ${side.row.odooTax}, but a ${side.ref.type} account carries no VAT: ` +
          'Odoo would compute VAT on the money or the claim. Leave odoo_tax and tax_percent empty on that line, ' +
          'put the tax on the revenue or deposit row, and run "apaleo-odoo mapping check"',
      );
    }
    if (side.kind === 'no-rate') {
      return fail(
        'E-VAT-RATE-MISSING',
        `${rowText(side.row)} has the Odoo tax "${side.row.odooTax}" but no valid tax_percent ("${side.row.taxPercent}"), so the rate Odoo books is unknown. ` +
          'Fill in tax_percent on that line, and run "apaleo-odoo mapping check"',
      );
    }
  }
  if (d.kind !== 'ok' || c.kind !== 'ok') return { kind: 'failed', findings: [] };
  if (d.vat && c.vat) {
    return fail(
      'E-TWO-VAT-SIDES',
      `both accounts have an Odoo tax (debit ${d.ref.number} on ${rowText(d.row)}, credit ${c.ref.number} on ${rowText(c.row)}), ` +
        'but an Odoo booking carries the tax on one side only. Ask your Steuerberater how to book such moves, for example through a transfer account',
    );
  }
  const vatSide = d.vat ? d : c.vat ? c : undefined;
  const guard = guardVat({ line, taxes, release, debit: d, credit: c, vatSide });
  if (guard.failed) return { kind: 'failed', findings: guard.findings };
  return {
    kind: 'booked',
    booking: toBooking(line, d, c, vatSide, guard.taxCents, context),
    debit: d,
    credit: c,
    findings: guard.findings,
    apaleoRounding: guard.apaleoRounding,
    rate: vatSide?.rate ?? 0,
    apaleoVat: apaleoVatOf(line, release),
  };
}

/** The row for one side, or undefined when it is missing or has no Odoo account (reported as `E-UNMAPPED`). */
function mappedRow(account: AccountRef, rate: number | undefined, { mapping, chart }: PostingContext): MappingRow | undefined {
  const row = resolve(mapping, account, { rate, chart });
  return row && row.odooAccount !== '' ? row : undefined;
}

type SideOutcome = ({ kind: 'ok' } & PostedSide) | { kind: 'no-rate' | 'no-tax-type'; ref: AccountRef; row: MappingRow };

/**
 * The side with its Odoo tax and rate; `no-tax-type` when a payment, guest claim
 * or company-invoice row has a tax, `no-rate` when a tax has no known rate.
 */
function postedSide(ref: AccountRef, row: MappingRow): SideOutcome {
  const tax = taxOf(row);
  if (tax !== undefined && (NO_TAX_TYPES.has(row.apaleoType) || NO_TAX_TYPES.has(ref.type))) return { kind: 'no-tax-type', ref, row };
  const rate = rowRate(row);
  if (rate === undefined) return { kind: 'no-rate', ref, row };
  return { kind: 'ok', ref, row, tax, rate, vat: tax !== undefined };
}

/**
 * The booking of a line (design decision 4): the line's debit and credit
 * accounts, swapped for a negative gross, with the absolute gross. The side whose
 * row has an Odoo tax is the VAT side; it carries the tax, the row's rate and
 * apaleo's tax rounded half away from zero to cents (unsigned). Each side gets
 * the label of its account and the booking's rate, never a guest name.
 */
function toBooking(line: LedgerLine, debit: PostedSide, credit: PostedSide, vatSide: PostedSide | undefined, taxCents: number, { chart, options }: PostingContext): PostedBooking {
  const negative = line.grossCents < 0;
  // The account the line really debits, and the one it credits, after a negative gross swaps them.
  const [debited, credited] = negative ? [credit, debit] : [debit, credit];
  const rate = vatSide?.rate ?? 0;
  const side = (posted: PostedSide) => ({ account: posted.row.odooAccount, label: sideLabel(posted.ref, chart, rate) });
  const vatSideName: Side | undefined = vatSide === undefined ? undefined : vatSide === debited ? 'debit' : 'credit';
  const receipt = receiptOf(line, options.text2);
  return {
    businessDate: line.businessDate,
    debit: side(debited),
    credit: side(credited),
    grossCents: Math.abs(line.grossCents),
    ...(vatSide && vatSideName && { vat: { side: vatSideName, taxRef: vatSide.tax ?? '', percent: vatSide.rate, apaleoTaxCents: taxCents } }),
    sourceEntryNumbers: [line.sourceEntryNumber],
    ...(receipt !== '' && { receipt }),
  };
}
