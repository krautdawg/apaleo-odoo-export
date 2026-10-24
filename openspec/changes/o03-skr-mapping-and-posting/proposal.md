## Why

After o02 the Odoo writer exists but nothing feeds it: the mapping CSV, the template and the posting rules still produce Abacus bookings with MWST-Codes. German hotels need a mapping to Odoo account codes and Odoo taxes, SKR03 and SKR04 templates that reuse the DATEV hotel knowledge, and posting rules that hand `OdooBooking` values to the writer. This slice switches the engine end to end to Odoo.

## What Changes

- **BREAKING** Mapping CSV columns `apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;odoo_account;odoo_tax;tax_percent;analytic;comment`; Abacus (`abacus_account`, `mwst_code`), BMD and DATEV mappings are refused with a hint to `init-mapping --template skr03-hotel`. `init-mapping --accounts-from` is removed (the paid Odoo connector's export layout is unknown).
- New templates `templates/skr03-hotel.rules.csv` and `templates/skr04-hotel.rules.csv` for Odoo (l10n_de account codes, Odoo tax template ids per rate, `Vorschlag (ungeprüft)` comments in German); `init-mapping --template skr03-hotel|skr04-hotel`.
- `mapping check` for Odoo: account code format, tax value format, rate per tax, taxes not allowed on payments and receivables, known l10n_de taxes and their rates, accounts that carry a default tax in Odoo, analytic accounts on revenue and bad-debt rows only.
- Posting rules produce one `OdooBooking` per ledger line (VAT side with Odoo tax, rate and apaleo tax; labels without personal data; analytic account from the revenue or bad-debt row); the VAT guard keeps apaleo's rates and amounts.
- **BREAKING** `odooTarget` becomes the default target; the `odoo` section becomes required; the `abacus` section is ignored with a warning until o04 refuses it.
- New finding codes `E-TAX-FORMAT`, `E-TAX-MISSING`, `E-TAX-NOT-ALLOWED`, `E-TAX-RATES`, `W-TAX-UNCHECKED`, `W-TAX-RATE`, `W-DEFAULT-TAX-ACCOUNT`, `E-ANALYTIC-FORMAT`, `W-ANALYTIC-IGNORED` replace the MWST-Code and Kostenstelle codes in the mapping and export.
- A fabricated German fixture month (`de-month`, EUR, `Europe/Berlin`, September 2026) and an Odoo live mapping for the recorded BER day; the demo switches to it.
- `docs/mapping-guide.md` rewritten for SKR03/SKR04 in Odoo (joins `GERMANY_FILES`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `account-mapping`: file format, templates, init-mapping, validation for Odoo.
- `posting-rules`: Odoo bookings, VAT side, guard, labels, summary, German fixture month.
- `export-run`: default target, currency, output names, tax warnings, one rate per tax, live regression.
- `cli`: the `odoo` section is required.
- `documentation`: mapping guide for Odoo.

## Non-goals

- German special cases beyond the basics (Kurtaxe, Beherbergungsteuer, bad debt, no-show warnings): o05.
- Deleting Abacus code and docs: o04.

## Impact

- `src/mapping/`, `src/posting/`, `src/export/pipeline.ts`, `src/cli/commands/{init-mapping,mapping,doctor}.ts`, `src/core/config.ts`, `templates/`, `examples/demo/`, `test/fixtures/apaleo/de-month/`, `test/fixtures/apaleo/live/BER/`, tests, `docs/mapping-guide.md`, `docs/troubleshooting.md`.
