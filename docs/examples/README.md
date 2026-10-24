# Beispielausgabe: «Hotel Beispiel»

Das schreibt das Tool, noch bevor jemand eine apaleo-App anlegt. Alles hier ist erfunden: das Hotel «Hotel Beispiel» (`BSP`) in Luzern, die Reservationen und die Beträge. Hinter den Daten steht kein echtes Hotel und kein echter Gast. Dein Treuhänder kann damit die Ausgabe prüfen, bevor jemand etwas einrichtet.

Das Hotel bucht in CHF (Zeitzone `Europe/Zurich`) in den Mandanten `7777`, die Nummer des Mustermandanten in den Beispielen von AbaConnect. Die Konten und MWST-Codes sind die Vorschläge der KMU-Vorlage, keine Empfehlung: Lass die Zuordnung für dein Hotel von deinem Treuhänder prüfen.

| Datei | Was sie ist |
|---|---|
| [`ABACUS_Buchungen_20260901-20260930_BSP.xml`](ABACUS_Buchungen_20260901-20260930_BSP.xml) | Die AbaConnect-Datei «XML Buchungen» für September 2026 in CHF: 21 Einzelbuchungen aus 26 apaleo-Zeilen. Beherbergung mit Frühstück und Halbpension zum Sondersatz 3,8 % (MWST-Code `313`), Speisen, Getränke und Minibar zum Normalsatz 8,1 % (`311`), ein Take-away zum reduzierten Satz 2,6 % (`312`), Kurtaxe als durchlaufender Posten, eine Annullation ohne MWST, Twint-, Karten- und Barzahlungen, eine Anzahlung mit Auflösung und Rückzahlung, eine Rechnung an eine Firma auf die Debitoren und ein Debitorenverlust mit MWST-Korrektur. |
| [`ABACUS_Buchungen_20260901-20260930_BSP.protokoll.txt`](ABACUS_Buchungen_20260901-20260930_BSP.protokoll.txt) | Das Protokoll, das daneben geschrieben wird: der Block «Import into Abacus FIBU» zum Vergleich mit dem Mandanten (mit der Journalsumme), Summen pro Abacus-Konto, Erlöse, Anzahlungen und Debitorenverluste mit ihrer MWST pro MWST-Code und Satz samt der Ziffer der MWST-Abrechnung (303, 313, 343), Kurtaxe, Zahlungen, Anzahlungen, Debitoren, übersprungene Zeilen, Befunde und Prüfsummen. |
| [`mapping-BSP.example.csv`](mapping-BSP.example.csv) | Die Kontenzuordnung, aus der die Datei entstanden ist, mit den Spalten `abacus_account`, `mwst_code` und `mwst_percent`: genau das, was `init-mapping --template kmu-hotel` auf dem Kontenplan der Demo schreibt. Nur die Kurtaxe-Zeile ist ausgefüllt, als durchlaufender Posten auf `2210` ohne MWST-Code. |

**Bearbeite die Abacus-Datei nicht.** Sie ist UTF-8 ohne Byte-Order-Mark, mit LF am Zeilenende, genau so, wie Abacus sie liest. Zum Ansehen nimm einen Texteditor oder einen Browser. Was jedes Feld bedeutet und woher die Regeln kommen, steht in [abacus-format.md](../abacus-format.md).

## Selbst erzeugen

Die Abacus-Datei und das Protokoll sind das, was ein normaler Export der Demodaten in `examples/demo/` schreibt; ein Test schlägt fehl, sobald sie von dem abweichen, was der aktuelle Code schreibt. So erzeugst du die Datei selbst, ohne apaleo:

```sh
apaleo-abacus export --month 2026-09 --demo
```

Die Demo schreibt nach `./demo-output/` und markiert ihre Ausgabe mit `DEMO`: im Dateinamen (`…_BSP_DEMO.xml`), am Anfang jedes `Text1` und in der ersten Zeile des Protokolls. Sonst ist ihre Datei gleich wie die hier. Importiere eine Demodatei nie in einen echten Mandanten.
