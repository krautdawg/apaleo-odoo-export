import type { Config } from '../core/config.js';
import type { LocalDate } from '../core/date.js';
import type { Finding } from '../core/findings.js';
import type { PeriodPart } from './period.js';

/** What a target needs to name and render the file of one property and period. */
export interface TargetFileMeta {
  /** The whole config: a target reads its own section (for example `odoo`). */
  config: Config;
  propertyId: string;
  part: PeriodPart;
  /** `export --demo`: the file name and the file itself must say so. */
  demo: boolean;
  createdAt: Date;
  /**
   * 1 for the first file of a period, N + 1 for the file that replaces revision
   * N (`--overwrite`). The pipeline chooses it (export-run, "Idempotent re-runs");
   * the target writes it into the file so that a replacement can be imported
   * after the earlier revision was undone in the target program.
   */
  revision: number;
}

export interface RenderedFile {
  bytes: Uint8Array;
  /** `W-`/`N-` findings about values the writer changed (an invalid file throws a `FindingsError` instead). */
  findings: Finding[];
}

/**
 * The only way the export pipeline writes files (export-run, "Target writer
 * boundary"). `B` is the target's own booking type. The output folder logic
 * knows nothing about a target's file names or content: it finds existing and
 * overlapping files through `filePattern` and decides "unchanged" through
 * `sameContent`.
 */
export interface TargetWriter<B> {
  /** Short id, for example `odoo`. */
  readonly id: string;
  /**
   * The one currency (ISO 4217) every amount of the file is booked in, for this
   * config. The export refuses a property or ledger line in another currency
   * with `E-CURRENCY`: the tool does not convert.
   */
  currency(config: Config): string;
  /** The first line of the protocol beside each file. */
  readonly protocolTitle: string;
  /**
   * Matches the name of a current file of this target and captures its first
   * and last day as `YYYYMMDD` (groups 1 and 2). Must not match replaced files
   * (`.replaced-<timestamp>`) or protocols (`.protokoll.txt`).
   */
  readonly filePattern: RegExp;
  fileName(meta: Pick<TargetFileMeta, 'config' | 'propertyId' | 'part' | 'demo'>): string;
  /** The file for `meta.revision`. */
  render(bookings: readonly B[], meta: TargetFileMeta): RenderedFile;
  /** The revision of a file this target rendered, read back from its bytes; undefined for a file it cannot read one from. */
  revisionOf(bytes: Uint8Array): number | undefined;
  /** True when `existing` and `next` differ at most in what changes on every run (such as a creation time). */
  sameContent(existing: Uint8Array, next: Uint8Array): boolean;
  /**
   * The movement model of one booking: the signed amount (Soll positive) each
   * account of the booking moves by in the target, without the tax leg on the
   * target's own tax account. The plausibility checks compare it with apaleo.
   */
  movements(booking: B): [account: string, cents: number][];
  /**
   * The import block of the protocol and the dry run: what the accountant checks
   * before importing the file (its name, number of lines, the settings of the
   * program it is imported into). One string per line, the first a title.
   */
  importBlock(bookings: readonly B[], meta: TargetFileMeta): string[];
  /**
   * Extra lines for the protocol only, after the summary (for Odoo: per line of
   * the file, the apaleo entries and receipts it nets). One string per line.
   */
  protocolDetails?(bookings: readonly B[], meta: TargetFileMeta): string[];
  /**
   * What the rendered file holds, for the summary: the target's own VAT per tax
   * against apaleo's, and its numbers of entries, lines and rounding lines. A
   * target without own tax computation leaves it out, and the summary shows
   * apaleo's figures only.
   */
  fileFigures?(bookings: readonly B[], meta: TargetFileMeta): TargetFileFigures;
  /**
   * The line of the tax return the tax at `ratePercent` is declared in, as the
   * summary shows it after the tax and rate (for example `Kz 86`), or undefined
   * for a rate the target knows no line for.
   */
  taxReturnLine(ratePercent: number): string | undefined;
  /**
   * The target's own fields of the file's manifest entry: where the file books
   * into in the target program (for Odoo the company and journal) and what the
   * file holds (for Odoo entries, lines, debit total and VAT per tax). Read from
   * the same settings as `importBlock`, so the manifest and the protocol name
   * the same unit. A target without such fields returns `{}`.
   */
  manifestFields(meta: TargetFileMeta, bookings: readonly B[]): TargetManifestFields;
  /** The target's own words in the refusals of the output folder logic, which names no accounting program. */
  readonly advice: TargetAdvice;
}

/**
 * Sentences the export puts into its refusals: `E-PERIOD-OVERLAP` and
 * `E-FILE-EXISTS` of the output folder logic, and `E-CURRENCY`. They name the
 * program the file is imported into, its config keys and how an imported file
 * is undone there.
 */
export interface TargetAdvice {
  /** In `E-CURRENCY`, after the two currencies: why the file cannot carry another currency. */
  currency: string;
  /**
   * After "<file> already covers some of the days …": why not to import both,
   * and what to do with the other file. Takes the property and demo flag of the
   * refused file and the revision it gets once the other file is moved away
   * (one more than every earlier file of these days, so its External IDs are new).
   */
  overlap(file: Pick<TargetFileMeta, 'propertyId' | 'demo' | 'revision'>): string;
  /**
   * Before the `--overwrite` hint: why not to import both files, and how to
   * undo an imported old file first. Takes the property and demo flag of the
   * refused file and the revision the file written with `--overwrite` would
   * get, so the advice can name what to look for in the target program.
   */
  reimport(file: Pick<TargetFileMeta, 'propertyId' | 'demo' | 'revision'>): string;
  /** After the `--overwrite` hint, when the target has a case in which an imported file cannot be undone. */
  afterOverwrite?: string;
}

/**
 * The manifest fields a target may fill (`TargetWriter.manifestFields`), each
 * target its own optional fields.
 */
export interface TargetManifestFields {
  /** The Odoo company whose taxes the file names (`odoo.companyId`). */
  odooCompanyId?: number;
  /** The code of the Odoo journal the file is imported into. */
  odooJournal?: string;
  /** The number of journal entries (one per business day) and of their lines. */
  entries?: number;
  lines?: number;
  /** The sum of the debit column of the file, in cents. */
  debitTotalCents?: number;
  /** Odoo's modelled VAT per tax and rate in cents, signed as owed (a refund side reduces it), with the base of the tax. */
  vatByTax?: { tax: string; ratePercent: number; baseCents: number; vatCents: number }[];
}

/**
 * The target's VAT of one tax over the whole file against apaleo's tax per
 * line, both signed as owed (a refund side reduces it), and the days on which
 * they differ.
 */
export interface TargetVatTotal {
  /** The tax as the summary names it. */
  tax: string;
  /** The tax values of the bookings this total covers, to find apaleo's precise VAT of the same bookings in the posting summary. */
  bookingTaxes: readonly string[];
  ratePercent: number;
  /** The bases with the tax in the file, credited positive. */
  baseCents: number;
  /** The VAT the target program computes from the bases. */
  vatCents: number;
  /** apaleo's tax of the same bookings, each rounded to the cent. */
  apaleoVatCents: number;
  /** The days on which `vatCents` and `apaleoVatCents` differ, in date order. */
  days: readonly { date: LocalDate; vatCents: number; apaleoVatCents: number }[];
}

/** What a rendered file holds, for the summary (`TargetWriter.fileFigures`). */
export interface TargetFileFigures {
  vatByTax: readonly TargetVatTotal[];
  entries: number;
  lines: number;
  /** Lines the target added to reach apaleo's gross (rounding cents). */
  roundingLines: number;
}

/** The part of a target the output folder logic uses. */
export type FolderTarget = Pick<TargetWriter<unknown>, 'filePattern' | 'sameContent' | 'advice' | 'revisionOf'>;

/** Appended to the property id in the name of a demo file, so a demo file never looks like a real export in a file list. */
export const DEMO_FILE_MARKER = 'DEMO';

/** The property id as it appears in a file name: `BSP`, or `BSP_DEMO` for a demo file. */
export function fileTag(meta: Pick<TargetFileMeta, 'propertyId' | 'demo'>): string {
  return meta.demo ? `${meta.propertyId}_${DEMO_FILE_MARKER}` : meta.propertyId;
}
