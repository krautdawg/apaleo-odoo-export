import type { Finding } from '../core/findings.js';

/** The columns of a mapping CSV, in the order the tool writes them. */
export const MAPPING_COLUMNS = [
  'apaleo_account',
  'apaleo_type',
  'apaleo_name',
  'apaleo_vat_percent',
  'abacus_account',
  'mwst_code',
  'mwst_percent',
  'kost',
  'comment',
] as const;

export type MappingColumn = (typeof MAPPING_COLUMNS)[number];

/**
 * Header columns of mapping files of other tools, which are refused: the DATEV
 * mapping of apaleo-datev-export, the BMD mapping of apaleo-bmd-export and the
 * account export of a paid apaleo-DATEV connector (lower case, as read).
 */
export const DATEV_COLUMNS: readonly string[] = ['datev_account', 'bu_key', 'datev_vat_percent'];
export const BMD_COLUMNS: readonly string[] = ['bmd_account', 'steuercode', 'bmd_vat_percent'];
export const DATEV_CONNECTOR_COLUMNS: readonly string[] = ['apaleoaccountnumber', 'datevaccountnumber'];

/**
 * The columns of the account export of a paid apaleo-Abacus connector (research §3),
 * as written in its header. `init-mapping --accounts-from` reads such a file; as a
 * mapping it is refused.
 */
export const CONNECTOR_EXPORT_COLUMNS = ['Apaleo Kontonummer', 'Kontoname', 'Kontotyp', 'Abacus Kontonummer', 'Kostenstelle'] as const;

/** `apaleo_account` of a row that matches every account of its type. */
export const WILDCARD = '*';

/** `apaleo_type` of a row that matches its account number regardless of type. */
export const ANY_TYPE = '*any*';

/**
 * Types whose lines carry VAT. A wildcard row for one of them must name the VAT
 * rate it stands for, so an account with an unknown rate never slips through.
 */
export const VAT_RELEVANT_TYPES: ReadonlySet<string> = new Set([
  'Liabilities',
  'CityTaxes',
  'SecondCityTax',
  'GuestLevies',
  'LossOfAccountsReceivable',
  'Vat',
  'VatOnLiabilities',
  'Revenues',
]);

/** apaleo's own VAT accounts. Their lines are always skipped (Abacus books the MWST from `TaxData`), so they need no row. */
export const VAT_ACCOUNT_TYPES: ReadonlySet<string> = new Set(['Vat', 'VatOnLiabilities']);

/** Types whose bookings are sales, deposits, levies or bad debt: they owe output tax, never input tax. */
export const OUTPUT_TAX_TYPES: ReadonlySet<string> = new Set(['Revenues', 'Liabilities', 'CityTaxes', 'SecondCityTax', 'GuestLevies', 'LossOfAccountsReceivable']);

/**
 * Types that are money or a claim on a guest or Debitor (Zahlungsmittel, Transferkonto, Gästeforderung, Debitoren): an
 * MWST-Code on their row would make Abacus book the MWST on the money or claim account, so their rows must never carry one.
 */
export const NO_TAX_TYPES: ReadonlySet<string> = new Set(['Payments', 'Receivables', 'AccountsReceivable']);

/** Types whose `kost` becomes the Kostenstelle (`BookingLevel1`): Abacus accepts one only on Erfolgskonten. */
export const KOST_TYPES: ReadonlySet<string> = new Set(['Revenues', 'LossOfAccountsReceivable']);

/** One row of a mapping file. Every value is kept as the text in the file. */
export interface MappingRow {
  /** Line of the file the row ends on, 1-based. */
  readonly line: number;
  readonly apaleoAccount: string;
  readonly apaleoType: string;
  readonly apaleoName: string;
  readonly apaleoVatPercent: string;
  /** Abacus account number (1 to 11 digits); empty means unmapped. */
  readonly abacusAccount: string;
  /** MWST-Code of the Mandant's MWST-Tabelle, kept as text (`311`, `V81`); empty means no MWST on this row. */
  readonly mwstCode: string;
  /** The MWST rate Abacus books with the MWST-Code (0 allowed); empty without one. */
  readonly mwstPercent: string;
  /** Kostenstelle, written only on revenue and write-off bookings. */
  readonly kost: string;
  readonly comment: string;
}

export type MappingRowValues = Omit<MappingRow, 'line'>;

export const ROW_FIELDS: Readonly<Record<MappingColumn, keyof MappingRowValues>> = {
  apaleo_account: 'apaleoAccount',
  apaleo_type: 'apaleoType',
  apaleo_name: 'apaleoName',
  apaleo_vat_percent: 'apaleoVatPercent',
  abacus_account: 'abacusAccount',
  mwst_code: 'mwstCode',
  mwst_percent: 'mwstPercent',
  kost: 'kost',
  comment: 'comment',
};

export interface Mapping {
  readonly path: string;
  readonly rows: readonly MappingRow[];
  /** Notes and warnings from reading the file, for example an unknown column (`W-UNKNOWN-COLUMN`). */
  readonly findings: readonly Finding[];
}

/**
 * A VAT percent as written in the file: `8.1`, `8,1`, `3.80` or `8,1 %`. Undefined
 * for an empty cell, NaN for anything else.
 */
export function parsePercent(text: string): number | undefined {
  const value = text.trim().replace(/\s*%$/, '').replace(',', '.');
  if (value === '') return undefined;
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
}

/** The key two rows must not share: account and type, plus the rate for wildcard rows of VAT-relevant types. */
export function rowKey(row: Pick<MappingRow, 'apaleoAccount' | 'apaleoType' | 'apaleoVatPercent'>): string {
  const base = `${row.apaleoAccount}\u0000${row.apaleoType}`;
  const rated = row.apaleoAccount === WILDCARD && VAT_RELEVANT_TYPES.has(row.apaleoType);
  return rated ? `${base}\u0000${parsePercent(row.apaleoVatPercent) ?? ''}` : base;
}

/** "line 7", for messages. */
export function lineLabel(row: Pick<MappingRow, 'line'>): string {
  return `line ${row.line}`;
}

/** The MWST-Code of a row, or undefined when the cell is empty. */
export function mwstCodeOf(row: Pick<MappingRow, 'mwstCode'>): string | undefined {
  const code = row.mwstCode.trim();
  return code === '' ? undefined : code;
}

/**
 * The MWST rate Abacus books on a row: `mwst_percent` with an MWST-Code, 0
 * without one. Undefined when it cannot be known (an MWST-Code without rate, or a
 * rate that is not a number).
 */
export function rowRate(row: Pick<MappingRow, 'mwstCode' | 'mwstPercent'>): number | undefined {
  if (mwstCodeOf(row) === undefined) return 0;
  const rate = parsePercent(row.mwstPercent);
  return rate === undefined || Number.isNaN(rate) ? undefined : rate;
}
