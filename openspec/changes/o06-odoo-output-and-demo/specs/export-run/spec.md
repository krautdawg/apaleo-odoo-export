## MODIFIED Requirements

### Requirement: Plausibility checks
The export SHALL verify that the absolute gross of all ledger lines equals the sum over booked and skipped lines; that per business day the signed movement of each mapped target account in the bookings, as the target's movement model gives it (Odoo: the non-VAT side by the gross amount and the VAT side by the gross amount minus apaleo's rounded tax, each signed by its side; the tax lines Odoo creates are not part of this check), equals the signed apaleo movement of the booked lines mapped to it; and that per rate the tax amounts in the bookings equal the sum of apaleo's per-line tax rounded to cents of the booked lines of that rate, apart from tax amounts of deposit releases computed from a chart rate (`W-VAT-INFERRED`); violations SHALL be errors. The `E-VAT-TOTAL` message SHALL also name apaleo's precise VAT total of the rate and the line-rounding difference; the difference between the tax per booking and apaleo's precise total SHALL never be an error by itself. The rendered file SHALL additionally pass the writer's checks of the fitted entries (`E-ODOO-UNBALANCED`, `E-ODOO-GROSS`, `E-ODOO-VAT-FIT`). When `checks.aggregates` is true (default false), it SHALL call apaleo's daily aggregates once per business day and compare each listed account's balance (debit minus credit) with the signed sum of that day's ledger lines: a side on a global chart account counts for that account, any other side for its main account; Revenues and Liabilities sides count with their precise net amount, all other types with their gross amount; each tax of a line with a Revenues side counts for the chart's `Vat` account of that VAT type and rate, and of a line with a Liabilities side for the `VatOnLiabilities` account, signed like that side; both balances are rounded to cents only for the comparison. A difference SHALL be reported as a warning. The aggregate comparison SHALL depend only on the ledger lines and the chart, never on the bookings of a target.

#### Scenario: Tax total per rate
- **WHEN** a defect makes the bookings at 19 % carry 4.00 apaleo tax in total while apaleo's per-line taxes at 19 %, rounded to cents, total 4.02
- **THEN** error `E-VAT-TOTAL` is reported for 19 % with both amounts and apaleo's precise total, and no file is written

#### Scenario: Line rounding is not an error
- **WHEN** the recorded VIE day 2026-10-21 is exported with the VIE Odoo mapping, where the bookings carry 7.74 tax at 10 % and apaleo's precise total is 7.74545454
- **THEN** no `E-VAT-TOTAL` is raised, and the protocol shows both amounts and the difference 0.01

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

### Requirement: Idempotent re-runs
Re-running an export for a period whose file exists SHALL do nothing when the new file is byte-identical to the existing one, SHALL refuse with `E-FILE-EXISTS` when any byte differs, and with `--overwrite` SHALL keep the old file under a `.replaced-<timestamp>.csv` name, write the new one and record both in the manifest. The comparison SHALL read the existing file, so it works without the manifest. When the file is unchanged but its protocol or current manifest entry is missing or describes another file (a run interrupted between writing the file and its companions), the run SHALL rewrite them and report `N-COMPANIONS-REPAIRED`. Writing SHALL hold an exclusive lock file in the property-month folder and SHALL re-check the file on disk under that lock, so two concurrent runs never both write or replace the same file; the run that finds the lock or a changed file SHALL fail that property-month with `E-EXPORT` and write nothing. An export whose period overlaps another Odoo file in the same folder SHALL be refused with `E-PERIOD-OVERLAP`, because the entries of the shared days carry the same External IDs and importing both would overwrite reviewed drafts with the other file's content.

#### Scenario: Unchanged re-run
- **WHEN** the same month is exported twice with unchanged apaleo data and mapping
- **THEN** the second run reports `unchanged`, rewrites nothing and exits 0

#### Scenario: Late posting changed the month
- **WHEN** a late posting changed the month after it was exported
- **THEN** the second run refuses with `E-FILE-EXISTS`, explains that before importing the new file the draft entries with the reference `apaleo BSP` of that period must be deleted in Odoo and posted ones reversed, because the import cannot change posted entries, and suggests `--overwrite`

#### Scenario: Manifest deleted
- **WHEN** `manifest.json` was deleted and the same month is exported again with unchanged data
- **THEN** the run reports `unchanged` by comparing the existing file, leaves the Odoo file untouched and writes the missing manifest entry again (`N-COMPANIONS-REPAIRED`)

#### Scenario: Config changed the journal
- **WHEN** the month was exported and `odoo.journal` was changed before the same month is exported again with unchanged data
- **THEN** the run refuses with `E-FILE-EXISTS` and keeps the old file, and with `--overwrite` it replaces the file and the new entries carry the new journal code

#### Scenario: Config changed the rounding method
- **WHEN** the month was exported with `odoo.taxRounding: per_line` and is exported again with `per_tax`
- **THEN** the run refuses with `E-FILE-EXISTS`, because the fitted bases differ, and with `--overwrite` it replaces the file

#### Scenario: Overlapping period
- **WHEN** the folder holds the file for 2026-09-01 to 2026-09-30 and the user exports 2026-09-20 to 2026-09-30
- **THEN** the export refuses with `E-PERIOD-OVERLAP`, names the existing file, says that both files share the External IDs of those days, and writes nothing
