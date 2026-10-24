import { describe, expect, it } from 'vitest';
import type { Finding } from '../../src/core/findings.js';
import { buildEntries, OdooValidationError, renderOdooCsv, validateBookings, validateEntry, type OdooEntry } from '../../src/odoo/index.js';
import { odooOptions, payment, revenue, specDay, vat } from '../helpers/odoo.js';

const codes = (findings: readonly Finding[]) => findings.map((finding) => finding.code);

function renderError(...args: Parameters<typeof renderOdooCsv>): OdooValidationError {
  try {
    renderOdooCsv(...args);
  } catch (error) {
    expect(error).toBeInstanceOf(OdooValidationError);
    return error as OdooValidationError;
  }
  throw new Error('expected an OdooValidationError');
}

/** A fitted entry with one base line changed, as a defect in the fitting would leave it. */
function tampered(change: (entry: OdooEntry) => void): OdooEntry {
  const { entries } = buildEntries(specDay(), odooOptions());
  const entry = structuredClone(entries[0] as OdooEntry);
  change(entry);
  return entry;
}

describe('Booking validation', () => {
  it('Several problems at once: the account "84 00" and the tax "19%" both appear in one error, with days and accounts, and no file', () => {
    const error = renderError([revenue({ credit: { account: '84 00', label: 'Getränke' } }), revenue({ vat: vat('19%', 19, 380), grossCents: 2_380 })], odooOptions());
    expect(codes(error.findings)).toEqual(['E-ODOO-ACCOUNT', 'E-ODOO-TAX-REF']);
    expect(error.findings[0]?.message).toMatch(/^2026-09-14, accounts 1410 \/ 84 00: /);
    expect(error.findings[1]?.message).toMatch(/^2026-09-14, accounts 1410 \/ 8300: .*"19%"/);
    expect(error.findings.map((finding) => finding.index)).toEqual([0, 1]);
    expect(error.message).toContain('The Odoo file was not written (2 problems)');
  });

  it.each([
    ['E-ODOO-SAME-ACCOUNT', revenue({ debit: { account: '8300', label: 'x' } })],
    ['E-ODOO-AMOUNT', revenue({ grossCents: 0 })],
    ['E-ODOO-AMOUNT', revenue({ grossCents: 10.5 })],
    ['E-ODOO-AMOUNT', revenue({ grossCents: 100_000_000_000 })],
    ['E-ODOO-AMOUNT', revenue({ vat: vat('tax_ust_7_skr03', 7, 12_000) })],
    ['E-ODOO-AMOUNT', revenue({ vat: vat('tax_ust_7_skr03', 7, -1) })],
    ['E-ODOO-DATE', revenue({ businessDate: '2026-10-01' })],
    ['E-ODOO-DATE', revenue({ businessDate: '2026-02-30' })],
    ['E-ODOO-RATE', revenue({ vat: vat('tax_ust_7_skr03', 7.125, 785) })],
    ['E-ODOO-RATE', revenue({ vat: vat('tax_x', 101, 785) })],
    ['E-ODOO-TAX-REF', revenue({ vat: vat('account.1_tax.x', 7, 785) })],
  ])('%s for one wrong booking', (code, booking) => {
    expect(codes(validateBookings([booking], odooOptions()))).toEqual([code]);
  });

  it('accepts template ids and External IDs as tax, and codes with letters and points as accounts', () => {
    expect(validateBookings([revenue({ vat: vat('__import__.ust_7_hotel', 7, 785), credit: { account: '8300.10', label: 'x' } })], odooOptions())).toEqual([]);
  });

  it.each([
    ['E-ODOO-JOURNAL', odooOptions({ journal: 'APALEO' })],
    ['E-ODOO-JOURNAL', odooOptions({ journal: 'apa' })],
    ['E-ODOO-PROPERTY-ID', odooOptions({ propertyId: 'BSP.1' })],
    ['E-ODOO-PROPERTY-ID', odooOptions({ propertyId: 'A'.repeat(21) })],
    ['E-ODOO-PROPERTY-ID', odooOptions({ propertyId: 'BSP_DEMO' })],
    ['E-ODOO-DATE', odooOptions({ from: '2026-10-01' })],
    ['E-ODOO-DATE', odooOptions({ to: '2026-09-31' })],
    ['E-ODOO-ACCOUNT', odooOptions({ taxRounding: 'per_tax', roundingAccount: '27 00' })],
  ])('%s for wrong file settings', (code, options) => {
    expect(codes(validateBookings([], options))).toEqual([code]);
  });

  it('E-ODOO-RATE when one tax comes with two rates', () => {
    const findings = validateBookings([revenue(), revenue({ vat: vat('tax_ust_7_skr03', 19, 1_916) })], odooOptions());
    expect(codes(findings)).toEqual(['E-ODOO-RATE']);
    expect(findings[0]?.message).toContain('7 %, 19 %');
  });

  it('E-ODOO-ROUNDING-ACCOUNT when the rounding account is the account of a taxed base line', () => {
    const findings = validateBookings([revenue()], odooOptions({ taxRounding: 'per_tax', roundingAccount: '8300' }));
    expect(codes(findings)).toEqual(['E-ODOO-ROUNDING-ACCOUNT']);
    expect(findings[0]?.message).toContain('2026-09-14');
  });

  it('never names a label in a finding', () => {
    const findings = validateBookings([revenue({ credit: { account: '84 00', label: 'Familie Mustermann' } })], odooOptions());
    expect(findings.map((finding) => `${finding.message}${finding.value ?? ''}`).join()).not.toContain('Mustermann');
  });
});

describe('Entry checks after fitting', () => {
  it('passes every fitted entry', () => {
    const { entries } = buildEntries(specDay(), odooOptions());
    expect(validateEntry(entries[0] as OdooEntry, 'per_line')).toEqual([]);
  });

  it('Unbalanced entry is caught: a base line 0.01 too high names the day, the difference 0.01 and the automatic balancing line', () => {
    const entry = tampered((e) => {
      const line = e.lines.find((l) => l.account === '8400');
      if (line) line.amountCents -= 1;
    });
    const findings = validateEntry(entry, 'per_line');
    expect(codes(findings)).toEqual(['E-ODOO-UNBALANCED', 'E-ODOO-GROSS']);
    expect(findings[0]?.message).toMatch(/^2026-09-14 .*-0\.01, not 0\.00, so Odoo would add an "Automatic Balancing Line" of 0\.01 on the suspense account/);
  });

  it('E-ODOO-GROSS when a group misses its gross, E-ODOO-VAT-FIT when its tax is far from apaleo', () => {
    const entry = tampered((e) => {
      const group = e.groups.find((g) => g.percent === 19);
      if (group) {
        group.grossCents += 1;
        group.apaleoTaxCents += 5;
      }
    });
    const findings = validateEntry(entry, 'per_line');
    expect(codes(findings)).toEqual(['E-ODOO-GROSS', 'E-ODOO-VAT-FIT']);
    expect(findings[1]?.message).toMatch(/^2026-09-14, tax_ust_19_skr03 19 % on the invoice side \(accounts 8400\): Odoo's tax 3\.80 differs from apaleo's 3\.85 by more than 0\.02/);
  });

  it('the writer refuses an entry that fails these checks', () => {
    expect(() => renderOdooCsv([revenue({ grossCents: 2_000, vat: vat('tax_x', 100, 1_000) }), payment(2_000)], odooOptions())).not.toThrow();
    // A companion cent at 100 % carries its own tax, so per-line fitting cannot reach an odd gross.
    const error = renderError([revenue({ grossCents: 2_001, vat: vat('tax_x', 100, 1_000) }), payment(2_001)], odooOptions());
    expect(codes(error.findings)).toEqual(['E-ODOO-UNBALANCED', 'E-ODOO-GROSS']);
  });
});
