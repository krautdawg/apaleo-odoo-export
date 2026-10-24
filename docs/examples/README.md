# Beispielausgabe: „Hotel Beispiel Berlin“

Das schreibt das Tool, noch bevor jemand eine apaleo-App anlegt. Alles hier ist erfunden: das Hotel „Hotel Beispiel Berlin“ (`BSP`), die Reservierungen und die Beträge. Hinter den Daten steht kein echtes Hotel und kein echter Gast. Dein Steuerberater kann damit die Ausgabe prüfen, bevor jemand etwas einrichtet.

Das Hotel bucht in EUR (Zeitzone `Europe/Berlin`) in das Journal `APA` eines Odoo-18-Unternehmens mit dem Kontenrahmen SKR03. Die Konten und Steuern sind die Vorschläge der SKR03-Hotelvorlage, keine Empfehlung: Lass die Zuordnung für dein Hotel von deinem Steuerberater prüfen.

| Datei | Was sie ist |
|---|---|
| [`ODOO_Buchungen_20260901-20260930_BSP.csv`](ODOO_Buchungen_20260901-20260930_BSP.csv) | Die Importdatei für Odoo für September 2026 in EUR: ein Buchungssatz (Entwurf) pro Geschäftstag aus 24 apaleo-Zeilen. Logis und Frühstück mit der Steuer 7 % (`tax_ust_7_skr03`, Kennzahl 86), Getränke und Minibar mit 19 % (`tax_ust_19_skr03`, Kennzahl 81), Erlöse ohne Umsatzsteuer, eine Stornogebühr zu 7 %, Karten- und Barzahlungen auf Geldtransit und Kasse, eine Anzahlung mit Auflösung und Rückzahlung und eine Rechnung an eine Firma. |
| [`ODOO_Buchungen_20260901-20260930_BSP.protokoll.txt`](ODOO_Buchungen_20260901-20260930_BSP.protokoll.txt) | Das Protokoll, das daneben geschrieben wird: der Block „Import into Odoo Accounting“ zum Vergleich mit dem Odoo-Unternehmen, Summen pro Odoo-Konto, Erlöse und Anzahlungen mit ihrer Steuer pro Steuer und Satz samt Kennzahl, Zahlungen, Forderungen, übersprungene Zeilen, Befunde, die apaleo-Belege pro Zeile der Datei und Prüfsummen. |
| [`mapping-BSP.example.csv`](mapping-BSP.example.csv) | Die Kontenzuordnung, aus der die Datei entstanden ist, mit den Spalten `odoo_account`, `odoo_tax` und `tax_percent`: genau das, was `init-mapping --template skr03-hotel` für Odoo 18 auf dem Kontenplan der Demo schreibt. |

**Bearbeite die Importdatei nicht.** Sie ist UTF-8 ohne Byte-Order-Mark, mit Kommas und LF am Zeilenende, genau so, wie Odoo sie liest. Was jede Spalte bedeutet und woher die Regeln kommen, steht in [odoo-format.md](../odoo-format.md).

## Selbst erzeugen

Die Importdatei und das Protokoll sind das, was ein normaler Export der Demodaten in `examples/demo/` schreibt; ein Test schlägt fehl, sobald sie von dem abweichen, was der aktuelle Code schreibt. So erzeugst du die Datei selbst, ohne apaleo:

```sh
apaleo-odoo export --month 2026-09 --demo
```

Die Demo schreibt nach `./demo-output/` und markiert ihre Ausgabe mit `DEMO`: im Dateinamen (`…_BSP_DEMO.csv`), in den External IDs, am Anfang jeder Referenz und in der ersten Zeile des Protokolls. Importiere eine Demodatei nie in ein echtes Unternehmen.
