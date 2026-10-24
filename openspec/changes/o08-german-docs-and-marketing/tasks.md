## 1. README

- [ ] 1.1 Rewrite `README.md` per "README first screen", "Quick start that works", "Honest scope and comparison" and "README FAQ" (German as used in Germany, `<!-- quickstart -->` block unchanged in its commands)
- [ ] 1.2 Rewrite `README.en.md` per "Short English README"
- [ ] 1.3 `test/readme.test.ts`: first screen, search terms, comparison table and price sentence, FAQ topics, origin sentence with three links

## 2. Remaining docs and community files

- [ ] 2.1 Rewrite `docs/setup-apaleo.md`, `docs/configuration.md`, `docs/troubleshooting.md`, `docs/architecture.md`, `docs/maintainers.md` (with `## Testimporte` fields and `## Später geplant`) and `docs/apaleo-source.md` for Germany
- [ ] 2.2 Rewrite `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`; replace `CODE_OF_CONDUCT.md` with the official German Contributor Covenant 2.1 verbatim; rewrite `DISCLAIMER.md` per "Licence and disclaimer files"
- [ ] 2.3 Rewrite the issue forms and the pull-request template in `.github/` (field ids unchanged)
- [ ] 2.4 Comments of `apaleo-odoo.config.example.yaml`, `.env.example`, `docker-compose.example.yml` and the templates in German (Germany), if any are left
- [ ] 2.5 Update `test/community.test.ts` and `test/repo-files.test.ts` (no "ß" ban, Odoo and Steuerberater in the disclaimer, CoC headings)

## 3. Docs test

- [ ] 3.1 `test/helpers/docs.ts`: one rule set per "Docs consistency test" for every German file; delete `GERMANY_FILES`, the Swiss spelling and rate-notation checks and the German DATEV term list; refuse Swiss and Austrian practice terms and `«` `»`; `Abacus` and `BMD` only in the origin places; `DATEV` allowed
- [ ] 3.2 Tests for every scenario of "Docs consistency test" and "German-first documentation" with fixture files in `test/fixtures/docs/`

## 4. GitHub metadata

- [ ] 4.1 `gh repo edit krautdawg/apaleo-odoo-export --description "…"` and `--add-topic` for every topic of "Repository description and topics"; remove any Abacus, MWST or Swiss topic; do not change visibility
- [ ] 4.2 `docs/maintainers.md` `## Vor der Veröffentlichung` checklist in the order of the requirement

## 5. Release check

- [ ] 5.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green; the CI quick-start job passes on the pull request
- [ ] 5.2 `grep -rn "Treuhänder\|MWST\|Rappen\|«" README.md README.en.md docs CONTRIBUTING.md SECURITY.md DISCLAIMER.md .github` finds nothing; `grep -rn "Abacus\|BMD" README.md docs` finds only the allowed origin places
- [ ] 5.3 `gh repo view --json description,repositoryTopics,visibility` shows the new metadata and the unchanged visibility
