# Schema (Stromlaufschema)

## Zweck
Editor für Stromlaufschemas in Hausinstallation und Gewerbe: Schutzgeräte, Zähler, Klemmen, Leitungen auf A4-Blättern, mit automatischem BMK. Kern der App (SchemaCAD v3); in elplexaCAD ein Modul unter mehreren. Ausgabe als DXF (für AutoCAD), PDF, CSV.

## Wichtigste Funktionen
- Editor, Zeichnen, Zeiger, Tastatur, Seitenleisten: [src/app.js](../../src/app.js) (3042 Zeilen, nie ganz lesen), Darstellung [render.js](../../src/render.js), Geometrie [geom.js](../../src/geom.js), Blattrahmen [frame.js](../../src/frame.js), [template.js](../../src/template.js).
- Symbole (LS, FI, RCBO, NH, SPD, Zähler, Klemmen, …) mit Polzahl-Varianten: [symbols.js](../../src/symbols.js), [library.js](../../src/library.js); Prinzipsymbole siehe [prinzip.md](prinzip.md).
- Leiterbündel 1–5 ([bundle.js](../../src/bundle.js)), Klemmenleiste aus Kabelangabe ([terminals.js](../../src/terminals.js)), Grundverkabelung und Hauptlinien über den Blattrand ([hauptlinien.js](../../src/hauptlinien.js)), Eingangsverdrahtung per Knopf ([eingang.js](../../src/eingang.js)), Abgang als Vorlage ([vorlagen.js](../../src/vorlagen.js)).
- Automatische Nummerierung 10F2, 10F2.1, Klemmen X, SPD T, Zähler P ([numbering.js](../../src/numbering.js)); Suchen/Ersetzen über alle Blätter ([suchen.js](../../src/suchen.js)).
- Wandlermessung nach BKW ([wandler.js](../../src/wandler.js)), Steuerung/KNX-Kasten mit freien Klemmen ([steuerung.js](../../src/steuerung.js)), freies Zeichnen Linie/Rechteck/Kreis ([formen.js](../../src/formen.js)).
- Titelseite und Inhaltsverzeichnis ([titel.js](../../src/titel.js)), Legende der Sicherungsgruppen ([legende.js](../../src/legende.js)), Auswertung/Stückliste als CSV ([auswertung.js](../../src/auswertung.js)).
- Mobilansicht bis 600 px (nur ansehen) ([mobil.js](../../src/mobil.js)), Feedback mit Screenshot ([feedback.js](../../src/feedback.js)).
- Tasten: Abschnitt «Bedienung (Editor)» in der [Spec](../spec.md).

## Datenformat
Blatt `kind: "schema"` mit `items` (Symbole, Texte, Formen, Verweise, Klemmen, `ctrl`) und `wires` (Leitungen, `bundle`), `meta`, `main` (Hauptlinien). Titelseite `title`, Verzeichnis `toc`, Legende `legend` (`show`). Dateiversionen: 11 Eingangsverdrahtung, 14 Wandlermessung/gedrehter Text, 15 freies Zeichnen/Textfarbe, 16 Module mehrfach, 17 Text ausgerichtet/Klemmentexte/Steuerkasten, 18 Modulstatus, 19 Prinzipschema. v3 schreibt höchstens 27.

## Tests
Node: `test_symbole`, `test_rueckmeldung`, `test_wuensche`, `test_wuensche_d`, `test_vorlagen`, `test_eingang`, `test_hauptlinien`, `test_formen`, `test_bundle`, `test_suchen`, `test_titel`, `test_legende`, `test_auswertung`, `test_korrekturen`, `test_export` (alle `test/*.mjs`). Browser: `ui_tests.py`, `palette_tests.py`, `symbole_tests.py`, `rueckmeldung_tests.py`, `wuensche_tests.py`, `wuensche_d_tests.py`, `vorlagen_tests.py`, `eingang_tests.py`, `hauptlinien_tests.py`, `formen_tests.py`, `titel_tests.py`, `legende_tests.py`, `korrektur_tests.py`, `leiste_tests.py`, `mobil_tests.py`, `start_tests.py`; DXF-Prüfung `roundtrip_check.py` (ezdxf).

## Bekannte Lücken / Offen
- DXF in AutoCAD/TinLine nicht geprüft; DWG nur über AutoCAD (Spec). Konkrete BMK-Regeln Hausinstallation offen.
- Grenzen (Stand 12.10., ungeprüft ob noch gültig): Polzahl-Wechsel verschiebt angeschlossene Leitungen nicht.
- Auswertung: Annahmen «CJ prüft» (nur Schutzgeräte in der Legende, Kabel aus Klemmenleiste) – im Kopf von `auswertung.js`.
- Alte Dateien mit Symbol `KLEMME` lassen sich nicht mehr öffnen.
- Hager-Symbole: Nutzungsbedingungen (Link/Wortlaut) ausstehend.

## Abhängigkeiten
Geteilt mit [Disposition](dispo.md) (Übergabe ans Schema, Stückliste), [Prinzipschema](prinzip.md), [Ausgabe](ausgabe.md) (`dxf.js`, `files.js`, `pdfout.js`). Cloud nur für Symbol-Bibliotheken (`symbol_libs`) und Datenblätter, sonst Datei: [cloud.md](cloud.md).
