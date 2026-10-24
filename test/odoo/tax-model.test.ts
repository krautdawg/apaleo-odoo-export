import { describe, expect, it } from 'vitest';
import { entryImbalance, odooTax, roundHalfAwayFromZero, taxOnBase } from '../../src/odoo/index.js';

const at7 = (amountCents: number) => ({ taxRef: 'tax_ust_7_skr03', percent: 7, amountCents });

describe("Model of Odoo's tax computation", () => {
  it('Per line: a group at 7 % with the base lines 112.15 and 88.79 has the tax 7.85 + 6.22 = 14.07', () => {
    expect(odooTax([at7(-11_215), at7(-8_879)], 'per_line')).toEqual([{ key: 'tax_ust_7_skr03|credit', taxRef: 'tax_ust_7_skr03', percent: 7, side: 'credit', taxCents: 1_407 }]);
    expect(taxOnBase(11_215, 7)).toBe(785);
    expect(taxOnBase(8_879, 7)).toBe(622);
  });

  it('Per tax: the same group has the tax round(0.07 × 200.94) = 14.07', () => {
    expect(odooTax([at7(-11_215), at7(-8_879)], 'per_tax')[0]?.taxCents).toBe(1_407);
  });

  it('Half away from zero: a base line of 93.50 at 7 % has the tax 6.55 (6.545 rounded away from zero)', () => {
    expect(taxOnBase(9_350, 7)).toBe(655);
    expect(odooTax([at7(-9_350)], 'per_line')[0]?.taxCents).toBe(655);
    expect(odooTax([at7(9_350)], 'per_tax')[0]?.taxCents).toBe(655);
  });

  it('per line and per tax differ when the rounding of several lines adds up', () => {
    // 0.07 × 0.50 = 0.035 → 0.04 per line, three lines 0.12; per tax 0.07 × 1.50 = 0.105 → 0.11.
    const lines = [at7(-50), at7(-50), at7(-50)];
    expect(odooTax(lines, 'per_line')[0]?.taxCents).toBe(12);
    expect(odooTax(lines, 'per_tax')[0]?.taxCents).toBe(11);
  });

  it('groups by tax and side: a credit is the invoice side, a debit the refund side', () => {
    const groups = odooTax([at7(-11_215), at7(1_869), { taxRef: 'tax_ust_19_skr03', percent: 19, amountCents: -2_000 }], 'per_tax');
    expect(groups.map(({ key, taxCents }) => [key, taxCents])).toEqual([
      ['tax_ust_7_skr03|credit', 785],
      ['tax_ust_7_skr03|debit', 131],
      ['tax_ust_19_skr03|credit', 380],
    ]);
  });

  it('ignores lines without tax and treats the line amount as the base', () => {
    expect(odooTax([{ amountCents: 14_380 }, { amountCents: -100 }], 'per_line')).toEqual([]);
    expect(odooTax([{ taxRef: 'x', percent: 0, amountCents: -1_000 }], 'per_line')[0]?.taxCents).toBe(0);
  });

  it('the imbalance of an entry counts the invoice tax as a credit and the refund tax as a debit', () => {
    expect(entryImbalance([at7(-11_215), { amountCents: 12_000 }], 'per_line')).toBe(0);
    expect(entryImbalance([at7(1_869), { amountCents: -2_000 }], 'per_line')).toBe(0);
    expect(entryImbalance([at7(-11_216), { amountCents: 12_000 }], 'per_line')).toBe(-1);
  });

  it('rounds half away from zero in whole numbers, also for negative values', () => {
    expect(roundHalfAwayFromZero(65_450_000, 10_000)).toBe(6_545);
    expect(roundHalfAwayFromZero(6_545, 10)).toBe(655);
    expect(roundHalfAwayFromZero(-6_545, 10)).toBe(-655);
    expect(roundHalfAwayFromZero(6_544, 10)).toBe(654);
    // The largest amount stays exact: 999,999,999.99 at 19 %.
    expect(taxOnBase(99_999_999_999, 19)).toBe(19_000_000_000);
  });
});
