# Abacus-Format: die Datei XML Buchungen

Diese Seite beschreibt die Datei, die das Tool für die Abacus Finanzbuchhaltung (FIBU) schreibt, Feld für Feld, mit den Quellen. Gedacht ist sie für Treuhänder, Buchhaltung und alle, die eine Datei vor dem Import prüfen oder den Writer ändern wollen. Der Writer steht in `src/abacus/`; jede Regel unten ist dort und in den Golden-Dateien unter `test/golden/abacus/` festgehalten.

Keine Gewähr, keine Steuerberatung, lass deine Kontenzuordnung von deinem Treuhänder prüfen. Bis zum ersten echten Testimport mit einem Treuhänder ist jede Regel auf dieser Seite aus der Dokumentation von Abacus abgeleitet und nicht in einem Mandanten erprobt. Die offenen Fragen dazu stehen [unten](#offene-fragen).

## Welche Schnittstelle

Das Tool schreibt die AbaConnect-Schnittstelle «XML Buchungen» der Applikation FIBU mit dem Mapping `AbaDefault`. Das ist die eigene, dokumentierte Dateischnittstelle von Abacus für Buchungen der Finanzbuchhaltung (Versionen 2007.00 bis 2024.00). Dein Treuhänder importiert die Datei ohne Partnerschaft und ohne API-Zugang:

- in **F11 Buchen**: Datei in das Buchungsfenster ziehen, die Importmaske öffnet sich, «Start»;
- in **F5534 «Import/Export Buchungen AbaConnect»** (Hilfsprogramme, Buchungsschnittstellen): auf «Import» wechseln, Importart «XML Buchungen», Datei wählen;
- oder in **F625 AbaConnect** mit «Import XML» und der Schnittstelle «XML Buchungen».

Die ältere Schnittstelle «ASCII Buchungen» endet mit Version 2014.00, die AbaConnect-Webservices brauchen Netzwerkzugang zum Mandanten und eine eigene Lizenz. Beides nutzt das Tool nicht.

## Container

Jede Datei hat genau einen `Task` mit einem Block `Parameter`:

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
      <Mandant>1234</Mandant>
    </Parameter>
    <Transaction id='1'>
      <Entry mode='SAVE'>
        ...
      </Entry>
    </Transaction>
  </Task>
</AbaConnectContainer>
```

- `TaskCount` ist immer `1`.
- `Version` ist die Version der Schnittstelle aus `abacus.version` (Standard `2015.00`; auch `2020.00`, `2022.00` und `2024.00`). Alle Felder, die das Tool schreibt, gibt es seit 2012.00 unverändert. Version 2015.00 markiert mehr Felder als Pflicht, deshalb schreibt das Tool sie immer.
- `Mandant` ist die Mandantennummer aus `abacus.mandant` (oder `properties[].mandant`). Mit der Importeinstellung «nur Buchungen mit gleicher Mandantennummer» lehnt Abacus die Datei in einem falschen Mandanten ab.
- Pro Buchung gibt es eine `Transaction` mit fortlaufender `id` ab 1 und darin ein `Entry`. Ein Monat ohne Buchungen ergibt eine Datei ohne `Transaction`.
- Jeder Block (`Entry`, `CollectiveInformation`, `SingleInformation`, `AmountData`, `TaxData`) trägt `mode='SAVE'`, wie es die Dokumentation verlangt.

## Einzelbuchung

Jede apaleo-Zeile wird eine Einzelbuchung (`EntryType` `S`): ein Block `CollectiveInformation` für das erste Konto und ein Block `SingleInformation` für das zweite Konto. Sammelbuchungen schreibt das Tool nicht, damit jede Buchung auf genau eine Zeile im Buchungsjournal von apaleo zurückführt.

Nur `SingleInformation` kann `TaxData` tragen. Deshalb ist das MWST-pflichtige Konto (Erlös, Anzahlung, Debitorenverlust) immer das Konto der `SingleInformation`, das andere Konto steht in der `CollectiveInformation`. `DebitCredit` ist in beiden Blöcken gleich und nennt die Seite des Kontos der `CollectiveInformation`: `D`, wenn es im Soll steht und das Gegenkonto im Haben, `C` im umgekehrten Fall. Beide Beträge sind positiv; die Richtung kommt nur aus `DebitCredit`.

`CollectiveInformation`, in dieser Reihenfolge:

| Feld | Wert |
|---|---|
| `EntryLevel` | `A` (Ist-Buchung) |
| `EntryType` | `S` (Einzelbuchung) |
| `Type` | `Normal` |
| `DebitCredit` | `D` oder `C` |
| `Client` | Mandantennummer, höchstens 6 Ziffern |
| `Division` | Geschäftsbereich aus `abacus.geschaeftsbereich`, `0` ohne Geschäftsbereich |
| `KeyCurrency` | Leitwährung des Mandanten aus `abacus.leitwaehrung` |
| `EntryDate` | Buchungsdatum aus apaleo, `JJJJ-MM-TT` |
| `AmountData` | `Currency` (Leitwährung) und `Amount` (Bruttobetrag) |
| `KeyAmount` | Bruttobetrag in der Leitwährung |
| `Account` | Konto, höchstens 11 Ziffern |
| `TaxAccount` | mit MWST das Steuerkonto `abacus.mwstKonto` (vereinbart) oder das Hilfskonto `abacus.mwstHilfskonto` (vereinnahmt), bei einem MWST-Code mit Satz 0 je nach Konstante `TAX_ACCOUNT_AT_RATE_ZERO` dasselbe Konto (Standard) oder `0`, ohne MWST `0` |
| `Text1` | Buchungstext, höchstens 80 Zeichen |
| `Text2` | Beleg oder Referenz aus apaleo, höchstens 80 Zeichen, fehlt, wenn leer |
| `DocumentNumber` | Belegnummer, 10 Zeichen |
| `SingleCount` | `0` |

`SingleInformation`, in dieser Reihenfolge: `Type`, `DebitCredit`, `EntryDate`, `AmountData`, `KeyAmount`, `Account` (das Gegenkonto), `TaxAccount` (mit MWST das Konto selbst, ohne MWST `0`), `BookingLevel1` (nur mit Kostenstelle), `Text1`, `Text2`, `DocumentNumber` und bei einer Buchung mit MWST `TaxData`.

Beispiel: Logis für 207,60 CHF zu 3,8 %, Gästeforderung `1101` an Beherbergung `3400`, MWST-Code `313`:

```xml
<CollectiveInformation mode='SAVE'>
  ...
  <DebitCredit>D</DebitCredit>
  <Client>1234</Client>
  <Division>0</Division>
  <KeyCurrency>CHF</KeyCurrency>
  <EntryDate>2026-10-14</EntryDate>
  <AmountData mode='SAVE'>
    <Currency>CHF</Currency>
    <Amount>207.60</Amount>
  </AmountData>
  <KeyAmount>207.60</KeyAmount>
  <Account>1101</Account>
  <TaxAccount>2200</TaxAccount>
  ...
</CollectiveInformation>
<SingleInformation mode='SAVE'>
  ...
  <Account>3400</Account>
  <TaxAccount>3400</TaxAccount>
  ...
  <TaxData mode='SAVE'>
    <TaxIncluded>I</TaxIncluded>
    <TaxType>0</TaxType>
    <UseCode>0</UseCode>
    <AmountData mode='SAVE'>
      <Currency>CHF</Currency>
      <Amount>0.00</Amount>
    </AmountData>
    <KeyAmount>-7.60</KeyAmount>
    <TaxRate>3.8</TaxRate>
    <TaxCoefficient>100</TaxCoefficient>
    <Country>CH</Country>
    <TaxCode>313</TaxCode>
    <FlatRate>0</FlatRate>
  </TaxData>
</SingleInformation>
```

Eine Kostenstelle aus der Kontenzuordnung steht als `BookingLevel1` nur in der `SingleInformation`, direkt nach `TaxAccount`.

## MWST in TaxData

Das Tool bucht Bruttobeträge. `TaxData` sagt Abacus, welcher Anteil davon MWST ist:

| Feld | Wert |
|---|---|
| `TaxIncluded` | `I` (MWST im Betrag enthalten); bei einem MWST-Code mit Satz 0 der Wert der Konstante `TAX_INCLUDED_AT_RATE_ZERO` (Standard `I`) |
| `TaxType` | `0` = Umsatzsteuer laut Feldbeschreibung von Abacus (Konstante `TAX_TYPE_OUTPUT`) |
| `UseCode` | `0` mit `abacus.abrechnungsart` `vereinbart`, `1` mit `vereinnahmt` |
| `AmountData` | `Currency` (Leitwährung) und `Amount` `0.00` |
| `KeyAmount` | die MWST aus apaleo in Rappen, mit Vorzeichen |
| `TaxRate` | Satz mit Dezimalpunkt, ohne Nullen am Ende: `8.1`, `3.8`, `2.6`, `0` |
| `TaxCoefficient` | `100` |
| `Country` | `CH` |
| `TaxCode` | der MWST-Code aus der Kontenzuordnung, höchstens 3 Zeichen |
| `FlatRate` | `0` (keine Saldosteuersatzmethode in dieser Version) |

**Betrag `0.00` und MWST in `KeyAmount`.** Jede Buchung ist in der Leitwährung des Mandanten, `Currency` und `KeyCurrency` sind also gleich. Dann schreibt das Tool `AmountData/Amount` als `0.00` und die MWST nur in `KeyAmount`. So macht es auch erpnextswiss, der einzige produktive Abacus-Writer, den wir zum Vergleich gelesen haben: Dort steht seit 2023 fest `0`, weil Abacus sonst einen Fehler meldete. Die Feldliste liest sich anders (MWST-Betrag in der Buchungswährung); die Konstante `TAX_AMOUNT_IN_KEY_CURRENCY` in `src/abacus/format.ts` (`zero` oder `tax`) stellt das mit einer Zeile um.

**Vorzeichen.** Die MWST ist negativ, wenn das Gegenkonto der `SingleInformation` im Haben steht (`DebitCredit` `D`, geschuldete Umsatzsteuer), und positiv, wenn es im Soll steht (`C`, zum Beispiel ein Nachlass oder ein Debitorenverlust). Bei Satz 0 ist sie `0.00`. Diese Regel ist eine Annahme bis zum ersten Testimport; sie steht in einer einzigen Funktion `taxSign()` in `src/abacus/format.ts`, und die Prüfung `E-ABACUS-TAX-SIGN` ruft dieselbe Funktion auf.

**TaxAccount.** Die Tabelle der Abacus-Dokumentation (2020, «MWST berechnen») nennt für eine inklusiv gebuchte Umsatzsteuer: in der `CollectiveInformation` das Steuerkonto des MWST-Codes (vereinbart) oder sein Hilfskonto (vereinnahmt), in der `SingleInformation` das Ertragskonto selbst. Die Standardwerte `2200` und `2202` sind die Konten der MWST-Codes 311, 312 und 313 im KMU-Mustermandanten von Abacus. erpnextswiss schreibt stattdessen das Steuerkonto in die `SingleInformation`; die Konstante `SINGLE_TAX_ACCOUNT` (`account` oder `taxAccount`) stellt das um. Ohne MWST ist `TaxAccount` in beiden Blöcken `0`.

**TaxAccount bei Satz 0.** Die Codes mit Satz 0 (400, 490, 491) haben im KMU-Mustermandanten kein Steuerkonto, die Dokumentation von 2020 nennt aber das «Steuerkonto des MWST-Codes». Das Tool schreibt in der `CollectiveInformation` auch bei diesen Codes `abacus.mwstKonto` (oder `abacus.mwstHilfskonto`); möglich ist, dass Abacus dort `0` erwartet, vor allem ohne «MWST berechnen», wenn es die MWST-Daten der Datei prüft. Die Konstante `TAX_ACCOUNT_AT_RATE_ZERO` (`taxAccount` oder `zero`) stellt das mit einer Zeile um; der erste Testimport entscheidet (offene Frage 8).

Die MWST rechnet das Tool nicht selbst nach Abacus-Art: Es schreibt die MWST, die apaleo pro Zeile auf den Rappen gerundet hat, damit der Import nicht von der Rundung im Mandanten abhängt. Es prüft aber, dass sie zum Satz passt: Weicht sie um mehr als einen Rappen von `Brutto × Satz / (100 + Satz)` ab, schreibt der Writer keine Datei (`E-ABACUS-TAX-RATE`). Ohne «MWST berechnen» übernimmt Abacus die MWST nämlich so, wie sie in der Datei steht.

## MWST berechnen und der MWST-Code eines Kontos in F21

Ohne besondere Einstellung prüft Abacus beim Import jede Buchung auf korrekte MWST und lehnt fehlerhafte ab. Mit der Importoption «MWST berechnen» (Register Gestaltung in F5534 oder F625) berechnet Abacus fehlende oder fehlerhafte MWST selbst. Abacus empfiehlt diese Option, und das Protokoll des Tools empfiehlt sie auch.

Achtung: Mit «MWST berechnen» nimmt Abacus laut Dokumentation den MWST-Code, der dem Konto im Kontenplan (Programm 21) hinterlegt ist, und nicht unbedingt den Code aus der Datei. Jedes Konto, das in der Datei MWST trägt (Erlöse, Anzahlungen, Debitorenverluste, eine Kurtaxe mit Code), muss deshalb in F21 MWST-pflichtig sein und denselben MWST-Code tragen wie seine Zeile in der Kontenzuordnung. Ein Konto ohne MWST darf keinen Code tragen. Sonst stimmt die MWST-Abrechnung nicht, ohne dass der Import einen Fehler meldet.

Damit dein Treuhänder das vergleichen kann, listet der Block «Import into Abacus FIBU» im Protokoll jedes Paar «Konto -> MWST-Code» der Datei, jeden MWST-Code mit seinen Sätzen und seiner MWST-Summe, die verwendeten `TaxAccount` und die Werte der Konstanten oben. Mit «MWST berechnen» kann Abacus eine einzelne Buchung um einen Rappen anders runden; vergleich die Summen pro Code mit dem MWST-Journal.

## Zahlen und Datum

- Beträge mit Dezimalpunkt, genau zwei Nachkommastellen, Minus vorne, ohne Tausendertrennzeichen: `1234.55`, `0.01`, `-7.60`. Höchstens 11 Stellen vor dem Punkt.
- Beträge sind auf den Rappen genau. Die 5-Rappen-Rundung ist eine Praxis an der Kasse und wird nie auf Buchungen angewendet.
- Sätze mit Dezimalpunkt und ohne Nullen am Ende: `8.1`, `3.8`, `2.6`, `0`. In Texten dieser Doku schreiben wir sie Schweizer Art als 8,1 %, 3,8 % und 2,6 %.
- Datum als `JJJJ-MM-TT`, zum Beispiel `2026-10-14`. `EntryDate` ist das Buchungsdatum der Zeile in apaleo.
- Konten und Kostenstellen sind Zahlen mit 1 bis 11 Ziffern, ohne Auffüllen.

## Belegnummer

`DocumentNumber` ist ein Text mit 10 Zeichen. Das Tool bildet ihn aus Monat und Tag des ersten Tags des Zeitraums und einem 6-stelligen Zähler in Dateireihenfolge: Die Oktoberdatei vom 2026-10-01 hat `1001000001`, `1001000002` und so weiter, eine Tagesdatei vom 2026-10-15 beginnt mit `1015000001`. Beide Blöcke einer Buchung tragen dieselbe Nummer. So wiederholt sich keine Nummer in einer Datei, Dateien eines Hotels mit unterschiedlichem ersten Tag im selben Kalenderjahr teilen nie eine Nummer, und dieselben Buchungen bekommen immer dieselben Nummern. Das Jahr steht nicht in der Nummer, dafür reichen die 10 Zeichen nicht: Die Dateien ab 2026-10-01 und ab 2027-10-01 beginnen beide mit `1001000001`. Die Nummern sind also nur im selben Geschäftsjahr eindeutig, und das genügt nur, wenn Abacus Doppelte pro Geschäftsjahr prüft. Das klärt der erste Testimport (offene Frage 7). Eine Datei hat höchstens 999 999 Buchungen (`E-ABACUS-BELEGNR`).

Abacus nutzt die Belegnummer nur, wenn sie in F621 (Finanzbuchhaltung, Allgemein, Einstellungen) aktiv ist. Bucht dein Treuhänder zwei Hotels in denselben Mandanten und Geschäftsbereich, können sich ihre Belegnummern wiederholen; `doctor` und das Protokoll warnen dann mit `W-MANDANT-SHARED`. Gib jedem Hotel einen eigenen Geschäftsbereich (`properties[].geschaeftsbereich`) oder einen eigenen Mandanten (`properties[].mandant`).

Den Beleg oder die Referenz aus apaleo schreibt das Tool in `Text2`, wo der Treuhänder ihn in Abacus sieht.

## Zeichensatz und Texte

- UTF-8 ohne Byte-Order-Mark, jede Zeile endet mit LF, zwei Leerzeichen Einzug pro Ebene, Attribute in einfachen Anführungszeichen wie in den Beispielen von Abacus.
- `&`, `<`, `>`, `'` und `"` im Text werden zu `&amp;`, `&lt;`, `&gt;`, `&apos;` und `&quot;`. Umlaute bleiben Umlaute: `ä` steht als die UTF-8-Bytes `C3 A4` in der Datei.
- In `Text1` und `Text2` werden Tabulator und Zeilenumbruch zu einem Leerzeichen, andere Steuerzeichen und Zeichen, die XML 1.0 nicht erlaubt, fallen weg, doppelte Leerzeichen werden eins, und der Text wird auf 80 Zeichen gekürzt (`N-ABACUS-TRUNCATED`). Ein leerer `Text1` ist ein Fehler (`E-ABACUS-TEXT`), ein leerer `Text2` fällt weg.
- Die Datei enthält keine Erstellungszeit. Dieselben Buchungen ergeben Byte für Byte dieselbe Datei, darum erkennt das Tool eine unveränderte Datei am Inhalt.

Der Dateiname ist `ABACUS_Buchungen_<JJJJMMTT>-<JJJJMMTT>_<Hotel>.xml` mit dem ersten und letzten Tag des Zeitraums, zum Beispiel `ABACUS_Buchungen_20261001-20261031_BSP.xml`.

## Prüfungen vor dem Schreiben

Bevor der Writer eine Datei schreibt, prüft er jede Buchung und meldet alle Fehler auf einmal, mit Buchungsnummer und Feld; dann schreibt er nichts. Die Codes `E-ABACUS-ACCOUNT` bis `E-ABACUS-BELEGNR` und was du dagegen tust, stehen in [troubleshooting.md](troubleshooting.md#abacus-datei-xml-buchungen).

## Offene Fragen

Jede Antwort ist eine Einstellung an einer Stelle: eine Konstante in `src/abacus/format.ts` oder ein Schlüssel der Konfiguration. Nach dem ersten Testimport mit einem Treuhänder halten wir das Ergebnis fest und ändern höchstens diese Stelle und die Golden-Dateien.

1. Welches Programm und welche Lizenz nutzt der Treuhänder (F11, F5534, F625), und braucht der Mandant mehr als die Buchungsschnittstellen der FIBU?
2. Importiert das aktuelle Abacus die Schnittstellenversion `2015.00` ohne Warnung, oder muss `abacus.version` `2024.00` sein?
3. `TaxType` `0` (Dokumentation) oder `1` (die Konstante von erpnextswiss)? Nimmt Abacus mit «MWST berechnen» den Typ ohnehin aus dem MWST-Code?
4. Vorzeichen der MWST in `TaxData`: negativ im Haben und positiv im Soll (unsere Annahme), immer negativ wie bei erpnextswiss, oder rechnet Abacus es mit «MWST berechnen» neu? Eine Änderung betrifft nur `taxSign()`.
5. Akzeptiert Abacus ohne «MWST berechnen» die MWST aus apaleo, wenn sie um einen Rappen von `Brutto × Satz / (100 + Satz)` abweicht? Stimmt mit der Option das MWST-Journal pro Code mit dem Protokoll überein?
6. Welche MWST-Typen und Kontonummern hat ein Schweizer Hotel in apaleo? (Aufzeichnung eines CHF-Tags mit `live-smoke`, sobald es eine Testumgebung gibt.)
7. Nimmt Abacus die Belegnummern aus Monat, Tag und 6-stelligem Zähler an, und warnt es bei Doppelten über mehrere Dateien? Prüft es Doppelte pro Geschäftsjahr? Nur dann bleiben die Nummern eindeutig, wenn zwei Dateien am selben Tag verschiedener Jahre beginnen (2026-10-01 und 2027-10-01 beginnen beide mit `1001000001`).
8. `TaxAccount` in der `CollectiveInformation`: Steuerkonto `2200` und Hilfskonto `2202` wie dokumentiert, oder `0`? Und bei Codes mit Satz 0 (400, 490, 491), die im KMU-Mustermandanten kein Steuerkonto haben: `2200` beziehungsweise `2202` (unser Standard `TAX_ACCOUNT_AT_RATE_ZERO = 'taxAccount'`) oder `0` (`'zero'`)?
9. Landen importierte Buchungen in einem Nebenjournal, das der Treuhänder vor der Übernahme löschen kann? Das ist der Weg, den die Meldung `E-FILE-EXISTS` zum Rückgängigmachen nennt.
10. Anzahlungen: Will der Treuhänder sie auf 2030 und folgende mit dem normalen MWST-Code, oder mit einem eigenen Code für Vorauszahlungen?
11. `TaxData/AmountData/Amount`, wenn `Currency` gleich `KeyCurrency` ist: `0.00` mit der MWST nur in `KeyAmount` (unser Standard `TAX_AMOUNT_IN_KEY_CURRENCY = 'zero'`) oder der MWST-Betrag (`'tax'`)?
12. `TaxAccount` in der `SingleInformation`: das Ertragskonto selbst (unser Standard `SINGLE_TAX_ACCOUNT = 'account'`) oder das Steuerkonto des Codes (`'taxAccount'`, wie bei erpnextswiss)? Und akzeptiert Abacus eine `CollectiveInformation` ohne `TaxAccount`?
13. Behält Abacus mit «MWST berechnen» den `TaxCode` der Datei, oder ersetzt es ihn durch den MWST-Code des Kontos in F21? Passt das MWST-Journal zu den Paaren «Konto -> MWST-Code» im Protokoll?
14. Nimmt Abacus ohne «MWST berechnen» `TaxIncluded` `I` bei Codes mit Satz 0 an, deren Muster-Flag `Inclusive` `0` (491, 490) oder `1` (400) ist, oder muss `TAX_INCLUDED_AT_RATE_ZERO` `E` sein?
15. Vereinnahmte Entgelte: Wie behandelt Abacus reine FIBU-Buchungen mit `UseCode` `1` auf dem Hilfskonto `2202`, wenn in der Debitorenbuchhaltung keine Zahlung erfasst wird, und welche Korrektur macht der Treuhänder am Periodenende?
16. Journalsumme: Zeigt das Journal des Imports im Soll und im Haben je die Summe der Bruttobeträge der Einzelbuchungen (Zeile `Journal total` im Protokoll, `journalTotalCents` im Manifest), oder zählt Abacus die MWST-Buchungen mit, die es selbst dazu bucht? Eine Antwort ändert nur den Text dieser Zeile und der Dokumentation, nicht die Datei.

## Quellen

Geprüft am 2026-10-21; die Recherche dazu steht in [a-target.md](../openspec/research/a-target.md). Wo downloads.abacus.ch offline war, haben wir die Kopie im Internet Archive gelesen.

- Abacus, AbaConnect-Dokumentation «Schnittstelle FIBU - XML Buchungen», Versionen 2024.00 (DE/EN), 2022.00 und 2015.00 (EN), und «FIBU - ASCII Buchungen» 2014.00: https://downloads.abacus.ch/fileadmin/ablage/abaconnect/htmlfiles/fibu/FIBU__XML%20Buchungen_2024.00_AbaDefault_DE.html (Archiv vom 2024-07-19: https://web.archive.org/web/20240719061901/https://downloads.abacus.ch/fileadmin/ablage/abaconnect/htmlfiles/fibu/FIBU__XML%20Buchungen_2024.00_AbaDefault_DE.html), https://downloads.abacus.ch/fileadmin/ablage/abaconnect/htmlfiles/fibu/FIBU__XML%20Buchungen_2015.00_AbaDefault_EN.html, https://downloads.abacus.ch/fileadmin/ablage/abaconnect/htmlfiles/fibu/FIBU__ASCII%20Buchungen_2014.00_AbaDefault_EN.html
- Abacus Research AG, «XML-AbaConnect Fibu Buchungsschnittstelle (Version 2020)», V1.0, 02.07.2020 (MWST berechnen, TaxType, Tabellen zu TaxAccount, Sammelbuchung): https://downloads.abacus.ch/fileadmin/ablage/abaconnect/htmlfiles/fibu/Buchungsschnittstellendokumentation.pdf (Archiv vom 2023-03-20)
- Abacus, MWST-Codes des KMU-Mustermandanten, AbaConnect `DF/MwstCodes`: https://downloads.abacus.ch/fileadmin/ablage/dokumente/06_weitere_applikationsdokumente/finanzen/schweizer_kontenrahmen_kmu_mwstcodes.xml (Archiv vom 2023-06-02)
- Abacus, AbaWeb Profilübersicht 2019 (Buchungsschnittstellen in den FIBU-Profilen 2 und 3): https://media.abacus.ch/abasky/terms/pl2019_abaweb_profiluebersicht_de.pdf
- bexio Hilfe, «Buchungen - Belege in Abacus importieren» (F11, F5534, F625, MWST berechnen): https://help.bexio.com/s/article/000002512?language=de
- contofox, «Der Importablauf in Abacus»: https://contofox.com/kb/der-importablauf-in-abacus/
- MWSTG SR 641.20, Art. 24, 25, 39 und 40: https://www.fedlex.admin.ch/eli/cc/2009/615/de
- ESTV, MWST-Branchen-Info 08 Hotel- und Gastgewerbe: https://www.gate.estv.admin.ch/mwst-webpublikationen/public/pages/sectorInfos/cipherDisplay.xhtml?publicationId=1014334&componentId=1015974&lang=de
- Zum Vergleich gelesen, nicht kopiert: libracore/erpnextswiss (AGPL-3.0), https://github.com/libracore/erpnextswiss, und phamos-eu/Swiss-Accounting-Integration (GPL-3.0), https://github.com/phamos-eu/Swiss-Accounting-Integration
