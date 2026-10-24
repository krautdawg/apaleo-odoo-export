# Research: Odoo Accounting as the target

Planning notes for the o01-o08 slices, checked on 2026-10-24. English, like the specs. The German user docs `docs/odoo-format.md` (slice o02) and `docs/odoo-import.md` (slice o04) are written from this file and keep the source list. Nothing here is tax advice; every booking rule is confirmed by a Steuerberater with a real Odoo test import before the first release (see "Open questions").

Target: **Odoo Accounting** (the `account` module with a fiscal localisation), Odoo **17.0, 18.0 and 19.0**, Community and Enterprise, on Odoo Online, Odoo.sh or self-hosted. The tool produces journal entries (`account.move` with `move_type` `entry`) for one Odoo company; it does not create invoices, partners or payments.

Odoo source was read from `github.com/odoo/odoo` at the branches `17.0`, `18.0` and `19.0` (files named below, read 2026-10-24); Odoo documentation from `github.com/odoo/documentation` branch `19.0`. Enterprise-only code (`account_reports`, `l10n_de_reports`) is not public and is not relied on.

## 1. Ways into Odoo

| Option | What it is | Fit |
|---|---|---|
| **Standard import of journal entries** (Accounting > Journal Entries, gear menu > Import records; CSV or XLSX of `account.move` with `line_ids/...` columns) | Odoo's generic `base_import` on the model `account.move`; one row per journal item, the first row of an entry carries the entry fields. Odoo 19 even ships a template for it ("Import Template for Misc. Operations", `account/static/xls/misc_operations_import_template.xlsx`, columns `Reference`, `Date`, `Journal`, `Journal Items/Account`, `Journal Items/Partner`, `Journal Items/Label`, `Journal Items/Debit`, `Journal Items/Credit`) | **Chosen as the default deliverable.** Works on every edition, version and hosting, needs no credentials to Odoo, the accountant sees "Test" results before anything is written, and the entries land as drafts |
| Import of journal items (`account.move.line`, template `aml_import_template.xlsx` with `journal_id`, `move_id`, `date`, `account_id`, `debit`, `credit`, ...) | the older line-level import (same template in 17, 18, 19) | not chosen: the entry is identified by its name (`move_id`), which is a sequence number Odoo assigns at posting, and the line model does not carry the entry's External ID |
| External API (JSON-2 in 19; XML-RPC / JSON-RPC in 17 and 18) | push `account.move.create` from the tool | **later** (`Später geplant`), see §7 |
| Third-party import add-ons from the Odoo App Store | paid modules | not standard, not for Odoo Online |

Why the file import is enough: the paid connector's value is the mapping and the daily routine; the import itself is three clicks for the accountant, and a file keeps the tool free of write credentials, Odoo Online plan limits (§7) and version-specific API code.

## 2. The import file

Sources: `odoo/addons/base/models/ir_fields.py` (`_str_to_one2many`, `for_model`), `addons/base_import/models/base_import.py` (`get_fields_tree`), `addons/account/models/account_move.py`, Odoo docs "Export and import data" (`content/applications/essentials/export_import_data.rst`, 19.0).

- **One2many layout.** "A specific row **must** be reserved ... for each order line. The first order line is imported on the same row as the information relative to order. Any additional lines need an additional row that does not have any information in the fields relative to the order" (docs, "Import one2many relationships"). So each entry is one row with `id`, `ref`, `date`, `journal_id` and its first item, then one row per further item with the entry columns empty.
- **Column headers** may be technical field paths: `id`, `ref`, `date`, `journal_id`, `line_ids/id`, `line_ids/account_id`, `line_ids/name`, `line_ids/debit`, `line_ids/credit`, `line_ids/tax_ids/id`, `line_ids/analytic_distribution`. Relations by External ID use the suffix `/id` ("use **XXX/ID** (XXX/External ID)", docs).
- **Only writable fields are importable.** `get_fields_tree` skips every field whose `readonly` is set (17.0 line ~298, 18.0 ~360, 19.0 ~323). Consequences: `state` is readonly (`account_move.py` 17.0 l.134, 19.0 l.130), so **every imported entry is a draft**; `tax_repartition_line_id` is readonly (`account_move_line.py` 17.0 l.210) and `tax_line_id` is a related readonly field, so **a file cannot create a tax line**. `tax_ids` (computed, `readonly=False`), `tax_tag_ids` and `analytic_distribution` are importable.
- **Empty cells.** `for_model` converts an empty value to `False` (`ir_fields.py` 17.0 ~l.114). An empty `line_ids/tax_ids/id` cell therefore sets "no taxes" explicitly. This matters in 17 and 18, where a line of a journal entry without explicit taxes gets the account's default taxes (`_get_computed_taxes`: `else: tax_ids = ... self.account_id.tax_ids`, 17.0 and 18.0); in 19 entries never get account default taxes (`tax_ids = False if ... self.move_id.is_entry() ...`, 19.0 `account_move_line.py` ~l.987). In l10n_de, SKR03 `8300`/`8400`, `2401`/`2406` and SKR04 `4200`/`4300`/`4400`, `6931`/`6936` carry default taxes.
- **External IDs and re-import.** "Update imports: import the same file several times without creating duplicates" (docs, "External ID"). An `id` without a module gets the module `__import__`. For an existing entry the one2many converter emits `Command.link` + `Command.update` for lines found by `line_ids/id` and `Command.create` for lines without an ID (`_str_to_one2many`), so lines need their own External IDs or a re-import appends them a second time. Lines that exist in Odoo but not in the new file are kept.
- **Posted entries.** A write that changes `tax_ids`, accounts or amounts of a posted line raises "You cannot modify the taxes related to a posted journal item ..." / the fiscal protected-fields error (`account_move_line.py` write, 17.0 ~l.1668, 19.0 ~l.1870), using `_field_will_change`, so re-importing an unchanged file over a posted entry changes nothing and a changed file is refused. l10n_de turns on the audit trail ("By default, the audit trail is enabled to ensure compliance with GoBD", Germany localisation doc; `check_account_audit_trail` in 17/18 and `restrictive_audit_trail` in 19, `l10n_de/models/chart_template.py`); with it a posted entry cannot be deleted ("you can not delete journal entries once they have been posted", 19.0 `account_move.py` ~l.4095), it must be reversed.
- **No duplicate warning for entries.** `duplicated_ref_ids` only looks at sale and purchase documents (`_fetch_duplicate_supplier_reference` in 17, `_fetch_duplicate_reference` filtered to `is_sale_document() or is_purchase_document()` in 19). Re-import detection therefore rests on the External ID; `ref` is for people.
- **Accounts by code.** `account_id` is resolved by name search: 17.0 `_name_search` with operator `=` matches `code = <first word>` exactly; 19.0 `_search_display_name` matches `code =like '<first word>%'`, so `8400` also finds `84001` and the import then warns "multiple matches" and takes the first. Journals resolve by name or code.
- **Taxes by External ID.** Chart-template records get the External ID `account.<company id>_<template xmlid>` (`chart_template.py`: `f"account.{company.id}_{xmlid}"`, 17.0 and 19.0), for example `account.1_tax_ust_19_skr03`. Tax names (`19%`, `7%`, `0%`) are unique per type in l10n_de, but a database with several companies or a custom tax named `19%` makes a name ambiguous; the External ID is not.
- **CSV formatting.** Odoo detects separator, quoting and the thousand/decimal separators and accepts ISO 8601 dates (`YYYY-MM-DD`); "Test" validates the whole file before "Import" writes it (docs).
- **Analytic distribution** is a JSON field `{"<analytic account id>": <percent>}`; the import parses it with `json.loads` (`_str_to_json`), so it needs the database id of the analytic account (visible in the URL of the record or with "Export ... ID").

## 3. Taxes on imported journal-entry lines (main correctness risk)

Sources: `account_move.py` `_sync_dynamic_lines`, `_sync_tax_lines` (18/19), `_sync_unbalanced_lines`, `_get_rounded_base_and_tax_lines`, `_prepare_product_base_line_for_taxes_computation`; `account_move_line.py` `_compute_all_tax` (17), `_compute_is_refund`, `_compute_tax_tag_invert` (17/18); `account_tax.py` `_round_base_lines_tax_details`, `_round_tax_details_tax_amounts`, `_add_accounting_data_to_base_line_tax_details` (19); `res_company` `tax_calculation_rounding_method`; `odoo/tools/float_utils.py` `float_round`.

How Odoo treats a journal entry whose lines carry `tax_ids` ("auto tax mode"):

1. **Odoo creates the tax lines itself.** `_sync_dynamic_lines` syncs tax lines for "invoice-like and journal entries in 'auto tax mode'": `m.is_invoice(True) or m.line_ids.tax_ids` (17.0 l.~2403; same filter in 18/19). Lines carrying `tax_ids` are base lines; Odoo adds one tax line per tax repartition line (account from the repartition line, e.g. SKR03 `1776` for 19 %), with the report tags.
2. **The line amount is the base (net), never gross.** 17: `_compute_all_tax` uses `amount_currency` with `handle_price_include=False` for non-invoice lines; 18/19: `special_mode: 'total_excluded'` for non-invoices (`_prepare_product_base_line_for_taxes_computation`). A price-included tax does not change this.
3. **Invoice or refund side.** In an entry, a base line with a sale tax and `credit == 0` (a debit) is a refund (`_compute_is_refund`, 17 and 19); it takes the refund repartition lines and tags. So a revenue credit raises the grid, an allowance or deposit release (debit) lowers it.
4. **Tags.** Base lines get the base tags of the repartition (`_add_accounting_data_to_base_line_tax_details`, "Tags on the base line"), tax lines the tax tags. The tag model differs: 17/18 use signed tags (`+81_BASE`, `-81_BASE`, `tax_negate`) together with `tax_tag_invert` on the line; 19 uses unsigned tags (`81_BASE`) and puts the sign in the report expression (`-81_BASE` in `l10n_de/data/account_account_tags_data.xml`), and `tax_tag_invert` is gone. Writing `tax_tag_ids` ourselves would need version-specific tags and signs; letting Odoo derive them from `tax_ids` is version-independent.
5. **Rounding.** Company setting `tax_calculation_rounding_method`: default `round_per_line` in 17.0 and 18.0 ("Round per Line"), default `round_globally` in 19.0 (labelled "Round per Tax"). Per line: each base line's tax is rounded. Per tax (19): raw taxes are aggregated per (tax, currency, is_refund, reverse charge, price_include, computation key), the total is rounded once and the delta distributed (`_round_tax_details_tax_amounts`). `float_round` rounds half away from zero ("HALF-UP ... ties going away from zero").
6. **Imbalance is "fixed" silently.** For an unbalanced journal entry Odoo adds an "Automatic Balancing Line" on the company's suspense account (`_sync_unbalanced_lines`, 17/18/19). If the tax Odoo computes differs from the tax the file assumed, the entry stays importable but gets that line.
7. **Tax lines cannot come from the file** (§2: `tax_repartition_line_id` readonly). A plain line on `1776` in the file would be a second, untagged VAT line next to Odoo's own: double VAT on the account and an automatic balancing line.

Options considered:

| Option | Result | Verdict |
|---|---|---|
| A. Base lines with `tax_ids` at the net amount, no tax lines, Odoo computes the tax | grids and tax lines exactly as Odoo makes them for its own entries in every version; Odoo's tax = round(base × rate) per line or per tax, which differs from apaleo's per-line tax by cents | **chosen, with base fitting (below)** |
| B. Tags only (`tax_tag_ids` on base and tax lines, no `tax_ids`) | amounts exactly apaleo's, but version-specific tag names and signs (17/18 vs 19), no link to `account.tax` (the Enterprise tax closing works from tax lines with a repartition line and would not clear the VAT accounts; DATEV export from Odoo derives BU keys from taxes) | rejected |
| C. Gross lines with price-included taxes | entries ignore price inclusion (point 2) | impossible |
| D. Tax lines with `tax_repartition_line_id` through the API | 18/19 keep given tax amounts when all lines including tax lines are created at once ("round_from_tax_lines"), 17 recomputes | only for the later API slice, and only if a test proves it per version |

**Decision (base fitting).** The file keeps apaleo's **gross** amounts exact on every counter line (payments, receivables, deposits) and lets Odoo compute the VAT. For each base line (or, with per-tax rounding, each group of base lines with the same tax and side in one entry) the tool chooses the net base `B` closest to apaleo's net such that `B + odooTax(B) = G`, the apaleo gross of that line or group, using Odoo's formula for the configured rounding method (`odoo.taxRounding`, `per_line` or `per_tax`). `f(B) = B + round(B × r)` grows by 1 or 2 cents per cent of `B`, so about r/(1+r) of the gross values (16 % at 19 %, 6.5 % at 7 %) have no exact `B`:
- per line: the tool adds a second base line of 0.01 with the same account and tax (its tax rounds to 0.00 for rates below 50 %);
- per tax: no base works, so the remaining cent goes on a line without tax on `odoo.roundingAccount` (required with `per_tax`).
Every entry then balances to the cent after Odoo's own tax computation, so Odoo never adds an automatic balancing line; the base per grid and Odoo's VAT stay consistent (tax = base × rate, as the UStVA computes it); the difference between Odoo's VAT and apaleo's per-line VAT is shown per rate, day and month in the protocol. Whether that cent difference is acceptable (invoiced VAT per apaleo vs declared VAT per Odoo) is a Steuerberater decision written into the docs and open question 3.

Never written: lines on the apaleo Vat / VatOnLiabilities accounts (skipped as before, Odoo makes the VAT), `tax_tag_ids`, tax lines.

## 4. l10n_de: SKR03, SKR04, taxes, grids

Sources: `addons/l10n_de/data/template/account.tax-de_skr03.csv`, `account.tax-de_skr04.csv`, `account.account-de_skr03.csv`, `account.account-de_skr04.csv`, `models/template_de_skr03.py`, `template_de_skr04.py`, `data/account_account_tags_data.xml` (17.0, 18.0, 19.0); Odoo docs "Germany" (19.0): "Both SKR03 and SKR04 charts of accounts are supported ... When a new Odoo Online database is created, SKR03 is installed by default."

Sale taxes (identical template ids in 17, 18, 19; External ID `account.<company>_<id>`):

| Template id SKR03 / SKR04 | Name | Rate | Tax account SKR03 / SKR04 | Grid |
|---|---|---|---|---|
| `tax_ust_19_skr03` / `tax_ust_19_skr04` | `19%` | 19 | `1776` / `3806` | Kz 81 (base `81_BASE`, tax `81_TAX`) |
| `tax_ust_7_skr03` / `tax_ust_7_skr04` | `7%` | 7 | `1771` / `3801` | Kz 86 |
| `tax_not_taxable_skr03` / `_skr04` | `0%` (Non-taxable turnover) | 0 | none | non-taxable turnover |
| `tax_ust_19_taxinclusive_skr03` (17 only) | `19% INC` | 19, price included | | dropped in 18 |

Accounts used by the hotel templates (all present in the 17/18/19 templates unless noted):

| Purpose | SKR03 | SKR04 |
|---|---|---|
| Revenue 7 % (Logis; Speisen from 2026) | `8300` Erlöse 7 % USt (default tax 7 %) | `4300` (default 7 %) |
| Revenue 19 % (beverages, other) | `8400` (default 19 %) | `4400` (default 19 %) |
| Revenue without VAT | `8200` Erlöse (no default tax) | `4200` Erlöse (default tax 19 % in Odoo: the file must set the tax empty explicitly) |
| Kasse | created by the cash journal, prefix `100` (`1000`) | prefix `160` (`1600`) |
| Geldtransit | transfer account, prefix `1360` | prefix `1460` |
| Guest ledger (Receivables) | `1410` Forderungen aus LuL ohne Kontokorrent (Odoo's default partner receivable in SKR03) | `1210` ohne Kontokorrent (Odoo's default receivable is `1205`) |
| Company invoices (AccountsReceivable) | `1401` Forderungen aus LuL | `1200` |
| Deposits 7 % / 19 % / 0 % | `1711` / `1718` / `1719` | `3260` / `3272` / `3280` |
| Durchlaufende Posten (guest-owed Kurtaxe) | `1590` | `1370` |
| Bad debt 7 % / 19 % / 0 % | `2401` / `2406` (default taxes) / `2400` | `6931` / `6936` / `6930` |

Odoo's own reconcile models in the SKR03 template book "Loss of receivables-19%" on `2406` with `tax_ust_19_skr03` (`template_de_skr03.py`), which confirms that a bad-debt write-off in Odoo is a base line with the sale tax (refund side lowers Kz 81 and the VAT).

The account templates in `apaleo-datev-export` (`templates/skr03-hotel.rules.csv`, `skr04-hotel.rules.csv`, DATEV SKR 03/04 2026) are reused: same account numbers, plus the Odoo tax per row. Differences: no Personenkonto `10000` (Odoo has no DATEV debtor numbers; AR goes to `1401`/`1200`), no BU keys, no automatic-account logic (Odoo's tax comes from `tax_ids`, not from the account).

Community vs Enterprise: the journal entry list and import exist in Community for users with "Show Accounting Features - Readonly" / "Show Full Accounting Features" (`account/security/account_security.xml`, menu `menu_action_move_journal_line_form`); the tax report UI, tax closing and the DATEV/Elster exports are Enterprise (`l10n_de_reports`, `l10n_de_reports_elster`, docs "Germany"). The grids are on the lines in both.

## 5. Austria and Switzerland (via the mapping, no template in v1)

- `l10n_at` (19.0 `account.tax-at.csv`): `account_tax_template_sales_20_code022` (`20% Ust`), `account_tax_template_sales_10_code029` (`10% Ust R`, accommodation), `account_tax_template_sales_13_code006` (`13% Ust R`), `account_tax_template_sales_0_code020` (`0% Ust O Exempt`).
- `l10n_ch` (19.0 `account.tax-ch.csv`): `vat_sale_81` (`8.1%`), `vat_sale_38` (`3.8%`), `vat_sale_26` (`2.6%`), `vat_other_movements_910` (`0% D`, Ziffer 910) and `vat_other_movements_900` (`0% S T`, "Subsidies, tourist taxes", Ziffer 900; the same trap as the Abacus code 490: a Kurtaxe the hotel collects is a durchlaufender Posten, not a Ziffer-900 subsidy).
- Currency: the file books in the company currency (`odoo.currency`, `EUR` default, `CHF` allowed); the property currency must match (`E-CURRENCY`). No foreign-currency lines.
- The docs say that AT and CH users build their mapping by hand with these External IDs and their Steuerberater/Treuhänder; templates are a later contribution.

## 6. Granularity and identity

- **One journal entry per property and business day.** A daily entry matches the apaleo night audit and a cashier's Tagesabschluss, keeps the base fitting per day, and gives the accountant about 30 entries per month to review instead of thousands of lines. Alternative "one entry per apaleo line" (the Abacus writer's model) rejected: thousands of entries, and the cent fitting per line adds more 0.01 lines.
- Inside an entry the tool nets the bookings per (Odoo account, tax, analytic distribution, label); a key with net 0 is dropped and counted.
- `ref` = `apaleo <propertyId> <YYYY-MM-DD>`; entry External ID `apaleo_c<companyId>_<propertyId>_<YYYYMMDD>` (demo: `..._DEMO_...`); line External IDs = entry ID + `_` + 4-digit line number. `name` (the entry number) is left to Odoo's sequence.
- Journal: a dedicated journal of type "Miscellaneous" (Sonstige), configured as `odoo.journal` (its code); recommended code `APA`.

## 7. External API

- Odoo 19 "External JSON-2 API": `POST /json/2/<model>/<method>` with `Authorization: bearer <API key>` and optional `X-Odoo-Database`; "All calls to the JSON-2 endpoint run in their own SQL transaction" (`content/developer/reference/external_api.rst`, 19.0).
- "Both the XML-RPC and JSON-RPC APIs at endpoints `/xmlrpc`, `/xmlrpc/2` and `/jsonrpc` are scheduled for removal in Odoo 22 (fall 2028) / Odoo Online 21.1 (winter 2027)" (same file). Odoo 17 and 18 only have XML-RPC / JSON-RPC.
- "Access to data via the external API is only available on *Custom* Odoo pricing plans. Access to the external API is not available on *One App Free* or *Standard* plans" (same file).
- A push slice would need: two protocols (JSON-2 for 19, XML-RPC for 17/18), an API key with write rights stored as a secret, External IDs through `ir.model.data` for idempotency, per-entry transactions and partial-failure reporting, and a version-by-version test that draft entries keep their tax lines. **Decision: not in v1; listed under `Später geplant` in `docs/maintainers.md`.** The file import covers every plan, edition and version.

## 8. The paid apaleo Odoo connector (what this replaces)

apaleo Store, "odoo Connector" (https://store.apaleo.com/apps/odoo-connector, read 2026-10-24): vendor Grman IT Solutions (Austria, fewer than 10 employees); "Free to install", 60 days free, then 24 EUR per month for one property, 34 EUR for two, 51 EUR for six or more (per property and month, as listed); one-way, "converts apaleo booking transactions and sends them to odoo", daily, monthly or a custom period; setup in the vendor's hosted app (`odoo.afinconnector.com`): configure Odoo companies and journal settings, map apaleo accounts to Odoo accounts once, transfer with one click; English and German. The page does not say which Odoo versions, whether taxes are carried as Odoo taxes, or whether it pushes through the API; we make no claim about it beyond the store page. Our docs compare without naming the vendor.

## 9. German VAT for hotels (reused from apaleo-datev-export)

- Beherbergung 7 % (§ 12 Abs. 2 Nr. 11 UStG); Speisen 7 % for services from 2026-01-01 and 19 % before (Steueränderungsgesetz 2025, as in the DATEV project's mapping guide); beverages 19 %.
- Deposits are taxed when received (Mindest-Ist-Versteuerung, § 13 Abs. 1 Nr. 1 Buchst. a Satz 4 UStG): the deposit line carries the tax of its rate, its release and refund reverse it (refund side in Odoo).
- Guest-owed Kurtaxe / Kurbeitrag: durchlaufender Posten (§ 10 Abs. 1 UStG), SKR03 `1590` / SKR04 `1370`, no tax; hotel-owed Übernachtung- or Beherbergungsteuer (e.g. Berlin): part of the consideration, 7 %. Decided by the Steuerberater; the template leaves the row empty.
- Bad debt: correction of the tax (§ 17 Abs. 2 Nr. 1 UStG) on `2401`/`2406` or `6931`/`6936` with the sale tax.
- No-show and cancellation fees: booked at the rate apaleo applied; whether they are Schadenersatz is the Kanzlei's decision (DATEV template comment kept).
- UStVA Kennzahlen: 81 (19 %), 86 (7 %); the dry run shows the Kennzahl next to each rate.

## 10. Open questions for the first real import

Each answer goes into `docs/maintainers.md` under `## Testimporte` and, where it is a setting, into one constant in `src/odoo/format.ts` or a config key:

1. Does the import accept the technical headers (`line_ids/tax_ids/id`, `line_ids/analytic_distribution`) in the German UI of 17, 18 and 19, and does "Test" pass on a fresh SKR03 and SKR04 database?
2. Does Odoo compute exactly the predicted tax (no "Automatic Balancing Line") for per-line rounding (17/18 default) and per-tax rounding (19 default), including the 0.01 split line and the rounding-account line?
3. Does the Steuerberater accept Odoo's VAT (from the fitted base) differing from apaleo's per-line VAT by a few cents per month, or does the hotel need the later API path with explicit tax amounts?
4. Does an empty `line_ids/tax_ids/id` cell keep a line on SKR03 `8200` or SKR04 `4200` untaxed in 17 and 18 (account default taxes)?
5. Re-import: does an unchanged file over a draft change nothing, over a posted entry change nothing, and does a changed file over a posted entry fail with the protected-fields error?
6. Does `account_id` with `8400` resolve uniquely in 19 when sub-accounts such as `84001` exist (prefix search)?
7. Which menu path and labels does the German UI show (Buchhaltung > Buchungssätze or Journalbuchungen; "Datensätze importieren"), for `docs/odoo-import.md`?
8. Does the audit trail (l10n_de) block deleting draft entries that were never posted? (Expected: no; only `posted_before` entries are protected.)
9. Is `analytic_distribution` with `{"<id>": 100}` imported on base lines and copied to tax lines only for analytic taxes?
10. apaleo VAT type names of a German property: recorded BER chart exists; confirm the 7 % Speisen accounts on a 2026 sandbox day with `live-smoke`.

## Sources

- Odoo source, `github.com/odoo/odoo`, branches 17.0, 18.0, 19.0 (read 2026-10-24): `addons/account/models/account_move.py`, `addons/account/models/account_move_line.py`, `addons/account/models/account_tax.py` (19.0), `addons/account/models/company.py`, `addons/account/models/chart_template.py`, `addons/account/models/account_account.py`, `addons/account/models/account_account_tag.py`, `addons/account/models/account_report.py`, `addons/account/security/account_security.xml`, `addons/account/views/account_menuitem.xml`, `addons/account/static/xls/aml_import_template.xlsx`, `addons/account/static/xls/misc_operations_import_template.xlsx` (19.0), `addons/base_import/models/base_import.py`, `odoo/addons/base/models/ir_fields.py`, `odoo/tools/float_utils.py`, `addons/analytic/models/analytic_mixin.py`, `addons/l10n_de/__manifest__.py`, `addons/l10n_de/models/template_de_skr03.py`, `template_de_skr04.py`, `chart_template.py`, `addons/l10n_de/data/account_account_tags_data.xml`, `addons/l10n_de/data/template/account.tax-de_skr03.csv`, `account.tax-de_skr04.csv`, `account.account-de_skr03.csv`, `account.account-de_skr04.csv`, `addons/l10n_at/data/template/account.tax-at.csv`, `addons/l10n_ch/data/template/account.tax-ch.csv`. Example: https://github.com/odoo/odoo/blob/19.0/addons/account/models/account_move.py
- Odoo documentation 19.0, "Export and import data": https://www.odoo.com/documentation/19.0/applications/essentials/export_import_data.html (source `content/applications/essentials/export_import_data.rst`)
- Odoo documentation 19.0, "External JSON-2 API": https://www.odoo.com/documentation/19.0/developer/reference/external_api.html and "External RPC API" (deprecated): https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html
- Odoo documentation 19.0, "Germany" fiscal localisation (SKR03/SKR04, GoBD audit trail, DATEV, Elster): https://www.odoo.com/documentation/19.0/applications/finance/fiscal_localizations/germany.html
- Odoo documentation 19.0, "Taxes" and "Tax computation": https://www.odoo.com/documentation/19.0/applications/finance/accounting/taxes.html, https://www.odoo.com/documentation/19.0/applications/finance/accounting/taxes/tax_computation.html
- Odoo pricing plans (API on Custom only): https://www.odoo.com/pricing-plan
- apaleo Store, "odoo Connector" (Grman IT Solutions): https://store.apaleo.com/apps/odoo-connector
- apaleo Finance API Swagger: https://api.apaleo.com/swagger/finance-v1/swagger.json
- UStG (§ 10 Abs. 1, § 12 Abs. 2 Nr. 11, § 13 Abs. 1 Nr. 1 Buchst. a, § 17): https://www.gesetze-im-internet.de/ustg_1980/
- apaleo-datev-export (SKR03/SKR04 hotel templates and German mapping guide, MIT, same author): https://github.com/krautdawg/apaleo-datev-export
