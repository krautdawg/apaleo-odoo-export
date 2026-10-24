import type { LedgerTax } from '../core/source.js';

/**
 * Drops tax entries with percent 0 and amount 0. The apaleo Swagger allows such
 * `Without` or `Null` entries, for example on city tax or cancellation fees; what
 * remains are the taxes the line really carries.
 */
export function normaliseTaxes(taxes: readonly LedgerTax[]): LedgerTax[] {
  return taxes.filter((tax) => tax.percent !== 0 || tax.amountCents !== 0);
}

/** The distinct percents of normalised taxes, in order of appearance. */
export function taxPercents(taxes: readonly LedgerTax[]): number[] {
  return [...new Set(taxes.map((tax) => tax.percent))];
}

export function taxTotal(taxes: readonly LedgerTax[]): number {
  return taxes.reduce((sum, tax) => sum + tax.amountCents, 0);
}

/** `numerator / denominator` rounded half away from zero, for non-negative BigInts. */
function roundedQuotient(numerator: bigint, denominator: bigint): number {
  let quotient = numerator / denominator;
  if (2n * (numerator - quotient * denominator) >= denominator) quotient += 1n;
  return Number(quotient);
}

/** A rate in hundredths of a percent: 4.9 → 490n. Rates have at most two decimals. */
const hundredths = (ratePercent: number) => BigInt(Math.round(ratePercent * 100));

/**
 * The VAT contained in a gross amount in cents at a rate: `gross × rate / (100 + rate)`,
 * rounded half away from zero, with the sign of `grossCents`. Exact integer
 * arithmetic, so no floating-point noise can move a half Rappen. The tax of a
 * deposit release without `taxes[]` and with a chart rate only (design decision 4).
 */
export function taxFromGross(grossCents: number, ratePercent: number): number {
  const rate = hundredths(ratePercent);
  const cents = roundedQuotient(BigInt(Math.abs(grossCents)) * rate, 10_000n + rate);
  return grossCents < 0 && cents !== 0 ? -cents : cents;
}

/**
 * Abacus' check value of a booking with an inclusive gross amount (`TaxIncluded` `I`):
 * the tax contained in it, `round(|gross| × rate / (100 + rate))`, unsigned. It may
 * differ by one Rappen from apaleo's tax rounded on its own (`W-VAT-ROUNDING`).
 */
export function inclusiveCheckTax(grossCents: number, ratePercent: number): number {
  return Math.abs(taxFromGross(grossCents, ratePercent));
}
