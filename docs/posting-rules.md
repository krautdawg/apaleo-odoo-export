# Buchungsregeln: von apaleo-Zeilen zu Abacus-Buchungen

`buildBookings(lines, mapping, chart, options)` in `src/posting` macht aus den Zeilen von `export-gross-daily` in apaleo die Einzelbuchungen einer Abacus-Datei (AbaConnect «XML Buchungen»). Die Funktion ist rein: Dieselben Zeilen und dieselbe Kontenzuordnung ergeben immer dasselbe Ergebnis. Jede apaleo-Zeile landet an genau einer von drei Stellen: in einer Buchung, in der Liste der übersprungenen Zeilen (mit Grund und Betrag) oder in einem Befund mit `E-`, der den Export blockiert.

Keine Gewähr, keine Steuerberatung: Die steuerlichen Entscheidungen stecken in der Kontenzuordnung, und die muss dein Treuhänder freigeben. Die Regeln unten stellen nur sicher, dass Abacus die MWST bucht, die apaleo berechnet hat. Das Tool entscheidet keine Steuerfrage und ändert die MWST von apaleo nie.

## Eine Buchung pro Zeile

In dieser Version wird nichts verdichtet: Jede apaleo-Zeile wird eine Einzelbuchung mit dem Geschäftstag als Buchungsdatum und der `sourceEntryNumber` aus apaleo, damit sich jede Buchung zurückverfolgen lässt. Ein Hotel mit 40 Zimmern erzeugt ein paar tausend Buchungen im Monat; Abacus importiert das, und die Prüfung der MWST bleibt pro Zeile genau.

## Die Seite mit MWST-Code kommt in SingleInformation

Jede Abacus-Buchung hat ein Konto in `CollectiveInformation` und eines in `SingleInformation`; nur `SingleInformation` trägt die MWST (`TaxData`). Beide Seiten der apaleo-Zeile werden über die Kontenzuordnung aufgelöst (siehe [mapping-guide.md](mapping-guide.md)); die Seite, deren Zeile einen MWST-Code hat, ist die MWST-Seite. Deshalb gilt:

| Fall | `CollectiveInformation` | `SingleInformation` | `DebitCredit` | MWST in `TaxData` |
|---|---|---|---|---|
| MWST-Seite im Haben (Leistung, erhaltene Anzahlung) | andere Seite | MWST-Seite | `D` | negativ |
| MWST-Seite im Soll (Erlösminderung, Auflösung oder Rückzahlung einer Anzahlung, Debitorenverlust) | andere Seite | MWST-Seite | `C` | positiv |
| keine MWST-Seite, eine Seite ist Erlös oder Debitorenverlust (Erlöse ohne MWST-Code, Annullationen) | andere Seite | Erlös- oder Verlustkonto | nach Seite | keine |
| keine MWST-Seite sonst (Zahlungen, Kurtaxe ohne MWST-Code, Debitoren) | belastetes Konto | entlastetes Konto | `D` | keine |
| beide Seiten mit MWST-Code (Umbuchung zwischen zwei Erlöskonten) | Fehler `E-TWO-VAT-SIDES`, keine Buchung | | | |

- `DebitCredit` ist die Seite des Kontos in `CollectiveInformation`: `D`, wenn die apaleo-Zeile es belastet, `C`, wenn sie es entlastet. Ein negativer Bruttobetrag (eine negative Belastung, eine Rückzahlung) tauscht die Seiten.
- Der Betrag ist der Bruttobetrag ohne Vorzeichen. Die MWST ist die genaue Steuer von apaleo, kaufmännisch auf den Rappen gerundet (bei ,5 weg von null), negativ, wenn das Konto der `SingleInformation` im Haben steht, positiv, wenn es im Soll steht. Auf 5 Rappen wird nie gerundet: Das ist eine Praxis der Kasse.
- MWST-Code und Satz kommen aus der Zeile der MWST-Seite. Eine Zeile mit MWST-Code und 0 % (zum Beispiel ein Code für Ziffer 910) ist erlaubt und bucht die MWST 0.00.
- Ein Erlös ohne MWST-Code steht in `SingleInformation`, damit die Kostenstelle (`kost`) auf der Leistung und auf ihrer Erlösminderung steht.
- Ein MWST-Code auf einer Zahlung, einer Gästeforderung oder einem Debitor stoppt die Zeile (`E-MWST-CODE-NOT-ALLOWED`): Sonst bucht Abacus die MWST auf das Geld- oder Forderungskonto.

`abacus.abrechnungsart` ändert in der Datei nur den `UseCode` und das Steuerkonto der `CollectiveInformation`, nie, welche Zeilen gebucht werden, ihre Konten, Beträge oder ihre MWST (siehe [Vereinnahmte Entgelte](#vereinnahmte-entgelte)).

## Prüfung der MWST pro Zeile

Zuerst werden die `taxes[]` der Zeile bereinigt: Einträge mit Satz 0 und Betrag 0 (zum Beispiel `Without` bei der Kurtaxe) fallen weg. Dass Netto plus Steuer den Bruttobetrag ergibt, prüft schon das Lesen der apaleo-Daten auf den halben Rappen genau. Dann prüft das Tool:

| Code | Bedeutung |
|---|---|
| `W-VAT-ROUNDING` | Die Kontrolle von Abacus, die MWST, die im Bruttobetrag steckt (`round(Brutto × Satz / (100 + Satz))`), weicht um einen Rappen von der Steuer ab (zum Beispiel 46.80 brutto zu 8,1 %, Steuer 3.50, Kontrolle 3.51). Gebucht mit der Steuer von apaleo; die Differenz geht in die Rundungssumme der Übersicht. |
| `E-VAT-AMOUNT` | Die Abweichung ist grösser als ein Rappen. |
| `E-VAT-RATE` | Der Satz von apaleo weicht von `mwst_percent` der MWST-Seite ab. |
| `E-VAT-MISSING` | apaleo hat MWST berechnet, aber keine der beiden Seiten hat einen MWST-Code. |
| `E-VAT-UNEXPECTED` | apaleo hat keine MWST berechnet, aber die MWST-Seite bucht einen Satz über 0 %. |
| `E-VAT-MIXED` | Eine Zeile hat mehr als einen MWST-Satz. |
| `E-VAT-SIGN` | MWST und Bruttobetrag haben verschiedene Vorzeichen. |
| `E-VAT-RATE-MISSING` | Die Zeile der Kontenzuordnung hat einen MWST-Code, aber keinen gültigen Satz. |
| `E-UNMAPPED` | Ein Konto hat keine Zeile mit Abacus-Konto; einmal pro Konto, wie bei `mapping check --from --to`. |

Die Meldungen nennen die Buchungsnummer aus apaleo, beide Konten mit Nummer und Typ (nie mit Namen, weil Gastfolios Gästenamen tragen) und die Zeile der Kontenzuordnung, die du ändern musst.

## Schweizer Sonderfälle

Die Fälle, in denen das Schweizer MWST-Recht von einem einfachen Verkauf abweicht. Die Buchungsregeln bleiben dieselben; was sich unterscheidet, steht in der Kontenzuordnung ([mapping-guide.md](mapping-guide.md)). Die Beispiele stammen aus dem Schweizer Testmonat des Tools (erfundenes Hotel Beispiel Engelberg, August 2026, CHF, `test/fixtures/apaleo/ch-month/`), gebucht mit der KMU-Vorlage. Jede Zeile der Tabellen ist eine Buchung der Datei `test/golden/abacus/ch-month.xml`.

**Steuersätze.** Jede Buchung trägt den Satz, den apaleo hat: Beherbergung mit Frühstück 3,8 % (MWSTG Art. 25 Abs. 4), Speisen, Getränke und Minibar 8,1 %, Take-away 2,6 %. Die Liste steht im [Leitfaden zur Kontenzuordnung](mapping-guide.md#mwst-code-und-mwst-satz).

| Fall | Collective | Single | `DebitCredit` | Betrag | MWST | MWST-Code | `Text1` |
|---|---|---|---|---|---|---|---|
| Logis mit Frühstück | `1101` | `3400` | `D` | 155.70 | −5.70 | `313` | Erlös Beherbergung 3,8 % |
| Nacht, MWST aus apaleo 4.39306358, auf den Rappen gerundet | `1101` | `3400` | `D` | 120.00 | −4.39 | `313` | Erlös Beherbergung 3,8 % |
| Abendessen | `1101` | `3200` | `D` | 54.05 | −4.05 | `311` | Erlös Speisen und Getränke 8,1 % |
| Minibar | `1101` | `3500` | `D` | 10.81 | −0.81 | `311` | Erlös Übrige Erlöse 8,1 % |
| Take-away | `1101` | `3260` | `D` | 15.39 | −0.39 | `312` | Erlös Speisen und Getränke 2,6 % |

**Kurtaxe, Gästetaxe, Beherbergungsabgabe.** Die Zeilen der Kurtaxe (CityTaxes, SecondCityTax, GuestLevies) laufen durch ihre Zeile der Kontenzuordnung wie jede andere Zeile, unter derselben Prüfung der MWST. Eine Kurtaxe, die der Gast schuldet, auf einer Verbindlichkeit ohne MWST-Code ist ein durchlaufender Posten ohne `TaxData`; mit einem Code für Ziffer 910 und Satz 0 trägt sie die MWST 0.00. Eine Abgabe, die apaleo besteuert (eine Beherbergungsabgabe, die das Hotel selbst schuldet, oder eine Kurtaxe, die nicht separat verrechnet wird), geht mit dem MWST-Code der Beherbergung auf ihr Konto; hat ihre Zeile keinen MWST-Code, stoppt der Export mit `E-VAT-MISSING`. Die Übersicht zeigt die Abgaben pro Abacus-Konto, mit oder ohne MWST.

| Fall | Collective | Single | `DebitCredit` | Betrag | MWST | MWST-Code | `Text1` |
|---|---|---|---|---|---|---|---|
| Kurtaxe des Gastes, durchlaufender Posten | `1101` | `2210` | `D` | 4.20 | keine | | Kurtaxe |

**Anzahlung, erhalten, aufgelöst und zurückbezahlt.** Die erhaltene Anzahlung trägt die MWST bei Erhalt, bei vereinbarten wie bei vereinnahmten Entgelten (MWSTG Art. 40 Abs. 1 Bst. c und Abs. 2), mit dem MWST-Code ihres Satzes. apaleo bucht die Auflösung als negative Belastung auf derselben Anzahlung und die Rückzahlung als negative Anzahlung; beide buchen die MWST zurück, mit `C` und positiver MWST auf dem Anzahlungskonto. Eine Liabilities-Seite zählt als Zugang, wenn sie mit einem positiven Betrag entlastet oder mit einem negativen belastet wird, sonst als Abgang; ein Abgang gegen eine Zahlung ist eine Rückzahlung. Eine Überzahlung, die apaleo mit 0 % parkt, geht ohne MWST auf `2039`.

| Fall | Collective | Single | `DebitCredit` | Betrag | MWST | MWST-Code | `Text1` |
|---|---|---|---|---|---|---|---|
| Anzahlung per Twint | `1090` | `2030` | `D` | 311.40 | −11.40 | `313` | Anzahlung 3,8 % |
| Auflösung beim Check-out | `1101` | `2030` | `C` | 207.60 | 7.60 | `313` | Auflösung Anzahlung 3,8 % |
| Rückzahlung per Twint | `1090` | `2030` | `C` | 103.80 | 3.80 | `313` | Rückzahlung Anzahlung 3,8 % |

**Rechnung an eine Firma.** Der Check-out auf die Debitoren bucht vom Gästefolio auf die Debitoren apaleo, mit der Rechnungsnummer in `Text2`:

| Fall | Collective | Single | `DebitCredit` | Betrag | MWST | `Text2` | `Text1` |
|---|---|---|---|---|---|---|---|
| Halbpension 186.84 und Getränke 21.62 auf Rechnung | `1102` | `1101` | `D` | 208.46 | keine | ENG-2026-0815 | Forderung an Debitor |

Die Halbpension selbst ist eine Zeile auf dem Beherbergungskonto zu 3,8 %, weil der Beherbergungsanteil mindestens 70 % ausmacht; wie ein Paket aufgeteilt wird, entscheidet das Hotel in apaleo (siehe [mapping-guide.md](mapping-guide.md#halbpension-und-vollpension)).

**Debitorenverlust mit MWST-Korrektur.** apaleo belastet den Debitorenverlust und entlastet die Gästeforderung, mit der MWST der Forderung. Mit dem MWST-Code des Satzes steht das Verlustkonto in `SingleInformation` im Soll (`C`), und die MWST ist positiv: Sie mindert die Umsatzsteuer als Entgeltsminderung (MWSTG Art. 41). Ohne `taxes[]` geht der Verlust auf das Verlustkonto ohne MWST-Code (`3808`), ohne `TaxData`. Die Übersicht zeigt die abgeschriebenen Forderungen pro Satz.

| Fall | Collective | Single | `DebitCredit` | Betrag | MWST | MWST-Code | `Text1` |
|---|---|---|---|---|---|---|---|
| Nicht bezahlte Nacht abgeschrieben (MWST aus apaleo 4.39306358) | `1101` | `3805` | `C` | 120.00 | 4.39 | `313` | Debitorenverlust 3,8 % |

**Annullationen und No-Shows.** Sie laufen wie jeder Erlös durch ihre Zeile und die Prüfung der MWST, mit dem Satz, den apaleo berechnet hat. Ohne MWST sind sie Schadenersatz (ESTV MBI 08 Ziff. 8.7) und gehen ohne `TaxData` auf `3680`. Hat apaleo eine Annullation besteuert und die Zeile keinen MWST-Code, stoppt der Export mit `E-VAT-MISSING`; lässt die Vorlage die Zeile leer (eine Annullation mit MWST), mit `E-UNMAPPED`.

| Fall | Collective | Single | `DebitCredit` | Betrag | MWST | MWST-Code | `Text1` |
|---|---|---|---|---|---|---|---|
| Annullation ohne MWST | `1101` | `3680` | `D` | 80.00 | keine | | Erlös Annullation 0 % |

**Zahlungen.** Eine Zahlung bucht vom Transferkonto oder der Kasse auf die Gästeforderung, ohne MWST. Die zweite Zeile, die apaleo mit jeder Zahlung schreibt (`<Folio>_Receivables` an `<Folio>_Receivables/Offset`), liegt auf demselben Abacus-Konto und wird übersprungen.

| Fall | Collective | Single | `DebitCredit` | Betrag | MWST | `Text1` |
|---|---|---|---|---|---|---|
| Barzahlung beim Check-out | `1000` | `1101` | `D` | 224.76 | keine | Zahlung Bar |
| Kartenzahlung | `1090` | `1101` | `D` | 8.40 | keine | Zahlung Mastercard |

So sieht die Anzahlung per Twint in der Datei aus (gekürzt):

```xml
<CollectiveInformation mode='SAVE'>
  <DebitCredit>D</DebitCredit>
  <KeyCurrency>CHF</KeyCurrency>
  <KeyAmount>311.40</KeyAmount>
  <Account>1090</Account>
  <TaxAccount>2200</TaxAccount>
  <Text1>Anzahlung 3,8 %</Text1>
</CollectiveInformation>
<SingleInformation mode='SAVE'>
  <KeyAmount>311.40</KeyAmount>
  <Account>2030</Account>
  <TaxData mode='SAVE'>
    <TaxIncluded>I</TaxIncluded>
    <UseCode>0</UseCode>
    <KeyAmount>-11.40</KeyAmount>
    <TaxRate>3.8</TaxRate>
    <TaxCode>313</TaxCode>
  </TaxData>
</SingleInformation>
```

## Vereinnahmte Entgelte

Mit `abacus.abrechnungsart: vereinnahmt` sind die Buchungen dieselben; nur der `UseCode` wird `1`, und das Steuerkonto der `CollectiveInformation` wird das Hilfskonto (`abacus.mwstHilfskonto`, Standard `2202`). Abacus bucht die MWST dieser Buchungen dann auf das Hilfskonto und überträgt sie erst auf das Steuerkonto, wenn eine Zahlung erfasst wird, normalerweise in der Debitorenbuchhaltung, die dieses Tool nicht bedient. Die Datei bucht die MWST am Tag der Leistung, nach vereinnahmten Entgelten entsteht sie aber mit der Zahlung (MWSTG Art. 40 Abs. 2); das betrifft Rechnungen, die am Periodenende offen sind. `doctor` und jeder Export, auch der Probelauf, warnen deshalb mit `W-ABRECHNUNGSART-VEREINNAHMT`, einmal pro Hotel und Monat: in der Ausgabe dieses Monats und in seinem Protokoll. Der Exit-Code bleibt 0. Wie dein Treuhänder das Hilfskonto am Periodenende korrigiert, steht in [mapping-guide.md](mapping-guide.md#vereinnahmte-entgelte).

## Anzahlungen ohne MWST-Betrag

In echten apaleo-Daten kommt jede Anzahlung, ihre Auflösung und ihre Rückzahlung mit `taxes[]` oder mit 0 %, und es gibt keine `PostPrepaymentVat`-Zeilen. Für ältere Daten und andere Quellen gilt: Die Auflösung (Soll auf dem Konto `Liabilities` des Gastes, Haben auf seinem Konto `Receivables`) muss den Satz der Anzahlung tragen. Schickt apaleo sie ohne `taxes[]`, wird der Satz ermittelt, nie mit 0 % angenommen:

1. aus der oder den `PostPrepaymentVat`-Zeilen desselben Geschäftstags und derselben Referenz (ihr Steuersatz, oder der bekannte Satz, dessen MWST auf der Auflösung ihrem Betrag entspricht). Die Steuer ist dann der Betrag dieser Zeile (bei mehreren Auflösungen die aus dem Bruttobetrag berechnete Steuer jeder Auflösung), und die berechnete Steuer muss bis auf einen Rappen der MWST auf diesen Zeilen entsprechen;
2. sonst aus dem MWST-Satz des Kontos `Liabilities` oder seines Elternkontos im Kontenplan von apaleo, mit der Steuer `round(|Brutto| × Satz / (100 + Satz))` und der Warnung `W-VAT-INFERRED` (immer, auch wenn dieser Satz 0 % ist);
3. sonst stoppt der Export mit `E-VAT-RATE-UNKNOWN`, statt die Auflösung ohne MWST zu buchen.

Eine erhaltene oder zurückbezahlte Anzahlung ohne `taxes[]` nimmt den Satz einer `PostPrepaymentVat`-Zeile desselben Geschäftstags und derselben Referenz, die MWST in ihrer Richtung bucht (Eingang) oder zurückbucht (Rückzahlung), mit derselben Prüfung des Betrags. Ohne eine solche Zeile bleibt es bei 0 % (ohne Rückgriff auf den Kontenplan). `mapping check --from --to` nutzt dieselbe Ermittlung.

## Übersprungene Zeilen

| Grund | Zeilen |
|---|---|
| `VAT_ACCOUNT_LINE` | Jede Zeile, die ein apaleo-Konto `Vat` oder `VatOnLiabilities` berührt, auch `PostPrepaymentVat`. Abacus bucht die MWST aus den `TaxData` der Erlös- oder Anzahlungsbuchung; würden die MWST-Zeilen von apaleo zusätzlich gebucht, stünde die MWST doppelt in der MWST-Abrechnung. Diese Konten brauchen keine Zeile in der Kontenzuordnung. |
| `ZERO_AMOUNT` | Bruttobetrag 0. |
| `SAME_ACCOUNT` | Beide Seiten sind demselben Abacus-Konto zugeordnet, zum Beispiel eine Umbuchung zwischen zwei Gastfolios auf `1101`, oder die zweite Zeile einer Zahlung (`<Folio>_Receivables` an `<Folio>_Receivables/Offset`). |

Übersprungene Zeilen behalten ihre Anzahl und ihre Bruttosumme ohne Vorzeichen in der Übersicht, es verschwindet also nichts.

## Felder

- **Text1**: eine Bezeichnung in Schweizer Hochdeutsch ohne Gästenamen, gekürzt auf 80 Zeichen: `Erlös Beherbergung 3,8 %` oder `Erlösminderung …` nach Seite und Vorzeichen, `Anzahlung 3,8 %`, `Umbuchung Anzahlung`, `Auflösung Anzahlung 8,1 %`, `Rückzahlung Anzahlung`, `Zahlung Visa` oder `Rückzahlung …` (englische Namen der Zahlungsarten übersetzt oder weggelassen), `Forderung an Debitor`, `Debitorenverlust 3,8 %`, `Kurtaxe`. Konten vom Typ Receivables, AccountsReceivable und Liabilities ausserhalb des globalen Buchungsjournals nutzen den Namen ihres globalen Elternkontos oder eine feste Bezeichnung (`Gästeforderung`, `Debitor`, `Anzahlung Gast`), nie ihren eigenen Namen, denn der kann der eines Gastes sein.
- **Text2**: die Belegnummer aus apaleo (Rechnung, Referenz des Zahlungsanbieters, …), wenn `posting.text2` auf `receipt` steht (Standard) und es eine gibt, sonst die Reservationsreferenz. Nie ein Gastname.
- **DocumentNumber**: die Belegnummer, die das Tool bildet (Monat und Tag des ersten Tags der Datei und ein Zähler).
- **Kostenstelle** (`BookingLevel1`): nur aus der Zeile des Kontos in `SingleInformation`, und nur, wenn das eine Erlös- oder Debitorenverlustzeile ist. Auf Zahlungen, Debitoren, Anzahlungen, Kurtaxe und Transferkonten bleibt sie leer, denn Abacus nimmt eine Kostenstelle nur auf Erfolgskonten an.

## Übersicht

Alles in Rappen: Soll, Haben und Saldo pro Abacus-Konto nach dem Bewegungsmodell (das Konto der `CollectiveInformation` mit dem Bruttobetrag, das Konto der `SingleInformation` mit dem Bruttobetrag minus der MWST); Erlöse, Anzahlungen und abgeschriebene Forderungen (Debitorenverluste mit der MWST-Korrektur) pro MWST-Code und Satz mit Netto, MWST und Brutto, wie sie an Abacus gehen, daneben die genaue MWST von apaleo auf denselben Zeilen; Kurtaxe und andere Abgaben, gesamt und pro Abacus-Konto mit oder ohne MWST; Zahlungen pro Konto; erhaltene, aufgelöste und zurückbezahlte Anzahlungen; die Bewegung auf den Debitoren; übersprungene Zeilen pro Grund; die Rundungssumme; Befunde pro Code.

Im Schweizer Testmonat sind das zum Beispiel: Beherbergung `313` netto 645.61, MWST 24.53 (genau aus apaleo 24.53306358), brutto 670.14; Normalsatz `311` netto 80.00, MWST 6.48; reduzierter Satz `312` netto 15.00, MWST 0.39; Annullation ohne MWST-Code 80.00; Kurtaxe 12.60 auf `2210` ohne MWST; Anzahlungen erhalten 311.40, aufgelöst 311.40, davon zurückbezahlt 103.80, MWST der Anzahlungen 0.00; Debitorenverlust `313` 120.00 mit der MWST-Korrektur 4.39; Kasse `1000` 240.15, Transferkonto `1090` 296.00, Debitoren `1102` 208.46. Die Salden aller Konten ergeben zusammen die MWST, die Abacus bucht: 24.53 + 6.48 + 0.39 − 4.39 = 27.01.
