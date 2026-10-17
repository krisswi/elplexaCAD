// Hauptlinien neu (hauptlinien.js, 16.10.2026): Gruppe L1 bis N über den Blattrand, Ziel ändern, Abschlussstriche, alte Dateien. Aufruf aus web-src: node test/test_hauptlinien.mjs
import assert from "node:assert";
import { newDoc, newSheet, parseModel, serializeModel } from "../src/model.js";
import { renumberAll } from "../src/numbering.js";
import { baseItems } from "../src/template.js";
import { railStubs, groupWires, REF_L, REF_R, mainState } from "../src/hauptlinien.js";
import { exportDxf } from "../src/dxf.js";
import { itemsSVG } from "../src/render.js";
import { X0, X1 } from "../src/template.js";
import { COL_CENTERS } from "../src/frame.js";

// Dokument: Blätter 3 bis 7 mit Grundverkabelung, dazwischen eine Disposition und eine Legende (werden übersprungen)
function makeDoc(nos = ["3", "4", "5", "6", "7"]) {
  const d = newDoc(); d.sheets = [];
  const nextId = () => d.nextId++;
  for (const no of nos) { const sh = newSheet(); sh.meta.BLATT = no; sh.items.push(...baseItems(nextId)); d.sheets.push(sh); }
  const dp = newSheet("dispo"); dp.sid = nextId(); dp.meta.BLATT = "1"; d.sheets.splice(2, 0, dp);
  d.sheets.push(Object.assign(newSheet("legend"), { show: ["BMK"] }));
  renumberAll(d);
  return d;
}
const schema = (d) => d.sheets.filter((s) => !s.kind);
const ref = (sh, side) => sh.items.find((i) => i.main === side);
const ziel = (sh, side) => ref(sh, side)?.attrs.ZIEL;

// 1. Automatisch: jedes Blatt weiter aufs nächste Schemablatt, Disposition übersprungen
let d = makeDoc(), [s3, s4, s5, s6, s7] = schema(d);
assert.deepStrictEqual([s3, s4, s5, s6, s7].map((s) => !!ref(s, "r")), [true, true, true, true, false], "abgehend auf allen ausser dem letzten");
assert.deepStrictEqual([s3, s4, s5, s6, s7].map((s) => !!ref(s, "l")), [false, true, true, true, true], "ankommend auf allen ausser dem ersten");
assert.strictEqual(ref(s3, "r").sym, "VOUTR_4P"); assert.strictEqual(ref(s4, "l").sym, "VINL_4P");
assert.deepStrictEqual([ref(s3, "r").x, ref(s4, "l").x], [281, 20], "Pfeile innen am Rahmen: rechts Spitze bei 285 (2 mm Luft), links Spitze am Linienanfang 20 (CJ 16.10.)");
assert.strictEqual(ref(s3, "r").link, ref(s4, "l").id); assert.strictEqual(ref(s4, "l").link, ref(s3, "r").id);
assert.match(ziel(s3, "r"), /^4\./); assert.match(ziel(s4, "l"), /^3\./);
assert.strictEqual(ref(s3, "r").y, 175, "Verweis sitzt auf N, Pole gehen hoch bis L1");
const ws3 = groupWires(s3.items), ws7 = groupWires(s7.items);
assert.deepStrictEqual(ws3.map((w) => [w.pts[0][0], w.pts.at(-1)[0]]), Array(4).fill([X0, REF_R]), "erstes Blatt: Beginn am Rand, Ende beim Verweis");
assert.deepStrictEqual(ws7.map((w) => [w.pts[0][0], w.pts.at(-1)[0]]), Array(4).fill([REF_L, X1]));
const pe = s3.items.find((w) => w.kind === "pe"); assert.strictEqual(pe.ends, undefined, "PE wie heute");
assert.strictEqual(railStubs(s3.items).length, 0, "Weitergehend: keine Striche");
assert.strictEqual(railStubs(s7.items).length, 4, "letztes Blatt: Linie endet, ein Strich je Leiter");
assert.ok(railStubs(s7.items).every((t) => t.x1 === X1 && t.x2 === X1 && t.y2 - t.y1 > 2), "Querstrich am Blattrand");
console.log("Automatische Verweise ok");

// 2. Ziel ändern: Blatt 3 geht erst auf Blatt 7. 4 bis 6 haben eine eigene Grundverkabelung, 6 endet (7 ist belegt)
s7.sid = 900; s3.main = { l: "auto", r: "sheet", to: 900 }; renumberAll(d);
assert.strictEqual(ref(s3, "r").link, ref(s7, "l").id); assert.match(ziel(s3, "r"), /^7\./); assert.match(ziel(s7, "l"), /^3\./);
assert.ok(!ref(s4, "l"), "Blatt 4: niemand führt hierher, kein ankommender Verweis");
assert.deepStrictEqual(groupWires(s4.items).map((w) => w.pts[0][0]), Array(4).fill(X0));
assert.ok(ref(s4, "r") && ref(s5, "l") && ref(s5, "r") && ref(s6, "l"), "4 bis 6 unter sich verbunden");
assert.ok(!ref(s6, "r") && railStubs(s6.items).length === 4, "Blatt 6 endet mit Strichen");
assert.strictEqual(mainState(d, s3).to, s7); assert.strictEqual(mainState(d, s7).from, s3);
const ids = new Set(d.sheets.flatMap((s) => s.items).map((i) => i.id)); assert.strictEqual(ids.size, d.sheets.flatMap((s) => s.items).length, "IDs eindeutig");
console.log("Ziel ändern ok");

// 3. Endet bei Spalte 5 / am Blattrand / beginnt hier
s3.main = { l: "auto", r: "col:5" }; renumberAll(d);
assert.ok(!ref(s3, "r")); assert.deepStrictEqual(groupWires(s3.items).map((w) => w.pts.at(-1)[0]), Array(4).fill(COL_CENTERS[4]));
assert.ok(railStubs(s3.items).every((t) => t.x1 === COL_CENTERS[4]) && railStubs(s3.items).length === 4);
assert.ok(!ref(s4, "l"), "3 endet, 4 ohne ankommenden Verweis");
s5.main.l = "start"; renumberAll(d);
assert.ok(!ref(s4, "r") && !ref(s5, "l") && railStubs(s4.items).length === 4, "5 beginnt selbst: 4 endet am Rand");
s5.main.l = "col:2"; renumberAll(d);
assert.deepStrictEqual(groupWires(s5.items).map((w) => w.pts[0][0]), Array(4).fill(COL_CENTERS[1]));
assert.strictEqual(railStubs(s5.items).filter((t) => t.x1 === COL_CENTERS[1]).length, 4, "Beginn bei Spalte: auch Striche");
console.log("Enden ok");

// 4. Speichern und Laden: Version 7, unverändert
const txt = serializeModel(d), d2 = parseModel(txt);
assert.strictEqual(JSON.parse(txt).version, 7);
assert.deepStrictEqual(JSON.parse(serializeModel(d2)).sheets, JSON.parse(txt).sheets, "Round-Trip ohne Änderung");
// DXF und Bild: Striche als Linien auf SCH_NETZ
const dxf = exportDxf(s4);
const lines = dxf.split("\n").map((l) => l.trim());
let stubLines = 0;
for (let k = 0; k < lines.length - 12; k++) if (lines[k] === "LINE" && lines.slice(k, k + 12).includes("SCH_NETZ") && lines.slice(k, k + 30).includes(String(X1))) stubLines++;
assert.ok(stubLines >= 4, "4 Abschlussstriche im DXF, gefunden " + stubLines);
assert.ok(itemsSVG(s4.items).split("<polyline").length - 1 >= 5 + 4, "Striche im Bild (auch PDF)");
console.log("Datei, DXF, Bild ok");

// 5. Alte Datei (Version 6): Gruppe mit Enden „ref“ und Einzelverweisen, verknüpft von Blatt 3 auf Blatt 5
const old = makeDoc(["3", "4", "5"]); const [o3, , o5] = schema(old);
for (const sh of schema(old)) { sh.items = sh.items.filter((i) => !i.main); delete sh.main; delete sh.sid; for (const w of sh.items) delete w.ends; }
const g3 = groupWires(o3.items), g5 = groupWires(o5.items);
let id = 5000;
for (let k = 0; k < 4; k++) {
  const a = { id: id++, type: "symbol", sym: "VOUT_1P", x: REF_R, y: g3[k].pts[0][1], rot: 90, attrs: { ZIEL: "x" }, rail: g3[k].id, side: "r", rname: "L" };
  const b = { id: id++, type: "symbol", sym: "VIN_1P", x: REF_L - 5, y: g5[k].pts[0][1], rot: 90, attrs: { ZIEL: "x" }, rail: g5[k].id, side: "l", rname: "L" };
  a.link = b.id; b.link = a.id; o3.items.push(a); o5.items.push(b);
  g3[k].ends = { l: "edge", r: "ref" }; g5[k].ends = { l: "ref", r: "col:6" };
}
const oldTxt = JSON.stringify({ ...JSON.parse(serializeModel(old)), version: 6 });
const conv = parseModel(oldTxt), [c3, c4, c5] = schema(conv);
assert.ok(conv.sheets.flatMap((s) => s.items).every((i) => i.rail === undefined), "alte Einzelverweise der Gruppe entfernt");
assert.deepStrictEqual(c3.main, { l: "auto", r: "sheet", to: c5.sid }, "Verknüpfung 3 → 5 bleibt als Ziel");
assert.deepStrictEqual(c5.main, { l: "auto", r: "col:6" });
assert.strictEqual(ref(c3, "r").link, ref(c5, "l").id);
assert.ok(!ref(c4, "l") && !ref(c4, "r") && railStubs(c4.items).length === 4, "Blatt 4 dazwischen: eigene Grundverkabelung, endet");
assert.strictEqual(railStubs(c5.items).length, 4);
const again = parseModel(serializeModel(conv)); assert.deepStrictEqual(JSON.parse(serializeModel(again)), JSON.parse(serializeModel(conv)), "umgerechnete Datei bleibt stabil");
// Weitere Hauptlinie mit eigenem Ende bei Spalte: Strich, Gruppe unberührt
const st = { id: 7000, type: "wire", kind: "netz", pts: [[X0, 170], [COL_CENTERS[2], 170]], tag: "grund", ends: { l: "edge", r: "col:3" } };
c4.items.push(st, { id: 7001, type: "text", x: 12, y: 169, h: 2.5, s: "L1_ST", tag: "grund" }); renumberAll(conv);
assert.strictEqual(groupWires(c4.items).length, 4); assert.strictEqual(railStubs(c4.items).filter((t) => t.w === st).length, 1);
// Blatt ohne Grundverkabelung wird übersprungen
c4.items = c4.items.filter((i) => i.tag !== "grund" && !i.main); renumberAll(conv);
assert.ok(!c4.main && !c4.items.some((i) => i.main));
console.log("Alte Dateien ok");
console.log("Hauptlinien: alle Tests ok");
