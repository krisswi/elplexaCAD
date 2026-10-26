// Modul «Offerten», Schritt 5: PDF-Seiten (offprint.js) und Excel-Export (offxlsx.js). Ohne Browser, nur erfundene Werte.
// Prüft: EK, Faktor, Zeit, Zeitfaktor und Ansatz nie in der Ausgabe; ohne Preise keine Beträge; die Formeln im Excel ergeben dieselben Summen wie der Editor.
// Aufruf: node test/test_offerte_ausgabe.mjs [Ausgabe.dxf] (Ausgabe wird nicht gebraucht)
import assert from "node:assert";
import zlib from "node:zlib";
import * as O from "../src/offerte.js";
import * as OP from "../src/offprint.js";
import { sheetRows, offerteXlsx } from "../src/offxlsx.js";

// ---------- Beispiel-Offerte (erfunden) ----------
const of = O.newOfferte("26.10.2026");
Object.assign(of, { nr: "T-1", ver: "A", ansatz: 97.35, fak: 1.37, zf: 0.7, rabatt: 5, skonto: 2, skTage: 10 });
const n = O.addRabattgruppe(of, "N", "netto"); n.satz = 0;
const k1 = O.addKapitel(of, "232.5"), g1 = k1.grp[0]; g1.titel = "Küche";
O.addPosition(of, g1, { titel: "Steckdose T13 3-fach", text: "UP, inkl. Dose und Abdeckung\nFarbe weiss", ic: "22", menge: 4, eh: "Stk", ek: 17.13, std: 0.61 });
O.addPosition(of, g1, { titel: "Leuchtenanschluss", menge: 3, eh: "Stk", preis: 66.66 });
O.addPosition(of, g1, { titel: "Dimmer", menge: 1, eh: "Stk", preis: 120, opt: true }); // Option aus
O.addPosition(of, g1, { titel: "Bewegungsmelder", menge: 2, eh: "Stk", preis: 88.8, opt: true, an: true }); // Option aktiv
const g2 = O.addGruppe(of, k1, "Bad"); g2.rg = n.id;
O.addPosition(of, g2, { titel: "Demontage alte Installation", typ: "regie", menge: 3.5, eh: "h", std: 1.5 });
O.addPosition(of, g2, { titel: "Sehr langer Text ".repeat(30), menge: 1, preis: 10.01 });
const k2 = O.addKapitel(of, "236"); O.addPosition(of, k2.grp[0], { titel: "Netzwerkdose RJ45", menge: 6, eh: "Stk", ek: 23.41, std: 0.4, ic: "21" });
for (let i = 0; i < 60; i++) O.addPosition(of, k2.grp[0], { titel: `Füllposition ${i + 1}`, menge: 1, preis: 1.05 }); // mehrere Seiten
const tot = O.totals(of);
const kunde = { BAUHERR: "Muster Bauherr", BAUHERR_ADR: "Musterweg 1\n9999 Musterhausen", BAUHERR_MAIL: "x@example.ch" };
const profil = { FIRMA: "Testfirma", FIRMA_ADR: "Testgasse 2\n8888 Testdorf", MWST: "CHE-000.000.000" };

// ---------- Schlusszusammenstellung (gleich für Editor, PDF, Excel) ----------
const { rows: sr, notes } = O.summaryRows(of, tot);
assert.deepStrictEqual(sr.map((r) => r.art), ["kap", "kap", "zs", "rab", "netto", "mwst", ...(sr.some((r) => r.art === "rund") ? ["rund"] : []), "total"]);
const c = (x) => Math.round(x * 100);
assert.strictEqual(sr.filter((r) => ["netto", "mwst", "rund"].includes(r.art)).reduce((s, r) => s + c(r.betrag), 0), c(tot.total), "Zeilen gehen auf (Netto + MwSt + Rundung = Total)");
assert.ok(notes.some((x) => x.startsWith("Skonto 2 % bei Zahlung innert 10 Tagen")) && notes.some((x) => x.startsWith("Optionen")), "Skonto und Optionen als Hinweis");

// ---------- PDF-Seiten ----------
const strip = (s) => s.replace(/<image[^>]*>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'");
const pages = OP.offertePages(of, { profil, kunde, projekt: "Testprojekt", prices: true }), all = strip(pages.join(" "));
assert.ok(pages.length >= 2, "mehrere Seiten");
pages.forEach((p, i) => assert.ok(strip(p).includes(`Seite ${i + 1} von ${pages.length}`), "Seitenzahl"));
for (const s of ["Testfirma", "MwSt-Nr. CHE-000.000.000", "Muster Bauherr", "9999 Musterhausen", "Offerte T-1", "Testprojekt", "Pos", "IC", "Menge", "EH", "Preis", "Betrag",
  "Total Lichtinstallationen BKP 232", "Total Schwachstrominstallationen BKP 236", "Schlusszusammenstellung", "Zwischensumme", O.fmtChf(tot.total), "Rabatt 5 %", "Farbe weiss", "Option, nicht in der Angebotssumme"])
  assert.ok(all.includes(s), `PDF zeigt «${s}»`);
const words = new Set(all.split(/\s+/));
for (const s of ["97.35", "1.37", "0.61", "17.13", "0.7", "Ansatz", "Faktor", "Zeitfaktor"]) assert.ok(!words.has(s) && !all.includes(` ${s} `), `PDF zeigt nie «${s}»`); // Ansatz, Faktor, Zeit, EK, Zeitfaktor
for (const p of pages) for (const [, y] of p.matchAll(/<text x="[\d.]+" y="([\d.]+)"/g)) assert.ok(Number(y) < OP.PH - 5, "kein Text unter dem Seitenrand");
const wl = OP.wrap("Sehr langer Text ".repeat(30), 100); assert.ok(wl.length > 3 && wl.every((l) => l.length * 2.9 * 0.5 <= 100.01), "Text wird umbrochen");
const np = strip(OP.offertePages(of, { kunde, prices: false }).join(" "));
assert.ok(np.includes("(ohne Preise)") && !np.includes("Betrag") && !np.includes(O.fmtChf(tot.total)) && !np.includes("Total Lichtinstallationen") && !np.includes("66.66"), "ohne Preise: keine Preise, Beträge, Summen");
assert.ok(OP.printPages(of, { prices: true })[0].startsWith("<svg") && OP.printPages(of, {})[0].includes("page:pA4h"), "Druckseite A4 hoch");

// ---------- Excel: Formeln nachrechnen ----------
const rows = sheetRows(of, { profil, kunde, projekt: "Testprojekt", prices: true });
const val = new Map(), cellOf = (r, i) => `${String.fromCharCode(65 + i)}${r + 1}`;
rows.forEach((cells, r) => cells.forEach((cc, i) => { const x = typeof cc === "string" ? { v: cc } : cc; val.set(cellOf(r, i), x); }));
const get = (ref) => { const x = val.get(ref); if (!x) return ""; if (x.f) return evalF(x.f); return x.v; };
const range = (a, b) => { const [, ca, ra] = /([A-Z])(\d+)/.exec(a), [, , rb] = /([A-Z])(\d+)/.exec(b); return Array.from({ length: rb - ra + 1 }, (_, i) => `${ca}${Number(ra) + i}`); };
function evalF(f) { // nur was offxlsx.js schreibt: SUMIFS, SUM, ROUND, Grundrechenarten
  let e = f.replace(/SUMIFS\(([A-Z]\d+):([A-Z]\d+),([A-Z]\d+):([A-Z]\d+),"<>([^"]*)",([A-Z]\d+):([A-Z]\d+),"<>"\)/g, (_, s0, s1, c0, c1, ne, a0, a1) => {
    const S = range(s0, s1), C = range(c0, c1), A = range(a0, a1);
    return String(S.reduce((sum, ref, i) => sum + (get(C[i]) !== ne && get(A[i]) !== "" ? Number(get(ref)) || 0 : 0), 0)); });
  e = e.replace(/SUM\(([^)]*)\)/g, (_, l) => `(${l.split(",").join("+")})`).replace(/ROUND\(([^()]*(?:\([^()]*\))?[^()]*),2\)/g, "rnd2($1)").replace(/ROUND\(/g, "rnd(").replace(/\b([A-Z]\d+)\b/g, (ref) => `(${Number(get(ref)) || 0})`);
  return Function("rnd", "rnd2", `return ${e}`)((x) => Math.round(x), (x) => Math.round(x * 100) / 100);
}
let checked = 0;
for (const [ref, x] of val) if (x.f) { const v = evalF(x.f); assert.ok(Math.abs(v - x.v) < 1e-6, `${ref}: Formel ${x.f} ergibt ${v}, Editor ${x.v}`); checked++; }
assert.ok(checked > 70, "Formeln geprüft");
const txt = [...val.values()].map((x) => String(x.v)).join(" ");
assert.ok(txt.includes("Total Lichtinstallationen BKP 232") && txt.includes("Muster Bauherr") && txt.includes("Option aktiv"), "Excel mit Kopf, Kapitelsumme, Option");
const totCell = [...val.values()].find((x) => x.f?.startsWith("ROUND") && x.s === 3); assert.strictEqual(totCell.v, tot.total, "Total wie im Editor");
for (const s of ["97.35", "1.37", "17.13", "0.61"]) assert.ok(!txt.split(" ").includes(s) && ![...val.values()].some((x) => String(x.f || "").includes(s)), `Excel ohne «${s}»`);
const noP = sheetRows(of, { kunde, prices: false }).flat().map((x) => (typeof x === "string" ? x : x.v));
assert.ok(!noP.includes("Preis") && !noP.includes("Betrag") && !noP.some((v) => typeof v === "number" && v === tot.total), "Excel ohne Preise");

// ---------- .xlsx-Datei: ZIP mit allen Teilen, gültiges XML ----------
const z = Buffer.from(offerteXlsx(of, { profil, kunde, prices: true }));
const names = []; for (let o = 0; z.readUInt32LE(o) === 0x04034b50;) { const nl = z.readUInt16LE(o + 26), sz = z.readUInt32LE(o + 18); names.push(z.subarray(o + 30, o + 30 + nl).toString()); o += 30 + nl + sz; }
assert.deepStrictEqual(names, ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/worksheets/sheet1.xml", "xl/styles.xml"]);
assert.ok(zlib && z.toString("utf8").includes("<f>SUMIFS("), "Formeln in der Datei");

console.log(`Offerte Ausgabe: ${pages.length} PDF-Seiten, ${checked} Excel-Formeln nachgerechnet, alle Tests grün.`);
