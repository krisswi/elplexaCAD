// Korrekturen aus dem Prüfdurchgang CJ 16.10.2026: ZIP für „DXF alle Blätter“, Klemmen beim unteren Gerät, Bezeichnung in der Legende.
// Aufruf aus web-src: node test/test_korrekturen.mjs
import assert from "node:assert";
import { newDoc, parseModel, serializeModel } from "../src/model.js";
import { renumberAll } from "../src/numbering.js";
import { baseItems } from "../src/template.js";
import { crc32, zipFiles } from "../src/zip.js";
import { legendRows } from "../src/legende.js";
import { listsCsv } from "../src/auswertung.js";
import { deviceTerminals } from "../src/numbering.js";

// ZIP: Prüfsumme nach Norm, Aufbau mit lokalen Köpfen, Verzeichnis und Ende
assert.strictEqual(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
const z = zipFiles([["A_Blatt-3.dxf", "0\nEOF\n"], ["Ä_Blatt-4.dxf", "x"]]), dv = new DataView(z.buffer);
assert.strictEqual(dv.getUint32(0, true), 0x04034b50, "lokaler Kopf");
assert.strictEqual(dv.getUint32(z.length - 22, true), 0x06054b50, "Ende des Verzeichnisses");
assert.strictEqual(dv.getUint16(z.length - 22 + 10, true), 2, "2 Dateien");
console.log("ZIP ok");

// RCD oben, LS darunter in derselben Spalte: Klemmen wandern zum unteren Gerät
const d = newDoc(), sh = d.sheets[0]; sh.meta.BLATT = "3";
const ids = () => d.nextId++;
sh.items.push(...baseItems(ids));
const fi = { id: ids(), type: "symbol", sym: "FI_2P", x: 97.5, y: 160, rot: 0, attrs: { BMK: "", STROM: "40A", IDN: "30mA" } };
sh.items.push(fi); const t = deviceTerminals(fi, sh.items, ids); t.name = "Küche"; sh.items.push(t);
const ls = { id: ids(), type: "symbol", sym: "LS_1P", x: 97.5, y: 130, rot: 0, attrs: { BMK: "", STROM: "13A", CHAR: "C" } };
sh.items.push(ls); renumberAll(d);
assert.strictEqual(t.of, ls.id, "Klemmen gehören zum LS (unten)");
assert.deepStrictEqual([fi.attrs.BMK, ls.attrs.BMK, t.bmk], ["3F3", "3F3.1", "3X3"]);
// Legende: LS hat die Bezeichnung der Klemmen, der RCD eine eigene
let rows = legendRows(d);
assert.deepStrictEqual(rows.map((r) => [r.bmk, r.name, r.klemmen]), [["3F3", "", ""], ["3F3.1", "Küche", "3X3"]]);
fi.bez = "RCD Küche und Bad"; t.name = "Steckdosen Küche";
rows = legendRows(d);
assert.deepStrictEqual(rows.map((r) => r.name), ["RCD Küche und Bad", "Steckdosen Küche"], "RCD eigene Bezeichnung, LS die der Klemmenleiste");
assert.match(listsCsv(d), /RCD Küche und Bad/);
const d2 = parseModel(serializeModel(d));
assert.deepStrictEqual(d2.sheets[0].items.filter((i) => i.bez).map((i) => i.bez), ["RCD Küche und Bad"], "bleibt in der Datei");
console.log("Klemmen und Legende ok");
console.log("Korrekturen: alle Tests ok");
