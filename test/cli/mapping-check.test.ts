import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run.js';
import type { LedgerLine } from '../../src/core/source.js';
import { BSP, FIXTURE_FILES, loadBeispielData } from '../helpers/apaleo.js';
import { createTestContext } from '../helpers/context.js';
import { FakeSource } from '../helpers/fake-source.js';
import { GERMAN_CHART } from '../helpers/german-chart.js';
import { ledgerLine, tax } from '../helpers/ledger.js';
import { ACCOUNTS, charge, germanTax } from '../helpers/posting.js';

const CONFIG = FIXTURE_FILES['apaleo-odoo.config.yaml'];
const HEADER = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;odoo_account;odoo_tax;tax_percent;comment';
const csv = (...lines: string[]) => [HEADER, ...lines].map((l) => `${l}\r\n`).join('');
const ACC7 = 'RevenueAccommodation_Reduced:7.00';

const VALID = csv(
  `${ACC7};Revenues;Revenues Accommodation (7%);7;8300;tax_ust_7_skr03;7;`,
  '1102;Payments;Visa Credit Card Payment;;1361;;;',
  '*;Payments;;;1361;;;',
  '*;Liabilities;;7;1711;tax_ust_7_skr03;7;',
  '*;AccountsReceivable;;;1401;;;',
  '3501;CityTaxes;Kurtaxe;0;;;;',
);

const BEISPIEL = await loadBeispielData();

/** A fake apaleo with the German test chart for BSP and the given ledger (default: the Hotel Beispiel lines). */
function context(files: Record<string, string>, ledger?: LedgerLine[], config = CONFIG) {
  const data = structuredClone(BEISPIEL);
  data.charts[BSP] = [...GERMAN_CHART];
  if (ledger) data.ledger[BSP] = ledger;
  const fake = new FakeSource(data);
  const ctx = createTestContext({ files: { 'apaleo-odoo.config.yaml': config, ...files }, sourceFactory: () => fake });
  return { ctx, fake };
}

describe('apaleo-odoo mapping check (offline)', () => {
  it('Valid mapping: prints a summary of rows by type and exits 0', async () => {
    const { ctx, fake } = context({ 'mapping-BSP.csv': VALID });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(0);
    expect(ctx.out()).toContain(`Mapping file: ${join(ctx.cwd, 'mapping-BSP.csv')} (6 rows, checked for Odoo 18)`);
    expect(ctx.out()).toMatch(/type\s+rows\s+mapped\s+unmapped/);
    expect(ctx.out()).toMatch(/Revenues\s+1\s+1\s+0/);
    expect(ctx.out()).toMatch(/Payments\s+2\s+2\s+0/);
    expect(ctx.out()).toMatch(/CityTaxes\s+1\s+0\s+1/);
    expect(ctx.out()).toContain('Result: mapping OK.');
    expect(fake.calls).toEqual([]);
  });

  it('uses --mapping and the only configured property by default', async () => {
    const { ctx } = context({ 'maps/hotel.csv': VALID }, undefined, `${CONFIG}properties:\n  - id: BSP\n    mapping: maps/hotel.csv\n`);
    expect(await runCli(['mapping', 'check'], ctx)).toBe(0);
    expect(ctx.out()).toContain(join(ctx.cwd, 'maps/hotel.csv'));
    const other = context({ 'other.csv': VALID });
    expect(await runCli(['mapping', 'check', '--mapping', 'other.csv'], other.ctx)).toBe(0);
  });

  it('Tax on a receivables row: E-TAX-NOT-ALLOWED and exit 1', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv('1200;Receivables;Receivables;;1410;tax_ust_7_skr03;7;') });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(1);
    expect(ctx.out()).toContain('E-TAX-NOT-ALLOWED');
    expect(ctx.out()).toContain('line 2: apaleo type Receivables is a payment, guest claim or company invoice');
    expect(ctx.out()).toContain('Result: 1 error, 0 warnings.');
  });

  it('Swapped taxes and a custom tax: W-TAX-RATE and W-TAX-UNCHECKED, exit 0', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv('RevenueOther_Normal:19.00;Revenues;Other;19;8400;tax_ust_7_skr03;19;', `${ACC7};Revenues;A;7;8300;__import__.ust_7_hotel;7;`) });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(0);
    expect(ctx.out()).toContain('W-TAX-RATE');
    expect(ctx.out()).toContain('W-TAX-UNCHECKED');
    expect(ctx.out()).toContain('Result: mapping OK (2 warnings).');
  });

  it('Generated account: a Payments row on 1000 notes N-GENERATED-ACCOUNT for the configured Odoo version, exit 0', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv('1600;Payments;Cash Payment;;1000;;;') }, undefined, CONFIG.replace('version: 18', 'version: 17'));
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(0);
    expect(ctx.out()).toContain('N-GENERATED-ACCOUNT');
    expect(ctx.out()).toContain('A fresh SKR03 database of Odoo 17 has Kasse 1001, Geldtransit 13601 and no 1000');
    expect(ctx.out()).toContain('Result: mapping OK.');
  });

  it('Account with a space: E-ACCOUNT-FORMAT names the rule of Odoo account codes', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv('1102;Payments;Visa;;13 60;;;') });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(1);
    expect(ctx.out()).toContain('E-ACCOUNT-FORMAT');
    expect(ctx.out()).toContain('1 to 64 characters of A-Z, a-z, 0-9 and "."');
  });

  it('VAT mismatch: reports both rates', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv(`${ACC7};Revenues;Revenues Accommodation (7%);7;8400;tax_ust_19_skr03;19;`) });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(1);
    expect(ctx.out()).toMatch(/E-VAT-MISMATCH .*VAT 7 %.*books 19 %/);
  });

  it('notes a default tax, warns about Kz 45 and an unusual rate, and still passes', async () => {
    const { ctx } = context({
      'mapping-BSP.csv': csv('RevenueAccommodation_Without:0.00;Revenues;No VAT;0;4200;;0;', 'R0;Revenues;Abroad;0;8200;tax_not_taxable_skr03;0;', 'R10;Revenues;Austrian;10;8350;__import__.ust_10;10;'),
    });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(0);
    expect(ctx.out()).toContain('N-DEFAULT-TAX-ACCOUNT');
    expect(ctx.out()).toContain('W-TAX-KZ45');
    expect(ctx.out()).toContain('W-VAT-RATE-UNUSUAL');
    expect(ctx.out()).toContain('W-TAX-UNCHECKED');
    expect(ctx.out()).toContain('Result: mapping OK (3 warnings).');
  });

  it('Kurtaxe mapped with tax: warns W-CITY-TAX-TAXED naming the row, its line and § 10 Abs. 1 UStG, and exits 0', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv('3501;CityTaxes;Kurtaxe;7;8300;tax_ust_7_skr03;7;') });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(0);
    expect(ctx.out()).toMatch(/W-CITY-TAX-TAXED \(odoo_tax\): line 2: the CityTaxes row for apaleo account 3501 books the Odoo tax tax_ust_7_skr03 at 7 %\..*§ 10 Abs\. 1 UStG/);
    expect(ctx.out()).toContain('Result: mapping OK (1 warning).');
  });

  it('Duplicate key: fails with exit 1, naming both lines', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv('R7;Revenues;A;7;8300;tax_ust_7_skr03;7;', 'R7;Revenues;A;7;8301;tax_ust_7_skr03;7;') });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(1);
    expect(ctx.err()).toContain('lines 2 and 3 both map apaleo account R7 of type Revenues');
  });

  it('fails with exit 1 and a hint when the mapping file is missing', async () => {
    const { ctx } = context({});
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(1);
    expect(ctx.err()).toContain('No mapping file at');
    expect(ctx.err()).toContain('init-mapping --property <id> --template skr03-hotel');
  });

  it('Old Abacus and DATEV mappings: refused with init-mapping --template skr03-hotel', async () => {
    const datev = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;datev_account;bu_key;datev_vat_percent;kost1;kost2;comment\r\n5011;Revenues;A;7;8300;;7;;;\r\n';
    const abacus = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;abacus_account;mwst_code;mwst_percent;kost;comment\r\n5011;Revenues;A;3.8;3400;313;3.8;;\r\n';
    const { ctx } = context({ 'old.csv': datev, 'abacus.csv': abacus });
    expect(await runCli(['mapping', 'check', '--mapping', 'old.csv'], ctx)).toBe(1);
    expect(ctx.err()).toContain('this is a DATEV mapping');
    expect(ctx.err()).toContain('init-mapping --property <id> --template skr03-hotel');
    expect(await runCli(['mapping', 'check', '--mapping', 'abacus.csv'], ctx)).toBe(1);
    expect(ctx.err()).toContain('this is an Abacus mapping');
  });

  it('Account export of a paid Abacus connector: refused as an Abacus mapping, with no vendor name', async () => {
    const { ctx } = context({ 'konten.csv': 'Apaleo Kontonummer;Kontoname;Kontotyp;Abacus Kontonummer;Kostenstelle\r\n5011;Logis;Revenues;3410;20\r\n' });
    expect(await runCli(['mapping', 'check', '--mapping', 'konten.csv'], ctx)).toBe(1);
    expect(ctx.err()).toContain('this is an Abacus mapping (the account export of a paid connector for Abacus)');
    expect(ctx.err()).not.toMatch(/grman|--accounts-from/i);
  });

  it('exits 2 naming the unknown flag --skr of the DATEV tool', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': VALID });
    expect(await runCli(['mapping', 'check', '--property', BSP, '--skr', '03'], ctx)).toBe(2);
    expect(ctx.err()).toContain('--skr');
  });
});

describe('apaleo-odoo mapping check --from --to', () => {
  it('New revenue account: fails with E-UNMAPPED for 5010, naming type, name, line count and gross total', async () => {
    const credit = { number: '5010', name: 'Spa', type: 'Revenues' };
    const ledger = [
      charge({ credit, grossCents: 4000, taxes: [] }),
      charge({ credit, grossCents: 6000, taxes: [], businessDate: '2026-09-15', sourceEntryNumber: 'BSPE0002' }),
    ];
    const { ctx, fake } = context({ 'mapping-BSP.csv': csv('*;Receivables;;;1410;;;') }, ledger);
    expect(await runCli(['mapping', 'check', '--property', BSP, '--from', '2026-09-14', '--to', '2026-09-15'], ctx)).toBe(1);
    expect(fake.calls).toContain(`getLedger ${BSP} 2026-09-14 2026-09-16`);
    expect(ctx.out()).toContain('Checked 2 ledger lines of BSP from 2026-09-14 to 2026-09-15: 1 unmapped account(s).');
    expect(ctx.out()).toContain('E-UNMAPPED');
    expect(ctx.out()).toContain('apaleo account 5010 (Revenues, "Spa") is not mapped (2 lines, gross 100.00)');
  });

  it('Kurtaxe is not pre-filled: the empty Kurtaxe row of a fresh init-mapping file is E-UNMAPPED until it is filled in, then passes', async () => {
    const ledger = [
      charge(),
      ledgerLine({ debit: ACCOUNTS.receivables, credit: ACCOUNTS.cityTax, grossCents: 350, taxes: [tax('Without', 0, 0)], sourceEntryNumber: 'BSPE0002' }),
      ledgerLine({ debit: ACCOUNTS.visa, credit: ACCOUNTS.receivables, command: 'PostPayment', grossCents: 12_350, taxes: [], sourceEntryNumber: 'BSPE0003' }),
    ];
    const { ctx } = context({}, ledger);
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'skr03-hotel'], ctx)).toBe(0);
    const period = ['mapping', 'check', '--property', BSP, '--from', '2026-09-14', '--to', '2026-09-22'];
    expect(await runCli(period, ctx)).toBe(1);
    const unmapped = ctx.out().split('\n').filter((line) => line.startsWith('E-UNMAPPED'));
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]).toContain('apaleo account 3501 (CityTaxes, "Kurtaxe")');

    const path = join(ctx.cwd, 'mapping-BSP.csv');
    const text = (await ctx.fs.readFile(path, 'utf8')).replace(/^3501;CityTaxes;Kurtaxe;0;;/m, '3501;CityTaxes;Kurtaxe;0;1590;');
    const after = context({ 'mapping-BSP.csv': text }, ledger);
    expect(await runCli(period, after.ctx)).toBe(0);
    expect(after.ctx.out()).not.toMatch(/^E-/m);
    expect(after.ctx.out()).toContain('every booked account is mapped.');
    expect(after.ctx.out()).toContain('Result: mapping OK');
  });

  it('Parent row with the wrong VAT rate: 5000 on 8400 at 19 % fails with E-VAT-MISMATCH for 5011 and 5111 booked at 7 %', async () => {
    const parent = csv('5000;Revenues;Revenues;;8400;tax_ust_19_skr03;19;', '*;Receivables;;;1410;;;');
    const logis = { number: '5011', name: 'Logis', type: 'Revenues', parentNumber: '5000' };
    const breakfast = { number: '5111', name: 'Frühstück im Zimmerpreis', type: 'Revenues', parentNumber: '5000' };
    const ledger = [charge({ credit: logis }), charge({ credit: breakfast, grossCents: 1_070, netCents: 1_000, taxes: germanTax(7, 70), sourceEntryNumber: 'BSPE0002' })];
    const args = ['mapping', 'check', '--property', BSP, '--from', '2026-09-14', '--to', '2026-09-22'];
    const { ctx } = context({ 'mapping-BSP.csv': parent }, ledger);
    expect(await runCli(args, ctx)).toBe(1);
    const mismatches = ctx.out().split('\n').filter((line) => line.startsWith('E-VAT-MISMATCH'));
    expect(mismatches).toHaveLength(2);
    expect(mismatches.some((line) => line.includes('apaleo account 5011 (Revenues') && line.includes('books 19 % on Odoo account 8400'))).toBe(true);
    expect(mismatches.some((line) => line.includes('apaleo account 5111 (Revenues'))).toBe(true);
    expect(ctx.out()).toContain('account(s) with the wrong VAT rate');
    expect(ctx.out()).not.toContain('Result: mapping OK');
  });

  const liabilities = { number: 'BSP-X-1_Liabilities', name: 'Liabilities', type: 'Liabilities' };
  const receivables = { number: 'BSP-X-1_Receivables', name: 'Receivables', type: 'Receivables' };
  const pairAt = (percent: number, cents: number) =>
    ledgerLine({
      debit: { number: `LiabilitiesVat:${percent}`, name: `LiabilitiesVat (${percent}%)`, type: 'VatOnLiabilities' },
      credit: liabilities,
      command: 'PostPrepaymentVat',
      grossCents: cents,
      taxes: germanTax(percent, cents),
      reference: 'BSP-X-1',
    });

  it('Untaxed deposit release: resolves through the inferred 7 % wildcard, never through the 0 % one, and exits 0', async () => {
    const release = ledgerLine({ debit: liabilities, credit: receivables, grossCents: 21_400, taxes: [], command: 'System', reference: 'BSP-X-1' });
    const mapping = (...rows: string[]) => csv('*;Receivables;;;1410;;;', '*;Liabilities;;7;1711;tax_ust_7_skr03;7;', '*;Liabilities;;19;1718;tax_ust_19_skr03;19;', ...rows);
    const args = ['mapping', 'check', '--property', BSP, '--from', '2026-09-14', '--to', '2026-09-14'];

    const paired = context({ 'mapping-BSP.csv': mapping('*;Liabilities;;0;1719;;0;') }, [release, pairAt(7, 1_400)]);
    expect(await runCli(args, paired.ctx)).toBe(0);
    expect(paired.ctx.out()).toContain('every booked account is mapped.');

    const unknown = context({ 'mapping-BSP.csv': mapping('*;Liabilities;;0;1719;;0;') }, [release]);
    expect(await runCli(args, unknown.ctx)).toBe(1);
    expect(unknown.ctx.out()).toMatch(/E-VAT-RATE-UNKNOWN .*1 deposit release .*account BSP-X-1_Liabilities/);
    expect(unknown.ctx.out()).toContain('deposit releases without a known VAT rate');
    expect(unknown.ctx.out()).not.toContain('1719');
    expect(unknown.ctx.out()).not.toContain('`*;Liabilities` at 0 %');
  });

  it('Untaxed deposit release without deposit rows: an inferred 19 % asks for a * Liabilities row at 19 % with the template example', async () => {
    const release = ledgerLine({ debit: liabilities, credit: receivables, grossCents: 11_900, taxes: [], reference: 'BSP-X-1' });
    const { ctx } = context({ 'mapping-BSP.csv': csv('*;Receivables;;;1410;;;', '*;Liabilities;;7;1711;tax_ust_7_skr03;7;') }, [release, pairAt(19, 1_900)]);
    expect(await runCli(['mapping', 'check', '--property', BSP, '--from', '2026-09-14', '--to', '2026-09-14'], ctx)).toBe(1);
    expect(ctx.out()).toContain('E-UNMAPPED');
    expect(ctx.out()).toContain('`*;Liabilities;;19;1718;tax_ust_19_skr03;19` from the SKR03 hotel template');
  });
});

describe('apaleo-odoo mapping usage', () => {
  it.each([
    [['mapping'], 'Usage: apaleo-odoo mapping check'],
    [['mapping', 'lint'], 'Usage: apaleo-odoo mapping check'],
    [['mapping', 'check', '--from', '2026-09-01'], '--from and --to go together'],
    [['mapping', 'check', '--from', '2026-09-31', '--to', '2026-10-01'], '--from must be a date'],
    [['mapping', 'check', '--from', '2026-09-02', '--to', '2026-09-01'], 'lies before'],
    [['mapping', 'check'], 'Name the mapping with --mapping'],
    [['mapping', 'check', '--mapping', 'x.csv', '--from', '2026-09-01', '--to', '2026-09-02'], 'needs --property'],
  ])('exits 2 on %j', async (argv, message) => {
    const { ctx } = context({});
    expect(await runCli(argv, ctx)).toBe(2);
    expect(ctx.err()).toContain(message);
  });
});
