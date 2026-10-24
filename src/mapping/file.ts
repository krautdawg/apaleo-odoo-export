import { encodeCp1252 } from '../core/cp1252.js';
import type { Finding } from '../core/findings.js';
import { concatBytes, decodeCsv, detectSeparator, encodeCsvFile, formatCsvLine, parseCsv } from './csv.js';
import { generatedAccounts } from './l10n-de.js';
import type { Template, TemplateSettings } from './template.js';
import { MAPPING_COLUMNS, ROW_FIELDS, rowKey, type MappingColumn, type MappingRow, type MappingRowValues } from './types.js';

/** The comment line on top of a written mapping file: the template and the Odoo version it was written for, with the generated accounts. */
export function mappingHeaderComment(template: Template, settings: TemplateSettings): string {
  const { cash, transfer } = generatedAccounts(template.chart, settings.version);
  return (
    `apaleo-odoo Kontenzuordnung, Vorlage ${template.id} für Odoo ${settings.version} (Kasse ${cash}, Geldtransit ${transfer} wie in einer frischen Datenbank). ` +
    'Alle Vorschläge mit deinem Steuerberater prüfen. Spalten odoo_account und odoo_tax in Excel als Text formatieren.'
  );
}

function toRecord(row: MappingRowValues): string[] {
  return MAPPING_COLUMNS.map((column) => row[ROW_FIELDS[column]]);
}

/** A complete mapping file: UTF-8 with BOM, `;`, CRLF. */
export function renderMappingFile(comments: readonly string[], rows: readonly MappingRowValues[]): Uint8Array {
  return encodeCsvFile(comments, [[...MAPPING_COLUMNS], ...rows.map(toRecord)]);
}

type KeyFields = Pick<MappingRowValues, 'apaleoAccount' | 'apaleoType' | 'apaleoVatPercent'>;

/** The suggested rows whose key the existing rows do not have yet. */
export function newRows(existing: readonly KeyFields[], suggested: readonly MappingRowValues[]): MappingRowValues[] {
  const keys = new Set(existing.map(rowKey));
  return suggested.filter((row) => !keys.has(rowKey(row)));
}

/**
 * `N-TEMPLATE-SUGGESTION` for each existing row without an Odoo account for
 * which the current template now suggests one (for example a no-show row that
 * an older template version left empty). `init-mapping --update` never changes
 * an existing row, so it names the suggestion and leaves the decision to the user.
 */
export function templateSuggestions(existing: readonly MappingRow[], suggested: readonly MappingRowValues[], templateId: string): Finding[] {
  const byKey = new Map(suggested.map((row) => [rowKey(row), row]));
  return existing.flatMap((row) => {
    const suggestion = row.odooAccount === '' ? byKey.get(rowKey(row)) : undefined;
    if (!suggestion || suggestion.odooAccount === '') return [];
    const tax = suggestion.odooTax === '' ? 'without tax' : `${suggestion.odooTax} (${suggestion.taxPercent} %)`;
    return [
      {
        code: 'N-TEMPLATE-SUGGESTION',
        message:
          `line ${row.line} (${row.apaleoAccount} ${row.apaleoType}${row.apaleoVatPercent === '' ? '' : ` ${row.apaleoVatPercent} %`}) has no Odoo account, ` +
          `and the template ${templateId} now suggests ${suggestion.odooAccount} / ${tax}. The row was not changed: ` +
          'check the suggestion with your Steuerberater and fill it in by hand, then run "apaleo-odoo mapping check"',
        field: 'odoo_account',
        value: row.apaleoAccount,
      },
    ];
  });
}

/**
 * The existing file with the rows appended, byte for byte unchanged before them.
 * The new lines follow the file's encoding, separator, line breaks and column order.
 */
export function appendRows(existing: Uint8Array, rows: readonly MappingRowValues[]): Uint8Array {
  if (rows.length === 0) return existing;
  const { text, encoding } = decodeCsv(existing);
  const separator = detectSeparator(text);
  const lineBreak = text.includes('\r\n') || !text.includes('\n') ? '\r\n' : '\n';
  // Parsed, not split: tools such as LibreOffice quote every header cell.
  const header = parseCsv(text, separator, 'the mapping file')[0]?.fields ?? [];
  const order = header.map((name) => name.trim().toLowerCase());
  const lines = rows.map((row) =>
    formatCsvLine(
      order.map((name) => (Object.hasOwn(ROW_FIELDS, name) ? row[ROW_FIELDS[name as MappingColumn]] : '')),
      separator,
    ),
  );
  const prefix = text === '' || text.endsWith('\n') ? '' : lineBreak;
  const appended = `${prefix}${lines.join(lineBreak)}${lineBreak}`;
  const bytes = encoding === 'utf-8' ? new TextEncoder().encode(appended) : encodeCp1252(appended).bytes;
  return concatBytes(existing, bytes);
}
