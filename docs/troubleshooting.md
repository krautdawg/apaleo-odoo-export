# Fehlerbehebung: alle Befund-Codes

Jede Prüfung des Tools meldet einen Befund mit einem Code. Der Anfang des Codes sagt, wie ernst er ist:

- `E-` ist ein Fehler. Er stoppt das Hotel und den Monat, zu dem er gehört: Dafür wird keine Datei geschrieben. Andere Hotels und Monate laufen weiter.
- `W-` ist eine Warnung. Die Datei wird geschrieben; lies die Warnung und entscheide, ob etwas korrigiert werden muss.
- `N-` ist ein Hinweis. Es ist nichts falsch; er sagt dir, was passiert ist.

Die Codes sind dieselben in `export`, `export --dry-run`, `mapping check`, `init-mapping` und `schedule --once`, in der Protokolldatei und in der Ausgabe von Cron oder `docker logs`. Die Tests prüfen, dass diese Seite jeden Code aus dem Quellcode aufführt, und nur diese.

Meldungen nennen apaleo-Konten mit Nummer und Typ, nie mit Namen, überall dort, wo ein Gästename stehen könnte. Wenn du in einem Issue um Hilfe bittest, kannst du Code und Meldung einfügen, entferne aber vorher alle Namen.

Keine Gewähr, keine Steuerberatung: Wenn eine Lösung die Kontenzuordnung ändert, lass sie von deinem Treuhänder bestätigen.

## Zeitraum und Hotel

| Code | Ursache | Lösung |
|---|---|---|
| `E-DAY-NOT-CLOSED` | Der Zeitraum reicht bis heute (oder später) in der Zeitzone des Hotels. apaleo hat diesen Tag noch nicht mit dem Tagesabschluss (Night Audit) geschlossen, Buchungen können sich also noch ändern. | Exportiere höchstens bis gestern, besser bis vorgestern. |
| `W-RECENT-DAY` | Der Zeitraum endet gestern. Der Tagesabschluss ist vielleicht noch nicht gelaufen, spätere Buchungen für diesen Tag sind also möglich. | Exportiere lieber nur bis vorgestern. Kommt eine Nachbuchung, siehe `E-FILE-EXISTS`. |
| `N-NOT-FINAL` | Nur bei `schedule --once`: Der Zeitraum ist fällig, aber sein letzter Tag ist noch nicht abgeschlossen (siehe `schedule.finalAfter` in [docker.md](docker.md)). Es wurde nichts abgerufen und nichts geschrieben. | Nichts zu tun. Der erste geplante Lauf nach dieser Uhrzeit exportiert ihn. |
| `E-PROPERTY-UNKNOWN` | Die Property-ID aus der Konfiguration oder aus `--property` ist für die apaleo Custom App nicht sichtbar. | Lass dir mit `apaleo-abacus properties` die IDs anzeigen, die die App lesen darf. Prüfe die Hotel-Auswahl der Custom App in apaleo ([setup-apaleo.md](setup-apaleo.md)). |
| `E-CURRENCY` | Das Hotel oder eine Zeile im Buchungsjournal ist nicht in der Leitwährung des Mandanten (`abacus.leitwaehrung`, Standard CHF). Eine Abacus-Buchung steht in der Leitwährung, ohne Fremdwährung, und das Tool rechnet nicht um. Für ein Hotel in einer anderen Währung liest das Tool das Buchungsjournal gar nicht erst. | Setze `abacus.leitwaehrung` auf die Währung des Hotels (CHF oder EUR), wenn sie die Leitwährung des Mandanten ist. Fremdwährungen unterstützt das Tool nicht. |
| `N-NO-BOOKINGS` | apaleo hat für den Zeitraum keine Buchungen, also wurde keine Datei geschrieben. | Nichts zu tun, ausser du hast Buchungen erwartet: Dann prüfe die Property-ID und die Daten. |
| `W-MANDANT-SHARED` | Zwei oder mehr Hotels der Konfiguration buchen in denselben Abacus-Mandanten und Geschäftsbereich. Die Belegnummern ihrer Dateien beginnen gleich (Monat, Tag und Zähler), also können sie sich dort wiederholen. `doctor` und das Protokoll melden das. | Gib jedem Hotel einen eigenen Geschäftsbereich (`properties[].geschaeftsbereich`) oder einen eigenen Mandanten (`properties[].mandant`); frag deinen Treuhänder, welche Geschäftsbereiche der Mandant hat. |
| `W-ABRECHNUNGSART-VEREINNAHMT` | `abacus.abrechnungsart` ist `vereinnahmt`. Abacus bucht die MWST dieser Buchungen dann auf das Hilfskonto (`abacus.mwstHilfskonto`, Standard `2202`) und überträgt sie erst auf das Steuerkonto, wenn eine Zahlung erfasst wird, normalerweise in der Debitorenbuchhaltung, die dieses Tool nicht bedient. Die Datei bucht die MWST am Tag der Leistung, nach vereinnahmten Entgelten entsteht sie aber mit der Zahlung (MWSTG Art. 40 Abs. 2). `doctor` und jeder Export melden das, einmal pro Hotel und Monat in der Ausgabe und im Protokoll dieses Monats; ein Export über drei Monate zeigt die Warnung also dreimal. Die Datei wird trotzdem geschrieben. | Lass deinen Treuhänder das Hilfskonto am Periodenende korrigieren, wie es [mapping-guide.md](mapping-guide.md#vereinnahmte-entgelte) beschreibt (Umbuchung des bezahlten Teils von `2202` auf `2200`, Debitorenkorrektur für das, was noch offen ist). Rechnet der Mandant nach vereinbarten Entgelten ab, lass `abacus.abrechnungsart` weg. |

## Kontenzuordnung

Diese Befunde kommen aus `mapping check`, `init-mapping` und jedem Export, denn der liest zuerst die Kontenzuordnung. Spalten und Regeln: [mapping-guide.md](mapping-guide.md).

| Code | Ursache | Lösung |
|---|---|---|
| `E-UNMAPPED` | Ein im Zeitraum gebuchtes apaleo-Konto hat keine Zeile mit Abacus-Konto, oder seine Zeile lässt `abacus_account` leer. Die Zeilen für die Kurtaxe, für Annullationen und No-Shows mit MWST und für Sätze, die kein Schweizer MWST-Satz sind, bleiben in der Vorlage absichtlich leer. Konten pro Reservation oder Folio (zum Beispiel Anzahlungen unter `3000`) meldet der Befund einmal pro Elternkonto, Typ und Satz, mit bis zu drei Beispielen. | Folge der Meldung: Sie nennt die Zeile, in die `abacus_account` gehört, oder die `*`-Zeile, die du ergänzen sollst, zum Beispiel `*;Liabilities;;3.8;<Abacus account>;313;3.8` (Vorlage: 2030) oder `*;AccountsReceivable;;;1102` (Debitoren apaleo). Eine leere Elternzeile wie `3000;Liabilities` füllst du nicht aus: Ein Abacus-Konto kann nicht jeden Satz abdecken. Frag deinen Treuhänder, welches Konto. Dann starte `apaleo-abacus mapping check --property <id> --from <erster Tag> --to <letzter Tag>`. |
| `E-VAT-MISMATCH` | apaleo bucht das Konto mit einem MWST-Satz, aber seine Zeile bucht einen anderen (`mwst_percent`, ohne MWST-Code 0 %), zum Beispiel ein Konto mit 3,8 %, das über die Zeile seines Elternkontos auf 3500 mit 8,1 % landet. | Gib dem Konto eine eigene Zeile mit einem Abacus-Konto, dem MWST-Code und dem Satz von apaleo. |
| `E-VAT-RATE-UNKNOWN` | Eine Auflösung einer Anzahlung kommt in apaleo ohne MWST, und ihr Satz lässt sich weder aus einer `PostPrepaymentVat`-Zeile desselben Tages und derselben Reservation noch aus dem Kontenplan ermitteln. Das Tool bucht eine solche Auflösung nie mit 0 %. | Starte `apaleo-abacus live-smoke` für diesen Tag und eröffne ein Issue mit der anonymisierten Ausgabe; siehe [posting-rules.md](posting-rules.md). |
| `E-VAT-PERCENT` | `apaleo_vat_percent` oder `mwst_percent` ist keine Zahl. | Schreib eine einfache Zahl wie `8.1` oder `3,8`, oder lass das Feld leer. |
| `E-VAT-RATE-MISSING` | Eine Zeile hat einen MWST-Code, aber keinen Satz in `mwst_percent`; im Export ist der Satz dann unbekannt. | Trag den Satz ein, mit dem Abacus den MWST-Code bucht, bei Erlösen ohne MWST `0`. |
| `E-MWST-CODE-MISSING` | `mwst_percent` ist grösser als 0, aber der MWST-Code ist leer. Ohne MWST-Code bucht Abacus keine MWST. Auch nach `init-mapping --accounts-from`, wenn die Vorlage für ein übernommenes Konto keinen Code hat. | Trag den MWST-Code aus der MWST-Tabelle des Mandanten ein; frag deinen Treuhänder. |
| `E-MWST-CODE-FORMAT` | Der MWST-Code hat nicht 1 bis 3 Zeichen aus `A-Z`, `a-z` und `0-9`. | Korrigiere den Code, zum Beispiel `311`. Frag deinen Treuhänder, welche Codes der Mandant hat. |
| `E-MWST-CODE-NOT-ALLOWED` | Auf einer Zeile für Zahlungen (Payments), Gästeforderungen (Receivables) oder Debitoren (AccountsReceivable) steht ein MWST-Code. Abacus würde die MWST dann auf diesem Geld- oder Forderungskonto buchen. `mapping check` meldet die Zeile, der Export stoppt bei der ersten Buchung, die sie trifft. | Lass `mwst_code` und `mwst_percent` auf dieser Zeile leer und trag den MWST-Code auf der Erlös- oder Anzahlungszeile ein. |
| `W-MWST-CODE-UNCHECKED` | Der MWST-Code ist keiner der Codes aus `abacus.mwstCodes`. Ist er ein Code des KMU-Mustermandanten von Abacus, nennt die Warnung seine Ziffer der MWST-Abrechnung (zum Beispiel `400` Ziffer 230, `490` Ziffer 900, `491` Ziffer 910). Der Code `490` «Subvention Kurtaxen» ist für Subventionen und Tourismusabgaben eines Kurvereins mit Vorsteuerkürzung, nicht für die Kurtaxe, die das Hotel einzieht. | Lass dir von deinem Treuhänder bestätigen, dass der Code ein Umsatzsteuer-Code des Mandanten ist. Eine eingezogene Kurtaxe ist ein durchlaufender Posten ohne MWST-Code oder mit einem Code für Ziffer 910 wie `491`. |
| `W-MWST-CODE-RATE` | Ein Code aus `abacus.mwstCodes` steht mit einem anderen Satz als seinem eigenen in der Zeile (`normal` 8,1 %, `reduziert` 2,6 %, `beherbergung` 3,8 %), zum Beispiel `313` auf einem Erlös zu 8,1 %. | Prüfe, ob die Codes vertauscht sind, und korrigiere die Zeile oder `abacus.mwstCodes`. |
| `E-MWST-CODE-RATES` | Beim Export: Die Buchungen eines Hotels und Monats tragen denselben MWST-Code mit zwei verschiedenen Sätzen, zum Beispiel `311` auf Beherbergung zu 3,8 % und auf Speisen zu 8,1 %. Ein MWST-Code hat in der MWST-Tabelle des Mandanten an einem Datum genau einen Satz; Abacus würde die Buchungen zum anderen Satz neu rechnen oder ablehnen. Die Meldung nennt den Code, die Sätze und die Zeilen der Kontenzuordnung. Zwei Zeilen mit demselben Code und verschiedenen Sätzen sind erlaubt, solange sie nicht im selben Monat gebucht werden (zum Beispiel beim Satzwechsel am 1. Januar). | Gib jedem Satz seinen eigenen MWST-Code aus der MWST-Tabelle des Mandanten (`mwst_code` und `mwst_percent`), führe `apaleo-abacus mapping check` aus und exportiere noch einmal. Es wurde keine Datei geschrieben. |
| `W-UNTAXED-REVENUE` | Eine Erlöszeile hat keinen MWST-Code, zum Beispiel `3600` oder die Annullationen `3680` der Vorlage. Mit «MWST berechnen» setzt Abacus einen Standard-MWST-Code, der am Konto hinterlegt ist, beim Import ein. | Prüfe, dass das Abacus-Konto keinen Standard-MWST-Code hat, oder trag den MWST-Code des Mandanten für Umsätze ohne MWST ein. |
| `W-KURTAXE-TAXED` | Eine Zeile für die Kurtaxe, eine zweite Kurtaxe oder eine Gästetaxe (CityTaxes, SecondCityTax, GuestLevies) hat einen MWST-Code mit einem Satz über 0 %. Eine Kurtaxe oder Gästetaxe, die der Gast schuldet, die separat verrechnet und der Gemeinde abgeliefert wird, ist ein durchlaufender Posten ohne MWST (ESTV MBI 08 Ziff. 7.11). Zu 3,8 % gehört nur eine Beherbergungsabgabe, die das Hotel selbst schuldet, eine Kurtaxe, die nicht separat verrechnet wird, oder der Teil, den das Hotel behält. | Bestätige die Zeile mit deinem Treuhänder. Für einen durchlaufenden Posten: Konto wie `2210` ohne MWST-Code oder mit einem Code für Ziffer 910, nie der Code `490` (Ziffer 900). Siehe [mapping-guide.md](mapping-guide.md#kurtaxe-gästetaxe-und-beherbergungsabgabe). |
| `W-ANNULLATION-TAXED` | Eine Erlöszeile für Annullationen oder No-Shows (apaleos Gruppen `RevenueCancellationFees` und `RevenueNoShow`, oder ein Name mit Annullation, Storno, Cancel oder No-Show) hat einen MWST-Code mit einem Satz über 0 %. Zahlungen für Annullationen und No-Shows sind Schadenersatz ohne MWST, ausser die Leistung wurde schon ohne Korrekturbeleg in Rechnung gestellt (ESTV MBI 08 Ziff. 8.7). | Bestätige die Zeile mit deinem Treuhänder, oder korrigiere die MWST in apaleo und ordne das Konto `3680` ohne MWST-Code zu. Siehe [mapping-guide.md](mapping-guide.md#annullationen-und-no-shows). |
| `E-KOST-FORMAT` | Die Kostenstelle in `kost` hat nicht 1 bis 11 Ziffern. | Trag eine Kostenstelle aus Ziffern ein, oder lass das Feld leer. |
| `W-KOST-IGNORED` | Auf einer Zeile, die keine Erlös- oder Debitorenverlustzeile ist, steht eine Kostenstelle. Das Tool schreibt sie nie, denn Abacus nimmt eine Kostenstelle nur auf Erfolgskonten an. | Lass `kost` auf dieser Zeile leer. |
| `E-ACCOUNT-FORMAT` | Das Abacus-Konto hat nicht 1 bis 11 Ziffern, zum Beispiel `34OO` mit Buchstaben oder eine Nummer mit 12 Stellen. Das Tool füllt nie Nullen auf. | Schreib das Konto so, wie es im Kontenplan des Mandanten steht, nur Ziffern. Formatiere die Spalte in Excel als Text. |
| `W-UNKNOWN-TYPE` | `apaleo_type` ist keiner der Kontotypen von apaleo. | Korrigiere die Schreibweise (`Revenues`, `Payments`, `Liabilities`, ...). |
| `W-UNKNOWN-COLUMN` | Die Datei hat eine Spalte, die das Tool nicht nutzt. Sie wird ignoriert. | Nichts, ausser du hast einen Spaltennamen falsch geschrieben. |
| `N-VAT-ROW-IGNORED` | Die Datei hat Zeilen für die apaleo-Konten `Vat` oder `VatOnLiabilities`. Diese Buchungen werden immer übersprungen, weil Abacus die MWST aus den `TaxData` der Erlös- oder Anzahlungsbuchung bucht. | Nichts. Du kannst diese Zeilen löschen. |

Eine Zuordnung oder Konfiguration aus Deutschland oder Österreich erkennt das Tool und bricht ab; siehe [Einrichtung aus Deutschland oder Österreich übernommen](#einrichtung-aus-deutschland-oder-österreich-übernommen).

## Buchungsregeln und MWST

Abacus bekommt den Bruttobetrag und die MWST: Die MWST ist die von apaleo, auf den Rappen gerundet. Diese Prüfungen stellen sicher, dass Abacus genau die MWST bucht, die apaleo berechnet hat. Einzelheiten: [posting-rules.md](posting-rules.md).

| Code | Ursache | Lösung |
|---|---|---|
| `W-VAT-ROUNDING` | Die Kontrolle der Buchung (die MWST, die im Bruttobetrag steckt: Betrag mal Satz durch 100 plus Satz, auf den Rappen gerundet) weicht um einen Rappen von der Steuer ab, die apaleo berechnet hat. Die Buchung behält die Steuer von apaleo, und die Differenz geht in die Rundungssumme der Übersicht. Bei einer Anzahlung ohne MWST-Betrag in apaleo: Die berechnete Steuer weicht um einen Rappen von der `PostPrepaymentVat`-Zeile ab. | Nichts. |
| `E-VAT-AMOUNT` | Die Steuer einer Zeile weicht um mehr als einen Rappen von der Kontrolle oder von der `PostPrepaymentVat`-Zeile ab. | Eröffne ein Issue mit der anonymisierten Zeile. Mit einer korrekten Kontenzuordnung sollte das nicht passieren. |
| `E-VAT-RATE` | Der Satz von apaleo auf der Zeile weicht von dem Satz ab, den die zugeordnete Zeile mit ihrem MWST-Code bucht. | Korrigiere die Zeile der Kontenzuordnung, die die Meldung nennt, oder nimm eine Kontenzuordnung für diesen Zeitraum. |
| `E-VAT-MISSING` | apaleo hat MWST berechnet, aber keines der beiden zugeordneten Konten hat einen MWST-Code, zum Beispiel ein besteuerter No-Show auf `3680` oder ein Debitorenverlust mit MWST auf einer Zeile ohne MWST-Code. | Ordne das Erlös-, Anzahlungs- oder Verlustkonto einer Zeile mit MWST-Code und dem Satz von apaleo zu. Ist die MWST von apaleo falsch (eine Annullation ohne MWST), korrigiere sie in apaleo. |
| `E-VAT-UNEXPECTED` | apaleo hat keine MWST berechnet, aber die zugeordnete Zeile bucht mit MWST-Code einen Satz über 0 %. | Ordne das Konto einer Zeile ohne MWST-Code zu, zum Beispiel 3600 für Erlöse ohne MWST, oder einer Zeile mit dem Satz 0 %. |
| `E-VAT-MIXED` | Eine Zeile des Buchungsjournals hat mehr als einen MWST-Satz. | Eröffne ein Issue mit der anonymisierten Zeile. |
| `E-VAT-SIGN` | MWST und Bruttobetrag einer Zeile haben verschiedene Vorzeichen. | Eröffne ein Issue mit der anonymisierten Zeile. |
| `E-TWO-VAT-SIDES` | Beide Seiten einer Zeile sind Zeilen mit MWST-Code zugeordnet, zum Beispiel eine Umbuchung zwischen zwei Erlöskonten. Eine Abacus-Buchung trägt die MWST nur auf ihrem Konto in `SingleInformation`. | Eröffne ein Issue mit der anonymisierten Zeile; bis dahin bucht dein Treuhänder sie in Abacus von Hand, zum Beispiel über ein Transferkonto. |
| `W-VAT-INFERRED` | Eine Auflösung einer Anzahlung ohne MWST in apaleo hat ihren Satz aus dem Kontenplan bekommen, weil keine `PostPrepaymentVat`-Zeile gefunden wurde; die Steuer ist aus dem Bruttobetrag berechnet. | Prüfe die Auflösung im Protokoll. Teile bitte eine anonymisierte Ausgabe von `live-smoke`, damit sich die Regel bestätigen lässt. |

## Plausibilitätsprüfungen

Bevor eine Datei geschrieben wird, rechnet das Tool nach, was die Buchungen ergeben müssen. Diese Fehler bedeuten, dass das Tool selbst etwas falsch gemacht hat. Eröffne bitte ein Issue mit der anonymisierten Übersicht.

| Code | Ursache | Lösung |
|---|---|---|
| `E-CONSERVATION` | Nicht jede apaleo-Zeile ist gebucht oder übersprungen worden (nach Anzahl und Betrag ohne Vorzeichen). | Eröffne ein Issue. Es wurde keine Datei geschrieben. |
| `E-ACCOUNT-BALANCE` | An einem Geschäftstag bewegt sich ein Abacus-Konto in den Buchungen anders als die apaleo-Zeilen, die ihm zugeordnet sind (das Konto der `CollectiveInformation` mit dem Bruttobetrag, das Konto der `SingleInformation` mit dem Bruttobetrag ohne die MWST, jedes mit seiner Seite aus `DebitCredit`). Das findet Fehler bei Soll/Haben und Vorzeichen. | Eröffne ein Issue. Es wurde keine Datei geschrieben. |
| `E-VAT-TOTAL` | Pro MWST-Satz weicht die MWST der Buchungen um mehr als die gemeldeten Rundungsdifferenzen von der Summe der pro Zeile gerundeten Steuern von apaleo ab. Die Meldung nennt auch die genaue Summe von apaleo. Dass die Buchungen um ein paar Rappen von dieser genauen Summe abweichen, ist allein nie dieser Fehler; das ist die Rundung pro Zeile (siehe [export.md](export.md)). | Eröffne ein Issue. Es wurde keine Datei geschrieben. |
| `W-AGGREGATE-DIFF` | Nur bei `checks.aggregates: true`: Der Saldo (Soll minus Haben) eines Kontos in den Tagessummen von apaleo weicht vom Saldo der Zeilen des Buchungsjournals an diesem Tag ab. Die Meldung nennt beide Salden und die Grundlage (brutto, netto oder Steuer). Die Datei wird trotzdem geschrieben. | Vergleiche den Tag mit den Berichten in apaleo. Teile den anonymisierten Befund in einem Issue. |
| `E-AGGREGATE-CHECK` | Nur bei `checks.aggregates: true`: Die Tagessummen von apaleo liessen sich nicht lesen, weil die optionale Berechtigung fehlt oder apaleo nicht erreichbar war. | Gib der Custom App die Berechtigung `core.subledger_aggregate.create`, versuch es später noch einmal oder setze `checks.aggregates: false`. |

## Ausgabeordner und erneute Läufe

Einzelheiten: [export.md](export.md).

| Code | Ursache | Lösung |
|---|---|---|
| `E-FILE-EXISTS` | Im Ausgabeordner liegt schon eine Datei für denselben Zeitraum, und die neue Datei weicht in mindestens einem Byte ab: eine Nachbuchung in apaleo, eine geänderte Kontenzuordnung oder eine Einstellung im Abschnitt `abacus` (zum Beispiel `abacus.geschaeftsbereich`). Abacus würde beide Dateien buchen. | Hat dein Treuhänder die alte Datei schon importiert, löscht er zuerst ihre Buchungen in Abacus: im Nebenjournal, bevor sie übertragen sind, sonst durch Stornobuchungen (Mandant und Bereich der Belegnummern stehen im Block «Import into Abacus FIBU» des alten Protokolls). Dann starte denselben Export noch einmal mit `--overwrite`; die alte Datei bleibt als `.replaced-<Zeitstempel>.xml` liegen. Siehe [export.md](export.md#noch-einmal-exportieren). |
| `E-PERIOD-OVERLAP` | Im Ordner liegt schon eine Datei für einen anderen Zeitraum, der einige derselben Tage abdeckt, zum Beispiel ein Monatsexport nach einem Teilexport. Die Meldung nennt die Datei. | Exportiere denselben Zeitraum wie die vorhandene Datei, oder verschiebe sie. Wurde sie importiert, löscht dein Treuhänder zuerst ihre Buchungen in Abacus. |
| `N-COMPANIONS-REPAIRED` | Die Datei war unverändert, aber ihr Protokoll oder ihr Eintrag in `manifest.json` fehlte oder war falsch (ein früherer Lauf wurde unterbrochen), und wurde neu geschrieben. | Nichts. |
| `E-EXPORT` | Ein Schritt des Exports ist fehlgeschlagen: Das Dateisystem hat das Schreiben verweigert (Rechte, volle Festplatte, schreibgeschützter Mount), ein anderer Lauf hielt die Sperre des Ordners, oder ein Problem mit der Kontenzuordnung oder mit apaleo hat den Monat gestoppt. Die Meldung sagt, was. | Folge dem Hinweis in der Meldung. Mit Docker braucht ein Ordner `./data`, der root gehört, `sudo chown -R 1000:1000 data`. Eine übrig gebliebene `.apaleo-abacus.lock` aus einem abgebrochenen Lauf darfst du löschen, wenn kein anderer Lauf aktiv ist. |

## Abacus-Datei (XML Buchungen)

Der Writer für die AbaConnect-Datei «XML Buchungen» prüft jedes Feld, bevor er eine Datei schreibt, und meldet alle Fehler auf einmal, mit Buchungsnummer und Feld. Bei einem Fehler schreibt er keine Datei. Einzelheiten: [abacus-format.md](abacus-format.md).

| Code | Ursache | Lösung |
|---|---|---|
| `E-ABACUS-ACCOUNT` | Ein Konto der Buchung besteht nicht aus 1 bis 11 Ziffern. Abacus-Konten sind Zahlen. | Korrigiere das Konto in der Kontenzuordnung, ohne Buchstaben, Leerzeichen oder Punkte. |
| `E-ABACUS-SAME-ACCOUNT` | Konto und Gegenkonto einer Buchung sind gleich. | Prüf die Kontenzuordnung: Zwei apaleo-Konten derselben Buchung zeigen auf dasselbe Abacus-Konto. |
| `E-ABACUS-AMOUNT` | Ein Betrag ist nicht grösser als 0, nicht auf den Rappen genau oder hat mehr als 11 Stellen vor dem Punkt. | Eröffne ein Issue: Zeilen mit Betrag 0 werden normalerweise vor dem Schreiben übersprungen. |
| `E-ABACUS-TAX` | Die MWST einer Buchung ist nicht kleiner als ihr Bruttobetrag, nicht auf den Rappen genau, oder nicht 0 bei einem MWST-Code mit Satz 0. | Prüf Satz und MWST-Code der Zeile in der Kontenzuordnung; sonst eröffne ein Issue. |
| `E-ABACUS-TAX-RATE` | Die MWST einer Buchung passt nicht zu ihrem Satz: Sie weicht um mehr als einen Rappen von `Brutto × Satz / (100 + Satz)` ab, auf den Rappen gerundet. Ohne «MWST berechnen» übernimmt Abacus die MWST so, wie sie in der Datei steht, und sie käme falsch in die MWST-Abrechnung. | Prüf Satz und MWST-Code der Zeile in der Kontenzuordnung; stimmen sie, eröffne ein Issue mit der Meldung (ohne Namen). |
| `E-ABACUS-TAX-SIGN` | Die MWST hat das falsche Vorzeichen: negativ, wenn das Gegenkonto im Haben steht, positiv, wenn es im Soll steht. | Eröffne ein Issue mit der Meldung (ohne Namen). |
| `E-ABACUS-RATE` | Der MWST-Satz ist negativ, grösser als 99,99 oder hat mehr als zwei Nachkommastellen. | Korrigiere den Satz in der Kontenzuordnung, zum Beispiel `8.1`, `3.8` oder `2.6`. |
| `E-ABACUS-MWST-CODE` | Der MWST-Code hat nicht 1 bis 3 Zeichen aus `A-Z`, `a-z` und `0-9`. | Nimm den Code aus der MWST-Tabelle des Mandanten, zum Beispiel `313`; frag deinen Treuhänder. |
| `E-ABACUS-KOST` | Die Kostenstelle hat nicht 1 bis 11 Ziffern. | Trag in der Kontenzuordnung eine Kostenstelle aus Ziffern ein, oder lass das Feld leer. |
| `E-ABACUS-TEXT` | `Text1` einer Buchung ist leer, auch nach dem Bereinigen. Abacus braucht einen Buchungstext. | Eröffne ein Issue: Das Tool setzt den Text selbst. |
| `E-ABACUS-DATE` | Das Datum einer Buchung ist ungültig oder liegt ausserhalb des Zeitraums der Datei. | Eröffne ein Issue: Der Export liest nur Buchungen des Zeitraums. |
| `E-ABACUS-PERIOD` | Beginn oder Ende des Zeitraums ist kein gültiges Datum, oder der Zeitraum beginnt nach seinem letzten Tag. Die Meldung hat keine Buchungsnummer. | Prüf `--from` und `--to` (Format `JJJJ-MM-TT`, `--from` nicht nach `--to`). |
| `E-ABACUS-BELEGNR` | Eine Datei hätte mehr als 999 999 Buchungen. Die Belegnummer hat sechs Stellen für den Zähler. | Exportiere kürzere Zeiträume, zum Beispiel mit `--from` und `--to` je eine Woche. |
| `E-ABACUS-FILE-NAME` | Die Property-ID lässt sich nicht im Dateinamen verwenden (erlaubt sind nur Buchstaben, Ziffern, `_` und `-`). | Eröffne ein Issue mit der Property-ID (sie kommt aus apaleo). |
| `N-ABACUS-TRUNCATED` | `Text1` oder `Text2` wurde auf 80 Zeichen gekürzt. | Nichts, ausser der gekürzte Text ist wichtig. Über die Protokolldatei findest du die Buchung in apaleo. |

## Einrichtung aus Deutschland oder Österreich übernommen

Dieses Tool baut auf apaleo-datev-export und apaleo-bmd-export auf, die DATEV-Dateien für Deutschland und BMD-Dateien für Österreich schreiben. Diese Prüfungen fangen eine Einrichtung ab, die von dort oder von einem kostenpflichtigen Connector kopiert wurde, damit keine fremden Konten, Schlüssel oder Sätze in Abacus landen.

| Code | Ursache | Lösung |
|---|---|---|
| `W-VAT-RATE-UNUSUAL` | `mwst_percent` ist kein Schweizer MWST-Satz (0, 2,6, 3,8 oder 8,1 %), zum Beispiel 7 % aus einer deutschen oder 10 % aus einer österreichischen Zuordnung. Bei 7,7, 3,7 und 2,5 % sagt die Warnung, dass diese Sätze bis 2023-12-31 galten. | Prüfe die Zeile. Schweizer Hotels buchen seit 2024 mit den Sätzen aus MWSTG Art. 25; Exporte für 2023 und früher klärst du mit deinem Treuhänder. |
| `E-EXPORT` (beim Lesen der Kontenzuordnung) | Die Kontenzuordnung hat die Spalten der BMD-Zuordnung von apaleo-bmd-export (`bmd_account`, `steuercode`), der DATEV-Zuordnung von apaleo-datev-export (`datev_account`, `bu_key`) oder ist der Kontenexport eines kostenpflichtigen DATEV- oder Abacus-Connectors. `mapping check` und `init-mapping --update` brechen mit derselben Meldung ab. | Leg die Datei mit `apaleo-abacus init-mapping --property <id> --template kmu-hotel` neu an. Den Kontenexport eines kostenpflichtigen Abacus-Connectors übernimmst du mit `--accounts-from <Datei>`; siehe [mapping-guide.md](mapping-guide.md#umstieg-von-einem-anderen-connector). |
| kein Code, jeder Befehl bricht ab | Die Konfigurationsdatei hat einen Abschnitt `bmd` oder `datev` (aus der Konfiguration von apaleo-bmd-export oder apaleo-datev-export). | Ersetze ihn durch den Abschnitt `abacus` mit `abacus.mandant` und den Werten deines Treuhänders; siehe [configuration.md](configuration.md#abacus). |

## Häufige Fragen nach dem ersten Live-Test

**«the amount 12.5210084 is not a whole number of cents».** Ältere Stände des Tools brachten diese Meldung, weil apaleo Netto- und Steuerbeträge mit bis zu acht Nachkommastellen schickt. Der aktuelle Stand behält sie genau; nur der Bruttobetrag muss ganze Rappen sein. Schau, welches Feld die Meldung vor dem Doppelpunkt nennt:

- `netAmount` oder `taxes[…].amount`: Du nutzt eine alte Version. Hol die aktuelle (`git pull`, `pnpm install --frozen-lockfile`, `pnpm build`).
- `grossAmount`: Das ist auch in der aktuellen Version ein echter Fehler, ein Update hilft nicht. Eröffne ein Issue, wie die Meldung sagt, und lass Gastnamen weg.

**Die MWST im Protokoll weicht um ein paar Rappen von apaleo ab.** Jede Buchung trägt die Steuer ihrer apaleo-Zeile, auf den Rappen gerundet; apaleo rechnet genau und rundet die Summe. Das Protokoll zeigt beide Werte und die Differenz; sie ist kein Fehler. Siehe [export.md](export.md).
