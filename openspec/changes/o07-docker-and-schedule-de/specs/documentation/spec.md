## ADDED Requirements

### Requirement: Docker guide for Germany
`docs/docker.md` SHALL be rewritten in German as used in Germany (no Swiss or Austrian practice terms and no `«` `»`, grepped in this slice's release check) with: building the image locally, the compose loop around `schedule --once` with `Europe/Berlin`, the host-cron alternative, one-off commands (`export`, `mapping check`, `doctor`) in the container, the demo in the image (`-w /data`), the folder `./data/<Hotel>/<JJJJ-MM>/` with the Odoo CSV and its protocol, the `chown` for uid 1000, updates, and the link to `docs/odoo-import.md`.

#### Scenario: Docker guide in German as used in Germany
- **WHEN** `pnpm test` and the release check run after this slice
- **THEN** the command lines of `docs/docker.md` are checked against the CLI, and it contains neither `Treuhänder` nor `Europe/Zurich`
