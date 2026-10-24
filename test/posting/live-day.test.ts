import { describe, expect, it } from 'vitest';
import { ChartIndex } from '../../src/core/chart.js';
import { sumDecimals } from '../../src/core/money.js';
import { kennzahl, renderOdooCsv } from '../../src/odoo/index.js';
import { buildBookings } from '../../src/posting/index.js';
import { LIVE_DAY, loadLiveData } from '../helpers/apaleo.js';
import { berMapping, vieMapping } from '../helpers/live-mapping.js';
import { odooOptions } from '../helpers/odoo.js';

/**
 * The recorded business day 2026-10-21 (test/fixtures/apaleo/live/README.md) of
 * BER (German rates) posted with the committed Odoo live mapping
 * mapping-BER.odoo.csv (what `init-mapping --template skr03-hotel` writes for
 * Odoo 18), and of VIE (Austrian rates) with the hand-made mapping-VIE.odoo.csv
 * (l10n_at taxes). Hand-checked BER totals (apaleo's tax rounded per line):
 *
 * Revenue 7 % (8300): logis 114 + 124 − 10 + 114.02 + 84 = 426.02, breakfast 46.80
 *   + 38.40 = 85.20, no-show 60 = 571.22; tax 7.46 + 8.11 − 0.65 + 7.46 + 5.50 + 3.06
 *   + 2.51 + 3.93 = 37.38 (precise 37.3695327), net 533.84.
 * Revenue 19 % (8400): drinks 14.90 + 19.98 + 12.50 = 47.38; tax 2.38 + 3.19 + 2.00 =
 *   7.57 (precise 7.56487395), net 39.81. Revenue 0 % (8200, the cancellation fee): 45.00.
 * Deposits at 7 % (1711): 104 + 124 + 228.04 + 84 − 124 − 114.02 − 84 = 218.02, tax
 *   6.80 + 8.11 + 14.92 + 5.50 − 8.11 − 7.46 − 5.50 = 14.26; at 19 % (1718): 39.96 −
 *   19.98 = 19.98, tax 3.19; at 0 % (1719): 10 parked and 10 refunded.
 * Deposits received 104 + 124 + 228.04 + 39.96 + 84 + 10 = 590.00; released 124 +
 *   114.02 + 19.98 + 84 + 10 = 352.00, of it refunded 10.00.
 * Payments: Kasse 1001 = 50 + 61.70 = 111.70; Geldtransit 1360 = 675.90.
 * Accounts receivable 1401: 114.00. Skipped: the six /Offset second lines, 331.60.
 * Odoo's VAT (per_line, one entry): 7 % 51.62 against apaleo 51.64 on revenue and
 *   deposits, 19 % 10.75 against 10.76, with a rounding cent at each rate.
 */
const data = await loadLiveData();
const day = (property: 'BER' | 'VIE') => (data.ledger[property] ?? []).filter((line) => line.businessDate === LIVE_DAY);
const post = (property: 'BER' | 'VIE') =>
  buildBookings(day(property), property === 'BER' ? berMapping() : vieMapping(), new ChartIndex(data.charts[property] ?? []), { text2: 'receipt', version: 18 });

describe('posting the recorded BER day 2026-10-21', () => {
  const lines = day('BER');
  const result = post('BER');

  it('Every line traceable: books 29 of the 35 lines, each with its source entry, and skips the six /Offset second lines', () => {
    expect(lines).toHaveLength(35);
    expect(result.bookings).toHaveLength(29);
    expect(result.bookings.every((b) => b.sourceEntryNumbers.length === 1)).toBe(true);
    const booked = result.bookings.flatMap((b) => b.sourceEntryNumbers);
    const skipped = result.skipped.map((s) => s.line.sourceEntryNumber);
    expect([...booked, ...skipped].sort()).toEqual(lines.map((line) => line.sourceEntryNumber).sort());
    expect(result.findings).toEqual([]);
  });

  it('Offset lines of payments: every <folio>_Receivables → /Offset and <res>_AccountsReceivable → /Offset line is SAME_ACCOUNT', () => {
    const offsets = lines.filter((line) => line.credit.number.endsWith('/Offset') && line.debit.type === line.credit.type);
    expect(offsets).toHaveLength(6);
    expect(result.skipped.map((s) => [s.reason, s.line])).toEqual(offsets.map((line) => ['SAME_ACCOUNT', line]));
    expect(result.summary.skipped).toEqual([{ reason: 'SAME_ACCOUNT', lines: 6, grossCents: 33_160 }]);
  });

  it('Summary of the recorded BER day: revenue, apaleo VAT, deposits, payments and one entry, as hand-checked', () => {
    const { summary } = result;
    expect(summary.revenueByRate).toEqual([
      { tax: '', ratePercent: 0, netCents: 4_500, vatCents: 0, grossCents: 4_500, apaleoVat: '0' },
      { tax: 'tax_ust_7_skr03', ratePercent: 7, netCents: 53_384, vatCents: 3_738, grossCents: 57_122, apaleoVat: '37.3695327' },
      { tax: 'tax_ust_19_skr03', ratePercent: 19, netCents: 3_981, vatCents: 757, grossCents: 4_738, apaleoVat: '7.56487395' },
    ]);
    expect(summary.depositVatByRate).toEqual([
      { tax: '', ratePercent: 0, netCents: 0, vatCents: 0, grossCents: 0, apaleoVat: '0' },
      { tax: 'tax_ust_7_skr03', ratePercent: 7, netCents: 20_376, vatCents: 1_426, grossCents: 21_802, apaleoVat: '14.26299065' },
      { tax: 'tax_ust_19_skr03', ratePercent: 19, netCents: 1_679, vatCents: 319, grossCents: 1_998, apaleoVat: '3.19008404' },
    ]);
    expect(summary.deposits).toEqual({ receivedCents: 59_000, releasedCents: 35_200, refundedCents: 1_000 });
    expect(summary.payments).toEqual([
      { account: '1001', cents: 11_170 },
      { account: '1360', cents: 67_590 },
    ]);
    expect(summary.accountsReceivableCents).toBe(11_400);
    expect([kennzahl(7), kennzahl(19)]).toEqual(['Kz 86', 'Kz 81']);
    const rendered = renderOdooCsv(result.bookings, odooOptions({ from: LIVE_DAY, to: LIVE_DAY, propertyId: 'BER' }));
    expect(rendered.entries).toHaveLength(1);
    expect(rendered.taxTotals.map((t) => [t.taxRef, t.odooTaxCents, t.apaleoTaxCents])).toEqual([
      ['tax_ust_19_skr03', 1_075, 1_076],
      ['tax_ust_7_skr03', 5_162, 5_164],
    ]);
    expect(rendered.roundingLines).toBe(2);
  });

  it('adds up the precise 7 % revenue taxes exactly: 37.3695327, against 37.38 rounded per line', () => {
    const taxes = lines.filter((line) => line.credit.type === 'Revenues').flatMap((line) => line.taxes.filter((tax) => tax.percent === 7));
    expect(sumDecimals(taxes.map((tax) => tax.amountPrecise))).toBe('37.3695327');
    expect(taxes.reduce((sum, tax) => sum + tax.amountCents, 0)).toBe(3_738);
  });

  it('writes German labels without an English apaleo name or a guest name', () => {
    const labels = result.bookings.flatMap((b) => [b.debit.label, b.credit.label]);
    for (const word of ['Revenues', 'Payment', 'Liabilities', 'Receivables', 'Credit Card']) expect(labels.filter((label) => label.includes(word)), word).toEqual([]);
    expect(new Set(labels)).toEqual(
      new Set(['Zahlung bar', 'Zahlung Amex', 'Zahlung Girocard', 'Zahlung Mastercard', 'Zahlung Visa', 'Zahlung Visa Debit', 'Gästeforderungen', 'Forderungen Firmenrechnungen',
        'Anzahlungen 7 %', 'Anzahlungen 19 %', 'Anzahlungen ohne USt', 'Erlöse Beherbergung 7 %', 'Erlöse Speisen 7 %', 'Erlöse No-Show 7 %', 'Erlöse Getränke 19 %', 'Erlöse ohne USt']),
    );
  });

  it('books the release 000000025 on the refund side of 1711 with apaleo\'s tax 8.11', () => {
    expect(result.bookings.find((b) => b.sourceEntryNumbers[0] === '000000025')).toMatchObject({
      debit: { account: '1711' },
      credit: { account: '1410' },
      grossCents: 12_400,
      vat: { side: 'debit', taxRef: 'tax_ust_7_skr03', percent: 7, apaleoTaxCents: 811 },
    });
  });
});

describe('posting the recorded VIE day 2026-10-21 with the hand-made Austrian mapping', () => {
  const result = post('VIE');

  it('Every line traceable: books 29 of the 35 lines and skips 6, without a finding', () => {
    expect(day('VIE')).toHaveLength(35);
    expect(result.bookings).toHaveLength(29);
    expect(result.skipped).toHaveLength(6);
    expect(result.findings).toEqual([]);
  });

  it('carries the l10n_at taxes and the hand-checked revenue per rate', () => {
    expect(result.summary.revenueByRate).toEqual([
      { tax: '', ratePercent: 0, netCents: 4_500, vatCents: 0, grossCents: 4_500, apaleoVat: '0' },
      { tax: 'account_tax_template_sales_10_code029', ratePercent: 10, netCents: 7_746, vatCents: 774, grossCents: 8_520, apaleoVat: '7.74545454' },
      { tax: 'account_tax_template_sales_13_code006', ratePercent: 13, netCents: 36_285, vatCents: 4_717, grossCents: 41_002, apaleoVat: '47.17044248' },
      { tax: 'account_tax_template_sales_20_code022', ratePercent: 20, netCents: 3_949, vatCents: 789, grossCents: 4_738, apaleoVat: '7.89666666' },
    ]);
    expect(result.summary.deposits).toEqual({ receivedCents: 49_100, releasedCents: 29_500, refundedCents: 1_000 });
  });
});
