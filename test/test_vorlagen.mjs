// Abgang als Vorlage (vorlagen.js, 16.10.2026): Geräte, Leitungen zur Grundverkabelung, Klemmen, Nummerierung. Aufruf aus web-src: node test/test_vorlagen.mjs
import assert from "node:assert";
import { newDoc, newSheet } from "../src/model.js";
import { renumberAll } from "../src/numbering.js";
import { baseItems } from "../src/template.js";
import { TEMPLATES, abgangItems, templateOf, makeCustom, addCustom, removeCustom, CUSTOM } from "../src/vorlagen.js";
import { junctions } from "../src/render.js";
import { exportDxf } from "../src/dxf.js";
import { COL_CENTERS } from "../src/frame.js";

const d = newDoc(); d.sheets = [];
const ids = () => d.nextId++;
for (const no of ["3", "4"]) { const sh = newSheet(); sh.meta.BLATT = no; sh.items.push(...baseItems(ids)); d.sheets.push(sh); }
renumberAll(d);
const [s3, s4] = d.sheets;
const put = (sh, id, col) => { const a = abgangItems(templateOf("A:" + id), col, sh.items, ids); if (a.items) { sh.items.push(...a.items); renumberAll(d); } return a; };

// LS 1-polig in Spalte 2: L1 durch den LS, N gerade zur Klemme, 3 Klemmen aus dem Kabel
let a = put(s3, "ls1", 2);
const ls = a.items.find((i) => i.sym === "LS_1P"), term = a.items.find((i) => i.type === "terminals"), ws = a.items.filter((i) => i.type === "wire");
assert.strictEqual(ls.x, Math.round(COL_CENTERS[1] * 1000) / 1000, "LS in Spaltenmitte");
assert.deepStrictEqual(ws.map((w) => [w.kind, w.pts[0][1], w.pts[1][1]]), [["leitung", 190, 160], ["leitung", 140, 45], ["neutral", 175, 45]], "L1 → LS → Klemme, N → Klemme");
assert.strictEqual(ws[2].pts[0][0], ls.x + 5);
assert.strictEqual(term.cable, "3x1.5mm2"); assert.strictEqual(term.n, 3); assert.strictEqual(term.of, ls.id); assert.strictEqual(term.y, 45);
assert.strictEqual(ls.attrs.BMK, "3F2"); assert.strictEqual(term.bmk, "3X2", "BMK und Klemmen nummerieren sich");
const j = junctions(s3.items);
assert.ok(j.some((p) => p.x === ls.x && p.y === 190) && j.some((p) => p.x === ls.x + 5 && p.y === 175), "Abzweigpunkte auf L1 und N");
assert.ok(!j.some((p) => p.y === 45), "kein Verbindungspunkt auf PE: Leitungen enden auf der Klemme");
console.log("LS 1-polig ok");

// FI + LS übereinander: BMK 3F4 und 3F4.1, N durch den FI
a = put(s3, "fils", 4);
const fi = a.items.find((i) => i.sym === "FI_2P"), ls2 = a.items.find((i) => i.sym === "LS_1P");
assert.deepStrictEqual([fi.attrs.BMK, ls2.attrs.BMK], ["3F4", "3F4.1"]);
assert.deepStrictEqual(a.items.filter((i) => i.type === "wire").map((w) => w.pts.map((p) => p[1])), [[190, 160], [140, 130], [110, 45], [175, 160], [140, 45]]);
// LS 3-polig, RCBO
assert.strictEqual(put(s3, "ls3", 6).items.filter((i) => i.type === "wire").length, 7, "L1 bis L3 je 2 Stücke, N 1");
assert.strictEqual(put(s3, "rcbo2", 3).items.find((i) => i.type === "terminals").n, 3);
assert.strictEqual(TEMPLATES.length, 4);
console.log("FI und LS, LS 3-polig, RCBO ok");

// Fehler: Spalte belegt, Spalte ausserhalb der Hauptlinien (Blatt 4 hat links den ankommenden Verweis), keine Grundverkabelung
assert.match(put(s3, "ls1", 2).error, /schon ein Gerät/);
assert.ok(put(s4, "ls1", 1).items, "Spalte 1 frei trotz ankommendem Verweis (Pfeil im Rand, CJ 16.10.)");
assert.match(put(s3, "ls3", 8).error ?? "", /erreicht/);
assert.match(abgangItems(TEMPLATES[0], 2, [], ids).error, /fehlt die Grundverkabelung/);
assert.match(put(s4, "ls1", 1).error, /schon ein Gerät/);
assert.ok(exportDxf(s3).includes("3X2"), "Klemmen-BMK im DXF");
// Eigener Abgang aus einer Auswahl (CJ 16.10.: „Zu Abgänge hinzufügen“): Abgang aus Spalte 2 von Blatt 3 speichern, in Spalte 5 setzen
const src = put(s3, "fils", 7).items ?? s3.items.filter((i) => !i.tag && i.type !== "text");
const own = makeCustom("Bad", src);
assert.ok(own && own.custom && own.label === "Bad" && own.items.every((i) => !i.tag) && own.items.filter((i) => i.type === "symbol").every((i) => i.attrs.BMK === ""));
assert.strictEqual(makeCustom("x", [{ id: 1, type: "text", x: 0, y: 0, h: 2.5, s: "a" }]), null, "nur Text: kein Abgang");
addCustom(own); assert.strictEqual(templateOf("A:" + own.id), own);
const placed = abgangItems(own, 5, s4.items.filter((i) => i.type !== "symbol" || !i.sym.startsWith("V")), ids);
assert.ok(placed.items && placed.items.length === own.items.length);
const dev = placed.items.filter((i) => i.type === "symbol").sort((a, b) => b.y - a.y)[0];
assert.ok(Math.abs(dev.x + (dev.sym === "FI_2P" ? 2.5 : 0) - COL_CENTERS[4]) < 2e-3, "obere Gerät mittig in Spalte 5");
const t = placed.items.find((i) => i.type === "terminals"); assert.ok(placed.items.some((i) => i.id === t.of), "Klemmen gehören zum neuen Gerät");
assert.ok(new Set(placed.items.map((i) => i.id)).size === placed.items.length && placed.items.every((i) => !own.items.some((o) => o.id === i.id)), "neue IDs");
removeCustom(own.id); assert.strictEqual(CUSTOM.length, 0);
console.log("Eigene Abgänge ok");
console.log("Vorlagen: alle Tests ok");
