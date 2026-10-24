import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/core/config.js';
import { FindingsError } from '../../src/core/errors.js';
import { DEFAULT_TARGET, exportedFile, fileTag, runExport, type ExportRequest, type TargetWriter } from '../../src/export/index.js';
import { abacusTarget, createAbacusTarget, settingsFromConfig } from '../../src/abacus/index.js';
import type { PostedBooking } from '../../src/posting/index.js';
import { BSP, FIXTURE_FILES, createApaleoContext, createFixtureSource } from '../helpers/apaleo.js';
import { VIE_MAPPING } from '../helpers/live-mapping.js';
import { BEISPIEL_MAPPING_TEXT, exportSetup, latePosting, withoutPlaceholderCodes, type ExportSetup } from '../helpers/export.js';

/**
 * The output folder logic must work for any target, not only Abacus: a fake
 * target with its own file names and a comparison that ignores nothing.
 */
const fakeTarget: TargetWriter<PostedBooking> = {
  id: 'fake',
  currency: () => 'EUR',
  protocolTitle: 'FAKE protocol',
  filePattern: /^FAKE_(\d{8})-(\d{8})_[A-Za-z0-9_-]+\.txt$/,
  fileName: ({ part, ...meta }) => `FAKE_${part.from.replaceAll('-', '')}-${part.to.replaceAll('-', '')}_${fileTag(meta)}.txt`,
  render: (bookings) => ({
    bytes: new TextEncoder().encode(bookings.map((b) => `${b.collectiveAccount};${b.singleAccount};${b.debitCredit};${b.grossCents};${b.tax?.taxCents ?? ''}\n`).join('')),
    findings: [],
  }),
  sameContent: (existing, next) => Buffer.from(existing).equals(Buffer.from(next)),
  importBlock: (bookings) => ['FAKE import:', `  ${bookings.length} lines`],
  movements: (booking) => abacusTarget.movements(booking),
  taxReturnLine: () => undefined,
  manifestFields: () => ({}),
  advice: {
    currency: 'FAKE currency advice.',
    overlap: 'FAKE overlap advice',
    reimport: 'FAKE reimport advice.',
  },
};

const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' } as const;

async function runWith(setup: ExportSetup, request: Partial<ExportRequest>, target: TargetWriter<PostedBooking>) {
  const { ctx, fake } = setup;
  const loaded = await loadConfig({ path: join(ctx.cwd, 'apaleo-abacus.config.yaml'), env: ctx.env, readFile: ctx.fs.readFile });
  const full: ExportRequest = { period: SEPTEMBER, propertyIds: [BSP], dryRun: false, overwrite: false, ...request };
  const [outcome] = await runExport(full, { loaded, source: fake, ctx, target });
  if (!outcome) throw new Error('no outcome');
  return outcome;
}

const folderOf = (setup: ExportSetup) => join(setup.ctx.cwd, 'exports', BSP, '2026-09');
const errorCodes = (outcome: { findings: { code: string }[] }) => outcome.findings.filter((f) => f.code.startsWith('E-')).map((f) => f.code);

interface ContractCase {
  target: TargetWriter<PostedBooking>;
  /** The file name of property BSP for a period, as `YYYYMMDD`. */
  name: (from: string, to: string) => string;
  /** The number of bookings in a written file. */
  count: (text: string) => number;
  protocolTitle: RegExp;
}

const CONTRACT_CASES: [string, ContractCase][] = [
  ['the fake target', { target: fakeTarget, name: (from, to) => `FAKE_${from}-${to}_BSP.txt`, count: (text) => text.split('\n').length - 1, protocolTitle: /^FAKE protocol\. No warranty/ }],
  [
    'the Abacus target',
    {
      target: abacusTarget,
      name: (from, to) => `ABACUS_Buchungen_${from}-${to}_BSP.xml`,
      count: (text) => text.match(/<Transaction /g)?.length ?? 0,
      protocolTitle: /^apaleo-abacus export protocol\. No warranty/,
    },
  ],
];

describe.each(CONTRACT_CASES)('the export through a TargetWriter: %s', (_label, { target, name, count, protocolTitle }) => {
  const FILE = name('20260901', '20260930');
  const [stem = '', extension = ''] = FILE.split(/(?=\.[a-z]+$)/);
  const PROTOCOL = `${stem}.protokoll.txt`;
  const run = (setup: ExportSetup, request: Partial<ExportRequest> = {}, chosen = target) => runWith(setup, request, chosen);
  const bookingsInFile = (setup: ExportSetup) => count(readFileSync(join(folderOf(setup), FILE), 'utf8'));

  it('writes the file under the name of the target, with protocol and manifest, and no name of another target', async () => {
    const setup = exportSetup();
    const outcome = await run(setup);
    expect(outcome.status).toBe('written');
    expect(outcome.path).toBe(join(folderOf(setup), FILE));
    expect(readdirSync(folderOf(setup)).sort()).toEqual([PROTOCOL, FILE, 'manifest.json'].sort());
    expect(bookingsInFile(setup)).toBe(24);
    expect(readFileSync(join(folderOf(setup), PROTOCOL), 'utf8')).toMatch(protocolTitle);
    expect(JSON.parse(readFileSync(join(folderOf(setup), 'manifest.json'), 'utf8'))).toMatchObject({ files: [{ file: FILE, status: 'current', ...SEPTEMBER }] });
  });

  it('finds the existing file through the pattern of the target', async () => {
    const setup = exportSetup();
    await run(setup);
    const folder = folderOf(setup);
    const other = target === fakeTarget ? DEFAULT_TARGET : fakeTarget;
    expect(await exportedFile(setup.ctx, folder, SEPTEMBER, target)).toBe(FILE);
    // The manifest records this target's file; another target must not take it for its own.
    expect(await exportedFile(setup.ctx, folder, SEPTEMBER, other)).toBeUndefined();
    await setup.ctx.fs.rm(join(folder, 'manifest.json'));
    expect(await exportedFile(setup.ctx, folder, SEPTEMBER, target)).toBe(FILE);
    expect(await exportedFile(setup.ctx, folder, SEPTEMBER, other)).toBeUndefined();
  });

  it('sees every file of the target even when its pattern has the g or y flag', async () => {
    for (const flags of ['g', 'y', 'gy']) {
      const stateful = { ...target, filePattern: new RegExp(target.filePattern.source, flags) };
      const setup = exportSetup();
      await run(setup, {}, stateful);
      const folder = folderOf(setup);
      for (let i = 0; i < 3; i++) expect(await exportedFile(setup.ctx, folder, SEPTEMBER, stateful)).toBe(FILE);
      // Sorted right after FILE: a pattern that kept its lastIndex would skip it.
      await setup.ctx.fs.writeFile(join(folder, name('20260915', '20260920')), '');
      const outcome = await run(setup, {}, stateful);
      expect(errorCodes(outcome)).toEqual(['E-PERIOD-OVERLAP']);
    }
  });

  it('leaves an unchanged file alone on a re-run', async () => {
    const setup = exportSetup();
    await run(setup);
    const outcome = await run(setup);
    expect(outcome.status).toBe('unchanged');
    expect(readdirSync(folderOf(setup)).sort()).toEqual([PROTOCOL, FILE, 'manifest.json'].sort());
  });

  it('refuses a period that overlaps another file of the target with E-PERIOD-OVERLAP', async () => {
    const setup = exportSetup();
    expect((await run(setup, { period: { from: '2026-09-01', to: '2026-09-15' } })).status).toBe('written');
    const outcome = await run(setup);
    expect(outcome.status).toBe('failed');
    expect(errorCodes(outcome)).toEqual(['E-PERIOD-OVERLAP']);
    const [overlap] = withoutPlaceholderCodes(outcome.findings);
    expect(overlap?.message).toContain(`${name('20260901', '20260915')} already covers some of the days`);
    expect(overlap?.message.endsWith(` ${target.advice.overlap}`)).toBe(true);
    expect(overlap?.message).not.toMatch(/DATEV|datev\./);
    expect(existsSync(join(folderOf(setup), FILE))).toBe(false);
  });

  it('refuses changed content with E-FILE-EXISTS, and --overwrite keeps the old file beside the new one', async () => {
    const setup = exportSetup();
    await run(setup);
    latePosting(setup.data);
    const refused = await run(setup);
    expect(refused.status).toBe('failed');
    expect(errorCodes(refused)).toEqual(['E-FILE-EXISTS']);
    const [exists] = withoutPlaceholderCodes(refused.findings);
    expect(exists?.message).toContain(`${target.advice.reimport} Then run again with --overwrite`);
    expect(exists?.message).toMatch(new RegExp(`the old file is kept as <name>\\.replaced-<timestamp>\\${extension}\\.$`));
    expect(exists?.message).not.toMatch(/DATEV|datev\.|Festschreibung/);

    const replaced = await run(setup, { overwrite: true });
    expect(replaced.status).toBe('replaced');
    expect(readdirSync(folderOf(setup)).sort()).toEqual(
      [PROTOCOL, `${stem}.replaced-20261020T080000Z.protokoll.txt`, `${stem}.replaced-20261020T080000Z${extension}`, FILE, 'manifest.json'].sort(),
    );
    expect(bookingsInFile(setup)).toBe(25);
  });

  it('reports the findings of a file the target refuses to render, and writes nothing', async () => {
    const setup = exportSetup();
    const refusing: TargetWriter<PostedBooking> = {
      ...target,
      render: () => {
        throw new FindingsError('not written', [{ code: 'E-FAKE', message: 'the fake target refuses' }]);
      },
    };
    const outcome = await run(setup, {}, refusing);
    expect(outcome.status).toBe('failed');
    expect(errorCodes(outcome)).toEqual(['E-FAKE']);
    expect(existsSync(join(setup.ctx.cwd, 'exports'))).toBe(false);
  });
});

describe('the Abacus target through the export', () => {
  it('Abacus is the default target: the export writes ABACUS_Buchungen_20260901-20260930_BSP.xml and nothing else', async () => {
    const setup = exportSetup();
    const outcome = await runWith(setup, {}, DEFAULT_TARGET);
    expect(outcome.status).toBe('written');
    expect(readdirSync(folderOf(setup)).sort()).toEqual(['ABACUS_Buchungen_20260901-20260930_BSP.protokoll.txt', 'ABACUS_Buchungen_20260901-20260930_BSP.xml', 'manifest.json']);
    expect(DEFAULT_TARGET).toBe(abacusTarget);
  });

  it('reports the Abacus validation findings of a file it cannot write, and writes nothing', async () => {
    const setup = exportSetup({ files: { 'mapping-BSP.csv': BEISPIEL_MAPPING_TEXT.replaceAll(';1090;', ';10A0;') } });
    const outcome = await runWith(setup, {}, DEFAULT_TARGET);
    expect(outcome.status).toBe('failed');
    expect(new Set(errorCodes(outcome))).toEqual(new Set(['E-ABACUS-ACCOUNT']));
    expect(existsSync(join(setup.ctx.cwd, 'exports'))).toBe(false);
  });

  it('takes the Mandant and the Geschäftsbereich of the property for the file', async () => {
    const setup = exportSetup();
    const loaded = await loadConfig({ path: join(setup.ctx.cwd, 'apaleo-abacus.config.yaml'), env: setup.ctx.env, readFile: setup.ctx.fs.readFile });
    const config = { ...loaded.config, properties: [{ id: BSP, mandant: '42', geschaeftsbereich: 7 }] };
    expect(settingsFromConfig({ config, propertyId: BSP })).toMatchObject({ mandant: '42', geschaeftsbereich: 7, leitwaehrung: 'EUR' });
    const outcome = await runWith(setup, {}, createAbacusTarget(() => ({ ...settingsFromConfig({ config, propertyId: BSP }) })));
    expect(outcome.status).toBe('written');
    expect(readFileSync(join(folderOf(setup), 'ABACUS_Buchungen_20260901-20260930_BSP.xml'), 'utf8')).toContain('<Division>7</Division>');
    // The manifest names the unit of the target's settings, the same as the import block, not the config's.
    const manifest = JSON.parse(readFileSync(join(folderOf(setup), 'manifest.json'), 'utf8'));
    expect(manifest.files[0]).toMatchObject({ mandant: '42', geschaeftsbereich: 7 });
    expect(readFileSync(join(folderOf(setup), 'ABACUS_Buchungen_20260901-20260930_BSP.protokoll.txt'), 'utf8')).toContain('Mandant: 42, Geschäftsbereich 7');
  });

  it('writes only the fields of manifestFields into the manifest: no Abacus Mandant for another target', async () => {
    const setup = exportSetup();
    expect((await runWith(setup, {}, fakeTarget)).status).toBe('written');
    const [entry] = JSON.parse(readFileSync(join(folderOf(setup), 'manifest.json'), 'utf8')).files;
    expect(entry).not.toHaveProperty('mandant');
    expect(entry).not.toHaveProperty('geschaeftsbereich');
    const tagged = exportSetup();
    expect((await runWith(tagged, {}, { ...fakeTarget, manifestFields: () => ({ mandant: '9' }) })).status).toBe('written');
    expect(JSON.parse(readFileSync(join(folderOf(tagged), 'manifest.json'), 'utf8')).files[0]).toMatchObject({ mandant: '9' });
  });
});

/** The fixture config with property BSP and the given Leitwährung. */
const exportConfigWith = (leitwaehrung: string) => `${FIXTURE_FILES['apaleo-abacus.config.yaml'].replace('leitwaehrung: EUR', `leitwaehrung: ${leitwaehrung}`)}properties:\n  - id: BSP\n`;

describe('the currency of the target (export-run, "Currency of the target")', () => {
  /** The fake target, booking in CHF. */
  const chfTarget: TargetWriter<PostedBooking> = { ...fakeTarget, currency: () => 'CHF', advice: { ...fakeTarget.advice, currency: 'FAKE files are in CHF.' } };
  /** Hotel Beispiel keeping its books in CHF; `eurLines` ledger lines stay in EUR. */
  const swissSetup = (eurLines = 0) =>
    exportSetup({
      data: (data) => {
        for (const property of data.properties) property.currency = 'CHF';
        for (const [i, line] of (data.ledger[BSP] ?? []).entries()) line.currency = i < eurLines ? 'EUR' : 'CHF';
      },
    });

  it('asks the target for its currency: the Abacus target books in abacus.leitwaehrung', async () => {
    const { ctx } = exportSetup();
    const { config } = await loadConfig({ path: join(ctx.cwd, 'apaleo-abacus.config.yaml'), env: ctx.env, readFile: ctx.fs.readFile });
    expect(DEFAULT_TARGET.currency(config)).toBe('EUR');
    expect(DEFAULT_TARGET.currency({ ...config, abacus: { ...config.abacus, leitwaehrung: 'CHF' } })).toBe('CHF');
  });

  it('refuses a CHF property in a Mandant with the Leitwährung EUR before reading its ledger, naming CHF and EUR', async () => {
    const setup = swissSetup();
    const outcome = await runWith(setup, {}, DEFAULT_TARGET);
    expect(outcome.status).toBe('failed');
    expect(outcome.findings.map((f) => [f.code, f.value])).toEqual([['E-CURRENCY', 'CHF']]);
    expect(outcome.findings[0]?.message).toContain('keeps its books in CHF, but the export file books in EUR only');
    expect(outcome.findings[0]?.message).toContain('This tool does not convert');
    expect(setup.fake.calls.some((call) => call.startsWith('getLedger'))).toBe(false);
    expect(existsSync(join(setup.ctx.cwd, 'exports'))).toBe(false);
  });

  it('writes the file of a target that books in CHF for a property and ledger in CHF, and the default target with abacus.leitwaehrung CHF', async () => {
    const setup = swissSetup();
    const outcome = await runWith(setup, {}, chfTarget);
    expect(outcome.findings.map((f) => f.code)).not.toContain('E-CURRENCY');
    expect(outcome.status).toBe('written');
    expect(readdirSync(folderOf(setup))).toContain('FAKE_20260901-20260930_BSP.txt');
    const chf = swissSetup();
    await chf.ctx.fs.writeFile(join(chf.ctx.cwd, 'apaleo-abacus.config.yaml'), exportConfigWith('CHF'));
    const standard = await runWith(chf, {}, DEFAULT_TARGET);
    expect(standard.status).toBe('written');
    expect(readFileSync(join(folderOf(chf), 'ABACUS_Buchungen_20260901-20260930_BSP.xml'), 'utf8')).toContain('<KeyCurrency>CHF</KeyCurrency>');
  });

  it('refuses a month with one EUR line under the CHF target, naming the count and both currencies', async () => {
    const setup = swissSetup(1);
    const outcome = await runWith(setup, {}, chfTarget);
    expect(outcome.status).toBe('failed');
    expect(outcome.findings.map((f) => [f.code, f.value])).toEqual([['E-CURRENCY', 'EUR']]);
    expect(outcome.findings[0]?.message).toContain('1 apaleo line(s) of BSP are in EUR, but the export file books in CHF only. FAKE files are in CHF. This tool does not convert.');
    expect(outcome.findings[0]?.message).not.toMatch(/\bAbacus\b|abacus\./);
    expect(existsSync(join(setup.ctx.cwd, 'exports'))).toBe(false);
  });

  describe('with the Abacus target and abacus.leitwaehrung CHF', () => {
    /** Hotel Beispiel in a CHF Mandant: the property and the first `eurLines` ledger lines in EUR or CHF as given. */
    async function chfMandant(propertyCurrency: 'CHF' | 'EUR', eurLines = 0) {
      const setup = exportSetup({
        data: (data) => {
          for (const property of data.properties) property.currency = propertyCurrency;
          for (const [i, line] of (data.ledger[BSP] ?? []).entries()) line.currency = i < eurLines || propertyCurrency === 'EUR' ? 'EUR' : 'CHF';
        },
      });
      await setup.ctx.fs.writeFile(join(setup.ctx.cwd, 'apaleo-abacus.config.yaml'), exportConfigWith('CHF'));
      return setup;
    }

    it('EUR property in a CHF Mandant: E-CURRENCY names EUR and CHF and the Leitwährung, reads no ledger and writes no file', async () => {
      const setup = await chfMandant('EUR');
      const outcome = await runWith(setup, {}, DEFAULT_TARGET);
      expect(outcome.status).toBe('failed');
      expect(outcome.findings.map((f) => [f.code, f.value])).toEqual([['E-CURRENCY', 'EUR']]);
      expect(outcome.findings[0]?.message).toContain('keeps its books in EUR, but the export file books in CHF only');
      expect(outcome.findings[0]?.message).toContain("An Abacus booking is written in the Mandant's Leitwährung (abacus.leitwaehrung)");
      expect(outcome.findings[0]?.message).toContain('This tool does not convert');
      expect(setup.fake.calls.some((call) => call.startsWith('getLedger'))).toBe(false);
      expect(existsSync(join(setup.ctx.cwd, 'exports'))).toBe(false);
    });

    it('Swiss property: no E-CURRENCY, and the Abacus file books Currency and KeyCurrency CHF', async () => {
      const setup = await chfMandant('CHF');
      const outcome = await runWith(setup, {}, DEFAULT_TARGET);
      expect(outcome.findings.map((f) => f.code)).not.toContain('E-CURRENCY');
      expect(outcome.status).toBe('written');
      const xml = readFileSync(join(folderOf(setup), 'ABACUS_Buchungen_20260901-20260930_BSP.xml'), 'utf8');
      expect(xml).toContain('<KeyCurrency>CHF</KeyCurrency>');
      expect(xml).toContain('<Currency>CHF</Currency>');
      expect(xml).not.toMatch(/<(?:Key)?Currency>(?!CHF<)/);
    });

    it('Line in another currency: E-CURRENCY names the number of EUR lines and both currencies, and no file is written', async () => {
      const setup = await chfMandant('CHF', 1);
      const outcome = await runWith(setup, {}, DEFAULT_TARGET);
      expect(outcome.status).toBe('failed');
      expect(outcome.findings.map((f) => [f.code, f.value])).toEqual([['E-CURRENCY', 'EUR']]);
      expect(outcome.findings[0]?.message).toContain('1 apaleo line(s) of BSP are in EUR, but the export file books in CHF only.');
      expect(existsSync(join(setup.ctx.cwd, 'exports'))).toBe(false);
    });
  });
});

describe('the checks and the summary do not depend on the target (recorded VIE day 2026-10-21)', () => {
  const MAPPING = VIE_MAPPING;
  const CONFIG = `${FIXTURE_FILES['apaleo-abacus.config.yaml']}properties:\n  - id: VIE\nchecks:\n  aggregates: true\n`;

  async function exportVie(target: TargetWriter<PostedBooking> | undefined) {
    const ctx = createApaleoContext(
      { live: true },
      { files: { 'apaleo-abacus.config.yaml': CONFIG, 'mapping-VIE.csv': MAPPING }, now: new Date('2026-10-25T08:00:00Z') },
    );
    const { source } = createFixtureSource({ live: true }, {}, ctx);
    const loaded = await loadConfig({ path: join(ctx.cwd, 'apaleo-abacus.config.yaml'), env: ctx.env, readFile: ctx.fs.readFile });
    const request: ExportRequest = { period: { from: '2026-10-21', to: '2026-10-21' }, propertyIds: ['VIE'], dryRun: false, overwrite: false };
    const [outcome] = await runExport(request, { loaded, source, ctx, ...(target ? { target } : {}) });
    if (!outcome) throw new Error('no outcome');
    return outcome;
  }

  it('gives the fake target the same summary and findings as the default target, without W-AGGREGATE-DIFF', async () => {
    const [standard, fake] = [await exportVie(undefined), await exportVie(fakeTarget)];
    expect(standard.status).toBe('written');
    expect(fake.status).toBe('written');
    expect(fake.path).toMatch(/FAKE_20261021-20261021_VIE\.txt$/);
    expect(fake.bookings).toBe(29);
    // Only the import block belongs to the target.
    const withoutImport = (summary: string) => summary.replace(/\n(FAKE import|Import into Abacus)[^]*?\n\n/, '\n');
    expect(withoutImport(fake.summary)).toBe(withoutImport(standard.summary));
    expect(fake.summary).toContain('FAKE import:\n  29 lines\n');
    expect(standard.summary).toContain('  Bookings: 29 Einzelbuchungen (one Transaction each)');
    expect(fake.findings).toEqual(standard.findings);
    expect(withoutPlaceholderCodes(fake.findings).map((f) => f.code)).toEqual([]);
    expect(fake.findings.map((f) => f.value).sort()).toEqual(['V10', 'V13', 'V20']);
    expect(fake.summary).toContain('Deposits (Anzahlungen) received, released and refunded:\n  received        491.00\n  released        295.00\n  of it refunded   10.00\n');
  });
});

describe('the target boundary in src/export', () => {
  const dir = fileURLToPath(new URL('../../src/export/', import.meta.url));
  const sources = readdirSync(dir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => [name, readFileSync(join(dir, name), 'utf8')] as const);

  it.each(sources)('%s imports a target module only through its TargetWriter', (_name, text) => {
    const targetImports = [...text.matchAll(/from '\.\.\/abacus\/([^']+)'/g)].map((match) => match[1]);
    expect(targetImports.every((module) => module === 'target.js')).toBe(true);
  });

  it('keeps target file names, formats and import advice out of the output folder logic', () => {
    const output = sources.find(([name]) => name === 'output.ts')?.[1] ?? '';
    expect(output).not.toMatch(/EXTF|Buchungsstapel|\.csv|\.xml|XML Buchungen/);
    expect(output).not.toMatch(/DATEV|datev\.[a-z]|\bBMD\b|bmd\.[a-z]|Festschreibung|\bAbacus\b|abacus\.[a-z]|Nebenjournal/);
    expect(output).not.toContain('../abacus');
  });

  it('keeps target field names, currencies and config keys out of the checks', () => {
    const checks = sources.find(([name]) => name === 'checks.ts')?.[1] ?? '';
    expect(checks).not.toMatch(/collectiveAccount|singleAccount|debitCredit|konto|steuer|\bCHF\b|\bEUR\b|abacus\.|\bBMD\b|\bAbacus\b/);
  });
});
