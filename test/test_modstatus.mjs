// Modulstatus und Reihenfolge der Module (CJ 20.10.2026, Übersicht Etappe 1): Logik ohne Browser.
// Aufruf: node test/test_modstatus.mjs [Ausgabe.dxf]
import assert from "node:assert";
import { newDoc, newSheet, parseModel, serializeModel, VERSION, MOD_STATUS, cleanMods } from "../src/model.js";
import { projSummary, onlineSummary, modIds, modMenuHTML, modStatus, modPill, modStatusMenuHTML, hubHTML, keysHTML } from "../src/elplexa.js";

assert.deepStrictEqual(MOD_STATUS, ["Offen", "In Arbeit", "Geprüft", "Versendet", "Revision", "Archiviert"], "Reihenfolge laut CJ");
assert.strictEqual(VERSION, 18);

// Dokument mit Schema, Disposition, PV
const mk = () => {
  const d = newDoc(), di = newSheet("dispo"), pv = newSheet("pv"), s2 = newSheet("schema"); s2.var = 2;
  di.meta.BLATT = "1"; pv.meta.BLATT = "1"; di.sid = 90; pv.sid = 91;
  d.sheets.push(di, pv, s2); d.nextId = 100;
  return d;
};
const d = mk();
assert.deepStrictEqual(modIds(d), ["schema", "schema:2", "dispo", "pv"], "Standardfolge: Art, dann Nummer");
assert.strictEqual(modStatus(d, "pv"), "Offen", "ohne Eintrag: Offen");

// ohne neue Felder bleibt die Version, wie sie war
assert.strictEqual(JSON.parse(serializeModel(d)).version, 16, "zweites Schema = 16, ohne Status und Reihenfolge nicht 18");

// Status + Reihenfolge: Version 18, Rundlauf, Reihenfolge wirkt
d.mods = { pv: { st: "Geprüft", o: 1 }, "schema:2": { name: "HV", o: 2 }, schema: { o: 3 }, dispo: { st: "Archiviert", o: 4 } };
const txt = serializeModel(d), back = parseModel(txt);
assert.strictEqual(JSON.parse(txt).version, 18);
assert.deepStrictEqual(back.mods, d.mods, "Rundlauf ohne Verlust");
assert.deepStrictEqual(modIds(back), ["pv", "schema:2", "schema", "dispo"]);
assert.strictEqual(modStatus(back, "pv"), "Geprüft"); assert.strictEqual(modStatus(back, "dispo"), "Archiviert");
assert.deepStrictEqual(JSON.parse(serializeModel(back)), JSON.parse(txt));

// Module ohne Platz folgen hinter den geordneten
const d2 = mk(); d2.mods = { dispo: { o: 1 } };
assert.deepStrictEqual(modIds(d2), ["dispo", "schema", "schema:2", "pv"]);

// Ungültiges fliegt raus, Offen wird nicht gespeichert, Name/cont bleiben
assert.deepStrictEqual(cleanMods({ pv: { st: "Offen" }, dispo: { st: "Kaputt", o: 0 }, schema: { st: "Revision", o: 2.5, name: "A" } }), { schema: { name: "A", st: "Revision" } });
assert.strictEqual(cleanMods({ pv: { st: "Offen" } }), null);

// Eintrag ohne vorhandenes Modul fällt beim Laden weg (kein Übergang auf ein neues Modul gleicher Kennung)
const orph = parseModel(JSON.stringify({ ...JSON.parse(serializeModel(mk())), version: 18, mods: { "pv:3": { st: "Revision", o: 1 }, pv: { st: "Geprüft" } } }));
assert.deepStrictEqual(orph.mods, { pv: { st: "Geprüft" } });

// Menü im Editor in der Reihenfolge der Übersicht
const mm = modMenuHTML(back, null), pos = (id) => mm.indexOf(`data-elopen="${id}"`);
assert.ok(pos("pv") < pos("schema:2") && pos("schema:2") < pos("schema") && pos("schema") < pos("dispo"), "Modulmenü folgt der eigenen Reihenfolge");

// Alte Datei (Version 16 mit Namen) öffnet unverändert
const old = JSON.stringify({ ...JSON.parse(serializeModel(mk())), version: 16, mods: { pv: { name: "PV Ost" } } });
const o = parseModel(old); assert.deepStrictEqual(o.mods, { pv: { name: "PV Ost" } }); assert.strictEqual(JSON.parse(serializeModel(o)).version, 16);

// Anzeige: Pille, Taste N = Stelle der Kachel
const h = hubHTML(back, { name: "T", today: "2026-10-20", label: () => "B", pview: true });
assert.ok(h.includes('data-elmst="pv"') && h.includes(">Geprüft<"));
const order = [...h.matchAll(/data-elopen="([^"]+)" data-exact/g)].map((m) => m[1]);
assert.deepStrictEqual(order, ["pv", "schema:2", "schema", "dispo"]);
assert.ok(/id="el-tile-pv"[^]*?<kbd>1<\/kbd>/.test(h) && /id="el-tile-dispo"[^]*?<kbd>4<\/kbd>/.test(h));
const ro = hubHTML(back, { name: "T", today: "x", label: () => "B", shared: {} });
assert.ok(!ro.includes("S ändert den Status") && ro.includes("0 die Übersicht"), "geteilte Ansicht: keine Bearbeiten-Tasten im Hinweis");
assert.ok(!ro.includes("data-elmst") && ro.includes('class="el-mst"'), "geteilte Ansicht: Status nur zu sehen");
assert.strictEqual((modStatusMenuHTML(back, "pv").match(/data-elmstset/g) || []).length, 6);
assert.ok(modStatusMenuHTML(back, "pv").includes('aria-checked="true"'));
assert.ok(keysHTML().includes("Modulstatus"));
// Projekt-Index (Etappe 3a): Zusammenfassung für die Projektkacheln
back.project = { meta: { OBJEKT: "Bärgen 268" }, time: [{ d: "2026-10-20", h: 1.5, n: "" }, { d: "2026-10-21", h: 0.25, n: "" }] };
assert.deepStrictEqual(projSummary(back), { obj: "Bärgen 268", mods: [["pv", "Geprüft"], ["schema", "Offen"], ["schema", "Offen"], ["dispo", "Archiviert"]], n: back.sheets.length, h: 1.75 });
assert.deepStrictEqual(onlineSummary({ pm: back.project.meta, pt: back.project.time }), { obj: "Bärgen 268", h: 1.75 });
assert.strictEqual(onlineSummary(null), null);
assert.deepStrictEqual(onlineSummary({ pm: null, pt: null }), { obj: "", h: 0 });
console.log("Modulstatus ok");
