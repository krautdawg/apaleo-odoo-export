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
  taxExternalId,
} from './format.js';
import { fitDay, vatComparison } from './fit.js';
import type { OdooBooking, OdooEntry, OdooRenderOptions, OdooVatComparison } from './types.js';
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
  /** Lines added by the base fitting. */
  roundingLines: number;
  /** Netting keys without amount, which got no line. */
  droppedKeys: number;
}

/** The fitted entries of the bookings, after every check. Throws one `OdooValidationError` with every problem. */
export function buildEntries(bookings: readonly OdooBooking[], options: OdooRenderOptions): { entries: OdooEntry[]; notes: Finding[] } {
  if (!Number.isInteger(options.revision) || options.revision < 1) throw new RangeError(`The revision must be a whole number from 1, got ${options.revision}`);
  if (!Number.isInteger(options.companyId) || options.companyId < 1) throw new RangeError(`odoo.companyId must be a whole number from 1, got ${options.companyId}`);
  const bookingErrors = validateBookings(bookings, options);
  if (bookingErrors.length > 0) throw new OdooValidationError(bookingErrors);

  const notes: Finding[] = [];
  const errors: Finding[] = [];
  const entries: OdooEntry[] = [];
  for (const { date, keys } of nettedDays(bookings, notes)) {
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
    roundingLines: entries.reduce((sum, entry) => sum + entry.lines.filter((line) => line.kind !== 'booking').length, 0),
    droppedKeys: entries.reduce((sum, entry) => sum + entry.droppedKeys, 0),
  };
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
