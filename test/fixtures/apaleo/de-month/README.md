# apaleo fixtures: the German fixture month (property `BSP`)

"Hotel Beispiel Berlin" (`BSP`), a fabricated German hotel: EUR, `Europe/Berlin`, September 2026. No real hotel, guest or account is behind it. The files are shaped exactly like the apaleo Swagger models and like apaleo's recorded real data (`../live/`): eight-decimal net and tax where the rate does not divide the gross evenly, per-reservation accounts with `parentNumber`, `/Offset` second lines for every payment and the AR transfer, releases as negative charges with `taxes[]`, refunds as negative prepayments, no `PostPrepaymentVat`. `test/apaleo/fixtures.test.ts` validates every file against `../swagger-excerpt.json`; `test/helpers/apaleo.ts` serves them with `apaleoFixtureHandler({ deMonth: true })`, and `test/helpers/de-month.ts` reads them through the real adapter (`loadDeMonthData()`).

| File | Swagger model | What it holds |
|---|---|---|
| `properties/page-1.json` | PropertyListModel | `BSP` Hotel Beispiel Berlin (DE, `Europe/Berlin`, `EUR`). |
| `accounts-schema.json` | ChartOfAccountsModel | The recorded German chart of the sandbox property BER (`../live/BER/accounts-schema.json`: VAT types `Reduced:7.00`, `Normal:19.00`, `Null:0.00`, `Without:0.00` and the 2020 rates 16 % and 5 %), with `RevenueCancellationFees_Reduced:7.00` not archived. |
| `export-gross-daily/<day>.json` | ExportGrossTransactionListModel | The 24 ledger lines below, one file per business day; other days are answered with 204. |

The mapping is what `init-mapping --template skr03-hotel` writes on this chart for `odoo.version: 18` (Kasse `1001`, Geldtransit `1360`; `test/helpers/de-month.ts`). `test/posting/fixture-month-de.test.ts` posts the month and compares every summary value, every entry line and Odoo's modelled VAT with hand-computed constants, and the rendered files with `test/golden/odoo/de-month.per-line.csv` and `de-month.per-tax.csv` (company 1, journal `APA`, rounding account `2700` for `per_tax`).

Ledger lines (entry numbers `BSPE0001` to `BSPE0019`; a payment and its `/Offset` second line share one):

| Day | Entry | Line | Booked as |
|---|---|---|---|
| 09-03 | BSPE0001 | Visa prepayment 321.00 at 7 % (net 300.00, tax 21.00) for `BSP-ALPHA-1` onto `BSP-ALPHA-1_Liabilities/Reduced:7.00` | 1360 / 1711 (`tax_ust_7_skr03`) |
| 09-10 | BSPE0002 | `BSP-BRAVO-1` one night: Logis 120.00 at 7 % (net 112.14953271, tax 7.85046729, rounded 7.85) | 1410 / 8300 (7 %) |
| 09-10 | BSPE0003 | breakfast 95.00 at 7 % on `RevenueFoodAndBeverages_Reduced:7.00` (tax 6.21495327, rounded 6.21) | 1410 / 8300 (7 %), a rounding cent with `per_line` |
| 09-10 | BSPE0004 | drinks 11.90 at 19 % (tax 1.90) | 1410 / 8400 (`tax_ust_19_skr03`) |
| 09-10 | BSPE0005 | minibar 23.80 at 19 % on `RevenueOther_Normal:19.00` (tax 3.80) | 1410 / 8400 (19 %) |
| 09-11 | BSPE0006 | `BSP-BRAVO-1` pays 250.70 cash, with `/Offset` | 1001 / 1410, second line skipped |
| 09-12 | BSPE0007, BSPE0008 | check-out `BSP-ALPHA-1`: two nights of 107.00 at 7 % (tax 7.00 each) | 1410 / 8300 (7 %) |
| 09-12 | BSPE0009 | release of 214.00 as a negative charge (tax −14.00) | 1711 (7 %, debit) / 1410 |
| 09-12 | BSPE0010 | refund of 107.00 to Visa as a negative prepayment (tax −7.00) | 1711 (7 %, debit) / 1360 |
| 09-14 | BSPE0011 | `BSP-CHARLIE-1` cancellation fee 100.04 at 7 % on `RevenueCancellationFees_Reduced:7.00` (net 93.4953271, tax 6.5446729, rounded 6.54) | 1410 / 8300 (7 %), a rounding cent with both rounding methods |
| 09-14 | BSPE0012 | paid by Mastercard 100.04, with `/Offset` | 1360 / 1410, second line skipped |
| 09-17 | BSPE0013 | untaxed revenue 80.00 on `RevenueOther_Without:0.00`, no taxes, on the external folio `BSP-EXT-1` named "Müller, Hans" | 1410 / 8200 |
| 09-17 | BSPE0014 | paid by Visa 80.00, with `/Offset` | 1360 / 1410, second line skipped |
| 09-18 | BSPE0015 | company stay `BSP-DELTA-1`: Logis 149.80 at 7 % (tax 9.80) | 1410 / 8300 (7 %) |
| 09-18 | BSPE0016 | drinks 35.70 at 19 % (tax 5.70) | 1410 / 8400 (19 %) |
| 09-18 | BSPE0017 | check-out to accounts receivable with invoice `BSP-2026-0815`, 185.50, with `/Offset` | 1401 / 1410, second line skipped |
| 09-28 | BSPE0018 | `BSP-ECHO-1` minibar 4.98 at 19 % (net 4.18487395, tax 0.79512605, rounded 0.80) | 1410 / 8400 (19 %), a rounding cent with both rounding methods |
| 09-28 | BSPE0019 | paid by Mastercard 4.98, with `/Offset` | 1360 / 1410, second line skipped |

The gross amounts are chosen so that Odoo's own rounding cannot reach some of them: with `per_line`, 95.00 and 100.04 at 7 % and 4.98 at 19 % each need a rounding cent; with `per_tax`, 100.04 at 7 % and 4.98 at 19 % need one on the rounding account, and 09-10 shows Odoo's VAT one cent above apaleo's (120.00 and 95.00 at 7 % rounded once). Kurtaxe, Beherbergungsteuer and a write-off follow in o05.
