## ADDED Requirements

### Requirement: One journal entry per property and business day
The writer SHALL turn the `OdooBooking` values of one property and period into one journal entry per business day that has bookings, dated that day, in the configured journal, and SHALL net the booking sides of a day per key (Odoo account, tax External ID, label): the debit and credit amounts of a key are summed, the net becomes one line on the side of its sign, and a key whose net is 0 produces no line. A VAT side SHALL contribute its net amount (gross minus apaleo's tax) to its key and its gross to the fitting of its group; every other side SHALL contribute its gross. A day without bookings SHALL produce no entry.

#### Scenario: One day with lodging, drinks and a card payment
- **WHEN** the bookings of BSP on 2026-09-14 are lodging 120.00 at 7 % (apaleo tax 7.85) debiting `1410` and crediting `8300` with tax `tax_ust_7_skr03`, drinks 23.80 at 19 % (tax 3.80) debiting `1410` and crediting `8400` with tax `tax_ust_19_skr03`, and a Visa payment 143.80 debiting `1360` (label `Zahlung Visa`) and crediting `1410`
- **THEN** the file has one entry for 2026-09-14 with the lines `8300` credit 112.15 with `account.1_tax_ust_7_skr03`, `8400` credit 20.00 with `account.1_tax_ust_19_skr03` and `1360` debit 143.80 without tax, and no line on `1410`, whose debits and credits net to 0

#### Scenario: Allowance nets with the revenue of the day
- **WHEN** a day has lodging 120.00 at 7 % credited to `8300` and an allowance of 20.00 at 7 % (apaleo tax 1.31) debited to `8300`, both with the same label
- **THEN** the entry has one `8300` line credit 93.46 (112.15 − 18.69), and its tax group is the invoice side

#### Scenario: Two days
- **WHEN** the period 2026-09-14 to 2026-09-15 has bookings on both days
- **THEN** the file has two entries, the first dated 2026-09-14 and the second 2026-09-15, each with its own lines

#### Scenario: Empty month
- **WHEN** the writer renders zero bookings
- **THEN** the file contains only the header row

### Requirement: Import file layout
The file SHALL be CSV in UTF-8 without byte-order mark, with `,` as separator, `"` as quote character (a value is quoted when it contains `,`, `"`, a line break or a leading or trailing space, and a `"` inside is doubled), LF line ends and a final line break. The first row SHALL be the header `id,ref,date,journal_id,line_ids/id,line_ids/account_id,line_ids/name,line_ids/debit,line_ids/credit,line_ids/tax_ids/id` (constant `CSV_HEADER`). Each entry SHALL start with a row that fills `id`, `ref`, `date` (`YYYY-MM-DD`) and `journal_id` (the journal code) together with its first line; every further line of the entry SHALL be a row whose first four columns are empty. Amounts SHALL be written with a `.` and exactly two decimals, without thousands separator and without sign; a line SHALL have exactly one of `debit` and `credit` above `0.00` and the other `0.00`. `line_ids/tax_ids/id` SHALL be empty on a line without tax. The file SHALL NOT carry an `analytic_distribution` column.

#### Scenario: Continuation rows
- **WHEN** an entry has three lines
- **THEN** the file has three rows for it, and the second and third start with `,,,,`

#### Scenario: Untaxed line on an account with a default tax
- **WHEN** a line books 80.00 without tax on SKR04 `4200`, which carries 19 % as default tax in Odoo
- **THEN** its `line_ids/tax_ids/id` cell is present and empty, so the import sets no tax on it

### Requirement: External IDs and reference
The writer SHALL render a file for a given revision N (a whole number from 1, passed in the render options; 1 for the first file of a period). Each entry SHALL carry the External ID `apaleo_c<companyId>_<propertyId>_<YYYYMMDD>` and, for N ≥ 2, `apaleo_c<companyId>_<propertyId>_<YYYYMMDD>_r<N>`; each of its lines SHALL carry `<entry id>_<NNNN>` (four digits, from `0001` in file order), where `companyId` is `odoo.companyId`; a demo file SHALL use `<propertyId>_DEMO` instead of `<propertyId>`. `ref` SHALL be `apaleo <propertyId> <YYYY-MM-DD>`, for N ≥ 2 followed by ` (Korrektur <N>)`, and prefixed with `DEMO ` in a demo file. The revision exists because a reversal in Odoo does not free the External ID of a posted entry: a corrected file with the old IDs would be refused as a change to a posted entry (research §2), while a file with a new revision creates new entries. `revisionOf()` SHALL return the revision of an existing file's bytes (from the External ID of its first entry; 1 without `_r<N>`; none for a file without entries). The writer SHALL NOT write the entry number (`name`), the state or a partner. A property id SHALL be 1 to 20 characters of `A-Z`, `a-z`, `0-9`, `-` and `_` (`E-ODOO-PROPERTY-ID`).

#### Scenario: Ids of a day
- **WHEN** the second line of the entry of BSP on 2026-09-14 is rendered with `odoo.companyId` 1
- **THEN** the entry id is `apaleo_c1_BSP_20260914`, the line id `apaleo_c1_BSP_20260914_0002` and the reference `apaleo BSP 2026-09-14`

#### Scenario: Second company
- **WHEN** `odoo.companyId` is 3
- **THEN** the entry id is `apaleo_c3_BSP_20260914`, so the same hotel imported into another company of the database gets other External IDs

#### Scenario: Revised file
- **WHEN** the entry of BSP on 2026-09-14 is rendered with revision 2 and `odoo.companyId` 1
- **THEN** the entry id is `apaleo_c1_BSP_20260914_r2`, its first line id `apaleo_c1_BSP_20260914_r2_0001`, the reference `apaleo BSP 2026-09-14 (Korrektur 2)`, and `revisionOf()` of the rendered file is 2

#### Scenario: Demo ids
- **WHEN** the demo file is rendered
- **THEN** the entry id is `apaleo_c1_BSP_DEMO_20260914` and the reference `DEMO apaleo BSP 2026-09-14`

### Requirement: Taxes by External ID, never tax lines
A base line SHALL carry the External ID of its Odoo tax in `line_ids/tax_ids/id`: a mapping value without a `.` (a chart-template id such as `tax_ust_19_skr03`) SHALL be written as `account.<companyId>_<value>`, a value with a `.` SHALL be written unchanged. The writer SHALL NOT write a tax line, a line on a tax account taken from apaleo's Vat or VatOnLiabilities accounts, or a `tax_tag_ids` column, because Odoo creates the tax lines and their report grids from `tax_ids` and a file line on the tax account would double the VAT (research §3).

#### Scenario: Template tax id
- **WHEN** a base line has the tax `tax_ust_7_skr03` and `odoo.companyId` is 1
- **THEN** its tax cell is `account.1_tax_ust_7_skr03`

#### Scenario: Custom tax
- **WHEN** a base line has the tax `__import__.ust_7_hotel`
- **THEN** its tax cell is `__import__.ust_7_hotel`

#### Scenario: No tax columns beyond the header
- **WHEN** any file is rendered
- **THEN** it has exactly the columns of `CSV_HEADER` and no line on an account of type `Vat` or `VatOnLiabilities`

### Requirement: Model of Odoo's tax computation
`odooTax()` in `src/odoo/tax-model.ts` SHALL return, for the base lines of one entry, the tax Odoo creates for each group of tax and side (credit = invoice side, debit = refund side), with every amount in cents and every rounding half away from zero: with `per_line` the sum over the group's lines of `round(base × rate / 100)`; with `per_tax` `round(rate / 100 × sum of the group's bases)`. The model SHALL treat the line amount as the tax base (Odoo excludes the tax for journal entries) and SHALL ignore lines without tax.

#### Scenario: Per line
- **WHEN** a group at 7 % has the base lines 112.15 and 88.79 with `per_line`
- **THEN** the modelled tax is 7.85 + 6.22 = 14.07

#### Scenario: Per tax
- **WHEN** the same group is modelled with `per_tax`
- **THEN** the modelled tax is round(0.07 × 200.94) = 14.07

#### Scenario: Half away from zero
- **WHEN** a base line of 93.50 at 7 % is modelled
- **THEN** its tax is 6.55 (6.545 rounded away from zero)

### Requirement: Base fitting
For each base line (`per_line`) or each (tax, side) group (`per_tax`) the writer SHALL choose the base `B` nearest to apaleo's net, preferring the smaller of two equally near values, such that `B` plus the modelled tax equals apaleo's gross of that line or group, searching up to 3 cents on either side. When no such `B` exists, the writer SHALL take the largest `B` whose result is one cent below the gross and SHALL add one cent: with `per_line` as a second base line of `0.01` on the same account and tax labelled `<label> (Rundungsausgleich)` (its tax is `0.00`); with `per_tax` as an untaxed line of `0.01` on `odoo.roundingAccount` on the side of the group, labelled `Rundungsausgleich USt <rate> %`. With `per_tax`, a group fitted over several lines SHALL distribute its base over them in proportion to their apaleo nets by the largest-remainder method, ties to the first line in file order. Every added cent SHALL raise `N-ODOO-ROUNDING-LINE` naming the day, the account and the rate. After fitting, every entry SHALL balance with the modelled tax, and the summary SHALL show per rate and day the modelled Odoo tax, apaleo's rounded tax and the difference.

#### Scenario: Gross reached exactly
- **WHEN** lodging of 120.00 at 7 % (apaleo net 112.15, tax 7.85) is fitted with `per_line`
- **THEN** the base is 112.15, the modelled tax 7.85, no cent is added and no finding is raised

#### Scenario: Gross not reachable per line
- **WHEN** a breakfast of 95.00 at 7 % (apaleo net 88.79, tax 6.21) is fitted with `per_line`, where 88.78 gives 94.99 and 88.79 gives 95.01
- **THEN** the base line is 88.78, a second line `0.01` on the same account and tax is labelled `… (Rundungsausgleich)`, the modelled tax is 6.21, the lines with the tax sum to 95.00, and `N-ODOO-ROUNDING-LINE` names the day, the account and 7 %

#### Scenario: Per tax shifts one cent of VAT
- **WHEN** a day has lodging 120.00 and 95.00 at 7 % on `8300` (apaleo nets 112.15 and 88.79, taxes 7.85 and 6.21) and is fitted with `per_tax`
- **THEN** the `8300` line is 200.93, the modelled tax 14.07, the entry balances, and the summary shows Odoo tax 14.07, apaleo tax 14.06 and the difference 0.01 for 7 % on that day

#### Scenario: Gross not reachable per tax
- **WHEN** a day has one revenue line of 100.04 at 7 % (apaleo net 93.50, tax 6.54) with `per_tax` and `odoo.roundingAccount` set to the untaxed account `2700`
- **THEN** the revenue line is 93.49 (modelled tax 6.54), a line `2700` credit 0.01 without tax is labelled `Rundungsausgleich USt 7 %`, and `N-ODOO-ROUNDING-LINE` is raised

#### Scenario: Refund side
- **WHEN** a day's only 19 % booking is a deposit refund of 23.80 debiting `1718` (apaleo tax 3.80)
- **THEN** the `1718` line is debit 20.00 with `account.1_tax_ust_19_skr03`, its group is the refund side, and the counter line credits 23.80

### Requirement: Booking validation
Before rendering, the writer SHALL validate every booking and entry and SHALL report all problems at once in one `OdooValidationError`: `E-ODOO-ACCOUNT` (an account not matching `^[A-Za-z0-9.]{1,64}$`), `E-ODOO-TAX-REF` (a tax value matching neither `^[a-z0-9_]+$` nor `^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$`), `E-ODOO-JOURNAL` (a journal code not 1 to 5 characters of `A-Z` and `0-9`), `E-ODOO-AMOUNT` (a gross amount not a positive whole number of cents), `E-ODOO-SAME-ACCOUNT` (debit and credit account equal), `E-ODOO-DATE` (a business date outside the file's period), `E-ODOO-RATE` (a tax rate outside 0 to 100 or with more than two decimals), `E-ODOO-ROUNDING-ACCOUNT` (a cent is needed with `per_tax` and `odoo.roundingAccount` is not set, or it is the account of a taxed base line), `E-ODOO-UNBALANCED` (an entry whose debits minus credits minus the modelled tax of its invoice side plus that of its refund side is not 0), `E-ODOO-GROSS` (a group whose fitted bases plus modelled tax differ from the bookings' gross) and `E-ODOO-VAT-FIT` (a group whose modelled tax differs from apaleo's rounded tax by more than its number of apaleo lines plus one cent). Each finding SHALL name the day and the accounts, never a guest name.

#### Scenario: Several problems at once
- **WHEN** one booking has the account `84 00` and another the tax `19%`
- **THEN** one `OdooValidationError` lists `E-ODOO-ACCOUNT` and `E-ODOO-TAX-REF` with both bookings' days and accounts, and no file is written

#### Scenario: Unbalanced entry is caught
- **WHEN** a defect writes a base line 0.01 too high
- **THEN** `E-ODOO-UNBALANCED` names the day, the difference 0.01 and says that Odoo would add an automatic balancing line on the suspense account

#### Scenario: Rounding account missing
- **WHEN** `odoo.taxRounding` is `per_tax`, `odoo.roundingAccount` is not set and a group cannot be fitted exactly
- **THEN** `E-ODOO-ROUNDING-ACCOUNT` names the day and the rate and points to `docs/configuration.md`

### Requirement: Text sanitising
Labels (`line_ids/name`) SHALL have control characters removed, runs of whitespace collapsed to one space and outer spaces trimmed, and SHALL be cut to 128 characters with `N-ODOO-TRUNCATED`. An empty label SHALL be replaced by the account code.

#### Scenario: Long label
- **WHEN** a label has 140 characters
- **THEN** the written label has 128 characters and `N-ODOO-TRUNCATED` names the day and the account

### Requirement: Deterministic file name and content
The file name SHALL be `ODOO_Buchungen_<YYYYMMDD from>-<YYYYMMDD to>_<propertyId>.csv` (`..._<propertyId>_DEMO.csv` for the demo), and the target's file pattern SHALL match exactly these names and no `.replaced-<timestamp>` file or protocol. Entries SHALL be ordered by date, and lines inside an entry by account code (numeric parts compared as numbers), then tax value and label, with added rounding lines last. The same bookings and config SHALL always render the same bytes; the file SHALL contain no creation time.

#### Scenario: Same input, same bytes
- **WHEN** the same bookings are rendered twice
- **THEN** both files are byte-identical and `sameContent` is true

#### Scenario: File name
- **WHEN** BSP is exported for 2026-09-01 to 2026-09-30
- **THEN** the file is `ODOO_Buchungen_20260901-20260930_BSP.csv`

### Requirement: Odoo target writer
`odooTarget` SHALL implement `TargetWriter<OdooBooking>` with: the file name and pattern above; `render` for a given revision; `revisionOf()`; byte comparison as `sameContent`; the protocol title `Odoo journal entries (import file)`; `currency()` returning `odoo.currency`; `movements()` returning, for a booking, the counter side with its gross and the VAT side with its gross minus apaleo's tax, each signed by side (Soll positive); `taxReturnLine()` returning `Kz 81` for 19 and `Kz 86` for 7 and nothing for other rates; `manifestFields()` returning the Odoo company id and the journal code; the import block; and advice for `E-CURRENCY` (an Odoo company books in one currency and the tool does not convert), `E-PERIOD-OVERLAP` (both files contain entries for the same days, so importing both would overwrite reviewed drafts with the other file's content or book those days twice), `E-FILE-EXISTS` (with `--overwrite` the new file gets the next revision and new External IDs, so importing it creates new entries; before importing it, delete the draft entries of the earlier revision in Odoo, filtered by the reference `apaleo <propertyId>`, and reverse its posted entries, because an import cannot change a posted entry and a reversal keeps its External ID). The import block SHALL list the file name, the revision (for N ≥ 2 with the instruction to delete the drafts and reverse the posted entries of the earlier revision first), the number of entries and lines, the company id, the journal code, the currency, the expected rounding method with the Odoo setting to compare (Settings > Accounting > Taxes > Rounding Method), every tax External ID used with its rate and Kennzahl, the number of rounding lines, the steps (only the target company active in the company switcher, Accounting > Journal Entries > gear > Import records, upload, Test, Import), and the checks after the import (all entries are drafts, no "Automatic Balancing Line" on the suspense account, the tax per rate equals the protocol, then post).

#### Scenario: Currency from the config
- **WHEN** `odoo.currency` is `CHF`
- **THEN** `odooTarget.currency(config)` is `CHF`

#### Scenario: Kennzahl per rate
- **WHEN** the summary shows 19 % and 7 % revenue
- **THEN** it shows `Kz 81` next to 19 % and `Kz 86` next to 7 %, and nothing next to 0 %

#### Scenario: Import block names the taxes
- **WHEN** a file uses `account.1_tax_ust_7_skr03` and `account.1_tax_ust_19_skr03`
- **THEN** the import block lists both with 7 % Kz 86 and 19 % Kz 81, the journal code, the rounding method and the check for an automatic balancing line

#### Scenario: Refusal advice names Odoo
- **WHEN** the export refuses a changed file with `E-FILE-EXISTS`
- **THEN** the message says that `--overwrite` writes the next revision with new External IDs, that the draft entries with the reference `apaleo BSP` of the earlier revision must be deleted in Odoo and its posted ones reversed before the new file is imported, and names neither Abacus nor an `abacus.*` key

### Requirement: Golden-file regression tests
The repository SHALL contain golden files in `test/golden/odoo/` for: an empty month; one day with lodging, drinks and a card payment; an allowance netted with revenue; a deposit received at 7 % and released; a deposit refund (refund side); an untaxed revenue line on an account with a default tax; a per-line fit with a `Rundungsausgleich` line; a per-tax day with a VAT difference; a per-tax rounding-account line; a long label; two days; a second company id; a revision-2 file; and the demo marker. `test/odoo/golden.test.ts` SHALL compare bytes and update only with `UPDATE_GOLDEN=1`, and every golden file SHALL be checked by an independent re-implementation of the balance rule (debits minus credits minus the modelled tax per side is 0 for every entry).

#### Scenario: Golden files unchanged
- **WHEN** `pnpm test` runs without `UPDATE_GOLDEN`
- **THEN** every rendered file equals its golden file byte for byte, and every golden entry balances with the modelled tax
