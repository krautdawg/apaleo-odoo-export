import { REPORT_PROBLEM_HINT } from '../core/errors.js';
import type { Finding } from '../core/findings.js';
import { formatCents } from '../core/money.js';
import type { AccountRef, LedgerLine, LedgerTax } from '../core/source.js';
import { VAT_RELEVANT_TYPES, type MappingRow } from '../mapping/index.js';
import { accountText, lineFinding, percentText, rowText } from './describe.js';
import { depositDirection, inferredTaxCents, isUntaxedRelease, type ReleaseRate } from './release.js';
import { taxPercents, taxTotal } from './taxes.js';

/** One side of a ledger line with its mapping row. */
export interface PostedSide {
  ref: AccountRef;
  row: MappingRow;
  /** The row's Odoo tax; undefined without one. */
  tax: string | undefined;
  /** The VAT rate Odoo books on the row (`tax_percent`, 0 without tax). */
  rate: number;
  /** The row has an Odoo tax: this side is the VAT side, a base line with the tax. */
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
  /** apaleo's tax of the booking, unsigned: its tax rounded to cents, or the inferred tax of a deposit line. */
  taxCents: number;
  /** The tax differs by one cent from the VAT apaleo moved (a `PostPrepaymentVat` pair): the VAT check allows that cent. */
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
 * The VAT consistency guard (design decision 4). Odoo computes the tax itself
 * from the net base of the VAT side, so the guard checks that the VAT-side row
 * books apaleo's rate, that the tax has the sign of the gross amount, and that
 * an untaxed line carries no tax above 0 %. The tax of the booking is apaleo's
 * per-line tax rounded half away from zero; for an untaxed deposit line it comes
 * from the inferred rate (`PostPrepaymentVat` pair or chart). The cent
 * differences between Odoo's tax and apaleo's come only from Odoo's rounding
 * and are reported by the writer's base fitting.
 */
export function guardVat(input: GuardInput): GuardResult {
  const { line, taxes, release, vatSide } = input;
  const result: GuardResult = { findings: [], failed: false, taxCents: 0, apaleoRounding: false };
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
          `${release.rate === 0 ? ', so the booking carries no tax' : `, and computes the tax ${formatCents(result.taxCents)} from the gross amount`}. ` +
          'Have your Steuerberater check the deposit bookings',
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
      `it ${what}, but neither side has an Odoo tax (debit on ${rowText(input.debit.row)}, credit on ${rowText(input.credit.row)}), so Odoo computes no VAT. ` +
        `Change the row for ${sideText(fix)} to an Odoo account with the tax of ${percentText(expected)}`,
    );
  }
  if (!taxed && !release && vatSide.rate > 0) {
    return fail(
      'E-VAT-UNEXPECTED',
      `apaleo charged no VAT on it, but ${sideText(vatSide)} books ${percentText(vatSide.rate)} with the Odoo tax ${vatSide.tax}. ` +
        'Change that row to an Odoo account without tax, or check the VAT setting of the account in apaleo',
    );
  }
  if (vatSide.rate !== expected) {
    return fail(
      'E-VAT-RATE',
      `apaleo taxed it at ${percentText(expected)}${source}, but ${sideText(vatSide)} books ${percentText(vatSide.rate)}. ` +
        `Change that row to an Odoo account and tax for ${percentText(expected)} (a period taxed at other rates needs its own mapping)`,
    );
  }

  if (taxed) {
    const apaleoVat = taxTotal(taxes);
    if (apaleoVat !== 0 && Math.sign(apaleoVat) !== Math.sign(line.grossCents)) {
      return fail('E-VAT-SIGN', `the VAT ${formatCents(apaleoVat)} and the gross amount have opposite signs. ${REPORT_PROBLEM_HINT}`);
    }
    result.taxCents = Math.abs(apaleoVat);
  } else if (release) {
    result.taxCents = inferredTaxCents(line, release);
  }
  if (release?.kind === 'pair' && !checkPair(result, line, release)) return result;
  return inferred();
}

/**
 * The tax computed on all untaxed deposit lines of the day and reference
 * against the VAT apaleo moved on their `PostPrepaymentVat` lines. A difference
 * of one cent (rounding several lines) is accepted and counted on the first
 * line; a larger one fails the booking.
 */
function checkPair(result: GuardResult, line: LedgerLine, release: Extract<ReleaseRate, { kind: 'pair' }>): boolean {
  const difference = release.releaseVatCents - release.pairVatCents;
  if (difference === 0) return true;
  if (Math.abs(difference) === 1) {
    result.apaleoRounding = release.releaseEntries[0] === line.sourceEntryNumber;
    return true;
  }
  const entries = release.releaseEntries.length > 1 ? ` (together with ${release.releaseEntries.filter((e) => e !== line.sourceEntryNumber).join(', ')})` : '';
  const reversed = depositDirection(line) > 0;
  // `difference` is signed in the direction of the VAT movement; as magnitudes it is that direction times the difference.
  const magnitude = depositDirection(line) * difference;
  result.findings.push(
    lineFinding(
      'E-VAT-AMOUNT',
      line,
      `the tax contained in the deposit ${isUntaxedRelease(line) ? 'release' : 'line'}${entries} is ${formatCents(Math.abs(release.releaseVatCents))}, ` +
        `but apaleo ${reversed ? 'reversed' : 'booked'} ${formatCents(Math.abs(release.pairVatCents))} on the PostPrepaymentVat line ${release.pairEntries.join(', ')} ` +
        `(difference ${formatCents(magnitude)}). ${REPORT_PROBLEM_HINT}`,
    ),
  );
  result.failed = true;
  return false;
}

/** Where an inferred release rate comes from, for messages; empty for a taxed line. */
function rateSource(release: GuardInput['release']): string {
  if (release?.kind === 'pair') return ` (inferred from the PostPrepaymentVat line ${release.pairEntries.join(', ')})`;
  return release ? ` (inferred from the chart of accounts, account ${release.account})` : '';
}
