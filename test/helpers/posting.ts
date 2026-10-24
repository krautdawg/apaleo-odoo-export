import { ChartIndex } from '../../src/core/chart.js';
import type { AccountRef, LedgerLine } from '../../src/core/source.js';
import { parseMapping, shippedTemplate, suggestRows, type Mapping, type MappingRowValues } from '../../src/mapping/index.js';
import { rowKey } from '../../src/mapping/types.js';
import { buildBookings, type PostingOptions, type PostingResult } from '../../src/posting/index.js';
import { BSP, loadBeispielData } from './apaleo.js';
import { GERMAN_CHART } from './german-chart.js';
import { ledgerLine, tax } from './ledger.js';
import { mappingOf, readMappingFixture } from './mapping.js';

/** The Hotel Beispiel data and its Odoo test mapping (`test/fixtures/mapping/odoo-beispiel.csv`, Austrian rates with the l10n_at taxes). */
export const BEISPIEL = await loadBeispielData();
export const BEISPIEL_CHART = new ChartIndex(BEISPIEL.charts[BSP] ?? []);
export const LEDGER: readonly LedgerLine[] = BEISPIEL.ledger[BSP] ?? [];
export const BEISPIEL_MAPPING = parseMapping(readMappingFixture('odoo-beispiel.csv'), { path: 'odoo-beispiel.csv' });

/** The German chart of the posting tests (`test/helpers/german-chart.ts`). */
export const CHART = new ChartIndex(GERMAN_CHART);

/** The Kurtaxe row as a Steuerberater fills it in: a durchlaufender Posten on 1590 without tax. */
export const KURTAXE_COMMENT = 'Kurtaxe: durchlaufender Posten ohne Steuer.';

/**
 * What `init-mapping --template skr03-hotel` writes on the German chart for Odoo
 * 18, with the Kurtaxe filled in as a durchlaufender Posten on 1590 without tax:
 * Erlöse 7 % 8300 (`tax_ust_7_skr03`), 19 % 8400 (`tax_ust_19_skr03`), 0 % 8200,
 * Kasse 1001, Geldtransit 1360, Gästeforderungen 1410, Forderungen 1401,
 * Anzahlungen 1711/1718/1719 and Forderungsverluste 2401/2406/2400 by rate.
 */
export const SKR03_ROWS: readonly MappingRowValues[] = suggestRows(GERMAN_CHART, shippedTemplate('skr03-hotel'), { version: 18 }).map((row) =>
  row.apaleoAccount === '3501' ? { ...row, odooAccount: '1590', comment: KURTAXE_COMMENT } : row,
);
export const SKR03_MAPPING = mappingOf(SKR03_ROWS);
export const OPTIONS: PostingOptions = { text2: 'receipt', version: 18 };

/** The SKR03 mapping with the given rows first, replacing rows with the same key. The first given row is on line 2. */
export function mappingWith(...rows: MappingRowValues[]): Mapping {
  const replaced = new Set(rows.map(rowKey));
  return mappingOf([...rows, ...SKR03_ROWS.filter((row) => !replaced.has(rowKey(row)))]);
}

export function post(lines: readonly LedgerLine[], mapping: Mapping = SKR03_MAPPING, options: Partial<PostingOptions> = {}): PostingResult {
  return buildBookings(lines, mapping, CHART, { ...OPTIONS, ...options });
}

/** Accounts of the German chart as they appear on ledger lines, in apaleo's real shapes. */
export const ACCOUNTS = {
  visa: { number: '1102', name: 'Visa Credit Card Payment', type: 'Payments', parentNumber: '1000' },
  mastercard: { number: '1104', name: 'MasterCard Credit Card Payment', type: 'Payments', parentNumber: '1000' },
  cash: { number: '1600', name: 'Cash Payment', type: 'Payments', parentNumber: '1000' },
  receivables: { number: 'BSP-ABCDEF-1_Receivables', name: 'Receivables for Reservation BSP-ABCDEF-1', type: 'Receivables', parentNumber: '1200' },
  offset: { number: 'BSP-ABCDEF-1_Receivables/Offset', name: 'Receivables for Reservation BSP-ABCDEF-1 (Offset)', type: 'Receivables', parentNumber: '1200' },
  folio: { number: 'BSP-EXT-1_Receivables', name: 'Müller, Hans', type: 'Receivables', parentNumber: '1200' },
  liabilities: { number: 'BSP-GHIJKL-1_Liabilities/Reduced:7.00', name: 'Liabilities for Reservation BSP-GHIJKL-1 (7%)', type: 'Liabilities', parentNumber: '3000' },
  liabilities19: { number: 'BSP-GHIJKL-1_Liabilities/Normal:19.00', name: 'Liabilities for Reservation BSP-GHIJKL-1 (19%)', type: 'Liabilities', parentNumber: '3000' },
  liabilities0: { number: 'BSP-GHIJKL-1_Liabilities/Without:0.00', name: 'Liabilities for Reservation BSP-GHIJKL-1 (0%)', type: 'Liabilities', parentNumber: '3000' },
  liabilitiesNull: { number: 'BSP-ABCDEF-1_Liabilities/Null:0.00', name: 'Liabilities for Reservation BSP-ABCDEF-1 (0%)', type: 'Liabilities', parentNumber: '3000' },
  accommodation7: { number: 'RevenueAccommodation_Reduced:7.00', name: 'Revenues Accommodation (7%)', type: 'Revenues', parentNumber: 'RevenueAccommodation' },
  accommodation0: { number: 'RevenueAccommodation_Without:0.00', name: 'Revenues Accommodation (no VAT)', type: 'Revenues', parentNumber: 'RevenueAccommodation' },
  food7: { number: 'RevenueFoodAndBeverages_Reduced:7.00', name: 'Revenues Food and beverages (7%)', type: 'Revenues', parentNumber: 'RevenueFoodAndBeverages' },
  food19: { number: 'RevenueFoodAndBeverages_Normal:19.00', name: 'Revenues Food and beverages (19%)', type: 'Revenues', parentNumber: 'RevenueFoodAndBeverages' },
  other19: { number: 'RevenueOther_Normal:19.00', name: 'Revenues Other (19%)', type: 'Revenues', parentNumber: 'RevenueOther' },
  cityTax: { number: '3501', name: 'Kurtaxe', type: 'CityTaxes', parentNumber: '3500' },
  noShow7: { number: 'RevenueNoShow_Reduced:7.00', name: 'Revenues No-show (7%)', type: 'Revenues', parentNumber: 'RevenueNoShow' },
  cancellation0: { number: 'RevenueCancellationFees_Without:0.00', name: 'Revenues Cancellation fees (no VAT)', type: 'Revenues', parentNumber: 'RevenueCancellationFees' },
  loss7: { number: 'BSP-ABCDEF-1_LossOfAccountsReceivable/Reduced:7.00', name: 'LossOfAccountsReceivable for Reservation BSP-ABCDEF-1 (7%)', type: 'LossOfAccountsReceivable', parentNumber: '6900' },
  loss19: { number: 'BSP-ABCDEF-1_LossOfAccountsReceivable/Normal:19.00', name: 'LossOfAccountsReceivable for Reservation BSP-ABCDEF-1 (19%)', type: 'LossOfAccountsReceivable', parentNumber: '6900' },
  loss0: { number: 'BSP-ABCDEF-1_LossOfAccountsReceivable/Null:0.00', name: 'LossOfAccountsReceivable for Reservation BSP-ABCDEF-1 (0%)', type: 'LossOfAccountsReceivable', parentNumber: '6900' },
  accountsReceivable: { number: 'BSP-ABCDEF-1_AccountsReceivable', name: 'AccountsReceivable for Reservation BSP-ABCDEF-1', type: 'AccountsReceivable', parentNumber: '9999' },
  vat7: { number: 'Vat_Reduced:7.00', name: 'VAT Reduced (7%)', type: 'Vat', parentNumber: '8000' },
  vatOnLiabilities7: { number: 'LiabilitiesVat_Reduced:7.00', name: 'LiabilitiesVat Reduced (7%)', type: 'VatOnLiabilities', parentNumber: '8001' },
} satisfies Record<string, AccountRef>;

const VAT_TYPES: Readonly<Record<number, string>> = { 7: 'Reduced', 19: 'Normal' };

/** A tax entry at a German rate. */
export function germanTax(percent: number, amountCents: number, precise?: string) {
  return [tax(VAT_TYPES[percent] ?? 'Normal', percent, amountCents, precise)];
}

/** An accommodation charge in EUR: 120.00 at 7 % (net 112.15, tax 7.85) on the guest folio, unless overridden. */
export function charge(overrides: Partial<LedgerLine> = {}): LedgerLine {
  return ledgerLine({
    debit: ACCOUNTS.receivables,
    credit: ACCOUNTS.accommodation7,
    currency: 'EUR',
    grossCents: 12_000,
    netCents: 11_215,
    netPrecise: '112.14953271',
    taxes: germanTax(7, 785, '7.85046729'),
    ...overrides,
  });
}
