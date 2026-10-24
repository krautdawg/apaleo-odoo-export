# Kontenzuordnung (Mapping): Leitfaden für Hotel und Kanzlei

Die Importdatei für Odoo ist nur so gut wie die Kontenzuordnung. Sie ist eine CSV-Datei pro Hotel (Property), die du in Excel öffnest und mit deinem Steuerberater durchgehst. Sie ordnet jedem apaleo-Konto ein Sachkonto aus dem Kontenplan deines Odoo-Unternehmens zu, dazu die Odoo-Steuer und ihren Steuersatz. **Keine Gewähr, keine Steuerberatung: Jede Zeile der Vorlage ist ein Vorschlag (ungeprüft), den dein Steuerberater bestätigt.**

`init-mapping --template skr03-hotel` schreibt die Datei nach der Vorlage `templates/skr03-hotel.rules.csv`, `--template skr04-hotel` nach `templates/skr04-hotel.rules.csv`. Beide Vorlagen folgen dem deutschen Kontenrahmen von Odoo (l10n_de, Odoo 17, 18 und 19) und den Kontonummern der Hotelvorlagen von apaleo-datev-export. Der Kommentar jeder Zeile sagt, warum sie so vorgeschlagen ist, und nennt die Quelle mit dem Prüfdatum. Odoo Online legt neue Datenbanken mit SKR03 an; welchen Kontenrahmen dein Unternehmen nutzt, siehst du unter Buchhaltung > Konfiguration > Einstellungen.

Ein vollständiges Beispiel liegt in [examples/mapping-BSP.example.csv](examples/mapping-BSP.example.csv): die Zuordnung des erfundenen „Hotel Beispiel Berlin“, genau das, was `init-mapping --template skr03-hotel` für Odoo 18 auf dem Kontenplan der Demo schreibt. Dein Steuerberater kann damit die Ausgabe beurteilen, bevor jemand eine apaleo-App anlegt.

## Ablauf

```sh
apaleo-odoo init-mapping --property BSP --template skr03-hotel      # schreibt mapping-BSP.csv aus dem apaleo-Kontenplan
# Datei mit der Kanzlei prüfen, leere Odoo-Konten ausfüllen, Kasse und Geldtransit mit dem Kontenplan vergleichen
apaleo-odoo mapping check --property BSP                    # prüft die Datei
apaleo-odoo mapping check --property BSP --from 2026-09-01 --to 2026-09-30   # ist jedes gebuchte Konto zugeordnet?
apaleo-odoo init-mapping --property BSP --template skr03-hotel --update   # später: neue apaleo-Konten anhängen, bearbeitete Zeilen bleiben
```

Mit `--update` bleibt jede vorhandene Zeile Byte für Byte, wie sie ist. Hat die aktuelle Vorlage für eine vorhandene Zeile ohne Odoo-Konto inzwischen einen Vorschlag (zum Beispiel weil eine neuere Vorlage eine No-Show-Zeile ausfüllt), nennt `init-mapping` die Zeile und den Vorschlag mit dem Hinweis `N-TEMPLATE-SUGGESTION`; eintragen musst du ihn selbst.

Der Pfad der Datei kann in der Konfiguration stehen (`properties[].mapping`), sonst heißt sie `mapping-<id>.csv` im Arbeitsverzeichnis. `mapping check --from --to` liest das Buchungsjournal des Zeitraums aus apaleo und meldet jedes gebuchte Konto ohne Zuordnung; deine Kanzlei kann die Datei also an einem echten Monat prüfen, bevor ein Export läuft. Die Vorlage trägt für Kasse und Geldtransit die Codes einer frischen Datenbank für `odoo.version` ein, siehe [Zahlungen: Kasse und Geldtransit](#zahlungen-kasse-und-geldtransit).

## Spalten

| Spalte | Bedeutung |
|---|---|
| `apaleo_account` | apaleo-Kontonummer, oder `*` für alle Konten eines Typs |
| `apaleo_type` | apaleo-Kontotyp (Revenues, Payments, Liabilities, Receivables, AccountsReceivable, CityTaxes, …) |
| `apaleo_name`, `apaleo_vat_percent` | zur Information, aus apaleo; bei `*`-Zeilen ist `apaleo_vat_percent` der Umsatzsteuersatz, für den die Zeile gilt |
| `odoo_account` | Code des Sachkontos in Odoo, zum Beispiel `8300`: 1 bis 64 Zeichen aus Buchstaben, Ziffern und Punkt. Leer heißt: nicht zugeordnet, der Export bricht mit `E-UNMAPPED` ab |
| `odoo_tax` | die Odoo-Steuer der Zeile: die ID aus dem Kontenrahmen-Template, zum Beispiel `tax_ust_7_skr03` (die Datei schreibt daraus `account.<Unternehmen>_tax_ust_7_skr03` mit `odoo.companyId`), oder die vollständige External ID einer eigenen Steuer mit Punkt, zum Beispiel `__import__.ust_7_hotel`. Leer heißt: keine Steuer auf dieser Zeile |
| `tax_percent` | der Satz der Steuer, wie ihn deine Kanzlei bestätigt, zum Beispiel `7` oder `19`. Mit Steuer Pflicht (auch `0`), ohne Steuer leer oder `0`. Das Tool kann den Satz der Steuer in Odoo nicht lesen und vergleicht diesen Wert mit dem Satz von apaleo |
| `comment` | Freitext, zum Beispiel die Begründung deiner Kanzlei |

Sätze darfst du mit Komma oder Punkt schreiben (`19,0` oder `19`). Eine Zuordnung von apaleo-abacus-export (Spalten `abacus_account`, `mwst_code`), apaleo-bmd-export (`bmd_account`, `steuercode`) oder apaleo-datev-export (`datev_account`, `bu_key`) liest das Tool nicht; es nennt dann `init-mapping --template skr03-hotel` ([troubleshooting.md](troubleshooting.md#einrichtung-aus-deutschland-oder-österreich-übernommen)).

### Kontonummern und Steuern

Das Tool füllt nie Nullen auf und prüft nur die Form des Kontos (`E-ACCOUNT-FORMAT`), nicht, ob es im Odoo-Unternehmen existiert; das prüft der „Test“ des Imports in Odoo. Konto und Steuer bleiben Text. Formatiere die Spalten `odoo_account` und `odoo_tax` in Excel als Text. Eine Steuer gibst du nie mit ihrem Namen an (`19%`): Namen wiederholen sich in Odoo, und der Import nähme den ersten Treffer (`E-TAX-FORMAT`).

## Welche Zeile gilt?

Für jedes gebuchte apaleo-Konto sucht das Tool in dieser Reihenfolge:

1. genau diese Nummer und dieser Typ;
2. diese Nummer mit beliebigem Typ (Zeilen mit dem Typ `*any*`);
3. das Elternkonto (und dessen Eltern) mit gleichem Typ; eine Elternzeile ohne Odoo-Konto überspringt es;
4. für Typen mit Umsatzsteuer eine `*`-Zeile mit dem Steuersatz der Buchung;
5. für andere Typen eine `*`-Zeile des Typs.

Erlöskonten (Revenues) werden nie per `*` zugeordnet: Ein neues Erlöskonto (Spa, Parken) ordnet ein Mensch zu. Konten je Reservierung (Anzahlungen unter `3000`, Firmenrechnungen unter `9999`, Forderungsverluste unter `6900`, ihre `/Offset`-Konten) erreichen die `*`-Zeilen.

## Steuer und Steuersatz

Die Datei enthält keine Steuerzeilen. Jede Zeile mit Steuer ist eine Basiszeile: Sie trägt den Nettobetrag und die Odoo-Steuer, und **Odoo rechnet die Umsatzsteuer selbst aus der Steuer der Zeile** und legt die Steuerzeilen mit den Kennzahlen der UStVA an. Deshalb muss der Satz der Odoo-Steuer genau dem Satz entsprechen, mit dem apaleo die Leistung berechnet hat: Die Kontenzuordnung nennt den Satz in `tax_percent`, und der Export stoppt mit `E-VAT-RATE`, wenn er nicht zum Satz von apaleo passt. Wie das Tool den Nettobetrag so wählt, dass Odoos Steuer den Bruttobetrag aus apaleo genau erreicht, steht in [odoo-format.md](odoo-format.md#basisanpassung-warum-manche-nettobeträge-um-einen-cent-abweichen).

Die Umsatzsteuern von l10n_de, die das Tool kennt:

| Steuer (SKR03 / SKR04) | Satz | UStVA |
|---|---|---|
| `tax_ust_19_skr03` / `tax_ust_19_skr04` | 19 % | Kennzahl 81 |
| `tax_ust_7_skr03` / `tax_ust_7_skr04` | 7 % | Kennzahl 86 |
| `tax_not_taxable_skr03` / `tax_not_taxable_skr04` | 0 % | Kennzahl 45 (nicht steuerbare Umsätze, Leistungsort im Ausland) |

Eine andere Steuer, zum Beispiel eine eigene Steuer deiner Kanzlei, darfst du eintragen; `mapping check` warnt dann mit `W-TAX-UNCHECKED`, und deine Kanzlei bestätigt, dass sie eine Umsatzsteuer des Unternehmens mit diesem Satz ist. Eine Steuer hat in Odoo genau einen Satz: Nutzt ein Monat dieselbe Steuer mit zwei Sätzen, stoppt der Export mit `E-TAX-RATES`.

### Steuersätze nach Leistungsdatum

Der Satz hängt vom Datum der Leistung ab, nicht vom Datum der Zahlung:

- **Logis (Beherbergung)**: 7 % (§ 12 Abs. 2 Nr. 11 UStG).
- **Speisen** (Frühstück, Restaurant, Halbpension): 7 % für Leistungen ab 2026-01-01 (Steueränderungsgesetz 2025), 19 % für Leistungen davor. Die Vorlage legt Speisen zu 7 % auf dasselbe Konto wie Logis (`8300` bzw. `4300`); ob die Kanzlei ein eigenes Konto für Speisen möchte (zum Beispiel `8301`, in Odoo anzulegen), entscheidet sie. Der Export warnt mit `W-FOOD-RATE`, siehe [Speisen ab 2026](#speisen-ab-2026).
- **Getränke**, Minibar und sonstige Leistungen (Parken, Wellness): 19 %.
- **16 % und 5 %**: die Sätze vom 2020-07-01 bis 2020-12-31. apaleo legt die Konten in jedem Kontenplan an; die Vorlage lässt sie leer, und ein Export für 2020 stoppt mit `E-UNMAPPED`. Exporte für diesen Zeitraum klärst du mit deiner Kanzlei.

### Erlöse ohne Umsatzsteuer

Erlöse ohne Umsatzsteuer im Inland, zum Beispiel eine Stornogebühr, die Schadenersatz ist, tragen **gar keine Steuer**: `odoo_tax` und `tax_percent` bleiben leer (oder `0`). Trag nie `tax_not_taxable_skr03` oder `tax_not_taxable_skr04` ein: Odoo meldet die Basis dieser Steuer in der UStVA-Kennzahl 45, das sind nicht steuerbare Umsätze mit Leistungsort im Ausland. Für Erlöse im Inland, Schadenersatz und durchlaufende Posten wie eine Kurtaxe, die der Gast schuldet, ist das falsch; `mapping check` warnt mit `W-TAX-KZ45`.

### Konten mit Standardsteuer

Einige Konten des Kontenrahmens tragen in Odoo eine Standardsteuer: SKR03 `8300` (7 %), `8400` (19 %), `2401` (7 %), `2406` (19 %); SKR04 `4200` (19 %), `4300` (7 %), `4400` (19 %), `6931` (7 %), `6936` (19 %). In Odoo 17 und 18 bekommt eine Buchungszeile ohne ausdrückliche Steuer die Standardsteuer ihres Kontos. Deshalb schreibt die Datei die Steuerspalte in jeder Zeile, bei einer Zeile ohne Steuer leer: So setzt der Import ausdrücklich „keine Steuer“. Ordnest du eine Zeile ohne Steuer einem solchen Konto zu, meldet `mapping check` den Hinweis `N-DEFAULT-TAX-ACCOUNT`. Das ist richtig, wenn die Zeile ohne Steuer gemeint ist (zum Beispiel Erlöse ohne Umsatzsteuer auf SKR04 `4200`); bearbeite eine solche Buchungszeile in Odoo aber nicht von Hand, sonst gibt Odoo ihr die Standardsteuer wieder.

## Die Vorlagen SKR03 und SKR04

Jede Zeile der Vorlagen ist als „Vorschlag (ungeprüft)“ markiert und nennt ihre Quelle mit dem Prüfdatum. Die erste Kommentarzeile nennt die Version der Vorlage (`skr03-hotel@2`, `skr04-hotel@2`); `init-mapping` schreibt sie in die erste Zeile deiner Datei. Die erste passende Zeile gewinnt; „mit `*`-Zeile“ heißt, dass `init-mapping` zusätzlich eine `*`-Zeile für den Typ und Satz schreibt, die die Konten je Reservierung erreicht.

| apaleo-Typ | Name | apaleo-Satz | SKR03 | SKR04 | Steuer (SKR03 / SKR04) | Satz |
|---|---|---|---|---|---|---|
| Revenues (Erlöse) | No-Show, Storno, Stornierung, Cancellation (auch apaleos Gruppen `RevenueNoShow` und `RevenueCancellationFees`) | 7 % | `8300` | `4300` | `tax_ust_7_skr03` / `tax_ust_7_skr04` | 7 % |
| Revenues (Erlöse) | Logis, Beherbergung, Übernachtung, Zimmer (auch `RevenueAccommodation`) | 7 % | `8300` | `4300` | `tax_ust_7_skr03` / `tax_ust_7_skr04` | 7 % |
| Revenues (Erlöse) | Speisen, Frühstück, Restaurant, Essen, Küche, Halb- und Vollpension, Catering, Bankett (auch `RevenueFoodAndBeverages`) | 7 % | `8300` | `4300` | `tax_ust_7_skr03` / `tax_ust_7_skr04` | 7 % |
| Revenues (Erlöse) | Getränke, Minibar, Bar (auch `RevenueFoodAndBeverages`) | 19 % | `8400` | `4400` | `tax_ust_19_skr03` / `tax_ust_19_skr04` | 19 % |
| Revenues (Erlöse) | jeder Name | 19 % | `8400` | `4400` | `tax_ust_19_skr03` / `tax_ust_19_skr04` | 19 % |
| Revenues (Erlöse) | jeder Name | 7 % | leer | leer | keine |  |
| Revenues (Erlöse) | No-Show, Storno, Stornierung, Cancellation | 0 % | `8200` | `4200` | keine | 0 % |
| Revenues (Erlöse) | jeder Name | 0 % | `8200` | `4200` | keine | 0 % |
| Revenues (Erlöse) | jeder Name | 16 % | leer | leer | keine |  |
| Revenues (Erlöse) | jeder Name | 5 % | leer | leer | keine |  |
| Payments (Zahlungen) | Bar, Kasse, Cash | jeder | Kasse | Kasse | keine |  |
| Payments (Zahlungen) | jeder Name, mit `*`-Zeile | jeder | Geldtransit | Geldtransit | keine |  |
| Receivables (Gästeforderungen) | jeder Name, mit `*`-Zeile | jeder | `1410` | `1210` | keine |  |
| AccountsReceivable (Firmenrechnungen) | jeder Name, mit `*`-Zeile | jeder | `1401` | `1200` | keine |  |
| Liabilities (Anzahlungen) | jeder Name, mit `*`-Zeile | 7 % | `1711` | `3260` | `tax_ust_7_skr03` / `tax_ust_7_skr04` | 7 % |
| Liabilities (Anzahlungen) | jeder Name, mit `*`-Zeile | 19 % | `1718` | `3272` | `tax_ust_19_skr03` / `tax_ust_19_skr04` | 19 % |
| Liabilities (Anzahlungen) | jeder Name, mit `*`-Zeile | 0 % | `1719` | `3280` | keine | 0 % |
| Liabilities (Anzahlungen) | jeder Name, mit `*`-Zeile | 16 % | leer | leer | keine |  |
| Liabilities (Anzahlungen) | jeder Name, mit `*`-Zeile | 5 % | leer | leer | keine |  |
| CityTaxes (Kurtaxe) | jeder Name | jeder | leer | leer | keine |  |
| SecondCityTax (zweite Kurtaxe) | jeder Name | jeder | leer | leer | keine |  |
| GuestLevies (Gästeabgabe) | jeder Name | jeder | leer | leer | keine |  |
| LossOfAccountsReceivable (Forderungsverluste) | jeder Name, mit `*`-Zeile | 7 % | `2401` | `6931` | `tax_ust_7_skr03` / `tax_ust_7_skr04` | 7 % |
| LossOfAccountsReceivable (Forderungsverluste) | jeder Name, mit `*`-Zeile | 19 % | `2406` | `6936` | `tax_ust_19_skr03` / `tax_ust_19_skr04` | 19 % |
| LossOfAccountsReceivable (Forderungsverluste) | jeder Name, mit `*`-Zeile | 0 % | `2400` | `6930` | keine | 0 % |
| House (Hauskonten) | jeder Name | jeder | leer | leer | keine |  |
| TransitoryItems (durchlaufende Posten) | jeder Name | jeder | leer | leer | keine |  |
| Vat (USt aus apaleo) | jeder Name | jeder | leer | leer | keine |  |
| VatOnLiabilities (USt auf Anzahlungen aus apaleo) | jeder Name | jeder | leer | leer | keine |  |

Leere Zeilen sind Absicht: Dort entscheidet deine Kanzlei. Ein 7-%-Erlöskonto, auf dessen Namen keine Regel passt (zum Beispiel `RevenueOther_Reduced:7.00`), bleibt mit dem Kommentar „Logis oder Speisen?“ leer. Für Hauskonten und durchlaufende Posten aus apaleo gibt es keine Vorlage. Die Zeilen für die apaleo-Konten `Vat` und `VatOnLiabilities` braucht das Tool nicht.

### Was deine Kanzlei entscheiden muss

- **Kurtaxe und Beherbergungsteuer**: durchlaufender Posten ohne Steuer oder Teil des Entgelts zu 7 %, siehe [Kurtaxe und Beherbergungsteuer](#kurtaxe-und-beherbergungsteuer). Die Vorlage füllt diese Zeilen nicht vor; der Export stoppt mit `E-UNMAPPED`, bis die Kanzlei entschieden hat.
- **No-Show- und Stornogebühren**: Entgelt oder Schadenersatz, siehe [Gebühren für No-Show und Storno](#gebühren-für-no-show-und-storno).
- **Forderungsverluste**: mit der Berichtigung nach § 17 UStG, siehe [Forderungsverluste](#forderungsverluste).
- **Speisen auf einem eigenen Konto**: siehe [Speisen ab 2026](#speisen-ab-2026).

## Anzahlungen

Erhaltene Anzahlungen tragen die Umsatzsteuer ihres Satzes (§ 13 Abs. 1 Nr. 1 Buchst. a UStG): Die `*`-Zeilen für Liabilities buchen sie zu 7 % auf `1711` mit `tax_ust_7_skr03`, zu 19 % auf `1718` mit `tax_ust_19_skr03` und ohne Steuer auf `1719` (SKR04 `3260`, `3272`, `3280`). Die Anzahlung steht im Haben und erhöht die Kennzahl ihres Satzes. Die Auflösung beim Check-out und eine Rückzahlung stehen im Soll mit derselben Steuer und mindern die Kennzahl wieder. Ein Überschuss, den apaleo mit 0 % parkt, geht auf das Konto ohne Steuer. Die Elternzeile `3000;Liabilities` schreibt die Vorlage nicht: Ein Konto kann nicht jeden Satz abdecken.

## Zahlungen: Kasse und Geldtransit

Barzahlungen gehen auf die Kasse, jede unbare Zahlung (Karten, Überweisung, PayPal, Gutscheine) auf das Geldtransitkonto, nie auf ein Bankkonto: Die Kanzlei bucht den Kontoauszug und die Abrechnung des Zahlungsdienstleisters gegen das Geldtransitkonto.

Diese beiden Konten stehen nicht im Kontenrahmen-Template von Odoo. Odoo legt sie beim Einrichten des Unternehmens an, und ihr Code hängt von der Version ab. Die Vorlage trägt den Code einer frischen Datenbank für `odoo.version` ein:

| Kontenrahmen | Kasse | Geldtransit Odoo 17 | Geldtransit Odoo 18 und 19 |
|---|---|---|---|
| SKR03 | `1001` | `13601` | `1360` |
| SKR04 | `1601` | `14601` | `1460` |

Odoo 19 legt mit dem Kontenrahmen kein Kassenjournal an; ein neu angelegtes bekommt `1001` bzw. `1601`. Eine Datenbank, die länger läuft oder anders eingerichtet wurde, kann andere Codes haben. **Vergleiche beide Codes mit dem Kontenplan deines Odoo-Unternehmens** (Buchhaltung > Konfiguration > Kontenplan; suche nach „Kasse“ und „Geldtransit“ bzw. „Liquiditätstransfer“) und trag den richtigen Code ein. `mapping check` erinnert daran mit dem Hinweis `N-GENERATED-ACCOUNT`. Ein falscher Code fällt beim „Test“ des Imports auf („Kein passender Datensatz gefunden“), er bucht nie still auf ein anderes Konto.

## Gästeforderungen und Firmenrechnungen

Die Folios der Gäste, externe Folios und Buchungsfolios (Receivables) gehen auf `1410` Forderungen aus Lieferungen und Leistungen ohne Kontokorrent (SKR04 `1210`), ohne Steuer. Weil die Bezeichnung nie vom Gast abhängt, fasst die Datei alle diese Zeilen eines Tages zu einer Zeile zusammen, die die Veränderung des Tages zeigt. Rechnungen an Firmen (AccountsReceivable, die Zeile `CollectiveDebitor_AccountsReceivable` und `*;AccountsReceivable`) gehen auf `1401` Forderungen aus Lieferungen und Leistungen (SKR04 `1200`). Odoo kennt keine Kontokorrentnummern für jeden Kunden wie `10000`; das Tool legt keine Partner an.

Eine Steuer auf einer Zeile für Zahlungen, Gästeforderungen oder Firmenrechnungen ist ein Fehler (`E-TAX-NOT-ALLOWED`): Odoo würde die Umsatzsteuer auf das Geld oder die Forderung rechnen.

## Sonderfälle in Deutschland

In diesen Fällen weicht das Umsatzsteuerrecht von einem einfachen Verkauf ab. Das Tool entscheidet keinen davon: Es bucht den Satz, den apaleo berechnet hat, über die Zeile, die deine Kanzlei freigibt, und warnt, wo eine Zeile nach einem typischen Fehler aussieht. Wie die Buchungssätze in Odoo dann aussehen, zeigt [posting-rules.md](posting-rules.md#deutsche-sonderfälle) mit Beispielen aus dem deutschen Testmonat.

### Kurtaxe und Beherbergungsteuer

apaleo bucht Abgaben auf Konten der Typen CityTaxes, SecondCityTax und GuestLevies. Es gibt zwei Fälle, und nur deine Kanzlei kann sagen, welcher bei dir gilt:

- **Der Gast schuldet die Abgabe** (Kurtaxe, Kurbeitrag, Gästebeitrag), das Hotel zieht sie nur für die Gemeinde ein. Dann ist sie ein durchlaufender Posten (§ 10 Abs. 1 UStG) und gehört nicht zum Entgelt: SKR03 `1590`, SKR04 `1370` Durchlaufende Posten, **ohne Steuer** (`odoo_tax` und `tax_percent` leer, nie `tax_not_taxable_skr03`, das in Kennzahl 45 meldet). apaleo bucht sie dann mit 0 % oder ohne Steuer.
- **Der Betrieb schuldet die Abgabe** (Übernachtung- oder Beherbergungsteuer, zum Beispiel in Berlin, oft „Bettensteuer“ genannt) und gibt sie an den Gast weiter. Dann ist sie Teil des Entgelts für die Beherbergung und kostet 7 %: zum Beispiel SKR03 `8300` mit `tax_ust_7_skr03` und `7` (SKR04 `4300` mit `tax_ust_7_skr04`). Prüf dann auch, dass apaleo die Abgabe mit 7 % berechnet; sonst stoppt der Export mit `E-VAT-MISSING` oder `E-VAT-UNEXPECTED`.

Die Vorlage lässt die Zeilen leer und nennt beide Möglichkeiten im Kommentar. Trägt eine dieser Zeilen eine Steuer über 0 %, warnt `mapping check` mit `W-CITY-TAX-TAXED`, und der Export wiederholt die Warnung für jeden Monat, der die Zeile nutzt. Das ist eine Erinnerung, kein Fehler: Ist die Abgabe vom Betrieb geschuldet, bleibt die Zeile so, und die Datei wird geschrieben. Die Übersicht im Protokoll zeigt jede Abgabe pro Odoo-Konto, ohne Steuer oder mit Steuer und Kennzahl.

### Gebühren für No-Show und Storno

No-Show- und Stornogebühren laufen wie jeder Erlös durch ihre Zeile, mit dem Satz, den apaleo berechnet hat. Die Vorlage legt sie nach Satz ab:

- mit 7 % (apaleo behandelt die Gebühr als Teil der Beherbergung): SKR03 `8300` / SKR04 `4300` mit der Steuer zu 7 %;
- ohne Umsatzsteuer (apaleo behandelt sie als Schadenersatz): SKR03 `8200` / SKR04 `4200` ohne Steuer. Ein eigenes Konto für Schadenersatz (zum Beispiel SKR03 `2742`, SKR04 `4970`) kann deine Kanzlei eintragen.

Ob eine Gebühr Entgelt für eine Leistung oder Schadenersatz ist, entscheidet deine Kanzlei. **Eine Änderung gehört in die Umsatzsteuer-Einstellung in apaleo, nicht in diese Datei**: Das Tool ändert die Steuer von apaleo nie, und eine Zeile mit einem anderen Satz stoppt den Export (`E-VAT-RATE`, `E-VAT-MISSING` oder `E-VAT-UNEXPECTED`). Die Vorlage erkennt die Gebühren an apaleos Gruppen `RevenueNoShow` und `RevenueCancellationFees` und an Namen mit No-Show, Noshow, Storno, Stornierung oder Cancellation.

### Forderungsverluste

Schreibt das Hotel eine Forderung in apaleo ab, bucht apaleo den Verlust (LossOfAccountsReceivable) gegen die Gästeforderung, mit der Umsatzsteuer der ausgefallenen Leistung. Die `*`-Zeilen der Vorlage legen den Verlust nach Satz ab: SKR03 `2401` mit `tax_ust_7_skr03`, `2406` mit `tax_ust_19_skr03`, `2400` ohne Steuer (SKR04 `6931`, `6936`, `6930`). So bucht Odoo den Verlust selbst mit seinen Abgleichsmodellen „Forderungsverlust“. Im Buchungssatz steht die Verlustzeile mit der Steuer im Soll, also auf der Seite einer Gutschrift: Odoo rechnet eine negative Umsatzsteuer und mindert Kennzahl 86 bzw. 81. Das ist die Berichtigung nach § 17 Abs. 2 Nr. 1 UStG. Ein Verlust ohne Umsatzsteuer in apaleo geht ohne Steuer auf `2400` bzw. `6930`. Die Übersicht zeigt die abgeschriebenen Forderungen pro Satz mit der Minderung der Kennzahl.

### Speisen ab 2026

Speisen in Restaurant und Hotel (Frühstück, Halbpension, Bankett, Catering) kosten für Leistungen ab 2026-01-01 7 % Umsatzsteuer, für Leistungen davor 19 % (Steueränderungsgesetz 2025); Getränke bleiben bei 19 %. Maßgeblich ist das Datum der Leistung. Der häufigste Fehler nach der Änderung ist ein Speisenkonto in apaleo, das noch mit 19 % bucht. Deshalb warnt der Export einmal pro Geschäftstag mit `W-FOOD-RATE`, wenn eine Erlöszeile auf einem Konto, dessen apaleo-Name nach Speisen klingt (Speise, Frühstück, Restaurant, Essen, Küche, Halbpension, Vollpension, Catering, Bankett, Food, Breakfast) und nicht nach Getränken, ab 2026-01-01 19 % oder davor 7 % trägt. Die Warnung blockiert nichts: Ein Konto für Speisen und Getränke darf Getränke zu 19 % tragen. apaleos Standardkonto „Revenues Food and beverages“ nennt beides und löst die Warnung deshalb nie aus.

Die Vorlage legt Speisen zu 7 % auf das Konto für Logis (SKR03 `8300`, SKR04 `4300`). Möchte deine Kanzlei Speisen getrennt sehen, legt sie in Odoo ein eigenes Konto an (zum Beispiel `8301` mit `tax_ust_7_skr03`) und trägt es in die Zeilen der Speisenkonten ein.

## Befunde und was du tust

| Befund | Bedeutung | Was du tust |
|---|---|---|
| `E-ACCOUNT-FORMAT` | Das Odoo-Konto hat nicht 1 bis 64 Zeichen aus Buchstaben, Ziffern und Punkt. | Schreib das Konto so, wie es im Kontenplan steht. |
| `E-TAX-FORMAT` | `odoo_tax` ist weder eine ID aus dem Template noch eine External ID mit Punkt. | Trag die ID der Steuer ein, nicht ihren Namen. |
| `E-VAT-RATE-MISSING` | Eine Zeile hat eine Steuer, aber keinen Satz. | Trag den Satz in `tax_percent` ein, auch `0`. |
| `E-TAX-MISSING` | `tax_percent` ist größer als 0, aber die Steuer fehlt. | Trag die Steuer dieses Satzes ein. |
| `E-TAX-NOT-ALLOWED` | Eine Zeile für Zahlungen, Gästeforderungen oder Firmenrechnungen hat eine Steuer. | Lass Steuer und Satz dort leer; die Steuer gehört auf die Erlös- oder Anzahlungszeile. |
| `W-TAX-UNCHECKED` | Die Steuer ist keine der Steuern von l10n_de, die das Tool kennt. | Lass dir von deiner Kanzlei bestätigen, dass sie eine Umsatzsteuer des Unternehmens mit diesem Satz ist. |
| `W-TAX-RATE` | Eine bekannte Steuer steht mit einem anderen Satz als ihrem eigenen in der Zeile. Nutzt ein Monat die Zeile, stoppt der Export mit `E-TAX-RATE-WRONG`. | Prüfe, ob die Steuern vertauscht sind. |
| `W-TAX-KZ45` | Auf der Zeile steht die nicht steuerbare Steuer, die in Kennzahl 45 meldet. | Lass Steuer und Satz leer, außer die Leistung ist im Ausland steuerbar. |
| `N-DEFAULT-TAX-ACCOUNT` | Eine Zeile ohne Steuer zeigt auf ein Konto mit Standardsteuer. | Nichts, wenn „ohne Steuer“ gemeint ist; bearbeite die Zeile in Odoo nicht von Hand. |
| `N-GENERATED-ACCOUNT` | Eine Zahlungszeile zeigt auf Kasse oder Geldtransit, die Odoo beim Einrichten anlegt. | Vergleiche den Code mit dem Kontenplan. |
| `W-CITY-TAX-TAXED` | Eine Zeile für die Kurtaxe trägt eine Steuer über 0 %. | Lass dir bestätigen, dass der Betrieb die Abgabe schuldet; sonst `1590` bzw. `1370` ohne Steuer. |
| `N-TEMPLATE-SUGGESTION` | `init-mapping --update`: Die aktuelle Vorlage hat für eine leere Zeile jetzt einen Vorschlag. | Prüf den Vorschlag mit der Kanzlei und trag ihn von Hand ein. |
| `W-FOOD-RATE` | Export: Ein Speisenkonto bucht ab 2026 mit 19 % oder davor mit 7 %. | Prüf die Umsatzsteuer-Einstellung in apaleo mit der Kanzlei. |
| `W-VAT-RATE-UNUSUAL` | Der Satz ist kein deutscher Satz (0, 7, 19 %); bei 16 und 5 % nennt die Warnung die Zeit vom 2020-07-01 bis 2020-12-31. | Prüfe die Zeile, Exporte für 2020 klärst du mit der Kanzlei. |
| `E-VAT-MISMATCH` | Der Satz der Zeile weicht vom Satz des apaleo-Kontos oder der Buchungen ab, auch über ein Elternkonto. | Gib dem Konto eine eigene Zeile mit dem richtigen Konto, der Steuer und dem Satz. |
| `E-UNMAPPED` | Ein gebuchtes Konto hat kein Odoo-Konto. | Folge der Meldung: Sie nennt die Zeile oder die `*`-Zeile mit einem Beispiel aus der SKR03-Vorlage. |

Alle Befunde mit Ursache und Lösung: [troubleshooting.md](troubleshooting.md#kontenzuordnung).

## Umstieg von einem anderen Connector

Den Kontenexport eines kostenpflichtigen Connectors liest das Tool nicht: Sein Format für Odoo ist unbekannt. Leg die Zuordnung mit `init-mapping --template skr03-hotel` (oder `skr04-hotel`) an und übertrag Konten, die deine Kanzlei abweichend von der Vorlage nutzt, von Hand in `odoo_account`. Die Kontonummern der Vorlagen sind dieselben wie in den SKR03- und SKR04-Hotelvorlagen von apaleo-datev-export; eine Zuordnung aus diesem Projekt kannst du also Zeile für Zeile vergleichen.

## Checkliste zur Freigabe durch die Kanzlei

Bevor die erste Datei in Odoo importiert wird, geht deine Kanzlei die Kontenzuordnung durch:

- [ ] Für jedes zugeordnete Konto mit Steuer hat das Odoo-Unternehmen diese Steuer mit diesem Satz, zum Beispiel `8300 -> tax_ust_7_skr03 (7 %)`, `8400 -> tax_ust_19_skr03 (19 %)`, `1711 -> tax_ust_7_skr03 (7 %)` und `1718 -> tax_ust_19_skr03 (19 %)`; eigene Steuern (`W-TAX-UNCHECKED`) sind bestätigt.
- [ ] Für jedes Konto ohne Steuer ist geklärt, ob später von Hand eine Standardsteuer gesetzt werden könnte (`N-DEFAULT-TAX-ACCOUNT`, zum Beispiel SKR04 `4200`), und dass niemand eine solche Buchungszeile in Odoo bearbeitet.
- [ ] Kein Erlös im Inland trägt `tax_not_taxable_skr03` oder `tax_not_taxable_skr04` (`W-TAX-KZ45`).
- [ ] Kasse und Geldtransit tragen die Codes aus dem Kontenplan des Unternehmens (`N-GENERATED-ACCOUNT`).
- [ ] Die Kurtaxe, die Beherbergungsteuer, No-Show- und Stornogebühren und die Speisen ab 2026 sind entschieden und eingetragen; eine Abgabe mit Steuer (`W-CITY-TAX-TAXED`) ist vom Betrieb geschuldet.
- [ ] `apaleo-odoo mapping check --property <id> --from <erster Tag> --to <letzter Tag>` meldet für einen echten Monat keinen Fehler.
