## 1. Summary and protocol

- [x] 1.1 `src/export/summary.ts`: the order and content of the requirement "Dry run" with the Kennzahl from `taxReturnLine`, Odoo VAT, apaleo VAT and difference per rate and per day, entries, lines and rounding lines; the explaining sentence in English CLI output. Since the o03 review the revenue and deposit sections are labelled as apaleo's figures before the base fitting (`apaleo per line`, `apaleo precise`, difference per line minus precise) and Odoo's VAT per tax is only in the import block (difference Odoo minus apaleo); keep these labels and that sign convention when Odoo's VAT moves into the per-rate lines
- [x] 1.2 Protocol: same summary, the import block, and per entry line the netted source entry numbers and receipts (from o03), with the `DEMO` first line for the demo
- [x] 1.3 Tests in `test/export/` for "Review before the first file", "German rates with their Kennzahl" and "VAT difference per tax rounding"

## 2. Checks and re-runs

- [x] 2.1 `src/export/checks.ts`: wording of the movement model; the writer's `E-ODOO-*` findings reported like the other blocking checks; tests for "Side bug is caught", "Fitting bug is caught" and the BER aggregate scenario
- [x] 2.2 Re-run advice from `odooTarget.advice`; `.replaced-<timestamp>.csv`; revision in the `TargetWriter` render options, `revisionOf()` in the `TargetWriter` interface, revision in the manifest, next revision on `--overwrite`; tests for every scenario of "Idempotent re-runs", including a golden pair of revision 1 and revision 2 of the German month after a late posting
- [x] 2.3 Pipeline: pass the chosen revision to `target.render(...)` and `target.importBlock(...)` in `src/export/pipeline.ts` (today both fall back to revision 1); an export test that runs `export --overwrite` after a late posting and checks the `_r2` External IDs, „(Korrektur 2)“ in the references and `Revision: 2` in the protocol; then remove the „Noch nicht umgesetzt“ notes from `docs/odoo-import.md` (Einen Monat ersetzen) and `docs/odoo-format.md` (Korrekturen) and the test that requires them (from the o04 review)

## 3. Demo and examples

- [x] 3.1 `examples/demo/`: the German month as demo data (EUR, `Europe/Berlin`), the SKR03 template mapping as a Kanzlei would fill it (Kurtaxe `1590`), config with `journal: APA`, `version: 19`, `taxRounding: per_tax`, `roundingAccount`; `examples/demo/README.md` in German (Germany)
- [x] 3.2 Demo marking: file name, reference, External IDs, protocol first line; tests in `test/cli/demo.test.ts`
- [x] 3.3 `docs/examples/`: `ODOO_Buchungen_20260901-20260930_BSP.csv` (golden, without `DEMO`), its protocol, `mapping-BSP.example.csv`, `README.md`; `test/examples.test.ts` compares them with the current output
- [x] 3.4 Remove the Abacus example files from `docs/examples/`

## 4. Docs

- [x] 4.1 Rewrite `docs/export.md` and `docs/examples/README.md` per "Export doc for Odoo"; the release check greps both for Swiss and Austrian practice terms and `«` `»`

## 5. Release check

- [x] 5.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green
- [x] 5.2 `node dist/cli/main.js export --month 2026-09 --demo --dry-run` shows EUR, Kz 81, Kz 86 and a rounding line; `node dist/cli/main.js export --month 2026-09 --demo` writes `demo-output/BSP/2026-09/ODOO_Buchungen_20260901-20260930_BSP_DEMO.csv`
