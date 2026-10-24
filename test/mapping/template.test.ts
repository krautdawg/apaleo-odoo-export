import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ChartIndex } from '../../src/core/chart.js';
import type { AccountRef, AccountType, SourceAccount } from '../../src/core/source.js';
import {
  DEFAULT_MWST_CODES,
  SUGGESTION_MARK,
  checkCoverage,
  checkMapping,
  loadTemplate,
  mappingHeaderComment,
  parseTemplate,
  resolve,
  shippedTemplate,
  suggestRows,
  templateWildcard,
  type MappingRowValues,
  type Template,
  type TemplateSettings,
} from '../../src/mapping/index.js';
import { loadLiveData } from '../helpers/apaleo.js';
import { ledgerLine } from '../helpers/ledger.js';
import { mappingOf } from '../helpers/mapping.js';
import { SWISS_CHART } from '../helpers/swiss-chart.js';

const SETTINGS: TemplateSettings = { mwstCodes: { ...DEFAULT_MWST_CODES } };

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
const mapped = (row: MappingRowValues | undefined) => row && [row.abacusAccount, row.mwstCode, row.mwstPercent];

const template = await loadTemplate();
const suggest = (accounts: readonly SourceAccount[], settings: TemplateSettings = SETTINGS) => suggestRows(accounts, template, settings);

/** Every rule of the template with an account as a mapping row, so `checkMapping` can check the numbers. */
function templateRows(t: Template): MappingRowValues[] {
  const rows = suggestRows([], { ...t, rules: t.rules.map((rule) => ({ ...rule, wildcard: true })) }, SETTINGS);
  return rows.filter((row) => row.abacusAccount !== '').map((row, i) => ({ ...row, apaleoAccount: `${i}`, comment: '' }));
}

describe('KMU hotel template', () => {
  it('names its version, marks every rule "Vorschlag (ungeprüft)" and writes Swiss Standard German without "ß"', () => {
    expect(template.id).toBe('kmu-hotel@1');
    expect(template.rules.length).toBeGreaterThan(25);
    for (const rule of template.rules) {
      expect(rule.comment.startsWith(SUGGESTION_MARK), `line ${rule.line}`).toBe(true);
      expect(rule.comment, `line ${rule.line}`).not.toContain('ß');
      expect(rule.abacusAccount).toMatch(/^(\d{4})?$/);
      expect(['', '{normal}', '{reduziert}', '{beherbergung}']).toContain(rule.mwstCode);
    }
    expect(readFileSync(new URL('../../templates/kmu-hotel.rules.csv', import.meta.url), 'utf8')).not.toContain('ß');
    expect(shippedTemplate()).toEqual(template);
  });

  it('passes the mapping check: every rule with an account has a valid account, code and Swiss rate', () => {
    const findings = checkMapping(mappingOf(templateRows(template)));
    expect(findings.filter((f) => !['W-UNTAXED-REVENUE'].includes(f.code))).toEqual([]);
  });

  it('suggests the KMU accounts for the Swiss chart: revenue by rate, payments, folios, Debitoren, deposits and write-offs by rate', () => {
    const rows = suggest(SWISS_CHART);
    expect(mapped(find(rows, 'RevenueAccommodation_Special:3.80'))).toEqual(['3400', '313', '3.8']);
    expect(mapped(find(rows, 'RevenueFoodAndBeverages_Normal:8.10'))).toEqual(['3200', '311', '8.1']);
    expect(mapped(find(rows, 'RevenueOther_Normal:8.10'))).toEqual(['3500', '311', '8.1']);
    expect(mapped(find(rows, 'RevenueFoodAndBeverages_Reduced:2.60'))).toEqual(['3260', '312', '2.6']);
    expect(mapped(find(rows, 'RevenueAccommodation_Without:0.00'))).toEqual(['3600', '', '0']);
    expect(find(rows, 'RevenueAccommodation_Without:0.00')?.comment).toContain('Standard-MWST-Code');
    expect(mapped(find(rows, '1600'))).toEqual(['1000', '', '']);
    expect(mapped(find(rows, '1102'))).toEqual(['1090', '', '']);
    expect(mapped(find(rows, '1114'))).toEqual(['1090', '', '']);
    expect(find(rows, '1102')?.comment).toContain('nie das Bankkonto');
    expect(mapped(find(rows, '1200', 'Receivables'))).toEqual(['1101', '', '']);
    expect(mapped(find(rows, 'CollectiveDebitor_AccountsReceivable'))).toEqual(['1102', '', '']);
    expect(find(rows, 'CollectiveDebitor_AccountsReceivable')?.comment).toContain('Nicht 1100: das ist in Abacus meist das Sammelkonto der Debitorenbuchhaltung');
    expect(mapped(wildcard(rows, 'AccountsReceivable'))).toEqual(['1102', '', '']);
    expect([3.8, 8.1, 2.6, 0].map((r) => mapped(wildcard(rows, 'Liabilities', String(r))))).toEqual([
      ['2030', '313', '3.8'],
      ['2031', '311', '8.1'],
      ['2032', '312', '2.6'],
      ['2039', '', '0'],
    ]);
    expect([3.8, 8.1, 2.6, 0].map((r) => mapped(wildcard(rows, 'LossOfAccountsReceivable', String(r))))).toEqual([
      ['3805', '313', '3.8'],
      ['3806', '311', '8.1'],
      ['3807', '312', '2.6'],
      ['3808', '', '0'],
    ]);
    for (const row of rows) expect(row.comment.startsWith(SUGGESTION_MARK) || row.comment.startsWith('archiviert. '), row.apaleoAccount).toBe(true);
  });

  it('writes no row for the containers 3000, 9999 and 6900, nor for CollectiveDebitor_LossOfAccountsReceivable', () => {
    const rows = suggest(SWISS_CHART);
    for (const number of ['3000', '9999', '6900', 'CollectiveDebitor_LossOfAccountsReceivable', '5000', 'RevenueAccommodation', '1000']) {
      expect(find(rows, number), number).toBeUndefined();
    }
  });

  it('Template does not guess: House and TransitoryItems stay empty with a comment', () => {
    const rows = suggest(SWISS_CHART);
    for (const number of ['9000', '7000']) {
      expect(find(rows, number)?.abacusAccount, number).toBe('');
      expect(find(rows, number)?.comment, number).toContain('Bitte mit dem Treuhänder zuordnen');
    }
  });

  it('Kurtaxe is not pre-filled: the CityTaxes row is empty with both options, and the coverage check reports E-UNMAPPED', () => {
    const rows = suggest(SWISS_CHART);
    const row = find(rows, '3501');
    expect(row?.abacusAccount).toBe('');
    expect(row?.comment).toContain('durchlaufender Posten ohne MWST-Code');
    expect(row?.comment).toContain('wie die ESTV empfiehlt');
    expect(row?.comment).toContain('Teil der Beherbergung zu 3,8 %');
    expect(row?.comment).toContain('Nie der Code 490 "Subvention Kurtaxen" (Ziffer 900)');
    expect(row?.comment).toContain('Beherbergungsabgabe, die das Hotel selbst schuldet');
    expect(row?.comment).toContain('docs/mapping-guide.md');

    const line = ledgerLine({ credit: { number: '3501', name: 'Kurtaxe', type: 'CityTaxes', parentNumber: '3500' }, currency: 'CHF', grossCents: 350, taxes: [] });
    const findings = checkCoverage(mappingOf(rows), [line], new ChartIndex(SWISS_CHART), { rateOf: () => 0 });
    expect(findings.map((f) => [f.code, f.value])).toContainEqual(['E-UNMAPPED', '3501']);
  });

  it('Food and drinks: "Frühstück Restaurant" at 8.1 % maps to 3200 and "Getränke" at 8.1 % to 3100, both with 311 and 8.1', () => {
    const rows = suggest([account('R1', 'Frühstück Restaurant', 'Revenues', rate(8.1)), account('R2', 'Getränke', 'Revenues', rate(8.1))]);
    expect(mapped(find(rows, 'R1'))).toEqual(['3200', '311', '8.1']);
    expect(mapped(find(rows, 'R2'))).toEqual(['3100', '311', '8.1']);
  });

  it('Accommodation with breakfast: "Logis" at 3.8 % maps to 3400 with MWST-Code 313 and rate 3.8', () => {
    const rows = suggest([account('5011', 'Logis', 'Revenues', rate(3.8))]);
    expect(mapped(find(rows, '5011'))).toEqual(['3400', '313', '3.8']);
  });

  it('Codes from the config: V81, V26 and V38 replace the KMU sample codes, also in the wildcard rows', () => {
    const rows = suggest(SWISS_CHART, { mwstCodes: { normal: 'V81', reduziert: 'V26', beherbergung: 'V38' } });
    expect(find(rows, 'RevenueOther_Normal:8.10')?.mwstCode).toBe('V81');
    expect(find(rows, 'RevenueFoodAndBeverages_Reduced:2.60')?.mwstCode).toBe('V26');
    expect(find(rows, 'RevenueAccommodation_Special:3.80')?.mwstCode).toBe('V38');
    expect(wildcard(rows, 'Liabilities', '3.8')?.mwstCode).toBe('V38');
    expect(wildcard(rows, 'LossOfAccountsReceivable', '8.1')?.mwstCode).toBe('V81');
    expect(rows.some((row) => /\{|\}/.test(row.mwstCode))).toBe(false);
  });

  it.each([
    [7.7, 'Normalsatz 7,7 % bis 2023-12-31'],
    [3.7, 'Sondersatz Beherbergung 3,7 % bis 2023-12-31'],
    [2.5, 'reduzierter Satz 2,5 % bis 2023-12-31'],
  ])('leaves revenue and deposit accounts at the pre-2024 rate %s %% empty with a comment', (percent, text) => {
    const rows = suggest([account('R', `Revenues Other (${percent}%)`, 'Revenues', rate(percent)), account('L', `Liabilities (${percent}%)`, 'Liabilities', rate(percent))]);
    for (const number of ['R', 'L']) {
      expect(find(rows, number)?.abacusAccount).toBe('');
      expect(find(rows, number)?.comment).toContain(text);
      expect(find(rows, number)?.comment).toContain('Exporte für 2023 und früher mit dem Treuhänder klären');
    }
  });

  it('matches name patterns on parent names too, and keeps the comment of an archived account', () => {
    const rows = suggest(SWISS_CHART);
    expect(find(rows, 'RevenueAccommodation_Special:3.70')?.comment).toMatch(/^archiviert\. Vorschlag \(ungeprüft\): leer lassen, Sondersatz Beherbergung 3,7 %/);
    const food = suggest([account('G', 'Gastronomie', 'Revenues', { ...rate(8.1), parentNumber: 'K' }), account('K', 'Küche', 'Revenues', { hasChildren: true })]);
    expect(find(food, 'G')?.abacusAccount).toBe('3200');
  });

  it('leaves accounts no rule matches unmapped, with the comment', () => {
    const rows = suggest([account('X', 'Unknown', 'Unknown' as AccountType)]);
    expect(find(rows, 'X')?.abacusAccount).toBe('');
    expect(find(rows, 'X')?.comment).toBe('Vorschlag (ungeprüft): keine Regel der Vorlage passt, bitte mit dem Treuhänder zuordnen.');
  });

  it('gives the wildcard account and code of a type and rate for fix hints', () => {
    expect(templateWildcard(template, 'Liabilities', 3.8)).toEqual({ abacusAccount: '2030', mwstCode: '313' });
    expect(templateWildcard(template, 'Liabilities', 8.1, { mwstCodes: { normal: 'V81', reduziert: 'V26', beherbergung: 'V38' } })).toEqual({ abacusAccount: '2031', mwstCode: 'V81' });
    expect(templateWildcard(template, 'AccountsReceivable', undefined)).toEqual({ abacusAccount: '1102', mwstCode: '' });
    expect(templateWildcard(template, 'Liabilities', 19)).toBeUndefined();
  });

  it('writes the header comment with the template and the MWST-Codes', () => {
    expect(mappingHeaderComment(template, SETTINGS)).toBe(
      'apaleo-abacus Kontenzuordnung, Vorlage kmu-hotel@1, MWST-Codes 311 (8,1 %), 312 (2,6 %), 313 (3,8 %). ' +
        'Alle Vorschläge mit dem Treuhänder prüfen. Spalten abacus_account und mwst_code in Excel als Text formatieren.',
    );
  });

  it('rejects a template without version or with the wrong header', () => {
    expect(() => parseTemplate('apaleo_type;name_pattern\n')).toThrow('does not name its version');
    expect(() => parseTemplate('# kmu-hotel@1\napaleo_type;bmd_account\n')).toThrow('header must be');
  });

  it('ships a template file that is valid UTF-8 with CRLF and 7 columns per line', () => {
    const text = readFileSync(new URL('../../templates/kmu-hotel.rules.csv', import.meta.url), 'utf8');
    expect(text.split('\n').every((line) => line === '' || line.endsWith('\r'))).toBe(true);
    expect(template.rules.every((rule) => rule.comment !== '')).toBe(true);
  });
});

const BER_ROWS = suggest((await loadLiveData()).charts.BER ?? []);

describe('KMU hotel template on the recorded BER chart', () => {
  const rows = BER_ROWS;

  it('Real apaleo chart: no row for 3000 or 9999, the four deposit wildcards, the Debitoren wildcard, and empty rows at 16, 19, 7 and 5 %', () => {
    expect(find(rows, '3000')).toBeUndefined();
    expect(find(rows, '9999')).toBeUndefined();
    expect(['3.8', '8.1', '2.6', '0'].map((r) => wildcard(rows, 'Liabilities', r)?.abacusAccount)).toEqual(['2030', '2031', '2032', '2039']);
    expect(mapped(wildcard(rows, 'AccountsReceivable'))).toEqual(['1102', '', '']);
    const foreign = rows.filter((row) => row.apaleoType === 'Revenues' && ['16', '19', '7', '5'].includes(row.apaleoVatPercent));
    expect(foreign.length).toBeGreaterThanOrEqual(20);
    for (const row of foreign) {
      expect(row.abacusAccount, row.apaleoAccount).toBe('');
      expect(row.comment, row.apaleoAccount).toContain('kein Schweizer MWST-Satz');
    }
  });

  it('Recorded chart: RevenueCancellationFees_Without:0.00 maps to 3680 without MWST-Code, no-shows above 0 % stay empty with the Annullation comment', () => {
    expect(mapped(find(rows, 'RevenueCancellationFees_Without:0.00'))).toEqual(['3680', '', '0']);
    const noShows = rows.filter((row) => row.apaleoAccount.startsWith('RevenueNoShow_') && Number(row.apaleoVatPercent) > 0);
    expect(noShows).toHaveLength(4);
    for (const row of noShows) {
      expect(row.abacusAccount).toBe('');
      expect(row.comment).toContain('Annullationen und No-Shows gelten als Schadenersatz ohne MWST (ESTV MBI 08 Ziff. 8.7)');
    }
  });
});

describe('Template rows for Swiss special cases', () => {
  it.each([
    [3.8, '3805', '313'],
    [8.1, '3806', '311'],
  ])('Write-off rows: a per-reservation write-off at %s %% resolves through the wildcard to %s with code %s', (percent, account, code) => {
    const rows = suggest(SWISS_CHART);
    const mapping = mappingOf(rows);
    for (const parentNumber of ['6900', 'CollectiveDebitor_LossOfAccountsReceivable']) {
      const ref: AccountRef = { number: `BSP-1_LossOfAccountsReceivable/${percent}`, name: 'Loss', type: 'LossOfAccountsReceivable', parentNumber };
      const row = resolve(mapping, ref, { rate: percent, chart: new ChartIndex(SWISS_CHART) });
      expect([row?.abacusAccount, row?.mwstCode]).toEqual([account, code]);
    }
    expect(find(rows, '6900')).toBeUndefined();
    expect(find(rows, 'CollectiveDebitor_LossOfAccountsReceivable')).toBeUndefined();
  });

  it.each(['Annullation', 'Annulation', 'Storno', 'Cancellation fee', 'No-Show', 'Noshow'])('maps "%s" at 0 %% to 3680 without MWST-Code, before the 0 %% revenue rule', (name) => {
    const rows = suggest([account('A', name, 'Revenues', rate(0))]);
    expect(mapped(find(rows, 'A'))).toEqual(['3680', '', '0']);
  });

  it('maps the groups RevenueCancellationFees and RevenueNoShow by their number', () => {
    const rows = suggest([account('RevenueNoShow', 'X', 'Revenues', { hasChildren: true }), account('N1', 'Gebühr', 'Revenues', { ...rate(0), parentNumber: 'RevenueNoShow' })]);
    expect(find(rows, 'N1')?.abacusAccount).toBe('3680');
  });

  it('Taxed no-show is left to the Treuhänder: "No-Show Gebühr" at 3.8 % stays empty although the 3.8 % rule would match', () => {
    const row = find(suggest([account('N', 'No-Show Gebühr', 'Revenues', rate(3.8))]), 'N');
    expect(row?.abacusAccount).toBe('');
    expect(row?.comment).toContain('gelten als Schadenersatz ohne MWST (ESTV MBI 08 Ziff. 8.7), ausser die Leistung wurde schon ohne Korrekturbeleg in Rechnung gestellt');
  });

  it('writes the levy comment on SecondCityTax and GuestLevies too', () => {
    const rows = suggest([account('S', 'City Tax 2', 'SecondCityTax'), account('G', 'Gästetaxe', 'GuestLevies')]);
    for (const number of ['S', 'G']) {
      expect(find(rows, number)?.abacusAccount).toBe('');
      expect(find(rows, number)?.comment).toContain('Ziffer 910');
      expect(find(rows, number)?.comment).toContain('Teil der Beherbergung zu 3,8 %');
    }
  });
});
