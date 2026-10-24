import type { Finding } from '../core/findings.js';
import { nettedDays } from './entries.js';
import { OdooValidationError } from './errors.js';
import {
  CSV_HEADER,
  csvRow,
  ENTRY_COLUMNS,
  entryExternalId,
  entryRef,
  formatAmount,
  formatDate,
  formatYyyymmdd,
  lineExternalId,
  NO_TAX_CELL,
  revisionOfEntryId,
  TAX_EXTERNAL_ID_MODULE,
  taxExternalId,
} from './format.js';
import { fitDay, vatComparison } from './fit.js';
import { odooTax } from './tax-model.js';
import type { OdooBooking, OdooEntry, OdooRenderOptions, OdooTaxTotal, OdooVatComparison } from './types.js';
import { validateBookings, validateEntry, validatePeriod, validatePropertyId } from './validate.js';

export interface RenderedOdooCsv {
  /** The whole file with LF line ends. */
  text: string;
  /** `text` in UTF-8 without byte-order mark. */
  bytes: Uint8Array;
  /** `N-ODOO-TRUNCATED` and `N-ODOO-ROUNDING-LINE`. */
  notes: Finding[];
  entries: OdooEntry[];
  /** Odoo's modelled tax against apaleo's per day and rate. */
  vat: OdooVatComparison[];
  /** Base and Odoo's modelled tax per Odoo tax over the whole file. */
  taxTotals: OdooTaxTotal[];
  /** Lines added by the base fitting. */
  roundingLines: number;
  /** Netting keys without amount, which got no line. */
  droppedKeys: number;
}

/** The fitted entries of the bookings, after every check. Throws one `OdooValidationError` with every problem. */
export function buildEntries(bookings: readonly OdooBooking[], options: OdooRenderOptions): { entries: OdooEntry[]; notes: Finding[] } {
  if (!Number.isInteger(options.revision) || options.revision < 1) throw new RangeError(`The revision must be a whole number from 1, got ${options.revision}`);
  if (!Number.isInteger(options.companyId) || options.companyId < 1) throw new RangeError(`odoo.companyId must be a whole number from 1, got ${options.companyId}`);
  const canonical = canonicalTaxRefs(bookings, options.companyId);
  const bookingErrors = validateBookings(canonical, options);
  if (bookingErrors.length > 0) throw new OdooValidationError(bookingErrors);

  const notes: Finding[] = [];
  const errors: Finding[] = [];
  const entries: OdooEntry[] = [];
  for (const { date, keys } of nettedDays(canonical, notes)) {
    const fitted = fitDay(date, keys, options);
    notes.push(...fitted.notes);
    errors.push(...fitted.errors);
    if (fitted.errors.length === 0) errors.push(...validateEntry(fitted.entry, options.taxRounding));
    if (fitted.entry.lines.length > 0) entries.push(fitted.entry);
  }
  if (errors.length > 0) throw new OdooValidationError(errors);
  return { entries, notes };
}

/**
 * The bookings with every tax value written as `account.<companyId>_<id>` turned
 * into its chart-template id `<id>`, so two values that become the same tax
 * External ID in the file share one netting key, one rate check and one
 * (tax, side) group.
 */
function canonicalTaxRefs(bookings: readonly OdooBooking[], companyId: number): readonly OdooBooking[] {
  return bookings.map((booking) => {
    if (!booking.vat) return booking;
    const taxRef = canonicalTaxRef(booking.vat.taxRef, companyId);
    return taxRef === booking.vat.taxRef ? booking : { ...booking, vat: { ...booking.vat, taxRef } };
  });
}

/** `account.<companyId>_<id>` as its chart-template id `<id>`; any other tax value as it is. */
export function canonicalTaxRef(taxRef: string, companyId: number): string {
  const prefix = `${TAX_EXTERNAL_ID_MODULE}.${companyId}_`;
  const short = taxRef.startsWith(prefix) ? taxRef.slice(prefix.length) : '';
  return /^[a-z0-9_]+$/.test(short) ? short : taxRef;
}

/**
 * Renders the Odoo import file of journal entries (`account.move`): the header
 * `CSV_HEADER`, then per entry a row with its External ID, reference, date,
 * journal and first line, and a continuation row per further line with the
 * entry columns empty (research §2). Throws one `OdooValidationError` with
 * every problem found, and writes nothing then.
 */
export function renderOdooCsv(bookings: readonly OdooBooking[], options: OdooRenderOptions): RenderedOdooCsv {
  const { entries, notes } = buildEntries(bookings, options);
  const rows = [csvRow(CSV_HEADER)];
  for (const entry of entries) {
    const id = entryExternalId(options, entry.date);
    const head = [id, entryRef(options, entry.date), formatDate(entry.date), options.journal];
    entry.lines.forEach((line, index) => {
      const debit = line.amountCents > 0 ? line.amountCents : 0;
      const credit = line.amountCents < 0 ? -line.amountCents : 0;
      const tax = line.taxRef === undefined ? NO_TAX_CELL : taxExternalId(line.taxRef, options.companyId);
      const entryColumns = index === 0 ? head : Array<string>(ENTRY_COLUMNS).fill('');
      rows.push(csvRow([...entryColumns, lineExternalId(id, index), line.account, line.label, formatAmount(debit), formatAmount(credit), tax]));
    });
  }
  const text = rows.join('');
  return {
    text,
    bytes: new TextEncoder().encode(text),
    notes,
    entries,
    vat: entries.flatMap((entry) => vatComparison(entry, options.taxRounding)),
    taxTotals: taxTotals(entries, options.taxRounding),
    roundingLines: entries.reduce((sum, entry) => sum + entry.lines.filter((line) => line.kind !== 'booking').length, 0),
    droppedKeys: entries.reduce((sum, entry) => sum + entry.droppedKeys, 0),
  };
}

/**
 * Per Odoo tax, sorted by rate (highest first) and tax: the sum of its base
 * lines, Odoo's modelled tax and apaleo's rounded tax, each credited positive.
 */
export function taxTotals(entries: readonly OdooEntry[], mode: OdooRenderOptions['taxRounding']): OdooTaxTotal[] {
  const totals = new Map<string, OdooTaxTotal>();
  const total = (taxRef: string, percent: number) => {
    const entry = totals.get(taxRef) ?? { taxRef, percent, baseCents: 0, odooTaxCents: 0, apaleoTaxCents: 0 };
    totals.set(taxRef, entry);
    return entry;
  };
  for (const entry of entries) {
    for (const line of entry.lines) if (line.taxRef !== undefined && line.percent !== undefined) total(line.taxRef, line.percent).baseCents -= line.amountCents;
    for (const tax of odooTax(entry.lines, mode)) total(tax.taxRef, tax.percent).odooTaxCents += tax.side === 'credit' ? tax.taxCents : -tax.taxCents;
    for (const group of entry.groups) total(group.taxRef, group.percent).apaleoTaxCents += group.side === 'credit' ? group.apaleoTaxCents : -group.apaleoTaxCents;
  }
  return [...totals.values()].sort((a, b) => b.percent - a.percent || (a.taxRef < b.taxRef ? -1 : a.taxRef > b.taxRef ? 1 : 0));
}

/**
 * The revision of a file the writer rendered: from the External ID of its
 * first entry, 1 without `_r<N>`; undefined for a file without entries or one
 * the writer did not render.
 */
export function revisionOf(bytes: Uint8Array): number | undefined {
  const [, firstRow] = new TextDecoder().decode(bytes).split('\n', 2);
  const id = firstRow?.split(',', 1)[0];
  return id ? revisionOfEntryId(id) : undefined;
}

/**
 * `ODOO_Buchungen_<YYYYMMDD>-<YYYYMMDD>_<tag>.csv` for the first and last day
 * of the period. `tag` is the property id, or `<id>_DEMO` for a demo file.
 */
export function odooCsvFileName(options: Pick<OdooRenderOptions, 'from' | 'to' | 'propertyId'>, tag = options.propertyId): string {
  const problems = [...validatePropertyId(options.propertyId), ...validatePeriod(options)];
  if (!/^[A-Za-z0-9_-]+$/.test(tag)) problems.push({ code: 'E-ODOO-PROPERTY-ID', field: 'propertyId', value: tag, message: `The file name tag may only contain A-Z a-z 0-9 _ -, got "${tag}"` });
  if (problems.length > 0) throw new OdooValidationError(problems);
  return `ODOO_Buchungen_${formatYyyymmdd(options.from)}-${formatYyyymmdd(options.to)}_${tag}.csv`;
}
