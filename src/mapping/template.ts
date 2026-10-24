import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { ChartIndex } from '../core/chart.js';
import { ACCOUNT_TYPES, type SourceAccount } from '../core/source.js';
import { commentLines, detectSeparator, parseCsv } from './csv.js';
import type { OdooVersion } from '../core/config.js';
import { generatedAccounts, type GeneratedAccounts, type GermanChart } from './l10n-de.js';
import { WILDCARD, parsePercent, rowKey, type MappingRowValues } from './types.js';

/**
 * The SKR03 and SKR04 hotel templates for Odoo: rule files in `templates/` that
 * `init-mapping` applies to the apaleo chart of accounts (design decision 3).
 */

const RULE_COLUMNS = ['apaleo_type', 'name_pattern', 'apaleo_vat_percent', 'odoo_account', 'odoo_tax', 'tax_percent', 'comment'];
/** The templates `init-mapping --template` accepts. */
export const TEMPLATE_NAMES = ['skr03-hotel', 'skr04-hotel'] as const;
export type TemplateName = (typeof TEMPLATE_NAMES)[number];
/** The template named in fix hints and in the refusal of a foreign mapping file. */
export const DEFAULT_TEMPLATE: TemplateName = 'skr03-hotel';
const TEMPLATE_ID = /\b(skr03|skr04)-hotel@\d+\b/;
const templateUrl = (name: TemplateName) => new URL(`../../templates/${name}.rules.csv`, import.meta.url);
/** `name_pattern` of a rule that matches any name and also yields a wildcard row. */
const WILDCARD_PATTERN = '*';
/** Every template row carries this mark until the Steuerberater has checked it. */
export const SUGGESTION_MARK = 'Vorschlag (ungeprüft)';
const NO_RULE_COMMENT = `${SUGGESTION_MARK}: keine Regel der Vorlage passt, bitte mit der Kanzlei zuordnen.`;
const ARCHIVED = 'archiviert';

/** `odoo_account` of a rule for an account Odoo generates at company setup: the Kasse and the Geldtransit account. */
const GENERATED_PLACEHOLDERS: Readonly<Record<string, keyof GeneratedAccounts>> = { '{cash}': 'cash', '{transfer}': 'transfer' };

export interface TemplateRule {
  line: number;
  apaleoType: string;
  /** Undefined matches any name. */
  namePattern: RegExp | undefined;
  /** Also write a wildcard row (`*`) for the type and rate. */
  wildcard: boolean;
  /** Undefined matches any rate. */
  apaleoVatPercent: number | undefined;
  /** The Odoo account, `{cash}` or `{transfer}`; empty leaves the account unmapped. */
  odooAccount: string;
  /** The Odoo tax (chart-template id), or empty. */
  odooTax: string;
  taxPercent: string;
  comment: string;
}

export interface Template {
  /** For example `skr03-hotel@1`. */
  id: string;
  chart: GermanChart;
  rules: TemplateRule[];
}

/** What the rows depend on: the Odoo version, which decides the codes of the generated accounts. */
export interface TemplateSettings {
  version: OdooVersion;
}

/** Reads a template shipped in `templates/`. */
export async function loadTemplate(name: TemplateName = DEFAULT_TEMPLATE): Promise<Template> {
  return parseTemplate(await readFile(templateUrl(name), 'utf8'));
}

const shipped = new Map<TemplateName, Template>();

/** A template shipped in `templates/`, read once and synchronously (for fix hints in findings). */
export function shippedTemplate(name: TemplateName = DEFAULT_TEMPLATE): Template {
  let template = shipped.get(name);
  if (!template) {
    template = parseTemplate(readFileSync(templateUrl(name), 'utf8'));
    shipped.set(name, template);
  }
  return template;
}

/** The account and tax the template's wildcard rule gives a type at a rate (any rate for types without one); undefined when none. */
export function templateWildcard(
  template: Template,
  type: string,
  rate: number | undefined,
  settings: TemplateSettings = { version: 18 },
): { odooAccount: string; odooTax: string } | undefined {
  const rule = template.rules.find(
    (r) => r.wildcard && r.apaleoType === type && r.odooAccount !== '' && (r.apaleoVatPercent === undefined || r.apaleoVatPercent === rate),
  );
  return rule ? { odooAccount: resolveAccount(rule.odooAccount, template, settings), odooTax: rule.odooTax } : undefined;
}

export function parseTemplate(text: string): Template {
  const match = TEMPLATE_ID.exec(commentLines(text).join('\n'));
  if (!match) throw new Error('The hotel template does not name its version (skr03-hotel@N or skr04-hotel@N)');
  const [id, chart] = match as unknown as [string, GermanChart];
  const [header, ...records] = parseCsv(text, detectSeparator(text), `the hotel template ${id}`);
  if (header?.fields.join(';') !== RULE_COLUMNS.join(';')) {
    throw new Error(`The hotel template header must be ${RULE_COLUMNS.join(';')}`);
  }
  const rules = records.map(({ line, fields }): TemplateRule => {
    const [type = '', pattern = '', vat = '', odooAccount = '', odooTax = '', taxPercent = '', comment = ''] = fields;
    return {
      line,
      apaleoType: type,
      namePattern: pattern === '' || pattern === WILDCARD_PATTERN ? undefined : new RegExp(pattern, 'iu'),
      wildcard: pattern === WILDCARD_PATTERN,
      apaleoVatPercent: parsePercent(vat),
      odooAccount,
      odooTax,
      taxPercent,
      comment,
    };
  });
  return { id, chart, rules };
}

/** A rule's `odoo_account` with `{cash}` or `{transfer}` replaced by the code of a fresh database of the chart and version. */
function resolveAccount(account: string, template: Template, { version }: TemplateSettings): string {
  const placeholder = GENERATED_PLACEHOLDERS[account];
  return placeholder ? generatedAccounts(template.chart, version)[placeholder] : account;
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
 * an Odoo account: the wildcard rows cover its per-reservation children, and one
 * Odoo account cannot serve every rate.
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
    if (container && !rule?.odooAccount) continue;
    const comment = rule ? rule.comment : NO_RULE_COMMENT;
    add({
      apaleoAccount: account.number,
      apaleoType: account.type,
      apaleoName: account.name,
      apaleoVatPercent: account.vat === undefined ? '' : String(account.vat.percent),
      ...ruleValues(rule, template, settings),
      comment: account.isArchived ? `${ARCHIVED}. ${comment}` : comment,
    });
  }
  for (const rule of template.rules.filter((r) => r.wildcard)) {
    add({
      apaleoAccount: WILDCARD,
      apaleoType: rule.apaleoType,
      apaleoName: '',
      apaleoVatPercent: rule.apaleoVatPercent === undefined ? '' : String(rule.apaleoVatPercent),
      ...ruleValues(rule, template, settings),
      comment: rule.comment,
    });
  }
  return [...rows.values()].sort(byType);
}

/** The Odoo account, tax and rate a rule gives; all empty without a rule or without an account. */
export function ruleValues(rule: TemplateRule | undefined, template: Template, settings: TemplateSettings): Pick<MappingRowValues, 'odooAccount' | 'odooTax' | 'taxPercent'> {
  const mapped = rule !== undefined && rule.odooAccount !== '';
  return {
    odooAccount: mapped ? resolveAccount(rule.odooAccount, template, settings) : '',
    odooTax: mapped ? rule.odooTax : '',
    taxPercent: mapped ? rule.taxPercent : '',
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
