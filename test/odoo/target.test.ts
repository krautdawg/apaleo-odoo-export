import { describe, expect, it } from 'vitest';
import { configSchema } from '../../src/core/config.js';
import type { LocalDate } from '../../src/core/date.js';
import type { TargetFileMeta, TargetWriter } from '../../src/export/index.js';
import { createOdooTarget, odooMovements, odooTarget, OdooValidationError, renderOdooCsv, settingsFromConfig, type OdooBooking } from '../../src/odoo/index.js';
import { allowance, depositRefund, drinks, odooOptions, payment, revenue, specDay, vat } from '../helpers/odoo.js';

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** A config with the given `odoo` section (journal APA, version 18 by default) and properties. */
function config(odoo: Record<string, unknown> = {}, properties: Record<string, unknown>[] = []) {
  return configSchema.parse({ odoo: { journal: 'APA', version: 18, ...odoo }, properties });
}

function meta(overrides: Partial<TargetFileMeta> = {}, from: LocalDate = '2026-09-01', to: LocalDate = '2026-09-30'): TargetFileMeta {
  return {
    config: config(),
    propertyId: 'BSP',
    part: { from, to, month: from.slice(0, 7), wjBeginn: '2026-01-01' },
    demo: false,
    createdAt: new Date('2026-10-03T09:15:00Z'),
    ...overrides,
  };
}

describe('odooTarget', () => {
  it('is a TargetWriter of Odoo bookings', () => {
    const writer: TargetWriter<OdooBooking> = odooTarget;
    expect(writer.id).toBe('odoo');
    expect(writer.protocolTitle).toBe('Odoo journal entries (import file)');
  });

  it('names the file after period and property, with _DEMO for a demo file', () => {
    expect(odooTarget.fileName(meta())).toBe('ODOO_Buchungen_20260901-20260930_BSP.csv');
    expect(odooTarget.fileName(meta({ demo: true }))).toBe('ODOO_Buchungen_20260901-20260930_BSP_DEMO.csv');
    expect(() => odooTarget.fileName(meta({ propertyId: 'B S' }))).toThrow(OdooValidationError);
  });

  it('matches only current ODOO_Buchungen files and captures the period, not replaced files, protocols or Abacus files', () => {
    expect(odooTarget.filePattern.exec('ODOO_Buchungen_20260901-20260930_BSP.csv')?.slice(1, 3)).toEqual(['20260901', '20260930']);
    expect(odooTarget.filePattern.test(odooTarget.fileName(meta({ demo: true })))).toBe(true);
    for (const name of [
      'ODOO_Buchungen_20260901-20260930_BSP.replaced-20261003T091500Z.csv',
      'ODOO_Buchungen_20260901-20260930_BSP.protokoll.txt',
      'ODOO_Buchungen_20260901-20260930_BSP.csv.protokoll.txt',
      'ABACUS_Buchungen_20260901-20260930_BSP.xml',
      'ODOO_Buchungen_20260901-20260930_BSP.xlsx',
    ]) {
      expect(odooTarget.filePattern.test(name), name).toBe(false);
    }
  });

  it('renders with the settings of the odoo section for a revision, and reads the revision back', () => {
    const bookings = specDay();
    const rendered = odooTarget.render(bookings, meta());
    expect(decode(rendered.bytes)).toBe(renderOdooCsv(bookings, odooOptions()).text);
    const revised = odooTarget.render(bookings, meta(), 3);
    expect(decode(revised.bytes)).toContain('apaleo_c1_BSP_20260914_r3,apaleo BSP 2026-09-14 (Korrektur 3)');
    expect(odooTarget.revisionOf(revised.bytes)).toBe(3);
    expect(odooTarget.sameContent(rendered.bytes, odooTarget.render(bookings, meta()).bytes)).toBe(true);
    expect(odooTarget.sameContent(rendered.bytes, revised.bytes)).toBe(false);
  });

  it('marks a demo file in the External IDs and the references', () => {
    const text = decode(odooTarget.render(specDay(), meta({ demo: true })).bytes);
    expect(text.split('\n')[1]).toMatch(/^apaleo_c1_BSP_DEMO_20260914,DEMO apaleo BSP 2026-09-14,/);
  });

  it('returns the notes of the writer as findings', () => {
    const breakfast = revenue({ grossCents: 9_500, vat: vat('tax_ust_7_skr03', 7, 621) });
    expect(odooTarget.render([breakfast, payment(9_500)], meta()).findings.map((f) => f.code)).toEqual(['N-ODOO-ROUNDING-LINE']);
  });

  it('reads the journal per property and the rest from the odoo section, with the version default of the rounding', () => {
    const own = config({ companyId: 3, currency: 'CHF', version: 19, roundingAccount: '2700' }, [{ id: 'BSP' }, { id: 'BS2', journal: 'APA2' }]);
    expect(settingsFromConfig({ config: own, propertyId: 'BSP' })).toEqual({ companyId: 3, currency: 'CHF', taxRounding: 'per_tax', version: 19, journal: 'APA', roundingAccount: '2700' });
    expect(settingsFromConfig({ config: own, propertyId: 'BS2' }).journal).toBe('APA2');
    expect(odooTarget.manifestFields(meta({ config: own, propertyId: 'BS2' }), [])).toEqual({ odooCompanyId: 3, odooJournal: 'APA2', entries: 0, lines: 0, debitTotalCents: 0, vatByTax: [] });
  });

  it('Files after a run: the manifest fields carry entries, lines, the debit total and Odoo\'s VAT per tax with its base', () => {
    expect(odooTarget.manifestFields(meta(), specDay())).toEqual({
      odooCompanyId: 1,
      odooJournal: 'APA',
      entries: 1,
      lines: 3,
      debitTotalCents: 14_380,
      vatByTax: [
        { tax: 'account.1_tax_ust_19_skr03', ratePercent: 19, baseCents: 2_000, vatCents: 380 },
        { tax: 'account.1_tax_ust_7_skr03', ratePercent: 7, baseCents: 11_215, vatCents: 785 },
      ],
    });
  });

  it('lists per line of the file the apaleo entries and their receipts for the protocol', () => {
    const bookings = specDay().map((booking, i) => ({ ...booking, receipt: `R-${i + 1}` }));
    const details = odooTarget.protocolDetails(bookings, meta());
    expect(details[0]).toBe('apaleo entries per line of the file (entry number and receipt or reference):');
    expect(details.slice(1).every((line) => /^ {2}2026-09-14 \d+ .+ (debit|credit) \d+\.\d\d: .+/.test(line))).toBe(true);
    expect(details.join('\n')).toMatch(/\(R-1\)/);
  });

  it('Currency from the config: odoo.currency CHF', () => {
    expect(odooTarget.currency(config({ currency: 'CHF' }))).toBe('CHF');
    expect(odooTarget.currency(config())).toBe('EUR');
  });

  it('Kennzahl per rate: Kz 81 for 19 %, Kz 86 for 7 %, nothing for 0 %', () => {
    expect(odooTarget.taxReturnLine(19)).toBe('Kz 81');
    expect(odooTarget.taxReturnLine(7)).toBe('Kz 86');
    expect(odooTarget.taxReturnLine(0)).toBeUndefined();
  });

  it('moves the VAT side by gross minus apaleo tax and the other side by the gross, Soll positive', () => {
    expect(odooMovements(revenue())).toEqual([
      ['1410', 12_000],
      ['8300', -11_215],
    ]);
    expect(odooMovements(allowance())).toEqual([
      ['8300', 1_869],
      ['1410', -2_000],
    ]);
    expect(odooMovements(payment(14_380))).toEqual([
      ['1360', 14_380],
      ['1410', -14_380],
    ]);
    expect(odooMovements(depositRefund())).toEqual([
      ['1718', 2_000],
      ['1360', -2_380],
    ]);
  });

  it('Import block names the taxes with rate and Kennzahl, the journal, the rounding method and the balancing-line check', () => {
    const block = odooTarget.importBlock(specDay(), meta());
    expect(block[0]).toMatch(/^Import into Odoo Accounting/);
    const text = block.join('\n');
    expect(text).toContain('File: ODOO_Buchungen_20260901-20260930_BSP.csv');
    expect(text).toContain('Revision: 1 (first file of the period)');
    expect(text).toContain('Entries: 1 draft journal entries (one per business day) with 3 lines');
    expect(text).toContain('Company: id 1 (odoo.companyId, the company that owns the taxes), journal APA, currency EUR');
    expect(text).toContain('Rounding method: per_line; must equal Settings > Accounting > Taxes > Rounding Method ("Round per Line")');
    expect(text).toContain('Taxes: account.1_tax_ust_19_skr03 (19 %, Kz 81), account.1_tax_ust_7_skr03 (7 %, Kz 86)');
    expect(text).toContain("Odoo VAT against apaleo's tax per line: 19 % Odoo 3.80, apaleo per line 3.80, difference (Odoo minus apaleo) 0.00; 7 % Odoo 7.85, apaleo per line 7.85, difference (Odoo minus apaleo) 0.00");
    expect(text).toContain('Base and VAT per tax: account.1_tax_ust_19_skr03 19 % (Kz 81): base in the file 20.00, Odoo VAT 3.80, apaleo per line 3.80, difference (Odoo minus apaleo) 0.00; account.1_tax_ust_7_skr03 7 % (Kz 86): base in the file 112.15, Odoo VAT 7.85, apaleo per line 7.85, difference (Odoo minus apaleo) 0.00');
    expect(text).toContain('Rounding lines: 0');
    expect(text).toContain('only the target company in the company switcher, Accounting > Journal Entries > gear > Import records, upload the file, Test, Import');
    expect(text).toContain('every entry is a draft, no "Automatic Balancing Line" on the suspense account, the tax per rate equals this protocol; then post');
  });

  it('Import block of a revision names the reference to delete and reverse first, and the rounding account with per_tax in 19', () => {
    const odoo19 = config({ version: 19, roundingAccount: '2700' });
    const text = odooTarget.importBlock([...specDay(), drinks({ grossCents: 999, vat: vat('tax_ust_19_skr03', 19, 160) }), payment(999)], meta({ config: odoo19 }), 2).join('\n');
    expect(text).toContain('Revision: 2 (Korrektur 2, new External IDs): before importing, delete the draft entries of the earlier revision in Odoo (filter by the reference "apaleo BSP") and reverse its posted entries');
    expect(text).toContain('reverse its posted entries with the reversal date of each original entry, not today, so the month nets to zero in its own tax period');
    expect(text).toContain('Rounding method: per_tax, rounding account 2700; must equal Settings > Accounting > Taxes > Rounding Method ("Round per Tax")');
    expect(text).toContain('Rounding lines: 1');
  });

  it('Refusal advice names Odoo: next revision with new External IDs, delete the drafts of the earlier revision and reverse its posted entries, no Abacus', () => {
    const { advice } = odooTarget;
    const reimport = advice.reimport({ propertyId: 'BSP', demo: false });
    expect(reimport).toMatch(/--overwrite the new file gets the next revision and new External IDs/);
    expect(reimport).toContain('delete the draft entries of the earlier revision in Odoo (filter by the reference "apaleo BSP")');
    expect(reimport).toContain('reverse its posted entries, because an import cannot change a posted entry and a reversal keeps its External ID');
    expect(reimport).toContain('Set the reversal date to the date of each original entry, not today, so the month nets to zero in its own tax period');
    expect(advice.reimport({ propertyId: 'BSP', demo: true })).toContain('(filter by the reference "DEMO apaleo BSP")');
    expect(advice.overlap).toMatch(/overwrite reviewed drafts with the other file's content or book those days twice/);
    expect(advice.currency).toMatch(/one currency \(odoo\.currency\).*does not convert/);
    for (const text of [advice.currency, advice.overlap, reimport]) expect(text).not.toMatch(/abacus/i);
  });

  it('takes its settings from a function, for tests and later targets', () => {
    const target = createOdooTarget(() => ({ companyId: 2, journal: 'MISC', currency: 'EUR', taxRounding: 'per_line' }));
    expect(decode(target.render(specDay(), meta()).bytes)).toContain('apaleo_c2_BSP_20260914,apaleo BSP 2026-09-14,2026-09-14,MISC,');
  });
});
