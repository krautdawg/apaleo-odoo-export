import type { LocalDate } from '../../src/core/date.js';
import type { OdooBooking, OdooRenderOptions, OdooVat } from '../../src/odoo/types.js';

/**
 * Booking builders for the Odoo writer tests and golden files: property BSP,
 * SKR03 accounts and l10n_de tax template ids (research §4), business day
 * 2026-09-14 unless given. Each builder is one apaleo ledger line.
 */

export const DAY: LocalDate = '2026-09-14';

/** The file of BSP for September 2026: company 1, journal APA, EUR, per-line rounding, revision 1. */
export function odooOptions(overrides: Partial<OdooRenderOptions> = {}): OdooRenderOptions {
  return {
    from: '2026-09-01',
    to: '2026-09-30',
    propertyId: 'BSP',
    companyId: 1,
    journal: 'APA',
    currency: 'EUR',
    taxRounding: 'per_line',
    revision: 1,
    demo: false,
    ...overrides,
  };
}

export function vat(taxRef: string, percent: number, apaleoTaxCents: number, side: OdooVat['side'] = 'credit'): OdooVat {
  return { side, taxRef, percent, apaleoTaxCents };
}

let entryNumber = 0;
function next(): string[] {
  entryNumber += 1;
  return [`BSP-${String(entryNumber).padStart(4, '0')}`];
}

/** Revenue on the guest ledger: `1410` in Soll, the revenue account in Haben with its tax. Default: lodging 120.00 at 7 % (apaleo tax 7.85). */
export function revenue(overrides: Partial<OdooBooking> = {}): OdooBooking {
  return {
    businessDate: DAY,
    debit: { account: '1410', label: 'Gästeforderungen' },
    credit: { account: '8300', label: 'Logis 7 %' },
    grossCents: 12_000,
    vat: vat('tax_ust_7_skr03', 7, 785),
    sourceEntryNumbers: next(),
    ...overrides,
  };
}

/** Drinks 23.80 at 19 % (apaleo tax 3.80) on `8400`. */
export function drinks(overrides: Partial<OdooBooking> = {}): OdooBooking {
  return revenue({ credit: { account: '8400', label: 'Getränke 19 %' }, grossCents: 2_380, vat: vat('tax_ust_19_skr03', 19, 380), ...overrides });
}

/** A card payment: Geldtransit `1360` in Soll, the guest ledger `1410` in Haben, without tax. */
export function payment(grossCents: number, label = 'Zahlung Visa', overrides: Partial<OdooBooking> = {}): OdooBooking {
  return {
    businessDate: DAY,
    debit: { account: '1360', label },
    credit: { account: '1410', label: 'Gästeforderungen' },
    grossCents,
    sourceEntryNumbers: next(),
    ...overrides,
  };
}

/** An allowance on lodging: `8300` in Soll (refund side), `1410` in Haben. Default 20.00 at 7 % (apaleo tax 1.31). */
export function allowance(overrides: Partial<OdooBooking> = {}): OdooBooking {
  return {
    businessDate: DAY,
    debit: { account: '8300', label: 'Logis 7 %' },
    credit: { account: '1410', label: 'Gästeforderungen' },
    grossCents: 2_000,
    vat: vat('tax_ust_7_skr03', 7, 131, 'debit'),
    sourceEntryNumbers: next(),
    ...overrides,
  };
}

/** A deposit received by card at 7 %: `1360` in Soll, `1711` in Haben with the tax (Mindest-Ist-Versteuerung). Default 300.00 (apaleo tax 19.63). */
export function depositReceived(overrides: Partial<OdooBooking> = {}): OdooBooking {
  return {
    businessDate: DAY,
    debit: { account: '1360', label: 'Anzahlung Visa' },
    credit: { account: '1711', label: 'Anzahlungen 7 %' },
    grossCents: 30_000,
    vat: vat('tax_ust_7_skr03', 7, 1_963),
    sourceEntryNumbers: next(),
    ...overrides,
  };
}

/** The release of a deposit at 7 % on check-out: `1711` in Soll (refund side), `1410` in Haben. */
export function depositReleased(overrides: Partial<OdooBooking> = {}): OdooBooking {
  return {
    businessDate: DAY,
    debit: { account: '1711', label: 'Anzahlungen 7 %' },
    credit: { account: '1410', label: 'Gästeforderungen' },
    grossCents: 30_000,
    vat: vat('tax_ust_7_skr03', 7, 1_963, 'debit'),
    sourceEntryNumbers: next(),
    ...overrides,
  };
}

/** The refund of a 19 % deposit: `1718` in Soll (refund side), `1360` in Haben. Default 23.80 (apaleo tax 3.80). */
export function depositRefund(overrides: Partial<OdooBooking> = {}): OdooBooking {
  return {
    businessDate: DAY,
    debit: { account: '1718', label: 'Anzahlungen 19 %' },
    credit: { account: '1360', label: 'Rückzahlung Anzahlung' },
    grossCents: 2_380,
    vat: vat('tax_ust_19_skr03', 19, 380, 'debit'),
    sourceEntryNumbers: next(),
    ...overrides,
  };
}

/** Untaxed revenue: `1410` in Soll, SKR04 `4200` (default tax 19 % in Odoo) in Haben, no tax. Default 80.00. */
export function untaxed(overrides: Partial<OdooBooking> = {}): OdooBooking {
  return {
    businessDate: DAY,
    debit: { account: '1410', label: 'Gästeforderungen' },
    credit: { account: '4200', label: 'Erlöse ohne USt' },
    grossCents: 8_000,
    sourceEntryNumbers: next(),
    ...overrides,
  };
}

/** The spec's day: lodging 120.00 at 7 %, drinks 23.80 at 19 % and a Visa payment of 143.80. */
export function specDay(date: LocalDate = DAY): OdooBooking[] {
  return [revenue({ businessDate: date }), drinks({ businessDate: date }), payment(14_380, 'Zahlung Visa', { businessDate: date })];
}
