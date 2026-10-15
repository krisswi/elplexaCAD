import fs from "fs";
import assert from "node:assert";
import { newSheet } from "../src/model.js";
import { baseItems } from "../src/template.js";
import { exportDxf } from "../src/dxf.js";
import { META_FIELDS, metaText } from "../src/frame.js";
const m = newSheet();
m.meta.OBJEKT = "Größe äöü Test"; m.meta.TITEL = "Hausverteilung"; m.meta.AUFTRAG = "2026-001";
m.items.push(
  { id:1, type:"symbol", sym:"LS_3P", x:100, y:150, rot:0, attrs:{BMK:"1F1",STROM:"16A",CHAR:"B"} },
  { id:2, type:"symbol", sym:"FI_4P", x:50, y:150, rot:90, attrs:{BMK:"1Q1",STROM:"40A",IDN:"30mA"} },
  { id:3, type:"terminals", x:100, y:60, cable:"7x2.5mm2", n:7, name:"Zuleitung ä", bmk:"X1", pe:"last" },
  { id:4, type:"symbol", sym:"MOTOR_3P", x:150, y:100, rot:0, attrs:{BMK:"1M1",LEISTUNG:"",SPANNUNG:"400V"} },
  { id:5, type:"wire", kind:"neutral", pts:[[20,190],[277,190]] },
  { id:6, type:"wire", kind:"leitung", pts:[[100,150],[100,160],[120,160]] },
  { id:7, type:"text", x:20, y:60, h:3.5, s:"Kabel TT 5x1,5 äöü" },
);
let nid = 100; m.items.push(...baseItems(() => nid++));
fs.writeFileSync(process.argv[2] || "test_out.dxf", exportDxf(m));
// Schriftfeld: langer Text wird auf die Zellbreite gekürzt, im DXF gleich wie in der Anzeige, das Modell bleibt unverändert
const long = newSheet(), t = "Hausverteilung Erdgeschoss Wohnung links mit Unterverteilung Garage";
long.meta.TITEL = t; long.meta.AUFTRAG = "2026-001";
const cut = metaText(META_FIELDS.find((f) => f.tag === "TITEL"), t);
assert.ok(cut.endsWith("...") && cut.length < t.length && t.startsWith(cut.slice(0, -3)));
const d2 = exportDxf(long);
assert.ok(d2.includes(cut) && !d2.includes(t) && d2.includes("2026-001") && long.meta.TITEL === t);
console.log("ok");
