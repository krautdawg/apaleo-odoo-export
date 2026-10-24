import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as format from '../../src/abacus/format.js';
import { abacusOptions, accommodation, block, changedLines, mwst, payment, value } from '../helpers/abacus.js';

/**
 * Each choice of the first test import is one line in src/abacus/format.ts
 * (design decisions 3 to 5). These tests change that one export, as the
 * maintainer would after the import, and check that the writer, the validation
 * and the import block follow it and nothing else in the file changes.
 */
type Format = typeof format;

async function abacusWith(overrides: Partial<Format>) {
  vi.resetModules();
  vi.doMock('../../src/abacus/format.js', async (importOriginal) => ({ ...(await importOriginal<Format>()), ...overrides }));
  return import('../../src/abacus/index.js');
}

const defaults = () => abacusWith({});

afterEach(() => {
  vi.doUnmock('../../src/abacus/format.js');
  vi.resetModules();
});

const revenue81 = accommodation({ singleAccount: '3200', grossCents: 10_810, tax: mwst('311', 8.1, -810) });
const bookings = [revenue81, accommodation(), payment(), accommodation({ singleAccount: '2210', tax: mwst('491', 0, 0), text1: 'Kurtaxe' })];

describe('switching a format.ts constant changes its field only', () => {
  it('Tax amount constant switched: TaxData Amount carries the tax, nothing else changes', async () => {
    const before = (await defaults()).renderXmlBuchungen([revenue81], abacusOptions()).text;
    const switched = await abacusWith({ TAX_AMOUNT_IN_KEY_CURRENCY: 'tax' });
    const after = switched.renderXmlBuchungen([revenue81], abacusOptions()).text;
    const taxData = block(after, 'TaxData');
    expect([value(taxData, 'Amount'), value(taxData, 'KeyAmount')]).toEqual(['-8.10', '-8.10']);
    expect(changedLines(before, after)).toEqual([[expect.any(Number), '<Amount>0.00</Amount>', '<Amount>-8.10</Amount>']]);
    expect(switched.importBlock([revenue81], abacusOptions(), 'x.xml').join('\n')).toContain('TAX_AMOUNT_IN_KEY_CURRENCY tax');
  });

  it('Single TaxAccount constant switched: SingleInformation has TaxAccount 2200, nothing else changes', async () => {
    const before = (await defaults()).renderXmlBuchungen([accommodation()], abacusOptions()).text;
    const switched = await abacusWith({ SINGLE_TAX_ACCOUNT: 'taxAccount' });
    const after = switched.renderXmlBuchungen([accommodation()], abacusOptions()).text;
    expect(value(block(after, 'SingleInformation'), 'TaxAccount')).toBe('2200');
    expect(changedLines(before, after)).toEqual([[expect.any(Number), '<TaxAccount>3400</TaxAccount>', '<TaxAccount>2200</TaxAccount>']]);
    const importBlock = switched.importBlock([accommodation()], abacusOptions(), 'x.xml').join('\n');
    expect(importBlock).toContain('TaxAccount: 2200 in CollectiveInformation (also on MWST-Codes at rate 0, TAX_ACCOUNT_AT_RATE_ZERO taxAccount), 2200 in SingleInformation');
    expect(importBlock).toContain('SINGLE_TAX_ACCOUNT taxAccount');
  });

  it('Kurtaxe with a Ziffer-910 code: TAX_INCLUDED_AT_RATE_ZERO E writes E on the rate-0 code only', async () => {
    const before = (await defaults()).renderXmlBuchungen(bookings, abacusOptions()).text;
    const switched = await abacusWith({ TAX_INCLUDED_AT_RATE_ZERO: 'E' });
    const after = switched.renderXmlBuchungen(bookings, abacusOptions()).text;
    expect(changedLines(before, after)).toEqual([[expect.any(Number), '<TaxIncluded>I</TaxIncluded>', '<TaxIncluded>E</TaxIncluded>']]);
    expect(switched.importBlock(bookings, abacusOptions(), 'x.xml').join('\n')).toContain('TaxIncluded E at rate 0');
  });

  it('Kurtaxe with a Ziffer-910 code: TAX_ACCOUNT_AT_RATE_ZERO zero writes Collective TaxAccount 0 on the rate-0 code only', async () => {
    const before = (await defaults()).renderXmlBuchungen(bookings, abacusOptions()).text;
    const switched = await abacusWith({ TAX_ACCOUNT_AT_RATE_ZERO: 'zero' });
    const after = switched.renderXmlBuchungen(bookings, abacusOptions()).text;
    expect(changedLines(before, after)).toEqual([[expect.any(Number), '<TaxAccount>2200</TaxAccount>', '<TaxAccount>0</TaxAccount>']]);
    expect(value(block(after.slice(after.lastIndexOf('<Transaction')), 'SingleInformation'), 'TaxAccount')).toBe('2210');
    expect(switched.importBlock(bookings, abacusOptions(), 'x.xml').join('\n')).toContain(
      'TaxAccount: 2200 in CollectiveInformation (0 on MWST-Codes at rate 0, TAX_ACCOUNT_AT_RATE_ZERO zero)',
    );
  });

  it('TaxType constant switched: every TaxData has the new TaxType, nothing else changes', async () => {
    const before = (await defaults()).renderXmlBuchungen(bookings, abacusOptions()).text;
    const switched = await abacusWith({ TAX_TYPE_OUTPUT: 1 });
    const after = switched.renderXmlBuchungen(bookings, abacusOptions()).text;
    const changes = changedLines(before, after);
    expect(changes).toHaveLength(3);
    expect(changes.every(([, from, to]) => from === '<TaxType>0</TaxType>' && to === '<TaxType>1</TaxType>')).toBe(true);
  });
});

describe('the tax sign follows taxSign()', () => {
  it('Sign rule flipped after a test import: positive output tax passes, negative raises E-ABACUS-TAX-SIGN', async () => {
    const defaultRule = await defaults();
    expect(defaultRule.validateBookings([accommodation({ tax: mwst('313', 3.8, 760) })], abacusOptions()).map((f) => f.code)).toEqual(['E-ABACUS-TAX-SIGN']);

    const flipped = await abacusWith({ taxSign: (debitCredit) => (debitCredit === 'D' ? 1 : -1) });
    expect(flipped.validateBookings([accommodation({ tax: mwst('313', 3.8, 760) })], abacusOptions())).toEqual([]);
    const findings = flipped.validateBookings([accommodation({ tax: mwst('313', 3.8, -760) })], abacusOptions());
    expect(findings.map((f) => [f.code, f.index])).toEqual([['E-ABACUS-TAX-SIGN', 0]]);
    expect(findings[0]?.message).toContain('must be positive');
    expect(flipped.importBlock([accommodation()], abacusOptions(), 'x.xml').join('\n')).toContain('tax positive when the Single account is credited');
  });
});
