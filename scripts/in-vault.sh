#!/bin/sh
# Legt die gebauten Stände in den Vault-Ordner Software/, damit CJ sie per Doppelklick öffnet.
# Aufruf nach dem Bauen: sh scripts/in-vault.sh. Ordner über SCHEMACAD_VAULT.
set -e
cd "$(dirname "$0")/.."
VAULT="${SCHEMACAD_VAULT:-$HOME/Desktop/Obsidian-Claude/SchemaCAD/Software}"
[ -d "$VAULT" ] || { echo "Vault-Ordner fehlt: $VAULT"; exit 1; }
[ -f dist/ElplexaCAD.html ] && [ -f dist/schemacad.html ] || { echo "Erst bauen: npm run build"; exit 1; }
cp dist/ElplexaCAD.html "$VAULT/ElplexaCAD.html"
cp dist/schemacad.html "$VAULT/schemacad-v3.html"
echo "Im Vault: $VAULT/ElplexaCAD.html und schemacad-v3.html"
