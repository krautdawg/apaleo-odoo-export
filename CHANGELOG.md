# Änderungsprotokoll

Alle wichtigen Änderungen an apaleo-odoo-export stehen in dieser Datei.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), und dieses Projekt hält sich an die [Semantische Versionierung](https://semver.org/lang/de/spec/v2.0.0.html).

Die Geschichte von apaleo-odoo-export beginnt hier. Das Projekt ist eine Kopie von [apaleo-abacus-export](https://github.com/krautdawg/apaleo-abacus-export) v0.1.0 (apaleo nach Abacus, mit den Korrekturen nach dem ersten Live-Test), das selbst auf [apaleo-bmd-export](https://github.com/krautdawg/apaleo-bmd-export) und [apaleo-datev-export](https://github.com/krautdawg/apaleo-datev-export) aufbaut: Quelle apaleo, Ablauf des Exports, Plausibilitätsprüfungen, Zeitplan und Docker kommen von dort. Die Einträge jener Projekte stehen in ihren eigenen Änderungsprotokollen; wer mit Abacus, BMD oder DATEV bucht, nimmt eines dieser Projekte.

## [Unveröffentlicht]

### Hinzugefügt

- **Odoo-Importdatei mit Buchungssätzen** (o02, o03): `export` schreibt pro Hotel und Zeitraum `ODOO_Buchungen_<von>-<bis>_<Hotel>.csv` für den Standardimport von Odoo 17, 18 und 19 (Buchhaltung > Buchhaltung > Journalbuchungen > Datensätze importieren): ein Buchungssatz als Entwurf pro Geschäftstag in das Journal aus `odoo.journal`, mit External IDs für Buchungssätze und Zeilen und der Referenz `apaleo <Hotel> <Datum>`. Jede Erlös- und Anzahlungszeile trägt die Odoo-Steuer über ihre External ID (`account.<Unternehmen>_tax_ust_7_skr03`) und ihren Nettobetrag; Steuerzeilen schreibt die Datei nie, die legt Odoo selbst an. Die Basisanpassung wählt jeden Nettobetrag so, dass Odoos eigene Steuer (pro Zeile oder pro Steuer gerundet, `odoo.taxRounding`) plus Basis genau den Bruttobetrag aus apaleo ergibt, damit Odoo keine „Automatische Ausgleichszeile“ anlegt; der Writer prüft jede Buchung vor dem Schreiben (`E-ODOO-*`). Der neue Abschnitt `odoo` der Konfiguration nennt Journal, Version, Unternehmen, Währung, Rundungsmethode und Rundungskonto.
- **Hotelvorlagen für SKR03 und SKR04** (o03, o05): `init-mapping --template skr03-hotel` oder `init-mapping --template skr04-hotel` schreibt die Kontenzuordnung mit den Sachkonten von l10n_de und der Odoo-Steuer jedes Satzes, mit den Codes für Kasse und Geldtransit einer frischen Datenbank von `odoo.version`, jede Zeile als `Vorschlag (ungeprüft)` markiert. `mapping check` prüft Kontonummern, Steuern und Sätze, Steuern auf Zahlungen und Forderungen, die Kennzahl 45 und Konten mit Standardsteuer.
- **Deutsche Buchungsregeln** (o03, o05): Kurtaxe als durchlaufender Posten ohne Steuer (§ 10 Abs. 1 UStG, `W-CITY-TAX-TAXED`), Anzahlungen mit der Umsatzsteuer bei Erhalt, Forderungsverluste mit der Korrektur der Umsatzsteuer (§ 17 UStG), No-Show- und Stornogebühren als Entgelt zu 7 % oder als Schadenersatz ohne Steuer, und der Speisensatz nach Leistungsdatum mit 7 % ab 2026-01-01 (`W-FOOD-RATE`). Ein erfundener deutscher Testmonat in EUR prüft alle Fälle.
- **Übersicht und Revisionen für Odoo** (o06): Probelauf und Protokoll zeigen Odoos Umsatzsteuer pro Steuer und Satz mit der UStVA-Kennzahl gegen apaleos Steuer, die Summen in der Reihenfolge der Prüfung nach dem Import und den Importblock. `export --overwrite` schreibt die nächste Revision mit neuen External IDs (`_r2`) und dem Zusatz „(Korrektur 2)“ in der Referenz.
- **Demo** (o06): `export --demo` lässt den Export auf dem erfundenen „Hotel Beispiel Berlin“ (EUR, `Europe/Berlin`, Odoo 19, SKR03) laufen, ohne Konfiguration, Secret und Netz; [docs/examples/](docs/examples/) zeigt die Odoo-Datei, das Protokoll und die Kontenzuordnung.
- **Zeitplan und Docker** (o07): `schedule --once` exportiert jeden fälligen Zeitraum, aus Cron oder der Schleife im lokal gebauten Docker-Container; [docs/docker.md](docs/docker.md) beschreibt Compose, Cron auf dem Host und die Demo im Image.
- **Anleitungen für Odoo** (o02 bis o08): [docs/odoo-format.md](docs/odoo-format.md) (die Felder der Datei und ihre Quellen), [docs/odoo-import.md](docs/odoo-import.md) (Vorbereitung, Import, Prüfung, Revisionen und Rückgängigmachen, Checkliste für den ersten Testimport), [docs/posting-rules.md](docs/posting-rules.md) und [docs/export.md](docs/export.md), dazu der lokale Testimport des Maintainers mit Odoo 17, 18 und 19 Community (`scripts/odoo-check/`).

### Geändert

- **Neuer Name apaleo-odoo-export** (o01): das Paket `apaleo-odoo-export`, die Kommandozeile `apaleo-odoo`, die Konfigurationsdatei `apaleo-odoo.config.yaml` und die Umgebungsvariablen `APALEO_ODOO_*`. `APALEO_CLIENT_ID` und `APALEO_CLIENT_SECRET` bleiben; die alten Variablen `APALEO_ABACUS_*` liest das Tool nicht mehr.
- **Kontenzuordnung für Odoo** (o03): Die Spalten sind `apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;odoo_account;odoo_tax;tax_percent;comment`. Zuordnungen und Konfigurationen von apaleo-abacus-export, apaleo-bmd-export und apaleo-datev-export lehnt das Tool mit einem Hinweis auf `init-mapping --template skr03-hotel` und den Abschnitt `odoo` ab.
- **Zeitzone `Europe/Berlin`** (o07): `schedule.timezone` ist standardmäßig `Europe/Berlin` statt `Europe/Zurich`; kein Termin verschiebt sich.
- **Dokumentation für Deutschland** (o08): README, `README.en.md`, alle Anleitungen, der Haftungsausschluss, die Dateien für Mitwirkende und die Vorlagen für Issues und Pull Requests sind auf Deutsch, wie man es in Deutschland schreibt, für Hotels mit apaleo und Odoo und ihre Steuerberater. Der Docs-Test prüft jede deutsche Datei mit denselben Regeln: „du“, deutsche Anführungszeichen, Steuersätze wie `7 %`, keine Begriffe aus der Schweizer oder österreichischen Praxis, Abacus und BMD nur an den Stellen, die auf die Vorgängerprojekte verweisen.

### Entfernt

- **Abacus XML Buchungen** (o04): der Writer für die AbaConnect-Datei „XML Buchungen“ (`src/abacus/`) mit seinen Befunden `E-ABACUS-*`, Tests und Golden Files, der Abschnitt `abacus` der Konfiguration, die Schlüssel `properties[].mandant` und `properties[].geschaeftsbereich` und die Anleitungen `docs/abacus-format.md` und `docs/abacus-import.md`.
- **KMU-Vorlage** (o03): `init-mapping --template kmu-hotel`, `--accounts-from`, die MWST-Codes, die Kostenstellen und die Schweizer Buchungsregeln und Warnungen der Abacus-Zuordnung.

[Unveröffentlicht]: https://github.com/krautdawg/apaleo-odoo-export/commits/main
