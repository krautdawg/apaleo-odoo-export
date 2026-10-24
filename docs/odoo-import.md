# Erster Import in Odoo: Anleitung für Kanzlei und Buchhaltung

Für deinen Steuerberater oder deine Buchhaltung: So kommt die Datei des Tools in Odoo Buchhaltung, und das prüfst du vor und nach dem ersten Import. Was in der Datei steht und warum, beschreibt [odoo-format.md](odoo-format.md); wie du die Werte des Abschnitts `odoo` einstellst, [configuration.md](configuration.md#odoo).

Keine Gewähr, keine Steuerberatung: Lass deine Kontenzuordnung von deinem Steuerberater prüfen, ebenso die ersten Importe in Odoo.

Die Menünamen stehen so, wie Odoo sie in der deutschen Oberfläche zeigt, mit der englischen Bezeichnung in Klammern, wo sie sich unterscheidet. Grundlage sind die deutschen Übersetzungen von Odoo 17, 18 und 19 und ein lokaler Testimport des Maintainers in Odoo 17, 18 und 19 Community mit SKR03 und SKR04 ([Testimporte](maintainers.md#testimporte)). Ein erster Testimport mit einem Steuerberater steht noch aus.

## Vorbereitung

Einmal pro Odoo-Unternehmen, vor dem ersten Import:

1. **Kontenrahmen.** Das Unternehmen nutzt die deutsche Lokalisierung (l10n_de) mit SKR03 oder SKR04, und die Kontenzuordnung ist aus der passenden Vorlage entstanden (`init-mapping --template skr03-hotel` oder `skr04-hotel`). Die Kontonummern der beiden Kontenrahmen passen nicht zueinander: SKR04 `2700` ist ein ganz anderes Konto als SKR03 `2700`.
2. **Journal.** Leg unter Buchhaltung > Konfiguration > Journale (Accounting > Configuration > Journals) ein eigenes Journal vom Typ „Sonstige“ (Miscellaneous) an. Sein Kürzel ist der Wert von `odoo.journal` in der Konfiguration, zum Beispiel `APA`, höchstens 5 Zeichen. Ein eigenes Journal hält die Buchungssätze aus apaleo von allem anderen getrennt.
3. **Steuern.** Jede Steuer der Kontenzuordnung (Spalte `odoo_tax`) muss es im Unternehmen geben. Die Umsatzsteuern von l10n_de (`tax_ust_19_skr03`, `tax_ust_7_skr03` und dieselben für SKR04) legt Odoo mit dem Kontenrahmen an. Die External ID einer Steuer siehst du so:
   - im Entwicklermodus (Einstellungen > Entwicklermodus aktivieren; Settings > Activate the developer mode): Buchhaltung > Konfiguration > Steuern (Accounting > Configuration > Taxes), Steuer öffnen, im Entwicklermenü „Metadaten anzeigen“ (View Metadata), oder
   - beim Export der Steuern: in der Liste der Steuern alle markieren, Aktion > Exportieren (Action > Export) und die Spalte „External ID“ wählen.
   Die Datei schreibt `account.1_tax_ust_7_skr03` für die Vorlagen-ID `tax_ust_7_skr03` und das Unternehmen 1. Steht dort in deiner Datenbank eine andere Zahl, passt `odoo.companyId` nicht.
4. **Unternehmens-ID.** `odoo.companyId` ist die Datenbank-ID des Unternehmens, dem die Steuern gehören. Du siehst sie im Entwicklermodus in der Adresse, wenn du das Unternehmen unter Einstellungen > Benutzer & Unternehmen > Unternehmen (Settings > Users & Companies > Companies) öffnest. Bei einer Niederlassung (Odoo 18 und 19) ist es die ID des Hauptunternehmens, denn Niederlassungen nutzen dessen Steuern; das Journal der Niederlassung entscheidet, in welches Unternehmen die Buchungssätze kommen.
5. **Rundungsmethode.** Vergleiche Einstellungen > Buchhaltung > Steuern > Rundungsmethode (Settings > Accounting > Taxes > Rounding Method) mit `odoo.taxRounding`: „Je Zeile runden“ (Round per Line) ist `per_line`, „Global runden“ (Round Globally, Odoo 17 und 18) und „Rundung pro Steuer“ (Round per Tax, Odoo 19) sind `per_tax`. Ein neues Unternehmen rundet in Odoo 17 und 18 je Zeile und in Odoo 19 pro Steuer; eine aktualisierte Datenbank behält ihre alte Einstellung. Passen die beiden nicht zusammen, legt Odoo eine „Automatische Ausgleichszeile“ (Automatic Balancing Line) an. `apaleo-odoo doctor` und das Protokoll nennen die erwartete Einstellung.
6. **Kasse und Geldtransit.** Diese beiden Konten stehen nicht im Kontenrahmen von Odoo, Odoo legt sie beim Einrichten des Unternehmens an. Schlag ihre Nummern unter Buchhaltung > Konfiguration > Kontenplan (Accounting > Configuration > Chart of Accounts) nach: das Konto des Kassenjournals (Typ „Bargeld“, Cash) und das Liquiditätstransferkonto für interne Überweisungen. In einer frischen Datenbank heißen sie:

   | | Kasse | Geldtransit (Liquiditätstransferkonto) |
   |---|---|---|
   | SKR03, Odoo 18 und 19 | `1001` | `1360` |
   | SKR03, Odoo 17 | `1001` | `13601` |
   | SKR04, Odoo 18 und 19 | `1601` | `1460` |
   | SKR04, Odoo 17 | `1601` | `14601` |

   Odoo 19 legt mit dem Kontenrahmen kein Kassenjournal an; ein neu angelegtes Kassenjournal bekommt `1001` (SKR04 `1601`). Weichen die Nummern in deiner Datenbank ab, trag sie in der Kontenzuordnung in den Zeilen für Zahlungen ein ([mapping-guide.md](mapping-guide.md#zahlungen-kasse-und-geldtransit)). `mapping check` erinnert daran mit `N-GENERATED-ACCOUNT`.
7. **Rechte in Community.** In Odoo Community braucht die Person, die importiert, das Recht „Show Full Accounting Features“ (im Entwicklermodus unter Einstellungen > Benutzer & Unternehmen > Benutzer, bei den technischen Rechten des Benutzers). Ohne dieses Recht zeigt Odoo die Liste der Journalbuchungen nicht. In Enterprise reicht die Rolle Buchhalter.

## Datei importieren

1. **Nur das Zielunternehmen aktiv.** Lass im Unternehmensumschalter oben rechts nur das Unternehmen aktiv, in das die Datei gehört. Odoo sucht Konten und Journale in allen aktiven Unternehmen, Odoo 19 dazu Konten, deren Nummer mit dem Wert beginnt oder deren Beschreibung ihn enthält. Sind zwei Unternehmen mit demselben Kontenrahmen aktiv, findet Odoo jedes Konto zweimal.
2. Öffne Buchhaltung > Buchhaltung > Journalbuchungen (Accounting > Accounting > Journal Entries), dann Zahnrad > Datensätze importieren (gear > Import records).
3. Lade die CSV-Datei hoch, zum Beispiel `ODOO_Buchungen_20260901-20260930_BSP.csv`. Öffne und speichere sie vorher nicht in Excel oder einem anderen Programm.
4. Prüf die erkannte Formatierung: Kodierung UTF-8, Trennzeichen Komma, Anführungszeichen `"`, Dezimaltrennzeichen Punkt, Datumsformat `JJJJ-MM-TT`. Odoo erkennt die Spalten an ihren technischen Namen (`line_ids/account_id` und so weiter); eine Zuordnung von Hand ist nicht nötig.
5. Klick auf „Test“. Odoo prüft die ganze Datei und schreibt noch nichts.
6. Ist der Test ohne Fehler, klick auf „Importieren“ (Import).

Meldungen beim „Test“:

| Meldung | Bedeutung | Was du tust |
|---|---|---|
| „No matching record found for name …“ in der Spalte Konto (in der deutschen Oberfläche übersetzt) | Odoo findet ein Konto der Datei nicht im aktiven Unternehmen. Meist sind es Kasse oder Geldtransit mit einer anderen Nummer, ein Konto des anderen Kontenrahmens oder das falsche aktive Unternehmen. | Schlag die Nummer im Kontenplan nach, korrigiere die Kontenzuordnung und exportiere noch einmal (siehe [Einen Monat ersetzen](#einen-monat-ersetzen), solange nichts importiert ist, reicht `--overwrite`). |
| dieselbe Meldung in der Spalte Journal | Kein Journal mit dem Kürzel aus `odoo.journal` im aktiven Unternehmen. | Leg das Journal an oder korrigiere `odoo.journal` bzw. `properties[].journal`. |
| dieselbe Meldung in der Spalte Steuern, oder ein Fehler zu einer External ID `account.<Zahl>_…` | Die Steuer gibt es mit dieser External ID nicht, meist weil `odoo.companyId` nicht die ID des Unternehmens ist, dem die Steuern gehören. | Prüf die External ID der Steuer (Vorbereitung, Schritt 3) und `odoo.companyId`. |
| „Found multiple matches …“ („Mehrere Übereinstimmungen“) | Odoo hat ein Konto oder Journal in mehr als einem aktiven Unternehmen gefunden und nimmt den ersten Treffer. | Brich ab, lass nur das Zielunternehmen aktiv und teste noch einmal. |

Eine Datei, die nur die Kopfzeile enthält (ein Zeitraum ohne Buchungen), lehnt Odoo ab: Es gibt nichts zu importieren.

## Nach dem Import prüfen

Vergleiche das Ergebnis mit dem Protokoll, das neben der Datei liegt (`….protokoll.txt`, Block „Import into Odoo Accounting“):

- Alle Buchungssätze sind **Entwürfe**, einer pro Geschäftstag, mit der Referenz `apaleo <Hotel> <Datum>`, zum Beispiel `apaleo BSP 2026-09-14`. Filtere die Liste nach `apaleo BSP`; die Anzahl steht im Protokoll unter „Entries“.
- Kein Buchungssatz hat eine „Automatische Ausgleichszeile“ (Automatic Balancing Line) auf dem Zwischenkonto. Gibt es eine, passen meist Rundungsmethode und `odoo.taxRounding` nicht zusammen.
- Odoos Umsatzsteuer pro Steuersatz und UStVA-Kennzahl (Kz 81 für 19 %, Kz 86 für 7 %) entspricht dem Protokoll („Base and VAT per tax“). Dass sie um wenige Cent von apaleos Steuer pro Zeile abweicht, steht dort ebenfalls; das ist die Rundung, kein Fehler.
- Die Salden der Gästeforderungen (SKR03 `1410`, SKR04 `1210`) und des Geldtransitkontos entsprechen dem Protokoll („Totals per Odoo account“ und „Payments per clearing account“).

Stimmt alles, buche die Entwürfe. Das Tool bucht nie selbst.

## Dieselbe Datei noch einmal importieren

Jeder Buchungssatz und jede Zeile der Datei hat eine External ID. Importierst du dieselbe Datei noch einmal, findet Odoo die eigenen Entwürfe über diese IDs und ändert nichts; es entstehen keine doppelten Buchungssätze.

Importiere eine Datei aber nie über **gebuchte** Buchungssätze: Odoo 18 und 19 lehnen dann die ganze Datei ab, auch unverändert, und Odoo 17 nimmt sie ohne Meldung an und ändert nichts. Für eine Korrektur gibt es die Revision (nächster Abschnitt).

## Einen Monat ersetzen

Kommt nach dem Export eine Nachbuchung in apaleo, schreibt das Tool den Monat mit `export --overwrite` neu ([export.md](export.md#noch-einmal-exportieren)). Die neue Datei ist die nächste **Revision**: Die Buchungssätze darin haben neue External IDs mit `_r2`, `_r3` und so weiter (zum Beispiel `apaleo_c1_BSP_20260914_r2`) und die Referenz mit dem Zusatz „(Korrektur N)“, zum Beispiel `apaleo BSP 2026-09-14 (Korrektur 2)`. Einzelheiten: [odoo-format.md](odoo-format.md#korrekturen-revisionen-korrektur-n).

Das Tool wählt die Revision selbst: Es liest sie aus dem Manifest oder, ohne Manifest, aus der vorhandenen Datei und schreibt mit `--overwrite` die nächste. Auch eine Datei für Tage, deren frühere Datei du verschoben oder gelöscht hast, bekommt die nächste Revision; lösch das Manifest deshalb nicht. Das Protokoll der neuen Datei nennt sie in der Zeile `Revision:` des Importblocks.

So ersetzt du den Monat:

1. Filtere die Buchungssätze der früheren Revision nach ihrer Referenz (zum Beispiel `apaleo BSP`) und dem Zeitraum. Die früheren haben keinen Zusatz oder eine kleinere Korrektur-Nummer als die neue Datei.
2. **Lösche** ihre Entwürfe.
3. **Storniere** ihre gebuchten Buchungssätze (Schaltfläche „Stornobuchung“, Reverse Entry, im Fenster dann „Stornieren“, Reverse). Löschen geht nicht: l10n_de schaltet das Prüfprotokoll nach GoBD ein, und dann lässt sich ein gebuchter Buchungssatz nicht mehr löschen. Die Stornierung behält die External IDs der alten Revision; deshalb trägt die neue Datei neue.

   **Setz das „Stornodatum“ (Reversal Date) auf das Datum des ursprünglichen Buchungssatzes.** Odoo schlägt das heutige Datum vor. Stornierst du im Oktober einen gebuchten September mit diesem Vorschlag, landet die Stornierung im Oktober, die neue Datei aber mit den Geschäftstagen im September: Der September enthält dann beide Revisionen, seine Umsätze und seine Umsatzsteuer (Kz 81 und 86) zählen doppelt, und der Oktober hat eine negative Kopie. Odoo meldet dabei keinen Fehler und legt keine Ausgleichszeile an. Markierst du mehrere Buchungssätze auf einmal, gilt ein Stornodatum für alle; storniere deshalb jeden Tag einzeln mit seinem Datum, oder entscheide mit deiner Kanzlei, ob ein Datum im selben Monat genügt, damit sich der Monat in seinem eigenen Zeitraum aufhebt. Ist die UStVA für diesen Monat schon abgegeben oder der Zeitraum gesperrt, entscheidet deine Kanzlei über das Datum und eine berichtigte UStVA.
4. Importiere die neue Datei wie oben. Die Buchungssätze darin kommen als neue Entwürfe an, neben den stornierten der früheren Revision.

Importiere die neue Datei nie, bevor die Buchungssätze der früheren Revision gelöscht oder storniert sind, sonst stehen die Umsätze des Monats doppelt in Odoo.

## Eine Datei rückgängig machen

Filtere nach der Referenz der Datei (`apaleo <Hotel>` und der Zeitraum, bei einer Revision mit „(Korrektur N)“). Lösche die Entwürfe; nie gebuchte Entwürfe lassen sich auch mit Prüfprotokoll löschen. Storniere die gebuchten Buchungssätze, jeden mit dem Datum des ursprünglichen Buchungssatzes als „Stornodatum“ (Reversal Date), nicht mit dem heutigen Datum, das Odoo vorschlägt; sonst steht die Stornierung in einem anderen Monat und einer anderen UStVA als der Umsatz ([Einen Monat ersetzen](#einen-monat-ersetzen), Schritt 3). Ist die UStVA des Monats schon abgegeben, entscheidet deine Kanzlei über das Datum und eine berichtigte UStVA.

## Fragen für die Kanzlei

- **Ist-Versteuerung.** Die Datei bucht die Umsatzsteuer mit dem Geschäftstag, also nach vereinbarten Entgelten (Soll-Versteuerung); Anzahlungen tragen ihre Steuer bei Erhalt. Versteuert das Hotel nach vereinnahmten Entgelten (Ist-Versteuerung) oder nutzt das Odoo-Unternehmen Steuern auf Zahlungsbasis (Cash Basis), klärt deine Kanzlei, ob und wie die Buchungssätze dazu passen. Das Tool stellt nichts davon ein.
- **Abweichung zu apaleo.** Odoo rechnet die Umsatzsteuer selbst aus den Nettobeträgen; sie kann um wenige Cent pro Monat von apaleos Steuer pro Zeile abweichen. Das Protokoll zeigt den Unterschied pro Satz.

## Erster Testimport: Checkliste

Diese Fragen aus der Recherche beantwortet der erste Testimport mit einer Kanzlei. Die technischen Fragen hat der lokale Testimport des Maintainers schon beantwortet ([Testimporte](maintainers.md#testimporte)); die Kanzlei prüft sie in ihrer eigenen Datenbank noch einmal. Trag jede Antwort mit Datum, Odoo-Version, Edition und Hosting, Kontenrahmen, Rundungsmethode, Ergebnis und „Geprüft von“ unter [Testimporte](maintainers.md#testimporte) ein.

- [ ] Erkennt der Import die technischen Spaltennamen in der deutschen Oberfläche, und besteht „Test“ mit SKR03 bzw. SKR04?
- [ ] Rechnet Odoo genau die Steuer aus dem Protokoll, ohne „Automatische Ausgleichszeile“, mit der Rundungsmethode des Unternehmens, auch mit den Rundungszeilen?
- [ ] Nimmt die Kanzlei hin, dass Odoos Umsatzsteuer um wenige Cent pro Monat von apaleos Steuer pro Zeile abweicht?
- [ ] Bleibt eine Zeile mit leerer Steuerzelle auf einem Konto mit Standardsteuer (SKR03 `8400`, SKR04 `4200`) ohne Steuer?
- [ ] Ändert derselbe Import über Entwürfen nichts, und kommt die Revision 2 nach dem Löschen der Entwürfe bzw. dem Stornieren als neue Entwürfe an?
- [ ] Findet jede Kontonummer genau ein Konto, auch wenn es Unterkonten gibt (zum Beispiel `84001` neben `8400`)?
- [ ] Stimmen Menü und Schaltflächen dieser Anleitung mit der Oberfläche überein?
- [ ] Lassen sich nie gebuchte Entwürfe mit eingeschaltetem Prüfprotokoll löschen?
- [ ] Trägt die Stornobuchung das „Stornodatum“ des ursprünglichen Buchungssatzes, sodass sich der Monat mit der Revision in seinem eigenen Zeitraum und in seiner UStVA (Kz 81 und 86) aufhebt?
- [ ] Welche Nummern haben Kasse und Geldtransit in der Datenbank der Kanzlei?
- [ ] Heißen die Steuerarten von apaleo beim Hotel so wie in der Kontenzuordnung, und stimmen die Konten für Speisen zu 7 % an einem Tag 2026?
- [ ] Landen Konten, Journal und Buchungssätze bei mehreren Unternehmen im Zielunternehmen, und importiert eine Niederlassung mit den Steuer-IDs des Hauptunternehmens?
