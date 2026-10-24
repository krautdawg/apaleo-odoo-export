# apaleo Odoo Export – kostenlos und Open Source

**English:** [README.en.md](README.en.md)

Kostenloser apaleo Odoo Export: Buchungssätze für die Odoo Buchhaltung aus apaleo, als Importdatei, Open Source.

[![CI](https://github.com/krautdawg/apaleo-odoo-export/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/krautdawg/apaleo-odoo-export/actions/workflows/ci.yml)
[![Lizenz: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Node.js 24](https://img.shields.io/badge/node.js-24-339933.svg)](https://nodejs.org/)

apaleo-odoo-export ist ein kostenloser apaleo Odoo Export für Hotels in Deutschland, die mit apaleo und Odoo arbeiten, und für ihren Steuerberater. Er liest das apaleo-Buchungsjournal eines Monats und schreibt pro Hotel eine Importdatei mit einem Buchungssatz pro Geschäftstag, die dein Steuerberater oder deine Buchhaltung mit dem Standardimport von Odoo in die Odoo Buchhaltung übernimmt, mit der Odoo-Steuer auf jeder Erlöszeile und einer Vorlage für die Kontenzuordnung nach SKR03 oder SKR04. Statt eines kostenpflichtigen Connectors läuft das Tool als Open Source (MIT-Lizenz) auf deinem eigenen Rechner mit deinem eigenen apaleo-Konto. Kein Abo, kein gehosteter Dienst, kein Konto bei uns.

**Stand:** Die Datei folgt dem dokumentierten Import von Journalbuchungen in Odoo; ein erster Testimport mit einem Steuerberater steht noch aus. Wie dein Steuerberater die Datei importiert und was er dabei prüft, steht in [docs/odoo-import.md](docs/odoo-import.md).

> **Keine Gewähr, keine Steuerberatung.** Lass deine Kontenzuordnung von deinem Steuerberater prüfen, ebenso die ersten Importe in Odoo. Lies den [Haftungsausschluss](DISCLAIMER.md).

## Was es macht

- Liest das apaleo-Buchungsjournal (`export-gross-daily`) und den Kontenplan über eine apaleo Custom App, die nur lesen darf.
- Ordnet jedes apaleo-Konto einem Sachkonto in Odoo zu, mit der Odoo-Steuer und dem Steuersatz, in einer Kontenzuordnung (CSV) pro Hotel aus der Hotelvorlage für SKR03 oder SKR04.
- Prüft jede Zeile vor dem Schreiben: Jedes Konto muss zugeordnet sein, jede Steuer passt zu ihrem Satz, die Summen pro Konto gehen auf, und die Nettobeträge sind so gewählt, dass Odoos eigene Umsatzsteuer plus Nettobetrag auf den Cent den Bruttobetrag aus apaleo ergibt.
- Bucht die deutschen Fälle nach der Kontenzuordnung: Beherbergung zu 7 %, Speisen ab 2026 zu 7 %, Getränke zu 19 %, Kurtaxe als durchlaufender Posten, Anzahlungen mit der Umsatzsteuer bei Erhalt, Forderungsverluste mit der Korrektur der Umsatzsteuer, No-Show- und Stornogebühren.
- Schreibt pro Hotel und Monat eine Datei mit Buchungssätzen als Entwurf, mit Protokoll und Prüfsummen, schreibt denselben Monat nie zweimal und läuft von Hand, per Cron oder in einem selbst gebauten Docker-Container (`schedule --once`).

## Für wen

- Hotel-Backoffice und kleine Hotelgruppen in Deutschland mit apaleo, deren Buchhaltung in Odoo läuft, beim Steuerberater oder im eigenen Haus.
- Steuerberaterinnen, Steuerberater und Kanzleien, die die Kontenzuordnung sehen, prüfen und selbst verantworten wollen.
- Technische Helfer, die es für ein Hotel einrichten. Du brauchst einen Rechner mit Node.js 24 oder Docker und die Kommandozeile.

## Beispielausgabe ansehen

In [docs/examples/](docs/examples/) liegt eine Odoo-Importdatei, die das Tool für das erfundene „Hotel Beispiel Berlin“ geschrieben hat, mit Protokoll und der Kontenzuordnung, aus der sie entstanden ist. Deine Kanzlei kann sie prüfen oder in eine Testdatenbank importieren, bevor irgendjemand etwas einrichtet.

## Ohne apaleo ausprobieren

Nach der Installation (Schritt 2 unten) läuft der echte Export auf mitgelieferten Demodaten. Dafür brauchst du keine Konfiguration, kein apaleo-Konto und kein Netz:

```sh
node dist/cli/main.js export --month 2026-09 --demo --dry-run
```

Das zeigt die Buchungsübersicht für September 2026 im erfundenen „Hotel Beispiel Berlin“ in EUR. Ohne `--dry-run` schreibt es die Datei nach `./demo-output/`, markiert mit `DEMO` im Dateinamen (`ODOO_Buchungen_20260901-20260930_BSP_DEMO.csv`), in den External IDs, am Anfang jeder Referenz und im Protokoll. Im Docker-Image: siehe [docs/docker.md](docs/docker.md#die-demo-im-image).

## Schnellstart

Es gibt noch kein npm-Paket und kein Container-Image zum Herunterladen. Du installierst aus dem Quellcode.

1. **apaleo Custom App anlegen.** In apaleo: Apps > Connected apps > Add a new app > Add custom app (Seite „New simple client“), personenbezogene Daten „Omit all“, mit den Berechtigungen aus [docs/setup-apaleo.md](docs/setup-apaleo.md). Kopiere Client-ID und Secret.

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

5. **Export**: eine Odoo-Importdatei (CSV, ein Buchungssatz als Entwurf pro Geschäftstag) pro Hotel nach `exports/<Hotel>/<JJJJ-MM>/`. Deine Kanzlei legt in Odoo einmal ein eigenes Journal an und importiert die Datei unter Buchhaltung > Buchhaltung > Journalbuchungen (Accounting > Accounting > Journal Entries) mit Zahnrad > Datensätze importieren (gear > Import records), Schritt für Schritt in [docs/odoo-import.md](docs/odoo-import.md); die Felder der Datei stehen in [docs/odoo-format.md](docs/odoo-format.md).

   ```sh
   apaleo-odoo export --month 2026-09
   ```

## Schnellstart mit Docker

Das Image wird auf deinem Rechner aus diesem Repository gebaut; nichts wird aus einer Registry geladen. Der Container ruft stündlich `schedule --once` auf und exportiert jeden Monat, sobald er fällig ist (Oktober am 3. November, in der Zeitzone `Europe/Berlin`).

```sh
cp .env.example .env                 # APALEO_CLIENT_SECRET eintragen
mkdir -p config data
cp apaleo-odoo.config.example.yaml config/apaleo-odoo.config.yaml   # dann bearbeiten
cp mapping-BSP.csv config/           # die von deinem Steuerberater geprüfte Zuordnung
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
| `export` | Schreibt die Odoo-Importdateien (CSV mit Buchungssätzen als Entwurf) eines Monats oder Zeitraums nach allen Prüfungen; `--dry-run` schreibt nichts, `--demo` nimmt die Demodaten. |
| `schedule` | `schedule --once` exportiert jeden fälligen Zeitraum, der noch nicht im Ausgabeordner liegt, und endet. Für Cron und Docker. |

`apaleo-odoo <Befehl> --help` zeigt die Optionen. Exit-Codes: 0 Erfolg, 1 eine Prüfung oder ein Lauf ist fehlgeschlagen, 2 falscher Aufruf. Jeder Befund-Code mit Lösung: [docs/troubleshooting.md](docs/troubleshooting.md).

## Konfiguration

Eine YAML-Datei und Umgebungsvariablen für das Secret. Jeder Schlüssel mit Standardwert und Umgebungsvariable: [docs/configuration.md](docs/configuration.md). Die Vorlage zum Kopieren: [apaleo-odoo.config.example.yaml](apaleo-odoo.config.example.yaml).

## Was es nicht macht

- Keine Übertragung nach Odoo über die externe API: Das Tool schreibt nur Dateien, die deine Kanzlei von Hand mit dem Standardimport von Odoo importiert.
- Kein Buchen: Die Buchungssätze kommen als Entwürfe an; gebucht wird in Odoo, nach der Prüfung.
- Keine Rechnungen, keine Partner (Kunden) und keine offenen Posten pro Partner. Rechnungen an Firmen gehen auf ein Sachkonto für Forderungen.
- Keine Zahlungen und kein Abgleich (Reconciliation) in Odoo.
- Keine Kostenstellen (Kostenrechnung, analytic accounts).
- Keine PDF-Belege.
- Keine Buchung von Gebühren der Zahlungsdienstleister, Rückbuchungen (Chargebacks) oder Provisionen der Buchungsportale. Die bucht deine Kanzlei aus den Abrechnungen.
- Keine Steuern auf Zahlungsbasis (Cash Basis): Die Datei bucht die Umsatzsteuer mit dem Geschäftstag, nach vereinbarten Entgelten.
- Nur die Währung des Odoo-Unternehmens (EUR, oder CHF), die die Währung des Hotels sein muss, ohne Umrechnung.
- Keine Vorlage für Österreich oder die Schweiz.
- Keine Weboberfläche, kein gehosteter Dienst, kein Odoo-Modul, kein E-Mail-Versand, kein zertifiziertes Archiv.
- Nur apaleo und keine anderen Zielformate wie DATEV, BMD oder Abacus. Ein anderes PMS ist als Beitrag willkommen; siehe [docs/architecture.md](docs/architecture.md).

## Vergleich mit kostenpflichtigen Connectoren

Im apaleo Store gibt es einen kostenpflichtigen Odoo-Connector. Die Tabelle vergleicht das Angebot, wie es die Store-Seite beschreibt, mit diesem Tool, ohne Namen zu nennen.

| | Kostenpflichtiger Connector im apaleo Store | apaleo-odoo-export |
|---|---|---|
| Preis | 24-51 EUR pro Monat und Betrieb (je nach Anzahl der Betriebe), laut apaleo Store, Oktober 2026 | kostenlos |
| Betrieb | beim Anbieter | bei dir (Rechner, Server oder Docker) |
| Einrichtung | Oberfläche des Anbieters | Konfigurationsdatei und Kontenzuordnung (CSV) |
| Übertragung nach Odoo | der Anbieter sendet die Buchungen an Odoo | Datei, die deine Kanzlei mit dem Standardimport von Odoo importiert; kein API-Zugang nötig |
| Steuern in Odoo | auf der Store-Seite nicht beschrieben | jede Erlös- und Anzahlungszeile mit ihrer Odoo-Steuer; Odoo legt die Steuerzeilen und die Kennzahlen der UStVA selbst an |
| Entwürfe oder gebucht | auf der Store-Seite nicht beschrieben | immer Entwürfe; gebucht wird in Odoo |
| Support | Support des Anbieters | Community, ohne Garantie |
| Vorlagen für die Zuordnung | Zuordnung der Konten in der Oberfläche des Anbieters | Vorschläge nach SKR03 oder SKR04, geprüft von deinem Steuerberater |

Selbst betreiben heißt: Du behältst die Daten und zahlst nichts, aber du spielst Updates ein, behältst die geplanten Läufe im Blick, gibst die Dateien selbst an deine Kanzlei weiter, jemand importiert sie jeden Monat in Odoo, und du löst Probleme selbst oder mit einem technischen Helfer. Kann das niemand übernehmen, ist ein bezahlter Connector vielleicht die bessere Wahl.

apaleo-odoo-export baut auf [apaleo-datev-export](https://github.com/krautdawg/apaleo-datev-export), [apaleo-bmd-export](https://github.com/krautdawg/apaleo-bmd-export) und [apaleo-abacus-export](https://github.com/krautdawg/apaleo-abacus-export) auf; wer mit DATEV, BMD oder Abacus bucht, nimmt eines dieser Projekte.

## Häufige Fragen

**Ist das ein kostenloser apaleo Odoo Connector?** Ja, im Sinne von: Es bringt deine apaleo-Buchungen kostenlos in die Odoo Buchhaltung, als Datei statt über eine Verbindung. Es steht unter der MIT-Lizenz. Deine Kosten sind der Rechner, auf dem es läuft, und die Zeit deines Steuerberaters für die Prüfung der Zuordnung und den Import.

**Wohin gehen meine Daten?** Nur auf deine eigene Festplatte. Das Tool liest apaleo mit deiner Custom App und schreibt Dateien in einen lokalen Ordner. Nichts ist gehostet, und es schickt nichts an uns, an Odoo oder an andere. Die Datei enthält keine Gästenamen: Bezeichnungen nutzen Kontobezeichnungen, nie die Namen von Gastfolios.

**Welche Odoo-Versionen und Editionen gehen?** Odoo 17, 18 oder 19, Community oder Enterprise, auf Odoo Online, Odoo.sh oder selbst gehostet, mit der deutschen Lokalisierung (SKR03 oder SKR04). Das Tool braucht keinen API-Zugang und kein Modul: Die Datei kommt über den Standardimport von Odoo, deshalb geht es auch mit dem Tarif Standard von Odoo Online. Siehe [docs/odoo-import.md](docs/odoo-import.md).

**Kann es direkt an Odoo übertragen, etwa über die externe API?** Nein. Deine Kanzlei importiert die Datei in Odoo; siehe [docs/odoo-import.md](docs/odoo-import.md). Die Übertragung von Entwürfen über die API steht unter „Später geplant“ in [docs/maintainers.md](docs/maintainers.md#später-geplant).

**Rechnet Odoo die Umsatzsteuer, und warum weicht sie manchmal um einen Cent von apaleo ab?** Odoo rechnet die Umsatzsteuer selbst aus der Steuer jeder Zeile und legt die Steuerzeilen an; die Datei enthält keine. apaleo rechnet die Steuer pro Buchung genau und rundet anders als Odoo, deshalb kann die Summe pro Satz um wenige Cent im Monat abweichen. Das Tool wählt die Nettobeträge so, dass jeder Buchungssatz trotzdem den Bruttobetrag aus apaleo trifft, und zeigt den Unterschied pro Satz im Protokoll; siehe [docs/odoo-format.md](docs/odoo-format.md#basisanpassung-warum-manche-nettobeträge-um-einen-cent-abweichen).

**Hat ein Steuerberater die Datei schon importiert?** Noch nicht. Die Datei folgt dem dokumentierten Import von Journalbuchungen in Odoo; die Quellen stehen in [docs/odoo-format.md](docs/odoo-format.md). Der Maintainer hat sie lokal in Odoo 17, 18 und 19 Community importiert; der erste Testimport mit einer Kanzlei wird mit Datum und Ergebnis in [docs/maintainers.md](docs/maintainers.md#testimporte) festgehalten.

**Kann ich einen Import rückgängig machen?** Ja. Die Buchungssätze kommen als Entwürfe in das Journal aus `odoo.journal`; Entwürfe löscht deine Kanzlei, gebuchte Buchungssätze storniert sie. Importiere nie eine Datei aus `--overwrite`, bevor die Buchungssätze der alten Datei gelöscht oder storniert sind; siehe [docs/odoo-import.md](docs/odoo-import.md#einen-monat-ersetzen).

**Mehrere Hotels?** Trag sie unter `properties` in der Konfiguration ein. Jedes bekommt eine eigene Zuordnung und eine eigene Datei. Ein Journal pro Hotel im selben Unternehmen: setz `properties[].journal`. Ein Unternehmen pro Hotel: Die Steuer-IDs und External IDs der Datei enthalten die ID des Unternehmens (`odoo.companyId`), also bekommt jedes Unternehmen eine eigene Konfigurationsdatei, die du mit `--config` wählst.

**Ich nutze heute einen bezahlten Connector. Kann ich wechseln?** Ja. Leg die Zuordnung mit `init-mapping --template skr03-hotel` (oder `skr04-hotel`) an und übertrag Konten, die von der Vorlage abweichen, von Hand; prüf das Ergebnis mit deinem Steuerberater ([Umstieg von einem anderen Connector](docs/mapping-guide.md#umstieg-von-einem-anderen-connector)). Lass den alten Connector weiterlaufen, bis der erste Monat aus diesem Tool in einer Testdatenbank dieselben Summen ergibt, und fang dann mit dem ersten Monat an, den der alte Connector nicht mehr übertragen hat, damit nichts doppelt ankommt; siehe [docs/docker.md](docs/docker.md#der-erste-lauf).

**Und Hotels in Österreich oder der Schweiz?** Dafür gibt es keine Vorlage. Mit der Lokalisierung l10n_at oder l10n_ch geht es nur über eine Kontenzuordnung, die du mit deiner Kanzlei von Hand anlegst, mit den Steuern deines Odoo-Unternehmens; das Tool warnt dann bei jeder Steuer, die es nicht kennt (`W-TAX-UNCHECKED`). Die Buchungsregeln folgen dem deutschen UStG.

**Gibt es das auch für DATEV, BMD oder Abacus?** Ja, als eigene Projekte: [apaleo-datev-export](https://github.com/krautdawg/apaleo-datev-export) für DATEV, [apaleo-bmd-export](https://github.com/krautdawg/apaleo-bmd-export) für BMD in Österreich und [apaleo-abacus-export](https://github.com/krautdawg/apaleo-abacus-export) für Abacus in der Schweiz.

**Ist die Zuordnung Steuerberatung?** Nein. Die Vorlagen sind Vorschläge. Jede Zeile entscheidet dein Steuerberater.

## Haftungsausschluss

Ohne Gewähr, keine Haftung, keine Steuerberatung. Dein Steuerberater muss die Kontenzuordnung, die Odoo-Steuern und die ersten Importe in Odoo prüfen. Lies den vollständigen [Haftungsausschluss](DISCLAIMER.md) (verbindlich auf Deutsch, mit einer unverbindlichen englischen Übersetzung). Keine Verbindung zur apaleo GmbH oder zur Odoo S.A.

## Mitmachen

Fehlermeldungen, Korrekturen, Wissen über Odoo, die Umsatzsteuer und die Kontenzuordnung und neue Quellen sind willkommen, ebenso Berichte über Testimporte in Odoo. Lies zuerst [CONTRIBUTING.md](CONTRIBUTING.md): Einrichtung, OpenSpec-Ablauf und die Regel, dass Testdaten nie echte Gästedaten enthalten. Issues und Pull Requests auf Englisch sind ebenso willkommen; Code, Bezeichner und Commits sind auf Englisch. Sicherheitsprobleme: [SECURITY.md](SECURITY.md). Änderungen: [CHANGELOG.md](CHANGELOG.md).

## Lizenz

[MIT](LICENSE) (englischer Originaltext).
