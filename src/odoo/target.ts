import { odooJournalOf, type OdooVersion } from '../core/config.js';
import { UserError } from '../core/errors.js';
import { fileTag, type RenderedFile, type TargetFileMeta, type TargetWriter } from '../export/target.js';
import { kennzahl } from './format.js';
import { importBlock } from './import-block.js';
import type { OdooBooking, OdooRenderOptions } from './types.js';
import { odooCsvFileName, renderOdooCsv, revisionOf } from './writer.js';

/** `ODOO_Buchungen_<YYYYMMDD>-<YYYYMMDD>_<tag>.csv`; replaced files have a dot in the suffix and protocols end in `.txt`, so neither matches. */
const ODOO_FILE = /^ODOO_Buchungen_(\d{8})-(\d{8})_[A-Za-z0-9_-]+\.csv$/;

/** What the Odoo company decides about one property's file. */
export type OdooTargetSettings = Omit<OdooRenderOptions, 'from' | 'to' | 'propertyId' | 'revision' | 'demo'> & { version?: OdooVersion };

/** The settings of the config's `odoo` section, with the property's own journal. */
export function settingsFromConfig({ config, propertyId }: Pick<TargetFileMeta, 'config' | 'propertyId'>): OdooTargetSettings {
  const { odoo } = config;
  if (!odoo) throw new UserError('The config has no odoo section: set odoo.journal and odoo.version (see docs/configuration.md) to write the Odoo file.');
  const { companyId, currency, taxRounding, roundingAccount, version } = odoo;
  return { companyId, currency, taxRounding, version, journal: odooJournalOf(odoo, config.properties, propertyId), ...(roundingAccount !== undefined && { roundingAccount }) };
}

/**
 * The movement model of an Odoo booking (design decision 9): the VAT side moves
 * by the gross minus apaleo's tax, the other side by the gross, each signed by
 * its side (Soll positive). The tax lines Odoo creates and the fitting cents
 * are not part of it; the writer checks those itself.
 */
export function odooMovements(booking: Pick<OdooBooking, 'debit' | 'credit' | 'grossCents' | 'vat'>): [string, number][] {
  const amount = (side: 'debit' | 'credit') => booking.grossCents - (booking.vat?.side === side ? booking.vat.apaleoTaxCents : 0);
  return [
    [booking.debit.account, amount('debit')],
    [booking.credit.account, -amount('credit')],
  ];
}

/**
 * The Odoo target: `render` takes the revision of the file (1 for the first
 * file of a period, chosen by the pipeline in o06), and `revisionOf` reads it
 * back from a file on disk.
 */
export interface OdooTargetWriter extends TargetWriter<OdooBooking> {
  render(bookings: readonly OdooBooking[], meta: TargetFileMeta, revision?: number): RenderedFile;
  importBlock(bookings: readonly OdooBooking[], meta: TargetFileMeta, revision?: number): string[];
  revisionOf(bytes: Uint8Array): number | undefined;
}

/** The Odoo import file of journal entries as the export's target, with the settings `settingsOf` reads for each file (default: the config). */
export function createOdooTarget(settingsOf: (meta: TargetFileMeta) => OdooTargetSettings = settingsFromConfig): OdooTargetWriter {
  const optionsOf = (meta: TargetFileMeta, revision: number): OdooRenderOptions => {
    const { companyId, journal, currency, taxRounding, roundingAccount } = settingsOf(meta);
    return {
      companyId,
      journal,
      currency,
      taxRounding,
      ...(roundingAccount !== undefined && { roundingAccount }),
      from: meta.part.from,
      to: meta.part.to,
      propertyId: meta.propertyId,
      revision,
      demo: meta.demo,
    };
  };
  const fileName = (meta: TargetFileMeta) => odooCsvFileName({ from: meta.part.from, to: meta.part.to, propertyId: meta.propertyId }, fileTag(meta));
  return {
    id: 'odoo',
    currency: (config) => config.odoo?.currency ?? 'EUR',
    protocolTitle: 'Odoo journal entries (import file)',
    filePattern: ODOO_FILE,
    fileName,
    render(bookings, meta, revision = 1) {
      const { bytes, notes } = renderOdooCsv(bookings, optionsOf(meta, revision));
      return { bytes, findings: notes };
    },
    importBlock(bookings, meta, revision = 1) {
      const options = optionsOf(meta, revision);
      return importBlock(renderOdooCsv(bookings, options), options, fileName(meta), settingsOf(meta).version);
    },
    revisionOf,
    manifestFields: (meta) => {
      const { companyId, journal } = settingsOf(meta);
      return { odooCompanyId: companyId, odooJournal: journal };
    },
    // The file has no creation time: unchanged means byte-identical.
    sameContent: (existing, next) => existing.length === next.length && existing.every((byte, i) => byte === next[i]),
    movements: odooMovements,
    taxReturnLine: kennzahl,
    advice: {
      currency: 'An Odoo company books its journal entries in one currency (odoo.currency), and the tool does not convert, so every property must book in that currency.',
      overlap:
        'Both files contain entries for the same days, so importing both would overwrite reviewed drafts with the other file\'s content or book those days twice in Odoo. ' +
        'Export the same period as that file, or move it away (if it was imported, delete its draft entries and reverse its posted ones in Odoo first) and run again',
      reimport:
        'With --overwrite the new file gets the next revision and new External IDs, so importing it creates new entries in Odoo. Before importing it, delete the draft ' +
        'entries of the earlier revision in Odoo (filter by the reference "apaleo <property id>", as in the file name) and reverse its posted entries, ' +
        'because an import cannot change a posted entry and a reversal keeps its External ID.',
    },
  };
}

export const odooTarget: OdooTargetWriter = createOdooTarget();
