import assert from "node:assert";
import { newDoc, newSheet } from "../src/model.js";
import { fuseLegend, partsList, listsCsv } from "../src/auswertung.js";
const d = newDoc();
const s1 = d.sheets[0]; s1.meta.BLATT = "10";
s1.items.push(
  { id: 1, type: "symbol", sym: "LS_1P", x: 50, y: 150, rot: 0, attrs: { BMK: "10F2", STROM: "13A", CHAR: "C" } },
  { id: 2, type: "symbol", sym: "LS_1P", x: 20, y: 150, rot: 0, attrs: { BMK: "10F1", STROM: "13A", CHAR: "C" } },
  { id: 3, type: "terminals", x: 20, y: 45, cable: "TT 3x1.5", n: 3, name: "Küche; Licht", bmk: "10X1", pe: "last", of: 2 },
  { id: 4, type: "symbol", sym: "VOUT_3P", x: 200, y: 150, rot: 0, attrs: { ZIEL: "offen" } },
);
const s2 = newSheet(); s2.meta.BLATT = "9"; d.sheets.push(s2);
s2.items.push({ id: 5, type: "symbol", sym: "FI_4P", x: 50, y: 150, rot: 0, attrs: { BMK: "9Q1", STROM: "40A", IDN: "30mA" } });
d.sheets.push(newSheet("dispo"));
const L = fuseLegend(d);
assert.deepStrictEqual(L.map((r) => r[1]), ["9Q1", "10F1", "10F2"]); // nach Blatt, dann BMK
assert.deepStrictEqual(L[1].slice(8), ["10X1", "TT 3x1.5", "Küche; Licht"]);
const P = partsList(d);
const row = (n) => P.find((r) => r[1] === n);
assert.deepStrictEqual(row("Leitungsschutzschalter 1-polig"), [2, "Leitungsschutzschalter 1-polig", "13A C", "10F2, 10F1"]);
assert.deepStrictEqual(row("Reihenklemme").slice(0, 1), [2]);
assert.deepStrictEqual(row("PE-Klemme").slice(0, 1), [1]);
assert.ok(!P.some((r) => r[1].startsWith("Verweis")));
const csv = listsCsv(d);
assert.ok(csv.startsWith("﻿Sicherungslegende\r\n") && csv.includes('"Küche; Licht"') && csv.includes("\r\nStückliste\r\n"));
// Formelschutz: Zellen mit = + - @ am Anfang bekommen ein Hochkomma
const d2 = newDoc();
d2.sheets[0].items.push({ id: 1, type: "symbol", sym: "LS_1P", x: 20, y: 150, rot: 0, attrs: { BMK: "=HYPERLINK(1)", STROM: "+13A", CHAR: "-C" } },
  { id: 2, type: "terminals", x: 20, y: 45, cable: "@SUM(A1)", n: 3, name: "a=b", bmk: "1X1", pe: "last", of: 1 });
const csv2 = listsCsv(d2);
for (const t of ["'=HYPERLINK(1)", "'+13A", "'@SUM(A1)"]) assert.ok(csv2.includes(t), t);
assert.ok(!/(^|;)[=+\-@]/m.test(csv2) && csv2.includes(";a=b"));
console.log("ok");
