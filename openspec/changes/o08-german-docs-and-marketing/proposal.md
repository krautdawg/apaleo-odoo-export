## Why

After o07 the tool works end to end for German hotels with Odoo, but the README, the remaining guides, the community files and the GitHub metadata still describe a Swiss Abacus product in Swiss Standard German. Hotels and Steuerberater searching for "apaleo Odoo", "apaleo Odoo Export", "apaleo Odoo Buchhaltung", "Odoo Hotel Buchungsjournal Import" or "apaleo Odoo Connector kostenlos" must find it and understand it from the first screen. This is the last slice before the repository may be made public (by the maintainer, not here).

## What Changes

- README rewritten in German as used in Germany: H1 "apaleo Odoo Export – kostenlos und Open Source", tagline and intro with the search terms, disclaimer notice, `## Was es macht`, `## Für wen`, demo, quick start (five steps, SKR03/SKR04), Docker quick start, commands, `## Was es nicht macht`, `## Vergleich mit kostenpflichtigen Connectoren` (24-51 EUR per month, no vendor name), `## Häufige Fragen`, origin sentence linking apaleo-datev-export, apaleo-bmd-export and apaleo-abacus-export.
- `README.en.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` (official German Contributor Covenant 2.1, verbatim with "ß"), `DISCLAIMER.md` (Steuerberater, Odoo, no connection to apaleo GmbH or Odoo S.A.), `CHANGELOG.md`, issue forms, PR template, the remaining docs (`setup-apaleo.md`, `configuration.md`, `troubleshooting.md`, `architecture.md`, `maintainers.md`, `apaleo-source.md`) rewritten for Germany.
- Docs test: one rule for every German file (German as used in Germany, "ß" allowed, Swiss and Austrian practice terms and `«` `»` refused, `Abacus` and `BMD` only in the origin places); `GERMANY_FILES` and the Swiss checks removed.
- GitHub description and topics for discoverability, visibility unchanged; `docs/maintainers.md` `## Vor der Veröffentlichung` with the first Odoo test import.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `documentation`: README, quick start, scope and comparison, docs folder, docs test, German-first docs, English README, FAQ.
- `community-health`: contribution files, changelog, templates, description and topics.
- `project-quality`: licence and disclaimer.

## Non-goals

- No code change apart from tests of docs and metadata; no change of repository visibility, no release, no publishing.
- No claim of a tested import until `## Testimporte` records one.

## Impact

- `README.md`, `README.en.md`, `docs/*.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `DISCLAIMER.md`, `CHANGELOG.md`, `.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md`, `test/docs.test.ts`, `test/helpers/docs.ts`, `test/readme.test.ts`, `test/community.test.ts`, `test/repo-files.test.ts`, GitHub repository metadata.
