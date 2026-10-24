import type { ChartIndex } from '../core/chart.js';
import { REPORT_PROBLEM_HINT } from '../core/errors.js';
import type { Finding } from '../core/findings.js';
import { formatCents } from '../core/money.js';
import { ACCOUNT_TYPES, type AccountRef, type LedgerLine } from '../core/source.js';
import { KMU_SAMPLE_CODES } from './kmu-sample-codes.js';
import { resolve } from './resolve.js';
import { DEFAULT_MWST_CODES, MWST_CODE_RATES, shippedTemplate, templateWildcard, type MwstCodes } from './template.js';
import {
  ANY_TYPE,
  KOST_TYPES,
  NO_TAX_TYPES,
  OUTPUT_TAX_TYPES,
  VAT_ACCOUNT_TYPES,
  VAT_RELEVANT_TYPES,
  WILDCARD,
  mwstCodeOf,
  parsePercent,
  rowRate,
  type Mapping,
  type MappingRow,
} from './types.js';

export interface CheckMappingOptions {
  /** `abacus.mwstCodes`: which codes the tool knows and the rate each stands for. Default 311, 312, 313. */
  mwstCodes?: MwstCodes | undefined;
}

const KNOWN_TYPES: ReadonlySet<string> = new Set([...ACCOUNT_TYPES, ANY_TYPE]);

/** The MWST rates Swiss law knows today (MWSTG Art. 25, since 2024-01-01). */
export const SWISS_VAT_RATES: readonly number[] = [0, 2.6, 3.8, 8.1];

/** The rates in force until 2023-12-31, with what they were. */
const PRE_2024_RATES: ReadonlyMap<number, string> = new Map([
  [7.7, 'the Normalsatz'],
  [3.7, 'the Sondersatz Beherbergung'],
  [2.5, 'the reduzierter Satz'],
]);

const ACCOUNT = /^\d{1,11}$/;
const KOST = /^\d{1,11}$/;
const MWST_CODE = /^[A-Za-z0-9]{1,3}$/;

const percents = (rates: readonly number[]) => rates.map((rate) => `${rate} %`).join(', ');

/**
 * Offline validation of a loaded mapping: account format, MWST-Code format and
 * placement, MWST-Code and rate together, configured codes at their own rate,
 * Swiss rates, `kost`, untaxed revenue and the row's rate against the apaleo
 * rate. Structural problems (duplicates, forbidden wildcards) already fail `loadMapping`.
 */
export function checkMapping(mapping: Mapping, options: CheckMappingOptions = {}): Finding[] {
  const findings: Finding[] = [];
  const ignored = mapping.rows.filter((row) => VAT_ACCOUNT_TYPES.has(row.apaleoType));
  if (ignored.length > 0) {
    findings.push({
      code: 'N-VAT-ROW-IGNORED',
      message:
        `${ignored.length} row(s) for Vat or VatOnLiabilities accounts (${ignored.map((r) => `line ${r.line}`).join(', ')}) ` +
        'are ignored: those lines are always skipped because Abacus books the MWST from the TaxData of the revenue or deposit line',
    });
  }
  const codes = options.mwstCodes ?? DEFAULT_MWST_CODES;
  for (const row of mapping.rows) {
    if (!VAT_ACCOUNT_TYPES.has(row.apaleoType)) findings.push(...checkRow(row, codes));
  }
  return findings;
}

/** The `checkMapping` warnings about a row's MWST-Code that the export repeats for the rows it uses. */
export const USED_ROW_MWST_WARNINGS: ReadonlySet<string> = new Set(['W-MWST-CODE-RATE', 'W-MWST-CODE-UNCHECKED']);

/**
 * `W-MWST-CODE-RATE` and `W-MWST-CODE-UNCHECKED` for the mapping rows the lines of a
 * period actually resolve to, one finding per warning that names every row it
 * concerns (`lines 3, 6: ...`). The posting guard compares rates only,
 * so a swapped configured code (311 at 3.8 %) or a Vorsteuer code (111) would reach
 * the file silently; the export and schedule runs never call `mapping check`, so
 * they report these warnings in the dry run and the protocol themselves.
 */
export function checkUsedMwstCodes(mapping: Mapping, lines: readonly LedgerLine[], chart: ChartIndex | undefined, options: CoverageOptions): Finding[] {
  const used = new Map<number, MappingRow>();
  for (const line of lines) {
    if (VAT_ACCOUNT_TYPES.has(line.debit.type) || VAT_ACCOUNT_TYPES.has(line.credit.type)) continue;
    const rate = options.rateOf(line);
    for (const account of [line.debit, line.credit]) {
      const row = resolve(mapping, account, { rate, ...(chart ? { chart } : {}) });
      if (row && row.abacusAccount !== '' && mwstCodeOf(row) !== undefined) used.set(row.line, row);
    }
  }
  const codes = options.mwstCodes ?? DEFAULT_MWST_CODES;
  const merged = new Map<string, { finding: Finding; lines: number[] }>();
  for (const row of [...used.values()].sort((a, b) => a.line - b.line)) {
    for (const finding of checkRow(row, codes)) {
      if (!USED_ROW_MWST_WARNINGS.has(finding.code)) continue;
      const body = finding.message.slice(`line ${row.line}: `.length);
      const key = `${finding.code}\u0000${body}`;
      const entry = merged.get(key) ?? { finding: { ...finding, message: body }, lines: [] };
      entry.lines.push(row.line);
      merged.set(key, entry);
    }
  }
  return [...merged.values()].map(({ finding, lines }) => ({
    ...finding,
    message: `${lines.length === 1 ? 'line' : 'lines'} ${lines.join(', ')} of the mapping file: ${finding.message}`,
  }));
}

/** The configured name of a code (`normal`, `reduziert`, `beherbergung`), or undefined for any other code. */
function configuredName(code: string, codes: MwstCodes): keyof MwstCodes | undefined {
  return (Object.keys(codes) as (keyof MwstCodes)[]).find((name) => codes[name] === code);
}

const CODE_LABELS: Readonly<Record<keyof MwstCodes, string>> = { normal: 'the Normalsatz', reduziert: 'the reduzierter Satz', beherbergung: 'Beherbergung' };

/** `W-MWST-CODE-UNCHECKED`: the Ziffer of a known KMU sample code, and its note. */
function uncheckedMessage(code: string, codes: MwstCodes): string {
  const configured = `${codes.normal}, ${codes.reduziert} and ${codes.beherbergung}`;
  const sample = KMU_SAMPLE_CODES[code];
  const known = sample
    ? ` In the Abacus KMU sample Mandant, ${code} is "${sample.designation}" (${sample.ziffer} of the MWST-Abrechnung)${sample.note ? `: ${sample.note}` : ''}.`
    : '';
  return (
    `the tool does not know the MWST-Code ${code} (it checks only the configured abacus.mwstCodes ${configured}).${known} ` +
    "Confirm with your Treuhänder that it is an Umsatzsteuer code of the Mandant's MWST-Tabelle"
  );
}

function checkRow(row: MappingRow, codes: MwstCodes): Finding[] {
  const where = `line ${row.line}`;
  const findings: Finding[] = [];
  const add = (code: string, field: string, value: string, message: string) => findings.push({ code, message: `${where}: ${message}`, field, value });
  if (!KNOWN_TYPES.has(row.apaleoType)) {
    add('W-UNKNOWN-TYPE', 'apaleo_type', row.apaleoType, `apaleo_type "${row.apaleoType}" is not an apaleo account type (${ACCOUNT_TYPES.join(', ')})`);
  }
  for (const [field, text] of [['apaleo_vat_percent', row.apaleoVatPercent], ['mwst_percent', row.mwstPercent]] as const) {
    if (Number.isNaN(parsePercent(text) ?? 0)) add('E-VAT-PERCENT', field, text, `${field} "${text}" is not a percentage`);
  }
  if (row.kost !== '' && !KOST.test(row.kost)) {
    add('E-KOST-FORMAT', 'kost', row.kost, `kost "${row.kost}" must be a Kostenstelle of 1 to 11 digits`);
  } else if (row.kost !== '' && !KOST_TYPES.has(row.apaleoType)) {
    add(
      'W-KOST-IGNORED',
      'kost',
      row.kost,
      `kost ${row.kost} is never written for apaleo type ${row.apaleoType}: Abacus accepts a Kostenstelle only on Erfolgskonten, ` +
        'so the tool writes it only on revenue and write-off bookings. Leave kost empty on this row',
    );
  }
  const code = mwstCodeOf(row);
  const rate = parsePercent(row.mwstPercent);
  const rateKnown = rate !== undefined && !Number.isNaN(rate);
  if (code !== undefined && !MWST_CODE.test(code)) {
    add('E-MWST-CODE-FORMAT', 'mwst_code', row.mwstCode, `MWST-Code "${row.mwstCode}" must be 1 to 3 characters of A-Z, a-z and 0-9 (a code of the Mandant's MWST-Tabelle)`);
  } else if (code !== undefined && NO_TAX_TYPES.has(row.apaleoType)) {
    add(
      'E-MWST-CODE-NOT-ALLOWED',
      'mwst_code',
      row.mwstCode,
      `apaleo type ${row.apaleoType} is a payment, guest claim or Debitor and books no MWST, but the row has the MWST-Code ${code}: ` +
        'Abacus would book the MWST on this money or claim account instead of the revenue or deposit account. Leave mwst_code and ' +
        'mwst_percent empty on this row, and put the MWST-Code on the revenue or deposit row',
    );
  } else if (code !== undefined) {
    if (rate === undefined) {
      add('E-VAT-RATE-MISSING', 'mwst_percent', '', `the MWST-Code ${code} needs the rate Abacus books with it in mwst_percent (0 for revenue without MWST)`);
    }
    const name = configuredName(code, codes);
    if (name === undefined) {
      add('W-MWST-CODE-UNCHECKED', 'mwst_code', code, uncheckedMessage(code, codes));
    } else if (rateKnown && rate !== MWST_CODE_RATES[name]) {
      add(
        'W-MWST-CODE-RATE',
        'mwst_code',
        code,
        `the MWST-Code ${code} is configured for ${CODE_LABELS[name]} at ${MWST_CODE_RATES[name]} % (abacus.mwstCodes.${name}), ` +
          `but the row books it at ${rate} %. Check that the codes are not swapped`,
      );
    }
  } else if (rateKnown && rate > 0) {
    add('E-MWST-CODE-MISSING', 'mwst_code', '', `mwst_percent is ${rate} %, but the MWST-Code is empty: Abacus books no MWST without one. Fill in the MWST-Code`);
  }
  if (rateKnown && !SWISS_VAT_RATES.includes(rate)) {
    const old = PRE_2024_RATES.get(rate);
    add(
      'W-VAT-RATE-UNUSUAL',
      'mwst_percent',
      row.mwstPercent,
      `mwst_percent ${rate} % is not a Swiss MWST rate (${percents(SWISS_VAT_RATES)}). ` +
        (old ? `${rate} % was ${old} until 2023-12-31: exports for 2023 and earlier need your Treuhänder` : 'Was this row copied from a German or Austrian mapping?'),
    );
  }
  findings.push(...swissSpecialCases(row, where));
  if (row.abacusAccount === '') return findings;

  if (!ACCOUNT.test(row.abacusAccount)) {
    add(
      'E-ACCOUNT-FORMAT',
      'abacus_account',
      row.abacusAccount,
      `Abacus account "${row.abacusAccount}" must be an account number of 1 to 11 digits (digits only, no letters or spaces)`,
    );
  }
  if (row.apaleoType === 'Revenues' && code === undefined) {
    add(
      'W-UNTAXED-REVENUE',
      'mwst_code',
      '',
      `revenue on Abacus account ${row.abacusAccount} is booked without an MWST-Code. The Abacus account must not carry a default MWST-Code, ` +
        'or "MWST berechnen" applies it on import; check the account in Abacus, or enter the Mandant\'s MWST-Code for revenue without MWST',
    );
  }
  const abacusRate = rowRate(row);
  const apaleoRate = parsePercent(row.apaleoVatPercent);
  if (abacusRate !== undefined && apaleoRate !== undefined && !Number.isNaN(apaleoRate) && abacusRate !== apaleoRate) {
    add(
      'E-VAT-MISMATCH',
      'mwst_percent',
      String(abacusRate),
      `apaleo account ${row.apaleoAccount} (${row.apaleoType}) has VAT ${apaleoRate} %, but the row books ${abacusRate} % on Abacus account ` +
        `${row.abacusAccount}. Map it to an account for ${apaleoRate} % with the matching MWST-Code and mwst_percent`,
    );
  }
  return findings;
}

/** apaleo's levy types: Kurtaxe, second city tax and Gästetaxe or Beherbergungsabgabe. */
const LEVY_TYPES: ReadonlySet<string> = new Set(['CityTaxes', 'SecondCityTax', 'GuestLevies']);

/** apaleo's groups of cancellation and no-show revenue, and the names the KMU template recognises as such. */
const ANNULLATION = /^(?:RevenueCancellationFees|RevenueNoShow)(?:[_:]|$)|annullation|annulation|storno|cancel|no-?show/iu;

/**
 * The Swiss special cases a row can get silently wrong (a05 design decisions 1 and 4),
 * as warnings that never block: a levy row with MWST (`W-KURTAXE-TAXED`) and a
 * cancellation or no-show row with MWST (`W-ANNULLATION-TAXED`).
 */
function swissSpecialCases(row: MappingRow, where: string): Finding[] {
  const rate = mwstCodeOf(row) === undefined ? undefined : rowRate(row);
  if (rate === undefined || rate <= 0) return [];
  const what = `apaleo account ${row.apaleoAccount} (${row.apaleoType}) is booked with the MWST-Code ${row.mwstCode} at ${rate} %`;
  if (LEVY_TYPES.has(row.apaleoType)) {
    return [
      {
        code: 'W-KURTAXE-TAXED',
        message:
          `${where}: ${what}. A Kurtaxe or Gästetaxe that the guest owes, that is invoiced separately and forwarded to the Gemeinde is a ` +
          'durchlaufender Posten without MWST (no MWST-Code, or a Ziffer-910 code); only a Beherbergungsabgabe the hotel owes itself, a Kurtaxe ' +
          'that is not invoiced separately, or the part the hotel keeps, is taxable at 3.8 % (ESTV MBI 08 Ziff. 7.11). Confirm the row with your Treuhänder',
        field: 'mwst_code',
        value: row.mwstCode,
      },
    ];
  }
  if (row.apaleoType === 'Revenues' && (ANNULLATION.test(row.apaleoAccount) || ANNULLATION.test(row.apaleoName))) {
    return [
      {
        code: 'W-ANNULLATION-TAXED',
        message:
          `${where}: ${what}. Payments for Annullationen and no-shows are Schadenersatz without MWST, unless the service was already ` +
          'invoiced and not corrected with a correction document (ESTV MBI 08 Ziff. 8.7). Confirm the row with your Treuhänder, or correct the VAT in apaleo',
        field: 'mwst_code',
        value: row.mwstCode,
      },
    ];
  }
  return [];
}

export interface CoverageOptions {
  /**
   * The rate each line's rows are resolved with. The posting rules' `releaseRateOf`
   * gives the inferred rate of an untaxed deposit release (undefined when none can
   * be inferred) and the line's own rate (`lineRate`) otherwise.
   */
  rateOf: (line: LedgerLine) => number | undefined;
  /** The MWST-Codes in the fix hints. Default 311, 312, 313. */
  mwstCodes?: MwstCodes | undefined;
}

/** A line without a tax entry left after normalising. */
function isUntaxed(line: LedgerLine): boolean {
  return !line.taxes.some((tax) => tax.percent !== 0 || tax.amountCents !== 0);
}

interface Booked {
  account: AccountRef;
  lines: number;
  grossCents: number;
}

interface Unmapped extends Booked {
  rate: number | undefined;
  row: MappingRow | undefined;
  /**
   * Set for accounts outside the chart with a parent (per-reservation and folio
   * accounts): they are reported once per parent, type and rate.
   */
  group?: { parent: string; accounts: Set<string> };
}

interface Mismatch extends Booked {
  rate: number;
  row: MappingRow;
  abacusRate: number;
}

/** Untaxed deposit releases whose VAT rate cannot be inferred. */
interface UnknownRates {
  accounts: Set<string>;
  lines: number;
  grossCents: number;
}

function add<T extends Booked>(map: Map<string, T>, key: string, line: LedgerLine, create: () => T): void {
  const entry = map.get(key) ?? create();
  entry.lines += 1;
  entry.grossCents += line.grossCents;
  map.set(key, entry);
}

const byAccount = (a: Booked, b: Booked) => a.account.type.localeCompare(b.account.type) || a.account.number.localeCompare(b.account.number);

const MAX_EXAMPLES = 3;

/**
 * Checks every account booked in `lines` against the mapping:
 * - `E-UNMAPPED` for an account that does not resolve to a row with an Abacus
 *   account, with its type, name, line count and gross total;
 * - `E-VAT-MISMATCH` for a VAT-relevant account whose row books another rate
 *   than the line carries, for example a revenue account at 10 % that resolves
 *   through a parent row to an 8.1 % account;
 * - `E-VAT-RATE-UNKNOWN` once for all untaxed deposit releases whose rate
 *   `rateOf` cannot infer (the export stops on them).
 * Lines with a Vat or VatOnLiabilities side are skipped by the posting rules,
 * so they need no mapping.
 */
export function checkCoverage(
  mapping: Mapping,
  lines: readonly LedgerLine[],
  chart: ChartIndex | undefined,
  options: CoverageOptions,
): Finding[] {
  const { rateOf } = options;
  const resolveAt = (account: AccountRef, rate: number | undefined) => resolve(mapping, account, { rate, ...(chart ? { chart } : {}) });
  const unmapped = new Map<string, Unmapped>();
  const mismatches = new Map<string, Mismatch>();
  const unknownRate: UnknownRates = { accounts: new Set(), lines: 0, grossCents: 0 };
  for (const line of lines) {
    if (VAT_ACCOUNT_TYPES.has(line.debit.type) || VAT_ACCOUNT_TYPES.has(line.credit.type)) continue;
    const rate = rateOf(line);
    for (const account of [line.debit, line.credit]) {
      if (rate === undefined && account.type === 'Liabilities' && isUntaxed(line)) {
        unknownRate.accounts.add(account.number);
        unknownRate.lines += 1;
        unknownRate.grossCents += line.grossCents;
        continue;
      }
      const row = resolveAt(account, rate);
      if (row && row.abacusAccount !== '') {
        // A row whose own apaleo_vat_percent equals the line's rate is checked by checkMapping.
        if (rate === undefined || !OUTPUT_TAX_TYPES.has(account.type) || parsePercent(row.apaleoVatPercent) === rate) continue;
        const abacusRate = rowRate(row);
        if (abacusRate === undefined || abacusRate === rate) continue;
        add(mismatches, `${row.line}\u0000${account.number}\u0000${account.type}\u0000${rate}`, line, () => ({
          account, rate, row, abacusRate, lines: 0, grossCents: 0,
        }));
        continue;
      }
      const rated = VAT_RELEVANT_TYPES.has(account.type) && (!row || row.apaleoAccount !== account.number);
      const parent = !chart?.has(account.number) ? account.parentNumber : undefined;
      const key = `${parent === undefined ? account.number : `parent ${parent}`}\u0000${account.type}${rated ? `\u0000${rate}` : ''}`;
      add(unmapped, key, line, () => ({
        account: parent === undefined ? account : { number: parent, name: chart?.find(parent, account.type)?.name ?? parent, type: account.type },
        rate,
        row,
        lines: 0,
        grossCents: 0,
        ...(parent === undefined ? {} : { group: { parent, accounts: new Set<string>() } }),
      }));
      unmapped.get(key)?.group?.accounts.add(account.number);
    }
  }
  const hint: Hint = {
    mwstCodes: options.mwstCodes ?? DEFAULT_MWST_CODES,
    wildcardRow: (type, rate) =>
      mapping.rows.find((row) => row.apaleoAccount === WILDCARD && row.apaleoType === type && parsePercent(row.apaleoVatPercent) === rate),
  };
  return [
    ...[...unmapped.values()].sort(byAccount).map((entry) => unmappedFinding(entry, hint)),
    ...(unknownRate.lines > 0 ? [unknownRateFinding(unknownRate)] : []),
    ...[...mismatches.values()].sort(byAccount).map(mismatchFinding),
  ];
}

function bookedText({ lines, grossCents }: Pick<Booked, 'lines' | 'grossCents'>): string {
  return `${lines} line${lines === 1 ? '' : 's'}, gross ${formatCents(grossCents)}`;
}

interface Hint {
  /** The MWST-Codes a wildcard row for a taxed rate needs. */
  mwstCodes: MwstCodes;
  /** The mapping's wildcard row for a VAT-relevant type at a rate, if it has one. */
  wildcardRow: (type: string, rate: number) => MappingRow | undefined;
}

/**
 * The fix when an empty parent row wins over an empty wildcard row that already
 * exists (resolve prefers the parent): name that row instead of asking to add it.
 */
function emptyWildcardFix(wildcard: MappingRow, type: string, rate: number): string {
  return `fill in abacus_account on the wildcard row for ${type} at ${rate} % on line ${wildcard.line}`;
}

/** Labels of the template's accounts in the fix hints. */
const TEMPLATE_ACCOUNT_LABELS: Readonly<Record<string, string>> = { AccountsReceivable: 'Debitoren apaleo' };

/** The configured MWST-Code for a Swiss rate, else a placeholder. */
function codeForRate(rate: number, codes: MwstCodes): string {
  const name = (Object.keys(MWST_CODE_RATES) as (keyof MwstCodes)[]).find((key) => MWST_CODE_RATES[key] === rate);
  return name ? codes[name] : '<MWST-Code>';
}

/** The wildcard row to add for a type, as it is written in the file, with the template's account as example. */
function wildcardHint(type: string, rate: number | undefined, { mwstCodes }: Hint): string {
  const rated = VAT_RELEVANT_TYPES.has(type);
  const template = templateWildcard(shippedTemplate(), type, rated ? rate : undefined, { mwstCodes });
  if (!rated) {
    const label = TEMPLATE_ACCOUNT_LABELS[type];
    return `the wildcard row \`*;${type};;;${template?.abacusAccount ?? '<Abacus account>'}\`${label && template ? ` (${label})` : ''}`;
  }
  const tax = rate === 0 ? `;;${rate}` : `;${template?.mwstCode || (rate === undefined ? '<MWST-Code>' : codeForRate(rate, mwstCodes))};${rate}`;
  return `a wildcard row \`*;${type};;${rate};<Abacus account>${tax}\`${template === undefined ? '' : ` (template: ${template.abacusAccount})`}`;
}

/**
 * `E-UNMAPPED` with the row to change: an exact empty row by its line; an empty
 * parent row with the wildcard row to add instead (for VAT-relevant types never
 * "fill in the parent row": one Abacus account cannot serve every rate); no row
 * at all with the row or wildcard row to add.
 */
function unmappedFinding(entry: Unmapped, hint: Hint): Finding {
  const { account, rate, row, group } = entry;
  const vatRelevant = VAT_RELEVANT_TYPES.has(account.type);
  const at = vatRelevant && rate !== undefined ? ` at ${rate} %` : '';
  let what = `apaleo account ${account.number} (${account.type}, "${account.name}") is`;
  if (group) {
    const accounts = [...group.accounts].sort();
    const more = accounts.length > MAX_EXAMPLES ? ` and ${accounts.length - MAX_EXAMPLES} more` : '';
    const count = accounts.length === 1 ? `1 ${account.type} account` : `${accounts.length} ${account.type} accounts`;
    what = `${count} of reservations or folios under parent ${group.parent}${at} (${accounts.slice(0, MAX_EXAMPLES).join(', ')}${more}) ${accounts.length === 1 ? 'is' : 'are'}`;
  }
  const emptyParent = row && row.apaleoAccount !== WILDCARD && row.apaleoAccount !== (group ? undefined : account.number);
  const wildcard = wildcardHint(account.type, rate, hint);
  let fix: string;
  if (row && !emptyParent) {
    fix = `fill in abacus_account on line ${row.line} of the mapping file`;
  } else if (vatRelevant && rate === undefined) {
    fix = `the lines carry more than one VAT rate, so no wildcard applies; add a row for ${account.number} ${account.type}`;
  } else if (account.type === 'Revenues' && row) {
    fix = `the parent row for ${row.apaleoAccount} on line ${row.line} has no Abacus account; add a row for ${account.number} Revenues with an Abacus account for${at}`;
  } else if (account.type === 'Revenues') {
    fix = `add a row with apaleo_account ${account.number}, apaleo_type Revenues and an Abacus account`;
  } else if (row && vatRelevant) {
    const existing = rate === undefined ? undefined : hint.wildcardRow(account.type, rate);
    const add = existing && rate !== undefined ? emptyWildcardFix(existing, account.type, rate) : `add ${wildcard}`;
    fix = `the parent row for ${row.apaleoAccount} on line ${row.line} has no Abacus account and does not apply to ${account.type} at different VAT rates; ${add}`;
  } else if (row) {
    fix = `fill in abacus_account for the parent row ${row.apaleoAccount} on line ${row.line}, or add ${wildcard}`;
  } else if (group && vatRelevant) {
    fix = `add ${wildcard}`;
  } else if (group) {
    fix = `add a row for ${group.parent} ${account.type} or ${wildcard}`;
  } else if (vatRelevant) {
    fix = `add a row for ${account.number} ${account.type}, or a wildcard row (*) for ${account.type}${at}: ${wildcard.replace(/^a wildcard row /, '')}`;
  } else {
    fix = `add a row with apaleo_account ${account.number}, apaleo_type ${account.type} and an Abacus account`;
  }
  return {
    code: 'E-UNMAPPED',
    message: `${what} not mapped (${bookedText(entry)}): ${fix}`,
    field: 'apaleo_account',
    value: account.number,
  };
}

function mismatchFinding(entry: Mismatch): Finding {
  const { account, rate, row, abacusRate } = entry;
  const via = row.apaleoAccount === account.number ? `its row on line ${row.line}` : `line ${row.line} (apaleo account ${row.apaleoAccount})`;
  return {
    code: 'E-VAT-MISMATCH',
    message:
      `apaleo account ${account.number} (${account.type}, "${account.name}") is booked at ${rate} % (${bookedText(entry)}), ` +
      `but it uses ${via} of the mapping, which books ${abacusRate} % on Abacus account ${row.abacusAccount}. ` +
      `Add a row for ${account.number} ${account.type} with an Abacus account for ${rate} %`,
    field: 'apaleo_account',
    value: account.number,
  };
}

/** One finding for all untaxed deposit releases whose VAT rate cannot be inferred. */
function unknownRateFinding(releases: UnknownRates): Finding {
  const accounts = [...releases.accounts].sort();
  const names = accounts.slice(0, 3);
  const more = accounts.length > names.length ? ` and ${accounts.length - names.length} more` : '';
  return {
    code: 'E-VAT-RATE-UNKNOWN',
    message:
      `${releases.lines} deposit release${releases.lines === 1 ? '' : 's'} (${bookedText(releases)}, ` +
      `${accounts.length === 1 ? 'account' : 'accounts'} ${names.join(', ')}${more}): apaleo settled a guest's prepaid deposit ` +
      'against the bill without a VAT amount, and the VAT rate cannot be found: there is no PostPrepaymentVat line of the same day ' +
      'and reservation with a rate, and the chart of accounts gives the deposit account none. The export stops rather than book them ' +
      `without VAT. ${REPORT_PROBLEM_HINT}`,
    field: 'apaleo_account',
    value: names[0] ?? '',
  };
}
