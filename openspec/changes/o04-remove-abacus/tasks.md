## 1. Code and tests

- [ ] 1.1 Delete `src/abacus/`, `test/abacus/`, `test/golden/abacus/`, `test/helpers/abacus.ts` and any test helper or fixture only these use (for example `test/helpers/swiss-chart.ts`)
- [ ] 1.2 Delete the Abrechnungsart and Mandant code paths in `src/core/config.ts`, `src/export/pipeline.ts` and `src/cli/commands/doctor.ts` with their tests; move any helper the Odoo code still uses to `src/core/`
- [ ] 1.3 Remove the finding codes `E-ABACUS-*`, `N-ABACUS-*`, `W-MANDANT-SHARED` and `W-ABRECHNUNGSART-VEREINNAHMT` from `src/` (the Swiss template, MWST-Code and posting codes went in o03)
- [ ] 1.4 Refuse the `abacus` section (error naming `odoo`); remove `mandant` and `geschaeftsbereich` from `TargetManifestFields`; tests for the cli scenarios "Old Abacus section" and "Invalid config value"
- [ ] 1.5 Remove `src/abacus` from the restricted-import boundary in `eslint.config.js` and from `test/lint/boundaries.test.ts`

## 2. Docs

- [ ] 2.1 Delete `docs/abacus-format.md` and `docs/abacus-import.md`; replace links with `docs/odoo-format.md` or `docs/odoo-import.md`; update the required-file lists in `test/docs.test.ts` and `test/readme.test.ts`
- [ ] 2.2 Write `docs/odoo-import.md` per the requirement "First import in Odoo" (with the results of the o02 local test import for the generated account codes and the messages of "Test"); link it from README and `docs/configuration.md`; the release check greps it for Swiss and Austrian practice terms and `«` `»`
- [ ] 2.3 Remove the deleted codes from `docs/troubleshooting.md`
- [ ] 2.4 `test/helpers/docs.ts`: compatibility claims about Odoo, recorded imports with seven fields, the pending-Steuerberater sentence until a row names a Kanzlei; tests for the three scenarios of "No unverified compatibility claim"
- [ ] 2.5 Remove the Abacus topics from the topic command in `docs/maintainers.md` (final list in o08) and the Abacus rows of `## Testimporte` (the o02 local rows stay)
- [ ] 2.6 Delete `openspec/research/a-target.md`; point `docs/architecture.md` to `renderOdooCsv`, `OdooValidationError`, `OdooBooking` and `test/golden/odoo/`

## 3. Release check

- [ ] 3.1 `pnpm typecheck`, `pnpm lint`, `pnpm test` (without `UPDATE_GOLDEN`), `pnpm build` green; every Odoo golden file, the German month constants and the BER/VIE constants unchanged
- [ ] 3.2 `grep -rni "abacus\|mwst\|rappen\|treuhänder" src test templates` finds only the refusal of an old `abacus` section and of Abacus mapping files with their tests, and the Swiss-term lists of the docs test; `node dist/cli/main.js export --month 2026-09 --demo --dry-run` prints the same summary as after o03
