// Modul «Offerten», Schritt 5: Import einer Excel-Offerte (offimport.js). Nur erfundene Werte, keine Kundendaten.
// Excel im Aufbau wie die Vorlage von CJ: Kopfzeile, Faktor-Zelle darüber, Gruppen als Textzeilen, Positionen mit EK, Formeln mit gespeichertem Wert,
// Summenzeilen, zweites Blatt «Stunden». Dazu die Rundreise mit dem eigenen Export (offxlsx.js).
// Aufruf: node test/test_offerte_import.mjs [Ausgabe.dxf] (Ausgabe wird nicht gebraucht)
import assert from "node:assert";
import zlib from "node:zlib";
import * as O from "../src/offerte.js";
import { readXlsx, parseOfferte, buildOfferte } from "../src/offimport.js";
import { offerteXlsx } from "../src/offxlsx.js";
import { crc32 } from "../src/zip.js";

const inflate = async (d) => new Uint8Array(zlib.inflateRawSync(d));
// ZIP mit deflate (wie Excel), Einträge [Name, Text]
function zipDeflate(files) {
  const parts = [], dir = []; let off = 0;
  for (const [name, text] of files) {
    const n = Buffer.from(name), d = Buffer.from(text), z = zlib.deflateRawSync(d), crc = crc32(d);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(8, 8); l.writeUInt32LE(crc, 14); l.writeUInt32LE(z.length, 18); l.writeUInt32LE(d.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(z.length, 20); c.writeUInt32LE(d.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    parts.push(l, n, z); dir.push(c, n); off += 30 + n.length + z.length;
  }
  const size = dir.reduce((s, b) => s + b.length, 0), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(size, 12); e.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, ...dir, e]));
}
// Blatt aus Zeilen { "A5": "Text" | Zahl | ["=Formel", Wert] }, Texte über sharedStrings
function makeXlsx(sheets) {
  const ss = [], si = (t) => { let i = ss.indexOf(t); if (i < 0) { ss.push(t); i = ss.length - 1; } return i; };
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const xml = sheets.map(([, cells]) => {
    const rows = new Map();
    for (const [ref, v] of Object.entries(cells)) { const r = Number(/\d+/.exec(ref)[0]); if (!rows.has(r)) rows.set(r, []); rows.get(r).push([ref, v]); }
    return `<worksheet><sheetData>${[...rows].sort((a, b) => a[0] - b[0]).map(([r, cs]) => `<row r="${r}">${cs.map(([ref, v]) => Array.isArray(v) ? `<c r="${ref}"><f>${esc(v[0].slice(1))}</f><v>${v[1]}</v></c>`
      : typeof v === "number" ? `<c r="${ref}" s="1"><v>${v}</v></c>` : `<c r="${ref}" t="s"><v>${si(v)}</v></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  });
  return zipDeflate([
    ["xl/workbook.xml", `<workbook xmlns:r="x"><sheets>${sheets.map(([n], i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="w" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`],
    ["xl/sharedStrings.xml", `<sst>${ss.map((t) => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join("")}</sst>`],
    ...xml.map((x, i) => [`xl/worksheets/sheet${i + 1}.xml`, x]),
  ]);
}

// ---------- Excel wie die Vorlage (erfundene Werte) ----------
const mat = { M2: "Mat Faktor", N2: 1.5, A5: "BKP", B5: "Artikel / Beschreibung", C5: "Hersteller", D5: "IC-Code", E5: "E-Nummero", F5: "Preis EK", G5: "Preis", H5: "Menge", I5: "Preis", J5: "Total Position",
  B6: "Verteilung A",
  B7: "Schalter X", C7: "Muster AG", E7: 111000111, F7: 10, G7: ["=F7*$N$2", 15], H7: 2, I7: ["=G7*H7", 30],
  B8: "Taster Y", C8: "Muster AG", D8: 22, F8: 4, G8: ["=F8*$N$2", 6], H8: 3, I8: ["=G8*H8", 18],
  G9: ["=F9*$N$2", 0], I9: ["=G9*H9", 0], // leere Vorlagezeile
  J10: ["=SUM(I7:I9)", 48],
  B11: "Verteilung B",
  B12: "Ohne EK", G12: ["=F12*$N$2", 0], H12: 1, I12: ["=G12*H12", 0],
  B13: "Preis von Hand", F13: 10, G13: 20, H13: 1, I13: ["=G13*H13", 20],
  B14: "Total Verteilung B", J14: 20,
  A15: "236", B15: "Schwachstrom",
  B16: "Dose RJ45 & Co <Cat6>", F16: 2, G16: ["=F16*$N$2", 3], H16: 4, I16: ["=G16*H16", 12] };
const std = { A4: "IC Code", B4: "Beschreibung", C4: "Ansatz", D4: "Stunden", E4: "Total", A5: 22, B5: "Unterputz", C5: 90, D5: 2, E5: ["=C5*D5", 180], B6: "Planung", C6: 90, D6: 1.5, E6: ["=C6*D6", 135], B8: "Total Aufwendungen", E8: ["=SUM(E5:E7)", 315] };
const sheets = await readXlsx(makeXlsx([["Material", mat], ["Stunden", std]]), inflate);
assert.deepStrictEqual(sheets.map((s) => s.name), ["Material", "Stunden"]);
assert.strictEqual(sheets[0].rows[6][6], 15, "Formel: gespeicherter Wert");
const res = parseOfferte(sheets, { titel: "Testimport" });
assert.strictEqual(res.fak, 1.5, "Materialfaktor aus der Zelle «Mat Faktor»");
assert.deepStrictEqual(res.info, { blaetter: ["Material", "Stunden"], positionen: 7, ohnePreis: 1, uebersprungen: 2 });
assert.deepStrictEqual(res.kap.map((k) => [k.bkp, k.titel, k.grp.map((g) => `${g.titel}:${g.pos.length}`)]),
  [["", "Testimport", ["Verteilung A:2", "Verteilung B:2"]], ["236", "Schwachstrom", [":1", "Arbeit:2"]]], "Kapitel ohne BKP, Gruppen, Kapitel aus Spalte BKP, Stunden als Gruppe Arbeit");
const [x, y] = res.kap[0].grp[0].pos;
assert.deepStrictEqual(x, { titel: "Schalter X", menge: 2, her: "Muster AG", enr: "111000111", ek: 10 }, "Position: EK statt Preis, E-Nr. als Text");
assert.strictEqual(y.ic, "22", "IC als Text");
assert.strictEqual(res.kap[1].grp[0].pos[0].titel, "Dose RJ45 & Co <Cat6>", "Sonderzeichen aus sharedStrings");
assert.deepStrictEqual(res.kap[0].grp[1].pos.map((p) => [p.titel, p.ek, p.preis]), [["Ohne EK", undefined, 0], ["Preis von Hand", 10, 20]], "ohne EK: Preis 0; abweichender Preis = von Hand");
assert.deepStrictEqual(res.kap[1].grp[1].pos[0], { titel: "Unterputz", menge: 2, eh: "h", ic: "22", preis: 90 }, "Stunden: Menge = Stunden, Preis = Ansatz");

// Offerte daraus: rechnet wie die Excel, abgewählte Gruppe wird Option
const of = buildOfferte(res, { ansatz: 0 }), t = O.totals(of);
assert.strictEqual(of.fak, 1.5);
assert.ok(Math.abs(t.zwischensumme - (30 + 18 + 0 + 20 + 12 + 315)) < 1e-9, `Summe wie Excel: ${t.zwischensumme}`);
const ids = new Set(); for (const k of of.kap) for (const g of k.grp) { ids.add(g.id); for (const p of g.pos) ids.add(p.id); }
assert.ok(ids.size > 10 && !ids.has(0), "alle IDs gesetzt");
const of2 = buildOfferte(res, {}, new Set([0])), t2 = O.totals(of2);
assert.ok(Math.abs(t2.zwischensumme - 347) < 1e-9 && Math.abs(t2.optionen - 48) < 1e-9, "Gruppe 0 als Option");

// ---------- Rundreise: eigener Export liest sich wieder ein ----------
const src = O.newOfferte("26.10.2026"); src.ansatz = 80;
const k1 = O.addKapitel(src, "232.5"); k1.grp[0].titel = "Küche";
O.addPosition(src, k1.grp[0], { titel: "Steckdose", text: "UP, weiss", ic: "22", menge: 3, eh: "Stk", ek: 12, std: 0.5 });
O.addPosition(src, k1.grp[0], { titel: "Dimmer", menge: 1, eh: "Stk", preis: 99, opt: true });
O.addPosition(src, k1.grp[0], { titel: "Melder", menge: 2, eh: "Stk", preis: 50, opt: true, an: true });
const k2 = O.addKapitel(src, "236"); O.addPosition(src, k2.grp[0], { titel: "RJ45", menge: 4, eh: "Stk", preis: 33.3, npk: "513 211 212" });
const back = buildOfferte(parseOfferte(await readXlsx(offerteXlsx(src, { kunde: { BAUHERR: "Muster" } }), inflate)), {});
const tb = O.totals(back), ts = O.totals(src);
assert.deepStrictEqual(back.kap.map((k) => [k.bkp, k.titel]), [["232.5", "Lichtinstallationen"], ["236", "Schwachstrominstallationen"]], "Kapitel zurück");
assert.strictEqual(back.kap[0].grp[0].titel, "Küche");
assert.deepStrictEqual(back.kap[0].grp[0].pos.map((p) => [p.titel, p.text, p.ic, p.eh, !!p.opt, !!p.an]), [["Steckdose", "UP, weiss", "22", "Stk", false, false], ["Dimmer", undefined, undefined, "Stk", true, false], ["Melder", undefined, undefined, "Stk", true, true]]);
assert.strictEqual(back.kap[1].grp[0].pos[0].npk, "513 211 212", "NPK-Nr. aus Spalte Pos");
assert.ok(Math.abs(tb.zwischensumme - ts.zwischensumme) < 1e-9 && Math.abs(tb.optionen - ts.optionen) < 1e-9 && tb.total === ts.total, "gleiche Summen nach der Rundreise");
assert.ok(!JSON.stringify(back).includes('"ek"') && !JSON.stringify(back).includes('"std"'), "EK und Zeit waren nie im Export");
await assert.rejects(readXlsx(new Uint8Array(40), inflate), /Keine Excel-Datei/);

console.log("Offerte Import: alle Tests grün.");
