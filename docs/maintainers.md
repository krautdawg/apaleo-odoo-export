# Hinweise für Maintainer

## Das Repository ist vorerst privat

Das Repository ist privat. Beschreibung und Themen sollen Hotels und Kanzleien in Deutschland helfen, das Tool zu finden, wenn sie auf GitHub oder in einer Suchmaschine nach „apaleo Odoo Export“, „apaleo Odoo Buchhaltung“ oder „Odoo Hotel Buchungsjournal Import“ suchen, aber **niemand außerhalb kann sie sehen, bis der Maintainer das Repository öffentlich macht**. Bis dahin bringen sie für die Auffindbarkeit nichts.

Die OpenSpec-Änderung o08 hat Beschreibung und Themen gesetzt, ohne die Sichtbarkeit zu ändern:

- Beschreibung: „Kostenloser apaleo Odoo Export: Buchungssätze für die Odoo Buchhaltung aus apaleo, für Hotels in Deutschland (SKR03/SKR04). Open Source, MIT.“
- Themen: `apaleo`, `odoo`, `odoo-accounting`, `apaleo-odoo`, `odoo-import`, `journal-entries`, `buchhaltung`, `hotel`, `hospitality`, `accounting`, `skr03`, `skr04`, `germany`, `deutschland`, `steuerberater`, `open-source`.

Kein Thema nennt ein Vorgängerprojekt oder die Schweiz. Prüfen lässt sich das mit `gh repo view krautdawg/apaleo-odoo-export --json description,repositoryTopics,visibility`.

Keiner der Schritte unter „Vor der Veröffentlichung“ ist bisher erledigt. Jeder einzelne ist die Entscheidung des Maintainers.

## Zusammenführen

Solange das Repository privat ist, gibt es keinen Schutz für Branches (nicht im kostenlosen Tarif), GitHub blockiert also keinen roten Pull Request. Führe nur zusammen, wenn die CI grün ist:

```sh
gh pr checks <number> --watch --fail-fast && gh pr merge <number> --squash
```

## Vor der Veröffentlichung

README und Anleitungen beschreiben seit o08 das Tool für Odoo und Deutschland. Das Repository bleibt trotzdem privat, bis der erste Testimport mit einer Kanzlei bestätigt ist.

In dieser Reihenfolge:

1. [ ] Mach mit einer Kanzlei einen ersten echten Testimport in Odoo (Testdatenbank oder Testunternehmen, Checkliste in [odoo-import.md](odoo-import.md#erster-testimport-checkliste)), einmal in Odoo 19 auf Odoo Online (Testversion) und einmal in Odoo 17 oder 18 Community, und trag beide unten unter [Testimporte](#testimporte) ein, mit der Kanzlei unter „Geprüft von“. Erst dann darf das README den Satz streichen, dass der erste Testimport mit einem Steuerberater noch aussteht.
2. [ ] Zeichne einen Geschäftstag 2026 einer deutschen apaleo-Sandbox (EUR, `Europe/Berlin`) mit `live-smoke` auf, anonymisiere ihn und leg ihn als Testdaten in `test/fixtures/apaleo/live/` ab, neben den Tagen BER und VIE, damit der Export auch über die Konten für Speisen zu 7 % getestet ist.
3. [ ] Lies das README in einem frischen Klon und führe den Schnellstart und `export --month 2026-09 --demo --dry-run` noch einmal aus.
4. [ ] Starte `pnpm test` (mit dem Docs-Test) und prüfe, dass die CI auf `main` grün ist.
5. [ ] Durchsuche die Historie nach allem, was nicht öffentlich werden darf: `git log -p | grep -iE 'secret|password|token'` darf nur Code und Dokumentation zeigen, nie einen Wert. Keine echten Gästedaten in den Testdaten.
6. [ ] Stelle die Sichtbarkeit um: `gh repo edit krautdawg/apaleo-odoo-export --visibility public --accept-visibility-change-consequences`.
7. [ ] Lade ein Vorschaubild (Social Preview) hoch (Settings > General > Social preview).
8. [ ] Entscheide, ob es GitHub Discussions für Fragen geben soll. Schaltest du sie ein, leg eine `config.yml` in `.github/ISSUE_TEMPLATE/` an, die auf die Discussions verweist; bis dahin sind die Vorlagen für Issues der einzige Weg.
9. [ ] Schalte die private Meldung von Sicherheitslücken ein (Settings > Code security), auf die `SECURITY.md` verweist.
10. [ ] Schalte den Schutz für den Branch `main` mit den erforderlichen CI-Prüfungen ein (für öffentliche Repositories kostenlos), damit sich ein roter Pull Request nicht zusammenführen lässt.
11. [ ] Markiere die erste Version mit dem Tag `v0.1.0`: Setze die Version in `package.json`, verschiebe die Einträge unter `## [Unveröffentlicht]` in `CHANGELOG.md` nach `## [0.1.0] - <Datum>`, committe, dann `git tag v0.1.0 && git push origin v0.1.0`. Ein Tag ist nur eine Version des Quellcodes; nichts wird auf npm oder in einer Container-Registry veröffentlicht.
12. [ ] Prüfe, dass das deutsche README auf github.com richtig angezeigt wird (Tabellen, der Link auf `README.en.md` in der zweiten Zeile, die Anker der Überschriften, die Badges) und dass das CI-Badge den Stand von `main` zeigt.

## Testimporte

Jeder echte Import einer Datei des Tools in Odoo: die Läufe des [lokalen Testimports](#lokaler-testimport) des Maintainers und jeder Testimport mit einer Kanzlei. Eine Zeile zählt erst, wenn alle sieben Spalten gefüllt sind; unter „Geprüft von“ steht „Maintainer, lokal“ oder die Kanzlei. Eine Zeile erlaubt README und Dokumentation die technische Aussage für ihre Odoo-Version (zum Beispiel „getestet mit Odoo 18“); ohne Zeile für eine Version schlägt der Docs-Test bei so einer Aussage fehl. Die lokalen Läufe ersetzen nicht den Testimport mit einer Kanzlei: Solange keine Zeile unter „Geprüft von“ eine Kanzlei nennt, sagen README und Dokumentation, dass der erste Testimport mit einem Steuerberater noch aussteht.

Trag unter „Ergebnis“ ein, was ohne Nacharbeit ging und was nicht, ohne Namen der Kanzlei oder des Hotels, wenn sie das nicht möchten. Jede Antwort auf eine offene Frage aus [odoo-format.md](odoo-format.md#offene-fragen), die eine Einstellung oder Korrektur braucht, kommt in eine eigene OpenSpec-Änderung.

| Datum | Odoo-Version | Edition und Hosting | Kontenrahmen | Rundungsmethode | Ergebnis | Geprüft von |
|---|---|---|---|---|---|---|
| 2026-10-24 | 17.0 (`odoo:17.0-20260908`) | Community, lokal (Docker) | SKR03 | Round per Line und Round Globally | 13 Golden-Dateien als Entwürfe importiert, Steuer genau wie im Modell, keine Ausgleichsbuchung; die leere Datei (nur Kopfzeile) lehnt der Import ab; Kasse `1001`, Geldtransit `13601` | Maintainer, lokal |
| 2026-10-24 | 17.0 (`odoo:17.0-20260908`) | Community, lokal (Docker) | SKR04 | Round per Line und Round Globally | wie SKR03; Kasse `1601`, Geldtransit `14601`; Prüfprotokoll nach dem Laden von SKR04 aus | Maintainer, lokal |
| 2026-10-24 | 18.0 (`odoo:18.0-20261015`) | Community, lokal (Docker) | SKR03 | Round per Line und Round Globally | 13 Golden-Dateien als Entwürfe importiert, Steuer genau wie im Modell, keine Ausgleichsbuchung; Kasse `1001`, Geldtransit `1360` | Maintainer, lokal |
| 2026-10-24 | 18.0 (`odoo:18.0-20261015`) | Community, lokal (Docker) | SKR04 | Round per Line und Round Globally | wie SKR03; Kasse `1601`, Geldtransit `1460` | Maintainer, lokal |
| 2026-10-24 | 19.0 (`odoo:19.0-20261015`) | Community, lokal (Docker) | SKR03 | Round per Line und Round per Tax | 13 Golden-Dateien als Entwürfe importiert, Steuer genau wie im Modell, keine Ausgleichsbuchung; kein Kassenjournal mit dem Kontenrahmen, ein neues bekommt `1001`; Geldtransit `1360` | Maintainer, lokal |
| 2026-10-24 | 19.0 (`odoo:19.0-20261015`) | Community, lokal (Docker) | SKR04 | Round per Line und Round per Tax | wie SKR03; neues Kassenjournal `1601`, Geldtransit `1460` | Maintainer, lokal |

Wiederholung im Review von Pull Request #3 (2026-10-24): Alle sechs Läufe mit denselben Images noch einmal, mit denselben Ergebnissen. Dazu, mit Dateien, die der Writer außerhalb der Golden-Dateien erzeugt hat, in allen sechs Läufen ohne Abweichung: ein Tag mit Rechnungs- und Gutschriftseite derselben Steuer in einem Buchungssatz (Umsatz zu 7 % und 19 % im Haben, Nachlass und Storno mit eigener Bezeichnung im Soll), einmal pro Zeile und einmal pro Steuer gerundet; `deposit-7` pro Steuer gerundet; je ein zufälliger Monat pro Rundungsmethode (26 bzw. 28 Buchungssätze, 235 bzw. 257 Zeilen, 8 bzw. 7 Rundungszeilen, Beträge bis 600 €, Umsatz, Nachlässe, Anzahlungen zu 7 % und 19 % mit Auflösung und Rückzahlung, Leertage). Odoos Steuer entsprach in jedem Buchungssatz dem Modell, alle kamen als Entwürfe ohne Ausgleichszeile an. Gegenprobe: Eine von Hand um 0,01 € verfälschte Datei importieren Odoo 17, 18 und 19 (SKR03) ohne Fehlermeldung, mit einer „Automatischen Ausgleichszeile“ über 0,01 € auf dem Zwischenkonto (Odoo 18: `1202`), und das Prüfskript meldet sie.

Wiederholung im Review von Pull Request #4 (2026-10-24): Das Prüfskript importierte die beiden Golden-Dateien des deutschen Monats (`de-month.per-line`, `de-month.per-tax`) vorher gar nicht und meldete trotzdem „ok“: Der Punkt im Dateinamen landete in der External ID, und Odoo las den Teil davor als Modulnamen. Seitdem bereinigt das Skript das Präfix, rundet `de-month.per-tax` pro Steuer, ordnet `1001` dem Kassenkonto der Datenbank zu (SKR04 `1601`) und für SKR04 `1401` → `1200` und `8200` → `4200` (SKR04 `1401` ist Vorsteuer 7 %) und meldet einen Fehler, wenn eine Datei mit Buchungssätzen weniger Buchungssätze ergibt. Lauf mit Odoo 19 (`odoo:19.0-20261015`), SKR03 und SKR04: beide Dateien je 8 Entwürfe, Steuer genau wie im Modell, keine Ausgleichszeile; alle anderen Golden-Dateien wie zuvor.

Antworten auf die offenen Fragen aus [odoo-format.md](odoo-format.md#offene-fragen), in allen sechs Läufen gleich, soweit nicht anders gesagt:

1. Die technischen Spaltennamen werden auch mit deutscher Oberfläche ohne Zuordnung von Hand erkannt, „Test“ besteht in SKR03 und SKR04.
2. Odoo rechnet genau die Steuer des Modells, auch mit der Cent-Zeile (Rundung pro Zeile) und der Zeile auf dem Rundungskonto (Rundung pro Steuer); keine „Automatic Balancing Line“. Die Steuerkennzeichen setzt Odoo selbst (17 und 18 mit Vorzeichen, zum Beispiel `+86_BASE` und `-86_BASE` auf der Gutschriftseite).
4. Die leere Steuerzelle hält SKR04 `4200` und SKR03 `8400` ohne Steuer, obwohl beide eine Standardsteuer haben.
5. Dieselbe Datei über Entwürfen ändert nichts. Über gebuchten Buchungssätzen lehnen Odoo 18 und 19 schon die **unveränderte** Datei ab (schreibgeschützte Felder `date` und `line_ids` eines gebuchten Postens) und erst recht eine geänderte. Odoo 17 nimmt die unveränderte Datei an und ändert nichts; eine **geänderte** Datei nimmt Odoo 17 ohne Fehlermeldung an und ändert den gebuchten Buchungssatz trotzdem nicht. Nach dem Stornieren lehnen alle drei Versionen die geänderte Datei ab (17 wegen der abgestimmten Zeilen). Die Revision 2 kommt nach dem Löschen der Entwürfe und nach dem Stornieren als neue Entwürfe an. Ein erneuter Import über gebuchten Buchungssätzen ist also nie ein Weg, etwas zu korrigieren; dafür gibt es die Revision.
6. `8400` findet auch mit einem Unterkonto `84001` genau `8400` (SKR04: `4400` und `44001`), ohne Warnung.
7. Laut den deutschen Übersetzungen in den Images (`account`, `base_import`, gleich in 17, 18 und 19): Buchhaltung > Buchhaltung > Journalbuchungen, „Datensätze importieren“, „Test“, „Importieren“; Einstellungen > Buchhaltung > Steuern > „Rundungsmethode“ mit „Je Zeile runden“ und „Global runden“ (17, 18) bzw. „Rundung pro Steuer“ (19). Die Ausgleichszeile heißt für eine Benutzerin mit deutscher Oberfläche „Automatische Ausgleichszeile“ (im Testimport gesehen). Bildschirmfotos der Oberfläche gibt es noch nicht.
8. Nie gebuchte Entwürfe lassen sich mit eingeschaltetem Prüfprotokoll löschen.
9. Kasse: SKR03 `1001`, SKR04 `1601` in 17 und 18; Odoo 19 legt mit dem Kontenrahmen kein Kassenjournal an, ein neu angelegtes bekommt `1001` bzw. `1601`. Geldtransit: SKR03 `13601`, SKR04 `14601` in 17, `1360` bzw. `1460` in 18 und 19. Die Vorlagen von o03 übernehmen diese Nummern.
11. Mit nur dem Zielunternehmen im Umschalter landen Konten, Journal und Buchungssätze im Zielunternehmen. Sind zwei Unternehmen mit demselben Kontenrahmen aktiv, warnt Odoo 17 „Mehrere Übereinstimmungen“ für jedes Konto, 18 und 19 finden über das Journal das richtige Unternehmen. Eine Niederlassung (18 und 19) importiert mit den Steuer-IDs des Hauptunternehmens in ihr eigenes Journal, Odoo legt die Steuerzeilen an.

## Lokaler Testimport

Bevor Kontenzuordnung, Demo und Anleitungen auf dem Steuermodell des Odoo-Writers aufbauen, prüft der Maintainer es in echtem Odoo. Das Skript `scripts/odoo-check/run.sh` startet Wegwerf-Datenbanken mit den offiziellen Docker-Images `odoo:17.0`, `odoo:18.0` und `odoo:19.0` (Community, Tags fest in `scripts/odoo-check/docker-compose.yml`) und Postgres, installiert `account` und `l10n_de` mit Deutsch als Sprache und führt `scripts/odoo-check/check.py` mit `odoo shell` im Container aus:

```sh
scripts/odoo-check/run.sh            # Odoo 17, 18 und 19, je SKR03 und SKR04
scripts/odoo-check/run.sh 19 skr04   # eine Version, ein Kontenrahmen
```

Das Skript legt ein deutsches Unternehmen mit dem Kontenrahmen an (wie in der Weboberfläche: erst der automatische Kontenrahmen von Odoo, dann der gewünschte), dazu das Journal `APA` und eine Buchhalterin mit deutscher Oberfläche, die nicht Superuser ist, damit die Regeln für mehrere Unternehmen gelten wie im Browser. Dann importiert es jede Datei aus `test/golden/odoo/` über den Standardimport von Odoo (`base_import`, erst „Test“, dann „Import“) und gibt pro Buchungssatz Status, Steuerzeilen, Steuerkennzeichen, eine etwaige „Automatic Balancing Line“ und den Vergleich mit dem Steuermodell des Tools aus. Danach prüft es die offenen Fragen 5, 6, 8 und 11 aus [odoo-format.md](odoo-format.md#offene-fragen): erneuter Import über Entwürfe, gebuchte und stornierte Buchungssätze, die Revision 2, das Löschen nie gebuchter Entwürfe mit Prüfprotokoll, ein Unterkonto wie `84001` und zwei Unternehmen sowie eine Niederlassung.

Die Golden-Dateien sind für SKR03 und Unternehmen 1 geschrieben. Das Skript passt sie beim Import an: SKR04-Konten und -Steuern für einen SKR04-Lauf, das von Odoo angelegte Geldtransitkonto der Datenbank, ein Rundungskonto ohne Steuer (SKR03 `2700`, SKR04 `4830`), für `1001` das Kassenkonto der Datenbank, für SKR04 außerdem `1401` → `1200` und `8200` → `4200`, für SKR03 `8400` (Standardsteuer 19 %) statt SKR04 `4200` als Konto mit Standardsteuer, die ID des Unternehmens in den Steuer-IDs und pro Datei ein eigenes Präfix der External IDs, damit sich die Dateien nicht gegenseitig aktualisieren.

Das Skript braucht keine API, keinen API-Schlüssel und keine Zugangsdaten; Postgres hat kein Passwort und keinen Port nach außen, Odoo ist nur auf `127.0.0.1` erreichbar. Die Datenbanken liegen im Arbeitsspeicher des Postgres-Containers und sind nach dem Lauf weg. Die CI führt das Skript nicht aus. Die Ergebnisse landen in `scripts/odoo-check/results-<Zeitpunkt>.log` (nicht im Repository) und als Zeile pro Lauf unten unter [Testimporte](#testimporte).

## Später geplant

Nicht Teil von Version 1, in keiner bestimmten Reihenfolge, und alles innerhalb dieses Tools. Jeder Punkt braucht eine eigene OpenSpec-Änderung.

- **Direkte Übertragung in Odoo über die externe API (JSON-2 ab Odoo 19, XML-RPC für 17 und 18), nur Entwürfe**: Das Tool legt die Buchungssätze selbst als Entwürfe in Odoo an, statt eine Importdatei zu schreiben. In Version 1 gibt es das nicht, weil die externe API nur im Odoo-Tarif „Custom“ freigeschaltet ist (nicht in „One App Free“ und „Standard“), weil zwei Protokolle nötig wären (JSON-2 ab Odoo 19, XML-RPC für 17 und 18, und XML-RPC fällt mit Odoo 22 weg), weil das Tool dafür einen API-Schlüssel mit Schreibrechten als Secret bräuchte und weil für jede Odoo-Version zu prüfen wäre, dass Entwürfe ihre Steuerzeilen behalten. Die Importdatei funktioniert dagegen in jedem Tarif, jeder Edition und jeder Version.
- **Kostenstellen über die Kostenrechnung von Odoo**: eine optionale Spalte der Kontenzuordnung mit der Datenbank-ID eines Odoo-Kostenrechnungskontos (analytic account), geschrieben als `line_ids/analytic_distribution`. Nicht in Version 1, weil die Datenbank-ID in jeder Datenbank anders ist und keine Vorlage sie kennen kann, weil ein Hotel ohne Kostenrechnung nichts davon hat und weil erst ein aufgezeichneter Import zeigen muss, wie Odoo die Verteilung auf die Steuerzeilen überträgt. Bestehende Kontenzuordnungen bleiben dabei gültig.
- **Vorlagen für Österreich und die Schweiz**: Hotelvorlagen für die Odoo-Lokalisierungen l10n_at und l10n_ch, mit ihren Steuern und Sätzen. Heute geht das nur mit einer Kontenzuordnung, die du mit deiner Kanzlei von Hand anlegst; die Prüfungen des Tools kennen nur die deutschen Steuern (`W-TAX-UNCHECKED`).
- **Wöchentlicher Rhythmus**: `schedule.cadence` mit einer Datei pro Woche, zwischen Tag und Monat.
- **Gebühren aus Abrechnungsdateien**: die Gebühren und Rückbuchungen (Chargebacks) der Zahlungsdienstleister aus ihren Abrechnungen buchen.
- **E-Mail-Versand**: die Dateien per SMTP an die Kanzlei schicken statt über einen gemeinsamen Ordner.
- **Dauerprozess mit eigenem Zeitplan**: ein Modus, der dauerhaft läuft und eine eigene Uhr hat, statt `schedule --once` aus Cron oder der Compose-Schleife.
- **Überwachung und Alarme**: eine Zustandsprüfung und ein Alarm (Mail oder Webhook), wenn ein geplanter Lauf fehlschlägt.
- **Dependabot**: automatische Updates der Abhängigkeiten für npm-Pakete, GitHub Actions und das Docker-Basis-Image.
- **Veröffentlichung auf npm oder in einer Registry**: das Kommandozeilenprogramm auf npm und ein Container-Image in einer Registry veröffentlichen. Heute ist das Paket mit Absicht `"private": true`, und das Image wird lokal gebaut.
