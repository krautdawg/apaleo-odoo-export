import { odooJournalOf, type OdooVersion } from '../core/config.js';
import { fileTag, type TargetFileFigures, type TargetFileMeta, type TargetVatTotal, type TargetWriter } from '../export/target.js';
import { kennzahl, taxExternalId } from './format.js';
import { entryLineSources, importBlock, referencePrefix } from './import-block.js';
import type { OdooBooking, OdooRenderOptions } from './types.js';
import { canonicalTaxRef, odooCsvFileName, renderOdooCsv, revisionOf, taxTotals, type RenderedOdooCsv } from './writer.js';

/** `ODOO_Buchungen_<YYYYMMDD>-<YYYYMMDD>_<tag>.csv`; replaced files have a dot in the suffix and protocols end in `.txt`, so neither matches. */
const ODOO_FILE = /^ODOO_Buchungen_(\d{8})-(\d{8})_[A-Za-z0-9_-]+\.csv$/;

/** What the Odoo company decides about one property's file. */
export type OdooTargetSettings = Omit<OdooRenderOptions, 'from' | 'to' | 'propertyId' | 'revision' | 'demo'> & { version?: OdooVersion };

/** The settings of the config's `odoo` section, with the property's own journal. */
export function settingsFromConfig({ config, propertyId }: Pick<TargetFileMeta, 'config' | 'propertyId'>): OdooTargetSettings {
  const { odoo } = config;
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
 * Odoo's modelled VAT per tax over the file against apaleo's tax per line, with
 * the days on which they differ, and the counts of the file (`fileFigures`).
 */
export function odooFileFigures(rendered: RenderedOdooCsv, bookings: readonly Pick<OdooBooking, 'vat'>[], options: Pick<OdooRenderOptions, 'companyId' | 'taxRounding'>): TargetFileFigures {
  const bookingTaxes = new Map<string, Set<string>>();
  for (const { vat } of bookings) {
    if (!vat) continue;
    const tax = canonicalTaxRef(vat.taxRef, options.companyId);
    bookingTaxes.set(tax, (bookingTaxes.get(tax) ?? new Set()).add(vat.taxRef));
  }
  const vatByTax = taxTotals(rendered.entries, options.taxRounding).map(
    (total): TargetVatTotal => ({
      tax: total.taxRef,
      bookingTaxes: [...(bookingTaxes.get(total.taxRef) ?? [total.taxRef])].sort(),
      ratePercent: total.percent,
      baseCents: total.baseCents,
      vatCents: total.odooTaxCents,
      apaleoVatCents: total.apaleoTaxCents,
      days: rendered.entries.flatMap((entry) => {
        const day = taxTotals([entry], options.taxRounding).find((row) => row.taxRef === total.taxRef);
        return day && day.odooTaxCents !== day.apaleoTaxCents ? [{ date: entry.date, vatCents: day.odooTaxCents, apaleoVatCents: day.apaleoTaxCents }] : [];
      }),
    }),
  );
  return {
    vatByTax,
    entries: rendered.entries.length,
    lines: rendered.entries.reduce((sum, entry) => sum + entry.lines.length, 0),
    roundingLines: rendered.roundingLines,
  };
}

/** The Odoo target, with the optional parts of a `TargetWriter` it always has. */
export interface OdooTargetWriter extends TargetWriter<OdooBooking> {
  protocolDetails(bookings: readonly OdooBooking[], meta: TargetFileMeta): string[];
  fileFigures(bookings: readonly OdooBooking[], meta: TargetFileMeta): TargetFileFigures;
}

/** The Odoo import file of journal entries as the export's target, with the settings `settingsOf` reads for each file (default: the config). */
export function createOdooTarget(settingsOf: (meta: TargetFileMeta) => OdooTargetSettings = settingsFromConfig): OdooTargetWriter {
  const optionsOf = (meta: TargetFileMeta): OdooRenderOptions => {
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
      revision: meta.revision,
      demo: meta.demo,
    };
  };
  const fileName = (meta: Pick<TargetFileMeta, 'propertyId' | 'part' | 'demo'>) => odooCsvFileName({ from: meta.part.from, to: meta.part.to, propertyId: meta.propertyId }, fileTag(meta));
  return {
    id: 'odoo',
    currency: (config) => config.odoo.currency,
    protocolTitle: 'Odoo journal entries (import file)',
    filePattern: ODOO_FILE,
    fileName,
    render(bookings, meta) {
      const { bytes, notes } = renderOdooCsv(bookings, optionsOf(meta));
      return { bytes, findings: notes };
    },
    revisionOf,
    importBlock(bookings, meta) {
      const options = optionsOf(meta);
      return importBlock(renderOdooCsv(bookings, options), options, fileName(meta), settingsOf(meta).version);
    },
    protocolDetails: (bookings, meta) => entryLineSources(renderOdooCsv(bookings, optionsOf(meta)), bookings),
    fileFigures(bookings, meta) {
      const options = optionsOf(meta);
      return odooFileFigures(renderOdooCsv(bookings, options), bookings, options);
    },
    manifestFields: (meta, bookings) => {
      const options = optionsOf(meta);
      const { companyId, journal } = options;
      const { entries, taxTotals: totals } = renderOdooCsv(bookings, options);
      const lines = entries.flatMap((entry) => entry.lines);
      return {
        odooCompanyId: companyId,
        odooJournal: journal,
        entries: entries.length,
        lines: lines.length,
        debitTotalCents: lines.reduce((sum, line) => sum + Math.max(line.amountCents, 0), 0),
        vatByTax: totals.map((total) => ({ tax: taxExternalId(total.taxRef, companyId), ratePercent: total.percent, baseCents: total.baseCents, vatCents: total.odooTaxCents })),
      };
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
      reimport: (file) =>
        `With --overwrite the new file is revision ${file.revision} with new External IDs (_r${file.revision}) and the reference suffix "(Korrektur ${file.revision})", ` +
        'so importing it creates new entries in Odoo. Before importing it, delete the draft ' +
        `entries of the earlier revision in Odoo (filter by the reference "${referencePrefix(file)}") and reverse its posted entries, ` +
        'because an import cannot change a posted entry and a reversal keeps its External ID. Set the reversal date to the date of each original entry, not today, ' +
        'so the month nets to zero in its own tax period (docs/odoo-import.md).',
    },
  };
}

export const odooTarget: OdooTargetWriter = createOdooTarget();
