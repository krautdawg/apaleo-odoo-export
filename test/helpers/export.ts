import { readFileSync } from 'node:fs';
import type { LedgerLine } from '../../src/core/source.js';
import { BSP, FIXTURE_FILES } from './apaleo.js';
import { createTestContext, type TestContext } from './context.js';
import { FakeSource, type FakeSourceData } from './fake-source.js';
import { BEISPIEL } from './posting.js';

/** The Odoo test mapping of Hotel Beispiel (`test/fixtures/mapping/odoo-beispiel.csv`) as text. */
export const BEISPIEL_MAPPING_TEXT = readFileSync(new URL('../fixtures/mapping/odoo-beispiel.csv', import.meta.url), 'utf8');

/**
 * The Hotel Beispiel mapping books the Austrian rates 10, 13 and 20 % with the
 * l10n_at taxes, which the tool does not know, so every export of it warns
 * `W-TAX-UNCHECKED` for them. Tests about something else drop those warnings with
 * these helpers; the warning itself is tested in `test/export/pipeline.test.ts`
 * and `test/cli/schedule.test.ts`.
 */
export const AUSTRIAN_TAXES: ReadonlySet<string> = new Set(['account_tax_template_sales_10_code029', 'account_tax_template_sales_13_code006', 'account_tax_template_sales_20_code022']);
const isAustrianTaxWarning = (finding: { code: string; value?: string | undefined }) => finding.code === 'W-TAX-UNCHECKED' && AUSTRIAN_TAXES.has(finding.value ?? '');

/** The findings without the `W-TAX-UNCHECKED` warnings for the l10n_at taxes. */
export function withoutAustrianTaxes<T extends { code: string; value?: string | undefined }>(findings: readonly T[]): T[] {
  return findings.filter((finding) => !isAustrianTaxWarning(finding));
}

/** CLI output without the `W-TAX-UNCHECKED` lines and codes for the l10n_at taxes. */
export function stripAustrianTaxes(out: string): string {
  return out
    .split('\n')
    .filter((line) => !/^ {2}W-TAX-UNCHECKED \(odoo_tax\): .*the Odoo tax account_tax_template_sales_\d+_code\d+ /.test(line))
    .map((line) => line.replace(/ W-TAX-UNCHECKED(?=\s|$)/, ''))
    .join('\n');
}

/** The fixture config with property BSP and the given lines appended. */
export function exportConfig(...extra: string[]): string {
  return `${FIXTURE_FILES['apaleo-odoo.config.yaml']}properties:\n  - id: BSP\n${extra.map((line) => `${line}\n`).join('')}`;
}

export interface ExportSetup {
  ctx: TestContext;
  fake: FakeSource;
  data: FakeSourceData;
}

export interface ExportSetupOptions {
  config?: string;
  files?: Record<string, string>;
  /** Changes the Hotel Beispiel data before the fake source serves it. */
  data?: (data: FakeSourceData) => void;
  now?: Date;
}

/**
 * A test context for the export: the fixture config (Odoo journal APA, version 18, EUR), the Hotel Beispiel mapping
 * as `mapping-BSP.csv`, a `FakeSource` over the fixtures (shared by every call,
 * so a test can change `data` between runs) and the fixed clock 2026-10-20.
 */
export function exportSetup(options: ExportSetupOptions = {}): ExportSetup {
  const data = structuredClone(BEISPIEL);
  options.data?.(data);
  const fake = new FakeSource(data);
  const ctx = createTestContext({
    files: { 'apaleo-odoo.config.yaml': options.config ?? exportConfig(), 'mapping-BSP.csv': BEISPIEL_MAPPING_TEXT, ...options.files },
    sourceFactory: () => fake,
    ...(options.now ? { now: options.now } : {}),
  });
  return { ctx, fake, data };
}

/** Hotel Beispiel served a second time as property BSP2, with the same chart and ledger. */
export function addSecondProperty(data: FakeSourceData, id = 'BSP2'): void {
  const property = data.properties.find((p) => p.id === BSP);
  if (!property) throw new Error('fixture property BSP missing');
  data.properties.push({ ...property, id, code: id, name: `${property.name} 2` });
  data.charts[id] = structuredClone(data.charts[BSP] ?? []);
  data.ledger[id] = structuredClone(data.ledger[BSP] ?? []);
}

/** A late posting: one more 10 % logis charge on 2026-09-22. */
export function latePosting(data: FakeSourceData): void {
  const [template] = (data.ledger[BSP] ?? []).filter(
    (line: LedgerLine) => line.command === 'PostCharge' && line.credit.number === 'RevenueAccommodation_VeryReduced:10.00',
  );
  if (!template) throw new Error('fixture logis charge missing');
  data.ledger[BSP]?.push({ ...structuredClone(template), businessDate: '2026-09-22', postedAt: '2026-09-23T01:10:00Z', sourceEntryNumber: 'BSPE9999' });
}
