## ADDED Requirements

### Requirement: Docker guide for Germany
`docs/docker.md` SHALL be rewritten in German as used in Germany (checked by the German (Germany) rules of the docs test from this slice on) with: building the image locally, the compose loop around `schedule --once` with `Europe/Berlin`, the host-cron alternative, one-off commands (`export`, `mapping check`, `doctor`) in the container, the demo in the image (`-w /data`), the folder `./data/<Hotel>/<JJJJ-MM>/` with the Odoo CSV and its protocol, the `chown` for uid 1000, updates, and the link to `docs/odoo-import.md`.

#### Scenario: Docker guide is a Germany file
- **WHEN** `pnpm test` runs after this slice
- **THEN** `docs/docker.md` is checked by the German (Germany) rules, its command lines are checked against the CLI, and it contains neither `Treuhänder` nor `Europe/Zurich`
