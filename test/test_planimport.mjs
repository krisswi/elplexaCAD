// Plan-Import (CJ 30.10.2026, nur elplexaCAD): Datei lesen, unbekannte Symbole und Farben, Auswahl der Ebenen, Versatz, Drehung, Einfügen.
// Aufruf: node test/test_planimport.mjs. Testdaten erfunden (keine Kundendaten).
import assert from "node:assert";
globalThis.ELPLEXA = true; // vor dem Laden: model.js nimmt «plan» nur im elplexa-Bau auf
const M = await import("../src/model.js");
const P = await import("../src/plan.js");
const I = await import("../src/planimport.js");

// Stockwerk wie vom Skill «plan-aufbereiten»: Hintergrund (gesperrt), Apparate (aktiv), Leitungen, Beschriftung
const layers = [{ id: "bg", name: "Hintergrund", show: true, lock: true }, { id: "app", name: "Apparate", show: true, lock: false }, { id: "ltg", name: "Leitungen", show: true, lock: false }, { id: "txt", name: "Beschriftung", show: true, lock: false }];
const items = [
  { id: 1, type: "wall", layer: "bg", a: [0, 0], b: [4000, 0], d: 150, mat: "mauer" },
  { id: 2, type: "opening", wall: 1, t: 500, w: 900, kind: "tuer", hinge: "l", side: 1 },
  { id: 3, type: "dim", layer: "bg", a: [0, 0], b: [4000, 0], off: -500, ref: 1 },
  { id: 4, type: "sym", layer: "app", key: "STD", at: [1000, 200], r: 0 },
  { id: 5, type: "sym", layer: "app", key: "ALT_DOSE", at: [2000, 200], r: 90 },
  { id: 6, type: "sym", layer: "app", key: "ALT_DOSE", at: [3000, 200], r: 0, col: "#123456" },
  { id: 7, type: "line", layer: "ltg", pts: [[1000, 200], [1000, 1000], [2000, 1000]], kind: "decke", col: "#123456" },
  { id: 8, type: "ader", line: 7, t: 0.5, txt: "3" },
  { id: 9, type: "text", layer: "txt", at: [2000, 1500], txt: "Küche" },
  { id: 10, type: "shape", layer: "txt", k: "rect", x: 100, y: 100, w: 400, h: 200 },
];
const file = (extra = {}) => JSON.stringify({ format: "schemacad", version: 33, nextId: 11, sheets: [{ kind: "plan", sid: 99, meta: { BLATT: "1" }, paper: { size: "A3", quer: true, den: 50 }, layers, alay: "app", items }], ...extra });

// ---------- Datei lesen ----------
assert.throws(() => I.readImport("{kaputt"), /kein gültiges JSON/);
assert.throws(() => I.readImport(JSON.stringify({ format: "schemacad", version: 2, sheets: [{ meta: {}, items: [] }] })), /keinen Plan/);
assert.throws(() => I.readImport("[]"), /keine elplexaCAD-Datei/);
const { o, plans } = I.readImport(file());
assert.deepStrictEqual(plans, [{ i: 0, label: "Plan 1", n: 10 }]);

// ---------- Unbekannte Symbole und Farben ----------
const sc = I.scanImport(o, 0);
assert.deepStrictEqual(sc.syms, [{ k: "ALT_DOSE", n: 2 }]);
assert.deepStrictEqual(sc.cols, [{ k: "#123456", n: 2 }]);
assert.ok(I.knownCol("#0068c9") && I.knownCol("#3fbbeb") && !I.knownCol("#123456"), "Palette und bisherige Töne gelten als bekannt");
// ohne Zuordnung lehnt parseModel die Datei ab, deshalb fällt das unbekannte Symbol beim Import weg
assert.throws(() => M.parseModel(file()), /unbekanntes oder defektes Objekt/);
const skip = I.prepareImport(o, 0, {}, {});
assert.strictEqual(skip.skipped, 2);
assert.strictEqual(skip.sheet.items.filter((i) => i.type === "sym").length, 1);
assert.strictEqual(skip.sheet.items.find((i) => i.type === "line").col, "#123456", "Farbe überspringen = bleibt");
// Zuordnung gilt für alle Vorkommen
const map = I.prepareImport(o, 0, { ALT_DOSE: "STD3" }, { "#123456": "#d4141c" });
assert.strictEqual(map.skipped, 0);
assert.deepStrictEqual(map.sheet.items.filter((i) => i.type === "sym").map((i) => i.key), ["STD", "STD3", "STD3"]);
assert.ok(map.sheet.items.filter((i) => i.col !== undefined).every((i) => i.col === "#d4141c"));
assert.strictEqual(o.sheets[0].items[4].key, "ALT_DOSE", "die gelesene Datei bleibt unverändert");
// neuere Datei: verständliche Meldung von parseModel
assert.throws(() => I.prepareImport(I.readImport(file()).o && { ...o, version: 999 }, 0, { ALT_DOSE: "STD" }), /neueren Version/);

// ---------- Ebenen und Auswahl ----------
const src = map.sheet;
assert.deepStrictEqual(I.layerCounts(src).map((l) => [l.name, l.n]), [["Hintergrund", 2], ["Apparate", 3], ["Leitungen", 1], ["Beschriftung", 2]]);
const pk = I.pickItems(src, new Set(["bg"]));
assert.deepStrictEqual(pk.map((i) => i.type).sort(), ["dim", "opening", "wall"], "Öffnung kommt mit ihrer Wand");
assert.deepStrictEqual(I.pickItems(src, new Set(["ltg"])).map((i) => i.type), ["line", "ader"], "Aderzahl kommt mit ihrer Leitung");

// ---------- Versatz und Drehung um den Nullpunkt der Datei ----------
const one = (it, at, rot) => I.placeItems([JSON.parse(JSON.stringify(it))], at, rot)[0];
assert.deepStrictEqual(one(items[0], [100, 50], 0).b, [4100, 50]);
assert.deepStrictEqual(one(items[0], [0, 0], 90).b, [0, 4000]);
assert.deepStrictEqual(one(items[0], [1000, 0], 180).b, [-3000, 0]);
assert.deepStrictEqual(one(items[0], [0, 0], 270).b, [0, -4000]);
assert.deepStrictEqual([one(items[3], [0, 0], 90).at, one(items[3], [0, 0], 90).r], [[-200, 1000], 90]);
assert.strictEqual(one(items[4], [0, 0], 270).r, 0, "Symbol 90° + 270° = 0°");
assert.strictEqual(one(items[8], [0, 0], 90).r, 90, "Text dreht mit");
assert.strictEqual(one(items[8], [0, 0], 0).r, undefined, "Text ohne Drehung bleibt ohne r");
assert.deepStrictEqual(one(items[6], [0, 0], 90).pts, [[-200, 1000], [-1000, 1000], [-1000, 2000]]);
const rc = one(items[9], [0, 0], 90);
assert.deepStrictEqual([rc.x, rc.y, rc.w, rc.h], [-300, 100, 200, 400], "Rechteck: Ecken gedreht, Breite und Höhe getauscht");
assert.deepStrictEqual(one(items[1], [500, 500], 90), items[1], "Öffnung hängt an der Wand, bleibt");
assert.deepStrictEqual(I.freeName("Apparate", ["Apparate", "Apparate 2"]), "Apparate 3");
assert.deepStrictEqual(I.freeName("Neu", ["Apparate"]), "Neu");

// ---------- In offenen Plan einfügen ----------
const doc = M.parseModel(JSON.stringify({ format: "schemacad", version: 33, nextId: 50, sheets: [{ kind: "plan", sid: 1, meta: { BLATT: "1" }, layers: [{ id: "bg", name: "Hintergrund" }, { id: "l1", name: "Apparate" }], alay: "l1", items: [{ id: 40, type: "sym", layer: "l1", key: "STD", at: [0, 0], r: 0 }] }] }));
const tg = doc.sheets[0];
let nid = 100; const nextId = () => nid++;
const res = I.mergePlan(tg, src, new Set(["bg", "app", "ltg"]), [1000, 2000], 90, nextId);
assert.deepStrictEqual(tg.layers.map((l) => [l.id, l.name, l.lock]), [["bg", "Hintergrund", true], ["l1", "Apparate", false], ["l2", "Apparate 2", false], ["l3", "Leitungen", false]], "leerer Hintergrund nimmt den Grundriss, Namen mit Zähler, gesperrt bleibt gesperrt");
assert.strictEqual(tg.alay, "l2", "aktive Ebene der Datei wird aktiv");
assert.strictEqual(res.items.length, 8);
const w = tg.items.find((i) => i.type === "wall"), op = tg.items.find((i) => i.type === "opening"), dm = tg.items.find((i) => i.type === "dim");
assert.deepStrictEqual([w.a, w.b], [[1000, 2000], [1000, 6000]]);
assert.strictEqual(op.wall, w.id); assert.strictEqual(dm.ref, w.id);
assert.deepStrictEqual(dm.b, w.b, "Mass folgt der Wand");
const ln = tg.items.find((i) => i.type === "line"), ad = tg.items.find((i) => i.type === "ader");
assert.strictEqual(ad.line, ln.id);
assert.ok(res.items.every((i) => i.id >= 100), "neue ids");
assert.strictEqual(new Set(tg.items.map((i) => i.id)).size, tg.items.length, "ids eindeutig");
// Rundlauf: der Plan mit Import speichert und lädt gleich
const again = M.parseModel(M.serializeModel(doc));
assert.deepStrictEqual(again.sheets[0].items, tg.items);
assert.deepStrictEqual(again.sheets[0].layers, tg.layers);
// Hintergrund schon belegt: neue Ebene «Hintergrund 2»
I.mergePlan(tg, src, new Set(["bg"]), [0, 0], 0, nextId);
assert.strictEqual(tg.layers.at(-1).name, "Hintergrund 2");
// zu viele Ebenen: Meldung, nichts verändert
const before = JSON.stringify(tg);
for (let n = 0; n < 4; n++) P.addLayer(tg, "X");
const full = JSON.stringify(tg);
assert.throws(() => I.mergePlan(tg, src, new Set(["app", "ltg", "txt"]), [0, 0], 0, nextId), /Zu viele Ebenen/);
assert.strictEqual(JSON.stringify(tg), full, "bei Fehler nichts verändert");
assert.ok(before.length < full.length);
console.log("test_planimport: alles ok");
