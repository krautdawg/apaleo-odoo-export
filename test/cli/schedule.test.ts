import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import * as nodeFs from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run.js';
import type { LocalDate } from '../../src/core/date.js';
import { BSP, FIXTURE_ENV, apaleoFixtureHandler } from '../helpers/apaleo.js';
import { createTestContext, type TestContext } from '../helpers/context.js';
import { BEISPIEL_MAPPING_TEXT, addSecondProperty, exportConfig, exportSetup, stripPlaceholderCodes, type ExportSetup, type ExportSetupOptions } from '../helpers/export.js';

/**
 * `schedule --once` end to end through `runCli`. The Hotel Beispiel fixtures
 * lie in September 2026, so the monthly scenarios of the spec (October, due on
 * 3 November) run one month earlier: September, due on 3 October.
 */
const SEPTEMBER_FILE = 'ABACUS_Buchungen_20260901-20260930_BSP.xml';
const ONCE = ['schedule', '--once'];
/** A catch-up window that reaches back to September's due date (3 October) but not to August's (3 September). */
const ONE_MONTH = ['schedule:', '  catchUpDays: 30'];

/** The output lines, without the W-MWST-CODE-UNCHECKED warnings for the fixture's placeholder codes V10 and V20. */
const lines = (ctx: TestContext) => stripPlaceholderCodes(ctx.out()).trimEnd().split('\n');
const setClock = (ctx: TestContext, at: string) => void (ctx.now = () => new Date(at));

/** A copy of the fixture's first logis charge on another business day. */
function chargeOn(day: LocalDate) {
  return (data: ExportSetup['data']) => {
    const template = data.ledger[BSP]?.find((line) => line.credit.number === 'RevenueAccommodation_VeryReduced:10.00');
    if (!template) throw new Error('fixture logis charge missing');
    data.ledger[BSP]?.push({ ...structuredClone(template), businessDate: day, postedAt: `${day}T15:00:00Z`, sourceEntryNumber: `BSPE-${day}` });
  };
}

const ledgerCalls = (setup: ExportSetup) => setup.fake.calls.filter((call) => call.startsWith('getLedger'));

/** `exportSetup` with the Hotel Beispiel in Switzerland: its apaleo time zone is `Europe/Zurich`, as is the default `schedule.timezone`. */
function swissSetup(options: ExportSetupOptions = {}): ExportSetup {
  return exportSetup({
    ...options,
    data: (data) => {
      for (const property of data.properties) property.timeZone = 'Europe/Zurich';
      options.data?.(data);
    },
  });
}

describe('apaleo-abacus schedule', () => {
  it('exits 2 with the cron hint when --once is missing, before reading any config', async () => {
    const ctx = createTestContext();
    expect(await runCli(['schedule'], ctx)).toBe(2);
    expect(ctx.err()).toContain('use "apaleo-abacus schedule --once" from cron or the compose loop');
    expect(ctx.err()).not.toContain('config');
  });

  it('exits 2 when the config lists no property', async () => {
    const setup = swissSetup({ config: exportConfig().replace(/properties:[\s\S]*$/, '') });
    expect(await runCli(ONCE, setup.ctx)).toBe(2);
    expect(setup.ctx.err()).toContain('No property to export');
  });
});

describe('monthly cadence', () => {
  it('exports the due month for every configured property and exits 0, as a cron job would call it', async () => {
    const setup = swissSetup({
      config: exportConfig('  - id: BSP2', '    geschaeftsbereich: 2', ...ONE_MONTH),
      files: { 'mapping-BSP2.csv': BEISPIEL_MAPPING_TEXT },
      data: addSecondProperty,
      // 07:30 in Zurich on the due day (schedule.timezone not set).
      now: new Date('2026-10-03T05:30:00Z'),
    });
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(lines(setup.ctx)).toEqual([
      `2026-10-03T07:30:00+02:00 BSP 2026-09 written exports/BSP/2026-09/${SEPTEMBER_FILE}`,
      `2026-10-03T07:30:00+02:00 BSP2 2026-09 written exports/BSP2/2026-09/${SEPTEMBER_FILE.replace('_BSP.xml', '_BSP2.xml')}`,
    ]);
    expect(ledgerCalls(setup)).toEqual(['getLedger BSP 2026-09-01 2026-10-01', 'getLedger BSP2 2026-09-01 2026-10-01']);
  });

  it('exports nothing and exits 0 the day before the due day', async () => {
    const setup = swissSetup({ config: exportConfig('schedule:', '  catchUpDays: 20'), now: new Date('2026-10-02T21:59:59Z') });
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(lines(setup.ctx)).toEqual(['2026-10-02T23:59:59+02:00 nothing due (cadence monthly, today 2026-10-02 in Europe/Zurich)']);
    expect(setup.fake.calls).toEqual([]);
    expect(existsSync(join(setup.ctx.cwd, 'exports'))).toBe(false);
  });

  it('names the property, the period and E-UNMAPPED for a failed month, still exports the other property, and exits 1', async () => {
    const setup = swissSetup({
      config: exportConfig('  - id: BSP2', '    geschaeftsbereich: 2', ...ONE_MONTH),
      files: { 'mapping-BSP.csv': BEISPIEL_MAPPING_TEXT.replace(/^RevenueFoodAndBeverages_Normal:20\.00;.*\r?\n/m, ''), 'mapping-BSP2.csv': BEISPIEL_MAPPING_TEXT },
      data: addSecondProperty,
      now: new Date('2026-10-05T04:00:00Z'),
    });
    expect(await runCli(ONCE, setup.ctx)).toBe(1);
    const out = lines(setup.ctx);
    expect(out[0]).toBe('2026-10-05T06:00:00+02:00 BSP 2026-09 failed E-UNMAPPED');
    expect(out[1]).toMatch(/^ {2}E-UNMAPPED \(apaleo_account\): apaleo account RevenueFoodAndBeverages_Normal:20\.00/);
    expect(out.at(-1)).toMatch(/^2026-10-05T06:00:00\+02:00 BSP2 2026-09 written /);
    expect(existsSync(join(setup.ctx.cwd, 'exports', BSP))).toBe(false);
  });

  it('retries a failed month on the next run and skips the month that was written', async () => {
    const setup = swissSetup({
      config: exportConfig('  - id: BSP2', '    geschaeftsbereich: 2', ...ONE_MONTH),
      files: { 'mapping-BSP.csv': BEISPIEL_MAPPING_TEXT.replace(/^RevenueFoodAndBeverages_Normal:20\.00;.*\r?\n/m, ''), 'mapping-BSP2.csv': BEISPIEL_MAPPING_TEXT },
      data: addSecondProperty,
      now: new Date('2026-10-05T04:00:00Z'),
    });
    expect(await runCli(ONCE, setup.ctx)).toBe(1);
    await setup.ctx.fs.writeFile(join(setup.ctx.cwd, 'mapping-BSP.csv'), BEISPIEL_MAPPING_TEXT);
    setup.fake.calls.length = 0;
    setClock(setup.ctx, '2026-10-05T05:00:00Z');
    const before = setup.ctx.out().length;

    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(stripPlaceholderCodes(setup.ctx.out().slice(before)).trimEnd().split('\n')).toEqual([
      expect.stringMatching(/^2026-10-05T07:00:00\+02:00 BSP 2026-09 written /),
      expect.stringMatching(/^2026-10-05T07:00:00\+02:00 BSP2 2026-09 already exported exports\/BSP2\/2026-09\/ABACUS_/),
    ]);
    expect(ledgerCalls(setup)).toEqual(['getLedger BSP 2026-09-01 2026-10-01']);
  });

  it('exports a whole calendar month: the files stay inside one calendar month', async () => {
    const setup = swissSetup({ config: `${exportConfig()}schedule:\n  catchUpDays: 10\n`, now: new Date('2027-08-03T08:00:00Z') });
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(lines(setup.ctx)).toEqual(['2027-08-03T10:00:00+02:00 BSP 2027-07 no bookings']);
  });
});

describe('skipping what is already exported', () => {
  /** The real apaleo adapter against the fixture server: every request shows up in `ctx.fetchCalls`. */
  function apaleoSetup(env: Record<string, string> = FIXTURE_ENV): TestContext {
    return createTestContext({
      files: { 'config/apaleo-abacus.config.yaml': exportConfig(), 'mapping-BSP.csv': BEISPIEL_MAPPING_TEXT },
      env,
      fetchHandler: apaleoFixtureHandler(),
    });
  }

  it('sends no request to apaleo an hour after it wrote the month, with config path, output folder and secret from the environment', async () => {
    const ctx = apaleoSetup();
    ctx.env = { ...FIXTURE_ENV, APALEO_ABACUS_CONFIG: join(ctx.cwd, 'config/apaleo-abacus.config.yaml'), APALEO_ABACUS_OUTPUT_DIR: join(ctx.cwd, 'data') };
    expect(await runCli(ONCE, ctx)).toBe(0);
    expect(ctx.fetchCalls.length).toBeGreaterThan(0);
    expect(readdirSync(join(ctx.cwd, 'data', BSP, '2026-09'))).toContain(SEPTEMBER_FILE);
    expect(ctx.out()).not.toContain(FIXTURE_ENV.APALEO_CLIENT_SECRET);

    ctx.fetchCalls.length = 0;
    setClock(ctx, '2026-10-20T09:00:00Z');
    expect(await runCli(ONCE, ctx)).toBe(0);
    expect(ctx.fetchCalls).toEqual([]);
    expect(lines(ctx).at(-1)).toBe(`2026-10-20T11:00:00+02:00 BSP 2026-09 already exported data/BSP/2026-09/${SEPTEMBER_FILE}`);
  });

  it('counts a period recorded in manifest.json as exported even after its file was moved away', async () => {
    const ctx = apaleoSetup();
    ctx.env = { ...FIXTURE_ENV, APALEO_ABACUS_CONFIG: join(ctx.cwd, 'config/apaleo-abacus.config.yaml') };
    expect(await runCli(ONCE, ctx)).toBe(0);
    rmSync(join(ctx.cwd, 'exports', BSP, '2026-09', SEPTEMBER_FILE));
    ctx.fetchCalls.length = 0;
    expect(await runCli(ONCE, ctx)).toBe(0);
    expect(ctx.fetchCalls).toEqual([]);
    expect(lines(ctx).at(-1)).toContain('BSP 2026-09 already exported');
  });

  it('counts an Abacus file of the period on disk as exported when there is no manifest', async () => {
    const ctx = apaleoSetup();
    ctx.env = { ...FIXTURE_ENV, APALEO_ABACUS_CONFIG: join(ctx.cwd, 'config/apaleo-abacus.config.yaml') };
    expect(await runCli(ONCE, ctx)).toBe(0);
    rmSync(join(ctx.cwd, 'exports', BSP, '2026-09', 'manifest.json'));
    ctx.fetchCalls.length = 0;
    expect(await runCli(ONCE, ctx)).toBe(0);
    expect(ctx.fetchCalls).toEqual([]);
  });

  it('reports every pending property as failed with the reason when the source cannot be built', async () => {
    const ctx = apaleoSetup({});
    ctx.env = { APALEO_ABACUS_CONFIG: join(ctx.cwd, 'config/apaleo-abacus.config.yaml') };
    expect(await runCli(ONCE, ctx)).toBe(1);
    expect(lines(ctx)).toEqual([
      '2026-10-20T10:00:00+02:00 BSP 2026-09 failed E-EXPORT',
      expect.stringContaining('APALEO_CLIENT_SECRET is not set'),
    ]);
    expect(ctx.fetchCalls).toEqual([]);
  });

  it('fails with the config-file message when properties are set through the environment', async () => {
    const ctx = apaleoSetup();
    ctx.env = { ...FIXTURE_ENV, APALEO_ABACUS_CONFIG: join(ctx.cwd, 'config/apaleo-abacus.config.yaml'), APALEO_ABACUS_PROPERTIES: BSP };
    expect(await runCli(ONCE, ctx)).toBe(1);
    expect(ctx.err()).toContain('"properties" is an array and can only be set in the config file');
  });
});

describe('daily cadence', () => {
  const daily = (...extra: string[]) => exportConfig('schedule:', '  cadence: daily', ...extra);

  it('exports 2026-10-18 on 2026-10-20 with offsetDays 2', async () => {
    const setup = swissSetup({ config: daily('  catchUpDays: 5'), data: chargeOn('2026-10-18') });
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(lines(setup.ctx)).toEqual([
      '2026-10-20T10:00:00+02:00 BSP 2026-10-16 no bookings',
      '2026-10-20T10:00:00+02:00 BSP 2026-10-17 no bookings',
      '2026-10-20T10:00:00+02:00 BSP 2026-10-18 written exports/BSP/2026-10/ABACUS_Buchungen_20261018-20261018_BSP.xml',
    ]);
  });

  it('refuses a daily catch-up window under 5 days before asking apaleo', async () => {
    const setup = swissSetup({ config: daily('  catchUpDays: 3') });
    expect(await runCli(ONCE, setup.ctx)).toBe(1);
    expect(setup.ctx.err()).toContain('schedule.catchUpDays: must be at least 5 with cadence daily');
    expect(setup.fake.calls).toEqual([]);
  });

  it('exports the days missed while the server was off, oldest first, without fetching the days already exported', async () => {
    const setup = swissSetup({ config: daily('  catchUpDays: 40'), now: new Date('2026-09-21T08:00:00Z') });
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(setup.ctx.out()).toContain('BSP 2026-09-16 written');

    // Off for three days: 2026-09-20 to 2026-09-22 became due meanwhile.
    setup.fake.calls.length = 0;
    setClock(setup.ctx, '2026-09-24T08:00:00Z');
    const before = setup.ctx.out().length;
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    const out = setup.ctx.out().slice(before);

    for (const day of ['2026-09-14', '2026-09-15', '2026-09-16']) {
      expect(out).toContain(`BSP ${day} already exported`);
      expect(ledgerCalls(setup).join('\n')).not.toContain(`getLedger BSP ${day}`);
    }
    const missed = ledgerCalls(setup).filter((call) => call >= 'getLedger BSP 2026-09-20');
    expect(missed).toEqual(['getLedger BSP 2026-09-20 2026-09-21', 'getLedger BSP 2026-09-21 2026-09-22', 'getLedger BSP 2026-09-22 2026-09-23']);
    expect(out).toContain('BSP 2026-09-20 no bookings');
    expect(out.indexOf('BSP 2026-09-21 written')).toBeGreaterThan(out.indexOf('BSP 2026-09-20 no bookings'));
    expect(out.indexOf('BSP 2026-09-22 written')).toBeGreaterThan(out.indexOf('BSP 2026-09-21 written'));
    expect(readFileSync(join(setup.ctx.cwd, 'exports', BSP, '2026-09', 'manifest.json'), 'utf8')).toContain('20260922-20260922');
  });
});

describe('periods that are not final yet', () => {
  const dayOne = exportConfig('schedule:', '  monthly:', '    dayOfMonth: 1', '  catchUpDays: 5');
  const notFinal = (from: string, zone = 'Europe/Zurich') =>
    new RegExp(`^ {2}N-NOT-FINAL: the period ends 2026-09-30\\..*counts as final from ${from} 06:00 in ${zone}`);

  it('holds September back with dayOfMonth 1 until 06:00 on 2 October and exports it then, late posting of the audit included', async () => {
    // 2026-09-30T22:05Z is 2026-10-01 00:05 in Zurich: the night audit for 30 September may not have run.
    const setup = swissSetup({ config: dayOne, now: new Date('2026-09-30T22:05:00Z') });
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(lines(setup.ctx)).toEqual(['2026-10-01T00:05:00+02:00 BSP 2026-09 not yet final N-NOT-FINAL', expect.stringMatching(notFinal('2026-10-02'))]);
    expect(setup.fake.calls).toEqual([]);
    expect(existsSync(join(setup.ctx.cwd, 'exports'))).toBe(false);

    // 2 October 00:05: only the audit that closes 30 September has run; the one that closes 1 October can still post to 30 September.
    setClock(setup.ctx, '2026-10-01T22:05:00Z');
    let before = setup.ctx.out().length;
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(setup.ctx.out().slice(before)).toMatch(/^2026-10-02T00:05:00\+02:00 BSP 2026-09 not yet final N-NOT-FINAL\n/);
    expect(setup.fake.calls).toEqual([]);

    // That audit then posts a charge for 30 September (a guest checked in at 04:00).
    chargeOn('2026-09-30')(setup.data);
    setClock(setup.ctx, '2026-10-02T04:05:00Z');
    before = setup.ctx.out().length;
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(stripPlaceholderCodes(setup.ctx.out().slice(before))).toBe(`2026-10-02T06:05:00+02:00 BSP 2026-09 written exports/BSP/2026-09/${SEPTEMBER_FILE}\n`);
    expect(ledgerCalls(setup)).toEqual(['getLedger BSP 2026-09-01 2026-10-01']);
    const manifest = readFileSync(join(setup.ctx.cwd, 'exports', BSP, '2026-09', 'manifest.json'), 'utf8');
    expect(manifest).toContain('20260901-20260930');
    expect(readFileSync(join(setup.ctx.cwd, 'exports', BSP, '2026-09', SEPTEMBER_FILE), 'utf8')).toContain('<EntryDate>2026-09-30</EntryDate>');
  });

  it('holds the day before yesterday back at 00:05 with the default offsetDays 2, and yesterday with offsetDays 1', async () => {
    const config = exportConfig('schedule:', '  cadence: daily', '  daily:', '    offsetDays: 1', '  catchUpDays: 5');
    const setup = swissSetup({ config, data: chargeOn('2026-10-19'), now: new Date('2026-10-19T22:05:00Z') });
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(lines(setup.ctx).filter((l) => !l.startsWith(' '))).toEqual([
      '2026-10-20T00:05:00+02:00 BSP 2026-10-16 no bookings',
      '2026-10-20T00:05:00+02:00 BSP 2026-10-17 no bookings',
      '2026-10-20T00:05:00+02:00 BSP 2026-10-18 not yet final N-NOT-FINAL',
      '2026-10-20T00:05:00+02:00 BSP 2026-10-19 not yet final N-NOT-FINAL',
    ]);
    expect(ledgerCalls(setup)).toEqual(['getLedger BSP 2026-10-16 2026-10-17', 'getLedger BSP 2026-10-17 2026-10-18']);

    setClock(setup.ctx, '2026-10-21T04:05:00Z');
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(setup.ctx.out()).toContain(
      '2026-10-21T06:05:00+02:00 BSP 2026-10-19 written exports/BSP/2026-10/ABACUS_Buchungen_20261019-20261019_BSP.xml',
    );
  });

  it("holds a month back that is final in schedule.timezone but not yet in the property's zone, and exports it on the next run", async () => {
    // 2026-10-01T21:30Z: 2 October 06:30 in Tokyo (September final there with dayOfMonth 2), 1 October 23:30 at the hotel in Switzerland.
    const config = exportConfig('schedule:', '  timezone: Asia/Tokyo', '  monthly:', '    dayOfMonth: 2', '  catchUpDays: 3');
    const setup = swissSetup({ config, now: new Date('2026-10-01T21:30:00Z') });
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(lines(setup.ctx)).toEqual([
      '2026-10-02T06:30:00+09:00 BSP 2026-09 not yet final N-NOT-FINAL',
      expect.stringMatching(notFinal('2026-10-02', 'Europe/Zurich')),
    ]);
    expect(ledgerCalls(setup)).toEqual([]);
    expect(existsSync(join(setup.ctx.cwd, 'exports'))).toBe(false);

    // The same cron time one day later: still inside the 3-day window, and final in Zurich.
    setClock(setup.ctx, '2026-10-02T21:30:00Z');
    const before = setup.ctx.out().length;
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(stripPlaceholderCodes(setup.ctx.out().slice(before))).toBe(`2026-10-03T06:30:00+09:00 BSP 2026-09 written exports/BSP/2026-09/${SEPTEMBER_FILE}\n`);
  });

  it("exports a day held back in the property's zone on the next daily run with the smallest catch-up window", async () => {
    // A daily cron at 06:30 in Tokyo for a hotel in Switzerland: 16 September is final in Tokyo on the 18th, in Zurich only after the run.
    const config = exportConfig('schedule:', '  timezone: Asia/Tokyo', '  cadence: daily', '  catchUpDays: 5');
    const setup = swissSetup({ config, now: new Date('2026-09-17T21:30:00Z') });
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(setup.ctx.out()).toContain('2026-09-18T06:30:00+09:00 BSP 2026-09-16 not yet final N-NOT-FINAL');
    expect(ledgerCalls(setup).join('\n')).not.toContain('2026-09-16 ');

    setClock(setup.ctx, '2026-09-18T21:30:00Z');
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(setup.ctx.out()).toMatch(/2026-09-19T06:30:00\+09:00 BSP 2026-09-16 written exports\/BSP\/2026-09\/ABACUS_/);
    expect(setup.ctx.out()).toContain('2026-09-19T06:30:00+09:00 BSP 2026-09-17 not yet final N-NOT-FINAL');
  });

  it('reports a period that is not final yet as already exported when a file for it was written by hand', async () => {
    const setup = swissSetup({ config: dayOne, now: new Date('2026-10-02T04:05:00Z') });
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    setClock(setup.ctx, '2026-09-30T22:05:00Z');
    setup.fake.calls.length = 0;
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(lines(setup.ctx).at(-1)).toBe(`2026-10-01T00:05:00+02:00 BSP 2026-09 already exported exports/BSP/2026-09/${SEPTEMBER_FILE}`);
    expect(setup.fake.calls).toEqual([]);
  });
});

describe('file system errors in the output folder', () => {
  const permissionDenied = (syscall: string, path: string) =>
    Object.assign(new Error(`EACCES: permission denied, ${syscall} '${path}'`), { code: 'EACCES', syscall, path });
  const twoProperties = () =>
    swissSetup({
      config: exportConfig('  - id: BSP2', '    geschaeftsbereich: 2', ...ONE_MONTH),
      files: { 'mapping-BSP2.csv': BEISPIEL_MAPPING_TEXT },
      data: addSecondProperty,
      now: new Date('2026-10-03T05:30:00Z'),
    });

  it('fails only the property whose folder cannot be read, with the chown hint, and exports the other', async () => {
    const setup = twoProperties();
    setup.ctx.fs = {
      ...nodeFs,
      readdir: (async (path: Parameters<typeof nodeFs.readdir>[0], options?: unknown) => {
        if (String(path).includes(join('exports', 'BSP2'))) throw permissionDenied('scandir', String(path));
        return nodeFs.readdir(path, options as undefined);
      }) as typeof nodeFs.readdir,
    };
    expect(await runCli(ONCE, setup.ctx)).toBe(1);
    const out = lines(setup.ctx);
    expect(out[0]).toMatch(/^2026-10-03T07:30:00\+02:00 BSP 2026-09 written /);
    expect(out[1]).toBe('2026-10-03T07:30:00+02:00 BSP2 2026-09 failed E-EXPORT');
    expect(setup.ctx.out()).toContain('EACCES: permission denied, scandir');
    expect(setup.ctx.out()).toContain('sudo chown -R 1000:1000 data');
    expect(setup.ctx.err()).toBe('');
  });

  it('fails the property it cannot create a folder for with the chown hint and goes on', async () => {
    const setup = twoProperties();
    setup.ctx.fs = {
      ...nodeFs,
      mkdir: (async (path: Parameters<typeof nodeFs.mkdir>[0], options?: unknown) => {
        if (String(path).includes(join('exports', BSP, '2026-09'))) throw permissionDenied('mkdir', String(path));
        return nodeFs.mkdir(path, options as undefined);
      }) as typeof nodeFs.mkdir,
    };
    expect(await runCli(ONCE, setup.ctx)).toBe(1);
    const out = lines(setup.ctx);
    expect(out[0]).toBe('2026-10-03T07:30:00+02:00 BSP 2026-09 failed E-EXPORT');
    expect(setup.ctx.out()).toContain('belongs to another user');
    expect(setup.ctx.out()).toMatch(/BSP2 2026-09 written /);
  });

  it('prints the lines of the files already written before an unexpected error stops the run', async () => {
    const setup = twoProperties();
    setup.ctx.fs = {
      ...nodeFs,
      mkdir: (async (path: Parameters<typeof nodeFs.mkdir>[0], options?: unknown) => {
        if (String(path).includes(join('exports', 'BSP2'))) throw new Error('something broke');
        return nodeFs.mkdir(path, options as undefined);
      }) as typeof nodeFs.mkdir,
    };
    expect(await runCli(ONCE, setup.ctx)).not.toBe(0);
    expect(setup.ctx.out()).toMatch(/^2026-10-03T07:30:00\+02:00 BSP 2026-09 written exports\/BSP\/2026-09\/ABACUS_/);
    expect(setup.ctx.err()).toContain('Unexpected error: something broke');
  });
});

describe('warnings and notes on lines that did not fail', () => {
  /** The Hotel Beispiel mapping with an extra "Notiz" column, which the mapping loader reports as W-UNKNOWN-COLUMN. */
  const withNoteColumn = BEISPIEL_MAPPING_TEXT.replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((row) => (row === '' || row.startsWith('#') ? row : `${row.startsWith('apaleo_account;') ? 'Notiz' : ''};${row}`))
    .join('\n');

  it('appends the W- codes to a written line and prints the findings below it', async () => {
    const setup = swissSetup({ config: exportConfig(...ONE_MONTH), files: { 'mapping-BSP.csv': withNoteColumn }, now: new Date('2026-10-03T05:30:00Z') });
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(lines(setup.ctx)).toEqual([
      `2026-10-03T07:30:00+02:00 BSP 2026-09 written exports/BSP/2026-09/${SEPTEMBER_FILE} W-UNKNOWN-COLUMN`,
      '  W-UNKNOWN-COLUMN: the column "notiz" is not used and is ignored',
    ]);
  });

  it('warns about a swapped MWST-Code of a used mapping row, which only mapping check reported before', async () => {
    const swapped = BEISPIEL_MAPPING_TEXT.replace('(10%);10;3400;V10;10;', '(10%);10;3400;311;10;');
    const setup = swissSetup({ config: exportConfig(...ONE_MONTH), files: { 'mapping-BSP.csv': swapped }, now: new Date('2026-10-03T05:30:00Z') });
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    const out = setup.ctx.out().trimEnd().split('\n');
    expect(out[0]).toBe(`2026-10-03T07:30:00+02:00 BSP 2026-09 written exports/BSP/2026-09/${SEPTEMBER_FILE} W-MWST-CODE-RATE W-MWST-CODE-UNCHECKED`);
    expect(out).toContain(
      '  W-MWST-CODE-RATE (mwst_code): line 3 of the mapping file: the MWST-Code 311 is configured for the Normalsatz at 8.1 % (abacus.mwstCodes.normal), ' +
        'but the row books it at 10 %. Check that the codes are not swapped',
    );
  });

  it('appends the codes to a no-bookings line but leaves out N-NO-BOOKINGS, which the result already says', async () => {
    const setup = swissSetup({
      config: exportConfig('schedule:', '  cadence: daily', '  catchUpDays: 5'),
      files: { 'mapping-BSP.csv': withNoteColumn },
    });
    expect(await runCli(ONCE, setup.ctx)).toBe(0);
    expect(lines(setup.ctx).slice(-2)).toEqual([
      '2026-10-20T10:00:00+02:00 BSP 2026-10-18 no bookings W-UNKNOWN-COLUMN',
      '  W-UNKNOWN-COLUMN: the column "notiz" is not used and is ignored',
    ]);
  });
});
