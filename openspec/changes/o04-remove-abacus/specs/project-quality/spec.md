## MODIFIED Requirements

### Requirement: Core modules do not depend on source adapters
The lint configuration SHALL fail when code under `src/core`, `src/odoo`, `src/mapping` or `src/posting` imports from `src/sources/`.

#### Scenario: Forbidden import is caught
- **WHEN** a file in `src/posting` imports a module from `src/sources/apaleo`
- **THEN** `pnpm lint` reports a `no-restricted-imports` error and exits non-zero

#### Scenario: Abacus writer stays PMS-neutral
- **WHEN** someone looks for the boundary of the Abacus writer in `eslint.config.js`
- **THEN** `src/abacus` is no longer a core module, because the writer is removed, and the lint test fails if the core modules are not exactly `src/core`, `src/odoo`, `src/mapping` and `src/posting`

#### Scenario: Odoo writer stays PMS-neutral
- **WHEN** a file in `src/odoo` imports a module from `src/sources/apaleo`
- **THEN** `pnpm lint` reports a `no-restricted-imports` error and exits non-zero
