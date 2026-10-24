# export-run Specification

## Purpose
The `export` command that turns one period of a property's apaleo ledger into DATEV Buchungsstapel files: period parsing and the split per month and fiscal year, the date rules that stand in for the night-audit status, the blocking coverage, posting and plausibility checks, the dry run, the output folder with protocol and manifest, and idempotent re-runs.
## Requirements
### Requirement: Export command
The CLI SHALL provide `apaleo-abacus export` taking either `--from <date> --to <date>` (inclusive business dates) or `--month <YYYY-MM>`, an optional `--property <id>` (default: every configured property), and the flags `--dry-run` and `--overwrite`. It SHALL exit with code 0 when every property and month succeeded and 1 when any failed.

#### Scenario: Monthly export
- **WHEN** the user runs `apaleo-abacus export --month 2026-10 --property BSP` with a complete mapping
- **THEN** one file of the configured target for 2026-10-01 to 2026-10-31 is written for BSP and the exit code is 0

#### Scenario: Missing period
- **WHEN** the user runs `apaleo-abacus export` without a period
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

### Requirement: MWST-Code warnings for the rows a month uses
For each property and month, the export and `schedule --once` SHALL report the `mapping check` warnings `W-MWST-CODE-RATE` and `W-MWST-CODE-UNCHECKED` for the mapping rows the month's ledger lines resolve to, one finding per warning naming every mapping line it concerns, in the dry run, the CLI output and the protocol, because the posting guard compares rates only and scheduled runs never call `mapping check`. These warnings SHALL NOT block the file, and rows the month does not use SHALL NOT be reported.

#### Scenario: Swapped MWST-Code on a used row
- **WHEN** the 3.8 % accommodation row maps to `3400` with MWST-Code `311` (configured as the Normalsatz, 8.1 %) at 3.8 and a month books accommodation at 3.8 %
- **THEN** the file is written, and the output and the protocol carry `W-MWST-CODE-RATE` naming the mapping line, the code `311` and both rates

#### Scenario: Unused row with an unknown code
- **WHEN** a row with an MWST-Code that is not in `abacus.mwstCodes` is not reached by any line of the month
- **THEN** the export names no `W-MWST-CODE-UNCHECKED` for that row (`mapping check` still does)

### Requirement: Plausibility checks
The export SHALL verify that the absolute gross of all ledger lines equals the sum over booked and skipped lines; that per business day the signed movement of each mapped target account in the bookings, as the target's movement model gives it (Abacus: the Collective account by the gross amount and the Single account by the gross amount minus the tax, each signed by its side from `DebitCredit`; the tax leg on the MWST account is not part of this check), equals the signed apaleo movement of the booked lines mapped to it (the gross amount on the side without MWST, the gross amount minus apaleo's rounded tax on the VAT side); and that per rate the tax amounts in the bookings equal the sum of apaleo's per-line tax rounded to Rappen of the booked lines of that rate, apart from tax amounts of deposit releases computed from a chart rate (`W-VAT-INFERRED`); violations SHALL be errors. The `E-VAT-TOTAL` message SHALL also name apaleo's precise VAT total of the rate and the line-rounding difference; the difference between the tax per booking and apaleo's precise total SHALL never be an error by itself. When `checks.aggregates` is true (default false), it SHALL call apaleo's daily aggregates once per business day and compare each listed account's balance (debit minus credit) with the signed sum of that day's ledger lines: a side on a global chart account counts for that account, any other side for its main account; Revenues and Liabilities sides count with their precise net amount, all other types with their gross amount; each tax of a line with a Revenues side counts for the chart's `Vat` account of that VAT type and rate, and of a line with a Liabilities side for the `VatOnLiabilities` account, signed like that side; both balances are rounded to cents only for the comparison. A difference SHALL be reported as a warning. The aggregate comparison SHALL depend only on the ledger lines and the chart, never on the bookings of a target.

#### Scenario: Tax total per rate
- **WHEN** a defect makes the bookings at 8.1 % carry 4.00 tax in total while apaleo's per-line taxes at 8.1 %, rounded to Rappen, total 4.02
- **THEN** error `E-VAT-TOTAL` is reported for 8.1 % with both amounts and apaleo's precise total, and no file is written

#### Scenario: Line rounding is not an error
- **WHEN** the recorded VIE day 2026-10-21 is exported, where the bookings carry 7.74 tax at 10 % and apaleo's precise total is 7.74545454
- **THEN** no `E-VAT-TOTAL` is raised, and the protocol shows both amounts and the difference 0.01

#### Scenario: Roundings at another rate
- **WHEN** the posting run reported two `W-VAT-ROUNDING` differences of computed deposit tax at 3.8 % and the bookings at 8.1 % carry two Rappen more tax than apaleo charged
- **THEN** error `E-VAT-TOTAL` is reported for 8.1 % and no file is written

#### Scenario: Side bug is caught
- **WHEN** a defect writes a booking with `DebitCredit` `D` where the apaleo line credits the Collective account
- **THEN** error `E-ACCOUNT-BALANCE` names the day, the Abacus account and both signed amounts, and no file is written

#### Scenario: Aggregate check off by default
- **WHEN** `checks.aggregates` is not set
- **THEN** no aggregate request is sent and the custom app does not need `core.subledger_aggregate.create`

#### Scenario: Aggregate difference
- **WHEN** `checks.aggregates` is true and apaleo's daily balance for an account differs from the ledger lines of that day
- **THEN** warning `W-AGGREGATE-DIFF` names the day, the account, both balances and the basis (gross, net or tax), and the file is still written

#### Scenario: Normal real day has no aggregate warning
- **WHEN** `checks.aggregates` is true and the recorded VIE responses of 2026-10-21 are exported with the Abacus live mapping
- **THEN** all 19 listed accounts match and no `W-AGGREGATE-DIFF` is raised

#### Scenario: Conservation violated
- **WHEN** a defect causes a ledger line to be neither booked nor listed as skipped
- **THEN** error `E-CONSERVATION` is raised and no file is written

### Requirement: Dry run
With `--dry-run` the export SHALL run every step except writing, SHALL print the posting summary (totals per Abacus account; net, tax and gross per MWST-Code and rate with apaleo's precise VAT, the difference to the tax per booking and, for the Swiss rates, the Ziffer of the MWST-Abrechnung: 8.1 % 303, 2.6 % 313, 3.8 % 343; deposit tax per MWST-Code and rate the same way; Kurtaxe and other levies per account, with or without MWST; payments per clearing account; deposits received, released and refunded; accounts receivable; write-offs; skipped lines with unsigned totals; findings) and the import block of the protocol, and SHALL exit with code 1 if any error finding exists. The protocol file SHALL contain the same summary.

#### Scenario: Review before the first file
- **WHEN** the user runs `apaleo-abacus export --month 2026-10 --property BSP --dry-run`
- **THEN** the summary and the import block are printed and no file or folder is created

#### Scenario: Swiss rates with their Ziffer
- **WHEN** the Swiss fixture month is exported with `--dry-run`
- **THEN** the summary shows the revenue lines for `313` 3.8 % with Ziffer 343, `311` 8.1 % with Ziffer 303 and `312` 2.6 % with Ziffer 313, each with net, tax, gross, apaleo VAT and difference

#### Scenario: VAT comparison on the recorded VIE day
- **WHEN** the recorded VIE day 2026-10-21 is exported with `--dry-run` and the Abacus live mapping
- **THEN** the summary shows for revenue at 10 % the tax 7.74 of the bookings, apaleo's VAT 7.75 and the difference 0.01, with one sentence explaining that the tax is rounded per booking and apaleo's total per day

#### Scenario: VAT comparison in the protocol
- **WHEN** the recorded VIE day 2026-10-21 is exported with the Abacus live mapping (codes `V10`, `V13`, `V20`)
- **THEN** the protocol shows for revenue `V10 10 %: net 77.46, tax 7.74, gross 85.20, apaleo VAT 7.75, difference 0.01` and `V20 20 %: net 39.49, tax 7.89, gross 47.38, apaleo VAT 7.90, difference 0.01`, without a Ziffer for these non-Swiss rates, and with the same sentence on the rounding

### Requirement: Output layout and manifest
The export SHALL write each file to `<output.dir>/<propertyId>/<YYYY-MM>/` with the deterministic name `ABACUS_Buchungen_<from>-<to>_<propertyId>.xml`, SHALL write a protocol text file `<name>.protokoll.txt` beside it, and SHALL record in `manifest.json` the file name, SHA-256 of the file, number of bookings, the journal total in the Leitwährung (the sum of the gross amounts, which Abacus shows as both Soll and Haben of the imported Einzelbuchungen), the tax per MWST-Code and rate, the Mandant and Geschäftsbereich, the mapping file SHA-256, the tool version and the creation time. The protocol SHALL contain the target's import block (see the `abacus-xml-writer` capability).

#### Scenario: Files after a run
- **WHEN** a monthly export for BSP 2026-10 succeeds
- **THEN** the folder `exports/BSP/2026-10/` contains `ABACUS_Buchungen_20261001-20261031_BSP.xml`, its protocol and a manifest entry with the file hash, the journal total and the tax per MWST-Code and rate

#### Scenario: Protocol names the Mandant
- **WHEN** the October file is written for Mandant `1234` and Geschäftsbereich `2`
- **THEN** the protocol's import block names Mandant `1234` and Geschäftsbereich `2`, and the manifest entry records both

### Requirement: Idempotent re-runs
Re-running an export for a period whose file exists SHALL do nothing when the new file is byte-identical to the existing one, SHALL refuse with `E-FILE-EXISTS` when any byte differs, and with `--overwrite` SHALL keep the old file under a `.replaced-<timestamp>.xml` name, write the new one and record both in the manifest. The comparison SHALL read the existing file, so it works without the manifest. When the file is unchanged but its protocol or current manifest entry is missing or describes another file (a run interrupted between writing the file and its companions), the run SHALL rewrite them and report `N-COMPANIONS-REPAIRED`. Writing SHALL hold an exclusive lock file in the property-month folder and SHALL re-check the file on disk under that lock, so two concurrent runs never both write or replace the same file; the run that finds the lock or a changed file SHALL fail that property-month with `E-EXPORT` and write nothing. An export whose period overlaps another Abacus file in the same folder SHALL be refused with `E-PERIOD-OVERLAP`, because importing both would book the shared days twice.

#### Scenario: Unchanged re-run
- **WHEN** the same month is exported twice with unchanged apaleo data and mapping
- **THEN** the second run reports `unchanged`, rewrites nothing and exits 0

#### Scenario: Late posting changed the month
- **WHEN** a late posting changed the month after it was exported
- **THEN** the second run refuses with `E-FILE-EXISTS`, explains that the Treuhänder must first delete the imported bookings of that file in Abacus (in the Nebenjournal before they are transferred, or by reversing them), and suggests `--overwrite`

#### Scenario: Manifest deleted
- **WHEN** `manifest.json` was deleted and the same month is exported again with unchanged data
- **THEN** the run reports `unchanged` by comparing the existing file, leaves the Abacus file untouched and writes the missing manifest entry again (`N-COMPANIONS-REPAIRED`)

#### Scenario: Config changed the content
- **WHEN** the month was exported and `abacus.geschaeftsbereich` was changed before the same month is exported again with unchanged data
- **THEN** the run refuses with `E-FILE-EXISTS` and keeps the old file, and with `--overwrite` it replaces the file and the new bookings carry the new `Division`

#### Scenario: Config changed the interface version
- **WHEN** the month was exported and `abacus.version` was changed to `2024.00` before the same month is exported again with unchanged data
- **THEN** the run refuses with `E-FILE-EXISTS` and keeps the old file, because the `Parameter` block differs, and with `--overwrite` it replaces the file and the new file names version `2024.00`

#### Scenario: Overlapping period
- **WHEN** the folder holds the file for 2026-09-01 to 2026-09-30 and the user exports 2026-09-20 to 2026-09-30
- **THEN** the export refuses with `E-PERIOD-OVERLAP`, names the existing file and writes nothing

### Requirement: Target writer boundary
The export pipeline SHALL write files only through a `TargetWriter` that provides the file name for a property and period, the file-name pattern used to find existing and overlapping files of that target, the rendered bytes, the comparison that decides whether an existing file is unchanged, the protocol title, the target's advice in the `E-PERIOD-OVERLAP` and `E-FILE-EXISTS` refusals (the program the file is imported into, its config keys, how an imported file is undone), the currency the target books in for a given config, and the signed account movements of a booking that the plausibility checks compare with apaleo. `src/export/` SHALL NOT import a target module's internals other than its `TargetWriter`, and the output folder logic and the checks SHALL NOT contain a target-specific file pattern, program name, currency, field name or config key. A manifest entry SHALL count as a file of the target only when its name matches the target's file pattern. The default target SHALL be `abacusTarget`.

#### Scenario: Abacus is the default target
- **WHEN** `export --month 2026-10 --property BSP` runs with a complete Abacus mapping
- **THEN** the file `ABACUS_Buchungen_20261001-20261031_BSP.xml` is written and no BMD file appears

#### Scenario: Pattern and comparison come from the writer
- **WHEN** a test runs the export with a fake `TargetWriter` whose files are named `FAKE_<from>-<to>_<propertyId>.txt` and whose comparison ignores nothing
- **THEN** existence, overlap (`E-PERIOD-OVERLAP`), unchanged re-runs and `E-FILE-EXISTS` work for the fake files exactly as for Abacus files, and no Abacus name appears in the output folder

#### Scenario: Refusal advice comes from the writer
- **WHEN** the fake `TargetWriter` refuses a file with `E-PERIOD-OVERLAP` or `E-FILE-EXISTS`
- **THEN** the message carries the fake target's advice and names neither Abacus nor an `abacus.*` config key

#### Scenario: Manifest entry of another target
- **WHEN** `manifest.json` records a current file of the fake target for the period and no file of the default target exists
- **THEN** the lookup for the default target (as used by `schedule --once`) finds no file for that period

### Requirement: Regression on recorded live data
The repository SHALL contain recorded real apaleo responses in `test/fixtures/apaleo/live/` (chart of accounts, `export-gross-daily` and `aggregate-daily` of BER and VIE for 2026-10-21 and 2026-10-22, synthetic sandbox data, no folios), scanned for tokens, secrets, e-mail addresses, guest names and addresses on every test run, with a README naming origin, files and scan; a committed Abacus live mapping `test/fixtures/apaleo/live/VIE/mapping-VIE.abacus.csv` for the VIE chart; and tests that run the full pipeline (apaleo adapter on a fake fetch, mapping, posting, plausibility and aggregate checks, the configured `TargetWriter`) on them and assert the hand-checked totals. Because both recorded properties book in EUR, these tests SHALL set `abacus.leitwaehrung: EUR`.

#### Scenario: VIE exports cleanly
- **WHEN** `export --from 2026-10-21 --to 2026-10-21 --property VIE` runs on the recorded responses with the committed Abacus live mapping, `abacus.leitwaehrung: EUR`, `checks.aggregates: true` and the default target
- **THEN** it writes one `ABACUS_Buchungen_20261021-20261021_VIE.xml` without `E-` findings or `W-AGGREGATE-DIFF`, with 35 apaleo lines, 29 bookings and 6 skipped lines, the writer's validation passes, and the summary has the values of the posting-rules scenario "Summary of the recorded VIE day"

#### Scenario: BER with the KMU template
- **WHEN** the same export runs for BER with a mapping that `init-mapping --template kmu-hotel` writes on the BER chart
- **THEN** it raises no parse, sub-cent or Swagger-shape error and stops with `E-UNMAPPED` for the 7 % and 19 % revenue and deposit accounts, whose rows the template leaves empty as no Swiss MWST rate, and no file is written

#### Scenario: Fixture scan
- **WHEN** the scan runs over `test/fixtures/apaleo/live/`
- **THEN** it finds no key or value matching token, secret, bearer, password or e-mail patterns, and every account name is an apaleo default name or of the form `… for Reservation|Folio <id>`

### Requirement: Currency of the target
The export SHALL ask the configured `TargetWriter` for the currency it books in and SHALL refuse with `E-CURRENCY`, per property-month and before writing, a property whose currency differs from it (without reading the ledger) and a month with any ledger line in another currency, naming both currencies and saying that the tool does not convert. The Abacus target SHALL answer with `abacus.leitwaehrung`.

#### Scenario: EUR property in a CHF Mandant
- **WHEN** the property's currency is EUR and `abacus.leitwaehrung` is `CHF`
- **THEN** `E-CURRENCY` names EUR and CHF, says that the Abacus file is booked in the Mandant's Leitwährung, the ledger is not read and no file is written for that property

#### Scenario: Swiss property
- **WHEN** the property's currency is CHF, `abacus.leitwaehrung` is `CHF` and all ledger lines are in CHF
- **THEN** no `E-CURRENCY` is raised and the Abacus file is written with `Currency` and `KeyCurrency` `CHF`

#### Scenario: Line in another currency
- **WHEN** `abacus.leitwaehrung` is `CHF` and one ledger line of the month is in EUR
- **THEN** `E-CURRENCY` names the number of such lines and both currencies, and no file is written for that property-month

### Requirement: One rate per MWST-Code
Before writing, the export SHALL refuse with `E-MWST-CODE-RATES` a property-month whose bookings use one MWST-Code with more than one rate, naming the code, the rates and the mapping rows, because an Abacus MWST-Code has one rate per date and Abacus would recompute or refuse the other bookings.

#### Scenario: Code used at two rates
- **WHEN** one mapping row maps 3.8 % revenue and another maps 8.1 % revenue, both with MWST-Code `311`, and the month books both
- **THEN** `E-MWST-CODE-RATES` names `311`, 3.8 % and 8.1 % and both rows, and no file is written

#### Scenario: One rate per code
- **WHEN** the Swiss fixture month is exported with the template mapping
- **THEN** no `E-MWST-CODE-RATES` is raised

