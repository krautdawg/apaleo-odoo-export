## 1. Config

- [ ] 1.1 Add the optional `odoo` section to the schema in `src/core/config.ts` (`journal`, `companyId`, `currency`, `version`, `taxRounding` with the version default, `roundingAccount` required with `per_tax`) and the per-property `journal`; register it in `configSections`; codes written as YAML numbers are read as text
- [ ] 1.2 `doctor` prints the effective `odoo` values and the sentence on the rounding method when the section is present
- [ ] 1.3 Tests in `test/core/config.test.ts` for the scenarios "Odoo defaults", "Version 19 rounds per tax", "Rounding account missing", "Journal code too long", "Unsupported version", "Invalid currency"
- [ ] 1.4 Add a commented `odoo:` block to `apaleo-odoo.config.example.yaml` (comments in German as used in Germany)

## 2. Tax model and fitting

- [ ] 2.1 `src/odoo/types.ts`: `OdooBooking` (`businessDate`, `debit` and `credit` sides with `account`, `label`, optional `analytic`; `grossCents`; optional `vat` with `side`, `taxRef`, `percent`, `apaleoTaxCents`; `sourceEntryNumbers`), `OdooLine`, `OdooEntry`, `OdooRenderOptions`
- [ ] 2.2 `src/odoo/format.ts`: `CSV_HEADER`, amount and date formatting, CSV quoting, `taxExternalId()`, entry and line External IDs, `roundHalfAwayFromZero()` on cents; each constant with a comment naming its research §10 open question
- [ ] 2.3 `src/odoo/tax-model.ts`: `odooTax(lines, mode)` per (tax, side) group for `per_line` and `per_tax`
- [ ] 2.4 `src/odoo/fit.ts`: base fitting per line or group, the `per_line` companion line, the `per_tax` rounding-account line, largest-remainder distribution, `N-ODOO-ROUNDING-LINE`, and the per-day comparison with apaleo's tax
- [ ] 2.5 Unit tests in `test/odoo/tax-model.test.ts` and `test/odoo/fit.test.ts` for every scenario of "Model of Odoo's tax computation" and "Base fitting", plus a property test over all gross values from 0.01 to 2,000.00 at 7 % and 19 % in both modes asserting that every fitted result balances and moves the tax by at most one cent per line plus one

## 3. Writer

- [ ] 3.1 `src/odoo/entries.ts`: daily entries, netting per (account, tax, analytic account, label), dropping net-zero keys, line order
- [ ] 3.2 `src/odoo/sanitise.ts`: control characters, whitespace, 128-character cut with `N-ODOO-TRUNCATED`, empty label replaced by the account code
- [ ] 3.3 `src/odoo/validate.ts` and `src/odoo/errors.ts`: every `E-ODOO-*` rule of the spec, all findings at once in one `OdooValidationError` (a `FindingsError`)
- [ ] 3.4 `src/odoo/writer.ts`: `renderOdooCsv(bookings, options)` with header, entry rows and continuation rows
- [ ] 3.5 `src/odoo/import-block.ts` and `src/odoo/target.ts`: `odooTarget` with file name, pattern, byte comparison, protocol title, import block, refusal advice, `currency()`, `movements()`, `taxReturnLine()` and `manifestFields()`; add the optional Odoo fields to `TargetManifestFields` in `src/export/target.ts`; `src/odoo/index.ts` and `src/odoo/README.md`
- [ ] 3.6 Add `src/odoo` to the restricted-import boundary in `eslint.config.js` and `test/lint/boundaries.test.ts`

## 4. Tests

- [ ] 4.1 Unit tests in `test/odoo/` for layout, quoting, External IDs, tax ids, sanitising, validation (every code, several at once), ordering and the target (pattern, currency, Kennzahl, advice, import block)
- [ ] 4.2 Golden files in `test/golden/odoo/` for every case of the requirement "Golden-file regression tests", rendered from booking builders in `test/helpers/odoo.ts`; `test/odoo/golden.test.ts` compares bytes, updates only with `UPDATE_GOLDEN=1`, and re-checks the balance of every golden entry with an independent parser
- [ ] 4.3 Review each golden file column by column against `openspec/research/o-target.md` §2-3 and note the review in the test file header

## 5. Docs

- [ ] 5.1 Write `docs/odoo-format.md` in German as used in Germany ("du", "ß", „…“): columns, rows of an entry, External IDs and what a re-import does, taxes by External ID and why the file has no tax lines, the base fitting with the examples of the spec, the rounding method and where to find it in Odoo, the account default taxes and the empty tax cell, the open questions of research §10, and the source list with the check date; it is already in `GERMANY_FILES` (o01)
- [ ] 5.2 Document the `odoo` keys in `docs/configuration.md` and every new finding code in `docs/troubleshooting.md` (the docs test requires both)

## 6. Release check

- [ ] 6.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green; Abacus golden files and the Abacus demo unchanged (Abacus stays the default target)
