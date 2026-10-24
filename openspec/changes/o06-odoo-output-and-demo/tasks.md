## 1. Summary and protocol

- [ ] 1.1 `src/export/summary.ts`: the order and content of the requirement "Dry run" with the Kennzahl from `taxReturnLine`, Odoo VAT, apaleo VAT and difference per rate and per day, entries, lines and rounding lines; the explaining sentence in English CLI output
- [ ] 1.2 Protocol: same summary, the import block, and per entry line the netted source entry numbers and receipts (from o03), with the `DEMO` first line for the demo
- [ ] 1.3 Tests in `test/export/` for "Review before the first file", "German rates with their Kennzahl" and "VAT difference per tax rounding"

## 2. Checks and re-runs

- [ ] 2.1 `src/export/checks.ts`: wording of the movement model; the writer's `E-ODOO-*` findings reported like the other blocking checks; tests for "Side bug is caught", "Fitting bug is caught" and the BER aggregate scenario
- [ ] 2.2 Re-run advice from `odooTarget.advice`; `.replaced-<timestamp>.csv`; tests for every scenario of "Idempotent re-runs"

## 3. Demo and examples

- [ ] 3.1 `examples/demo/`: the German month as demo data (EUR, `Europe/Berlin`), the SKR03 template mapping as a Kanzlei would fill it (Kurtaxe `1590`), config with `journal: APA`, `version: 19`, `taxRounding: per_tax`, `roundingAccount`; `examples/demo/README.md` in German (Germany)
- [ ] 3.2 Demo marking: file name, reference, External IDs, protocol first line; tests in `test/cli/demo.test.ts`
- [ ] 3.3 `docs/examples/`: `ODOO_Buchungen_20260901-20260930_BSP.csv` (golden, without `DEMO`), its protocol, `mapping-BSP.example.csv`, `README.md`; `test/examples.test.ts` compares them with the current output
- [ ] 3.4 Remove the Abacus example files from `docs/examples/`

## 4. Docs

- [ ] 4.1 Rewrite `docs/export.md` and `docs/examples/README.md` per "Export doc for Odoo" and add both to `GERMANY_FILES`

## 5. Release check

- [ ] 5.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green
- [ ] 5.2 `node dist/cli/main.js export --month 2026-09 --demo --dry-run` shows EUR, Kz 81, Kz 86 and a rounding line; `node dist/cli/main.js export --month 2026-09 --demo` writes `demo-output/BSP/2026-09/ODOO_Buchungen_20260901-20260930_BSP_DEMO.csv`
