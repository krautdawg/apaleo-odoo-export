import type { OdooVersion } from '../core/config.js';

/**
 * What the tool knows about Odoo's German localisation (l10n_de) without
 * reading the Odoo database: the sale taxes of SKR03 and SKR04, the template
 * accounts that carry a default tax, and the cash and transfer accounts Odoo
 * generates at company setup. Checked on 2026-10-24 in github.com/odoo/odoo,
 * branches 17.0, 18.0 and 19.0, and in the local test import of o02
 * (docs/maintainers.md, research §4).
 */

export type GermanChart = 'skr03' | 'skr04';

export const GERMAN_CHARTS: readonly GermanChart[] = ['skr03', 'skr04'];

/** A sale tax of the l10n_de chart templates. */
export interface KnownTax {
  /** The chart-template id, for example `tax_ust_7_skr03`. */
  id: string;
  chart: GermanChart;
  rate: number;
  /** The UStVA Kennzahl the tax's base reports in. */
  kennzahl: string;
}

/**
 * The sale taxes, identical in 17.0, 18.0 and 19.0. Source:
 * `addons/l10n_de/data/template/account.tax-de_skr03.csv` and `account.tax-de_skr04.csv`.
 */
export const L10N_DE_TAXES: readonly KnownTax[] = [
  { id: 'tax_ust_19_skr03', chart: 'skr03', rate: 19, kennzahl: 'Kz 81' },
  { id: 'tax_ust_7_skr03', chart: 'skr03', rate: 7, kennzahl: 'Kz 86' },
  { id: 'tax_not_taxable_skr03', chart: 'skr03', rate: 0, kennzahl: 'Kz 45' },
  { id: 'tax_ust_19_skr04', chart: 'skr04', rate: 19, kennzahl: 'Kz 81' },
  { id: 'tax_ust_7_skr04', chart: 'skr04', rate: 7, kennzahl: 'Kz 86' },
  { id: 'tax_not_taxable_skr04', chart: 'skr04', rate: 0, kennzahl: 'Kz 45' },
];

/** The non-taxable 0 % taxes: their base lands in UStVA Kz 45 (place of supply abroad). */
export const NOT_TAXABLE_TAXES: ReadonlySet<string> = new Set(['tax_not_taxable_skr03', 'tax_not_taxable_skr04']);

/** `account.<company>_<template id>`, as the chart template names a tax of one company. */
const COMPANY_TAX_ID = /^account\.\d+_([a-z0-9_]+)$/;

/** The known sale tax a mapping's `odoo_tax` names, as a template id or as `account.<company>_<template id>`; undefined for any other tax. */
export function knownTax(value: string): KnownTax | undefined {
  const id = COMPANY_TAX_ID.exec(value)?.[1] ?? value;
  return L10N_DE_TAXES.find((tax) => tax.id === id);
}

/**
 * Template accounts with a default tax and its rate: in Odoo 17 and 18 a line
 * without an explicit tax gets it, so the file always writes the tax cell, empty
 * for an untaxed line. Source: `addons/l10n_de/data/template/account.account-de_skr03.csv`
 * and `account.account-de_skr04.csv` (column `tax_ids`).
 */
export const DEFAULT_TAX_ACCOUNTS: Readonly<Record<GermanChart, Readonly<Record<string, number>>>> = {
  skr03: { '8300': 7, '8400': 19, '2401': 7, '2406': 19 },
  skr04: { '4200': 19, '4300': 7, '4400': 19, '6931': 7, '6936': 19 },
};

/** The chart and default rate of an account code with a default tax, or undefined. */
export function defaultTaxOf(account: string): { chart: GermanChart; rate: number } | undefined {
  for (const chart of GERMAN_CHARTS) {
    const rate = DEFAULT_TAX_ACCOUNTS[chart][account];
    if (rate !== undefined) return { chart, rate };
  }
  return undefined;
}

/** The Kasse and the Geldtransit (liquidity transfer) account of a fresh database. */
export interface GeneratedAccounts {
  cash: string;
  transfer: string;
}

/**
 * The accounts Odoo creates at company setup instead of taking them from the
 * chart template, as a fresh database has them. Source: `addons/l10n_de/models/template_de_skr03.py`
 * and `template_de_skr04.py` (`cash_account_code_prefix`, `transfer_account_code_prefix`),
 * `addons/account/models/account_journal.py` and `chart_template.py` (17.0, 18.0, 19.0),
 * confirmed by the local test import of o02 on 2026-10-24.
 */
export function generatedAccounts(chart: GermanChart, version: OdooVersion): GeneratedAccounts {
  if (chart === 'skr03') return { cash: '1001', transfer: version === 17 ? '13601' : '1360' };
  return { cash: '1601', transfer: version === 17 ? '14601' : '1460' };
}

/**
 * Codes a Payments row may name for a generated account, per chart: the fresh
 * codes of every version and the DATEV codes (`1000`, `1600`) no fresh Odoo
 * database has. Only for Payments rows, because `1600` is an ordinary SKR03 account.
 */
export const GENERATED_ACCOUNT_CODES: Readonly<Record<GermanChart, readonly string[]>> = {
  skr03: ['1000', '1001', '1360', '13601'],
  skr04: ['1600', '1601', '1460', '14601'],
};

/** The chart whose generated accounts the code may be, or undefined. */
export function generatedChartOf(account: string): GermanChart | undefined {
  return GERMAN_CHARTS.find((chart) => GENERATED_ACCOUNT_CODES[chart].includes(account));
}

/**
 * apaleo account names of food revenue (Speisen), as the hotel templates' 7 %
 * food rule matches them, and of beverages (Getränke), which are never food. The
 * export's `W-FOOD-RATE` uses both: an account name matching the food pattern
 * and not the beverage pattern is food.
 */
export const FOOD_NAME_PATTERN = /speise|food|frühstück|fruehstueck|breakfast|restaurant|essen|küche|kueche|kitchen|halbpension|vollpension|catering|bankett|banquet/iu;
export const BEVERAGE_NAME_PATTERN = /getränk|getraenk|beverage|drink|minibar|\bbar\b/iu;

/** A period in which Speisen in restaurants and catering carry one German VAT rate: from `from` (inclusive) to `to` (inclusive, open when absent). */
export interface FoodRatePeriod {
  readonly from?: string;
  readonly to?: string;
  readonly percent: number;
  /** The law that set the rate, for messages. */
  readonly law?: string;
}

/**
 * The German VAT rate of Speisen in restaurants and catering by the day of the
 * service: 19 % until 2020-06-30, 5 % from 2020-07-01 to 2020-12-31 and 7 % from
 * 2021-01-01 to 2023-12-31 (Corona-Steuerhilfegesetz, extended twice), 19 % from
 * 2024-01-01 to 2025-12-31, and 7 % for services from 2026-01-01
 * (Steueränderungsgesetz 2025). Drinks always carry the standard rate.
 */
export const FOOD_RATE_PERIODS: readonly FoodRatePeriod[] = [
  { to: '2020-06-30', percent: 19 },
  { from: '2020-07-01', to: '2020-12-31', percent: 5, law: 'Corona-Steuerhilfegesetz' },
  { from: '2021-01-01', to: '2023-12-31', percent: 7, law: 'Corona-Steuerhilfegesetz' },
  { from: '2024-01-01', to: '2025-12-31', percent: 19 },
  { from: '2026-01-01', percent: 7, law: 'Steueränderungsgesetz 2025' },
];

/** The rates Speisen or drinks carried in Germany since 2020; a food line at another rate (0 % for example) is not a rate mix-up. */
export const FOOD_RATE_CANDIDATES: ReadonlySet<number> = new Set([5, 7, 16, 19]);

/** The period of Speisen whose days include `date` (`YYYY-MM-DD`). */
export function foodRatePeriod(date: string): FoodRatePeriod {
  const period = FOOD_RATE_PERIODS.find((p) => (p.from === undefined || date >= p.from) && (p.to === undefined || date <= p.to));
  if (!period) throw new Error(`no Speisen rate period for ${date}`);
  return period;
}

/** "from 2024-01-01 to 2025-12-31", "until 2020-06-30" or "from 2026-01-01 (Steueränderungsgesetz 2025)", for messages. */
export function foodRatePeriodText(period: FoodRatePeriod): string {
  const days = period.from === undefined ? `until ${period.to ?? ''}` : period.to === undefined ? `from ${period.from}` : `from ${period.from} to ${period.to}`;
  return period.law === undefined ? days : `${days} (${period.law})`;
}

/** An apaleo account name that is food revenue: it matches the food pattern and not the beverage pattern. */
export function isFoodName(name: string): boolean {
  return FOOD_NAME_PATTERN.test(name) && !BEVERAGE_NAME_PATTERN.test(name);
}

/** apaleo's levy types: a guest-owed Kurtaxe is a durchlaufender Posten, a hotel-owed Übernachtungsteuer part of the consideration. */
export const LEVY_TYPES: ReadonlySet<string> = new Set(['CityTaxes', 'SecondCityTax', 'GuestLevies']);
