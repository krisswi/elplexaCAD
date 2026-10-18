// PV-Strings Schritt 2: Massstab aus Messstrecke, Fixpunkt, Plantausch, Dateiformat Version 4. Schritt 3: Ebenen, Dach, Fang. Schritt 4: Module. Schritt 5: Strings, SPA. Schritt 6: Spannungsprüfung, Stringübersicht. Schritt 7: Papier, Druckmassstab, Plankopf, Druckseiten.
import assert from "node:assert";
import * as P from "../src/pv.js";
import * as T from "../src/pvtab.js";
import * as PR from "../src/pvprint.js";
import { parseModel, serializeModel, newDoc, newSheet, VERSION } from "../src/model.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// Massstab: (0,0)–(300,400) pt = 500 pt, wirklich 18 000 mm → 36 mm/pt
const k = P.scaleFromMeasure([0, 0], [300, 400], 18000);
near(k, 36);
near(P.denOf(k), 36 / (25.4 / 72)); // 1:102,05
assert.strictEqual(P.nearestStd(k), 100);
near(P.kOfDen(100), 100 * 25.4 / 72); // 1:100 = 35,2778 mm/pt
assert.strictEqual(P.fmtDen(P.denOf(k)), "1:102");
assert.strictEqual(P.scaleFromMeasure([0, 0], [0, 0], 1000), null);
assert.strictEqual(P.scaleFromMeasure([0, 0], [1, 0], 0), null);
assert.strictEqual(P.nearestStd(P.kOfDen(60)), 50); // 60 liegt im Verhältnis näher bei 50 als bei 75
console.log("Massstab ok");

// Abbildung Seite ↔ Welt: Fixpunkt ist der Ursprung
const bg = { asset: "a", name: "x.pdf", page: 1, w: 1190, h: 842, fix: [100, 700], mmPerPt: P.kOfDen(100) };
assert.deepStrictEqual(P.pageToWorld(bg, 100, 700), { x: 0, y: 0 });
const w = P.pageToWorld(bg, 200, 600);
near(w.x, 100 * P.kOfDen(100)); near(w.y, 100 * P.kOfDen(100)); // y nach oben
const back = P.worldToPage(bg, w.x, w.y);
near(back.u, 200, 1e-9); near(back.v, 600, 1e-9);
// ohne Fixpunkt: unten links auf der Seite, ohne Massstab 1:1 auf Papier
assert.deepStrictEqual(P.pageToWorld({ w: 100, h: 50 }, 0, 50), { x: 0, y: 0 });
console.log("Abbildung ok");

// Plantausch: Objekte bleiben relativ zum Fixpunkt (mm), nur der Hintergrund ändert sich
const sheet = { kind: "pv", items: [{ id: 1, type: "text", x: 1000, y: 2000, h: 250, s: "M1" }], bg: { ...bg } };
const before = JSON.stringify(sheet.items);
sheet.bg = P.newBg(sheet.bg, "b", "neu.pdf", 1, 1684, 1190);
assert.strictEqual(sheet.bg.swap, true);
assert.strictEqual(sheet.bg.fix, undefined);
assert.strictEqual(sheet.bg.mmPerPt, undefined);
sheet.bg.mmPerPt = P.kOfDen(200); // neuer Plan im Massstab 1:200
assert.strictEqual(P.fixMode(sheet.bg, true), "fix"); // ohne Rückfrage: Objekte bleiben am Fixpunkt
const fx = 1234.5, fy = -321; // neuer Fixpunkt in der vorläufigen Welt
const target = P.worldToPage(sheet.bg, fx, fy);
P.setFix(sheet, fx, fy, "fix");
assert.strictEqual(JSON.stringify(sheet.items), before); // Objekt unverändert bei (1000, 2000) mm
assert.strictEqual(sheet.bg.swap, undefined);
near(sheet.bg.fix[0], target.u); near(sheet.bg.fix[1], target.v);
// Auf dem neuen Plan liegt das Objekt 1000 mm rechts und 2000 mm über dem neuen Fixpunkt
const at = P.worldToPage(sheet.bg, 1000, 2000);
near(at.u, target.u + 1000 / P.kOfDen(200)); near(at.v, target.v - 2000 / P.kOfDen(200));
console.log("Plantausch ok");

// Erster Plan: Fixpunkt nachträglich gesetzt, Objekte bleiben auf dem Plan (werden mitverschoben)
const s2 = { items: [{ id: 1, type: "text", x: 500, y: 500, h: 250, s: "A" }], bg: P.newBg(null, "a", "x.pdf", 1, 100, 100) };
assert.strictEqual(P.fixMode(s2.bg, true), "plan");
P.setFix(s2, 200, 100, "plan");
assert.deepStrictEqual([s2.items[0].x, s2.items[0].y], [300, 400]);
assert.strictEqual(P.fixMode(s2.bg, true), "ask"); // Fixpunkt schon gesetzt: Rückfrage
assert.strictEqual(P.fixMode(s2.bg, false), "fix");
// PDF fehlte (Wiederherstellen ohne PDF): neu verbinden behält Massstab und Fixpunkt
const re = P.newBg({ name: "x.pdf", page: 1, w: 100, h: 100, fix: [5, 6], mmPerPt: 2 }, "c", "x.pdf", 1, 100, 100);
assert.deepStrictEqual([re.fix, re.mmPerPt, re.swap], [[5, 6], 2, undefined]);
console.log("Fixpunkt ok");

// Dateiformat: Version 4 nur mit Stringplan, PDF unter assets byteidentisch, ungenutzte PDF fällt weg
const data = Buffer.from("%PDF-1.4 Testinhalt äöü").toString("base64");
const doc = newDoc();
const pv = newSheet("pv"); pv.sid = 5; pv.meta.BLATT = "1";
pv.bg = { asset: "pdf7", name: "Dach.pdf", page: 2, w: 1190, h: 842, fix: [10, 20], mmPerPt: 35.5, measure: { a: [1, 2], b: [3, 4], mm: 18000 } };
pv.items.push({ id: 9, type: "text", x: 1, y: 2, h: 250, s: "T" });
doc.sheets.push(pv);
doc.nextId = 10;
doc.assets = { pdf7: { name: "Dach.pdf", type: "application/pdf", data }, alt: { name: "alt.pdf", type: "application/pdf", data } };
const text = serializeModel(doc), o = JSON.parse(text);
assert.strictEqual(o.version, 6); // 5ab: Version 6 immer mit Stringplan
assert.deepStrictEqual(Object.keys(o.assets), ["pdf7"]);
assert.strictEqual(o.assets.pdf7.data, data);
const d2 = parseModel(text);
assert.deepStrictEqual(d2.sheets[1].bg, pv.bg);
assert.strictEqual(d2.assets.pdf7.data, data);
const t1 = serializeModel(d2);
assert.strictEqual(serializeModel(parseModel(t1)), t1); // Speichern → Laden → Speichern unverändert
// ohne PDF (Zwischenspeicher): Plan bleibt mit Massstab und Fixpunkt, nur asset fehlt
const d3 = parseModel(serializeModel(doc, { noAssets: true }));
assert.strictEqual(d3.sheets[1].bg.asset, undefined);
assert.deepStrictEqual(d3.sheets[1].bg.fix, [10, 20]);
// ohne Stringplan bleibt es Version 2, ohne assets
const plain = JSON.parse(serializeModel(newDoc()));
assert.strictEqual(plain.version, 2); assert.strictEqual(plain.assets, undefined);
// Unbekannte Objekte auf dem Stringplan werden abgelehnt, ebenso eine neuere Version
assert.throws(() => parseModel(JSON.stringify({ ...o, sheets: [{ kind: "pv", meta: {}, items: [{ id: 1, type: "wire", kind: "leitung", pts: [[0, 0], [10, 0]] }] }] })), /Stringplan/);
assert.throws(() => parseModel(JSON.stringify({ ...o, version: VERSION + 1 })), /neueren Version/); // 6 = Stringplan (5ab), 7 = Hauptlinien neu, 8 = Schrank (Disposition)
assert.deepStrictEqual(parseModel(JSON.stringify({ ...o, version: 4 })).sheets[1].bg, pv.bg); // 5ab: alte Dateien (Version 4) bleiben ladbar
assert.deepStrictEqual(parseModel(JSON.stringify({ ...o, version: 5 })).sheets[1].bg, pv.bg);
console.log("Dateiformat ok");

// ---------- Schritt 3 ----------
// Fang auf Dachlinien: Eckpunkt vor Mitte vor Kante, dann Raster ab Fixpunkt, Alt aus
const roof = { kind: "pv", items: [{ id: 1, type: "roofline", pts: [[0, 0], [10000, 0], [10000, 6000]], closed: false }] };
assert.deepStrictEqual(P.snapPv(roof, { x: 10030, y: -20 }, { grid: 100, tol: 80 }), { x: 10000, y: 0, snap: "end" });
assert.deepStrictEqual(P.snapPv(roof, { x: 5040, y: 30 }, { grid: 100, tol: 80 }), { x: 5000, y: 0, snap: "mid" });
assert.deepStrictEqual(P.snapPv(roof, { x: 2337, y: 41 }, { grid: 100, tol: 80 }), { x: 2337, y: 0, snap: "edge" });
assert.deepStrictEqual(P.snapPv(roof, { x: 10050, y: 3333 }, { grid: 100, tol: 80 }), { x: 10000, y: 3333, snap: "edge" }); // senkrechte Kante
assert.deepStrictEqual(P.snapPv(roof, { x: 2337, y: 241 }, { grid: 100, tol: 80 }), { x: 2300, y: 200, snap: "grid" }); // ausserhalb: Raster
assert.deepStrictEqual(P.snapPv(roof, { x: 2337, y: 41 }, { grid: 100, tol: 80, alt: true }), { x: 2337, y: 41 }); // Alt
assert.deepStrictEqual(P.snapPv(roof, { x: 149, y: -51 }, { grid: 100, tol: 0 }), { x: 100, y: -100, snap: "grid" }); // Raster-Ursprung = Fixpunkt (0, 0)
assert.deepStrictEqual(P.snapPv(roof, { x: 7, y: 3 }, { grid: 0, tol: 80, extra: [[5, 5]] }), { x: 5, y: 5, snap: "end" }); // Punkte im Entstehen
// geschlossene Dachlinie: auch die Schlusskante fängt; ausgeblendete Ebene fängt nicht, gesperrte schon
roof.items[0].closed = true;
assert.deepStrictEqual(P.snapPv(roof, { x: 5000, y: 3060 }, { grid: 100, tol: 80 }), { x: 5000, y: 3000, snap: "mid" });
P.toggleLayer(roof, "dach", "lock");
assert.strictEqual(P.snapPv(roof, { x: 10030, y: -20 }, { grid: 100, tol: 80 }).snap, "end");
P.toggleLayer(roof, "dach", "show");
assert.strictEqual(P.snapPv(roof, { x: 10030, y: -20 }, { grid: 100, tol: 80 }).snap, "grid");
console.log("Fang ok");

// ---------- Schritt 3b ----------
// Schnittpunkte: Kreuz zweier Dachlinien, Rang Ecke vor Schnitt vor Mitte; auch Sperrflächenkanten
const xs = { kind: "pv", items: [{ id: 1, type: "roofline", pts: [[0, 0], [1000, 1000]], closed: false }, { id: 2, type: "roofline", pts: [[0, 1000], [1000, 0]], closed: false }] };
assert.deepStrictEqual(P.snapPv(xs, { x: 520, y: 470 }, { grid: 100, tol: 80 }), { x: 500, y: 500, snap: "inter" }); // Mitte beider Linien wäre auch 500/500, Schnitt geht vor
xs.items[1].pts = [[0, 300], [1000, 300]];
assert.deepStrictEqual(P.snapPv(xs, { x: 330, y: 290 }, { grid: 100, tol: 80 }), { x: 300, y: 300, snap: "inter" });
assert.deepStrictEqual(P.snapPv(xs, { x: 30, y: 280 }, { grid: 100, tol: 80 }), { x: 0, y: 300, snap: "end" });
xs.items.push({ id: 3, type: "keepout", pts: [[600, 0], [800, 0], [800, 900]] }); // Kante (800,0)–(800,900) schneidet y = 300
assert.deepStrictEqual(P.snapPv(xs, { x: 790, y: 320 }, { grid: 100, tol: 80 }), { x: 800, y: 300, snap: "inter" });
assert.deepStrictEqual(P.segX([[0, 0], [10, 0]], [[0, 1], [10, 1]]), null); // parallel
assert.deepStrictEqual(P.segX([[0, 0], [10, 0]], [[20, -1], [20, 1]]), null); // ausserhalb
assert.strictEqual(P.snapPv(xs, { x: 330, y: 290 }, { grid: 100, tol: 80, skip: 2 }).snap, "edge"); // skip: Objekt 2 fängt nicht
// Shift (ortho): waagrecht oder senkrecht zum Bezugspunkt, freie Koordinate auf Raster bzw. Fang
const em = { kind: "pv", items: [] };
assert.deepStrictEqual(P.snapPv(em, { x: 2437, y: 380 }, { grid: 100, tol: 80, ortho: [0, 0] }), { x: 2400, y: 0, snap: "grid" });
assert.deepStrictEqual(P.snapPv(em, { x: 380, y: 2437 }, { grid: 100, tol: 80, ortho: [0, 0] }), { x: 0, y: 2400, snap: "grid" });
assert.deepStrictEqual(P.snapPv(em, { x: 2437, y: 380 }, { grid: 0, tol: 80, ortho: [0, 0] }), { x: 2437, y: 0 });
assert.deepStrictEqual(P.snapPv(em, { x: 2437, y: 380 }, { grid: 100, alt: true, ortho: [0, 0] }), { x: 2437, y: 0 }); // Alt: rechtwinklig ohne Fang
assert.deepStrictEqual(P.snapPv(xs, { x: 1030, y: 1060 }, { grid: 100, tol: 80, ortho: [0, 1040] }), { x: 1000, y: 1040, snap: "end" }); // Ecke (1000,1000) nahe der Achse: auf die Achse projiziert
assert.deepStrictEqual(P.snapPv(xs, { x: 760, y: 1530 }, { grid: 100, tol: 80, ortho: [0, 1500] }), { x: 800, y: 1500, snap: "grid" }); // Ecke (800,900) zu weit weg: Raster
xs.items[2].pts[2] = [800, 2000];
assert.deepStrictEqual(P.snapPv(xs, { x: 790, y: 1530 }, { grid: 100, tol: 80, ortho: [0, 1500] }), { x: 800, y: 1500, snap: "edge" }); // Kante schneidet die Achse
console.log("Fang 3b ok");

// Ebenen: ausgeblendet = nicht sichtbar, nicht wählbar; gesperrt = sichtbar, nicht wählbar. Text liegt auf Beschriftung.
const ly = { items: [] }, tx = { type: "text" }, ko = { type: "keepout" };
assert.ok(P.visible(ly, ko) && P.pickable(ly, ko) && ly.layers === undefined);
P.toggleLayer(ly, "dach", "lock");
assert.ok(P.visible(ly, ko) && !P.pickable(ly, ko) && P.pickable(ly, tx));
P.toggleLayer(ly, "text", "show");
assert.ok(!P.visible(ly, tx) && !P.pickable(ly, tx));
assert.deepStrictEqual(Object.keys(ly.layers), ["bg", "dach", "module", "kabel", "text"]);
console.log("Ebenen ok");

// Sperrfläche: Treffer innen und auf der Kante, Fläche
const k1 = { id: 1, type: "keepout", pts: [[0, 0], [2000, 0], [2000, 1000], [0, 1000]] };
assert.ok(P.hitPv(k1, 1000, 500, 10) && P.hitPv(k1, 2005, 500, 10) && !P.hitPv(k1, 2100, 500, 10));
near(P.area(k1.pts), 2e6); near(P.pathLen(k1), 6000);
assert.ok(!P.hitPv({ type: "roofline", pts: [[0, 0], [2000, 0], [2000, 1000]], closed: false }, 1000, 500, 10)); // offene Linie: innen kein Treffer
assert.strictEqual(P.cleanPvItem({ type: "keepout", pts: [[0, 0], [1, 1]] }, 1), null); // zu wenig Punkte
assert.strictEqual(P.cleanPvItem({ type: "roofline", pts: [[0, 0], [1, "x"]] }, 1), null);
console.log("Sperrfläche ok");

// Speichern/Laden: Dachlinien, Sperrflächen und Ebenen unverändert; Dachobjekte nur auf Stringplänen
const d4 = newDoc(), pv4 = newSheet("pv"); pv4.sid = 3;
pv4.bg = { asset: "pdf1", name: "Dach.pdf", page: 1, w: 842, h: 595, fix: [100, 495], mmPerPt: P.kOfDen(100) };
pv4.items.push({ id: 4, type: "roofline", pts: [[0, 0], [18000, 0], [18000, 9000], [0, 9000]], closed: true }, { id: 5, type: "keepout", pts: [[1000, 1000], [2500.5, 1000], [2500.5, 2200]] }, { id: 6, type: "roofline", pts: [[0, 4500], [18000, 4500]], closed: false });
P.toggleLayer(pv4, "bg", "lock");
d4.sheets.push(pv4); d4.nextId = 7; d4.assets = { pdf1: { name: "Dach.pdf", type: "application/pdf", data } };
const t4 = serializeModel(d4), r4 = parseModel(t4);
assert.deepStrictEqual(r4.sheets[1].items, pv4.items);
assert.deepStrictEqual(r4.sheets[1].layers, pv4.layers);
const t4b = serializeModel(r4); assert.strictEqual(serializeModel(parseModel(t4b)), t4b); // Speichern → Laden → Speichern unverändert
assert.strictEqual(parseModel(serializeModel(doc)).sheets[1].layers, undefined); // Datei aus Schritt 2 bleibt ohne Ebenen
const bad = JSON.parse(t4); bad.sheets[0].items.push({ id: 99, type: "keepout", pts: [[0, 0], [1, 0], [1, 1]] });
assert.throws(() => parseModel(JSON.stringify(bad)), /Stringplan/);
const bad2 = JSON.parse(t4); bad2.sheets[1].items.push({ id: 99, type: "keepout", pts: [[0, 0], [1, 0]] });
assert.throws(() => parseModel(JSON.stringify(bad2)), /defekt/);
console.log("Dach speichern ok");

// Plantausch mit Dachlinien: bleiben am Fixpunkt (mm); "plan" verschiebt auch die Punkte
const s3 = { items: JSON.parse(JSON.stringify(pv4.items)), bg: P.newBg(pv4.bg, "pdf2", "neu.pdf", 1, 1190, 842) };
const before3 = JSON.stringify(s3.items);
s3.bg.mmPerPt = P.kOfDen(200);
P.setFix(s3, 500, 700, P.fixMode(s3.bg, true));
assert.strictEqual(JSON.stringify(s3.items), before3);
const pa = P.worldToPage(s3.bg, 18000, 9000), p0 = P.worldToPage(s3.bg, 0, 0);
near(pa.u - p0.u, 18000 / P.kOfDen(200)); near(p0.v - pa.v, 9000 / P.kOfDen(200)); // Dachecke 18 × 9 m relativ zum neuen Fixpunkt
P.setFix(s3, 100, -200, "plan");
assert.deepStrictEqual(s3.items[0].pts[1], [17900, 200]);
assert.deepStrictEqual(s3.items[1].pts[1], [2400.5, 1200]);
console.log("Plantausch Dach ok");

// Schritt 3c: aktive Ebene (Objekt trägt layer) und bekannter Massstab
assert.deepStrictEqual(P.DRAW_LAYERS, ["bg", "dach", "module", "kabel", "text"]); // ⌘1 bis ⌘5 (3d: auch Hintergrund)
assert.strictEqual(P.layerOf({ type: "roofline" }), "dach"); // Datei vor 3c: aus dem Typ
assert.strictEqual(P.layerOf({ type: "text" }), "text");
assert.strictEqual(P.layerOf({ type: "roofline", layer: "module" }), "module");
assert.strictEqual(P.cleanPvItem({ type: "roofline", pts: [[0, 0], [1, 0]], layer: "kabel" }, 1).layer, "kabel");
assert.strictEqual(P.cleanPvItem({ type: "roofline", pts: [[0, 0], [1, 0]], layer: "bg" }, 1).layer, "bg");
assert.strictEqual(P.cleanPvItem({ type: "keepout", pts: [[0, 0], [1, 0], [1, 1]], layer: "xyz" }, 1).layer, undefined);
const ly3 = { items: [] }, onMod = { type: "roofline", layer: "module" };
P.toggleLayer(ly3, "module", "lock");
assert.ok(!P.pickable(ly3, onMod) && P.pickable(ly3, { type: "roofline" }));
const d5 = newDoc(), pv5 = newSheet("pv"); pv5.sid = 2;
pv5.items.push({ id: 1, type: "roofline", pts: [[0, 0], [10, 0]], closed: false, layer: "module" }, { id: 2, type: "text", x: 0, y: 0, h: 250, s: "A", layer: "dach" }, { id: 3, type: "text", x: 5, y: 0, h: 250, s: "B" });
d5.sheets[0].items.push({ id: 4, type: "text", x: 0, y: 0, h: 2.5, s: "S", layer: "dach" }); // Schemablatt: kein layer
d5.sheets.push(pv5); d5.nextId = 5;
const r5 = parseModel(serializeModel(d5));
assert.deepStrictEqual(r5.sheets[1].items, pv5.items);
assert.strictEqual(r5.sheets[0].items.at(-1).layer, undefined);
for (const [inp, out] of [["100", 100], ["1:200", 200], [" 1 : 50 ", 50], ["98,5", 98.5], ["0", null], ["", null], ["abc", null], ["1:", null], ["-100", null], ["2:100", null]]) assert.strictEqual(P.parseDen(inp), out, inp);
console.log("Aktive Ebene und Massstab 3c ok");

// Schritt 3d: Plan drehen um den Fixpunkt, Objekte drehen mit
const bgr = { asset: "a", name: "x.pdf", page: 1, w: 1190, h: 842, fix: [100, 700], mmPerPt: P.kOfDen(100), rot: 30 };
assert.deepStrictEqual(P.pageToWorld(bgr, 100, 700), { x: 0, y: 0 }); // Fixpunkt bleibt
const wr = P.pageToWorld(bgr, 200, 700); // 100 pt rechts vom Fixpunkt → um 30° gedreht
near(wr.x, 100 * P.kOfDen(100) * Math.cos(Math.PI / 6), 1e-6); near(wr.y, 100 * P.kOfDen(100) * 0.5, 1e-6);
const br = P.worldToPage(bgr, wr.x, wr.y); near(br.u, 200, 1e-9); near(br.v, 700, 1e-9);
const bx = P.bgBox({ w: 100, h: 50, fix: [0, 50], rot: 90 }); // 90°: Breite und Höhe tauschen
near(bx.x0, -50 * P.PT_MM, 1e-9); near(bx.x1, 0, 1e-9); near(bx.y0, 0, 1e-9); near(bx.y1, 100 * P.PT_MM, 1e-9);
near(P.alignAngle([0, 0], [100, 17.6327]), -10, 1e-3); // 10° steigend → −10°
near(P.alignAngle([0, 0], [-20, 100]), -11.30993, 1e-4); // fast senkrecht → senkrecht
assert.strictEqual(P.alignAngle([0, 0], [5, 0]), 0);
const sr = { bg: { w: 100, h: 50, fix: [0, 50] }, items: [{ id: 1, type: "roofline", pts: [[1000, 0], [0, 2000]], closed: false }, { id: 2, type: "text", x: 0, y: 500, h: 250, s: "T" }] };
assert.strictEqual(P.rotatePlan(sr, 90), 90);
assert.deepStrictEqual(sr.items[0].pts, [[0, 1000], [-2000, 0]]);
assert.deepStrictEqual([sr.items[1].x, sr.items[1].y], [0, 500]); // Text bleibt (5az, CJ 17.10.)
assert.strictEqual(P.rotatePlan(sr, 200), -70); // auf −180 … 180
P.rotatePlan(sr, 70); assert.strictEqual(sr.bg.rot, undefined); // 0 = kein Feld
assert.deepStrictEqual(sr.items[0].pts, [[1000, 0], [0, 2000]]);
assert.strictEqual(P.newBg({ ...bgr, asset: undefined }, "b", "x.pdf", 1, 1, 1).rot, 30); // nur PDF fehlte: Drehung bleibt
assert.strictEqual(P.newBg(bgr, "b", "y.pdf", 1, 1, 1).rot, 30); // 5p: Plantausch übernimmt die Drehung
assert.strictEqual(P.newBg({ ...bgr, rot: undefined }, "b", "y.pdf", 1, 1, 1).rot, undefined); // ungedreht bleibt ungedreht
assert.strictEqual(P.cleanBg({ w: 1, h: 1, rot: 12.5 }, {}).rot, 12.5);
assert.strictEqual(P.cleanBg({ w: 1, h: 1, rot: "x" }, {}).rot, undefined);
console.log("Plan drehen 3d ok");
// Schritt 4: Modultyp, Katalog, Modulfeld, Module. Zahlen frei gewählt, keine echten Moduldaten.
{
const mt1 = { id: "m1", name: "Test 400", l: 1700, b: 1100, d: 30, pmax: 400, voc: 37.5, tkVoc: -0.27 };
let typeList = [mt1];
P.setTypeSource(() => typeList);
assert.deepStrictEqual(P.modSize("m1", false), [1100, 1700]); // hoch: lange Seite senkrecht
assert.deepStrictEqual(P.modSize("m1", true), [1700, 1100]);
assert.deepStrictEqual(P.modSize("fehlt", false), [0, 0]);
// Feld 5 × 6 hoch, Abstand 5 mm waagrecht und 10 mm senkrecht, Ecke unten links bei (1000, 2000)
const fp = P.fieldPositions(1000, 2000, 5, 6, P.modSize("m1", false), 5, 10);
assert.strictEqual(fp.length, 30);
assert.deepStrictEqual(fp[0], [1000, 2000]);
assert.deepStrictEqual(fp[1], [1000 + 1105, 2000]); // nächste Spalte: Breite + Abstand
assert.deepStrictEqual(fp[5], [1000, 2000 + 1710]); // nächste Reihe: Länge + Abstand
assert.deepStrictEqual(fp[29], [1000 + 4 * 1105, 2000 + 5 * 1710]);
assert.deepStrictEqual(P.fieldPositions(0, 0, 2, 1, P.modSize("m1", true), P.GAP, P.GAP), [[0, 0], [1705, 0]]); // quer, Vorgabe 5 mm
assert.strictEqual(P.GAP, 5);
console.log("Modulfeld ok");
// Modultyp prüfen und aus dem Formular
assert.deepStrictEqual(P.cleanModuleType({ id: "x", name: " A ", l: 1, b: 2, voc: "40", isc: -1, tkVoc: -0.3, foo: 1 }), { id: "x", name: "A", l: 1, b: 2, tkVoc: -0.3 });
assert.strictEqual(P.cleanModuleType({ id: "x", name: "", l: 1, b: 1 }), null);
assert.strictEqual(P.cleanModuleType({ id: "x", name: "A", l: 0, b: 1 }), null);
const f1 = P.typeFromForm(["Neu", "1722", "1134", "", "410", "37,4", "", "", "", "-0,27"], "m9");
assert.deepStrictEqual(f1.type, { id: "m9", name: "Neu", l: 1722, b: 1134, pmax: 410, voc: 37.4, tkVoc: -0.27 });
assert.ok(P.typeFromForm(["Neu", "abc", "1"], "m9").error.includes("Länge"));
assert.ok(P.typeFromForm(["", "1", "1"], "m9").error.includes("Name"));
// Katalog-Rundreise: sichern ohne ids, laden mit neuen ids, gleiche Namen übersprungen
const cat = P.catalogText([mt1, f1.type]);
assert.ok(!cat.includes('"id"'));
const loaded = P.parseCatalog(cat);
assert.deepStrictEqual(loaded.map(({ id: _, ...t }) => t), [mt1, f1.type].map(({ id: _, ...t }) => t));
const catTarget = [{ id: "m5", name: "Test 400", l: 1, b: 1 }];
let nid = 100;
assert.strictEqual(P.mergeCatalog(catTarget, loaded, () => "m" + ++nid), 1);
assert.deepStrictEqual(catTarget.map((t) => [t.id, t.name]), [["m5", "Test 400"], ["m101", "Neu"]]);
assert.throws(() => P.parseCatalog('{"format":"schemacad"}'), /keine SchemaCAD-Katalogdatei/);
assert.throws(() => P.parseCatalog("nein"), /kein gültiges JSON/);
console.log("Katalog ok");
// Sperrfläche: nur Warnung. Überlappen, ganz innen, Sperrfläche ganz im Modul, nur berühren
const ko = { bg: undefined, items: [{ id: 1, type: "keepout", pts: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]] }] };
const mAt = (x, y, quer = false) => ({ type: "pvmodule", mt: "m1", x, y, quer });
assert.strictEqual(P.onKeepout(ko, mAt(500, 500)), true); // überlappt
assert.strictEqual(P.onKeepout(ko, mAt(1000, 0)), true); // 5z: Berühren der Kante zählt
assert.strictEqual(P.onKeepout(ko, mAt(1000, 1000)), true); // 5z: Berühren einer Ecke zählt
assert.strictEqual(P.onKeepout(ko, mAt(1005, 0)), false);
assert.strictEqual(P.onKeepout(ko, mAt(-2000, -500, true)), false);
assert.strictEqual(P.onKeepout({ items: [{ id: 1, type: "keepout", pts: [[100, 100], [200, 100], [150, 200]] }] }, mAt(0, 0)), true); // Sperrfläche ganz im Modul
assert.strictEqual(P.onKeepout({ items: [{ id: 1, type: "keepout", pts: [[-100, -100], [5000, -100], [5000, 5000], [-100, 5000]] }] }, mAt(0, 0)), true); // Modul ganz innen
console.log("Sperrfläche Warnung ok");
// 5az (CJ 17.10., ersetzt 5f): Plan drehen dreht nur Dachlinien und Sperrflächen, Module bleiben wo und wie sie sind.
// Ein Modul mit rot aus einer älteren Datei (5f) bleibt gedreht und wird gedreht geprüft.
{
  const ov = { id: 4, type: "keepout", pts: [[1000, 100], [1500, 100], [1500, 500], [1000, 500]] }; // überlappt das Modul
  const sd = { bg: { w: 100, h: 50, fix: [0, 50] }, items: [{ id: 1, type: "roofline", pts: [[0, 0], [3000, 0]], closed: false }, { id: 2, ...mAt(0, 0) }, { id: 3, type: "keepout", pts: [[1200, 0], [2000, 0], [2000, 800], [1200, 800]] }, ov] };
  const m = sd.items[1], c0 = P.modCenter(m);
  assert.strictEqual(P.onKeepout(sd, m), true);
  const k0 = JSON.stringify(sd.items[2].pts);
  P.rotatePlan(sd, 30);
  assert.ok(!("rot" in m)); assert.deepStrictEqual([m.x, m.y], [0, 0]); assert.deepStrictEqual(P.modCenter(m), c0); // Modul bleibt
  const r1 = P.rotPt(3000, 0, 30); near(sd.items[0].pts[1][0], r1[0], 1e-3); near(sd.items[0].pts[1][1], r1[1], 1e-3); // Dachlinie dreht
  assert.notStrictEqual(JSON.stringify(sd.items[2].pts), k0); // Sperrfläche dreht
  P.rotatePlan(sd, -30); assert.deepStrictEqual(sd.items[0].pts, [[0, 0], [3000, 0]]); JSON.parse(k0).flat().forEach((v, j) => near(sd.items[2].pts.flat()[j], v, 0.002)); // zurück, bis auf Rundung 0,001 mm
  const old = { ...mAt(0, 0), rot: 30 }; // gedrehtes Modul aus einer älteren Datei
  assert.ok(P.hitMod(old, ...P.rotPt(1000, 1600, 30))); assert.ok(!P.hitMod(old, 1000, 1600)); // Treffer im gedrehten Rechteck
  const bb = P.modBox(old); near(bb.x0, -1700 * 0.5, 1e-6); near(bb.x1, 1100 * Math.cos(Math.PI / 6), 1e-6); // umgebendes Rechteck
  const so = { items: [old] }; P.rotatePlan({ bg: {}, items: so.items }, 15); assert.strictEqual(old.rot, 30, "alte Drehung bleibt");
  assert.strictEqual(P.cleanPvItem({ ...mAt(0, 0), rot: 12.5 }, 5).rot, 12.5); assert.ok(!("rot" in P.cleanPvItem(mAt(0, 0), 5)));
  console.log("Plan drehen 5az: Module bleiben ok");
  // Schritt 5h: Füllung nur an Sperrfläche und geschlossener Dachlinie, unbekannte Werte fallen weg
  const kf = { type: "keepout", pts: [[0, 0], [1, 0], [1, 1]] }, rf = { type: "roofline", pts: [[0, 0], [1, 0], [1, 1]], closed: true };
  assert.ok(!("fill" in P.cleanPvItem({ ...kf, fill: "ziegel-rot" }, 1))); // 5u: Sperrfläche ohne Dachmuster (eigene Schraffur)
  assert.strictEqual(P.cleanPvItem({ ...rf, fill: "trapez-braun" }, 1).fill, "trapez-braun");
  assert.ok(!("fill" in P.cleanPvItem({ ...rf, closed: false, fill: "trapez-braun" }, 1))); // offene Dachlinie: keine Füllung
  assert.ok(!("fill" in P.cleanPvItem({ ...kf, fill: "gold" }, 1))); assert.ok(!("fill" in P.cleanPvItem(kf, 1))); // alte Datei: keine Füllung
  assert.deepStrictEqual(P.FILLS.map(([k]) => k), ["", "ziegel-rot", "ziegel-dunkel", "trapez-hell", "trapez-dunkel", "trapez-braun"]);
  console.log("Füllmuster 5h ok");
  // Schritt 5i: Richtung des Musters, dreht mit dem Plan, nur mit Füllung gespeichert
  assert.strictEqual(P.cleanPvItem({ ...rf, fill: "ziegel-rot", fdir: 90 }, 1).fdir, 90); assert.ok(!("fdir" in P.cleanPvItem({ ...rf, fdir: 90 }, 1)));
  const sf = { bg: { w: 1, h: 1 }, items: [{ id: 1, ...rf, fill: "trapez-hell", fdir: 90 }, { id: 2, ...rf }] };
  P.rotatePlan(sf, -10); assert.strictEqual(sf.items[0].fdir, 80); assert.ok(!("fdir" in sf.items[1]));
  P.rotatePlan(sf, 10); assert.strictEqual(sf.items[0].fdir, 90);
  console.log("Richtung Füllmuster 5i ok");
  // Schritt 5j: Autoverkabelung, 315 Module (15 Reihen × 21), Schlangenlinie, Tempo
  const R15 = 15, C21 = 21, gid = (r, c) => 1000 + r * C21 + c;
  const sg = { kind: "pv", items: [] };
  for (let r = 0; r < R15; r++) for (let c = 0; c < C21; c++) sg.items.push({ id: gid(r, c), ...mAt(c * 1105, r * 1705) });
  const t0 = performance.now(), ah = P.autoStrings(sg, gid(0, 0), 15, 21, "h"), dt = performance.now() - t0;
  assert.ok(dt < 100, `Autoverkabelung zu langsam: ${dt} ms`);
  assert.strictEqual(ah.length, 15); assert.strictEqual(new Set(ah.flat()).size, 315);
  assert.deepStrictEqual(ah[0], Array.from({ length: 21 }, (_, c) => gid(0, c))); // Reihe hin
  assert.deepStrictEqual(ah[1], Array.from({ length: 21 }, (_, c) => gid(1, 20 - c))); // nächste Reihe zurück
  const av = P.autoStrings(sg, gid(0, 0), 2, 15, "v");
  assert.deepStrictEqual(av[0], Array.from({ length: 15 }, (_, r) => gid(r, 0))); assert.deepStrictEqual(av[1], Array.from({ length: 15 }, (_, r) => gid(14 - r, 1)));
  assert.strictEqual(P.autoStrings(sg, gid(0, 0), 16, 21, "h").length, 15); // zu wenige Module: nur volle Strings
  assert.deepStrictEqual(P.autoStrings(sg, gid(0, 0), 1, 316, "h"), []);
  assert.deepStrictEqual(P.autoStrings(sg, gid(10, 20), 1, 22, "h")[0], [...Array.from({ length: 21 }, (_, c) => gid(10, 20 - c)), gid(9, 0)]); // Start rechts, Richtung zum entfernteren Rand (nach unten)
  sg.items.push({ id: 9, type: "pvstring", name: "1.1.1", mods: [gid(0, 0), gid(0, 1), gid(0, 2)] });
  assert.deepStrictEqual(P.autoStrings(sg, gid(0, 3), 1, 18, "h")[0], Array.from({ length: 18 }, (_, c) => gid(0, c + 3))); // verkabelte übersprungen
  assert.deepStrictEqual(P.autoStrings(sg, gid(0, 0), 1, 3, "h"), []); // Start schon verkabelt
  console.log(`Autoverkabelung 5j ok (${dt.toFixed(1)} ms für 315 Module)`);
}
// Fang auf Modulecken (vor dem Raster), Ebene Module ausgeblendet: kein Fang
const sm = { kind: "pv", items: [{ id: 1, ...mAt(0, 0) }] };
assert.deepStrictEqual(P.snapPv(sm, { x: 1103, y: 1698 }, { grid: 100, tol: 10 }), { x: 1100, y: 1700, snap: "end" });
assert.strictEqual(P.snapPv(sm, { x: 1103, y: 1698 }, { grid: 100, tol: 10, skip: 1 }).snap, "grid");
P.toggleLayer(sm, "module", "show");
assert.strictEqual(P.snapPv(sm, { x: 1103, y: 1698 }, { grid: 100, tol: 10 }).snap, "grid");
assert.strictEqual(P.layerOf(sm.items[0]), "module");
console.log("Fang Module ok");
// Datei: Katalog und Module speichern und laden, Version 4, fehlender Typ wird abgelehnt
const d6 = newDoc(); const pv6 = newSheet("pv"); pv6.sid = 7; d6.sheets.push(pv6);
d6.pv = { moduleTypes: [mt1] };
pv6.items.push({ id: 3, type: "pvmodule", mt: "m1", x: 500, y: 400, quer: false }, { id: 4, type: "pvmodule", mt: "m1", x: 1605, y: 400, quer: true });
d6.nextId = 5;
const t6 = serializeModel(d6), r6 = parseModel(t6);
assert.strictEqual(JSON.parse(t6).version, 6);
assert.deepStrictEqual(r6.pv, d6.pv);
assert.deepStrictEqual(r6.sheets[1].items, pv6.items);
assert.strictEqual(serializeModel(r6), t6); // speichern → laden → speichern unverändert
const bad = JSON.parse(t6); bad.pv.moduleTypes[0].id = "m2";
assert.throws(() => parseModel(JSON.stringify(bad)), /Modultyp, der im Katalog fehlt/);
const bad2 = JSON.parse(t6); bad2.sheets[0].items.push({ id: 9, type: "pvmodule", mt: "m1", x: 0, y: 0 });
assert.throws(() => parseModel(JSON.stringify(bad2)), /gehören auf einen Stringplan/);
const bad3 = JSON.parse(t6); bad3.pv.moduleTypes.push({ ...mt1 });
assert.throws(() => parseModel(JSON.stringify(bad3)), /Modultyp im Katalog ist defekt/);
assert.strictEqual(parseModel(serializeModel(newDoc())).pv, undefined); // Schema ohne Katalog bleibt ohne
console.log("Datei Module ok");
}
// Fehler 1 aus CJs Prüfung von Schritt 4: Modulgrösse auf dem Plan. Modul 1134 × 1722 mm (hoch) bei 1:100
// = 11,34 × 17,22 mm auf dem Papier, gleich mit bekanntem Massstab, gemessener Strecke und gedrehtem Plan.
{
  const mtS = { id: "s", name: "S", l: 1722, b: 1134 }, [mw, mh] = P.modSize(mtS, false);
  const onPaper = (bgX) => { // Modul bei (0, 0): Kantenlängen auf der Seite in mm Papier
    const a = P.worldToPage(bgX, 0, 0), b = P.worldToPage(bgX, mw, 0), c = P.worldToPage(bgX, 0, mh);
    return [Math.hypot(b.u - a.u, b.v - a.v) * P.PT_MM, Math.hypot(c.u - a.u, c.v - a.v) * P.PT_MM];
  };
  const known = { w: 842, h: 595, fix: [100, 500], mmPerPt: P.kOfDen(P.parseDen("1:100")) };
  const [kw, kh] = onPaper(known); near(kw, 11.34, 1e-9); near(kh, 17.22, 1e-9);
  // Strecke messen: 300 pt auf der Seite sind bei 1:100 wirklich 300 × 35,278 mm = 10 583,3 mm
  const kM = P.scaleFromMeasure([100, 500], [400, 500], 300 * P.PT_MM * 100);
  const [gw, gh] = onPaper({ ...known, mmPerPt: kM }); near(gw, 11.34, 1e-9); near(gh, 17.22, 1e-9);
  const [rw, rh] = onPaper({ ...known, rot: 23 }); near(rw, 11.34, 1e-9); near(rh, 17.22, 1e-9); // Drehung ändert die Grösse nicht
  // Länge in m statt mm eingegeben (10,58 statt 10 583): Massstab 1000-mal zu klein, Modul 1000-mal zu gross
  const [ew] = onPaper({ ...known, mmPerPt: P.scaleFromMeasure([100, 500], [400, 500], 10.5833) }); near(ew / 11.34, 1000, 0.01);
  assert.strictEqual(P.fmtPct(0.125), "+12,5 %"); assert.strictEqual(P.fmtPct(-0.004), "−0,4 %");
  console.log("Modulgrösse mit Massstab ok");
}
// Schritt 5: Strings und SPA
{
  assert.deepStrictEqual(P.parseName("2.1.1"), { wr: 2, mppt: 1, str: 1 });
  assert.deepStrictEqual(P.parseName(" 10.2.12 "), { wr: 10, mppt: 2, str: 12 });
  for (const bad of ["", "2.1", "2.1.1.1", "0.1.1", "2.0.1", "a.b.c", "2,1,1", "2.1.x", "1234.1.1", null]) assert.strictEqual(P.parseName(bad), null, String(bad));
  assert.strictEqual(P.stringColor("2.1.1"), P.stringColor("2.1.1")); // gleiche Bezeichnung = gleiche Farbe
  const first = ["1", "2", "3"].flatMap((w) => ["1", "2"].flatMap((m) => ["1", "2", "3", "4"].map((k) => P.stringColor(`${w}.${m}.${k}`))));
  assert.strictEqual(P.STRING_COLORS.length, 24); assert.strictEqual(new Set(P.STRING_COLORS).size, 24);
  assert.strictEqual(new Set(first).size, 24); // 5ac: 3 WR × 2 MPPT × 4 Strings alle verschieden
  assert.notStrictEqual(P.stringColor("1.1.1"), P.stringColor("2.1.1"));
  const mtT = { id: "t", name: "T", l: 2000, b: 1000 };
  P.setTypeSource(() => [mtT]);
  const sh = { kind: "pv", items: [1, 2, 3].map((id) => ({ id, type: "pvmodule", mt: "t", x: (id - 1) * 1005, y: 0, quer: false })) };
  assert.strictEqual(P.nextName(sh), "1.1.1");
  sh.items.push({ id: 10, type: "pvstring", name: "2.1.1", mods: [1, 2] }, { id: 11, type: "spa", x: 500, y: -800 });
  assert.strictEqual(P.nextName(sh), "2.1.2");
  assert.strictEqual(P.layerOf(sh.items[3]), "kabel"); assert.strictEqual(P.layerOf(sh.items[4]), "kabel");
  assert.strictEqual(P.stringOf(sh, 2).name, "2.1.1"); assert.strictEqual(P.stringOf(sh, 3), undefined);
  assert.match(P.nameError(sh, "2.1.1"), /schon/); assert.strictEqual(P.nameError(sh, "2.1.1", sh.items[3]), null); assert.match(P.nameError(sh, "2.1"), /WR.MPPT.String/);
  assert.deepStrictEqual(P.strPts(sh.items[3], sh.items), [[500, 1000], [1505, 1000]]); // Modulmitten in Klickfolge, erstes = +
  sh.items[1].x += 100; assert.deepStrictEqual(P.strPts(sh.items[3], sh.items)[1], [1605, 1000]); // Linie folgt dem Modul
  P.checkStrings(sh);
  // Schritt 5c: Überfahren mit ⌥ (String 2.1.1 hat Module 1 und 2)
  assert.strictEqual(P.hoverStep(sh, [], 3), "add"); assert.strictEqual(P.hoverStep(sh, [], 1), "other");
  assert.strictEqual(P.hoverStep(sh, [3], 3), "same"); assert.strictEqual(P.hoverStep(sh, [5, 3], 5), "back");
  assert.strictEqual(P.hoverStep(sh, [5, 4, 3], 5), "own");
  assert.throws(() => P.checkStrings({ items: [...sh.items, { id: 12, type: "pvstring", name: "2.1.2", mods: [2] }] }), /zwei Strings/);
  assert.throws(() => P.checkStrings({ items: [...sh.items, { id: 12, type: "pvstring", name: "2.1.1", mods: [3] }] }), /doppelt/);
  assert.throws(() => P.checkStrings({ items: [...sh.items, { id: 12, type: "pvstring", name: "x", mods: [3] }] }), /ungültige Bezeichnung/);
  assert.throws(() => P.checkStrings({ items: [...sh.items, { id: 12, type: "pvstring", name: "2.1.3", mods: [99] }] }), /fehlt/);
  // Modul löschen: verlässt den String, leerer String fällt weg
  const sh2 = JSON.parse(JSON.stringify(sh)); sh2.items = sh2.items.filter((i) => i.id !== 2); P.pruneStrings(sh2);
  assert.deepStrictEqual(sh2.items.find((i) => i.type === "pvstring").mods, [1]);
  sh2.items = sh2.items.filter((i) => i.id !== 1); P.pruneStrings(sh2);
  assert.strictEqual(P.strings(sh2).length, 0);
  // Plan drehen (5az): SPA bleibt, String hat keine eigenen Koordinaten
  const sh3 = { bg: { w: 1, h: 1 }, items: [{ id: 11, type: "spa", x: 1000, y: 0 }, { id: 10, type: "pvstring", name: "1.1.1", mods: [] }] };
  P.rotatePlan(sh3, 90); assert.deepStrictEqual([sh3.items[0].x, sh3.items[0].y], [1000, 0]); assert.deepStrictEqual(Object.keys(sh3.items[1]), ["id", "type", "name", "mods"]);
  // Datei: speichern → laden → speichern unverändert, String auf Schemablatt abgelehnt
  const d7 = newDoc(); const pv7 = newSheet("pv"); pv7.sid = 7; d7.sheets.push(pv7); d7.pv = { moduleTypes: [mtT] };
  pv7.items = JSON.parse(JSON.stringify(sh.items)); d7.nextId = 20;
  const t7 = serializeModel(d7), r7 = parseModel(t7);
  assert.deepStrictEqual(r7.sheets[1].items, pv7.items); assert.strictEqual(serializeModel(r7), t7);
  // Schritt 5k (je Datei, WR einzeln) und 5l (Druckteile am Blatt): Laden behält sie, ungültige fallen weg bzw. Fehler
  const d9 = parseModel(t7); d9.pv.anlage = [{ str: [2, 2] }, { str: [1, 1, 1] }]; d9.sheets[1].hide = ["bg", "head"];
  const r9 = parseModel(serializeModel(d9));
  assert.deepStrictEqual([r9.pv.anlage, r9.sheets[1].hide], [[{ str: [2, 2] }, { str: [1, 1, 1] }], ["bg", "head"]]);
  assert.throws(() => P.cleanAnlage([{ mppt: 0, str: 1 }]), /Anlage/); assert.throws(() => P.cleanAnlage([{ str: [1, 100] }]), /Anlage/);
  assert.deepStrictEqual(P.cleanAnlage([{ mppt: 2, str: 3 }, { str: [] }]), [{ str: [3, 3] }, { str: [] }]); // Fassung vor 5ah umgerechnet, leerer WR (5al) assert.throws(() => P.cleanAnlage({ wr: 2 }), /Anlage/);
  const o9 = JSON.parse(t7); o9.sheets[1].anlage = { wr: 2, mppt: 1, str: 3 }; // erste Fassung am Blatt → Datei
  assert.deepStrictEqual(parseModel(JSON.stringify(o9)).pv.anlage, [{ str: [3] }, { str: [3] }]);
  assert.deepStrictEqual(P.cleanHide(["head", "x", "bg"]), ["bg", "head"]); assert.strictEqual(P.cleanHide([]), undefined);
  assert.deepStrictEqual(P.anlageNames([{ str: [2, 2] }, { str: [1, 1, 1] }]), ["1.1.1", "1.1.2", "1.2.1", "1.2.2", "2.1.1", "2.2.1", "2.3.1"]);
  const sa = { kind: "pv", items: [] }, sb = { kind: "pv", items: [] }, push = (sh, n) => sh.items.push({ type: "pvstring", name: n, mods: [1] });
  P.setDocSource(() => ({ pv: { anlage: [{ str: [2, 2] }, { str: [1, 1, 1] }] }, sheets: [sa, sb] }));
  assert.strictEqual(P.nextName(sa), "1.1.1"); push(sa, "1.1.1"); push(sb, "1.1.2"); // zweiter Plan zählt mit (je Datei)
  assert.strictEqual(P.nextName(sa), "1.2.1"); assert.strictEqual(P.anlageFree().length, 5); assert.deepStrictEqual(P.anlageFree(2), ["2.1.1", "2.2.1", "2.3.1"]);
  for (const n of ["1.2.1", "1.2.2", "2.1.1", "2.2.1", "2.3.1"]) push(sa, n);
  assert.strictEqual(P.nextName(sa), "2.3.2"); assert.strictEqual(P.anlageFree().length, 0); // Anlage voll: weiter wie ohne Vorgabe
  P.setDocSource(() => null);
  console.log("Anlage 5k und Druckteile 5l ok");
  const b7 = JSON.parse(t7); b7.sheets[1].items.push({ id: 13, type: "pvstring", name: "2.1.2", mods: [1] });
  assert.throws(() => parseModel(JSON.stringify(b7)), /zwei Strings/);
  const b8 = JSON.parse(t7); b8.sheets[0].items.push({ id: 14, type: "spa", x: 0, y: 0 });
  assert.throws(() => parseModel(JSON.stringify(b8)), /gehören auf einen Stringplan/);
  console.log("Strings und SPA ok");
}

// ---------- Schritt 6: WR-Datenblatt, Stringübersicht, Spannungsprüfung ----------
{
  // Formel von Hand: Voc 49,5 V, Tk −0,27 %/K, Tmin −20 °C → Faktor 1 + (−0,27/100) × (−20 − 25) = 1 + 0,0027 × 45 = 1,1215
  near(P.vocAt(49.5, -0.27, -20), 49.5 * 1.1215, 1e-12); // 55,51425 V je Modul
  near(18 * P.vocAt(49.5, -0.27, -20), 999.2565, 1e-9); // 49,5 × 18 = 891 V, × 1,1215 = 999,2565 V
  near(19 * P.vocAt(49.5, -0.27, -20), 1054.77075, 1e-9); // 940,5 × 1,1215
  near(P.vocAt(49.5, -0.27, 25), 49.5, 1e-12); // bei 25 °C = STC
  assert.ok(Math.abs(P.vocAt(49.5, -27, -20) - 49.5 * 13.15) < 1e-9); // Tk falsch in 1/100 % eingegeben: Faktor 13,15, darum durch 100
  assert.strictEqual(P.level(999.2565, 1000), "warn"); // ≥ 95 % knapp
  assert.strictEqual(P.level(1054.8, 1000), "bad");
  assert.strictEqual(P.level(949.9, 1000), "ok"); assert.strictEqual(P.level(950, 1000), "warn"); assert.strictEqual(P.level(1000, 1000), "warn");
  assert.strictEqual(P.fmtNum(999.2565), "999,3"); assert.strictEqual(P.fmtNum(-20), "−20");
  // WR-Typ aus dem Formular, Pflicht Name und Vmax, Anzahl MPPT ganzzahlig
  const w1 = P.typeFromForm(["WR A", "1000", "160", "850", "16", "", "180", "2"], "w1", true).type;
  assert.deepStrictEqual(w1, { id: "w1", name: "WR A", vmax: 1000, vmppMin: 160, vmppMax: 850, iscMax: 16, vstart: 180, mppt: 2 });
  // 5au: altes Feld imax wird als Isc max übernommen (Datei, Katalog), neues Feld hat Vorrang
  assert.deepStrictEqual(P.cleanInvType({ id: "w0", name: "Alt", vmax: 1000, imax: 16 }), { id: "w0", name: "Alt", vmax: 1000, iscMax: 16 });
  assert.deepStrictEqual(P.cleanInvType({ id: "w0", name: "Alt", vmax: 1000, imax: 16, iscMax: 20, imppMax: 15 }), { id: "w0", name: "Alt", vmax: 1000, iscMax: 20, imppMax: 15 });
  assert.deepStrictEqual(P.parseCatalog(JSON.stringify({ format: "schemacad-katalog", invTypes: [{ name: "K", vmax: 800, imax: 12 }] }), "invTypes").map(({ id: _, ...t }) => t), [{ name: "K", vmax: 800, iscMax: 12 }]);
  assert.match(P.typeFromForm(["WR B", ""], "w2", true).error, /Vmax/);
  assert.match(P.typeFromForm(["WR B", "1000", "", "", "", "", "", "1,5"], "w2", true).error, /MPPT/);
  assert.deepStrictEqual(P.typeFromForm(["WR B", "600"], "w2", true).type, { id: "w2", name: "WR B", vmax: 600 });
  // Modultyp mit Systemspannung (neues Feld am Ende)
  const mA = P.typeFromForm(["Test 49,5", "1700", "1000", "", "", "49,5", "10", "", "", "−0,27", "1000"], "mA").type;
  assert.deepStrictEqual(mA, { id: "mA", name: "Test 49,5", l: 1700, b: 1000, voc: 49.5, isc: 10, tkVoc: -0.27, vsys: 1000 });
  // Zwei Stringpläne: 1.1.1 mit 18 Modulen (knapp), 1.1.2 mit 19 (über), 1.2.1 mit 10 auf Plan 2, 2.1.1 ohne WR-Datenblatt
  const doc = newDoc(), mk = (sh, n, id0) => { for (let i = 0; i < n; i++) sh.items.push({ id: id0 + i, type: "pvmodule", mt: "mA", x: i * 1005, y: 0, quer: false }); return Array.from({ length: n }, (_, i) => id0 + i); };
  const s1 = newSheet("pv"), s2 = newSheet("pv"); s1.sid = 2; s2.sid = 3; s1.meta.BLATT = "1"; s2.meta.BLATT = "2"; doc.sheets.push(s1, s2);
  s1.items.push({ id: 900, type: "pvstring", name: "1.1.2", mods: mk(s1, 19, 100) }, { id: 901, type: "pvstring", name: "1.1.1", mods: mk(s1, 18, 200) });
  s2.items.push({ id: 902, type: "pvstring", name: "1.2.1", mods: mk(s2, 10, 300) }, { id: 903, type: "pvstring", name: "2.1.1", mods: mk(s2, 2, 400) });
  doc.pv = { moduleTypes: [mA], invTypes: [w1], wr: { 1: "w1" } };
  let rep = P.stringReport(doc);
  assert.deepStrictEqual(rep.map((r) => r.name), ["1.1.1", "1.1.2", "1.2.1", "2.1.1"]); // sortiert nach WR, MPPT, String
  assert.ok(rep.every((r) => r.vt === null) && rep[2].notes.some((n) => n.t === "Tmin fehlt") && rep[2].lvl === "info"); // ohne Tmin keine Spannungsprüfung (Strom wird trotzdem geprüft)
  near(rep[0].voc, 891, 1e-9);
  doc.pv.tmin = -20; rep = P.stringReport(doc);
  near(rep[0].vt, 999.2565, 1e-9); near(rep[1].vt, 1054.77075, 1e-9);
  assert.ok(rep[0].notes.some((n) => n.t === "Knapp: 99,9 % von Vmax" && n.lvl === "warn")); // 999,3 V ≥ 950 V
  assert.strictEqual(rep[0].lvl, "bad"); // Gesamturteil = schlechtester Hinweis (hier der Strom, unten)
  assert.strictEqual(rep[1].lvl, "bad"); assert.ok(rep[1].notes.some((n) => n.t === "Über Vmax 1000 V"));
  assert.ok(rep[1].notes.some((n) => n.t === "Über Systemspannung 1000 V"));
  // Strom: 1.1.1 und 1.1.2 parallel an WR 1 MPPT 1, Summe Isc 20 A > Imax 16 A; 1.2.1 allein 10 A ok
  assert.ok(rep[0].notes.some((n) => n.t === "Über Isc max: Isc × 1,25 von 2 Strings 25 A, max 16 A" && n.lvl === "bad")); // 5ak: 2 × 10 A × 1,25
  near(rep[2].isc, 12.5, 1e-12); // 1.2.1 allein 12,5 A < 16 A
  assert.ok(!rep[2].notes.some((n) => /Isc max|Impp/.test(n.t)));
  assert.strictEqual(rep[2].lvl, "ok"); assert.strictEqual(rep[2].si, 2); // 10 × 55,51 = 555,1 V
  assert.ok(rep[3].notes.some((n) => n.t === "WR 2 ohne Datenblatt") && rep[3].lvl === "info");
  assert.deepStrictEqual(P.wrNumbers(doc), [1, 2]);
  // MPPT, den der WR nicht hat; Bezeichnung doppelt auf zwei Plänen
  s2.items.find((i) => i.id === 902).name = "1.3.1"; s2.items.find((i) => i.id === 903).name = "1.1.1"; rep = P.stringReport(doc);
  assert.ok(rep.find((r) => r.name === "1.3.1").notes.some((n) => n.t === "MPPT 3 gibt es nicht (2 MPPT)" && n.lvl === "bad"));
  assert.ok(rep.filter((r) => r.name === "1.1.1")[1].notes.some((n) => n.t === "Bezeichnung auch auf Stringplan 1"));
  // 5am: kein „knapp“ beim Strom (Imax 26 A, 25 A = 96 %) und bei der Systemspannung (999,3 V von 1000 V), nur bei Vmax
  doc.pv.invTypes = [{ ...w1, iscMax: 26 }]; s2.items.find((i) => i.id === 903).name = "2.1.1"; rep = P.stringReport(doc);
  assert.ok(!rep[0].notes.some((n) => /Isc max|Strom|Impp/.test(n.t)) && !rep[0].notes.some((n) => /Systemspannung/.test(n.t)));
  assert.strictEqual(rep[0].lvl, "warn"); assert.ok(rep[0].notes.some((n) => n.t === "Knapp: 99,9 % von Vmax"));
  assert.strictEqual(P.level(25, 26, false), "ok"); assert.strictEqual(P.level(26.1, 26, false), "bad");
  doc.pv.invTypes = [{ ...w1, iscMax: 24 }]; rep = P.stringReport(doc); // 5ak: 25 A über 24 A (ohne Zuschlag wären es 20 A)
  assert.ok(rep[0].notes.some((n) => n.t.startsWith("Über Isc max") && n.lvl === "bad"));
  doc.pv.tmin = undefined; rep = P.stringReport(doc); assert.ok(rep[0].notes.some((n) => n.t.startsWith("Über Isc max")), "Strom auch ohne Tmin"); doc.pv.tmin = -20;
  // Fehlende Angaben: Tk, Systemspannung, Imax
  doc.pv.moduleTypes = [{ id: "mA", name: "ohne", l: 1, b: 1, voc: 49.5, isc: 10 }]; doc.pv.invTypes = [{ id: "w1", name: "W", vmax: 1000 }]; rep = P.stringReport(doc);
  assert.ok(rep[0].notes.some((n) => n.t === "Tk Voc fehlt im Modultyp") && rep[0].notes.some((n) => n.t === "Isc max fehlt im WR-Typ, Strom nicht geprüft"));
  doc.pv.moduleTypes = [mA];
  // 5au Impp ohne Faktor gegen Impp max: 1.1.1 + 1.1.2 je 9,5 A = 19 A; über 18 A = Warnung, 19 A = ok; Isc bleibt Fehler
  doc.pv.moduleTypes = [{ ...mA, impp: 9.5 }]; doc.pv.invTypes = [{ ...w1, iscMax: 30, imppMax: 18 }]; rep = P.stringReport(doc);
  assert.ok(rep[0].notes.some((n) => n.t === "Ertragseinbusse möglich: Impp 19 A, Impp max 18 A" && n.lvl === "warn") && !rep[0].notes.some((n) => /Isc max/.test(n.t)));
  assert.ok(!rep[2].notes.some((n) => /Impp/.test(n.t)), "1.2.1 allein 9,5 A ok");
  doc.pv.invTypes = [{ ...w1, iscMax: 30, imppMax: 19 }]; rep = P.stringReport(doc); assert.ok(!rep[0].notes.some((n) => /Impp/.test(n.t)), "gleich = ok");
  doc.pv.invTypes = [{ ...w1, iscMax: 24, imppMax: 18 }]; rep = P.stringReport(doc);
  assert.ok(rep[0].notes.some((n) => n.lvl === "bad" && n.t.startsWith("Über Isc max")) && rep[0].notes.some((n) => n.lvl === "warn" && n.t.startsWith("Ertragseinbusse")));
  doc.pv.moduleTypes = [mA]; rep = P.stringReport(doc); assert.ok(rep[0].notes.some((n) => n.t === "Impp fehlt im Modultyp, Impp nicht geprüft" && n.lvl === "info"));
  doc.pv.invTypes = [w1]; rep = P.stringReport(doc); assert.ok(!rep[0].notes.some((n) => /Impp/.test(n.t)), "ohne Impp max keine Impp-Prüfung");
  // Tabelle: eine Zeile je String, Urteil als Klasse
  const svg = T.tableSVG(doc);
  assert.strictEqual((svg.match(/class="pvtab-row"/g) || []).length, 4);
  assert.ok(svg.includes('data-name="1.1.2" data-lvl="bad"') && svg.includes("1054,8 V") && svg.includes("999,3 V") && svg.includes("Tmin −20 °C"));
  assert.ok(T.tableSVG(newDoc()).includes("Noch keine Strings"));
  // Datei: Stringübersicht, WR-Katalog, Zuordnung und Tmin speichern → laden → speichern gleich
  doc.pv = { moduleTypes: [mA], invTypes: [w1], wr: { 1: "w1" }, tmin: -20 };
  const tab = newSheet("pvtab"); tab.meta.BLATT = "1"; doc.sheets.push(tab); doc.nextId = 1000;
  const t = serializeModel(doc), r = parseModel(t);
  assert.strictEqual(JSON.parse(t).version, 6); assert.strictEqual(r.sheets[3].kind, "pvtab"); assert.deepStrictEqual(r.pv, doc.pv);
  assert.strictEqual(serializeModel(r), t);
  const onlyTab = newDoc(); onlyTab.sheets.push(newSheet("pvtab")); assert.strictEqual(JSON.parse(serializeModel(onlyTab)).version, 6);
  const bad = JSON.parse(t); bad.pv.wr = { 1: "w9" };
  assert.throws(() => parseModel(JSON.stringify(bad)), /WR-Typ, der im Katalog fehlt/);
  const bad2 = JSON.parse(t); bad2.sheets[3].items.push({ id: 5, type: "text", x: 0, y: 0, s: "x" });
  assert.throws(() => parseModel(JSON.stringify(bad2)), /keine eigenen Objekte/);
  // Nur WR-Daten ohne Modultypen bleiben erhalten; tidyPv ordnet die Felder fest
  assert.deepStrictEqual(P.cleanPvDoc({ invTypes: [w1], tmin: -15 }), { invTypes: [w1], tmin: -15 });
  assert.deepStrictEqual(Object.keys(P.tidyPv({ tmin: 1, wr: { 10: "w1", 2: "w1" }, invTypes: [w1], moduleTypes: [mA] })), ["moduleTypes", "invTypes", "wr", "tmin"]);
  assert.deepStrictEqual(Object.keys(P.tidyPv({ wr: { 10: "w1", 2: "w1" } }).wr), ["2", "10"]);
  assert.strictEqual(P.tidyPv({ moduleTypes: [], wr: {} }), undefined);
  // WR-Katalog: sichern ohne ids, laden
  const wc = P.catalogText([w1], "invTypes");
  assert.ok(!wc.includes('"id"') && wc.includes('"invTypes"'));
  assert.deepStrictEqual(P.parseCatalog(wc, "invTypes").map(({ id: _, ...x }) => x), [w1].map(({ id: _, ...x }) => x));
  assert.throws(() => P.parseCatalog(P.catalogText([mA]), "invTypes"), /mit Wechselrichtern/);
  console.log("Stringübersicht und Spannungsprüfung ok");
}

// ---------- Schritt 7: Papier, Druckmassstab, Plankopf ----------
{
  // Massstab: 1:100 → 18 m = 180 mm auf dem Papier, 1:200 → 90 mm
  near(P.toPaper(18000, 100), 180); near(P.toPaper(18000, 200), 90);
  // Papier und Ausrichtung
  assert.deepStrictEqual(P.paperOf({}), { size: "A3", quer: true, den: 100 });
  assert.deepStrictEqual(P.paperSize({ size: "A4", quer: true }), [297, 210]);
  assert.deepStrictEqual(P.paperSize({ size: "A4", quer: false }), [210, 297]);
  assert.deepStrictEqual(P.paperSize({ size: "A2", quer: true }), [594, 420]);
  assert.strictEqual(P.paperLabel({ size: "A2", quer: false }), "A2 hoch");
  // Planfeld A3 quer: 10 mm Rand, Plankopf 15 mm, Infozeile 5 mm → 400 × 257 mm, bei 1:100 also 40 × 25,7 m
  const a = P.printArea({ size: "A3", quer: true });
  assert.deepStrictEqual([a.x0, a.y0, a.x1, a.y1, a.k], [10, 30, 410, 287, 1]);
  // A4 hoch: Plankopf (277 mm) auf 190 mm verkleinert
  const a4 = P.printArea({ size: "A4", quer: false });
  near(a4.k, 190 / 277); near(a4.y0, 10 + 15 * 190 / 277 + 5);
  // Passender Massstab: Dach 18 × 9 m auf A3 quer passt bei 1:100, 60 m braucht 1:150 (60 m / 400 mm), auf A4 hoch 1:100 (18 m / 190 mm = 1:94,7)
  assert.strictEqual(P.fitDen({ x0: 0, y0: 0, x1: 18000, y1: 9000 }, { size: "A3", quer: true }), 50);
  assert.strictEqual(P.fitDen({ x0: 0, y0: 0, x1: 60000, y1: 9000 }, { size: "A3", quer: true }), 150);
  assert.strictEqual(P.fitDen({ x0: 0, y0: 0, x1: 18000, y1: 9000 }, { size: "A4", quer: false }), 100);
  // Prüfen beim Laden: ungültige Werte werden ersetzt, fehlt = kein Feld
  assert.strictEqual(P.cleanPaper(undefined), undefined);
  assert.deepStrictEqual(P.cleanPaper({ size: "A0", quer: false, den: -5 }), { size: "A3", quer: false, den: 100 });
  assert.deepStrictEqual(P.cleanPaper({ size: "A2", den: 250 }), { size: "A2", quer: true, den: 250 });
  // Datei: Papier und Plankopf speichern → laden → speichern gleich, alte Datei ohne paper bleibt ohne
  const doc = newDoc(), sh = newSheet("pv"); sh.sid = 3;
  Object.assign(sh.meta, { OBJEKT: "EFH Muster", TITEL: "Stringplan Dach Süd", AUFTRAG: "A-77", SCHEMA: "PV", BLATT: "2", INDEX: "B", GEZEICHNET: "CJ" });
  sh.paper = { size: "A2", quer: false, den: 50 };
  doc.sheets.push(sh); doc.nextId = 10;
  const t = serializeModel(doc), r = parseModel(t);
  assert.deepStrictEqual(r.sheets[1].paper, sh.paper); assert.deepStrictEqual(r.sheets[1].meta, sh.meta);
  assert.strictEqual(serializeModel(r), t);
  const old = JSON.parse(t); delete old.sheets[1].paper;
  const r2 = parseModel(JSON.stringify(old));
  assert.strictEqual(r2.sheets[1].paper, undefined); assert.ok(!serializeModel(r2).includes('"paper"'));
  // Stringübersicht über mehrere Seiten: 40 Strings passen nicht auf eine A4-Seite
  const mt = { id: "m1", name: "T", l: 1700, b: 1000, voc: 40, isc: 10, tkVoc: -0.3, vsys: 1000 };
  const big = newDoc(); big.pv = { moduleTypes: [mt], tmin: -10 };
  const pvs = newSheet("pv"); pvs.sid = 1; big.sheets.push(pvs);
  for (let i = 0; i < 40; i++) { pvs.items.push({ id: 100 + i, type: "pvmodule", mt: "m1", x: i * 1005, y: 0, quer: false }); pvs.items.push({ id: 200 + i, type: "pvstring", name: `1.1.${i + 1}`, mods: [100 + i] }); }
  const pages = T.tablePages(big, 168), count = (x) => (x.match(/class="pvtab-row"/g) || []).length;
  assert.ok(pages.length >= 2, "mehrere Seiten");
  assert.strictEqual(pages.reduce((n, x) => n + count(x), 0), 40); // jede Zeile genau einmal
  assert.ok(pages.every((x) => x.includes("Stringübersicht") && x.includes("Prüfhinweis"))); // Titel und Kopfzeile auf jeder Seite
  assert.ok(pages.at(-1).includes("keine Freigabe") && !pages[0].includes("keine Freigabe")); // Hinweis nur auf der letzten
  assert.ok(T.tableHeight(big) > 168);
  assert.strictEqual(T.tablePages(newDoc(), 168).length, 1); assert.ok(T.tablePages(newDoc(), 168)[0].includes("Noch keine Strings"));
  assert.strictEqual(T.tableSVG(big), T.tablePages(big, 1e6)[0]); // Bildschirm = eine Seite ohne Grenze
  console.log("Papier, Druckmassstab, Plankopf ok");
}
{ // Schritt 5m/5n: Verkabelung löschen, Auswahl nur aktive Ebene
  const a = newSheet("pv"), b = newSheet("pv"), sch = newSheet("schema");
  a.items = [{ id: 1, type: "pvmodule" }, { id: 2, type: "pvstring", name: "1.1.1", mods: [1] }, { id: 3, type: "pvstring", name: "1.1.2", mods: [1] }, { id: 4, type: "spa", x: 0, y: 0 }, { id: 5, type: "roofline", pts: [], layer: "bg" }];
  b.items = [{ id: 6, type: "pvstring", name: "2.1.1", mods: [] }];
  const ids = (l) => l.map((x) => x.st.id);
  assert.deepStrictEqual(ids(P.stringsToClear([a, b, sch], new Set())), [2, 3, 6]); // ohne Markierung: alle der Datei
  assert.deepStrictEqual(ids(P.stringsToClear([a, b], new Set([3]))), [3]); // nur markierte
  P.toggleLayer(b, "kabel", "lock");
  assert.deepStrictEqual(ids(P.stringsToClear([a, b], new Set())), [2, 3]); // gesperrte Verkabelung bleibt
  P.clearStrings(P.stringsToClear([a], new Set([2])));
  assert.deepStrictEqual(a.items.map((i) => i.id), [1, 3, 4, 5]); // SPA und Module bleiben
  assert.deepStrictEqual(P.layerPick(a, "kabel").map((i) => i.id), [3, 4]);
  assert.deepStrictEqual(P.layerPick(a, "module").map((i) => i.id), [1]);
  assert.deepStrictEqual(P.layerPick(a, "bg").map((i) => i.id), [5]); // Hintergrund: eigene Linien wählbar (5v, vorher nichts)
  P.toggleLayer(a, "module", "show");
  assert.deepStrictEqual(P.layerPick(a, "module"), []); // ausgeblendet: nicht wählbar
  console.log("Verkabelung löschen, Auswahl aktive Ebene ok");
}
{ // Gruppe A (5q, 5r, 5s/5v/5w, 5aj)
  // 5r: Shift auch 45°, waagrecht und senkrecht wie bisher
  assert.deepStrictEqual(P.orthoDir(10, 1), [1, 0]); assert.deepStrictEqual(P.orthoDir(-1, -10), [0, -1]);
  assert.deepStrictEqual(P.orthoDir(10, 9), [Math.SQRT1_2, Math.SQRT1_2]); assert.deepStrictEqual(P.orthoDir(-10, 8), [-Math.SQRT1_2, Math.SQRT1_2]);
  const em = newSheet("pv"), d = P.snapPv(em, { x: 1000, y: 900 }, { tol: 80, ortho: [0, 0] });
  assert.ok(Math.abs(d.x - 950) < 1e-9 && Math.abs(d.y - 950) < 1e-9); // auf die 45°-Achse projiziert
  const dg = P.snapPv(em, { x: 1000, y: 900 }, { grid: 100, tol: 80, ortho: [0, 0] });
  assert.ok(Math.abs(dg.x - dg.y) < 1e-9 && dg.snap === "grid"); // Rasterpunkt auf der Achse
  const r = newSheet("pv"); r.items = [{ id: 1, type: "roofline", pts: [[0, 1000], [3000, 1000]] }];
  const de = P.snapPv(r, { x: 1010, y: 990 }, { tol: 80, ortho: [0, 0] });
  assert.ok(Math.abs(de.x - 1000) < 0.01 && Math.abs(de.y - 1000) < 0.01 && de.snap === "edge"); // Kante schneidet die 45°-Achse
  assert.deepStrictEqual(P.snapPv(em, { x: 600, y: 900 }, { grid: 100, alt: true, ortho: [500, 0] }), { x: 500, y: 900 }); // Alt + Shift senkrecht ohne Fang
  // 5s/5w: andere Ebenen für die Meldung
  const s = newSheet("pv"); s.items = [{ id: 1, type: "pvmodule" }, { id: 2, type: "spa", x: 0, y: 0 }, { id: 3, type: "text", layer: "bg" }];
  assert.deepStrictEqual(P.otherLayers(s, "kabel").map((i) => i.id), [1, 3]);
  P.toggleLayer(s, "module", "show");
  assert.deepStrictEqual(P.otherLayers(s, "kabel").map((i) => i.id), [3]); // ausgeblendet: keine Meldung
  // 5q: aktive Ebene in der Datei, Speichern → Laden → Speichern gleich, Dach fehlt
  const doc = newDoc(); doc.sheets = [newSheet("pv")]; doc.pvLayer = "kabel";
  const t = serializeModel(doc), back = parseModel(t);
  const t2 = serializeModel(back); assert.strictEqual(back.pvLayer, "kabel"); assert.strictEqual(serializeModel(parseModel(t2)), t2);
  assert.strictEqual(parseModel(t.replace('"kabel"', '"xyz"')).pvLayer, undefined); // ungültig: Vorgabe Dach
  doc.pvLayer = "dach"; assert.strictEqual(parseModel(serializeModel(doc)).pvLayer, undefined);
  // 5aj: ohne Markierung nur der offene Plan (Aufruf mit [S.model])
  const a = newSheet("pv"), b = newSheet("pv");
  a.items = [{ id: 1, type: "pvstring", name: "1.1.1", mods: [] }]; b.items = [{ id: 2, type: "pvstring", name: "1.1.2", mods: [] }];
  assert.deepStrictEqual(P.stringsToClear([a], new Set()).map((x) => x.st.id), [1]);
  console.log("Gruppe A (aktive Ebene, 45°, Ebenen, Löschen) ok");
}
{ // Gruppe B (5p, 5t, 5u, 5x, 5y, 5z, 5aa, 5ab); 5p, 5u, 5z, 5ab auch oben
  // 5t: offene Dachlinie ab 3 Punkten füllbar, wird dabei geschlossen; „keine“ lässt sie geschlossen
  const ro = { type: "roofline", pts: [[0, 0], [1000, 0], [1000, 1000]], closed: false };
  assert.ok(P.canFill(ro) && !P.fillable(ro) && !P.canFill({ ...ro, pts: [[0, 0], [1, 0]] }) && !P.canFill({ type: "keepout", pts: ro.pts }));
  P.setFill(ro, "ziegel-rot"); assert.deepStrictEqual([ro.closed, ro.fill], [true, "ziegel-rot"]);
  assert.strictEqual(P.cleanPvItem(ro, 1).fill, "ziegel-rot"); // gespeichert geschlossen mit Füllung
  ro.fdir = 90; P.setFill(ro, ""); assert.ok(ro.closed && !("fill" in ro) && !("fdir" in ro));
  // 5y: Abstände quer und längs zum Modul → waagrecht/senkrecht je Lage
  assert.deepStrictEqual(P.gapsXY(false, 20, 5), [20, 5]); assert.deepStrictEqual(P.gapsXY(true, 20, 5), [5, 20]);
  // 5x: Bezugsecke reihum mit Tab (Shift+Tab rückwärts)
  assert.deepStrictEqual(P.nextCorner(["l", "b"]), ["r", "b"]); assert.deepStrictEqual(P.nextCorner(["l", "t"]), ["l", "b"]);
  assert.deepStrictEqual(P.nextCorner(["l", "b"], -1), ["l", "t"]); assert.strictEqual(P.cornerName(P.nextCorner(["r", "b"])), "oben rechts");
  const sz = [1000, 1700], f0 = P.fieldAt({ x: 0, y: 0 }, 2, 2, sz, 10, 5);
  assert.deepStrictEqual(f0.map((q) => [q.x, q.y]), [[0, 0], [1010, 0], [0, 1705], [1010, 1705]]); // wie bisher: unten links
  const ft = P.fieldAt({ x: 0, y: 0 }, 2, 2, sz, 10, 5, ["l", "t"]);
  assert.deepStrictEqual(ft.map((q) => [q.x, q.y]), [[0, -3405], [1010, -3405], [0, -1700], [1010, -1700]]); // von oben: Feld hängt unter dem Punkt
  const fr = P.fieldAt({ x: 0, y: 0 }, 1, 1, sz, 0, 0, ["r", "t"]); assert.deepStrictEqual([fr[0].x, fr[0].y], [-1000, -1700]);
  // 5aa: fieldAt kann ein gedrehtes Feld (rot am Modul); der Editor nutzt es seit 5az nicht mehr
  const fd = P.fieldAt({ x: 100, y: 200 }, 2, 1, sz, 10, 5, ["l", "b"], 30);
  assert.strictEqual(fd[0].rot, 30); assert.deepStrictEqual([fd[0].x, fd[0].y], [100, 200]);
  const [ex, ey] = P.rotPt(1010, 0, 30); near(fd[1].x, 100 + ex, 1e-3); near(fd[1].y, 200 + ey, 1e-3);
  assert.ok(!("rot" in f0[0]));
  // 5ab: gedrehte Module in Version 6, Rundreise gleich
  const d = newDoc(), sh = newSheet("pv"); sh.sid = 9; d.sheets.push(sh); d.pv = { moduleTypes: [{ id: "m1", name: "T", l: 1700, b: 1000 }] };
  sh.items.push({ id: 5, type: "pvmodule", mt: "m1", x: 100, y: 200, quer: false, rot: 30 }); d.nextId = 10;
  const t = serializeModel(d); assert.strictEqual(JSON.parse(t).version, 6); assert.strictEqual(parseModel(t).sheets[1].items[0].rot, 30); assert.strictEqual(serializeModel(parseModel(t)), t);
  console.log("Gruppe B (Plantausch, Füllen, Schraffur, Bezugspunkt, Abstände, Berühren, Drehung, Version 6) ok");
}

// ---------- Gruppe C (5ac, 5ad, 5ae, 5ag, 5ah, 5ak, 5al, 5am; 5ac/5ak/5am oben bei Strings und Stringübersicht) ----------
{
  // 5ad: Bezeichnung für die ganze Datei eindeutig
  const sa = { kind: "pv", meta: { BLATT: "1" }, items: [] }, sb = { kind: "pv", meta: { BLATT: "2" }, items: [] };
  sb.items.push({ id: 1, type: "pvstring", name: "1.1.1", mods: [9] });
  P.setDocSource(() => ({ sheets: [sa, sb] }));
  assert.match(P.nameError(sa, "1.1.1"), /schon auf Stringplan 2/); assert.strictEqual(P.nameError(sb, "1.1.1", sb.items[0]), null);
  assert.strictEqual(P.nextName(sa), "1.1.2", "Vorschlag überspringt Bezeichnungen anderer Pläne");
  // 5ag/5ah: Anlage mit verschiedenen Strings je MPPT, Autoverkabelung nimmt die freien Bezeichnungen dieses WR der Reihe nach
  P.setDocSource(() => ({ pv: { anlage: [{ str: [3, 1] }, { str: [] }] }, sheets: [sa, sb] }));
  assert.deepStrictEqual(P.anlageFree(1), ["1.1.2", "1.1.3", "1.2.1"]); assert.deepStrictEqual(P.anlageFree(2), [], "leerer WR (5al)");
  assert.deepStrictEqual(P.anlageNames([{ str: [0, 2] }]), ["1.2.1", "1.2.2"], "MPPT mit 0 Strings übersprungen");
  P.setDocSource(() => null);
  assert.strictEqual(P.nameError(sa, "1.1.1"), null, "ohne Dokument nur der Plan");
  // 5ae: Stringnummer 1,2 × (300 statt 250 mm, Druck 1:100 = 3 mm)
  assert.strictEqual(P.PV_NAME_H / P.PV_TEXT_H, 1.2);
  // 5ak: Faktor 1,25
  assert.strictEqual(P.ISC_FACTOR, 1.25);
  console.log("Gruppe C (Farben, Bezeichnung je Datei, Anlage je MPPT, Strom × 1,25, knapp nur Vmax) ok");
}

// ---------- Gruppe D (5ai, 5an, 5ao, 5ap, 5aq) ----------
{
  // 5ai: Druckteile gelten auch am Bildschirm (sichtbar = Auge und Druckteil)
  const sh = newSheet("pv"), mod = { id: 1, type: "pvmodule" }, st = { id: 2, type: "pvstring", name: "1.1.1", mods: [1] }, ko = { id: 3, type: "keepout", pts: [] };
  const roof = { id: 4, type: "roofline", pts: [[0, 0], [1, 0], [1, 1]], closed: true, fill: "ziegel-rot" }, tx = { id: 5, type: "text", x: 0, y: 0, s: "a" };
  sh.items = [mod, st, ko, roof, tx];
  const vis = () => sh.items.filter((it) => P.visible(sh, it)).map((it) => it.id);
  assert.deepStrictEqual(vis(), [1, 2, 3, 4, 5]);
  sh.hide = ["mod", "keepout", "text"]; assert.deepStrictEqual(vis(), [2, 4], "Module, Sperrflächen, Texte weg");
  assert.deepStrictEqual(P.layerPick(sh, "module"), [], "ausgeblendetes Modul nicht wählbar");
  sh.hide = ["roof"]; assert.ok(P.visible(sh, roof), "Dachlinie aus, Füllung an: Fläche bleibt");
  sh.hide = ["roof", "fill"]; assert.ok(!P.visible(sh, roof));
  sh.hide = ["str", "name"]; assert.ok(P.visible(sh, st)); sh.hide = ["str", "name", "pm"]; assert.ok(!P.visible(sh, st), "String ganz weg erst ohne Linie, Bezeichnung, + und −");
  sh.hide = ["head", "north", "bar"]; assert.deepStrictEqual(vis(), [1, 2, 3, 4, 5], "nur-Druck-Teile ändern den Bildschirm nicht");
  P.toggleLayer(sh, "module", "show"); sh.hide = undefined; assert.ok(!P.visible(sh, mod), "Auge gilt weiter");
  console.log("5ai Druckteile am Bildschirm ok");

  // 5ao: Druckmitte gespeichert, Rundreise gleich. Seit 5az bleibt sie beim Drehen wie die Module
  const d = newDoc(), pv = newSheet("pv"); pv.sid = 3; pv.bg = { w: 100, h: 100 }; pv.pmid = [1000, 0]; pv.north = 30; pv.hide = ["north"]; d.sheets.push(pv); d.nextId = 5;
  P.rotatePlan(pv, 90); assert.deepStrictEqual(pv.pmid, [1000, 0]);
  // 5aq: Nordpfeil dreht mit dem Plan (Plan +90° = im Gegenuhrzeigersinn → Pfeil 30 − 90 = 300°)
  assert.strictEqual(P.northOnPaper(pv), 300); assert.strictEqual(P.northOnPaper(newSheet("pv")), null, "ohne Nordrichtung kein Pfeil");
  assert.strictEqual(P.normNorth(-30), 330); assert.strictEqual(P.normNorth(360), 0);
  assert.strictEqual(P.barLen(100), 5000, "1:100: 5 m = 50 mm"); assert.strictEqual(P.barLen(200), 10000); assert.strictEqual(P.barLen(50), 2000);
  // Datei: pmid, north, Papier der Stringübersicht
  const tab = newSheet("pvtab"); tab.paper = { size: "A3", quer: false }; d.sheets.push(tab);
  const t = serializeModel(d), r = parseModel(t);
  assert.deepStrictEqual(r.sheets[1].pmid, pv.pmid); assert.strictEqual(r.sheets[1].north, 30); assert.deepStrictEqual(r.sheets[2].paper, { size: "A3", quer: false });
  const t2 = serializeModel(r); assert.strictEqual(serializeModel(parseModel(t2)), t2, "Speichern → Laden → Speichern gleich");
  const bad = JSON.parse(t); bad.sheets[1].pmid = [1, "x"]; bad.sheets[1].north = "Nord"; bad.sheets[2].paper = { size: "B5", quer: true, den: 5 };
  const rb = parseModel(JSON.stringify(bad)); assert.ok(!("pmid" in rb.sheets[1]) && !("north" in rb.sheets[1])); assert.deepStrictEqual(rb.sheets[2].paper, { size: "A3", quer: true }, "ungültige Werte: Vorgabe, Massstab immer 1:1");
  // Druckseite: Nordpfeil abgewählt, Massstabsleiste da; mit Pfeil gedreht
  const page = (H) => PR.planPageSVG(pv, "", { x: 0, y: 0 }, "c", new Set(H));
  assert.ok(!page(["north"]).includes("pv-north") && page(["north"]).includes('data-len="5000"'));
  assert.ok(page([]).includes('data-dir="300"') && !page(["bar", "north"]).includes("pv-legend"));
  pv.meta.OBJEKT = "EFH Nord"; assert.ok(!page(["head"]).includes("EFH Nord") && page([]).includes("EFH Nord") && page([]).includes("Stringplan · Massstab 1:100"));
  console.log("5ao Druckmitte, 5aq Nordpfeil und Massstabsleiste ok");

  // 5an/5ap: Stringübersicht mit Rahmen und Plankopf auch am Bildschirm, Papier wählbar
  const mt = { id: "m1", name: "T", l: 1700, b: 1000, voc: 40, isc: 10, tkVoc: -0.3, vsys: 1000 };
  const big = newDoc(); big.pv = { moduleTypes: [mt], tmin: -10 };
  const ps = newSheet("pv"); ps.sid = 1; big.sheets.push(ps);
  for (let i = 0; i < 40; i++) { ps.items.push({ id: 100 + i, type: "pvmodule", mt: "m1", x: i * 1005, y: 0, quer: false }); ps.items.push({ id: 200 + i, type: "pvstring", name: `1.1.${i + 1}`, mods: [100 + i] }); }
  const ts = newSheet("pvtab"); ts.meta.OBJEKT = "EFH Sonne"; big.sheets.push(ts);
  const rows = (x) => (x.match(/class="pvtab-row"/g) || []).length, scr = () => PR.tableScreenSVG(ts, big);
  const nA4 = PR.tablePagesSVG(ts, big).length;
  assert.strictEqual(rows(scr()), 40); assert.strictEqual((scr().match(/class="pvtab-page"/g) || []).length, nA4, "Bildschirm = Druckseiten");
  assert.ok(scr().includes("EFH Sonne") && scr().includes('class="paper"'), "Rahmen und Plankopf am Bildschirm");
  ts.paper = { size: "A3", quer: true }; const nA3 = PR.tablePagesSVG(ts, big).length;
  assert.ok(nA3 < nA4, "A3 quer: weniger Seiten"); assert.ok(PR.tablePagesSVG(ts, big)[0].includes('viewBox="0 0 420 297"'));
  ts.paper = { size: "A4", quer: false }; const hoch = PR.tablePagesSVG(ts, big);
  assert.ok(hoch[0].includes('viewBox="0 0 210 297"') && /scale\(0\.68/.test(hoch[0]), "A4 hoch: Tabelle verkleinert (190/277)");
  assert.strictEqual(hoch.reduce((n, x) => n + rows(x), 0), 40, "jede Zeile einmal");
  const b = PR.tableScreenBounds(ts, big); assert.strictEqual(b.x1, 220); near(b.y0, -(hoch.length * 297 + (hoch.length - 1) * 20) - 10);
  console.log("5an Stringübersicht mit Rahmen und Plankopf, 5ap Papier ok");
}
{ // 5as/5aw: WR neu nummerieren (löschen, verschieben), Strings aller Pläne, Zuordnung und Anlage ziehen mit
  const doc = newDoc(), a = newSheet("pv"), b = newSheet("pv"); a.sid = 1; b.sid = 2; doc.sheets.push(a, b);
  a.items.push({ id: 1, type: "pvstring", name: "1.1.1", mods: [] }, { id: 2, type: "pvstring", name: "2.1.1", mods: [] }, { id: 3, type: "pvstring", name: "3.2.4", mods: [] }, { id: 4, type: "pvstring", name: "frei", mods: [] });
  b.items.push({ id: 5, type: "pvstring", name: "3.1.1", mods: [] }, { id: 6, type: "pvmodule", mt: "m", x: 0, y: 0 });
  doc.pv = { invTypes: [{ id: "w1", name: "A", vmax: 1000 }, { id: "w3", name: "C", vmax: 800 }], wr: { 1: "w1", 3: "w3" }, anlage: [{ str: [1] }, { str: [] }, { str: [1, 4] }] };
  const names = () => doc.sheets.flatMap((sh) => P.strings(sh).map((s) => s.name));
  const d1 = JSON.parse(JSON.stringify(doc)); P.renumberWr(d1, [1, 3]); // WR 2 löschen: WR 3 wird WR 2
  assert.deepStrictEqual(d1.sheets.flatMap((sh) => P.strings(sh).map((s) => s.name)), ["1.1.1", "2.2.4", "frei", "2.1.1"]);
  assert.deepStrictEqual(d1.pv.wr, { 1: "w1", 2: "w3" }); assert.deepStrictEqual(d1.pv.anlage, [{ str: [1] }, { str: [1, 4] }]);
  assert.strictEqual(d1.sheets.at(-1).items.filter((it) => it.type === "pvmodule").length, 1, "Module bleiben");
  P.renumberWr(doc, [3, 1, 2]); // WR 3 nach vorne
  assert.deepStrictEqual(names(), ["2.1.1", "3.1.1", "1.2.4", "frei", "1.1.1"]);
  assert.deepStrictEqual(doc.pv.wr, { 1: "w3", 2: "w1" }); assert.deepStrictEqual(doc.pv.anlage, [{ str: [1, 4] }, { str: [1] }, { str: [] }]);
  const d2 = { sheets: [], pv: { anlage: [{ str: [] }] } }; P.renumberWr(d2, []); assert.strictEqual(d2.pv, undefined, "letzter WR weg = keine Anlage");
  console.log("5as/5aw WR neu nummerieren ok");
}
{ // 5ax Leitungen, 5ay Punkte mit Beschriftung, 5az Plan drehen (CJ 17.10.)
  const d = newDoc(), pv = newSheet("pv"); pv.sid = 4; pv.bg = { name: "", page: 1, w: 100, h: 100 }; d.sheets.push(pv); d.nextId = 20;
  const ln = { id: 1, type: "pvline", pts: [[0, 0], [2000, 0], [2000, 1000]], w: 50, col: "#f5c400" }, pt = { id: 2, type: "pvpoint", x: 500, y: 500, s: "WR" };
  const rf = { id: 3, type: "roofline", pts: [[0, 0], [1000, 0]], closed: false }, tx = { id: 4, type: "text", x: 100, y: 100, h: 250, s: "T" }, sp = { id: 5, type: "spa", x: 300, y: 0 };
  pv.items.push(ln, pt, rf, tx, sp);
  assert.strictEqual(P.layerOf(ln), "kabel"); assert.strictEqual(P.layerOf(pt), "kabel");
  // Datei: Version 13, Rundreise gleich, ungültige Werte → Vorgabe
  const t = serializeModel(d); assert.strictEqual(JSON.parse(t).version, 13); const r = parseModel(t);
  assert.deepStrictEqual(r.sheets[1].items.slice(0, 2), [ln, pt]); assert.strictEqual(serializeModel(r), t, "Speichern → Laden → Speichern gleich");
  assert.deepStrictEqual(P.cleanPvItem({ type: "pvline", pts: [[0, 0], [1, 1]], w: -3, col: "gelb" }, 7), { id: 7, type: "pvline", pts: [[0, 0], [1, 1]], w: P.LINE_W, col: P.LINE_COL });
  assert.strictEqual(P.cleanPvItem({ type: "pvline", pts: [[0, 0]] }, 7), null, "Leitung braucht zwei Punkte");
  assert.deepStrictEqual(P.cleanPvItem({ type: "pvpoint", x: 1, y: 2, s: 5, ox: 10 }, 8), { id: 8, type: "pvpoint", x: 1, y: 2, s: "5" }, "ox ohne oy fällt weg");
  assert.strictEqual(P.cleanPvItem({ type: "pvline", pts: [[0, 0], [1, 1]], col: "#ABCDEF" }, 9).col, "#abcdef");
  const d6 = newDoc(), p6 = newSheet("pv"); p6.sid = 1; d6.sheets.push(p6); assert.strictEqual(JSON.parse(serializeModel(d6)).version, 6, "ohne Leitung und Punkt wie bisher");
  // Treffer: Leitung mit halber Breite, Punkt mit Text; Text versetzt
  assert.ok(P.hitLine(ln, 1000, 25, 0) && P.hitLine(ln, 1000, 28, 4) && !P.hitLine(ln, 1000, 30, 4)); // 25 mm halbe Breite + 4 Toleranz
  assert.deepStrictEqual(P.pointLabel(pt), [500 + P.PT_OFF[0], 500 + P.PT_OFF[1]]);
  const b = P.pointBox(pt); assert.ok(b.x1 > 500 + P.PT_OFF[0] && b.x0 === 500 - P.PT_R);
  assert.deepStrictEqual(P.pointLabel({ ...pt, ox: -800, oy: 0 }), [-300, 500]);
  // Fang: Punkte von Leitungen und Punkten sind Endpunkte
  assert.deepStrictEqual(P.snapPv(pv, { x: 2003, y: 998 }, { tol: 10 }), { x: 2000, y: 1000, snap: "end" });
  assert.strictEqual(P.snapPv(pv, { x: 503, y: 498 }, { tol: 10 }).snap, "end");
  // Druckteile: Leitungen und Punkte einzeln ausblendbar, Auge (Ebene Verkabelung) gilt
  assert.strictEqual(P.partOf(ln), "line"); assert.strictEqual(P.partOf(pt), "point"); assert.strictEqual(P.partOf(rf), "roofline");
  pv.hide = ["line"]; assert.ok(!P.visible(pv, ln) && P.visible(pv, pt)); pv.hide = ["point"]; assert.ok(P.visible(pv, ln) && !P.visible(pv, pt)); delete pv.hide;
  assert.deepStrictEqual(P.cleanHide(["line", "point", "x"]), ["line", "point"]);
  P.toggleLayer(pv, "kabel", "show"); assert.ok(!P.visible(pv, ln) && !P.visible(pv, pt)); P.toggleLayer(pv, "kabel", "show");
  // 5az: Plan drehen dreht nur Dachlinien (und Sperrflächen); Leitung, Punkt, Text, SPA bleiben
  const keep = JSON.stringify([ln, pt, tx, sp]);
  P.rotatePlan(pv, 90); assert.strictEqual(pv.bg.rot, 90); assert.strictEqual(JSON.stringify([ln, pt, tx, sp]), keep);
  assert.deepStrictEqual(rf.pts, [[0, 0], [0, 1000]]);
  console.log("5ax Leitungen, 5ay Punkte, 5az Plan drehen ok");
}
{ // 5ba Texthöhe Punkt, 5bb Grösse Stringbeschriftung, 5bc Autoverkabelung eingeschränkt (CJ 17.10.)
  assert.strictEqual(P.cleanPvItem({ type: "pvpoint", x: 0, y: 0, s: "A", h: 400 }, 1).h, 400); assert.ok(!("h" in P.cleanPvItem({ type: "pvpoint", x: 0, y: 0, h: -1 }, 1)));
  const pb = P.pointBox({ x: 0, y: 0, s: "AB", h: 1000 }); assert.ok(pb.x1 >= P.PT_OFF[0] + 2 * 0.6 * 1000 - 1e-9, "Box mit eigener Texthöhe");
  assert.strictEqual(P.cleanStrk(1.5), 1.5); assert.strictEqual(P.cleanStrk(1), undefined); assert.strictEqual(P.cleanStrk(9), undefined); assert.strictEqual(P.cleanStrk("2"), undefined);
  const d = newDoc(), pv = newSheet("pv"); pv.sid = 5; pv.strk = 1.5; d.sheets.push(pv); d.nextId = 9;
  const t = serializeModel(d); assert.strictEqual(JSON.parse(t).version, 13); const r = parseModel(t); assert.strictEqual(r.sheets[1].strk, 1.5); assert.strictEqual(serializeModel(r), t);
  const bad = JSON.parse(t); bad.sheets[1].strk = 0.1; assert.ok(!("strk" in parseModel(JSON.stringify(bad)).sheets[1]));
  // Autoverkabelung nur über erlaubte Module: 8 Module in einer Reihe, erlaubt 2 bis 6
  P.setTypeSource(() => [{ id: "m1", name: "T", l: 1700, b: 1000 }]);
  const sh = { items: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, type: "pvmodule", mt: "m1", x: i * 1005, y: 0, quer: false })) };
  const allowed = new Set([2, 3, 4, 5, 6]);
  assert.deepStrictEqual(P.autoStrings(sh, 2, 3, 2, "h", allowed), [[2, 3], [4, 5]], "nur volle Strings aus erlaubten Modulen");
  assert.deepStrictEqual(P.autoStrings(sh, 1, 1, 2, "h", allowed), [], "Start ausserhalb");
  assert.deepStrictEqual(P.autoStrings(sh, 1, 1, 2, "h", new Set()), [[1, 2]], "leere Wahl = alle");
  console.log("5ba Texthöhe, 5bb Stringbeschriftung, 5bc Autoverkabelung eingeschränkt ok");
}
console.log("ok");
