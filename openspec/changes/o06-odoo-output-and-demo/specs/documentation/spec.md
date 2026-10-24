## MODIFIED Requirements

### Requirement: Example output and demo mode
The repository SHALL contain `docs/examples/` with a golden Odoo import file, its protocol text and a filled sample mapping CSV from the SKR03 hotel template for the German demo "Hotel Beispiel Berlin" (property `BSP`, EUR, `Europe/Berlin`, journal `APA`, `odoo.version` 19 with `taxRounding: per_tax` and a rounding account), linked from the README and the mapping guide, and `apaleo-odoo export --demo` SHALL run the pipeline on bundled German demo data in EUR with no config, secret or network, marking its output as demo.

#### Scenario: Steuerberater reviews before setup
- **WHEN** a Steuerberater opens `docs/examples/`
- **THEN** they find an `ODOO_Buchungen_*.csv` file in EUR, its protocol and the mapping that produced it, a README that says to import it only into a test database, and a test guarantees the CSV equals the current golden output

#### Scenario: Demo without credentials
- **WHEN** someone runs `apaleo-odoo export --month 2026-09 --demo --dry-run` with no config file and no `APALEO_CLIENT_SECRET`
- **THEN** the summary is printed with a `DEMO` marker, amounts in EUR, Kz 86 for 7 % and Kz 81 for 19 %, at least one rounding line, no network call is made, and the exit code is 0

#### Scenario: Demo file is marked in its name
- **WHEN** someone runs `apaleo-odoo export --month 2026-09 --demo` without `--dry-run`
- **THEN** the file is written below `./demo-output/` as `ODOO_Buchungen_20260901-20260930_BSP_DEMO.csv`, every reference starts with `DEMO `, every External ID contains `_DEMO_`, and the protocol's first line is `DEMO`, so it never looks like a real export in a file list or in Odoo

#### Scenario: Demo in the Docker image
- **WHEN** someone runs the real demo in the image with `-w /data` and a data folder owned by uid 1000, as docs/docker.md shows
- **THEN** the files appear in that folder under `demo-output/`, and CI runs exactly that; without a writable working directory the run fails with `E-EXPORT` and a hint naming `-w /data`

## ADDED Requirements

### Requirement: Export doc for Odoo
`docs/export.md` and `docs/examples/README.md` SHALL be rewritten in German as used in Germany (both checked by the German (Germany) rules of the docs test from this slice on): periods and the split per month, the date rules, the dry run with every part of the summary and how to compare it with Odoo after the import, the output folder with file, protocol and `manifest.json`, re-runs (`unchanged`, `E-FILE-EXISTS`, `--overwrite`, `E-PERIOD-OVERLAP`) with what to do in Odoo, and the demo.

#### Scenario: Hotel compares after the import
- **WHEN** a hotel reads the dry-run section of `docs/export.md`
- **THEN** it learns which line of the summary to compare with which Odoo view (tax lines per rate, balance of `1410` and `1360`), and that a difference per rate to apaleo comes from Odoo's rounding
