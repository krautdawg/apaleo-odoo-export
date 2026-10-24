import type { OdooVersion, PostingConfig } from '../core/config.js';
import type { Finding } from '../core/findings.js';
import type { LedgerLine } from '../core/source.js';
import type { OdooBooking } from '../odoo/types.js';

/** One apaleo ledger line as an Odoo booking, with its source entry and receipt for the protocol. */
export type PostedBooking = OdooBooking;

/**
 * Why a ledger line produced no booking although nothing is wrong with it:
 * - `VAT_ACCOUNT_LINE`: a side is an apaleo Vat or VatOnLiabilities account;
 *   Odoo creates the tax lines from the taxes of the base lines.
 * - `ZERO_AMOUNT`: the gross amount is 0.
 * - `SAME_ACCOUNT`: both sides map to the same Odoo account (for example a
 *   move between two guest folios, or the `/Offset` line of a payment).
 */
export const SKIP_REASONS = ['VAT_ACCOUNT_LINE', 'ZERO_AMOUNT', 'SAME_ACCOUNT'] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export interface SkippedLine {
  reason: SkipReason;
  line: LedgerLine;
}

export interface PostingOptions extends PostingConfig {
  /** `odoo.version`, for the generated accounts in the fix hints of `E-UNMAPPED`. Default 18. */
  version?: OdooVersion | undefined;
}

/** Soll and Haben of one Odoo account over all bookings (movement model). Balance is Soll minus Haben. */
export interface AccountTotal {
  account: string;
  sollCents: number;
  habenCents: number;
  balanceCents: number;
}

/**
 * Revenue, deposits or write-offs booked with one Odoo tax at one rate, signed as
 * owed (allowances and releases reduce it): net and gross as passed to Odoo (the
 * net is the gross minus apaleo's rounded tax, before the writer fits it), apaleo's
 * tax rounded per line, and the precise VAT apaleo charged on the same lines.
 * Odoo's own tax per rate comes from the writer (the import block).
 */
export interface VatTotal {
  /** The Odoo tax of the bookings as the mapping names it; empty for bookings without one. */
  tax: string;
  ratePercent: number;
  netCents: number;
  /** Sum of apaleo's tax rounded per line, signed as owed. */
  vatCents: number;
  grossCents: number;
  /** Sum of apaleo's precise taxes, as decimal text. */
  apaleoVat: string;
}

export type RevenueTotal = VatTotal;

/**
 * Kurtaxe and other guest levies booked on one Odoo account with one tax and
 * rate, signed as charged (a correction reduces it): the gross amount and
 * apaleo's tax. Empty `tax` and rate 0 for a levy booked without tax
 * (durchlaufender Posten).
 */
export interface LevyTotal {
  account: string;
  tax: string;
  ratePercent: number;
  grossCents: number;
  /** Sum of apaleo's rounded tax, signed as owed; 0 without tax. */
  vatCents: number;
}

/** Gross amount and apaleo's tax rounded per line, unsigned. */
export interface GrossAndVat {
  grossCents: number;
  vatCents: number;
}

/**
 * Deposits (Anzahlungen) booked with one Odoo tax at one rate, unsigned: received
 * (the deposit line is credited, on the invoice side, and raises the Kennzahl),
 * released and, of the released, refunded (debited, on the refund side, lowering
 * it). Empty `tax` and rate 0 for deposits without tax.
 */
export interface DepositRateTotal {
  tax: string;
  ratePercent: number;
  received: GrossAndVat;
  released: GrossAndVat;
  refunded: GrossAndVat;
}

/** Payments received on one Odoo clearing account (Kasse, Geldtransit), signed (refunds reduce it). */
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
   * Written-off guest receivables (LossOfAccountsReceivable) per Odoo tax and rate,
   * signed as written off (a reversed write-off reduces it): net, the tax correction
   * as tax, gross, and apaleo's precise VAT on the same lines.
   */
  writeOffsByRate: VatTotal[];
  /** City tax, second city tax and guest levies, signed. */
  cityTaxCents: number;
  /** The same levies per Odoo account, tax and rate: booked without tax (durchlaufender Posten) or with it. */
  levies: LevyTotal[];
  payments: PaymentTotal[];
  /** Classified by side and sign (`depositMovement`), unsigned; refunds (paid back via a payment) are part of the released amount. */
  deposits: { receivedCents: number; releasedCents: number; refundedCents: number };
  /** The same deposits per Odoo tax and rate, with apaleo's tax of each direction. */
  depositsByRate: DepositRateTotal[];
  /** Net movement on accounts receivable (company invoices): debits positive. */
  accountsReceivableCents: number;
  skipped: SkippedTotal[];
  findings: FindingCount[];
}

export interface PostingResult {
  bookings: PostedBooking[];
  skipped: SkippedLine[];
  /** `E-` findings block the export. */
  findings: Finding[];
  summary: PostingSummary;
  /**
   * Per VAT rate, how many one-cent differences between the tax computed for
   * several untaxed deposit lines of a day and the VAT apaleo moved on their
   * `PostPrepaymentVat` lines the run accepted. The plausibility check allows
   * that many cents at that rate only.
   */
  vatRoundingByRate: ReadonlyMap<number, number>;
}
