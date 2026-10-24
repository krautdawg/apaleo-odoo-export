# posting-rules Specification

## Purpose
The PMS-neutral posting rules that turn canonical ledger lines into DATEV bookings: the direction rule (VAT side in Gegenkonto), the per-line VAT consistency guard, the rate inference for untaxed deposit releases, skip rules, field filling without personal data, and the posting summary.
## Requirements
### Requirement: One booking per ledger line
The posting module SHALL turn every ledger line that is not skipped into exactly one `OdooBooking` whose business date is the line's business date and which carries the line's source entry number for traceability; the Odoo writer then nets the bookings of a day into one journal entry (see the `odoo-journal-writer` capability).

#### Scenario: Card payment
- **WHEN** a line debits the Visa payment account (mapped to `1360`) and credits a guest receivables account (mapped to `1410`) with gross 120.00 and no taxes
- **THEN** one booking is produced with debit account `1360` labelled `Zahlung Visa`, credit account `1410` labelled `Gästeforderungen`, gross 120.00 and no VAT side

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
The posting module SHALL skip, and list with reason, count and unsigned gross total (the sum of absolute gross amounts): lines touching apaleo Vat or VatOnLiabilities accounts (always, because Odoo creates the tax lines from the taxes of the base lines), lines with zero gross amount, and lines whose two sides map to the same Odoo account.

#### Scenario: Move between guest folios
- **WHEN** a `MoveLineItem` line moves 50.00 between two guest receivables accounts that both map to `1410`
- **THEN** no booking is produced and the summary lists one `SAME_ACCOUNT` line of 50.00

#### Scenario: VAT account lines are skipped
- **WHEN** a line touches a Vat or VatOnLiabilities account
- **THEN** no booking is produced, the summary lists it as `VAT_ACCOUNT_LINE` with its amount, and the Vat account does not need a mapping row

#### Scenario: Offset lines of payments
- **WHEN** the recorded BER day 2026-10-21 is posted with the committed Odoo live mapping
- **THEN** every `<folio>_Receivables → <folio>_Receivables/Offset` and `<res>_AccountsReceivable → <res>_AccountsReceivable/Offset` line is listed as `SAME_ACCOUNT`

### Requirement: Field filling without personal data
Every booking side SHALL carry a label in German as used in Germany built from the account type, the apaleo account group and the rate (`Erlöse Beherbergung 7 %`, `Erlöse Speisen 7 %`, `Erlöse Getränke 19 %`, `Erlöse sonstige 19 %`, `Erlöse ohne USt`, `Zahlung <payment method>` with English method names translated or kept as brand names, `Gästeforderungen`, `Forderungen Firmenrechnungen`, `Anzahlungen 7 %`, `Kurtaxe`, `Forderungsverluste 19 %`), SHALL use the parent account name or a fixed label instead of the leaf name for guest, booking and per-reservation accounts, and SHALL NOT contain guest names; the label of an account SHALL NOT depend on the line, so the writer can net all lines of an account. The receipt number (with `posting.text2` `receipt`, the default, when one exists) or else the reference SHALL be kept on the booking for the protocol and SHALL NOT be written to the Odoo file.

#### Scenario: Payment crediting a named guest folio
- **WHEN** a payment line debits the Visa account and credits a guest folio account named `Müller, Hans` (type Receivables, not in the global ledger)
- **THEN** the labels are `Zahlung Visa` and `Gästeforderungen`, and no label or protocol line contains `Müller`

#### Scenario: Receipt kept for the protocol
- **WHEN** a payment line has receipt type PspReference number `PSP123` and reference `BSP-ABCDEF-1`
- **THEN** the booking keeps `PSP123` for the protocol and the Odoo file does not contain it

#### Scenario: Payment without invoice
- **WHEN** a payment line has receipt type PspReference number `PSP123`, reference `BSP-ABCDEF-1` and no invoice
- **THEN** the booking keeps `PSP123` as its receipt for the protocol

#### Scenario: Reference instead of receipt
- **WHEN** `posting.text2` is `reference` and an accommodation charge has receipt `BSP-2026-0042` and reference `BSP-ABCDEF-1`
- **THEN** the booking keeps `BSP-ABCDEF-1` for the protocol

#### Scenario: Revenue line carries the Kostenstelle
- **WHEN** a mapping file has a `kost` column next to the Odoo columns
- **THEN** loading warns `W-UNKNOWN-COLUMN` and ignores the column, and no booking carries a Kostenstelle: the Odoo file has no analytic column

#### Scenario: Payment line never carries a Kostenstelle
- **WHEN** a payment line debits the cash account and credits a guest folio
- **THEN** the booking has no Kostenstelle and its Odoo lines carry no analytic distribution

### Requirement: VAT side of an Odoo booking
The posting module SHALL treat the side whose mapping row has an `odoo_tax` as the VAT side and SHALL give the booking that tax, the row's `tax_percent`, the absolute gross amount and apaleo's precise tax rounded half away from zero to cents (absolute); the VAT side's account moves by the gross minus that tax, the other side by the gross. The debit and credit accounts SHALL be the line's debit and credit accounts, swapped for a negative gross. A line without a VAT side SHALL be booked with both sides at the gross. A side whose row is of type Payments, Receivables or AccountsReceivable and has a tax SHALL NOT be booked; the line SHALL fail with `E-TAX-NOT-ALLOWED` naming the account and the mapping line. Two VAT sides SHALL fail with `E-TWO-VAT-SIDES`.

#### Scenario: Accommodation charge at 7 %
- **WHEN** a line debits a guest receivables account (`1410`) and credits the accommodation 7 % revenue account (`8300`, `tax_ust_7_skr03`, 7) with gross 120.00, net 112.14953271 and taxes 7.85046729 at 7 %
- **THEN** the booking has debit `1410`, credit `8300`, gross 120.00, VAT side credit with tax `tax_ust_7_skr03`, rate 7 and apaleo tax 7.85

#### Scenario: Allowance on accommodation
- **WHEN** a line debits the accommodation 7 % revenue account and credits the guest receivables account with gross 20.00 and taxes 1.31 at 7 %
- **THEN** the booking has debit `8300`, credit `1410`, gross 20.00, VAT side debit and apaleo tax 1.31

#### Scenario: Negative charge
- **WHEN** a line debits guest receivables and credits the 7 % revenue account with gross −20.00 and taxes −1.31
- **THEN** the booking has debit `8300`, credit `1410`, gross 20.00 and apaleo tax 1.31, like the allowance

#### Scenario: Refund without VAT side
- **WHEN** a payment line debits `1360` and credits `1410` with gross −20.00 (a refund)
- **THEN** the booking has debit `1410`, credit `1360` and gross 20.00

#### Scenario: Tax on the receivables side
- **WHEN** the Receivables row maps to `1410` with `tax_ust_7_skr03` and rate 7 and the revenue row has no tax
- **THEN** the line is not booked and fails with `E-TAX-NOT-ALLOWED` naming the account and the mapping line

#### Scenario: Two VAT sides
- **WHEN** both mapped accounts of a line carry a tax
- **THEN** a finding `E-TWO-VAT-SIDES` names the source entry number and both accounts, and no booking is produced for the line

### Requirement: Tax guard for Odoo bookings
For every booked line the posting module SHALL first normalise `taxes[]` by dropping entries with percent 0 and amount 0, and SHALL then ensure that the VAT-side row's `tax_percent` equals apaleo's tax percent (`E-VAT-RATE`), that apaleo's precise net plus taxes equals its gross within half a cent (checked on the precise values), and that the signs of tax and gross agree (`E-VAT-SIGN`). A VAT-side row with a tax at rate 0 SHALL be accepted for a line without tax and SHALL book tax 0. Taxed lines without a VAT side (`E-VAT-MISSING`), untaxed lines with a VAT side above 0 % (`E-VAT-UNEXPECTED`) and lines with several tax rates (`E-VAT-MIXED`) SHALL be errors that name the source entry number and the mapping row to fix. The posting module SHALL NOT change the rate apaleo charged; the cent differences between Odoo's VAT and apaleo's VAT come only from Odoo's own rounding and are reported by the writer's fitting.

#### Scenario: Minibar at 19 %
- **WHEN** a line credits the other-revenue account (`8400`, `tax_ust_19_skr03`, 19) with gross 11.90, net 10.00 and taxes 1.90 at 19 %
- **THEN** the booking carries gross 11.90 and apaleo tax 1.90, no finding is raised, and the summary shows 11.90 gross revenue at 19 %

#### Scenario: Zero-rate tax entry
- **WHEN** a city-tax line has `taxes[]` with one entry of type `Without`, percent 0, amount 0.00, and credits an account mapped without tax
- **THEN** the entry is dropped by normalisation and no `E-VAT-MISSING` is raised

#### Scenario: Wrong rate in mapping
- **WHEN** an apaleo line taxed at 7 % credits an account mapped to `tax_ust_19_skr03` at 19
- **THEN** a finding `E-VAT-RATE` is raised and the export is blocked

#### Scenario: Taxed line on an untaxed account
- **WHEN** an apaleo line with 7.85 tax credits an account mapped without tax
- **THEN** a finding `E-VAT-MISSING` is raised

#### Scenario: Net and tax do not add up
- **WHEN** apaleo returns a line with gross 120.00, net 112.15 and taxes 7.00 at 7 %
- **THEN** reading fails with the adapter's half-cent check, naming the source entry number and the three amounts, and no file is written

### Requirement: Posting summary for Odoo
The posting module and the writer SHALL return a summary with Soll, Haben and balance per Odoo account (from the bookings' movement model), revenue per Odoo tax and rate with the Kennzahl, labelled as apaleo's figures before the base fitting (the gross, the net as the gross minus apaleo's tax rounded per line, apaleo's tax rounded per line, apaleo's precise tax summed exactly and rounded once, and the difference per line minus precise), deposit tax per tax and rate the same way, per Odoo tax the base as written in the file and Odoo's modelled VAT against apaleo's tax rounded per line with the difference Odoo minus apaleo (in the target's import block, which is the figure to compare with Odoo), the totals per account labelled as before the base fitting, levies, payments per clearing account, deposits received, released and, of the released, refunded, the net movement on accounts receivable, written-off receivables per rate, skipped lines per reason with count and unsigned gross, the number of entries, lines and rounding lines, and findings grouped by code.

#### Scenario: Summary of the recorded BER day
- **WHEN** the recorded BER responses of 2026-10-21 are posted and rendered with the committed Odoo live mapping `test/fixtures/apaleo/live/BER/mapping-BER.odoo.csv` and `odoo.taxRounding: per_line`
- **THEN** the summary shows revenue gross, Odoo VAT and apaleo VAT per rate (7 % Kz 86, 19 % Kz 81, 0 %) equal to the constants recorded in the test, deposits received, released and refunded, payments per clearing account, and one entry for the day

### Requirement: German fixture month
The test suite SHALL post a fabricated German fixture month in EUR (property `BSP` "Hotel Beispiel Berlin", `Europe/Berlin`, September 2026, in `test/fixtures/apaleo/de-month/` with a README naming every line), shaped like apaleo's recorded real data (eight-decimal net and tax, per-reservation accounts with `parentNumber`, `/Offset` second lines, releases as negative charges with `taxes[]`, no `PostPrepaymentVat`), covering lodging and breakfast at 7 %, drinks and minibar at 19 %, a deposit received at 7 %, released at check-out and partly refunded, an untaxed revenue line, a cancellation fee at 7 %, card, cash and invoice payments and an invoice on accounts receivable, with gross amounts chosen so that both rounding modes need at least one rounding cent, posted with the SKR03 template mapping, and SHALL compare every summary value, every entry line and Odoo's modelled VAT with hand-computed values recorded in the test, and the rendered file with golden files for `per_line` and `per_tax`.

#### Scenario: Totals of the German month
- **WHEN** `test/posting/fixture-month-de.test.ts` runs
- **THEN** revenue per tax and rate, Odoo's and apaleo's VAT per rate, deposits received, released and refunded, payments per clearing account and the balance per Odoo account equal the recorded constants, every taxed line carries `account.1_tax_ust_7_skr03` or `account.1_tax_ust_19_skr03`, and no `E-` finding is raised

#### Scenario: Golden files of the German month
- **WHEN** the month is rendered with `odooTarget` once with `per_line` and once with `per_tax`
- **THEN** the bytes equal `test/golden/odoo/de-month.per-line.csv` and `test/golden/odoo/de-month.per-tax.csv`, and every entry of both balances with the modelled tax

### Requirement: Kurtaxe and guest levies in Odoo
Lines on CityTaxes, SecondCityTax and GuestLevies accounts SHALL be booked through their mapping rows like any other line, so that a guest-owed Kurtaxe or Kurbeitrag mapped to a durchlaufender Posten (`1590` / `1370`) without tax is booked without tax, and a levy that apaleo taxes (a hotel-owed Übernachtung- or Beherbergungsteuer passed on to the guest) is booked on its row with the matching Odoo tax and rate; the VAT guard SHALL apply to all of them, and the posting module SHALL NOT change the tax apaleo charged. The summary SHALL show the levy total per Odoo account and whether it was booked with or without tax.

#### Scenario: Guest-owed Kurtaxe
- **WHEN** a line debits guest receivables (`1410`) and credits the city-tax account mapped to `1590` without tax with gross 5.00 and a `Without` tax entry of 0 % and 0.00
- **THEN** the booking has debit `1410`, credit `1590` labelled `Kurtaxe`, gross 5.00 and no VAT side, the entry line on `1590` has an empty tax cell, and the summary shows 5.00 Kurtaxe on `1590` without tax

#### Scenario: Hotel-owed Übernachtungsteuer
- **WHEN** a line credits a CityTaxes account mapped to `8300` with `tax_ust_7_skr03` at 7, with gross 10.70, net 10.00 and taxes 0.70 at 7 %
- **THEN** the booking has the VAT side credit on `8300` with apaleo tax 0.70, the entry line is credit 10.00 with `account.1_tax_ust_7_skr03`, and the summary counts it as a levy booked with tax

#### Scenario: Taxed levy on an untaxed row
- **WHEN** a line with taxes 0.70 at 7 % credits a city-tax account mapped without tax
- **THEN** `E-VAT-MISSING` is raised and names the mapping row

### Requirement: Deposits and accounts receivable in Odoo
Prepayment lines (`PostPrepayment`) SHALL be booked to the mapped deposit account with the Odoo tax of their rate, because a deposit is taxed when it is received (§ 13 Abs. 1 Nr. 1 Buchst. a Satz 4 UStG), and accounts-receivable lines (`PostToAccountsReceivables`) to the mapped receivables account, both under the VAT guard. A Liabilities side SHALL count as a deposit increase when it is credited with a positive amount or debited with a negative amount, and as a decrease otherwise; a decrease whose other side is a Payments account is a refund. In the Odoo entry an increase is a credit (invoice side, raises the Kennzahl) and a decrease a debit (refund side, lowers it). This covers apaleo's real shapes: a release as `PostCharge` debit guest receivables, credit `<reservation>_Liabilities/<rate>` with negative gross and negative taxes, a refund as `PostPrepayment` with negative gross, and an overpayment parked on the 0 % deposit as `PostCharge` credit `<reservation>_Liabilities/Null:0.00` with positive gross.

#### Scenario: Prepayment at 7 %
- **WHEN** a line debits the Visa payment account (`1360`) and credits the guest liabilities 7 % account mapped to `1711` with `tax_ust_7_skr03` and 7, with gross 214.00, net 200.00 and taxes 14.00 at 7 %
- **THEN** the booking has debit `1360`, credit `1711` with the VAT side credit and apaleo tax 14.00, the entry has `1711` credit 200.00 with `account.1_tax_ust_7_skr03` (Odoo adds 14.00 on `1771`), and the summary shows 214.00 deposits received and 14.00 deposit tax at 7 % Kz 86

#### Scenario: Release as a negative charge
- **WHEN** a `PostCharge` line debits `BSP-ALPHA-1_Receivables` and credits `BSP-ALPHA-1_Liabilities/Reduced:7.00` (7 % wildcard, `1711`) with gross −214.00 and tax −14.00 at 7 %
- **THEN** the booking has debit `1711`, credit `1410`, gross 214.00 and apaleo tax 14.00 on the debit side, the entry line is `1711` debit 200.00 on the refund side, and the summary counts 214.00 as released, not as received

#### Scenario: Refund of a deposit
- **WHEN** a `PostPrepayment` line debits the Visa account and credits `BSP-ALPHA-1_Liabilities/Reduced:7.00` with gross −107.00 and tax −7.00
- **THEN** the booking has debit `1711`, credit `1360`, gross 107.00 and apaleo tax 7.00, and the summary counts 107.00 as released and, of the released, as refunded

#### Scenario: Overpayment parked on the 0 % deposit
- **WHEN** a `PostCharge` line debits `BSP-ALPHA-1_Receivables` and credits `BSP-ALPHA-1_Liabilities/Null:0.00` (0 % wildcard, `1719`) with gross 10.00 and no taxes
- **THEN** the booking has debit `1410`, credit `1719`, gross 10.00, no VAT side, and the summary counts 10.00 as received

#### Scenario: Check-out on accounts receivable
- **WHEN** a line debits the AccountsReceivable account (mapped to `1401`) and credits guest receivables (`1410`) with gross 321.00 and receipt type Invoice number `BSP-2026-0815`
- **THEN** the booking has debit `1401` labelled `Forderungen Firmenrechnungen`, credit `1410`, gross 321.00, and the protocol lists `BSP-2026-0815` for the `1401` line of that day

### Requirement: Bad debt with tax correction
Lines that debit a LossOfAccountsReceivable account SHALL be booked through its mapping row: with tax entries, the write-off row SHALL carry the Odoo tax of the line's rate, so that the write-off is a debit base line on the refund side and Odoo lowers the Kennzahl and the VAT by apaleo's tax (§ 17 Abs. 2 Nr. 1 UStG); without tax entries the row SHALL have no tax and the line is booked without tax. The posting summary SHALL show the total of written-off receivables per rate.

#### Scenario: Write-off at 19 %
- **WHEN** a line debits a per-reservation LossOfAccountsReceivable account at 19 % (resolved through the wildcard to `2406`, `tax_ust_19_skr03`, 19) and credits guest receivables (`1410`) with gross 119.00, net 100.00 and taxes 19.00 at 19 %
- **THEN** the entry has `2406` debit 100.00 with `account.1_tax_ust_19_skr03` on the refund side and the counter line credit 119.00, and the summary shows 119.00 written off at 19 % with Odoo VAT −19.00 at Kz 81

#### Scenario: Write-off without tax
- **WHEN** a write-off line of 30.00 has no tax entries and debits an account mapped to `2400` without tax
- **THEN** the entry line on `2400` is debit 30.00 with an empty tax cell

### Requirement: Cancellation and no-show fees
Cancellation and no-show fees SHALL be booked through their revenue mapping rows like other revenue, with the rate apaleo charged and under the VAT guard; the posting module SHALL NOT change their tax. Without tax they SHALL be booked without tax on the untaxed revenue row.

#### Scenario: No-show fee at 7 %
- **WHEN** a line credits `RevenueNoShow_Reduced:7.00` mapped to `8300` with `tax_ust_7_skr03` and 7, with gross 107.00 and taxes 7.00 at 7 %
- **THEN** the booking has the VAT side credit on `8300` with apaleo tax 7.00 and no finding is raised

#### Scenario: Untaxed cancellation fee
- **WHEN** a line credits `RevenueCancellationFees_Without:0.00` mapped to `8200` without tax with gross 80.00 and no taxes
- **THEN** the entry line on `8200` is credit 80.00 with an empty tax cell

#### Scenario: Taxed no-show on an untaxed row
- **WHEN** a no-show line with taxes 7.00 at 7 % credits an account mapped without tax
- **THEN** `E-VAT-MISSING` is raised and names the mapping row

### Requirement: German fixture month with special cases
The German fixture month of o03 (`test/fixtures/apaleo/de-month/`) SHALL additionally contain a guest-owed Kurtaxe, a hotel-owed Übernachtungsteuer taxed at 7 %, write-offs at 7 % and 19 % and one without tax, a no-show fee at 7 %, an untaxed cancellation fee and an overpayment parked on the 0 % deposit and refunded, with its README updated; its mapping (`test/fixtures/mapping/skr03-de-month.csv`) SHALL be the SKR03 template with the Kurtaxe row filled in as a Kanzlei would (`1590` without tax) and the Übernachtungsteuer row on `8300` with `tax_ust_7_skr03`. A separate fixture day `test/fixtures/apaleo/de-2025-12-31/` SHALL hold a breakfast line at 19 % dated 2025-12-31 and one at 7 % dated 2026-01-01. The tests SHALL compare every summary value and entry line with hand-computed constants and the rendered files with the golden files of o03, updated.

#### Scenario: Totals with special cases
- **WHEN** `test/posting/fixture-month-de.test.ts` runs after this slice
- **THEN** Kurtaxe on `1590` without tax, the Übernachtungsteuer at 7 %, deposits received, released and refunded at 7 %, write-offs per rate with the lowered Kennzahl, the no-show and cancellation fees and the balance per Odoo account equal the recorded constants, and no `E-` finding is raised

#### Scenario: Food rate around the change
- **WHEN** the fixture day around 2026-01-01 is exported with the SKR03 template mapping
- **THEN** neither line raises `W-FOOD-RATE` (19 % before 2026, 7 % from 2026), and the same lines with swapped rates raise it once per day

