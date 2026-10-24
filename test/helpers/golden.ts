const decoder = new TextDecoder('windows-1252');
const MAX_REPORTED = 10;

/** Shows CR and LF so a line-end difference is visible. */
function visible(text: string): string {
  return text.replaceAll('\r', '\\r').replaceAll('\n', '\\n');
}

/** The name of field `index` (0-based) in line `lineNumber` (1-based), for the difference report. */
export type FieldNamer = (lineNumber: number, index: number) => string;

/** For files without named fields, such as a protocol. */
const unnamed: FieldNamer = () => '?';

/** Splits one line at `;` outside quotes, keeping the quotes so a quoting change shows. */
function splitFields(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    if (char === ';' && !quoted) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function describeLine(lineNumber: number, expected: string, actual: string, fieldName: FieldNamer): string[] {
  const head = `line ${lineNumber}:`;
  const expectedFields = splitFields(expected.replace(/\r?\n$/, ''));
  const actualFields = splitFields(actual.replace(/\r?\n$/, ''));
  const sameEnding = expected.slice(expected.replace(/\r?\n$/, '').length) === actual.slice(actual.replace(/\r?\n$/, '').length);
  if (expectedFields.length !== actualFields.length || !sameEnding) {
    return [head, `  - expected: ${visible(expected)}`, `  + actual:   ${visible(actual)}`];
  }
  const fields = expectedFields.flatMap((field, i) =>
    field === actualFields[i]
      ? []
      : [`  field ${i + 1} (${fieldName(lineNumber, i)}): expected ${field || '(empty)'}, got ${actualFields[i] || '(empty)'}`],
  );
  return [head, ...fields];
}

/**
 * A readable description of how two CP1252 files differ, line by line and field
 * by field, or undefined when the bytes are identical.
 */
export function describeDifference(expected: Uint8Array, actual: Uint8Array, fieldName: FieldNamer = unnamed): string | undefined {
  if (expected.length === actual.length && expected.every((byte, i) => byte === actual[i])) return undefined;
  const split = (bytes: Uint8Array) => decoder.decode(bytes).split(/(?<=\n)/);
  const expectedLines = split(expected);
  const actualLines = split(actual);
  const report: string[] = [];
  const count = Math.max(expectedLines.length, actualLines.length);
  for (let i = 0; i < count && report.length < MAX_REPORTED * 3; i++) {
    const [e, a] = [expectedLines[i] ?? '', actualLines[i] ?? ''];
    if (e !== a) report.push(...describeLine(i + 1, e || '(missing line)', a || '(missing line)', fieldName));
  }
  if (report.length === 0) report.push('the bytes differ but decode to the same text (check characters outside CP1252)');
  return report.join('\n');
}

/**
 * A readable description of how two UTF-8 text files differ, line by line
 * (for the Abacus XML files, whose lines are elements, not `;` fields), or
 * undefined when the bytes are identical.
 */
export function describeUtf8Difference(expected: Uint8Array, actual: Uint8Array): string | undefined {
  if (expected.length === actual.length && expected.every((byte, i) => byte === actual[i])) return undefined;
  const split = (bytes: Uint8Array) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes).split(/(?<=\n)/);
  const expectedLines = split(expected);
  const actualLines = split(actual);
  const report: string[] = [];
  const count = Math.max(expectedLines.length, actualLines.length);
  for (let i = 0; i < count && report.length < MAX_REPORTED * 3; i++) {
    const [e, a] = [expectedLines[i] ?? '(missing line)', actualLines[i] ?? '(missing line)'];
    if (e !== a) report.push(`line ${i + 1}:`, `  - expected: ${visible(e)}`, `  + actual:   ${visible(a)}`);
  }
  if (report.length === 0) report.push('the bytes differ but decode to the same text (check for invalid UTF-8)');
  return report.join('\n');
}
