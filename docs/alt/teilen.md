# Teilen per Link und Notizen

## Zweck
Ein Projekt (oder einzelne Module) als Nur-Ansicht-Link teilen; Empfänger setzen ohne Login Notizen und Markierungen. Der Link bleibt neben den neueren «Plänen für den Monteur» ([monteur.md](monteur.md)) bestehen. Nur elplexaCAD.

## Wichtigste Funktionen
- Ersteller und geteilte Ansicht: [src/elteilen.js](../../src/elteilen.js) (`makeTeilen`).
- Notizen/Markierungen (Taste N Notiz, M Markierung; Rechteck oder Kreis): reine Funktionen in [src/notizen.js](../../src/notizen.js).
- Serverseite: `cloud.js` `shareCreate`, `shareOpen`, `shareNotes*`; PDF der geteilten Ansicht über Edge Function `supabase/teilen-pdf`.
- Pro Modul ankreuzbar; Offerte «mit Preisen» (EK, Faktor, Zeit entfallen ohne Preise).

## Datenformat
Nicht in der Projektdatei. Notizen nur in Supabase (`project_notes`, Migration `20261020_project_notes.sql`), nie in Datei, PDF oder DXF; Freigaben in `project_shares` (Migration `20261026_share_offerte.sql`, `20261026_share_zeitfaktor.sql`).

## Tests
Node: `test_notizen`. Browser: `teilen_tests.py` (Schritt 1, Module teilen, Notizen).

## Bekannte Lücken / Offen
- Spec und Changelog nennen keine offene Liste; echte Supabase-Läufe der Tests: ungeprüft (Attrappen).
- Migrationen wurden laut Changelog nur mit OK von CJ angewendet.

## Abhängigkeiten
[Cloud](cloud.md) zwingend (Anmeldung des Erstellers, Tabellen, Edge Function). [Offerte](offerte.md), [Plan](plan.md) und alle Blatttypen als Inhalt. [Ausgabe](ausgabe.md) (PDF).
