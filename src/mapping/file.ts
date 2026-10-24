import { encodeCp1252 } from '../core/cp1252.js';
import { concatBytes, decodeCsv, detectSeparator, encodeCsvFile, formatCsvLine, parseCsv } from './csv.js';
import type { Template, TemplateSettings } from './template.js';
import { MAPPING_COLUMNS, ROW_FIELDS, rowKey, type MappingColumn, type MappingRowValues } from './types.js';

/** The comment line on top of a written mapping file: the template and the MWST-Codes it was written with. */
export function mappingHeaderComment(template: Template, { mwstCodes }: TemplateSettings): string {
  return (
    `apaleo-abacus Kontenzuordnung, Vorlage ${template.id}, MWST-Codes ${mwstCodes.normal} (8,1 %), ${mwstCodes.reduziert} (2,6 %), ` +
    `${mwstCodes.beherbergung} (3,8 %). Alle Vorschläge mit dem Treuhänder prüfen. Spalten abacus_account und mwst_code in Excel als Text formatieren.`
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
