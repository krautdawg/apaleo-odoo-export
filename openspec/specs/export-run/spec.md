# export-run Specification

## Purpose
The `export` command that turns one period of a property's apaleo ledger into DATEV Buchungsstapel files: period parsing and the split per month and fiscal year, the date rules that stand in for the night-audit status, the blocking coverage, posting and plausibility checks, the dry run, the output folder with protocol and manifest, and idempotent re-runs.
## Requirements
### Requirement: Export command
The CLI SHALL provide `apaleo-odoo export` taking either `--from <date> --to <date>` (inclusive business dates) or `--month <YYYY-MM>`, an optional `--property <id>` (default: every configured property), and the flags `--dry-run` and `--overwrite`. It SHALL exit with code 0 when every property and month succeeded and 1 when any failed.

#### Scenario: Monthly export
- **WHEN** the user runs `apaleo-odoo export --month 2026-10 --property BSP` with a complete mapping
- **THEN** one file of the configured target for 2026-10-01 to 2026-10-31 is written for BSP and the exit code is 0

#### Scenario: Missing period
- **WHEN** the user runs `apaleo-odoo export` without a period
- **THEN** the CLI exits with code 2 and explains `--month` and `--from/--to`

### Requirement: Period rules
The export SHALL split a period at calendar-month boundaries into one file per property and month, SHALL refuse a period that contains today or a later date in the property's time zone with `E-DAY-NOT-CLOSED`, and SHALL warn with `W-RECENT-DAY` when the period ends yesterday.

#### Scenario: Range across two months
- **WHEN** the user exports 2026-09-25 to 2026-10-05
- **THEN** two files are produced, 2026-09-25 to 2026-09-30 and 2026-10-01 to 2026-10-05

#### Scenario: Fiscal year not starting in January
- **WHEN** `datev.wjBeginn` is `07-01` and the user exports `--month 2027-03`
- **THEN** the header's WJ-Beginn is `20260701` and the file is written

#### Scenario: Today included
- **WHEN** the period ends on today's date in the property time zone, with today taken from the injected clock `ctx.now()`
- **THEN** no file is written and the error says the day is not closed by the night audit yet

### Requirement: Blocking checks before writing
For each property and month the export SHALL run the mapping coverage check, the posting rules and the plausibility checks before writing, and SHALL NOT write a file when any error finding exists. Errors SHALL be printed with code, explanation and the fix, and other property-months SHALL still be processed.

#### Scenario: Unmapped account blocks only its property
- **WHEN** property BSP has an unmapped booked account and property BSP2 is fully mapped
- **THEN** no file is written for BSP, the file for BSP2 is written, `E-UNMAPPED` is printed for BSP, and the exit code is 1

### Requirement: Plausibility checks
The export SHALL verify that the absolute gross of all ledger lines equals the sum over booked and skipped lines; that per business day the signed movement of each mapped target account in the bookings, as the target's movement model gives it (Odoo: the non-VAT side by the gross amount and the VAT side by the gross amount minus apaleo's rounded tax, each signed by its side; the tax lines Odoo creates are not part of this check), equals the signed apaleo movement of the booked lines mapped to it; and that per rate the tax amounts in the bookings equal the sum of apaleo's per-line tax rounded to cents of the booked lines of that rate, apart from tax amounts of deposit releases computed from a chart rate (`W-VAT-INFERRED`); violations SHALL be errors. The `E-VAT-TOTAL` message SHALL also name apaleo's precise VAT total of the rate and the line-rounding difference; the difference between the tax per booking and apaleo's precise total SHALL never be an error by itself. The rendered file SHALL additionally pass the writer's checks of the fitted entries (`E-ODOO-UNBALANCED`, `E-ODOO-GROSS`, `E-ODOO-VAT-FIT`). When `checks.aggregates` is true (default false), it SHALL call apaleo's daily aggregates once per business day and compare each listed account's balance (debit minus credit) with the signed sum of that day's ledger lines: a side on a global chart account counts for that account, any other side for its main account; Revenues and Liabilities sides count with their precise net amount, all other types with their gross amount; each tax of a line with a Revenues side counts for the chart's `Vat` account of that VAT type and rate, and of a line with a Liabilities side for the `VatOnLiabilities` account, signed like that side; both balances are rounded to cents only for the comparison. A difference SHALL be reported as a warning. The aggregate comparison SHALL depend only on the ledger lines and the chart, never on the bookings of a target.

#### Scenario: Tax total per rate
- **WHEN** a defect makes the bookings at 19 % carry 4.00 apaleo tax in total while apaleo's per-line taxes at 19 %, rounded to cents, total 4.02
- **THEN** error `E-VAT-TOTAL` is reported for 19 % with both amounts and apaleo's precise total, and no file is written

#### Scenario: Line rounding is not an error
- **WHEN** the recorded VIE day 2026-10-21 is exported with the VIE Odoo mapping, where the bookings carry 7.74 tax at 10 % and apaleo's precise total is 7.74545454
- **THEN** no `E-VAT-TOTAL` is raised, and the protocol shows both amounts and the difference 0.01

#### Scenario: Roundings at another rate
- **WHEN** the posting run reported two `W-VAT-ROUNDING` differences of computed deposit tax at 7 % and the bookings at 19 % carry two cents more tax than apaleo charged
- **THEN** error `E-VAT-TOTAL` is reported for 19 % and no file is written

#### Scenario: Side bug is caught
- **WHEN** a defect writes a booking with debit and credit account swapped
- **THEN** error `E-ACCOUNT-BALANCE` names the day, the Odoo account and both signed amounts, and no file is written

#### Scenario: Fitting bug is caught
- **WHEN** a defect in the fitting leaves an entry 0.01 out of balance after the modelled Odoo tax
- **THEN** `E-ODOO-UNBALANCED` names the day and the difference, and no file is written

#### Scenario: Aggregate check off by default
- **WHEN** `checks.aggregates` is not set
- **THEN** no aggregate request is sent and the custom app does not need `core.subledger_aggregate.create`

#### Scenario: Aggregate difference
- **WHEN** `checks.aggregates` is true and apaleo's daily balance for an account differs from the ledger lines of that day
- **THEN** warning `W-AGGREGATE-DIFF` names the day, the account, both balances and the basis (gross, net or tax), and the file is still written

#### Scenario: Normal real day has no aggregate warning
- **WHEN** `checks.aggregates` is true and the recorded BER responses of 2026-10-21 are exported with the BER Odoo mapping
- **THEN** all 18 listed accounts match and no `W-AGGREGATE-DIFF` is raised

#### Scenario: Conservation violated
- **WHEN** a defect causes a ledger line to be neither booked nor listed as skipped
- **THEN** error `E-CONSERVATION` is raised and no file is written

### Requirement: Dry run
With `--dry-run` the export SHALL run every step except writing, SHALL print the posting summary (first per Odoo tax and rate: the Kennzahl from the target (19 % Kz 81, 7 % Kz 86), net, Odoo's modelled VAT, apaleo's VAT rounded per line and precise, and the difference, with one sentence explaining that Odoo computes the VAT from the base and that the file fits the base to apaleo's gross, and the days with a difference; then deposit tax per rate the same way; totals per Odoo account; Kurtaxe and other levies per account, with or without tax; payments per clearing account; deposits received, released and refunded; accounts receivable; write-offs per rate; the number of entries, lines and rounding lines; skipped lines with unsigned totals; findings) and the import block of the protocol, and SHALL exit with code 1 if any error finding exists. The protocol file SHALL contain the same summary.

#### Scenario: Review before the first file
- **WHEN** the user runs `apaleo-odoo export --month 2026-09 --property BSP --dry-run`
- **THEN** the summary and the import block are printed and no file or folder is created

#### Scenario: German rates with their Kennzahl
- **WHEN** the German fixture month is exported with `--dry-run`
- **THEN** the summary shows the revenue lines for `tax_ust_7_skr03` 7 % with Kz 86 and `tax_ust_19_skr03` 19 % with Kz 81, each with net, Odoo VAT, apaleo VAT and difference

#### Scenario: VAT difference per tax rounding
- **WHEN** the German fixture month is exported with `--dry-run` and `odoo.taxRounding: per_tax`
- **THEN** the summary shows, for every rate with a difference, the month's Odoo VAT, apaleo VAT, the difference and the days on which it arose, and the explaining sentence

### Requirement: Output layout and manifest
The export SHALL write each file to `<output.dir>/<propertyId>/<YYYY-MM>/` with the deterministic name `ODOO_Buchungen_<from>-<to>_<propertyId>.csv`, SHALL write a protocol text file `<name>.protokoll.txt` beside it, and SHALL record in `manifest.json` the file name, SHA-256 of the file, number of bookings, entries and lines, the sum of the debit column, Odoo's modelled VAT per tax and rate, the Odoo company id and journal code, the mapping file SHA-256, the tool version and the creation time. The protocol SHALL contain the target's import block (see the `odoo-journal-writer` capability) and, per entry line, the source entry numbers and receipt numbers of the apaleo lines it nets.

#### Scenario: Files after a run
- **WHEN** a monthly export for BSP 2026-09 succeeds
- **THEN** the folder `exports/BSP/2026-09/` contains `ODOO_Buchungen_20260901-20260930_BSP.csv`, its protocol and a manifest entry with the file hash, the number of entries and the VAT per tax and rate

#### Scenario: Protocol names company and journal
- **WHEN** the September file is written for `odoo.companyId` 1 and journal `APA`
- **THEN** the protocol's import block names company 1 and journal `APA`, and the manifest entry records both

#### Scenario: Protocol names the Mandant
- **WHEN** the September file is written by the default target for a config whose `abacus` section names Mandant `1234`
- **THEN** the protocol's import block names the Odoo company and journal and no Mandant, because only the Abacus writer reads the `abacus` section

### Requirement: Idempotent re-runs
Every file SHALL be rendered for a revision: 1 for the first file of a period, and on `--overwrite` one more than the revision of the file it replaces, taken from that file's manifest entry or, without one, from the target writer's `revisionOf()` of the file on disk; the manifest SHALL record the revision of every file. Re-running an export for a period whose file exists SHALL render with the existing file's revision and SHALL do nothing when the new file is byte-identical to the existing one, SHALL refuse with `E-FILE-EXISTS` when any byte differs, and with `--overwrite` SHALL keep the old file under a `.replaced-<timestamp>.csv` name, write the new one with the next revision and record both in the manifest. The comparison SHALL read the existing file, so it works without the manifest. When the file is unchanged but its protocol or current manifest entry is missing or describes another file (a run interrupted between writing the file and its companions), the run SHALL rewrite them and report `N-COMPANIONS-REPAIRED`. Writing SHALL hold an exclusive lock file in the property-month folder and SHALL re-check the file on disk under that lock, so two concurrent runs never both write or replace the same file; the run that finds the lock or a changed file SHALL fail that property-month with `E-EXPORT` and write nothing. An export whose period overlaps another Odoo file in the same folder SHALL be refused with `E-PERIOD-OVERLAP`, because both files contain entries for the shared days and importing both would overwrite reviewed drafts with the other file's content or book those days twice.

#### Scenario: Unchanged re-run
- **WHEN** the same month is exported twice with unchanged apaleo data and mapping
- **THEN** the second run reports `unchanged`, rewrites nothing and exits 0

#### Scenario: Late posting changed the month
- **WHEN** a late posting changed the month after it was exported
- **THEN** the second run refuses with `E-FILE-EXISTS`, suggests `--overwrite`, and explains that the new file will be revision 2 with new External IDs, and that before importing it the draft entries with the reference `apaleo BSP` of that period must be deleted in Odoo and the posted ones reversed, because an import cannot change a posted entry and a reversal keeps its External ID

#### Scenario: Overwrite writes the next revision
- **WHEN** the month exists as revision 1 and the user runs the export again with `--overwrite` after a late posting
- **THEN** the old file is kept as `.replaced-<timestamp>.csv`, the new file's entries carry `apaleo_c1_BSP_<YYYYMMDD>_r2` and the reference suffix ` (Korrektur 2)`, the manifest records revision 2, and a later run without changes reports `unchanged`

#### Scenario: Revision without the manifest
- **WHEN** the existing file is revision 2, `manifest.json` was deleted, and the user exports again with `--overwrite` after another change
- **THEN** the revision is read from the existing file and the new file is revision 3

#### Scenario: Manifest deleted
- **WHEN** `manifest.json` was deleted and the same month is exported again with unchanged data
- **THEN** the run reports `unchanged` by comparing the existing file, leaves the Odoo file untouched and writes the missing manifest entry again (`N-COMPANIONS-REPAIRED`)

#### Scenario: Config changed the journal
- **WHEN** the month was exported and `odoo.journal` was changed before the same month is exported again with unchanged data
- **THEN** the run refuses with `E-FILE-EXISTS` and keeps the old file, and with `--overwrite` it replaces the file with revision 2, whose entries carry the new journal code

#### Scenario: Config changed the rounding method
- **WHEN** the month was exported with `odoo.taxRounding: per_line` and is exported again with `per_tax`
- **THEN** the run refuses with `E-FILE-EXISTS`, because the fitted bases differ, and with `--overwrite` it replaces the file

#### Scenario: Overlapping period
- **WHEN** the folder holds the file for 2026-09-01 to 2026-09-30 and the user exports 2026-09-20 to 2026-09-30
- **THEN** the export refuses with `E-PERIOD-OVERLAP`, names the existing file, says that both files contain entries for those days, and writes nothing

### Requirement: Target writer boundary
The export pipeline SHALL write files only through a `TargetWriter` that provides the file name for a property and period, the file-name pattern used to find existing and overlapping files of that target, the rendered bytes, the comparison that decides whether an existing file is unchanged, the protocol title, the target's advice in the `E-PERIOD-OVERLAP` and `E-FILE-EXISTS` refusals (the program the file is imported into, its config keys, how an imported file is undone), the currency the target books in for a given config, and the signed account movements of a booking that the plausibility checks compare with apaleo. `src/export/` SHALL NOT import a target module's internals other than its `TargetWriter`, and the output folder logic and the checks SHALL NOT contain a target-specific file pattern, program name, currency, field name or config key. A manifest entry SHALL count as a file of the target only when its name matches the target's file pattern. The default target SHALL be `odooTarget`.

#### Scenario: Odoo is the default target
- **WHEN** `export --month 2026-09 --property BSP` runs on the German fixture month with the SKR03 template mapping
- **THEN** the file `ODOO_Buchungen_20260901-20260930_BSP.csv` is written and no Abacus file appears

#### Scenario: Pattern and comparison come from the writer
- **WHEN** a test runs the export with a fake `TargetWriter` whose files are named `FAKE_<from>-<to>_<propertyId>.txt` and whose comparison ignores nothing
- **THEN** existence, overlap (`E-PERIOD-OVERLAP`), unchanged re-runs and `E-FILE-EXISTS` work for the fake files exactly as for Odoo files, and no Odoo name appears in the output folder

#### Scenario: Refusal advice comes from the writer
- **WHEN** the fake `TargetWriter` refuses a file with `E-PERIOD-OVERLAP` or `E-FILE-EXISTS`
- **THEN** the message carries the fake target's advice and names neither Odoo nor an `odoo.*` config key

#### Scenario: Manifest entry of another target
- **WHEN** `manifest.json` records a current file of the fake target for the period and no file of the default target exists
- **THEN** the lookup for the default target (as used by `schedule --once`) finds no file for that period

#### Scenario: Abacus is the default target
- **WHEN** `export --month 2026-09 --property BSP` runs with a complete Odoo mapping and a config that still has an `abacus` section
- **THEN** Abacus is no longer the default target: the Odoo file is written and no `ABACUS_Buchungen_*.xml` file appears

### Requirement: Regression on recorded live data
The repository SHALL contain recorded real apaleo responses in `test/fixtures/apaleo/live/` (chart of accounts, `export-gross-daily` and `aggregate-daily` of BER and VIE for 2026-10-21 and 2026-10-22, synthetic sandbox data, no folios), scanned for tokens, secrets, e-mail addresses, guest names and addresses on every test run, with a README naming origin, files and scan; committed Odoo live mappings `test/fixtures/apaleo/live/BER/mapping-BER.odoo.csv` (SKR03 template, the Kurtaxe row filled in as a Steuerberater would) and `test/fixtures/apaleo/live/VIE/mapping-VIE.odoo.csv` (hand-made with the l10n_at taxes `account_tax_template_sales_10_code029`, `_13_code006`, `_20_code022`); and tests that run the full pipeline (apaleo adapter on a fake fetch, mapping, posting, plausibility and aggregate checks, the default `TargetWriter`) on them and assert the hand-checked totals.

#### Scenario: BER exports cleanly
- **WHEN** `export --from 2026-10-21 --to 2026-10-21 --property BER` runs on the recorded responses with the committed BER Odoo mapping, `checks.aggregates: true` and the default target
- **THEN** it writes one `ODOO_Buchungen_20261021-20261021_BER.csv` without `E-` findings or `W-AGGREGATE-DIFF`, the writer's validation passes, and the summary has the values of the posting-rules scenario "Summary of the recorded BER day"

#### Scenario: VIE through a hand-made Austrian mapping
- **WHEN** the same export runs for VIE with the committed VIE Odoo mapping
- **THEN** it writes one file whose taxed lines carry the l10n_at External IDs, with 35 apaleo lines, 29 bookings and 6 skipped lines, and no `E-` finding

#### Scenario: BER with the SKR03 template
- **WHEN** the export runs for BER with a mapping that `init-mapping --template skr03-hotel` writes on the BER chart
- **THEN** it raises no parse, sub-cent or Swagger-shape error and stops with `E-UNMAPPED` only for the accounts the template leaves empty (Kurtaxe and any 7 % revenue account no name pattern matches), and no file is written

#### Scenario: Fixture scan
- **WHEN** the scan runs over `test/fixtures/apaleo/live/`
- **THEN** it finds no key or value matching token, secret, bearer, password or e-mail patterns, and every account name is an apaleo default name or of the form `… for Reservation|Folio <id>`

#### Scenario: VIE exports cleanly
- **WHEN** `export --from 2026-10-21 --to 2026-10-21 --property VIE` runs on the recorded responses with the committed VIE Odoo mapping, `checks.aggregates: true` and the default target
- **THEN** it writes one `ODOO_Buchungen_20261021-20261021_VIE.csv` without `E-` findings or `W-AGGREGATE-DIFF`, with 35 apaleo lines, 29 bookings and 6 skipped lines

#### Scenario: BER with the KMU template
- **WHEN** `init-mapping --template kmu-hotel` runs for a property
- **THEN** it fails with the error that the template is unknown and that `--template` must be `skr03-hotel` or `skr04-hotel`, and no mapping file is written

### Requirement: Currency of the target
The export SHALL ask the configured `TargetWriter` for the currency it books in and SHALL refuse with `E-CURRENCY`, per property-month and before writing, a property whose currency differs from it (without reading the ledger) and a month with any ledger line in another currency, naming both currencies and saying that the tool does not convert. The Odoo target SHALL answer with `odoo.currency`.

#### Scenario: Swiss property in a EUR company
- **WHEN** the property's currency is CHF and `odoo.currency` is `EUR`
- **THEN** `E-CURRENCY` names CHF and EUR, says that the Odoo file books in the company currency, the ledger is not read and no file is written for that property

#### Scenario: German property
- **WHEN** the property's currency is EUR, `odoo.currency` is `EUR` and all ledger lines are in EUR
- **THEN** no `E-CURRENCY` is raised and the Odoo file is written

#### Scenario: Swiss company
- **WHEN** the property's currency is CHF, `odoo.currency` is `CHF` and all ledger lines are in CHF
- **THEN** no `E-CURRENCY` is raised and the Odoo file is written

#### Scenario: Line in another currency
- **WHEN** `odoo.currency` is `EUR` and one ledger line of the month is in CHF
- **THEN** `E-CURRENCY` names the number of such lines and both currencies, and no file is written for that property-month

#### Scenario: EUR property in a CHF Mandant
- **WHEN** the property's currency is EUR and `odoo.currency` is `CHF` (a Swiss Odoo company; an `abacus.leitwaehrung` is ignored by the Odoo target)
- **THEN** `E-CURRENCY` names EUR and CHF, says that the Odoo file books in the company currency, the ledger is not read and no file is written for that property

#### Scenario: Swiss property
- **WHEN** the property's currency is CHF, `odoo.currency` is `CHF` and all ledger lines are in CHF
- **THEN** no `E-CURRENCY` is raised, the Odoo file is written and the protocol's import block names the currency CHF

### Requirement: Tax warnings for the rows a month uses
For each property and month, the export and `schedule --once` SHALL report the `mapping check` warnings `W-TAX-UNCHECKED` and `W-TAX-KZ45` for the mapping rows the month's ledger lines resolve to, one finding per warning naming every mapping line it concerns, in the dry run, the CLI output and the protocol, because scheduled runs never call `mapping check`. These warnings SHALL NOT block the file. Where `mapping check` warns `W-TAX-RATE` (one of the six known l10n_de taxes used at another rate than its own), the export SHALL instead raise the error `E-TAX-RATE-WRONG` for the used rows, naming every mapping line, the tax and both rates, and SHALL write no file for that property-month, because Odoo computes the tax at its own rate while the writer fits the base for the row's rate, so the VAT would be wrong and Odoo would add an "Automatic Balancing Line". Rows the month does not use SHALL NOT be reported.

#### Scenario: Swapped tax on a used row
- **WHEN** the 7 % lodging row maps to `8300` with `tax_ust_19_skr03` at 7 and a month books lodging at 7 %
- **THEN** `E-TAX-RATE-WRONG` names the mapping line, the tax and both rates in the output, and no file is written (`mapping check` still warns `W-TAX-RATE` for the row)

#### Scenario: Unused row with a custom tax
- **WHEN** a row with a custom tax is not reached by any line of the month
- **THEN** the export names no `W-TAX-UNCHECKED` for that row (`mapping check` still does)

### Requirement: One rate per Odoo tax
Before writing, the export SHALL refuse with `E-TAX-RATES` a property-month whose bookings use one Odoo tax with more than one rate, naming the tax, the rates and the mapping rows, because an Odoo tax has one rate and Odoo would compute the other bookings with it.

#### Scenario: Tax used at two rates
- **WHEN** one mapping row maps 7 % revenue and another maps 19 % revenue, both with `tax_ust_19_skr03`, and the month books both
- **THEN** `E-TAX-RATES` names `tax_ust_19_skr03`, 7 % and 19 % and both rows, and no file is written

#### Scenario: One rate per tax
- **WHEN** the German fixture month is exported with the template mapping
- **THEN** no `E-TAX-RATES` is raised

### Requirement: German special-case warnings for a month
For each property and month, the export and `schedule --once` SHALL report `W-CITY-TAX-TAXED` for the mapping rows the month's ledger lines resolve to, and SHALL report `W-FOOD-RATE` once per business day on which a revenue line whose apaleo account name matches the template's food pattern (and not a beverage pattern) carries a German rate other than the Speisen rate of its service day (19 % until 2020-06-30, 5 % from 2020-07-01 to 2020-12-31, 7 % from 2021-01-01 to 2023-12-31, 19 % from 2024-01-01 to 2025-12-31, 7 % from 2026-01-01), naming the day, the apaleo account, the rate and the Speisen rate of the day with its period. Both warnings SHALL appear in the dry run, the CLI output and the protocol, and SHALL NOT block the file.

#### Scenario: Food at 19 % in 2026
- **WHEN** a breakfast line on 2026-09-14 credits an apaleo account named "Frühstück" at 19 %
- **THEN** the file is written and the output and the protocol carry `W-FOOD-RATE` naming 2026-09-14, the account, 19 % and the 7 % rate for Speisen from 2026-01-01

#### Scenario: Food at the reduced rate of 2021 to 2023
- **WHEN** a breakfast line on 2023-06-15 credits an apaleo account named "Frühstück (7%)" at 7 %
- **THEN** no `W-FOOD-RATE` is raised, and the same line at 19 % raises it naming 7 % for services from 2021-01-01 to 2023-12-31

#### Scenario: Drinks are not food
- **WHEN** a line on 2026-09-14 credits an apaleo account named "Getränke Restaurant" at 19 %
- **THEN** no `W-FOOD-RATE` is raised

