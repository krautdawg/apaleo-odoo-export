## Why

After o03 the export writes Odoo files end to end, and o03 already deleted every Abacus behaviour whose requirement it removed (KMU template, MWST-Code and Kostenstelle logic, Swiss warnings, Swiss fixture month, the Abacus posting rules). What is left is the Abacus writer with its own tests and golden files, the `abacus` config section it reads, and the Abacus docs. Deleting them in a slice of their own keeps o03 reviewable as an engine switch and this slice reviewable as "only deletions, no behaviour change", plus the one doc that replaces the Abacus import guide.

## What Changes

- **BREAKING** Remove `src/abacus/` (writer, Belegnummern, TaxData, `abacusTarget`), `test/abacus/`, `test/golden/abacus/`, `test/helpers/abacus.ts` and any test helper only these use (for example `test/helpers/swiss-chart.ts`).
- **BREAKING** Remove the Abrechnungsart and Mandant code paths of the `abacus` section and the codes `E-ABACUS-*`, `N-ABACUS-*`, `W-MANDANT-SHARED` and `W-ABRECHNUNGSART-VEREINNAHMT`, with their tests.
- **BREAKING** The `abacus` config section is refused with an error naming `odoo`; the Abacus fields leave `TargetManifestFields`.
- Remove `src/abacus` from the lint boundary.
- Remove `docs/abacus-format.md` and `docs/abacus-import.md`, write `docs/odoo-import.md` (German, Germany), fix links, remove deleted codes from `docs/troubleshooting.md`, and switch the compatibility-claim check from Abacus to Odoo.
- Remove `openspec/research/a-target.md`; `docs/architecture.md` points to `renderOdooCsv`, `OdooValidationError` and `test/golden/odoo/`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `abacus-xml-writer`: removed.
- `cli`: the `abacus` section is refused.
- `project-quality`: `src/abacus` leaves the lint boundary.
- `documentation`: first import in Odoo (preparation with the generated account codes and a single active company, revisions, undo); compatibility claims about Odoo.

## Non-goals

- No behaviour change: every Odoo golden file, protocol and test from o03 stays byte-identical.
- No README or guide rewrite beyond removing dead links, files and codes (o08); German special cases follow in o05.
- No deletion of Swiss template, posting or warning code: o03 did that together with the requirements it removed.

## Impact

- Deleted: the files above.
- Changed: `src/core/config.ts`, `src/export/target.ts`, `src/export/pipeline.ts`, `src/cli/commands/doctor.ts`, `eslint.config.js`, `test/lint/boundaries.test.ts`, `test/docs.test.ts`, `test/helpers/docs.ts`, `test/readme.test.ts`, `docs/troubleshooting.md`, `docs/architecture.md`, `docs/maintainers.md`, links in README and `docs/`.
