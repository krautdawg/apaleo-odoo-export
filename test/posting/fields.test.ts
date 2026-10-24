import { describe, expect, it } from 'vitest';
import { ChartIndex } from '../../src/core/chart.js';
import { paymentLabel, percentLabel, revenueLabel, sideLabel } from '../../src/posting/index.js';
import { ledgerLine } from '../helpers/ledger.js';
import { ACCOUNTS, CHART, charge, germanTax, post } from '../helpers/posting.js';

const payment = (overrides: Parameters<typeof ledgerLine>[0] = {}) =>
  ledgerLine({ debit: ACCOUNTS.visa, credit: ACCOUNTS.receivables, command: 'PostPayment', grossCents: 12_000, taxes: [], ...overrides });

describe('Field filling without personal data: labels', () => {
  it('Payment crediting a named guest folio: the labels are "Zahlung Visa" and "Gästeforderungen", never the guest name "Müller"', () => {
    const [booking] = post([payment({ credit: ACCOUNTS.folio })]).bookings;
    expect(booking?.debit.label).toBe('Zahlung Visa');
    expect(booking?.credit.label).toBe('Gästeforderungen');
    expect(JSON.stringify(booking)).not.toContain('Müller');
  });

  it('labels revenue in German as used in Germany by apaleo group and rate, the same for a charge and its allowance', () => {
    const [revenue, allowance] = post([charge(), charge({ grossCents: -2_000, netCents: -1_869, taxes: germanTax(7, -131) })]).bookings;
    expect(revenue?.credit.label).toBe('Erlöse Beherbergung 7 %');
    expect(allowance?.debit.label).toBe('Erlöse Beherbergung 7 %');
  });

  it('gives every side of an account the same label, whatever the line, so the writer nets the guest ledger to its daily change', () => {
    const lines = [charge(), charge({ credit: ACCOUNTS.other19, grossCents: 1_190, netCents: 1_000, taxes: germanTax(19, 190) }), payment(), payment({ credit: ACCOUNTS.folio })];
    const labels = post(lines).bookings.flatMap((b) => [b.debit, b.credit]).filter((side) => side.account === '1410').map((side) => side.label);
    expect(new Set(labels)).toEqual(new Set(['Gästeforderungen']));
  });

  it.each([
    [ACCOUNTS.cityTax, 0, 'Kurtaxe'],
    [{ number: '3502', name: 'Second city tax', type: 'SecondCityTax' }, 0, 'Kurtaxe 2'],
    [{ number: '3503', name: 'Guest levy', type: 'GuestLevies' }, 7, 'Gästeabgabe 7 %'],
    [ACCOUNTS.cityTax, 7, 'Beherbergungsteuer 7 %'],
    [{ number: '3502', name: 'Second city tax', type: 'SecondCityTax' }, 7, 'Beherbergungsteuer 2 7 %'],
    [ACCOUNTS.liabilities, 7, 'Anzahlungen 7 %'],
    [ACCOUNTS.liabilities0, 0, 'Anzahlungen ohne USt'],
    [{ number: 'X_LossOfAccountsReceivable', name: 'Müller, Hans', type: 'LossOfAccountsReceivable', parentNumber: '6900' }, 19, 'Forderungsverluste 19 %'],
    [ACCOUNTS.accountsReceivable, 0, 'Forderungen Firmenrechnungen'],
    [{ number: 'BSP-ACME-1_AccountsReceivable', name: 'Müller GmbH', type: 'AccountsReceivable', parentNumber: '9999' }, 0, 'Forderungen Firmenrechnungen'],
    [ACCOUNTS.folio, 0, 'Gästeforderungen'],
    [{ number: '9000', name: 'House Account', type: 'House' }, 0, 'Hauskonto'],
    [{ number: '7000', name: 'Transitory Items', type: 'TransitoryItems' }, 0, 'Durchlaufende Posten'],
  ])('labels %o at %s % as "%s"', (ref, rate, label) => {
    expect(sideLabel(ref, CHART, rate)).toBe(label);
  });

  it('writes rates with a decimal comma', () => {
    expect(percentLabel(5.5)).toBe('5,5 %');
    expect(percentLabel(19)).toBe('19 %');
  });
});

describe('revenueLabel', () => {
  const chart = new ChartIndex([
    { number: '5000', name: 'Revenues', type: 'Revenues', ledger: 'global', isArchived: false, hasChildren: true },
    { number: 'RevenueNoShow', name: 'Revenues No-show', type: 'Revenues', parentNumber: '5000', ledger: 'global', isArchived: false, hasChildren: true },
  ]);
  const revenue = (number: string, name: string, parentNumber?: string) => ({ number, name, type: 'Revenues', ...(parentNumber ? { parentNumber } : {}) });

  it.each([
    ['RevenueAccommodation_Reduced:7.00', 'Revenues Accommodation (7%)', 7, 'Erlöse Beherbergung 7 %'],
    ['RevenueFoodAndBeverages_Reduced:7.00', 'Revenues Food and beverages (7%)', 7, 'Erlöse Speisen 7 %'],
    ['RevenueFoodAndBeverages_Normal:19.00', 'Revenues Food and beverages (19%)', 19, 'Erlöse Getränke 19 %'],
    ['RevenueCancellationFees_Reduced:7.00', 'Revenues Cancellation fees (7%)', 7, 'Erlöse Stornogebühren 7 %'],
    ['RevenueCancellationFees_Without:0.00', 'Revenues Cancellation fees (no VAT)', 0, 'Erlöse ohne USt'],
    ['RevenueOther_Normal:19.00', 'Revenues Other (19%)', 19, 'Erlöse sonstige 19 %'],
    ['5011', 'Logis', 7, 'Erlöse Logis'],
    ['5500', 'Revenues Spa (19%)', 19, 'Erlöse Spa (19%)'],
  ])('labels %s as "%s"', (number, name, rate, label) => {
    expect(revenueLabel(revenue(number, name), chart, rate)).toBe(label);
  });

  it('finds the standard group through the chart parents', () => {
    expect(revenueLabel(revenue('NS-7', 'Revenues No-show (7%)', 'RevenueNoShow'), chart, 7)).toBe('Erlöse No-Show 7 %');
  });
});

describe('paymentLabel', () => {
  it.each([
    ['Cash Payment', 'bar'],
    ['Cash and ATM', 'bar'],
    ['Bank Transfer', 'Überweisung'],
    ['Direct Debit', 'Lastschrift'],
    ['Voucher Payment', 'Gutschein'],
    ['Other Payment', 'sonstige'],
    ['Credit Card Payment', 'Kreditkarte'],
    ['Cheque', 'Scheck'],
    ['Visa Credit Card Payment', 'Visa'],
    ['Visa Debit Card Payment', 'Visa Debit'],
    ['MasterCard Credit Card Payment', 'Mastercard'],
    ['GiroCard Payment', 'Girocard'],
    ['PayPal Payment', 'PayPal'],
    ['Payment by Booking.com', 'Booking.com'],
    ['Visa', 'Visa'],
  ])('labels %s as %s', (name, label) => {
    expect(paymentLabel(name)).toBe(label);
  });
});

describe('Field filling without personal data: the receipt for the protocol', () => {
  it('Receipt kept for the protocol: a payment with receipt PSP123 and reference BSP-ABCDEF-1 keeps PSP123', () => {
    const [booking] = post([payment({ receipt: { type: 'PspReference', number: 'PSP123' }, reference: 'BSP-ABCDEF-1' })]).bookings;
    expect(booking?.receipt).toBe('PSP123');
  });

  it('keeps the reference with posting.text2 "reference" or without a receipt number', () => {
    const line = charge({ receipt: { type: 'Invoice', number: 'BSP-2026-0042' }, reference: 'BSP-ABCDEF-1' });
    expect(post([line], undefined, { text2: 'reference' }).bookings[0]?.receipt).toBe('BSP-ABCDEF-1');
    expect(post([line]).bookings[0]?.receipt).toBe('BSP-2026-0042');
    expect(post([payment({ receipt: { type: 'Custom', number: ' ' }, reference: 'BSP-EXT-1' })]).bookings[0]?.receipt).toBe('BSP-EXT-1');
  });
});
