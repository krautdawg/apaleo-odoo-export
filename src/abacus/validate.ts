import { isLocalDate } from '../core/date.js';
import type { Finding } from '../core/findings.js';
import { formatAmount, formatRate, MAX_AMOUNT_CENTS, MAX_BOOKINGS_PER_FILE, MAX_INTEGER_DIGITS, taxSign } from './format.js';
import { labelOf } from './labels.js';
import { sanitiseText } from './sanitise.js';
import type { AbacusBooking, AbacusRenderOptions } from './types.js';

const ACCOUNT = /^\d{1,11}$/;
const KOST = /^\d{1,11}$/;
const MWST_CODE = /^[A-Za-z0-9]{1,3}$/;
const MAX_RATE = 99.99;
/**
 * How far apaleo's tax of one line may lie from the inclusive tax of its gross
 * amount: one Rappen, the rounding difference the posting rules report as
 * `W-VAT-ROUNDING` (research open question 5). Every booking is one apaleo line.
 */
export const TAX_RATE_TOLERANCE_CENTS = 1;

/** The MWST contained in `grossCents` at `percent`, rounded to the Rappen: `round(gross × rate / (100 + rate))`. 20760 at 3.8 → 760. */
export function inclusiveTaxCents(grossCents: number, percent: number): number {
  const hundredths = Math.round(percent * 100);
  return Math.round((grossCents * hundredths) / (10_000 + hundredths));
}

/**
 * Every error in the bookings at once (codes `E-ABACUS-ACCOUNT` to
 * `E-ABACUS-BELEGNR`, among them `E-ABACUS-TAX-RATE`), each with the booking index and the field, and
 * `E-ABACUS-PERIOD` (no booking index) for an invalid or reversed file period.
 * Messages name fields as Abacus does (Konto, Betrag, MWST-Code).
 */
export function validateBookings(bookings: readonly AbacusBooking[], options: Pick<AbacusRenderOptions, 'from' | 'to'>): Finding[] {
  const period = validatePeriod(options);
  const findings = [...period, ...bookings.flatMap((booking, index) => validateBooking(booking, index, options, period.length === 0))];
  if (bookings.length > MAX_BOOKINGS_PER_FILE) {
    findings.push({
      code: 'E-ABACUS-BELEGNR',
      field: 'documentNumber',
      label: labelOf('documentNumber'),
      value: String(bookings.length),
      message: `A file holds at most ${MAX_BOOKINGS_PER_FILE} bookings (6-digit counter in the Belegnummer), got ${bookings.length}; export a shorter period`,
    });
  }
  return findings;
}

/**
 * `E-ABACUS-PERIOD` for a `from` or `to` that is not a valid date, or a `from` after `to`. Without a valid period
 * the bookings' dates cannot be checked against it and no Belegnummer can be formed.
 */
export function validatePeriod({ from, to }: Pick<AbacusRenderOptions, 'from' | 'to'>): Finding[] {
  const findings: Finding[] = [];
  for (const [field, value] of [['from', from], ['to', to]] as const) {
    if (!isLocalDate(value)) {
      findings.push({ code: 'E-ABACUS-PERIOD', field, label: labelOf(field), value: String(value), message: `${labelOf(field)} must be a valid date written YYYY-MM-DD, got "${value}"` });
    }
  }
  if (findings.length === 0 && from > to) {
    findings.push({ code: 'E-ABACUS-PERIOD', field: 'from', label: labelOf('from'), value: from, message: `The file period starts on ${from}, after its last day ${to}` });
  }
  return findings;
}

function validateBooking(b: AbacusBooking, index: number, period: Pick<AbacusRenderOptions, 'from' | 'to'>, periodValid: boolean): Finding[] {
  const findings: Finding[] = [];
  const error = (code: string, field: string, value: unknown, message: string) =>
    findings.push({ code, index, field, label: labelOf(field), value: String(value), message });

  for (const field of ['collectiveAccount', 'singleAccount'] as const) {
    if (!ACCOUNT.test(b[field])) error('E-ABACUS-ACCOUNT', field, b[field], `${labelOf(field)} "${b[field]}" must be an Abacus account number of 1 to 11 digits`);
  }
  if (b.collectiveAccount === b.singleAccount) {
    error('E-ABACUS-SAME-ACCOUNT', 'singleAccount', b.singleAccount, `Konto and Gegenkonto are both "${b.singleAccount}": a booking needs two different accounts`);
  }
  const grossValid = isAmount(b.grossCents) && b.grossCents > 0;
  if (!grossValid) {
    error('E-ABACUS-AMOUNT', 'grossCents', b.grossCents, `Betrag must be above 0 with at most ${MAX_INTEGER_DIGITS} digits before the decimal point, got ${describeAmount(b.grossCents)}`);
  }
  if (!isLocalDate(b.businessDate)) {
    error('E-ABACUS-DATE', 'businessDate', b.businessDate, `Belegdatum must be a valid date written YYYY-MM-DD, got "${b.businessDate}"`);
  } else if (periodValid && (b.businessDate < period.from || b.businessDate > period.to)) {
    error('E-ABACUS-DATE', 'businessDate', b.businessDate, `Belegdatum ${b.businessDate} is outside the file period ${period.from} to ${period.to}`);
  }
  if (b.kost !== undefined && b.kost !== '' && !KOST.test(b.kost)) {
    error('E-ABACUS-KOST', 'kost', b.kost, `Kostenstelle must be 1 to 11 digits, got "${b.kost}"`);
  }
  if (sanitiseText(b.text1, index, 'text1').value === '') {
    error('E-ABACUS-TEXT', 'text1', b.text1, 'Text1 must not be empty: Abacus needs a booking text');
  }
  if (b.tax) findings.push(...validateTax(b, index, grossValid));
  return findings;
}

function validateTax(b: AbacusBooking, index: number, grossValid: boolean): Finding[] {
  const tax = b.tax;
  if (!tax) return [];
  const findings: Finding[] = [];
  const error = (code: string, field: string, value: unknown, message: string) =>
    findings.push({ code, index, field, label: labelOf(field), value: String(value), message });
  const { mwstCode, percent, taxCents } = tax;

  if (!MWST_CODE.test(mwstCode)) {
    error('E-ABACUS-MWST-CODE', 'mwstCode', mwstCode, `MWST-Code must be 1 to 3 characters of A-Z, a-z and 0-9 (a code of the Mandant's MWST-Tabelle), got "${mwstCode}"`);
  }
  const rateValid = Number.isFinite(percent) && percent >= 0 && percent <= MAX_RATE && hasAtMostTwoDecimals(percent);
  if (!rateValid) {
    error('E-ABACUS-RATE', 'percent', percent, `MWST-Satz must be from 0 to 99.99 with at most two decimals, got ${percent}`);
  }
  if (!Number.isInteger(taxCents)) {
    error('E-ABACUS-TAX', 'taxCents', taxCents, `MWST-Betrag must be whole Rappen, got ${taxCents}`);
    return findings;
  }
  if (grossValid && Math.abs(taxCents) >= b.grossCents) {
    error('E-ABACUS-TAX', 'taxCents', taxCents, `MWST-Betrag ${describeAmount(taxCents)} must be below the gross Betrag ${describeAmount(b.grossCents)}`);
  } else if (rateValid && percent === 0 && taxCents !== 0) {
    error('E-ABACUS-TAX', 'taxCents', taxCents, `MWST-Betrag must be 0.00 for the MWST-Code ${mwstCode} at rate 0, got ${describeAmount(taxCents)}`);
  } else if (grossValid && rateValid && percent > 0) {
    // With "MWST berechnen" off Abacus books KeyAmount as written, so a tax that does not fit the rate would go into the MWST-Abrechnung.
    const expected = inclusiveTaxCents(b.grossCents, percent);
    if (Math.abs(Math.abs(taxCents) - expected) > TAX_RATE_TOLERANCE_CENTS) {
      error(
        'E-ABACUS-TAX-RATE',
        'taxCents',
        taxCents,
        `MWST-Betrag ${describeAmount(taxCents)} does not fit ${formatRate(percent)} % of the gross Betrag ${describeAmount(b.grossCents)}: ` +
          `expected ${formatAmount(expected)} (Betrag × Satz / (100 + Satz), rounded to the Rappen), at most ${formatAmount(TAX_RATE_TOLERANCE_CENTS)} off`,
      );
    }
  }
  if (taxCents !== 0 && Math.sign(taxCents) !== taxSign(b.debitCredit)) {
    const side = b.debitCredit === 'D' ? 'credited (DebitCredit D)' : 'debited (DebitCredit C)';
    error(
      'E-ABACUS-TAX-SIGN',
      'taxCents',
      taxCents,
      `MWST-Betrag ${describeAmount(taxCents)} must be ${taxSign(b.debitCredit) < 0 ? 'negative' : 'positive'} when the Gegenkonto (SingleInformation) is ${side}`,
    );
  }
  return findings;
}

function isAmount(cents: number): boolean {
  return Number.isInteger(cents) && Math.abs(cents) <= MAX_AMOUNT_CENTS;
}

function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

/** Whole Rappen as an amount (`-760` → `-7.60`); anything else as given. */
function describeAmount(cents: number): string {
  return Number.isInteger(cents) ? formatAmount(cents) : String(cents);
}
