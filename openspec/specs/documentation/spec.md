# documentation Specification

## Purpose
The German README with a short English `README.en.md`, the German guides in `docs/`, the example output in `docs/examples/`, the `export --demo` mode that shows the output without apaleo, and the test that keeps commands, flags, config keys, finding codes, links, anchors and the language of the docs in line with the code.
## Requirements
### Requirement: README first screen
The README SHALL be in Swiss Standard German. Its first line SHALL be the H1 and SHALL contain "apaleo Abacus Export", "kostenlos" and "Open Source". The first non-empty line after the H1 SHALL link `README.en.md`. Then, before any installation detail, the README SHALL show the tagline "Kostenloser apaleo Abacus Export: XML-Buchungsimport für die Abacus Finanzbuchhaltung aus apaleo, Open Source", CI, licence and Node.js badges, an intro paragraph that names `apaleo-abacus-export` and says it is built for Swiss hotels and their Treuhänder, the notice "Keine Gewähr, keine Steuerberatung" with "Lass deine Kontenzuordnung von deinem Treuhänder prüfen" linking `DISCLAIMER.md`, and a `## Was es macht` list with five items.

#### Scenario: Visitor from a search
- **WHEN** someone opens the repository page
- **THEN** the first screen states in Swiss Standard German that the tool is a free, open-source apaleo Abacus Export that writes AbaConnect XML Buchungen files for the Abacus Finanzbuchhaltung, shows the disclaimer notice and links the English README

#### Scenario: Search terms in the first lines
- **WHEN** the title, tagline and intro paragraph are scanned
- **THEN** they contain apaleo, Abacus, Abacus Finanzbuchhaltung, Abacus-Export, AbaConnect, XML Buchungen, MWST, KMU-Kontenrahmen, Treuhänder, Buchhaltung, Hotel, Schweiz, Open Source and kostenlos

### Requirement: Quick start that works
The README SHALL contain a `## Schnellstart` with five numbered steps labelled "apaleo Custom App anlegen.", "Installieren", "Kontenzuordnung anlegen", "Probelauf" and "Export" (create the apaleo custom app; install from source with `git clone https://github.com/krautdawg/apaleo-abacus-export.git`, `cd apaleo-abacus-export`, `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm build`; then `init-mapping --template kmu-hotel`, `export --dry-run`, `export`), and a `## Schnellstart mit Docker` that builds the image locally with `docker compose -f docker-compose.example.yml build`. It SHALL contain the sentence "Es gibt noch kein npm-Paket und kein Container-Image zum Herunterladen. Du installierst aus dem Quellcode.", SHALL NOT show `npx` or `docker pull` (nor shall `README.en.md`), and every command shown SHALL exist in the CLI. CI SHALL run the install block marked `<!-- quickstart -->` in `README.md` verbatim up to `--help` and then the demo dry run.

#### Scenario: Install commands run in CI
- **WHEN** the `readme-quickstart` CI job runs
- **THEN** it executes the README's quick-start install block, `node dist/cli/main.js --help` exits 0 and shows `apaleo-abacus`, and `node dist/cli/main.js export --month 2026-09 --demo --dry-run` prints the Abacus posting summary in CHF and exits 0 without network or credentials

#### Scenario: No dead-end install step
- **WHEN** `README.md` and `README.en.md` are scanned
- **THEN** they contain no `npx apaleo-abacus` and no `docker pull`, and each contains its sentence that there is no npm or registry release yet

### Requirement: Example output and demo mode
The repository SHALL contain `docs/examples/` with a golden Abacus XML Buchungen file, its protocol text and a filled sample mapping CSV from the KMU hotel template for the Swiss demo "Hotel Beispiel" (property `BSP`, CHF, `Europe/Zurich`, Mandant `7777`), linked from the README and the mapping guide, and `apaleo-abacus export --demo` SHALL run the pipeline on bundled Swiss demo data in CHF with no config, secret or network, marking its output as demo.

#### Scenario: Treuhänder reviews before setup
- **WHEN** a Treuhänder opens `docs/examples/`
- **THEN** they find an `ABACUS_Buchungen_*.xml` file in CHF, its protocol and the mapping that produced it, and a test guarantees the XML file equals the current golden output

#### Scenario: Demo without credentials
- **WHEN** someone runs `apaleo-abacus export --month 2026-09 --demo --dry-run` with no config file and no `APALEO_CLIENT_SECRET`
- **THEN** the summary is printed with a `DEMO` marker, amounts in CHF and the MWST-Codes `311`, `312` and `313`, no network call is made, and the exit code is 0

#### Scenario: Demo file is marked in its name
- **WHEN** someone runs `apaleo-abacus export --month 2026-09 --demo` without `--dry-run`
- **THEN** the file is written below `./demo-output/` as `ABACUS_Buchungen_20260901-20260930_BSP_DEMO.xml`, every `Text1` starts with `DEMO `, and the protocol's first line is `DEMO`, so it never looks like a real export in a file list or in Abacus

#### Scenario: Demo in the Docker image
- **WHEN** someone runs the real demo in the image with `-w /data` and a data folder owned by uid 1000, as docs/docker.md shows
- **THEN** the files appear in that folder under `demo-output/`, and CI runs exactly that; without a writable working directory the run fails with `E-EXPORT` and a hint naming `-w /data`

### Requirement: Honest scope and comparison
The README SHALL include a `## Was es nicht macht` section (no upload into Abacus and no AbaConnect web service, no Debitorenbuchhaltung (DEBI) and no customer master data, no PDF documents, no postings of payment-provider fees, chargebacks or booking-portal commissions, no Saldosteuersatz- or Pauschalsteuersatzmethode, only the property currency without conversion, no Weboberfläche, no gehosteter Dienst, no other target formats such as DATEV or BMD) and a `## Vergleich mit kostenpflichtigen Connectoren` section that names no vendor, gives the price as "24-48 EUR pro Monat (je nach Variante und Anzahl der Betriebe), laut apaleo Store, Oktober 2026", and states the trade-offs of self-hosting ("Selbst betreiben heisst"). It SHALL state in one sentence that the tool is built on apaleo-bmd-export and apaleo-datev-export and link both projects for BMD and DATEV users.

#### Scenario: Comparison table
- **WHEN** a reader looks at the comparison
- **THEN** it shows Preis, Betrieb, Einrichtung, Zustellung der Dateien, Direktimport in Abacus, Debitoren-Schnittstelle, Support and Vorlagen für die Zuordnung for both options, contains no vendor or product name of a competitor, and `test/readme.test.ts` finds the price sentence with "Oktober 2026"

### Requirement: Docs folder
The repository SHALL contain, in Swiss Standard German, `docs/setup-apaleo.md` (custom app creation with the exact permissions, the optional one marked `optional`), `docs/mapping-guide.md` (columns, resolution order, MWST-Codes, VAT guard, Kurtaxe as a durchlaufender Posten without MWST-Code or with a Ziffer-910 code and never the Ziffer-900 code `490`, Anzahlungen, Abrechnungsart with the period-end correction of the Hilfskonto under `vereinnahmt`, Debitorenverlust, Annullationen, payments, carrying over the account export of a paid connector with `--accounts-from` without naming its vendor, and a last section `## Checkliste zur Freigabe durch den Treuhänder` that requires, for every mapped account with an MWST-Code, the same default MWST-Code in F21 and an MWST-pflichtiges account, and for every untaxed account no default MWST-Code), `docs/abacus-import.md` (how the Treuhänder imports the file in Abacus and what to check after the first import), `docs/abacus-format.md` (fields, rules and sources), `docs/configuration.md`, `docs/docker.md`, `docs/troubleshooting.md`, `docs/architecture.md`, `docs/maintainers.md` (`## Vor der Veröffentlichung` checklist, `## Testimporte` record and `## Später geplant` backlog with items inside this product only, no other target formats), `docs/posting-rules.md`, `docs/export.md`, `docs/apaleo-source.md` and `docs/examples/README.md`. Every German doc SHALL write rates in the Swiss notation with a decimal comma and a space before the percent sign (`8,1 %`, as the ESTV writes them; the English specs keep `8.1 %`), except in code spans, code fences and CSV or config values. The mapping guide SHALL explain that MWST rates depend on the service date (3.8 % for Beherbergung including breakfast, MWSTG Art. 25 Abs. 4; 8.1 % for meals, drinks, minibar and services with a surcharge such as parking or wellness; 2.6 % for take-away food without alcohol; 7.7 %, 3.7 % and 2.5 % until 2023-12-31, written `7,7 %`, `3,7 %` and `2,5 %`), SHALL say that the Saldosteuersatzmethode is not supported in version 1, and SHALL list every template row marked `Vorschlag (ungeprüft)`. No `docs/bmd-*.md` or `docs/datev-*.md` file SHALL exist.

#### Scenario: Treuhänder review
- **WHEN** a Treuhänder reads the mapping guide and a mapping CSV
- **THEN** they can decide each row without running the tool, and the guide ends with the sign-off checklist, which asks for each mapped VAT account (for example `2030 -> 313`, `2031 -> 311`, `3805 -> 313`) whether F21 carries the same default MWST-Code

#### Scenario: Contributor adds a source
- **WHEN** a contributor wants to add a Smoobu source
- **THEN** `docs/architecture.md` explains in Swiss Standard German the SourceAdapter contract, the canonical ledger line (`LedgerLine`) and where tests and fixtures go

#### Scenario: Former file names
- **WHEN** someone looks for `docs/setup-apaleo.de.md`, `docs/mapping-guide.de.md`, `docs/bmd-import.md` or `docs/bmd-format.md`
- **THEN** none exists, and the README and every doc link `docs/setup-apaleo.md`, `docs/mapping-guide.md`, `docs/abacus-import.md` and `docs/abacus-format.md`

#### Scenario: Contributor adds a target
- **WHEN** a contributor wants to add a writer for another target format
- **THEN** `docs/architecture.md` explains in Swiss Standard German the `TargetWriter` boundary (including `currency` and `movements`), the `AbacusBooking` example and where golden files go, without announcing any other target as planned

#### Scenario: First import in Abacus
- **WHEN** a Treuhänder imports the first file
- **THEN** `docs/abacus-import.md` names the programs (F11 Buchen, F5534 "Import/Export Buchungen AbaConnect" with import type "XML Buchungen"), the licence the Mandant needs (FIBU with Buchungsschnittstellen, as far as documented), the option "MWST berechnen" and that with it Abacus may take the default MWST-Code of each account in F21 instead of the file's code, the Mandant and the Geschäftsbereich per property in a shared Mandant, where the imported bookings land (Nebenjournal) and how to undo them, a checklist to compare with the protocol (Saldenliste, MWST-Journal per MWST-Code and Ziffer 303/313/343, every "account -> MWST-Code" pair of the import block against the default MWST-Code of that account in F21, for example `3400 -> 313`, `2030 -> 313`, `2031 -> 311`, `3805 -> 313`, with every such account MWST-pflichtig, Anzahlungen, Debitorenverlust as Entgeltsminderung, Kurtaxe and 0 % revenue accounts without default MWST-Code, Belegnummern), and the open questions of research §9 as a checklist for the first test import (licence and program, interface version, `TaxType`, tax sign, `Amount` `0.00` with the tax in `KeyAmount`, `TaxAccount` in both blocks, `TaxIncluded` on rate-0 codes, whether "MWST berechnen" keeps the file's MWST-Code, Belegnummern, Nebenjournal, and `vereinnahmt` with the Hilfskonto)

### Requirement: Docs consistency test
The test suite SHALL check `README.md`, `README.en.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `DISCLAIMER.md`, `CHANGELOG.md`, every Markdown file in `docs/` and `examples/demo/README.md`. It SHALL fail when one of them contains, inside an `sh` or `bash` code fence, an `apaleo-abacus` command line whose command is not registered or whose flag is not in that command's options, or an `apaleo-bmd` or `apaleo-datev` command line at all; when it contains a backticked token matching `^(apaleo|abacus|output|posting|properties|schedule|checks)(\.[A-Za-z\[\]]+)+$` that is not a config schema path; when a finding code (`[EWN]-[A-Z-]+`) used in the source is missing from `docs/troubleshooting.md` or a documented code no longer exists in the source; when a relative link outside code fences points to a missing file or to an anchor that is not a heading slug of its target (GitHub slug rules, umlauts kept); when a `*.de.md` file exists outside `node_modules/`, `dist/` and `openspec/`; when the prose of a German file is not predominantly German; when a German file other than `CODE_OF_CONDUCT.md` addresses the reader with "Sie"; when a German file contains the letter `ß`; when the prose of a German file writes a rate with a decimal point or without the space before `%` instead of the Swiss notation `8,1 %` (code spans and fences excepted); or when a German file uses a term from German DATEV practice (`Buchungsstapel`, `BU-Schlüssel`, `SKR03`, `SKR04`, `Automatikkonto`, `Beherbergungssteuer`, `Übernachtungssteuer`, `Beraternummer`, `EXTF`, `Belegfeld`, `Festschreibung`, `UStVA`, `ELSTER`, `19 %` or `7 %`) or from Austrian BMD practice (`Kanzlei`, `Steuercode`, `Buchungssymbol`, `Einheitskontenrahmen`, `EKR`, `UVA`, `Ortstaxe`, `Nächtigungsabgabe`, `Personenkonto`, `10 %`, `13 %` or `20 %`), or the tokens `DATEV` or `BMD` (terms and tokens matched as whole words, and a rate term only as a rate token not preceded by a digit, `.` or `,`, for example `(?<![\d.,])7 ?%`, so `110 %`, `7,7 %`, `7.7 %` or `BMDX` do not count), except in a README line that links an origin project (the origin sentence and the answer of the FAQ topic on BMD and DATEV), the README `## Was es nicht macht` item about other target formats, `CHANGELOG.md`, and the `docs/troubleshooting.md` entries of the findings that detect a copied German or Austrian setup (the BMD- and DATEV-mapping errors, the rejected `bmd` and `datev` config sections and `W-VAT-RATE-UNUSUAL`). These checks SHALL apply to every German file; the list of Swiss files (`SWISS_FILES`) that a01 to a07 extended SHALL be replaced by that rule.

#### Scenario: Renamed command
- **WHEN** a command is renamed in code but not in the README
- **THEN** `pnpm test` fails and names the stale mention and the file

#### Scenario: Old binary in a doc
- **WHEN** `docs/export.md` shows ```` ```sh ```` `apaleo-bmd export --month 2026-10`
- **THEN** `pnpm test` fails naming `apaleo-bmd` and the file, and passes once the line reads `apaleo-abacus export --month 2026-10`

#### Scenario: Stale flag
- **WHEN** `docs/abacus-import.md` shows ```` ```sh ```` `apaleo-abacus export --month 2026-10 --email` and `export` has no `--email` option
- **THEN** `pnpm test` fails naming `--email`, the command and the file

#### Scenario: Stale config key
- **WHEN** `docs/configuration.md` mentions `` `abacus.beraternummer` `` and the schema has no such key
- **THEN** `pnpm test` fails naming `abacus.beraternummer` and the file

#### Scenario: Other backticked text is ignored
- **WHEN** a doc mentions `` `ABACUS_` ``, `` `1090` `` or `` `Revenues` ``
- **THEN** the test does not treat them as config keys or commands

#### Scenario: Broken anchor after translation
- **WHEN** the README links `docs/docker.md#the-demo-in-the-image` and that heading is now `### Die Demo im Image`
- **THEN** `pnpm test` fails naming the README, the link and the missing anchor, and passes once the link is `docs/docker.md#die-demo-im-image`

#### Scenario: Umlaut anchor
- **WHEN** a doc links `../README.md#häufige-fragen` and the README has `## Häufige Fragen`
- **THEN** the link check passes

#### Scenario: English paragraph in a German doc
- **WHEN** `docs/troubleshooting.md` is left in English
- **THEN** `pnpm test` fails naming the file as not German, and `README.en.md` is the only checked file expected to be English

#### Scenario: Sharp s in a Swiss doc
- **WHEN** `docs/docker.md` contains "Schliesse das Terminal" written with "ß"
- **THEN** `pnpm test` fails naming the file and the letter `ß`, and passes once it reads "Schliesse"

#### Scenario: Austrian paragraph copied
- **WHEN** `docs/mapping-guide.md` contains "Die Kanzlei legt das Buchungssymbol an"
- **THEN** `pnpm test` fails naming the file and the terms `Kanzlei` and `Buchungssymbol`

#### Scenario: Copied DATEV paragraph
- **WHEN** `docs/mapping-guide.md` contains "Trag den BU-Schlüssel ein"
- **THEN** `pnpm test` fails naming the file and the term `BU-Schlüssel`

#### Scenario: Foreign rate
- **WHEN** `docs/posting-rules.md` contains "Getränke mit 19 %" or "Beherbergung mit 10 %"
- **THEN** `pnpm test` fails naming the file and the term `19 %` or `10 %`

#### Scenario: Old Swiss rates pass
- **WHEN** `docs/mapping-guide.md` contains "7,7 %, 3,7 % und 2,5 % bis 31.12.2023"
- **THEN** the term check reports neither `7 %` nor anything else for that sentence, while "Getränke mit 7 %" in the same file is reported as `7 %`

#### Scenario: Decimal point in a German rate
- **WHEN** `docs/posting-rules.md` contains "Beherbergung zu 7.7 %" or "Beherbergung zu 3,8%"
- **THEN** `pnpm test` fails naming the file and the rate, does not report the term `7 %`, and passes once it reads "7,7 %" or "3,8 %", while `` `3.8` `` in a code span passes

#### Scenario: German levy or rate
- **WHEN** `docs/posting-rules.md` contains "Die Beherbergungssteuer wird ohne Steuer gebucht" or "Getränke mit 19 %"
- **THEN** `pnpm test` fails naming the file and the term `Beherbergungssteuer` or `19 %`

#### Scenario: Old Swiss rates are not foreign rates
- **WHEN** a German doc contains "7,7 %, 3,7 % und 2,5 % bis 31.12.2023" or "Normalsatz 7.7 %"
- **THEN** the term check does not report `7 %`, while "Getränke mit 7 %" in the same file is reported

#### Scenario: Swiss file checked from the start
- **WHEN** `docs/abacus-format.md` or `docs/export.md` contains "Die Kanzlei legt das Buchungssymbol an" or "Schliesse" written with "ß"
- **THEN** `pnpm test` fails naming the file and `Kanzlei`, `Buchungssymbol` or the letter `ß`, because the checks apply to every German file and no longer to a list of Swiss files

#### Scenario: Swiss rate notation
- **WHEN** `docs/abacus-format.md` contains "Beherbergung zu 3.8 %" or "Beherbergung zu 3,8%"
- **THEN** `pnpm test` fails naming the file and the rate, and passes once it reads "Beherbergung zu 3,8 %", while `` `3.8` `` in a code span passes

#### Scenario: Bare DATEV mention
- **WHEN** `docs/abacus-import.md` contains "wie beim DATEV-Import"
- **THEN** `pnpm test` fails naming the file and the token `DATEV`

#### Scenario: Allowed DATEV mention
- **WHEN** the README origin sentence links apaleo-bmd-export and apaleo-datev-export for BMD and DATEV users and the `## Was es nicht macht` list says "keine anderen Zielformate wie DATEV oder BMD"
- **THEN** the term check passes for the README

#### Scenario: Swiss terms are allowed
- **WHEN** `docs/abacus-format.md` contains "Kurtaxe" and "Mandantennummer"
- **THEN** the term check passes, because both are the terms Swiss Treuhänder and Abacus use

#### Scenario: Bare target mention
- **WHEN** `docs/abacus-import.md` contains "wie beim BMD-Import" or "wie beim DATEV-Import"
- **THEN** `pnpm test` fails naming the file and the token `BMD` or `DATEV`

#### Scenario: Allowed origin mention
- **WHEN** the README origin sentence links apaleo-bmd-export and apaleo-datev-export and the `## Was es nicht macht` list says "keine anderen Zielformate wie DATEV oder BMD"
- **THEN** the term check passes for the README

#### Scenario: FAQ answer on BMD and DATEV
- **WHEN** the README `## Häufige Fragen` answers "Gibt es das auch für BMD oder DATEV?" in a line that links apaleo-bmd-export and apaleo-datev-export
- **THEN** the term check passes for that line, while an FAQ line "**DATEV?** Nein." without a link to an origin project is reported

### Requirement: German-first documentation
The README and every user-facing document SHALL be written in Swiss Standard German (Schweizer Hochdeutsch) only: `README.md`, every Markdown file in `docs/` (including `docs/examples/README.md`), `examples/demo/README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `DISCLAIMER.md`, `CHANGELOG.md`, the issue forms and the pull-request template in `.github/`, and the comments in `apaleo-abacus.config.example.yaml`, `.env.example` and `docker-compose.example.yml`. The text SHALL use "ss" instead of "ß", SHALL address the reader with "du", SHALL use German words where a common one exists, and SHALL use Abacus and Swiss accounting terms as practitioners do (Treuhänder, Buchhaltung, Mandant, Kontenplan, KMU-Kontenrahmen, Sachkonto, Gegenkonto, MWST, MWST-Code, MWST-Abrechnung, Ziffer, vereinbart, vereinnahmt, Kurtaxe, Beherbergungsabgabe, Anzahlung, Belegnummer, Kostenstelle, Geschäftsbereich, Rappen). Source code, identifiers, CLI output, commit messages, `LICENSE`, `src/**/README.md`, `openspec/research/` and the OpenSpec specs SHALL stay English, and commands, flags, config keys, finding codes and quoted CLI output SHALL appear unchanged. No topic SHALL be documented in two languages, except `README.en.md` and the non-binding English translation in `DISCLAIMER.md`; there SHALL be no `*.de.md` files.

#### Scenario: Hotel reads a guide
- **WHEN** a hotel back office opens any file in `docs/`
- **THEN** the text is Swiss Standard German without "ß", uses "du", and every command and config key in it is the one the CLI accepts

#### Scenario: Guide in two languages is rejected
- **WHEN** someone adds `docs/docker.de.md` or an English section to a German doc
- **THEN** `pnpm test` fails, naming the `.de.md` file or the file whose prose is not German

#### Scenario: Polite address is rejected
- **WHEN** a German doc contains "Prüfen Sie die Datei" or "Ihr Treuhänder"
- **THEN** `pnpm test` fails naming the file, while "Sie prüft die Datei" at the start of a sentence passes

#### Scenario: Code stays English
- **WHEN** the Swiss docs are merged
- **THEN** no file under `src/` changed, the example config files changed only in comments, and the CLI prints the same output as before

### Requirement: Short English README
The repository SHALL contain `README.en.md` of at most 80 lines with: what the tool is (apaleo to Abacus Finanzbuchhaltung, AbaConnect XML Buchungen, for Swiss hotels), the disclaimer linking `DISCLAIMER.md`, a quick start with the same install commands as the German README and the sentence "There is no npm package or container image release yet. You install from source.", a list of the German guides, a contributing note that English issues and pull requests are welcome, and the licence linking `LICENSE`. It SHALL NOT contain the `<!-- quickstart -->` marker.

#### Scenario: International contributor
- **WHEN** an English-speaking developer opens the repository and follows the "English" link at the top of the README
- **THEN** `README.en.md` tells them what the tool does, how to install it from source, that the docs are in German, and how to contribute

#### Scenario: English README stays short and in step
- **WHEN** `pnpm test` runs
- **THEN** it fails if `README.en.md` exceeds 80 lines, contains the quickstart marker, or lists install commands that differ from the German quick-start block apart from shell comments

### Requirement: No unverified compatibility claim
README and docs SHALL describe the file as following the documented AbaConnect interface "XML Buchungen" and SHALL say that a first test import with a Treuhänder is pending, and SHALL NOT claim that the file was tested with or is accepted by Abacus ("getestet mit Abacus", "kompatibel mit Abacus", "Abacus-zertifiziert") until `docs/maintainers.md` records a test import under `## Testimporte` with date, Abacus release, interface version, import program and result.

#### Scenario: Claim without a recorded import
- **WHEN** the README says "getestet mit Abacus" and `## Testimporte` in `docs/maintainers.md` lists no import
- **THEN** `pnpm test` fails naming the README and the phrase

#### Scenario: Pending test import
- **WHEN** a Treuhänder reads the README first screen before any test import
- **THEN** it says "Die Datei folgt der dokumentierten AbaConnect-Schnittstelle «XML Buchungen»; ein erster Testimport mit einem Treuhänder steht noch aus."

### Requirement: README FAQ
The README SHALL contain a `## Häufige Fragen` section with one short answer per topic: Kosten, Daten (what leaves the hotel, nothing hosted), Lizenz ("Welche Abacus-Lizenz braucht mein Treuhänder?", answered in one line: Abacus Finanzbuchhaltung mit Buchungsschnittstellen (F11/F5534), keine Partnerschaft, kein Webservice, noch durch den ersten Testimport zu bestätigen, linking `docs/abacus-import.md`), Direktimport, Testimport, rückgängig, mehrere Hotels, wechseln (from a paid connector, linking the mapping guide section on `--accounts-from`), Saldosteuersatz, and BMD und DATEV (answered in a line that links apaleo-bmd-export and apaleo-datev-export). No answer SHALL name a vendor of a paid connector.

#### Scenario: Treuhänder asks about the licence
- **WHEN** a Treuhänder reads the FAQ
- **THEN** the topic Lizenz names the Abacus Finanzbuchhaltung with Buchungsschnittstellen (F11/F5534), says that no partnership and no web service is needed and that the first test import still has to confirm it, and links `docs/abacus-import.md`

#### Scenario: FAQ topics tested
- **WHEN** `pnpm test` runs
- **THEN** `test/readme.test.ts` finds every topic of this requirement under `## Häufige Fragen`, and the docs test accepts the BMD und DATEV answer because it links the origin projects

