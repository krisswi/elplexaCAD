# Prinzipschema

## Zweck
Einpoliges Prinzipschema (Hauptverteilung, Abgänge) von Hand gezeichnet, mit dem Schema-Editor (Leitung, Text, Formen) und eigenen Symbolen. Papier, Rahmen, Plankopf und Druck wie im PV-Modul, Massstab immer 1:1.

## Wichtigste Funktionen
- Papier, Druck, Blatt: [src/prinzip.js](../../src/prinzip.js) (`PZ_PAPER`).
- Symbole `PZ_*` (Abgänge waagrecht, Teile der Hauptverteilung senkrecht, R dreht): [src/prinzipsym.js](../../src/prinzipsym.js); werden an `SYMBOLS` in [symbols.js](../../src/symbols.js) gehängt.
- Druck: [pvprint.js](../../src/pvprint.js); Auswertung und Nummerierung teilen sich Code mit [Schema](schema.md).

## Datenformat
Blatt `kind: "prinzip"` mit `paper` (`size`, `quer`; fehlt = A4 hoch). Dateiversion 19 (seit 21.10.2026).

## Tests
Node: `test_prinzip`. Browser: `prinzip_tests.py`.

## Bekannte Lücken / Offen
- Spec/Changelog: Stand «seit 22.10. online, CJ liefert Symbole nach» (Gedächtnisnotiz, nicht im Repo); welche Symbole fehlen: ungeprüft.

## Abhängigkeiten
[Schema](schema.md) (Editor, Symbole), [PV](pv.md) (Papier/Druck), [Ausgabe](ausgabe.md). Cloud: keine eigene.
