## MODIFIED Requirements

### Requirement: Config file and environment loading
The CLI SHALL load configuration from the file given by `--config`, else from `APALEO_ODOO_CONFIG`, else from `./apaleo-odoo.config.yaml`, accepting YAML or JSON. Values SHALL be validated against a schema, and every validation error SHALL name the offending key path. Secrets SHALL only be read from environment variables, and a secret key present in the config file SHALL be rejected. Environment overrides SHALL be limited to a documented allow-list of scalar keys; any other `APALEO_ODOO_*` variable SHALL be rejected with an error naming it. A `bmd` or `datev` section SHALL be rejected with an error that names the `odoo` section. The `odoo` section SHALL be required (keys in "Odoo config section"). The `abacus` section SHALL be optional and is used only by tests that pass the Abacus target explicitly until o04 removes it; when present it SHALL accept `mandant` (required, 1 to 6 digits, no default), `leitwaehrung` (`CHF` or `EUR`, default `CHF`), `abrechnungsart` (`vereinbart` or `vereinnahmt`, default `vereinbart`), `version` (`2015.00`, `2020.00`, `2022.00` or `2024.00`, default `2015.00`), `mwstKonto` (1 to 11 digits, default `2200`), `mwstHilfskonto` (1 to 11 digits, default `2202`), `mwstCodes.normal`, `mwstCodes.reduziert` and `mwstCodes.beherbergung` (1 to 3 characters of `A-Z`, `a-z`, `0-9`, defaults `311`, `312` and `313`) and `geschaeftsbereich` (0 to 99999999, default `0`), and each property MAY override `mandant` and `geschaeftsbereich`. `doctor` and the export protocol SHALL warn `W-MANDANT-SHARED` when two configured properties have the same effective Mandant and Geschäftsbereich. Variables of the former names (`APALEO_ABACUS_*`, `APALEO_BMD_*`, `APALEO_DATEV_*`) SHALL NOT be read.

#### Scenario: Invalid config value
- **WHEN** the config file sets `abacus.geschaeftsbereich: -1`
- **THEN** loading fails with an error that names `abacus.geschaeftsbereich` and the allowed range

#### Scenario: Odoo section missing
- **WHEN** the config file has no `odoo` section
- **THEN** loading fails with an error that names `odoo.journal` and `odoo.version` as required and points to `docs/configuration.md`

#### Scenario: Abacus section no longer needed
- **WHEN** the config file has an `odoo` section and no `abacus` section
- **THEN** loading succeeds

#### Scenario: Mandant missing
- **WHEN** the config file has an `abacus` section without `mandant`
- **THEN** loading fails with an error that names `abacus.mandant` as required and says that it is the Mandantennummer in Abacus

#### Scenario: Invalid Leitwährung
- **WHEN** the config file sets `abacus.leitwaehrung: USD`
- **THEN** loading fails with an error that names `abacus.leitwaehrung` and the allowed values `CHF` and `EUR`

#### Scenario: Abacus defaults
- **WHEN** the `abacus` section sets only `mandant: 1234`
- **THEN** the effective values are `leitwaehrung` `CHF`, `abrechnungsart` `vereinbart`, `version` `2015.00`, `mwstKonto` `2200`, `mwstHilfskonto` `2202`, `mwstCodes` `311`, `312`, `313` and `geschaeftsbereich` `0`

#### Scenario: MWST-Code with a leading zero without quotes
- **WHEN** the config has `abacus.mwstCodes.normal: 011`
- **THEN** loading fails with an error naming `abacus.mwstCodes.normal`, saying that `011` is read as the number 11, and showing `normal: "011"`; with the quotes the code is `011`

#### Scenario: Two properties share a Mandant
- **WHEN** properties `BSP` and `BS2` are configured with the same `abacus.mandant` and neither sets `geschaeftsbereich`
- **THEN** `doctor` warns `W-MANDANT-SHARED` naming both properties, and explains that their Belegnummern could repeat and that each property needs its own Geschäftsbereich or Mandant

#### Scenario: Old BMD section
- **WHEN** the config file contains `bmd.buchsymbol`
- **THEN** loading fails with an error saying that `bmd` is not a section of apaleo-odoo and naming `odoo`

#### Scenario: Old DATEV section
- **WHEN** the config file contains `datev.beraternummer`
- **THEN** loading fails with an error saying that `datev` is not a section of apaleo-odoo and naming `odoo`

#### Scenario: Secret in config file
- **WHEN** the config file contains `apaleo.clientSecret`
- **THEN** loading fails with an error telling the user to set `APALEO_CLIENT_SECRET` in the environment instead

#### Scenario: Syntax error does not quote the file
- **WHEN** the config file has a YAML or JSON syntax error next to a line such as `clientSecret: SUPERSECRET`
- **THEN** loading fails with an error that gives the file path, line, column and kind of error, and does not quote any content of the file

#### Scenario: Empty section or value
- **WHEN** a section such as `apaleo:` has all its keys commented out, or a value such as `odoo.journal:` is left empty
- **THEN** the key is treated as missing, so defaults apply and a required key is reported as `is required`, whether or not an environment override is set

#### Scenario: Environment override
- **WHEN** `APALEO_ODOO_OUTPUT_DIR=/data/out` is set and the file sets `output.dir: ./out`
- **THEN** the effective value of `output.dir` is `/data/out`

#### Scenario: Array key cannot be set from the environment
- **WHEN** `APALEO_ODOO_PROPERTIES=BER,MUC` is set
- **THEN** loading fails with an error naming the variable and saying that `properties` is an array that can only be set in the config file

#### Scenario: Missing config file
- **WHEN** no config file exists at the resolved path and the subcommand needs config
- **THEN** the CLI exits with code 1 and prints the path it looked for and how to create the file

#### Scenario: Old variable names are not read
- **WHEN** only `APALEO_ABACUS_CONFIG=/x/old.yaml` is set and `./apaleo-odoo.config.yaml` exists
- **THEN** the CLI loads `./apaleo-odoo.config.yaml` and ignores the old variable

### Requirement: Odoo config section
The config schema SHALL accept a section `odoo` with `journal` (required in the section, the code of the Odoo journal, 1 to 5 characters of `A-Z` and `0-9`), `companyId` (integer 1 to 999999, default `1`, the database id of the Odoo company used in External IDs), `currency` (`EUR` or `CHF`, default `EUR`), `version` (`17`, `18` or `19`, required in the section), `taxRounding` (`per_line` or `per_tax`, default `per_line` for versions 17 and 18 and `per_tax` for 19) and `roundingAccount` (an Odoo account code matching `^[A-Za-z0-9.]{1,64}$`, no default, required when the effective `taxRounding` is `per_tax`), and each property MAY override `journal`. A number written without quotes where a code is expected (`journal: 100`) SHALL be read as text. The section SHALL be required; `doctor` SHALL print the effective `odoo` values and say that the rounding method must equal the Odoo company setting (Settings > Accounting > Taxes > Rounding Method).

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
