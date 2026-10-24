import {
  collectiveTaxAccount,
  formatAmount,
  formatDocumentNumber,
  formatRate,
  SINGLE_TAX_ACCOUNT,
  TAX_ACCOUNT_AT_RATE_ZERO,
  TAX_AMOUNT_IN_KEY_CURRENCY,
  TAX_INCLUDED_AT_RATE_ZERO,
  TAX_TYPE_OUTPUT,
  taxSign,
  useCode,
} from './format.js';
import type { AbacusBooking, AbacusRenderOptions } from './types.js';
import { APPLICATION, INTERFACE_ID, MAP_ID } from './writer.js';

interface CodeTotal {
  percents: Set<number>;
  taxCents: number;
}

/**
 * The import block of the protocol: what the Treuhänder compares with the
 * Abacus Mandant before the import (docs/abacus-format.md). MWST-Codes are
 * listed with every rate they carry in the file and their tax total, and every
 * account that carries `TaxData` with its MWST-Code, for the comparison with
 * the default MWST-Code of that account in F21. The journal total is the sum
 * of the gross amounts: each Einzelbuchung moves it once to Soll and once to Haben.
 */
export function importBlock(bookings: readonly Pick<AbacusBooking, 'singleAccount' | 'tax' | 'grossCents'>[], options: AbacusRenderOptions, fileName: string): string[] {
  const codes = new Map<string, CodeTotal>();
  const pairs = new Set<string>();
  for (const { singleAccount, tax } of bookings) {
    if (!tax) continue;
    const total = codes.get(tax.mwstCode) ?? { percents: new Set(), taxCents: 0 };
    total.percents.add(tax.percent);
    total.taxCents += tax.taxCents;
    codes.set(tax.mwstCode, total);
    pairs.add(`${singleAccount} -> ${tax.mwstCode}`);
  }
  const mwstCodes = [...codes]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, { percents, taxCents }]) => {
      const rates = [...percents].sort((a, b) => a - b).map((p) => `${formatRate(p)} %`);
      return `${code} (${rates.join(', ')}; tax ${formatAmount(taxCents)} ${options.leitwaehrung})`;
    });
  const accountCodes = [...pairs].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const collective = collectiveTaxAccount(options);
  const singleTaxAccount = SINGLE_TAX_ACCOUNT === 'account' ? 'the Single account itself' : collective;
  const last = bookings.length - 1;
  return [
    'Import into Abacus FIBU (compare with the Mandant before importing, see docs/abacus-format.md):',
    `  File: ${fileName}`,
    `  Bookings: ${bookings.length} Einzelbuchungen (one Transaction each)`,
    `  Journal total: ${formatAmount(bookings.reduce((sum, booking) => sum + booking.grossCents, 0))} ${options.leitwaehrung} ` +
      '(Soll and Haben of the imported Einzelbuchungen each, without the MWST bookings Abacus adds)',
    `  Program: F11 Buchen (drop the file into the booking window) or F5534 "Import/Export Buchungen AbaConnect" with import type "${INTERFACE_ID}"`,
    `  Interface: ${APPLICATION} / ${INTERFACE_ID} / ${MAP_ID}, version ${options.version}`,
    `  Mandant: ${options.mandant}, Geschäftsbereich ${options.geschaeftsbereich}, Leitwährung ${options.leitwaehrung}`,
    `  Abrechnungsart: ${options.abrechnungsart} (UseCode ${useCode(options.abrechnungsart)})`,
    `  MWST-Codes: ${mwstCodes.join(', ') || 'none'}`,
    `  Account -> MWST-Code: ${accountCodes.join(', ') || 'none'}`,
    `  TaxAccount: ${collective} in CollectiveInformation (${TAX_ACCOUNT_AT_RATE_ZERO === 'zero' ? '0' : 'also'} on MWST-Codes at rate 0, ` +
      `TAX_ACCOUNT_AT_RATE_ZERO ${TAX_ACCOUNT_AT_RATE_ZERO}), ${singleTaxAccount} in SingleInformation, 0 on bookings without MWST`,
    `  TaxData: TaxType ${TAX_TYPE_OUTPUT}, tax ${taxSign('D') < 0 ? 'negative' : 'positive'} when the Single account is credited, ` +
      `AmountData/Amount ${TAX_AMOUNT_IN_KEY_CURRENCY === 'zero' ? '0.00' : 'the tax'} (TAX_AMOUNT_IN_KEY_CURRENCY ${TAX_AMOUNT_IN_KEY_CURRENCY}), ` +
      `TaxIncluded ${TAX_INCLUDED_AT_RATE_ZERO} at rate 0 (TAX_INCLUDED_AT_RATE_ZERO), SINGLE_TAX_ACCOUNT ${SINGLE_TAX_ACCOUNT}`,
    `  Belegnummern: ${last < 0 ? 'none' : `${formatDocumentNumber(options.from, 0)} to ${formatDocumentNumber(options.from, last)}`}`,
    '  Import with "MWST berechnen", as Abacus recommends. With it, Abacus may take the default MWST-Code of each account in F21',
    '  instead of the file\'s code: every account listed above must carry the listed MWST-Code in F21, or the MWST-Abrechnung is wrong.',
  ];
}
