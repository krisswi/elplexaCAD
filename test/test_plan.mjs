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
assert.strictEqual(M.VERSION, 33, "elplexa liest Version 33 (gespiegelte Symbole, 28.10.2026)");
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

// SchemaCAD v3 (ohne ELPLEXA, eigener Prozess) kennt kind "plan" nicht und lehnt Dateien mit Plan ab (seit Version 25 am Blatt, vorher über die Version)
const { execFileSync } = await import("node:child_process");
const v3 = execFileSync(process.execPath, ["--input-type=module", "-e", `import { parseModel, VERSION, KINDS, modBase } from "./src/model.js";
let e = ""; try { parseModel(${JSON.stringify(file([plan([])]))}); } catch (x) { e = x.message; }
console.log(JSON.stringify([VERSION, KINDS.includes("plan"), modBase({ kind: "plan" }), e]));`], { cwd: new URL("..", import.meta.url) }).toString();
assert.deepStrictEqual(JSON.parse(v3), [27, false, "schema", "Die Datei enthält einen Plan. Pläne öffnet nur elplexaCAD."]);

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
  const vd = P.itemDef({ key: "VERTEILER", w: 1000, t: 250 }, 50);
  assert.deepStrictEqual([vd.parts[0], vd.c], [["l", -10, 0, 10, 0], [0, 2.5]], "Verteilung 1000 × 250 mm bei 1:50 = 20 × 5 Papier-mm");
  assert.strictEqual(P.itemDef({ key: "VERTEILER" }, 20).parts[1][4], 10, "Vorgabe 200 mm tief bei 1:20 = 10 Papier-mm");
  // Leuchten 5.190 (CJ 26.10.2026): Spots HV/LED/ELV, Notlicht, Balkenleuchte mit Länge in mm; neue Symbole = Version 24
  for (const k of ["EXIT_L", "EXIT_R", "EXIT_DL", "EXIT_DR", "EXIT_UL", "EXIT_UR", "EXIT_D", "HV", "HV_WEB", "LED_WEB_TR", "ELV_EB_TR", "NOTL_D", "NOTL_WEB_TR", "FL", "RASTER", "SPIEGEL", "DAUER"]) assert.ok(S2.SYM_BY_KEY.has(k), k);
  assert.deepStrictEqual([c({ key: "FL", w: 1500 }).w, c({ key: "FL", t: 300 }).t, P.itemDef({ key: "FL", w: 1500 }, 50).parts[0]], [1500, undefined, ["l", -15, 0, 15, 0]], "FL: Länge in mm, ohne Breite");
  assert.strictEqual(JSON.parse(M.serializeModel(M.parseModel(file([plan([{ id: 50, type: "sym", layer: "bg", key: "NOTL", at: [0, 0], r: 0 }])], 24)))).version, 24, "Notleuchte: Version 24");
  assert.strictEqual(JSON.parse(M.serializeModel(M.parseModel(file([plan([{ id: 50, type: "sym", layer: "bg", key: "LED", at: [0, 0], r: 0 }])], 21)))).version, 21, "alte LED bleibt Version 21");
  // Hinweis (CJ 26.10.2026): Kasten mit Zeilen oben/unten/Kabel, oben bleibt oben auch gedreht, Linie zum Ziel
  const hw = (o) => tx({ key: "VERWEIS", fu: "UV EG", nr: "11X4", ...o });
  for (const r of [0, 180]) assert.ok(hw({ r })[0].s === "UV EG" && hw({ r })[0].at[1] > hw({ r })[1].at[1], `oben bleibt oben (r ${r})`);
  const rp = P.itemDef({ key: "VERWEIS", fu: "UV EG", nr: "11X4", r: 0 }, 50).parts;
  assert.ok(!rp.some((q) => q[0] === "l" && q[1] === 0 && q[2] === 0) && rp.filter((q) => q[0] === "l").length === 1, "ohne Zeiger (Vorgabe seit 28.10.2026): nur Trennstrich");
  const rz = P.itemDef({ key: "VERWEIS", fu: "UV EG", nr: "11X4", r: 0, zg: true }, 50).parts;
  assert.ok(rz.some((q) => q[0] === "l" && q[1] === 0 && q[2] === 0) && rz.filter((q) => q[0] === "l").length === 2, "mit Zeiger (zg): Linie zum Ziel und Trennstrich");
  assert.deepStrictEqual([c({ key: "VERWEIS", zg: true }).zg, c({ key: "VERWEIS", zg: false }).zg, c({ key: "STD", zg: true }).zg], [true, undefined, undefined], "zg nur am Verweis, nur wenn an");
  assert.strictEqual(JSON.parse(M.serializeModel(M.parseModel(file([plan([{ id: 50, type: "sym", layer: "bg", key: "VERWEIS", at: [0, 0], r: 0, zg: true }])], 33)))).version, 33, "Verweis mit Zeiger: Version 33");
  // alte Pläne (bis Version 23): vorausgefüllte Höhe 110 an Steckdosen und 200 an Wandleuchten fällt weg
  const old = M.parseModel(file([plan([{ id: 50, type: "sym", layer: "bg", key: "STD", at: [0, 0], r: 0, h: 110 }, { id: 51, type: "sym", layer: "bg", key: "LED_W", at: [0, 0], r: 0, h: 200 }, { id: 52, type: "sym", layer: "bg", key: "STD", at: [0, 0], r: 0, h: 120 }])], 23)).sheets[0].items;
  assert.deepStrictEqual(old.map((i) => i.h), [undefined, undefined, 120], "alte Vorgabehöhen weg, eigene bleibt");
  assert.strictEqual(JSON.parse(M.serializeModel(M.parseModel(file([plan([{ id: 50, type: "sym", layer: "bg", key: "STD2", at: [0, 0], r: 0 }])], 24)))).version, 24, "2-fach-Steckdose: Version 24");
  assert.strictEqual(tx({ key: "VERWEIS", r: 180, fu: "F3", nr: "2" })[0].a, 0, "Verweis F3 / 2 nie auf dem Kopf");
  // Schalterhebel ragen nicht in die Wand (y ≥ 0), Aufputz-Halbkreis passt zum Kreis
  for (const d of S2.PLAN_SYMS.filter((x) => x.wall)) assert.ok(d.parts.filter((q) => q[0] === "l").every((q) => q[2] >= -1e-9 && q[4] >= -1e-9), `${d.key}: nichts unter der Wandfläche`);
  for (const k of ["SCH3", "SCH6"]) { const d = S2.SYM_BY_KEY.get(k), c = d.parts.find((q) => q[0] === "c"); assert.ok(d.ap[1] === `M0,${c[2] + c[3]}A${c[3]} ${c[3]} 0 0 0 0,${c[2] - c[3]}Z` && d.c[1] === c[2], `${k}: Aufputz (rechte Hälfte) und Mitte am Kreis`); }
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
  assert.throws(() => M.parseModel(file([plan(lines)], 34)), /neueren Version/, "Version 34 abgelehnt");
  const cl = (o) => P.cleanPlanObj({ type: "line", layer: "bg", ...o }, 1);
  assert.strictEqual(cl({ pts: [[0, 0], [0, 0.1]] }), null, "Leitung mit einem Punkt abgelehnt");
  assert.deepStrictEqual(cl({ pts: [[0, 0], [0, 0], [100, 0]], kind: "xy", col: "#0068C9" }), { id: 1, type: "line", layer: "bg", pts: [[0, 0], [100, 0]], kind: "decke" }, "doppelte Punkte weg, unbekannte Art = Decke, Farbe = Vorgabe nicht gespeichert");
  assert.strictEqual(cl({ pts: [[0, 0], [100, 0]], col: "rot" }).col, undefined, "ungültige Farbe weg");
  // Farben nach 5.100: Vorgabe Leitung blau, Symbol nach Kategorie, Mauern schwarz
  assert.strictEqual(P.LINE_COL, "#0068c9", "Leitungen: Vorgabe blau (CJ)");
  const it = (key) => ({ type: "sym", key });
  assert.deepStrictEqual(["SCH0", "STD", "DOSE", "STEIG_AB"].map((k) => P.colOf(it(k))), ["#0068c9", "#0068c9", "#0068c9", "#0068c9"], "alle Symbole Vorgabe blau (CJ 24.10.2026)");
  assert.strictEqual(P.colOf({ type: "wall" }), "#000000", "Mauern schwarz");
  const y = { type: "sym", key: "STD" }; P.setCol(y, "#22862A"); assert.strictEqual(y.col, "#22862a", "eigene Farbe gespeichert"); P.setCol(y, "#0068c9"); assert.ok(!("col" in y), "zurück auf Vorgabe: Feld weg");
  const wl = { type: "wall" }; P.setCol(wl, "#ed3f2a"); assert.ok(!("col" in wl), "Wand bekommt keine Farbe");
  assert.strictEqual(P.PLAN_COLS.length, 9, "9 Farben aus 5.100");
  // Kräftigere Töne (CJ 27.10.2026): nur die Vorgabe ändert, gespeicherte bisherige Töne bleiben und heissen «(bisher)»
  const alt = M.parseModel(file([plan([{ id: 70, type: "line", layer: "l1", pts: [[0, 0], [1, 0]], kind: "decke", col: "#ed3f2a" }, { id: 71, type: "sym", layer: "l1", key: "STD", at: [0, 0], r: 0, col: "#3fbbeb" }])], 24)).sheets[0].items;
  assert.deepStrictEqual(alt.map((i) => i.col), ["#ed3f2a", "#3fbbeb"], "gespeicherte Farben bleiben");
  assert.deepStrictEqual([P.colName("#3fbbeb"), P.colName("#d4141c"), P.colName("#123456")], ["Blau (bisher)", "Rot", "#123456"]);
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
  assert.strictEqual(P.bomCsv(P.bomOf(sh)), "Gruppe;Symbol;Anzahl\r\nSchalter;Schalter Sch. 0, 1-polig, UP;1\r\nSteckdosen;Steckdose T13 (Schutzkontakt), UP;2\r\nLeuchten;Leuchte an Decke;1\r\n", "CSV mit Semikolon");
  // AP/UP getrennt (CJ 26.10.2026): UP zuerst, ap nur bei Symbolen mit Aufputz-Variante
  const apSh = M.parseModel(file([plan([["STD", true], ["STD", false], ["STD", true], ["LEUCHTE", true]].map(([key, ap], i) => ({ id: 70 + i, type: "sym", layer: "bg", key, at: [i * 100, 0], r: 0, ap })))], 27)).sheets[0];
  assert.ok(!("ap" in apSh.items.find((i) => i.key === "LEUCHTE")), "Leuchte ohne Aufputz-Variante: ap fällt weg");
  assert.deepStrictEqual(P.bomOf(apSh).map((r) => [r.label, r.n, !!r.ap]), [["Steckdose T13 (Schutzkontakt), UP", 1, false], ["Steckdose T13 (Schutzkontakt), AP", 2, true], ["Leuchte an Decke", 1, false]], "Stückliste getrennt UP/AP");
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
  // B-Spline (CJ 26.10.2026): Punkte = Steuerpunkte, Kurve durch Anfang und Ende, nicht durch den Mittelpunkt, ein Bézier je Abschnitt
  const sg = P.curveSegs(cur.pts);
  assert.strictEqual(sg.length, 2, "ein Bézier je Abschnitt");
  near(sg[0][0], [0, 0], "Anfang"); near(sg[1][3], [2000, 0], "Ende");
  near(sg[0][3], [1000, 4000 / 6], "Scheitel unter dem Steuerpunkt (nicht hindurch)"); near(sg[0][3], sg[1][0], "Abschnitte stossen aneinander");
  near(sg[0][2], [1000 - 2000 / 6, 4000 / 6], "Tangente am Scheitel waagrecht");
  near(P.bezAt(sg[0], 1).p, sg[0][3], "bezAt t=1");
  // kein Anfangsradius: Anfang, erster Kontrollpunkt und zweiter liegen auf der Geraden zum zweiten Punkt
  const cr = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  assert.ok(Math.abs(cr(sg[0][0], sg[0][1], cur.pts[1])) < 1e-6 && Math.abs(cr(sg[0][0], sg[0][2], cur.pts[1])) < 1e-6, "erstes Stück beginnt gerade");
  // zwei Punkte: Gerade
  const g2 = P.curveSegs([[0, 0], [1000, 0]]);
  assert.ok(g2.length === 1 && g2[0].every((q) => Math.abs(q[1]) < 1e-9), "zwei Punkte geschwungen = Gerade");
  // nie wellig: Zickzack-Punkte ergeben eine Kurve ohne Ausschlag über die Punkte hinaus und mit Krümmung nur an den Ecken der Punkte
  const zz = [[0, 0], [1000, 300], [2000, 0], [3000, 300], [4000, 0]], lp = P.linePts({ pts: zz, curve: true });
  assert.ok(lp.every((q) => q[1] >= -1e-6 && q[1] <= 300 + 1e-6), "Kurve bleibt zwischen den Punkten");
  const zs = P.linePts({ pts: [[0, 0], [1000, 0], [2000, 50], [3000, 50]], curve: true }), dy = zs.slice(1).map((q, i) => q[1] - zs[i][1]);
  assert.ok(dy.every((d) => d >= -1e-6), "steigende Punkte: Kurve fällt nie (keine Welle)");
  // Treffer folgt der Kurve, nicht der Sehne
  const sh = d.sheets[0], top = P.bezAt(sg[0], 0.5).p;
  assert.ok(top[1] > 300, "Kurve liegt über der Sehne Anfang–Ende");
  assert.strictEqual(P.hitPlan(sh, sh.items, top, 10)?.id, 70, "Treffer auf der Kurve");
  assert.ok(P.linePts(cur).length > cur.pts.length && P.linePts({ ...cur, curve: undefined }) === cur.pts, "Linienzug nur bei Kurve angenähert");
  assert.strictEqual(P.bowPts, undefined, "kein Bogenpunkt mehr");
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

// ---------- Fang an Symbolen (CJ 26.10.2026) ----------
{
  // Schalter: Mitte = Mitte des Kreises (vorher 0,2 mm Papier darunter), auch gedreht
  for (const key of ["SCH0", "SCH0_2", "TASTER", "DIMMER", "STOREN", "SCH_LAMPE", "SCH3", "SCH6"]) {
    const d = S2.SYM_BY_KEY.get(key), circ = d.parts.find((q) => q[0] === "c");
    assert.deepStrictEqual(d.c, [circ[1], circ[2]], `${key}: Mitte = Kreismitte`);
  }
  near(P.symCenter({ key: "SCH0", at: [1000, 0], r: 90 }, 50), [1000 - 2.2 * 50, 0], "Schalter gedreht: Mitte mitgedreht");
  // Schalter und Steckdosen: vier Fangpunkte oben, rechts, unten, links am Rand (Kreis bzw. Bogen), drehen mit R
  const sw = P.symSnaps({ key: "SCH0", at: [1000, 0], r: 0 }, 50);
  assert.deepStrictEqual(sw, { pts: [[1000, 185], [1075, 110], [1000, 35], [925, 110]], segs: [] }, "Schalter: vier Punkte am Kreis (r 1,5 mm × 50, CJ 27.10.2026)");
  // Schalter so gross wie Steckdosen (CJ 27.10.2026): Kreis so breit wie der Bogen, alle Schalter-Varianten gleich; KOMBI seit 28.10.2026 auch
  for (const d of S2.PLAN_SYMS.filter((x) => x.group === "Schalter")) { const c = d.parts.find((q) => q[0] === "c"); assert.ok(c[3] === 1.5 && d.pin[2] === 1.5 && (!d.ap || d.ap[1].includes("A1.5 1.5")), `${d.key}: Kreis, Fang und Aufputz r 1,5`); }
  assert.strictEqual(S2.SYM_BY_KEY.get("KOMBI").parts.find((q) => q[0] === "c")[3], 1.5, "KOMBI: Kreis so gross wie bei den Schaltern");
  const sw90 = P.symSnaps({ key: "SCH0", at: [1000, 0], r: 90 }, 50);
  sw90.pts.forEach((q, i) => near(q, [1000 - (sw.pts[i][1] - 0), sw.pts[i][0] - 1000], `Schalter um 90° gedreht, Punkt ${i}`));
  const so = P.symSnaps({ key: "STD", at: [0, 0], r: 0 }, 50);
  assert.deepStrictEqual(so.pts, [[0, 0], [75, 195], [0, 120], [-75, 195]], "Steckdose: hinten am Stiel (CJ 28.10.2026), Bogenenden, Querstrich");
  assert.deepStrictEqual(P.symSnaps({ key: "STD", at: [0, 0], r: 0, m: true }, 50).pts, [[0, 0], [-75, 195], [0, 120], [75, 195]], "Steckdose gespiegelt");
  assert.deepStrictEqual(P.symSnaps({ key: "IT_RJ", at: [0, 0], r: 0 }, 50).pts, [[0, 0], [75, 180], [0, 120], [-75, 180]], "IT-Dose: hinten am Stiel wie die Steckdose");
  assert.deepStrictEqual(P.symSnaps({ key: "KOMBI", at: [0, 0], r: 0 }, 50).pts, [[0, 35], [75, 260], [0, 185], [-75, 260]], "KOMBI: hinten am Schalterkreis");
  assert.deepStrictEqual(P.symSnaps({ key: "ANSCHLUSS", at: [0, 0], r: 0 }, 50).pts, [[-70, -70]], "Anschluss Elektro: Fang am Kreis (CJ 28.10.2026)");
  for (const d of S2.PLAN_SYMS.filter((x) => ["Schalter", "Steckdosen"].includes(x.group))) assert.strictEqual(P.symSnaps({ key: d.key, at: [0, 0], r: 0 }, 50).pts.length, 4, `${d.key}: vier Fangpunkte`);
  assert.deepStrictEqual(P.symSnaps({ key: "LEUCHTE", at: [500, 500], r: 30 }, 50), { pts: [[500, 500]], segs: [] }, "Leuchte: Fang an der Mitte");
  // Abzweigdose: alle Seiten fangen
  const ab = P.symSnaps({ key: "DOSE", at: [0, 0], r: 0 }, 50);
  assert.deepStrictEqual(ab, { pts: [], segs: [[[-75, -75], [75, -75]], [[75, -75], [75, 75]], [[75, 75], [-75, 75]], [[-75, 75], [-75, -75]]] }, "Abzweigdose: vier Seiten");
  assert.deepStrictEqual(P.snapPlan({}, [], [30, 80], { grid: 10, tol: 20, segs: ab.segs }), { x: 30, y: 75, snap: "edge" }, "Leitung rastet auf der oberen Seite");
  assert.deepStrictEqual(P.snapPlan({}, [], [-90, -20], { grid: 10, tol: 20, segs: ab.segs }), { x: -75, y: -20, snap: "edge" }, "… und auf der linken");
  assert.deepStrictEqual(P.snapPlan({}, [], [0, 0], { grid: 10, tol: 20, segs: ab.segs }), { x: 0, y: 0, snap: "grid" }, "Mitte der Dose: Raster");
  assert.deepStrictEqual(P.snapPlan({}, [], [1008, 175], { grid: 10, tol: 20, extra: sw.pts }), { x: 1000, y: 185, snap: "end" }, "Leitung rastet am oberen Fangpunkt des Schalters");
}
// ---------- Textgrösse gesamt und einzeln (CJ 27.10.2026) ----------
{
  const its = [{ id: 60, type: "sym", layer: "bg", key: "SCH0", at: [0, 0], r: 0, txt: "E1", tf: 1.5 }, { id: 61, type: "sym", layer: "bg", key: "STD", at: [500, 0], r: 0, txt: "K2" },
    { id: 62, type: "sym", layer: "bg", key: "VERWEIS", at: [0, 900], r: 0, fu: "UV EG", tf: 1 }, { id: 63, type: "dim", layer: "bg", a: [0, 0], b: [1000, 0], off: 300, tf: 0.8 }];
  const d = M.parseModel(file([plan(its, { tf: 1.2 })], 27)), out = JSON.parse(M.serializeModel(d));
  assert.strictEqual(out.version, 28, "Textgrösse: Version 28");
  assert.strictEqual(out.sheets[0].tf, 1.2, "Gesamtwert am Blatt");
  assert.deepStrictEqual(out.sheets[0].items.map((i) => i.tf), [1.5, undefined, 1, 0.8], "Einzelwerte bleiben, auch 1 (überschreibt den Plan)");
  const s0 = d.sheets[0], [a, b, v, m] = s0.items;
  assert.deepStrictEqual([P.tfOf(a, s0), P.tfOf(b, s0), P.tfOf(v, s0), P.tfOf(m, s0)], [1.5, 1.2, 1, 0.8], "Einzelwert vor Gesamtwert");
  const size = (it, tf) => P.symTexts(it, 50, String, tf).find((t) => t.label).size;
  assert.strictEqual(size(b, 1), 1.8 * 50, "Vorgabe 1,8 mm Papier");
  assert.ok(Math.abs(size(b, 1.2) - 1.8 * 1.2 * 50) < 1e-9 && Math.abs(size(a, 1.5) - 1.8 * 1.5 * 50) < 1e-9, "Beschriftung wächst mit");
  const r1 = P.refBox(v, 1), r2 = P.refBox(v, 2);
  assert.ok(r2.w > r1.w && r2.h > r1.h && r2.th === 2 * r1.th, "Verweis: Kasten und Zeilen wachsen mit");
  assert.deepStrictEqual(P.symTexts(b, 50, String, 2).filter((t) => !t.label), P.symTexts(b, 50, String, 1).filter((t) => !t.label), "Zusatztexte im Symbol bleiben fest");
  // Unsinnige Werte fallen weg, 1 am Blatt wird nicht gespeichert
  const z = M.parseModel(file([plan([{ ...its[1], tf: 0 }, { ...its[0], id: 64, tf: "2" }], { tf: 1 })], 27)).sheets[0];
  assert.deepStrictEqual([z.tf, z.items[0].tf, z.items[1].tf], [undefined, undefined, undefined], "tf 0, Text und Blatt 1 fallen weg");
  assert.strictEqual(JSON.parse(M.serializeModel(M.parseModel(file([plan(kueche())], 24)))).version, 20, "ohne Textgrösse bleibt die Version");
}
// ---------- Kanal/Trasse (CJ 27.10.2026) ----------
{
  const near = (p, q, t = 1e-6) => Math.hypot(p[0] - q[0], p[1] - q[1]) < t;
  // Gehrung: L-Kanal 300 mm breit, rechts dann hoch. Aussenecke rechts unten, Innenecke links oben, je 150 mm von beiden Mittellinien
  const g = P.ductSides([[0, 0], [2000, 0], [2000, 1000]], 300);
  assert.ok(near(g.L[1], [1850, 150]) && near(g.R[1], [2150, -150]), "Gehrung: Ecken im Schnitt der Kanten");
  assert.ok(near(g.L[0], [0, 150]) && near(g.R[0], [0, -150]) && near(g.L[2], [1850, 1000]) && near(g.R[2], [2150, 1000]), "Enden senkrecht zur Mittellinie");
  const g45 = P.ductSides([[0, 0], [1000, 0], [2000, 1000]], 200), d45 = Math.hypot(g45.L[1][0] - 1000, g45.L[1][1]);
  assert.ok(Math.abs(d45 - 100 / Math.cos(Math.PI / 8)) < 1e-3, "Knick 45°: Abstand w/2 / cos 22,5°");
  const sp = P.ductSides([[0, 0], [1000, 0], [0, 10]], 200);
  assert.ok(Math.hypot(sp.L[1][0] - 1000, sp.L[1][1]) <= 4 * 100 + 1e-6, "sehr spitzer Knick: Ecke begrenzt");
  assert.ok(near(P.ductSides([[0, 0], [500, 0], [1000, 0]], 100).L[1], [500, 50]), "gerade weiter: kein Knick");
  // Länge der Mittellinie
  assert.strictEqual(P.ductLen({ pts: [[0, 0], [2000, 0], [2000, 1000]] }), 3000, "Länge = Summe der Abschnitte");
  // Laden und Speichern, Version 29, Vorgaben nicht gespeichert
  const its = [{ id: 70, type: "duct", layer: "bg", pts: [[0, 0], [2000, 0], [2000, 1000]], w: 300, hatch: "kreuz", col: "#C9A800", ecol: "#d4141c", txt: " Kabelrinne 300 " },
    { id: 71, type: "duct", layer: "l1", pts: [[0, 2000], [4000, 2000]], w: 600, hatch: "punkte", col: "#0068c9", ecol: "#000000" },
    { id: 72, type: "duct", layer: "bg", pts: [[0, 3000], [1500, 3000]], w: 300, hatch: "quatsch" }];
  const d = M.parseModel(file([plan(its)], 28)), out = JSON.parse(M.serializeModel(d));
  assert.strictEqual(out.version, 29, "Kanal: Version 29");
  assert.deepStrictEqual(out.sheets[0].items[0], { id: 70, type: "duct", layer: "bg", pts: [[0, 0], [2000, 0], [2000, 1000]], w: 300, txt: "Kabelrinne 300" }, "Vorgaben (Kreuz, Gelb, Rot) fallen weg");
  assert.deepStrictEqual([out.sheets[0].items[1].hatch, out.sheets[0].items[1].col, out.sheets[0].items[1].ecol], ["punkte", "#0068c9", "#000000"], "eigene Schraffur und Farben bleiben");
  assert.strictEqual(out.sheets[0].items[2].hatch, undefined, "unbekannte Schraffur → Kreuz");
  assert.throws(() => M.parseModel(file([plan([{ id: 73, type: "duct", layer: "bg", pts: [[0, 0]], w: 100 }])], 29)), /defektes Objekt/, "Kanal mit einem Punkt");
  assert.throws(() => M.parseModel(file([plan([{ id: 73, type: "duct", layer: "bg", pts: [[0, 0], [1, 0]], w: 0 }])], 29)), /defektes Objekt/, "Kanal ohne Breite");
  // Stückliste: je Breite, Länge in m, nur sichtbare Ebenen; CSV mit Spalte Länge
  const sh = d.sheets[0];
  assert.deepStrictEqual(P.bomOf(sh).map((r) => [r.label, r.group, r.n, r.m]), [["Kanal 300 mm", "Kanäle", 2, 4.5], ["Kanal 600 mm", "Kanäle", 1, 4]], "Kanäle je Breite, Gesamtlänge m");
  assert.strictEqual(P.bomCsv(P.bomOf(sh)), "Gruppe;Symbol;Anzahl;Länge m\r\nKanäle;Kanal 300 mm;2;4,50\r\nKanäle;Kanal 600 mm;1;4,00\r\n", "CSV mit Länge");
  sh.layers[1].show = false;
  assert.deepStrictEqual(P.bomOf(sh).map((r) => r.label), ["Kanal 300 mm"], "ausgeblendete Ebene zählt nicht");
  const mix = P.bomOf({ ...sh, items: [...sh.items, { id: 80, type: "sym", layer: "bg", key: "STD", at: [0, 0], r: 0 }] });
  assert.strictEqual(P.bomCsv(mix).split("\r\n")[1], "Steckdosen;Steckdose T13 (Schutzkontakt), UP;1;", "Symbole zuerst, Länge leer");
  // Schraffur: alle Linien im Kanal, Abstand nie enger als 1,5 mm Papier, Arten
  for (const [w, den] of [[200, 50], [600, 50], [20, 50], [600, 100]]) for (const [h] of P.HATCHES) {
    const it = { pts: [[0, 0], [3000, 0], [3000, 2000]], w, hatch: h }, x = P.ductGeom(it, den);
    const inside = (p) => p[0] >= -w / 2 - 1e-6 && p[0] <= 3000 + w / 2 + 1e-6 && p[1] >= -w / 2 - 1e-6 && p[1] <= 2000 + 1e-6 && (p[0] >= 3000 - w / 2 - 1e-6 || p[1] <= w / 2 + 1e-6);
    assert.ok(x.lines.every(([a, b]) => inside(a) && inside(b)) && x.dots.every(inside), `${h} ${w} mm: Schraffur bleibt im Kanal`);
    assert.strictEqual(x.lines.length > 0 || x.dots.length > 0, h !== "ohne", `${h} ${w} mm: ${h === "ohne" ? "leer" : "gezeichnet"}`);
  }
  const gi = P.ductGeom({ pts: [[0, 0], [3000, 0], [3000, 2000]], w: 600, hatch: "gitter" }, 50).lines;
  assert.ok(gi.length > 4 && gi.every(([a, b]) => Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - 600) < 1e-3), "Gitter: nur ganze Sprossen");
  assert.strictEqual(P.ductStep(20, 50), 75, "schmal: 1,5 mm Papier");
  assert.strictEqual(P.ductStep(600, 50), 300, "breit: halbe Breite");
  const n = (w) => P.ductGeom({ pts: [[0, 0], [6000, 0]], w, hatch: "diag" }, 50).lines.length;
  assert.ok(n(600) < n(200) * 1.5 && n(200) <= n(60), "breite Kanäle nicht dichter schraffiert");
  // Treffer, Verschieben, Kopieren, Rahmenwahl
  const k0 = sh.items[0];
  assert.strictEqual(P.hitPlan(sh, [k0], [1000, 140], 5)?.id, 70, "Treffer auf der ganzen Breite");
  assert.strictEqual(P.hitPlan(sh, [k0], [1000, 200], 5), null, "daneben kein Treffer");
  P.moveItems(sh, [k0], 100, 50);
  assert.deepStrictEqual(k0.pts[0], [100, 50], "verschieben");
  const pc = P.pasteItems(sh, P.copyItems(sh, [k0]), 10, 0, (() => { let i = 900; return () => ++i; })());
  assert.deepStrictEqual([pc[0].type, pc[0].w, pc[0].pts[0], pc[0].txt], ["duct", 300, [110, 50], "Kabelrinne 300"], "kopieren");
  assert.ok(P.inBox(sh, k0, { x0: 0, y0: 0, x1: 2200, y1: 1100 }) && !P.inBox(sh, k0, { x0: 0, y0: 0, x1: 2000, y1: 1100 }), "Rahmenwahl: alle Punkte");
  // Beschriftung: über dem längsten Abschnitt, lesbar
  const lb = P.ductLabel({ pts: [[0, 0], [2000, 0], [2000, 500]], w: 300 }, 50);
  assert.ok(lb.at[0] === 1000 && lb.at[1] > 150 && lb.a === 0, "Beschriftung über dem langen Abschnitt");
  assert.strictEqual(P.ductLabel({ pts: [[2000, 0], [0, 0]], w: 300 }, 50).a, 0, "nach links gezeichnet: Text nicht auf dem Kopf");
}
// ---------- Kommunikationssymbole (CJ 27.10.2026, Aufgaben Plan 6, Dateiversion 31) ----------
{
  const its = [{ id: 70, type: "sym", layer: "l1", key: "TEL_STD", at: [1000, 0], r: 0 }, { id: 71, type: "sym", layer: "l1", key: "IT_RJ4", at: [2000, 0], r: 0, num: "8" },
    { id: 72, type: "sym", layer: "l1", key: "KLINGEL", at: [500, 500], r: 90 }, { id: 73, type: "sym", layer: "l1", key: "IT_RJ", at: [3000, 0], r: 0, h: 30 }];
  const d = M.parseModel(file([plan(its)], 31)), out = JSON.parse(M.serializeModel(d));
  assert.strictEqual(out.version, 31, "Kommunikationssymbol: Version 31");
  assert.deepStrictEqual(out.sheets[0].items.map((i) => i.key), ["TEL_STD", "IT_RJ4", "KLINGEL", "IT_RJ"], "alle Symbole bleiben");
  assert.strictEqual(out.sheets[0].items[1].num, "8", "Anzahl am IT-Anschluss 4-fach änderbar");
  assert.strictEqual(out.sheets[0].items[3].h, undefined, "Standardhöhe 30 cm wird nicht gespeichert");
  assert.ok(JSON.parse(M.serializeModel(M.parseModel(file([plan([{ id: 70, type: "sym", layer: "l1", key: "STD", at: [0, 0], r: 0 }])], 31)))).version < 31, "ohne Kommunikationssymbol bleibt die Version tiefer");
  // Dateien im Projekt (30) dürfen die Version des Plans nicht senken
  const dp = M.parseModel(file([plan(its)], 31)); dp.project = { name: "A", folders: [{ id: "ab12cd", n: "Archiv" }], files: [] };
  assert.strictEqual(JSON.parse(M.serializeModel(dp)).version, 31, "Dateien im Projekt und Kommunikationssymbol: Version 31");
  assert.ok(P.bomOf(d.sheets[0]).some((r) => r.key === "IT_RJ4" && r.group === "Telefon/EDV" && r.n === 1), "Stückliste: Gruppe Telefon/EDV");
}
// ---------- Aderzahl an der Leitung (CJ 27.10.2026, Dateiversion 30) ----------
{
  const close = (p, q, e = 1e-3) => Math.hypot(p[0] - q[0], p[1] - q[1]) < e;
  const its = [{ id: 60, type: "line", layer: "l1", pts: [[0, 0], [2000, 0]], kind: "decke" },
    { id: 61, type: "line", layer: "bg", pts: [[0, 1000], [1000, 2000], [2000, 1000], [3000, 2000]], kind: "boden", curve: true, col: "#d4141c" },
    { id: 62, type: "ader", line: 60, t: 0.25, txt: " 5x1.5 " }, { id: 63, type: "ader", line: 61, t: 0.5, txt: "", tf: 1.5 },
    { id: 64, type: "ader", line: 99, t: 0.5, txt: "3" }, { id: 65, type: "ader", line: 60, t: 7, txt: "4" }];
  const d = M.parseModel(file([plan(its)], 30)), out = JSON.parse(M.serializeModel(d)), sh = d.sheets[0];
  assert.strictEqual(out.version, 30, "Aderzahl: Version 30");
  assert.deepStrictEqual(out.sheets[0].items.filter((i) => i.type === "ader"), [{ id: 62, type: "ader", line: 60, t: 0.25, txt: "5x1.5" }, { id: 63, type: "ader", line: 61, t: 0.5, txt: "3", tf: 1.5 }, { id: 65, type: "ader", line: 60, t: 1, txt: "4" }],
    "Text getrimmt, leer = 3, t auf 0 bis 1 begrenzt, ohne Leitung fällt weg");
  assert.throws(() => M.parseModel(file([plan([{ id: 1, type: "ader", t: 0.5, txt: "3" }])], 30)), /defektes Objekt/, "Aderzahl ohne Leitung-id");
  assert.strictEqual(M.parseModel(file([plan(its.slice(0, 2))], 29)) && JSON.parse(M.serializeModel(M.parseModel(file([plan(its.slice(0, 2))], 29)))).version < 30, true, "ohne Aderzahl bleibt die Version tiefer");
  const [a1, a2] = sh.items.filter((i) => i.type === "ader"), l0 = sh.items.find((i) => i.id === 60), l1 = sh.items.find((i) => i.id === 61);
  // Lage: gerade Leitung bei 25 %, Strich senkrecht (waagrechte Leitung: Strich senkrecht, Text oben), Ebene der Leitung
  const g = P.aderGeom(l0, a1, 50);
  assert.ok(close(g.p, [500, 0]) && close(g.a, [500, -60]) && close(g.b, [500, 60]) && g.at[0] === 500 && g.at[1] > 60 && g.ang === 0, "gerade: Strich senkrecht, Text darüber");
  assert.strictEqual(P.itemLayer(sh, a1), "l1", "Ebene der Leitung");
  // geschwungen: Strich senkrecht zur Tangente der Kurve
  const g2 = P.aderGeom(l1, a2, 50, P.tfOf(a2, sh)), at = P.aderAt(l1, 0.5), v = [g2.b[0] - g2.a[0], g2.b[1] - g2.a[1]];
  assert.ok(Math.abs(v[0] * at.u[0] + v[1] * at.u[1]) < 1e-6 && Math.abs(Math.hypot(...v) - 120) < 1e-6, "Kurve: Strich senkrecht zur Tangente");
  assert.ok(Math.abs(g2.size - 2 * 1.5 * 50) < 1e-9, "Textgrösse einzeln (tf)");
  const q = P.linePts(l1), mid = P.polyNear(q, at.p);
  assert.ok(mid.d < 1e-6 && Math.abs(mid.t - 0.5) < 1e-3, "Punkt liegt auf der Kurve, Anteil zurückgerechnet");
  // senkrechte Leitung: Text links (lesbar von rechts), nicht auf dem Kopf
  const gv = P.aderGeom({ pts: [[0, 1000], [0, 0]] }, { t: 0.5, txt: "3" }, 50);
  assert.ok(gv.at[0] < 0 && Math.abs(gv.ang) === 90, "senkrecht: Text links, gedreht lesbar");
  // wandert mit: Punkt der Leitung verschieben, Anteil bleibt
  l0.pts[1] = [4000, 0];
  assert.ok(close(P.aderAt(l0, a1.t).p, [1000, 0]), "Leitung länger: Strich bleibt bei 25 %");
  P.moveItems(sh, [l0], 0, 500);
  assert.ok(close(P.aderAt(l0, a1.t).p, [1000, 500]) && a1.t === 0.25, "Leitung verschieben: Strich geht mit");
  // Ziehen allein: gleitet entlang der Leitung
  P.moveItems(sh, [a1], 1000, 300);
  assert.ok(Math.abs(a1.t - 0.5) < 1e-6, "Aderzahl allein verschieben: entlang der Leitung");
  // Treffer, Rahmen, Kopieren, Löschen
  const g3 = P.aderGeom(l0, a1, 50);
  assert.strictEqual(P.hitPlan(sh, sh.items, g3.b, 5)?.id, 62, "Treffer am Strich vor der Leitung");
  assert.strictEqual(P.hitPlan(sh, sh.items, [3000, 500], 5)?.id, 60, "sonst die Leitung");
  assert.ok(P.inBox(sh, a1, { x0: 1900, y0: 400, x1: 2100, y1: 600 }), "Rahmenwahl: Punkt auf der Leitung");
  const clip = P.copyItems(sh, [l0]);
  assert.deepStrictEqual(clip.map((i) => i.type).sort(), ["ader", "ader", "line"], "Leitung kopieren nimmt ihre Aderzahlen mit");
  assert.deepStrictEqual(P.copyItems(sh, [a1]), [], "Aderzahl allein: nicht kopiert (wie Öffnung)");
  const pc = P.pasteItems(sh, clip, 10, 0, (() => { let i = 900; return () => ++i; })()), nl = pc.find((i) => i.type === "line");
  assert.ok(pc.filter((i) => i.type === "ader").every((i) => i.line === nl.id), "eingefügt an der neuen Leitung");
  P.deleteItem(sh, 60);
  assert.ok(!sh.items.some((i) => i.type === "ader" && i.line === 60), "Leitung löschen löscht ihre Aderzahlen");
  assert.ok(!P.layerUsed({ items: [{ type: "ader", line: 1 }] }, undefined), "Aderzahl zählt nicht als Objekt einer Ebene");
  const kd = [{ pts: [[0, 0], [2000, 0]], w: 300 }];
  assert.ok(P.inDuct(kd, [1000, 140]) && !P.inDuct(kd, [1000, 160]) && !P.inDuct([], [0, 0]), "Stelle im Kanal (halbe Breite)");
}

// ---------- Symbol an Symbol (CJ 27.10.2026) ----------
{
  const k = 50, sw = (id, x, r = 0, key = "SCH0") => ({ id, type: "sym", layer: "bg", key, at: [x, 0], r });
  assert.deepStrictEqual(P.symRim("SCH0"), { cx: 0, cy: 2.2, hx: 1.5, hy: 1.5, wall: true }, "Schalter: Kreis als Rand");
  assert.deepStrictEqual(P.symRim("DOSE"), { cx: 0, cy: 0, hx: 1.5, hy: 1.5, wall: false }, "Abzweigdose: Kasten");
  assert.strictEqual(P.symRim("LEUCHTE"), null, "Leuchte ohne Randpunkte");
  // zweiter Schalter rechts daneben: bündig (Kreis an Kreis, 3 mm Papier = 150 mm), auf der Wandlinie
  const s1 = sw(1, 0), r1 = P.symSnapTo([s1], "SCH3", [170, 30], k);
  assert.deepStrictEqual([r1.at, r1.r, r1.nb], [[150, 0], 0, 1], "rechts daneben, gleiche Linie");
  assert.deepStrictEqual(r1.c, [75, 110], "Berührpunkt am rechten Rand");
  // drei Schalter in einer Reihe: der dritte legt sich an den zweiten, nicht über ihn
  const s2 = sw(2, 150, 0, "SCH3");
  assert.deepStrictEqual(P.symSnapTo([s1, s2], "SCH6", [280, 10], k).at, [300, 0], "dritter: rechts an den zweiten");
  assert.strictEqual(P.symSnapTo([s1, s2], "SCH6", [160, 10], k), null, "belegte Lage (über dem zweiten): kein Fang, kein Überlappen");
  // Drehung: Nachbar gedreht (90°), das neue Symbol übernimmt sie und liegt entlang der gedrehten Wand
  const s3 = sw(3, 0, 90), r3 = P.symSnapTo([s3], "SCH0", [10, 160], k);
  assert.deepStrictEqual([r3.at, r3.r], [[0, 150], 90], "gedreht: gleiche Drehung, bündig");
  // zu weit weg: kein Fang; ohne Randpunkte: kein Fang
  assert.strictEqual(P.symSnapTo([s1], "SCH0", [400, 0], k), null, "weit weg: frei");
  assert.strictEqual(P.symSnapTo([s1], "LEUCHTE", [150, 0], k), null, "Symbol ohne Randpunkte rastet nicht");
  assert.strictEqual(P.symSnapTo([{ ...s1, key: "LEUCHTE" }], "SCH0", [150, 0], k), null, "Nachbar ohne Randpunkte");
  // Steckdose an Steckdose: Bogen an Bogen; Abzweigdose an Abzweigdose: Kasten an Kasten
  assert.deepStrictEqual(P.symSnapTo([{ ...s1, key: "STD" }], "STD2", [-140, 0], k).at, [-150, 0], "Steckdosen links daneben");
  assert.deepStrictEqual(P.symSnapTo([{ ...s1, key: "DOSE" }], "DOSE", [0, 140], k).at, [0, 150], "Abzweigdose oben an");
  assert.deepStrictEqual(P.symSnapTo([{ ...s1, key: "DOSE" }], "DOSE", [0, -140], k).at, [0, -150], "Abzweigdose unten an");
  assert.strictEqual(P.symSnapTo([s1], "SCH0", [0, -110], k), null, "Wandsymbol: unten ist die Wand, kein Fang");
  // Mischung Wand und frei: Mitten auf einer Linie
  assert.deepStrictEqual(P.symSnapTo([s1], "DOSE", [150, 100], k).at, [150, 110], "Abzweigdose neben Schalter: Mitte auf Höhe Kreismitte");
}
// ---------- Formen: Linie, Rechteck, Kreis (CJ 27.10.2026, Aufgaben Plan 21, Dateiversion 32) ----------
{
  const its = [{ id: 80, type: "shape", layer: "l1", k: "line", pts: [[0, 0], [3000, 0]], col: "#000000", lw: 0.35 },
    { id: 81, type: "shape", layer: "bg", k: "rect", x: 1000, y: 500, w: 2000, h: 1000, col: "#D4141C", lw: 0.7, d: true, fill: "#C9A800" },
    { id: 82, type: "shape", layer: "bg", k: "circle", x: 0, y: 0, r: 500, fill: "quatsch", lw: 0.33 },
    { id: 83, type: "shape", layer: "fremd", k: "line", pts: [[0, 0], [100, 100]], fill: "#0068c9" }];
  const d = M.parseModel(file([plan(its)], 32)), out = JSON.parse(M.serializeModel(d));
  assert.strictEqual(out.version, 32, "Form im Plan: Version 32");
  assert.deepStrictEqual(out.sheets[0].items, [{ id: 80, type: "shape", layer: "l1", k: "line", pts: [[0, 0], [3000, 0]] },
    { id: 81, type: "shape", layer: "bg", k: "rect", x: 1000, y: 500, w: 2000, h: 1000, col: "#d4141c", lw: 0.7, d: true, fill: "#c9a800" },
    { id: 82, type: "shape", layer: "bg", k: "circle", x: 0, y: 0, r: 500 },
    { id: 83, type: "shape", layer: "bg", k: "line", pts: [[0, 0], [100, 100]] }], "Vorgaben (schwarz, 0,35) fallen weg, unbekannte Stärke und Füllung weg, Linie ohne Füllung, fremde Ebene → aktive");
  assert.ok(JSON.parse(M.serializeModel(M.parseModel(file([plan([{ id: 70, type: "sym", layer: "l1", key: "STD", at: [0, 0], r: 0 }])], 32)))).version < 32, "ohne Form bleibt die Version tiefer");
  assert.throws(() => M.parseModel(file([plan([{ id: 84, type: "shape", layer: "bg", k: "rect", x: 0, y: 0, w: 0, h: 10 }])], 32)), /defektes Objekt/, "Rechteck ohne Breite");
  assert.throws(() => M.parseModel(file([plan([{ id: 84, type: "shape", layer: "bg", k: "line", pts: [[5, 5], [5, 5]] }])], 32)), /defektes Objekt/, "Linie ohne Länge");
  assert.throws(() => M.parseModel(file([plan([{ id: 84, type: "shape", layer: "bg", k: "circle", x: 0, y: 0 }])], 32)), /defektes Objekt/, "Kreis ohne Radius");
  const S0 = d.sheets[0], [ln, rc, ci] = S0.items;
  // neue Formen aus zwei Punkten (echte mm)
  assert.deepStrictEqual(P.planShape("rect", [3000, 2000], [1000, 500], "bg"), { type: "shape", layer: "bg", k: "rect", x: 1000, y: 500, w: 2000, h: 1500 }, "Rechteck aus Gegenecken");
  assert.deepStrictEqual(P.planShape("circle", [100, 100], [400, 500], "bg").r, 500, "Kreis: Radius bis zum Zeiger");
  assert.ok(P.shapeEmpty(P.planShape("rect", [0, 0], [0, 900], "bg")) && !P.shapeEmpty(ci), "leer: Rechteck ohne Fläche");
  // Treffer: Strich, gefüllt auch innen
  assert.strictEqual(P.hitPlan(S0, S0.items, [2000, 1000], 10), rc, "gefülltes Rechteck innen getroffen");
  assert.strictEqual(P.hitPlan(S0, [ci], [0, 0], 10), null, "Kreis ohne Füllung: innen nicht");
  assert.strictEqual(P.hitPlan(S0, [ci], [0, 505], 10), ci, "Kreis auf dem Umfang");
  assert.strictEqual(P.hitPlan(S0, [ln], [1500, 8], 10), ln, "Linie");
  // Rahmenwahl, Inhalt, Stückliste
  assert.ok(P.inBox(S0, rc, { x0: 900, y0: 400, x1: 3100, y1: 1600 }) && !P.inBox(S0, rc, { x0: 1100, y0: 400, x1: 3100, y1: 1600 }), "Rahmenwahl: ganz drin");
  assert.deepStrictEqual(P.contentBox({ ...S0, items: [rc, ci] }), { x0: -500, y0: -500, x1: 3000, y1: 1500 }, "Inhalt");
  assert.strictEqual(P.bomOf(S0).length, 0, "Formen nicht in der Stückliste");
  // verschieben, kopieren, drehen, Griffe, Länge
  P.moveItems(S0, [ln, rc, ci], 100, -50);
  assert.deepStrictEqual([ln.pts, [rc.x, rc.y], [ci.x, ci.y]], [[[100, -50], [3100, -50]], [1100, 450], [100, -50]], "verschieben");
  const pc = P.pasteItems(S0, P.copyItems(S0, [rc, ci]), 10, 20, (() => { let n = 200; return () => ++n; })());
  assert.deepStrictEqual(pc.map((i) => [i.id, i.x, i.y, i.fill]), [[201, 1110, 470, "#c9a800"], [202, 110, -30, undefined]], "kopieren mit Versatz");
  P.rotateShape(rc, 90); assert.deepStrictEqual([rc.x, rc.y, rc.w, rc.h], [1600, -50, 1000, 2000], "Rechteck dreht um die Mitte: Breite und Höhe getauscht");
  P.rotateShape(ln, 90); assert.deepStrictEqual(ln.pts, [[1600, -1550], [1600, 1450]], "Linie dreht um die Mitte");
  P.rotateShape(ln, 270); assert.deepStrictEqual(ln.pts, [[100, -50], [3100, -50]], "Shift+R zurück");
  const o = JSON.parse(JSON.stringify(rc)); P.dragShapeHandle(rc, o, 2, [3000, 3000]); assert.deepStrictEqual([rc.x, rc.y, rc.w, rc.h], [1600, -50, 1400, 3050], "Ecke ziehen, Gegenecke bleibt");
  P.dragShapeHandle(ci, JSON.parse(JSON.stringify(ci)), 0, [800, -50]); assert.strictEqual(ci.r, 700, "Kreis: Griff ändert den Radius");
  assert.ok(P.setShapeLen(ln, 1000) && ln.pts[1][0] === 1100, "Länge der Linie: Ende wandert");
  assert.strictEqual(P.shapeSnaps(ci).length, 5, "Fang am Kreis: Mitte und vier Punkte");
}
// ---------- Erdung und Blitzschutz (CJ 27.10.2026, Aufgaben Plan 20, Dateiversion 32) ----------
{
  const v = (its) => JSON.parse(M.serializeModel(M.parseModel(file([plan(its)], 32)))).version;
  assert.strictEqual(v([{ id: 90, type: "sym", layer: "l1", key: "PA_SCHIENE", at: [0, 0], r: 0 }]), 32, "Erdungssymbol: Version 32");
  assert.strictEqual(v([{ id: 90, type: "sym", layer: "l1", key: "HAK", at: [0, 0], r: 0, w: 500 }]), 32, "HAK: Version 32");
  for (const kind of ["fund", "erdl", "blitz"]) {
    const d = M.parseModel(file([plan([{ id: 91, type: "line", layer: "bg", pts: [[0, 0], [1000, 0]], kind }])], 32));
    assert.strictEqual(d.sheets[0].items[0].kind, kind, `Verlegeart ${kind} bleibt`);
    assert.strictEqual(JSON.parse(M.serializeModel(d)).version, 32, `Erdleitung ${kind}: Version 32`);
  }
  assert.ok(v([{ id: 91, type: "line", layer: "bg", pts: [[0, 0], [1000, 0]], kind: "flex" }]) < 32, "übrige Verlegearten: tiefer");
  const d = M.parseModel(file([plan([{ id: 90, type: "sym", layer: "l1", key: "ERDE", at: [0, 0], r: 0 }, { id: 92, type: "sym", layer: "l1", key: "SPD", at: [0, 0], r: 90 }])], 32));
  assert.deepStrictEqual(P.bomOf(d.sheets[0]).map((r) => [r.group, r.label]), [["Erdung/PA", "Erdung, allgemein"], ["Blitzschutz", "Überspannungsableiter (SPD)"]], "Stückliste: Gruppen Erdung/PA, Blitzschutz");
  assert.strictEqual(P.LINE_W.blitz, 0.7, "Blitzschutzleitung dick");
}
// ---------- Spiegeln (Taste S, CJ 28.10.2026, Dateiversion 33) ----------
{
  const k = 50, sw = (key, m, r = 0, at = [0, 0]) => ({ id: 1, type: "sym", layer: "l1", key, at, r, ...(m ? { m: true } : {}) });
  const n = P.itemDef(sw("SCH0"), k), g = P.itemDef(sw("SCH0", true), k);
  assert.deepStrictEqual(g.parts.filter((q) => q[0] === "l"), n.parts.filter((q) => q[0] === "l").map((q) => ["l", -q[1] + 0, q[2], -q[3] + 0, q[4]]), "Schalter: Hebel nach links");
  assert.strictEqual(P.itemDef(sw("STD", true), k).ap[1], "M0,3.9L-1.5,3.9A1.5 1.5 0 0 1 0,2.4Z", "Aufputz-Hälfte links, Bogen andersherum");
  assert.strictEqual(P.itemDef(sw("STD", true), k).parts[0][1], "M1.5,3.9A1.5 1.5 0 0 0 -1.5,3.9", "Bogen der Steckdose gespiegelt");
  const t = P.symTexts({ ...sw("STD2", true), r: 90 }, k).find((x) => x.s === "2"), t0 = P.symTexts({ ...sw("STD2"), r: 90 }, k).find((x) => x.s === "2");
  const z = P.symTexts(sw("STD2", true), k).find((x) => x.s === "2"), z0 = P.symTexts(sw("STD2"), k).find((x) => x.s === "2");
  near(z.at, [-z0.at[0], z0.at[1]], "Zahl wandert mit");
  assert.strictEqual(t.a, t0.a, "Zahl bleibt lesbar (gleicher Winkel)");
  near(P.symTexts(sw("STD_T15", true), k).find((x) => x.s === "T15").at, [-2.9 * k, P.symTexts(sw("STD_T15"), k).find((x) => x.s === "T15").at[1]], "T15 links");
  // Fang: pin und Mitte spiegeln mit, dreht danach
  const pn = P.symSnaps(sw("SCH0", true, 90), k).pts, p0 = P.symSnaps(sw("SCH0", false, 90), k).pts;
  assert.strictEqual(pn.length, 4, "vier Fangpunkte");
  assert.deepStrictEqual(P.symCenter(sw("SCH0", true), k), P.symCenter(sw("SCH0"), k), "Schalterkreis auf der Mitte bleibt");
  near(P.symCenter(sw("VERWEIS", true), k), [-P.symCenter(sw("VERWEIS"), k)[0], P.symCenter(sw("VERWEIS"), k)[1]], "Mitte gespiegelt");
  assert.ok(p0.every((q) => pn.some((x) => Math.hypot(x[0] - q[0], x[1] - q[1]) < 1e-6)), "Kreis: dieselben vier Punkte");
  const e = P.symSnaps(sw("DOSE", true), k).segs.flat(), e0 = P.symSnaps(sw("DOSE"), k).segs.flat();
  assert.deepStrictEqual(e.map((q) => q[0]).sort((a, b) => a - b), e0.map((q) => -q[0] + 0).sort((a, b) => a - b), "Kasten gespiegelt");
  assert.deepStrictEqual(P.symRim("STD", true), P.symRim("STD"), "Rand auf der Mittellinie gleich");
  // Symbol an Symbol: übernimmt die Drehung, nicht das Spiegeln
  const s1 = { ...sw("SCH0", true, 90), id: 5 }, r1 = P.symSnapTo([s1], "SCH0", [0, 150], k);
  assert.strictEqual(r1.r, 90, "Drehung vom Nachbarn");
  const d = M.parseModel(file([plan([{ ...s1 }, { id: 6, type: "sym", layer: "l1", key: "SCH0", at: r1.at, r: r1.r }])], 33));
  assert.deepStrictEqual(d.sheets[0].items.map((i) => i.m), [true, undefined], "nur der gespiegelte hat m");
  // Datei: m nur gespeichert, wenn gespiegelt; Version 33; Stückliste zählt gleich
  const out = JSON.parse(M.serializeModel(d));
  assert.strictEqual(out.version, 33, "gespiegelt: Version 33");
  assert.ok(!("m" in out.sheets[0].items[1]), "nicht gespiegelt: kein Feld");
  assert.strictEqual(M.parseModel(file([plan([{ ...sw("STD"), m: false }])], 33)).sheets[0].items[0].m, undefined, "m: false fällt weg");
  assert.ok(JSON.parse(M.serializeModel(M.parseModel(file([plan([sw("STD")])], 33)))).version < 33, "ohne Spiegeln tiefer");
  assert.deepStrictEqual(P.bomOf(d.sheets[0]).map((r) => r.n), [2], "Stückliste: gespiegelt zählt gleich");
}
// ---------- Plan Runde 3 (CJ 28.10.2026): Kanal mit Querstrich an den Enden und im Bogen ----------
{
  const g = P.ductGeom({ pts: [[0, 0], [2000, 0], [2000, 1000]], w: 300 }, 50);
  assert.deepStrictEqual(g.ends, [[[0, 150], [0, -150]], [[1850, 1000], [2150, 1000]]], "Querstrich an beiden Enden über die ganze Breite");
  const bo = { id: 90, type: "duct", layer: "bg", pts: [[0, 0], [2000, 0], [2000, 2000]], w: 300, curve: true };
  assert.ok(P.linePts(bo).length > 3 && P.ductLen(bo) < 4000 && P.ductLen(bo) > 2828, "Bogen: Mittellinie als Kurve, kürzer als die Ecke");
  const gb = P.ductGeom(bo, 50);
  assert.ok(gb.L.length === P.linePts(bo).length && gb.quads.length === gb.L.length - 1, "Bogen: Kanten folgen der Kurve");
  assert.ok(gb.ends[0].every((q, i) => Math.hypot(q[0], q[1] - (i ? -150 : 150)) < 0.5), "Bogen: Anfang (fast) gerade, Querstrich quer zur Kurve");
  assert.strictEqual(P.hitPlan(plan([bo]), [bo], [2000, 0], 10), null, "Bogen: die Ecke liegt ausserhalb");
  assert.strictEqual(P.hitPlan(plan([bo]), [bo], P.linePts(bo)[Math.floor(P.linePts(bo).length / 2)], 10)?.id, 90, "Bogen: Treffer auf der Kurve");
  const out = JSON.parse(M.serializeModel(M.parseModel(file([plan([bo, { ...bo, id: 91, curve: "ja" }])], 33))));
  assert.strictEqual(out.version, 33, "Kanal im Bogen: Dateiversion 33");
  assert.deepStrictEqual([out.sheets[0].items[0].curve, out.sheets[0].items[1].curve], [true, undefined], "curve nur true bleibt");
  assert.ok(JSON.parse(M.serializeModel(M.parseModel(file([plan([{ ...bo, curve: undefined }])], 33)))).version < 33, "ohne Bogen tiefer");
}
// ---------- Plan Runde 3 (CJ 28.10.2026): freier Text (Taste T) ----------
{
  const tx = { id: 95, type: "text", layer: "bg", at: [1000, 500], txt: "  Küche  ", r: 450, col: "#000000", tf: 1.5 };
  const d = M.parseModel(file([plan([tx])], 33)), out = JSON.parse(M.serializeModel(d));
  assert.strictEqual(out.version, 33, "Text: Dateiversion 33");
  assert.deepStrictEqual(out.sheets[0].items[0], { id: 95, type: "text", layer: "bg", at: [1000, 500], txt: "Küche", r: 90, tf: 1.5 }, "Text getrimmt, Drehung 0–359, Schwarz = Vorgabe fällt weg");
  assert.strictEqual(P.cleanPlanObj({ type: "text", layer: "bg", at: [0, 0], txt: "  " }, 1), null, "leerer Text fällt weg");
  assert.strictEqual(P.cleanPlanObj({ type: "text", layer: "bg", at: [0, 0], txt: "A", r: 0 }, 1).r, undefined, "r 0 nicht gespeichert");
  const sh = d.sheets[0], it = sh.items[0];
  assert.strictEqual(P.hitPlan(sh, [it], [1000, 650], 10)?.id, 95, "Treffer entlang des gedrehten Texts");
  assert.strictEqual(P.hitPlan(sh, [it], [1300, 500], 10), null, "quer daneben kein Treffer");
  P.moveItems(sh, [it], 100, -50); assert.deepStrictEqual(it.at, [1100, 450], "verschieben");
  assert.ok(P.inBox(sh, it, { x0: 1000, y0: 400, x1: 1200, y1: 500 }), "Rahmenwahl: Mitte im Rechteck");
  assert.deepStrictEqual(P.bomOf(sh), [], "nicht in der Stückliste");
  assert.ok(P.hasCol(it) && P.colOf(it) === "#000000", "Farbe wählbar, Vorgabe schwarz");
}
console.log("test_plan: alles ok");
