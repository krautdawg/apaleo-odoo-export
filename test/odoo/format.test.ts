import { describe, expect, it } from 'vitest';
import { CSV_HEADER, entryExternalId, entryRef, formatAmount, formatRate, kennzahl, lineExternalId, roundingAccountLabel, roundingMethodLabel, taxExternalId } from '../../src/odoo/index.js';
import { csvRow, formatYyyymmdd, quoteCsv, revisionOfEntryId } from '../../src/odoo/format.js';

const identity = { companyId: 1, propertyId: 'BSP', demo: false, revision: 1 };

describe('Odoo format helpers', () => {
  it('has the technical header of account.move with its line_ids, and no analytic column', () => {
    expect(CSV_HEADER.join(',')).toBe('id,ref,date,journal_id,line_ids/id,line_ids/account_id,line_ids/name,line_ids/debit,line_ids/credit,line_ids/tax_ids/id');
    expect(CSV_HEADER.join(',')).not.toMatch(/analytic|tax_tag/);
  });

  it('writes amounts unsigned with a point and two decimals, without thousands separator', () => {
    expect(formatAmount(14_380)).toBe('143.80');
    expect(formatAmount(1)).toBe('0.01');
    expect(formatAmount(0)).toBe('0.00');
    expect(formatAmount(-123_456_789)).toBe('1234567.89');
  });

  it('quotes a value with a comma, a quote, a line break or an outer space, doubling quotes inside', () => {
    expect(quoteCsv('Logis 7 %')).toBe('Logis 7 %');
    expect(quoteCsv('Zimmer, Frühstück')).toBe('"Zimmer, Frühstück"');
    expect(quoteCsv('Bar "Seeblick"')).toBe('"Bar ""Seeblick"""');
    expect(quoteCsv('a\nb')).toBe('"a\nb"');
    expect(quoteCsv(' x')).toBe('" x"');
    expect(quoteCsv('x ')).toBe('"x "');
    expect(quoteCsv('')).toBe('');
    expect(csvRow(['a', 'b,c', ''])).toBe('a,"b,c",\n');
  });

  it('Template tax id: tax_ust_7_skr03 with company 1 is account.1_tax_ust_7_skr03', () => {
    expect(taxExternalId('tax_ust_7_skr03', 1)).toBe('account.1_tax_ust_7_skr03');
    expect(taxExternalId('tax_ust_19_skr04', 3)).toBe('account.3_tax_ust_19_skr04');
  });

  it('Custom tax: an External ID with a module stays as written', () => {
    expect(taxExternalId('__import__.ust_7_hotel', 1)).toBe('__import__.ust_7_hotel');
  });

  it('Ids of a day: entry apaleo_c1_BSP_20260914, second line _0002, reference apaleo BSP 2026-09-14', () => {
    const id = entryExternalId(identity, '2026-09-14');
    expect(id).toBe('apaleo_c1_BSP_20260914');
    expect(lineExternalId(id, 1)).toBe('apaleo_c1_BSP_20260914_0002');
    expect(entryRef(identity, '2026-09-14')).toBe('apaleo BSP 2026-09-14');
  });

  it('Second company: company 3 gives apaleo_c3_BSP_20260914', () => {
    expect(entryExternalId({ ...identity, companyId: 3 }, '2026-09-14')).toBe('apaleo_c3_BSP_20260914');
  });

  it('Revised file: revision 2 adds _r2 to the ids and (Korrektur 2) to the reference', () => {
    const revised = { ...identity, revision: 2 };
    const id = entryExternalId(revised, '2026-09-14');
    expect(id).toBe('apaleo_c1_BSP_20260914_r2');
    expect(lineExternalId(id, 0)).toBe('apaleo_c1_BSP_20260914_r2_0001');
    expect(entryRef(revised, '2026-09-14')).toBe('apaleo BSP 2026-09-14 (Korrektur 2)');
  });

  it('Demo ids: apaleo_c1_BSP_DEMO_20260914 and the reference DEMO apaleo BSP 2026-09-14', () => {
    const demo = { ...identity, demo: true };
    expect(entryExternalId(demo, '2026-09-14')).toBe('apaleo_c1_BSP_DEMO_20260914');
    expect(entryRef(demo, '2026-09-14')).toBe('DEMO apaleo BSP 2026-09-14');
  });

  it('reads the revision back from an entry id, also with _ and - in the property id', () => {
    expect(revisionOfEntryId('apaleo_c1_BSP_20260914')).toBe(1);
    expect(revisionOfEntryId('apaleo_c1_BSP_20260914_r2')).toBe(2);
    expect(revisionOfEntryId('apaleo_c12_MY-HOTEL_2_DEMO_20260914_r15')).toBe(15);
    expect(revisionOfEntryId('id')).toBeUndefined();
    expect(revisionOfEntryId('apaleo_c1_BSP_2026091')).toBeUndefined();
  });

  it('names the Kennzahl per German rate, rates without trailing zeros and the rounding labels', () => {
    expect([kennzahl(19), kennzahl(7), kennzahl(0), kennzahl(10)]).toEqual(['Kz 81', 'Kz 86', undefined, undefined]);
    expect([formatRate(7), formatRate(7.5), formatRate(7.25, ','), formatRate(0)]).toEqual(['7', '7.5', '7,25', '0']);
    expect(roundingAccountLabel(7)).toBe('Rundungsausgleich USt 7 %');
    expect(roundingAccountLabel(5.5)).toBe('Rundungsausgleich USt 5,5 %');
    expect(roundingMethodLabel('per_line', 17)).toBe('Round per Line');
    expect(roundingMethodLabel('per_tax', 18)).toBe('Round Globally');
    expect(roundingMethodLabel('per_tax', 19)).toBe('Round per Tax');
    expect(formatYyyymmdd('2026-09-01')).toBe('20260901');
  });
});
