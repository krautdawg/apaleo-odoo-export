# src/odoo

Odoo journal-entry writer: one CSV file for Odoo's standard import of `account.move` (type "entry", draft), one entry per business day, every base line with the Odoo tax by External ID (`account.<company>_<template id>`) and its net amount, no tax lines and no tax tags. UTF-8 without BOM, LF, quoted by the writer itself (no CSV library). PMS-neutral; must not import from `src/sources/` (enforced by lint).

```ts
import { odooCsvFileName, renderOdooCsv } from './index.js';

const options = {
  from: '2026-09-01', to: '2026-09-30', propertyId: 'BSP',
  companyId: 1, journal: 'APA', currency: 'EUR', taxRounding: 'per_line',
  revision: 1, demo: false,
} as const;
const { bytes, notes, entries, vat } = renderOdooCsv(bookings, options); // throws OdooValidationError with every E-ODOO-* finding
const name = odooCsvFileName(options); // ODOO_Buchungen_20260901-20260930_BSP.csv
```

From booking to file (`writer.ts`, `buildEntries` then `renderOdooCsv`):

1. `validate.ts` checks the bookings and options (account codes, tax refs, journal code, property id, period).
2. `entries.ts` (`nettedDays`) adds every booking side of a day to its key (account, tax, sanitised label): a VAT side with net and gross, every other side with its gross, Soll positive.
3. `fit.ts` (`fitDay`) turns the keys of a day into lines: each taxed key becomes a base line fitted so that the base plus Odoo's own tax (`per_line` or `per_tax`) reaches apaleo's gross to the cent; a cent the rounding cannot reach becomes a `Rundungsausgleich` line (a 0.01 companion base line, or an untaxed line on `odoo.roundingAccount` with `per_tax`). `vatComparison` reports Odoo's tax against apaleo's per day and rate.
4. `validate.ts` (`validateEntry`) checks each fitted entry against `tax-model.ts`, so Odoo never adds an automatic balancing line.
5. `writer.ts` writes the header, one row per entry with its first line and a continuation row per further line.

- `types.ts`: `OdooBooking` (debit and credit side with labels, positive gross cents, optional VAT with the Odoo tax ref and apaleo's tax), `OdooEntry`, `OdooLine` and `OdooRenderOptions`.
- `format.ts`: the CSV header and field paths, amounts, dates, External IDs and references, the tax External ID, Kennzahlen per rate, and every format choice the first test import may change, each with its open question.
- `tax-model.ts`: a TypeScript model of Odoo's tax computation in journal entries (`odooTax`, `entryImbalance`, `sideOf` for refunds).
- `sanitise.ts`: `line_ids/name` cleaned and cut to 128 characters (`N-ODOO-TRUNCATED`).
- `errors.ts`: `OdooValidationError`, every problem of one file at once.
- `import-block.ts`: the protocol's import block (file, revision, entries, company, journal, currency, rounding method with the Odoo label, taxes with External ID, rate and Kennzahl, Odoo VAT against apaleo VAT, rounding lines, import steps and checks) and `referencePrefix` (`apaleo <property>`, `DEMO apaleo <property>` in a demo file).
- `target.ts`: `odooTarget`, the export's `TargetWriter` (settings from the `odoo` section and the property's journal, `ODOO_Buchungen_...csv` pattern, `render` for a revision and `revisionOf`, byte-equality `sameContent`, currency = `odoo.currency`, the Kennzahl as `taxReturnLine`, company and journal as `manifestFields`, `odooMovements`, Odoo advice that names the reference of the refused file).

Format decisions, sources and open questions: [docs/odoo-format.md](../../docs/odoo-format.md).
