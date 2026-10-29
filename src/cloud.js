// SchemaCAD: Online-Ablage (Supabase) für Datenblätter (Modul- und WR-Typen) und Symbol-Bibliotheken. Nur ein Zusatz:
// ohne Anmeldung und ohne Internet läuft alles wie bisher mit Dateien. Projekte bleiben Dateien (CJ 15.10.).
// Kein Supabase-Paket, nur fetch auf die REST-Schnittstelle. Zugriff regelt die Datenbank (RLS): lesen alle Angemeldeten, schreiben nur eigene Einträge.
import { toast, openModal, chooseDialog } from "./dialogs.js";
import { toBase64, fromBase64 } from "./pdfbg.js";

const BASE = "https://keqfieduhipnulpkhdbj.supabase.co";
const KEY = "sb_publishable_nf0XboCTqgQl7_Vv3_u4YA_oJQVdwsF"; // öffentlicher Schlüssel, darf in der App stehen
const SESSION_KEY = "schemacad.cloud.v1";

let sess = null;
try { sess = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { /* ohne Speicher: Anmeldung gilt nur bis zum Schliessen */ }
const onSession = []; // Anmeldung geändert (Fenster, abgelaufen, Abmelden im Katalog): elplexaCAD zeichnet den Konto-Kreis neu, beide Stände gleichen das Profil ab
export const cloudOnSession = (fn) => { onSession.push(fn); };
function keep(s) {
  sess = s;
  try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch { /* ohne Speicher weiterarbeiten */ }
  for (const fn of onSession) try { fn(); } catch { /* Anzeige darf die Anmeldung nicht stören */ }
}

async function call(path, opt = {}) {
  let r;
  try { r = await fetch(BASE + path, { ...opt, headers: { apikey: KEY, "Content-Type": "application/json", ...opt.headers } }); }
  catch { throw new Error("Keine Verbindung zur Online-Ablage. Ohne Internet bitte mit Dateien arbeiten."); }
  if (r.status === 540) throw new Error("Die Online-Ablage ist pausiert (Gratis-Plan, 7 Tage ohne Nutzung). Im Supabase-Dashboard «Resume project» wählen.");
  const body = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(body?.msg || body?.message || body?.error_description || `Fehler der Online-Ablage (${r.status}).`), { status: r.status });
  return body;
}
async function token(grant, data) {
  const b = await call(`/auth/v1/token?grant_type=${grant}`, { method: "POST", body: JSON.stringify(data) });
  keep({ access_token: b.access_token, refresh_token: b.refresh_token, expires_at: b.expires_at, email: b.user?.email ?? sess?.email });
}

// Anmeldung mit E-Mail und Passwort. Konten legt CJ in Supabase an (keine Selbstregistrierung).
function loginDialog() {
  const body = `<p>Anmelden für die Online-Ablage. Ohne Anmeldung geht alles weiter mit Dateien.</p>
<div class="field"><label>E-Mail</label><input type="email" data-f="e" autocomplete="username" spellcheck="false"></div>
<div class="field"><label>Passwort</label><input type="password" data-f="p" autocomplete="current-password"></div>
<div class="actions"><button class="btn outline" data-c>Abbrechen</button><button class="btn primary" data-ok>Anmelden</button></div>`;
  const shown = openModal("Anmelden", body, async (b, done) => {
    if (b.dataset.c !== undefined) { done(false); return; }
    if (b.dataset.ok === undefined) return;
    const v = (f) => document.querySelector(`#modal-root [data-f="${f}"]`).value;
    const email = v("e").trim(), password = v("p");
    if (!email || !password) { toast("Bitte E-Mail und Passwort eingeben.", "error"); return; }
    try { await token("password", { email, password }); done(true); }
    catch (err) { toast(err.status === 400 ? "E-Mail oder Passwort falsch." : err.message, "error"); }
  }, false, "input");
  // Enter in E-Mail oder Passwort schickt ab, wie ein Klick auf „Anmelden“
  document.querySelector("#modal-root .modal").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("input")) { e.preventDefault(); document.querySelector("#modal-root [data-ok]").click(); } });
  return shown;
}

// Gültige Anmeldung oder null (abgebrochen). Abgelaufene Zugänge werden still erneuert.
async function ensure() {
  if (sess && sess.expires_at > Date.now() / 1000 + 60) return sess;
  if (sess?.refresh_token) {
    try { await token("refresh_token", { refresh_token: sess.refresh_token }); return sess; }
    catch (err) { if (!err.status) throw err; keep(null); } // ohne Verbindung nicht abmelden
  }
  return (await loginDialog()) ? sess : null;
}
async function rest(path, opt = {}) {
  const s = await ensure();
  if (!s) return null;
  try { return await call("/rest/v1/" + path, { ...opt, headers: { Authorization: `Bearer ${s.access_token}`, ...opt.headers } }); }
  catch (err) { if (err.status === 401) { keep(null); throw new Error("Die Anmeldung ist abgelaufen. Bitte erneut versuchen."); } throw err; }
}

// table: "module_types", "inv_types" oder "symbol_libs". Einträge { name, data }.
const list = (table) => rest(`${table}?select=name,data&order=name`);
const put = (table, items) => rest(`${table}?on_conflict=owner,name`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  body: JSON.stringify(items.map((x) => ({ ...x, updated_at: new Date().toISOString() }))) });

// Auswahl Laden / Speichern / Abmelden für einen Katalog oder die Bibliotheken.
// items(): eigene Einträge [{ name, data }], gleicher Name wird online überschrieben. merge(datas): übernimmt geladene Daten (prüft selbst).
export async function cloudMenu(table, what, items, merge) {
  const opts = [{ label: "Aus der Online-Ablage laden", v: "load" }];
  if (items().length) opts.push({ label: "In die Online-Ablage speichern", v: "save" });
  const r = await chooseDialog(`${what} online`, sess ? `Angemeldet als ${sess.email}.` : "Für die Online-Ablage ist eine Anmeldung nötig.", opts, sess ? [{ label: "Abmelden", v: "out" }] : []);
  const v = r?.option?.v ?? r?.extra?.v;
  try {
    if (v === "out") {
      try { await call("/auth/v1/logout", { method: "POST", headers: { Authorization: `Bearer ${sess.access_token}` } }); } catch { /* lokal trotzdem abmelden */ }
      keep(null); toast("Abgemeldet.");
    } else if (v === "save") {
      const rows = await put(table, items());
      if (rows) toast(`${what}: ${rows.length} Eintr${rows.length === 1 ? "ag" : "äge"} online gespeichert.`);
    } else if (v === "load") {
      const rows = await list(table);
      if (rows) merge(rows.map((x) => x.data));
    }
  } catch (err) { toast(err.message, "error"); }
}

// elplexaCAD (Schritt 3 „Online-Projekte“, CJ 17.10.2026): Projekte online speichern und öffnen, nur hinter ELPLEXA genutzt.
// Tabelle `projects` (nur eigene Zeilen, RLS), PDF-Dachpläne im privaten Bucket `projekt-pdf` unter <Konto>/<SHA-256>.pdf.
// Die Datei bleibt der Hauptweg: online steht eine Kopie, in der Zeile ohne PDF-Inhalt (assets → { name, type, sha }).
// Daten beim Benutzer (Offerte Schritt 2, Tabelle user_settings): Adapter für die Speicherschicht (ablage.js).
// Fragt nie nach der Anmeldung: ohne gültige Anmeldung wirft er, die Speicherschicht bleibt dann lokal.
async function restQuiet(path, opt = {}) {
  if (!sess) throw new Error("Nicht angemeldet.");
  if (sess.expires_at <= Date.now() / 1000 + 60) await token("refresh_token", { refresh_token: sess.refresh_token });
  return call("/rest/v1/" + path, { ...opt, headers: { Authorization: `Bearer ${sess.access_token}`, ...opt.headers } });
}
export const userStore = {
  user: () => sess?.email || null,
  async load(name) {
    const r = await restQuiet(`user_settings?name=eq.${encodeURIComponent(name)}&select=data,updated_at`);
    return r?.[0] ? { data: r[0].data, at: r[0].updated_at } : null;
  },
  save: (name, data, at) => restQuiet("user_settings?on_conflict=owner,name", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ name, data, updated_at: at }) }),
};
// Positionsdatenbank (Offerte Schritt 3, Tabelle user_positions): Adapter für positionen.js. Liest in Stücken zu 1000 Zeilen (Grenze von Supabase).
export const posStore = {
  user: () => sess?.email || null,
  async list() {
    const out = [];
    for (let n = 0; ; n += 1000) {
      const r = await restQuiet(`user_positions?select=id,data,updated_at&order=id&limit=1000&offset=${n}`) || [];
      for (const x of r) out.push({ id: x.id, data: x.data, at: x.updated_at });
      if (r.length < 1000) return out;
    }
  },
  save: (id, data, at) => restQuiet("user_positions?on_conflict=owner,id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id, data, updated_at: at }) }),
  remove: (id) => restQuiet(`user_positions?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }),
};

export const PROJ_MAX = 5_000_000; // Zeichen Projekt-JSON ohne PDF, gleiche Grenze in der Datenbank
export const PDF_MAX = 52428800; // Bytes je PDF (50 MiB), Grenze des Buckets (Gratis-Plan)
export const cloudUser = () => sess?.email || null;
// Anmeldung aus dem Reiter Profil (ohne Fenster). Wirft bei falschen Daten (status 400) oder fehlender Verbindung.
export const cloudSignIn = (email, password) => token("password", { email, password });
export const cloudLogin = async () => !!(await ensure()); // Anmelden (Knopf in der Übersicht); true = angemeldet
export async function cloudLogout() {
  try { if (sess) await call("/auth/v1/logout", { method: "POST", headers: { Authorization: `Bearer ${sess.access_token}` } }); } catch { /* lokal trotzdem abmelden */ }
  keep(null);
}
const uid = (s) => JSON.parse(atob(s.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub; // Konto-ID aus dem Zugang
async function storage(path, opt = {}) {
  const s = await ensure();
  if (!s) return null;
  try { return await call("/storage/v1/" + path, { ...opt, headers: { Authorization: `Bearer ${s.access_token}`, ...opt.headers } }); }
  catch (err) { if (err.status === 401) { keep(null); throw new Error("Die Anmeldung ist abgelaufen. Bitte erneut versuchen."); } throw err; }
}
async function sha256(bytes) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join(""); }

// Liste der eigenen Online-Projekte, neueste zuerst. null = Anmeldung abgebrochen.
// Mit pm/pt/pa (nur project.meta, .time, .auto der Zeile, für Objekt, Stunden und vorläufige Zeit, Etappe 3a); lehnt der Server das ab, die alte schlanke Abfrage.
// Risiko: Postgres liest dafür die jsonb-Spalte data je Zeile trotzdem ganz (bis 5 MB je Projekt); gegen das echte Supabase ungeprüft.
export async function projList() {
  try { return await rest("projects?select=id,name,status,updated_at,pm:data->project->meta,pt:data->project->time,pa:data->project->auto&order=updated_at.desc"); }
  catch (err) { if (err.status !== 400) throw err; return rest("projects?select=id,name,status,updated_at&order=updated_at.desc"); }
}

// Speichern. doc = geparste Projektdatei, link = { id, at } (zuletzt gespeicherter Online-Stand) oder null.
// force: Online-Stand überschreiben, auch wenn er neuer ist. Gibt { id, at } zurück, { conflict: at } wenn online neuer, null bei Abbruch.
export async function projSave(doc, link, { name, status, force = false }) {
  if (!(await ensure())) return null;
  const assets = doc.assets || {}, refs = {}, files = [];
  for (const [id, a] of Object.entries(assets)) {
    const bytes = fromBase64(a.data);
    if (bytes.length > PDF_MAX) throw new Error(`Die PDF „${a.name}“ ist grösser als 50 MB und passt nicht in die Online-Ablage.`);
    const sha = await sha256(bytes);
    refs[id] = { name: a.name, type: a.type, sha }; files.push([sha, bytes]);
  }
  const { assets: _a, ...rest0 } = doc;
  const data = { ...rest0, ...(files.length ? { assets: refs } : {}) };
  if (data.project) { const { online: _o, ...p } = data.project; data.project = p; } // Verknüpfung gehört in die Datei, nicht online
  const text = JSON.stringify(data);
  if (text.length > PROJ_MAX) throw new Error("Das Projekt ist ohne PDF grösser als 5 MB und passt nicht in die Online-Ablage. Bitte als Datei speichern.");
  // PDF zuerst hochladen (nur fehlende), damit eine Zeile nie auf eine fehlende PDF zeigt
  const me = uid(sess);
  if (files.length) {
    const have = new Set(((await storage("object/list/projekt-pdf", { method: "POST", body: JSON.stringify({ prefix: me, limit: 1000 }) })) || []).map((o) => o.name));
    for (const [sha, bytes] of files) if (!have.has(sha + ".pdf")) await storage(`object/projekt-pdf/${me}/${sha}.pdf`, { method: "POST", body: bytes, headers: { "Content-Type": "application/pdf", "x-upsert": "true" } });
  }
  const row = { name, status, data, updated_at: new Date().toISOString() };
  const ret = { Prefer: "return=representation" };
  const sel = "&select=id,updated_at";
  if (link?.id) {
    const q = `projects?id=eq.${encodeURIComponent(link.id)}${force ? "" : `&updated_at=eq.${encodeURIComponent(link.at)}`}${sel}`;
    const r = await rest(q, { method: "PATCH", headers: ret, body: JSON.stringify(row) });
    if (r?.length) return { id: r[0].id, at: r[0].updated_at };
    const now = await rest(`projects?id=eq.${encodeURIComponent(link.id)}&select=updated_at`);
    if (now?.length) return { conflict: now[0].updated_at }; // online neuer (anderer Rechner oder ältere Datei)
    // online gelöscht: neu anlegen
  }
  const r = await rest(`projects?${sel.slice(1)}`, { method: "POST", headers: ret, body: JSON.stringify(row) });
  return r?.length ? { id: r[0].id, at: r[0].updated_at } : null;
}
// nach dem Speichern: alte PDF (z. B. nach Plantausch) aufräumen, Fehler dabei nicht melden
export const projSaved = () => pdfCleanup().catch(() => 0);

// Öffnen: Projekt-JSON mit PDF-Inhalt (wie aus der Datei) und Verknüpfung { id, at }. null bei Abbruch.
export async function projOpen(id) {
  const r = await rest(`projects?id=eq.${encodeURIComponent(id)}&select=data,updated_at,owner`);
  if (!r) return null;
  if (!r.length) throw new Error("Dieses Online-Projekt gibt es nicht mehr.");
  const { data, updated_at, owner } = r[0], assets = {};
  for (const [aid, a] of Object.entries(data.assets || {})) {
    let res;
    try { res = await fetch(`${BASE}/storage/v1/object/authenticated/projekt-pdf/${owner}/${a.sha}.pdf`, { headers: { apikey: KEY, Authorization: `Bearer ${sess.access_token}` } }); }
    catch { throw new Error("Keine Verbindung zur Online-Ablage. Ohne Internet bitte mit Dateien arbeiten."); }
    if (!res.ok) throw new Error(`Die PDF „${a.name}“ fehlt in der Online-Ablage (${res.status}).`);
    assets[aid] = { name: a.name, type: a.type, data: toBase64(new Uint8Array(await res.arrayBuffer())) };
  }
  const doc = { ...data, ...(Object.keys(assets).length ? { assets } : {}) };
  doc.project = { ...(doc.project || {}), online: { id, at: updated_at } };
  return doc;
}

// Zeit direkt eintragen (Zeit-Reiter, CJ 21.10.2026), ohne das Projekt zu öffnen: Zeile lesen, Eintrag anhängen, nur schreiben, wenn sie
// inzwischen niemand geändert hat (updated_at), sonst einmal neu lesen. PDF bleiben unberührt (data hält nur Verweise). Gibt { time, at } zurück, null bei Abbruch.
export async function projTimeAdd(id, entry) {
  for (let i = 0; i < 2; i++) {
    const r = await rest(`projects?id=eq.${encodeURIComponent(id)}&select=data,updated_at`);
    if (!r) return null;
    if (!r.length) throw new Error("Dieses Online-Projekt gibt es nicht mehr.");
    const { data, updated_at } = r[0], p = (data.project ||= {}), time = [...(Array.isArray(p.time) ? p.time : []), entry];
    p.time = time;
    const at = new Date().toISOString();
    const w = await rest(`projects?id=eq.${encodeURIComponent(id)}&updated_at=eq.${encodeURIComponent(updated_at)}&select=updated_at`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ data, updated_at: at }) });
    if (w === null) return null;
    if (w.length) return { time, at: w[0].updated_at };
  }
  throw new Error("Das Projekt wurde gerade an einem anderen Ort gespeichert. Bitte nochmals eintragen.");
}

// Online-Projekt löschen, danach PDF aufräumen. null bei Abbruch.
export async function projDelete(id) {
  const r = await rest(`projects?id=eq.${encodeURIComponent(id)}&select=id`, { method: "DELETE", headers: { Prefer: "return=representation" } });
  if (r) await pdfCleanup();
  return r;
}
// Unbenutzte PDF im eigenen Ordner löschen: auf die kein eigenes Online-Projekt mehr zeigt.
// Nur Dateien älter als eine Stunde, damit ein gleichzeitiges Speichern (PDF hochgeladen, Zeile noch nicht) nichts verliert.
export async function pdfCleanup() {
  const rows = await rest("projects?select=assets:data->assets");
  if (!rows) return 0;
  // PDF aus veröffentlichten Ständen für den Monteur bleiben, auch wenn das Projekt den Plan nicht mehr hat (Monteur-Ansicht, 28.10.2026)
  let rel = [];
  try { rel = (await rest("share_releases?select=assets:data->assets")) || []; } catch (err) { if (err.status !== 404 && err.status !== 400) throw err; } // Tabelle fehlt noch: wie bisher
  const used = new Set([...rows, ...rel].flatMap((r) => Object.values(r.assets || {}).map((a) => a.sha + ".pdf")));
  const me = uid(sess), old = Date.now() - 3600e3;
  const files = (await storage("object/list/projekt-pdf", { method: "POST", body: JSON.stringify({ prefix: me, limit: 1000 }) })) || [];
  const drop = files.filter((f) => f.name.endsWith(".pdf") && !used.has(f.name) && Date.parse(f.created_at || 0) < old).map((f) => `${me}/${f.name}`);
  if (drop.length) await storage("object/projekt-pdf", { method: "DELETE", body: JSON.stringify({ prefixes: drop }) });
  return drop.length;
}

// Feedback (elplexaCAD, CJ 18.10.2026): Tabelle `feedback` (nur einfügen und eigene lesen, RLS), Screenshot im privaten Bucket `feedback` unter <Konto>/<Zufall>.png.
// f = { art, titel, beschreibung, shot (Blob oder null), app_version, modul, projekt_id }. true = gesendet, null = Anmeldung abgebrochen.
export async function feedbackSend({ shot, ...f }) {
  if (!(await ensure())) return null;
  let screenshot_path = null;
  if (shot) { // zuerst das Bild, damit die Zeile nie auf ein fehlendes Bild zeigt
    const path = `${uid(sess)}/${crypto.randomUUID()}.${shot.type === "image/jpeg" ? "jpg" : "png"}`;
    if (!(await storage(`object/feedback/${path}`, { method: "POST", body: shot, headers: { "Content-Type": shot.type } }))) return null;
    screenshot_path = path;
  }
  const r = await rest("feedback?select=id", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...f, screenshot_path, user_agent: navigator.userAgent.slice(0, 500) }) });
  return r?.length ? true : null;
}

// Teilen per Link (Meilenstein 2, Schritt 1, 18.10.2026): Tabelle `project_shares` (nur eigene Zeilen, RLS), je Link ein geheimer Schlüssel
// mit Ablauf (Vorgabe Datenbank 30 Tage) und Widerruf. Empfänger ohne Login lesen nur über die Funktion `share_open` (security definer)
// und holen PDF-Dachpläne über die Edge Function `teilen-pdf` (signierte Adressen, 5 min). Nie direkt aus `projects` oder dem Bucket.
export const SHARE_ONLINE = "https://krisswi.github.io/elplexaCAD/"; // als lokale Datei (file:) zeigt der Link auf die Online-Adresse
export const shareUrl = (token) => `${window.location.protocol.startsWith("http") ? window.location.origin + window.location.pathname : SHARE_ONLINE}?teilen=${token}`;
// gültige Links eines eigenen Online-Projekts, neueste zuerst. null = Anmeldung abgebrochen.
export const shareList = (projectId) => rest(`project_shares?project_id=eq.${encodeURIComponent(projectId)}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,token,expires_at,modules,prices&order=created_at.desc`);
// modules: null = ganzes Projekt, sonst Modul-Kennungen (model.js modOf). Was nicht freigegeben ist, filtert share_open in der Datenbank weg.
// prices (CJ 26.10.2026): Offerte mit Preisen. EK, Faktor und Zeit entfernt share_open immer (Migration 20261026_share_offerte); ganzes Projekt ohne modules = ohne Offerte.
export async function shareCreate(projectId, modules = null, prices = false) {
  const r = await rest("project_shares?select=id,token,expires_at,modules,prices", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ project_id: projectId, ...(modules ? { modules } : {}), ...(prices ? { prices: true } : {}) }) });
  return r?.[0] || null;
}
export const shareRevoke = (id) => rest(`project_shares?id=eq.${encodeURIComponent(id)}&select=id`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ revoked_at: new Date().toISOString() }) });
// Empfänger: Projekt zum Schlüssel, ohne Anmeldung. { doc, name, at, ablauf, modules } oder { grund: "ungueltig" | "abgelaufen" | "widerrufen" | "modul_fehlt" }.
export async function shareOpen(token) {
  const r = await call("/rest/v1/rpc/share_open", { method: "POST", body: JSON.stringify({ p_token: token }) });
  if (!r?.ok) return { grund: r?.grund || "ungueltig" };
  const assets = {}, refs = Object.entries(r.data.assets || {});
  if (refs.length) {
    const p = await call("/functions/v1/teilen-pdf", { method: "POST", body: JSON.stringify({ token }) });
    if (!p?.ok) return { grund: p?.grund || "ungueltig" };
    for (const [aid, a] of refs) {
      let res;
      try { res = await fetch(p.urls[a.sha]); } catch { throw new Error("Keine Verbindung zur Online-Ablage."); }
      if (!res.ok) throw new Error(`Die PDF „${a.name}“ fehlt in der Online-Ablage (${res.status}).`);
      assets[aid] = { name: a.name, type: a.type, data: toBase64(new Uint8Array(await res.arrayBuffer())) };
    }
  }
  return { doc: { ...r.data, ...(refs.length ? { assets } : {}) }, name: r.name, at: r.updated_at, ablauf: r.ablauf, modules: r.modules || null, prices: r.prices === true };
}
// Notizen und Markierungen (Meilenstein 2, Schritt 2, 20.10.2026): Tabelle `project_notes`, Empfänger nur über Funktionen mit Schlüssel.
// guest = Zufallskennung des Browsers (nur «eigene löschen», nie ausgeliefert). Grenzen prüft die Datenbank (Länge, 300 je Link, 30 in 10 min).
// Ergebnis jeweils { ok: true, … } oder { grund: "link" | "voll" | "zu_schnell" | "eingabe" | "fehlt" }; ohne Netz Fehler wie bei shareOpen.
const rpc = async (fn, args) => { const r = await call(`/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) }); return r?.ok ? r : { grund: r?.grund || "fehlt" }; };
export const shareNotes = (token, guest) => rpc("share_notes_list", { p_token: token, p_guest: guest });
export const shareNoteAdd = (token, guest, n) => rpc("share_note_add", { p_token: token, p_guest: guest, p_sheet: n.sheet, p_label: n.sheet_label, p_kind: n.kind, p_x: n.x, p_y: n.y, p_w: n.w, p_h: n.h, p_text: n.text, p_author: n.author });
export const shareNoteDelete = (token, guest, id) => rpc("share_note_delete", { p_token: token, p_guest: guest, p_id: id });

// Pläne für den Monteur (CJ 28.10.2026, Migration 20261028_monteur): eigener Link je Projekt (Tabelle `shares`), «Veröffentlichen» füllt ihn
// (p_publish), Notizen mit fester Nummer je Plan (share_notes). Planer mit Login über REST und p_*, Monteur ohne Login nur über m_* mit Schlüssel.
// Der alte Teilen-Link (project_shares, share_open) bleibt daneben unverändert.
export const monteurUrl = (token) => `${window.location.protocol.startsWith("http") ? window.location.origin + window.location.pathname : SHARE_ONLINE}?monteur=${token}`;
const SH_COLS = "id,project_id,token,created_at,expires_at,revoked_at,phone,rev,pub_at,opened_at";
// gültiger Link des Projekts (neuester) oder null; undefined = Anmeldung abgebrochen
export async function mShareGet(projectId) {
  const r = await rest(`shares?project_id=eq.${encodeURIComponent(projectId)}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=${SH_COLS}&order=created_at.desc&limit=1`);
  return r === null ? undefined : r[0] || null;
}
// Status aller eigenen Projekte für die Übersicht: Map project_id → Link. Fragt nie nach der Anmeldung.
export async function mShareAll() {
  const r = await restQuiet(`shares?revoked_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=project_id,rev,pub_at,expires_at,revoked_at&order=created_at.desc`);
  const m = new Map(); for (const s of r || []) if (!m.has(s.project_id)) m.set(s.project_id, s);
  return m;
}
export async function mShareCreate(projectId, expires_at, phone) {
  const r = await rest(`shares?select=${SH_COLS}`, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ project_id: projectId, expires_at, phone }) });
  return r?.[0] || null;
}
// patch: { expires_at?, phone?, revoked_at? }
export async function mShareUpdate(id, patch) {
  const r = await rest(`shares?id=eq.${encodeURIComponent(id)}&select=${SH_COLS}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
  return r?.[0] || null;
}
// zuletzt veröffentlichter Stand des Moduls ohne Inhalt: { rev, at, hash } oder null
export async function mRelease(shareId, mod = "plan") {
  const r = await rest(`share_releases?share_id=eq.${encodeURIComponent(shareId)}&mod=eq.${encodeURIComponent(mod)}&select=rev,at,hash:data->>hash`);
  return r?.[0] || null;
}
export async function mDevices(shareId) { return (await rest(`share_devices?share_id=eq.${encodeURIComponent(shareId)}&select=seen_at`)) || []; }
export async function mPlanerNotes(shareId) { return (await rest(`share_notes?share_id=eq.${encodeURIComponent(shareId)}&select=id,share_id,mod,sheet,nr,von,published,x,y,text,author,rev,created_at,updated_at,status,erledigt_at,antwort,antwort_at&order=sheet,nr`)) || []; }
const prpc = async (fn, args) => { const r = await rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) }); return r === null ? null : r?.ok ? r : { grund: r?.grund || "fehlt" }; };
export const mPublish = (shareId, data, mod = "plan") => prpc("p_publish", { p_share: shareId, p_mod: mod, p_data: data });
export const mPNoteAdd = (shareId, n) => prpc("p_note_add", { p_share: shareId, p_mod: n.mod || "plan", p_sheet: n.sheet, p_x: n.x, p_y: n.y, p_text: n.text, p_author: n.author });
export const mPNoteEdit = (id, { text = null, x = null, y = null }) => prpc("p_note_edit", { p_id: id, p_text: text, p_x: x, p_y: y });
export const mPNoteConfirm = (id, done, antwort = null) => prpc("p_note_confirm", { p_id: id, p_done: done, p_antwort: antwort });
export async function mPNoteDelete(id) { const r = await rest(`share_notes?id=eq.${encodeURIComponent(id)}&select=id`, { method: "DELETE", headers: { Prefer: "return=representation" } }); return r === null ? null : r.length ? { ok: true } : { grund: "fehlt" }; }

// Monteur (ohne Login). Ergebnis wie die Funktion oder { net: "offline" } (keine Verbindung) bzw. { net: "schlaeft" } (Server pausiert oder nicht
// erreichbar mit Antwort 5xx). Annahme: ohne Antwort = offline (Funkloch auf der Baustelle), 540 und 502–504 = Server schläft.
async function mcall(path, body) {
  let r;
  try { r = await fetch(BASE + path, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch { return { net: "offline" }; }
  if (r.status === 540 || (r.status >= 502 && r.status <= 504)) return { net: "schlaeft" };
  const b = await r.json().catch(() => null);
  if (!r.ok) return { net: "fehler", msg: b?.message || `Fehler ${r.status}` };
  return b || { net: "fehler", msg: "Leere Antwort" };
}
export const mOpen = (token, guest, have) => mcall("/rest/v1/rpc/m_open", { p_token: token, p_guest: guest, p_have: have });
export const mNotes = (token, guest) => mcall("/rest/v1/rpc/m_notes", { p_token: token, p_guest: guest });
export const mNoteAdd = (token, guest, n) => mcall("/rest/v1/rpc/m_note_add", { p_token: token, p_guest: guest, p_mod: n.mod || "plan", p_sheet: n.sheet, p_nr: n.nr, p_x: n.x, p_y: n.y, p_text: n.text, p_author: n.author, p_rev: n.rev });
export const mNoteEdit = (token, id, { text = null, x = null, y = null }) => mcall("/rest/v1/rpc/m_note_edit", { p_token: token, p_id: id, p_text: text, p_x: x, p_y: y });
export const mNoteDelete = (token, id) => mcall("/rest/v1/rpc/m_note_delete", { p_token: token, p_id: id });
// PDF-Pläne des veröffentlichten Stands: signierte Adressen (Edge Function monteur-pdf, 5 min), dann die Dateien. Ergebnis { sha: ArrayBuffer } oder { net }.
export async function mPdfs(token, shas) {
  if (!shas.length) return {};
  const p = await mcall("/functions/v1/monteur-pdf", { token });
  if (p.net || !p.ok) return p.net ? p : { net: "fehler", msg: p.grund || "PDF" };
  const out = {};
  for (const sha of shas) {
    if (!p.urls?.[sha]) continue;
    try { const res = await fetch(p.urls[sha]); if (res.ok) out[sha] = await res.arrayBuffer(); } catch { return { net: "offline" }; }
  }
  return out;
}
