// Tests Schrank und Symbole der Disposition (ohne Browser): Masse, Bausteine, Bemassung, Speichern/Laden, DXF.
// Aufruf: node test/test_schrank.mjs [Ausgabe.dxf]  (schreibt die DXF der UV Bärgen für ezdxf, falls angegeben)
import assert from "node:assert";
import fs from "node:fs";
import * as D from "../src/dispo.js";
import * as K from "../src/schrank.js";
import { newDoc, newSheet, parseModel, serializeModel } from "../src/model.js";
import { exportDxf } from "../src/dxf.js";
import { baergenUV } from "./baergen_uv.mjs";

// Schrank: Beispiel UV aussen 1150, Feld 1100, Sockel 100
const c = { id: 1, ...K.newCabinet(0, 100) };
assert.strictEqual(K.cabW(c), 1150);
assert.deepStrictEqual(K.cabBox(c), { x0: 0, y0: 0, x1: 1150, y1: 2100 });
assert.deepStrictEqual(K.fieldXs(c), [25, 1125]);
const c4 = { ...c, fields: [450, 1150, 1150, 1200].map((w) => ({ w, door: "l", t: "" })) };
assert.strictEqual(K.cabW(c4), 4000, "Beispiel 4 Felder: 4000 mm");
const prims = (it, o) => D.planPrims([it], o);
const texts = (ps) => ps.filter((p) => p.k === "text").map((p) => p.s);
const inks = (ps) => ps.filter((p) => p.k === "rect" && p.fill === "ink").length;
assert.strictEqual(inks(prims(c)), 2, "Anschlag rechts: zwei Bänder");
assert.strictEqual(inks(prims({ ...c, fields: [{ w: 1100, door: "d", t: "" }] })), 4, "Doppeltür: Bänder beidseitig");
assert.ok(prims({ ...c, fields: [{ w: 1100, door: "d", t: "" }] }).some((p) => p.k === "line" && p.dash === "dash"), "Doppeltür: Mittelstoss gestrichelt");
const bandX = (door) => prims({ ...c, fields: [{ w: 1100, door, t: "" }] }).filter((p) => p.fill === "ink")[0].x;
assert.ok(bandX("l") < 100 && bandX("r") > 1000, "Band links bzw. rechts");
assert.strictEqual(inks(prims({ ...c, fields: [{ w: 1100, door: "d", t: "x" }] }, { doors: false })), 0, "Türen aus: keine Bänder");
assert.ok(texts(prims({ ...c, fields: [{ w: 1100, door: "d", t: "Feld" }] }, { doors: false })).includes("Feld"), "Türen aus: Feldtitel bleibt");
assert.ok(texts(prims(c)).includes("IP4") && texts(prims(c)).includes("400"), "IP und Tiefe");
const dimT = texts(prims(c, { dims: true }).filter((p) => p.layer === "SCH_DISPO_MASS"));
for (const v of ["1100", "1150", "2000", "100", "400"]) assert.ok(dimT.includes(v), "Bemassung " + v);
assert.ok(!texts(prims({ ...c, plinth: 0 }, { dims: true })).includes("100"), "ohne Sockel kein Sockelmass");
assert.ok(D.hitItem(c, 0, 1000, 2) && !D.hitItem(c, 500, 1000, 2), "Schrank nur am Rand wählbar");
console.log("ok schrank");

// Teile: Grössen aus Grösse und Text
assert.deepStrictEqual([K.newPart("NH000", 0, 0).w, K.newPart("NH000", 0, 0).h], [53, 213]);
assert.deepStrictEqual([K.newPart("NH1", 0, 0).w, K.newPart("NH1", 0, 0).h], [185, 265]);
assert.strictEqual(K.newPart("NTA", 0, 0).w, K.NT_TEXT.w);
assert.strictEqual(K.newPart("SSW", 0, 0).w, 326);
const nh = { id: 2, ...K.newPart("NH00", 0, 0) };
assert.ok(texts(prims(nh)).includes("DIN 00") && texts(prims(nh)).includes("160"));
assert.ok(texts(prims({ id: 3, ...K.newPart("NH000", 0, 0) })).includes("000"));
const nt = { id: 4, ...K.newPart("NTA", 0, 0) };
assert.ok(prims(nt).some((p) => p.s === "NT 250 A" && p.rot === 90), "NT nach Strom senkrecht");
assert.deepStrictEqual(texts(prims({ id: 5, ...K.newPart("NT", 0, 0) })), ["NT", "00"]);
assert.ok(prims({ id: 6, ...K.newPart("TW", 0, 0) }).some((p) => p.dash === "dash"));
assert.ok(prims({ id: 7, ...K.newPart("ABDECK", 0, 0) }).filter((p) => p.dash === "dot").length === 3);
assert.ok(prims({ id: 8, ...K.newPart("EINF", 0, 0) }).some((p) => p.k === "slot"));
assert.ok(prims({ id: 9, ...K.newPart("RAB", 0, 0) }).some((p) => p.s === "R-AB 5/10" && p.rot === 90));
assert.strictEqual(prims({ id: 10, ...K.newPart("SSW", 0, 0) }).filter((p) => p.k === "circle" && !p.fill).length, 6, "3 Stromwandler");
assert.ok(D.handlePoints({ type: "part", kind: "CALIP", x: 0, y: 0, w: 100, h: 20 }).length === 8 && !D.handlePoints({ type: "part", kind: "NH", x: 0, y: 0, w: 53, h: 213 }).length);
// NH-Abdeckung liegt vor den NH (wird nach den Teilen gezeichnet)
const cov = { id: 11, ...K.newPart("NHABD", 0, 50) }, all = D.planPrims([cov, nh]);
assert.ok(all.findIndex((p) => p.fill === "cover") > all.findIndex((p) => p.s === "DIN 00"), "Abdeckung nach den NH");
assert.ok(texts(prims(cov)).includes("Nicht durch Laien bedienbar") && prims(cov).filter((p) => p.k === "circle").length === 2, "Text und zwei Schrauben");
console.log("ok teile");

// Geräte: Klemmenblock Breite aus Querschnitt, Diazed, Texte darüber
const kl = { type: "device", x: 0, y: 0, kind: "KL", n: 5, qs: "10", label: "", bmk: "", top: "5x10" };
Object.assign(kl, D.klemmFit(kl));
assert.strictEqual(D.devW(kl), 51); assert.strictEqual(kl.h, 45);
assert.strictEqual(D.devW({ ...kl, ...D.klemmFit({ ...kl, qs: "120" }) }), 155);
const dz = D.planPrims([{ id: 12, type: "device", x: 0, y: 0, te: 1.5, h: 45, kind: "DIAZED", label: "II", bmk: "" }]);
assert.ok(dz.some((p) => p.k === "circle") && texts(dz).includes("II"));
const fils = D.planPrims([{ id: 13, type: "device", x: 0, y: 0, te: 2, h: 45, kind: "FILS", label: "13A", l2: "30mA", top: "FILS", bmk: "" }]);
assert.deepStrictEqual(texts(fils), ["13A", "30mA", "FILS"]);
// altes Gerät: Text wie bisher
const ls = D.planPrims([{ id: 14, type: "device", x: 0, y: 0, te: 1, h: 83, kind: "LS1", label: "LS 1P", bmk: "F1" }]);
assert.deepStrictEqual(ls.filter((p) => p.k === "text").map((p) => [p.s, p.y]), [["LS 1P", 0], ["F1", 51.5]]); // seit 16.10.2026 gestapelt: Oberkante 41,5 + 5 + 5
console.log("ok geraete");

// Speichern und Laden: UV Bärgen bleibt gleich, Version 8. Disposition ohne Schrank bleibt Version 3.
const { doc } = baergenUV();
const txt = serializeModel(doc), back = parseModel(txt);
assert.strictEqual(JSON.parse(txt).version, 12); // 9 seit 16.10.: Kasten mit Textzeilen, 12 mit der PEN-Schiene als BAR
assert.deepStrictEqual(JSON.parse(serializeModel(back)), JSON.parse(txt), "Rundlauf unverändert");
const plain = newDoc(); const ds = newSheet("dispo"); ds.sid = 5; ds.items = [{ id: 1, type: "plate", x: 0, y: 0, w: 500, h: 400, name: "" }]; plain.sheets.push(ds);
assert.strictEqual(JSON.parse(serializeModel(plain)).version, 3);
assert.strictEqual(D.deviceIssues(back.sheets[0].items).size, 0, "UV Bärgen ohne Überlappung");
const kinds = new Set(back.sheets[0].items.map((i) => i.kind).filter(Boolean));
for (const k of ["KL", "FILS", "FI", "UHR", "SCH", "DIAZED", "ZAEHLER", "PK", "NH", "NT", "SSW", "WKL", "BAR", "CALIP", "ABDECK", "EINF", "TW", "NHABD", "KASTEN"]) assert.ok(kinds.has(k), "UV enthält " + k);
assert.ok(back.sheets[0].items.filter((i) => i.type === "device" && i.kind !== "KL" && i.kind !== "PK").every((d) => d.h === 83), "Geräte 83 mm (CJ 16.10.)");
assert.ok(!back.sheets[0].items.some((i) => i.fill), "keine schwarzen Balken (CJ 16.10.: weglassen)");
const noDoor = parseModel(serializeModel({ ...doc, sheets: [{ ...doc.sheets[0], doors: false }] }));
assert.strictEqual(noDoor.sheets[0].doors, false, "Türen aus wird gespeichert");
assert.throws(() => parseModel(txt.replace('"kind": "CALIP"', '"kind": "XYZ"')), /unbekanntes/);
console.log("ok laden");

// DXF: Schrank, Texte, Linientypen
const dxf = exportDxf(back.sheets[0]);
for (const s of ["SCH_DISPO_SCHRANK", "SCH_STRICH", "SCH_PUNKT", "R-AB 5/10", "NT 250 A", "DIN 1", "120mm2", "IP4", "Calip"]) assert.ok(dxf.includes(s), "DXF enthält " + s);
// Ansicht auf dem Schemablatt
const sch = newSheet(); sch.meta.BLATT = "1";
const bb = D.contentBBox(back.sheets[0].items, true);
sch.items.push({ id: 999, type: "dispoview", x: 20, y: 30, den: 10, bx: bb.x0, by: bb.y0, bw: bb.x1 - bb.x0, bh: bb.y1 - bb.y0, dims: true, title: "UV", src: 900, items: back.sheets[0].items });
const dxf2 = exportDxf(sch);
assert.ok(dxf2.includes("R-AB 5/10") && dxf2.includes("SCH_DISPO_SCHRANK"));
if (process.argv[2]) { fs.writeFileSync(process.argv[2], dxf); fs.writeFileSync(process.argv[2].replace(/\.dxf$/, "_ansicht.dxf"), dxf2); }
console.log("ok dxf");
