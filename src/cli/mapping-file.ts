import { resolve } from 'node:path';
import type { LoadedConfig } from '../core/config.js';
import { UsageError } from '../core/errors.js';

/** `--mapping` (or `--out`), else `properties[].mapping` of the property, else `./mapping-<id>.csv`. */
export function mappingPath(loaded: LoadedConfig, propertyId: string | undefined, flag: string | undefined, cwd: string): string {
  if (flag) return resolve(cwd, flag);
  if (!propertyId) {
    throw new UsageError('Name the mapping with --mapping <file> or the property with --property <id>.');
  }
  const configured = loaded.config.properties.find((p) => p.id === propertyId)?.mapping;
  return resolve(cwd, configured ?? `mapping-${propertyId}.csv`);
}

/** `--property`, else the only property in the config, else undefined. */
export function defaultProperty(loaded: LoadedConfig, flag: string | undefined): string | undefined {
  if (flag) return flag;
  const [only, ...others] = loaded.config.properties;
  return only && others.length === 0 ? only.id : undefined;
}
