## MODIFIED Requirements

### Requirement: Config file and environment loading
The CLI SHALL load configuration from the file given by `--config`, else from `APALEO_ODOO_CONFIG`, else from `./apaleo-odoo.config.yaml`, accepting YAML or JSON. Values SHALL be validated against a schema, and every validation error SHALL name the offending key path. Secrets SHALL only be read from environment variables, and a secret key present in the config file SHALL be rejected. Environment overrides SHALL be limited to a documented allow-list of scalar keys; any other `APALEO_ODOO_*` variable SHALL be rejected with an error naming it. An `abacus`, `bmd` or `datev` section SHALL be rejected with an error that names the `odoo` section. The `odoo` section SHALL be required (keys in "Odoo config section"). Variables of the former names (`APALEO_ABACUS_*`, `APALEO_BMD_*`, `APALEO_DATEV_*`) SHALL NOT be read.

#### Scenario: Invalid config value
- **WHEN** the config file sets `odoo.companyId: 0`
- **THEN** loading fails with an error that names `odoo.companyId` and the allowed range

#### Scenario: Old Abacus section
- **WHEN** the config file contains `abacus.mandant`
- **THEN** loading fails with an error saying that `abacus` is not a section of apaleo-odoo and naming `odoo`

#### Scenario: Odoo section missing
- **WHEN** the config file has no `odoo` section
- **THEN** loading fails with an error that names `odoo.journal` and `odoo.version` as required and points to `docs/configuration.md`

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
