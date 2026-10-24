import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { ChartIndex } from '../core/chart.js';
import { ACCOUNT_TYPES, type SourceAccount } from '../core/source.js';
import { commentLines, detectSeparator, parseCsv } from './csv.js';
import { WILDCARD, parsePercent, rowKey, type MappingRowValues } from './types.js';

/**
 * The KMU hotel template: a rule file in `templates/` that `init-mapping`
 * applies to the apaleo chart of accounts (design decisions 2 and 3).
 */

const RULE_COLUMNS = ['apaleo_type', 'name_pattern', 'apaleo_vat_percent', 'abacus_account', 'mwst_code', 'mwst_percent', 'comment'];
const TEMPLATE_ID = /\bkmu-hotel@\d+\b/;
const TEMPLATE_URL = new URL('../../templates/kmu-hotel.rules.csv', import.meta.url);
/** `name_pattern` of a rule that matches any name and also yields a wildcard row. */
const WILDCARD_PATTERN = '*';
/** Every template row carries this mark until the Treuhänder has checked it. */
export const SUGGESTION_MARK = 'Vorschlag (ungeprüft)';
const NO_RULE_COMMENT = `${SUGGESTION_MARK}: keine Regel der Vorlage passt, bitte mit dem Treuhänder zuordnen.`;
const ARCHIVED = 'archiviert';

/** The MWST-Codes of the Mandant that the template writes (`abacus.mwstCodes`). */
export interface MwstCodes {
  normal: string;
  reduziert: string;
  beherbergung: string;
}

/** The codes of the Abacus KMU sample Mandant, the defaults of `abacus.mwstCodes`. */
export const DEFAULT_MWST_CODES: Readonly<MwstCodes> = { normal: '311', reduziert: '312', beherbergung: '313' };

/** The rate each configured code stands for (`W-MWST-CODE-RATE`). */
export const MWST_CODE_RATES: Readonly<Record<keyof MwstCodes, number>> = { normal: 8.1, reduziert: 2.6, beherbergung: 3.8 };

/** `mwst_code` of a rule that stands for a configured code: `{normal}`, `{reduziert}` or `{beherbergung}`. */
const CODE_PLACEHOLDER = /^\{(normal|reduziert|beherbergung)\}$/;

export interface TemplateRule {
  line: number;
  apaleoType: string;
  /** Undefined matches any name. */
  namePattern: RegExp | undefined;
  /** Also write a wildcard row (`*`) for the type and rate. */
  wildcard: boolean;
  /** Undefined matches any rate. */
  apaleoVatPercent: number | undefined;
  /** The Abacus account; empty leaves the account unmapped. */
  abacusAccount: string;
  /** An MWST-Code, a placeholder such as `{normal}`, or empty. */
  mwstCode: string;
  mwstPercent: string;
  comment: string;
}

export interface Template {
  /** For example `kmu-hotel@1`. */
  id: string;
  rules: TemplateRule[];
}

/** What the rows depend on: the MWST-Codes of the Mandant. */
export interface TemplateSettings {
  mwstCodes: MwstCodes;
}

/** Reads the template shipped in `templates/`. */
export async function loadTemplate(): Promise<Template> {
  return parseTemplate(await readFile(TEMPLATE_URL, 'utf8'));
}

let shipped: Template | undefined;

/** The template shipped in `templates/`, read once and synchronously (for fix hints in findings). */
export function shippedTemplate(): Template {
  shipped ??= parseTemplate(readFileSync(TEMPLATE_URL, 'utf8'));
  return shipped;
}

/** The account and MWST-Code the template's wildcard rule gives a type at a rate (any rate for types without one); undefined when none. */
export function templateWildcard(
  template: Template,
  type: string,
  rate: number | undefined,
  settings: TemplateSettings = { mwstCodes: DEFAULT_MWST_CODES },
): { abacusAccount: string; mwstCode: string } | undefined {
  const rule = template.rules.find(
    (r) => r.wildcard && r.apaleoType === type && r.abacusAccount !== '' && (r.apaleoVatPercent === undefined || r.apaleoVatPercent === rate),
  );
  return rule ? { abacusAccount: rule.abacusAccount, mwstCode: resolveCode(rule.mwstCode, settings) } : undefined;
}

export function parseTemplate(text: string): Template {
  const id = TEMPLATE_ID.exec(commentLines(text).join('\n'))?.[0];
  if (!id) throw new Error('The KMU hotel template does not name its version (kmu-hotel@N)');
  const [header, ...records] = parseCsv(text, detectSeparator(text), 'the KMU hotel template');
  if (header?.fields.join(';') !== RULE_COLUMNS.join(';')) {
    throw new Error(`The KMU hotel template header must be ${RULE_COLUMNS.join(';')}`);
  }
  const rules = records.map(({ line, fields }): TemplateRule => {
    const [type = '', pattern = '', vat = '', abacusAccount = '', mwstCode = '', mwstPercent = '', comment = ''] = fields;
    return {
      line,
      apaleoType: type,
      namePattern: pattern === '' || pattern === WILDCARD_PATTERN ? undefined : new RegExp(pattern, 'iu'),
      wildcard: pattern === WILDCARD_PATTERN,
      apaleoVatPercent: parsePercent(vat),
      abacusAccount,
      mwstCode,
      mwstPercent,
      comment,
    };
  });
  return { id, rules };
}

/** A rule's `mwst_code` with a placeholder replaced by the configured code. */
function resolveCode(code: string, { mwstCodes }: TemplateSettings): string {
  const placeholder = CODE_PLACEHOLDER.exec(code)?.[1] as keyof MwstCodes | undefined;
  return placeholder ? mwstCodes[placeholder] : code;
}

/**
 * The first rule for the account's type and rate whose pattern matches one of
 * `names`: the account's number and name and those of its parents, so that a
 * rule can name apaleo's groups (`RevenueNoShow`) as well as their names.
 */
export function matchRule(template: Template, account: SourceAccount, names: readonly string[]): TemplateRule | undefined {
  return template.rules.find(
    (rule) =>
      rule.apaleoType === account.type &&
      (rule.apaleoVatPercent === undefined || rule.apaleoVatPercent === account.vat?.percent) &&
      (rule.namePattern === undefined || names.some((name) => rule.namePattern?.test(name))),
  );
}

/** The rule matching a chart account, with its number, name and parents as names. */
export function ruleFor(template: Template, chart: ChartIndex, account: SourceAccount): TemplateRule | undefined {
  return matchRule(template, account, [account.number, account.name, ...parentNames(chart, account)]);
}

/**
 * One row per leaf account of the chart (an account without children of the
 * same type), pre-filled from the first matching rule, plus the wildcard rows of
 * the template. Accounts no rule matches stay unmapped. Rows are grouped by type.
 *
 * A container account outside the global ledger (`hasChildren`, such as `3000`
 * Liabilities) gets no row when its type has wildcard rules and no rule gives it
 * an Abacus account: the wildcard rows cover its per-reservation children, and one
 * Abacus account cannot serve every rate.
 */
export function suggestRows(accounts: readonly SourceAccount[], template: Template, settings: TemplateSettings): MappingRowValues[] {
  const chart = new ChartIndex(accounts);
  const parents = new Set(accounts.flatMap((a) => (a.parentNumber === undefined ? [] : [`${a.parentNumber}\u0000${a.type}`])));
  const wildcardTypes = new Set(template.rules.filter((rule) => rule.wildcard).map((rule) => rule.apaleoType));
  const rows = new Map<string, MappingRowValues>();
  const add = (row: MappingRowValues) => {
    const key = rowKey(row);
    if (!rows.has(key)) rows.set(key, row);
  };

  for (const account of chart.accounts) {
    if (parents.has(`${account.number}\u0000${account.type}`)) continue;
    const rule = ruleFor(template, chart, account);
    const container = account.ledger !== 'global' && account.hasChildren && wildcardTypes.has(account.type);
    if (container && !rule?.abacusAccount) continue;
    const comment = rule ? rule.comment : NO_RULE_COMMENT;
    add({
      apaleoAccount: account.number,
      apaleoType: account.type,
      apaleoName: account.name,
      apaleoVatPercent: account.vat === undefined ? '' : String(account.vat.percent),
      ...ruleValues(rule, settings),
      comment: account.isArchived ? `${ARCHIVED}. ${comment}` : comment,
    });
  }
  for (const rule of template.rules.filter((r) => r.wildcard)) {
    add({
      apaleoAccount: WILDCARD,
      apaleoType: rule.apaleoType,
      apaleoName: '',
      apaleoVatPercent: rule.apaleoVatPercent === undefined ? '' : String(rule.apaleoVatPercent),
      ...ruleValues(rule, settings),
      comment: rule.comment,
    });
  }
  return [...rows.values()].sort(byType);
}

/** The Abacus account, MWST-Code and rate a rule gives; all empty without a rule or without an account. */
export function ruleValues(rule: TemplateRule | undefined, settings: TemplateSettings): Pick<MappingRowValues, 'abacusAccount' | 'mwstCode' | 'mwstPercent' | 'kost'> {
  const mapped = rule !== undefined && rule.abacusAccount !== '';
  return {
    abacusAccount: mapped ? rule.abacusAccount : '',
    mwstCode: mapped ? resolveCode(rule.mwstCode, settings) : '',
    mwstPercent: mapped ? rule.mwstPercent : '',
    kost: '',
  };
}

/** Number and name of every parent of the account, nearest first. */
function parentNames(chart: ChartIndex, account: SourceAccount): string[] {
  const names: string[] = [];
  const seen = new Set<string>([account.number]);
  let parent = account.parentNumber;
  while (parent !== undefined && !seen.has(parent)) {
    seen.add(parent);
    const found = chart.find(parent, account.type);
    if (!found) break;
    names.push(found.number, found.name);
    parent = found.parentNumber;
  }
  return names;
}

const TYPE_ORDER: readonly string[] = ACCOUNT_TYPES;

/** Known types in apaleo's order, unknown ones after them; within a type, chart order with wildcards last. */
function byType(a: MappingRowValues, b: MappingRowValues): number {
  const rank = (row: MappingRowValues) => {
    const index = TYPE_ORDER.indexOf(row.apaleoType);
    return index === -1 ? TYPE_ORDER.length : index;
  };
  return rank(a) - rank(b) || Number(a.apaleoAccount === WILDCARD) - Number(b.apaleoAccount === WILDCARD);
}
