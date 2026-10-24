/**
 * MWST-Codes of the Abacus KMU sample Mandant (research §5) that a Treuhänder
 * may find in a Mandant set up from it, with the Ziffer of the MWST-Abrechnung
 * they report on (2024 form). `W-MWST-CODE-UNCHECKED` names them, so a copied
 * or mistyped code is recognised without knowing the Mandant's MWST-Tabelle.
 */
export interface SampleCode {
  /** What the sample Mandant calls the code. */
  designation: string;
  /** The Ziffer of the MWST-Abrechnung, or the kind of code when it is no Umsatzsteuer code. */
  ziffer: string;
  /** Extra advice for this code. */
  note?: string;
}

/** The Kurtaxe a hotel collects is a durchlaufender Posten: never the Ziffer-900 code. */
const KURTAXE_NOTE =
  'it is meant for Subventionen and Tourismusabgaben of a Kurverein with Vorsteuerkürzung, not for a Kurtaxe the hotel collects: ' +
  'a collected Kurtaxe is a durchlaufender Posten without MWST-Code or with a Ziffer-910 code such as 491';

const VORSTEUER_NOTE = 'it is a Vorsteuer code, but apaleo lines are sales: use an Umsatzsteuer code';

export const KMU_SAMPLE_CODES: Readonly<Record<string, SampleCode>> = {
  '311': { designation: 'Umsatzsteuer Normalsatz', ziffer: 'Ziffer 303' },
  '312': { designation: 'Umsatzsteuer reduzierter Satz', ziffer: 'Ziffer 313' },
  '313': { designation: 'Beherbergung', ziffer: 'Ziffer 343' },
  '400': { designation: 'UST steuerfrei', ziffer: 'Ziffer 230' },
  '490': { designation: 'Subvention Kurtaxen', ziffer: 'Ziffer 900', note: KURTAXE_NOTE },
  '491': { designation: 'Spenden, Dividenden', ziffer: 'Ziffer 910' },
  '111': { designation: 'Vorsteuer', ziffer: 'Vorsteuer (Ziffer 400)', note: VORSTEUER_NOTE },
  '112': { designation: 'Vorsteuer', ziffer: 'Vorsteuer (Ziffer 400)', note: VORSTEUER_NOTE },
  '121': { designation: 'Vorsteuer', ziffer: 'Vorsteuer (Ziffer 405)', note: VORSTEUER_NOTE },
  '122': { designation: 'Vorsteuer', ziffer: 'Vorsteuer (Ziffer 405)', note: VORSTEUER_NOTE },
  '133': { designation: 'Kürzung Subv. Kurtax', ziffer: 'Vorsteuerkürzung', note: VORSTEUER_NOTE },
};
