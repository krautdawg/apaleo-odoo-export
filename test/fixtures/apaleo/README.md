# apaleo fixtures: "Hotel Beispiel" (property `BSP`)

Fabricated responses shaped exactly like the apaleo Swagger models. No real hotel, guest or account is behind them. `test/apaleo/fixtures.test.ts` validates every JSON file here against `swagger-excerpt.json` (definitions copied from the finance-v1 and inventory-v1 Swagger documents, downloaded 2026-10-20), so a fixture that drifts from the Swagger fails the suite. `test/helpers/apaleo.ts` serves the files as a fake apaleo API through `ctx.fetchFn`.

| File | Swagger model | What it holds |
|---|---|---|
| `properties/page-1.json` | PropertyListModel | `BSP` Hotel Beispiel (Wien, Europe/Vienna) and `HBW` Hotel Beispiel Wien. Page 2 is answered with 204. |
| `accounts-schema.json` | ChartOfAccountsModel | A subset of apaleo's real Austrian chart (the recorded VIE chart in `live/`): revenue groups `RevenueAccommodation`, `RevenueFoodAndBeverages` and `RevenueOther` with leaves per VAT type (`…_VeryReduced:10.00`, `…_Normal:20.00`, `…_Without:0.00`, one archived), payments `1102`, `1104`, `1106`, `1600` under `1000`, `Vat_…` and `LiabilitiesVat_…` accounts, city tax `3501` under `3500`, house `9000`, transitory items `7000`; in the guest, external and booking ledgers the containers `3000`, `1200`, `9999` and `6900` with their `CollectiveDebitor_…` children. |
| `export-gross-daily/<day>.json` | ExportGrossTransactionListModel | The ledger of one business day (below), in apaleo's real shapes: eight-decimal net and tax, per-reservation accounts with `parentNumber`, `/Offset` second lines for every payment and the AR transfer, releases as negative charges with `taxes[]`, no `PostPrepaymentVat`. Days without a file are answered with 204. |
| `aggregate-daily/<day>.json` | AggregateTransactionListModel | apaleo's daily totals for the same day in the shape of the real API (see `live/`): leaf global accounts and only the top-level parent of guest accounts (`1200`, `3000`, `9999`); revenue and deposits net, VAT accounts with the taxes, everything else gross, negative amounts in the other column. |

Business days (September 2026, so the demo month 2026-09 is always closed):

- **2026-09-14**: Visa prepayment 220.00 at 10 % for `BSP-GHIJKL-1` onto `BSP-GHIJKL-1_Liabilities/VeryReduced:10.00`; package night for `BSP-ABCDEF-1` (logis 98.00 at 10 %, breakfast 13.20 at 10 % and coffee 3.60 at 20 % as two lines with the same `sourceEntryNumber` and timestamp); Ortstaxe 3.20 with a `Without`/0 %/0.00 tax entry; drinks 24.00 at 20 %.
- **2026-09-15**: Mastercard prepayment 165.00 at 10 % for `BSP-MNOPQR-1`; second package night; allowance −11.00 on logis with tax −1.00; restaurant charges 46.90 at 10 % and 14.80 at 20 % on the external folio `BSP-EXT-1_Receivables` ("Müller, Hans", a guest name on a folio account with `parentNumber` 1200).
- **2026-09-16**: check-out: a move of 5.00 between two guest folios, Visa 120.00, cash 24.00, 115.00 to accounts receivable (invoice `BSP-2026-0042`), Mastercard 61.70 for the external folio, each with its `/Offset` second line.
- **2026-09-17**: no transactions (204).
- **2026-09-21**: logis 220.00 at 10 % for `BSP-GHIJKL-1` and the release of its deposit as a negative charge (−220.00, tax −20.00) on the deposit account.
- **2026-09-22**: logis 165.00 and the release of the `BSP-MNOPQR-1` deposit (−165.00, tax −15.00); an overpayment of 10.00 parked on `BSP-MNOPQR-1_Liabilities/Null:0.00` and refunded to the Maestro card as a negative prepayment.

The amounts are chosen so that Abacus' check of every booking (the MWST contained in the gross amount) equals apaleo's tax rounded to the cent: the fixture month has no `W-VAT-ROUNDING`.

The demo (`examples/demo/apaleo/`) no longer copies these files: it is the Swiss "Hotel Beispiel" in CHF, fabricated in the shape of the Swiss fixture month (`ch-month/`) and kept apart from both, see `examples/demo/README.md`.


The Swiss fixture month (property `ENG`, CHF, August 2026, with Kurtaxe, a deposit received, released and refunded, an Annullation, an invoice on accounts receivable and a write-off) is in [`ch-month/`](ch-month/README.md).

Recorded real responses of an apaleo DEV sandbox (properties `BER` and `VIE`, with eight-decimal net and tax amounts) are in [`live/`](live/README.md); the regression tests run the whole pipeline on them. More real responses are welcome: if you run `apaleo-abacus live-smoke` against a real account and the shapes differ, please run the privacy scan (`node test/helpers/fixture-scan.ts <folder>`), anonymise names, reservation ids and amounts, and add them as a new fixture day.
