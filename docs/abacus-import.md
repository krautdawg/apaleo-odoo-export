# Import in Abacus

Für deinen Treuhänder oder deine Buchhaltung: So kommt die Datei in die Abacus Finanzbuchhaltung (FIBU), und darauf solltest du beim ersten Import achten. Keine Gewähr, keine Steuerberatung, lass deine Kontenzuordnung von deinem Treuhänder prüfen. Was in der Datei steht und warum, beschreibt [abacus-format.md](abacus-format.md).

Die Datei folgt der dokumentierten AbaConnect-Schnittstelle «XML Buchungen»; ein erster Testimport mit einem Treuhänder steht noch aus. Mach den ersten Import deshalb in einem Testmandanten, prüf die Buchungen im Nebenjournal, bevor sie übernommen werden, und schick uns das Ergebnis (siehe [unten](#erster-testimport-offene-fragen)).

## Was du bekommst

Pro Hotel und Zeitraum eine Datei `ABACUS_Buchungen_<von>-<bis>_<Hotel>.xml` (AbaConnect «XML Buchungen», Applikation FIBU, Mapping `AbaDefault`, UTF-8), daneben ein Protokoll `….protokoll.txt` mit den Summen pro Konto und MWST-Code und eine `manifest.json` mit Prüfsummen. Eine Beispieldatei mit Protokoll und Kontenzuordnung liegt in [examples/](examples/).

Jede apaleo-Zeile wird eine Einzelbuchung mit Bruttobetrag. Das MWST-pflichtige Konto (Erlös, Anzahlung, Debitorenverlust) steht in der `SingleInformation` und trägt die MWST aus apaleo mit ihrem MWST-Code in `TaxData`. Abacus bucht die MWST auf das Steuerkonto des Codes.

## Lizenz und Programm

Der Mandant braucht die Abacus Finanzbuchhaltung mit der Programmgruppe **Buchungsschnittstellen**. In der AbaWeb-Profilübersicht 2019 enthalten die FIBU-Profile 2 und 3 diese Programme, das Profil 1 nicht. Eine Partnerschaft mit Abacus oder einen API-Zugang braucht es nicht. Welche Lizenz genau nötig ist, klärt der erste Testimport; im Zweifel fragt dein Treuhänder seinen Abacus-Betreuer.

Abacus liest die Datei in diesen Programmen:

- **F11 Buchen**: Datei in das Buchungsfenster ziehen, die Importmaske öffnet sich, «Start».
- **F5534 «Import/Export Buchungen AbaConnect»** (Hilfsprogramme, Buchungsschnittstellen): auf «Import» wechseln, Importart **«XML Buchungen»** wählen, Datei wählen. Hier kannst du eine Zeitachse wählen und die Buchungen prüfen, bevor sie in das Geschäftsjahr übernommen werden.
- **F625 AbaConnect**: «Import XML» mit der Schnittstelle «XML Buchungen».

Die Schnittstellenversion steht in der Datei (`abacus.version`, Standard `2015.00`). Warnt Abacus wegen der Version, stell `abacus.version` auf `2024.00` und exportiere den Zeitraum mit `export --month <JJJJ-MM> --overwrite` neu; die neue Version ändert die Datei, ohne `--overwrite` lehnt das Tool sie mit `E-FILE-EXISTS` ab, und `schedule` überspringt einen Zeitraum, der schon im Manifest steht. Hat Abacus schon Buchungen aus der alten Datei übernommen, entfernt dein Treuhänder sie zuerst (siehe [Rückgängig machen](#rückgängig-machen)).

## Mandant und Geschäftsbereich

Die Datei nennt den Mandanten in `Parameter/Mandant` und in jeder Buchung (`abacus.mandant`). Mit der Importeinstellung «nur Buchungen mit gleicher Mandantennummer» lehnt Abacus eine Datei im falschen Mandanten ab; lass sie eingeschaltet.

Bucht dein Treuhänder mehrere Hotels in einen gemeinsamen Mandanten, bekommt jedes Hotel einen eigenen Geschäftsbereich (`properties[].geschaeftsbereich`) oder einen eigenen Mandanten (`properties[].mandant`). Sonst können sich die Belegnummern zweier Hotels wiederholen; `apaleo-abacus doctor` und das Protokoll warnen dann mit `W-MANDANT-SHARED`.

```yaml
abacus:
  mandant: 1234
properties:
  - id: BSP
    geschaeftsbereich: 1
  - id: BSP2
    geschaeftsbereich: 2
```

## Buchungen importieren

1. Kopiere die Datei unverändert in einen Ordner, den Abacus lesen kann.
2. Öffne den richtigen Mandanten und eines der Programme oben, für den ersten Import F5534.
3. Vergleiche vor dem Import den Block **Import into Abacus FIBU** im Protokoll mit dem Mandanten: Programm, Schnittstellenversion, Mandant, Geschäftsbereich, Leitwährung, Abrechnungsart, MWST-Codes mit Sätzen, die Paare «Konto -> MWST-Code», `TaxAccount` und den Bereich der Belegnummern.
4. Schalte im Register Gestaltung **«MWST berechnen»** ein (siehe nächster Abschnitt) und importiere.
5. Prüf das Importprotokoll von Abacus: keine abgelehnte Buchung, die Anzahl der Buchungen entspricht der Zeile `Bookings` im Protokoll des Tools.
6. Vergleiche die Buchungen im Nebenjournal mit dem Protokoll und mit den Berichten in apaleo (Checkliste unten). Erst dann übernimmt dein Treuhänder sie in das Journal.

Jede Buchung trägt als `EntryDate` den Geschäftstag aus apaleo. Das Geschäftsjahr dieses Datums muss im Mandanten eröffnet sein. Ein Monat ist erst nach dem Tagesabschluss (Night Audit) des Folgetags vollständig; `schedule --once` wartet deshalb bis `schedule.finalAfter` am zweiten Tag nach dem Monatsende.

## MWST berechnen und der MWST-Code eines Kontos in F21

Ohne besondere Einstellung prüft Abacus beim Import die MWST jeder Buchung und lehnt fehlerhafte ab. Mit der Option **«MWST berechnen»** (Register Gestaltung in F5534 oder F625) berechnet Abacus fehlende oder fehlerhafte MWST selbst. Abacus empfiehlt die Option, das Protokoll des Tools auch.

Achtung: Mit «MWST berechnen» kann Abacus den Standard-MWST-Code nehmen, der dem Konto im Kontenplan (F21) hinterlegt ist, statt des MWST-Codes aus der Datei. Deshalb muss jedes Konto, das in der Datei einen MWST-Code trägt, in F21 MWST-pflichtig sein und denselben Standard-MWST-Code haben wie im Protokoll, und ein Konto ohne MWST-Code darf in F21 keinen Standard-MWST-Code haben. Sonst stimmt die MWST-Abrechnung nicht, ohne dass der Import einen Fehler meldet. Mit «MWST berechnen» kann eine einzelne Buchung um einen Rappen anders gerundet sein als in apaleo; vergleiche die Summen pro MWST-Code mit der Zeile `MWST-Codes` im Block «Import into Abacus FIBU».

## Nebenjournal

Abacus legt importierte Buchungen standardmässig in einem Nebenjournal ab. Dort sieht dein Treuhänder sie durch, korrigiert sie bei Bedarf oder löscht sie, und erst danach übernimmt er sie in das Hauptjournal. Für den ersten Import ist das der sichere Weg.

## Rückgängig machen

Abacus erkennt eine schon importierte Datei nicht: Ein zweiter Import bucht dieselben Buchungen doppelt. Das Tool schreibt einen Zeitraum nur einmal. Kommt später eine Nachbuchung, lehnt es den Zeitraum mit `E-FILE-EXISTS` ab. Dann löscht dein Treuhänder zuerst die Buchungen der alten Datei in Abacus: im Nebenjournal, solange sie nicht übernommen sind, sonst storniert er sie. Die Belegnummern der alten Datei stehen in ihrem Protokoll. Erst danach schreibt `export --overwrite` die neue Datei.

```sh
apaleo-abacus export --month 2026-10 --dry-run      # was hat sich geändert?
apaleo-abacus export --month 2026-10 --overwrite    # erst wenn die Buchungen der alten Datei in Abacus entfernt sind
```

Mehr dazu in [export.md](export.md#noch-einmal-exportieren).

## Vier Regeln

- **Nie in Excel oder einem anderen Programm öffnen und speichern.** Schon ein Speichern kann Zeichensatz und Zeilenenden ändern. Zum Ansehen nimm einen Texteditor oder das Protokoll.
- **Nie eine Demodatei importieren.** `export --demo` schreibt erfundene Daten: Der Dateiname endet auf `_DEMO`, jeder Buchungstext beginnt mit `DEMO ` und das Protokoll mit der Zeile `DEMO`. Ist doch eine Demobuchung im Mandanten gelandet, findest du sie am Buchungstext.
- **Nie umbenennen.** Der Name zeigt Zeitraum und Hotel, und das Tool erkennt seine eigenen Dateien daran.
- **Nie zweimal importieren.** Siehe [Rückgängig machen](#rückgängig-machen).

## Erster Import: bitte prüfen

Mach den ersten Import mit deinem Treuhänder in einem Testmandanten, oder lass die Buchungen im Nebenjournal und lösche sie danach wieder. Vergleiche das Ergebnis mit dem Protokoll des Tools:

- [ ] Abacus liest die Datei ohne Formatfehler, und das Importprotokoll lehnt keine Buchung ab.
- [ ] Mandant, Geschäftsbereich und Leitwährung stimmen; bei mehreren Hotels in einem gemeinsamen Mandanten hat jedes Hotel seinen eigenen Geschäftsbereich.
- [ ] Die Saldenliste des Monats zeigt pro Konto dieselben Summen wie «Totals per Abacus account» im Protokoll.
- [ ] Das Journal des Imports zeigt im Soll und im Haben der importierten Einzelbuchungen je dieselbe Summe wie die Zeile `Journal total` im Block «Import into Abacus FIBU» des Protokolls (im Schweizer Testmonat `2144.42 CHF`, im Manifest `journalTotalCents` `214442`), ohne die MWST-Buchungen, die Abacus selbst dazu bucht. Ob Abacus die Summe so ausweist, ist noch offen (siehe [unten](#erster-testimport-offene-fragen)).
- [ ] Das MWST-Journal zeigt pro MWST-Code dieselbe MWST wie die Zeile `MWST-Codes` im Block «Import into Abacus FIBU» des Protokolls, im Schweizer Testmonat zum Beispiel `313 (3.8 %; tax -20.14 CHF)`. Das Protokoll zeigt die MWST mit dem Vorzeichen der Datei (`TaxData`: negativ, wenn das Hotel sie schuldet); das Manifest (`taxByMwstCode`) zeigt dieselbe MWST als geschuldete MWST mit umgekehrtem Vorzeichen (im Testmonat `313` mit `taxCents` `2014`). Diese Summe pro Code enthält Erlöse, Anzahlungen, Debitorenverluste und besteuerte Abgaben zusammen, denn sie teilen sich den Code; «Revenue and MWST per MWST-Code and rate» zeigt nur den Teil der Erlöse (im Testmonat `313` mit MWST 24.53) und passt deshalb nicht zum MWST-Journal. In der MWST-Abrechnung landen die Umsätze in der richtigen Ziffer: Normalsatz 8,1 % in Ziffer 303, reduzierter Satz 2,6 % in Ziffer 313, Beherbergung 3,8 % in Ziffer 343 (im KMU-Mustermandanten die Codes `311`, `312` und `313`).
- [ ] Jedes Paar «Konto -> MWST-Code» im Block «Import into Abacus FIBU» stimmt mit dem Standard-MWST-Code dieses Kontos in F21 überein, zum Beispiel `3400 -> 313`, `2030 -> 313`, `2031 -> 311` und `3805 -> 313`, und jedes dieser Konten ist in F21 MWST-pflichtig.
- [ ] Anzahlungen erscheinen mit ihrer MWST im Monat, in dem sie eingehen (Vorauszahlungen, MWSTG Art. 40 Abs. 1 Bst. c), und ihre Auflösung und Rückzahlung buchen die MWST wieder zurück. Vergleiche sie pro Konto: Soll, Haben und Saldo des Anzahlungskontos (Beispiel `2030`) in der Saldenliste entsprechen seiner Zeile in «Totals per Abacus account». Im MWST-Journal lassen sie sich nicht getrennt ablesen, weil sie den MWST-Code der Erlöse tragen (Beispiel `313`).
- [ ] Der Debitorenverlust erscheint als Entgeltsminderung, die die geschuldete MWST mindert, nicht als Vorsteuer. Vergleiche ihn pro Konto: Das Verlustkonto (Beispiel `3805`) zeigt in der Saldenliste dieselben Summen wie seine Zeile in «Totals per Abacus account»; seine MWST ist in der Summe seines MWST-Codes enthalten.
- [ ] Das Konto der Kurtaxe (Beispiel `2210`) und die Konten ohne MWST (zum Beispiel `3600`, `3680`, `2039` und `3808`) haben in F21 keinen Standard-MWST-Code. Eine Kurtaxe mit MWST-Code trägt einen Code für Ziffer 910, nie den Code `490` (Ziffer 900). Vergleiche die Abgaben pro Konto mit «Kurtaxe and other guest levies» im Protokoll (im Testmonat `2210 without MWST: 12.60`).
- [ ] Rechnet der Mandant nach vereinnahmten Entgelten ab (`abacus.abrechnungsart: vereinnahmt`, Warnung `W-ABRECHNUNGSART-VEREINNAHMT`): Der Saldo des Hilfskontos `2202` am Periodenende ist geprüft; der bezahlte Teil ist auf `2200` umgebucht, und für die offenen Debitoren ist die Debitorenkorrektur gemacht ([mapping-guide.md](mapping-guide.md#vereinnahmte-entgelte)).
- [ ] Eine Zahlung landet auf dem Transferkonto ohne MWST, eine Rechnung an eine Firma auf den Debitoren als Sachkonto.
- [ ] Abacus meldet keine doppelten Belegnummern, auch nicht mit einer zweiten Datei eines anderen Monats.
- [ ] Umlaute und das Eurozeichen sind im Buchungstext lesbar.

## Erster Testimport: offene Fragen

Diese Fragen kann nur ein echter Import beantworten. Jede Antwort ist eine Einstellung an einer Stelle (eine Konstante in `src/abacus/format.ts` oder ein Schlüssel der Konfiguration); die Einzelheiten stehen in [abacus-format.md](abacus-format.md#offene-fragen).

- [ ] **Lizenz und Programm**: Mit welchem Programm (F11, F5534 oder F625) und welcher Lizenz hat der Import geklappt? Braucht der Mandant mehr als die Buchungsschnittstellen der FIBU?
- [ ] **Schnittstellenversion**: Nimmt Abacus `2015.00` ohne Warnung an, oder braucht es `2024.00` (`abacus.version`)?
- [ ] **`TaxType`**: Nimmt Abacus `0` an, oder erwartet es `1`?
- [ ] **Vorzeichen der MWST**: Stimmt die MWST in `TaxData` negativ im Haben und positiv im Soll, oder erwartet Abacus ein anderes Vorzeichen?
- [ ] **Betrag `0.00`**: Nimmt Abacus in `TaxData` den Betrag `0.00` mit der MWST nur in `KeyAmount` an (Konstante `TAX_AMOUNT_IN_KEY_CURRENCY`)?
- [ ] **`TaxAccount`**: Nimmt Abacus das Steuerkonto (`abacus.mwstKonto`) in der `CollectiveInformation` und das Konto selbst in der `SingleInformation` an (Konstante `SINGLE_TAX_ACCOUNT`), und bei MWST-Codes mit Satz 0 das Steuerkonto statt `0` (Konstante `TAX_ACCOUNT_AT_RATE_ZERO`)?
- [ ] **`TaxIncluded` bei Satz 0**: Nimmt Abacus `I` bei Codes mit Satz 0 an (Konstante `TAX_INCLUDED_AT_RATE_ZERO`), auch ohne «MWST berechnen»?
- [ ] **MWST berechnen**: Behält Abacus mit der Option den MWST-Code der Datei, oder nimmt es den Standard-MWST-Code des Kontos in F21?
- [ ] **Rundung der MWST**: Nimmt Abacus ohne «MWST berechnen» die MWST aus apaleo an, wenn sie um einen Rappen von `Brutto × Satz / (100 + Satz)` abweicht (Warnung `W-VAT-ROUNDING`), oder lehnt es die Buchung ab? Stimmt mit der Option das MWST-Journal pro MWST-Code mit der Zeile `MWST-Codes` im Protokoll überein?
- [ ] **Journalsumme**: Zeigt das Journal des Imports im Soll und im Haben je die Summe der Bruttobeträge (Zeile `Journal total` im Protokoll, `journalTotalCents` im Manifest), ohne die MWST-Buchungen, die Abacus dazu bucht? Oder zählt Abacus die MWST-Buchungen mit?
- [ ] **Belegnummern**: Nimmt Abacus die zehnstelligen Belegnummern an, und warnt es bei Doppelten über mehrere Dateien? Prüft es Doppelte pro Geschäftsjahr? Die Nummer hat kein Jahr: Die Dateien ab 2026-10-01 und ab 2027-10-01 beginnen beide mit `1001000001`.
- [ ] **Nebenjournal**: Landen die importierten Buchungen im Nebenjournal, und kann dein Treuhänder sie dort vor der Übernahme löschen?
- [ ] **Anzahlungen**: Will dein Treuhänder die Anzahlungen auf `2030` und folgende mit dem normalen MWST-Code des Satzes (Standard der Vorlage, zum Beispiel `313`), oder führt der Mandant einen eigenen MWST-Code für Vorauszahlungen?
- [ ] **Vereinnahmt**: Wie behandelt Abacus mit `abacus.abrechnungsart` `vereinnahmt` die Buchungen auf dem Hilfskonto (`abacus.mwstHilfskonto`, Standard `2202`), wenn keine Zahlung in der Debitorenbuchhaltung erfasst ist, und welche Korrektur macht dein Treuhänder am Periodenende?

Schick uns das Ergebnis gern als Issue (Abacus-Version, Programm, Schnittstellenversion, was ging und was nicht, ohne Namen und Beträge); der Maintainer trägt es unter [Testimporte](maintainers.md#testimporte) ein.
