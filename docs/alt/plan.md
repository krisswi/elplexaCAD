# Plan (Grundriss und Elektroplan)

## Zweck
Elektroplan auf einem Grundriss (nur elplexaCAD): Wände, Türen, Fenster, Räume, Elektrosymbole, Leitungen, Kanäle, Beschriftung, Mass, PDF-Hintergrund; Ebenen; Stückliste (nach Räumen). Ein Plan pro Modul, Welt in mm mit gemeinsamem Nullpunkt aller Pläne (später Stockwerke).

## Wichtigste Funktionen
- Datenmodell und Geometrie ohne DOM: [src/plan.js](../../src/plan.js) (Wände, Öffnungen, Ebenen, Farben, Kanal, Formen, `planV24`…`planV35`).
- Bedienung (Werkzeuge Wand W, Tür/Fenster O, Mass B, Leitung L/K, Aderzahl D, Text T, Raum U, Spiegeln S, Symbolleiste, Druck mit Massstab): [src/planedit.js](../../src/planedit.js) (`makePlan`, 1545 Zeilen).
- Symbole nach Kategorie (Schalter, Steckdosen, Licht, Melder, Geräte, Erdung/Blitzschutz, Kommunikation, BUS/KNX): [src/plansym.js](../../src/plansym.js), [src/plansym/](../../src/plansym/).
- Import einer `.elplexa.json` (Stockwerk, Zuordnung, Fixpunkt): [src/planimport.js](../../src/planimport.js); Skill `plan-aufbereiten` erzeugt solche Dateien aus Scans.
- Räume aus Wänden erkennen, Fläche, Stückliste je Raum: [src/planraum.js](../../src/planraum.js).
- Hintergrund-PDF: [pdfbg.js](../../src/pdfbg.js).

## Datenformat
Blatt `kind: "plan"` (`paper`, `pmid`, `layers`, `alay`, `items`: wall, opening, sym, line, duct, ader, shape, text, room, dim …). Dateiversionen: 20 Plan, 21 Elektrosymbole, 22 Leitungen/Farben, 23 PDF-Hintergrund/Kurve, 24 Beschriftungsversatz u. a., 28 Textgrösse, 29 Kanal, 30 Aderzahl, 31 Kommunikation, 32 Formen, 33 gespiegelte Symbole, 34 Räume, 35 Raum mit eigener Grenze. Ältere Stände öffnen 31–35 nicht; v3 lehnt Pläne ab.

## Tests
Node: `test_plan`, `test_plansym`, `test_planimport`, `test_planraum`. Browser: `plan_tests.py`, `plan_rueck_tests.py`, `plan_fang_tests.py`, `plan_leiste_tests.py`, `plan_import_tests.py` (PDF), `plan_dateiimport_tests.py`, `plan_erdung_tests.py`, `plan_formen_tests.py`, `plan_kanal_tests.py`, `plan_komm_tests.py`, `plan_text_tests.py`, `plan_spiegeln_tests.py`, `plan_ader_tests.py`, `plan_raum_tests.py`.

## Bekannte Lücken / Offen
- Gedächtnisnotiz (nicht im Repo, ungeprüft): offen «Fangstange».
- Stockwerke als gemeinsamer Nullpunkt «später» (Kopf `plan.js`).
- Symbolherkunft: nach CJs Zusammenfassung selbst gezeichnet; Vergleich «Symbolvergleich 2» im Changelog 1.3.0.
- Räume: Erkennung mit Toleranzen (T-Stoss halbe Wanddicke); Randfälle ungeprüft.

## Abhängigkeiten
[Monteur](monteur.md) (veröffentlicht Pläne), [Teilen](teilen.md), [Projekt](projekt.md) (Stückliste, PDF in «Dateien»), [PV](pv.md) (Hintergrund, Papier). Cloud: nur über Monteur/Teilen.
