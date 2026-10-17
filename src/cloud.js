// SchemaCAD: Online-Ablage (Supabase) für Datenblätter (Modul- und WR-Typen) und Symbol-Bibliotheken. Nur ein Zusatz:
// ohne Anmeldung und ohne Internet läuft alles wie bisher mit Dateien. Projekte bleiben Dateien (CJ 15.10.).
// Kein Supabase-Paket, nur fetch auf die REST-Schnittstelle. Zugriff regelt die Datenbank (RLS): lesen alle Angemeldeten, schreiben nur eigene Einträge.
import { toast, openModal, chooseDialog } from "./dialogs.js";

const BASE = "https://keqfieduhipnulpkhdbj.supabase.co";
const KEY = "sb_publishable_nf0XboCTqgQl7_Vv3_u4YA_oJQVdwsF"; // öffentlicher Schlüssel, darf in der App stehen
const SESSION_KEY = "schemacad.cloud.v1";

let sess = null;
try { sess = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { /* ohne Speicher: Anmeldung gilt nur bis zum Schliessen */ }
function keep(s) {
  sess = s;
  try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch { /* ohne Speicher weiterarbeiten */ }
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
