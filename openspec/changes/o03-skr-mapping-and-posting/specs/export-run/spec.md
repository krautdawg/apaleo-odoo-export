## MODIFIED Requirements

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

### Requirement: Output layout and manifest
The export SHALL write each file to `<output.dir>/<propertyId>/<YYYY-MM>/` with the deterministic name `ODOO_Buchungen_<from>-<to>_<propertyId>.csv`, SHALL write a protocol text file `<name>.protokoll.txt` beside it, and SHALL record in `manifest.json` the file name, SHA-256 of the file, number of bookings, entries and lines, the sum of the debit column, Odoo's modelled VAT per tax and rate, the Odoo company id and journal code, the mapping file SHA-256, the tool version and the creation time. The protocol SHALL contain the target's import block (see the `odoo-journal-writer` capability) and, per entry line, the source entry numbers and receipt numbers of the apaleo lines it nets.

#### Scenario: Files after a run
- **WHEN** a monthly export for BSP 2026-09 succeeds
- **THEN** the folder `exports/BSP/2026-09/` contains `ODOO_Buchungen_20260901-20260930_BSP.csv`, its protocol and a manifest entry with the file hash, the number of entries and the VAT per tax and rate

#### Scenario: Protocol names company and journal
- **WHEN** the September file is written for `odoo.companyId` 1 and journal `APA`
- **THEN** the protocol's import block names company 1 and journal `APA`, and the manifest entry records both

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

## REMOVED Requirements

### Requirement: MWST-Code warnings for the rows a month uses
**Reason**: Odoo rows carry Odoo taxes instead of MWST-Codes.
**Migration**: See "Tax warnings for the rows a month uses".

### Requirement: One rate per MWST-Code
**Reason**: Odoo rows carry Odoo taxes instead of MWST-Codes.
**Migration**: See "One rate per Odoo tax".

## ADDED Requirements

### Requirement: Tax warnings for the rows a month uses
For each property and month, the export and `schedule --once` SHALL report the `mapping check` warnings `W-TAX-RATE`, `W-TAX-UNCHECKED` and `W-TAX-KZ45` for the mapping rows the month's ledger lines resolve to, one finding per warning naming every mapping line it concerns, in the dry run, the CLI output and the protocol, because scheduled runs never call `mapping check`. These warnings SHALL NOT block the file, and rows the month does not use SHALL NOT be reported.

#### Scenario: Swapped tax on a used row
- **WHEN** the 7 % lodging row maps to `8300` with `tax_ust_19_skr03` at 7 and a month books lodging at 7 %
- **THEN** the file is written, and the output and the protocol carry `W-TAX-RATE` naming the mapping line, the tax and both rates

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
