import { abacusUnitOf } from '../core/config.js';
import { fileTag, type TargetFileMeta, type TargetWriter } from '../export/target.js';
import { mwstZiffer } from './format.js';
import { importBlock } from './import-block.js';
import { abacusMovements } from './movements.js';
import type { AbacusBooking, AbacusRenderOptions } from './types.js';
import { renderXmlBuchungen, xmlBuchungenFileName } from './writer.js';

/** `ABACUS_Buchungen_<YYYYMMDD>-<YYYYMMDD>_<propertyId>.xml`; replaced files have a dot in the suffix and do not match. */
const ABACUS_FILE = /^ABACUS_Buchungen_(\d{8})-(\d{8})_[A-Za-z0-9_-]+\.xml$/;

/** What the Treuhänder's Abacus Mandant decides about one property's file. */
export type AbacusTargetSettings = Omit<AbacusRenderOptions, 'from' | 'to' | 'propertyId'>;

/** The settings of the config's `abacus` section, with the property's own Mandant and Geschäftsbereich. */
export function settingsFromConfig({ config, propertyId }: Pick<TargetFileMeta, 'config' | 'propertyId'>): AbacusTargetSettings {
  const { abacus } = config;
  const { mandant, geschaeftsbereich } = abacusUnitOf(abacus, config.properties, propertyId);
  const { leitwaehrung, abrechnungsart, version, mwstKonto, mwstHilfskonto } = abacus;
  return { mandant, geschaeftsbereich, leitwaehrung, abrechnungsart, version, mwstKonto, mwstHilfskonto };
}

/**
 * Starts `Text1` of every booking of a demo file (`export --demo`), so an
 * imported demo booking is recognisable in Abacus. The 80-character limit applies after it.
 */
export const DEMO_TEXT_PREFIX = 'DEMO ';

/** The bookings as a demo file writes them: every `Text1` with `DEMO_TEXT_PREFIX`. */
export function markDemo<B extends AbacusBooking>(bookings: readonly B[]): B[] {
  return bookings.map((booking) => ({ ...booking, text1: `${DEMO_TEXT_PREFIX}${booking.text1}` }));
}

/** How a Treuhänder undoes an imported file in Abacus (open question 9). */
const UNDO_IN_ABACUS = 'delete its bookings in Abacus first: in the Nebenjournal before they are transferred, or by reversing them';

/** The AbaConnect XML Buchungen file as the export's target, with the settings `settingsOf` reads for each file (default: the config). */
export function createAbacusTarget(settingsOf: (meta: TargetFileMeta) => AbacusTargetSettings = settingsFromConfig): TargetWriter<AbacusBooking> {
  const optionsOf = (meta: TargetFileMeta): AbacusRenderOptions => ({
    ...settingsOf(meta),
    from: meta.part.from,
    to: meta.part.to,
    propertyId: meta.propertyId,
  });
  const fileName = (meta: TargetFileMeta) => xmlBuchungenFileName(optionsOf(meta), fileTag(meta));
  return {
    id: 'abacus',
    currency: (config) => config.abacus.leitwaehrung,
    protocolTitle: 'apaleo-abacus export protocol',
    filePattern: ABACUS_FILE,
    fileName,
    render(bookings, meta) {
      const { bytes, notes } = renderXmlBuchungen(meta.demo ? markDemo(bookings) : bookings, optionsOf(meta));
      return { bytes, findings: notes };
    },
    importBlock: (bookings, meta) => importBlock(bookings, optionsOf(meta), fileName(meta)),
    manifestFields: (meta) => {
      const { mandant, geschaeftsbereich } = settingsOf(meta);
      return { mandant, geschaeftsbereich };
    },
    // The file has no creation time: unchanged means byte-identical.
    sameContent: (existing, next) => existing.length === next.length && existing.every((byte, i) => byte === next[i]),
    movements: abacusMovements,
    taxReturnLine: (ratePercent) => {
      const ziffer = mwstZiffer(ratePercent);
      return ziffer && `Ziffer ${ziffer}`;
    },
    advice: {
      currency:
        "An Abacus booking is written in the Mandant's Leitwährung (abacus.leitwaehrung), without foreign-currency data, " +
        'so every property must book in that currency.',
      overlap:
        'Importing both files would book those days twice in Abacus, so import only one of them. Export the same period as that file, ' +
        `or move it away (if it was imported, ${UNDO_IN_ABACUS}) and run again`,
      reimport:
        'A change of the abacus section (Mandant, Geschäftsbereich, Abrechnungsart, version, MWST accounts) also changes the file, ' +
        'so the bookings themselves may be unchanged. Abacus does not recognise a file it has already imported, so importing both files ' +
        `would book those days twice. If the Treuhänder has already imported the old file, ${UNDO_IN_ABACUS} ` +
        "(the old file's protocol names the Mandant and the range of Belegnummern).",
    },
  };
}

export const abacusTarget: TargetWriter<AbacusBooking> = createAbacusTarget();
