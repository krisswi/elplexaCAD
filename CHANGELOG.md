# Änderungen

Neueste oben. Versionen nach dem Schema `Haupt.Neu.Fehler`: neue Funktionen erhöhen die mittlere Zahl, reine Fehlerbehebungen die letzte. Die Dateiversion (Feld `v` in der Projektdatei) zählt getrennt.

## Unveröffentlicht
- Neues Modul **Handnotizen** (nur elplexaCAD, Zweig `wunsch/handnotizen`, `src/hand.js`): mit dem Apple Pencil schreiben (Stift mit Druck, Marker, Radierer, Farben, Rückgängig), Seiten, Zoom. Privat: eigene Datenbank im Browser, nie im Projekt, nie im Teilen-Link. Suche über Titel und getippten Text. Import PDF, Bilder, Sicherung und einzelne Blätter des Projekts; Export PDF, PNG, Sicherung. Dateiversion unverändert. Test `python3 test/hand_tests.py`.
- Neue Adresse https://krisswi.github.io/elplexaCAD/ (die alte leitet weiter, auch Teilen-Links). Arbeitsweise mit Git: Zweig pro Änderung, Tests auf GitHub vor dem Online-Stellen, Commit-Sperre, `npm run build` / `npm test` / `npm run vault`, Spec in `docs/spec.md`.
- Test-Ausgaben (`test_*.dxf`) nicht mehr im Repo.

## 1.0.0 – 2026-10-19
Erster Stand mit Version (Commit 52cf3ae), Dateiversion 17.
- elplexaCAD: Projektübersicht mit Modulen Schema, Disposition, PV; Projektdaten, Status, Zeit; Adresse und GWR; Online-Projekte; Teilen per Link (nur ansehen, auch einzelne Module); eigenes PDF; Feedback.
- Schema: Hauptlinien über den Blattrand, Wandlermessung nach BKW, Titelseite, Inhaltsverzeichnis, Legende der Sicherungsgruppen, freies Zeichnen, Wünsche A–D (Text drehen, Klemmentexte, Klick-Regel, Symbolsuche, Autoverkabelung, Schriftfeld rechts, Blätter verschieben).
- Disposition: Schrank, Platten, Schienen, NH-Trenner, Bemassung, Textgrösse auf einmal.
- PV-Strangplan mit Stringübersicht.
