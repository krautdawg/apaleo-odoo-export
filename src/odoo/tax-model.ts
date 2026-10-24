import { groupKey, rateHundredths, roundHalfAwayFromZero, taxOnBase } from './format.js';
import type { OdooLine, OdooTaxRounding, Side } from './types.js';

/** The tax Odoo creates for one (tax, side) group of an entry. */
export interface OdooTaxAmount {
  key: string;
  taxRef: string;
  percent: number;
  /** `credit` = invoice side (a credited base line), `debit` = refund side. */
  side: Side;
  /** Unsigned cents; the tax line is on the same side as its base lines. */
  taxCents: number;
}

export type TaxModelLine = Pick<OdooLine, 'taxRef' | 'percent' | 'amountCents'>;

/** The side of a base line: Odoo treats a base line without credit (a debit) as a refund (`_compute_is_refund`). */
export function sideOf(amountCents: number): Side {
  return amountCents < 0 ? 'credit' : 'debit';
}

/**
 * The tax Odoo creates for the base lines of one journal entry in "auto tax
 * mode" (research §3): the line amount is the base (journal entries exclude the
 * tax), lines without tax are ignored, and every amount is rounded half away
 * from zero. `per_line` rounds each line's tax and sums per (tax, side);
 * `per_tax` rounds the tax of each (tax, side) group's summed base once. Groups
 * come in the order of their first line.
 */
export function odooTax(lines: readonly TaxModelLine[], mode: OdooTaxRounding): OdooTaxAmount[] {
  const groups = new Map<string, { taxRef: string; percent: number; side: Side; bases: number[] }>();
  for (const { taxRef, percent, amountCents } of lines) {
    if (taxRef === undefined || percent === undefined || amountCents === 0) continue;
    const side = sideOf(amountCents);
    const key = groupKey(taxRef, side);
    const group = groups.get(key) ?? { taxRef, percent, side, bases: [] };
    group.bases.push(Math.abs(amountCents));
    groups.set(key, group);
  }
  return [...groups].map(([key, { taxRef, percent, side, bases }]) => {
    const taxCents =
      mode === 'per_line'
        ? bases.reduce((sum, base) => sum + taxOnBase(base, percent), 0)
        : roundHalfAwayFromZero(bases.reduce((sum, base) => sum + base, 0) * rateHundredths(percent), 10_000);
    return { key, taxRef, percent, side, taxCents };
  });
}

/** Debits minus credits of the lines, minus Odoo's tax of the invoice side, plus that of the refund side: 0 when Odoo adds no balancing line. */
export function entryImbalance(lines: readonly TaxModelLine[], mode: OdooTaxRounding): number {
  const lineSum = lines.reduce((sum, line) => sum + line.amountCents, 0);
  return odooTax(lines, mode).reduce((sum, { side, taxCents }) => sum + (side === 'credit' ? -taxCents : taxCents), lineSum);
}
