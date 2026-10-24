import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run.js';
import { MWST_ZIFFER_BY_RATE } from '../../src/abacus/format.js';
import { SWISS_VAT_RATES } from '../../src/mapping/index.js';
import { ENG, createApaleoContext } from '../helpers/apaleo.js';
import { CH_MAPPING_FILE, chMonthConfig } from '../helpers/ch-month.js';

/**
 * The Swiss fixture month (ENG, CHF, August 2026, KMU template mapping) through
 * the CLI: the Ziffer of the MWST-Abrechnung beside each Swiss rate in the
 * summary, and the one-rate-per-MWST-Code check `E-MWST-CODE-RATES`.
 */
const MAPPING = readFileSync(new URL(`../fixtures/mapping/${CH_MAPPING_FILE}`, import.meta.url), 'utf8');
const ACCOMMODATION_ROW = /^RevenueAccommodation_Special:3\.80;Revenues;Revenues Accommodation \(3\.8%\);3\.8;3400;313;3\.8;/m;

function chMonth(mapping = MAPPING) {
  return createApaleoContext({ chMonth: true }, { files: { 'apaleo-abacus.config.yaml': chMonthConfig(), 'mapping-ENG.csv': mapping } });
}

/** The 1-based line of the mapping file that starts with `prefix`. */
function lineOf(mapping: string, prefix: string): number {
  const index = mapping.split(/\r?\n/).findIndex((line) => line.replace(/^\uFEFF/, '').startsWith(prefix));
  if (index < 0) throw new Error(`no mapping line starts with ${prefix}`);
  return index + 1;
}

describe('the Ziffer of the MWST-Abrechnung', () => {
  it('sits in one table with exactly the Swiss rates above 0', () => {
    expect([...MWST_ZIFFER_BY_RATE.keys()].sort((a, b) => a - b)).toEqual(SWISS_VAT_RATES.filter((rate) => rate > 0));
    expect(Object.fromEntries(MWST_ZIFFER_BY_RATE)).toEqual({ '8.1': '303', '2.6': '313', '3.8': '343' });
  });

  it('Swiss rates with their Ziffer: the dry run shows 313 3.8 % with Ziffer 343, 311 8.1 % with 303 and 312 2.6 % with 313', async () => {
    const ctx = chMonth();
    expect(await runCli(['export', '--month', '2026-08', '--property', ENG, '--dry-run'], ctx)).toBe(0);
    const out = ctx.out();
    const revenue = out.slice(out.indexOf('Revenue and MWST per MWST-Code and rate'), out.indexOf('Deposits and their MWST'));
    for (const line of [
      '  no MWST-Code 0 %: net 80.00, tax 0.00, gross 80.00, apaleo VAT 0.00, difference 0.00 (apaleo precise 0)',
      '  312 2.6 % (Ziffer 313): net 15.00, tax 0.39, gross 15.39, apaleo VAT 0.39, difference 0.00 (apaleo precise 0.39)',
      '  313 3.8 % (Ziffer 343): net 645.61, tax 24.53, gross 670.14, apaleo VAT 24.53, difference 0.00 (apaleo precise 24.53306358)',
      '  311 8.1 % (Ziffer 303): net 80.00, tax 6.48, gross 86.48, apaleo VAT 6.48, difference 0.00 (apaleo precise 6.48)',
    ]) {
      expect(revenue).toContain(`${line}\n`);
    }
    expect(out).toContain('Deposits and their MWST per MWST-Code and rate (received minus released):\n  313 3.8 % (Ziffer 343): net 0.00, tax 0.00');
    expect(out).toContain('Written-off receivables (Debitorenverluste) and the MWST correction per MWST-Code and rate:\n  313 3.8 % (Ziffer 343): net 115.61, tax 4.39');
    expect(out).toContain("Each booking carries apaleo's tax of its line, rounded to the Rappen");
    // Levies, write-offs and deposits are sections of their own.
    expect(out).toContain('Kurtaxe and other guest levies per account (apaleo city tax, total 12.60):\n  2210 without MWST: 12.60\n');
    expect(out).toContain('Deposits (Anzahlungen) received, released and refunded:\n  received        311.40\n  released        311.40\n  of it refunded  103.80\n');
    expect(out).toContain('  Journal total: 2144.42 CHF');
    expect(existsSync(join(ctx.cwd, 'exports'))).toBe(false);
  });
});

describe('One rate per MWST-Code', () => {
  it('One rate per code: the Swiss fixture month with the template mapping raises no E-MWST-CODE-RATES', async () => {
    const ctx = chMonth();
    expect(await runCli(['export', '--month', '2026-08', '--property', ENG], ctx)).toBe(0);
    expect(ctx.out()).not.toContain('E-MWST-CODE-RATES');
    expect(ctx.out()).toContain('written exports/ENG/2026-08/ABACUS_Buchungen_20260801-20260831_ENG.xml (21 bookings)');
  });

  it('Code used at two rates: 3.8 % and 8.1 % revenue both on MWST-Code 311 is refused naming the code, both rates and the rows, and no file is written', async () => {
    expect(MAPPING).toMatch(ACCOMMODATION_ROW);
    const mapping = MAPPING.replace(ACCOMMODATION_ROW, (row) => row.replace(';3400;313;3.8;', ';3400;311;3.8;'));
    const rows = [
      lineOf(mapping, 'RevenueAccommodation_Special:3.80;'),
      lineOf(mapping, 'RevenueFoodAndBeverages_Normal:8.10;'),
      lineOf(mapping, 'RevenueOther_Normal:8.10;'),
    ].sort((a, b) => a - b);

    const dry = chMonth(mapping);
    expect(await runCli(['export', '--month', '2026-08', '--property', ENG, '--dry-run'], dry)).toBe(1);
    expect(dry.out()).toContain(
      `E-MWST-CODE-RATES (mwst_code): the MWST-Code 311 is booked at 3.8 % and 8.1 % in this file (lines ${rows.join(', ')} of the mapping file)`,
    );
    expect(dry.out()).not.toMatch(/E-MWST-CODE-RATES.*MWST-Code 31[23]/);

    const real = chMonth(mapping);
    expect(await runCli(['export', '--month', '2026-08', '--property', ENG], real)).toBe(1);
    expect(real.out()).toContain('E-MWST-CODE-RATES');
    expect(real.out()).toContain('ENG 2026-08 (2026-08-01 to 2026-08-31): failed, no file written');
    expect(existsSync(join(real.cwd, 'exports', ENG, '2026-08', 'ABACUS_Buchungen_20260801-20260831_ENG.xml'))).toBe(false);
  });
});
