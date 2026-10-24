## MODIFIED Requirements

### Requirement: Properties command
The CLI SHALL provide `apaleo-odoo properties`, which lists every property the custom app can read with id, code, name, time zone and currency.

#### Scenario: List properties
- **WHEN** the user runs `apaleo-odoo properties` with valid credentials
- **THEN** one line per property is printed and the exit code is 0

### Requirement: Live smoke command
The CLI SHALL provide `apaleo-odoo live-smoke --property <id> [--date YYYY-MM-DD]` that, against real credentials, fetches a token, the property, the chart of accounts and one business day of ledger and aggregates, prints counts and totals, compares the aggregates with the ledger by balance as the export's aggregate check does, reports whether per-reservation accounts carry `parentNumber` and how many deposit lines were received, released and refunded (each with and without `taxes[]`), writes no files, and exits 0 only if every required step succeeded (a missing optional aggregate permission is reported, not fatal). When the business day has no ledger lines, it SHALL print a warning and a result line saying that nothing about the postings was checked and suggesting `--date` with a day that has bookings, instead of a plain pass. The test suite SHALL NOT call it against the network.

#### Scenario: Smoke run succeeds
- **WHEN** a developer runs `apaleo-odoo live-smoke --property BSP` with a valid custom app
- **THEN** the output shows account counts by type, the number of ledger lines and debit and credit totals for the day, and the exit code is 0

#### Scenario: Smoke run without secret
- **WHEN** `APALEO_CLIENT_SECRET` is not set
- **THEN** the command exits with code 1 before any network call and names the missing variable

#### Scenario: Empty business day
- **WHEN** the default business day (two days ago) has no ledger lines
- **THEN** the output contains `WARN` for the ledger step and a result line that the day has no bookings and nothing about the postings was checked, it does not say that every required step passed without that note, and the exit code is 0

#### Scenario: Recorded day answers the questions
- **WHEN** live-smoke runs on the recorded BER responses of 2026-10-21 through a fake fetch
- **THEN** it reports 6 deposit lines received, 5 released of which 1 refunded, all with `taxes[]` except the two 0 % lines, and "18 of 18 accounts match" for the aggregates

#### Scenario: Recorded Austrian day
- **WHEN** live-smoke runs on the recorded VIE responses of 2026-10-21 through a fake fetch
- **THEN** it exits 0 and reports "19 of 19 accounts match" for the aggregates
