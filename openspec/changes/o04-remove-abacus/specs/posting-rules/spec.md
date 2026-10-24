## REMOVED Requirements

### Requirement: Vereinnahmte Entgelte
**Reason**: `abacus.abrechnungsart` and the Abacus Hilfskonto are removed; Odoo's cash-basis taxes are a setting of the Odoo tax, not of the import file.
**Migration**: None in v1; a hotel taxed on receipts (Ist-Versteuerung) asks its Steuerberater, and `docs/odoo-import.md` names the question.

### Requirement: Swiss fixture month
**Reason**: The Swiss month in CHF tested the Abacus target and the KMU template, which are removed.
**Migration**: See "German fixture month"; CHF is still accepted with `odoo.currency: CHF` and covered by the export-run scenario "Swiss company".
