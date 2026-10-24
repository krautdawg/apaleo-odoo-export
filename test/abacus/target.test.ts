import { describe, expect, it } from 'vitest';
import { abacusTarget, AbacusValidationError, createAbacusTarget, DEMO_TEXT_PREFIX, renderXmlBuchungen, settingsFromConfig } from '../../src/abacus/index.js';
import type { AbacusBooking } from '../../src/abacus/types.js';
import { configSchema } from '../../src/core/config.js';
import type { LocalDate } from '../../src/core/date.js';
import type { TargetFileMeta } from '../../src/export/index.js';
import { abacusOptions, accommodation, mwst, payment, values } from '../helpers/abacus.js';

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** A config with the given `abacus` section (Mandant 1234 by default) and properties. */
function config(abacus: Record<string, unknown> = {}, properties: Record<string, unknown>[] = []) {
  return configSchema.parse({ abacus: { mandant: 1234, ...abacus }, properties });
}

function meta(overrides: Partial<TargetFileMeta> = {}, from: LocalDate = '2026-10-01', to: LocalDate = '2026-10-31'): TargetFileMeta {
  return {
    config: config(),
    propertyId: 'BSP',
    part: { from, to, month: from.slice(0, 7), wjBeginn: '2026-01-01' },
    demo: false,
    createdAt: new Date('2026-11-03T09:15:00Z'),
    ...overrides,
  };
}

describe('abacusTarget', () => {
  it('names the file after period and property, with _DEMO for a demo file', () => {
    expect(abacusTarget.id).toBe('abacus');
    expect(abacusTarget.fileName(meta())).toBe('ABACUS_Buchungen_20261001-20261031_BSP.xml');
    expect(abacusTarget.fileName(meta({ demo: true }))).toBe('ABACUS_Buchungen_20261001-20261031_BSP_DEMO.xml');
    expect(() => abacusTarget.fileName(meta({ propertyId: 'B S' }))).toThrow(AbacusValidationError);
  });

  it('matches only current ABACUS_Buchungen files and captures the period, not replaced files, protocols or BMD files', () => {
    const match = abacusTarget.filePattern.exec('ABACUS_Buchungen_20261001-20261031_BSP.xml');
    expect(match?.slice(1, 3)).toEqual(['20261001', '20261031']);
    expect(abacusTarget.filePattern.test(abacusTarget.fileName(meta({ demo: true })))).toBe(true);
    for (const name of [
      'ABACUS_Buchungen_20261001-20261031_BSP.replaced-20261103T091500Z.xml',
      'ABACUS_Buchungen_20261001-20261031_BSP.protokoll.txt',
      'ABACUS_Buchungen_20261001-20261031_BSP.xml.protokoll.txt',
      'BMD_Buchungsimport_20261001-20261031_BSP.csv',
      'ABACUS_Buchungen_20261001-20261031_BSP.csv',
    ]) {
      expect(abacusTarget.filePattern.test(name), name).toBe(false);
    }
  });

  it('renders with the settings of the abacus section and returns the notes as findings', () => {
    const bookings = [accommodation(), payment({ text2: 'X'.repeat(90) })];
    const rendered = abacusTarget.render(bookings, meta());
    expect(Buffer.from(rendered.bytes).equals(Buffer.from(renderXmlBuchungen(bookings, abacusOptions()).bytes))).toBe(true);
    expect(rendered.findings.map((f) => f.code)).toEqual(['N-ABACUS-TRUNCATED']);
  });

  it('reads Mandant and Geschäftsbereich per property, the rest from the abacus section', () => {
    const own = config({ abrechnungsart: 'vereinnahmt', version: '2024.00', mwstHilfskonto: 2209, geschaeftsbereich: 3 }, [{ id: 'BSP' }, { id: 'BS2', mandant: '4711', geschaeftsbereich: 7 }]);
    expect(settingsFromConfig({ config: own, propertyId: 'BSP' })).toEqual({
      mandant: '1234',
      geschaeftsbereich: 3,
      leitwaehrung: 'CHF',
      abrechnungsart: 'vereinnahmt',
      version: '2024.00',
      mwstKonto: '2200',
      mwstHilfskonto: '2209',
    });
    const xml = decode(abacusTarget.render([accommodation()], meta({ config: own, propertyId: 'BS2' })).bytes);
    expect(xml).toContain('<Mandant>4711</Mandant>');
    expect(values(xml, 'Client')).toEqual(['4711']);
    expect(values(xml, 'Division')).toEqual(['7']);
    expect(values(xml, 'TaxAccount')).toEqual(['2209', '3400']);
    expect(xml).toContain('<Version>2024.00</Version>');
  });

  it('takes the period from the part', () => {
    const target = createAbacusTarget(() => settingsFromConfig({ config: config(), propertyId: 'BSP' }));
    const xml = decode(target.render([payment({ businessDate: '2026-10-15' })], meta({}, '2026-10-15', '2026-10-15')).bytes);
    expect(values(xml, 'DocumentNumber')).toEqual(['1015000001', '1015000001']);
    expect(() => target.render([payment({ businessDate: '2026-10-14' })], meta({}, '2026-10-15', '2026-10-15'))).toThrow(AbacusValidationError);
  });

  it('Currency: abacus.leitwaehrung, and every Currency and KeyCurrency of the file', () => {
    expect(abacusTarget.currency(config())).toBe('CHF');
    const eur = config({ leitwaehrung: 'EUR' });
    expect(abacusTarget.currency(eur)).toBe('EUR');
    const xml = decode(abacusTarget.render([accommodation(), payment()], meta({ config: eur })).bytes);
    expect(new Set([...values(xml, 'Currency'), ...values(xml, 'KeyCurrency')])).toEqual(new Set(['EUR']));
    expect(abacusTarget.advice.currency).toContain('abacus.leitwaehrung');
  });

  it('needs the abacus section with abacus.mandant: the config schema refuses one without', () => {
    expect(() => configSchema.parse({})).toThrow(/mandant/);
    expect(() => configSchema.parse({ bmd: { buchsymbol: 'HO' }, abacus: { mandant: 1234 } })).toThrow(/bmd/);
  });

  it('moves the Collective account by the gross and the Single account by the gross minus the MWST, signed by DebitCredit', () => {
    expect(abacusTarget.movements(accommodation())).toEqual([
      ['1101', 20_760],
      ['3400', -20_000],
    ]);
    expect(abacusTarget.movements(accommodation({ debitCredit: 'C', grossCents: 2_076, tax: mwst('313', 3.8, 76) }))).toEqual([
      ['1101', -2_076],
      ['3400', 2_000],
    ]);
    expect(abacusTarget.movements(payment())).toEqual([
      ['1090', 12_000],
      ['1101', -12_000],
    ]);
  });

  it('counts a file as unchanged only when every byte is equal', () => {
    const bytes = abacusTarget.render([accommodation()], meta()).bytes;
    expect(abacusTarget.sameContent(bytes, bytes.slice())).toBe(true);
    const changed = bytes.slice();
    changed[changed.length - 3] = 0x42;
    expect(abacusTarget.sameContent(bytes, changed)).toBe(false);
    expect(abacusTarget.sameContent(bytes, bytes.slice(0, -1))).toBe(false);
  });

  it('Same input twice: the same bytes at different clock times', () => {
    const first = abacusTarget.render([accommodation()], meta({ createdAt: new Date('2026-11-03T09:15:00Z') })).bytes;
    const second = abacusTarget.render([accommodation()], meta({ createdAt: new Date('2027-02-01T23:59:59Z') })).bytes;
    expect(abacusTarget.sameContent(first, second)).toBe(true);
  });

  it('gives Abacus advice: import only one of two overlapping files, delete the old bookings before re-importing', () => {
    const { overlap, reimport, afterOverwrite } = abacusTarget.advice;
    expect(overlap).toContain('import only one of them');
    expect(overlap).toContain('in the Nebenjournal before they are transferred, or by reversing them');
    expect(reimport).toContain('delete its bookings in Abacus first: in the Nebenjournal before they are transferred, or by reversing them');
    expect(reimport).toContain('abacus section');
    expect(afterOverwrite).toBeUndefined();
    expect([overlap, reimport, abacusTarget.protocolTitle].join(' ')).not.toMatch(/BMD|DATEV|Kanzlei|Buchungssymbol/);
  });
});

describe('an Abacus demo file', () => {
  it('starts every Text1 with DEMO and keeps the 80-character limit after the prefix', () => {
    const bookings = [accommodation(), payment({ text1: 'X'.repeat(80) })];
    const rendered = abacusTarget.render(bookings, meta({ demo: true }));
    const xml = decode(rendered.bytes);
    expect(values(xml, 'Text1')).toEqual(['DEMO Erlös Beherbergung', 'DEMO Erlös Beherbergung', `DEMO ${'X'.repeat(75)}`, `DEMO ${'X'.repeat(75)}`]);
    expect(DEMO_TEXT_PREFIX).toBe('DEMO ');
    expect(rendered.findings.map((f) => [f.code, f.field])).toEqual([['N-ABACUS-TRUNCATED', 'text1']]);
    expect(decode(abacusTarget.render(bookings, meta()).bytes)).not.toContain('DEMO');
  });
});

describe('the Abacus import block', () => {
  /** The spec's October file: 812 bookings, 313 at 3.8 % on 3400 and 2030, 311 at 8.1 % on 3200 and 3100, and payments. */
  function october(): AbacusBooking[] {
    return Array.from({ length: 812 }, (_, i) => {
      switch (i % 5) {
        case 0:
          return accommodation();
        case 1:
          return accommodation({ collectiveAccount: '1090', singleAccount: '2030', tax: mwst('313', 3.8, -760) });
        case 2:
          return accommodation({ singleAccount: '3200', grossCents: 10_810, tax: mwst('311', 8.1, -810) });
        case 3:
          return accommodation({ singleAccount: '3100', grossCents: 5_405, tax: mwst('311', 8.1, -405) });
        default:
          return payment();
      }
    });
  }

  it('Import block: file, bookings, journal total, programs, version, Mandant, Leitwährung, Abrechnungsart, codes with totals, pairs, TaxAccount, constants, Belegnummern, MWST berechnen and F21', () => {
    // 163 bookings each of cases 0 and 1 (313 at -7.60), 162 each of cases 2 (311 at -8.10), 3 (311 at -4.05) and 4 (payments).
    expect(abacusTarget.importBlock(october(), meta())).toEqual([
      'Import into Abacus FIBU (compare with the Mandant before importing, see docs/abacus-format.md):',
      '  File: ABACUS_Buchungen_20261001-20261031_BSP.xml',
      '  Bookings: 812 Einzelbuchungen (one Transaction each)',
      '  Journal total: 113385.90 CHF (Soll and Haben of the imported Einzelbuchungen each, without the MWST bookings Abacus adds)',
      '  Program: F11 Buchen (drop the file into the booking window) or F5534 "Import/Export Buchungen AbaConnect" with import type "XML Buchungen"',
      '  Interface: FIBU / XML Buchungen / AbaDefault, version 2015.00',
      '  Mandant: 1234, Geschäftsbereich 0, Leitwährung CHF',
      '  Abrechnungsart: vereinbart (UseCode 0)',
      '  MWST-Codes: 311 (8.1 %; tax -1968.30 CHF), 313 (3.8 %; tax -2477.60 CHF)',
      '  Account -> MWST-Code: 2030 -> 313, 3100 -> 311, 3200 -> 311, 3400 -> 313',
      '  TaxAccount: 2200 in CollectiveInformation (also on MWST-Codes at rate 0, TAX_ACCOUNT_AT_RATE_ZERO taxAccount), ' +
        'the Single account itself in SingleInformation, 0 on bookings without MWST',
      '  TaxData: TaxType 0, tax negative when the Single account is credited, AmountData/Amount 0.00 (TAX_AMOUNT_IN_KEY_CURRENCY zero), ' +
        'TaxIncluded I at rate 0 (TAX_INCLUDED_AT_RATE_ZERO), SINGLE_TAX_ACCOUNT account',
      '  Belegnummern: 1001000001 to 1001000812',
      '  Import with "MWST berechnen", as Abacus recommends. With it, Abacus may take the default MWST-Code of each account in F21',
      "  instead of the file's code: every account listed above must carry the listed MWST-Code in F21, or the MWST-Abrechnung is wrong.",
    ]);
  });

  it('follows the Abrechnungsart, the demo file name, several rates of one code and a file without MWST', () => {
    const vereinnahmt = config({ abrechnungsart: 'vereinnahmt', geschaeftsbereich: 5 });
    const block = abacusTarget.importBlock([payment()], meta({ config: vereinnahmt, demo: true }, '2026-10-15', '2026-10-15'));
    expect(block).toContain('  File: ABACUS_Buchungen_20261015-20261015_BSP_DEMO.xml');
    expect(block).toContain('  Mandant: 1234, Geschäftsbereich 5, Leitwährung CHF');
    expect(block).toContain('  Abrechnungsart: vereinnahmt (UseCode 1)');
    expect(block).toContain('  MWST-Codes: none');
    expect(block).toContain('  Account -> MWST-Code: none');
    expect(block).toContain('  Belegnummern: 1015000001 to 1015000001');
    expect(block.find((line) => line.startsWith('  TaxAccount:'))).toContain('2202 in CollectiveInformation');
    const rates = abacusTarget.importBlock([accommodation({ tax: mwst('313', 3.7, -741) }), accommodation()], meta());
    expect(rates).toContain('  MWST-Codes: 313 (3.7 %, 3.8 %; tax -15.01 CHF)');
    expect(abacusTarget.importBlock([], meta())).toContain('  Belegnummern: none');
  });
});
