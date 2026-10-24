import { readFileSync } from 'node:fs';
import { parseMapping, renderMappingFile, type Mapping, type MappingRowValues } from '../../src/mapping/index.js';

/** A mapping row with every column empty except the given ones. */
export function mappingRow(values: Partial<MappingRowValues> & Pick<MappingRowValues, 'apaleoAccount' | 'apaleoType'>): MappingRowValues {
  return {
    apaleoName: '',
    apaleoVatPercent: '',
    abacusAccount: '',
    mwstCode: '',
    mwstPercent: '',
    kost: '',
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
 * The rows written by `renderMappingFile` that `test/fixtures/mapping/excel-ch-saved.csv`
 * holds after an Excel (CH) save: umlauts, an en dash, a separator and quotes inside
 * comments, a Kostenstelle, the rates 3.8, 8.1 and 2.6, MWST-Codes and a rate wildcard.
 */
export const EXCEL_ORIGINAL_ROWS: readonly MappingRowValues[] = [
  mappingRow({ apaleoAccount: 'RevenueAccommodation_Special:3.80', apaleoType: 'Revenues', apaleoName: 'Revenues Accommodation (3.8%)', apaleoVatPercent: '3.8', abacusAccount: '3400', mwstCode: '313', mwstPercent: '3.8', comment: 'Vorschlag (ungeprüft): Beherbergung 3,8 %' }),
  mappingRow({ apaleoAccount: 'RevenueFoodAndBeverages_Normal:8.10', apaleoType: 'Revenues', apaleoName: 'Frühstück Speisen (8.1%)', apaleoVatPercent: '8.1', abacusAccount: '3200', mwstCode: '311', mwstPercent: '8.1', comment: 'Speisen; eigenes Konto mit dem Treuhänder klären' }),
  mappingRow({ apaleoAccount: 'RevenueBeverages_Normal:8.10', apaleoType: 'Revenues', apaleoName: 'Getränke (8.1%)', apaleoVatPercent: '8.1', abacusAccount: '3100', mwstCode: '311', mwstPercent: '8.1', kost: '20' }),
  mappingRow({ apaleoAccount: 'RevenueOther_Reduced:2.60', apaleoType: 'Revenues', apaleoName: 'Revenues Other (2.6%)', apaleoVatPercent: '2.6', abacusAccount: '3260', mwstCode: '312', mwstPercent: '2.6', comment: 'Take-away 2,6 %' }),
  mappingRow({ apaleoAccount: '1102', apaleoType: 'Payments', apaleoName: 'Visa Credit Card Payment', abacusAccount: '1090', comment: 'Karte "Visa" über das Transferkonto' }),
  mappingRow({ apaleoAccount: '9000', apaleoType: 'House', apaleoName: 'House Account', comment: 'Testwert – Hauskonto noch offen' }),
  mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '3.8', abacusAccount: '2030', mwstCode: '313', mwstPercent: '3.8', comment: 'Anzahlungen 3,8 %' }),
  mappingRow({ apaleoAccount: '*', apaleoType: 'AccountsReceivable', abacusAccount: '1102', comment: 'Debitoren apaleo' }),
  mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes', apaleoName: 'City Tax (no VAT)', apaleoVatPercent: '0', comment: 'Gast schuldet: Gemeinde 2210 ohne MWST-Code – mit dem Treuhänder entscheiden.' }),
];
