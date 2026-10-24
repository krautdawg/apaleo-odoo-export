# Architektur, für Mitwirkende

apaleo-odoo-export ist ein kleines Kommandozeilenprogramm in TypeScript (Node.js 24, ESM, strenge Typen, drei Abhängigkeiten zur Laufzeit: `csv-parse`, `yaml`, `zod`). Es liest ein PMS (apaleo) und schreibt ein Zielformat (Odoo Buchhaltung, Buchungssätze als CSV für den Standardimport). Der Code ist so geschnitten, dass eine zweite Quelle (zum Beispiel Mews, Smoobu oder Stripe) oder ein zweites Zielformat dazukommen kann, ohne den Rest anzufassen. Geplant ist davon nichts; die Schnittstellen sind für Mitwirkende da, die so etwas brauchen.

Code, Bezeichner und Commit-Nachrichten sind auf Englisch; diese Seite erklärt sie auf Deutsch.

## Module

```text
src/
  cli/          Einstieg, Auswertung der Argumente, CommandContext, eine Datei pro Befehl in cli/commands/
  core/         Typen und Hilfen ohne PMS-Bezug: Konfiguration, Datum, Geld, Befunde, CP1252, der Vertrag SourceAdapter
  sources/
    apaleo/     der Adapter für apaleo: Token, HTTP mit Wiederholungen, Schemas nach der Swagger-Beschreibung, Umwandlung in die Typen aus core
  demo/         export --demo: aufgezeichnete apaleo-Antworten aus examples/demo/, ohne Netz
  mapping/      die Kontenzuordnung als CSV: laden, auflösen, prüfen, die Hotelvorlagen für SKR03 und SKR04, das Wissen über l10n_de, das Erkennen einer kopierten Zuordnung aus einem Vorgängerprojekt
  posting/      Journalzeilen + Kontenzuordnung -> Odoo-Buchungen, mit der Prüfung der Umsatzsteuer
  odoo/         der Writer für die Odoo-Importdatei: Buchungssätze pro Tag, Steuermodell von Odoo, Basisanpassung, Prüfung, Bereinigung, Bewegungsmodell
  export/       der Ablauf: Regeln für Zeiträume, Abruf, Buchen, Plausibilitätsprüfungen, Ausgabeordner und Manifest
  schedule/     schedule --once: welche Zeiträume fällig sind, dann der Export für jeden
```

Die Abhängigkeiten zeigen in eine Richtung:

```text
cli -> export / schedule -> sources/<name>     (Verdrahtung)
                        -> mapping, posting, odoo -> core
```

Zwei Lint-Regeln (in `eslint.config.js`, getestet in `test/lint/`) sorgen dafür, dass das so bleibt:

- `core`, `odoo`, `mapping` und `posting` dürfen nichts aus `src/sources/` importieren. Sie sehen nur die kanonischen Typen in `src/core/source.ts`.
- Alles unter `src/` außer dem Einstieg der Kommandozeile erreicht die Uhr, das Netz und die Umgebung nur über den übergebenen `CommandContext` (`ctx.now()`, `ctx.fetchFn`, `ctx.env`, `ctx.fs`). Kein `new Date()`, kein `Date.now()`, kein nacktes `fetch` und kein `process.env`. Tests bauen mit `createTestContext()` in `test/helpers/context.ts` einen Kontext mit Attrappen.

## Der Vertrag SourceAdapter

`src/core/source.ts` legt fest, was eine Quelle liefert. Eine neue Quelle setzt diese Schnittstelle in `src/sources/<name>/` um:

```ts
interface SourceAdapter {
  readonly name: string;
  listProperties(): Promise<SourceProperty[]>;
  getChartOfAccounts(propertyId: string): Promise<SourceAccount[]>;
  /** every business day from `from` to `toExclusive`, sorted with sortLedgerLines */
  getLedger(propertyId: string, from: LocalDate, toExclusive: LocalDate): Promise<LedgerLine[]>;
  getAccountTotals(propertyId: string, businessDate: LocalDate): Promise<AccountTotals>;
}
```

### Die kanonische Buchungszeile

Eine `LedgerLine` ist ein gebuchtes Paar aus Soll und Haben im Buchungsjournal der Quelle:

| Feld | Bedeutung |
|---|---|
| `businessDate` | der Geschäftstag (`YYYY-MM-DD`), wird zum Belegdatum |
| `postedAt` | der Zeitstempel der Quelle, wie gesendet |
| `debit`, `credit` | die beiden Konten: `number`, `name`, `type`, optional `parentNumber` |
| `command` | der Geschäftsvorfall, zum Beispiel `PostCharge`, `PostPayment` |
| `currency` | muss die Währung des Zielformats sein (`TargetWriter.currency`, bei Odoo `odoo.currency`; sonst `E-CURRENCY`) |
| `grossCents` | Bruttobetrag in ganzen Cent mit dem Vorzeichen der Quelle; Nachlässe sind negativ |
| `netPrecise`, `netCents` | Nettobetrag als genauer Dezimaltext der Quelle (apaleo schickt bis zu acht Nachkommastellen, z. B. `"12.5210084"`) und kaufmännisch auf ganze Cent gerundet |
| `taxes[]` | `vatType`, `percent`, `amountPrecise` (genauer Dezimaltext) und `amountCents` (gerundet), so weitergegeben, wie sie ankommen |
| `receipt`, `reference`, `referenceType` | Rechnungs- oder Zahlungsreferenz und die Reservierung, für das Protokoll (siehe `posting.text2`) |
| `sourceEntryNumber`, `source` | damit sich jede Zeile bis zur Quelle zurückverfolgen lässt |

Die Kontotypen nutzen die Namen von apaleo (`Revenues`, `Payments`, `Liabilities`, `Receivables`, `CityTaxes`, `Vat`, ...), das genaueste Modell, das bisher bekannt ist. Eine andere Quelle ordnet ihre Konten diesen Typen zu. Der Bruttobetrag ist immer ein ganzer Centbetrag: Rechne Gleitkommazahlen am Rand um, wie es `toCents` in `src/core/money.ts` tut, und lehne Bruttobeträge mit Bruchteilen eines Cents ab. Netto- und Steuerbeträge dürfen genauer sein; behalte sie als Dezimaltext (`netPrecise`, `amountPrecise`) und runde sie für die Felder in Cent (`…Cents`) kaufmännisch (`decimalToCents`). Genaue Beträge addierst du mit `sumDecimals` exakt, nie als Gleitkommazahlen.

`getAccountTotals` liefert die Daten für die optionale Vollständigkeitsprüfung (`checks.aggregates`). Eine Quelle ohne solche Summen kann eine leere Liste von Konten zurückgeben.

### Eine Quelle hinzufügen (zum Beispiel Smoobu)

1. Leg `src/sources/smoobu/` an, mit einem Client, der nur `ctx.fetchFn` und `ctx.now()` nutzt, zod-Schemas für die Antworten, die du liest, und Umwandlungen in `SourceProperty`, `SourceAccount` und `LedgerLine`.
2. Bau die Quelle aus der Konfiguration in einer Funktion `createSmoobuSource(loaded, ctx)` und wähle sie in `createSource` in `src/cli/source.ts` aus (heute: `ctx.sourceFactory` oder apaleo). Ein neuer Abschnitt der Konfiguration kommt in `configSections` in `src/core/config.ts`; der Docs-Test erwartet ihn dann in `docs/configuration.md`.
3. Leg aufgezeichnete oder erfundene Antworten, die genau der API-Dokumentation der Quelle entsprechen, in `test/fixtures/smoobu/` ab, mit einer `README.md`, die sagt, was jede Datei enthält. Nie echte Gästedaten: Anonymisiere Namen, Reservierungsnummern und Beträge.
4. Teste den Adapter mit den Testdaten über eine Attrappe für `fetchFn` (siehe `test/helpers/apaleo.ts` und `test/apaleo/`). Die Tests für Kontenzuordnung, Buchungsregeln und Export bleiben unabhängig vom PMS und nutzen `FakeSource` in `test/helpers/fake-source.ts`.
5. Hat die Quelle kein Buchungsjournal (Smoobu, Stripe), bildet der Adapter die Paare aus Soll und Haben selbst. Beschreib diese Regel in `docs/`, denn dein Steuerberater muss sie verstehen.

## Die Schnittstelle TargetWriter

Die Buchungsregeln (`src/posting/`) erzeugen Werte vom Typ `PostedBooking`. Das ist ein `OdooBooking` aus `src/odoo/types.ts`: eine apaleo-Zeile mit ihren beiden Konten, dem Bruttobetrag, der Steuerseite und den apaleo-Buchungsnummern, aus denen sie entstand:

```ts
interface OdooBooking {
  businessDate: LocalDate;                  // Geschäftstag, das Datum des Buchungssatzes dieses Tages
  debit: { account: string; label: string }; // Soll-Konto und Bezeichnung der saldierten Zeile, zum Beispiel 1410
  credit: { account: string; label: string }; // Haben-Konto, zum Beispiel 8300 „Logis 7 %“
  grossCents: number;                       // Bruttobetrag in Cent, immer positiv
  vat?: { side: 'debit' | 'credit'; taxRef: string; percent: number; apaleoTaxCents: number }; // die Seite mit der Odoo-Steuer trägt den Nettobetrag
  sourceEntryNumbers: readonly string[];    // für das Protokoll, nie in der Datei
  receipt?: string;                         // Beleg oder Reservierung (posting.text2), nur im Protokoll
}
```

Nur `src/odoo/` kennt das Dateiformat. Der Export (`src/export/`) schreibt Dateien ausschließlich über die Schnittstelle `TargetWriter<B>` aus `src/export/target.ts`, wobei `B` der Buchungstyp des Ziels ist. Die Umsetzung für Odoo ist `odooTarget` in `src/odoo/target.ts` (Einstellungen aus dem Abschnitt `odoo` der Konfiguration und dem Hotel), und `DEFAULT_TARGET` in `src/export/pipeline.ts` wählt sie. Ein `TargetWriter` liefert:

- den Dateinamen und ein Muster, an dem der Ausgabeordner vorhandene und überlappende Dateien erkennt (`fileName`, `filePattern`);
- die gerenderten Bytes und die Befunde über geänderte Werte (`render`, wie `renderOdooCsv` in `src/odoo/writer.ts`, dessen `OdooValidationError` aus `src/odoo/errors.ts` als `FindingsError` alle Fehler auf einmal enthält);
- den Vergleich „unverändert“ (`sameContent`), den Titel des Protokolls, den Block zum Import im Protokoll (`importBlock`, bei Odoo „Import into Odoo Accounting“) und weitere Zeilen nur für das Protokoll (`protocolDetails`, bei Odoo die apaleo-Buchungen hinter jeder Zeile der Datei);
- das Bewegungsmodell einer Buchung (`movements`): um wie viel jedes Konto der Buchung sich im Ziel bewegt, ohne die Steuerzeile auf dem Steuerkonto. Die Plausibilitätsprüfung `E-ACCOUNT-BALANCE` vergleicht damit die Buchungen mit apaleo, ohne Feldnamen des Ziels zu kennen;
- die Zeile der Steuererklärung zu einem Satz (`taxReturnLine`, bei Odoo die UStVA-Kennzahl: 19 % Kz 81, 7 % Kz 86), die die Übersicht neben jeder Steuer und jedem Satz zeigt;
- die eigenen Felder des Ziels im Manifest (`manifestFields`, bei Odoo `odooCompanyId`, `odooJournal`, die Zahl der Buchungssätze und Zeilen, die Summe im Soll und die Steuer pro Steuer, aus denselben Einstellungen wie der Block zum Import); ein Ziel ohne solche Einstellungen gibt `{}` zurück;
- die Währung, in der die Datei bucht (`currency`, bei Odoo `odoo.currency`): Ein Hotel oder eine apaleo-Zeile in einer anderen Währung lehnt der Export mit `E-CURRENCY` ab, denn das Tool rechnet nicht um;
- die Hinweise (`advice`) für die Meldungen `E-PERIOD-OVERLAP`, `E-FILE-EXISTS` und `E-CURRENCY`: welches Programm die Datei importiert, welche Konfigurationswerte die Datei ändern, wie die Kanzlei eine importierte Datei rückgängig macht und warum die Datei keine andere Währung tragen kann.

Was der Odoo-Writer schreibt und gegen welche Quellen er geprüft wurde, steht in [odoo-format.md](odoo-format.md), wie die Kanzlei die Datei importiert in [odoo-import.md](odoo-import.md). Seine Golden Files liegen in `test/golden/odoo/` und werden Byte für Byte verglichen (siehe `test/odoo/golden.test.ts`).

### Angenommen, jemand braucht ein anderes Zielformat

Ein Beispiel ohne Zusage: Eine Kanzlei bucht für ein anderes Hotel mit einer anderen Buchhaltungssoftware und möchte dieselben Buchungen als Datei für diese Software. Dann

1. kommt der Writer nach `src/<ziel>/`, hängt nicht von `src/sources/` ab und meldet fehlerhafte Daten als Befunde mit eigenen Codes, die in [troubleshooting.md](troubleshooting.md) stehen;
2. bekommt er Golden Files in `test/golden/<ziel>/` und einen Test wie `test/odoo/golden.test.ts`;
3. setzt er `TargetWriter` für seinen Buchungstyp um. Braucht das Ziel andere Felder als `OdooBooking`, gehört die Umrechnung aus den Buchungsregeln in einen eigenen Buchungsschritt für dieses Ziel, nicht in den Writer: Steuerlogik, die nur ein Zielformat betrifft, bleibt in dessen Buchungsschritt.

Besprich so eine Änderung zuerst in einem Issue (Formular „Neue Quelle oder neues Zielformat“); sie braucht eine eigene OpenSpec-Änderung.

## Befunde

Jede Prüfung liefert Werte vom Typ `Finding` (`src/core/findings.ts`) mit einem Code: `E-` blockiert, `W-` warnt, `N-` gibt einen Hinweis. Ein neuer Code braucht eine Zeile in [troubleshooting.md](troubleshooting.md); der Docs-Test schlägt fehl, bis es sie gibt.

## Tests und Konventionen

- `pnpm test` (Vitest), `pnpm lint`, `pnpm typecheck` und `pnpm build` müssen grün bleiben. Die CI führt sie bei jedem Push und jedem Pull Request aus.
- Golden Files: Nach einer gewollten Änderung der Ausgabe starte `UPDATE_GOLDEN=1 pnpm test` und prüfe den Diff.
- Jedes Stück Arbeit ist eine OpenSpec-Änderung in `openspec/changes/`; siehe [CONTRIBUTING.md](../CONTRIBUTING.md).
- Der Docs-Test (`test/docs.test.ts`) prüft, dass Befehle, Optionen, Konfigurationsschlüssel und Befund-Codes in der Dokumentation im Code existieren, dass jeder relative Link und jeder Anker auflöst und dass die Dokumentation deutsch ist und „du“ sagt.
