// Offerte Schritt 4 (CJ 26.10.2026): Sollwert-Einstellungen und IC-Zeiten beim Benutzer (sollwerte.js). Ohne Browser, ohne Netz:
// localStorage und der Online-Adapter sind Attrappen, alle Werte erfunden. Prüft Säubern (leere Felder fallen weg), was eine neue Offerte
// übernimmt, die IC-Tabelle, die vorbelegte Zeit der Position (überschreibbar) und Speichern/Abgleich unter eigenen Namen.
// Die Rechnung der Preisbasis (Zeilenfolge, Prüfwerte der Zusammenfassung Final) kommt nach der Rückmeldung von CJ dazu.
import assert from "node:assert";
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const A = await import("../src/ablage.js");
const S = await import("../src/sollwerte.js");
const O = await import("../src/offerte.js");
const OF = await import("../src/offedit.js");
const PD = await import("../src/positionen.js");

// ---------- Säubern: jedes Feld darf leer bleiben, Unbekanntes und Ungültiges fällt weg ----------
assert.deepStrictEqual(S.cleanSollwerte(null), { modus: "einfach" });
assert.deepStrictEqual(S.cleanSollwerte({ modus: "x", ansatz: 90, fak: -1, pzk: "50", lohn: { eli: 40, x: 1, mon: NaN }, tbc: {}, rolle: "chef", art: "n", y: 2 }),
  { modus: "einfach", ansatz: 90, lohn: { eli: 40 }, art: "n" }, "nur gültige Zahlen, leere Gruppen fallen weg");

// ---------- Was eine neue Offerte übernimmt ----------
assert.deepStrictEqual(S.offerDefaults(S.cleanSollwerte({})), {}, "ohne Einstellungen: Standard der Offerte");
assert.deepStrictEqual(S.offerDefaults(S.cleanSollwerte({ ansatz: 95, fak: 1.3 })), { ansatz: 95, fak: 1.3 }, "einfach: direkt");
assert.deepStrictEqual(S.offerDefaults(S.cleanSollwerte({ ansatz: 95, fak: 0 })), { ansatz: 95 }, "Faktor 0 gilt nicht");
assert.deepStrictEqual(S.offerDefaults(S.cleanSollwerte({ modus: "erweitert", ansatz: 95, fak: 1.3, pzk: 50 })), { ansatz: 95, fak: 1.3 }, "erweitert ohne Lohn und Materialangaben: die direkten Werte");
assert.strictEqual(S.rolle(S.cleanSollwerte({ modus: "erweitert" }), "eli"), null, "ohne Lohn keine Rechnung");
assert.ok(S.offerDefaults(S.cleanSollwerte({ modus: "erweitert", lohn: { eli: 40 } })).ansatz === 40, "nur Lohn: übrige Felder leer = 0");
const of = O.newOfferte(); Object.assign(of, S.offerDefaults(S.cleanSollwerte({ ansatz: 95, fak: 1.3 })));
of.ansatz = 100; assert.deepStrictEqual([of.ansatz, of.fak], [100, 1.3], "in der Offerte änderbar");

// ---------- IC-Tabelle: Code ohne Leerzeichen, doppelte fallen weg, Zeit darf fehlen ----------
assert.deepStrictEqual(S.cleanIcZeiten({ rows: [{ ic: " 2 2", std: 0.5, text: " Dose " }, { ic: "22", std: 9 }, { ic: "", std: 1 }, { ic: "31" }, { ic: "13", std: -1 }, null] }),
  { rows: [{ ic: "22", std: 0.5, text: "Dose" }, { ic: "31" }, { ic: "13" }] });
assert.strictEqual(await S.saveIcZeiten({ rows: [{ ic: "22", std: 0.5 }, { ic: "23", std: 0.8 }, { ic: "31" }] }), "lokal");
assert.deepStrictEqual([S.icZeit("22"), S.icZeit(" 23 "), S.icZeit("31"), S.icZeit("99"), S.icZeit("")], [0.5, 0.8, undefined, undefined, undefined]);

// ---------- Zeit der Position aus dem IC-Code vorbelegt, überschreibbar ----------
const k = O.addKapitel(of, "232"), g = k.grp[0], p = O.addPosition(of, g, { titel: "Steckdose", menge: 1 });
const set = (f, v) => OF.apply(of, { dataset: { of: `p${p.id}.${f}` }, value: v, type: "text" });
set("ic", "22"); assert.deepStrictEqual([p.ic, p.std], ["22", 0.5], "leere Zeit: aus der Tabelle");
set("ic", "23"); assert.strictEqual(p.std, 0.8, "Zeit noch aus der Tabelle: folgt dem neuen IC-Code");
set("std", "0.6"); set("ic", "22"); assert.strictEqual(p.std, 0.6, "eigene Zeit bleibt");
set("ic", "99"); assert.deepStrictEqual([p.ic, p.std], ["99", 0.6], "IC-Code ohne Zeit: Zeit bleibt");
set("ic", ""); assert.deepStrictEqual([p.ic, p.std], [undefined, 0.6], "IC-Code leeren");
const q = O.addPosition(of, g, { titel: "Schalter", std: 0.3 }); OF.apply(of, { dataset: { of: `p${q.id}.ic` }, value: "22", type: "text" });
assert.strictEqual(q.std, 0.3, "Position mit eigener Zeit bleibt");

// Kopie aus der Positionsdatenbank: Zeit aus dem IC-Code, wenn der Eintrag keine hat
await PD.save({ titel: "Abzweigdose", ic: "23" }); await PD.save({ titel: "Leuchte", ic: "22", std: 1 });
const add = (t) => { const e = PD.list().find((x) => x.titel === t), r = OF.action(of, { dataset: { ofact: "dbadd", db: e.id } }); r.fn(); return O.findPos(of, Number(r.focus().match(/\d+/)[0])).p; };
assert.strictEqual(add("Abzweigdose").std, 0.8);
assert.strictEqual(add("Leuchte").std, 1, "Zeit des Eintrags gilt");

// ---------- Speichern und Abgleich unter eigenen Namen (sollwerte, iczeiten) ----------
const db = new Map(); let user = null;
A.setRemote({ user: () => user, async load(n) { return db.get(`${user}/${n}`) ?? null; }, async save(n, data, at) { db.set(`${user}/${n}`, { data: structuredClone(data), at }); } });
assert.strictEqual(await S.saveSollwerte({ ansatz: 95, x: 1 }), "lokal");
assert.deepStrictEqual(S.loadSollwerte(), { modus: "einfach", ansatz: 95 });
user = "a@test";
assert.strictEqual(await S.syncSollwerte(), false, "Gast-Stand geht online");
assert.deepStrictEqual([db.get("a@test/sollwerte").data.ansatz, db.get("a@test/iczeiten").data.rows.length], [95, 3]);
db.set("a@test/sollwerte", { data: { modus: "erweitert", ansatz: 99 }, at: new Date(Date.now() + 60000).toISOString() });
assert.strictEqual(await S.syncSollwerte(), true, "neuerer Online-Stand gewinnt");
assert.deepStrictEqual(S.loadSollwerte(), { modus: "erweitert", ansatz: 99 });
assert.ok(mem.has("schemacad.user.sollwerte.v1") && mem.has("schemacad.user.iczeiten.v1"));

console.log("Sollwerte und IC-Zeiten: alle Prüfungen bestanden.");
