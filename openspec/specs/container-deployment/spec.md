# container-deployment Specification

## Purpose
Running the tool in a locally built container: the multi-stage, non-root Node.js 24 image with `/config` and `/data` volumes, the compose and `.env` examples that run `schedule --once` in a loop with secrets from the environment only, and the CI check that builds and runs the image without publishing it.
## Requirements
### Requirement: Container image
The repository SHALL contain a multi-stage `Dockerfile` on Node.js 24 slim that runs as a non-root user, reads its config from `/config/apaleo-abacus.config.yaml`, writes exports to `/data`, and uses `apaleo-abacus` as entry point with `schedule --once` as default command.

#### Scenario: Run a one-off export in the container
- **WHEN** the user runs the locally built image with the config and mapping mounted at `/config`, a volume at `/data`, `APALEO_CLIENT_SECRET` set, and the arguments `export --month 2026-10`
- **THEN** the export file is written under `/data` and the container exits with the export's exit code

#### Scenario: Non-root
- **WHEN** the container starts
- **THEN** the process runs as user `node`, not root

### Requirement: Secrets from the environment only
The container SHALL need no secret in the mounted config: `APALEO_CLIENT_SECRET` SHALL come from the environment, and other overrides SHALL be limited to the documented allow-list of scalar keys from the `cli` capability plus `APALEO_ABACUS_TIMEZONE`.

#### Scenario: Compose with env file
- **WHEN** the user copies `.env.example` to `.env`, fills in the secret and runs `docker compose -f docker-compose.example.yml up -d --build`
- **THEN** the loop runs `schedule --once` with the secret from `.env` and the config from the mounted file

#### Scenario: Array key through the environment
- **WHEN** the compose file sets `APALEO_ABACUS_PROPERTIES=BSP`
- **THEN** the run fails with the message that `properties` can only be set in the config file

### Requirement: Compose and env examples
The repository SHALL contain `docker-compose.example.yml` (one locally built service `apaleo-abacus` with the image name `apaleo-abacus-export:local`, restart policy, config and data volumes, env file, a `while sleep` loop around `schedule --once`, and a commented `APALEO_ABACUS_TIMEZONE: Europe/Zurich`) and `.env.example` listing the secret variable names with empty values, both commented in Swiss Standard German, and `docs/docker.md` SHALL document in Swiss Standard German the loop, the host-cron alternative, where the Treuhänder finds the Abacus files (`/data/<propertyId>/<YYYY-MM>/ABACUS_Buchungen_*.xml` with protocol) and that handing them over (shared folder or the Treuhänder's own transfer) is up to the hotel.

#### Scenario: No secret values committed
- **WHEN** the repository is inspected
- **THEN** `.env.example` contains only variable names with empty values and `.env` is git-ignored

#### Scenario: No customer data committed
- **WHEN** the documented compose or host-cron setup creates `config/`, `data/` and `schedule.log` inside the clone
- **THEN** git ignores all three, as well as a root `mapping-*.csv` and `apaleo-abacus.config.yaml`, so `git add -A` cannot commit account numbers, the mapping or exported bookings

#### Scenario: Image name is local
- **WHEN** `docker-compose.example.yml` is inspected
- **THEN** the service has both `build:` and `image: apaleo-abacus-export:local`, and no registry host appears

#### Scenario: Where the files are
- **WHEN** a hotel reads `docs/docker.md`
- **THEN** it finds the path of the monthly Abacus file and its protocol for one property, and the sentence that the tool sends nothing by e-mail or to a cloud

### Requirement: Image build check without publishing
CI SHALL build the image and run it with `--help` and `--version` and the real demo (`export --month 2026-09 --demo` with `-w /data` on a data folder owned by uid 1000) on every pull request, SHALL check that the demo file `demo-output/BSP/2026-09/ABACUS_Buchungen_20260901-20260930_BSP_DEMO.xml` exists, and SHALL NOT log in to or push to any container registry. The image SHALL carry OCI labels for title `apaleo-abacus-export`, a description naming apaleo and Abacus, source and licence `MIT`.

#### Scenario: Pull request
- **WHEN** a pull request changes the Dockerfile
- **THEN** the `docker` job builds the image tagged `apaleo-abacus-export:ci`, runs the three commands, finds the demo file, and pushes nothing

#### Scenario: Labels
- **WHEN** `docker inspect` reads the built image
- **THEN** `org.opencontainers.image.title` is `apaleo-abacus-export`, `org.opencontainers.image.description` names apaleo and Abacus, and `org.opencontainers.image.licenses` is `MIT`

