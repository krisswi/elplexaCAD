// Tests Disposition, Wunsch CJ 16.10.2026 (Bärgen 268): Vertigroup NH1 bis NH3, Vertigroup mit Wandler, freie Schiene,
// Schienen N/PE/PEN, Zuleitung, Texte (Grundgrösse, innen kleiner statt breiter, aussen gestapelt), äussere Bemassung.
// Aufruf: node test/test_dispo_wunsch.mjs [Beleg.schemacad.json]  (mit Argument wird eine Belegdatei für dispo_wunsch_tests.py geschrieben)
import assert from "node:assert";
import fs from "node:fs";
import * as D from "../src/dispo.js";
import * as K from "../src/schrank.js";
import { newDoc, newSheet, parseModel, serializeModel, VERSION } from "../src/model.js";
import { exportDxf } from "../src/dxf.js";

const texts = (ps) => ps.filter((p) => p.k === "text");
const save = (items) => { const doc = newDoc(), sh = newSheet("dispo"); sh.sid = 3; sh.items = items; doc.sheets = [sh]; doc.nextId = 999; return serializeModel(doc); };
const load = (txt) => parseModel(txt).sheets[0].items;
// Textbox wie im Programm geschätzt (Zeichenbreite K.CHAR_W), gedreht = senkrecht
const tbox = (t) => { const w = t.s.length * t.h * K.CHAR_W; return t.rot ? { x0: t.x - t.h / 2, x1: t.x + t.h / 2, y0: t.y - w / 2, y1: t.y + w / 2 } : { x0: t.x - w / 2, x1: t.x + w / 2, y0: t.y - t.h / 2, y1: t.y + t.h / 2 }; };
const over = (a, b) => a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01 && a.y0 < b.y1 - 0.01 && b.y0 < a.y1 - 0.01;
assert.strictEqual(VERSION, 12);

// ---------- 1. Vertigroup NH1, NH2, NH3 ----------
const V = K.NH_MAKERS.vertigroup.sizes;
for (const n of [1, 2, 3]) for (const pol of [3, 1]) assert.deepStrictEqual([V[`${n}-${pol}`].w, V[`${n}-${pol}`].h, V[`${n}-${pol}`].d, V[`${n}-${pol}`].label], [100, 671, 190, "NH" + n], `NH${n} ${pol}-polig`);
assert.ok(!V["13-3"] && !V["000"], "kein „Gr. 1–3“ mehr, kein 000");
assert.strictEqual(V["00-3"].w, 50, "NH00 50 mm (CJ bestätigt)");
assert.strictEqual(K.nhDefault("vertigroup"), "1-3");
// alte Dateien mit „13-3“/„13-1“ öffnen als NH1
const raw = (items, version = 11) => JSON.stringify({ format: "schemacad", version, sheets: [{ kind: "dispo", sid: 3, meta: {}, items }] });
let back = load(raw([{ id: 1, type: "part", kind: "NH", maker: "vertigroup", size: "13-3", x: 0, y: 0, w: 100, h: 671, s: "" }, { id: 2, type: "part", kind: "NH", maker: "vertigroup", size: "13-1", x: 200, y: 0, w: 100, h: 671, s: "" }]));
assert.deepStrictEqual(back.map((i) => [i.size, i.w, i.h]), [["1-3", 100, 671], ["1-1", 100, 671]], "alte Grösse 13-3/13-1 → NH1");
assert.ok(texts(K.partPrims(back[0])).some((t) => t.s === "NH1"));
console.log("ok vertigroup nh1-3");

// ---------- 2. Vertigroup mit Wandler ----------
const W = K.NH_MAKERS.vgw.sizes;
assert.deepStrictEqual([W["00W"].w, W["00W"].h, W["00W"].d, W["00W"].amp], [50, 741, 177, "160"], "LVSGW00TRPX");
assert.deepStrictEqual([W["1W"].w, W["1W"].h, W["1W"].d, W["1W"].amp], [100, 671, 190, "250"], "LVSG1CPX");
const vw = { id: 3, ...K.newPart("VGW00", 0, 0) };
assert.deepStrictEqual([vw.maker, vw.size, vw.w, vw.h, vw.s, vw.wr, vw.wl], ["vgw", "00W", 50, 741, "160", "150/5", "L123"]);
const rings = (p) => K.partPrims(p).filter((q) => q.k === "circle");
assert.strictEqual(rings(vw).length, 6, "L1–L3: drei Wandlerringe (je zwei Kreise)");
const r1 = rings({ ...vw, wl: "L1" }), r2 = rings({ ...vw, wl: "L2" });
assert.ok(r1.length === 2 && r2.length === 2 && r1[0].y > r2[0].y, "L1 oben, L2 darunter");
assert.ok(rings(vw).every((c) => c.x - c.r >= -0.01 && c.x + c.r <= vw.w + 0.01), "Ringe in der Leiste");
assert.ok(texts(K.partPrims(vw)).some((t) => t.s === "150/5"), "Wandler-Verhältnis");
const vw1 = { id: 4, ...K.newPart("VGW1", 200, 0), wl: "L2", wr: "300/5" };
let txt = save([vw, vw1]);
assert.strictEqual(JSON.parse(txt).version, 12);
assert.deepStrictEqual(load(txt), JSON.parse(JSON.stringify([vw, vw1])), "Rundlauf Wandler");
back = load(txt.replace('"wl": "L2"', '"wl": "X"'));
assert.ok(!back[1].wl && rings(back[1]).length === 6, "unbekannte Lage → L1–L3");
console.log("ok vertigroup wandler");

// ---------- 3. Freie DIN-Schiene ----------
const pl = { id: 10, type: "plate", x: 0, y: 0, w: 500, h: 400, name: "" };
const rf = { id: 11, type: "rail", x: -100, y: 200, len: 800, free: true };
txt = save([pl, rf]);
assert.strictEqual(JSON.parse(txt).version, 12);
assert.deepStrictEqual(load(txt)[1], rf, "freie Schiene unverändert (über die Platte hinaus)");
assert.deepStrictEqual(D.resizeRail(rf, "e", 900, null), { x: -100, len: 1000 }, "ohne Plattenrand");
const kl = { id: 12, type: "device", x: 0, y: 0, te: 1, h: 45, kind: "KL", n: 5, qs: "10", label: "", bmk: "" };
const sn = D.snapDevice([pl, rf], -95, 205, D.klemmFit(kl).te);
assert.ok(sn && sn.rail === 11 && sn.y === 200 && sn.x >= -100, "Klemme rastet auf der freien Schiene");
assert.ok(!("free" in load(save([{ ...rf, free: undefined }]))[0]), "normale Schiene ohne free");
console.log("ok freie schiene");

// ---------- 4. Schienen N, PE, PEN ----------
const bh = K.barFrom("N", { x: 0, y: 0 }, { x: 300, y: 40 }), bv = K.barFrom("PE", { x: 0, y: 0 }, { x: 30, y: -250 });
assert.deepStrictEqual([bh.x, bh.y, bh.w, bh.h], [0, -K.BAR_T / 2, 300, K.BAR_T], "waagrecht nach dem grösseren Abstand");
assert.deepStrictEqual([bv.x, bv.y, bv.w, bv.h], [-K.BAR_T / 2, -250, K.BAR_T, 250], "senkrecht nach unten");
const fills = (p) => K.partPrims(p).filter((q) => q.k === "rect").map((q) => q.fill);
assert.deepStrictEqual(fills(bh), ["n"], "N blau");
assert.deepStrictEqual(fills(bv), ["pe", "ye"], "PE grün-gelb");
assert.deepStrictEqual(fills(K.barFrom("PEN", { x: 0, y: 0 }, { x: 200, y: 0 })), ["pe", "ye", "n", "n"], "PEN grün-gelb, Enden blau");
// alte PEN-Schiene geht darin auf
back = load(raw([{ id: 20, type: "part", kind: "PEN", x: 0, y: 0, w: 25, h: 215, s: "" }], 9));
assert.deepStrictEqual([back[0].kind, back[0].c, back[0].w, back[0].h], ["BAR", "PEN", 25, 215]);
// Schienen zuerst gezeichnet, N-Trenner darauf
const nt = { id: 21, ...K.newPart("NT", 140, -18) }, bar = { id: 22, ...bh };
const ps = D.planPrims([nt, bar]), iBar = ps.findIndex((p) => p.fill === "n"), iNt = ps.findIndex((p) => p.k === "text" && p.s === "NT");
assert.ok(iBar >= 0 && iNt > iBar, "N-Trenner liegt über der Schiene");
const dx = exportDxf({ ...newSheet("dispo"), items: [bar, { id: 23, ...bv }] });
assert.ok(dx.includes("SCH_DISPO_N") && dx.includes("SCH_DISPO_PE") && dx.includes("SCH_DISPO_GELB"), "DXF-Layer der Leiter");
console.log("ok schienen");

// ---------- 5. Zuleitung ----------
const cab = { id: 30, type: "cable", pts: [[0, -300], [0, 0], [50, 0]], s: D.CABLE_TEXT };
const cp = D.planPrims([cab]);
assert.strictEqual(cp.filter((p) => p.k === "line" && p.wt).length, 2, "zwei Abschnitte");
const ct = texts(cp)[0];
assert.ok(ct.s === "Zuleitung VNB" && ct.rot === 90 && ct.x < 0 && ct.h === K.OUT_H, "Text am längsten Abschnitt, gedreht links");
assert.ok(D.hitItem(cab, 0, -150, 1) && !D.hitItem(cab, 40, -150, 1));
assert.deepStrictEqual(D.itemBBox(cab), { x0: 0, y0: -300, x1: 50, y1: 0 });
txt = save([cab]);
assert.strictEqual(JSON.parse(txt).version, 12);
assert.deepStrictEqual(load(txt), [cab], "Rundlauf Zuleitung");
assert.ok(exportDxf({ ...newSheet("dispo"), items: [cab] }).includes("\nZuleitung VNB\n"));
console.log("ok zuleitung");

// ---------- 7. Texte ----------
// Jedes Betriebsmittel: Beschriftung und BMK aussen gestapelt, nie überlappend, auch nicht mit dem Bauteil, bei 100, 200, 300 %
const parts = [["NHVG", { s: "250" }], ["NHSILAS", {}], ["NH00", { s2: "Abgang" }], ["VGW00", {}], ["NT", {}], ["NTA", {}], ["ZBOX", {}], ["KASTEN", {}], ["PKZ", {}], ["SPF", {}], ["ZKL", {}], ["SSW", {}], ["WKL", {}], ["BAR_N", {}]];
for (const tf of [1, 2, 3]) {
  for (const [id, extra] of parts) {
    const p = { id: 40, ...K.newPart(id, 0, 0), ...extra, beschr: "Beschriftung lang", bmk: "-11F12", tf };
    const outer = texts(D.planPrims([p])).filter((t) => t.st && !t.inner), body = { x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h };
    assert.ok(outer.some((t) => t.s === "-11F12") && outer.some((t) => t.s === "Beschriftung lang"), `${id}: BMK und Beschriftung`);
    for (const t of outer) assert.ok(Math.abs(t.h - K.OUT_H * tf) < 0.01 && !over(tbox(t), body), `${id} ${tf * 100} %: ${t.s} aussen, 10 mm × Faktor`);
    for (let i = 0; i < outer.length; i++) for (let j = i + 1; j < outer.length; j++) assert.ok(!over(tbox(outer[i]), tbox(outer[j])), `${id} ${tf * 100} %: ${outer[i].s} / ${outer[j].s}`);
    const [b, m] = [outer.find((t) => t.s === "Beschriftung lang"), outer.find((t) => t.s === "-11F12")];
    assert.ok(Math.abs(m.y - p.y - p.h / 2) > Math.abs(b.y - p.y - p.h / 2), `${id}: Beschriftung näher, BMK weiter weg`);
    const gap = Math.min(...outer.map((t) => Math.min(Math.abs(tbox(t).y0 - body.y1), Math.abs(tbox(t).y1 - body.y0))));
    assert.ok(Math.abs(gap - K.OUT_H * tf / 2) < 0.01, `${id}: Abstand ½ Schrifthöhe zur Kante`);
    // Texte innen höchstens Bauteilbreite minus Rand
    for (const t of texts(D.planPrims([p])).filter((t) => (!t.st && t.fit) || t.inner)) { const bx = tbox(t); assert.ok(bx.x0 >= body.x0 - 0.01 && bx.x1 <= body.x1 + 0.01 && bx.y0 >= body.y0 - 0.01 && bx.y1 <= body.y1 + 0.01, `${id} ${tf * 100} %: „${t.s}“ innen`); }
  }
  // Geräte auf der Schiene: Text darüber, Beschriftung, BMK; höchstens gerätebreit, Nachbarn überlappen nicht
  const devs = [0, 1, 2].map((i) => ({ id: 50 + i, type: "device", x: i * D.TE, y: 0, te: 1, h: 83, kind: "LS1", label: "C13", bmk: "-10F" + (i + 1), beschr: "Licht", top: "13", tf }));
  const dt = texts(D.planPrims(devs)).filter((t) => t.st && !t.inner);
  for (const d of devs) for (const t of texts(D.planPrims([d])).filter((t) => t.inner)) assert.ok(tbox(t).x0 >= d.x && tbox(t).x1 <= d.x + D.TE && tbox(t).y0 >= -41.5 && tbox(t).y1 <= 41.5, `Gerät ${tf * 100} %: ${t.s} innen`);
  assert.strictEqual(dt.length, 9);
  for (let i = 0; i < dt.length; i++) {
    assert.ok(tbox(dt[i]).y0 >= 41.5 - 0.01, "über dem Gerät");
    for (let j = i + 1; j < dt.length; j++) assert.ok(!over(tbox(dt[i]), tbox(dt[j])), `Gerät ${tf * 100} %: ${dt[i].s} / ${dt[j].s}`);
  }
  // Problembild: Vertigroup mit grossem Text, Typ innen bleibt in der Leiste (ragte vorher in die NH-Abdeckung)
  const vg = { id: 60, ...K.newPart("NHVG", 0, 0), tf: tf * 2 };
  const typ = texts(D.planPrims([vg])).find((t) => t.s === "NH1");
  assert.ok(tbox(typ).x0 >= 0 && tbox(typ).x1 <= 100, `NH1 bei ${tf * 200} % in der Leiste`);
}
// Beschriftung gespeichert, Version 12
const dv = { id: 70, type: "device", x: 0, y: 0, te: 2, h: 83, kind: "FREI", label: "Gerät", bmk: "F1", beschr: "Steckdosen" };
const nb = { id: 71, ...K.newPart("NH00", 300, 0), beschr: "HV", bmk: "F0" };
txt = save([dv, nb]);
assert.strictEqual(JSON.parse(txt).version, 12);
assert.deepStrictEqual(load(txt), [dv, nb]);
assert.strictEqual(JSON.parse(save([{ ...dv, beschr: undefined }])).version, 3, "ohne neue Felder bleibt die Version tief");
console.log("ok texte");

// ---------- 8. Äussere Bemassung ----------
// Seit Korrektur CJ 16.10.: waagrecht oben (aussen Gesamtmass, näher die Teilmasse), senkrecht links, im Schrank keine automatischen Masse
const zp = (id, x, y, w = 250, h = 400) => ({ id, type: "plate", x, y, w, h, name: "", fixed: true });
const auto = (items, o = {}) => D.planPrims(items, { dims: true, ...o }).filter((p) => p.dk);
const chain = (items, dk) => texts(auto(items).filter((p) => p.dk === dk)).map((t) => t.s);
const two = [zp(80, 0, 0), zp(81, 250, 0)];
assert.deepStrictEqual(chain(two, "ox"), ["250", "250"], "Teilkette 250 | 250 (gleiche Werte bleiben)");
assert.deepStrictEqual(chain(two, "of"), [], "gleiche Punkte wie die Plattenkette: liegt doppelt, entfällt");
assert.deepStrictEqual(chain(two, "oX"), ["500"], "Gesamtmass ganz aussen");
const yOf = (items, dk) => texts(auto(items).filter((p) => p.dk === dk))[0].y;
assert.ok(yOf(two, "oX") > yOf(two, "ox") && yOf(two, "ox") > 400, "oben: Gesamt aussen, Teilkette näher");
assert.deepStrictEqual(chain(two, "p80w"), [], "keine eigenen Plattenmasse mehr, wenn die äussere Kette steht");
assert.deepStrictEqual(chain(two, "oY"), ["400"], "links die Gesamthöhe");
const stack = [zp(82, 0, 0, 250, 250), zp(83, 0, 250, 250, 250)];
assert.deepStrictEqual(chain(stack, "oy"), ["250", "250"], "übereinander: 250 | 250");
assert.deepStrictEqual([chain(stack, "oY"), chain(stack, "oX"), chain(stack, "ox")], [["500"], ["250"], []], "Breite einmal");
assert.deepStrictEqual(chain([zp(84, 0, 0)], "p84w"), ["250"], "eine einzelne Platte behält ihre Masse");
// Schrank wie Bärgen: 3 Felder, je 2 Platten übereinander (Zählerplatten 250 × 400, Montageplatten)
const cb = { id: 85, ...K.newCabinet(0, 100), fields: [{ w: 350, door: "r", t: "" }, { w: 300, door: "r", t: "" }, { w: 600, door: "l", t: "" }] };
const xs = K.fieldXs(cb), pls = [];
xs.slice(0, 3).forEach((x0, i) => { const w = cb.fields[i].w - 50; pls.push(zp(90 + 2 * i, x0 + 25, 125, w, 400), zp(91 + 2 * i, x0 + 25, 525, w, i === 1 ? 400 : 250)); });
const rl = { id: 99, type: "rail", x: xs[2] + 45, y: 700, len: 200 }, ls2 = { id: 98, type: "device", x: xs[2] + 45, y: 700, te: 2, h: 83, kind: "LS2", label: "C13", bmk: "" };
const brg = [cb, ...pls, rl, ls2], A = auto(brg), cbx = K.cabBox(cb);
const inside = (x, y) => x > cbx.x0 + 0.01 && x < cbx.x1 - 0.01 && y > cbx.y0 + 0.01 && y < cbx.y1 - 0.01;
for (const p of A) {
  if (p.k === "line") assert.ok(!inside(p.x1, p.y1) && !inside(p.x2, p.y2) && !inside((p.x1 + p.x2) / 2, (p.y1 + p.y2) / 2), `keine automatische Masslinie im Schrank: ${p.dk} ${JSON.stringify(p)}`);
  if (p.k === "text") assert.ok(!inside(p.x, p.y), `kein automatischer Masstext im Schrank: ${p.dk} ${p.s}`);
}
assert.ok(A.every((p) => !/^(p|r|c)\d/.test(p.dk)), "keine Platten-, Schienen- oder Schrankmasse mehr im Schrank");
const cbW = K.cabW(cb);
assert.deepStrictEqual(chain(brg, "oX"), [String(cbW)], "ganz oben die ganze Breite");
assert.deepStrictEqual(chain(brg, "of"), ["25", "350", "300", "600", "25"], "darunter die Felder mit Seitenwänden");
assert.deepStrictEqual(chain(brg, "ox").filter((s) => s !== "25" && s !== "50"), ["300", "250", "550"], "am nächsten die Plattenbreiten");
assert.ok(yOf(brg, "oX") > yOf(brg, "of") && yOf(brg, "of") > yOf(brg, "ox") && yOf(brg, "ox") > cb.y + cb.h + K.CAB_TEXT, "oben über dem Schranktext");
assert.deepStrictEqual(chain(brg, "oY"), [String(cb.h + cb.plinth)], "links aussen die Gesamthöhe mit Sockel");
assert.deepStrictEqual(chain(brg, "oh"), ["100", "2000"], "Sockel und Höhe");
assert.ok(["400", "250"].every((v) => chain(brg, "oy").includes(v)), "Plattenhöhen 400 und 250 links: " + chain(brg, "oy"));
const xOf = (dk) => texts(auto(brg).filter((p) => p.dk === dk))[0].x;
assert.ok(xOf("oY") < xOf("oh") && xOf("oh") < xOf("oy") && xOf("oy") < cbx.x0, "links: Gesamt aussen, Platten am nächsten");
// gesetzte Masse (Werkzeug B) bleiben, wo sie sind
const dm = { id: 97, ...D.makeDim({ x: 100, y: 300 }, { x: 300, y: 300 }, { x: 200, y: 350 }) };
assert.ok(D.planPrims([...brg, dm], { dims: true }).some((p) => !p.dk && p.k === "line" && p.y1 === 350 && p.x1 === 100), "gesetztes Mass im Schrank bleibt");
// ausblenden wie jedes automatische Mass
assert.deepStrictEqual(texts(auto(two, { off: ["ox"] }).filter((p) => p.dk === "ox")), []);
console.log("ok bemassung aussen");

// ---------- Belegdatei ----------
if (process.argv[2]) {
  const items = [];
  let id = 100;
  const add = (o) => { items.push({ ...o, id: id++ }); return items.at(-1); };
  // Schrank wie Bärgen: 3 Felder, je 2 Platten übereinander (Korrektur CJ 16.10.: Masse nur aussen)
  add({ ...K.newCabinet(-25, -50), name: "UV Beleg", fields: [{ w: 1150, door: "l", t: "" }, { w: 300, door: "r", t: "" }, { w: 350, door: "r", t: "" }] });
  add({ type: "plate", x: 0, y: 0, w: 1100, h: 900, name: "Montageplatte" });
  add({ type: "plate", x: 0, y: 1000, w: 1100, h: 400, name: "Montageplatte" });
  add(zp(0, 1175, 0)); add(zp(0, 1175, 400));
  add({ type: "plate", x: 1475, y: 0, w: 300, h: 400, name: "" }); add({ type: "plate", x: 1475, y: 450, w: 300, h: 600, name: "" });
  add({ ...K.newPart("NHVG", 40, 120), size: "1-3", s: "250", beschr: "Hauptsicherung", bmk: "-1F1", tf: 1 });
  add({ ...K.newPart("NHVG", 160, 120), size: "2-3", s: "400", bmk: "-1F2" });
  add({ ...K.newPart("NHVG", 280, 120), size: "3-3", s: "630", bmk: "-1F3", tf: 2 });
  add({ ...K.newPart("VGW00", 420, 60), bmk: "-1F4", beschr: "Messung" });
  add({ ...K.newPart("VGW1", 510, 120), wl: "L2", bmk: "-1F5" });
  add({ type: "rail", x: 650, y: 820, len: 600, free: true });
  for (let i = 0; i < 4; i++) add({ type: "device", x: 660 + i * 10.2 * 5, y: 820, te: (5 * 10.2) / D.TE, h: 45, kind: "KL", n: 5, qs: "10", label: "", bmk: "-X" + (i + 1), beschr: "", tf: 1 });
  add({ ...K.barFrom("N", { x: 660, y: 640 }, { x: 900, y: 640 }), bmk: "-X5", beschr: "N-Schiene" });
  add({ ...K.barFrom("PE", { x: 660, y: 520 }, { x: 900, y: 520 }), bmk: "-X6" });
  add({ ...K.newPart("NT", 700, 622) });
  // Vorlage AÜU wie im Programm (dispoedit.js aueuItems), Bezug PEN unten bei (850, 100)
  const nt2 = K.newPart("NT", 0, 0), x = 900, y = 100;
  add({ ...K.barFrom("PEN", { x, y }, { x, y: y + 200 }), bmk: "" });
  add({ type: "cable", pts: [[x, y - 150], [x, y]], s: D.CABLE_TEXT });
  add({ ...nt2, x: x - nt2.w / 2, y: y + 200 });
  add(K.barFrom("N", { x, y: y + 200 + nt2.h }, { x, y: y + 350 + nt2.h }));
  add(K.barFrom("PE", { x: x + K.BAR_T / 2, y: y + 200 - K.BAR_T }, { x: x + K.BAR_T / 2 + 200, y: y + 200 - K.BAR_T }));
  const doc = newDoc(), sh = newSheet("dispo");
  sh.sid = 7; sh.meta.TITEL = "Beleg Dispo 16.10."; sh.items = items; doc.sheets = [sh]; doc.nextId = id;
  fs.writeFileSync(process.argv[2], serializeModel(doc));
}
console.log("Dispo Wunsch 16.10.: alle Tests ok");
