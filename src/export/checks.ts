import { compareAggregates } from '../core/aggregates.js';
import type { ChartIndex } from '../core/chart.js';
import { eachDay, nextDay, type LocalDate } from '../core/date.js';
import { REPORT_PROBLEM_HINT } from '../core/errors.js';
import type { Finding } from '../core/findings.js';
import { formatCents, negateDecimal, sumDecimals } from '../core/money.js';
import type { LedgerLine, SourceAdapter } from '../core/source.js';
import { FOOD_RATE_CANDIDATES, foodRatePeriod, foodRatePeriodText, isFoodName, lineRate, resolve, taxOf, type Mapping, type MappingRow } from '../mapping/index.js';
import {
  apaleoVatOf,
  inferReleaseRates,
  inferredTaxCents,
  normaliseTaxes,
  resolutionRate,
  type PostedBooking,
  type PostingResult,
  type ReleaseRate,
} from '../posting/index.js';
import type { DateRange } from './period.js';
import type { TargetWriter } from './target.js';

/**
 * Plausibility checks on a posting result before its file is written
 * (export-run, "Plausibility checks"). They re-derive what the bookings must
 * add up to from the apaleo lines, so a defect in the posting rules cannot
 * reach the accounting program unnoticed. They check the bookings, not the
 * file: the tax lines the accounting program computes itself and the cents a
 * target adds to reach apaleo's gross are proven by the target's own checks of
 * the rendered file, which the export reports like these.
 */

export interface CheckOptions {
  mapping: Mapping;
  chart: ChartIndex;
  /** The target's movement model of a booking (`TargetWriter.movements`). */
  movements: TargetWriter<PostedBooking>['movements'];
}

/** Adds `cents` to the entry for `key`. */
function add<K>(map: Map<K, number>, key: K, cents: number): void {
  map.set(key, (map.get(key) ?? 0) + cents);
}

const absoluteGross = (lines: readonly LedgerLine[]) => lines.reduce((sum, line) => sum + Math.abs(line.grossCents), 0);

/** Every ledger line is booked or skipped, by count and by absolute gross amount (`E-CONSERVATION`). */
export function checkConservation(lines: readonly LedgerLine[], result: PostingResult): Finding[] {
  const ledger = absoluteGross(lines);
  // A booking moves apaleo's absolute gross.
  const booked = result.bookings.reduce((sum, booking) => sum + Math.abs(booking.grossCents), 0);
  const skipped = absoluteGross(result.skipped.map((entry) => entry.line));
  const count = result.bookings.length + result.skipped.length;
  if (ledger === booked + skipped && lines.length === count) return [];
  return [
    {
      code: 'E-CONSERVATION',
      message:
        `the ${lines.length} apaleo lines move ${formatCents(ledger)} (absolute gross), but the ${result.bookings.length} bookings ` +
        `move ${formatCents(booked)} and the ${result.skipped.length} skipped lines ${formatCents(skipped)}, ` +
        `so ${formatCents(ledger - booked - skipped)} would be lost or doubled. ${REPORT_PROBLEM_HINT}`,
    },
  ];
}

const dayKey = (day: LocalDate, account: string) => `${day} ${account}`;

/**
 * Per business day and target account, the signed movement in the bookings (the
 * target's movement model, `CheckOptions.movements`) equals the signed movement
 * of the booked apaleo lines mapped to that account, debit positive and credit
 * negative: the side without a tax moves by the gross, the side whose mapping
 * row has a tax by the gross minus apaleo's tax rounded to the cent. The tax
 * lines the accounting program creates on its own tax accounts are not part of
 * this check. Catches side, sign and account bugs (`E-ACCOUNT-BALANCE`).
 */
export function checkAccountMovements(lines: readonly LedgerLine[], result: PostingResult, { mapping, chart, movements }: CheckOptions): Finding[] {
  const skipped = new Set(result.skipped.map((entry) => entry.line));
  const releases = inferReleaseRates(lines, chart);
  const expected = new Map<string, number>();
  for (const line of lines) {
    if (skipped.has(line)) continue;
    const rate = resolutionRate(line, releases);
    const debit = resolve(mapping, line.debit, { rate, chart });
    const credit = resolve(mapping, line.credit, { rate, chart });
    // An unmapped side is reported by the coverage check.
    if (!debit?.odooAccount || !credit?.odooAccount) continue;
    const tax = Math.sign(line.grossCents) * lineTaxCents(line, releases.get(line));
    const taxOn = (row: MappingRow) => (taxOf(row) === undefined ? 0 : tax);
    add(expected, dayKey(line.businessDate, debit.odooAccount), line.grossCents - taxOn(debit));
    add(expected, dayKey(line.businessDate, credit.odooAccount), -(line.grossCents - taxOn(credit)));
  }
  const actual = new Map<string, number>();
  for (const booking of result.bookings) {
    for (const [account, cents] of movements(booking)) add(actual, dayKey(booking.businessDate, account), cents);
  }
  const keys = [...new Set([...expected.keys(), ...actual.keys()])].sort();
  return keys.flatMap((key) => {
    const [day = '', account = ''] = key.split(' ');
    const want = expected.get(key) ?? 0;
    const got = actual.get(key) ?? 0;
    if (want === got) return [];
    return [
      {
        code: 'E-ACCOUNT-BALANCE',
        message:
          `on ${day} account ${account} moves ${formatCents(got)} in the bookings, but the apaleo lines mapped to it ` +
          `move ${formatCents(want)} (Soll positive, Haben negative). ${REPORT_PROBLEM_HINT}`,
        value: account,
      },
    ];
  });
}

/** apaleo's tax of a line in cents, unsigned: its taxes rounded per line, or the inferred tax of an untaxed deposit line. */
function lineTaxCents(line: LedgerLine, release: ReleaseRate | undefined): number {
  const taxes = normaliseTaxes(line.taxes);
  if (taxes.length > 0) return Math.abs(taxes.reduce((sum, tax) => sum + tax.amountCents, 0));
  return release && release.kind !== 'unknown' ? inferredTaxCents(line, release) : 0;
}

/** apaleo's VAT per rate: the per-line taxes rounded to cents (for the check) and their precise sum (for the message). */
interface ApaleoVatTotal {
  cents: number;
  precise: string[];
}

/** VAT owed per rate in apaleo: the taxes of the booked lines, and for untaxed deposit lines the VAT apaleo moved for them. */
function apaleoVatByRate(lines: readonly LedgerLine[], result: PostingResult, chart: ChartIndex): Map<number, ApaleoVatTotal> {
  const skipped = new Set(result.skipped.map((entry) => entry.line));
  const releases = inferReleaseRates(lines, chart);
  const vat = new Map<number, ApaleoVatTotal>();
  for (const line of lines) {
    if (skipped.has(line)) continue;
    for (const { rate, cents, precise } of apaleoVatOf(line, releases.get(line))) {
      const entry = vat.get(rate) ?? { cents: 0, precise: [] };
      entry.cents += cents;
      entry.precise.push(precise);
      vat.set(rate, entry);
    }
  }
  return vat;
}

/** apaleo's tax per rate as the bookings carry it, signed as owed: the tax of a credited VAT side is owed (+), of a debited one reduces it. */
function bookedVatByRate(result: PostingResult): Map<number, number> {
  const vat = new Map<number, number>();
  for (const { vat: tax } of result.bookings) if (tax && tax.apaleoTaxCents !== 0) add(vat, tax.percent, tax.side === 'credit' ? tax.apaleoTaxCents : -tax.apaleoTaxCents);
  return vat;
}

/**
 * Per VAT rate, the tax the bookings carry equals the sum of apaleo's per-line
 * tax rounded to cents of the booked lines of that rate, within one cent per
 * rounding difference the posting run accepted on a computed deposit tax at
 * that rate (`E-VAT-TOTAL` above it). The difference to apaleo's precise total
 * is line rounding and never an error by itself.
 */
export function checkVatByRate(lines: readonly LedgerLine[], result: PostingResult, options: CheckOptions): Finding[] {
  const apaleo = apaleoVatByRate(lines, result, options.chart);
  const booked = bookedVatByRate(result);
  const rates = [...new Set([...apaleo.keys(), ...booked.keys()])].sort((a, b) => a - b);
  return rates.flatMap((rate) => {
    const allowance = result.vatRoundingByRate.get(rate) ?? 0;
    const charged = apaleo.get(rate)?.cents ?? 0;
    const precise = sumDecimals(apaleo.get(rate)?.precise ?? []);
    const carried = booked.get(rate) ?? 0;
    if (Math.abs(carried - charged) <= allowance) return [];
    const lineRounding = sumDecimals([formatCents(charged), negateDecimal(precise)]);
    return [
      {
        code: 'E-VAT-TOTAL',
        message:
          `at ${rate} % the bookings carry ${formatCents(carried)} tax, but apaleo charged ${formatCents(charged)} ` +
          `as the sum of its per-line tax rounded to cents (difference apaleo minus bookings ${formatCents(charged - carried)}, the rounding total allows ` +
          `${formatCents(allowance)}). apaleo's precise total is ${precise}; its per-line rounding (${lineRounding}) is no error, ` +
          `so the difference of ${formatCents(charged - carried)} is the problem. ` +
          REPORT_PROBLEM_HINT,
        value: String(rate),
      },
    ];
  });
}

/**
 * One rate per tax in the file (`E-TAX-RATES`): a tax of the accounting program
 * has one rate, so the bookings of a tax at a second rate would be computed with the first.
 * Two mapping rows may use one tax at two rates over time (a rate change on
 * 1 January needs a new tax, but a mapping can still name the old one),
 * so this runs on the bookings of one property-month, not on the mapping. Names
 * the tax, its rates and the mapping rows the month used with it.
 */
export function checkTaxRates(lines: readonly LedgerLine[], result: PostingResult, { mapping, chart }: Pick<CheckOptions, 'mapping' | 'chart'>): Finding[] {
  const rates = new Map<string, Set<number>>();
  for (const { vat } of result.bookings) {
    if (!vat) continue;
    const set = rates.get(vat.taxRef) ?? new Set<number>();
    set.add(vat.percent);
    rates.set(vat.taxRef, set);
  }
  const mixed = [...rates].filter(([, set]) => set.size > 1).sort(([a], [b]) => a.localeCompare(b));
  if (mixed.length === 0) return [];
  const rows = rowsWithTax(lines, result, mapping, chart);
  return mixed.map(([tax, set]) => {
    const percents = [...set].sort((a, b) => a - b).map((rate) => `${rate} %`);
    const used = rows.get(tax) ?? [];
    return {
      code: 'E-TAX-RATES',
      message:
        `the tax ${tax} is booked at ${percents.join(' and ')} in this file ` +
        `(${used.length === 1 ? 'line' : 'lines'} ${used.join(', ')} of the mapping file), but a tax has one rate in the accounting program, ` +
        'so it would compute the bookings at the other rate with that one. Give each rate its own tax ' +
        '(odoo_tax and tax_percent), run "apaleo-odoo mapping check" and export again. No file was written',
      field: 'odoo_tax',
      value: tax,
    };
  });
}

/** Per tax, the sorted line numbers of the mapping rows with that tax that the booked apaleo lines resolve to. */
function rowsWithTax(lines: readonly LedgerLine[], result: PostingResult, mapping: Mapping, chart: ChartIndex): Map<string, number[]> {
  const skipped = new Set(result.skipped.map((entry) => entry.line));
  const releases = inferReleaseRates(lines, chart);
  const rows = new Map<string, Set<number>>();
  for (const line of lines) {
    if (skipped.has(line)) continue;
    const rate = resolutionRate(line, releases);
    for (const account of [line.debit, line.credit]) {
      const row = resolve(mapping, account, { rate, chart });
      const tax = row && taxOf(row);
      if (!row || tax === undefined) continue;
      const set = rows.get(tax) ?? new Set<number>();
      set.add(row.line);
      rows.set(tax, set);
    }
  }
  return new Map([...rows].map(([tax, set]) => [tax, [...set].sort((a, b) => a - b)]));
}

/**
 * `W-FOOD-RATE` once per business day on which a revenue line on a food account
 * (its apaleo name matches the templates' food pattern and not the beverage
 * pattern) carries a German rate other than the Speisen rate of its day
 * (`FOOD_RATE_PERIODS`: 7 % from 2026-01-01, 19 % from 2024-01-01 to 2025-12-31,
 * 7 % from 2021 to 2023, 5 % in the second half of 2020, 19 % before). The most
 * likely error after the change of 2026-01-01 is a food account still at 19 % in
 * apaleo. A warning only: a food account can hold drinks, and the tool never
 * changes the rate apaleo charged. A line at a rate that never applied to food or
 * drinks (0 % for example) is left alone.
 */
export function checkFoodRate(lines: readonly LedgerLine[]): Finding[] {
  const days = new Map<LocalDate, Map<string, string>>();
  for (const line of lines) {
    const revenue = line.credit.type === 'Revenues' ? line.credit : line.debit.type === 'Revenues' ? line.debit : undefined;
    if (!revenue || !isFoodName(revenue.name)) continue;
    const rate = lineRate(line);
    if (rate === undefined || rate === foodRatePeriod(line.businessDate).percent || !FOOD_RATE_CANDIDATES.has(rate)) continue;
    const accounts = days.get(line.businessDate) ?? new Map<string, string>();
    accounts.set(revenue.number, `${revenue.number} ("${revenue.name}") at ${rate} %`);
    days.set(line.businessDate, accounts);
  }
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([day, accounts]) => {
    const period = foodRatePeriod(day);
    return {
      code: 'W-FOOD-RATE',
      message:
        `on ${day} apaleo booked food revenue on ${[...accounts.keys()].sort().map((number) => accounts.get(number)).join(', ')}, ` +
        `but Speisen are taxed at ${period.percent} % for services ${foodRatePeriodText(period)}, so ${period.percent} % is expected on ${day}; ` +
        'drinks stay at the standard rate. Check the VAT setting of the service and the account in apaleo ' +
        'with your Steuerberater (if the account also holds drinks, the rate can be right). The file is written with the rate apaleo charged',
      value: day,
    };
  });
}

/**
 * The three blocking checks on the bookings, in order: conservation, account
 * movements, VAT per rate. The checks of the fitted file follow when the target
 * renders it (for example an entry out of balance after the computed tax).
 */
export function plausibilityFindings(lines: readonly LedgerLine[], result: PostingResult, options: CheckOptions): Finding[] {
  return [...checkConservation(lines, result), ...checkAccountMovements(lines, result, options), ...checkVatByRate(lines, result, options)];
}

/** How the ledger side of an aggregate comparison was added up, for messages. */
const BASIS_TEXT = { gross: 'gross amounts', net: 'precise net amounts', tax: 'precise taxes' } as const;

/**
 * The opt-in completeness check (`checks.aggregates`): apaleo's daily aggregates,
 * one request per business day, against that day's ledger lines by balance (see
 * `compareAggregates`). An account whose balances differ is a
 * `W-AGGREGATE-DIFF` warning.
 */
export async function checkAggregates(
  source: SourceAdapter,
  propertyId: string,
  period: DateRange,
  lines: readonly LedgerLine[],
  chart: ChartIndex,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  // One day at a time: these requests are not throttled by the adapter.
  for (const day of eachDay(period.from, nextDay(period.to))) {
    const totals = await source.getAccountTotals(propertyId, day);
    const dayLines = lines.filter((line) => line.businessDate === day);
    for (const comparison of compareAggregates(totals, dayLines, chart)) {
      if (comparison.match) continue;
      const { account } = comparison;
      findings.push({
        code: 'W-AGGREGATE-DIFF',
        message:
          `on ${day} apaleo's daily aggregate for account ${account.number} (${account.type}) has the balance ` +
          `${formatCents(comparison.sourceBalanceCents)}, but the ledger lines of that day add up to ${formatCents(comparison.ledgerBalanceCents)} ` +
          `(balance debit minus credit, from the ${BASIS_TEXT[comparison.basis]}). Compare the day in apaleo; the file is written anyway`,
        value: account.number,
      });
    }
  }
  return findings;
}
