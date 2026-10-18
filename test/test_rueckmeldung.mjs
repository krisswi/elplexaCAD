// Rückmeldung Schema CJ 16.10.2026: BMK aus Blatt und Spalte (SPD T, Zähler P), Wandlermessung in Teilen, feste Blattreihenfolge,
// Klemmenleiste ohne Klemmen. Aufruf aus web-src: node test/test_rueckmeldung.mjs [Ausgabe.dxf]
import assert from "node:assert";
import fs from "node:fs";
import { newDoc, newSheet, parseModel, serializeModel } from "../src/model.js";
import { renumberAll, renumber } from "../src/numbering.js";
import { colOf } from "../src/frame.js";
import { SYMBOL_BY_NAME, WM_X, WM2_BOX, WM2_TAPS } from "../src/symbols.js";
import { splitWandler, routeWm } from "../src/wandler.js";
import { termItems, termNumbers, termTexts } from "../src/terminals.js";
import { exportDxf } from "../src/dxf.js";
import * as T from "../src/titel.js";

const sym = (id, name, x, y, over = {}) => ({ id, type: "symbol", sym: name, x, y, rot: 0, attrs: Object.fromEntries(SYMBOL_BY_NAME[name].attrs.map((a) => [a.tag, a.def])), ...over });

// 2. BMK: Blatt + Buchstabe + Spalte, ohne Bindestrich. SPD = T, Zähler = P, je Spalte und Buchstabe gezählt
const d = newDoc(), m = d.sheets[0];
m.meta.BLATT = "3";
m.items.push(sym(1, "LS_3PN", 125, 150), sym(2, "SPD_4P", 125, 120), sym(3, "ZAEHLER_4P", 160, 150), sym(4, "LS_1P", 125, 100), sym(5, "SPD_1P", 50, 150, { attrs: { BMK: "FA1", TYP: "Typ 2" } }));
d.nextId = 100; renumberAll(d);
const bmk = (id) => m.items.find((i) => i.id === id).attrs.BMK;
assert.strictEqual(bmk(1), "3F4"); assert.strictEqual(bmk(4), "3F4.1", "zweites Schutzgerät darunter: .1");
assert.strictEqual(bmk(2), "3T4", "SPD in derselben Spalte: eigener Buchstabe, ohne .1");
assert.strictEqual(bmk(3), "3P5");
// Verschieben: BMK folgt der Spalte
m.items.find((i) => i.id === 2).x = 230; renumberAll(d);
assert.strictEqual(bmk(2), "3T7");
// Alte Datei: SPD mit eigener BMK (vor 16.10. ohne Automatik) bleibt, Vorgabe F? wird automatisch
const old = parseModel(serializeModel(d).replace('"BMK": "3T7"', '"BMK": "F?"'));
renumberAll(old);
const ob = (id) => old.sheets[0].items.find((i) => i.id === id);
assert.strictEqual(ob(5).attrs.BMK, "3T2", "nicht manuell gesetzt (nur Neuberechnung vor dem Speichern): wird automatisch");
const own = JSON.parse(serializeModel(d)); own.sheets[0].items.find((i) => i.id === 5).attrs.BMK = "FA1"; delete own.sheets[0].items.find((i) => i.id === 5).manual;
const ownDoc = parseModel(JSON.stringify(own)); renumberAll(ownDoc);
assert.strictEqual(ownDoc.sheets[0].items.find((i) => i.id === 5).attrs.BMK, "FA1", "eigene BMK aus alter Datei bleibt");
assert.strictEqual(ownDoc.sheets[0].items.find((i) => i.id === 5).manual, true);
assert.strictEqual(ob(2).attrs.BMK, "3T7");
console.log("BMK ok");

// 3. Wandlermessung nach BKW (CJ 17.10.): das Palettensymbol wird in Einzelteile zerlegt, alles einzeln bearbeitbar
const wd = newDoc(), ws = wd.sheets[0];
ws.items.push(sym(1, "ZAEHLER_4P_W", 50, 190, { attrs: { BMK: "1P1", ZAEHLERNR: "123", WANDLER: "300/5A" }, manual: true }));
wd.nextId = 2;
const wb = parseModel(serializeModel(wd)), items = wb.sheets[0].items;
const count = (s) => items.filter((i) => i.sym === s).length;
assert.deepStrictEqual(["ZW_CT", "ZW_SICH", "ZW_PK", "ZW_PK1", "ZW_ZAEHLER2"].map(count), [3, 3, 3, 1, 1]);
assert.ok(!items.some((i) => i.of !== undefined || i.wm !== undefined || i.sym === "ZAEHLER_4P_W"), "keine verknüpften Teile mehr");
const box = items.find((i) => i.sym === "ZW_ZAEHLER2");
assert.strictEqual(box.manual, true);
assert.deepStrictEqual(box.attrs, { BMK: "1P1", ZAEHLERNR: "123", WANDLER: "300/5A", TEXT: "Wirk-/Blindenergiezähler kombiniert" });
assert.deepStrictEqual([box.x, box.y], [50 + WM2_BOX.x, 190 + WM2_BOX.y]);
assert.strictEqual(SYMBOL_BY_NAME.ZW_ZAEHLER2.pins.length, 15, "10 Klemmen plus 5 unbeschriftete");
const sichs = items.filter((i) => i.sym === "ZW_SICH");
assert.deepStrictEqual(sichs.map((i) => i.attrs), [{ FBMK: "F?", FSTROM: "10A" }, { FBMK: "", FSTROM: "" }, { FBMK: "", FSTROM: "" }]);
const wires = items.filter((i) => i.type === "wire"), texts = items.filter((i) => i.type === "text");
// CJ 18.10.: N gestrichelt, Trennstriche auf Höhe der Sicherung (Abstand = Sicherungslänge 4 mm), BMK nach Spalte des mittleren Wandlers
assert.strictEqual(wires.filter((w) => w.kind === "neutral").length, 2, "zwei N-Leitungen gestrichelt");
const fy = sichs[0].y, ny = wires.filter((w) => w.pts.length === 2 && w.pts[0][1] === w.pts[1][1] && w.pts[0][0] === 50 + 41.4).map((w) => w.pts[0][1]).sort((a, b) => b - a);
assert.deepStrictEqual(ny, [fy - 0.5, fy - 4.5]);
wb.sheets[0].meta.BLATT = "3"; renumber(wb.sheets[0]);
const mid = items.filter((i) => i.sym === "ZW_CT").sort((a, b) => a.x - b.x)[1];
assert.strictEqual(sichs[0].attrs.FBMK, `3F${colOf(mid.x + 1.25)}`, "Sicherung nach mittlerem Wandler");
delete box.manual; renumber(wb.sheets[0]); assert.strictEqual(box.attrs.BMK, `3P${colOf(mid.x + 1.25)}`, "Zähler nach mittlerem Wandler");
sichs[0].manual = true; sichs[0].attrs.FBMK = "F9"; renumber(wb.sheets[0]); assert.strictEqual(sichs[0].attrs.FBMK, "F9", "von Hand bleibt");
assert.ok(wires.length > 30 && texts.length > 40 && texts.some((t) => t.r === 90 && t.s === "braun (1)"));
assert.ok(wb.nextId > Math.max(...items.map((i) => i.id)), "neue IDs unter nextId");
// Leitungsenden liegen auf Anschlüssen (Symbole), auf den Hauptlinien (Abgriffe) oder sind Striche/Trennstelle
const pins = items.filter((i) => i.type === "symbol").flatMap((it) => SYMBOL_BY_NAME[it.sym].pins.map((p) => [it.x + p.x, it.y + p.y]));
const has = (list, p) => list.some((q) => Math.abs(q[0] - p[0]) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6);
const long = wires.filter((w) => w.pts.length > 2 || Math.abs(w.pts[0][1] - w.pts[1][1]) > 2);
assert.ok(long.every((w) => has(pins, w.pts.at(-1)) && (has(pins, w.pts[0]) || has(WM2_TAPS.map((p) => [50 + p.x, 190 + p.y]), w.pts[0]))), "Leitungen verbinden Anschlüsse");
// Zum Zähler: 10 Leitungen, S1 und S2 knicken nach links, U gerade; jede Kreuzung höchstens einmal (S1 über U)
const toBox = wires.filter((w) => Math.abs(w.pts.at(-1)[1] - box.y) < 1e-6);
assert.strictEqual(toBox.length, 10);
const segs = toBox.flatMap((w, k) => w.pts.slice(1).map((q, i) => ({ k, a: w.pts[i], b: q })));
let cross = 0;
for (const h of segs) for (const v of segs) {
  if (h.k === v.k || h.a[1] !== h.b[1] || v.a[0] !== v.b[0]) continue;
  const x = v.a[0], y = h.a[1];
  if (x > Math.min(h.a[0], h.b[0]) && x < Math.max(h.a[0], h.b[0]) && y > Math.min(v.a[1], v.b[1]) && y < Math.max(v.a[1], v.b[1])) cross++;
}
assert.strictEqual(cross, 3, "je Aussenleiter eine Kreuzung S1/U");
// Speichern und Laden verlustfrei, Version 14
const txt = serializeModel(wb);
assert.strictEqual(JSON.parse(txt).version, 14);
assert.deepStrictEqual(parseModel(txt).sheets[0].items, items);
// Leitungen gestaffelt: nach rechts verschoben kreuzen und überdecken sie sich nicht
const a = (i) => [50 + WM_X[i], 165], b = (i, dx) => [50 + WM_X[i] + dx, 150];
for (const dx of [7, -9]) {
  const r = WM_X.map((_, i) => routeWm(a(i), b(i, dx), i));
  const jy = r.map((p) => p[1][1]);
  assert.strictEqual(new Set(jy).size, WM_X.length, "jeder Leiter knickt auf eigener Höhe");
  for (let i = 0; i < r.length; i++) for (let j = 0; j < r.length; j++) {
    if (i === j) continue;
    const [h0, h1] = [r[i][1], r[i][2]], xv = r[j][0][0], [y0, y1] = [r[j][1][1], r[j][0][1]]; // waagrecht i gegen senkrecht oben j
    const lo = Math.min(h0[0], h1[0]), hi = Math.max(h0[0], h1[0]);
    assert.ok(!(xv > lo && xv < hi && h0[1] > y0 && h0[1] < y1), `Leiter ${i} kreuzt ${j} (dx ${dx})`);
  }
}
assert.deepStrictEqual(routeWm([0, 10], [0, 0], 3), [[0, 10], [0, 0]], "gerade bleibt gerade");
// Zerlegen auch bei gedrehtem Symbol und mehrfach ohne Doppel
const rs = [sym(7, "ZAEHLER_4P_W", 100, 100, { rot: 90 })];
let n = 50; splitWandler(rs, () => n++);
const rb = rs.find((i) => i.sym === "ZW_ZAEHLER2");
assert.deepStrictEqual([rb.x, rb.y, rb.rot], [100 - WM2_BOX.y, 100 + WM2_BOX.x, 90]);
assert.ok(rs.filter((i) => i.type === "text" && i.s.startsWith("braun (")).every((t) => t.r === 180));
assert.strictEqual(splitWandler(rs, () => n++), false);
// Zähler bekommt automatisch P
const auto = parseModel(serializeModel(wd).replace('"manual": true', '"manual": false').replace('"BMK": "1P1"', '"BMK": "P?"'));
auto.sheets[0].meta.BLATT = "4"; renumberAll(auto);
assert.match(auto.sheets[0].items.find((i) => i.sym === "ZW_ZAEHLER2").attrs.BMK, /^4P\d$/);
const dxf = exportDxf(wb.sheets[0]);
assert.ok(dxf.includes("ZW_PK") && dxf.includes("ZW_ZAEHLER2") && dxf.includes("braun (1)"));
console.log("Wandlermessung ok");

// 4. Blattreihenfolge: Titelseite, Inhalt, Schema, Legende, Disposition, Stringplan, Stringübersicht
const od = newDoc();
od.sheets = [Object.assign(newSheet("pvtab")), Object.assign(newSheet("pv"), { sid: 1 }), Object.assign(newSheet("dispo"), { sid: 2 }), newSheet(), newSheet()];
od.sheets[3].meta.BLATT = "3"; od.sheets[4].meta.BLATT = "4";
T.ensureDeck(od, null, { shift: false });
assert.deepStrictEqual(od.sheets.map((s) => s.kind || "schema"), ["title", "toc", "schema", "schema", "legend", "dispo", "pv", "pvtab"]);
assert.deepStrictEqual(od.sheets.slice(2, 4).map((s) => s.meta.BLATT), ["3", "4"], "Reihenfolge der Schemablätter bleibt");
od.sheets.push(Object.assign(newSheet(), { meta: { ...newSheet().meta, BLATT: "5" } })); T.syncDeck(od);
assert.deepStrictEqual(od.sheets.map((s) => s.kind || "schema"), ["title", "toc", "schema", "schema", "schema", "legend", "dispo", "pv", "pvtab"]);
assert.strictEqual(od.sheets[5].meta.BLATT, "6");
console.log("Blattreihenfolge ok");

// 5. Klemmenleiste ohne Klemmen: keine Klemmen, BMK, Kabel und Bezeichnung bleiben, verlustfrei gespeichert
const kd = newDoc(), ks = kd.sheets[0];
ks.items.push({ id: 1, type: "terminals", x: 60, y: 45, cable: "5x1.5mm2", n: 5, name: "Küche", bmk: "5X2", pe: "last", noterm: true });
kd.nextId = 2;
const kb = parseModel(serializeModel(kd));
assert.deepStrictEqual(kb.sheets[0].items, ks.items); assert.strictEqual(JSON.parse(serializeModel(kd)).version, 10);
assert.deepStrictEqual(termItems(ks.items[0]), []); assert.deepStrictEqual(termNumbers(ks.items[0]), []);
assert.deepStrictEqual(termTexts(ks.items[0]).map((t) => t.s), ["5X2", "5x1.5mm2", "Küche"]);
const kx = exportDxf(ks);
assert.ok(!/\nKLEMME_R\n/.test(kx.split("ENTITIES")[1] ?? "") && kx.includes("Küche") && kx.includes("5X2"));
delete ks.items[0].noterm; assert.strictEqual(termItems(ks.items[0]).length, 5);
console.log("Klemmen ok");

fs.writeFileSync(process.argv[2] || "test_rueckmeldung.dxf", dxf);
console.log("Rückmeldung: alle Tests ok");
