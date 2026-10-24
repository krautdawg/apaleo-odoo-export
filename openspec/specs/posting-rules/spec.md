# posting-rules Specification

## Purpose
The PMS-neutral posting rules that turn canonical ledger lines into DATEV bookings: the direction rule (VAT side in Gegenkonto), the per-line VAT consistency guard, the rate inference for untaxed deposit releases, skip rules, field filling without personal data, and the posting summary.
## Requirements
### Requirement: One booking per ledger line
The posting module SHALL turn every ledger line that is not skipped into exactly one Abacus Einzelbuchung whose business date is the line's business date and which carries the line's source entry number for traceability, and SHALL write no Sammelbuchung.

#### Scenario: Card payment
- **WHEN** a line debits the Visa payment account (mapped to `1090`) and credits a guest receivables account (mapped to `1101`) with gross 120.00 and no taxes
- **THEN** one booking is produced with Collective account `1090`, Single account `1101`, `DebitCredit` `D`, gross 120.00 and no MWST

#### Scenario: Every line traceable
- **WHEN** a period of 35 apaleo lines has 6 skipped lines
- **THEN** 29 bookings are produced and each names the source entry number of its line

### Requirement: Deposit release without taxes
When a line debits a Liabilities account and credits a Receivables account and carries no tax entries after normalisation, the posting module SHALL infer the VAT rate from the skipped `PostPrepaymentVat` line(s) of the same business date and reference, else from the chart VAT of the Liabilities account or its parent, SHALL use that rate for mapping resolution and the VAT guard, SHALL take the tax amount from those `PostPrepaymentVat` lines or, with a chart rate only, compute it as `round(|gross| × rate / (100 + rate))`, and SHALL raise `E-VAT-RATE-UNKNOWN` when no rate can be inferred. Any other untaxed line with exactly one Liabilities side (a deposit refunded or received without tax entries) SHALL take its rate and tax amount from a `PostPrepaymentVat` line of the same business date and reference that moves VAT in its direction, with the same amount check, and SHALL keep rate 0 only when there is no such line. A release booked with a chart rate SHALL always raise `W-VAT-INFERRED`, also at 0 %.

#### Scenario: Release with taxes
- **WHEN** a release line of 207.60 debits a per-reservation `_Liabilities` account and credits guest receivables with net 200.00 and taxes 7.60 at 3.8 %
- **THEN** the debit resolves to the 3.8 % Liabilities row and the booking has Collective account `1101`, Single account `2030`, `DebitCredit` `C`, gross 207.60 and tax 7.60, and no finding is raised

#### Scenario: Release without taxes plus a PostPrepaymentVat pair
- **WHEN** the release line of 207.60 has no `taxes[]`, and a `PostPrepaymentVat` line of the same day and reference carries 7.60 at 3.8 %
- **THEN** the release resolves to the 3.8 % Liabilities row with gross 207.60 and tax 7.60, the pair is skipped as `VAT_ACCOUNT_LINE`, and no `E-VAT-UNEXPECTED` is raised

#### Scenario: Release with a chart rate only
- **WHEN** a release line of 207.60 has no `taxes[]` and no matching `PostPrepaymentVat` line, and its Liabilities account (or its parent) carries 3.8 % in the chart
- **THEN** the release is booked on the 3.8 % deposit row with tax 7.60 and a warning `W-VAT-INFERRED` names the line and the chart account

#### Scenario: Release with no rate source
- **WHEN** a release line has no `taxes[]`, no matching `PostPrepaymentVat` line, and its account has no VAT in the chart
- **THEN** a finding `E-VAT-RATE-UNKNOWN` names the source entry number and the export is blocked

#### Scenario: Release with a chart rate of 0 %
- **WHEN** a release line has no `taxes[]` and no matching `PostPrepaymentVat` line, and its Liabilities account (or its parent) carries 0 % in the chart
- **THEN** the release is booked on the 0 % deposit row without MWST and a warning `W-VAT-INFERRED` names the line, the chart account and the 0 % rate

#### Scenario: Untaxed deposit refund with a PostPrepaymentVat line
- **WHEN** a refund of 103.80 debits a per-reservation `_Liabilities` account and credits a payment account without `taxes[]`, and a `PostPrepaymentVat` line of the same day and reference reverses 3.80 at 3.8 % (debit VAT on liabilities)
- **THEN** the refund resolves to the 3.8 % Liabilities row with gross 103.80 and tax 3.80 on `2030`, and no finding is raised; a mismatch of more than one Rappen between the pair and the computed tax raises `E-VAT-AMOUNT`

#### Scenario: Untaxed prepayment received with a PostPrepaymentVat line
- **WHEN** a prepayment of 103.80 credits a per-reservation `_Liabilities` account without `taxes[]`, and a `PostPrepaymentVat` line of the same day and reference books 3.80 at 3.8 % (credit VAT on liabilities)
- **THEN** the prepayment resolves to the 3.8 % Liabilities row with gross 103.80 and tax −3.80 and no finding is raised; without such a line it stays on the 0 % deposit row

### Requirement: Skipped lines are reported
The posting module SHALL skip, and list with reason, count and unsigned gross total (the sum of absolute gross amounts): lines touching apaleo Vat or VatOnLiabilities accounts (always, because Abacus books the MWST from the `TaxData` of the taxed line), lines with zero gross amount, and lines whose two sides map to the same Abacus account.

#### Scenario: Move between guest folios
- **WHEN** a `MoveLineItem` line moves 50.00 between two guest receivables accounts that both map to `1101`
- **THEN** no booking is produced and the summary lists one `SAME_ACCOUNT` line of 50.00

#### Scenario: VAT account lines are skipped
- **WHEN** a line touches a Vat or VatOnLiabilities account
- **THEN** no booking is produced, the summary lists it as `VAT_ACCOUNT_LINE` with its amount, and the Vat account does not need a mapping row

#### Scenario: Offset lines of payments
- **WHEN** the recorded VIE day 2026-10-21 is posted, whose five payments each have a second line `<folio>_Receivables → <folio>_Receivables/Offset` and whose AR transfer has a line `<res>_AccountsReceivable → <res>_AccountsReceivable/Offset`
- **THEN** the summary lists 6 `SAME_ACCOUNT` lines with an unsigned gross total of 312.60

### Requirement: Field filling without personal data
`Text1` SHALL be built from a German command label (Erlös, Zahlung, Anzahlung, Umbuchung, Forderung, Debitorenverlust, …) and an account label (for payments: the payment-method label, for example `Zahlung Visa`, never the label of the credited folio or Debitor account), SHALL use the parent account name or a fixed label (`Gästeforderung`, `Debitor`, `Anzahlung Gast`) instead of the leaf name for guest, booking and per-reservation accounts, and SHALL NOT contain guest names; `Text2` SHALL be the receipt number when `posting.text2` is `receipt` (the default) and a receipt number exists, otherwise the reference, and SHALL NOT contain guest names; the Kostenstelle (`BookingLevel1`) SHALL be taken only from the mapping row of the Single account and only when that row is of type Revenues or LossOfAccountsReceivable, and SHALL stay empty on every other booking (payments, Debitoren, deposit, Kurtaxe and clearing lines), because Abacus accepts a Kostenstelle only on Erfolgskonten.

#### Scenario: Payment without invoice
- **WHEN** a payment line has receipt type PspReference number `PSP123` and reference `BSP-ABCDEF-1`
- **THEN** `Text2` is `PSP123`

#### Scenario: Reference instead of receipt
- **WHEN** `posting.text2` is `reference` and an accommodation charge has receipt `BSP-2026-0042` and reference `BSP-ABCDEF-1`
- **THEN** `Text2` is `BSP-ABCDEF-1`

#### Scenario: Revenue line carries the Kostenstelle
- **WHEN** an accommodation charge credits a revenue account whose row has `kost` `10`
- **THEN** the booking has Single account `3400` and Kostenstelle `10`

#### Scenario: Payment line never carries a Kostenstelle
- **WHEN** a payment line debits `1090` and credits `1101`, and the rows of both accounts have a `kost` value
- **THEN** the booking has no Kostenstelle

#### Scenario: Payment crediting a named guest folio
- **WHEN** a payment line debits the Visa account and credits a guest folio account named `Müller, Hans` (type Receivables, not in the global ledger)
- **THEN** `Text1` is `Zahlung Visa` (the payment-method label, no guest name) and neither text contains `Müller`

### Requirement: VAT side in SingleInformation
The posting module SHALL place the account whose mapping row has an MWST-Code (the VAT side) in `SingleInformation` and the other account in `CollectiveInformation`, SHALL set `DebitCredit` to `D` when the Collective account is debited by the line and `C` when it is credited (sides taken from the line's debit and credit accounts, swapped for a negative gross), SHALL write the absolute gross amount, SHALL set the tax to apaleo's precise tax rounded half away from zero to Rappen, negative when the VAT side is credited and positive when it is debited, and SHALL take MWST-Code and rate from the VAT-side row. A line without a VAT side whose rows give exactly one side the type Revenues or LossOfAccountsReceivable SHALL be booked with that side in `SingleInformation`, so the Kostenstelle of an untaxed charge is written like that of its allowance. Any other line without a VAT side SHALL be booked with the debited account in `CollectiveInformation`, the credited account in `SingleInformation`, `DebitCredit` `D` and the absolute gross amount (sides swapped for a negative gross). A side whose row is of type Payments, Receivables or AccountsReceivable and has an MWST-Code SHALL NOT be booked; the line SHALL fail with `E-MWST-CODE-NOT-ALLOWED` naming the account and the mapping line.

#### Scenario: Accommodation charge at 3.8 %
- **WHEN** a line debits a guest receivables account (`1101`) and credits the accommodation 3.8 % revenue account (`3400`, MWST-Code `313`, rate 3.8) with gross 207.60, net 200.00 and taxes 7.60 at 3.8 %
- **THEN** the booking has Collective account `1101`, Single account `3400`, `DebitCredit` `D`, gross 207.60, tax −7.60, MWST-Code `313` and rate 3.8

#### Scenario: Allowance on accommodation
- **WHEN** a line debits the accommodation 3.8 % revenue account and credits the guest receivables account with gross 20.76, net 20.00 and taxes 0.76 at 3.8 %
- **THEN** the booking has Collective account `1101`, Single account `3400`, `DebitCredit` `C`, gross 20.76 and tax 0.76

#### Scenario: Negative charge
- **WHEN** a line debits guest receivables and credits the 3.8 % revenue account with gross −20.76 and taxes −0.76
- **THEN** the booking has `DebitCredit` `C`, gross 20.76 and tax 0.76, like the allowance

#### Scenario: Untaxed charge keeps its Kostenstelle
- **WHEN** a line debits guest receivables (`1101`) and credits the 0 % revenue account mapped to `3600` without MWST-Code and with `kost` `10`, gross 45.00
- **THEN** the booking has Collective account `1101`, Single account `3600`, `DebitCredit` `D`, gross 45.00, no MWST and Kostenstelle `10`, and its allowance has the same accounts with `DebitCredit` `C` and Kostenstelle `10`

#### Scenario: MWST-Code on the receivables side
- **WHEN** the Receivables row maps to `1101` with MWST-Code `313` and rate 3.8 and the revenue row has no MWST-Code
- **THEN** the line is not booked and fails with `E-MWST-CODE-NOT-ALLOWED` naming the account and the mapping line

#### Scenario: Refund without VAT side
- **WHEN** a payment line debits `1090` and credits `1101` with gross −20.00 (a refund)
- **THEN** the booking has Collective account `1101`, Single account `1090`, `DebitCredit` `D` and gross 20.00

#### Scenario: Untaxed revenue with an MWST-Code at rate 0
- **WHEN** a line debits `1101` and credits a revenue account mapped to `3600` with MWST-Code `400` at rate 0, with gross 80.00 and no taxes
- **THEN** the booking has Single account `3600`, gross 80.00, tax 0.00, MWST-Code `400`, rate 0, and no `E-VAT-UNEXPECTED` is raised

#### Scenario: Two VAT sides
- **WHEN** both mapped accounts of a line carry an MWST-Code
- **THEN** a finding `E-TWO-VAT-SIDES` names the source entry number and both accounts, and no booking is produced for the line

### Requirement: Tax guard for Abacus bookings
For every booked line the posting module SHALL first normalise `taxes[]` by dropping entries with percent 0 and amount 0, and SHALL then ensure that the VAT-side row's `mwst_percent` equals apaleo's tax percent, that apaleo's precise net plus taxes equals its gross within half a Rappen (checked on the precise values, never again on separately rounded Rappen), that Abacus' check value for an inclusive amount `round(|gross| × rate / (100 + rate))` differs from the absolute tax of the booking by at most one Rappen, and that the signs of tax and gross agree. The tax of a booking SHALL be apaleo's precise tax rounded half away from zero to Rappen, so that the MWST in Abacus equals apaleo's per-line tax and the gross equals apaleo's gross. A VAT-side row with an MWST-Code at rate 0 SHALL be accepted for a line without tax and SHALL book tax 0. A one-Rappen difference SHALL be a warning `W-VAT-ROUNDING` (the booking still carries apaleo's tax); larger differences (`E-VAT-AMOUNT`), rate mismatches (`E-VAT-RATE`), taxed lines without a VAT side (`E-VAT-MISSING`), untaxed lines with a VAT side above 0 % (`E-VAT-UNEXPECTED`), and lines with several tax rates (`E-VAT-MIXED`) SHALL be errors that name the source entry number and the mapping row to fix. Sub-Rappen digits of apaleo's precise tax SHALL never cause a finding on a line, and no amount SHALL be rounded to 5 Rappen.

#### Scenario: Minibar at 8.1 %
- **WHEN** a line credits the other-revenue account (`3500`, MWST-Code `311`, rate 8.1) with gross 10.81, net 10.00 and taxes 0.81 at 8.1 %
- **THEN** the booking carries gross 10.81 and tax −0.81, no finding is raised, and the summary shows 10.81 gross revenue at 8.1 %

#### Scenario: Zero-rate tax entry
- **WHEN** a Kurtaxe line has `taxes[]` with one entry of type `Without`, percent 0, amount 0.00, and credits an account mapped without MWST-Code
- **THEN** the entry is dropped by normalisation and no `E-VAT-MISSING` is raised

#### Scenario: Wrong rate in mapping
- **WHEN** an apaleo line taxed at 3.8 % credits an account mapped to MWST-Code `311` at 8.1 %
- **THEN** a finding `E-VAT-RATE` is raised and the export is blocked

#### Scenario: Taxed line on an untaxed Abacus account
- **WHEN** an apaleo line with 7.60 tax credits an account mapped without MWST-Code
- **THEN** a finding `E-VAT-MISSING` is raised

#### Scenario: One-Rappen rounding
- **WHEN** `round(|gross| × rate / (100 + rate))` differs by one Rappen from apaleo's rounded tax
- **THEN** a warning `W-VAT-ROUNDING` is raised, the booking carries apaleo's tax, and the difference is added to the rounding total in the summary

#### Scenario: Precise tax from apaleo
- **WHEN** a line credits the 3.8 % accommodation account with gross 95.00, net 91.52215800 and tax 3.47784200 at 3.8 %
- **THEN** the booking carries gross 95.00 and tax −3.48, and no finding is raised

#### Scenario: Net and tax do not add up
- **WHEN** apaleo returns a line with gross 207.60, net 200.00 and taxes 7.00 at 3.8 %
- **THEN** reading fails with the adapter's half-cent check, naming the source entry number and the three amounts, and no file is written

### Requirement: Posting summary for Abacus
The posting module SHALL return a summary with Soll, Haben and balance per Abacus account (from the target's movement model: the Collective account moves by the gross amount, the Single account by the gross amount minus the tax), revenue per MWST-Code and rate with net, tax and gross as passed to Abacus and apaleo's precise VAT on the same lines (summed exactly) with the difference, deposit tax per MWST-Code and rate the same way, Kurtaxe and other levies, payments per clearing account, deposits received, released and, of the released, refunded, classified by side and sign, the net movement on accounts receivable, written-off receivables per rate, skipped lines per reason with count and unsigned gross, the rounding total, and findings grouped by code.

#### Scenario: Summary of the recorded VIE day
- **WHEN** the recorded VIE responses of 2026-10-21 are posted with the committed Abacus live mapping `test/fixtures/apaleo/live/VIE/mapping-VIE.abacus.csv`
- **THEN** revenue gross is 85.20 at 10 %, 410.02 at 13 %, 47.38 at 20 % and 45.00 at 0 %; revenue tax is 7.74 against apaleo 7.75 (precise 7.74545454) at 10 %, 47.17 against 47.17 at 13 % and 7.89 against 7.90 at 20 %; deposit tax is 20.25 at 13 % and 3.33 at 20 %; payments are 111.70 cash and 576.90 non-cash; deposits received 491.00, released 295.00, of it refunded 10.00; accounts receivable 95.00

### Requirement: Kurtaxe and guest levies
Lines on CityTaxes, SecondCityTax and GuestLevies accounts SHALL be booked through their mapping rows like any other line, so that a guest-owed Kurtaxe or Gästetaxe mapped to a liability (durchlaufender Posten) without MWST-Code is booked without `TaxData`, one mapped with an MWST-Code at rate 0 (for example a code for Ziffer 910) is booked with tax 0.00, and a levy that apaleo taxes (a hotel-owed Beherbergungsabgabe, or a Kurtaxe that is not invoiced separately) is booked on its row with the matching MWST-Code and rate; the VAT guard SHALL apply to all of them, and the posting module SHALL NOT change the tax apaleo charged. The summary SHALL show the levy total per Abacus account and whether it was booked with or without MWST.

#### Scenario: Guest-owed Kurtaxe
- **WHEN** a line debits guest receivables (`1101`) and credits the city-tax account mapped to `2210` without MWST-Code with gross 4.20 and a `Without` tax entry of 0 % and 0.00
- **THEN** the booking has Collective account `1101`, Single account `2210`, `DebitCredit` `D`, gross 4.20 and no `TaxData`, and the summary shows 4.20 Kurtaxe on `2210` without MWST

#### Scenario: Kurtaxe with a Ziffer-910 code
- **WHEN** the city-tax row maps to `2210` with MWST-Code `491` at rate 0 and a line credits it with gross 4.20 and no taxes
- **THEN** the booking has `TaxData` with `TaxCode` `491`, rate 0 and tax 0.00, and no `E-VAT-UNEXPECTED` is raised

#### Scenario: Taxed Beherbergungsabgabe
- **WHEN** a line credits a GuestLevies account mapped to `3400` with MWST-Code `313` at 3.8 %, with gross 2.08, net 2.00 and taxes 0.08 at 3.8 %
- **THEN** the booking has Single account `3400`, gross 2.08, tax −0.08 and MWST-Code `313`, and the summary counts it as a levy booked with MWST

#### Scenario: Taxed levy on an untaxed row
- **WHEN** a line with taxes 0.08 at 3.8 % credits a city-tax account mapped without MWST-Code
- **THEN** `E-VAT-MISSING` is raised and names the mapping row

### Requirement: Deposits and accounts receivable in Abacus
Prepayment lines (`PostPrepayment`) SHALL be booked to the mapped deposit account with the MWST of their rate, because an Anzahlung is taxed when it is received under both Abrechnungsarten (MWSTG Art. 40 Abs. 1 Bst. c and Abs. 2), and accounts-receivable lines (`PostToAccountsReceivables`) to the mapped Sachkonto, both under the VAT guard. A Liabilities side SHALL count as a deposit increase when it is credited with a positive amount or debited with a negative amount, and as a decrease otherwise; a decrease whose other side is a Payments account is a refund. This covers apaleo's real shapes: a release as `PostCharge` debit guest receivables, credit `<reservation>_Liabilities/<rate>` with negative gross and negative taxes, a refund as `PostPrepayment` with negative gross, and an overpayment parked on the 0 % deposit as `PostCharge` credit `<reservation>_Liabilities/Null:0.00` with positive gross. In the written file `abacus.abrechnungsart` SHALL change only `UseCode` and the Collective `TaxAccount`, never which lines are booked, their accounts, amounts or tax; what Abacus then does with the tax of a `vereinnahmt` booking is covered by "Vereinnahmte Entgelte".

#### Scenario: Prepayment at 3.8 %
- **WHEN** a line debits the Twint payment account (`1090`) and credits the guest liabilities 3.8 % account mapped to `2030` with MWST-Code `313` and rate 3.8, with gross 311.40, net 300.00 and taxes 11.40 at 3.8 %
- **THEN** the booking has Collective account `1090`, Single account `2030`, `DebitCredit` `D`, gross 311.40, tax −11.40 and MWST-Code `313`, and the summary shows 311.40 deposits received and 11.40 deposit tax at 3.8 %

#### Scenario: Same deposit with vereinnahmte Entgelte
- **WHEN** the same line is exported with `abacus.abrechnungsart: vereinnahmt`
- **THEN** the booking's accounts, gross and tax are unchanged, the file has `UseCode` `1` and the Collective `TaxAccount` `abacus.mwstHilfskonto`, and the export reports `W-ABRECHNUNGSART-VEREINNAHMT`

#### Scenario: Release as a negative charge
- **WHEN** a `PostCharge` line debits `ENG-ALPHA-1_Receivables` and credits `ENG-ALPHA-1_Liabilities/Special:3.80` (3.8 % wildcard, `2030`, MWST-Code `313`) with gross −207.60 and tax −7.60 at 3.8 %
- **THEN** the booking has Collective account `1101`, Single account `2030`, `DebitCredit` `C`, gross 207.60 and tax 7.60, and the summary counts 207.60 as released, not as received

#### Scenario: Refund of a deposit
- **WHEN** a `PostPrepayment` line debits the Twint payment account and credits `ENG-ALPHA-1_Liabilities/Special:3.80` with gross −103.80 and tax −3.80
- **THEN** the booking has Collective account `1090`, Single account `2030`, `DebitCredit` `C`, gross 103.80 and tax 3.80, and the summary counts 103.80 as released and, of the released, as refunded

#### Scenario: Overpayment parked on the 0 % deposit
- **WHEN** a `PostCharge` line debits `ENG-ALPHA-1_Receivables` and credits `ENG-ALPHA-1_Liabilities/Null:0.00` (0 % wildcard, `2039`) with gross 10.00 and no taxes
- **THEN** the booking has Collective account `1101`, Single account `2039`, `DebitCredit` `D`, gross 10.00, no `TaxData`, and the summary counts 10.00 as received

#### Scenario: Check-out on accounts receivable
- **WHEN** a line debits the AccountsReceivable account (mapped to `1102`) and credits guest receivables (`1101`) with gross 208.46 and receipt type Invoice number `ENG-2026-0815`
- **THEN** the booking has Collective account `1102`, Single account `1101`, `DebitCredit` `D`, gross 208.46 and `Text2` `ENG-2026-0815`

### Requirement: Vereinnahmte Entgelte
With `abacus.abrechnungsart: vereinnahmt`, `doctor` and every export (dry run included, once per property and month: once in that month's console output and once in its protocol, so every protocol a Treuhänder receives carries it) SHALL warn `W-ABRECHNUNGSART-VEREINNAHMT`, explaining that Abacus books the output tax of these bookings to the Hilfskonto (`abacus.mwstHilfskonto`) and moves it to the Steuerkonto only when a payment is recorded, normally in the Debitorenbuchhaltung, which this tool does not feed; that the file books the tax on the charge date while it legally arises at payment (MWSTG Art. 40 Abs. 2), which matters for charges on accounts receivable that are unpaid at period end; and that the Treuhänder must correct the Hilfskonto at period end as `docs/mapping-guide.md` describes, until a test import shows how Abacus treats FIBU-only bookings with `UseCode` `1` (research §9 open question 15). The warning SHALL NOT change the exit code, and `vereinbart` SHALL raise no such warning.

#### Scenario: Doctor with vereinnahmte Entgelte
- **WHEN** the config sets `abacus.abrechnungsart: vereinnahmt` and the user runs `doctor`
- **THEN** `doctor` warns `W-ABRECHNUNGSART-VEREINNAHMT` naming the Hilfskonto `2202` and `docs/mapping-guide.md`, and exits with code 0 if nothing else fails

#### Scenario: Export with vereinnahmte Entgelte
- **WHEN** the Swiss fixture month is exported with `abacus.abrechnungsart: vereinnahmt`
- **THEN** the summary and the protocol show `W-ABRECHNUNGSART-VEREINNAHMT` once, the file is written, and the exit code is 0

#### Scenario: Export of several months with vereinnahmte Entgelte
- **WHEN** June to August 2026 are exported for the Swiss fixture property with `abacus.abrechnungsart: vereinnahmt`, as a dry run and as a real run
- **THEN** the console shows `W-ABRECHNUNGSART-VEREINNAHMT` once per property and month (three times), and the written August protocol shows it once

#### Scenario: Default Abrechnungsart
- **WHEN** `abacus.abrechnungsart` is not set
- **THEN** no `W-ABRECHNUNGSART-VEREINNAHMT` is raised

### Requirement: Bad debt with MWST correction
Lines that debit a LossOfAccountsReceivable account SHALL be booked through its mapping row: with tax entries, the write-off row SHALL carry the MWST-Code of the line's rate, so that the booking has the write-off account as Single account (debited, `DebitCredit` `C`), the gross amount and a positive tax that reduces the Umsatzsteuer (Entgeltsminderung, MWSTG Art. 41); without tax entries the row SHALL have no MWST-Code and the line is booked without `TaxData`. The posting summary SHALL show the total of written-off receivables per rate.

#### Scenario: Write-off with MWST correction
- **WHEN** a line debits a per-reservation LossOfAccountsReceivable account at 3.8 % (resolved through the wildcard to `3805`, MWST-Code `313`, rate 3.8) and credits guest receivables (`1101`) with gross 103.80, net 100.00 and taxes 3.80 at 3.8 %
- **THEN** the booking has Collective account `1101`, Single account `3805`, `DebitCredit` `C`, gross 103.80, tax 3.80 and MWST-Code `313`, and the summary shows 103.80 written off at 3.8 %

#### Scenario: Write-off without MWST
- **WHEN** a write-off line of 30.00 has no tax entries and debits an account mapped to `3808` without MWST-Code
- **THEN** the booking has Collective account `1101`, Single account `3808`, `DebitCredit` `C`, gross 30.00 and no `TaxData`

### Requirement: Annullationen and no-show payments
Annullation and no-show payments SHALL be booked through their revenue mapping rows like other revenue, with the rate apaleo charged and under the VAT guard; the posting module SHALL NOT change their tax. Without tax they SHALL be booked without `TaxData`, as Schadenersatz (ESTV MBI 08 Ziff. 8.7).

#### Scenario: Untaxed Annullation
- **WHEN** a line credits `RevenueCancellationFees_Without:0.00` mapped to `3680` without MWST-Code with gross 80.00 and no taxes
- **THEN** the booking has Collective account `1101`, Single account `3680`, `DebitCredit` `D`, gross 80.00 and no `TaxData`

#### Scenario: Taxed no-show on an untaxed row
- **WHEN** a no-show line with taxes 3.80 at 3.8 % credits an account mapped without MWST-Code
- **THEN** `E-VAT-MISSING` is raised and names the mapping row

### Requirement: Swiss fixture month
The test suite SHALL post a fabricated Swiss fixture month in CHF (property `ENG`, `Europe/Zurich`, August 2026, in `test/fixtures/apaleo/ch-month/` with a README naming every line), shaped like apaleo's recorded real data (eight-decimal net and tax, per-reservation accounts with `parentNumber`, `/Offset` second lines, releases as negative charges with `taxes[]`, no `PostPrepaymentVat`), covering rooms with breakfast at 3.8 %, a Halbpension package invoiced as a whole at 3.8 %, restaurant, drinks and minibar at 8.1 %, take-away food at 2.6 %, Kurtaxe without MWST, a deposit received at 3.8 %, released at check-out and partly refunded, an Annullation at 0 %, Twint, card, cash and invoice payments, an invoice on accounts receivable and a write-off with MWST correction, with the KMU hotel template mapping (default MWST-Codes, the Kurtaxe row filled in as a Treuhänder would) and `abacus.leitwaehrung: CHF`, and SHALL compare every summary value and every booking with hand-computed values recorded in the test, and the rendered file with a golden file.

#### Scenario: Totals of the Swiss month
- **WHEN** `test/posting/fixture-month-ch.test.ts` runs
- **THEN** revenue per MWST-Code and rate, tax per rate, Kurtaxe, deposits received, released and refunded, payments per clearing account, write-offs and the balance per Abacus account equal the recorded constants, every taxed booking carries `311` at 8.1 %, `312` at 2.6 % or `313` at 3.8 %, every amount is in whole Rappen without 5-Rappen rounding, and no `E-` finding is raised

#### Scenario: Golden file of the Swiss month
- **WHEN** the Swiss month is rendered with `abacusTarget`
- **THEN** the bytes equal `test/golden/abacus/ch-month.xml`, with `Currency` and `KeyCurrency` `CHF` in every booking

