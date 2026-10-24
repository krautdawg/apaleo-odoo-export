import { readFileSync } from 'node:fs';
import { ChartIndex } from '../../src/core/chart.js';
import type { LedgerLine } from '../../src/core/source.js';
import { mappingHeaderComment, parseMapping, renderMappingFile, shippedTemplate, suggestRows, type MappingRowValues } from '../../src/mapping/index.js';
import { BSP, CLIENT_ID, ODOO_SECTION, loadDeMonthData, loadDeTurnOfYearData } from './apaleo.js';

/**
 * The German fixture month (`test/fixtures/apaleo/de-month/`, property BSP
 * "Hotel Beispiel Berlin", EUR, September 2026) read through the real apaleo
 * adapter, and its mapping `test/fixtures/mapping/skr03-de-month.csv`: what
 * `init-mapping --template skr03-hotel` writes on its chart for `odoo.version: 18`
 * (Kasse 1001, Geldtransit 1360), with the two levy rows filled in as a Kanzlei
 * would: the guest-owed Kurtaxe (3501) as a durchlaufender Posten on 1590 without
 * tax, the hotel-owed Übernachtungsteuer (3502) on 8300 with `tax_ust_7_skr03`.
 */
export const DE_MONTH = await loadDeMonthData();
export const DE_CHART = new ChartIndex(DE_MONTH.charts[BSP] ?? []);
export const DE_LEDGER: readonly LedgerLine[] = DE_MONTH.ledger[BSP] ?? [];

/** The German turn-of-year days (`test/fixtures/apaleo/de-2025-12-31/`): breakfast at 19 % on 2025-12-31 and at 7 % on 2026-01-01. */
export const DE_TURN_OF_YEAR = await loadDeTurnOfYearData();

const SKR03 = shippedTemplate('skr03-hotel');
/** What `init-mapping --template skr03-hotel` writes on the chart of the German month for Odoo 18. */
export const DE_TEMPLATE_ROWS: readonly MappingRowValues[] = suggestRows(DE_MONTH.charts[BSP] ?? [], SKR03, { version: 18 });

/** The levy rows as the Kanzlei of Hotel Beispiel Berlin decided them. */
export const KANZLEI_ROWS: Readonly<Record<string, Partial<MappingRowValues>>> = {
  '3501': { odooAccount: '1590', comment: 'Kanzlei: Kurtaxe, die der Gast schuldet, ist ein durchlaufender Posten ohne Steuer (§ 10 Abs. 1 UStG).' },
  '3502': {
    odooAccount: '8300',
    odooTax: 'tax_ust_7_skr03',
    taxPercent: '7',
    comment: 'Kanzlei: Übernachtungsteuer, die der Betrieb schuldet und weitergibt, ist Teil des Entgelts für die Beherbergung zu 7 %.',
  },
};
export const DE_ROWS: readonly MappingRowValues[] = DE_TEMPLATE_ROWS.map((row) => ({ ...row, ...KANZLEI_ROWS[row.apaleoAccount] }));

export const DE_MAPPING_FILE = new URL('../fixtures/mapping/skr03-de-month.csv', import.meta.url);
/** The file `test/fixtures/mapping/skr03-de-month.csv` must hold, byte for byte (`test/posting/fixture-month-de.test.ts`). */
export const DE_MAPPING_BYTES = renderMappingFile(
  [mappingHeaderComment(SKR03, { version: 18 }), 'Kurtaxe (3501) und Übernachtungsteuer (3502) wie von der Kanzlei entschieden ausgefüllt.'],
  DE_ROWS,
);
export const DE_MAPPING = parseMapping(readFileSync(DE_MAPPING_FILE), { path: 'skr03-de-month.csv' });

/** The export config of the German month: journal APA, Odoo 18, property BSP, with the given `odoo` lines added. */
export function deMonthConfig(...odoo: string[]): string {
  return `apaleo:\n  clientId: ${CLIENT_ID}\n${ODOO_SECTION}${odoo.map((line) => `  ${line}\n`).join('')}properties:\n  - id: BSP\n`;
}
