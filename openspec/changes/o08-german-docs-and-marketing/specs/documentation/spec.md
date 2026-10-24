## MODIFIED Requirements

### Requirement: README first screen
The README SHALL be in German as written in Germany. Its first line SHALL be the H1 and SHALL contain "apaleo Odoo Export", "kostenlos" and "Open Source". The first non-empty line after the H1 SHALL link `README.en.md`. Then, before any installation detail, the README SHALL show the tagline "Kostenloser apaleo Odoo Export: Buchungssätze für die Odoo Buchhaltung aus apaleo, als Importdatei, Open Source", CI, licence and Node.js badges, an intro paragraph that names `apaleo-odoo-export`, says it is built for hotels in Germany with apaleo and Odoo and their Steuerberater, and says that the file follows Odoo's documented import of journal entries and a first test import with a Steuerberater is still pending, the notice "Keine Gewähr, keine Steuerberatung" with "Lass deine Kontenzuordnung von deinem Steuerberater prüfen" linking `DISCLAIMER.md`, and a `## Was es macht` list with five items.

#### Scenario: Visitor from a search
- **WHEN** someone opens the repository page
- **THEN** the first screen states in German that the tool is a free, open-source apaleo Odoo Export that writes an import file of journal entries for the Odoo Buchhaltung, shows the disclaimer notice and links the English README

#### Scenario: Search terms in the first lines
- **WHEN** the title, tagline and intro paragraph are scanned
- **THEN** they contain apaleo, Odoo, apaleo Odoo Export, Odoo Buchhaltung, Buchungssätze, Buchungsjournal, Import, SKR03, SKR04, Steuerberater, Hotel, Deutschland, Connector, Open Source and kostenlos

### Requirement: Quick start that works
The README SHALL contain a `## Schnellstart` with five numbered steps labelled "apaleo Custom App anlegen.", "Installieren", "Kontenzuordnung anlegen", "Probelauf" and "Export" (create the apaleo custom app; install from source with `git clone https://github.com/krautdawg/apaleo-odoo-export.git`, `cd apaleo-odoo-export`, `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm build`; then `init-mapping --template skr03-hotel` or `skr04-hotel`, `export --dry-run`, `export`, with the hint to create the journal and import the file as `docs/odoo-import.md` describes), and a `## Schnellstart mit Docker` that builds the image locally with `docker compose -f docker-compose.example.yml build`. It SHALL contain the sentence "Es gibt noch kein npm-Paket und kein Container-Image zum Herunterladen. Du installierst aus dem Quellcode.", SHALL NOT show `npx` or `docker pull` (nor shall `README.en.md`), and every command shown SHALL exist in the CLI. CI SHALL run the install block marked `<!-- quickstart -->` in `README.md` verbatim up to `--help` and then the demo dry run.

#### Scenario: Install commands run in CI
- **WHEN** the `readme-quickstart` CI job runs
- **THEN** it executes the README's quick-start install block, `node dist/cli/main.js --help` exits 0 and shows `apaleo-odoo`, and `node dist/cli/main.js export --month 2026-09 --demo --dry-run` prints the Odoo posting summary in EUR and exits 0 without network or credentials

#### Scenario: No dead-end install step
- **WHEN** `README.md` and `README.en.md` are scanned
- **THEN** they contain no `npx apaleo-odoo` and no `docker pull`, and each contains its sentence that there is no npm or registry release yet

### Requirement: Honest scope and comparison
The README SHALL include a `## Was es nicht macht` section (no transfer into Odoo through the API, the file is imported by hand; no posting, the entries stay drafts; no invoices, partners or per-partner receivables; no payments or reconciliation; no analytic accounts (Kostenstellen); no PDF documents; no postings of payment-provider fees, chargebacks or booking-portal commissions; no cash-basis taxes; only the company currency without conversion; no Austrian or Swiss template; no Weboberfläche, no gehosteter Dienst, no Odoo module; no other target formats such as DATEV, BMD or Abacus) and a `## Vergleich mit kostenpflichtigen Connectoren` section that names no vendor, gives the price as "24-51 EUR pro Monat und Betrieb (je nach Anzahl der Betriebe), laut apaleo Store, Oktober 2026", and states the trade-offs of self-hosting ("Selbst betreiben heißt"). It SHALL state in one sentence that the tool is built on apaleo-datev-export, apaleo-bmd-export and apaleo-abacus-export and link all three for DATEV, BMD and Abacus users.

#### Scenario: Comparison table
- **WHEN** a reader looks at the comparison
- **THEN** it shows Preis, Betrieb, Einrichtung, Übertragung nach Odoo, Steuern in Odoo, Entwürfe oder gebucht, Support and Vorlagen für die Zuordnung for both options, contains no vendor or product name of a competitor, and `test/readme.test.ts` finds the price sentence with "Oktober 2026"

### Requirement: Docs folder
The repository SHALL contain, in German as written in Germany, `docs/setup-apaleo.md` (custom app creation with the exact permissions, the optional one marked `optional`), `docs/mapping-guide.md` (o03, o05), `docs/odoo-import.md` (o04), `docs/odoo-format.md` (o02), `docs/configuration.md`, `docs/docker.md`, `docs/troubleshooting.md`, `docs/architecture.md`, `docs/maintainers.md` (`## Vor der Veröffentlichung` checklist, `## Lokaler Testimport` with the maintainer check of `scripts/odoo-check/`, `## Testimporte` record with date, Odoo version, edition and hosting, chart, rounding method, result and geprüft von, and `## Später geplant` backlog with items inside this product only, among them the API transfer of draft entries, analytic accounts (Kostenstellen) and templates for Austria and Switzerland), `docs/posting-rules.md`, `docs/export.md`, `docs/apaleo-source.md` and `docs/examples/README.md`. Every German doc SHALL write rates with a decimal comma and a space before the percent sign (`7 %`, `19 %`, `10,7 %`), except in code spans, code fences and CSV or config values. No `docs/abacus-*.md`, `docs/bmd-*.md` or `docs/datev-*.md` file SHALL exist.

#### Scenario: Contributor adds a source
- **WHEN** a contributor wants to add a Smoobu source
- **THEN** `docs/architecture.md` explains in German the SourceAdapter contract, the canonical ledger line (`LedgerLine`) and where tests and fixtures go

#### Scenario: Contributor adds a target
- **WHEN** a contributor wants to add a writer for another target format
- **THEN** `docs/architecture.md` explains in German the `TargetWriter` boundary (including `currency` and `movements`), the `OdooBooking` example, the fitting as a target-specific step and where golden files go, without announcing any other target as planned

#### Scenario: Former file names
- **WHEN** someone looks for `docs/abacus-import.md`, `docs/abacus-format.md` or `docs/setup-apaleo.de.md`
- **THEN** none exists, and the README and every doc link `docs/setup-apaleo.md`, `docs/mapping-guide.md`, `docs/odoo-import.md` and `docs/odoo-format.md`

### Requirement: Docs consistency test
The test suite SHALL check `README.md`, `README.en.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `DISCLAIMER.md`, `CHANGELOG.md`, every Markdown file in `docs/` and `examples/demo/README.md`. It SHALL fail when one of them contains, inside an `sh` or `bash` code fence, an `apaleo-odoo` command line whose command is not registered or whose flag is not in that command's options, or an `apaleo-abacus`, `apaleo-bmd` or `apaleo-datev` command line at all; when it contains a backticked token matching `^(apaleo|odoo|output|posting|properties|schedule|checks)(\.[A-Za-z\[\]]+)+$` that is not a config schema path; when a finding code (`[EWN]-[A-Z-]+`) used in the source is missing from `docs/troubleshooting.md` or a documented code no longer exists in the source; when a relative link outside code fences points to a missing file or to an anchor that is not a heading slug of its target (GitHub slug rules, umlauts and "ß" kept); when a `*.de.md` file exists outside `node_modules/`, `dist/` and `openspec/`; when the prose of a German file is not predominantly German; when a German file other than `CODE_OF_CONDUCT.md` addresses the reader with "Sie"; when the prose of a German file writes a rate with a decimal point or without the space before `%` (code spans and fences excepted); when a German file contains the Swiss quotation marks `«` or `»`; or when a German file uses a term from Swiss practice (`Treuhänder`, `MWST`, `MWST-Code`, `MWST-Abrechnung`, `Rappen`, `KMU-Kontenrahmen`, `Mandantennummer`, `Leitwährung`) or from Austrian BMD practice (`Steuercode`, `Buchungssymbol`, `Einheitskontenrahmen`, `EKR`, `UVA`, `Ortstaxe`, `Nächtigungsabgabe`), or the tokens `Abacus` or `BMD` (terms and tokens matched as whole words), except in a README line that links an origin project (the origin sentence and the FAQ answer on DATEV, BMD and Abacus), the README `## Was es nicht macht` item about other target formats, `CHANGELOG.md`, and the `docs/troubleshooting.md` entries of the findings that detect a copied Abacus, BMD or DATEV setup. These checks SHALL apply to every German file, with no per-file list.

#### Scenario: Renamed command
- **WHEN** a command is renamed in code but not in the README
- **THEN** `pnpm test` fails and names the stale mention and the file

#### Scenario: Stale flag
- **WHEN** `docs/odoo-import.md` shows ```` ```sh ```` `apaleo-odoo export --month 2026-10 --upload` and `export` has no `--upload` option
- **THEN** `pnpm test` fails naming `--upload`, the command and the file

#### Scenario: Broken anchor after a rewrite
- **WHEN** the README links `docs/docker.md#die-demo-im-image` and that heading is now `### Demo im Image`
- **THEN** `pnpm test` fails naming the README, the link and the missing anchor

#### Scenario: Sharp s is German
- **WHEN** `docs/docker.md` contains "Schließe das Terminal"
- **THEN** the docs test passes for that line

#### Scenario: Swiss paragraph copied
- **WHEN** `docs/mapping-guide.md` contains "Dein Treuhänder prüft den MWST-Code"
- **THEN** `pnpm test` fails naming the file and the terms `Treuhänder` and `MWST-Code`

#### Scenario: Austrian paragraph copied
- **WHEN** `docs/mapping-guide.md` contains "Die Kanzlei legt das Buchungssymbol an"
- **THEN** `pnpm test` fails naming the file and the term `Buchungssymbol`, while `Kanzlei` passes

#### Scenario: DATEV is a German term
- **WHEN** `docs/odoo-import.md` contains "Der DATEV-Export aus Odoo Enterprise bleibt davon unberührt"
- **THEN** the term check passes

#### Scenario: Bare Abacus mention
- **WHEN** `docs/odoo-import.md` contains "wie beim Abacus-Import"
- **THEN** `pnpm test` fails naming the file and the token `Abacus`

#### Scenario: Allowed origin mention
- **WHEN** the README origin sentence links apaleo-datev-export, apaleo-bmd-export and apaleo-abacus-export and the `## Was es nicht macht` list says "keine anderen Zielformate wie DATEV, BMD oder Abacus"
- **THEN** the term check passes for the README

#### Scenario: Decimal point in a German rate
- **WHEN** `docs/posting-rules.md` contains "Beherbergung zu 7.0 %" or "Getränke zu 19%"
- **THEN** `pnpm test` fails naming the file and the rate, and passes once it reads "7 %" or "19 %", while `` `19.0` `` in a code span passes

### Requirement: German-first documentation
The README and every user-facing document SHALL be written in German as used in Germany only: `README.md`, every Markdown file in `docs/` (including `docs/examples/README.md`), `examples/demo/README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `DISCLAIMER.md`, `CHANGELOG.md`, the issue forms and the pull-request template in `.github/`, the comments in `apaleo-odoo.config.example.yaml`, `.env.example`, `docker-compose.example.yml` and the templates. The text SHALL use "ß" where German spelling requires it, German quotation marks („…“), SHALL address the reader with "du", SHALL use German words where a common one exists, and SHALL use German accounting and Odoo terms as practitioners do (Steuerberater, Kanzlei, Buchhaltung, Buchungssatz, Journal, Entwurf, buchen, Sachkonto, Gegenkonto, Umsatzsteuer, USt, Steuersatz, Kennzahl, UStVA, SKR03, SKR04, Kostenstelle, Anzahlung, Kurtaxe, Beherbergungsteuer, durchlaufender Posten, Geldtransit, Forderungsverlust), with Odoo menu names in German and the English label in parentheses where they differ. Source code, identifiers, CLI output, commit messages, `LICENSE`, `src/**/README.md`, `openspec/research/` and the OpenSpec specs SHALL stay English, and commands, flags, config keys, finding codes and quoted CLI output SHALL appear unchanged. No topic SHALL be documented in two languages, except `README.en.md` and the non-binding English translation in `DISCLAIMER.md`; there SHALL be no `*.de.md` files.

#### Scenario: Hotel reads a guide
- **WHEN** a hotel back office opens any file in `docs/`
- **THEN** the text is German as used in Germany, uses "du", and every command and config key in it is the one the CLI accepts

#### Scenario: Guide in two languages is rejected
- **WHEN** someone adds `docs/docker.de.md` or an English section to a German doc
- **THEN** `pnpm test` fails, naming the `.de.md` file or the file whose prose is not German

#### Scenario: Polite address is rejected
- **WHEN** a German doc contains "Prüfen Sie die Datei" or "Ihr Steuerberater"
- **THEN** `pnpm test` fails naming the file, while "Sie prüft die Datei" at the start of a sentence passes

#### Scenario: Code stays English
- **WHEN** the German docs are merged
- **THEN** no file under `src/` changed apart from comments of templates read by tests, the example config files changed only in comments, and the CLI prints the same output as before

### Requirement: Short English README
The repository SHALL contain `README.en.md` of at most 80 lines with: what the tool is (apaleo to Odoo Accounting journal entries as an import file, for hotels in Germany, SKR03/SKR04, Odoo 17 to 19), the disclaimer linking `DISCLAIMER.md`, a quick start with the same install commands as the German README and the sentence "There is no npm package or container image release yet. You install from source.", a list of the German guides, a contributing note that English issues and pull requests are welcome, and the licence linking `LICENSE`. It SHALL NOT contain the `<!-- quickstart -->` marker.

#### Scenario: International contributor
- **WHEN** an English-speaking developer opens the repository and follows the "English" link at the top of the README
- **THEN** `README.en.md` tells them what the tool does, how to install it from source, that the docs are in German, and how to contribute

#### Scenario: English README stays short and in step
- **WHEN** `pnpm test` runs
- **THEN** it fails if `README.en.md` exceeds 80 lines, contains the quickstart marker, or lists install commands that differ from the German quick-start block apart from shell comments

### Requirement: README FAQ
The README SHALL contain a `## Häufige Fragen` section with one short answer per topic: Kosten ("Ist das ein kostenloser apaleo Odoo Connector?"), Daten (what leaves the hotel, nothing hosted), Odoo-Versionen und Editionen (17, 18, 19, Community and Enterprise, Odoo Online, Odoo.sh, self-hosted; no API access needed, so it also works on the Odoo Online Standard plan), Direktübertragung (no, file import; the API transfer of drafts is planned later), Steuern (Odoo computes the VAT from the tax of each line; cent differences to apaleo and why), Testimport, rückgängig (delete drafts, reverse posted entries), mehrere Hotels (one journal or one company per hotel; External IDs per company), wechseln (from a paid connector: build the mapping with the template, keep the old connector until the first month matches), Österreich und Schweiz (l10n_at and l10n_ch through a hand-made mapping, no template), and DATEV, BMD und Abacus (answered in a line that links apaleo-datev-export, apaleo-bmd-export and apaleo-abacus-export). No answer SHALL name a vendor of a paid connector.

#### Scenario: Hotel asks about Odoo Online
- **WHEN** a hotel on Odoo Online Standard reads the FAQ
- **THEN** the topic Odoo-Versionen und Editionen says that the tool needs no API access and the file is imported with Odoo's standard import, and links `docs/odoo-import.md`

#### Scenario: FAQ topics tested
- **WHEN** `pnpm test` runs
- **THEN** `test/readme.test.ts` finds every topic of this requirement under `## Häufige Fragen`, and the docs test accepts the DATEV, BMD und Abacus answer because it links the origin projects

## REMOVED Requirements

### Requirement: Spelling rules during the transition
**Reason**: Every German file is now written for Germany; the Swiss and Austrian term ban and the German rate notation now apply to every German file.
**Migration**: See "Docs consistency test", which applies one rule to every German file.

### Requirement: Command lines and config keys of apaleo-odoo in the docs
**Reason**: Merged into "Docs consistency test", which now names the `apaleo-odoo` command lines, the refused old binaries and the `odoo` config prefix.
**Migration**: See "Docs consistency test".
