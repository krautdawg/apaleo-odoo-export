import { describe, expect, it } from 'vitest';
import { buildBookings } from '../../src/posting/index.js';
import { renderOdooCsv } from '../../src/odoo/index.js';
import { odooOptions } from '../helpers/odoo.js';
import { BEISPIEL_CHART, BEISPIEL_MAPPING, LEDGER, OPTIONS } from '../helpers/posting.js';

/**
 * The Hotel Beispiel fixture period 2026-09-14 to 2026-09-22 (29 ledger lines,
 * see test/fixtures/apaleo/README.md), posted with the test mapping
 * (`odoo-beispiel.csv`: the Austrian rates 10 and 20 % of the fixtures with the
 * l10n_at taxes; the German month has its own fixtures). Totals computed by hand
 * (each booking carries the gross amount and apaleo's tax rounded per line):
 *
 * Revenue 10 % (account_tax_template_sales_10_code029): logis 98 + 98 + 220 + 165, allowance −11, food 13.20 + 13.20 +
 *   46.90 (Müller) = 643.30; tax 8.91 + 8.91 + 20 + 15 − 1 + 1.20 + 1.20 + 4.26 =
 *   58.48 (apaleo precise 58.48181818), net 584.82: 4010 528.18 Haben − 10 Soll,
 *   4020 66.64.
 * Revenue 20 % (4030, account_tax_template_sales_20_code022): coffee 3.60 + 3.60, drinks 24 + 14.80 =
 *   46.00; tax 0.60 + 0.60 + 4 + 2.47 = 7.67 (precise 7.66666667), net 38.33.
 * Kurtaxe (3600): 3.20 × 2 = 6.40.
 * Payments: 2890 = prepayments 220 + 165, cards 120 + 61.70, refund −10 = 556.70;
 *   Kassa 2700 = 24.00.
 * Deposits: 3510 received 220 + 165 = 385 and released 220 + 165 (negative
 *   charges); 3500 parked 10 and refunded 10 to the Maestro card: received
 *   395.00, released 395.00, of it refunded 10.00; deposit tax 20 + 15 − 20 − 15 = 0.
 * Forderungen 2010: 115.00.
 * 2000 Soll (the guest ledger): charges 142.00
 *   (09-14) + 179.70 (09-15) + 220 + 165 + the parked 10 = 716.70; Haben:
 *   allowance 11 + payments 120 + 24 + 61.70 + AR 115 + releases 220 + 165 = 716.70.
 * Skipped SAME_ACCOUNT (unsigned): the folio move 5.00 and the /Offset second
 *   lines of three payments and the AR transfer (120 + 24 + 61.70 + 115) = 325.70.
 *   29 − 5 = 24 bookings. No tax line is in the movement model, so the balances
 *   add up to apaleo's tax the bookings carry: 58.48 + 7.67 = 66.15.
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
        { account: '2000', sollCents: 71_670, habenCents: 71_670, balanceCents: 0 },
        { account: '2010', sollCents: 11_500, habenCents: 0, balanceCents: 11_500 },
        { account: '2700', sollCents: 2_400, habenCents: 0, balanceCents: 2_400 },
        { account: '2890', sollCents: 56_670, habenCents: 1_000, balanceCents: 55_670 },
        { account: '3500', sollCents: 1_000, habenCents: 1_000, balanceCents: 0 },
        { account: '3510', sollCents: 35_000, habenCents: 35_000, balanceCents: 0 },
        { account: '3600', sollCents: 0, habenCents: 640, balanceCents: -640 },
        { account: '4010', sollCents: 1_000, habenCents: 52_818, balanceCents: -51_818 },
        { account: '4020', sollCents: 0, habenCents: 6_664, balanceCents: -6_664 },
        { account: '4030', sollCents: 0, habenCents: 3_833, balanceCents: -3_833 },
      ],
      revenueByRate: [
        { tax: 'account_tax_template_sales_10_code029', ratePercent: 10, netCents: 58_482, vatCents: 5_848, grossCents: 64_330, apaleoVat: '58.48181818' },
        { tax: 'account_tax_template_sales_20_code022', ratePercent: 20, netCents: 3_833, vatCents: 767, grossCents: 4_600, apaleoVat: '7.66666667' },
      ],
      depositVatByRate: [
        { tax: '', ratePercent: 0, netCents: 0, vatCents: 0, grossCents: 0, apaleoVat: '0' },
        { tax: 'account_tax_template_sales_10_code029', ratePercent: 10, netCents: 0, vatCents: 0, grossCents: 0, apaleoVat: '0' },
      ],
      writeOffsByRate: [],
      cityTaxCents: 640,
      levies: [{ account: '3600', tax: '', ratePercent: 0, grossCents: 640, vatCents: 0 }],
      payments: [
        { account: '2700', cents: 2_400 },
        { account: '2890', cents: 55_670 },
      ],
      deposits: { receivedCents: 39_500, releasedCents: 39_500, refundedCents: 1_000 },
      accountsReceivableCents: 11_500,
      skipped: [{ reason: 'SAME_ACCOUNT', lines: 5, grossCents: 32_570 }],
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

  it('renders through the Odoo writer into one entry per business day with the l10n_at taxes', () => {
    const rendered = renderOdooCsv(result.bookings, odooOptions());
    expect(rendered.entries.map((entry) => entry.date)).toEqual(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-21', '2026-09-22']);
    expect(rendered.text).toContain(',2890,Zahlung Mastercard,');
    expect(rendered.text).toContain(',account.1_account_tax_template_sales_10_code029\n');
    expect(rendered.text).not.toContain('Müller');
  });
});
