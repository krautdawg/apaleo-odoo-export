# documentation Specification

## Purpose
The German README with a short English `README.en.md`, the German guides in `docs/`, the example output in `docs/examples/`, the `export --demo` mode that shows the output without apaleo, and the test that keeps commands, flags, config keys, finding codes, links, anchors and the language of the docs in line with the code.
## Requirements
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

### Requirement: Example output and demo mode
The repository SHALL contain `docs/examples/` with a golden Odoo import file, its protocol text and a filled sample mapping CSV from the SKR03 hotel template for the German demo "Hotel Beispiel Berlin" (property `BSP`, EUR, `Europe/Berlin`, journal `APA`, `odoo.version` 19 with `taxRounding: per_tax` and a rounding account), linked from the README and the mapping guide, and `apaleo-odoo export --demo` SHALL run the pipeline on bundled German demo data in EUR with no config, secret or network, marking its output as demo.

#### Scenario: Steuerberater reviews before setup
- **WHEN** a Steuerberater opens `docs/examples/`
- **THEN** they find an `ODOO_Buchungen_*.csv` file in EUR, its protocol and the mapping that produced it, a README that says to import it only into a test database, and a test guarantees the CSV equals the current golden output

#### Scenario: Demo without credentials
- **WHEN** someone runs `apaleo-odoo export --month 2026-09 --demo --dry-run` with no config file and no `APALEO_CLIENT_SECRET`
- **THEN** the summary is printed with a `DEMO` marker, amounts in EUR, Kz 86 for 7 % and Kz 81 for 19 %, at least one rounding line, no network call is made, and the exit code is 0

#### Scenario: Demo file is marked in its name
- **WHEN** someone runs `apaleo-odoo export --month 2026-09 --demo` without `--dry-run`
- **THEN** the file is written below `./demo-output/` as `ODOO_Buchungen_20260901-20260930_BSP_DEMO.csv`, every reference starts with `DEMO `, every External ID contains `_DEMO_`, and the protocol's first line is `DEMO`, so it never looks like a real export in a file list or in Odoo

#### Scenario: Demo in the Docker image
- **WHEN** someone runs the real demo in the image with `-w /data` and a data folder owned by uid 1000, as docs/docker.md shows
- **THEN** the files appear in that folder under `demo-output/`, and CI runs exactly that; without a writable working directory the run fails with `E-EXPORT` and a hint naming `-w /data`

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

#### Scenario: Old binary in a doc
- **WHEN** `docs/export.md` shows ```` ```sh ```` `apaleo-abacus export --month 2026-10`
- **THEN** `pnpm test` fails naming `apaleo-abacus` and the file, and passes once the line reads `apaleo-odoo export --month 2026-10`

#### Scenario: Stale config key
- **WHEN** `docs/configuration.md` mentions `` `odoo.beraternummer` `` and the schema has no such key
- **THEN** `pnpm test` fails naming `odoo.beraternummer` and the file

#### Scenario: Other backticked text is ignored
- **WHEN** a doc mentions `` `ODOO_` ``, `` `1001` `` or `` `Revenues` ``
- **THEN** the test does not treat them as config keys or commands

#### Scenario: Umlaut anchor
- **WHEN** a doc links `../README.md#häufige-fragen` and the README has `## Häufige Fragen`
- **THEN** the link check passes

#### Scenario: English paragraph in a German doc
- **WHEN** `docs/troubleshooting.md` is left in English
- **THEN** `pnpm test` fails naming the file as not German, and `README.en.md` is the only checked file expected to be English

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

### Requirement: No unverified compatibility claim
README and docs SHALL describe the file as following Odoo's documented import of journal entries and SHALL say that a first test import with a Steuerberater is pending, and SHALL NOT claim that the file was tested with or is accepted by Odoo ("getestet mit Odoo", "kompatibel mit Odoo", "Odoo-zertifiziert", "tested with Odoo", "Odoo-compatible") until `docs/maintainers.md` records a test import under `## Testimporte` with date, Odoo version, edition and hosting, chart (SKR03 or SKR04), rounding method, result and "geprüft von" ("Maintainer, lokal" or the Kanzlei). The sentence that a first test import with a Steuerberater is pending SHALL stay until a row names a Kanzlei in "geprüft von".

#### Scenario: Claim without a recorded import
- **WHEN** the README says "getestet mit Odoo 18" and `## Testimporte` in `docs/maintainers.md` lists no import
- **THEN** `pnpm test` fails naming the README and the phrase

#### Scenario: Recorded import allows the claim
- **WHEN** `## Testimporte` records a row with all seven fields filled for Odoo 18
- **THEN** the README may say "getestet mit Odoo 18" and `pnpm test` passes

#### Scenario: Pending test import
- **WHEN** a reader opens the README before any test import
- **THEN** it says that the file follows Odoo's documented import of journal entries and that a first test import with a Steuerberater is still pending

### Requirement: README FAQ
The README SHALL contain a `## Häufige Fragen` section with one short answer per topic: Kosten ("Ist das ein kostenloser apaleo Odoo Connector?"), Daten (what leaves the hotel, nothing hosted), Odoo-Versionen und Editionen (17, 18, 19, Community and Enterprise, Odoo Online, Odoo.sh, self-hosted; no API access needed, so it also works on the Odoo Online Standard plan), Direktübertragung (no, file import; the API transfer of drafts is planned later), Steuern (Odoo computes the VAT from the tax of each line; cent differences to apaleo and why), Testimport, rückgängig (delete drafts, reverse posted entries), mehrere Hotels (one journal or one company per hotel; External IDs per company), wechseln (from a paid connector: build the mapping with the template, keep the old connector until the first month matches), Österreich und Schweiz (l10n_at and l10n_ch through a hand-made mapping, no template), and DATEV, BMD und Abacus (answered in a line that links apaleo-datev-export, apaleo-bmd-export and apaleo-abacus-export). No answer SHALL name a vendor of a paid connector.

#### Scenario: Hotel asks about Odoo Online
- **WHEN** a hotel on Odoo Online Standard reads the FAQ
- **THEN** the topic Odoo-Versionen und Editionen says that the tool needs no API access and the file is imported with Odoo's standard import, and links `docs/odoo-import.md`

#### Scenario: FAQ topics tested
- **WHEN** `pnpm test` runs
- **THEN** `test/readme.test.ts` finds every topic of this requirement under `## Häufige Fragen`, and the docs test accepts the DATEV, BMD und Abacus answer because it links the origin projects

### Requirement: Mapping guide for Odoo
`docs/mapping-guide.md` SHALL be rewritten in German as used in Germany ("ß" and German rates allowed since o01; no Swiss or Austrian practice terms and no `«` `»`, grepped in this slice's release check and tested for every German file from o08 on) for Odoo: the columns (`odoo_account`, `odoo_tax` with the chart-template id or a full External ID, `tax_percent`), the resolution order, the SKR03 and SKR04 templates with a table of every row and its account and tax, the rule that Odoo computes the VAT from the tax of the line and that the tax's rate must equal apaleo's rate, how rates depend on the service date (Logis 7 %, Speisen 7 % for services from 2026-01-01 and 19 % before, Getränke 19 %, the 2020 rates 16 % and 5 %), Anzahlungen with their tax, payments to Kasse and Geldtransit with the codes Odoo generates for them (a fresh database per version, and how to look them up in the Kontenplan), guest receivables and company invoices, accounts with a default tax in Odoo and why the file sets the tax explicitly, why untaxed revenue carries no tax at all and never `tax_not_taxable_*` (UStVA Kz 45, Leistungsort im Ausland), every finding of "Mapping validation for Odoo" with its fix, every template row marked `Vorschlag (ungeprüft)`, and a last section `## Checkliste zur Freigabe durch die Kanzlei` that asks, for every mapped account with a tax, whether the Odoo company has that tax with that rate and for every untaxed account whether a default tax could be applied by hand later. Kurtaxe, Beherbergungsteuer, Forderungsverluste and no-show fees SHALL be described as decisions for the Kanzlei with a pointer to the section that o05 completes.

#### Scenario: Steuerberater review
- **WHEN** a Steuerberater reads the mapping guide and a mapping CSV written by `init-mapping --template skr03-hotel`
- **THEN** they can decide each row without running the tool, and the guide ends with the sign-off checklist, which lists for example `8300 -> tax_ust_7_skr03 (7 %)`, `8400 -> tax_ust_19_skr03 (19 %)` and `1718 -> tax_ust_19_skr03 (19 %)`

#### Scenario: Mapping guide in German as used in Germany
- **WHEN** `pnpm test` and the release check run after this slice
- **THEN** the docs test passes `docs/mapping-guide.md` with "ß", `SKR03` and `19 %`, and the release-check grep finds neither `MWST-Code` nor `Treuhänder` in it

### Requirement: First import in Odoo
`docs/odoo-import.md` (German as used in Germany; no Swiss or Austrian practice terms and no `«` `»`, grepped in this slice's release check) SHALL describe how the hotel or its Kanzlei imports the file and what to check, with Odoo menu names in German and the English label in parentheses where they differ: the preparation (a dedicated journal of type Sonstige with the code of `odoo.journal`, the installed chart SKR03 or SKR04, the taxes of the mapping and how to see their External IDs (developer mode, or export of the taxes with "External ID"), `odoo.companyId` as the id of the company that owns the taxes (for a branch company its root company), the company's rounding method compared with `odoo.taxRounding`, looking up in the Kontenplan the codes of the Kasse account of the cash journal and of the Liquiditätstransferkonto (fresh database: SKR03 `1001` and `1360`, Odoo 17 `13601`; SKR04 `1601` and `1460`, Odoo 17 `14601`) and entering them in the mapping when they differ, and in Community the user right "Show Full Accounting Features"); the import (only the target company active in the company switcher, because accounts and journals are matched in every active company and in Odoo 19 also by account code prefix and description; Accounting > Journal Entries > gear > Import records, upload the CSV, check the detected formatting, "Test", then "Import"; what the messages "No matching record found" and "Found multiple matches" mean); the checks after the import (all entries are drafts with the reference `apaleo <property> <date>`, no "Automatic Balancing Line" on the suspense account, Odoo's tax per rate and Kennzahl equals the protocol, the guest ledger and Geldtransit balances equal the protocol, then post); what a second import of the same file does (updates its own drafts through their External IDs and changes nothing); how to replace a month after `--overwrite` (the new file is a revision with new External IDs and the reference suffix „(Korrektur N)“: first delete the draft entries of the earlier revision, reverse its posted entries, because the audit trail of l10n_de forbids deleting them and a reversal keeps their External IDs, with the „Stornodatum“ (Reversal Date) set to the date of the original entry instead of today, which Odoo proposes, so the month nets to zero in its own period and UStVA, and with the date and a berichtigte UStVA left to the Kanzlei when that month's UStVA is filed, then import the new file, which creates new entries; until o06 makes the export choose the revision, a note that `--overwrite` still writes revision 1 with the same External IDs and so replaces only a month that has nothing but drafts in Odoo); how to undo a file (delete draft entries, reverse posted ones with the date of the original entry); Ist-Versteuerung and cash-basis taxes as a question for the Kanzlei; and the open questions of research §10, plus whether the reversal carries the date of the original entry, as a checklist for the first test import. README and `docs/configuration.md` SHALL link it.

#### Scenario: First import
- **WHEN** a Steuerberater imports the first file
- **THEN** `docs/odoo-import.md` names the journal, the lookup of the Kasse and Geldtransit codes in the Kontenplan, the single active company, the menu path, the "Test" step, the check for an "Automatic Balancing Line", the comparison of the tax per rate with the protocol and how to undo an imported file

#### Scenario: Corrected month after a posted import
- **WHEN** September was imported and posted, a late posting changed it, and the hotel exported again with `--overwrite`
- **THEN** `docs/odoo-import.md` says to reverse the posted entries with the reference `apaleo BSP` of the earlier revision and then import the new file, whose entries carry `_r2` External IDs and „(Korrektur 2)“ in the reference and are created as new drafts

#### Scenario: Reversal in a later month
- **WHEN** the Kanzlei reverses the posted September entries in October
- **THEN** `docs/odoo-import.md` tells it to set the „Stornodatum“ (Reversal Date) to the date of each original entry rather than today, says that one date applies to all entries reversed at once, and that otherwise September counts both revisions in Kz 81 and 86 while October holds a negative copy, and leaves the date and a berichtigte UStVA to the Kanzlei when September's UStVA is filed

#### Scenario: Abacus guides are gone
- **WHEN** someone looks for `docs/abacus-import.md` or `docs/abacus-format.md`
- **THEN** neither exists, and the README and every doc link `docs/odoo-import.md` and `docs/odoo-format.md` instead

### Requirement: Posting rules doc for Odoo
`docs/posting-rules.md` SHALL be rewritten in German as used in Germany (no Swiss or Austrian practice terms and no `«` `»`, grepped in this slice's release check) for Odoo: one journal entry per day and property, netting per account, tax and label, the VAT side and why the file carries net bases with the Odoo tax and no tax lines, the base fitting with the rounding methods and the `Rundungsausgleich` lines, the tax guard and its findings, the German special cases with one table each from the German fixture month (Kurtaxe and Übernachtungsteuer, deposits received, released and refunded with their effect on Kz 86, accounts receivable, write-offs with § 17 UStG, cancellation and no-show fees, payments and the `/Offset` lines), the skipped lines, the labels and the summary, with an excerpt of the CSV for one day. `docs/mapping-guide.md` SHALL complete its sections on Kurtaxe, Beherbergungsteuer, Forderungsverluste, no-show fees and the Speisen rate with the findings `W-CITY-TAX-TAXED`, `W-FOOD-RATE` and `N-TEMPLATE-SUGGESTION`.

#### Scenario: Kanzlei reads how a deposit is booked
- **WHEN** a Steuerberater reads the deposit section of `docs/posting-rules.md`
- **THEN** it shows the received, released and refunded deposit of the German month as entry lines on `1711` with `tax_ust_7_skr03`, the side of each, and that the release lowers Kz 86 by the deposit while the revenue line raises it again

### Requirement: Export doc for Odoo
`docs/export.md` and `docs/examples/README.md` SHALL be rewritten in German as used in Germany (no Swiss or Austrian practice terms and no `«` `»`, grepped in this slice's release check): periods and the split per month, the date rules, the dry run with every part of the summary and how to compare it with Odoo after the import, the output folder with file, protocol and `manifest.json`, re-runs (`unchanged`, `E-FILE-EXISTS`, `--overwrite`, `E-PERIOD-OVERLAP`) with what to do in Odoo, and the demo.

#### Scenario: Hotel compares after the import
- **WHEN** a hotel reads the dry-run section of `docs/export.md`
- **THEN** it learns which line of the summary to compare with which Odoo view (tax lines per rate, balance of `1410` and `1360`), and that a difference per rate to apaleo comes from Odoo's rounding

### Requirement: Docker guide for Germany
`docs/docker.md` SHALL be rewritten in German as used in Germany (no Swiss or Austrian practice terms and no `«` `»`, grepped in this slice's release check) with: building the image locally, the compose loop around `schedule --once` with `Europe/Berlin`, the host-cron alternative, one-off commands (`export`, `mapping check`, `doctor`) in the container, the demo in the image (`-w /data`), the folder `./data/<Hotel>/<JJJJ-MM>/` with the Odoo CSV and its protocol, the `chown` for uid 1000, updates, and the link to `docs/odoo-import.md`.

#### Scenario: Docker guide in German as used in Germany
- **WHEN** `pnpm test` and the release check run after this slice
- **THEN** the command lines of `docs/docker.md` are checked against the CLI, and it contains neither `Treuhänder` nor `Europe/Zurich`

