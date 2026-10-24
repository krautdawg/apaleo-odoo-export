## MODIFIED Requirements

### Requirement: Kurtaxe and guest levies
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

## REMOVED Requirements

### Requirement: Deposits and accounts receivable in Abacus
**Reason**: Deposits and accounts receivable are booked as Odoo journal-entry lines with Odoo taxes; `abacus.abrechnungsart` is gone.
**Migration**: See "Deposits and accounts receivable in Odoo".

### Requirement: Bad debt with MWST correction
**Reason**: The correction follows § 17 UStG and is booked as a refund-side base line in Odoo.
**Migration**: See "Bad debt with tax correction".

### Requirement: Annullationen and no-show payments
**Reason**: The Swiss rule (ESTV MBI 08 Ziff. 8.7) does not apply; in Germany the Kanzlei decides whether a fee is consideration or Schadenersatz.
**Migration**: See "Cancellation and no-show fees".

## ADDED Requirements

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
