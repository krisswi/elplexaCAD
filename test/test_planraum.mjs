// Räume im Plan (CJ 30.10.2026, nur elplexaCAD): Erkennung aus den Wänden, Innenfläche, Beschriftung «Raum n», Nummern bei Änderungen, Datei (Version 34), Import.
// Raumgrenze von Hand (poly, Werkzeug Raum U, Dateiversion 35).
// Aufruf: node test/test_planraum.mjs. Testdaten erfunden.
import assert from "node:assert";
globalThis.ELPLEXA = true;
const M = await import("../src/model.js");
const P = await import("../src/plan.js");
const RM = await import("../src/planraum.js");
const I = await import("../src/planimport.js");
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} statt ${b}`);

let id = 0;
const W = (a, b, d = 150) => ({ id: ++id, type: "wall", layer: "bg", a, b, d, mat: "mauer" });
const box = () => [W([0, 0], [4000, 0]), W([4000, 0], [4000, 3000]), W([4000, 3000], [0, 3000]), W([0, 3000], [0, 0])];

// ---------- ein Raum: Innenfläche = Mittellinie minus halbe Wanddicke ----------
let f = RM.roomFaces(box());
assert.strictEqual(f.length, 1, "Rechteck = ein Raum");
close(f[0].area, 3.85 * 2.85, "Innenfläche 3,85 × 2,85 m");
assert.ok(RM.inPoly(f[0].lab, f[0].inner), "Beschriftung innen");
assert.strictEqual(RM.fmtArea(f[0].area), "11,0 m²");
// offen (eine Wand fehlt): kein Raum
assert.strictEqual(RM.roomFaces(box().slice(0, 3)).length, 0, "offen = kein Raum");
// Zwischenwand mit T-Stoss an den Mittellinien: zwei Räume, Zwischenwand 100 mm
f = RM.roomFaces([...box(), W([2000, 0], [2000, 3000], 100)]);
assert.strictEqual(f.length, 2, "Zwischenwand teilt");
for (const x of f) close(x.area, (2 - 0.075 - 0.05) * 2.85, "je 1,875 × 2,85 m");
// Zwischenwand endet an der Innenkante der Aussenwand (nicht auf der Mittellinie): gleich
f = RM.roomFaces([...box(), W([2000, 75], [2000, 2925], 100)]);
assert.strictEqual(f.length, 2, "T-Stoss an der Innenkante");
// Wand ragt in die Nachbarwand und wird selbst an ihrem anderen Ende verschoben (EG 30.10.2026): die Teilung bleibt am Stosspunkt
// H endet in V (wird auf V gezogen, V geteilt), danach wird V oben auf die Aussenwand gezogen. Früher rutschte die Teilung um ~3 mm mit.
f = RM.roomFaces([...box(), W([0, 1500], [2050, 1500]), W([2000, 1425], [2000, 2940], 120)]);
assert.strictEqual(f.length, 2, "gegenseitiger T-Stoss, V danach verschoben");
f = RM.roomFaces([...box(), W([2000, 1425], [2000, 2940], 120), W([0, 1500], [2050, 1500])]);
assert.strictEqual(f.length, 2, "gleich, andere Reihenfolge");
// loses Wandstück im Raum stört nicht
f = RM.roomFaces([...box(), W([1000, 1000], [1000, 2000])]);
assert.strictEqual(f.length, 1, "loses Ende fällt weg");
close(f[0].area, 3.85 * 2.85, "Fläche unverändert");
// L-Form: Schwerpunkt liegt draussen, die Beschriftung trotzdem innen
const L = [W([0, 0], [4000, 0]), W([4000, 0], [4000, 1000]), W([4000, 1000], [1000, 1000]), W([1000, 1000], [1000, 4000]), W([1000, 4000], [0, 4000]), W([0, 4000], [0, 0])];
f = RM.roomFaces(L);
assert.strictEqual(f.length, 1);
assert.ok(RM.inPoly(f[0].lab, f[0].inner), "L-Form: Beschriftung innen");
// Reihenfolge: von oben links nach unten rechts
f = RM.roomFaces([W([0, 0], [6000, 0]), W([6000, 0], [6000, 6000]), W([6000, 6000], [0, 6000]), W([0, 6000], [0, 0]), W([0, 3000], [6000, 3000]), W([3000, 3000], [3000, 6000])]);
assert.deepStrictEqual(f.map((x) => [Math.round(x.lab[0] / 1000), Math.round(x.lab[1] / 1000)]), [[2, 5], [5, 5], [3, 2]], "oben links, oben rechts, unten");

// ---------- Beschriftung: neu «Raum n», bestehende bleiben ----------
id = 0;
let nid = 100; const nextId = () => nid++;
const sh = { kind: "plan", layers: [{ id: "bg", name: "Hintergrund", show: true, lock: false }, { id: "app", name: "Apparate", show: true, lock: false }], alay: "app", paper: { size: "A3", quer: true, den: 50 }, items: [...box(), W([2000, 0], [2000, 3000], 100)] };
const made = RM.syncRooms(sh, nextId);
assert.deepStrictEqual(made.map((r) => [r.name, r.layer]), [["Raum 1", "bg"], ["Raum 2", "bg"]], "zwei Räume beschriftet, Ebene Hintergrund");
assert.ok(made[0].at[0] < 2000 && made[1].at[0] > 2000, "Raum 1 links, Raum 2 rechts");
assert.strictEqual(RM.syncRooms(sh, nextId).length, 0, "nochmals: nichts Neues");
made[0].name = "Küche";
// Zwischenwand verschoben: Namen bleiben (über den Punkt)
P.setEnds(sh, P.nodeEnds(sh, [2000, 0]), [2500, 0]); P.setEnds(sh, P.nodeEnds(sh, [2000, 3000]), [2500, 3000]);
assert.strictEqual(RM.syncRooms(sh, nextId).length, 0, "verschoben: keine neuen Räume");
// neue Wand teilt Raum 2: der neue Teil bekommt die nächste Nummer
sh.items.push(W([2500, 1500], [4000, 1500], 100));
const n3 = RM.syncRooms(sh, nextId);
assert.deepStrictEqual(n3.map((r) => r.name), ["Raum 3"], "neuer Raum: nächste Nummer");
// Wände weg: Beschriftungen bleiben, ohne Raum
sh.items = sh.items.filter((i) => i.type !== "wall" || i.id > 4);
assert.strictEqual(RM.syncRooms(sh, nextId).length, 0);
assert.strictEqual(sh.items.filter((i) => i.type === "room").length, 3, "Beschriftungen bleiben");
assert.strictEqual(RM.faceOf(RM.roomFaces(sh.items.filter((i) => i.type === "wall")), made[0].at), null, "ohne Raum");
// ohne Ebene Hintergrund: unterste Ebene
const sh2 = { layers: [{ id: "x1", name: "Grund" }], items: box() };
assert.strictEqual(RM.syncRooms(sh2, nextId)[0].layer, "x1");

// ---------- Datei: Version 34, Felder, Rundlauf ----------
assert.strictEqual(M.VERSION, 35);
const cr = (o) => P.cleanPlanObj({ type: "room", layer: "bg", at: [1, 2], ...o }, 5);
assert.deepStrictEqual(cr({ name: "  Bad ", tf: 1.5, hide: true, na: true, x: 1 }), { id: 5, type: "room", layer: "bg", at: [1, 2], name: "Bad", tf: 1.5, hide: true, na: true });
assert.strictEqual(cr({ name: "" }).name, "Raum", "leerer Name: «Raum»");
assert.strictEqual(cr({ at: [1] }), null, "ohne Punkt abgelehnt");
const doc = M.parseModel(JSON.stringify({ format: "schemacad", version: 34, nextId: 200, sheets: [{ kind: "plan", sid: 1, meta: { BLATT: "1" }, layers: sh.layers, alay: "app", items: sh.items }] }));
const txt = M.serializeModel(doc), back = JSON.parse(txt);
assert.strictEqual(back.version, 34, "Plan mit Raum: Version 34");
assert.deepStrictEqual(M.parseModel(txt).sheets[0].items, doc.sheets[0].items, "Rundlauf");
assert.throws(() => M.parseModel(txt.replace('"version": 34', '"version": 36')), /neueren Version/);
// Raum verschieben und wählen
const r1 = doc.sheets[0].items.find((i) => i.name === "Küche");
P.moveItems(doc.sheets[0], [r1], 100, 0);
assert.ok(P.inBox(doc.sheets[0], r1, { x0: r1.at[0] - 1, y0: r1.at[1] - 1, x1: r1.at[0] + 1, y1: r1.at[1] + 1 }));
assert.strictEqual(P.hitPlan(doc.sheets[0], doc.sheets[0].items, r1.at, 10)?.id, r1.id, "Klick auf den Namen wählt den Raum");

// ---------- Import nimmt Räume mit (gedreht, neue ids) ----------
const src = { layers: sh.layers, alay: "app", items: [...box(), { id: 9, type: "room", layer: "bg", at: [1000, 1000], name: "Büro" }] };
const tg = { layers: [{ id: "bg", name: "Hintergrund", show: true, lock: false }], alay: "bg", items: [], paper: { size: "A3", quer: true, den: 50 } };
const res = I.mergePlan(tg, src, new Set(["bg"]), [5000, 0], 90, nextId);
const rr = res.items.find((i) => i.type === "room");
assert.deepStrictEqual([rr.name, rr.at, rr.r], ["Büro", [4000, 1000], undefined], "Raum gedreht mitgenommen, bleibt waagrecht");
assert.strictEqual(RM.syncRooms(tg, nextId).length, 0, "importierter Raum ist beschriftet: kein «Raum 1» dazu");

// ---------- Raumgrenze von Hand (poly) ----------
// Fläche des Vielecks, Richtung egal, Beschriftung innen
const LF = [[0, 0], [0, 3000], [2000, 3000], [2000, 1000], [4000, 1000], [4000, 0]]; // L-Form im Uhrzeigersinn
let pf = RM.polyFace(LF);
close(pf.area, 2 * 3 + 2 * 1, "L-Form 8 m²");
assert.ok(RM.polyArea(pf.poly) > 0 && RM.inPoly(pf.lab, pf.poly), "gegen den Uhrzeigersinn, Name innen");
assert.strictEqual(RM.roomFace([], { at: [500, 500], poly: LF }).own, true, "roomFace nimmt die eigene Grenze");
assert.strictEqual(RM.roomFace(RM.roomFaces(box()), { at: [500, 500] }).own, undefined, "ohne Grenze: der erkannte Raum");
assert.strictEqual(RM.nextRoomName([{ name: "Raum 2" }, { name: "Küche" }]), "Raum 3");
// Feld poly: gerundet, mindestens 3 Ecken, sonst fällt es weg
assert.deepStrictEqual(cr({ name: "Wohnen", poly: [[0, 0], [1000.00049, 0], [1000, 1000]] }).poly, [[0, 0], [1000, 0], [1000, 1000]]);
assert.strictEqual(cr({ name: "x", poly: [[0, 0], [1, 1]] }).poly, undefined, "zu wenig Ecken");
assert.strictEqual(cr({ name: "x", poly: [[0, 0], [1, 1], ["a", 1]] }).poly, undefined, "defekte Ecke");
// offener Grundriss (eine Wand fehlt): Raum von Hand hat Fläche; ein erkannter Raum wird von einer eigenen Grenze abgedeckt
const sh3 = { kind: "plan", layers: sh.layers, alay: "bg", paper: { size: "A3", quer: true, den: 50 }, items: box().slice(0, 3) };
sh3.items.push({ id: 300, type: "room", layer: "bg", at: [2000, 1500], name: "Wohnen", poly: [[75, 75], [3925, 75], [3925, 2925], [75, 2925]] });
assert.strictEqual(RM.roomFaces(sh3.items.filter((i) => i.type === "wall")).length, 0, "offen: nichts erkannt");
close(RM.roomFace([], sh3.items.at(-1)).area, 3.85 * 2.85, "eigene Grenze: Fläche");
sh3.items.push(W([0, 3000], [0, 0])); // Wand dazu: Raum geschlossen, aber schon abgedeckt
assert.strictEqual(RM.syncRooms(sh3, nextId).length, 0, "geschlossen und abgedeckt: kein «Raum 1» dazu");
// Datei: Version 35, Rundlauf, Verschieben und Einfügen nehmen die Grenze mit
const d35 = M.parseModel(JSON.stringify({ format: "schemacad", version: 35, nextId: 400, sheets: [{ kind: "plan", sid: 1, meta: { BLATT: "1" }, layers: sh.layers, alay: "bg", items: sh3.items }] }));
const t35 = M.serializeModel(d35);
assert.strictEqual(JSON.parse(t35).version, 35, "Raum mit Grenze: Version 35");
assert.deepStrictEqual(M.parseModel(t35).sheets[0].items, d35.sheets[0].items, "Rundlauf mit Grenze");
const own = d35.sheets[0].items.find((i) => i.name === "Wohnen");
P.moveItems(d35.sheets[0], [own], 100, -50);
assert.deepStrictEqual([own.at, own.poly[0]], [[2100, 1450], [175, 25]], "Verschieben: Name und Grenze");
const pc = P.pasteItems(d35.sheets[0], P.copyItems(d35.sheets[0], [own]), 10, 10, nextId)[0];
assert.deepStrictEqual(pc.poly[0], [185, 35], "Einfügen: Grenze versetzt");
// Import: Grenze gedreht
const src2 = { layers: sh.layers, alay: "bg", items: [{ id: 9, type: "room", layer: "bg", at: [500, 500], name: "Gang", poly: [[0, 0], [1000, 0], [1000, 1000]] }] };
const tg2 = { layers: [{ id: "bg", name: "Hintergrund", show: true, lock: false }], alay: "bg", items: [], paper: { size: "A3", quer: true, den: 50 } };
const g2 = I.mergePlan(tg2, src2, new Set(["bg"]), [0, 0], 90, nextId).items[0];
assert.deepStrictEqual(g2.poly, [[0, 0], [0, 1000], [-1000, 1000]], "Import: Grenze gedreht");
// ---------- Stückliste nach Räumen (CJ 31.10.2026) ----------
{
  const L2 = [{ id: "bg", name: "Hintergrund", show: false, lock: false }, { id: "l1", name: "Elektro", show: true, lock: false }]; // Raum zählt auch bei ausgeblendetem Hintergrund
  const S = (key, at, ap) => ({ id: ++id, type: "sym", layer: "l1", key, at, r: 0, ...(ap ? { ap } : {}) });
  const sb = { kind: "plan", layers: L2, alay: "l1", paper: { size: "A3", quer: true, den: 50 }, items: [...box(), W([2000, 0], [2000, 3000], 100),
    { id: 500, type: "room", layer: "bg", at: [1000, 1500], name: "Raum 10" }, { id: 501, type: "room", layer: "bg", at: [3000, 1500], name: "Raum 2", hide: true },
    { id: 502, type: "room", layer: "bg", at: [3000, 2500], name: "Bad", poly: [[2100, 2000], [3900, 2000], [3900, 2900], [2100, 2900]] }, // eigene Grenze im erkannten Raum 2
    { id: 503, type: "room", layer: "bg", at: [9000, 9000], name: "Leer" }, // ohne Fläche: zählt nicht
    S("STD", [500, 500]), S("STD", [600, 500], true), S("LEUCHTE", [1000, 1000]), S("STD", [3000, 1000]), S("LEUCHTE", [3000, 2500]), S("STD", [8000, 500]),
    { id: ++id, type: "duct", layer: "l1", pts: [[500, 200], [3500, 200]], w: 200 }] };
  const br = RM.bomRooms(sb);
  assert.deepStrictEqual(br.blocks.map((b) => [b.name, b.rows.map((r) => [r.label, r.n])]), [
    ["Bad", [["Leuchte an Decke", 1]]],
    ["Raum 2", [["Steckdose T13 (Schutzkontakt), UP", 1]]],
    ["Raum 10", [["Steckdose T13 (Schutzkontakt), UP", 1], ["Steckdose T13 (Schutzkontakt), AP", 1], ["Leuchte an Decke", 1]]],
    ["Ohne Raum", [["Steckdose T13 (Schutzkontakt), UP", 1]]]], "Blöcke nach Name, eigene Grenze vor erkanntem Raum, UP/AP getrennt, Kanal nicht je Raum, leere Räume weg");
  close(br.blocks[0].area, 1.8 * 0.9, "Fläche der eigenen Grenze");
  close(br.blocks[1].area, 1.875 * 2.85, "Fläche des erkannten Raums");
  assert.strictEqual(br.blocks[3].area, undefined, "Ohne Raum: keine Fläche");
  assert.deepStrictEqual(br.total, P.bomOf(sb), "Total wie bisher, mit Kanal");
  assert.ok(br.total.some((r) => r.duct === 200), "Kanal im Total");
  const flat = [...br.blocks.flatMap((b) => b.rows.map((r) => ({ ...r, room: b.name }))), ...br.total.map((r) => ({ ...r, room: "Total" }))];
  const csv = P.bomCsv(flat).split("\r\n");
  assert.strictEqual(csv[0], "Raum;Gruppe;Symbol;Anzahl;Länge m", "CSV: Spalte Raum vorne");
  assert.strictEqual(csv[1], "Bad;Leuchten;Leuchte an Decke;1;", "CSV: Zeile mit Raum");
  assert.ok(csv.includes("Total;Kanäle;Kanal 200 mm;1;3,00"), "CSV: Kanal im Total");
  assert.strictEqual(RM.bomRooms({ ...sb, items: sb.items.filter((i) => i.type !== "room") }), null, "ohne Räume: Liste wie heute");
  sb.layers[1].show = false;
  assert.deepStrictEqual(RM.bomRooms(sb).blocks, [], "ausgeblendete Symbole zählen nicht");
}
console.log("test_planraum: alles ok");
