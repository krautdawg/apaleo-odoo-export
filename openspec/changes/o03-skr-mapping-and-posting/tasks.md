## 0. Prerequisite

- [ ] 0.1 The o02 local test import is recorded under `## Testimporte` for 17, 18 and 19 with SKR03 and SKR04, and its observed cash and transfer account codes are the ones of task 1.2

## 1. Mapping format and templates

- [ ] 1.1 `src/mapping/types.ts`, `csv.ts`, `load.ts`, `file.ts`: columns `odoo_account;odoo_tax;tax_percent`; refuse Abacus, BMD and DATEV headers with the `init-mapping --template skr03-hotel` hint; keep codes and taxes as text
- [ ] 1.2 `src/mapping/l10n-de.ts`: the known l10n_de sale taxes (template ids per chart with rate and Kennzahl, `tax_not_taxable_*` with Kz 45), the template accounts with a default tax, and the generated cash and transfer account codes per chart and Odoo version, each with its source file and branch
- [ ] 1.3 `templates/skr03-hotel.rules.csv` and `templates/skr04-hotel.rules.csv` with every rule of the requirement "SKR hotel templates for Odoo", comments in German (Germany) naming the source and the check date; template engine reads the new columns and the `@1` version tag and resolves `{cash}` and `{transfer}` from `odoo.version`
- [ ] 1.4 `init-mapping --template skr03-hotel|skr04-hotel`; remove `--accounts-from` and `src/mapping/connector-export.ts` with its tests; the unknown-template error lists both templates
- [ ] 1.5 `mapping check`: every rule of "Mapping validation for Odoo" with the new codes `E-TAX-FORMAT`, `E-TAX-MISSING`, `E-TAX-NOT-ALLOWED`, `W-TAX-UNCHECKED`, `W-TAX-RATE`, `W-TAX-KZ45`, `N-DEFAULT-TAX-ACCOUNT`, `N-GENERATED-ACCOUNT`; `W-VAT-RATE-UNUSUAL` with the German rates; `E-UNMAPPED` fix hints with the SKR03 template examples
- [ ] 1.6 Tests in `test/mapping/` and `test/cli/` for every scenario of the account-mapping delta, including `test/fixtures/mapping/excel-de-saved.csv` and `init-mapping` on the recorded BER chart with both templates

## 2. Posting

- [ ] 2.1 `src/posting/`: produce `OdooBooking` per ledger line (VAT side by the row's tax, apaleo tax rounded half away from zero, sides swapped for negative gross, `E-TAX-NOT-ALLOWED`, `E-TWO-VAT-SIDES`), keeping the rate inference for untaxed deposit releases and the skip rules
- [ ] 2.2 Tax guard for Odoo bookings: drop the Abacus check value and `W-VAT-ROUNDING` from posting; keep `E-VAT-RATE`, `E-VAT-SIGN`, `E-VAT-MISSING`, `E-VAT-UNEXPECTED`, `E-VAT-MIXED`
- [ ] 2.3 `src/posting/describe.ts`: labels in German (Germany) per account type, group and rate, stable per account; receipt and reference kept on the booking for the protocol
- [ ] 2.4 Posting summary for Odoo with the writer's fitting results (Odoo VAT, apaleo VAT, difference, Kennzahl, entries, lines, rounding lines)
- [ ] 2.5 Tests in `test/posting/` for every scenario of the posting-rules delta

## 3. Pipeline and config

- [ ] 3.1 `DEFAULT_TARGET` = `odooTarget`; the `odoo` section required, the `abacus` section optional; `E-CURRENCY` advice from the Odoo target
- [ ] 3.2 Export and `schedule --once`: `W-TAX-RATE`, `W-TAX-UNCHECKED` and `W-TAX-KZ45` for used rows; `E-TAX-RATES` before writing; the protocol lists per entry line the source entry numbers and receipts it nets; manifest fields for company id, journal, entries, lines and VAT per tax
- [ ] 3.3 Tests in `test/export/` and `test/cli/` for every scenario of the export-run and cli deltas

## 4. Fixtures, demo and regression

- [ ] 4.1 `test/fixtures/apaleo/de-month/` with README, built in the shapes of the recorded BER data; hand-computed constants and the golden files `test/golden/odoo/de-month.per-line.csv` and `de-month.per-tax.csv`; `test/posting/fixture-month-de.test.ts`
- [ ] 4.2 `test/fixtures/apaleo/live/BER/mapping-BER.odoo.csv` and `test/fixtures/apaleo/live/VIE/mapping-VIE.odoo.csv`; port the live regression tests to the Odoo target and record the new constants
- [ ] 4.3 Delete, not port, the code and tests of every requirement this slice removes: `templates/kmu-hotel.rules.csv`, `src/mapping/kmu-sample-codes.ts`, the KMU init-mapping and `--accounts-from` tests, Abacus mapping validation (`E-MWST-CODE-*`, `W-MWST-CODE-*`, `E-KOST-FORMAT`, `W-KOST-IGNORED`), the Swiss template rows and warnings (`W-KURTAXE-TAXED`, `W-ANNULLATION-TAXED`, `W-UNTAXED-REVENUE`), MWST-Code warnings and one rate per MWST-Code in the export, VAT side in SingleInformation, the Abacus tax guard (`W-VAT-ROUNDING`) and summary, Vereinnahmte Entgelte in posting, the Swiss fixture month (`test/fixtures/apaleo/ch-month/`, `test/helpers/ch-month.ts` and helpers only it uses), the Abacus mapping fixtures and `test/fixtures/apaleo/live/VIE/mapping-VIE.abacus.csv` with its regression test; remove the deleted codes from `docs/troubleshooting.md`
- [ ] 4.4 `examples/demo/`: a copy of the German month (EUR, `Europe/Berlin`) with the SKR03 template mapping written for `odoo.version: 18` (Kasse `1001`, Geldtransit `1360`) and an `odoo` section (`journal: APA`, `version: 18`, per-line rounding); `export --month 2026-09 --demo --dry-run` exits 0 and shows EUR, 7 % and 19 %
- [ ] 4.5 Keep `src/abacus/` compiling with its own unit and golden tests (booking builders in `test/helpers/abacus.ts`) and the `abacus` config section; move any type it imported from `src/posting/` or `src/mapping/` into `src/abacus/`; `grep -rn "kmu\|mwst_code\|W-VAT-ROUNDING" src test templates` finds only `src/abacus/`, its tests and the refusal of Abacus mapping files

## 5. Docs

- [ ] 5.1 Rewrite `docs/mapping-guide.md` per the requirement "Mapping guide for Odoo"; the release check greps it for Swiss and Austrian practice terms and `«` `»` (the docs test checks them from o08 on)
- [ ] 5.2 Add every new finding code to `docs/troubleshooting.md`; codes no longer raised by `src/` leave it (the docs test requires both)
- [ ] 5.3 Every text this slice writes in `docs/` (also in `docs/configuration.md` and `docs/troubleshooting.md`) is in final German as used in Germany, so o08 does not rewrite it

## 6. Release check

- [ ] 6.1 `pnpm typecheck`, `pnpm lint`, `pnpm test` (without `UPDATE_GOLDEN`), `pnpm build` green; the Abacus writer's own golden files unchanged
- [ ] 6.2 `node dist/cli/main.js export --month 2026-09 --demo --dry-run` prints the Odoo summary in EUR with Kz 81 and Kz 86 and exits 0
