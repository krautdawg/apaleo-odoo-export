## Why

After o02 the Odoo writer exists but nothing feeds it: the mapping CSV, the template and the posting rules still produce Abacus bookings with MWST-Codes. German hotels need a mapping to Odoo account codes and Odoo taxes, SKR03 and SKR04 templates that reuse the DATEV hotel knowledge, and posting rules that hand `OdooBooking` values to the writer. This slice switches the engine end to end to Odoo. It starts only after the local test import of o02 (task group 7) has checked the writer's tax model against real Odoo 17, 18 and 19 and recorded the generated cash and transfer account codes.

## What Changes

- **BREAKING** Mapping CSV columns `apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;odoo_account;odoo_tax;tax_percent;comment`; Abacus (`abacus_account`, `mwst_code`), BMD and DATEV mappings are refused with a hint to `init-mapping --template skr03-hotel`. `init-mapping --accounts-from` is removed (the paid Odoo connector's export layout is unknown).
- New templates `templates/skr03-hotel.rules.csv` and `templates/skr04-hotel.rules.csv` for Odoo (l10n_de account codes, Odoo tax template ids per rate, the cash and Geldtransit accounts that Odoo generates at company setup pre-filled with the fresh-database code for `odoo.version` and a comment to check them, `Vorschlag (ungeprüft)` comments in German); `init-mapping --template skr03-hotel|skr04-hotel`.
- `mapping check` for Odoo: account code format, tax value format, rate per tax, taxes not allowed on payments and receivables, known l10n_de taxes and their rates, the non-taxable 0 % tax that reports in UStVA Kz 45, accounts that carry a default tax in Odoo, accounts that Odoo generates instead of the chart template.
- Posting rules produce one `OdooBooking` per ledger line (VAT side with Odoo tax, rate and apaleo tax; labels without personal data); the VAT guard keeps apaleo's rates and amounts.
- **BREAKING** `odooTarget` becomes the default target; the `odoo` section becomes required; the `abacus` section is ignored with a warning until o04 refuses it.
- New finding codes `E-TAX-FORMAT`, `E-TAX-MISSING`, `E-TAX-NOT-ALLOWED`, `E-TAX-RATES`, `W-TAX-UNCHECKED`, `W-TAX-RATE`, `W-TAX-KZ45`, `N-DEFAULT-TAX-ACCOUNT`, `N-GENERATED-ACCOUNT` replace the MWST-Code and Kostenstelle codes in the mapping and export.
- **BREAKING** Every Abacus behaviour whose requirement this slice removes goes with its code and tests, not ported: the KMU template and `kmu-sample-codes`, Abacus mapping validation, the Swiss template rows and warnings (`W-KURTAXE-TAXED`, `W-ANNULLATION-TAXED`, `W-UNTAXED-REVENUE`), MWST-Code and Kostenstelle paths (`E-MWST-CODE-*`, `W-MWST-CODE-*`, `E-KOST-FORMAT`, `W-KOST-IGNORED`), the Abacus tax guard (`W-VAT-ROUNDING`), the Abacus posting summary, Vereinnahmte Entgelte in posting, the Swiss fixture month and the Abacus live mapping. Only the Abacus writer (`src/abacus/`, its own tests and the `abacus` config section) stays until o04, because its capability `abacus-xml-writer` is still live.
- A fabricated German fixture month (`de-month`, EUR, `Europe/Berlin`, September 2026) and an Odoo live mapping for the recorded BER day; the demo switches to it.
- `docs/mapping-guide.md` rewritten for SKR03/SKR04 in Odoo, in German as used in Germany.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `account-mapping`: file format, templates, init-mapping, validation for Odoo; Swiss template rows and warnings removed.
- `posting-rules`: Odoo bookings, VAT side, guard, labels, summary, German fixture month; Vereinnahmte Entgelte and the Swiss fixture month removed.
- `export-run`: default target, currency, output names, tax warnings, one rate per tax, live regression.
- `cli`: the `odoo` section is required.
- `documentation`: mapping guide for Odoo.

## Non-goals

- German special cases beyond the basics (Kurtaxe, Beherbergungsteuer, bad debt, no-show warnings): o05.
- Deleting the Abacus writer, the `abacus` config section and the Abacus docs: o04.
- Analytic accounts (`Später geplant`, o02).

## Impact

- `src/mapping/` (deleting `kmu-sample-codes.ts`), `src/posting/`, `src/export/pipeline.ts`, `src/cli/commands/{init-mapping,mapping,doctor}.ts`, `src/core/config.ts`, `templates/` (deleting `kmu-hotel.rules.csv`), `examples/demo/`, `test/fixtures/apaleo/de-month/`, `test/fixtures/apaleo/live/BER/`, tests (deleting the Swiss month, KMU and Abacus-mapping tests and fixtures), `docs/mapping-guide.md`, `docs/troubleshooting.md`.
