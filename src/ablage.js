// Speicherschicht für Daten beim Benutzer (Offerte Schritt 2, CJ 26.10.2026): Firmenprofil, später Sollwerte und IC-Zeiten.
// Immer zuerst im Browser (localStorage, geht offline und ohne Anmeldung), angemeldet zusätzlich online über einen Adapter.
// Heute ist der Adapter Supabase (cloud.js userStore). Ein anderer (iCloud, Dropbox, eigener Server) braucht nur
// user() → E-Mail oder null, load(name) → { data, at } oder null, save(name, data, at).
// Im Browser liegt je Name { data, at (Zeit der Änderung), user (wem der Stand gehört, null = Gast) }.
const KEY = (name) => `schemacad.user.${name}.v1`;
let remote = null;
export const setRemote = (r) => { remote = r; };

function readLocal(name) { try { const o = JSON.parse(localStorage.getItem(KEY(name))); return o && typeof o === "object" ? o : null; } catch { return null; } }
function writeLocal(name, rec) { try { if (rec) localStorage.setItem(KEY(name), JSON.stringify(rec)); else localStorage.removeItem(KEY(name)); } catch { /* ohne Speicher weiter */ } }
const time = (s) => Date.parse(s) || 0; // Supabase liefert «+00:00», der Browser «Z»: als Zeit vergleichen, nicht als Text
const who = () => { try { return remote?.user() || null; } catch { return null; } };

// Sofort, ohne Netz: der Stand im Browser (null = noch nichts gespeichert)
export const load = (name) => readLocal(name)?.data ?? null;

// Speichern: im Browser sofort, angemeldet auch online. Gibt "online" oder "lokal" zurück (online nicht erreichbar: bleibt lokal, der nächste Abgleich holt es nach).
// wait (ms): online erst nach dieser Pause hochladen, z. B. beim Tippen; ein neuer Aufruf ersetzt den wartenden, alle bekommen dasselbe Ergebnis.
const waiting = {};
export function save(name, data, { wait = 0 } = {}) {
  const user = who(), rec = { data, at: new Date().toISOString(), user };
  writeLocal(name, rec);
  if (!user) return Promise.resolve("lokal");
  const w = waiting[name] || (waiting[name] = { done: [] });
  clearTimeout(w.t);
  return new Promise((res) => {
    w.done.push(res);
    w.t = setTimeout(async () => {
      delete waiting[name];
      let r = "online";
      try { await remote.save(name, data, rec.at); } catch { r = "lokal"; }
      for (const f of w.done) f(r);
    }, wait);
  });
}

// Abgleich nach der Anmeldung oder beim Start: der neuere Stand gewinnt. Ein Stand im Browser, der einem anderen Benutzer gehört,
// wird nie hochgeladen; dann gilt der Online-Stand oder nichts. Gibt true zurück, wenn sich der Stand im Browser geändert hat.
export async function sync(name) {
  const user = who();
  if (!user) return false;
  const loc = readLocal(name), on = await remote.load(name);
  const mine = !!loc && (!loc.user || loc.user === user);
  if (on && (!mine || time(on.at) > time(loc.at))) { writeLocal(name, { data: on.data, at: on.at, user }); return true; }
  if (!mine) { if (loc) { writeLocal(name, null); return true; } return false; }
  if (!on || time(loc.at) > time(on.at)) await remote.save(name, loc.data, loc.at);
  if (loc.user !== user) writeLocal(name, { ...loc, user }); // Gast-Stand gehört ab jetzt diesem Benutzer
  return false;
}
