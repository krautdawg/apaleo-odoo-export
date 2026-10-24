## Why

After o03 the export writes Odoo files end to end, and the Abacus code is reached only by tests that pass it explicitly: `src/abacus/`, the KMU template, the `abacus` config section, the MWST-Code, Kostenstelle and Swiss warning logic, the Swiss fixture month, the Abacus golden files and the Abacus docs. Deleting them in a slice of their own keeps o03 reviewable as an engine switch and this slice reviewable as "only deletions, no behaviour change", plus the one doc that replaces the Abacus import guide.

## What Changes

- **BREAKING** Remove `src/abacus/` (writer, Belegnummern, TaxData, `abacusTarget`), `test/abacus/`, `test/golden/abacus/`, `test/helpers/abacus.ts`, `test/helpers/ch-month.ts`, `test/helpers/swiss-chart.ts`, `test/fixtures/apaleo/ch-month/`, the Abacus mapping fixtures and `test/fixtures/apaleo/live/VIE/mapping-VIE.abacus.csv`.
- **BREAKING** Remove `templates/kmu-hotel.rules.csv`, `src/mapping/kmu-sample-codes.ts`, the MWST-Code, Kostenstelle, Abrechnungsart and Mandant code paths, and the codes `E-ABACUS-*`, `N-ABACUS-*`, `E-MWST-CODE-*`, `W-MWST-CODE-*`, `E-KOST-FORMAT`, `W-KOST-IGNORED`, `W-MANDANT-SHARED`, `W-ABRECHNUNGSART-VEREINNAHMT`, `W-KURTAXE-TAXED`, `W-ANNULLATION-TAXED`, `W-UNTAXED-REVENUE`, `W-VAT-ROUNDING`, with their tests.
- **BREAKING** The `abacus` config section is refused with an error naming `odoo`; the Abacus fields leave `TargetManifestFields`.
- Remove `src/abacus` from the lint boundary.
- Remove `docs/abacus-format.md` and `docs/abacus-import.md`, write `docs/odoo-import.md` (German, Germany), fix links, remove deleted codes from `docs/troubleshooting.md`, and switch the compatibility-claim check from Abacus to Odoo.
- Remove `openspec/research/a-target.md`; `docs/architecture.md` points to `renderOdooCsv`, `OdooValidationError` and `test/golden/odoo/`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `abacus-xml-writer`: removed.
- `account-mapping`: Swiss template rows and warnings removed.
- `posting-rules`: Vereinnahmte Entgelte and the Swiss fixture month removed.
- `cli`: the `abacus` section is refused.
- `project-quality`: `src/abacus` leaves the lint boundary.
- `documentation`: first import in Odoo; compatibility claims about Odoo.

## Non-goals

- No behaviour change: every Odoo golden file, protocol and test from o03 stays byte-identical.
- No README or guide rewrite beyond removing dead links, files and codes (o08); German special cases follow in o05.

## Impact

- Deleted: the files above.
- Changed: `src/core/config.ts`, `src/export/target.ts`, `src/mapping/`, `src/posting/`, `src/cli/commands/doctor.ts`, `eslint.config.js`, `test/lint/boundaries.test.ts`, `test/docs.test.ts`, `test/helpers/docs.ts`, `test/readme.test.ts`, `docs/troubleshooting.md`, `docs/architecture.md`, `docs/maintainers.md`, links in README and `docs/`.
