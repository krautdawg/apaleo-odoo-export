import { extname, resolve } from 'node:path';
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type ErrorCode } from 'yaml';
import { z } from 'zod';
import { UserError } from './errors.js';
import type { Finding } from './findings.js';
import { parseClockTime } from './date.js';

export type Env = Readonly<Record<string, string | undefined>>;

export const DEFAULT_CONFIG_FILE = 'apaleo-abacus.config.yaml';
export const EXAMPLE_CONFIG_FILE = 'apaleo-abacus.config.example.yaml';
export const CONFIG_PATH_ENV = 'APALEO_ABACUS_CONFIG';
const ENV_PREFIX = 'APALEO_ABACUS_';

// ---------------------------------------------------------------------------
// Schema. Each section is exported so later slices can extend it, for example
// `abacusSection.extend({ ... })`, and add new sections to `configSections`.
// ---------------------------------------------------------------------------

function wholeNumber(min: number, max: number) {
  const message = `must be a whole number between ${min} and ${max}`;
  return z.number({ error: message }).int(message).min(min, message).max(max, message);
}

const HTTPS_URL_MESSAGE = 'must be an https URL (plain http only for localhost, 127.0.0.1 or [::1])';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * An https URL. The client secret and the access token travel with every call,
 * so plain http is accepted only for a local test server on this machine.
 */
const httpsUrl = (fallback: string) =>
  z
    .url({ protocol: /^https?$/, error: HTTPS_URL_MESSAGE })
    .refine((url) => {
      const { protocol, hostname } = new URL(url);
      return protocol === 'https:' || LOOPBACK_HOSTS.has(hostname);
    }, HTTPS_URL_MESSAGE)
    .transform((url) => url.replace(/\/+$/, ''))
    .default(fallback);

export const apaleoSection = z.strictObject({
  clientId: z.string().min(1, 'must not be empty').optional(),
  /** Space-separated scopes. Custom apps carry their permissions on the client, so this is usually left out. */
  scopes: z.string().trim().min(1, 'must not be empty').optional(),
  baseUrl: httpsUrl('https://api.apaleo.com'),
  identityUrl: httpsUrl('https://identity.apaleo.com'),
});

export const outputSection = z.strictObject({
  dir: z.string().min(1, 'must not be empty').default('./exports'),
});

/**
 * Digits or letters written as YAML numbers (`mandant: 1234`, `mwstKonto: 2200`,
 * `normal: 311`) are read as text, so `pattern` decides alone and a number with
 * a sign, a decimal point or too many digits is refused. A number whose source
 * text is not its decimal form (`011`, `0x1F`, `1e2`) never gets here: the YAML
 * parser would already have lost the digits, so `rejectRewrittenCodes` refuses it
 * at one of the `CODE_KEYS` before the schema runs.
 */
function codeText(pattern: RegExp, message: string) {
  return z.preprocess((value) => (typeof value === 'number' ? String(value) : value), z.string({ error: message }).regex(pattern, message));
}

const MANDANT_MESSAGE = 'must be the Mandantennummer in Abacus: 1 to 6 digits';
const mandant = codeText(/^\d{1,6}$/, MANDANT_MESSAGE);
const ABACUS_ACCOUNT_MESSAGE = 'must be an Abacus account number: 1 to 11 digits';
const abacusAccount = codeText(/^\d{1,11}$/, ABACUS_ACCOUNT_MESSAGE);
const MWST_CODE_MESSAGE = 'must be an MWST-Code of the Mandant: 1 to 3 characters of A-Z, a-z and 0-9';
const mwstCode = codeText(/^[A-Za-z0-9]{1,3}$/, MWST_CODE_MESSAGE);
const geschaeftsbereich = wholeNumber(0, 99_999_999);

export const ABACUS_LEITWAEHRUNGEN = ['CHF', 'EUR'] as const;
export const ABRECHNUNGSARTEN = ['vereinbart', 'vereinnahmt'] as const;
export const ABACUS_VERSIONS = ['2015.00', '2020.00', '2022.00', '2024.00'] as const;

const VERSION_MESSAGE = `must be an AbaConnect interface version: ${ABACUS_VERSIONS.map((v) => `"${v}"`).join(', ')}`;

/** `version: 2015.00` without quotes is the YAML number 2015; it means the text "2015.00". */
const abacusVersion = z.preprocess(
  (value) => (typeof value === 'number' ? value.toFixed(2) : value),
  z.enum(ABACUS_VERSIONS, { error: VERSION_MESSAGE }),
);

/** What the Treuhänder's Abacus Mandant decides about every file (docs/abacus-format.md). */
export const abacusSection = z.strictObject({
  /** The Mandantennummer, written into `Parameter/Mandant` and every `Client`. No default. */
  mandant,
  /** The Mandant's Leitwährung: every property must book in it, the tool does not convert. */
  leitwaehrung: z.enum(ABACUS_LEITWAEHRUNGEN, { error: 'must be "CHF" or "EUR" (the Leitwährung of the Mandant)' }).default('CHF'),
  /** MWST-Abrechnungsart: `UseCode` 0 or 1 and the Collective `TaxAccount`. */
  abrechnungsart: z.enum(ABRECHNUNGSARTEN, { error: 'must be "vereinbart" or "vereinnahmt"' }).default('vereinbart'),
  /** The AbaConnect interface version in `Parameter/Version`. */
  version: abacusVersion.default('2015.00'),
  /** Steuerkonto of the MWST-Codes (KMU sample Mandant: 2200), the Collective `TaxAccount` with `vereinbart`. */
  mwstKonto: abacusAccount.default('2200'),
  /** Hilfskonto of the MWST-Codes (KMU sample Mandant: 2202), the Collective `TaxAccount` with `vereinnahmt`. */
  mwstHilfskonto: abacusAccount.default('2202'),
  /** The MWST-Codes of the Mandant's MWST-Tabelle that the template writes (KMU sample Mandant: 311, 312, 313). */
  mwstCodes: z
    .strictObject({
      normal: mwstCode.default('311'),
      reduziert: mwstCode.default('312'),
      beherbergung: mwstCode.default('313'),
    })
    .prefault({}),
  /** Geschäftsbereich (`Division`), 0 when the Mandant uses none. */
  geschaeftsbereich: geschaeftsbereich.default(0),
});

/** How the posting rules fill Abacus fields. */
export const postingSection = z.strictObject({
  /** `Text2`: the receipt (invoice) number when there is one (default), or always the reservation reference. */
  text2: z.enum(['receipt', 'reference'], { error: 'must be "receipt" or "reference"' }).default('receipt'),
});

export const propertyEntry = z.strictObject({
  /** The apaleo property id, for example `BSP`. */
  id: z.string().trim().min(1, 'must not be empty'),
  /** The mapping CSV, relative to the working directory. Default `./mapping-<id>.csv`. */
  mapping: z.string().trim().min(1, 'must not be empty').optional(),
  /** Overrides `abacus.mandant` for this property's file. */
  mandant: mandant.optional(),
  /** Overrides `abacus.geschaeftsbereich` for this property's file. */
  geschaeftsbereich: geschaeftsbereich.optional(),
});

export const propertiesSection = z
  .array(propertyEntry)
  .refine((list) => new Set(list.map((p) => p.id)).size === list.length, 'must not list a property id twice');

/** Optional plausibility checks of the export. */
export const checksSection = z.strictObject({
  /** Compare the ledger with apaleo's daily aggregates (needs core.subledger_aggregate.create). */
  aggregates: z.boolean({ error: 'must be true or false' }).default(false),
});

const TIME_ZONE_MESSAGE = 'must be an IANA time zone name, for example "Europe/Zurich"';

/** An IANA zone name. Fixed offsets such as `+01:00` are refused: they ignore summer time. */
const ianaTimeZone = z.string({ error: TIME_ZONE_MESSAGE }).refine((value) => {
  if (!/^[A-Za-z]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, TIME_ZONE_MESSAGE);

const FINAL_AFTER_MESSAGE = 'must be a local time "HH:MM" between "00:00" and "12:00", in quotes (the night audit usually ends by then)';

/** The latest `schedule.finalAfter`: with it, every held period stays inside the smallest catch-up window long enough (see below). */
const LATEST_FINAL_AFTER = 12 * 60;

const finalAfterTime = z.string({ error: FINAL_AFTER_MESSAGE }).refine((value) => {
  const minutes = parseClockTime(value);
  return minutes !== undefined && minutes <= LATEST_FINAL_AFTER;
}, FINAL_AFTER_MESSAGE);

/**
 * The smallest `schedule.catchUpDays` per cadence. A period is final two days
 * after its last day, from `finalAfter` (src/export/period.ts), and a run can
 * hold it back as not yet final until four days after its last day: before
 * `finalAfter` in a property time zone up to 26 hours behind `schedule.timezone`.
 * The window must still hold the period then, or it would never be exported.
 * Daily counts the window from the day itself (4 days later plus today: 5),
 * monthly from its due date (at the earliest 2 days after the month: 3).
 */
export const MIN_CATCH_UP_DAYS = { daily: 5, monthly: 3 } as const;

/** When `schedule --once` exports what. One cadence per install, so daily and monthly files never both reach Abacus. */
export const scheduleSection = z
  .strictObject({
    /** "Today" for the due-period computation is the date in this zone. */
    timezone: ianaTimeZone.default('Europe/Zurich'),
    cadence: z.enum(['monthly', 'daily'], { error: 'must be "monthly" or "daily"' }).default('monthly'),
    /** A day is due this many days after it (2 = the day before yesterday). With 1 it waits one more day for the next night audit. */
    daily: z.strictObject({ offsetDays: wholeNumber(1, 3).default(2) }).prefault({}),
    /** A month is due from this day of the following month. With 1 it waits until the 2nd for the next night audit. */
    monthly: z.strictObject({ dayOfMonth: wholeNumber(1, 5).default(3) }).prefault({}),
    /**
     * Local time from which a period that ended the day before yesterday counts as final: the night audit
     * that closes yesterday runs after midnight and can still post to the day before.
     */
    finalAfter: finalAfterTime.default('06:00'),
    /** How far back (in days) a missed period is still exported. */
    catchUpDays: wholeNumber(1, 366).default(40),
  })
  .superRefine((schedule, issue) => {
    const minimum = MIN_CATCH_UP_DAYS[schedule.cadence];
    if (schedule.catchUpDays >= minimum) return;
    issue.addIssue({
      code: 'custom',
      path: ['catchUpDays'],
      message:
        `must be at least ${minimum} with cadence ${schedule.cadence}: a period is final two days after its last day at the earliest ` +
        '(after schedule.finalAfter), and a run that holds it back as not yet final must still find it in the window on the following days',
    });
  });

export const configSections = {
  apaleo: apaleoSection.prefault({}),
  output: outputSection.prefault({}),
  /** Required: `abacus.mandant` has no default, so a missing section reports that key. */
  abacus: abacusSection.prefault({ mandant: undefined }),
  posting: postingSection.prefault({}),
  properties: propertiesSection.default([]),
  checks: checksSection.prefault({}),
  schedule: scheduleSection.prefault({}),
};

export const configSchema = z.strictObject(configSections);

export type Config = z.infer<typeof configSchema>;
export type PostingConfig = z.infer<typeof postingSection>;
export type AbacusConfig = z.infer<typeof abacusSection>;
export type PropertyConfig = z.infer<typeof propertyEntry>;
export type ScheduleConfig = z.infer<typeof scheduleSection>;

/** The Abacus Mandant and Geschäftsbereich a property's file books into: its own, else the `abacus` section's. */
export interface AbacusUnit {
  mandant: string;
  geschaeftsbereich: number;
}

export function abacusUnitOf(abacus: Pick<AbacusConfig, 'mandant' | 'geschaeftsbereich'>, properties: Config['properties'], propertyId: string): AbacusUnit {
  const property = properties.find((p) => p.id === propertyId);
  return { mandant: property?.mandant ?? abacus.mandant, geschaeftsbereich: property?.geschaeftsbereich ?? abacus.geschaeftsbereich };
}

/** The `value` of a `W-MANDANT-SHARED` finding: Mandant and Geschäftsbereich. */
export function abacusUnitKey({ mandant, geschaeftsbereich }: AbacusUnit): string {
  return `${mandant}/${geschaeftsbereich}`;
}

/**
 * `W-MANDANT-SHARED` for each Mandant and Geschäftsbereich that two or more
 * configured properties book into: the Belegnummern of their files start alike
 * (`MMDD` and a counter), so in one Mandant and Geschäftsbereich they could repeat.
 */
export function sharedMandantFindings(config: Pick<Config, 'abacus' | 'properties'>): Finding[] {
  const { abacus } = config;
  const users = new Map<string, { unit: AbacusUnit; ids: string[] }>();
  for (const { id } of config.properties) {
    const unit = abacusUnitOf(abacus, config.properties, id);
    const key = abacusUnitKey(unit);
    users.set(key, { unit, ids: [...(users.get(key)?.ids ?? []), id] });
  }
  return [...users]
    .filter(([, { ids }]) => ids.length > 1)
    .map(([key, { unit, ids }]) => ({
      code: 'W-MANDANT-SHARED',
      message:
        `the properties ${ids.join(', ')} all book into the Abacus Mandant ${unit.mandant}, Geschäftsbereich ${unit.geschaeftsbereich}. ` +
        'Their Belegnummern could repeat there; give each property its own Geschäftsbereich (properties[].geschaeftsbereich) ' +
        'or its own Mandant (properties[].mandant)',
      value: key,
    }));
}

/**
 * `W-ABRECHNUNGSART-VEREINNAHMT` when the Mandant accounts by vereinnahmte Entgelte
 * (a05 design decision 6): Abacus parks the tax of these bookings on the Hilfskonto
 * until a payment is recorded, normally in the Debitorenbuchhaltung, which this tool
 * does not feed. None with `vereinbart`.
 */
export function abrechnungsartFindings(abacus: Pick<AbacusConfig, 'abrechnungsart' | 'mwstHilfskonto'>): Finding[] {
  if (abacus.abrechnungsart !== 'vereinnahmt') return [];
  return [
    {
      code: 'W-ABRECHNUNGSART-VEREINNAHMT',
      message:
        `abacus.abrechnungsart is vereinnahmt: Abacus books the MWST of these bookings to the Hilfskonto ${abacus.mwstHilfskonto} (abacus.mwstHilfskonto) ` +
        'and moves it to the Steuerkonto only when a payment is recorded, normally in the Debitorenbuchhaltung, which this tool does not feed. ' +
        'The file books the MWST on the charge date, while under vereinnahmte Entgelte it arises with the payment (MWSTG Art. 40 Abs. 2), ' +
        'which matters for charges on accounts receivable that are unpaid at period end. Have your Treuhänder correct the Hilfskonto ' +
        `${abacus.mwstHilfskonto} at period end as docs/mapping-guide.md describes, until a test import shows how Abacus treats these bookings`,
      value: abacus.mwstHilfskonto,
    },
  ];
}

// ---------------------------------------------------------------------------
// Environment. Overrides are an explicit allow-list of scalar keys; there is
// no generic mapper. This table is the single source for code and docs.
// ---------------------------------------------------------------------------

export interface EnvOverride {
  readonly variable: string;
  readonly path: readonly string[];
  readonly type: 'string' | 'integer';
}

export const ENV_OVERRIDES: readonly EnvOverride[] = [
  { variable: 'APALEO_ABACUS_OUTPUT_DIR', path: ['output', 'dir'], type: 'string' },
  { variable: 'APALEO_CLIENT_ID', path: ['apaleo', 'clientId'], type: 'string' },
  { variable: 'APALEO_ABACUS_TIMEZONE', path: ['schedule', 'timezone'], type: 'string' },
];

export interface SecretKey {
  readonly variable: string;
  readonly path: readonly string[];
}

/** Secrets come only from the environment; these keys are rejected in the file. */
export const SECRET_KEYS: readonly SecretKey[] = [
  { variable: 'APALEO_CLIENT_SECRET', path: ['apaleo', 'clientSecret'] },
];

/** Top-level array keys. They can only be set in the config file. */
export const ARRAY_KEYS: readonly string[] = ['properties'];

export interface Secrets {
  apaleoClientSecret: string | undefined;
}

export interface LoadedConfig {
  path: string;
  config: Config;
  secrets: Secrets;
}

export class ConfigNotFoundError extends UserError {
  override readonly name: string = 'ConfigNotFoundError';

  constructor(readonly path: string) {
    super(
      `No config file found at ${path}.\n` +
        `Create one by copying ${EXAMPLE_CONFIG_FILE} to ${DEFAULT_CONFIG_FILE} and editing it,\n` +
        `or point to an existing file with --config <path> or ${CONFIG_PATH_ENV}.`,
    );
  }
}

/** `--config`, else `APALEO_ABACUS_CONFIG`, else `./apaleo-abacus.config.yaml`, resolved against `cwd`. */
export function resolveConfigPath(flag: string | undefined, env: Env, cwd: string): string {
  return resolve(cwd, flag || env[CONFIG_PATH_ENV] || DEFAULT_CONFIG_FILE);
}

export interface LoadConfigOptions {
  path: string;
  env: Env;
  readFile: (path: string, encoding: 'utf8') => Promise<string>;
}

export async function loadConfig({ path, env, readFile }: LoadConfigOptions): Promise<LoadedConfig> {
  checkEnvVariables(env);
  const { raw, numberSources } = parseConfigText(await readConfigFile(path, readFile), path);
  rejectSecretsInFile(raw, path);
  rejectForeignSections(raw, path);
  rejectRewrittenCodes(numberSources, path);
  const fromEnv = applyEnvOverrides(raw, env);

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.flatMap((issue) => describeIssue(issue, raw, fromEnv));
    throw new UserError(`Invalid config in ${path}:\n${lines.map((l) => `  - ${l}`).join('\n')}`);
  }
  return {
    path,
    config: result.data,
    secrets: { apaleoClientSecret: env.APALEO_CLIENT_SECRET || undefined },
  };
}

async function readConfigFile(path: string, readFile: LoadConfigOptions['readFile']): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ConfigNotFoundError(path);
    throw new UserError(`Cannot read config file ${path}: ${(error as Error).message}`);
  }
}

/**
 * Dotted key paths (`abacus.mwstCodes.normal`, `properties.0.mandant`) of the
 * numbers in the file whose source text differs from their decimal form, each
 * with that source text: `011` (read as 11), `0x1F` (31), `1e2` (100), `311.0` (311).
 */
type NumberSources = Map<string, string>;

interface ParsedConfigText {
  raw: Record<string, unknown>;
  numberSources: NumberSources;
}

function parseConfigText(text: string, path: string): ParsedConfigText {
  const isJson = extname(path).toLowerCase() === '.json';
  const { value: parsed, numberSources } = isJson ? parseJson(text, path) : parseYamlText(text, path);
  if (parsed === null || parsed === undefined) return { raw: {}, numberSources };
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new UserError(`Config file ${path} must contain key/value settings at the top level.`);
  }
  return { raw: dropNullValues(parsed as Record<string, unknown>), numberSources };
}

/**
 * The keys whose value is a code written as text (Mandantennummer, account,
 * MWST-Code). `011` and `11` are different MWST-Codes in the Mandant's MWST-Tabelle,
 * so a number there is accepted only when its source text is its decimal form.
 */
const CODE_KEYS = [/^abacus\.(mandant|mwstKonto|mwstHilfskonto|mwstCodes\.(normal|reduziert|beherbergung))$/, /^properties\.\d+\.mandant$/];

/** A code written as `011`, `0x1F` or `1e2` without quotes: the parser has already changed its digits, so refuse it and ask for quotes. */
function rejectRewrittenCodes(numberSources: NumberSources, path: string): void {
  const isJson = extname(path).toLowerCase() === '.json';
  const problems = [...numberSources]
    .filter(([key]) => CODE_KEYS.some((pattern) => pattern.test(key)))
    .map(([key, source]) => {
      const name = key.split('.').at(-1) ?? key;
      const quoted = isJson ? `"${name}": "${source}"` : `${name}: "${source}"`;
      return `${key}: ${source} is read as the number ${Number(source)}, not as the text "${source}"; write it in quotes, for example ${quoted}`;
    });
  if (problems.length > 0) {
    throw new UserError(`Invalid config in ${path}:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
}

/** The numbers below `node` whose source text is not their decimal form (see `NumberSources`). */
function yamlNumberSources(node: unknown, keyPath: readonly string[], out: NumberSources): NumberSources {
  if (isMap(node)) {
    for (const pair of node.items) {
      const key = isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
      yamlNumberSources(pair.value, [...keyPath, key], out);
    }
  } else if (isSeq(node)) {
    node.items.forEach((item, index) => yamlNumberSources(item, [...keyPath, String(index)], out));
  } else if (isScalar(node) && typeof node.value === 'number' && node.source !== undefined && node.source !== String(node.value)) {
    out.set(keyPath.join('.'), node.source);
  }
  return out;
}

// Parse errors are reported by position and error kind only. The messages of the
// YAML and JSON parsers quote the surrounding source, which may be a neighbouring
// secret (for example an apaleo.clientSecret that rejectSecretsInFile would reject).

const YAML_ERROR_TEXT: Partial<Record<ErrorCode, string>> = {
  BAD_INDENT: 'bad indentation',
  BAD_DQ_ESCAPE: 'invalid escape sequence in a double-quoted string',
  BAD_SCALAR_START: 'a plain value cannot start with this character',
  BLOCK_AS_IMPLICIT_KEY: 'a nested block cannot be used as a key',
  BLOCK_IN_FLOW: 'block syntax inside [ ] or { }',
  DUPLICATE_KEY: 'duplicate key',
  MISSING_CHAR: 'missing closing quote or bracket',
  MULTILINE_IMPLICIT_KEY: 'a key must fit on one line (missing colon?)',
  MULTIPLE_DOCS: 'the file must contain a single YAML document',
  TAB_AS_INDENT: 'tabs cannot be used for indentation',
  UNEXPECTED_TOKEN: 'unexpected character',
};

function parseYamlText(text: string, path: string): { value: unknown; numberSources: NumberSources } {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { prettyErrors: false, lineCounter });
  const [error] = doc.errors;
  if (error) {
    const { line, col } = lineCounter.linePos(error.pos[0]);
    const what = YAML_ERROR_TEXT[error.code] ?? `invalid YAML (${error.code})`;
    throw new UserError(`Cannot parse config file ${path}: line ${line}, column ${col}: ${what}.`);
  }
  try {
    return { value: doc.toJS(), numberSources: yamlNumberSources(doc.contents, [], new Map()) };
  } catch {
    throw new UserError(`Cannot parse config file ${path}: invalid YAML (aliases or tags).`);
  }
}

function parseJson(text: string, path: string): { value: unknown; numberSources: NumberSources } {
  // The reviver sees each number's source text (`1e2`) but not its key path, so it
  // records the number by its holder object and key; the walk below adds the paths.
  const rewritten = new WeakMap<object, Map<string, string>>();
  function reviver(this: unknown, key: string, value: unknown, context?: { source?: string }): unknown {
    const source = context?.source;
    if (typeof value === 'number' && source !== undefined && source !== String(value) && typeof this === 'object' && this !== null) {
      const keys = rewritten.get(this) ?? new Map<string, string>();
      keys.set(key, source);
      rewritten.set(this, keys);
    }
    return value;
  }
  let value: unknown;
  try {
    value = JSON.parse(text, reviver);
  } catch (error) {
    const message = (error as Error).message;
    const lineCol = /\(line (\d+) column (\d+)\)/.exec(message);
    const position = /at position (\d+)/.exec(message);
    let where = '';
    if (lineCol) where = `line ${lineCol[1]}, column ${lineCol[2]}: `;
    else if (position) where = `${lineAndColumn(text, Number(position[1]))}: `;
    else if (/end of (JSON|data) input/i.test(message)) where = 'end of file: ';
    throw new UserError(`Cannot parse config file ${path}: ${where}invalid JSON.`);
  }
  const numberSources: NumberSources = new Map();
  const walk = (node: unknown, keyPath: readonly string[]) => {
    if (typeof node !== 'object' || node === null) return;
    for (const [key, source] of rewritten.get(node) ?? []) numberSources.set([...keyPath, key].join('.'), source);
    for (const [key, child] of Object.entries(node)) walk(child, [...keyPath, key]);
  };
  walk(value, []);
  return { value, numberSources };
}

function lineAndColumn(text: string, offset: number): string {
  const before = text.slice(0, offset).split('\n');
  return `line ${before.length}, column ${(before.at(-1)?.length ?? 0) + 1}`;
}

/**
 * A key with no value (`apaleo:` whose children are all commented out, or
 * `beraternummer:` left empty) parses as null. Treat it as missing, so defaults
 * apply and required keys report "is required". Arrays are left as they are.
 */
function dropNullValues(object: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) {
    if (value === null) continue;
    result[key] = isPlainObject(value) ? dropNullValues(value) : value;
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkEnvVariables(env: Env): void {
  const allowed = new Set([CONFIG_PATH_ENV, ...ENV_OVERRIDES.map((o) => o.variable)]);
  const problems: string[] = [];
  for (const [variable, value] of Object.entries(env)) {
    if (!variable.startsWith(ENV_PREFIX) || allowed.has(variable) || value === undefined) continue;
    const arrayKey = ARRAY_KEYS.find((key) => `${ENV_PREFIX}${key.toUpperCase()}` === variable);
    problems.push(
      arrayKey
        ? `${variable}: "${arrayKey}" is an array and can only be set in the config file, not from the environment.`
        : `${variable}: unknown variable. Supported: ${[...allowed].join(', ')}.`,
    );
  }
  if (problems.length > 0) {
    throw new UserError(`Unsupported environment variables:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
}

function rejectSecretsInFile(raw: Record<string, unknown>, path: string): void {
  for (const secret of SECRET_KEYS) {
    if (getAtPath(raw, secret.path) !== undefined) {
      throw new UserError(
        `${secret.path.join('.')} must not be stored in the config file (${path}).\n` +
          `Remove it from the file and set ${secret.variable} in the environment instead (for example in .env).`,
      );
    }
  }
}

/** The sections of the tools this one started from (apaleo-datev-export, apaleo-bmd-export). */
const FOREIGN_SECTIONS = ['datev', 'bmd'] as const;

/** A config of the DATEV or BMD tool this one started from: say so instead of listing every key as unknown. */
function rejectForeignSections(raw: Record<string, unknown>, path: string): void {
  const section = FOREIGN_SECTIONS.find((name) => raw[name] !== undefined);
  if (!section) return;
  throw new UserError(
    `${section} is not a section of apaleo-abacus (${path}): this tool writes Abacus files. ` +
      'Replace the section with an abacus section (abacus.mandant, abacus.leitwaehrung, abacus.mwstCodes); ' +
      `see ${EXAMPLE_CONFIG_FILE} and docs/configuration.md.`,
  );
}

/** Extra words for a missing required key: what to do before the key can be filled in. */
const REQUIRED_HINTS: Readonly<Record<string, string>> = {
  'abacus.mandant': 'name the Mandantennummer of the hotel in Abacus, for example 1234 (the Treuhänder knows it); see docs/configuration.md',
};

/** Writes env values into the raw object and returns which key paths they set. */
function applyEnvOverrides(raw: Record<string, unknown>, env: Env): Map<string, string> {
  const fromEnv = new Map<string, string>();
  for (const override of ENV_OVERRIDES) {
    const value = env[override.variable];
    if (value === undefined || value === '') continue;
    setAtPath(raw, override.path, parseEnvValue(override, value));
    fromEnv.set(override.path.join('.'), override.variable);
  }
  return fromEnv;
}

function parseEnvValue(override: EnvOverride, value: string): string | number {
  if (override.type === 'string') return value;
  if (!/^\d+$/.test(value.trim())) {
    throw new UserError(`${override.variable} must be a whole number, got "${value}".`);
  }
  return Number(value.trim());
}

function describeIssue(issue: z.core.$ZodIssue, raw: unknown, fromEnv: Map<string, string>): string[] {
  const path = issue.path.map(String);
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => `${[...path, key].join('.')}: unknown key`);
  }
  const key = path.join('.') || '(top level)';
  const value = getAtPath(raw, path);
  if (value === undefined) return [`${key}: is required${REQUIRED_HINTS[key] ? `: ${REQUIRED_HINTS[key]}` : ''}`];
  const source = fromEnv.get(key);
  return [`${key}: ${issue.message} (got ${JSON.stringify(value)}${source ? ` from ${source}` : ''})`];
}

function getAtPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function setAtPath(target: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let current = target;
  for (const segment of path.slice(0, -1)) {
    const next = current[segment];
    if (next === null || typeof next !== 'object' || Array.isArray(next)) current[segment] = {};
    current = current[segment] as Record<string, unknown>;
  }
  current[path[path.length - 1] as string] = value;
}
