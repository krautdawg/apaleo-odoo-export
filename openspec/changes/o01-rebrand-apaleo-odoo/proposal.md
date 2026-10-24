## Why

This repository is a copy of apaleo-abacus-export v0.1.0: package, binary, config, environment variables, container, CI and docs all say Abacus. Before any Odoo code lands, the tool needs its own identity, its scope cut to apaleo -> Odoo Accounting, and a docs test that lets every doc use "ß", SKR03/SKR04 and German rates from now on, so each later slice writes the docs it touches once, in final German as used in Germany.

## What Changes

- **BREAKING** Package `apaleo-odoo-export` (version `0.0.0`), binary `apaleo-odoo`, help and version output, package description "apaleo -> Odoo Accounting journal entries (Germany)".
- **BREAKING** Config file `./apaleo-odoo.config.yaml`, `APALEO_ODOO_CONFIG`, override prefix `APALEO_ODOO_`; `APALEO_CLIENT_ID`/`APALEO_CLIENT_SECRET` stay; old `APALEO_ABACUS_*` variables are ignored; example config renamed; `.gitignore` covers the new and all old config names.
- Dockerfile, compose, `.env` example, CI steps, quick-start filter and image tag follow the new names.
- README and docs command lines, clone URL, `cd` line and badges point to apaleo-odoo-export; prose follows in o08.
- Docs test: command lines of `apaleo-odoo` (any `apaleo-abacus`, `apaleo-bmd` or `apaleo-datev` command line fails), the `odoo` config prefix; the "ß" ban, the Swiss rate notation, the German DATEV-practice terms and the rates `7 %` and `19 %` are no longer checked in any file. No per-file transition list: the Swiss and Austrian term ban and the «» ban come for every German file at once in o08; until then each slice greps the files it writes.
- Scope cut: Abacus-only backlog items leave `docs/maintainers.md`; `openspec/config.yaml` and `openspec/research/o-target.md` describe the Odoo product (planning PR).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli`: binary, config file and environment names.
- `export-run`: command name in the export command.
- `apaleo-source`: command names of `properties` and `live-smoke`.
- `container-deployment`: config path, entry point, image and environment names.
- `documentation`: docs test for `apaleo-odoo` command lines, `odoo` config prefix and the spelling rules during the transition.

## Non-goals

- No Odoo output (o02), no mapping or posting change (o03), no Abacus removal (o04), no prose rewrite (o08).
- The Abacus target stays the default and its golden files stay byte-identical.
- No change of repository visibility, no publishing, no npm or registry release.
- The scheduler spec keeps the old command name until o07; the code is renamed here.

## Impact

- `package.json`, `pnpm-lock.yaml`, `src/cli/*`, `src/core/config.ts`, messages in `src/` that name the binary.
- Tests naming binary, config file or env variables; `test/docs.test.ts`, `test/helpers/docs.ts`.
- `Dockerfile`, `docker-compose.example.yml`, `.env.example`, `.gitignore`, `.github/workflows/ci.yml`, README and docs command lines, `docs/maintainers.md`, `examples/demo/`.
