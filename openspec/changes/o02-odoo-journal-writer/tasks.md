## 1. Config

- [ ] 1.1 Add the optional `odoo` section to the schema in `src/core/config.ts` (`journal`, `companyId`, `currency`, `version`, `taxRounding` with the version default, `roundingAccount` required with `per_tax`) and the per-property `journal`; register it in `configSections`; codes written as YAML numbers are read as text
- [ ] 1.2 `doctor` prints the effective `odoo` values and the sentence on the rounding method when the section is present
- [ ] 1.3 Tests in `test/core/config.test.ts` for the scenarios "Odoo defaults", "Version 19 rounds per tax", "Rounding account missing", "Journal code too long", "Unsupported version", "Invalid currency"
- [ ] 1.4 Add a commented `odoo:` block to `apaleo-odoo.config.example.yaml` (comments in German as used in Germany)

## 2. Tax model and fitting

- [ ] 2.1 `src/odoo/types.ts`: `OdooBooking` (`businessDate`, `debit` and `credit` sides with `account` and `label`; `grossCents`; optional `vat` with `side`, `taxRef`, `percent`, `apaleoTaxCents`; `sourceEntryNumbers`), `OdooLine`, `OdooEntry`, `OdooRenderOptions`
- [ ] 2.2 `src/odoo/format.ts`: `CSV_HEADER`, amount and date formatting, CSV quoting, `taxExternalId()`, entry and line External IDs with the revision suffix, `roundHalfAwayFromZero()` on cents; each constant with a comment naming its research §10 open question
- [ ] 2.3 `src/odoo/tax-model.ts`: `odooTax(lines, mode)` per (tax, side) group for `per_line` and `per_tax`
- [ ] 2.4 `src/odoo/fit.ts`: base fitting per line or group, the `per_line` companion line, the `per_tax` rounding-account line, largest-remainder distribution, `N-ODOO-ROUNDING-LINE`, and the per-day comparison with apaleo's tax
- [ ] 2.5 Unit tests in `test/odoo/tax-model.test.ts` and `test/odoo/fit.test.ts` for every scenario of "Model of Odoo's tax computation" and "Base fitting", plus a property test over all gross values from 0.01 to 2,000.00 at 7 % and 19 % in both modes asserting that every fitted result balances and moves the tax by at most one cent per line plus one

## 3. Writer

- [ ] 3.1 `src/odoo/entries.ts`: daily entries, netting per (account, tax, label), dropping net-zero keys, line order
- [ ] 3.2 `src/odoo/sanitise.ts`: control characters, whitespace, 128-character cut with `N-ODOO-TRUNCATED`, empty label replaced by the account code
- [ ] 3.3 `src/odoo/validate.ts` and `src/odoo/errors.ts`: every `E-ODOO-*` rule of the spec, all findings at once in one `OdooValidationError` (a `FindingsError`)
- [ ] 3.4 `src/odoo/writer.ts`: `renderOdooCsv(bookings, options)` with header, entry rows and continuation rows, the revision in IDs and `ref`; `revisionOf(bytes)`
- [ ] 3.5 `src/odoo/import-block.ts` and `src/odoo/target.ts`: `odooTarget` with file name, pattern, `render` for a revision, `revisionOf()`, byte comparison, protocol title, import block, refusal advice, `currency()`, `movements()`, `taxReturnLine()` and `manifestFields()`; add the optional Odoo fields to `TargetManifestFields` in `src/export/target.ts`; `src/odoo/index.ts` and `src/odoo/README.md`
- [ ] 3.6 Add `src/odoo` to the restricted-import boundary in `eslint.config.js` and `test/lint/boundaries.test.ts`

## 4. Tests

- [ ] 4.1 Unit tests in `test/odoo/` for layout, quoting, External IDs and revisions, tax ids, sanitising, validation (every code, several at once), ordering and the target (pattern, currency, Kennzahl, advice, import block)
- [ ] 4.2 Golden files in `test/golden/odoo/` for every case of the requirement "Golden-file regression tests", rendered from booking builders in `test/helpers/odoo.ts`; `test/odoo/golden.test.ts` compares bytes, updates only with `UPDATE_GOLDEN=1`, and re-checks the balance of every golden entry with an independent parser
- [ ] 4.3 Review each golden file column by column against `openspec/research/o-target.md` §2-3 and note the review in the test file header

## 5. Docs

- [ ] 5.1 Write `docs/odoo-format.md` in German as used in Germany ("du", "ß", „…“): columns, rows of an entry, External IDs, revisions („Korrektur N“) and what a re-import does, taxes by External ID and why the file has no tax lines, the base fitting with the examples of the spec, the rounding method and where to find it in Odoo, the account default taxes and the empty tax cell, the open questions of research §10, and the source list with the check date; the release check greps it for Swiss and Austrian practice terms and `«` `»`
- [ ] 5.2 Document the `odoo` keys in `docs/configuration.md` (with `odoo.companyId` as the id of the company that owns the taxes, for a branch its root company) and every new finding code in `docs/troubleshooting.md` (the docs test requires both), in final German as used in Germany, so o08 does not rewrite them
- [ ] 5.3 `docs/maintainers.md` `## Später geplant`: analytic accounts (an optional mapping column with the database id of an Odoo analytic account and `line_ids/analytic_distribution`, after the first recorded import has checked how Odoo handles it on tax lines)

## 6. Release check

- [ ] 6.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green; Abacus golden files and the Abacus demo unchanged (Abacus stays the default target)

## 7. Local test import (maintainer, outside CI, gate before o03)

- [ ] 7.1 `scripts/odoo-check/`: a `docker-compose.yml` with `postgres` and the official images `odoo:17`, `odoo:18` and `odoo:19` (tags pinned, ports bound to `127.0.0.1`), and `check.py`, run with `odoo shell` inside each container (no RPC, no API key, no credentials): it creates a throwaway database per version and chart with `account` and `l10n_de`, loads `de_skr03` or `de_skr04`, creates the journal `APA`, sets the rounding method of the golden file, imports every golden file of `test/golden/odoo/` through `base_import.import` (`execute_import` first with `dryrun`, then for real, with a German-language user for research §10 question 1), and prints per entry the state, the tax lines with amounts and tags, any "Automatic Balancing Line", and the codes of the cash and the liquidity transfer accounts
- [ ] 7.2 The same script runs the cases of research §10 questions 5, 8 and 11: the unchanged file over drafts and over posted entries, a changed file with the same External IDs over a posted and over a reversed entry (expected: refused), the revision-2 file after deleting the drafts and after reversing the posted entries (expected: new entries), deleting a never-posted draft with the audit trail on, and a second company with only the target company active
- [ ] 7.3 Run it for 17, 18 and 19 with SKR03 and SKR04; record each run under `docs/maintainers.md` `## Testimporte` (date, Odoo version, edition and hosting "Community, lokal (Docker)", chart, rounding method, result, geprüft von "Maintainer, lokal") and the answers to research §10 questions 1, 2, 4, 5, 6, 8, 9 and 11 in `openspec/research/o-target.md`; describe the check in German in `docs/maintainers.md` `## Lokaler Testimport`
- [ ] 7.4 Adjust the constants in `src/odoo/format.ts` and the tax model to the observed results and re-render the golden files; record the observed cash and transfer account codes for the o03 templates; o03 starts only when every run is recorded without an unexpected "Automatic Balancing Line" or import error
- [ ] 7.5 CI does not run `scripts/odoo-check/`; it contains no secret, and the databases are deleted after the run
