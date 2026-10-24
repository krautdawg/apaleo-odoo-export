import { parseLocalDate, type LocalDate } from '../core/date.js';
import type { Abrechnungsart, DebitCredit } from './types.js';

/**
 * Every format choice that the first real Abacus test import may change lives
 * here, each with the open question of openspec/research/a-target.md §9 that
 * decides it (design decisions 3 to 9 and docs/abacus-format.md). The writer,
 * the validation and the import block read them from this module only.
 */

export const LINE_END = '\n';
export const INDENT = '  ';
export const XML_DECLARATION = "<?xml version='1.0' encoding='UTF-8'?>";
/** `Text1`, `Text2`: 80 characters in the 2024.00 field list. */
export const TEXT_MAX_LENGTH = 80;
/** `Amount`, `KeyAmount`: at most 11 digits before the decimal point (13 digits with the two decimals). */
export const MAX_INTEGER_DIGITS = 11;
export const MAX_AMOUNT_CENTS = 10 ** (MAX_INTEGER_DIGITS + 2) - 1;
/** The counter after `MMDD` in a Belegnummer: 6 digits, so `DocumentNumber` has its 10 characters (open question 7). */
export const DOCUMENT_NUMBER_COUNTER_DIGITS = 6;
export const MAX_BOOKINGS_PER_FILE = 10 ** DOCUMENT_NUMBER_COUNTER_DIGITS - 1;

/** `TaxType` of output tax: `0` = Umsatzsteuer per the field description; erpnextswiss writes `1` (open question 3). */
export type TaxType = 0 | 1;
export const TAX_TYPE_OUTPUT: TaxType = 0;

/**
 * The sign of the tax amount (`TaxData/KeyAmount`) for a booking's `DebitCredit`:
 * negative when the VAT-bearing Single account is credited (`D`: output tax
 * owed), positive when it is debited (`C`: allowance, write-off). A hypothesis
 * until the first import (open question 4); `E-ABACUS-TAX-SIGN` calls this
 * function, so flipping the rule here flips the validation too.
 */
export function taxSign(debitCredit: DebitCredit): -1 | 1 {
  return debitCredit === 'D' ? -1 : 1;
}

/**
 * `TaxData/AmountData/Amount` when the booking currency equals the Leitwährung:
 * `zero` writes `0.00` (erpnextswiss since 2023, after Abacus raised an error
 * otherwise), `tax` writes the tax amount as the field list reads (open question 11).
 */
export type TaxAmountInKeyCurrency = 'zero' | 'tax';
export const TAX_AMOUNT_IN_KEY_CURRENCY: TaxAmountInKeyCurrency = 'zero';

/** `TaxIncluded`: gross amounts are booked inclusive of MWST. */
export const TAX_INCLUDED = 'I';

/**
 * `TaxIncluded` on an MWST-Code at rate 0: the KMU sample codes 400 and 491
 * carry different `Inclusive` flags of undocumented meaning; the amounts are
 * the same either way (open question 14).
 */
export type TaxIncluded = 'I' | 'E';
export const TAX_INCLUDED_AT_RATE_ZERO: TaxIncluded = 'I';

/**
 * `TaxAccount` of `SingleInformation`: `account` writes the Single account
 * itself (the documented table: "Ertragskonto"), `taxAccount` the tax account
 * of the Collective block as erpnextswiss does (open question 12).
 */
export type SingleTaxAccount = 'account' | 'taxAccount';
export const SINGLE_TAX_ACCOUNT: SingleTaxAccount = 'account';

/** `TaxCoefficient`, `Country` and `FlatRate` (no Saldosteuersatz in v1). */
export const TAX_COEFFICIENT = '100';
export const TAX_COUNTRY = 'CH';
export const FLAT_RATE = '0';

/**
 * The Ziffer of the MWST-Abrechnung (ESTV form, effective method) for each
 * Swiss rate in force since 2024-01-01: Normalsatz 8.1 % → 303, reduzierter
 * Satz 2.6 % → 313, Sondersatz Beherbergung 3.8 % → 343. Another rate (an old
 * Swiss rate or a foreign one) has no Ziffer here; the next rate change
 * replaces this table (design decision 1 of a06).
 */
export const MWST_ZIFFER_BY_RATE: ReadonlyMap<number, string> = new Map([
  [8.1, '303'],
  [2.6, '313'],
  [3.8, '343'],
]);

/** The Ziffer of the MWST-Abrechnung for `percent`, or undefined for a rate without one. */
export function mwstZiffer(percent: number): string | undefined {
  return MWST_ZIFFER_BY_RATE.get(percent);
}

/** `UseCode`: `0` vereinbart, `1` vereinnahmt. */
export function useCode(abrechnungsart: Abrechnungsart): '0' | '1' {
  return abrechnungsart === 'vereinnahmt' ? '1' : '0';
}

export interface TaxAccounts {
  collective: string;
  single: string;
}

export interface TaxAccountSettings {
  abrechnungsart: Abrechnungsart;
  mwstKonto: string;
  mwstHilfskonto: string;
}

/** The Collective `TaxAccount` of a booking with MWST: the Steuerkonto (`vereinbart`) or Hilfskonto (`vereinnahmt`) of the MWST-Codes (open question 8). */
export function collectiveTaxAccount(settings: TaxAccountSettings): string {
  return settings.abrechnungsart === 'vereinnahmt' ? settings.mwstHilfskonto : settings.mwstKonto;
}

/** `TaxAccount` of both blocks of a booking without MWST. */
export const NO_TAX_ACCOUNT = '0';

/**
 * The Collective `TaxAccount` of a booking with an MWST-Code at rate 0 (400,
 * 490, 491): `taxAccount` writes the Steuerkonto or Hilfskonto as on every other
 * code, `zero` writes `0`. The KMU sample Mandant gives these codes no
 * Steuerkonto, and the 2020 PDF names the "Steuerkonto des MWST-Codes", so `0`
 * may be what Abacus expects (open question 8).
 */
export type TaxAccountAtRateZero = 'taxAccount' | 'zero';
export const TAX_ACCOUNT_AT_RATE_ZERO: TaxAccountAtRateZero = 'taxAccount';

/**
 * The `TaxAccount` of both blocks of a booking with MWST at `percent`: Collective
 * as `collectiveTaxAccount`, or `0` at rate 0 when `atRateZero` is `zero` (pass
 * `TAX_ACCOUNT_AT_RATE_ZERO`); Single as `singleTaxAccount` selects (pass
 * `SINGLE_TAX_ACCOUNT`). A booking without MWST writes `0` in both blocks instead.
 */
export function taxAccounts(
  singleAccount: string,
  percent: number,
  settings: TaxAccountSettings,
  singleTaxAccount: SingleTaxAccount,
  atRateZero: TaxAccountAtRateZero,
): TaxAccounts {
  const collective = percent === 0 && atRateZero === 'zero' ? NO_TAX_ACCOUNT : collectiveTaxAccount(settings);
  return { collective, single: singleTaxAccount === 'account' ? singleAccount : collective };
}

/** Signed Rappen with decimal point, two decimals, leading minus and no thousands separator. -760 → `-7.60`. */
export function formatAmount(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** A rate with decimal point and without trailing zeros: 8.1 → `8.1`, 0 → `0`, 12.25 → `12.25`. */
export function formatRate(percent: number): string {
  const hundredths = Math.round(percent * 100);
  const whole = String(Math.trunc(hundredths / 100));
  if (hundredths % 100 === 0) return whole;
  return `${whole}.${String(hundredths % 100).padStart(2, '0').replace(/0$/, '')}`;
}

/** `YYYY-MM-DD`, the `EntryDate`. */
export function formatDate(date: LocalDate): string {
  const { year, month, day } = parts(date);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** `JJJJMMTT` for the file name. 2026-10-14 → `20261014`. */
export function formatYyyymmdd(date: LocalDate): string {
  const { year, month, day } = parts(date);
  return `${pad(year, 4)}${pad(month, 2)}${pad(day, 2)}`;
}

/**
 * The Belegnummer (`DocumentNumber`) of the booking at `index` (0-based) in a
 * file starting on `from`: `MMDD` of that day and a 6-digit counter.
 * 2026-10-01, 0 → `1001000001`.
 */
export function formatDocumentNumber(from: LocalDate, index: number): string {
  const { month, day } = parts(from);
  return `${pad(month, 2)}${pad(day, 2)}${pad(index + 1, DOCUMENT_NUMBER_COUNTER_DIGITS)}`;
}

const XML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' };

/** Escapes `&`, `<`, `>`, `'` and `"` for text content and single-quoted attribute values. */
export function escapeXml(text: string): string {
  return text.replace(/[&<>'"]/g, (char) => XML_ESCAPES[char] ?? char);
}

/** Two spaces per nesting level. */
export function indent(depth: number): string {
  return INDENT.repeat(depth);
}

function parts(date: LocalDate) {
  const result = parseLocalDate(date);
  if (!result) throw new TypeError(`Not a valid date: ${date}`);
  return result;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}
