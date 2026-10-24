import type { Finding } from '../core/findings.js';
import { TEXT_MAX_LENGTH } from './format.js';
import { labelOf } from './labels.js';

export interface Sanitised {
  value: string;
  /** `N-ABACUS-TRUNCATED`, with booking index, field and original value. */
  notes: Finding[];
}

export type TextField = 'text1' | 'text2';

const LINE_BREAKS = /[\t\r\n]/g;
/**
 * Other control characters (C0, DEL, C1) and what XML 1.0 does not allow:
 * lone surrogates and U+FFFE, U+FFFF. Characters above U+FFFF arrive as valid
 * surrogate pairs and stay.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const NOT_WRITTEN = /[\u0000-\u001f\u007f-\u009f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/**
 * `Text1` and `Text2`: tab, CR and LF become spaces, other control characters
 * and characters XML 1.0 does not allow are removed, repeated spaces collapse,
 * the ends are trimmed, then the value is cut to 80 characters
 * (`N-ABACUS-TRUNCATED`). The text is composed (NFC) first, so a decomposed `ü` stays one character.
 */
export function sanitiseText(original: string, index: number, field: TextField): Sanitised {
  const notes: Finding[] = [];
  let value = original.normalize('NFC').replace(LINE_BREAKS, ' ').replace(NOT_WRITTEN, '').replace(/ {2,}/g, ' ').trim();
  const chars = [...value];
  if (chars.length > TEXT_MAX_LENGTH) {
    value = chars.slice(0, TEXT_MAX_LENGTH).join('').trimEnd();
    notes.push({
      code: 'N-ABACUS-TRUNCATED',
      index,
      field,
      label: labelOf(field),
      value: original,
      message: `${labelOf(field)} longer than ${TEXT_MAX_LENGTH} characters, cut to "${value}"`,
    });
  }
  return { value, notes };
}
