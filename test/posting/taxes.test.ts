import { describe, expect, it } from 'vitest';
import { inclusiveCheckTax, normaliseTaxes, taxFromGross } from '../../src/posting/index.js';
import { ledgerLine, tax } from '../helpers/ledger.js';
import { ACCOUNTS, post } from '../helpers/posting.js';

describe('normaliseTaxes', () => {
  it('drops entries with percent 0 and amount 0 and keeps every other entry', () => {
    const without = tax('Without', 0, 0);
    const reduced = tax('VeryReduced', 10, 1_000);
    const oddZero = tax('Without', 0, 12);
    expect(normaliseTaxes([without])).toEqual([]);
    expect(normaliseTaxes([without, reduced, oddZero])).toEqual([reduced, oddZero]);
    expect(normaliseTaxes([tax('VeryReduced', 10, 0)])).toHaveLength(1);
  });
});

describe('taxFromGross', () => {
  it.each([
    // gross × rate / (100 + rate), rounded half away from zero
    [20_760, 3.8, 760], // 78888 / 103.8 = 760 exactly
    [10_810, 8.1, 810], // 87561 / 108.1 = 810 exactly
    [1_026, 2.6, 26], // 2667.6 / 102.6 = 26 exactly
    [1_003, 8.1, 75], // 8124.3 / 108.1 = 75.15… → 0.75, never rounded to 5 Rappen
    [11_000, 10, 1_000], // 110000 / 110 = 1000 exactly
    [9_800, 10, 891], // 98000 / 110 = 890.90… → 8.91
    [4_680, 10, 425], // 46800 / 110 = 425.45… → 4.25
    [2_400, 20, 400], // 48000 / 120 = 400 exactly
    [1_480, 20, 247], // 29600 / 120 = 246.66… → 2.47
    [10_500, 13, 1_208], // 136500 / 113 = 1207.96… → 12.08
    [-1_100, 10, -100], // sign of the gross amount
    [500, 0, 0],
    [1_049, 4.9, 49], // 5140.1 / 104.9 = 49.0 → 0.49
  ])('the tax in %i cents at %d %% is %i cents', (gross, rate, vat) => {
    expect(taxFromGross(gross, rate)).toBe(vat);
  });

  it('rounds an exact half cent away from zero, without floating-point noise', () => {
    expect(taxFromGross(1, 100)).toBe(1);
    expect(taxFromGross(3, 100)).toBe(2);
    expect(taxFromGross(-1, 100)).toBe(-1);
    expect(taxFromGross(-3, 100)).toBe(-2);
    expect(taxFromGross(1, 50)).toBe(0);
    expect(taxFromGross(235, 17.5)).toBe(35);
  });
});

describe('inclusiveCheckTax', () => {
  it.each([
    [20_760, 3.8, 760], // 207.60 × 3.8 / 103.8 = 7.60
    [4_680, 8.1, 351], // 46.80 × 8.1 / 108.1 = 3.5067 → 3.51
    [9_500, 3.8, 348], // 95.00 × 3.8 / 103.8 = 3.4778 → 3.48
    [-1_081, 8.1, 81], // unsigned
    [1_026, 2.6, 26], // 10.26 × 2.6 / 102.6 = 0.26
    [4_680, 10, 425], // VIE 000000031: 46.80 × 10 / 110 = 4.2545 → 4.25
  ])('checks a gross of %i Rappen at %d %% as %i Rappen', (gross, rate, check) => {
    expect(inclusiveCheckTax(gross, rate)).toBe(check);
  });
});

describe('VAT guard on apaleo precise tax', () => {
  it.each([
    // 98.00 at 3.8 %: apaleo 3.58766859 → 3.59, Abacus checks 98.00 × 3.8 / 103.8 = 3.5877 → 3.59.
    ['accommodation 98.00 at 3.8 %', ACCOUNTS.accommodation38, 9_800, tax('Special', 3.8, 359, '3.58766859')],
    // 14.80 at 8.1 %: apaleo 1.10897317 → 1.11, Abacus checks 1.109 → 1.11.
    ['drinks 14.80 at 8.1 %', ACCOUNTS.food81, 1_480, tax('Normal', 8.1, 111, '1.10897317')],
    // A negative allowance: −98.00, apaleo −3.58766859 → −3.59.
    ['a negative allowance of 98.00 at 3.8 %', ACCOUNTS.accommodation38, -9_800, tax('Special', 3.8, -359, '-3.58766859')],
  ])('raises no finding for %s: sub-Rappen digits never count', (_name, credit, grossCents, entry) => {
    const result = post([ledgerLine({ credit, grossCents, netCents: grossCents - entry.amountCents, taxes: [entry] })]);
    expect(result.findings).toEqual([]);
    expect(result.bookings).toHaveLength(1);
    expect(result.summary.roundingCents).toBe(0);
  });
});
