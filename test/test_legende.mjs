// Legende der Sicherungsgruppen (legende.js, Ausbau UI Schritt 4): Zeilen, Spalten, Seiten, Nummer, Datei. Aufruf aus web-src: node test/test_legende.mjs
import assert from "node:assert";
import { newDoc, newSheet, parseModel, serializeModel, modOf } from "../src/model.js";
import { renumberAll } from "../src/numbering.js";
import * as T from "../src/titel.js";
import * as L from "../src/legende.js";

const dev = (id, sym, x, y, attrs) => ({ id, type: "symbol", sym, x, y, rot: 0, attrs: { BMK: "", ...attrs } });
const d = newDoc();
const s1 = d.sheets[0];
s1.items.push(dev(1, "FI_4P", 50, 150, { STROM: "40A", IDN: "30mA" }), dev(2, "LS_1P", 120, 150, { STROM: "13A", CHAR: "C" }), dev(3, "RCBO_2P", 200, 150, { STROM: "16A", CHAR: "B", IDN: "30mA" }));
s1.items.push({ id: 4, type: "terminals", x: 120, y: 45, cable: "3x1.5mm2", n: 3, name: "Küche", bmk: "", pe: "last", of: 2 });
const s2 = newSheet(); s2.items.push(dev(5, "NH_3P", 50, 150, { STROM: "100A", GROESSE: "NH00" })); d.sheets.push(s2);
const dp = newSheet("dispo"); dp.sid = 50; d.sheets.push(dp);
s2.meta.BLATT = "2"; d.nextId = 100;
T.ensureDeck(d); renumberAll(d);
const leg = d.sheets.find((s) => s.kind === "legend"); // vor der Disposition (CJ 16.10.)
assert.strictEqual(leg.kind, "legend"); assert.strictEqual(leg.meta.BLATT, "5", "nach dem letzten Schemablatt (3, 4)");
const rows = L.legendRows(d);
assert.deepStrictEqual(rows.map((r) => r.bmk), ["3F2", "3F4", "3F6", "4F2"], "sortiert nach Blatt und BMK");
assert.deepStrictEqual(rows.map((r) => r.rcd), [true, false, true, false], "RCD und RCBO markiert");
assert.strictEqual(rows[1].name, "Küche"); assert.strictEqual(rows[1].kabel, "3x1.5mm2");
assert.match(rows[0].ort, /^3\.[A-F]2$/);
console.log("Zeilen ok");

// Spalten: alle wählbar, Vorgabe BMK, Nennstrom, Bezeichnung, Breite immer 180 mm
const ALL = ["BMK", "STROM", "CHAR", "IDN", "GERAET", "POLE", "GROESSE", "NAME", "KABEL", "KLEMMEN", "ORT"];
const w = (show) => Math.round(L.visibleCols({ show }).reduce((a, c) => a + c.w, 0) * 1000) / 1000;
assert.deepStrictEqual(leg.show, ["BMK", "STROM", "NAME"]);
assert.deepStrictEqual(L.visibleCols(leg).map((c) => c.key), ["BMK", "STROM", "NAME"]);
assert.deepStrictEqual(L.visibleCols({ show: ["ORT", "BMK", "CHAR"] }).map((c) => c.key), ["BMK", "CHAR", "ORT"], "Reihenfolge fest");
for (const c of [["BMK"], ["NAME"], leg.show, ALL, ["ORT", "KABEL"]]) assert.strictEqual(w(c), 180);
console.log("Spalten ok");

// Seiten: Kopf, blaue RCD-Zeilen, Prüfhinweis auf jeder Seite, A4 hoch
let pg = L.printPages(d, leg);
assert.strictEqual(pg.length, 1);
assert.match(pg[0], /viewBox="0 0 210 297"/); assert.match(pg[0], /page:pA4h/);
assert.ok(pg[0].includes(L.NOTICE.slice(0, 30)), "Prüfhinweis");
assert.ok((pg[0].match(new RegExp(`font-weight="600"[^>]*fill="${L.BLUE}"[^>]*>3F`, "g")) || []).length >= 2, "RCD-Zeilen blau");
for (let i = 0; i < 60; i++) s2.items.push(dev(200 + i, "LS_1P", 20 + (i % 8) * 34, 160 - Math.floor(i / 8) * 12, { STROM: "10A" }));
renumberAll(d);
assert.strictEqual(L.pageCount(d), Math.ceil(64 / L.ROWS_PER_PAGE));
pg = L.printPages(d, leg);
assert.ok(pg.length > 1 && pg.every((p) => p.includes(L.NOTICE.slice(0, 30))), "Hinweis auf jeder Seite");
console.log("Seiten ok");

// Neues Schemablatt hinten angehängt: kommt vor die Legende, Legende vor die Disposition (CJ 16.10.), Nummer mit
d.sheets.push(Object.assign(newSheet(), { meta: { ...newSheet().meta, BLATT: "9" } }));
T.syncDeck(d);
const lg = d.sheets.findIndex((s) => s.kind === "legend");
assert.strictEqual(d.sheets[lg - 1].meta.BLATT, "9"); assert.strictEqual(d.sheets[lg + 1].kind, "dispo"); assert.strictEqual(d.sheets[lg].meta.BLATT, "10");
// Datei: Spalten bleiben, unbekannte fallen weg, fehlende = Vorgabe, altes cols wird umgerechnet
leg.show = ["KABEL", "ORT", "XX"];
const back = parseModel(serializeModel(d));
assert.deepStrictEqual(back.sheets.find((s) => s.kind === "legend").show, ["KABEL", "ORT"]);
const o = JSON.parse(serializeModel(d)); delete o.sheets.find((s) => s.kind === "legend").show;
assert.deepStrictEqual(parseModel(JSON.stringify(o)).sheets.find((s) => s.kind === "legend").show, ["BMK", "STROM", "NAME"]);
o.sheets.find((s) => s.kind === "legend").cols = ["IDN", "CHAR", "XX"];
assert.deepStrictEqual(parseModel(JSON.stringify(o)).sheets.find((s) => s.kind === "legend").show, ["BMK", "STROM", "CHAR", "IDN", "ORT"], "altes cols: BMK, Nennstrom, Ort dazu");
console.log("Datei ok");

// Legende als eigenes Modul (CJ 21.10.2026): Kennung „legende“, nicht im Schema; Status und Platz bleiben in der Datei
assert.strictEqual(modOf(leg), "legende");
assert.deepStrictEqual([...new Set(d.sheets.filter((s) => s.kind !== "legend").map(modOf))].sort(), ["dispo", "schema"], "Titelseite und Inhalt im Schema, Legende nicht");
assert.ok(!d.sheets.filter((s) => modOf(s) === "schema").some((s) => s.kind === "legend"), "Schema ohne Legende");
d.mods = { legende: { st: "Geprüft", o: 2 }, "legende:2": { st: "Geprüft" } };
assert.deepStrictEqual(parseModel(serializeModel(d)).mods, { legende: { st: "Geprüft", o: 2 } }, "legende gilt, legende:2 nicht");
console.log("Modul ok");
console.log("ok");
