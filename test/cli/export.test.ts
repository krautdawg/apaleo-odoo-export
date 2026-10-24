import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as nodeFs from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run.js';
import { sha256, type Manifest } from '../../src/export/index.js';
import { ApaleoError, ApaleoPermissionError } from '../../src/sources/apaleo/index.js';
import { BSP } from '../helpers/apaleo.js';
import { addSecondProperty, exportConfig, exportSetup, latePosting, type ExportSetup } from '../helpers/export.js';
import { describeUtf8Difference } from '../helpers/golden.js';

/**
 * End-to-end through `runCli` with a fake context: fixed clock 2026-10-20, the
 * Hotel Beispiel fixtures behind a `FakeSource` and a temporary working
 * directory. The fixture data lies in September 2026, so the spec's monthly
 * scenarios run on `--month 2026-09`. After an intended change to the output,
 * run `UPDATE_GOLDEN=1 pnpm test` and review the diff of test/golden/export/.
 */
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const GOLDEN = new URL('../golden/export/', import.meta.url);
const FILE = 'ODOO_Buchungen_20260901-20260930_BSP.csv';
const PROTOCOL = 'ODOO_Buchungen_20260901-20260930_BSP.protokoll.txt';
const MAPPING = readFileSync(join(import.meta.dirname, '../fixtures/mapping/odoo-beispiel.csv'), 'utf8');

const folder = (setup: ExportSetup, month = '2026-09', property = BSP) => join(setup.ctx.cwd, 'exports', property, month);
const read = (setup: ExportSetup, name: string, month?: string) => readFileSync(join(folder(setup, month), name));
const manifestOf = (setup: ExportSetup, month?: string) => JSON.parse(read(setup, 'manifest.json', month).toString('utf8')) as Manifest;
const csvOf = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

function expectGolden(name: string, actual: Uint8Array): void {
  const path = new URL(name, GOLDEN);
  if (UPDATE) writeFileSync(path, actual);
  const difference = describeUtf8Difference(readFileSync(path), actual);
  expect(difference, `${name} differs from the golden file:\n${difference}`).toBeUndefined();
}

/** A copy of the fixture's first logis charge on another business day. */
function chargeOn(day: `${number}-${number}-${number}`, entry: string) {
  return (data: ExportSetup['data']) => {
    const template = data.ledger[BSP]?.find((line) => line.credit.number === 'RevenueAccommodation_VeryReduced:10.00');
    if (!template) throw new Error('fixture logis charge missing');
    data.ledger[BSP]?.push({ ...structuredClone(template), businessDate: day, postedAt: `${day}T15:00:00Z`, sourceEntryNumber: entry });
  };
}

describe('apaleo-odoo export', () => {
  it('Files after a run: writes the golden Odoo file, its protocol with the Odoo import block and the manifest for a month, and exits 0', async () => {
    const setup = exportSetup();
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP], setup.ctx)).toBe(0);
    expect(setup.ctx.out()).toContain(`BSP 2026-09 (2026-09-01 to 2026-09-30): written exports/BSP/2026-09/${FILE} (24 bookings)`);
    expect(setup.ctx.out()).toContain('Result: 1 written, 0 unchanged, 0 failed.');
    expect(readdirSync(folder(setup)).sort()).toEqual([FILE, PROTOCOL, 'manifest.json'].sort());

    const file = read(setup, FILE);
    expectGolden(FILE, file);
    const manifest = read(setup, 'manifest.json');
    expectGolden('manifest.json', manifest);
    const [entry] = manifestOf(setup).files;
    expect(entry).toMatchObject({ file: FILE, status: 'current', sha256: sha256(file), bookings: 24 });
    expect(entry).not.toHaveProperty('bodySha256');
    // The journal total replaces the Soll and Haben totals of the former writer: every Einzelbuchung moves its gross amount to both sides.
    expect(entry).not.toHaveProperty('sollTotal');
    expect(entry).not.toHaveProperty('habenTotal');
    expect(entry).not.toHaveProperty('taxByRate');
    expect(entry).not.toHaveProperty('taxByMwstCode');
    // The debit total is the sum of the debit column of the file.
    const debits = csvOf(file).split('\n').slice(1, -1).map((row) => row.split(',')[7] ?? '0');
    const debitTotal = debits.reduce((sum, amount) => sum + Math.round(Number(amount) * 100), 0);
    expect(entry).toMatchObject({ debitTotalCents: debitTotal, currency: 'EUR', odooCompanyId: 1, odooJournal: 'APA', entries: 5, lines: debits.length });
    expect(entry?.vatByTax?.map((v) => [v.tax, v.ratePercent])).toEqual([
      ['account.1_account_tax_template_sales_20_code022', 20],
      ['account.1_account_tax_template_sales_10_code029', 10],
    ]);
    expect(entry?.mappingSha256).toBe(sha256(readFileSync(join(setup.ctx.cwd, 'mapping-BSP.csv'))));

    const protocol = read(setup, PROTOCOL).toString('utf8');
    expect(protocol).toContain('Totals per Odoo account');
    expect(protocol).toContain('Import into Odoo Accounting (compare with the Odoo company before importing, see docs/odoo-format.md):');
    expect(protocol).toContain('apaleo entries per line of the file (entry number and receipt or reference):');
    expect(protocol).toContain(`  File: ${FILE}`);
    expect(protocol).toContain(`SHA-256: ${sha256(file)}`);
    expect(protocol).toContain('Tool: apaleo-odoo 0.0.0');
  });

  it('Protocol names company and journal: the import block and the manifest entry name company 3 and journal APB', async () => {
    const setup = exportSetup({ config: exportConfig().replace('  version: 18\n', '  version: 18\n  companyId: 3\n  journal: APB\n').replace('  journal: APA\n', '') });
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP], setup.ctx)).toBe(0);
    expect(read(setup, PROTOCOL).toString('utf8')).toContain('\n  Company: id 3 (odoo.companyId, the company that owns the taxes), journal APB, currency EUR\n');
    expect(manifestOf(setup).files[0]).toMatchObject({ file: FILE, odooCompanyId: 3, odooJournal: 'APB' });
  });

  it('exits 2 and explains --month and --from/--to when the period is missing', async () => {
    const setup = exportSetup();
    expect(await runCli(['export', '--property', BSP], setup.ctx)).toBe(2);
    expect(setup.ctx.err()).toContain('--month YYYY-MM');
    expect(setup.ctx.err()).toContain('--from YYYY-MM-DD --to YYYY-MM-DD');
    expect(setup.fake.calls).toEqual([]);
  });

  it('exits 2 when no property is configured or given', async () => {
    const setup = exportSetup({ config: exportConfig().replace(/properties:[\s\S]*$/, '') });
    expect(await runCli(['export', '--month', '2026-09'], setup.ctx)).toBe(2);
    expect(setup.ctx.err()).toContain('No property to export');
  });

  it('exports every configured property by default', async () => {
    const setup = exportSetup({
      config: exportConfig('  - id: BSP2'),
      files: { 'mapping-BSP2.csv': MAPPING },
      data: addSecondProperty,
    });
    expect(await runCli(['export', '--month', '2026-09'], setup.ctx)).toBe(0);
    expect(readdirSync(join(setup.ctx.cwd, 'exports')).sort()).toEqual([BSP, 'BSP2']);
  });

  it('splits a range across two months into two files', async () => {
    const setup = exportSetup({ data: chargeOn('2026-10-02', 'BSPE0100') });
    expect(await runCli(['export', '--from', '2026-09-20', '--to', '2026-10-05', '--property', BSP], setup.ctx)).toBe(0);
    expect(readdirSync(folder(setup, '2026-09'))).toContain('ODOO_Buchungen_20260920-20260930_BSP.csv');
    const october = csvOf(read(setup, 'ODOO_Buchungen_20261001-20261005_BSP.csv', '2026-10'));
    expect(october.split('\n')[1]).toMatch(/^apaleo_c1_BSP_20261002,apaleo BSP 2026-10-02,2026-10-02,APA,/);
    expect(october).toContain(',4010,Erlöse Beherbergung 10 %,0.00,89.09,account.1_account_tax_template_sales_10_code029\n');
  });

  it('refuses a period that reaches today in the property time zone, taken from ctx.now()', async () => {
    // 22:30 UTC on 2026-10-19 is already 2026-10-20 in Vienna.
    const setup = exportSetup({ now: new Date('2026-10-19T22:30:00Z') });
    expect(await runCli(['export', '--from', '2026-10-01', '--to', '2026-10-20', '--property', BSP], setup.ctx)).toBe(1);
    expect(setup.ctx.out()).toContain('E-DAY-NOT-CLOSED');
    expect(setup.ctx.out()).toContain('not closed that day with the night audit yet');
    expect(setup.fake.calls).toEqual(['listProperties']);
    expect(existsSync(join(setup.ctx.cwd, 'exports'))).toBe(false);
  });

  it('warns about a period ending yesterday', async () => {
    const setup = exportSetup({ now: new Date('2026-10-01T08:00:00Z') });
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP], setup.ctx)).toBe(0);
    expect(setup.ctx.out()).toContain('W-RECENT-DAY');
  });

  it('writes BSP2 but not BSP when BSP has an unmapped account, prints E-UNMAPPED and exits 1', async () => {
    const setup = exportSetup({
      config: exportConfig('  - id: BSP2'),
      files: { 'mapping-BSP.csv': MAPPING.replace(/^RevenueFoodAndBeverages_Normal:20\.00;.*\r?\n/m, ''), 'mapping-BSP2.csv': MAPPING },
      data: addSecondProperty,
    });
    expect(await runCli(['export', '--month', '2026-09'], setup.ctx)).toBe(1);
    const out = setup.ctx.out();
    expect(out).toContain('BSP 2026-09 (2026-09-01 to 2026-09-30): failed, no file written');
    expect(out).toMatch(/E-UNMAPPED \(apaleo_account\): apaleo account RevenueFoodAndBeverages_Normal:20\.00 \(Revenues, "Revenues Food and beverages \(20%\)"\) is not mapped .*: add a row/);
    expect(out).toContain('BSP2 2026-09 (2026-09-01 to 2026-09-30): written');
    expect(out).toContain('Result: 1 written, 0 unchanged, 1 failed.');
    expect(readdirSync(join(setup.ctx.cwd, 'exports'))).toEqual(['BSP2']);
  });

  it('prints the summary in a dry run and creates no file or folder', async () => {
    const setup = exportSetup();
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP, '--dry-run'], setup.ctx)).toBe(0);
    const out = setup.ctx.out();
    for (const text of [
      "Totals per Odoo account (the side without tax with the gross amount, the side with the tax with the gross amount minus apaleo's tax):",
      'Revenue and VAT per Odoo tax and rate, with the UStVA Kennzahl:',
      'Deposits and their VAT per Odoo tax and rate',
      'Kurtaxe and other guest levies per account (apaleo city tax, total 6.40):\n  3600 without tax: 6.40\n',
      'Payments per clearing account:',
      'Deposits (Anzahlungen) received, released and refunded:\n  received        395.00\n  released        395.00\n  of it refunded   10.00\n',
      'Accounts receivable (Forderungen Firmenrechnungen, Soll positive): 115.00',
      'gross (unsigned)',
      'Skipped lines:',
      'Findings:',
    ]) {
      expect(out).toContain(text);
    }
    // No Kennzahl for a non-German rate.
    expect(out).toContain('  account_tax_template_sales_10_code029 10 %: net 584.82, tax 58.48, gross 643.30, apaleo VAT 58.48, difference 0.00 (apaleo precise 58.48181818)');
    expect(out).not.toContain('(Kz');
    expect(out).toContain("Each booking carries apaleo's tax of its line, rounded to the cent");
    // The import block, before the totals.
    const importBlock = out.indexOf('Import into Odoo Accounting');
    expect(importBlock).toBeGreaterThan(0);
    expect(importBlock).toBeLessThan(out.indexOf('Totals per Odoo account'));
    for (const line of [
      `  File: ${FILE}`,
      '  Revision: 1 (first file of the period)',
      '  Company: id 1 (odoo.companyId, the company that owns the taxes), journal APA, currency EUR',
    ]) {
      expect(out).toContain(`\n${line}\n`);
    }
    expect(out).toContain(`File: a real run writes exports/BSP/2026-09/${FILE}`);
    expect(out).toContain('Result: dry run, nothing written');
    expect(readdirSync(setup.ctx.cwd).sort()).toEqual(['apaleo-odoo.config.yaml', 'mapping-BSP.csv']);
  });

  it('exits 1 in a dry run with an error finding', async () => {
    const setup = exportSetup({ files: { 'mapping-BSP.csv': '' } });
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP, '--dry-run'], setup.ctx)).toBe(1);
    expect(setup.ctx.out()).toContain('dry run, blocked');
  });
});

describe('re-running an export', () => {
  async function exportedOnce(): Promise<ExportSetup> {
    const setup = exportSetup();
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP], setup.ctx)).toBe(0);
    setup.ctx.now = () => new Date('2026-10-21T09:30:00Z');
    return setup;
  }

  it('reports unchanged, rewrites nothing and exits 0 when the data did not change', async () => {
    const setup = await exportedOnce();
    const before = readdirSync(folder(setup)).map((name) => [name, read(setup, name)] as const);
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP], setup.ctx)).toBe(0);
    expect(setup.ctx.out()).toContain(`unchanged exports/BSP/2026-09/${FILE}`);
    expect(readdirSync(folder(setup)).map((name) => [name, read(setup, name)] as const)).toEqual(before);
  });

  it('refuses a month a late posting changed with E-FILE-EXISTS and suggests --overwrite', async () => {
    const setup = await exportedOnce();
    latePosting(setup.data);
    const before = read(setup, FILE);
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP], setup.ctx)).toBe(1);
    const out = setup.ctx.out();
    expect(out).toContain('E-FILE-EXISTS');
    expect(out).toContain('With --overwrite the new file gets the next revision and new External IDs');
    expect(out).toContain('delete the draft entries of the earlier revision in Odoo (filter by the reference "apaleo BSP") and reverse its posted entries');
    expect(out).toContain('--overwrite');
    expect(read(setup, FILE)).toEqual(before);
  });

  it('with --overwrite keeps the old file as .replaced-<timestamp>.csv and records both in the manifest', async () => {
    const setup = await exportedOnce();
    const old = read(setup, FILE);
    latePosting(setup.data);
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP, '--overwrite'], setup.ctx)).toBe(0);
    const backup = 'ODOO_Buchungen_20260901-20260930_BSP.replaced-20261021T093000Z.csv';
    expect(readdirSync(folder(setup)).sort()).toEqual(
      [FILE, PROTOCOL, backup, 'ODOO_Buchungen_20260901-20260930_BSP.replaced-20261021T093000Z.protokoll.txt', 'manifest.json'].sort(),
    );
    expect(setup.ctx.out()).toContain('the previous file was kept as .replaced-*.csv');
    expect(read(setup, backup)).toEqual(old);
    const fresh = read(setup, FILE);
    expect(manifestOf(setup).files.map((e) => [e.file, e.status, e.sha256, e.bookings])).toEqual([
      [backup, 'replaced', sha256(old), 24],
      [FILE, 'current', sha256(fresh), 25],
    ]);
    expect(manifestOf(setup).files[0]).toMatchObject({ replacedBy: FILE, replacedAt: '2026-10-21T09:30:00.000Z' });
  });

  it('falls back to the file itself when the manifest was deleted', async () => {
    const setup = await exportedOnce();
    rmSync(join(folder(setup), 'manifest.json'));
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP], setup.ctx)).toBe(0);
    expect(setup.ctx.out()).toContain('unchanged');
    expect(setup.ctx.out()).toContain('N-COMPANIONS-REPAIRED');
    expect(manifestOf(setup).files.map((e) => [e.file, e.status])).toEqual([[FILE, 'current']]);

    latePosting(setup.data);
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP], setup.ctx)).toBe(1);
    expect(setup.ctx.out()).toContain('E-FILE-EXISTS');
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP, '--overwrite'], setup.ctx)).toBe(0);
    expect(manifestOf(setup).files.map((e) => [e.status, e.from, e.to])).toEqual([
      ['replaced', '2026-09-01', '2026-09-30'],
      ['current', '2026-09-01', '2026-09-30'],
    ]);
  });

  it('rewrites a missing protocol and a stale manifest entry after an interrupted run, without touching the file', async () => {
    const setup = await exportedOnce();
    const csv = read(setup, FILE);
    rmSync(join(folder(setup), PROTOCOL));
    const stale = manifestOf(setup);
    writeFileSync(join(folder(setup), 'manifest.json'), JSON.stringify({ files: stale.files.map((e) => ({ ...e, sha256: 'stale' })) }));
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP], setup.ctx)).toBe(0);
    const out = setup.ctx.out();
    expect(out).toContain(`unchanged exports/BSP/2026-09/${FILE}`);
    expect(out).toContain(`N-COMPANIONS-REPAIRED: ${PROTOCOL} and manifest.json did not match ${FILE}`);
    expect(read(setup, FILE)).toEqual(csv);
    expect(read(setup, PROTOCOL).toString('utf8')).toContain(`\nSHA-256: ${sha256(csv)}\n`);
    expect(manifestOf(setup).files.map((e) => [e.file, e.status, e.sha256])).toEqual([[FILE, 'current', sha256(csv)]]);
    expect(readdirSync(folder(setup)).sort()).toEqual([FILE, PROTOCOL, 'manifest.json'].sort());
  });

  it('writes nothing while another run holds the folder lock', async () => {
    const setup = exportSetup();
    await nodeFs.mkdir(folder(setup), { recursive: true });
    writeFileSync(join(folder(setup), '.apaleo-odoo.lock'), 'pid 1\n');
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP], setup.ctx)).toBe(1);
    const out = setup.ctx.out();
    expect(out).toContain('E-EXPORT: another apaleo-odoo run is writing into');
    expect(out).toContain('Result: 0 written, 0 unchanged, 1 failed.');
    expect(readdirSync(folder(setup))).toEqual(['.apaleo-odoo.lock']);
  });

  it('does not write over a file another run created after this run checked the folder', async () => {
    const setup = exportSetup();
    setup.ctx.fs = {
      ...nodeFs,
      writeFile: async (path, data, options) => {
        // The other run finishes between this run's check and its write.
        if (String(path).endsWith('.apaleo-odoo.lock')) writeFileSync(join(folder(setup), FILE), 'written by another run');
        return nodeFs.writeFile(path, data, options);
      },
    };
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP], setup.ctx)).toBe(1);
    expect(setup.ctx.out()).toContain('changed while this run was checking it, probably by another apaleo-odoo run');
    expect(read(setup, FILE).toString('utf8')).toBe('written by another run');
    expect(readdirSync(folder(setup))).toEqual([FILE]);
  });

  it('refuses a period that overlaps a file already in the folder', async () => {
    const setup = await exportedOnce();
    expect(await runCli(['export', '--from', '2026-09-20', '--to', '2026-09-30', '--property', BSP], setup.ctx)).toBe(1);
    expect(setup.ctx.out()).toContain('E-PERIOD-OVERLAP');
    expect(setup.ctx.out()).toContain(`${join(folder(setup), FILE)} already covers some of the days 2026-09-20 to 2026-09-30`);
    expect(setup.ctx.out()).toContain('importing both would overwrite reviewed drafts with the other file\'s content or book those days twice in Odoo');
    expect(readdirSync(folder(setup))).toHaveLength(3);
  });

  it('Config changed the content: a change of the odoo journal refuses the re-run with E-FILE-EXISTS, and --overwrite writes the new journal', async () => {
    const setup = await exportedOnce();
    const configPath = join(setup.ctx.cwd, 'apaleo-odoo.config.yaml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8').replace('  journal: APA\n', '  journal: APB\n'));
    const old = read(setup, FILE);
    expect(csvOf(old)).toContain(',APA,');

    const start = setup.ctx.out().length;
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP], setup.ctx)).toBe(1);
    const refused = setup.ctx.out().slice(start);
    expect(refused).toContain('E-FILE-EXISTS');
    expect(refused).not.toContain('unchanged exports');
    expect(read(setup, FILE)).toEqual(old);

    expect(await runCli(['export', '--month', '2026-09', '--property', BSP, '--overwrite'], setup.ctx)).toBe(0);
    expect(csvOf(read(setup, FILE))).toContain(',APB,');
    expect(csvOf(read(setup, FILE))).not.toContain(',APA,');
    expect(read(setup, PROTOCOL).toString('utf8')).toContain('journal APB, currency EUR');
    expect(manifestOf(setup).files.map((e) => e.status)).toEqual(['replaced', 'current']);
  });

  it('reads a manifest of an earlier version with fields it does not know, and keeps them', async () => {
    const setup = await exportedOnce();
    const manifestPath = join(folder(setup), 'manifest.json');
    const [entry] = manifestOf(setup).files;
    writeFileSync(manifestPath, JSON.stringify({ files: [{ ...entry, vatByTax: undefined, bodySha256: 'from an earlier version', taxByRate: [], futureField: 1 }] }));
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP], setup.ctx)).toBe(0);
    expect(setup.ctx.out()).toContain(`unchanged exports/BSP/2026-09/${FILE}`);
    expect(setup.ctx.out()).not.toContain('N-COMPANIONS-REPAIRED');

    latePosting(setup.data);
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP, '--overwrite'], setup.ctx)).toBe(0);
    const [replaced, current] = manifestOf(setup).files;
    expect(replaced).toMatchObject({ status: 'replaced', bodySha256: 'from an earlier version', taxByRate: [], futureField: 1 });
    expect(current).toMatchObject({ file: FILE, status: 'current', bookings: 25 });
    expect(current).not.toHaveProperty('bodySha256');
    expect(current?.vatByTax?.find((v) => v.ratePercent === 10)).toMatchObject({ tax: 'account.1_account_tax_template_sales_10_code029' });
  });

  it('compares the whole file: the Odoo file has no creation time', async () => {
    const setup = await exportedOnce();
    const file = read(setup, FILE);
    expect(csvOf(file)).not.toMatch(/2026-10-2\dT|\d{17}/);
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP], setup.ctx)).toBe(0);
    expect(read(setup, FILE)).toEqual(file);
  });

  it('stops at a corrupt manifest.json with E-EXPORT and changes nothing', async () => {
    const setup = await exportedOnce();
    writeFileSync(join(folder(setup), 'manifest.json'), '{ not json');
    latePosting(setup.data);
    const before = readdirSync(folder(setup)).map((name) => [name, read(setup, name)] as const);
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP, '--overwrite'], setup.ctx)).toBe(1);
    expect(setup.ctx.out()).toContain('E-EXPORT');
    expect(setup.ctx.out()).toContain('manifest.json is not a manifest written by apaleo-odoo');
    expect(readdirSync(folder(setup)).map((name) => [name, read(setup, name)] as const)).toEqual(before);
  });
});

describe('export failures that stop one part', () => {
  const twoProperties = () =>
    exportSetup({
      config: exportConfig('  - id: BSP2'),
      files: { 'mapping-BSP2.csv': MAPPING },
      data: addSecondProperty,
    });

  it('exports each property once, in the order of repeated --property flags', async () => {
    const setup = twoProperties();
    expect(await runCli(['export', '--month', '2026-09', '--property', 'BSP2', '--property', BSP, '--property', 'BSP2'], setup.ctx)).toBe(0);
    const heads = setup.ctx.out().split('\n').filter((line) => line.includes(': written'));
    expect(heads.map((line) => line.split(' ')[0])).toEqual(['BSP2', BSP]);
    expect(setup.ctx.out()).toContain('Result: 2 written, 0 unchanged, 0 failed.');
  });

  it('turns a file system error into E-EXPORT for that property-month and still runs the others', async () => {
    const setup = twoProperties();
    setup.ctx.fs = {
      ...nodeFs,
      writeFile: async (path, data, options) => {
        if (String(path).includes(`${join('exports', BSP)}/`)) {
          throw Object.assign(new Error(`EACCES: permission denied, open '${String(path)}'`), { code: 'EACCES', syscall: 'open', path: String(path) });
        }
        return nodeFs.writeFile(path, data, options);
      },
    };
    expect(await runCli(['export', '--month', '2026-09'], setup.ctx)).toBe(1);
    const out = setup.ctx.out();
    expect(out).toContain('BSP 2026-09 (2026-09-01 to 2026-09-30): failed');
    expect(out).toMatch(/E-EXPORT: the file system refused a step of the export: EACCES: permission denied/);
    expect(out).toContain('belongs to another user');
    expect(out).toContain('sudo chown -R 1000:1000 data');
    expect(out).toContain('BSP2 2026-09 (2026-09-01 to 2026-09-30): written');
    expect(out).toContain('Result: 1 written, 0 unchanged, 1 failed.');
  });

  it('gives the permission hint only when apaleo refuses the aggregates with 403', async () => {
    const setup = exportSetup({ config: `${exportConfig()}checks:\n  aggregates: true\n` });
    setup.fake.getAccountTotals = async () => {
      throw new ApaleoPermissionError('the daily aggregates');
    };
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP], setup.ctx)).toBe(1);
    expect(setup.ctx.out()).toContain('E-AGGREGATE-CHECK');
    expect(setup.ctx.out()).toContain('core.subledger_aggregate.create, or set checks.aggregates: false');
  });

  it('asks to try again, without the permission hint, when the aggregate request fails otherwise', async () => {
    const setup = exportSetup({ config: `${exportConfig()}checks:\n  aggregates: true\n` });
    setup.fake.getAccountTotals = async () => {
      throw new ApaleoError('apaleo did not answer the daily aggregates request (HTTP 503 Service Unavailable).', 503);
    };
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP], setup.ctx)).toBe(1);
    const out = setup.ctx.out();
    expect(out).toContain('E-AGGREGATE-CHECK');
    expect(out).toContain('HTTP 503');
    expect(out).toContain('This is not a missing permission');
    expect(out).toContain('Try again later');
    expect(out).not.toContain('Give the custom app the permission core.subledger_aggregate.create');
    expect(existsSync(join(setup.ctx.cwd, 'exports'))).toBe(false);
  });
});
