import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ConfigNotFoundError,
  ENV_OVERRIDES,
  loadConfig,
  resolveConfigPath,
  sharedMandantFindings,
  type Env,
} from '../../src/core/config.js';
import { UserError } from '../../src/core/errors.js';
import { runCli } from '../../src/cli/run.js';
import { EXIT_OK, type Command } from '../../src/cli/command.js';
import { createTestContext } from '../helpers/context.js';

const VALID = 'abacus:\n  mandant: 1234\n';
const ABACUS_DEFAULTS = {
  mandant: '1234',
  leitwaehrung: 'CHF',
  abrechnungsart: 'vereinbart',
  version: '2015.00',
  mwstKonto: '2200',
  mwstHilfskonto: '2202',
  mwstCodes: { normal: '311', reduziert: '312', beherbergung: '313' },
  geschaeftsbereich: 0,
};
const APALEO_DEFAULTS = { baseUrl: 'https://api.apaleo.com', identityUrl: 'https://identity.apaleo.com' };

async function load(content: string, env: Env = {}, fileName = 'apaleo-abacus.config.yaml') {
  const ctx = createTestContext({ files: { [fileName]: content }, env });
  return loadConfig({ path: join(ctx.cwd, fileName), env: ctx.env, readFile: ctx.fs.readFile });
}

async function loadError(content: string, env: Env = {}, fileName?: string): Promise<UserError> {
  const error = await load(content, env, fileName).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(UserError);
  return error as UserError;
}

describe('config path resolution', () => {
  it('prefers --config, then APALEO_ABACUS_CONFIG, then the default file', () => {
    const env = { APALEO_ABACUS_CONFIG: 'from-env.yaml' };
    expect(resolveConfigPath('flag.yaml', env, '/work')).toBe(resolve('/work/flag.yaml'));
    expect(resolveConfigPath(undefined, env, '/work')).toBe(resolve('/work/from-env.yaml'));
    expect(resolveConfigPath(undefined, {}, '/work')).toBe(resolve('/work/apaleo-abacus.config.yaml'));
    expect(resolveConfigPath('/abs/c.json', env, '/work')).toBe('/abs/c.json');
    expect(resolveConfigPath(undefined, { APALEO_BMD_CONFIG: 'old.yaml' }, '/work')).toBe(resolve('/work/apaleo-abacus.config.yaml'));
  });
});

describe('loading', () => {
  it('loads YAML and fills defaults', async () => {
    const { config, secrets } = await load(VALID);
    expect(config).toEqual({
      apaleo: APALEO_DEFAULTS,
      output: { dir: './exports' },
      abacus: ABACUS_DEFAULTS,
      posting: { text2: 'receipt' },
      properties: [],
      checks: { aggregates: false },
      schedule: { timezone: 'Europe/Zurich', cadence: 'monthly', daily: { offsetDays: 2 }, monthly: { dayOfMonth: 3 }, finalAfter: '06:00', catchUpDays: 40 },
    });
    expect(secrets.apaleoClientSecret).toBeUndefined();
  });

  it('Abacus section missing: names abacus.mandant as required and points to docs/configuration.md', async () => {
    const error = await loadError('output:\n  dir: ./x\n');
    expect(error.message).toContain('abacus.mandant: is required');
    expect(error.message).toContain('docs/configuration.md');
  });

  it.each([
    ['bmd:\n  buchsymbol: HO\n', 'bmd'],
    ['datev:\n  beraternummer: 1234567\n  mandantennummer: 42\n', 'datev'],
  ])('Old BMD or DATEV section: rejects %j, saying the section is not one of apaleo-abacus and naming abacus', async (text, section) => {
    for (const file of [text, `${VALID}${text}`]) {
      const error = await loadError(file);
      expect(error.message).toContain(`${section} is not a section of apaleo-abacus`);
      expect(error.message).toContain('abacus section');
      expect(error.message).toContain('abacus.mandant');
    }
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
    const json = JSON.stringify({ abacus: { mandant: '1234', leitwaehrung: 'EUR' } });
    const { config } = await load(json, {}, 'config.json');
    expect(config.abacus.leitwaehrung).toBe('EUR');
  });

  it('reads the client secret from the environment only', async () => {
    const { secrets } = await load(VALID, { APALEO_CLIENT_SECRET: 'abc' });
    expect(secrets.apaleoClientSecret).toBe('abc');
  });

  const example = readFileSync(new URL('../../apaleo-abacus.config.example.yaml', import.meta.url), 'utf8');

  it('accepts the example config, whose abacus section holds the defaults and the example Mandant 1234', async () => {
    expect(example).toMatch(/abacus:\n[\s\S]*mandant: 1234/);
    expect(example).not.toMatch(/^bmd:/m);
    const { config } = await load(example, { APALEO_CLIENT_ID: 'client-1' });
    expect(config.output.dir).toBe('./exports');
    expect(config.apaleo.clientId).toBe('client-1');
    expect(config.abacus).toEqual(ABACUS_DEFAULTS);
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

  it('reports an empty required value as required', async () => {
    const error = await loadError('abacus:\n  mandant:\n  leitwaehrung: CHF\n');
    expect(error.message).toContain('abacus.mandant: is required');
    expect(await loadError('abacus:\n').then((e) => e.message)).toContain('abacus.mandant: is required');
    expect(await loadError('abacus:\n  mandant:\n', { APALEO_CLIENT_ID: 'x' }).then((e) => e.message)).toContain('abacus.mandant: is required');
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
  it('Invalid config value: abacus.geschaeftsbereich -1 names the key and the allowed range', async () => {
    const error = await loadError(`${VALID}  geschaeftsbereich: -1\n`);
    expect(error.message).toContain('abacus.geschaeftsbereich: must be a whole number between 0 and 99999999 (got -1)');
  });

  it('reports missing required keys', async () => {
    const error = await loadError('output:\n  dir: ./x\n');
    expect(error.message).toContain('abacus.mandant: is required');
  });

  it('reports unknown keys with their path', async () => {
    const error = await loadError(`${VALID}  mandnat: 1\nfoo: 1\n`);
    expect(error.message).toContain('abacus.mandnat: unknown key');
    expect(error.message).toContain('foo: unknown key');
  });

  it('reports YAML syntax errors with the file path', async () => {
    const error = await loadError('abacus: [unclosed\n');
    expect(error.message).toMatch(/Cannot parse config file .*apaleo-abacus\.config\.yaml: line \d+, column \d+: /);
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

describe('abacus section', () => {
  it('is required: a section whose keys are all commented out names abacus.mandant', async () => {
    expect((await loadError('abacus:\n  # mandant: 1234\n')).message).toContain('abacus.mandant: is required');
  });

  it('Abacus defaults: only mandant set', async () => {
    const { config } = await load(VALID);
    expect(config.abacus).toEqual(ABACUS_DEFAULTS);
  });

  it('Mandant missing: names abacus.mandant as required and says it is the Mandantennummer in Abacus', async () => {
    const error = await loadError(`abacus:\n  leitwaehrung: CHF\n`);
    expect(error.message).toContain('abacus.mandant: is required');
    expect(error.message).toContain('Mandantennummer of the hotel in Abacus');
  });

  it('Invalid Leitwährung: names abacus.leitwaehrung and the allowed values CHF and EUR', async () => {
    const error = await loadError(`abacus:\n  mandant: 1234\n  leitwaehrung: USD\n`);
    expect(error.message).toContain('abacus.leitwaehrung: must be "CHF" or "EUR"');
    expect(error.message).toContain('(got "USD")');
  });

  it('reads every key, numbers and quoted text alike, and the version written as a YAML number', async () => {
    const { config } = await load(
      `abacus:\n  mandant: "7777"\n  leitwaehrung: EUR\n  abrechnungsart: vereinnahmt\n  version: 2024.00\n` +
        '  mwstKonto: "2200"\n  mwstHilfskonto: 2209\n  mwstCodes:\n    normal: V81\n    reduziert: 312\n    beherbergung: V38\n  geschaeftsbereich: 12\n',
    );
    expect(config.abacus).toEqual({
      mandant: '7777',
      leitwaehrung: 'EUR',
      abrechnungsart: 'vereinnahmt',
      version: '2024.00',
      mwstKonto: '2200',
      mwstHilfskonto: '2209',
      mwstCodes: { normal: 'V81', reduziert: '312', beherbergung: 'V38' },
      geschaeftsbereich: 12,
    });
    expect((await load(`abacus:\n  mandant: 1\n  version: "2020.00"\n`)).config.abacus?.version).toBe('2020.00');
  });

  it.each([
    ['mandant: 1234567', 'abacus.mandant: must be the Mandantennummer in Abacus: 1 to 6 digits'],
    ['mandant: -12', 'abacus.mandant: must be the Mandantennummer in Abacus'],
    ['mandant: 12.5', 'abacus.mandant: must be the Mandantennummer in Abacus'],
    ['abrechnungsart: saldo', 'abacus.abrechnungsart: must be "vereinbart" or "vereinnahmt"'],
    ['version: 2019.00', 'abacus.version: must be an AbaConnect interface version: "2015.00", "2020.00", "2022.00", "2024.00"'],
    ['mwstKonto: 123456789012', 'abacus.mwstKonto: must be an Abacus account number: 1 to 11 digits'],
    ['mwstHilfskonto: "22 02"', 'abacus.mwstHilfskonto: must be an Abacus account number'],
    ['geschaeftsbereich: 100000000', 'abacus.geschaeftsbereich: must be a whole number between 0 and 99999999'],
    ['geschaeftsbereich: -1', 'abacus.geschaeftsbereich: must be a whole number between 0 and 99999999'],
  ])('rejects %s', async (line, message) => {
    const section = line.startsWith('mandant:') ? `  ${line}\n` : `  mandant: 1234\n  ${line}\n`;
    const error = await loadError(`abacus:\n${section}`);
    expect(error.message).toContain(message);
  });

  it('rejects an MWST-Code that is not 1 to 3 characters of A-Z, a-z and 0-9, and an unknown key', async () => {
    const error = await loadError(`abacus:\n  mandant: 1234\n  mwstCodes:\n    normal: "3111"\n    reduziert: "V-2"\n  mwstcode: 311\n`);
    expect(error.message).toContain('abacus.mwstCodes.normal: must be an MWST-Code of the Mandant: 1 to 3 characters of A-Z, a-z and 0-9');
    expect(error.message).toContain('abacus.mwstCodes.reduziert: must be an MWST-Code');
    expect(error.message).toContain('abacus.mwstcode: unknown key');
  });

  it.each([
    ['normal: 011', 'abacus.mwstCodes.normal: 011 is read as the number 11, not as the text "011"; write it in quotes, for example normal: "011"'],
    ['reduziert: 0x1F', 'abacus.mwstCodes.reduziert: 0x1F is read as the number 31, not as the text "0x1F"; write it in quotes, for example reduziert: "0x1F"'],
    ['beherbergung: 1e2', 'abacus.mwstCodes.beherbergung: 1e2 is read as the number 100, not as the text "1e2"'],
  ])('MWST-Code written as a rewritten YAML number: rejects %s with a hint to quote it', async (line, message) => {
    const error = await loadError(`abacus:\n  mandant: 1234\n  mwstCodes:\n    ${line}\n`);
    expect(error.message).toContain(message);
  });

  it('rejects a rewritten number as Mandant or account, also for a property and in JSON, and keeps quoted codes', async () => {
    const yaml = await loadError(`abacus:\n  mandant: 0x4D2\n  mwstKonto: 02200\nproperties:\n  - id: BSP\n    mandant: 1.0e3\n`);
    expect(yaml.message).toContain('abacus.mandant: 0x4D2 is read as the number 1234');
    expect(yaml.message).toContain('abacus.mwstKonto: 02200 is read as the number 2200');
    expect(yaml.message).toContain('properties.0.mandant: 1.0e3 is read as the number 1000');
    const json = await loadError(JSON.stringify({ abacus: { mandant: 1234 } }).replace('1234', '1e2'), {}, 'config.json');
    expect(json.message).toContain('abacus.mandant: 1e2 is read as the number 100, not as the text "1e2"; write it in quotes, for example "mandant": "1e2"');
    const { config } = await load(`abacus:\n  mandant: 1234\n  mwstCodes:\n    normal: "011"\n    reduziert: 312\n`);
    expect(config.abacus?.mwstCodes).toEqual({ normal: '011', reduziert: '312', beherbergung: '313' });
    const other = await load(`abacus:\n  mandant: 1234\n  geschaeftsbereich: 0x0C\n`);
    expect(other.config.abacus?.geschaeftsbereich).toBe(12);
  });

  it('the abacus section of the example config holds the defaults and has no "ß"', async () => {
    const example = readFileSync(new URL('../../apaleo-abacus.config.example.yaml', import.meta.url), 'utf8');
    const lines = example.split('\n');
    const start = lines.indexOf('abacus:');
    const end = lines.findIndex((line, i) => i > start && /^\S/.test(line));
    const block = lines.slice(start, end);
    expect(block.join('\n')).not.toContain('ß');
    const { config } = await load(`${block.join('\n')}\n`);
    expect(config.abacus).toEqual(ABACUS_DEFAULTS);
  });

  it('lets each property override mandant and geschaeftsbereich', async () => {
    const { config } = await load(`abacus:\n  mandant: 1234\nproperties:\n  - id: BSP\n  - id: BS2\n    mandant: 4711\n    geschaeftsbereich: 2\n`);
    expect(config.properties).toEqual([{ id: 'BSP' }, { id: 'BS2', mandant: '4711', geschaeftsbereich: 2 }]);
    const error = await loadError(`abacus:\n  mandant: 1234\nproperties:\n  - id: BSP\n    mandant: 12A\n`);
    expect(error.message).toContain('properties.0.mandant: must be the Mandantennummer in Abacus');
  });
});

describe('Abacus Mandanten of the properties', () => {
  const abacus = {
    mandant: '1234',
    leitwaehrung: 'CHF',
    abrechnungsart: 'vereinbart',
    version: '2015.00',
    mwstKonto: '2200',
    mwstHilfskonto: '2202',
    mwstCodes: { normal: '311', reduziert: '312', beherbergung: '313' },
    geschaeftsbereich: 0,
  } as const;

  it('Two properties share a Mandant: W-MANDANT-SHARED names both, the Belegnummern and the fix', () => {
    const [finding, ...rest] = sharedMandantFindings({ abacus, properties: [{ id: 'BSP' }, { id: 'BS2' }] });
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ code: 'W-MANDANT-SHARED', value: '1234/0' });
    expect(finding?.message).toContain('the properties BSP, BS2 all book into the Abacus Mandant 1234, Geschäftsbereich 0');
    expect(finding?.message).toContain('Belegnummern could repeat');
    expect(finding?.message).toContain('its own Geschäftsbereich (properties[].geschaeftsbereich) or its own Mandant (properties[].mandant)');
  });

  it('does not warn when each property has its own Geschäftsbereich or Mandant', () => {
    const own = (properties: { id: string; mandant?: string; geschaeftsbereich?: number }[]) => sharedMandantFindings({ abacus, properties });
    expect(own([{ id: 'BSP' }, { id: 'BS2', geschaeftsbereich: 2 }])).toEqual([]);
    expect(own([{ id: 'BSP' }, { id: 'BS2', mandant: '4711' }])).toEqual([]);
    expect(own([{ id: 'BSP', geschaeftsbereich: 2 }, { id: 'BS2' }, { id: 'BS3', geschaeftsbereich: 2 }]).map((f) => f.value)).toEqual(['1234/2']);
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
  it('APALEO_ABACUS_OUTPUT_DIR wins over output.dir in the file', async () => {
    const { config } = await load(`${VALID}output:\n  dir: ./out\n`, { APALEO_ABACUS_OUTPUT_DIR: '/data/out' });
    expect(config.output.dir).toBe('/data/out');
  });

  it('applies every allow-listed scalar override', async () => {
    const { config } = await load(VALID, { APALEO_CLIENT_ID: 'client-1', APALEO_ABACUS_OUTPUT_DIR: '/data/out', APALEO_ABACUS_TIMEZONE: 'Europe/Berlin' });
    expect(config.apaleo.clientId).toBe('client-1');
    expect(config.output.dir).toBe('/data/out');
    expect(config.schedule.timezone).toBe('Europe/Berlin');
  });

  it('no longer reads the DATEV overrides of the Berater- and Mandantennummer', async () => {
    const error = await loadError(VALID, { APALEO_ABACUS_BERATERNUMMER: '7654321', APALEO_ABACUS_MANDANTENNUMMER: '99' });
    expect(error.message).toContain('APALEO_ABACUS_BERATERNUMMER: unknown variable');
    expect(error.message).toContain('APALEO_ABACUS_MANDANTENNUMMER: unknown variable');
  });

  it('APALEO_ABACUS_TIMEZONE sets schedule.timezone and is validated like the file value', async () => {
    const { config } = await load(VALID, { APALEO_ABACUS_TIMEZONE: 'Europe/Berlin' });
    expect(config.schedule.timezone).toBe('Europe/Berlin');
    const error = await loadError(VALID, { APALEO_ABACUS_TIMEZONE: 'Mars/Olympus' });
    expect(error.message).toContain('schedule.timezone: must be an IANA time zone name');
    expect(error.message).toContain('from APALEO_ABACUS_TIMEZONE');
  });

  it('ignores empty override values', async () => {
    const { config } = await load(VALID, { APALEO_ABACUS_OUTPUT_DIR: '' });
    expect(config.output.dir).toBe('./exports');
  });

  it('rejects an unknown APALEO_ABACUS_* variable and names it', async () => {
    const error = await loadError(VALID, { APALEO_ABACUS_OUTPUTDIR: '/x' });
    expect(error.message).toContain('APALEO_ABACUS_OUTPUTDIR: unknown variable');
    expect(error.message).toContain('APALEO_ABACUS_OUTPUT_DIR');
  });

  it('rejects an array key set from the environment', async () => {
    const error = await loadError(VALID, { APALEO_ABACUS_PROPERTIES: 'BER,MUC' });
    expect(error.message).toContain('APALEO_ABACUS_PROPERTIES');
    expect(error.message).toContain('"properties" is an array and can only be set in the config file');
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
      'APALEO_ABACUS_OUTPUT_DIR',
      'APALEO_CLIENT_ID',
      'APALEO_ABACUS_TIMEZONE',
    ]);
  });
});

describe('missing config file', () => {
  it('throws ConfigNotFoundError with the path and how to create the file', async () => {
    const ctx = createTestContext();
    const path = join(ctx.cwd, 'apaleo-abacus.config.yaml');
    const error = await loadConfig({ path, env: {}, readFile: ctx.fs.readFile }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigNotFoundError);
    expect((error as Error).message).toContain(path);
    expect((error as Error).message).toContain('apaleo-abacus.config.example.yaml');
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
    expect(ctx.err()).toContain(`No config file found at ${join(ctx.cwd, 'apaleo-abacus.config.yaml')}`);
    expect(ctx.err()).toContain('--config <path>');
    expect(ctx.err()).not.toMatch(/\n\s+at /);
  });
});
