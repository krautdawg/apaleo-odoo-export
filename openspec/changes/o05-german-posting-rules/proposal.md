## Why

The posting core books every apaleo line through its mapping row, but the German cases where VAT law differs from a plain sale are still described in Swiss terms or not at all: the Kurtaxe the guest owes (durchlaufender Posten) versus the Übernachtung- or Beherbergungsteuer the hotel owes, deposits taxed on receipt (Mindest-Ist-Versteuerung), bad debt with the tax correction of § 17 UStG, cancellation and no-show fees, and the Speisen rate that changed to 7 % on 2026-01-01. A Steuerberater needs these cases booked the way Odoo books them itself, and named in the template, the checks and the docs.

## What Changes

- Posting rules for Germany: Kurtaxe and guest levies (durchlaufender Posten without tax, or part of the consideration at 7 %), deposits and accounts receivable in Odoo (deposit with the tax of its rate, release and refund on the refund side), bad debt as a base line with the sale tax on the refund side (as Odoo's own SKR reconcile models book it), cancellation and no-show fees at the rate apaleo applied.
- Template rows and comments for these cases in `skr03-hotel` and `skr04-hotel` (`@2`), with `init-mapping --update` noting rows whose template suggestion changed (`N-TEMPLATE-SUGGESTION`).
- New warnings `W-CITY-TAX-TAXED` (a CityTaxes, SecondCityTax or GuestLevies row with a tax) and `W-FOOD-RATE` (a food revenue line at 19 % from 2026-01-01 or at 7 % before), in `mapping check` and for the rows and days a month uses.
- The German fixture month gains a guest-owed Kurtaxe, a hotel-owed Übernachtungsteuer, write-offs at 7 % and 19 %, a no-show fee at 7 %, an untaxed cancellation fee and a food line dated 2025-12-31 in a second fixture day.
- `docs/posting-rules.md` rewritten for Odoo and Germany (joins `GERMANY_FILES`); the mapping guide's special-case sections completed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `posting-rules`: German special cases, fixture month extended.
- `account-mapping`: template rows and warnings for German special cases.
- `export-run`: the new warnings for the rows and days a month uses.
- `documentation`: posting rules doc for Odoo.

## Non-goals

- No decision of a tax question: the tool books what apaleo charged; Kurtaxe and no-show rows stay empty until the Kanzlei fills them.
- No cash-basis (Ist-Versteuerung) taxes, no payment-provider fees, no Austrian or Swiss templates.

## Impact

- `src/posting/`, `src/mapping/`, `src/export/checks.ts`, `templates/`, `test/fixtures/apaleo/de-month/`, `test/golden/odoo/`, tests, `docs/posting-rules.md`, `docs/mapping-guide.md`, `docs/troubleshooting.md`.
