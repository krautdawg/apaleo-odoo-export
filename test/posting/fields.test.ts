import { describe, expect, it } from 'vitest';
import { ChartIndex } from '../../src/core/chart.js';
import { lineRate } from '../../src/mapping/index.js';
import { accountLabel, commandLabel, paymentLabel, percentLabel, revenueLabel, text1 } from '../../src/posting/index.js';
import { ledgerLine, tax } from '../helpers/ledger.js';
import { mappingRow } from '../helpers/mapping.js';
import { ACCOUNTS, CHART, charge, mappingWith, post, swissTax } from '../helpers/posting.js';

const payment = (overrides: Parameters<typeof ledgerLine>[0] = {}) =>
  ledgerLine({ debit: ACCOUNTS.visa, credit: ACCOUNTS.receivables, command: 'PostPayment', grossCents: 12_000, taxes: [], ...overrides });

describe('Text2', () => {
  it('Payment without invoice: the receipt number of a payment, a PSP reference', () => {
    const [booking] = post([payment({ receipt: { type: 'PspReference', number: 'PSP123' }, reference: 'BSP-ABCDEF-1' })]).bookings;
    expect(booking?.text2).toBe('PSP123');
  });

  it('Reference instead of receipt: with posting.text2 "reference" an accommodation charge carries the reference', () => {
    const line = charge({ receipt: { type: 'Invoice', number: 'BSP-2026-0042' }, reference: 'BSP-ABCDEF-1' });
    expect(post([line], undefined, { text2: 'reference' }).bookings[0]?.text2).toBe('BSP-ABCDEF-1');
    expect(post([line]).bookings[0]?.text2).toBe('BSP-2026-0042');
    expect(post([payment({ receipt: { number: '' }, reference: 'BSP-ABCDEF-1' })]).bookings[0]?.text2).toBe('BSP-ABCDEF-1');
  });

  it('never falls back to an account name', () => {
    const [booking] = post([payment({ credit: ACCOUNTS.folio, receipt: { number: ' ' }, reference: 'BSP-EXT-1' })]).bookings;
    expect(booking?.text2).toBe('BSP-EXT-1');
  });
});

describe('Text1', () => {
  it('Payment crediting a named guest folio: "Zahlung Visa", never the guest name "Müller"', () => {
    const [booking] = post([payment({ credit: ACCOUNTS.folio })]).bookings;
    expect(booking?.text1).toBe('Zahlung Visa');
    expect(JSON.stringify(booking)).not.toContain('Müller');
  });

  it('names revenue in Swiss Standard German: "Erlös" plus the standard group and rate, "Erlösminderung" for an allowance', () => {
    const [revenue, allowance] = post([charge(), charge({ grossCents: -2_076, netCents: -2_000, taxes: swissTax(3.8, -76) })]).bookings;
    expect(revenue?.text1).toBe('Erlös Beherbergung 3,8 %');
    expect(allowance?.text1).toBe('Erlösminderung Beherbergung 3,8 %');
  });

  it('names revenue by its economic sign on the debit side: negative is "Erlös", positive is "Erlösminderung"', () => {
    const debited = (grossCents: number, amount: number) =>
      charge({ debit: ACCOUNTS.food81, credit: ACCOUNTS.receivables, grossCents, netCents: grossCents - amount, taxes: swissTax(8.1, amount) });
    const [revenue, reduction] = post([debited(-1_081, -81), debited(1_081, 81)]).bookings;
    expect(revenue?.text1).toBe('Erlös Speisen und Getränke 8,1 %');
    expect(reduction?.text1).toBe('Erlösminderung Speisen und Getränke 8,1 %');
  });

  it('names the Kurtaxe and the levies, never as revenue, with the rate only when it is not 0', () => {
    const levy = (type: string, grossCents = 500, rate = 0) =>
      ledgerLine({ credit: { number: `${type}-1`, name: `${type} English name`, type }, grossCents, taxes: rate === 0 ? [] : [tax('Special', rate, 18)] });
    const texts = [levy('CityTaxes'), levy('SecondCityTax'), levy('GuestLevies'), levy('CityTaxes', -500), levy('GuestLevies', 500, 3.8)].map((line) =>
      text1(line, line.credit, CHART, lineRate(line) ?? 0),
    );
    expect(texts).toEqual(['Kurtaxe', 'Kurtaxe 2', 'Gästetaxe', 'Korrektur Kurtaxe', 'Gästetaxe 3,8 %']);
  });

  it('names a deposit by side and sign, with its rate: Anzahlung, Auflösung, Rückzahlung, Umbuchung', () => {
    const prepayment = charge({ debit: ACCOUNTS.visa, credit: ACCOUNTS.liabilities, command: 'PostPrepayment' });
    const release = charge({ debit: ACCOUNTS.receivables, credit: ACCOUNTS.liabilities, grossCents: -20_760, netCents: -20_000, taxes: swissTax(3.8, -760) });
    const refund = charge({ ...prepayment, grossCents: -20_760, netCents: -20_000, taxes: swissTax(3.8, -760) });
    const parked = charge({ debit: ACCOUNTS.receivables, credit: ACCOUNTS.liabilities });
    expect(post([prepayment, release, refund, parked]).bookings.map((b) => b.text1)).toEqual([
      'Anzahlung 3,8 %',
      'Auflösung Anzahlung 3,8 %',
      'Rückzahlung Anzahlung 3,8 %',
      'Umbuchung Anzahlung 3,8 %',
    ]);
  });

  it('names a payment refund "Rückzahlung", a debtor transfer "Forderung an Debitor" and the Kurtaxe "Kurtaxe"', () => {
    const [refund, transfer, cityTax, move] = post([
      payment({ grossCents: -5_000 }),
      ledgerLine({ debit: ACCOUNTS.accountsReceivable, credit: ACCOUNTS.receivables, command: 'PostToAccountsReceivables', taxes: [] }),
      ledgerLine({ credit: ACCOUNTS.cityTax, grossCents: 350, taxes: [] }),
      ledgerLine({ debit: ACCOUNTS.folio, credit: ACCOUNTS.receivables, command: 'MoveLineItem', taxes: [] }),
    ]).bookings;
    expect(refund?.text1).toBe('Rückzahlung Visa');
    expect(transfer?.text1).toBe('Forderung an Debitor');
    expect(cityTax?.text1).toBe('Kurtaxe');
    // Both sides map to 1101: skipped, so only three bookings.
    expect(move).toBeUndefined();
  });

  it('is cut to the 80 characters Abacus reads', () => {
    const credit = { number: '5500', name: `Spa ${'x'.repeat(120)}`, type: 'Revenues' };
    const mapping = mappingWith(mappingRow({ apaleoAccount: '5500', apaleoType: 'Revenues', abacusAccount: '3500', mwstCode: '313', mwstPercent: '3.8' }));
    const text = post([charge({ credit })], mapping).bookings[0]?.text1 ?? '';
    expect(text).toHaveLength(80);
    expect(text.startsWith('Erlös Spa x')).toBe(true);
  });

  it('labels the remaining apaleo commands in German', () => {
    expect(['MoveLineItem', 'PostToAccountsReceivables', 'PostToLossOfAccountsReceivables', 'PostPrepaymentVat', 'PostCharge', 'Unknown'].map(commandLabel)).toEqual([
      'Umbuchung',
      'Forderung an Debitor',
      'Debitorenverlust',
      'MWST Anzahlung',
      'Buchung',
      'Buchung',
    ]);
  });

  it('writes rates with a decimal comma', () => {
    expect([3.8, 8.1, 2.6, 0, 10].map(percentLabel)).toEqual(['3,8 %', '8,1 %', '2,6 %', '0 %', '10 %']);
  });

  it('never writes "ß" in a label', () => {
    const texts = post([charge(), payment(), payment({ debit: ACCOUNTS.cash })]).bookings.map((b) => b.text1);
    expect(texts.join(' ')).not.toContain('ß');
  });
});

describe('revenueLabel', () => {
  const chart = new ChartIndex([
    { number: '5000', name: 'Revenues', type: 'Revenues', ledger: 'global', isArchived: false, hasChildren: true },
    { number: 'RevenueNoShow', name: 'Revenues No-show', type: 'Revenues', parentNumber: '5000', ledger: 'global', isArchived: false, hasChildren: true },
  ]);
  const revenue = (number: string, name: string, parentNumber?: string) => ({ number, name, type: 'Revenues', ...(parentNumber ? { parentNumber } : {}) });

  it.each([
    ['RevenueAccommodation_Special:3.80', 'Revenues Accommodation (3.8%)', 3.8, 'Beherbergung 3,8 %'],
    ['RevenueFoodAndBeverages_Normal:8.10', 'Revenues Food and beverages (8.1%)', 8.1, 'Speisen und Getränke 8,1 %'],
    ['RevenueCancellationFees_Without:0.00', 'Revenues Cancellation fees (no VAT)', 0, 'Annullation 0 %'],
    ['RevenueOther_Reduced:2.60', 'Revenues Other (2.6%)', 2.6, 'Übrige Erlöse 2,6 %'],
    ['5011', 'Logis 3.8%', 3.8, 'Logis 3.8%'],
    ['5500', 'Revenues Spa (8.1%)', 8.1, 'Spa (8.1%)'],
  ])('labels %s as "%s"', (number, name, rate, label) => {
    expect(revenueLabel(revenue(number, name), chart, rate)).toBe(label);
  });

  it('finds the standard group through the chart parents', () => {
    expect(revenueLabel(revenue('NS-38', 'Revenues No-show (3.8%)', 'RevenueNoShow'), chart, 3.8)).toBe('No-Show 3,8 %');
  });
});

describe('paymentLabel', () => {
  it.each([
    ['Cash Payment', 'Bar'],
    ['Cash and ATM', 'Bar'],
    ['Bank Transfer', 'Überweisung'],
    ['Direct Debit', 'Lastschrift'],
    ['Voucher Payment', 'Gutschein'],
    ['Other Payment', 'Übrige'],
    ['Credit Card Payment', 'Kreditkarte'],
    ['Cheque', 'Check'],
    ['Visa Credit Card Payment', 'Visa'],
    ['Visa Debit Card Payment', 'Visa Debit'],
    ['MasterCard Credit Card Payment', 'Mastercard'],
    ['Twint Payment', 'Twint'],
    ['Reka Payment', 'Reka'],
    ['Postcard Payment', 'Postcard'],
    ['Payment by Booking.com', 'Booking.com'],
    ['Visa', 'Visa'],
  ])('labels %s as %s', (name, label) => {
    expect(paymentLabel(name)).toBe(label);
  });
});

describe('accountLabel', () => {
  const chart = new ChartIndex([
    ...CHART.accounts,
    { number: '1450', name: 'Company Receivables', type: 'AccountsReceivable', ledger: 'global', isArchived: false, hasChildren: true },
  ]);

  it('keeps the name of global accounts and of accounts of other types', () => {
    expect(accountLabel(ACCOUNTS.food81, chart)).toBe('Revenues Food and beverages (8.1%)');
    expect(accountLabel({ number: '9000', name: 'Anything', type: 'House' }, chart)).toBe('Anything');
  });

  it('uses the global parent name or a fixed label for guest, booking and per-reservation accounts', () => {
    expect(accountLabel({ number: 'ACME-1', name: 'Müller GmbH', type: 'AccountsReceivable', parentNumber: '1450' }, chart)).toBe('Company Receivables');
    expect(accountLabel({ number: 'ACME-2', name: 'Müller GmbH', type: 'AccountsReceivable' }, chart)).toBe('Debitor');
    expect(accountLabel(ACCOUNTS.folio, chart)).toBe('Gästeforderung'); // parent 1200 lives in the guest ledger
    expect(accountLabel(ACCOUNTS.liabilities, chart)).toBe('Anzahlung Gast');
  });
});

describe('Kostenstelle', () => {
  it('Revenue line carries the Kostenstelle: an accommodation charge on a row with kost 10 has Single 3400 and Kostenstelle 10', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: ACCOUNTS.accommodation38.number, apaleoType: 'Revenues', apaleoVatPercent: '3.8', abacusAccount: '3400', mwstCode: '313', mwstPercent: '3.8', kost: '10' }));
    const [booking] = post([charge()], mapping).bookings;
    expect(booking).toMatchObject({ singleAccount: '3400', kost: '10' });
  });

  it('Payment line never carries a Kostenstelle, even when the rows of both accounts have one', () => {
    const mapping = mappingWith(
      mappingRow({ apaleoAccount: '1102', apaleoType: 'Payments', abacusAccount: '1090', kost: '30' }),
      mappingRow({ apaleoAccount: '1200', apaleoType: 'Receivables', abacusAccount: '1101', kost: '40' }),
    );
    const [booking] = post([payment()], mapping).bookings;
    expect(booking).toMatchObject({ collectiveAccount: '1090', singleAccount: '1101' });
    expect(booking?.kost).toBeUndefined();
  });

  it('is never written on a deposit or Kurtaxe line', () => {
    const mapping = mappingWith(
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '3.8', abacusAccount: '2030', mwstCode: '313', mwstPercent: '3.8', kost: '10' }),
      mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes', apaleoVatPercent: '0', abacusAccount: '2210', kost: '10' }),
    );
    const bookings = post([charge({ debit: ACCOUNTS.visa, credit: ACCOUNTS.liabilities }), ledgerLine({ credit: ACCOUNTS.cityTax, grossCents: 350, taxes: [] })], mapping).bookings;
    expect(bookings.map((b) => b.kost)).toEqual([undefined, undefined]);
  });

  it('keeps the Kostenstelle on a write-off row', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: '*', apaleoType: 'LossOfAccountsReceivable', apaleoVatPercent: '3.8', abacusAccount: '3805', mwstCode: '313', mwstPercent: '3.8', kost: '10' }));
    const loss = { number: 'X-1_LossOfAccountsReceivable', name: 'Loss', type: 'LossOfAccountsReceivable', parentNumber: '6900' };
    const [booking] = post([charge({ debit: loss, credit: ACCOUNTS.receivables })], mapping).bookings;
    expect(booking).toMatchObject({ singleAccount: '3805', kost: '10' });
  });

  it('keeps the Kostenstelle on a negative untaxed charge (a correction) with the side flipped', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: ACCOUNTS.accommodation0.number, apaleoType: 'Revenues', apaleoVatPercent: '0', abacusAccount: '3600', mwstPercent: '0', kost: '10' }));
    const [booking] = post([charge({ credit: ACCOUNTS.accommodation0, grossCents: -4_500, netCents: -4_500, taxes: [] })], mapping).bookings;
    expect(booking).toMatchObject({ collectiveAccount: '1101', singleAccount: '3600', debitCredit: 'C', grossCents: 4_500, kost: '10' });
  });
});
