import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run.js';
import { block, transaction, value } from '../helpers/abacus.js';
import { FIXTURE_FILES, createApaleoContext } from '../helpers/apaleo.js';
import { VIE_MAPPING } from '../helpers/live-mapping.js';

/**
 * The CLI on the recorded apaleo sandbox responses (`test/fixtures/apaleo/live/`)
 * through the fake apaleo API: VIE is the regression day of the Abacus target,
 * with the committed Abacus live mapping (Austrian rates with the placeholder codes
 * V10, V13 and V20) and `abacus.leitwaehrung: EUR`, because both recorded
 * properties book in EUR; BER, a German property, shows that the KMU hotel
 * template maps none of its 7 % and 19 % accounts.
 */

/** After the recorded days, so both are closed. */
const AFTER_THE_DAY = new Date('2026-10-25T08:00:00Z');
function liveContext(extraConfig = '', files: Record<string, string> = {}) {
  const config = `${FIXTURE_FILES['apaleo-abacus.config.yaml']}properties:\n  - id: VIE\n  - id: BER\n    geschaeftsbereich: 2\n${extraConfig}`;
  return createApaleoContext({ live: true }, { files: { 'apaleo-abacus.config.yaml': config, 'mapping-VIE.csv': VIE_MAPPING, ...files }, now: AFTER_THE_DAY });
}

describe('mapping check on the recorded VIE day', () => {
  it('passes mapping check --from --to with the Abacus live mapping, warning only about the Austrian rates and placeholder codes', async () => {
    const ctx = liveContext();
    expect(await runCli(['mapping', 'check', '--property', 'VIE', '--from', '2026-10-21', '--to', '2026-10-21'], ctx)).toBe(0);
    expect(ctx.out()).not.toMatch(/sub-cent|not a whole number of cents/);
    expect(ctx.out()).toContain('every booked account is mapped');
    expect(ctx.out()).toContain('W-VAT-RATE-UNUSUAL');
    expect(ctx.out()).toContain('W-MWST-CODE-UNCHECKED');
    expect(ctx.out()).not.toMatch(/^E-/m);
    expect(ctx.out()).toContain('Result: mapping OK');
  });
});

describe('export of the recorded VIE day 2026-10-21 (full pipeline, Abacus target, aggregate check on)', () => {
  const FILE = 'ABACUS_Buchungen_20261021-20261021_VIE.xml';
  const PROTOCOL = FILE.replace('.xml', '.protokoll.txt');

  async function exportVie() {
    const ctx = liveContext('checks:\n  aggregates: true\n');
    const code = await runCli(['export', '--from', '2026-10-21', '--to', '2026-10-21', '--property', 'VIE'], ctx);
    const folder = join(ctx.cwd, 'exports', 'VIE', '2026-10');
    return { ctx, code, folder, protocol: () => readFileSync(join(folder, PROTOCOL), 'utf8'), xml: () => readFileSync(join(folder, FILE), 'utf8') };
  }

  it('VIE exports cleanly: one file without E- finding or W-AGGREGATE-DIFF, 35 lines, 29 bookings, 6 skipped, the writer validation passing', async () => {
    const { ctx, code, folder, protocol, xml } = await exportVie();
    expect(ctx.err()).toBe('');
    expect(code).toBe(0);
    expect(ctx.out()).not.toMatch(/\bE-[A-Z]|W-AGGREGATE-DIFF|W-VAT-ROUNDING/);
    expect(readdirSync(folder).sort()).toEqual([FILE, PROTOCOL, 'manifest.json'].sort());
    expect(protocol()).toContain('Property VIE, 2026-10-21 to 2026-10-21: 35 apaleo lines, 29 Abacus bookings');
    expect(protocol()).toMatch(/both sides on the same Abacus account\s+6\s+312\.60/);
    expect(xml().match(/<Transaction /g)).toHaveLength(29);
    expect(xml()).toContain('<KeyCurrency>EUR</KeyCurrency>');
  });

  it('VAT comparison in the protocol: the tax of the bookings beside apaleo precise VAT per MWST-Code, with the line rounding and no E-VAT-TOTAL', async () => {
    const { protocol } = await exportVie();
    const text = protocol();
    expect(text).toContain('V10 10 %: net 77.46, tax 7.74, gross 85.20, apaleo VAT 7.75, difference 0.01 (apaleo precise 7.74545454)');
    expect(text).toContain('V13 13 %: net 362.85, tax 47.17, gross 410.02, apaleo VAT 47.17, difference 0.00 (apaleo precise 47.17044248)');
    expect(text).toContain('V20 20 %: net 39.49, tax 7.89, gross 47.38, apaleo VAT 7.90, difference 0.01 (apaleo precise 7.89666666)');
    expect(text).toContain('no MWST-Code 0 %: net 45.00, tax 0.00, gross 45.00, apaleo VAT 0.00, difference 0.00');
    expect(text).toContain('V13 13 %: net 155.77, tax 20.25, gross 176.02, apaleo VAT 20.25, difference 0.00 (apaleo precise 20.2500885)');
    expect(text).toContain('V20 20 %: net 16.65, tax 3.33, gross 19.98, apaleo VAT 3.33, difference 0.00 (apaleo precise 3.33)');
    expect(text).toContain('rounded to the Rappen, while apaleo rounds only the precise total of its lines per day');
    expect(text).toContain('Deposits (Anzahlungen) received, released and refunded:\n  received        491.00\n  released        295.00\n  of it refunded   10.00\n');
    expect(text).toContain('Accounts receivable (Debitoren, Soll positive): 95.00');
    expect(text).toMatch(/^ {2}1000 +111\.70$/m);
    expect(text).toMatch(/^ {2}1090 +576\.90$/m);
    expect(text).toContain('VAT rounding differences: 0.00');
    expect(text).not.toContain('E-VAT-TOTAL');
    // A Ziffer of the MWST-Abrechnung only for the Swiss rates, so none on this Austrian day.
    expect(text).not.toContain('(Ziffer');
  });

  it('VAT comparison on the recorded VIE day: the dry run shows it and the Abacus import block, and writes nothing', async () => {
    const ctx = liveContext('checks:\n  aggregates: true\n');
    expect(await runCli(['export', '--from', '2026-10-21', '--to', '2026-10-21', '--property', 'VIE', '--dry-run'], ctx)).toBe(0);
    const out = ctx.out();
    expect(out).toContain('  V10 10 %: net 77.46, tax 7.74, gross 85.20, apaleo VAT 7.75, difference 0.01 (apaleo precise 7.74545454)');
    expect(out).toContain(
      "Each booking carries apaleo's tax of its line, rounded to the Rappen, while apaleo rounds only the precise total of its lines per day, " +
        'so a difference (apaleo VAT minus tax) of a few Rappen is this rounding, not an error.',
    );
    expect(out).toContain(`  File: ${FILE}\n  Bookings: 29 Einzelbuchungen (one Transaction each)\n`);
    expect(out).toContain('  Belegnummern: 1021000001 to 1021000029\n');
    expect(out).toContain('  MWST-Codes: V10 (10 %; tax -7.74 EUR), V13 (13 %; tax -67.42 EUR), V20 (20 %; tax -11.22 EUR)');
    expect(out).toContain('  Mandant: 1234, Geschäftsbereich 0, Leitwährung EUR');
    expect(out).toContain('Result: dry run, nothing written');
    expect(readdirSync(ctx.cwd)).not.toContain('exports');
  });

  it('books the deposit release and the precise tax of the recorded lines as Abacus expects them', async () => {
    const { xml } = await exportVie();
    const text = xml();
    const entry = (n: number) => transaction(text, n);
    const describe = (n: number) => {
      const t = entry(n);
      return [value(block(t, 'CollectiveInformation'), 'Account'), value(block(t, 'SingleInformation'), 'Account'), value(t, 'DebitCredit'), value(t, 'KeyAmount'), t.includes('<TaxData') ? value(block(t, 'TaxData'), 'KeyAmount') : undefined, value(t, 'Text1')];
    };
    const all = Array.from({ length: 29 }, (_, i) => describe(i + 1));
    expect(all).toContainEqual(['1101', '2033', 'C', '105.00', '12.08', 'Auflösung Anzahlung 13 %']);
    expect(all).toContainEqual(['1101', '3410', 'D', '95.00', '-10.93', 'Erlös Beherbergung 13 %']);
    expect(all).toContainEqual(['1101', '3200', 'D', '46.80', '-4.25', 'Erlös Speisen und Getränke 10 %']);
  });
});

describe('BER with the KMU template', () => {
  it('raises no parse, sub-cent or Swagger-shape error and stops with E-UNMAPPED for the 7 % and 19 % revenue and deposit accounts', async () => {
    const ctx = liveContext();
    expect(await runCli(['init-mapping', '--property', 'BER', '--template', 'kmu-hotel'], ctx)).toBe(0);
    expect(await runCli(['export', '--from', '2026-10-21', '--to', '2026-10-21', '--property', 'BER'], ctx)).toBe(1);
    const out = ctx.out();
    expect(out).not.toMatch(/sub-cent|not a whole number of cents|does not match its API description/);
    const unmapped = out.split('\n').filter((line) => line.includes('E-UNMAPPED'));
    for (const account of ['RevenueAccommodation_Reduced:7.00', 'RevenueFoodAndBeverages_Reduced:7.00', 'RevenueFoodAndBeverages_Normal:19.00', 'RevenueNoShow_Reduced:7.00']) {
      expect(unmapped.some((line) => line.includes(`apaleo account ${account} (Revenues`)), account).toBe(true);
    }
    expect(unmapped.some((line) => /Liabilities accounts of reservations or folios under parent 3000 at 7 %/.test(line))).toBe(true);
    expect(unmapped.some((line) => /Liabilities accounts? of reservations or folios under parent 3000 at 19 %/.test(line))).toBe(true);
    expect(readdirSync(ctx.cwd)).not.toContain('exports');
  });
});
