import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run.js';
import { fileSystemFinding } from '../../src/export/index.js';
import { createTestContext } from '../helpers/context.js';

/** The demo marks its file name with `_DEMO`, so it never looks like a real export in a file list. */
const FILE = 'ODOO_Buchungen_20260901-20260930_BSP_DEMO.csv';
const PROTOCOL = 'ODOO_Buchungen_20260901-20260930_BSP_DEMO.protokoll.txt';
/** What a real export of the demo data writes (test/examples.test.ts keeps it current). */
const EXAMPLE = readFileSync(new URL('../../docs/examples/ODOO_Buchungen_20260901-20260930_BSP.csv', import.meta.url));
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** No config file, no secret, and a fetch stub that throws on every request. */
function bareContext(env: Record<string, string> = {}) {
  return createTestContext({ env, fetchHandler: () => Promise.reject(new Error('the demo must not use the network')) });
}

describe('apaleo-odoo export --demo', () => {
  it('Demo without credentials: runs the dry run on the bundled German month without config, secret or network, in EUR with 7 % and 19 %, and marks it DEMO', async () => {
    const ctx = bareContext();
    expect(await runCli(['export', '--month', '2026-09', '--demo', '--dry-run'], ctx)).toBe(0);
    const out = ctx.out();
    expect(out.startsWith('DEMO: bundled sample data of the fabricated "Hotel Beispiel Berlin"')).toBe(true);
    expect(out).toContain('Property BSP, 2026-09-01 to 2026-09-30: 24 apaleo lines, 19 Odoo bookings');
    expect(out).toContain('Never import a demo file into a real Odoo company.');
    // Every section of the summary has content.
    for (const text of [
      `Import into Odoo Accounting (compare with the Odoo company before importing, see docs/odoo-format.md):\n  File: ${FILE}\n  Revision: 1 (first file of the period)`,
      '  Entries: 8 draft journal entries (one per business day) with 24 lines, references "DEMO apaleo BSP <date>"',
      '  Company: id 1 (odoo.companyId, the company that owns the taxes), journal APA, currency EUR',
      '  Taxes: account.1_tax_ust_19_skr03 (19 %, Kz 81), account.1_tax_ust_7_skr03 (7 %, Kz 86)',
      'Totals per Odoo account',
      '  8300       0.00  634.44  -634.44',
      '  tax_ust_7_skr03 7 % (Kz 86): net 634.44, apaleo per line 44.40, gross 678.84, apaleo precise 44.41 (44.41009346), difference (per line minus precise) -0.01',
      '  tax_ust_19_skr03 19 % (Kz 81): net 64.18, apaleo per line 12.20, gross 76.38, apaleo precise 12.20 (12.19512605), difference (per line minus precise) 0.00',
      "Deposits and apaleo's VAT per Odoo tax and rate (received minus released, before the base fitting):\n  tax_ust_7_skr03 7 % (Kz 86): net 0.00",
      'Payments per clearing account:\n  account  amount\n  1001     250.70\n  1360     399.02',
      'Deposits (Anzahlungen) received, released and refunded:\n  received        321.00\n  released        321.00\n  of it refunded  107.00',
      'Accounts receivable (Forderungen Firmenrechnungen, Soll positive): 185.50',
      'both sides on the same Odoo account      5            621.22',
      'N-ODOO-ROUNDING-LINE',
    ]) {
      expect(out).toContain(text);
    }
    expect(out).not.toContain('CHF');
    expect(out).not.toMatch(/\bE-[A-Z]|\bW-[A-Z]/);
    expect(out).toContain('File: a real run writes demo-output/BSP/2026-09/');
    expect(out).toContain('DEMO Result: dry run, nothing written; 1 file(s) passed every check.');
    expect(ctx.fetchCalls).toEqual([]);
    expect(ctx.err()).toBe('');
    expect(readdirSync(ctx.cwd)).toEqual([]);
  });

  it('does not count a month without bookings as a file that passed every check', async () => {
    const ctx = bareContext();
    expect(await runCli(['export', '--month', '2026-08', '--demo', '--dry-run'], ctx)).toBe(0);
    expect(ctx.out()).toContain('N-NO-BOOKINGS');
    expect(ctx.out()).toContain('DEMO Result: dry run, nothing written; 0 file(s) passed every check. 1 without bookings.');
  });

  it('Demo file is marked in its name: writes the example file into ./demo-output only, with DEMO in the file name, the External IDs, every reference and the protocol', async () => {
    // A variable that would redirect a real export must not move the demo output.
    const ctx = bareContext({ APALEO_ODOO_OUTPUT_DIR: 'exports' });
    expect(await runCli(['export', '--month', '2026-09', '--demo'], ctx)).toBe(0);
    expect(readdirSync(ctx.cwd)).toEqual(['demo-output']);
    const folder = join(ctx.cwd, 'demo-output', 'BSP', '2026-09');
    expect(readdirSync(folder).sort()).toEqual([FILE, PROTOCOL, 'manifest.json'].sort());

    const demo = decode(readFileSync(join(folder, FILE)));
    // The example file with "DEMO " before every reference and _DEMO in the External IDs, and nothing else changed.
    expect(demo).toBe(decode(EXAMPLE).replaceAll('apaleo_c1_BSP_', 'apaleo_c1_BSP_DEMO_').replaceAll(',apaleo BSP ', ',DEMO apaleo BSP '));
    const protocol = readFileSync(join(folder, PROTOCOL), 'utf8').split('\n');
    expect(protocol[0]).toBe('DEMO');
    expect(protocol[1]).toMatch(/^DEMO: bundled sample data/);
    expect(protocol).toContain('  Company: id 1 (odoo.companyId, the company that owns the taxes), journal APA, currency EUR');
    expect(JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8'))).toMatchObject({
      files: [{ file: FILE, status: 'current', bookings: 19, entries: 8, currency: 'EUR', odooCompanyId: 1, odooJournal: 'APA' }],
    });
    expect(ctx.fetchCalls).toEqual([]);

    // Running the demo again finds its own file and changes nothing.
    expect(await runCli(['export', '--month', '2026-09', '--demo'], ctx)).toBe(0);
    expect(readdirSync(folder).sort()).toEqual([FILE, PROTOCOL, 'manifest.json'].sort());
  });

  it('names the working directory, not ./data, when the demo folder is not writable', () => {
    const error = Object.assign(new Error("EACCES: permission denied, mkdir '/config/demo-output'"), { code: 'EACCES' });
    const finding = fileSystemFinding(error, '/config/demo-output', true);
    expect(finding.code).toBe('E-EXPORT');
    expect(finding.message).toContain('The demo writes into /config/demo-output');
    expect(finding.message).toContain('add -w /data');
    expect(finding.message).not.toContain('chown -R 1000:1000 data');
  });

  it('refuses --config, because the demo brings its own', async () => {
    const ctx = bareContext();
    expect(await runCli(['export', '--month', '2026-09', '--demo', '--config', 'mine.yaml'], ctx)).toBe(2);
    expect(ctx.err()).toContain('--demo brings its own config');
  });

  it('refuses a month that is not closed on the demo clock (2026-10-05)', async () => {
    const ctx = bareContext();
    expect(await runCli(['export', '--month', '2026-10', '--demo', '--dry-run'], ctx)).toBe(1);
    expect(ctx.out()).toContain('E-DAY-NOT-CLOSED');
    expect(existsSync(join(ctx.cwd, 'demo-output'))).toBe(false);
  });
});
