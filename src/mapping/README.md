# src/mapping

Account mapping: the editable CSV from apaleo accounts to Abacus accounts with MWST-Code and rate. PMS-neutral; must not import from `src/sources/` (enforced by lint).

- `load.ts` reads a mapping file (UTF-8 or CP1252, `;` or `,`, decimal comma or point, MWST-Code kept as text) and rejects BMD and DATEV mappings, the account export of a paid connector, duplicate keys and forbidden wildcards.
- `resolve.ts` finds the row for one side of a ledger line (exact, any type, parent chain, rate wildcard, plain wildcard).
- `check.ts` validates rows (`checkMapping`: account format, MWST-Code format and placement, configured codes and their rates, Swiss rates, `kost`) and the accounts booked in a period (`checkCoverage`, `E-UNMAPPED`); `kmu-sample-codes.ts` names the Ziffer of the Abacus KMU sample codes.
- `template.ts` applies the KMU hotel rules in `templates/kmu-hotel.rules.csv` to a chart of accounts, with the MWST-Codes of `abacus.mwstCodes`.
- `connector-export.ts` reads the account export of a paid connector for `init-mapping --accounts-from`.
- `file.ts` writes mapping files and appends rows for `init-mapping --update`.
