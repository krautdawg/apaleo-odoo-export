import { readFileSync } from 'node:fs';
import { parseMapping, type Mapping } from '../../src/mapping/index.js';
import { fixturePath } from './apaleo.js';

/**
 * `live/VIE/mapping-VIE.abacus.csv`: the Abacus mapping of the recorded VIE chart,
 * written by hand (design decision 9). VIE books at the Austrian rates 10, 13 and
 * 20 % in EUR, which the placeholder codes V10, V13 and V20 carry; the no-show at
 * 13 % is filled in as taxable, as apaleo charged it.
 */
export const VIE_MAPPING = readFileSync(fixturePath('live/VIE/mapping-VIE.abacus.csv'), 'utf8');

/** `VIE_MAPPING` loaded as the export loads a mapping file. */
export function vieMapping(): Mapping {
  return parseMapping(new TextEncoder().encode(VIE_MAPPING), { path: 'mapping-VIE.csv' });
}
