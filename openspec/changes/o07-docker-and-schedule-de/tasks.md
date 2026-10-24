## 1. Schedule

- [ ] 1.1 `src/core/config.ts`: default `schedule.timezone` `Europe/Berlin`; `docs/configuration.md` updated
- [ ] 1.2 Update the scheduler tests to Berlin times and the German findings of the scheduler delta (`W-FOOD-RATE`, `N-ODOO-ROUNDING-LINE`); keep every cadence and finality case

## 2. Docker

- [ ] 2.1 `docker-compose.example.yml`, `.env.example` and `Dockerfile` comments in German (Germany); commented `APALEO_ODOO_TIMEZONE: Europe/Berlin`
- [ ] 2.2 `.github/workflows/ci.yml` docker job: check `demo-output/BSP/2026-09/ODOO_Buchungen_20260901-20260930_BSP_DEMO.csv`
- [ ] 2.3 Rewrite `docs/docker.md` per "Docker guide for Germany" and add it to `GERMANY_FILES`

## 3. Release check

- [ ] 3.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green
- [ ] 3.2 `docker build -t apaleo-odoo-export:ci .`, then the demo with `-w /data` as in `docs/docker.md` writes the Odoo demo file
