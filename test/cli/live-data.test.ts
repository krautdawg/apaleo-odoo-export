import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run.js';
import { FIXTURE_FILES, createApaleoContext } from '../helpers/apaleo.js';
import { stripAustrianTaxes } from '../helpers/export.js';
import { BER_MAPPING, VIE_MAPPING } from '../helpers/live-mapping.js';

/**
 * The CLI on the recorded apaleo sandbox responses (`test/fixtures/apaleo/live/`)
 * through the fake apaleo API and the default Odoo target: BER, a German
 * property, with the committed BER Odoo mapping (the SKR03 template for Odoo 18),
 * and VIE, an Austrian property, with the hand-made VIE Odoo mapping (l10n_at taxes).
 */

/** After the recorded days, so both are closed. */
const AFTER_THE_DAY = new Date('2026-10-25T08:00:00Z');
function liveContext(extraConfig = '', files: Record<string, string> = {}) {
  const config = `${FIXTURE_FILES['apaleo-odoo.config.yaml']}properties:\n  - id: VIE\n  - id: BER\n${extraConfig}`;
  return createApaleoContext(
    { live: true },
    { files: { 'apaleo-odoo.config.yaml': config, 'mapping-VIE.csv': VIE_MAPPING, 'mapping-BER.csv': BER_MAPPING, ...files }, now: AFTER_THE_DAY },
  );
}

const DAY = ['--from', '2026-10-21', '--to', '2026-10-21'];

describe('mapping check on the recorded days', () => {
  it('passes mapping check --from --to for BER with the SKR03 template mapping, only noting the generated accounts and the default taxes', async () => {
    const ctx = liveContext();
    expect(await runCli(['mapping', 'check', '--property', 'BER', ...DAY], ctx)).toBe(0);
    expect(ctx.out()).not.toMatch(/sub-cent|not a whole number of cents/);
    expect(ctx.out()).toContain('every booked account is mapped');
    expect(ctx.out()).not.toMatch(/^[EW]-/m);
    expect(ctx.out()).toContain('N-GENERATED-ACCOUNT');
    expect(ctx.out()).toContain('Result: mapping OK.');
  });

  it('passes mapping check --from --to for VIE, warning only about the Austrian rates and taxes', async () => {
    const ctx = liveContext();
    expect(await runCli(['mapping', 'check', '--property', 'VIE', ...DAY], ctx)).toBe(0);
    expect(ctx.out()).toContain('every booked account is mapped');
    expect(ctx.out()).toContain('W-VAT-RATE-UNUSUAL');
    expect(ctx.out()).toContain('W-TAX-UNCHECKED');
    expect(ctx.out()).not.toMatch(/^E-/m);
  });
});

describe('export of the recorded BER day 2026-10-21 (full pipeline, Odoo target, aggregate check on)', () => {
  const FILE = 'ODOO_Buchungen_20261021-20261021_BER.csv';
  const PROTOCOL = FILE.replace('.csv', '.protokoll.txt');

  async function exportBer(extra: string[] = []) {
    const ctx = liveContext('checks:\n  aggregates: true\n');
    const code = await runCli(['export', ...DAY, '--property', 'BER', ...extra], ctx);
    const folder = join(ctx.cwd, 'exports', 'BER', '2026-10');
    return { ctx, code, folder, protocol: () => readFileSync(join(folder, PROTOCOL), 'utf8'), csv: () => readFileSync(join(folder, FILE), 'utf8') };
  }

  it('BER exports cleanly: one file without E- finding or W-AGGREGATE-DIFF, the writer validation passing, the summary of the recorded BER day', async () => {
    const { ctx, code, folder, protocol, csv } = await exportBer();
    expect(ctx.err()).toBe('');
    expect(code).toBe(0);
    expect(ctx.out()).not.toMatch(/\bE-[A-Z]|W-AGGREGATE-DIFF|W-/);
    expect(readdirSync(folder).sort()).toEqual([FILE, PROTOCOL, 'manifest.json'].sort());
    const text = protocol();
    expect(text).toContain('Property BER, 2026-10-21 to 2026-10-21: 35 apaleo lines, 29 Odoo bookings');
    expect(text).toContain('tax_ust_7_skr03 7 % (Kz 86): net 533.84, tax 37.38, gross 571.22, apaleo VAT 37.37, difference -0.01 (apaleo precise 37.3695327)');
    expect(text).toContain('tax_ust_19_skr03 19 % (Kz 81): net 39.81, tax 7.57, gross 47.38, apaleo VAT 7.56, difference -0.01 (apaleo precise 7.56487395)');
    expect(text).toContain('no tax 0 %: net 45.00, tax 0.00, gross 45.00');
    expect(text).toContain('  Entries: 1 draft journal entries (one per business day)');
    expect(text).toContain('Base and VAT per tax: account.1_tax_ust_19_skr03 19 % (Kz 81): base 56.61, Odoo VAT 10.75, apaleo VAT 10.76, difference -0.01; account.1_tax_ust_7_skr03 7 % (Kz 86): base 737.62, Odoo VAT 51.62, apaleo VAT 51.64, difference -0.02');
    expect(text).toContain('Deposits (Anzahlungen) received, released and refunded:\n  received        590.00\n  released        352.00\n  of it refunded   10.00\n');
    expect(text).toMatch(/^ {2}1001 +111\.70$/m);
    expect(text).toMatch(/^ {2}1360 +675\.90$/m);
    expect(text).toContain('Accounts receivable (Forderungen Firmenrechnungen, Soll positive): 114.00');
    expect(text).not.toContain('E-VAT-TOTAL');
    expect(csv().split('\n')[1]).toMatch(/^apaleo_c1_BER_20261021,apaleo BER 2026-10-21,2026-10-21,APA,/);
  });

  it('shows the summary and the Odoo import block in a dry run, and writes nothing', async () => {
    const { ctx, code } = await exportBer(['--dry-run']);
    expect(code).toBe(0);
    expect(ctx.out()).toContain(`  File: ${FILE}\n  Revision: 1 (first file of the period)\n`);
    expect(ctx.out()).toContain('Result: dry run, nothing written');
    expect(readdirSync(ctx.cwd)).not.toContain('exports');
  });
});

describe('export of the recorded VIE day 2026-10-21 through the hand-made Austrian mapping', () => {
  it('VIE through a hand-made Austrian mapping: one file whose taxed lines carry the l10n_at External IDs, 35 apaleo lines, 29 bookings and 6 skipped, no E- finding', async () => {
    const ctx = liveContext('checks:\n  aggregates: true\n');
    expect(await runCli(['export', ...DAY, '--property', 'VIE'], ctx)).toBe(0);
    const out = stripAustrianTaxes(ctx.out());
    expect(out).not.toMatch(/\bE-[A-Z]|W-AGGREGATE-DIFF/);
    const folder = join(ctx.cwd, 'exports', 'VIE', '2026-10');
    const csv = readFileSync(join(folder, 'ODOO_Buchungen_20261021-20261021_VIE.csv'), 'utf8');
    const protocol = readFileSync(join(folder, 'ODOO_Buchungen_20261021-20261021_VIE.protokoll.txt'), 'utf8');
    expect(protocol).toContain('Property VIE, 2026-10-21 to 2026-10-21: 35 apaleo lines, 29 Odoo bookings');
    expect(protocol).toMatch(/both sides on the same Odoo account\s+6\s+312\.60/);
    const taxes = new Set([...csv.matchAll(/,(account\.1_[a-z0-9_]+)$/gm)].map((match) => match[1]));
    expect([...taxes].sort()).toEqual(['account.1_account_tax_template_sales_10_code029', 'account.1_account_tax_template_sales_13_code006', 'account.1_account_tax_template_sales_20_code022']);
    // Line rounding is not an error: 7.74 at 10 % against apaleo's precise 7.74545454.
    expect(protocol).toContain('account_tax_template_sales_10_code029 10 %: net 77.46, tax 7.74, gross 85.20, apaleo VAT 7.75, difference 0.01 (apaleo precise 7.74545454)');
    expect(protocol).not.toContain('E-VAT-TOTAL');
  });
});

describe('BER with the SKR03 template', () => {
  it('raises no parse, sub-cent or Swagger-shape error, and reports E-UNMAPPED only for accounts the template leaves empty: none is booked on BER, so the file is written', async () => {
    const ctx = liveContext();
    await ctx.fs.rm(join(ctx.cwd, 'mapping-BER.csv'));
    expect(await runCli(['init-mapping', '--property', 'BER', '--template', 'skr03-hotel'], ctx)).toBe(0);
    const code = await runCli(['export', ...DAY, '--property', 'BER'], ctx);
    const out = ctx.out();
    expect(out).not.toMatch(/sub-cent|not a whole number of cents|does not match its API description/);
    expect(out.split('\n').filter((line) => /\bE-(?!UNMAPPED)[A-Z]/.test(line))).toEqual([]);
    // The template leaves the Kurtaxe (BER has no Kurtaxe account) and RevenueOther_Reduced:7.00 empty; the recorded day books neither.
    expect(out).not.toContain('E-UNMAPPED');
    expect(code).toBe(0);
    expect(readdirSync(join(ctx.cwd, 'exports', 'BER', '2026-10'))).toContain('ODOO_Buchungen_20261021-20261021_BER.csv');
  });

  it('stops with E-UNMAPPED when the day books a 7 % revenue account no name pattern matches', async () => {
    const ctx = liveContext();
    const edited = BER_MAPPING.replace(/^RevenueFoodAndBeverages_Reduced:7\.00;Revenues;([^;]*);7;8300;tax_ust_7_skr03;7;/m, 'RevenueFoodAndBeverages_Reduced:7.00;Revenues;$1;7;;;;');
    await ctx.fs.writeFile(join(ctx.cwd, 'mapping-BER.csv'), edited);
    expect(await runCli(['export', ...DAY, '--property', 'BER'], ctx)).toBe(1);
    const unmapped = ctx.out().split('\n').filter((line) => line.includes('E-UNMAPPED'));
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]).toContain('apaleo account RevenueFoodAndBeverages_Reduced:7.00 (Revenues');
    expect(readdirSync(ctx.cwd)).not.toContain('exports');
  });
});
