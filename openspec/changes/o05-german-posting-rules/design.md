## Context

After o04 the code knows only Odoo. The generic posting rules (VAT side by the row's tax, the guard, deposit rate inference, skip rules) already book every case through its mapping row; what is missing is the German view of the special cases, which `openspec/research/o-target.md` §9 records from the DATEV project and the UStG, and the Odoo view of them (§3-4): in an Odoo journal entry a base line with a sale tax on the debit side is a refund and lowers the grid and the VAT, which is exactly how a deposit release, a refund and a bad-debt write-off must work. Odoo's own SKR03/SKR04 reconcile models book "Loss of receivables-19%" on `2406`/`6936` with the 19 % sale tax.

## Goals / Non-Goals

**Goals:**
- Every German special case is booked the way Odoo would book it in its own UI, with the grids right (Kz 81/86 raised by revenue and deposits received, lowered by allowances, releases, refunds and write-offs).
- The template and `mapping check` name every decision the Kanzlei has to make, and never make it.

**Non-Goals:**
- Cash-basis taxes, payment-provider fees, booking-portal commissions, per-partner receivables.

## Decisions

1. **Kurtaxe by mapping, never by the tool.** A guest-owed Kurtaxe or Kurbeitrag is a durchlaufender Posten (§ 10 Abs. 1 UStG) on `1590` / `1370` without tax; a hotel-owed Übernachtung- or Beherbergungsteuer that the hotel passes on is part of the consideration and taxed at 7 % on a revenue account (for example `8300` with `tax_ust_7_skr03`). The template leaves the rows empty with both options in the comment; `W-CITY-TAX-TAXED` reminds the Kanzlei to confirm a taxed row, without changing the exit code. Alternative: pre-fill `1590`. Rejected: Berlin and other cities levy a tax the hotel owes, and a wrong guess would put VAT in or out of the return.
2. **Deposits: the tax of their rate on receipt, reversed on release and refund.** The deposit line is a base line on `1711`/`1718` (`3260`/`3272`) with the sale tax of its rate: credited on receipt (invoice side, raises the grid), debited on release and refund (refund side, lowers it). The final invoice's revenue line then raises the grid again, so the net effect over a stay is the revenue. Odoo's tax lines land on `1771`/`1776`, not on separate deposit-VAT accounts; the summary shows deposit tax per rate separately so the Kanzlei can reconcile. Alternative: book deposits without tax and the VAT on a separate account. Rejected: Odoo would not put the deposit VAT into the grids.
3. **Bad debt as a refund-side base line.** A write-off debits `2401`/`2406` (`6931`/`6936`) with the sale tax of its rate and credits the guest or company receivable; Odoo computes a negative VAT and lowers Kz 81/86, which is the correction of § 17 Abs. 2 Nr. 1 UStG. A write-off without `taxes[]` goes to `2400`/`6930` without tax. The template's wildcard rows (o03) carry this; o05 adds the comments and the fixture.
4. **Cancellation and no-show fees at apaleo's rate.** The tool books the rate apaleo applied; the comment says that whether the fee is consideration or Schadenersatz is the Kanzlei's decision and that a change belongs in apaleo's VAT setting, not in the mapping (the guard would stop a mismatch with `E-VAT-RATE`). An untaxed fee goes to `8200` / `4200` like other untaxed revenue.
5. **`W-FOOD-RATE` by service date.** The VAT on Speisen in restaurants changed from 19 % to 7 % for services from 2026-01-01; the most likely error after the change is an apaleo food account still at 19 %. The export warns per day when a line whose apaleo account name matches the template's food pattern carries 19 % on or after 2026-01-01, or 7 % before; beverages are not matched. The warning does not block, because a food account can legitimately hold drinks.
6. **Template version `@2`.** The comments change and rows for the special cases are added; `init-mapping --update` keeps every existing row and notes `N-TEMPLATE-SUGGESTION` for rows with an empty Odoo account where the new template now has a suggestion.

## Risks / Trade-offs

- [A hotel uses cash-basis taxes in Odoo (Ist-Versteuerung)] → the docs name it as a question for the Kanzlei; the tool books the Soll-Versteuerung taxes of the templates.
- [Deposit VAT and revenue VAT share `1771`/`1776`] → the protocol shows them apart per rate; the Kanzlei can split accounts with own taxes if needed (`W-TAX-UNCHECKED` then asks for the confirmation).

## Open Questions

- Which account does the Kanzlei want for an untaxed no-show fee treated as Schadenersatz (for example SKR03 `2742`, SKR04 `4970`)? The template keeps `8200` / `4200` and says so.
