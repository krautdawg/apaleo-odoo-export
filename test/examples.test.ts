import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSource } from '../src/cli/source.js';
import { DEMO_PROPERTY, demoRun } from '../src/demo/index.js';
import { runExport } from '../src/export/index.js';
import { checkMapping, loadTemplate, parseMapping, renderMappingFile, suggestRows, type MappingRowValues } from '../src/mapping/index.js';
import { createTestContext } from './helpers/context.js';
import { KANZLEI_ROWS } from './helpers/de-month.js';
import { readFixture } from './helpers/apaleo.js';
import { describeUtf8Difference } from './helpers/golden.js';
import { validateSwagger, type SwaggerSchema } from './helpers/swagger.js';

/**
 * `docs/examples/` shows a Steuerberater the output before any setup: what a
 * real export (not `--demo`, so without the DEMO marks) of the German demo data
 * in `examples/demo/` writes. The demo data are a copy of the German fixture
 * month (`test/fixtures/apaleo/de-month/`), and the demo config is Odoo 19
 * with `per_tax` and the rounding account 2700. After an intended change to the
 * output, run `UPDATE_GOLDEN=1 pnpm test` and review the diff of docs/examples/.
 */
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const read = (path: string) => readFileSync(root(path));
const FILE = 'ODOO_Buchungen_20260901-20260930_BSP.csv';
const PROTOCOL = 'ODOO_Buchungen_20260901-20260930_BSP.protokoll.txt';
const DEMO_MAPPING = 'examples/demo/mapping-BSP.csv';
const EXAMPLE_MAPPING = 'docs/examples/mapping-BSP.example.csv';
const MAPPING_HEADER =
  'apaleo-odoo Kontenzuordnung der Demo Hotel Beispiel Berlin (BSP): was init-mapping --template skr03-hotel für Odoo 19 auf dem Kontenplan der Demo schreibt ' +
  '(Kasse 1001, Geldtransit 1360), mit Kurtaxe (3501) und Übernachtungsteuer (3502), wie die Kanzlei sie ausgefüllt hat. ' +
  'Die Konten und Steuern sind Vorschläge der Vorlage, keine Empfehlung: lass sie von deinem Steuerberater prüfen.';

function filesIn(dir: string): string[] {
  return readdirSync(root(dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root(dir), join(entry.parentPath, entry.name)))
    .sort();
}

/** A real export of September 2026 on the demo data: the demo's config, clock and recorded source, without `demo`. */
async function exportDemoData(): Promise<{ file: Buffer; protocol: Buffer; findings: string[] }> {
  const { loaded, ctx } = await demoRun(createTestContext());
  const period = { from: '2026-09-01', to: '2026-09-30' } as const;
  const [outcome] = await runExport({ period, propertyIds: [DEMO_PROPERTY], dryRun: false, overwrite: false }, { loaded, source: createSource(loaded, ctx), ctx });
  expect(outcome?.status).toBe('written');
  const folder = join(ctx.cwd, 'demo-output', DEMO_PROPERTY, '2026-09');
  return { file: readFileSync(join(folder, FILE)), protocol: readFileSync(join(folder, PROTOCOL)), findings: outcome?.findings.map((f) => f.code) ?? [] };
}

describe('docs/examples', () => {
  it('Steuerberater reviews before setup: holds the ODOO_Buchungen file in EUR and the protocol a real export of the demo data writes', async () => {
    const { file, protocol, findings } = await exportDemoData();
    // The Kanzlei's Übernachtungsteuer row books a levy with tax (a warning to confirm it); the base fitting notes its rounding cents.
    expect(new Set(findings)).toEqual(new Set(['W-CITY-TAX-TAXED', 'N-ODOO-ROUNDING-LINE']));
    if (UPDATE) {
      writeFileSync(root(`docs/examples/${FILE}`), file);
      writeFileSync(root(`docs/examples/${PROTOCOL}`), protocol);
    }
    const difference = describeUtf8Difference(read(`docs/examples/${FILE}`), file);
    expect(difference, `docs/examples/${FILE} differs from the current output:\n${difference}`).toBeUndefined();
    expect(read(`docs/examples/${PROTOCOL}`).toString('utf8')).toBe(protocol.toString('utf8'));
    const text = protocol.toString('utf8');
    expect(text).not.toMatch(/^DEMO/m);
    expect(text).toContain('Import into Odoo Accounting');
    expect(text).toContain('  Company: id 1 (odoo.companyId, the company that owns the taxes), journal APA, currency EUR');
    expect(text).toContain('  Rounding method: per_tax, rounding account 2700; must equal Settings > Accounting > Taxes > Rounding Method ("Round per Tax")');
    for (const line of ['  tax_ust_7_skr03 7 % (Kz 86): net', '  tax_ust_19_skr03 19 % (Kz 81): net']) expect(text).toContain(line);
    const csv = file.toString('utf8');
    expect(csv).not.toContain('DEMO');
    for (const tax of ['account.1_tax_ust_7_skr03', 'account.1_tax_ust_19_skr03']) expect(csv).toContain(tax);
    // At least one rounding-account line (design decision 2), and the Kurtaxe as a durchlaufender Posten on 1590.
    expect(csv).toMatch(/,2700,Rundungsausgleich USt 7 %,0\.00,0\.01,\n/);
    expect(csv).toMatch(/,1590,Kurtaxe,0\.00,5\.00,\n/);
  });

  it('is the golden file of the writer: the same bytes as test/golden/odoo/de-month.per-tax.csv', () => {
    expect(read(`docs/examples/${FILE}`).equals(read('test/golden/odoo/de-month.per-tax.csv'))).toBe(true);
  });

  it('holds the mapping of the demo: init-mapping --template skr03-hotel on the demo chart for Odoo 19, with the levy rows as the Kanzlei filled them in', async () => {
    const { loaded, ctx } = await demoRun(createTestContext());
    expect(loaded.config.odoo).toMatchObject({ journal: 'APA', version: 19, taxRounding: 'per_tax', roundingAccount: '2700', currency: 'EUR' });
    const accounts = await createSource(loaded, ctx).getChartOfAccounts(DEMO_PROPERTY);
    const template: MappingRowValues[] = suggestRows(accounts, await loadTemplate('skr03-hotel'), { version: loaded.config.odoo.version });
    const rows = template.map((row) => ({ ...row, ...KANZLEI_ROWS[row.apaleoAccount] }));
    expect(rows.filter((row) => row.apaleoType === 'Payments').map((row) => row.odooAccount)).toEqual(expect.arrayContaining(['1001', '1360']));
    expect(rows.find((row) => row.apaleoAccount === '3501')).toMatchObject({ odooAccount: '1590', odooTax: '', taxPercent: '' });
    const expected = Buffer.from(renderMappingFile([MAPPING_HEADER], rows));
    if (UPDATE) {
      writeFileSync(root(DEMO_MAPPING), expected);
      writeFileSync(root(EXAMPLE_MAPPING), expected);
    }
    expect(read(DEMO_MAPPING).equals(expected), 'run UPDATE_GOLDEN=1 pnpm test and review the diff').toBe(true);
    expect(read(EXAMPLE_MAPPING).equals(expected), `${EXAMPLE_MAPPING} must equal ${DEMO_MAPPING}`).toBe(true);
    const findings = checkMapping(parseMapping(expected, { path: 'mapping-BSP.example.csv' }), { version: 19 });
    expect(findings.filter((f) => f.code.startsWith('E-'))).toEqual([]);
  });

  it('has no file of the Abacus target left', () => {
    expect(filesIn('docs/examples').filter((file) => /abacus|\.xml$/i.test(file))).toEqual([]);
    expect(filesIn('docs/examples')).toEqual(['ODOO_Buchungen_20260901-20260930_BSP.csv', 'ODOO_Buchungen_20260901-20260930_BSP.protokoll.txt', 'README.md', 'mapping-BSP.example.csv']);
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

  it('is the German fixture month: every file equals test/fixtures/apaleo/de-month/', () => {
    expect(files).toEqual(filesIn('test/fixtures/apaleo/de-month').filter((file) => file !== 'README.md'));
    for (const file of files) expect(read(`examples/demo/apaleo/${file}`).equals(read(`test/fixtures/apaleo/de-month/${file}`)), file).toBe(true);
  });

  it('holds recorded-shape apaleo responses for the German Hotel Beispiel Berlin only: BSP, EUR, Europe/Berlin, September 2026', () => {
    expect(files.filter((file) => !MODELS.some(([pattern]) => pattern.test(file)))).toEqual([]);
    const { properties } = JSON.parse(read('examples/demo/apaleo/properties/page-1.json').toString('utf8')) as {
      properties: { id: string; name: string; currencyCode: string; timeZone: string; location: { countryCode: string } }[];
    };
    expect(properties.map((p) => [p.id, p.name, p.currencyCode, p.timeZone, p.location.countryCode])).toEqual([['BSP', 'Hotel Beispiel Berlin', 'EUR', 'Europe/Berlin', 'DE']]);
    for (const file of files.filter((name) => name.startsWith('export-gross-daily/'))) {
      const text = read(`examples/demo/apaleo/${file}`).toString('utf8');
      expect(text, file).not.toMatch(/"currency": "(?!EUR")/);
    }
  });

  it.each(files)('%s conforms to the Swagger excerpt', (file) => {
    const model = MODELS.find(([pattern]) => pattern.test(file))?.[1] ?? 'unknown';
    expect(validateSwagger(definitions, model, JSON.parse(read(`examples/demo/apaleo/${file}`).toString('utf8')))).toEqual([]);
  });
});
