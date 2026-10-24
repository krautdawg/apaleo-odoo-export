import { ChartIndex } from '../../src/core/chart.js';
import type { LedgerLine } from '../../src/core/source.js';
import { parseMapping } from '../../src/mapping/index.js';
import { CLIENT_ID, ENG, loadChMonthData } from './apaleo.js';
import { readMappingFixture } from './mapping.js';

/**
 * The Swiss fixture month (`test/fixtures/apaleo/ch-month/`, property ENG, CHF,
 * August 2026) read through the real apaleo adapter, and its KMU mapping
 * (`test/fixtures/mapping/kmu-ch-month.csv`).
 */
export const CH_MONTH = await loadChMonthData();
export const CH_CHART = new ChartIndex(CH_MONTH.charts[ENG] ?? []);
export const CH_LEDGER: readonly LedgerLine[] = CH_MONTH.ledger[ENG] ?? [];
export const CH_MAPPING_FILE = 'kmu-ch-month.csv';
export const CH_MAPPING = parseMapping(readMappingFixture(CH_MAPPING_FILE), { path: CH_MAPPING_FILE });

/** The export config of the Swiss month: Mandant 1234, CHF, property ENG with the given `abacus` lines added. */
export function chMonthConfig(...abacus: string[]): string {
  return (
    `apaleo:\n  clientId: ${CLIENT_ID}\nabacus:\n  mandant: 1234\n  leitwaehrung: CHF\n${abacus.map((line) => `  ${line}\n`).join('')}` +
    'properties:\n  - id: ENG\n'
  );
}
