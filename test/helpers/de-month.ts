import { ChartIndex } from '../../src/core/chart.js';
import type { LedgerLine } from '../../src/core/source.js';
import { shippedTemplate, suggestRows, type MappingRowValues } from '../../src/mapping/index.js';
import { BSP, CLIENT_ID, ODOO_SECTION, loadDeMonthData } from './apaleo.js';
import { mappingOf } from './mapping.js';

/**
 * The German fixture month (`test/fixtures/apaleo/de-month/`, property BSP
 * "Hotel Beispiel Berlin", EUR, September 2026) read through the real apaleo
 * adapter, and what `init-mapping --template skr03-hotel` writes on its chart
 * for `odoo.version: 18` (Kasse 1001, Geldtransit 1360).
 */
export const DE_MONTH = await loadDeMonthData();
export const DE_CHART = new ChartIndex(DE_MONTH.charts[BSP] ?? []);
export const DE_LEDGER: readonly LedgerLine[] = DE_MONTH.ledger[BSP] ?? [];
export const DE_ROWS: readonly MappingRowValues[] = suggestRows(DE_MONTH.charts[BSP] ?? [], shippedTemplate('skr03-hotel'), { version: 18 });
export const DE_MAPPING = mappingOf(DE_ROWS);

/** The export config of the German month: journal APA, Odoo 18, property BSP, with the given `odoo` lines added. */
export function deMonthConfig(...odoo: string[]): string {
  return `apaleo:\n  clientId: ${CLIENT_ID}\n${ODOO_SECTION}${odoo.map((line) => `  ${line}\n`).join('')}properties:\n  - id: BSP\n`;
}
