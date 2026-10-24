import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSource } from '../src/cli/source.js';
import { DEMO_PROPERTY, demoRun } from '../src/demo/index.js';
import { runExport } from '../src/export/index.js';
import { checkMapping, loadTemplate, parseMapping, renderMappingFile, suggestRows, type MappingRowValues } from '../src/mapping/index.js';
import { createTestContext } from './helpers/context.js';
import { readFixture } from './helpers/apaleo.js';
import { describeDifference } from './helpers/golden.js';
import { validateSwagger, type SwaggerSchema } from './helpers/swagger.js';

/**
 * `docs/examples/` shows a Treuhänder the output before any setup: what a real
 * export (not `--demo`, so without the DEMO marks) of the Swiss demo data in
 * `examples/demo/` writes. The demo data are fabricated in the shape of the
 * Swiss fixture month, but kept apart from it (a06 design decision 4), so
 * tests and docs can change separately. After an intended change to the
 * output, run `UPDATE_GOLDEN=1 pnpm test` and review the diff of docs/examples/.
 */
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const read = (path: string) => readFileSync(root(path));
const FILE = 'ABACUS_Buchungen_20260901-20260930_BSP.xml';
const PROTOCOL = 'ABACUS_Buchungen_20260901-20260930_BSP.protokoll.txt';
const DEMO_MAPPING = 'examples/demo/mapping-BSP.csv';
const EXAMPLE_MAPPING = 'docs/examples/mapping-BSP.example.csv';
const MAPPING_HEADER =
  'apaleo-abacus Kontenzuordnung der Demo Hotel Beispiel (BSP): was init-mapping --template kmu-hotel auf dem Kontenplan der Demo schreibt, ' +
  'nur die Kurtaxe-Zeile 3501 ist ausgefüllt. Die Konten sind Vorschläge der Vorlage, keine Empfehlung: lass sie von deinem Treuhänder prüfen.';
const KURTAXE = 'Demo, wie vom Treuhänder ausgefüllt: Kurtaxe als durchlaufender Posten auf 2210 ohne MWST-Code (ESTV MBI 08 Ziff. 7.11).';

function filesIn(dir: string): string[] {
  return readdirSync(root(dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root(dir), join(entry.parentPath, entry.name)))
    .sort();
}

/** A real export of September 2026 on the demo data: the demo's config, clock and recorded source, without `demo`. */
async function exportDemoData(): Promise<{ file: Buffer; protocol: Buffer }> {
  const { loaded, ctx } = await demoRun(createTestContext());
  const period = { from: '2026-09-01', to: '2026-09-30' } as const;
  const [outcome] = await runExport({ period, propertyIds: [DEMO_PROPERTY], dryRun: false, overwrite: false }, { loaded, source: createSource(loaded, ctx), ctx });
  expect(outcome?.status).toBe('written');
  // The Swiss demo books with the template codes 311, 312 and 313, so the export has nothing to report.
  expect(outcome?.findings).toEqual([]);
  const folder = join(ctx.cwd, 'demo-output', DEMO_PROPERTY, '2026-09');
  return { file: readFileSync(join(folder, FILE)), protocol: readFileSync(join(folder, PROTOCOL)) };
}

describe('docs/examples', () => {
  it('Treuhänder reviews before setup: holds the ABACUS_Buchungen file in CHF and the protocol a real export of the demo data writes', async () => {
    const { file, protocol } = await exportDemoData();
    if (UPDATE) {
      writeFileSync(root(`docs/examples/${FILE}`), file);
      writeFileSync(root(`docs/examples/${PROTOCOL}`), protocol);
    }
    const difference = describeDifference(read(`docs/examples/${FILE}`), file);
    expect(difference, `docs/examples/${FILE} differs from the current output:\n${difference}`).toBeUndefined();
    expect(read(`docs/examples/${PROTOCOL}`).toString('utf8')).toBe(protocol.toString('utf8'));
    const text = protocol.toString('utf8');
    expect(text).not.toMatch(/^DEMO/m);
    expect(text).toContain('Import into Abacus FIBU');
    expect(text).toContain('  Mandant: 7777, Geschäftsbereich 0, Leitwährung CHF');
    for (const line of ['  311 8.1 % (Ziffer 303): net', '  312 2.6 % (Ziffer 313): net', '  313 3.8 % (Ziffer 343): net']) expect(text).toContain(line);
    const xml = file.toString('utf8');
    expect(xml).not.toContain('DEMO');
    expect(xml).toContain('<KeyCurrency>CHF</KeyCurrency>');
    expect(xml).not.toContain('EUR');
    for (const code of ['311', '312', '313']) expect(xml).toContain(`<TaxCode>${code}</TaxCode>`);
  });

  it('holds the mapping of the demo: init-mapping --template kmu-hotel on the demo chart with only the Kurtaxe row filled in (2210, no MWST-Code)', async () => {
    const { loaded, ctx } = await demoRun(createTestContext());
    const accounts = await createSource(loaded, ctx).getChartOfAccounts(DEMO_PROPERTY);
    const suggested = suggestRows(accounts, await loadTemplate(), { mwstCodes: loaded.config.abacus.mwstCodes });
    const rows: MappingRowValues[] = suggested.map((row) => (row.apaleoAccount === '3501' ? { ...row, abacusAccount: '2210', comment: KURTAXE } : row));
    expect(rows.filter((row) => row.abacusAccount === '2210')).toHaveLength(1);
    const expected = Buffer.from(renderMappingFile([MAPPING_HEADER], rows));
    if (UPDATE) {
      writeFileSync(root(DEMO_MAPPING), expected);
      writeFileSync(root(EXAMPLE_MAPPING), expected);
    }
    expect(read(DEMO_MAPPING).equals(expected), 'run UPDATE_GOLDEN=1 pnpm test and review the diff').toBe(true);
    expect(read(EXAMPLE_MAPPING).equals(expected), `${EXAMPLE_MAPPING} must equal ${DEMO_MAPPING}`).toBe(true);
    const findings = checkMapping(parseMapping(expected, { path: 'mapping-BSP.example.csv' }));
    expect(findings.filter((f) => f.code.startsWith('E-'))).toEqual([]);
  });
});

describe('examples/demo', () => {
  const definitions = (readFixture('swagger-excerpt.json') as { definitions: Record<string, SwaggerSchema> }).definitions;
  const MODELS: [RegExp, string][] = [
    [/^export-gross-daily\/2026-09-\d{2}\.json$/, 'ExportGrossTransactionListModel'],
    [/^accounts-schema\.json$/, 'ChartOfAccountsModel'],
    [/^properties\/page-1\.json$/, 'PropertyListModel'],
  ];
  const files = filesIn('examples/demo/apaleo');

  it('holds recorded-shape apaleo responses for the Swiss Hotel Beispiel only: BSP, CHF, Europe/Zurich, September 2026', () => {
    expect(files.filter((file) => !MODELS.some(([pattern]) => pattern.test(file)))).toEqual([]);
    const { properties } = JSON.parse(read('examples/demo/apaleo/properties/page-1.json').toString('utf8')) as {
      properties: { id: string; name: string; currencyCode: string; timeZone: string; location: { countryCode: string } }[];
    };
    expect(properties.map((p) => [p.id, p.name, p.currencyCode, p.timeZone, p.location.countryCode])).toEqual([['BSP', 'Hotel Beispiel', 'CHF', 'Europe/Zurich', 'CH']]);
    for (const file of files.filter((name) => name.startsWith('export-gross-daily/'))) {
      const text = read(`examples/demo/apaleo/${file}`).toString('utf8');
      expect(text, file).not.toMatch(/"currency": "(?!CHF")/);
      expect(text, file).not.toMatch(/ENG/);
    }
  });

  it.each(files)('%s conforms to the Swagger excerpt', (file) => {
    const model = MODELS.find(([pattern]) => pattern.test(file))?.[1] ?? 'unknown';
    expect(validateSwagger(definitions, model, JSON.parse(read(`examples/demo/apaleo/${file}`).toString('utf8')))).toEqual([]);
  });
});
