// Prinzipschema (CJ 21.10.2026): Symbole, Datenmodell, Papier und Druckseite ohne Browser.
// Aufruf: node test/test_prinzip.mjs [Ausgabe.dxf] (Ausgabe wird nicht gebraucht)
import assert from "node:assert";
import { newDoc, newSheet, parseModel, serializeModel, modOf, modName, VERSION } from "../src/model.js";
import { SYMBOL_BY_NAME, FAMILIES, isDevice, bmkLetter } from "../src/symbols.js";
import { polNext, sichName, kabelN, PZ_ABGANG, PZ_POL, PZ_AUS_SCHEMA, PRINZIP_SYMBOLS, PRINZIP_FAMILIES } from "../src/prinzipsym.js";
import { exportDxf } from "../src/dxf.js";
import { renumberAll } from "../src/numbering.js";
import { partsList, fuseLegend } from "../src/auswertung.js";
import { sheetRank, kindLabel, sheetNo, inToc, handedOver } from "../src/titel.js";
import * as PZ from "../src/prinzip.js";

// ---------- Symbole: eigene Familie, nicht in der Schema-Palette, keine Schutzgeräte mit Auto-BMK ----------
const on = (v) => Math.abs(v / 2.5 - Math.round(v / 2.5)) < 1e-9;
for (const s of PRINZIP_SYMBOLS) {
  assert.strictEqual(SYMBOL_BY_NAME[s.name], s, s.name);
  assert.ok(s.name.startsWith("PZ_") && s.pins.length && s.pins.every((p) => on(p.x) && on(p.y)), `${s.name}: Anschlüsse auf dem Raster 2,5 mm`);
  assert.ok(!isDevice(s) && !bmkLetter(s), `${s.name}: keine automatische BMK`);
  assert.ok(!FAMILIES.some((f) => f.variants.includes(s.name)), `${s.name}: nicht in der Schema-Palette`);
}
assert.ok(PRINZIP_FAMILIES.every((f) => f.variants.every((v) => SYMBOL_BY_NAME[v])), "Palette zeigt nur vorhandene Symbole");
for (const n of ["PZ_LS", "PZ_FI", "PZ_FILS", "PZ_SICH", "PZ_ZAEHLER", "PZ_RSE", "PZ_WANDLER", "PZ_GERAET", "PZ_WR", "PZ_GR", "PZ_HAK"]) assert.ok(SYMBOL_BY_NAME[n].attrs.some((a) => a.tag === "BMK" && a.def === ""), `${n}: leeres BMK-Feld für später`);
assert.ok(PRINZIP_FAMILIES.some((f) => f.def === "PZ_WANDLER") && SYMBOL_BY_NAME.PZ_WANDLER.pins.length === 3, "Stromwandler in der Palette, drei Anschlüsse (CJ 23.10.)");
// Schritt 6.5 (CJ 23.10.2026): Geräte nur im Prinzipschema, mit BMK und in der Palette; Motorschutz als Abgang, Verteilgeräte mit Polzahl
for (const n of ["PZ_MSS", "PZ_MSS_M", "PZ_LTR", "PZ_LTS", "PZ_TRS", "PZ_TRENN", "PZ_LSCH", "PZ_SICH_M"]) assert.ok(PRINZIP_FAMILIES.some((f) => f.def === n) && SYMBOL_BY_NAME[n].attrs.some((a) => a.tag === "BMK" && a.def === ""), `${n}: in der Palette mit BMK`);
assert.ok(["PZ_MSS", "PZ_MSS_M"].every((n) => PZ_ABGANG.includes(n)) && ["PZ_LTR", "PZ_LTS", "PZ_TRS", "PZ_TRENN", "PZ_LSCH"].every((n) => PZ_POL.includes(n) && SYMBOL_BY_NAME[n].attrs.some((a) => a.tag === "POL")), "Polzahl-Tasten für Motorschutz und Verteilgeräte");
// Schritt 6.4 (CJ 23.10.2026): Schema-Symbole im Prinzipschema, Anschlüsse auf 2,5 mm, waagrechte mit Anschluss links bei 0
for (const [src, n, lage] of PZ_AUS_SCHEMA) {
  const s = SYMBOL_BY_NAME[n];
  assert.ok(s && PRINZIP_FAMILIES.some((f) => f.variants.includes(n)) && s.attrs.some((a) => a.tag === "BMK" && a.def === ""), `${n}: aus ${src}, in der Palette, BMK leer`);
  assert.ok(s.pins.every((p) => Math.abs(p.x / 2.5 - Math.round(p.x / 2.5)) < 1e-9 && Math.abs(p.y / 2.5 - Math.round(p.y / 2.5)) < 1e-9), `${n}: Anschlüsse auf dem Raster`);
  if (lage === "w") assert.ok(s.pins.every((p) => p.y === 0 || p.x > 0) && s.pins.some((p) => p.x === 0 && p.y === 0), `${n}: waagrecht`);
}
assert.strictEqual(SYMBOL_BY_NAME.BATT_1P.prims.filter((p) => p.t === "l" && p.y1 === p.y2).length, 6, "Batterie: drei Zellen (CJ 23.10.)");
assert.strictEqual(SYMBOL_BY_NAME.PZ_LEITER_3.prims.length, 4, "Leitungsangabe: Leitung und drei Striche");
// Leitungsangabe neu (CJ 23.10.2026): ein Strich, Anzahl im Text; Tasten setzen die Zahl vorne, der Querschnitt bleibt
assert.strictEqual(SYMBOL_BY_NAME.PZ_LEITUNG.prims.length, 2, "Leitungsangabe: Leitung und ein Strich");
// Hauptverteilung (CJ 23.10.2026): Rechteck mit Diagonale als Form, Grösse frei; Werkzeug aus der Palette, nicht in der Werkzeugleiste
assert.ok(PRINZIP_FAMILIES.some((f) => f.tool === "shape-vert") && !PRINZIP_FAMILIES.some((f) => f.def === "PZ_KLEMME"), "Palette: Hauptverteilung als Form");
assert.deepStrictEqual([["3x1,5mm²", 5], ["16mm²", 1], ["", 3], ["4 x 10mm²", 2]].map(([k, n]) => kabelN(k, n)), ["5x1,5mm²", "1x16mm²", "3x", "2x10mm²"]);
assert.ok(PRINZIP_FAMILIES.some((f) => f.def === "PZ_LEITUNG") && !PRINZIP_FAMILIES.some((f) => f.variants.includes("PZ_LEITER_3")), "Palette: nur noch die neue Leitungsangabe");
assert.ok(["PZ_PA_D", "PZ_ERDE_ANS", "PZ_ERDE_KK", "PZ_SCHUTZERDE", "PZ_ERDBAND"].every((n) => PRINZIP_FAMILIES.some((f) => f.def === n)), "Erdungszeichen in der Palette (CJ 22.10.)");
// Abgangsgeräte: drei Zeilen oberhalb, BMK zuoberst, dann Bezeichnung, dann Polzahl (CJ 21.10.2026)
for (const n of ["PZ_LS", "PZ_FI", "PZ_FILS"]) {
  const [b, t, p] = ["BMK", "TEXT", "POL"].map((g) => SYMBOL_BY_NAME[n].attrs.find((a) => a.tag === g));
  assert.ok(p && p.y > 2.5 && t.y > p.y && b.y > t.y && b.x === t.x && t.x === p.x, `${n}: BMK, Bezeichnung, Polzahl übereinander oberhalb`);
}
assert.deepStrictEqual(["1", "2", "3", "n"].map((k) => polNext("LN", k)), ["LN", "2LN", "3LN", "L"], "Polzahl: Tasten 1–3 und N");
assert.strictEqual(polNext("3L", "n"), "3LN"); assert.strictEqual(polNext("", "2"), "2LN");
// Sicherung (CJ 23.10.2026): Striche im Rechteck je Polzahl, N = Strich mit Punkt, Anschlüsse wie PZ_SICH
assert.deepStrictEqual(["L", "LN", "2L", "2LN", "3L", "3LN"].map(sichName), ["PZ_SICH_1", "PZ_SICH_1N", "PZ_SICH_2", "PZ_SICH_2N", "PZ_SICH_3", "PZ_SICH_3N"]);
for (const [n, m, dot] of [["PZ_SICH_1", 1, 0], ["PZ_SICH_3", 3, 0], ["PZ_SICH_3N", 4, 1], ["PZ_SICH_1N", 2, 1]]) {
  const s = SYMBOL_BY_NAME[n], st = s.prims.filter((p) => p.t === "l" && p.y1 === p.y2 && p.x1 === -1.5 && p.y1 < -2.5 && p.y1 > -10);
  assert.ok(st.length === m && s.prims.filter((p) => p.t === "c" && p.f).length === dot, `${n}: ${m} Striche, ${dot} Punkt`);
  assert.deepStrictEqual(s.pins, SYMBOL_BY_NAME.PZ_SICH.pins, `${n}: Anschlüsse wie PZ_SICH`);
}
const nY = (n) => SYMBOL_BY_NAME[n].prims.find((p) => p.t === "c" && p.f).cy, lY = (n) => SYMBOL_BY_NAME[n].prims.filter((p) => p.t === "l" && p.y1 === p.y2 && p.x1 === -1.5 && p.y1 < -2.5 && p.y1 > -10).map((p) => p.y1);
assert.ok(nY("PZ_SICH_1N") === nY("PZ_SICH_3N") && lY("PZ_SICH_1N")[0] === lY("PZ_SICH_3")[0], "Sicherung: L1 und N immer am gleichen Platz (CJ 23.10.)");
console.log("ok Symbole");

// ---------- Datenmodell: Blatt prinzip, Papier, Modul, Rundlauf, Version 19 ----------
const doc = newDoc();
doc.sheets = [newSheet(), newSheet("prinzip"), { ...newSheet("prinzip"), var: 2 }];
const pz = doc.sheets[1];
pz.meta.BLATT = "1"; pz.meta.TITEL = "Prinzipschema EFH";
pz.paper = { size: "A3", quer: true };
let id = 1;
const sym = (name, x, y, rot = 0) => ({ id: id++, type: "symbol", sym: name, x, y, rot, attrs: Object.fromEntries(SYMBOL_BY_NAME[name].attrs.map((a) => [a.tag, a.def])) });
pz.items.push(sym("PZ_FILS", 40, 250), sym("PZ_LEITER_3", 100, 250), sym("PZ_VERBR", 140, 250), sym("PZ_ZAEHLER", 50, 120), sym("PZ_SICH", 50, 80), sym("PZ_HAK", 80, 40), sym("PZ_ERDER", 150, 40), sym("PZ_LS", 40, 230, 90),
  { id: id++, type: "wire", kind: "leitung", pts: [[20, 250], [40, 250]] }, { id: id++, type: "text", x: 150, y: 150, h: 3, s: "Unterverteilung" },
  { id: id++, type: "shape", k: "line", pts: [[10, 140], [287, 140]] });
pz.items[0].attrs.BMK = "3F1"; // von Hand
doc.nextId = id;
const txt = serializeModel(doc), o = JSON.parse(txt);
assert.strictEqual(VERSION, 19); assert.strictEqual(o.version, 19, "mit Prinzipschema Version 19");
const back = parseModel(txt);
assert.deepStrictEqual(JSON.parse(serializeModel(back)), o, "Speichern und Laden ohne Verlust");
assert.deepStrictEqual(back.sheets[1].paper, { size: "A3", quer: true });
assert.strictEqual(back.sheets[1].items[0].attrs.BMK, "3F1", "BMK von Hand bleibt");
assert.deepStrictEqual(back.sheets.map(modOf), ["schema", "prinzip", "prinzip:2"]);
assert.strictEqual(modName(back, "prinzip:2"), "Prinzipschema 2");
// ohne Prinzipschema bleibt die Version wie bisher
const d0 = newDoc(); d0.sheets[0].items.push({ id: 1, type: "text", x: 1, y: 1, h: 2.5, s: "x" });
assert.ok(JSON.parse(serializeModel(d0)).version < 19, "ohne Prinzipschema keine höhere Version");
// Papier: fehlt = A4 hoch; nur Grösse und Ausrichtung, Massstab immer 1:1
const raw = JSON.parse(txt); raw.sheets[2].paper = { size: "A9", quer: "ja", den: 50 };
const b2 = parseModel(JSON.stringify(raw)).sheets[2];
assert.deepStrictEqual(b2.paper, { size: "A3", quer: false }, "unbekanntes Papier: Vorgabe der Liste, quer nur bei true");
assert.deepStrictEqual(PZ.paperOf(newSheet("prinzip")), { size: "A4", quer: false, den: 1 });
// Objekte, die nicht aufs Prinzipschema gehören
const bad = JSON.parse(txt); bad.sheets[1].items.push({ id: 99, type: "terminals", x: 0, y: 0, cable: "", n: 3 });
assert.throws(() => parseModel(JSON.stringify(bad)), /Prinzipschema enthält nur/);
// Modulnamen
const named = JSON.parse(txt); named.mods = { "prinzip:2": { name: "Prinzip UV" } };
assert.strictEqual(modName(parseModel(JSON.stringify(named)), "prinzip:2"), "Prinzip UV");
console.log("ok Datenmodell");

// ---------- Schema-Logik lässt das Prinzipschema in Ruhe ----------
renumberAll(back);
assert.strictEqual(back.sheets[1].items[0].attrs.BMK, "3F1");
assert.strictEqual(back.sheets[1].items[3].attrs.BMK, "", "keine automatische BMK");
assert.ok(!partsList(back).some((r) => String(r[1]).includes("FI/LS")) && !fuseLegend(back).length, "nicht in Stückliste und Legende");
const ho = handedOver(back);
assert.ok(!inToc(back.sheets[1], ho), "nicht im Inhaltsverzeichnis");
assert.ok(sheetRank(back.sheets[1]) > sheetRank({ kind: "pvtab", var: 9 }) && sheetRank(back.sheets[1]) < sheetRank(back.sheets[2]), "Reihenfolge nach PV, je Modul");
assert.strictEqual(kindLabel(back.sheets[1]), "Prinzipschema"); assert.strictEqual(sheetNo(back.sheets[1], 1), "Prinzipschema 1");
assert.ok(!exportDxf(newSheet()).includes("PZ_"), "Schema-DXF ohne Blöcke des Prinzipschemas");
console.log("ok Abgrenzung");

// ---------- Seite: Papier, Rahmen, Plankopf, Inhalt ----------
const [page] = PZ.printPages(back.sheets[1]);
assert.ok(page.includes('viewBox="0 0 420 297"') && page.includes("width:420mm;height:297mm;page:pA3q"), "A3 quer");
assert.ok(page.includes("Prinzipschema · A3 quer") && page.includes("Prinzipschema EFH"), "Infozeile und Titel im Plankopf");
assert.ok(page.includes("FI/LS B13A 30mA") && page.includes("Unterverteilung") && page.includes("kWh"), "Inhalt gezeichnet");
const scr = PZ.sheetSVG(newSheet("prinzip"), { on: true, size: 2.5 }, 4);
assert.ok(scr.includes('class="paper" x="0" y="0" width="210" height="297"') && scr.includes("gridpat") && scr.includes("Prinzipschema · A4 hoch"), "Bildschirm A4 hoch mit Raster");
assert.deepStrictEqual(PZ.bounds(newSheet("prinzip")), { x0: -10, y0: -10, x1: 220, y1: 307 });
assert.deepStrictEqual(PZ.paperFrom(newSheet("prinzip"), "pquer", "1"), { size: "A4", quer: true });
assert.strictEqual(PZ.paperFrom({ paper: { size: "A4", quer: true } }, "pquer", "1"), null, "unverändert: kein Rückgängig-Schritt");
console.log("ok Seite");

// Beispielblatt nach dem Aufbau der Visualisierung (A4 hoch): oben Unterverteilung mit Abgängen, unten Hauptverteilung, Erdung.
// Für prinzip_tests.py (Browser, Bild für CJ). Texte frei gewählt.
export function beispielDoc() {
  const d = newDoc(), sh = newSheet("prinzip");
  d.sheets = [sh]; sh.meta.BLATT = "1"; sh.meta.TITEL = "Prinzipschema EFH"; sh.meta.OBJEKT = "Beispiel";
  let n = 1;
  const S = (name, x, y, rot = 0, set = {}) => sh.items.push({ id: n++, type: "symbol", sym: name, x, y, rot, attrs: { ...Object.fromEntries(SYMBOL_BY_NAME[name].attrs.map((a) => [a.tag, a.def])), ...set } });
  const L = (...pts) => sh.items.push({ id: n++, type: "wire", kind: "leitung", pts });
  const T = (x, y, s, h = 3) => sh.items.push({ id: n++, type: "text", x, y, h, s });
  const rows = [["PZ_FILS", ["FI/LS B13A 30mA", "LN"], 3, "3x1,5mm²", "Handtuchradiator 1 kW"], ["PZ_FILS", ["FI/LS C13A 30mA", "LN"], 3, "3x1,5mm²", "Licht Wohnen, Balkon"],
    ["PZ_LS", ["LS C 13A", "LN"], 3, "3x1,5mm²", "Licht Essen, Küche"], ["PZ_LS", ["LS B 16A", "3LN"], 5, "5x2,5mm²", "Kochherd 9,2 kW"], ["PZ_LS", ["LS B 16A", "3LN"], 5, "5x2,5mm²", "Wäscheturm 6,8 kW"],
    ["PZ_LS", ["LS B 13A", "LN"], 3, "3x1,5mm²", "Geschirrspüler 2,5 kW"], ["PZ_LS", ["LS B 13A", "3L"], 4, "4x1,5mm²", "Boiler 300 l, 6 kW"]];
  rows.forEach(([dev, [txt, pol], k, kab, verbr], i) => {
    const y = 270 - i * 15, end = 45 + SYMBOL_BY_NAME[dev].pins[1].x;
    L([25, y], [45, y]); S(dev, 45, y, 0, { TEXT: txt, POL: pol }); L([end, y], [100, y]); S(`PZ_LEITER_${k}`, 100, y, 0, { KABEL: kab }); L([105, y], [150, y]); S("PZ_VERBR", 150, y, 0, { TEXT: verbr });
  });
  L([25, 270], [25, 130]); S("PZ_LEITER_5", 25, 147.5, 270, { KABEL: "5x6mm²" });
  sh.items.push({ id: n++, type: "shape", k: "line", pts: [[10, 150], [200, 150]] });
  T(150, 155, "Unterverteilung"); T(150, 140, "Hauptverteilung");
  S("PZ_ZAEHLER", 25, 130); S("PZ_RSE", 60, 130, 0, { TEXT: "" }); L([60, 150], [60, 130]);
  L([25, 110], [25, 95]); S("PZ_SICH", 25, 95, 0, { TEXT: "DII 25 A" }); L([25, 82.5], [25, 70]);
  L([60, 110], [60, 95]); S("PZ_SICH", 60, 95, 0, { TEXT: "DII 10 A" }); L([60, 82.5], [60, 72.5]);
  S("PZ_SICH", 100, 95, 0, { TEXT: "DII" }); L([100, 82.5], [100, 70]); T(95, 100, "weitere Wohnungen", 2.5);
  S("PZ_KLEMME", 60, 72.5, 0, { TEXT: "plombierbar" }); L([25, 70], [57.5, 70]); L([62.5, 70], [140, 70]);
  L([60, 67.5], [60, 55]); S("PZ_LEITER_5", 60, 62.5, 270, { KABEL: "5x25mm²" });
  S("PZ_HAK", 60, 55); L([60, 37.5], [60, 30]);
  L([65, 50], [120, 50]); S("PZ_LEITER_1", 90, 50, 0, { KABEL: "16mm²" }); S("PZ_PA", 120, 50); L([122.5, 50], [160, 50]); S("PZ_ERDER", 160, 50);
  d.nextId = n;
  return d;
}
assert.deepStrictEqual(JSON.parse(serializeModel(parseModel(serializeModel(beispielDoc())))), JSON.parse(serializeModel(beispielDoc())), "Beispiel: Rundlauf");
console.log("Prinzipschema: alle Tests grün");
