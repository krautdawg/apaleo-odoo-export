## ADDED Requirements

### Requirement: Command lines and config keys of apaleo-odoo in the docs
The docs consistency test SHALL read the command lines of `apaleo-odoo` inside `sh` and `bash` code fences of every checked file and SHALL fail on a command that is not registered, a flag that is not in that command's options, and on any `apaleo-abacus`, `apaleo-bmd` or `apaleo-datev` command line at all. The backticked config-key pattern SHALL include the prefix `odoo` next to `apaleo`, `abacus`, `output`, `posting`, `properties`, `schedule` and `checks`. Clone URL, `cd` line and CI badges in `README.md` and `README.en.md` SHALL point to `krautdawg/apaleo-odoo-export`.

#### Scenario: Old binary in a doc
- **WHEN** `docs/export.md` shows ```` ```sh ```` `apaleo-abacus export --month 2026-10`
- **THEN** `pnpm test` fails naming `apaleo-abacus` and the file, and passes once the line reads `apaleo-odoo export --month 2026-10`

#### Scenario: Stale Odoo config key
- **WHEN** a doc mentions `` `odoo.beraternummer` `` and the schema has no such key
- **THEN** `pnpm test` fails naming `odoo.beraternummer` and the file

### Requirement: German (Germany) files during the transition
`test/helpers/docs.ts` SHALL keep a list `GERMANY_FILES` of the docs written in German as used in Germany, starting with `docs/odoo-format.md` and `docs/odoo-import.md` (a listed file that does not exist yet is skipped), and every slice that rewrites a doc for Germany SHALL add it. For a listed file the docs test SHALL allow the letter "ß", German accounting terms (`SKR03`, `SKR04`, `UStVA`, `Kennzahl`, `Kanzlei`, `Beherbergungsteuer`, `Übernachtungsteuer`) and the rates `7 %` and `19 %`, and SHALL fail on the Swiss quotation marks `«` and `»`, on Swiss practice terms (`Treuhänder`, `MWST`, `MWST-Code`, `MWST-Abrechnung`, `Rappen`, `KMU-Kontenrahmen`, `Mandantennummer`) and on Austrian practice terms (`Steuercode`, `Buchungssymbol`, `Einheitskontenrahmen`, `EKR`, `UVA`, `Ortstaxe`, `Nächtigungsabgabe`), matched as whole words. Every other German file SHALL keep the Swiss checks of the requirement "Docs consistency test" ("ß" forbidden, Swiss rate notation), except that German DATEV-practice terms and the rate tokens `7 %` and `19 %` SHALL no longer be reported in any file. Slice o08 SHALL replace this transition by one rule for every German file.

#### Scenario: Sharp s in an Odoo doc
- **WHEN** `docs/odoo-format.md` contains "Die Datei enthält die Buchungssätze eines Monats, gemäß der Kontenzuordnung"
- **THEN** the docs test passes for that line

#### Scenario: Swiss term in an Odoo doc
- **WHEN** `docs/odoo-import.md` contains "Dein Treuhänder importiert die Datei" or "«Buchungssätze»"
- **THEN** `pnpm test` fails naming the file and `Treuhänder` or the quotation mark `«`

#### Scenario: Swiss doc keeps its checks
- **WHEN** `docs/docker.md` (not yet in `GERMANY_FILES`) contains "Schließe das Terminal"
- **THEN** `pnpm test` fails naming the file and the letter `ß`

#### Scenario: German rate no longer forbidden
- **WHEN** `docs/mapping-guide.md` contains "Getränke mit 19 %" or "SKR03"
- **THEN** the term check passes for that line
