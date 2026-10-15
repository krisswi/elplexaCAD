// Tests für die Disposition (ohne Browser): Fang, Prüfung, automatische Schienen, Speichern/Laden, DXF-Aufbau.
import assert from "node:assert";
import * as D from "../src/dispo.js";
import { newDoc, newSheet, parseModel, serializeModel } from "../src/model.js";
import { exportDxf } from "../src/dxf.js";

let id = 100;
const nextId = () => ++id;

// Schienen automatisch: 3 x 120 und 2 x 180 in 400 mm Höhe (je 20 mm Rand)
const plate = { id: 1, type: "plate", x: 100, y: 100, w: 250, h: 400, name: "Zählerplatte", fixed: true };
assert.ok(D.fitsRails(plate, 3, 120) && D.fitsRails(plate, 2, 180));
assert.ok(!D.fitsRails(plate, 3, 125) && !D.fitsRails(plate, 4, 120));
assert.deepStrictEqual(D.autoRails(plate, 3, 120, nextId).map((r) => r.y - plate.y), [80, 200, 320]);
assert.deepStrictEqual(D.autoRails(plate, 2, 180, nextId).map((r) => r.y - plate.y), [110, 290]);
assert.ok(D.autoRails(plate, 3, 120, nextId).every((r) => r.x === 120 && r.len === 210), "20 mm Rand links und rechts");
assert.deepStrictEqual(D.railFit({ x: 0, w: 700 }), { x: 20, len: 660 });
assert.deepStrictEqual(D.railClamp({ x: 100, len: 200 }, { x: 0, w: 700 }), { x: 100, len: 200 }, "gekürzt: Länge und Lage bleiben");
assert.deepStrictEqual(D.railClamp({ x: 600, len: 200 }, { x: 0, w: 700 }), { x: 480, len: 200 }, "nicht über den Rand");
assert.deepStrictEqual(D.railClamp({ x: -50, len: 900 }, { x: 0, w: 700 }), { x: 20, len: 660 }, "höchstens Platte − 40");
assert.ok(D.railIsFull({ x: 20, len: 660 }, { x: 0, w: 700 }) && !D.railIsFull({ x: 20, len: 600 }, { x: 0, w: 700 }));

// Griffe: Platte 8, Zählerplatte keine, Schiene 2. Ziehen hält die Gegenkante, Schiene bleibt im Plattenrand.
assert.strictEqual(D.handlePoints({ type: "plate", x: 0, y: 0, w: 300, h: 400 }).length, 8);
assert.strictEqual(D.handlePoints(plate).length, 0, "Zählerplatte fest");
assert.deepStrictEqual(D.handlePoints({ type: "rail", x: 20, y: 100, len: 260 }).map((p) => [p.h, p.x]), [["w", 20], ["e", 280]]);
assert.deepStrictEqual(D.resizePlate({ x: 0, y: 0, w: 300, h: 400 }, "sw", -50, -20), { x: -50, y: -20, w: 350, h: 420 });
assert.deepStrictEqual(D.resizePlate({ x: 0, y: 0, w: 300, h: 400 }, "e", -500, 0), { x: 0, y: 0, w: D.MIN_PLATE, h: 400 }, "nie kleiner als MIN_PLATE");
const pl3 = { x: 0, y: 0, w: 300, h: 400 };
assert.deepStrictEqual(D.resizeRail({ x: 20, len: 260 }, "e", 500, pl3), { x: 20, len: 260 });
assert.deepStrictEqual(D.resizeRail({ x: 20, len: 260 }, "w", 100, pl3), { x: 100, len: 180 });
assert.deepStrictEqual(D.resizeRail({ x: 20, len: 260 }, "w", 500, null), { x: 271.25, len: 8.75 }, "mindestens ½ TE");
assert.deepStrictEqual(D.massTargets({ type: "plate", x: 0, y: 0, w: 300, h: 400 }).map((m) => [m.key, m.v]), [["w", 300], ["h", 400]]);
assert.strictEqual(D.massTargets(plate).length, 0);

// Hilfslinien: Kanten und Mitten der anderen Bauteile, nächste innerhalb der Fangweite
const L = D.guideLines([plate, { id: 9, type: "plate", x: 0, y: 0, w: 50, h: 50 }], new Set([9]));
assert.deepStrictEqual(L.xs.map((l) => l.v), [100, 225, 350]);
assert.deepStrictEqual(L.ys.map((l) => l.v), [100, 300, 500]);
const ng = D.nearestGuide([340, 360, 380], L.xs, 12);
assert.deepStrictEqual([ng.v, ng.c], [350, 340]);
assert.strictEqual(D.nearestGuide([400], L.xs, 12), null);

// Ausrichten und Verteilen
const bx = [{ x0: 0, y0: 0, x1: 100, y1: 50 }, { x0: 150, y0: 20, x1: 200, y1: 40 }, { x0: 400, y0: 10, x1: 500, y1: 30 }];
assert.deepStrictEqual(D.alignMoves(bx, "l"), [[0, 0], [-150, 0], [-400, 0]]);
assert.deepStrictEqual(D.alignMoves(bx, "t"), [[0, 0], [0, 10], [0, 20]]);
assert.deepStrictEqual(D.alignMoves(bx, "cx"), [[200, 0], [75, 0], [-200, 0]]);
assert.deepStrictEqual(D.alignMoves(bx, "dh"), [[0, 0], [75, 0], [0, 0]], "Lücken 125 und 125");
assert.deepStrictEqual(D.alignMoves(bx.slice(0, 2), "dv"), [[0, 0], [0, 0]], "unter 3 Teilen nichts");

// Fang auf Schiene: Raster ½ TE = 8,75 mm ab Schienenanfang, Mitte der Schiene in y
const rail = { id: 2, type: "rail", x: 100, y: 180, len: 250 };
let r = D.snapDevice([rail], 120, 190, 1);
assert.deepStrictEqual([r.x, r.y], [117.5, 180], JSON.stringify(r)); // (120-100)/8.75 = 2,29 -> 2 -> 117,5
r = D.snapDevice([rail], 300, 180, 4); // 4 TE = 70 mm, Maus knapp hinter dem Ende: rastet am Ende ein, ragt nicht darüber
assert.strictEqual(D.snapDevice([rail], 345, 180, 4), null, "deutlich hinter dem Ende: kein Fang");
assert.strictEqual(r.x, 280);
assert.strictEqual(D.snapDevice([rail], 120, 300, 1), null, "zu weit von der Schiene");
assert.strictEqual(D.snapDevice([rail], 120, 180, 1, 2), null, "die eigene Schiene wird ausgenommen, wenn excludeId passt");

// Überlappung und Schienenende
const dev = (idn, x, te, y = 180) => ({ id: idn, type: "device", x, y, te, h: 83, kind: "LS1", label: "LS", bmk: "" });
let items = [rail, dev(10, 100, 1), dev(11, 117.5, 3), dev(12, 187.5, 0.5)];
assert.strictEqual(D.deviceIssues(items).size, 0, "aneinander gereiht ist in Ordnung");
items = [rail, dev(10, 100, 2), dev(11, 117.5, 1)];
assert.deepStrictEqual([...D.deviceIssues(items)].sort(), [10, 11], "Überlappung");
items = [rail, dev(10, 300, 4)];
assert.deepStrictEqual([...D.deviceIssues(items)], [10], "ragt über das Schienenende");
items = [dev(10, 0, 1, 50), dev(11, 5, 1, 300)];
assert.strictEqual(D.deviceIssues(items).size, 0, "andere Höhe, keine Schiene: nichts zu melden");

// Inhalt einer Platte
const inside = dev(20, 120, 1, 180), outside = dev(21, 500, 1, 180);
assert.deepStrictEqual(D.contained([plate, rail, inside, outside], plate).map((i) => i.id), [2, 20]);

// Treffer: Platte nur am Rand
assert.ok(D.hitItem(plate, 100.5, 300, 1) && D.hitItem(plate, 225, 100.5, 1));
assert.ok(!D.hitItem(plate, 225, 300, 1), "Mitte der Platte trifft nicht");

// Bausteine: Platte, 3 Schienen, 2 Geräte -> Rechtecke und Texte
const prims = D.planPrims([plate, ...D.autoRails(plate, 3, 120, nextId), dev(30, 117.5, 1, 180), dev(31, 135, 3, 180)]);
assert.strictEqual(prims.filter((p) => p.k === "rect" && p.layer === "SCH_DISPO_PLATTE").length, 1);
assert.strictEqual(prims.filter((p) => p.k === "rect" && p.layer === "SCH_DISPO_SCHIENE").length, 3);
assert.strictEqual(prims.filter((p) => p.k === "rect" && p.layer === "SCH_DISPO_GERAET").length, 2);
const g = prims.filter((p) => p.layer === "SCH_DISPO_GERAET");
assert.deepStrictEqual([g[0].w, g[1].w, g[0].h], [17.5, 52.5, 83]);

// Speichern und Laden. Version 3 nur mit Disposition, sonst 2.
const doc = newDoc();
doc.sheets.push(newSheet("dispo"));
const ds = doc.sheets[1];
ds.sid = 7; ds.meta.TITEL = "Verteiler EG";
ds.items.push(plate, rail, dev(30, 117.5, 1), { id: 31, type: "text", x: 100, y: 50, h: 15, s: "Hinweis" });
doc.sheets[0].items.push({ id: 40, type: "dispoview", x: 20, y: 40, den: 5, bx: 100, by: 100, bw: 250, bh: 430, title: "Verteiler EG", src: 7, items: JSON.parse(JSON.stringify(ds.items)) });
doc.nextId = 200;
const text = serializeModel(doc);
assert.strictEqual(JSON.parse(text).version, 3);
const back = parseModel(text);
assert.deepStrictEqual(back.sheets[1].items, ds.items);
assert.strictEqual(back.sheets[1].kind, "dispo");
assert.strictEqual(back.sheets[1].sid, 7);
assert.deepStrictEqual(back.sheets[0].items[0].items, ds.items);
assert.deepStrictEqual(JSON.parse(serializeModel(back)), JSON.parse(text), "zweiter Durchlauf liefert dieselben Daten");
assert.strictEqual(JSON.parse(serializeModel(newDoc())).version, 2, "reines Schema bleibt Version 2");

// Ungültiges wird abgelehnt
const bad = (mut) => { const o = JSON.parse(text); mut(o); return () => parseModel(JSON.stringify(o)); };
assert.throws(bad((o) => { o.sheets[1].items[0].w = -5; }), /unbekanntes oder defektes Objekt/);
assert.throws(bad((o) => { o.sheets[0].items.push(o.sheets[1].items[0]); }), /gehören auf ein Dispositionsblatt/);
assert.throws(bad((o) => { o.sheets[1].items.push({ id: 90, type: "wire", kind: "leitung", pts: [[0, 0], [1, 1]] }); }), /nur Bauteile und Texte/);
assert.throws(bad((o) => { o.sheets[0].items[0].den = 0; }), /unbekanntes oder defektes Objekt/);
assert.throws(bad((o) => { o.sheets[0].items[0].items.push({ id: 91, type: "wire", kind: "leitung", pts: [[0, 0], [1, 1]] }); }), /ungültige Objekte/);

// DXF der Disposition: 1:1 in mm, keine Rahmen und kein Schriftfeld
const dxf = exportDxf(back.sheets[1]);
assert.ok(dxf.includes("SCH_DISPO_PLATTE") && dxf.includes("LWPOLYLINE") && !dxf.includes("SCHRIFTFELD") && !dxf.includes("SCH_RAHMEN"));
// DXF des Schemablatts mit Ansicht: Plattenrechteck skaliert 1:5 und an die Stelle der Ansicht gelegt
const dxf2 = exportDxf(back.sheets[0]);
assert.ok(dxf2.includes("SCH_DISPO_PLATTE") && dxf2.includes("Massstab 1:5"));
console.log("ok dispo");

// Bemassung: Zusammenrechnen zu kleiner Masse, Zahlenformat, Ketten
assert.strictEqual(D.fmtMass(78.75), "78,8"); assert.strictEqual(D.fmtMass(250), "250");
assert.deepStrictEqual(D.mergePoints([0, 100, 105, 300], () => 20), [0, 105, 300], "5 mm zu klein: wird zum kleineren Nachbarn (100) addiert");
assert.deepStrictEqual(D.mergePoints([0, 3, 6, 100], () => 20), [0, 100], "mehrfach zusammengerechnet");
assert.deepStrictEqual(D.mergePoints([0, 100], () => 500), [0, 100], "Anfang und Ende bleiben immer");
{
  const pl = { id: 1, type: "plate", x: 0, y: 0, w: 250, h: 400, name: "Z" };
  const rl = [{ id: 2, type: "rail", x: 0, y: 80, len: 250 }, { id: 3, type: "rail", x: 0, y: 200, len: 250 }, { id: 4, type: "rail", x: 0, y: 320, len: 250 }];
  const dv = (i, x, te) => ({ id: i, type: "device", x, y: 80, te, h: 83, kind: "LS", label: "", bmk: "" });
  const its = [pl, ...rl, dv(10, 0, 3), dv(11, 52.5, 1)];
  const texts = (o) => D.planPrims(its, o).filter((p) => p.k === "text" && p.layer === "SCH_DISPO_MASS").map((p) => p.s);
  assert.deepStrictEqual(texts({ dims: false }), [], "ohne Masse keine Massprimitive");
  const t = texts({ dims: true });
  for (const v of ["250", "400", "80", "120"]) assert.ok(t.includes(v), v);
  assert.ok(t.includes("70") && t.includes("180"), "Geräteblock 0..70 (3 TE + 1 TE aneinander) und Rest 180: " + t);
  assert.ok(D.planPrims(its, { dims: false }).some((p) => p.s === "Z  250 × 400") && D.planPrims(its, { dims: true }).some((p) => p.s === "Z"), "Plattenmass im Namen nur ohne Bemassung");
  const bb0 = D.contentBBox(its), bb1 = D.contentBBox(its, true);
  assert.ok(bb1.x0 < bb0.x0 && bb1.x1 > bb0.x1 && bb1.y0 < bb0.y0, "Bbox wächst um die Bemassung");
  // Schiene mit Gerät am Ende, einzelne Schiene: keine doppelte Kette rechts
  const one = D.planPrims([pl, rl[0]], { dims: true }).filter((p) => p.k === "text" && p.layer === "SCH_DISPO_MASS").map((p) => p.s);
  assert.deepStrictEqual(one.sort(), ["250", "320", "400", "80"].sort(), "eine Schiene: 80 unten, 320 oben, Gesamtmass 400/250: " + one);
}
// Speichern/Laden: Stern und Masse-aus
{
  const d = newDoc(); d.sheets.push(newSheet("dispo")); d.sheets[1].sid = 5; d.sheets[1].dims = false; d.sheets[0].pin = true;
  const back = parseModel(serializeModel(d));
  assert.strictEqual(back.sheets[1].dims, false); assert.strictEqual(back.sheets[0].pin, true); assert.strictEqual(back.sheets[1].pin, undefined);
}
console.log("ok bemassung");
