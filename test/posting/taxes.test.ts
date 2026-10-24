import { describe, expect, it } from 'vitest';
import { normaliseTaxes, taxFromGross } from '../../src/posting/index.js';
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
    [1_003, 8.1, 75], // 8124.3 / 108.1 = 75.15… → 0.75
    [12_000, 7, 785], // 84000 / 107 = 785.04… → 7.85
    [9_500, 7, 621], // 66500 / 107 = 621.49… → 6.21
    [498, 19, 80], // 9462 / 119 = 79.51… → 0.80
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

describe('VAT guard on apaleo precise tax', () => {
  it.each([
    // 120.00 at 7 %: apaleo 7.85046729 → 7.85.
    ['accommodation 120.00 at 7 %', ACCOUNTS.accommodation7, 12_000, tax('Reduced', 7, 785, '7.85046729')],
    // 14.90 at 19 %: apaleo 2.3789916 → 2.38.
    ['drinks 14.90 at 19 %', ACCOUNTS.food19, 1_490, tax('Normal', 19, 238, '2.3789916')],
    // A negative allowance: −120.00, apaleo −7.85046729 → −7.85.
    ['a negative allowance of 120.00 at 7 %', ACCOUNTS.accommodation7, -12_000, tax('Reduced', 7, -785, '-7.85046729')],
  ])('raises no finding for %s: sub-cent digits never count, the booking carries the tax rounded to cents', (_name, credit, grossCents, entry) => {
    const result = post([ledgerLine({ credit, grossCents, netCents: grossCents - entry.amountCents, taxes: [entry] })]);
    expect(result.findings).toEqual([]);
    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0]?.vat?.apaleoTaxCents).toBe(Math.abs(entry.amountCents));
  });
});
