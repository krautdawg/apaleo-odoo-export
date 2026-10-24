import { describe, expect, it } from 'vitest';
import { isErrorFinding } from '../../src/core/findings.js';
import type { LedgerLine } from '../../src/core/source.js';
import { taxFromGross } from '../../src/posting/index.js';
import { ledgerLine, tax as taxEntry } from '../helpers/ledger.js';
import { mappingRow } from '../helpers/mapping.js';
import { ACCOUNTS, charge, germanTax as tax, mappingWith, post } from '../helpers/posting.js';
import { odooOptions } from '../helpers/odoo.js';
import { entryLineSources, kennzahl, renderOdooCsv } from '../../src/odoo/index.js';
import { renderSummary } from '../../src/export/summary.js';
import type { PeriodPart } from '../../src/export/period.js';

const PART: PeriodPart = { from: '2026-09-01', to: '2026-09-30', month: '2026-09', wjBeginn: '2026-01-01' };

/**
 * Hand-computed examples at the German rates (UStG § 12: 7 % for Beherbergung and,
 * from 2026, Speisen; 19 % for drinks and other services), posted with what
 * `init-mapping --template skr03-hotel` writes on the German test chart for Odoo
 * 18: Gästeforderungen 1410, Geldtransit 1360, Kasse 1001, Erlöse 7 % 8300
 * (`tax_ust_7_skr03`), 19 % 8400 (`tax_ust_19_skr03`), 0 % 8200, Anzahlungen
 * 1711/1718/1719, Forderungen 1401, Kurtaxe 1590 without tax. One Odoo booking per
 * line: the line's debit and credit accounts (swapped for a negative gross), the
 * absolute gross, and on the side whose row has an Odoo tax that tax, its rate and
 * apaleo's tax rounded to cents.
 */

const codes = (findings: readonly { code: string }[]) => findings.map((f) => f.code);

function single(line: LedgerLine, mapping = mappingWith(), options = {}) {
  const result = post([line], mapping, options);
  return { ...result, booking: result.bookings[0] };
}

const payment = (overrides: Partial<LedgerLine> = {}) =>
  ledgerLine({ debit: ACCOUNTS.visa, credit: ACCOUNTS.receivables, command: 'PostPayment', grossCents: 12_000, netCents: 12_000, taxes: [], ...overrides });

describe('One booking per ledger line', () => {
  it('Card payment: Visa 120.00 debits 1360 "Zahlung Visa", credits 1410 "Gästeforderungen", gross 120.00, no VAT side', () => {
    const { booking, findings } = single(payment({ businessDate: '2026-09-16', sourceEntryNumber: 'BSPE0014' }));
    expect(findings).toEqual([]);
    expect(booking).toEqual({
      businessDate: '2026-09-16',
      debit: { account: '1360', label: 'Zahlung Visa' },
      credit: { account: '1410', label: 'Gästeforderungen' },
      grossCents: 12_000,
      sourceEntryNumbers: ['BSPE0014'],
      receipt: 'BSP-ABCDEF-1-V1',
    });
  });

  it('books a cash payment 24.00 to the Kasse 1001 as "Zahlung bar"', () => {
    const { booking } = single(payment({ debit: ACCOUNTS.cash, grossCents: 2_400 }));
    expect(booking).toMatchObject({ debit: { account: '1001', label: 'Zahlung bar' }, credit: { account: '1410' }, grossCents: 2_400 });
  });

  it('is deterministic: the same lines and mapping give the same result', () => {
    const lines = [charge(), payment()];
    expect(post(lines)).toEqual(post(structuredClone(lines)));
  });
});

describe('VAT side of an Odoo booking', () => {
  it('Accommodation charge at 7 %: debit 1410, credit 8300, gross 120.00, VAT side credit with tax_ust_7_skr03, rate 7 and apaleo tax 7.85', () => {
    const { booking, findings } = single(charge());
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({
      debit: { account: '1410', label: 'Gästeforderungen' },
      credit: { account: '8300', label: 'Erlöse Beherbergung 7 %' },
      grossCents: 12_000,
      vat: { side: 'credit', taxRef: 'tax_ust_7_skr03', percent: 7, apaleoTaxCents: 785 },
    });
  });

  it('Allowance on accommodation: debit 8300, credit 1410, gross 20.00, VAT side debit and apaleo tax 1.31', () => {
    const { booking, findings } = single(charge({ debit: ACCOUNTS.accommodation7, credit: ACCOUNTS.receivables, grossCents: 2_000, netCents: 1_869, taxes: tax(7, 131) }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ debit: { account: '8300' }, credit: { account: '1410' }, grossCents: 2_000, vat: { side: 'debit', taxRef: 'tax_ust_7_skr03', percent: 7, apaleoTaxCents: 131 } });
  });

  it('Negative charge: -20.00 with tax -1.31 is booked like the allowance, debit 8300, credit 1410, gross 20.00, apaleo tax 1.31', () => {
    const { booking, findings, summary } = single(charge({ grossCents: -2_000, netCents: -1_869, taxes: tax(7, -131) }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ debit: { account: '8300' }, credit: { account: '1410' }, grossCents: 2_000, vat: { side: 'debit', apaleoTaxCents: 131 } });
    expect(summary.revenueByRate).toEqual([{ tax: 'tax_ust_7_skr03', ratePercent: 7, netCents: -1_869, vatCents: -131, grossCents: -2_000, apaleoVat: '-1.31' }]);
  });

  it('Refund without VAT side: debit 1360, credit 1410, -20.00 is booked debit 1410, credit 1360, gross 20.00', () => {
    const { booking, findings } = single(payment({ grossCents: -2_000, netCents: -2_000 }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ debit: { account: '1410' }, credit: { account: '1360', label: 'Zahlung Visa' }, grossCents: 2_000 });
    expect(booking?.vat).toBeUndefined();
  });

  it('Tax on the receivables side: the line is not booked and fails with E-TAX-NOT-ALLOWED naming the account and the mapping line', () => {
    const mapping = mappingWith(
      mappingRow({ apaleoAccount: '1200', apaleoType: 'Receivables', odooAccount: '1410', odooTax: 'tax_ust_7_skr03', taxPercent: '7' }),
      mappingRow({ apaleoAccount: ACCOUNTS.accommodation7.number, apaleoType: 'Revenues', apaleoVatPercent: '7', odooAccount: '8300' }),
    );
    const { bookings, findings } = single(charge(), mapping);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-TAX-NOT-ALLOWED']);
    expect(findings[0]?.message).toContain('BSP-ABCDEF-1_Receivables (Receivables) uses mapping line 2 (Odoo 1410), which has the Odoo tax tax_ust_7_skr03');
  });

  it.each([
    ['AccountsReceivable', '*', ACCOUNTS.accountsReceivable, '1401'],
    ['Payments', '1102', ACCOUNTS.visa, '1360'],
  ])('also refuses an Odoo tax on a %s row', (apaleoType, apaleoAccount, debit, odooAccount) => {
    const mapping = mappingWith(
      mappingRow({ apaleoAccount, apaleoType, odooAccount, odooTax: 'tax_ust_7_skr03', taxPercent: '7' }),
      mappingRow({ apaleoAccount: ACCOUNTS.accommodation7.number, apaleoType: 'Revenues', apaleoVatPercent: '7', odooAccount: '8300' }),
    );
    const { bookings, findings } = single(charge({ debit }), mapping);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-TAX-NOT-ALLOWED']);
  });

  it('Untaxed revenue with an Odoo tax at rate 0: 80.00 on 8200 with a 0 % tax carries apaleo tax 0, rate 0 and no E-VAT-UNEXPECTED', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: ACCOUNTS.accommodation0.number, apaleoType: 'Revenues', apaleoVatPercent: '0', odooAccount: '8200', odooTax: '__import__.ust_0_hotel', taxPercent: '0' }));
    const { booking, findings } = single(charge({ credit: ACCOUNTS.accommodation0, grossCents: 8_000, netCents: 8_000, taxes: [] }), mapping);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ credit: { account: '8200', label: 'Erlöse ohne USt' }, grossCents: 8_000, vat: { side: 'credit', taxRef: '__import__.ust_0_hotel', percent: 0, apaleoTaxCents: 0 } });
  });

  it('Two VAT sides: a move between two revenue accounts reports E-TWO-VAT-SIDES with the entry and both accounts and books nothing', () => {
    const { bookings, findings } = single(charge({ debit: ACCOUNTS.accommodation7, credit: ACCOUNTS.other19, command: 'MoveLineItem', sourceEntryNumber: 'BSPE0099' }));
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-TWO-VAT-SIDES']);
    expect(findings[0]?.message).toContain('apaleo entry BSPE0099');
    expect(findings[0]?.message).toContain('debit RevenueAccommodation_Reduced:7.00 on mapping line');
    expect(findings[0]?.message).toContain('credit RevenueOther_Normal:19.00 on mapping line');
    expect(findings[0]?.message).toMatch(/\(Odoo 8300\).*\(Odoo 8400\)/);
  });
});

describe('Tax guard for Odoo bookings', () => {
  it('Minibar at 19 %: 11.90 on 8400 (tax_ust_19_skr03) carries apaleo tax 1.90, no finding, and the summary shows 11.90 gross revenue at 19 %', () => {
    const { booking, findings, summary } = single(charge({ credit: ACCOUNTS.other19, grossCents: 1_190, netCents: 1_000, taxes: tax(19, 190) }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ credit: { account: '8400', label: 'Erlöse sonstige 19 %' }, grossCents: 1_190, vat: { taxRef: 'tax_ust_19_skr03', percent: 19, apaleoTaxCents: 190 } });
    expect(summary.revenueByRate).toEqual([{ tax: 'tax_ust_19_skr03', ratePercent: 19, netCents: 1_000, vatCents: 190, grossCents: 1_190, apaleoVat: '1.9' }]);
  });

  it('books breakfast at 7 % and drinks at 19 % on 8300 and 8400 with their own labels', () => {
    const { bookings, findings } = post([
      charge({ credit: ACCOUNTS.food7, grossCents: 9_500, netCents: 8_879, taxes: tax(7, 621) }),
      charge({ credit: ACCOUNTS.food19, grossCents: 2_380, netCents: 2_000, taxes: tax(19, 380) }),
    ]);
    expect(findings).toEqual([]);
    expect(bookings.map((b) => [b.credit.account, b.credit.label, b.vat?.taxRef, b.vat?.apaleoTaxCents])).toEqual([
      ['8300', 'Erlöse Speisen 7 %', 'tax_ust_7_skr03', 621],
      ['8400', 'Erlöse Getränke 19 %', 'tax_ust_19_skr03', 380],
    ]);
  });

  it('Zero-rate tax entry: a Kurtaxe line with a Without entry of 0 % and 0.00 on an account without tax raises no E-VAT-MISSING', () => {
    const { booking, findings } = single(charge({ credit: ACCOUNTS.cityTax, grossCents: 350, netCents: 350, taxes: [taxEntry('Without', 0, 0)] }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ debit: { account: '1410' }, credit: { account: '1590', label: 'Kurtaxe' }, grossCents: 350 });
    expect(booking?.vat).toBeUndefined();
  });

  it('Wrong rate in mapping: a line taxed at 7 % on an account mapped to tax_ust_19_skr03 at 19 is E-VAT-RATE and blocks the export', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: ACCOUNTS.accommodation7.number, apaleoType: 'Revenues', apaleoVatPercent: '7', odooAccount: '8400', odooTax: 'tax_ust_19_skr03', taxPercent: '19' }));
    const { bookings, findings } = single(charge(), mapping);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-RATE']);
    expect(findings.every(isErrorFinding)).toBe(true);
    expect(findings[0]?.message).toContain('apaleo taxed it at 7 %, but RevenueAccommodation_Reduced:7.00 (Revenues) on mapping line 2 (Odoo 8400) books 19 %');
  });

  it('Taxed line on an untaxed account: 7.85 tax on an account mapped without tax is E-VAT-MISSING', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: ACCOUNTS.accommodation7.number, apaleoType: 'Revenues', apaleoVatPercent: '7', odooAccount: '8200' }));
    const { bookings, findings } = single(charge(), mapping);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-MISSING']);
    expect(findings[0]?.message).toContain('carries 7.85 VAT at 7 %');
    expect(findings[0]?.message).toContain('neither side has an Odoo tax');
    expect(findings[0]?.message).toContain('Change the row for RevenueAccommodation_Reduced:7.00 (Revenues) on mapping line 2 (Odoo 8200)');
  });

  it('blocks an untaxed line on a row with a tax above 0 % with E-VAT-UNEXPECTED', () => {
    const { bookings, findings } = single(charge({ taxes: [] }));
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-UNEXPECTED']);
    expect(findings[0]?.message).toContain('books 7 % with the Odoo tax tax_ust_7_skr03');
  });

  it("Precise tax from apaleo: 95.00 at 7 % with tax 6.21495327 carries apaleo tax 6.21 and no finding; Odoo's own rounding is the writer's business", () => {
    const line = charge({ credit: ACCOUNTS.food7, grossCents: 9_500, netCents: 8_879, netPrecise: '88.78504673', taxes: tax(7, 621, '6.21495327'), sourceEntryNumber: 'BSPE0003' });
    const { booking, findings, summary } = single(line);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ grossCents: 9_500, vat: { taxRef: 'tax_ust_7_skr03', percent: 7, apaleoTaxCents: 621 } });
    expect(summary.revenueByRate).toEqual([{ tax: 'tax_ust_7_skr03', ratePercent: 7, netCents: 8_879, vatCents: 621, grossCents: 9_500, apaleoVat: '6.21495327' }]);
    expect(summary.findings).toEqual([]);
  });

  it('blocks a line with two tax rates with E-VAT-MIXED', () => {
    const { bookings, findings } = single(charge({ taxes: [...tax(7, 785), ...tax(19, 10)] }));
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-MIXED']);
    expect(findings[0]?.message).toContain('but an Odoo base line has one tax');
  });

  it('blocks a tax with the opposite sign of the gross amount with E-VAT-SIGN', () => {
    const { bookings, findings } = single(charge({ taxes: tax(7, -785) }));
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-SIGN']);
  });

  it('blocks a row with an Odoo tax but no rate with E-VAT-RATE-MISSING', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: ACCOUNTS.accommodation7.number, apaleoType: 'Revenues', apaleoVatPercent: '7', odooAccount: '8300', odooTax: 'tax_ust_7_skr03' }));
    const { bookings, findings } = single(charge(), mapping);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-RATE-MISSING']);
    expect(findings[0]?.message).toContain('Fill in tax_percent');
  });

  it('reports an unmapped account once with E-UNMAPPED and books none of its lines', () => {
    const spa = { number: '5050', name: 'Spa', type: 'Revenues' };
    const { bookings, findings } = post([charge({ credit: spa }), charge({ credit: spa, sourceEntryNumber: 'BSPE0002' })]);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-UNMAPPED']);
    expect(findings[0]?.message).toContain('apaleo account 5050 (Revenues, "Spa") is not mapped (2 lines, gross 240.00)');
  });

  it('computes the tax contained in a gross amount half away from zero', () => {
    expect(taxFromGross(12_000, 7)).toBe(785);
    expect(taxFromGross(-1_190, 19)).toBe(-190);
    expect(taxFromGross(9_500, 7)).toBe(621);
    expect(taxFromGross(498, 19)).toBe(80);
  });
});

describe('Kurtaxe and guest levies', () => {
  it('Guest-owed Kurtaxe: 5.00 from 1410 to 1590 labelled Kurtaxe without VAT side, an empty tax cell, and 5.00 Kurtaxe on 1590 without tax in the summary', () => {
    const { booking, bookings, findings, summary } = single(charge({ credit: ACCOUNTS.cityTax, grossCents: 500, netCents: 500, taxes: [taxEntry('Without', 0, 0)] }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ debit: { account: '1410' }, credit: { account: '1590', label: 'Kurtaxe' }, grossCents: 500 });
    expect(booking?.vat).toBeUndefined();
    expect(renderOdooCsv(bookings, odooOptions()).text).toContain(',1590,Kurtaxe,0.00,5.00,\n');
    expect(summary.cityTaxCents).toBe(500);
    expect(summary.levies).toEqual([{ account: '1590', tax: '', ratePercent: 0, grossCents: 500, vatCents: 0, apaleoVat: '0' }]);
    expect(summary.revenueByRate).toEqual([]);
  });

  it('Hotel-owed Übernachtungsteuer: 10.70 at 7 % on a CityTaxes row mapped to 8300 with tax_ust_7_skr03 is the VAT side credit with apaleo tax 0.70, a credit base line 10.00, and a levy with tax', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes', apaleoVatPercent: '0', odooAccount: '8300', odooTax: 'tax_ust_7_skr03', taxPercent: '7' }));
    const { booking, bookings, findings, summary } = single(charge({ credit: ACCOUNTS.cityTax, grossCents: 1_070, netCents: 1_000, taxes: tax(7, 70) }), mapping);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ credit: { account: '8300', label: 'Kurtaxe 7 %' }, grossCents: 1_070, vat: { side: 'credit', taxRef: 'tax_ust_7_skr03', apaleoTaxCents: 70 } });
    expect(renderOdooCsv(bookings, odooOptions()).text).toContain(',8300,Kurtaxe 7 %,0.00,10.00,account.1_tax_ust_7_skr03\n');
    expect(summary.levies).toEqual([{ account: '8300', tax: 'tax_ust_7_skr03', ratePercent: 7, grossCents: 1_070, vatCents: 70, apaleoVat: '0.7' }]);
  });

  it('Taxed levy on an untaxed row: 0.70 at 7 % on the city-tax row without tax is E-VAT-MISSING naming the mapping row', () => {
    const { bookings, findings } = single(charge({ credit: ACCOUNTS.cityTax, grossCents: 1_070, netCents: 1_000, taxes: tax(7, 70) }));
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-MISSING']);
    expect(findings[0]?.message).toMatch(/Change the row for 3501 \(CityTaxes\) on mapping line \d+ \(Odoo 1590\)/);
  });
});

describe('Deposits and accounts receivable in Odoo', () => {
  it('Prepayment at 7 %: 214.00 debits 1360 and credits 1711 with tax_ust_7_skr03 (credit base line 200.00), counted as received with 14.00 deposit tax at 7 % Kz 86', () => {
    const { booking, bookings, findings, summary } = single(charge({ debit: ACCOUNTS.visa, credit: ACCOUNTS.liabilities, command: 'PostPrepayment', grossCents: 21_400, netCents: 20_000, taxes: tax(7, 1_400) }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ debit: { account: '1360' }, credit: { account: '1711', label: 'Anzahlungen 7 %' }, grossCents: 21_400, vat: { side: 'credit', taxRef: 'tax_ust_7_skr03', apaleoTaxCents: 1_400 } });
    const rendered = renderOdooCsv(bookings, odooOptions());
    expect(rendered.text).toContain(',1711,Anzahlungen 7 %,0.00,200.00,account.1_tax_ust_7_skr03\n');
    expect(rendered.taxTotals).toEqual([{ taxRef: 'tax_ust_7_skr03', percent: 7, baseCents: 20_000, odooTaxCents: 1_400, apaleoTaxCents: 1_400 }]);
    expect(summary.deposits).toEqual({ receivedCents: 21_400, releasedCents: 0, refundedCents: 0 });
    expect(summary.depositVatByRate).toEqual([{ tax: 'tax_ust_7_skr03', ratePercent: 7, netCents: 20_000, vatCents: 1_400, grossCents: 21_400, apaleoVat: '14' }]);
    expect(summary.depositsByRate).toEqual([
      { tax: 'tax_ust_7_skr03', ratePercent: 7, received: { grossCents: 21_400, vatCents: 1_400 }, released: { grossCents: 0, vatCents: 0 }, refunded: { grossCents: 0, vatCents: 0 } },
    ]);
    expect(renderSummary({ propertyId: 'BSP', part: PART, ledgerLines: 1, bookings: 1, summary, taxReturnLine: kennzahl, findings: [] })).toContain(
      '  tax_ust_7_skr03 7 % (Kz 86): received 214.00 (tax 14.00), released 0.00 (tax 0.00), of it refunded 0.00 (tax 0.00)',
    );
  });

  it('Release as a negative charge: -214.00 with tax -14.00 on BSP-ALPHA-1_Liabilities/Reduced:7.00 debits 1711 on the refund side and credits 1410, counted as released, not received', () => {
    const alpha = { ...ACCOUNTS.liabilities, number: 'BSP-ALPHA-1_Liabilities/Reduced:7.00', name: 'Liabilities for Reservation BSP-ALPHA-1 (7%)' };
    const { booking, bookings, findings, summary } = single(charge({ debit: { ...ACCOUNTS.receivables, number: 'BSP-ALPHA-1_Receivables' }, credit: alpha, grossCents: -21_400, netCents: -20_000, taxes: tax(7, -1_400) }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ debit: { account: '1711' }, credit: { account: '1410' }, grossCents: 21_400, vat: { side: 'debit', apaleoTaxCents: 1_400 } });
    expect(renderOdooCsv(bookings, odooOptions()).text).toContain(',1711,Anzahlungen 7 %,200.00,0.00,account.1_tax_ust_7_skr03\n');
    expect(summary.deposits).toEqual({ receivedCents: 0, releasedCents: 21_400, refundedCents: 0 });
    expect(summary.depositsByRate[0]).toMatchObject({ received: { grossCents: 0 }, released: { grossCents: 21_400, vatCents: 1_400 } });
  });

  it('Refund of a deposit: a negative prepayment of 107.00 debits 1711 and credits 1360, counted as released and refunded', () => {
    const { booking, findings, summary } = single(charge({ debit: ACCOUNTS.visa, credit: ACCOUNTS.liabilities, command: 'PostPrepayment', grossCents: -10_700, netCents: -10_000, taxes: tax(7, -700) }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ debit: { account: '1711' }, credit: { account: '1360' }, grossCents: 10_700, vat: { side: 'debit', apaleoTaxCents: 700 } });
    expect(summary.deposits).toEqual({ receivedCents: 0, releasedCents: 10_700, refundedCents: 10_700 });
    expect(summary.depositsByRate[0]).toMatchObject({ released: { grossCents: 10_700, vatCents: 700 }, refunded: { grossCents: 10_700, vatCents: 700 } });
    expect(summary.payments).toEqual([{ account: '1360', cents: -10_700 }]);
  });

  it('Overpayment parked on the 0 % deposit: 10.00 from BSP-ABCDEF-1_Receivables to BSP-ABCDEF-1_Liabilities/Null:0.00 debits 1410, credits 1719 without VAT side, counted as received', () => {
    const { booking, findings, summary } = single(ledgerLine({ debit: ACCOUNTS.receivables, credit: ACCOUNTS.liabilitiesNull, command: 'PostCharge', grossCents: 1_000, netCents: 1_000, taxes: [] }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ debit: { account: '1410' }, credit: { account: '1719', label: 'Anzahlungen ohne USt' }, grossCents: 1_000 });
    expect(booking?.vat).toBeUndefined();
    expect(summary.deposits).toEqual({ receivedCents: 1_000, releasedCents: 0, refundedCents: 0 });
    expect(summary.depositsByRate).toEqual([
      { tax: '', ratePercent: 0, received: { grossCents: 1_000, vatCents: 0 }, released: { grossCents: 0, vatCents: 0 }, refunded: { grossCents: 0, vatCents: 0 } },
    ]);
  });

  it('books a refund of the parked 0 % deposit 1719 to the card without tax, counted as released and refunded', () => {
    const line = ledgerLine({ debit: ACCOUNTS.mastercard, credit: ACCOUNTS.liabilities0, command: 'PostPrepayment', grossCents: -1_000, netCents: -1_000, taxes: [] });
    const { booking, findings, summary } = single(line);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ debit: { account: '1719', label: 'Anzahlungen ohne USt' }, credit: { account: '1360', label: 'Zahlung Mastercard' }, grossCents: 1_000 });
    expect(booking?.vat).toBeUndefined();
    expect(summary.deposits).toEqual({ receivedCents: 0, releasedCents: 1_000, refundedCents: 1_000 });
  });

  it('Check-out on accounts receivable: 321.00 debits 1401 "Forderungen Firmenrechnungen", credits 1410, and the protocol lists BSP-2026-0815 for the 1401 line of that day', () => {
    const { booking, bookings, findings } = single(
      ledgerLine({ debit: ACCOUNTS.accountsReceivable, credit: ACCOUNTS.receivables, command: 'PostToAccountsReceivables', grossCents: 32_100, taxes: [], receipt: { type: 'Invoice', number: 'BSP-2026-0815' }, sourceEntryNumber: 'BSPE0017' }),
    );
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ debit: { account: '1401', label: 'Forderungen Firmenrechnungen' }, credit: { account: '1410' }, grossCents: 32_100, receipt: 'BSP-2026-0815' });
    const protocol = entryLineSources(renderOdooCsv(bookings, odooOptions()), bookings);
    expect(protocol).toContain(`  ${booking?.businessDate} 1401 Forderungen Firmenrechnungen debit 321.00: BSPE0017 (BSP-2026-0815)`);
  });

  it('sums the accounts-receivable movement and lists the /Offset lines as skipped, unsigned', () => {
    const offset = { ...ACCOUNTS.accountsReceivable, number: `${ACCOUNTS.accountsReceivable.number}/Offset` };
    const transfer = { command: 'PostToAccountsReceivables', taxes: [] };
    const { bookings, skipped, summary } = post([
      ledgerLine({ ...transfer, debit: ACCOUNTS.receivables, credit: offset, grossCents: -9_500, sourceEntryNumber: '000000030' }),
      ledgerLine({ ...transfer, debit: ACCOUNTS.accountsReceivable, credit: offset, grossCents: 9_500, sourceEntryNumber: '000000030' }),
      payment({ credit: ACCOUNTS.offset, grossCents: 90 }),
      payment({ debit: ACCOUNTS.receivables, credit: ACCOUNTS.offset, grossCents: -90 }),
    ]);
    expect(bookings.map((b) => [b.debit.account, b.credit.account, b.grossCents])).toEqual([
      ['1401', '1410', 9_500],
      ['1360', '1410', 90],
    ]);
    expect(summary.accountsReceivableCents).toBe(9_500);
    expect(skipped).toHaveLength(2);
    expect(summary.skipped).toEqual([{ reason: 'SAME_ACCOUNT', lines: 2, grossCents: 9_590 }]);
  });
});

describe('Bad debt with tax correction', () => {
  const writeOff = (debit: LedgerLine['debit'], overrides: Partial<LedgerLine> = {}) => charge({ debit, credit: ACCOUNTS.receivables, command: 'PostToLossOfAccountsReceivables', ...overrides });

  it('Write-off at 19 %: 119.00 resolves through the wildcard to 2406, a debit base line 100.00 with tax_ust_19_skr03 on the refund side, counter credit 119.00, and 119.00 written off with Odoo VAT -19.00 at Kz 81', () => {
    const { booking, bookings, findings, summary } = single(writeOff(ACCOUNTS.loss19, { grossCents: 11_900, netCents: 10_000, netPrecise: '100', taxes: tax(19, 1_900) }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ debit: { account: '2406', label: 'Forderungsverluste 19 %' }, credit: { account: '1410' }, grossCents: 11_900, vat: { side: 'debit', taxRef: 'tax_ust_19_skr03', apaleoTaxCents: 1_900 } });
    const rendered = renderOdooCsv(bookings, odooOptions());
    expect(rendered.entries[0]?.lines.map((line) => [line.account, line.amountCents, line.taxRef])).toEqual([
      ['1410', -11_900, undefined],
      ['2406', 10_000, 'tax_ust_19_skr03'],
    ]);
    expect(rendered.taxTotals).toEqual([{ taxRef: 'tax_ust_19_skr03', percent: 19, baseCents: -10_000, odooTaxCents: -1_900, apaleoTaxCents: -1_900 }]);
    expect(summary.writeOffsByRate).toEqual([{ tax: 'tax_ust_19_skr03', ratePercent: 19, netCents: 10_000, vatCents: 1_900, grossCents: 11_900, apaleoVat: '19' }]);
    expect(renderSummary({ propertyId: 'BSP', part: PART, ledgerLines: 1, bookings: 1, summary, taxReturnLine: kennzahl, findings: [] })).toContain(
      '  tax_ust_19_skr03 19 % (lowers Kz 81): net 100.00, apaleo per line 19.00, gross 119.00, apaleo precise 19.00 (19), difference (per line minus precise) 0.00, VAT in the return -19.00',
    );
  });

  it('books a write-off at 7 % on 2401 with tax_ust_7_skr03 on the debit (refund) side, and its reversal on the credit side', () => {
    const line = writeOff(ACCOUNTS.loss7);
    const { bookings, findings, summary } = post([line, { ...line, debit: line.credit, credit: line.debit }]);
    expect(findings).toEqual([]);
    expect(bookings[0]).toMatchObject({ debit: { account: '2401', label: 'Forderungsverluste 7 %' }, credit: { account: '1410' }, grossCents: 12_000, vat: { side: 'debit', taxRef: 'tax_ust_7_skr03', apaleoTaxCents: 785 } });
    expect(bookings[1]).toMatchObject({ debit: { account: '1410' }, credit: { account: '2401' }, vat: { side: 'credit' } });
    expect(summary.writeOffsByRate).toEqual([{ tax: 'tax_ust_7_skr03', ratePercent: 7, netCents: 0, vatCents: 0, grossCents: 0, apaleoVat: '0' }]);
    expect(summary.accounts.find((a) => a.account === '2401')?.balanceCents).toBe(0);
  });

  it('Write-off without tax: 30.00 without tax entries debits 2400 with an empty tax cell', () => {
    const { booking, bookings, findings, summary } = single(writeOff(ACCOUNTS.loss0, { grossCents: 3_000, netCents: 3_000, netPrecise: '30', taxes: [] }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ debit: { account: '2400', label: 'Forderungsverluste ohne USt' }, grossCents: 3_000 });
    expect(booking?.vat).toBeUndefined();
    expect(renderOdooCsv(bookings, odooOptions()).text).toContain(',2400,Forderungsverluste ohne USt,30.00,0.00,\n');
    expect(summary.writeOffsByRate).toEqual([{ tax: '', ratePercent: 0, netCents: 3_000, vatCents: 0, grossCents: 3_000, apaleoVat: '0' }]);
  });
});

describe('Cancellation and no-show fees', () => {
  it('No-show fee at 7 %: 107.00 on RevenueNoShow_Reduced:7.00 (8300, tax_ust_7_skr03) is the VAT side credit with apaleo tax 7.00 and raises no finding', () => {
    const { booking, findings } = single(charge({ credit: ACCOUNTS.noShow7, grossCents: 10_700, netCents: 10_000, netPrecise: '100', taxes: tax(7, 700) }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ credit: { account: '8300', label: 'Erlöse No-Show 7 %' }, grossCents: 10_700, vat: { side: 'credit', taxRef: 'tax_ust_7_skr03', percent: 7, apaleoTaxCents: 700 } });
  });

  it('Untaxed cancellation fee: 80.00 on RevenueCancellationFees_Without:0.00 (8200 without tax) is a credit line of 80.00 with an empty tax cell', () => {
    const { booking, bookings, findings } = single(charge({ credit: ACCOUNTS.cancellation0, grossCents: 8_000, netCents: 8_000, netPrecise: '80', taxes: [] }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ credit: { account: '8200', label: 'Erlöse ohne USt' }, grossCents: 8_000 });
    expect(booking?.vat).toBeUndefined();
    expect(renderOdooCsv(bookings, odooOptions()).text).toContain(',8200,Erlöse ohne USt,0.00,80.00,\n');
  });

  it('Taxed no-show on an untaxed row: 7.00 at 7 % on RevenueNoShow_Without:0.00 (8200 without tax) is E-VAT-MISSING naming the mapping row', () => {
    const noShow0 = { number: 'RevenueNoShow_Without:0.00', name: 'Revenues No-show (no VAT)', type: 'Revenues', parentNumber: 'RevenueNoShow' };
    const { bookings, findings } = single(charge({ credit: noShow0, grossCents: 10_700, netCents: 10_000, netPrecise: '100', taxes: tax(7, 700) }));
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-MISSING']);
    expect(findings[0]?.message).toMatch(/Change the row for RevenueNoShow_Without:0\.00 \(Revenues\) on mapping line \d+ \(Odoo 8200\)/);
  });
});

describe('Skipped lines are reported', () => {
  it('Move between guest folios: 50.00 between two folios on 1410 produces no booking and one SAME_ACCOUNT line of 50.00', () => {
    const { bookings, skipped, summary, findings } = single(ledgerLine({ debit: ACCOUNTS.receivables, credit: ACCOUNTS.folio, command: 'MoveLineItem', grossCents: 5_000, taxes: [] }));
    expect(bookings).toEqual([]);
    expect(findings).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(['SAME_ACCOUNT']);
    expect(summary.skipped).toEqual([{ reason: 'SAME_ACCOUNT', lines: 1, grossCents: 5_000 }]);
  });

  it('VAT account lines are skipped: no booking, VAT_ACCOUNT_LINE with its amount, and the Vat account needs no row', () => {
    const unmappedVat = { number: 'Vat_Reduced:5.00', name: 'VAT Reduced (5%)', type: 'Vat' };
    const lines = [
      ledgerLine({ debit: ACCOUNTS.receivables, credit: unmappedVat, grossCents: 160, taxes: [] }),
      ledgerLine({ debit: ACCOUNTS.liabilities, credit: ACCOUNTS.vatOnLiabilities7, command: 'PostPrepaymentVat', grossCents: 700, taxes: tax(7, 700) }),
    ];
    const { bookings, skipped, summary, findings } = post(lines);
    expect(bookings).toEqual([]);
    expect(findings).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(['VAT_ACCOUNT_LINE', 'VAT_ACCOUNT_LINE']);
    expect(summary.skipped).toEqual([{ reason: 'VAT_ACCOUNT_LINE', lines: 2, grossCents: 860 }]);
  });

  it('skips lines with a zero gross amount as ZERO_AMOUNT', () => {
    const { bookings, skipped, summary } = single(charge({ grossCents: 0, netCents: 0, taxes: [] }));
    expect(bookings).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(['ZERO_AMOUNT']);
    expect(summary.skipped).toEqual([{ reason: 'ZERO_AMOUNT', lines: 1, grossCents: 0 }]);
  });
});

describe('Posting summary for Odoo', () => {
  it('moves the side without tax by the gross and the VAT side by the gross minus apaleo\'s tax', () => {
    const { summary } = post([charge(), payment()]);
    expect(summary.accounts).toEqual([
      { account: '1360', sollCents: 12_000, habenCents: 0, balanceCents: 12_000 },
      { account: '1410', sollCents: 12_000, habenCents: 12_000, balanceCents: 0 },
      { account: '8300', sollCents: 0, habenCents: 11_215, balanceCents: -11_215 },
    ]);
  });

  it('totals revenue per Odoo tax and rate, untaxed revenue without tax', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: 'RevenueOther_Normal:19.00', apaleoType: 'Revenues', apaleoVatPercent: '19', odooAccount: '8401', odooTax: '__import__.ust_19_hotel', taxPercent: '19' }));
    const { summary } = post(
      [
        charge(),
        charge({ credit: ACCOUNTS.food19, grossCents: 1_190, netCents: 1_000, taxes: tax(19, 190) }),
        charge({ credit: ACCOUNTS.other19, grossCents: 1_190, netCents: 1_000, taxes: tax(19, 190) }),
        charge({ credit: ACCOUNTS.accommodation0, grossCents: 4_500, netCents: 4_500, taxes: [] }),
      ],
      mapping,
    );
    expect(summary.revenueByRate.map((t) => [t.tax, t.ratePercent, t.grossCents, t.vatCents])).toEqual([
      ['', 0, 4_500, 0],
      ['tax_ust_7_skr03', 7, 12_000, 785],
      ['__import__.ust_19_hotel', 19, 1_190, 190],
      ['tax_ust_19_skr03', 19, 1_190, 190],
    ]);
  });
});
