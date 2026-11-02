# Ausgabe (DXF, PDF, Excel, Dateien)

## Zweck
Projekt speichern/öffnen (JSON), DXF für AutoCAD, PDF für Druck und Versand, CSV und Excel für Auswertungen.

## Wichtigste Funktionen
- Speichern/Öffnen, DXF alle Blätter (ZIP-Rückfall), Druckweg: [src/files.js](../../src/files.js) (`buildPrint`, Dateiendung `.elplexa.json`, alte `.schemacad.json`).
- DXF R2007, mm, A4 quer, Blöcke mit Attributen, Layer `SCH_*` (`SCH_DISPO_MASS` u. a.): [src/dxf.js](../../src/dxf.js) (Bibliothek `@tarikjabiri/dxf`); DXF-Import: [src/dxfimport.js](../../src/dxfimport.js).
- Eigenes PDF in elplexaCAD (v3: Browser-Druckdialog): [src/pdfout.js](../../src/pdfout.js); PDF landet unter «Dateien» im Projekt ([projekt.md](projekt.md)).
- Auswertung CSV: [auswertung.js](../../src/auswertung.js); Excel-Offerte: [offxlsx.js](../../src/offxlsx.js).
- Datenmodell, Prüfung beim Laden: [src/model.js](../../src/model.js) (`parseModel`, `serializeModel`, `VERSION`).

## Datenformat
Siehe [README](README.md): `{ format: "schemacad", version, … }`; ältere Stände lehnen neuere Versionen ab, damit nichts still verloren geht. elplexaCAD schreibt 35, v3 27.

## Tests
Node: `test_export`, `test_symbole`, `test_dispo`, `test_korrekturen` (DXF-Prüfung per Skript). Browser/Python: `roundtrip_check.py` (ezdxf, Audit ohne Fehler), `endung_tests.py`, `korrektur_tests.py`. Alle node-Tests liefen beim letzten Commit grün (pre-commit-Hook); die Python-Tests wurden hier nicht ausgeführt: ungeprüft.

## Bekannte Lücken / Offen
- Test mit gebauter App → DXF → AutoCAD/TinLine (Spec «Offen»); Safari, echter Chrome-Dateidialog ungeprüft.
- DWG nur über AutoCAD, nicht geplant.

## Abhängigkeiten
Alle Blatttypen schreiben hierhin. [Cloud](cloud.md) nur für Online-Speichern.
