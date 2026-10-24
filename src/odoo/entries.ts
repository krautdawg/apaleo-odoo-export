import type { LocalDate } from '../core/date.js';
import type { Finding } from '../core/findings.js';
import { sanitiseLabel } from './sanitise.js';
import type { OdooBooking, OdooLine, Side } from './types.js';

/** The summed booking sides of one day with the same (account, tax, label). Amounts are signed, Soll positive. */
export interface NettedKey {
  account: string;
  label: string;
  taxRef?: string;
  percent?: number;
  /** apaleo's net: the gross of an untaxed side, gross minus apaleo's tax of a VAT side. */
  netCents: number;
  /** The gross of the sides: what the fitted base plus Odoo's tax must reach. Equals `netCents` on an untaxed key. */
  grossCents: number;
  /** apaleo's rounded tax of the VAT sides; 0 on an untaxed key. */
  apaleoTaxCents: number;
  /** The number of bookings (apaleo lines) behind the key. */
  apaleoLines: number;
  sourceEntryNumbers: string[];
}

export interface DayKeys {
  date: LocalDate;
  keys: NettedKey[];
}

/**
 * The bookings per business day, each side added to its key (account, tax
 * value, sanitised label): a VAT side with its net and gross, every other side
 * with its gross, debits positive and credits negative. Days come in date
 * order, keys in the order of their first booking. `notes` receives each
 * `N-ODOO-TRUNCATED` once per day, account and label.
 */
export function nettedDays(bookings: readonly OdooBooking[], notes: Finding[]): DayKeys[] {
  const days = new Map<LocalDate, Map<string, NettedKey>>();
  const noted = new Set<string>();
  for (const booking of bookings) {
    const keys = days.get(booking.businessDate) ?? new Map<string, NettedKey>();
    days.set(booking.businessDate, keys);
    for (const side of ['debit', 'credit'] as const) {
      const { account, label: original } = booking[side];
      const { value: label, note } = sanitiseLabel(original, booking.businessDate, account);
      const noteKey = `${booking.businessDate}\u0000${account}\u0000${original}`;
      if (note && !noted.has(noteKey)) {
        noted.add(noteKey);
        notes.push(note);
      }
      addSide(keys, booking, side, label);
    }
  }
  return [...days]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, keys]) => ({ date, keys: [...keys.values()] }));
}

function addSide(keys: Map<string, NettedKey>, booking: OdooBooking, side: Side, label: string): void {
  const { account } = booking[side];
  const vat = booking.vat?.side === side ? booking.vat : undefined;
  const sign = side === 'debit' ? 1 : -1;
  const taxCents = vat?.apaleoTaxCents ?? 0;
  const id = [account, vat?.taxRef ?? '', label].join('\u0000');
  const key = keys.get(id) ?? {
    account,
    label,
    ...(vat && { taxRef: vat.taxRef, percent: vat.percent }),
    netCents: 0,
    grossCents: 0,
    apaleoTaxCents: 0,
    apaleoLines: 0,
    sourceEntryNumbers: [],
  };
  key.netCents += sign * (booking.grossCents - taxCents);
  key.grossCents += sign * booking.grossCents;
  key.apaleoTaxCents += sign * taxCents;
  key.apaleoLines += 1;
  key.sourceEntryNumbers.push(...booking.sourceEntryNumbers);
  keys.set(id, key);
}

/**
 * The order of the lines of an entry: by account code with numeric parts
 * compared as numbers (`8300` before `10000`), then tax value (untaxed first),
 * then label, each by code unit, so the order never depends on a locale.
 */
export function compareLines(a: Pick<OdooLine, 'account' | 'taxRef' | 'label'>, b: Pick<OdooLine, 'account' | 'taxRef' | 'label'>): number {
  return naturalCompare(a.account, b.account) || codeUnitCompare(a.taxRef ?? '', b.taxRef ?? '') || codeUnitCompare(a.label, b.label);
}

function naturalCompare(a: string, b: string): number {
  const chunks = (text: string) => text.match(/\d+|\D+/g) ?? [];
  const [left, right] = [chunks(a), chunks(b)];
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const [x, y] = [left[i] ?? '', right[i] ?? ''];
    const numeric = /^\d/.test(x) && /^\d/.test(y);
    const order = numeric ? compareDigits(x, y) : codeUnitCompare(x, y);
    if (order !== 0) return order;
  }
  return left.length - right.length || codeUnitCompare(a, b);
}

/** Digit strings by value without converting them, so long codes stay exact; `08` after `8` when equal in value. */
function compareDigits(x: string, y: string): number {
  const [a, b] = [x.replace(/^0+(?=\d)/, ''), y.replace(/^0+(?=\d)/, '')];
  return a.length - b.length || codeUnitCompare(a, b) || x.length - y.length;
}

function codeUnitCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
