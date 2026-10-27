# Parallel arbeiten (Worktrees)

Für CJ und Claude. Gilt, sobald zwei oder mehr Wünsche gleichzeitig laufen. Der Ablauf je Wunsch steht im Skill `git-ablauf`.

## Grundregeln
- Ein Wunsch = ein Zweig = ein Arbeitsordner (Worktree) = ein Chat. Nie zwei Chats im selben Ordner.
- Höchstens drei Wünsche gleichzeitig. Jeden Pull Request prüft und gibt CJ frei.
- Nach dem Anlegen eines Worktrees einmal `npm ci`. `node_modules` und `dist/` gehören jedem Ordner allein.
- Ideen sofort in `Aufgabenliste.md` (Vault) eintragen, mit Bereich. Nicht im Chat liegen lassen.

## Gemeinsame Dateien (hier kollidieren Zweige)
`src/app.js`, `src/model.js`, `src/elplexa.js`, `src/elplexa.css`, `src/style.css`, `src/index.template.html`, `CHANGELOG.md`, `docs/spec.md`.
- Berührt ein Wunsch diese Dateien, vor dem Start prüfen, ob ein anderer offener Zweig sie auch ändert (`git diff --stat main..<zweig>`). Wenn ja: nacheinander, nicht parallel.
- Nur ein Zweig zur Zeit ändert das Dateiformat (`model.js`, Dateiversion). Im Pull Request nennen.
- `CHANGELOG.md` erst im Pull Request des Zweigs ergänzen, der als Nächster zusammengeführt wird. Nach jedem Zusammenführen die übrigen Zweige mit `main` aktualisieren.

## Bereiche
Schema, Disposition, PV-Strangplan, Plan: eigene Dateien, in der Regel parallel möglich (Plan: `plan*.js`, PV: `pv*.js`, Dispo: `dispo*.js`, Symbole: `symbols.js`, `prinzipsym.js`, `plansym.js`).
Gesamtansicht (Projekte, Projektzeit, User): `start.js`, `cloud.js`, `profil.js`, `offerte.js`, Anteile in `elplexa.js`. Noch ohne klare Grenze, bis `app.js` aufgeteilt ist.

## Tests
- Beim Arbeiten `npm test` (schnell) und den passenden Browser-Test, zum Beispiel `python3 test/plan_tests.py`.
- Vor dem Pull Request `npm run test:alle`. Das Protokoll liegt pro Lauf in einer eigenen Temp-Datei, zwei Läufe stören sich nicht.

## Zusammenführen
1. Pull Request nur nach Rückfrage bei CJ. GitHub testet.
2. CJ gibt frei, danach `main`, dann geht der Stand online.
3. Offene Zweige danach mit `main` aktualisieren, Konflikte gleich lösen.
