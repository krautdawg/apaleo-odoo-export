import type { LocalDate } from '../core/date.js';

/** `D`: the Collective account is debited (Soll) and the Single account credited (Haben); `C`: the reverse. */
export type DebitCredit = 'D' | 'C';

/** MWST-Abrechnungsart of the Mandant: `UseCode` 0 or 1, Steuerkonto or Hilfskonto in the Collective `TaxAccount`. */
export type Abrechnungsart = 'vereinbart' | 'vereinnahmt';

/** The MWST of a booking, written as `TaxData` in `SingleInformation`. */
export interface AbacusTax {
  /** The MWST-Code of the Mandant's MWST-Tabelle, 1 to 3 characters of `A-Z a-z 0-9`, for example `313`. */
  mwstCode: string;
  /** The rate in percent with at most two decimals, for example `3.8`; `0` for an untaxed code such as `400`. */
  percent: number;
  /**
   * The tax in whole Rappen as apaleo computed it, signed by `taxSign()` of the
   * booking's `debitCredit` (output tax on a credited Single account is negative), 0 at rate 0.
   */
  taxCents: number;
}

/**
 * One Einzelbuchung of the AbaConnect XML Buchungen file: one
 * `CollectiveInformation` and one `SingleInformation`. The VAT-bearing account
 * (revenue, deposit, write-off) is always the Single account, because only
 * `SingleInformation` carries `TaxData` (design decision 2).
 */
export interface AbacusBooking {
  /** The account of `CollectiveInformation`, 1 to 11 digits, for example the guest receivables `1101`. */
  collectiveAccount: string;
  /** The account of `SingleInformation`, 1 to 11 digits, for example the revenue account `3400`. */
  singleAccount: string;
  /** The side of the Collective account; the Single account takes the other side. */
  debitCredit: DebitCredit;
  /** The business date, written as `EntryDate`. Must lie inside the file period. */
  businessDate: LocalDate;
  /** The gross amount in whole Rappen, above 0, at most 11 integer digits. Written positive in both blocks. */
  grossCents: number;
  /** Omitted: no `TaxData`, `TaxAccount` 0 in both blocks. */
  tax?: AbacusTax;
  /** Kostenstelle (`BookingLevel1` of the Single block), 1 to 11 digits. */
  kost?: string;
  /** Text 1, sanitised and cut to 80 characters; must not be empty. */
  text1: string;
  /** Text 2, for example the apaleo receipt or reference; sanitised and cut to 80 characters. */
  text2?: string;
}

/** What the caller decides about one file: the period and the Mandant's settings. */
export interface AbacusRenderOptions {
  /** First day of the file period; its month and day start every Belegnummer. */
  from: LocalDate;
  /** Last day of the file period. */
  to: LocalDate;
  /** Written into the file name. */
  propertyId: string;
  /** Mandantennummer, written into `Parameter/Mandant` and every `Client`. */
  mandant: string;
  /** Geschäftsbereich (`Division`), 0 when the Mandant uses none. */
  geschaeftsbereich: number;
  /** The Mandant's Leitwährung, every `Currency` and `KeyCurrency`. */
  leitwaehrung: string;
  abrechnungsart: Abrechnungsart;
  /** The AbaConnect interface version, for example `2015.00`. */
  version: string;
  /** Steuerkonto of the MWST-Codes, the Collective `TaxAccount` with `vereinbart`. */
  mwstKonto: string;
  /** Hilfskonto of the MWST-Codes, the Collective `TaxAccount` with `vereinnahmt`. */
  mwstHilfskonto: string;
}
