import type { AbacusBooking, AbacusRenderOptions, AbacusTax } from '../../src/abacus/types.js';

/** The file of property BSP for October 2026: Mandant 1234, CHF, vereinbart, version 2015.00, the KMU sample tax accounts. */
export function abacusOptions(overrides: Partial<AbacusRenderOptions> = {}): AbacusRenderOptions {
  return {
    from: '2026-10-01',
    to: '2026-10-31',
    propertyId: 'BSP',
    mandant: '1234',
    geschaeftsbereich: 0,
    leitwaehrung: 'CHF',
    abrechnungsart: 'vereinbart',
    version: '2015.00',
    mwstKonto: '2200',
    mwstHilfskonto: '2202',
    ...overrides,
  };
}

/** The spec's accommodation booking: guest receivables 1101 in Soll, Beherbergung 3400 in Haben, 207.60 gross at 3.8 % with tax −7.60. */
export function accommodation(overrides: Partial<AbacusBooking> = {}): AbacusBooking {
  return {
    collectiveAccount: '1101',
    singleAccount: '3400',
    debitCredit: 'D',
    businessDate: '2026-10-14',
    grossCents: 20_760,
    tax: { mwstCode: '313', percent: 3.8, taxCents: -760 },
    text1: 'Erlös Beherbergung',
    text2: 'BSP-2026-0042',
    ...overrides,
  };
}

/** A card payment without MWST: transfer account 1090 in Soll, guest receivables 1101 in Haben. */
export function payment(overrides: Partial<AbacusBooking> = {}): AbacusBooking {
  return {
    collectiveAccount: '1090',
    singleAccount: '1101',
    debitCredit: 'D',
    businessDate: '2026-10-14',
    grossCents: 12_000,
    text1: 'Zahlung Visa',
    text2: 'BSP-2026-0042',
    ...overrides,
  };
}

/** A tax part with `percent` and `taxCents`. */
export function mwst(mwstCode: string, percent: number, taxCents: number): AbacusTax {
  return { mwstCode, percent, taxCents };
}

/** The booking without its `tax`. */
export function withoutTax(booking: AbacusBooking): AbacusBooking {
  const copy = { ...booking };
  delete copy.tax;
  return copy;
}

/** The text of the first `<tag ...>...</tag>` element in `xml`, including its own tags. */
export function block(xml: string, tag: string): string {
  const start = xml.search(new RegExp(`<${tag}[ >]`));
  const end = xml.indexOf(`</${tag}>`, start);
  if (start < 0 || end < 0) throw new Error(`no <${tag}> in\n${xml}`);
  return xml.slice(start, end + tag.length + 3);
}

/** The `Transaction` with id `n` (1-based). */
export function transaction(xml: string, n: number): string {
  return block(xml.slice(xml.indexOf(`<Transaction id='${n}'>`)), 'Transaction');
}

/** The text contents of every `<tag>` leaf in `xml`, in file order. */
export function values(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map((m) => m[1] ?? '');
}

/** The text of the first `<tag>` leaf in `xml`; cut the block with `block` first. */
export function value(xml: string, tag: string): string | undefined {
  return values(xml, tag)[0];
}

/** The element names of a block's direct children, in order. */
export function childNames(xml: string): string[] {
  const lines = xml.split('\n');
  const depth = (line: string) => line.length - line.trimStart().length;
  // The block starts at its own `<`, so its first child line gives the child indentation.
  const childDepth = depth(lines[1] ?? '');
  return lines
    .filter((line) => depth(line) === childDepth && /^\s*<[A-Za-z]/.test(line))
    .map((line) => /<([A-Za-z0-9]+)/.exec(line)?.[1] ?? '?');
}

/** The lines that differ between two renderings of the same length, as `[lineNumber, before, after]`. */
export function changedLines(before: string, after: string): [number, string, string][] {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length !== b.length) throw new Error(`line counts differ: ${a.length} and ${b.length}`);
  return a.flatMap((line, i): [number, string, string][] => (line === b[i] ? [] : [[i + 1, line.trim(), (b[i] ?? '').trim()]]));
}
