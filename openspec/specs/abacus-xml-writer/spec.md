# abacus-xml-writer Specification

## Purpose
The AbaConnect "XML Buchungen" file (Application FIBU, mapping AbaDefault) that a Swiss Treuhänder imports into Abacus Finanzbuchhaltung: container, Einzelbuchung layout with MWST in `SingleInformation`, number formats, Belegnummern, encoding, validation, sanitising, file name, the Abacus target writer with its import block, and golden tests.
## Requirements
### Requirement: AbaConnect container
The writer SHALL emit `<?xml version='1.0' encoding='UTF-8'?>` followed by one `AbaConnectContainer` with `TaskCount` `1` and one `Task` whose `Parameter` holds, in this order, `Application` `FIBU`, `Id` `XML Buchungen`, `MapId` `AbaDefault`, `Version` (the configured interface version, default `2015.00`) and `Mandant` (the property's Mandantennummer), and SHALL write one `Transaction id='<n>'` per booking in file order, numbered from 1, each with one `Entry mode='SAVE'`.

#### Scenario: Empty month
- **WHEN** the writer renders zero bookings for Mandant `1234`
- **THEN** the file contains the declaration, the container with `TaskCount` `1`, the `Parameter` block with `Mandant` `1234` and no `Transaction`

#### Scenario: Interface version from the config
- **WHEN** `abacus.version` is `2024.00`
- **THEN** the `Parameter` block contains `<Version>2024.00</Version>` and nothing else in the file changes

### Requirement: Einzelbuchung layout
Each `Entry` SHALL contain one `CollectiveInformation mode='SAVE'` and one `SingleInformation mode='SAVE'`. `CollectiveInformation` SHALL contain, in this order, `EntryLevel` `A`, `EntryType` `S`, `Type` `Normal`, `DebitCredit`, `Client` (Mandant), `Division` (Geschäftsbereich, `0` when none is configured), `KeyCurrency` (Leitwährung), `EntryDate`, `AmountData mode='SAVE'` with `Currency` and `Amount`, `KeyAmount`, `Account` (the Collective account), `TaxAccount`, `Text1`, `Text2` (only when not empty), `DocumentNumber` and `SingleCount` `0`. `SingleInformation` SHALL contain, in this order, `Type` `Normal`, `DebitCredit`, `EntryDate`, `AmountData mode='SAVE'` with `Currency` and `Amount`, `KeyAmount`, `Account` (the Single account), `TaxAccount`, `BookingLevel1` (only with a Kostenstelle), `Text1`, `Text2` (only when not empty), `DocumentNumber` and, for a booking with MWST, `TaxData mode='SAVE'`. `DebitCredit` SHALL be the same in both blocks: `D` when the Collective account is debited and the Single account credited, `C` for the reverse. Both `Amount` and both `KeyAmount` SHALL be the booking's gross amount, written positive; `Currency` and `KeyCurrency` SHALL be the Leitwährung; `EntryDate` SHALL be the business date as `YYYY-MM-DD`.

#### Scenario: Accommodation at 3.8 %
- **WHEN** a booking has Collective account `1101`, Single account `3400`, `DebitCredit` `D`, business date 2026-10-14, gross 207.60, MWST-Code `313` at 3.8 % with tax −7.60, Text1 `Erlös Beherbergung`, Text2 `BSP-2026-0042`, it is the first booking of the file for 2026-10-01 to 2026-10-31, and the config has Mandant `1234`, Leitwährung CHF, `vereinbart` and `mwstKonto` `2200`
- **THEN** its `CollectiveInformation` has `DebitCredit` `D`, `Client` `1234`, `Division` `0`, `KeyCurrency` `CHF`, `EntryDate` `2026-10-14`, `Amount` `207.60`, `KeyAmount` `207.60`, `Account` `1101`, `TaxAccount` `2200`, `DocumentNumber` `1001000001`, and its `SingleInformation` has `Account` `3400`, `TaxAccount` `3400`, `Amount` `207.60` and `TaxData` with `TaxCode` `313`, `TaxRate` `3.8`, `AmountData/Amount` `0.00` and `KeyAmount` `-7.60`

#### Scenario: Payment without MWST
- **WHEN** a booking has Collective account `1090`, Single account `1101`, `DebitCredit` `D`, gross 120.00 and no MWST
- **THEN** both blocks have `Amount` `120.00` and `TaxAccount` `0`, and `SingleInformation` has no `TaxData` and no `BookingLevel1`

#### Scenario: Allowance
- **WHEN** a booking has Collective account `1101`, Single account `3400`, `DebitCredit` `C`, gross 20.76 and MWST-Code `313` at 3.8 % with tax 0.76
- **THEN** both blocks have `DebitCredit` `C` and `Amount` `20.76`, and `TaxData` has `AmountData/Amount` `0.00` and `KeyAmount` `0.76`

#### Scenario: Kostenstelle
- **WHEN** a booking has Single account `3200` and Kostenstelle `10`
- **THEN** `SingleInformation` contains `<BookingLevel1>10</BookingLevel1>` after `TaxAccount`, and `CollectiveInformation` contains no `BookingLevel1`

### Requirement: MWST data
For a booking with MWST, `TaxData` SHALL contain, in this order, `TaxIncluded`, `TaxType` `0` (Umsatzsteuer), `UseCode` (`0` with `abacus.abrechnungsart` `vereinbart`, `1` with `vereinnahmt`), `AmountData mode='SAVE'` with `Currency` (Leitwährung) and `Amount`, `KeyAmount` (the signed tax in the Leitwährung), `TaxRate`, `TaxCoefficient` `100`, `Country` `CH`, `TaxCode` (the MWST-Code) and `FlatRate` `0`. `TaxData/AmountData/Amount` SHALL be `0.00` when `Currency` equals `KeyCurrency`, which is every booking of this tool, and the tax only when the constant `TAX_AMOUNT_IN_KEY_CURRENCY` is switched from `zero` (default, the practice of the only production Abacus XML writer we cross-check, which Abacus otherwise refuses) to `tax`. The tax SHALL be signed by `taxSign()`: negative when the Single account is credited (`DebitCredit` `D`) and positive when it is debited (`C`), and `0.00` for a booking with an MWST-Code at rate 0. `TaxIncluded` SHALL be `I`, on rate-0 codes the value of the constant `TAX_INCLUDED_AT_RATE_ZERO` (default `I`). `TaxAccount` SHALL be, in `SingleInformation`, the value the constant `SINGLE_TAX_ACCOUNT` selects (default `account`: the Single account itself, per the documented table; `taxAccount`: the tax account of the Collective block), and in `CollectiveInformation` `abacus.mwstKonto` with `vereinbart` or `abacus.mwstHilfskonto` with `vereinnahmt`, on an MWST-Code at rate 0 the value the constant `TAX_ACCOUNT_AT_RATE_ZERO` selects (default `taxAccount`: the same account as on every other code; `zero`: `0`, since the KMU sample Mandant gives its rate-0 codes no Steuerkonto); both `TaxAccount` fields SHALL be `0` on a booking without MWST. The values of `TaxType`, the tax sign, `TAX_AMOUNT_IN_KEY_CURRENCY`, `TAX_INCLUDED_AT_RATE_ZERO`, `SINGLE_TAX_ACCOUNT` and `TAX_ACCOUNT_AT_RATE_ZERO` SHALL each be defined in one place in `src/abacus/format.ts`, and the writer, the validation and the import block SHALL read them from there, so that a test import changes one line and the golden files.

#### Scenario: Tax amount in the Leitwährung
- **WHEN** a booking in CHF with Leitwährung CHF has MWST-Code `311` at 8.1 % and tax −8.10
- **THEN** `TaxData` has `<Currency>CHF</Currency>`, `<Amount>0.00</Amount>` and `<KeyAmount>-8.10</KeyAmount>`

#### Scenario: Tax amount constant switched
- **WHEN** a unit test renders the same booking with `TAX_AMOUNT_IN_KEY_CURRENCY` set to `tax`
- **THEN** `TaxData` has `<Amount>-8.10</Amount>` and `<KeyAmount>-8.10</KeyAmount>`, and nothing else in the file changes

#### Scenario: Single TaxAccount constant switched
- **WHEN** a unit test renders the accommodation booking with `SINGLE_TAX_ACCOUNT` set to `taxAccount`
- **THEN** `SingleInformation` has `TaxAccount` `2200`, and nothing else in the file changes

#### Scenario: Vereinnahmte Entgelte
- **WHEN** `abacus.abrechnungsart` is `vereinnahmt`, `abacus.mwstHilfskonto` is `2202`, and a booking has MWST
- **THEN** `TaxData` has `UseCode` `1` and `CollectiveInformation` has `TaxAccount` `2202`

#### Scenario: Untaxed revenue with an MWST-Code
- **WHEN** a booking has Single account `3600`, MWST-Code `400`, rate 0 and tax 0.00
- **THEN** `TaxData` has `TaxIncluded` `I`, `TaxRate` `0`, `TaxCode` `400`, `Amount` `0.00` and `KeyAmount` `0.00`, and no finding is raised

#### Scenario: Kurtaxe with a Ziffer-910 code
- **WHEN** a booking has Single account `2210`, MWST-Code `491`, rate 0 and tax 0.00
- **THEN** `TaxData` has `TaxIncluded` equal to `TAX_INCLUDED_AT_RATE_ZERO` (`I` by default), `TaxRate` `0`, `TaxCode` `491` and `KeyAmount` `0.00`, and a unit test with the constant set to `E` writes `E` and changes nothing else

#### Scenario: Rate-0 TaxAccount constant switched
- **WHEN** a unit test renders the Kurtaxe booking with MWST-Code `491` with `TAX_ACCOUNT_AT_RATE_ZERO` set to `zero`
- **THEN** its `CollectiveInformation` has `TaxAccount` `0` instead of `2200`, its `SingleInformation` keeps `TaxAccount` `2210`, and nothing else in the file changes

### Requirement: Number formats
Amounts SHALL be written with a decimal point, exactly two decimals, a leading minus for negative values and no thousands separator; rates SHALL be written with a decimal point and without trailing zeros (`8.1`, `3.8`, `2.6`, `0`). No amount SHALL be rounded to 5 Rappen.

#### Scenario: Rappen amounts
- **WHEN** a booking has gross 1234.55 and another gross 0.01
- **THEN** their amounts are written `1234.55` and `0.01`

#### Scenario: Rate format
- **WHEN** a booking has rate 8.1
- **THEN** `TaxRate` is `8.1`

### Requirement: Belegnummer
The writer SHALL number the bookings of one file in file order with `DocumentNumber` = the two-digit month and two-digit day of the period's first day followed by a 6-digit counter starting at `000001` (10 characters, the field length of Abacus), and SHALL write the same number into both blocks of the booking, so that no two bookings of a file share a number, files of one property that start on different days of the same calendar year never share one, and the same bookings always get the same numbers. The number carries no year (the 10 characters leave no room for one), so files that start on the same day of different years (2026-10-01 and 2027-10-01) share numbers; this is unique only if Abacus checks Belegnummern per Geschäftsjahr, which the first test import confirms (research open question 7).

#### Scenario: Numbers in a January file
- **WHEN** a file for 2027-01-01 to 2027-01-31 has 3 bookings
- **THEN** their numbers are `0101000001`, `0101000002` and `0101000003`

#### Scenario: Two daily files of one month
- **WHEN** the scheduler writes a daily file for 2026-10-14 with 40 bookings and one for 2026-10-15 with 35 bookings
- **THEN** the first file uses `1014000001` to `1014000040`, the second `1015000001` to `1015000035`, and no number occurs in both

### Requirement: File encoding and escaping
The file SHALL be UTF-8 without byte-order mark, SHALL end every line with LF, SHALL indent nested elements by two spaces per level, SHALL use single quotes for attribute values, and SHALL escape `&`, `<`, `>`, `'` and `"` in text content as `&amp;`, `&lt;`, `&gt;`, `&apos;` and `&quot;`.

#### Scenario: Umlauts and an ampersand
- **WHEN** a booking text is `Getränke & Frühstück <Bar>`
- **THEN** the element reads `<Text1>Getränke &amp; Frühstück &lt;Bar&gt;</Text1>`, `ä` and `ü` are written as UTF-8 bytes `C3 A4` and `C3 BC`, and the file starts with `<?xml` and no BOM

### Requirement: Booking validation
Before writing, the writer SHALL validate every booking and the file period and SHALL report all problems at once as findings with the booking number and field, and SHALL write nothing when any exists: `E-ABACUS-ACCOUNT` for an account that is not 1 to 11 digits, `E-ABACUS-SAME-ACCOUNT` for a booking whose Collective and Single accounts are equal, `E-ABACUS-AMOUNT` for a gross amount that is not above 0 or has more than 11 integer digits, `E-ABACUS-TAX` for a tax amount whose absolute value is not below the gross amount, `E-ABACUS-TAX-RATE` for a tax amount at a rate above 0 whose absolute value differs by more than one Rappen from `round(gross × rate / (100 + rate))` (each booking is one apaleo line rounded to the Rappen; with "MWST berechnen" off Abacus books the tax as written), `E-ABACUS-TAX-SIGN` for a tax amount that is not 0 and whose sign differs from the one `taxSign()` in `src/abacus/format.ts` gives for its `DebitCredit` (the validation SHALL call that function, never a sign rule of its own), `E-ABACUS-RATE` for a rate below 0, above 99.99 or with more than two decimals, `E-ABACUS-MWST-CODE` for an MWST-Code that is not 1 to 3 characters of `A-Z`, `a-z` and `0-9`, `E-ABACUS-KOST` for a Kostenstelle that is not 1 to 11 digits, `E-ABACUS-TEXT` for an empty `Text1` after sanitising, `E-ABACUS-DATE` for a business date outside the file period, `E-ABACUS-PERIOD` without a booking number for a period whose first or last day is not a valid date or whose first day is after its last, and `E-ABACUS-BELEGNR` for more than 999,999 bookings in one file.

#### Scenario: Several errors at once
- **WHEN** booking 2 has Collective account `11A1` and booking 5 has gross 0
- **THEN** rendering fails with one error carrying `E-ABACUS-ACCOUNT` for booking 2 and `E-ABACUS-AMOUNT` for booking 5, and no bytes are returned

#### Scenario: Wrong tax sign
- **WHEN** a booking with `DebitCredit` `D` has MWST and tax 7.60
- **THEN** `E-ABACUS-TAX-SIGN` names the booking

#### Scenario: Tax that does not fit the rate
- **WHEN** a booking has gross 207.60 at 3.8 % and tax −200.00, and another the same gross with tax −7.61
- **THEN** `E-ABACUS-TAX-RATE` names the first booking with the expected tax 7.60, and the second raises no finding

#### Scenario: Sign rule flipped after a test import
- **WHEN** a unit test replaces `taxSign()` by a rule that makes output tax positive and validates a booking with `DebitCredit` `D` and tax 7.60
- **THEN** no `E-ABACUS-TAX-SIGN` is raised, and the same booking with tax −7.60 raises it

#### Scenario: Reversed period
- **WHEN** the file period starts on 2026-11-01 and ends on 2026-10-31
- **THEN** rendering fails with one `E-ABACUS-PERIOD` finding without a booking number, and no booking is reported with `E-ABACUS-DATE`

### Requirement: Text sanitising
The writer SHALL replace tab, CR and LF in `Text1` and `Text2` with a space, remove other control characters and characters that XML 1.0 does not allow, collapse repeated spaces, trim, and cut each text to 80 characters, reporting `N-ABACUS-TRUNCATED` with the booking number.

#### Scenario: Line break in a text
- **WHEN** a booking text is `Zahlung\nVisa`
- **THEN** `Text1` is `Zahlung Visa`

#### Scenario: Long reference
- **WHEN** `Text2` is 95 characters long
- **THEN** the first 80 are written and `N-ABACUS-TRUNCATED` names the booking

### Requirement: Deterministic file name and content
The file name SHALL be `ABACUS_Buchungen_<YYYYMMDD>-<YYYYMMDD>_<propertyId>.xml` for the first and last day of the period, the file SHALL contain no creation time or other value that changes between runs, and an existing file SHALL count as unchanged exactly when its bytes equal the new bytes.

#### Scenario: File name
- **WHEN** property BSP is exported for 2026-10-01 to 2026-10-31
- **THEN** the file is named `ABACUS_Buchungen_20261001-20261031_BSP.xml`

#### Scenario: Same input twice
- **WHEN** the same bookings are rendered twice at different clock times
- **THEN** both results are byte-identical

### Requirement: Abacus target writer
The module SHALL export `abacusTarget`, a `TargetWriter<AbacusBooking>` that takes its settings from the `abacus` section and the property, whose file pattern matches only current `ABACUS_Buchungen_*.xml` files (not `.replaced-<timestamp>` files or protocols), whose currency is `abacus.leitwaehrung`, whose import block lists the file name, the number of bookings, the Abacus programs that import it (F11 Buchen or F5534 "Import/Export Buchungen AbaConnect" with import type "XML Buchungen"), the interface version, Mandant, Geschäftsbereich, Leitwährung, Abrechnungsart, every MWST-Code with its rates and the tax total, every pair "Abacus account -> MWST-Code" used on a Single account with `TaxData` (so that the Treuhänder can compare it with the default MWST-Code of that account in F21), the `TaxAccount` used, the values of the constants of the "MWST data" requirement, the range of Belegnummern and the advice to import with "MWST berechnen" as Abacus recommends, together with the warning that with this option Abacus may take the default MWST-Code of each account in F21 instead of the file's code, so every listed account must carry the listed code there, and whose refusal advice says to import only one of two overlapping files and, before re-importing, to delete the bookings of the old file in Abacus (in the Nebenjournal before they are transferred, or by reversing them).

#### Scenario: Import block
- **WHEN** the October file for 2026-10-01 to 2026-10-31 has 812 bookings for Mandant `1234`, Geschäftsbereich `0`, with MWST-Code `313` at 3.8 % on the Single accounts `3400` and `2030` and `311` at 8.1 % on `3200` and `3100`
- **THEN** the import block names the file, 812 bookings, F5534 with "XML Buchungen", version `2015.00`, Mandant `1234`, Leitwährung CHF, `vereinbart`, `313` 3.8 % and `311` 8.1 % with their tax totals, the pairs `3400 -> 313`, `2030 -> 313`, `3200 -> 311` and `3100 -> 311` of its bookings, `TaxAccount` `2200`, Belegnummern `1001000001` to `1001000812`, "MWST berechnen" and the F21 warning

#### Scenario: Currency
- **WHEN** `abacus.leitwaehrung` is `EUR`
- **THEN** `abacusTarget.currency` returns `EUR` and every `Currency` and `KeyCurrency` in the file is `EUR`

### Requirement: Golden-file regression tests
The test suite SHALL compare rendered files byte by byte with golden files in `test/golden/abacus/` covering revenue at 3.8 %, 8.1 % and 2.6 % (each with `AmountData/Amount` `0.00` and the signed tax in `KeyAmount`), untaxed revenue with and without an MWST-Code, an allowance, a payment, a Kurtaxe line without MWST, a Kurtaxe line with the Ziffer-910 code `491` at rate 0, a deposit with MWST, a write-off with MWST correction, a Kostenstelle, umlauts and escaped characters, a truncated text, a file with `vereinnahmt` and a file with interface version `2024.00`, and SHALL update them only with `UPDATE_GOLDEN=1`.

#### Scenario: Unintended change
- **WHEN** a code change alters one byte of the output
- **THEN** `pnpm test` fails and shows the differing line

