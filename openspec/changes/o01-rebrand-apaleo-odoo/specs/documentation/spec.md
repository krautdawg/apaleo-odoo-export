## ADDED Requirements

### Requirement: Command lines and config keys of apaleo-odoo in the docs
The docs consistency test SHALL read the command lines of `apaleo-odoo` inside `sh` and `bash` code fences of every checked file and SHALL fail on a command that is not registered, a flag that is not in that command's options, and on any `apaleo-abacus`, `apaleo-bmd` or `apaleo-datev` command line at all. The backticked config-key pattern SHALL include the prefix `odoo` next to `apaleo`, `abacus`, `output`, `posting`, `properties`, `schedule` and `checks`. Clone URL, `cd` line and CI badges in `README.md` and `README.en.md` SHALL point to `krautdawg/apaleo-odoo-export`.

#### Scenario: Old binary in a doc
- **WHEN** `docs/export.md` shows ```` ```sh ```` `apaleo-abacus export --month 2026-10`
- **THEN** `pnpm test` fails naming `apaleo-abacus` and the file, and passes once the line reads `apaleo-odoo export --month 2026-10`

#### Scenario: Stale Odoo config key
- **WHEN** a doc mentions `` `odoo.beraternummer` `` and the schema has no such key
- **THEN** `pnpm test` fails naming `odoo.beraternummer` and the file

### Requirement: Spelling rules during the transition
From this slice until o08 the docs test SHALL NOT report, in any file, the letter "ß", the Swiss rate notation, German accounting terms (`SKR03`, `SKR04`, `UStVA`, `Kennzahl`, `Kanzlei`, `Beherbergungsteuer`, `Übernachtungsteuer`) or the rate tokens `7 %` and `19 %`, and `test/helpers/docs.ts` SHALL keep no per-file list of German (Germany) files, so that every slice writes the docs it touches once, in final German as used in Germany. The checks for Swiss practice terms (`Treuhänder`, `MWST`, `MWST-Code`, `MWST-Abrechnung`, `Rappen`, `KMU-Kontenrahmen`, `Mandantennummer`), Austrian practice terms (`Steuercode`, `Buchungssymbol`, `Einheitskontenrahmen`, `EKR`, `UVA`, `Ortstaxe`, `Nächtigungsabgabe`) and the Swiss quotation marks `«` and `»` SHALL be introduced by slice o08 for every German file at once (requirement "Docs consistency test"), because the not yet rewritten Abacus-era docs still contain them; until then every slice SHALL grep the files it writes or rewrites for these terms and marks in its release check. All other checks of the requirement "Docs consistency test" SHALL keep applying to every file.

#### Scenario: Sharp s in any doc
- **WHEN** `docs/configuration.md` contains "Die Datei enthält die Buchungssätze eines Monats, gemäß der Kontenzuordnung"
- **THEN** the docs test passes for that line

#### Scenario: German rate no longer forbidden
- **WHEN** `docs/mapping-guide.md` contains "Getränke mit 19 %" or "SKR03"
- **THEN** the term check passes for that line

#### Scenario: No transition list
- **WHEN** a slice adds the new file `docs/odoo-format.md`
- **THEN** the docs test checks it with the same rules as every other doc, and no list in `test/helpers/docs.ts` has to name it
