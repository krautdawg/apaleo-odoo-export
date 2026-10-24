## ADDED Requirements

### Requirement: Mapping guide for Odoo
`docs/mapping-guide.md` SHALL be rewritten in German as used in Germany (checked by the German (Germany) rules of the docs test from this slice on) for Odoo: the columns (`odoo_account`, `odoo_tax` with the chart-template id or a full External ID, `tax_percent`, `analytic` with the database id of an analytic account and how to find it), the resolution order, the SKR03 and SKR04 templates with a table of every row and its account and tax, the rule that Odoo computes the VAT from the tax of the line and that the tax's rate must equal apaleo's rate, how rates depend on the service date (Logis 7 %, Speisen 7 % for services from 2026-01-01 and 19 % before, Getränke 19 %, the 2020 rates 16 % and 5 %), Anzahlungen with their tax, payments to Geldtransit, guest receivables and company invoices, accounts with a default tax in Odoo and why the file sets the tax explicitly, analytic accounts, every finding of "Mapping validation for Odoo" with its fix, every template row marked `Vorschlag (ungeprüft)`, and a last section `## Checkliste zur Freigabe durch die Kanzlei` that asks, for every mapped account with a tax, whether the Odoo company has that tax with that rate and for every untaxed account whether a default tax could be applied by hand later. Kurtaxe, Beherbergungsteuer, Forderungsverluste and no-show fees SHALL be described as decisions for the Kanzlei with a pointer to the section that o05 completes.

#### Scenario: Steuerberater review
- **WHEN** a Steuerberater reads the mapping guide and a mapping CSV written by `init-mapping --template skr03-hotel`
- **THEN** they can decide each row without running the tool, and the guide ends with the sign-off checklist, which lists for example `8300 -> tax_ust_7_skr03 (7 %)`, `8400 -> tax_ust_19_skr03 (19 %)` and `1718 -> tax_ust_19_skr03 (19 %)`

#### Scenario: Mapping guide is a Germany file
- **WHEN** `pnpm test` runs after this slice
- **THEN** `docs/mapping-guide.md` is checked by the German (Germany) rules, may contain "ß", `SKR03` and `19 %`, and fails on `MWST-Code` or `Treuhänder`
