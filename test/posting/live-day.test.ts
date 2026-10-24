import { describe, expect, it } from 'vitest';
import { ChartIndex } from '../../src/core/chart.js';
import { sumDecimals } from '../../src/core/money.js';
import { buildBookings } from '../../src/posting/index.js';
import { LIVE_DAY, loadLiveData } from '../helpers/apaleo.js';
import { vieMapping } from '../helpers/live-mapping.js';

/**
 * The recorded VIE business day 2026-10-21 (test/fixtures/apaleo/live/README.md)
 * posted with the committed Abacus live mapping (mapping-VIE.abacus.csv, the
 * Austrian rates with the placeholder codes V10, V13 and V20).
 * Hand-checked totals (Abacus gets the gross amount and apaleo's tax):
 *
 * Revenue 10 % (3200, V10): 38.40 + 46.80 = 85.20; tax 3.49 + 4.25 = 7.74, apaleo
 *   precise 7.74545454 (7.75 rounded once).
 * Revenue 13 % (3410, V13): 65 + 95.02 + 60 (no-show) + 105 − 10 + 95 = 410.02; tax
 *   7.48 + 10.93 + 6.90 + 12.08 − 1.15 + 10.93 = 47.17 (precise 47.17044248).
 * Revenue 20 % (3100, V20): 12.50 + 19.98 + 14.90 = 47.38; tax 2.08 + 3.33 + 2.48 =
 *   7.89 (precise 7.89666666, 7.90 rounded once). Revenue 0 % (3680, the cancellation fee): 45.00.
 * Deposits at 13 % (2033): 83 + 65 + 188.04 + 105 − 65 − 95.02 − 105 = 176.02,
 *   tax 20.25; at 20 % (2031): 39.96 − 19.98 = 19.98, tax 3.33.
 * Deposits received 83 + 65 + 39.96 + 188.04 + 105 + 10 (parked at 0 %) = 491.00;
 *   released 65 + 19.98 + 95.02 + 105 + 10 (refund to Maestro) = 295.00, of it
 *   refunded 10.00.
 * Payments: Kasse 1000 = 50 + 61.70 = 111.70; 1090 = 83 + 45 + 65 + 39.96 + 188.04
 *   + 60 + 0.90 + 105 − 10 = 576.90.
 * Accounts receivable: 95.00 Soll on the Debitoren 1102.
 * Skipped: the six /Offset second lines, 45 + 50 + 60 + 0.90 + 95 + 61.70 =
 *   312.60 unsigned. 35 − 6 = 29 bookings.
 * No W-VAT-ROUNDING: Abacus checks the MWST contained in the gross amount, and every
 *   apaleo tax of the day is that value rounded (000000031: 46.80 × 10 / 110 = 4.2545 → 4.25).
 */
const data = await loadLiveData();
const lines = (data.ledger.VIE ?? []).filter((line) => line.businessDate === LIVE_DAY);
const chart = new ChartIndex(data.charts.VIE ?? []);
const result = buildBookings(lines, vieMapping(), chart, { text2: 'receipt' });

describe('posting the recorded VIE day 2026-10-21', () => {
  it('Every line traceable: books 29 of the 35 lines, each with its source entry, and skips the six /Offset second lines', () => {
    expect(lines).toHaveLength(35);
    expect(result.bookings).toHaveLength(29);
    expect(result.bookings.every((b) => b.sourceEntryNumbers.length === 1)).toBe(true);
    const booked = result.bookings.flatMap((b) => b.sourceEntryNumbers);
    const skipped = result.skipped.map((s) => s.line.sourceEntryNumber);
    expect([...booked, ...skipped].sort()).toEqual(lines.map((line) => line.sourceEntryNumber).sort());
  });

  it('Offset lines of payments: 6 SAME_ACCOUNT lines with an unsigned gross total of 312.60', () => {
    expect(result.summary.skipped).toEqual([{ reason: 'SAME_ACCOUNT', lines: 6, grossCents: 31_260 }]);
  });

  it('raises no finding: the placeholder codes are known to the mapping, and the inclusive check matches every tax', () => {
    expect(result.findings).toEqual([]);
    expect(result.bookings.find((b) => b.sourceEntryNumbers[0] === '000000031')).toMatchObject({
      collectiveAccount: '1101',
      singleAccount: '3200',
      debitCredit: 'D',
      grossCents: 4_680,
      tax: { mwstCode: 'V10', percent: 10, taxCents: -425 },
    });
  });

  it('adds up the precise 10 % taxes exactly: 7.74545454, against 7.74 rounded per line', () => {
    const taxes = lines.filter((line) => line.credit.type === 'Revenues').flatMap((line) => line.taxes.filter((tax) => tax.percent === 10));
    expect(sumDecimals(taxes.map((tax) => tax.amountPrecise))).toBe('7.74545454');
    expect(taxes.reduce((sum, tax) => sum + tax.amountCents, 0)).toBe(774);
  });

  it('Summary of the recorded VIE day: matches the hand-checked totals', () => {
    const { summary } = result;
    expect(summary.revenueByRate).toEqual([
      { mwstCode: '', ratePercent: 0, netCents: 4_500, vatCents: 0, grossCents: 4_500, apaleoVat: '0' },
      { mwstCode: 'V10', ratePercent: 10, netCents: 7_746, vatCents: 774, grossCents: 8_520, apaleoVat: '7.74545454' },
      { mwstCode: 'V13', ratePercent: 13, netCents: 36_285, vatCents: 4_717, grossCents: 41_002, apaleoVat: '47.17044248' },
      { mwstCode: 'V20', ratePercent: 20, netCents: 3_949, vatCents: 789, grossCents: 4_738, apaleoVat: '7.89666666' },
    ]);
    expect(summary.depositVatByRate).toEqual([
      { mwstCode: '', ratePercent: 0, netCents: 0, vatCents: 0, grossCents: 0, apaleoVat: '0' },
      { mwstCode: 'V13', ratePercent: 13, netCents: 15_577, vatCents: 2_025, grossCents: 17_602, apaleoVat: '20.2500885' },
      { mwstCode: 'V20', ratePercent: 20, netCents: 1_665, vatCents: 333, grossCents: 1_998, apaleoVat: '3.33' },
    ]);
    expect(summary.payments).toEqual([
      { account: '1000', cents: 11_170 },
      { account: '1090', cents: 57_690 },
    ]);
    expect(summary.deposits).toEqual({ receivedCents: 49_100, releasedCents: 29_500, refundedCents: 1_000 });
    expect(summary.accountsReceivableCents).toBe(9_500);
    expect(summary.accounts.find((account) => account.account === '1102')).toEqual({ account: '1102', sollCents: 9_500, habenCents: 0, balanceCents: 9_500 });
    expect(summary.roundingCents).toBe(0);
    expect(summary.accounts.find((account) => account.account === '3680')).toEqual({ account: '3680', sollCents: 0, habenCents: 4_500, balanceCents: -4_500 });
    expect(summary.accounts.find((account) => account.account === '3600')).toBeUndefined();
  });

  it('writes no Text1 with an English apaleo name or a guest name', () => {
    const texts = result.bookings.map((b) => b.text1);
    expect(texts).not.toContain('');
    for (const word of ['Revenues', 'Payment', 'Liabilities', 'Receivables', 'Credit Card']) {
      expect(texts.filter((text) => text.includes(word)), word).toEqual([]);
    }
    expect(texts).toEqual(expect.arrayContaining(['Erlös Beherbergung 13 %', 'Auflösung Anzahlung 13 %', 'Rückzahlung Anzahlung 0 %', 'Zahlung Visa Debit', 'Forderung an Debitor', 'Anzahlung 20 %']));
  });

  it('books the release 000000025 with the deposit account as Single account, C and a positive tax', () => {
    expect(result.bookings.find((b) => b.sourceEntryNumbers[0] === '000000025')).toMatchObject({
      collectiveAccount: '1101',
      singleAccount: '2033',
      debitCredit: 'C',
      grossCents: 10_500,
      tax: { mwstCode: 'V13', percent: 13, taxCents: 1_208 },
    });
  });
});
