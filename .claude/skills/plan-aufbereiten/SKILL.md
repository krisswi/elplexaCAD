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
- Ausgabe: `~/Documents/elplexaCAD-Aufbereitet/<Projekt>-<Stockwerk>.elplexa.json`, Vorschau daneben. Aufnahme und Bilder während der Arbeit im Scratchpad, am Ende nach `…/<Projekt>-<Stockwerk>-Arbeit/` sichern (Scratchpad verschwindet mit der Sitzung).
- Ein Stockwerk pro Datei. Mehrere Stockwerke = mehrere Dateien mit **gleichem Nullpunkt** (übereinander deckend).

## Schritte
1. **Plan lesen.** Bild/PDF ansehen. Festhalten: Stockwerk, Massketten, Aussenmasse, Wände, Öffnungen, Symbole, Leitungen, Farben, Texte, Raumnamen. Was unsicher ist, als Frage notieren.
   - PDF mit gescannten Seiten: Bilder ohne Umrechnen herausziehen (pypdf: XObject mit `/DCTDecode` = JPEG, Rohdaten als `.jpg` schreiben). pdftoppm und PIL fehlen hier.
   - Ausschnitte in Vollauflösung ansehen (`sips -c H B --cropOffset Y X`, Reihenfolge **Y vor X**); die Übersicht allein reicht für Symbole nicht.
   - Liegt der Scan in iCloud Drive (`~/Library/Mobile Documents/…`), verweigert macOS den Zugriff: CJ bitten, ihn in einen normalen Ordner zu legen.
2. **Rückfragen** (Fragen-Regel), bevor Koordinaten entstehen. Ausschnitt des Scans mitschicken (SendUserFile), damit CJ sieht, welches Zeichen gemeint ist: `markieren.py` schneidet aus dem entzerrten Bild und setzt rote Ringe mit Nummern, die Fragen nennen dieselben Nummern. Genug Umgebung zeigen (ca. 3 × 3 m), ein enger Ausschnitt allein lässt sich im Plan nicht finden. Mehrere Runden zu je 4 Fragen sind normal.
3. **Massstab und Nullpunkt.** Nullpunkt (0|0) = **Aussenecke unten links** des Gebäudes, x nach rechts, y nach oben, alles in mm.
   - Pixel der vier Aussenecken im Scan ablesen (Raster mit Pixelzahlen hilft), dann `python3 .claude/skills/plan-aufbereiten/entzerren.py` (bilinear auf die Aussenmasse aus den Ketten, Ausgabe mit Meter-Raster) und mit `kachel.py` Ausschnitte nach Weltkoordinaten schneiden. So lassen sich Wände und Symbole direkt in Metern ablesen.
   - Ecken prüfen: die Kette (z. B. 10.00) muss im entzerrten Bild genau auf 0 und 10 landen. Ein Messfehler an einer Ecke verschiebt die ganze Seite.
   - **Massketten gehen vor dem Bild.** Wo bemasst, Koordinaten aus den Ketten rechnen; Faltungen und Fotoverzerrung machen das Bild in der Mitte bis 20 cm ungenau. Vom Bild nur Unbemasstes (Lage von Innenwänden, Symbolen, Leitungen).
   - Zielgenauigkeit ±10 cm; erreichte Genauigkeit im Bericht nennen (aus Ketten ±2 cm, vom Bild abgelesen ±20 cm).
4. **Aufnahme schreiben** (JSON im Scratchpad, Aufbau unten): zuerst Grundriss, dann Apparate, Leitungen, Beschriftung. Praktisch: ein kleines Python-Skript im Scratchpad mit Helfern `wall()`, `op()`, `sym()`, `line()`, `text()`, das die Aufnahme schreibt (ids = Stelle + 1, Öffnungen verweisen auf die Rückgabe von `wall()`).
5. **Leitungen frei führen** (CJ 30.10.2026: Leitungen möglichst nicht über andere Symbole): `PATH=$HOME/.local/node/bin:$PATH node .claude/skills/plan-aufbereiten/umfahren.mjs <aufnahme.json> [abstand_mm]` setzt Leitungsenden vom Symbolmittelpunkt auf den Anschlusspunkt des Symbols (Pin, Rand der Dose), schiebt Stützpunkte um fremde Symbole herum und meldet, was übrig bleibt. Übrige Stellen (enge Gruppen) in der Aufnahme von Hand neu legen oder ein Symbol leicht verschieben, dann erneut laufen lassen, bis «Keine Leitung über fremden Symbolen». Auch Kamin und Schächte umfahren (prüft das Skript nicht).
6. **Datei erzeugen:** `PATH=$HOME/.local/node/bin:$PATH node .claude/skills/plan-aufbereiten/schreiben.mjs <aufnahme.json> <ausgabe.elplexa.json>`. Das Skript liest über `parseModel`, schreibt über `serializeModel`, bricht ab, wenn Objekte beim Einlesen wegfallen oder der Rundlauf nicht gleich ist, und schreibt nie ins Repo.
7. **Prüfen im Browser:** `dist/ElplexaCAD.html` muss gebaut sein (`npm run build`, wird nicht committet). `python3 .claude/skills/plan-aufbereiten/pruefen.py <datei> <bild.png>` öffnet die Datei, passt den Plan ein und speichert ein Bild. Bild selbst ansehen (Read), mit dem Scan vergleichen (Wände deckungsgleich? Masse stimmen? Symbole am richtigen Ort?), korrigieren, dann **Bild CJ zeigen** (SendUserFile). Für die Vorschau an CJ: `pruefen.py … 1700x2200` (gross, Hochformat), Plan ausschneiden und mit `nebeneinander.py` neben den entzerrten Scan stellen; beides in den Ausgabeordner legen.
8. **Bericht** an CJ: Datei und Pfad, Massstab und Genauigkeit, Anzahl Objekte je Ebene, offene Punkte und Annahmen.
9. **Zurückschreiben:** Was beim Aufbereiten unklar war oder neu gelernt wurde, in diesen Skill (Abschnitt «Erfahrungen») und Übersetzungen in die Tabelle.

## Ebenen
Das Format kennt fest nur `bg` «Hintergrund»; alle anderen Ebenen sind frei benannt (`src/plan.js`, `cleanPlanLayers`: id `a–z0–9`, höchstens 12 Zeichen, höchstens **10 Ebenen**, Reihenfolge = Zeichenfolge, erste zuunterst). Grundriss-Werkzeuge (Wand, Öffnung, Mass) bearbeitet die App nur auf `bg`.
Mindestens vier Ebenen (CJ 30.10.2026):

| id | Name | Inhalt | Zustand |
|---|---|---|---|
| `bg` | Hintergrund | Wände, Öffnungen, Masse (Grundriss) | gesperrt (`lock: true`) |
| `app` | Apparate | Symbole (`sym`) | **aktiv** (`alay`) |
| `ltg` | Leitungen | Leitungen (`line`), Kanäle (`duct`), Aderzahl hängt an der Leitung | |
| `txt` | Beschriftung | Texte, Raumnamen | |
| `offen` | Offen (unklar) | Verweise «?» auf noch unklare Zeichen | nur wenn nötig, CJ löscht sie nach Klärung |

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
- `umfahren.mjs`: «Keine Leitung über fremden Symbolen».
- `schreiben.mjs`: `verloren: 0`, `rundlauf: true`.
- `pruefen.py`: keine Fehler, Objektzahl wie Aufnahme, Ebenen in der richtigen Reihenfolge, Nullpunkt (roter Kreis) an der Aussenecke unten links.
- Bild mit dem Scan verglichen, Abweichungen im Bericht.
- Nichts im Repo ausser Skill und Tabelle (`git status`).

## Stand
- **30.10.2026:** erstes EG fertig zum Testen (173 Objekte, 4 Ebenen, Dateiversion 33), CJ testet den Upload. Arbeitsdateien (Aufnahme-Skript, entzerrtes Bild, Scan-Seiten OG/EG/UG) liegen bei CJ unter `~/Documents/elplexaCAD-Aufbereitet/<Projekt>-<Stockwerk>-Arbeit/`, nicht im Repo. Weiterarbeiten: Aufnahme-Skript dort anpassen, dann Schritte 5–7.
- Offen am EG: einzelne Symbole und Verweise «in der Luft» (siehe Erfahrungen). OG und UG noch nicht aufbereitet.

## Erfahrungen
Wird nach jedem aufbereiteten Plan ergänzt.

**30.10.2026, erstes EG (Scan, Handeinträge rot/grün/blau/orange, keine Legende)**
- Alte Pläne haben oft keine Legende, die Elektro-Zeichen sind von Hand. Ohne Tabelle ist jedes Symbol eine Frage; zwei Fragerunden reichten für die häufigen Zeichen. Seltene Zeichen nicht einzeln fragen, sondern als `VERWEIS` mit `fu: "?"`, `nr: <kurze Beschreibung>` auf eine eigene Ebene «Offen (unklar)» legen und CJ als Liste geben (CJ 30.10.2026: «Alles, Unklares markiert»).
- Gleiches Zeichen, andere Bedeutung je Raum: Leuchten im Korridor = Einbau (`LEUCHTE_EB`), im Zimmer = Decke (`LEUCHTE`). Tabelle hat dafür eine Spalte Raum/Bemerkung.
- Aussenwand «12,5 + 8 + 12,5» = `mat: "doppel"`, `st: 125`, `iso: 80` (d = 330, wird vom Format aus den Schichten gerechnet; ein anderes `d` wird überschrieben).
- Wandsymbole: `at` auf der Wandfläche, `r` so, dass +y in den Raum zeigt: Wand unten `0`, oben `180`, links `-90`, rechts `90`.
- Tür: `side` 1 = links der Wand von a nach b. Für Aussenwände im Uhrzeigersinn um das Haus (unten nach rechts, oben nach links) ist innen immer `side: 1`; Ergebnis im Prüfbild am Bogen kontrollieren.
- Masse: `off` hat das Vorzeichen der Seite links von a→b. Senkrechte Kette a unten → b oben mit `off > 0` liegt links aussen.
- Garagentor und Treppen kennt das Format nicht: Tor als `durchgang`, Treppe nur als Wände. Kamin als kurze dicke Wand (`d` = Kantenlänge, `beton`).
- Massketten über Öffnungen sind Rohbaumasse; Feinkette (12 | 90 | 12 …) gibt Rahmen und Lichtmass, Breite der Öffnung = Lichtmass.
- Antworten von CJ sind oft anders als alle Hypothesen («das braune ist der Gong», «Anschlusskasten Swisscom BEP»). Farbe gehört zur Bedeutung: in der Frage die Farbe des Zeichens nennen. Passt kein Symbol genau, das nächstliegende wählen, den Begriff von CJ als `txt` setzen und in der Tabelle als Annahme kennzeichnen.
- Nach den Rückfragen war die Ebene «Offen» leer; dann die Ebene ganz weglassen.
- **Leitungen nicht aus der Übersicht schätzen** (CJ: «Leitungsführung gar nicht gut, Symbole fehlen»). Vorgehen, das funktioniert hat: entzerrtes Bild in Kacheln von 3,5 × 3,5 m schneiden (`kachel.py`), jede Kachel einzeln lesen und jede Leitung mit Anfang, 2–3 Stützpunkten und Ende in Weltkoordinaten notieren; Leitungen über Kachelgrenzen an der Grenze weiterverfolgen.
- Abzweigdosen zuerst finden, sie sind die Knoten: Kreise, von denen viele Leitungen ausgehen. In der Aufnahme als Variablen (`D_kue = (x, y)`) führen und jede Leitung von dort zum Apparat ziehen.
- Gleiches Zeichen in anderer Form: Kreis mit **langem** Querstrich und vielen Leitungen = Dose, Kreis mit **kurzem** Strich und Leuchtentyp daneben = Einbauleuchte. Typangabe im Scan (EB …) entscheidet.
- Leitungen enden im Scan oft in der Symbolmitte; in elplexaCAD sieht das wie «über das Symbol» aus. Darum Enden immer auf den Anschlusspunkt (umfahren.mjs). In engen Gruppen (WC, Schalterbatterien) hilft es, Symbole 5–10 cm auseinanderzuziehen.
- **Symbole nicht in der Luft** (CJ 30.10.2026, noch offen): Wandsymbole (Steckdose, Schalter, Kombi, Wandleuchte) mit `at` genau auf die Wandfläche legen (Innenseite = Mittellinie ± d/2), nicht nur in die Nähe. Verweise («HV») an das Ende ihrer Leitung setzen oder die Leitung bis zum Verweis führen. Nach dem Prüfbild gezielt danach suchen; ein Prüfskript dafür fehlt noch (Idee: Abstand Wandsymbol → nächste Wandfläche > 20 mm melden).
- Strichart übernehmen: gestrichelt im Scan → `kind: "boden"`, sonst `decke`; gerade gezeichnet → `curve` weglassen.
- `pruefen.py` macht das Bild doppelt scharf (device_scale_factor 2), Ausschnitte mit `sips` schneiden. Überlappende Markierungen auf «Offen» auseinanderziehen.
