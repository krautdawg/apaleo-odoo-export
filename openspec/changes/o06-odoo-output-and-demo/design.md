## Context

The pipeline already prints a summary and writes a protocol through `TargetWriter.importBlock` and `taxReturnLine`; the summary module (`src/export/summary.ts`) still lays out MWST-Code lines and the Abacus wording. o02 gave the writer its fitting results (Odoo VAT, apaleo VAT and difference per rate and day, rounding lines) and o03 put them into the posting summary. The demo runs on `examples/demo/` without config, secret or network (`src/demo/`).

## Goals / Non-Goals

**Goals:**
- A dry run that a Steuerberater can compare line by line with Odoo after the import: Kennzahl per rate, Odoo's VAT per rate, the guest ledger and Geldtransit balances.
- A demo whose CSV can be imported into a fresh Odoo 19 trial with SKR03 as is (journal `APA` created by hand), and which never looks like a real export.

**Non-Goals:**
- XLSX output, a second demo for SKR04 (the example mapping for SKR04 is in the mapping guide).

## Decisions

1. **Summary order follows the Odoo check after import.** Per rate first (Kennzahl, net, Odoo VAT, apaleo VAT, difference), then accounts, then the rest, because the first thing to compare in Odoo is the tax report or the tax lines per rate. The difference to apaleo is explained in one sentence ("Odoo rechnet die Umsatzsteuer aus der Bemessungsgrundlage; die Datei passt die Bemessungsgrundlage centgenau an, damit der Bruttobetrag aus apaleo stimmt").
2. **Demo on Odoo 19 defaults.** `version: 19`, `taxRounding: per_tax`, `roundingAccount` set, because a new Odoo Online database (the likeliest first test) is 19 with "Round per Tax" and SKR03 by default (research §4). The demo month contains at least one rounding-account line, so the example shows it.
3. **Demo marking in three places.** File name `_DEMO`, `ref` prefix `DEMO`, External IDs with `_DEMO`, protocol first line `DEMO`; so a demo import into a real database cannot overwrite real entries and is easy to find and delete.
4. **Plausibility keeps the booking model.** `E-ACCOUNT-BALANCE` keeps comparing the bookings' movements with apaleo per day and account (o02 decision 9); the writer's checks (`E-ODOO-UNBALANCED`, `E-ODOO-GROSS`, `E-ODOO-VAT-FIT`) prove the fitted file. The spec text names both so that a reader sees which check guards what.

## Risks / Trade-offs

- [Someone imports the demo into a production database] → `DEMO` in the reference and External IDs, and `docs/examples/README.md` says to use a test database.

## Open Questions

None for this slice.
