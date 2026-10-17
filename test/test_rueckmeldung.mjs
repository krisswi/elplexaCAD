// Rückmeldung Schema CJ 16.10.2026: BMK aus Blatt und Spalte (SPD T, Zähler P), Wandlermessung in Teilen, feste Blattreihenfolge,
// Klemmenleiste ohne Klemmen. Aufruf aus web-src: node test/test_rueckmeldung.mjs [Ausgabe.dxf]
import assert from "node:assert";
import fs from "node:fs";
import { newDoc, newSheet, parseModel, serializeModel } from "../src/model.js";
import { renumberAll } from "../src/numbering.js";
import { SYMBOL_BY_NAME, WM_X, WM_PIN_Y, WM_BOX_Y } from "../src/symbols.js";
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

// 3. Wandlermessung: altes Symbol wird beim Öffnen in Wandlerteil, Zähler und 10 Leitungen zerlegt
const wd = newDoc(), ws = wd.sheets[0];
ws.items.push(sym(1, "ZAEHLER_4P_W", 50, 190, { attrs: { BMK: "1P1", ZAEHLERNR: "123", WANDLER: "300/5A" }, manual: true }));
wd.nextId = 2;
const wb = parseModel(serializeModel(wd)), items = wb.sheets[0].items;
assert.strictEqual(items.length, 12);
const [tr, box] = items;
assert.strictEqual(tr.sym, "ZW_WANDLER"); assert.strictEqual(tr.id, 1); assert.deepStrictEqual(tr.attrs, { FBMK: "F?", FSTROM: "10A", QI: "Strompfad 4 mm²", QU: "Spannungspfad 2,5 mm²", QK: "Steuerleiter 1,5 mm²" });
assert.strictEqual(tr.manual, undefined);
assert.strictEqual(box.sym, "ZW_ZAEHLER"); assert.strictEqual(box.of, 1); assert.strictEqual(box.manual, true);
assert.deepStrictEqual(box.attrs, { BMK: "1P1", ZAEHLERNR: "123", WANDLER: "300/5A", TEXT: "Wirk-/Blindenergiezähler kombiniert" });
assert.deepStrictEqual([box.x, box.y], [50, 190 + WM_BOX_Y]);
const wires = items.slice(2);
assert.ok(wires.every((w, i) => w.type === "wire" && w.of === 1 && w.wm === i && w.pts[0][0] === 50 + WM_X[i] && w.pts[0][1] === 190 + WM_PIN_Y && w.pts[1][1] === 190 + WM_BOX_Y));
assert.ok(wb.nextId > Math.max(...items.map((i) => i.id)), "neue IDs unter nextId");
// Pins: Leitungsenden liegen auf den Pins beider Teile
const pins = (it) => SYMBOL_BY_NAME[it.sym].pins.map((p) => [it.x + p.x, it.y + p.y]);
const has = (list, p) => list.some((q) => Math.abs(q[0] - p[0]) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6);
assert.ok(wires.every((w) => has(pins(tr), w.pts[0]) && has(pins(box), w.pts[1])));
// Speichern und Laden der neuen Form verlustfrei, Version 10
const txt = serializeModel(wb);
assert.strictEqual(JSON.parse(txt).version, 10);
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
assert.strictEqual(rs.length, 12); assert.deepStrictEqual([rs[1].x, rs[1].y], [100 - WM_BOX_Y, 100]);
assert.strictEqual(splitWandler(rs, () => n++), false);
// Zähler bekommt automatisch P, Sicherungen tragen BMK und Nennstrom
const auto = parseModel(serializeModel(wd).replace('"manual": true', '"manual": false').replace('"BMK": "1P1"', '"BMK": "P?"'));
auto.sheets[0].meta.BLATT = "4"; renumberAll(auto);
assert.match(auto.sheets[0].items[1].attrs.BMK, /^4P\d$/);
assert.ok(SYMBOL_BY_NAME.ZW_WANDLER.attrs.some((x) => x.tag === "FBMK") && SYMBOL_BY_NAME.ZW_WANDLER.attrs.some((x) => x.tag === "FSTROM"));
const dxf = exportDxf(wb.sheets[0]);
assert.ok(dxf.includes("ZW_WANDLER") && dxf.includes("ZW_ZAEHLER") && dxf.includes("Wandlermessung"));
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
