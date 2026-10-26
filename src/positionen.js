// Positionsdatenbank beim Benutzer (Offerte Schritt 3, CJ 26.10.2026). Gehört dem Benutzer, nicht dem Projekt.
// Eintrag = die Felder der Offertposition ohne Menge und Option: { titel, text, eh, npk, bkp, typ, form, her, enr, ek, fak, std, ic, preis, gl }.
// Eine Position aus der Offerte wird hier gespeichert (gleicher Titel, Hersteller und E-Nr.: der Eintrag wird ersetzt), ein Treffer der Suche
// wird in die Offerte kopiert und ist danach frei änderbar (keine Verbindung zum Eintrag).
// Speicher wie ablage.js: immer zuerst im Browser, angemeldet zusätzlich online über einen Adapter. Heute Supabase (cloud.js posStore,
// Tabelle user_positions). Ein anderer Adapter braucht nur user() → E-Mail oder null, list() → [{ id, data, at }], save(id, data, at), remove(id).
// Im Browser: { user (wem der Stand gehört, null = Gast), rows: { id: { data, at, up (schon online), del (gelöscht, online noch nicht) } } }.
import { cleanPos } from "./offerte.js";

const KEY = "schemacad.user.positionen.v1";
let remote = null;
export const setRemote = (r) => { remote = r; };
const who = () => { try { return remote?.user() || null; } catch { return null; } };
const time = (s) => Date.parse(s) || 0;
function read() { try { const o = JSON.parse(localStorage.getItem(KEY)); if (o && o.rows && typeof o.rows === "object") return o; } catch { /* leer */ } return { user: null, rows: {} }; }
function write(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* ohne Speicher weiter */ } }
const newId = () => (globalThis.crypto?.randomUUID?.() || `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
export const ID = /^[A-Za-z0-9_-]{1,40}$/; // gleiche Regel in der Datenbank

// Eintrag prüfen und säubern (wie eine Position beim Laden), ohne ID, Menge und Option
export function cleanEntry(o) {
  const p = cleanPos(o && typeof o === "object" ? o : {}, () => 0);
  for (const k of ["id", "menge", "opt", "an"]) delete p[k];
  for (const [k, v] of Object.entries(p)) if (typeof v === "string" && k !== "text") { if (v.trim()) p[k] = v.trim(); else delete p[k]; }
  return p;
}
export const hasEntry = (e) => !!(e.titel || e.text);
// gleicher Eintrag: Titel, Hersteller und E-Nr. (ohne Gross/Klein, Leerzeichen)
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const keyOf = (e) => [norm(e.titel), norm(e.her), norm(e.enr).replace(/\s/g, "")].join("|");

// Alle Einträge, nach Titel sortiert: [{ id, ...Eintrag }]
export const list = () => Object.entries(read().rows).filter(([, r]) => !r.del).map(([id, r]) => ({ id, ...r.data })).sort((a, b) => norm(a.titel).localeCompare(norm(b.titel), "de"));
export const count = () => list().length;

// Suche über Titel, Text, E-Nr., Hersteller, NPK-Nr. Jedes Wort muss vorkommen, bei E-Nr. und NPK-Nr. auch ohne Leerzeichen und Punkte.
export function search(q, rows = list(), max = 40) {
  const words = norm(q).split(" ").filter(Boolean);
  if (!words.length) return [];
  const hay = (e) => { const s = [e.titel, e.text, e.enr, e.her, e.npk].map(norm).join(" "); return `${s} ${[e.enr, e.npk].map((x) => norm(x).replace(/[\s.]/g, "")).join(" ")}`; };
  return rows.filter((e) => { const h = hay(e); return words.every((w) => h.includes(w)); }).slice(0, max);
}

// Position aus der Offerte speichern. Gibt { id, neu, wo: "online" | "lokal" } zurück, null = nichts zu speichern (ohne Titel und Text).
export async function save(pos) {
  const data = cleanEntry(pos);
  if (!hasEntry(data)) return null;
  let db = read();
  const k = keyOf(data), old = Object.keys(db.rows).find((i) => !db.rows[i].del && keyOf(db.rows[i].data) === k);
  const id = old || newId(), at = new Date().toISOString();
  db.rows[id] = { data, at, ...(db.rows[id]?.up ? { up: true } : {}) };
  write(db);
  const res = { id, neu: !old, wo: "lokal" };
  if (!who()) return res;
  try { await remote.save(id, data, at); } catch { return res; }
  db = read(); if (db.rows[id]?.at === at) { db.rows[id].up = true; write(db); }
  return { ...res, wo: "online" };
}

// Eintrag löschen: im Browser sofort, angemeldet auch online (nicht erreichbar: der nächste Abgleich holt es nach)
export async function remove(id) {
  let db = read(); const r = db.rows[id];
  if (!r) return "lokal";
  if (!r.up) { delete db.rows[id]; write(db); return "lokal"; }
  db.rows[id] = { ...r, del: true, at: new Date().toISOString() }; write(db);
  if (!who()) return "lokal";
  try { await remote.remove(id); } catch { return "lokal"; }
  db = read(); delete db.rows[id]; write(db);
  return "online";
}

// Abgleich nach der Anmeldung oder beim Start, je Eintrag gewinnt der neuere Stand. Ein Stand im Browser, der einem anderen Benutzer
// gehört, wird nie hochgeladen. Online fehlt ein Eintrag, der schon oben war: anderswo gelöscht, fällt auch hier weg.
// Gibt true zurück, wenn sich die Einträge im Browser geändert haben.
export async function sync() {
  const user = who();
  if (!user) return false;
  const on = await remote.list(), db = read(), mine = !db.user || db.user === user;
  const before = JSON.stringify(list());
  const rows = {}, seen = new Map(on.map((r) => [r.id, r]));
  for (const r of on) if (ID.test(r.id)) rows[r.id] = { data: cleanEntry(r.data), at: r.at, up: true };
  if (mine) for (const [id, l] of Object.entries(db.rows)) {
    const o = seen.get(id);
    if (l.del) { if (o && time(l.at) >= time(o.at)) { await remote.remove(id); delete rows[id]; } continue; }
    if (o ? time(l.at) > time(o.at) : !l.up) { await remote.save(id, l.data, l.at); rows[id] = { data: l.data, at: l.at, up: true }; }
  }
  write({ user, rows });
  return JSON.stringify(list()) !== before;
}
