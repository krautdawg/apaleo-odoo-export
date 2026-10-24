import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run.js';
import { fileSystemFinding } from '../../src/export/index.js';
import { createTestContext } from '../helpers/context.js';

/** The demo marks its file name with `_DEMO`, so it never looks like a real export in a file list. */
const FILE = 'ABACUS_Buchungen_20260901-20260930_BSP_DEMO.xml';
const PROTOCOL = 'ABACUS_Buchungen_20260901-20260930_BSP_DEMO.protokoll.txt';
/** What a real export of the demo data writes (test/examples.test.ts keeps it current). */
const EXAMPLE = readFileSync(new URL('../../docs/examples/ABACUS_Buchungen_20260901-20260930_BSP.xml', import.meta.url));
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** No config file, no secret, and a fetch stub that throws on every request. */
function bareContext(env: Record<string, string> = {}) {
  return createTestContext({ env, fetchHandler: () => Promise.reject(new Error('the demo must not use the network')) });
}

describe('apaleo-abacus export --demo', () => {
  it('Demo without credentials: runs the dry run on the bundled Swiss data without config, secret or network, in CHF with 311, 312 and 313, and marks it DEMO', async () => {
    const ctx = bareContext();
    expect(await runCli(['export', '--month', '2026-09', '--demo', '--dry-run'], ctx)).toBe(0);
    const out = ctx.out();
    expect(out.startsWith('DEMO: bundled sample data of the fabricated "Hotel Beispiel"')).toBe(true);
    expect(out).toContain('Property BSP, 2026-09-01 to 2026-09-30: 26 apaleo lines, 21 Abacus bookings');
    expect(out).toContain('Never import a demo file into a real Abacus Mandant.');
    // Every section of the summary has content.
    for (const text of [
      `Import into Abacus FIBU (compare with the Mandant before importing, see docs/abacus-format.md):\n  File: ${FILE}\n  Bookings: 21 Einzelbuchungen`,
      '  Journal total: 2144.42 CHF',
      '  Mandant: 7777, Geschäftsbereich 0, Leitwährung CHF',
      '  Belegnummern: 0901000001 to 0901000021',
      '  MWST-Codes: 311 (8.1 %; tax -6.48 CHF), 312 (2.6 %; tax -0.39 CHF), 313 (3.8 %; tax -20.14 CHF)',
      'Totals per Abacus account',
      '  3805     115.61    0.00   115.61',
      '  311 8.1 % (Ziffer 303): net 80.00, tax 6.48, gross 86.48, apaleo VAT 6.48, difference 0.00',
      '  312 2.6 % (Ziffer 313): net 15.00, tax 0.39, gross 15.39, apaleo VAT 0.39, difference 0.00',
      '  313 3.8 % (Ziffer 343): net 645.61, tax 24.53, gross 670.14, apaleo VAT 24.53, difference 0.00',
      'Deposits and their MWST per MWST-Code and rate (received minus released):\n  313 3.8 % (Ziffer 343): net 0.00',
      'Written-off receivables (Debitorenverluste) and the MWST correction per MWST-Code and rate:\n  313 3.8 % (Ziffer 343): net 115.61, tax 4.39, gross 120.00',
      'Kurtaxe and other guest levies per account (apaleo city tax, total 12.60):\n  2210 without MWST: 12.60',
      'Payments per clearing account:\n  account  amount\n  1000     240.15\n  1090     296.00',
      'Deposits (Anzahlungen) received, released and refunded:\n  received        311.40\n  released        311.40\n  of it refunded  103.80',
      'Accounts receivable (Debitoren, Soll positive): 208.46',
      'both sides on the same Abacus account      5            537.01',
      'Findings:\n  none',
    ]) {
      expect(out).toContain(text);
    }
    expect(out).not.toContain('EUR');
    expect(out).toContain('File: a real run writes demo-output/BSP/2026-09/');
    expect(out).toContain('DEMO Result: dry run, nothing written; 1 file(s) passed every check.');
    expect(out).not.toContain('W-RECENT-DAY');
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

  it('Demo file is marked in its name: writes the example file into ./demo-output only, with DEMO in the file name, every Text1 and the protocol', async () => {
    // A variable that would redirect a real export must not move the demo output.
    const ctx = bareContext({ APALEO_ABACUS_OUTPUT_DIR: 'exports' });
    expect(await runCli(['export', '--month', '2026-09', '--demo'], ctx)).toBe(0);
    expect(readdirSync(ctx.cwd)).toEqual(['demo-output']);
    const folder = join(ctx.cwd, 'demo-output', 'BSP', '2026-09');
    expect(readdirSync(folder).sort()).toEqual([FILE, PROTOCOL, 'manifest.json'].sort());

    const demo = decode(readFileSync(join(folder, FILE)));
    // The example file with "DEMO " before every Text1, and nothing else changed.
    expect(demo).toBe(decode(EXAMPLE).replace(/<Text1>/g, '<Text1>DEMO '));
    const texts = [...demo.matchAll(/<Text1>([^<]*)<\/Text1>/g)].map((match) => match[1] ?? '');
    expect(texts).toHaveLength(2 * 21);
    expect(texts.every((text) => text.startsWith('DEMO '))).toBe(true);
    const protocol = readFileSync(join(folder, PROTOCOL), 'utf8').split('\n');
    expect(protocol[0]).toBe('DEMO');
    expect(protocol[1]).toMatch(/^DEMO: bundled sample data/);
    expect(protocol).toContain('  Mandant: 7777, Geschäftsbereich 0, Leitwährung CHF');
    expect(JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8'))).toMatchObject({
      files: [{ file: FILE, status: 'current', bookings: 21, journalTotalCents: 214_442, currency: 'CHF', mandant: '7777', geschaeftsbereich: 0 }],
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
