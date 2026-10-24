import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { entryImbalance, renderOdooCsv, type OdooRenderOptions } from '../../src/odoo/index.js';
import { buildBookings } from '../../src/posting/index.js';
import { DE_CHART, DE_LEDGER, DE_MAPPING } from '../helpers/de-month.js';
import { describeUtf8Difference } from '../helpers/golden.js';
import { odooOptions } from '../helpers/odoo.js';

/**
 * The German fixture month (test/fixtures/apaleo/de-month/README.md, property
 * BSP, EUR, September 2026) posted with what `init-mapping --template skr03-hotel`
 * writes for Odoo 18. Hand-computed values (apaleo's tax rounded per line half
 * away from zero; Odoo's tax from the fitted base, rounded the same way):
 *
 * Revenue 7 % (8300, tax_ust_7_skr03): 120.00 + 95.00 + 107.00 + 107.00 + 100.04
 *   + 149.80 = 678.84; apaleo tax 7.85 + 6.21 + 7.00 + 7.00 + 6.54 + 9.80 = 44.40,
 *   precise 7.85046729 + 6.21495327 + 7 + 7 + 6.5446729 + 9.8 = 44.41009346; net 634.44.
 * Revenue 19 % (8400, tax_ust_19_skr03): 11.90 + 23.80 + 35.70 + 4.98 = 76.38; apaleo
 *   tax 1.90 + 3.80 + 5.70 + 0.80 = 12.20, precise 12.19512605; net 64.18.
 * Revenue 0 % (8200, no tax): 80.00.
 * Deposits at 7 % (1711): received 321.00 (tax 21.00), released 214.00 (tax 14.00)
 *   and refunded 107.00 (tax 7.00), so 0.00 at the end of the month.
 * Payments: Kasse 1001 = 250.70; Geldtransit 1360 = 321.00 − 107.00 + 100.04 + 80.00
 *   + 4.98 = 399.02. Accounts receivable 1401: 185.50.
 * Skipped: the five /Offset second lines, 250.70 + 100.04 + 80.00 + 185.50 + 4.98 =
 *   621.22 unsigned. 24 − 5 = 19 bookings.
 * Odoo's VAT, per_line: 7 % 44.40 (bases 112.15, 88.78 + 0.01, 200.00, 93.49 + 0.01,
 *   140.00, deposit 300.00 − 300.00), 19 % 12.19 (4.98 → 4.18 + 0.01 gives 0.79, one
 *   cent below apaleo); three rounding lines. per_tax: 7 % 44.41 (09-10: 200.93 base,
 *   14.07 against apaleo 14.06), 19 % 12.19; two rounding lines on 2700.
 */
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const result = buildBookings(DE_LEDGER, DE_MAPPING, DE_CHART, { text2: 'receipt', version: 18 });
const PER_LINE = odooOptions();
const PER_TAX = odooOptions({ taxRounding: 'per_tax', roundingAccount: '2700' });

describe('the German fixture month', () => {
  it('Totals of the German month: revenue, apaleo VAT, deposits, payments and balances per Odoo account equal the hand-computed constants', () => {
    expect(DE_LEDGER).toHaveLength(24);
    expect(result.findings).toEqual([]);
    expect(result.bookings).toHaveLength(19);
    const { summary } = result;
    expect(summary.revenueByRate).toEqual([
      { tax: '', ratePercent: 0, netCents: 8_000, vatCents: 0, grossCents: 8_000, apaleoVat: '0' },
      { tax: 'tax_ust_7_skr03', ratePercent: 7, netCents: 63_444, vatCents: 4_440, grossCents: 67_884, apaleoVat: '44.41009346' },
      { tax: 'tax_ust_19_skr03', ratePercent: 19, netCents: 6_418, vatCents: 1_220, grossCents: 7_638, apaleoVat: '12.19512605' },
    ]);
    expect(summary.depositVatByRate).toEqual([{ tax: 'tax_ust_7_skr03', ratePercent: 7, netCents: 0, vatCents: 0, grossCents: 0, apaleoVat: '0' }]);
    expect(summary.deposits).toEqual({ receivedCents: 32_100, releasedCents: 32_100, refundedCents: 10_700 });
    expect(summary.payments).toEqual([
      { account: '1001', cents: 25_070 },
      { account: '1360', cents: 39_902 },
    ]);
    expect(summary.accountsReceivableCents).toBe(18_550);
    expect(summary.skipped).toEqual([{ reason: 'SAME_ACCOUNT', lines: 5, grossCents: 62_122 }]);
    expect(summary.accounts.map((a) => [a.account, a.balanceCents])).toEqual([
      ['1001', 25_070],
      ['1360', 39_902],
      ['1401', 18_550],
      ['1410', 0],
      ['1711', 0],
      ['8200', -8_000],
      ['8300', -63_444],
      ['8400', -6_418],
    ]);
  });

  it('carries account.1_tax_ust_7_skr03 or account.1_tax_ust_19_skr03 on every taxed line of the file', () => {
    const { entries } = renderOdooCsv(result.bookings, PER_LINE);
    const taxes = new Set(entries.flatMap((entry) => entry.lines.flatMap((line) => (line.taxRef === undefined ? [] : [line.taxRef]))));
    expect([...taxes].sort()).toEqual(['tax_ust_19_skr03', 'tax_ust_7_skr03']);
    const text = renderOdooCsv(result.bookings, PER_LINE).text;
    expect(text.match(/,account\.1_tax_ust_(7|19)_skr03\n/g)).toHaveLength(14);
    expect(text).not.toContain('Müller');
  });

  it('models Odoo\'s VAT per tax and rounding method against apaleo\'s', () => {
    const perLine = renderOdooCsv(result.bookings, PER_LINE);
    expect(perLine.taxTotals).toEqual([
      { taxRef: 'tax_ust_19_skr03', percent: 19, baseCents: 6_419, odooTaxCents: 1_219, apaleoTaxCents: 1_220 },
      { taxRef: 'tax_ust_7_skr03', percent: 7, baseCents: 63_444, odooTaxCents: 4_440, apaleoTaxCents: 4_440 },
    ]);
    expect(perLine.roundingLines).toBe(3);
    const perTax = renderOdooCsv(result.bookings, PER_TAX);
    expect(perTax.taxTotals).toEqual([
      { taxRef: 'tax_ust_19_skr03', percent: 19, baseCents: 6_418, odooTaxCents: 1_219, apaleoTaxCents: 1_220 },
      { taxRef: 'tax_ust_7_skr03', percent: 7, baseCents: 63_442, odooTaxCents: 4_441, apaleoTaxCents: 4_440 },
    ]);
    expect(perTax.roundingLines).toBe(2);
    expect(perTax.vat.filter((row) => row.differenceCents !== 0)).toEqual([
      { date: '2026-09-10', percent: 7, odooTaxCents: 1_407, apaleoTaxCents: 1_406, differenceCents: 1 },
      { date: '2026-09-28', percent: 19, odooTaxCents: 79, apaleoTaxCents: 80, differenceCents: -1 },
    ]);
  });

  it('nets every entry line to the hand-computed amounts (per_line)', () => {
    const { entries } = renderOdooCsv(result.bookings, PER_LINE);
    const lines = (date: string) => entries.find((entry) => entry.date === date)?.lines.map((line) => [line.account, line.label, line.amountCents]);
    expect(entries.map((entry) => entry.date)).toEqual(['2026-09-03', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-14', '2026-09-17', '2026-09-18', '2026-09-28']);
    expect(lines('2026-09-10')).toEqual([
      ['1410', 'Gästeforderungen', 25_070],
      ['8300', 'Erlöse Beherbergung 7 %', -11_215],
      ['8300', 'Erlöse Speisen 7 %', -8_878],
      ['8400', 'Erlöse Getränke 19 %', -1_000],
      ['8400', 'Erlöse sonstige 19 %', -2_000],
      ['8300', 'Erlöse Speisen 7 % (Rundungsausgleich)', -1],
    ]);
    expect(lines('2026-09-12')).toEqual([
      ['1360', 'Zahlung Visa', -10_700],
      ['1711', 'Anzahlungen 7 %', 30_000],
      ['8300', 'Erlöse Beherbergung 7 %', -20_000],
    ]);
    expect(lines('2026-09-18')).toEqual([
      ['1401', 'Forderungen Firmenrechnungen', 18_550],
      ['8300', 'Erlöse Beherbergung 7 %', -14_000],
      ['8400', 'Erlöse Getränke 19 %', -3_000],
    ]);
  });

  it.each([
    ['de-month.per-line.csv', PER_LINE],
    ['de-month.per-tax.csv', PER_TAX],
  ] as [string, OdooRenderOptions][])('Golden files of the German month: %s equals the rendered file, and every entry balances with the modelled tax', (name, options) => {
    const rendered = renderOdooCsv(result.bookings, options);
    const file = new URL(`../golden/odoo/${name}`, import.meta.url);
    if (UPDATE) writeFileSync(file, rendered.bytes);
    const difference = describeUtf8Difference(readFileSync(file), rendered.bytes);
    expect(difference, `test/golden/odoo/${name} differs:\n${difference}`).toBeUndefined();
    for (const entry of rendered.entries) expect(entryImbalance(entry.lines, options.taxRounding), entry.date).toBe(0);
  });
});
