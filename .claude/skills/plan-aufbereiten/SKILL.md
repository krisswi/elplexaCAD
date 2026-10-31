---
name: plan-aufbereiten
description: Alten Elektroplan (Foto, Scan, PDF) als elplexaCAD-Plan aufbereiten – ein Stockwerk als .elplexa.json mit Grundriss, Apparaten, Leitungen und Beschriftung auf getrennten Ebenen, die CJ über den Importknopf lädt. Verwenden, sobald CJ einen Plan-Scan gibt und daraus eine Plandatei werden soll.
---

# Plan aufbereiten (Scan → .elplexa.json)

Hochdeutsch, kurz. Ergebnis: eine Datei je Stockwerk (Dateiversion 34 mit Räumen), die elplexaCAD ohne Fehler öffnet und CJ im Plan über den Knopf «Import» lädt, dazu ein Prüfbild und ein kurzer Bericht.

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
4. **Aufnahme schreiben** (JSON im Scratchpad, Aufbau unten): zuerst Grundriss, dann Apparate, Leitungen, Beschriftung. Praktisch: ein kleines Python-Skript im Scratchpad mit Helfern `wall()`, `op()`, `room()`, `sym()`, `line()`, `text()`, das die Aufnahme schreibt (ids = Stelle + 1, Öffnungen verweisen auf die Rückgabe von `wall()`).
5. **Leitungen frei führen** (CJ 30.10.2026: Leitungen möglichst nicht über andere Symbole): `PATH=$HOME/.local/node/bin:$PATH node .claude/skills/plan-aufbereiten/umfahren.mjs <aufnahme.json> [abstand_mm]` setzt Leitungsenden vom Symbolmittelpunkt auf den Anschlusspunkt des Symbols (Pin, Rand der Dose), schiebt Stützpunkte um fremde Symbole herum und meldet, was übrig bleibt. Übrige Stellen (enge Gruppen) in der Aufnahme von Hand neu legen oder ein Symbol leicht verschieben, dann erneut laufen lassen, bis «Keine Leitung über fremden Symbolen». Auch Kamin und Schächte umfahren (prüft das Skript nicht).
5b. **Lage prüfen** (CJ 30.10.2026: «nichts in der Luft»): `PATH=$HOME/.local/node/bin:$PATH node .claude/skills/plan-aufbereiten/lage.mjs <aufnahme.json> [--marken]` meldet Wandsymbole neben der Wandfläche oder falsch gedreht (mit Vorschlag `at`/`r`; Wand als Rechteck, Stirnseiten zählen), Verweise ohne Leitungsende an der Spitze, lose Leitungsenden und Apparate ohne Leitung (nur Hinweis). `--marken` gibt die Marken für `markieren.py`. Unklare Stellen mit markiertem Ausschnitt fragen; was bewusst so bleibt, im Bericht nennen.
6. **Datei erzeugen:** `PATH=$HOME/.local/node/bin:$PATH node .claude/skills/plan-aufbereiten/schreiben.mjs <aufnahme.json> <ausgabe.elplexa.json>`. Das Skript liest über `parseModel`, schreibt über `serializeModel`, bricht ab, wenn Objekte beim Einlesen wegfallen, der Rundlauf nicht gleich ist oder die Räume nicht stimmen (siehe «Räume»), und schreibt nie ins Repo.
7. **Prüfen im Browser:** `dist/ElplexaCAD.html` muss gebaut sein (`npm run build`, wird nicht committet). `python3 .claude/skills/plan-aufbereiten/pruefen.py <datei> <bild.png>` öffnet die Datei, passt den Plan ein und speichert ein Bild. Bild selbst ansehen (Read), mit dem Scan vergleichen (Wände deckungsgleich? Masse stimmen? Symbole am richtigen Ort?), korrigieren, dann **Bild CJ zeigen** (SendUserFile). Für die Vorschau an CJ: `pruefen.py … 1700x2200` (gross, Hochformat), Plan ausschneiden und mit `nebeneinander.py` neben den entzerrten Scan stellen; beides in den Ausgabeordner legen.
8. **Bericht** an CJ: Datei und Pfad, Massstab und Genauigkeit, Anzahl Objekte je Ebene, offene Punkte und Annahmen.
9. **Zurückschreiben:** Was beim Aufbereiten unklar war oder neu gelernt wurde, in diesen Skill (Abschnitt «Erfahrungen») und Übersetzungen in die Tabelle.

## Ebenen
Das Format kennt fest nur `bg` «Hintergrund»; alle anderen Ebenen sind frei benannt (`src/plan.js`, `cleanPlanLayers`: id `a–z0–9`, höchstens 12 Zeichen, höchstens **10 Ebenen**, Reihenfolge = Zeichenfolge, erste zuunterst). Grundriss-Werkzeuge (Wand, Öffnung, Mass) bearbeitet die App nur auf `bg`.
Mindestens vier Ebenen (CJ 30.10.2026):

| id | Name | Inhalt | Zustand |
|---|---|---|---|
| `bg` | Hintergrund | Wände, Öffnungen, Masse, Räume (Grundriss) | gesperrt (`lock: true`) |
| `app` | Apparate | Symbole (`sym`) | **aktiv** (`alay`) |
| `ltg` | Leitungen | Leitungen (`line`), Kanäle (`duct`), Aderzahl hängt an der Leitung | |
| `txt` | Beschriftung | Texte (Raumnamen nicht, die sind Räume auf `bg`) | |
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
- **Verweis** (`key: "VERWEIS"`, `fu`, `nr?`): `at` = Spitze = Ende der Leitung; der Kasten liegt ohne Angabe 8 mm links oberhalb und wirkt dann verloren. Darum `lo` (Papier-mm ab der Vorgabe −8|4) so setzen, dass der Kasten in Leitungsrichtung direkt am Ende sitzt (CJ 30.10.2026: «Kasten ans Ende», Rechnung im EG-Aufnahme-Skript am Schluss).
- **Leitung** `{ type: "line", layer: "ltg", pts, kind, col?, curve? }`: `kind` aus `LINE_KINDS` (`decke`, `boden`, `wand`, …), `col` nur wenn von Blau abweichend, Farben aus `PLAN_COLS`.
- **Raum** `{ type: "room", layer: "bg", at, name, tf?, na? }`: Raumname, `at` = Mitte der Beschriftung und bestimmt den Raum (muss innerhalb der Wände liegen), `name` höchstens 40 Zeichen. Die Fläche rechnet die App aus den Wänden und zeigt sie darunter (`na: true` = ohne Fläche). Keine Grenze angeben.
- **Text** `{ type: "text", layer: "txt", at, txt, r?, col?, tf? }`.

## Räume (seit Dateiversion 34, CJ 30.10.2026)
Die App erkennt geschlossene Räume selbst aus den Wänden (`src/planraum.js`): Mittellinien aller Wände, Türen, Fenster und Durchgänge gelten als geschlossen, T-Stösse zählen, wenn das Wandende auf der Mittellinie oder Innenkante der anderen Wand liegt (Abstand höchstens halbe Dicke). Lose Enden fallen weg, Flächen unter 0,3 m² sind kein Raum. Jeder erkannte Raum ohne Raumobjekt bekommt in der App sofort «Raum n».
- Darum für jeden Raum mit Namen im Scan ein `room` auf `bg` in die Raummitte setzen, mit dem Namen aus dem Scan (z. B. «Küche», «Zimmer 1»). Räume ohne Namen im Scan (Schacht, Reduit) trotzdem benennen oder CJ fragen, sonst heissen sie «Raum n».
- `schreiben.mjs` rechnet die Räume wie die App und meldet unter `raeume`: `ohneName` (mit Vorschlag `at` und Fläche), `ausserhalb` (Name liegt in keinem Raum: Wand offen, Ecke nicht genau gleich oder Name ausserhalb) und `doppelt` (zwei Namen im selben Raum: Trennwand fehlt). Dann bricht es ab. Erst Wände schliessen bzw. Namen setzen; offene Grundrisse, die bewusst ein Raum sind, mit `--raum-offen` durchlassen und im Bericht nennen.
- Die Flächen aus `benannt` mit Flächenangaben im Scan vergleichen (wenn vorhanden): grosse Abweichung = Wand falsch gelesen.
- Der Import nimmt Räume mit. Beim Ziel «In offenen Plan» landet der Grundriss samt Räumen nur dann auf «Hintergrund», wenn dieser leer ist.

## Symbole und Farben
Übersetzung alt → neu steht in `docs/symbol-uebersetzung.md`. Nur Zuordnungen von dort verwenden. Fehlt eine Zeile: AskUserQuestion (Hypothesen = passende `key` aus `PLAN_SYMS` bzw. Farben aus `PLAN_COLS`), Antwort sofort als neue Zeile eintragen und in diesem Zweig committen (Tabelle enthält keine Kundendaten, nur Symbolarten).

## Prüfliste vor der Abgabe
- `umfahren.mjs`: «Keine Leitung über fremden Symbolen».
- `lage.mjs`: `wand`, `verweis` leer oder jede Meldung im Bericht begründet; `offenEnde` nur Leitungen, die bewusst ins Leere gehen (Leerrohr, Zuleitung von aussen).
- `schreiben.mjs`: `verloren: 0`, `rundlauf: true`, unter `raeume` keine `ohneName`, `ausserhalb`, `doppelt` (oder bewusst `--raum-offen`, im Bericht genannt).
- `pruefen.py`: keine Fehler, Objektzahl wie Aufnahme, Ebenen in der richtigen Reihenfolge, Nullpunkt (roter Kreis) an der Aussenecke unten links.
- Bild mit dem Scan verglichen, Abweichungen im Bericht.
- Nichts im Repo ausser Skill und Tabelle (`git status`).

## Stand
- **30.10.2026:** erstes EG fertig zum Testen (173 Objekte, 4 Ebenen, Dateiversion 33), CJ testet den Upload. Arbeitsdateien (Aufnahme-Skript, entzerrtes Bild, Scan-Seiten OG/EG/UG) liegen bei CJ unter `~/Documents/elplexaCAD-Aufbereitet/<Projekt>-<Stockwerk>-Arbeit/`, nicht im Repo. Weiterarbeiten: Aufnahme-Skript dort anpassen, dann Schritte 5–7.
- **30.10.2026, später:** Skill auf Räume umgestellt (Dateiversion 34). EG neu: 5 Räume (Wohnen mit Entrée, Eingang, Küche, Essen als offener Raum, diese Namen bleiben Text), Verweise am Leitungsende, Schalter an der Treppe auf Wände gesetzt, grünes Zeichen mitten im Wohnen weggelassen (CJ). Bewusst: Schalter Treppe oben auf dem 12 cm-Wandkopf, die äusseren zwei ragen darüber (`lage.mjs` meldet 58, 60). UG noch nicht aufbereitet.
- **30.10.2026, abends:** OG fertig (111 Objekte, 4 Ebenen, 6 Räume, Dateiversion 34), Importtest im Dev-Stand «Als neuer Plan» und «In offenen Plan» ohne Fehler. Bewusst offen: Leitung zur Estrichluke, Antennenleitungen «n. Standort Antenne», Bagno-Therm-Anschluss ohne Leitung.

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
- **Symbole nicht in der Luft** (CJ 30.10.2026): Wandsymbole (Steckdose, Schalter, Kombi, Wandleuchte) mit `at` genau auf die Wandfläche legen (Innenseite = Mittellinie ± d/2), nicht nur in die Nähe; `lage.mjs` findet die Stellen. Schaltergruppen im Scan stehen oft frei neben einem Wandende oder an einer Wand, die nur dünn gezeichnet ist: fragen, ob Wand ergänzen, auf den Wandkopf oder an die nächste Wand.
- Räume schliessen: Innenwände an der Mittellinie der Nachbarwand enden lassen (T-Stoss) oder genau auf deren Endpunkt (Ecke). Ragt eine Wand in die Nachbarwand und wird diese danach selbst noch auf eine dritte Wand gezogen, galt der Raum bis zum Fix `fix/raum-t-stoss` (30.10.2026) als offen; ohne den Fix die Wand auf den gemeinsamen Eckpunkt setzen. Fehlt danach noch ein Raum, ist meist eine Wand zu kurz (endet vor der Nachbarwand). Offene Wohnbereiche (Entrée, Küche, Essen ohne Wand) sind ein Raum: ein `room`, die übrigen Namen als `text`.
- Strichart übernehmen: gestrichelt im Scan → `kind: "boden"`, sonst `decke`; gerade gezeichnet → `curve` weglassen.
**30.10.2026, OG (Dachgeschoss, gleicher Scan)**
- Nullpunkt OG = EG: Aussenecken im Scan gleich ablesen, dann mit Treppe und Kamin gegenprüfen (müssen über dem EG liegen).
- Giebelfronten mit Pfosten und Glas sind nur dünn gezeichnet: leichte Wand 20 cm (`leicht`) auf derselben Mittellinie wie die 33er-Ecken, Öffnungen aus der Pfostenkette (CJ).
- Wandsymbole an schrägen Wänden: `at` auf die Wandfläche (Abstand d/2 senkrecht zur Mittellinie), `r` = −135 / 135 / ±45; `lage.mjs` schlägt nur 0/90/180 vor. Zwei Symbole nicht zu nah setzen: `umfahren.mjs` zieht die Enden auf die Anschlusspunkte, eine Leitung dazwischen wird sonst zum Punkt und `schreiben.mjs` bricht ab («defektes Objekt»).
- `umfahren.mjs` hängt ein Leitungsende an das nächste Symbol: zwei Verweise im Abstand < 30 cm landen auf demselben. Verweise mindestens 40 cm auseinander.
- Höhenangaben («180 afB», «auf 30») als `txt` am Symbol.
- Importtest: Skript im Scratchpad öffnet EG, klickt `#el-plimport`, wählt OG, prüft beide Ziele über `window.__schemacad.doc`.
- `pruefen.py` macht das Bild doppelt scharf (device_scale_factor 2), Ausschnitte mit `sips` schneiden. Überlappende Markierungen auf «Offen» auseinanderziehen.
