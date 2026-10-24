import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { abacusTarget } from '../../src/abacus/index.js';
import { configSchema } from '../../src/core/config.js';
import { isErrorFinding } from '../../src/core/findings.js';
import type { TargetFileMeta } from '../../src/export/index.js';
import { buildBookings } from '../../src/posting/index.js';
import { changedLines, values } from '../helpers/abacus.js';
import { ENG } from '../helpers/apaleo.js';
import { CH_CHART, CH_LEDGER, CH_MAPPING } from '../helpers/ch-month.js';
import { describeUtf8Difference } from '../helpers/golden.js';

/**
 * The Swiss fixture month: Hotel Beispiel Engelberg (ENG), CHF, August 2026, 26
 * ledger lines (see test/fixtures/apaleo/ch-month/README.md), posted with what
 * `init-mapping --template kmu-hotel` writes on its chart and the Kurtaxe filled
 * in as a durchlaufender Posten on 2210 (test/fixtures/mapping/kmu-ch-month.csv).
 * Totals computed by hand; Abacus gets the gross amount and apaleo's tax:
 *
 * Beherbergung 3400 (313, 3.8 %): BRAVO 155.70, ALPHA 103.80 + 103.80, FOXTROT
 *   120.00, DELTA Halbpension 186.84 = 670.14; tax 5.70 + 3.80 × 2 + 4.39 + 6.84 =
 *   24.53, net 645.61. FOXTROT carries apaleo's precise values like the live data:
 *   net 115.60693642, tax 4.39306358, booked 4.39, and Abacus' check value
 *   120.00 × 3.8 / 103.8 = 4.3930… is 4.39 too, so no W-VAT-ROUNDING; apaleo's
 *   exact 313 revenue tax is 24.53306358.
 * Normalsatz 311 (8.1 %): dinner 54.05 and drinks 21.62 on 3200, minibar 10.81 on
 *   3500 = 86.48; tax 4.05 + 1.62 + 0.81 = 6.48, net 70.00 + 10.00.
 * Reduzierter Satz 312 (2.6 %): take-away 15.39 on 3260, tax 0.39, net 15.00.
 * Annullation without MWST on 3680: 80.00.
 * Kurtaxe on 2210 without MWST: 4.20 + 8.40 = 12.60.
 * Deposit 2030 (313): received 311.40 (tax 11.40), released 207.60 (tax 7.60) and
 *   refunded 103.80 (tax 3.80): deposit tax 11.40 − 7.60 − 3.80 = 0.
 * Write-off 3805 (313): FOXTROT 120.00 with the MWST correction 4.39 (apaleo
 *   4.39306358), net 115.61.
 * Payments: Kasse 1000 = 224.76 + 15.39 = 240.15; Transferkonto 1090 = Twint
 *   311.40 − 103.80 + Mastercard 8.40 + 80.00 = 296.00. Debitoren 1102: 208.46.
 * 1101 Soll (the charges as Collective account): 155.70 + 54.05 + 4.20 + 10.81 +
 *   103.80 + 103.80 + 8.40 + 80.00 + 15.39 + 120.00 + 186.84 + 21.62 = 864.61;
 *   Haben: release 207.60, write-off 120.00, payments 224.76 + 8.40 + 80.00 +
 *   15.39 and the AR transfer 208.46 = 864.61.
 * Skipped SAME_ACCOUNT: the /Offset second lines of four payments and the AR
 *   transfer, 224.76 + 8.40 + 80.00 + 15.39 + 208.46 = 537.01. 26 − 5 = 21
 *   bookings. The balances add up to the MWST Abacus books: 24.53 + 6.48 + 0.39 −
 *   4.39 = 27.01.
 */
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const GOLDEN = new URL('../golden/abacus/ch-month.xml', import.meta.url);

const result = buildBookings(CH_LEDGER, CH_MAPPING, CH_CHART, { text2: 'receipt' });

function meta(abacus: Record<string, unknown> = {}): TargetFileMeta {
  return {
    config: configSchema.parse({ abacus: { mandant: 1234, leitwaehrung: 'CHF', ...abacus }, properties: [{ id: ENG }] }),
    propertyId: ENG,
    part: { from: '2026-08-01', to: '2026-08-31', month: '2026-08', wjBeginn: '2026-01-01' },
    demo: false,
    createdAt: new Date('2026-09-02T07:00:00Z'),
  };
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('posting the Swiss fixture month', () => {
  it('books 21 of the 26 lines, skips 5 and raises no finding', () => {
    expect(CH_LEDGER).toHaveLength(26);
    expect(CH_LEDGER.every((line) => line.currency === 'CHF')).toBe(true);
    expect(result.bookings).toHaveLength(21);
    expect(result.skipped.map((s) => s.reason)).toEqual(Array(5).fill('SAME_ACCOUNT'));
    expect(result.findings).toEqual([]);
  });

  it('books every line as recorded by hand', () => {
    const rows = result.bookings.map((b) => [b.businessDate, b.collectiveAccount, b.singleAccount, b.debitCredit, b.grossCents, b.tax?.mwstCode ?? '', b.tax?.taxCents ?? null, b.text1, b.text2]);
    expect(rows).toEqual([
      ['2026-08-03', '1090', '2030', 'D', 31_140, '313', -1_140, 'Anzahlung 3,8 %', 'PSP-ENG-0001'],
      ['2026-08-10', '1101', '3400', 'D', 15_570, '313', -570, 'Erlös Beherbergung 3,8 %', 'ENG-BRAVO-1-V1'],
      ['2026-08-10', '1101', '3200', 'D', 5_405, '311', -405, 'Erlös Speisen und Getränke 8,1 %', 'ENG-BRAVO-1-V1'],
      ['2026-08-10', '1101', '2210', 'D', 420, '', null, 'Kurtaxe', 'ENG-BRAVO-1-V1'],
      ['2026-08-10', '1101', '3500', 'D', 1_081, '311', -81, 'Erlös Übrige Erlöse 8,1 %', 'ENG-BRAVO-1-V1'],
      ['2026-08-11', '1000', '1101', 'D', 22_476, '', null, 'Zahlung Bar', 'KASSE-ENG-1'],
      ['2026-08-12', '1101', '3400', 'D', 10_380, '313', -380, 'Erlös Beherbergung 3,8 %', 'ENG-ALPHA-1-V1'],
      ['2026-08-12', '1101', '3400', 'D', 10_380, '313', -380, 'Erlös Beherbergung 3,8 %', 'ENG-ALPHA-1-V1'],
      ['2026-08-12', '1101', '2210', 'D', 840, '', null, 'Kurtaxe', 'ENG-ALPHA-1-V1'],
      ['2026-08-12', '1101', '2030', 'C', 20_760, '313', 760, 'Auflösung Anzahlung 3,8 %', 'ENG-ALPHA-1-V1'],
      ['2026-08-12', '1090', '2030', 'C', 10_380, '313', 380, 'Rückzahlung Anzahlung 3,8 %', 'PSP-ENG-0002'],
      ['2026-08-12', '1090', '1101', 'D', 840, '', null, 'Zahlung Mastercard', 'PSP-ENG-0003'],
      ['2026-08-14', '1101', '3680', 'D', 8_000, '', null, 'Erlös Annullation 0 %', 'ENG-CHARLIE-1-V1'],
      ['2026-08-14', '1090', '1101', 'D', 8_000, '', null, 'Zahlung Mastercard', 'PSP-ENG-0004'],
      ['2026-08-17', '1101', '3260', 'D', 1_539, '312', -39, 'Erlös Speisen und Getränke 2,6 %', 'TAKEAWAY-ENG-1'],
      ['2026-08-17', '1000', '1101', 'D', 1_539, '', null, 'Zahlung Bar', 'TAKEAWAY-ENG-1'],
      ['2026-08-18', '1101', '3400', 'D', 12_000, '313', -439, 'Erlös Beherbergung 3,8 %', 'ENG-FOXTROT-1-V1'],
      ['2026-08-20', '1101', '3400', 'D', 18_684, '313', -684, 'Erlös Beherbergung 3,8 %', 'ENG-DELTA-1-V1'],
      ['2026-08-20', '1101', '3200', 'D', 2_162, '311', -162, 'Erlös Speisen und Getränke 8,1 %', 'ENG-DELTA-1-V1'],
      ['2026-08-20', '1102', '1101', 'D', 20_846, '', null, 'Forderung an Debitor', 'ENG-2026-0815'],
      ['2026-08-28', '1101', '3805', 'C', 12_000, '313', 439, 'Debitorenverlust 3,8 %', 'ENG-FOXTROT-1-V1'],
    ]);
  });

  it('matches the hand-computed summary', () => {
    expect(result.summary).toEqual({
      accounts: [
        { account: '1000', sollCents: 24_015, habenCents: 0, balanceCents: 24_015 },
        { account: '1090', sollCents: 39_980, habenCents: 10_380, balanceCents: 29_600 },
        { account: '1101', sollCents: 86_461, habenCents: 86_461, balanceCents: 0 },
        { account: '1102', sollCents: 20_846, habenCents: 0, balanceCents: 20_846 },
        { account: '2030', sollCents: 30_000, habenCents: 30_000, balanceCents: 0 },
        { account: '2210', sollCents: 0, habenCents: 1_260, balanceCents: -1_260 },
        { account: '3200', sollCents: 0, habenCents: 7_000, balanceCents: -7_000 },
        { account: '3260', sollCents: 0, habenCents: 1_500, balanceCents: -1_500 },
        { account: '3400', sollCents: 0, habenCents: 64_561, balanceCents: -64_561 },
        { account: '3500', sollCents: 0, habenCents: 1_000, balanceCents: -1_000 },
        { account: '3680', sollCents: 0, habenCents: 8_000, balanceCents: -8_000 },
        { account: '3805', sollCents: 11_561, habenCents: 0, balanceCents: 11_561 },
      ],
      revenueByRate: [
        { mwstCode: '', ratePercent: 0, netCents: 8_000, vatCents: 0, grossCents: 8_000, apaleoVat: '0' },
        { mwstCode: '312', ratePercent: 2.6, netCents: 1_500, vatCents: 39, grossCents: 1_539, apaleoVat: '0.39' },
        { mwstCode: '313', ratePercent: 3.8, netCents: 64_561, vatCents: 2_453, grossCents: 67_014, apaleoVat: '24.53306358' },
        { mwstCode: '311', ratePercent: 8.1, netCents: 8_000, vatCents: 648, grossCents: 8_648, apaleoVat: '6.48' },
      ],
      depositVatByRate: [{ mwstCode: '313', ratePercent: 3.8, netCents: 0, vatCents: 0, grossCents: 0, apaleoVat: '0' }],
      writeOffsByRate: [{ mwstCode: '313', ratePercent: 3.8, netCents: 11_561, vatCents: 439, grossCents: 12_000, apaleoVat: '4.39306358' }],
      cityTaxCents: 1_260,
      levies: [{ account: '2210', mwstCode: '', ratePercent: 0, grossCents: 1_260, vatCents: 0 }],
      payments: [
        { account: '1000', cents: 24_015 },
        { account: '1090', cents: 29_600 },
      ],
      deposits: { receivedCents: 31_140, releasedCents: 31_140, refundedCents: 10_380 },
      accountsReceivableCents: 20_846,
      skipped: [{ reason: 'SAME_ACCOUNT', lines: 5, grossCents: 53_701 }],
      roundingCents: 0,
      findings: [],
    });
    const balance = result.summary.accounts.reduce((sum, account) => sum + account.balanceCents, 0);
    expect(balance).toBe(2_453 + 648 + 39 - 439);
  });

  it('carries 311 at 8.1 %, 312 at 2.6 % or 313 at 3.8 % on every taxed booking, in whole Rappen without 5-Rappen rounding, and no E- finding', () => {
    const codeRates = new Set(result.bookings.flatMap((b) => (b.tax ? [`${b.tax.mwstCode} ${b.tax.percent}`] : [])));
    expect([...codeRates].sort()).toEqual(['311 8.1', '312 2.6', '313 3.8']);
    const amounts = result.bookings.flatMap((b) => [b.grossCents, b.tax?.taxCents ?? 0]);
    expect(amounts.every(Number.isInteger)).toBe(true);
    expect(amounts.some((cents) => cents % 5 !== 0)).toBe(true);
    expect(result.findings.filter(isErrorFinding)).toEqual([]);
  });

  it('carries apaleo\'s sub-Rappen precise net and tax on FOXTROT, books the tax rounded to the Rappen, and raises no W-VAT-ROUNDING', () => {
    const precise = CH_LEDGER.filter((line) => line.taxes.some((tax) => /\.\d{3,}$/.test(tax.amountPrecise)));
    expect(precise.map((line) => [line.sourceEntryNumber, line.netPrecise, line.taxes.map((tax) => tax.amountPrecise)])).toEqual([
      ['ENGE0017', '115.60693642', ['4.39306358']],
      ['ENGE0021', '115.60693642', ['4.39306358']],
    ]);
    expect(result.bookings.filter((b) => b.text2 === 'ENG-FOXTROT-1-V1').map((b) => [b.grossCents, b.tax?.taxCents])).toEqual([
      [12_000, -439],
      [12_000, 439],
    ]);
    expect(result.summary.roundingCents).toBe(0);
    expect(result.findings.map((f) => f.code)).not.toContain('W-VAT-ROUNDING');
  });

  it('keeps every apaleo line traceable: booked or skipped', () => {
    const booked = result.bookings.flatMap((b) => b.sourceEntryNumbers);
    const skipped = result.skipped.map((s) => s.line.sourceEntryNumber);
    expect([...booked, ...skipped].sort()).toEqual(CH_LEDGER.map((line) => line.sourceEntryNumber).sort());
  });

  it('Golden file of the Swiss month: renders with abacusTarget to test/golden/abacus/ch-month.xml, CHF in every booking', () => {
    const { bytes, findings } = abacusTarget.render(result.bookings, meta());
    expect(findings).toEqual([]);
    if (UPDATE) writeFileSync(GOLDEN, bytes);
    expect(existsSync(GOLDEN), 'missing ch-month.xml; run UPDATE_GOLDEN=1 pnpm test').toBe(true);
    const difference = describeUtf8Difference(new Uint8Array(readFileSync(GOLDEN)), bytes);
    expect(difference, `ch-month.xml differs from the writer output:\n${difference ?? ''}`).toBeUndefined();
    const xml = text(bytes);
    expect(xml.match(/<Transaction /g)).toHaveLength(21);
    expect(values(xml, 'KeyCurrency')).toEqual(Array(21).fill('CHF'));
    expect(new Set(values(xml, 'Currency'))).toEqual(new Set(['CHF']));
  });

  it('Same month with vereinnahmte Entgelte: identical bookings, only UseCode and the Collective TaxAccount change', () => {
    const vereinbart = text(abacusTarget.render(result.bookings, meta()).bytes);
    const vereinnahmt = text(abacusTarget.render(result.bookings, meta({ abrechnungsart: 'vereinnahmt' })).bytes);
    const changes = changedLines(vereinbart, vereinnahmt);
    const taxed = result.bookings.filter((b) => b.tax).length;
    expect(taxed).toBe(13);
    // The Parameter block carries no Abrechnungsart: every change is in a taxed booking.
    expect(changes.map(([, before, after]) => [before, after]).sort()).toEqual(
      [
        ...Array<[string, string]>(taxed).fill(['<TaxAccount>2200</TaxAccount>', '<TaxAccount>2202</TaxAccount>']),
        ...Array<[string, string]>(taxed).fill(['<UseCode>0</UseCode>', '<UseCode>1</UseCode>']),
      ].sort(),
    );
  });
});
