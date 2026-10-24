# apaleo Abacus Export – kostenlos und Open Source

**English:** [README.en.md](README.en.md)

Kostenloser apaleo Abacus Export: XML-Buchungsimport für die Abacus Finanzbuchhaltung aus apaleo, Open Source.

[![CI](https://github.com/krautdawg/apaleo-odoo-export/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/krautdawg/apaleo-odoo-export/actions/workflows/ci.yml)
[![Lizenz: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Node.js 24](https://img.shields.io/badge/node.js-24-339933.svg)](https://nodejs.org/)

apaleo-odoo-export ist ein kostenloser Abacus-Export für Hotels in der Schweiz, die mit apaleo arbeiten, und für ihren Treuhänder. Er liest das apaleo-Buchungsjournal eines Monats und schreibt pro Hotel eine AbaConnect-Datei «XML Buchungen», die dein Treuhänder oder deine Buchhaltung in die Abacus Finanzbuchhaltung (FIBU) importiert, mit MWST-Codes und einer Vorlage für die Kontenzuordnung nach dem KMU-Kontenrahmen. Das Tool ist Open Source (MIT-Lizenz) und läuft auf deinem eigenen Rechner mit deinem eigenen apaleo-Konto. Kein Abo, kein gehosteter Dienst, kein Konto bei uns.

**Stand:** Die Datei folgt dem dokumentierten Import von Journalbuchungen in Odoo; ein erster Testimport mit einem Steuerberater steht noch aus. Wie dein Steuerberater die Datei importiert und was er dabei prüft, steht in [docs/odoo-import.md](docs/odoo-import.md).

> **Keine Gewähr, keine Steuerberatung.** Lass deine Kontenzuordnung von deinem Treuhänder prüfen, ebenso die ersten Importe in Abacus. Lies den [Haftungsausschluss](DISCLAIMER.md).

## Was es macht

- Liest das apaleo-Buchungsjournal (`export-gross-daily`) und den Kontenplan über eine apaleo Custom App, die nur lesen darf.
- Ordnet jedes apaleo-Konto einem Abacus-Sachkonto zu, mit MWST-Code und MWST-Satz, in einer Kontenzuordnung (CSV) pro Hotel aus der KMU-Hotelvorlage.
- Prüft jede Zeile vor dem Schreiben: Abacus bekommt den Bruttobetrag und die MWST von apaleo, auf den Rappen genau; jedes Konto muss zugeordnet sein, jeder MWST-Code passt zu seinem Satz, und die Summen pro Konto müssen aufgehen.
- Bucht die Schweizer Fälle nach der Kontenzuordnung: Beherbergung zu 3,8 %, Kurtaxe als durchlaufender Posten, Anzahlungen mit der MWST bei Erhalt, Debitorenverlust als Entgeltsminderung, Annullationen und No-Shows.
- Schreibt pro Hotel und Monat eine Datei in der Leitwährung des Mandanten (CHF oder EUR) mit Protokoll und Prüfsummen, schreibt denselben Monat nie zweimal und läuft von Hand, per Cron oder in einem selbst gebauten Docker-Container (`schedule --once`).

## Für wen

- Hotel-Backoffice und kleine Hotelgruppen in der Schweiz mit apaleo, deren Buchhaltung ein Treuhänder oder die eigene Buchhaltung in Abacus macht.
- Treuhänderinnen und Treuhänder, die die Kontenzuordnung sehen, prüfen und selbst verantworten wollen.
- Technische Helfer, die es für ein Hotel einrichten. Du brauchst einen Rechner mit Node.js 24 oder Docker und die Kommandozeile.

## Beispielausgabe ansehen

In [docs/examples/](docs/examples/) liegt eine Abacus-Datei (XML Buchungen), die das Tool für das erfundene «Hotel Beispiel» geschrieben hat, mit Protokoll und der Kontenzuordnung, aus der sie entstanden ist. Dein Treuhänder kann sie prüfen oder in einen Testmandanten importieren, bevor irgendjemand etwas einrichtet.

## Ohne apaleo ausprobieren

Nach der Installation (Schritt 2 unten) läuft der echte Export auf mitgelieferten Demodaten. Dafür brauchst du keine Konfiguration, kein apaleo-Konto und kein Netz:

```sh
node dist/cli/main.js export --month 2026-09 --demo --dry-run
```

Das zeigt die Buchungsübersicht für September 2026 im «Hotel Beispiel» in CHF. Ohne `--dry-run` schreibt es die Datei nach `./demo-output/`, markiert mit `DEMO` im Dateinamen (`…_BSP_DEMO.xml`), am Anfang jedes Buchungstexts und im Protokoll. Im Docker-Image: siehe [docs/docker.md](docs/docker.md#die-demo-im-image).

## Schnellstart

Es gibt noch kein npm-Paket und kein Container-Image zum Herunterladen. Du installierst aus dem Quellcode.

1. **apaleo Custom App anlegen.** In apaleo: Apps > Connected apps > Add a new app > Add custom app (Seite «New simple client»), personenbezogene Daten «Omit all», mit den Berechtigungen aus [docs/setup-apaleo.md](docs/setup-apaleo.md). Kopiere Client-ID und Secret.

2. **Installieren** (braucht Node.js 24 und git):

   <!-- quickstart -->
   ```sh
   git clone https://github.com/krautdawg/apaleo-odoo-export.git
   cd apaleo-odoo-export
   corepack enable
   pnpm install --frozen-lockfile
   pnpm build
   node dist/cli/main.js --help        # oder: pnpm link --global, dann apaleo-odoo --help
   ```

   Dann die Konfiguration ausfüllen und das Secret setzen. Das Secret kommt nie in die Konfigurationsdatei.

   ```sh
   cp apaleo-odoo.config.example.yaml apaleo-odoo.config.yaml   # apaleo.clientId, das Odoo-Journal und die Version (odoo.journal, odoo.version) und unter properties dein Hotel eintragen
   export APALEO_CLIENT_SECRET='das Secret aus apaleo'
   node dist/cli/main.js doctor
   node dist/cli/main.js properties
   ```

   `properties` zeigt die ID deines Hotels. Trag sie in der Konfiguration unter `properties` ein (den auskommentierten Abschnitt `properties:` in der Datei aktivieren); `export` exportiert jedes dort eingetragene Hotel. Die Befehle unten verwenden als Beispiel die ID `BSP`.

   Die Befehle unten verwenden `apaleo-odoo`. Ohne `pnpm link --global` tippst du stattdessen `node dist/cli/main.js`.

3. **Kontenzuordnung anlegen** und von deinem Steuerberater mit dem [Leitfaden zur Kontenzuordnung](docs/mapping-guide.md) prüfen lassen:

   ```sh
   apaleo-odoo init-mapping --property BSP --template skr03-hotel   # schreibt mapping-BSP.csv nach der SKR03-Hotelvorlage (oder skr04-hotel)
   apaleo-odoo mapping check --property BSP --from 2026-09-01 --to 2026-09-30
   ```

4. **Probelauf**: alle Prüfungen und die Übersicht, keine Datei.

   ```sh
   apaleo-odoo export --month 2026-09 --dry-run
   ```

5. **Export**: eine Odoo-Importdatei (CSV, eine Journalbuchung als Entwurf pro Geschäftstag) pro Hotel nach `exports/<Hotel>/<JJJJ-MM>/`. Gib sie deinem Steuerberater oder deiner Buchhaltung für den Import in Odoo (Buchhaltung > Buchhaltung > Journalbuchungen > Zahnrad > Datensätze importieren; die Felder der Datei in [odoo-format.md](docs/odoo-format.md)).

   ```sh
   apaleo-odoo export --month 2026-09
   ```

## Schnellstart mit Docker

Das Image wird auf deinem Rechner aus diesem Repository gebaut; nichts wird aus einer Registry geladen. Der Container ruft stündlich `schedule --once` auf und exportiert jeden Monat, sobald er fällig ist (Oktober am 3. November, in der Zeitzone `Europe/Zurich`).

```sh
cp .env.example .env                 # APALEO_CLIENT_SECRET eintragen
mkdir -p config data
cp apaleo-odoo.config.example.yaml config/apaleo-odoo.config.yaml   # dann bearbeiten
cp mapping-BSP.csv config/           # die von deinem Treuhänder geprüfte Zuordnung
sudo chown 1000:1000 data            # der Container läuft als Benutzer node (uid 1000)
docker compose -f docker-compose.example.yml build
docker compose -f docker-compose.example.yml up -d
```

Die Dateien erscheinen in `./data/<Hotel>/<JJJJ-MM>/`. Cron auf dem Host, einmalige Befehle und Updates: [docs/docker.md](docs/docker.md).

## Befehle

| Befehl | Was er macht |
|---|---|
| `doctor` | Prüft Node.js, Konfigurationsdatei und Uhr. Ohne Netz. |
| `properties` | Listet die apaleo-Hotels, die die Custom App lesen darf. |
| `live-smoke` | Liest einen Geschäftstag aus apaleo mit echten Zugangsdaten und zeigt, was zurückkam. Schreibt nichts. |
| `init-mapping` | Schreibt eine Kontenzuordnung aus dem apaleo-Kontenplan und einer Hotelvorlage für Odoo (`--template skr03-hotel` oder `skr04-hotel`); `--update` hängt neue Konten an. |
| `mapping check` | Prüft eine Kontenzuordnung, und mit `--from`/`--to`, ob jedes im Zeitraum gebuchte Konto zugeordnet ist. |
| `export` | Schreibt die Odoo-Importdateien (CSV mit Journalbuchungen als Entwurf) eines Monats oder Zeitraums nach allen Prüfungen; `--dry-run` schreibt nichts, `--demo` nimmt die Demodaten. |
| `schedule` | `schedule --once` exportiert jeden fälligen Zeitraum, der noch nicht im Ausgabeordner liegt, und endet. Für Cron und Docker. |

`apaleo-odoo <Befehl> --help` zeigt die Optionen. Exit-Codes: 0 Erfolg, 1 eine Prüfung oder ein Lauf ist fehlgeschlagen, 2 falscher Aufruf. Jeder Befund-Code mit Lösung: [docs/troubleshooting.md](docs/troubleshooting.md).

## Konfiguration

Eine YAML-Datei und Umgebungsvariablen für das Secret. Jeder Schlüssel mit Standardwert und Umgebungsvariable: [docs/configuration.md](docs/configuration.md). Die Vorlage zum Kopieren: [apaleo-odoo.config.example.yaml](apaleo-odoo.config.example.yaml).

## Was es nicht macht

- Keine Übertragung in Abacus und kein AbaConnect-Webservice: Das Tool schreibt nur Dateien, die dein Treuhänder in Abacus importiert.
- Keine Debitorenbuchhaltung (DEBI) und keine Kundenstammdaten. Rechnungen an Firmen gehen auf ein Sachkonto «Debitoren apaleo».
- Keine PDF-Belege.
- Keine Buchung von Gebühren der Zahlungsdienstleister, Rückbuchungen (Chargebacks) oder Provisionen der Buchungsportale. Die bucht dein Treuhänder aus den Abrechnungen.
- Keine Saldosteuersatz- und keine Pauschalsteuersatzmethode: Das Tool bucht die MWST effektiv, so wie apaleo sie berechnet.
- Nur die Währung des Hotels, die die Leitwährung des Mandanten sein muss (CHF oder EUR), ohne Umrechnung.
- Keine Weboberfläche, kein gehosteter Dienst, kein E-Mail-Versand, kein zertifiziertes Archiv.
- Nur apaleo und keine anderen Zielformate wie DATEV oder BMD. Ein anderes PMS ist als Beitrag willkommen; siehe [docs/architecture.md](docs/architecture.md).

## Vergleich mit kostenpflichtigen Connectoren

Im apaleo Store gibt es einen kostenpflichtigen Abacus-Connector. Die Tabelle vergleicht das typische Angebot mit diesem Tool, ohne Namen zu nennen.

| | Kostenpflichtiger Connector im apaleo Store | apaleo-odoo-export |
|---|---|---|
| Preis | 24-48 EUR pro Monat (je nach Variante und Anzahl der Betriebe), laut apaleo Store, Oktober 2026 | kostenlos |
| Betrieb | beim Anbieter | bei dir (Rechner, Server oder Docker) |
| Einrichtung | Oberfläche des Anbieters | Konfigurationsdatei und Kontenzuordnung (CSV) |
| Zustellung der Dateien | per E-Mail oder in einen Cloud-Speicher | lokaler Ordner; du gibst die Datei deinem Treuhänder |
| Direktimport in Abacus | je nach Variante | nein, dein Treuhänder importiert die Datei |
| Debitoren-Schnittstelle | eigene Schnittstelle (DEBI-XML) | keine in Version 1, ein Sachkonto für Firmenrechnungen |
| Support | Support des Anbieters | Community, ohne Garantie |
| Vorlagen für die Zuordnung | Zuordnung pro Hotel in der Oberfläche des Anbieters | Vorschläge nach dem KMU-Kontenrahmen, geprüft von deinem Treuhänder |

Selbst betreiben heisst: Du behältst die Daten und zahlst nichts, aber du spielst Updates ein, behältst die geplanten Läufe im Blick, gibst die Dateien selbst an deinen Treuhänder weiter und löst Probleme selbst oder mit einem technischen Helfer. Kann das niemand übernehmen, ist ein bezahlter Connector vielleicht die bessere Wahl.

apaleo-odoo-export baut auf [apaleo-bmd-export](https://github.com/krautdawg/apaleo-bmd-export) und [apaleo-datev-export](https://github.com/krautdawg/apaleo-datev-export) auf; wer in Österreich mit BMD oder in Deutschland mit DATEV bucht, nimmt eines dieser Projekte.

## Häufige Fragen

**Was kostet es?** Nichts. Es steht unter der MIT-Lizenz. Deine Kosten sind der Rechner, auf dem es läuft, und die Zeit deines Treuhänders für die Prüfung der Zuordnung.

**Wohin gehen meine Daten?** Nur auf deine eigene Festplatte. Das Tool liest apaleo mit deiner Custom App und schreibt Dateien in einen lokalen Ordner. Nichts ist gehostet, und es schickt nichts an uns oder an andere. Die Datei enthält keine Gästenamen: Buchungstexte nutzen Kontobezeichnungen, nie die Namen von Gastfolios.

**Welches Odoo brauche ich?** Odoo 17, 18 oder 19, Community oder Enterprise, auf Odoo Online, Odoo.sh oder selbst gehostet, mit der deutschen Lokalisierung (SKR03 oder SKR04). Der Standardimport von Odoo genügt, kein Modul und kein API-Zugang; siehe [docs/odoo-import.md](docs/odoo-import.md).

**Kann es direkt an Odoo übertragen, etwa über die externe API?** Nein. Dein Steuerberater importiert die Datei in Odoo; siehe [docs/odoo-import.md](docs/odoo-import.md). Die Übertragung über die API steht unter „Später geplant“ in [docs/maintainers.md](docs/maintainers.md#später-geplant).

**Hat ein Steuerberater die Datei schon importiert?** Noch nicht. Die Datei folgt dem dokumentierten Import von Journalbuchungen in Odoo; die Quellen stehen in [docs/odoo-format.md](docs/odoo-format.md). Der Maintainer hat sie lokal in Odoo 17, 18 und 19 Community importiert; der erste Testimport mit einer Kanzlei wird mit Datum und Ergebnis in [docs/maintainers.md](docs/maintainers.md#testimporte) festgehalten.

**Kann ich einen Import rückgängig machen?** Ja. Die Buchungssätze kommen als Entwürfe in das Journal aus `odoo.journal`; Entwürfe löscht dein Steuerberater, gebuchte Buchungssätze storniert er. Importiere nie eine Datei aus `--overwrite`, bevor die Buchungssätze der alten Datei gelöscht oder storniert sind; siehe [docs/odoo-import.md](docs/odoo-import.md#einen-monat-ersetzen).

**Mehrere Hotels?** Trag sie unter `properties` in der Konfiguration ein. Jedes bekommt eine eigene Zuordnung und eine eigene Datei. Soll jedes Hotel ein eigenes Journal in Odoo bekommen, setz `properties[].journal`.

**Ich nutze heute einen bezahlten Connector. Kann ich wechseln?** Ja. Leg die Zuordnung mit `init-mapping --template skr03-hotel` (oder `skr04-hotel`) an und übertrag Konten, die von der Vorlage abweichen, von Hand; prüf das Ergebnis mit deinem Steuerberater ([Umstieg von einem anderen Connector](docs/mapping-guide.md#umstieg-von-einem-anderen-connector)). Fang mit dem ersten Monat an, den der alte Connector nicht mehr geliefert hat, damit nichts doppelt importiert wird; siehe [docs/docker.md](docs/docker.md#der-erste-lauf).

**Rechnet mein Hotel mit dem Saldosteuersatz ab?** Dann passt Version 1 nicht: Das Tool bucht die MWST nach der effektiven Methode, so wie apaleo sie pro Zeile berechnet. Die Saldosteuersatz- und die Pauschalsteuersatzmethode stehen unter «Später geplant» in [docs/maintainers.md](docs/maintainers.md#später-geplant).

**Und ein Hotel ausserhalb der Schweiz?** Das Tool bucht nur in der Leitwährung des Mandanten (CHF oder EUR), ohne Umrechnung, und nur nach den Schweizer MWST-Regeln (MWSTG). Für ein Hotel in Liechtenstein klärst du das mit deinem Treuhänder.

**Gibt es das auch für BMD oder DATEV?** Ja, als eigene Projekte: [apaleo-bmd-export](https://github.com/krautdawg/apaleo-bmd-export) für BMD in Österreich und [apaleo-datev-export](https://github.com/krautdawg/apaleo-datev-export) für DATEV in Deutschland.

**Ist die Zuordnung Steuerberatung?** Nein. Die Vorlagen sind Vorschläge. Jede Zeile entscheidet dein Treuhänder.

## Haftungsausschluss

Ohne Gewähr, keine Haftung, keine Steuerberatung. Dein Treuhänder muss die Kontenzuordnung, die MWST-Codes und die ersten Importe in Abacus prüfen. Lies den vollständigen [Haftungsausschluss](DISCLAIMER.md) (verbindlich auf Deutsch, mit einer unverbindlichen englischen Übersetzung). Keine Verbindung zur apaleo GmbH oder zur Abacus Research AG.

## Mitmachen

Fehlermeldungen, Korrekturen, Wissen über Abacus, die MWST und die Kontenzuordnung und neue Quellen sind willkommen. Lies zuerst [CONTRIBUTING.md](CONTRIBUTING.md): Einrichtung, OpenSpec-Ablauf und die Regel, dass Testdaten nie echte Gästedaten enthalten. Issues und Pull Requests auf Englisch sind ebenso willkommen; Code, Bezeichner und Commits sind auf Englisch. Sicherheitsprobleme: [SECURITY.md](SECURITY.md). Änderungen: [CHANGELOG.md](CHANGELOG.md).

## Lizenz

[MIT](LICENSE) (englischer Originaltext).
