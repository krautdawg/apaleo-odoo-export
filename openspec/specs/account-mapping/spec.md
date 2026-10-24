# account-mapping Specification

## Purpose
The account mapping from apaleo accounts to DATEV accounts: the editable mapping CSV (with Excel and Grman-export input), the resolution order for ledger accounts, offline validation, the SKR03 and SKR04 hotel templates, the `init-mapping` and `mapping check` commands, and the guard that blocks unmapped booked accounts.
## Requirements
### Requirement: Mapping file format
The tool SHALL read and write a mapping CSV with the columns `apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;abacus_account;mwst_code;mwst_percent;kost;comment`, keyed by apaleo account number and type. Written files SHALL be UTF-8 with byte-order mark and `;` separators. Reading SHALL accept UTF-8 with or without BOM and CP1252, `;` or `,` separators, and a decimal comma or point in the two rate columns, and SHALL keep `mwst_code` as text. A file whose header has the BMD columns (`bmd_account`, `steuercode`) or the DATEV columns (`datev_account`, `bu_key`) SHALL be rejected with an error that names the format it found and `init-mapping --template kmu-hotel`. A file in the account-export layout of a paid apaleo-Abacus connector (columns `Apaleo Kontonummer`, `Kontoname`, `Kontotyp`, `Abacus Kontonummer`, `Kostenstelle`; research §3) SHALL be rejected with an error that says it is the account export of a paid connector and names `init-mapping --template kmu-hotel --accounts-from <file>`, which carries its Abacus accounts and Kostenstellen over. Neither that error, nor any other message in `src/`, nor any doc SHALL name the vendor of that connector.

#### Scenario: Excel round trip
- **WHEN** the committed fixture `test/fixtures/mapping/excel-ch-saved.csv` (the written original after an Excel CH save: CP1252, `;`, CRLF, rate `8,1` with a decimal comma, Excel's quoting) is loaded
- **THEN** it yields the same rows and values as the written original, with the rate read as 8.1 and the MWST-Code `311` kept as text

#### Scenario: Duplicate key
- **WHEN** two rows share the same apaleo account and type
- **THEN** loading fails with an error naming both line numbers

#### Scenario: Old BMD mapping
- **WHEN** the user points `--mapping` at a mapping CSV with the columns `bmd_account` and `steuercode`
- **THEN** loading fails, says the file is a BMD mapping, and names `init-mapping --template kmu-hotel`

#### Scenario: Old DATEV mapping
- **WHEN** the user points `--mapping` at a mapping CSV with the column `datev_account`
- **THEN** loading fails, says the file is a DATEV mapping, and names `init-mapping --template kmu-hotel`

#### Scenario: Account export of a paid connector
- **WHEN** the user points `--mapping` at a CSV with the columns `Apaleo Kontonummer;Kontoname;Kontotyp;Abacus Kontonummer;Kostenstelle`
- **THEN** loading fails, says the file is the account export of a paid connector, names `init-mapping --template kmu-hotel --accounts-from <file>`, and the message contains no vendor name

### Requirement: Account resolution order
For a ledger account the tool SHALL resolve the mapping row in this order: exact number and type; exact number with any type; the parent account chain with the same type, where a parent row with an empty target account SHALL NOT end the search but SHALL be passed over; for VAT-relevant types (Liabilities, CityTaxes, SecondCityTax, GuestLevies, LossOfAccountsReceivable, Vat, VatOnLiabilities) a wildcard row `*` for the type whose `apaleo_vat_percent` equals the line's normalised tax rate; for other types a wildcard row `*` for the type. An exact row (number and type, or number with any type) with an empty target account SHALL still mean "unmapped". When no row with a target account is found, the first empty parent row passed over SHALL be returned so that findings can name it. Wildcard rows without a VAT rate SHALL be rejected for VAT-relevant types, and wildcard rows of type Revenues SHALL be rejected with or without a rate.

#### Scenario: Per-reservation account with a parent
- **WHEN** a ledger line debits account `BSP-12345-1` of type Receivables with parent `1200`, and the mapping has a row for `1200` Receivables
- **THEN** the line resolves to the row for `1200`

#### Scenario: Per-reservation accounts without a parent
- **WHEN** a ledger line debits `BSP-ABCDEF-1_Receivables` (type Receivables, no `parentNumber`, not in the chart) and credits `BSP-ABCDEF-1_Liabilities` (type Liabilities, no `parentNumber`) with a 7 % tax entry, and the mapping has a `*` Receivables row and a `*` Liabilities row with `apaleo_vat_percent` 7
- **THEN** the debit resolves to the Receivables wildcard and the credit to the 7 % Liabilities wildcard

#### Scenario: Empty parent row does not hide the wildcards
- **WHEN** a mapping has the row `3000;Liabilities` with an empty target account and `*` Liabilities rows at 7 %, 19 % and 0 %, and a prepayment credits `EPEBVUIU-1_Liabilities/Reduced:7.00` (parent `3000`) at 7 %
- **THEN** the account resolves to the 7 % wildcard row, and a 0 % line on `EPEBVUIU-1_Liabilities/Null:0.00` resolves to the 0 % wildcard row

#### Scenario: Austrian rates through the wildcards
- **WHEN** the same mapping also has `*` Liabilities rows at 13 % and 20 %, and the recorded VIE day credits `DHNEKKIT-1_Liabilities/Reduced:13.00` and `DHNEKKIT-1_Liabilities/Normal:20.00` (parent `3000`)
- **THEN** they resolve to the 13 % and the 20 % wildcard row

#### Scenario: Exact empty row stays unmapped
- **WHEN** the mapping has the row `RevenueNoShow_Reduced:7.00;Revenues` with an empty target account and a line credits that account
- **THEN** the account is unmapped and the finding asks to fill in the target account on that row's line

#### Scenario: Liabilities wildcard without rate rejected
- **WHEN** the mapping contains a `*` row of type Liabilities with an empty `apaleo_vat_percent`
- **THEN** loading fails with an error saying that VAT-relevant wildcards must name a VAT rate

#### Scenario: Wildcard for payments
- **WHEN** a new payment-method account appears and the mapping has a `*` Payments row
- **THEN** the account resolves to the wildcard row

#### Scenario: Wildcard for accounts receivable
- **WHEN** a line debits `ZAQSEFYC-1_AccountsReceivable` (parent `9999`, not in the chart), the mapping has no row for `9999` and has a `*` AccountsReceivable row for the collective debtor
- **THEN** the account resolves to the collective debtor, and so does `ZAQSEFYC-1_AccountsReceivable/Offset`

#### Scenario: Wildcard for revenue rejected
- **WHEN** the mapping contains a `*` row of type Revenues
- **THEN** loading fails with an error explaining that revenue accounts must be mapped one by one because of VAT

### Requirement: Unmapped accounts block the export
The tool SHALL refuse to produce an Abacus file when any account booked in the period does not resolve to a row with an Abacus account, and SHALL list each such account with number, type, name, number of lines and gross total. Accounts outside the chart that have a parent (per-reservation and folio accounts) SHALL be reported once per parent, type and VAT rate, with the number of such accounts and up to three examples, not once per reservation. The fix SHALL name the row to change: for an exact row with an empty Abacus account, that row's line; for accounts reached through an empty parent row, that parent row and its line together with the wildcard row to add (for VAT-relevant types a `*` row for the type and rate, with the KMU hotel template's account for that type and rate as example when it has one, never "fill in the parent row"; for other types the parent row or a `*` row for the type). `mapping check --from --to` SHALL resolve each line with the rate the posting rules use, including the inferred rate of an untaxed deposit release.

#### Scenario: Untaxed deposit release
- **WHEN** the period contains a deposit release (debit Liabilities, credit Receivables, no tax entries) with a `PostPrepaymentVat` line of the same day and reference at 3.8 %, and the mapping has rate wildcards for Liabilities at 3.8 % and 0 %
- **THEN** `mapping check --from --to` resolves the release through the 3.8 % wildcard, never through the 0 % wildcard, reports nothing for it, and exits with code 0 if nothing else fails

#### Scenario: Untaxed deposit release without a rate source
- **WHEN** the period contains such a deposit release without a matching `PostPrepaymentVat` line, and the chart gives its Liabilities account no VAT rate
- **THEN** `mapping check --from --to` reports `E-VAT-RATE-UNKNOWN` once for all such lines, does not mention the 0 % row, and exits with code 1

#### Scenario: Untaxed deposit release without deposit rows
- **WHEN** the rate of such a deposit release is inferred as 8.1 % and the mapping has no Liabilities row for 8.1 % that applies to it
- **THEN** `mapping check --from --to` reports `E-UNMAPPED` for the Liabilities account and suggests a `*` Liabilities row at 8.1 %

#### Scenario: Parent row with the wrong VAT rate
- **WHEN** a mapping has only the parent row `5000;Revenues;Revenues;;3500;311;8.1` and the period books accommodation (`5011`) and breakfast in the room price (`5111`) at 3.8 %
- **THEN** `mapping check --from --to` reports `E-VAT-MISMATCH` for `5011` and `5111` (booked at 3.8 %, the row applies 8.1 % on `3500`) and exits with code 1

#### Scenario: New revenue account
- **WHEN** the period contains lines on revenue account `5010` that has no mapping row
- **THEN** the check fails with exit code 1 and a finding `E-UNMAPPED` naming `5010`, its type, its name, the line count and the gross total, and no file is written

#### Scenario: Deposits under an empty parent without wildcards
- **WHEN** the mapping has the empty row `3000;Liabilities` on line 40 and no Liabilities wildcards, and the period books three per-reservation Liabilities accounts at 3.8 %
- **THEN** one `E-UNMAPPED` finding names parent `3000`, line 40, three accounts with their examples, and the fix "add a wildcard row `*;Liabilities` at 3.8 %" with the template's `2030` as example, and it does not ask to fill in line 40

#### Scenario: Accounts receivable without a row
- **WHEN** the mapping has neither a `9999` row nor an AccountsReceivable wildcard and the period books `AHTJTGFK-1_AccountsReceivable` and its `/Offset`
- **THEN** one `E-UNMAPPED` finding names parent `9999` (AccountsReceivable) with both accounts and suggests a `9999` row or `*;AccountsReceivable;;;1102` (Debitoren apaleo)

### Requirement: KMU hotel template
The tool SHALL ship a rule-based template `templates/kmu-hotel.rules.csv`, based on the Schweizer Kontenrahmen KMU and the Kontenrahmen für die Hotellerie und Gastronomie, that maps by apaleo type, VAT percent and account-name pattern: revenue at 3.8 % (Beherbergung including breakfast) to `3400` with the code `abacus.mwstCodes.beherbergung`; food revenue at 8.1 % to `3200`, drinks at 8.1 % to `3100` and other revenue at 8.1 % (minibar, parking, wellness, telephone) to `3500`, each with `abacus.mwstCodes.normal`; revenue at 2.6 % to `3260` with `abacus.mwstCodes.reduziert`; revenue at 0 % to `3600` without MWST-Code and with a comment on the account's default MWST-Code; cash payments to `1000`; every non-cash payment to the transfer account `1090` (never to a bank account); guest receivables to `1101`; every accounts-receivable account (the `CollectiveDebitor_AccountsReceivable` row and a wildcard row `*;AccountsReceivable`) to the Sachkonto `1102` with a comment that `1100` is the Sammelkonto of the Abacus Debitorenbuchhaltung; deposits by VAT rate through wildcard rows (`2030` at 3.8 %, `2031` at 8.1 %, `2032` at 2.6 % with the code of the rate, `2039` at 0 % without MWST-Code). Revenue and Liabilities accounts at the rates in force before 2024 (7.7 %, 3.7 %, 2.5 %) SHALL be written with an empty Abacus account and a comment explaining that a booking on them stops the export and that exports for 2023 and earlier need the Treuhänder; Revenue and Liabilities accounts at any other rate (for example 7, 19, 10 or 20 % of a German or Austrian chart) SHALL be written with an empty Abacus account and a comment that the rate is no Swiss MWST rate. CityTaxes, SecondCityTax, GuestLevies, House and TransitoryItems SHALL be written with an empty Abacus account and a comment describing the options. The template SHALL NOT write a row for a container account outside the global ledger (`hasChildren`) when its type has wildcard rules and no rule yields an Abacus account for it (Liabilities `3000`, AccountsReceivable `9999`, LossOfAccountsReceivable `6900`). Every template row SHALL be marked `Vorschlag (ungeprüft)`, every comment SHALL be in Swiss Standard German, and accounts that no rule matches SHALL stay unmapped.

#### Scenario: Template does not guess
- **WHEN** the chart contains a House account and a TransitoryItems account
- **THEN** the generated rows for them have an empty Abacus account and an explanatory comment

#### Scenario: Kurtaxe is not pre-filled
- **WHEN** the chart contains a CityTaxes account
- **THEN** its generated row has an empty Abacus account and a comment naming both options (durchlaufender Posten without MWST-Code, as the ESTV recommends, or taxable at 3.8 % when it is not invoiced separately or not forwarded), and `mapping check --from --to` reports `E-UNMAPPED` for it until the user fills it in

#### Scenario: Food and drinks
- **WHEN** the chart contains revenue accounts "Frühstück Restaurant" at 8.1 % and "Getränke" at 8.1 %
- **THEN** the food account maps to `3200` and the drinks account to `3100`, both with MWST-Code `311` and rate 8.1

#### Scenario: Accommodation with breakfast
- **WHEN** the chart contains a revenue account "Logis" at 3.8 %
- **THEN** it maps to `3400` with MWST-Code `313` and rate 3.8

#### Scenario: Codes from the config
- **WHEN** `abacus.mwstCodes` is `normal: V81`, `reduziert: V26`, `beherbergung: V38` and `init-mapping --template kmu-hotel` runs
- **THEN** the 8.1 % rows carry `V81`, the 2.6 % rows `V26` and the 3.8 % rows `V38`

#### Scenario: Real apaleo chart
- **WHEN** `init-mapping --template kmu-hotel` runs on the recorded BER chart of accounts
- **THEN** the file has no row for `3000` or `9999`, has `*;Liabilities` rows at 3.8, 8.1, 2.6 and 0 % and `*;AccountsReceivable` to `1102`, and leaves every revenue row at 16 %, 19 %, 7 % and 5 % empty with a comment that the rate is no Swiss MWST rate

### Requirement: Mapping validation for Abacus
`apaleo-abacus mapping check` SHALL validate that Abacus accounts are 1 to 11 digits (`E-ACCOUNT-FORMAT`); that an MWST-Code is empty or 1 to 3 characters of `A-Z`, `a-z` and `0-9` (`E-MWST-CODE-FORMAT`); that a row with an MWST-Code has an `mwst_percent`, 0 included (`E-VAT-RATE-MISSING`), and a row with an `mwst_percent` above 0 has an MWST-Code (`E-MWST-CODE-MISSING`); that no row of type Payments, Receivables or AccountsReceivable has an MWST-Code (`E-MWST-CODE-NOT-ALLOWED`), because Abacus would book the MWST on the money or claim account; that an MWST-Code that is none of the configured `abacus.mwstCodes` gives the warning `W-MWST-CODE-UNCHECKED` (confirm with the Treuhänder that it is an Umsatzsteuer code of the Mandant), also at rate 0, and that the warning names the Ziffer of the MWST-Abrechnung when the code is one of the Abacus KMU sample codes of research §5 (for example `400` Ziffer 230, `490` Ziffer 900, `491` Ziffer 910) and, for `490`, says that it is meant for Subventionen and Tourismusabgaben of a Kurverein with Vorsteuerkürzung, not for a Kurtaxe the hotel collects (a durchlaufender Posten without MWST-Code or with a Ziffer-910 code); that a configured code used at another rate than its own (`normal` 8.1, `reduziert` 2.6, `beherbergung` 3.8) gives the warning `W-MWST-CODE-RATE`; that a Revenues row at rate 0 without MWST-Code gives the warning `W-UNTAXED-REVENUE` (check that the Abacus account has no default MWST-Code that "MWST berechnen" would apply, or enter the Mandant's code for revenue without MWST); that a rate other than 0, 2.6, 3.8 or 8.1 gives the warning `W-VAT-RATE-UNUSUAL` naming the Swiss rates and, for 7.7, 3.7 and 2.5, that they applied before 2024; that `kost` is empty or 1 to 11 digits (`E-KOST-FORMAT`) and that a `kost` on a row whose type is not Revenues or LossOfAccountsReceivable gives the warning `W-KOST-IGNORED`; and that the row's rate (`mwst_percent`, 0 without MWST-Code) equals `apaleo_vat_percent` where both are known, and with `--from --to` equals the rate each booked line of a VAT-relevant type carries (`E-VAT-MISMATCH`, also for rows reached through the parent chain). The command SHALL exit with code 1 on any error.

#### Scenario: VAT mismatch
- **WHEN** an apaleo revenue account at 3.8 % is mapped to `3500` with MWST-Code `311` and `mwst_percent` 8.1
- **THEN** the check reports `E-VAT-MISMATCH` naming the row and both rates

#### Scenario: Austrian mapping copied
- **WHEN** a row maps apaleo revenue at 10 % to `3400` with MWST-Code `1` and `mwst_percent` 10
- **THEN** the check warns `W-VAT-RATE-UNUSUAL` naming the row and the Swiss rates, and `W-MWST-CODE-UNCHECKED` naming code `1`

#### Scenario: Old rate
- **WHEN** a row has `mwst_percent` 7.7
- **THEN** `W-VAT-RATE-UNUSUAL` says that 7.7 % was the Normalsatz until 2023-12-31

#### Scenario: Swapped codes
- **WHEN** the configured codes are the defaults and a row maps revenue at 8.1 % with MWST-Code `313`
- **THEN** the check warns `W-MWST-CODE-RATE` naming the row, code `313` (configured for Beherbergung, 3.8 %) and the rate 8.1

#### Scenario: MWST-Code on a receivables row
- **WHEN** the row `1200;Receivables` maps to `1101` with MWST-Code `313` and `mwst_percent` 3.8
- **THEN** the check reports `E-MWST-CODE-NOT-ALLOWED` naming the row, and exits with code 1

#### Scenario: Untaxed revenue with a code at rate 0
- **WHEN** a Revenues row at 0 % maps to `3600` with MWST-Code `400` and `mwst_percent` 0
- **THEN** neither `E-MWST-CODE-MISSING` nor `E-VAT-RATE-MISSING` is reported, `W-MWST-CODE-UNCHECKED` names code 400 and Ziffer 230, and the command exits with code 0 if nothing else fails

#### Scenario: Kurtaxe with the Ziffer-900 sample code
- **WHEN** a CityTaxes row maps to `2210` with MWST-Code `490` and `mwst_percent` 0
- **THEN** `W-MWST-CODE-UNCHECKED` names code `490` and Ziffer 900, says that a collected Kurtaxe is a durchlaufender Posten (no MWST-Code or a Ziffer-910 code such as `491`), and the command exits with code 0 if nothing else fails

#### Scenario: Untaxed revenue without MWST-Code
- **WHEN** a Revenues row at 0 % maps to `3600` with an empty MWST-Code
- **THEN** the check warns `W-UNTAXED-REVENUE` naming the row and saying that the Abacus account must not carry a default MWST-Code

#### Scenario: Kostenstelle on a payment row
- **WHEN** a Payments row has `kost` `10`
- **THEN** the check warns `W-KOST-IGNORED` naming the row, and a row with `kost` `K10` reports `E-KOST-FORMAT`

#### Scenario: Rate without MWST-Code
- **WHEN** a row has `mwst_percent` 8.1 and an empty MWST-Code
- **THEN** the check reports `E-MWST-CODE-MISSING`

#### Scenario: Account with letters
- **WHEN** a row maps to `34OO` or to a 12-digit number
- **THEN** the check reports `E-ACCOUNT-FORMAT` for the row and names the rule of 1 to 11 digits

#### Scenario: Valid mapping
- **WHEN** every row passes all checks
- **THEN** the command prints a summary of rows by type and exits with code 0

### Requirement: init-mapping command with the KMU hotel template
`apaleo-abacus init-mapping --property <id> --template kmu-hotel [--out <file>] [--update] [--accounts-from <file>]` SHALL read the property's chart of accounts and write a mapping CSV with one row per leaf account pre-filled from the template and the configured MWST-Codes, SHALL refuse to overwrite an existing file unless `--update` is given, and with `--update` SHALL keep every existing row unchanged and append rows only for accounts not yet present. With `--accounts-from <file>`, an account export of a paid apaleo-Abacus connector (the layout of "Mapping file format"), the command SHALL take the Abacus account and the Kostenstelle of every apaleo account number and type found in that file into the row of the same account and type, SHALL take the MWST-Code and rate of such a row from the template rule for its type and rate (an empty MWST-Code where no rule gives one, so that `mapping check` reports `E-MWST-CODE-MISSING` for a rate above 0), SHALL mark such a row `Vorschlag (ungeprüft)` with a comment that the account was carried over, and SHALL list the accounts of that file that the chart does not contain. A template name other than `kmu-hotel` SHALL be a usage error that lists the available templates.

#### Scenario: First run
- **WHEN** the user runs `init-mapping --property BSP --template kmu-hotel` and no file exists
- **THEN** `mapping-BSP.csv` is written with all leaf accounts, template suggestions where a rule matched, and the command prints how many rows are mapped and unmapped

#### Scenario: Update keeps edits
- **WHEN** the user has edited row `5000` and apaleo has added account `5020`, and runs `init-mapping --property BSP --template kmu-hotel --update`
- **THEN** row `5000` is unchanged and a row for `5020` is appended, and the command lists the added account

#### Scenario: Existing file without update
- **WHEN** `mapping-BSP.csv` exists and the user runs `init-mapping` without `--update`
- **THEN** the command exits with code 1 and nothing is written

#### Scenario: Old template
- **WHEN** the user runs `init-mapping --property BSP --template ekr`
- **THEN** the CLI exits with code 2 naming the unknown template `ekr` and the available template `kmu-hotel`

#### Scenario: Switching from a paid connector
- **WHEN** the user runs `init-mapping --property BSP --template kmu-hotel --accounts-from konten.csv` with a connector export that maps `5011` (Revenues) to `3410` with Kostenstelle `20` and `1200` (Receivables) to `1105`, and lists `7777`, which the chart does not contain
- **THEN** the row for `5011` has Abacus account `3410`, `kost` `20` and the template's Beherbergung code and rate, the row for `1200` has `1105` without MWST-Code, both are marked `Vorschlag (ungeprüft)` with the carried-over comment, every other row is the template suggestion, and the command lists `7777` as not in the chart

### Requirement: Template rows for Swiss special cases
The KMU hotel template SHALL map LossOfAccountsReceivable accounts by VAT rate through wildcard rows (`3805` at 3.8 %, `3806` at 8.1 %, `3807` at 2.6 % with the code of the rate, `3808` at 0 % without MWST-Code), SHALL map revenue accounts of apaleo's groups `RevenueCancellationFees` and `RevenueNoShow` and revenue accounts whose name matches cancellation or no-show payments (Annullation, Annulation, Storno, Cancellation, No-Show, Noshow) at 0 % to `3680` without MWST-Code and leave them unmapped with an explanatory comment at a rate above 0, also where another rate rule would match, and SHALL write the Kurtaxe comment naming the guest-owed Kurtaxe or Gästetaxe (durchlaufender Posten without MWST-Code or with a Ziffer-910 code, never the Ziffer-900 sample code `490` "Subvention Kurtaxen"), the hotel-owed Beherbergungsabgabe (part of the Beherbergung, 3.8 %) and `docs/mapping-guide.md`. Every such row SHALL be marked `Vorschlag (ungeprüft)`.

#### Scenario: Write-off rows
- **WHEN** a write-off debits a per-reservation LossOfAccountsReceivable account at 3.8 % or 8.1 % whose `parentNumber` is `6900` or `CollectiveDebitor_LossOfAccountsReceivable`
- **THEN** it resolves through the wildcard rows to `3805` or `3806` with the code of the rate, and the file has no row for `6900` or `CollectiveDebitor_LossOfAccountsReceivable`

#### Scenario: Recorded chart
- **WHEN** `init-mapping --template kmu-hotel` runs on the recorded BER chart
- **THEN** `RevenueCancellationFees_Without:0.00` maps to `3680` without MWST-Code and every no-show account with a rate above 0 has an empty Abacus account with the Annullation comment

#### Scenario: Taxed no-show is left to the Treuhänder
- **WHEN** the chart contains a revenue account "No-Show Gebühr" at 3.8 %
- **THEN** its row has an empty Abacus account and a comment that Annullationen and no-shows count as Schadenersatz without MWST (ESTV MBI 08 Ziff. 8.7) unless the service was already invoiced without a correction document

### Requirement: Swiss special-case warnings
`mapping check` SHALL warn `W-KURTAXE-TAXED` for a CityTaxes, SecondCityTax or GuestLevies row with an MWST-Code and a rate above 0, explaining that a guest-owed Kurtaxe that is invoiced separately and forwarded is a durchlaufender Posten without MWST and that only a hotel-owed Beherbergungsabgabe, a Kurtaxe that is not invoiced separately or the part kept by the hotel is taxable at 3.8 % (ESTV MBI 08 Ziff. 7.11); and SHALL warn `W-ANNULLATION-TAXED` for a revenue row of apaleo's groups `RevenueCancellationFees` or `RevenueNoShow`, or whose name matches cancellation or no-show payments, with a rate above 0, explaining that Annullationen and no-shows are Schadenersatz without MWST unless the service was already invoiced without a correction document (Ziff. 8.7). Both warnings SHALL name the row and its line and SHALL NOT change the exit code.

#### Scenario: Kurtaxe mapped with MWST
- **WHEN** a CityTaxes row maps to `3400` with MWST-Code `313` and `mwst_percent` 3.8
- **THEN** `mapping check` warns `W-KURTAXE-TAXED` naming the row, its line and Ziff. 7.11, and exits with code 0 if nothing else fails

#### Scenario: Kurtaxe as durchlaufender Posten
- **WHEN** a CityTaxes row maps to `2210` without MWST-Code
- **THEN** no `W-KURTAXE-TAXED` is raised

#### Scenario: No-show mapped with MWST
- **WHEN** the row `RevenueNoShow_Special:3.80;Revenues` maps to `3400` with MWST-Code `313` and `mwst_percent` 3.8
- **THEN** `mapping check` warns `W-ANNULLATION-TAXED` naming the row and Ziff. 8.7, and exits with code 0 if nothing else fails

