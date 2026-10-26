// Modul «Offerten», Gliederung (CJ 26.10.2026): Gliederung → BKP-Kapitel → Position. Ohne Browser, nur erfundene Werte.
// Prüft: Baum der Knoten, Vererbung von gl und bkp, Summen je Knoten und Kapitel, Rundung, Speichern/Laden (Dateiversion 27), Editor (Auswahl links),
// PDF und Excel mit Knoten als Kopfzeile.
// Aufruf: node test/test_offerte_gliederung.mjs [Ausgabe.dxf] (Ausgabe wird nicht gebraucht)
import assert from "node:assert";
import * as O from "../src/offerte.js";
import * as F from "../src/offedit.js";
import * as OP from "../src/offprint.js";
import { sheetRows } from "../src/offxlsx.js";
import { newDoc, newSheet, parseModel, serializeModel } from "../src/model.js";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} statt ${b}`);

// ---------- Baum: Haus A › 1. OG › Wohnzimmer, Küche; Haus B ----------
const of = O.newOfferte("26.10.2026");
assert.deepStrictEqual(of.kn, [], "neue Offerte ohne Gliederung");
const hausA = O.addKnoten(of, 0, "Haus A", "ogl"), og = O.addKnoten(of, hausA.id, "1. OG", "psl");
const wz = O.addKnoten(of, og.id, "Wohnzimmer"), kue = O.addKnoten(of, og.id, "Küche"), hausB = O.addKnoten(of, 0, "Haus B", "ogl");
assert.deepStrictEqual(wz, { id: wz.id, up: og.id, titel: "Wohnzimmer" }, "Art fehlt = Raum");
assert.strictEqual(O.knArt(wz), "rgl"); assert.strictEqual(O.knLabel(og), "1. OG [PSL]");
assert.deepStrictEqual(O.knPath(of, wz.id).map((n) => n.titel), ["Haus A", "1. OG", "Wohnzimmer"]);
assert.deepStrictEqual([...O.knSub(of, hausA.id)].sort(), [hausA.id, og.id, wz.id, kue.id].sort(), "Knoten mit allem darunter");

// Kapitel: dieselbe BKP-Nummer in zwei Räumen, eines ohne Gliederung, eines direkt am Haus B
of.ansatz = 100;
const kWz = O.addKapitel(of, "232.5", undefined, wz.id), kKue = O.addKapitel(of, "232.5", undefined, kue.id);
const kOhne = O.addKapitel(of, "239.1"), kB = O.addKapitel(of, "236", undefined, hausB.id), kKue2 = O.addKapitel(of, "233", undefined, kue.id);
assert.strictEqual(kWz.kn, wz.id); assert.ok(!("kn" in kOhne), "ohne Gliederung: kein kn");
const pWz = O.addPosition(of, kWz.grp[0], { titel: "Steckdose", menge: 4, ek: 10 }); // 4 × 14 = 56
O.addPosition(of, kKue.grp[0], { titel: "Herdanschluss", menge: 1, preis: 120.03 });
const pOpt = O.addPosition(of, kKue2.grp[0], { titel: "Spot", menge: 2, preis: 50, opt: true }); // Option aus
O.addPosition(of, kKue2.grp[0], { titel: "Leuchte", menge: 1, preis: 80 });
O.addPosition(of, kOhne.grp[0], { titel: "Demontage", typ: "regie", menge: 1, std: 2 }); // 200
const pB = O.addPosition(of, kB.grp[0], { titel: "RJ45", menge: 3, preis: 33.33 }); // 99.99

// ---------- Reihenfolge: ohne Gliederung zuerst, dann der Baum ----------
assert.deepStrictEqual(O.kapOrder(of).map((k) => k.id), [kOhne.id, kWz.id, kKue.id, kKue2.id, kB.id]);
assert.deepStrictEqual(O.outline(of).map((e) => `${e.t}:${e.t === "kap" ? e.k.bkp : e.n.titel}:${e.lv}`),
  ["kap:239.1:0", "kn:Haus A:0", "kn:1. OG:1", "kn:Wohnzimmer:2", "kap:232.5:3", "end:Wohnzimmer:2", "kn:Küche:2", "kap:232.5:3", "kap:233:3", "end:Küche:2", "end:1. OG:1", "end:Haus A:0",
    "kn:Haus B:0", "kap:236:1", "end:Haus B:0"]);
assert.deepStrictEqual(O.outline(of, { root: og.id }).filter((e) => e.t === "kap").map((e) => e.k.id), [kWz.id, kKue.id, kKue2.id], "Ausschnitt: Knoten mit allem darunter");
const leer = O.addKnoten(of, hausB.id, "Garage");
assert.ok(!O.outline(of).some((e) => e.n === leer) && O.outline(of, { all: true }).some((e) => e.n === leer), "Knoten ohne Kapitel nur im Editor");

// ---------- Vererbung: gl und bkp aus Knoten und Kapitel, kein Feld an der Position ----------
assert.deepStrictEqual(O.glOf(of, pWz.id), { ogl: "Haus A", psl: "1. OG", rgl: "Wohnzimmer" }, "gl aus dem Weg");
assert.strictEqual(O.bkpOf(of, pWz.id), "232.5");
assert.deepStrictEqual([O.glOf(of, pB.id), O.bkpOf(of, pB.id)], [{ ogl: "Haus B" }, "236"]);
assert.deepStrictEqual(O.glOf(of, of.kap[2].grp[0].pos[0].id), {}, "ohne Gliederung: leer");
assert.ok(!("gl" in pWz) && !("bkp" in pWz), "Position trägt gl und bkp nicht");
const raum2 = O.addKnoten(of, wz.id, "Nische"); const kN = O.addKapitel(of, "232.5", undefined, raum2.id); const pN = O.addPosition(of, kN.grp[0], { titel: "x" });
assert.strictEqual(O.glOf(of, pN.id).rgl, "Nische", "zweimal Raum auf dem Weg: der untere gilt");
O.delKnoten(of, raum2.id); assert.ok(!O.findPos(of, pN.id), "Knoten löschen löscht seine Kapitel");

// ---------- Summen je Kapitel und Knoten, Schlusszusammenstellung ----------
const t = O.totals(of);
near(t.kapSum.get(kWz.id), 56, "Kapitel Wohnzimmer"); near(t.kapSum.get(kKue2.id), 80, "Kapitel 233 ohne Option");
near(t.kn.get(kue.id), 200.03, "Küche"); near(t.kn.get(og.id), 256.03, "1. OG = Wohnzimmer + Küche"); near(t.kn.get(hausA.id), 256.03, "Haus A");
near(t.kn.get(hausB.id), 99.99, "Haus B"); assert.ok(!t.kn.has(leer.id), "Garage ohne Kapitel: keine Summe");
near(t.zwischensumme, 200 + 256.03 + 99.99, "Zwischensumme über alles"); near(t.optionen, 100, "Optionen getrennt");
assert.strictEqual(t.total, O.round05((556.02) * 1.081), "Total auf 5 Rappen");
const { rows } = O.summaryRows(of, t);
assert.deepStrictEqual(rows.filter((r) => r.art === "kn" || r.art === "kap").map((r) => [r.art, r.text, r.lv]),
  [["kap", "BKP 239.1 Demontagen, Entsorgungen", 0], ["kn", "Haus A [OGL]", 0], ["kn", "1. OG [PSL]", 1], ["kn", "Wohnzimmer [RGL]", 2], ["kap", "BKP 232.5 Lichtinstallationen", 3],
    ["kn", "Küche [RGL]", 2], ["kap", "BKP 232.5 Lichtinstallationen", 3], ["kap", "BKP 233 Leuchten und Lampen", 3], ["kn", "Haus B [OGL]", 0], ["kap", "BKP 236 Schwachstrominstallationen", 1]], "Summe je Knoten in der Schlusszusammenstellung");
near(rows.find((r) => r.art === "zs").betrag, t.zwischensumme, "Zwischensumme zählt nur die Kapitel");
// Rabattgruppe bleibt an der Gruppe unter dem Kapitel
const rg = O.addRabattgruppe(of, "N", "netto"); rg.satz = 0; of.rabatt = 10; kB.grp[0].rg = rg.id;
near(O.totals(of).rabattTotal, (200 + 256.03) * 0.1, "Rabatt ohne die Gruppe mit Rabattgruppe N");

// ---------- Verschieben ----------
assert.ok(O.moveKnoten(of, kue.id, "up")); assert.deepStrictEqual(O.knKids(of, og.id).map((n) => n.titel), ["Küche", "Wohnzimmer"], "Küche nach oben");
assert.ok(!O.moveKnoten(of, kue.id, "up"), "ganz oben: nichts zu tun");
assert.ok(O.moveKnoten(of, wz.id, "in")); assert.strictEqual(wz.up, kue.id, "Wohnzimmer unter Küche");
assert.ok(O.moveKnoten(of, wz.id, "out")); assert.deepStrictEqual(O.knKids(of, og.id).map((n) => n.titel), ["Küche", "Wohnzimmer"], "eine Ebene höher: nach dem bisherigen oberen Knoten");
assert.ok(O.moveKnoten(of, kue.id, "down") && O.moveKnoten(of, og.id, "out"), "1. OG auf oberste Ebene");
assert.ok(!("up" in og) && O.knKids(of).map((n) => n.titel).join() === "Haus A,1. OG,Haus B");
O.moveKnoten(of, og.id, "in"); assert.strictEqual(og.up, hausA.id, "zurück unter Haus A");

// ---------- Speichern und Laden: Dateiversion 27, Säubern ----------
const doc = newDoc(), sh = newSheet("offerte"); sh.of = of; doc.sheets.push(sh);
const txt = serializeModel(doc);
assert.strictEqual(JSON.parse(txt).version, 27, "Offerte mit Gliederung: Version 27");
assert.deepStrictEqual(parseModel(txt).sheets.at(-1).of, of, "Laden → Speichern → Laden unverändert");
const sh0 = newSheet("offerte"), d0 = newDoc(); sh0.of = O.newOfferte(); d0.sheets.push(sh0);
assert.ok(JSON.parse(serializeModel(d0)).version < 27, "ohne Knoten bleibt die Version tiefer");
const cl = O.cleanOfferte({ kn: [{ id: 1, up: 2, titel: "A" }, { id: 2, up: 1, titel: "B", art: "et" }, { id: 3, up: 9, art: "xx" }, { titel: "ohne ID" }, { id: 4, up: 4 }],
  kap: [{ id: 5, kn: 2, bkp: "232", grp: [{ id: 6, pos: [{ id: 7, titel: "P", bkp: "999", gl: { rgl: "alt" } }] }] }, { id: 8, kn: 99, grp: [] }] });
assert.deepStrictEqual(cl.kn, [{ id: 1, titel: "A" }, { id: 2, up: 1, art: "et", titel: "B" }, { id: 3, titel: "" }, { id: 4, titel: "" }], "Kreis aufgelöst, fehlender oberer Knoten und falsche Art fallen weg, Knoten ohne ID fällt weg");
assert.deepStrictEqual([cl.kap[0].kn, "kn" in cl.kap[1]], [2, false], "Verweis auf fehlenden Knoten fällt weg");
assert.deepStrictEqual(cl.kap[0].grp[0].pos[0], { id: 7, titel: "P" }, "gl und bkp an der Position fallen weg (erbt sie)");

// ---------- Editor: Auswahl links, Kapitel im angewählten Knoten, Hauptbereich zeigt den Ausschnitt ----------
F.setMode({}); F.closeDetails();
const e = O.newOfferte(), act = (d) => F.action(e, { dataset: d });
assert.ok(F.leftHTML(e).includes('data-area="gl" aria-expanded="true"') && F.leftHTML(e).includes('data-area="bkp" aria-expanded="false"'), "nichts angelegt: Gliederung offen, BKP zu");
let r = act({ ofact: "knadd", up: "0" }); r.fn(); const n1 = e.kn[0];
assert.strictEqual(r.focus(), `n${n1.id}.titel`, "neuer Knoten: Fokus auf Titel");
assert.ok(F.apply(e, { dataset: { of: `n${n1.id}.titel` }, value: " Wohnung 1 ", type: "text" }) && n1.titel === "Wohnung 1", "Titel umbenennen");
assert.ok(F.apply(e, { dataset: { of: `n${n1.id}.art` }, value: "et", type: "select-one" }) && n1.art === "et", "Art wählen");
F.apply(e, { dataset: { of: `n${n1.id}.art` }, value: "rgl", type: "select-one" }); assert.ok(!("art" in n1), "Raum = Standard, kein Feld");
r = act({ ofact: "knsel", n: String(n1.id) }); assert.ok(r.ui && r.left);
assert.strictEqual(F.selected(), n1.id);
assert.ok(F.leftHTML(e).includes('data-area="gl" aria-expanded="false"') && F.leftHTML(e).includes('data-area="bkp" aria-expanded="true"'), "Klick auf Knoten: Gliederung zu, BKP auf");
act({ ofact: "area", area: "gl" }); assert.ok(F.leftHTML(e).includes('data-area="gl" aria-expanded="true"'), "von Hand aufklappen");
act({ ofact: "addkap", bkp: "232.5" }).fn(); assert.strictEqual(e.kap[0].kn, n1.id, "Kapitel kommt in den angewählten Knoten");
act({ ofact: "knadd", up: "0" }).fn(); const n2 = e.kn[1]; assert.strictEqual(F.selected(), n2.id, "neuer Knoten ist angewählt");
act({ ofact: "addkap", bkp: "236" }).fn(); assert.strictEqual(e.kap[1].kn, n2.id);
O.addPosition(e, e.kap[0].grp[0], { titel: "In Wohnung 1", menge: 1, preis: 10 }); O.addPosition(e, e.kap[1].grp[0], { titel: "In Knoten 2", menge: 1, preis: 20 });
let v = F.viewHTML(e);
assert.ok(v.includes("In Knoten 2") && !v.includes("In Wohnung 1"), "Hauptbereich: nur der angewählte Knoten");
assert.ok(v.includes("Schlusszusammenstellung") && v.includes("Total Ohne Titel"), "Schlusszusammenstellung und Total des Knotens");
assert.ok(F.leftHTML(e).includes('data-ofact="kapjump"') && F.leftHTML(e).includes(">236<"), "Kapitelliste des Knotens");
act({ ofact: "knsel", n: "0" }); v = F.viewHTML(e);
assert.ok(v.includes("In Knoten 2") && v.includes("In Wohnung 1") && v.includes("Wohnung 1 [RGL]"), "ganze Offerte mit Knoten als Kopfzeile");
act({ ofact: "kdown", k: String(e.kap[0].id) }).fn(); assert.strictEqual(e.kap[0].kn, n1.id, "Kapitel verschiebt sich nur unter Kapiteln desselben Knotens");
// geteilte Ansicht: Baum zum Ansehen, keine Knöpfe zum Ändern
F.setMode({ ro: true, prices: false }); act({ ofact: "area", area: "gl" }); const ro = F.leftHTML(e);
assert.ok(ro.includes('data-ofact="knsel"') && !ro.includes('data-ofact="knadd"') && !ro.includes('data-ofact="addkap"'), "geteilt: nur Auswahl");
assert.ok(F.viewHTML(e).includes("Wohnung 1 [RGL]") && !F.viewHTML(e).includes('data-ofact="knsel"'), "geteilt: Knoten im Hauptbereich nur als Text (links ist ausgeblendet)");
F.setMode({});
act({ ofact: "kndel", n: String(n1.id) }).fn(); assert.ok(!e.kap.some((k) => k.kn === n1.id) && e.kap.length === 1, "Knoten mit Kapitel gelöscht");
// ohne Gliederung bedienbar wie bisher
F.closeDetails(); const plain = O.newOfferte(); F.action(plain, { dataset: { ofact: "addkap", bkp: "232" } }).fn();
assert.ok(!("kn" in plain.kap[0]) && F.viewHTML(plain).includes('data-kid=') && !F.viewHTML(plain).includes("of-kn "), "ohne Knoten: Kapitel wie bisher");

// ---------- PDF und Excel: Knoten als Kopfzeile, Total je Knoten, Schlusszusammenstellung mit Summe je Knoten ----------
const svg = OP.offertePages(of, { prices: true }).join("");
for (const s of ["Haus A [OGL]", "1. OG [PSL]", "Wohnzimmer [RGL]", "Total Küche", "Total Haus A", `>${O.fmtChf(t.kn.get(hausA.id))}<`]) assert.ok(svg.includes(s), `PDF mit «${s}»`);
assert.ok(svg.indexOf("Demontagen") < svg.indexOf("Haus A [OGL]"), "PDF: ohne Gliederung zuerst");
const xr = sheetRows(of, { prices: true }), cells = xr.flat().map((c) => (typeof c === "string" ? c : c.v));
assert.ok(cells.includes("Haus A [OGL]") && cells.includes("Total Haus B"), "Excel mit Knoten und Total");
const totKue = xr.find((row) => row[1]?.v === "Total Küche")[7];
assert.ok(/^SUM\(H\d+,H\d+\)$/.test(totKue.f), `Excel: Total Küche = Summe der beiden Kapitel (${totKue.f})`);
assert.ok(xr.some((row) => String(row[1]?.v).trim() === "Wohnzimmer [RGL]" && /^SUM\(H\d+\)$/.test(row[7]?.f)), "Excel: Summe je Knoten in der Schlusszusammenstellung");
const noP = OP.offertePages(of, { prices: false }).join("");
assert.ok(noP.includes("Haus A [OGL]") && !noP.includes("Total Haus A"), "ohne Preise: Kopfzeile ja, Summe nein");

console.log("Offerte Gliederung: alle Tests grün.");
