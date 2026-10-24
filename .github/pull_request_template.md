## Was und warum

<!-- Was ändert sich, und warum? Verlinke das Issue und die OpenSpec-Änderung (openspec/changes/<name>/). Beschreibung auf Deutsch oder Englisch. -->

## Wie getestet

<!-- Befehle, die du ausgeführt hast, neue Tests, aktualisierte und geprüfte Golden Files (UPDATE_GOLDEN=1). -->

## Checkliste

- [ ] Tests decken die Änderung ab, und `pnpm test`, `pnpm lint`, `pnpm typecheck` und `pnpm build` laufen lokal durch.
- [ ] Dokumentation ist aktualisiert, in Schweizer Hochdeutsch: README oder `docs/` für neue Befehle, Optionen und Konfigurationsschlüssel, `docs/troubleshooting.md` für neue Befund-Codes, `CHANGELOG.md` unter Unveröffentlicht.
- [ ] Keine Secrets: kein Client-Secret, kein Token, keine `.env`-Datei und keine echten MWST- oder UID-Nummern und keine Mandantennummern echter Abacus-Mandanten in Code, Testdaten, Tests oder dieser Beschreibung.
- [ ] Keine personenbezogenen Daten: keine echten Gästenamen, E-Mail-Adressen, Reservations- oder Rechnungsnummern; beigesteuerte apaleo-Antworten sind anonymisiert.
- [ ] Commits folgen den Conventional Commits, auf Englisch.
