import { readFileSync } from 'node:fs';
import { parseMapping, type Mapping } from '../../src/mapping/index.js';
import { fixturePath } from './apaleo.js';

/**
 * `live/BER/mapping-BER.odoo.csv`: what `init-mapping --template skr03-hotel`
 * writes on the recorded BER chart for Odoo 18 (Kasse 1001, Geldtransit 1360).
 * The BER chart has no Kurtaxe account, so the file has no Kurtaxe row.
 */
export const BER_MAPPING = readFileSync(fixturePath('live/BER/mapping-BER.odoo.csv'), 'utf8');

/**
 * `live/VIE/mapping-VIE.odoo.csv`: the Odoo mapping of the recorded VIE chart,
 * written by hand. VIE books at the Austrian rates 10, 13 and 20 % in EUR, which
 * the l10n_at taxes `account_tax_template_sales_10_code029`, `_13_code006` and
 * `_20_code022` carry; the no-show at 13 % is filled in as taxable, as apaleo
 * charged it.
 */
export const VIE_MAPPING = readFileSync(fixturePath('live/VIE/mapping-VIE.odoo.csv'), 'utf8');

/** `BER_MAPPING` loaded as the export loads a mapping file. */
export function berMapping(): Mapping {
  return parseMapping(new TextEncoder().encode(BER_MAPPING), { path: 'mapping-BER.csv' });
}

/** `VIE_MAPPING` loaded as the export loads a mapping file. */
export function vieMapping(): Mapping {
  return parseMapping(new TextEncoder().encode(VIE_MAPPING), { path: 'mapping-VIE.csv' });
}
