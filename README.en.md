# apaleo-odoo-export

**Deutsch:** [README.md](README.md)

Free, open-source export from the apaleo hotel PMS to Odoo Accounting, for hotels in Germany and their Steuerberater (tax advisor). It reads the apaleo ledger of a month through a read-only apaleo custom app, books every line with an account mapping per property (hotel templates for the German charts SKR03 and SKR04, with the Odoo tax of each rate), and writes one CSV import file of journal entries per property and month: one draft entry per business day, every revenue line carrying its Odoo tax by External ID, so Odoo computes the VAT lines itself. The accountant imports the file with Odoo's standard import into Odoo 17, 18 or 19, Community or Enterprise, on Odoo Online, Odoo.sh or self-hosted; no API access and no module needed. It runs on your own machine or in a locally built Docker container. No subscription, no hosted service.

The file follows Odoo's documented import of journal entries; a first test import with a Steuerberater is still pending. The tool is built on [apaleo-datev-export](https://github.com/krautdawg/apaleo-datev-export), [apaleo-bmd-export](https://github.com/krautdawg/apaleo-bmd-export) and [apaleo-abacus-export](https://github.com/krautdawg/apaleo-abacus-export).

> **No warranty, not tax advice.** Your Steuerberater must review the account mapping, the Odoo taxes and the first Odoo imports. Read the [disclaimer](DISCLAIMER.md) (the German text is binding, an English translation follows it).

## Quick start

There is no npm package or container image release yet. You install from source.

1. Create an apaleo custom app (Apps > Connected apps > Add a new app > Add custom app, page "New simple client", personal data "Omit all") with the permissions in [docs/setup-apaleo.md](docs/setup-apaleo.md).
2. Install (needs Node.js 24 and git):

   ```sh
   git clone https://github.com/krautdawg/apaleo-odoo-export.git
   cd apaleo-odoo-export
   corepack enable
   pnpm install --frozen-lockfile
   pnpm build
   node dist/cli/main.js --help
   ```

   The commands below use `apaleo-odoo` (after `pnpm link --global`). Without it, type `node dist/cli/main.js` instead.

3. Try it on the bundled demo data, without apaleo: `node dist/cli/main.js export --month 2026-09 --demo --dry-run`.
4. Copy `apaleo-odoo.config.example.yaml` to `apaleo-odoo.config.yaml`, fill in the client id, the Odoo journal and version (`odoo.journal`, `odoo.version`) and your property under `properties` (`apaleo-odoo properties` lists the ids; `export` exports every property listed there), and set the secret in the environment (`APALEO_CLIENT_SECRET`), never in the file. Then create the mapping, have your Steuerberater check it, and export:

   ```sh
   apaleo-odoo init-mapping --property BSP --template skr03-hotel
   apaleo-odoo export --month 2026-09 --dry-run
   apaleo-odoo export --month 2026-09
   ```

5. Import the file in Odoo as described in [docs/odoo-import.md](docs/odoo-import.md): a dedicated miscellaneous journal, then Accounting > Accounting > Journal Entries > gear > Import records.

## Documentation (German)

The documentation is written in German for hotels in Germany and their Steuerberater:

- [README.md](README.md): overview, quick start, Docker, comparison, FAQ
- [docs/setup-apaleo.md](docs/setup-apaleo.md): the apaleo custom app and its permissions
- [docs/mapping-guide.md](docs/mapping-guide.md): the account mapping (SKR03 and SKR04 templates, Odoo taxes, Kurtaxe, Anzahlungen), for the Steuerberater
- [docs/odoo-import.md](docs/odoo-import.md): importing the file into Odoo and the first-import checklist
- [docs/odoo-format.md](docs/odoo-format.md): the fields of the file and the sources they were checked against
- [docs/posting-rules.md](docs/posting-rules.md), [docs/export.md](docs/export.md): how each apaleo line becomes a booking
- [docs/configuration.md](docs/configuration.md), [docs/docker.md](docs/docker.md), [docs/troubleshooting.md](docs/troubleshooting.md)
- [docs/architecture.md](docs/architecture.md): modules and how to add a source or a target writer

## Contributing

Issues and pull requests in English are welcome. Code, identifiers, CLI output and commit messages are English. Read [CONTRIBUTING.md](CONTRIBUTING.md) (German) and [SECURITY.md](SECURITY.md) first; fixtures never contain real guest data, and reports of Odoo test imports (version, edition, chart, rounding method, result) help most.

## Licence

[MIT](LICENSE). Not affiliated with apaleo GmbH or Odoo S.A.
