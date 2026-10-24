import { describe, expect, it } from 'vitest';
import { buildEntries, compareLines, CSV_HEADER, odooCsvFileName, OdooValidationError, renderOdooCsv, revisionOf, sanitiseLabel } from '../../src/odoo/index.js';
import { allowance, drinks, odooOptions, payment, revenue, specDay, untaxed, vat } from '../helpers/odoo.js';

const HEADER = `${CSV_HEADER.join(',')}\n`;
const rows = (text: string) => text.split('\n').slice(1, -1);

describe('One journal entry per property and business day', () => {
  it('One day with lodging, drinks and a card payment: 8300 credit 112.15, 8400 credit 20.00, 1360 debit 143.80 and no line on 1410', () => {
    const { text } = renderOdooCsv(specDay(), odooOptions());
    expect(text).toBe(
      HEADER +
        'apaleo_c1_BSP_20260914,apaleo BSP 2026-09-14,2026-09-14,APA,apaleo_c1_BSP_20260914_0001,1360,Zahlung Visa,143.80,0.00,\n' +
        ',,,,apaleo_c1_BSP_20260914_0002,8300,Logis 7 %,0.00,112.15,account.1_tax_ust_7_skr03\n' +
        ',,,,apaleo_c1_BSP_20260914_0003,8400,Getränke 19 %,0.00,20.00,account.1_tax_ust_19_skr03\n',
    );
  });

  it('a tax given as account.<companyId>_<id> nets with its chart-template id: one line, one group, the same bytes', () => {
    const full = revenue({ vat: vat('account.1_tax_ust_7_skr03', 7, 785) });
    const mixed = renderOdooCsv([revenue(), full, payment(24_000)], odooOptions({ taxRounding: 'per_tax', roundingAccount: '2700' }));
    const short = renderOdooCsv([revenue(), revenue(), payment(24_000)], odooOptions({ taxRounding: 'per_tax', roundingAccount: '2700' }));
    expect(mixed.entries[0]?.groups).toHaveLength(1);
    expect(mixed.entries[0]?.lines.filter((line) => line.account === '8300')).toHaveLength(1);
    expect(mixed.bytes).toEqual(short.bytes);
  });

  it('a full External ID of another company stays its own tax', () => {
    const other = revenue({ vat: vat('account.2_tax_ust_7_skr03', 7, 785) });
    expect(buildEntries([revenue(), other, payment(24_000)], odooOptions()).entries[0]?.lines.filter((line) => line.account === '8300')).toHaveLength(2);
  });

  it('Allowance nets with the revenue of the day: one 8300 line of 93.46 on the invoice side', () => {
    const { entries } = buildEntries([revenue(), allowance(), payment(10_000)], odooOptions());
    const lines = entries[0]?.lines.filter((line) => line.account === '8300') ?? [];
    expect(lines.map((line) => line.amountCents)).toEqual([-9_346]);
    expect(entries[0]?.groups.map((group) => group.side)).toEqual(['credit']);
  });

  it('Two days: two entries in date order, each with its own lines', () => {
    const { text, entries } = renderOdooCsv([...specDay('2026-09-15'), ...specDay('2026-09-14')], odooOptions());
    expect(entries.map((entry) => entry.date)).toEqual(['2026-09-14', '2026-09-15']);
    const heads = rows(text).filter((row) => !row.startsWith(','));
    expect(heads.map((row) => row.split(',').slice(0, 4).join(','))).toEqual([
      'apaleo_c1_BSP_20260914,apaleo BSP 2026-09-14,2026-09-14,APA',
      'apaleo_c1_BSP_20260915,apaleo BSP 2026-09-15,2026-09-15,APA',
    ]);
    expect(rows(text)[3]).toMatch(/^apaleo_c1_BSP_20260915,.*,apaleo_c1_BSP_20260915_0001,/);
  });

  it('Empty month: only the header row', () => {
    const rendered = renderOdooCsv([], odooOptions());
    expect(rendered.text).toBe(HEADER);
    expect(rendered.entries).toEqual([]);
    expect(revisionOf(rendered.bytes)).toBeUndefined();
  });

  it('drops a key whose net is 0 and counts it, and a day whose keys all net to 0 gets no entry', () => {
    const rendered = renderOdooCsv([payment(5_000, 'Zahlung bar', { debit: { account: '1001', label: 'Kasse' } }), payment(5_000, 'Storno', { debit: { account: '1410', label: 'Gästeforderungen' }, credit: { account: '1001', label: 'Kasse' } })], odooOptions());
    expect(rendered.entries).toEqual([]);
    const { entries } = buildEntries([...specDay(), revenue({ debit: { account: '8300', label: 'Logis 7 %' }, credit: { account: '1410', label: 'Gästeforderungen' }, vat: vat('tax_ust_7_skr03', 7, 785, 'debit') })], odooOptions());
    expect(entries[0]?.droppedKeys).toBe(1);
  });

  it('keeps payment methods apart by label on the same account', () => {
    const { entries } = buildEntries([revenue(), payment(10_000, 'Zahlung Visa'), payment(2_000, 'Zahlung Mastercard')], odooOptions());
    expect(entries[0]?.lines.map((line) => [line.account, line.label, line.amountCents])).toEqual([
      ['1360', 'Zahlung Mastercard', 2_000],
      ['1360', 'Zahlung Visa', 10_000],
      ['8300', 'Logis 7 %', -11_215],
    ]);
  });
});

describe('Import file layout', () => {
  it('Continuation rows: the second and third row of an entry start with four empty columns', () => {
    const [first, second, third] = rows(renderOdooCsv(specDay(), odooOptions()).text);
    expect(first?.startsWith(',')).toBe(false);
    expect(second?.startsWith(',,,,')).toBe(true);
    expect(third?.startsWith(',,,,')).toBe(true);
  });

  it('Untaxed line on an account with a default tax: the tax cell of SKR04 4200 is present and empty', () => {
    const [, line] = rows(renderOdooCsv([untaxed(), payment(8_000)], odooOptions()).text);
    expect(line).toBe(',,,,apaleo_c1_BSP_20260914_0002,4200,Erlöse ohne USt,0.00,80.00,');
    expect(line?.split(',')).toHaveLength(CSV_HEADER.length);
  });

  it('No tax columns beyond the header: every row has exactly the header columns, exactly one side above 0.00', () => {
    const { text } = renderOdooCsv([...specDay(), allowance(), payment(2_000, 'Rückzahlung', { debit: { account: '1410', label: 'Gästeforderungen' }, credit: { account: '1360', label: 'Rückzahlung' } })], odooOptions());
    expect(text.startsWith(HEADER)).toBe(true);
    for (const row of rows(text)) {
      const cells = row.split(',');
      expect(cells).toHaveLength(CSV_HEADER.length);
      const [debit, credit] = [cells[7], cells[8]];
      expect([debit, credit].filter((amount) => amount !== '0.00')).toHaveLength(1);
      expect(`${debit}${credit}`).toMatch(/^\d+\.\d{2}\d+\.\d{2}$/);
    }
  });

  it('writes UTF-8 without byte-order mark, LF line ends and a final line break, and quotes a label with a comma', () => {
    const { bytes, text } = renderOdooCsv([revenue({ credit: { account: '8300', label: 'Logis, Frühstück 7 %' } }), payment(12_000)], odooOptions());
    expect([...bytes.slice(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(text).not.toContain('\r');
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain(',8300,"Logis, Frühstück 7 %",0.00,112.15,');
    expect(new TextDecoder().decode(bytes)).toBe(text);
  });
});

describe('External IDs and reference', () => {
  it('Revised file: revision 2 renders _r2 ids and (Korrektur 2), and revisionOf reads 2 back', () => {
    const rendered = renderOdooCsv(specDay(), odooOptions({ revision: 2 }));
    expect(rows(rendered.text)[0]).toMatch(/^apaleo_c1_BSP_20260914_r2,apaleo BSP 2026-09-14 \(Korrektur 2\),2026-09-14,APA,apaleo_c1_BSP_20260914_r2_0001,/);
    expect(revisionOf(rendered.bytes)).toBe(2);
    expect(revisionOf(renderOdooCsv(specDay(), odooOptions()).bytes)).toBe(1);
    expect(revisionOf(new TextEncoder().encode('a,b\nnot,ours\n'))).toBeUndefined();
  });

  it('writes no entry number, state or partner', () => {
    const { text } = renderOdooCsv(specDay(), odooOptions());
    const columns = text.split('\n')[0]?.split(',') ?? [];
    for (const column of ['name', 'state', 'partner_id', 'line_ids/partner_id']) expect(columns).not.toContain(column);
  });

  it('refuses a revision below 1', () => {
    expect(() => renderOdooCsv(specDay(), odooOptions({ revision: 0 }))).toThrow(RangeError);
  });
});

describe('Text sanitising', () => {
  it('Long label: 140 characters are cut to 128 with N-ODOO-TRUNCATED naming the day and the account', () => {
    const label = `Logis ${'x'.repeat(134)}`;
    const { entries, notes } = buildEntries([revenue({ credit: { account: '8300', label } }), revenue({ credit: { account: '8300', label } }), payment(24_000)], odooOptions());
    expect([...(entries[0]?.lines.find((line) => line.account === '8300')?.label ?? '')]).toHaveLength(128);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ code: 'N-ODOO-TRUNCATED' });
    expect(notes[0]?.message).toMatch(/^2026-09-14, account 8300: /);
  });

  it('removes control characters, collapses whitespace, trims and replaces an empty label by the account code', () => {
    expect(sanitiseLabel('  Logis\t7 %\r\n\u0007 Zimmer  ', '2026-09-14', '8300').value).toBe('Logis 7 % Zimmer');
    expect(sanitiseLabel(' \u0000 ', '2026-09-14', '8300').value).toBe('8300');
    expect(sanitiseLabel('Getränke', '2026-09-14', '8400').value).toBe('Getränke');
  });

  it('nets labels that differ only in whitespace', () => {
    const { entries } = buildEntries([revenue({ credit: { account: '8300', label: 'Logis  7 %' } }), revenue(), payment(24_000)], odooOptions());
    expect(entries[0]?.lines.filter((line) => line.account === '8300')).toHaveLength(1);
  });
});

describe('Deterministic file name and content', () => {
  it('Same input, same bytes', () => {
    const bookings = [...specDay(), drinks({ grossCents: 1_190, vat: vat('tax_ust_19_skr03', 19, 190) }), payment(1_190)];
    expect(renderOdooCsv(bookings, odooOptions()).bytes).toEqual(renderOdooCsv([...bookings].reverse(), odooOptions()).bytes);
  });

  it('File name: BSP for September 2026 is ODOO_Buchungen_20260901-20260930_BSP.csv', () => {
    expect(odooCsvFileName(odooOptions())).toBe('ODOO_Buchungen_20260901-20260930_BSP.csv');
    expect(odooCsvFileName(odooOptions(), 'BSP_DEMO')).toBe('ODOO_Buchungen_20260901-20260930_BSP_DEMO.csv');
    expect(() => odooCsvFileName(odooOptions({ propertyId: 'B S P' }))).toThrow(OdooValidationError);
  });

  it('orders lines by account code with numbers compared as numbers, then tax and label, rounding lines last', () => {
    const line = (account: string, taxRef?: string, label = 'x') => ({ account, label, ...(taxRef !== undefined && { taxRef }) });
    const sorted = [line('10000'), line('8300', 'b'), line('8300', 'a'), line('8300'), line('1360', undefined, 'b'), line('1360', undefined, 'a'), line('A1'), line('8300.1')].sort(compareLines);
    expect(sorted.map((l) => `${l.account}/${l.taxRef ?? ''}/${l.label}`)).toEqual(['1360//a', '1360//b', '8300//x', '8300/a/x', '8300/b/x', '8300.1//x', '10000//x', 'A1//x']);
    const breakfast = revenue({ credit: { account: '8300', label: 'Frühstück 7 %' }, grossCents: 9_500, vat: vat('tax_ust_7_skr03', 7, 621) });
    const { entries } = buildEntries([breakfast, drinks(), payment(11_880)], odooOptions());
    expect(entries[0]?.lines.map((l) => l.kind)).toEqual(['booking', 'booking', 'booking', 'rounding-companion']);
  });
});
