import type { Finding } from '../core/findings.js';
import { AbacusValidationError } from './errors.js';
import {
  escapeXml,
  FLAT_RATE,
  formatAmount,
  formatDate,
  formatDocumentNumber,
  formatRate,
  formatYyyymmdd,
  indent,
  LINE_END,
  NO_TAX_ACCOUNT,
  SINGLE_TAX_ACCOUNT,
  TAX_ACCOUNT_AT_RATE_ZERO,
  TAX_AMOUNT_IN_KEY_CURRENCY,
  TAX_COEFFICIENT,
  TAX_COUNTRY,
  TAX_INCLUDED,
  TAX_INCLUDED_AT_RATE_ZERO,
  TAX_TYPE_OUTPUT,
  taxAccounts,
  useCode,
  XML_DECLARATION,
} from './format.js';
import { sanitiseText, type TextField } from './sanitise.js';
import type { AbacusBooking, AbacusRenderOptions, AbacusTax } from './types.js';
import { validateBookings, validatePeriod } from './validate.js';

export interface RenderedXmlBuchungen {
  /** The whole file with LF line ends. */
  text: string;
  /** `text` in UTF-8, without byte-order mark. */
  bytes: Uint8Array;
  /** Every change the writer made to a value (`N-ABACUS-TRUNCATED`), with booking index, field and original value. */
  notes: Finding[];
}

/** The AbaConnect interface of the file (research §2). */
export const APPLICATION = 'FIBU';
export const INTERFACE_ID = 'XML Buchungen';
export const MAP_ID = 'AbaDefault';

/** An element with text content, or with child elements and optional attributes. */
type XmlNode = { name: string; text: string } | { name: string; attributes?: Readonly<Record<string, string>>; children: readonly XmlNode[] };

const leaf = (name: string, text: string): XmlNode => ({ name, text });
const node = (name: string, children: readonly XmlNode[], attributes?: Record<string, string>): XmlNode =>
  attributes ? { name, attributes, children } : { name, children };
/** `mode='SAVE'` "muss immer bei einem Bereich stehen". */
const saved = (name: string, children: readonly XmlNode[]) => node(name, children, { mode: 'SAVE' });

/**
 * Renders an AbaConnect XML Buchungen file: the container with one `Task`, its
 * `Parameter` block and one `Transaction` per booking, numbered in file order.
 * Throws one `AbacusValidationError` with every problem found, and returns nothing then.
 */
export function renderXmlBuchungen(bookings: readonly AbacusBooking[], options: AbacusRenderOptions): RenderedXmlBuchungen {
  const errors = validateBookings(bookings, options);
  if (errors.length > 0) throw new AbacusValidationError(errors);

  const notes: Finding[] = [];
  const transactions = bookings.map((booking, index) => node('Transaction', [entry(booking, index, options, notes)], { id: String(index + 1) }));
  const container = node('AbaConnectContainer', [
    leaf('TaskCount', '1'),
    node('Task', [
      node('Parameter', [
        leaf('Application', APPLICATION),
        leaf('Id', INTERFACE_ID),
        leaf('MapId', MAP_ID),
        leaf('Version', options.version),
        leaf('Mandant', options.mandant),
      ]),
      ...transactions,
    ]),
  ]);
  const text = [XML_DECLARATION, ...serialise(container, 0)].map((line) => line + LINE_END).join('');
  return { text, bytes: new TextEncoder().encode(text), notes };
}

function entry(b: AbacusBooking, index: number, options: AbacusRenderOptions, notes: Finding[]): XmlNode {
  const clean = (value: string | undefined, field: TextField) => {
    if (value === undefined) return '';
    const result = sanitiseText(value, index, field);
    notes.push(...result.notes);
    return result.value;
  };
  const text1 = clean(b.text1, 'text1');
  const text2 = clean(b.text2, 'text2');
  const texts = [leaf('Text1', text1), ...(text2 === '' ? [] : [leaf('Text2', text2)])];
  const accounts = b.tax
    ? taxAccounts(b.singleAccount, b.tax.percent, options, SINGLE_TAX_ACCOUNT, TAX_ACCOUNT_AT_RATE_ZERO)
    : { collective: NO_TAX_ACCOUNT, single: NO_TAX_ACCOUNT };
  const amount = formatAmount(b.grossCents);
  const amountData = saved('AmountData', [leaf('Currency', options.leitwaehrung), leaf('Amount', amount)]);
  const date = formatDate(b.businessDate);
  const documentNumber = leaf('DocumentNumber', formatDocumentNumber(options.from, index));

  const collective = saved('CollectiveInformation', [
    leaf('EntryLevel', 'A'),
    leaf('EntryType', 'S'),
    leaf('Type', 'Normal'),
    leaf('DebitCredit', b.debitCredit),
    leaf('Client', options.mandant),
    leaf('Division', String(options.geschaeftsbereich)),
    leaf('KeyCurrency', options.leitwaehrung),
    leaf('EntryDate', date),
    amountData,
    leaf('KeyAmount', amount),
    leaf('Account', b.collectiveAccount),
    leaf('TaxAccount', accounts.collective),
    ...texts,
    documentNumber,
    leaf('SingleCount', '0'),
  ]);
  const single = saved('SingleInformation', [
    leaf('Type', 'Normal'),
    leaf('DebitCredit', b.debitCredit),
    leaf('EntryDate', date),
    amountData,
    leaf('KeyAmount', amount),
    leaf('Account', b.singleAccount),
    leaf('TaxAccount', accounts.single),
    ...(b.kost ? [leaf('BookingLevel1', b.kost)] : []),
    ...texts,
    documentNumber,
    ...(b.tax ? [taxData(b.tax, options)] : []),
  ]);
  return saved('Entry', [collective, single]);
}

function taxData(tax: AbacusTax, options: AbacusRenderOptions): XmlNode {
  const keyAmount = formatAmount(tax.taxCents);
  return saved('TaxData', [
    leaf('TaxIncluded', tax.percent === 0 ? TAX_INCLUDED_AT_RATE_ZERO : TAX_INCLUDED),
    leaf('TaxType', String(TAX_TYPE_OUTPUT)),
    leaf('UseCode', useCode(options.abrechnungsart)),
    saved('AmountData', [leaf('Currency', options.leitwaehrung), leaf('Amount', TAX_AMOUNT_IN_KEY_CURRENCY === 'tax' ? keyAmount : formatAmount(0))]),
    leaf('KeyAmount', keyAmount),
    leaf('TaxRate', formatRate(tax.percent)),
    leaf('TaxCoefficient', TAX_COEFFICIENT),
    leaf('Country', TAX_COUNTRY),
    leaf('TaxCode', tax.mwstCode),
    leaf('FlatRate', FLAT_RATE),
  ]);
}

/** One line per element, two spaces per level; text and attribute values escaped, attributes in single quotes. */
function serialise(element: XmlNode, depth: number): string[] {
  const pad = indent(depth);
  if ('text' in element) return [`${pad}<${element.name}>${escapeXml(element.text)}</${element.name}>`];
  const attributes = Object.entries(element.attributes ?? {})
    .map(([name, value]) => ` ${name}='${escapeXml(value)}'`)
    .join('');
  return [`${pad}<${element.name}${attributes}>`, ...element.children.flatMap((child) => serialise(child, depth + 1)), `${pad}</${element.name}>`];
}

const TAG = /^[A-Za-z0-9_-]+$/;

/**
 * `ABACUS_Buchungen_<YYYYMMDD>-<YYYYMMDD>_<tag>.xml` for the first and last day
 * of the period. `tag` is the property id, or `<id>_DEMO` for a demo file; a tag
 * with other characters than `A-Z a-z 0-9 _ -` would not match the target's file
 * pattern, so it is refused (`E-ABACUS-FILE-NAME`), and so is an invalid period (`E-ABACUS-PERIOD`).
 */
export function xmlBuchungenFileName(options: Pick<AbacusRenderOptions, 'from' | 'to' | 'propertyId'>, tag = options.propertyId): string {
  if (!TAG.test(tag)) {
    throw new AbacusValidationError([
      { code: 'E-ABACUS-FILE-NAME', field: 'propertyId', value: tag, message: `The property id may only contain A-Z a-z 0-9 _ - in a file name, got "${tag}"` },
    ]);
  }
  const period = validatePeriod(options);
  if (period.length > 0) throw new AbacusValidationError(period);
  return `ABACUS_Buchungen_${formatYyyymmdd(options.from)}-${formatYyyymmdd(options.to)}_${tag}.xml`;
}
