import type { ChartIndex } from '../core/chart.js';
import type { PostingConfig } from '../core/config.js';
import type { Finding } from '../core/findings.js';
import { formatCents } from '../core/money.js';
import type { AccountRef, LedgerLine } from '../core/source.js';
import type { MappingRow } from '../mapping/index.js';

/**
 * Plain-language pieces of the bookings and findings: the German label of each
 * booking side (`line_ids/name` in the Odoo file), the receipt kept for the
 * protocol, and the texts of posting findings. Accounts are named by number and
 * type only: the names of guest folios can be guest names.
 */

/** apaleo's standard revenue groups (the parent of `RevenueAccommodation_Reduced:7.00`), at a reduced rate and at the standard rate (19 % and above). */
const REVENUE_GROUPS: Readonly<Record<string, { reduced: string; standard: string }>> = {
  RevenueAccommodation: { reduced: 'Beherbergung', standard: 'Beherbergung' },
  // Speisen are taxed at 7 % from 2026-01-01, drinks always at 19 %.
  RevenueFoodAndBeverages: { reduced: 'Speisen', standard: 'Getränke' },
  RevenueNoShow: { reduced: 'No-Show', standard: 'No-Show' },
  RevenueCancellationFees: { reduced: 'Stornogebühren', standard: 'Stornogebühren' },
  RevenueOther: { reduced: 'sonstige', standard: 'sonstige' },
};

/** The German standard rate: revenue at this rate or above is not at a reduced rate. */
const STANDARD_RATE = 19;

/** Fixed labels of types without VAT: never a leaf name, which can be a guest's name. */
const TYPE_LABELS: Readonly<Record<string, string>> = {
  Receivables: 'Gästeforderungen',
  AccountsReceivable: 'Forderungen Firmenrechnungen',
  House: 'Hauskonto',
  TransitoryItems: 'Durchlaufende Posten',
};

/** Fixed labels of apaleo's levy types, with the rate when apaleo taxes the levy. */
const LEVY_LABELS: Readonly<Record<string, string>> = {
  CityTaxes: 'Kurtaxe',
  SecondCityTax: 'Kurtaxe 2',
  GuestLevies: 'Gästeabgabe',
};

/** apaleo's generic English payment-method names in German; card brands keep their name. */
const PAYMENT_LABELS: Readonly<Record<string, string>> = {
  'Cash Payment': 'bar',
  Cash: 'bar',
  'Cash and ATM': 'bar',
  'Bank Transfer': 'Überweisung',
  'Direct Debit': 'Lastschrift',
  'Voucher Payment': 'Gutschein',
  'Other Payment': 'sonstige',
  'Credit Card Payment': 'Kreditkarte',
  'Online banking': 'Onlinebanking',
  'Open Invoice': 'offene Rechnung',
  Cheque: 'Scheck',
};
const PAYMENT_SUFFIX = / (?:Credit Card Payment|Card Payment|Payment)$/;
const BRAND_SPELLING: Readonly<Record<string, string>> = { MasterCard: 'Mastercard', GiroCard: 'Girocard' };

/** A rate as German texts write it: `7 %`, `5,5 %`. */
export function percentLabel(rate: number): string {
  return `${String(rate).replace('.', ',')} %`;
}

/** `7 %`, or `ohne USt` at 0 %. */
function rateLabel(rate: number): string {
  return rate === 0 ? 'ohne USt' : percentLabel(rate);
}

/** A payment method in German: generic names translated, card brands kept (`Visa Debit Card Payment` → `Visa Debit`). */
export function paymentLabel(name: string): string {
  const fixed = PAYMENT_LABELS[name];
  if (fixed) return fixed;
  const label = name.replace(/^Payment by /, '').replace(PAYMENT_SUFFIX, '');
  return Object.entries(BRAND_SPELLING).reduce((text, [from, to]) => text.replace(from, to), label) || 'sonstige';
}

/** The apaleo revenue group of an account (its own number's prefix or a chart parent), or undefined. */
function revenueGroup(ref: AccountRef, chart: ChartIndex): string | undefined {
  const numbers = [ref.number.split(/[_:]/)[0] ?? ref.number];
  let parent = chart.find(ref.number, ref.type)?.parentNumber ?? ref.parentNumber;
  while (parent !== undefined && !numbers.includes(parent)) {
    numbers.push(parent);
    parent = chart.find(parent, ref.type)?.parentNumber;
  }
  return numbers.find((number) => REVENUE_GROUPS[number] !== undefined);
}

/**
 * The German label of a revenue account: `Erlöse` with apaleo's standard group
 * (`Erlöse Beherbergung 7 %`, `Erlöse Getränke 19 %`) or, for other accounts,
 * their own name without apaleo's English prefix `Revenues `, then the rate.
 */
export function revenueLabel(ref: AccountRef, chart: ChartIndex, rate: number): string {
  const group = revenueGroup(ref, chart);
  if (group === undefined) return `Erlöse ${ref.name.replace(/^Revenues\s+/, '')}`;
  const names = REVENUE_GROUPS[group] as { reduced: string; standard: string };
  if (rate === 0) return 'Erlöse ohne USt';
  return `Erlöse ${rate < STANDARD_RATE ? names.reduced : names.standard} ${percentLabel(rate)}`;
}

/**
 * The label of one booking side, by the apaleo type of its account, the apaleo
 * revenue group and, for revenue, deposits, levies and bad debt, the rate of the
 * booking (0 without tax): `Erlöse
 * Beherbergung 7 %`, `Zahlung Visa`, `Gästeforderungen`, `Forderungen
 * Firmenrechnungen`, `Anzahlungen 7 %`, `Kurtaxe`, `Forderungsverluste 19 %`.
 * It depends on the account only, never on the line, so the writer nets all
 * lines of an account into one line per day; it never contains a guest name.
 */
export function sideLabel(ref: AccountRef, chart: ChartIndex, rate: number): string {
  switch (ref.type) {
    case 'Revenues':
      return revenueLabel(ref, chart, rate);
    case 'Payments':
      return `Zahlung ${paymentLabel(ref.name)}`;
    case 'Liabilities':
      return `Anzahlungen ${rateLabel(rate)}`;
    case 'LossOfAccountsReceivable':
      return `Forderungsverluste ${rateLabel(rate)}`;
    default: {
      const levy = LEVY_LABELS[ref.type];
      if (levy !== undefined) return rate === 0 ? levy : `${levy} ${percentLabel(rate)}`;
      return TYPE_LABELS[ref.type] ?? ref.type;
    }
  }
}

/** The receipt number when configured and present, else the reference: kept on the booking for the protocol. Never an account name. */
export function receiptOf(line: LedgerLine, mode: PostingConfig['text2']): string {
  const receipt = line.receipt.number.trim();
  return mode === 'receipt' && receipt !== '' ? receipt : line.reference;
}

export function accountText(ref: AccountRef): string {
  return `${ref.number} (${ref.type})`;
}

/** `apaleo entry BSPE0002 of 2026-09-14 (PostCharge, gross 100.00, debit …, credit …)`. */
export function lineText(line: LedgerLine): string {
  return (
    `apaleo entry ${line.sourceEntryNumber} of ${line.businessDate} (${line.command}, gross ${formatCents(line.grossCents)}, ` +
    `debit ${accountText(line.debit)}, credit ${accountText(line.credit)})`
  );
}

/** `mapping line 4 (Odoo 8300)`. */
export function rowText(row: MappingRow): string {
  return `mapping line ${row.line} (Odoo ${row.odooAccount})`;
}

export function percentText(rate: number): string {
  return `${rate} %`;
}

export function lineFinding(code: string, line: LedgerLine, message: string): Finding {
  return { code, message: `${lineText(line)}: ${message}`, value: line.sourceEntryNumber };
}
