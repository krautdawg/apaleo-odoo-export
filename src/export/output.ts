import { createHash } from 'node:crypto';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { UserError } from '../core/errors.js';
import type { Finding } from '../core/findings.js';
import type { LocalDate } from '../core/date.js';
import type { DateRange } from './period.js';
import type { FolderTarget, TargetManifestFields } from './target.js';
import type { CommandContext } from '../cli/context.js';
import { readIfExists, replaceKeepingBackup, withFolderLock, writeFileAtomic } from '../cli/files.js';

/**
 * The output folder is the export's only state (design decisions 6 and 7):
 * `<output.dir>/<propertyId>/<YYYY-MM>/` holds the target's files, their protocols
 * and `manifest.json`. A re-run compares the file on disk through the target's
 * `sameContent`, so it works even when the manifest was deleted. Which names
 * belong to the target comes from its `filePattern`, also for manifest entries; the
 * advice in a refusal comes from its `advice`. Nothing here knows a format or the
 * program a file is imported into.
 */

export const MANIFEST_FILE = 'manifest.json';

/**
 * Whether `name` matches the target's `filePattern`. A `g` or `y` flag would make
 * `exec` and `test` continue from the last match, so the pattern is used without them.
 */
function matchTargetFile(target: FolderTarget, name: string): RegExpExecArray | null {
  const pattern = target.filePattern;
  const stateless = pattern.global || pattern.sticky ? new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '')) : pattern;
  return stateless.exec(name);
}

/** One file the export wrote or replaced. Entries for replaced files keep only what is known about them. */
/** The target's own fields (where the file books into) come from `TargetWriter.manifestFields`. */
export interface ManifestEntry extends TargetManifestFields {
  file: string;
  status: 'current' | 'replaced';
  from: LocalDate;
  to: LocalDate;
  /** SHA-256 of the whole file: the file is deterministic, so this alone identifies its content. */
  sha256: string;
  bookings?: number;
  /**
   * The journal total in cents: the sum of the gross amounts, which the accounting program shows
   * as both Soll and Haben of the imported bookings (each booking moves its gross amount once to each side).
   */
  journalTotalCents?: number;
  /** The currency of every amount of the file (the Leitwährung). */
  currency?: string;
  /**
   * The tax of the bookings per MWST-Code and rate in cents, signed as owed: positive for MWST the
   * hotel owes, negative for a correction that reduces it. A target's import block may print the
   * tax as signed in its file instead (docs/export.md says which sign each place uses).
   */
  taxByMwstCode?: TaxAtCode[];
  mappingSha256?: string;
  toolVersion?: string;
  createdAt?: string;
  replacedAt?: string;
  replacedBy?: string;
}

/** The tax of the bookings with one MWST-Code at one rate. */
export interface TaxAtCode {
  mwstCode: string;
  ratePercent: number;
  taxCents: number;
}

/**
 * `manifest.json`. Reading keeps whatever an entry holds and uses only the fields
 * above, so a field an older or newer version wrote (such as the `bodySha256` of
 * earlier versions, or their `taxByRate`) is ignored and kept as it is.
 */
export interface Manifest {
  files: ManifestEntry[];
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** What writing a file would do, decided before anything is written. */
export type OutputPlan =
  | { action: 'write' }
  | { action: 'unchanged'; previous: Uint8Array }
  | { action: 'replace'; previous: Uint8Array; backup: string }
  | { action: 'refuse'; finding: Finding };

/** `20261020T080000Z`: the time in a backup file name. */
function compactTimestamp(at: Date): string {
  return at.toISOString().replace(/\.\d{3}/, '').replace(/[-:]/g, '');
}

/** `<base>.replaced-<timestamp><extension>`, beside the file. */
function replacedName(path: string, at: Date): string {
  const extension = extname(path);
  return `${path.slice(0, path.length - extension.length)}.replaced-${compactTimestamp(at)}${extension}`;
}

const compactDate = (date: LocalDate) => date.replaceAll('-', '');

/** `<output.dir>/<propertyId>/<YYYY-MM>/`, resolved against the working directory: the folder of one property-month. */
export function monthFolder(cwd: string, outputDir: string, propertyId: string, month: string): string {
  return join(resolve(cwd, outputDir), propertyId, month);
}

/** The current files of the target in `folder` with the first and last day in their name (`YYYYMMDD`), sorted by name. */
async function targetFiles(ctx: CommandContext, folder: string, target: FolderTarget): Promise<{ name: string; from: string; to: string }[]> {
  let names: string[];
  try {
    names = await ctx.fs.readdir(folder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return names.sort().flatMap((name) => {
    const match = matchTargetFile(target, name);
    return match ? [{ name, from: match[1] ?? '', to: match[2] ?? '' }] : [];
  });
}

/**
 * The name of the current file of the target for exactly `period` in `folder`, as recorded
 * in `manifest.json` or present on disk, or undefined. Reads only the local
 * folder. A manifest that cannot be read is ignored here; the export reports it.
 */
export async function exportedFile(ctx: CommandContext, folder: string, period: DateRange, target: FolderTarget): Promise<string | undefined> {
  const manifest = await readManifest(ctx, join(folder, MANIFEST_FILE)).catch((): Manifest => ({ files: [] }));
  const recorded = manifest.files.find(
    (entry) => entry.status === 'current' && entry.from === period.from && entry.to === period.to && matchTargetFile(target, entry.file) !== null,
  );
  if (recorded) return recorded.file;
  const [from, to] = [compactDate(period.from), compactDate(period.to)];
  return (await targetFiles(ctx, folder, target)).find((file) => file.from === from && file.to === to)?.name;
}

/** Another current file of the target in the folder whose period overlaps `period`. */
async function overlappingFile(ctx: CommandContext, path: string, period: DateRange, target: FolderTarget): Promise<string | undefined> {
  const [from, to] = [compactDate(period.from), compactDate(period.to)];
  const files = await targetFiles(ctx, dirname(path), target);
  return files.find((file) => file.name !== basename(path) && file.from <= to && from <= file.to)?.name;
}

/**
 * Decides what to do with `path`: write a new file, leave an existing one that
 * the target counts as the same content alone, replace it (`overwrite`), or refuse. Also refuses when
 * another file in the folder covers some of the same days, because importing
 * both would book those days twice.
 */
export async function planOutput(
  ctx: CommandContext,
  target: FolderTarget,
  path: string,
  bytes: Uint8Array,
  period: DateRange,
  overwrite: boolean,
): Promise<OutputPlan> {
  const overlap = await overlappingFile(ctx, path, period, target);
  if (overlap) {
    return {
      action: 'refuse',
      finding: {
        code: 'E-PERIOD-OVERLAP',
        message: `${join(dirname(path), overlap)} already covers some of the days ${period.from} to ${period.to}. ${target.advice.overlap}`,
      },
    };
  }
  const previous = await readIfExists(ctx, path);
  if (!previous) return { action: 'write' };
  if (target.sameContent(previous, bytes)) return { action: 'unchanged', previous };
  if (overwrite) return { action: 'replace', previous, backup: replacedName(path, ctx.now()) };
  return {
    action: 'refuse',
    finding: {
      code: 'E-FILE-EXISTS',
      message:
        `${path} already exists with other content: the apaleo data, the mapping or the config changed since it was written, ` +
        `for example by a late posting. ${target.advice.reimport} Then run again with --overwrite: ` +
        `the old file is kept as <name>.replaced-<timestamp>${extname(path)}.` +
        (target.advice.afterOverwrite ? ` ${target.advice.afterOverwrite}` : ''),
    },
  };
}

export interface WrittenFile {
  path: string;
  bytes: Uint8Array;
  protocol: string;
  /** The manifest entry for the new file, without the hashes (they are computed here). */
  entry: Omit<ManifestEntry, 'file' | 'status' | 'sha256'>;
}

/** Protocol file beside an export file: `<base>.protokoll.txt`. */
export function protocolPath(path: string): string {
  return `${path.slice(0, path.length - extname(path).length)}.protokoll.txt`;
}

const sameBytes = (a: Uint8Array | undefined, b: Uint8Array | undefined) =>
  a === undefined || b === undefined ? a === b : a.length === b.length && sha256(a) === sha256(b);

/**
 * Carries out a `write` or `replace` plan: export file, protocol, then the
 * manifest entry (or entries). Holds the folder lock, and first checks that the
 * file on disk is still what the plan saw, so two runs on the same
 * property-month never both write or replace the file.
 */
export async function writeOutput(ctx: CommandContext, plan: OutputPlan, file: WrittenFile): Promise<void> {
  if (plan.action !== 'write' && plan.action !== 'replace') throw new TypeError(`Nothing to write for plan ${plan.action}`);
  const { path, bytes } = file;
  await withFolderLock(ctx, dirname(path), async () => {
    const current = await readIfExists(ctx, path);
    if (!sameBytes(current, plan.action === 'replace' ? plan.previous : undefined)) {
      throw new UserError(`${path} changed while this run was checking it, probably by another apaleo-abacus run. Nothing was written for it; run again`);
    }
    const protocol = protocolPath(path);
    const manifestPath = join(dirname(path), MANIFEST_FILE);
    const manifest = await readManifest(ctx, manifestPath);
    const name = basename(path);
    const previousEntry = manifest.files.find((entry) => entry.file === name);
    const files = manifest.files.filter((entry) => entry.file !== name);

    if (plan.action === 'replace') {
      await replaceKeepingBackup(ctx, path, plan.backup, bytes);
      const oldProtocol = await readIfExists(ctx, protocol);
      if (oldProtocol) await ctx.fs.rename(protocol, protocolPath(plan.backup));
      files.push({
        ...(previousEntry ?? { from: file.entry.from, to: file.entry.to }),
        file: basename(plan.backup),
        status: 'replaced',
        sha256: sha256(plan.previous),
        replacedAt: ctx.now().toISOString(),
        replacedBy: name,
      });
    } else {
      await writeFileAtomic(ctx, path, bytes);
    }
    await writeFileAtomic(ctx, protocol, new TextEncoder().encode(file.protocol));
    files.push(currentEntry(file));
    await writeManifest(ctx, manifestPath, files);
  });
}

/**
 * For an `unchanged` file: rewrites its protocol and manifest entry when they
 * are missing or describe another file, as after a run that was interrupted
 * between writing the export file and its companions. `file.bytes` are the bytes
 * on disk. Returns the names of the files it rewrote (empty when all was in order).
 */
export async function repairCompanions(ctx: CommandContext, file: WrittenFile): Promise<string[]> {
  const { path, bytes } = file;
  const protocol = protocolPath(path);
  const manifestPath = join(dirname(path), MANIFEST_FILE);
  const name = basename(path);
  const hash = sha256(bytes);
  const protocolOk = async () => new TextDecoder().decode((await readIfExists(ctx, protocol)) ?? new Uint8Array()).includes(`\nSHA-256: ${hash}\n`);
  const entryOk = (manifest: Manifest) => manifest.files.some((entry) => entry.file === name && entry.status === 'current' && entry.sha256 === hash);
  // Read-only first: the lock is taken only when something needs writing.
  if ((await protocolOk()) && entryOk(await readManifest(ctx, manifestPath))) return [];

  return withFolderLock(ctx, dirname(path), async () => {
    if (!sameBytes(await readIfExists(ctx, path), bytes)) {
      throw new UserError(`${path} changed while this run was checking it, probably by another apaleo-abacus run. Nothing was written for it; run again`);
    }
    const repaired: string[] = [];
    if (!(await protocolOk())) {
      await writeFileAtomic(ctx, protocol, new TextEncoder().encode(file.protocol));
      repaired.push(basename(protocol));
    }
    const manifest = await readManifest(ctx, manifestPath);
    if (!entryOk(manifest)) {
      await writeManifest(ctx, manifestPath, [...manifest.files.filter((entry) => entry.file !== name), currentEntry(file)]);
      repaired.push(MANIFEST_FILE);
    }
    return repaired;
  });
}

function currentEntry(file: WrittenFile): ManifestEntry {
  return { file: basename(file.path), status: 'current', sha256: sha256(file.bytes), ...file.entry };
}

async function writeManifest(ctx: CommandContext, path: string, files: ManifestEntry[]): Promise<void> {
  await writeFileAtomic(ctx, path, new TextEncoder().encode(`${JSON.stringify({ files }, null, 2)}\n`));
}

async function readManifest(ctx: CommandContext, path: string): Promise<Manifest> {
  const bytes = await readIfExists(ctx, path);
  if (!bytes) return { files: [] };
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Manifest>;
    if (Array.isArray(parsed.files)) return { files: parsed.files };
  } catch {
    // Reported below.
  }
  throw new UserError(`${path} is not a manifest written by apaleo-abacus. Move it away and run again; nothing was changed.`);
}
