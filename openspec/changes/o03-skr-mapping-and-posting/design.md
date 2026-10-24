## Context

o02 added `src/odoo/` with `OdooBooking`, the daily entries, the tax model, the base fitting and `odooTarget`, but the default target is still Abacus and the mapping still has the Abacus columns (`abacus_account`, `mwst_code`, `kost`). The DATEV project (apaleo-datev-export) holds the German hotel knowledge for SKR03 and SKR04 (`templates/skr03-hotel.rules.csv`, `skr04-hotel.rules.csv`, mapping guide), and `openspec/research/o-target.md` §4 maps it to the accounts and taxes of Odoo's l10n_de templates in 17, 18 and 19. The posting module (`src/posting/`) already has the PMS-neutral parts: account resolution, rate inference for untaxed deposit releases, skip rules, the VAT guard, labels without personal data and the summary.

## Goals / Non-Goals

**Goals:**
- A mapping a Steuerberater can read and sign off: one row per apaleo account with the Odoo account code, the Odoo tax and its rate.
- `init-mapping` writes a usable SKR03 or SKR04 mapping on a real apaleo chart, leaving every tax decision it cannot make empty with a comment.
- The export writes Odoo files end to end, with the same guarantees as before: every apaleo line booked, skipped with a reason, or blocked by an `E-` finding; Odoo's VAT equals apaleo's rates.

**Non-Goals:**
- Kurtaxe, Beherbergungsteuer, bad debt and no-show special handling beyond the generic rules (o05); the final demo and example files (o06); removal of Abacus code (o04).

## Decisions

1. **Mapping columns `odoo_account;odoo_tax;tax_percent;analytic`.** `odoo_tax` holds the chart-template id (`tax_ust_7_skr03`) so the same mapping works for any `odoo.companyId`; a value with a `.` is a full External ID for a custom tax. `tax_percent` is the rate the Steuerberater confirms, compared with apaleo's rate by the guard, because the tool cannot read the tax's rate from Odoo offline. `analytic` holds the database id of an Odoo analytic account (research §2: the import needs the id). Alternative: tax by name (`19%`). Rejected: names repeat across companies and custom taxes; the import takes the first match.
2. **Known l10n_de taxes and accounts as a table.** `src/mapping/l10n-de.ts` lists the sale tax template ids of SKR03 and SKR04 with rate and Kennzahl (`tax_ust_19_*` 19 Kz 81, `tax_ust_7_*` 7 Kz 86, `tax_not_taxable_*` 0) and the template accounts that carry a default tax in Odoo (SKR03 `8300`, `8400`, `2401`, `2406`; SKR04 `4200`, `4300`, `4400`, `6931`, `6936`). `mapping check` warns `W-TAX-UNCHECKED` for any other tax value (confirm with the Steuerberater that it is a sale tax of the company), `W-TAX-RATE` when a known tax is used at another rate, and notes `N-DEFAULT-TAX-ACCOUNT` for an untaxed row on an account with a default tax (the file sets the tax empty explicitly; do not edit such a line by hand in Odoo, it would get the default tax back in 17 and 18). Alternative: no table. Rejected: a 7 % tax on a 19 % row is the most likely copy error and costs nothing to catch.
3. **Templates reuse the DATEV account numbers.** Revenue 7 % `8300` / `4300` (Logis, Speisen from 2026, no-show and cancellation fees that apaleo taxes at 7 %), 19 % `8400` / `4400`, 0 % `8200` / `4200`; Kasse `1000` / `1600`; every non-cash payment to Geldtransit `1360` / `1460`; guest ledger `1410` / `1210`; company invoices `1401` / `1200` (Odoo has no DATEV Personenkonto `10000`); deposits `1711`, `1718`, `1719` / `3260`, `3272`, `3280`; bad debt `2401`, `2406`, `2400` / `6931`, `6936`, `6930`; CityTaxes, SecondCityTax, GuestLevies, House and TransitoryItems empty with a comment; historic 2020 rates (16 %, 5 %) empty. Every row is marked `Vorschlag (ungeprüft)` and names its source (Odoo l10n_de template, branch, check date). The template ids get a `@1` version tag in the first comment line (`skr03-hotel@1`), so `--update` can tell old suggestions.
4. **One `OdooBooking` per ledger line, VAT side by the row's tax.** The side whose row has an `odoo_tax` is the VAT side; its net is gross minus apaleo's tax rounded half away from zero to cents; both sides keep their accounts and labels; the writer nets and fits (o02). Two VAT sides stay `E-TWO-VAT-SIDES`; a tax on a Payments, Receivables or AccountsReceivable row stays an error (`E-TAX-NOT-ALLOWED`), because Odoo would compute VAT on money or a claim. The Abacus check value `round(|gross| × rate / (100 + rate))` and `W-VAT-ROUNDING` no longer apply: Odoo computes from the net, and the fitting reports its difference per rate and day.
5. **Labels for Germany, stable per account.** Labels come from `src/posting/describe.ts` rewritten in German as used in Germany: `Erlöse Beherbergung 7 %`, `Erlöse Speisen 7 %`, `Erlöse Getränke 19 %`, `Erlöse sonstige 19 %`, `Zahlung Visa`, `Zahlung bar`, `Gästeforderungen`, `Forderungen Firmenrechnungen`, `Anzahlungen 7 %`, `Kurtaxe`, `Forderungsverluste 19 %`. A label never depends on a folio or reservation name, so the netting key collects all lines of an account and the guest ledger nets to its daily change. The receipt and reference numbers go to the protocol, not to the label.
6. **Analytic account only on revenue and bad-debt rows.** Like the Kostenstelle before: other rows with an `analytic` value raise `W-ANALYTIC-IGNORED`. Odoo copies a base line's analytic distribution to its tax line only for analytic taxes, which l10n_de does not use.
7. **Switch the default target here, keep Abacus tests explicit until o04.** `DEFAULT_TARGET` becomes `odooTarget`, the `odoo` section required, the `abacus` section optional and unused; the Abacus writer, its golden files and the Swiss month tests stay, run with `abacusTarget` and an Abacus mapping fixture passed explicitly, so this slice stays green and o04 is pure deletion.
8. **German fixture month and demo.** `test/fixtures/apaleo/de-month/` (property `BSP` "Hotel Beispiel Berlin", EUR, `Europe/Berlin`, September 2026), fabricated in the shapes of the recorded BER data (eight-decimal net and tax, per-reservation accounts with `parentNumber`, `/Offset` lines, releases as negative charges with `taxes[]`): lodging and breakfast at 7 %, drinks and minibar at 19 %, a deposit at 7 % received, released and partly refunded, card, cash and invoice payments, an invoice on accounts receivable, an untaxed revenue line, a cancellation fee at 7 %, and gross amounts chosen so that both rounding modes need at least one rounding cent. `examples/demo/` switches to a copy of it with the SKR03 template mapping; the polished example files follow in o06. Kurtaxe, Beherbergungsteuer and a write-off are added in o05.

## Risks / Trade-offs

- [The template's 7 % row for Speisen shares `8300` with Logis] → the comment asks the Kanzlei whether to open an own 7 % account; the mapping guide shows how.
- [A hotel's Odoo company uses a non-standard chart] → `W-TAX-UNCHECKED` and the sign-off checklist; accounts are plain codes the Steuerberater can change.
- [Switching the default target breaks tests written for Abacus] → task 4.3 passes `abacusTarget` explicitly; o04 deletes them.

## Migration Plan

Not applicable: no installation exists. A local Abacus mapping is refused with the hint to run `init-mapping --template skr03-hotel`.

## Open Questions

- Does the Kanzlei want Speisen on an own 7 % account from 2026 (for example `8301`, created in Odoo)? The template leaves it on `8300` with a comment.
