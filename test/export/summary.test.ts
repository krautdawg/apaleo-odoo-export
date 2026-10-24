import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run.js';
import { loadConfig } from '../../src/core/config.js';
import { ODOO_VAT_NOTE, protocolPath, renderSummary, runExport, type ExportRequest, type TargetFileFigures } from '../../src/export/index.js';
import { renderMappingFile } from '../../src/mapping/index.js';
import { kennzahl } from '../../src/odoo/index.js';
import { BSP } from '../helpers/apaleo.js';
import { DE_MONTH, DE_ROWS, deMonthConfig } from '../helpers/de-month.js';
import { exportSetup, type ExportSetup } from '../helpers/export.js';

/** export-run, "Dry run": the summary of the German fixture month, in the order of the check after the import. */
const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' } as const;
const MAPPING = new TextDecoder().decode(renderMappingFile([], DE_ROWS));

function germanMonth(...odoo: string[]): ExportSetup {
  return exportSetup({ config: deMonthConfig(...odoo), files: { 'mapping-BSP.csv': MAPPING }, data: (data) => Object.assign(data, structuredClone(DE_MONTH)) });
}

async function run(setup: ExportSetup, request: Partial<ExportRequest> = {}) {
  const { ctx, fake } = setup;
  const loaded = await loadConfig({ path: join(ctx.cwd, 'apaleo-odoo.config.yaml'), env: ctx.env, readFile: ctx.fs.readFile });
  const [outcome] = await runExport({ period: SEPTEMBER, propertyIds: [BSP], dryRun: true, overwrite: false, ...request }, { loaded, source: fake, ctx });
  if (!outcome) throw new Error('no outcome');
  return outcome;
}

/** The section of `summary` from its title line to the next blank line. */
function sectionOf(summary: string, title: string): string {
  const start = summary.indexOf(`\n${title}`);
  expect(start, title).toBeGreaterThan(0);
  return summary.slice(start + 1, summary.indexOf('\n\n', start + 1));
}

const VAT_SECTION = "Odoo's VAT per tax and rate, with the UStVA Kennzahl";

describe('the dry-run summary (export-run, "Dry run")', () => {
  it('Review before the first file: export --month 2026-09 --property BSP --dry-run prints the summary and the import block and creates no file or folder', async () => {
    const setup = germanMonth();
    const before = readdirSync(setup.ctx.cwd).sort();
    expect(await runCli(['export', '--month', '2026-09', '--property', BSP, '--dry-run'], setup.ctx)).toBe(0);
    const out = setup.ctx.out();
    const order = [
      VAT_SECTION,
      "Revenue and apaleo's VAT per Odoo tax and rate",
      "Deposits and apaleo's VAT per Odoo tax and rate",
      'Totals per Odoo account',
      'Kurtaxe and other guest levies per account',
      'Payments per clearing account:',
      'Deposits (Anzahlungen) received, released and refunded:',
      'Deposits per Odoo tax and rate',
      'Accounts receivable (Forderungen Firmenrechnungen, Soll positive): 185.50',
      'Written-off receivables (Forderungsverluste)',
      'Entries in the file: 12, with 39 lines, of them 3 rounding lines',
      'Skipped lines:',
      'Findings:',
      'Import into Odoo Accounting',
    ];
    const positions = order.map((text) => out.indexOf(text));
    expect(positions.every((position) => position >= 0), order.filter((_, i) => (positions[i] ?? -1) < 0).join(', ')).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(out).toContain('Kurtaxe and other guest levies per account (apaleo city tax, total 15.70):\n  1590 without tax (no UStVA Kennzahl, for example a durchlaufender Posten): 5.00\n  8300 with tax_ust_7_skr03 7 % (Kz 86): gross 10.70, tax 0.70\n');
    expect(out).toContain('Payments per clearing account:\n  account  amount\n  1001     300.70\n  1360     414.72\n');
    expect(out).toContain('  tax_ust_19_skr03 19 % (lowers Kz 81): net 100.00, apaleo per line 19.00, gross 119.00');
    expect(out).toContain('  File: ODOO_Buchungen_20260901-20260930_BSP.csv\n  Revision: 1 (first file of the period)\n');
    expect(out).toContain('Result: dry run, nothing written');
    expect(readdirSync(setup.ctx.cwd).sort()).toEqual(before);
    expect(existsSync(join(setup.ctx.cwd, 'exports'))).toBe(false);
  });

  it('German rates with their Kennzahl: tax_ust_7_skr03 7 % with Kz 86 and tax_ust_19_skr03 19 % with Kz 81, each with net, Odoo VAT, apaleo VAT and difference', async () => {
    const { summary } = await run(germanMonth());
    const section = sectionOf(summary, VAT_SECTION);
    expect(section.split('\n').filter((line) => /^ {2}\S/.test(line))).toEqual([
      '  tax_ust_19_skr03 19 % (Kz 81): net 64.19, Odoo VAT 12.19, apaleo per line 12.20, apaleo precise 12.20 (12.19512605), difference (Odoo minus apaleo) -0.01',
      '  tax_ust_7_skr03 7 % (Kz 86): net 644.44, Odoo VAT 45.10, apaleo per line 45.10, apaleo precise 45.11 (45.11009346), difference (Odoo minus apaleo) 0.00',
    ]);
    // The revenue lines keep apaleo's figures before the base fitting and their sign convention.
    expect(summary).toContain('  tax_ust_7_skr03 7 % (Kz 86): net 734.44, apaleo per line 51.40, gross 785.84, apaleo precise 51.41 (51.41009346), difference (per line minus precise) -0.01');
    expect(summary).toContain('  tax_ust_19_skr03 19 % (Kz 81): net 164.18, apaleo per line 31.20, gross 195.38, apaleo precise 31.20 (31.19512605), difference (per line minus precise) 0.00');
  });

  it('VAT difference per tax rounding: with per_tax, every rate with a difference shows the month\'s Odoo VAT, apaleo VAT, the difference, the days and the explaining sentence', async () => {
    const { summary } = await run(germanMonth('taxRounding: per_tax', "roundingAccount: '2700'"));
    const section = sectionOf(summary, VAT_SECTION);
    expect(section).toContain(
      '  tax_ust_19_skr03 19 % (Kz 81): net 64.18, Odoo VAT 12.19, apaleo per line 12.20, apaleo precise 12.20 (12.19512605), difference (Odoo minus apaleo) -0.01\n' +
        '    2026-09-28: Odoo VAT 0.79, apaleo per line 0.80, difference -0.01\n',
    );
    expect(section).toContain(
      '  tax_ust_7_skr03 7 % (Kz 86): net 644.42, Odoo VAT 45.11, apaleo per line 45.10, apaleo precise 45.11 (45.11009346), difference (Odoo minus apaleo) 0.01\n' +
        '    2026-09-10: Odoo VAT 14.07, apaleo per line 14.06, difference 0.01\n',
    );
    expect(section.endsWith(ODOO_VAT_NOTE)).toBe(true);
    expect(ODOO_VAT_NOTE).toMatch(/^Odoo computes the VAT itself from the base of each line; the file fits each base .* equals apaleo's gross/);
    expect(summary).toContain('Entries in the file: 12, with 38 lines, of them 2 rounding lines');
  });

  it('Protocol: holds the same summary and import block as the dry run, then the apaleo entries per line of the file', async () => {
    const setup = germanMonth();
    const dry = await run(setup);
    const written = await run(setup, { dryRun: false });
    expect(written.status).toBe('written');
    const protocol = readFileSync(protocolPath(written.path ?? ''), 'utf8');
    expect(protocol.split('\n')[0]).toBe('Odoo journal entries (import file). No warranty, not tax advice: have your Steuerberater check the bookings.');
    expect(protocol).toContain(dry.summary);
    const details = protocol.indexOf('apaleo entries per line of the file (entry number and receipt or reference):');
    expect(details).toBeGreaterThan(protocol.indexOf('Import into Odoo Accounting'));
    expect(protocol).toContain('  2026-09-18 1401 Forderungen Firmenrechnungen debit 185.50: BSPE0017 (BSP-2026-0815)');
  });
});

describe('renderSummary', () => {
  const part = { ...SEPTEMBER, month: '2026-09', wjBeginn: '2026-01-01' } as const;

  it('shows no day lines for a tax without a difference, and leaves the target section out without file figures', () => {
    const figures: TargetFileFigures = {
      vatByTax: [{ tax: 'tax_ust_7_skr03', bookingTaxes: ['tax_ust_7_skr03'], ratePercent: 7, baseCents: 10_000, vatCents: 700, apaleoVatCents: 700, days: [] }],
      entries: 1,
      lines: 2,
      roundingLines: 1,
    };
    const input = { propertyId: BSP, part, ledgerLines: 1, bookings: 1, taxReturnLine: kennzahl, findings: [] };
    const empty = {
      accounts: [],
      revenueByRate: [{ tax: 'tax_ust_7_skr03', ratePercent: 7, netCents: 10_000, vatCents: 700, grossCents: 10_700, apaleoVat: '7' }],
      depositVatByRate: [],
      writeOffsByRate: [],
      cityTaxCents: 0,
      levies: [],
      payments: [],
      deposits: { receivedCents: 0, releasedCents: 0, refundedCents: 0 },
      depositsByRate: [],
      accountsReceivableCents: 0,
      skipped: [],
      findings: [],
    };
    const text = renderSummary({ ...input, summary: empty, figures });
    expect(text).toContain(`${VAT_SECTION}`);
    expect(text).toContain('  tax_ust_7_skr03 7 % (Kz 86): net 100.00, Odoo VAT 7.00, apaleo per line 7.00, apaleo precise 7.00 (7), difference (Odoo minus apaleo) 0.00\nOdoo computes');
    expect(text).toContain('Entries in the file: 1, with 2 lines, of them 1 rounding line\n');
    const withoutFigures = renderSummary({ ...input, summary: empty });
    expect(withoutFigures).not.toContain(VAT_SECTION);
    expect(withoutFigures).not.toContain('Entries in the file');
  });
});
