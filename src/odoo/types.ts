import type { OdooTaxRounding } from '../core/config.js';
import type { LocalDate } from '../core/date.js';

export type { OdooTaxRounding } from '../core/config.js';

/** The side of a journal item: `debit` (Soll) or `credit` (Haben). */
export type Side = 'debit' | 'credit';

/** One account of a booking with the label its journal item gets. */
export interface OdooBookingSide {
  /** The Odoo account code, for example `8300`. */
  account: string;
  /** The label (`line_ids/name`) of the netted line, without personal data, for example `Logis 7 %`. */
  label: string;
}

/** The VAT of a booking: its VAT side becomes a base line with the Odoo tax. */
export interface OdooVat {
  /** The side whose account carries the tax (revenue credited, allowance or deposit release debited). */
  side: Side;
  /** A chart-template tax id (`tax_ust_7_skr03`, written as `account.<companyId>_<id>`) or a full External ID (`__import__.ust_7_hotel`). */
  taxRef: string;
  /** The rate in percent with at most two decimals, for example `7`. */
  percent: number;
  /** apaleo's tax of the line in whole cents, rounded half away from zero, from 0 to below the gross. */
  apaleoTaxCents: number;
}

/**
 * One apaleo ledger line as the Odoo writer takes it (o03 builds them): the
 * gross amount moves from the credit to the debit account. The VAT side books
 * the net amount (gross minus apaleo's tax) as the base of its Odoo tax; Odoo
 * computes the tax itself.
 */
export interface OdooBooking {
  /** The business day, the date of the day's journal entry. Must lie inside the file period. */
  businessDate: LocalDate;
  debit: OdooBookingSide;
  credit: OdooBookingSide;
  /** The gross amount in whole cents, above 0. */
  grossCents: number;
  /** Omitted: both sides are untaxed lines. */
  vat?: OdooVat;
  /** The apaleo entry numbers behind the booking, for the protocol (never in the file). */
  sourceEntryNumbers: readonly string[];
}

/** What a line of an entry is: netted bookings, or a cent added by the base fitting. */
export type OdooLineKind = 'booking' | 'rounding-companion' | 'rounding-account';

/** One journal item of an entry. */
export interface OdooLine {
  account: string;
  /** The sanitised label. */
  label: string;
  /** The tax value as the booking carries it; omitted on an untaxed line. */
  taxRef?: string;
  /** The rate of `taxRef`. */
  percent?: number;
  /** Signed cents, Soll positive; never 0. */
  amountCents: number;
  kind: OdooLineKind;
  /** The tax group (`groupKey`) a `rounding-account` line completes. */
  roundsGroup?: string;
  /** The apaleo entry numbers netted into the line. */
  sourceEntryNumbers: readonly string[];
}

/** The bookings behind one (tax, side) group of an entry: what the fitted lines must reach. */
export interface OdooTaxGroup {
  /** `groupKey(taxRef, side)`. */
  key: string;
  taxRef: string;
  percent: number;
  /** `credit` = invoice side, `debit` = refund side. */
  side: Side;
  /** The unsigned gross of the group's bookings: fitted bases plus Odoo's tax (plus a rounding-account cent) must equal it. */
  grossCents: number;
  /** The unsigned sum of apaleo's rounded tax of the group's bookings. */
  apaleoTaxCents: number;
  /** The number of apaleo lines (bookings) in the group. */
  apaleoLines: number;
}

/** One journal entry: one property and business day. */
export interface OdooEntry {
  date: LocalDate;
  lines: OdooLine[];
  groups: OdooTaxGroup[];
  /** Netting keys whose net was 0, so they got no line. */
  droppedKeys: number;
}

/** What the caller decides about one file. */
export interface OdooRenderOptions {
  /** First and last day of the file period. */
  from: LocalDate;
  to: LocalDate;
  /** The apaleo property id: 1 to 20 characters of `A-Z a-z 0-9 _ -`, not ending with `_DEMO`. */
  propertyId: string;
  /** `odoo.companyId`: in the tax and entry External IDs. */
  companyId: number;
  /** The journal code (`odoo.journal` or the property's own). */
  journal: string;
  /** `odoo.currency`, for the import block. */
  currency: string;
  taxRounding: OdooTaxRounding;
  /** `odoo.roundingAccount`: needed when per-tax rounding cannot reach a gross. */
  roundingAccount?: string;
  /** 1 for the first file of a period, N for the N-th replacement. */
  revision: number;
  /** `export --demo`: `<propertyId>_DEMO` in the External IDs, `DEMO ` before every reference. */
  demo: boolean;
}

/** Odoo's tax against apaleo's per rate and day, signed: output tax positive, refund side negative. */
export interface OdooVatComparison {
  date: LocalDate;
  percent: number;
  odooTaxCents: number;
  apaleoTaxCents: number;
  differenceCents: number;
}
