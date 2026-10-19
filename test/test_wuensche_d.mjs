// Wünsche D (CJ 19.10.2026): D2 Inhaltsverzeichnis nur Schema und übergebene Dispo, D3 Blattnummern beim Verschieben. Aufruf aus web-src: node test/test_wuensche_d.mjs
import assert from "node:assert";
import { newDoc, newSheet, serializeModel, parseModel } from "../src/model.js";
import * as T from "../src/titel.js";

const sheet = (kind, no) => { const s = newSheet(kind); s.meta.BLATT = String(no); return s; };
const nums = (l) => l.map((s) => s.meta.BLATT);

// D3, Beispiel CJ: Blätter 2, 3, 4, 5, 10, 40 und Dispo 41; die Dispo zwischen 3 und 4 ziehen
const l = [2, 3, 4, 5, 10, 40].map((n) => sheet(undefined, n)), dispo = sheet("dispo", 41);
const [b2, b3, b4, b5, b10, b40] = l;
const order = [b2, b3, dispo, b4, b5, b10, b40];
const ch = T.renumberMoved(order, 2);
assert.deepStrictEqual(nums(order), ["2", "3", "4", "5", "6", "10", "40"], "Dispo 4, alte 4 → 5, alte 5 → 6, 10 und 40 bleiben");
assert.strictEqual(dispo.meta.BLATT, "4"); assert.strictEqual(b4.meta.BLATT, "5"); assert.strictEqual(b5.meta.BLATT, "6");
assert.deepStrictEqual(ch, [dispo, b4, b5], "nur geänderte Blätter");

// Weitere Fälle: ganz nach vorne (Nummer des Nachfolgers), in eine Lücke, ans Ende, nicht-Zahl stoppt
const mk = (a) => a.map((n) => sheet(undefined, n));
let x = mk([7, 3, 4, 5]); T.renumberMoved(x, 0); assert.deepStrictEqual(nums(x), ["3", "4", "5", "6"], "vorne: nimmt 3, die übrigen zählen hoch");
x = mk([2, 3, 9, 10, 20]); T.renumberMoved(x, 2); assert.deepStrictEqual(nums(x), ["2", "3", "4", "10", "20"], "in der Lücke: 4, 10 bleibt");
x = mk([2, 3, 4, 5, 3]); T.renumberMoved(x, 4); assert.deepStrictEqual(nums(x), ["2", "3", "4", "5", "6"], "ans Ende (von aussen): Vorgänger + 1");
// Nach hinten: übersprungene Blätter rücken vor, Zurückziehen stellt den alten Stand wieder her
x = mk([3, 5, 4]); T.renumberMoved(x, 2, 1); assert.deepStrictEqual(nums(x), ["3", "4", "5"], "Blatt 4 hinter 5 zurück: 3, 4, 5");
x = mk([2, 3, 4, 5, 10, 40]); const mv = x.splice(1, 1)[0]; x.splice(3, 0, mv); T.renumberMoved(x, 3, 1);
assert.deepStrictEqual(nums(x), ["2", "3", "4", "5", "10", "40"], "3 hinter 5: alte 4 → 3, alte 5 → 4, verschobenes 5, 10 bleibt");
assert.strictEqual(mv.meta.BLATT, "5");
x = mk([4, 3, 5]); T.renumberMoved(x, 1, 0); assert.deepStrictEqual(nums(x), ["3", "4", "5"], "vorne weg nach hinten: erstes übersprungenes nimmt die alte Nummer");
// Hin und zurück mit dem Beispiel CJ: Dispo wieder ans Ende
const back = [b2, b3, b4, b5, b10, b40, dispo]; T.renumberMoved(back, 6, 2);
assert.deepStrictEqual(nums(back), ["2", "3", "4", "5", "10", "40", "41"], "zurück ans Ende: alte Nummern bis auf die Dispo (Vorgänger 40 + 1)");
x = mk([2, 3, 30, 4, "4a", 5]); T.renumberMoved(x, 2); assert.deepStrictEqual(nums(x), ["2", "3", "4", "5", "4a", "5"], "Text als Nummer beendet das Hochzählen");
x = mk(["", 3]); T.renumberMoved(x, 0); assert.deepStrictEqual(nums(x), ["3", "4"], "leere Nummer vorne: nimmt 3, der Nachfolger 4");
x = mk(["A", "B"]); assert.deepStrictEqual(T.renumberMoved(x, 1), [], "kein Nachbar mit Zahl: nichts ändern"); assert.deepStrictEqual(nums(x), ["A", "B"]);

// D2: Inhaltsverzeichnis nur mit Schemablättern, Dispo nur übergeben, Stringplan und Stringübersicht nie
const d = newDoc(); d.sheets[0].meta.BLATT = "3";
const dA = sheet("dispo", 1), dB = sheet("dispo", 2); dA.sid = 71; dB.sid = 72;
const pv = sheet("pv", 1), pt = sheet("pvtab", 1);
d.sheets.push(sheet(undefined, 4), dA, dB, pv, pt);
T.ensureDeck(d, null, { shift: false });
let rows = T.tocRows(d);
assert.deepStrictEqual(rows.map((r) => r.art), ["Titelseite", "Inhaltsverzeichnis", "Schema", "Schema", "Sicherungslegende"], "keine Dispo, kein PV");
d.sheets.find((s) => s.meta.BLATT === "4" && !s.kind).items.push({ id: 90, type: "dispoview", src: 72, x: 20, y: 30, den: 10, bx: 0, by: 0, bw: 100, bh: 100, items: [] });
rows = T.tocRows(d);
assert.deepStrictEqual(rows.map((r) => r.no), ["1", "2", "3", "4", "5", "Dispo 2"], "übergebene Dispo 2 steht drin, Dispo 1 nicht");
assert.strictEqual(d.sheets[rows.at(-1).i], dB, "Zeile zeigt aufs richtige Blatt");
assert.strictEqual(T.tocPageCount(d), 1);
console.log("Wünsche D: alle Prüfungen bestanden");

// D3 Nachtrag (CJ 19.10.2026): übergebene Dispo zwischen die Schemablätter, Beispiel CJ im ganzen Dokument
export function beispielDoc() {
  const doc = newDoc(); doc.sheets[0].meta.BLATT = "2";
  for (const n of [3, 4, 5, 10, 40]) doc.sheets.push(sheet(undefined, n));
  doc.sheets.forEach((s, i) => { s.meta.TITEL = "Schema " + s.meta.BLATT; s.sid = 500 + i; });
  const dp = sheet("dispo", 41); dp.sid = 77; dp.meta.TITEL = "Dispo UV"; doc.sheets.push(dp);
  doc.sheets.find((s) => s.meta.BLATT === "10").items.push({ id: 91, type: "dispoview", src: 77, x: 20, y: 30, den: 10, bx: 0, by: 0, bw: 100, bh: 100, title: "Dispo UV", items: [] });
  doc.noTitle = doc.noToc = true; T.ensureDeck(doc, null, { shift: false }); doc.nextId = 1000;
  return doc;
}
{
  const doc = beispielDoc(), dp = doc.sheets.find((s) => s.kind === "dispo");
  assert.ok(T.sheetRank(dp) > T.sheetRank(doc.sheets[0]), "ohne ins: Dispo nach den Schemablättern");
  // wie moveSheet: ins setzen, zwischen 3 und 4 einsetzen, Reihenfolge abgleichen, nummerieren
  dp.ins = 1; doc.sheets.splice(doc.sheets.indexOf(dp), 1); doc.sheets.splice(doc.sheets.findIndex((s) => s.meta.BLATT === "4" && !s.kind), 0, dp);
  T.syncDeck(doc);
  const grp = doc.sheets.filter((s) => T.sheetRank(s) === T.sheetRank(dp));
  T.renumberMoved(grp, grp.indexOf(dp)); T.syncDeck(doc); // wie afterChange: Legende nach der höchsten Nummer
  assert.deepStrictEqual(doc.sheets.filter((s) => s.kind !== "legend").map((s) => s.meta.TITEL + "=" + s.meta.BLATT),
    ["Schema 2=2", "Schema 3=3", "Dispo UV=4", "Schema 4=5", "Schema 5=6", "Schema 10=10", "Schema 40=40"], "Beispiel CJ mit übergebener Dispo");
  assert.deepStrictEqual(T.tocRows(doc).map((r) => r.no), ["2", "3", "Dispo 4", "5", "6", "10", "40", "41"], "Inhaltsverzeichnis folgt (Legende 41 am Schluss)");
  const ser = serializeModel(doc), back = parseModel(ser);
  assert.strictEqual(back.sheets.find((s) => s.kind === "dispo").ins, 1, "ins bleibt beim Speichern und Laden");
  assert.strictEqual(JSON.parse(ser).version, 17);
  // Ansicht gelöscht: Dispo nicht mehr übergeben, geht zurück zu den Dispositionen
  doc.sheets.find((s) => s.meta.TITEL === "Schema 10").items = [];
  T.syncDeck(doc);
  assert.ok(!dp.ins && doc.sheets.at(-1) === dp, "nicht mehr übergeben: ins weg, Dispo wieder hinten");
  console.log("Wünsche D Nachtrag: Dispo zwischen Schemablättern ok");
}
