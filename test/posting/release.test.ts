import { describe, expect, it } from 'vitest';
import { ChartIndex } from '../../src/core/chart.js';
import { isErrorFinding } from '../../src/core/findings.js';
import type { LedgerLine, SourceAccount } from '../../src/core/source.js';
import { buildBookings, inferReleaseRates } from '../../src/posting/index.js';
import { ledgerLine, tax } from '../helpers/ledger.js';
import { mappingRow } from '../helpers/mapping.js';
import { ACCOUNTS, BEISPIEL_CHART, BEISPIEL_MAPPING, CHART, KMU_MAPPING, LEDGER, OPTIONS, mappingWith, post } from '../helpers/posting.js';

/**
 * Deposit release: debit the guest's _Liabilities account, credit its
 * _Receivables account. With the KMU mapping the deposit side (2030, MWST-Code
 * 313, 3.8 %) is the Single account and is debited, so the booking has
 * `DebitCredit` `C` and a positive tax that reverses the MWST on the deposit:
 * 207.60 × 3.8 / 103.8 = 7.60.
 */

const liabilities = { number: 'BSP-MNOPQR-1_Liabilities', name: 'Liabilities for Reservation BSP-MNOPQR-1', type: 'Liabilities' };
const receivables = { number: 'BSP-MNOPQR-1_Receivables', name: 'Receivables for Reservation BSP-MNOPQR-1', type: 'Receivables' };
const codes = (findings: readonly { code: string }[]) => findings.map((f) => f.code);
const tax38 = (cents: number) => [tax('Special', 3.8, cents)];

function release(overrides: Partial<LedgerLine> = {}): LedgerLine {
  return ledgerLine({
    businessDate: '2026-09-22',
    debit: liabilities,
    credit: receivables,
    command: 'System',
    currency: 'CHF',
    grossCents: 20_760,
    netCents: 20_760,
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
    debit: ACCOUNTS.vatOnLiabilities38,
    credit: liabilities,
    command: 'PostPrepaymentVat',
    grossCents: 760,
    netCents: 0,
    taxes: tax38(760),
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
    guest({ number: '3010', name: `Guest Liabilities ${percent}%`, parentNumber: '3000', vat: { type: percent === 0 ? 'Without' : 'Special', percent } }),
  ]);
}
const folioDeposit = { number: 'BSP-EXT-1_Liabilities', name: 'Müller, Hans', type: 'Liabilities', parentNumber: '3010' };

describe('deposit release with taxes', () => {
  it('Release with taxes: 207.60 with 7.60 at 3.8 % is Collective 1101, Single 2030, C, gross 207.60 and tax 7.60, no finding', () => {
    const line = release({ netCents: 20_000, taxes: tax38(760) });
    const { bookings, findings, summary } = post([line]);
    expect(findings).toEqual([]);
    expect(bookings).toEqual([
      expect.objectContaining({ collectiveAccount: '1101', singleAccount: '2030', debitCredit: 'C', grossCents: 20_760, tax: { mwstCode: '313', percent: 3.8, taxCents: 760 } }),
    ]);
    expect(summary.deposits).toEqual({ receivedCents: 0, releasedCents: 20_760, refundedCents: 0 });
    expect(summary.depositVatByRate).toEqual([{ mwstCode: '313', ratePercent: 3.8, netCents: -20_000, vatCents: -760, grossCents: -20_760, apaleoVat: '-7.6' }]);
  });

  it('books the Hotel Beispiel releases, negative charges with taxes[], without a finding', () => {
    const lines = LEDGER.filter((line) => line.command === 'PostCharge' && line.credit.type === 'Liabilities' && line.grossCents < 0);
    expect(lines.map((line) => line.sourceEntryNumber)).toEqual(['BSPE0019', 'BSPE0021']);
    expect(inferReleaseRates(LEDGER, BEISPIEL_CHART).size).toBe(0);
    const { bookings, findings } = buildBookings(lines, BEISPIEL_MAPPING, BEISPIEL_CHART, OPTIONS);
    expect(findings).toEqual([]);
    expect(bookings.map((b) => [b.collectiveAccount, b.singleAccount, b.debitCredit, b.grossCents, b.tax?.taxCents])).toEqual([
      ['1101', '2030', 'C', 22_000, 2_000],
      ['1101', '2030', 'C', 16_500, 1_500],
    ]);
  });
});

describe('deposit release without taxes', () => {
  it('Release without taxes plus a PostPrepaymentVat pair: 3.8 % and 7.60 from the pair, the pair skipped as VAT_ACCOUNT_LINE, no E-VAT-UNEXPECTED', () => {
    const { bookings, skipped, findings } = post([release(), pair()]);
    expect(findings).toEqual([]);
    expect(bookings).toEqual([
      expect.objectContaining({ collectiveAccount: '1101', singleAccount: '2030', debitCredit: 'C', grossCents: 20_760, tax: { mwstCode: '313', percent: 3.8, taxCents: 760 }, sourceEntryNumbers: ['BSPE0021'] }),
    ]);
    expect(skipped.map((s) => [s.reason, s.line.sourceEntryNumber])).toEqual([['VAT_ACCOUNT_LINE', 'BSPE0022']]);
  });

  it('ignores a PostPrepaymentVat line of another day, reference or direction', () => {
    // The VAT booked when the deposit was received (debit Liabilities, credit VAT) goes the other way.
    const received = pair({ debit: liabilities, credit: ACCOUNTS.vatOnLiabilities38, sourceEntryNumber: 'BSPE0006' });
    for (const other of [pair({ businessDate: '2026-09-21' }), pair({ reference: 'BSP-OTHER-1' }), received]) {
      expect(codes(post([release(), other]).findings)).toEqual(['E-VAT-RATE-UNKNOWN']);
    }
  });

  it('infers the rate from the pair amount when the pair carries no tax entry', () => {
    // 7.60 of VAT on 207.60 matches 3.8 % (7.60), not 2.6 % (5.26) or 8.1 % (15.56).
    const { bookings, findings } = post([release(), pair({ taxes: [] })]);
    expect(findings).toEqual([]);
    expect(bookings[0]).toMatchObject({ singleAccount: '2030', tax: { percent: 3.8, taxCents: 760 } });
  });

  it('blocks a release whose tax differs from the pair by more than a cent with E-VAT-AMOUNT', () => {
    const { bookings, findings } = post([release(), pair({ grossCents: 700, taxes: tax38(700) })]);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-AMOUNT']);
    expect(findings[0]?.message).toContain('the tax contained in the deposit release is 7.60, but apaleo reversed 7.00 on the PostPrepaymentVat line BSPE0022');
  });

  it('warns once with W-VAT-ROUNDING when the pair is one cent off, books the pair\'s tax and allows the cent in the VAT check', () => {
    const { bookings, findings, summary, vatRoundingByRate } = post([release(), pair({ grossCents: 761, taxes: tax38(761) })]);
    expect(bookings).toEqual([expect.objectContaining({ grossCents: 20_760, tax: { mwstCode: '313', percent: 3.8, taxCents: 761 } })]);
    expect(codes(findings)).toEqual(['W-VAT-ROUNDING']);
    expect([...vatRoundingByRate]).toEqual([[3.8, 1]]);
    expect(summary.roundingCents).toBe(-1);
  });

  it('checks two releases of the same day and reference against their pair together, each with its own computed tax', () => {
    // 103.80 + 103.80: 3.80 + 3.80 = 7.60, one pair of 7.60 in apaleo.
    const lines = [release({ grossCents: 10_380 }), release({ grossCents: 10_380, sourceEntryNumber: 'BSPE0023' }), pair()];
    const { bookings, findings } = post(lines);
    expect(findings).toEqual([]);
    expect(bookings.map((b) => [b.grossCents, b.tax?.taxCents])).toEqual([
      [10_380, 380],
      [10_380, 380],
    ]);
  });

  it('Release with a chart rate only: 3.8 % of the Liabilities account or its parent, the tax 7.60 computed, W-VAT-INFERRED naming the line and the account', () => {
    const { bookings, findings } = buildBookings([release({ debit: folioDeposit })], KMU_MAPPING, chartWithDeposit(3.8), OPTIONS);
    expect(bookings).toEqual([
      expect.objectContaining({ collectiveAccount: '1101', singleAccount: '2030', debitCredit: 'C', grossCents: 20_760, tax: { mwstCode: '313', percent: 3.8, taxCents: 760 } }),
    ]);
    expect(codes(findings)).toEqual(['W-VAT-INFERRED']);
    expect(findings[0]?.message).toContain('apaleo entry BSPE0021');
    expect(findings[0]?.message).toContain('3.8 %, the VAT rate of account 3010');
    expect(findings[0]?.message).toContain('computes the tax 7.60 from the gross amount');
    expect(findings[0]?.message).not.toContain('Müller');
  });

  it('Release with no rate source: E-VAT-RATE-UNKNOWN names the entry and blocks the export instead of booking it at 0 %', () => {
    const { bookings, findings } = post([release()]);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-RATE-UNKNOWN']);
    expect(findings.every(isErrorFinding)).toBe(true);
    expect(findings[0]?.message).toContain('apaleo entry BSPE0021');
    expect(findings[0]?.message).toContain('there is no PostPrepaymentVat line of 2026-09-22 for reference BSP-MNOPQR-1');
    expect(findings[0]?.message).not.toContain('2039');
  });

  it('blocks a release whose pair lines carry two rates with E-VAT-RATE-UNKNOWN', () => {
    const normal = pair({ debit: { number: 'LiabilitiesVat_Normal:8.10', name: 'LiabilitiesVat Normal (8.1%)', type: 'VatOnLiabilities' }, taxes: [tax('Normal', 8.1, 100)], sourceEntryNumber: 'BSPE0024' });
    const { findings } = post([release(), pair(), normal]);
    expect(codes(findings)).toEqual(['E-VAT-RATE-UNKNOWN']);
    expect(findings[0]?.message).toContain('carry more than one rate (3.8 %, 8.1 %)');
  });

  it('blocks a release whose inferred rate the mapping books without Steuercode with E-VAT-MISSING', () => {
    const mapping = mappingWith(mappingRow({ apaleoAccount: '3010', apaleoType: 'Liabilities', apaleoVatPercent: '3.8', abacusAccount: '2039', mwstPercent: '0' }));
    const { bookings, findings } = buildBookings([release({ debit: folioDeposit })], mapping, chartWithDeposit(3.8), OPTIONS);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-MISSING']);
    expect(findings[0]?.message).toContain('settles a deposit taxed at 3.8 % (inferred from the chart of accounts, account 3010)');
  });
});

describe('chart rate of 0 %', () => {
  it('Release with a chart rate of 0 %: booked on the 0 % deposit row without MWST, still with W-VAT-INFERRED naming the 0 % rate', () => {
    const { bookings, findings } = buildBookings([release({ debit: folioDeposit })], KMU_MAPPING, chartWithDeposit(0), OPTIONS);
    expect(bookings).toEqual([expect.objectContaining({ collectiveAccount: '2039', singleAccount: '1101', debitCredit: 'D', grossCents: 20_760 })]);
    expect(bookings[0]?.tax).toBeUndefined();
    expect(codes(findings)).toEqual(['W-VAT-INFERRED']);
    expect(findings[0]?.message).toContain('0 %, the VAT rate of account 3010');
    expect(findings[0]?.message).toContain('so the booking carries no tax');
  });
});

describe('untaxed deposit lines other than releases', () => {
  // 103.80 at 3.8 %: 10380 × 3.8 / 103.8 = 3.80.
  const refund = (overrides: Partial<LedgerLine> = {}) =>
    release({ debit: liabilities, credit: ACCOUNTS.visa, command: 'Refund', grossCents: 10_380, netCents: 10_380, sourceEntryNumber: 'BSPE0031', ...overrides });
  const received = (overrides: Partial<LedgerLine> = {}) =>
    release({ debit: ACCOUNTS.visa, credit: liabilities, command: 'PostPrepayment', grossCents: 10_380, netCents: 10_380, sourceEntryNumber: 'BSPE0032', ...overrides });
  /** VAT reversed on the deposit (debit VAT on liabilities), as for a release. */
  const reversing = (overrides: Partial<LedgerLine> = {}) => pair({ grossCents: 380, taxes: tax38(380), sourceEntryNumber: 'BSPE0033', ...overrides });
  /** VAT booked on the deposit (credit VAT on liabilities), as on receipt. */
  const booking = (overrides: Partial<LedgerLine> = {}) => reversing({ debit: liabilities, credit: ACCOUNTS.vatOnLiabilities38, sourceEntryNumber: 'BSPE0034', ...overrides });

  it('Untaxed deposit refund with a PostPrepaymentVat line: 103.80 resolves to the 3.8 % row with gross 103.80 and tax 3.80 on 2030', () => {
    const { bookings, skipped, findings } = post([refund(), reversing()]);
    expect(findings).toEqual([]);
    expect(bookings).toEqual([
      expect.objectContaining({ collectiveAccount: '1090', singleAccount: '2030', debitCredit: 'C', grossCents: 10_380, tax: { mwstCode: '313', percent: 3.8, taxCents: 380 }, sourceEntryNumbers: ['BSPE0031'] }),
    ]);
    expect(skipped.map((s) => s.reason)).toEqual(['VAT_ACCOUNT_LINE']);
  });

  it('Untaxed prepayment received with a PostPrepaymentVat line: 103.80 on the 3.8 % row with tax -3.80', () => {
    const { bookings, findings } = post([received(), booking()]);
    expect(findings).toEqual([]);
    expect(bookings).toEqual([
      expect.objectContaining({ collectiveAccount: '1090', singleAccount: '2030', debitCredit: 'D', grossCents: 10_380, tax: { mwstCode: '313', percent: 3.8, taxCents: -380 }, sourceEntryNumbers: ['BSPE0032'] }),
    ]);
  });

  it('infers the rate from the pair amount when the pair of a prepayment received carries no tax entry', () => {
    const { bookings, findings } = post([received(), booking({ taxes: [] })]);
    expect(findings).toEqual([]);
    expect(bookings[0]).toMatchObject({ singleAccount: '2030' });
  });

  it('blocks a refund whose tax differs from the pair by more than one Rappen with E-VAT-AMOUNT', () => {
    const { bookings, findings } = post([refund(), reversing({ grossCents: 300, taxes: tax38(300) })]);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-AMOUNT']);
    expect(findings[0]?.message).toContain('the tax contained in the deposit line is 3.80, but apaleo reversed 3.00 on the PostPrepaymentVat line BSPE0033');
  });

  it('blocks a prepayment received whose tax differs from the pair with E-VAT-AMOUNT', () => {
    const { findings } = post([received(), booking({ grossCents: 300, taxes: tax38(300) })]);
    expect(codes(findings)).toEqual(['E-VAT-AMOUNT']);
    expect(findings[0]?.message).toContain('but apaleo booked 3.00 on the PostPrepaymentVat line BSPE0034');
  });

  // Without an MWST-Code the debited account is the Collective account: 2039 for the refund, 1090 for the receipt.
  const refundAt0 = expect.objectContaining({ collectiveAccount: '2039', singleAccount: '1090', debitCredit: 'D', grossCents: 10_380 });
  const receivedAt0 = expect.objectContaining({ collectiveAccount: '1090', singleAccount: '2039', debitCredit: 'D', grossCents: 10_380 });

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
    // 207.60 released (7.60) + 103.80 refunded (3.80) = 11.40 reversed on one pair line.
    const { bookings, findings } = post([release(), refund(), reversing({ grossCents: 1_140, taxes: tax38(1_140) })]);
    expect(findings).toEqual([]);
    expect(bookings.map((b) => [b.singleAccount, b.tax?.taxCents])).toEqual([
      ['2030', 760],
      ['2030', 380],
    ]);
  });

  it('blocks a refund whose pair lines carry two rates with E-VAT-RATE-UNKNOWN', () => {
    const normal = reversing({ debit: { number: 'LiabilitiesVat_Normal:8.10', name: 'LiabilitiesVat Normal (8.1%)', type: 'VatOnLiabilities' }, taxes: [tax('Normal', 8.1, 100)], sourceEntryNumber: 'BSPE0035' });
    const { bookings, findings } = post([refund(), reversing(), normal]);
    expect(bookings).toEqual([]);
    expect(codes(findings)).toEqual(['E-VAT-RATE-UNKNOWN']);
    expect(findings[0]?.message).toContain("it books a guest's deposit without a VAT amount");
  });
});
