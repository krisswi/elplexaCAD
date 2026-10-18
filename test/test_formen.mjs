// Freies Zeichnen (Wunsch CJ 18.10.2026): Linie, Rechteck, Kreis, farbige Texte. Speichern/Laden ohne Verlust, DXF mit Layer und Farbe.
// Aufruf aus web-src: node test/test_formen.mjs [Ausgabe.dxf]
import fs from "fs";
import assert from "node:assert";
import { newDoc, parseModel, serializeModel, VERSION } from "../src/model.js";
import { exportDxf } from "../src/dxf.js";
import { renumberAll } from "../src/numbering.js";
import { shapeFrom, shapeHandles, dragShapeHandle, hitShape, colorAci } from "../src/formen.js";
import { itemsSVG, itemBBox } from "../src/render.js";

// Formen aus zwei Punkten, Shift = gerade bzw. Quadrat
assert.deepStrictEqual(shapeFrom("line", { x: 10, y: 10 }, { x: 40, y: 12 }, true).pts, [[10, 10], [40, 10]]);
assert.deepStrictEqual((({ x, y, w, h }) => [x, y, w, h])(shapeFrom("rect", { x: 50, y: 50 }, { x: 40, y: 45 })), [40, 45, 10, 5], "Rechteck in jede Richtung");
assert.deepStrictEqual((({ w, h }) => [w, h])(shapeFrom("rect", { x: 0, y: 0 }, { x: 10, y: 4 }, true)), [10, 10], "Shift = Quadrat");
assert.strictEqual(shapeFrom("circle", { x: 0, y: 0 }, { x: 3, y: 4 }).r, 5);
const st = shapeFrom("rect", { x: 0, y: 0 }, { x: 10, y: 10 }, false, { c: "rot", d: true, fill: "gruen" });
assert.deepStrictEqual([st.c, st.d, st.fill], ["rot", true, "gruen"]);
assert.strictEqual(shapeFrom("line", { x: 0, y: 0 }, { x: 1, y: 1 }, false, { c: "schwarz", fill: "rot" }).fill, undefined, "Linie ohne Füllung, schwarz nicht gespeichert");
// Griffe: Rechteck-Ecke ziehen, Gegenecke bleibt; Kreis: Radius
const r = { type: "shape", k: "rect", x: 10, y: 10, w: 20, h: 10 }, o = { ...r };
dragShapeHandle(r, o, 2, { x: 5, y: 5 });
assert.deepStrictEqual([r.x, r.y, r.w, r.h], [5, 5, 5, 5], "Ecke über die Gegenecke gezogen");
const c = { type: "shape", k: "circle", x: 0, y: 0, r: 5 };
assert.strictEqual(shapeHandles(c).length, 4);
dragShapeHandle(c, { ...c }, 0, { x: 0, y: 8 }); assert.strictEqual(c.r, 8);
// Treffer: Strich, innen nur mit Füllung
const box = { type: "shape", k: "rect", x: 0, y: 0, w: 20, h: 20 };
assert.ok(hitShape(box, 0.3, 10, 0.5) && !hitShape(box, 10, 10, 0.5) && hitShape({ ...box, fill: "rot" }, 10, 10, 0.5));
console.log("Formen ok");

// Dokument mit allen drei Formen und farbigem Text
const d = newDoc(), sh = d.sheets[0]; sh.meta.BLATT = "3";
const add = (it) => { const x = { id: d.nextId++, ...it }; sh.items.push(x); return x; };
add({ type: "symbol", sym: "LS_1P", x: 97.5, y: 130, rot: 0, attrs: { BMK: "", STROM: "13A", CHAR: "C" } });
add(shapeFrom("line", { x: 20, y: 30 }, { x: 80, y: 30 }, false, { c: "rot", d: true }));
add(shapeFrom("rect", { x: 100, y: 20 }, { x: 140, y: 50 }, false, { c: "blau", fill: "orange" }));
add(shapeFrom("circle", { x: 200, y: 40 }, { x: 210, y: 40 }, false, { c: "gruen", d: true, fill: "grau" }));
add(shapeFrom("rect", { x: 150, y: 20 }, { x: 160, y: 30 }));
add({ type: "text", x: 20, y: 60, h: 5, s: "Rot gross", c: "rot" });
add({ type: "text", x: 20, y: 70, h: 2.5, s: "Schwarz" });
renumberAll(d);
const text = serializeModel(d), o2 = JSON.parse(text);
assert.strictEqual(o2.version, 15); assert.strictEqual(VERSION, 15);
const d2 = parseModel(text);
assert.deepStrictEqual(d2.sheets[0].items, sh.items, "Speichern und Laden ohne Datenverlust");
assert.strictEqual(serializeModel(d2), text, "zweites Speichern gleich");
// Ohne Formen und Farbe bleibt die alte Version
const plain = newDoc(); plain.sheets[0].items.push({ id: 1, type: "text", x: 1, y: 1, h: 2.5, s: "a" });
assert.ok(JSON.parse(serializeModel(plain)).version < 15);
// Alte Dateien laden weiter (Version 14, ohne Formen)
assert.strictEqual(parseModel(JSON.stringify({ format: "schemacad", version: 14, sheets: [{ meta: {}, items: [{ id: 1, type: "text", x: 1, y: 1, h: 2.5, s: "alt" }] }] })).sheets[0].items[0].s, "alt");
// Defekte Form wird abgelehnt
assert.throws(() => parseModel(JSON.stringify({ format: "schemacad", version: 15, sheets: [{ meta: {}, items: [{ id: 1, type: "shape", k: "rect", x: 1, y: 1, w: -2, h: 3 }] }] })), /defektes Objekt/);
console.log("Datei ok");

// SVG (Bildschirm und Druck): Formen zuerst (hinter allem), Farben
const svg = itemsSVG(sh.items);
assert.ok(svg.indexOf("<rect") < svg.indexOf("<g"), "Formen vor den Symbolen");
assert.ok(svg.includes('stroke="#d1302b"') && svg.includes('stroke-dasharray="7 4"') && svg.includes('fill="#e07800"') && svg.includes("<circle"), "Farbe, Strich, Füllung");
assert.ok(/fill="#d1302b"[^>]*>Rot gross/.test(svg), "Text rot");
assert.deepStrictEqual(itemBBox(sh.items[2]), { x0: 100, y0: 20, x1: 140, y1: 50 });
console.log("SVG ok");

// DXF: Layer SCH_FORMEN, Farbindex, DASHED, SOLID-Schraffur, Text mit Farbe
const dxf = exportDxf(d2.sheets[0]);
if (process.argv[2]) fs.writeFileSync(process.argv[2], dxf);
const ents = dxf.split(/\r?\n/).map((l) => l.trim());
const entity = (type) => { const out = []; for (let i = 0; i + 1 < ents.length; i += 2) if (ents[i] === "0" && ents[i + 1] === type) { const g = {}; for (let k = i + 2; k + 1 < ents.length && ents[k] !== "0"; k += 2) (g[ents[k]] ||= []).push(ents[k + 1]); out.push(g); } return out; };
const onLayer = (type) => entity(type).filter((g) => g["8"]?.[0] === "SCH_FORMEN");
assert.ok(dxf.includes("SCH_FORMEN"), "Layer");
const line = onLayer("LINE"); assert.strictEqual(line.length, 1); assert.strictEqual(line[0]["62"][0], String(colorAci("rot"))); assert.strictEqual(line[0]["6"][0], "DASHED");
const rect = onLayer("LWPOLYLINE"); assert.strictEqual(rect.length, 2); assert.deepStrictEqual(rect.map((g) => g["62"][0]).sort(), ["5", "7"]);
const circ = onLayer("CIRCLE"); assert.strictEqual(circ.length, 1); assert.strictEqual(circ[0]["40"][0], "10"); assert.strictEqual(circ[0]["62"][0], "3");
const hatch = onLayer("HATCH"); assert.strictEqual(hatch.length, 2); assert.deepStrictEqual(hatch.map((g) => g["62"][0]).sort(), ["30", "8"]); assert.ok(hatch.every((g) => g["2"][0] === "SOLID"));
const red = entity("TEXT").find((g) => g["1"]?.[0] === "Rot gross");
assert.ok(red && red["62"][0] === "1" && red["40"][0] === "5" && red["8"][0] === "SCH_TEXT", "Text rot, Höhe 5");
assert.ok(!entity("TEXT").find((g) => g["1"]?.[0] === "Schwarz")["62"], "schwarzer Text ohne eigene Farbe");
console.log("DXF ok");
console.log("Formen: alle Tests ok");
