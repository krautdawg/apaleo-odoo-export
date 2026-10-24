import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/core/config.js';
import { runExport, type ExportRequest } from '../../src/export/index.js';
import { buildBookings } from '../../src/posting/index.js';
import { ApaleoPermissionError } from '../../src/sources/apaleo/index.js';
import { block, transaction, value } from '../helpers/abacus.js';
import { BSP } from '../helpers/apaleo.js';
import { BEISPIEL_MAPPING_TEXT, addSecondProperty, exportConfig, exportSetup, withoutPlaceholderCodes, type ExportSetup } from '../helpers/export.js';

const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' } as const;

async function run(setup: ExportSetup, request: Partial<ExportRequest> = {}, post?: typeof buildBookings) {
  const { ctx, fake } = setup;
  const loaded = await loadConfig({ path: join(ctx.cwd, 'apaleo-abacus.config.yaml'), env: ctx.env, readFile: ctx.fs.readFile });
  const full: ExportRequest = { period: SEPTEMBER, propertyIds: [BSP], dryRun: false, overwrite: false, ...request };
  return runExport(full, { loaded, source: fake, ctx, ...(post ? { post } : {}) });
}

const exportsOf = (setup: ExportSetup) => join(setup.ctx.cwd, 'exports');
const FILE = 'ABACUS_Buchungen_20260901-20260930_BSP.xml';
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

  it('renders the bookings through the Abacus writer with the settings of the abacus section', async () => {
    const setup = exportSetup();
    const [outcome] = await run(setup);
    expect(outcome?.status).toBe('written');
    expect(outcome?.bookings).toBe(24);
    const path = join(exportsOf(setup), BSP, '2026-09', FILE);
    expect(outcome?.path).toBe(path);
    const xml = readFileSync(path, 'utf8');
    expect(value(block(xml, 'Parameter'), 'Mandant')).toBe('1234');
    expect(xml.match(/<Transaction /g)).toHaveLength(24);
    // The first line of the month: the Visa prepayment 220.00 at 10 % onto the deposit account.
    const first = transaction(xml, 1);
    expect([value(block(first, 'CollectiveInformation'), 'Account'), value(block(first, 'SingleInformation'), 'Account')]).toEqual(['1090', '2030']);
    expect(value(first, 'DebitCredit')).toBe('D');
    expect(value(first, 'KeyAmount')).toBe('220.00');
    expect(value(block(first, 'TaxData'), 'KeyAmount')).toBe('-20.00');
    expect(value(block(first, 'TaxData'), 'TaxCode')).toBe('V10');
    expect([value(first, 'Text1'), value(first, 'Text2')]).toEqual(['Anzahlung 10 %', 'PSP-8823410001']);
    expect(xml).not.toContain('Müller');
  });

  it('writes the Mandant and the Geschäftsbereich of each property', async () => {
    const setup = exportSetup({
      config: exportConfig('    mandant: 4321', '    geschaeftsbereich: 3'),
    });
    await run(setup);
    const xml = readFileSync(join(exportsOf(setup), BSP, '2026-09', FILE), 'utf8');
    expect(value(block(xml, 'Parameter'), 'Mandant')).toBe('4321');
    expect(value(transaction(xml, 1), 'Division')).toBe('3');
    expect(value(transaction(xml, 1), 'Client')).toBe('4321');
  });

  it('warns W-MANDANT-SHARED in the protocol of each property that shares a Mandant and Geschäftsbereich', async () => {
    const config = (...lines: string[]) => exportConfig('  - id: BS2', ...lines);
    const setup = (text: string) => exportSetup({ config: text, files: { 'mapping-BS2.csv': readMapping() }, data: (data) => addSecondProperty(data, 'BS2') });
    const shared = setup(config());
    const both = await run(shared, { propertyIds: [BSP, 'BS2'] });
    expect(both.map((o) => [o.propertyId, o.status, withoutPlaceholderCodes(o.findings).map((f) => f.code)])).toEqual([
      [BSP, 'written', ['W-MANDANT-SHARED']],
      ['BS2', 'written', ['W-MANDANT-SHARED']],
    ]);
    expect(readFileSync(join(exportsOf(shared), 'BS2', '2026-09', 'ABACUS_Buchungen_20260901-20260930_BS2.protokoll.txt'), 'utf8')).toContain(
      'the properties BSP, BS2 all book into the Abacus Mandant 1234, Geschäftsbereich 0',
    );
    const own = await run(setup(config('    geschaeftsbereich: 2')), { propertyIds: [BSP, 'BS2'] });
    expect(own.map((o) => withoutPlaceholderCodes(o.findings).map((f) => f.code))).toEqual([[], []]);
  });

  it('stops a part on an E- finding of the coverage check or the posting rules, before writing', async () => {
    const unmapped = exportSetup({ files: { 'mapping-BSP.csv': readMapping().replace(/^RevenueFoodAndBeverages_Normal:20\.00;.*\r?\n/m, '') } });
    const [first] = await run(unmapped);
    expect(first?.status).toBe('failed');
    expect(first?.findings.filter((f) => f.code.startsWith('E-')).map((f) => [f.code, f.value])).toEqual([['E-UNMAPPED', 'RevenueFoodAndBeverages_Normal:20.00']]);
    expect(existsSync(exportsOf(unmapped))).toBe(false);

    const wrongRate = exportSetup({ files: { 'mapping-BSP.csv': readMapping().replace('(10%);10;3400;V10;10;', '(10%);10;3500;V20;20;') } });
    const [second] = await run(wrongRate);
    expect(second?.status).toBe('failed');
    expect(new Set(second?.findings.filter((f) => f.code.startsWith('E-')).map((f) => f.code))).toEqual(new Set(['E-VAT-RATE']));
    expect(existsSync(exportsOf(wrongRate))).toBe(false);
  });

  it('isolates property-months: an unmapped account blocks only its property', async () => {
    const setup = exportSetup({
      config: exportConfig('  - id: BSP2', '    geschaeftsbereich: 2'),
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
    const setup = exportSetup({ config: exportConfig('  - id: HBW', '    geschaeftsbereich: 2', '  - id: NOPE', '    geschaeftsbereich: 3') });
    const outcomes = await run(setup, { propertyIds: [BSP, 'HBW', 'NOPE'] });
    expect(outcomes.map((o) => [o.propertyId, o.status, o.findings.filter((f) => f.code.startsWith('E-')).map((f) => f.code)])).toEqual([
      [BSP, 'written', []],
      ['HBW', 'failed', ['E-EXPORT']],
      ['NOPE', 'failed', ['E-PROPERTY-UNKNOWN']],
    ]);
    expect(outcomes[1]?.findings[0]?.message).toContain('No mapping file at');
    expect(outcomes[1]?.findings[0]?.message).toContain('init-mapping --property <id> --template kmu-hotel');
  });

  it('refuses a DATEV mapping file and names init-mapping --template kmu-hotel', async () => {
    const datev = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;datev_account;bu_key;datev_vat_percent;kost1;kost2;comment\r\n';
    const setup = exportSetup({ files: { 'mapping-BSP.csv': datev } });
    const [outcome] = await run(setup);
    expect(outcome?.status).toBe('failed');
    expect(outcome?.findings.map((f) => f.code)).toEqual(['E-EXPORT']);
    expect(outcome?.findings[0]?.message).toContain('this is a DATEV mapping');
    expect(outcome?.findings[0]?.message).toContain('--template kmu-hotel');
  });

  it('refuses a BMD mapping file and names init-mapping --template kmu-hotel', async () => {
    const bmd = readFileSync(new URL('../fixtures/mapping/ekr-beispiel.csv', import.meta.url), 'utf8');
    const [outcome] = await run(exportSetup({ files: { 'mapping-BSP.csv': bmd } }));
    expect(outcome?.status).toBe('failed');
    expect(outcome?.findings[0]?.message).toContain('this is a BMD mapping');
    expect(outcome?.findings[0]?.message).toContain('--template kmu-hotel');
  });

  it('refuses a property that does not keep its books in the Leitwährung of the Mandant (EUR), before reading its ledger', async () => {
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
      "An Abacus booking is written in the Mandant's Leitwährung (abacus.leitwaehrung), without foreign-currency data, so every property must book in that currency. This tool does not convert.",
    );
    expect(setup.fake.calls.some((call) => call.startsWith('getLedger'))).toBe(false);
    expect(existsSync(exportsOf(setup))).toBe(false);
  });

  it('refuses a month with a ledger line in another currency than EUR', async () => {
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
    expect(outcome?.findings[0]?.message).toContain('without foreign-currency data');
    expect(existsSync(exportsOf(setup))).toBe(false);
  });

  it('writes nothing in a dry run but reports what a real run would do', async () => {
    const setup = exportSetup();
    const [outcome] = await run(setup, { dryRun: true });
    expect(outcome?.status).toBe('checked');
    expect(outcome?.plan).toBe('write');
    expect(outcome?.summary).toContain('Totals per Abacus account');
    expect(readdirSync(setup.ctx.cwd).sort()).toEqual(['apaleo-abacus.config.yaml', 'mapping-BSP.csv']);
  });

  it('warns about the MWST-Codes of the mapping rows the month uses in the dry run and the protocol, without mapping check', async () => {
    const [dry] = await run(exportSetup(), { dryRun: true });
    expect(dry?.status).toBe('checked');
    expect(dry?.findings.map((f) => [f.code, f.value])).toEqual([
      ['W-MWST-CODE-UNCHECKED', 'V10'],
      ['W-MWST-CODE-UNCHECKED', 'V20'],
    ]);
    // Line 4 (RevenueAccommodation_Normal:20.00, V20) is not booked in September, so it is not named.
    expect(dry?.findings.map((f) => f.message.replace(/ of the mapping file:.*/, ''))).toEqual(['lines 3, 6, 15', 'line 7']);
    expect(dry?.summary).toContain('W-MWST-CODE-UNCHECKED');

    // Swapped code: 311 is the configured Normalsatz code (8.1 %); the posting guard compares rates only and passes it.
    const swapped = exportSetup({ files: { 'mapping-BSP.csv': readMapping().replace('(10%);10;3400;V10;10;', '(10%);10;3400;311;10;') } });
    const [outcome] = await run(swapped);
    expect(outcome?.status).toBe('written');
    expect(withoutPlaceholderCodes(outcome?.findings ?? []).map((f) => [f.code, f.value])).toEqual([['W-MWST-CODE-RATE', '311']]);
    const protocol = readFileSync(join(exportsOf(swapped), BSP, '2026-09', 'ABACUS_Buchungen_20260901-20260930_BSP.protokoll.txt'), 'utf8');
    expect(protocol).toContain('line 3 of the mapping file: the MWST-Code 311 is configured for the Normalsatz at 8.1 % (abacus.mwstCodes.normal), but the row books it at 10 %');
  });
});

describe('plausibility checks in the pipeline', () => {
  it('Side bug is caught: blocks the file when a defect writes DebitCredit D where the apaleo line credits the Collective account', async () => {
    const setup = exportSetup();
    const sideBug: typeof buildBookings = (...args) => {
      const result = buildBookings(...args);
      // The 98.00 logis charge: the folio 1101 is debited in apaleo (D); written as C.
      const booking = result.bookings[1];
      if (booking?.tax) {
        booking.debitCredit = booking.debitCredit === 'D' ? 'C' : 'D';
        booking.tax.taxCents = -booking.tax.taxCents;
      }
      return result;
    };
    const [outcome] = await run(setup, {}, sideBug);
    expect(outcome?.status).toBe('failed');
    const [first] = withoutPlaceholderCodes(outcome?.findings ?? []);
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
    const findings = withoutPlaceholderCodes(outcome?.findings ?? []);
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
    const [first] = withoutPlaceholderCodes(outcome?.findings ?? []);
    expect(first?.code).toBe('E-AGGREGATE-CHECK');
    expect(first?.message).toContain('core.subledger_aggregate.create, or set checks.aggregates: false');
  });
});

