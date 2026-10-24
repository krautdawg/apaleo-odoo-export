## MODIFIED Requirements

### Requirement: Mapping file format
The tool SHALL read and write a mapping CSV with the columns `apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;odoo_account;odoo_tax;tax_percent;analytic;comment`, keyed by apaleo account number and type. Written files SHALL be UTF-8 with byte-order mark and `;` separators. Reading SHALL accept UTF-8 with or without BOM and CP1252, `;` or `,` separators, and a decimal comma or point in the two rate columns, and SHALL keep `odoo_account`, `odoo_tax` and `analytic` as text. A file whose header has the Abacus columns (`abacus_account`, `mwst_code`), the BMD columns (`bmd_account`, `steuercode`) or the DATEV columns (`datev_account`, `bu_key`) SHALL be rejected with an error that names the format it found and `init-mapping --template skr03-hotel` (or `skr04-hotel`). The account-export layout of the paid apaleo-Abacus connector SHALL be rejected as an Abacus mapping; no message in `src/` and no doc SHALL name the vendor of a paid connector.

#### Scenario: Excel round trip
- **WHEN** the committed fixture `test/fixtures/mapping/excel-de-saved.csv` (the written original after an Excel DE save: CP1252, `;`, CRLF, rate `19,0` with a decimal comma, Excel's quoting) is loaded
- **THEN** it yields the same rows and values as the written original, with the rate read as 19 and the account `1410` and the tax `tax_ust_19_skr03` kept as text

#### Scenario: Duplicate key
- **WHEN** two rows share the same apaleo account and type
- **THEN** loading fails with an error naming both line numbers

#### Scenario: Old Abacus mapping
- **WHEN** the user points `--mapping` at a mapping CSV with the columns `abacus_account` and `mwst_code`
- **THEN** loading fails, says the file is an Abacus mapping, and names `init-mapping --template skr03-hotel`

#### Scenario: Old DATEV mapping
- **WHEN** the user points `--mapping` at a mapping CSV with the column `datev_account`
- **THEN** loading fails, says the file is a DATEV mapping, and names `init-mapping --template skr03-hotel`, adding that the DATEV account numbers of the SKR03/SKR04 hotel templates are the same in Odoo

### Requirement: Unmapped accounts block the export
The tool SHALL refuse to produce an Odoo file when any account booked in the period does not resolve to a row with an Odoo account, and SHALL list each such account with number, type, name, number of lines and gross total. Accounts outside the chart that have a parent (per-reservation and folio accounts) SHALL be reported once per parent, type and VAT rate, with the number of such accounts and up to three examples, not once per reservation. The fix SHALL name the row to change: for an exact row with an empty Odoo account, that row's line; for accounts reached through an empty parent row, that parent row and its line together with the wildcard row to add (for VAT-relevant types a `*` row for the type and rate, with the SKR03 hotel template's account and tax for that type and rate as example when it has one, never "fill in the parent row"; for other types the parent row or a `*` row for the type). `mapping check --from --to` SHALL resolve each line with the rate the posting rules use, including the inferred rate of an untaxed deposit release.

#### Scenario: Untaxed deposit release
- **WHEN** the period contains a deposit release (debit Liabilities, credit Receivables, no tax entries) with a `PostPrepaymentVat` line of the same day and reference at 7 %, and the mapping has rate wildcards for Liabilities at 7 % and 0 %
- **THEN** `mapping check --from --to` resolves the release through the 7 % wildcard, never through the 0 % wildcard, reports nothing for it, and exits with code 0 if nothing else fails

#### Scenario: Untaxed deposit release without a rate source
- **WHEN** the period contains such a deposit release without a matching `PostPrepaymentVat` line, and the chart gives its Liabilities account no VAT rate
- **THEN** `mapping check --from --to` reports `E-VAT-RATE-UNKNOWN` once for all such lines, does not mention the 0 % row, and exits with code 1

#### Scenario: Parent row with the wrong VAT rate
- **WHEN** a mapping has only the parent row `5000;Revenues;Revenues;;8400;tax_ust_19_skr03;19` and the period books accommodation (`5011`) and breakfast in the room price (`5111`) at 7 %
- **THEN** `mapping check --from --to` reports `E-VAT-MISMATCH` for `5011` and `5111` (booked at 7 %, the row applies 19 % on `8400`) and exits with code 1

#### Scenario: New revenue account
- **WHEN** the period contains lines on revenue account `5010` that has no mapping row
- **THEN** the check fails with exit code 1 and a finding `E-UNMAPPED` naming `5010`, its type, its name, the line count and the gross total, and no file is written

#### Scenario: Deposits under an empty parent without wildcards
- **WHEN** the mapping has the empty row `3000;Liabilities` on line 40 and no Liabilities wildcards, and the period books three per-reservation Liabilities accounts at 7 %
- **THEN** one `E-UNMAPPED` finding names parent `3000`, line 40, three accounts with their examples, and the fix "add a wildcard row `*;Liabilities` at 7 %" with the template's `1711` and `tax_ust_7_skr03` as example, and it does not ask to fill in line 40

#### Scenario: Accounts receivable without a row
- **WHEN** the mapping has neither a `9999` row nor an AccountsReceivable wildcard and the period books `AHTJTGFK-1_AccountsReceivable` and its `/Offset`
- **THEN** one `E-UNMAPPED` finding names parent `9999` (AccountsReceivable) with both accounts and suggests a `9999` row or `*;AccountsReceivable;;;1401` (Forderungen aus Lieferungen und Leistungen)

## REMOVED Requirements

### Requirement: KMU hotel template
**Reason**: The product writes Odoo journal entries for German hotels; the Swiss KMU template with MWST-Codes is replaced by the SKR03 and SKR04 hotel templates for Odoo.
**Migration**: Use `init-mapping --template skr03-hotel` or `--template skr04-hotel` (requirement "SKR hotel templates for Odoo").

### Requirement: Mapping validation for Abacus
**Reason**: Odoo rows carry an Odoo account code, an Odoo tax and its rate instead of an Abacus account, an MWST-Code and a Kostenstelle.
**Migration**: See "Mapping validation for Odoo".

### Requirement: init-mapping command with the KMU hotel template
**Reason**: The command writes Odoo mappings from the SKR templates; `--accounts-from` read the account export of the paid Abacus connector, whose Odoo counterpart has no known layout.
**Migration**: See "init-mapping command with the SKR hotel templates"; carry accounts over from a paid connector by hand.

## ADDED Requirements

### Requirement: SKR hotel templates for Odoo
The tool SHALL ship rule-based templates `templates/skr03-hotel.rules.csv` and `templates/skr04-hotel.rules.csv` with the columns `apaleo_type;name_pattern;apaleo_vat_percent;odoo_account;odoo_tax;tax_percent;comment`, based on Odoo's l10n_de chart templates of 17.0, 18.0 and 19.0 and the DATEV SKR03/SKR04 hotel templates of apaleo-datev-export, that map by apaleo type, VAT percent and account-name pattern: revenue at 7 % (Logis, Speisen from 2026-01-01, and no-show and cancellation fees that apaleo taxes at 7 %) to SKR03 `8300` / SKR04 `4300` with `tax_ust_7_skr03` / `tax_ust_7_skr04`; revenue at 19 % (beverages, minibar and other services) to `8400` / `4400` with `tax_ust_19_*`; revenue at 0 % to `8200` / `4200` without tax, the SKR04 row with a comment that `4200` carries 19 % as default tax in Odoo; cash payments to `1000` / `1600`; every non-cash payment to Geldtransit `1360` / `1460` (never a bank account); guest receivables to `1410` / `1210`; every accounts-receivable account (the `CollectiveDebitor_AccountsReceivable` row and `*;AccountsReceivable`) to `1401` / `1200`; deposits by rate through wildcard rows (`1711` / `3260` at 7 % with `tax_ust_7_*`, `1718` / `3272` at 19 % with `tax_ust_19_*`, `1719` / `3280` at 0 % without tax); bad debt by rate through wildcard rows (`2401` / `6931` at 7 %, `2406` / `6936` at 19 % with the tax of the rate, `2400` / `6930` at 0 % without tax). Revenue and Liabilities accounts at 16 % and 5 % (1.7.-31.12.2020) and a 7 % revenue account no name pattern matches SHALL be written with an empty Odoo account and a comment; CityTaxes, SecondCityTax, GuestLevies, House and TransitoryItems SHALL be written with an empty Odoo account and a comment describing the options. The templates SHALL NOT write a row for a container account outside the global ledger (`hasChildren`) when its type has wildcard rules and no rule yields an Odoo account for it. Every row SHALL be marked `Vorschlag (ungeprüft)`, every comment SHALL be in German as used in Germany and name its source with the check date, and the first comment line SHALL carry the template id and version (`skr03-hotel@1`, `skr04-hotel@1`).

#### Scenario: Lodging and drinks
- **WHEN** the chart contains revenue accounts "Logis" at 7 % and "Getränke" at 19 % and `init-mapping --template skr03-hotel` runs
- **THEN** "Logis" maps to `8300` with `tax_ust_7_skr03` and 7, and "Getränke" to `8400` with `tax_ust_19_skr03` and 19

#### Scenario: SKR04 deposits
- **WHEN** `init-mapping --template skr04-hotel` runs on the recorded BER chart
- **THEN** the file has `*;Liabilities` rows at 7 % (`3260`, `tax_ust_7_skr04`), 19 % (`3272`, `tax_ust_19_skr04`) and 0 % (`3280`, no tax), no row for `3000` or `9999`, and `*;AccountsReceivable` to `1200`

#### Scenario: Kurtaxe is not pre-filled
- **WHEN** the chart contains a CityTaxes account
- **THEN** its row has an empty Odoo account and a comment naming both options (guest-owed Kurtaxe as durchlaufender Posten on `1590` / `1370` without tax; hotel-owed Übernachtung- or Beherbergungsteuer as part of the consideration at 7 %), and `mapping check --from --to` reports `E-UNMAPPED` for it until the user fills it in

#### Scenario: Historic rates stay empty
- **WHEN** the recorded BER chart has revenue accounts at 16 % and 5 %
- **THEN** their rows have an empty Odoo account and a comment that these rates applied from 2020-07-01 to 2020-12-31

### Requirement: Mapping validation for Odoo
`apaleo-odoo mapping check` SHALL validate that Odoo accounts match `^[A-Za-z0-9.]{1,64}$` (`E-ACCOUNT-FORMAT`); that `odoo_tax` is empty, a chart-template id (`^[a-z0-9_]+$`) or a full External ID (`^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$`) (`E-TAX-FORMAT`); that a row with a tax has a `tax_percent`, 0 included (`E-VAT-RATE-MISSING`), and a row with a `tax_percent` above 0 has a tax (`E-TAX-MISSING`); that no row of type Payments, Receivables or AccountsReceivable has a tax (`E-TAX-NOT-ALLOWED`), because Odoo would compute VAT on money or a claim; that a tax that is not one of the l10n_de sale taxes known to the tool gives `W-TAX-UNCHECKED` (confirm with the Steuerberater that it is a sale tax of the company, with its rate); that a known tax used at another rate than its own (`tax_ust_19_*` 19, `tax_ust_7_*` 7, `tax_not_taxable_*` 0) gives `W-TAX-RATE`; that an untaxed row on an account that carries a default tax in Odoo's l10n_de template (SKR03 `8300`, `8400`, `2401`, `2406`; SKR04 `4200`, `4300`, `4400`, `6931`, `6936`) gives the note `N-DEFAULT-TAX-ACCOUNT`; that a rate other than 0, 7 or 19 gives `W-VAT-RATE-UNUSUAL` naming the German rates and, for 16 and 5, the period 2020-07-01 to 2020-12-31; that `analytic` is empty or 1 to 10 digits (`E-ANALYTIC-FORMAT`) and that an `analytic` on a row whose type is not Revenues or LossOfAccountsReceivable gives `W-ANALYTIC-IGNORED`; and that the row's rate (`tax_percent`, 0 without tax) equals `apaleo_vat_percent` where both are known, and with `--from --to` equals the rate each booked line of a VAT-relevant type carries (`E-VAT-MISMATCH`, also for rows reached through the parent chain). The command SHALL exit with code 1 on any error.

#### Scenario: VAT mismatch
- **WHEN** an apaleo revenue account at 7 % is mapped to `8400` with `tax_ust_19_skr03` and `tax_percent` 19
- **THEN** the check reports `E-VAT-MISMATCH` naming the row and both rates

#### Scenario: Swapped taxes
- **WHEN** a row maps revenue at 19 % to `8400` with `tax_ust_7_skr03` and `tax_percent` 19
- **THEN** the check warns `W-TAX-RATE` naming the row, the tax `tax_ust_7_skr03` (7 %) and the rate 19

#### Scenario: Tax on a receivables row
- **WHEN** the row `1200;Receivables` maps to `1410` with `tax_ust_7_skr03` and `tax_percent` 7
- **THEN** the check reports `E-TAX-NOT-ALLOWED` naming the row, and exits with code 1

#### Scenario: Untaxed revenue on an account with a default tax
- **WHEN** a Revenues row at 0 % maps to SKR04 `4200` without tax
- **THEN** the check notes `N-DEFAULT-TAX-ACCOUNT` naming the row, the default tax 19 % and that the file sets the line without tax explicitly, and exits with code 0 if nothing else fails

#### Scenario: Custom tax
- **WHEN** a row maps revenue at 7 % to `8300` with `__import__.ust_7_hotel` and `tax_percent` 7
- **THEN** the check warns `W-TAX-UNCHECKED` naming the tax and exits with code 0 if nothing else fails

#### Scenario: Swiss rate copied
- **WHEN** a row maps revenue at 8.1 % to `8400` with `tax_ust_19_skr03` and `tax_percent` 8.1
- **THEN** the check warns `W-VAT-RATE-UNUSUAL` naming the row and the German rates, and `W-TAX-RATE` for the tax

#### Scenario: Analytic account on a payment row
- **WHEN** a Payments row has `analytic` `12`
- **THEN** the check warns `W-ANALYTIC-IGNORED` naming the row, and a row with `analytic` `K12` reports `E-ANALYTIC-FORMAT`

#### Scenario: Valid mapping
- **WHEN** every row passes all checks
- **THEN** the command prints a summary of rows by type and exits with code 0

### Requirement: init-mapping command with the SKR hotel templates
`apaleo-odoo init-mapping --property <id> --template skr03-hotel|skr04-hotel [--out <file>] [--update]` SHALL read the property's chart of accounts and write a mapping CSV with one row per leaf account pre-filled from the template, SHALL refuse to overwrite an existing file unless `--update` is given, and with `--update` SHALL keep every existing row unchanged and append rows only for accounts not yet present. A template name other than `skr03-hotel` and `skr04-hotel` SHALL be a usage error that lists the available templates; `--accounts-from` SHALL be an unknown flag.

#### Scenario: First run
- **WHEN** the user runs `init-mapping --property BSP --template skr03-hotel` and no file exists
- **THEN** `mapping-BSP.csv` is written with all leaf accounts, template suggestions where a rule matched, and the command prints how many rows are mapped and unmapped

#### Scenario: Update keeps edits
- **WHEN** the user has edited row `5000` and apaleo has added account `5020`, and runs `init-mapping --property BSP --template skr03-hotel --update`
- **THEN** row `5000` is unchanged and a row for `5020` is appended, and the command lists the added account

#### Scenario: Existing file without update
- **WHEN** `mapping-BSP.csv` exists and the user runs `init-mapping` without `--update`
- **THEN** the command exits with code 1 and nothing is written

#### Scenario: Old template
- **WHEN** the user runs `init-mapping --property BSP --template kmu-hotel`
- **THEN** the CLI exits with code 2 naming the unknown template `kmu-hotel` and the available templates `skr03-hotel` and `skr04-hotel`
