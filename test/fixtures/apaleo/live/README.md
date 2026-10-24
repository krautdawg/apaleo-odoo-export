# Live recordings: apaleo DEV sandbox (properties `BER` and `VIE`)

Real responses of an apaleo DEV sandbox account, recorded on 2026-10-21 before the night audit of that day. The guests, reservations and bookings in the sandbox are synthetic; no real hotel or person is behind them. They pin the tool to what apaleo really sends (eight-decimal net and tax amounts, per-reservation accounts with `parentNumber`, `/Offset` accounts, releases as negative charges, aggregates on leaf global accounts and guest parents).

Origin: copied unchanged from release 0.1.1 (commit `e16e75e`) of the upstream project this engine started from; the CHANGELOG names it. Each file is the bare response body, unwrapped from the recording (`{ status, query, body }`); the query always matched the folder and the day.

| File | Swagger model | What it holds |
|---|---|---|
| `<BER\|VIE>/accounts-schema.json` | ChartOfAccountsModel | `GET /finance/v1/accounts/schema?depth=4&includeArchived=true`. BER: German rates 7/19 % plus the historical 16/5 % of 2020; VIE: Austrian rates 4.9/10/13/20 % plus the historical 5 % (1 July 2020 to 31 December 2021). |
| `<BER\|VIE>/export-gross-daily/2026-10-21.json` | ExportGrossTransactionListModel | 35 ledger lines each: prepayments, releases, a refund, an overpayment parked at 0 %, payments with their `/Offset` lines, an AR transfer, a no-show and a cancellation fee. |
| `<BER\|VIE>/export-gross-daily/2026-10-22.json` | ExportGrossTransactionListModel | 4 lines each, posted ahead for the next business day (not yet audited). |
| `<BER\|VIE>/aggregate-daily/<day>.json` | AggregateTransactionListModel | apaleo's own daily totals for the same days. |
| `BER/mapping-BER.odoo.csv` | mapping file | The Odoo mapping of the BER chart: exactly what `init-mapping --template skr03-hotel` writes for Odoo 18 (Kasse `1001`, Geldtransit `1360`). The BER chart has no city tax account, so there is no Kurtaxe row to fill in. |
| `VIE/mapping-VIE.odoo.csv` | mapping file | The Odoo mapping of the VIE chart, written by hand with the l10n_at taxes `account_tax_template_sales_10_code029`, `_13_code006` and `_20_code022` (they give `W-TAX-UNCHECKED` and `W-VAT-RATE-UNUSUAL` in `mapping check`, no error), the no-show at 13 % filled in as taxable (`test/helpers/live-mapping.ts`). |

Both days run through the Odoo target. BER has the German rates 7 % and 19 %, which the SKR03 template maps: its export writes a file without an error. VIE has the Austrian rates and runs with the hand-made l10n_at mapping. Folio recordings were not copied: the tool does not read folios.

## Privacy scan

Before copying, `node test/helpers/fixture-scan.ts <recordings folder>` scanned every recording except the folios (and never opened a `.env` file there). It rejects keys or values that look like a token, secret, bearer, authorization or password, e-mail addresses, and every account name that is neither an apaleo default name nor of the form `… for Reservation|Folio <id>`. Result on 2026-10-21:

```
12 file(s) scanned, 0 problem(s)
```

No names, e-mail addresses or postal addresses had to be stripped. `test/apaleo/live-fixtures.test.ts` runs the same scan over this folder on every test run (10 files here).

## VIE totals of 2026-10-21

Real apaleo data, recomputed offline from the recordings (exact decimals, half away from zero) and asserted through the Odoo target with `VIE/mapping-VIE.odoo.csv` (`test/posting/live-day.test.ts`, `test/cli/live-data.test.ts`). The per-line tax rounded half away from zero is what each booking carries as its apaleo tax.

| VIE 2026-10-21 | value |
|---|---|
| revenue gross | 85.20 at 10 %, 410.02 at 13 %, 47.38 at 20 %, 45.00 at 0 % (`RevenueCancellationFees_Without:0.00`, Odoo `4095`) |
| revenue VAT, apaleo precise | 7.74545454 (10 %), 47.17044248 (13 %), 7.89666666 (20 %) |
| revenue VAT, per-line tax rounded | 7.74 (10 %), 47.17 (13 %), 7.89 (20 %) |
| deposit VAT, precise / rounded per line | 20.2500885 / 20.25 (13 %), 3.33 / 3.33 (20 %) |
| payments | 111.70 cash (`1600`, Odoo `2700`), 576.90 on cards (`1101`–`1106`, Odoo `2890`) |
| deposits | received 491.00, released 295.00, of it refunded 10.00 |
| accounts receivable | 95.00 |
| skipped `SAME_ACCOUNT` (`/Offset` lines) | 6 lines, 312.60 unsigned |

- 35 apaleo lines: 29 bookings, 6 skipped `SAME_ACCOUNT` lines.
- Every tax of the day is the tax contained in the gross amount, rounded (line `000000031`: 46.80 × 10 / 110 = 4.2545, tax 4.25).
- The cancellation fee at 0 % maps to `4095` without a tax.
- The no-show at 13 % (`RevenueNoShow_Reduced:13.00`) is filled in as taxable, as apaleo charged it, on `4013` with `account_tax_template_sales_13_code006` and 13 %.

`aggregate-daily` matches the ledger by balance on all 19 accounts.
