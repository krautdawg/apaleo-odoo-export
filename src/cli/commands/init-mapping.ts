import { resolve } from 'node:path';
import { UsageError, UserError } from '../../core/errors.js';
import {
  VAT_ACCOUNT_TYPES,
  appendRows,
  carryOverAccounts,
  loadTemplate,
  mappingHeaderComment,
  newRows,
  parseConnectorExport,
  parseMapping,
  renderMappingFile,
  suggestRows,
  type ConnectorAccount,
  type MappingRowValues,
  type TemplateSettings,
} from '../../mapping/index.js';
import { CONFIG_OPTION, EXIT_OK, stringOption, type Command } from '../command.js';
import type { CommandContext } from '../context.js';
import { readIfExists, writeFileAtomic } from '../files.js';
import { mappingPath } from '../mapping-file.js';
import { createSource, loadCommandConfig } from '../source.js';
import { formatTable } from '../table.js';

/** The templates `--template` accepts. */
const TEMPLATES = ['kmu-hotel'] as const;

export const initMapping: Command = {
  name: 'init-mapping',
  summary: 'Write a mapping CSV for a property from its apaleo chart of accounts and the KMU hotel template',
  usage: '--property <id> [--template kmu-hotel] [--out <file>] [--update] [--accounts-from <file>] [--config <path>]',
  options: {
    property: { type: 'string', valueName: '<id>', description: 'apaleo property id, for example BSP' },
    template: {
      type: 'string',
      valueName: '<kmu-hotel>',
      description: 'Template of the suggestions: kmu-hotel, the Schweizer Kontenrahmen KMU for hotels (default)',
    },
    out: { type: 'string', valueName: '<file>', description: 'Mapping file (default: properties[].mapping or ./mapping-<id>.csv)' },
    update: { type: 'boolean', description: 'Append rows for new apaleo accounts to an existing file; existing rows stay unchanged' },
    'accounts-from': {
      type: 'string',
      valueName: '<file>',
      description: 'Take the Abacus accounts and Kostenstellen from the account export of a paid connector',
    },
    ...CONFIG_OPTION,
  },
  async run(args, ctx) {
    const propertyId = stringOption(args.values, 'property');
    if (!propertyId) throw new UsageError('init-mapping needs --property <id>. Run "apaleo-abacus properties" to list them.');
    const template = stringOption(args.values, 'template') ?? 'kmu-hotel';
    if (!(TEMPLATES as readonly string[]).includes(template)) {
      throw new UsageError(`Unknown template "${template}". --template must be ${TEMPLATES.join(' or ')} (the Schweizer Kontenrahmen KMU for hotels).`);
    }
    const update = args.values.update === true;

    const loaded = await loadCommandConfig(args.values, ctx);
    const settings: TemplateSettings = { mwstCodes: loaded.config.abacus.mwstCodes };
    const path = mappingPath(loaded, propertyId, stringOption(args.values, 'out'), ctx.cwd);
    const existing = await readIfExists(ctx, path);
    if (existing && !update) {
      throw new UserError(
        `${path} already exists and was not changed. Run again with --update to add new apaleo accounts to it, ` +
          'or choose another file with --out.',
      );
    }
    // Read the files before calling apaleo, so a broken file fails fast.
    const mapping = existing ? parseMapping(existing, { path }) : undefined;
    const connector = await readConnectorExport(ctx, stringOption(args.values, 'accounts-from'));

    const accounts = await createSource(loaded, ctx).getChartOfAccounts(propertyId);
    const kmu = await loadTemplate();
    let rows = suggestRows(accounts, kmu, settings);
    if (connector) {
      const carried = carryOverAccounts(rows, connector.accounts, accounts, kmu, settings);
      rows = carried.rows;
      printCarriedOver(ctx, connector.path, carried.carried, carried.notInChart, carried.withoutRow);
    }

    if (!existing || !mapping) {
      await writeFileAtomic(ctx, path, renderMappingFile([mappingHeaderComment(kmu, settings)], rows));
      ctx.stdout.write(`Wrote ${path} from template ${kmu.id} for property ${propertyId}.\n`);
      printCounts(ctx, rows);
      ctx.stdout.write(
        'Every row is a suggestion (Vorschlag, ungeprüft): have your Treuhänder check the file, fill in the empty Abacus accounts, ' +
          'then run "apaleo-abacus mapping check".\n',
      );
      return EXIT_OK;
    }

    const added = newRows(mapping.rows, rows);
    if (added.length === 0) {
      ctx.stdout.write(`No new apaleo accounts: ${path} is unchanged.\n`);
      return EXIT_OK;
    }
    await writeFileAtomic(ctx, path, appendRows(existing, added));
    ctx.stdout.write(`Updated ${path}: existing rows unchanged.\n`);
    printAdded(ctx, added);
    return EXIT_OK;
  },
};

async function readConnectorExport(ctx: CommandContext, flag: string | undefined): Promise<{ path: string; accounts: ConnectorAccount[] } | undefined> {
  if (flag === undefined) return undefined;
  const path = resolve(ctx.cwd, flag);
  const bytes = await readIfExists(ctx, path);
  if (!bytes) throw new UserError(`No account export at ${path} (--accounts-from).`);
  return { path, accounts: parseConnectorExport(bytes, path) };
}

function printCarriedOver(
  ctx: CommandContext,
  path: string,
  carried: number,
  notInChart: readonly ConnectorAccount[],
  withoutRow: readonly ConnectorAccount[],
): void {
  ctx.stdout.write(`Took the Abacus account and Kostenstelle of ${carried} apaleo account(s) from the account export ${path}; MWST-Codes come from the template.\n`);
  const list = (accounts: readonly ConnectorAccount[]) =>
    formatTable(accounts.map((a) => [a.apaleoAccount, a.apaleoType, a.apaleoName, a.abacusAccount]), [], '  ');
  if (notInChart.length > 0) {
    ctx.stdout.write(`${notInChart.length} account(s) of the export are not in the apaleo chart of accounts and were not taken over:\n${list(notInChart)}`);
  }
  if (withoutRow.length > 0) {
    ctx.stdout.write(
      `${withoutRow.length} account(s) of the export are parent accounts without a row of their own (the wildcard rows map their sub-accounts by rate) ` +
        `and were not taken over:\n${list(withoutRow)}`,
    );
  }
}

function printCounts(ctx: CommandContext, rows: readonly MappingRowValues[]): void {
  const needed = rows.filter((row) => !VAT_ACCOUNT_TYPES.has(row.apaleoType));
  const mapped = needed.filter((row) => row.abacusAccount !== '').length;
  const vatRows = rows.length - needed.length;
  ctx.stdout.write(
    `${rows.length} rows: ${mapped} mapped, ${needed.length - mapped} unmapped` +
      (vatRows > 0 ? `, ${vatRows} VAT account row(s) that need no Abacus account` : '') +
      '.\n',
  );
}

function printAdded(ctx: CommandContext, added: readonly MappingRowValues[]): void {
  ctx.stdout.write(`Added ${added.length} row(s) for new apaleo accounts:\n`);
  const rows = added.map((row) => [
    row.apaleoAccount,
    row.apaleoType,
    row.apaleoName,
    row.apaleoVatPercent === '' ? '' : `${row.apaleoVatPercent} %`,
    row.abacusAccount || '(unmapped)',
  ]);
  ctx.stdout.write(formatTable(rows, [], '  '));
  printCounts(ctx, added);
}
