---
name: plan-aufbereiten
description: Alten Elektroplan (Foto, Scan, PDF) als elplexaCAD-Plan aufbereiten – ein Stockwerk als .elplexa.json mit Grundriss, Apparaten, Leitungen und Beschriftung auf getrennten Ebenen, die CJ über den Importknopf lädt. Verwenden, sobald CJ einen Plan-Scan gibt und daraus eine Plandatei werden soll.
---

# Plan aufbereiten (Scan → .elplexa.json)

Hochdeutsch, kurz. Ergebnis: eine Datei je Stockwerk, die elplexaCAD ohne Fehler öffnet, dazu ein Prüfbild und ein kurzer Bericht.

## Fragen-Regel (gilt in jedem Schritt)
Bei jeder Unklarheit **zuerst AskUserQuestion**, nie still raten. Je Frage 2–3 Hypothesen, die empfohlene zuerst (mit «(Empfohlen)»). Mehrere Fragen in einem Aufruf bündeln (höchstens 4). Typische Anlässe:
- Massstab: keine oder widersprüchliche Massketten, Massstabsangabe passt nicht zu den Massen.
- Unleserliche Masse oder Texte (Hypothesen: die zwei, drei wahrscheinlichen Lesarten, eine davon aus der Summe der Kette abgeleitet).
- Unbekanntes Symbol oder unbekannte Farbe: Zeile in `docs/symbol-uebersetzung.md` fehlt.
- Raumgrenzen: offene Grundrisse, Wand oder nur Möbel/Linie, Raum endet wo.
- Stockwerk: welches Geschoss, Name im Modul (z. B. «EG», «1. OG»).
- Wandart und Dicke, Tür oder Durchgang, Aufgehrichtung, wenn nicht erkennbar.
Antworten, die eine Übersetzung festlegen, sofort in `docs/symbol-uebersetzung.md` eintragen (siehe unten).

## Daten und Ablage
- Scan und Ausgabe **nie ins Repo** (Kundendaten). Scan liegt dort, wo CJ ihn gibt.
- Ausgabe: `~/Documents/elplexaCAD-Aufbereitet/<Projekt>-<Stockwerk>.elplexa.json`, Aufnahme und Bilder im Scratchpad.
- Ein Stockwerk pro Datei. Mehrere Stockwerke = mehrere Dateien mit **gleichem Nullpunkt** (übereinander deckend).

## Schritte
1. **Plan lesen.** Bild/PDF ansehen (PDF: Seite als Bild, Skill `pdf`). Festhalten: Stockwerk, Massketten, Aussenmasse, Wände, Öffnungen, Symbole, Leitungen, Farben, Texte, Raumnamen. Was unsicher ist, als Frage notieren.
2. **Rückfragen** (Fragen-Regel), bevor Koordinaten entstehen.
3. **Massstab und Nullpunkt.** Nullpunkt (0|0) = **Aussenecke unten links** des Gebäudes, x nach rechts, y nach oben, alles in mm. Massstab aus den Massangaben ableiten (lange Aussenmasse bevorzugen, mehrere Ketten gegenprüfen), nicht aus dem gedruckten Massstab allein. Zielgenauigkeit ±10 cm; erreichte Genauigkeit (grösste Abweichung zwischen Ketten) im Bericht nennen.
4. **Aufnahme schreiben** (JSON im Scratchpad, Aufbau unten): zuerst Grundriss, dann Apparate, Leitungen, Beschriftung.
5. **Datei erzeugen:** `PATH=$HOME/.local/node/bin:$PATH node .claude/skills/plan-aufbereiten/schreiben.mjs <aufnahme.json> <ausgabe.elplexa.json>`. Das Skript liest über `parseModel`, schreibt über `serializeModel`, bricht ab, wenn Objekte beim Einlesen wegfallen oder der Rundlauf nicht gleich ist, und schreibt nie ins Repo.
6. **Prüfen im Browser:** `dist/ElplexaCAD.html` muss gebaut sein (`npm run build`, wird nicht committet). `python3 .claude/skills/plan-aufbereiten/pruefen.py <datei> <bild.png>` öffnet die Datei, passt den Plan ein und speichert ein Bild. Bild selbst ansehen (Read), mit dem Scan vergleichen (Wände deckungsgleich? Masse stimmen? Symbole am richtigen Ort?), korrigieren, dann **Bild CJ zeigen** (SendUserFile).
7. **Bericht** an CJ: Datei und Pfad, Massstab und Genauigkeit, Anzahl Objekte je Ebene, offene Punkte und Annahmen.
8. **Zurückschreiben:** Was beim Aufbereiten unklar war oder neu gelernt wurde, in diesen Skill (Abschnitt «Erfahrungen») und Übersetzungen in die Tabelle.

## Ebenen
Das Format kennt fest nur `bg` «Hintergrund»; alle anderen Ebenen sind frei benannt (`src/plan.js`, `cleanPlanLayers`: id `a–z0–9`, höchstens 12 Zeichen, höchstens **10 Ebenen**, Reihenfolge = Zeichenfolge, erste zuunterst). Grundriss-Werkzeuge (Wand, Öffnung, Mass) bearbeitet die App nur auf `bg`.
Mindestens vier Ebenen (CJ 30.10.2026):

| id | Name | Inhalt | Zustand |
|---|---|---|---|
| `bg` | Hintergrund | Wände, Öffnungen, Masse (Grundriss) | gesperrt (`lock: true`) |
| `app` | Apparate | Symbole (`sym`) | **aktiv** (`alay`) |
| `ltg` | Leitungen | Leitungen (`line`), Kanäle (`duct`), Aderzahl hängt an der Leitung | |
| `txt` | Beschriftung | Texte, Raumnamen | |

Je nach Plan weitere Ebenen-Paare für Gewerke, z. B. `erda`/`erdl` «Erdung Apparate»/«Erdung Leitungen», `bma`/`bml` «Brandmelde Apparate»/«Brandmelde Leitungen». Welche, fragt der Skill bei Schritt 2 (Hypothesen aus dem, was auf dem Plan ist).

## Aufnahme (Eingabe für schreiben.mjs)
```json
{ "projekt": "…", "stockwerk": "EG", "den": 50, "papier": "A3", "quer": true,
  "ebenen": [{ "id": "bg", "name": "Hintergrund", "lock": true }, { "id": "app", "name": "Apparate" }, …],
  "aktiv": "app",
  "items": [ … Objekte ohne id, die id ist die Stelle in der Liste + 1 … ] }
```
`den` = Druckmassstab (10, 20, 25, 50, 75, 100), nicht der Scan-Massstab. Objekte genau nach dem Kopfkommentar von `src/plan.js` (dort nachlesen, nicht erfinden). Die wichtigsten:
- **Wand** `{ type: "wall", layer: "bg", a, b, d, mat }`: `a`, `b` = **Mittellinie** (Aussenwand mit Aussenkante auf x = 0 → Mittellinie bei x = d/2). `mat`: `beton`, `mauer`, `leicht`, `doppel` (`MATS`). Ecken entstehen, wenn Endpunkte genau gleich sind (`EPS` 0,5 mm).
- **Öffnung** `{ type: "opening", wall: <id der Wand>, t, w, kind, hinge?, side?, br?, h? }`: `t` = Abstand ab `a` entlang der Wand bis Anfang der Öffnung, `w` Breite; `kind` `tuer`, `fenster`, `durchgang`, `schiebe`; Tür `hinge` `l` (Band bei t) / `r` (Band bei t + w), `side` 1 = links der Wand von a nach b gesehen, −1 = rechts. Hängt an der Wand, kein `layer`.
- **Mass** `{ type: "dim", layer: "bg", a, b, off, ref? }`: `off` = Abstand der Masslinie in mm (Vorzeichen = Seite).
- **Symbol** `{ type: "sym", layer: "app", key, at, r, h?, txt? }`: `key` aus `src/plansym/*.js` (Liste `PLAN_SYMS`), `r` Drehung in Grad. Wandsymbole: `at` auf der Wandfläche, Symbol zeigt nach +y in den Raum (mit `r` drehen).
- **Leitung** `{ type: "line", layer: "ltg", pts, kind, col?, curve? }`: `kind` aus `LINE_KINDS` (`decke`, `boden`, `wand`, …), `col` nur wenn von Blau abweichend, Farben aus `PLAN_COLS`.
- **Text** `{ type: "text", layer: "txt", at, txt, r?, col?, tf? }`.

## Raumnamen (vorläufig)
Das Format hat noch kein Raumobjekt (Entscheid im Bau-Chat, Schritt 4). Bis dahin: Raumname als `text` auf `txt` in der Raummitte. **Anpassen, sobald das Raumformat steht** (dann Raumobjekt mit Grenze statt Text, Aufnahme und schreiben.mjs nachführen).

## Symbole und Farben
Übersetzung alt → neu steht in `docs/symbol-uebersetzung.md`. Nur Zuordnungen von dort verwenden. Fehlt eine Zeile: AskUserQuestion (Hypothesen = passende `key` aus `PLAN_SYMS` bzw. Farben aus `PLAN_COLS`), Antwort sofort als neue Zeile eintragen und in diesem Zweig committen (Tabelle enthält keine Kundendaten, nur Symbolarten).

## Prüfliste vor der Abgabe
- `schreiben.mjs`: `verloren: 0`, `rundlauf: true`.
- `pruefen.py`: keine Fehler, Objektzahl wie Aufnahme, Ebenen in der richtigen Reihenfolge, Nullpunkt (roter Kreis) an der Aussenecke unten links.
- Bild mit dem Scan verglichen, Abweichungen im Bericht.
- Nichts im Repo ausser Skill und Tabelle (`git status`).

## Erfahrungen
(wird nach jedem aufbereiteten Plan ergänzt)
