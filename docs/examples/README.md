# Beispielausgabe: „Hotel Beispiel Berlin“

Das schreibt das Tool, noch bevor jemand eine apaleo-App anlegt. Alles hier ist erfunden: das Hotel „Hotel Beispiel Berlin“ (`BSP`), die Reservierungen, die Gäste und die Beträge. Hinter den Daten steht kein echtes Hotel und kein echter Gast. Dein Steuerberater kann damit die Ausgabe prüfen, bevor jemand etwas einrichtet.

**Importiere die Datei nur in eine Testdatenbank**, zum Beispiel eine kostenlose Testdatenbank in Odoo Online, nie in die Buchhaltung eines echten Unternehmens.

Das Hotel bucht in EUR (Zeitzone `Europe/Berlin`) in das Journal `APA` eines Odoo-19-Unternehmens mit dem Kontenrahmen SKR03, Rundung pro Steuer (`odoo.taxRounding: per_tax`) und dem Rundungskonto `2700` (Sonstige Erträge). So sieht eine neue Datenbank in Odoo Online aus. Die Konten und Steuern sind die Vorschläge der SKR03-Hotelvorlage, keine Empfehlung: Lass die Zuordnung für dein Hotel von deinem Steuerberater prüfen.

| Datei | Was sie ist |
|---|---|
| [`ODOO_Buchungen_20260901-20260930_BSP.csv`](ODOO_Buchungen_20260901-20260930_BSP.csv) | Die Importdatei für Odoo für September 2026 in EUR: zwölf Buchungssätze (Entwürfe), einer pro Geschäftstag, aus 38 apaleo-Zeilen. Logis und Frühstück mit der Steuer 7 % (`tax_ust_7_skr03`, Kennzahl 86), Getränke und Minibar mit 19 % (`tax_ust_19_skr03`, Kennzahl 81), Erlöse ohne Umsatzsteuer, Stornogebühren und eine No-Show-Gebühr, die Kurtaxe als durchlaufender Posten auf `1590` ohne Steuer, die Übernachtungsteuer mit 7 %, Karten- und Barzahlungen auf Geldtransit `1360` und Kasse `1001`, eine Anzahlung mit Auflösung und Rückzahlung auf `1711`, eine Rechnung an eine Firma auf `1401` und Forderungsverluste auf `2400`, `2401` und `2406`. Zwei Zeilen „Rundungsausgleich USt“ auf `2700` zeigen den Cent, den Odoos Rundung pro Steuer nicht erreicht. |
| [`ODOO_Buchungen_20260901-20260930_BSP.protokoll.txt`](ODOO_Buchungen_20260901-20260930_BSP.protokoll.txt) | Das Protokoll, das daneben geschrieben wird: zuerst Odoos Umsatzsteuer pro Steuer und Satz mit Kennzahl gegen apaleos Steuer und die Tage mit einem Cent Unterschied, dann Erlöse und Anzahlungen mit apaleos Steuer, Summen pro Odoo-Konto, Kurtaxe und Übernachtungsteuer, Zahlungen, Anzahlungen, Forderungen, Forderungsverluste, die Zahl der Buchungssätze und Rundungszeilen, übersprungene Zeilen, Befunde, der Block „Import into Odoo Accounting“ zum Vergleich mit dem Odoo-Unternehmen, die apaleo-Belege pro Zeile der Datei und Prüfsummen. Was jede Zeile bedeutet und womit du sie in Odoo vergleichst, steht in [export.md](../export.md#der-probelauf-was-die-übersicht-zeigt). |
| [`mapping-BSP.example.csv`](mapping-BSP.example.csv) | Die Kontenzuordnung, aus der die Datei entstanden ist, mit den Spalten `odoo_account`, `odoo_tax` und `tax_percent`: genau das, was `init-mapping --template skr03-hotel` für Odoo 19 auf dem Kontenplan der Demo schreibt, mit Kurtaxe (`3501` auf `1590` ohne Steuer) und Übernachtungsteuer (`3502` auf `8300` mit `tax_ust_7_skr03`), so ausgefüllt, wie eine Kanzlei sie entscheiden würde. |

**Bearbeite die Importdatei nicht.** Sie ist UTF-8 ohne Byte-Order-Mark, mit Kommas und LF am Zeilenende, genau so, wie Odoo sie liest. Was jede Spalte bedeutet und woher die Regeln kommen, steht in [odoo-format.md](../odoo-format.md), der Import Schritt für Schritt in [odoo-import.md](../odoo-import.md).

## Was ein Testimport zeigen sollte

- Vor dem Import: das Journal `APA` als Journal der Art „Sonstige“ (Miscellaneous) anlegen, die Rundungsmethode auf „Rundung pro Steuer“ (Round per Tax) prüfen und das Konto `2700` im Kontenplan finden; ob es für ein echtes Hotel das richtige ist, weiß deine Kanzlei.
- Nach dem Import: zwölf Entwürfe mit den Referenzen `apaleo BSP 2026-09-03` bis `apaleo BSP 2026-09-30`, keine „Automatische Ausgleichszeile“ (Automatic Balancing Line), und die Umsatzsteuer pro Satz genau wie im Protokoll: 19 % (Kz 81) 12,19 € auf 64,18 €, 7 % (Kz 86) 45,11 € auf 644,42 €.
- Der Saldo der Gästeforderungen `1410` ist für den Monat 0,00 €; Geldtransit `1360` 414,72 €, Kasse `1001` 300,70 €, Firmenrechnungen `1401` 185,50 €.

## Selbst erzeugen

Die Importdatei und das Protokoll sind das, was ein normaler Export der Demodaten in `examples/demo/` schreibt; ein Test schlägt fehl, sobald sie von dem abweichen, was der aktuelle Code schreibt. So erzeugst du die Datei selbst, ohne apaleo:

```sh
apaleo-odoo export --month 2026-09 --demo
```

Die Demo schreibt nach `./demo-output/` und markiert ihre Ausgabe mit `DEMO`: im Dateinamen (`…_BSP_DEMO.csv`), in den External IDs (`apaleo_c1_BSP_DEMO_…`), am Anfang jeder Referenz (`DEMO apaleo BSP …`) und in der ersten Zeile des Protokolls. Sonst ist die Datei genau die hier. Eine versehentlich importierte Demodatei findest du in Odoo über die Referenz `DEMO apaleo BSP` und löschst ihre Entwürfe.
