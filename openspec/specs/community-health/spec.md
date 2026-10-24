# community-health Specification

## Purpose
The files that let others contribute safely: contribution guide, code of conduct, security policy, changelog, GitHub issue forms and pull-request template, and the repository description and topics for discoverability once the repository is public.
## Requirements
### Requirement: Contribution and conduct files
The repository SHALL contain, in Swiss Standard German, `CONTRIBUTING.md` (`## Einrichtung`, `## Skripte`, OpenSpec workflow including `openspec archive`, Conventional Commits, the rule that fixtures contain no real guest data and that contributed apaleo responses are anonymised, and the rule that code, identifiers and commit messages stay English while English issues and pull requests are welcome), `CODE_OF_CONDUCT.md` (the official German translation of the Contributor Covenant 2.1, verbatim apart from writing "ss" for "ß", with the project contact filled in) and `SECURITY.md` (private reporting through a GitHub security advisory, supported versions, no bounty).

#### Scenario: Security report
- **WHEN** someone finds a vulnerability
- **THEN** `SECURITY.md` tells them in Swiss Standard German to report it **vertraulich** through a private GitHub security advisory and not in a public issue

#### Scenario: Code of conduct is the official translation
- **WHEN** `pnpm test` runs
- **THEN** it asserts that `CODE_OF_CONDUCT.md` names the Contributor Covenant, version 2.1, has the headings of the official German translation (Unsere Verpflichtung, Unsere Standards, Verantwortlichkeiten bei der Durchsetzung, Geltungsbereich, Durchsetzung, Durchsetzungsrichtlinien, Bezug) and contains no "ß"

### Requirement: Changelog
The repository SHALL contain `CHANGELOG.md` in Swiss Standard German in the Keep a Changelog format (German edition, `https://keepachangelog.com/de/1.1.0/`) with a `## [Unveröffentlicht]` section that lists the user-visible changes since the last version, using the German section names (Hinzugefügt, Geändert, Entfernt, Behoben). Entries SHALL be in Swiss Standard German; command names, flags and file names in them SHALL stay unchanged. The changelog SHALL start the history of apaleo-abacus-export and SHALL name and link apaleo-bmd-export v0.1.0 as its origin instead of repeating that project's entries.

#### Scenario: Unreleased section
- **WHEN** this slice is merged
- **THEN** `## [Unveröffentlicht]` lists under `### Hinzugefügt` the Abacus XML Buchungen file, the KMU hotel template with `init-mapping --template kmu-hotel`, the Swiss posting rules (MWST-Codes, Kurtaxe, Anzahlungen, Debitorenverlust, Annullationen), CHF as Leitwährung, `export --demo`, `schedule --once` and Docker, and under `### Entfernt` the BMD Buchungsimport and the EKR template, and the file names apaleo-bmd-export v0.1.0 as the origin

### Requirement: Issue and pull-request templates
The repository SHALL provide Swiss Standard German GitHub issue forms for bug reports (`Fehlerbericht`, asking for tool version, command, finding codes and anonymised output, and warning not to paste secrets, guest data or account numbers of the Mandant), feature requests (`Funktionswunsch`), and new source or target requests (`Neue Quelle oder neues Zielformat`), and a Swiss Standard German pull-request template with a checklist for tests, documentation, secrets and personal data. The forms SHALL speak of Abacus and Swiss accounting, not of BMD or DATEV practice. Form field ids SHALL stay unchanged.

#### Scenario: Bug report form
- **WHEN** a user opens a new bug report
- **THEN** the form asks in Swiss Standard German for version, command and finding codes and shows "**Füge nie Secrets oder Gästedaten ein.**" with a link to `SECURITY.md`

#### Scenario: Feature request form
- **WHEN** a user opens a feature request
- **THEN** the form asks what the Treuhänder needs in Abacus and names neither BMD nor DATEV

### Requirement: Repository description and topics
The repository description and topics SHALL be set for discoverability (description in Swiss Standard German naming apaleo, Abacus and the Abacus Finanzbuchhaltung; topics including apaleo, abacus, abacus-export, abaconnect, abacus-fibu, mwst, kmu-kontenrahmen, hotel, hospitality, accounting, buchhaltung, treuhand, switzerland and schweiz) without changing the repository visibility. `docs/maintainers.md` SHALL state in Swiss Standard German that discoverability only takes effect once the maintainer makes the repository public and SHALL contain a `## Vor der Veröffentlichung` checklist (first real Abacus test import with a Treuhänder, recorded under `## Testimporte`; a recorded Swiss apaleo sandbox day in `test/fixtures/apaleo/live/`; visibility; social preview; Discussions; first release tag).

#### Scenario: Metadata applied
- **WHEN** the slice is merged
- **THEN** `gh repo view --json description,repositoryTopics,visibility` shows the description and all listed topics, no BMD or DATEV topic remains, and the visibility is unchanged

#### Scenario: Going public later
- **WHEN** the maintainer decides to publish the repository
- **THEN** `docs/maintainers.md` lists the steps in order under `## Vor der Veröffentlichung`, starting with the confirmed test import, and none of them was done by this slice

