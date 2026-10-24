## ADDED Requirements

### Requirement: First import in Odoo
`docs/odoo-import.md` (German as used in Germany, checked by the German (Germany) rules of the docs test since o01) SHALL describe how the hotel or its Kanzlei imports the file and what to check, with Odoo menu names in German and the English label in parentheses where they differ: the preparation (a dedicated journal of type Sonstige with the code of `odoo.journal`, the installed chart SKR03 or SKR04, the taxes of the mapping and how to see their External IDs (developer mode, or export of the taxes with "External ID"), the company's rounding method compared with `odoo.taxRounding`, the database id of each analytic account, and in Community the user right "Show Full Accounting Features"); the import (Accounting > Journal Entries > gear > Import records, upload the CSV, check the detected formatting, "Test", then "Import"); the checks after the import (all entries are drafts with the reference `apaleo <property> <date>`, no "Automatic Balancing Line" on the suspense account, Odoo's tax per rate and Kennzahl equals the protocol, the guest ledger and Geldtransit balances equal the protocol, then post); what a second import of the same file does (updates the drafts through their External IDs, refuses changes to posted entries); how to undo (delete draft entries; reverse posted ones, because the audit trail of l10n_de forbids deleting them); Ist-Versteuerung and cash-basis taxes as a question for the Kanzlei; and the open questions of research §10 as a checklist for the first test import. README and `docs/configuration.md` SHALL link it.

#### Scenario: First import
- **WHEN** a Steuerberater imports the first file
- **THEN** `docs/odoo-import.md` names the journal, the menu path, the "Test" step, the check for an "Automatic Balancing Line", the comparison of the tax per rate with the protocol and how to undo an imported file

#### Scenario: Abacus guides are gone
- **WHEN** someone looks for `docs/abacus-import.md` or `docs/abacus-format.md`
- **THEN** neither exists, and the README and every doc link `docs/odoo-import.md` and `docs/odoo-format.md` instead

## MODIFIED Requirements

### Requirement: No unverified compatibility claim
README and docs SHALL describe the file as following Odoo's documented import of journal entries and SHALL say that a first test import with a Steuerberater is pending, and SHALL NOT claim that the file was tested with or is accepted by Odoo ("getestet mit Odoo", "kompatibel mit Odoo", "Odoo-zertifiziert", "tested with Odoo", "Odoo-compatible") until `docs/maintainers.md` records a test import under `## Testimporte` with date, Odoo version, edition and hosting, chart (SKR03 or SKR04), rounding method and result.

#### Scenario: Claim without a recorded import
- **WHEN** the README says "getestet mit Odoo 18" and `## Testimporte` in `docs/maintainers.md` lists no import
- **THEN** `pnpm test` fails naming the README and the phrase

#### Scenario: Recorded import allows the claim
- **WHEN** `## Testimporte` records a row with all six fields filled for Odoo 18
- **THEN** the README may say "getestet mit Odoo 18" and `pnpm test` passes

#### Scenario: Pending test import
- **WHEN** a reader opens the README before any test import
- **THEN** it says that the file follows Odoo's documented import of journal entries and that a first test import with a Steuerberater is still pending
