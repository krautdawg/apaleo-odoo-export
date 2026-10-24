import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run.js';
import type { LedgerLine } from '../../src/core/source.js';
import { BSP, FIXTURE_FILES, loadBeispielData } from '../helpers/apaleo.js';
import { createTestContext } from '../helpers/context.js';
import { FakeSource } from '../helpers/fake-source.js';
import { ledgerLine, tax } from '../helpers/ledger.js';
import { ACCOUNTS, charge, swissTax } from '../helpers/posting.js';
import { SWISS_CHART } from '../helpers/swiss-chart.js';

const CONFIG = FIXTURE_FILES['apaleo-abacus.config.yaml'];
const HEADER = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;abacus_account;mwst_code;mwst_percent;kost;comment';
const csv = (...lines: string[]) => [HEADER, ...lines].map((l) => `${l}\r\n`).join('');
const ACC38 = 'RevenueAccommodation_Special:3.80';

const VALID = csv(
  `${ACC38};Revenues;Revenues Accommodation (3.8%);3.8;3400;313;3.8;;`,
  '1102;Payments;Visa Credit Card Payment;;1090;;;;',
  '*;Payments;;;1090;;;;',
  '*;Liabilities;;3.8;2030;313;3.8;;',
  '*;AccountsReceivable;;;1102;;;;',
  '3501;CityTaxes;Kurtaxe;0;;;;;',
);

const BEISPIEL = await loadBeispielData();

/** A fake apaleo with the Swiss test chart for BSP and the given ledger (default: the Hotel Beispiel lines). */
function context(files: Record<string, string>, ledger?: LedgerLine[], config = CONFIG) {
  const data = structuredClone(BEISPIEL);
  data.charts[BSP] = [...SWISS_CHART];
  if (ledger) data.ledger[BSP] = ledger;
  const fake = new FakeSource(data);
  const ctx = createTestContext({ files: { 'apaleo-abacus.config.yaml': config, ...files }, sourceFactory: () => fake });
  return { ctx, fake };
}

describe('apaleo-abacus mapping check (offline)', () => {
  it('Valid mapping: prints a summary of rows by type and exits 0', async () => {
    const { ctx, fake } = context({ 'mapping-BSP.csv': VALID });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(0);
    expect(ctx.out()).toContain(`Mapping file: ${join(ctx.cwd, 'mapping-BSP.csv')} (6 rows, abacus.mwstCodes 311 8.1 %, 312 2.6 %, 313 3.8 %)`);
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

  it('MWST-Code on a receivables row: E-MWST-CODE-NOT-ALLOWED and exit 1', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv('1200;Receivables;Receivables;;1101;313;3.8;;') });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(1);
    expect(ctx.out()).toContain('E-MWST-CODE-NOT-ALLOWED');
    expect(ctx.out()).toContain('line 2: apaleo type Receivables is a payment, guest claim or Debitor');
    expect(ctx.out()).toContain('Result: 1 error, 0 warnings.');
  });

  it('checks the configured abacus.mwstCodes: swapped codes warn W-MWST-CODE-RATE, a foreign code W-MWST-CODE-UNCHECKED', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv('RevenueOther_Normal:8.10;Revenues;Other;8.1;3500;313;8.1;;', `${ACC38};Revenues;A;3.8;3400;V38;3.8;;`) });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(0);
    expect(ctx.out()).toContain('W-MWST-CODE-RATE');
    expect(ctx.out()).toContain('W-MWST-CODE-UNCHECKED');
    expect(ctx.out()).toContain('Result: mapping OK (2 warnings).');

    const own = context({ 'mapping-BSP.csv': csv(`${ACC38};Revenues;A;3.8;3400;V38;3.8;;`) }, undefined, CONFIG.replace('  mandant: 1234\n', '  mandant: 1234\n  mwstCodes:\n    beherbergung: V38\n'));
    expect(await runCli(['mapping', 'check', '--property', BSP], own.ctx)).toBe(0);
    expect(own.ctx.out()).toContain('Result: mapping OK.');
  });

  it('Account with letters: E-ACCOUNT-FORMAT names the rule of 1 to 11 digits', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv('1102;Payments;Visa;;10A0;;;;') });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(1);
    expect(ctx.out()).toContain('E-ACCOUNT-FORMAT');
    expect(ctx.out()).toContain('1 to 11 digits');
  });

  it('VAT mismatch: reports both rates', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv(`${ACC38};Revenues;Revenues Accommodation (3.8%);3.8;3500;311;8.1;;`) });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(1);
    expect(ctx.out()).toMatch(/E-VAT-MISMATCH .*VAT 3\.8 %.*books 8\.1 %/);
  });

  it('warns about untaxed revenue, an unusual rate and a Kostenstelle on a payment, and still passes', async () => {
    const { ctx } = context({
      'mapping-BSP.csv': csv('RevenueAccommodation_Without:0.00;Revenues;No VAT;0;3600;;0;;', 'R7;Revenues;German;7;3400;V7;7;;', '1102;Payments;Visa;;1090;;;10;'),
    });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(0);
    expect(ctx.out()).toContain('W-UNTAXED-REVENUE');
    expect(ctx.out()).toContain('W-VAT-RATE-UNUSUAL');
    expect(ctx.out()).toContain('W-MWST-CODE-UNCHECKED');
    expect(ctx.out()).toContain('W-KOST-IGNORED');
    expect(ctx.out()).toContain('Result: mapping OK (4 warnings).');
  });

  it('Duplicate key: fails with exit 1, naming both lines', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': csv('R38;Revenues;A;3.8;3400;313;3.8;;', 'R38;Revenues;A;3.8;3410;313;3.8;;') });
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(1);
    expect(ctx.err()).toContain('lines 2 and 3 both map apaleo account R38 of type Revenues');
  });

  it('fails with exit 1 and a hint when the mapping file is missing', async () => {
    const { ctx } = context({});
    expect(await runCli(['mapping', 'check', '--property', BSP], ctx)).toBe(1);
    expect(ctx.err()).toContain('No mapping file at');
    expect(ctx.err()).toContain('init-mapping --property <id> --template kmu-hotel');
  });

  it('Old DATEV mapping: refused with init-mapping --template kmu-hotel', async () => {
    const datev = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;datev_account;bu_key;datev_vat_percent;kost1;kost2;comment\r\n5011;Revenues;A;7;8300;;7;;;\r\n';
    const { ctx } = context({ 'old.csv': datev });
    expect(await runCli(['mapping', 'check', '--mapping', 'old.csv'], ctx)).toBe(1);
    expect(ctx.err()).toContain('this is a DATEV mapping');
    expect(ctx.err()).toContain('init-mapping --property <id> --template kmu-hotel');
  });

  it('Account export of a paid connector: refused with --accounts-from and no vendor name', async () => {
    const { ctx } = context({ 'konten.csv': 'Apaleo Kontonummer;Kontoname;Kontotyp;Abacus Kontonummer;Kostenstelle\r\n5011;Logis;Revenues;3410;20\r\n' });
    expect(await runCli(['mapping', 'check', '--mapping', 'konten.csv'], ctx)).toBe(1);
    expect(ctx.err()).toContain('the account export of a paid connector');
    expect(ctx.err()).toContain('--accounts-from <file>');
    expect(ctx.err()).not.toMatch(/grman/i);
  });

  it('exits 2 naming the unknown flag --skr of the DATEV tool', async () => {
    const { ctx } = context({ 'mapping-BSP.csv': VALID });
    expect(await runCli(['mapping', 'check', '--property', BSP, '--skr', '03'], ctx)).toBe(2);
    expect(ctx.err()).toContain('--skr');
  });
});

describe('apaleo-abacus mapping check --from --to', () => {
  it('New revenue account: fails with E-UNMAPPED for 5010, naming type, name, line count and gross total', async () => {
    const credit = { number: '5010', name: 'Spa', type: 'Revenues' };
    const ledger = [
      charge({ credit, grossCents: 4000, taxes: [] }),
      charge({ credit, grossCents: 6000, taxes: [], businessDate: '2026-09-15', sourceEntryNumber: 'BSPE0002' }),
    ];
    const { ctx, fake } = context({ 'mapping-BSP.csv': csv('*;Receivables;;;1101;;;;') }, ledger);
    expect(await runCli(['mapping', 'check', '--property', BSP, '--from', '2026-09-14', '--to', '2026-09-15'], ctx)).toBe(1);
    expect(fake.calls).toContain(`getLedger ${BSP} 2026-09-14 2026-09-16`);
    expect(ctx.out()).toContain('Checked 2 ledger lines of BSP from 2026-09-14 to 2026-09-15: 1 unmapped account(s).');
    expect(ctx.out()).toContain('E-UNMAPPED');
    expect(ctx.out()).toContain('apaleo account 5010 (Revenues, "Spa") is not mapped (2 lines, gross 100.00)');
  });

  it('Kurtaxe is not pre-filled: the empty Kurtaxe row of a fresh init-mapping file is E-UNMAPPED until it is filled in, then passes', async () => {
    const ledger = [
      charge(),
      ledgerLine({ debit: ACCOUNTS.receivables, credit: ACCOUNTS.cityTax, currency: 'CHF', grossCents: 350, taxes: [tax('Without', 0, 0)], sourceEntryNumber: 'BSPE0002' }),
      ledgerLine({ debit: ACCOUNTS.visa, credit: ACCOUNTS.receivables, command: 'PostPayment', currency: 'CHF', grossCents: 21_110, taxes: [], sourceEntryNumber: 'BSPE0003' }),
    ];
    const { ctx } = context({}, ledger);
    expect(await runCli(['init-mapping', '--property', BSP, '--template', 'kmu-hotel'], ctx)).toBe(0);
    const period = ['mapping', 'check', '--property', BSP, '--from', '2026-09-14', '--to', '2026-09-22'];
    expect(await runCli(period, ctx)).toBe(1);
    const unmapped = ctx.out().split('\n').filter((line) => line.startsWith('E-UNMAPPED'));
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]).toContain('apaleo account 3501 (CityTaxes, "Kurtaxe")');

    const path = join(ctx.cwd, 'mapping-BSP.csv');
    const text = (await ctx.fs.readFile(path, 'utf8')).replace(/^3501;CityTaxes;Kurtaxe;0;;/m, '3501;CityTaxes;Kurtaxe;0;2210;');
    const after = context({ 'mapping-BSP.csv': text }, ledger);
    expect(await runCli(period, after.ctx)).toBe(0);
    expect(after.ctx.out()).not.toMatch(/^E-/m);
    expect(after.ctx.out()).toContain('every booked account is mapped.');
    expect(after.ctx.out()).toContain('Result: mapping OK');
  });

  it('Parent row with the wrong VAT rate: 5000 on 3500 at 8.1 % fails with E-VAT-MISMATCH for 5011 and 5111 booked at 3.8 %', async () => {
    const parent = csv('5000;Revenues;Revenues;;3500;311;8.1;;', '*;Receivables;;;1101;;;;');
    const logis = { number: '5011', name: 'Logis', type: 'Revenues', parentNumber: '5000' };
    const breakfast = { number: '5111', name: 'Frühstück im Zimmerpreis', type: 'Revenues', parentNumber: '5000' };
    const ledger = [charge({ credit: logis }), charge({ credit: breakfast, grossCents: 2_076, netCents: 2_000, taxes: swissTax(3.8, 76), sourceEntryNumber: 'BSPE0002' })];
    const args = ['mapping', 'check', '--property', BSP, '--from', '2026-09-14', '--to', '2026-09-22'];
    const { ctx } = context({ 'mapping-BSP.csv': parent }, ledger);
    expect(await runCli(args, ctx)).toBe(1);
    const mismatches = ctx.out().split('\n').filter((line) => line.startsWith('E-VAT-MISMATCH'));
    expect(mismatches).toHaveLength(2);
    expect(mismatches.some((line) => line.includes('apaleo account 5011 (Revenues') && line.includes('books 8.1 % on Abacus account 3500'))).toBe(true);
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
      taxes: swissTax(percent, cents),
      reference: 'BSP-X-1',
    });

  it('Untaxed deposit release: resolves through the inferred 3.8 % wildcard, never through the 0 % one, and exits 0', async () => {
    const release = ledgerLine({ debit: liabilities, credit: receivables, grossCents: 20_760, taxes: [], command: 'System', reference: 'BSP-X-1' });
    const mapping = (...rows: string[]) => csv('*;Receivables;;;1101;;;;', '*;Liabilities;;3.8;2030;313;3.8;;', '*;Liabilities;;8.1;2031;311;8.1;;', ...rows);
    const args = ['mapping', 'check', '--property', BSP, '--from', '2026-09-14', '--to', '2026-09-14'];

    const paired = context({ 'mapping-BSP.csv': mapping('*;Liabilities;;0;2039;;0;;') }, [release, pairAt(3.8, 760)]);
    expect(await runCli(args, paired.ctx)).toBe(0);
    expect(paired.ctx.out()).toContain('every booked account is mapped.');

    const unknown = context({ 'mapping-BSP.csv': mapping('*;Liabilities;;0;2039;;0;;') }, [release]);
    expect(await runCli(args, unknown.ctx)).toBe(1);
    expect(unknown.ctx.out()).toMatch(/E-VAT-RATE-UNKNOWN .*1 deposit release .*account BSP-X-1_Liabilities/);
    expect(unknown.ctx.out()).toContain('deposit releases without a known VAT rate');
    expect(unknown.ctx.out()).not.toContain('2039');
    expect(unknown.ctx.out()).not.toContain('wildcard row (*) for Liabilities at 0 %');
  });

  it('Untaxed deposit release without deposit rows: an inferred 8.1 % asks for a * Liabilities row at 8.1 %', async () => {
    const release = ledgerLine({ debit: liabilities, credit: receivables, grossCents: 10_810, taxes: [], reference: 'BSP-X-1' });
    const { ctx } = context({ 'mapping-BSP.csv': csv('*;Receivables;;;1101;;;;', '*;Liabilities;;3.8;2030;313;3.8;;') }, [release, pairAt(8.1, 810)]);
    expect(await runCli(['mapping', 'check', '--property', BSP, '--from', '2026-09-14', '--to', '2026-09-14'], ctx)).toBe(1);
    expect(ctx.out()).toContain('E-UNMAPPED');
    expect(ctx.out()).toContain('`*;Liabilities;;8.1;<Abacus account>;311;8.1` (template: 2031)');
  });
});

describe('apaleo-abacus mapping usage', () => {
  it.each([
    [['mapping'], 'Usage: apaleo-abacus mapping check'],
    [['mapping', 'lint'], 'Usage: apaleo-abacus mapping check'],
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
