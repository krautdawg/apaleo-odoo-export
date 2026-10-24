# apaleo fixtures: the Swiss fixture month (property `ENG`)

"Hotel Beispiel Engelberg" (`ENG`), a fabricated Swiss hotel: CHF, `Europe/Zurich`, August 2026. No real hotel, guest or account is behind it. The files are shaped exactly like the apaleo Swagger models and like apaleo's recorded real data (`../live/`): per-reservation accounts with `parentNumber`, `/Offset` second lines for every payment and the AR transfer, releases as negative charges with `taxes[]`, refunds as negative prepayments, no `PostPrepaymentVat`. `test/apaleo/fixtures.test.ts` validates every file against `../swagger-excerpt.json`; `test/helpers/apaleo.ts` serves them with `apaleoFixtureHandler({ chMonth: true })`, and `loadChMonthData()` reads them through the real adapter.

| File | Swagger model | What it holds |
|---|---|---|
| `properties/page-1.json` | PropertyListModel | `ENG` Hotel Beispiel Engelberg (CH, `Europe/Zurich`, `CHF`). |
| `accounts-schema.json` | ChartOfAccountsModel | A Swiss subset of apaleo's chart: revenue groups `RevenueAccommodation` (3.8 %, 0 %), `RevenueFoodAndBeverages` (8.1 %, 2.6 %), `RevenueOther` (8.1 %, 0 %), `RevenueNoShow` and `RevenueCancellationFees` (3.8 %, 0 %); payments `1104` Mastercard, `1114` Twint and `1600` cash under `1000`; `Vat_…` and `LiabilitiesVat_…` accounts at the Swiss rates; city tax `3501` under `3500`; house `9000`, transitory items `7000`; in the guest, external and booking ledgers the containers `3000`, `1200`, `9999` and `6900` with their `CollectiveDebitor_…` children. |
| `export-gross-daily/<day>.json` | ExportGrossTransactionListModel | The 26 ledger lines below, one file per business day; other days are answered with 204. |

The mapping is `test/fixtures/mapping/kmu-ch-month.csv`: what `init-mapping --template kmu-hotel` writes on this chart, with only the Kurtaxe row filled in as a Treuhänder would (`2210`, no MWST-Code). `test/posting/fixture-month-ch.test.ts` posts the month and compares every booking and every summary value with hand-computed constants, and the rendered file with `test/golden/abacus/ch-month.xml`.

Ledger lines (entry numbers `ENGE0001` to `ENGE0021`; a payment and its `/Offset` second line share one):

| Day | Entry | Line | Booked as |
|---|---|---|---|
| 08-03 | ENGE0001 | Twint prepayment 311.40 at 3.8 % (net 300.00, tax 11.40) for `ENG-ALPHA-1` onto `ENG-ALPHA-1_Liabilities/Special:3.80` | 1090 / 2030 (313) |
| 08-10 | ENGE0002 | `ENG-BRAVO-1` one night: Logis mit Frühstück 155.70 at 3.8 % (tax 5.70) | 1101 / 3400 (313) |
| 08-10 | ENGE0003 | dinner 54.05 at 8.1 % (tax 4.05) | 1101 / 3200 (311) |
| 08-10 | ENGE0004 | Kurtaxe 4.20 with a `Without`/0 %/0.00 tax entry | 1101 / 2210 |
| 08-10 | ENGE0005 | minibar 10.81 at 8.1 % (tax 0.81) | 1101 / 3500 (311) |
| 08-11 | ENGE0006 | `ENG-BRAVO-1` pays 224.76 cash, with `/Offset` | 1000 / 1101, second line skipped |
| 08-12 | ENGE0007, ENGE0008 | check-out `ENG-ALPHA-1`: two nights of 103.80 at 3.8 % (tax 3.80 each) | 1101 / 3400 (313) |
| 08-12 | ENGE0009 | Kurtaxe 8.40 (`Without` entry) | 1101 / 2210 |
| 08-12 | ENGE0010 | release of 207.60 as a negative charge (tax −7.60) | 1101 / 2030 (313), C |
| 08-12 | ENGE0011 | refund of 103.80 to Twint as a negative prepayment (tax −3.80) | 1090 / 2030 (313), C |
| 08-12 | ENGE0012 | Kurtaxe paid by Mastercard 8.40, with `/Offset` | 1090 / 1101, second line skipped |
| 08-14 | ENGE0013 | `ENG-CHARLIE-1` Annullation 80.00 on `RevenueCancellationFees_Without:0.00`, no taxes | 1101 / 3680 |
| 08-14 | ENGE0014 | paid by Mastercard 80.00, with `/Offset` | 1090 / 1101, second line skipped |
| 08-17 | ENGE0015 | take-away 15.39 at 2.6 % (net 15.00, tax 0.39) on the external folio `ENG-EXT-1` | 1101 / 3260 (312) |
| 08-17 | ENGE0016 | paid in cash 15.39, with `/Offset` | 1000 / 1101, second line skipped |
| 08-18 | ENGE0017 | `ENG-FOXTROT-1` one night 120.00 at 3.8 % with apaleo's precise values (net 115.60693642, tax 4.39306358, booked 4.39), never paid | 1101 / 3400 (313) |
| 08-20 | ENGE0018 | company stay `ENG-DELTA-1`: Halbpension 186.84 at 3.8 % (tax 6.84), invoiced as a whole under the 70 % rule, so apaleo books it on accommodation | 1101 / 3400 (313) |
| 08-20 | ENGE0019 | drinks 21.62 at 8.1 % (tax 1.62) | 1101 / 3200 (311) |
| 08-20 | ENGE0020 | check-out to accounts receivable with invoice `ENG-2026-0815`, 208.46, with `/Offset` | 1102 / 1101, second line skipped |
| 08-28 | ENGE0021 | write-off of `ENG-FOXTROT-1` 120.00 with tax 4.39306358 at 3.8 % (booked 4.39) on `ENG-FOXTROT-1_LossOfAccountsReceivable` | 1101 / 3805 (313), C |

The amounts are chosen so that Abacus' check of every booking (the MWST contained in the gross amount) equals apaleo's tax rounded to the Rappen: the month has no `W-VAT-ROUNDING`. Every gross amount is in whole Rappen and none is rounded to 5 Rappen. Most net and tax amounts are exact; the two `ENG-FOXTROT-1` lines carry eight-decimal net and tax as apaleo's live data does (`../live/`), so the month also exercises summing and rounding apaleo's precise tax (120.00 × 3.8 / 103.8 = 4.3930…, booked 4.39).

**Assumption.** The apaleo VAT type names of the Swiss rates (`Special:3.80` for 3.8 %, `Normal:8.10` for 8.1 %, `Reduced:2.60` for 2.6 %) and the account names are not recorded from a Swiss apaleo property: no Swiss developer property exists yet (research open question 6). The mapping resolves by type, rate and wildcard, not by the VAT type name, so a recorded Swiss day replaces the assumption without code change (see the maintainers checklist).
