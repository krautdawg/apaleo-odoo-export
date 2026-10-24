import type { LocalDate } from '../core/date.js';
import type { Finding } from '../core/findings.js';
import { LABEL_MAX_LENGTH } from './format.js';

export interface SanitisedLabel {
  value: string;
  /** `N-ODOO-TRUNCATED` when the label was cut. */
  note?: Finding;
}

// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/**
 * `line_ids/name`: composed (NFC), control characters and lone surrogates
 * removed, every run of whitespace (tab and line breaks included) one space,
 * the ends trimmed, then cut to 128 characters (`N-ODOO-TRUNCATED` with the day
 * and the account). An empty label becomes the account code.
 */
export function sanitiseLabel(original: string, date: LocalDate, account: string): SanitisedLabel {
  const clean = original.normalize('NFC').replace(CONTROL, '').replace(/\s+/gu, ' ').trim();
  if (clean === '') return { value: account };
  const chars = [...clean];
  if (chars.length <= LABEL_MAX_LENGTH) return { value: clean };
  const value = chars.slice(0, LABEL_MAX_LENGTH).join('').trimEnd();
  return {
    value,
    note: {
      code: 'N-ODOO-TRUNCATED',
      field: 'label',
      label: 'Bezeichnung',
      value: original,
      message: `${date}, account ${account}: the label is longer than ${LABEL_MAX_LENGTH} characters and was cut to "${value}"`,
    },
  };
}

/** `label` with `suffix`, the label cut first so the whole stays within 128 characters. */
export function withSuffix(label: string, suffix: string): string {
  const room = LABEL_MAX_LENGTH - [...suffix].length;
  const chars = [...label];
  return `${chars.length > room ? chars.slice(0, room).join('').trimEnd() : label}${suffix}`;
}
