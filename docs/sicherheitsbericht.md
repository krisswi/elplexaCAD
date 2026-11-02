# Sicherheitsbericht elplexaCAD (Stand 2. 11. 2026, main 43b53c1)

Nur gelesen, nichts geändert, nichts an Supabase angefasst. Geprüft wurde, was im Repo steht. Was nur im Supabase-Dashboard liegt, konnte ich **nicht** sehen und führe es als «ungeprüft».

**Kurzfazit:** Die Teile, die im Repo stehen, sind sorgfältig gebaut (RLS überall, Link-Schlüssel stark, kein Geheimnis im Code oder Verlauf, `npm audit` sauber). Die grösste Unsicherheit: Die ältesten Tabellen und der Speicher-Bucket stehen in **keiner** Migration. Ob dort alles dicht ist, weiss nur das Dashboard.

Ergebnis je Punkt: **ok** / **Lücke** / **ungeprüft**.

---

## 1. Datenbank-Regeln (RLS)

| Tabelle | Migration | RLS | Ergebnis |
|---|---|---|---|
| `project_notes` | 20261020:26 | an, nur Besitzer des Projekts, Spaltenrechte | ok |
| `user_settings` | 20261026_user_settings:14 | an, nur `owner = auth.uid()` | ok |
| `user_positions` | 20261026_user_positions:14 | an, nur `owner = auth.uid()` | ok |
| `shares`, `share_releases`, `share_notes`, `share_devices` | 20261028_monteur:71–93 | alle an, nur Besitzer, `anon` hat **kein** Recht auf die Tabellen | ok |
| `projects`, `project_shares` | **keine Migration im Repo** | unbekannt | **ungeprüft** |
| Bucket `projekt-pdf` und seine Storage-Regeln | **keine Migration im Repo** | unbekannt | **ungeprüft** |

Gut gelöst:
- `anon` (nicht angemeldet) kommt nie direkt an eine Tabelle. Links und Monteure gehen nur über Funktionen (`m_open`, `m_notes`, `m_note_add`, `m_note_edit`, `m_note_delete`, `share_open`, `share_note_*`) mit dem geheimen Schlüssel.
- Alle Funktionen sind `security definer` mit `set search_path = ''`. Das verhindert eine bekannte Angriffsart.
- Die Planer-Funktionen `p_*` sind für `anon` gesperrt (monteur.sql:264–266) und prüfen den Besitz selbst über `sh_mine` / `auth.uid()`.
- Link-Schlüssel: 24 Zufallsbytes = 192 Bit (monteur.sql:13), Länge wird geprüft (`m_open` Zeile 118). Nicht erratbar.
- Der Teilen-Link entfernt Einkaufspreise, Faktor, Zeit und Ansatz schon in der Datenbank (`share_offer_strip`, share_offerte.sql:19). Das ist stark, weil es nicht von der App abhängt.
- Monteur-Gerätekennung `guest` wird nie ausgeliefert.

Schwächen:
- **`projects` und `project_shares` fehlen im Repo.** Die App liest `projects?id=eq.…` ohne eigenen Besitzerfilter (`src/cloud.js:197`). Sie verlässt sich also ganz darauf, dass RLS dort steht. Das ist wahrscheinlich so, aber nicht belegt. Folge für CJ: Fehlt die Regel, sähe jeder eingeloggte Nutzer alle Projekte.
  **Fix:** im Dashboard prüfen (Security Advisor, Table Editor → RLS), dann die bestehende Definition als Migration ins Repo nehmen (`pg_dump --schema-only`), damit der Neuaufbau sie nicht vergisst.
- **Offene Konten:** Ob sich jeder selbst registrieren kann (Auth → «Allow new users to sign up»), steht im Dashboard. Die App hat keine Registrierung (`src/cloud.js` kennt nur Passwort-Login). Wenn Registrierung offen ist, kann sich jeder ein Konto anlegen und eigene Daten in deinem Projekt anlegen (Speicher). **Fix:** abschalten, wenn CJ der einzige Nutzer ist. **ungeprüft**
- **Link-Inhaber können Geräte-Zeilen beliebig vermehren** (`m_open`, monteur.sql:127: eine Zeile je neue Kennung, keine Obergrenze). Wer einen gültigen Link hat, kann die Tabelle aufblähen. Folge: nur Speicher, keine Datenpreisgabe. **Fix:** Obergrenze (z. B. 50 Geräte je Link). Mittel-tief.
- **`m_note_add`** prüft `p_mod` und `p_rev` nicht (monteur.sql:157, Spalte `mod` ohne Längengrenze). Folge: ein Link-Inhaber kann lange Texte in `mod` legen. **Fix:** `check (mod ~ '^[a-z]{2,12}(:[0-9]{1,2})?$')` wie bei `share_releases`. Tief.
- Ein Link-Inhaber kann alle 300 Notizen-Plätze füllen und so weitere Notizen sperren (monteur.sql:155). Gewollt begrenzt, aber ein Missbrauch bleibt möglich. Tief.
- Es gibt keine Begrenzung für die Zahl der Zeilen je Nutzer in `user_settings` / `user_positions` (nur Grösse je Zeile). Tief, nur Eigenschaden.

---

## 2. Edge Functions (`teilen-pdf`, `monteur-pdf`)

| Prüfpunkt | Ergebnis | Fundstelle |
|---|---|---|
| Login | bewusst keiner (`verify_jwt = false`), Schutz ist der Link-Schlüssel | teilen-pdf:4, monteur-pdf:4 |
| Link prüfen | ok: Länge/Zeichen per Regex, dann Widerruf/Ablauf | monteur-pdf:15–20, teilen-pdf:15–22 |
| Besitz | ok: Pfad kommt aus dem Besitzer des Links, nur Dateien, die im veröffentlichten Stand stehen (SHA-256, 64 Hex) | monteur-pdf:23–25 |
| Service-Schlüssel | ok: per `Deno.env`, nicht im Code | beide Zeile 6 |
| Signierte Adresse | 5 Minuten | beide `expiresIn: 300` |
| CORS `*` | **tief**: bei Funktionen ohne Cookies ist das üblich. Der Schutz ist der Schlüssel, nicht die Herkunft | beide Zeile 7 |
| Eingabe | ok: nur POST, `token` String + Regex, Rest wird ignoriert | beide Zeile 13–15 |
| Fehlermeldungen | ok: nur «ungueltig/widerrufen/abgelaufen» und HTTP-Code beim Signieren, keine Interna | beide `Signieren fehlgeschlagen (…)` |
| Begrenzung der Aufrufe | **Lücke (mittel)**: kein Rate-Limit, jeder Aufruf löst mehrere Datenbankabfragen mit dem Service-Schlüssel aus | – |
| Token im Abfrage-Filter | ok: durch Regex auf `[A-Za-z0-9_-]{32}` gesichert, keine Einschleusung möglich | monteur-pdf:16 |

Folge für CJ: Die Funktionen geben nur PDF frei, die im geteilten Stand stehen. Selbst mit erratenem Link kommt niemand an andere Dateien. Ein Dauerbeschuss würde nur Rechenzeit kosten.
**Fix:** Supabase-Dashboard → Edge Functions → Rate Limit, oder in der Funktion eine einfache Zählung je IP. Nur nach Rückfrage (Supabase). `teilen-pdf` hängt an den alten Tabellen `project_shares` / `share_open`. Wird der alte Teilen-Link abgeschaltet, kann die Funktion samt alter Funktion `share_open` entfallen (weniger Fläche).

---

## 3. Speicher-Bucket `projekt-pdf`

- «privat» steht nur in den Kommentaren der Funktionen (monteur-pdf:4). Die Einstellung selbst und die Storage-Regeln sind in keiner Migration. **ungeprüft.**
- Die App lädt nur über `object/authenticated/…` mit Login (`src/cloud.js:204`) und der Pfad beginnt mit der Nutzer-ID. Das passt zu einem privaten Bucket mit Regel «nur eigener Ordner».
- Link-Ablauf: Signierte Adressen gelten 5 Minuten (**ok**). Der Link selbst läuft nach 30 Tagen ab (`shares.expires_at`, monteur.sql:16, **ok**), Widerruf ist möglich.
- Hinweis: Wer eine Adresse hat, kann die PDF 5 Minuten lang ohne Login laden. Das ist gewollt.
- Der Dateiname ist der SHA-256 des Inhalts. Der Hash wird beim Laden nicht gegen den Inhalt geprüft. Folge: nur ein Problem, wenn jemand fremde Dateien in deinen Ordner schreiben könnte, was die Storage-Regeln verhindern müssten. Tief.
  **Fix:** im Dashboard prüfen, dass der Bucket «Public» **aus** ist und Regeln nur `(storage.foldername(name))[1] = auth.uid()::text` erlauben. Regeln als Migration ins Repo nehmen.

---

## 4. Geheimnisse

| Ort | Ergebnis |
|---|---|
| Aktueller Stand (`src/`, `supabase/`, `test/`, `docs/`, `scripts/`, `.claude/`) | **ok**: nur der öffentliche Schlüssel `sb_publishable_…` (`src/cloud.js:8`, `src/monteur-kern.js:8`). Er ist für den Browser gedacht. `SERVICE_ROLE` steht nur als Name der Umgebungsvariable (`Deno.env.get`) |
| Git-Verlauf (174 Commits, alle Zweige): `git log --all -S` auf `service_role`, `sb_secret`, `eyJhbGci`, `BEGIN PRIVATE`, `ghp_` | **ok**: keine Treffer |
| Git-Verlauf, `password` | 2 Treffer (`ab44e82`, `de4ffe9`), das ist nur das Anmeldeformular, keine Passwörter |
| Dateinamen im Verlauf (`.env`, `.pem`, `credentials`, `secret`) | **ok**: keine |
| `dist/` | wird nicht eingecheckt (`.gitignore`), nur durch CI gebaut und veröffentlicht |
| Tests | **ok**: nur Platzhalter-Adressen (`test@beispiel.ch`, `cj@beispiel.ch`, `info@muster.test`), keine Kundendaten gefunden |

Folge für CJ: Nichts muss gedreht werden. Bedingung: Der Service-Schlüssel liegt nur bei Supabase. Das kann ich von hier nicht sehen.
**Fix (Vorsorge):** Gitleaks in die CI (siehe Punkt 7).

---

## 5. Frontend

**5a. HTML-Einfügen (innerHTML).** 114 Stellen mit `innerHTML` / `outerHTML` in `src/`. Nutzertexte laufen durch `esc()` (`src/render.js:14`, `src/dispo.js:67`, `src/hand.js:14`). Stichproben ohne Befund: Notiz-Autor und -Text (`elmonteur.js:220,305`, `monteur.js:379,408`), PDF-Namen (`planedit.js:299,1112`), Symbolnamen aus der Importdatei (`planedit.js:301`), Farben (nur `#rrggbb` zugelassen, `planimport.js:9`), Suchresultate der Adresssuche (`elhub.js:106`). Ergebnis: **ok nach Stichprobe, nicht vollständig geprüft.**

Zu beachten:
- `esc()` ersetzt `& < > "`, **nicht** das einfache Anführungszeichen `'`. Heute steht kein Wert in `'…'`-Attributen (Suche ohne Treffer), aber ein künftiger Fehler wäre einfach. **Fix:** `'` → `&#39;` ergänzen. Tief.
- `monteur.js:187` setzt `s.svg` aus dem veröffentlichten Stand ungeprüft ein. Dieser SVG-Text wird beim Planer erzeugt (`planedit.js:718`, Texte mit `esc`) und in der Datenbank abgelegt. Schreiben kann ihn nur der angemeldete Besitzer. Folge: Ist dein Konto kompromittiert oder wird eine manipulierte `.elplexa.json` importiert und veröffentlicht, kann das auf den Geräten der Monteure Skripte auslösen. Ich habe nicht lückenlos geprüft, ob jede Beschriftung im SVG durch `esc` geht. **Mittel.** **Fix:** SVG beim Monteur mit `DOMParser` einlesen und `script`, `foreignObject`, `on*`-Attribute und `javascript:` entfernen, oder im Monteur-Gerät selbst aus den Daten zeichnen.
- `.elplexa.json`-Import: wird mit `JSON.parse` gelesen und mit `parseModel` geprüft (`planimport.js:18`, `:39`). Texte aus der Datei gehen beim Anzeigen durch `esc`. **ok nach Stichprobe.**

**5b. Content-Security-Policy.** **Lücke (mittel).** Weder `<meta http-equiv="Content-Security-Policy">` noch Header (GitHub Pages erlaubt keine eigenen Header). Folge: Jeder Fehler bei 5a würde voll ausgenutzt, auch Zugriff auf das gespeicherte Login (5c).
**Fix:** `<meta>`-CSP in `src/index.template.html`, z. B. `default-src 'self'; connect-src 'self' https://keqfieduhipnulpkhdbj.supabase.co https://api3.geo.admin.ch; img-src 'self' data: blob:; worker-src blob:; style-src 'self' 'unsafe-inline'`. Da alles in eine HTML-Datei gebaut wird, braucht es `'unsafe-inline'` für Skripte, sonst Hashes im Build. Muss mit den Browser-Tests geprüft werden. Dafür ein eigener Wunsch.

**5c. localStorage.** `schemacad.cloud.v1` (`src/cloud.js:9`, `:17`) speichert Zugangs- **und** Erneuerungstoken im Klartext. Folge: Jedes eingeschleuste Skript kann das Login übernehmen (siehe 5b). Üblich für Browser-Apps, aber nur so sicher wie 5a/5b.
Sonst: Projekt-Autosave (`AUTOSAVE_KEY`), Gastkennung (`elplexacad.gast`), Reihenfolge, Tipps. Das sind Plandaten, keine Passwörter. Das Passwort selbst wird nicht gespeichert (nur beim Login gesendet). **Fix:** Sitzung kürzer halten (Ablaufzeit in Supabase Auth). Tief bis mittel.

**5d. Fremde Dienste.** `api3.geo.admin.ch` (Adresssuche, `src/gwr.js:7`): Eingegebene Adressen gehen an das Bundesamt. Datenschutz-Hinweis, keine Lücke.

---

## 6. `npm audit`

`found 0 vulnerabilities` (Stand 2. 11. 2026, lokal mit `package-lock.json`). **ok.** Hinweis: `dependencies` enthält auch Build-Werkzeuge (`esbuild`). Das ist harmlos, weil nur gebaut wird.

---

## 7. Checks in `.github/`

Es gibt nur `workflows/ci.yml` (Tests und Veröffentlichung auf Pages, `permissions: contents: read`, nur Deploy mit Rechten). **Lücke (mittel): kein Gitleaks, kein `npm audit`, kein Dependabot, keine CodeQL.**
Weiter: Actions sind auf Versionen (`@v4`) statt auf Commit-Hashes festgelegt. Tief.
**Fix:** neue Datei `.github/workflows/sicherheit.yml` mit `gitleaks/gitleaks-action`, `npm audit --audit-level=high`, `.github/dependabot.yml` (npm + github-actions). Auch: im GitHub-Repo «Secret scanning» und «Push protection» einschalten (kostenlos für öffentliche Repos).

---

## Tabelle der Funde

| Nr. | Fund | Priorität | Wer darf ändern |
|---|---|---|---|
| 1 | `projects`, `project_shares`, Bucket und Storage-Regeln nicht im Repo, RLS dort nicht belegt | **hoch** | CJ prüft im Dashboard, dann Migration nachziehen (Supabase, nur nach Rückfrage) |
| 2 | Registrierung neuer Nutzer offen? | **hoch** (bis geprüft) | CJ, Dashboard → Auth |
| 3 | Keine Content-Security-Policy | mittel | Repo, nach OK von CJ |
| 4 | Monteur-SVG wird ungefiltert eingesetzt (`monteur.js:187`) | mittel | Repo |
| 5 | Kein Rate-Limit an den zwei Edge Functions | mittel | Supabase (CJ) |
| 6 | Keine Gitleaks / Audit / Dependabot in `.github/`, Secret scanning aus? | mittel | Repo + GitHub-Einstellungen (CJ) |
| 7 | Geräte-Zeilen je Link unbegrenzt (`m_open`) | mittel-tief | Supabase-Migration (CJ) |
| 8 | Login-Token im localStorage | tief | Repo / Supabase-Ablaufzeit |
| 9 | `esc()` ohne `'` | tief | Repo |
| 10 | `share_notes.mod` ohne Check, `p_rev` ungeprüft | tief | Supabase-Migration (CJ) |
| 11 | CORS `*` an den Funktionen | tief | Supabase (CJ), bewusst vertretbar |
| 12 | Alte Teilen-Funktion `teilen-pdf` / `share_open` / `project_notes` weiter aktiv | tief | CJ entscheidet, ob sie abgeschaltet wird |
| 13 | Actions nicht auf Hash festgelegt | tief | Repo |

## Nur CJ nach Rückfrage (Supabase und GitHub-Einstellungen)

Gemäss `CLAUDE.md` nur nach Rückfrage:
1. Dashboard prüfen: RLS an für `projects`, `project_shares`; Bucket `projekt-pdf` privat und Regeln; Security Advisor durchgehen.
2. Auth: Registrierung abschalten, Sitzungsdauer prüfen.
3. Edge Functions: Rate-Limit; ob `teilen-pdf` (alter Link) weiter gebraucht wird.
4. Neue Migrationen: Obergrenze Geräte je Link, Check auf `share_notes.mod`, vorhandene Definitionen von `projects` / `project_shares` / Storage-Regeln ins Repo übernehmen.
5. GitHub: Secret scanning und Push protection einschalten.

Im Repo (kein Supabase) liessen sich ohne Rückfrage vorbereiten: CSP, SVG-Filter beim Monteur, `esc()` mit `'`, Sicherheits-Workflow.

## Grenzen dieser Prüfung
- Nur Repo-Stand gelesen. Dashboard, Live-Datenbank, Storage-Regeln, Edge-Function-Einstellungen nicht gesehen.
- Die 114 `innerHTML`-Stellen sind stichprobenartig geprüft, nicht jede einzeln.
- Keine Angriffe gegen die Live-Seite ausgeführt.
