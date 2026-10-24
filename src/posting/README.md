# src/posting

Posting rules that turn ledger lines into Abacus Einzelbuchungen (`AbacusBooking`). PMS-neutral; must not import from `src/sources/` (enforced by lint). Rules and codes: [docs/posting-rules.md](../../docs/posting-rules.md).

- `build.ts`: `buildBookings(lines, mapping, chart, options)`, the pure entry point; resolution, skip rules and the side rule (the side with an MWST-Code is the Single account, `DebitCredit` is the side of the Collective account, the amount is the absolute gross, the tax apaleo's per-line tax).
- `guard.ts`: the VAT consistency guard per line, with Abacus' inclusive check value (`W-VAT-ROUNDING`).
- `release.ts`: rate and tax inference for deposit releases without `taxes[]` (`PostPrepaymentVat` pair, then chart) and for untaxed deposit refunds and receipts with a matching pair, also used by `mapping check --from --to`.
- `taxes.ts`: tax normalisation and the tax contained in a gross amount (Abacus' check value).
- `fields.ts`: `Text1` in Swiss Standard German without guest names, `Text2` from `posting.text2`, `kost` only on revenue and write-off bookings.
- `summary.ts`: the posting summary (totals per Abacus account from the target's movement model, per MWST-Code and rate).
