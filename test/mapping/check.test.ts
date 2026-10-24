import { describe, expect, it } from 'vitest';
import { ChartIndex } from '../../src/core/chart.js';
import type { LedgerLine } from '../../src/core/source.js';
import { checkCoverage, checkMapping, checkUsedTaxes, rowRate, type CheckMappingOptions, type CoverageOptions, type Mapping, type MappingRowValues } from '../../src/mapping/index.js';
import { releaseRateOf } from '../../src/posting/index.js';
import { BSP, loadBeispielData } from '../helpers/apaleo.js';
import { FakeSource } from '../helpers/fake-source.js';
import { ledgerLine, tax } from '../helpers/ledger.js';
import { mappingOf, mappingRow } from '../helpers/mapping.js';

const check = (rows: MappingRowValues[], options: CheckMappingOptions = { version: 18 }) => checkMapping(mappingOf(rows), options);
const codes = (findings: { code: string }[]) => findings.map((f) => f.code);
const ACC7 = 'RevenueAccommodation_Reduced:7.00';
const revenue = (values: Partial<MappingRowValues> = {}) =>
  mappingRow({ apaleoAccount: ACC7, apaleoType: 'Revenues', apaleoVatPercent: '7', odooAccount: '8300', odooTax: 'tax_ust_7_skr03', taxPercent: '7', ...values });
const t7 = (cents: number) => [tax('Reduced', 7, cents)];

describe('Mapping validation for Odoo', () => {
  it('Valid mapping: passes rows at 7, 19 and 0 %, payments, guest ledger, company invoices, deposits and the Kurtaxe', () => {
    const findings = check([
      revenue(),
      mappingRow({ apaleoAccount: 'RevenueOther_Normal:19.00', apaleoType: 'Revenues', apaleoVatPercent: '19', odooAccount: '8400', odooTax: 'tax_ust_19_skr03', taxPercent: '19' }),
      mappingRow({ apaleoAccount: 'RevenueOther_Without:0.00', apaleoType: 'Revenues', apaleoVatPercent: '0', odooAccount: '8200', taxPercent: '0' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Payments', odooAccount: '1361' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Receivables', odooAccount: '1410' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'AccountsReceivable', odooAccount: '1401' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '7', odooAccount: '1711', odooTax: 'tax_ust_7_skr03', taxPercent: '7' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '0', odooAccount: '1719', taxPercent: '0' }),
      mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes', apaleoVatPercent: '0', odooAccount: '1590' }),
      mappingRow({ apaleoAccount: 'X', apaleoType: 'Revenues', apaleoVatPercent: '7', odooAccount: 'A.1', odooTax: 'account.1_tax_ust_7_skr03', taxPercent: '7' }),
    ]);
    expect(findings).toEqual([]);
  });

  it('VAT mismatch: revenue at 7 % mapped to 8400 with tax_ust_19_skr03 at 19 names the row and both rates', () => {
    const findings = check([revenue({ odooAccount: '8400', odooTax: 'tax_ust_19_skr03', taxPercent: '19' })]);
    expect(codes(findings)).toEqual(['E-VAT-MISMATCH']);
    expect(findings[0]?.message).toBe(
      `line 2: apaleo account ${ACC7} (Revenues) has VAT 7 %, but the row books 19 % on Odoo account 8400. Map it to an account for 7 % with the matching Odoo tax and tax_percent`,
    );
  });

  it('Swapped taxes: revenue at 19 % on 8400 with tax_ust_7_skr03 at 19 warns W-TAX-RATE naming the row, the tax (7 %) and the rate 19', () => {
    const findings = check([revenue({ apaleoVatPercent: '19', odooAccount: '8400', taxPercent: '19' })]);
    expect(codes(findings)).toEqual(['W-TAX-RATE']);
    expect(findings[0]?.message).toBe('line 2: the Odoo tax tax_ust_7_skr03 has the rate 7 % in Odoo, but the row books it at 19 %. Check that the taxes are not swapped');
  });

  it('Tax on a receivables row: 1200 Receivables to 1410 with tax_ust_7_skr03 at 7 reports E-TAX-NOT-ALLOWED naming the row', () => {
    const findings = check([mappingRow({ apaleoAccount: '1200', apaleoType: 'Receivables', odooAccount: '1410', odooTax: 'tax_ust_7_skr03', taxPercent: '7' })]);
    expect(codes(findings)).toEqual(['E-TAX-NOT-ALLOWED']);
    expect(findings[0]?.message).toContain('line 2: apaleo type Receivables is a payment, guest claim or company invoice and carries no VAT, but the row has the Odoo tax tax_ust_7_skr03');
  });

  it.each(['Payments', 'AccountsReceivable'])('also reports E-TAX-NOT-ALLOWED for a tax on a %s row', (apaleoType) => {
    expect(codes(check([mappingRow({ apaleoAccount: '*', apaleoType, odooAccount: '1361', odooTax: 'tax_ust_19_skr03', taxPercent: '19' })]))).toEqual(['E-TAX-NOT-ALLOWED']);
  });

  it('Untaxed revenue on an account with a default tax: SKR04 4200 at 0 % notes N-DEFAULT-TAX-ACCOUNT with the default tax 19 % and the explicit empty tax', () => {
    const findings = check([mappingRow({ apaleoAccount: 'R0', apaleoType: 'Revenues', apaleoVatPercent: '0', odooAccount: '4200', taxPercent: '0' })]);
    expect(codes(findings)).toEqual(['N-DEFAULT-TAX-ACCOUNT']);
    expect(findings[0]?.message).toContain("line 2: account 4200 carries the default tax 19 % in Odoo's SKR04 template");
    expect(findings[0]?.message).toContain('the file sets the line without tax explicitly');
  });

  it.each(['8300', '8400', '2401', '2406', '4300', '4400', '6931', '6936'])('notes N-DEFAULT-TAX-ACCOUNT for an untaxed row on %s, and nothing with its tax', (account) => {
    expect(codes(check([mappingRow({ apaleoAccount: 'R', apaleoType: 'Revenues', apaleoVatPercent: '0', odooAccount: account })]))).toEqual(['N-DEFAULT-TAX-ACCOUNT']);
    expect(codes(check([mappingRow({ apaleoAccount: 'R', apaleoType: 'Revenues', odooAccount: account, odooTax: '__import__.x', taxPercent: '7' })]))).toEqual(['W-TAX-UNCHECKED']);
  });

  it('Custom tax: revenue at 7 % on 8300 with __import__.ust_7_hotel warns W-TAX-UNCHECKED naming the tax', () => {
    const findings = check([revenue({ odooTax: '__import__.ust_7_hotel' })]);
    expect(codes(findings)).toEqual(['W-TAX-UNCHECKED']);
    expect(findings[0]?.message).toContain('the tool does not know the Odoo tax __import__.ust_7_hotel');
    expect(findings[0]?.message).toContain('Confirm with your Steuerberater that it is a sale tax of the Odoo company with the rate 7 %');
  });

  it('knows the l10n_de taxes also as account.<company>_<template id>, at their own rate', () => {
    expect(check([revenue({ odooTax: 'account.3_tax_ust_7_skr03' })])).toEqual([]);
    expect(codes(check([revenue({ odooTax: 'account.3_tax_ust_19_skr03' })]))).toEqual(['W-TAX-RATE']);
  });

  it('Swiss rate copied: 8.1 % on 8400 with tax_ust_19_skr03 warns W-VAT-RATE-UNUSUAL with the German rates and W-TAX-RATE for the tax', () => {
    const findings = check([revenue({ apaleoVatPercent: '8.1', odooAccount: '8400', odooTax: 'tax_ust_19_skr03', taxPercent: '8.1' })]);
    expect(codes(findings)).toEqual(['W-TAX-RATE', 'W-VAT-RATE-UNUSUAL']);
    expect(findings[1]?.message).toBe("line 2: tax_percent 8.1 % is not a German VAT rate (0 %, 7 %, 19 %). Was this row copied from another country's mapping?");
  });

  it.each([16, 5])('W-VAT-RATE-UNUSUAL at %s %% names the period 2020-07-01 to 2020-12-31', (percent) => {
    const findings = check([revenue({ apaleoVatPercent: String(percent), odooTax: '__import__.x', taxPercent: String(percent) })]);
    expect(findings.find((f) => f.code === 'W-VAT-RATE-UNUSUAL')?.message).toContain(`${percent} % applied from 2020-07-01 to 2020-12-31`);
  });

  it('Non-taxable tax on domestic revenue: 8200 with tax_not_taxable_skr03 at 0 warns W-TAX-KZ45 naming Kz 45 and that untaxed revenue carries no tax', () => {
    const findings = check([mappingRow({ apaleoAccount: 'R0', apaleoType: 'Revenues', apaleoVatPercent: '0', odooAccount: '8200', odooTax: 'tax_not_taxable_skr03', taxPercent: '0' })]);
    expect(codes(findings)).toEqual(['W-TAX-KZ45']);
    expect(findings[0]?.message).toContain('UStVA Kz 45 (nicht steuerbare Umsätze, Leistungsort im Ausland)');
    expect(findings[0]?.message).toContain('Domestic untaxed revenue, Schadenersatz and durchlaufende Posten such as a guest-owed Kurtaxe carry no tax at all');
  });

  it('Generated account: a Payments row on 1000 with odoo.version 18 notes N-GENERATED-ACCOUNT: a fresh SKR03 database has the Kasse on 1001 and no 1000', () => {
    const findings = check([mappingRow({ apaleoAccount: '1600', apaleoType: 'Payments', odooAccount: '1000' })]);
    expect(codes(findings)).toEqual(['N-GENERATED-ACCOUNT']);
    expect(findings[0]?.message).toContain('line 2: Odoo creates the Kasse and the Geldtransit account at company setup');
    expect(findings[0]?.message).toContain('A fresh SKR03 database of Odoo 18 has Kasse 1001, Geldtransit 1360 and no 1000');
    expect(findings[0]?.message).toContain('Kontenplan');
  });

  it('names the fresh codes of the configured version, for SKR04 too, and every version without one', () => {
    const transfer17 = check([mappingRow({ apaleoAccount: '*', apaleoType: 'Payments', odooAccount: '14601' })], { version: 17 });
    expect(transfer17[0]?.message).toContain('A fresh SKR04 database of Odoo 17 has Kasse 1601, Geldtransit 14601. Compare');
    const any = check([mappingRow({ apaleoAccount: '*', apaleoType: 'Payments', odooAccount: '1360' })], {});
    expect(any[0]?.message).toContain('Odoo 17: Kasse 1001, Geldtransit 13601; Odoo 18: Kasse 1001, Geldtransit 1360; Odoo 19: Kasse 1001, Geldtransit 1360');
  });

  it('notes N-GENERATED-ACCOUNT only on Payments rows: SKR03 1600 (Verbindlichkeiten) on a Liabilities row passes', () => {
    expect(check([mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '0', odooAccount: '1600', taxPercent: '0' })])).toEqual([]);
  });

  it('Rate without tax: E-TAX-MISSING; a tax without rate: E-VAT-RATE-MISSING; 0 % without tax passes', () => {
    expect(codes(check([revenue({ odooAccount: '8301', odooTax: '' })]))).toEqual(['E-TAX-MISSING', 'E-VAT-MISMATCH']);
    expect(check([revenue({ apaleoVatPercent: '0', odooAccount: '8200', odooTax: '', taxPercent: '0' })])).toEqual([]);
    const missing = check([revenue({ taxPercent: '' })]);
    expect(codes(missing)).toEqual(['E-VAT-RATE-MISSING']);
    expect(missing[0]?.message).toContain('the Odoo tax tax_ust_7_skr03 needs its rate in tax_percent (0 for a tax at 0 %)');
  });

  it('E-TAX-FORMAT: a tax name such as "19%" or one with spaces is refused, a template id and a full External ID pass', () => {
    for (const bad of ['19%', 'ust 19', 'a.b.c', 'Tax_UST']) expect(codes(check([revenue({ odooTax: bad })])), bad).toEqual(['E-TAX-FORMAT']);
    expect(codes(check([revenue({ odooTax: 'Module_1.Tax_UST_7' })]))).toEqual(['W-TAX-UNCHECKED']);
  });

  it('E-ACCOUNT-FORMAT: an account with a space, a dash or more than 64 characters; letters, digits and dots pass', () => {
    for (const bad of ['83 00', '8300-1', 'A'.repeat(65)]) expect(codes(check([revenue({ odooAccount: bad })])), bad).toEqual(['E-ACCOUNT-FORMAT']);
    expect(check([revenue({ odooAccount: 'X8300.a' })])).toEqual([]);
  });

  it('rejects a rate that is no percentage', () => {
    expect(codes(check([revenue({ taxPercent: 'seven' })]))).toEqual(['E-VAT-PERCENT']);
  });

  it('ignores rows for Vat and VatOnLiabilities accounts with a note', () => {
    const findings = check([
      mappingRow({ apaleoAccount: 'Vat_Reduced:7.00', apaleoType: 'Vat', odooTax: '!!' }),
      mappingRow({ apaleoAccount: 'LiabilitiesVat_Reduced:7.00', apaleoType: 'VatOnLiabilities' }),
    ]);
    expect(codes(findings)).toEqual(['N-VAT-ROW-IGNORED']);
    expect(findings[0]?.message).toContain('2 row(s) for Vat or VatOnLiabilities accounts (line 2, line 3) are ignored');
    expect(findings[0]?.message).toContain('Odoo computes the tax lines from the tax of the revenue or deposit line');
  });

  it('warns about unknown apaleo types', () => {
    expect(codes(check([mappingRow({ apaleoAccount: 'X', apaleoType: 'Revenue', odooAccount: '8400', odooTax: 'tax_ust_19_skr03', taxPercent: '19' })]))).toEqual(['W-UNKNOWN-TYPE']);
  });

  it('gives the rate of a row: tax_percent with an Odoo tax, 0 without one', () => {
    expect(rowRate(revenue())).toBe(7);
    expect(rowRate(revenue({ odooTax: '', taxPercent: '19' }))).toBe(0);
    expect(rowRate(revenue({ taxPercent: '' }))).toBeUndefined();
  });
});

describe('checkCoverage', () => {
  const lines = (overrides: Partial<LedgerLine>[]) => overrides.map((o) => ledgerLine(o));
  const coverage = (mapping: Mapping, ledger: LedgerLine[], chart?: ChartIndex, options: Partial<CoverageOptions> = {}) =>
    checkCoverage(mapping, ledger, chart, { rateOf: releaseRateOf(ledger, chart), ...options });
  const RECEIVABLES = mappingRow({ apaleoAccount: '*', apaleoType: 'Receivables', odooAccount: '1410' });

  it('New revenue account: reports 5010 with type, name, line count and gross total', () => {
    const mapping = mappingOf([RECEIVABLES]);
    const credit = { number: '5010', name: 'Spa', type: 'Revenues' };
    const findings = coverage(mapping, lines([{ credit, grossCents: 5000 }, { credit, grossCents: 2550 }]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: 'E-UNMAPPED', value: '5010' });
    expect(findings[0]?.message).toBe(
      'apaleo account 5010 (Revenues, "Spa") is not mapped (2 lines, gross 75.50): add a row with apaleo_account 5010, apaleo_type Revenues and an Odoo account and tax',
    );
  });

  it('treats a row without an Odoo account as unmapped and points at its line: Kurtaxe until the user fills it in', () => {
    const mapping = mappingOf([RECEIVABLES, mappingRow({ apaleoAccount: '3501', apaleoType: 'CityTaxes' })]);
    const [finding] = coverage(mapping, lines([{ credit: { number: '3501', name: 'Kurtaxe', type: 'CityTaxes' }, taxes: [] }]));
    expect(finding).toMatchObject({ code: 'E-UNMAPPED', value: '3501' });
    expect(finding?.message).toContain('fill in odoo_account on line 3');
  });

  it('suggests a rate wildcard with the SKR03 template account and tax for a VAT-relevant account without a row', () => {
    const credit = { number: 'BSP-X-1_Liabilities', name: 'Liabilities', type: 'Liabilities' };
    const [finding] = coverage(mappingOf([RECEIVABLES]), lines([{ credit, grossCents: 10_700, taxes: t7(700) }]));
    expect(finding?.message).toContain('add a row for BSP-X-1_Liabilities Liabilities, or a wildcard row `*;Liabilities` at 7 %, for example `*;Liabilities;;7;1711;tax_ust_7_skr03;7` from the SKR03 hotel template');
    const [other] = coverage(mappingOf([RECEIVABLES]), lines([{ credit, grossCents: 11_000, taxes: [tax('VeryReduced', 10, 1_000)] }]));
    expect(other?.message).toContain('a wildcard row `*;Liabilities` at 10 %, for example `*;Liabilities;;10;<Odoo account>;<Odoo tax>;10`');
  });

  it('Untaxed deposit release: resolves through the inferred 7 % wildcard, never through the 0 % row, and reports nothing', () => {
    const liabilities = { number: 'BSP-X-1_Liabilities', name: 'Liabilities', type: 'Liabilities' };
    const receivables = { number: 'BSP-X-1_Receivables', name: 'R', type: 'Receivables' };
    const release = ledgerLine({ debit: liabilities, credit: receivables, grossCents: 21_400, taxes: [], reference: 'BSP-X-1' });
    const without = ledgerLine({ debit: liabilities, credit: receivables, taxes: [tax('Without', 0, 0)] });
    const taxed = ledgerLine({ debit: liabilities, credit: receivables, grossCents: 21_400, taxes: t7(1_400) });
    const untaxedRevenue = ledgerLine({ credit: { number: 'R0', name: 'No VAT', type: 'Revenues' }, taxes: [] });
    const rateOf = releaseRateOf([release, without, taxed, untaxedRevenue], undefined);
    expect([release, without, taxed, untaxedRevenue].map(rateOf)).toEqual([undefined, undefined, 7, 0]);

    const pair = ledgerLine({
      debit: { number: 'LiabilitiesVat_Reduced:7.00', name: 'LiabilitiesVat Reduced (7%)', type: 'VatOnLiabilities' },
      credit: liabilities,
      command: 'PostPrepaymentVat',
      grossCents: 1_400,
      taxes: t7(1_400),
      reference: 'BSP-X-1',
    });
    expect(releaseRateOf([release, pair], undefined)(release)).toBe(7);

    // An untaxed refund resolves through the same pair; without it, it stays at 0 %.
    const refund = ledgerLine({ debit: liabilities, credit: { number: '1102', name: 'Visa', type: 'Payments' }, grossCents: 21_400, taxes: [], reference: 'BSP-X-1' });
    expect(releaseRateOf([refund, pair], undefined)(refund)).toBe(7);
    expect(releaseRateOf([refund], undefined)(refund)).toBe(0);

    const mapping = mappingOf([
      RECEIVABLES,
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '7', odooAccount: '1711', odooTax: 'tax_ust_7_skr03', taxPercent: '7' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '0', odooAccount: '1719', taxPercent: '0' }),
    ]);
    expect(coverage(mapping, [release, pair])).toEqual([]);
  });

  it('skips lines with a Vat or VatOnLiabilities side and accepts rates from the caller', () => {
    const mapping = mappingOf([
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '7', odooAccount: '1711', odooTax: 'tax_ust_7_skr03', taxPercent: '7' }),
      RECEIVABLES,
    ]);
    const liabilities = { number: 'BSP-X-1_Liabilities', name: 'Liabilities', type: 'Liabilities' };
    const vat = { number: 'LiabilitiesVat_Reduced:7.00', name: 'LiabilitiesVat', type: 'VatOnLiabilities' };
    const release = { debit: liabilities, credit: { number: 'BSP-X-1_Receivables', name: 'R', type: 'Receivables' }, taxes: [] };
    expect(coverage(mapping, lines([{ debit: liabilities, credit: vat }]))).toEqual([]);
    expect(codes(coverage(mapping, lines([release])))).toEqual(['E-VAT-RATE-UNKNOWN']);
    expect(coverage(mapping, lines([release]), undefined, { rateOf: () => 7 })).toEqual([]);
  });

  it('finds the unmapped accounts of the Hotel Beispiel fixtures through a FakeSource', async () => {
    const fake = new FakeSource(await loadBeispielData());
    const chart = new ChartIndex(await fake.getChartOfAccounts(BSP));
    const ledger = await fake.getLedger(BSP, '2026-09-14', '2026-09-23');
    const at10 = 'account_tax_template_sales_10_code029';
    const mapping = mappingOf([
      mappingRow({ apaleoAccount: 'RevenueAccommodation_VeryReduced:10.00', apaleoType: 'Revenues', apaleoVatPercent: '10', odooAccount: '4010', odooTax: at10, taxPercent: '10' }),
      mappingRow({ apaleoAccount: '1200', apaleoType: 'Receivables', odooAccount: '2000' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Payments', odooAccount: '2890' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '10', odooAccount: '3510', odooTax: at10, taxPercent: '10' }),
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '0', odooAccount: '3500', taxPercent: '0' }),
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
    const zero = mappingOf([RECEIVABLES, mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '0', odooAccount: '1719', taxPercent: '0' })]);
    const findings = coverage(zero, ledger);
    expect(codes(findings)).toEqual(['E-VAT-RATE-UNKNOWN']);
    expect(findings[0]).toMatchObject({ value: 'BSP-X-1_Liabilities' });
    expect(findings[0]?.message).toMatch(
      /^5 deposit releases \(5 lines, gross 250\.00, accounts BSP-X-1_Liabilities, BSP-X-2_Liabilities, BSP-X-3_Liabilities and 1 more\): apaleo settled a guest's prepaid deposit against the bill without a VAT amount, and the VAT rate cannot be found/,
    );
    expect(findings[0]?.message).not.toContain('1719');
  });

  it('Untaxed deposit release without deposit rows: an inferred 19 % asks for a * Liabilities row at 19 %', () => {
    const liabilities = { number: 'BSP-X-1_Liabilities', name: 'Liabilities', type: 'Liabilities' };
    const ledger = lines([
      { debit: liabilities, credit: { number: 'BSP-X-1_Receivables', name: 'R', type: 'Receivables' }, taxes: [], grossCents: 11_900, reference: 'BSP-X-1' },
      {
        debit: { number: 'LiabilitiesVat_Normal:19.00', name: 'LiabilitiesVat Normal (19%)', type: 'VatOnLiabilities' },
        credit: liabilities,
        command: 'PostPrepaymentVat',
        grossCents: 1_900,
        taxes: [tax('Normal', 19, 1_900)],
        reference: 'BSP-X-1',
      },
    ]);
    const mapping = mappingOf([
      RECEIVABLES,
      mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '7', odooAccount: '1711', odooTax: 'tax_ust_7_skr03', taxPercent: '7' }),
    ]);
    const [finding, ...rest] = coverage(mapping, ledger);
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ code: 'E-UNMAPPED', value: 'BSP-X-1_Liabilities' });
    expect(finding?.message).toContain('a wildcard row `*;Liabilities` at 19 %, for example `*;Liabilities;;19;1718;tax_ust_19_skr03;19` from the SKR03 hotel template');
  });

  describe('accounts of reservations and folios (outside the chart, with a parent)', () => {
    const chart = new ChartIndex([
      { number: '3000', name: 'Liabilities', type: 'Liabilities', ledger: 'guest', isArchived: false, hasChildren: true },
      { number: '9999', name: 'Accounts Receivable', type: 'AccountsReceivable', ledger: 'guest', isArchived: false, hasChildren: true },
    ]);
    const receivables = { number: 'R-1_Receivables', name: 'Receivables for Reservation R-1', type: 'Receivables', parentNumber: '1200' };
    const deposit = (id: string) => ({ number: `${id}_Liabilities/Reduced:7.00`, name: `Liabilities for Reservation ${id} (7%)`, type: 'Liabilities', parentNumber: '3000' });
    const base = [RECEIVABLES, mappingRow({ apaleoAccount: '*', apaleoType: 'Payments', odooAccount: '1360' })];
    const deposit7 = (id: string) => ledgerLine({ debit: receivables, credit: deposit(id), command: 'PostCharge', grossCents: -1_070, taxes: t7(-70) });

    it('Deposits under an empty parent without wildcards: one finding names 3000, line 40, three accounts and the wildcard row at 7 % with 1711 and tax_ust_7_skr03', () => {
      const filler = Array.from({ length: 36 }, (_, i) => mappingRow({ apaleoAccount: `H${i}`, apaleoType: 'House' }));
      const mapping = mappingOf([...base, ...filler, mappingRow({ apaleoAccount: '3000', apaleoType: 'Liabilities', apaleoName: 'Liabilities' })]);
      expect(mapping.rows.at(-1)?.line).toBe(40);
      const findings = coverage(mapping, ['A-1', 'B-1', 'C-1'].map(deposit7), chart);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ code: 'E-UNMAPPED', value: '3000' });
      expect(findings[0]?.message).toBe(
        '3 Liabilities accounts of reservations or folios under parent 3000 at 7 % (A-1_Liabilities/Reduced:7.00, B-1_Liabilities/Reduced:7.00, ' +
          'C-1_Liabilities/Reduced:7.00) are not mapped (3 lines, gross -32.10): the parent row for 3000 on line 40 has no Odoo account ' +
          'and does not apply to Liabilities at different VAT rates; add a wildcard row `*;Liabilities` at 7 %, for example ' +
          '`*;Liabilities;;7;1711;tax_ust_7_skr03;7` from the SKR03 hotel template',
      );
      expect(findings[0]?.message).not.toContain('fill in');
    });

    it('names an existing empty wildcard row by its line instead of asking to add it', () => {
      const mapping = mappingOf([
        ...base,
        mappingRow({ apaleoAccount: '3000', apaleoType: 'Liabilities', apaleoName: 'Liabilities' }),
        mappingRow({ apaleoAccount: '*', apaleoType: 'Liabilities', apaleoVatPercent: '7' }),
      ]);
      const [finding, ...rest] = coverage(mapping, [deposit7('A-1')], chart);
      expect(rest).toEqual([]);
      expect(finding?.message).toContain(
        'the parent row for 3000 on line 4 has no Odoo account and does not apply to Liabilities at different VAT rates; ' +
          'fill in odoo_account on the wildcard row for Liabilities at 7 % on line 5',
      );
      expect(finding?.message).not.toContain('add a wildcard row');
    });

    it('suggests the wildcard row with the template account when there is no parent row at all', () => {
      expect(coverage(mappingOf(base), [deposit7('A-1')], chart)[0]?.message).toMatch(/: add a wildcard row `\*;Liabilities` at 7 %, for example `\*;Liabilities;;7;1711;tax_ust_7_skr03;7` from the SKR03 hotel template$/);
    });

    it('Accounts receivable without a row: one finding for the account and its /Offset, suggesting a 9999 row or *;AccountsReceivable;;;1401 (Forderungen aus Lieferungen und Leistungen)', () => {
      const debtor = { number: 'AHTJTGFK-1_AccountsReceivable', name: 'AccountsReceivable for Reservation AHTJTGFK-1', type: 'AccountsReceivable', parentNumber: '9999' };
      const offset = { ...debtor, number: `${debtor.number}/Offset`, name: `${debtor.name} (Offset)` };
      const ledger = [
        ledgerLine({ debit: receivables, credit: offset, command: 'PostToAccountsReceivables', grossCents: -9500, taxes: [] }),
        ledgerLine({ debit: debtor, credit: offset, command: 'PostToAccountsReceivables', grossCents: 9500, taxes: [] }),
      ];
      const findings = coverage(mappingOf(base), ledger, chart);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toMatch(
        /^2 AccountsReceivable accounts of reservations or folios under parent 9999 \(AHTJTGFK-1_AccountsReceivable, AHTJTGFK-1_AccountsReceivable\/Offset\) are not mapped \(3 lines, gross [-\d.]+\): add a row for 9999 AccountsReceivable or the wildcard row `\*;AccountsReceivable;;;1401` \(Forderungen aus Lieferungen und Leistungen\)$/,
      );
    });

    it('passes once the AccountsReceivable wildcard exists', () => {
      const debtor = { number: 'AHTJTGFK-1_AccountsReceivable', name: 'AR', type: 'AccountsReceivable', parentNumber: '9999' };
      const mapping = mappingOf([...base, mappingRow({ apaleoAccount: '*', apaleoType: 'AccountsReceivable', odooAccount: '1401' })]);
      expect(coverage(mapping, [ledgerLine({ debit: debtor, credit: receivables, taxes: [] })], chart)).toEqual([]);
    });
  });

  it('Parent row with the wrong VAT rate: 5000 on 8400 at 19 % reports E-VAT-MISMATCH for 5011 and 5111 booked at 7 %', () => {
    const mapping = mappingOf([mappingRow({ apaleoAccount: '5000', apaleoType: 'Revenues', apaleoName: 'Revenues', odooAccount: '8400', odooTax: 'tax_ust_19_skr03', taxPercent: '19' }), RECEIVABLES]);
    const logis = { number: '5011', name: 'Logis', type: 'Revenues', parentNumber: '5000' };
    const breakfast = { number: '5111', name: 'Frühstück im Zimmerpreis', type: 'Revenues', parentNumber: '5000' };
    const minibar = { number: '5211', name: 'Minibar', type: 'Revenues', parentNumber: '5000' };
    const ledger = lines([
      { credit: logis, grossCents: 10_700, taxes: t7(700) },
      { credit: breakfast, grossCents: 1_070, taxes: t7(70) },
      { credit: breakfast, grossCents: 1_070, taxes: t7(70) },
      { credit: minibar, grossCents: 1_190, taxes: [tax('Normal', 19, 190)] },
    ]);
    const findings = coverage(mapping, ledger);
    expect(codes(findings)).toEqual(['E-VAT-MISMATCH', 'E-VAT-MISMATCH']);
    expect(findings.map((f) => f.value)).toEqual(['5011', '5111']);
    expect(findings[1]?.message).toBe(
      'apaleo account 5111 (Revenues, "Frühstück im Zimmerpreis") is booked at 7 % (2 lines, gross 21.40), ' +
        'but it uses line 2 (apaleo account 5000) of the mapping, which books 19 % on Odoo account 8400. ' +
        'Add a row for 5111 Revenues with an Odoo account and tax for 7 %',
    );
  });

  it('leaves the rate of a row with its own apaleo_vat_percent to checkMapping', () => {
    const mapping = mappingOf([revenue({ odooAccount: '8400', odooTax: 'tax_ust_19_skr03', taxPercent: '19' }), RECEIVABLES]);
    const line = ledgerLine({ credit: { number: ACC7, name: 'Accommodation', type: 'Revenues' }, grossCents: 10_700, netCents: 10_000, taxes: t7(700) });
    expect(coverage(mapping, [line])).toEqual([]);
    expect(codes(checkMapping(mapping))).toEqual(['E-VAT-MISMATCH']);
  });
});

describe('checkUsedTaxes', () => {
  const RECEIVABLES = mappingRow({ apaleoAccount: '*', apaleoType: 'Receivables', odooAccount: '1410' });
  const used = (rows: MappingRowValues[], ledger: LedgerLine[]) => checkUsedTaxes(mappingOf([RECEIVABLES, ...rows]), ledger, undefined, { rateOf: releaseRateOf(ledger, undefined) });
  const lodging = ledgerLine({ credit: { number: ACC7, name: 'Accommodation', type: 'Revenues' }, grossCents: 10_700, netCents: 10_000, taxes: t7(700) });

  it('Swapped tax on a used row: tax_ust_19_skr03 on the 7 % lodging row gives E-TAX-RATE-WRONG, although the posting guard passes it', () => {
    const findings = used([revenue({ odooTax: 'tax_ust_19_skr03' })], [lodging]);
    expect(codes(findings)).toEqual(['E-TAX-RATE-WRONG']);
    expect(findings[0]?.message).toBe(
      'line 3 of the mapping file: the Odoo tax tax_ust_19_skr03 has the rate 19 % in Odoo, but the row books it at 7 %. ' +
        "Odoo computes the tax at its own rate while the file fits the base for the row's rate, so the VAT would be wrong and Odoo would add an " +
        '"Automatic Balancing Line". Correct odoo_tax or tax_percent of the row (are the taxes swapped?), run mapping check and export again',
    );
    // mapping check itself keeps the warning.
    expect(check([revenue({ odooTax: 'tax_ust_19_skr03' })]).map((f) => f.code)).toContain('W-TAX-RATE');
  });

  it('warns W-TAX-UNCHECKED and W-TAX-KZ45 for used rows, and reports nothing for a known tax at its own rate', () => {
    expect(codes(used([revenue({ odooTax: '__import__.ust_7' })], [lodging]))).toEqual(['W-TAX-UNCHECKED']);
    const untaxed = ledgerLine({ credit: { number: 'R0', name: 'No VAT', type: 'Revenues' }, taxes: [] });
    expect(codes(used([mappingRow({ apaleoAccount: 'R0', apaleoType: 'Revenues', odooAccount: '8200', odooTax: 'tax_not_taxable_skr03', taxPercent: '0' })], [untaxed]))).toEqual(['W-TAX-KZ45']);
    expect(used([revenue()], [lodging])).toEqual([]);
  });

  it('Unused row with a custom tax: reports only the rows the lines resolve to', () => {
    const unused = mappingRow({ apaleoAccount: 'RevenueOther_Normal:19.00', apaleoType: 'Revenues', apaleoVatPercent: '19', odooAccount: '8400', odooTax: '__import__.spa', taxPercent: '19' });
    expect(used([revenue(), unused], [lodging])).toEqual([]);
  });

  it('gives one finding per warning that names every row it concerns', () => {
    const food = 'RevenueFoodAndBeverages_Reduced:7.00';
    const findings = used(
      [revenue({ odooTax: '__import__.ust_7' }), revenue({ apaleoAccount: food, odooTax: '__import__.ust_7' })],
      [lodging, ledgerLine({ credit: { number: food, name: 'Food', type: 'Revenues' }, grossCents: 1_070, netCents: 1_000, taxes: t7(70) })],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/^lines 3, 4 of the mapping file: the tool does not know the Odoo tax __import__\.ust_7/);
  });
});
