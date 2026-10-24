import { basename, join, resolve } from 'node:path';
import type { CommandContext } from '../cli/context.js';
import { VERSION } from '../cli/version.js';
import { ChartIndex } from '../core/chart.js';
import { abacusUnitKey, abacusUnitOf, abrechnungsartFindings, sharedMandantFindings, type Config, type LoadedConfig } from '../core/config.js';
import { localDateIn, nextDay } from '../core/date.js';
import { FindingsError, UserError } from '../core/errors.js';
import { isErrorFinding, type Finding } from '../core/findings.js';
import type { LedgerLine, SourceAdapter, SourceProperty } from '../core/source.js';
import { abacusTarget } from '../abacus/target.js';
import { checkCoverage, checkUsedMwstCodes, loadMapping, type Mapping } from '../mapping/index.js';
import { buildBookings, journalTotalCents, releaseRateOf, taxByMwstCode, type PostedBooking, type PostingOptions, type PostingResult } from '../posting/index.js';
import { checkAggregates, checkMwstCodeRates, plausibilityFindings } from './checks.js';
import { monthFolder, planOutput, repairCompanions, sha256, writeOutput, type OutputPlan, type WrittenFile } from './output.js';
import { dayRuleFindings, finalFrom, lastFinalDay, splitPeriod, type DateRange, type PeriodPart } from './period.js';
import { renderSummary } from './summary.js';
import type { TargetFileMeta, TargetWriter } from './target.js';
import { ApaleoPermissionError } from '../sources/apaleo/index.js';

export interface ExportRequest {
  period: DateRange;
  propertyIds: readonly string[];
  dryRun: boolean;
  overwrite: boolean;
  /**
   * The scheduler sets this to `schedule.finalAfter`: a part whose last day is
   * not final yet in the property's time zone (see `lastFinalDay`) is held back
   * as `waiting` instead of being written, because apaleo can still add postings
   * for that day until the night audit that closes the following day.
   */
  holdUntilFinal?: { finalAfter: string };
  /** `export --demo`: the file name and the protocol say `DEMO`, so a demo file is never taken for real data. */
  demo?: boolean;
}

export interface ExportDeps {
  loaded: LoadedConfig;
  source: SourceAdapter;
  ctx: CommandContext;
  /** The posting step. Tests replace it to inject defects the plausibility checks must catch. */
  post?: typeof buildBookings;
  /** Called with each property-month as soon as it is done, so a caller can print it before the next one runs. */
  onOutcome?: (outcome: PartOutcome) => void;
  /** The file format to write. Default `DEFAULT_TARGET`; tests pass a fake one. */
  target?: TargetWriter<PostedBooking>;
}

/** The target the export writes when the caller names none. */
export const DEFAULT_TARGET: TargetWriter<PostedBooking> = abacusTarget;

/**
 * A file only has to stay inside one calendar month (one MWST period and one
 * fiscal year of the Mandant): the period is split as if the fiscal year began on 1 January.
 */
export const CALENDAR_YEAR_START = '01-01';

/**
 * - `written`, `replaced`: the file was written (a replaced file is kept beside it).
 * - `unchanged`: the file exists with the same bookings; nothing was written.
 * - `checked`: a dry run found nothing blocking; `plan` says what a real run would do.
 * - `empty`: no bookings in the period, so no file.
 * - `waiting`: `holdUntilFinal` is set and the part is not final yet, so nothing was fetched or written.
 * - `failed`: an `E-` finding stopped the part before writing.
 */
export type PartStatus = 'written' | 'replaced' | 'unchanged' | 'checked' | 'empty' | 'waiting' | 'failed';

export interface PartOutcome {
  propertyId: string;
  part: PeriodPart;
  status: PartStatus;
  findings: Finding[];
  /** The file the part writes or would write. */
  path?: string;
  /** For a dry run: what a real run would do with the file. */
  plan?: OutputPlan['action'];
  bookings: number;
  /** The posting summary as text (dry-run output and protocol file). */
  summary: string;
}

/**
 * Exports every property and calendar month of the period (design decision 3).
 * A blocking finding stops only its own property-month; the others still run.
 */
export async function runExport(request: ExportRequest, deps: ExportDeps): Promise<PartOutcome[]> {
  const parts = splitPeriod(request.period, CALENDAR_YEAR_START);
  const shared = sharedMandantFindings(deps.loaded.config);
  const abrechnungsart = abrechnungsartFindings(deps.loaded.config.abacus);
  const properties = await deps.source.listProperties();
  const outcomes: PartOutcome[] = [];
  for (const propertyId of request.propertyIds) {
    const inputs = new PropertyInputs(propertyId, properties.find((p) => p.id === propertyId), deps);
    for (const part of parts) {
      const notes = [...shared.filter((finding) => concernsProperty(finding, propertyId, deps.loaded.config)), ...abrechnungsart];
      const outcome = await exportPart(part, inputs, request, deps, notes);
      outcomes.push(outcome);
      deps.onOutcome?.(outcome);
    }
  }
  return outcomes;
}

interface MappingFile {
  mapping: Mapping;
  sha256: string;
}

/** What every month of one property shares, each read at most once. */
class PropertyInputs {
  private mappingFile: Promise<MappingFile> | undefined;
  private chart: Promise<ChartIndex> | undefined;

  constructor(
    readonly id: string,
    readonly property: SourceProperty | undefined,
    private readonly deps: ExportDeps,
  ) {}

  get mappingPath(): string {
    const configured = this.deps.loaded.config.properties.find((p) => p.id === this.id)?.mapping;
    return resolve(this.deps.ctx.cwd, configured ?? `mapping-${this.id}.csv`);
  }

  loadMapping(): Promise<MappingFile> {
    this.mappingFile ??= (async () => {
      let bytes = new Uint8Array();
      const readFile = async (path: string) => (bytes = await this.deps.ctx.fs.readFile(path));
      const mapping = await loadMapping(this.mappingPath, { readFile });
      return { mapping, sha256: sha256(bytes) };
    })();
    return this.mappingFile;
  }

  loadChart(): Promise<ChartIndex> {
    this.chart ??= this.deps.source.getChartOfAccounts(this.id).then((accounts) => new ChartIndex(accounts));
    return this.chart;
  }
}

const hasError = (findings: readonly Finding[]) => findings.some(isErrorFinding);

/** Why a scheduled run holds back a part that is not final yet in `timeZone` (see `lastFinalDay`). */
export function notFinalFinding(part: DateRange, timeZone: string, finalAfter: string): Finding {
  return {
    code: 'N-NOT-FINAL',
    message:
      `the period ends ${part.to}. apaleo can still add postings for that day until the night audit that closes ${nextDay(part.to)}, ` +
      `so the period counts as final from ${finalFrom(part.to)} ${finalAfter} in ${timeZone} (schedule.finalAfter). ` +
      'The first scheduled run after that exports it',
  };
}

/** A `W-MANDANT-SHARED` finding concerns the property when the shared Mandant and Geschäftsbereich are its own. */
function concernsProperty(finding: Finding, propertyId: string, config: Config): boolean {
  return finding.value === abacusUnitKey(abacusUnitOf(config.abacus, config.properties, propertyId));
}

async function exportPart(part: PeriodPart, inputs: PropertyInputs, request: ExportRequest, deps: ExportDeps, notes: readonly Finding[]): Promise<PartOutcome> {
  const findings: Finding[] = [...notes];
  const target = deps.target ?? DEFAULT_TARGET;
  let lines: readonly LedgerLine[] = [];
  let result: PostingResult | undefined;
  /** The target's import block, once the file is rendered. */
  let importBlock: string[] | undefined;
  const outcome = (status: PartStatus, extra: Partial<PartOutcome> = {}): PartOutcome => ({
    propertyId: inputs.id,
    part,
    status,
    findings,
    bookings: result?.bookings.length ?? 0,
    summary: renderSummary({
      propertyId: inputs.id,
      part,
      ledgerLines: lines.length,
      bookings: result?.bookings.length ?? 0,
      ...(result ? { summary: result.summary } : {}),
      ...(importBlock ? { importBlock } : {}),
      taxReturnLine: (ratePercent) => target.taxReturnLine(ratePercent),
      findings,
    }),
    ...extra,
  });
  const failed = () => outcome('failed');

  if (!inputs.property) {
    findings.push({
      code: 'E-PROPERTY-UNKNOWN',
      message: `the property ${inputs.id} is not visible to this apaleo custom app. Run "apaleo-abacus properties" to list the ids it can read`,
    });
    return failed();
  }
  findings.push(...currencyFindings(target, deps.loaded.config, inputs.property));
  const { timeZone } = inputs.property;
  const hold = request.holdUntilFinal;
  if (hold && part.to > lastFinalDay(deps.ctx.now(), timeZone, hold.finalAfter)) {
    findings.push(notFinalFinding(part, timeZone, hold.finalAfter));
    return hasError(findings) ? failed() : outcome('waiting');
  }
  const dayRules = dayRuleFindings(part, localDateIn(deps.ctx.now(), timeZone), timeZone);
  findings.push(...dayRules);
  if (hasError(findings)) return failed();

  try {
    const { mapping, sha256: mappingSha256 } = await inputs.loadMapping();
    findings.push(...mapping.findings);
    const [chart, ledger] = await Promise.all([inputs.loadChart(), deps.source.getLedger(inputs.id, part.from, nextDay(part.to))]);
    lines = ledger;
    findings.push(...currencyFindings(target, deps.loaded.config, inputs.property, lines));
    if (hasError(findings)) return failed();
    const { abacus, posting } = deps.loaded.config;
    const options: PostingOptions = { ...posting, mwstCodes: abacus.mwstCodes };

    const coverageOptions = { rateOf: releaseRateOf(lines, chart), mwstCodes: abacus.mwstCodes };
    const coverage = checkCoverage(mapping, lines, chart, coverageOptions);
    // A swapped or unknown MWST-Code passes the posting guard (it compares rates only), and scheduled runs never call mapping check.
    const usedCodes = checkUsedMwstCodes(mapping, lines, chart, coverageOptions);
    result = (deps.post ?? buildBookings)(lines, mapping, chart, options);
    // The posting rules repeat the coverage check's E-UNMAPPED findings.
    findings.push(...coverage, ...usedCodes, ...result.findings.filter((finding) => finding.code !== 'E-UNMAPPED'));
    findings.push(...checkMwstCodeRates(lines, result, { mapping, chart }));
    // The plausibility checks assume a clean posting run; with errors the part fails anyway.
    if (!hasError(findings)) findings.push(...plausibilityFindings(lines, result, { mapping, chart, movements: (booking) => target.movements(booking) }));
    if (deps.loaded.config.checks.aggregates) findings.push(...(await aggregateFindings(deps.source, inputs.id, part, lines, chart)));
    if (hasError(findings)) return failed();
    if (result.bookings.length === 0) {
      findings.push({ code: 'N-NO-BOOKINGS', message: `apaleo has no bookings for ${part.from} to ${part.to}, so no file was written` });
      return outcome('empty');
    }

    const meta: TargetFileMeta = { config: deps.loaded.config, propertyId: inputs.id, part, demo: request.demo === true, createdAt: deps.ctx.now() };
    const { bytes, findings: renderFindings } = target.render(result.bookings, meta);
    findings.push(...renderFindings);
    importBlock = target.importBlock(result.bookings, meta);
    const path = join(monthFolder(deps.ctx.cwd, deps.loaded.config.output.dir, inputs.id, part.month), target.fileName(meta));
    const plan = await planOutput(deps.ctx, target, path, bytes, part, request.overwrite);
    if (plan.action === 'refuse') findings.push(plan.finding);
    if (hasError(findings)) return outcome('failed', { path });
    if (request.dryRun) return outcome('checked', { path, plan: plan.action });
    const companions = (status: PartStatus, fileBytes: Uint8Array): WrittenFile => ({
      path,
      bytes: fileBytes,
      protocol: protocolText(target.protocolTitle, outcome(status, { path }).summary, path, fileBytes, mappingSha256, deps.ctx.now(), request.demo === true),
      entry: {
        from: part.from,
        to: part.to,
        bookings: result?.bookings.length ?? 0,
        journalTotalCents: journalTotalCents(result?.bookings ?? []),
        currency: target.currency(deps.loaded.config),
        taxByMwstCode: taxByMwstCode(result?.bookings ?? []),
        ...target.manifestFields(meta),
        mappingSha256,
        toolVersion: VERSION,
        createdAt: deps.ctx.now().toISOString(),
      },
    });
    if (plan.action === 'unchanged') {
      const repaired = await repairCompanions(deps.ctx, companions('unchanged', plan.previous));
      if (repaired.length > 0) {
        findings.push({
          code: 'N-COMPANIONS-REPAIRED',
          message: `${repaired.join(' and ')} did not match ${basename(path)} (an earlier run was probably interrupted while writing) and was rewritten`,
        });
      }
      return outcome('unchanged', { path });
    }

    const status: PartStatus = plan.action === 'replace' ? 'replaced' : 'written';
    await writeOutput(deps.ctx, plan, companions(status, bytes));
    return outcome(status, { path });
  } catch (error) {
    if (error instanceof FindingsError) findings.push(...error.findings);
    else if (error instanceof UserError) findings.push({ code: 'E-EXPORT', message: error.message });
    else if (isSystemError(error)) findings.push(fileSystemFinding(error, resolve(deps.ctx.cwd, deps.loaded.config.output.dir), request.demo === true));
    else throw error;
    return failed();
  }
}

/**
 * `E-CURRENCY` when the property, or else a ledger line, is not in the currency
 * the target books in (`TargetWriter.currency`). The target would book the
 * amounts without converting them, so the part stops.
 */
function currencyFindings(target: TargetWriter<PostedBooking>, config: Config, property: SourceProperty, lines: readonly LedgerLine[] = []): Finding[] {
  const currency = target.currency(config);
  const why = `${target.advice.currency} This tool does not convert.`;
  if (property.currency !== currency) {
    return [
      {
        code: 'E-CURRENCY',
        message:
          `the property ${property.id} keeps its books in ${property.currency || 'an unknown currency'}, but the export file books in ${currency} only. ` +
          `${why} No apaleo lines were read and no file was written`,
        value: property.currency,
      },
    ];
  }
  const foreign = lines.filter((line) => line.currency !== currency);
  if (foreign.length === 0) return [];
  const others = [...new Set(foreign.map((line) => line.currency))].sort();
  return [
    {
      code: 'E-CURRENCY',
      message:
        `${foreign.length} apaleo line(s) of ${property.id} are in ${others.map((c) => c || 'an unknown currency').join(', ')}, but the export file books in ${currency} only. ` +
        `${why} No file was written`,
      value: others.join(','),
    },
  ];
}

/**
 * The aggregate check is opt-in: a failed request blocks the part. A missing
 * permission gets the permission hint; any other failure (timeout, apaleo
 * server error) asks to try again.
 */
async function aggregateFindings(source: SourceAdapter, propertyId: string, part: PeriodPart, lines: readonly LedgerLine[], chart: ChartIndex): Promise<Finding[]> {
  try {
    return await checkAggregates(source, propertyId, part, lines, chart);
  } catch (error) {
    if (!(error instanceof UserError)) throw error;
    const hint =
      error instanceof ApaleoPermissionError
        ? 'Give the custom app the permission core.subledger_aggregate.create, or set checks.aggregates: false'
        : 'This is not a missing permission: apaleo could not be reached or answered with an error. Try again later, or set checks.aggregates: false to export without this check';
    return [
      {
        code: 'E-AGGREGATE-CHECK',
        message: `the aggregate check (checks.aggregates: true) could not read apaleo's daily aggregates: ${error.message}\n${hint}`,
      },
    ];
  }
}

/** A Node.js system error (EACCES, ENOSPC, EROFS, ...) from the file system. */
export function isSystemError(error: unknown): error is NodeJS.ErrnoException {
  const { code, syscall } = (error ?? {}) as NodeJS.ErrnoException;
  return error instanceof Error && typeof code === 'string' && typeof syscall === 'string';
}

/** The container image runs as the user `node`, uid and gid 1000 (Dockerfile). */
const CONTAINER_UID = 1000;

/**
 * `E-EXPORT` for a file-system error in the output folder `dir`, with the next
 * step: the owner fix for a folder the tool may not write to (most often a
 * `./data` created by root for the container), the mount for a read-only one.
 */
export function fileSystemFinding(error: NodeJS.ErrnoException, dir: string, demo = false): Finding {
  const hint =
    demo && (error.code === 'EACCES' || error.code === 'EPERM' || error.code === 'EROFS')
      ? `The demo writes into ${dir}, below the working directory, and that folder is not writable. Run it from a writable folder. ` +
        `In the Docker image the working directory /config is not writable for the container user: add -w /data and mount a data folder owned by uid ${CONTAINER_UID} (see docs/docker.md)`
      : error.code === 'EACCES' || error.code === 'EPERM'
      ? `The output folder ${dir} (or a folder in it) belongs to another user. Give it to the user that runs the export. ` +
        `With Docker, the container runs as uid ${CONTAINER_UID}: run "sudo chown -R ${CONTAINER_UID}:${CONTAINER_UID} data" next to docker-compose.example.yml`
      : error.code === 'EROFS'
        ? `The output folder ${dir} is on a read-only file system. With Docker, mount the data volume without ":ro"`
        : error.code === 'ENOSPC'
          ? `The disk that holds the output folder ${dir} is full. Free some space`
          : `Check that the output folder ${dir} is writable and the disk has space`;
  return {
    code: 'E-EXPORT',
    message: `the file system refused a step of the export: ${error.message}\n${hint}, then run again. The other properties and months still ran`,
  };
}

/** The first line of a demo protocol, so it never looks like a real export. */
export const DEMO_MARKER = 'DEMO';

/** The line after `DEMO_MARKER` in a demo protocol, and the first line of the demo's output (`export --demo`). */
export const DEMO_NOTICE =
  'DEMO: bundled sample data of the fabricated "Hotel Beispiel", not read from apaleo. Every Text1 starts with "DEMO ". ' +
  'Never import a demo file into a real Abacus Mandant.';

function protocolText(title: string, summary: string, path: string, bytes: Uint8Array, mappingSha256: string, now: Date, demo: boolean): string {
  return [
    ...(demo ? [DEMO_MARKER, DEMO_NOTICE] : []),
    `${title}. No warranty, not tax advice: have your Treuhänder check the bookings.`,
    '',
    summary,
    `File: ${basename(path)}`,
    `SHA-256: ${sha256(bytes)}`,
    `Mapping SHA-256: ${mappingSha256}`,
    `Tool: apaleo-abacus ${VERSION}`,
    `Created: ${now.toISOString()}`,
    '',
  ].join('\n');
}
