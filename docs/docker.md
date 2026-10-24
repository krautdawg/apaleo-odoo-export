# Zeitplan und Docker

`apaleo-abacus schedule --once` ermittelt, welche Zeiträume fällig sind, schreibt für jeden, der noch nicht im Ausgabeordner liegt, die Abacus-Datei (AbaConnect «XML Buchungen») und endet. Im Tool läuft keine eigene Uhr: Cron, ein systemd-Timer, ein Kubernetes CronJob oder die Schleife in `docker-compose.example.yml` ruft es auf. Du kannst es so oft aufrufen, wie du willst, zum Beispiel stündlich: Ein Zeitraum, dessen Datei schon existiert, kostet keine Anfrage an apaleo.

Keine Gewähr, keine Steuerberatung, lass deine Kontenzuordnung von deinem Treuhänder prüfen. Lass ihn auch die ersten Importe in Abacus prüfen, bevor das Tool allein läuft.

Es gibt kein Image in einer Registry. Du baust es selbst aus diesem Repository, wie unten gezeigt.

## Was fällig ist

```yaml
schedule:
  timezone: Europe/Zurich   # IANA-Zeitzone (Standard Europe/Zurich); auch APALEO_ABACUS_TIMEZONE
  cadence: monthly          # monthly (Standard) oder daily
  monthly:
    dayOfMonth: 3           # 1 bis 5
  daily:
    offsetDays: 2           # 1 bis 3
  finalAfter: "06:00"       # Ortszeit, ab der vorgestern abgeschlossen ist, "00:00" bis "12:00"
  catchUpDays: 40           # mindestens 3 (monatlich) oder 5 (täglich)
```

- «Heute» ist das Datum in `schedule.timezone` (Standard `Europe/Zurich`), nie eine Schätzung in UTC: Am 3. November um 00:30 Uhr ist in Zürich der 3. November, auch wenn in UTC noch der 2. November ist. Ein Hotel in der Schweiz braucht den Schlüssel also nicht; setz ihn nur, wenn dein Rechner und deine Hotels woanders stehen. `apaleo-abacus doctor` zeigt die Zeitzone, mit der das Tool rechnet.
- `cadence: monthly` (Standard): Ein Kalendermonat ist ab `schedule.monthly.dayOfMonth` des Folgemonats fällig. Mit Tag 3 wird der Oktober ab dem 3. November exportiert, und dein Treuhänder bekommt eine Abacus-Datei pro Monat, früh im Folgemonat.
- `cadence: daily`: Ein Tag ist `schedule.daily.offsetDays` Tage später fällig. Mit 2 (Standard) wird der 18. Oktober am 20. Oktober ab 06:00 Uhr exportiert. Täglich heisst für deinen Treuhänder etwa 30 Importe im Monat; stimm das also vorher mit ihm ab.
- Ein geplanter Lauf schreibt nie einen Zeitraum, der noch nicht abgeschlossen ist. apaleo kann auf einen Tag noch buchen, bis der Tagesabschluss (Night Audit) den *folgenden* Tag schliesst (ein Gast, der um 04:00 Uhr eincheckt, wird auf den Vortag gebucht), und dieser Abschluss läuft nach Mitternacht. Ein Zeitraum, der am Tag T endet, gilt deshalb erst ab `schedule.finalAfter` (Standard 06:00 Uhr) am Tag T+2 als abgeschlossen, nicht früher: Sobald die Datei existiert, überspringt jeder spätere Lauf den Zeitraum, spätere Buchungen kämen also nie in Abacus an. Bis dahin meldet das Tool den Zeitraum als `not yet final` (Hinweis `N-NOT-FINAL`), ohne apaleo zu fragen, und der erste Lauf nach dieser Uhrzeit exportiert ihn. Beispiele mit den Standardwerten: Der 18. Oktober wird am 20. Oktober ab 06:00 Uhr geschrieben; mit `offsetDays: 1` wartet der 19. Oktober bis zum 21. Oktober 06:00 Uhr; mit `dayOfMonth: 1` oder `2` wartet der Oktober bis zum 2. November 06:00 Uhr. Setz `finalAfter` auf die Uhrzeit, zu der dein Tagesabschluss sicher fertig ist (gern früher, nie später als 12:00 Uhr). Ob ein Zeitraum abgeschlossen ist, prüft das Tool in `schedule.timezone` und noch einmal in der Zeitzone des Hotels aus apaleo.
- Ein Rhythmus pro Installation. Lass nie einen täglichen und einen monatlichen Zeitplan in denselben Abacus-Mandanten laufen: Die Buchungen würden doppelt importiert.
- `schedule.catchUpDays`: Nach einem Ausfall wird jeder Zeitraum exportiert, dessen Fälligkeitstag (bei täglich: der Tag selbst) in den letzten `catchUpDays` Tagen liegt, der älteste zuerst. Ein Zeitraum, der aus diesem Fenster gefallen ist, wird nicht mehr automatisch exportiert; starte für ihn `export` von Hand (siehe unten). Der Wert muss bei `cadence: monthly` mindestens 3 und bei `cadence: daily` mindestens 5 sein: Ein Lauf kann einen Zeitraum bis zu vier Tage nach seinem letzten Tag als nicht abgeschlossen zurückhalten (vor `finalAfter`, in einer Zeitzone des Hotels, die hinter `schedule.timezone` liegt), und beim nächsten Lauf muss der Zeitraum noch im Fenster liegen. Starte `schedule --once` mindestens einmal am Tag, zum Beispiel stündlich, wie es die Compose-Schleife tut.

### Der erste Lauf

Der erste Lauf exportiert jeden Zeitraum, der im Nachholfenster fällig ist, nicht nur den neuesten. Mit den Standardwerten exportiert ein erster Lauf zwischen dem 3. und etwa dem 12. eines Monats die letzten zwei Monate.

Hat ein früheres Tool (zum Beispiel ein bezahlter Connector aus dem apaleo Store) einige dieser Zeiträume schon an deinen Treuhänder geliefert, setz `schedule.catchUpDays` für den ersten Lauf so niedrig, dass das Fenster nach dem letzten Zeitraum beginnt, den dieses Tool geliefert hat, und erhöh den Wert danach wieder. Ein Beispiel: Der alte Connector hat den September geliefert, und du startest am 5. November. Mit `catchUpDays: 5` wird nur der Oktober (fällig am 3. November) exportiert. Die Dateien des alten Tools in den Ausgabeordner zu kopieren hilft **nicht**: `schedule` erkennt nur seine eigenen Dateien (einen Eintrag in `manifest.json` oder `<Hotel>/<JJJJ-MM>/ABACUS_Buchungen_<von>-<bis>_<Hotel>.xml` für genau diesen Zeitraum). Der Zeitraum würde also noch einmal exportiert, und Abacus würde ihn doppelt buchen. Prüf vor dem ersten echten Lauf mit `export --month <JJJJ-MM> --dry-run`, was ein Lauf schreiben würde.

### Was übersprungen wird und was nicht

- Ein Hotel und Zeitraum, dessen Abacus-Datei im Ausgabeordner liegt oder in der `manifest.json` dieses Monats als aktuell vermerkt ist (auch nachdem du die Datei verschoben hast), meldet das Tool als `already exported`, ohne apaleo zu fragen.
- Ein fehlgeschlagener Zeitraum (zum Beispiel `E-UNMAPPED`) wird bei jedem Lauf erneut versucht, bis er klappt oder das Nachholfenster verlässt.
- Ein Zeitraum ohne Buchungen schreibt keine Datei und wird deshalb bei jedem Lauf im Fenster erneut abgefragt.
- Nachbuchungen, nachdem eine Datei geschrieben wurde, holt das Tool nicht automatisch ab. Dafür gibt es den Ablauf mit `export --overwrite` in [export.md](export.md#noch-einmal-exportieren), den du von Hand startest, nachdem dein Treuhänder die importierten Buchungen in Abacus gelöscht oder storniert hat ([abacus-import.md](abacus-import.md#rückgängig-machen)).

### Ausgabe und Exit-Codes

Eine Zeile pro Hotel und Zeitraum:

```text
2026-11-03T06:30:12+01:00 BSP 2026-10 written /data/BSP/2026-10/ABACUS_Buchungen_20261001-20261031_BSP.xml
2026-11-03T06:30:12+01:00 BSP2 2026-10 already exported /data/BSP2/2026-10/ABACUS_Buchungen_20261001-20261031_BSP2.xml
2026-11-03T06:30:13+01:00 BSP3 2026-10 failed E-UNMAPPED
  E-UNMAPPED (apaleo_account): apaleo account RevenueFoodAndBeverages_Normal:8.10 ...
2026-11-03T06:30:14+01:00 BSP4 2026-10 written /data/BSP4/2026-10/ABACUS_Buchungen_20261001-20261031_BSP4.xml W-VAT-ROUNDING
  W-VAT-ROUNDING: ... a rounding difference of 0.01, added to the rounding total of the summary
```

Jede Zeile erscheint, sobald ihr Hotel und Zeitraum fertig sind; ein Lauf, der mittendrin abbricht, zeigt also trotzdem die Dateien, die er geschrieben hat. Das Ergebnis ist `written`, `already exported`, `no bookings`, `not yet final` oder `failed`, gefolgt von jedem Befund-Code (zuerst `E-`, dann Warnungen `W-` und Hinweise `N-`) und den Befunden selbst, eingerückt, damit auch die E-Mails von Cron und `docker logs` die Warnungen zeigen. Ist nichts fällig, steht dort `nothing due` mit dem heutigen Datum und der Zeitzone. Der Exit-Code ist 0, wenn jeder Zeitraum geschrieben wurde, schon exportiert war, keine Buchungen hatte oder noch nicht abgeschlossen ist, 1, wenn einer fehlgeschlagen ist, und 2 bei falschem Aufruf (zum Beispiel `schedule` ohne `--once`). Ein Secret erscheint nie in der Ausgabe.

## Docker Compose (empfohlen)

```sh
git clone https://github.com/krautdawg/apaleo-abacus-export.git
cd apaleo-abacus-export
cp .env.example .env                 # APALEO_CLIENT_SECRET eintragen
mkdir -p config data
cp apaleo-abacus.config.example.yaml config/apaleo-abacus.config.yaml   # dann bearbeiten
# die Kontenzuordnung(en) nach config/ legen, zum Beispiel config/mapping-BSP.csv
sudo chown 1000:1000 data            # der Container läuft als Benutzer node (uid 1000)
docker compose -f docker-compose.example.yml up -d --build
docker compose -f docker-compose.example.yml logs -f
```

Der Dienst `apaleo-abacus` (Image `apaleo-abacus-export:local`, aus diesem Repository gebaut) ruft `schedule --once` auf, wartet eine Stunde und wiederholt das. Die Dateien erscheinen in `./data/<Hotel>/<JJJJ-MM>/`; wie sie zu deinem Treuhänder kommen, steht unten in [Wo dein Treuhänder die Dateien findet](#wo-dein-treuhänder-die-dateien-findet).

Die Zeitzone für «heute» ist `Europe/Zurich`. Stehen deine Hotels woanders, setz sie in der Konfiguration (`schedule.timezone`) oder nimm im Compose-Beispiel die auskommentierte Zeile `APALEO_ABACUS_TIMEZONE` unter `environment:` hinein.

Lässt du das `chown` weg, legt Docker `./data` mit root als Besitzer an, und jeder Zeitraum scheitert mit `E-EXPORT` und `EACCES: permission denied`, gefolgt von dem `chown`-Befehl, den du ausführen musst (`sudo chown -R 1000:1000 data` neben `docker-compose.example.yml`). Der Lauf macht mit den anderen Hotels und Zeiträumen weiter und endet mit 1; es geht nichts verloren, der nächste Lauf nach der Korrektur exportiert sie.

`config/`, `data/` und `./schedule.log` (siehe Cron auf dem Host unten) enthalten den Mandanten, die Kontenzuordnung und die exportierten Buchungen. Sie liegen im geklonten Repository, und `.gitignore` schliesst sie aus, damit ein `git add -A` sie nicht mitnimmt. Sichere sie getrennt.

So ist der Container aufgebaut:

| Pfad | Inhalt | Einbindung |
| --- | --- | --- |
| `/config` | `apaleo-abacus.config.yaml` und die Kontenzuordnungen (CSV); auch das Arbeitsverzeichnis | `./config`, nur lesbar |
| `/data` | die Exporte (`APALEO_ABACUS_OUTPUT_DIR=/data`, geht `output.dir` vor) | `./data` |
| `/app` | das gebaute Tool | im Image |

Weil das Arbeitsverzeichnis `/config` ist, zeigt ein Pfad zur Kontenzuordnung in der Konfiguration wie `./mapping-BSP.csv` (der Standard für `properties[].mapping`) in den Ordner `config/`.

### Secrets und Umgebung

Die eingebundene Konfiguration braucht kein Secret: `APALEO_CLIENT_SECRET` kommt aus `.env`, und Git ignoriert diese Datei. Schreib es nie in die Konfigurationsdatei; das Tool lehnt das ab. Neben dem Secret lassen sich nur diese einzelnen Werte aus der Umgebung setzen: `APALEO_ABACUS_CONFIG`, `APALEO_ABACUS_OUTPUT_DIR`, `APALEO_CLIENT_ID` und `APALEO_ABACUS_TIMEZONE`. Im Image sind `APALEO_ABACUS_CONFIG=/config/apaleo-abacus.config.yaml` und `APALEO_ABACUS_OUTPUT_DIR=/data` schon gesetzt. Listen wie `properties` bleiben in der Konfigurationsdatei: `APALEO_ABACUS_PROPERTIES` lehnt das Tool mit einer entsprechenden Meldung ab.

### Einmalige Befehle

Mit Argumenten führt der Compose-Dienst genau diesen einen Befehl aus und endet, statt in der Schleife zu laufen:

```sh
docker compose -f docker-compose.example.yml run --rm apaleo-abacus export --month 2026-10 --dry-run
docker compose -f docker-compose.example.yml run --rm apaleo-abacus export --month 2026-10
docker compose -f docker-compose.example.yml run --rm apaleo-abacus mapping check --property BSP
docker compose -f docker-compose.example.yml run --rm apaleo-abacus doctor
```

So schliesst du eine Lücke nach einem Ausfall, der länger als `schedule.catchUpDays` war, oder startest `export --overwrite` nach einer Nachbuchung.

## Wo dein Treuhänder die Dateien findet

Jeder Lauf legt pro Hotel (mit seiner apaleo-ID) und Monat einen Ordner an. Im Container ist das `/data/<Hotel>/<JJJJ-MM>/`, auf dem Host `./data/<Hotel>/<JJJJ-MM>/`:

```text
data/
  BSP/
    2026-10/
      ABACUS_Buchungen_20261001-20261031_BSP.xml            die Abacus-Datei (AbaConnect "XML Buchungen")
      ABACUS_Buchungen_20261001-20261031_BSP.protokoll.txt  Summen pro Konto und MWST-Code, Block "Import into Abacus FIBU"
      manifest.json                                         Prüfsummen; daran erkennt der nächste Lauf, was schon exportiert ist
```

Für den Oktober des Hotels `BSP` sind das also `/data/BSP/2026-10/ABACUS_Buchungen_20261001-20261031_BSP.xml` und daneben das Protokoll `/data/BSP/2026-10/ABACUS_Buchungen_20261001-20261031_BSP.protokoll.txt`.

Das Tool verschickt nichts per E-Mail und lädt nichts in eine Cloud: Es schreibt nur in den Ausgabeordner. Wie die Dateien zu deinem Treuhänder kommen, entscheidet ihr im Hotel, zum Beispiel über einen freigegebenen Ordner, auf den `./data` zeigt, oder über den Datenaustausch, den dein Treuhänder ohnehin anbietet. Gib ihm die `.xml` zusammen mit dem Protokoll: Den Block «Import into Abacus FIBU» vergleicht er vor dem Import mit dem Mandanten. Ändere die Datei dabei nicht, und öffne und speichere sie nicht in einem anderen Programm; Abacus liest sie so, wie das Tool sie geschrieben hat. Wie dein Treuhänder sie in Abacus importiert, steht in [abacus-import.md](abacus-import.md#buchungen-importieren).

Lösch oder verschieb nach der Übergabe nicht den ganzen Monatsordner, und nie die `manifest.json`: Solange der Zeitraum im Nachholfenster liegt, würde der nächste Lauf ihn sonst noch einmal exportieren, und Abacus würde ihn doppelt buchen. Die `.xml` allein darfst du verschieben; der Eintrag in `manifest.json` genügt.

## Cron auf dem Host statt der Schleife

Wenn dir Cron auf dem Host lieber ist als ein Container, der dauerhaft läuft, baust du das Image einmal und lässt Cron stündlich einen kurzlebigen Container starten:

```sh
docker compose -f docker-compose.example.yml build
crontab -e
# diese Zeile eintragen (Pfad anpassen):
0 * * * * cd /opt/apaleo-abacus-export && docker compose -f docker-compose.example.yml run --rm apaleo-abacus schedule --once >> schedule.log 2>&1
```

Ohne Docker, nach der Installation aus dem Quellcode (`pnpm install --frozen-lockfile && pnpm build`), lautet die Cron-Zeile:

```sh
0 * * * * cd /opt/apaleo-abacus-export && node dist/cli/main.js schedule --once >> schedule.log 2>&1
```

Cron rechnet in der Zeitzone des Rechners, das Tool in `schedule.timezone`. Das stört nicht: Weil jeder Lauf nur exportiert, was fällig und abgeschlossen ist, genügt ein stündlicher Aufruf zu jeder Minute. Cron schickt die Ausgabe per E-Mail an den Benutzer des Rechners, wenn das eingerichtet ist; sonst behalte `./schedule.log` im Blick. Ein fehlgeschlagener Lauf endet mit 1 und nennt den Befund-Code. Eine Alarm-E-Mail gibt es in dieser Version nicht.

## Einfaches docker run

```sh
docker build -t apaleo-abacus-export:local .
docker run --rm --env-file .env -v "$PWD/config:/config:ro" -v "$PWD/data:/data" apaleo-abacus-export:local
docker run --rm --env-file .env -v "$PWD/config:/config:ro" -v "$PWD/data:/data" apaleo-abacus-export:local export --month 2026-10
```

Der Standardbefehl des Image ist `schedule --once`; Argumente ersetzen ihn. Das Image läuft als Benutzer node (uid 1000), deshalb das `chown` für `./data` aus dem Abschnitt Docker Compose. Welche Version läuft, zeigt `docker run --rm apaleo-abacus-export:local --version`; die OCI-Labels (`docker inspect apaleo-abacus-export:local`) nennen apaleo und Abacus, das Repository und die MIT-Lizenz.

### Die Demo im Image

`export --demo` braucht keine Konfiguration und kein Secret: Es exportiert den September 2026 des erfundenen Schweizer Hotels `BSP` «Hotel Beispiel» in CHF. Der Probelauf funktioniert so, wie er ist:

```sh
docker run --rm apaleo-abacus-export:local export --month 2026-09 --demo --dry-run
```

Ohne `--dry-run` schreibt die Demo nach `./demo-output/` unterhalb des Arbeitsverzeichnisses, und das ist im Image `/config`, das root gehört (und das Compose nur lesbar einbindet). Der Lauf würde mit `E-EXPORT` und `EACCES` scheitern, und die Meldung nennt `-w /data`. Setz das Arbeitsverzeichnis mit `-w /data` auf einen Datenordner, in den der Benutzer node (uid 1000) schreiben darf:

```sh
mkdir -p data && sudo chown 1000:1000 data
docker run --rm -w /data -v "$PWD/data:/data" apaleo-abacus-export:local export --month 2026-09 --demo
```

Die Datei landet als `./data/demo-output/BSP/2026-09/ABACUS_Buchungen_20260901-20260930_BSP_DEMO.xml`, daneben ihr Protokoll und die `manifest.json`. Lösch `./data/demo-output/` danach; importiere nie eine Demodatei in einen echten Mandanten.

## Aktualisieren

Hol den neuen Quellcode und bau neu. `--pull` holt auch das neueste Basis-Image `node:24-bookworm-slim` mit seinen Sicherheitskorrekturen, bau also ab und zu neu, auch ohne neue Version:

```sh
git pull
docker compose -f docker-compose.example.yml build --pull
docker compose -f docker-compose.example.yml up -d
```
