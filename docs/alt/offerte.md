# Offerte

## Zweck
Offerten für Elektroarbeiten (Einmannbetrieb): Gliederung (Objekt/Lage/Raum …) → BKP-Kapitel → Gruppen → Positionen, Summen mit Rundung, Rabatte, Optionen, Schlusszusammenstellung. Ausgabe als PDF (Stil Messerli/NPK) und Excel; Import bestehender Excel-Offerten.

## Wichtigste Funktionen
- Datenmodell, BKP, Summen (`totals`, `summaryRows`): [src/offerte.js](../../src/offerte.js).
- Tabelle als Bedienung (Navigation, Kopf, Kapitel, Schlusszusammenstellung): [src/offedit.js](../../src/offedit.js).
- PDF: [src/offprint.js](../../src/offprint.js) (in elplexaCAD über [pdfout.js](../../src/pdfout.js), in v3 Druckdialog); Excel mit Formeln: [src/offxlsx.js](../../src/offxlsx.js), [zip.js](../../src/zip.js); Excel-Import: [src/offimport.js](../../src/offimport.js).
- Positionsdatenbank beim Benutzer: [positionen.js](../../src/positionen.js); Sollwerte und IC-Zeiten (Stundenansatz, Materialfaktor, Zeitfaktor): [sollwerte.js](../../src/sollwerte.js); Firmenprofil mit Logo: [profil.js](../../src/profil.js); Speicherschicht (lokal, online über Adapter): [ablage.js](../../src/ablage.js).

## Datenformat
Blatt `kind: "offerte"` mit `sh.of` (Kopf, `kn` Gliederung, Kapitel, Gruppen, Positionen, `zf` Zeitfaktor). Dateiversionen: 25 Offerte, 26 Zeitfaktor, 27 Gliederung. Benutzerdaten (Profil, Positionen, Sollwerte) liegen nicht in der Datei, sondern lokal und in Supabase (`user_settings`, `user_positions`).

## Tests
Node: `test_offerte`, `test_offerte_ausgabe`, `test_offerte_gliederung`, `test_offerte_import`, `test_positionen`, `test_sollwerte`, `test_profil`. Browser: `offerte_tests.py`.

## Bekannte Lücken / Offen
- Gedächtnisnotiz (nicht im Repo, ungeprüft): «nächst Schritt 6».
- BKP 23 nach EIT.swiss; Preise/EK/Faktor sind beim Teilen ohne Preise ausgeblendet.
- Excel-Import deutet Kopfzeilen nach Absprache mit CJ an einer Beispieldatei; andere Dateien ungeprüft.

## Abhängigkeiten
[Projekt](projekt.md) (Bauherr-Adresse im Kopf, Moduleinträge), [Teilen](teilen.md) (mit/ohne Preise, Migration `share_offerte`), [Cloud](cloud.md) (`user_*`-Tabellen), [Ausgabe](ausgabe.md).
