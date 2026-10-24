import { describe, expect, it } from 'vitest';
import { buildEntries, fitBase, largestRemainder, odooTax, OdooValidationError, taxOnBase, vatComparison } from '../../src/odoo/index.js';
import type { OdooEntry, OdooLine } from '../../src/odoo/index.js';
import { DAY, depositRefund, odooOptions, payment, revenue, vat } from '../helpers/odoo.js';

const brief = (line: OdooLine) => [line.account, line.amountCents, line.taxRef ?? '', line.label];
const onlyEntry = (entries: OdooEntry[]): OdooEntry => {
  expect(entries).toHaveLength(1);
  return entries[0] as OdooEntry;
};

describe('Base fitting', () => {
  it('Gross reached exactly: lodging 120.00 at 7 % keeps the base 112.15, tax 7.85, no cent and no finding', () => {
    expect(fitBase(12_000, 11_215, 7)).toEqual({ baseCents: 11_215, exact: true });
    const { entries, notes } = buildEntries([revenue(), payment(12_000)], odooOptions());
    expect(onlyEntry(entries).lines.map(brief)).toEqual([
      ['1360', 12_000, '', 'Zahlung Visa'],
      ['8300', -11_215, 'tax_ust_7_skr03', 'Logis 7 %'],
    ]);
    expect(notes).toEqual([]);
  });

  it('Gross not reachable per line: breakfast 95.00 at 7 % gets the base 88.78 and a 0.01 companion line with the same account and tax', () => {
    expect(taxOnBase(8_878, 7) + 8_878).toBe(9_499);
    expect(taxOnBase(8_879, 7) + 8_879).toBe(9_501);
    expect(fitBase(9_500, 8_879, 7)).toEqual({ baseCents: 8_878, exact: false });

    const breakfast = revenue({ credit: { account: '8300', label: 'Frühstück 7 %' }, grossCents: 9_500, vat: vat('tax_ust_7_skr03', 7, 621) });
    const { entries, notes } = buildEntries([breakfast, payment(9_500)], odooOptions());
    const entry = onlyEntry(entries);
    expect(entry.lines.map(brief)).toEqual([
      ['1360', 9_500, '', 'Zahlung Visa'],
      ['8300', -8_878, 'tax_ust_7_skr03', 'Frühstück 7 %'],
      ['8300', -1, 'tax_ust_7_skr03', 'Frühstück 7 % (Rundungsausgleich)'],
    ]);
    expect(entry.lines.at(-1)?.kind).toBe('rounding-companion');
    const [tax] = odooTax(entry.lines, 'per_line');
    expect(tax?.taxCents).toBe(621);
    expect(8_878 + 1 + 621).toBe(9_500);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ code: 'N-ODOO-ROUNDING-LINE', value: '8300' });
    expect(notes[0]?.message).toMatch(/^2026-09-14, account 8300, 7 %: .*95\.00/);
  });

  it('Per tax shifts one cent of VAT: lodging 120.00 and 95.00 on 8300 become one line of 200.93 with Odoo tax 14.07 against apaleo 14.06', () => {
    const bookings = [revenue(), revenue({ grossCents: 9_500, vat: vat('tax_ust_7_skr03', 7, 621) }), payment(21_500)];
    const options = odooOptions({ taxRounding: 'per_tax', roundingAccount: '2700' });
    const { entries, notes } = buildEntries(bookings, options);
    const entry = onlyEntry(entries);
    expect(entry.lines.map(brief)).toEqual([
      ['1360', 21_500, '', 'Zahlung Visa'],
      ['8300', -20_093, 'tax_ust_7_skr03', 'Logis 7 %'],
    ]);
    expect(odooTax(entry.lines, 'per_tax')[0]?.taxCents).toBe(1_407);
    expect(notes).toEqual([]);
    expect(vatComparison(entry, 'per_tax')).toEqual([{ date: DAY, percent: 7, odooTaxCents: 1_407, apaleoTaxCents: 1_406, differenceCents: 1 }]);
  });

  it('Gross not reachable per tax: 100.04 at 7 % gets the base 93.49 and an untaxed 0.01 line on the rounding account 2700', () => {
    const bookings = [revenue({ grossCents: 10_004, vat: vat('tax_ust_7_skr03', 7, 654) }), payment(10_004)];
    const { entries, notes } = buildEntries(bookings, odooOptions({ taxRounding: 'per_tax', roundingAccount: '2700' }));
    const entry = onlyEntry(entries);
    expect(entry.lines.map(brief)).toEqual([
      ['1360', 10_004, '', 'Zahlung Visa'],
      ['8300', -9_349, 'tax_ust_7_skr03', 'Logis 7 %'],
      ['2700', -1, '', 'Rundungsausgleich USt 7 %'],
    ]);
    expect(entry.lines.at(-1)).toMatchObject({ kind: 'rounding-account', roundsGroup: 'tax_ust_7_skr03|credit' });
    expect(odooTax(entry.lines, 'per_tax')[0]?.taxCents).toBe(654);
    expect(notes.map((note) => note.code)).toEqual(['N-ODOO-ROUNDING-LINE']);
    expect(notes[0]?.message).toContain('account 2700, 7 %');
  });

  it('Refund side: a deposit refund of 23.80 at 19 % debits 1718 with 20.00 and credits 1360 with 23.80', () => {
    const { entries } = buildEntries([depositRefund()], odooOptions());
    const entry = onlyEntry(entries);
    expect(entry.lines.map(brief)).toEqual([
      ['1360', -2_380, '', 'Rückzahlung Anzahlung'],
      ['1718', 2_000, 'tax_ust_19_skr03', 'Anzahlungen 19 %'],
    ]);
    expect(entry.groups.map(({ key, side }) => [key, side])).toEqual([['tax_ust_19_skr03|debit', 'debit']]);
    expect(odooTax(entry.lines, 'per_line')).toEqual([expect.objectContaining({ side: 'debit', taxCents: 380 })]);
  });

  it('Per tax distributes a group over several accounts by apaleo nets with the largest-remainder method', () => {
    const bookings = [
      revenue({ grossCents: 10_000, vat: vat('tax_ust_7_skr03', 7, 654) }),
      revenue({ credit: { account: '8310', label: 'Logis 7 % Gruppen' }, grossCents: 10_000, vat: vat('tax_ust_7_skr03', 7, 654) }),
      payment(20_000),
    ];
    const { entries } = buildEntries(bookings, odooOptions({ taxRounding: 'per_tax', roundingAccount: '2700' }));
    const entry = onlyEntry(entries);
    // 200.00 at 7 %: base 186.92 (+ 13.08 = 200.00), split 93.46 / 93.46.
    expect(entry.lines.map(brief)).toEqual([
      ['1360', 20_000, '', 'Zahlung Visa'],
      ['8300', -9_346, 'tax_ust_7_skr03', 'Logis 7 %'],
      ['8310', -9_346, 'tax_ust_7_skr03', 'Logis 7 % Gruppen'],
    ]);
  });

  it('largest remainder gives the leftover cents to the largest remainders, ties to the first', () => {
    expect(largestRemainder(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(largestRemainder(10, [1, 2])).toEqual([3, 7]);
    expect(largestRemainder(7, [0, 0], [1, 1])).toEqual([4, 3]);
    expect(largestRemainder(5, [0, 0], [0, 0])).toEqual([5, 0]);
    expect(largestRemainder(99_999_999_999, [99_999_999_999, 1])).toEqual([99_999_999_998, 1]);
  });

  it('Rounding account missing: a per-tax group that cannot be fitted raises E-ODOO-ROUNDING-ACCOUNT with the day and the rate', () => {
    const bookings = [revenue({ grossCents: 10_004, vat: vat('tax_ust_7_skr03', 7, 654) }), payment(10_004)];
    const error = (() => {
      try {
        buildEntries(bookings, odooOptions({ taxRounding: 'per_tax' }));
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(OdooValidationError);
    const [finding] = (error as OdooValidationError).findings;
    expect(finding?.code).toBe('E-ODOO-ROUNDING-ACCOUNT');
    expect(finding?.message).toMatch(/^2026-09-14, 7 % .*docs\/configuration\.md/);
  });

  it('prefers the base nearest to apaleo net, and searches around the exact net when apaleo net has drifted', () => {
    expect(fitBase(0, 0, 7)).toEqual({ baseCents: 0, exact: true });
    expect(fitBase(1, 1, 19)).toEqual({ baseCents: 1, exact: true });
    // A netted line of many bookings: apaleo net 10 cents away from the exact net of 1070.00 at 7 %.
    expect(fitBase(107_000, 99_990, 7)).toEqual({ baseCents: 100_000, exact: true });
    expect(fitBase(5_000, 5_000, 0)).toEqual({ baseCents: 5_000, exact: true });
  });
});

describe('Base fitting over every gross from 0.01 to 2,000.00 (property test)', () => {
  for (const percent of [7, 19]) {
    it(`${percent} %: every fitted line and group balances, and Odoo's tax moves by at most one cent per line plus one`, () => {
      const hundredths = percent * 100;
      const failures: string[] = [];
      let rounded = 0;
      for (let gross = 1; gross <= 200_000; gross++) {
        const apaleoTax = Math.round((gross * hundredths) / (10_000 + hundredths));
        const { baseCents, exact } = fitBase(gross, gross - apaleoTax, percent);
        const cent = exact ? 0 : 1;
        // per line: the companion line's own tax rounds to 0.00; per tax: one group, the cent on the rounding account.
        const perLineTax = taxOnBase(baseCents, percent) + taxOnBase(cent, percent);
        const perTaxTax = taxOnBase(baseCents, percent);
        if (baseCents + cent + perLineTax !== gross || Math.abs(perLineTax - apaleoTax) > 2) failures.push(`per_line ${gross}`);
        if (baseCents + cent + perTaxTax !== gross || Math.abs(perTaxTax - apaleoTax) > 2) failures.push(`per_tax ${gross}`);
        if (!exact) rounded++;
      }
      expect(failures.slice(0, 5)).toEqual([]);
      // About r / (100 + r) of the gross values have no exact base: 6.5 % at 7 %, 16 % at 19 %.
      expect(rounded / 200_000).toBeCloseTo(percent / (100 + percent), 2);
    });
  }
});
