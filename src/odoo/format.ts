import type { OdooTaxRounding, OdooVersion } from '../core/config.js';
import { parseLocalDate, type LocalDate } from '../core/date.js';
import type { Side } from './types.js';

/**
 * Every format choice that the local test import (task group 7) or the first
 * real import may change lives here, each with the open question of
 * openspec/research/o-target.md §10 that decides it (design decisions 1 to 8 and
 * docs/odoo-format.md). The writer, the validation and the import block read
 * them from this module only.
 */

/**
 * The technical field paths of `account.move` and its `line_ids`, matched by
 * Odoo's import in every UI language (open question 1). The entry columns come
 * first; a continuation row leaves them empty.
 */
export const CSV_HEADER = [
  'id',
  'ref',
  'date',
  'journal_id',
  'line_ids/id',
  'line_ids/account_id',
  'line_ids/name',
  'line_ids/debit',
  'line_ids/credit',
  'line_ids/tax_ids/id',
] as const;
/** The first four columns belong to the entry, the others to its line. */
export const ENTRY_COLUMNS = 4;

export const FIELD_SEPARATOR = ',';
export const LINE_END = '\n';

/**
 * `line_ids/tax_ids/id` of an untaxed line: an empty cell sets "no taxes"
 * explicitly, so Odoo 17 and 18 do not add the account's default tax (SKR04
 * `4200` carries 19 %) (open question 4).
 */
export const NO_TAX_CELL = '';

/** The module of a chart-template tax's External ID: `account.<company id>_<template id>` (open questions 1 and 11). */
export const TAX_EXTERNAL_ID_MODULE = 'account';

/** `line_ids/name`: longer labels are cut (`N-ODOO-TRUNCATED`). */
export const LABEL_MAX_LENGTH = 128;

/** The largest gross amount in cents: 999,999,999.99, so `base × rate` stays an exact whole number in a JavaScript number. */
export const MAX_AMOUNT_CENTS = 10 ** 11 - 1;

/** How far from the exact net of a gross the base fitting looks for a base, in cents (open question 2). */
export const FIT_SEARCH_CENTS = 3;

/** Appended to the label of the 0.01 companion base line of `per_line` fitting (open question 2). */
export const COMPANION_LABEL_SUFFIX = ' (Rundungsausgleich)';

/** The label of the untaxed 0.01 line on `odoo.roundingAccount` of `per_tax` fitting (open question 2). */
export function roundingAccountLabel(percent: number): string {
  return `Rundungsausgleich USt ${formatRate(percent, ',')} %`;
}

/** The UStVA Kennzahl of the output tax at each German rate: 19 % in Kz 81, 7 % in Kz 86. */
export const KENNZAHL_BY_RATE: ReadonlyMap<number, string> = new Map([
  [19, '81'],
  [7, '86'],
]);

/** `Kz 81` for 19 %, `Kz 86` for 7 %, undefined for any other rate. */
export function kennzahl(percent: number): string | undefined {
  const kz = KENNZAHL_BY_RATE.get(percent);
  return kz && `Kz ${kz}`;
}

/** The label of the company's rounding method in Settings > Accounting > Taxes > Rounding Method, as each version shows it. */
export function roundingMethodLabel(taxRounding: OdooTaxRounding, version?: OdooVersion): string {
  if (taxRounding === 'per_line') return 'Round per Line';
  return version === 17 || version === 18 ? 'Round Globally' : 'Round per Tax';
}

// --- Numbers -----------------------------------------------------------------

/** A rate in hundredths of a percent: 7 → 700, 7.25 → 725. */
export function rateHundredths(percent: number): number {
  return Math.round(percent * 100);
}

/**
 * `numerator / denominator` rounded half away from zero, in whole numbers, as
 * Odoo's `float_round` rounds (research §3.5). The denominator is positive.
 */
export function roundHalfAwayFromZero(numerator: number, denominator: number): number {
  const magnitude = Math.abs(numerator);
  const quotient = Math.floor(magnitude / denominator);
  const rounded = 2 * (magnitude - quotient * denominator) >= denominator ? quotient + 1 : quotient;
  return numerator < 0 ? -rounded : rounded;
}

/** Odoo's tax on a base in cents at `percent`, excluded from the base: `round(base × rate / 100)`. 9350 at 7 → 655. */
export function taxOnBase(baseCents: number, percent: number): number {
  return roundHalfAwayFromZero(baseCents * rateHundredths(percent), 10_000);
}

/** Unsigned cents with a decimal point, two decimals and no thousands separator: 14380 → `143.80`. */
export function formatAmount(cents: number): string {
  const abs = Math.abs(cents);
  return `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Signed cents for messages: -1 → `-0.01`. */
export function formatSignedAmount(cents: number): string {
  return `${cents < 0 ? '-' : ''}${formatAmount(cents)}`;
}

/** A rate without trailing zeros: 7 → `7`, 7.5 → `7.5` (or `7,5` with `,`). */
export function formatRate(percent: number, decimal = '.'): string {
  const hundredths = rateHundredths(percent);
  const whole = String(Math.trunc(hundredths / 100));
  if (hundredths % 100 === 0) return whole;
  return `${whole}${decimal}${String(hundredths % 100).padStart(2, '0').replace(/0$/, '')}`;
}

// --- Dates -------------------------------------------------------------------

/** `YYYY-MM-DD`, the entry `date` and the reference. */
export function formatDate(date: LocalDate): string {
  const { year, month, day } = parts(date);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** `YYYYMMDD`, in the file name and the External IDs. */
export function formatYyyymmdd(date: LocalDate): string {
  return formatDate(date).replaceAll('-', '');
}

// --- CSV ---------------------------------------------------------------------

/** A value is quoted when it contains `,`, `"`, a line break or starts or ends with a space; a `"` inside is doubled. */
export function quoteCsv(value: string): string {
  return /[,"\r\n]|^ | $/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** One CSV row with its line end. */
export function csvRow(values: readonly string[]): string {
  return values.map(quoteCsv).join(FIELD_SEPARATOR) + LINE_END;
}

// --- External IDs and references -----------------------------------------------

/** A tax value without a `.` is a chart-template id: `account.<companyId>_<value>`; one with a `.` is a full External ID and stays. */
export function taxExternalId(taxRef: string, companyId: number): string {
  return taxRef.includes('.') ? taxRef : `${TAX_EXTERNAL_ID_MODULE}.${companyId}_${taxRef}`;
}

/** Where an entry's identity comes from. */
export interface EntryIdentity {
  companyId: number;
  propertyId: string;
  demo: boolean;
  revision: number;
}

/** Appended to the property id in External IDs of a demo file. */
export const DEMO_ID_MARKER = 'DEMO';
/** Before the reference of every demo entry. */
export const DEMO_REF_PREFIX = 'DEMO ';

/** `apaleo_c1_BSP_20260914`, `apaleo_c1_BSP_20260914_r2` for revision 2, `apaleo_c1_BSP_DEMO_20260914` in a demo file. */
export function entryExternalId(identity: EntryIdentity, date: LocalDate): string {
  const property = identity.demo ? `${identity.propertyId}_${DEMO_ID_MARKER}` : identity.propertyId;
  return `apaleo_c${identity.companyId}_${property}_${formatYyyymmdd(date)}${identity.revision >= 2 ? `_r${identity.revision}` : ''}`;
}

/** `<entry id>_0001` for the first line of the entry (`index` 0). */
export function lineExternalId(entryId: string, index: number): string {
  return `${entryId}_${pad(index + 1, 4)}`;
}

/** `apaleo BSP 2026-09-14`, with ` (Korrektur 2)` for revision 2 and `DEMO ` before it in a demo file. */
export function entryRef(identity: Omit<EntryIdentity, 'companyId'>, date: LocalDate): string {
  const correction = identity.revision >= 2 ? ` (Korrektur ${identity.revision})` : '';
  return `${identity.demo ? DEMO_REF_PREFIX : ''}apaleo ${identity.propertyId} ${formatDate(date)}${correction}`;
}

/** The revision in an entry External ID: 1 without `_r<N>`, undefined when `id` is not one of the writer's. */
export function revisionOfEntryId(id: string): number | undefined {
  const match = /^apaleo_c\d+_[A-Za-z0-9_-]+_\d{8}(?:_r(\d+))?$/.exec(id);
  if (!match) return undefined;
  return match[1] === undefined ? 1 : Number(match[1]);
}

/** The key of a (tax, side) group of an entry. */
export function groupKey(taxRef: string, side: Side): string {
  return `${taxRef}|${side}`;
}

function parts(date: LocalDate) {
  const result = parseLocalDate(date);
  if (!result) throw new TypeError(`Not a valid date: ${date}`);
  return result;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}
