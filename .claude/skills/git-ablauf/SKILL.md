---
name: git-ablauf
description: Fester Git-Ablauf für elplexaCAD (Zweig pro Wunsch, Tests, Pull Request, Version, online nur über main). Verwenden, sobald im Repo Code geändert, committet, gepusht, ein Pull Request erstellt oder ein Stand online gestellt werden soll.
---

# Git-Ablauf elplexaCAD

Hochdeutsch, kurz. Repo `~/Developer/elplexaCAD` ist die einzige Quelle des Codes. `main` = Stand, der online ist.

## Vor dem Bauen
1. `git status` sauber? Sonst CJ fragen, nichts verwerfen.
2. `git switch main && git pull`, dann neuer Zweig: `wunsch/<kurz>`, `fix/<kurz>` oder `umbau/<kurz>`.
3. Annahmen nennen (Karpathy-Richtlinien), nur Nötiges ändern.

## Beim Bauen
- Kleine Commits. Nachricht Deutsch, erste Zeile = was sich für CJ ändert (≤ 72 Zeichen), Leerzeile, dann Details.
- Die Commit-Sperre (`.githooks/pre-commit`) lässt nur grüne node-Tests durch. Nie mit `--no-verify` umgehen.
- Neue Funktion = neuer oder erweiterter Test im Ordner `test/`.

## Vor dem Pull Request
1. `npm run test:alle` grün, Ergebnis ehrlich melden (auch rote Tests mit Ausgabe).
2. Eintrag in `CHANGELOG.md` unter „Unveröffentlicht“.
3. Steigt die Dateiversion: im Pull Request nennen.
4. CJ fragen: „Push und Pull Request?“ Erst nach Ja: `git push -u origin <zweig>`, `gh pr create` mit Titel und kurzer Liste, was CJ prüfen soll.

## Zusammenführen und online
- GitHub testet den Pull Request (Workflow `CI`). Nur bei grünem Test und OK von CJ: `gh pr merge --squash --delete-branch`.
- Der Push auf `main` stellt den Stand online (Job `deploy`, ca. 2 Minuten). Danach prüfen, dass der neue Stand online ist.
- Version: „Unveröffentlicht“ in `CHANGELOG.md` zu `X.Y.Z – Datum` machen, `version` in `package.json` nachführen, Tag `git tag vX.Y.Z && git push origin vX.Y.Z` (nach Rückfrage).
- `npm run build && npm run vault`, damit die Dateien im Vault dem Online-Stand entsprechen.

## Nie
- Direkt auf `main` committen oder `git push --force` auf `main`.
- Geheimnisse, Kundendaten, Test-Ausgaben ins Repo.
- Supabase ändern (Migration, Edge Function) ohne Rückfrage.
