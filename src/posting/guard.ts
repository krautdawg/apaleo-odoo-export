import { REPORT_PROBLEM_HINT } from '../core/errors.js';
import type { Finding } from '../core/findings.js';
import { formatCents } from '../core/money.js';
import type { AccountRef, LedgerLine, LedgerTax } from '../core/source.js';
import { VAT_RELEVANT_TYPES, type MappingRow } from '../mapping/index.js';
import { accountText, lineFinding, percentText, rowText } from './describe.js';
import { depositDirection, inferredTaxCents, isUntaxedRelease, type ReleaseRate } from './release.js';
import { inclusiveCheckTax, taxPercents, taxTotal } from './taxes.js';

/** One side of a ledger line with its mapping row. */
export interface PostedSide {
  ref: AccountRef;
  row: MappingRow;
  /** The row's MWST-Code; undefined without one. */
  mwstCode: string | undefined;
  /** The MWST rate Abacus books on the row (`mwst_percent`, 0 without MWST-Code). */
  rate: number;
  /** The row has an MWST-Code: this side is the VAT side and goes into `SingleInformation`. */
  vat: boolean;
}

export interface GuardInput {
  line: LedgerLine;
  /** Normalised taxes with at most one percent. */
  taxes: readonly LedgerTax[];
  /** Set for an untaxed deposit line whose rate was inferred. */
  release: Extract<ReleaseRate, { kind: 'pair' | 'chart' }> | undefined;
  debit: PostedSide;
  credit: PostedSide;
  vatSide: PostedSide | undefined;
}

export interface GuardResult {
  findings: Finding[];
  /** True when a finding blocks the booking. */
  failed: boolean;
  /** The tax the booking carries, unsigned: apaleo's tax rounded to Rappen, or the inferred tax of a deposit line. */
  steuerCents: number;
  /** Abacus' check value minus the booked tax, signed like the line, when it is a one-Rappen rounding difference. */
  roundingCents: number;
  /** The booked tax differs by one cent from the VAT apaleo moved (a `PostPrepaymentVat` pair): the VAT check allows that cent. */
  apaleoRounding: boolean;
}

/** The side to name in a fix: the VAT-relevant one (revenue, deposit, levy), else the credit side. */
function sideToFix({ debit, credit }: Pick<GuardInput, 'debit' | 'credit'>): PostedSide {
  return VAT_RELEVANT_TYPES.has(debit.ref.type) && !VAT_RELEVANT_TYPES.has(credit.ref.type) ? debit : credit;
}

function sideText(side: PostedSide): string {
  return `${accountText(side.ref)} on ${rowText(side.row)}`;
}

/**
 * The VAT consistency guard (design decision 6). Abacus receives the tax
 * explicitly with an inclusive gross amount, so the guard checks that the
 * VAT-side row books apaleo's rate, that the tax has the sign of the gross
 * amount, and that Abacus' own check value of the booking
 * (`round(|gross| × rate / (100 + rate))`) is within one Rappen of the tax.
 * The tax is apaleo's per-line tax rounded half away from zero; for an untaxed
 * deposit line it comes from the inferred rate (`PostPrepaymentVat` pair or
 * chart). Sub-Rappen digits of apaleo's tax never cause a finding, and nothing
 * is rounded to 5 Rappen.
 */
export function guardVat(input: GuardInput): GuardResult {
  const { line, taxes, release, vatSide } = input;
  const result: GuardResult = { findings: [], failed: false, steuerCents: 0, roundingCents: 0, apaleoRounding: false };
  const fail = (code: string, message: string) => {
    result.findings.push(lineFinding(code, line, message));
    result.failed = true;
    return result;
  };
  const taxed = taxes.length > 0;
  const expected = taxed ? (taxPercents(taxes)[0] as number) : (release?.rate ?? 0);
  const source = rateSource(release);
  // A chart rate is never checked against an amount, 0 % included: always warn when the line is booked.
  const inferred = () => {
    if (release?.kind !== 'chart') return result;
    result.findings.push(
      lineFinding(
        'W-VAT-INFERRED',
        line,
        `it settles a deposit without a VAT amount; the tool books it at ${percentText(release.rate)}, the VAT rate of account ` +
          `${release.account} in the apaleo chart of accounts, with no PostPrepaymentVat line to check the amount against` +
          `${release.rate === 0 ? ', so the booking carries no tax' : `, and computes the tax ${formatCents(result.steuerCents)} from the gross amount`}. ` +
          'Have your Treuhänder check the deposit bookings',
      ),
    );
    return result;
  };

  if (!vatSide) {
    if (!taxed && expected === 0) return inferred();
    const fix = sideToFix(input);
    const what = taxed
      ? `carries ${formatCents(taxTotal(taxes))} VAT at ${percentText(expected)}`
      : `${isUntaxedRelease(line) ? 'settles' : 'books'} a deposit taxed at ${percentText(expected)}${source}`;
    return fail(
      'E-VAT-MISSING',
      `it ${what}, but neither side has an MWST-Code (debit on ${rowText(input.debit.row)}, credit on ${rowText(input.credit.row)}), so Abacus books no MWST. ` +
        `Change the row for ${sideText(fix)} to an Abacus account with the MWST-Code and ${percentText(expected)}`,
    );
  }
  if (!taxed && !release && vatSide.rate > 0) {
    return fail(
      'E-VAT-UNEXPECTED',
      `apaleo charged no VAT on it, but ${sideText(vatSide)} books ${percentText(vatSide.rate)} with the MWST-Code ${vatSide.mwstCode}. ` +
        'Change that row to an Abacus account without MWST, or check the VAT setting of the account in apaleo',
    );
  }
  if (vatSide.rate !== expected) {
    return fail(
      'E-VAT-RATE',
      `apaleo taxed it at ${percentText(expected)}${source}, but ${sideText(vatSide)} books ${percentText(vatSide.rate)}. ` +
        `Change that row to an Abacus account and MWST-Code for ${percentText(expected)} (a period taxed at other rates needs its own mapping)`,
    );
  }

  if (taxed) {
    const apaleoVat = taxTotal(taxes);
    if (apaleoVat !== 0 && Math.sign(apaleoVat) !== Math.sign(line.grossCents)) {
      return fail('E-VAT-SIGN', `the VAT ${formatCents(apaleoVat)} and the gross amount have opposite signs. ${REPORT_PROBLEM_HINT}`);
    }
    result.steuerCents = Math.abs(apaleoVat);
  } else if (release) {
    result.steuerCents = inferredTaxCents(line, release);
  }
  if (release?.kind === 'pair' && !checkPair(result, line, release)) return result;
  if (result.findings.length === 0 && expected > 0) checkInclusiveRounding(result, line, expected);
  return result.failed ? result : inferred();
}

/**
 * The tax computed on all untaxed deposit lines of the day and reference
 * against the VAT apaleo moved on their `PostPrepaymentVat` lines; the rounding
 * difference is counted on the first line only. False when the booking fails.
 */
function checkPair(result: GuardResult, line: LedgerLine, release: Extract<ReleaseRate, { kind: 'pair' }>): boolean {
  const first = release.releaseEntries[0] === line.sourceEntryNumber;
  const difference = release.releaseVatCents - release.pairVatCents;
  if (difference === 0 || (Math.abs(difference) <= 1 && !first)) return true;
  const entries = release.releaseEntries.length > 1 ? ` (together with ${release.releaseEntries.filter((e) => e !== line.sourceEntryNumber).join(', ')})` : '';
  const reversed = depositDirection(line) > 0;
  const describe =
    `the tax contained in the deposit ${isUntaxedRelease(line) ? 'release' : 'line'}${entries} is ${formatCents(Math.abs(release.releaseVatCents))}, ` +
    `but apaleo ${reversed ? 'reversed' : 'booked'} ${formatCents(Math.abs(release.pairVatCents))} on the PostPrepaymentVat line ${release.pairEntries.join(', ')}`;
  // `difference` is signed in the direction of the VAT movement; as magnitudes it is that direction times the difference.
  const magnitude = depositDirection(line) * difference;
  if (Math.abs(magnitude) === 1) {
    result.apaleoRounding = true;
    result.roundingCents += Math.sign(line.grossCents) * magnitude;
    result.findings.push(lineFinding('W-VAT-ROUNDING', line, `${describe}: a rounding difference of 0.01, added to the rounding total of the summary`));
    return true;
  }
  result.findings.push(lineFinding('E-VAT-AMOUNT', line, `${describe} (difference ${formatCents(magnitude)}). ${REPORT_PROBLEM_HINT}`));
  result.failed = true;
  return false;
}

/** Abacus' check value of an inclusive booking, `round(|gross| × rate / (100 + rate))`, against the tax it carries. */
function checkInclusiveRounding(result: GuardResult, line: LedgerLine, rate: number): void {
  const gross = Math.abs(line.grossCents);
  const check = inclusiveCheckTax(gross, rate);
  const difference = check - result.steuerCents;
  if (difference === 0) return;
  const describe =
    `Abacus checks the MWST as ${percentText(rate)} contained in the gross amount ${formatCents(gross)}, which is ${formatCents(check)}, ` +
    `but the booking carries apaleo's tax ${formatCents(result.steuerCents)}`;
  if (Math.abs(difference) === 1) {
    result.roundingCents += Math.sign(line.grossCents) * difference;
    result.findings.push(
      lineFinding('W-VAT-ROUNDING', line, `${describe}: a rounding difference of 0.01. The booking keeps apaleo's tax; the difference is added to the rounding total of the summary`),
    );
    return;
  }
  result.findings.push(lineFinding('E-VAT-AMOUNT', line, `${describe} (difference ${formatCents(difference)}). ${REPORT_PROBLEM_HINT}`));
  result.failed = true;
}

/** Where an inferred release rate comes from, for messages; empty for a taxed line. */
function rateSource(release: GuardInput['release']): string {
  if (release?.kind === 'pair') return ` (inferred from the PostPrepaymentVat line ${release.pairEntries.join(', ')})`;
  return release ? ` (inferred from the chart of accounts, account ${release.account})` : '';
}
