import { describe, expect, it } from 'vitest';
import {
  escapeXml,
  formatAmount,
  formatDate,
  formatDocumentNumber,
  formatRate,
  formatYyyymmdd,
  MAX_BOOKINGS_PER_FILE,
  SINGLE_TAX_ACCOUNT,
  TAX_AMOUNT_IN_KEY_CURRENCY,
  TAX_INCLUDED_AT_RATE_ZERO,
  TAX_TYPE_OUTPUT,
  taxAccounts,
  taxSign,
  useCode,
} from '../../src/abacus/format.js';

describe('Abacus number formats', () => {
  it('Rappen amounts: decimal point, two decimals, leading minus, no thousands separator and no 5-Rappen rounding', () => {
    expect(formatAmount(123_455)).toBe('1234.55');
    expect(formatAmount(1)).toBe('0.01');
    expect(formatAmount(-760)).toBe('-7.60');
    expect(formatAmount(0)).toBe('0.00');
    expect(formatAmount(123_456_789_012)).toBe('1234567890.12');
    expect(formatAmount(3)).toBe('0.03');
  });

  it('Rate format: decimal point and no trailing zeros', () => {
    expect(['8.1', '3.8', '2.6', '0', '12.25', '7.7', '100'].map(Number).map(formatRate)).toEqual(['8.1', '3.8', '2.6', '0', '12.25', '7.7', '100']);
    expect(formatRate(8.10)).toBe('8.1');
  });

  it('writes dates as YYYY-MM-DD and JJJJMMTT and refuses an invalid date', () => {
    expect(formatDate('2026-10-14')).toBe('2026-10-14');
    expect(formatYyyymmdd('2026-10-14')).toBe('20261014');
    expect(() => formatDate('2026-02-30')).toThrow(TypeError);
  });
});

describe('Belegnummer', () => {
  it('Numbers in a January file: MMDD of the first day and a 6-digit counter, 10 characters', () => {
    expect([0, 1, 2].map((i) => formatDocumentNumber('2027-01-01', i))).toEqual(['0101000001', '0101000002', '0101000003']);
    expect(formatDocumentNumber('2026-10-01', MAX_BOOKINGS_PER_FILE - 1)).toBe('1001999999');
    expect(formatDocumentNumber('2026-10-01', 0)).toHaveLength(10);
  });

  it('Two daily files of one month never share a number', () => {
    const first = Array.from({ length: 40 }, (_, i) => formatDocumentNumber('2026-10-14', i));
    const second = Array.from({ length: 35 }, (_, i) => formatDocumentNumber('2026-10-15', i));
    expect([first[0], first.at(-1), second[0], second.at(-1)]).toEqual(['1014000001', '1014000040', '1015000001', '1015000035']);
    expect(first.filter((number) => second.includes(number))).toEqual([]);
  });
});

describe('MWST choices of the first test import', () => {
  it('keeps the documented defaults (research §9, open questions 3, 4, 11, 12 and 14)', () => {
    expect(TAX_TYPE_OUTPUT).toBe(0);
    expect(TAX_AMOUNT_IN_KEY_CURRENCY).toBe('zero');
    expect(TAX_INCLUDED_AT_RATE_ZERO).toBe('I');
    expect(SINGLE_TAX_ACCOUNT).toBe('account');
  });

  it('signs output tax negative when the Single account is credited and positive when it is debited', () => {
    expect(taxSign('D')).toBe(-1);
    expect(taxSign('C')).toBe(1);
  });

  it('UseCode 0 for vereinbart and 1 for vereinnahmt', () => {
    expect(useCode('vereinbart')).toBe('0');
    expect(useCode('vereinnahmt')).toBe('1');
  });

  it('TaxAccount per Abrechnungsart: Steuerkonto or Hilfskonto in Collective, the account itself or the tax account in Single', () => {
    const settings = { abrechnungsart: 'vereinbart', mwstKonto: '2200', mwstHilfskonto: '2202' } as const;
    expect(taxAccounts('3400', 3.8, settings, 'account', 'taxAccount')).toEqual({ collective: '2200', single: '3400' });
    expect(taxAccounts('3400', 3.8, { ...settings, abrechnungsart: 'vereinnahmt' }, 'account', 'taxAccount')).toEqual({ collective: '2202', single: '3400' });
    expect(taxAccounts('3400', 3.8, settings, 'taxAccount', 'taxAccount')).toEqual({ collective: '2200', single: '2200' });
    expect(taxAccounts('3400', 3.8, { ...settings, abrechnungsart: 'vereinnahmt' }, 'taxAccount', 'taxAccount')).toEqual({ collective: '2202', single: '2202' });
  });

  it('TaxAccount at rate 0: the Steuerkonto by default, 0 in Collective with zero, and only at rate 0', () => {
    const settings = { abrechnungsart: 'vereinbart', mwstKonto: '2200', mwstHilfskonto: '2202' } as const;
    expect(taxAccounts('2210', 0, settings, 'account', 'taxAccount')).toEqual({ collective: '2200', single: '2210' });
    expect(taxAccounts('2210', 0, settings, 'account', 'zero')).toEqual({ collective: '0', single: '2210' });
    expect(taxAccounts('2210', 0, settings, 'taxAccount', 'zero')).toEqual({ collective: '0', single: '0' });
    expect(taxAccounts('3400', 3.8, settings, 'account', 'zero')).toEqual({ collective: '2200', single: '3400' });
  });
});

describe('XML escaping', () => {
  it('escapes &, <, >, apostrophe and quote, and nothing else', () => {
    expect(escapeXml(`Getränke & Frühstück <Bar> "Seeblick" l'Hôtel`)).toBe('Getränke &amp; Frühstück &lt;Bar&gt; &quot;Seeblick&quot; l&apos;Hôtel');
    expect(escapeXml('&amp;')).toBe('&amp;amp;');
  });
});
