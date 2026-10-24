import { isLocalDate } from '../core/date.js';
import { REPORT_PROBLEM_HINT } from '../core/errors.js';
import type { Finding } from '../core/findings.js';
import { formatAmount, formatRate, formatSignedAmount, MAX_AMOUNT_CENTS } from './format.js';
import { odooTax, sideOf } from './tax-model.js';
import type { OdooBooking, OdooEntry, OdooRenderOptions } from './types.js';

/** Odoo's own rule for an account code (`account.account` `_check_account_code`). */
export const ACCOUNT_CODE = /^[A-Za-z0-9.]{1,64}$/;
/** A chart-template tax id (`tax_ust_19_skr03`) or a full External ID (`__import__.ust_7_hotel`). */
export const TAX_REF = /^[a-z0-9_]+$|^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/;
/** The journal code: Odoo allows 5 characters; the tool takes `A-Z` and `0-9`. */
export const JOURNAL_CODE = /^[A-Z0-9]{1,5}$/;
/** The property id in External IDs and the file name. */
export const PROPERTY_ID = /^[A-Za-z0-9_-]{1,20}$/;

/** The names Odoo shows for each field, so findings never show internal names such as `grossCents`. */
const LABELS: Readonly<Record<string, string>> = {
  account: 'Account',
  debit: 'Account (debit)',
  credit: 'Account (credit)',
  grossCents: 'Amount',
  apaleoTaxCents: 'apaleo tax',
  businessDate: 'Date',
  taxRef: 'Taxes',
  percent: 'Tax rate',
  journal: 'Journal',
  propertyId: 'Property id',
  from: 'Start of period',
  to: 'End of period',
  roundingAccount: 'odoo.roundingAccount',
};

type PeriodOptions = Pick<OdooRenderOptions, 'from' | 'to'>;

/** `E-ODOO-DATE` for a `from` or `to` that is not a valid date, or a `from` after `to`. */
export function validatePeriod({ from, to }: PeriodOptions): Finding[] {
  const findings: Finding[] = [];
  for (const [field, value] of [['from', from], ['to', to]] as const) {
    if (!isLocalDate(value)) findings.push(finding('E-ODOO-DATE', field, value, `${LABELS[field]} must be a valid date written YYYY-MM-DD, got "${value}"`));
  }
  if (findings.length === 0 && from > to) findings.push(finding('E-ODOO-DATE', 'from', from, `The file period starts on ${from}, after its last day ${to}`));
  return findings;
}

/** `E-ODOO-PROPERTY-ID` for a property id that cannot go into an External ID and the file name. */
export function validatePropertyId(propertyId: string): Finding[] {
  if (PROPERTY_ID.test(propertyId)) return [];
  return [finding('E-ODOO-PROPERTY-ID', 'propertyId', propertyId, `The property id must be 1 to 20 characters of A-Z, a-z, 0-9, _ and - (it goes into the External IDs and the file name), got "${propertyId}"`)];
}

/**
 * Every problem of the bookings and the file settings at once (design decision
 * 6), each naming the day and the accounts of the booking and never a label,
 * which may come from a guest's line.
 */
export function validateBookings(bookings: readonly OdooBooking[], options: Omit<OdooRenderOptions, 'currency' | 'revision' | 'demo' | 'companyId'>): Finding[] {
  const period = validatePeriod(options);
  const findings = [...validatePropertyId(options.propertyId), ...period];
  if (!JOURNAL_CODE.test(options.journal)) {
    findings.push(finding('E-ODOO-JOURNAL', 'journal', options.journal, `The journal code must be 1 to 5 characters of A-Z and 0-9 (odoo.journal), got "${options.journal}"`));
  }
  const { roundingAccount } = options;
  if (roundingAccount !== undefined && !ACCOUNT_CODE.test(roundingAccount)) {
    findings.push(finding('E-ODOO-ACCOUNT', 'roundingAccount', roundingAccount, `odoo.roundingAccount "${roundingAccount}" must be an Odoo account code: 1 to 64 characters of A-Z, a-z, 0-9 and "."`));
  }
  bookings.forEach((booking, index) => findings.push(...validateBooking(booking, index, options, period.length === 0)));
  findings.push(...ratesPerTax(bookings));
  if (options.taxRounding === 'per_tax' && roundingAccount !== undefined) {
    const taxed = bookings.find((booking) => booking.vat && booking[booking.vat.side].account === roundingAccount);
    if (taxed) {
      findings.push(
        finding(
          'E-ODOO-ROUNDING-ACCOUNT',
          'roundingAccount',
          roundingAccount,
          `${taxed.businessDate}: odoo.roundingAccount ${roundingAccount} is also the account of a taxed base line; ` +
            'the rounding cent must go on an account without taxes, see docs/configuration.md',
        ),
      );
    }
  }
  return findings;
}

function validateBooking(b: OdooBooking, index: number, period: PeriodOptions, periodValid: boolean): Finding[] {
  const findings: Finding[] = [];
  const where = `${String(b.businessDate)}, accounts ${b.debit.account} / ${b.credit.account}`;
  const error = (code: string, field: string, value: unknown, message: string) => findings.push({ ...finding(code, field, value, `${where}: ${message}`), index });

  for (const side of ['debit', 'credit'] as const) {
    const { account } = b[side];
    if (!ACCOUNT_CODE.test(account)) error('E-ODOO-ACCOUNT', side, account, `the ${side} account "${account}" must be an Odoo account code: 1 to 64 characters of A-Z, a-z, 0-9 and "."`);
  }
  if (b.debit.account === b.credit.account) error('E-ODOO-SAME-ACCOUNT', 'credit', b.credit.account, 'debit and credit account are the same: a booking needs two different accounts');
  const grossValid = Number.isInteger(b.grossCents) && b.grossCents > 0 && b.grossCents <= MAX_AMOUNT_CENTS;
  if (!grossValid) error('E-ODOO-AMOUNT', 'grossCents', b.grossCents, `the amount must be whole cents above 0 and at most ${formatAmount(MAX_AMOUNT_CENTS)}, got ${describe(b.grossCents)}`);
  if (!isLocalDate(b.businessDate)) {
    error('E-ODOO-DATE', 'businessDate', b.businessDate, `the date must be a valid date written YYYY-MM-DD`);
  } else if (periodValid && (b.businessDate < period.from || b.businessDate > period.to)) {
    error('E-ODOO-DATE', 'businessDate', b.businessDate, `the date is outside the file period ${period.from} to ${period.to}`);
  }
  if (!b.vat) return findings;
  const { taxRef, percent, apaleoTaxCents } = b.vat;
  if (!TAX_REF.test(taxRef)) {
    error('E-ODOO-TAX-REF', 'taxRef', taxRef, `the tax "${taxRef}" must be a chart-template tax id such as tax_ust_19_skr03 or an External ID such as __import__.ust_7_hotel`);
  }
  if (!(Number.isFinite(percent) && percent >= 0 && percent <= 100 && Math.abs(percent * 100 - Math.round(percent * 100)) < 1e-9)) {
    error('E-ODOO-RATE', 'percent', percent, `the tax rate must be from 0 to 100 with at most two decimals, got ${percent}`);
  }
  if (!Number.isInteger(apaleoTaxCents) || apaleoTaxCents < 0 || (grossValid && apaleoTaxCents >= b.grossCents)) {
    error('E-ODOO-AMOUNT', 'apaleoTaxCents', apaleoTaxCents, `apaleo's tax must be whole cents from 0 to below the amount ${describe(b.grossCents)}, got ${describe(apaleoTaxCents)}`);
  }
  return findings;
}

/** `E-ODOO-RATE` for a tax value that bookings carry with two rates: an Odoo tax has one rate. */
function ratesPerTax(bookings: readonly OdooBooking[]): Finding[] {
  const rates = new Map<string, Set<number>>();
  for (const { vat } of bookings) if (vat) rates.set(vat.taxRef, (rates.get(vat.taxRef) ?? new Set()).add(vat.percent));
  return [...rates]
    .filter(([, percents]) => percents.size > 1)
    .map(([taxRef, percents]) =>
      finding('E-ODOO-RATE', 'percent', taxRef, `the tax ${taxRef} is used with the rates ${[...percents].map((p) => `${formatRate(p)} %`).join(', ')}; an Odoo tax has one rate, so check the mapping`),
    );
}

/**
 * The checks of a fitted entry against Odoo's own computation (design decision
 * 6): `E-ODOO-UNBALANCED` when Odoo would add an automatic balancing line,
 * `E-ODOO-GROSS` when a (tax, side) group does not reach its bookings' gross,
 * `E-ODOO-VAT-FIT` when Odoo's tax of a group lies further from apaleo's than
 * the fitting can move it. Defect guards: a correct fitting never raises them.
 */
export function validateEntry(entry: OdooEntry, mode: OdooRenderOptions['taxRounding']): Finding[] {
  const findings: Finding[] = [];
  const taxes = odooTax(entry.lines, mode);
  const lineSum = entry.lines.reduce((sum, line) => sum + line.amountCents, 0);
  const imbalance = taxes.reduce((sum, { side, taxCents }) => sum + (side === 'credit' ? -taxCents : taxCents), lineSum);
  if (imbalance !== 0) {
    const accounts = [...new Set(entry.lines.map((line) => line.account))].join(', ');
    findings.push(
      finding(
        'E-ODOO-UNBALANCED',
        'account',
        formatSignedAmount(imbalance),
        `${entry.date} (accounts ${accounts}): debits minus credits with Odoo's tax are ${formatSignedAmount(imbalance)}, not 0.00, ` +
          `so Odoo would add an "Automatic Balancing Line" of ${formatAmount(imbalance)} on the suspense account. ${DEFECT}`,
      ),
    );
  }
  for (const group of entry.groups) {
    const members = entry.lines.filter((line) => line.taxRef === group.taxRef && sideOf(line.amountCents) === group.side);
    const rounding = entry.lines.filter((line) => line.roundsGroup === group.key);
    const accounts = [...new Set([...members, ...rounding].map((line) => line.account))].join(', ');
    const taxCents = taxes.find((tax) => tax.key === group.key)?.taxCents ?? 0;
    const reached = [...members, ...rounding].reduce((sum, line) => sum + Math.abs(line.amountCents), taxCents);
    const where = `${entry.date}, ${group.taxRef} ${formatRate(group.percent)} % on the ${group.side === 'credit' ? 'invoice' : 'refund'} side (accounts ${accounts})`;
    if (reached !== group.grossCents) {
      findings.push(
        finding('E-ODOO-GROSS', 'account', formatAmount(reached), `${where}: the bases with Odoo's tax reach ${formatAmount(reached)}, the bookings' gross is ${formatAmount(group.grossCents)}. ${DEFECT}`),
      );
    }
    const tolerance = group.apaleoLines + 1;
    if (Math.abs(taxCents - group.apaleoTaxCents) > tolerance) {
      findings.push(
        finding(
          'E-ODOO-VAT-FIT',
          'account',
          formatAmount(taxCents),
          `${where}: Odoo's tax ${formatAmount(taxCents)} differs from apaleo's ${formatAmount(group.apaleoTaxCents)} by more than ${formatAmount(tolerance)} ` +
            `(one cent per apaleo line plus one). ${DEFECT}`,
        ),
      );
    }
  }
  return findings;
}

/** The fitting guarantees these checks, so a failure is a defect to report. */
const DEFECT = `The fitting should have prevented this. ${REPORT_PROBLEM_HINT}`;

function finding(code: string, field: string, value: unknown, message: string): Finding {
  return { code, field, label: LABELS[field] ?? field, value: String(value), message };
}

function describe(cents: number): string {
  return Number.isInteger(cents) ? formatSignedAmount(cents) : String(cents);
}
