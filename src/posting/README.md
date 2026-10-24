# src/posting

Posting rules that turn ledger lines into Odoo bookings (`OdooBooking`, one per line); the Odoo writer nets them into one journal entry per day. PMS-neutral; must not import from `src/sources/` (enforced by lint). Rules and codes: [docs/posting-rules.md](../../docs/posting-rules.md).

- `build.ts`: `buildBookings(lines, mapping, chart, options)`, the pure entry point; resolution, skip rules and the VAT side (the side whose row has an Odoo tax carries the tax, the row's rate and apaleo's tax rounded to cents; debit and credit swap for a negative gross).
- `guard.ts`: the VAT consistency guard per line (rate, sign, taxed and untaxed lines, `PostPrepaymentVat` amounts).
- `release.ts`: rate and tax inference for deposit releases without `taxes[]` (`PostPrepaymentVat` pair, then chart) and for untaxed deposit refunds and receipts with a matching pair, also used by `mapping check --from --to`.
- `taxes.ts`: tax normalisation and the tax contained in a gross amount.
- `describe.ts`: the German label of each booking side (stable per account, never a guest name), the receipt kept for the protocol, and the texts of findings.
- `summary.ts`: the posting summary (totals per Odoo account from the target's movement model, per Odoo tax and rate with apaleo's VAT).
