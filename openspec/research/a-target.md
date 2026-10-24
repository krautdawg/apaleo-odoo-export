# Research: Abacus as the target format

Planning notes for the a01-a08 slices, checked on 2026-10-21. English, like the specs. The Swiss Standard German user doc `docs/abacus-format.md` (slice a02) is written from this file and keeps the source list. Nothing here is tax advice; every booking rule is confirmed by a Treuhänder with a real Abacus test import before the first release (see "Open questions").

Target: **Abacus Finanzbuchhaltung (FIBU)** by Abacus Research AG, on-premise or as AbaWeb/AbaSky. Not AbaNinja (the small-business invoicing product) and not "Abacus ERP" as a whole; only the FIBU booking import is used.

## 1. Import options in Abacus FIBU

| Option | What it is | Fit |
|---|---|---|
| **AbaConnect "XML Buchungen"** (Application `FIBU`, interface ID `XML Buchungen`, mapping `AbaDefault`) | Abacus' own documented file interface for FIBU bookings, versions 2007.00 to 2024.00, status "Productiv", XML import and export | **Chosen.** File based, documented field by field, imported by the Treuhänder in the Abacus client without any partnership or API access |
| AbaConnect "ASCII Buchungen" | older fixed column list (record number, version, date, account, contra account, VAT fields, ...), last documented version 2014.00 | legacy; same programs import it (contofox uses it); no reason to start new work on it |
| AbaConnect web services (SOAP/REST, AbaConnect "Webservice") | online push into a running Abacus | out of scope: needs network access to the Mandant's Abacus server, user credentials and usually the AbaConnect web-service licence; this is what the paid "Plus" connector sells |
| Excel/CSV import of third parties (e.g. arcon "Import Fibu-Buchungen aus Excel") | add-ons | not Abacus standard |

How a Treuhänder imports an XML Buchungen file (three documented ways, bexio/Kontera help article):

- **F11 Buchen**: drag the XML file into the booking window, the import mask opens, "Start". XML only.
- **F5534 "Import/Export Buchungen AbaConnect"** (menu *Hilfsprogramme > Buchungsschnittstellen*): switch to "Import", import type "XML Buchungen", drop the file. A *Zeitachse* (time axis) can be selected to review the bookings before they are transferred to the business year. contofox: imported bookings "werden standardmässig in einem Nebenjournal gespeichert", tab *Gestaltung* has "MWST berechnen".
- **F625 AbaConnect**: "Import XML", choose "XML Buchungen" as interface; tab *Gestaltung*: "MWST berechnen".
- Command line `abaconnectimportconsole.exe ... -datamodeXML -importfile...` exists but "muss direkt auf dem Abacus Server ausgeführt werden" (AbaConnect doc). Not for us.

Licences (what a Treuhänder needs): the Abacus Finanzbuchhaltung with the program group **Buchungsschnittstellen** (F5534). In the AbaWeb 2019 price list the Fibu profile 1 ("Buchen, Journale, MwSt-Programme") does **not** contain "Buchungsschnittstellen"; profiles 2 and 3 do. The separate option "Schnittstelle AbaConnect" is listed for the Debitoren-/Kreditorenbuchhaltung (profile 3), not for FIBU bookings. An Abacus update note says the option "Schnittstellen II" unlocks programs 625 and 554 for data **mutations**. Vertec: "für die Lizenzierung der AbaConnect-Schnittstellen auf Abacus-Seite" contact the Abacus account manager. Conclusion for the docs: the file needs no partnership and no extra product from us; the Treuhänder needs an Abacus FIBU licence that includes the Buchungsschnittstellen (F5534 / F11 import). Most Treuhand offices that already import bank or payroll bookings have it. Which exact Abacus edition/option is needed is open question 1 (to be confirmed with the first Treuhänder, then written into `docs/abacus-import.md`).

## 2. The XML Buchungen file (AbaDefault mapping)

Container (identical in the 2012, 2015, 2020 and 2024 documentation and the Abacus "Fibu Buchungsschnittstelle (Version 2020)" PDF):

```xml
<?xml version='1.0' encoding='UTF-8'?>
<AbaConnectContainer>
  <TaskCount>1</TaskCount>
  <Task>
    <Parameter>
      <Application>FIBU</Application>
      <Id>XML Buchungen</Id>
      <MapId>AbaDefault</MapId>
      <Version>2015.00</Version>
      <Mandant>7777</Mandant>   <!-- optional: file imports only into this Mandant -->
    </Parameter>
    <Transaction>
      <Entry mode='SAVE'> CollectiveInformation, SingleInformation ... </Entry>
    </Transaction>
  </Task>
</AbaConnectContainer>
```

- `TaskCount` = number of `Task` elements ("Anzahl anschliessend auszuführende Verarbeitungen"). We write one Task.
- `Mandant` in `Parameter` is optional; "bedeutet, dass die Daten nur in den definierten Mandanten importiert werden können" / "nur benötigt, wenn die Importeinstellung 'nur Buchungen mit gleicher Mandantennummer' aktiv ist". We always write it: it protects against importing a hotel into the wrong Mandant.
- `mode='SAVE'` "muss immer bei einem Bereich stehen" (each sub-block such as `AmountData` too).
- "CollectiveInformation steht für die ersten Informationen der Buchung, also alles was sich auf das erste Konto bezieht. SingleInformation bezieht sich auf das zweite Konto der Buchung." An Einzelbuchung is one CollectiveInformation plus one SingleInformation (`EntryType` S, `SingleCount` 0); a Sammelbuchung has `EntryType` C and `SingleCount` = number of SingleInformation blocks.
- Interface version: the fields we use exist unchanged from 2012.00 to 2024.00. In 2015.00 `EntryLevel`, `EntryType`, `Type`, `DebitCredit`, `Client`, `Division`, `KeyCurrency`, `Text1`, `SingleCount` are marked mandatory, in 2024.00 optional, so we always write them. Decision: `Version` is a config value (`abacus.version`, default `2015.00`, the version the erpnextswiss writer uses in production; also `2020.00`, `2022.00`, `2024.00` accepted). An older Abacus release cannot know a newer interface version; whether a current release imports `2015.00` without warnings is open question 2.

Fields we write (2024.00 DE documentation, field type and length; "Ja" = mandatory there):

| Element | Where | Rule |
|---|---|---|
| `EntryLevel` | Collective | `A` (Ist; `B` = Budget) |
| `EntryType` | Collective | `S` Einzelbuchung |
| `Type` | Collective, Single | `Normal` (`Reversal` = Stornobuchung, not used: apaleo reversals are ordinary lines with negative amounts) |
| `DebitCredit` | Collective, Single | `D` Soll / `C` Haben: "Entscheidend ist, welche Position (Soll oder Haben) in der Erfassungsmaske zuerst erfasst wird. Standardmässig beginnt man mit dem Soll-Konto ... D". Same value in both blocks (erpnextswiss writes it so) |
| `Client` | Collective | Mandantennummer, number, max 6 digits |
| `Division` | Collective | Geschäftsbereichnummer, max 8 digits, "Falls keine GB's im Einsatz sind, wird der Wert 0 mitgegeben" |
| `KeyCurrency` | Collective | Leitwährung des Mandanten, 3 chars |
| `EntryDate` | Collective (mandatory), Single | Belegdatum, ISO date `2000-03-20` (2015 doc: "Datum (2000-03-20)") |
| `AmountData/Currency`, `AmountData/Amount` | Collective, Single | currency ISO code ("Wird keine Fremdwährung gebucht, wird die Leitwährung mitgegeben"); amount "Betrag in der Kontowährung", 13 digits, up to 8 decimals, "Als Dezimaltrenner muss ein Punkt verwendet werden" |
| `KeyAmount` | Collective, Single | amount in the Leitwährung, 2 decimals |
| `Account` | Collective (mandatory), Single | number, max 11 digits. Collective: "immer das zuerst erfasste Konto der Erfassungsmaske (links; unabhängig von Soll/Haben)" |
| `TaxAccount` | Collective, Single | "Ist das Konto im Feld Account ein MWST-pflichtiges Konto, so wird in diesem Feld erneut diese Kontonummer erfasst. Wird eine Buchung von einem nicht-MWST-pflichtigem Konto an ein nicht-MWST-pflichtiges Konto gemacht, wird der Wert 0 mitgegeben." The 2020 PDF table (vereinbart, Umsatzsteuer inklusiv gebucht): Collective = "Steuerkonto des MWST-Codes", Single = "Ertragskonto"; vereinnahmt: Collective = "Hilfskonto des MWST-Codes", Single = "Ertragskonto". erpnextswiss differs: it writes `TaxAccount` only in `SingleInformation`, with the **tax account** (for example `2200`), and none in `CollectiveInformation`. Decision: the documented table (Single = the revenue/VAT-bearing account itself), with the Single value kept in the constant `SINGLE_TAX_ACCOUNT` in `src/abacus/format.ts` (open questions 8 and 12) |
| `BookingLevel1` | Collective, Single | "Buchungsebene 1 = Kostenstelle, Kostenträger oder Projekt", number, 11 digits |
| `Text1`, `Text2` | Collective, Single | 80 chars each |
| `DocumentNumber` | Collective, Single | Belegnummer, **text, 10 chars**, only used when F621 *Finanzbuchhaltung/Allgemein/Einstellungen* "Belegnummer" is active |
| `SingleCount` | Collective | `0` for an Einzelbuchung |
| `TaxData` | **Single only** (there is no TaxData in CollectiveInformation) | see below |

`TaxData` (mandatory sub-fields when present):

| Element | Rule |
|---|---|
| `TaxIncluded` | `I` inklusive / `E` exklusive. We book gross amounts, so `I`. In the KMU sample Mandant the codes carry different `Inclusive` flags: 311/312/313 `2`, 400 `1`, 490 and 491 `0` with proposal `E`. The meaning of the flag values is not documented; if `0` means "exclusive only", a file with `I` on code 491 could be refused when "MWST berechnen" is off. At rate 0 the amounts are identical either way. Decision: `I` on every code, the value for rate-0 codes kept in the constant `TAX_INCLUDED_AT_RATE_ZERO` in `src/abacus/format.ts` (open question 14); a single `E` for all rate-0 codes is not chosen, because code 400 carries a different flag than 491 |
| `TaxType` | "0 = Umsatzsteuer, 1 = Vorsteuer, 2 = DL Ausland, 3 = Vorsteuer Urproduktion, 4 = Import UST/VST, 5 = UST/VST ohne VST"; "der Wert im Feld TaxTyp ist gegenüber der Nummerierung im DBX um 1 verschoben (DBX 1 = Umsatzsteuer; Feld Taxtyp 0 = Umsatzsteuer)". The 2020 PDF warns: if TaxType is not filled and "MWST berechnen" is off, the Umsatzabstimmung shows a difference. erpnextswiss writes the constant `1` on every transaction, sales and purchase invoices alike, so its value is no evidence for what `1` means; it rather suggests that Abacus with "MWST berechnen" derives the type from the MWST-Code (open question 3). Decision: `0` per the Abacus documentation |
| `UseCode` | Abrechnungsart: `0` vereinbart, `1` vereinnahmt (from config). erpnextswiss writes the constant `1` on every transaction |
| `AmountData/Amount` | the tax amount in the booking currency. erpnextswiss writes `0` whenever the booking currency equals the Leitwährung, since commit ea1771c (2023-10-31) with the comment "hardcoded 0 otherwise abacus raises an error if doc currency = key currency". Decision: `0.00` (we only book in the Leitwährung), kept in the constant `TAX_AMOUNT_IN_KEY_CURRENCY` (`zero` default, `tax` writes the tax amount) in `src/abacus/format.ts` (open question 11) |
| `KeyAmount` | the tax amount in the Leitwährung, signed (see "Signs") |
| `TaxRate` | rate with a decimal point, "z.B. 7.7 für den Normalsatz Schweiz im Jahr 2020" |
| `TaxCoefficient` | "MWST-Pflichtigkeit in Prozent. Normalerweise 100.00" |
| `Country` | `CH` |
| `TaxCode` | "Code gemäss MWST-Tabelle des Mandanten", text, 3 chars |
| `FlatRate` | Pauschalsatz, "Wird nicht nach der Pauschalsatzmethode abgerechnet, wird der Wert 0 ausgewiesen" |

"MWST berechnen": "Ohne spezielle Einstellung werden die Buchungen beim Import auch auf deren Richtigkeit bezüglich MWST validiert. Nicht korrekte Buchungen können nicht importiert werden. Mit der Import-Option 'MWST berechnen' werden Buchungen mit fehlenden oder fehlerhaften MWST-Informationen automatisch berechnet ... Abacus empfiehlt beim Import die Einstellung 'MWST-berechnen' zu verwenden." With "MWST berechnen" off, mandatory are `TaxIncluded`, `Amount` and `TaxCode`. The 2020 PDF §3.1.3 adds for `TaxCode`: "wenn der Flag MWST-berechnen aktiv ist, wird der MWST-Code genommen, welcher dem Konto im Programm 21 hinterlegt wurde". So with the option on, the default MWST-Code of the account in the Kontenplan (F21) may override or replace the file's `TaxCode`; a VAT-bearing account (revenue 3400/3100/3200/3500/3260, deposits 2030-2032, write-offs 3805-3807, a Kurtaxe account with a code) must then carry the same default code in F21 as its mapping row and be MWST-pflichtig, and an untaxed account must carry none, or the MWST-Abrechnung is wrong without any import error. The import block lists the pairs "account -> MWST-Code" of the file for this comparison; whether the file's code is kept or replaced is open question 13. Kontera also tells users to switch it on "da Kontera nicht weiss, wie die MWST in diesem Mandat gerundet wird (Rappen oder kaufmännisch)". Decision: the file always carries complete TaxData with apaleo's tax amount in `KeyAmount` (and `AmountData/Amount` per `TAX_AMOUNT_IN_KEY_CURRENCY`), so it is meant to import with the option on or off; `docs/abacus-import.md` recommends "MWST berechnen" as Abacus does and explains that Abacus may then round one booking differently by one Rappen; the protocol lists the tax per MWST-Code to compare with the Abacus MWST-Journal.

Signs: amounts in `AmountData`/`KeyAmount` of the Collective and Single blocks are written positive, the direction comes from `DebitCredit` (erpnextswiss writes positive amounts). For the tax amount erpnextswiss multiplies the tax by −1 on **every** transaction, sales invoices (`DebitCredit` `D`) and purchase invoices (`C`, a debited expense as Single account) alike, together with the constant `TaxType` `1` and `UseCode` `1`. So erpnextswiss neither confirms nor supports a "sign follows `DebitCredit`" rule; together with the constant type and use code it rather suggests that Abacus with "MWST berechnen" recomputes type, use code and sign from the MWST-Code. Decision, unchanged but marked as a hypothesis: tax amount negative when the VAT-bearing Single account is credited (output tax owed), positive when it is debited (allowance, write-off). Confirmed or flipped by the first import (open question 4); the sign rule sits in one function `taxSign()` in `src/abacus/format.ts`, the validation `E-ABACUS-TAX-SIGN` uses the same function, and the golden files show it.

Encoding: `<?xml version='1.0' encoding='UTF-8'?>`, the XML standard. We write UTF-8 without BOM, LF line ends, two-space indentation, `&`, `<`, `>`, `"` and `'` escaped, control characters removed. Text fields cut to 80 characters (`N-ABACUS-TRUNCATED`).

## 3. Grman "Abacus Connector" (the paid apaleo Store app this replaces)

- apaleo Store "Abacus Connector" by Grman IT Solutions (AT, AFinConnector): 24 EUR/month per property, 34 EUR/month for two properties, "Abacus Connector Plus" 48 EUR/month per property ("direct integration", developed with HotelFinance AG, data "automatically transferred and imported into Abacus"); 60 days free. "The created Abacus XML file will be accessible on the first page."
- Help desk (grman.freshdesk.com, folder "Abacus"): per hotel an Abacus **Mandant** and optionally a **Geschäftsbereich** ("Mandant Konfiguration"); mapping per hotel from apaleo accounts to Abacus accounts with an optional **KoSt** (Kostenstelle) column, Vat/VatOnLiabilities accounts are not shown ("Die Umsatzsteuer-Konten mit Kontotyp Vat oder VatOnLiabilities werden in der Liste nicht angezeigt"), map the sub-accounts (e.g. "Umsatz Unterkunft (10%)"), CSV export with columns Apaleo Kontonummer, Kontoname, Kontotyp, Abacus Kontonummer, Kostenstelle; "Konfiguration der Abacus Felder": **Belegnummer** default = reservation number (choices: reservation, apaleo invoice, PSP number), **1. Textzeile** default = apaleo invoice or PSP number, **2. Textzeile** empty by default (choices include "mit dem Gastnamen", which we do not offer: no guest names in bookkeeping texts); periods day, month or custom; automatic runs daily (yesterday, D-2 recommended, D-3), weekly or monthly on day 1-5 of the following month, "Es muss sichergestellt werden, dass zu dieser Uhrzeit der Night Audit fertig ist"; delivery by e-mail or AWS S3; one file per Abacus Mandant; a separate **Debitoren** interface (DEBI XML plus a ZIP with PDF invoices, new customers file). No file format is published beyond the XML file itself.
- Our tool covers the booking file (the base connector). Not covered in v1: DEBI interface, new-customer file, PDF dossiers, S3/e-mail, guest names in texts.

The README comparison names no vendor (same rule as the DATEV and BMD projects) and says "24-48 EUR pro Monat und Betrieb, laut apaleo Store, Oktober 2026".

## 4. Swiss VAT (MWST) for hotels

Rates, MWSTG Art. 25 (fedlex consolidated version 2025-03-31): "Die Steuer beträgt 8,1 Prozent (Normalsatz)"; "Der reduzierte Steuersatz von 2,6 Prozent" for Lebensmittel (not alcohol), Zeitungen, Medikamente, ...; Abs. 3: "Für Lebensmittel, die im Rahmen von gastgewerblichen Leistungen abgegeben werden, gilt der Normalsatz", take-away food 2.6 % with organisational separation; Abs. 4: "Die Steuer auf Beherbergungsleistungen beträgt 3,8 Prozent (Sondersatz) ... bis längstens zum 31. Dezember 2027. Als Beherbergungsleistung gilt die Gewährung von Unterkunft einschliesslich der Abgabe eines Frühstücks, auch wenn dieses separat berechnet wird." Rates in force since 2024-01-01 (before: 7.7 / 2.5 / 3.7 %). The Federal Council proposed (consultation autumn 2025) to extend the Sondersatz to 2035; not decided as far as found. So the tool takes the rate per line from apaleo, accepts 8.1, 3.8, 2.6 and 0 without warning, warns on others (`W-VAT-RATE-UNUSUAL`, catches copied German/Austrian rows such as 7, 19, 10, 20 %), and the template leaves the historical 7.7/3.7/2.5 % rows empty with a comment (exports for 2023 need the Treuhänder), like the BMD template did with 5 %. MWST-Abrechnung Ziffern since 2024: 303 Normalsatz 8.1 %, 313 reduziert 2.6 %, 343 Beherbergung 3.8 % (302/312/342 for the old rates); Ziffer 910 for durchlaufende Posten / Nicht-Entgelte.

ESTV MWST-Branchen-Info 08 "Hotel- und Gastgewerbe" (MBI 08, mwst-webpublikationen):

- 6.1.1: "Als Beherbergung gilt die Gewährung von Unterkunft einschliesslich der Abgabe eines Frühstücks, selbst wenn dieses separat in Rechnung gestellt wird. Diese Leistungen sind zum Sondersatz steuerbar." Breakfast for a non-staying guest: Normalsatz.
- 6.1.3 erweiterte Nebenleistungen at the Sondersatz only if inside the hotel and included in the room price without surcharge (parking, sauna, fitness, ...).
- 6.2 übrige Leistungen at 8.1 %: meals other than the breakfast, minibar, telephone, bar, massages, parking or wellness with a surcharge; 2.6 %: take-away food (no alcohol), newspapers; excluded from tax: renting tennis courts, bowling, concert tickets, ...
- 6.4 Leistungskombinationen: Halbpension "Beherbergungsanteil wertmässig mindestens 70 %", may be invoiced as a whole at the Sondersatz; Vollpension pauschal 65 % Sondersatz / 35 % Normalsatz; packages always computed effectively. In apaleo the hotel splits packages into their components with their own VAT, so the tool only checks each line's rate against its mapping row (same as for Austria).
- 7.6 Minibar: Normalsatz.
- 7.11 Kur- und Beherbergungstaxen: "Die Kurtaxen ... sind öffentlich-rechtliche Abgaben, die der Gast schuldet. Die steuerpflichtige Person zieht diese ein und liefert sie dem zuständigen Gemeinwesen ab. Die Kurtaxen sind nicht zu versteuern, wenn die steuerpflichtige Person diese dem Gast in gleicher Höhe separat fakturiert und als solche bezeichnet." Without separate invoicing they are part of the Beherbergung at 3.8 %. "Die kantonalen oder kommunalen Beherbergungstaxen, für welche die steuerpflichtige Person – und nicht der Gast – abgabepflichtig ist, sind hingegen – auch bei separater Fakturierung – Teil des Entgelts für die Beherbergung" (3.8 %). Kurtaxen kept by the hotel (only a lump sum forwarded) are taxable at 3.8 % for the difference. "Die ESTV empfiehlt den steuerpflichtigen Beherbergungsbetrieben, die Kurtaxen als durchlaufende Posten zu verbuchen und unter Ziffer 910 der MWST-Abrechnung ... zu deklarieren." Names vary by Gemeinde/Kanton: Kurtaxe, Gästetaxe, Beherbergungsabgabe, Tourismusförderungsabgabe; the business-owed Tourismusabgabe (e.g. per Zimmer or Umsatz) is not posted by apaleo. Template: CityTaxes/SecondCityTax/GuestLevies rows stay empty with a comment naming both treatments; `docs/mapping-guide.md` explains guest-owed vs hotel-owed levies.
- 8.2 Gutscheine: Wertgutscheine are no Entgelt; Leistungsgutscheine are taxed when sold (Art. 40 Abs. 1 Bst. c). apaleo decides; the tool checks consistency.
- 8.7 Annullierungen: "Die Zahlungen von Kunden für Annullierungen (z. B. no show-Zahlungen) gelten als Schadenersatz. Sie stellen beim Gastwirt oder Hotelier kein Entgelt dar", unless already invoiced without a correction document. Template: cancellation/no-show revenue at 0 % to an untaxed account; at a rate above 0 the row stays empty with a comment (differs from Austria, where no-shows may be taxable).

Vereinbart vs vereinnahmt and Anzahlungen (MWSTG Art. 39, 40): "Über die Steuer wird nach vereinbarten Entgelten abgerechnet" (default; vereinnahmt on request). Art. 40 Abs. 1 Bst. c: with vereinbarte Entgelte the tax arises "mit der Vereinnahmung des Entgelts bei Vorauszahlungen"; Abs. 2: with vereinnahmte Entgelte "mit der Vereinnahmung des Entgelts". So a guest's Anzahlung is taxable when received under **both** methods; apaleo posts the deposit VAT (`VatOnLiabilities`, `PostPrepaymentVat`) and the engine already books deposits with tax and reverses it at release. In the file the method only changes the Abacus `UseCode` and the `TaxAccount` of the Collective block (Steuerkonto vs Hilfskonto of the MWST-Code). Config `abacus.abrechnungsart` (`vereinbart` default, `vereinnahmt`).

Caveat for `vereinnahmt`: Abacus books the output tax of such a booking to the Hilfskonto (`2202` "Umsatzsteuerausgleich Abrechnungsmethode") and moves it to the Steuerkonto when the payment is recorded, which normally happens in the Debitorenbuchhaltung (DEBI, out of scope). Revenue booked on the FIBU Sachkonten `1101`/`1102` with `UseCode` `1` may therefore stay on `2202` and never reach the MWST-Abrechnung. Legally the tax arises at payment (Art. 40 Abs. 2), but the file books it on the charge date, which matters for charges on accounts receivable that are unpaid at period end. Until a test import shows how Abacus treats FIBU-only bookings with `UseCode` `1` (open question 15), `doctor` and every export warn `W-ABRECHNUNGSART-VEREINNAHMT`, and the docs describe the manual period-end correction (Umbuchung of the `2202` balance to `2200` for the paid part, Debitorenkorrektur for unpaid accounts receivable) for the Treuhänder.

Not in v1: **Saldosteuersatzmethode / Pauschalsteuersatzmethode** (many small hotels use it; Abacus has `FlatRate` and SSS codes; the effective tax on gross revenue differs from the per-line VAT apaleo shows). `docs/mapping-guide.md` says so; `docs/maintainers.md` keeps it under `## Später geplant`.

## 5. Abacus MWST-Codes

"Code gemäss MWST-Tabelle des Mandanten": the codes are defined per Mandant (program 21 / MWST-Tabelle), text up to 3 characters. Abacus' own KMU sample Mandant (file `schweizer_kontenrahmen_kmu_mwstcodes.xml`, AbaConnect `DF / MwstCodes`, 2011 rates) uses among others:

| Code | Designation | Type (DBX) | Rate then | Form Ziffer | Accounts |
|---|---|---|---|---|---|
| 311 | Umsatzsteuer | 1 UST | 8 (Normalsatz) | 300 | 2200 Umsatzsteuer / 2202 Umsatzsteuerausgleich Abrechnungsmethode |
| 312 | Umsatzsteuer | 1 | 2.5 (reduziert) | 310 | 2200 / 2202 |
| 313 | Beherbergung | 1 | 3.8 | 340 | 2200 / 2202 |
| 318, 319 | Korr. UST / Korr. UST red. | 1 | | 300 / 310 | |
| 400 | UST steuerfrei | 1 | 0 | 230 | |
| 490 | Subvention Kurtaxen | 1 | 0 | 900 | |
| 491 | Spenden, Dividenden | 1 | 0 | 910 | |
| 133 | Kürzung Subv. Kurtax | 2 VST | | Vorsteuerkürzung | |
| 111/112, 121/122, 124 | Vorsteuer codes | 2 VST | | 400/405 | 1170/1171 |

Kurtaxe pitfall: code 490 "Subvention Kurtaxen" (Ziffer 900) is for Subventionen and Tourismusabgaben that a Kurverein collects, and it comes with a Vorsteuerkürzung (sample code 133). It is **not** the code for the Kurtaxe a hotel collects from its guests for the Gemeinde. That Kurtaxe is a durchlaufender Posten: no MWST-Code, or a Ziffer-910 code such as 491, never the Ziffer-900 code 490 (ESTV MBI 08 Ziff. 7.11 recommends Ziffer 910). The template comment, `docs/mapping-guide.md` and `W-MWST-CODE-UNCHECKED` (which names the Ziffer of a known sample code) say so.

Other Swiss software uses other code names (Banana's hotel/gastro model: V81, V38, V26, V0, ...). Decision: the mapping CSV carries the MWST-Code per row (`mwst_code`); `init-mapping --template kmu-hotel` fills it from three config values `abacus.mwstCodes.normal` (default `311`), `abacus.mwstCodes.reduziert` (default `312`) and `abacus.mwstCodes.beherbergung` (default `313`), taken from the Abacus KMU sample Mandant, every row marked `Vorschlag (ungeprüft)`. `mapping check` refuses a code on Payments/Receivables/AccountsReceivable rows (`E-MWST-CODE-NOT-ALLOWED`), requires a code for a rate above 0, and warns for a code at rate 0 (`W-MWST-CODE-UNCHECKED`, e.g. 400 or a Ziffer-910 code). The tax account for `TaxAccount` comes from `abacus.mwstKonto` (default `2200`) and, with `vereinnahmt`, `abacus.mwstHilfskonto` (default `2202`), the accounts of those sample codes.

## 6. Swiss KMU-Kontenrahmen and hotel accounts

Schweizer Kontenrahmen KMU (Sterchi/Mattle/Helbling, "Käfer" edition; official school version on kmu.admin.ch): 1000 Kasse, 1020 Bankguthaben, 1045 Kreditkarten/Debitkarten, 1100 Forderungen aus L+L (Debitoren), 1109 Wertberichtigungen, 1170/1171 Vorsteuer, 1190 Sonstige kurzfristige Forderungen, 2000 Verbindlichkeiten aus L+L, **2030 Anzahlungen von Dritten**, 2200 Umsatzsteuer, 2201 Abrechnungskonto MWST, 2210 Übrige kurzfristige Verbindlichkeiten, 3000 Produktionserlöse, 3200 Handelserlöse, 3400 Dienstleistungserlöse, 3600 Übrige Erlöse aus L+L, 3800 Erlösminderungen, **3805 Verluste Forderungen**, 3809 MWST Saldosteuersatz. The industry chart "Schweizer Kontenrahmen für die Hotellerie und Gastronomie" (hotelleriesuisse, GastroSuisse, SGH; 2014 edition for the 2013 OR, revision announced) builds on the KMU chart and USALI; Banana's model of it uses 3400 "Beherbergung Ertrag Sammelkonto", 3102-3105 beverages, 3201 "Küche Ertrag Sammelkonto", 3501-3511 übrige Hotelleistungen (Telefon, Garage, Wellness, Seminar/Bankett), 2207 "Anzahlungen von Kunden".

Template `kmu-hotel` (4-digit, every row `Vorschlag (ungeprüft)`, numbers are the Treuhänder's choice):

| apaleo | Abacus account | MWST |
|---|---|---|
| Accommodation (and breakfast in the room price) at 3.8 % | 3400 Beherbergung | `beherbergung` code, 3.8 |
| Food at 8.1 % | 3200 Küche / Speisen | `normal`, 8.1 |
| Drinks at 8.1 % | 3100 Getränke | `normal`, 8.1 |
| other revenue at 8.1 % (minibar, parking, wellness, telephone) | 3500 Übrige Hotelleistungen | `normal`, 8.1 |
| revenue at 2.6 % (take-away, newspapers) | 3260 Verkäufe zum reduzierten Satz | `reduziert`, 2.6 |
| revenue at 0 % | 3600 Erlöse ohne MWST | none, comment (excluded vs. not taxable) |
| cancellation / no-show at 0 % | 3680 Annullationen und No-Shows (Schadenersatz) | none (MBI 08 Ziff. 8.7) |
| cash payments | 1000 Kasse | none |
| non-cash payments | 1090 Transferkonto (or 1045 Kreditkarten/Debitkarten) | none |
| guest folios (Receivables) | 1101 Gästeforderungen | none |
| accounts receivable | 1102 Debitoren apaleo (Sachkonto) | none; comment: 1100 is the Sammelkonto of the Abacus Debitorenbuchhaltung and takes no direct FIBU postings when DEBI is used |
| deposits (Liabilities) by rate | 2030 at 3.8, 2031 at 8.1, 2032 at 2.6, 2039 at 0 | rate's code |
| LossOfAccountsReceivable by rate | 3805 at 3.8, 3806 at 8.1, 3807 at 2.6, 3808 at 0 | rate's code (Entgeltsminderung) |
| CityTaxes, SecondCityTax, GuestLevies, House, TransitoryItems | empty, comment | |

Account numbers: Abacus accounts are numbers of up to 11 digits; the tool checks digits only and length 1-11 (`E-ACCOUNT-FORMAT`), no Sachkontenlänge scaling as with BMD.

## 7. CHF, Rappen and apaleo

- Amounts: bookings are exact to the Rappen (0.01 CHF). The 5-Rappen rounding is a cash practice (the 1-Rappen coin was withdrawn on 2007-01-01, SNB/swissmint; non-cash payments settle any amount); it is never applied to bookings. If apaleo posts a cash rounding line, it is an ordinary line on its own account and mapped like any other.
- Currency: an Abacus booking line names its currency (`AmountData/Currency`) and the Mandant's Leitwährung (`KeyCurrency`); the tool does not convert and writes no `ExchangeRateData`. The property currency must equal `abacus.leitwaehrung` (default `CHF`; `EUR` allowed, because OR Art. 957a Abs. 4 allows the "für die Geschäftstätigkeit wesentliche Währung"), else `E-CURRENCY`. The engine's EUR-only rule (`EXPORT_CURRENCY` in `src/export/pipeline.ts`) moves into the target writer.
- apaleo properties carry `currencyCode`; a Swiss property has `CHF` and Swiss VAT types. Which apaleo VAT type names a Swiss property uses for 3.8 % (`Special`, `Reduced` or another of `Null, VeryReduced, Reduced, Normal, Without, Special, Special1, Special2, ...`) is not known from a recording yet (open question 6); the tool never depends on the type name, only on the percent, and the CHF fixtures are fabricated in the shape of the recorded BER/VIE data.

## 8. Open-source cross-checks (read only, never copied)

- libracore/erpnextswiss (AGPL-3.0), `doctype/abacus_export_file/transfer_file.html` and `page/abacus_export/abacus_export.py` (read 2026-10-21): AbaConnect `XML Buchungen` `AbaDefault` `2015.00`, one `Transaction id=n` per entry, `EntryType` S (C for several Singles), the same `DebitCredit` on both blocks (`D` for sales invoices, `C` for purchase invoices in the template), positive amounts, `TaxData` only in `SingleInformation` with `TaxIncluded` I and the **constants** `TaxType` 1 and `UseCode` 1 on every transaction, `TaxCoefficient` 100, `Country` CH, `TaxData/KeyAmount` = tax × −1 on every transaction regardless of `DebitCredit`, and, since commit ea1771c (2023-10-31), `TaxData/AmountData/Amount` `0` whenever the booking currency equals the Leitwährung ("hardcoded 0 otherwise abacus raises an error if doc currency = key currency"). `TaxAccount` is written only in `SingleInformation`, with the tax account (for example `2200`), not the revenue account; `CollectiveInformation` has no `TaxAccount`. Read together, the constants suggest that Abacus with "MWST berechnen" derives type, use code and sign from the MWST-Code; they are no evidence for the meaning of `TaxType` `1` or for a sign rule.
- phamos-eu/Swiss-Accounting-Integration (GPL-3.0) `abacus.html`: same layout.
- HeribertG/Klacks.Api (AGPL-3.0): AbaConnect payroll (`LOHN / FlatPreEntry`), only confirms container and decimal-point conventions.

## 9. Open questions for the first real import

Each answer is a setting in one place (`src/abacus/format.ts` or a config key) and is recorded in `docs/maintainers.md` under `## Testimporte`; the first-import checklist in `docs/abacus-import.md` and the open questions in `docs/abacus-format.md` list every one of them:

1. Which Abacus licence/program does the Treuhänder use (F11, F5534, F625), and does the Mandant need anything beyond the FIBU Buchungsschnittstellen?
2. Does the current Abacus release import interface version `2015.00` without warning, or must `abacus.version` be `2024.00`?
3. `TaxType` `0` (documentation) or `1` (the constant erpnextswiss writes on sales and purchase invoices alike)? With "MWST berechnen" on, does Abacus ignore the file's value and take the type from the MWST-Code?
4. Sign of the tax amount in `TaxData`: negative when the Single account is credited and positive when it is debited (our hypothesis), or always negative as erpnextswiss writes it, or recomputed from the code with "MWST berechnen"? Flipping it changes `taxSign()` only; `E-ABACUS-TAX-SIGN` follows the same function.
5. With "MWST berechnen" off: does Abacus accept apaleo's tax when it differs by one Rappen from `gross × rate / (100 + rate)`? With it on: does the MWST-Journal match the protocol per code?
6. apaleo VAT type names and account numbers of a Swiss property (record a CHF sandbox day with `live-smoke` once available).
7. `DocumentNumber`: are the `MMDD` + 6-digit numbers accepted, and does Abacus warn on duplicates across files? The number has no year, so files that start on the same day of different years (2026-10-01 and 2027-10-01) both begin with `1001000001` in the same Mandant: does Abacus check Belegnummern per Geschäftsjahr (then they stay unique), or across years?
8. `TaxAccount` on the Collective block: Steuerkonto (2200) / Hilfskonto (2202) as documented, or `0`? And on rate-0 codes (400, 490, 491), which have no Steuerkonto in the KMU sample Mandant (§5): `2200` / `2202` as on every other code (our default `TAX_ACCOUNT_AT_RATE_ZERO = 'taxAccount'`) or `0` (`'zero'`, the reading of "Steuerkonto des MWST-Codes" in the 2020 PDF)? This matters most with "MWST berechnen" off, when Abacus validates the MWST data of the file.
9. Do imported bookings land in a Nebenjournal that the Treuhänder can delete before transfer (the undo path named in `E-FILE-EXISTS`)?
10. Anzahlungen: does the Treuhänder want deposits on 2030ff with the normal UST code, or a dedicated code for Vorauszahlungen?
11. `TaxData/AmountData/Amount` when `Currency` equals `KeyCurrency`: `0.00` with the tax only in `KeyAmount` (erpnextswiss practice since 2023, our default `TAX_AMOUNT_IN_KEY_CURRENCY = 'zero'`), or the tax amount (`'tax'`, the reading of the field list)?
12. `TaxAccount` in `SingleInformation`: the revenue account itself (2020 PDF table, our default `SINGLE_TAX_ACCOUNT`) or the tax account of the code (erpnextswiss)? And is a missing Collective `TaxAccount` accepted?
13. With "MWST berechnen" on: is the file's `TaxCode` kept, or replaced by the default MWST-Code of the account in F21? Does the MWST-Journal match the "account -> MWST-Code" pairs of the protocol?
14. Is `TaxIncluded` `I` accepted on rate-0 codes whose sample flag is `Inclusive` `0` (491, 490) or `1` (400) when "MWST berechnen" is off, or must `TAX_INCLUDED_AT_RATE_ZERO` be `E`?
15. `vereinnahmt`: how does Abacus treat FIBU-only bookings with `UseCode` `1` on the Hilfskonto `2202` when no payment is recorded in the Debitorenbuchhaltung, and which period-end correction does the Treuhänder make? Until answered, `W-ABRECHNUNGSART-VEREINNAHMT` warns.

## Sources

- Abacus AbaConnect documentation "Schnittstelle FIBU - XML Buchungen", versions 2024.00 (DE/EN), 2022.00, 2015.00 (EN), and "FIBU - ASCII Buchungen" 2014.00, downloads.abacus.ch (offline for maintenance on 2026-10-21, read from the Internet Archive): https://downloads.abacus.ch/fileadmin/ablage/abaconnect/htmlfiles/fibu/FIBU__XML%20Buchungen_2024.00_AbaDefault_DE.html (archived 2024-07-19: https://web.archive.org/web/20240719061901/https://downloads.abacus.ch/fileadmin/ablage/abaconnect/htmlfiles/fibu/FIBU__XML%20Buchungen_2024.00_AbaDefault_DE.html), https://downloads.abacus.ch/fileadmin/ablage/abaconnect/htmlfiles/fibu/FIBU__XML%20Buchungen_2015.00_AbaDefault_EN.html, https://downloads.abacus.ch/fileadmin/ablage/abaconnect/htmlfiles/fibu/FIBU__ASCII%20Buchungen_2014.00_AbaDefault_EN.html
- Abacus Research AG, "XML-AbaConnect Fibu Buchungsschnittstelle (Version 2020)", V1.0, 02.07.2020 (MWST berechnen, TaxType, TaxAccount tables, Sammelbuchung): https://downloads.abacus.ch/fileadmin/ablage/abaconnect/htmlfiles/fibu/Buchungsschnittstellendokumentation.pdf (archived 2023-03-20)
- Abacus KMU sample Mandant MWST-Codes, AbaConnect `DF/MwstCodes`: https://downloads.abacus.ch/fileadmin/ablage/dokumente/06_weitere_applikationsdokumente/finanzen/schweizer_kontenrahmen_kmu_mwstcodes.xml (archived 2023-06-02)
- Abacus, AbaWeb Profilübersicht 2019 (Buchungsschnittstellen in Fibu profiles 2 and 3, "Schnittstelle Abaconnect"): https://media.abacus.ch/abasky/terms/pl2019_abaweb_profiluebersicht_de.pdf
- bexio help, "Buchungen - Belege in Abacus importieren" (F11, F5534, F625, MWST berechnen): https://help.bexio.com/s/article/000002512?language=de
- contofox, "Der Importablauf in Abacus": https://contofox.com/kb/der-importablauf-in-abacus/
- Vertec, "AbaConnect XML Debitoren Schnittstelle" (licensing via the Abacus account manager): https://www.vertec.com/de-ch/kb/abaconnectxmldebitoren/
- apaleo Store, "Abacus Connector" (Grman IT Solutions): https://store.apaleo.com/apps/abacus-connector
- Grman help desk, folder Abacus: https://grman.freshdesk.com/support/solutions/folders/48000693536 (articles Willkommen, Abacus Konfiguration, Konfiguration der Abacus Felder, Zuordnung der Konten, Abacus-Importe, Automatischer Import, Debitoren Schnittstelle)
- MWSTG SR 641.20, Art. 24, 25, 39, 40 (consolidated 2025-03-31): https://www.fedlex.admin.ch/eli/cc/2009/615/de
- ESTV, MWST-Branchen-Info 08 Hotel- und Gastgewerbe (Ziff. 6.1.1, 6.1.3, 6.2, 6.4, 7.6, 7.11, 8.2, 8.7): https://www.gate.estv.admin.ch/mwst-webpublikationen/public/pages/sectorInfos/cipherDisplay.xhtml?publicationId=1014334&componentId=1015974&lang=de
- ESTV, MWST-Info 19 Steuersatzerhöhung per 1. Januar 2024, Ziff. 3.1: https://www.gate.estv.admin.ch/mwst-webpublikationen/public/pages/taxInfos/cipherDisplay.xhtml?publicationId=1003601&componentId=1003931
- ESTV, Muster MWST-Abrechnung 2024 (Ziffern 303/313/343): https://www.estv.admin.ch/dam/estv/de/dokumente/mwst/formulare/mwst-form-abr-muster-2024-0550-03-de.pdf.download.pdf/mwst-form-abr-muster-2024-0550-03-de.pdf
- Sondersatz extension consultation 2025 (e.g. STV statement): https://files.stv-fst.ch/staging/assets/tourismuspolitik/stellungnahmen/251111_stv_vernehmlassung_mwst.pdf
- Schulkontenrahmen KMU (kmu.admin.ch): https://www.kmu.admin.ch/dam/de/sd-web/Q2HAXEngBfiW/schulkontenrahmen-kmu.pdf
- hotelleriesuisse, Schweizer Kontenrahmen für die Hotellerie und Gastronomie (2014 notes): https://www.hotelleriesuisse.ch/de/download-2659E905-2398-4416-8713-0E24D418FB10.secure
- Banana Buchhaltung, Kontenplan Hotellerie und Gastronomie: https://www.banana.ch/apps/de/node/9056
- SNB, Münzen (Einrappenstück ausser Kurs 2007): https://www.snb.ch/de/the-snb/mandates-goals/cash/coins
- Cross-checks (read only, not copied): https://github.com/libracore/erpnextswiss (AGPL-3.0), https://github.com/phamos-eu/Swiss-Accounting-Integration (GPL-3.0), https://github.com/HeribertG/Klacks.Api (AGPL-3.0)
