## MODIFIED Requirements

### Requirement: Container image
The repository SHALL contain a multi-stage `Dockerfile` on Node.js 24 slim that runs as a non-root user, reads its config from `/config/apaleo-odoo.config.yaml`, writes exports to `/data`, and uses `apaleo-odoo` as entry point with `schedule --once` as default command.

#### Scenario: Run a one-off export in the container
- **WHEN** the user runs the locally built image with the config and mapping mounted at `/config`, a volume at `/data`, `APALEO_CLIENT_SECRET` set, and the arguments `export --month 2026-10`
- **THEN** the export file is written under `/data` and the container exits with the export's exit code

#### Scenario: Non-root
- **WHEN** the container starts
- **THEN** the process runs as user `node`, not root

### Requirement: Secrets from the environment only
The container SHALL need no secret in the mounted config: `APALEO_CLIENT_SECRET` SHALL come from the environment, and other overrides SHALL be limited to the documented allow-list of scalar keys from the `cli` capability plus `APALEO_ODOO_TIMEZONE`.

#### Scenario: Compose with env file
- **WHEN** the user copies `.env.example` to `.env`, fills in the secret and runs `docker compose -f docker-compose.example.yml up -d --build`
- **THEN** the loop runs `schedule --once` with the secret from `.env` and the config from the mounted file

#### Scenario: Array key through the environment
- **WHEN** the compose file sets `APALEO_ODOO_PROPERTIES=BSP`
- **THEN** the run fails with the message that `properties` can only be set in the config file

### Requirement: Image build check without publishing
CI SHALL build the image and run it with `--help` and `--version` and the real demo (`export --month 2026-09 --demo` with `-w /data` on a data folder owned by uid 1000) on every pull request, SHALL check that the demo file of the default target exists under `demo-output/BSP/2026-09/`, and SHALL NOT log in to or push to any container registry. The image SHALL carry OCI labels for title `apaleo-odoo-export`, a description naming apaleo and Odoo, source and licence `MIT`.

#### Scenario: Pull request
- **WHEN** a pull request changes the Dockerfile
- **THEN** the `docker` job builds the image tagged `apaleo-odoo-export:ci`, runs the three commands, finds the demo file, and pushes nothing

#### Scenario: Labels
- **WHEN** `docker inspect` reads the built image
- **THEN** `org.opencontainers.image.title` is `apaleo-odoo-export`, `org.opencontainers.image.description` names apaleo and Odoo, and `org.opencontainers.image.licenses` is `MIT`
