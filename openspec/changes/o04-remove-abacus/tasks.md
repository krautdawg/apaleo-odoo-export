## 1. Code and tests

- [ ] 1.1 Delete `src/abacus/`, `test/abacus/`, `test/golden/abacus/`, `test/helpers/abacus.ts`, `test/helpers/ch-month.ts`, `test/helpers/swiss-chart.ts`, `test/fixtures/apaleo/ch-month/`, `test/fixtures/mapping/abacus-beispiel.csv`, `test/fixtures/mapping/kmu-ch-month.csv`, the other Abacus/KMU mapping fixtures and `test/fixtures/apaleo/live/VIE/mapping-VIE.abacus.csv`
- [ ] 1.2 Delete `templates/kmu-hotel.rules.csv`, `src/mapping/kmu-sample-codes.ts` and the MWST-Code, Kostenstelle, Abrechnungsart and Mandant code paths in `src/mapping/`, `src/posting/`, `src/core/config.ts` and `src/cli/commands/doctor.ts`, with their tests; move any helper the Odoo code still uses to `src/core/`
- [ ] 1.3 Remove the finding codes `E-ABACUS-*`, `N-ABACUS-*`, `E-MWST-CODE-*`, `W-MWST-CODE-*`, `E-KOST-FORMAT`, `W-KOST-IGNORED`, `W-MANDANT-SHARED`, `W-ABRECHNUNGSART-VEREINNAHMT`, `W-KURTAXE-TAXED`, `W-ANNULLATION-TAXED`, `W-UNTAXED-REVENUE` and `W-VAT-ROUNDING` from `src/`
- [ ] 1.4 Refuse the `abacus` section (error naming `odoo`); remove `mandant` and `geschaeftsbereich` from `TargetManifestFields`; tests for the cli scenarios "Old Abacus section" and "Invalid config value"
- [ ] 1.5 Remove `src/abacus` from the restricted-import boundary in `eslint.config.js` and from `test/lint/boundaries.test.ts`
- [ ] 1.6 Remove the tests that o03 kept running with `abacusTarget` (Swiss month, Swiss warnings, Abacus live mapping)

## 2. Docs

- [ ] 2.1 Delete `docs/abacus-format.md` and `docs/abacus-import.md`; replace links with `docs/odoo-format.md` or `docs/odoo-import.md`; update the required-file lists in `test/docs.test.ts` and `test/readme.test.ts`
- [ ] 2.2 Write `docs/odoo-import.md` per the requirement "First import in Odoo"; link it from README and `docs/configuration.md`
- [ ] 2.3 Remove the deleted codes from `docs/troubleshooting.md`
- [ ] 2.4 `test/helpers/docs.ts`: compatibility claims about Odoo, recorded imports with six fields; tests for the three scenarios of "No unverified compatibility claim"
- [ ] 2.5 Remove the Abacus topics from the topic command in `docs/maintainers.md` (final list in o08) and the Abacus rows of `## Testimporte`
- [ ] 2.6 Delete `openspec/research/a-target.md`; point `docs/architecture.md` to `renderOdooCsv`, `OdooValidationError`, `OdooBooking` and `test/golden/odoo/`

## 3. Release check

- [ ] 3.1 `pnpm typecheck`, `pnpm lint`, `pnpm test` (without `UPDATE_GOLDEN`), `pnpm build` green; every Odoo golden file, the German month constants and the BER/VIE constants unchanged
- [ ] 3.2 `grep -rni "abacus\|mwst\|rappen\|treuhänder" src test templates` finds only the refusal of an old `abacus` section and of Abacus mapping files with their tests, and the Swiss-term lists of the docs test; `node dist/cli/main.js export --month 2026-09 --demo --dry-run` prints the same summary as after o03
