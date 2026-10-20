# elplexaCAD / SchemaCAD v3 – Regeln für Claude im Repo

Browser-App für Elektroplanung (Schema, Disposition, PV-Strangplan). Eine HTML-Datei, läuft offline. Inhaber: CJ (krisswi). Hochdeutsch, kurze Antworten.

## Wo steht was
- Quellcode: `src/` (Einstieg `app.js`, nur elplexaCAD hinter `ELPLEXA` in `elplexa.js`), Build `build.mjs`, Tests `test/`, Supabase-Funktion `supabase/`.
- Ausführliche Spec (Datenformat, Funktionen, Tests je Bereich): `docs/spec.md`. Nur den passenden Abschnitt lesen, nicht ganz.
- Notizen, Wünsche, Entscheidungen: im Obsidian-Vault von CJ (`~/Desktop/Obsidian-Claude/SchemaCAD`), nicht im Repo.
- Änderungen je Version: `CHANGELOG.md`.

## Befehle
- `npm ci` einmal nach dem Klonen, `git config core.hooksPath .githooks` schaltet die Commit-Sperre ein.
- `npm run build` baut `dist/ElplexaCAD.html` und `dist/schemacad.html` (v3).
- `npm test` schnelle node-Tests (auch vor jedem Commit), `npm run test:alle` mit Browser-Tests (Python, Playwright, ezdxf).
- `npm run vault` legt die gebauten Stände in den Vault (`Software/ElplexaCAD.html`, `Software/schemacad-v3.html`).

## Ablauf (Skill `git-ablauf`)
1. Ein Zweig pro Wunsch ab aktuellem `main`: `wunsch/…`, `fix/…`, `umbau/…`.
2. Kleine Commits, Nachricht auf Deutsch, erste Zeile sagt, was sich für CJ ändert.
3. Vor dem Pull Request `npm run test:alle` grün.
4. `git push` und Pull Request nur nach Rückfrage bei CJ (Repo und Seite sind öffentlich).
5. GitHub testet den Pull Request. Zusammenführen auf `main` nur mit OK von CJ, dann geht der Stand online.
6. Neue Version: Eintrag in `CHANGELOG.md`, Tag `vX.Y.Z`.

## Regeln
- Programmieren nach den Karpathy-Richtlinien: Annahmen nennen, einfach bauen, nur Nötiges ändern, Erfolg prüfen.
- Kein Geheimnis ins Repo. Der Supabase-Schlüssel im Code ist der öffentliche (anon). Keine Kundendaten in Tests.
- Supabase (Migrationen, Edge Functions) nur nach Rückfrage ändern.
- v3 und elplexaCAD teilen den Code: nach Änderungen beide bauen und testen.
- Dateiformat: steigt die Dateiversion, im Pull Request nennen (ältere Stände öffnen neuere Dateien nicht).
