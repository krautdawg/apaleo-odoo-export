import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run.js';
import type { SourceAccount } from '../../src/core/source.js';
import { encodeCp1252 } from '../../src/core/cp1252.js';
import { decodeCsv } from '../../src/mapping/csv.js';
import { CARRIED_OVER_COMMENT, checkMapping, parseMapping, renderMappingFile, type MappingRowValues } from '../../src/mapping/index.js';
import { BSP, CLIENT_ID, ENG, FIXTURE_FILES, createApaleoContext, loadBeispielData } from '../helpers/apaleo.js';
import { createTestContext, type TestContext } from '../helpers/context.js';
import { FakeSource, type FakeSourceData } from '../helpers/fake-source.js';
import { readMappingFixture } from '../helpers/mapping.js';
import { SWISS_CHART } from '../helpers/swiss-chart.js';

const CONFIG = FIXTURE_FILES['apaleo-abacus.config.yaml'];

/** A fake apaleo with the Swiss test chart for property BSP. */
async function fakeContext(options: { config?: string; files?: Record<string, string>; extraAccounts?: SourceAccount[] } = {}) {
  const data: FakeSourceData = await loadBeispielData();
  data.charts[BSP] = [...SWISS_CHART, ...(options.extraAccounts ?? [])];
  const fake = new FakeSource(data);
  const ctx = createTestContext({
    files: { 'apaleo-abacus.config.yaml': options.config ?? CONFIG, ...options.files },
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
  number: 'RevenueSpa_Normal:8.10',
  name: 'Spa (8.1%)',
  type: 'Revenues',
  parentNumber: '5000',
  ledger: 'global',
  vat: { type: 'Normal', percent: 8.1 },
  isArchived: false,
  hasChildren: false,
};
const SPA_ROW =
  'RevenueSpa_Normal:8.10;Revenues;Spa (8.1%);8.1;3500;311;8.1;;Vorschlag (ungeprüft): übrige Hotelleistungen zum Normalsatz 8,1 % (zum Beispiel Minibar, Parking, Wellness, Telefon, ESTV MBI 08 Ziff. 6.2 und 7.6).';
const ACC38 = 'RevenueAccommodation_Special:3.80';
const withCodes = (lines: string) => CONFIG.replace('  mandant: 1234\n', `  mandant: 1234\n${lines}`);

describe('apaleo-abacus init-mapping', () => {
  it('First run: writes mapping-BSP.csv with every leaf account from the KMU hotel template and prints mapped and unmapped counts', async () => {
    const { ctx, fake } = await fakeContext();
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'kmu-hotel'], ctx)).toBe(0);
    expect(fake.calls).toEqual([`getChartOfAccounts ${BSP}`]);

    const bytes = read(ctx);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text(ctx).split('\r\n')[0]).toBe(
      '# apaleo-abacus Kontenzuordnung, Vorlage kmu-hotel@1, MWST-Codes 311 (8,1 %), 312 (2,6 %), 313 (3,8 %). ' +
        'Alle Vorschläge mit dem Treuhänder prüfen. Spalten abacus_account und mwst_code in Excel als Text formatieren.',
    );
    expect(text(ctx).split('\r\n')[1]).toBe('apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;abacus_account;mwst_code;mwst_percent;kost;comment');
    const mapping = parseMapping(bytes, { path: 'x' });
    const accounts = mapping.rows.filter((r) => r.apaleoAccount !== '*').map((r) => r.apaleoAccount);
    expect(accounts).toEqual([
      ACC38,
      'RevenueAccommodation_Without:0.00',
      'RevenueAccommodation_Special:3.70',
      'RevenueFoodAndBeverages_Normal:8.10',
      'RevenueFoodAndBeverages_Reduced:2.60',
      'RevenueOther_Normal:8.10',
      'RevenueNoShow_Special:3.80',
      'RevenueNoShow_Without:0.00',
      '5011',
      '5111',
      '1102',
      '1114',
      '1600',
      '1200',
      'Vat_Special:3.80',
      'Vat_Normal:8.10',
      '9000',
      'CollectiveDebitor_AccountsReceivable',
      '3501',
      '7000',
      'LiabilitiesVat_Special:3.80',
    ]);
    expect(rowOf(ctx, ACC38)).toMatch(/^RevenueAccommodation_Special:3\.80;Revenues;Revenues Accommodation \(3\.8%\);3\.8;3400;313;3\.8;;Vorschlag \(ungeprüft\): Beherbergung/);
    expect(rowOf(ctx, '3501')).toMatch(/^3501;CityTaxes;Kurtaxe;0;;;;;"Vorschlag \(ungeprüft\): bitte entscheiden/);

    expect(ctx.out()).toContain(`Wrote ${join(ctx.cwd, 'mapping-BSP.csv')} from template kmu-hotel@1 for property BSP.`);
    expect(ctx.out()).toContain('32 rows: 24 mapped, 5 unmapped, 3 VAT account row(s) that need no Abacus account.');
    expect(ctx.out()).toContain('have your Treuhänder check the file');
    // The template output passes the mapping check without an error.
    expect(checkMapping(mapping).filter((f) => f.code.startsWith('E-'))).toEqual([]);
  });

  it('takes the KMU hotel template when --template is left out', async () => {
    const { ctx } = await fakeContext();
    expect(await runCli(['init-mapping', '--property', BSP], ctx)).toBe(0);
    expect(rowOf(ctx, ACC38)).toContain(';3400;313;3.8;');
  });

  it('Codes from the config: writes abacus.mwstCodes into the rows and the header comment', async () => {
    const { ctx } = await fakeContext({ config: withCodes('  mwstCodes:\n    normal: V81\n    reduziert: V26\n    beherbergung: V38\n') });
    expect(await runCli(['init-mapping', '--property', BSP], ctx)).toBe(0);
    expect(rowOf(ctx, ACC38)).toContain(';3400;V38;3.8;');
    expect(rowOf(ctx, 'RevenueOther_Normal:8.10')).toContain(';3500;V81;8.1;');
    expect(rowOf(ctx, 'RevenueFoodAndBeverages_Reduced:2.60')).toContain(';3260;V26;2.6;');
    expect(text(ctx)).toContain('*;Liabilities;;3.8;2030;V38;3.8;');
    expect(text(ctx).split('\r\n')[0]).toContain('MWST-Codes V81 (8,1 %), V26 (2,6 %), V38 (3,8 %)');
  });

  it('reads the chart through the apaleo API (ctx.fetchFn)', async () => {
    const ctx = createApaleoContext();
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'kmu-hotel', '--out', 'maps/bsp.csv'], ctx)).toBe(0);
    expect(rowOf(ctx, '1102', 'maps/bsp.csv')).toMatch(/^1102;Payments;Visa Credit Card Payment;;1090;/);
    expect(ctx.fetchCalls.some((call) => call.includes('/finance/v1/accounts/schema'))).toBe(true);
    expect(text(ctx, 'maps/bsp.csv')).not.toContain(CLIENT_ID);
  });

  it('writes to properties[].mapping when the config names one', async () => {
    const { ctx } = await fakeContext({ config: `${CONFIG}properties:\n  - id: BSP\n    mapping: ./mappings/hotel.csv\n` });
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'kmu-hotel'], ctx)).toBe(0);
    expect(rowOf(ctx, '1102', 'mappings/hotel.csv')).toBeDefined();
  });

  it('Existing file without update: exits 1 and writes nothing', async () => {
    const { ctx, fake } = await fakeContext({ files: { 'mapping-BSP.csv': 'edited by hand' } });
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'kmu-hotel'], ctx)).toBe(1);
    expect(read(ctx).toString()).toBe('edited by hand');
    expect(ctx.err()).toContain('already exists and was not changed');
    expect(ctx.err()).toContain('--update');
    expect(fake.calls).toEqual([]);
  });

  it('Update keeps edits: edited rows stay byte for byte and a row for the new account is appended and listed', async () => {
    const first = await fakeContext();
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'kmu-hotel'], first.ctx)).toBe(0);
    const editedRow = `${ACC38};Revenues;Revenues Accommodation (3.8%);3.8;3410;313;3.8;10;Treuhänder: eigenes Konto`;
    const edited = text(first.ctx).replace(/^RevenueAccommodation_Special:3\.80;.*$/m, editedRow);
    const original = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(edited)]);

    const { ctx } = await fakeContext({ files: {}, extraAccounts: [SPA] });
    await ctx.fs.writeFile(join(ctx.cwd, 'mapping-BSP.csv'), original);
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'kmu-hotel', '--update'], ctx)).toBe(0);

    const updated = read(ctx);
    expect(updated.subarray(0, original.length).equals(original)).toBe(true);
    expect(decodeCsv(updated.subarray(original.length)).text).toBe(`${SPA_ROW}\r\n`);
    expect(rowOf(ctx, ACC38)).toBe(editedRow);
    expect(ctx.out()).toContain('Added 1 row(s) for new apaleo accounts:');
    expect(ctx.out()).toMatch(/RevenueSpa_Normal:8\.10\s+Revenues\s+Spa \(8\.1%\)\s+8\.1 %\s+3500/);
  });

  it('--update says so when there is nothing new', async () => {
    const { ctx } = await fakeContext();
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'kmu-hotel'], ctx)).toBe(0);
    const before = read(ctx);
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'kmu-hotel', '--update'], ctx)).toBe(0);
    expect(read(ctx).equals(before)).toBe(true);
    expect(ctx.out()).toContain('No new apaleo accounts');
  });

  it('--update appends in the encoding, separator and line breaks of a file Excel saved', async () => {
    const saved = `apaleo_account,apaleo_type,abacus_account,mwst_code,mwst_percent,comment\n${ACC38},Revenues,3400,313,"3,8",Logis für Gäste\n`;
    const { ctx } = await fakeContext({ extraAccounts: [SPA] });
    await ctx.fs.writeFile(join(ctx.cwd, 'mapping-BSP.csv'), encodeCp1252(saved).bytes);
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'kmu-hotel', '--update'], ctx)).toBe(0);
    const decoded = decodeCsv(read(ctx));
    expect(decoded.encoding).toBe('windows-1252');
    expect(decoded.text.startsWith(saved)).toBe(true);
    expect(decoded.text).toContain(
      '\nRevenueSpa_Normal:8.10,Revenues,3500,311,8.1,"Vorschlag (ungeprüft): übrige Hotelleistungen zum Normalsatz 8,1 % (zum Beispiel Minibar, Parking, Wellness, Telefon, ESTV MBI 08 Ziff. 6.2 und 7.6)."\n',
    );
    expect(decoded.text).not.toContain('\r');
  });

  it('--update refuses a BMD mapping file and names --template kmu-hotel, changing nothing', async () => {
    const bmd = decodeCsv(readMappingFixture('ekr-beispiel.csv')).text;
    const { ctx, fake } = await fakeContext({ files: { 'mapping-BSP.csv': bmd } });
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'kmu-hotel', '--update'], ctx)).toBe(1);
    expect(ctx.err()).toContain('this is a BMD mapping');
    expect(ctx.err()).toContain('--template kmu-hotel');
    expect(decodeCsv(read(ctx)).text).toBe(bmd);
    expect(fake.calls).toEqual([]);
  });

  it('--update appends below a header whose cells are all quoted', async () => {
    const quoted =
      '"apaleo_account";"apaleo_type";"apaleo_name";"apaleo_vat_percent";"abacus_account";"mwst_code";"mwst_percent";"kost";"comment"\r\n' +
      `"${ACC38}";"Revenues";"Revenues Accommodation (3.8%)";"3.8";"3400";"313";"3.8";"";""\r\n`;
    const { ctx } = await fakeContext({ files: { 'mapping-BSP.csv': quoted }, extraAccounts: [SPA] });
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'kmu-hotel', '--update'], ctx)).toBe(0);
    const mapping = parseMapping(read(ctx), { path: 'x' });
    expect(mapping.rows.find((r) => r.apaleoAccount === SPA.number)).toMatchObject({ apaleoType: 'Revenues', abacusAccount: '3500', mwstCode: '311' });
    expect(mapping.rows.find((r) => r.apaleoAccount === ACC38)).toMatchObject({ abacusAccount: '3400' });
  });

  it('Switching from a paid connector: takes account and Kostenstelle from the export, MWST from the template, and lists 7777', async () => {
    const { ctx } = await fakeContext({ files: { 'konten.csv': decodeCsv(readMappingFixture('connector-export.csv')).text } });
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'kmu-hotel', '--accounts-from', 'konten.csv'], ctx)).toBe(0);
    const mapping = parseMapping(read(ctx), { path: 'x' });
    const row = (account: string) => mapping.rows.find((r) => r.apaleoAccount === account);
    expect(row('5011')).toMatchObject({ abacusAccount: '3410', kost: '20', mwstCode: '313', mwstPercent: '3.8', comment: CARRIED_OVER_COMMENT });
    expect(row('1200')).toMatchObject({ abacusAccount: '1105', kost: '', mwstCode: '', mwstPercent: '', comment: CARRIED_OVER_COMMENT });
    expect(row('1102')).toMatchObject({ abacusAccount: '1091', mwstCode: '' });
    expect(CARRIED_OVER_COMMENT.startsWith('Vorschlag (ungeprüft): ')).toBe(true);
    // Every other row is the template suggestion.
    expect(row(ACC38)).toMatchObject({ abacusAccount: '3400', mwstCode: '313' });
    expect(row('1114')).toMatchObject({ abacusAccount: '1090' });
    expect(row('1114')?.comment).not.toBe(CARRIED_OVER_COMMENT);
    expect(ctx.out()).toContain('Took the Abacus account and Kostenstelle of 3 apaleo account(s) from the account export');
    expect(ctx.out()).toMatch(/1 account\(s\) of the export are not in the apaleo chart of accounts and were not taken over:\n\s+7777\s+Revenues\s+Altes Logiskonto\s+3999/);
    expect(ctx.out()).toMatch(/1 account\(s\) of the export are parent accounts without a row of their own[^\n]*\n\s+3000\s+Liabilities/);
    expect(ctx.out()).not.toMatch(/grman|afin/i);
  });

  it('carries an account over without a template code as rate without MWST-Code, so mapping check reports E-MWST-CODE-MISSING', async () => {
    const exportText = 'Apaleo Kontonummer;Kontoname;Kontotyp;Abacus Kontonummer;Kostenstelle\r\nRevenueNoShow_Special:3.80;No-Show;Revenues;3680;\r\n';
    const { ctx } = await fakeContext({ files: { 'konten.csv': exportText } });
    expect(await runCli(['init-mapping', '--property', BSP, '--accounts-from', 'konten.csv'], ctx)).toBe(0);
    const mapping = parseMapping(read(ctx), { path: 'x' });
    expect(mapping.rows.find((r) => r.apaleoAccount === 'RevenueNoShow_Special:3.80')).toMatchObject({ abacusAccount: '3680', mwstCode: '', mwstPercent: '3.8' });
    expect(checkMapping(mapping).map((f) => f.code)).toContain('E-MWST-CODE-MISSING');
  });

  it('refuses an --accounts-from file that is no account export, and a missing one', async () => {
    const { ctx, fake } = await fakeContext({ files: { 'konten.csv': 'a;b\r\n1;2\r\n' } });
    expect(await runCli(['init-mapping', '--property', BSP, '--accounts-from', 'konten.csv'], ctx)).toBe(1);
    expect(ctx.err()).toContain('is not the account export of a paid connector');
    expect(await runCli(['init-mapping', '--property', BSP, '--accounts-from', 'nope.csv'], ctx)).toBe(1);
    expect(ctx.err()).toContain('No account export at');
    expect(fake.calls).toEqual([]);
    expect(() => read(ctx)).toThrow();
  });

  it.each([
    [['init-mapping', '--template', 'kmu-hotel'], '--property'],
    [['init-mapping', '--property', BSP, '--template', 'ekr'], 'Unknown template "ekr". --template must be kmu-hotel'],
  ])('Old template: exits 2 on %j', async (argv, message) => {
    const { ctx } = await fakeContext();
    expect(await runCli(argv, ctx)).toBe(2);
    expect(ctx.err()).toContain(message);
  });

  it('lists kmu-hotel and --accounts-from in its help', async () => {
    const ctx = createTestContext();
    expect(await runCli(['init-mapping', '--help'], ctx)).toBe(0);
    expect(ctx.out()).toContain('kmu-hotel');
    expect(ctx.out()).toContain('--accounts-from <file>');
  });

  it('exits 2 naming the unknown flag --skr of the DATEV tool', async () => {
    const { ctx } = await fakeContext();
    expect(await runCli(['init-mapping', '--property', BSP, '--skr', '03'], ctx)).toBe(2);
    expect(ctx.err()).toContain('--skr');
  });
});

describe('the mapping of the Swiss fixture month', () => {
  const FIXTURE = new URL('../fixtures/mapping/kmu-ch-month.csv', import.meta.url);
  const KURTAXE = 'Testzuordnung wie vom Treuhänder ausgefüllt: Kurtaxe als durchlaufender Posten auf 2210 ohne MWST-Code (ESTV MBI 08 Ziff. 7.11).';
  const HEADER =
    'apaleo-abacus Kontenzuordnung für Hotel Beispiel Engelberg (ENG), den Schweizer Testmonat: was init-mapping --template kmu-hotel ' +
    'auf dem Kontenplan schreibt, nur die Kurtaxe-Zeile 3501 ist ausgefüllt.';

  it('is what init-mapping --template kmu-hotel writes on the ENG chart, with only the Kurtaxe row filled in (2210, no MWST-Code)', async () => {
    const config = `apaleo:\n  clientId: ${CLIENT_ID}\nabacus:\n  mandant: 1234\n  leitwaehrung: CHF\n`;
    const ctx = createApaleoContext({ chMonth: true }, { files: { 'apaleo-abacus.config.yaml': config } });
    expect(await runCli(['init-mapping', '--property', ENG, '--template', 'kmu-hotel'], ctx)).toBe(0);
    const written = parseMapping(read(ctx, 'mapping-ENG.csv'), { path: 'mapping-ENG.csv' });
    // renderMappingFile writes the mapping columns only, so the rows keep their line numbers here.
    const rows: MappingRowValues[] = written.rows.map((row) => (row.apaleoAccount === '3501' ? { ...row, abacusAccount: '2210', comment: KURTAXE } : row));
    expect(rows.filter((row) => row.abacusAccount === '2210')).toHaveLength(1);
    const expected = renderMappingFile([HEADER], rows);
    if (process.env.UPDATE_GOLDEN === '1') writeFileSync(FIXTURE, expected);
    expect(Buffer.from(readFileSync(FIXTURE)).equals(Buffer.from(expected)), 'run UPDATE_GOLDEN=1 pnpm test and review the diff').toBe(true);
  });
});
