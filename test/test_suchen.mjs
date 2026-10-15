import assert from "node:assert";
import { newDoc, newSheet } from "../src/model.js";
import { renumberAll } from "../src/numbering.js";
import { findHits, replaceAll } from "../src/suchen.js";
const doc = newDoc();
doc.sheets.push(newSheet());
doc.sheets[0].meta.BLATT = "10"; doc.sheets[1].meta.BLATT = "11";
const sym = (id, x) => ({ id, type: "symbol", sym: "LS_1P", x, y: 150, rot: 0, attrs: { BMK: "", STROM: "13A", CHAR: "B" } });
doc.sheets[0].items.push(sym(1, 40), { id: 2, type: "text", x: 10, y: 10, h: 2.5, s: "Zuleitung 10F1" });
doc.sheets[1].items.push(sym(3, 40), { id: 4, type: "terminals", x: 40, y: 45, cable: "", n: 2, name: "", bmk: "11X1", of: 3 });
renumberAll(doc);
assert.deepStrictEqual(findHits(doc, "10f").map((h) => h.id), [1]);
assert.strictEqual(findHits(doc, "10f", { matchCase: true }).length, 0);
assert.deepStrictEqual(findHits(doc, "f1", { scope: "alle" }).map((h) => h.id), [1, 2, 3]);
assert.strictEqual(replaceAll(doc, "11X", "12X"), 1);
assert.strictEqual(doc.sheets[1].items[1].bmk, "12X1");
assert.strictEqual(replaceAll(doc, "10F", "20F"), 1);
renumberAll(doc);
assert.strictEqual(doc.sheets[0].items[0].attrs.BMK, "20F1"); // bleibt nach Neunummerierung (manual)
assert.strictEqual(doc.sheets[0].items[1].s, "Zuleitung 10F1"); // Text nur im Bereich "alle"
console.log("ok");
