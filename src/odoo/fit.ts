import type { LocalDate } from '../core/date.js';
import type { Finding } from '../core/findings.js';
import { compareLines, type NettedKey } from './entries.js';
import { COMPANION_LABEL_SUFFIX, FIT_SEARCH_CENTS, formatAmount, formatRate, groupKey, rateHundredths, roundingAccountLabel, taxOnBase } from './format.js';
import { withSuffix } from './sanitise.js';
import { odooTax, sideOf } from './tax-model.js';
import type { OdooEntry, OdooLine, OdooRenderOptions, OdooTaxGroup, OdooVatComparison, Side } from './types.js';

/** The base for one gross: `exact` when base plus Odoo's tax reaches the gross, else the base reaches it minus one cent. */
export interface FittedBase {
  baseCents: number;
  exact: boolean;
}

/**
 * The base `B` with `B + round(B × rate / 100) = gross` nearest to apaleo's
 * net, the smaller of two equally near ones (design decision 4). The search
 * covers 3 cents on either side of apaleo's net and of the exact net of the
 * gross (`gross × 100 / (100 + rate)`), so a netted line whose apaleo net has
 * drifted by many per-line roundings still finds its base. When the rounding
 * jumps over the gross, the largest `B` that reaches the gross minus one cent,
 * and `exact` false: the caller adds the cent.
 */
export function fitBase(grossCents: number, apaleoNetCents: number, percent: number): FittedBase {
  const exactNet = Math.round((grossCents * 10_000) / (10_000 + rateHundredths(percent)));
  const candidates = new Set<number>();
  for (const centre of [apaleoNetCents, exactNet]) {
    for (let base = centre - FIT_SEARCH_CENTS; base <= centre + FIT_SEARCH_CENTS; base++) if (base >= 0) candidates.add(base);
  }
  const sorted = [...candidates].sort((a, b) => a - b);
  const reached = (base: number) => base + taxOnBase(base, percent);
  const exact = sorted.filter((base) => reached(base) === grossCents);
  if (exact.length > 0) {
    const distance = (base: number) => Math.abs(base - apaleoNetCents);
    const best = exact.reduce((nearest, base) => (distance(base) < distance(nearest) ? base : nearest));
    return { baseCents: best, exact: true };
  }
  const below = sorted.filter((base) => reached(base) === grossCents - 1).at(-1);
  if (below === undefined) throw new Error(`No base reaches ${grossCents} cents at ${percent} %: the rate must lie from 0 to 100`);
  return { baseCents: below, exact: false };
}

/** The entry of one day after fitting, with `N-ODOO-ROUNDING-LINE` notes and `E-ODOO-ROUNDING-ACCOUNT` errors. */
export interface FittedDay {
  entry: OdooEntry;
  notes: Finding[];
  errors: Finding[];
}

type FitOptions = Pick<OdooRenderOptions, 'taxRounding' | 'roundingAccount'>;

interface TaxedKey extends NettedKey {
  taxRef: string;
  percent: number;
  side: Side;
  /** +1 on the debit side, -1 on the credit side. */
  sign: 1 | -1;
}

/**
 * Turns the netted keys of one day into the lines of its entry: an untaxed key
 * keeps its net; a taxed key becomes a base line fitted so that the base plus
 * Odoo's tax reaches apaleo's gross, per line (`per_line`) or per (tax, side)
 * group (`per_tax`, the group's base distributed over its keys by apaleo's
 * nets with the largest-remainder method). A cent the rounding cannot reach
 * becomes a 0.01 companion base line (`per_line`) or an untaxed 0.01 line on
 * `odoo.roundingAccount` (`per_tax`). A key without amount gets no line.
 * Booking lines come in `compareLines` order, rounding lines after them.
 */
export function fitDay(date: LocalDate, keys: readonly NettedKey[], options: FitOptions): FittedDay {
  const notes: Finding[] = [];
  const errors: Finding[] = [];
  const lines: OdooLine[] = [];
  const roundingLines: OdooLine[] = [];
  let droppedKeys = 0;
  const line = (key: Pick<NettedKey, 'account' | 'label' | 'taxRef' | 'percent' | 'sourceEntryNumbers'>, amountCents: number, kind: OdooLine['kind'] = 'booking'): OdooLine => ({
    account: key.account,
    label: key.label,
    ...(key.taxRef !== undefined && { taxRef: key.taxRef, percent: key.percent }),
    amountCents,
    kind,
    sourceEntryNumbers: key.sourceEntryNumbers,
  });

  const taxed: TaxedKey[] = [];
  for (const key of keys) {
    if (key.taxRef === undefined || key.percent === undefined) {
      if (key.netCents === 0) droppedKeys++;
      else lines.push(line(key, key.netCents));
    } else if (key.grossCents === 0) {
      droppedKeys++;
    } else {
      const side = sideOf(key.grossCents);
      taxed.push({ ...key, taxRef: key.taxRef, percent: key.percent, side, sign: side === 'debit' ? 1 : -1 });
    }
  }
  taxed.sort(compareLines);
  const groups = taxGroups(taxed);
  const roundingNote = (account: string, percent: number, grossCents: number, label: string) =>
    notes.push({
      code: 'N-ODOO-ROUNDING-LINE',
      field: 'account',
      label: 'Account',
      value: account,
      message:
        `${date}, account ${account}, ${formatRate(percent)} %: no base plus Odoo's tax reaches apaleo's gross ${formatAmount(grossCents)} exactly, ` +
        `so the line "${label}" of 0.01 adds the missing cent`,
    });

  if (options.taxRounding === 'per_line') {
    for (const key of taxed) {
      const gross = Math.abs(key.grossCents);
      const { baseCents, exact } = fitBase(gross, key.sign * key.netCents, key.percent);
      if (baseCents > 0) lines.push(line(key, key.sign * baseCents));
      if (exact) continue;
      const companion = line({ ...key, label: withSuffix(key.label, COMPANION_LABEL_SUFFIX) }, key.sign, 'rounding-companion');
      roundingLines.push(companion);
      roundingNote(key.account, key.percent, gross, companion.label);
    }
  } else {
    for (const group of groups) {
      const members = taxed.filter((key) => groupKey(key.taxRef, key.side) === group.key);
      const sign = group.side === 'debit' ? 1 : -1;
      const apaleoNet = members.reduce((sum, key) => sum + key.sign * key.netCents, 0);
      const { baseCents, exact } = fitBase(group.grossCents, apaleoNet, group.percent);
      const shares = largestRemainder(baseCents, members.map((key) => Math.max(0, key.sign * key.netCents)), members.map((key) => Math.abs(key.grossCents)));
      members.forEach((key, i) => {
        const share = shares[i] ?? 0;
        if (share > 0) lines.push(line(key, sign * share));
        else droppedKeys++;
      });
      if (exact) continue;
      const accounts = [...new Set(members.map((key) => key.account))].join(', ');
      if (options.roundingAccount === undefined) {
        errors.push({
          code: 'E-ODOO-ROUNDING-ACCOUNT',
          field: 'roundingAccount',
          label: 'odoo.roundingAccount',
          message:
            `${date}, ${formatRate(group.percent)} % (account ${accounts}): Odoo's tax rounded per tax cannot reach apaleo's gross ${formatAmount(group.grossCents)}, ` +
            'and odoo.roundingAccount is not set for the missing cent; set it to an account without taxes, see docs/configuration.md',
        });
        continue;
      }
      const label = roundingAccountLabel(group.percent);
      roundingLines.push({ account: options.roundingAccount, label, amountCents: sign, kind: 'rounding-account', roundsGroup: group.key, sourceEntryNumbers: [] });
      roundingNote(options.roundingAccount, group.percent, group.grossCents, label);
    }
  }
  lines.sort(compareLines);
  roundingLines.sort(compareLines);
  return { entry: { date, lines: [...lines, ...roundingLines], groups, droppedKeys }, notes, errors };
}

/** The (tax, side) groups of the taxed keys, in the order of their first key. */
function taxGroups(taxed: readonly TaxedKey[]): OdooTaxGroup[] {
  const groups = new Map<string, OdooTaxGroup>();
  for (const key of taxed) {
    const id = groupKey(key.taxRef, key.side);
    const group = groups.get(id) ?? { key: id, taxRef: key.taxRef, percent: key.percent, side: key.side, grossCents: 0, apaleoTaxCents: 0, apaleoLines: 0 };
    group.grossCents += Math.abs(key.grossCents);
    group.apaleoTaxCents += key.sign * key.apaleoTaxCents;
    group.apaleoLines += key.apaleoLines;
    groups.set(id, group);
  }
  return [...groups.values()];
}

/**
 * `total` split in proportion to `weights` in whole cents by the
 * largest-remainder method, ties to the first; `fallback` weights when every
 * weight is 0. Exact in BigInt, so large amounts never lose a cent.
 */
export function largestRemainder(total: number, weights: readonly number[], fallback: readonly number[] = weights): number[] {
  const used = weights.some((weight) => weight > 0) ? weights : fallback;
  const sum = used.reduce((a, b) => a + b, 0);
  if (sum === 0) return used.map((_, i) => (i === 0 ? total : 0));
  const [bigTotal, bigSum] = [BigInt(total), BigInt(sum)];
  const parts = used.map((weight, index) => {
    const product = bigTotal * BigInt(weight);
    return { index, share: product / bigSum, remainder: product % bigSum };
  });
  let left = total - parts.reduce((acc, part) => acc + Number(part.share), 0);
  const byRemainder = [...parts].sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));
  for (const part of byRemainder) {
    if (left <= 0) break;
    part.share += 1n;
    left--;
  }
  return parts.map((part) => Number(part.share));
}

/** Odoo's modelled tax against apaleo's per rate of one entry, signed: output tax positive, refund side negative. */
export function vatComparison(entry: OdooEntry, mode: OdooRenderOptions['taxRounding']): OdooVatComparison[] {
  const byRate = new Map<number, OdooVatComparison>();
  const add = (percent: number, odoo: number, apaleo: number) => {
    const row = byRate.get(percent) ?? { date: entry.date, percent, odooTaxCents: 0, apaleoTaxCents: 0, differenceCents: 0 };
    row.odooTaxCents += odoo;
    row.apaleoTaxCents += apaleo;
    row.differenceCents = row.odooTaxCents - row.apaleoTaxCents;
    byRate.set(percent, row);
  };
  for (const tax of odooTax(entry.lines, mode)) add(tax.percent, tax.side === 'credit' ? tax.taxCents : -tax.taxCents, 0);
  for (const group of entry.groups) add(group.percent, 0, group.side === 'credit' ? group.apaleoTaxCents : -group.apaleoTaxCents);
  return [...byRate.values()].sort((a, b) => b.percent - a.percent);
}
