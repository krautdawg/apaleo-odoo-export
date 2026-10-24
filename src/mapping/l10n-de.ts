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
