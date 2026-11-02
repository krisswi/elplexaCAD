# Disposition (Verteileraufbau)

## Zweck
Massstäblicher Aufbau eines Verteilers in der Frontansicht: Schrank mit Feldern, Platten, Hutschienen, Geräte in TE, NH-Trenner, Zählerplatte, Schienen N/PE/PEN, Bemassung. Kann ans Schema übergeben werden (Geräte werden Schemasymbole) und als Plan/DXF/PDF ausgegeben werden. Seit 13.10.2026 Umfang laut CJ.

## Wichtigste Funktionen
- Rechnen, Fang, Hilfslinien, Bemassung, SVG-Bausteine: [src/dispo.js](../../src/dispo.js) (`snapDevice`, `autoRails`, `planPrims`, `viewSVG`, `autoDimAt`, `DEVICE_PRESETS`).
- Schrank, Plinthen, Türen, NH-Grössen (Weber/Vertigroup), Schienen, Teile-Vorlagen: [src/schrank.js](../../src/schrank.js) (`newCabinet`, `partPrims`, `PART_PRESETS`).
- Bedienung (neue Bauteile, Griffe, Ausrichten, Übergabe ans Schema, Leisten): [src/dispoedit.js](../../src/dispoedit.js) (`makeDispo`).
- Taste Y = Bemassung; Blattfelder `dims`, `doors`, `pin`.

## Datenformat
Blatt `kind: "dispo"` mit `sid`, Bauteilen in `items`, `dims:false`/`doors:false` bei ausgeblendet. Dateiversion 12: freie Schiene (`free`), Schiene N/PE/PEN (`BAR`), Zuleitung (`cable`), Beschriftung (`beschr`), Vertigroup NH1–NH3 oder mit Wandler (`wr`, `wl`). Frühere Stufen (Bauteile, Schrank): ungeprüft.

## Tests
Node: `test_dispo`, `test_dispo_wunsch`, `test_schrank`, `test_bemassung`, `test_nh_texte`. Browser: `dispo_tests.py`, `dispo_wunsch_tests.py`, `schrank_tests.py`, `nh_texte_tests.py`, `bemassung_tests.py`, `dims_tests.py`, `wuensche_d_tests.py` (übergebene Dispo in der Blattliste), `blatt_kopie_tests.py`.

## Bekannte Lücken / Offen
- Viele Masse sind «Annahme» (z. B. LS 2-polig 2 TE, FILS, Schaltuhr, Schütz, Zähler 4 TE, Diazed, SPD, Prüfklemme); Quelle: Dossier Bärgen 268, nicht belegt. Siehe `DEVICE_PRESETS` und Kopf von `schrank.js`.
- Hersteller-Masse NH (Weber, Vertigroup) – Herkunft der Zahlen ungeprüft.
- DXF in AutoCAD nicht geprüft.

## Abhängigkeiten
[Schema](schema.md) (Übergabe, Auswertung ohne Dispo-Blätter), [Ausgabe](ausgabe.md) (DXF-Layer `SCH_DISPO_*`, `SCH_DISPO_MASS`). `dispo.js` importiert bewusst nichts aus `model.js` (Zirkelbezug). Cloud: keine eigene.
