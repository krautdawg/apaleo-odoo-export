# apaleo fixtures: the German turn of the year (property `BSP`)

Two fabricated business days of "Hotel Beispiel Berlin" (`BSP`, see [`../de-month/`](../de-month/README.md)) around the change of the VAT rate on Speisen: 19 % for services until 2025-12-31, 7 % from 2026-01-01 (Steueränderungsgesetz 2025). `test/helpers/apaleo.ts` serves them with `apaleoFixtureHandler({ deTurnOfYear: true })`, with the property list and the chart of the German fixture month; `loadDeTurnOfYearData()` reads them through the real adapter.

| File | Swagger model | Line |
|---|---|---|
| `export-gross-daily/2025-12-31.json` | ExportGrossTransactionListModel | `BSPE0101`: `BSP-JULIETT-1` breakfast 23.80 at 19 % (net 20.00, tax 3.80) on `RevenueBreakfast_Normal:19.00` "Frühstück (19%)" |
| `export-gross-daily/2026-01-01.json` | ExportGrossTransactionListModel | `BSPE0102`: `BSP-JULIETT-1` breakfast 21.40 at 7 % (net 20.00, tax 1.40) on `RevenueBreakfast_Reduced:7.00` "Frühstück (7%)" |

Neither line raises `W-FOOD-RATE`; with their business dates swapped, each day raises it once (`test/export/checks.test.ts`, `test/export/pipeline.test.ts`).
