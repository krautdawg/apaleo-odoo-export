## ADDED Requirements

### Requirement: German special-case warnings for a month
For each property and month, the export and `schedule --once` SHALL report `W-CITY-TAX-TAXED` for the mapping rows the month's ledger lines resolve to, and SHALL report `W-FOOD-RATE` once per business day on which a revenue line whose apaleo account name matches the template's food pattern (and not a beverage pattern) carries 19 % on or after 2026-01-01 or 7 % before 2026-01-01, naming the day, the apaleo account, the rate and the change of the Speisen rate on 2026-01-01. Both warnings SHALL appear in the dry run, the CLI output and the protocol, and SHALL NOT block the file.

#### Scenario: Food at 19 % in 2026
- **WHEN** a breakfast line on 2026-09-14 credits an apaleo account named "Frühstück" at 19 %
- **THEN** the file is written and the output and the protocol carry `W-FOOD-RATE` naming 2026-09-14, the account, 19 % and the 7 % rate for Speisen from 2026-01-01

#### Scenario: Drinks are not food
- **WHEN** a line on 2026-09-14 credits an apaleo account named "Getränke Restaurant" at 19 %
- **THEN** no `W-FOOD-RATE` is raised
