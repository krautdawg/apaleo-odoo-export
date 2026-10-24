## Why

The export writes correct Odoo files since o03, but what a hotel and its Kanzlei see around the file is still shaped for Abacus: the dry-run summary and protocol speak of MWST-Codes and Ziffern, the plausibility checks describe the Abacus movement model, the re-run advice talks about the Nebenjournal, and the demo and `docs/examples/` show the o03 stop-gap. Before anyone sets the tool up, they should be able to run the demo, read a real-looking protocol and hand the example CSV to their Steuerberater for a test import.

## What Changes

- Dry run and protocol: summary per Odoo account and per Odoo tax and rate with Kennzahl, net, Odoo's modelled VAT, apaleo's VAT and the difference per rate for the month and the days with a difference, levies, payments, deposits, receivables, write-offs, rounding lines, skipped lines and findings, then the import block.
- Plausibility checks described with the Odoo movement model and German scenarios; `E-VAT-TOTAL` compares the bookings' apaleo tax per rate, and the writer's `E-ODOO-*` checks cover the fitted file.
- Re-runs: `--overwrite` writes the next revision of the file (new External IDs `_r<N>`, reference „(Korrektur N)“, revision in the manifest), because a reversal in Odoo keeps the External ID of a posted entry and a corrected file with the old IDs would be refused; `E-FILE-EXISTS` and `E-PERIOD-OVERLAP` with the Odoo advice (delete the drafts of the earlier revision filtered by reference, reverse its posted entries, then import); scenarios for changed `odoo.journal` and `odoo.taxRounding`.
- Demo: "Hotel Beispiel Berlin" (`BSP`, EUR, `Europe/Berlin`, September 2026) from the German fixture month, SKR03 template mapping, `odoo.version: 19` with `per_tax` and a rounding account; `ODOO_Buchungen_20260901-20260930_BSP_DEMO.csv` with `DEMO` in the reference and the External IDs.
- `docs/examples/` with the golden demo CSV, its protocol and the mapping; `docs/export.md` and `docs/examples/README.md` rewritten in German as used in Germany.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `export-run`: dry run, plausibility checks, idempotent re-runs.
- `documentation`: example output and demo mode.

## Non-goals

- No change of the file format or the fitting (o02), no posting change (o05).
- No README rewrite (o08); Docker and schedule follow in o07.

## Impact

- `src/export/summary.ts`, `src/export/checks.ts`, `src/export/output.ts` (advice texts and revisions come from the target), `src/export/target.ts` (`revisionOf`, revision in the render options and the manifest), `src/demo/`, `examples/demo/`, `docs/examples/`, `docs/export.md`, tests in `test/export/`, `test/cli/demo.test.ts`, `test/examples.test.ts`.
