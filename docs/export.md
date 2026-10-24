# Der Befehl export

`apaleo-odoo export` liest das apaleo-Buchungsjournal eines Zeitraums, bucht es mit deiner Kontenzuordnung und schreibt pro Hotel und Kalendermonat eine Importdatei für Odoo (CSV mit einem Buchungssatz als Entwurf pro Geschäftstag) in den Ausgabeordner. Deine Kanzlei oder deine Buchhaltung importiert sie in Odoo ([odoo-import.md](odoo-import.md)); sie holt die Dateien dort ab (ein gemeinsamer Ordner, ein Cloud-Ordner, oder du schickst sie). Nichts wird irgendwohin hochgeladen, und das Tool braucht keinen Zugang zu Odoo.

Keine Gewähr, keine Steuerberatung: Lass die Kontenzuordnung und die ersten Importe von deinem Steuerberater prüfen.

```sh
apaleo-odoo export --month 2026-10 --dry-run          # alles prüfen, Übersicht zeigen, nichts schreiben
apaleo-odoo export --month 2026-10                    # jedes Hotel aus der Konfiguration
apaleo-odoo export --month 2026-10 --property BSP     # ein Hotel
apaleo-odoo export --from 2026-09-25 --to 2026-10-05  # beide Tage eingeschlossen; zwei Dateien, eine pro Monat
apaleo-odoo export --month 2026-10 --overwrite        # nach einer Nachbuchung, siehe „Noch einmal exportieren“
```

Der Exit-Code ist 0, wenn jedes Hotel und jeder Monat geschrieben wurde oder schon aktuell war, 1, wenn einer davon fehlgeschlagen ist, und 2 bei falschem Aufruf (zum Beispiel ohne Zeitraum).

## Einstellungen

```yaml
odoo:
  journal: APA            # das Kürzel des Journals in Odoo
  version: 19
  taxRounding: per_tax    # wie die Rundungsmethode in Odoo; Standard je nach Version
  roundingAccount: "2700" # SKR03 Sonstige Erträge, nur mit per_tax nötig
properties:
  - id: BSP
    mapping: ./mapping-BSP.csv
    journal: APB          # optional, ersetzt odoo.journal für dieses Hotel
output:
  dir: ./exports
checks:
  aggregates: false       # zusätzliche Vollständigkeitsprüfung, siehe unten
```

Alle Schlüssel stehen in [configuration.md](configuration.md).

## Zeitraum und Monate

Du gibst den Zeitraum als Monat (`--month 2026-10`) oder als ersten und letzten Tag (`--from` und `--to`, beide eingeschlossen) an. Ein Zeitraum wird an Monatsgrenzen geteilt: Jede Datei bleibt in einem Kalendermonat, also in einem Voranmeldungszeitraum der UStVA und in einem Geschäftsjahr. Ein Zeitraum vom 25. September bis 5. Oktober ergibt zwei Dateien, eine im Ordner `2026-09` und eine im Ordner `2026-10`. Odoo ordnet jeden Buchungssatz über sein Datum (den Geschäftstag) dem Monat zu.

## Welche Tage sich exportieren lassen

apaleo veröffentlicht nicht, ob der Tagesabschluss (Night Audit) einen Tag geschlossen hat. Das Tool nutzt deshalb Datumsregeln in der Zeitzone des Hotels:

- Einen Zeitraum, der bis heute (oder später) reicht, lehnt es mit `E-DAY-NOT-CLOSED` ab.
- Einen Zeitraum, der gestern endet, exportiert es mit der Warnung `W-RECENT-DAY`: Der Tagesabschluss ist vielleicht noch nicht gelaufen, spätere Buchungen für diesen Tag sind also möglich. Exportiere nach Möglichkeit nur bis vorgestern.

## Was vor dem Schreiben geprüft wird

Für jedes Hotel und jeden Monat, in dieser Reihenfolge:

1. Das Hotel und jede apaleo-Zeile des Monats sind in der Währung des Odoo-Unternehmens (`odoo.currency`, `E-CURRENCY`). Ein Buchungssatz in Odoo steht in dieser Währung, und das Tool rechnet nicht um. Ein Hotel in einer anderen Währung wird deshalb abgelehnt, bevor das Buchungsjournal gelesen wird.
2. Die Kontenzuordnung lässt sich lesen; eine Zuordnung von apaleo-abacus-export, apaleo-bmd-export oder apaleo-datev-export und den Kontenexport eines kostenpflichtigen Connectors lehnt das Tool ab (`E-EXPORT`, siehe [troubleshooting.md](troubleshooting.md#einrichtung-aus-einem-vorgängerprojekt-übernommen)).
3. Jedes im Zeitraum gebuchte Konto ist zugeordnet (`E-UNMAPPED`, `E-VAT-MISMATCH`, `E-VAT-RATE-UNKNOWN`, wie bei `mapping check --from --to`). Für die Zeilen, die der Monat nutzt, warnt der Export wie `mapping check` mit `W-TAX-UNCHECKED` und `W-TAX-KZ45`; eine bekannte Steuer mit falschem Satz (`W-TAX-RATE` in `mapping check`) stoppt den Monat mit `E-TAX-RATE-WRONG`.
4. Die Buchungsregeln und ihre Steuerprüfung pro Zeile ([posting-rules.md](posting-rules.md)), mit den Warnungen für Kurtaxe mit Steuer (`W-CITY-TAX-TAXED`) und Speisen zum falschen Satz (`W-FOOD-RATE`). Danach trägt jede Odoo-Steuer in den Buchungen des Monats genau einen Satz (`E-TAX-RATES`): Eine Steuer hat in Odoo nur einen Satz. Zwei Zeilen der Kontenzuordnung mit derselben Steuer und verschiedenen Sätzen sind erlaubt, solange nicht beide im selben Monat gebucht werden.
5. Plausibilitätsprüfungen auf den Buchungen, die nachrechnen, was sie ergeben müssen:
   - `E-CONSERVATION`: Jede apaleo-Zeile ist gebucht oder übersprungen, nach Anzahl und Betrag ohne Vorzeichen.
   - `E-ACCOUNT-BALANCE`: Pro Geschäftstag und Odoo-Konto bewegen die Buchungen das Konto genau so wie die apaleo-Zeilen, die ihm zugeordnet sind: die Seite ohne Steuer mit dem Bruttobetrag, die Seite mit der Steuer mit dem Bruttobetrag ohne apaleos auf den Cent gerundete Steuer, jede mit ihrem Vorzeichen (Soll positiv). Die Steuerzeilen, die Odoo selbst anlegt, zählen hier nicht mit. Das findet Fehler bei Soll und Haben, beim Vorzeichen und beim Konto.
   - `E-VAT-TOTAL`: Pro Steuersatz entspricht apaleos Steuer, die die Buchungen tragen, der Summe der Steuerbeträge von apaleo, jeder pro Zeile auf den Cent gerundet, mit höchstens einem Cent pro gemeldeter Rundungsdifferenz einer berechneten Anzahlungssteuer bei diesem Satz. Die Meldung nennt auch die genaue Summe von apaleo und die Rundungsdifferenz der Zeilen. Dass die Steuer pro Zeile um ein paar Cent von der genauen Summe von apaleo abweicht, ist allein nie ein Fehler.
6. Die Prüfungen der fertigen Datei: Das Tool rechnet für jeden Buchungssatz Odoos Steuer nach, so wie Odoo sie aus den Nettobeträgen berechnet ([odoo-format.md](odoo-format.md)). `E-ODOO-UNBALANCED`, wenn Soll und Haben samt Odoos Steuer nicht aufgehen und Odoo eine „Automatische Ausgleichszeile“ (Automatic Balancing Line) anlegen würde; `E-ODOO-GROSS`, wenn die Nettobeträge mit Odoos Steuer den Bruttobetrag aus apaleo nicht erreichen; `E-ODOO-VAT-FIT`, wenn Odoos Steuer weiter von apaleos Steuer abweicht, als die Basisanpassung es erlaubt. Die Prüfungen auf den Buchungen bewachen die Buchungsregeln, diese hier die Basisanpassung; beide melden einen Programmfehler und stoppen den Monat.
7. Optional (`checks.aggregates: true`): die Tagessummen von apaleo, eine Anfrage pro Geschäftstag, gegen die Zeilen des Buchungsjournals an diesem Tag. Verglichen wird pro Konto, das apaleo listet, der **Saldo** (Soll minus Haben): globale Konten wie Zahlungsarten, Erlös- und Steuerunterkonten für sich, Gast-, externe und Buchungskonten über ihr oberstes Elternkonto (`1200`, `3000`, `9999`); Erlöse und Anzahlungen mit dem genauen Nettobetrag, die Steuerkonten von apaleo mit den genauen Steuern der Erlös- und Anzahlungszeilen, alle anderen Konten brutto. Am aufgezeichneten Tag des Sandbox-Hotels BER passen so alle 18 Konten. Ein Konto, dessen Saldo abweicht, ergibt die Warnung `W-AGGREGATE-DIFF` mit beiden Salden und der Grundlage (brutto, netto oder Steuer); die Datei wird trotzdem geschrieben. Dafür braucht es die optionale Berechtigung `core.subledger_aggregate.create`; ohne sie scheitert der Monat mit `E-AGGREGATE-CHECK` und einem Hinweis, sie zu vergeben. Ist apaleo nicht erreichbar oder antwortet mit einem anderen Fehler, scheitert der Monat ebenfalls mit `E-AGGREGATE-CHECK`; starte ihn später noch einmal. Standardmäßig aus: Die Regel stammt aus einer Sandbox und zwei Tagen und ist für echte Hotels noch nicht bestätigt.

Jeder Befund mit `E-` stoppt dieses Hotel und diesen Monat: Dafür wird keine Datei geschrieben, und die anderen Hotels und Monate laufen weiter. Warnungen (`W-`) und Hinweise (`N-`) werden ausgegeben und im Protokoll festgehalten.

Ein Monat ohne Buchungen schreibt keine Datei (`N-NO-BOOKINGS`).

## Der Probelauf: was die Übersicht zeigt

`--dry-run` führt jeden Schritt aus, schreibt aber nichts und legt keinen Ordner an. Er zeigt die Übersicht, die auch im Protokoll steht, und endet mit Exit-Code 1, wenn ein Befund mit `E-` dabei ist. Die Übersicht folgt der Reihenfolge, in der du nach dem Import in Odoo vergleichst; die Beispiele stammen aus der Demo (`apaleo-odoo export --month 2026-09 --demo --dry-run`). Die Ausgabe des Programms ist englisch; die Begriffe der deutschen Buchhaltung (Kennzahl, Soll, Haben, Anzahlungen, Kurtaxe) stehen darin so, wie du sie kennst.

1. **Odoos Umsatzsteuer pro Steuer und Satz** („Odoo's VAT per tax and rate“): pro Odoo-Steuer der Datei die UStVA-Kennzahl (19 % Kz 81, 7 % Kz 86), der Nettobetrag in der Datei, Odoos Umsatzsteuer, apaleos Steuer pro Zeile gerundet und genau, und die Differenz Odoo minus apaleo; darunter die Tage, an denen Odoos Steuer von apaleos abweicht. Erlöse, Anzahlungen, Abgaben mit Steuer und Forderungsverluste derselben Steuer stehen hier zusammen, so wie Odoo sie in den Steuerzeilen und in der UStVA zeigt. Ein Satz erklärt, woher die Differenz kommt:

   ```
     tax_ust_19_skr03 19 % (Kz 81): net 64.18, Odoo VAT 12.19, apaleo per line 12.20, apaleo precise 12.20 (12.19512605), difference (Odoo minus apaleo) -0.01
       2026-09-28: Odoo VAT 0.79, apaleo per line 0.80, difference -0.01
     tax_ust_7_skr03 7 % (Kz 86): net 644.42, Odoo VAT 45.11, apaleo per line 45.10, apaleo precise 45.11 (45.11009346), difference (Odoo minus apaleo) 0.01
       2026-09-10: Odoo VAT 14.07, apaleo per line 14.06, difference 0.01
   ```

   Odoo rechnet die Umsatzsteuer selbst aus dem Nettobetrag jeder Zeile und ihrer Steuer. Die Datei passt jeden Nettobetrag centgenau an, damit Nettobetrag plus Odoos Steuer den Bruttobetrag aus apaleo ergibt ([odoo-format.md](odoo-format.md#basisanpassung-warum-manche-nettobeträge-um-einen-cent-abweichen)). Deshalb kann Odoos Steuer pro Steuer und Tag um einen Cent von apaleos Steuer pro Zeile abweichen. Das ist Odoos Rundung, kein Fehler; in der UStVA zählt, was Odoo gebucht hat.
2. **Erlöse und Anzahlungen mit apaleos Steuer** pro Steuer und Satz, vor der Basisanpassung: Netto (Brutto minus apaleos Steuer pro Zeile), die Steuer pro Zeile (`apaleo per line`), Brutto, apaleos genaue Steuer (`apaleo precise`) und die Differenz pro Zeile minus genau. apaleo hält die Steuer jeder Zeile genau (bis zu acht Nachkommastellen) und rundet erst die Summe; die Differenz von ein paar Cent ist diese Rundung:

   ```
     tax_ust_7_skr03 7 % (Kz 86): net 734.44, apaleo per line 51.40, gross 785.84, apaleo precise 51.41 (51.41009346), difference (per line minus precise) -0.01
   ```

   Bei Anzahlungen steht erhalten minus aufgelöst; am Monatsende ist das 0,00, wenn jede Anzahlung im Monat aufgelöst wurde.
3. **Summen pro Odoo-Konto** (Soll, Haben, Saldo), vor der Basisanpassung: die Seite ohne Steuer mit dem Bruttobetrag, die Seite mit der Steuer mit dem Nettobetrag. Die Nettobeträge in der Datei und die Rundungszeilen können pro Steuer um einen Cent davon abweichen.
4. **Kurtaxe und andere Abgaben** pro Konto, mit oder ohne Steuer: die Kurtaxe, die der Gast schuldet, als durchlaufender Posten ohne Steuer (zum Beispiel SKR03 `1590`), eine Übernachtung- oder Beherbergungsteuer, die der Betrieb schuldet, mit 7 %.
5. **Zahlungen pro Verrechnungskonto**: Kasse und Geldtransit (zum Beispiel SKR03 `1001` und `1360`), Rückzahlungen abgezogen.
6. **Anzahlungen**: erhalten, aufgelöst und davon zurückgezahlt, gesamt und pro Steuer und Satz mit apaleos Steuer.
7. **Forderungen aus Firmenrechnungen** (Soll positiv).
8. **Forderungsverluste** pro Steuer und Satz mit apaleos Steuerberichtigung nach § 17 UStG; sie mindern die Kennzahl.
9. **Die Datei**: Zahl der Buchungssätze, Zeilen und Rundungszeilen.
10. **Übersprungene Zeilen** mit Beträgen ohne Vorzeichen (zum Beispiel beide Seiten auf demselben Odoo-Konto, die Steuerzeilen von apaleo, Beträge von 0,00).
11. **Befunde**: jeder `E-`, `W-` und `N-` Befund mit seiner Meldung.
12. **Der Importblock** („Import into Odoo Accounting“): Dateiname, Revision, Zahl der Buchungssätze und Zeilen mit dem Anfang der Referenzen, Unternehmen (`odoo.companyId`), Journal und Währung, die Rundungsmethode, die in Odoo eingestellt sein muss, jede Steuer mit External ID, Satz und Kennzahl, Odoos Steuer gegen apaleos pro Satz, die Rundungszeilen, die Schritte des Imports und was danach zu prüfen ist.

### Nach dem Import mit Odoo vergleichen

| Zeile der Übersicht | Ansicht in Odoo |
|---|---|
| Odoos Umsatzsteuer pro Steuer und Satz | Die Steuerzeilen pro Satz der importierten Buchungssätze (die Buchungszeilen, englisch Journal Items, gefiltert nach dem Journal und dem Monat, gruppiert nach Steuer) und der Steuerbericht (Tax Report) für die UStVA: Kz 81 und Kz 86 zeigen den Nettobetrag, die Steuer steht daneben. Odoo muss auf den Cent dieselbe Steuer zeigen wie diese Zeile, nicht wie apaleo. |
| Summen pro Odoo-Konto, Konto `1410` | Der Saldo der Gästeforderungen für den Monat; er ist 0,00, wenn jede Rechnung im Monat bezahlt oder auf ein Firmenkonto übertragen wurde. |
| Zahlungen pro Verrechnungskonto, Konto `1360` | Der Saldo des Geldtransitkontos für den Monat; er ist das, was die Kartenzahlungsanbieter noch auszahlen. Gleiche ihn mit den Auszahlungen auf dem Bankkonto ab. |
| Kasse `1001` | Der Saldo der Kasse für den Monat, gegen das Kassenbuch. |
| Importblock, „Entries“ | Die Zahl der Entwürfe mit der Referenz `apaleo <Hotel> <Datum>` im Journal. |

Weicht Odoos Steuer von dieser Übersicht ab, stimmt meist die Rundungsmethode in Odoo nicht mit `odoo.taxRounding` überein, oder Odoo hat eine „Automatische Ausgleichszeile“ angelegt; dann lösch die Entwürfe und vergleiche den Importblock mit den Einstellungen des Unternehmens ([odoo-import.md](odoo-import.md#nach-dem-import-prüfen)).

## Ausgabeordner

```
exports/
  BSP/
    2026-10/
      ODOO_Buchungen_20261001-20261031_BSP.csv
      ODOO_Buchungen_20261001-20261031_BSP.protokoll.txt
      manifest.json
```

Pro Hotel ein Ordner mit seiner apaleo-ID, darin pro Kalendermonat ein Ordner `JJJJ-MM`. Der Dateiname nennt den ersten und den letzten Tag und das Hotel; das Tool erkennt seine Dateien an diesem Namen. Ein Beispiel für die Datei, ihr Protokoll und die Kontenzuordnung liegt in [examples/](examples/).

- Die Odoo-Datei ist das, was deine Kanzlei importiert ([odoo-format.md](odoo-format.md), Import: [odoo-import.md](odoo-import.md)). Benenne sie nicht um, und bearbeite sie nicht.
- Das Protokoll beginnt mit dem Hinweis „keine Gewähr“. Dann folgt die Übersicht des Probelaufs mit dem Importblock am Ende, danach pro Zeile der Datei die apaleo-Buchungsnummern, die sie zusammenfasst, jeweils mit Beleg oder Referenz (zum Beispiel `2026-09-18 1401 Forderungen Firmenrechnungen debit 185.50: BSPE0017 (BSP-2026-0815)`). Am Ende stehen die SHA-256-Prüfsumme der Datei, die der Kontenzuordnung, die Version des Tools und die Erstellungszeit.
- `manifest.json` listet jede Datei des Ordners, auch ersetzte und verschwundene (`status`: `current`, `replaced` oder `removed`, wenn die Datei nicht mehr im Ordner lag, als ein späterer Export eine Datei mit demselben Namen schrieb), mit:
  - `sha256`: die Prüfsumme der ganzen Datei. Die Odoo-Datei hat keine Erstellungszeit, dieselben Buchungen ergeben also immer dieselbe Prüfsumme;
  - `revision`: 1 für die erste Datei eines Zeitraums, 2, 3 und so weiter für jede Datei, die eine frühere derselben Tage ersetzt oder nach ihr kommt (siehe unten);
  - `bookings` und `currency`: die Zahl der gebuchten apaleo-Zeilen und die Währung des Unternehmens;
  - `odooCompanyId` und `odooJournal`: das Unternehmen und das Journal, in das die Datei gehört;
  - `entries`, `lines` und `debitTotalCents`: die Zahl der Buchungssätze und Zeilen und die Summe der Soll-Spalte in Cent;
  - `vatByTax`: pro Steuer mit External ID und Satz der Nettobetrag in der Datei (`baseCents`) und Odoos Umsatzsteuer (`vatCents`) in Cent, als geschuldete Steuer: positiv, was das Hotel schuldet, negativ, was Forderungsverluste und Erlösminderungen abziehen. Zum Abgleich mit dem Steuerbericht in Odoo;
  - `mappingSha256`, `toolVersion` und `createdAt`: die Prüfsumme der Kontenzuordnung, die Version des Tools und die Erstellungszeit; bei einer ersetzten Datei zusätzlich `replacedAt` und `replacedBy`, bei einer verschwundenen `removedAt`.

  Felder, die das Tool nicht kennt (zum Beispiel aus einer früheren Version), stören nicht: Es liest sie nicht und lässt sie stehen.

## Noch einmal exportieren

Der Ausgabeordner ist das Gedächtnis des Exports:

- Dieselbe Datei wie die im Ordner (Byte für Byte): `unchanged`, nichts wird geschrieben, Exit-Code 0. Denselben Monat noch einmal zu exportieren, ist also immer sicher. Odoo würde eine unveränderte Datei auch beim zweiten Import nur über ihre External IDs wiederfinden und nichts doppelt buchen.
- Ein anderer Inhalt, und sei es nur ein Byte: abgelehnt mit `E-FILE-EXISTS`. Das passiert nach einer Nachbuchung in apaleo, einer geänderten Kontenzuordnung oder einer geänderten Einstellung im Abschnitt `odoo` (zum Beispiel `odoo.journal` oder `odoo.taxRounding`, die andere Nettobeträge ergibt). Die Meldung schlägt `--overwrite` vor und sagt, welche Revision die neue Datei bekommt.
- Mit `--overwrite` schreibt das Tool die nächste **Revision**: Die neue Datei trägt neue External IDs (`apaleo_c1_BSP_20260914_r2`) und Referenzen mit dem Zusatz „(Korrektur 2)“ (`apaleo BSP 2026-09-14 (Korrektur 2)`), damit sie in Odoo neue Buchungssätze anlegt. Die Revision liest das Tool aus `manifest.json` oder, ohne Manifest, aus der vorhandenen Datei; Revision 2 wird also zu Revision 3. Die alte Datei bleibt als `<name>.replaced-<Zeitstempel>.csv` erhalten (ihr Protokoll ebenso), und das Manifest verzeichnet beide mit ihrer Revision.
- Eine neue Datei für Tage, die schon einmal exportiert wurden, bekommt immer die nächste Revision, auch ohne `--overwrite`: wenn du die Datei verschoben oder gelöscht hast, oder wenn du nur einen Teil eines früheren Monats neu exportierst. Das Tool nimmt dafür die höchste Revision aller früheren Dateien dieser Tage aus `manifest.json` und aus den Dateien im Ordner (auch den `.replaced-…`-Sicherungen). So trägt die neue Datei nie die External IDs einer Datei, die schon in Odoo importiert oder dort storniert ist; Odoo 18 und 19 würden sonst die ganze Datei ablehnen, und Odoo 17 nähme sie ohne Meldung an und änderte nichts. **Lösch deshalb `manifest.json` nicht**: Nur das Manifest kennt die Revision einer Datei, die nicht mehr im Ordner liegt.
- Ein anderer Zeitraum, der einige derselben Tage abdeckt wie eine Datei im Ordner (zum Beispiel ein Monatsexport nach einem Teilexport vom 20. bis 30.): abgelehnt mit `E-PERIOD-OVERLAP`, und die Meldung nennt die vorhandene Datei. Beide Dateien enthalten Buchungssätze für diese Tage; der Import beider würde geprüfte Entwürfe mit dem Inhalt der anderen Datei überschreiben oder die Tage doppelt buchen. Exportiere denselben Zeitraum wie die vorhandene Datei, oder verschiebe sie zuerst (und mach sie in Odoo rückgängig, falls sie importiert wurde). Die Meldung nennt die Revision, die der neue Zeitraum dann bekommt, zum Beispiel 2 mit `_r2` und „(Korrektur 2)“, damit er keine External ID der verschobenen Datei wiederverwendet.

**Was in Odoo zu tun ist, bevor du die neue Revision importierst:** Filtere die Buchungssätze der früheren Revision nach ihrer Referenz (`apaleo BSP` und der Zeitraum), lösche ihre Entwürfe und storniere ihre gebuchten Buchungssätze mit dem Datum des ursprünglichen Buchungssatzes als „Stornodatum“ (Reversal Date). Ein Import kann einen gebuchten Buchungssatz nicht ändern, und die Stornierung behält seine External ID; deshalb trägt die neue Revision neue. Erst dann importierst du die neue Datei. Die Schritte im Einzelnen: [odoo-import.md](odoo-import.md#einen-monat-ersetzen).

Der Vergleich liest die Datei selbst, er funktioniert also auch, wenn `manifest.json` gelöscht wurde. Ist die Datei unverändert, aber ihr Protokoll oder ihr Eintrag im Manifest fehlt oder beschreibt eine andere Datei (zum Beispiel weil `manifest.json` gelöscht oder ein Lauf nach dem Schreiben der Datei unterbrochen wurde), schreibt der Lauf beides neu und meldet den Hinweis `N-COMPANIONS-REPAIRED`; die Odoo-Datei selbst bleibt unberührt.

Während ein Lauf in einen Ordner für Hotel und Monat schreibt, hält er dort die Sperrdatei `.apaleo-odoo.lock` und prüft noch einmal, dass die Datei auf der Festplatte noch die ist, die er verglichen hat. Ein zweiter Lauf, der gleichzeitig startet, scheitert für diesen Monat mit `E-EXPORT` und schreibt nichts; starte ihn noch einmal, wenn der erste fertig ist. Wurde ein Lauf beim Schreiben abgebrochen, kann die Sperrdatei übrig bleiben: Wenn kein anderer Lauf aktiv ist, lösch sie und starte noch einmal.

## Demo ohne apaleo

```sh
apaleo-odoo export --month 2026-09 --demo --dry-run   # die Übersicht für das erfundene Hotel Beispiel Berlin
apaleo-odoo export --month 2026-09 --demo             # die Datei, nur nach ./demo-output/
```

`--demo` lässt genau diese Verarbeitung auf den aufgezeichneten apaleo-Antworten in `examples/demo/` laufen: keine Konfigurationsdatei, kein Secret, kein Netz. Die Demodaten sind das erfundene „Hotel Beispiel Berlin“ (`BSP`, EUR, `Europe/Berlin`, September 2026) mit Logis und Frühstück zu 7 %, Getränken und Minibar zu 19 %, Kurtaxe und Übernachtungsteuer, einer Anzahlung mit Auflösung und Rückzahlung, Stornogebühren, einer No-Show-Gebühr, einer Rechnung an eine Firma und Forderungsverlusten, sodass jeder Abschnitt der Übersicht etwas zeigt ([examples/README.md](examples/README.md)). Sie buchen mit der SKR03-Hotelvorlage in das Journal `APA` eines Odoo-19-Unternehmens mit Rundung pro Steuer und dem Rundungskonto `2700`, so wie eine neue Datenbank in Odoo Online. Die Uhr der Demo steht auf 2026-10-05, der September 2026 ist also abgeschlossen.

Die Demo markiert ihre Ausgabe: Der Dateiname endet auf `_DEMO` (`ODOO_Buchungen_20260901-20260930_BSP_DEMO.csv`), jede External ID enthält `_DEMO_`, jede Referenz beginnt mit `DEMO `, und die erste Zeile des Protokolls ist `DEMO`. Eine versehentlich importierte Demobuchung findest du in Odoo also über die Referenz und löschst sie. Importiere sie nur in eine Testdatenbank, nie in ein echtes Unternehmen. Die Demo schreibt unterhalb des Arbeitsverzeichnisses; im Docker-Image siehe [docker.md](docker.md#die-demo-im-image). `--config` lässt sich nicht mit `--demo` kombinieren, und die Umgebung ändert nicht, wohin die Demo schreibt.
