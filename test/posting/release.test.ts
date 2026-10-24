import { describe, expect, it } from 'vitest';
import { ChartIndex } from '../../src/core/chart.js';
import { isErrorFinding } from '../../src/core/findings.js';
import type { LedgerLine, SourceAccount } from '../../src/core/source.js';
import { buildBookings, inferReleaseRates } from '../../src/posting/index.js';
import { ledgerLine, tax } from '../helpers/ledger.js';
import { mappingRow } from '../helpers/mapping.js';
import { ACCOUNTS, BEISPIEL_CHART, BEISPIEL_MAPPING, CHART, LEDGER, OPTIONS, SKR03_MAPPING, mappingWith, post } from '../helpers/posting.js';

/**
 * Deposit release: debit the guest's _Liabilities account, credit its
 * _Receivables account. With the SKR03 mapping the deposit side (1711,
 * `tax_ust_7_skr03`, 7 %) is the VAT side and is debited, so the booking carries
 * the tax on the refund side, which reverses the VAT on the deposit:
 * 214.00 × 7 / 107 = 14.00.
 */

const liabilities = { number: 'BSP-MNOPQR-1_Liabilities', name: 'Liabilities for Reservation BSP-MNOPQR-1', type: 'Liabilities' };
const receivables = { number: 'BSP-MNOPQR-1_Receivables', name: 'Receivables for Reservation BSP-MNOPQR-1', type: 'Receivables' };
const codes = (findings: readonly { code: string }[]) => findings.map((f) => f.code);
const tax7 = (cents: number) => [tax('Reduced', 7, cents)];

function release(overrides: Partial<LedgerLine> = {}): LedgerLine {
  return ledgerLine({
    businessDate: '2026-09-22',
    debit: liabilities,
    credit: receivables,
    command: 'System',
    grossCents: 21_400,
    netCents: 21_400,
    taxes: [],
    receipt: { type: 'Reservation', number: 'BSP-MNOPQR-1-V1' },
    reference: 'BSP-MNOPQR-1',
    sourceEntryNumber: 'BSPE0021',
    ...overrides,
  });
}

/** The PostPrepaymentVat line that takes the deposit's VAT off apaleo's VAT-on-liabilities account. */
function pair(overrides: Partial<LedgerLine> = {}): LedgerLine {
  return release({
    debit: ACCOUNTS.vatOnLiabilities7,
    credit: liabilities,
    command: 'PostPrepaymentVat',
    grossCents: 1_400,
    netCents: 0,
    taxes: tax7(1_400),
    sourceEntryNumber: 'BSPE0022',
    ...overrides,
  });
}

/** A chart with a guest Liabilities account that carries a VAT rate, as some apaleo accounts do. */
function chartWithDeposit(percent: number): ChartIndex {
  const guest = (account: Partial<SourceAccount> & Pick<SourceAccount, 'number' | 'name'>): SourceAccount => ({
    type: 'Liabilities',
    ledger: 'guest',
    isArchived: false,
    hasChildren: true,
    ...account,
  });
  return new ChartIndex([
    ...CHART.accounts,
    guest({ number: '3010', name: `Guest Liabilities ${percent}%`, parentNumber: '3000', vat: { type: percent === 0 ? 'Without' : 'Reduced', percent } }),
  ]);
}
const folioDeposit = { number: 'BSP-EXT-1_Liabilities', name: 'Müller, Hans', type: 'Liabilities', parentNumber: '3010' };

const released = (taxCents = 1_400) => ({ debit: { account: '1711', label: 'Anzahlungen 7 %' }, credit: { account: '1410', label: 'Gästeforderungen' }, grossCents: 21_400, vat: { side: 'debit', taxRef: 'tax_ust_7_skr03', percent: 7, apaleoTaxCents: taxCents } });

describe('deposit release with taxes', () => {
  it('Release with taxes: 214.00 with 14.00 at 7 % debits 1711 on the refund side and credits 1410, gross 214.00 and tax 14.00, no finding', () => {
    const line = release({ netCents: 20_000, taxes: tax7(1_400) });
    const { bookings, findings, summary } = post([line]);
    expect(findings).toEqual([]);
    expect(bookings).toEqual([expect.objectContaining(released())]);
    expect(summary.deposits).toEqual({ receivedCents: 0, releasedCents: 21_400, refundedCents: 0 });
    expect(summary.depositVatByRate).toEqual([{ tax: 'tax_ust_7_skr03', ratePercent: 7, netCents: -20_000, vatCents: -1_400, grossCents: -21_400, apaleoVat: '-14' }]);
  });

  it('books the Hotel Beispiel releases, negative charges with taxes[], without a finding', () => {
    const lines = LEDGER.filter((line) => line.command === 'PostCharge' && line.credit.type === 'Liabilities' && line.grossCents < 0);
    expect(lines.map((line) => line.sourceEntryNumber)).toEqual(['BSPE0019', 'BSPE0021']);
    expect(inferReleaseRates(LEDGER, BEISPIEL_CHART).size).toBe(0);
    const { bookings, findings } = buildBookings(lines, BEISPIEL_MAPPING, BEISPIEL_CHART, OPTIONS);
    expect(findings).toEqual([]);
    expect(bookings.map((b) => [b.debit.account, b.credit.account, b.grossCents, b.vat?.side, b.vat?.apaleoTaxCents])).toEqual([
      ['3510', '2000', 22_000, 'debit', 2_000],
      ['3510', '2000', 16_500, 'debit', 1_500],
    ]);
  });
});

describe('deposit release without taxes', () => {
  it('Release without taxes plus a PostPrepaymentVat pair: 7 % and 14.00 from the pair, the pair skipped as VAT_ACCOUNT_LINE, no E-VAT-UNEXPECTED', () => {
    const { bookings, skipped, findings } = post([release(), pair()]);
    expect(findings).toEqual([]);
    expect(bookings).toEqual([expect.objectContaining({ ...released(), sourceEntryNumbers: ['BSPE0021'] })]);
    expect(skipped.map((s) => [s.reason, s.line.sourceEntryNumber])).toEqual([['VAT_ACCOUNT_LINE', 'BSPE0022']]);
  });

  it('ignores a PostPrepaymentVat line of another day, reference or direction', () => {
    // The VAT booked when the deposit was received (debit Liabilities, credit VAT) goes the other way.
    const received = pair({ debit: liabilities, credit: ACCOUNTS.vatOnLiabilities7, sourceEntryNumber: 'BSPE0006' });
    for (const other of [pair({ businessDate: '2026-09-21' }), pair({ reference: 'BSP-OTHER-1' }), received]) {
      expect(codes(post([release(), other]).findings)).toEqual(['E-VAT-RATE-UNKNOWN']);
    }
  });

  it('infers the rate from the pair amount when the pair carries no tax entry', () => {
    // 14.00 of VAT on 214.00 matches 7 % (14.00), not 19 % (34.17).
    const { bookings, findings } = post([release(), pair({ taxes: [] })]);
    expect(findings).toEqual([]);
    expect(bookings[0]).toMatchObject({ debit: { account: '1711' }, vat: { percent: 7, apaleoTaxCents: 1_400 } });
  });

  it('blocks a release whose tax differs from the pair by more than a cent with E-VAT-AMOUNT', () => {
    const { bookings, findings } = post([release(), pair({ grossCents: 1_300, taxes: tax7(1_300) })]);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-AMOUNT']);
    expect(findings[0]?.message).toContain('the tax contained in the deposit release is 14.00, but apaleo reversed 13.00 on the PostPrepaymentVat line BSPE0022');
  });

  it("accepts a pair one cent off without a finding, books the pair's tax and allows the cent in the VAT check", () => {
    const { bookings, findings, vatRoundingByRate } = post([release(), pair({ grossCents: 1_401, taxes: tax7(1_401) })]);
    expect(bookings).toEqual([expect.objectContaining(released(1_401))]);
    expect(findings).toEqual([]);
    expect([...vatRoundingByRate]).toEqual([[7, 1]]);
  });

  it('checks two releases of the same day and reference against their pair together, each with its own computed tax', () => {
    // 107.00 + 107.00: 7.00 + 7.00 = 14.00, one pair of 14.00 in apaleo.
    const lines = [release({ grossCents: 10_700 }), release({ grossCents: 10_700, sourceEntryNumber: 'BSPE0023' }), pair()];
    const { bookings, findings } = post(lines);
    expect(findings).toEqual([]);
    expect(bookings.map((b) => [b.grossCents, b.vat?.apaleoTaxCents])).toEqual([
      [10_700, 700],
      [10_700, 700],
    ]);
  });

  it('Release with a chart rate only: 7 % of the Liabilities account or its parent, the tax 14.00 computed, W-VAT-INFERRED naming the line and the account', () => {
    const { bookings, findings } = buildBookings([release({ debit: folioDeposit })], SKR03_MAPPING, chartWithDeposit(7), OPTIONS);
    expect(bookings).toEqual([expect.objectContaining(released())]);
    expect(codes(findings)).toEqual(['W-VAT-INFERRED']);
    expect(findings[0]?.message).toContain('apaleo entry BSPE0021');
    expect(findings[0]?.message).toContain('7 %, the VAT rate of account 3010');
    expect(findings[0]?.message).toContain('computes the tax 14.00 from the gross amount');
    expect(findings[0]?.message).not.toContain('Müller');
  });

  it('Release with no rate source: E-VAT-RATE-UNKNOWN names the entry and blocks the export instead of booking it at 0 %', () => {
    const { bookings, findings } = post([release()]);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-RATE-UNKNOWN']);
    expect(findings.every(isErrorFinding)).toBe(true);
    expect(findings[0]?.message).toContain('apaleo entry BSPE0021');
    expect(findings[0]?.message).toContain('there is no PostPrepaymentVat line of 2026-09-22 for reference BSP-MNOPQR-1');
    expect(findings[0]?.message).not.toContain('1719');
  });

  it('blocks a release whose pair lines carry two rates with E-VAT-RATE-UNKNOWN', () => {
    const normal = pair({ debit: { number: 'LiabilitiesVat_Normal:19.00', name: 'LiabilitiesVat Normal (19%)', type: 'VatOnLiabilities' }, taxes: [tax('Normal', 19, 100)], sourceEntryNumber: 'BSPE0024' });
    const { findings } = post([release(), pair(), normal]);
    expect(codes(findings)).toEqual(['E-VAT-RATE-UNKNOWN']);
    expect(findings[0]?.message).toContain('carry more than one rate (7 %, 19 %)');
  });

  it('blocks a release whose inferred rate the mapping books without tax with E-VAT-MISSING', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: '3010', apaleoType: 'Liabilities', apaleoVatPercent: '7', odooAccount: '1719', taxPercent: '0' }));
    const { bookings, findings } = buildBookings([release({ debit: folioDeposit })], mapping, chartWithDeposit(7), OPTIONS);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-MISSING']);
    expect(findings[0]?.message).toContain('settles a deposit taxed at 7 % (inferred from the chart of accounts, account 3010)');
  });
});

describe('chart rate of 0 %', () => {
  it('Release with a chart rate of 0 %: booked on the 0 % deposit row without tax, still with W-VAT-INFERRED naming the 0 % rate', () => {
    const { bookings, findings } = buildBookings([release({ debit: folioDeposit })], SKR03_MAPPING, chartWithDeposit(0), OPTIONS);
    expect(bookings).toEqual([expect.objectContaining({ debit: { account: '1719', label: 'Anzahlungen ohne USt' }, credit: { account: '1410', label: 'Gästeforderungen' }, grossCents: 21_400 })]);
    expect(bookings[0]?.vat).toBeUndefined();
    expect(codes(findings)).toEqual(['W-VAT-INFERRED']);
    expect(findings[0]?.message).toContain('0 %, the VAT rate of account 3010');
    expect(findings[0]?.message).toContain('so the booking carries no tax');
  });
});

describe('untaxed deposit lines other than releases', () => {
  // 107.00 at 7 %: 10700 × 7 / 107 = 7.00.
  const refund = (overrides: Partial<LedgerLine> = {}) =>
    release({ debit: liabilities, credit: ACCOUNTS.visa, command: 'Refund', grossCents: 10_700, netCents: 10_700, sourceEntryNumber: 'BSPE0031', ...overrides });
  const received = (overrides: Partial<LedgerLine> = {}) =>
    release({ debit: ACCOUNTS.visa, credit: liabilities, command: 'PostPrepayment', grossCents: 10_700, netCents: 10_700, sourceEntryNumber: 'BSPE0032', ...overrides });
  /** VAT reversed on the deposit (debit VAT on liabilities), as for a release. */
  const reversing = (overrides: Partial<LedgerLine> = {}) => pair({ grossCents: 700, taxes: tax7(700), sourceEntryNumber: 'BSPE0033', ...overrides });
  /** VAT booked on the deposit (credit VAT on liabilities), as on receipt. */
  const booking = (overrides: Partial<LedgerLine> = {}) => reversing({ debit: liabilities, credit: ACCOUNTS.vatOnLiabilities7, sourceEntryNumber: 'BSPE0034', ...overrides });

  it('Untaxed deposit refund with a PostPrepaymentVat line: 107.00 resolves to the 7 % row with gross 107.00 and tax 7.00 on 1711', () => {
    const { bookings, skipped, findings } = post([refund(), reversing()]);
    expect(findings).toEqual([]);
    expect(bookings).toEqual([
      expect.objectContaining({ debit: { account: '1711', label: 'Anzahlungen 7 %' }, credit: { account: '1360', label: 'Zahlung Visa' }, grossCents: 10_700, vat: { side: 'debit', taxRef: 'tax_ust_7_skr03', percent: 7, apaleoTaxCents: 700 }, sourceEntryNumbers: ['BSPE0031'] }),
    ]);
    expect(skipped.map((s) => s.reason)).toEqual(['VAT_ACCOUNT_LINE']);
  });

  it('Untaxed prepayment received with a PostPrepaymentVat line: 107.00 on the 7 % row with the tax on the credit side', () => {
    const { bookings, findings } = post([received(), booking()]);
    expect(findings).toEqual([]);
    expect(bookings).toEqual([
      expect.objectContaining({ debit: { account: '1360', label: 'Zahlung Visa' }, credit: { account: '1711', label: 'Anzahlungen 7 %' }, grossCents: 10_700, vat: { side: 'credit', taxRef: 'tax_ust_7_skr03', percent: 7, apaleoTaxCents: 700 }, sourceEntryNumbers: ['BSPE0032'] }),
    ]);
  });

  it('infers the rate from the pair amount when the pair of a prepayment received carries no tax entry', () => {
    const { bookings, findings } = post([received(), booking({ taxes: [] })]);
    expect(findings).toEqual([]);
    expect(bookings[0]).toMatchObject({ credit: { account: '1711' } });
  });

  it('blocks a refund whose tax differs from the pair by more than one cent with E-VAT-AMOUNT', () => {
    const { bookings, findings } = post([refund(), reversing({ grossCents: 600, taxes: tax7(600) })]);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-AMOUNT']);
    expect(findings[0]?.message).toContain('the tax contained in the deposit line is 7.00, but apaleo reversed 6.00 on the PostPrepaymentVat line BSPE0033');
  });

  it('blocks a prepayment received whose tax differs from the pair with E-VAT-AMOUNT', () => {
    const { findings } = post([received(), booking({ grossCents: 600, taxes: tax7(600) })]);
    expect(codes(findings)).toEqual(['E-VAT-AMOUNT']);
    expect(findings[0]?.message).toContain('but apaleo booked 6.00 on the PostPrepaymentVat line BSPE0034');
  });

  // Without a tax the line keeps its own debit and credit accounts: 1719 to 1360 for the refund, 1360 to 1719 for the receipt.
  const refundAt0 = expect.objectContaining({ debit: { account: '1719', label: 'Anzahlungen ohne USt' }, credit: { account: '1360', label: 'Zahlung Visa' }, grossCents: 10_700 });
  const receivedAt0 = expect.objectContaining({ debit: { account: '1360', label: 'Zahlung Visa' }, credit: { account: '1719', label: 'Anzahlungen ohne USt' }, grossCents: 10_700 });

  it('ignores a PostPrepaymentVat line of the other direction and keeps the line on the 0 % deposit row', () => {
    expect(post([refund(), booking()]).bookings).toEqual([refundAt0]);
    expect(post([received(), reversing()]).bookings).toEqual([receivedAt0]);
  });

  it('keeps an untaxed refund or receipt without a PostPrepaymentVat line on the 0 % deposit row without a finding', () => {
    for (const [line, expected] of [[refund(), refundAt0], [received(), receivedAt0]] as const) {
      const { bookings, findings } = post([line]);
      expect(findings).toEqual([]);
      expect(bookings).toEqual([expected]);
    }
  });

  it('checks a release and a refund of the same day and reference against their pair together', () => {
    // 214.00 released (14.00) + 107.00 refunded (7.00) = 21.00 reversed on one pair line.
    const { bookings, findings } = post([release(), refund(), reversing({ grossCents: 2_100, taxes: tax7(2_100) })]);
    expect(findings).toEqual([]);
    expect(bookings.map((b) => [b.debit.account, b.vat?.apaleoTaxCents])).toEqual([
      ['1711', 1_400],
      ['1711', 700],
    ]);
  });

  it('blocks a refund whose pair lines carry two rates with E-VAT-RATE-UNKNOWN', () => {
    const normal = reversing({ debit: { number: 'LiabilitiesVat_Normal:19.00', name: 'LiabilitiesVat Normal (19%)', type: 'VatOnLiabilities' }, taxes: [tax('Normal', 19, 100)], sourceEntryNumber: 'BSPE0035' });
    const { bookings, findings } = post([refund(), reversing(), normal]);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-RATE-UNKNOWN']);
    expect(findings[0]?.message).toContain("it books a guest's deposit without a VAT amount");
  });
});
