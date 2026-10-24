import { describe, expect, it } from 'vitest';
import { encodeCp1252 } from '../../src/core/cp1252.js';
import { decodeCsv, detectSeparator, formatCsvLine, parseCsv } from '../../src/mapping/csv.js';
import { MappingError, appendRows, parsePercent, parseMapping, renderMappingFile, type MappingRow, type MappingRowValues } from '../../src/mapping/index.js';
import { EXCEL_ORIGINAL_ROWS, csvBytes, mappingRow, readMappingFixture } from '../helpers/mapping.js';

const HEADER = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;abacus_account;mwst_code;mwst_percent;kost;comment';
const parse = (bytes: Uint8Array) => parseMapping(bytes, { path: 'm.csv' });
const values = (row: MappingRow): MappingRowValues => {
  const { line, ...rest } = row;
  expect(line).toBeGreaterThan(0);
  return rest;
};
/** The row with both rate columns as numbers, so `8,1` and `8.1` compare equal. */
const rated = (row: MappingRowValues) => ({ ...row, apaleoVatPercent: parsePercent(row.apaleoVatPercent), mwstPercent: parsePercent(row.mwstPercent) });

function loadError(bytes: Uint8Array): MappingError {
  try {
    parse(bytes);
  } catch (error) {
    expect(error).toBeInstanceOf(MappingError);
    return error as MappingError;
  }
  throw new Error('expected a MappingError');
}

describe('encoding', () => {
  it('strips a UTF-8 BOM and decodes UTF-8', () => {
    const decoded = decodeCsv(Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Getränke')]));
    expect(decoded).toEqual({ text: 'Getränke', encoding: 'utf-8', bom: true });
  });

  it('decodes bytes that are not valid UTF-8 as CP1252', () => {
    const decoded = decodeCsv(encodeCp1252('Frühstück – 10 €').bytes);
    expect(decoded).toEqual({ text: 'Frühstück – 10 €', encoding: 'windows-1252', bom: false });
  });

  it('reads UTF-8 without BOM and CP1252 files to the same rows', () => {
    const text = `${HEADER}\r\nRevenueFoodAndBeverages_Normal:8.10;Revenues;Getränke;8.1;3100;311;8.1;;Vorschlag – prüfen\r\n`;
    const utf8 = parse(new TextEncoder().encode(text));
    const cp1252 = parse(encodeCp1252(text).bytes);
    expect(cp1252.rows).toEqual(utf8.rows);
    expect(utf8.rows[0]).toMatchObject({ apaleoName: 'Getränke', abacusAccount: '3100', mwstCode: '311', mwstPercent: '8.1', comment: 'Vorschlag – prüfen' });
  });
});

describe('separator', () => {
  it('detects ; or , from the header line, skipping comment lines', () => {
    expect(detectSeparator(`# a, b, c, d\n${HEADER}\n`)).toBe(';');
    expect(detectSeparator('apaleo_account,apaleo_type,abacus_account\n1;2;3\n')).toBe(',');
  });

  it('reads a comma-separated file, with a decimal point in the rates', () => {
    const mapping = parse(csvBytes(['apaleo_account,apaleo_type,abacus_account,mwst_code,mwst_percent,comment', 'R:2.6,Revenues,3260,312,2.6,"Karte, Visa"']));
    expect(mapping.rows[0]).toMatchObject({ apaleoAccount: 'R:2.6', abacusAccount: '3260', mwstPercent: '2.6', comment: 'Karte, Visa' });
  });

  it('reads a decimal comma in the rate columns of a ; file', () => {
    const [row] = parse(csvBytes([HEADER, 'R;Revenues;;8,1;3500;311;8,1;;'])).rows;
    expect(row && [parsePercent(row.apaleoVatPercent), parsePercent(row.mwstPercent)]).toEqual([8.1, 8.1]);
  });

  it('keeps the MWST-Code as text: a leading zero and letters stay', () => {
    const rows = parse(csvBytes([HEADER, 'R1;Revenues;;8.1;3500;011;8.1;;', 'R2;Revenues;;8.1;3500;V81;8.1;;'])).rows;
    expect(rows.map((row) => row.mwstCode)).toEqual(['011', 'V81']);
  });

  it('accepts the columns in any order and ignores unknown ones with a warning', () => {
    const mapping = parse(csvBytes(['abacus_account;Notiz;apaleo_type;apaleo_account', '1090;x;Payments;1102']));
    expect(mapping.rows[0]).toMatchObject({ apaleoAccount: '1102', apaleoType: 'Payments', abacusAccount: '1090' });
    expect(mapping.findings.map((f) => f.code)).toEqual(['W-UNKNOWN-COLUMN']);
  });

  it('skips comment lines and rows Excel left with empty cells only', () => {
    const mapping = parse(csvBytes(['# Vorlage kmu-hotel@1', HEADER, '1102;Payments;Visa;;1090;;;;', ';;;;;;;;']));
    expect(mapping.rows).toHaveLength(1);
  });

  it('keeps account numbers as written: no padding and no Sachkontenlänge', () => {
    const mapping = parse(csvBytes([HEADER, '9000;House;House;;650;;;;', '*;AccountsReceivable;AR;;200;;;;']));
    expect(mapping.rows.map((r) => r.abacusAccount)).toEqual(['650', '200']);
    expect(mapping.findings).toEqual([]);
  });
});

describe('mappings of other tools', () => {
  it('Old BMD mapping: rejects bmd_account and steuercode, says it is a BMD mapping and names init-mapping --template kmu-hotel', () => {
    const error = loadError(readMappingFixture('ekr-beispiel.csv'));
    expect(error.message).toContain('this is a BMD mapping');
    expect(error.message).toContain('init-mapping --property <id> --template kmu-hotel');
  });

  it('Old DATEV mapping: rejects datev_account and names init-mapping --template kmu-hotel', () => {
    const datev = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;datev_account;bu_key;datev_vat_percent;kost1;kost2;comment';
    const error = loadError(csvBytes([datev, '5011;Revenues;Accommodation 7%;7;8300;;7;;;']));
    expect(error.message).toContain('this is a DATEV mapping');
    expect(error.message).toContain('init-mapping --property <id> --template kmu-hotel');
  });

  it('Account export of a paid connector: refuses it, names --accounts-from and no vendor', () => {
    const error = loadError(readMappingFixture('connector-export.csv'));
    expect(error.message).toContain('the account export of a paid connector');
    expect(error.message).toContain('init-mapping --property <id> --template kmu-hotel --accounts-from <file>');
    expect(error.message).not.toMatch(/grman|afin/i);
  });

  it('rejects the account export of a paid DATEV connector without naming its vendor', () => {
    const error = loadError(csvBytes(['ApaleoAccountNumber;DatevAccountNumber;CostCenter;CostCenter2', '5011;8300;LOGIS;']));
    expect(error.message).toContain('the account export of a paid DATEV connector');
    expect(error.message).toContain('--template kmu-hotel');
    expect(error.message).not.toMatch(/grman/i);
  });
});

describe('structural errors', () => {
  it('Duplicate key: fails on two rows with the same account and type, naming both lines', () => {
    const error = loadError(csvBytes([HEADER, 'R38;Revenues;A;3.8;3400;313;3.8;;', '1102;Payments;Visa;;1090;;;;', 'R38;Revenues;A;3.8;3410;313;3.8;;']));
    expect(error.message).toContain('lines 2 and 4 both map apaleo account R38 of type Revenues');
  });

  it('allows the same number with different types, and rate wildcards with different rates', () => {
    const mapping = parse(
      csvBytes([HEADER, '1200;Receivables;;;1101;;;;', '1200;Payments;;;1090;;;;', '*;Liabilities;;3.8;2030;313;3.8;;', '*;Liabilities;;8.1;2031;311;8.1;;']),
    );
    expect(mapping.rows).toHaveLength(4);
  });

  it('fails on two wildcards for the same rate, written differently', () => {
    const error = loadError(csvBytes([HEADER, '*;Liabilities;;3.8;2030;313;3.8;;', '*;Liabilities;;"3,80";2030;313;3.8;;']));
    expect(error.message).toContain('lines 2 and 3 both map apaleo account * of type Liabilities at 3,80 %');
  });

  it('rejects a Liabilities wildcard without a rate: VAT-relevant wildcards must name a VAT rate', () => {
    const error = loadError(csvBytes([HEADER, '*;Liabilities;;;2030;313;3.8;;']));
    expect(error.message).toContain('line 2: VAT-relevant wildcards must name a VAT rate');
    expect(error.message).toContain('for example 3.8, 8.1, 2.6 and 0');
  });

  it.each(['', '8.1'])('rejects a Revenues wildcard (rate "%s") because revenue accounts are mapped one by one', (rate) => {
    const error = loadError(csvBytes([HEADER, `*;Revenues;;${rate};3500;311;8.1;;`]));
    expect(error.message).toContain('revenue accounts must be mapped one by one because of VAT');
  });

  it('rejects a header without the required columns and an empty file', () => {
    expect(loadError(csvBytes(['account;abacus'])).message).toContain('lacks the column(s) apaleo_account, apaleo_type, abacus_account');
    expect(loadError(new Uint8Array()).message).toContain('the file is empty');
  });

  it('reports a broken quote with the file name', () => {
    expect(() => parse(csvBytes([HEADER, 'R38;Revenues;"Accommodation;3.8']))).toThrow(/Cannot read the mapping file m\.csv/);
  });
});

describe('writer', () => {
  it('writes UTF-8 with BOM, ; and CRLF, quoting only where needed', () => {
    const bytes = renderMappingFile(['Vorlage kmu-hotel@1'], [mappingRow({ apaleoAccount: 'R38', apaleoType: 'Revenues', comment: 'a; "b"' })]);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.subarray(3))).toBe(`# Vorlage kmu-hotel@1\r\n${HEADER}\r\nR38;Revenues;;;;;;;"a; ""b"""\r\n`);
    expect(formatCsvLine([' x', 'y\nz', 'plain'])).toBe('" x";"y\nz";plain');
  });

  it('reads back what it wrote', () => {
    const mapping = parse(renderMappingFile([], EXCEL_ORIGINAL_ROWS));
    expect(mapping.rows.map(values)).toEqual(EXCEL_ORIGINAL_ROWS);
    expect(mapping.findings).toEqual([]);
  });

  it('keeps line numbers of multi-line records usable', () => {
    const records = parseCsv('a;b\r\n1;"x\r\ny"\r\n2;3\r\n', ';', 'test');
    expect(records.map((r) => r.line)).toEqual([1, 3, 4]);
  });
});

describe('Excel round trip', () => {
  it('reads the Excel (CH) saved fixture to the same rows as the written original, with 8,1 read as 8.1 and the MWST-Code 311 kept as text', () => {
    const original = parse(renderMappingFile([], EXCEL_ORIGINAL_ROWS));
    const saved = parse(readMappingFixture('excel-ch-saved.csv'));
    expect(decodeCsv(readMappingFixture('excel-ch-saved.csv')).encoding).toBe('windows-1252');
    expect(saved.rows.map(values).map(rated)).toEqual(original.rows.map(values).map(rated));
    const food = saved.rows.find((row) => row.apaleoAccount === 'RevenueFoodAndBeverages_Normal:8.10');
    expect(food?.mwstPercent).toBe('8,1');
    expect(parsePercent(food?.mwstPercent ?? '')).toBe(8.1);
    expect(food?.mwstCode).toBe('311');
    expect(saved.findings).toEqual([]);
  });
});

describe('appendRows', () => {
  it('reads the column order of a header with every cell quoted (LibreOffice "quote all")', () => {
    const quoted =
      '"apaleo_account";"apaleo_type";"apaleo_name";"apaleo_vat_percent";"abacus_account";"mwst_code";"mwst_percent";"kost";"comment"\r\n' +
      '"R38";"Revenues";"Accommodation 3.8%";"3.8";"3400";"313";"3.8";"";""\r\n';
    const added = mappingRow({ apaleoAccount: 'R81', apaleoType: 'Revenues', apaleoName: 'Spa 8.1%', apaleoVatPercent: '8.1', abacusAccount: '3500', mwstCode: '311', mwstPercent: '8.1' });
    const bytes = appendRows(new TextEncoder().encode(quoted), [added]);
    expect(decodeCsv(bytes).text).toBe(`${quoted}R81;Revenues;Spa 8.1%;8.1;3500;311;8.1;;\r\n`);
    const rows = parseMapping(bytes, { path: 'x' }).rows;
    expect(rows.map((r) => [r.apaleoAccount, r.abacusAccount])).toEqual([
      ['R38', '3400'],
      ['R81', '3500'],
    ]);
  });
});
