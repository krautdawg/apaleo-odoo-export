## 1. Rename

- [ ] 1.1 Set `package.json` `name` to `apaleo-odoo-export`, `version` to `0.0.0`, `bin` to `{ "apaleo-odoo": "dist/cli/main.js" }` and the description to "Free open-source export from the apaleo hotel PMS to Odoo Accounting journal entries (import file) for hotels in Germany."; refresh `pnpm-lock.yaml` with `pnpm install`
- [ ] 1.2 In `src/core/config.ts` rename the config env variable to `APALEO_ODOO_CONFIG`, the default file names to `apaleo-odoo.config.{yaml,yml,json}`, the env prefix to `APALEO_ODOO_` and every allow-list entry; keep `APALEO_CLIENT_ID` and `APALEO_CLIENT_SECRET`; the `bmd`/`datev` rejection message says "not a section of apaleo-odoo"
- [ ] 1.3 Rename the binary in `src/cli/help.ts`, usage lines, error hints, `src/cli/version.ts` and every message in `src/` that names the command (`"apaleo-abacus mapping check"` and similar); set the `--help` summary line to apaleo -> Odoo
- [ ] 1.4 Rename `apaleo-abacus.config.example.yaml` to `apaleo-odoo.config.example.yaml` and `examples/demo/apaleo-abacus.config.yaml` to `examples/demo/apaleo-odoo.config.yaml`; update every reference
- [ ] 1.5 Update `.gitignore` (add `/apaleo-odoo.config.*`, keep the Abacus, BMD and DATEV names), `Dockerfile` (entry point `apaleo-odoo`, `/config/apaleo-odoo.config.yaml`, OCI title `apaleo-odoo-export`, description naming apaleo and Odoo), `docker-compose.example.yml` (service `apaleo-odoo`, image `apaleo-odoo-export:local`, `APALEO_ODOO_*`), `.env.example`, and `.github/workflows/ci.yml` (CLI steps, the `readme-quickstart` filter for `cd apaleo-odoo-export`, image tag `apaleo-odoo-export:ci`)
- [ ] 1.6 Replace `apaleo-abacus` command lines and `APALEO_ABACUS_*` names in README, README.en.md, `docs/` and `examples/demo/README.md`; point the clone URL, `cd` line and CI badges to `krautdawg/apaleo-odoo-export` (prose otherwise unchanged)
- [ ] 1.7 Update the tests that name the binary, config file or env variables; add the cli scenarios "Old binary name is gone" (no `apaleo-abacus`) and "Old variable names are not read" (`APALEO_ABACUS_CONFIG`)

## 2. Docs test

- [ ] 2.1 `test/docs.test.ts`: read command lines of `apaleo-odoo`, fail on any `apaleo-abacus`, `apaleo-bmd` or `apaleo-datev` command line inside `sh`/`bash` fences, add `odoo` to the config-key prefix pattern
- [ ] 2.2 `test/helpers/docs.ts`: remove the German DATEV terms and the rate tokens `7 %` and `19 %` from the forbidden list; add `GERMANY_FILES` (`docs/odoo-format.md`, `docs/odoo-import.md`; missing files skipped) with the checks of the requirement "German (Germany) files during the transition" (Swiss and Austrian terms, `«` `»`; "ß" and the Swiss rate notation not checked); keep the Swiss checks for every other German file
- [ ] 2.3 Tests in `test/docs.test.ts` with fixture files in `test/fixtures/docs/` for the scenarios "Sharp s in an Odoo doc", "Swiss term in an Odoo doc", "Swiss doc keeps its checks", "German rate no longer forbidden", "Old binary in a doc" and "Stale Odoo config key"

## 3. Scope cut

- [ ] 3.1 Remove the Abacus-only backlog items from `docs/maintainers.md` `## Später geplant` (Saldosteuersatz, Debitoren-Schnittstelle in Abacus, Sammelbuchung pro Tag); add "Direkte Übertragung in Odoo über die externe API (JSON-2 ab Odoo 19, XML-RPC für 17 und 18), nur Entwürfe" with the reasons of `openspec/research/o-target.md` §7; keep generic items (keep the file's Swiss spelling until o08)
- [ ] 3.2 Leave `openspec/research/a-target.md` in place (removed in o04); `openspec/research/o-target.md` and `openspec/config.yaml` come from the planning PR
- [ ] 3.3 `--help` summary and package description name Odoo, not Abacus
- [ ] 3.4 `grep -rn "apaleo-abacus\|APALEO_ABACUS" --exclude-dir=node_modules --exclude-dir=openspec .` returns only README/README.en prose that o08 rewrites, `CHANGELOG.md` history and the `.gitignore` legacy names; no clone URL, `cd` line, badge, CI step, image tag or command line

## 4. Release check

- [ ] 4.1 `pnpm typecheck`, `pnpm lint`, `pnpm test` (without `UPDATE_GOLDEN`), `pnpm build` green; every Abacus golden file byte-identical
- [ ] 4.2 `node dist/cli/main.js --help` starts with `apaleo-odoo <command> [options]`; `node dist/cli/main.js export --month 2026-09 --demo --dry-run` exits 0
- [ ] 4.3 `docker build -t apaleo-odoo-export:ci .` and `docker run --rm apaleo-odoo-export:ci --help` work with the new entry point
