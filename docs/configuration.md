# Konfiguration: alle Einstellungen

Das Tool liest eine Konfigurationsdatei im Format YAML oder JSON und dazu ein paar Umgebungsvariablen. Fang mit [`apaleo-abacus.config.example.yaml`](../apaleo-abacus.config.example.yaml) an: Kopiere die Datei nach `apaleo-abacus.config.yaml` und füll sie aus.

## Wo die Datei liegt

1. `--config <Pfad>` auf der Kommandozeile, sonst
2. die Umgebungsvariable `APALEO_ABACUS_CONFIG`, sonst
3. `./apaleo-abacus.config.yaml` im Arbeitsverzeichnis.

Eine Datei, deren Name auf `.json` endet, wird als JSON gelesen, jede andere als YAML. Unbekannte Schlüssel lehnt das Tool mit ihrem Namen ab, damit ein Tippfehler nie unbemerkt bleibt. Ein Schlüssel ohne Wert (`mandant:`) gilt als nicht gesetzt. Eine Konfiguration aus einem Vorgängerprojekt mit einem Abschnitt `bmd` oder `datev` lehnt das Tool ab und nennt den Abschnitt `abacus`, der ihn ersetzt ([troubleshooting.md](troubleshooting.md#einrichtung-aus-deutschland-oder-österreich-übernommen)). `apaleo-abacus doctor` zeigt, welche Datei verwendet wird und ob sie gültig ist.

## Secrets

Das Client-Secret der apaleo Custom App kommt nur aus der Umgebung: `APALEO_CLIENT_SECRET`. Steht in der Konfigurationsdatei ein Secret unter `apaleo`, startet das Tool nicht und sagt dir, dass du es in die Umgebung verschieben sollst. Mit Docker kommt es in die Datei `.env`, die Git ignoriert; siehe [docker.md](docker.md). Das Tool gibt das Secret nie aus.

## Umgebungsvariablen

Das Tool liest nur diese Variablen. Jede andere Variable, die mit `APALEO_ABACUS_` beginnt, lehnt es mit einer Meldung ab, damit eine falsch geschriebene nicht still wirkungslos bleibt. Listen wie `properties` lassen sich nur in der Datei setzen.

| Variable | Setzt | Typ |
|---|---|---|
| `APALEO_CLIENT_SECRET` | das Client-Secret der Custom App (nie in der Datei) | Text |
| `APALEO_ABACUS_CONFIG` | den Pfad der Konfigurationsdatei | Pfad |
| `APALEO_CLIENT_ID` | `apaleo.clientId` | Text |
| `APALEO_ABACUS_OUTPUT_DIR` | `output.dir` | Pfad |
| `APALEO_ABACUS_TIMEZONE` | `schedule.timezone` (Standard `Europe/Zurich`) | IANA-Zeitzone, zum Beispiel `Europe/Zurich` |

Ein Wert aus der Umgebung geht dem Wert in der Datei vor.

## Schlüssel

### `apaleo`

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `apaleo.clientId` | keiner | Client-ID der Custom App ([setup-apaleo.md](setup-apaleo.md)). Jeder Befehl, der mit apaleo spricht, braucht sie. Auch über `APALEO_CLIENT_ID`. |
| `apaleo.scopes` | wird nicht gesendet | Scopes, durch Leerzeichen getrennt, nur für Clients mit Scopes statt Berechtigungen, zum Beispiel `accounting.read`. Custom Apps mit Berechtigungen lassen den Schlüssel weg. |
| `apaleo.baseUrl` | `https://api.apaleo.com` | Adresse der API. Ändere sie nur, um gegen eine andere apaleo-Umgebung zu testen. Muss https sein (einfaches http nur für localhost). |
| `apaleo.identityUrl` | `https://identity.apaleo.com` | Adresse der Anmeldung, dieselben Regeln wie bei `apaleo.baseUrl`. |

### `abacus`

Diese Werte legt der Abacus-Mandant deines Treuhänders fest. Frag ihn, bevor du die erste Datei schickst. Der Abschnitt ist Pflicht, weil `abacus.mandant` keinen Standardwert hat; fehlt er, nennt das Tool `abacus.mandant`. Was jedes Feld in der Datei bewirkt: [abacus-format.md](abacus-format.md). Wie dein Treuhänder die Datei importiert und was er beim ersten Import prüft: [abacus-import.md](abacus-import.md).

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `abacus` | Pflicht | Der Abschnitt muss da sein, weil `abacus.mandant` keinen Standardwert hat. |
| `abacus.mandant` | Pflicht | Die Mandantennummer in Abacus, 1 bis 6 Ziffern. Sie steht im Block `Parameter` und in jeder Buchung (`Client`); mit der Importeinstellung «nur Buchungen mit gleicher Mandantennummer» lehnt Abacus die Datei in einem anderen Mandanten ab. |
| `abacus.leitwaehrung` | `CHF` | Die Leitwährung des Mandanten, `CHF` oder `EUR`. Jedes Hotel muss in dieser Währung buchen; das Tool rechnet nicht um. |
| `abacus.abrechnungsart` | `vereinbart` | Die MWST-Abrechnungsart: `vereinbart` oder `vereinnahmt`. Sie bestimmt den `UseCode` (0 oder 1) und das Steuer- oder Hilfskonto in der Buchung, nie die Beträge. Mit `vereinnahmt` warnen `doctor` und jeder Export `W-ABRECHNUNGSART-VEREINNAHMT`, siehe [mapping-guide.md](mapping-guide.md#vereinnahmte-entgelte). |
| `abacus.version` | `2015.00` | Die Version der AbaConnect-Schnittstelle: `2015.00`, `2020.00`, `2022.00` oder `2024.00`. Ändere sie nur, wenn Abacus die Datei mit der Standardversion ablehnt. |
| `abacus.mwstKonto` | `2200` | Das Steuerkonto der MWST-Codes (Umsatzsteuer), 1 bis 11 Ziffern; der Wert für die vereinbarte Abrechnung. |
| `abacus.mwstHilfskonto` | `2202` | Das Hilfskonto der MWST-Codes (Umsatzsteuerausgleich Abrechnungsmethode), 1 bis 11 Ziffern; der Wert für die vereinnahmte Abrechnung. |
| `abacus.mwstCodes` | | Die MWST-Codes des Mandanten für die drei Schweizer MWST-Sätze. |
| `abacus.mwstCodes.normal` | `311` | Der MWST-Code für den Normalsatz in der MWST-Tabelle des Mandanten, 1 bis 3 Zeichen `A-Z`, `a-z` und `0-9`. `init-mapping --template kmu-hotel` schreibt die drei Codes in die Kontenzuordnung, `mapping check` prüft sie. |
| `abacus.mwstCodes.reduziert` | `312` | Der MWST-Code für den reduzierten Satz. |
| `abacus.mwstCodes.beherbergung` | `313` | Der MWST-Code für den Sondersatz Beherbergung. |
| `abacus.geschaeftsbereich` | `0` | Der Geschäftsbereich (`Division`), 0 bis 99999999; `0`, wenn der Mandant keine Geschäftsbereiche nutzt. |

Die Standardwerte der Konten und Codes sind die des KMU-Mustermandanten von Abacus. Viele Mandanten nutzen dieselben; prüf sie trotzdem mit deinem Treuhänder in der MWST-Tabelle des Mandanten.

Schreib einen Code mit führender Null, Buchstaben `x` oder `e` in Anführungszeichen, zum Beispiel `normal: "011"`. Ohne Anführungszeichen liest YAML `011` als Zahl 11, `0x1F` als 31 und `1e2` als 100, und `011` und `11` sind verschiedene MWST-Codes. Das Tool lehnt solche Werte bei Mandant, Konten und MWST-Codes ab und nennt den Schlüssel.

### `posting`

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `posting.text2` | `receipt` | Was in `Text2` jeder Buchung steht: `receipt` nimmt den Beleg aus apaleo (Rechnungs- oder Zahlungsreferenz) und sonst die Reservationsreferenz; `reference` nimmt immer die Reservationsreferenz. Nie ein Gastname. Die Belegnummer (`DocumentNumber`) bildet das Tool selbst. |

### `properties`

Die apaleo-Hotels, mit denen das Tool arbeitet. `export` und `schedule --once` exportieren jedes hier eingetragene Hotel, ausser du gibst `--property` an. Die IDs, die die Custom App lesen darf, listet `apaleo-abacus properties`.

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `properties` | leere Liste | Ein Eintrag pro Hotel. |
| `properties[].id` | Pflicht | Die Property-ID in apaleo, zum Beispiel `BSP`. |
| `properties[].mapping` | `./mapping-<id>.csv` | Die Kontenzuordnung (CSV) des Hotels, relativ zum Arbeitsverzeichnis. |
| `properties[].mandant` | `abacus.mandant` | Ein eigener Abacus-Mandant für dieses Hotel. |
| `properties[].geschaeftsbereich` | `abacus.geschaeftsbereich` | Ein eigener Geschäftsbereich für dieses Hotel im Abacus-Mandanten. |

Bucht dein Treuhänder zwei Hotels in denselben Abacus-Mandanten, braucht jedes einen eigenen Geschäftsbereich (`properties[].geschaeftsbereich`) oder einen eigenen Mandanten (`properties[].mandant`), sonst können sich ihre Belegnummern wiederholen. Teilen sich zwei Hotels Mandant und Geschäftsbereich, warnen `doctor` und das Protokoll mit `W-MANDANT-SHARED`.

```yaml
properties:
  - id: BSP
    mapping: ./mapping-BSP.csv
  - id: BSP2
    mapping: ./mapping-BSP2.csv
    geschaeftsbereich: 2
```

### `output`

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `output.dir` | `./exports` | Ordner für die Abacus-Dateien, relativ zum Arbeitsverzeichnis. Jede Datei landet in `<output.dir>/<Hotel>/<JJJJ-MM>/`. Auch über `APALEO_ABACUS_OUTPUT_DIR`. |

### `checks`

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `checks.aggregates` | `false` | Vergleicht das Buchungsjournal zusätzlich mit den Tagessummen von apaleo, Saldo pro Konto, und warnt bei Abweichungen (`W-AGGREGATE-DIFF`, siehe [export.md](export.md)). Braucht die optionale Berechtigung `core.subledger_aggregate.create` und eine zusätzliche Anfrage pro Tag. |

### `schedule`

Nur für `schedule --once`. Was jede Einstellung bewirkt, mit Beispielen: [docker.md](docker.md).

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `schedule.timezone` | `Europe/Zurich` | «Heute» ist das Datum in dieser IANA-Zeitzone. Für ein Hotel in der Schweiz passt der Standard; `apaleo-abacus doctor` zeigt die Zeitzone, mit der das Tool rechnet; ob ein Zeitraum abgeschlossen ist, prüft das Tool zusätzlich in der Zeitzone des Hotels aus apaleo. Auch über `APALEO_ABACUS_TIMEZONE`. |
| `schedule.cadence` | `monthly` | `monthly` (eine Datei pro Monat) oder `daily` (eine Datei pro Tag). Ein Rhythmus pro Installation. |
| `schedule.monthly` | | Einstellungen für `cadence: monthly`. |
| `schedule.monthly.dayOfMonth` | `3` | Ein Monat ist ab diesem Tag des Folgemonats fällig, 1 bis 5. |
| `schedule.daily` | | Einstellungen für `cadence: daily`. |
| `schedule.daily.offsetDays` | `2` | Ein Tag ist so viele Tage später fällig, 1 bis 3. |
| `schedule.finalAfter` | `"06:00"` | Ortszeit, ab der ein Zeitraum, der vorgestern endete, als abgeschlossen gilt, `"00:00"` bis `"12:00"`, in Anführungszeichen. |
| `schedule.catchUpDays` | `40` | Wie viele Tage zurück ein verpasster Zeitraum noch exportiert wird, mindestens 3 (monatlich) oder 5 (täglich), höchstens 366. |

Wann was fällig ist, mit den Standardwerten und der Zeitzone `Europe/Zurich` (06:00 Uhr ist `schedule.finalAfter`):

| Rhythmus | Einstellung | Zeitraum | wird geschrieben ab |
|---|---|---|---|
| monatlich (Standard) | `schedule.monthly.dayOfMonth: 3` | Oktober 2026 | 3. November 2026, 00:00 Uhr in Zürich |
| monatlich | `schedule.monthly.dayOfMonth: 1` | Oktober 2026 | 2. November 2026, 06:00 Uhr in Zürich (vorher `not yet final`) |
| täglich | `schedule.daily.offsetDays: 2` (Standard) | 18. Oktober 2026 | 20. Oktober 2026, 06:00 Uhr in Zürich |
| täglich | `schedule.daily.offsetDays: 1` | 19. Oktober 2026 | 21. Oktober 2026, 06:00 Uhr in Zürich (vorher `not yet final`) |

Ein Zeitraum, der am Tag T endet, ist erst ab `schedule.finalAfter` am Tag T+2 abgeschlossen, nach dem Tagesabschluss (Night Audit), der den Folgetag schliesst. Mit den Standardwerten bekommt dein Treuhänder die Monatsdatei am 3. des Folgemonats. Mehr dazu in [docker.md](docker.md#was-fällig-ist).

## Ein vollständiges Beispiel

```yaml
apaleo:
  clientId: HOTEL-ABACUS-EXPORT
abacus:
  mandant: 1234
  leitwaehrung: CHF
posting:
  text2: receipt
properties:
  - id: BSP
output:
  dir: ./exports
checks:
  aggregates: false
schedule:
  timezone: Europe/Zurich
  cadence: monthly
```

Das Secret kommt in die Umgebung, nicht in diese Datei:

```sh
export APALEO_CLIENT_SECRET='das Secret aus apaleo'
apaleo-abacus doctor
```
