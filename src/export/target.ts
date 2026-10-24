import type { Config } from '../core/config.js';
import type { Finding } from '../core/findings.js';
import type { PeriodPart } from './period.js';

/** What a target needs to name and render the file of one property and period. */
export interface TargetFileMeta {
  /** The whole config: a target reads its own section (for example `abacus`). */
  config: Config;
  propertyId: string;
  part: PeriodPart;
  /** `export --demo`: the file name and the file itself must say so. */
  demo: boolean;
  createdAt: Date;
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
  /** Short id, for example `abacus`. */
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
  fileName(meta: TargetFileMeta): string;
  render(bookings: readonly B[], meta: TargetFileMeta): RenderedFile;
  /** True when `existing` and `next` differ at most in what changes on every run (such as a creation time). */
  sameContent(existing: Uint8Array, next: Uint8Array): boolean;
  /**
   * The movement model of one booking: the signed amount (Soll positive) each
   * account of the booking moves by in the target, without the tax leg on the
   * target's own tax account. The plausibility checks compare it with apaleo.
   */
  movements(booking: B): [account: string, cents: number][];
  /**
   * The import block of the protocol and the dry run: what the Treuhänder checks
   * before importing the file (its name, number of lines, the settings of the
   * program it is imported into). One string per line, the first a title.
   */
  importBlock(bookings: readonly B[], meta: TargetFileMeta): string[];
  /**
   * The line of the tax return the tax at `ratePercent` is declared in, as the
   * summary shows it after the MWST-Code and rate (for example `Ziffer 343`), or
   * undefined for a rate the target knows no line for.
   */
  taxReturnLine(ratePercent: number): string | undefined;
  /**
   * The target's own fields of the file's manifest entry: where the file books
   * into in the target program (for Abacus the Mandant and Geschäftsbereich).
   * Read from the same settings as `importBlock`, so the manifest and the
   * protocol name the same unit. A target without such settings returns `{}`.
   */
  manifestFields(meta: TargetFileMeta): TargetManifestFields;
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
  /** After "<file> already covers some of the days …": why not to import both, and what to do with the other file. */
  overlap: string;
  /** Before the `--overwrite` hint: why not to import both files, and how to undo an imported old file first. */
  reimport: string;
  /** After the `--overwrite` hint, when the target has a case in which an imported file cannot be undone. */
  afterOverwrite?: string;
}

/**
 * The manifest fields a target may fill (`TargetWriter.manifestFields`). They
 * are named after the Abacus settings because Abacus is the only target; a
 * new target with other settings adds its own optional fields here.
 */
export interface TargetManifestFields {
  /** The Abacus Mandant the file books into. */
  mandant?: string;
  /** The Abacus Geschäftsbereich the file books into. */
  geschaeftsbereich?: number;
}

/** The part of a target the output folder logic uses. */
export type FolderTarget = Pick<TargetWriter<unknown>, 'filePattern' | 'sameContent' | 'advice'>;

/** Appended to the property id in the name of a demo file, so a demo file never looks like a real export in a file list. */
export const DEMO_FILE_MARKER = 'DEMO';

/** The property id as it appears in a file name: `BSP`, or `BSP_DEMO` for a demo file. */
export function fileTag(meta: Pick<TargetFileMeta, 'propertyId' | 'demo'>): string {
  return meta.demo ? `${meta.propertyId}_${DEMO_FILE_MARKER}` : meta.propertyId;
}
