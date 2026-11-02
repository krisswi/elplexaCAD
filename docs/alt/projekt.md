# Projekt (Übersicht, Status, Zeit, Dateien, GWR, Profil)

## Zweck
Hülle von elplexaCAD: Projektliste (Kacheln), ein Projekt mit Modulen, Projektdaten (Objekt, Auftrag, Index, Adresse), Status je Projekt und je Modul, Projektzeit, erzeugte PDFs, Kopf- und Blattleiste. Nur elplexaCAD; die Startliste «Projekte» öffnet beim Start.

## Wichtigste Funktionen
- Übersicht, Projektdaten, Adresssuche: [src/elhub.js](../../src/elhub.js) (`makeHub`), Anzeige und Tasten in [src/elplexa.js](../../src/elplexa.js); Kopfleiste/Tabs/Blattleiste in [src/app.js](../../src/app.js) (Abschnitt «elplexaCAD»).
- Modulstatus (Offen, In Arbeit, Geprüft, Versendet, Revision, Archiviert; Taste S, Umordnen ⌥←→, archivierte ausblendbar): `elplexa.js`, `MOD_STATUS` in [model.js](../../src/model.js).
- Projektzeit (von Hand, automatisch mit Leerlauf, Reiter «Zeit» als Woche, CSV): [src/elzeit.js](../../src/elzeit.js).
- Adresse und Gebäudedaten (GWR, Höhe ü. M.) über api3.geo.admin.ch: [src/gwr.js](../../src/gwr.js).
- Dateien im Projekt (erzeugte PDFs, bis 4 Ordner; PDF im Browser, IndexedDB `elplexacad-dateien`): [src/dateien.js](../../src/dateien.js).
- Firmenprofil und Kalkulation unter Reiter Profil: [profil.js](../../src/profil.js), [sollwerte.js](../../src/sollwerte.js). Anmeldung/Speichern: [elonline.js](../../src/elonline.js), siehe [cloud.md](cloud.md).

## Datenformat
`doc.project` (`cleanProject`): `name`, `status`, `meta` (OBJEKT, AUFTRAG, INDEX), `time` (`{ d, h, n }`), `online`; ab Dateiversion 30 `folders` (≤ 4, `{ id, n }`) und `files` (`{ id, n, d, m, s, f? }`). `doc.mods` (ab Version 18): Modulstatus und Reihenfolge. PDF-Inhalt liegt nicht in der Datei: auf anderem Gerät fehlt er, der Eintrag bleibt.

## Tests
Node: `test_zeit`, `test_modstatus`, `test_dateien`, `test_profil`. Browser: `elplexa_tests.py`, `uebersicht_tests.py`, `projekte_tests.py`, `kopfleiste_tests.py`, `bedienung_tests.py`, `modstatus_tests.py`, `zeit_tests.py`, `zeitreiter_tests.py`, `dateien_tests.py`, `gwr_tests.py` (geo.admin.ch nachgebildet), `profil_tests.py`, `elstart.py` (Startrahmen), `endung_tests.py`.

## Bekannte Lücken / Offen
- Zeit-Reiter zeigt nur Online-Projekte.
- GWR: nur gegen Attrappe getestet; der Live-Dienst wurde am 19.10.2026 manuell geprüft (Kommentar in `gwr.js`), seither ungeprüft.
- Projektstatus «Annahme» (Kommentar `elplexa.js`).

## Abhängigkeiten
Alle Module hängen als Kacheln an der Übersicht. [Cloud](cloud.md): Projektliste, Zeit (`projTimeAdd`), Anmeldung. [Teilen](teilen.md), [Monteur](monteur.md), [Offerte](offerte.md) (Bauherr-Adresse).
