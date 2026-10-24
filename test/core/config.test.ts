import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ConfigNotFoundError,
  ENV_OVERRIDES,
  loadConfig,
  resolveConfigPath,
  type Env,
} from '../../src/core/config.js';
import { UserError } from '../../src/core/errors.js';
import { runCli } from '../../src/cli/run.js';
import { EXIT_OK, type Command } from '../../src/cli/command.js';
import { createTestContext } from '../helpers/context.js';

/** The smallest valid config: the required odoo section. */
const VALID = 'odoo:\n  journal: APA\n  version: 18\n';
const ODOO_DEFAULTS = { journal: 'APA', version: 18, companyId: 1, currency: 'EUR', taxRounding: 'per_line' };
const APALEO_DEFAULTS = { baseUrl: 'https://api.apaleo.com', identityUrl: 'https://identity.apaleo.com' };

async function load(content: string, env: Env = {}, fileName = 'apaleo-odoo.config.yaml') {
  const ctx = createTestContext({ files: { [fileName]: content }, env });
  return loadConfig({ path: join(ctx.cwd, fileName), env: ctx.env, readFile: ctx.fs.readFile });
}

async function loadError(content: string, env: Env = {}, fileName?: string): Promise<UserError> {
  const error = await load(content, env, fileName).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(UserError);
  return error as UserError;
}

describe('config path resolution', () => {
  it('prefers --config, then APALEO_ODOO_CONFIG, then the default file', () => {
    const env = { APALEO_ODOO_CONFIG: 'from-env.yaml' };
    expect(resolveConfigPath('flag.yaml', env, '/work')).toBe(resolve('/work/flag.yaml'));
    expect(resolveConfigPath(undefined, env, '/work')).toBe(resolve('/work/from-env.yaml'));
    expect(resolveConfigPath(undefined, {}, '/work')).toBe(resolve('/work/apaleo-odoo.config.yaml'));
    expect(resolveConfigPath('/abs/c.json', env, '/work')).toBe('/abs/c.json');
    for (const old of ['APALEO_ABACUS_CONFIG', 'APALEO_BMD_CONFIG', 'APALEO_DATEV_CONFIG']) {
      expect(resolveConfigPath(undefined, { [old]: 'old.yaml' }, '/work'), old).toBe(resolve('/work/apaleo-odoo.config.yaml'));
    }
  });
});

describe('loading', () => {
  it('loads YAML and fills defaults', async () => {
    const { config, secrets } = await load(VALID);
    expect(config).toEqual({
      apaleo: APALEO_DEFAULTS,
      output: { dir: './exports' },
      odoo: ODOO_DEFAULTS,
      posting: { text2: 'receipt' },
      properties: [],
      checks: { aggregates: false },
      schedule: { timezone: 'Europe/Zurich', cadence: 'monthly', daily: { offsetDays: 2 }, monthly: { dayOfMonth: 3 }, finalAfter: '06:00', catchUpDays: 40 },
    });
    expect(secrets.apaleoClientSecret).toBeUndefined();
  });

  it('Odoo section missing: names odoo.journal and odoo.version as required and points to docs/configuration.md', async () => {
    const error = await loadError('output:\n  dir: ./x\n');
    expect(error.message).toContain('odoo.journal: is required');
    expect(error.message).toContain('odoo.version: is required');
    expect(error.message).toContain('docs/configuration.md');
    expect(error.message).not.toContain('abacus');
  });

  it.each([
    ['abacus:\n  mandant: 1234\n', 'abacus'],
    ['abacus:\n  leitwaehrung: CHF\n', 'abacus'],
    ['abacus:\n  mandant: 1234\n  leitwaehrung: USD\n', 'abacus'],
    ['abacus:\n  mandant: 1234\n  mwstCodes:\n    normal: 011\n', 'abacus'],
    ['bmd:\n  buchsymbol: HO\n', 'bmd'],
    ['datev:\n  beraternummer: 1234567\n  mandantennummer: 42\n', 'datev'],
  ])('Old Abacus, BMD or DATEV section: rejects %j, saying the section is not one of apaleo-odoo and naming odoo', async (text, section) => {
    for (const file of [text, `${VALID}${text}`]) {
      const error = await loadError(file);
      expect(error.message).toContain(`${section} is not a section of apaleo-odoo`);
      expect(error.message).toContain('odoo section');
      expect(error.message).toContain('odoo.journal');
      expect(error.message).not.toMatch(/unknown key|is required|is read as the number|must be/);
    }
  });

  it('Old Abacus section: an abacus section with all its keys commented out counts as missing and loads', async () => {
    const { config } = await load(`${VALID}abacus:\n  # mandant: 1234\n`);
    expect(config).not.toHaveProperty('abacus');
    expect(config.odoo).toEqual(ODOO_DEFAULTS);
  });

  it('reads checks.aggregates and refuses the Buchungssymbol keys of the BMD tool on a property', async () => {
    const { config } = await load(`${VALID}properties:\n  - id: BSP\nchecks:\n  aggregates: true\n`);
    expect(config.checks).toEqual({ aggregates: true });
    const error = await loadError(`${VALID}properties:\n  - id: BSP\n    buchsymbol: HO2\n    mandantennummer: 43\nchecks:\n  aggregates: yes please\n`);
    expect(error.message).toContain('properties.0.buchsymbol: unknown key');
    expect(error.message).toContain('properties.0.mandantennummer: unknown key');
    expect(error.message).toContain('checks.aggregates: must be true or false');
  });

  it('reads posting.text2 and rejects other values and the old extbelegnr and belegfeld1', async () => {
    const { config } = await load(`${VALID}posting:\n  text2: reference\n`);
    expect(config.posting).toEqual({ text2: 'reference' });
    await expect(load(`${VALID}posting:\n  text2: invoice\n`)).rejects.toThrow('posting.text2: must be "receipt" or "reference" (got "invoice")');
    await expect(load(`${VALID}posting:\n  extbelegnr: receipt\n`)).rejects.toThrow('posting.extbelegnr: unknown key');
    await expect(load(`${VALID}posting:\n  belegfeld1: receipt\n`)).rejects.toThrow('posting.belegfeld1: unknown key');
  });

  it('loads JSON by extension', async () => {
    const json = JSON.stringify({ odoo: { journal: 'APA', version: 19, roundingAccount: '2700' } });
    const { config } = await load(json, {}, 'config.json');
    expect(config.odoo).toMatchObject({ version: 19, taxRounding: 'per_tax', roundingAccount: '2700' });
  });

  it('reads the client secret from the environment only', async () => {
    const { secrets } = await load(VALID, { APALEO_CLIENT_SECRET: 'abc' });
    expect(secrets.apaleoClientSecret).toBe('abc');
  });

  const example = readFileSync(new URL('../../apaleo-odoo.config.example.yaml', import.meta.url), 'utf8');

  it('accepts the example config, whose odoo section holds journal APA, Odoo 18 and the defaults, and which has no abacus section', async () => {
    expect(example).toMatch(/^odoo:\n/m);
    expect(example).not.toMatch(/^(bmd|abacus):/m);
    const { config } = await load(example, { APALEO_CLIENT_ID: 'client-1' });
    expect(config.output.dir).toBe('./exports');
    expect(config.apaleo.clientId).toBe('client-1');
    expect(config.odoo).toEqual(ODOO_DEFAULTS);
    expect(config).not.toHaveProperty('abacus');
    expect(config.posting).toEqual({ text2: 'receipt' });
    expect(config.checks).toEqual({ aggregates: false });
    expect(config.schedule).toEqual({ timezone: 'Europe/Zurich', cadence: 'monthly', daily: { offsetDays: 2 }, monthly: { dayOfMonth: 3 }, finalAfter: '06:00', catchUpDays: 40 });
  });

  it('treats a section whose keys are all commented out as missing, with or without env overrides', async () => {
    const file = `apaleo:\n  # clientId: abc\noutput:\n  # dir: ./x\n${VALID}`;
    const { config } = await load(file);
    expect(config.apaleo).toEqual(APALEO_DEFAULTS);
    expect(config.output.dir).toBe('./exports');
    const withEnv = await load(file, { APALEO_CLIENT_ID: 'client-1' });
    expect(withEnv.config.apaleo.clientId).toBe('client-1');
  });

  it('Empty section or value: an empty odoo.journal, or an odoo section with every key commented out, is reported as required', async () => {
    const error = await loadError('odoo:\n  journal:\n  version: 18\n');
    expect(error.message).toContain('odoo.journal: is required');
    expect(await loadError('odoo:\n  # journal: APA\n').then((e) => e.message)).toContain('odoo.version: is required');
    expect(await loadError('odoo:\n  journal:\n  version: 18\n', { APALEO_CLIENT_ID: 'x' }).then((e) => e.message)).toContain('odoo.journal: is required');
  });
});

describe('apaleo section', () => {
  it('accepts scopes and other API hosts, without a trailing slash', async () => {
    const file = `apaleo:\n  clientId: abc\n  scopes: "accounting.read"\n  baseUrl: https://api.example.test/\n  identityUrl: http://localhost:8080\n${VALID}`;
    const { config } = await load(file);
    expect(config.apaleo).toEqual({
      clientId: 'abc',
      scopes: 'accounting.read',
      baseUrl: 'https://api.example.test',
      identityUrl: 'http://localhost:8080',
    });
  });

  it('rejects a base URL that is not https', async () => {
    const error = await loadError(`apaleo:\n  baseUrl: ftp://api.apaleo.com\n${VALID}`);
    expect(error.message).toContain(
      'apaleo.baseUrl: must be an https URL (plain http only for localhost, 127.0.0.1 or [::1]) (got "ftp://api.apaleo.com")',
    );
  });

  it.each(['baseUrl: http://api.apaleo.com', 'identityUrl: http://identity.apaleo.com', 'baseUrl: http://localhost.evil.test'])(
    'rejects plain http for a host that is not this machine (%s)',
    async (line) => {
      const error = await loadError(`apaleo:\n  ${line}\n${VALID}`);
      expect(error.message).toMatch(/apaleo\.(baseUrl|identityUrl): must be an https URL/);
    },
  );

  it('accepts plain http for 127.0.0.1 and [::1]', async () => {
    const { config } = await load(`apaleo:\n  baseUrl: http://127.0.0.1:4010\n  identityUrl: "http://[::1]:4011/"\n${VALID}`);
    expect(config.apaleo.baseUrl).toBe('http://127.0.0.1:4010');
    expect(config.apaleo.identityUrl).toBe('http://[::1]:4011');
  });
});

describe('validation errors name the key path', () => {
  it('Invalid config value: odoo.companyId 0 names the key and the allowed range', async () => {
    const error = await loadError(`${VALID}  companyId: 0\n`);
    expect(error.message).toContain('odoo.companyId: must be a whole number between 1 and 999999 (got 0)');
  });

  it('reports missing required keys', async () => {
    const error = await loadError('output:\n  dir: ./x\n');
    expect(error.message).toContain('odoo.journal: is required');
  });

  it('reports unknown keys with their path', async () => {
    const error = await loadError(`${VALID}  jorunal: X\nfoo: 1\n`);
    expect(error.message).toContain('odoo.jorunal: unknown key');
    expect(error.message).toContain('foo: unknown key');
  });

  it('reports YAML syntax errors with the file path', async () => {
    const error = await loadError('odoo: [unclosed\n');
    expect(error.message).toMatch(/Cannot parse config file .*apaleo-odoo\.config\.yaml: line \d+, column \d+: /);
  });

  it('does not quote neighbouring lines, such as a secret, in a YAML syntax error', async () => {
    const error = await loadError(`${VALID}apaleo:\n  clientId: "unclosed\nclientSecret: SUPERSECRET\n`);
    expect(error.message).toMatch(/line \d+, column \d+: missing closing quote or bracket\.$/);
    expect(error.message).not.toContain('SUPERSECRET');
    expect(error.message).not.toContain('unclosed');
    expect(error.message).not.toContain('^');
  });

  it.each([
    ['{"apaleo": {"clientId": "a", "clientSecret": SUPERSECRET}}', /: invalid JSON\.$/],
    ['{"apaleo": {"clientSecret": "SUPERSECRET"', /line 1, column \d+: invalid JSON\.$/],
  ])('does not quote the source in a JSON syntax error: %s', async (json, pattern) => {
    const error = await loadError(json, {}, 'config.json');
    expect(error.message).toMatch(pattern);
    expect(error.message).not.toContain('SUPERSECRET');
  });

  it('rejects a top level that is not key/value settings', async () => {
    const error = await loadError('- a\n- b\n');
    expect(error.message).toContain('must contain key/value settings');
  });
});

describe('odoo section', () => {
  const odoo = (lines: string) => `odoo:\n${lines}`;

  it('is required: Odoo is the default target', async () => {
    expect((await loadError('posting:\n  text2: receipt\n')).message).toContain('odoo.journal: is required: name the code of the Odoo journal');
  });

  it('Odoo defaults: only journal APA and version 17 give company 1, EUR and per_line', async () => {
    const { config } = await load(odoo('  journal: APA\n  version: 17\n'));
    expect(config.odoo).toEqual({ journal: 'APA', version: 17, companyId: 1, currency: 'EUR', taxRounding: 'per_line' });
    expect((await load(odoo('  journal: APA\n  version: "18"\n'))).config.odoo?.taxRounding).toBe('per_line');
  });

  it('Version 19 rounds per tax: journal APA, version 19 and roundingAccount "2700" give per_tax', async () => {
    const { config } = await load(odoo('  journal: APA\n  version: 19\n  roundingAccount: "2700"\n'));
    expect(config.odoo).toMatchObject({ taxRounding: 'per_tax', roundingAccount: '2700' });
    // An upgraded database keeps its rounding method: per_line can be set for 19, and per_tax for 17.
    expect((await load(odoo('  journal: APA\n  version: 19\n  taxRounding: per_line\n'))).config.odoo?.taxRounding).toBe('per_line');
    expect((await load(odoo('  journal: APA\n  version: 17\n  taxRounding: per_tax\n  roundingAccount: 2700\n'))).config.odoo).toMatchObject({ taxRounding: 'per_tax', roundingAccount: '2700' });
  });

  it('Rounding account missing: names odoo.roundingAccount, says it is required with taxRounding: per_tax and points to docs/configuration.md', async () => {
    const error = await loadError(odoo('  journal: APA\n  version: 19\n'));
    expect(error.message).toContain('odoo.roundingAccount: is required');
    expect(error.message).toContain('required with taxRounding: per_tax');
    expect(error.message).toContain('docs/configuration.md');
    expect((await loadError(odoo('  journal: APA\n  version: 18\n  taxRounding: per_tax\n'))).message).toContain('odoo.roundingAccount: is required');
  });

  it('Journal code too long: APALEO names odoo.journal and the limit of 5 characters', async () => {
    const error = await loadError(odoo('  journal: APALEO\n  version: 18\n'));
    expect(error.message).toContain('odoo.journal: must be the code of the Odoo journal: 1 to 5 characters of A-Z and 0-9 (Odoo allows at most 5 characters)');
  });

  it('Unsupported version: 16 names odoo.version and the allowed values 17, 18 and 19', async () => {
    const error = await loadError(odoo('  journal: APA\n  version: 16\n'));
    expect(error.message).toContain('odoo.version: must be 17, 18 or 19');
  });

  it('Invalid currency: USD names odoo.currency and the allowed values EUR and CHF', async () => {
    const error = await loadError(odoo('  journal: APA\n  version: 18\n  currency: USD\n'));
    expect(error.message).toContain('odoo.currency: must be "EUR" or "CHF"');
  });

  it('names journal and version when they are missing, and rejects other wrong values', async () => {
    const missing = await loadError(odoo('  companyId: 2\n'));
    expect(missing.message).toContain('odoo.journal: is required: name the code of the Odoo journal');
    expect(missing.message).toContain('odoo.version: is required: name the Odoo version of the database: 17, 18 or 19');
    const wrong = await loadError(odoo('  journal: APA\n  version: 18\n  companyId: 0\n  taxRounding: globally\n  roundingAccount: "27 00"\n  analytic: 1\n'));
    expect(wrong.message).toContain('odoo.companyId: must be a whole number between 1 and 999999');
    expect(wrong.message).toContain('odoo.taxRounding: must be "per_line" or "per_tax"');
    expect(wrong.message).toContain('odoo.roundingAccount: must be an Odoo account code');
    expect(wrong.message).toContain('odoo.analytic: unknown key');
  });

  it('reads codes written as numbers as text, refuses rewritten ones, and lets each property set its journal', async () => {
    const { config } = await load(`odoo:\n  journal: 100\n  version: 18\n  companyId: 3\n  currency: CHF\nproperties:\n  - id: BSP\n  - id: BS2\n    journal: APA2\n`);
    expect(config.odoo).toEqual({ journal: '100', version: 18, companyId: 3, currency: 'CHF', taxRounding: 'per_line' });
    expect(config.properties).toEqual([{ id: 'BSP' }, { id: 'BS2', journal: 'APA2' }]);
    const error = await loadError(`odoo:\n  journal: 011\n  version: 17\n  taxRounding: per_tax\n  roundingAccount: 0x10\nproperties:\n  - id: BSP\n    journal: 1e2\n`);
    expect(error.message).toContain('odoo.journal: 011 is read as the number 11');
    expect(error.message).toContain('odoo.roundingAccount: 0x10 is read as the number 16');
    expect(error.message).toContain('properties.0.journal: 1e2 is read as the number 100');
    expect((await loadError(`odoo:\n  journal: APA\n  version: 17\nproperties:\n  - id: BSP\n    journal: apa\n`)).message).toContain('properties.0.journal: must be the code of the Odoo journal');
  });

  it('the odoo block of the example config loads on its own', async () => {
    const example = readFileSync(new URL('../../apaleo-odoo.config.example.yaml', import.meta.url), 'utf8');
    const lines = example.split('\n');
    const start = lines.indexOf('odoo:');
    expect(start).toBeGreaterThan(0);
    const end = lines.findIndex((line, i) => i > start && /^\S/.test(line));
    const { config } = await load(`${lines.slice(start, end).join('\n')}\n`);
    expect(config.odoo).toEqual(ODOO_DEFAULTS);
  });
});

describe('properties section', () => {
  it('reads properties with an optional mapping path', async () => {
    const { config } = await load(`${VALID}properties:\n  - id: BSP\n    mapping: ./maps/bsp.csv\n  - id: HBW\n`);
    expect(config.properties).toEqual([{ id: 'BSP', mapping: './maps/bsp.csv' }, { id: 'HBW' }]);
  });

  it('names the key path of an invalid entry', async () => {
    const error = await loadError(`${VALID}properties:\n  - id: BSP\n    mapping: ""\n  - mappin: x\n`);
    expect(error.message).toContain('properties.0.mapping: must not be empty');
    expect(error.message).toContain('properties.1.id: is required');
    expect(error.message).toContain('properties.1.mappin: unknown key');
  });

  it('refuses the Abacus Mandant and Geschäftsbereich of a property as unknown keys', async () => {
    const error = await loadError(`${VALID}properties:\n  - id: BSP\n    mandant: "4711"\n    geschaeftsbereich: 2\n`);
    expect(error.message).toContain('properties.0.mandant: unknown key');
    expect(error.message).toContain('properties.0.geschaeftsbereich: unknown key');
  });

  it('rejects a property id listed twice', async () => {
    const error = await loadError(`${VALID}properties:\n  - id: BSP\n  - id: BSP\n`);
    expect(error.message).toContain('properties: must not list a property id twice');
  });
});

describe('schedule section', () => {
  it('reads a daily schedule', async () => {
    const { config } = await load(`${VALID}schedule:\n  timezone: Europe/Berlin\n  cadence: daily\n  daily:\n    offsetDays: 3\n  catchUpDays: 10\n`);
    expect(config.schedule).toEqual({ timezone: 'Europe/Berlin', cadence: 'daily', daily: { offsetDays: 3 }, monthly: { dayOfMonth: 3 }, finalAfter: '06:00', catchUpDays: 10 });
  });

  it('names schedule.daily.offsetDays and the range 1 to 3 for offsetDays 0', async () => {
    const error = await loadError(`${VALID}schedule:\n  cadence: daily\n  daily:\n    offsetDays: 0\n`);
    expect(error.message).toContain('schedule.daily.offsetDays: must be a whole number between 1 and 3 (got 0)');
  });

  it('limits monthly.dayOfMonth to 1 to 5', async () => {
    const error = await loadError(`${VALID}schedule:\n  monthly:\n    dayOfMonth: 6\n`);
    expect(error.message).toContain('schedule.monthly.dayOfMonth: must be a whole number between 1 and 5 (got 6)');
  });

  it('accepts exactly one cadence, monthly or daily', async () => {
    for (const cadence of ['weekly', '[daily, monthly]']) {
      const error = await loadError(`${VALID}schedule:\n  cadence: ${cadence}\n`);
      expect(error.message).toContain('schedule.cadence: must be "monthly" or "daily"');
    }
  });

  it('refuses a fixed UTC offset or an unknown zone as schedule.timezone', async () => {
    for (const zone of ['"+01:00"', 'Berlin', 'CEST+1']) {
      const error = await loadError(`${VALID}schedule:\n  timezone: ${zone}\n`);
      expect(error.message).toContain('schedule.timezone: must be an IANA time zone name, for example "Europe/Zurich"');
      expect(error.message).not.toContain('Vienna');
    }
  });

  it('refuses a daily catch-up window under 5 days, so a day held back as not yet final is still exported later', async () => {
    for (const offsetDays of [1, 2, 3]) {
      const error = await loadError(`${VALID}schedule:\n  cadence: daily\n  daily:\n    offsetDays: ${offsetDays}\n  catchUpDays: 4\n`);
      expect(error.message).toContain('schedule.catchUpDays: must be at least 5 with cadence daily');
    }
    const { config } = await load(`${VALID}schedule:\n  cadence: daily\n  daily:\n    offsetDays: 1\n  catchUpDays: 5\n`);
    expect(config.schedule.catchUpDays).toBe(5);
  });

  it('refuses a monthly catch-up window under 3 days', async () => {
    const error = await loadError(`${VALID}schedule:\n  catchUpDays: 2\n`);
    expect(error.message).toContain('schedule.catchUpDays: must be at least 3 with cadence monthly');
    const { config } = await load(`${VALID}schedule:\n  catchUpDays: 3\n`);
    expect(config.schedule.catchUpDays).toBe(3);
  });

  it('reads schedule.finalAfter as a quoted local time up to 12:00 and refuses anything else', async () => {
    const { config } = await load(`${VALID}schedule:\n  finalAfter: "04:30"\n`);
    expect(config.schedule.finalAfter).toBe('04:30');
    for (const value of ['"13:00"', '"6:00"', '"24:00"', '6', 'morning']) {
      const error = await loadError(`${VALID}schedule:\n  finalAfter: ${value}\n`);
      expect(error.message).toContain('schedule.finalAfter: must be a local time "HH:MM" between "00:00" and "12:00"');
    }
  });

  it('rejects unknown schedule keys', async () => {
    const error = await loadError(`${VALID}schedule:\n  weekly: {}\n`);
    expect(error.message).toContain('schedule.weekly: unknown key');
  });
});

describe('secrets', () => {
  it('rejects apaleo.clientSecret in the file and points to APALEO_CLIENT_SECRET', async () => {
    const error = await loadError(`apaleo:\n  clientId: abc\n  clientSecret: oops\n${VALID}`);
    expect(error.message).toContain('apaleo.clientSecret must not be stored in the config file');
    expect(error.message).toContain('set APALEO_CLIENT_SECRET in the environment');
    expect(error.message).not.toContain('oops');
  });
});

describe('environment overrides', () => {
  it('APALEO_ODOO_OUTPUT_DIR wins over output.dir in the file', async () => {
    const { config } = await load(`${VALID}output:\n  dir: ./out\n`, { APALEO_ODOO_OUTPUT_DIR: '/data/out' });
    expect(config.output.dir).toBe('/data/out');
  });

  it('applies every allow-listed scalar override', async () => {
    const { config } = await load(VALID, { APALEO_CLIENT_ID: 'client-1', APALEO_ODOO_OUTPUT_DIR: '/data/out', APALEO_ODOO_TIMEZONE: 'Europe/Berlin' });
    expect(config.apaleo.clientId).toBe('client-1');
    expect(config.output.dir).toBe('/data/out');
    expect(config.schedule.timezone).toBe('Europe/Berlin');
  });

  it('no longer reads the DATEV overrides of the Berater- and Mandantennummer', async () => {
    const error = await loadError(VALID, { APALEO_ODOO_BERATERNUMMER: '7654321', APALEO_ODOO_MANDANTENNUMMER: '99' });
    expect(error.message).toContain('APALEO_ODOO_BERATERNUMMER: unknown variable');
    expect(error.message).toContain('APALEO_ODOO_MANDANTENNUMMER: unknown variable');
  });

  it('APALEO_ODOO_TIMEZONE sets schedule.timezone and is validated like the file value', async () => {
    const { config } = await load(VALID, { APALEO_ODOO_TIMEZONE: 'Europe/Berlin' });
    expect(config.schedule.timezone).toBe('Europe/Berlin');
    const error = await loadError(VALID, { APALEO_ODOO_TIMEZONE: 'Mars/Olympus' });
    expect(error.message).toContain('schedule.timezone: must be an IANA time zone name');
    expect(error.message).toContain('from APALEO_ODOO_TIMEZONE');
  });

  it('ignores empty override values', async () => {
    const { config } = await load(VALID, { APALEO_ODOO_OUTPUT_DIR: '' });
    expect(config.output.dir).toBe('./exports');
  });

  it('rejects an unknown APALEO_ODOO_* variable and names it', async () => {
    const error = await loadError(VALID, { APALEO_ODOO_OUTPUTDIR: '/x' });
    expect(error.message).toContain('APALEO_ODOO_OUTPUTDIR: unknown variable');
    expect(error.message).toContain('APALEO_ODOO_OUTPUT_DIR');
  });

  it('rejects an array key set from the environment', async () => {
    const error = await loadError(VALID, { APALEO_ODOO_PROPERTIES: 'BER,MUC' });
    expect(error.message).toContain('APALEO_ODOO_PROPERTIES');
    expect(error.message).toContain('"properties" is an array and can only be set in the config file');
  });

  it('ignores the old APALEO_ABACUS_* names of the Abacus project', async () => {
    const { config } = await load(VALID, { APALEO_ABACUS_CONFIG: '/x/old.yaml', APALEO_ABACUS_OUTPUT_DIR: '/old', APALEO_ABACUS_PROPERTIES: 'BER', APALEO_ABACUS_TIMEZONE: 'nope' });
    expect(config.output.dir).toBe('./exports');
    expect(config.schedule.timezone).not.toBe('nope');
  });

  it('ignores the old APALEO_BMD_* names of the BMD project', async () => {
    const { config } = await load(VALID, { APALEO_BMD_CONFIG: '/x/old.yaml', APALEO_BMD_OUTPUT_DIR: '/old', APALEO_BMD_PROPERTIES: 'BER', APALEO_BMD_TIMEZONE: 'nope' });
    expect(config.output.dir).toBe('./exports');
    expect(config.schedule.timezone).not.toBe('nope');
  });

  it('ignores the old APALEO_DATEV_* names of the DATEV project', async () => {
    const { config } = await load(VALID, { APALEO_DATEV_OUTPUT_DIR: '/old', APALEO_DATEV_PROPERTIES: 'BER', APALEO_DATEV_TIMEZONE: 'nope' });
    expect(config.output.dir).toBe('./exports');
  });

  it('ignores unrelated environment variables', async () => {
    await expect(load(VALID, { PATH: '/usr/bin', APALEO_OTHER: 'x' })).resolves.toBeDefined();
  });

  it('only allow-lists scalar keys', () => {
    expect(ENV_OVERRIDES.map((o) => o.variable)).toEqual([
      'APALEO_ODOO_OUTPUT_DIR',
      'APALEO_CLIENT_ID',
      'APALEO_ODOO_TIMEZONE',
    ]);
  });
});

describe('missing config file', () => {
  it('throws ConfigNotFoundError with the path and how to create the file', async () => {
    const ctx = createTestContext();
    const path = join(ctx.cwd, 'apaleo-odoo.config.yaml');
    const error = await loadConfig({ path, env: {}, readFile: ctx.fs.readFile }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigNotFoundError);
    expect((error as Error).message).toContain(path);
    expect((error as Error).message).toContain('apaleo-odoo.config.example.yaml');
  });

  it('makes a command that needs config exit 1 with the path it looked for', async () => {
    const needsConfig: Command = {
      name: 'needs-config',
      summary: 'Loads the config',
      usage: '',
      options: {},
      async run(_args, ctx) {
        const path = resolveConfigPath(undefined, ctx.env, ctx.cwd);
        await loadConfig({ path, env: ctx.env, readFile: ctx.fs.readFile });
        return EXIT_OK;
      },
    };
    const ctx = createTestContext();
    expect(await runCli(['needs-config'], ctx, [needsConfig])).toBe(1);
    expect(ctx.err()).toContain(`No config file found at ${join(ctx.cwd, 'apaleo-odoo.config.yaml')}`);
    expect(ctx.err()).toContain('--config <path>');
    expect(ctx.err()).not.toMatch(/\n\s+at /);
  });
});
