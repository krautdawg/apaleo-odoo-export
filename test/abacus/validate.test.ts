import { describe, expect, it } from 'vitest';
import { AbacusValidationError, renderXmlBuchungen, validateBookings } from '../../src/abacus/index.js';
import type { AbacusBooking } from '../../src/abacus/types.js';
import { FindingsError } from '../../src/core/errors.js';
import { abacusOptions, accommodation, mwst, payment, withoutTax } from '../helpers/abacus.js';

const codes = (bookings: AbacusBooking[], options = abacusOptions()) => validateBookings(bookings, options).map((f) => [f.code, f.index, f.field]);

describe('Abacus booking validation', () => {
  it('accepts the spec bookings', () => {
    expect(validateBookings([accommodation(), payment(), accommodation({ debitCredit: 'C', grossCents: 2_076, tax: mwst('313', 3.8, 76) })], abacusOptions())).toEqual([]);
  });

  it('Several errors at once: one AbacusValidationError with every finding and no bytes', () => {
    const bookings = [accommodation(), accommodation({ collectiveAccount: '11A1' }), payment(), payment(), accommodation({ grossCents: 0 })];
    let thrown: unknown;
    let rendered: unknown;
    try {
      rendered = renderXmlBuchungen(bookings, abacusOptions());
    } catch (error) {
      thrown = error;
    }
    expect(rendered).toBeUndefined();
    expect(thrown).toBeInstanceOf(AbacusValidationError);
    expect(thrown).toBeInstanceOf(FindingsError);
    const error = thrown as AbacusValidationError;
    expect(error.findings.map((f) => [f.code, f.index])).toEqual([
      ['E-ABACUS-ACCOUNT', 1],
      ['E-ABACUS-AMOUNT', 4],
    ]);
    expect(error.message).toContain('E-ABACUS-ACCOUNT (booking 2, Konto (CollectiveInformation))');
    expect(error.message).toContain('E-ABACUS-AMOUNT (booking 5, Betrag)');
  });

  it('E-ABACUS-ACCOUNT for an account that is not 1 to 11 digits, on either block', () => {
    expect(codes([payment({ collectiveAccount: '' }), payment({ singleAccount: '123456789012' }), payment({ singleAccount: ' 1101' })])).toEqual([
      ['E-ABACUS-ACCOUNT', 0, 'collectiveAccount'],
      ['E-ABACUS-ACCOUNT', 1, 'singleAccount'],
      ['E-ABACUS-ACCOUNT', 2, 'singleAccount'],
    ]);
    expect(codes([payment({ collectiveAccount: '1', singleAccount: '12345678901' })])).toEqual([]);
  });

  it('E-ABACUS-SAME-ACCOUNT when the Collective and Single accounts are equal', () => {
    expect(codes([payment({ collectiveAccount: '1101' })])).toEqual([['E-ABACUS-SAME-ACCOUNT', 0, 'singleAccount']]);
  });

  it('E-ABACUS-AMOUNT for a gross amount that is not above 0, not whole Rappen or has more than 11 integer digits', () => {
    expect(codes([payment({ grossCents: -100 }), payment({ grossCents: 10.5 }), payment({ grossCents: 10 ** 13 }), payment({ grossCents: 10 ** 13 - 1 })])).toEqual([
      ['E-ABACUS-AMOUNT', 0, 'grossCents'],
      ['E-ABACUS-AMOUNT', 1, 'grossCents'],
      ['E-ABACUS-AMOUNT', 2, 'grossCents'],
    ]);
  });

  it('E-ABACUS-TAX for a tax not below the gross amount, a tax that is not whole Rappen, and a tax at rate 0', () => {
    expect(
      codes([
        accommodation({ grossCents: 760 }),
        accommodation({ tax: mwst('313', 3.8, -7.6) }),
        accommodation({ singleAccount: '3600', tax: mwst('400', 0, -5) }),
        accommodation({ grossCents: 761 }),
      ]),
    ).toEqual([
      ['E-ABACUS-TAX', 0, 'taxCents'],
      ['E-ABACUS-TAX', 1, 'taxCents'],
      ['E-ABACUS-TAX', 2, 'taxCents'],
      ['E-ABACUS-TAX-RATE', 3, 'taxCents'],
    ]);
  });

  it('E-ABACUS-TAX-RATE for a tax that does not fit the rate by more than one Rappen, on either side', () => {
    const tax = (taxCents: number, grossCents = 20_760) => accommodation({ grossCents, tax: mwst('313', 3.8, taxCents) });
    expect(codes([tax(-20_000), tax(-758), tax(-759), tax(-761), tax(-762), tax(-1)])).toEqual([
      ['E-ABACUS-TAX-RATE', 0, 'taxCents'],
      ['E-ABACUS-TAX-RATE', 1, 'taxCents'],
      ['E-ABACUS-TAX-RATE', 4, 'taxCents'],
      ['E-ABACUS-TAX-RATE', 5, 'taxCents'],
    ]);
    expect(codes([accommodation({ singleAccount: '3200', grossCents: 10_810, tax: mwst('311', 8.1, -810) }), accommodation({ debitCredit: 'C', grossCents: 2_076, tax: mwst('313', 3.8, 76) })])).toEqual([]);
    const [finding] = validateBookings([tax(-20_000)], abacusOptions());
    expect(finding?.message).toBe(
      'MWST-Betrag -200.00 does not fit 3.8 % of the gross Betrag 207.60: expected 7.60 (Betrag × Satz / (100 + Satz), rounded to the Rappen), at most 0.01 off',
    );
    expect(() => renderXmlBuchungen([tax(-20_000)], abacusOptions())).toThrow(AbacusValidationError);
  });

  it('Untaxed revenue with an MWST-Code: rate 0 and tax 0.00 raise no finding on either side', () => {
    expect(codes([accommodation({ singleAccount: '3600', tax: mwst('400', 0, 0) }), accommodation({ debitCredit: 'C', tax: mwst('400', 0, 0) })])).toEqual([]);
  });

  it('Wrong tax sign: E-ABACUS-TAX-SIGN names the booking', () => {
    const findings = validateBookings([payment(), accommodation({ tax: mwst('313', 3.8, 760) }), accommodation({ debitCredit: 'C', grossCents: 2_076, tax: mwst('313', 3.8, -76) })], abacusOptions());
    expect(findings.map((f) => [f.code, f.index])).toEqual([
      ['E-ABACUS-TAX-SIGN', 1],
      ['E-ABACUS-TAX-SIGN', 2],
    ]);
    expect(findings[0]?.message).toBe('MWST-Betrag 7.60 must be negative when the Gegenkonto (SingleInformation) is credited (DebitCredit D)');
    expect(findings[1]?.message).toBe('MWST-Betrag -0.76 must be positive when the Gegenkonto (SingleInformation) is debited (DebitCredit C)');
  });

  it('E-ABACUS-RATE for a rate below 0, above 99.99 or with more than two decimals', () => {
    const rate = (percent: number, taxCents = -1) => accommodation({ tax: mwst('313', percent, taxCents) });
    expect(codes([rate(-1), rate(100), rate(3.805), rate(Number.NaN), rate(99.99, -10_379), rate(2.6, -526)])).toEqual([
      ['E-ABACUS-RATE', 0, 'percent'],
      ['E-ABACUS-RATE', 1, 'percent'],
      ['E-ABACUS-RATE', 2, 'percent'],
      ['E-ABACUS-RATE', 3, 'percent'],
    ]);
  });

  it('E-ABACUS-MWST-CODE for a code that is not 1 to 3 characters of A-Z, a-z and 0-9', () => {
    const code = (mwstCode: string) => accommodation({ tax: mwst(mwstCode, 3.8, -760) });
    expect(codes([code(''), code('3133'), code('31 '), code('V-8'), code('V81'), code('v1'), code('4')])).toEqual([
      ['E-ABACUS-MWST-CODE', 0, 'mwstCode'],
      ['E-ABACUS-MWST-CODE', 1, 'mwstCode'],
      ['E-ABACUS-MWST-CODE', 2, 'mwstCode'],
      ['E-ABACUS-MWST-CODE', 3, 'mwstCode'],
    ]);
  });

  it('E-ABACUS-KOST for a Kostenstelle that is not 1 to 11 digits; an empty one is no Kostenstelle', () => {
    expect(codes([accommodation({ kost: 'K10' }), accommodation({ kost: '123456789012' }), accommodation({ kost: '' }), accommodation({ kost: '12345678901' })])).toEqual([
      ['E-ABACUS-KOST', 0, 'kost'],
      ['E-ABACUS-KOST', 1, 'kost'],
    ]);
  });

  it('E-ABACUS-TEXT for a Text1 that is empty after sanitising', () => {
    expect(codes([payment({ text1: '' }), payment({ text1: ' \n\t\u0000 ' }), payment({ text2: '' })])).toEqual([
      ['E-ABACUS-TEXT', 0, 'text1'],
      ['E-ABACUS-TEXT', 1, 'text1'],
    ]);
  });

  it('E-ABACUS-DATE for a business date outside the period or not a valid date', () => {
    expect(codes([payment({ businessDate: '2026-09-30' }), payment({ businessDate: '2026-11-01' }), payment({ businessDate: '2026-10-32' as never }), payment({ businessDate: '2026-10-31' })])).toEqual([
      ['E-ABACUS-DATE', 0, 'businessDate'],
      ['E-ABACUS-DATE', 1, 'businessDate'],
      ['E-ABACUS-DATE', 2, 'businessDate'],
    ]);
  });

  it('Reversed period: one E-ABACUS-PERIOD without a booking number and no E-ABACUS-DATE', () => {
    const findings = validateBookings([payment({ businessDate: '2026-10-14' })], abacusOptions({ from: '2026-11-01', to: '2026-10-31' }));
    expect(findings).toEqual([expect.objectContaining({ code: 'E-ABACUS-PERIOD', field: 'from' })]);
    expect(findings[0]?.index).toBeUndefined();
    expect(() => renderXmlBuchungen([], abacusOptions({ from: '2026-11-01', to: '2026-10-31' }))).toThrow(AbacusValidationError);
  });

  it('E-ABACUS-PERIOD for a first or last day that is not a valid date', () => {
    expect(validateBookings([], abacusOptions({ from: '2026-02-30', to: 'x' as never })).map((f) => [f.code, f.field, f.index])).toEqual([
      ['E-ABACUS-PERIOD', 'from', undefined],
      ['E-ABACUS-PERIOD', 'to', undefined],
    ]);
  });

  it('E-ABACUS-BELEGNR for more than 999,999 bookings in one file', () => {
    const many = Array.from({ length: 1_000_000 }, () => payment());
    expect(validateBookings(many, abacusOptions()).map((f) => f.code)).toEqual(['E-ABACUS-BELEGNR']);
    expect(validateBookings(many.slice(1), abacusOptions())).toEqual([]);
  }, 30_000); // a million bookings: well over the 5 s default when the whole suite runs in parallel

  it('a booking without MWST needs no tax fields', () => {
    expect(codes([withoutTax(accommodation())])).toEqual([]);
  });
});
