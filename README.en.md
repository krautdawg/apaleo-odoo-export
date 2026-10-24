# apaleo-abacus-export

**Deutsch:** [README.md](README.md)

Free, open-source export from the apaleo hotel PMS to the Abacus Finanzbuchhaltung (FIBU), for Swiss hotels and their Treuhänder. It reads the apaleo ledger of a month through a read-only apaleo custom app, books every line with an account mapping per property (a Swiss KMU-Kontenrahmen hotel template with MWST-Codes), passes the gross amount and the VAT apaleo charged, and writes one AbaConnect "XML Buchungen" file per property and month that the Treuhänder imports into Abacus. Bookings are in the property currency, which must be the Leitwährung of the Abacus Mandant (CHF or EUR); only Swiss MWST rules apply. It runs on your own machine or in a locally built Docker container. No subscription, no hosted service.

The file follows the documented AbaConnect interface "XML Buchungen"; a first test import with a Treuhänder is still pending. The tool is built on [apaleo-bmd-export](https://github.com/krautdawg/apaleo-bmd-export) and [apaleo-datev-export](https://github.com/krautdawg/apaleo-datev-export).

> **No warranty, not tax advice.** Your Treuhänder must review the account mapping, the MWST-Codes and the first Abacus imports. Read the [disclaimer](DISCLAIMER.md) (the German text is binding, an English translation follows it).

## Quick start

There is no npm package or container image release yet. You install from source.

1. Create an apaleo custom app (Apps > Connected apps > Add a new app > Add custom app, page "New simple client", personal data "Omit all") with the permissions in [docs/setup-apaleo.md](docs/setup-apaleo.md).
2. Install (needs Node.js 24 and git):

   ```sh
   git clone https://github.com/krautdawg/apaleo-abacus-export.git
   cd apaleo-abacus-export
   corepack enable
   pnpm install --frozen-lockfile
   pnpm build
   node dist/cli/main.js --help
   ```

   The commands below use `apaleo-abacus` (after `pnpm link --global`). Without it, type `node dist/cli/main.js` instead.

3. Try it on the bundled demo data, without apaleo: `node dist/cli/main.js export --month 2026-09 --demo --dry-run`.
4. Copy `apaleo-abacus.config.example.yaml` to `apaleo-abacus.config.yaml`, fill in the client id, the Abacus Mandant (`abacus.mandant`) and your property under `properties` (`apaleo-abacus properties` lists the ids; `export` exports every property listed there), and set the secret in the environment (`APALEO_CLIENT_SECRET`), never in the file. Then create the mapping, have your Treuhänder check it, and export:

   ```sh
   apaleo-abacus init-mapping --property BSP --template kmu-hotel
   apaleo-abacus export --month 2026-09 --dry-run
   apaleo-abacus export --month 2026-09
   ```

## Documentation (German)

The documentation is written in Swiss Standard German for hotels and their Treuhänder in Switzerland:

- [README.md](README.md): overview, quick start, Docker, comparison, FAQ
- [docs/setup-apaleo.md](docs/setup-apaleo.md): the apaleo custom app and its permissions
- [docs/mapping-guide.md](docs/mapping-guide.md): the account mapping (KMU template, MWST-Codes, Kurtaxe, Anzahlungen), for the Treuhänder
- [docs/abacus-import.md](docs/abacus-import.md): importing the file into Abacus FIBU and the first-import checklist
- [docs/abacus-format.md](docs/abacus-format.md): the fields of the file and the sources they were checked against
- [docs/posting-rules.md](docs/posting-rules.md), [docs/export.md](docs/export.md): how each apaleo line becomes a booking
- [docs/configuration.md](docs/configuration.md), [docs/docker.md](docs/docker.md), [docs/troubleshooting.md](docs/troubleshooting.md)
- [docs/architecture.md](docs/architecture.md): modules and how to add a source or a target writer

## Contributing

Issues and pull requests in English are welcome. Code, identifiers, CLI output and commit messages are English. Read [CONTRIBUTING.md](CONTRIBUTING.md) (German) and [SECURITY.md](SECURITY.md) first; fixtures never contain real guest data.

## Licence

[MIT](LICENSE). Not affiliated with apaleo GmbH or Abacus Research AG.
