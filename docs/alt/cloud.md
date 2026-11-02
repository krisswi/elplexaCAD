# Cloud (Supabase, Anmeldung, Online-Projekte)

## Zweck
Reiner Zusatz: ohne Anmeldung und ohne Internet läuft alles mit Dateien. Mit Anmeldung: Online-Projekte, Teilen, Monteur, Benutzerdaten, Kataloge, Feedback. Gratis-Plan von Supabase reicht (Gedächtnisnotiz).

## Wichtigste Funktionen
- [src/cloud.js](../../src/cloud.js): kein Supabase-Paket, nur `fetch` auf REST (Zugriff regelt RLS). Anmeldung (`cloudLogin`, `cloudLogout`), Projekte (`projList`, `projSave`, `projOpen`, `projDelete`, `projTimeAdd`, `pdfCleanup`), Teilen (`share*`), Monteur (`mShare*`, `mPublish`, `mPNote*`, `mOpen`, `mNote*`, `mPdfs`), Feedback (`feedbackSend`), `userStore`, `posStore`.
- Grenzen: `PROJ_MAX` 5 000 000 Zeichen je Projekt-JSON, `PDF_MAX` 50 MiB je PDF.
- Anmeldung, Sperre ohne Anmeldung (nur wenn aus dem Netz geladen), Speichern: [src/elonline.js](../../src/elonline.js). Speicherschicht lokal + online: [ablage.js](../../src/ablage.js).

## Datenformat
Tabellen laut `cloud.js` (Namen im Code gefunden): `projects`, `project_shares`, `project_notes`, `feedback`, `symbol_libs`, `module_types`, `inv_types`, `user_settings`, `user_positions`, Monteur-Tabellen `shares`, `share_releases`, `share_notes`, `share_devices`. Migrationen: `supabase/migrations/` (`20261020_project_notes`, `20261026_share_offerte`, `20261026_share_zeitfaktor`, `20261026_user_positions`, `20261026_user_settings`, `20261028_monteur`). Edge Functions: `supabase/teilen-pdf`, `supabase/monteur-pdf`. Spaltenaufbau: nicht in dieser Doku, ungeprüft (Migrationen lesen). Schlüssel im Code = öffentlicher anon-Schlüssel.

## Tests
Node: `test_notizen`, `test_monteur`. Browser: `teilen_tests.py`, `monteur_tests.py`, `profil_tests.py`, `projekte_tests.py` – alle gegen Attrappen, nicht gegen das echte Supabase.

## Bekannte Lücken / Offen
- Echtes Supabase im Test ungeprüft; `cloud.js` vermerkt Risiko beim Lesen der `jsonb`-Spalte (Projektliste, bis 5 MB je Zeile) «gegen das echte Supabase ungeprüft» (Kommentar um Zeile 151).
- Unterscheidung offline/Serverschlaf (Antwort 540, 502–504) ist eine Annahme (Kommentar um Zeile 346).
- Änderungen an Supabase (Migrationen, Edge Functions) nur nach Rückfrage bei CJ.

## Abhängigkeiten
Genutzt von [Projekt](projekt.md), [Teilen](teilen.md), [Monteur](monteur.md), [Offerte](offerte.md), [PV](pv.md) (Kataloge), [Schema](schema.md) (Symbol-Bibliotheken).
