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

// ---------- Preis einer Position (ungerundet wie im Excel, CJ 26.10.2026) ----------
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} statt ${b}`);
const of = O.newOfferte("26.10.2026");
assert.deepStrictEqual([of.fak, of.mwst, of.rabatt, of.kap.length], [1.4, 8.1, 0, 0], "Standard: Faktor 1.40, MwSt 8.1 %");
of.ansatz = 89;
const k = O.addKapitel(of, "232.51");
assert.strictEqual(k.titel, "Lichtinstallationen allgemein", "BKP-Titel vorbelegt");
assert.strictEqual(k.grp.length, 1, "neues Kapitel mit einer Gruppe");
const g1 = k.grp[0];
const p1 = O.addPosition(of, g1, { titel: "Steckdose T13", menge: 3, ek: 10.01, std: 0.5 }); // 10.01 × 1.4 + 0.5 × 89 = 58.514
const p2 = O.addPosition(of, g1, { titel: "Pauschal", menge: 1, preis: 100.02 }); // Preis von Hand
const p3 = O.addPosition(of, g1, { titel: "Demontage", typ: "regie", menge: 2, ek: 50, std: 1 }); // Regie: nur Zeit × Ansatz = 89
const p4 = O.addPosition(of, g1, { titel: "Option Dimmer", menge: 1, preis: 80, opt: true });
near(O.unitPrice(p1, of), 58.514, "Einheitspreis ungerundet"); near(O.unitPrice(p2, of), 100.02, "Preis von Hand"); near(O.unitPrice(p3, of), 89, "Regie");
near(O.posAmount(p1, of), 175.542, "Betrag ungerundet (3 × 58.514)"); near(O.posAmount(p3, of), 178, "Regie 2 × 89");
assert.strictEqual(O.unitPrice({ ek: 10, fak: 2 }, of), 20, "Faktor der Position vor dem der Offerte");
assert.strictEqual(O.posAmount({ titel: "nur Text" }, of), 0, "Position ohne Menge und Preis: 0");
assert.deepStrictEqual(new Set([p1.id, p2.id, p3.id, p4.id, k.id, g1.id]).size, 6, "IDs eindeutig");

// ---------- Optionen, Rabatt je Gruppe, MwSt, nur Total auf 5 Rappen ----------
let t = O.totals(of);
near(t.zwischensumme, 453.562, "Option zählt nicht");
assert.strictEqual(t.optionen, 80, "eigene Summe Optionen");
p4.an = true; t = O.totals(of);
near(t.zwischensumme, 533.562, "aktivierte Option zählt zur Angebotssumme"); assert.strictEqual(t.optionen, 0);
delete p4.an;
// eigene Rabattgruppen (CJ 26.10.2026): N ohne Rabatt, S mit eigenem Satz; erste Gruppe ohne Rabattgruppe = Gesamtrabatt 5 %
assert.deepStrictEqual(of.rg, [], "neue Offerte ohne Rabattgruppen");
const rN = O.addRabattgruppe(of, "N", "Netto"); rN.satz = 0;
const rS = O.addRabattgruppe(of, "S", "Sonderrabatt"); rS.satz = 10;
const g2 = O.addGruppe(of, k, "Wohnung 2"); g2.rg = rN.id;
O.addPosition(of, g2, { titel: "Lampe", menge: 1, preis: 200 });
const k2 = O.addKapitel(of, "238", "Provisorische Installationen"), g3 = k2.grp[0]; g3.rg = rS.id;
O.addPosition(of, g3, { titel: "Baustrom", menge: 1, preis: 300 });
of.rabatt = 5;
t = O.totals(of);
near(t.kap[0].summe, 653.562, "Kapitelsumme 232.51"); assert.deepStrictEqual(t.kap.map((x) => [x.bkp, x.summe]).slice(1), [["238", 300]], "Kapitelsumme 238");
near(t.grp.get(g1.id), 453.562, "Gruppe 1"); assert.deepStrictEqual([t.grp.get(g2.id), t.grp.get(g3.id)], [200, 300], "Gruppensummen");
near(t.zwischensumme, 953.562, "Zwischensumme");
assert.deepStrictEqual(t.rabatt.map((r) => [r.kz, r.satz]), [[undefined, 5], ["S", 10]], "Rabatt nur über Gruppen, für die er gilt: Gesamtrabatt, dann S; N ohne Zeile");
assert.strictEqual(t.rabatt[1].name, "Sonderrabatt");
near(t.rabatt[0].basis, 453.562, "Basis 5 %"); near(t.rabatt[0].betrag, 22.6781, "5 % von 453.562"); near(t.rabatt[1].betrag, 30, "10 % von 300");
near(t.netto, 900.8839, "nach Rabatt");
near(t.mwst, 72.97159590, "MwSt 8.1 % ungerundet");
assert.strictEqual(t.total, 973.85, "Total inkl. MwSt: 973.8555 → 973.85 (nur hier auf 5 Rappen)");
assert.strictEqual(t.skonto, null, "ohne Skonto kein Hinweis");
of.skonto = 2; of.skTage = 10;
const sk = O.totals(of).skonto;
assert.deepStrictEqual([sk.satz, sk.tage], [2, 10]); near(sk.betrag, 19.477, "Skonto 2 % vom Total, nur als Hinweis");
assert.strictEqual(O.totals(of).total, 973.85, "Total bleibt mit Skonto");
of.mwst = 0; assert.strictEqual(O.totals(of).total, 900.9, "MwSt einstellbar (900.8839 → 900.90)"); of.mwst = 8.1;

// Rabattgruppe löschen: Gruppe fällt auf den Gesamtrabatt zurück
const tmp = structuredClone(of); O.delRabattgruppe(tmp, rN.id);
assert.ok(tmp.rg.length === 1 && tmp.kap[0].grp[1].rg === undefined, "gelöschte Rabattgruppe: Gesamtrabatt");
near(O.totals(tmp).rabatt[0].basis, 653.562, "Gruppe 2 jetzt mit Gesamtrabatt");

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
assert.strictEqual(cl.kap[0].grp[0].rg, undefined, "Rabattgruppe fehlt: Gesamtrabatt gilt");
assert.strictEqual(O.cleanOfferte({ rg: [{ id: 4, kz: "R", name: "Rabatt", satz: 3 }], kap: [{ id: 5, grp: [{ id: 6, rg: 9, pos: [] }, { id: 7, rg: 4, pos: [] }] }] }).kap[0].grp.map((g) => g.rg).join(), ",4", "Verweis auf fehlende Rabattgruppe fällt weg");
assert.ok(O.BKP.some((b) => b[0] === "239.21") && O.bkpTitle("238") === "Provisorische Installationen", "BKP 237 bis 239 vorbelegt");
assert.throws(() => parseModel(JSON.stringify({ format: "schemacad", version: 25, sheets: [{ kind: "offerte", meta: {}, items: [{ id: 1, type: "text", x: 0, y: 0, text: "x" }] }] })), /keine Zeichenobjekte/);
assert.throws(() => parseModel(JSON.stringify({ format: "schemacad", version: 27, sheets: [{ meta: {}, items: [] }] })), /neueren Version/);
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
  near(tx.zwischensumme, soll, "Zwischensumme ungerundet wie Excel");
  assert.strictEqual(O.fmtChf(tx.zwischensumme), "4'981.87", "Zwischensumme 4'981.87");
  console.log(`Excel-Beispiel: Zwischensumme ${O.fmtChf(tx.zwischensumme)}`);
} else console.log("Excel-Beispiel übersprungen (Offerte.xlsx fehlt)");

// ---------- Zeitfaktor der Offerte (CJ 26.10.2026): auf alle Zeiten ausser Regie, fehlt = 1, Dateiversion 26 ----------
{
  const F = await import("../src/offedit.js"); F.setMode({});
  const zo = O.newOfferte(); zo.ansatz = 100; const zg = O.addKapitel(zo, "232").grp[0];
  const a = O.addPosition(zo, zg, { menge: 1, ek: 10, std: 1 }), r = O.addPosition(zo, zg, { menge: 1, typ: "regie", std: 1 }), h = O.addPosition(zo, zg, { menge: 1, preis: 50, std: 1 });
  const zf = (v) => F.apply(zo, { dataset: { of: "o.zf" }, value: v, type: "text" });
  assert.deepStrictEqual([O.zeitfaktor(zo), O.unitPrice(a, zo)], [1, 114], "ohne Zeitfaktor: 1");
  assert.ok(zf("0,7")); assert.strictEqual(zo.zf, 0.7);
  near(O.unitPrice(a, zo), 84, "10 × 1.4 + 1 h × 0.7 × 100"); assert.strictEqual(O.unitPrice(r, zo), 100, "Regie ohne Zeitfaktor"); assert.strictEqual(O.unitPrice(h, zo), 50, "Preis von Hand bleibt");
  assert.ok(!zf("0") && !zf("-1") && zo.zf === 0.7, "0 und negativ nicht erlaubt");
  const zd = newDoc(), zs = newSheet("offerte"); zs.of = zo; zd.sheets.push(zs);
  const zt = serializeModel(zd); assert.strictEqual(JSON.parse(zt).version, 26, "mit Zeitfaktor: Version 26");
  assert.strictEqual(parseModel(zt).sheets.at(-1).of.zf, 0.7, "Zeitfaktor bleibt beim Laden");
  zf("1"); assert.ok(!("zf" in zo), "1 = kein Zeitfaktor"); assert.strictEqual(JSON.parse(serializeModel(zd)).version, 25, "ohne Zeitfaktor bleibt Version 25");
  zf("0.8"); zf(""); assert.ok(!("zf" in zo), "leer = 1");
}

// ---------- Teilen-Link: nur lesen, mit oder ohne Preise (CJ 26.10.2026) ----------
// Die Datenbank (share_open, Migration 20261026_share_offerte) entfernt EK, Faktor und Zeit und setzt mit Preisen den Verkaufspreis als preis.
{
  const F = await import("../src/offedit.js");
  const so = O.newOfferte(), sk = O.addKapitel(so, "232"); O.addPosition(so, sk.grp[0], { titel: "A", text: "UP", menge: 2, preis: 58.5, opt: true });
  F.setMode({ ro: true, prices: false }); const h = F.viewHTML(so);
  assert.ok(!/<input|<button|<select|<textarea/.test(h), "geteilt: keine Felder und Knöpfe");
  assert.ok(!/58|117|Total|Preis|Schlusszusammenstellung/.test(h) && h.includes("Option"), "ohne Preise: keine Preise, Beträge, Summen");
  F.setMode({ ro: true, prices: true }); const h2 = F.viewHTML(so);
  assert.ok(!/<input|<button/.test(h2) && h2.includes("58.50") && h2.includes("117.00"), "mit Preisen: Verkaufspreis und Betrag");
  assert.ok(!/EK|Faktor/.test(F.panelHTML(so)), "geteilt: rechts kein EK und kein Faktor");
  F.setMode({}); assert.ok(F.viewHTML(so).includes("<input"), "eigene Offerte: bearbeitbar");
}
// MwSt ein/aus (CJ 26.10.2026): nur am Schluss aufs Total, aus = Satz 0 (ältere Stände rechnen gleich), wieder ein = letzter Satz oder 8.1
{
  const F = await import("../src/offedit.js"); F.setMode({});
  const mo = O.newOfferte(), mk = O.addKapitel(mo, "232"); O.addPosition(mo, mk.grp[0], { titel: "A", menge: 1, preis: 100 });
  const box = (on) => F.apply(mo, { dataset: { of: "o.mwstan" }, type: "checkbox", checked: on });
  assert.strictEqual(O.totals(mo).total, 108.1);
  box(false); assert.strictEqual(mo.mwst, 0); assert.strictEqual(O.totals(mo).total, 100, "ohne MwSt");
  assert.ok(F.viewHTML(mo).includes("Total ohne MwSt") && !/MwSt 0 %/.test(F.viewHTML(mo)) && !F.panelHTML(mo).includes('data-of="o.mwst"'), "aus: keine MwSt-Zeile, kein Satzfeld");
  box(true); assert.strictEqual(mo.mwst, 8.1, "wieder ein: 8.1 %");
  mo.mwst = 7.7; box(true); assert.strictEqual(mo.mwst, 7.7, "eigener Satz bleibt");
  assert.strictEqual(O.cleanOfferte(JSON.parse(JSON.stringify({ ...mo, mwst: 0 }))).mwst, 0, "aus bleibt nach Speichern/Laden aus");
}
// Fenster «Link teilen» (elplexaCAD): Offerte angekreuzt → Häkchen «mit Preisen»; Linkzeile nennt Preise; ganzes Projekt ohne Offerte.
// Zuletzt, weil ELPLEXA ab hier gesetzt ist (model.js prüft es beim Aufruf).
{
  globalThis.ELPLEXA = true; const E = await import("../src/elplexa.js");
  const pick = { ids: ["schema", "offerte"], on: new Set(["schema", "offerte"]), prices: false };
  const h = E.shareDialogHTML("P", [{ token: "t", id: "1", expires_at: "2026-11-25", modules: ["offerte"], prices: true }, { token: "u", id: "2", expires_at: "2026-11-25", modules: null }], (x) => x, pick, (m) => m);
  assert.ok(h.includes("data-shprices") && h.includes("offerte (mit Preisen)") && h.includes("Ganzes Projekt ohne Offerte"), "Teilen: Häkchen Preise, Linkzeilen");
  pick.on.delete("offerte"); assert.ok(!E.shareDialogHTML("P", [], (x) => x, pick, (m) => m).includes("data-shprices"), "ohne Offerte kein Häkchen Preise");
}

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
