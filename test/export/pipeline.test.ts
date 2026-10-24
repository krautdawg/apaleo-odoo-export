import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/core/config.js';
import { runExport, type ExportRequest } from '../../src/export/index.js';
import { buildBookings } from '../../src/posting/index.js';
import { ApaleoPermissionError } from '../../src/sources/apaleo/index.js';
import { BSP } from '../helpers/apaleo.js';
import { DE_MONTH, DE_ROWS, deMonthConfig } from '../helpers/de-month.js';
import { BEISPIEL_MAPPING_TEXT, addSecondProperty, exportConfig, exportSetup, withoutAustrianTaxes, type ExportSetup } from '../helpers/export.js';
import { renderMappingFile } from '../../src/mapping/index.js';

const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' } as const;

async function run(setup: ExportSetup, request: Partial<ExportRequest> = {}, post?: typeof buildBookings) {
  const { ctx, fake } = setup;
  const loaded = await loadConfig({ path: join(ctx.cwd, 'apaleo-odoo.config.yaml'), env: ctx.env, readFile: ctx.fs.readFile });
  const full: ExportRequest = { period: SEPTEMBER, propertyIds: [BSP], dryRun: false, overwrite: false, ...request };
  return runExport(full, { loaded, source: fake, ctx, ...(post ? { post } : {}) });
}

const exportsOf = (setup: ExportSetup) => join(setup.ctx.cwd, 'exports');
const FILE = 'ODOO_Buchungen_20260901-20260930_BSP.csv';
const PROTOCOL = 'ODOO_Buchungen_20260901-20260930_BSP.protokoll.txt';
const AT10_ROW = '(10%);10;4010;account_tax_template_sales_10_code029;10;';
const readMapping = () => BEISPIEL_MAPPING_TEXT;

describe('the period-part runner', () => {
  it('fetches the chart once per property and the ledger once per month through the source', async () => {
    const setup = exportSetup();
    const outcomes = await run(setup, { period: { from: '2026-08-25', to: '2026-09-30' } });
    expect(outcomes.map((o) => [o.part.month, o.status])).toEqual([
      ['2026-08', 'empty'],
      ['2026-09', 'written'],
    ]);
    expect(setup.fake.calls).toEqual([
      'listProperties',
      'getChartOfAccounts BSP',
      'getLedger BSP 2026-08-25 2026-09-01',
      'getLedger BSP 2026-09-01 2026-10-01',
    ]);
    expect(outcomes[0]?.findings.map((f) => f.code)).toEqual(['N-NO-BOOKINGS']);
  });

  it('renders the bookings through the Odoo writer with the settings of the odoo section: one entry per business day', async () => {
    const setup = exportSetup();
    const [outcome] = await run(setup);
    expect(outcome?.status).toBe('written');
    expect(outcome?.bookings).toBe(24);
    const path = join(exportsOf(setup), BSP, '2026-09', FILE);
    expect(outcome?.path).toBe(path);
    const csv = readFileSync(path, 'utf8');
    expect(csv.split('\n')[0]).toBe('id,ref,date,journal_id,line_ids/id,line_ids/account_id,line_ids/name,line_ids/debit,line_ids/credit,line_ids/tax_ids/id');
    expect(csv.match(/^apaleo_c1_BSP_2026\d{4},apaleo BSP 2026-09-\d\d,2026-09-\d\d,APA,/gm)).toHaveLength(5);
    // The first day: the Visa prepayment 220.00 at 10 % onto the deposit account 3510, net 200.00 with the l10n_at tax.
    expect(csv).toContain(',3510,Anzahlungen 10 %,0.00,200.00,account.1_account_tax_template_sales_10_code029\n');
    expect(csv).not.toContain('Müller');
    expect(csv).not.toContain('PSP-8823410001');
  });

  it('Protocol names company and journal: the import block names company 1 and journal APA, the manifest records both with entries, lines and VAT per tax', async () => {
    const setup = exportSetup();
    await run(setup);
    const folder = join(exportsOf(setup), BSP, '2026-09');
    const protocol = readFileSync(join(folder, PROTOCOL), 'utf8');
    expect(protocol).toContain('  Company: id 1 (odoo.companyId, the company that owns the taxes), journal APA, currency EUR');
    // Per line of the file, the apaleo entries and their receipts.
    expect(protocol).toContain('apaleo entries per line of the file (entry number and receipt or reference):');
    expect(protocol).toMatch(/^ {2}2026-09-14 3510 Anzahlungen 10 % credit 200\.00: BSPE\d+ \(PSP-8823410001\)$/m);
    const manifest = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8')) as { files: Record<string, unknown>[] };
    expect(manifest.files[0]).toMatchObject({ file: FILE, bookings: 24, currency: 'EUR', odooCompanyId: 1, odooJournal: 'APA', entries: 5 });
    expect(manifest.files[0]?.vatByTax).toEqual([
      expect.objectContaining({ tax: 'account.1_account_tax_template_sales_20_code022', ratePercent: 20 }),
      expect.objectContaining({ tax: 'account.1_account_tax_template_sales_10_code029', ratePercent: 10 }),
    ]);
    expect(manifest.files[0]).not.toHaveProperty('taxByMwstCode');
    expect(manifest.files[0]).not.toHaveProperty('mandant');
    expect(manifest.files[0]).not.toHaveProperty('geschaeftsbereich');
  });

  it('takes the journal of the property for the file', async () => {
    const setup = exportSetup({ config: exportConfig('    journal: APB') });
    await run(setup);
    const csv = readFileSync(join(exportsOf(setup), BSP, '2026-09', FILE), 'utf8');
    expect(csv).toContain(',2026-09-14,APB,');
  });

  it('stops a part on an E- finding of the coverage check or the posting rules, before writing', async () => {
    const unmapped = exportSetup({ files: { 'mapping-BSP.csv': readMapping().replace(/^RevenueFoodAndBeverages_Normal:20\.00;.*\r?\n/m, '') } });
    const [first] = await run(unmapped);
    expect(first?.status).toBe('failed');
    expect(first?.findings.filter((f) => f.code.startsWith('E-')).map((f) => [f.code, f.value])).toEqual([['E-UNMAPPED', 'RevenueFoodAndBeverages_Normal:20.00']]);
    expect(existsSync(exportsOf(unmapped))).toBe(false);

    const wrongRate = exportSetup({ files: { 'mapping-BSP.csv': readMapping().replace(AT10_ROW, '(10%);10;4000;account_tax_template_sales_20_code022;20;') } });
    const [second] = await run(wrongRate);
    expect(second?.status).toBe('failed');
    expect(new Set(second?.findings.filter((f) => f.code.startsWith('E-')).map((f) => f.code))).toEqual(new Set(['E-VAT-RATE']));
    expect(existsSync(exportsOf(wrongRate))).toBe(false);
  });

  it('Unmapped account blocks only its property: BSP fails with E-UNMAPPED, BSP2 is written', async () => {
    const setup = exportSetup({
      config: exportConfig('  - id: BSP2'),
      files: { 'mapping-BSP.csv': readMapping().replace(/^RevenueFoodAndBeverages_Normal:20\.00;.*\r?\n/m, ''), 'mapping-BSP2.csv': readMapping() },
      data: addSecondProperty,
    });
    const outcomes = await run(setup, { propertyIds: [BSP, 'BSP2'] });
    expect(outcomes.map((o) => [o.propertyId, o.status])).toEqual([
      [BSP, 'failed'],
      ['BSP2', 'written'],
    ]);
    expect(readdirSync(exportsOf(setup))).toEqual(['BSP2']);
  });

  it('reports a property the custom app cannot see and a missing mapping file per property', async () => {
    const setup = exportSetup({ config: exportConfig('  - id: HBW', '  - id: NOPE') });
    const outcomes = await run(setup, { propertyIds: [BSP, 'HBW', 'NOPE'] });
    expect(outcomes.map((o) => [o.propertyId, o.status, o.findings.filter((f) => f.code.startsWith('E-')).map((f) => f.code)])).toEqual([
      [BSP, 'written', []],
      ['HBW', 'failed', ['E-EXPORT']],
      ['NOPE', 'failed', ['E-PROPERTY-UNKNOWN']],
    ]);
    expect(outcomes[1]?.findings[0]?.message).toContain('No mapping file at');
    expect(outcomes[1]?.findings[0]?.message).toContain('init-mapping --property <id> --template skr03-hotel');
  });

  it('refuses a DATEV mapping file and names init-mapping --template skr03-hotel', async () => {
    const datev = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;datev_account;bu_key;datev_vat_percent;kost1;kost2;comment\r\n';
    const setup = exportSetup({ files: { 'mapping-BSP.csv': datev } });
    const [outcome] = await run(setup);
    expect(outcome?.status).toBe('failed');
    expect(outcome?.findings.map((f) => f.code)).toEqual(['E-EXPORT']);
    expect(outcome?.findings[0]?.message).toContain('this is a DATEV mapping');
    expect(outcome?.findings[0]?.message).toContain('--template skr03-hotel');
  });

  it('refuses a BMD and an Abacus mapping file and names init-mapping --template skr03-hotel', async () => {
    const bmd = readFileSync(new URL('../fixtures/mapping/ekr-beispiel.csv', import.meta.url), 'utf8');
    const [outcome] = await run(exportSetup({ files: { 'mapping-BSP.csv': bmd } }));
    expect(outcome?.status).toBe('failed');
    expect(outcome?.findings[0]?.message).toContain('this is a BMD mapping');
    expect(outcome?.findings[0]?.message).toContain('--template skr03-hotel');
    const abacus = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;abacus_account;mwst_code;mwst_percent;kost;comment\r\n';
    const [refused] = await run(exportSetup({ files: { 'mapping-BSP.csv': abacus } }));
    expect(refused?.findings[0]?.message).toContain('this is an Abacus mapping');
  });

  it('Swiss property in a EUR company: E-CURRENCY names CHF and EUR, says that the Odoo file books in the company currency, and reads no ledger', async () => {
    const setup = exportSetup({
      data: (data) => {
        for (const property of data.properties) property.currency = 'CHF';
      },
    });
    const [outcome] = await run(setup);
    expect(outcome?.status).toBe('failed');
    expect(outcome?.findings.map((f) => [f.code, f.value])).toEqual([['E-CURRENCY', 'CHF']]);
    expect(outcome?.findings[0]?.message).toContain('but the export file books in EUR only');
    expect(outcome?.findings[0]?.message).toContain(
      'An Odoo company books its journal entries in one currency (odoo.currency), and the tool does not convert, so every property must book in that currency. This tool does not convert.',
    );
    expect(setup.fake.calls.some((call) => call.startsWith('getLedger'))).toBe(false);
    expect(existsSync(exportsOf(setup))).toBe(false);
  });

  it('Line in another currency: E-CURRENCY names the number of such lines and both currencies, and no file is written', async () => {
    const setup = exportSetup({
      data: (data) => {
        const [line] = data.ledger[BSP] ?? [];
        if (line) line.currency = 'USD';
      },
    });
    const [outcome] = await run(setup);
    expect(outcome?.status).toBe('failed');
    expect(outcome?.findings.map((f) => [f.code, f.value])).toEqual([['E-CURRENCY', 'USD']]);
    expect(outcome?.findings[0]?.message).toContain('1 apaleo line(s) of BSP are in USD');
    expect(outcome?.findings[0]?.message).toContain('but the export file books in EUR only');
    expect(existsSync(exportsOf(setup))).toBe(false);
  });

  it('writes nothing in a dry run but reports what a real run would do', async () => {
    const setup = exportSetup();
    const [outcome] = await run(setup, { dryRun: true });
    expect(outcome?.status).toBe('checked');
    expect(outcome?.plan).toBe('write');
    expect(outcome?.summary).toContain('Totals per Odoo account');
    expect(outcome?.summary).toContain('Import into Odoo Accounting');
    expect(readdirSync(setup.ctx.cwd).sort()).toEqual(['apaleo-odoo.config.yaml', 'mapping-BSP.csv']);
  });

  it('warns about the taxes of the mapping rows the month uses in the dry run and the protocol, without mapping check', async () => {
    const [dry] = await run(exportSetup(), { dryRun: true });
    expect(dry?.status).toBe('checked');
    expect(dry?.findings.map((f) => [f.code, f.value])).toEqual([
      ['W-TAX-UNCHECKED', 'account_tax_template_sales_10_code029'],
      ['W-TAX-UNCHECKED', 'account_tax_template_sales_20_code022'],
    ]);
    // Line 4 (RevenueAccommodation_Normal:20.00) is not booked in September, so it is not named.
    expect(dry?.findings.map((f) => f.message.replace(/ of the mapping file:.*/, ''))).toEqual(['lines 3, 6, 15', 'line 7']);
    expect(dry?.summary).toContain('W-TAX-UNCHECKED');
  });

  it('Swapped tax on a used row: E-TAX-RATE-WRONG names the mapping line, the tax and both rates, and no file is written', async () => {
    const swapped = DE_ROWS.map((row) => (row.apaleoAccount === 'RevenueAccommodation_Reduced:7.00' ? { ...row, odooTax: 'tax_ust_19_skr03' } : row));
    // Without the 19 % lines of the month, so tax_ust_19_skr03 has one rate in the file and only E-TAX-RATE-WRONG stops it.
    const withoutNineteen = (data: typeof DE_MONTH) => {
      Object.assign(data, structuredClone(DE_MONTH));
      data.ledger[BSP] = (data.ledger[BSP] ?? []).filter((line) => !line.taxes.some((tax) => tax.percent === 19));
    };
    const setup = exportSetup({ config: deMonthConfig(), files: { 'mapping-BSP.csv': new TextDecoder().decode(renderMappingFile([], swapped)) }, data: withoutNineteen });
    const [outcome] = await run(setup);
    expect(outcome?.status).toBe('failed');
    expect(outcome?.findings.filter((f) => !f.code.startsWith('N-')).map((f) => [f.code, f.value])).toEqual([['E-TAX-RATE-WRONG', 'tax_ust_19_skr03']]);
    const line = swapped.findIndex((row) => row.apaleoAccount === 'RevenueAccommodation_Reduced:7.00') + 2;
    const finding = outcome?.findings.find((f) => f.code === 'E-TAX-RATE-WRONG');
    expect(finding?.message).toContain(`line ${line} of the mapping file: the Odoo tax tax_ust_19_skr03 has the rate 19 % in Odoo, but the row books it at 7 %`);
    expect(finding?.message).toContain('Automatic Balancing Line');
    expect(outcome?.summary).toContain('E-TAX-RATE-WRONG');
    expect(existsSync(exportsOf(setup))).toBe(false);
  });

  it('Tax used at two rates: two rows with tax_ust_19_skr03 at 7 % and 19 % give E-TAX-RATES naming the tax, both rates and both rows, and no file', async () => {
    const twice = DE_ROWS.map((row) => (row.apaleoAccount === 'RevenueAccommodation_Reduced:7.00' ? { ...row, odooTax: 'tax_ust_19_skr03' } : row));
    const setup = exportSetup({ config: deMonthConfig(), files: { 'mapping-BSP.csv': new TextDecoder().decode(renderMappingFile([], twice)) }, data: (data) => Object.assign(data, structuredClone(DE_MONTH)) });
    const lines = ['RevenueAccommodation_Reduced:7.00', 'RevenueFoodAndBeverages_Normal:19.00', 'RevenueOther_Normal:19.00'].map((n) => twice.findIndex((row) => row.apaleoAccount === n) + 2).sort((a, b) => a - b);
    const [outcome] = await run(setup);
    expect(outcome?.status).toBe('failed');
    const finding = outcome?.findings.find((f) => f.code === 'E-TAX-RATES');
    expect(finding?.message).toContain(`the tax tax_ust_19_skr03 is booked at 7 % and 19 % in this file (lines ${lines.join(', ')} of the mapping file)`);
    expect(existsSync(exportsOf(setup))).toBe(false);
  });

  it('Odoo is the default target and One rate per tax: the German month with the SKR03 template writes ODOO_Buchungen_20260901-20260930_BSP.csv, no E-TAX-RATES, no Abacus file', async () => {
    const setup = exportSetup({ config: deMonthConfig(), files: { 'mapping-BSP.csv': new TextDecoder().decode(renderMappingFile([], DE_ROWS)) }, data: (data) => Object.assign(data, structuredClone(DE_MONTH)) });
    const [outcome] = await run(setup);
    expect(outcome?.status).toBe('written');
    expect(outcome?.findings.map((f) => f.code)).toEqual(['N-ODOO-ROUNDING-LINE', 'N-ODOO-ROUNDING-LINE', 'N-ODOO-ROUNDING-LINE']);
    expect(readdirSync(join(exportsOf(setup), BSP, '2026-09')).sort()).toEqual([FILE, PROTOCOL, 'manifest.json'].sort());
    expect(readFileSync(join(exportsOf(setup), BSP, '2026-09', FILE), 'utf8')).toContain('account.1_tax_ust_7_skr03');
  });

  it('EUR property in a CHF company: E-CURRENCY names EUR and CHF, says that the Odoo file books in the company currency, and reads no ledger', async () => {
    const setup = exportSetup({ config: exportConfig().replace('version: 18\n', 'version: 18\n  currency: CHF\n') });
    const [outcome] = await run(setup);
    expect(outcome?.status).toBe('failed');
    expect(outcome?.findings.map((f) => [f.code, f.value])).toEqual([['E-CURRENCY', 'EUR']]);
    expect(outcome?.findings[0]?.message).toContain('but the export file books in CHF only');
    expect(outcome?.findings[0]?.message).toContain('An Odoo company books its journal entries in one currency (odoo.currency)');
    expect(setup.fake.calls.some((call) => call.startsWith('getLedger'))).toBe(false);
    expect(existsSync(exportsOf(setup))).toBe(false);
  });

  it('German property: no E-CURRENCY with odoo.currency EUR; Swiss company: a CHF property with odoo.currency CHF is written too', async () => {
    const chf = exportSetup({
      config: exportConfig().replace('version: 18\n', 'version: 18\n  currency: CHF\n'),
      data: (data) => {
        for (const property of data.properties) property.currency = 'CHF';
        for (const line of data.ledger[BSP] ?? []) line.currency = 'CHF';
      },
    });
    const [outcome] = await run(chf);
    expect(outcome?.status).toBe('written');
    expect(outcome?.findings.map((f) => f.code)).not.toContain('E-CURRENCY');
    expect(readFileSync(join(exportsOf(chf), BSP, '2026-09', PROTOCOL), 'utf8')).toContain('currency CHF');
  });

});

describe('plausibility checks in the pipeline', () => {
  it('Side bug is caught: blocks the file when a defect writes a booking with debit and credit account swapped', async () => {
    const setup = exportSetup();
    const sideBug: typeof buildBookings = (...args) => {
      const result = buildBookings(...args);
      // The 98.00 logis charge: the folio 2000 is debited in apaleo; written the other way round.
      const booking = result.bookings[1];
      if (booking?.vat) {
        [booking.debit, booking.credit] = [booking.credit, booking.debit];
        booking.vat.side = booking.vat.side === 'credit' ? 'debit' : 'credit';
      }
      return result;
    };
    const [outcome] = await run(setup, {}, sideBug);
    expect(outcome?.status).toBe('failed');
    const [first] = withoutAustrianTaxes(outcome?.findings ?? []);
    expect(first?.code).toBe('E-ACCOUNT-BALANCE');
    expect(first?.message).toMatch(/^on 2026-09-14 account \d+ moves -?\d+\.\d\d in the bookings, but the apaleo lines mapped to it move .* \(Soll positive, Haben negative\)/);
    expect(existsSync(exportsOf(setup))).toBe(false);
  });

  it('blocks the file when a defect drops a line', async () => {
    const setup = exportSetup();
    const dropBug: typeof buildBookings = (...args) => {
      const result = buildBookings(...args);
      return { ...result, bookings: result.bookings.slice(1) };
    };
    const [outcome] = await run(setup, {}, dropBug);
    expect(outcome?.findings.map((f) => f.code)).toContain('E-CONSERVATION');
    expect(existsSync(exportsOf(setup))).toBe(false);
  });

  it('sends no aggregate request unless checks.aggregates is true', async () => {
    const setup = exportSetup();
    await run(setup);
    expect(setup.fake.calls.filter((call) => call.startsWith('getAccountTotals'))).toEqual([]);
  });

  it('with checks.aggregates, warns about a difference and still writes the file', async () => {
    const setup = exportSetup({
      config: `${exportConfig()}checks:\n  aggregates: true\n`,
      data: (data) => {
        const day = data.totals?.[BSP]?.find((t) => t.businessDate === '2026-09-15');
        const revenue = day?.accounts.find((a) => a.account.number === 'RevenueAccommodation_VeryReduced:10.00');
        if (revenue) revenue.balance.value = '-1.00';
      },
    });
    const [outcome] = await run(setup);
    expect(setup.fake.calls.filter((call) => call.startsWith('getAccountTotals'))).toHaveLength(30);
    expect(outcome?.status).toBe('written');
    const findings = withoutAustrianTaxes(outcome?.findings ?? []);
    expect(findings.map((f) => [f.code, f.value])).toEqual([['W-AGGREGATE-DIFF', 'RevenueAccommodation_VeryReduced:10.00']]);
    expect(findings[0]?.message).toContain("on 2026-09-15 apaleo's daily aggregate for account RevenueAccommodation_VeryReduced:10.00 (Revenues) has the balance -1.00");
  });

  it('with checks.aggregates, blocks the part with a hint when apaleo refuses the aggregates', async () => {
    const setup = exportSetup({ config: `${exportConfig()}checks:\n  aggregates: true\n` });
    setup.fake.getAccountTotals = async () => {
      throw new ApaleoPermissionError('the daily aggregates');
    };
    const [outcome] = await run(setup);
    expect(outcome?.status).toBe('failed');
    const [first] = withoutAustrianTaxes(outcome?.findings ?? []);
    expect(first?.code).toBe('E-AGGREGATE-CHECK');
    expect(first?.message).toContain('core.subledger_aggregate.create, or set checks.aggregates: false');
  });
});

