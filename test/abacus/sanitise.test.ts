import { describe, expect, it } from 'vitest';
import { sanitiseText } from '../../src/abacus/sanitise.js';

describe('Abacus text sanitising', () => {
  it('Line break in a text: tab, CR and LF become one space', () => {
    expect(sanitiseText('Zahlung\nVisa', 0, 'text1')).toEqual({ value: 'Zahlung Visa', notes: [] });
    expect(sanitiseText('Zahlung\r\n\tVisa', 0, 'text1').value).toBe('Zahlung Visa');
  });

  it('removes other control characters and characters XML 1.0 does not allow, keeps emoji and umlauts', () => {
    expect(sanitiseText('A\u0000B\u0007C\u007fD\u0085E￾F￿G', 0, 'text1').value).toBe('ABCDEFG');
    expect(sanitiseText('lone \ud800 and \udc00 surrogates', 0, 'text1').value).toBe('lone and surrogates');
    expect(sanitiseText('Frühstück 🍳 Seeblick', 0, 'text1').value).toBe('Frühstück 🍳 Seeblick');
  });

  it('collapses repeated spaces, trims and composes decomposed umlauts', () => {
    expect(sanitiseText('  Logis   Doppelzimmer  ', 0, 'text2').value).toBe('Logis Doppelzimmer');
    expect(sanitiseText('Frühstück', 0, 'text1').value).toBe('Frühstück');
  });

  it('Long reference: cuts to the first 80 characters and reports N-ABACUS-TRUNCATED with the booking', () => {
    const original = `${'R'.repeat(79)}${'X'.repeat(16)}`;
    expect(original).toHaveLength(95);
    const { value, notes } = sanitiseText(original, 4, 'text2');
    expect(value).toBe(original.slice(0, 80));
    expect(notes).toEqual([
      expect.objectContaining({ code: 'N-ABACUS-TRUNCATED', index: 4, field: 'text2', label: 'Text2', value: original }),
    ]);
    expect(notes[0]?.message).toContain('longer than 80 characters');
  });

  it('counts characters, not UTF-16 units, and leaves no space at the cut', () => {
    expect(sanitiseText('ü'.repeat(80), 0, 'text1')).toEqual({ value: 'ü'.repeat(80), notes: [] });
    expect(sanitiseText('🍳'.repeat(81), 0, 'text1').value).toBe('🍳'.repeat(80));
    expect(sanitiseText(`${'a'.repeat(79)} bcd`, 0, 'text1').value).toBe('a'.repeat(79));
  });
});
