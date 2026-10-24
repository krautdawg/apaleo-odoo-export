## ADDED Requirements

### Requirement: Template rows for German special cases
The SKR03 and SKR04 hotel templates (version `@2`) SHALL write: for CityTaxes, SecondCityTax and GuestLevies an empty Odoo account and a comment naming both options (guest-owed Kurtaxe or Kurbeitrag as durchlaufender Posten on `1590` / `1370` without tax, § 10 Abs. 1 UStG; hotel-owed Übernachtung- or Beherbergungsteuer passed on to the guest as part of the consideration at 7 % on a revenue account, then also the VAT setting of the account in apaleo) and `docs/mapping-guide.md`; for revenue accounts of apaleo's groups `RevenueCancellationFees` and `RevenueNoShow` and accounts whose name matches cancellation or no-show fees (Storno, Stornierung, Cancellation, No-Show, Noshow) the row of their rate (7 % to `8300` / `4300`, 0 % to `8200` / `4200`) with a comment that the Kanzlei decides whether the fee is consideration or Schadenersatz and that a change belongs in apaleo's VAT setting; for a food revenue account (name matching Speise, Frühstück, Restaurant, Essen, Küche, Halbpension, Vollpension, Catering, Bankett, Food, Breakfast) at 7 % `8300` / `4300` with a comment that Speisen are taxed at 7 % for services from 2026-01-01 and at 19 % before, and that the Kanzlei may want an own 7 % account for Speisen; and for LossOfAccountsReceivable wildcard rows by rate with a comment on § 17 UStG and the lowered Kennzahl. `init-mapping --update` SHALL keep every existing row and SHALL note `N-TEMPLATE-SUGGESTION` for each existing row with an empty Odoo account for which the current template now has a suggestion. Every such row SHALL be marked `Vorschlag (ungeprüft)`.

#### Scenario: Kurtaxe options in the comment
- **WHEN** `init-mapping --template skr03-hotel` runs on a chart with a CityTaxes account
- **THEN** its row has an empty Odoo account and a comment naming `1590` without tax for a guest-owed Kurtaxe, 7 % for a hotel-owed Übernachtungsteuer, and `docs/mapping-guide.md`

#### Scenario: No-show at 7 %
- **WHEN** the chart contains `RevenueNoShow_Reduced:7.00`
- **THEN** its row maps to `8300` with `tax_ust_7_skr03` and 7 and the comment on consideration or Schadenersatz

#### Scenario: Update notes a new suggestion
- **WHEN** a mapping written with `skr03-hotel@1` has an empty row for a no-show account at 7 % and the user runs `init-mapping --template skr03-hotel --update`
- **THEN** the row stays unchanged and `N-TEMPLATE-SUGGESTION` names it with the suggestion `8300` / `tax_ust_7_skr03`

### Requirement: German special-case warnings
`mapping check` SHALL warn `W-CITY-TAX-TAXED` for a CityTaxes, SecondCityTax or GuestLevies row with a tax at a rate above 0, explaining that a guest-owed Kurtaxe or Kurbeitrag that the hotel only collects is a durchlaufender Posten without tax (§ 10 Abs. 1 UStG) and that only a levy the hotel owes itself and passes on is part of the consideration at 7 %. The warning SHALL name the row and its line and SHALL NOT change the exit code.

#### Scenario: Kurtaxe mapped with tax
- **WHEN** a CityTaxes row maps to `8300` with `tax_ust_7_skr03` and 7
- **THEN** `mapping check` warns `W-CITY-TAX-TAXED` naming the row, its line and § 10 Abs. 1 UStG, and exits with code 0 if nothing else fails

#### Scenario: Kurtaxe as durchlaufender Posten
- **WHEN** a CityTaxes row maps to `1590` without tax
- **THEN** no `W-CITY-TAX-TAXED` is raised
