# cli Specification

## Purpose
The `apaleo-datev` command line interface: help and version output, subcommand dispatch, stable exit codes, the injected `CommandContext` that carries every side effect, and loading of the config file and environment.
## Requirements
### Requirement: CLI entry point with help and version
The tool SHALL install a binary named `apaleo-odoo` (package `apaleo-odoo-export`). Running it with `--help`, `-h` or no arguments SHALL print the usage, the list of registered subcommands with a one-line summary each, and a pointer to `DISCLAIMER.md`. Running it with `--version` SHALL print the package version. No binary named `apaleo-abacus`, `apaleo-bmd` or `apaleo-datev` SHALL be installed.

#### Scenario: Help output
- **WHEN** the user runs `apaleo-odoo --help`
- **THEN** the output starts with the usage line `apaleo-odoo <command> [options]`, lists every registered subcommand with its summary and mentions the disclaimer, and the exit code is 0

#### Scenario: Version output
- **WHEN** the user runs `apaleo-odoo --version`
- **THEN** the output is the version from `package.json` and the exit code is 0

#### Scenario: Old binary name is gone
- **WHEN** `package.json` is inspected after `pnpm build`
- **THEN** its `bin` field has exactly one entry, `apaleo-odoo`, and its `name` is `apaleo-odoo-export`

### Requirement: Subcommand dispatch and exit codes
The CLI SHALL dispatch to registered subcommands by name, SHALL support `apaleo-odoo <command> --help`, and SHALL use exit code 0 for success, 1 for runtime or validation failures, and 2 for usage errors.

#### Scenario: Unknown subcommand
- **WHEN** the user runs `apaleo-odoo frobnicate`
- **THEN** the CLI prints an error naming the unknown command and the help hint, and exits with code 2

#### Scenario: Unknown flag
- **WHEN** the user passes a flag that the subcommand does not define
- **THEN** the CLI prints an error naming the flag and exits with code 2

#### Scenario: Command runs against a fake context
- **WHEN** a test calls `runCli(['doctor'], ctx)` with a context from `createTestContext()` whose `fetchFn` throws on any call and whose `now()` returns 2026-10-20T08:00:00Z
- **THEN** the returned exit code is 0, the captured stdout contains the resolved config path, and no network call or real clock read happens

#### Scenario: Runtime failure
- **WHEN** a subcommand throws a user-facing error
- **THEN** the CLI prints the error message without a stack trace (unless `--debug` is set) and exits with code 1

### Requirement: Injected command context
Every subcommand SHALL receive a `CommandContext` (`env`, `stdout`, `stderr`, `cwd`, `now()`, `fetchFn`, `fs`, optional `sourceFactory`) and SHALL perform all I/O, clock reads and network calls through it. The dispatcher SHALL be callable in-process as `runCli(argv, ctx)` returning the exit code.

#### Scenario: Clock comes from the context
- **WHEN** a command that needs today's date runs with a context whose `now()` returns a fixed instant
- **THEN** its output depends only on that instant, not on the machine clock

### Requirement: Config file and environment loading
The CLI SHALL load configuration from the file given by `--config`, else from `APALEO_ODOO_CONFIG`, else from `./apaleo-odoo.config.yaml`, accepting YAML or JSON. Values SHALL be validated against a schema, and every validation error SHALL name the offending key path. Secrets SHALL only be read from environment variables, and a secret key present in the config file SHALL be rejected. Environment overrides SHALL be limited to a documented allow-list of scalar keys; any other `APALEO_ODOO_*` variable SHALL be rejected with an error naming it. An `abacus`, `bmd` or `datev` section SHALL be rejected with an error that names the `odoo` section. The `odoo` section SHALL be required (keys in "Odoo config section"). Variables of the former names (`APALEO_ABACUS_*`, `APALEO_BMD_*`, `APALEO_DATEV_*`) SHALL NOT be read.

#### Scenario: Invalid config value
- **WHEN** the config file sets `odoo.companyId: 0`
- **THEN** loading fails with an error that names `odoo.companyId` and the allowed range

#### Scenario: Old Abacus section
- **WHEN** the config file contains `abacus.mandant`
- **THEN** loading fails with an error saying that `abacus` is not a section of apaleo-odoo and naming `odoo`

#### Scenario: Abacus section no longer needed
- **WHEN** the config file has an `odoo` section and no `abacus` section
- **THEN** loading succeeds

#### Scenario: Abacus section missing
- **WHEN** the config file has an `odoo` section and no `abacus` section
- **THEN** `doctor` reports the config as valid and prints no Abacus line

#### Scenario: Mandant missing
- **WHEN** the config file has an `abacus` section without `mandant`
- **THEN** loading fails with the error that `abacus` is not a section of apaleo-odoo, naming `odoo`, and does not report `abacus.mandant` as required

#### Scenario: Invalid Leitwährung
- **WHEN** the config file sets `abacus.leitwaehrung: USD`
- **THEN** loading fails with the error that `abacus` is not a section of apaleo-odoo, naming `odoo`; the currency of the file is `odoo.currency`

#### Scenario: Abacus defaults
- **WHEN** an `abacus` section sets only `mandant: 1234`
- **THEN** loading fails with the error that `abacus` is not a section of apaleo-odoo, and no Abacus default is applied

#### Scenario: MWST-Code with a leading zero without quotes
- **WHEN** the config has `abacus.mwstCodes.normal: 011`
- **THEN** loading fails with the error that `abacus` is not a section of apaleo-odoo, naming `odoo`, before any check of the value

#### Scenario: Two properties share a Mandant
- **WHEN** properties `BSP` and `BS2` set `mandant` or `geschaeftsbereich`
- **THEN** loading fails naming `properties.0.mandant` or `properties.0.geschaeftsbereich` as an unknown key, and no command reports `W-MANDANT-SHARED`

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

### Requirement: Odoo config section
The config schema SHALL accept a section `odoo` with `journal` (required in the section, the code of the Odoo journal, 1 to 5 characters of `A-Z` and `0-9`), `companyId` (integer 1 to 999999, default `1`, the database id of the Odoo company that owns the taxes, for a branch company its root company, used in the tax and entry External IDs), `currency` (`EUR` or `CHF`, default `EUR`), `version` (`17`, `18` or `19`, required in the section), `taxRounding` (`per_line` or `per_tax`, default `per_line` for versions 17 and 18 and `per_tax` for 19) and `roundingAccount` (an Odoo account code matching `^[A-Za-z0-9.]{1,64}$`, no default, required when the effective `taxRounding` is `per_tax`), and each property MAY override `journal`. A number written without quotes where a code is expected (`journal: 100`) SHALL be read as text. The section SHALL be required; `doctor` SHALL print the effective `odoo` values and say that the rounding method must equal the Odoo company setting (Settings > Accounting > Taxes > Rounding Method).

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

