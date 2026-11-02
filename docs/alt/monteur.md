# Monteur-Ansicht und «Pläne für den Monteur»

## Zweck
Der Planer veröffentlicht Pläne; der Monteur öffnet `?monteur=<Schlüssel>` ohne Login, sieht Pläne und Stückliste (auch offline) und setzt Notizen mit fester Nummer. Nur elplexaCAD.

## Wichtigste Funktionen
- Monteur-Seite (Schieber, Zoom, Wischen, Stückliste, Notizen, Offline-Kopie in IndexedDB): [src/monteur.js](../../src/monteur.js), [monteur.css](../../src/monteur.css).
- Reine Funktionen (Nummernvergabe, Warteschlange): [src/monteur-kern.js](../../src/monteur-kern.js).
- Planer-Seite (Knopf «Teilen», Link, QR-Code, Widerrufen, Notizen im Plan Taste N): [src/elmonteur.js](../../src/elmonteur.js).
- Datenbank: `cloud.js` `mShare*`, `mPublish`, `mPNote*`, `mOpen`, `mNote*`, `mPdfs`.

## Datenformat
Nicht in der Projektdatei. Supabase-Tabellen `shares`, `share_releases`, `share_notes`, `share_devices`, Funktionen `m_*`/`p_*` (Migration `supabase/migrations/20261028_monteur.sql`), Edge Function `supabase/monteur-pdf`. Offline-Kopie im Browser des Monteurs.

## Tests
Node: `test_monteur`. Browser: `monteur_tests.py` (gegen Attrappe statt Supabase – echtes Supabase ungeprüft).

## Bekannte Lücken / Offen
- Gedächtnisnotiz (nicht im Repo): «offene Kleinbugs notiert», nur im Vault; Inhalt ungeprüft.
- Online seit PR #30/#31 (29.10.), ohne Versions-Tag.

## Abhängigkeiten
[Plan](plan.md), [Cloud](cloud.md) (zwingend, kein Offline-Betrieb für den Planer), [Teilen](teilen.md) (alter Link bleibt daneben).
