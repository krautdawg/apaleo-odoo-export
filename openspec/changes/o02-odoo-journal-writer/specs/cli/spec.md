## ADDED Requirements

### Requirement: Odoo config section
The config schema SHALL accept a section `odoo` with `journal` (required in the section, the code of the Odoo journal, 1 to 5 characters of `A-Z` and `0-9`), `companyId` (integer 1 to 999999, default `1`, the database id of the Odoo company that owns the taxes, for a branch company its root company, used in the tax and entry External IDs), `currency` (`EUR` or `CHF`, default `EUR`), `version` (`17`, `18` or `19`, required in the section), `taxRounding` (`per_line` or `per_tax`, default `per_line` for versions 17 and 18 and `per_tax` for 19) and `roundingAccount` (an Odoo account code matching `^[A-Za-z0-9.]{1,64}$`, no default, required when the effective `taxRounding` is `per_tax`), and each property MAY override `journal`. A number written without quotes where a code is expected (`journal: 100`) SHALL be read as text. Until o03 makes Odoo the default target, the section SHALL be optional; `doctor` SHALL print the effective `odoo` values when the section is present and say that the rounding method must equal the Odoo company setting.

#### Scenario: Odoo defaults
- **WHEN** the `odoo` section sets only `journal: APA` and `version: 17`
- **THEN** the effective values are `companyId` 1, `currency` `EUR` and `taxRounding` `per_line`

#### Scenario: Version 19 rounds per tax
- **WHEN** the `odoo` section sets `journal: APA`, `version: 19` and `roundingAccount: "2700"`
- **THEN** the effective `taxRounding` is `per_tax`

#### Scenario: Rounding account missing
- **WHEN** the `odoo` section sets `journal: APA` and `version: 19` and no `roundingAccount`
- **THEN** loading fails with an error that names `odoo.roundingAccount`, says that it is required with `taxRounding: per_tax` and points to `docs/configuration.md`

#### Scenario: Journal code too long
- **WHEN** the config sets `odoo.journal: APALEO`
- **THEN** loading fails with an error naming `odoo.journal` and the limit of 5 characters

#### Scenario: Unsupported version
- **WHEN** the config sets `odoo.version: 16`
- **THEN** loading fails with an error naming `odoo.version` and the allowed values 17, 18 and 19

#### Scenario: Invalid currency
- **WHEN** the config sets `odoo.currency: USD`
- **THEN** loading fails with an error that names `odoo.currency` and the allowed values `EUR` and `CHF`
