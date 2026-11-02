# Was kann das Alte (elplexaCAD / SchemaCAD v3)

Übergabe an das neue ERP-System und Rückfall: je Modul eine kurze Seite. Stand: Zweig `main` bis `43b53c1` (Dateiversion 35 in elplexaCAD, 27 in v3), geschrieben am 02.11.2026. Geschrieben aus Quellkopf, `docs/spec.md`, `CHANGELOG.md` und `test/`. Was nicht nachgeprüft ist, steht als «ungeprüft» da.

Zwei Stände aus demselben Code: **elplexaCAD** (`dist/ElplexaCAD.html`, alle Module) und **SchemaCAD v3** (`dist/schemacad.html`, nur Schema, Disposition, Stringplan, Prinzipschema, Offerte). Code nur für elplexaCAD steht hinter `ELPLEXA`.

| Modul | Seite | Stand |
|---|---|---|
| Schema (Stromlaufschema, Legende, Titelseite, Auswertung) | [schema.md](schema.md) | beide |
| Disposition (Verteileraufbau, Schrank) | [dispo.md](dispo.md) | beide |
| PV-Strangplan (Stringplan, Stringübersicht) | [pv.md](pv.md) | beide |
| Prinzipschema | [prinzip.md](prinzip.md) | beide |
| Plan (Grundriss, Elektroplan, Räume, Import) | [plan.md](plan.md) | nur elplexaCAD |
| Offerte | [offerte.md](offerte.md) | beide |
| Monteur-Ansicht und «Pläne für den Monteur» | [monteur.md](monteur.md) | nur elplexaCAD |
| Projekt (Übersicht, Status, Zeit, Dateien, GWR, Profil) | [projekt.md](projekt.md) | nur elplexaCAD |
| Teilen per Link und Notizen | [teilen.md](teilen.md) | nur elplexaCAD |
| Handnotizen | [hand.md](hand.md) | nur elplexaCAD |
| Ausgabe (DXF, PDF, Excel, Dateiformat) | [ausgabe.md](ausgabe.md) | beide |
| Cloud (Supabase, Anmeldung, Online-Projekte) | [cloud.md](cloud.md) | beide, nur Zusatz |

## Allgemeines

- **Dateiformat:** JSON `{ format: "schemacad", version, active, nextId, sheets, mods?, project?, assets? }`, Endung `.elplexa.json` (alt `.schemacad.json`, wird noch geöffnet). Ein Projekt = eine Datei = mehrere Blätter (`sheet.kind`: schema, dispo, pv, pvtab, prinzip, plan, offerte, title, toc, legend). `version` = kleinste Dateiversion, die alle genutzten Teile lesen kann; ältere Stände lehnen neuere Dateien ab. Stufenliste: Kommentar zu `VERSION` in [src/model.js](../../src/model.js) (die Stufen 1–10 stehen dort nicht einzeln: ungeprüft). Spec-Auszug: [docs/spec.md](../spec.md).
- **Module im Projekt:** `doc.mods` (Name, Status, Reihenfolge), Blattfeld `var` für mehrere Module gleicher Art.
- **Tests:** schnelle node-Tests `npm test` (`test/test_*.mjs`), Browser-Tests `npm run test:alle` (`test/*_tests.py`, Playwright/ezdxf). Ob alles heute grün ist: ungeprüft, hier nicht ausgeführt.
- **Wo steht was:** Karte «Wunsch → Dateien» in der [Spec](../spec.md#wunsch--dateien-karte-stand-27102026), Arbeitsweise in [docs/arbeitsweise.md](../arbeitsweise.md).
- **Clean-Room:** Symbole sind selbst gezeichnet (nach CJs Symbolzusammenfassung IEC 60617), nichts aus TinLine oder Herstellerdaten. Siehe [docs/symbol-uebersetzung.md](../symbol-uebersetzung.md).
- **Offen über alles** (Spec): Test DXF → AutoCAD/TinLine, konkrete BMK-Regeln Hausinstallation, Link/Wortlaut der Hager-Bedingungen. Nicht geprüft laut Spec: AutoCAD/TinLine, Safari, echter Chrome-Dateidialog.
