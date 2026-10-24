import { describe, expect, it } from 'vitest';
import { renderXmlBuchungen } from '../../src/abacus/index.js';
import { buildBookings } from '../../src/posting/index.js';
import { abacusOptions } from '../helpers/abacus.js';
import { BEISPIEL_CHART, BEISPIEL_MAPPING, LEDGER, OPTIONS } from '../helpers/posting.js';

/**
 * The Hotel Beispiel fixture period 2026-09-14 to 2026-09-22 (29 ledger lines,
 * see test/fixtures/apaleo/README.md), posted with the Abacus test mapping
 * (`abacus-beispiel.csv`: the Austrian rates 10 and 20 % of the fixtures with the
 * placeholder codes V10 and V20; the Swiss month follows with its own fixtures).
 * Totals computed by hand (Abacus gets the gross amount and apaleo's tax):
 *
 * Revenue 10 % (V10): logis 98 + 98 + 220 + 165, allowance −11, food 13.20 + 13.20 +
 *   46.90 (Müller) = 643.30; tax 8.91 + 8.91 + 20 + 15 − 1 + 1.20 + 1.20 + 4.26 =
 *   58.48 (apaleo precise 58.48181818), net 584.82: 3400 528.18 Haben − 10 Soll,
 *   3200 66.64.
 * Revenue 20 % (3100, V20, Kostenstelle 20): coffee 3.60 + 3.60, drinks 24 + 14.80 =
 *   46.00; tax 0.60 + 0.60 + 4 + 2.47 = 7.67 (precise 7.66666667), net 38.33.
 * Kurtaxe (2210): 3.20 × 2 = 6.40.
 * Payments: 1090 = prepayments 220 + 165, cards 120 + 61.70, refund −10 = 556.70;
 *   Kasse 1000 = 24.00.
 * Deposits: 2030 received 220 + 165 = 385 and released 220 + 165 (negative
 *   charges); 2039 parked 10 and refunded 10 to the Maestro card: received
 *   395.00, released 395.00, of it refunded 10.00; deposit tax 20 + 15 − 20 − 15 = 0.
 * Debitoren 1102: 115.00.
 * 1101 Soll (the gross amount as Collective or Single account): charges 142.00
 *   (09-14) + 179.70 (09-15) + 220 + 165 + the parked 10 = 716.70; Haben:
 *   allowance 11 + payments 120 + 24 + 61.70 + AR 115 + releases 220 + 165 = 716.70.
 * Skipped SAME_ACCOUNT (unsigned): the folio move 5.00 and the /Offset second
 *   lines of three payments and the AR transfer (120 + 24 + 61.70 + 115) = 325.70.
 *   29 − 5 = 24 bookings. No tax leg is in the movement model, so the balances
 *   add up to the tax Abacus books: 58.48 + 7.67 = 66.15.
 */
describe('posting the fixture month', () => {
  const result = buildBookings(LEDGER, BEISPIEL_MAPPING, BEISPIEL_CHART, OPTIONS);

  it('books 24 lines, skips 5 and raises no finding', () => {
    expect(LEDGER).toHaveLength(29);
    expect(result.bookings).toHaveLength(24);
    expect(result.skipped).toHaveLength(5);
    expect(result.findings).toEqual([]);
  });

  it('matches the hand-computed summary', () => {
    expect(result.summary).toEqual({
      accounts: [
        { account: '1000', sollCents: 2_400, habenCents: 0, balanceCents: 2_400 },
        { account: '1090', sollCents: 56_670, habenCents: 1_000, balanceCents: 55_670 },
        { account: '1101', sollCents: 71_670, habenCents: 71_670, balanceCents: 0 },
        { account: '1102', sollCents: 11_500, habenCents: 0, balanceCents: 11_500 },
        { account: '2030', sollCents: 35_000, habenCents: 35_000, balanceCents: 0 },
        { account: '2039', sollCents: 1_000, habenCents: 1_000, balanceCents: 0 },
        { account: '2210', sollCents: 0, habenCents: 640, balanceCents: -640 },
        { account: '3100', sollCents: 0, habenCents: 3_833, balanceCents: -3_833 },
        { account: '3200', sollCents: 0, habenCents: 6_664, balanceCents: -6_664 },
        { account: '3400', sollCents: 1_000, habenCents: 52_818, balanceCents: -51_818 },
      ],
      revenueByRate: [
        { mwstCode: 'V10', ratePercent: 10, netCents: 58_482, vatCents: 5_848, grossCents: 64_330, apaleoVat: '58.48181818' },
        { mwstCode: 'V20', ratePercent: 20, netCents: 3_833, vatCents: 767, grossCents: 4_600, apaleoVat: '7.66666667' },
      ],
      depositVatByRate: [
        { mwstCode: '', ratePercent: 0, netCents: 0, vatCents: 0, grossCents: 0, apaleoVat: '0' },
        { mwstCode: 'V10', ratePercent: 10, netCents: 0, vatCents: 0, grossCents: 0, apaleoVat: '0' },
      ],
      writeOffsByRate: [],
      cityTaxCents: 640,
      levies: [{ account: '2210', mwstCode: '', ratePercent: 0, grossCents: 640, vatCents: 0 }],
      payments: [
        { account: '1000', cents: 2_400 },
        { account: '1090', cents: 55_670 },
      ],
      deposits: { receivedCents: 39_500, releasedCents: 39_500, refundedCents: 1_000 },
      accountsReceivableCents: 11_500,
      skipped: [{ reason: 'SAME_ACCOUNT', lines: 5, grossCents: 32_570 }],
      roundingCents: 0,
      findings: [],
    });
    const balance = result.summary.accounts.reduce((sum, account) => sum + account.balanceCents, 0);
    expect(balance).toBe(5_848 + 767);
  });

  it('keeps every apaleo line traceable: booked or skipped', () => {
    const booked = result.bookings.flatMap((b) => b.sourceEntryNumbers);
    const skipped = result.skipped.map((s) => s.line.sourceEntryNumber);
    expect([...booked, ...skipped].sort()).toEqual(LEDGER.map((line) => line.sourceEntryNumber).sort());
  });

  it('never writes the guest name of the folio "Müller, Hans" into a booking', () => {
    expect(JSON.stringify(result.bookings)).not.toContain('Müller');
  });

  it('renders through the Abacus writer without validation errors or notes', () => {
    const rendered = renderXmlBuchungen(result.bookings, abacusOptions({ from: '2026-09-01', to: '2026-09-30', leitwaehrung: 'EUR' }));
    expect(rendered.text.match(/<Transaction /g)).toHaveLength(24);
    expect(rendered.notes).toEqual([]);
    expect(rendered.text).toContain('<Text1>Zahlung Mastercard</Text1>');
  });
});
