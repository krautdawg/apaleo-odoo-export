## Context

After o03 `odooTarget` is the default target, the `odoo` section is required and the mapping has the Odoo columns. The Abacus writer, the KMU template, the Swiss month and the Abacus docs are still in the tree and run only in tests that pass `abacusTarget` explicitly (o03 task 4.3). The engine parts that every target uses stay: source adapter, export pipeline, output folder, plausibility checks, schedule, Docker, the posting core.

## Goals / Non-Goals

**Goals:**
- Delete every Abacus- and Swiss-only file, code path, finding code, test and doc in one reviewable slice, with no change of Odoo output.
- Replace the Abacus import guide by `docs/odoo-import.md`, the guide the accountant needs for the first import.

**Non-Goals:**
- German special cases (o05), the final demo and examples (o06), the README and full docs rewrite (o08).

## Decisions

1. **Deletion by capability, verified by the golden files.** Every Odoo golden file, the German month constants and the BER/VIE regression constants must stay identical; any diff means a shared code path was removed by mistake. Alternative: delete gradually across o05-o08. Rejected: dead Abacus code would keep the MWST vocabulary alive in `src/` and confuse later slices.
2. **Refuse the `abacus` section instead of ignoring it.** A config copied from apaleo-abacus-export must not look accepted: loading fails with "`abacus` is not a section of apaleo-odoo" and names `odoo`, like the old `bmd` and `datev` sections.
3. **Keep target-independent findings.** `E-VAT-*`, `E-UNMAPPED`, `E-CURRENCY`, `E-ACCOUNT-BALANCE`, `E-CONSERVATION`, `W-AGGREGATE-DIFF`, `W-VAT-INFERRED`, `W-VAT-RATE-UNUSUAL` and the output-folder codes stay. `W-VAT-ROUNDING` goes: o03 stopped raising it, the fitting reports the cent difference instead.
4. **Swiss posting behaviour that is generic stays until o05 rewrites its spec.** Kurtaxe, deposits, bad debt and cancellation fees are booked through their rows by the generic rules; only the Swiss warnings (`W-KURTAXE-TAXED`, `W-ANNULLATION-TAXED`) and the Swiss-only requirements are removed here.
5. **Compatibility claims follow the target.** The claim check in `test/helpers/docs.ts` matches "getestet mit Odoo", "kompatibel mit Odoo", "Odoo-zertifiziert" and the English forms, and a recorded test import needs date, Odoo version, edition and hosting, chart, rounding method and result.

## Risks / Trade-offs

- [A helper used by Odoo code lives in an Abacus file] → `pnpm typecheck` fails on the deletion; move the helper to `src/core/` in the same commit.
- [A doc still links an Abacus file] → the docs test's link check fails until the link points to `docs/odoo-import.md` or `docs/odoo-format.md`.

## Migration Plan

None: no installation exists. A local Abacus config fails loading with a hint to the `odoo` section.

## Open Questions

None for this slice.
