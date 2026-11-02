# PV-Strangplan (Stringplan, Stringübersicht)

## Zweck
Auf einem PDF-Dachplan Modulfelder und Strings einzeichnen, im Massstab (Messstrecke, Fixpunkt als Ursprung), Strings verkabeln und je Wechselrichter auswerten (Spannungen, Tmin, Zuordnung WR). Stringübersicht als eigenes Blatt für alle Stringpläne.

## Wichtigste Funktionen
- Datenmodell, Massstab, Fixpunkt, Ebenen, Modul-/WR-Kataloge, `stringReport`: [src/pv.js](../../src/pv.js).
- Bedienung (PDF-Hintergrund, Dach nachzeichnen, Fang, Modul/Modulfeld setzen, Verkabelung, SPA): [src/pvedit.js](../../src/pvedit.js) (`makePv`, 1202 Zeilen).
- Stringübersicht-Tabelle, Druck über mehrere Seiten: [src/pvtab.js](../../src/pvtab.js), [pvprint.js](../../src/pvprint.js).
- PDF als Hintergrund: [src/pdfbg.js](../../src/pdfbg.js) (pdf.js).
- Katalog Modul-/WR-Typen online teilbar (`module_types`, `inv_types`), Höhe ü. M. aus GWR für Tmin ([gwr.js](../../src/gwr.js)).

## Datenformat
Blatt `kind: "pv"` (Stringplan, `bg`, `layers`, `paper`, `hide`, `pmid`, `north`, `strk`) und `kind: "pvtab"` (ohne eigene Objekte, je Variante `var`); PDFs in `assets` der Datei. Dateiversion 13: Stringplan mit Leitungen (`pvline`) und Punkten (`pvpoint`); 16: Module mehrfach (`var`). Frühere Stufen: ungeprüft.

## Tests
Node: `test_pv` (auch Plan/Prinzip teilen Teile). Browser: `pv_tests.py`, `blatt_kopie_tests.py`.

## Bekannte Lücken / Offen
- In Spec/Changelog keine eigene Offen-Liste für PV: ungeprüft, ob Wünsche offen sind.
- Datenblätter/Kataloge liegen online (Supabase); ohne Anmeldung nur Datei.

## Abhängigkeiten
[Plan](plan.md) und [Prinzipschema](prinzip.md) übernehmen Papier/Druck/PDF-Hintergrund-Logik. [Cloud](cloud.md): Typen-Kataloge. [Projekt](projekt.md): GWR-Höhe. [Ausgabe](ausgabe.md): PDF/DXF.
