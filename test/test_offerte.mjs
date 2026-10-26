// Modul «Offerten» (CJ 26.10.2026), Schritt 1: Summenregeln, Rundung, Speichern/Laden, Excel-Beispiel. Ohne Browser.
// Aufruf: node test/test_offerte.mjs [Ausgabe.dxf] (Ausgabe wird nicht gebraucht)
// Das Excel-Beispiel liest ~/Desktop/ELPLEXA/Nydegger/Offerte.xlsx, wenn die Datei da ist (Preise nie ins Repo); sonst wird es übersprungen.
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import zlib from "node:zlib";
import * as O from "../src/offerte.js";
import { newDoc, newSheet, parseModel, serializeModel, modOf, modName, VERSION } from "../src/model.js";

// ---------- Rundung auf 5 Rappen ----------
assert.deepStrictEqual([0.02, 0.025, 0.03, 0.074, 0.075, 1.005, 259.308, 347.844].map(O.round05), [0, 0.05, 0.05, 0.05, 0.1, 1, 259.3, 347.85]);
assert.strictEqual(O.fmtChf(4981.85), "4'981.85"); assert.strictEqual(O.fmtChf(1234567.5), "1'234'567.50"); assert.strictEqual(O.fmtChf(0), "0.00");

// ---------- Preis einer Position ----------
const of = O.newOfferte("26.10.2026");
assert.deepStrictEqual([of.fak, of.mwst, of.rabatt, of.kap.length], [1.4, 8.1, 0, 0], "Standard: Faktor 1.40, MwSt 8.1 %");
of.ansatz = 89;
const k = O.addKapitel(of, "232.51");
assert.strictEqual(k.titel, "Lichtinstallationen allgemein", "BKP-Titel vorbelegt");
assert.strictEqual(k.grp.length, 1, "neues Kapitel mit einer Gruppe");
const g1 = k.grp[0];
const p1 = O.addPosition(of, g1, { titel: "Steckdose T13", menge: 3, ek: 10, std: 0.5 }); // 10 × 1.4 + 0.5 × 89 = 58.50
const p2 = O.addPosition(of, g1, { titel: "Pauschal", menge: 1, preis: 100.02 }); // Preis von Hand → 100.00
const p3 = O.addPosition(of, g1, { titel: "Demontage", typ: "regie", menge: 2, ek: 50, std: 1 }); // Regie: nur Zeit × Ansatz = 89
const p4 = O.addPosition(of, g1, { titel: "Option Dimmer", menge: 1, preis: 80, opt: true });
assert.deepStrictEqual([O.unitPrice(p1, of), O.unitPrice(p2, of), O.unitPrice(p3, of)], [58.5, 100.02, 89]);
assert.deepStrictEqual([O.posAmount(p1, of), O.posAmount(p2, of), O.posAmount(p3, of)], [175.5, 100, 178], "Betrag auf 5 Rappen");
assert.strictEqual(O.unitPrice({ ek: 10, fak: 2 }, of), 20, "Faktor der Position vor dem der Offerte");
assert.strictEqual(O.posAmount({ titel: "nur Text" }, of), 0, "Position ohne Menge und Preis: 0");
assert.deepStrictEqual(new Set([p1.id, p2.id, p3.id, p4.id, k.id, g1.id]).size, 6, "IDs eindeutig");

// ---------- Optionen, Rabatt je Gruppe, MwSt ----------
let t = O.totals(of);
assert.strictEqual(t.zwischensumme, 453.5, "Option zählt nicht");
assert.strictEqual(t.optionen, 80, "eigene Summe Optionen");
p4.an = true; t = O.totals(of);
assert.deepStrictEqual([t.zwischensumme, t.optionen], [533.5, 0], "aktivierte Option zählt zur Angebotssumme");
delete p4.an;
// zweite Gruppe ohne Rabatt, dritte mit eigenem Satz, Gesamtrabatt 5 %
const g2 = O.addGruppe(of, k, "Wohnung 2"); g2.rab = false;
O.addPosition(of, g2, { titel: "Lampe", menge: 1, preis: 200 });
const k2 = O.addKapitel(of, "238", "Provisorische Installationen"), g3 = k2.grp[0]; g3.rab = 10;
O.addPosition(of, g3, { titel: "Baustrom", menge: 1, preis: 300 });
of.rabatt = 5;
t = O.totals(of);
assert.deepStrictEqual(t.kap.map((x) => [x.bkp, x.summe]), [["232.51", 653.5], ["238", 300]], "Kapitelsummen");
assert.deepStrictEqual([t.grp.get(g1.id), t.grp.get(g2.id), t.grp.get(g3.id)], [453.5, 200, 300], "Gruppensummen");
assert.strictEqual(t.zwischensumme, 953.5);
assert.deepStrictEqual(t.rabatt, [{ satz: 5, basis: 453.5, betrag: 22.7 }, { satz: 10, basis: 300, betrag: 30 }], "Rabatt nur über Gruppen, für die er gilt (453.5 × 5 % = 22.675 → 22.70)");
assert.strictEqual(t.rabattTotal, 52.7);
assert.strictEqual(t.netto, 900.8);
assert.strictEqual(t.mwst, 72.95, "MwSt 8.1 % von 900.80 = 72.96 → 72.95");
assert.strictEqual(t.total, 973.75, "Total inkl. MwSt");
for (const x of [t.zwischensumme, t.rabattTotal, t.netto, t.mwst, t.total]) assert.strictEqual(Math.round(x * 20) / 20, x, `${x} auf 5 Rappen`);
assert.strictEqual(t.skonto, null, "ohne Skonto kein Hinweis");
of.skonto = 2; of.skTage = 10;
assert.deepStrictEqual(O.totals(of).skonto, { satz: 2, tage: 10, betrag: 19.5 }, "Skonto nur als Hinweis (973.75 × 2 % = 19.475 → 19.50), Total bleibt");
assert.strictEqual(O.totals(of).total, 973.75);
of.mwst = 0; assert.strictEqual(O.totals(of).total, 900.8, "MwSt einstellbar"); of.mwst = 8.1;

// ---------- Kopie bekommt neue ID, findPos ----------
const c = O.copyPosition(of, g1, p1, 1);
assert.ok(c.id !== p1.id && c.titel === p1.titel && g1.pos[1] === c, "Kopie mit neuer ID hinter dem Original");
assert.strictEqual(O.findPos(of, p3.id).p, p3);
g1.pos.splice(1, 1);

// ---------- Speichern und Laden ----------
Object.assign(of, { nr: "OF-2026-01", ver: "Rev. 1", gueltig: "3 Monate", art: "ep", bau: "wohn" });
Object.assign(p1, { npk: "513 211 212", bkp: "232.51", eh: "Stk", text: "Typ 13, UP\nweiss", typ: "it", form: "o", her: "Hager", enr: "123 456 789", ic: "22", gl: { rgl: "Küche", psl: "EG" } });
const doc = newDoc(); const sh = newSheet("offerte"); sh.of = of; sh.meta.BLATT = "1"; doc.sheets.push(sh);
doc.mods = { offerte: { name: "Offerte EFH" } };
const txt = serializeModel(doc), back = JSON.parse(txt);
assert.strictEqual(back.version, 25, "Datei mit Offerte: Version 25");
assert.ok(VERSION >= 25);
const d2 = parseModel(txt);
assert.deepStrictEqual(d2.sheets[1].of, of, "Laden → Speichern → Laden unverändert");
assert.deepStrictEqual(modOf(d2.sheets[1]), "offerte"); assert.strictEqual(modName(d2, "offerte"), "Offerte EFH");
assert.strictEqual(modName({}, "offerte:2"), "Offerte 2");
assert.ok(JSON.parse(serializeModel(newDoc())).version < 25, "ohne Offerte keine höhere Version");
// Säubern: unbekannte Felder weg, falsche Werte auf Standard, doppelte und fehlende IDs neu
const raw = { nid: 2, nr: 5, art: "x", fak: -1, mwst: "8", kap: [{ id: 1, bkp: "232", grp: [{ id: 1, rab: "ja", pos: [{ id: 1, titel: "A", menge: "2", typ: "foo", opt: "ja", zz: 1 }, { titel: "B", an: true }] }] }] };
const cl = O.cleanOfferte(raw);
assert.deepStrictEqual([cl.nr, cl.art, cl.fak, cl.mwst], ["", "", 1.4, 8.1]);
const ids = [cl.kap[0].id, cl.kap[0].grp[0].id, ...cl.kap[0].grp[0].pos.map((p) => p.id)];
assert.strictEqual(new Set(ids).size, 4, "IDs eindeutig nach dem Laden"); assert.ok(cl.nid > Math.max(...ids));
assert.deepStrictEqual(cl.kap[0].grp[0].pos[0], { id: cl.kap[0].grp[0].pos[0].id, titel: "A" }, "unbekannte und falsche Felder fallen weg");
assert.strictEqual(cl.kap[0].grp[0].rab, undefined, "Rabatt ungültig: Gesamtrabatt gilt");
assert.throws(() => parseModel(JSON.stringify({ format: "schemacad", version: 25, sheets: [{ kind: "offerte", meta: {}, items: [{ id: 1, type: "text", x: 0, y: 0, text: "x" }] }] })), /keine Zeichenobjekte/);
assert.throws(() => parseModel(JSON.stringify({ format: "schemacad", version: 26, sheets: [{ meta: {}, items: [] }] })), /neueren Version/);
// v3 (dieser Prozess ohne ELPLEXA) lehnt einen Plan am Blatt ab
assert.throws(() => parseModel(JSON.stringify({ format: "schemacad", version: 24, sheets: [{ kind: "plan", meta: {}, items: [] }] })), /Pläne öffnet nur elplexaCAD/);

// ---------- Excel-Beispiel (nur lokal): Blatt «Material», Zwischensumme 4'981.87 bei Faktor 1.4 ----------
const xlsx = `${os.homedir()}/Desktop/ELPLEXA/Nydegger/Offerte.xlsx`;
if (fs.existsSync(xlsx)) {
  const rows = readSheet(xlsx, "xl/worksheets/sheet1.xml");
  const fak = Number(rows.get(2)?.N), soll = Number(rows.get(3)?.N); // N2 Mat-Faktor, N3 Zwischensumme = SUMME(I25:I120)
  assert.strictEqual(fak, 1.4);
  const ex = O.newOfferte(); ex.fak = fak;
  const kx = O.addKapitel(ex, "232"); let g = kx.grp[0];
  for (let r = 25; r <= 120; r++) { // Zeilen nur mit Titel sind Gruppen
    const x = rows.get(r); if (!x) continue;
    if (x.B && x.F === undefined) { g = O.addGruppe(ex, kx, x.B); continue; }
    if (x.F !== undefined) O.addPosition(ex, g, { titel: x.B || "", her: x.C, enr: x.E, ek: Number(x.F), menge: Number(x.H || 0) });
  }
  const tx = O.totals(ex);
  assert.strictEqual(Math.round(tx.roh * 100) / 100, Math.round(soll * 100) / 100, "ungerundet wie Excel");
  assert.strictEqual(Math.round(tx.roh * 100) / 100, 4981.87, "Zwischensumme 4'981.87");
  assert.ok(Math.abs(tx.zwischensumme - 4981.87) < 0.05 * kx.grp.reduce((n, gg) => n + gg.pos.length, 0), `gerundet nahe bei Excel (${tx.zwischensumme})`);
  console.log(`Excel-Beispiel: roh ${tx.roh.toFixed(2)}, mit Rundung ${O.fmtChf(tx.zwischensumme)}`);
} else console.log("Excel-Beispiel übersprungen (Offerte.xlsx fehlt)");

console.log("Offerten: alle Tests grün.");

// Kleiner xlsx-Leser: ZIP (deflate) entpacken, gemeinsame Texte einsetzen. Gibt Map Zeile → { Spalte: Wert } zurück.
function readSheet(file, name) {
  const z = fs.readFileSync(file), get = (n) => {
    for (let o = z.length - 22; o >= 0; o--) if (z.readUInt32LE(o) === 0x06054b50) {
      let p = z.readUInt32LE(o + 16);
      for (let i = 0; i < z.readUInt16LE(o + 10); i++) {
        const m = z.readUInt16LE(p + 10), cs = z.readUInt32LE(p + 20), nl = z.readUInt16LE(p + 28), el = z.readUInt16LE(p + 30), cl2 = z.readUInt16LE(p + 32), lo = z.readUInt32LE(p + 42);
        if (z.toString("utf8", p + 46, p + 46 + nl) === n) { const s = lo + 30 + z.readUInt16LE(lo + 26) + z.readUInt16LE(lo + 28), d = z.subarray(s, s + cs); return (m ? zlib.inflateRawSync(d) : d).toString("utf8"); }
        p += 46 + nl + el + cl2;
      }
    }
    return "";
  };
  const dec = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  const ss = [...get("xl/sharedStrings.xml").matchAll(/<si>(.*?)<\/si>/gs)].map((m) => dec([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join("")));
  const out = new Map();
  for (const r of get(name).matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/gs)) {
    const o = {};
    for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) { const v = c[3]?.match(/<v>(.*?)<\/v>/)?.[1]; if (v !== undefined) o[c[1]] = /t="s"/.test(c[2]) ? ss[v] : v; }
    if (Object.keys(o).length) out.set(Number(r[1]), o);
  }
  return out;
}
