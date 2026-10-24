import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run.js';
import type { SourceAccount } from '../../src/core/source.js';
import { encodeCp1252 } from '../../src/core/cp1252.js';
import { decodeCsv } from '../../src/mapping/csv.js';
import { checkMapping, parseMapping } from '../../src/mapping/index.js';
import { BSP, CLIENT_ID, FIXTURE_FILES, createApaleoContext, loadBeispielData } from '../helpers/apaleo.js';
import { createTestContext, type TestContext } from '../helpers/context.js';
import { FakeSource, type FakeSourceData } from '../helpers/fake-source.js';
import { GERMAN_CHART } from '../helpers/german-chart.js';
import { readMappingFixture } from '../helpers/mapping.js';

const CONFIG = FIXTURE_FILES['apaleo-odoo.config.yaml'];
const withVersion = (version: number) => CONFIG.replace('version: 18', `version: ${version}`);

/** A fake apaleo with the German test chart for property BSP. */
async function fakeContext(options: { config?: string; files?: Record<string, string>; extraAccounts?: SourceAccount[] } = {}) {
  const data: FakeSourceData = await loadBeispielData();
  data.charts[BSP] = [...GERMAN_CHART, ...(options.extraAccounts ?? [])];
  const fake = new FakeSource(data);
  const ctx = createTestContext({
    files: { 'apaleo-odoo.config.yaml': options.config ?? CONFIG, ...options.files },
    sourceFactory: () => fake,
  });
  return { ctx, fake };
}

const read = (ctx: TestContext, file = 'mapping-BSP.csv') => readFileSync(join(ctx.cwd, file));
const text = (ctx: TestContext, file?: string) => decodeCsv(read(ctx, file)).text;
const rowOf = (ctx: TestContext, account: string, file?: string) =>
  text(ctx, file)
    .split('\r\n')
    .find((line) => line.startsWith(`${account};`));

const SPA: SourceAccount = {
  number: 'RevenueSpa_Normal:19.00',
  name: 'Spa (19%)',
  type: 'Revenues',
  parentNumber: '5000',
  ledger: 'global',
  vat: { type: 'Normal', percent: 19 },
  isArchived: false,
  hasChildren: false,
};
const SPA_ROW =
  'RevenueSpa_Normal:19.00;Revenues;Spa (19%);19;8400;tax_ust_19_skr03;19;Vorschlag (ungeprüft): Erlöse 19 % USt (sonstige Leistungen, zum Beispiel Parken, Wellness, Speisen vor 2026). ' +
  'Quelle: Odoo l10n_de SKR03 (account.account-de_skr03.csv, account.tax-de_skr03.csv), Branches 17.0, 18.0 und 19.0, Kontonummern wie DATEV SKR 03 (apaleo-datev-export), geprüft 2026-10-24.';
const ACC7 = 'RevenueAccommodation_Reduced:7.00';
const SKR03 = ['--template', 'skr03-hotel'];

describe('apaleo-odoo init-mapping', () => {
  it('First run: writes mapping-BSP.csv with every leaf account from the SKR03 hotel template and prints mapped and unmapped counts', async () => {
    const { ctx, fake } = await fakeContext();
    expect(await runCli(['init-mapping', '--property', BSP, ...SKR03], ctx)).toBe(0);
    expect(fake.calls).toEqual([`getChartOfAccounts ${BSP}`]);

    const bytes = read(ctx);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text(ctx).split('\r\n')[0]).toBe(
      '# apaleo-odoo Kontenzuordnung, Vorlage skr03-hotel@2 für Odoo 18 (Kasse 1001, Geldtransit 1360 wie in einer frischen Datenbank). ' +
        'Alle Vorschläge mit deinem Steuerberater prüfen. Spalten odoo_account und odoo_tax in Excel als Text formatieren.',
    );
    expect(text(ctx).split('\r\n')[1]).toBe('apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;odoo_account;odoo_tax;tax_percent;comment');
    const mapping = parseMapping(bytes, { path: 'x' });
    const accounts = mapping.rows.filter((r) => r.apaleoAccount !== '*').map((r) => r.apaleoAccount);
    expect(accounts).toEqual([
      ACC7,
      'RevenueAccommodation_Without:0.00',
      'RevenueAccommodation_Normal:16.00',
      'RevenueAccommodation_Reduced:5.00',
      'RevenueFoodAndBeverages_Reduced:7.00',
      'RevenueFoodAndBeverages_Normal:19.00',
      'RevenueOther_Normal:19.00',
      'RevenueOther_Reduced:7.00',
      'RevenueNoShow_Reduced:7.00',
      'RevenueNoShow_Without:0.00',
      'RevenueCancellationFees_Reduced:7.00',
      'RevenueCancellationFees_Without:0.00',
      '5011',
      '5111',
      '5020',
      '1102',
      '1104',
      '1600',
      '1200',
      'Vat_Reduced:7.00',
      'Vat_Normal:19.00',
      '9000',
      'CollectiveDebitor_AccountsReceivable',
      '3501',
      '7000',
      'LiabilitiesVat_Reduced:7.00',
    ]);
    expect(rowOf(ctx, ACC7)).toMatch(/^RevenueAccommodation_Reduced:7\.00;Revenues;Revenues Accommodation \(7%\);7;8300;tax_ust_7_skr03;7;Vorschlag \(ungeprüft\): Erlöse 7 % USt/);
    expect(rowOf(ctx, '1600')).toMatch(/^1600;Payments;Cash Payment;;1001;;;Vorschlag \(ungeprüft\): Kasse/);
    expect(rowOf(ctx, '3501')).toMatch(/^3501;CityTaxes;Kurtaxe;0;;;;Vorschlag \(ungeprüft\): bitte mit der Kanzlei entscheiden/);

    expect(ctx.out()).toContain(`Wrote ${join(ctx.cwd, 'mapping-BSP.csv')} from template skr03-hotel@2 for property BSP and Odoo 18.`);
    expect(ctx.out()).toContain('37 rows: 26 mapped, 8 unmapped, 3 VAT account row(s) that need no Odoo account.');
    expect(ctx.out()).toContain('have your Steuerberater check the file, compare the Kasse and Geldtransit codes with the Kontenplan');
    // The template output passes the mapping check without an error.
    expect(checkMapping(mapping, { version: 18 }).filter((f) => f.code.startsWith('E-'))).toEqual([]);
  });

  it('writes the SKR04 accounts and the generated accounts of odoo.version with --template skr04-hotel', async () => {
    const { ctx } = await fakeContext({ config: withVersion(17) });
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'skr04-hotel'], ctx)).toBe(0);
    expect(rowOf(ctx, ACC7)).toContain(';4300;tax_ust_7_skr04;7;');
    expect(rowOf(ctx, '1600')).toContain(';1601;;;');
    expect(rowOf(ctx, '1102')).toContain(';14601;;;');
    expect(text(ctx).split('\r\n')[0]).toContain('Vorlage skr04-hotel@2 für Odoo 17 (Kasse 1601, Geldtransit 14601');
  });

  it('reads the chart through the apaleo API (ctx.fetchFn)', async () => {
    const ctx = createApaleoContext();
    expect(await runCli(['init-mapping', '--property', BSP, ...SKR03, '--out', 'maps/bsp.csv'], ctx)).toBe(0);
    expect(rowOf(ctx, '1102', 'maps/bsp.csv')).toMatch(/^1102;Payments;Visa Credit Card Payment;;1360;/);
    expect(ctx.fetchCalls.some((call) => call.includes('/finance/v1/accounts/schema'))).toBe(true);
    expect(text(ctx, 'maps/bsp.csv')).not.toContain(CLIENT_ID);
  });

  it('writes to properties[].mapping when the config names one', async () => {
    const { ctx } = await fakeContext({ config: `${CONFIG}properties:\n  - id: BSP\n    mapping: ./mappings/hotel.csv\n` });
    expect(await runCli(['init-mapping', '--property', BSP, ...SKR03], ctx)).toBe(0);
    expect(rowOf(ctx, '1102', 'mappings/hotel.csv')).toBeDefined();
  });

  it('Existing file without update: exits 1 and writes nothing', async () => {
    const { ctx, fake } = await fakeContext({ files: { 'mapping-BSP.csv': 'edited by hand' } });
    expect(await runCli(['init-mapping', '--property', BSP, ...SKR03], ctx)).toBe(1);
    expect(read(ctx).toString()).toBe('edited by hand');
    expect(ctx.err()).toContain('already exists and was not changed');
    expect(ctx.err()).toContain('--update');
    expect(fake.calls).toEqual([]);
  });

  it('Update keeps edits: edited rows stay byte for byte and a row for the new account is appended and listed', async () => {
    const first = await fakeContext();
    expect(await runCli(['init-mapping', '--property', BSP, ...SKR03], first.ctx)).toBe(0);
    const editedRow = `${ACC7};Revenues;Revenues Accommodation (7%);7;8301;tax_ust_7_skr03;7;Kanzlei: eigenes Konto`;
    const edited = text(first.ctx).replace(/^RevenueAccommodation_Reduced:7\.00;.*$/m, editedRow);
    const original = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(edited)]);

    const { ctx } = await fakeContext({ files: {}, extraAccounts: [SPA] });
    await ctx.fs.writeFile(join(ctx.cwd, 'mapping-BSP.csv'), original);
    expect(await runCli(['init-mapping', '--property', BSP, ...SKR03, '--update'], ctx)).toBe(0);

    const updated = read(ctx);
    expect(updated.subarray(0, original.length).equals(original)).toBe(true);
    expect(decodeCsv(updated.subarray(original.length)).text).toBe(`${SPA_ROW}\r\n`);
    expect(rowOf(ctx, ACC7)).toBe(editedRow);
    expect(ctx.out()).toContain('Added 1 row(s) for new apaleo accounts:');
    expect(ctx.out()).toMatch(/RevenueSpa_Normal:19\.00\s+Revenues\s+Spa \(19%\)\s+19 %\s+8400/);
  });

  it('Update notes a new suggestion: an empty no-show row of a skr03-hotel@1 file stays unchanged and N-TEMPLATE-SUGGESTION names it with 8300 / tax_ust_7_skr03', async () => {
    const { ctx } = await fakeContext();
    expect(await runCli(['init-mapping', '--property', BSP, ...SKR03], ctx)).toBe(0);
    const emptyRow = 'RevenueNoShow_Reduced:7.00;Revenues;Revenues No-show (7%);7;;;;von Hand geleert';
    const old = text(ctx).replace('skr03-hotel@2', 'skr03-hotel@1').replace(/^RevenueNoShow_Reduced:7\.00;.*$/m, emptyRow);
    const before = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(old)]);
    await ctx.fs.writeFile(join(ctx.cwd, 'mapping-BSP.csv'), before);
    const line = old.split('\r\n').indexOf(emptyRow) + 1;

    expect(await runCli(['init-mapping', '--property', BSP, ...SKR03, '--update'], ctx)).toBe(0);
    expect(read(ctx).equals(before)).toBe(true);
    expect(ctx.out()).toContain('No new apaleo accounts');
    const notes = ctx.out().split('\n').filter((l) => l.startsWith('N-TEMPLATE-SUGGESTION'));
    expect(notes).toEqual([
      `N-TEMPLATE-SUGGESTION (odoo_account): line ${line} (RevenueNoShow_Reduced:7.00 Revenues 7 %) has no Odoo account, and the template skr03-hotel@2 now suggests ` +
        '8300 / tax_ust_7_skr03 (7 %). The row was not changed: check the suggestion with your Steuerberater and fill it in by hand, then run "apaleo-odoo mapping check"',
    ]);
  });

  it('--update says so when there is nothing new', async () => {
    const { ctx } = await fakeContext();
    expect(await runCli(['init-mapping', '--property', BSP, ...SKR03], ctx)).toBe(0);
    const before = read(ctx);
    expect(await runCli(['init-mapping', '--property', BSP, ...SKR03, '--update'], ctx)).toBe(0);
    expect(read(ctx).equals(before)).toBe(true);
    expect(ctx.out()).toContain('No new apaleo accounts');
  });

  it('--update appends in the encoding, separator and line breaks of a file Excel saved', async () => {
    const saved = `apaleo_account,apaleo_type,odoo_account,odoo_tax,tax_percent,comment\n${ACC7},Revenues,8300,tax_ust_7_skr03,"7,0",Logis für Gäste\n`;
    const { ctx } = await fakeContext({ extraAccounts: [SPA] });
    await ctx.fs.writeFile(join(ctx.cwd, 'mapping-BSP.csv'), encodeCp1252(saved).bytes);
    expect(await runCli(['init-mapping', '--property', BSP, ...SKR03, '--update'], ctx)).toBe(0);
    const decoded = decodeCsv(read(ctx));
    expect(decoded.encoding).toBe('windows-1252');
    expect(decoded.text.startsWith(saved)).toBe(true);
    expect(decoded.text).toContain('\nRevenueSpa_Normal:19.00,Revenues,8400,tax_ust_19_skr03,19,"Vorschlag (ungeprüft): Erlöse 19 % USt (sonstige Leistungen, zum Beispiel Parken, Wellness, Speisen vor 2026).');
    expect(decoded.text).not.toContain('\r');
  });

  it('--update refuses a BMD mapping file and names --template skr03-hotel, changing nothing', async () => {
    const bmd = decodeCsv(readMappingFixture('ekr-beispiel.csv')).text;
    const { ctx, fake } = await fakeContext({ files: { 'mapping-BSP.csv': bmd } });
    expect(await runCli(['init-mapping', '--property', BSP, ...SKR03, '--update'], ctx)).toBe(1);
    expect(ctx.err()).toContain('this is a BMD mapping');
    expect(ctx.err()).toContain('--template skr03-hotel');
    expect(decodeCsv(read(ctx)).text).toBe(bmd);
    expect(fake.calls).toEqual([]);
  });

  it('--update appends below a header whose cells are all quoted', async () => {
    const quoted =
      '"apaleo_account";"apaleo_type";"apaleo_name";"apaleo_vat_percent";"odoo_account";"odoo_tax";"tax_percent";"comment"\r\n' +
      `"${ACC7}";"Revenues";"Revenues Accommodation (7%)";"7";"8300";"tax_ust_7_skr03";"7";""\r\n`;
    const { ctx } = await fakeContext({ files: { 'mapping-BSP.csv': quoted }, extraAccounts: [SPA] });
    expect(await runCli(['init-mapping', '--property', BSP, ...SKR03, '--update'], ctx)).toBe(0);
    const mapping = parseMapping(read(ctx), { path: 'x' });
    expect(mapping.rows.find((r) => r.apaleoAccount === SPA.number)).toMatchObject({ apaleoType: 'Revenues', odooAccount: '8400', odooTax: 'tax_ust_19_skr03' });
    expect(mapping.rows.find((r) => r.apaleoAccount === ACC7)).toMatchObject({ odooAccount: '8300' });
  });

  it.each([
    [['init-mapping', ...SKR03], '--property'],
    [['init-mapping', '--property', BSP], 'init-mapping needs --template skr03-hotel or skr04-hotel'],
    [['init-mapping', '--property', BSP, '--template', 'kmu-hotel'], 'Unknown template "kmu-hotel". --template must be skr03-hotel or skr04-hotel'],
    [['init-mapping', '--property', BSP, ...SKR03, '--accounts-from', 'konten.csv'], '--accounts-from'],
  ])('Old template: exits 2 on %j', async (argv, message) => {
    const { ctx } = await fakeContext();
    expect(await runCli(argv, ctx)).toBe(2);
    expect(ctx.err()).toContain(message);
  });

  it('BER with the KMU template: the old template is refused and no mapping file is written', async () => {
    const { ctx } = await fakeContext();
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'kmu-hotel'], ctx)).toBe(2);
    expect(existsSync(join(ctx.cwd, `mapping-${BSP}.csv`))).toBe(false);
  });

  it('lists skr03-hotel and skr04-hotel in its help, and no --accounts-from', async () => {
    const ctx = createTestContext();
    expect(await runCli(['init-mapping', '--help'], ctx)).toBe(0);
    expect(ctx.out()).toContain('skr03-hotel');
    expect(ctx.out()).toContain('skr04-hotel');
    expect(ctx.out()).not.toContain('--accounts-from');
  });

  it('exits 2 naming the unknown flag --skr of the DATEV tool', async () => {
    const { ctx } = await fakeContext();
    expect(await runCli(['init-mapping', '--property', BSP, '--skr', '03'], ctx)).toBe(2);
    expect(ctx.err()).toContain('--skr');
  });
});

describe('init-mapping on the recorded BER chart', () => {
  const FIXTURE = new URL('../fixtures/apaleo/live/BER/mapping-BER.odoo.csv', import.meta.url);
  const HEADER =
    'apaleo-odoo Kontenzuordnung für die aufgezeichneten Sandbox-Daten BER: was init-mapping --template skr03-hotel für Odoo 18 auf dem BER-Kontenplan schreibt ' +
    '(Kasse 1001, Geldtransit 1360). Der BER-Kontenplan hat kein Kurtaxe-Konto, also auch keine Kurtaxe-Zeile. Nur für die Regressionstests.';
  const liveContext = (version = 18) =>
    createApaleoContext({ live: true }, { files: { 'apaleo-odoo.config.yaml': withVersion(version) } });

  it('writes the committed BER mapping with the SKR03 template: only the header comment differs', async () => {
    const ctx = liveContext();
    expect(await runCli(['init-mapping', '--property', 'BER', ...SKR03], ctx)).toBe(0);
    const written = text(ctx, 'mapping-BER.csv').split('\r\n');
    const committed = decodeCsv(readFileSync(FIXTURE)).text.split('\r\n');
    if (process.env.UPDATE_GOLDEN === '1') writeFileSync(FIXTURE, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from([`# ${HEADER}`, ...written.slice(1)].join('\r\n'))]));
    expect(committed[0]).toBe(`# ${HEADER}`);
    expect(committed.slice(1)).toEqual(written.slice(1));
  });

  it('SKR04 deposits and generated accounts by Odoo version through the CLI', async () => {
    const v17 = liveContext(17);
    expect(await runCli(['init-mapping', '--property', 'BER', '--template', 'skr04-hotel'], v17)).toBe(0);
    expect(text(v17, 'mapping-BER.csv')).toContain('*;Liabilities;;7;3260;tax_ust_7_skr04;7;');
    expect(text(v17, 'mapping-BER.csv')).toContain('*;Liabilities;;19;3272;tax_ust_19_skr04;19;');
    expect(text(v17, 'mapping-BER.csv')).toContain('*;Liabilities;;0;3280;;0;');
    expect(rowOf(v17, '1102', 'mapping-BER.csv')).toContain(';14601;;;');
    const v19 = liveContext(19);
    expect(await runCli(['init-mapping', '--property', 'BER', ...SKR03], v19)).toBe(1);
    expect(v19.err()).toContain('odoo.roundingAccount: is required');
  });
});
