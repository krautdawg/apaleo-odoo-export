import { ConfigNotFoundError, EXAMPLE_CONFIG_FILE, loadConfig, resolveConfigPath } from '../../core/config.js';
import { roundingMethodLabel } from '../../odoo/format.js';
import { CONFIG_OPTION, EXIT_OK, stringOption, type Command } from '../command.js';
import { VERSION } from '../version.js';

export const doctor: Command = {
  name: 'doctor',
  summary: 'Check the setup: Node.js version, config file and clock (no network)',
  usage: '[--config <path>]',
  options: { ...CONFIG_OPTION },
  async run(args, ctx) {
    const path = resolveConfigPath(stringOption(args.values, 'config'), ctx.env, ctx.cwd);
    const print = (label: string, value: string) => ctx.stdout.write(`${`${label}:`.padEnd(15)}${value}\n`);

    print('apaleo-odoo', VERSION);
    print('Node.js', process.version);
    print('Clock', ctx.now().toISOString());
    print('Config file', path);

    try {
      const loaded = await loadConfig({ path, env: ctx.env, readFile: ctx.fs.readFile });
      print('Config', 'valid');
      print('Client id', loaded.config.apaleo.clientId ? 'set' : 'not set (apaleo.clientId or APALEO_CLIENT_ID)');
      print('Client secret', loaded.secrets.apaleoClientSecret ? 'set (APALEO_CLIENT_SECRET)' : 'not set (APALEO_CLIENT_SECRET)');
      const { odoo } = loaded.config;
      const rounding = odoo.taxRounding === 'per_tax' ? `per_tax, rounding account ${odoo.roundingAccount ?? 'not set'}` : 'per_line';
      print('Odoo', `version ${odoo.version}, company ${odoo.companyId}, journal ${odoo.journal}, currency ${odoo.currency}`);
      print('Tax rounding', rounding);
      ctx.stdout.write(
        `The tax rounding must equal the rounding method of the Odoo company (Settings > Accounting > Taxes > Rounding Method: ` +
          `"${roundingMethodLabel(odoo.taxRounding, odoo.version)}"), or Odoo adds an "Automatic Balancing Line" to the entries.\n`,
      );
      const { schedule } = loaded.config;
      print('Schedule', `cadence ${schedule.cadence}, time zone ${schedule.timezone}`);
    } catch (error) {
      if (!(error instanceof ConfigNotFoundError)) throw error;
      print('Config', `not found (copy ${EXAMPLE_CONFIG_FILE} to get started)`);
    }
    return EXIT_OK;
  },
};
