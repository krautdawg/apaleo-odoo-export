# src/abacus

Abacus FIBU writer: the AbaConnect "XML Buchungen" file (Application `FIBU`, mapping `AbaDefault`), one Einzelbuchung per booking with `TaxData` in `SingleInformation`, UTF-8, LF, single-quoted attributes and its own XML escaping (no XML library). PMS-neutral; must not import from `src/sources/` (enforced by lint). The default target of `export` (`abacusTarget`).

```ts
import { renderXmlBuchungen, xmlBuchungenFileName } from './index.js';

const options = {
  from: '2026-10-01', to: '2026-10-31', propertyId: 'BSP',
  mandant: '1234', geschaeftsbereich: 0, leitwaehrung: 'CHF', abrechnungsart: 'vereinbart',
  version: '2015.00', mwstKonto: '2200', mwstHilfskonto: '2202',
} as const;
const { bytes, notes } = renderXmlBuchungen(bookings, options); // throws AbacusValidationError with every E-ABACUS-* finding
const name = xmlBuchungenFileName(options); // ABACUS_Buchungen_20261001-20261031_BSP.xml
```

- `types.ts`: `AbacusBooking` (Collective and Single account, `DebitCredit` of the Collective account, positive gross Rappen, optional MWST with signed tax, Kostenstelle, `Text1`, `Text2`) and `AbacusRenderOptions`.
- `format.ts`: amounts, rates, dates, Belegnummern, escaping, and every choice the first test import may change, each one constant or function with its open question: `TAX_TYPE_OUTPUT`, `taxSign()`, `TAX_AMOUNT_IN_KEY_CURRENCY`, `TAX_INCLUDED_AT_RATE_ZERO`, `SINGLE_TAX_ACCOUNT`, `TAX_ACCOUNT_AT_RATE_ZERO`, `taxAccounts()`.
- `validate.ts`, `sanitise.ts`, `writer.ts`: `E-ABACUS-*` errors (the sign check calls `taxSign()`), `N-ABACUS-TRUNCATED`, the file.
- `target.ts`: `abacusTarget`, the export's `TargetWriter` (settings from the `abacus` section and the property, `ABACUS_Buchungen_...xml` pattern, byte-equality `sameContent`, currency = `abacus.leitwaehrung`, the Ziffer of the MWST-Abrechnung per Swiss rate as `taxReturnLine` (table `MWST_ZIFFER_BY_RATE` in `format.ts`), Mandant and Geschäftsbereich of the manifest entry as `manifestFields` (from the same settings as the import block), `DEMO ` prefix of `Text1` in a demo file, Abacus advice).
- `movements.ts`: `abacusMovements`, the movement model of a booking (Collective account by the gross amount, Single account by the gross amount minus the MWST, signed by `DebitCredit`), used by the plausibility checks through `TargetWriter.movements` and by the posting summary.
- `import-block.ts`: the protocol's import block (file, bookings, journal total, programs, interface version, Mandant, Geschäftsbereich, Leitwährung, Abrechnungsart, MWST-Codes with rates and tax totals, "account -> MWST-Code" pairs, `TaxAccount`, the `format.ts` constants, Belegnummern, "MWST berechnen" and the F21 warning).

Format decisions, sources and open questions: [docs/abacus-format.md](../../docs/abacus-format.md).
