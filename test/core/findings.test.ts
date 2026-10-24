import { describe, expect, it } from 'vitest';
import { formatFinding, isErrorFinding } from '../../src/core/findings.js';

describe('findings', () => {
  it('treats E- codes as errors', () => {
    expect(isErrorFinding({ code: 'E-ABACUS-AMOUNT', message: '' })).toBe(true);
    expect(isErrorFinding({ code: 'W-RECENT-DAY', message: '' })).toBe(false);
  });

  it('formats code, booking number (from 1), field label and message on one line', () => {
    expect(formatFinding({ code: 'E-ABACUS-AMOUNT', index: 3, field: 'amountCents', label: 'Betrag', message: 'too small' })).toBe(
      'E-ABACUS-AMOUNT (booking 4, Betrag): too small',
    );
    expect(formatFinding({ code: 'E-X', index: 0, field: 'account', message: 'bad' })).toBe('E-X (booking 1, account): bad');
    expect(formatFinding({ code: 'E-ABACUS-PERIOD', message: 'bad' })).toBe('E-ABACUS-PERIOD: bad');
  });
});
