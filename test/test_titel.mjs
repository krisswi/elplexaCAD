// Titelseite und Inhaltsverzeichnis (titel.js, Ausbau UI Schritt 3): Einfügen, Umnummerieren, Abgleich, Datei. Aufruf aus web-src: node test/test_titel.mjs
import assert from "node:assert";
import { newDoc, newSheet, parseModel, serializeModel } from "../src/model.js";
import { renumberAll } from "../src/numbering.js";
import * as T from "../src/titel.js";

// Alte Datei: Schemablätter 1 und 10, eine Disposition, verschiedene Angaben je Blatt
const d = newDoc();
const s1 = d.sheets[0]; Object.assign(s1.meta, { BLATT: "1", OBJEKT: "EFH Muster", AUFTRAG: "A-1", DATUM: "01.10.2026" });
s1.items.push({ id: 1, type: "symbol", sym: "LS_1P", x: 50, y: 150, rot: 0, attrs: { BMK: "", STROM: "13A", CHAR: "C" } });
const s2 = newSheet(); Object.assign(s2.meta, { BLATT: "10", OBJEKT: "EFH Muster", AUFTRAG: "A-1", DATUM: "05.10.2026" }); d.sheets.push(s2);
const dp = newSheet("dispo"); dp.sid = 50; dp.meta.BLATT = "1"; d.sheets.push(dp);
d.nextId = 100; renumberAll(d);
assert.strictEqual(s1.items[0].attrs.BMK, "1F2"); // x 50 = Spalte 2
s2.meta.SCHEMA = "HV"; // nur auf Blatt 10 ausgefüllt: wird übernommen, keine Meldung
const note = T.ensureDeck(d, { FIRMA: "Elektro CJ", FIRMA_ADR: "Weg 1\n3000 Bern" });
assert.deepStrictEqual(d.sheets.map((s) => s.kind || "schema"), ["title", "toc", "schema", "schema", "dispo", "legend"]);
assert.deepStrictEqual(d.sheets.map((s) => s.meta.BLATT), ["1", "2", "3", "12", "1", "13"], "Schemablätter +2, Disposition bleibt, Legende nach dem letzten Schemablatt");
assert.match(note, /rücken um 2/); assert.match(note, /Datum/); assert.doesNotMatch(note, /Objekt/);
assert.ok(d.sheets.every((s) => s.meta.DATUM === "01.10.2026" && s.meta.SCHEMA === "HV"), "Angaben vom ersten Schemablatt, leere aus anderen Blättern");
assert.doesNotMatch(note, /Schema,|Schema\./);
assert.strictEqual(d.sheets[0].info.FIRMA, "Elektro CJ", "Firma aus der App");
renumberAll(d);
assert.strictEqual(s1.items[0].attrs.BMK, "3F2", "BMK folgt der neuen Blattnummer");
assert.strictEqual(T.ensureDeck(d), "", "zweiter Aufruf ändert nichts");
assert.strictEqual(d.sheets.length, 6);
console.log("Einfügen und Umnummerieren ok");

// Projektangaben ändern: auf alle Blätter, Nummer und Titel von Titelseite und Inhalt fest
d.sheets[0].meta.OBJEKT = "MFH Neu"; d.sheets[0].meta.BLATT = "7"; d.sheets[1].meta.TITEL = "x";
T.syncDeck(d);
assert.ok(d.sheets.every((s) => s.meta.OBJEKT === "MFH Neu"));
assert.deepStrictEqual([d.sheets[0].meta.BLATT, d.sheets[1].meta.BLATT, d.sheets[1].meta.TITEL], ["1", "2", "Inhaltsverzeichnis"]);
console.log("Abgleich ok");

// Datei: Version 5, Round-Trip gleich, Änderungsindex und Logo bleiben
d.sheets[0].info.revs.push({ i: "A", d: "14.10.2026", t: "Erstausgabe", n: "CJ" });
d.sheets[0].info.logo = "data:image/png;base64,iVBORw0KGgo=";
const text = serializeModel(d), o = JSON.parse(text);
assert.strictEqual(o.version, 5);
const back = parseModel(text);
assert.deepStrictEqual(JSON.parse(serializeModel(back)), o, "Speichern → Laden → Speichern gleich");
assert.strictEqual(T.ensureDeck(back), "", "gespeicherte Datei hat Titelseite schon");
// Ungültiges Logo fällt weg, Objekte auf der Titelseite werden abgelehnt
const bad = JSON.parse(text); bad.sheets[0].info.logo = "javascript:alert(1)";
assert.strictEqual(parseModel(JSON.stringify(bad)).sheets[0].info.logo, undefined);
bad.sheets[0].items = [{ id: 900, type: "text", x: 1, y: 1, h: 2.5, s: "x" }];
assert.throws(() => parseModel(JSON.stringify(bad)), /Titelseite/);
console.log("Datei ok");

// Neues Dokument: Blatt 3 (die App zeigt die Meldung nur beim Öffnen); Titelseite an falscher Stelle wird nach vorn geholt
const n = newDoc();
assert.doesNotMatch(T.ensureDeck(n), /verschiedene/);
assert.deepStrictEqual(n.sheets.map((s) => s.meta.BLATT), ["1", "2", "3", "4"]);
const w = newDoc(); w.sheets.push(n.sheets[0]);
T.ensureDeck(w);
assert.deepStrictEqual(w.sheets.map((s) => s.kind || "schema"), ["title", "toc", "schema", "legend"]);
console.log("Neues Dokument ok");

// Inhaltsverzeichnis und Änderungsindex
assert.deepStrictEqual(T.tocRows(d).map((r) => r.no), ["1", "2", "3", "12", "Dispo 1", "13"]);
assert.deepStrictEqual(T.tocRows(d).map((r) => r.art), ["Titelseite", "Inhaltsverzeichnis", "Schema", "Schema", "Disposition", "Sicherungslegende"]);
assert.strictEqual(T.tocPageCount(d), 1);
const many = newDoc(); for (let i = 0; i < 60; i++) many.sheets.push(newSheet()); T.ensureDeck(many);
assert.strictEqual(T.tocPageCount(many), 3);
assert.strictEqual(T.deckPrintPages(many, many.sheets[1]).length, 3);
assert.strictEqual(T.nextRevIndex([]), "A");
assert.strictEqual(T.nextRevIndex([{ i: "A" }, { i: "c" }]), "D");
assert.match(T.titleSVG(d.sheets[0]), /<image href="data:image\/png/);
assert.match(T.tocSVG(d, d.sheets[1]), /data-sheet="4"/);
console.log("Inhalt und Index ok");

// Umbau (CJ 15.10.): Titelseite und Inhalt nur mit Schemablatt, löschbar (noTitle, noToc)
const kinds = (x) => x.sheets.map((s) => s.kind || "schema");
const pvd = newDoc(); pvd.sheets = [Object.assign(newSheet("pv"), { sid: 1 }), Object.assign(newSheet("dispo"), { sid: 2 })];
assert.strictEqual(T.ensureDeck(pvd), ""); assert.deepStrictEqual(kinds(pvd), ["pv", "dispo"], "reiner Stringplan und Disposition: ohne Titelseite, Inhalt, Legende");
pvd.sheets[0].meta.OBJEKT = "PV Dach";
const sc = newSheet(); sc.meta.BLATT = "3"; pvd.sheets.push(sc);
T.ensureDeck(pvd, null, { shift: false });
assert.deepStrictEqual(kinds(pvd), ["title", "toc", "pv", "dispo", "schema", "legend"], "erstes Schemablatt: Titelseite und Inhalt kommen dazu");
assert.deepStrictEqual(pvd.sheets.map((s) => s.meta.BLATT), ["1", "2", "1", "1", "3", "4"], "ohne shift bleiben die Nummern");
assert.strictEqual(pvd.sheets[0].meta.OBJEKT, "PV Dach", "Projektangaben vom Stringplan übernommen");
pvd.noTitle = true; T.ensureDeck(pvd, null, { shift: false });
assert.deepStrictEqual(kinds(pvd), ["toc", "pv", "dispo", "schema", "legend"], "Titelseite gelöscht");
assert.strictEqual(T.ensureDeck(pvd, null, { shift: false }), ""); assert.strictEqual(pvd.sheets[0].kind, "toc", "kommt nicht wieder");
pvd.noToc = true; T.ensureDeck(pvd, null, { shift: false });
assert.deepStrictEqual(kinds(pvd), ["pv", "dispo", "schema", "legend"]);
assert.strictEqual(pvd.sheets.at(-1).meta.BLATT, "4", "Legende ohne Titelseite: letztes Schemablatt + 1");
const pt = serializeModel(pvd); assert.strictEqual(JSON.parse(pt).noTitle, true);
const pb = parseModel(pt); assert.ok(pb.noTitle && pb.noToc); assert.strictEqual(T.ensureDeck(pb), ""); assert.deepStrictEqual(kinds(pb), ["pv", "dispo", "schema", "legend"], "Löschen bleibt nach dem Öffnen");
delete pb.noTitle; delete pb.noToc; T.ensureDeck(pb, null, { shift: false });
assert.deepStrictEqual(kinds(pb), ["title", "toc", "pv", "dispo", "schema", "legend"], "wieder einfügen");
pb.sheets = pb.sheets.filter((s) => !!s.kind); T.ensureDeck(pb, null, { shift: false });
assert.deepStrictEqual(kinds(pb), ["pv", "dispo"], "letztes Schemablatt gelöscht: Titelseite, Inhalt, Legende entfallen");
// Datei aus v2 vor dem Umbau (Stringplan mit Titelseite): beim Öffnen entfallen sie mit Meldung
const oldPv = newDoc(); oldPv.sheets = [Object.assign(newSheet("pv"), { sid: 1 })]; oldPv.sheets.unshift(Object.assign(newSheet("toc")), Object.assign(newSheet("title"), { info: T.cleanInfo({}) })); oldPv.sheets.push(newSheet("legend"));
assert.match(T.ensureDeck(oldPv), /nur in Dateien mit Schemablatt/); assert.deepStrictEqual(kinds(oldPv), ["pv"]);
console.log("Nur mit Schemablatt und löschbar ok");

// Gruppe D, Datenverlust: Stringplan-Datei mit Titelseite öffnen, speichern, öffnen, speichern. Plankopf bleibt gleich,
// Bauherr, Firma, Logo und Änderungsindex bleiben im Dokument (doc.info) und kommen mit einem Schemablatt auf die Titelseite zurück.
{
  const d = newDoc(), pv = Object.assign(newSheet("pv"), { sid: 1 }), tab = newSheet("pvtab");
  const ti = Object.assign(newSheet("title"), { info: T.cleanInfo({ BAUHERR: "Hans Muster", FIRMA: "Elektro CJ", FIRMA_ADR: "Weg 1", logo: "data:image/png;base64,iVBORw0KGgo=", revs: [{ i: "B", d: "01.10.2026", t: "PV ergänzt", n: "CJ" }] }) });
  Object.assign(ti.meta, { OBJEKT: "EFH Sonne", AUFTRAG: "A-7", SCHEMA: "PV", GEZEICHNET: "CJ", DATUM: "15.10.2026" });
  d.sheets = [ti, newSheet("toc"), pv, tab, newSheet("legend")]; T.syncDeck(d);
  Object.assign(pv.meta, { TITEL: "Dach Süd", BLATT: "5", INDEX: "C" }); Object.assign(tab.meta, { TITEL: "Übersicht", BLATT: "6" });
  const heads = (t) => JSON.parse(t).sheets.filter((s) => s.kind === "pv" || s.kind === "pvtab").map((s) => s.meta);
  const t0 = serializeModel(d), a = parseModel(t0);
  assert.match(T.ensureDeck(a), /Firma, Logo und Änderungsindex der Titelseite bleiben in der Datei/);
  const t1 = serializeModel(a), b = parseModel(t1); T.ensureDeck(b); const t2 = serializeModel(b);
  assert.deepStrictEqual(heads(t1), heads(t0), "Plankopf nach dem Öffnen gleich"); assert.strictEqual(t2, t1, "Speichern → Öffnen → Speichern gleich");
  assert.strictEqual(heads(t2)[0].OBJEKT, "EFH Sonne"); assert.strictEqual(heads(t2)[0].INDEX, "C");
  const info = JSON.parse(t2).info;
  assert.ok(info && info.FIRMA === "Elektro CJ" && info.BAUHERR === "Hans Muster" && info.logo && info.revs[0].i === "B", "Titel-Angaben auf Dokumentebene");
  b.sheets.push(newSheet()); T.ensureDeck(b, { FIRMA: "Andere AG" }, { shift: false });
  assert.strictEqual(b.sheets[0].info.FIRMA, "Elektro CJ", "neue Titelseite übernimmt die gespeicherten Angaben"); assert.strictEqual(b.sheets[0].info.revs.length, 1); assert.strictEqual(b.info, undefined);
  const e = newDoc(); T.ensureDeck(e); e.sheets.splice(0, 0); e.noTitle = true; e.sheets[0].info.FIRMA = "X"; T.ensureDeck(e, null, { shift: false });
  assert.strictEqual(e.info.FIRMA, "X", "gelöschte Titelseite: Angaben bleiben, ⌘Z oder Wiedereinfügen holt sie zurück");
  console.log("Gruppe D: Titel-Angaben ohne Titelseite erhalten ok");
}
console.log("ok");
