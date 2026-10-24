import { readFileSync } from 'node:fs';
import { parseMapping, renderMappingFile, type Mapping, type MappingRowValues } from '../../src/mapping/index.js';

/** A mapping row with every column empty except the given ones. */
export function mappingRow(values: Partial<MappingRowValues> & Pick<MappingRowValues, 'apaleoAccount' | 'apaleoType'>): MappingRowValues {
  return {
    apaleoName: '',
    apaleoVatPercent: '',
    odooAccount: '',
    odooTax: '',
    taxPercent: '',
    comment: '',
    ...values,
  };
}

/** A mapping as `loadMapping` returns it for a file written from these rows. */
export function mappingOf(rows: readonly MappingRowValues[], comments: string[] = []): Mapping {
  return parseMapping(renderMappingFile(comments, rows), { path: 'mapping.csv' });
}

/** Mapping CSV text with `;` and CRLF, as UTF-8 bytes. */
export function csvBytes(lines: readonly string[]): Uint8Array {
  return new TextEncoder().encode(lines.map((line) => `${line}\r\n`).join(''));
}

export function readMappingFixture(name: string): Uint8Array {
  return readFileSync(new URL(`../fixtures/mapping/${name}`, import.meta.url));
}

/**
 * The rows written by `renderMappingFile` that `test/fixtures/mapping/excel-de-saved.csv`
 * holds after an Excel (DE) save: umlauts, an en dash, a separator and quotes inside
 * comments, the rates 7, 19 and 0, Odoo taxes, a generated account and a rate wildcard.
 */
export const EXCEL_ORIGINAL_ROWS: readonly MappingRowValues[] = [
  mappingRow({ apaleoAccount: 'RevenueAccommodation_Reduced:7.00', apaleoType: 'Revenues', apaleoName: 'Revenues Accommodation (7%)', apaleoVatPercent: '7', odooAccount: '8300', odooTax: 'tax_ust_7_skr03', taxPercent: '7', comment: 'Vorschlag (ungeprüft): Erlöse 7 % USt' }),
  mappingRow({ apaleoAccount: 'RevenueFoodAndBeverages_Reduced:7.00', apaleoType: 'Revenues', apaleoName: 'Frühstück Speisen (7%)', apaleoVatPercent: '7', odooAccount: '8300', odooTax: 'tax_ust_7_skr03', taxPercent: '7', comment: 'Speisen; eigenes Konto mit der Kanzlei klären' }),
  mappingRow({ apaleoAccount: 'RevenueFoodAndBeverages_Normal:19.00', apaleoType: 'Revenues', apaleoName: 'Getränke (19%)', apaleoVatPercent: '19', odooAccount: '8400', odooTax: 'tax_ust_19_skr03', taxPercent: '19' }),
  mappingRow({ apaleoAccount: 'RevenueOther_Without:0.00', apaleoType: 'Revenues', apaleoName: 'Revenues Other (no VAT)', apaleoVatPercent: '0', odooAccount: '8200', taxPercent: '0', comment: 'ohne USt' }),
  mappingRow({ apaleoAccount: '1102', apaleoType: 'Payments', apaleoName: 'Visa Credit Card Payment', odooAccount: '1360', comment: 'Karte "Visa" über das Geldtransitkonto' }),
  mappingRow({ apaleoAccount: '9000', apaleoType: 'House', apaleoName: 'House Account', comment: 'Testwert – Hauskonto noch offen' }),
  mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '7', odooAccount: '1711', odooTax: 'tax_ust_7_skr03', taxPercent: '7', comment: 'Anzahlungen 7 %' }),
  mappingRow({ apaleoAccount: '*', apaleoType: 'Receivables', odooAccount: '1410', comment: 'Gästeforderungen' }),
  mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes', apaleoName: 'City Tax (no VAT)', apaleoVatPercent: '0', comment: 'Gast schuldet: Durchlaufende Posten 1590 ohne Steuer – mit der Kanzlei entscheiden.' }),
];
