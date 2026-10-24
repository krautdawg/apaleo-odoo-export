# Kontenzuordnung (Mapping): Leitfaden für Hotel und Treuhänder

Die Abacus-Datei ist nur so gut wie die Kontenzuordnung. Sie ist eine CSV-Datei pro Hotel (Property), die du in Excel öffnest und mit deinem Treuhänder durchgehst. Sie ordnet jedem apaleo-Konto ein Abacus-Sachkonto zu, dazu den MWST-Code und den MWST-Satz. **Keine Gewähr, keine Steuerberatung: Jede Zeile der Vorlage ist ein Vorschlag (ungeprüft), den dein Treuhänder bestätigt.**

`init-mapping --template kmu-hotel` schreibt die Datei nach der Vorlage `templates/kmu-hotel.rules.csv` (Schweizer Kontenrahmen KMU und Kontenrahmen für die Hotellerie und Gastronomie). Der Kommentar jeder Zeile sagt, warum sie so vorgeschlagen ist. Die Kontonummern sind Vorschläge: Viele Mandanten haben einen eigenen Kontenplan, und die Kontonummern wählt dein Treuhänder.

Ein vollständiges Beispiel liegt in [examples/mapping-BSP.example.csv](examples/mapping-BSP.example.csv): die Zuordnung des erfundenen Schweizer «Hotel Beispiel», aus der die Beispieldatei in [examples/](examples/) entstanden ist: genau das, was `init-mapping --template kmu-hotel` auf dem Kontenplan der Demo schreibt, mit den MWST-Codes `311`, `312` und `313`, nur die Kurtaxe-Zeile ist ausgefüllt (`2210` ohne MWST-Code). Dein Treuhänder kann damit die Ausgabe beurteilen, bevor jemand eine apaleo-App anlegt.

## Ablauf

```sh
apaleo-abacus init-mapping --property BSP --template kmu-hotel      # schreibt mapping-BSP.csv aus dem apaleo-Kontenplan
# Datei mit dem Treuhänder prüfen, leere Abacus-Konten ausfüllen
apaleo-abacus mapping check --property BSP                    # prüft die Datei
apaleo-abacus mapping check --property BSP --from 2026-09-01 --to 2026-09-30   # ist jedes gebuchte Konto zugeordnet?
apaleo-abacus init-mapping --property BSP --template kmu-hotel --update   # später: neue apaleo-Konten anhängen, bearbeitete Zeilen bleiben
apaleo-abacus init-mapping --property BSP --template kmu-hotel --accounts-from konten.csv   # Konten aus dem Kontenexport eines kostenpflichtigen Connectors übernehmen
```

Der Pfad der Datei kann in der Konfiguration stehen (`properties[].mapping`), sonst heisst sie `mapping-<id>.csv` im Arbeitsverzeichnis. `mapping check --from --to` liest das Buchungsjournal des Zeitraums aus apaleo und meldet jedes gebuchte Konto ohne Zuordnung; dein Treuhänder kann die Datei also an einem echten Monat prüfen, bevor ein Export läuft. Die Vorlage schreibt die MWST-Codes aus `abacus.mwstCodes` der Konfiguration (Standard `311`, `312` und `313` wie im KMU-Mustermandanten von Abacus).

## Spalten

| Spalte | Bedeutung |
|---|---|
| `apaleo_account` | apaleo-Kontonummer, oder `*` für alle Konten eines Typs |
| `apaleo_type` | apaleo-Kontotyp (Revenues, Payments, Liabilities, Receivables, AccountsReceivable, CityTaxes, …) |
| `apaleo_name`, `apaleo_vat_percent` | zur Information, aus apaleo; bei `*`-Zeilen ist `apaleo_vat_percent` der MWST-Satz, für den die Zeile gilt |
| `abacus_account` | Sachkonto in Abacus, 1 bis 11 Ziffern. Leer heisst: nicht zugeordnet, der Export bricht mit `E-UNMAPPED` ab |
| `mwst_code` | MWST-Code aus der MWST-Tabelle des Mandanten, 1 bis 3 Zeichen, zum Beispiel `313`. Leer heisst: keine MWST auf dieser Zeile |
| `mwst_percent` | MWST-Satz, den Abacus mit dem MWST-Code bucht, zum Beispiel `3.8`, `8.1` oder `2.6`. Mit MWST-Code Pflicht (auch `0`), ohne MWST-Code leer oder `0` |
| `kost` | Kostenstelle, 1 bis 11 Ziffern (optional). Steht nur auf Erlös- und Debitorenverlust-Buchungen in der Datei, siehe unten |
| `comment` | Freitext, zum Beispiel die Begründung deines Treuhänders |

Sätze darfst du mit Komma oder Punkt schreiben (`8,1` oder `8.1`). Eine Zuordnung von apaleo-bmd-export (Spalten `bmd_account`, `steuercode`) oder aus einer deutschen Einrichtung (Spalten `datev_account`, `bu_key`) liest das Tool nicht; es nennt dann `init-mapping --template kmu-hotel` ([troubleshooting.md](troubleshooting.md#einrichtung-aus-deutschland-oder-österreich-übernommen)). Den Kontenexport eines kostenpflichtigen Connectors (Spalten `Apaleo Kontonummer`, `Kontoname`, `Kontotyp`, `Abacus Kontonummer`, `Kostenstelle`) liest es nur mit `init-mapping --accounts-from`, siehe [Umstieg von einem anderen Connector](#umstieg-von-einem-anderen-connector).

### Kontonummern und MWST-Codes

Ein Abacus-Konto hat 1 bis 11 Ziffern (`E-ACCOUNT-FORMAT`); das Tool füllt nie Nullen auf und prüft nur die Form, nicht, ob das Konto im Mandanten existiert. Der MWST-Code bleibt Text: `011` und `11` sind verschiedene Codes. Formatiere die Spalten `abacus_account` und `mwst_code` in Excel als Text, damit Excel keine führende Null entfernt.

## Welche Zeile gilt?

Für jedes gebuchte apaleo-Konto sucht das Tool in dieser Reihenfolge:

1. genau diese Nummer und dieser Typ;
2. diese Nummer mit beliebigem Typ (Zeilen mit dem Typ `*any*`);
3. das Elternkonto (und dessen Eltern) mit gleichem Typ; eine Elternzeile ohne Abacus-Konto überspringt es;
4. für Typen mit MWST eine `*`-Zeile mit dem MWST-Satz der Buchung;
5. für andere Typen eine `*`-Zeile des Typs.

Erlöskonten (Revenues) werden nie per `*` zugeordnet: Ein neues Erlöskonto (Spa, Parking) ordnet ein Mensch zu. Konten je Reservation (Anzahlungen unter `3000`, Debitoren unter `9999`, Debitorenverluste unter `6900`, ihre `/Offset`-Konten) erreichen die `*`-Zeilen.

## MWST-Code und MWST-Satz

Abacus bekommt den Bruttobetrag und die MWST aus apaleo: Das Konto mit MWST-Code steht in `SingleInformation`, weil nur dort `TaxData` steht, und die MWST kommt genau so, wie apaleo sie für die Buchung berechnet hat. Die MWST-Codes legt der Mandant in seiner MWST-Tabelle fest; das Tool kennt die drei Codes aus `abacus.mwstCodes`:

| Satz | Wofür (MWSTG Art. 25) | Code im KMU-Mustermandanten | Ziffer der MWST-Abrechnung |
|---|---|---|---|
| 8,1 % | Normalsatz: Speisen und Getränke im Restaurant, Minibar, Parking, Wellness, Telefon | `311` | 303 |
| 2,6 % | reduzierter Satz: Take-away ohne Alkohol, Zeitungen | `312` | 313 |
| 3,8 % | Sondersatz für Beherbergung, mit dem Frühstück, auch wenn es separat verrechnet wird (Art. 25 Abs. 4) | `313` | 343 |
| 0 % | Erlöse ohne MWST, Annullationen, durchlaufende Posten | kein Code, oder ein Code des Mandanten mit Satz 0 | |

Das Tool bucht den Satz, den apaleo auf der Buchung hat; die Liste hilft dir und deinem Treuhänder, die Erlöskonten in apaleo richtig einzurichten (ESTV MWST-Branchen-Info 08 Hotel- und Gastgewerbe, Ziff. 6). Der Sondersatz gilt nach heutigem Gesetz bis Ende 2027. Welcher Satz gilt, hängt vom Datum der Leistung ab, nicht vom Datum der Rechnung oder des Exports: Bis 2023-12-31 galten 7,7 %, 3,7 % und 2,5 %: Die Vorlage lässt diese Konten leer, damit eine Buchung darauf den Export stoppt (`E-UNMAPPED`). Exporte für 2023 und früher klärst du mit deinem Treuhänder.

`mapping check` prüft jede Zeile:

- Ein MWST-Code hat 1 bis 3 Zeichen `A-Z`, `a-z` und `0-9` (`E-MWST-CODE-FORMAT`).
- Zahlungen (Payments), Gästeforderungen (Receivables) und Debitoren (AccountsReceivable) haben nie einen MWST-Code (`E-MWST-CODE-NOT-ALLOWED`): Sonst bucht Abacus die MWST auf das Geld- oder Forderungskonto.
- Ein MWST-Code braucht einen Satz (`E-VAT-RATE-MISSING`), ein Satz über 0 % einen MWST-Code (`E-MWST-CODE-MISSING`). Ein MWST-Code mit 0 % ist erlaubt.
- Ein MWST-Code, der nicht in `abacus.mwstCodes` steht, ergibt `W-MWST-CODE-UNCHECKED`: Lass deinen Treuhänder bestätigen, dass er ein Umsatzsteuer-Code des Mandanten ist. Ist er einer der Codes des KMU-Mustermandanten, nennt die Warnung seine Ziffer der MWST-Abrechnung (`400` Ziffer 230, `490` Ziffer 900, `491` Ziffer 910).
- Ein Code aus `abacus.mwstCodes` mit einem anderen Satz als seinem eigenen ergibt `W-MWST-CODE-RATE` (zum Beispiel vertauschte Codes).
- `export` und `schedule --once` melden `W-MWST-CODE-UNCHECKED` und `W-MWST-CODE-RATE` ebenfalls, aber nur für die Zeilen, die die Buchungen des Monats tatsächlich brauchen: im Probelauf, in der Ausgabe und im Protokoll. Die Datei wird trotzdem geschrieben. So fällt ein vertauschter Code auch dann auf, wenn niemand `mapping check` startet.
- Ein Satz ausser 0 %, 2,6 %, 3,8 % und 8,1 % ergibt `W-VAT-RATE-UNUSUAL`; bei 7,7 %, 3,7 % und 2,5 % sagt die Warnung, dass sie bis 2023 galten.
- Der Satz der Zeile muss dem Satz in apaleo entsprechen (`E-VAT-MISMATCH`), auch über eine Elternzeile: Landet ein Konto mit 3,8 % über `5000;Revenues;…;3500;311;8.1` auf 3500 mit 8,1 %, meldet `mapping check --from --to` `E-VAT-MISMATCH` und verlangt eine eigene Zeile.
- Eine Erlöszeile ohne MWST-Code ergibt `W-UNTAXED-REVENUE`: Mit «MWST berechnen» setzt Abacus den Standard-MWST-Code des Kontos ein. Prüfe, dass das Abacus-Konto keinen hat, oder trag den MWST-Code des Mandanten für Umsätze ohne MWST ein.
- Eine Kurtaxe mit MWST ergibt `W-KURTAXE-TAXED`, eine Annullation oder ein No-Show mit MWST `W-ANNULLATION-TAXED` (siehe unten).

Beim Export prüft das Tool zusätzlich jede Buchung: Der Satz muss der Satz der apaleo-Buchung sein (`E-VAT-RATE`), und die MWST, die im Bruttobetrag steckt, darf höchstens einen Rappen von der Steuer abweichen (`W-VAT-ROUNDING`, die Buchung behält die Steuer aus apaleo). Auf 5 Rappen rundet das Tool nie: Das ist eine Praxis der Kasse, nicht der Buchhaltung. Mehr dazu in [posting-rules.md](posting-rules.md).

Die Saldosteuersatz- und die Pauschalsteuersatzmethode unterstützt diese Version nicht: Das Tool bucht die MWST, die apaleo pro Zeile berechnet, also die effektive Methode.

## Die KMU-Vorlage

Die Vorlage folgt dem Schweizer Kontenrahmen KMU und dem Kontenrahmen für die Hotellerie und Gastronomie. Jede Zeile trägt im Kommentar die Markierung «Vorschlag (ungeprüft)».

| Fall | Abacus-Konto | MWST-Code | Satz |
|---|---|---|---|
| Beherbergung mit Frühstück | `3400` | `313` | 3,8 % |
| Küche und Speisen im Restaurant | `3200` | `311` | 8,1 % |
| Getränke (nur mit eigenem apaleo-Konto) | `3100` | `311` | 8,1 % |
| übrige Hotelleistungen (Minibar, Parking, Wellness) | `3500` | `311` | 8,1 % |
| Take-away und andere Verkäufe zum reduzierten Satz | `3260` | `312` | 2,6 % |
| Erlöse ohne MWST | `3600` | leer | 0 % |
| Annullationen und No-Shows ohne MWST | `3680` | leer | 0 % |
| Annullationen und No-Shows mit MWST | leer, dein Treuhänder entscheidet | | |
| Barzahlung | `1000` Kasse | | |
| Karte, Twint, Überweisung, andere unbare Zahlungen | `1090` Transferkonto | | |
| Gast-, externe und Buchungsfolios | `1101` Gästeforderungen | | |
| Rechnungen an Firmen | `1102` Debitoren apaleo | | |
| Anzahlungen 3,8 % / 8,1 % / 2,6 % | `2030` / `2031` / `2032` | `313` / `311` / `312` | 3,8 / 8,1 / 2,6 % |
| Anzahlungen ohne MWST | `2039` | leer | 0 % |
| Debitorenverlust 3,8 % / 8,1 % / 2,6 % | `3805` / `3806` / `3807` | `313` / `311` / `312` | 3,8 / 8,1 / 2,6 % |
| Debitorenverlust ohne MWST | `3808` | leer | 0 % |
| Kurtaxe, Gästetaxe, Beherbergungsabgabe | leer, du entscheidest mit deinem Treuhänder (Beispiel `2210`) | | |

Für einen Container wie `3000` (Anzahlungen) oder `6900` (Debitorenverluste) schreibt sie keine Zeile, weil die `*`-Zeilen dessen Konten je Reservation abdecken.

### Was dein Treuhänder entscheiden muss

Diese Vorlagenzeilen lassen das Abacus-Konto leer oder verlangen eine Entscheidung:

- **Kurtaxe, Gästetaxe, Beherbergungsabgabe** (CityTaxes, SecondCityTax, GuestLevies): bleiben leer, siehe unten.
- **Annullationen und No-Shows mit MWST** bleiben leer: Ist die MWST von apaleo richtig?
- **Erlöse ohne MWST** auf `3600` und **Annullationen** auf `3680`: Hat das Konto in Abacus einen Standard-MWST-Code, oder braucht es den Code des Mandanten für Umsätze ohne MWST?
- **Anzahlungen**: Konto und MWST-Code der Anzahlungen, und ob der Mandant nach vereinbarten oder vereinnahmten Entgelten abrechnet.
- **Debitorenverlust**: der MWST-Code des Satzes oder ein eigener Korrektur-Code.
- **Erlöse und Anzahlungen zu 7,7 %, 3,7 % und 2,5 %**: bleiben leer, historische Sätze.
- **Hauskonten (House)** und **durchlaufende Posten aus apaleo (TransitoryItems)** haben noch keine Vorlage.
- **Vat, VatOnLiabilities**: brauchen kein Konto; diese Buchungen werden übersprungen.

## Kurtaxe, Gästetaxe und Beherbergungsabgabe

Die Zeilen für CityTaxes, SecondCityTax und GuestLevies bleiben in der Vorlage leer. Das ist Absicht: Wie die Abgabe zu buchen ist, hängt von Tatsachen ab, die das Tool nicht sieht, und die Entscheidung trifft dein Treuhänder (ESTV MBI 08 Ziff. 7.11).

**Die Abgabe schuldet der Gast.** Die Kurtaxe oder Gästetaxe ist eine öffentlich-rechtliche Abgabe des Gastes; das Hotel zieht sie ein und liefert sie der Gemeinde ab. Verrechnest du sie dem Gast separat, in gleicher Höhe und als solche bezeichnet, ist sie nicht zu versteuern: ein durchlaufender Posten. Die ESTV empfiehlt, sie so zu verbuchen und unter Ziffer 910 der MWST-Abrechnung zu deklarieren. Für die Zeile heisst das:

- eine Verbindlichkeit gegenüber der Gemeinde, zum Beispiel `2210` Übrige kurzfristige Verbindlichkeiten, **ohne MWST-Code**; oder
- dasselbe Konto mit einem MWST-Code des Mandanten für Ziffer 910 und Satz 0, im KMU-Mustermandanten `491`.

**Nie der Code `490`.** Im KMU-Mustermandanten heisst `490` «Subvention Kurtaxen» und meldet in Ziffer 900. Er gilt für Subventionen und Tourismusabgaben eines Kurvereins, mit Vorsteuerkürzung, nicht für die Kurtaxe, die das Hotel einzieht. `W-MWST-CODE-UNCHECKED` nennt das, wenn er in der Datei steht.

**Die Abgabe ist Teil der Beherbergung zu 3,8 %**, wenn du die Kurtaxe nicht separat verrechnest, für den Teil, den das Hotel behält (zum Beispiel wenn es der Gemeinde nur eine Pauschale abliefert), und immer für eine kantonale oder kommunale Beherbergungsabgabe, die das Hotel selbst schuldet und nicht der Gast, auch wenn sie separat auf der Rechnung steht. Dann besteuert apaleo die Abgabe mit 3,8 %, und die Zeile gehört auf ein Erlöskonto mit dem MWST-Code für Beherbergung, zum Beispiel `3400` mit `313` und 3,8 %. `mapping check` warnt dann mit `W-KURTAXE-TAXED`, damit dieser Fall bewusst entschieden ist; der Export läuft trotzdem.

Der Name sagt nicht, wer die Abgabe schuldet. Gemeinden und Kantone nennen sie verschieden, zum Beispiel (ohne Gewähr; massgebend ist das Reglement deiner Gemeinde oder das kantonale Gesetz):

| Name | wo man ihn antrifft |
|---|---|
| Kurtaxe | in vielen Gemeinden, zum Beispiel in den Kantonen Bern, Luzern, Obwalden und Wallis |
| Gästetaxe | in vielen Bündner Gemeinden, zum Beispiel Davos und St. Moritz |
| Beherbergungsabgabe, Beherbergungstaxe | in einzelnen Kantonen und Gemeinden zusätzlich zur Kurtaxe |
| City Tax | in einzelnen Städten |
| taxe de séjour, tassa di soggiorno | in der Westschweiz und im Tessin |

Nicht gemeint ist eine Tourismusabgabe, die das Hotel selbst nach Zimmern oder Umsatz schuldet und die nicht auf der Gästerechnung steht: Die bucht apaleo nicht.

Das Abacus-Konto einer Kurtaxe ohne MWST-Code darf in Abacus (F21) keinen Standard-MWST-Code haben: Sonst setzt «MWST berechnen» ihn ein, und die Kurtaxe landet in der MWST-Abrechnung. Bis eine Zeile ausgefüllt ist, blockieren `mapping check --from --to` und der Export mit `E-UNMAPPED`. Hat apaleo eine Abgabe besteuert, ihre Zeile aber keinen MWST-Code, stoppt der Export mit `E-VAT-MISSING`: Das Tool ändert die MWST von apaleo nie.

## Anzahlungen

Anzahlungen der Gäste (Liabilities) gehen auf erhaltene Anzahlungen, je MWST-Satz eine `*`-Zeile: `2030` (3,8 %), `2031` (8,1 %) und `2032` (2,6 %) mit dem MWST-Code des Satzes, `2039` (0 %) ohne. Die MWST einer Anzahlung entsteht, wenn das Geld eingeht, bei vereinbarten wie bei vereinnahmten Entgelten (MWSTG Art. 40 Abs. 1 Bst. c und Abs. 2): Eine Vorauszahlung ist zu versteuern, auch bevor die Leistung erbracht ist. apaleo berechnet diese MWST schon, und das Tool bucht sie mit der Anzahlung. Wird die Anzahlung mit der Rechnung verrechnet, bucht apaleo eine negative Belastung auf dieselbe Anzahlung, und das Tool bucht die MWST dort wieder zurück; eine Rückzahlung an den Gast (eine negative Anzahlung) ebenso. Eine Überzahlung, die apaleo mit 0 % auf der Anzahlung parkt, geht ohne MWST auf `2039`.

Ein Beispiel aus dem Schweizer Testmonat: Der Gast zahlt 311.40 per Twint an (3,8 %, MWST 11.40). Beim Check-out werden 207.60 mit der Rechnung verrechnet (MWST 7.60 zurück), 103.80 gehen per Twint zurück (MWST 3.80 zurück). Auf `2030` bleibt nichts, und die MWST der Anzahlung ist wieder 0; die MWST steckt dann in den Logiernächten auf `3400`.

Bucht dein Treuhänder Anzahlungen aus Gewohnheit ohne MWST, ist das nach Art. 40 Abs. 1 Bst. c falsch, wenn der Mandant nach vereinbarten Entgelten abrechnet. Ob der Mandant einen eigenen MWST-Code für Vorauszahlungen führt, entscheidet er; der Code der Zeile ist frei, das Tool braucht dafür keine Änderung. Das Protokoll zeigt die MWST der Anzahlungen pro MWST-Code zum Vergleich mit dem MWST-Journal.

apaleos eigene MWST-Konten (Vat, VatOnLiabilities) brauchen keine Zuordnung: Diese Buchungen überspringt das Tool, denn Abacus bucht die MWST aus den `TaxData` der Erlös- oder Anzahlungsbuchung. Wird eine Anzahlung verrechnet, ohne dass apaleo dabei einen MWST-Betrag mitschickt, nimmt das Tool Satz und Steuer aus der `PostPrepaymentVat`-Buchung desselben Tages und derselben Reservation, sonst den Satz aus dem Kontenplan (Warnung `W-VAT-INFERRED`), nie 0 %. Lässt sich kein Satz finden, stoppt es mit `E-VAT-RATE-UNKNOWN`.

## Vereinnahmte Entgelte

`abacus.abrechnungsart` sagt, wie der Mandant über die MWST abrechnet: `vereinbart` (Standard, nach vereinbarten Entgelten) oder `vereinnahmt`. In der Datei ändert die Abrechnungsart nur den `UseCode` (`0` oder `1`) und das Steuerkonto der `CollectiveInformation` (`abacus.mwstKonto`, Standard `2200`, oder das Hilfskonto `abacus.mwstHilfskonto`, Standard `2202`). Welche Zeilen gebucht werden, ihre Konten, Beträge und MWST bleiben gleich.

Mit `vereinnahmt` bucht Abacus die MWST auf das Hilfskonto `2202` und überträgt sie erst auf das Steuerkonto `2200`, wenn eine Zahlung erfasst wird, normalerweise in der Debitorenbuchhaltung. Dieses Tool bedient die Debitorenbuchhaltung nicht: Die Erlöse stehen auf den Sachkonten `1101` und `1102`. Ob Abacus die MWST solcher Buchungen auf dem Hilfskonto liegen lässt, zeigt erst ein Testimport. Dazu kommt: Die Datei bucht die MWST am Tag der Leistung, nach vereinnahmten Entgelten entsteht sie aber mit der Zahlung (MWSTG Art. 40 Abs. 2). Das betrifft vor allem Rechnungen an Firmen, die am Periodenende noch offen sind. Deshalb melden `doctor` und jeder Export (auch der Probelauf, einmal pro Hotel und Monat in der Ausgabe und im Protokoll dieses Monats) `W-ABRECHNUNGSART-VEREINNAHMT`; der Export läuft trotzdem.

Die Korrektur am Periodenende, die dein Treuhänder vor der MWST-Abrechnung macht:

1. Den Saldo des Hilfskontos `2202` mit dem Protokoll vergleichen: Er ist die MWST der Buchungen des Zeitraums, die Abacus noch nicht abgerechnet hat.
2. **Umbuchung** des bezahlten Teils von `2202` auf `2200`: alles, was bar, per Karte, Twint oder Anzahlung bezahlt ist (im Protokoll die Zahlungen pro Transferkonto und die Anzahlungen).
3. **Debitorenkorrektur** für das, was am Periodenende noch offen ist: Die MWST der offenen Debitoren `1102` (und offener Gästeforderungen `1101`) bleibt auf `2202`, bis die Zahlung eingeht, und wird dann umgebucht.

Rechnet der Mandant nach vereinbarten Entgelten ab, ist nichts zu tun: Lass `abacus.abrechnungsart` weg.

## Halbpension und Vollpension

Wie ein Arrangement aufgeteilt wird, entscheidest du in apaleo, nicht in diesem Tool: apaleo bucht die Teile eines Pakets mit ihrem eigenen Satz, und das Tool prüft jede Zeile gegen ihre Zeile in der Kontenzuordnung. Die ESTV lässt für Leistungskombinationen zwei Vereinfachungen zu (ESTV MBI 08 Ziff. 6.4, ohne Gewähr):

- **Halbpension**: Macht die Beherbergung wertmässig mindestens 70 % des Preises aus, darfst du das ganze Arrangement zum Sondersatz von 3,8 % verrechnen. Dann bucht apaleo es auf ein Beherbergungskonto mit 3,8 %, und es geht auf `3400` mit `313`.
- **Vollpension**: pauschal 65 % zum Sondersatz von 3,8 % und 35 % zum Normalsatz von 8,1 %. Dann bucht apaleo zwei Zeilen, und sie gehen auf `3400` mit `313` und `3200` mit `311`.

Sonst rechnet das Hotel die Anteile effektiv. Welche Aufteilung gilt, bestätigt dein Treuhänder.

## Annullationen und No-Shows

Zahlungen für Annullationen und No-Shows sind Schadenersatz und kein Entgelt, also ohne MWST, ausser die Leistung wurde schon ohne Korrekturbeleg in Rechnung gestellt (ESTV MBI 08 Ziff. 8.7). Das entscheidet nicht dieses Tool: Es bucht die MWST, die apaleo auf der Buchung hat, und prüft nur, ob die Zeile dazu passt.

- **Ohne MWST** (apaleos Konten `RevenueCancellationFees…` und `RevenueNoShow…` mit 0 %, oder ein Erlöskonto, dessen Name Annullation, Storno, Cancel oder No-Show enthält): Die Vorlage schlägt `3680` ohne MWST-Code vor. Wie bei `3600` gilt `W-UNTAXED-REVENUE`, bis dein Treuhänder bestätigt, dass das Konto in Abacus keinen Standard-MWST-Code hat, oder den Code des Mandanten für Umsätze ohne MWST einträgt.
- **Mit MWST** (zum Beispiel apaleos `RevenueNoShow_Special:3.80`): Die Vorlage lässt die Zeile leer. Ist die MWST richtig, trägst du ein Erlöskonto mit dem MWST-Code und dem Satz von apaleo ein, und `mapping check` warnt mit `W-ANNULLATION-TAXED`; sonst korrigierst du die MWST in apaleo. Bis dahin stoppen `mapping check --from --to` und der Export mit `E-UNMAPPED`.

Hat apaleo eine Annullation besteuert, die Zeile aber keinen MWST-Code, stoppt der Export mit `E-VAT-MISSING`: Das Tool ändert die MWST von apaleo nie.

## Debitorenverlust

Schreibt das Hotel eine Gästeforderung ab, bucht apaleo den Debitorenverlust (LossOfAccountsReceivable) gegen die Gästeforderung, mit der MWST der Forderung. Die MWST auf dem Verlust ist eine Entgeltsminderung: Sie mindert die geschuldete MWST (MWSTG Art. 41). Die Vorlage ordnet Debitorenverluste nach MWST-Satz zu, mit `*`-Zeilen:

- `3805` (3,8 %), `3806` (8,1 %) und `3807` (2,6 %) mit dem MWST-Code des Satzes und dem Satz,
- `3808` (0 %) ohne MWST-Code, für Forderungen, auf denen apaleo keine MWST gebucht hat.

Mit MWST-Code steht das Verlustkonto in der `SingleInformation` im Soll, und die MWST ist positiv: Sie mindert die Umsatzsteuer im MWST-Journal von Abacus. Führt der Mandant einen eigenen Korrektur-Code (im KMU-Mustermandanten zum Beispiel `318` oder `319`), trägt dein Treuhänder ihn auf der Zeile ein; das Tool braucht dafür keine Änderung. In der MWST-Abrechnung sollte die Korrektur als Minderung erscheinen, nicht als Vorsteuer; das prüft der erste Import (Checkliste in [abacus-import.md](abacus-import.md#erster-import-bitte-prüfen)).

Warum `*`-Zeilen: apaleo bucht Debitorenverluste auf Konten je Reservation unter den Containern `6900` und `CollectiveDebitor_LossOfAccountsReceivable`, wie bei den Debitoren. Die `*`-Zeilen greifen nach Typ und Satz, egal unter welchem Container das Konto hängt. Bucht apaleo direkt auf einen Container, stoppt der Export mit `E-UNMAPPED`.

## Zahlungen, Forderungen, Debitoren

- **Bar**: Kasse `1000`.
- **Karte, Twint, Überweisung und andere unbare Zahlungen**: Transferkonto `1090`, nie direkt das Bankkonto. Dein Treuhänder bucht den Bankauszug oder die Abrechnung des Zahlungsanbieters gegen dieses Konto. Gebühren der Zahlungsanbieter bucht dieses Tool nicht.
- **Gast-, externe und Buchungsfolios (Receivables)**: Gästeforderungen `1101`. Folios mit Gästenamen erscheinen nie mit Namen im Buchungstext.
- **Rechnungen an Firmen (AccountsReceivable)**: Debitoren apaleo `1102` als Sachkonto. Nicht `1100`: Das ist in Abacus meist das Sammelkonto der Debitorenbuchhaltung, das keine direkten FIBU-Buchungen annimmt. Die Rechnungsnummer steht in `Text2`. Einzelne Debitoren pro Firma (mit Stammdaten) erzeugt das Tool nicht.

## Kostenstellen

Abacus nimmt eine Kostenstelle nur auf Erfolgskonten an. Das Tool schreibt `kost` deshalb nur, wenn das Konto der `SingleInformation` eine Erlös- oder Debitorenverlustzeile ist. Steht `kost` auf einer anderen Zeile, warnt `mapping check` mit `W-KOST-IGNORED`; eine Kostenstelle, die nicht aus 1 bis 11 Ziffern besteht, ist ein Fehler (`E-KOST-FORMAT`).

## Umstieg von einem anderen Connector

Nutzt dein Hotel heute einen kostenpflichtigen apaleo-Abacus-Connector, hat dein Treuhänder dessen Kontenzuordnung schon geprüft. Exportiere sie dort als CSV (Spalten `Apaleo Kontonummer`, `Kontoname`, `Kontotyp`, `Abacus Kontonummer`, `Kostenstelle`) und übernimm sie:

```sh
apaleo-abacus init-mapping --property BSP --template kmu-hotel --accounts-from konten.csv
apaleo-abacus mapping check --property BSP --from 2026-09-01 --to 2026-09-30
```

Das Tool nimmt für jedes apaleo-Konto mit Typ das Abacus-Konto und die Kostenstelle aus dem Export und den MWST-Code und Satz aus der Vorlage, denn der Export hat keine MWST-Spalte. Jede übernommene Zeile ist als «Vorschlag (ungeprüft)» markiert und sagt im Kommentar, dass sie übernommen ist. Konten des Exports, die der apaleo-Kontenplan nicht hat, listet der Befehl auf. Gibt die Vorlage für ein Konto keinen MWST-Code, bleibt er leer, und `mapping check` meldet `E-MWST-CODE-MISSING`, bis du ihn mit deinem Treuhänder einträgst. Als Kontenzuordnung lehnt das Tool den Export ab und nennt `--accounts-from`.

## Checkliste zur Freigabe durch den Treuhänder

Bevor die erste Datei in Abacus importiert wird:

- [ ] Mandant, Leitwährung, Abrechnungsart und MWST-Codes in der Konfiguration stimmen (`abacus.mandant`, `abacus.leitwaehrung`, `abacus.abrechnungsart`, `abacus.mwstCodes.normal`, `abacus.mwstCodes.reduziert`, `abacus.mwstCodes.beherbergung`).
- [ ] Jede Zeile mit Abacus-Konto ist geprüft; jede leere Zeile ist ausgefüllt oder bewusst leer (ein solches Konto darf dann nicht gebucht werden).
- [ ] Die Erlöskonten haben den MWST-Code und den Satz, den apaleo bucht (Beherbergung mit Frühstück 3,8 %, Speisen, Getränke und übrige Leistungen 8,1 %, Take-away 2,6 %), und auf keiner Zeile steht ein Vorsteuer-Code.
- [ ] Für jedes Konto mit MWST-Code ist der Standard-MWST-Code in F21 derselbe wie auf der Zeile, und das Konto ist MWST-pflichtig: `3400 -> 313`, `3200 -> 311`, `3100 -> 311`, `3500 -> 311`, `3260 -> 312`, `2030 -> 313`, `2031 -> 311`, `2032 -> 312`, `3805 -> 313`, `3806 -> 311`, `3807 -> 312` (oder die Konten und Codes deines Mandanten).
- [ ] Die Konten ohne MWST-Code (zum Beispiel `3600`, `3680`, `2039`, `3808` und das Konto der Kurtaxe) haben in F21 keinen Standard-MWST-Code.
- [ ] Die Kurtaxe, Gästetaxe oder Beherbergungsabgabe ist für die Gemeinde des Hotels entschieden: als durchlaufender Posten ohne MWST-Code oder mit einem Code für Ziffer 910, nie mit `490`, oder als Teil der Beherbergung zu 3,8 %, wenn das Hotel sie selbst schuldet.
- [ ] Anzahlungen gehen mit dem MWST-Code ihres Satzes auf die erhaltenen Anzahlungen; mit `vereinnahmt` ist die Korrektur des Hilfskontos `2202` am Periodenende abgemacht.
- [ ] Annullationen und No-Shows sind geklärt: ohne MWST auf `3680` (oder dem Konto deines Mandanten), mit MWST nur, wenn apaleos Satz stimmt.
- [ ] Der Debitorenverlust ist mit dem MWST-Code seines Satzes oder einem Korrektur-Code des Mandanten zugeordnet.
- [ ] Zahlungen ausser bar gehen auf das Transferkonto, Firmenrechnungen auf die Debitoren apaleo als Sachkonto.
- [ ] `apaleo-abacus mapping check --property <id> --from <Monatsanfang> --to <Monatsende>` endet ohne Fehler für einen echten Monat.
- [ ] Ein Probelauf `apaleo-abacus export --month <YYYY-MM> --dry-run` ist ohne `E-` Befund; die Summen pro Konto und MWST-Code stimmen mit den Berichten in apaleo überein.
- [ ] Der erste Import läuft in einen Testmandanten, und das Importprotokoll wurde geprüft ([abacus-import.md](abacus-import.md)).

Datum, Name des Treuhänders und die geprüfte Version der Datei (SHA-256 aus dem Protokoll) kannst du in die Spalte `comment` oder in eure Unterlagen schreiben.
