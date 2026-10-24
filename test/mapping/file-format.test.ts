import { describe, expect, it } from 'vitest';
import { encodeCp1252 } from '../../src/core/cp1252.js';
import { decodeCsv, detectSeparator, formatCsvLine, parseCsv } from '../../src/mapping/csv.js';
import { MappingError, appendRows, parsePercent, parseMapping, renderMappingFile, type MappingRow, type MappingRowValues } from '../../src/mapping/index.js';
import { EXCEL_ORIGINAL_ROWS, csvBytes, mappingRow, readMappingFixture } from '../helpers/mapping.js';

const HEADER = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;odoo_account;odoo_tax;tax_percent;comment';
const parse = (bytes: Uint8Array) => parseMapping(bytes, { path: 'm.csv' });
const values = (row: MappingRow): MappingRowValues => {
  const { line, ...rest } = row;
  expect(line).toBeGreaterThan(0);
  return rest;
};
/** The row with both rate columns as numbers, so `19,0` and `19` compare equal. */
const rated = (row: MappingRowValues) => ({ ...row, apaleoVatPercent: parsePercent(row.apaleoVatPercent), taxPercent: parsePercent(row.taxPercent) });

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
    const text = `${HEADER}\r\nRevenueFoodAndBeverages_Normal:19.00;Revenues;Getränke;19;8400;tax_ust_19_skr03;19;Vorschlag – prüfen\r\n`;
    const utf8 = parse(new TextEncoder().encode(text));
    const cp1252 = parse(encodeCp1252(text).bytes);
    expect(cp1252.rows).toEqual(utf8.rows);
    expect(utf8.rows[0]).toMatchObject({ apaleoName: 'Getränke', odooAccount: '8400', odooTax: 'tax_ust_19_skr03', taxPercent: '19', comment: 'Vorschlag – prüfen' });
  });
});

describe('separator', () => {
  it('detects ; or , from the header line, skipping comment lines', () => {
    expect(detectSeparator(`# a, b, c, d\n${HEADER}\n`)).toBe(';');
    expect(detectSeparator('apaleo_account,apaleo_type,odoo_account\n1;2;3\n')).toBe(',');
  });

  it('reads a comma-separated file, with a decimal point in the rates', () => {
    const mapping = parse(csvBytes(['apaleo_account,apaleo_type,odoo_account,odoo_tax,tax_percent,comment', 'R:7,Revenues,8300,tax_ust_7_skr03,7.0,"Karte, Visa"']));
    expect(mapping.rows[0]).toMatchObject({ apaleoAccount: 'R:7', odooAccount: '8300', taxPercent: '7.0', comment: 'Karte, Visa' });
  });

  it('reads a decimal comma in the rate columns of a ; file', () => {
    const [row] = parse(csvBytes([HEADER, 'R;Revenues;;19,0;8400;tax_ust_19_skr03;19,0;'])).rows;
    expect(row && [parsePercent(row.apaleoVatPercent), parsePercent(row.taxPercent)]).toEqual([19, 19]);
  });

  it('keeps the Odoo account and tax as text: a leading zero, a dot and a full External ID stay', () => {
    const rows = parse(csvBytes([HEADER, 'R1;Revenues;;7;08300;tax_ust_7_skr03;7;', 'R2;Revenues;;7;8300.1;__import__.ust_7_hotel;7;'])).rows;
    expect(rows.map((row) => [row.odooAccount, row.odooTax])).toEqual([
      ['08300', 'tax_ust_7_skr03'],
      ['8300.1', '__import__.ust_7_hotel'],
    ]);
  });

  it('accepts the columns in any order and ignores unknown ones with a warning', () => {
    const mapping = parse(csvBytes(['odoo_account;Notiz;apaleo_type;apaleo_account', '1360;x;Payments;1102']));
    expect(mapping.rows[0]).toMatchObject({ apaleoAccount: '1102', apaleoType: 'Payments', odooAccount: '1360' });
    expect(mapping.findings.map((f) => f.code)).toEqual(['W-UNKNOWN-COLUMN']);
  });

  it('Revenue line carries the Kostenstelle no longer: a kost column is an unknown column, ignored with a warning', () => {
    const mapping = parse(csvBytes([`${HEADER};kost`, '5011;Revenues;Logis;7;8300;tax_ust_7_skr03;7;;10']));
    expect(mapping.rows[0]).toMatchObject({ apaleoAccount: '5011', odooAccount: '8300', odooTax: 'tax_ust_7_skr03' });
    expect(mapping.rows[0]).not.toHaveProperty('kost');
    expect(mapping.findings.map((f) => [f.code, f.value])).toEqual([['W-UNKNOWN-COLUMN', 'kost']]);
  });

  it('skips comment lines and rows Excel left with empty cells only', () => {
    const mapping = parse(csvBytes(['# Vorlage skr03-hotel@1', HEADER, '1102;Payments;Visa;;1360;;;', ';;;;;;;']));
    expect(mapping.rows).toHaveLength(1);
  });

  it('keeps account codes as written: no padding and no Sachkontenlänge', () => {
    const mapping = parse(csvBytes([HEADER, '9000;House;House;;650;;;', '*;AccountsReceivable;AR;;1401;;;']));
    expect(mapping.rows.map((r) => r.odooAccount)).toEqual(['650', '1401']);
    expect(mapping.findings).toEqual([]);
  });
});

describe('mappings of other tools', () => {
  it('Old Abacus mapping: rejects abacus_account and mwst_code, says it is an Abacus mapping and names init-mapping --template skr03-hotel', () => {
    const abacus = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;abacus_account;mwst_code;mwst_percent;kost;comment';
    const error = loadError(csvBytes([abacus, 'RevenueAccommodation_Special:3.80;Revenues;Logis;3.8;3400;313;3.8;;']));
    expect(error.message).toContain('this is an Abacus mapping');
    expect(error.message).toContain('init-mapping --property <id> --template skr03-hotel');
    expect(error.message).toContain('--template skr04-hotel');
  });

  it('Old BMD mapping: rejects bmd_account and steuercode, says it is a BMD mapping and names init-mapping --template skr03-hotel', () => {
    const error = loadError(readMappingFixture('ekr-beispiel.csv'));
    expect(error.message).toContain('this is a BMD mapping');
    expect(error.message).toContain('init-mapping --property <id> --template skr03-hotel');
  });

  it('Old DATEV mapping: rejects datev_account, names init-mapping --template skr03-hotel and says the DATEV account numbers are the same in Odoo', () => {
    const datev = 'apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;datev_account;bu_key;datev_vat_percent;kost1;kost2;comment';
    const error = loadError(csvBytes([datev, '5011;Revenues;Accommodation 7%;7;8300;;7;;;']));
    expect(error.message).toContain('this is a DATEV mapping');
    expect(error.message).toContain('init-mapping --property <id> --template skr03-hotel');
    expect(error.message).toContain('The DATEV account numbers of the SKR03/SKR04 hotel templates are the same in Odoo');
  });

  it('Account export of a paid Abacus connector: refuses it as an Abacus mapping without naming a vendor', () => {
    const exported = 'Apaleo Kontonummer;Kontoname;Kontotyp;Abacus Kontonummer;Kostenstelle';
    const error = loadError(csvBytes([exported, '5011;Logis;Revenues;3400;10']));
    expect(error.message).toContain('this is an Abacus mapping (the account export of a paid connector for Abacus)');
    expect(error.message).toContain('--template skr03-hotel');
    expect(error.message).not.toMatch(/grman|afin|--accounts-from/i);
  });

  it('rejects the account export of a paid DATEV connector without naming its vendor', () => {
    const error = loadError(csvBytes(['ApaleoAccountNumber;DatevAccountNumber;CostCenter;CostCenter2', '5011;8300;LOGIS;']));
    expect(error.message).toContain('the account export of a paid DATEV connector');
    expect(error.message).toContain('--template skr03-hotel');
    expect(error.message).not.toMatch(/grman/i);
  });
});

describe('structural errors', () => {
  it('Duplicate key: fails on two rows with the same account and type, naming both lines', () => {
    const error = loadError(csvBytes([HEADER, 'R7;Revenues;A;7;8300;tax_ust_7_skr03;7;', '1102;Payments;Visa;;1360;;;', 'R7;Revenues;A;7;8301;tax_ust_7_skr03;7;']));
    expect(error.message).toContain('lines 2 and 4 both map apaleo account R7 of type Revenues');
  });

  it('allows the same number with different types, and rate wildcards with different rates', () => {
    const mapping = parse(
      csvBytes([HEADER, '1200;Receivables;;;1410;;;', '1200;Payments;;;1360;;;', '*;Liabilities;;7;1711;tax_ust_7_skr03;7;', '*;Liabilities;;19;1718;tax_ust_19_skr03;19;']),
    );
    expect(mapping.rows).toHaveLength(4);
  });

  it('fails on two wildcards for the same rate, written differently', () => {
    const error = loadError(csvBytes([HEADER, '*;Liabilities;;7;1711;tax_ust_7_skr03;7;', '*;Liabilities;;"7,00";1711;tax_ust_7_skr03;7;']));
    expect(error.message).toContain('lines 2 and 3 both map apaleo account * of type Liabilities at 7,00 %');
  });

  it('rejects a Liabilities wildcard without a rate: VAT-relevant wildcards must name a VAT rate', () => {
    const error = loadError(csvBytes([HEADER, '*;Liabilities;;;1711;tax_ust_7_skr03;7;']));
    expect(error.message).toContain('line 2: VAT-relevant wildcards must name a VAT rate');
    expect(error.message).toContain('for example 7, 19 and 0');
  });

  it.each(['', '19'])('rejects a Revenues wildcard (rate "%s") because revenue accounts are mapped one by one', (rate) => {
    const error = loadError(csvBytes([HEADER, `*;Revenues;;${rate};8400;tax_ust_19_skr03;19;`]));
    expect(error.message).toContain('revenue accounts must be mapped one by one because of VAT');
  });

  it('rejects a header without the required columns and an empty file', () => {
    expect(loadError(csvBytes(['account;odoo'])).message).toContain('lacks the column(s) apaleo_account, apaleo_type, odoo_account');
    expect(loadError(new Uint8Array()).message).toContain('the file is empty');
  });

  it('reports a broken quote with the file name', () => {
    expect(() => parse(csvBytes([HEADER, 'R7;Revenues;"Accommodation;7']))).toThrow(/Cannot read the mapping file m\.csv/);
  });
});

describe('writer', () => {
  it('writes UTF-8 with BOM, ; and CRLF, quoting only where needed', () => {
    const bytes = renderMappingFile(['Vorlage skr03-hotel@1'], [mappingRow({ apaleoAccount: 'R7', apaleoType: 'Revenues', comment: 'a; "b"' })]);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.subarray(3))).toBe(`# Vorlage skr03-hotel@1\r\n${HEADER}\r\nR7;Revenues;;;;;;"a; ""b"""\r\n`);
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
  it('Excel round trip: the Excel (DE) saved fixture yields the rows of the written original, 19,0 read as 19, 1410 and tax_ust_19_skr03 kept as text', () => {
    const original = parse(renderMappingFile([], EXCEL_ORIGINAL_ROWS));
    const bytes = readMappingFixture('excel-de-saved.csv');
    const saved = parse(bytes);
    expect(decodeCsv(bytes)).toMatchObject({ encoding: 'windows-1252', bom: false });
    expect(decodeCsv(bytes).text).toContain('\r\n');
    expect(saved.rows.map(values).map(rated)).toEqual(original.rows.map(values).map(rated));
    const drinks = saved.rows.find((row) => row.apaleoAccount === 'RevenueFoodAndBeverages_Normal:19.00');
    expect(drinks?.taxPercent).toBe('19,0');
    expect(parsePercent(drinks?.taxPercent ?? '')).toBe(19);
    expect(drinks?.odooTax).toBe('tax_ust_19_skr03');
    expect(saved.rows.find((row) => row.apaleoType === 'Receivables')?.odooAccount).toBe('1410');
    expect(saved.findings).toEqual([]);
  });
});

describe('appendRows', () => {
  it('reads the column order of a header with every cell quoted (LibreOffice "quote all")', () => {
    const quoted =
      '"apaleo_account";"apaleo_type";"apaleo_name";"apaleo_vat_percent";"odoo_account";"odoo_tax";"tax_percent";"comment"\r\n' +
      '"R7";"Revenues";"Accommodation 7%";"7";"8300";"tax_ust_7_skr03";"7";""\r\n';
    const added = mappingRow({ apaleoAccount: 'R19', apaleoType: 'Revenues', apaleoName: 'Spa 19%', apaleoVatPercent: '19', odooAccount: '8400', odooTax: 'tax_ust_19_skr03', taxPercent: '19' });
    const bytes = appendRows(new TextEncoder().encode(quoted), [added]);
    expect(decodeCsv(bytes).text).toBe(`${quoted}R19;Revenues;Spa 19%;19;8400;tax_ust_19_skr03;19;\r\n`);
    const rows = parseMapping(bytes, { path: 'x' }).rows;
    expect(rows.map((r) => [r.apaleoAccount, r.odooAccount])).toEqual([
      ['R7', '8300'],
      ['R19', '8400'],
    ]);
  });
});
