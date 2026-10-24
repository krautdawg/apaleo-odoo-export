import type { ChartIndex } from '../core/chart.js';
import { REPORT_PROBLEM_HINT } from '../core/errors.js';
import type { Finding } from '../core/findings.js';
import type { AccountRef, LedgerLine } from '../core/source.js';
import { KOST_TYPES, NO_TAX_TYPES, VAT_ACCOUNT_TYPES, checkCoverage, mwstCodeOf, resolve, rowRate, type Mapping, type MappingRow } from '../mapping/index.js';
import { apaleoVatOf, type ApaleoVat } from './apaleo-vat.js';
import { accountText, lineFinding, percentText, rowText } from './describe.js';
import { kostOf, text1, text2 } from './fields.js';
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
      roundingCents: number;
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
 * Turns ledger lines into Abacus Einzelbuchungen, one booking per line (no Sammelbuchung).
 * Pure and deterministic: the same lines and mapping always give the same result.
 * Every line is either booked, listed in `skipped` with its reason, or named in
 * an `E-` finding that blocks the export. Unmapped accounts are reported once
 * per account (`E-UNMAPPED`, as in `mapping check --from --to`).
 */
export function buildBookings(lines: readonly LedgerLine[], mapping: Mapping, chart: ChartIndex, options: PostingOptions): PostingResult {
  const releases = inferReleaseRates(lines, chart);
  const context: PostingContext = { mapping, chart, options, releases };
  const rateOf = (line: LedgerLine) => resolutionRate(line, releases);
  const findings: Finding[] = checkCoverage(mapping, lines, chart, { rateOf, mwstCodes: options.mwstCodes }).filter(
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
      summary.addBooking(line, outcome.booking, outcome.debit, outcome.credit, outcome.roundingCents, outcome.apaleoVat);
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
      `it carries more than one VAT rate (${percents.map(percentText).join(', ')}), but an Abacus booking has one. ${REPORT_PROBLEM_HINT}`,
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
  if (debitRow.abacusAccount === creditRow.abacusAccount) return { kind: 'skip', reason: 'SAME_ACCOUNT' };

  const d = postedSide(line.debit, debitRow);
  const c = postedSide(line.credit, creditRow);
  for (const side of [d, c]) {
    if (side.kind === 'no-rate') {
      return fail(
        'E-VAT-RATE-MISSING',
        `${rowText(side.row)} has the MWST-Code "${side.row.mwstCode}" but no valid mwst_percent ("${side.row.mwstPercent}"), so the rate Abacus books is unknown. ` +
          'Fill in mwst_percent on that line, and run "apaleo-abacus mapping check"',
      );
    }
    if (side.kind === 'no-tax-type') {
      return fail(
        'E-MWST-CODE-NOT-ALLOWED',
        `${accountText(side.ref)} uses ${rowText(side.row)}, which has the MWST-Code ${side.row.mwstCode}, but a ${side.ref.type} account books no MWST: ` +
          'Abacus would book the MWST on it instead of the revenue or deposit account. Leave mwst_code and mwst_percent empty on that line, ' +
          'put the MWST-Code on the revenue or deposit row, and run "apaleo-abacus mapping check"',
      );
    }
  }
  if (d.kind !== 'ok' || c.kind !== 'ok') return { kind: 'failed', findings: [] };
  if (d.vat && c.vat) {
    return fail(
      'E-TWO-VAT-SIDES',
      `both accounts have an MWST-Code (debit ${d.ref.number} on ${rowText(d.row)}, credit ${c.ref.number} on ${rowText(c.row)}), ` +
        'but an Abacus booking carries the MWST on its Single account only. Ask your Treuhänder how to book such moves, for example through a transfer account',
    );
  }
  const vatSide = d.vat ? d : c.vat ? c : undefined;
  const guard = guardVat({ line, taxes, release, debit: d, credit: c, vatSide });
  if (guard.failed) return { kind: 'failed', findings: guard.findings };
  return {
    kind: 'booked',
    booking: toBooking(line, d, c, vatSide, guard.steuerCents, context),
    debit: d,
    credit: c,
    findings: guard.findings,
    roundingCents: guard.roundingCents,
    apaleoRounding: guard.apaleoRounding,
    rate: vatSide?.rate ?? 0,
    apaleoVat: apaleoVatOf(line, release),
  };
}

/** The row for one side, or undefined when it is missing or has no Abacus account (reported as `E-UNMAPPED`). */
function mappedRow(account: AccountRef, rate: number | undefined, { mapping, chart }: PostingContext): MappingRow | undefined {
  const row = resolve(mapping, account, { rate, chart });
  return row && row.abacusAccount !== '' ? row : undefined;
}

type SideOutcome = ({ kind: 'ok' } & PostedSide) | { kind: 'no-rate' | 'no-tax-type'; ref: AccountRef; row: MappingRow };

/**
 * The side with its MWST-Code and rate; `no-rate` when an MWST-Code has no known
 * rate, `no-tax-type` when a payment, guest claim or Debitor row has an MWST-Code.
 */
function postedSide(ref: AccountRef, row: MappingRow): SideOutcome {
  const code = mwstCodeOf(row);
  if (code !== undefined && (NO_TAX_TYPES.has(row.apaleoType) || NO_TAX_TYPES.has(ref.type))) return { kind: 'no-tax-type', ref, row };
  const rate = rowRate(row);
  if (rate === undefined) return { kind: 'no-rate', ref, row };
  return { kind: 'ok', ref, row, mwstCode: code, rate, vat: code !== undefined };
}

/**
 * Side rule (design decision 5): the VAT side is always the Single account,
 * because only `SingleInformation` carries `TaxData`, and `DebitCredit` is the
 * side of the Collective account (`D` when the line debits it; a negative gross
 * swaps the sides). Without a VAT side, a revenue or write-off side (the one whose
 * Kostenstelle Abacus accepts) is the Single account, so an untaxed charge keeps
 * its Kostenstelle like its allowance does. Otherwise the debited account is the
 * Collective account with `D`. The amount is the absolute gross; the tax is
 * apaleo's tax rounded to Rappen, negative when the VAT side is credited.
 */
function toBooking(
  line: LedgerLine,
  debit: PostedSide,
  credit: PostedSide,
  vatSide: PostedSide | undefined,
  steuerCents: number,
  { chart, options }: PostingContext,
): PostedBooking {
  const negative = line.grossCents < 0;
  // The account the line really debits, and the one it credits, after a negative gross swaps them.
  const [debited, credited] = negative ? [credit, debit] : [debit, credit];
  const single = vatSide ?? kostSide(debit, credit) ?? credited;
  const collective = single === debit ? credit : debit;
  const debitCredit = collective === debited ? 'D' : 'C';
  const labelled = vatSide ?? credit;
  const kost = kostOf(single.row);
  const text = text1(line, labelled.ref, chart, vatSide?.rate ?? 0);
  const reference = text2(line, options.text2);
  const taxCents = steuerCents === 0 ? 0 : debitCredit === 'D' ? -steuerCents : steuerCents;
  return {
    collectiveAccount: collective.row.abacusAccount,
    singleAccount: single.row.abacusAccount,
    debitCredit,
    businessDate: line.businessDate,
    grossCents: Math.abs(line.grossCents),
    ...(vatSide ? { tax: { mwstCode: vatSide.mwstCode ?? '', percent: vatSide.rate, taxCents } } : {}),
    ...(kost === undefined ? {} : { kost }),
    text1: text,
    ...(reference === '' ? {} : { text2: reference }),
    sourceEntryNumbers: [line.sourceEntryNumber],
  };
}

/** The one side whose row type takes a Kostenstelle (revenue, write-off), or undefined when none or both do. */
function kostSide(debit: PostedSide, credit: PostedSide): PostedSide | undefined {
  const d = KOST_TYPES.has(debit.row.apaleoType);
  const c = KOST_TYPES.has(credit.row.apaleoType);
  return d === c ? undefined : d ? debit : credit;
}
