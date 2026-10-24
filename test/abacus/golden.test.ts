import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderXmlBuchungen, type AbacusBooking, type AbacusRenderOptions } from '../../src/abacus/index.js';
import { abacusOptions, accommodation, mwst, payment, withoutTax } from '../helpers/abacus.js';
import { describeUtf8Difference } from '../helpers/golden.js';

/**
 * Byte-for-byte regression tests of the AbaConnect XML Buchungen file. After an
 * intended change to the writer, run `UPDATE_GOLDEN=1 pnpm test`, read the diff
 * of test/golden/abacus/ and commit it.
 *
 * Review (task 3.3 of a02-abacus-xml-writer, 2026-10-23): every golden file was
 * read element by element against the 2024.00 field list in
 * openspec/research/a-target.md §2. Container: declaration with single quotes and
 * UTF-8, `TaskCount` 1, `Parameter` with `Application` FIBU, `Id` "XML Buchungen",
 * `MapId` AbaDefault, `Version` and `Mandant`; one `Transaction id` per booking
 * with one `Entry mode='SAVE'`. CollectiveInformation: `EntryLevel` A, `EntryType`
 * S, `Type` Normal, `DebitCredit`, `Client` (6 digits max), `Division` (0 without
 * Geschäftsbereich), `KeyCurrency`, `EntryDate` ISO, `AmountData` (`Currency`,
 * `Amount` with decimal point), `KeyAmount`, `Account` (11 digits max),
 * `TaxAccount` (Steuerkonto 2200 / Hilfskonto 2202 with MWST, else 0), `Text1`,
 * `Text2` (80 characters max), `DocumentNumber` (10 characters), `SingleCount` 0.
 * SingleInformation: the same fields without the Collective-only ones,
 * `TaxAccount` = the Single account ("Ertragskonto"), `BookingLevel1` only with a
 * Kostenstelle, and `TaxData` only there, with `TaxIncluded` I, `TaxType` 0,
 * `UseCode` 0/1, `AmountData/Amount` 0.00 (open question 11), the signed tax in
 * `KeyAmount`, `TaxRate` without trailing zeros, `TaxCoefficient` 100, `Country`
 * CH, `TaxCode` (3 characters max) and `FlatRate` 0. Every `mode='SAVE'` block
 * (`Entry`, both Information blocks, every `AmountData`, `TaxData`) carries the
 * attribute. Amounts are positive outside `TaxData`; the direction is `DebitCredit`.
 */
const UPDATE = process.env.UPDATE_GOLDEN === '1';

interface GoldenCase {
  bookings: AbacusBooking[];
  options?: Partial<AbacusRenderOptions>;
  notes: string[];
}

const CASES: Record<string, GoldenCase> = {
  // Beherbergung 3.8 %: 207.60 gross, tax 7.60 (207.60 × 3.8 / 103.8).
  'revenue-3-8': { bookings: [accommodation()], notes: [] },
  // Speisen 8.1 %: 108.10 gross, tax 8.10.
  'revenue-8-1': {
    bookings: [accommodation({ singleAccount: '3200', grossCents: 10_810, tax: mwst('311', 8.1, -810), text1: 'Erlös Speisen' })],
    notes: [],
  },
  // Take-away 2.6 %: 51.30 gross, tax 1.30.
  'revenue-2-6': {
    bookings: [accommodation({ singleAccount: '3260', grossCents: 5_130, tax: mwst('312', 2.6, -130), text1: 'Erlös reduzierter Satz' })],
    notes: [],
  },
  'untaxed-with-code': {
    bookings: [accommodation({ singleAccount: '3600', grossCents: 4_500, tax: mwst('400', 0, 0), text1: 'Erlös ohne MWST' })],
    notes: [],
  },
  'untaxed-without-code': {
    bookings: [withoutTax(accommodation({ singleAccount: '3680', grossCents: 15_000, text1: 'No-Show (Schadenersatz)' }))],
    notes: [],
  },
  // A Nachlass on Beherbergung: the revenue account is debited (DebitCredit C), the tax is positive.
  allowance: {
    bookings: [accommodation({ debitCredit: 'C', grossCents: 2_076, tax: mwst('313', 3.8, 76), text1: 'Nachlass Beherbergung' })],
    notes: [],
  },
  payment: {
    bookings: [payment(), payment({ collectiveAccount: '1000', grossCents: 3_000, text1: 'Zahlung bar', text2: 'BSP-2026-0043' })],
    notes: [],
  },
  // Kurtaxe as durchlaufender Posten, without MWST-Code.
  kurtaxe: {
    bookings: [withoutTax(accommodation({ singleAccount: '2210', grossCents: 1_000, text1: 'Kurtaxe 2 Nächte' }))],
    notes: [],
  },
  // Kurtaxe with the Ziffer-910 code 491 at rate 0.
  'kurtaxe-910': {
    bookings: [accommodation({ singleAccount: '2210', grossCents: 1_000, tax: mwst('491', 0, 0), text1: 'Kurtaxe 2 Nächte' })],
    notes: [],
  },
  // A guest's Anzahlung by card: transfer account in Soll, deposit account 2030 in Haben with the MWST of the Vorauszahlung.
  deposit: {
    bookings: [accommodation({ collectiveAccount: '1090', singleAccount: '2030', grossCents: 31_140, tax: mwst('313', 3.8, -1_140), text1: 'Anzahlung', text2: 'RES-4711-1' })],
    notes: [],
  },
  // A Debitorenverlust with MWST correction: the loss account 3805 is debited, the receivable 1102 credited.
  'write-off': {
    bookings: [accommodation({ collectiveAccount: '1102', singleAccount: '3805', debitCredit: 'C', grossCents: 20_760, tax: mwst('313', 3.8, 760), text1: 'Debitorenverlust' })],
    notes: [],
  },
  kostenstelle: {
    bookings: [accommodation({ singleAccount: '3200', grossCents: 10_810, tax: mwst('311', 8.1, -810), kost: '10', text1: 'Erlös Speisen' })],
    notes: [],
  },
  umlauts: {
    bookings: [accommodation({ singleAccount: '3100', grossCents: 2_162, tax: mwst('311', 8.1, -162), text1: 'Getränke & Frühstück <Bar>', text2: `"Seeblick" l'Hôtel` })],
    notes: [],
  },
  'truncated-text': {
    bookings: [
      accommodation({
        text1: 'Beherbergung Doppelzimmer Seeblick mit Frühstück und Halbpension, 3 Nächte, Zimmer 204 im Westflügel',
        text2: `BSP-2026-0042-ZAHLUNG-KREDITKARTE-VISA-${'1234'.repeat(12)}`,
      }),
    ],
    notes: ['N-ABACUS-TRUNCATED', 'N-ABACUS-TRUNCATED'],
  },
  vereinnahmt: { bookings: [accommodation(), payment()], options: { abrechnungsart: 'vereinnahmt' }, notes: [] },
  'version-2024': { bookings: [accommodation()], options: { version: '2024.00' }, notes: [] },
  'empty-month': { bookings: [], notes: [] },
};

describe('Abacus golden files', () => {
  it.each(Object.entries(CASES))('%s matches its golden file byte for byte', (name, { bookings, options, notes }) => {
    const rendered = renderXmlBuchungen(bookings, abacusOptions(options));
    expect(rendered.notes.map((note) => note.code)).toEqual(notes);

    const file = new URL(`../golden/abacus/${name}.xml`, import.meta.url);
    if (UPDATE) {
      mkdirSync(new URL('.', file), { recursive: true });
      writeFileSync(file, rendered.bytes);
    }
    expect(existsSync(file), `missing ${file.pathname}; run UPDATE_GOLDEN=1 pnpm test`).toBe(true);
    const difference = describeUtf8Difference(new Uint8Array(readFileSync(file)), rendered.bytes);
    expect(difference, `${name}.xml differs from the writer output:\n${difference ?? ''}`).toBeUndefined();
  });

  it('covers the cases the spec lists', () => {
    expect(Object.keys(CASES)).toEqual(
      expect.arrayContaining([
        'revenue-3-8',
        'revenue-8-1',
        'revenue-2-6',
        'untaxed-with-code',
        'untaxed-without-code',
        'allowance',
        'payment',
        'kurtaxe',
        'kurtaxe-910',
        'deposit',
        'write-off',
        'kostenstelle',
        'umlauts',
        'truncated-text',
        'vereinnahmt',
        'version-2024',
      ]),
    );
  });

  it('Unintended change: shows the differing line', () => {
    const golden = renderXmlBuchungen(CASES.payment?.bookings ?? [], abacusOptions()).bytes;
    const changed = renderXmlBuchungen([payment({ grossCents: 12_001 }), ...(CASES.payment?.bookings.slice(1) ?? [])], abacusOptions()).bytes;
    const difference = describeUtf8Difference(golden, changed);
    expect(difference?.startsWith('line 25:\n  - expected:             <Amount>120.00</Amount>\\n\n  + actual:               <Amount>120.01</Amount>\\n')).toBe(true);
    expect(describeUtf8Difference(golden, golden.slice())).toBeUndefined();
    expect(describeUtf8Difference(golden, new Uint8Array([0xef, 0xbb, 0xbf, ...golden]))).toMatch(/^line 1:\n {2}- expected: <\?xml/);
  });
});
