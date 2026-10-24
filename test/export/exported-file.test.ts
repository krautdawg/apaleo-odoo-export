import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TARGET, exportedFile, monthFolder } from '../../src/export/index.js';
import { createTestContext } from '../helpers/context.js';

const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' } as const;
const FILE = 'ABACUS_Buchungen_20260901-20260930_BSP.xml';
const folder = 'exports/BSP/2026-09';

function manifest(...files: object[]): string {
  return JSON.stringify({ files });
}

describe('exportedFile', () => {
  it('finds the current file of exactly the period on disk', async () => {
    const ctx = createTestContext({ files: { [`${folder}/${FILE}`]: 'x' } });
    expect(await exportedFile(ctx, join(ctx.cwd, folder), SEPTEMBER, DEFAULT_TARGET)).toBe(FILE);
  });

  it('finds the period in the manifest when the file was moved away', async () => {
    const ctx = createTestContext({ files: { [`${folder}/manifest.json`]: manifest({ file: FILE, status: 'current', ...SEPTEMBER }) } });
    expect(await exportedFile(ctx, join(ctx.cwd, folder), SEPTEMBER, DEFAULT_TARGET)).toBe(FILE);
  });

  it('ignores replaced files, other periods, a missing folder and an unreadable manifest', async () => {
    const ctx = createTestContext({
      files: {
        [`${folder}/ABACUS_Buchungen_20260901-20260930_BSP.replaced-20261020T080000Z.xml`]: 'old',
        [`${folder}/ABACUS_Buchungen_20260901-20260915_BSP.xml`]: 'part',
        [`${folder}/manifest.json`]: 'not json',
      },
    });
    expect(await exportedFile(ctx, join(ctx.cwd, folder), SEPTEMBER, DEFAULT_TARGET)).toBeUndefined();
    expect(await exportedFile(ctx, join(ctx.cwd, 'exports/BSP/2026-08'), { from: '2026-08-01', to: '2026-08-31' }, DEFAULT_TARGET)).toBeUndefined();
  });

  it('does not count a manifest entry of a replaced file', async () => {
    const ctx = createTestContext({ files: { [`${folder}/manifest.json`]: manifest({ file: 'old.xml', status: 'replaced', ...SEPTEMBER }) } });
    expect(await exportedFile(ctx, join(ctx.cwd, folder), SEPTEMBER, DEFAULT_TARGET)).toBeUndefined();
  });
});

describe('monthFolder', () => {
  it('resolves output.dir against the working directory, or takes an absolute one as it is', () => {
    expect(monthFolder('/work', './exports', 'BSP', '2026-09')).toBe('/work/exports/BSP/2026-09');
    expect(monthFolder('/config', '/data', 'BSP', '2026-09')).toBe('/data/BSP/2026-09');
  });
});
