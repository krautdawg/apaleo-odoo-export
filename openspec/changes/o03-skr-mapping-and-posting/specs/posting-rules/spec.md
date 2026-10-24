## MODIFIED Requirements

### Requirement: One booking per ledger line
The posting module SHALL turn every ledger line that is not skipped into exactly one `OdooBooking` whose business date is the line's business date and which carries the line's source entry number for traceability; the Odoo writer then nets the bookings of a day into one journal entry (see the `odoo-journal-writer` capability).

#### Scenario: Card payment
- **WHEN** a line debits the Visa payment account (mapped to `1360`) and credits a guest receivables account (mapped to `1410`) with gross 120.00 and no taxes
- **THEN** one booking is produced with debit account `1360` labelled `Zahlung Visa`, credit account `1410` labelled `Gästeforderungen`, gross 120.00 and no VAT side

#### Scenario: Every line traceable
- **WHEN** a period of 35 apaleo lines has 6 skipped lines
- **THEN** 29 bookings are produced and each names the source entry number of its line

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
Every booking side SHALL carry a label in German as used in Germany built from the account type, the apaleo account group and the rate (`Erlöse Beherbergung 7 %`, `Erlöse Speisen 7 %`, `Erlöse Getränke 19 %`, `Erlöse sonstige 19 %`, `Erlöse ohne USt`, `Zahlung <payment method>` with English method names translated or kept as brand names, `Gästeforderungen`, `Forderungen Firmenrechnungen`, `Anzahlungen 7 %`, `Kurtaxe`, `Forderungsverluste 19 %`), SHALL use the parent account name or a fixed label instead of the leaf name for guest, booking and per-reservation accounts, and SHALL NOT contain guest names; the label of an account SHALL NOT depend on the line, so the writer can net all lines of an account. The receipt number (with `posting.text2` `receipt`, the default, when one exists) or else the reference SHALL be kept on the booking for the protocol and SHALL NOT be written to the Odoo file. The analytic account SHALL be taken only from the mapping row of a Revenues or LossOfAccountsReceivable side and SHALL stay empty on every other side.

#### Scenario: Payment crediting a named guest folio
- **WHEN** a payment line debits the Visa account and credits a guest folio account named `Müller, Hans` (type Receivables, not in the global ledger)
- **THEN** the labels are `Zahlung Visa` and `Gästeforderungen`, and no label or protocol line contains `Müller`

#### Scenario: Revenue line carries the analytic account
- **WHEN** an accommodation charge credits a revenue account whose row has `analytic` `12`
- **THEN** the revenue side has the analytic account `12` and the receivables side none

#### Scenario: Payment line never carries an analytic account
- **WHEN** a payment line debits `1360` and credits `1410`, and the rows of both accounts have an `analytic` value
- **THEN** neither side has an analytic account

#### Scenario: Receipt kept for the protocol
- **WHEN** a payment line has receipt type PspReference number `PSP123` and reference `BSP-ABCDEF-1`
- **THEN** the booking keeps `PSP123` for the protocol and the Odoo file does not contain it

## REMOVED Requirements

### Requirement: VAT side in SingleInformation
**Reason**: Odoo journal entries have no Collective and Single blocks; the VAT side is the side whose mapping row has an Odoo tax.
**Migration**: See "VAT side of an Odoo booking".

### Requirement: Tax guard for Abacus bookings
**Reason**: Odoo computes the VAT from the net base, not Abacus' check value from the gross amount; the fitting replaces `W-VAT-ROUNDING`.
**Migration**: See "Tax guard for Odoo bookings" and the base fitting of the `odoo-journal-writer` capability.

### Requirement: Posting summary for Abacus
**Reason**: The summary is per Odoo account and Odoo tax, with the Kennzahl and Odoo's modelled VAT.
**Migration**: See "Posting summary for Odoo".

## ADDED Requirements

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
The posting module and the writer SHALL return a summary with Soll, Haben and balance per Odoo account (from the bookings' movement model), revenue per Odoo tax and rate with the Kennzahl, net and gross as passed to Odoo, Odoo's modelled VAT, apaleo's VAT on the same lines (rounded per line and precise, summed exactly) and the difference, deposit tax per tax and rate the same way, levies, payments per clearing account, deposits received, released and, of the released, refunded, the net movement on accounts receivable, written-off receivables per rate, skipped lines per reason with count and unsigned gross, the number of entries, lines and rounding lines, and findings grouped by code.

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
