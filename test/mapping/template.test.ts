import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ChartIndex } from '../../src/core/chart.js';
import type { AccountRef, AccountType, SourceAccount } from '../../src/core/source.js';
import {
  BEVERAGE_NAME_PATTERN,
  FOOD_NAME_PATTERN,
  SUGGESTION_MARK,
  TEMPLATE_NAMES,
  checkCoverage,
  checkMapping,
  loadTemplate,
  mappingHeaderComment,
  parseTemplate,
  resolve,
  shippedTemplate,
  suggestRows,
  templateSuggestions,
  templateWildcard,
  type MappingRowValues,
  type Template,
  type TemplateSettings,
} from '../../src/mapping/index.js';
import { loadLiveData } from '../helpers/apaleo.js';
import { GERMAN_CHART } from '../helpers/german-chart.js';
import { ledgerLine } from '../helpers/ledger.js';
import { mappingOf } from '../helpers/mapping.js';

const SETTINGS: TemplateSettings = { version: 18 };

const account = (number: string, name: string, type: AccountType, extra: Partial<SourceAccount> = {}): SourceAccount => ({
  number,
  name,
  type,
  ledger: 'global',
  isArchived: false,
  hasChildren: false,
  ...extra,
});
const rate = (percent: number) => ({ vat: { type: percent === 0 ? 'Without' : 'Normal', percent } });

const find = (rows: MappingRowValues[], number: string, type?: string) =>
  rows.find((r) => r.apaleoAccount === number && (type === undefined || r.apaleoType === type));
const wildcard = (rows: MappingRowValues[], type: string, percent = '') => rows.find((r) => r.apaleoAccount === '*' && r.apaleoType === type && r.apaleoVatPercent === percent);
const mapped = (row: MappingRowValues | undefined) => row && [row.odooAccount, row.odooTax, row.taxPercent];

const skr03 = await loadTemplate('skr03-hotel');
const skr04 = await loadTemplate('skr04-hotel');
const suggest = (accounts: readonly SourceAccount[], template: Template = skr03, settings: TemplateSettings = SETTINGS) => suggestRows(accounts, template, settings);

/** Every rule of a template with an account as a mapping row, so `checkMapping` can check the codes and taxes. */
function templateRows(t: Template): MappingRowValues[] {
  const rows = suggestRows([], { ...t, rules: t.rules.map((rule) => ({ ...rule, wildcard: true })) }, SETTINGS);
  return rows.filter((row) => row.odooAccount !== '').map((row, i) => ({ ...row, apaleoAccount: `${i}`, comment: '' }));
}

describe.each([
  ['skr03-hotel', skr03, 'skr03'],
  ['skr04-hotel', skr04, 'skr04'],
] as const)('SKR hotel templates for Odoo: %s', (name, template, chart) => {
  it('names its version, marks every rule "Vorschlag (ungeprüft)" and names the source with the check date', () => {
    expect(template.id).toBe(`${name}@2`);
    expect(template.chart).toBe(chart);
    expect(template.rules.length).toBeGreaterThan(25);
    for (const rule of template.rules) {
      expect(rule.comment.startsWith(SUGGESTION_MARK), `line ${rule.line}`).toBe(true);
      expect(rule.comment, `line ${rule.line}`).toContain('geprüft 2026-10-24');
      expect(rule.odooAccount, `line ${rule.line}`).toMatch(/^(\d{4}|\{cash\}|\{transfer\})?$/);
      expect(['', `tax_ust_7_${chart}`, `tax_ust_19_${chart}`]).toContain(rule.odooTax);
      expect(rule.comment, `line ${rule.line}`).not.toMatch(/MWST|Treuhänder|«|»/);
    }
    expect(shippedTemplate(name)).toEqual(template);
  });

  it('passes the mapping check: every rule with an account has a valid code, a known tax at its own rate and a German rate', () => {
    const findings = checkMapping(mappingOf(templateRows(template)), { version: 18 });
    expect(findings.filter((f) => !['N-DEFAULT-TAX-ACCOUNT', 'N-GENERATED-ACCOUNT'].includes(f.code))).toEqual([]);
  });

  it('ships a template file that is valid UTF-8 with CRLF and a comment on every rule', () => {
    const text = readFileSync(new URL(`../../templates/${name}.rules.csv`, import.meta.url), 'utf8');
    expect(text.split('\n').every((line) => line === '' || line.endsWith('\r'))).toBe(true);
    expect(text.split('\n')[0]).toContain(`${name}@2`);
    expect(template.rules.every((rule) => rule.comment !== '')).toBe(true);
  });
});

describe.each([
  ['skr03-hotel', skr03, { rev7: '8300', rev0: '8200', tax7: 'tax_ust_7_skr03', tax19: 'tax_ust_19_skr03', loss: ['2401', '2406', '2400'], kurtaxe: '1590' }],
  ['skr04-hotel', skr04, { rev7: '4300', rev0: '4200', tax7: 'tax_ust_7_skr04', tax19: 'tax_ust_19_skr04', loss: ['6931', '6936', '6930'], kurtaxe: '1370' }],
] as const)('Template rows for German special cases: %s', (_name, template, chart) => {
  const rows = suggest(GERMAN_CHART, template);

  it('Kurtaxe options in the comment: the CityTaxes row is empty and names 1590 / 1370 without tax for a guest-owed Kurtaxe, 7 % for a hotel-owed Übernachtungsteuer, § 10 Abs. 1 UStG and docs/mapping-guide.md', () => {
    const row = find(rows, '3501');
    expect(mapped(row)).toEqual(['', '', '']);
    for (const text of ['Kurtaxe, Kurbeitrag', '§ 10 Abs. 1 UStG', 'SKR03 1590 / SKR04 1370 ohne Steuer', 'Übernachtung- oder Beherbergungsteuer', 'Beherbergung zu 7 %', `${chart.rev7} mit ${chart.tax7}`, 'W-CITY-TAX-TAXED', 'docs/mapping-guide.md']) {
      expect(row?.comment).toContain(text);
    }
  });

  it('No-show at 7 %: RevenueNoShow_Reduced:7.00 and RevenueCancellationFees_Reduced:7.00 map to the 7 % revenue account with the comment on consideration or Schadenersatz and apaleo\'s VAT setting', () => {
    for (const number of ['RevenueNoShow_Reduced:7.00', 'RevenueCancellationFees_Reduced:7.00']) {
      const row = find(rows, number);
      expect(mapped(row), number).toEqual([chart.rev7, chart.tax7, '7']);
      expect(row?.comment).toContain('Entgelt für die Beherbergung (steuerbar) oder Schadenersatz (nicht steuerbar)');
      expect(row?.comment).toContain('USt-Einstellung des Kontos in apaleo');
    }
  });

  it('maps untaxed no-show and cancellation fees to the 0 % revenue account without tax, with the same decision for the Kanzlei', () => {
    for (const number of ['RevenueNoShow_Without:0.00', 'RevenueCancellationFees_Without:0.00']) {
      const row = find(rows, number);
      expect(mapped(row), number).toEqual([chart.rev0, '', '0']);
      expect(row?.comment).toContain('Stornogebühren ohne USt');
      expect(row?.comment).toContain('entscheidet die Kanzlei');
    }
  });

  it('matches cancellation and no-show names too: Storno, Stornierung, Cancellation, No-Show, Noshow', () => {
    const names = ['Stornogebühr', 'Stornierung', 'Cancellation fee', 'No-Show', 'Noshow Gebühr'];
    const named = suggest(names.map((name, i) => account(`N${i}`, name, 'Revenues', rate(7))), template);
    for (const [i, name] of names.entries()) expect(find(named, `N${i}`)?.comment, name).toContain('Schadenersatz');
  });

  it('maps a food account at 7 % with the comment on the Speisen rate from 2026-01-01, 19 % from 2024-01-01 to 2025-12-31, the warning by the day of the service and an own account for Speisen', () => {
    const names = ['Speisen', 'Frühstück', 'Restaurant', 'Essen', 'Küche', 'Halbpension', 'Vollpension', 'Catering', 'Bankett', 'Food', 'Breakfast'];
    const food = suggest(names.map((name, i) => account(`F${i}`, name, 'Revenues', rate(7))), template);
    for (const [i, name] of names.entries()) {
      const row = find(food, `F${i}`);
      expect(mapped(row), name).toEqual([chart.rev7, chart.tax7, '7']);
      expect(row?.comment, name).toContain('Speisen zu 7 % für Leistungen ab 2026-01-01');
      expect(row?.comment, name).toContain('vom 2024-01-01 bis 2025-12-31 19 %');
      expect(row?.comment, name).toContain('nicht mit dem Satz seines Leistungstags');
      expect(row?.comment, name).toContain('eigenes 7-%-Erlöskonto für Speisen');
      expect(row?.comment, name).toContain('W-FOOD-RATE');
    }
  });

  it('counts Essen, Essensgutschein, Abendessen and Mittagessen as food, but not Messen, Interessen or Interessentenpaket', () => {
    for (const name of ['Essen', 'Essensgutschein', 'Abendessen', 'Mittagessen', 'Abendessen Halbpension']) expect(FOOD_NAME_PATTERN.test(name), name).toBe(true);
    for (const name of ['Zuschlag Messen', 'Messen', 'Interessen', 'Interessentenpaket', 'Messezuschlag']) expect(FOOD_NAME_PATTERN.test(name), name).toBe(false);
    const named = suggest([account('M1', 'Zuschlag Messen', 'Revenues', rate(19)), account('M2', 'Abendessen', 'Revenues', rate(7))], template);
    expect(find(named, 'M1')?.comment).not.toContain('Speisen zu 7 %');
    expect(mapped(find(named, 'M2'))).toEqual([chart.rev7, chart.tax7, '7']);
  });

  it('uses the food and beverage patterns of W-FOOD-RATE in its rules', () => {
    const food = template.rules.find((rule) => rule.apaleoType === 'Revenues' && rule.apaleoVatPercent === 7 && rule.namePattern?.test('Frühstück'));
    const drinks = template.rules.find((rule) => rule.apaleoType === 'Revenues' && rule.apaleoVatPercent === 19 && rule.namePattern?.test('Getränke'));
    expect(food?.namePattern?.source).toBe(FOOD_NAME_PATTERN.source);
    expect(drinks?.namePattern?.source).toBe(BEVERAGE_NAME_PATTERN.source);
  });

  it('writes the LossOfAccountsReceivable wildcard rows by rate with a comment on § 17 UStG and the lowered Kennzahl', () => {
    const [loss7, loss19, loss0] = chart.loss;
    expect(mapped(wildcard(rows, 'LossOfAccountsReceivable', '7'))).toEqual([loss7, chart.tax7, '7']);
    expect(mapped(wildcard(rows, 'LossOfAccountsReceivable', '19'))).toEqual([loss19, chart.tax19, '19']);
    expect(mapped(wildcard(rows, 'LossOfAccountsReceivable', '0'))).toEqual([loss0, '', '0']);
    expect(wildcard(rows, 'LossOfAccountsReceivable', '7')?.comment).toContain('§ 17 Abs. 2 Nr. 1 UStG');
    expect(wildcard(rows, 'LossOfAccountsReceivable', '7')?.comment).toContain('mindert Kennzahl 86');
    expect(wildcard(rows, 'LossOfAccountsReceivable', '19')?.comment).toContain('mindert Kennzahl 81');
    expect(wildcard(rows, 'LossOfAccountsReceivable', '0')?.comment).toContain('keine Berichtigung nach § 17 UStG');
  });

  it('marks every such row "Vorschlag (ungeprüft)"', () => {
    for (const number of ['3501', 'RevenueNoShow_Reduced:7.00', 'RevenueCancellationFees_Without:0.00', 'RevenueFoodAndBeverages_Reduced:7.00']) {
      expect(find(rows, number)?.comment.startsWith(SUGGESTION_MARK), number).toBe(true);
    }
  });
});

describe('N-TEMPLATE-SUGGESTION', () => {
  const suggested = suggest(GERMAN_CHART);
  const existing = (edit: (row: MappingRowValues) => MappingRowValues) => mappingOf(suggested.map(edit)).rows;

  it('names each existing row without an Odoo account for which the template now has a suggestion, with the account and tax', () => {
    const blank = (row: MappingRowValues) =>
      row.apaleoAccount === 'RevenueNoShow_Reduced:7.00' || (row.apaleoType === 'LossOfAccountsReceivable' && row.apaleoVatPercent === '0');
    const rows = existing((row) => (blank(row) ? { ...row, odooAccount: '', odooTax: '', taxPercent: '' } : row));
    const notes = templateSuggestions(rows, suggested, skr03.id);
    expect(notes.map((n) => n.value)).toEqual(['RevenueNoShow_Reduced:7.00', '*']);
    expect(notes[0]?.message).toContain('(RevenueNoShow_Reduced:7.00 Revenues 7 %) has no Odoo account, and the template skr03-hotel@2 now suggests 8300 / tax_ust_7_skr03 (7 %)');
    expect(notes.find((n) => n.message.includes('* LossOfAccountsReceivable 0 %'))?.message).toContain('suggests 2400 / without tax');
    expect(notes.every((n) => n.code === 'N-TEMPLATE-SUGGESTION')).toBe(true);
  });

  it('names no row the user filled in, and no row the template leaves empty too (Kurtaxe, House)', () => {
    expect(templateSuggestions(existing((row) => row), suggested, skr03.id)).toEqual([]);
    expect(templateSuggestions(existing((row) => (row.apaleoAccount === '3501' ? { ...row, odooAccount: '' } : row)), suggested, skr03.id)).toEqual([]);
  });
});

describe('SKR03 hotel template', () => {
  it('Lodging and drinks: "Logis" at 7 % maps to 8300 with tax_ust_7_skr03 and 7, "Getränke" at 19 % to 8400 with tax_ust_19_skr03 and 19', () => {
    const rows = suggest([account('5011', 'Logis', 'Revenues', rate(7)), account('5020', 'Getränke', 'Revenues', rate(19))]);
    expect(mapped(find(rows, '5011'))).toEqual(['8300', 'tax_ust_7_skr03', '7']);
    expect(mapped(find(rows, '5020'))).toEqual(['8400', 'tax_ust_19_skr03', '19']);
  });

  it('suggests the SKR03 accounts for the German chart: revenue by rate, Kasse, Geldtransit, guest ledger, company invoices, deposits and bad debt by rate', () => {
    const rows = suggest(GERMAN_CHART);
    expect(mapped(find(rows, 'RevenueAccommodation_Reduced:7.00'))).toEqual(['8300', 'tax_ust_7_skr03', '7']);
    expect(mapped(find(rows, 'RevenueFoodAndBeverages_Reduced:7.00'))).toEqual(['8300', 'tax_ust_7_skr03', '7']);
    expect(find(rows, 'RevenueFoodAndBeverages_Reduced:7.00')?.comment).toContain('Speisen zu 7 % für Leistungen ab 2026-01-01');
    expect(mapped(find(rows, 'RevenueNoShow_Reduced:7.00'))).toEqual(['8300', 'tax_ust_7_skr03', '7']);
    expect(mapped(find(rows, 'RevenueFoodAndBeverages_Normal:19.00'))).toEqual(['8400', 'tax_ust_19_skr03', '19']);
    expect(mapped(find(rows, 'RevenueOther_Normal:19.00'))).toEqual(['8400', 'tax_ust_19_skr03', '19']);
    expect(mapped(find(rows, 'RevenueAccommodation_Without:0.00'))).toEqual(['8200', '', '0']);
    expect(find(rows, 'RevenueAccommodation_Without:0.00')?.comment).toContain('nie tax_not_taxable');
    expect(mapped(find(rows, '1600'))).toEqual(['1001', '', '']);
    expect(mapped(find(rows, '1102'))).toEqual(['1360', '', '']);
    expect(mapped(wildcard(rows, 'Payments'))).toEqual(['1360', '', '']);
    expect(find(rows, '1102')?.comment).toContain('nie das Bankkonto');
    expect(mapped(find(rows, '1200', 'Receivables'))).toEqual(['1410', '', '']);
    expect(mapped(find(rows, 'CollectiveDebitor_AccountsReceivable'))).toEqual(['1401', '', '']);
    expect(mapped(wildcard(rows, 'AccountsReceivable'))).toEqual(['1401', '', '']);
    expect([7, 19, 0].map((r) => mapped(wildcard(rows, 'Liabilities', String(r))))).toEqual([
      ['1711', 'tax_ust_7_skr03', '7'],
      ['1718', 'tax_ust_19_skr03', '19'],
      ['1719', '', '0'],
    ]);
    expect([7, 19, 0].map((r) => mapped(wildcard(rows, 'LossOfAccountsReceivable', String(r))))).toEqual([
      ['2401', 'tax_ust_7_skr03', '7'],
      ['2406', 'tax_ust_19_skr03', '19'],
      ['2400', '', '0'],
    ]);
    for (const row of rows) expect(row.comment.startsWith(SUGGESTION_MARK) || row.comment.startsWith('archiviert. '), row.apaleoAccount).toBe(true);
  });

  it('leaves a 7 % revenue account no name pattern matches empty, with a comment naming 8300 and tax_ust_7_skr03', () => {
    const row = find(suggest(GERMAN_CHART), 'RevenueOther_Reduced:7.00');
    expect(row?.odooAccount).toBe('');
    expect(row?.comment).toContain('7 %: Logis oder Speisen?');
    expect(row?.comment).toContain('8300 mit tax_ust_7_skr03');
  });

  it('writes no row for the containers 3000, 9999 and 6900, nor for CollectiveDebitor_LossOfAccountsReceivable', () => {
    const rows = suggest(GERMAN_CHART);
    for (const number of ['3000', '9999', '6900', 'CollectiveDebitor_LossOfAccountsReceivable', '5000', 'RevenueAccommodation', '1000']) {
      expect(find(rows, number), number).toBeUndefined();
    }
  });

  it('Template does not guess: House and TransitoryItems stay empty with a comment', () => {
    const rows = suggest(GERMAN_CHART);
    for (const number of ['9000', '7000']) {
      expect(find(rows, number)?.odooAccount, number).toBe('');
      expect(find(rows, number)?.comment, number).toContain('Bitte mit der Kanzlei zuordnen');
    }
  });

  it('Kurtaxe is not pre-filled: the CityTaxes row is empty with both options, and mapping check --from --to reports E-UNMAPPED', () => {
    const rows = suggest(GERMAN_CHART);
    const row = find(rows, '3501');
    expect(row?.odooAccount).toBe('');
    expect(row?.comment).toContain('durchlaufender Posten (§ 10 Abs. 1 UStG): Durchlaufende Posten SKR03 1590 / SKR04 1370 ohne Steuer');
    expect(row?.comment).toContain('Übernachtung- oder Beherbergungsteuer');
    expect(row?.comment).toContain('Beherbergung zu 7 %');
    expect(row?.comment).toContain('docs/mapping-guide.md');

    const line = ledgerLine({ credit: { number: '3501', name: 'Kurtaxe', type: 'CityTaxes', parentNumber: '3500' }, grossCents: 350, taxes: [] });
    const findings = checkCoverage(mappingOf(rows), [line], new ChartIndex(GERMAN_CHART), { rateOf: () => 0 });
    expect(findings.map((f) => [f.code, f.value])).toContainEqual(['E-UNMAPPED', '3501']);
  });

  it('writes the levy comment on SecondCityTax and GuestLevies too', () => {
    const rows = suggest([account('S', 'City Tax 2', 'SecondCityTax'), account('G', 'Gästeabgabe', 'GuestLevies')]);
    for (const number of ['S', 'G']) {
      expect(find(rows, number)?.odooAccount).toBe('');
      expect(find(rows, number)?.comment).toContain('Beherbergung zu 7 %');
    }
  });

  it.each([16, 5])('Historic rates stay empty: revenue and deposit accounts at %s %% get an empty account and the 2020 comment', (percent) => {
    const rows = suggest([account('R', `Revenues Other (${percent}%)`, 'Revenues', rate(percent)), account('L', `Liabilities (${percent}%)`, 'Liabilities', { ...rate(percent), ledger: 'guest' })]);
    for (const number of ['R', 'L']) {
      expect(find(rows, number)?.odooAccount).toBe('');
      expect(find(rows, number)?.comment).toContain('historischer Satz vom 2020-07-01 bis 2020-12-31');
    }
  });

  it('matches name patterns on parent names too, and keeps the comment of an archived account', () => {
    expect(find(suggest(GERMAN_CHART), 'RevenueAccommodation_Reduced:5.00')?.comment).toMatch(/^archiviert\. Vorschlag \(ungeprüft\): leer lassen, historischer Satz/);
    const food = suggest([account('G', 'Gastronomie', 'Revenues', { ...rate(7), parentNumber: 'K' }), account('K', 'Küche', 'Revenues', { hasChildren: true })]);
    expect(find(food, 'G')?.odooAccount).toBe('8300');
  });

  it.each(['Stornogebühr', 'Cancellation fee', 'No-Show', 'Noshow'])('maps "%s" at 7 %% to 8300 with tax_ust_7_skr03, the comment asking the Kanzlei', (name) => {
    const row = find(suggest([account('A', name, 'Revenues', rate(7))]), 'A');
    expect(mapped(row)).toEqual(['8300', 'tax_ust_7_skr03', '7']);
    expect(row?.comment).toContain('entscheidet die Kanzlei');
  });

  it('leaves accounts no rule matches unmapped, with the comment', () => {
    const rows = suggest([account('X', 'Unknown', 'Unknown' as AccountType)]);
    expect(find(rows, 'X')?.odooAccount).toBe('');
    expect(find(rows, 'X')?.comment).toBe('Vorschlag (ungeprüft): keine Regel der Vorlage passt, bitte mit der Kanzlei zuordnen.');
  });

  it('gives the wildcard account and tax of a type and rate for fix hints, with the generated accounts of the version', () => {
    expect(templateWildcard(skr03, 'Liabilities', 7)).toEqual({ odooAccount: '1711', odooTax: 'tax_ust_7_skr03' });
    expect(templateWildcard(skr03, 'AccountsReceivable', undefined)).toEqual({ odooAccount: '1401', odooTax: '' });
    expect(templateWildcard(skr03, 'Payments', undefined, { version: 17 })).toEqual({ odooAccount: '13601', odooTax: '' });
    expect(templateWildcard(skr03, 'Liabilities', 10)).toBeUndefined();
  });

  it('writes the header comment with the template, the Odoo version and the generated accounts', () => {
    expect(mappingHeaderComment(skr03, SETTINGS)).toBe(
      'apaleo-odoo Kontenzuordnung, Vorlage skr03-hotel@2 für Odoo 18 (Kasse 1001, Geldtransit 1360 wie in einer frischen Datenbank). ' +
        'Alle Vorschläge mit deinem Steuerberater prüfen. Spalten odoo_account und odoo_tax in Excel als Text formatieren.',
    );
  });

  it('rejects a template without version or with the wrong header', () => {
    expect(() => parseTemplate('apaleo_type;name_pattern\n')).toThrow('does not name its version');
    expect(() => parseTemplate('# skr03-hotel@1\napaleo_type;bmd_account\n')).toThrow('header must be');
    expect(TEMPLATE_NAMES).toEqual(['skr03-hotel', 'skr04-hotel']);
  });
});

describe('SKR04 hotel template', () => {
  it('maps revenue to 4300, 4400 and 4200 (with the default-tax comment), the guest ledger to 1210 and company invoices to 1200', () => {
    const rows = suggest(GERMAN_CHART, skr04);
    expect(mapped(find(rows, 'RevenueAccommodation_Reduced:7.00'))).toEqual(['4300', 'tax_ust_7_skr04', '7']);
    expect(mapped(find(rows, 'RevenueFoodAndBeverages_Normal:19.00'))).toEqual(['4400', 'tax_ust_19_skr04', '19']);
    expect(mapped(find(rows, 'RevenueAccommodation_Without:0.00'))).toEqual(['4200', '', '0']);
    expect(find(rows, 'RevenueAccommodation_Without:0.00')?.comment).toContain('4200 trägt in Odoo die Standardsteuer 19 %');
    expect(mapped(find(rows, '1200', 'Receivables'))).toEqual(['1210', '', '']);
    expect([7, 19, 0].map((r) => mapped(wildcard(rows, 'LossOfAccountsReceivable', String(r))))).toEqual([
      ['6931', 'tax_ust_7_skr04', '7'],
      ['6936', 'tax_ust_19_skr04', '19'],
      ['6930', '', '0'],
    ]);
  });
});

const live = await loadLiveData();
const BER_CHART = live.charts.BER ?? [];

describe('the SKR hotel templates on the recorded BER chart', () => {
  it('SKR04 deposits: *;Liabilities rows at 7 % (3260, tax_ust_7_skr04), 19 % (3272, tax_ust_19_skr04) and 0 % (3280, no tax), no row for 3000 or 9999, *;AccountsReceivable to 1200', () => {
    const rows = suggest(BER_CHART, skr04);
    expect([7, 19, 0].map((r) => mapped(wildcard(rows, 'Liabilities', String(r))))).toEqual([
      ['3260', 'tax_ust_7_skr04', '7'],
      ['3272', 'tax_ust_19_skr04', '19'],
      ['3280', '', '0'],
    ]);
    expect(find(rows, '3000')).toBeUndefined();
    expect(find(rows, '9999')).toBeUndefined();
    expect(mapped(wildcard(rows, 'AccountsReceivable'))).toEqual(['1200', '', '']);
  });

  it('Generated accounts by Odoo version: cash to 1001 in both, card payments to 13601 with 17 and 1360 with 19, the comment naming both codes, no placeholder left', () => {
    const v17 = suggest(BER_CHART, skr03, { version: 17 });
    const v19 = suggest(BER_CHART, skr03, { version: 19 });
    expect([find(v17, '1600')?.odooAccount, find(v19, '1600')?.odooAccount]).toEqual(['1001', '1001']);
    for (const card of ['1101', '1102', '1104', '1107']) expect([find(v17, card)?.odooAccount, find(v19, card)?.odooAccount], card).toEqual(['13601', '1360']);
    for (const row of [...v17, ...v19].filter((r) => r.apaleoType === 'Payments')) {
      expect(row.comment).toContain('frische Datenbank: SKR03 Kasse 1001, Geldtransit 1360 (Odoo 17: 13601), SKR04 1601 / 1460 (Odoo 17: 14601)');
      expect(row.comment).toContain('Kontenplan');
    }
    expect([...v17, ...v19].some((row) => /\{cash\}|\{transfer\}/.test(row.odooAccount))).toBe(false);
    const skr04v17 = suggest(BER_CHART, skr04, { version: 17 });
    expect([find(skr04v17, '1600')?.odooAccount, find(skr04v17, '1102')?.odooAccount]).toEqual(['1601', '14601']);
  });

  it('Historic rates stay empty: the 16 % and 5 % revenue accounts of the BER chart have no account and the 2020 comment', () => {
    const historic = suggest(BER_CHART).filter((row) => row.apaleoType === 'Revenues' && ['16', '5'].includes(row.apaleoVatPercent));
    expect(historic.length).toBe(10);
    for (const row of historic) {
      expect(row.odooAccount, row.apaleoAccount).toBe('');
      expect(row.comment, row.apaleoAccount).toContain('2020-07-01 bis 2020-12-31');
    }
  });

  it('maps every 7 % and 19 % revenue account apaleo books on BER, and leaves RevenueOther_Reduced:7.00 empty', () => {
    const rows = suggest(BER_CHART);
    for (const number of ['RevenueAccommodation_Reduced:7.00', 'RevenueFoodAndBeverages_Reduced:7.00', 'RevenueNoShow_Reduced:7.00']) expect(find(rows, number)?.odooAccount, number).toBe('8300');
    expect(find(rows, 'RevenueFoodAndBeverages_Normal:19.00')?.odooAccount).toBe('8400');
    expect(find(rows, 'RevenueCancellationFees_Without:0.00')?.odooAccount).toBe('8200');
    expect(find(rows, 'RevenueOther_Reduced:7.00')?.odooAccount).toBe('');
  });

  it('resolves per-reservation write-offs through the wildcards by rate, also under CollectiveDebitor_LossOfAccountsReceivable', () => {
    const mapping = mappingOf(suggest(BER_CHART));
    for (const parentNumber of ['6900', 'CollectiveDebitor_LossOfAccountsReceivable']) {
      const ref: AccountRef = { number: 'BER-1_LossOfAccountsReceivable', name: 'Loss', type: 'LossOfAccountsReceivable', parentNumber };
      const row = resolve(mapping, ref, { rate: 19, chart: new ChartIndex(BER_CHART) });
      expect([row?.odooAccount, row?.odooTax]).toEqual(['2406', 'tax_ust_19_skr03']);
    }
  });
});
