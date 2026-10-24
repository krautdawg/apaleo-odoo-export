import { ChartIndex } from '../core/chart.js';
import { UserError } from '../core/errors.js';
import type { SourceAccount } from '../core/source.js';
import { decodeCsv, detectSeparator, parseCsv } from './csv.js';
import { SUGGESTION_MARK, ruleFor, ruleValues, type Template, type TemplateSettings } from './template.js';
import { CONNECTOR_EXPORT_COLUMNS, VAT_RELEVANT_TYPES, WILDCARD, type MappingRowValues } from './types.js';

/**
 * The account export of a paid apaleo-Abacus connector (research §3), which a
 * hotel switching to this tool already has and its Treuhänder signed off:
 * one line per apaleo account and type with its Abacus account and
 * Kostenstelle. It has no MWST column (design decision 10).
 */

export interface ConnectorAccount {
  /** Line of the file, 1-based. */
  line: number;
  apaleoAccount: string;
  apaleoType: string;
  apaleoName: string;
  abacusAccount: string;
  kost: string;
}

/** `apaleo account` + `type`, the key the export and the mapping share. */
export function connectorKey(account: Pick<ConnectorAccount, 'apaleoAccount' | 'apaleoType'>): string {
  return `${account.apaleoAccount}\u0000${account.apaleoType.toLowerCase()}`;
}

/** Reads the export (UTF-8 or CP1252, `;` or `,`); refuses a file without its columns. */
export function parseConnectorExport(bytes: Uint8Array, path: string): ConnectorAccount[] {
  const { text } = decodeCsv(bytes);
  const [header, ...records] = parseCsv(text, detectSeparator(text), `the account export ${path}`);
  const names = (header?.fields ?? []).map((field) => field.trim().toLowerCase());
  const index = CONNECTOR_EXPORT_COLUMNS.map((column) => names.indexOf(column.toLowerCase()));
  if (index.some((i) => i < 0)) {
    throw new UserError(
      `${path} is not the account export of a paid connector: its header must have the columns ${CONNECTOR_EXPORT_COLUMNS.join(';')}.`,
    );
  }
  const [number = 0, name = 0, type = 0, abacus = 0, kost = 0] = index;
  return records.map(({ line, fields }) => ({
    line,
    apaleoAccount: (fields[number] ?? '').trim(),
    apaleoName: fields[name] ?? '',
    apaleoType: (fields[type] ?? '').trim(),
    abacusAccount: (fields[abacus] ?? '').trim(),
    kost: (fields[kost] ?? '').trim(),
  }));
}

/** The comment of a row whose account was carried over from the export. */
export const CARRIED_OVER_COMMENT =
  `${SUGGESTION_MARK}: Abacus-Konto und Kostenstelle aus dem Kontenexport eines kostenpflichtigen Connectors übernommen, ` +
  'MWST-Code und Satz aus der Vorlage. Bitte mit dem Treuhänder prüfen.';

export interface CarriedOver {
  /** The rows, those of accounts in the export with its Abacus account and Kostenstelle. */
  rows: MappingRowValues[];
  /** How many rows took values from the export. */
  carried: number;
  /** Accounts of the export that the chart does not contain. */
  notInChart: ConnectorAccount[];
  /** Accounts of the export that the chart contains, but that get no row (containers covered by wildcard rows). */
  withoutRow: ConnectorAccount[];
}

/**
 * Takes the Abacus account and the Kostenstelle of every account of the export
 * into the template row of the same apaleo account and type (design decision 10).
 * MWST-Code and rate come from the template rule for the account's type and rate;
 * where that rule gives none, the code stays empty and the rate is apaleo's, so
 * `mapping check` reports `E-MWST-CODE-MISSING` for a rate above 0.
 */
export function carryOverAccounts(
  rows: readonly MappingRowValues[],
  accounts: readonly ConnectorAccount[],
  chartAccounts: readonly SourceAccount[],
  template: Template,
  settings: TemplateSettings,
): CarriedOver {
  const chart = new ChartIndex(chartAccounts);
  const byKey = new Map(accounts.map((account) => [connectorKey(account), account]));
  const used = new Set<string>();
  let carried = 0;
  const result = rows.map((row) => {
    const key = connectorKey(row);
    const account = row.apaleoAccount === WILDCARD ? undefined : byKey.get(key);
    const chartAccount = chart.find(row.apaleoAccount, row.apaleoType);
    if (!account || chartAccount?.type !== row.apaleoType) return row;
    used.add(key);
    carried += 1;
    const rule = ruleFor(template, chart, chartAccount);
    const { mwstCode, mwstPercent } = ruleValues(rule, settings);
    const apaleoRate = VAT_RELEVANT_TYPES.has(row.apaleoType) && (chartAccount.vat?.percent ?? 0) > 0 ? String(chartAccount.vat?.percent) : '';
    return {
      ...row,
      abacusAccount: account.abacusAccount,
      mwstCode,
      mwstPercent: mwstCode === '' && apaleoRate !== '' ? apaleoRate : mwstPercent,
      kost: account.kost,
      comment: CARRIED_OVER_COMMENT,
    };
  });
  const unused = accounts.filter((account) => !used.has(connectorKey(account)));
  const inChart = (account: ConnectorAccount) => chart.find(account.apaleoAccount, account.apaleoType)?.type.toLowerCase() === account.apaleoType.toLowerCase();
  return { rows: result, carried, notInChart: unused.filter((a) => !inChart(a)), withoutRow: unused.filter(inChart) };
}
