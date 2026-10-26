// Offerte Schritt 3 (CJ 26.10.2026): Positionsdatenbank beim Benutzer (positionen.js). Ohne Browser, ohne Netz: localStorage und der
// Online-Adapter sind Attrappen, alle Werte erfunden. Prüft Speichern (gleicher Eintrag wird ersetzt), Suche, Kopie in die Offerte,
// Löschen und den Abgleich je Eintrag (neuerer Stand gewinnt, fremder Stand wird nie hochgeladen, anderswo gelöscht fällt weg).
import assert from "node:assert";
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const PD = await import("../src/positionen.js");
const O = await import("../src/offerte.js");
const OF = await import("../src/offedit.js");

// Online-Attrappe: eine Tabelle je Benutzer
const db = new Map(); let user = null, down = false, calls = 0;
const tab = () => db.get(user) || db.set(user, new Map()).get(user);
const remote = {
  user: () => user,
  async list() { if (down) throw new Error("offline"); return [...tab()].map(([id, r]) => ({ id, ...structuredClone(r) })); },
  async save(id, data, at) { if (down) throw new Error("offline"); calls++; tab().set(id, { data: structuredClone(data), at: at.replace("Z", "+00:00") }); },
  async remove(id) { if (down) throw new Error("offline"); calls++; tab().delete(id); },
};
PD.setRemote(remote);

// ---------- Eintrag säubern: Felder der Position ohne ID, Menge, Option ----------
assert.deepStrictEqual(PD.cleanEntry({ id: 7, titel: " Steckdose ", menge: 3, opt: true, an: true, ek: 10, her: "Muster", enr: "123456789", x: 1, typ: "mat", typX: 2 }),
  { titel: "Steckdose", her: "Muster", enr: "123456789", ek: 10, typ: "mat" }, "nur Positionsfelder, getrimmt");
assert.strictEqual(await PD.save({ menge: 2 }), null, "ohne Titel und Text nichts zu speichern");

// ---------- Gast: nur im Browser ----------
const a = await PD.save({ id: 3, titel: "UP-Steckdose T13", her: "Muster AG", enr: "111 222 333", ek: 10, eh: "Stk", typ: "mat", menge: 5 });
assert.deepStrictEqual([a.neu, a.wo], [true, "lokal"]);
const b = await PD.save({ titel: "Installationskabel 3x1.5", text: "FE0", enr: "022 333 444", ek: 1, eh: "m", npk: "1 23.456.789.000.00" });
assert.strictEqual(PD.count(), 2);
const a2 = await PD.save({ titel: "up-steckdose  t13", her: "MUSTER AG", enr: "111222333", ek: 12 });
assert.deepStrictEqual([a2.id, a2.neu, PD.count()], [a.id, false, 2], "gleicher Titel, Hersteller und E-Nr. ersetzt den Eintrag");
assert.strictEqual(PD.list().find((e) => e.id === a.id).ek, 12, "neuer EK gilt");
assert.strictEqual(calls, 0, "Gast: nichts online");

// ---------- Suche: Titel, Text, E-Nr. (mit und ohne Leerzeichen), Hersteller, NPK-Nr. ----------
const ids = (q) => PD.search(q).map((e) => e.id);
assert.deepStrictEqual(ids(""), [], "leer: keine Treffer");
assert.deepStrictEqual(ids("steckdose"), [a.id], "Titel, ohne Gross/Klein");
assert.deepStrictEqual(ids("fe0"), [b.id], "Text");
assert.deepStrictEqual(ids("022333"), [b.id], "E-Nr. ohne Leerzeichen");
assert.deepStrictEqual(ids("111 222"), [a.id], "E-Nr. mit Leerzeichen (beide Wörter kommen vor)");
assert.deepStrictEqual(ids("muster"), [a.id], "Hersteller");
assert.deepStrictEqual(ids("23.456"), [b.id], "NPK-Nr. mit Punkten");
assert.deepStrictEqual(ids("23456789"), [b.id], "NPK-Nr. ohne Punkte");
assert.deepStrictEqual(ids("kabel muster"), [], "jedes Wort muss vorkommen");

// ---------- Treffer in die Offerte kopieren, danach frei änderbar ----------
const of = O.newOfferte();
const act = (attrs) => OF.action(of, { dataset: attrs });
let r = act({ ofact: "dbadd", db: b.id }); r.fn();
assert.strictEqual(of.kap.length, 1, "ohne Kapitel entsteht eines");
let p = of.kap[0].grp[0].pos[0];
assert.deepStrictEqual({ ...p, id: 0 }, { id: 0, titel: "Installationskabel 3x1.5", text: "FE0", enr: "022 333 444", ek: 1, eh: "m", npk: "1 23.456.789.000.00" }, "alle Felder kopiert, keine Menge");
assert.strictEqual(r.focus(), `p${p.id}.menge`, "Fokus auf Menge");
const k2 = O.addKapitel(of, "232.51"); OF.noteTarget(of, `g${k2.grp[0].id}.titel`);
act({ ofact: "dbadd", db: a.id }).fn();
assert.strictEqual(k2.grp[0].pos[0].titel, "up-steckdose  t13", "kommt in die zuletzt bearbeitete Gruppe");
k2.grp[0].pos[0].ek = 99; k2.grp[0].pos[0].titel = "geändert";
assert.strictEqual(PD.list().find((e) => e.id === a.id).ek, 12, "Änderung in der Offerte ändert die Datenbank nicht");
assert.strictEqual(act({ ofact: "dbadd", db: "gibtsnicht" }), null);

// ---------- Anmelden: Gast-Stand geht online und gehört dem Benutzer ----------
user = "a@test";
assert.strictEqual(await PD.sync(), false);
assert.strictEqual(tab().size, 2, "Gast-Einträge hochgeladen");
assert.strictEqual(JSON.parse(mem.get("schemacad.user.positionen.v1")).user, "a@test");
calls = 0; await PD.sync(); assert.strictEqual(calls, 0, "zweiter Abgleich lädt nichts hoch");
const c = await PD.save({ titel: "Leuchte", her: "Licht AG", ek: 50 });
assert.strictEqual(c.wo, "online"); assert.ok(tab().has(c.id));

// Offline speichern und löschen: der nächste Abgleich holt es nach
down = true;
const d = await PD.save({ titel: "Offline-Position", ek: 2 });
assert.strictEqual(d.wo, "lokal");
assert.strictEqual(await PD.remove(b.id), "lokal");
assert.strictEqual(PD.count(), 3, "gelöscht sieht man sofort nicht mehr");
down = false;
await PD.sync();
assert.ok(tab().has(d.id) && !tab().has(b.id), "nachgeholt: neu hochgeladen, gelöscht entfernt");
assert.strictEqual(PD.count(), 3);

// Anderes Gerät: online geändert (neuer) und online gelöscht
tab().set(c.id, { data: { titel: "Leuchte", her: "Licht AG", ek: 55 }, at: new Date(Date.now() + 60000).toISOString() });
tab().delete(d.id);
tab().set("neu1", { data: { titel: "Vom Handy", ek: 3 }, at: new Date().toISOString() });
assert.strictEqual(await PD.sync(), true, "Stand im Browser geändert");
assert.strictEqual(PD.list().find((e) => e.id === c.id).ek, 55, "neuerer Online-Stand gewinnt");
assert.ok(!PD.list().some((e) => e.id === d.id), "anderswo gelöscht fällt weg");
assert.ok(PD.list().some((e) => e.id === "neu1"), "anderswo neu kommt dazu");
assert.strictEqual(await PD.remove("neu1"), "online"); assert.ok(!tab().has("neu1"));

// ---------- Anderer Benutzer: fremder Stand wird nie hochgeladen ----------
user = "b@test";
assert.strictEqual(await PD.sync(), true);
assert.strictEqual(PD.count(), 0, "Browser zeigt die (leere) Datenbank von b");
assert.strictEqual(db.get("b@test").size, 0, "nichts von a bei b");
user = "a@test"; await PD.sync();
assert.strictEqual(PD.count(), 2, "a bekommt seine Einträge zurück");

// Abmelden: Stand bleibt im Browser, nichts geht online
user = null; calls = 0;
assert.strictEqual(await PD.sync(), false); await PD.save({ titel: "Gast" }); assert.strictEqual(calls, 0);

console.log("Positionsdatenbank: alle Prüfungen grün.");
