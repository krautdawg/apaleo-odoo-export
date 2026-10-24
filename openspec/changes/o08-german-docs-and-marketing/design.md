## Context

o02 to o07 rewrote the guides they touched for Germany and listed them in `GERMANY_FILES` (`odoo-format.md`, `odoo-import.md`, `mapping-guide.md`, `posting-rules.md`, `export.md`, `examples/README.md`, `docker.md`). The README, `README.en.md`, the community files, the disclaimer, the changelog, the GitHub templates and `setup-apaleo.md`, `configuration.md`, `troubleshooting.md`, `architecture.md`, `maintainers.md`, `apaleo-source.md` are still Swiss Standard German about Abacus, apart from renamed commands. The repository is private; discoverability metadata can be set now and takes effect when the maintainer publishes it.

## Goals / Non-Goals

**Goals:**
- Every user-facing file in German as written in Germany, with the reader addressed as "du", and Odoo and German accounting terms as a Kanzlei uses them.
- A first screen that answers "what, for whom, free, no warranty" and contains the search terms people type.
- One rule set in the docs test, no transition lists.

**Non-Goals:**
- Publishing, a release tag, a website, translations beyond `README.en.md`.

## Decisions

1. **Search terms in the first lines, not in a keyword list.** Title, tagline and intro carry "apaleo Odoo Export", "apaleo Odoo", "Odoo Buchhaltung", "Buchungssätze", "Buchungsjournal", "Import", "Hotel", "SKR03", "SKR04", "Steuerberater", "kostenlos", "Open Source" and "Connector" in sentences a person would write; the FAQ answers "Ist das ein kostenloser apaleo Odoo Connector?". Alternative: a keyword block. Rejected: search engines and readers both punish it.
2. **Comparison without vendor names, with the store price and date.** "24-51 EUR pro Monat und Betrieb (je nach Anzahl der Betriebe), laut apaleo Store, Oktober 2026" and the honest trade-offs of running it yourself ("Selbst betreiben heißt …"). Same rule as in the earlier projects: no competitor name in docs, code or messages.
3. **One language rule.** Every German file: German prose, "du", "ß" allowed, German quotation marks; refused: Swiss practice terms (`Treuhänder`, `MWST`, `MWST-Code`, `MWST-Abrechnung`, `Rappen`, `KMU-Kontenrahmen`, `Mandantennummer`, `Leitwährung`), Austrian practice terms, `«` and `»`, and the tokens `Abacus` and `BMD` outside a README line that links an origin project, the README item on other targets, `CHANGELOG.md` and the troubleshooting entries that detect a copied Abacus, BMD or DATEV setup. `DATEV` stays allowed, because Odoo's German localisation and SKR03/SKR04 are DATEV terms a Kanzlei uses. `GERMANY_FILES` and the Swiss checks are deleted.
4. **Disclaimer in German first and binding.** Same structure as before, with Steuerberater instead of Treuhänder, Odoo instead of Abacus, and "keine Verbindung zu apaleo GmbH oder Odoo S.A.".
5. **Topics for discovery.** apaleo, odoo, odoo-accounting, apaleo-odoo, odoo-import, journal-entries, buchhaltung, hotel, hospitality, accounting, skr03, skr04, germany, deutschland, steuerberater, open-source; description "Kostenloser apaleo Odoo Export: Buchungssätze für Odoo Buchhaltung aus apaleo, für Hotels in Deutschland (SKR03/SKR04). Open Source, MIT." Set with `gh repo edit`, visibility untouched.

## Risks / Trade-offs

- [A Swiss user arrives from search] → the README origin sentence links apaleo-abacus-export; the FAQ answers Austria and Switzerland (Odoo l10n_at/l10n_ch via a hand-made mapping, no template).
- [German Odoo UI labels differ from the docs] → menu paths carry the English label in parentheses (o04); open question 7 of the research is in the first-import checklist.

## Open Questions

None for this slice.
