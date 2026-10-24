## 1. Mapping format and templates

- [ ] 1.1 `src/mapping/types.ts`, `csv.ts`, `load.ts`, `file.ts`: columns `odoo_account;odoo_tax;tax_percent;analytic`; refuse Abacus, BMD and DATEV headers with the `init-mapping --template skr03-hotel` hint; keep codes and taxes as text
- [ ] 1.2 `src/mapping/l10n-de.ts`: the known l10n_de sale taxes (template ids per chart with rate and Kennzahl) and the template accounts with a default tax, each with its source file and branch
- [ ] 1.3 `templates/skr03-hotel.rules.csv` and `templates/skr04-hotel.rules.csv` with every rule of the requirement "SKR hotel templates for Odoo", comments in German (Germany) naming the source and the check date; template engine reads the new columns and the `@1` version tag
- [ ] 1.4 `init-mapping --template skr03-hotel|skr04-hotel`; remove `--accounts-from` and `src/mapping/connector-export.ts` with its tests; the unknown-template error lists both templates
- [ ] 1.5 `mapping check`: every rule of "Mapping validation for Odoo" with the new codes `E-TAX-FORMAT`, `E-TAX-MISSING`, `E-TAX-NOT-ALLOWED`, `W-TAX-UNCHECKED`, `W-TAX-RATE`, `N-DEFAULT-TAX-ACCOUNT`, `E-ANALYTIC-FORMAT`, `W-ANALYTIC-IGNORED`; `W-VAT-RATE-UNUSUAL` with the German rates; `E-UNMAPPED` fix hints with the SKR03 template examples
- [ ] 1.6 Tests in `test/mapping/` and `test/cli/` for every scenario of the account-mapping delta, including `test/fixtures/mapping/excel-de-saved.csv` and `init-mapping` on the recorded BER chart with both templates

## 2. Posting

- [ ] 2.1 `src/posting/`: produce `OdooBooking` per ledger line (VAT side by the row's tax, apaleo tax rounded half away from zero, sides swapped for negative gross, `E-TAX-NOT-ALLOWED`, `E-TWO-VAT-SIDES`), keeping the rate inference for untaxed deposit releases and the skip rules
- [ ] 2.2 Tax guard for Odoo bookings: drop the Abacus check value and `W-VAT-ROUNDING` from posting; keep `E-VAT-RATE`, `E-VAT-SIGN`, `E-VAT-MISSING`, `E-VAT-UNEXPECTED`, `E-VAT-MIXED`
- [ ] 2.3 `src/posting/describe.ts`: labels in German (Germany) per account type, group and rate, stable per account; receipt and reference kept on the booking for the protocol; analytic account only from Revenues and LossOfAccountsReceivable rows
- [ ] 2.4 Posting summary for Odoo with the writer's fitting results (Odoo VAT, apaleo VAT, difference, Kennzahl, entries, lines, rounding lines)
- [ ] 2.5 Tests in `test/posting/` for every scenario of the posting-rules delta

## 3. Pipeline and config

- [ ] 3.1 `DEFAULT_TARGET` = `odooTarget`; the `odoo` section required, the `abacus` section optional; `E-CURRENCY` advice from the Odoo target
- [ ] 3.2 Export and `schedule --once`: `W-TAX-RATE` and `W-TAX-UNCHECKED` for used rows; `E-TAX-RATES` before writing; the protocol lists per entry line the source entry numbers and receipts it nets; manifest fields for company id, journal, entries, lines and VAT per tax
- [ ] 3.3 Tests in `test/export/` and `test/cli/` for every scenario of the export-run and cli deltas

## 4. Fixtures, demo and regression

- [ ] 4.1 `test/fixtures/apaleo/de-month/` with README, built in the shapes of the recorded BER data; hand-computed constants and the golden files `test/golden/odoo/de-month.per-line.csv` and `de-month.per-tax.csv`; `test/posting/fixture-month-de.test.ts`
- [ ] 4.2 `test/fixtures/apaleo/live/BER/mapping-BER.odoo.csv` and `test/fixtures/apaleo/live/VIE/mapping-VIE.odoo.csv`; port the live regression tests to the Odoo target and record the new constants
- [ ] 4.3 Tests that exercise the Abacus writer, the KMU template or the Swiss month pass `abacusTarget` and their Abacus mapping fixtures explicitly, so they stay green until o04 deletes them
- [ ] 4.4 `examples/demo/`: a copy of the German month (EUR, `Europe/Berlin`) with the SKR03 template mapping and an `odoo` section (`journal: APA`, `version: 17`); `export --month 2026-09 --demo --dry-run` exits 0 and shows EUR, 7 % and 19 %

## 5. Docs

- [ ] 5.1 Rewrite `docs/mapping-guide.md` per the requirement "Mapping guide for Odoo" and add it to `GERMANY_FILES`
- [ ] 5.2 Add every new finding code to `docs/troubleshooting.md`; codes no longer raised by `src/` leave it (the docs test requires both)

## 6. Release check

- [ ] 6.1 `pnpm typecheck`, `pnpm lint`, `pnpm test` (without `UPDATE_GOLDEN`), `pnpm build` green; Abacus golden files unchanged when rendered with `abacusTarget`
- [ ] 6.2 `node dist/cli/main.js export --month 2026-09 --demo --dry-run` prints the Odoo summary in EUR with Kz 81 and Kz 86 and exits 0
