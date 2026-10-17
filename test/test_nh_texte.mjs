// Tests Disposition 16.10.2026 (Bärgen 268): NH-Trenner Weber Silas und Vertigroup, Textzeilen statt „|“, Textgrösse pro Bauteil.
// Aufruf: node test/test_nh_texte.mjs [Beleg.schemacad.json]  (mit Argument wird die Übersicht aller NH-Typen als Datei geschrieben, für nh_texte_tests.py)
import assert from "node:assert";
import fs from "node:fs";
import * as D from "../src/dispo.js";
import * as K from "../src/schrank.js";
import { newDoc, newSheet, parseModel, serializeModel } from "../src/model.js";
import { exportDxf } from "../src/dxf.js";

const texts = (ps) => ps.filter((p) => p.k === "text");
const save = (items) => { const doc = newDoc(), sh = newSheet("dispo"); sh.sid = 3; sh.items = items; doc.sheets = [sh]; doc.nextId = 999; return serializeModel(doc); };
const load = (txt) => parseModel(txt).sheets[0].items;

// ---------- (a) NH Weber ----------
const S = K.NH_MAKERS.silas.sizes, V = K.NH_MAKERS.vertigroup.sizes;
assert.deepStrictEqual(Object.keys(S).sort(), ["00", "000", "1", "2", "3"], "Silas Gr. 000 bis 3");
assert.deepStrictEqual([S["000"].w, S["000"].h, S["00"].w, S["00"].h, S[1].w, S[1].h, S[2].w, S[3].w], [53, 216, 106, 206, 184, 308, 210, 250], "Silas-Masse laut Massblatt");
assert.deepStrictEqual([S["00"].pitch, S[1].pitch, S[2].pitch, S[3].pitch], [33, 57, 65, 80], "Polteilung");
assert.deepStrictEqual([V["1-3"].w, V["1-3"].h, V[1000].h, V[2000].w], [100, 671, 745, 200], "Vertigroup-Masse");
assert.deepStrictEqual([V["00-3"].w, V["00-3"].h, V["00-3"].d, V["00-3"].amp], [50, 401, 123, "160"], "Vertigroup NH00 (Hager LVS00100RP, Breite Annahme)");
assert.ok(K.NH_MAKERS.std.sizes === K.NH_SIZES, "bisherige Grössen bleiben");
const si = { id: 1, ...K.newPart("NHSILAS", 0, 0) };
assert.deepStrictEqual([si.maker, si.size, si.w, si.h, si.s], ["silas", "1", 184, 308, "250"]);
const fuses = K.partPrims(si).filter((p) => p.k === "rect" && p.fill === "none" && p.w < 50).map((p) => p.x + p.w / 2).sort((a, b) => a - b);
assert.deepStrictEqual(fuses.map((x) => Math.round(x - fuses[0])), [0, 57, 114], "drei Sicherungen in der Polteilung 57");
assert.ok(texts(K.partPrims(si)).some((t) => t.s === "Gr.1") && texts(K.partPrims(si)).some((t) => t.s === "250"));
const vg = { id: 2, ...K.newPart("NHVG", 300, 0) };
assert.deepStrictEqual([vg.maker, vg.w, vg.h], ["vertigroup", 100, 671]);
for (const [m, t] of Object.entries(K.NH_MAKERS)) for (const z of Object.keys(t.sizes)) {
  const p = { type: "part", kind: "NH", x: 0, y: 0, maker: m === "std" ? undefined : m, size: z }; Object.assign(p, K.partSize(p));
  const rs = K.partPrims(p).filter((q) => q.k === "rect"), b = { x0: Math.min(...rs.map((r) => r.x)), y0: Math.min(...rs.map((r) => r.y)), x1: Math.max(...rs.map((r) => r.x + r.w)), y1: Math.max(...rs.map((r) => r.y + r.h)) };
  assert.ok(b.x0 >= -0.01 && b.x1 <= p.w + 0.01 && b.y0 >= -0.01 && b.y1 <= p.h + 0.01, `${m} ${z}: Zeichnung im Umriss`);
}
// Speichern und Laden, Version 9; unbekannter Hersteller fällt auf Standard, unbekannte Grösse auf die erste
let txt = save([si, vg]);
assert.strictEqual(JSON.parse(txt).version, 12); // 12 seit 16.10.2026: Vertigroup NH1 bis NH3
let back = load(txt);
assert.deepStrictEqual(back, [si, vg].map((i) => JSON.parse(JSON.stringify(i))), "Rundlauf unverändert");
back = load(txt.replace('"maker": "silas"', '"maker": "xyz"').replace('"size": "1-3"', '"size": "99"'));
assert.ok(!back[0].maker && back[0].size === "1" && back[1].size === "1-3");
// alte NH ohne Hersteller bleiben unverändert (Version 8)
const old = { id: 5, ...K.newPart("NH00", 0, 0) };
txt = save([old]);
assert.strictEqual(JSON.parse(txt).version, 8);
assert.deepStrictEqual(load(txt), [old]);
// DXF
const dx = exportDxf({ ...newSheet("dispo"), items: [si, vg] });
assert.ok(dx.includes("\nGr.1\n") && dx.includes("\nNH1\n"), "DXF mit Typ-Text");
console.log("ok nh weber");

// ---------- (b) Textzeilen ----------
const z = { id: 3, ...K.newPart("ZBOX", 0, 0) };
assert.deepStrictEqual(z.lines, ["Zähler", "Gewerbe", "H5.EG.11", "EG"]);
assert.ok(K.PART_PRESET_BY_ID.ZBOX.p.lines !== z.lines, "Vorlage wird kopiert, nicht geteilt");
const oldK = { id: 4, type: "part", kind: "KASTEN", x: 0, y: 0, w: 220, h: 110, s: "Prüfklemme|Lief.baus.", round: true };
const oldZ = { id: 6, type: "part", kind: "ZBOX", x: 300, y: 0, w: 170, h: 195, s: "A||C", bmk: "P1" };
const raw = JSON.stringify({ format: JSON.parse(save([])).format, version: 8, sheets: [{ kind: "dispo", sid: 3, meta: {}, items: [oldK, oldZ] }] });
back = load(raw);
assert.deepStrictEqual(back.map((i) => i.lines), [["Prüfklemme", "Lief.baus."], ["A", "", "C"]], "„|“ wird beim Laden zu Zeilen, leere Zeile bleibt");
assert.ok(back.every((i) => !("s" in i)));
assert.deepStrictEqual(D.planPrims(back), D.planPrims([oldK, oldZ]), "Bild unverändert");
assert.deepStrictEqual(load(save(back)), back, "Rundlauf mit Zeilen");
const pipe = { ...back[0], lines: ["a|b", "c"] };
assert.deepStrictEqual(texts(K.partPrims(pipe)).map((t) => t.s), ["a|b", "c"], "„|“ ist jetzt normales Zeichen");
console.log("ok textzeilen");

// ---------- (c) Textgrösse ----------
const dev = { id: 7, type: "device", x: 0, y: 0, te: 1, h: 83, kind: "LS", label: "C13", bmk: "F1" };
const h1 = texts(D.planPrims([dev])).map((t) => t.h), h2 = texts(D.planPrims([{ ...dev, tf: 1.5 }])).map((t) => t.h);
// seit 16.10.2026: Texte aussen 10 mm × Faktor, höchstens gerätebreit (BMK „F1“ auf 17,5 mm)
assert.deepStrictEqual(h2, [h1[0] * 1.5, Math.round(K.fitH(15, "F1", 17.5) * 1000) / 1000], "Gerät: Texte × 1,5, aussen höchstens gerätebreit");
const cab = { id: 8, ...K.newCabinet(0, 100), tf: 2 };
const ct = D.planPrims([cab], { dims: true }), cm = ct.filter((p) => p.k === "text" && p.layer === "SCH_DISPO_MASS");
assert.ok(texts(ct).find((t) => t.s === "IP4").h === 2 * K.CAB_TEXT && cm.every((t) => t.h === D.DIM_PLAN), "Schrank: Text × 2, Bemassung bleibt");
const pl = { id: 9, type: "plate", x: 0, y: 0, w: 500, h: 400, name: "A", tf: 0.5 };
assert.strictEqual(texts(D.planPrims([pl])).find((t) => t.s.startsWith("A")).h, 6);
const nh = { ...si, tf: 1.2 };
assert.ok(texts(D.planPrims([nh])).every((t, i) => t.h === Math.round(texts(K.partPrims(si))[i].h * 1.2 * 1000) / 1000), "Teil skaliert");
txt = save([{ ...dev, tf: 1.5 }, pl]);
assert.strictEqual(JSON.parse(txt).version, 9);
assert.deepStrictEqual(load(txt).map((i) => i.tf), [1.5, 0.5]);
assert.ok(!("tf" in load(save([{ ...dev, tf: 1 }]))[0]), "100 % wird nicht gespeichert");
const dev4 = { ...dev, te: 4 }; // breites Gerät: Texte passen auch doppelt so gross (seit 16.10.2026 höchstens gerätebreit)
const dxa = exportDxf({ ...newSheet("dispo"), items: [dev4] }), dxb = exportDxf({ ...newSheet("dispo"), items: [{ ...dev4, tf: 2 }] });
const th = (d) => [...d.matchAll(/\nTEXT\n[\s\S]*?\n40\n([\d.]+)\n/g)].map((m) => Number(m[1]));
assert.deepStrictEqual(th(dxb), th(dxa).map((h) => h * 2), "DXF: Texthöhe × 2");
// „An Schema“: Ansicht nimmt die Textgrösse mit
const v = { type: "dispoview", x: 0, y: 0, den: 10, bx: 0, by: 0, bw: 100, bh: 100, items: [{ ...dev4, tf: 3 }] };
assert.ok(texts(D.viewPrims(v)).some((t) => t.s === "F1" && t.h === 30), "Ansicht: BMK 10 × 3 (seit 16.10.2026 Texte aussen 10 mm)");
console.log("ok textgroesse");

// ---------- Belegdatei: alle NH-Typen nebeneinander ----------
if (process.argv[2]) {
  const items = []; let x = 0, id = 0;
  for (const [m, t] of Object.entries(K.NH_MAKERS)) {
    for (const zz of t.order) {
      const p = { id: ++id, type: "part", kind: "NH", x, y: 0, size: zz, ...(m === "std" ? {} : { maker: m }) };
      Object.assign(p, K.partSize(p), { s: t.sizes[zz].amp || "", s2: m === "std" ? "Standard" : m === "silas" ? "Silas" : "VG " + zz });
      items.push(p); x += p.w + 40;
    }
    x += 80;
  }
  items.push({ id: ++id, type: "part", kind: "ZBOX", x: 0, y: 800, w: 170, h: 195, lines: ["Zähler", "Gewerbe", "H5.EG.11", "EG"], bmk: "122F1", tf: 1.3 });
  items.push({ id: ++id, type: "part", kind: "KASTEN", x: 250, y: 800, w: 220, h: 110, lines: ["Zeile 1", "Zeile 2", "Zeile 3"], round: true });
  const doc = newDoc(), sh = newSheet("dispo"); sh.sid = 1; sh.meta.TITEL = "NH Weber Silas und Vertigroup"; sh.items = items; doc.sheets = [sh]; doc.nextId = id + 1;
  fs.writeFileSync(process.argv[2], serializeModel(doc));
  console.log("geschrieben:", process.argv[2]);
}
