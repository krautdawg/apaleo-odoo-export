import type { AbacusBooking } from '../abacus/types.js';
import type { PostingConfig } from '../core/config.js';
import type { Finding } from '../core/findings.js';
import type { LedgerLine } from '../core/source.js';
import type { MwstCodes } from '../mapping/index.js';

/** One Abacus Einzelbuchung, with the source entries it came from for traceability. */
export interface PostedBooking extends AbacusBooking {
  sourceEntryNumbers: string[];
}

/**
 * Why a ledger line produced no booking although nothing is wrong with it:
 * - `VAT_ACCOUNT_LINE`: a side is an apaleo Vat or VatOnLiabilities account;
 *   Abacus books the MWST from the `TaxData` of the revenue or deposit line.
 * - `ZERO_AMOUNT`: the gross amount is 0.
 * - `SAME_ACCOUNT`: both sides map to the same Abacus account (for example a
 *   move between two guest folios, or the `/Offset` line of a payment).
 */
export const SKIP_REASONS = ['VAT_ACCOUNT_LINE', 'ZERO_AMOUNT', 'SAME_ACCOUNT'] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export interface SkippedLine {
  reason: SkipReason;
  line: LedgerLine;
}

export interface PostingOptions extends PostingConfig {
  /** `abacus.mwstCodes`, for the fix hints of `E-UNMAPPED`. Default 311, 312, 313. */
  mwstCodes?: MwstCodes | undefined;
}

/** Soll and Haben of one Abacus account over all bookings (movement model). Balance is Soll minus Haben. */
export interface AccountTotal {
  account: string;
  sollCents: number;
  habenCents: number;
  balanceCents: number;
}

/**
 * Revenue, deposits or write-offs booked with one MWST-Code at one rate, signed as
 * owed (allowances and releases reduce it): net, tax and gross as passed to Abacus,
 * and the precise VAT apaleo charged on the same lines.
 */
export interface VatTotal {
  /** The MWST-Code of the bookings; empty for bookings without one (rate 0). */
  mwstCode: string;
  ratePercent: number;
  netCents: number;
  /** Sum of the MWST of the bookings, signed as owed. */
  vatCents: number;
  grossCents: number;
  /** Sum of apaleo's precise taxes, as decimal text. */
  apaleoVat: string;
}

export type RevenueTotal = VatTotal;

/**
 * Kurtaxe, Gästetaxe and Beherbergungsabgabe booked on one Abacus account with one
 * MWST-Code and rate, signed as charged (a correction reduces it): the gross amount
 * and its MWST. Empty `mwstCode` and rate 0 for a levy booked without `TaxData`
 * (durchlaufender Posten).
 */
export interface LevyTotal {
  account: string;
  mwstCode: string;
  ratePercent: number;
  grossCents: number;
  /** Sum of the MWST of the bookings, signed as owed; 0 without MWST. */
  vatCents: number;
}

/** Payments received on one Abacus clearing account, signed (refunds reduce it). */
export interface PaymentTotal {
  account: string;
  cents: number;
}

export interface SkippedTotal {
  reason: SkipReason;
  lines: number;
  /** Sum of the absolute gross amounts (the basis of `E-CONSERVATION`). */
  grossCents: number;
}

export interface FindingCount {
  code: string;
  count: number;
}

/** Totals of one posting run, all in cents. */
export interface PostingSummary {
  accounts: AccountTotal[];
  revenueByRate: VatTotal[];
  /** Deposits (Liabilities) per VAT rate: received minus released. */
  depositVatByRate: VatTotal[];
  /**
   * Written-off guest receivables (LossOfAccountsReceivable) per MWST-Code and rate,
   * signed as written off (a reversed write-off reduces it): net, the MWST correction
   * as tax, gross, and apaleo's precise VAT on the same lines.
   */
  writeOffsByRate: VatTotal[];
  /** City tax, second city tax and guest levies, signed. */
  cityTaxCents: number;
  /** The same levies per Abacus account, MWST-Code and rate: booked without MWST (durchlaufender Posten) or with it. */
  levies: LevyTotal[];
  payments: PaymentTotal[];
  /** Classified by side and sign (`depositMovement`), unsigned; refunds (paid back via a payment) are part of the released amount. */
  deposits: { receivedCents: number; releasedCents: number; refundedCents: number };
  /** Net movement on accounts receivable (Debitoren apaleo): debits positive. */
  accountsReceivableCents: number;
  skipped: SkippedTotal[];
  /** Sum of the one-Rappen differences (Abacus' check value minus the booked MWST) reported as `W-VAT-ROUNDING`. */
  roundingCents: number;
  findings: FindingCount[];
}

export interface PostingResult {
  bookings: PostedBooking[];
  skipped: SkippedLine[];
  /** `E-` findings block the export. */
  findings: Finding[];
  summary: PostingSummary;
  /**
   * Per VAT rate, how many one-cent differences between the booked tax and
   * apaleo's tax the run reported (`W-VAT-ROUNDING` on a deposit line whose
   * tax was computed). The plausibility check allows that many cents at that
   * rate only.
   */
  vatRoundingByRate: ReadonlyMap<number, number>;
}
