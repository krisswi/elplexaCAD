// Tests Zählerplatte bestücken, Bemassung kleiner und einstellbar, Werkzeug Bemassung (16.10.2026, Bärgen 268). Ohne Browser.
// Aufruf: node test/test_bemassung.mjs
import assert from "node:assert";
import fs from "node:fs";
import * as D from "../src/dispo.js";
import * as K from "../src/schrank.js";
import { newDoc, newSheet, parseModel, serializeModel } from "../src/model.js";
import { exportDxf } from "../src/dxf.js";

const prims = (it, o) => D.planPrims([it], o);
const texts = (ps) => ps.filter((p) => p.k === "text").map((p) => p.s);
const M = (ps) => ps.filter((p) => p.layer === "SCH_DISPO_MASS");

// ---------- Zählerplatte ----------
const z = { id: 1, ...K.newPart("ZBOX", 40, 155), lines: ["Zähler", "Gewerbe", "H5.EG.11", "EG"], bmk: "122F1" };
assert.deepStrictEqual([z.w, z.h], [170, 195]);
const zp = prims(z), zt = zp.filter((p) => p.k === "text");
assert.deepStrictEqual(texts(zp), ["Zähler", "Gewerbe", "H5.EG.11", "EG", "122F1"], "Zähler: mehrzeilig, BMK zuletzt");
assert.ok(zt[0].y > zt[1].y && zt[1].y > zt[2].y && zt[2].y > zt[3].y, "Zeilen von oben nach unten");
assert.ok(zt[4].y < z.y && zt[0].y < z.y + z.h, "BMK unter dem Kasten, Titel im Kasten");
const rse = { id: 2, ...K.newPart("RSE", 0, 0), bmk: "110P1" };
assert.ok(texts(prims(rse)).includes("RsE") && texts(prims(rse)).includes("110P1"), "RSE als Kasten mit BMK");
const zkl = { id: 3, ...K.newPart("ZKL", 0, 0) };
assert.strictEqual(prims(zkl).filter((p) => p.k === "circle").length, 7, "Klemmenreihe 7 Klemmen");
assert.strictEqual(prims({ ...zkl, n: 9 }).filter((p) => p.k === "circle").length, 9);
const pk = { id: 4, ...K.newPart("PKZ", 0, 0), bmk: "115X1" }, sp = { id: 5, ...K.newPart("SPF", 0, 0), bmk: "115F2" };
assert.strictEqual(prims(pk).filter((p) => p.k === "circle").length, 20, "Prüfklemme: 2 × 10 Kontakte");
assert.ok(prims(pk).find((p) => p.s === "115X1").y > pk.h, "BMK der Prüfklemme darüber");
assert.strictEqual(prims(sp).filter((p) => p.k === "circle").length, 3, "Spannungspfad: 3 Sicherungen");
assert.ok(K.PART_KINDS.ZBOX.free && D.handlePoints(z).length === 8, "frei, mit Griffen");
console.log("ok zaehlerplatte");

// ---------- Bemassung kleiner, einstellbar ----------
const pl = { id: 10, type: "plate", x: 0, y: 0, w: 500, h: 400, name: "" };
const hOf = (o) => M(prims(pl, o)).find((p) => p.k === "text").h;
assert.strictEqual(D.DIM_PLAN, 5);
assert.strictEqual(hOf({ dims: true }), 5, "Vorgabe 5 mm statt 10");
assert.strictEqual(hOf(D.planOpts({ dimH: 3 })), 3, "Masstext aus dem Blatt");
assert.deepStrictEqual(D.planOpts({}), { dims: true, doors: true, dimH: 5, off: [] });
const big = D.contentBBox([pl], { dims: true, dimH: 10 }), small = D.contentBBox([pl], { dims: true });
assert.ok(small.y0 > big.y0 && small.x0 > big.x0, "kleinere Bemassung braucht weniger Platz");
// Ansicht auf dem Schema: alte ohne dimP wie bisher, neue nach mm Papier
assert.strictEqual(D.viewDimH({ den: 20 }), 24);
assert.strictEqual(D.viewDimH({ den: 5 }), 10, "alte Ansicht: unverändert");
assert.strictEqual(D.viewDimH({ den: 5, dimP: 1.5 }), 7.5, "neu: 1,5 mm Papier bei 1:5");
assert.strictEqual(D.viewDimH({ den: 10, dimP: 0.5 }), 12, "nie kleiner als 1,2 mm");
console.log("ok masstext");

// ---------- Automatische Masse einzeln ausblenden ----------
const keys = new Set(M(prims(pl, { dims: true })).map((p) => p.dk));
assert.deepStrictEqual([...keys].sort(), ["p10h", "p10w"]);
const off = M(prims(pl, { dims: true, off: ["p10w"] }));
assert.ok(off.length && off.every((p) => p.dk === "p10h"), "Breite ausgeblendet, Höhe bleibt");
assert.strictEqual(D.autoDimAt([pl], { dims: true }, 250, -12.5, 1), "p10w", "Mass unter dem Zeiger");
assert.strictEqual(D.autoDimAt([pl], { dims: true, off: ["p10w"] }, 250, -12.5, 1), null, "ausgeblendet = nicht wählbar");
const cab = { id: 20, ...K.newCabinet(0, 100) };
// seit 16.10.2026: Schrankmasse aussen als Ketten oX (Gesamtbreite, oben), of (Felder mit Seitenwänden), oh (Sockel, Höhe), oY (Gesamthöhe)
assert.ok(["oX", "of", "oh", "oY"].every((k) => M(prims(cab, { dims: true })).some((p) => p.dk === k)), "Schrankmasse haben Schlüssel");
console.log("ok ausblenden");

// ---------- Werkzeug Bemassung ----------
const p1 = { x: 0, y: 0 }, p2 = { x: 300, y: 100 };
assert.strictEqual(D.makeDim(p1, p2, { x: 150, y: -40 }).dir, "h", "Zeiger zwischen den Punkten in x = waagrecht");
assert.strictEqual(D.makeDim(p1, p2, { x: 400, y: 50 }).dir, "v", "zwischen den Punkten in y = senkrecht");
assert.strictEqual(D.makeDim(p1, p2, { x: 500, y: 500 }).dir, "h", "sonst grösserer Abstand");
assert.strictEqual(D.makeDim(p1, { x: 0, y: 200 }, { x: 50, y: 100 }).dir, "v", "gleiches x: senkrecht");
assert.strictEqual(D.makeDim(p1, p1, { x: 5, y: 5 }), null);
const d = { id: 30, ...D.makeDim(p1, p2, { x: 150, y: -40 }) };
assert.deepStrictEqual([d.off, d.dx, d.dy], [-40, 300, 100]);
const dp = D.dimItemPrims(d, 5);
assert.deepStrictEqual(texts(dp), ["300"]);
assert.ok(dp.some((p) => p.k === "line" && p.y1 === -40 && p.y2 === -40 && p.x1 === 0 && p.x2 === 300), "Masslinie auf y = −40");
assert.ok(D.hitItem(d, 150, -40, 1) && D.hitItem(d, 150, -36.5, 1) && !D.hitItem(d, 150, 50, 1), "Treffer auf Linie und Text, nicht dazwischen");
assert.strictEqual(texts(D.planPrims([d], { dims: false })).length, 0, "Bemassung aus: gesetzte Masse auch aus");
assert.strictEqual(texts(D.planPrims([d], { dims: true })).length, 1);
// Fang: Ecke, Kantenmitte, Kante
assert.deepStrictEqual(D.dimSnap([pl], 498, 3, 5), { d: Math.hypot(2, 3), x: 500, y: 0, k: "corner" });
assert.strictEqual(D.dimSnap([pl], 251, 401, 5).k, "mid");
const e = D.dimSnap([pl], 120, 2, 5);
assert.deepStrictEqual([e.x, e.y, e.k], [120, 0, "edge"]);
assert.strictEqual(D.dimSnap([pl], 120, 50, 5), null, "frei im Innern");
assert.ok(D.dimSnap([cab], K.fieldXs(cab)[0] + 1, 1000, 5).x === K.fieldXs(cab)[0], "Fang auf Feldgrenze im Schrank");
// Gesetzte Masse beeinflussen den Fang und die Hilfslinien nicht
assert.ok(!D.guideLines([pl, d], new Set()).xs.some((l) => l.v === 300), "kein Hilfslinienfang auf Massen");
console.log("ok werkzeug");

// ---------- Speichern, Laden, DXF ----------
const doc = newDoc(), sh = newSheet("dispo");
sh.sid = 7; sh.dimH = 3.5; sh.dimP = 1.5; sh.dimsOff = ["p10w"]; sh.items = [pl, d, z];
doc.sheets = [sh]; doc.nextId = 100;
const json = serializeModel(doc), back = parseModel(json).sheets[0];
assert.strictEqual(JSON.parse(json).version, 9); // 9 seit 16.10.: Zähler und Kasten mit Textzeilen
assert.deepStrictEqual([back.dimH, back.dimP, back.dimsOff], [3.5, 1.5, ["p10w"]]);
assert.deepStrictEqual(back.items.find((i) => i.type === "dim"), d, "Mass unverändert zurück");
assert.strictEqual(back.items.find((i) => i.kind === "ZBOX").bmk, "122F1");
const dxf = exportDxf(back), ent = dxf.slice(dxf.indexOf("ENTITIES")), dt = [...ent.matchAll(/\n1\n([^\n]*)\n/g)].map((m) => m[1]);
assert.ok(dt.includes("300") && dt.includes("400") && !dt.includes("500"), "DXF: gesetztes Mass, ausgeblendete Breite fehlt: " + dt);
assert.ok(/\n40\n3\.5\n/.test(ent), "DXF: Masstext 3,5 mm");
// Bestehende Datei (Nachzeichnung UV vom 16.10.) öffnet unverändert
const old = fs.readFileSync(new URL("../../../Referenzen/Baergen UV Stall nachgezeichnet.schemacad.json", import.meta.url), "utf8");
const o1 = parseModel(old), o2 = parseModel(serializeModel(o1));
assert.deepStrictEqual(o2.sheets[0].items, o1.sheets[0].items);
// seit 16.10.: Kasten und Zähler mit „|“ werden beim Laden in Zeilen umgerechnet, sonst unverändert, Bild gleich
// seit 16.10.2026 (Bau-Chat Dispo): die alte PEN-Schiene geht in der Schiene N/PE/PEN auf (Leiter PEN, Farben wie im Schema)
const rawItems = JSON.parse(old).sheets[0].items, conv = rawItems.map((i) => (K.LINE_KINDS.has(i.kind) && typeof i.s === "string" ? (({ s, ...r }) => ({ ...r, lines: s.split("|") }))(i) : i.kind === "PEN" ? { ...i, kind: "BAR", c: "PEN" } : i));
assert.deepStrictEqual(o1.sheets[0].items, conv, "alte Datei: Objekte unverändert bis auf Zeilen und PEN");
assert.deepStrictEqual(D.planPrims(o1.sheets[0].items), D.planPrims(conv), "alte Datei: Bild wie umgerechnet");
assert.strictEqual(o1.sheets[0].dimH, undefined);
console.log("ok speichern dxf");
