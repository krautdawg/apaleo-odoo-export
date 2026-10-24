## Why

Odoo imports journal entries with its standard import (Accounting > Journal Entries > Import records, CSV of `account.move` with `line_ids` rows) on every edition and hosting, without credentials (research §1-2). The main risk is VAT: a file cannot carry tax lines, Odoo computes them from `tax_ids` on net base lines and silently adds an "Automatic Balancing Line" when its tax does not fit (research §3). This slice adds the writer with a model of Odoo's tax computation and base fitting, pinned by golden files.

## What Changes

- New module `src/odoo/`: the per-line booking type `OdooBooking` (debit and credit account, gross, VAT side with Odoo tax External ID, rate and apaleo tax, labels), the daily entry builder (one `account.move` per property and business day, lines netted per account, tax and label), `odooTax()` (Odoo's tax for a set of base lines, per line or per tax, half away from zero) and the base fitting, the CSV renderer (technical headers, one row per line, External IDs for entries and lines with a revision for replacement files, `ref` `apaleo <property> <date>`), sanitising and validation reporting every problem at once.
- `odooTarget: TargetWriter<OdooBooking>`: file name `ODOO_Buchungen_<from>-<to>_<propertyId>.csv`, file pattern, byte comparison, `revisionOf()` of an existing file, protocol import block (company, journal, rounding method, taxes with rate and Kennzahl, checks after import), Odoo refusal advice, movement model, Kennzahl per rate (19 % Kz 81, 7 % Kz 86) and the currency `odoo.currency`.
- Config section `odoo`: `journal` (required), `companyId` (`1`), `currency` (`EUR`, `CHF`), `version` (`17`, `18`, `19`, required), `taxRounding` (`per_line` | `per_tax`, default by version), `roundingAccount` (required with `per_tax`); per-property `journal`.
- Golden files in `test/golden/odoo/`; `docs/odoo-format.md` in German (Germany) with columns, rules and sources.
- A local maintainer test import outside CI (`scripts/odoo-check/`: Docker containers `odoo:17`, `odoo:18`, `odoo:19` with postgres and l10n_de SKR03/SKR04, the golden files imported through Odoo's own `base_import`, no credentials, no hosted Odoo), recorded under `## Testimporte` in `docs/maintainers.md`; o03 starts only after it, so the tax model is checked against real Odoo before mapping, demo and docs are built on it.
- Abacus stays the default target until o03.

## Capabilities

### New Capabilities

- `odoo-journal-writer`: the Odoo journal-entry import file: daily entries, columns, External IDs, taxes by External ID, Odoo tax model and base fitting, validation, file name, import block and golden tests.

### Modified Capabilities

- `cli`: the `odoo` config section.
- `project-quality`: `src/odoo` joins the modules that must not import source adapters.

## Non-goals

- No tax lines, tax tags, partners, invoices or posting: entries stay drafts.
- No XLSX (no runtime dependency), no push through the Odoo API, no analytic accounts (`analytic_distribution`), all `Später geplant`.
- No mapping, posting or pipeline change (o03).

## Impact

- New: `src/odoo/`, `test/odoo/`, `test/golden/odoo/`, `test/helpers/odoo.ts`, `docs/odoo-format.md`, `scripts/odoo-check/`.
- Changed: `src/core/config.ts`, `src/export/target.ts` (Odoo manifest fields), `apaleo-odoo.config.example.yaml`, `docs/configuration.md`, `docs/troubleshooting.md`, `docs/maintainers.md` (`## Lokaler Testimport`, `## Testimporte`, `## Später geplant`), `eslint.config.js`.
