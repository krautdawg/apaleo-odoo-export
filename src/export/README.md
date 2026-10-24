# src/export

The export pipeline that wires a source adapter to the core and writes files. All I/O, clock reads and network calls go through the injected `CommandContext` (enforced by lint). User guide: [docs/export.md](../../docs/export.md).

- `period.ts`: `--month` and `--from/--to` parsing, the split per calendar month, and the day rules (`E-DAY-NOT-CLOSED`, `W-RECENT-DAY`).
- `pipeline.ts`: `runExport(request, deps)`: per property and month, fetch, coverage, posting, plausibility checks, render and write; a failure stops only its own property-month.
- `checks.ts`: conservation, account movement per day (the target's movement model, `TargetWriter.movements`), tax per rate against apaleo, one rate per MWST-Code in the file (`E-MWST-CODE-RATES`, run on every posting result), and the opt-in aggregate check.
- `summary.ts`: the posting summary as text (dry run and protocol), with the target's import block after the first line and the target's line of the tax return (`TargetWriter.taxReturnLine`, the Ziffer) after each MWST-Code and rate. It renders the totals of `src/posting/summary.ts` and computes none.
- `target.ts`: the `TargetWriter` interface. The pipeline writes files only through it (`DEFAULT_TARGET`, or `deps.target` in tests); `src/export/` imports nothing else from a target module.
- `output.ts`: file plan (write, unchanged, replace, refuse), overlap guard, protocol and `manifest.json` (file SHA-256, bookings, journal total and currency, tax per MWST-Code and rate, Mandant and Geschäftsbereich, mapping SHA-256, tool version, creation time), using only the target's `filePattern`, `sameContent` and `advice` (the refusal wording names no accounting program). Reading the manifest keeps fields it does not know.
