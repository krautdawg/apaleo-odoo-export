import { UsageError, UserError } from '../../core/errors.js';
import { formatFinding } from '../../core/findings.js';
import {
  TEMPLATE_NAMES,
  VAT_ACCOUNT_TYPES,
  appendRows,
  loadTemplate,
  mappingHeaderComment,
  newRows,
  parseMapping,
  renderMappingFile,
  suggestRows,
  templateSuggestions,
  type MappingRowValues,
  type TemplateName,
  type TemplateSettings,
} from '../../mapping/index.js';
import { CONFIG_OPTION, EXIT_OK, stringOption, type Command } from '../command.js';
import type { CommandContext } from '../context.js';
import { readIfExists, writeFileAtomic } from '../files.js';
import { mappingPath } from '../mapping-file.js';
import { createSource, loadCommandConfig } from '../source.js';
import { formatTable } from '../table.js';

export const initMapping: Command = {
  name: 'init-mapping',
  summary: 'Write a mapping CSV for a property from its apaleo chart of accounts and the SKR03 or SKR04 hotel template for Odoo',
  usage: '--property <id> --template skr03-hotel|skr04-hotel [--out <file>] [--update] [--config <path>]',
  options: {
    property: { type: 'string', valueName: '<id>', description: 'apaleo property id, for example BSP' },
    template: {
      type: 'string',
      valueName: '<skr03-hotel|skr04-hotel>',
      description: 'Template of the suggestions: skr03-hotel or skr04-hotel, the hotel accounts and taxes of Odoo\'s German chart SKR03 or SKR04',
    },
    out: { type: 'string', valueName: '<file>', description: 'Mapping file (default: properties[].mapping or ./mapping-<id>.csv)' },
    update: { type: 'boolean', description: 'Append rows for new apaleo accounts to an existing file; existing rows stay unchanged, new template suggestions for empty rows are listed' },
    ...CONFIG_OPTION,
  },
  async run(args, ctx) {
    const propertyId = stringOption(args.values, 'property');
    if (!propertyId) throw new UsageError('init-mapping needs --property <id>. Run "apaleo-odoo properties" to list them.');
    const template = stringOption(args.values, 'template');
    if (template === undefined) {
      throw new UsageError(`init-mapping needs --template ${TEMPLATE_NAMES.join(' or ')}: the chart of accounts (SKR03 or SKR04) of the Odoo company.`);
    }
    if (!(TEMPLATE_NAMES as readonly string[]).includes(template)) {
      throw new UsageError(`Unknown template "${template}". --template must be ${TEMPLATE_NAMES.join(' or ')} (the hotel templates for Odoo with SKR03 or SKR04).`);
    }
    const update = args.values.update === true;

    const loaded = await loadCommandConfig(args.values, ctx);
    const settings: TemplateSettings = { version: loaded.config.odoo.version };
    const path = mappingPath(loaded, propertyId, stringOption(args.values, 'out'), ctx.cwd);
    const existing = await readIfExists(ctx, path);
    if (existing && !update) {
      throw new UserError(
        `${path} already exists and was not changed. Run again with --update to add new apaleo accounts to it, ` +
          'or choose another file with --out.',
      );
    }
    // Read the file before calling apaleo, so a broken file fails fast.
    const mapping = existing ? parseMapping(existing, { path }) : undefined;

    const accounts = await createSource(loaded, ctx).getChartOfAccounts(propertyId);
    const rules = await loadTemplate(template as TemplateName);
    const rows = suggestRows(accounts, rules, settings);

    if (!existing || !mapping) {
      await writeFileAtomic(ctx, path, renderMappingFile([mappingHeaderComment(rules, settings)], rows));
      ctx.stdout.write(`Wrote ${path} from template ${rules.id} for property ${propertyId} and Odoo ${settings.version}.\n`);
      printCounts(ctx, rows);
      ctx.stdout.write(
        'Every row is a suggestion (Vorschlag, ungeprüft): have your Steuerberater check the file, compare the Kasse and Geldtransit codes ' +
          'with the Kontenplan of the Odoo company, fill in the empty Odoo accounts, then run "apaleo-odoo mapping check".\n',
      );
      return EXIT_OK;
    }

    const added = newRows(mapping.rows, rows);
    const suggestions = templateSuggestions(mapping.rows, rows, rules.id);
    if (added.length === 0) {
      ctx.stdout.write(`No new apaleo accounts: ${path} is unchanged.\n`);
    } else {
      await writeFileAtomic(ctx, path, appendRows(existing, added));
      ctx.stdout.write(`Updated ${path}: existing rows unchanged.\n`);
      printAdded(ctx, added);
    }
    for (const finding of suggestions) ctx.stdout.write(`${formatFinding(finding)}\n`);
    return EXIT_OK;
  },
};

function printCounts(ctx: CommandContext, rows: readonly MappingRowValues[]): void {
  const needed = rows.filter((row) => !VAT_ACCOUNT_TYPES.has(row.apaleoType));
  const mapped = needed.filter((row) => row.odooAccount !== '').length;
  const vatRows = rows.length - needed.length;
  ctx.stdout.write(
    `${rows.length} rows: ${mapped} mapped, ${needed.length - mapped} unmapped` +
      (vatRows > 0 ? `, ${vatRows} VAT account row(s) that need no Odoo account` : '') +
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
    row.odooAccount || '(unmapped)',
  ]);
  ctx.stdout.write(formatTable(rows, [], '  '));
  printCounts(ctx, added);
}
