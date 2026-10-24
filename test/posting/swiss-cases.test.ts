import { describe, expect, it } from 'vitest';
import { renderXmlBuchungen } from '../../src/abacus/index.js';
import type { LedgerLine } from '../../src/core/source.js';
import { abacusOptions, block, value } from '../helpers/abacus.js';
import { ledgerLine, tax as taxEntry } from '../helpers/ledger.js';
import { mappingRow } from '../helpers/mapping.js';
import { ACCOUNTS, charge, mappingWith, post, swissTax as tax } from '../helpers/posting.js';

/**
 * The Swiss special cases of a05 (Kurtaxe and levies, deposits and accounts
 * receivable, bad debt, Annullationen), one test per scenario of the
 * posting-rules spec, with the KMU mapping of the Swiss test chart: Kurtaxe 2210
 * without MWST-Code, Anzahlungen 2030 (313) and 2039, Debitoren 1102,
 * Debitorenverluste 3805 (313) and 3808, Annullationen 3680.
 */

const codes = (findings: readonly { code: string }[]) => findings.map((f) => f.code);

const reservation = (id: string) => ({
  receivables: { number: `${id}_Receivables`, name: `Receivables for Reservation ${id}`, type: 'Receivables', parentNumber: '1200' },
  liabilities38: { number: `${id}_Liabilities/Special:3.80`, name: `Liabilities for Reservation ${id} (3.8%)`, type: 'Liabilities', parentNumber: '3000' },
  liabilities0: { number: `${id}_Liabilities/Null:0.00`, name: `Liabilities for Reservation ${id} (0%)`, type: 'Liabilities', parentNumber: '3000' },
  loss: { number: `${id}_LossOfAccountsReceivable`, name: `LossOfAccountsReceivable for Reservation ${id}`, type: 'LossOfAccountsReceivable', parentNumber: '6900' },
});
const ALPHA = reservation('ENG-ALPHA-1');
const FOXTROT = reservation('ENG-FOXTROT-1');

const levy = { number: '3601', name: 'Beherbergungsabgabe', type: 'GuestLevies', parentNumber: '3600' };
const cancellation0 = { number: 'RevenueCancellationFees_Without:0.00', name: 'Revenues Cancellation fees (no VAT)', type: 'Revenues', parentNumber: 'RevenueCancellationFees' };
const noShow38 = { number: 'RevenueNoShow_Special:3.80', name: 'Revenues No-show (3.8%)', type: 'Revenues', parentNumber: 'RevenueNoShow' };

/** An untaxed line in CHF from the guest folio. */
const untaxed = (overrides: Partial<LedgerLine>) => ledgerLine({ debit: ACCOUNTS.receivables, currency: 'CHF', taxes: [], ...overrides });

function single(line: LedgerLine, mapping = mappingWith()) {
  const result = post([line], mapping);
  return { ...result, booking: result.bookings[0] };
}

describe('Kurtaxe and guest levies', () => {
  it('Guest-owed Kurtaxe: 4.20 with a Without entry is Collective 1101, Single 2210, D, no TaxData, and 4.20 on 2210 without MWST in the summary', () => {
    const { booking, findings, summary } = single(untaxed({ credit: ACCOUNTS.cityTax, grossCents: 420, netCents: 420, taxes: [taxEntry('Without', 0, 0)] }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1101', singleAccount: '2210', debitCredit: 'D', grossCents: 420 });
    expect(booking?.tax).toBeUndefined();
    expect(summary.levies).toEqual([{ account: '2210', mwstCode: '', ratePercent: 0, grossCents: 420, vatCents: 0 }]);
    expect(summary.cityTaxCents).toBe(420);
  });

  it('Kurtaxe with a Ziffer-910 code: 491 at rate 0 gives TaxData 491, rate 0, tax 0.00 and no E-VAT-UNEXPECTED', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes', apaleoVatPercent: '0', abacusAccount: '2210', mwstCode: '491', mwstPercent: '0' }));
    const { booking, findings, summary } = single(untaxed({ credit: ACCOUNTS.cityTax, grossCents: 420, netCents: 420 }), mapping);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ singleAccount: '2210', grossCents: 420, tax: { mwstCode: '491', percent: 0, taxCents: 0 } });
    expect(summary.levies).toEqual([{ account: '2210', mwstCode: '491', ratePercent: 0, grossCents: 420, vatCents: 0 }]);
  });

  it('Taxed Beherbergungsabgabe: 2.08 on a GuestLevies account mapped to 3400 (313, 3.8 %) is Single 3400 with tax -0.08, counted as a levy with MWST', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: '3601', apaleoType: 'GuestLevies', apaleoVatPercent: '3.8', abacusAccount: '3400', mwstCode: '313', mwstPercent: '3.8' }));
    const { booking, findings, summary } = single(charge({ credit: levy, grossCents: 208, netCents: 200, taxes: tax(3.8, 8) }), mapping);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1101', singleAccount: '3400', debitCredit: 'D', grossCents: 208, tax: { mwstCode: '313', percent: 3.8, taxCents: -8 }, text1: 'Gästetaxe 3,8 %' });
    expect(summary.levies).toEqual([{ account: '3400', mwstCode: '313', ratePercent: 3.8, grossCents: 208, vatCents: 8 }]);
  });

  it('Taxed levy on an untaxed row: 0.08 at 3.8 % on the Kurtaxe row without MWST-Code is E-VAT-MISSING naming the row', () => {
    const { bookings, findings } = single(charge({ credit: ACCOUNTS.cityTax, grossCents: 208, netCents: 200, taxes: tax(3.8, 8) }));
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-MISSING']);
    expect(findings[0]?.message).toMatch(/Change the row for 3501 \(CityTaxes\) on mapping line \d+ \(Abacus 2210\)/);
  });
});

describe('Deposits and accounts receivable in Abacus', () => {
  const prepayment = () => charge({ debit: ACCOUNTS.twint, credit: ALPHA.liabilities38, command: 'PostPrepayment', grossCents: 31_140, netCents: 30_000, taxes: tax(3.8, 1_140) });

  it('Prepayment at 3.8 %: Twint 311.40 is Collective 1090, Single 2030, D, tax -11.40 with 313; 311.40 received and 11.40 deposit tax', () => {
    const { booking, findings, summary } = single(prepayment());
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1090', singleAccount: '2030', debitCredit: 'D', grossCents: 31_140, tax: { mwstCode: '313', percent: 3.8, taxCents: -1_140 } });
    expect(summary.deposits).toEqual({ receivedCents: 31_140, releasedCents: 0, refundedCents: 0 });
    expect(summary.depositVatByRate).toEqual([{ mwstCode: '313', ratePercent: 3.8, netCents: 30_000, vatCents: 1_140, grossCents: 31_140, apaleoVat: '11.4' }]);
  });

  it('Same deposit with vereinnahmte Entgelte: same accounts, gross and tax, UseCode 1 and the Collective TaxAccount abacus.mwstHilfskonto', () => {
    const { bookings } = post([prepayment()]);
    const september = { from: '2026-09-01', to: '2026-09-30' } as const;
    const vereinbart = renderXmlBuchungen(bookings, abacusOptions(september)).text;
    const vereinnahmt = renderXmlBuchungen(bookings, abacusOptions({ ...september, abrechnungsart: 'vereinnahmt', mwstHilfskonto: '2202' })).text;
    expect(value(block(vereinnahmt, 'TaxData'), 'UseCode')).toBe('1');
    expect(value(block(vereinnahmt, 'CollectiveInformation'), 'TaxAccount')).toBe('2202');
    for (const tag of ['Account', 'KeyAmount']) {
      expect(value(block(vereinnahmt, 'CollectiveInformation'), tag)).toBe(value(block(vereinbart, 'CollectiveInformation'), tag));
      expect(value(block(vereinnahmt, 'SingleInformation'), tag)).toBe(value(block(vereinbart, 'SingleInformation'), tag));
    }
    expect(value(block(vereinnahmt, 'TaxData'), 'KeyAmount')).toBe('-11.40');
  });

  it('Release as a negative charge: -207.60 with tax -7.60 is Collective 1101, Single 2030, C, gross 207.60, tax 7.60, counted as released', () => {
    const { booking, findings, summary } = single(charge({ debit: ALPHA.receivables, credit: ALPHA.liabilities38, grossCents: -20_760, netCents: -20_000, taxes: tax(3.8, -760) }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1101', singleAccount: '2030', debitCredit: 'C', grossCents: 20_760, tax: { mwstCode: '313', taxCents: 760 } });
    expect(summary.deposits).toEqual({ receivedCents: 0, releasedCents: 20_760, refundedCents: 0 });
  });

  it('Refund of a deposit: a negative Twint prepayment -103.80 is Collective 1090, Single 2030, C, tax 3.80, released and refunded', () => {
    const { booking, findings, summary } = single(charge({ debit: ACCOUNTS.twint, credit: ALPHA.liabilities38, command: 'PostPrepayment', grossCents: -10_380, netCents: -10_000, taxes: tax(3.8, -380) }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1090', singleAccount: '2030', debitCredit: 'C', grossCents: 10_380, tax: { taxCents: 380 } });
    expect(summary.deposits).toEqual({ receivedCents: 0, releasedCents: 10_380, refundedCents: 10_380 });
  });

  it('Overpayment parked on the 0 % deposit: 10.00 is Collective 1101, Single 2039, D, no TaxData, counted as received', () => {
    const { booking, findings, summary } = single(untaxed({ debit: ALPHA.receivables, credit: ALPHA.liabilities0, grossCents: 1_000, netCents: 1_000 }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1101', singleAccount: '2039', debitCredit: 'D', grossCents: 1_000 });
    expect(booking?.tax).toBeUndefined();
    expect(summary.deposits).toEqual({ receivedCents: 1_000, releasedCents: 0, refundedCents: 0 });
  });

  it('Check-out on accounts receivable: 208.46 is Collective 1102, Single 1101, D, with the invoice number ENG-2026-0815 in Text2', () => {
    const line = untaxed({ debit: ACCOUNTS.accountsReceivable, credit: ACCOUNTS.receivables, command: 'PostToAccountsReceivables', grossCents: 20_846, netCents: 20_846, receipt: { type: 'Invoice', number: 'ENG-2026-0815' } });
    const { booking, findings, summary } = single(line);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1102', singleAccount: '1101', debitCredit: 'D', grossCents: 20_846, text2: 'ENG-2026-0815' });
    expect(summary.accountsReceivableCents).toBe(20_846);
  });
});

describe('Bad debt with MWST correction', () => {
  it('Write-off with MWST correction: 103.80 at 3.8 % is Collective 1101, Single 3805, C, tax 3.80 with 313, and 103.80 written off at 3.8 %', () => {
    const line = charge({ debit: FOXTROT.loss, credit: FOXTROT.receivables, command: 'PostToLossOfAccountsReceivables', grossCents: 10_380, netCents: 10_000, taxes: tax(3.8, 380) });
    const { booking, findings, summary } = single(line);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1101', singleAccount: '3805', debitCredit: 'C', grossCents: 10_380, tax: { mwstCode: '313', percent: 3.8, taxCents: 380 } });
    expect(summary.writeOffsByRate).toEqual([{ mwstCode: '313', ratePercent: 3.8, netCents: 10_000, vatCents: 380, grossCents: 10_380, apaleoVat: '3.8' }]);
  });

  it('Write-off without MWST: 30.00 without tax entries is Collective 1101, Single 3808, C, no TaxData', () => {
    const line = untaxed({ debit: FOXTROT.loss, credit: FOXTROT.receivables, command: 'PostToLossOfAccountsReceivables', grossCents: 3_000, netCents: 3_000 });
    const { booking, findings, summary } = single(line);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1101', singleAccount: '3808', debitCredit: 'C', grossCents: 3_000 });
    expect(booking?.tax).toBeUndefined();
    expect(summary.writeOffsByRate).toEqual([{ mwstCode: '', ratePercent: 0, netCents: 3_000, vatCents: 0, grossCents: 3_000, apaleoVat: '0' }]);
  });
});

describe('Annullationen and no-show payments', () => {
  it('Untaxed Annullation: 80.00 on RevenueCancellationFees_Without:0.00 is Collective 1101, Single 3680, D, no TaxData', () => {
    // The row init-mapping writes for apaleo's cancellation fees at 0 % (the Swiss test chart has no such account).
    const mapping = mappingWith(mappingRow({ apaleoAccount: cancellation0.number, apaleoType: 'Revenues', apaleoVatPercent: '0', abacusAccount: '3680', mwstPercent: '0' }));
    const { booking, findings } = single(untaxed({ credit: cancellation0, grossCents: 8_000, netCents: 8_000 }), mapping);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1101', singleAccount: '3680', debitCredit: 'D', grossCents: 8_000 });
    expect(booking?.tax).toBeUndefined();
  });

  it('Taxed no-show on an untaxed row: 3.80 at 3.8 % on a row without MWST-Code is E-VAT-MISSING naming the row', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: noShow38.number, apaleoType: 'Revenues', apaleoVatPercent: '3.8', abacusAccount: '3680' }));
    const { bookings, findings } = single(charge({ credit: noShow38, grossCents: 10_380, netCents: 10_000, taxes: tax(3.8, 380) }), mapping);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-MISSING']);
    expect(findings[0]?.message).toContain('Change the row for RevenueNoShow_Special:3.80 (Revenues) on mapping line 2 (Abacus 3680)');
  });
});
