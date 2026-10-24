import type { OdooVersion } from '../core/config.js';
import { formatAmount, formatRate, formatSignedAmount, kennzahl, roundingMethodLabel, taxExternalId } from './format.js';
import type { OdooBooking, OdooRenderOptions } from './types.js';
import type { RenderedOdooCsv } from './writer.js';

/** Where the accountant filters the entries of a file in Odoo: the start of every reference. */
export function referencePrefix(options: Pick<OdooRenderOptions, 'propertyId' | 'demo'>): string {
  return `${options.demo ? 'DEMO ' : ''}apaleo ${options.propertyId}`;
}

/**
 * The import block of the protocol: what the accountant compares with the Odoo
 * company before the import, the steps, and the checks after it
 * (docs/odoo-format.md). Taxes are listed with their External ID as the file
 * writes it, their rate and UStVA Kennzahl; Odoo's modelled tax per rate is
 * compared with apaleo's over the whole file.
 */
export function importBlock(
  rendered: Pick<RenderedOdooCsv, 'entries' | 'roundingLines' | 'droppedKeys' | 'vat' | 'taxTotals'>,
  options: OdooRenderOptions,
  fileName: string,
  version?: OdooVersion,
): string[] {
  const { entries, roundingLines, droppedKeys } = rendered;
  const lines = entries.reduce((sum, entry) => sum + entry.lines.length, 0);
  const taxes = new Map<string, number>();
  for (const entry of entries) for (const line of entry.lines) if (line.taxRef !== undefined && line.percent !== undefined) taxes.set(taxExternalId(line.taxRef, options.companyId), line.percent);
  const taxList = [...taxes]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, percent]) => `${id} (${formatRate(percent)} %${kennzahl(percent) ? `, ${kennzahl(percent)}` : ''})`);
  const perRate = new Map<number, { odoo: number; apaleo: number }>();
  for (const row of rendered.vat) {
    const total = perRate.get(row.percent) ?? { odoo: 0, apaleo: 0 };
    total.odoo += row.odooTaxCents;
    total.apaleo += row.apaleoTaxCents;
    perRate.set(row.percent, total);
  }
  const vat = [...perRate]
    .sort(([a], [b]) => b - a)
    .map(
      ([percent, { odoo, apaleo }]) =>
        `${formatRate(percent)} % Odoo ${formatSignedAmount(odoo)}, apaleo per line ${formatSignedAmount(apaleo)}, difference (Odoo minus apaleo) ${formatSignedAmount(odoo - apaleo)}`,
    );
  const perTax = rendered.taxTotals.map(
    (total) =>
      `${taxExternalId(total.taxRef, options.companyId)} ${formatRate(total.percent)} %${kennzahl(total.percent) ? ` (${kennzahl(total.percent)})` : ''}: ` +
      `base in the file ${formatSignedAmount(total.baseCents)}, Odoo VAT ${formatSignedAmount(total.odooTaxCents)}, apaleo per line ${formatSignedAmount(total.apaleoTaxCents)}, ` +
      `difference (Odoo minus apaleo) ${formatSignedAmount(total.odooTaxCents - total.apaleoTaxCents)}`,
  );
  const prefix = referencePrefix(options);
  const revision =
    options.revision === 1
      ? '1 (first file of the period)'
      : `${options.revision} (Korrektur ${options.revision}, new External IDs): before importing, delete the draft entries of the earlier revision in Odoo ` +
        `(filter by the reference "${prefix}") and reverse its posted entries`;
  const rounding = options.taxRounding === 'per_tax' ? `per_tax, rounding account ${options.roundingAccount ?? 'not set'}` : 'per_line';
  return [
    'Import into Odoo Accounting (compare with the Odoo company before importing, see docs/odoo-format.md):',
    `  File: ${fileName}`,
    `  Revision: ${revision}`,
    `  Entries: ${entries.length} draft journal entries (one per business day) with ${lines} lines, references "${prefix} <date>"`,
    `  Company: id ${options.companyId} (odoo.companyId, the company that owns the taxes), journal ${options.journal}, currency ${options.currency}`,
    `  Rounding method: ${rounding}; must equal Settings > Accounting > Taxes > Rounding Method ("${roundingMethodLabel(options.taxRounding, version)}")`,
    `  Taxes: ${taxList.join(', ') || 'none'}`,
    `  Odoo VAT against apaleo's tax per line: ${vat.join('; ') || 'none'}`,
    `  Base and VAT per tax: ${perTax.join('; ') || 'none'}`,
    `  Rounding lines: ${roundingLines}; lines netted to zero and left out: ${droppedKeys}`,
    '  Steps: activate only the target company in the company switcher, Accounting > Journal Entries > gear > Import records, upload the file, Test, Import',
    '  After the import: every entry is a draft, no "Automatic Balancing Line" on the suspense account, the tax per rate equals this protocol; then post the entries',
  ];
}

/**
 * For the protocol only: per line of every entry, the apaleo entry numbers it
 * nets, each with the receipt (or reference) of its booking:
 * `2026-09-14 8300 Erlöse Beherbergung 7 % credit 112.15: BSPE0002 (BSP-2026-0001)`.
 */
export function entryLineSources(rendered: Pick<RenderedOdooCsv, 'entries'>, bookings: readonly Pick<OdooBooking, 'sourceEntryNumbers' | 'receipt'>[]): string[] {
  const receipts = new Map<string, string>();
  for (const booking of bookings) for (const entry of booking.sourceEntryNumbers) if (booking.receipt) receipts.set(entry, booking.receipt);
  const lines = rendered.entries.flatMap((entry) =>
    entry.lines.map((line) => {
      const side = line.amountCents > 0 ? 'debit' : 'credit';
      const sources = [...new Set(line.sourceEntryNumbers)].map((number) => (receipts.has(number) ? `${number} (${receipts.get(number) ?? ''})` : number));
      return `  ${entry.date} ${line.account} ${line.label} ${side} ${formatAmount(Math.abs(line.amountCents))}: ${sources.join(', ') || 'rounding'}`;
    }),
  );
  return ['apaleo entries per line of the file (entry number and receipt or reference):', ...lines];
}
