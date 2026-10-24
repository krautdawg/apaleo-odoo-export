## Why

`schedule --once` and the Docker setup work unchanged since o01, but they still assume a Swiss hotel: the default time zone is `Europe/Zurich`, the compose comments and `docs/docker.md` are in Swiss Standard German and point the Treuhänder to an Abacus XML file, and the scheduler spec still names the old binary. German hotels need the schedule in `Europe/Berlin` and a Docker guide that ends with the CSV the Kanzlei imports into Odoo.

## What Changes

- **BREAKING** `schedule.timezone` defaults to `Europe/Berlin`; the scheduler spec names `apaleo-odoo` and the Odoo file.
- `docker-compose.example.yml`, `.env.example` and `Dockerfile` comments in German as used in Germany; commented `APALEO_ODOO_TIMEZONE: Europe/Berlin`.
- `docs/docker.md` rewritten in German as used in Germany: the loop, the host-cron alternative, where the Odoo files are (`/data/<propertyId>/<YYYY-MM>/ODOO_Buchungen_*.csv` with protocol), that handing them to the Kanzlei or importing them into Odoo is up to the hotel, the demo in the image, updates.
- CI's docker job checks the Odoo demo file `demo-output/BSP/2026-09/ODOO_Buchungen_20260901-20260930_BSP_DEMO.csv`.
- Scheduler scenarios use German findings (`W-FOOD-RATE`, `N-ODOO-ROUNDING-LINE`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scheduler`: binary name, default time zone, Odoo file, German findings in scenarios.
- `container-deployment`: compose and env examples, image build check with the Odoo demo file.
- `documentation`: Docker guide for Germany.

## Non-goals

- No in-process daemon, no registry image, no upload into Odoo, no e-mail delivery.
- No change of the cadence rules or the finality rules.

## Impact

- `src/core/config.ts` (default time zone), `src/schedule/`, `Dockerfile`, `docker-compose.example.yml`, `.env.example`, `.github/workflows/ci.yml`, `docs/docker.md`, tests in `test/schedule/` and `test/cli/schedule.test.ts`.
