# Änderungsprotokoll

Alle wichtigen Änderungen an apaleo-abacus-export stehen in dieser Datei.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), und dieses Projekt hält sich an die [Semantische Versionierung](https://semver.org/lang/de/spec/v2.0.0.html).

Die Geschichte von apaleo-abacus-export beginnt hier. Das Projekt ist eine Kopie von [apaleo-bmd-export](https://github.com/krautdawg/apaleo-bmd-export) v0.1.0 (apaleo nach BMD NTCS, mit den Korrekturen nach dem ersten Live-Test), das selbst auf [apaleo-datev-export](https://github.com/krautdawg/apaleo-datev-export) aufbaut: Quelle apaleo, Ablauf des Exports, Plausibilitätsprüfungen, Zeitplan und Docker kommen von dort. Die Einträge jener Projekte stehen in ihren eigenen Änderungsprotokollen. Wer mit BMD oder DATEV bucht, nimmt eines dieser Projekte.

## [Unveröffentlicht]

## [0.1.0] - 2026-10-24

### Hinzugefügt

- **Abacus XML Buchungen** (a02, a03): `export` schreibt pro Hotel und Monat `ABACUS_Buchungen_<von>-<bis>_<Hotel>.xml` für die Abacus Finanzbuchhaltung (AbaConnect «XML Buchungen», Application FIBU, eine Einzelbuchung pro Buchung). Die Seite mit MWST-Code steht in `SingleInformation` mit dem Bruttobetrag und der MWST aus apaleo in `TaxData`, `DebitCredit` ist die Seite der `CollectiveInformation`, die Kostenstelle steht nur auf Erlös- und Debitorenverlustbuchungen, `Text2` kommt aus `posting.text2`. Der Writer prüft jedes Feld vor dem Schreiben (`E-ABACUS-*`) und escapt und rückt das XML selbst ein, ohne XML-Bibliothek. Der neue Abschnitt `abacus` der Konfiguration nennt Mandant, Leitwährung, Abrechnungsart, Version der Schnittstelle, Steuer- und Hilfskonto, MWST-Codes und Geschäftsbereich.
- **KMU-Hotelvorlage** (a03): `init-mapping --template kmu-hotel` schreibt die Kontenzuordnung nach dem Schweizer Kontenrahmen KMU und dem Kontenrahmen für die Hotellerie und Gastronomie, mit den MWST-Codes aus `abacus.mwstCodes`, jede Zeile als `Vorschlag (ungeprüft)` markiert. `--accounts-from <Datei>` übernimmt Konten und Kostenstellen aus dem Kontenexport eines kostenpflichtigen Connectors. `mapping check` prüft Abacus-Konten, MWST-Codes und die Schweizer Sätze.
- **Schweizer Buchungsregeln** (a03, a05): MWST-Codes für 8,1 %, 2,6 % und 3,8 % mit der Ziffer der MWST-Abrechnung; Kurtaxe, Gästetaxe und Beherbergungsabgabe als durchlaufender Posten oder als Teil der Beherbergung (`W-KURTAXE-TAXED`); Anzahlungen mit der MWST bei Erhalt, auch nach vereinnahmten Entgelten (`W-ABRECHNUNGSART-VEREINNAHMT`); Debitorenverlust als Entgeltsminderung; Annullationen und No-Shows so, wie apaleo sie besteuert (`W-ANNULLATION-TAXED`). Ein erfundener Schweizer Testmonat in CHF prüft alle Fälle.
- **CHF als Leitwährung** (a01, a03): Jedes Hotel bucht in der Leitwährung des Mandanten (`abacus.leitwaehrung`, Standard CHF, EUR erlaubt); `E-CURRENCY` lehnt jede andere Währung ab, das Tool rechnet nicht um und rundet nie auf 5 Rappen.
- **Protokoll und Manifest für Abacus** (a06): Übersicht pro Abacus-Konto und pro MWST-Code und Satz mit der Ziffer der MWST-Abrechnung, der Block «Import into Abacus FIBU», die Journalsumme und die MWST pro MWST-Code im Manifest, und die neue Prüfung `E-MWST-CODE-RATES` (ein MWST-Code mit zwei Sätzen in einer Datei).
- **Demo** (a06): `export --demo` lässt den Export auf dem erfundenen Schweizer «Hotel Beispiel» (CHF, `Europe/Zurich`, Mandant `7777`) laufen, ohne Konfiguration, Secret und Netz; `docs/examples/` zeigt die Abacus-Datei, das Protokoll und die Kontenzuordnung.
- **Zeitplan und Docker** (a07): `schedule --once` rechnet standardmässig mit `Europe/Zurich`; das lokal gebaute Docker-Image und `docs/docker.md` beschreiben Compose, Cron auf dem Host und die Demo im Image.
- **Dokumentation für die Schweiz** (a08): README, `README.en.md`, alle Anleitungen, der Haftungsausschluss, die Dateien für Mitwirkende und die Vorlagen für Issues und Pull Requests in Schweizer Hochdeutsch, mit `docs/abacus-import.md` (Import in Abacus, Checkliste für den ersten Import) und `docs/maintainers.md` (Vor der Veröffentlichung, Testimporte, Später geplant). Der Docs-Test prüft jede deutsche Datei auf «ss», die Schweizer Schreibweise der Sätze (`8,1 %`), Begriffe aus der deutschen und österreichischen Praxis und jede Behauptung eines getesteten Imports.

### Geändert

- **Neuer Name apaleo-abacus-export** (a01): das Paket `apaleo-abacus-export`, die Kommandozeile `apaleo-abacus`, die Konfigurationsdatei `apaleo-abacus.config.yaml` und die Umgebungsvariablen `APALEO_ABACUS_*`. `APALEO_CLIENT_ID` und `APALEO_CLIENT_SECRET` bleiben, die alten Variablen `APALEO_BMD_*` liest das Tool nicht mehr.
- **Währung des Zielformats** (a01): Der `TargetWriter` nennt die Währung, in der seine Datei bucht, und `E-CURRENCY` vergleicht das Hotel und jede Zeile des Buchungsjournals damit.
- **Kontenzuordnung für Abacus** (a03): Die Spalten sind `apaleo_account;apaleo_type;apaleo_name;apaleo_vat_percent;abacus_account;mwst_code;mwst_percent;kost;comment`. Zuordnungen und Konfigurationen von apaleo-bmd-export und apaleo-datev-export lehnt das Tool mit einem Hinweis auf `init-mapping --template kmu-hotel` und den Abschnitt `abacus` ab.

### Entfernt

- **BMD Buchungsimport** (a03, a04): der BMD-Writer (`src/bmd/`), die Befunde `E-BMD-*` und `N-BMD-*`, `docs/bmd-format.md` und `docs/bmd-import.md`.
- **EKR-Vorlage** (a03, a04): `init-mapping --template ekr`, `templates/ekr-hotel.rules.csv`, die Sach- und Personenkontenlänge, die Buchungssymbole und die österreichischen Steuercodes.

[Unveröffentlicht]: https://github.com/krautdawg/apaleo-abacus-export/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/krautdawg/apaleo-abacus-export/releases/tag/v0.1.0
