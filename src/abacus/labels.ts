/**
 * The names the Treuhänder knows from Abacus for each field, so findings never
 * show internal property names such as `grossCents`.
 */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  collectiveAccount: 'Konto (CollectiveInformation)',
  singleAccount: 'Gegenkonto (SingleInformation)',
  businessDate: 'Belegdatum',
  grossCents: 'Betrag',
  mwstCode: 'MWST-Code',
  percent: 'MWST-Satz',
  taxCents: 'MWST-Betrag',
  kost: 'Kostenstelle',
  text1: 'Text1',
  text2: 'Text2',
  documentNumber: 'Belegnummer',
  from: 'Beginn des Zeitraums',
  to: 'Ende des Zeitraums',
};

/** The Abacus name of a field, or the field name itself if none is known. */
export function labelOf(field: string): string {
  return FIELD_LABELS[field] ?? field;
}
