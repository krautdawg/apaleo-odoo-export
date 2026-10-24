# Das Importformat für Odoo: Buchungssätze als CSV

Diese Seite beschreibt Feld für Feld die Datei, die das Tool für Odoo Buchhaltung schreibt, und warum sie so aussieht. Sie richtet sich an deine Buchhaltung, deinen Steuerberater und an alle, die das Tool weiterentwickeln. Wie du die Werte des Abschnitts `odoo` einstellst, steht in [configuration.md](configuration.md#odoo).

Keine Gewähr, keine Steuerberatung: Lass deine Kontenzuordnung und die ersten Importe von deinem Steuerberater prüfen.

Stand: Die Regeln folgen dem Quellcode von Odoo 17.0, 18.0 und 19.0 und der Odoo-Dokumentation, gelesen am 2026-10-24 (siehe [Quellen](#quellen)), und einem lokalen Testimport des Maintainers in Odoo 17, 18 und 19 Community. Ein erster Testimport mit einem Steuerberater steht noch aus; was der lokale Testimport ergeben hat, steht in [maintainers.md](maintainers.md#testimporte). Wie die Kanzlei die Datei importiert und prüft, steht in [odoo-import.md](odoo-import.md).

## Die Datei auf einen Blick

- **Name:** `ODOO_Buchungen_<JJJJMMTT>-<JJJJMMTT>_<Hotel>.csv` mit dem ersten und dem letzten Tag des Zeitraums, zum Beispiel `ODOO_Buchungen_20260901-20260930_BSP.csv`. Eine Demo-Datei endet auf `_BSP_DEMO.csv`.
- **Inhalt:** ein Buchungssatz (`account.move`, Typ „entry“) pro Hotel und Geschäftstag, im Journal aus `odoo.journal`. Jeder Buchungssatz kommt als **Entwurf** in Odoo an; das Tool bucht nie selbst.
- **Zeichensatz und Trennzeichen:** UTF-8 ohne Byte-Order-Mark, Komma als Trennzeichen, Anführungszeichen (`"`) um jeden Wert mit Komma, Anführungszeichen, Zeilenumbruch oder Leerzeichen am Anfang oder Ende, ein Anführungszeichen im Wert wird verdoppelt. Zeilenende LF, auch nach der letzten Zeile.
- **Zahlen und Daten:** Beträge mit Punkt und genau zwei Nachkommastellen, ohne Tausendertrennzeichen und ohne Vorzeichen (`143.80`), Daten als `JJJJ-MM-TT`. Odoo erkennt Trennzeichen, Anführungszeichen und Dezimalpunkt beim Import selbst.
- **Gleiche Daten, gleiche Datei:** Die Datei enthält keine Uhrzeit. Dieselben Buchungen und dieselbe Konfiguration ergeben immer dieselben Bytes.

Die Datei ist eine CSV-Datei, keine XLSX-Datei: Dafür braucht das Tool keine weitere Bibliothek, und die Testdateien bleiben lesbar.

## Spalten

Die erste Zeile enthält die technischen Feldnamen von Odoo. Sie gelten in jeder Sprache der Oberfläche, deshalb musst du beim Import keine Spalte von Hand zuordnen.

| Spalte | Inhalt | Beispiel |
|---|---|---|
| `id` | External ID des Buchungssatzes, nur in seiner ersten Zeile | `apaleo_c1_BSP_20260914` |
| `ref` | Referenz des Buchungssatzes, nach der du in Odoo filterst | `apaleo BSP 2026-09-14` |
| `date` | Buchungsdatum = Geschäftstag | `2026-09-14` |
| `journal_id` | Kürzel des Journals aus `odoo.journal` oder `properties[].journal` | `APA` |
| `line_ids/id` | External ID der Buchungszeile | `apaleo_c1_BSP_20260914_0002` |
| `line_ids/account_id` | Sachkonto als Kontonummer | `8300` |
| `line_ids/name` | Bezeichnung der Zeile, ohne Gästenamen | `Logis 7 %` |
| `line_ids/debit` | Soll | `0.00` |
| `line_ids/credit` | Haben | `112.15` |
| `line_ids/tax_ids/id` | Odoo-Steuer als External ID, leer ohne Steuer | `account.1_tax_ust_7_skr03` |

Jede Zeile hat genau einen der beiden Beträge Soll und Haben über `0.00`, der andere ist `0.00`. Das Tool schreibt keine Belegnummer (`name`, die vergibt Odoo beim Buchen), keinen Status, keinen Partner, keine Steuerkennzeichen (`tax_tag_ids`) und keine Kostenrechnung (`analytic_distribution`).

## Zeilen eines Buchungssatzes

Odoo liest Buchungszeilen beim Import als „One2many“-Zeilen: Die erste Zeile eines Buchungssatzes trägt die Felder des Buchungssatzes und seine erste Buchungszeile, jede weitere Buchungszeile steht in einer eigenen Zeile, deren erste vier Spalten leer sind.

Ein Tag mit Logis 120,00 € zu 7 %, Getränken 23,80 € zu 19 % und einer Visa-Zahlung von 143,80 €:

```csv
id,ref,date,journal_id,line_ids/id,line_ids/account_id,line_ids/name,line_ids/debit,line_ids/credit,line_ids/tax_ids/id
apaleo_c1_BSP_20260914,apaleo BSP 2026-09-14,2026-09-14,APA,apaleo_c1_BSP_20260914_0001,1360,Zahlung Visa,143.80,0.00,
,,,,apaleo_c1_BSP_20260914_0002,8300,Logis 7 %,0.00,112.15,account.1_tax_ust_7_skr03
,,,,apaleo_c1_BSP_20260914_0003,8400,Getränke 19 %,0.00,20.00,account.1_tax_ust_19_skr03
```

Odoo legt beim Import die Steuerzeilen 7,85 € auf `1771` und 3,80 € auf `1776` selbst an, damit ist der Buchungssatz ausgeglichen.

So entstehen die Zeilen:

- **Saldiert pro Konto, Steuer und Bezeichnung.** Das Tool fasst alle Buchungen eines Tages mit demselben Sachkonto, derselben Steuer und derselben Bezeichnung zu einer Zeile zusammen. Soll und Haben werden verrechnet, der Saldo steht auf seiner Seite. Im Beispiel gleichen sich die Gästeforderungen `1410` (Logis und Getränke im Soll, Zahlung im Haben) aus, deshalb gibt es keine Zeile auf `1410`. Eine Gruppe mit Saldo 0 bekommt keine Zeile; das Protokoll zählt sie.
- **Zahlarten bleiben getrennt.** Weil die Bezeichnung zum Schlüssel gehört, stehen `Zahlung Visa` und `Zahlung Mastercard` auf `1360` in eigenen Zeilen. So passt jede Zeile zu einer Abrechnung des Zahlungsdienstleisters.
- **Ein Nachlass wird mit dem Umsatz verrechnet.** Logis 120,00 € und ein Nachlass von 20,00 € auf Logis, beide zu 7 % auf `8300` mit derselben Bezeichnung, ergeben eine Zeile `8300` im Haben über 93,46 € (112,15 € minus 18,69 €).
- **Reihenfolge:** Buchungssätze nach Datum, die Zeilen eines Buchungssatzes nach Kontonummer (Ziffern als Zahl verglichen), dann Steuer und Bezeichnung. Zeilen aus der Basisanpassung (siehe unten) kommen zuletzt.
- **Bezeichnungen:** Das Tool entfernt Steuerzeichen, macht aus mehreren Leerzeichen, Tabulatoren und Zeilenumbrüchen eines, schneidet Leerzeichen am Rand ab und kürzt auf 128 Zeichen (`N-ODOO-TRUNCATED`). Eine leere Bezeichnung wird durch die Kontonummer ersetzt. Gästenamen kommen nie in die Datei; die apaleo-Belegnummern hinter einer saldierten Zeile stehen im Protokoll, nicht in der Datei.

## External IDs und Referenz

Jeder Buchungssatz und jede Buchungszeile hat eine External ID. Odoo merkt sich diese IDs (mit dem Modul `__import__` davor). Importierst du dieselbe Datei noch einmal, aktualisiert Odoo die eigenen Entwürfe, statt sie doppelt anzulegen.

- **Buchungssatz:** `apaleo_c<odoo.companyId>_<Hotel>_<JJJJMMTT>`, zum Beispiel `apaleo_c1_BSP_20260914`. Die Unternehmens-ID gehört dazu, damit dasselbe Hotel in einem zweiten Unternehmen derselben Datenbank andere IDs bekommt (`apaleo_c3_BSP_20260914`).
- **Buchungszeile:** die ID des Buchungssatzes, ein Unterstrich und eine vierstellige Nummer in Dateireihenfolge, ab `0001`.
- **Referenz:** `apaleo <Hotel> <JJJJ-MM-TT>`. Danach filterst du in Odoo, zum Beispiel alle Buchungssätze eines Hotels mit `apaleo BSP`.
- **Demo-Datei:** `apaleo_c1_BSP_DEMO_20260914` und die Referenz `DEMO apaleo BSP 2026-09-14`, damit importierte Demo-Buchungen sofort auffallen.
- **Hotel-ID:** 1 bis 20 Zeichen aus `A-Z`, `a-z`, `0-9`, `-` und `_`, nicht auf `_DEMO` endend (sonst hätte die Demo-Datei des Hotels ohne diese Endung dieselben External IDs und denselben Dateinamen), sonst `E-ODOO-PROPERTY-ID`.

Was ein zweiter Import derselben Datei bewirkt (so im lokalen Testimport beobachtet, siehe [maintainers.md](maintainers.md#testimporte)):

- über **Entwürfe**: nichts Neues; Odoo findet jeden Buchungssatz und jede Zeile über ihre External ID und schreibt dieselben Werte noch einmal.
- über **gebuchte** Buchungssätze: Odoo 18 und 19 lehnen die ganze Datei ab, auch wenn sie unverändert ist, weil Datum und Zeilen eines gebuchten Buchungssatzes schreibgeschützt sind. Odoo 17 nimmt sie an und ändert nichts, auch dann, wenn die Datei geänderte Beträge enthält, und zwar ohne Fehlermeldung. Importiere eine Datei deshalb nie über gebuchte Buchungssätze, um etwas zu korrigieren: Dafür gibt es die Revision (nächster Abschnitt).
- Eine Datei ohne Buchungssatz (nur die Kopfzeile, ein Zeitraum ohne Buchungen) lehnt der Import von Odoo ab. Sie enthält nichts, was zu importieren wäre.

## Korrekturen: Revisionen („Korrektur N“)

Ändert sich ein Monat nach dem Export (zum Beispiel durch eine späte Buchung in apaleo), schreibt das Tool mit `--overwrite` eine neue Datei. Diese Datei ist die nächste **Revision**: Revision 2 trägt `apaleo_c1_BSP_20260914_r2`, ihre Zeilen `apaleo_c1_BSP_20260914_r2_0001` und so weiter, und die Referenz `apaleo BSP 2026-09-14 (Korrektur 2)`. Die erste Datei eines Zeitraums ist Revision 1 und hat keinen Zusatz.

Die Revision wählt der Export: Die erste Datei eines Zeitraums ist Revision 1; `--overwrite` schreibt eine mehr als die Datei, die sie ersetzt, laut `manifest.json` oder, ohne Manifest, laut der External IDs der vorhandenen Datei. Das Manifest verzeichnet die Revision jeder Datei (`revision`), auch der ersetzten.

Warum neue IDs: Mit l10n_de ist in Odoo meist das Prüfprotokoll (GoBD) eingeschaltet (im lokalen Testimport mit Odoo 17 und SKR04 war es aus). Ein gebuchter Buchungssatz lässt sich dann nicht löschen, nur stornieren, und die Stornierung gibt seine External ID nicht frei. Eine korrigierte Datei mit den alten IDs würde den gebuchten Buchungssatz ändern wollen: Odoo 18 und 19 lehnen die ganze Datei ab, Odoo 17 nimmt sie an und lässt den gebuchten Buchungssatz, wie er war. Über einem Entwurf würde sie zwar importiert, aber Zeilen, die in der neuen Datei fehlen, blieben stehen. Mit neuen IDs legt die korrigierte Datei immer neue Buchungssätze an; der lokale Testimport hat das in allen drei Versionen bestätigt, nach dem Löschen der Entwürfe und nach dem Stornieren.

So ersetzt du einen Monat:

1. Filtere in Odoo die Buchungssätze der früheren Revision nach der Referenz (zum Beispiel `apaleo BSP`) und dem Zeitraum.
2. Lösche ihre **Entwürfe**.
3. **Storniere** ihre gebuchten Buchungssätze (Stornobuchung in Odoo), mit dem Datum des ursprünglichen Buchungssatzes als „Stornodatum“ (Reversal Date) statt des heutigen Datums, das Odoo vorschlägt, damit sich der Monat in seinem eigenen Zeitraum aufhebt ([odoo-import.md](odoo-import.md#einen-monat-ersetzen)).
4. Importiere die neue Datei. Die Buchungssätze der neuen Datei kommen als neue Entwürfe an.

Das Tool liest die Revision einer vorhandenen Datei aus der External ID ihres ersten Buchungssatzes. Welche Revision eine neue Datei bekommt, entscheidet der Export.

## Steuern über die External ID, keine Steuerzeilen

Jede Zeile mit Umsatzsteuer trägt die Odoo-Steuer in `line_ids/tax_ids/id` als External ID und den **Nettobetrag** als Basis. Steuerzeilen schreibt das Tool nie: Odoo legt sie beim Import selbst an, mit dem Steuerkonto und den Kennzeichen für die UStVA-Kennzahlen, und zwar in jeder Version gleich.

- Ein Wert **ohne Punkt** in der Kontenzuordnung ist die ID der Steuer im Kontenrahmen-Template und wird zu `account.<odoo.companyId>_<Wert>`: `tax_ust_7_skr03` wird mit Unternehmen 1 zu `account.1_tax_ust_7_skr03`.
- Ein Wert **mit Punkt** ist schon eine vollständige External ID und bleibt, wie er ist, zum Beispiel `__import__.ust_7_hotel` für eine selbst angelegte Steuer.
- `odoo.companyId` ist die ID des Unternehmens, dem die Steuern gehören. Bei einer Niederlassung (Odoo 18 und 19) ist das das Hauptunternehmen, weil Niederlassungen dessen Steuern nutzen.

Die Umsatzsteuern von l10n_de (dieselben IDs in Odoo 17, 18 und 19):

| SKR03 | SKR04 | Satz | Steuerkonto SKR03 / SKR04 | UStVA |
|---|---|---|---|---|
| `tax_ust_19_skr03` | `tax_ust_19_skr04` | 19 % | `1776` / `3806` | Kz 81 |
| `tax_ust_7_skr03` | `tax_ust_7_skr04` | 7 % | `1771` / `3801` | Kz 86 |

Warum keine Steuerzeilen: Beim Import kann Odoo nur Felder schreiben, die nicht schreibgeschützt sind, und die Verbindung einer Steuerzeile zu ihrer Steuer ist schreibgeschützt. Eine Zeile auf `1776` in der Datei wäre deshalb eine zweite Umsatzsteuer ohne Kennzeichen neben der von Odoo: doppelte Steuer auf dem Konto und eine Ausgleichsbuchung. Das Tool bucht deshalb nie auf die Steuerkonten aus apaleo.

Eine Gutschriftseite gibt es auch: Eine Zeile mit Steuer im **Haben** (Umsatz, erhaltene Anzahlung) ist für Odoo die Rechnungsseite und erhöht die Kennzahl, eine Zeile mit Steuer im **Soll** (Nachlass, Auflösung oder Rückzahlung einer Anzahlung, Forderungsverlust) ist die Gutschriftseite und mindert sie. Beispiel Rückzahlung einer Anzahlung über 23,80 € zu 19 %: `1718` im Soll 20,00 € mit `account.1_tax_ust_19_skr03`, `1360` im Haben 23,80 €.

## Standardsteuern der Konten und die leere Steuerzelle

Manche Konten tragen in Odoo eine Standardsteuer, in l10n_de zum Beispiel SKR03 `8300` und `8400` sowie SKR04 `4200`, `4300` und `4400`. In Odoo 17 und 18 bekommt eine Buchungszeile ohne ausdrückliche Steuer die Standardsteuer ihres Kontos, in Odoo 19 nicht mehr.

Deshalb schreibt das Tool die Spalte `line_ids/tax_ids/id` in **jeder** Zeile, bei einer Zeile ohne Steuer leer. Eine leere Zelle setzt beim Import ausdrücklich „keine Steuer“. Erlöse ohne Umsatzsteuer auf SKR04 `4200` (Standardsteuer 19 %) bleiben so ohne Steuer:

```csv
,,,,apaleo_c1_BSP_20260914_0002,4200,Erlöse ohne USt,0.00,80.00,
```

## Basisanpassung: warum manche Nettobeträge um einen Cent abweichen

Odoo rechnet die Umsatzsteuer eines Buchungssatzes selbst aus dem Nettobetrag jeder Zeile aus, kaufmännisch gerundet (ab 0,5 Cent weg von null). apaleo hat die Steuer dagegen aus dem Bruttobetrag jeder Rechnungszeile gerechnet. Passt Odoos Steuer nicht zum Bruttobetrag, gleicht Odoo den Buchungssatz stillschweigend mit einer „Automatischen Ausgleichszeile“ (Automatic Balancing Line) auf dem Zwischenkonto (suspense account) aus. Das verhindert das Tool so:

- Jeder Bruttobetrag aus apaleo bleibt auf den Gegenkonten (Zahlungen, Forderungen, Anzahlungen) genau erhalten.
- Für jede Zeile mit Steuer (oder bei Rundung pro Steuer für jede Gruppe aus Steuer und Seite) wählt das Tool den Nettobetrag, der zusammen mit Odoos Steuer genau den Bruttobetrag aus apaleo ergibt, und davon den, der apaleos Nettobetrag am nächsten liegt.
- Gibt es keinen solchen Nettobetrag, weil Odoos Rundung über den Bruttobetrag springt (bei 19 % etwa jeder sechste Betrag, bei 7 % etwa jeder fünfzehnte), fehlt genau ein Cent. Ihn bucht das Tool in einer eigenen Zeile und meldet `N-ODOO-ROUNDING-LINE` mit Tag, Konto und Satz.

Die Beispiele:

| Fall | Was das Tool schreibt |
|---|---|
| Logis 120,00 € zu 7 % (apaleo: netto 112,15 €, Steuer 7,85 €) | `8300` Haben 112,15 €; Odoos Steuer 7,85 €, kein Cent fehlt |
| Frühstück 95,00 € zu 7 %, Rundung pro Zeile (apaleo: netto 88,79 €, Steuer 6,21 €) | 88,78 € ergibt 94,99 €, 88,79 € ergibt 95,01 €. Deshalb `8300` Haben 88,78 € und eine zweite Zeile `8300` Haben 0,01 € mit derselben Steuer und der Bezeichnung „… (Rundungsausgleich)“; die Steuer des Cents rundet auf 0,00 €, Odoos Steuer ist 6,21 € |
| Logis 120,00 € und 95,00 € zu 7 % an einem Tag, Rundung pro Steuer | eine Zeile `8300` Haben 200,93 €; Odoos Steuer 14,07 €, apaleos Steuer 14,06 €, Unterschied 0,01 € im Protokoll |
| Umsatz 100,04 € zu 7 %, Rundung pro Steuer (apaleo: netto 93,50 €, Steuer 6,54 €) | `8300` Haben 93,49 € (Steuer 6,54 €) und eine Zeile ohne Steuer auf `odoo.roundingAccount`, zum Beispiel SKR03 `2700` (SKR04 `4830`) Haben 0,01 € „Rundungsausgleich USt 7 %“ |

Bei Rundung pro Steuer hilft eine zweite Zeile mit derselben Steuer nicht, weil Odoo die Steuer der ganzen Gruppe nur einmal rundet; deshalb kommt der Cent dort auf ein Konto ohne Steuer. Verteilt sich eine Gruppe auf mehrere Konten, teilt das Tool ihren Nettobetrag nach apaleos Nettobeträgen auf (Verfahren der größten Reste).

Die Folge: Odoos Umsatzsteuer kann von apaleos Umsatzsteuer um einige Cent pro Monat abweichen. Das Protokoll zeigt beide pro Satz und Tag und den Unterschied. Ob dein Steuerberater diesen Unterschied hinnimmt (Steuer laut Rechnung in apaleo, Steuer laut UStVA in Odoo), entscheidet er; das ist offene Frage 3 unten.

## Die Rundungsmethode in Odoo

Die Steuer rundet Odoo nach der Einstellung des Unternehmens unter Einstellungen > Buchhaltung > Steuern > Rundungsmethode (Settings > Accounting > Taxes > Rounding Method):

| `odoo.taxRounding` | Odoo 17 und 18 | Odoo 19 | Standard für neue Unternehmen |
|---|---|---|---|
| `per_line` | Round per Line | Round per Line | Odoo 17 und 18 |
| `per_tax` | Round Globally | Round per Tax | Odoo 19 |

In der deutschen Oberfläche heißen die Einträge „Je Zeile runden“ (Round per Line), in Odoo 17 und 18 „Global runden“ (Round Globally) und in Odoo 19 „Rundung pro Steuer“ (Round per Tax). `odoo.taxRounding` folgt ohne Angabe dem Standard von `odoo.version`. Eine Datenbank, die von einer älteren Version aktualisiert wurde, behält aber ihre alte Einstellung; vergleiche sie deshalb vor dem ersten Import. Mit `per_tax` brauchst du `odoo.roundingAccount`, ein Konto ohne Steuer (auch ohne Standardsteuer) für den Rundungscent. Das Protokoll und `doctor` nennen die erwartete Einstellung.

## Prüfungen vor dem Schreiben

Bevor eine Datei geschrieben wird, prüft das Tool jede Buchung und jeden Buchungssatz und meldet alle Fehler auf einmal. Bei einem Fehler entsteht keine Datei. Jeder Fehler nennt Tag und Konten, nie einen Gästenamen.

- Kontonummern nach der Regel von Odoo (1 bis 64 Zeichen aus `A-Z`, `a-z`, `0-9` und `.`), das Journalkürzel (1 bis 5 Zeichen), Steuer-IDs, Beträge, Sätze und Daten: `E-ODOO-ACCOUNT`, `E-ODOO-JOURNAL`, `E-ODOO-TAX-REF`, `E-ODOO-AMOUNT`, `E-ODOO-RATE`, `E-ODOO-DATE`, `E-ODOO-SAME-ACCOUNT`.
- Nach der Basisanpassung rechnet das Tool jeden Buchungssatz mit Odoos eigener Formel nach: `E-ODOO-UNBALANCED`, wenn Odoo eine Ausgleichsbuchung anlegen würde, `E-ODOO-GROSS`, wenn eine Steuergruppe ihren Bruttobetrag nicht erreicht, `E-ODOO-VAT-FIT`, wenn Odoos Steuer weiter von apaleos Steuer abweicht, als die Anpassung sie verschieben kann.
- `E-ODOO-ROUNDING-ACCOUNT`, wenn bei Rundung pro Steuer ein Cent fehlt und `odoo.roundingAccount` nicht gesetzt ist oder ein Konto mit Steuer ist.

Ursachen und Lösungen aller Codes: [troubleshooting.md](troubleshooting.md#odoo-datei-buchungssätze).

## Import in Odoo und Prüfung danach

Kurz, für den ersten Import (ausführlich mit Vorbereitung, Meldungen und Rückgängigmachen in [odoo-import.md](odoo-import.md)):

1. Lass im Unternehmensumschalter nur das Zielunternehmen aktiv. Odoo sucht Konten und Journale in allen aktiven Unternehmen; sind zwei Unternehmen mit demselben Kontenrahmen aktiv, warnt Odoo 17 beim Import „Mehrere Übereinstimmungen“ für jedes Konto.
2. Buchhaltung > Buchhaltung > Journalbuchungen > Zahnrad > Datensätze importieren (Accounting > Accounting > Journal Entries > gear > Import records), Datei hochladen, „Test“, dann „Importieren“ (Import).
3. Prüfe danach: Alle Buchungssätze sind Entwürfe mit der Referenz `apaleo <Hotel> <Datum>`, auf dem Zwischenkonto steht keine „Automatische Ausgleichszeile“ (Automatic Balancing Line), Odoos Steuer pro Satz entspricht dem Protokoll. Dann buchen.

Das Protokoll neben jeder Datei fasst diese Schritte mit den Werten der Datei zusammen (Revision, Anzahl der Buchungssätze und Zeilen, Unternehmen, Journal, Währung, Rundungsmethode, Steuern mit Satz und Kennzahl, Rundungszeilen).

## Offene Fragen

Diese Fragen beantwortet erst ein Import in echtes Odoo. Die technischen Fragen 1, 2, 4, 5, 6, 8, 9 und 11 hat der [lokale Testimport](maintainers.md#lokaler-testimport) des Maintainers am 2026-10-24 in Odoo 17, 18 und 19 Community mit SKR03 und SKR04 beantwortet; die Antworten stehen in [maintainers.md](maintainers.md#testimporte). Kurz: Odoo rechnet genau die Steuer des Modells, ohne Ausgleichsbuchung, die leere Steuerzelle wirkt, und die Revision legt neue Buchungssätze an. Frage 7 beantworten die deutschen Übersetzungen, die Odoo mitbringt (siehe ebenda). Die Fragen 3 und 10 brauchen einen Steuerberater oder apaleo und bleiben offen; alle Fragen prüft der erste Testimport mit einer Kanzlei noch einmal.

1. Akzeptiert der Import die technischen Spaltennamen (`line_ids/tax_ids/id` und die anderen `line_ids/…`) auch in der deutschen Oberfläche, und besteht „Test“ auf einer frischen Datenbank mit SKR03 und mit SKR04?
2. Rechnet Odoo genau die erwartete Steuer, ohne „Automatic Balancing Line“, bei Rundung pro Zeile und pro Steuer, auch mit der Cent-Zeile und der Zeile auf dem Rundungskonto?
3. Nimmt der Steuerberater hin, dass Odoos Umsatzsteuer (aus dem angepassten Nettobetrag) um einige Cent pro Monat von apaleos Umsatzsteuer abweicht?
4. Hält eine leere Steuerzelle eine Zeile auf SKR03 `8200` oder SKR04 `4200` in Odoo 17 und 18 ohne Steuer?
5. Erneuter Import: Ändert dieselbe Datei über Entwürfen und über gebuchten Buchungssätzen nichts, lehnt Odoo eine geänderte Datei mit denselben IDs über einem gebuchten (auch stornierten) Buchungssatz ab, und kommt die Revision 2 nach dem Löschen der Entwürfe bzw. dem Stornieren als neue Buchungssätze an?
6. Findet `8400` in Odoo 19 genau ein Konto, wenn es Unterkonten wie `84001` gibt?
7. Wie heißen Menü und Schaltflächen des Imports in der deutschen Oberfläche?
8. Verhindert das Prüfprotokoll das Löschen von Entwürfen, die nie gebucht waren? (Erwartet: nein.)
9. Welche Kontonummern haben das Kassenkonto und das Geldtransitkonto, die Odoo beim Einrichten anlegt, auf einer frischen Datenbank in Odoo 17, 18 und 19?
10. Wie heißen die Steuerarten von apaleo bei einem deutschen Hotel, und stimmen die Konten für Speisen zu 7 % an einem Tag 2026?
11. Finden Konten und Journal bei zwei Unternehmen in der Datenbank nur das aktive Zielunternehmen, und lassen sich bei einer Niederlassung die Steuer-IDs des Hauptunternehmens importieren?

## Quellen

Geprüft am 2026-10-24.

- Odoo-Quellcode, `github.com/odoo/odoo`, Branches 17.0, 18.0 und 19.0: `addons/account/models/account_move.py` (Steuerzeilen im „auto tax mode“, Ausgleichsbuchung, schreibgeschützter Status), `addons/account/models/account_move_line.py` (Gutschriftseite, Standardsteuern der Konten, Schutz gebuchter Zeilen), `addons/account/models/account_tax.py` (Rundung pro Zeile und pro Steuer), `addons/account/models/chart_template.py` (External IDs `account.<Unternehmen>_<Template-ID>`), `addons/account/models/account_account.py` (Suche nach Kontonummern), `addons/base_import/models/base_import.py` (nur beschreibbare Felder), `odoo/addons/base/models/ir_fields.py` (One2many-Zeilen, External IDs, leere Zellen), `odoo/tools/float_utils.py` (Rundung weg von null), `addons/l10n_de/data/template/account.tax-de_skr03.csv` und `account.tax-de_skr04.csv`, `addons/l10n_de/models/template_de_skr03.py` und `template_de_skr04.py`. Beispiel: <https://github.com/odoo/odoo/blob/19.0/addons/account/models/account_move.py>
- Odoo-Dokumentation 19.0, „Export and import data“: <https://www.odoo.com/documentation/19.0/applications/essentials/export_import_data.html>
- Odoo-Dokumentation 19.0, „Germany“ (SKR03 und SKR04, Prüfprotokoll nach GoBD): <https://www.odoo.com/documentation/19.0/applications/finance/fiscal_localizations/germany.html>
- Odoo-Dokumentation 19.0, „Taxes“ und „Tax computation“: <https://www.odoo.com/documentation/19.0/applications/finance/accounting/taxes.html>
- UStG § 12 Abs. 2 Nr. 11 (Beherbergung 7 %), § 13 Abs. 1 Nr. 1 Buchst. a (Anzahlungen), § 17 (Forderungsverlust): <https://www.gesetze-im-internet.de/ustg_1980/>
- Die Planungsnotizen mit allen Dateien und Zeilen: `openspec/research/o-target.md` im Repository.
