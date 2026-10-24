import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/core/config.js';
import type { LedgerLine } from '../../src/core/source.js';
import { runExport, type ExportRequest, type Manifest } from '../../src/export/index.js';
import { renderMappingFile } from '../../src/mapping/index.js';
import { BSP } from '../helpers/apaleo.js';
import { DE_MONTH, DE_ROWS, deMonthConfig } from '../helpers/de-month.js';
import { exportSetup, type ExportSetup } from '../helpers/export.js';
import type { FakeSourceData } from '../helpers/fake-source.js';
import { describeUtf8Difference } from '../helpers/golden.js';

/**
 * export-run, "Idempotent re-runs": every file is rendered for a revision, and
 * `--overwrite` writes the next one, on the German fixture month with the demo's
 * Odoo 19 settings (`per_tax`, rounding account 2700). The golden pair:
 * revision 1 is the writer's golden `test/golden/odoo/de-month.per-tax.csv`,
 * revision 2 after a late posting `test/golden/export/de-month.per-tax.r2.csv`.
 * After an intended change to the output, run `UPDATE_GOLDEN=1 pnpm test` and
 * review the diff of both.
 */
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const REVISION_1 = new URL('../golden/odoo/de-month.per-tax.csv', import.meta.url);
const REVISION_2 = new URL('../golden/export/de-month.per-tax.r2.csv', import.meta.url);
const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' } as const;
const FILE = 'ODOO_Buchungen_20260901-20260930_BSP.csv';
const PROTOCOL = 'ODOO_Buchungen_20260901-20260930_BSP.protokoll.txt';
const ODOO_19 = ['version: 19', 'taxRounding: per_tax', "roundingAccount: '2700'"];
const MAPPING = new TextDecoder().decode(renderMappingFile([], DE_ROWS));

function germanMonth(...odoo: string[]): ExportSetup {
  const config = deMonthConfig(...odoo).replace('  version: 18\n', '');
  return exportSetup({ config, files: { 'mapping-BSP.csv': MAPPING }, data: (data) => Object.assign(data, structuredClone(DE_MONTH)) });
}

/** A late posting: the Logis of BSP-DELTA-1 (149.80 at 7 %) once more, on 2026-09-22. */
function latePosting(data: FakeSourceData, entry = 'BSPE9999'): void {
  const template = data.ledger[BSP]?.find((line: LedgerLine) => line.sourceEntryNumber === 'BSPE0015');
  if (!template) throw new Error('fixture Logis line BSPE0015 missing');
  data.ledger[BSP]?.push({ ...structuredClone(template), businessDate: '2026-09-22', postedAt: '2026-09-23T01:10:00Z', sourceEntryNumber: entry });
}

async function run(setup: ExportSetup, request: Partial<ExportRequest> = {}) {
  const { ctx, fake } = setup;
  const loaded = await loadConfig({ path: join(ctx.cwd, 'apaleo-odoo.config.yaml'), env: ctx.env, readFile: ctx.fs.readFile });
  const [outcome] = await runExport({ period: SEPTEMBER, propertyIds: [BSP], dryRun: false, overwrite: false, ...request }, { loaded, source: fake, ctx });
  if (!outcome) throw new Error('no outcome');
  return outcome;
}

const folder = (setup: ExportSetup) => join(setup.ctx.cwd, 'exports', BSP, '2026-09');
const text = (setup: ExportSetup, name: string) => readFileSync(join(folder(setup), name), 'utf8');
const manifest = (setup: ExportSetup) => JSON.parse(text(setup, 'manifest.json')) as Manifest;
const entryIds = (csv: string) => csv.split('\n').slice(1).map((row) => row.split(',')[0] ?? '').filter(Boolean);
const references = (csv: string) => csv.split('\n').slice(1).map((row) => row.split(',')[1] ?? '').filter(Boolean);

function expectGolden(path: URL, actual: string): void {
  if (UPDATE) writeFileSync(path, actual);
  const difference = describeUtf8Difference(readFileSync(path), Buffer.from(actual));
  expect(difference, `${path.pathname} differs from the golden file:\n${difference}`).toBeUndefined();
}

describe('revisions of a replaced file (export-run, "Idempotent re-runs")', () => {
  it('Late posting changed the month: refuses with E-FILE-EXISTS, names revision 2 with new External IDs and what to delete and reverse in Odoo first', async () => {
    const setup = germanMonth(...ODOO_19);
    expect((await run(setup)).status).toBe('written');
    const before = text(setup, FILE);
    latePosting(setup.data);
    const refused = await run(setup);
    expect(refused.status).toBe('failed');
    const exists = refused.findings.find((f) => f.code === 'E-FILE-EXISTS');
    expect(exists?.message).toContain('With --overwrite the new file is revision 2 with new External IDs (_r2) and the reference suffix "(Korrektur 2)"');
    expect(exists?.message).toContain('delete the draft entries of the earlier revision in Odoo (filter by the reference "apaleo BSP") and reverse its posted entries');
    expect(exists?.message).toContain('because an import cannot change a posted entry and a reversal keeps its External ID');
    expect(exists?.message).toContain('Then run again with --overwrite');
    expect(text(setup, FILE)).toBe(before);
  });

  it('Overwrite writes the next revision: golden revision 1 and revision 2 of the German month, _r2 External IDs, „(Korrektur 2)“, revision 2 in the manifest and the protocol, then unchanged', async () => {
    const setup = germanMonth(...ODOO_19);
    expect((await run(setup)).status).toBe('written');
    const first = text(setup, FILE);
    expectGolden(REVISION_1, first);
    expect(entryIds(first).every((id) => /^apaleo_c1_BSP_202609\d{2}$/.test(id))).toBe(true);
    expect(manifest(setup).files).toMatchObject([{ file: FILE, status: 'current', revision: 1 }]);

    latePosting(setup.data);
    setup.ctx.now = () => new Date('2026-10-21T09:30:00Z');
    const replaced = await run(setup, { overwrite: true });
    expect(replaced.status).toBe('replaced');
    const second = text(setup, FILE);
    expectGolden(REVISION_2, second);
    const backup = 'ODOO_Buchungen_20260901-20260930_BSP.replaced-20261021T093000Z.csv';
    expect(text(setup, backup)).toBe(first);
    const ids = entryIds(second);
    expect(ids).toContain('apaleo_c1_BSP_20260922_r2');
    expect(ids.every((id) => /^apaleo_c1_BSP_202609\d{2}_r2$/.test(id))).toBe(true);
    expect(references(second).every((ref) => /^apaleo BSP 2026-09-\d{2} \(Korrektur 2\)$/.test(ref))).toBe(true);
    expect(manifest(setup).files.map((e) => [e.file, e.status, e.revision])).toEqual([
      [backup, 'replaced', 1],
      [FILE, 'current', 2],
    ]);
    expect(text(setup, PROTOCOL)).toContain('\n  Revision: 2 (Korrektur 2, new External IDs): before importing, delete the draft entries of the earlier revision in Odoo');

    const again = await run(setup);
    expect(again.status).toBe('unchanged');
    expect(text(setup, FILE)).toBe(second);
  });

  it('Revision without the manifest: reads revision 2 from the file and writes revision 3; with the manifest gone and no change it stays unchanged', async () => {
    const setup = germanMonth(...ODOO_19);
    await run(setup);
    latePosting(setup.data);
    expect((await run(setup, { overwrite: true })).status).toBe('replaced');
    rmSync(join(folder(setup), 'manifest.json'));

    const unchanged = await run(setup);
    expect(unchanged.status).toBe('unchanged');
    expect(unchanged.findings.map((f) => f.code)).toContain('N-COMPANIONS-REPAIRED');
    expect(manifest(setup).files).toMatchObject([{ file: FILE, status: 'current', revision: 2 }]);

    rmSync(join(folder(setup), 'manifest.json'));
    latePosting(setup.data, 'BSPE9998');
    setup.ctx.now = () => new Date('2026-10-22T09:30:00Z');
    expect((await run(setup, { overwrite: true })).status).toBe('replaced');
    const third = text(setup, FILE);
    expect(entryIds(third).every((id) => id.endsWith('_r3'))).toBe(true);
    expect(references(third)[0]).toMatch(/ \(Korrektur 3\)$/);
    expect(manifest(setup).files.map((e) => [e.status, e.revision])).toEqual([
      ['replaced', 2],
      ['current', 3],
    ]);
  });

  it('Config changed the journal: refuses with E-FILE-EXISTS and keeps the old file; --overwrite writes revision 2 with the new journal code', async () => {
    const setup = germanMonth(...ODOO_19);
    await run(setup);
    const old = text(setup, FILE);
    const configPath = join(setup.ctx.cwd, 'apaleo-odoo.config.yaml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8').replace('  journal: APA\n', '  journal: HOT\n'));
    expect((await run(setup)).findings.map((f) => f.code)).toContain('E-FILE-EXISTS');
    expect(text(setup, FILE)).toBe(old);

    expect((await run(setup, { overwrite: true })).status).toBe('replaced');
    const fresh = text(setup, FILE);
    expect(fresh.split('\n')[1]).toMatch(/^apaleo_c1_BSP_20260903_r2,apaleo BSP 2026-09-03 \(Korrektur 2\),2026-09-03,HOT,/);
    expect(fresh).not.toContain(',APA,');
    expect(manifest(setup).files.map((e) => [e.status, e.revision, e.odooJournal])).toEqual([
      ['replaced', 1, 'APA'],
      ['current', 2, 'HOT'],
    ]);
  });

  it('Config changed the rounding method: per_line then per_tax refuses with E-FILE-EXISTS because the fitted bases differ, and --overwrite replaces the file', async () => {
    const setup = germanMonth('version: 19', 'taxRounding: per_line', "roundingAccount: '2700'");
    await run(setup);
    const perLine = text(setup, FILE);
    const configPath = join(setup.ctx.cwd, 'apaleo-odoo.config.yaml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8').replace('taxRounding: per_line', 'taxRounding: per_tax'));
    const refused = await run(setup);
    expect(refused.findings.map((f) => f.code)).toContain('E-FILE-EXISTS');
    expect(text(setup, FILE)).toBe(perLine);

    expect((await run(setup, { overwrite: true })).status).toBe('replaced');
    const perTax = text(setup, FILE);
    expect(perTax).not.toBe(perLine);
    expect(perTax.replaceAll('_r2', '').replaceAll(' (Korrektur 2)', '')).toBe(readFileSync(REVISION_1, 'utf8'));
    expect(text(setup, PROTOCOL)).toContain('Rounding method: per_tax, rounding account 2700');
  });

  it('a dry run with --overwrite shows the import block of the next revision and writes nothing', async () => {
    const setup = germanMonth(...ODOO_19);
    await run(setup);
    latePosting(setup.data);
    const dry = await run(setup, { overwrite: true, dryRun: true });
    expect(dry.status).toBe('checked');
    expect(dry.plan).toBe('replace');
    expect(dry.summary).toContain('\n  Revision: 2 (Korrektur 2, new External IDs)');
    expect(manifest(setup).files.map((e) => e.revision)).toEqual([1]);
  });
});
