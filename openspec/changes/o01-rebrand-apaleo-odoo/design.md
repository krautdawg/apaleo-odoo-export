## Context

The repository starts as an exact copy of apaleo-abacus-export v0.1.0 (commit `f88f0ec` on `main`), which carries the v0.1.1 live-data fixes (precise net and tax amounts, per-reservation accounts, `/Offset` lines) and a `TargetWriter` that already names its booking currency (`currency(config)`). The engine is target-independent apart from the names (package, binary, config, environment, image), the Abacus writer behind `TargetWriter` (`src/abacus/target.ts`, chosen by `DEFAULT_TARGET`), the KMU template and the Swiss docs. Odoo companies of German hotels book in EUR, and `odoo.currency` (o02) will answer `currency()`, so no pipeline change is needed for the currency.

The docs test was built for Swiss Standard German: it forbids "ß", German DATEV terms (`SKR03`, `UStVA`, `Beherbergungssteuer`, `7 %`, `19 %`) and Austrian terms. The Odoo docs are German as written in Germany and need exactly those words.

## Goals / Non-Goals

**Goals:**
- One consistent identity: `apaleo-odoo-export`, `apaleo-odoo`, `apaleo-odoo.config.yaml`, `APALEO_ODOO_*`, `apaleo-odoo-export:local`.
- Every later slice can rely on the new names in tests, docs and CI.
- The docs test lets new Odoo docs be German (Germany) from the first one on, without loosening the checks of the Swiss docs that are still in the tree.

**Non-Goals:**
- Any output change: Abacus golden files, protocols and the demo stay byte-identical apart from the tool name and version in protocol and manifest.
- Rewriting docs prose (o08) or removing Abacus (o04).

## Decisions

1. **Rename everything in one slice, keep old config names git-ignored.** Same approach as a01/b01 in the earlier projects: one mechanical rename that the docs test and the CLI tests pin. `.gitignore` keeps `/apaleo-abacus.config.*`, `/apaleo-bmd.config.*` and `/apaleo-datev.config.*`, so an old local config with account numbers never gets committed. Alternative: an alias binary `apaleo-abacus`. Rejected: the product is new and has no users of an old name.
2. **Old environment variables are ignored, not migrated.** `APALEO_ABACUS_*` is neither read nor rejected (the prefix check only rejects unknown `APALEO_ODOO_*` variables), so a shell with the Abacus project's variables cannot change an Odoo export by accident. Alternative: reject them loudly. Rejected: a developer with several projects checked out would get errors in the wrong one.
3. **Two language regimes during the transition.** `GERMANY_FILES` in `test/helpers/docs.ts` lists the docs written for Germany (o01: `docs/odoo-format.md`, `docs/odoo-import.md`; each slice that rewrites a doc adds it). For these files the test allows "ß" and German practice terms and forbids Swiss and Austrian practice terms (`Treuhänder`, `MWST`, `MWST-Code`, `Rappen`, `KMU-Kontenrahmen`, `Mandantennummer`, `Steuercode`, `Buchungssymbol`, `EKR`, `UVA`, `Ortstaxe`, `Nächtigungsabgabe`) and the Swiss quotation marks `«` `»`. Every other German file keeps the existing Swiss checks ("ß" forbidden, Swiss rate notation) until o08, but the German DATEV-practice terms and the rate tokens `7 %` and `19 %` are no longer forbidden anywhere, because o03 and o05 bring SKR03/SKR04 and the German rates into guides that are still partly Swiss. o08 makes every German file a Germany file and deletes the Swiss rules and the list. Alternative: flip every doc in this slice. Rejected: it would mean rewriting all guides before the product they describe exists.
4. **Scope cut is declarative here, code removal in o04.** `--help` summary, package description and `docs/maintainers.md` drop the Abacus promises now; Abacus code stays reachable until the Odoo target replaces it in o03, so every slice stays green.

## Risks / Trade-offs

- [The README still describes an Abacus product under an Odoo name until o08] → the repository stays private and unpublished until o08 (`docs/maintainers.md` `## Vor der Veröffentlichung`).
- [A missed `apaleo-abacus` string in CI breaks the quick-start job] → task 3.4 greps for every old name; the docs test fails on any `apaleo-abacus` command line.

## Migration Plan

Not applicable: no installation of this product exists. Developers rename a local `apaleo-abacus.config.yaml` to `apaleo-odoo.config.yaml` by hand.

## Open Questions

None for this slice.
