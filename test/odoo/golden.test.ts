import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CSV_HEADER, renderOdooCsv, type OdooBooking, type OdooRenderOptions } from '../../src/odoo/index.js';
import { describeUtf8Difference } from '../helpers/golden.js';
import { allowance, depositReceived, depositReleased, depositRefund, odooOptions, payment, revenue, specDay, untaxed, vat } from '../helpers/odoo.js';

/**
 * Byte-for-byte regression tests of the Odoo import file. After an intended
 * change to the writer, run `UPDATE_GOLDEN=1 pnpm test`, read the diff of
 * test/golden/odoo/ and commit it. The local test import (scripts/odoo-check/)
 * imports every file of this folder into Odoo 17, 18 and 19.
 *
 * Review (task 4.3 of o02-odoo-journal-writer, 2026-10-24): every golden file
 * was read column by column against openspec/research/o-target.md §2-3. Header:
 * the technical paths `id`, `ref`, `date`, `journal_id` and `line_ids/id`,
 * `line_ids/account_id`, `line_ids/name`, `line_ids/debit`, `line_ids/credit`,
 * `line_ids/tax_ids/id` (External IDs through the `/id` suffix); no `name`,
 * `state`, partner, `tax_tag_ids` or `analytic_distribution` column (state and
 * tax lines are readonly, §2). One entry per day: the first row carries the
 * entry External ID `apaleo_c<company>_<property>_<YYYYMMDD>` (`_r2` in the
 * revision file, `_DEMO` after the property in the demo file), the reference
 * `apaleo <property> <date>` (` (Korrektur 2)`, `DEMO `), the ISO date and the
 * journal code `APA`; every further line leaves these four columns empty (the
 * one2many layout of §2). Lines carry `<entry id>_<NNNN>` so a re-import updates
 * them (§2), an account code, a label without personal data, exactly one of
 * debit and credit above 0.00 with two decimals and a point, and on base lines
 * the tax as `account.<company>_<template id>` (§2 "Taxes by External ID");
 * untaxed lines have an empty tax cell (§2 "Empty cells", the SKR04 `4200` case).
 * No line books on a tax account (`1771`, `1776`): Odoo creates the tax lines
 * (§3.1, §3.7). Base lines are net (§3.2); credits are the invoice side and
 * debits the refund side (§3.3, `deposit-refund`, `allowance-netted`). The
 * fitted bases reach apaleo's gross with Odoo's rounding (§3.5): `per-line-rounding`
 * has the 0.01 companion line, `per-tax-rounding-account` the 0.01 line on 2700,
 * and the balance check below re-computes every entry independently.
 */
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const GOLDEN = new URL('../golden/odoo/', import.meta.url);

interface GoldenCase {
  bookings: OdooBooking[];
  options?: Partial<OdooRenderOptions>;
  notes: string[];
}

const breakfast = (overrides: Partial<OdooBooking> = {}) => revenue({ credit: { account: '8300', label: 'Frühstück 7 %' }, grossCents: 9_500, vat: vat('tax_ust_7_skr03', 7, 621), ...overrides });
const PER_TAX = { taxRounding: 'per_tax', roundingAccount: '2700' } as const;

const CASES: Record<string, GoldenCase> = {
  'empty-month': { bookings: [], notes: [] },
  // Lodging 120.00 at 7 %, drinks 23.80 at 19 %, Visa 143.80: the guest ledger 1410 nets to 0.
  'lodging-drinks-card': { bookings: specDay(), notes: [] },
  // Lodging 120.00 less an allowance of 20.00, both at 7 % on 8300: one line of 93.46 on the invoice side.
  'allowance-netted': { bookings: [revenue(), allowance(), payment(10_000)], notes: [] },
  // A deposit of 300.00 at 7 % received on 2026-09-10 and released against the lodging on 2026-09-14.
  'deposit-7': {
    bookings: [depositReceived({ businessDate: '2026-09-10' }), revenue({ grossCents: 30_000, vat: vat('tax_ust_7_skr03', 7, 1_963) }), depositReleased()],
    notes: [],
  },
  // The refund of a 19 % deposit: 1718 debit 20.00 on the refund side, 1360 credit 23.80.
  'deposit-refund': { bookings: [depositRefund()], notes: [] },
  // Untaxed revenue on SKR04 4200, whose default tax in Odoo is 19 %: the tax cell stays empty.
  'untaxed-default-tax': { bookings: [untaxed(), payment(8_000)], notes: [] },
  // Breakfast 95.00 at 7 %: base 88.78 and a 0.01 companion line, Odoo's tax 6.21.
  'per-line-rounding': { bookings: [breakfast(), payment(9_500)], notes: ['N-ODOO-ROUNDING-LINE'] },
  // Lodging 120.00 and 95.00 at 7 %, rounded per tax: 200.93 with Odoo's tax 14.07 against apaleo's 14.06.
  'per-tax-vat-difference': { bookings: [revenue(), revenue({ grossCents: 9_500, vat: vat('tax_ust_7_skr03', 7, 621) }), payment(21_500)], options: PER_TAX, notes: [] },
  // 100.04 at 7 %, rounded per tax: base 93.49 and 0.01 on the rounding account 2700.
  'per-tax-rounding-account': { bookings: [revenue({ grossCents: 10_004, vat: vat('tax_ust_7_skr03', 7, 654) }), payment(10_004)], options: PER_TAX, notes: ['N-ODOO-ROUNDING-LINE'] },
  'long-label': {
    bookings: [revenue({ credit: { account: '8300', label: `Logis Doppelzimmer Seeblick mit Frühstück, Halbpension und Parkplatz, "Arrangement Herbst" ${'x'.repeat(60)}` } }), payment(12_000)],
    notes: ['N-ODOO-TRUNCATED'],
  },
  'two-days': { bookings: [...specDay('2026-09-14'), ...specDay('2026-09-15')], notes: [] },
  'second-company': { bookings: specDay(), options: { companyId: 3 }, notes: [] },
  'revision-2': { bookings: specDay(), options: { revision: 2 }, notes: [] },
  demo: { bookings: [...specDay(), breakfast(), payment(9_500)], options: { demo: true }, notes: ['N-ODOO-ROUNDING-LINE'] },
};

/** The rate of each tax External ID the golden files use. */
const RATES: Readonly<Record<string, number>> = {
  'account.1_tax_ust_7_skr03': 7,
  'account.1_tax_ust_19_skr03': 19,
  'account.3_tax_ust_7_skr03': 7,
  'account.3_tax_ust_19_skr03': 19,
};

/** A minimal RFC 4180 reader, independent of the writer. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      rows.push([...row, cell]);
      row = [];
      cell = '';
    } else cell += char;
  }
  return rows;
}

const cents = (amount: string) => {
  expect(amount).toMatch(/^\d+\.\d{2}$/);
  return BigInt(amount.replace('.', ''));
};
/** Half away from zero on non-negative whole numbers. */
const roundTax = (base: bigint, rate: number) => (base * BigInt(rate * 100) + 5_000n) / 10_000n;

/**
 * Debits minus credits minus Odoo's tax of the invoice side plus that of the
 * refund side, per entry, re-implemented from the file alone: 0 when Odoo adds no balancing line.
 */
function imbalances(text: string, mode: OdooRenderOptions['taxRounding']): Map<string, bigint> {
  const [header, ...rows] = parseCsv(text);
  expect(header).toEqual([...CSV_HEADER]);
  const result = new Map<string, bigint>();
  const groups = new Map<string, Map<string, bigint[]>>();
  let entry = '';
  for (const row of rows) {
    expect(row).toHaveLength(CSV_HEADER.length);
    const [id, , , , , , , debitText, creditText, tax] = row as [string, string, string, string, string, string, string, string, string, string];
    if (id !== '') entry = id;
    const [debit, credit] = [cents(debitText), cents(creditText)];
    expect((debit > 0n ? 1 : 0) + (credit > 0n ? 1 : 0)).toBe(1);
    result.set(entry, (result.get(entry) ?? 0n) + debit - credit);
    if (tax === '') continue;
    const side = credit > 0n ? 'invoice' : 'refund';
    const byGroup = groups.get(entry) ?? new Map<string, bigint[]>();
    byGroup.set(`${tax}|${side}`, [...(byGroup.get(`${tax}|${side}`) ?? []), debit + credit]);
    groups.set(entry, byGroup);
  }
  for (const [id, byGroup] of groups) {
    for (const [group, bases] of byGroup) {
      const [tax, side] = group.split('|') as [string, string];
      const rate = RATES[tax];
      expect(rate, tax).toBeDefined();
      const taxCents = mode === 'per_line' ? bases.reduce((sum, base) => sum + roundTax(base, rate ?? 0), 0n) : roundTax(bases.reduce((a, b) => a + b, 0n), rate ?? 0);
      result.set(id, (result.get(id) ?? 0n) + (side === 'invoice' ? -taxCents : taxCents));
    }
  }
  return result;
}

describe('Odoo golden files', () => {
  it.each(Object.entries(CASES))('%s matches its golden file byte for byte', (name, { bookings, options, notes }) => {
    const rendered = renderOdooCsv(bookings, odooOptions(options));
    expect(rendered.notes.map((note) => note.code)).toEqual(notes);

    const file = new URL(`${name}.csv`, GOLDEN);
    if (UPDATE) {
      mkdirSync(GOLDEN, { recursive: true });
      writeFileSync(file, rendered.bytes);
    }
    expect(existsSync(file), `missing ${file.pathname}; run UPDATE_GOLDEN=1 pnpm test`).toBe(true);
    const difference = describeUtf8Difference(new Uint8Array(readFileSync(file)), rendered.bytes);
    expect(difference, `${name}.csv differs from the writer output:\n${difference ?? ''}`).toBeUndefined();
  });

  it.each(Object.entries(CASES))('%s: every golden entry balances with the modelled Odoo tax (independent check)', (name, { options }) => {
    const text = readFileSync(new URL(`${name}.csv`, GOLDEN), 'utf8');
    const entries = imbalances(text, odooOptions(options).taxRounding);
    for (const [id, imbalance] of entries) expect(imbalance, `${name}: ${id}`).toBe(0n);
    if (name !== 'empty-month') expect(entries.size).toBeGreaterThan(0);
  });

  it('covers the cases the spec lists, and nothing else is in the folder', () => {
    const required = [
      'empty-month',
      'lodging-drinks-card',
      'allowance-netted',
      'deposit-7',
      'deposit-refund',
      'untaxed-default-tax',
      'per-line-rounding',
      'per-tax-vat-difference',
      'per-tax-rounding-account',
      'long-label',
      'two-days',
      'second-company',
      'revision-2',
      'demo',
    ];
    expect(Object.keys(CASES)).toEqual(expect.arrayContaining(required));
    expect(readdirSync(GOLDEN).sort()).toEqual(Object.keys(CASES).map((name) => `${name}.csv`).sort());
  });

  it('the independent check catches a base line one cent off', () => {
    const text = readFileSync(new URL('lodging-drinks-card.csv', GOLDEN), 'utf8').replace(',0.00,112.15,', ',0.00,112.16,');
    expect([...imbalances(text, 'per_line').values()]).toEqual([-1n]);
  });
});
