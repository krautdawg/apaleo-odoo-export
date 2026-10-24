#!/usr/bin/env bash
# Lokaler Testimport (o02, Aufgabengruppe 7): importiert jede Golden-Datei aus
# test/golden/odoo/ in Wegwerf-Datenbanken mit Odoo 17, 18 und 19 Community und
# l10n_de SKR03 und SKR04, über den Standardimport von Odoo (base_import) in
# `odoo shell`. Keine API, keine Zugangsdaten, nicht in der CI. Die Datenbanken
# liegen im Arbeitsspeicher des Postgres-Containers und verschwinden am Ende.
#
#   ./run.sh                 # alle drei Versionen, beide Kontenrahmen
#   ./run.sh 19 skr04        # eine Version, ein Kontenrahmen
set -euo pipefail
cd "$(dirname "$0")"

versions=("${1:-17 18 19}")
charts=("${2:-skr03 skr04}")
log="results-$(date +%Y%m%d-%H%M%S).log"

cleanup() { docker compose down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker compose up -d --wait db >/dev/null 2>&1
for version in ${versions[*]}; do
  # Odoo 17 and 18 load demo data unless told not to; Odoo 19 only with --with-demo.
  demo=(--without-demo=all)
  if [ "$version" -ge 19 ]; then demo=(); fi
  for chart in ${charts[*]}; do
    db="check${version}_${chart}"
    echo "== Odoo ${version}, ${chart}" | tee -a "$log"
    docker compose run --rm -T "odoo${version}" odoo -d "$db" -i account,l10n_de --load-language=de_DE "${demo[@]}" --stop-after-init --log-level=warn >/dev/null
    docker compose run --rm -T -e CHART="$chart" "odoo${version}" odoo shell -d "$db" --no-http --log-level=error < check.py 2>&1 | grep -E '^(RESULT|Traceback|  File|[A-Za-z]+Error)' | tee -a "$log"
  done
done
echo "Ergebnis: scripts/odoo-check/$log"
