// Eingangsverdrahtung per Knopf und Grössen von Zähler und Wandlermessung (CJ 16.10.2026).
// Aufruf aus web-src: node test/test_eingang.mjs [Ausgabe.dxf]
import assert from "node:assert";
import fs from "node:fs";
import { newDoc, parseModel, serializeModel } from "../src/model.js";
import { renumberAll } from "../src/numbering.js";
import { baseItems } from "../src/template.js";
import { SYMBOL_BY_NAME, WM_X, WM_PIN_Y } from "../src/symbols.js";
import { insertFeed, FEED_PE_Y } from "../src/eingang.js";
import { groupWires, FEED_X } from "../src/hauptlinien.js";
import { exportDxf } from "../src/dxf.js";

const pinsOf = (it) => SYMBOL_BY_NAME[it.sym].pins.map((p) => [it.x + p.x, it.y + p.y]);
const near = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;

// 1. Eingangsverdrahtung
const d = newDoc(), sh = d.sheets[0];
sh.meta.BLATT = "3"; d.nextId = 1;
const nextId = () => d.nextId++;
sh.items.push(...baseItems(nextId));
renumberAll(d);
assert.strictEqual(insertFeed(sh, nextId), "");
renumberAll(d);
const syms = sh.items.filter((i) => i.type === "symbol" && !i.main), by = (n) => syms.find((i) => i.sym === n);
assert.deepStrictEqual(syms.map((i) => i.sym).sort(), ["ERDE_1P", "HAK_TNCS_1", "HPAS_1P", "NH_3PT", "SPD_4P_1"]);
assert.strictEqual(by("NH_3PT").attrs.BMK, "3F4"); assert.strictEqual(by("SPD_4P_1").attrs.BMK, "3T4");
assert.deepStrictEqual([by("NH_3PT").attrs.STROM, by("NH_3PT").attrs.GROESSE, by("SPD_4P_1").attrs.TYP], ["TM", "NH00", "Typ 1+2 200A"]);
assert.deepStrictEqual(by("HAK_TNCS_1").attrs, { BMK: "HAK in HV", STROM: "200A", GROESSE: "NH1" });
// Hauptlinien beginnen über dem HAK, gestaffelt; kein Verweis und kein Strich links
const ws = groupWires(sh.items).reverse(); // L1 bis N
assert.deepStrictEqual(ws.map((w) => w.pts[0][0]), [FEED_X, FEED_X + 5, FEED_X + 10, FEED_X + 15]);
assert.ok(ws.every((w) => w.ends.l === "edge") && !sh.items.some((i) => i.main === "l"));
// Jede senkrechte Leitung verbindet einen HAK-Anschluss mit dem Anfang ihrer Hauptlinie
const hak = by("HAK_TNCS_1"), hp = pinsOf(hak), wires = sh.items.filter((i) => i.type === "wire" && !i.tag);
for (let i = 0; i < 4; i++) assert.ok(wires.some((w) => near(w.pts[0], hp[i]) && near(w.pts.at(-1), ws[i].pts[0])), `Leiter ${i}`);
// PE-Linie ab dem PE des HAK auf 90 mm, Name folgt, SPD und HPAS hängen daran
const pe = sh.items.find((w) => w.tag === "grund" && w.kind === "pe");
assert.deepStrictEqual(pe.pts[0], hp[4]); assert.strictEqual(pe.pts[1][1], FEED_PE_Y);
assert.ok(sh.items.some((t) => t.type === "text" && t.s === "PE" && t.y === FEED_PE_Y - 1));
const spdPe = pinsOf(by("SPD_4P_1")).at(-1);
assert.strictEqual(spdPe[1], FEED_PE_Y, "SPD-PE auf der PE-Linie");
assert.ok(wires.some((w) => near(w.pts[0], [107.5, FEED_PE_Y]) && near(w.pts.at(-1), pinsOf(by("HPAS_1P"))[0])));
assert.ok(wires.some((w) => near(w.pts[0], pinsOf(by("HPAS_1P"))[1]) && near(w.pts.at(-1), pinsOf(by("ERDE_1P"))[0])));
// Zuleitung von unten in den HAK, die Aufteilung liegt im Kasten
assert.ok(wires.some((w) => near(w.pts[0], hp[5]) && w.pts.at(-1)[1] < hp[5][1]));
const box = SYMBOL_BY_NAME.HAK_TNCS_1.prims.filter((p) => p.t === "l"), boxBottom = Math.min(...box.map((p) => Math.min(p.y1, p.y2)));
assert.ok(boxBottom < -30 && SYMBOL_BY_NAME.HAK_TNCS_1.pins.at(-1).y > boxBottom, "Zusammenführung und Zuleitung im Rahmen (CJ 22.10.: Anschlüsse dürfen im HAK sein)");
assert.ok(sh.items.some((t) => t.type === "text" && t.s === "Zuleitung VNB"));
// Zweites Mal: Meldung, nichts geändert
const n = sh.items.length;
assert.match(insertFeed(sh, nextId), /schon/); assert.strictEqual(sh.items.length, n);
// Speichern und Laden verlustfrei, Version 11
const txt = serializeModel(d);
assert.strictEqual(JSON.parse(txt).version, 11);
const back = parseModel(txt); renumberAll(back);
assert.deepStrictEqual(back.sheets[0].items, sh.items); assert.deepStrictEqual(back.sheets[0].main, sh.main);
const dxf = exportDxf(sh);
assert.ok(dxf.includes("HAK_TNCS_1") && dxf.includes("HPAS_1P") && dxf.includes("Zuleitung VNB"));
// Ohne Grundverkabelung: kommt mit
const e = newDoc(); e.nextId = 1;
assert.strictEqual(insertFeed(e.sheets[0], () => e.nextId++), ""); renumberAll(e);
assert.strictEqual(groupWires(e.sheets[0].items).length, 4);
console.log("Eingangsverdrahtung ok");

// 2. Grössen: Zähler 20 % höher, Anschlüsse unverändert; Wandlermessung auf 2,5-mm-Raster
for (const z of ["ZAEHLER_2P", "ZAEHLER_4P"]) {
  const s = SYMBOL_BY_NAME[z];
  assert.ok(s.pins.slice(0, s.poles * 2).every((p) => p.y === 0 || p.y === -20), "Anschlüsse bleiben");
  const xs = s.prims.filter((p) => p.t === "l" && p.x1 === -2.5 && p.x2 === -2.5);
  assert.ok(xs.some((p) => Math.abs(p.y1 - p.y2) === 20), `${z}: Kasten 20 mm, ohne Anschlussstücke (CJ 22.10.)`);
}
const on = (v) => Math.abs(v / 2.5 - Math.round(v / 2.5)) < 1e-9;
for (const n of ["ZW_WANDLER", "ZW_ZAEHLER", "ZAEHLER_4P_W"]) assert.ok(SYMBOL_BY_NAME[n].pins.every((p) => on(p.x) && on(p.y)), `${n} Anschlüsse auf dem Raster`);
const wz = SYMBOL_BY_NAME.ZW_ZAEHLER.prims.filter((p) => p.t === "l").flatMap((p) => [p.y1, p.y2]);
assert.strictEqual(Math.min(...wz), -16, "Zähler der Wandlermessung nach GEBNET 16 mm hoch (vorher 8)");
// Datei mit der ersten Teilung (Leiter 2,5 / 6,5 / 8,5 …): Leitungen gehen beim Öffnen an die neuen Anschlüsse
const OLD_X = [2.5, 6.5, 8.5, 12.5, 16.5, 18.5, 22.5, 26.5, 28.5, 32.5];
const o = newDoc(), os = o.sheets[0];
os.items.push({ id: 1, type: "symbol", sym: "ZW_WANDLER", x: 50, y: 190, rot: 0, attrs: { FBMK: "F1", FSTROM: "10A" } },
  { id: 2, type: "symbol", sym: "ZW_ZAEHLER", x: 50, y: 161, rot: 0, of: 1, attrs: { BMK: "P1", ZAEHLERNR: "", WANDLER: "150/5A", TEXT: "Wandlermessung" } },
  ...OLD_X.map((x, i) => ({ id: 3 + i, type: "wire", kind: "leitung", pts: [[50 + x, 165], [50 + x, 161]], of: 1, wm: i })));
o.nextId = 20;
const ob = parseModel(serializeModel(o)).sheets[0].items, ow = ob.filter((i) => i.type === "wire");
assert.ok(ow.every((w) => near(w.pts[0], [50 + WM_X[w.wm], 190 + WM_PIN_Y]) && near(w.pts.at(-1), [50 + WM_X[w.wm], 161])), JSON.stringify(ow.map((w) => w.pts)));
assert.deepStrictEqual(ob.find((i) => i.id === 2).x, 50, "Zähler bleibt");
fs.writeFileSync(process.argv[2] || "test_eingang.dxf", dxf);
console.log("Eingang: alle Tests ok");
