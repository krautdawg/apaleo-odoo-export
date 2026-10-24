# Buchungsregeln: von apaleo-Zeilen zu Odoo-Buchungssätzen

`buildBookings(lines, mapping, chart, options)` in `src/posting` macht aus den Zeilen von `export-gross-daily` in apaleo die Buchungen, aus denen der Writer in `src/odoo` die Importdatei für Odoo schreibt. Die Funktion ist rein: Dieselben Zeilen und dieselbe Kontenzuordnung ergeben immer dasselbe Ergebnis. Jede apaleo-Zeile landet an genau einer von drei Stellen: in einer Buchung, in der Liste der übersprungenen Zeilen (mit Grund und Betrag) oder in einem Befund mit `E-`, der den Export blockiert.

Keine Gewähr, keine Steuerberatung: Die steuerlichen Entscheidungen stecken in der Kontenzuordnung, und die muss dein Steuerberater freigeben. Die Regeln unten stellen nur sicher, dass Odoo die Umsatzsteuer bucht, die apaleo berechnet hat. Das Tool entscheidet keine Steuerfrage und ändert den Steuersatz von apaleo nie.

Die Beispiele stammen aus dem deutschen Testmonat des Tools: erfundenes „Hotel Beispiel Berlin“ (`BSP`), September 2026, EUR, in `test/fixtures/apaleo/de-month/`, gebucht mit der Kontenzuordnung `test/fixtures/mapping/skr03-de-month.csv` (die SKR03-Vorlage, Kurtaxe und Übernachtungsteuer so ausgefüllt, wie es eine Kanzlei entscheiden würde). Jede Zeile der Tabellen steht so in `test/golden/odoo/de-month.per-line.csv`; die Tests vergleichen jeden Betrag mit von Hand gerechneten Werten.

## Ein Buchungssatz pro Tag und Hotel

Jede apaleo-Zeile wird eine Buchung mit Soll- und Habenkonto, dem Bruttobetrag und gegebenenfalls der Odoo-Steuer. Der Writer fasst alle Buchungen eines Geschäftstags und eines Hotels zu **einem Buchungssatz** (`account.move`, Typ „entry“, Entwurf) zusammen und verrechnet dabei Soll und Haben pro Sachkonto, Steuer und Bezeichnung: Eine Zeile der Datei zeigt die Veränderung des Tages auf diesem Konto. Die Gästeforderungen `1410` eines Tages, an dem alle Gäste bezahlt haben, ergeben deshalb keine Zeile. Zahlarten bleiben getrennt, weil ihre Bezeichnungen verschieden sind (`Zahlung Visa`, `Zahlung Mastercard`). Welche apaleo-Zeilen hinter einer Zeile der Datei stehen, steht im Protokoll, mit Belegnummer aus apaleo. Format, External IDs und Reihenfolge der Zeilen: [odoo-format.md](odoo-format.md).

Importiert werden die Buchungssätze als Entwürfe in ein eigenes Journal (`odoo.journal`); das Tool bucht nie selbst.

## Die Seite mit Steuer trägt den Nettobetrag

Beide Seiten der apaleo-Zeile werden über die Kontenzuordnung aufgelöst (siehe [mapping-guide.md](mapping-guide.md)). Die Seite, deren Zeile eine Odoo-Steuer hat (`odoo_tax`), ist die **Steuerseite**:

- Die Buchung bekommt diese Steuer, den Satz der Zeile (`tax_percent`), den Bruttobetrag ohne Vorzeichen und die Steuer von apaleo, kaufmännisch auf den Cent gerundet (bei ,5 weg von null).
- Soll und Haben sind die Konten der apaleo-Zeile. Ein negativer Bruttobetrag (eine negative Belastung, eine Rückzahlung) tauscht sie.
- In der Datei steht die Steuerseite mit dem **Nettobetrag** und der Odoo-Steuer als External ID (`account.1_tax_ust_7_skr03`), die andere Seite mit dem Bruttobetrag.
- **Die Datei enthält keine Steuerzeilen.** Odoo legt die Steuerzeilen beim Import selbst an, auf dem Steuerkonto der Steuer (SKR03 `1771` für 7 %, `1776` für 19 %) und mit den Kennzeichen der UStVA-Kennzahlen 86 und 81. Eine Steuerzeile in der Datei wäre für Odoo eine zweite Umsatzsteuer ohne Kennzeichen.
- Steht die Steuerseite im **Haben** (Umsatz, erhaltene Anzahlung), ist das für Odoo die Rechnungsseite: Die Kennzahl steigt. Steht sie im **Soll** (Nachlass, Auflösung oder Rückzahlung einer Anzahlung, Forderungsverlust), ist das die Gutschriftseite: Odoo rechnet eine negative Steuer, und die Kennzahl sinkt.
- Eine Zeile ohne Steuerseite (Zahlungen, Kurtaxe ohne Steuer, Firmenrechnungen) bucht beide Seiten mit dem Bruttobetrag; ihre Steuerzelle bleibt leer, damit Odoo auch auf einem Konto mit Standardsteuer keine Steuer setzt.
- Eine Steuer auf einer Zeile für Zahlungen, Gästeforderungen oder Firmenrechnungen stoppt die Zeile (`E-TAX-NOT-ALLOWED`): Odoo würde sonst Umsatzsteuer auf das Geld oder die Forderung rechnen. Haben beide Seiten eine Steuer (eine Umbuchung zwischen zwei Erlöskonten), stoppt die Zeile mit `E-TWO-VAT-SIDES`.

## Basisanpassung und Rundungsausgleich

Odoo rechnet die Umsatzsteuer aus dem Nettobetrag, apaleo hat sie aus dem Bruttobetrag gerechnet. Der Writer wählt deshalb jeden Nettobetrag so, dass Nettobetrag plus Odoos Steuer genau den Bruttobetrag aus apaleo ergibt, sonst legte Odoo eine „Automatische Ausgleichszeile“ an. Wie Odoo rundet, stellst du mit `odoo.taxRounding` ein:

- `per_line` (Rundung pro Zeile, Standard in Odoo 17 und 18): Odoo rundet die Steuer jeder Zeile. Gibt es keinen passenden Nettobetrag, schreibt der Writer eine zweite Zeile über 0,01 € mit derselben Steuer und „(Rundungsausgleich)“ in der Bezeichnung. Im Testmonat: Frühstück 95,00 € am 09-10 (`8300` Haben 88,78 € und 0,01 €), die Stornogebühr 100,04 € am 09-14 und die Minibar 4,98 € am 09-28.
- `per_tax` (Rundung pro Steuer, Standard in Odoo 19): Odoo rundet die Steuer einer Gruppe aus Steuer und Seite einmal. Ein fehlender Cent geht ohne Steuer auf `odoo.roundingAccount`, zum Beispiel SKR03 `2700` mit „Rundungsausgleich USt 7 %“. Im Testmonat zwei solche Zeilen (09-14 und 09-28); am 09-10 rundet Odoo die Steuer von Logis und Frühstück einmal und kommt auf 14,07 € statt apaleos 14,06 €.

Jede solche Zeile meldet `N-ODOO-ROUNDING-LINE`. Das Protokoll zeigt pro Steuer die Basis in der Datei, Odoos Steuer und apaleos Steuer mit dem Unterschied. Einzelheiten und Beispiele: [odoo-format.md](odoo-format.md#basisanpassung-warum-manche-nettobeträge-um-einen-cent-abweichen).

## Prüfung der Steuer pro Zeile

Zuerst werden die `taxes[]` der Zeile bereinigt: Einträge mit Satz 0 und Betrag 0 (zum Beispiel `Without` bei der Kurtaxe) fallen weg. Dass Nettobetrag plus Steuer den Bruttobetrag ergibt, prüft schon das Lesen der apaleo-Daten auf den halben Cent genau. Dann prüft das Tool:

| Code | Bedeutung |
|---|---|
| `E-VAT-RATE` | Der Satz von apaleo weicht von `tax_percent` der Steuerseite ab. |
| `E-VAT-MISSING` | apaleo hat Umsatzsteuer berechnet, aber keine der beiden Seiten hat eine Odoo-Steuer. |
| `E-VAT-UNEXPECTED` | apaleo hat keine Umsatzsteuer berechnet, aber die Steuerseite bucht einen Satz über 0 %. Eine Steuer mit 0 % ist erlaubt und bucht die Steuer 0,00. |
| `E-VAT-MIXED` | Eine Zeile hat mehr als einen Steuersatz; eine Basiszeile in Odoo trägt genau eine Steuer. |
| `E-VAT-SIGN` | Steuer und Bruttobetrag haben verschiedene Vorzeichen. |
| `E-VAT-RATE-MISSING` | Die Zeile der Kontenzuordnung hat eine Odoo-Steuer, aber keinen gültigen Satz. |
| `E-TAX-NOT-ALLOWED` | Eine Zeile für Zahlungen, Gästeforderungen oder Firmenrechnungen hat eine Odoo-Steuer. |
| `E-TWO-VAT-SIDES` | Beide Seiten haben eine Odoo-Steuer. |
| `E-UNMAPPED` | Ein Konto hat keine Zeile mit Odoo-Konto; einmal pro Konto, wie bei `mapping check --from --to`. |

Die Meldungen nennen die Belegnummer aus apaleo, beide Konten mit Nummer und Typ (nie mit Namen, weil Gastfolios Gästenamen tragen) und die Zeile der Kontenzuordnung, die du ändern musst. Die Cent-Unterschiede zwischen Odoos und apaleos Steuer kommen allein aus Odoos Rundung; sie sind kein Fehler und stehen im Protokoll. Zusätzlich warnt der Export für die Zeilen, die ein Monat nutzt, mit `W-TAX-UNCHECKED`, `W-TAX-KZ45` und `W-CITY-TAX-TAXED` und für Speisenkonten mit `W-FOOD-RATE`; alle Codes: [troubleshooting.md](troubleshooting.md).

## Deutsche Sonderfälle

In diesen Fällen weicht das Umsatzsteuerrecht von einem einfachen Verkauf ab. Die Buchungsregeln bleiben dieselben; was sich unterscheidet, steht in der Kontenzuordnung ([mapping-guide.md](mapping-guide.md#sonderfälle-in-deutschland)). Die Tabellen zeigen jede Buchung des Testmonats vor dem Verrechnen; „Zeile in der Datei“ ist der Anteil dieser Buchung an der Zeile des Tages.

### Kurtaxe und Übernachtungsteuer

Die Zeilen der Abgaben (CityTaxes, SecondCityTax, GuestLevies) laufen durch ihre Zeile der Kontenzuordnung wie jede andere Zeile, unter derselben Prüfung der Steuer. Eine Kurtaxe, die der Gast schuldet, ist ein durchlaufender Posten (§ 10 Abs. 1 UStG) ohne Steuer; eine Übernachtungsteuer, die der Betrieb schuldet und weitergibt, ist Teil des Entgelts und geht mit der Steuer zu 7 % auf ein Erlöskonto. Hat apaleo eine Abgabe besteuert und ihre Zeile keine Steuer, stoppt der Export mit `E-VAT-MISSING`; trägt eine Zeile der Abgaben eine Steuer, warnt er mit `W-CITY-TAX-TAXED`, schreibt die Datei aber.

| Fall (2026-09-20) | Soll | Haben | Brutto | Steuer apaleo | Zeile in der Datei |
|---|---|---|---|---|---|
| Kurtaxe des Gastes (`3501`, BSPE0020) | `1410` Gästeforderungen | `1590` Kurtaxe | 5,00 € | keine | `1590` Haben 5,00 €, Steuerzelle leer, keine Kennzahl |
| Übernachtungsteuer des Betriebs (`3502`, BSPE0021) | `1410` Gästeforderungen | `8300` Beherbergungsteuer 7 % | 10,70 € | 0,70 € zu 7 % | `8300` Haben 10,00 € mit `account.1_tax_ust_7_skr03`; Odoo bucht 0,70 € auf `1771`, Kz 86 steigt um 10,00 € |

Die Übersicht zeigt die Abgaben pro Odoo-Konto: 5,00 € auf `1590` ohne Steuer und 10,70 € auf `8300` mit `tax_ust_7_skr03` (Kz 86), Steuer 0,70 €.

### Anzahlungen

Eine erhaltene Anzahlung trägt die Umsatzsteuer ihres Satzes schon bei Erhalt (§ 13 Abs. 1 Nr. 1 Buchst. a Satz 4 UStG). apaleo bucht sie auf das Konto `<Reservierung>_Liabilities/<Satz>` des Gastes; die `*`-Zeilen der Vorlage legen sie zu 7 % auf `1711` mit `tax_ust_7_skr03`. apaleo bucht die Auflösung beim Check-out als negative Belastung auf derselben Anzahlung und eine Rückzahlung als negative Anzahlung. Eine Liabilities-Seite zählt als Zugang, wenn sie mit einem positiven Betrag im Haben oder mit einem negativen im Soll steht, sonst als Abgang; ein Abgang gegen eine Zahlung ist eine Rückzahlung.

| Fall | Soll | Haben | Brutto | Steuer apaleo | Zeile in der Datei | Kz 86 |
|---|---|---|---|---|---|---|
| Anzahlung per Visa (09-03, BSPE0001) | `1360` Zahlung Visa | `1711` Anzahlungen 7 % | 321,00 € | 21,00 € | `1711` Haben 300,00 € mit `account.1_tax_ust_7_skr03` (Rechnungsseite) | +300,00 € |
| Zwei Nächte Logis (09-12, BSPE0007 und BSPE0008) | `1410` Gästeforderungen | `8300` Erlöse Beherbergung 7 % | 214,00 € | 14,00 € | `8300` Haben 200,00 € | +200,00 € |
| Auflösung beim Check-out, negative Belastung (09-12, BSPE0009) | `1711` Anzahlungen 7 % | `1410` Gästeforderungen | 214,00 € | 14,00 € | `1711` Soll 200,00 € mit `account.1_tax_ust_7_skr03` (Gutschriftseite) | −200,00 € |
| Rückzahlung per Visa, negative Anzahlung (09-12, BSPE0010) | `1711` Anzahlungen 7 % | `1360` Zahlung Visa | 107,00 € | 7,00 € | `1711` Soll 100,00 € mit `account.1_tax_ust_7_skr03` (Gutschriftseite) | −100,00 € |
| Überzahlung, die apaleo mit 0 % parkt (09-20, BSPE0023) | `1410` Gästeforderungen | `1719` Anzahlungen ohne USt | 10,00 € | keine | `1719` Haben 10,00 €, Steuerzelle leer | – |
| Rückzahlung der Überzahlung (09-22, BSPE0028) | `1719` Anzahlungen ohne USt | `1360` Zahlung Visa | 10,00 € | keine | `1719` Soll 10,00 € | – |

Die Auflösung mindert Kennzahl 86 um die Anzahlung, und die Erlöszeile der Schlussrechnung erhöht sie wieder: Über den Aufenthalt bleibt der Umsatz (+300,00 − 200,00 − 100,00 + 200,00 = +200,00 €). Am 09-12 verrechnet der Writer Auflösung und Rückzahlung zu einer Zeile `1711` im Soll über 300,00 €. Odoo bucht die Steuer der Anzahlung auf dasselbe Steuerkonto `1771` wie die Steuer der Umsätze; die Übersicht im Protokoll zeigt die Anzahlungen deshalb pro Steuer und Satz getrennt: zu 7 % erhalten 321,00 € (Steuer 21,00 €), aufgelöst 321,00 € (Steuer 21,00 €), davon zurückgezahlt 107,00 € (Steuer 7,00 €); ohne Steuer erhalten, aufgelöst und zurückgezahlt je 10,00 €.

Kommt eine Auflösung ohne `taxes[]` (ältere Daten, andere Quellen), ermittelt das Tool ihren Satz und nimmt nie 0 % an:

1. aus der oder den `PostPrepaymentVat`-Zeilen desselben Geschäftstags und derselben Referenz, mit deren Steuerbetrag; die berechnete Steuer muss bis auf einen Cent der Steuer auf diesen Zeilen entsprechen (sonst `E-VAT-AMOUNT`);
2. sonst aus dem Steuersatz des Kontos `Liabilities` oder seines Elternkontos im Kontenplan von apaleo, mit der aus dem Bruttobetrag berechneten Steuer und der Warnung `W-VAT-INFERRED`;
3. sonst stoppt der Export mit `E-VAT-RATE-UNKNOWN`, statt die Auflösung ohne Steuer zu buchen.

Eine erhaltene oder zurückgezahlte Anzahlung ohne `taxes[]` nimmt den Satz einer `PostPrepaymentVat`-Zeile desselben Tages und derselben Referenz; ohne eine solche Zeile bleibt es bei 0 %. `mapping check --from --to` nutzt dieselbe Ermittlung.

### Rechnungen an Firmen

Der Check-out auf eine Firmenrechnung bucht vom Gästefolio auf die Forderungen. apaleo schreibt dazu eine zweite Zeile auf das `/Offset`-Konto, die auf demselben Odoo-Konto liegt und übersprungen wird. Die Rechnungsnummer steht nicht in der Datei, aber im Protokoll bei der Zeile des Tages.

| Fall (2026-09-18) | Soll | Haben | Brutto | Steuer | Protokoll |
|---|---|---|---|---|---|
| Firmenaufenthalt auf Rechnung (BSPE0017) | `1401` Forderungen Firmenrechnungen | `1410` Gästeforderungen | 185,50 € | keine | `2026-09-18 1401 Forderungen Firmenrechnungen debit 185.50: BSPE0017 (BSP-2026-0815)` |

### Forderungsverluste

apaleo bucht einen Forderungsverlust im Soll auf `<Reservierung>_LossOfAccountsReceivable` und im Haben auf die Gästeforderung, mit der Steuer der ausgefallenen Leistung. Mit der Steuer ihres Satzes steht die Verlustzeile im Soll auf der Gutschriftseite: Odoo rechnet eine negative Steuer und mindert die Kennzahl und die Umsatzsteuer um die Steuer der Forderung. Das ist die Berichtigung nach § 17 Abs. 2 Nr. 1 UStG, so wie Odoos eigene Abgleichsmodelle für SKR03 und SKR04 einen Forderungsverlust buchen. Ohne `taxes[]` geht der Verlust ohne Steuer auf `2400`.

| Fall (2026-09-30) | Soll | Haben | Brutto | Steuer apaleo | Zeile in der Datei | Wirkung |
|---|---|---|---|---|---|---|
| Nicht bezahlte No-Show-Gebühr (BSPE0029) | `2401` Forderungsverluste 7 % | `1410` Gästeforderungen | 107,00 € | 7,00 € | `2401` Soll 100,00 € mit `account.1_tax_ust_7_skr03` | Kz 86 −100,00 €, USt −7,00 € |
| Nicht bezahlte sonstige Leistung (BSPE0030) | `2406` Forderungsverluste 19 % | `1410` Gästeforderungen | 119,00 € | 19,00 € | `2406` Soll 100,00 € mit `account.1_tax_ust_19_skr03` | Kz 81 −100,00 €, USt −19,00 € |
| Rest einer Stornogebühr ohne Umsatzsteuer (BSPE0031) | `2400` Forderungsverluste ohne USt | `1410` Gästeforderungen | 30,00 € | keine | `2400` Soll 30,00 €, Steuerzelle leer | keine |

Die Übersicht zeigt die abgeschriebenen Forderungen pro Satz, zum Beispiel „tax_ust_19_skr03 19 % (lowers Kz 81): net 100.00, apaleo per line 19.00, gross 119.00, …, VAT in the return -19.00“.

### Storno- und No-Show-Gebühren

Sie laufen wie jeder Erlös durch ihre Zeile und die Prüfung der Steuer, mit dem Satz, den apaleo berechnet hat; das Tool ändert ihn nie. Ob eine Gebühr Entgelt oder Schadenersatz ist, entscheidet die Kanzlei, und eine Änderung gehört in die Umsatzsteuer-Einstellung von apaleo. Hat apaleo eine Gebühr besteuert und ihre Zeile keine Steuer, stoppt der Export mit `E-VAT-MISSING`.

| Fall | Soll | Haben | Brutto | Steuer apaleo | Zeile in der Datei |
|---|---|---|---|---|---|
| Stornogebühr zu 7 % (09-14, BSPE0011) | `1410` Gästeforderungen | `8300` Erlöse Stornogebühren 7 % | 100,04 € | 6,54 € | `8300` Haben 93,49 € und 0,01 € Rundungsausgleich, beide mit `account.1_tax_ust_7_skr03` |
| No-Show-Gebühr zu 7 % (09-21, BSPE0024) | `1410` Gästeforderungen | `8300` Erlöse No-Show 7 % | 107,00 € | 7,00 € | `8300` Haben 100,00 € mit `account.1_tax_ust_7_skr03` |
| Stornogebühr ohne Umsatzsteuer (09-21, BSPE0026) | `1410` Gästeforderungen | `8200` Erlöse ohne USt | 80,00 € | keine | `8200` Haben 80,00 €, Steuerzelle leer |

### Zahlungen und die `/Offset`-Zeilen

Eine Zahlung bucht von der Kasse oder dem Geldtransitkonto auf die Gästeforderung, ohne Steuer. Die zweite Zeile, die apaleo mit jeder Zahlung schreibt (`<Folio>_Receivables` an `<Folio>_Receivables/Offset`), liegt auf demselben Odoo-Konto `1410` und wird als `SAME_ACCOUNT` übersprungen.

| Fall | Soll | Haben | Brutto |
|---|---|---|---|
| Barzahlung beim Check-out (09-11, BSPE0006) | `1001` Zahlung bar | `1410` Gästeforderungen | 250,70 € |
| Kartenzahlung (09-14, BSPE0012) | `1360` Zahlung Mastercard | `1410` Gästeforderungen | 100,04 € |
| Kartenzahlung mit 10,00 € zu viel (09-20, BSPE0022) | `1360` Zahlung Visa | `1410` Gästeforderungen | 25,70 € |
| Teilzahlung bar (09-21, BSPE0027) | `1001` Zahlung bar | `1410` Gästeforderungen | 50,00 € |

Im Monat sind das auf der Kasse `1001` 300,70 € und auf dem Geldtransitkonto `1360` 414,72 € (Visa- und Mastercard-Zahlungen abzüglich der Rückzahlungen 107,00 € und 10,00 €). Die sieben `/Offset`-Zeilen über zusammen 696,92 € stehen in der Übersicht als übersprungen.

## So sieht ein Tag in der Datei aus

Der 2026-09-20 mit Kurtaxe, Übernachtungsteuer, der Kartenzahlung und der geparkten Überzahlung (die Gästeforderungen gleichen sich aus und ergeben keine Zeile):

```csv
id,ref,date,journal_id,line_ids/id,line_ids/account_id,line_ids/name,line_ids/debit,line_ids/credit,line_ids/tax_ids/id
apaleo_c1_BSP_20260920,apaleo BSP 2026-09-20,2026-09-20,APA,apaleo_c1_BSP_20260920_0001,1360,Zahlung Visa,25.70,0.00,
,,,,apaleo_c1_BSP_20260920_0002,1590,Kurtaxe,0.00,5.00,
,,,,apaleo_c1_BSP_20260920_0003,1719,Anzahlungen ohne USt,0.00,10.00,
,,,,apaleo_c1_BSP_20260920_0004,8300,Beherbergungsteuer 7 %,0.00,10.00,account.1_tax_ust_7_skr03
```

Odoo legt beim Import die Steuerzeile 0,70 € auf `1771` an; damit ist der Buchungssatz ausgeglichen (25,70 € Soll gegen 5,00 + 10,00 + 10,00 + 0,70 € Haben).

## Übersprungene Zeilen

| Grund | Zeilen |
|---|---|
| `VAT_ACCOUNT_LINE` | Jede Zeile, die ein apaleo-Konto `Vat` oder `VatOnLiabilities` berührt, auch `PostPrepaymentVat`. Odoo bucht die Umsatzsteuer aus der Steuer der Erlös- oder Anzahlungszeile; würden die Steuerzeilen von apaleo zusätzlich gebucht, stünde die Steuer doppelt in der UStVA. Diese Konten brauchen keine Zeile in der Kontenzuordnung. |
| `ZERO_AMOUNT` | Bruttobetrag 0. |
| `SAME_ACCOUNT` | Beide Seiten sind demselben Odoo-Konto zugeordnet, zum Beispiel eine Umbuchung zwischen zwei Gastfolios auf `1410` oder die `/Offset`-Zeile einer Zahlung oder Firmenrechnung. |

Übersprungene Zeilen behalten ihre Anzahl und ihre Bruttosumme ohne Vorzeichen in der Übersicht, es verschwindet also nichts.

## Bezeichnungen

Die Bezeichnung einer Zeile (`line_ids/name`) hängt nur vom Konto und vom Satz ab, nie vom Gast, damit der Writer alle Buchungen eines Kontos zu einer Zeile pro Tag verrechnen kann:

- Erlöse nach apaleos Gruppe und Satz: `Erlöse Beherbergung 7 %`, `Erlöse Speisen 7 %`, `Erlöse Getränke 19 %`, `Erlöse No-Show 7 %`, `Erlöse Stornogebühren 7 %`, `Erlöse sonstige 19 %`, `Erlöse ohne USt`; andere Erlöskonten mit ihrem Namen ohne das englische „Revenues“;
- `Zahlung bar`, `Zahlung Visa`, `Zahlung Mastercard`, `Zahlung Überweisung` (englische Namen der Zahlarten übersetzt, Kartenmarken behalten);
- `Gästeforderungen`, `Forderungen Firmenrechnungen`, `Anzahlungen 7 %`, `Anzahlungen ohne USt`, `Forderungsverluste 19 %`, `Kurtaxe`, `Kurtaxe 2`, `Gästeabgabe`, `Hauskonto`, `Durchlaufende Posten`; eine Abgabe mit Steuer ist keine Kurtaxe, sondern die Übernachtung- oder Beherbergungsteuer des Betriebs und heißt `Beherbergungsteuer 7 %` (`Beherbergungsteuer 2 7 %`, `Gästeabgabe 7 %`);
- Zeilen der Basisanpassung: `… (Rundungsausgleich)` bei Rundung pro Zeile, `Rundungsausgleich USt 7 %` bei Rundung pro Steuer.

Die Belegnummer aus apaleo (Rechnung, Referenz des Zahlungsanbieters) steht im Protokoll bei jeder Zeile, wenn `posting.text2` auf `receipt` steht (Standard), sonst die Referenz der Reservierung.

## Übersicht

Das Protokoll und der Probelauf (`--dry-run`) zeigen nach dem Block für den Import in Odoo (Basis, Odoos Steuer und apaleos Steuer pro Steuer, Anzahl der Buchungssätze, Zeilen und Rundungszeilen):

- Soll, Haben und Saldo pro Odoo-Konto vor der Basisanpassung (die Seite ohne Steuer mit dem Bruttobetrag, die Steuerseite mit dem Bruttobetrag ohne apaleos Steuer);
- Erlöse, Anzahlungen und Forderungsverluste pro Odoo-Steuer und Satz mit Kennzahl: Netto, apaleos Steuer pro Zeile gerundet, Brutto, apaleos genaue Steuer und die Rundungsdifferenz; bei Forderungsverlusten mit der Minderung der Kennzahl;
- Kurtaxe und andere Abgaben pro Odoo-Konto, ohne oder mit Steuer;
- Zahlungen pro Kasse und Geldtransitkonto;
- erhaltene, aufgelöste und davon zurückgezahlte Anzahlungen, gesamt und pro Steuer und Satz mit ihrer Steuer;
- die Veränderung der Firmenrechnungen, übersprungene Zeilen pro Grund und alle Befunde.

Im deutschen Testmonat sind das zum Beispiel: Erlöse 7 % brutto 785,84 €, apaleos Steuer 51,40 € (genau 51,41009346 €); Erlöse 19 % brutto 195,38 €, Steuer 31,20 €; Erlöse ohne Umsatzsteuer 160,00 €; Abgaben 5,00 € auf `1590` und 10,70 € auf `8300`; Forderungsverluste 107,00 € zu 7 %, 119,00 € zu 19 % und 30,00 € ohne Steuer; Kasse 300,70 €, Geldtransit 414,72 €, Firmenrechnungen 185,50 €. Die Salden aller Konten ergeben zusammen die Steuer, die die Buchungen tragen: 51,40 + 0,70 + 31,20 − 7,00 − 19,00 = 57,30 €. Odoos eigene Steuer: bei Rundung pro Zeile 45,10 € zu 7 % und 12,19 € zu 19 % (ein Cent unter apaleo), bei Rundung pro Steuer 45,11 € und 12,19 €.
