import { describe, expect, it } from 'vitest';
import { ChartIndex } from '../../src/core/chart.js';
import type { AccountRef } from '../../src/core/source.js';
import { lineRate, resolve } from '../../src/mapping/index.js';
import { loadBeispielData, BSP } from '../helpers/apaleo.js';
import { ledgerLine, tax } from '../helpers/ledger.js';
import { mappingOf, mappingRow } from '../helpers/mapping.js';

const ref = (number: string, type: string, parentNumber?: string): AccountRef => ({
  number,
  name: number,
  type,
  ...(parentNumber ? { parentNumber } : {}),
});

const ACC10 = 'RevenueAccommodation_VeryReduced:10.00';
const mapping = mappingOf([
  mappingRow({ apaleoAccount: ACC10, apaleoType: 'Revenues', abacusAccount: '3400', mwstCode: 'V10', mwstPercent: '10' }),
  mappingRow({ apaleoAccount: 'RevenueAccommodation', apaleoType: 'Revenues', abacusAccount: '3401', mwstCode: 'V20', mwstPercent: '20' }),
  mappingRow({ apaleoAccount: '1200', apaleoType: 'Receivables', abacusAccount: '1101' }),
  mappingRow({ apaleoAccount: '1102', apaleoType: '*any*', abacusAccount: '1091' }),
  mappingRow({ apaleoAccount: '*', apaleoType: 'Receivables', abacusAccount: '1109' }),
  mappingRow({ apaleoAccount: '*', apaleoType: 'Payments', abacusAccount: '1090' }),
  mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '10', abacusAccount: '2030', mwstCode: 'V10', mwstPercent: '10' }),
  mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '20', abacusAccount: '2031', mwstCode: 'V20', mwstPercent: '20' }),
  mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '0', abacusAccount: '2039' }),
  mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes' }),
]);

const abacus = (account: AccountRef, rate: number | undefined = 0, chart?: ChartIndex) =>
  resolve(mapping, account, { rate, ...(chart ? { chart } : {}) })?.abacusAccount;

describe('resolution order', () => {
  it('(1) takes the exact number and type first', () => {
    expect(abacus(ref(ACC10, 'Revenues', '5000'))).toBe('3400');
  });

  it('(2) then the number with any type', () => {
    expect(abacus(ref('1102', 'Payments'))).toBe('1091');
  });

  it('(3) then the parent chain from the chart, with the same type', async () => {
    const chart = new ChartIndex((await loadBeispielData()).charts[BSP] ?? []);
    const acc20 = 'RevenueAccommodation_Normal:20.00';
    expect(abacus(ref(acc20, 'Revenues'), 20, chart)).toBe('3401');
    // The chart wins over the line: the line names 5000, the chart RevenueAccommodation.
    expect(abacus(ref(acc20, 'Revenues', '5000'), 20, chart)).toBe('3401');
    expect(abacus(ref(acc20, 'Payments', 'RevenueAccommodation'))).toBe('1090');
  });

  it('resolves a per-reservation account with a parent to the parent row', () => {
    expect(abacus(ref('BSP-EXT-1_Receivables', 'Receivables', '1200'))).toBe('1101');
  });

  it('(4) uses the rate wildcard for VAT-relevant types', () => {
    expect(abacus(ref('BSP-ABCDEF-1_Liabilities', 'Liabilities'), 10)).toBe('2030');
    expect(abacus(ref('BSP-ABCDEF-1_Liabilities', 'Liabilities'), 20)).toBe('2031');
    expect(abacus(ref('BSP-ABCDEF-1_Liabilities', 'Liabilities'), 0)).toBe('2039');
    expect(abacus(ref('BSP-ABCDEF-1_Liabilities', 'Liabilities'), 13)).toBeUndefined();
    expect(resolve(mapping, ref('BSP-ABCDEF-1_Liabilities', 'Liabilities'), { rate: undefined })).toBeUndefined();
  });

  it('(5) uses the plain wildcard for other types: a new payment method account', () => {
    expect(abacus(ref('1106', 'Payments', '1000'))).toBe('1090');
  });

  it('never wildcards a revenue account', () => {
    expect(abacus(ref('RevenueOther_Normal:20.00', 'Revenues'), 20)).toBeUndefined();
  });

  it('returns a row with an empty Abacus account as it is (unmapped)', () => {
    expect(resolve(mapping, ref('3501', 'CityTaxes'), { rate: 0 })).toMatchObject({ abacusAccount: '', line: 11 });
  });

  it('stops on a parent cycle', () => {
    const chart = new ChartIndex([
      { number: 'A', name: 'A', type: 'House', parentNumber: 'B', ledger: 'global', isArchived: false, hasChildren: true },
      { number: 'B', name: 'B', type: 'House', parentNumber: 'A', ledger: 'global', isArchived: false, hasChildren: true },
    ]);
    expect(abacus(ref('A', 'House'), 0, chart)).toBeUndefined();
  });
});

describe('empty parent rows', () => {
  /** A file with the empty `3000;Liabilities` row a Treuhänder might keep, and the deposit wildcards. */
  const v1 = mappingOf([
    mappingRow({ apaleoAccount: 'RevenueNoShow_Reduced:13.00', apaleoType: 'Revenues', apaleoVatPercent: '13' }),
    mappingRow({ apaleoAccount: '3000', apaleoType: 'Liabilities', apaleoName: 'Liabilities' }),
    mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '10', abacusAccount: '2030', mwstCode: 'V10', mwstPercent: '10' }),
    mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '20', abacusAccount: '2031', mwstCode: 'V20', mwstPercent: '20' }),
    mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '0', abacusAccount: '2039', mwstPercent: '0' }),
    mappingRow({ apaleoAccount: '9999', apaleoType: 'AccountsReceivable' }),
  ]);
  const at = (account: AccountRef, rate: number) => resolve(v1, account, { rate });

  it.each([
    ['EPEBVUIU-1_Liabilities/VeryReduced:10.00', 10, '2030'],
    ['MXETGHPM-1_Liabilities/Normal:20.00', 20, '2031'],
    ['EPEBVUIU-1_Liabilities/Null:0.00', 0, '2039'],
  ])('passes over the empty 3000 row: %s at %d %% resolves to %s', (number, rate, account) => {
    expect(at(ref(number, 'Liabilities', '3000'), rate)?.abacusAccount).toBe(account);
  });

  it('resolves the Austrian deposits of the recorded VIE day through the 13 % and 20 % wildcards', () => {
    const austrian = mappingOf([
      ...v1.rows,
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '13', abacusAccount: '2033', mwstCode: 'V13', mwstPercent: '13' }),
    ]);
    const deposit = (number: string, rate: number) => resolve(austrian, ref(number, 'Liabilities', '3000'), { rate })?.abacusAccount;
    expect(deposit('DHNEKKIT-1_Liabilities/Reduced:13.00', 13)).toBe('2033');
    expect(deposit('DHNEKKIT-1_Liabilities/Normal:20.00', 20)).toBe('2031');
  });

  it('returns the empty parent row when no wildcard gives an account, so findings can name it', () => {
    expect(at(ref('X-1_Liabilities/Reduced:13.00', 'Liabilities', '3000'), 13)).toMatchObject({ apaleoAccount: '3000', abacusAccount: '', line: 3 });
    expect(at(ref('ZAQSEFYC-1_AccountsReceivable', 'AccountsReceivable', '9999'), 0)).toMatchObject({ apaleoAccount: '9999', line: 7 });
  });

  it('keeps an exact row with an empty Abacus account unmapped', () => {
    expect(at(ref('RevenueNoShow_Reduced:13.00', 'Revenues', 'RevenueNoShow'), 13)).toMatchObject({ abacusAccount: '', line: 2 });
  });

  it('resolves per-reservation debtor accounts and their /Offset through the AccountsReceivable wildcard', () => {
    const withWildcard = mappingOf([...v1.rows.filter((row) => row.apaleoAccount !== '9999'), mappingRow({ apaleoAccount: '*', apaleoType: 'AccountsReceivable', abacusAccount: '1102' })]);
    for (const number of ['AHTJTGFK-1_AccountsReceivable', 'AHTJTGFK-1_AccountsReceivable/Offset']) {
      expect(resolve(withWildcard, ref(number, 'AccountsReceivable', '9999'), { rate: 0 })?.abacusAccount).toBe('1102');
    }
  });
});

describe('per-reservation accounts without a parent (Swagger shape)', () => {
  it('resolves the debit to the Receivables wildcard and the credit to the 10 % Liabilities wildcard', () => {
    const line = ledgerLine({
      debit: { number: 'BSP-ABCDEF-1_Receivables', name: 'Receivables', type: 'Receivables' },
      credit: { number: 'BSP-ABCDEF-1_Liabilities', name: 'Liabilities', type: 'Liabilities' },
      taxes: [tax('VeryReduced', 10, 2000)],
    });
    const rate = lineRate(line);
    expect(rate).toBe(10);
    expect(resolve(mapping, line.debit, { rate })?.abacusAccount).toBe('1109');
    expect(resolve(mapping, line.credit, { rate })?.abacusAccount).toBe('2030');
  });

  it('leaves a line with two different rates unmapped on the rate wildcard', () => {
    const line = ledgerLine({
      credit: { number: 'BSP-ABCDEF-1_Liabilities', name: 'Liabilities', type: 'Liabilities' },
      taxes: [
        tax('VeryReduced', 10, 100),
        tax('Normal', 20, 50),
      ],
    });
    expect(lineRate(line)).toBeUndefined();
    expect(resolve(mapping, line.credit, { rate: lineRate(line) })).toBeUndefined();
  });
});

describe('lineRate', () => {
  it('drops tax entries with percent 0 and amount 0 and gives 0 for a line without taxes', () => {
    expect(lineRate({ taxes: [tax('Without', 0, 0)] })).toBe(0);
    expect(lineRate({ taxes: [] })).toBe(0);
    expect(lineRate({ taxes: [tax('Without', 0, 0), tax('Normal', 20, 400)] })).toBe(20);
    expect(lineRate({ taxes: [tax('VeryReduced', 10, -100), tax('VeryReduced', 10, 10)] })).toBe(10);
  });
});
