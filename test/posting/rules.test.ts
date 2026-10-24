import { describe, expect, it } from 'vitest';
import { isErrorFinding } from '../../src/core/findings.js';
import type { LedgerLine } from '../../src/core/source.js';
import { inclusiveCheckTax, taxFromGross } from '../../src/posting/index.js';
import { ledgerLine, tax as taxEntry } from '../helpers/ledger.js';
import { mappingRow } from '../helpers/mapping.js';
import { ACCOUNTS, charge, mappingWith, post, swissTax as tax } from '../helpers/posting.js';

/**
 * Hand-computed examples at the Swiss rates (MWSTG Art. 25: Beherbergung 3.8 %,
 * Normalsatz 8.1 %, reduzierter Satz 2.6 %), posted with what `init-mapping
 * --template kmu-hotel` writes on the Swiss test chart: Gästeforderungen 1101,
 * Transferkonto 1090, Kasse 1000, Beherbergung 3400 (313), Küche 3200 and
 * übrige Erlöse 3500 (311), 3260 (312), 3600 at 0 %, Anzahlungen 2030 (313) and
 * 2039, Debitoren 1102, Kurtaxe 2210 without MWST-Code. Abacus receives the
 * absolute gross amount, `DebitCredit` of the Collective account and the
 * signed tax on the Single account, the side with the MWST-Code.
 */

const codes = (findings: readonly { code: string }[]) => findings.map((f) => f.code);

function single(line: LedgerLine, mapping = mappingWith(), options = {}) {
  const result = post([line], mapping, options);
  return { ...result, booking: result.bookings[0] };
}

const payment = (overrides: Partial<LedgerLine> = {}) =>
  ledgerLine({ debit: ACCOUNTS.visa, credit: ACCOUNTS.receivables, command: 'PostPayment', currency: 'CHF', grossCents: 12_000, netCents: 12_000, taxes: [], ...overrides });

describe('one booking per ledger line', () => {
  it('Card payment: Visa 120.00 is Collective 1090, Single 1101, DebitCredit D, gross 120.00, no MWST', () => {
    const { booking, findings } = single(payment({ businessDate: '2026-09-16', sourceEntryNumber: 'BSPE0014' }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1090', singleAccount: '1101', debitCredit: 'D', grossCents: 12_000, businessDate: '2026-09-16', sourceEntryNumbers: ['BSPE0014'] });
    expect(booking?.tax).toBeUndefined();
  });

  it('books a cash payment 24.00 to the Kasse 1000', () => {
    const { booking } = single(payment({ debit: ACCOUNTS.cash, grossCents: 2_400 }));
    expect(booking).toMatchObject({ collectiveAccount: '1000', singleAccount: '1101', debitCredit: 'D', grossCents: 2_400 });
  });

  it('is deterministic: the same lines and mapping give the same result', () => {
    const lines = [charge(), payment()];
    expect(post(lines)).toEqual(post(structuredClone(lines)));
  });
});

describe('VAT side in SingleInformation', () => {
  it('Accommodation charge at 3.8 %: Collective 1101, Single 3400, D, gross 207.60, tax -7.60, MWST-Code 313 and rate 3.8', () => {
    const { booking, findings } = single(charge());
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1101', singleAccount: '3400', debitCredit: 'D', grossCents: 20_760, tax: { mwstCode: '313', percent: 3.8, taxCents: -760 } });
  });

  it('Allowance on accommodation: debit 3400, credit 1101, 20.76 is Collective 1101, Single 3400, C, gross 20.76, tax 0.76', () => {
    const { booking, findings } = single(charge({ debit: ACCOUNTS.accommodation38, credit: ACCOUNTS.receivables, grossCents: 2_076, netCents: 2_000, taxes: tax(3.8, 76) }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1101', singleAccount: '3400', debitCredit: 'C', grossCents: 2_076, tax: { mwstCode: '313', percent: 3.8, taxCents: 76 } });
  });

  it('Negative charge: -20.76 with tax -0.76 is booked like the allowance, C, gross 20.76, tax 0.76', () => {
    const { booking, findings, summary } = single(charge({ grossCents: -2_076, netCents: -2_000, taxes: tax(3.8, -76) }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1101', singleAccount: '3400', debitCredit: 'C', grossCents: 2_076, tax: { taxCents: 76 } });
    expect(summary.revenueByRate).toEqual([{ mwstCode: '313', ratePercent: 3.8, netCents: -2_000, vatCents: -76, grossCents: -2_076, apaleoVat: '-0.76' }]);
  });

  it('Untaxed charge keeps its Kostenstelle: 45.00 on 3600 with kost 10 is Single 3600, D, no MWST, Kostenstelle 10; its allowance C with 10', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: ACCOUNTS.accommodation0.number, apaleoType: 'Revenues', apaleoVatPercent: '0', abacusAccount: '3600', mwstPercent: '0', kost: '10' }));
    const line = charge({ credit: ACCOUNTS.accommodation0, grossCents: 4_500, netCents: 4_500, taxes: [] });
    const allowance = charge({ debit: ACCOUNTS.accommodation0, credit: ACCOUNTS.receivables, grossCents: 4_500, netCents: 4_500, taxes: [] });
    const { bookings, findings } = post([line, allowance], mapping);
    expect(findings).toEqual([]);
    expect(bookings[0]).toMatchObject({ collectiveAccount: '1101', singleAccount: '3600', debitCredit: 'D', grossCents: 4_500, kost: '10' });
    expect(bookings[0]?.tax).toBeUndefined();
    expect(bookings[1]).toMatchObject({ collectiveAccount: '1101', singleAccount: '3600', debitCredit: 'C', grossCents: 4_500, kost: '10' });
  });

  it('MWST-Code on the receivables side: the line is not booked and fails with E-MWST-CODE-NOT-ALLOWED naming the account and the mapping line', () => {
    const mapping = mappingWith(
      mappingRow({ apaleoAccount: '1200', apaleoType: 'Receivables', abacusAccount: '1101', mwstCode: '313', mwstPercent: '3.8' }),
      mappingRow({ apaleoAccount: ACCOUNTS.accommodation38.number, apaleoType: 'Revenues', apaleoVatPercent: '3.8', abacusAccount: '3400' }),
    );
    const { bookings, findings } = single(charge(), mapping);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-MWST-CODE-NOT-ALLOWED']);
    expect(findings[0]?.message).toContain('BSP-ABCDEF-1_Receivables (Receivables) uses mapping line 2 (Abacus 1101), which has the MWST-Code 313');
  });

  it.each([
    ['AccountsReceivable', '*', ACCOUNTS.accountsReceivable, '1102'],
    ['Payments', '1102', ACCOUNTS.visa, '1090'],
  ])('also refuses an MWST-Code on a %s row', (apaleoType, apaleoAccount, debit, abacusAccount) => {
    const mapping = mappingWith(
      mappingRow({ apaleoAccount, apaleoType, abacusAccount, mwstCode: '313', mwstPercent: '3.8' }),
      mappingRow({ apaleoAccount: ACCOUNTS.accommodation38.number, apaleoType: 'Revenues', apaleoVatPercent: '3.8', abacusAccount: '3400' }),
    );
    const { bookings, findings } = single(charge({ debit }), mapping);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-MWST-CODE-NOT-ALLOWED']);
  });

  it('Refund without VAT side: debit 1090, credit 1101, -20.00 is Collective 1101, Single 1090, D, gross 20.00', () => {
    const { booking, findings } = single(payment({ grossCents: -2_000, netCents: -2_000 }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1101', singleAccount: '1090', debitCredit: 'D', grossCents: 2_000 });
    expect(booking?.tax).toBeUndefined();
  });

  it('Untaxed revenue with an MWST-Code at rate 0: 80.00 on 3600 with code 400 has tax 0.00, code 400, rate 0 and no E-VAT-UNEXPECTED', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: ACCOUNTS.accommodation0.number, apaleoType: 'Revenues', apaleoVatPercent: '0', abacusAccount: '3600', mwstCode: '400', mwstPercent: '0' }));
    const { booking, findings } = single(charge({ credit: ACCOUNTS.accommodation0, grossCents: 8_000, netCents: 8_000, taxes: [] }), mapping);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1101', singleAccount: '3600', debitCredit: 'D', grossCents: 8_000, tax: { mwstCode: '400', percent: 0, taxCents: 0 } });
  });

  it('Two VAT sides: a move between two revenue accounts reports E-TWO-VAT-SIDES with the entry and both accounts and books nothing', () => {
    const { bookings, findings } = single(charge({ debit: ACCOUNTS.accommodation38, credit: ACCOUNTS.food81, command: 'MoveLineItem', sourceEntryNumber: 'BSPE0099' }));
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-TWO-VAT-SIDES']);
    expect(findings[0]?.message).toContain('apaleo entry BSPE0099');
    expect(findings[0]?.message).toContain('debit RevenueAccommodation_Special:3.80 on mapping line');
    expect(findings[0]?.message).toContain('credit RevenueFoodAndBeverages_Normal:8.10 on mapping line');
    expect(findings[0]?.message).toMatch(/\(Abacus 3400\).*\(Abacus 3200\)/);
  });
});

describe('Tax guard for Abacus bookings', () => {
  it('Minibar at 8.1 %: 10.81 on 3500 (311) carries tax -0.81, no finding, and the summary shows 10.81 gross at 8.1 %', () => {
    const { booking, findings, summary } = single(charge({ credit: ACCOUNTS.other81, grossCents: 1_081, netCents: 1_000, taxes: tax(8.1, 81) }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ singleAccount: '3500', grossCents: 1_081, tax: { mwstCode: '311', percent: 8.1, taxCents: -81 } });
    expect(summary.revenueByRate).toEqual([{ mwstCode: '311', ratePercent: 8.1, netCents: 1_000, vatCents: 81, grossCents: 1_081, apaleoVat: '0.81' }]);
  });

  it('books food at 8.1 % on 3200 and take-away at 2.6 % on 3260 with 312', () => {
    const { bookings, findings } = post([
      charge({ credit: ACCOUNTS.food81, grossCents: 3_243, netCents: 3_000, taxes: tax(8.1, 243) }),
      charge({ credit: ACCOUNTS.food26, grossCents: 1_026, netCents: 1_000, taxes: tax(2.6, 26) }),
    ]);
    expect(findings).toEqual([]);
    expect(bookings.map((b) => [b.singleAccount, b.tax?.mwstCode, b.tax?.taxCents])).toEqual([
      ['3200', '311', -243],
      ['3260', '312', -26],
    ]);
  });

  it('Zero-rate tax entry: a Kurtaxe line with a Without entry of 0 % and 0.00 on an account without MWST-Code raises no E-VAT-MISSING', () => {
    const { booking, findings } = single(charge({ credit: ACCOUNTS.cityTax, grossCents: 350, netCents: 350, taxes: [taxEntry('Without', 0, 0)] }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1101', singleAccount: '2210', debitCredit: 'D', grossCents: 350 });
    expect(booking?.tax).toBeUndefined();
  });

  it('Wrong rate in mapping: a line taxed at 3.8 % on an account mapped to 311 at 8.1 % is E-VAT-RATE and blocks the export', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: ACCOUNTS.accommodation38.number, apaleoType: 'Revenues', apaleoVatPercent: '3.8', abacusAccount: '3500', mwstCode: '311', mwstPercent: '8.1' }));
    const { bookings, findings } = single(charge(), mapping);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-RATE']);
    expect(findings.every(isErrorFinding)).toBe(true);
    expect(findings[0]?.message).toContain('apaleo taxed it at 3.8 %, but RevenueAccommodation_Special:3.80 (Revenues) on mapping line 2 (Abacus 3500) books 8.1 %');
  });

  it('Taxed line on an untaxed Abacus account: 7.60 tax on an account without MWST-Code is E-VAT-MISSING', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: ACCOUNTS.accommodation38.number, apaleoType: 'Revenues', apaleoVatPercent: '3.8', abacusAccount: '3600' }));
    const { bookings, findings } = single(charge(), mapping);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-MISSING']);
    expect(findings[0]?.message).toContain('carries 7.60 VAT at 3.8 %');
    expect(findings[0]?.message).toContain('neither side has an MWST-Code');
    expect(findings[0]?.message).toContain('Change the row for RevenueAccommodation_Special:3.80 (Revenues) on mapping line 2 (Abacus 3600)');
  });

  it('blocks an untaxed line on a row with an MWST-Code above 0 % with E-VAT-UNEXPECTED', () => {
    const { bookings, findings } = single(charge({ taxes: [] }));
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-UNEXPECTED']);
    expect(findings[0]?.message).toContain('books 3.8 % with the MWST-Code 313');
  });

  it('One-Rappen rounding: W-VAT-ROUNDING when the inclusive check value differs by one Rappen, the booking keeps apaleo\'s tax', () => {
    // Gross 46.80, apaleo tax 3.50 (net 43.30): Abacus checks 46.80 × 8.1 / 108.1 = 3.5067 → 3.51.
    expect(inclusiveCheckTax(4_680, 8.1)).toBe(351);
    const { booking, findings, summary, vatRoundingByRate } = single(charge({ credit: ACCOUNTS.other81, grossCents: 4_680, netCents: 4_330, taxes: tax(8.1, 350) }));
    expect(booking).toMatchObject({ grossCents: 4_680, tax: { taxCents: -350 } });
    expect(codes(findings)).toEqual(['W-VAT-ROUNDING']);
    expect(findings[0]?.message).toContain("Abacus checks the MWST as 8.1 % contained in the gross amount 46.80, which is 3.51, but the booking carries apaleo's tax 3.50");
    expect(summary.roundingCents).toBe(1);
    expect(summary.findings).toEqual([{ code: 'W-VAT-ROUNDING', count: 1 }]);
    // The booking carries apaleo's own tax, so the VAT total per rate needs no allowance.
    expect([...vatRoundingByRate]).toEqual([]);
  });

  it('blocks a larger difference with E-VAT-AMOUNT', () => {
    const { bookings, findings } = single(charge({ credit: ACCOUNTS.other81, grossCents: 4_680, netCents: 4_280, taxes: tax(8.1, 400) }));
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-AMOUNT']);
    expect(findings[0]?.message).toContain("8.1 % contained in the gross amount 46.80, which is 3.51, but the booking carries apaleo's tax 4.00");
  });

  it('Precise tax from apaleo: 95.00 at 3.8 % with tax 3.47784200 carries tax -3.48 and no finding', () => {
    const line = charge({ grossCents: 9_500, netCents: 9_152, netPrecise: '91.52215800', taxes: tax(3.8, 348, '3.47784200'), sourceEntryNumber: '000000029' });
    const { booking, findings, summary } = single(line);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ singleAccount: '3400', grossCents: 9_500, tax: { mwstCode: '313', percent: 3.8, taxCents: -348 } });
    expect(summary.revenueByRate).toEqual([{ mwstCode: '313', ratePercent: 3.8, netCents: 9_152, vatCents: 348, grossCents: 9_500, apaleoVat: '3.477842' }]);
  });

  it('blocks a line with two tax rates with E-VAT-MIXED', () => {
    const { bookings, findings } = single(charge({ taxes: [...tax(3.8, 760), ...tax(8.1, 10)] }));
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-MIXED']);
    expect(findings[0]?.message).toContain('but an Abacus booking has one');
  });

  it('blocks a tax with the opposite sign of the gross amount with E-VAT-SIGN', () => {
    const { bookings, findings } = single(charge({ taxes: tax(3.8, -760) }));
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-SIGN']);
  });

  it('blocks a row with an MWST-Code but no rate with E-VAT-RATE-MISSING', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: ACCOUNTS.accommodation38.number, apaleoType: 'Revenues', apaleoVatPercent: '3.8', abacusAccount: '3400', mwstCode: '313' }));
    const { bookings, findings } = single(charge(), mapping);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-RATE-MISSING']);
    expect(findings[0]?.message).toContain('Fill in mwst_percent');
  });

  it('reports an unmapped account once with E-UNMAPPED and books none of its lines', () => {
    const spa = { number: '5050', name: 'Spa', type: 'Revenues' };
    const { bookings, findings } = post([charge({ credit: spa }), charge({ credit: spa, sourceEntryNumber: 'BSPE0002' })]);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-UNMAPPED']);
    expect(findings[0]?.message).toContain('apaleo account 5050 (Revenues, "Spa") is not mapped (2 lines, gross 415.20)');
  });

  it('computes the tax contained in a gross amount half away from zero, never to 5 Rappen', () => {
    expect(taxFromGross(20_760, 3.8)).toBe(760);
    expect(taxFromGross(-1_081, 8.1)).toBe(-81);
    expect(taxFromGross(4_680, 8.1)).toBe(351);
    expect(taxFromGross(1_003, 8.1)).toBe(75);
  });
});

describe('levies, deposits and accounts receivable', () => {
  it('books the guest-owed Kurtaxe 3.50 from the folio to 2210 without MWST, counted as levy, not revenue', () => {
    const { booking, findings, summary } = single(charge({ credit: ACCOUNTS.cityTax, grossCents: 350, netCents: 350, taxes: [] }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1101', singleAccount: '2210', debitCredit: 'D', grossCents: 350, text1: 'Kurtaxe' });
    expect(summary.cityTaxCents).toBe(350);
    expect(summary.revenueByRate).toEqual([]);
  });

  it('books a prepayment 207.60 at 3.8 % as Collective 1090, Single 2030 with 313', () => {
    const { booking, findings, summary } = single(charge({ debit: ACCOUNTS.visa, credit: ACCOUNTS.liabilities, command: 'PostPrepayment' }));
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1090', singleAccount: '2030', debitCredit: 'D', grossCents: 20_760, tax: { mwstCode: '313', percent: 3.8, taxCents: -760 } });
    expect(summary.deposits).toEqual({ receivedCents: 20_760, releasedCents: 0, refundedCents: 0 });
    expect(summary.depositVatByRate).toEqual([{ mwstCode: '313', ratePercent: 3.8, netCents: 20_000, vatCents: 760, grossCents: 20_760, apaleoVat: '7.6' }]);
  });

  it('books a check-out on accounts receivable 300.00 to the Debitoren 1102 with the invoice number in Text2', () => {
    const { booking, findings } = single(
      ledgerLine({
        debit: ACCOUNTS.accountsReceivable,
        credit: ACCOUNTS.receivables,
        command: 'PostToAccountsReceivables',
        grossCents: 30_000,
        taxes: [],
        receipt: { type: 'Invoice', number: 'BSP-2026-0042' },
      }),
    );
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '1102', singleAccount: '1101', debitCredit: 'D', grossCents: 30_000, text2: 'BSP-2026-0042' });
  });

  it('books a refund of the parked 0 % deposit 2039 to the card without MWST, counted as released and refunded', () => {
    const line = ledgerLine({ debit: ACCOUNTS.twint, credit: ACCOUNTS.liabilities0, command: 'PostPrepayment', grossCents: -1_000, netCents: -1_000, taxes: [] });
    const { booking, findings, summary } = single(line);
    expect(findings).toEqual([]);
    expect(booking).toMatchObject({ collectiveAccount: '2039', singleAccount: '1090', debitCredit: 'D', grossCents: 1_000 });
    expect(booking?.tax).toBeUndefined();
    expect(summary.deposits).toEqual({ receivedCents: 0, releasedCents: 1_000, refundedCents: 1_000 });
    expect(summary.payments).toEqual([{ account: '1090', cents: -1_000 }]);
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
    expect(bookings.map((b) => [b.collectiveAccount, b.singleAccount, b.debitCredit, b.grossCents])).toEqual([
      ['1102', '1101', 'D', 9_500],
      ['1090', '1101', 'D', 90],
    ]);
    expect(summary.accountsReceivableCents).toBe(9_500);
    expect(skipped).toHaveLength(2);
    expect(summary.skipped).toEqual([{ reason: 'SAME_ACCOUNT', lines: 2, grossCents: 9_590 }]);
  });

  it('books a write-off at 3.8 % under 6900 on 3805 with 313, the MWST correction positive, C', () => {
    const loss = { number: 'BSP-ABCDEF-1_LossOfAccountsReceivable', name: 'LossOfAccountsReceivable for Reservation BSP-ABCDEF-1', type: 'LossOfAccountsReceivable', parentNumber: '6900' };
    const line = charge({ debit: loss, credit: ACCOUNTS.receivables, command: 'PostToLossOfAccountsReceivables' });
    const { bookings, findings, summary } = post([line, { ...line, debit: line.credit, credit: line.debit }]);
    expect(findings).toEqual([]);
    expect(bookings[0]).toMatchObject({ collectiveAccount: '1101', singleAccount: '3805', debitCredit: 'C', grossCents: 20_760, tax: { mwstCode: '313', taxCents: 760 }, text1: 'Debitorenverlust 3,8 %' });
    expect(bookings[1]).toMatchObject({ singleAccount: '3805', debitCredit: 'D', tax: { taxCents: -760 } });
    expect(summary.writeOffsByRate).toEqual([{ mwstCode: '313', ratePercent: 3.8, netCents: 0, vatCents: 0, grossCents: 0, apaleoVat: '0' }]);
    expect(summary.accounts.find((a) => a.account === '3805')?.balanceCents).toBe(0);
  });
});

describe('skipped lines', () => {
  it('Move between guest folios: 50.00 between two folios on 1101 produces no booking and one SAME_ACCOUNT line of 50.00', () => {
    const { bookings, skipped, summary, findings } = single(ledgerLine({ debit: ACCOUNTS.receivables, credit: ACCOUNTS.folio, command: 'MoveLineItem', grossCents: 5_000, taxes: [] }));
    expect(bookings).toEqual([]);
    expect(findings).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(['SAME_ACCOUNT']);
    expect(summary.skipped).toEqual([{ reason: 'SAME_ACCOUNT', lines: 1, grossCents: 5_000 }]);
  });

  it('VAT account lines are skipped: no booking, VAT_ACCOUNT_LINE with its amount, and the Vat account needs no row', () => {
    const unmappedVat = { number: 'Vat_Special:5.00', name: 'VAT Special (5%)', type: 'Vat' };
    const lines = [
      ledgerLine({ debit: ACCOUNTS.receivables, credit: unmappedVat, grossCents: 160, taxes: [] }),
      ledgerLine({ debit: ACCOUNTS.liabilities, credit: ACCOUNTS.vatOnLiabilities38, command: 'PostPrepaymentVat', grossCents: 760, taxes: tax(3.8, 760) }),
    ];
    const { bookings, skipped, summary, findings } = post(lines);
    expect(bookings).toEqual([]);
    expect(findings).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(['VAT_ACCOUNT_LINE', 'VAT_ACCOUNT_LINE']);
    expect(summary.skipped).toEqual([{ reason: 'VAT_ACCOUNT_LINE', lines: 2, grossCents: 920 }]);
  });

  it('skips lines with a zero gross amount as ZERO_AMOUNT', () => {
    const { bookings, skipped, summary } = single(charge({ grossCents: 0, netCents: 0, taxes: [] }));
    expect(bookings).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(['ZERO_AMOUNT']);
    expect(summary.skipped).toEqual([{ reason: 'ZERO_AMOUNT', lines: 1, grossCents: 0 }]);
  });
});

describe('Posting summary for Abacus', () => {
  it('moves the Collective account by the gross and the Single account by the gross minus the MWST', () => {
    const { summary } = post([charge(), payment({ grossCents: 20_760 })]);
    expect(summary.accounts).toEqual([
      { account: '1090', sollCents: 20_760, habenCents: 0, balanceCents: 20_760 },
      { account: '1101', sollCents: 20_760, habenCents: 20_760, balanceCents: 0 },
      { account: '3400', sollCents: 0, habenCents: 20_000, balanceCents: -20_000 },
    ]);
  });

  it('totals revenue per MWST-Code and rate, untaxed revenue without code', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: 'RevenueOther_Normal:8.10', apaleoType: 'Revenues', apaleoVatPercent: '8.1', abacusAccount: '3510', mwstCode: 'V81', mwstPercent: '8.1' }));
    const { summary } = post(
      [
        charge(),
        charge({ credit: ACCOUNTS.food81, grossCents: 1_081, netCents: 1_000, taxes: tax(8.1, 81) }),
        charge({ credit: ACCOUNTS.other81, grossCents: 1_081, netCents: 1_000, taxes: tax(8.1, 81) }),
        charge({ credit: ACCOUNTS.accommodation0, grossCents: 4_500, netCents: 4_500, taxes: [] }),
      ],
      mapping,
    );
    expect(summary.revenueByRate.map((t) => [t.mwstCode, t.ratePercent, t.grossCents, t.vatCents])).toEqual([
      ['', 0, 4_500, 0],
      ['313', 3.8, 20_760, 760],
      ['311', 8.1, 1_081, 81],
      ['V81', 8.1, 1_081, 81],
    ]);
  });
});
