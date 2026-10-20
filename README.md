# elplexaCAD

Browser-App für die Elektroplanung: Stromlaufschema, Disposition (Verteileraufbau) und PV-Strangplan in einem Projekt. Eine HTML-Datei, läuft auch offline. Ausgabe als PDF und DXF.

- Online: https://krisswi.github.io/elplexaCAD/
- Daneben `SchemaCAD v3`: gleicher Code ohne Projektübersicht, nur lokal.
- Online-Projekte, Kataloge und Teilen per Link über Supabase (`src/cloud.js`), mit Anmeldung. Ohne Anmeldung läuft alles mit Dateien.

## Entwickeln

```sh
npm ci
git config core.hooksPath .githooks   # Commit-Sperre bei roten Tests
npm run build                         # dist/ElplexaCAD.html und dist/schemacad.html
npm test                              # schnelle Tests
npm run test:alle                     # mit Browser-Tests (python3 mit ezdxf und playwright)
```

Ablauf: ein Zweig pro Änderung, Pull Request, GitHub testet, nach dem Zusammenführen auf `main` geht der Stand online. Details in `CLAUDE.md`, Spec in `docs/spec.md`, Änderungen in `CHANGELOG.md`.

## Rechte

© CJ (krisswi). Alle Rechte vorbehalten. Der Code ist öffentlich einsehbar, aber nicht zur Weiterverwendung freigegeben. Fremde Teile: `@tarikjabiri/dxf`, jsPDF, svg2pdf.js (MIT), pdf.js (Apache 2.0), Schriften Barlow und Source Sans 3 (OFL), einzelne Symbole nach QElectroTech (CC-BY 3.0).
