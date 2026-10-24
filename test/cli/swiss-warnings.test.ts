import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run.js';
import { abrechnungsartFindings, configSchema } from '../../src/core/config.js';
import { ENG, createApaleoContext } from '../helpers/apaleo.js';
import { CH_MAPPING_FILE, chMonthConfig } from '../helpers/ch-month.js';
import { createTestContext } from '../helpers/context.js';

/**
 * The Swiss warnings of a05 through the CLI: `W-ABRECHNUNGSART-VEREINNAHMT` in
 * `doctor` and in every export of the Swiss fixture month, and the special-case
 * warnings of `mapping check`. None of them changes the exit code.
 */
const MAPPING = readFileSync(new URL(`../fixtures/mapping/${CH_MAPPING_FILE}`, import.meta.url), 'utf8');
const CODE = 'W-ABRECHNUNGSART-VEREINNAHMT';
const count = (text: string, needle: string) => text.split(needle).length - 1;

function chMonth(config: string) {
  return createApaleoContext({ chMonth: true }, { files: { 'apaleo-abacus.config.yaml': config, 'mapping-ENG.csv': MAPPING } });
}

describe('Vereinnahmte Entgelte', () => {
  it('Doctor with vereinnahmte Entgelte: warns W-ABRECHNUNGSART-VEREINNAHMT naming the Hilfskonto 2202 and docs/mapping-guide.md, and exits 0', async () => {
    const ctx = createTestContext({ files: { 'apaleo-abacus.config.yaml': 'abacus:\n  mandant: 1234\n  abrechnungsart: vereinnahmt\n' } });
    expect(await runCli(['doctor'], ctx)).toBe(0);
    expect(count(ctx.out(), CODE)).toBe(1);
    expect(ctx.out()).toContain('the Hilfskonto 2202 (abacus.mwstHilfskonto)');
    expect(ctx.out()).toContain('docs/mapping-guide.md');
    expect(ctx.out()).toContain('MWSTG Art. 40 Abs. 2');
  });

  it('names the configured Hilfskonto', () => {
    const [finding] = abrechnungsartFindings(configSchema.parse({ abacus: { mandant: 1, abrechnungsart: 'vereinnahmt', mwstHilfskonto: 2209 } }).abacus);
    expect(finding).toMatchObject({ code: CODE, value: '2209' });
    expect(finding?.message).toContain('Hilfskonto 2209');
  });

  it('Export with vereinnahmte Entgelte: the summary and the protocol show the warning once, the file is written, exit 0', async () => {
    const ctx = chMonth(chMonthConfig('abrechnungsart: vereinnahmt'));
    expect(await runCli(['export', '--month', '2026-08', '--property', ENG, '--dry-run'], ctx)).toBe(0);
    expect(count(ctx.out(), CODE)).toBe(1);

    const real = chMonth(chMonthConfig('abrechnungsart: vereinnahmt'));
    expect(await runCli(['export', '--month', '2026-08', '--property', ENG], real)).toBe(0);
    expect(real.out()).toContain('written exports/ENG/2026-08/ABACUS_Buchungen_20260801-20260831_ENG.xml (21 bookings)');
    expect(count(real.out(), CODE)).toBe(1);
    const folder = join(real.cwd, 'exports', ENG, '2026-08');
    const protocol = readFileSync(join(folder, 'ABACUS_Buchungen_20260801-20260831_ENG.protokoll.txt'), 'utf8');
    expect(count(protocol, CODE)).toBe(1);
    const xml = readFileSync(join(folder, 'ABACUS_Buchungen_20260801-20260831_ENG.xml'), 'utf8');
    expect(xml).toContain('<UseCode>1</UseCode>');
    expect(xml).not.toContain('<UseCode>0</UseCode>');
  });

  it('Export of several months with vereinnahmte Entgelte: the console shows the warning once per property and month, each protocol once', async () => {
    const dry = chMonth(chMonthConfig('abrechnungsart: vereinnahmt'));
    expect(await runCli(['export', '--from', '2026-06-01', '--to', '2026-08-31', '--property', ENG, '--dry-run'], dry)).toBe(0);
    expect(count(dry.out(), CODE)).toBe(3);

    const real = chMonth(chMonthConfig('abrechnungsart: vereinnahmt'));
    expect(await runCli(['export', '--from', '2026-06-01', '--to', '2026-08-31', '--property', ENG], real)).toBe(0);
    expect(count(real.out(), CODE)).toBe(3);
    expect(real.out()).toContain('Result: 1 written, 0 unchanged, 2 without bookings, 0 failed.');
    const protocol = readFileSync(join(real.cwd, 'exports', ENG, '2026-08', 'ABACUS_Buchungen_20260801-20260831_ENG.protokoll.txt'), 'utf8');
    expect(count(protocol, CODE)).toBe(1);
  });

  it('Default Abrechnungsart: no W-ABRECHNUNGSART-VEREINNAHMT in doctor or the export, nor with vereinbart', async () => {
    const ctx = chMonth(chMonthConfig());
    expect(await runCli(['doctor'], ctx)).toBe(0);
    expect(await runCli(['export', '--month', '2026-08', '--property', ENG], ctx)).toBe(0);
    expect(ctx.out()).toContain('(21 bookings)');
    expect(ctx.out()).not.toContain(CODE);
    expect(abrechnungsartFindings(configSchema.parse({ abacus: { mandant: 1, abrechnungsart: 'vereinbart' } }).abacus)).toEqual([]);
  });
});

describe('mapping check: Swiss special-case warnings', () => {
  const HEADER = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;abacus_account;mwst_code;mwst_percent;kost;comment';
  const check = async (...rows: string[]) => {
    const ctx = createTestContext({ files: { 'apaleo-abacus.config.yaml': chMonthConfig(), 'mapping-ENG.csv': [HEADER, ...rows].map((l) => `${l}\r\n`).join('') } });
    return { code: await runCli(['mapping', 'check', '--property', ENG], ctx), out: ctx.out() };
  };

  it('Kurtaxe mapped with MWST: W-KURTAXE-TAXED with the row and Ziff. 7.11, exit 0', async () => {
    const { code, out } = await check('3501;CityTaxes;City Tax;3.8;3400;313;3.8;;');
    expect(code).toBe(0);
    expect(out).toContain('W-KURTAXE-TAXED');
    expect(out).toContain('line 2: apaleo account 3501 (CityTaxes)');
    expect(out).toContain('Ziff. 7.11');
  });

  it('Kurtaxe as durchlaufender Posten: no W-KURTAXE-TAXED', async () => {
    const { code, out } = await check('3501;CityTaxes;City Tax;0;2210;;;;');
    expect(code).toBe(0);
    expect(out).not.toContain('W-KURTAXE-TAXED');
  });

  it('No-show mapped with MWST: W-ANNULLATION-TAXED with the row and Ziff. 8.7, exit 0', async () => {
    const { code, out } = await check('RevenueNoShow_Special:3.80;Revenues;Revenues No-show (3.8%);3.8;3400;313;3.8;;');
    expect(code).toBe(0);
    expect(out).toContain('W-ANNULLATION-TAXED');
    expect(out).toContain('line 2: apaleo account RevenueNoShow_Special:3.80 (Revenues)');
    expect(out).toContain('Ziff. 8.7');
  });
});
