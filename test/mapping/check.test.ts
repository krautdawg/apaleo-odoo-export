import { describe, expect, it } from 'vitest';
import { ChartIndex } from '../../src/core/chart.js';
import type { LedgerLine } from '../../src/core/source.js';
import { checkCoverage, checkMapping, checkUsedMwstCodes, rowRate, type CheckMappingOptions, type CoverageOptions, type Mapping, type MappingRowValues } from '../../src/mapping/index.js';
import { releaseRateOf } from '../../src/posting/index.js';
import { BSP, loadBeispielData } from '../helpers/apaleo.js';
import { FakeSource } from '../helpers/fake-source.js';
import { ledgerLine, tax } from '../helpers/ledger.js';
import { mappingOf, mappingRow } from '../helpers/mapping.js';

const check = (rows: MappingRowValues[], options: CheckMappingOptions = {}) => checkMapping(mappingOf(rows), options);
const codes = (findings: { code: string }[]) => findings.map((f) => f.code);
const ACC38 = 'RevenueAccommodation_Special:3.80';
const revenue = (values: Partial<MappingRowValues> = {}) =>
  mappingRow({ apaleoAccount: ACC38, apaleoType: 'Revenues', apaleoVatPercent: '3.8', abacusAccount: '3400', mwstCode: '313', mwstPercent: '3.8', ...values });

describe('checkMapping', () => {
  it('Valid mapping: passes the KMU rows at 3.8, 8.1, 2.6 and 0 % with a Kostenstelle, Debitoren, payments, deposits and the Kurtaxe', () => {
    const findings = check([
      revenue(),
      revenue({ apaleoAccount: 'RevenueFoodAndBeverages_Normal:8.10', apaleoVatPercent: '8.1', abacusAccount: '3200', mwstCode: '311', mwstPercent: '8,1', kost: '20' }),
      revenue({ apaleoAccount: 'RevenueOther_Reduced:2.60', apaleoVatPercent: '2.6', abacusAccount: '3260', mwstCode: '312', mwstPercent: '2.6' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'AccountsReceivable', abacusAccount: '1102' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Payments', abacusAccount: '1090' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '3.8', abacusAccount: '2030', mwstCode: '313', mwstPercent: '3.8' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '0', abacusAccount: '2039', mwstPercent: '0' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'LossOfAccountsReceivable', apaleoVatPercent: '3.8', abacusAccount: '3805', mwstCode: '313', mwstPercent: '3.8', kost: '10' }),
      mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes', apaleoVatPercent: '0', abacusAccount: '2210' }),
    ]);
    expect(findings).toEqual([]);
  });

  it('VAT mismatch: revenue at 3.8 % mapped to 3500 with 311 at 8.1 % names the row and both rates', () => {
    const findings = check([revenue({ abacusAccount: '3500', mwstCode: '311', mwstPercent: '8.1' })]);
    expect(codes(findings)).toEqual(['E-VAT-MISMATCH']);
    expect(findings[0]?.message).toContain('line 2');
    expect(findings[0]?.message).toContain('VAT 3.8 %');
    expect(findings[0]?.message).toContain('books 8.1 % on Abacus account 3500');
  });

  it('Austrian mapping copied: 10 % on 3400 with code 1 warns W-VAT-RATE-UNUSUAL with the Swiss rates and W-MWST-CODE-UNCHECKED for code 1', () => {
    const findings = check([revenue({ apaleoVatPercent: '10', mwstCode: '1', mwstPercent: '10' })]);
    expect(codes(findings).sort()).toEqual(['W-MWST-CODE-UNCHECKED', 'W-VAT-RATE-UNUSUAL']);
    const unusual = findings.find((f) => f.code === 'W-VAT-RATE-UNUSUAL');
    expect(unusual?.message).toContain('line 2');
    expect(unusual?.message).toContain('is not a Swiss MWST rate (0 %, 2.6 %, 3.8 %, 8.1 %)');
    expect(unusual?.message).toContain('copied from a German or Austrian mapping');
    expect(findings.find((f) => f.code === 'W-MWST-CODE-UNCHECKED')?.message).toContain('the MWST-Code 1');
  });

  it.each([
    ['7.7', 'Normalsatz'],
    ['3.7', 'Sondersatz Beherbergung'],
    ['2.5', 'reduzierter Satz'],
  ])('Old rate: %s %% was the %s until 2023-12-31', (percent, what) => {
    const findings = check([revenue({ apaleoVatPercent: percent, mwstPercent: percent })]);
    const unusual = findings.find((f) => f.code === 'W-VAT-RATE-UNUSUAL');
    expect(unusual?.message).toContain(`${percent} % was the ${what} until 2023-12-31`);
  });

  it('Swapped codes: 313 on revenue at 8.1 % warns W-MWST-CODE-RATE naming the row, the code configured for Beherbergung at 3.8 % and the rate 8.1', () => {
    const findings = check([revenue({ apaleoVatPercent: '8.1', abacusAccount: '3500', mwstPercent: '8.1' })]);
    expect(codes(findings)).toEqual(['W-MWST-CODE-RATE']);
    expect(findings[0]?.message).toContain('line 2');
    expect(findings[0]?.message).toContain('the MWST-Code 313 is configured for Beherbergung at 3.8 % (abacus.mwstCodes.beherbergung), but the row books it at 8.1 %');
  });

  it('checks the configured codes of the Mandant instead of the KMU sample codes', () => {
    const mwstCodes = { normal: 'V81', reduziert: 'V26', beherbergung: 'V38' };
    expect(check([revenue({ mwstCode: 'V38' })], { mwstCodes })).toEqual([]);
    expect(codes(check([revenue()], { mwstCodes }))).toEqual(['W-MWST-CODE-UNCHECKED']);
    expect(check([revenue()], { mwstCodes })[0]?.message).toContain('In the Abacus KMU sample Mandant, 313 is "Beherbergung" (Ziffer 343 of the MWST-Abrechnung)');
  });

  it.each(['Payments', 'Receivables', 'AccountsReceivable'])('MWST-Code on a %s row: E-MWST-CODE-NOT-ALLOWED naming the row', (apaleoType) => {
    const findings = check([mappingRow({ apaleoAccount: '1200', apaleoType, abacusAccount: '1101', mwstCode: '313', mwstPercent: '3.8' })]);
    expect(codes(findings)).toEqual(['E-MWST-CODE-NOT-ALLOWED']);
    expect(findings[0]?.message).toContain('line 2');
    expect(findings[0]?.message).toContain(`apaleo type ${apaleoType} is a payment, guest claim or Debitor`);
    expect(findings[0]?.message).toContain('Abacus would book the MWST on this money or claim account');
  });

  it('Untaxed revenue with a code at rate 0: no E-MWST-CODE-MISSING or E-VAT-RATE-MISSING, W-MWST-CODE-UNCHECKED names 400 and Ziffer 230', () => {
    const findings = check([mappingRow({ apaleoAccount: 'RevenueOther_Without:0.00', apaleoType: 'Revenues', apaleoVatPercent: '0', abacusAccount: '3600', mwstCode: '400', mwstPercent: '0' })]);
    expect(codes(findings)).toEqual(['W-MWST-CODE-UNCHECKED']);
    expect(findings[0]?.message).toContain('the MWST-Code 400');
    expect(findings[0]?.message).toContain('Ziffer 230');
    expect(findings[0]?.message).toContain('Confirm with your Treuhänder');
  });

  it('Kurtaxe with the Ziffer-900 sample code: 490 names Ziffer 900 and says that a collected Kurtaxe is a durchlaufender Posten', () => {
    const findings = check([mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes', apaleoVatPercent: '0', abacusAccount: '2210', mwstCode: '490', mwstPercent: '0' })]);
    expect(codes(findings)).toEqual(['W-MWST-CODE-UNCHECKED']);
    expect(findings[0]?.message).toContain('490 is "Subvention Kurtaxen" (Ziffer 900');
    expect(findings[0]?.message).toContain('not for a Kurtaxe the hotel collects');
    expect(findings[0]?.message).toContain('a collected Kurtaxe is a durchlaufender Posten without MWST-Code or with a Ziffer-910 code such as 491');
    expect(check([mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes', apaleoVatPercent: '0', abacusAccount: '2210', mwstCode: '491', mwstPercent: '0' })])[0]?.message).toContain('Ziffer 910');
  });

  it('names a Vorsteuer code of the KMU sample Mandant as one', () => {
    expect(check([revenue({ mwstCode: '111' })])[0]?.message).toContain('it is a Vorsteuer code, but apaleo lines are sales');
  });

  it('Untaxed revenue without MWST-Code: W-UNTAXED-REVENUE says that the Abacus account must not carry a default MWST-Code', () => {
    const findings = check([mappingRow({ apaleoAccount: 'RevenueOther_Without:0.00', apaleoType: 'Revenues', apaleoVatPercent: '0', abacusAccount: '3600', mwstPercent: '0' })]);
    expect(codes(findings)).toEqual(['W-UNTAXED-REVENUE']);
    expect(findings[0]?.message).toContain('line 2');
    expect(findings[0]?.message).toContain('The Abacus account must not carry a default MWST-Code');
    expect(findings[0]?.message).toContain('"MWST berechnen"');
  });

  it('Kostenstelle on a payment row: W-KOST-IGNORED, and K10 is E-KOST-FORMAT; 1 to 11 digits pass', () => {
    const ignored = check([mappingRow({ apaleoAccount: '1102', apaleoType: 'Payments', abacusAccount: '1090', kost: '10' })]);
    expect(codes(ignored)).toEqual(['W-KOST-IGNORED']);
    expect(ignored[0]?.message).toContain('line 2');
    expect(ignored[0]?.message).toContain('Abacus accepts a Kostenstelle only on Erfolgskonten');
    expect(codes(check([mappingRow({ apaleoAccount: '1102', apaleoType: 'Payments', abacusAccount: '1090', kost: 'K10' })]))).toEqual(['E-KOST-FORMAT']);
    expect(codes(check([revenue({ kost: '123456789012' })]))).toEqual(['E-KOST-FORMAT']);
    expect(check([revenue({ kost: '12345678901' })])).toEqual([]);
  });

  it('Rate without MWST-Code: E-MWST-CODE-MISSING; a code without rate: E-VAT-RATE-MISSING', () => {
    expect(codes(check([mappingRow({ apaleoAccount: '9000', apaleoType: 'House', abacusAccount: '6000', mwstPercent: '8.1' })]))).toEqual(['E-MWST-CODE-MISSING']);
    // Without an MWST-Code Abacus books no MWST, so an 8.1 % apaleo account also mismatches.
    expect(codes(check([mappingRow({ apaleoAccount: 'X', apaleoType: 'Liabilities', apaleoVatPercent: '8.1', abacusAccount: '2031', mwstPercent: '8.1' })]))).toEqual([
      'E-MWST-CODE-MISSING',
      'E-VAT-MISMATCH',
    ]);
    expect(codes(check([revenue({ mwstPercent: '' })]))).toEqual(['E-VAT-RATE-MISSING']);
  });

  it('rejects an MWST-Code that is not 1 to 3 characters of A-Z, a-z and 0-9, and a rate that is no percentage', () => {
    for (const code of ['3133', 'V-8', 'ü1']) expect(codes(check([revenue({ mwstCode: code })])), code).toEqual(['E-MWST-CODE-FORMAT']);
    expect(codes(check([revenue({ mwstPercent: 'acht' })]))).toEqual(['E-VAT-PERCENT']);
  });

  it('Account with letters: 34OO and a 12-digit number report E-ACCOUNT-FORMAT with the rule of 1 to 11 digits', () => {
    for (const account of ['34OO', '123456789012', '34 00']) {
      const findings = check([mappingRow({ apaleoAccount: '9000', apaleoType: 'House', abacusAccount: account })]);
      expect(codes(findings), account).toEqual(['E-ACCOUNT-FORMAT']);
      expect(findings[0]?.message).toContain('1 to 11 digits');
    }
    expect(check([mappingRow({ apaleoAccount: '9000', apaleoType: 'House', abacusAccount: '12345678901' })])).toEqual([]);
    expect(check([mappingRow({ apaleoAccount: '9000', apaleoType: 'House', abacusAccount: '6' })])).toEqual([]);
  });

  it('ignores rows for Vat and VatOnLiabilities accounts with a note', () => {
    const findings = check([
      mappingRow({ apaleoAccount: 'Vat_Special:3.80', apaleoType: 'Vat', abacusAccount: 'x' }),
      mappingRow({ apaleoAccount: 'LiabilitiesVat_Special:3.80', apaleoType: 'VatOnLiabilities' }),
    ]);
    expect(codes(findings)).toEqual(['N-VAT-ROW-IGNORED']);
    expect(findings[0]?.message).toContain('2 row(s)');
    expect(findings[0]?.message).toContain('Abacus books the MWST from the TaxData');
  });

  it('warns about unknown apaleo types', () => {
    expect(codes(check([mappingRow({ apaleoAccount: '1', apaleoType: 'Revenue', abacusAccount: '3400' })]))).toEqual(['W-UNKNOWN-TYPE']);
  });

  it('gives the rate of a row: mwst_percent with an MWST-Code, 0 without one', () => {
    expect(rowRate({ mwstCode: '311', mwstPercent: '8,1' })).toBe(8.1);
    expect(rowRate({ mwstCode: '', mwstPercent: '' })).toBe(0);
    expect(rowRate({ mwstCode: '311', mwstPercent: '' })).toBeUndefined();
  });
});

describe('checkCoverage', () => {
  const lines = (overrides: Partial<LedgerLine>[]) => overrides.map((o) => ledgerLine(o));
  const coverage = (mapping: Mapping, ledger: LedgerLine[], chart?: ChartIndex, options: Partial<CoverageOptions> = {}) =>
    checkCoverage(mapping, ledger, chart, { rateOf: releaseRateOf(ledger, chart), ...options });
  const RECEIVABLES = mappingRow({ apaleoAccount: '*', apaleoType: 'Receivables', abacusAccount: '1101' });
  const t38 = (cents: number) => [tax('Special', 3.8, cents)];

  it('New revenue account: reports 5010 with type, name, line count and gross total', () => {
    const mapping = mappingOf([RECEIVABLES]);
    const credit = { number: '5010', name: 'Spa', type: 'Revenues' };
    const findings = coverage(mapping, lines([{ credit, grossCents: 5000 }, { credit, grossCents: 2550 }]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: 'E-UNMAPPED', value: '5010' });
    expect(findings[0]?.message).toBe(
      'apaleo account 5010 (Revenues, "Spa") is not mapped (2 lines, gross 75.50): add a row with apaleo_account 5010, apaleo_type Revenues and an Abacus account',
    );
  });

  it('treats a row without an Abacus account as unmapped and points at its line: Kurtaxe until the user fills it in', () => {
    const mapping = mappingOf([RECEIVABLES, mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes' })]);
    const [finding] = coverage(mapping, lines([{ credit: { number: '3501', name: 'Kurtaxe', type: 'CityTaxes' }, taxes: [] }]));
    expect(finding).toMatchObject({ code: 'E-UNMAPPED', value: '3501' });
    expect(finding?.message).toContain('fill in abacus_account on line 3');
  });

  it('suggests a rate wildcard with the MWST-Code of the rate for a VAT-relevant account without a row', () => {
    const credit = { number: 'BSP-X-1_Liabilities', name: 'Liabilities', type: 'Liabilities' };
    const [finding] = coverage(mappingOf([RECEIVABLES]), lines([{ credit, grossCents: 20_760, taxes: t38(760) }]));
    expect(finding?.message).toContain('or a wildcard row (*) for Liabilities at 3.8 %: `*;Liabilities;;3.8;<Abacus account>;313;3.8` (template: 2030)');
    const [v38] = coverage(mappingOf([RECEIVABLES]), lines([{ credit, grossCents: 20_760, taxes: t38(760) }]), undefined, { mwstCodes: { normal: 'V81', reduziert: 'V26', beherbergung: 'V38' } });
    expect(v38?.message).toContain('`*;Liabilities;;3.8;<Abacus account>;V38;3.8`');
  });

  it('Untaxed deposit release: resolves through the inferred 3.8 % wildcard, never through the 0 % row', () => {
    const liabilities = { number: 'BSP-X-1_Liabilities', name: 'Liabilities', type: 'Liabilities' };
    const receivables = { number: 'BSP-X-1_Receivables', name: 'R', type: 'Receivables' };
    const release = ledgerLine({ debit: liabilities, credit: receivables, grossCents: 20_760, taxes: [], reference: 'BSP-X-1' });
    const without = ledgerLine({ debit: liabilities, credit: receivables, taxes: [tax('Without', 0, 0)] });
    const taxed = ledgerLine({ debit: liabilities, credit: receivables, grossCents: 20_760, taxes: t38(760) });
    const untaxedRevenue = ledgerLine({ credit: { number: 'R0', name: 'No VAT', type: 'Revenues' }, taxes: [] });
    const rateOf = releaseRateOf([release, without, taxed, untaxedRevenue], undefined);
    expect([release, without, taxed, untaxedRevenue].map(rateOf)).toEqual([undefined, undefined, 3.8, 0]);

    const pair = ledgerLine({
      debit: { number: 'LiabilitiesVat_Special:3.80', name: 'LiabilitiesVat Special (3.8%)', type: 'VatOnLiabilities' },
      credit: liabilities,
      command: 'PostPrepaymentVat',
      grossCents: 760,
      taxes: t38(760),
      reference: 'BSP-X-1',
    });
    expect(releaseRateOf([release, pair], undefined)(release)).toBe(3.8);

    // An untaxed refund resolves through the same pair; without it, it stays at 0 %.
    const refund = ledgerLine({ debit: liabilities, credit: { number: '1102', name: 'Visa', type: 'Payments' }, grossCents: 20_760, taxes: [], reference: 'BSP-X-1' });
    expect(releaseRateOf([refund, pair], undefined)(refund)).toBe(3.8);
    expect(releaseRateOf([refund], undefined)(refund)).toBe(0);

    const mapping = mappingOf([
      RECEIVABLES,
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '3.8', abacusAccount: '2030', mwstCode: '313', mwstPercent: '3.8' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '0', abacusAccount: '2039', mwstPercent: '0' }),
    ]);
    expect(coverage(mapping, [release, pair])).toEqual([]);
  });

  it('skips lines with a Vat or VatOnLiabilities side and accepts rates from the caller', () => {
    const mapping = mappingOf([
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '3.8', abacusAccount: '2030', mwstCode: '313', mwstPercent: '3.8' }),
      RECEIVABLES,
    ]);
    const liabilities = { number: 'BSP-X-1_Liabilities', name: 'Liabilities', type: 'Liabilities' };
    const vat = { number: 'LiabilitiesVat_Special:3.80', name: 'LiabilitiesVat', type: 'VatOnLiabilities' };
    const release = { debit: liabilities, credit: { number: 'BSP-X-1_Receivables', name: 'R', type: 'Receivables' }, taxes: [] };
    expect(coverage(mapping, lines([{ debit: liabilities, credit: vat }]))).toEqual([]);
    expect(codes(coverage(mapping, lines([release])))).toEqual(['E-VAT-RATE-UNKNOWN']);
    expect(coverage(mapping, lines([release]), undefined, { rateOf: () => 3.8 })).toEqual([]);
  });

  it('finds the unmapped accounts of the Hotel Beispiel fixtures through a FakeSource', async () => {
    const fake = new FakeSource(await loadBeispielData());
    const chart = new ChartIndex(await fake.getChartOfAccounts(BSP));
    const ledger = await fake.getLedger(BSP, '2026-09-14', '2026-09-23');
    const mapping = mappingOf([
      mappingRow({ apaleoAccount: 'RevenueAccommodation_VeryReduced:10.00', apaleoType: 'Revenues', apaleoVatPercent: '10', abacusAccount: '3400', mwstCode: 'V10', mwstPercent: '10' }),
      mappingRow({ apaleoAccount: '1200', apaleoType: 'Receivables', abacusAccount: '1101' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Payments', abacusAccount: '1090' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '10', abacusAccount: '2030', mwstCode: 'V10', mwstPercent: '10' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '0', abacusAccount: '2039', mwstPercent: '0' }),
      mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes' }),
    ]);
    expect(coverage(mapping, ledger, chart).map((f) => [f.code, f.value])).toEqual([
      ['E-UNMAPPED', '9999'],
      ['E-UNMAPPED', '3501'],
      ['E-UNMAPPED', 'RevenueFoodAndBeverages_Normal:20.00'],
      ['E-UNMAPPED', 'RevenueFoodAndBeverages_VeryReduced:10.00'],
    ]);
  });

  it('Untaxed deposit release without a rate source: E-VAT-RATE-UNKNOWN once for all such lines, never naming the 0 % row', () => {
    const release = (n: number) => ({
      debit: { number: `BSP-X-${n}_Liabilities`, name: 'Liabilities', type: 'Liabilities' },
      credit: { number: `BSP-X-${n}_Receivables`, name: 'R', type: 'Receivables' },
      taxes: [],
      grossCents: 5000,
      reference: `BSP-X-${n}`,
    });
    const ledger = lines([release(1), release(2), release(3), release(4), release(1)]);
    const zero = mappingOf([RECEIVABLES, mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '0', abacusAccount: '2039', mwstPercent: '0' })]);
    const findings = coverage(zero, ledger);
    expect(codes(findings)).toEqual(['E-VAT-RATE-UNKNOWN']);
    expect(findings[0]).toMatchObject({ value: 'BSP-X-1_Liabilities' });
    expect(findings[0]?.message).toMatch(
      /^5 deposit releases \(5 lines, gross 250\.00, accounts BSP-X-1_Liabilities, BSP-X-2_Liabilities, BSP-X-3_Liabilities and 1 more\): apaleo settled a guest's prepaid deposit against the bill without a VAT amount, and the VAT rate cannot be found/,
    );
    expect(findings[0]?.message).not.toContain('2039');
  });

  it('Untaxed deposit release without deposit rows: an inferred 8.1 % asks for a * Liabilities row at 8.1 %', () => {
    const liabilities = { number: 'BSP-X-1_Liabilities', name: 'Liabilities', type: 'Liabilities' };
    const ledger = lines([
      { debit: liabilities, credit: { number: 'BSP-X-1_Receivables', name: 'R', type: 'Receivables' }, taxes: [], grossCents: 10_810, reference: 'BSP-X-1' },
      {
        debit: { number: 'LiabilitiesVat_Normal:8.10', name: 'LiabilitiesVat Normal (8.1%)', type: 'VatOnLiabilities' },
        credit: liabilities,
        command: 'PostPrepaymentVat',
        grossCents: 810,
        taxes: [tax('Normal', 8.1, 810)],
        reference: 'BSP-X-1',
      },
    ]);
    const mapping = mappingOf([
      RECEIVABLES,
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '3.8', abacusAccount: '2030', mwstCode: '313', mwstPercent: '3.8' }),
    ]);
    const [finding, ...rest] = coverage(mapping, ledger);
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ code: 'E-UNMAPPED', value: 'BSP-X-1_Liabilities' });
    expect(finding?.message).toContain('or a wildcard row (*) for Liabilities at 8.1 %: `*;Liabilities;;8.1;<Abacus account>;311;8.1` (template: 2031)');
  });

  describe('accounts of reservations and folios (outside the chart, with a parent)', () => {
    const chart = new ChartIndex([
      { number: '3000', name: 'Liabilities', type: 'Liabilities', ledger: 'guest', isArchived: false, hasChildren: true },
      { number: '9999', name: 'Accounts Receivable', type: 'AccountsReceivable', ledger: 'guest', isArchived: false, hasChildren: true },
    ]);
    const receivables = { number: 'R-1_Receivables', name: 'Receivables for Reservation R-1', type: 'Receivables', parentNumber: '1200' };
    const deposit = (id: string) => ({ number: `${id}_Liabilities/Special:3.80`, name: `Liabilities for Reservation ${id} (3.8%)`, type: 'Liabilities', parentNumber: '3000' });
    const base = [RECEIVABLES, mappingRow({ apaleoAccount: '*', apaleoType: 'Payments', abacusAccount: '1090' })];
    const deposit38 = (id: string) => ledgerLine({ debit: receivables, credit: deposit(id), command: 'PostCharge', grossCents: -1038, taxes: t38(-38) });

    it('Deposits under an empty parent without wildcards: one finding names 3000, line 40, three accounts and the wildcard row at 3.8 % with the template 2030', () => {
      const filler = Array.from({ length: 36 }, (_, i) => mappingRow({ apaleoAccount: `H${i}`, apaleoType: 'House' }));
      const mapping = mappingOf([...base, ...filler, mappingRow({ apaleoAccount: '3000', apaleoType: 'Liabilities', apaleoName: 'Liabilities' })]);
      expect(mapping.rows.at(-1)?.line).toBe(40);
      const findings = coverage(mapping, ['A-1', 'B-1', 'C-1'].map(deposit38), chart);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ code: 'E-UNMAPPED', value: '3000' });
      expect(findings[0]?.message).toBe(
        '3 Liabilities accounts of reservations or folios under parent 3000 at 3.8 % (A-1_Liabilities/Special:3.80, B-1_Liabilities/Special:3.80, ' +
          'C-1_Liabilities/Special:3.80) are not mapped (3 lines, gross -31.14): the parent row for 3000 on line 40 has no Abacus account ' +
          'and does not apply to Liabilities at different VAT rates; add a wildcard row `*;Liabilities;;3.8;<Abacus account>;313;3.8` (template: 2030)',
      );
      expect(findings[0]?.message).not.toContain('fill in');
    });

    it('names an existing empty wildcard row by its line instead of asking to add it', () => {
      const mapping = mappingOf([
        ...base,
        mappingRow({ apaleoAccount: '3000', apaleoType: 'Liabilities', apaleoName: 'Liabilities' }),
        mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '3.8' }),
      ]);
      const [finding, ...rest] = coverage(mapping, [deposit38('A-1')], chart);
      expect(rest).toEqual([]);
      expect(finding?.message).toContain(
        'the parent row for 3000 on line 4 has no Abacus account and does not apply to Liabilities at different VAT rates; ' +
          'fill in abacus_account on the wildcard row for Liabilities at 3.8 % on line 5',
      );
      expect(finding?.message).not.toContain('add a wildcard row');
    });

    it('suggests the wildcard row with the template account when there is no parent row at all', () => {
      expect(coverage(mappingOf(base), [deposit38('A-1')], chart)[0]?.message).toMatch(/: add a wildcard row `\*;Liabilities;;3\.8;<Abacus account>;313;3\.8` \(template: 2030\)$/);
    });

    it('Accounts receivable without a row: one finding for the debtor and its /Offset, suggesting a 9999 row or *;AccountsReceivable;;;1102 (Debitoren apaleo)', () => {
      const debtor = { number: 'AHTJTGFK-1_AccountsReceivable', name: 'AccountsReceivable for Reservation AHTJTGFK-1', type: 'AccountsReceivable', parentNumber: '9999' };
      const offset = { ...debtor, number: `${debtor.number}/Offset`, name: `${debtor.name} (Offset)` };
      const ledger = [
        ledgerLine({ debit: receivables, credit: offset, command: 'PostToAccountsReceivables', grossCents: -9500, taxes: [] }),
        ledgerLine({ debit: debtor, credit: offset, command: 'PostToAccountsReceivables', grossCents: 9500, taxes: [] }),
      ];
      const findings = coverage(mappingOf(base), ledger, chart);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toMatch(
        /^2 AccountsReceivable accounts of reservations or folios under parent 9999 \(AHTJTGFK-1_AccountsReceivable, AHTJTGFK-1_AccountsReceivable\/Offset\) are not mapped \(3 lines, gross [-\d.]+\): add a row for 9999 AccountsReceivable or the wildcard row `\*;AccountsReceivable;;;1102` \(Debitoren apaleo\)$/,
      );
    });

    it('passes once the AccountsReceivable wildcard exists', () => {
      const debtor = { number: 'AHTJTGFK-1_AccountsReceivable', name: 'AR', type: 'AccountsReceivable', parentNumber: '9999' };
      const mapping = mappingOf([...base, mappingRow({ apaleoAccount: '*', apaleoType: 'AccountsReceivable', abacusAccount: '1102' })]);
      expect(coverage(mapping, [ledgerLine({ debit: debtor, credit: receivables, taxes: [] })], chart)).toEqual([]);
    });
  });

  it('Parent row with the wrong VAT rate: 5000 on 3500 at 8.1 % reports E-VAT-MISMATCH for 5011 and 5111 booked at 3.8 %', () => {
    const mapping = mappingOf([mappingRow({ apaleoAccount: '5000', apaleoType: 'Revenues', apaleoName: 'Revenues', abacusAccount: '3500', mwstCode: '311', mwstPercent: '8.1' }), RECEIVABLES]);
    const logis = { number: '5011', name: 'Logis', type: 'Revenues', parentNumber: '5000' };
    const breakfast = { number: '5111', name: 'Frühstück im Zimmerpreis', type: 'Revenues', parentNumber: '5000' };
    const minibar = { number: '5211', name: 'Minibar', type: 'Revenues', parentNumber: '5000' };
    const ledger = lines([
      { credit: logis, grossCents: 20_760, taxes: t38(760) },
      { credit: breakfast, grossCents: 2_076, taxes: t38(76) },
      { credit: breakfast, grossCents: 2_076, taxes: t38(76) },
      { credit: minibar, grossCents: 1_081, taxes: [tax('Normal', 8.1, 81)] },
    ]);
    const findings = coverage(mapping, ledger);
    expect(codes(findings)).toEqual(['E-VAT-MISMATCH', 'E-VAT-MISMATCH']);
    expect(findings.map((f) => f.value)).toEqual(['5011', '5111']);
    expect(findings[1]?.message).toBe(
      'apaleo account 5111 (Revenues, "Frühstück im Zimmerpreis") is booked at 3.8 % (2 lines, gross 41.52), ' +
        'but it uses line 2 (apaleo account 5000) of the mapping, which books 8.1 % on Abacus account 3500. ' +
        'Add a row for 5111 Revenues with an Abacus account for 3.8 %',
    );
  });

  it('leaves the rate of a row with its own apaleo_vat_percent to checkMapping', () => {
    const mapping = mappingOf([revenue({ abacusAccount: '3500', mwstCode: '311', mwstPercent: '8.1' }), RECEIVABLES]);
    const line = ledgerLine({ credit: { number: ACC38, name: 'Accommodation', type: 'Revenues' }, grossCents: 20_760, netCents: 20_000, taxes: t38(760) });
    expect(coverage(mapping, [line])).toEqual([]);
    expect(codes(checkMapping(mapping))).toEqual(['E-VAT-MISMATCH']);
  });
});

describe('checkUsedMwstCodes', () => {
  const RECEIVABLES = mappingRow({ apaleoAccount: '*', apaleoType: 'Receivables', abacusAccount: '1101' });
  const credit = { number: ACC38, name: 'Logis', type: 'Revenues' };
  const logis = ledgerLine({ credit, grossCents: 20_760, netCents: 20_000, taxes: [tax('Special', 3.8, 760)] });
  const used = (rows: MappingRowValues[], ledger: LedgerLine[] = [logis], options: Partial<CoverageOptions> = {}) =>
    checkUsedMwstCodes(mappingOf(rows), ledger, undefined, { rateOf: releaseRateOf(ledger, undefined), ...options });

  it('Swapped codes: 311 on the 3.8 % accommodation row that a line uses warns W-MWST-CODE-RATE, although the posting guard passes it', () => {
    const findings = used([RECEIVABLES, revenue({ mwstCode: '311' })]);
    expect(findings.map((f) => [f.code, f.value])).toEqual([['W-MWST-CODE-RATE', '311']]);
    expect(findings[0]?.message).toBe(
      'line 3 of the mapping file: the MWST-Code 311 is configured for the Normalsatz at 8.1 % (abacus.mwstCodes.normal), but the row books it at 3.8 %. Check that the codes are not swapped',
    );
  });

  it('Vorsteuer code: 111 on a used row warns W-MWST-CODE-UNCHECKED with the Ziffer of the KMU sample', () => {
    const [finding] = used([RECEIVABLES, revenue({ mwstCode: '111' })]);
    expect(finding?.code).toBe('W-MWST-CODE-UNCHECKED');
    expect(finding?.message).toContain('it is a Vorsteuer code, but apaleo lines are sales');
  });

  it('reports only the rows the lines resolve to, and nothing for the configured codes at their own rate', () => {
    const unused = mappingRow({ apaleoAccount: 'RevenueOther_Normal:8.10', apaleoType: 'Revenues', apaleoVatPercent: '8.1', abacusAccount: '3200', mwstCode: '313', mwstPercent: '8.1' });
    expect(used([RECEIVABLES, revenue(), unused])).toEqual([]);
    expect(codes(checkMapping(mappingOf([RECEIVABLES, revenue(), unused])))).toEqual(['W-MWST-CODE-RATE']);
  });

  it('gives one finding per warning that names every row it concerns, and checks against abacus.mwstCodes', () => {
    const deposits = mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '3.8', abacusAccount: '2030', mwstCode: 'V38', mwstPercent: '3.8' });
    const prepayment = ledgerLine({
      debit: { number: '1090', name: 'Visa', type: 'Payments' },
      credit: { number: 'BSP-X-1_Liabilities', name: 'Liabilities', type: 'Liabilities' },
      command: 'PostPrepayment',
      grossCents: 20_760,
      netCents: 20_000,
      taxes: [tax('Special', 3.8, 760)],
    });
    const visa = mappingRow({ apaleoAccount: '1090', apaleoType: 'Payments', abacusAccount: '1090' });
    const rows = [RECEIVABLES, revenue({ mwstCode: 'V38' }), deposits, visa];
    const findings = used(rows, [logis, prepayment]);
    expect(findings.map((f) => [f.code, f.value])).toEqual([['W-MWST-CODE-UNCHECKED', 'V38']]);
    expect(findings[0]?.message).toMatch(/^lines 3, 4 of the mapping file: the tool does not know the MWST-Code V38 /);
    expect(used(rows, [logis, prepayment], { mwstCodes: { normal: 'V81', reduziert: 'V26', beherbergung: 'V38' } })).toEqual([]);
  });
});

describe('Swiss special-case warnings', () => {
  const kurtaxe = (values: Partial<MappingRowValues> = {}) => mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes', apaleoVatPercent: '0', abacusAccount: '2210', ...values });

  it('Kurtaxe mapped with MWST: a CityTaxes row on 3400 with 313 at 3.8 % warns W-KURTAXE-TAXED naming the row, its line and Ziff. 7.11', () => {
    const findings = check([kurtaxe({ apaleoVatPercent: '3.8', abacusAccount: '3400', mwstCode: '313', mwstPercent: '3.8' })]);
    expect(codes(findings)).toEqual(['W-KURTAXE-TAXED']);
    expect(findings[0]?.message).toContain('line 2: apaleo account 3501 (CityTaxes) is booked with the MWST-Code 313 at 3.8 %');
    expect(findings[0]?.message).toContain('durchlaufender Posten');
    expect(findings[0]?.message).toContain('ESTV MBI 08 Ziff. 7.11');
  });

  it.each(['SecondCityTax', 'GuestLevies'])('also warns W-KURTAXE-TAXED for a taxed %s row', (apaleoType) => {
    expect(codes(check([kurtaxe({ apaleoType, apaleoVatPercent: '3.8', abacusAccount: '3400', mwstCode: '313', mwstPercent: '3.8' })]))).toEqual(['W-KURTAXE-TAXED']);
  });

  it('Kurtaxe as durchlaufender Posten: no W-KURTAXE-TAXED without MWST-Code, nor with a Ziffer-910 code at rate 0', () => {
    expect(check([kurtaxe()])).toEqual([]);
    expect(codes(check([kurtaxe({ mwstCode: '491', mwstPercent: '0' })]))).toEqual(['W-MWST-CODE-UNCHECKED']);
  });

  it('No-show mapped with MWST: RevenueNoShow_Special:3.80 on 3400 with 313 at 3.8 % warns W-ANNULLATION-TAXED naming the row and Ziff. 8.7', () => {
    const findings = check([revenue({ apaleoAccount: 'RevenueNoShow_Special:3.80' })]);
    expect(codes(findings)).toEqual(['W-ANNULLATION-TAXED']);
    expect(findings[0]?.message).toContain('line 2: apaleo account RevenueNoShow_Special:3.80 (Revenues) is booked with the MWST-Code 313 at 3.8 %');
    expect(findings[0]?.message).toContain('Schadenersatz');
    expect(findings[0]?.message).toContain('ESTV MBI 08 Ziff. 8.7');
  });

  it('warns W-ANNULLATION-TAXED for apaleo cancellation fees and for a revenue row named after cancellations, never at 0 %', () => {
    expect(codes(check([revenue({ apaleoAccount: 'RevenueCancellationFees_Special:3.80' })]))).toEqual(['W-ANNULLATION-TAXED']);
    expect(codes(check([revenue({ apaleoAccount: '5090', apaleoName: 'Annullationskosten' })]))).toEqual(['W-ANNULLATION-TAXED']);
    expect(codes(check([revenue({ apaleoAccount: 'RevenueNoShow_Without:0.00', apaleoVatPercent: '0', abacusAccount: '3680', mwstCode: '', mwstPercent: '0' })]))).toEqual(['W-UNTAXED-REVENUE']);
    expect(check([revenue()])).toEqual([]);
  });
});
