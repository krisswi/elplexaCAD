// Wünsche CJ 18.10.2026, gebaut 19.10.2026 (Gruppen A bis C): Logik ohne Browser.
// Aufruf aus web-src: node test/test_wuensche.mjs [Ausgabe.dxf]
import fs from "fs";
import assert from "node:assert";
import { newDoc, parseModel, serializeModel, VERSION } from "../src/model.js";
import { exportDxf } from "../src/dxf.js";
import { parseCable, termNumbers, termCount, cleanLab } from "../src/terminals.js";
import { textItemBox } from "../src/geom.js";
import { itemsSVG, allPins, itemBBox } from "../src/render.js";
import { snapToRails, offsetPaths } from "../src/bundle.js";
import { ctrlPins, ctrlPrims, ctrlWidth, ctrlTerms, newCtrl } from "../src/steuerung.js";
import { autoWireItems } from "../src/vorlagen.js";
import { baseItems } from "../src/template.js";
import { deviceTerminals } from "../src/numbering.js";

// ---------- A1: Text drehen und ausrichten ----------
const t = { type: "text", x: 100, y: 100, h: 2, s: "ABCD" }; // Breite 4 × 2 × 0,5 = 4 mm
assert.deepStrictEqual([textItemBox(t).x0, textItemBox(t).x1], [100, 104]);
assert.deepStrictEqual([textItemBox({ ...t, al: "c" }).x0, textItemBox({ ...t, al: "c" }).x1], [98, 102], "mittig");
assert.deepStrictEqual([textItemBox({ ...t, al: "r" }).x0, textItemBox({ ...t, al: "r" }).x1], [96, 100], "rechtsbündig");
const b90 = textItemBox({ ...t, r: 90, al: "r" });
assert.ok(Math.abs(b90.y1 - 100) < 1e-9 && Math.abs(b90.y0 - 96) < 1e-9, "rechtsbündig und 90° gedreht: Text endet am Punkt");
assert.ok(itemsSVG([{ id: 1, ...t, al: "c", r: 180 }]).includes('rotate(180) scale(1,-1)" font-size="2" fill="#17212b" stroke="none" text-anchor="middle"'));
console.log("ok A1 Text");

// ---------- A3: Klemmen nach Kabelangabe ----------
assert.deepStrictEqual(parseCable("U72 2x4x0.8"), { n: 8, q: "0.8", tel: true });
assert.deepStrictEqual(parseCable("4x2x0.8"), { n: 8, q: "0.8", tel: true });
assert.deepStrictEqual(parseCable("U72 2 x 2 x 0,8"), { n: 4, q: "0.8", tel: true });
assert.deepStrictEqual(parseCable("TT 5x1.5mm2"), { n: 5, q: "1.5" }, "Energiekabel wie bisher");
assert.deepStrictEqual(parseCable("5G2.5"), { n: 5, q: "2.5" });
assert.strictEqual(parseCable("20x4x0.8"), null, "über 60 Adern");
console.log("ok A3 Kabel");

// ---------- A2: Klemmentext ----------
assert.strictEqual(cleanLab("123456|abcdefg|x"), "12345|abcde", "2 Zeilen à 5 Zeichen");
assert.strictEqual(cleanLab("L1|"), "L1");
const kl = { type: "terminals", x: 50, y: 60, cable: "3x1.5", n: 3, name: "", bmk: "X1", pe: "last" };
assert.deepStrictEqual(termNumbers(kl).map((n) => n.s), ["1", "2", "PE"]);
const own = termNumbers({ ...kl, lab: ["12345", "", "L1|N"] });
assert.deepStrictEqual(own.map((n) => n.s), ["12345", "2", "L1", "N"]);
assert.ok(own[0].h * 0.55 * 5 <= 4.6 + 1e-9, "5 Zeichen passen in die Klemme");
assert.ok(own[2].y > own[3].y && own[2].x === own[3].x, "zwei Zeilen übereinander");
const vert = termNumbers({ ...kl, lab: ["12345", "", "L1|N"], vert: true });
assert.ok(vert.every((n) => n.r === 90), "senkrecht");
assert.ok(vert[2].x < vert[3].x && vert[2].y === vert[3].y, "senkrecht: Zeilen nebeneinander");
assert.ok(vert[0].h * 0.55 * 5 <= 7.4 + 1e-9);
console.log("ok A2 Klemmentext");

// ---------- Speichern/Laden, Version 17, DXF ----------
const doc = newDoc();
doc.sheets[0].items.push({ id: 1, type: "text", x: 40, y: 100, h: 2.5, s: "Rechts", al: "r", r: 90 },
  { id: 2, type: "terminals", x: 50, y: 60, cable: "U72 2x4x0.8", n: 8, name: "", bmk: "X1", pe: "none", lab: ["12345", "", "", "", "", "", "", "A|B"], vert: true },
  { id: 3, type: "text", x: 40, y: 120, h: 2.5, s: "Links" });
doc.nextId = 10;
const txt = serializeModel(doc), back = parseModel(txt);
assert.strictEqual(JSON.parse(txt).version, 17); assert.ok(VERSION >= 18); // 19 seit 21.10.2026 (Prinzipschema)
assert.deepStrictEqual(JSON.parse(serializeModel(back)), JSON.parse(txt), "Rundlauf unverändert");
assert.strictEqual(back.sheets[0].items[0].al, "r");
assert.strictEqual(termCount(back.sheets[0].items[1]), 8);
const plain = newDoc(); plain.sheets[0].items.push({ id: 1, type: "text", x: 1, y: 1, h: 2.5, s: "x" });
assert.strictEqual(JSON.parse(serializeModel(plain)).version, 2, "ohne Neues bleibt die alte Version");
const dxf = exportDxf(back.sheets[0]);
assert.ok(/\n\s*1\nRechts\n/.test(dxf), "Text im DXF");
assert.ok(dxf.includes("12345"), "Klemmentext im DXF");
if (process.argv[2]) fs.writeFileSync(process.argv[2], dxf);
console.log("ok Datei und DXF");

// ---------- C10: Zähler 1P+N an L1, L2 oder L3, N auf N ----------
const rails = { L1: 190, L2: 185, L3: 180, N: 175, PE: 45 };
const up = (yEnd) => snapToRails(offsetPaths([[100, 150], [100, yEnd]], 2), ["L", "N"], rails).map((p) => p.at(-1)[1]);
assert.deepStrictEqual(up(185), [185, 175], "Klick auf L2: L an L2, N an N");
assert.deepStrictEqual(up(180), [180, 175], "L3");
assert.deepStrictEqual(up(190), [190, 175], "L1");
assert.deepStrictEqual(up(175), [190, 175], "Klick auf N: wie bisher L1");
const four = snapToRails(offsetPaths([[100, 150], [100, 190]], 4), ["L1", "L2", "L3", "N"], rails).map((p) => p.at(-1)[1]);
assert.deepStrictEqual(four, [190, 185, 180, 175], "4 Leiter unverändert");
console.log("ok C10 Zähler-Fang");

// ---------- C11: Steuerkasten ----------
const c = { id: 5, ...newCtrl(100, 120), top: "L, N, KNX+, KNX-", bot: "1,2,3,4,5,6,7,8,9", bmk: "12A1" };
assert.deepStrictEqual(ctrlTerms(c.top), ["L", "N", "KNX+", "KNX-"]);
assert.strictEqual(ctrlWidth(c), 50, "Breite aus 9 Klemmen");
assert.deepStrictEqual(ctrlPins(c).slice(0, 2), [{ x: 105, y: 120 }, { x: 110, y: 120 }]);
assert.deepStrictEqual(ctrlPins(c).at(-1), { x: 145, y: 95 });
assert.strictEqual(ctrlPins(c).length, 13);
assert.ok(allPins([c]).length === 13, "Pins für den Leitungsfang");
assert.ok(itemBBox(c).x0 < 100, "BMK links vom Kasten");
const svgC = itemsSVG([c]);
assert.ok(svgC.includes(">KNX+<") && svgC.includes(">12A1<") && svgC.includes(">Steuerung<"));
const dc = newDoc(); dc.sheets[0].items.push(c); dc.nextId = 10;
const tc = serializeModel(dc), bc = parseModel(tc);
assert.strictEqual(JSON.parse(tc).version, 17);
assert.deepStrictEqual(bc.sheets[0].items[0], c, "Steuerkasten Rundlauf");
const dxfC = exportDxf(bc.sheets[0]);
assert.ok(dxfC.includes("KNX-") && dxfC.includes("12A1"));
if (process.argv[2]) fs.writeFileSync(process.argv[2].replace(/\.dxf$/, "_steuerung.dxf"), dxfC);
console.log("ok C11 Steuerkasten");

// ---------- C12: Autoverkabelung ----------
let id = 100; const ids = () => ++id;
const items = baseItems(ids);
const ls4 = { id: ids(), type: "symbol", sym: "LS_4P", x: 60, y: 160, rot: 0, attrs: {} };
items.push(ls4, deviceTerminals(ls4, items, ids));
const a = autoWireItems(ls4, items, ids);
assert.strictEqual(a.items.length, 8, "4 Leitungen oben, 4 unten");
assert.deepStrictEqual(a.items.slice(0, 4).map((w) => w.pts), [[[60, 190], [60, 160]], [[65, 185], [65, 160]], [[70, 180], [70, 160]], [[75, 175], [75, 160]]], "von L1 bis N in die Pole");
assert.strictEqual(a.items[3].kind, "neutral");
assert.deepStrictEqual(a.items.slice(4).map((w) => w.pts), [0, 1, 2, 3].map((k) => [[60 + 5 * k, 140], [60 + 5 * k, 45]]), "nach unten auf die Klemmen-Punkte");
items.push(...a.items);
assert.strictEqual(autoWireItems(ls4, items, ids).items.length, 0, "zweimal: nichts doppelt");
// FI über LS: der LS hängt am FI, nicht an den Hauptlinien
const items2 = baseItems(ids);
const fi = { id: ids(), type: "symbol", sym: "FI_2P", x: 120, y: 160, rot: 0, attrs: {} }, ls = { id: ids(), type: "symbol", sym: "LS_1P", x: 120, y: 130, rot: 0, attrs: {} };
items2.push(fi, ls, deviceTerminals(ls, items2, ids));
const b1 = autoWireItems(fi, items2, ids); items2.push(...b1.items);
const b2 = autoWireItems(ls, items2, ids);
assert.deepStrictEqual(b1.items.map((w) => w.pts), [[[120, 190], [120, 160]], [[125, 175], [125, 160]], [[120, 140], [120, 130]]], "FI: L1 und N oben, unten L zum LS (N-Pol des FI ohne Ziel darunter)");
assert.deepStrictEqual(b1.skipped, ["Pol 2 unten"]);
assert.deepStrictEqual(b2.items.map((w) => w.pts), [[[120, 110], [120, 45]]], "LS: oben schon verbunden, unten zur Klemme");
assert.deepStrictEqual(autoWireItems({ ...ls4, rot: 90 }, items, ids).skipped, ["gedreht"]);
// FI und LS nicht genau übereinander (0,56 mm): keine Leitung durch das andere Gerät
const items3 = baseItems(ids);
const fi3 = { id: ids(), type: "symbol", sym: "FI_2P", x: 59.438, y: 160, rot: 0, attrs: {} }, ls3 = { id: ids(), type: "symbol", sym: "LS_1P", x: 60, y: 130, rot: 0, attrs: {} };
items3.push(fi3, ls3, deviceTerminals(fi3, items3, ids));
const c1 = autoWireItems(fi3, items3, ids); items3.push(...c1.items);
const c2 = autoWireItems(ls3, items3, ids);
const through = (w) => w.pts[0][0] > 57.5 && w.pts[0][0] < 67.5 && Math.min(w.pts[0][1], w.pts[1][1]) < 160 && Math.max(w.pts[0][1], w.pts[1][1]) > 140 || w.pts[0][0] > 57.5 && w.pts[0][0] < 62.5 && Math.min(w.pts[0][1], w.pts[1][1]) < 130 && Math.max(w.pts[0][1], w.pts[1][1]) > 110;
assert.ok(![...c1.items, ...c2.items].some(through), "keine Leitung durch ein Gerät");
assert.ok(c1.skipped.some((x) => x.includes("Gerät im Weg")) && c2.skipped.some((x) => x.includes("Gerät im Weg")));
console.log("ok C12 Autoverkabelung");
