// Modul «Plan» (CJ 23.10.2026, nur elplexaCAD), Schritt 1: Datenmodell und Geometrie ohne Browser.
// Aufruf: node test/test_plan.mjs [Ausgabe.dxf] (Ausgabe wird nicht gebraucht)
import assert from "node:assert";
globalThis.ELPLEXA = true; // vor dem Laden: model.js nimmt «plan» nur im elplexa-Bau auf
const M = await import("../src/model.js");
const P = await import("../src/plan.js");
const near = (p, q, msg) => assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6, `${msg}: ${p} statt ${q}`);

// ---------- Küche: vier Wände (Mittellinie), Tür, Fenster, Masse, Diagonale ----------
const plan = (items, extra = {}) => ({ kind: "plan", sid: 7, meta: { BLATT: "1" }, paper: { size: "A3", quer: true, den: 50 }, layers: [{ id: "bg", name: "Hintergrund", show: true, lock: false }, { id: "l1", name: "Elektro", show: true, lock: true }], alay: "bg", pmid: [2000, 1500], items, ...extra });
const kueche = () => [
  { id: 1, type: "wall", layer: "bg", a: [0, 0], b: [4000, 0], d: 150, mat: "beton" },
  { id: 2, type: "wall", layer: "bg", a: [4000, 0], b: [4000, 3000], d: 150, mat: "mauer" },
  { id: 3, type: "wall", layer: "bg", a: [4000, 3000], b: [0, 3000], d: 150, mat: "mauer" },
  { id: 4, type: "wall", layer: "bg", a: [0, 3000], b: [0, 0], d: 100, mat: "leicht" },
  { id: 5, type: "opening", wall: 1, t: 500, w: 900, kind: "tuer", hinge: "r", side: -1, h: 2000 },
  { id: 6, type: "opening", wall: 3, t: 1000, w: 1200, kind: "fenster", br: 900 },
  { id: 7, type: "opening", wall: 2, t: 800, w: 1000, kind: "durchgang" },
  { id: 8, type: "opening", wall: 4, t: 200, w: 800, kind: "schiebe", side: 1 },
  { id: 9, type: "dim", layer: "bg", a: [0, 0], b: [4000, 0], off: -500, ref: 1 },
  { id: 10, type: "dim", layer: "bg", a: [0, 0], b: [4000, 3000], off: 0, ctrl: true, soll: 5000 },
  { id: 11, type: "dim", layer: "l1", a: [4000, 0], b: [4000, 3000], off: 400 },
];
const file = (sheets, v = 20) => JSON.stringify({ format: "schemacad", version: v, active: 0, nextId: 20, sheets, mods: { plan: { name: "EG" }, "plan:2": { name: "OG", st: "In Arbeit" } } });

// Speichern/Laden gibt die Daten unverändert zurück
assert.strictEqual(M.VERSION, 24, "elplexa liest Version 24 (Plan Schritt 5: Versatz der Beschriftung …)");
const doc = M.parseModel(file([plan(kueche()), plan([], { sid: 8, var: 2, layers: [{ id: "bg", name: "Hintergrund", show: false, lock: false }], paper: { size: "A2", quer: false, den: 20 } })]));
const txt = M.serializeModel(doc), back = JSON.parse(txt);
assert.strictEqual(back.version, 20, "Datei mit Plan: Version 20");
assert.deepStrictEqual(M.parseModel(txt), doc, "Laden → Speichern → Laden unverändert");
assert.deepStrictEqual(back.sheets[0].items, kueche(), "Objekte unverändert");
assert.deepStrictEqual(back.sheets[0].layers, plan([]).layers, "Ebenen unverändert");
assert.deepStrictEqual([back.sheets[0].paper, back.sheets[1].paper, back.sheets[1].var], [{ size: "A3", quer: true, den: 50 }, { size: "A2", quer: false, den: 20 }, 2]);
assert.deepStrictEqual(doc.sheets.map(M.modOf), ["plan", "plan:2"], "Modul-Kennung plan, mehrfach mit var");
assert.deepStrictEqual([M.modName(doc, "plan"), M.modName(doc, "plan:2"), M.modName({}, "plan:3")], ["EG", "OG", "Plan 3"]);
assert.strictEqual(doc.mods["plan:2"].st, "In Arbeit", "Modulstatus bleibt");
assert.deepStrictEqual(doc.sheets.map((s) => s.sid), [7, 8], "eigene sid je Plan");

// Ohne Plan bleibt die Datei bei ≤ 19
assert.ok(JSON.parse(M.serializeModel(M.parseModel(JSON.stringify({ format: "schemacad", version: 2, sheets: [{ meta: {}, items: [] }] })))).version <= 19);

// Neuer Plan: nur «Hintergrund», A3 quer 1:50, sid beim Laden vergeben
const ns = P.newPlanSheet(M.newSheet("plan"));
assert.deepStrictEqual([ns.kind, ns.layers, ns.alay, ns.paper], ["plan", [{ id: "bg", name: "Hintergrund", show: true, lock: false }], "bg", { size: "A3", quer: true, den: 50 }]);
const nd = M.parseModel(JSON.stringify({ format: "schemacad", version: 20, sheets: [ns] }));
assert.ok(nd.sheets[0].sid > 0, "sid beim Laden vergeben");

// Bereinigung: Öffnung ohne Wand fällt weg, Öffnung in die Wand geklemmt, unbekannte Ebene → aktive, Massstab ausserhalb 1:10–1:100 → Vorgabe
const dirty = M.parseModel(file([plan([
  { id: 1, type: "wall", layer: "xx", a: [0, 0], b: [1000, 0], d: 150, mat: "glas" },
  { id: 2, type: "opening", wall: 99, t: 0, w: 800, kind: "tuer" },
  { id: 3, type: "opening", wall: 1, t: 600, w: 800, kind: "tuer" },
  { id: 4, type: "dim", layer: "bg", a: [0, 0], b: [1, 1], off: 0, ref: 42 },
], { paper: { size: "A9", den: 500 }, layers: [{ id: "bg", name: "" }, { id: "bg", name: "doppelt" }, ...Array.from({ length: 12 }, (_, i) => ({ id: "x" + i, name: "E" + i }))], alay: "nix" })])).sheets[0];
assert.deepStrictEqual(dirty.items.map((i) => i.id), [1, 3, 4]);
assert.deepStrictEqual([dirty.items[0].layer, dirty.items[0].mat, dirty.items[1].t, dirty.items[1].hinge, dirty.items[1].side, "ref" in dirty.items[2]], ["bg", "mauer", 200, "l", 1, false]);
assert.deepStrictEqual(dirty.paper, { size: "A3", quer: true, den: 50 });
assert.ok(!("pmid" in M.parseModel(file([plan([], { pmid: ["x", 1] })])).sheets[0]), "Druckmitte defekt → fällt weg (Mitte des Inhalts)");
assert.deepStrictEqual(back.sheets[0].pmid, [2000, 1500], "Druckmitte bleibt");
assert.deepStrictEqual([dirty.layers.length, dirty.layers[0].name, dirty.alay], [10, "Ebene", "bg"], "höchstens 10 Ebenen, ohne Doppel");
assert.throws(() => M.parseModel(file([plan([{ id: 1, type: "symbol", sym: "LS_1P", x: 0, y: 0 }])])), /Plan enthält ein unbekanntes/);
assert.throws(() => M.parseModel(file([plan([{ id: 1, type: "wall", layer: "bg", a: [0, 0], b: [0, 0], d: 150 }])])), /defektes Objekt/, "Wand ohne Länge");

// SchemaCAD v3 (ohne ELPLEXA, eigener Prozess) lehnt Version 20 ab und kennt kind "plan" nicht
const { execFileSync } = await import("node:child_process");
const v3 = execFileSync(process.execPath, ["--input-type=module", "-e", `import { parseModel, VERSION, KINDS, modBase } from "./src/model.js";
let e = ""; try { parseModel(${JSON.stringify(file([plan([])]))}); } catch (x) { e = x.message; }
console.log(JSON.stringify([VERSION, KINDS.includes("plan"), modBase({ kind: "plan" }), e]));`], { cwd: new URL("..", import.meta.url) }).toString();
assert.deepStrictEqual(JSON.parse(v3), [19, false, "schema", "Die Datei stammt aus einer neueren Version von SchemaCAD."]);

// ---------- Ebenen ----------
const sh = M.parseModel(file([plan(kueche())])).sheets[0];
assert.ok(!P.isPickable(sh, sh.items.find((i) => i.id === 11)) && P.isPickable(sh, sh.items[0]), "gesperrte Ebene nicht wählbar");
assert.ok(P.isVisible(sh, sh.items.find((i) => i.id === 11)), "gesperrt bleibt sichtbar");
assert.strictEqual(P.itemLayer(sh, sh.items.find((i) => i.id === 5)), "bg", "Öffnung: Ebene der Wand");
const l2 = P.addLayer(sh, "Leitungen");
assert.deepStrictEqual([sh.layers.map((l) => l.id), sh.alay], [["bg", "l2", "l1"], "l2"], "neue Ebene über der aktiven, wird aktiv");
assert.ok(P.moveLayer(sh, "l2", 1) && sh.layers[2].id === "l2" && !P.moveLayer(sh, "l2", 1), "Reihenfolge ändern");
assert.ok(!P.layerUsed(sh, l2.id) && P.layerUsed(sh, "l1"));
assert.ok(P.deleteLayer(sh, "l1") && !sh.items.some((i) => i.id === 11), "Ebene samt Objekten löschen");
while (sh.layers.length < P.MAX_LAYERS) P.addLayer(sh);
assert.strictEqual(P.addLayer(sh), null, "nicht mehr als 10 Ebenen");

// ---------- Gehrung: Ecken der Küche verschmolzen ----------
const k = M.parseModel(file([plan(kueche())])).sheets[0], walls = k.items.filter((i) => i.type === "wall");
const shapes = P.wallShapes(walls, []);
const s1 = shapes[0], s4 = shapes[3];
// Wand 1 (unten, 150): aussen y = −75, innen y = 75. Ecke bei (4000|0) mit Wand 2 (150): aussen (4075|−75), innen (3925|75)
near(s1.poly[1], [4075, -75], "Gehrung aussen rechts unten");
near(s1.poly[2], [3925, 75], "Gehrung innen rechts unten");
// Ecke bei (0|0) mit Wand 4 (Leichtbau 100): aussen (−50|−75), innen (50|75)
near(s1.poly[0], [-50, -75], "Gehrung aussen, verschiedene Dicken");
near(s1.poly[3], [50, 75], "Gehrung innen, verschiedene Dicken");
near(s4.poly[1], [-50, -75], "Nachbarwand trifft denselben Punkt");
// keine Stirnseiten an den Ecken: je Wand nur die zwei Seitenflächen
assert.ok(shapes.every((s) => s.lines.length === 2), "Ecken ohne Fuge");

// ---------- T-Stoss: Innenwand stösst an Wand 1, keine Fuge, Wand 1 bleibt ----------
const tw = { id: 20, type: "wall", layer: "bg", a: [2000, 0], b: [2000, 3000], d: 100, mat: "mauer" };
const tshapes = P.wallShapes([...walls.slice(0, 4), tw], []), st = tshapes[4], sw1 = tshapes[0];
near(st.poly[0], [2050, 75], "T-Stoss: rechte Seite bis an die Fläche");
near(st.poly[3], [1950, 75], "T-Stoss: linke Seite bis an die Fläche");
const inner1 = sw1.lines.filter((l) => l[0][1] === 75);
assert.deepStrictEqual(inner1, [[[50, 75], [1950, 75]], [[2050, 75], [3925, 75]]], "Fläche der durchgehenden Wand mit Lücke");
assert.ok(sw1.lines.some((l) => l[0][1] === -75 && l[0][0] === -50 && l[1][0] === 4075), "Aussenseite durchgehend");
assert.deepStrictEqual(walls[0].a, [0, 0], "durchgehende Wand unverändert");

// ---------- Öffnungen: Leibungen, Lücke in den Flächen, Schraffur ohne Öffnung ----------
const ow = P.wallShapes(walls, k.items.filter((i) => i.type === "opening"))[0];
assert.strictEqual(ow.fills.length, 2, "Schraffur in zwei Teilen");
assert.ok(ow.lines.some((l) => l[0][0] === 500 && l[1][0] === 500) && ow.lines.some((l) => l[0][0] === 1400), "Leibungen bei 500 und 1400");
assert.ok(!ow.lines.some((l) => l[0][1] === l[1][1] && Math.min(l[0][0], l[1][0]) < 1000 && Math.max(l[0][0], l[1][0]) > 1000), "keine Fläche über der Tür");

// ---------- Doppelschale (CJ 26.10.2026): Stein + Isolation + Stein, Dicke daraus, Isolation mittig mit Gehrung ----------
{
  const cw = (o) => P.cleanPlanObj({ type: "wall", layer: "bg", a: [0, 0], b: [4000, 0], d: 150, ...o }, 1);
  assert.deepStrictEqual([cw({ mat: "doppel" }).st, cw({ mat: "doppel" }).iso, cw({ mat: "doppel" }).d], [120, 80, 320], "Vorgabe 12 + 8 + 12 = 32 cm");
  assert.strictEqual(cw({ mat: "doppel", st: 150, iso: 100 }).d, 400, "Dicke folgt Stein und Isolation");
  assert.ok(!("st" in cw({ mat: "mauer", st: 150 })), "Stein nur bei Doppelschale");
  const dw = [[0, 0, 4000, 0], [4000, 0, 4000, 3000]].map(([x0, y0, x1, y1], i) => cw({ mat: "doppel", a: [x0, y0], b: [x1, y1] }) && { ...cw({ mat: "doppel", a: [x0, y0], b: [x1, y1] }), id: i + 1 });
  const ds = P.wallShapes(dw, []);
  const ys = ds[0].iso[0].map((p) => p[1]);
  assert.deepStrictEqual([Math.min(...ys), Math.max(...ys)], [-40, 40], "Isolation 80 mm mittig");
  const has = (x, y) => ds[0].iso[0].some((p) => Math.abs(p[0] - x) < 1e-6 && Math.abs(p[1] - y) < 1e-6);
  assert.ok(has(3960, 40) && has(4040, -40), "Isolation auf Gehrung in der Ecke");
  assert.ok(P.wallShapes(walls, [])[0].iso.length === 0, "andere Wände ohne Isolation");
  assert.strictEqual(JSON.parse(M.serializeModel(M.parseModel(file([plan([{ ...dw[0], id: 1 }])])))).version, 24, "Doppelschale: Version 24");
}

// ---------- Ecke ziehen: beide Wände folgen, T-Stoss-Wand nicht ----------
const g = M.parseModel(file([plan([...kueche(), tw])])).sheets[0];
assert.strictEqual(P.moveNode(g, [4000, 0], [4500, -200]), 4, "zwei Wände und zwei Masse an der Ecke");
const G = (id) => g.items.find((i) => i.id === id);
assert.deepStrictEqual([G(1).b, G(2).a, G(9).b, G(11).a], [[4500, -200], [4500, -200], [4500, -200], [4500, -200]]);
assert.deepStrictEqual(G(20).a, [2000, 0], "Anschlusswand wird nicht mitgeführt");

// ---------- Mass treibt Wand ----------
const d = M.parseModel(file([plan(kueche())])).sheets[0], D = (id) => d.items.find((i) => i.id === id);
assert.ok(P.setDimLength(d, D(9), 4500));
assert.deepStrictEqual([D(1).b, D(2).a, D(2).b, D(9).b], [[4500, 0], [4500, 0], [4000, 3000], [4500, 0]], "Ende b wandert, Ecke folgt");
assert.ok(Math.abs(P.dimLen(D(11)) - Math.hypot(500, 3000)) < 1e-6, "freies Mass an der Ecke folgt");
// Diagonale als Kontrollmass: Ist, Soll, Abweichung; Eintippen ändert keine Geometrie
const ci = P.ctrlInfo(D(10));
assert.deepStrictEqual([ci.ist, ci.soll, ci.diff], [5000, 5000, 0]);
assert.ok(P.setDimLength(d, D(10), 5010) && D(10).soll === 5010 && D(10).b[0] === 4000, "Kontrollmass: nur Soll");
assert.strictEqual(P.ctrlInfo(D(10)).diff, -10);
// freies Mass treibt die Ecke
assert.ok(P.setDimLength(d, D(11), 2000));
assert.ok(Math.abs(P.dimLen(D(11)) - 2000) < 0.01 && D(2).b[0] === D(11).b[0] && D(3).a[1] === D(11).b[1], "Wände an Ende b folgen dem freien Mass");
assert.ok(!P.setDimLength(d, D(9), -1) && !P.setDimLength(d, D(9), NaN), "ungültige Länge");

// ---------- Öffnung folgt Wand ----------
const o = M.parseModel(file([plan(kueche())])).sheets[0], O = (id) => o.items.find((i) => i.id === id);
P.moveItem(o, O(1), 0, -300);
assert.deepStrictEqual([O(1).a, O(1).b, O(2).a, O(4).b], [[0, -300], [4000, -300], [4000, -300], [0, -300]], "Wand verschoben, Nachbarn folgen");
assert.deepStrictEqual([O(5).wall, O(5).t], [1, 500], "Öffnung bleibt an der Wand, Abstand ab Ecke gleich");
P.setDimLength(o, O(9), 1000);
assert.strictEqual(O(5).t, 100, "Öffnung in die kürzere Wand geklemmt");
P.moveItem(o, O(5), 250, 0);
assert.strictEqual(O(5).t, 100, "Öffnung bleibt in der Wand");
P.deleteItem(o, 1);
assert.ok(!o.items.some((i) => i.id === 5 || i.id === 1) && !("ref" in O(9)), "mit der Wand gehen ihre Öffnungen, Mass wird frei");

// ---------- Eingabe ----------
assert.deepStrictEqual(["3450", "3450 mm", "345 cm", "3,45 m", "3.45m", " 12,5 ", "abc", "", "-3", "0"].map(P.parseLen), [3450, 3450, 3450, 3450, 3450, 12.5, NaN, NaN, NaN, NaN]);
assert.deepStrictEqual([P.polar([0, 0], 90, 3000), P.polar([100, 100], 180, 50)], [[0, 3000], [50, 100]]);
assert.deepStrictEqual(P.orthoPt([0, 0], [1000, 30]), [1000, 0], "Shift: waagrecht");
const { STD_DENS } = await import("../src/pv.js");
assert.deepStrictEqual(P.PLAN_DENS, STD_DENS.filter((d) => d >= 10 && d <= 100), "Normmassstäbe 1:10 bis 1:100");

// ---------- Editor-Hilfen (Schritt 1, Stufe 2) ----------
const e = M.parseModel(file([plan(kueche())])).sheets[0], E = (id) => e.items.find((i) => i.id === id), pick = e.items.filter((i) => P.isPickable(e, i));
assert.strictEqual(P.hitPlan(e, pick, [950, 0], 10)?.id, 5, "Treffer: Öffnung vor Wand");
assert.strictEqual(P.hitPlan(e, pick, [3000, 40], 10)?.id, 1, "Treffer: Wand innerhalb der Dicke");
assert.strictEqual(P.hitPlan(e, pick, [2000, -501], 10)?.id, 9, "Treffer: Masslinie (off −500 = rechts von a → b)");
assert.strictEqual(P.hitPlan(e, pick, [4400, 1500], 10), null, "Mass auf gesperrter Ebene nicht wählbar");
assert.deepStrictEqual(P.snapPlan(e, e.items, [4030, 20], { grid: 100, tol: 60 }), { x: 4000, y: 0, snap: "end" }, "Fang: Ecke");
assert.deepStrictEqual(P.snapPlan(e, e.items, [2010, 1520], { grid: 100, tol: 60 }), { x: 2000, y: 1500, snap: "grid" }, "Fang: Raster ab Nullpunkt");
assert.deepStrictEqual(P.snapPlan(e, e.items, [1520, 1500], { grid: 0, tol: 1, ortho: [0, 1490] }), { x: 1520, y: 1490 }, "Shift: waagrecht");
// Wand zeichnen (CJ 24.10.2026): Innenlinie, Wand nach links (Vorgabe) oder rechts, Gehrung im Schnitt der Mittellinien
{
  const w1 = { id: 1, type: "wall", ...P.innerWall([0, 0], [4000, 0], 150, 1), d: 150 }, w2 = { id: 2, type: "wall", ...P.innerWall([4000, 0], [4000, -3000], 150, 1), d: 150 };
  assert.deepStrictEqual([w1.a, w1.b], [[0, 75], [4000, 75]], "Innenlinie nach rechts, Wand links = oben: Mittellinie um 75 nach oben");
  assert.deepStrictEqual(P.innerWall([0, 0], [4000, 0], 150, -1), { a: [0, -75], b: [4000, -75] }, "Wand rechts der Zeichenrichtung");
  assert.ok(P.mitre(w1, w2), "Ecke verschoben");
  assert.deepStrictEqual([w1.b, w2.a], [[4075, 75], [4075, 75]], "Ecke im Schnitt der Mittellinien (aussen)");
  const rect = [[0, 0], [4000, 0], [4000, -3000], [0, -3000]];
  const ws = rect.map((p, i) => ({ id: i + 1, type: "wall", ...P.innerWall(p, rect[(i + 1) % 4], 150, 1), d: 150 }));
  for (let i = 0; i < 4; i++) P.mitre(ws[i], ws[(i + 1) % 4]);
  const poly = P.wallShapes(ws).map((x) => x.poly);
  const xs = poly.flat().map((q) => q[0]), ys = poly.flat().map((q) => q[1]);
  assert.deepStrictEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [-150, 4150, -3150, 150], "Aussenmasse Innenmass + 2 Dicken");
  assert.deepStrictEqual(P.faceGeom(ws).corners.filter((q) => Math.abs(q[0]) < 1 && Math.abs(q[1]) < 1).length > 0, true, "Innenecke (0|0) ist Fangpunkt der Wandflächen");
}
// Ausrichtungsfang: Rechteck schliessen (Anfang senkrecht, letzter Punkt waagrecht) im Schnittpunkt
{
  const refs = [[0, 0], [4000, 0], [4000, -3000]], dirs = [[1, 0], [0, 1]];
  const a = P.alignSnap([40, -2985], refs, dirs, 60);
  assert.deepStrictEqual([a.x, a.y, a.guides.length], [0, -3000, 2], "Punkt 4: x wie Anfang, y wie letzter Punkt");
  const b = P.alignSnap([1000, -1500], refs, dirs, 60);
  assert.strictEqual(b, null, "weit weg: kein Fang");
  const c = P.alignSnap([2000, -20], refs, dirs, 60);
  assert.deepStrictEqual([c.x, c.y, c.guides.length], [2000, 0, 1], "eine Linie: nur y rastet ein");
  const sn = P.snapPlan({}, [], [30, -2990], { grid: 100, tol: 60, align: { refs, dirs } });
  assert.deepStrictEqual([sn.x, sn.y, sn.snap], [0, -3000, "align"], "snapPlan: Ausrichtung vor Raster");
  assert.strictEqual(P.snapPlan({}, [], [30, -2990], { grid: 100, tol: 60, alt: true, align: { refs, dirs } }).snap, undefined, "Alt: frei");
}

assert.ok(P.setWallLength(e, E(2), 2500) && E(2).b[1] === 2500 && E(3).a[1] === 2500, "Wandlänge eintippen: Ende b und Ecke folgen");
const ends = P.nodeEnds(e, [0, 0]);
assert.deepStrictEqual(ends.map((x) => `${x.it.id}${x.e}`).sort(), ["10a", "1a", "4b"], "Enden an der Ecke: Wände und freie Masse (Diagonale), Mass mit Bezug folgt selbst");
P.setEnds(e, ends, [-100, -100]);
assert.deepStrictEqual([E(1).a, E(4).b, E(9).a, E(10).a], [[-100, -100], [-100, -100], [-100, -100], [-100, -100]], "Ecke setzen: Wandmass und Diagonale folgen");
assert.ok(P.contentBox(e).x0 < -100 && P.contentBox({ items: [] }) === null);

// Griffe an Öffnungen: Kante ziehen ändert die Breite, die andere Kante bleibt, Raster 10 mm, bleibt in der Wand
{
  const w = { a: [0, 0], b: [4000, 0] }, o = { t: 500, w: 900 };
  P.setOpeningEdge(w, o, "t1", 1633); assert.deepStrictEqual(o, { t: 500, w: 1130 }, "rechte Kante: Breite auf 10 mm, t bleibt");
  P.setOpeningEdge(w, o, "t0", 287); assert.deepStrictEqual(o, { t: 290, w: 1340 }, "linke Kante: rechte Kante bleibt bei 1630");
  P.setOpeningEdge(w, o, "t0", 287, 1); assert.deepStrictEqual(o, { t: 287, w: 1343 }, "Alt: ohne Raster");
  P.setOpeningEdge(w, o, "t0", -800); assert.deepStrictEqual(o, { t: 0, w: 1630 }, "linke Kante nicht vor die Wand");
  P.setOpeningEdge(w, o, "t1", 9000); assert.deepStrictEqual(o, { t: 0, w: 4000 }, "rechte Kante nicht über die Wand");
  P.setOpeningEdge(w, o, "t1", 20); assert.deepStrictEqual(o, { t: 0, w: P.MIN_OPEN }, "Mindestbreite");
  P.setOpeningEdge(w, o, "t0", 500); assert.deepStrictEqual(o, { t: 0, w: P.MIN_OPEN }, "linke Kante nicht über die rechte");
}
// Höhe: nur Tür, Fenster, Schiebetür; gespeichert nur wenn gesetzt
assert.strictEqual(P.cleanPlanObj({ type: "opening", wall: 1, t: 0, w: 900, kind: "fenster", h: 1200 }, 1).h, 1200);
assert.ok(!("h" in P.cleanPlanObj({ type: "opening", wall: 1, t: 0, w: 900, kind: "durchgang", h: 2000 }, 1)), "Durchgang ohne Höhe");
assert.ok(!("h" in P.cleanPlanObj({ type: "opening", wall: 1, t: 0, w: 900, kind: "tuer" }, 1)), "Höhe fehlt = nicht gespeichert");

// ---------- Schritt 2: Elektrosymbole ----------
const S2 = await import("../src/plansym.js");
assert.ok(S2.PLAN_SYMS.length >= 30 && S2.SYM_BY_KEY.size === S2.PLAN_SYMS.length, "ca. 30 Symbole, Schlüssel eindeutig");
assert.ok(S2.PLAN_SYMS.every((d) => d.label && d.cat && d.group && d.parts.length), "jedes Symbol mit Name, Kategorie, Gruppe, Zeichnung");
{
  const syms = [
    { id: 30, type: "sym", layer: "l1", key: "STD", at: [3925, 400], r: 90, h: 115, txt: "Kühlschrank" },
    { id: 31, type: "sym", layer: "bg", key: "SCH0", at: [300, 75], r: 0, h: 120, ap: true },
    { id: 32, type: "sym", layer: "bg", key: "LEUCHTE", at: [2000, 1500], r: 45 },
    { id: 33, type: "sym", layer: "bg", key: "VERWEIS", at: [1000, 1000], r: 180, fu: "F3", nr: "2" },
  ];
  const d2 = M.parseModel(file([plan([...kueche(), ...syms])], 21));
  const t2 = M.serializeModel(d2), b2 = JSON.parse(t2);
  assert.strictEqual(b2.version, 21, "Plan mit Symbolen: Version 21");
  assert.deepStrictEqual(b2.sheets[0].items.filter((i) => i.type === "sym"), syms, "Symbole unverändert gespeichert");
  assert.strictEqual(JSON.parse(M.serializeModel(M.parseModel(file([plan(kueche())])))).version, 20, "Plan ohne Symbole bleibt Version 20");
  const c = (o) => P.cleanPlanObj({ type: "sym", layer: "bg", at: [0, 0], ...o }, 1);
  assert.strictEqual(c({ key: "GIBTSNICHT" }), null, "unbekanntes Symbol abgelehnt");
  assert.deepStrictEqual(c({ key: "LEUCHTE", r: -90, ap: true, fu: "F1", txt: "  " }), { id: 1, type: "sym", layer: "bg", key: "LEUCHTE", at: [0, 0], r: 270 }, "Drehung 0–359, Aufputz nur Schalter, Sicherung nur Verweis, leere Texte weg");
  // Standardhöhen (CJ 26.10.2026): Steckdose 30, Schalter 110, Leuchten ohne; gleich dem Standard wird nicht gespeichert und nicht beschriftet
  assert.deepStrictEqual(["STD", "STD3", "SCH0", "SCH3", "LEUCHTE_W", "LED_W"].map((k) => P.symH({ key: k })), [30, 30, 110, 110, undefined, undefined], "Standardhöhen");
  assert.ok(!("h" in c({ key: "SCH0", h: 110 })) && !("h" in c({ key: "STD", h: 30 })), "Standardhöhe nicht gespeichert");
  assert.deepStrictEqual([c({ key: "STD", h: 110 }).h, P.symH(c({ key: "STD", h: 110 }))], [110, 110], "abweichende Höhe bleibt (alte Pläne: Steckdose 110)");
  const v24 = JSON.parse(M.serializeModel(M.parseModel(file([plan([{ id: 40, type: "sym", layer: "bg", key: "STD", at: [0, 0], r: 0, txt: "A", lo: [3, 1] }])], 24))));
  assert.deepStrictEqual([v24.version, v24.sheets[0].items[0].lo], [24, [3, 1]], "Versatz der Beschriftung: Version 24");
  const hTxt = (o) => P.symTexts({ at: [0, 0], r: 0, ...o }, 50).map((x) => x.s);
  assert.deepStrictEqual([hTxt({ key: "STD" }), hTxt({ key: "STD", h: 30 }), hTxt({ key: "STD", h: 110 }), hTxt({ key: "SCH0", h: 110 })], [[], [], ["110"], []], "Höhe nur abweichend beschriftet");
  // Beschriftung verschiebbar (CJ 26.10.2026): Versatz lo in Papier-mm im System des Symbols, dreht mit, [0, 0] wird nicht gespeichert
  assert.deepStrictEqual([c({ key: "STD", lo: [2.04, -1] }).lo, c({ key: "STD", lo: [0, 0] }).lo, c({ key: "STD", lo: [99, "x"] }).lo, c({ key: "STD", lo: [99, -99] }).lo], [[2, -1], undefined, undefined, [60, -60]], "lo bereinigt");
  const at = (o) => P.symTexts({ at: [0, 0], key: "STD", txt: "A", ...o }, 50).find((x) => x.label).at;
  near(at({ r: 0, lo: [2, 1] }), [at({ r: 0 })[0] + 100, at({ r: 0 })[1] + 50], "Versatz r 0");
  near(at({ r: 90, lo: [2, 1] }), [at({ r: 90 })[0] - 50, at({ r: 90 })[1] + 100], "Versatz dreht mit (r 90)");
  const la = at({ r: 0 });
  assert.ok(P.labelHit({ at: [0, 0], key: "STD", txt: "A", r: 0 }, 50, [la[0] + 20, la[1]], 10) && !P.labelHit({ at: [0, 0], key: "STD", txt: "A", r: 0 }, 50, [la[0] - 300, la[1]], 10), "Beschriftung treffen");
  assert.ok(!P.labelHit({ at: [0, 0], key: "STD", r: 0 }, 50, [la[0] + 20, la[1]], 10), "ohne Beschriftung kein Treffer");
  // Wand einrasten: nächste Fläche, Symbol zeigt in den Raum
  const walls = kueche().filter((i) => i.type === "wall");
  assert.deepStrictEqual(P.wallSnap(walls, [3700, 400], 600), { at: [3925, 400], r: 90, wall: 2 }, "rechte Wand innen: Symbol nach links (r 90)");
  assert.deepStrictEqual(P.wallSnap(walls, [1000, 300], 600), { at: [1000, 75], r: 0, wall: 1 }, "untere Wand innen: r 0");
  assert.deepStrictEqual(P.wallSnap(walls, [1000, 2700], 600), { at: [1000, 2925], r: 180, wall: 3 }, "obere Wand innen: r 180");
  assert.deepStrictEqual(P.wallSnap(walls, [1000, -300], 600), { at: [1000, -75], r: 180, wall: 1 }, "untere Wand aussen: nach unten");
  assert.strictEqual(P.wallSnap(walls, [2000, 1500], 600), null, "Raummitte: keine Wand in Reichweite");
  // Treffer und Mitte (Massstab 1:50)
  const e2 = d2.sheets[0];
  near(P.symCenter(e2.items.find((i) => i.id === 30), 50), [3825, 400], "Mitte Wandsymbol: 2 mm × 50 in den Raum");
  assert.strictEqual(P.hitPlan(e2, e2.items, [2010, 1490], 10)?.id, 32, "Treffer Symbol vor Wand und Mass");
  P.moveItem(e2, e2.items.find((i) => i.id === 32), 100, -50);
  assert.deepStrictEqual(e2.items.find((i) => i.id === 32).at, [2100, 1450], "Symbol verschieben");
  assert.ok(P.deleteLayer(e2, "l1") && !e2.items.some((i) => i.id === 30), "Ebene löschen nimmt ihre Symbole mit");
  // Texte drehen mit, stehen nie auf dem Kopf (CJ 24.10.2026)
  assert.deepStrictEqual([0, 90, 91, 180, 270, 271].map((r) => P.readable(r)), [{ a: 0, flip: false }, { a: 90, flip: false }, { a: -89, flip: true }, { a: 0, flip: true }, { a: 90, flip: true }, { a: -89, flip: false }], "Winkel lesbar: −90 bis 90");
  const tx = (o) => P.symTexts({ at: [0, 0], ...o }, 50);
  for (const r of [0, 45, 90, 135, 180, 225, 270, 315]) assert.ok(tx({ key: "STD_T15", r, txt: "Kühlschrank", h: 110 }).every((x) => x.a > -90 && x.a <= 90), `nie auf dem Kopf (r ${r})`);
  const t15 = (r) => tx({ key: "STD_T15", r })[0];
  assert.deepStrictEqual([t15(0).a, t15(90).a, t15(180).a, t15(270).a], [0, 90, 0, 90], "T15 dreht mit der Wand");
  near(t15(0).at, [145, 50], "T15 rechts neben der Steckdose (r 0)");
  near(t15(180).at, [-145, -50], "T15 an der oberen Wand: gleicher Ort am Symbol");
  const lb = (r) => tx({ key: "STD", r, txt: "A", h: 40 });
  assert.deepStrictEqual(lb(0).map((x) => [x.s, x.anchor]), [["A", "start"], ["40", "start"]], "Beschriftung und Höhe rechts, linksbündig");
  assert.ok(lb(0)[0].at[1] > lb(0)[1].at[1], "Beschriftung über der Höhe");
  assert.deepStrictEqual(lb(180).map((x) => x.anchor), ["end", "end"], "obere Wand: gekippt, rechtsbündig vom Symbol weg");
  assert.ok(lb(180)[0].at[1] > lb(180)[1].at[1] && lb(180)[0].at[0] < 0, "gekippt: Beschriftung bleibt oben, links neben dem Symbol");
  assert.ok(lb(90)[0].at[1] > 0 && lb(90)[0].at[0] < lb(90)[1].at[0], "rechte Wand: Text senkrecht über dem Symbol, Beschriftung links der Höhe");
  const usb = tx({ key: "STD_USB", r: 0, txt: "Bett" }), z = usb.find((x) => x.s === "2"), lab = usb.find((x) => x.s === "Bett");
  assert.ok(lab.at[0] > z.at[0] + z.size * 0.3, "Beschriftung beginnt hinter der Zahl");
  // Mehrfachsteckdose: Zahl am Symbol änderbar (num), Vorgabe wird nicht gespeichert
  assert.deepStrictEqual([tx({ key: "STD3", r: 0 })[0].s, tx({ key: "STD3", r: 0, num: "4" })[0].s, tx({ key: "STD2", r: 0 })[0].s], ["3", "4", "2"], "Zahl 3, geändert 4, 2-fach");
  assert.deepStrictEqual([c({ key: "STD3", num: "3" }).num, c({ key: "STD3", num: " 5 " }).num, c({ key: "STD", num: "5" }).num], [undefined, "5", undefined], "num bereinigt");
  // Verteilung in echten mm (CJ 26.10.2026): Vorgabe 600 × 200, Teile in Papier-mm = Welt / Massstab
  assert.deepStrictEqual([c({ key: "VERTEILER", w: 800, t: 200 }).w, c({ key: "VERTEILER", w: 800, t: 200 }).t, c({ key: "STD", w: 800 }).w], [800, undefined, undefined], "w/t bereinigt");
  const vd = P.symDef({ key: "VERTEILER", w: 1000, t: 250 }, 50);
  assert.deepStrictEqual([vd.parts[0], vd.c], [["l", -10, 0, 10, 0], [0, 2.5]], "Verteilung 1000 × 250 mm bei 1:50 = 20 × 5 Papier-mm");
  assert.strictEqual(P.symDef({ key: "VERTEILER" }, 20).parts[1][4], 10, "Vorgabe 200 mm tief bei 1:20 = 10 Papier-mm");
  // Leuchten 5.190 (CJ 26.10.2026): Spots HV/LED/ELV, Notlicht, Balkenleuchte mit Länge in mm; neue Symbole = Version 24
  for (const k of ["EXIT_L", "EXIT_R", "EXIT_DL", "EXIT_DR", "EXIT_UL", "EXIT_UR", "EXIT_D", "HV", "HV_WEB", "LED_WEB_TR", "ELV_EB_TR", "NOTL_D", "NOTL_WEB_TR", "FL", "RASTER", "SPIEGEL", "DAUER"]) assert.ok(S2.SYM_BY_KEY.has(k), k);
  assert.deepStrictEqual([c({ key: "FL", w: 1500 }).w, c({ key: "FL", t: 300 }).t, P.symDef({ key: "FL", w: 1500 }, 50).parts[0]], [1500, undefined, ["l", -15, 0, 15, 0]], "FL: Länge in mm, ohne Breite");
  assert.strictEqual(JSON.parse(M.serializeModel(M.parseModel(file([plan([{ id: 50, type: "sym", layer: "bg", key: "NOTL", at: [0, 0], r: 0 }])], 24)))).version, 24, "Notleuchte: Version 24");
  assert.strictEqual(JSON.parse(M.serializeModel(M.parseModel(file([plan([{ id: 50, type: "sym", layer: "bg", key: "LED", at: [0, 0], r: 0 }])], 21)))).version, 21, "alte LED bleibt Version 21");
  // Hinweis (CJ 26.10.2026): Kasten mit Zeilen oben/unten/Kabel, oben bleibt oben auch gedreht, Linie zum Ziel
  const hw = (o) => tx({ key: "VERWEIS", fu: "UV EG", nr: "11X4", ...o });
  for (const r of [0, 180]) assert.ok(hw({ r })[0].s === "UV EG" && hw({ r })[0].at[1] > hw({ r })[1].at[1], `oben bleibt oben (r ${r})`);
  const rp = P.symDef({ key: "VERWEIS", fu: "UV EG", nr: "11X4", r: 0 }, 50).parts;
  assert.ok(rp.some((q) => q[0] === "l" && q[1] === 0 && q[2] === 0) && rp.filter((q) => q[0] === "l").length === 2, "Linie zum Ziel und Trennstrich");
  // alte Pläne (bis Version 23): vorausgefüllte Höhe 110 an Steckdosen und 200 an Wandleuchten fällt weg
  const old = M.parseModel(file([plan([{ id: 50, type: "sym", layer: "bg", key: "STD", at: [0, 0], r: 0, h: 110 }, { id: 51, type: "sym", layer: "bg", key: "LED_W", at: [0, 0], r: 0, h: 200 }, { id: 52, type: "sym", layer: "bg", key: "STD", at: [0, 0], r: 0, h: 120 }])], 23)).sheets[0].items;
  assert.deepStrictEqual(old.map((i) => i.h), [undefined, undefined, 120], "alte Vorgabehöhen weg, eigene bleibt");
  assert.strictEqual(JSON.parse(M.serializeModel(M.parseModel(file([plan([{ id: 50, type: "sym", layer: "bg", key: "STD2", at: [0, 0], r: 0 }])], 24)))).version, 24, "2-fach-Steckdose: Version 24");
  assert.strictEqual(tx({ key: "VERWEIS", r: 180, fu: "F3", nr: "2" })[0].a, 0, "Verweis F3 / 2 nie auf dem Kopf");
  // Schalterhebel ragen nicht in die Wand (y ≥ 0), Aufputz-Halbkreis passt zum Kreis
  for (const d of S2.PLAN_SYMS.filter((x) => x.wall)) assert.ok(d.parts.filter((q) => q[0] === "l").every((q) => q[2] >= -1e-9 && q[4] >= -1e-9), `${d.key}: nichts unter der Wandfläche`);
  for (const k of ["SCH3", "SCH6"]) { const d = S2.SYM_BY_KEY.get(k), c = d.parts.find((q) => q[0] === "c"); assert.ok(d.ap[1] === `M0,${c[2] + 1}A1 1 0 0 0 0,${c[2] - 1}Z` && d.c[1] === c[2], `${k}: Aufputz (rechte Hälfte) und Mitte am Kreis`); }
}

// ---------- Schritt 3: Leitungen, Farben, Mehrfachwahl (CJ 24.10.2026) ----------
{
  const lines = [
    { id: 40, type: "line", layer: "bg", pts: [[300, 300], [300, 1500], [2000, 1500]], kind: "decke" },
    { id: 41, type: "line", layer: "l1", pts: [[1000, 75], [1000, 900]], kind: "flex", col: "#ed3f2a" },
  ];
  const syms = [{ id: 42, type: "sym", layer: "bg", key: "STD", at: [1000, 75], r: 0, col: "#7aba4b" }, { id: 43, type: "sym", layer: "bg", key: "STEIG_AUF", at: [2000, 1500], r: 0 }];
  const d3 = M.parseModel(file([plan([...kueche(), ...lines, ...syms])], 22)), b3 = JSON.parse(M.serializeModel(d3));
  assert.strictEqual(b3.version, 22, "Plan mit Leitungen: Version 22");
  assert.deepStrictEqual(b3.sheets[0].items.filter((i) => i.type === "line"), lines, "Leitungen unverändert gespeichert");
  assert.strictEqual(JSON.parse(M.serializeModel(M.parseModel(file([plan([...kueche(), syms[0]])], 22)))).version, 22, "nur eine Farbe am Symbol: auch Version 22");
  assert.strictEqual(JSON.parse(M.serializeModel(M.parseModel(file([plan([...kueche(), syms[1]])], 22)))).version, 21, "Symbol ohne Farbe bleibt Version 21");
  assert.throws(() => M.parseModel(file([plan(lines)], 25)), /neueren Version/, "Version 25 abgelehnt");
  const cl = (o) => P.cleanPlanObj({ type: "line", layer: "bg", ...o }, 1);
  assert.strictEqual(cl({ pts: [[0, 0], [0, 0.1]] }), null, "Leitung mit einem Punkt abgelehnt");
  assert.deepStrictEqual(cl({ pts: [[0, 0], [0, 0], [100, 0]], kind: "xy", col: "#3FBBEB" }), { id: 1, type: "line", layer: "bg", pts: [[0, 0], [100, 0]], kind: "decke" }, "doppelte Punkte weg, unbekannte Art = Decke, Farbe = Vorgabe nicht gespeichert");
  assert.strictEqual(cl({ pts: [[0, 0], [100, 0]], col: "rot" }).col, undefined, "ungültige Farbe weg");
  // Farben nach 5.100: Vorgabe Leitung blau, Symbol nach Kategorie, Mauern schwarz
  assert.strictEqual(P.LINE_COL, "#3fbbeb", "Leitungen: Vorgabe blau (CJ)");
  const it = (key) => ({ type: "sym", key });
  assert.deepStrictEqual(["SCH0", "STD", "DOSE", "STEIG_AB"].map((k) => P.colOf(it(k))), ["#3fbbeb", "#3fbbeb", "#3fbbeb", "#3fbbeb"], "alle Symbole Vorgabe blau (CJ 24.10.2026)");
  assert.strictEqual(P.colOf({ type: "wall" }), "#000000", "Mauern schwarz");
  const y = { type: "sym", key: "STD" }; P.setCol(y, "#7ABA4B"); assert.strictEqual(y.col, "#7aba4b", "eigene Farbe gespeichert"); P.setCol(y, "#3fbbeb"); assert.ok(!("col" in y), "zurück auf Vorgabe: Feld weg");
  const wl = { type: "wall" }; P.setCol(wl, "#ed3f2a"); assert.ok(!("col" in wl), "Wand bekommt keine Farbe");
  assert.strictEqual(P.PLAN_COLS.length, 9, "9 Farben aus 5.100");
  // Treffer: Symbol vor Leitung vor Wand; Rahmenwahl
  const e3 = d3.sheets[0];
  assert.strictEqual(P.hitPlan(e3, e3.items, [300, 800], 10)?.id, 40, "Leitung getroffen");
  assert.strictEqual(P.hitPlan(e3, e3.items, [2000, 1500], 10)?.id, 43, "Symbol vor Leitung");
  const box = { x0: 200, y0: 200, x1: 2100, y1: 1600 };
  assert.deepStrictEqual(e3.items.filter((i) => P.inBox(e3, i, box)).map((i) => i.id), [40, 43], "Rahmen: nur Objekte ganz darin");
  // Mehrere verschieben: gemeinsame Ecke nur einmal, Nachbarwand folgt, Öffnung geht mit ihrer Wand
  const g = M.parseModel(file([plan([...kueche(), ...lines])], 22)).sheets[0], by = (id) => g.items.find((i) => i.id === id);
  P.moveItems(g, [by(1), by(2), by(5), by(40)], 0, 100);
  assert.deepStrictEqual([by(1).a, by(1).b, by(2).b], [[0, 100], [4000, 100], [4000, 3100]], "Wände 1 und 2: jede Ecke einmal verschoben");
  assert.deepStrictEqual([by(4).b, by(3).a], [[0, 100], [4000, 3100]], "Nachbarwände folgen an der Ecke");
  assert.strictEqual(by(5).t, 500, "Tür bleibt an ihrer Stelle in der Wand");
  assert.deepStrictEqual(by(40).pts[0], [300, 400], "Leitung verschoben");
  assert.deepStrictEqual(by(9).a, [0, 100], "Mass mit Bezug folgt");
  // Kopieren und Einfügen: neue ids, Öffnung mit ihrer Wand, fremder Massbezug fällt weg, Ebene unbekannt → aktive
  const h = M.parseModel(file([plan([...kueche(), ...lines])], 22)).sheets[0], hb = (id) => h.items.find((i) => i.id === id);
  const clip = P.copyItems(h, [hb(1), hb(6), hb(11), hb(41)]);
  assert.deepStrictEqual(clip.map((i) => i.id), [1, 5, 11, 41], "Wand 1 mit Tür 5, Fenster an Wand 3 ohne Wand fällt weg");
  let n = 100; h.alay = "bg"; h.layers = h.layers.filter((l) => l.id === "bg");
  const out = P.pasteItems(h, clip, 250, -250, () => ++n);
  assert.deepStrictEqual(out.map((i) => i.id), [101, 102, 103, 104], "neue ids");
  assert.deepStrictEqual([out[0].a, out[1].wall, out[2].layer, out[3].pts[0]], [[250, -250], 101, "bg", [1250, -175]], "versetzt, Tür an der neuen Wand, Ebene l1 fehlt → aktive");
  assert.ok(P.copyItems(h, [hb(9)])[0].ref === undefined, "Mass ohne seine Wand kopiert: frei");
  assert.ok(P.contentBox({ ...h, items: [lines[0]] }).x1 === 2000, "Leitung zählt zum Inhalt");
  // Steigleitungen nach 5.110
  assert.deepStrictEqual(["STEIG_AUF", "STEIG_AB", "STEIG_DURCH"].map((k) => S2.SYM_BY_KEY.get(k)?.group), ["Allgemein", "Allgemein", "Allgemein"], "Leitung nach oben, unten, durchgehend");
}

// ---------- Schritt 4: Stückliste (CJ 24.10.2026) ----------
{
  const syms = [["STD", "bg"], ["STD", "bg"], ["SCH0", "bg"], ["STD", "l1"], ["LEUCHTE", "bg"]].map(([key, layer], i) => ({ id: 50 + i, type: "sym", layer, key, at: [i * 100, 0], r: 0 }));
  const sh = M.parseModel(file([plan([...syms, { id: 60, type: "line", layer: "bg", pts: [[0, 0], [100, 0]], kind: "decke" }], { bom: false })], 22)).sheets[0];
  assert.strictEqual(sh.bom, false, "Haken Stückliste aus bleibt gespeichert");
  assert.ok(!("bom" in M.parseModel(file([plan(syms, { bom: true })], 22)).sheets[0]), "Vorgabe (drucken) nicht gespeichert");
  assert.deepStrictEqual(P.bomOf(sh).map((r) => [r.key, r.n]), [["SCH0", 1], ["STD", 3], ["LEUCHTE", 1]], "Anzahl je Symbol, Reihenfolge der Palette, Leitungen zählen nicht");
  sh.layers.find((l) => l.id === "l1").show = false;
  assert.strictEqual(P.bomOf(sh).find((r) => r.key === "STD").n, 2, "ausgeblendete Ebene zählt nicht");
  assert.strictEqual(P.bomCsv(P.bomOf(sh)), "Gruppe;Symbol;Anzahl\r\nSchalter;Schalter Sch. 0, 1-polig;1\r\nSteckdosen;Steckdose T13 (Schutzkontakt);2\r\nLeuchten;Leuchte an Decke;1\r\n", "CSV mit Semikolon");
  assert.strictEqual(P.bomCsv([{ group: "A", label: 'x;"y"', n: 1 }]).split("\r\n")[1], 'A;"x;""y""";1', "CSV: Semikolon und Anführungszeichen maskiert");
}

// ---------- Geschwungene Leitung und PDF-Plan (CJ 24.10.2026) ----------
{
  const cur = { id: 70, type: "line", layer: "bg", pts: [[0, 0], [1000, 1000], [2000, 0]], kind: "flex", curve: true };
  const d = M.parseModel(file([plan([cur])], 23)), b = JSON.parse(M.serializeModel(d));
  assert.strictEqual(b.version, 23, "geschwungene Leitung: Version 23");
  assert.deepStrictEqual(b.sheets[0].items[0], cur, "curve gespeichert");
  assert.ok(!("curve" in P.cleanPlanObj({ ...cur, curve: "ja" }, 1)), "nur true gilt");
  assert.strictEqual(JSON.parse(M.serializeModel(M.parseModel(file([plan([{ ...cur, curve: undefined }])], 23)))).version, 22, "gerade Leitung bleibt Version 22");
  // Kurve läuft durch alle Punkte, Enden der Abschnitte = Punkte
  const sg = P.curveSegs(cur.pts);
  assert.strictEqual(sg.length, 2, "ein Bézier je Abschnitt");
  near(sg[0][0], [0, 0], "Anfang"); near(sg[0][3], [1000, 1000], "durch den Mittelpunkt"); near(sg[1][3], [2000, 0], "Ende");
  near(sg[0][2], [1000 - 2000 / 6, 1000], "Tangente am Scheitel waagrecht");
  near(P.bezAt(sg[0], 1).p, [1000, 1000], "bezAt t=1");
  // Treffer folgt der Kurve, nicht der Sehne
  const sh = d.sheets[0], top = P.bezAt(sg[0], 0.5).p;
  assert.ok(top[1] > 500 + 50, "Kurve liegt über der Sehne");
  assert.strictEqual(P.hitPlan(sh, sh.items, top, 10)?.id, 70, "Treffer auf der Kurve");
  assert.ok(P.linePts(cur).length > cur.pts.length && P.linePts({ ...cur, curve: undefined }) === cur.pts, "Linienzug nur bei Kurve angenähert");
  // Zwei Punkte geschwungen: Bogen mit Zwischenpunkt links, um 1/5 der Länge versetzt
  assert.deepStrictEqual(P.bowPts([[0, 0], [1000, 0]]), [[0, 0], [500, 200], [1000, 0]], "Bogen nach links");
  assert.deepStrictEqual(P.bowPts(cur.pts), cur.pts, "drei Punkte bleiben");
  // PDF-Plan je Plan-Blatt (wie Stringplan): bg mit Massstab, Fixpunkt und Drehung bleibt, PDF nur einmal gespeichert
  const bg = { asset: "pdf1", name: "Plaene.pdf", page: 2, w: 1190.55, h: 841.89, fix: [100, 700], mmPerPt: 50 * 25.4 / 72, rot: 2.5 };
  const raw = { ...JSON.parse(file([plan([], { bg }), plan([], { sid: 8, var: 2, bg: { ...bg, page: 3 } })], 23)), assets: { pdf1: { name: "Plaene.pdf", type: "application/pdf", data: "JVBERg==" } } };
  const e = M.parseModel(JSON.stringify(raw)), eb = JSON.parse(M.serializeModel(e));
  assert.strictEqual(eb.version, 23, "Plan mit PDF: Version 23");
  assert.deepStrictEqual([eb.sheets[0].bg, eb.sheets[1].bg.page], [bg, 3], "Hintergrund unverändert, je Stockwerk eigene Seite");
  assert.deepStrictEqual(Object.keys(eb.assets), ["pdf1"], "PDF einmal gespeichert");
  assert.ok(!M.serializeModel(e, { noAssets: true }).includes("JVBERg"), "Zwischenspeicher ohne PDF");
  assert.deepStrictEqual(M.parseModel(M.serializeModel(e, { noAssets: true })).sheets[0].bg.asset, undefined, "fehlende PDF: Massstab und Fixpunkt bleiben, asset fehlt");
  // PDF-Plan eigener Umschalter (CJ 26.10.2026): bgOff und Deckkraft bgOp am Blatt, Vorgabe 60 % wird nicht gespeichert
  const r2 = { ...raw, sheets: [plan([], { bg, bgOff: true, bgOp: 30 }), plan([], { sid: 8, var: 2, bg, bgOff: false, bgOp: 60 }), plan([], { sid: 9, var: 3, bgOp: 5 })] };
  const s2 = JSON.parse(M.serializeModel(M.parseModel(JSON.stringify(r2)))).sheets;
  assert.deepStrictEqual(s2.map((s) => [s.bgOff, s.bgOp]), [[true, 30], [undefined, undefined], [undefined, undefined]], "bgOff/bgOp bereinigt");
}

console.log("test_plan: alles ok");
