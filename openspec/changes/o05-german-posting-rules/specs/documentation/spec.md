## ADDED Requirements

### Requirement: Posting rules doc for Odoo
`docs/posting-rules.md` SHALL be rewritten in German as used in Germany (checked by the German (Germany) rules of the docs test from this slice on) for Odoo: one journal entry per day and property, netting per account, tax, analytic account and label, the VAT side and why the file carries net bases with the Odoo tax and no tax lines, the base fitting with the rounding methods and the `Rundungsausgleich` lines, the tax guard and its findings, the German special cases with one table each from the German fixture month (Kurtaxe and Übernachtungsteuer, deposits received, released and refunded with their effect on Kz 86, accounts receivable, write-offs with § 17 UStG, cancellation and no-show fees, payments and the `/Offset` lines), the skipped lines, the labels and the summary, with an excerpt of the CSV for one day. `docs/mapping-guide.md` SHALL complete its sections on Kurtaxe, Beherbergungsteuer, Forderungsverluste, no-show fees and the Speisen rate with the findings `W-CITY-TAX-TAXED`, `W-FOOD-RATE` and `N-TEMPLATE-SUGGESTION`.

#### Scenario: Kanzlei reads how a deposit is booked
- **WHEN** a Steuerberater reads the deposit section of `docs/posting-rules.md`
- **THEN** it shows the received, released and refunded deposit of the German month as entry lines on `1711` with `tax_ust_7_skr03`, the side of each, and that the release lowers Kz 86 by the deposit while the revenue line raises it again
