## ADDED Requirements

### Requirement: First import in Odoo
`docs/odoo-import.md` (German as used in Germany; no Swiss or Austrian practice terms and no `«` `»`, grepped in this slice's release check) SHALL describe how the hotel or its Kanzlei imports the file and what to check, with Odoo menu names in German and the English label in parentheses where they differ: the preparation (a dedicated journal of type Sonstige with the code of `odoo.journal`, the installed chart SKR03 or SKR04, the taxes of the mapping and how to see their External IDs (developer mode, or export of the taxes with "External ID"), `odoo.companyId` as the id of the company that owns the taxes (for a branch company its root company), the company's rounding method compared with `odoo.taxRounding`, looking up in the Kontenplan the codes of the Kasse account of the cash journal and of the Liquiditätstransferkonto (fresh database: SKR03 `1001` and `1360`, Odoo 17 `13601`; SKR04 `1601` and `1460`, Odoo 17 `14601`) and entering them in the mapping when they differ, and in Community the user right "Show Full Accounting Features"); the import (only the target company active in the company switcher, because accounts and journals are matched in every active company and in Odoo 19 also by account code prefix and description; Accounting > Journal Entries > gear > Import records, upload the CSV, check the detected formatting, "Test", then "Import"; what the messages "No matching record found" and "Found multiple matches" mean); the checks after the import (all entries are drafts with the reference `apaleo <property> <date>`, no "Automatic Balancing Line" on the suspense account, Odoo's tax per rate and Kennzahl equals the protocol, the guest ledger and Geldtransit balances equal the protocol, then post); what a second import of the same file does (updates its own drafts through their External IDs and changes nothing); how to replace a month after `--overwrite` (the new file is a revision with new External IDs and the reference suffix „(Korrektur N)“: first delete the draft entries of the earlier revision, reverse its posted entries, because the audit trail of l10n_de forbids deleting them and a reversal keeps their External IDs, then import the new file, which creates new entries); how to undo a file (delete draft entries, reverse posted ones); Ist-Versteuerung and cash-basis taxes as a question for the Kanzlei; and the open questions of research §10 as a checklist for the first test import. README and `docs/configuration.md` SHALL link it.

#### Scenario: First import
- **WHEN** a Steuerberater imports the first file
- **THEN** `docs/odoo-import.md` names the journal, the lookup of the Kasse and Geldtransit codes in the Kontenplan, the single active company, the menu path, the "Test" step, the check for an "Automatic Balancing Line", the comparison of the tax per rate with the protocol and how to undo an imported file

#### Scenario: Corrected month after a posted import
- **WHEN** September was imported and posted, a late posting changed it, and the hotel exported again with `--overwrite`
- **THEN** `docs/odoo-import.md` says to reverse the posted entries with the reference `apaleo BSP` of the earlier revision and then import the new file, whose entries carry `_r2` External IDs and „(Korrektur 2)“ in the reference and are created as new drafts

#### Scenario: Abacus guides are gone
- **WHEN** someone looks for `docs/abacus-import.md` or `docs/abacus-format.md`
- **THEN** neither exists, and the README and every doc link `docs/odoo-import.md` and `docs/odoo-format.md` instead

## MODIFIED Requirements

### Requirement: No unverified compatibility claim
README and docs SHALL describe the file as following Odoo's documented import of journal entries and SHALL say that a first test import with a Steuerberater is pending, and SHALL NOT claim that the file was tested with or is accepted by Odoo ("getestet mit Odoo", "kompatibel mit Odoo", "Odoo-zertifiziert", "tested with Odoo", "Odoo-compatible") until `docs/maintainers.md` records a test import under `## Testimporte` with date, Odoo version, edition and hosting, chart (SKR03 or SKR04), rounding method, result and "geprüft von" ("Maintainer, lokal" or the Kanzlei). The sentence that a first test import with a Steuerberater is pending SHALL stay until a row names a Kanzlei in "geprüft von".

#### Scenario: Claim without a recorded import
- **WHEN** the README says "getestet mit Odoo 18" and `## Testimporte` in `docs/maintainers.md` lists no import
- **THEN** `pnpm test` fails naming the README and the phrase

#### Scenario: Recorded import allows the claim
- **WHEN** `## Testimporte` records a row with all seven fields filled for Odoo 18
- **THEN** the README may say "getestet mit Odoo 18" and `pnpm test` passes

#### Scenario: Pending test import
- **WHEN** a reader opens the README before any test import
- **THEN** it says that the file follows Odoo's documented import of journal entries and that a first test import with a Steuerberater is still pending
