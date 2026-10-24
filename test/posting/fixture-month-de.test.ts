import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { entryImbalance, renderOdooCsv, type OdooRenderOptions } from '../../src/odoo/index.js';
import { buildBookings } from '../../src/posting/index.js';
import { DE_CHART, DE_LEDGER, DE_MAPPING, DE_MAPPING_BYTES, DE_MAPPING_FILE } from '../helpers/de-month.js';
import { describeUtf8Difference } from '../helpers/golden.js';
import { odooOptions } from '../helpers/odoo.js';

/**
 * The German fixture month (test/fixtures/apaleo/de-month/README.md, property
 * BSP, EUR, September 2026) posted with `test/fixtures/mapping/skr03-de-month.csv`:
 * what `init-mapping --template skr03-hotel` writes for Odoo 18, with the Kurtaxe
 * (3501) on 1590 without tax and the Übernachtungsteuer (3502) on 8300 with
 * tax_ust_7_skr03, as the Kanzlei decided. Hand-computed values (apaleo's tax
 * rounded per line half away from zero; Odoo's tax from the fitted base, rounded
 * the same way):
 *
 * Revenue 7 % (8300, tax_ust_7_skr03): 120.00 + 95.00 + 107.00 + 107.00 + 100.04
 *   + 149.80 + the no-show fee 107.00 = 785.84; apaleo tax 7.85 + 6.21 + 7.00 + 7.00
 *   + 6.54 + 9.80 + 7.00 = 51.40, precise 7.85046729 + 6.21495327 + 7 + 7 + 6.5446729
 *   + 9.8 + 7 = 51.41009346; net 734.44.
 * Revenue 19 % (8400, tax_ust_19_skr03): 11.90 + 23.80 + 35.70 + 4.98 + 119.00 =
 *   195.38; apaleo tax 1.90 + 3.80 + 5.70 + 0.80 + 19.00 = 31.20, precise 31.19512605;
 *   net 164.18.
 * Revenue 0 % (8200, no tax): 80.00 + the cancellation fee 80.00 = 160.00.
 * Levies: Kurtaxe 5.00 on 1590 without tax; Übernachtungsteuer 10.70 on 8300 with
 *   tax 0.70 at 7 % (Kz 86); apaleo city tax 15.70.
 * Deposits at 7 % (1711): received 321.00 (tax 21.00), released 321.00 (tax 21.00),
 *   of it refunded 107.00 (tax 7.00). At 0 % (1719): the overpayment 10.00 parked,
 *   released and refunded. Totals: received 331.00, released 331.00, refunded 117.00.
 * Write-offs: 7 % (2401) 107.00, net 100.00, tax 7.00; 19 % (2406) 119.00, net
 *   100.00, tax 19.00; 0 % (2400) 30.00 without tax. They lower Kz 86 by 100.00 and
 *   Kz 81 by 100.00, and the VAT by 7.00 and 19.00.
 * Payments: Kasse 1001 = 250.70 + 50.00 = 300.70; Geldtransit 1360 = 321.00 − 107.00
 *   + 100.04 + 80.00 + 4.98 + 25.70 − 10.00 = 414.72. Accounts receivable 1401: 185.50.
 * Skipped: the seven /Offset second lines, 250.70 + 100.04 + 80.00 + 185.50 + 4.98
 *   + 25.70 + 50.00 = 696.92 unsigned. 38 − 7 = 31 bookings.
 * Balances add up to apaleo's VAT the bookings carry: 51.40 + 0.70 + 31.20 − 7.00 −
 *   19.00 = 57.30.
 * Odoo's VAT, per_line: 7 % 45.10 (44.40 of o03 + 0.70 + 7.00 − 7.00; base 634.44 +
 *   10.00 + 100.00 − 100.00 = 644.44), 19 % 12.19 (12.19 + 19.00 − 19.00; base 64.19),
 *   one cent below apaleo's 12.20 from 4.98; three rounding lines. per_tax: 7 % 45.11
 *   (09-10: 200.93 base, 14.07 against apaleo 14.06), 19 % 12.19; two rounding lines
 *   on 2700. The new amounts are chosen so that their tax is exact.
 */
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const result = buildBookings(DE_LEDGER, DE_MAPPING, DE_CHART, { text2: 'receipt', version: 18 });
const PER_LINE = odooOptions();
const PER_TAX = odooOptions({ taxRounding: 'per_tax', roundingAccount: '2700' });

describe('the German fixture month', () => {
  it('holds the SKR03 template mapping with the Kurtaxe and the Übernachtungsteuer filled in as the Kanzlei decided', () => {
    if (UPDATE) writeFileSync(DE_MAPPING_FILE, DE_MAPPING_BYTES);
    const difference = describeUtf8Difference(readFileSync(DE_MAPPING_FILE), DE_MAPPING_BYTES);
    expect(difference, `test/fixtures/mapping/skr03-de-month.csv differs:\n${difference}`).toBeUndefined();
    const row = (number: string) => DE_MAPPING.rows.find((r) => r.apaleoAccount === number);
    expect(row('3501')).toMatchObject({ apaleoType: 'CityTaxes', odooAccount: '1590', odooTax: '', taxPercent: '' });
    expect(row('3502')).toMatchObject({ apaleoType: 'CityTaxes', odooAccount: '8300', odooTax: 'tax_ust_7_skr03', taxPercent: '7' });
  });

  it('Totals with special cases: revenue, levies, deposits, write-offs, payments and balances per Odoo account equal the hand-computed constants', () => {
    expect(DE_LEDGER).toHaveLength(38);
    expect(result.findings).toEqual([]);
    expect(result.bookings).toHaveLength(31);
    const { summary } = result;
    expect(summary.revenueByRate).toEqual([
      { tax: '', ratePercent: 0, netCents: 16_000, vatCents: 0, grossCents: 16_000, apaleoVat: '0' },
      { tax: 'tax_ust_7_skr03', ratePercent: 7, netCents: 73_444, vatCents: 5_140, grossCents: 78_584, apaleoVat: '51.41009346' },
      { tax: 'tax_ust_19_skr03', ratePercent: 19, netCents: 16_418, vatCents: 3_120, grossCents: 19_538, apaleoVat: '31.19512605' },
    ]);
    expect(summary.levies).toEqual([
      { account: '1590', tax: '', ratePercent: 0, grossCents: 500, vatCents: 0, apaleoVat: '0' },
      { account: '8300', tax: 'tax_ust_7_skr03', ratePercent: 7, grossCents: 1_070, vatCents: 70, apaleoVat: '0.7' },
    ]);
    expect(summary.cityTaxCents).toBe(1_570);
    expect(summary.depositVatByRate).toEqual([
      { tax: '', ratePercent: 0, netCents: 0, vatCents: 0, grossCents: 0, apaleoVat: '0' },
      { tax: 'tax_ust_7_skr03', ratePercent: 7, netCents: 0, vatCents: 0, grossCents: 0, apaleoVat: '0' },
    ]);
    expect(summary.deposits).toEqual({ receivedCents: 33_100, releasedCents: 33_100, refundedCents: 11_700 });
    expect(summary.depositsByRate).toEqual([
      { tax: '', ratePercent: 0, received: { grossCents: 1_000, vatCents: 0 }, released: { grossCents: 1_000, vatCents: 0 }, refunded: { grossCents: 1_000, vatCents: 0 } },
      {
        tax: 'tax_ust_7_skr03',
        ratePercent: 7,
        received: { grossCents: 32_100, vatCents: 2_100 },
        released: { grossCents: 32_100, vatCents: 2_100 },
        refunded: { grossCents: 10_700, vatCents: 700 },
      },
    ]);
    expect(summary.writeOffsByRate).toEqual([
      { tax: '', ratePercent: 0, netCents: 3_000, vatCents: 0, grossCents: 3_000, apaleoVat: '0' },
      { tax: 'tax_ust_7_skr03', ratePercent: 7, netCents: 10_000, vatCents: 700, grossCents: 10_700, apaleoVat: '7' },
      { tax: 'tax_ust_19_skr03', ratePercent: 19, netCents: 10_000, vatCents: 1_900, grossCents: 11_900, apaleoVat: '19' },
    ]);
    expect(summary.payments).toEqual([
      { account: '1001', cents: 30_070 },
      { account: '1360', cents: 41_472 },
    ]);
    expect(summary.accountsReceivableCents).toBe(18_550);
    expect(summary.skipped).toEqual([{ reason: 'SAME_ACCOUNT', lines: 7, grossCents: 69_692 }]);
    expect(summary.accounts.map((a) => [a.account, a.balanceCents])).toEqual([
      ['1001', 30_070],
      ['1360', 41_472],
      ['1401', 18_550],
      ['1410', 0],
      ['1590', -500],
      ['1711', 0],
      ['1719', 0],
      ['2400', 3_000],
      ['2401', 10_000],
      ['2406', 10_000],
      ['8200', -16_000],
      ['8300', -74_444],
      ['8400', -16_418],
    ]);
    expect(summary.accounts.reduce((sum, account) => sum + account.balanceCents, 0)).toBe(5_140 + 70 + 3_120 - 700 - 1_900);
  });

  it('carries account.1_tax_ust_7_skr03 or account.1_tax_ust_19_skr03 on every taxed line of the file', () => {
    const { entries, text } = renderOdooCsv(result.bookings, PER_LINE);
    const taxes = new Set(entries.flatMap((entry) => entry.lines.flatMap((line) => (line.taxRef === undefined ? [] : [line.taxRef]))));
    expect([...taxes].sort()).toEqual(['tax_ust_19_skr03', 'tax_ust_7_skr03']);
    expect(text.match(/,account\.1_tax_ust_(7|19)_skr03\n/g)).toHaveLength(19);
    expect(text).not.toContain('Müller');
  });

  it("models Odoo's VAT per tax and rounding method against apaleo's", () => {
    const perLine = renderOdooCsv(result.bookings, PER_LINE);
    expect(perLine.taxTotals).toEqual([
      { taxRef: 'tax_ust_19_skr03', percent: 19, baseCents: 6_419, odooTaxCents: 1_219, apaleoTaxCents: 1_220 },
      { taxRef: 'tax_ust_7_skr03', percent: 7, baseCents: 64_444, odooTaxCents: 4_510, apaleoTaxCents: 4_510 },
    ]);
    expect(perLine.roundingLines).toBe(3);
    const perTax = renderOdooCsv(result.bookings, PER_TAX);
    expect(perTax.taxTotals).toEqual([
      { taxRef: 'tax_ust_19_skr03', percent: 19, baseCents: 6_418, odooTaxCents: 1_219, apaleoTaxCents: 1_220 },
      { taxRef: 'tax_ust_7_skr03', percent: 7, baseCents: 64_442, odooTaxCents: 4_511, apaleoTaxCents: 4_510 },
    ]);
    expect(perTax.roundingLines).toBe(2);
    expect(perTax.vat.filter((row) => row.differenceCents !== 0)).toEqual([
      { date: '2026-09-10', percent: 7, odooTaxCents: 1_407, apaleoTaxCents: 1_406, differenceCents: 1 },
      { date: '2026-09-28', percent: 19, odooTaxCents: 79, apaleoTaxCents: 80, differenceCents: -1 },
    ]);
  });

  it('nets every entry line to the hand-computed amounts (per_line)', () => {
    const { entries } = renderOdooCsv(result.bookings, PER_LINE);
    const lines = (date: string) => entries.find((entry) => entry.date === date)?.lines.map((line) => [line.account, line.label, line.amountCents, line.taxRef]);
    expect(entries.map((entry) => entry.date)).toEqual([
      '2026-09-03', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-14', '2026-09-17', '2026-09-18', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-28', '2026-09-30',
    ]);
    expect(lines('2026-09-10')).toEqual([
      ['1410', 'Gästeforderungen', 25_070, undefined],
      ['8300', 'Erlöse Beherbergung 7 %', -11_215, 'tax_ust_7_skr03'],
      ['8300', 'Erlöse Speisen 7 %', -8_878, 'tax_ust_7_skr03'],
      ['8400', 'Erlöse Getränke 19 %', -1_000, 'tax_ust_19_skr03'],
      ['8400', 'Erlöse sonstige 19 %', -2_000, 'tax_ust_19_skr03'],
      ['8300', 'Erlöse Speisen 7 % (Rundungsausgleich)', -1, 'tax_ust_7_skr03'],
    ]);
    expect(lines('2026-09-12')).toEqual([
      ['1360', 'Zahlung Visa', -10_700, undefined],
      ['1711', 'Anzahlungen 7 %', 30_000, 'tax_ust_7_skr03'],
      ['8300', 'Erlöse Beherbergung 7 %', -20_000, 'tax_ust_7_skr03'],
    ]);
    expect(lines('2026-09-18')).toEqual([
      ['1401', 'Forderungen Firmenrechnungen', 18_550, undefined],
      ['8300', 'Erlöse Beherbergung 7 %', -14_000, 'tax_ust_7_skr03'],
      ['8400', 'Erlöse Getränke 19 %', -3_000, 'tax_ust_19_skr03'],
    ]);
    // Guest-owed Kurtaxe without tax, hotel-owed Übernachtungsteuer at 7 %, and the overpayment parked on the 0 % deposit; the folio nets to 0.
    expect(lines('2026-09-20')).toEqual([
      ['1360', 'Zahlung Visa', 2_570, undefined],
      ['1590', 'Kurtaxe', -500, undefined],
      ['1719', 'Anzahlungen ohne USt', -1_000, undefined],
      ['8300', 'Kurtaxe 7 %', -1_000, 'tax_ust_7_skr03'],
    ]);
    expect(lines('2026-09-21')).toEqual([
      ['1001', 'Zahlung bar', 5_000, undefined],
      ['1410', 'Gästeforderungen', 25_600, undefined],
      ['8200', 'Erlöse ohne USt', -8_000, undefined],
      ['8300', 'Erlöse No-Show 7 %', -10_000, 'tax_ust_7_skr03'],
      ['8400', 'Erlöse sonstige 19 %', -10_000, 'tax_ust_19_skr03'],
    ]);
    expect(lines('2026-09-22')).toEqual([
      ['1360', 'Zahlung Visa', -1_000, undefined],
      ['1719', 'Anzahlungen ohne USt', 1_000, undefined],
    ]);
    // Write-offs on the refund side: debit base lines with the sale tax lower the Kennzahl and the VAT (§ 17 UStG).
    expect(lines('2026-09-30')).toEqual([
      ['1410', 'Gästeforderungen', -25_600, undefined],
      ['2400', 'Forderungsverluste ohne USt', 3_000, undefined],
      ['2401', 'Forderungsverluste 7 %', 10_000, 'tax_ust_7_skr03'],
      ['2406', 'Forderungsverluste 19 %', 10_000, 'tax_ust_19_skr03'],
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
