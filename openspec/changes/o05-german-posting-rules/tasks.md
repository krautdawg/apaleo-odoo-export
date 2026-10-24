## 1. Posting and templates

- [ ] 1.1 `src/posting/`: classification of deposits (received, released, refunded) and levies for the summary in Odoo terms; deposit tax per rate shown apart from revenue tax; write-offs per rate with the lowered Kennzahl
- [ ] 1.2 Templates `skr03-hotel@2` and `skr04-hotel@2`: rows and comments of "Template rows for German special cases"; `init-mapping --update` with `N-TEMPLATE-SUGGESTION`
- [ ] 1.3 `mapping check`: `W-CITY-TAX-TAXED`
- [ ] 1.4 `src/export/checks.ts`: `W-CITY-TAX-TAXED` for used rows and `W-FOOD-RATE` per day, in dry run, CLI output and protocol
- [ ] 1.5 Tests in `test/posting/`, `test/mapping/` and `test/export/` for every scenario of this change

## 2. Fixtures

- [ ] 2.1 Extend `test/fixtures/apaleo/de-month/` with the lines of "German fixture month with special cases" and update its README; add `test/fixtures/mapping/skr03-de-month.csv`
- [ ] 2.2 Add `test/fixtures/apaleo/de-2025-12-31/` with the two breakfast lines; test "Food rate around the change"
- [ ] 2.3 Record the new hand-computed constants in `test/posting/fixture-month-de.test.ts`; update `test/golden/odoo/de-month.per-line.csv` and `de-month.per-tax.csv` with `UPDATE_GOLDEN=1` and review the diff line by line

## 3. Docs

- [ ] 3.1 Rewrite `docs/posting-rules.md` per "Posting rules doc for Odoo"; the release check greps it for Swiss and Austrian practice terms and `«` `»` (the docs test checks them from o08 on)
- [ ] 3.2 Complete the special-case sections of `docs/mapping-guide.md`; add `W-CITY-TAX-TAXED`, `W-FOOD-RATE` and `N-TEMPLATE-SUGGESTION` to `docs/troubleshooting.md`

## 4. Release check

- [ ] 4.1 `pnpm typecheck`, `pnpm lint`, `pnpm test` (without `UPDATE_GOLDEN`), `pnpm build` green
- [ ] 4.2 `node dist/cli/main.js export --month 2026-09 --demo --dry-run` exits 0; the demo data are unchanged in this slice (o06 refreshes them)
