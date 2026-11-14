#!/usr/bin/env bash
set -euo pipefail
base_url="${1:-https://new.thibault-leveau.com}"
base_url="${base_url%/}"
curl --fail --silent --show-error "$base_url/api/health" | python3 -c 'import json,sys; assert json.load(sys.stdin) == {"status":"ok"}'
curl --fail --silent --show-error "$base_url/" | python3 -c 'import sys; assert "Thibault Leveau" in sys.stdin.read()'
curl --fail --silent --show-error "$base_url/documentation/" | python3 -c 'import sys; assert "<html" in sys.stdin.read()'
curl --fail --silent --show-error "$base_url/documentation/search/search_index.json" | python3 -c 'import json,sys; assert json.load(sys.stdin)["docs"]'
curl --fail --silent --show-error "$base_url/admin" | python3 -c 'import sys; assert "Thibault Leveau" in sys.stdin.read()'
admin_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$base_url/api/admin/session")"
case "$admin_status" in
  401|503) ;;
  *) echo "Accès administratif anonyme inattendu : $admin_status" >&2; exit 1 ;;
esac
for route in /inconnu /api/inconnue /documentation/inexistante/ /admin/inconnu; do
  status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$base_url$route")"
  test "$status" = 404 || { echo "Statut inattendu pour $route : $status" >&2; exit 1; }
done
echo "Contrôles HTTP réussis : $base_url"
