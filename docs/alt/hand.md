# Handnotizen

## Zweck
Handschrift mit Apple Pencil (iPad) oder Maus, wie GoodNotes: Hefte mit Seiten, Stift/Marker/Radierer, PDF oder Bild als Hintergrund. Privat im Browser, nie im Projekt. Nur elplexaCAD.

## Wichtigste Funktionen
- Alles in [src/hand.js](../../src/hand.js): Pointer Events, Handballen-Erkennung, `importFile` (PDF/Bild/Sicherung), `bookToPdf` (jsPDF, Vektor), PNG je Seite, Sicherung `.json`, Teilen auf dem iPad (`navigator.share`).
- Einstieg: Kachel `data-elact="hand"` in der Übersicht → `elHand` in [app.js](../../src/app.js); Ebene `#hn` (CSS am Ende von `elplexa.css`). Blätter aus dem Projekt als PDF über `makePdf`.

## Datenformat
IndexedDB `elplexacad-hand`, Speicher `books`: `{ id, title, created, changed, thumb, pages: [{ w, h, bg, strokes: [{ t, c, w, d }], text }] }` (Einheiten pt, A4 595 × 842). Sicherung `elplexa-handnotizen` Version 1. Keine Dateiversion, nicht in Projektdatei, nicht im Teilen-Link.

## Tests
Browser: `hand_tests.py` (Stift und Finger als nachgebildete Pointer Events). Keine node-Tests.

## Bekannte Lücken / Offen
- Nur auf dem Gerät, kein Abgleich; Verlust bei gelöschtem Browser-Speicher (Sicherung manuell).
- Echter Apple Pencil (Druck, Neigung): ungeprüft, getestet nur mit nachgebildeten Events.

## Abhängigkeiten
Keine anderen Module ausser PDF-Export aus Blättern. Keine Cloud.
