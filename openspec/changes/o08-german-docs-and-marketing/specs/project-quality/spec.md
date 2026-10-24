## MODIFIED Requirements

### Requirement: Licence and disclaimer files
The repository SHALL contain an MIT `LICENSE` (English original text) and a `DISCLAIMER.md` whose German text comes first and is binding ("Verbindlich ist die deutsche Fassung."), followed by a section `## English (non-binding translation)`. Both versions SHALL state that the software is provided as is, without warranty or liability, that it is not tax or legal advice, that a Steuerberater must review the account mapping, the Odoo taxes and the first Odoo imports, and that the project has no connection to apaleo GmbH or Odoo S.A. `README.md` and `README.en.md` SHALL link both files.

#### Scenario: Licence and disclaimer are checked by a test
- **WHEN** `pnpm test` runs
- **THEN** a test asserts that `LICENSE` and `DISCLAIMER.md` exist at the repository root, that `README.md` and `README.en.md` link to both, that `DISCLAIMER.md` starts with `# Haftungsausschluss`, and that the German text with "ohne ausdrückliche oder stillschweigende Gewährleistung", "haften", "keine Steuerberatung", "Kontenzuordnung", "Steuerberater" and "Odoo" comes before the English translation with "without warranty", "not liable", "not tax advice" and "must review the account mapping"

#### Scenario: German text is binding
- **WHEN** a reader compares the German and English disclaimer
- **THEN** the file says that the German version is binding and the English one is a translation
