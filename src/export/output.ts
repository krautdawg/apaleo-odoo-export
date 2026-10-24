import { createHash } from 'node:crypto';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { UserError } from '../core/errors.js';
import type { Finding } from '../core/findings.js';
import type { LocalDate } from '../core/date.js';
import type { DateRange } from './period.js';
import type { FolderTarget, TargetFileMeta, TargetManifestFields } from './target.js';
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

/** `.replaced-<timestamp>` before the extension: the mark of a file replaced with `--overwrite`. */
const REPLACED_MARK = /\.replaced-\d{8}T\d{6}Z(?=\.[^.]*$|$)/;

/**
 * A file of the target, current or replaced (named by the file it was), with its
 * first and last day (`YYYYMMDD`) and its series: the name with both days blanked
 * out. Files of one series carry the same identity apart from their days (such
 * as the property and a demo marker), so their entries share ids in the target
 * for the days they share. Undefined for any other file.
 */
function seriesFile(target: FolderTarget, name: string): { from: string; to: string; series: string } | undefined {
  const original = name.replace(REPLACED_MARK, '');
  const pattern = target.filePattern;
  const match = new RegExp(pattern.source, `${pattern.flags.replace(/[gyd]/g, '')}d`).exec(original);
  const [from, to] = [match?.[1], match?.[2]];
  const [first, last] = [match?.indices?.[1], match?.indices?.[2]];
  if (!from || !to || !first || !last) return undefined;
  const series = [...original];
  for (const [start, end] of [first, last]) series.fill('#', start, end);
  return { from, to, series: series.join('') };
}

/** One file the export wrote or replaced. Entries for replaced files keep only what is known about them. */
/** The target's own fields (where the file books into) come from `TargetWriter.manifestFields`. */
export interface ManifestEntry extends TargetManifestFields {
  file: string;
  /**
   * `current`: the file is (or was last seen) in the folder under `file`.
   * `replaced`: kept as the `.replaced-<timestamp>` backup `file` by `--overwrite`.
   * `removed`: the file was no longer in the folder when a later export wrote a
   * new file under the same name; the entry keeps its revision on record.
   */
  status: 'current' | 'replaced' | 'removed';
  from: LocalDate;
  to: LocalDate;
  /** SHA-256 of the whole file: the file is deterministic, so this alone identifies its content. */
  sha256: string;
  /** The number of booked apaleo lines. */
  bookings?: number;
  /** The currency of every amount of the file (the company currency). */
  currency?: string;
  /** 1 for the first file of a period, N + 1 for the file that replaced revision N. */
  revision?: number;
  mappingSha256?: string;
  toolVersion?: string;
  createdAt?: string;
  replacedAt?: string;
  replacedBy?: string;
  removedAt?: string;
}

/**
 * `manifest.json`. Reading keeps whatever an entry holds and uses only the fields
 * above, so a field an older or newer version wrote (such as the `bodySha256` of
 * earlier versions, or the fields of the former target) is ignored and kept as it is.
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
  | { action: 'replace'; previous: Uint8Array; backup: string; previousRevision: number; revision: number }
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
 * The revision of the current file at `path`, or undefined without one: from
 * its entry in `manifest.json` when that entry describes the bytes on disk,
 * else read back from the file by the target (`revisionOf`), else 1. The file
 * of a re-run is rendered for this revision, so an unchanged re-run stays
 * byte-identical, and a replacement gets the next one.
 */
export async function existingRevision(ctx: CommandContext, target: FolderTarget, path: string): Promise<number | undefined> {
  const bytes = await readIfExists(ctx, path);
  if (!bytes) return undefined;
  const manifest = await readManifest(ctx, join(dirname(path), MANIFEST_FILE));
  const hash = sha256(bytes);
  const entry = manifest.files.find((file) => file.file === basename(path) && file.status === 'current' && file.sha256 === hash);
  return validRevision(entry?.revision) ?? target.revisionOf(bytes) ?? 1;
}

/**
 * The highest revision of any file of the same series as `path` (current,
 * replaced or removed) whose days overlap `period`: from `manifest.json` and from
 * the files in the folder (the current ones and the `.replaced-<timestamp>`
 * backups, read back by `revisionOf`, 1 for a file without a readable revision).
 * A replaced file of revision N counts as N + 1: a file of that revision replaced
 * it, even when that file and the manifest are gone. Undefined when no file ever
 * covered any of these days.
 */
async function highestEarlierRevision(ctx: CommandContext, target: FolderTarget, path: string, period: DateRange): Promise<number | undefined> {
  const folder = dirname(path);
  const own = seriesFile(target, basename(path));
  if (!own) return undefined;
  const [from, to] = [compactDate(period.from), compactDate(period.to)];
  const overlaps = (file: { from: string; to: string; series: string } | undefined) => file !== undefined && file.series === own.series && file.from <= to && from <= file.to;
  const revisions: number[] = [];
  const manifest = await readManifest(ctx, join(folder, MANIFEST_FILE));
  for (const entry of manifest.files) {
    const file = seriesFile(target, entry.file);
    if (!file) continue;
    const days = typeof entry.from === 'string' && typeof entry.to === 'string' ? { ...file, from: compactDate(entry.from), to: compactDate(entry.to) } : file;
    if (overlaps(days)) revisions.push((validRevision(entry.revision) ?? 1) + (entry.status === 'replaced' ? 1 : 0));
  }
  let names: string[] = [];
  try {
    names = await ctx.fs.readdir(folder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  for (const name of names) {
    if (!overlaps(seriesFile(target, name))) continue;
    const bytes = await readIfExists(ctx, join(folder, name));
    if (bytes) revisions.push((target.revisionOf(bytes) ?? 1) + (REPLACED_MARK.test(name) ? 1 : 0));
  }
  return revisions.length > 0 ? Math.max(...revisions) : undefined;
}

const validRevision = (value: unknown): number | undefined => (typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : undefined);

/** The revision to render the file of a period for, and the one a replacement gets. */
export interface Revisions {
  /**
   * The revision of the file at the path (`existingRevision`), so an unchanged
   * re-run stays byte-identical. Without one, one more than the highest
   * revision of any earlier file of these days (moved away, deleted, replaced, or
   * covering some of the days), so the new file never reuses External IDs an
   * earlier file brought into the target program; 1 when no file ever did.
   */
  revision: number;
  /** For `--overwrite`: one more than the highest revision of the file at the path and every earlier file of these days. */
  next: number;
}

export async function revisionsFor(ctx: CommandContext, target: FolderTarget, path: string, period: DateRange): Promise<Revisions> {
  const current = await existingRevision(ctx, target, path);
  const highest = Math.max(current ?? 0, (await highestEarlierRevision(ctx, target, path, period)) ?? 0);
  return current === undefined ? { revision: highest + 1, next: highest + 2 } : { revision: current, next: highest + 1 };
}

/** What `planOutput` needs to know about the file besides its bytes. */
export interface PlanOptions {
  /** `--overwrite`: replace a file with other content. */
  overwrite: boolean;
  file: Pick<TargetFileMeta, 'propertyId' | 'demo'>;
  /** The revision the bytes were rendered for (`Revisions.revision`). */
  revision: number;
  /** The revision a replacement gets (`Revisions.next`). */
  nextRevision: number;
}

/**
 * Decides what to do with `path`: write a new file, leave an existing one that
 * the target counts as the same content alone, replace it (`overwrite`, with
 * the next revision), or refuse. Also refuses when another file in the folder
 * covers some of the same days, because importing both would book those days twice.
 */
export async function planOutput(ctx: CommandContext, target: FolderTarget, path: string, bytes: Uint8Array, period: DateRange, options: PlanOptions): Promise<OutputPlan> {
  const overlap = await overlappingFile(ctx, path, period, target);
  if (overlap) {
    return {
      action: 'refuse',
      finding: {
        code: 'E-PERIOD-OVERLAP',
        message: `${join(dirname(path), overlap)} already covers some of the days ${period.from} to ${period.to}. ${target.advice.overlap({ ...options.file, revision: options.revision })}`,
      },
    };
  }
  const previous = await readIfExists(ctx, path);
  if (!previous) return { action: 'write' };
  if (target.sameContent(previous, bytes)) return { action: 'unchanged', previous };
  if (options.overwrite) return { action: 'replace', previous, backup: replacedName(path, ctx.now()), previousRevision: options.revision, revision: options.nextRevision };
  return {
    action: 'refuse',
    finding: {
      code: 'E-FILE-EXISTS',
      message:
        `${path} already exists with other content: the apaleo data, the mapping or the config changed since it was written, ` +
        `for example by a late posting. ${target.advice.reimport({ ...options.file, revision: options.nextRevision })} Then run again with --overwrite: ` +
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
      throw new UserError(`${path} changed while this run was checking it, probably by another apaleo-odoo run. Nothing was written for it; run again`);
    }
    const protocol = protocolPath(path);
    const manifestPath = join(dirname(path), MANIFEST_FILE);
    const manifest = await readManifest(ctx, manifestPath);
    const name = basename(path);
    // Entries of earlier files under this name that were removed or replaced stay on record.
    const isCurrent = (entry: ManifestEntry) => entry.file === name && entry.status === 'current';
    const previousEntry = manifest.files.find(isCurrent);
    const files = manifest.files.filter((entry) => !isCurrent(entry));

    if (plan.action === 'replace') {
      await replaceKeepingBackup(ctx, path, plan.backup, bytes);
      const oldProtocol = await readIfExists(ctx, protocol);
      if (oldProtocol) await ctx.fs.rename(protocol, protocolPath(plan.backup));
      files.push({
        ...(previousEntry ?? { from: file.entry.from, to: file.entry.to }),
        revision: plan.previousRevision,
        file: basename(plan.backup),
        status: 'replaced',
        sha256: sha256(plan.previous),
        replacedAt: ctx.now().toISOString(),
        replacedBy: name,
      });
    } else {
      await writeFileAtomic(ctx, path, bytes);
      // The file of the entry was no longer in the folder: keep its revision on record.
      if (previousEntry) files.push({ ...previousEntry, status: 'removed', removedAt: ctx.now().toISOString() });
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
      throw new UserError(`${path} changed while this run was checking it, probably by another apaleo-odoo run. Nothing was written for it; run again`);
    }
    const repaired: string[] = [];
    if (!(await protocolOk())) {
      await writeFileAtomic(ctx, protocol, new TextEncoder().encode(file.protocol));
      repaired.push(basename(protocol));
    }
    const manifest = await readManifest(ctx, manifestPath);
    if (!entryOk(manifest)) {
      await writeManifest(ctx, manifestPath, [...manifest.files.filter((entry) => !(entry.file === name && entry.status === 'current')), currentEntry(file)]);
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
  throw new UserError(`${path} is not a manifest written by apaleo-odoo. Move it away and run again; nothing was changed.`);
}
