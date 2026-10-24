import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/core/config.js';
import { FindingsError } from '../../src/core/errors.js';
import { DEFAULT_TARGET, exportedFile, fileTag, runExport, type ExportRequest, type TargetWriter } from '../../src/export/index.js';
import { createOdooTarget, odooMovements, odooTarget, settingsFromConfig } from '../../src/odoo/index.js';
import type { PostedBooking } from '../../src/posting/index.js';
import { BSP, FIXTURE_FILES, createApaleoContext, createFixtureSource } from '../helpers/apaleo.js';
import { VIE_MAPPING } from '../helpers/live-mapping.js';
import { BEISPIEL_MAPPING_TEXT, exportSetup, latePosting, withoutAustrianTaxes, type ExportSetup } from '../helpers/export.js';

/**
 * The output folder logic must work for any target, not only Odoo: a fake
 * target with its own file names and a comparison that ignores nothing.
 */
const fakeTarget: TargetWriter<PostedBooking> = {
  id: 'fake',
  currency: () => 'EUR',
  protocolTitle: 'FAKE protocol',
  filePattern: /^FAKE_(\d{8})-(\d{8})_[A-Za-z0-9_-]+\.txt$/,
  fileName: ({ part, ...meta }) => `FAKE_${part.from.replaceAll('-', '')}-${part.to.replaceAll('-', '')}_${fileTag(meta)}.txt`,
  render: (bookings) => ({
    bytes: new TextEncoder().encode(bookings.map((b) => `${b.debit.account};${b.credit.account};${b.grossCents};${b.vat?.side ?? ''};${b.vat?.apaleoTaxCents ?? ''}\n`).join('')),
    findings: [],
  }),
  sameContent: (existing, next) => Buffer.from(existing).equals(Buffer.from(next)),
  // The fake file carries no revision.
  revisionOf: () => undefined,
  importBlock: (bookings) => ['FAKE import:', `  ${bookings.length} lines`],
  movements: (booking) => odooMovements(booking),
  taxReturnLine: () => undefined,
  manifestFields: () => ({}),
  advice: {
    currency: 'FAKE currency advice.',
    overlap: 'FAKE overlap advice',
    reimport: ({ propertyId }) => `FAKE reimport advice for ${propertyId}.`,
  },
};

const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' } as const;
/** The lines of the Odoo file of Hotel Beispiel for September: its five entries. */
const ODOO_LINES = 25;

async function runWith(setup: ExportSetup, request: Partial<ExportRequest>, target: TargetWriter<PostedBooking>) {
  const { ctx, fake } = setup;
  const loaded = await loadConfig({ path: join(ctx.cwd, 'apaleo-odoo.config.yaml'), env: ctx.env, readFile: ctx.fs.readFile });
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
  /** A count of the written file: its bookings (fake) or lines (Odoo). */
  count: (text: string) => number;
  /** The count before and after a late posting. */
  counts: [number, number];
  protocolTitle: RegExp;
}

const CONTRACT_CASES: [string, ContractCase][] = [
  ['the fake target', { target: fakeTarget, name: (from, to) => `FAKE_${from}-${to}_BSP.txt`, count: (text) => text.split('\n').length - 1, counts: [24, 25], protocolTitle: /^FAKE protocol\. No warranty/ }],
  [
    'the Odoo target',
    {
      target: odooTarget,
      name: (from, to) => `ODOO_Buchungen_${from}-${to}_BSP.csv`,
      count: (text) => text.split('\n').length - 2,
      counts: [ODOO_LINES, ODOO_LINES],
      protocolTitle: /^Odoo journal entries \(import file\)\. No warranty/,
    },
  ],
];

describe.each(CONTRACT_CASES)('the export through a TargetWriter: %s', (_label, { target, name, count, counts, protocolTitle }) => {
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
    expect(bookingsInFile(setup)).toBe(counts[0]);
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
    const [overlap] = withoutAustrianTaxes(outcome.findings);
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
    const [exists] = withoutAustrianTaxes(refused.findings);
    expect(exists?.message).toContain(`${target.advice.reimport({ propertyId: BSP, demo: false, revision: 2 })} Then run again with --overwrite`);
    expect(exists?.message).toMatch(new RegExp(`the old file is kept as <name>\\.replaced-<timestamp>\\${extension}\\.$`));
    expect(exists?.message).not.toMatch(/DATEV|datev\.|Festschreibung/);

    const replaced = await run(setup, { overwrite: true });
    expect(replaced.status).toBe('replaced');
    expect(readdirSync(folderOf(setup)).sort()).toEqual(
      [PROTOCOL, `${stem}.replaced-20261020T080000Z.protokoll.txt`, `${stem}.replaced-20261020T080000Z${extension}`, FILE, 'manifest.json'].sort(),
    );
    expect(bookingsInFile(setup)).toBe(counts[1]);
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

describe('the Odoo target through the export', () => {
  it('Odoo is the default target: the export writes ODOO_Buchungen_20260901-20260930_BSP.csv and nothing else', async () => {
    const setup = exportSetup();
    const outcome = await runWith(setup, {}, DEFAULT_TARGET);
    expect(outcome.status).toBe('written');
    expect(readdirSync(folderOf(setup)).sort()).toEqual(['ODOO_Buchungen_20260901-20260930_BSP.csv', 'ODOO_Buchungen_20260901-20260930_BSP.protokoll.txt', 'manifest.json']);
    expect(DEFAULT_TARGET).toBe(odooTarget);
  });

  it('reports the Odoo validation findings of a file it cannot write, and writes nothing', async () => {
    const setup = exportSetup({ files: { 'mapping-BSP.csv': BEISPIEL_MAPPING_TEXT.replaceAll(';2890;', ';28-90;') } });
    const outcome = await runWith(setup, {}, DEFAULT_TARGET);
    expect(outcome.status).toBe('failed');
    expect(new Set(errorCodes(outcome))).toEqual(new Set(['E-ODOO-ACCOUNT']));
    expect(existsSync(join(setup.ctx.cwd, 'exports'))).toBe(false);
  });

  it('takes the journal of the property and the company of the odoo section for the file, and names both in the manifest and the protocol', async () => {
    const setup = exportSetup();
    const loaded = await loadConfig({ path: join(setup.ctx.cwd, 'apaleo-odoo.config.yaml'), env: setup.ctx.env, readFile: setup.ctx.fs.readFile });
    const config = { ...loaded.config, odoo: { ...loaded.config.odoo, companyId: 3 }, properties: [{ id: BSP, journal: 'APB' }] };
    expect(settingsFromConfig({ config, propertyId: BSP })).toMatchObject({ companyId: 3, journal: 'APB', currency: 'EUR', taxRounding: 'per_line' });
    const outcome = await runWith(setup, {}, createOdooTarget(() => settingsFromConfig({ config, propertyId: BSP })));
    expect(outcome.status).toBe('written');
    expect(readFileSync(join(folderOf(setup), 'ODOO_Buchungen_20260901-20260930_BSP.csv'), 'utf8')).toContain('apaleo_c3_BSP_20260914,apaleo BSP 2026-09-14,2026-09-14,APB,');
    const manifest = JSON.parse(readFileSync(join(folderOf(setup), 'manifest.json'), 'utf8'));
    expect(manifest.files[0]).toMatchObject({ odooCompanyId: 3, odooJournal: 'APB' });
    expect(readFileSync(join(folderOf(setup), 'ODOO_Buchungen_20260901-20260930_BSP.protokoll.txt'), 'utf8')).toContain('Company: id 3 (odoo.companyId, the company that owns the taxes), journal APB');
  });

  it('writes only the fields of manifestFields into the manifest: no Odoo company for another target', async () => {
    const setup = exportSetup();
    expect((await runWith(setup, {}, fakeTarget)).status).toBe('written');
    const [entry] = JSON.parse(readFileSync(join(folderOf(setup), 'manifest.json'), 'utf8')).files;
    expect(entry).not.toHaveProperty('odooCompanyId');
    expect(entry).not.toHaveProperty('entries');
    const tagged = exportSetup();
    expect((await runWith(tagged, {}, { ...fakeTarget, manifestFields: () => ({ odooJournal: 'X' }) })).status).toBe('written');
    expect(JSON.parse(readFileSync(join(folderOf(tagged), 'manifest.json'), 'utf8')).files[0]).toMatchObject({ odooJournal: 'X' });
  });
});

/** The fixture config with property BSP and the given Odoo company currency. */
const exportConfigWith = (currency: string) => `${FIXTURE_FILES['apaleo-odoo.config.yaml']}  currency: ${currency}\nproperties:\n  - id: BSP\n`;

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

  it('asks the target for its currency: the Odoo target books in odoo.currency', async () => {
    const { ctx } = exportSetup();
    const { config } = await loadConfig({ path: join(ctx.cwd, 'apaleo-odoo.config.yaml'), env: ctx.env, readFile: ctx.fs.readFile });
    expect(DEFAULT_TARGET.currency(config)).toBe('EUR');
    expect(DEFAULT_TARGET.currency({ ...config, odoo: { ...config.odoo, currency: 'CHF' } })).toBe('CHF');
  });

  it('Swiss property in a EUR company: refuses a CHF property before reading its ledger, naming CHF and EUR and the company currency', async () => {
    const setup = swissSetup();
    const outcome = await runWith(setup, {}, DEFAULT_TARGET);
    expect(outcome.status).toBe('failed');
    expect(outcome.findings.map((f) => [f.code, f.value])).toEqual([['E-CURRENCY', 'CHF']]);
    expect(outcome.findings[0]?.message).toContain('keeps its books in CHF, but the export file books in EUR only');
    expect(outcome.findings[0]?.message).toContain('An Odoo company books its journal entries in one currency (odoo.currency)');
    expect(outcome.findings[0]?.message).toContain('This tool does not convert');
    expect(setup.fake.calls.some((call) => call.startsWith('getLedger'))).toBe(false);
    expect(existsSync(join(setup.ctx.cwd, 'exports'))).toBe(false);
  });

  it('Swiss company: writes the file of a target that books in CHF, and the default target with odoo.currency CHF', async () => {
    const setup = swissSetup();
    const outcome = await runWith(setup, {}, chfTarget);
    expect(outcome.findings.map((f) => f.code)).not.toContain('E-CURRENCY');
    expect(outcome.status).toBe('written');
    expect(readdirSync(folderOf(setup))).toContain('FAKE_20260901-20260930_BSP.txt');
    const chf = swissSetup();
    await chf.ctx.fs.writeFile(join(chf.ctx.cwd, 'apaleo-odoo.config.yaml'), exportConfigWith('CHF'));
    const standard = await runWith(chf, {}, DEFAULT_TARGET);
    expect(standard.status).toBe('written');
    expect(readFileSync(join(folderOf(chf), 'ODOO_Buchungen_20260901-20260930_BSP.protokoll.txt'), 'utf8')).toContain('journal APA, currency CHF');
  });

  it('Line in another currency: refuses a month with one EUR line under the CHF target, naming the count and both currencies', async () => {
    const setup = swissSetup(1);
    const outcome = await runWith(setup, {}, chfTarget);
    expect(outcome.status).toBe('failed');
    expect(outcome.findings.map((f) => [f.code, f.value])).toEqual([['E-CURRENCY', 'EUR']]);
    expect(outcome.findings[0]?.message).toContain('1 apaleo line(s) of BSP are in EUR, but the export file books in CHF only. FAKE files are in CHF. This tool does not convert.');
    expect(outcome.findings[0]?.message).not.toMatch(/\bOdoo\b|odoo\./);
    expect(existsSync(join(setup.ctx.cwd, 'exports'))).toBe(false);
  });

  it('German property: no E-CURRENCY for a EUR property and ledger in a EUR company, and the Odoo file is written', async () => {
    const outcome = await runWith(exportSetup(), {}, DEFAULT_TARGET);
    expect(outcome.findings.map((f) => f.code)).not.toContain('E-CURRENCY');
    expect(outcome.status).toBe('written');
  });
});

describe('the checks and the summary do not depend on the target (recorded VIE day 2026-10-21)', () => {
  const MAPPING = VIE_MAPPING;
  const CONFIG = `${FIXTURE_FILES['apaleo-odoo.config.yaml']}properties:\n  - id: VIE\nchecks:\n  aggregates: true\n`;

  async function exportVie(target: TargetWriter<PostedBooking> | undefined) {
    const ctx = createApaleoContext(
      { live: true },
      { files: { 'apaleo-odoo.config.yaml': CONFIG, 'mapping-VIE.csv': MAPPING }, now: new Date('2026-10-25T08:00:00Z') },
    );
    const { source } = createFixtureSource({ live: true }, {}, ctx);
    const loaded = await loadConfig({ path: join(ctx.cwd, 'apaleo-odoo.config.yaml'), env: ctx.env, readFile: ctx.fs.readFile });
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
    // Only the import block and the file figures (Odoo's VAT per tax, the counts of the file) belong to the target.
    const withoutTarget = (summary: string) =>
      summary
        .replace(/^Odoo's VAT per tax and rate[^]*?\n\n/m, '')
        .replace(/^Entries in the file: .*\n\n/m, '')
        .replace(/\n(FAKE import|Import into Odoo)[^]*$/, '\n');
    expect(withoutTarget(fake.summary)).toBe(withoutTarget(standard.summary));
    expect(fake.summary).not.toMatch(/^Odoo's VAT per tax and rate/m);
    expect(standard.summary).toContain('  account_tax_template_sales_10_code029 10 %: net 77.45, Odoo VAT 7.75, apaleo per line 7.74, apaleo precise 7.75 (7.74545454), difference (Odoo minus apaleo) 0.01\n    2026-10-21: Odoo VAT 7.75');
    expect(fake.summary).toContain('FAKE import:\n  29 lines\n');
    expect(standard.summary).toContain('  Entries: 1 draft journal entries (one per business day)');
    expect(fake.findings).toEqual(standard.findings);
    expect(withoutAustrianTaxes(fake.findings).map((f) => f.code)).toEqual([]);
    expect(fake.findings.map((f) => f.value).sort()).toEqual(['account_tax_template_sales_10_code029', 'account_tax_template_sales_13_code006', 'account_tax_template_sales_20_code022']);
    expect(fake.summary).toContain('Deposits (Anzahlungen) received, released and refunded:\n  received        491.00\n  released        295.00\n  of it refunded   10.00\n');
  });
});

describe('the target boundary in src/export', () => {
  const dir = fileURLToPath(new URL('../../src/export/', import.meta.url));
  const sources = readdirSync(dir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => [name, readFileSync(join(dir, name), 'utf8')] as const);

  it.each(sources)('%s imports a target module only through its TargetWriter', (_name, text) => {
    const targetImports = [...text.matchAll(/from '\.\.\/(?:abacus|odoo)\/([^']+)'/g)].map((match) => match[1]);
    expect(targetImports.every((module) => module === 'target.js')).toBe(true);
  });

  it('keeps target file names, formats and import advice out of the output folder logic', () => {
    const output = sources.find(([name]) => name === 'output.ts')?.[1] ?? '';
    expect(output).not.toMatch(/EXTF|Buchungsstapel|\.csv|\.xml|XML Buchungen/);
    expect(output).not.toMatch(/DATEV|datev\.[a-z]|\bBMD\b|bmd\.[a-z]|Festschreibung|\bAbacus\b|abacus\.[a-z]|Nebenjournal|\bOdoo\b|odoo\.[a-z]|ODOO_/);
    expect(output).not.toContain('../abacus');
    expect(output).not.toContain('../odoo');
  });

  it('keeps target field names, currencies and config keys out of the checks', () => {
    const checks = sources.find(([name]) => name === 'checks.ts')?.[1] ?? '';
    expect(checks).not.toMatch(/collectiveAccount|singleAccount|debitCredit|konto|steuer|\bCHF\b|\bEUR\b|abacus\.|\bBMD\b|\bAbacus\b|\bOdoo\b|odoo\.[a-z]|account\.\d/);
  });
});
