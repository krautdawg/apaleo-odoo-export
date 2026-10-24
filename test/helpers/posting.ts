import { ChartIndex } from '../../src/core/chart.js';
import type { AccountRef, LedgerLine } from '../../src/core/source.js';
import { DEFAULT_MWST_CODES, parseMapping, shippedTemplate, suggestRows, type Mapping, type MappingRowValues } from '../../src/mapping/index.js';
import { rowKey } from '../../src/mapping/types.js';
import { buildBookings, type PostingOptions, type PostingResult } from '../../src/posting/index.js';
import { BSP, loadBeispielData } from './apaleo.js';
import { ledgerLine, tax } from './ledger.js';
import { mappingOf, readMappingFixture } from './mapping.js';
import { SWISS_CHART } from './swiss-chart.js';

/** The Hotel Beispiel data and its Abacus test mapping (`test/fixtures/mapping/abacus-beispiel.csv`, Austrian rates with V10 and V20). */
export const BEISPIEL = await loadBeispielData();
export const BEISPIEL_CHART = new ChartIndex(BEISPIEL.charts[BSP] ?? []);
export const LEDGER: readonly LedgerLine[] = BEISPIEL.ledger[BSP] ?? [];
export const BEISPIEL_MAPPING = parseMapping(readMappingFixture('abacus-beispiel.csv'), { path: 'abacus-beispiel.csv' });

/** The Swiss chart of the posting tests (`test/helpers/swiss-chart.ts`). */
export const CHART = new ChartIndex(SWISS_CHART);

/**
 * What `init-mapping --template kmu-hotel` writes on the Swiss chart, with the
 * Kurtaxe filled in as a durchlaufender Posten on 2210 without MWST-Code:
 * Beherbergung 3400 (313, 3.8 %), Küche 3200 and übrige Erlöse 3500 (311, 8.1 %),
 * 3260 (312, 2.6 %), 3600 and 3680 at 0 %, Kasse 1000, Transferkonto 1090,
 * Gästeforderungen 1101, Debitoren 1102, Anzahlungen 2030/2031/2032/2039 and
 * Debitorenverluste 3805/3806/3807/3808 by rate.
 */
export const KMU_ROWS: readonly MappingRowValues[] = suggestRows(SWISS_CHART, shippedTemplate(), { mwstCodes: { ...DEFAULT_MWST_CODES } }).map((row) =>
  row.apaleoAccount === '3501' ? { ...row, abacusAccount: '2210', comment: 'Kurtaxe: durchlaufender Posten ohne MWST-Code.' } : row,
);
export const KMU_MAPPING = mappingOf(KMU_ROWS);
export const OPTIONS: PostingOptions = { text2: 'receipt' };

/** The KMU mapping with the given rows first, replacing rows with the same key. The first given row is on line 2. */
export function mappingWith(...rows: MappingRowValues[]): Mapping {
  const replaced = new Set(rows.map(rowKey));
  return mappingOf([...rows, ...KMU_ROWS.filter((row) => !replaced.has(rowKey(row)))]);
}

export function post(lines: readonly LedgerLine[], mapping: Mapping = KMU_MAPPING, options: Partial<PostingOptions> = {}): PostingResult {
  return buildBookings(lines, mapping, CHART, { ...OPTIONS, ...options });
}

/** Accounts of the Swiss chart as they appear on ledger lines, in apaleo's real shapes. */
export const ACCOUNTS = {
  visa: { number: '1102', name: 'Visa Credit Card Payment', type: 'Payments', parentNumber: '1000' },
  twint: { number: '1114', name: 'Twint Payment', type: 'Payments', parentNumber: '1000' },
  cash: { number: '1600', name: 'Cash Payment', type: 'Payments', parentNumber: '1000' },
  receivables: { number: 'BSP-ABCDEF-1_Receivables', name: 'Receivables for Reservation BSP-ABCDEF-1', type: 'Receivables', parentNumber: '1200' },
  offset: { number: 'BSP-ABCDEF-1_Receivables/Offset', name: 'Receivables for Reservation BSP-ABCDEF-1 (Offset)', type: 'Receivables', parentNumber: '1200' },
  folio: { number: 'BSP-EXT-1_Receivables', name: 'Müller, Hans', type: 'Receivables', parentNumber: '1200' },
  liabilities: { number: 'BSP-GHIJKL-1_Liabilities/Special:3.80', name: 'Liabilities for Reservation BSP-GHIJKL-1 (3.8%)', type: 'Liabilities', parentNumber: '3000' },
  liabilities0: { number: 'BSP-GHIJKL-1_Liabilities/Without:0.00', name: 'Liabilities for Reservation BSP-GHIJKL-1 (0%)', type: 'Liabilities', parentNumber: '3000' },
  accommodation38: { number: 'RevenueAccommodation_Special:3.80', name: 'Revenues Accommodation (3.8%)', type: 'Revenues', parentNumber: 'RevenueAccommodation' },
  accommodation0: { number: 'RevenueAccommodation_Without:0.00', name: 'Revenues Accommodation (no VAT)', type: 'Revenues', parentNumber: 'RevenueAccommodation' },
  food81: { number: 'RevenueFoodAndBeverages_Normal:8.10', name: 'Revenues Food and beverages (8.1%)', type: 'Revenues', parentNumber: 'RevenueFoodAndBeverages' },
  food26: { number: 'RevenueFoodAndBeverages_Reduced:2.60', name: 'Revenues Food and beverages (2.6%)', type: 'Revenues', parentNumber: 'RevenueFoodAndBeverages' },
  other81: { number: 'RevenueOther_Normal:8.10', name: 'Revenues Other (8.1%)', type: 'Revenues', parentNumber: 'RevenueOther' },
  cityTax: { number: '3501', name: 'Kurtaxe', type: 'CityTaxes', parentNumber: '3500' },
  accountsReceivable: { number: 'BSP-ABCDEF-1_AccountsReceivable', name: 'AccountsReceivable for Reservation BSP-ABCDEF-1', type: 'AccountsReceivable', parentNumber: '9999' },
  vat38: { number: 'Vat_Special:3.80', name: 'VAT Special (3.8%)', type: 'Vat', parentNumber: '8000' },
  vatOnLiabilities38: { number: 'LiabilitiesVat_Special:3.80', name: 'LiabilitiesVat Special (3.8%)', type: 'VatOnLiabilities', parentNumber: '8001' },
} satisfies Record<string, AccountRef>;

const VAT_TYPES: Readonly<Record<number, string>> = { 3.8: 'Special', 8.1: 'Normal', 2.6: 'Reduced' };

/** A tax entry at a Swiss rate. */
export function swissTax(percent: number, amountCents: number, precise?: string) {
  return [tax(VAT_TYPES[percent] ?? 'Normal', percent, amountCents, precise)];
}

/** A Swiss accommodation charge in CHF: 207.60 at 3.8 % (net 200.00, tax 7.60) on the guest folio, unless overridden. */
export function charge(overrides: Partial<LedgerLine> = {}): LedgerLine {
  return ledgerLine({
    debit: ACCOUNTS.receivables,
    credit: ACCOUNTS.accommodation38,
    currency: 'CHF',
    grossCents: 20_760,
    netCents: 20_000,
    taxes: swissTax(3.8, 760),
    ...overrides,
  });
}
