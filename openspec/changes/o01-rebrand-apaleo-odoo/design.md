## Context

The repository starts as an exact copy of apaleo-abacus-export v0.1.0 (commit `f88f0ec` on `main`), which carries the v0.1.1 live-data fixes (precise net and tax amounts, per-reservation accounts, `/Offset` lines) and a `TargetWriter` that already names its booking currency (`currency(config)`). The engine is target-independent apart from the names (package, binary, config, environment, image), the Abacus writer behind `TargetWriter` (`src/abacus/target.ts`, chosen by `DEFAULT_TARGET`), the KMU template and the Swiss docs. Odoo companies of German hotels book in EUR, and `odoo.currency` (o02) will answer `currency()`, so no pipeline change is needed for the currency.

The docs test was built for Swiss Standard German: it forbids "ß", German DATEV terms (`SKR03`, `UStVA`, `Beherbergungssteuer`, `7 %`, `19 %`) and Austrian terms. The Odoo docs are German as written in Germany and need exactly those words.

## Goals / Non-Goals

**Goals:**
- One consistent identity: `apaleo-odoo-export`, `apaleo-odoo`, `apaleo-odoo.config.yaml`, `APALEO_ODOO_*`, `apaleo-odoo-export:local`.
- Every later slice can rely on the new names in tests, docs and CI.
- The docs test lets every doc be German (Germany) from the first Odoo doc on, so no later slice writes Swiss spelling it has to rewrite in o08.

**Non-Goals:**
- Any output change: Abacus golden files, protocols and the demo stay byte-identical apart from the tool name and version in protocol and manifest.
- Rewriting docs prose (o08) or removing Abacus (o04).

## Decisions

1. **Rename everything in one slice, keep old config names git-ignored.** Same approach as a01/b01 in the earlier projects: one mechanical rename that the docs test and the CLI tests pin. `.gitignore` keeps `/apaleo-abacus.config.*`, `/apaleo-bmd.config.*` and `/apaleo-datev.config.*`, so an old local config with account numbers never gets committed. Alternative: an alias binary `apaleo-abacus`. Rejected: the product is new and has no users of an old name.
2. **Old environment variables are ignored, not migrated.** `APALEO_ABACUS_*` is neither read nor rejected (the prefix check only rejects unknown `APALEO_ODOO_*` variables), so a shell with the Abacus project's variables cannot change an Odoo export by accident. Alternative: reject them loudly. Rejected: a developer with several projects checked out would get errors in the wrong one.
3. **Drop the Swiss spelling checks everywhere, add the German term ban once in o08.** The "ß" ban, the Swiss rate notation, the German DATEV-practice terms and the rate tokens `7 %` and `19 %` are removed for every file in this slice, because the product is German now and nothing breaks: an Abacus-era doc with an "ß" is no worse than before. So o02, o03 and o05 write their entries in `docs/configuration.md` and `docs/troubleshooting.md` once, in final German, and o08 only rewrites the prose nobody touched. The ban on Swiss and Austrian practice terms (`Treuhänder`, `MWST`, `MWST-Code`, `Rappen`, `KMU-Kontenrahmen`, `Mandantennummer`, `Steuercode`, `Buchungssymbol`, `EKR`, `UVA`, `Ortstaxe`, `Nächtigungsabgabe`) and on `«` `»` cannot apply to every file before the Abacus-era docs are rewritten, and applying it only to rewritten files would need a per-file list that is written, tested and deleted again; so it arrives in o08 for every German file at once, and until then each slice's release check greps the files it wrote. Alternatives: a growing `GERMANY_FILES` list (rejected: code and six test scenarios that live for seven slices, and Swiss spelling in shared docs until o08), or flipping every doc here (rejected: rewriting all guides before the product they describe exists).
4. **Scope cut is declarative here, code removal in o04.** `--help` summary, package description and `docs/maintainers.md` drop the Abacus promises now; Abacus code stays reachable until the Odoo target replaces it in o03, so every slice stays green.

## Risks / Trade-offs

- [The README still describes an Abacus product under an Odoo name until o08] → the repository stays private and unpublished until o08 (`docs/maintainers.md` `## Vor der Veröffentlichung`).
- [A missed `apaleo-abacus` string in CI breaks the quick-start job] → task 3.4 greps for every old name; the docs test fails on any `apaleo-abacus` command line.

## Migration Plan

Not applicable: no installation of this product exists. Developers rename a local `apaleo-abacus.config.yaml` to `apaleo-odoo.config.yaml` by hand.

## Open Questions

None for this slice.
