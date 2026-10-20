# Änderungen

Neueste oben. Versionen nach dem Schema `Haupt.Neu.Fehler`: neue Funktionen erhöhen die mittlere Zahl, reine Fehlerbehebungen die letzte. Die Dateiversion (Feld `v` in der Projektdatei) zählt getrennt.

## Unveröffentlicht
- Übersicht Etappe 3a, Projekt-Index (ohne Supabase-Änderung): «zuletzt geöffnet» merkt sich jetzt zusätzlich Objekt, Module mit Status, Blattzahl und Stunden. Die Online-Liste holt dazu nur den Teil `project` der Zeile (Objekt, Stunden), nie die Blätter oder PDF; Blattzahl und Module gibt es online so nicht (Anzeige «–»). Lehnt der Server die Abfrage ab, gilt die alte schlanke.
- Übersicht Etappe 2b: zweite Stufe mit Pfad und Reiter «Projekt» (nur Reiter, die etwas tun; «Projekte» und «Zeit» kommen mit ihren Etappen), Tipp-Zeile unten (mit × ausblendbar, im Browser gemerkt, über `?` wieder einblenden), Knopf `?` und Taste `?` mit erweiterter Kürzel-Liste (⌘O, ⌘S, ⇧⌘S, ⌘F, Esc). Nur elplexaCAD, nicht in der geteilten Ansicht, unter 860 px wie bisher.
- elplexaCAD Kopfleiste (Übersicht Etappe 2a, Variante 4): Datei-Menü (Neu, Öffnen, Speichern, Speichern unter, Online speichern), Speicherstand mit Punkt und Text (Neu, Ungespeichert, Gespeichert) rechts, Konto-Kreis mit Menü (Anmelden, Abmelden, Gast; vorher im Bereich Online der Übersicht). Speichern bleibt als Symbol (Hover: Speichern). Nur elplexaCAD, SchemaCAD v3 unverändert. Dateiversion unverändert.
- Projektübersicht: Modulstatus je Modul (Offen, In Arbeit, Geprüft, Versendet, Revision, Archiviert) als Pille auf der Kachel, Taste S; Kacheln umordnen mit ⌥ ← →; Taste 1 bis 9 öffnet in der Übersicht die N-te Kachel. **Dateiversion 18** (nur wenn Status oder Reihenfolge benutzt wird; ältere Stände, auch main und `schemacad-v3.html`, lehnen solche Dateien ab). Review-Fixes: Status und Platz räumen auf, wenn das letzte Blatt eines Moduls fällt; Fokus bei Tastenbedienung; Kontrast der Pillen.
- Neue Adresse https://krisswi.github.io/elplexaCAD/ (die alte leitet weiter, auch Teilen-Links). Arbeitsweise mit Git: Zweig pro Änderung, Tests auf GitHub vor dem Online-Stellen, Commit-Sperre, `npm run build` / `npm test` / `npm run vault`, Spec in `docs/spec.md`.
- Test-Ausgaben (`test_*.dxf`) nicht mehr im Repo.

## 1.0.0 – 2026-10-19
Erster Stand mit Version (Commit 52cf3ae), Dateiversion 17.
- elplexaCAD: Projektübersicht mit Modulen Schema, Disposition, PV; Projektdaten, Status, Zeit; Adresse und GWR; Online-Projekte; Teilen per Link (nur ansehen, auch einzelne Module); eigenes PDF; Feedback.
- Schema: Hauptlinien über den Blattrand, Wandlermessung nach BKW, Titelseite, Inhaltsverzeichnis, Legende der Sicherungsgruppen, freies Zeichnen, Wünsche A–D (Text drehen, Klemmentexte, Klick-Regel, Symbolsuche, Autoverkabelung, Schriftfeld rechts, Blätter verschieben).
- Disposition: Schrank, Platten, Schienen, NH-Trenner, Bemassung, Textgrösse auf einmal.
- PV-Strangplan mit Stringübersicht.
