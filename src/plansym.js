// Elektrosymbole für das Modul «Plan» (CJ 24.10.2026, Schritt 2): selbst gezeichnet nach der Symbolzusammenfassung (IEC 60617, Haustechnik
// 5.110–5.190, Clean-Room, nichts übernommen). Ohne DOM und ohne Importe, mit node testbar.
// Masse in Papier-mm (Symbol ca. 5 mm, fest auf dem Papier wie Texte; in der Welt × Massstab), y nach oben, Ursprung = Einsetzpunkt.
// Wandsymbole (wall: true): Ursprung auf der Wandfläche, das Symbol steht nach +y in den Raum. Übrige: Ursprung = Mitte.
// Teile: ["l", x1, y1, x2, y2] Linie, ["c", cx, cy, r, fill] Kreis, ["p", d, fill] Pfad (SVG, y nach oben: Bogen-Flag 1 = gegen den Uhrzeigersinn), ["t", x, y, h, s] Text (Mitte; dreht mit, steht nie auf dem Kopf).
// ap = Aufputz-Teil (Halbkreis) oder false. cat = Kategorie für die Farben (Farbcodes 5.100, CAT_COL in plan.js): kraft, licht, kommunikation, schwach, allg, leitung (wie die Leitungen).
// h = Standardhöhe in cm (CJ 26.10.2026: Steckdose 30, Schalter 110, Leuchten ohne); im Plan beschriftet wird nur eine abweichende Höhe.

const r3 = (n) => Math.round(n * 1000) / 1000 + 0;
const L = (x1, y1, x2, y2) => ["l", r3(x1), r3(y1), r3(x2), r3(y2)];
const C = (cx, cy, r, fill = false) => ["c", cx, cy, r, fill];
const T = (x, y, h, s) => ["t", x, y, h, s];
const box = (x0, y0, x1, y1) => [L(x0, y0, x1, y0), L(x1, y0, x1, y1), L(x1, y1, x0, y1), L(x0, y1, x0, y0)];
const X = (cx, cy, s) => [L(cx - s, cy - s, cx + s, cy + s), L(cx - s, cy + s, cx + s, cy - s)];

// ---------- Schalter 5.140: Kreis, Hebel nach rechts oben, Querstrich(e) am Ende ----------
// Kreis über der Wand (Höhe cy); Sch. 3 und 6 höher, damit die Hebel nach unten nicht in die Wand ragen
const SC = [0, 2.2], SR = 1, CY3 = 2.5, CY6 = 3.1;
const dir = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
// out: Querstrich waagrecht nach aussen statt quer zum Hebel (Sch. 6, CJ 26.10.2026: gespiegelt wie die Quelle, nicht im Kreis gedreht)
function lever(deg = 45, ticks = 1, cy = SC[1], len = 3.2, out0 = false) {
  const u = dir(deg), t = out0 ? [Math.sign(u[0]), 0] : dir(deg - 90), out = [L(u[0] * SR, cy + u[1] * SR, u[0] * len, cy + u[1] * len)];
  for (let i = 0; i < ticks; i++) { const s = len - i * 0.55, p = [u[0] * s, cy + u[1] * s]; out.push(L(p[0], p[1], p[0] + t[0] * 0.9, p[1] + t[1] * 0.9)); }
  return out;
}
const sw = (extra = [], cy = SC[1]) => [C(SC[0], cy, SR), ...extra];
// Aufputz: rechte Hälfte des Kreises gefüllt wie die Quelle (CJ 26.10.2026; Feld «Aufputz»)
const apHalf = (cy) => ["p", `M0,${cy + SR}A1 1 0 0 0 0,${cy - SR}Z`, true];
const lpt = (deg, t, cy) => { const u = dir(deg); return [u[0] * t, cy + u[1] * t]; };
const tri = (a, b, c, fill = false) => ["p", `M${[a, b, c].map((p) => p.map(r3).join(",")).join("L")}Z`, fill];
const add2 = (p, x, y) => [p[0] + x, p[1] + y];

// ---------- Steckdosen 5.160: Stiel von der Wand, Bogen am Ende (Öffnung zum Raum), Querstrich = Schutzkontakt ----------
// Aufputz Steckdose (CJ 26.10.2026): rechte Hälfte der Fläche im Bogen gefüllt, wie beim Schalter
const apSock = (oy = 0) => ["p", `M0,${oy + 3.9}L1.5,${oy + 3.9}A1.5 1.5 0 0 0 0,${oy + 2.4}Z`, true];
// Mehrfachsteckdose 5.160: Schrägstrich durch den Stiel zur Zahl (Text ["t", …, "num"]: am Symbol änderbar, Feld num)
const multi = (n, oy = 0) => [L(-0.7, oy + 2.95, 1.3, oy + 1.45), ["t", 2.0, oy + 1.2, 1.4, n, "num"]];
const SOCK = (s = 1, oy = 0, pe = true) => [["p", `M${-1.5 * s},${oy + 3.9 * s}A${1.5 * s} ${1.5 * s} 0 0 1 ${1.5 * s},${oy + 3.9 * s}`, false], L(0, oy, 0, oy + 2.4 * s), ...(pe ? [L(-1.5 * s, oy + 2.4 * s, 1.5 * s, oy + 2.4 * s)] : [])]; // CJ 24.10.2026: Stiel an der Wand, Bogen zum Raum offen; Variante B: Querstrich am Bogenscheitel, so breit wie der Bogen (5.160)

// ---------- Leuchten 5.190 ----------
const halfC = (r) => ["p", `M${-r},0A${r} ${r} 0 0 0 ${r},0Z`, false];
const arcW = (r) => ["p", `M${-r},0A${r} ${r} 0 0 0 ${r},0`, false]; // nur Bogen (Wand-Einbau: zweite Linie)
const rect = (x0, y0, x1, y1) => box(x0, y0, x1, y1);
// Spot mit Kennung (HV, LED, ELV) nach 5.190 (CJ 26.10.2026: alle Leuchten der Quelle): an/in Decke = Kreis/Doppelkreis, an/in Wand = Halbkreis/mit
// zweitem Bogen, mit Trafo = schmales Rechteck an der Leuchte (Decke: oben am Kreis, Wand: entlang der Wand neben dem Halbkreis)
function spot(lab, wall, inn, trafo) {
  if (!wall) return [...(inn ? [C(0, 0, 2.1), C(0, 0, 1.7)] : [C(0, 0, 1.8)]), T(0, 0, inn ? 1.25 : 1.35, lab), ...(trafo ? rect(-0.45, inn ? 2.1 : 1.8, 0.45, (inn ? 2.1 : 1.8) + 2.2) : [])];
  return [halfC(2), ...(inn ? [arcW(1.6)] : []), T(0, inn ? 0.7 : 0.85, inn ? 0.85 : 1.05, lab), ...(trafo ? rect(2, 0, 4.2, 0.9) : [])];
}
const spotO = (wall, trafo) => (wall ? { wall: true, c: trafo ? [1, 1] : [0, 1], r: trafo ? 3.4 : 2.4 } : { c: trafo ? [0, 1.1] : [0, 0], r: trafo ? 3.3 : 2.4 });
// Notleuchte: Kreuz, die Felder zur Seite (Decke: links und rechts, Wand: entlang der Wand) gefüllt
const sect = (r, a0, a1) => { const p = (a) => [r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180)].map(r3); return ["p", `M0,0L${p(a0)}A${r} ${r} 0 0 1 ${p(a1)}Z`, true]; };
function notl(wall, inn, trafo) {
  const r = 1.8, d = r * Math.SQRT1_2;
  if (!wall) return [...(inn ? [C(0, 0, 2.2)] : []), C(0, 0, r), L(-d, -d, d, d), L(-d, d, d, -d), sect(r, 135, 225), sect(r, 315, 405), ...(trafo ? rect(-0.45, inn ? 2.2 : r, 0.45, (inn ? 2.2 : r) + 2.2) : [])];
  return [halfC(2), ...(inn ? [arcW(2.4)] : []), L(0, 0, -1.414, 1.414), L(0, 0, 1.414, 1.414), sect(2, 0, 45), sect(2, 135, 180), ...(trafo ? rect(inn ? 2.4 : 2, 0, (inn ? 2.4 : 2) + 2.2, 0.9) : [])];
}
// Notausgangsleuchte EXIT 5.190 (CJ 26.10.2026: wie die Quelle): dunkles Schild, weisser Pfeil (Winkel deg) und weisse Fluchtfigur in der Tür,
// selbst gezeichnet. side = Seite des Pfeils (−1 links, 1 rechts), die Figur läuft zum Pfeil.
function exitSign(deg, side) {
  const P2 = (x, y) => `${r3(x)},${r3(y)}`, ax = side * 2.3, fx = -side * 2.1, m = side, a = (deg * Math.PI) / 180;
  const rot = ([x, y]) => [ax + x * Math.cos(a) - y * Math.sin(a), y * Math.cos(a) + x * Math.sin(a)];
  const arrow = [[-1.1, -0.28], [0.2, -0.28], [0.2, -0.85], [1.1, 0], [0.2, 0.85], [0.2, 0.28], [-1.1, 0.28]].map(rot);
  const fig = (pts) => ["p", `M${pts.map(([x, y]) => P2(fx + x * m, y)).join("L")}`, "wl", 0.32];
  return [["p", "M-4.6,-1.8h9.2v3.6h-9.2Z", true], ["p", `M${arrow.map((p) => P2(...p)).join("L")}Z`, "w"],
    ["p", `M${P2(fx - 0.95, -1.45)}h1.9v2.9h-1.9Z`, "wl", 0.15], ["p", `M${P2(fx + 0.25 * m - 0.3, 0.95)}a0.3 0.3 0 1 0 0.6,0a0.3 0.3 0 1 0 -0.6,0Z`, "w"],
    fig([[0.1, 0.55], [-0.15, -0.2]]), fig([[0.05, 0.4], [0.5, 0.1], [0.75, 0.35]]), fig([[0.05, 0.4], [-0.35, 0.15], [-0.55, -0.15]]), fig([[-0.15, -0.2], [0.35, -0.6], [0.3, -1.2]]), fig([[-0.15, -0.2], [-0.45, -0.75], [-0.85, -0.8]])];
}
const wave = (x0, x1, y = 0) => { const n = 2, w = (x1 - x0) / n; let d = `M${x0},${y}`; for (let i = 0; i < n; i++) d += `q${w / 4},${-0.6} ${w / 2},0t${w / 2},0`; return ["p", d, false]; };

// ---------- Steigleitungen 5.110: Punkt (Kreis), Linie unter 45°, halber Pfeil (offenes Dreieck links der Linie) ----------
const DG = Math.SQRT1_2, at45 = (t) => [t * DG, t * DG];
const half = (t0, t1) => { const a = at45(t0), b = at45(t1), q = [a[0] - 0.75 * DG, a[1] + 0.75 * DG]; return [L(a[0], a[1], b[0], b[1]), L(b[0], b[1], q[0], q[1]), L(q[0], q[1], a[0], a[1])]; }; // Spitze bei t1
const seg45 = (t0, t1) => L(...at45(t0), ...at45(t1));

// size: Grösse in echten mm (w Breite/Länge, t Tiefe), parts(W, T) zeichnet in Papier-mm; parts der Tabelle = Vorgabe bei 1:50 (Palette)
// pin = [cx, cy, r]: vier Fangpunkte für Leitungen oben, rechts, unten, links am Rand (Schalter: Kreis, Steckdosen: Bogen; CJ 26.10.2026).
// edge = [x0, y0, x1, y1]: Fang auf allen Seiten des Kastens (Abzweigdose). Ohne beides fängt die Leitung an der Mitte c.
// c = Mitte (Treffer, Fang); Schalter: Mitte des Kreises (CJ 26.10.2026: vorher [0, 2], Leitung rastete 0,2 mm Papier unter dem Kreis ein)
const S = (key, label, cat, group, parts, o = {}) => ({ key, label, cat, group, parts: o.size ? o.size.parts(o.size.w / 50, (o.size.t ?? 0) / 50) : parts, size: o.size, wall: !!o.wall, h: o.h, ap: o.ap === true ? apHalf(o.cy ?? SC[1]) : o.ap || false, num: parts.find((q) => q[0] === "t" && q[5] === "num")?.[4], c: o.c ?? (group === "Schalter" ? [0, o.cy ?? SC[1]] : o.wall ? [0, 2] : [0, 0]), pin: o.pin ?? (group === "Schalter" ? [0, o.cy ?? SC[1], SR] : group === "Steckdosen" ? [0, 3.9, 1.5] : null), edge: o.edge ?? null, r: o.r ?? 2.6, ref: !!o.ref });
// Tabellen als /* @__PURE__ */-Aufrufe: so fallen sie im SchemaCAD-Bau ganz weg (v3 byte-gleich), obwohl plan.js sie importiert
export const PLAN_SYMS = /* @__PURE__ */ (() => [
  // Schalter (Unterputz; Aufputz über Feld)
  S("SCH0", "Schalter Sch. 0, 1-polig", "licht", "Schalter", sw(lever()), { wall: true, h: 110, ap: true }),
  S("SCH0_2", "Schalter Sch. 0, 2-polig", "licht", "Schalter", sw(lever(45, 2)), { wall: true, h: 110, ap: true }),
  S("SCH3", "Schalter Sch. 3 (Wechsel)", "licht", "Schalter", sw([...lever(45, 1, CY3), ...lever(225, 1, CY3)], CY3), { wall: true, h: 110, ap: true, cy: CY3, c: [0, CY3], r: 3 }),
  S("SCH6", "Schalter Sch. 6 (Kreuz)", "licht", "Schalter", sw([45, 135, 225, 315].flatMap((d) => lever(d, 1, CY6, 3.2, true)), CY6), { wall: true, h: 110, ap: true, cy: CY6, c: [0, CY6], r: 3.3 }),
  S("TASTER", "Drucktaster", "licht", "Schalter", sw([L(0.71, 2.91, 2.4, 4.6), L(1.8, 5.2, 3, 4)]), { wall: true, h: 110, ap: true }),
  S("DIMMER", "Lichtregler (Dimmer)", "licht", "Schalter", sw([...lever(45, 0), (() => { const a = lpt(45, 1.7, SC[1]); return tri(a, add2(a, 1.6, 0.8), add2(a, 1.6, 0)); })()]), { wall: true, h: 110, ap: true }),
  S("STOREN", "Storenschalter", "kraft", "Schalter", sw([...lever(45, 0), ...(() => { const e = lpt(45, 3.2, SC[1]); return [tri(add2(e, -0.65, 0.95), add2(e, 0.35, 0.95), add2(e, -0.15, 0.15)), tri(add2(e, 0.35, -0.45), add2(e, 1.35, -0.45), add2(e, 0.85, 0.35))]; })()]), { wall: true, h: 110, ap: true }),
  S("SCH_LAMPE", "Schalter mit Signallampe", "licht", "Schalter", sw([...X(SC[0], SC[1], 0.7), ...lever()]), { wall: true, h: 110 }),
  // Steckdosen
  S("STD", "Steckdose T13 (Schutzkontakt)", "kraft", "Steckdosen", SOCK(), { wall: true, h: 30, ap: apSock() }),
  S("STD2", "Steckdose 2-fach", "kraft", "Steckdosen", [...SOCK(), ...multi("2")], { wall: true, h: 30, ap: apSock() }),
  S("STD3", "Steckdose 3-fach", "kraft", "Steckdosen", [...SOCK(), ...multi("3")], { wall: true, h: 30, ap: apSock() }),
  S("STD_T15", "Steckdose T15", "kraft", "Steckdosen", [...SOCK(), T(2.9, 1.0, 1.4, "T15")], { wall: true, h: 30, ap: apSock() }),
  // T13 mit USB wie Quelle: T13 über dem Bogen, USB-Zeichen im Bogen, Schrägstrich zur Anzahl (änderbar)
  S("STD_USB", "Steckdose T13 mit USB", "kraft", "Steckdosen", [...SOCK(), ...multi("2"), T(0, 5.1, 1.1, "T13"), L(-0.85, 3.35, 0.75, 3.35), C(-0.85, 3.35, 0.18, true), tri([0.75, 3.12], [1.1, 3.35], [0.75, 3.58], true), L(-0.35, 3.35, -0.1, 3.7), L(-0.1, 3.7, 0.3, 3.7), L(0.05, 3.35, 0.3, 3.05), L(0.3, 3.05, 0.55, 3.05)], { wall: true, h: 30, ap: apSock() }),
  S("STD_BODEN", "Bodensteckdose", "kraft", "Steckdosen", [...box(-1.8, -1.8, 1.8, 1.8), ...SOCK(0.75, -1.4625)], { pin: [0, 0, 1.8] }), // Steckdose mittig im Kasten (CJ 26.10.2026)
  // KOMBI wie Quelle: Schalterkreis an der Wand, kurzer Stiel (halb so lang) zur Steckdose, Hebel waagrecht mit Querstrich zum Raum
  S("KOMBI", "KOMBI Gr. 1 Schalter/Steckdose", "kraft", "Steckdosen", [C(0, 1.2, SR), L(0, 2.2, 0, 3.4), L(-1.5, 3.4, 1.5, 3.4), ["p", "M-1.5,4.9A1.5 1.5 0 0 1 1.5,4.9", false], L(0.95, 1.5, 2.6, 1.5), L(2.6, 1.5, 2.6, 2.3)], { pin: [0, 4.9, 1.5], wall: true, h: 110, ap: apHalf(1.2), c: [0, 2.6], r: 3 }),
  // Leuchten
  S("LEUCHTE", "Leuchte an Decke", "licht", "Leuchten", X(0, 0, 1.4), { r: 2 }),
  S("LEUCHTE_EB", "Einbauleuchte an Decke", "licht", "Leuchten", [C(0, 0, 1.7), ...X(0, 0, 1.2)], { r: 2 }),
  S("LEUCHTE_W", "Leuchte an Wand", "licht", "Leuchten", [L(-1.5, 0, 1.5, 0), ...X(0, 1.5, 1.5)], { wall: true, c: [0, 1.5] }),
  S("LEUCHTE_WEB", "Wand-Einbauleuchte", "licht", "Leuchten", [halfC(1.8), L(0, 0, -1.273, 1.273), L(0, 0, 1.273, 1.273)], { wall: true, c: [0, 1] }),
  S("LED", "LED-Spot an Decke", "licht", "Spots", [C(0, 0, 1.8), T(0, 0, 1.35, "LED")], { r: 2.1 }),
  S("LED_EB", "LED-Spot in Decke", "licht", "Spots", [C(0, 0, 2.1), C(0, 0, 1.7), T(0, 0, 1.25, "LED")], { r: 2.4 }),
  S("LED_W", "LED-Spot an Wand", "licht", "Spots", [halfC(2), T(0, 0.85, 1.05, "LED")], { wall: true, c: [0, 1] }),
  // Balkenleuchten und Rasterleuchten 5.190, Länge in echten mm (CJ 26.10.2026)
  S("FL", "FL-Armatur (Balkenleuchte)", "licht", "Leuchten", [], { r: 3, size: { w: 1200, parts: (W) => [L(-W / 2, 0, W / 2, 0), L(-W / 2, -0.6, -W / 2, 0.6), L(W / 2, -0.6, W / 2, 0.6)] } }),
  S("FL2", "FL-Armatur 2-flammig", "licht", "Leuchten", [], { r: 3, size: { w: 1200, parts: (W) => [L(-W / 2, -0.4, W / 2, -0.4), L(-W / 2, 0.4, W / 2, 0.4), L(-W / 2, -0.9, -W / 2, 0.9), L(W / 2, -0.9, W / 2, 0.9)] } }),
  S("FL_R", "FL-Armatur mit Raster/Reflektor", "licht", "Leuchten", [], { r: 3, size: { w: 1200, t: 150, parts: (W, T) => box(-W / 2, -T / 2, W / 2, T / 2) } }),
  S("RASTER", "Einbau-/Aufbauleuchte im Rastermass", "licht", "Leuchten", [], { r: 3, size: { w: 625, t: 625, parts: (W, T) => box(-W / 2, -T / 2, W / 2, T / 2) } }),
  S("SPIEGEL", "Spiegelschrank mit Leuchte", "licht", "Leuchten", [], { wall: true, r: 3, size: { w: 800, t: 150, parts: (W, T) => [...box(-W / 2, 0, W / 2, T), ...box(-W / 2 + 0.25, 0.25, W / 2 - 0.25, Math.max(T - 0.25, 0.3))] } }),
  S("SPOT", "Scheinwerfer, Spot", "licht", "Leuchten", [["p", "M-1.4,1.5A2 2 0 0 1 -1.4,-1.5", false], C(-0.4, 0, 0.75), ...X(-0.4, 0, 0.53), L(0.6, 0.45, 2.6, 0.45), L(0.6, -0.45, 2.6, -0.45), tri([2.2, 0.75], [2.7, 0.45], [2.2, 0.15], true), tri([2.2, -0.15], [2.7, -0.45], [2.2, -0.75], true)], { r: 2.8, c: [0.6, 0] }),
  S("KANDELABER", "Kandelaberleuchte", "licht", "Leuchten", [...box(-2, -1.1, 2, 1.1), C(-1, 0, 0.35), C(0.9, -0.1, 0.5), ...X(0.9, -0.1, 0.35), ["p", "M0.15,-0.05A0.8 0.8 0 0 1 1.65,-0.05", false]], { r: 2.3 }),
  S("STEHLEUCHTE", "Stehleuchte", "licht", "Leuchten", [...box(-0.9, -1, 2.9, 1), C(-0.2, 0, 0.35), L(0.6, 0, 2.2, 0), L(0.6, -0.5, 0.6, 0.5), L(2.2, -0.5, 2.2, 0.5), L(-1.7, 0, -0.9, 0), wave(-3.5, -1.7), ["p", "M-4.3,-0.3h0.8v0.6h-0.8Z", true]], { r: 3.7, c: [-0.7, 0] }),
  S("WEGLEUCHTE", "Wegleuchte", "licht", "Leuchten", [...box(-2, -1.1, 2, 1.1), C(-1, 0, 0.35), ...X(0.9, 0, 0.55)], { r: 2.3 }),
  // Spots 5.190: Hochvolt (HV), LED, Niedervolt (ELV), an/in Decke oder Wand, mit Trafo
  ...[["HV", "Hochvoltspot"], ["LED", "LED-Spot"], ["ELV", "Niedervoltspot"]].flatMap(([lab, nm]) => [[false, false, false], [false, true, false], [true, false, false], [true, true, false], [false, false, true], [false, true, true], [true, false, true], [true, true, true]]
    .filter(([w, i, t]) => !(lab === "LED" && !t && !(w && i)) && !(lab === "HV" && t)) // LED an/in Decke und an Wand gibt es schon (LED, LED_EB, LED_W); HV ohne Trafo
    .map(([w, i, t]) => S(`${lab}${i ? "_EB" : ""}${w ? "_W" : ""}${t ? "_TR" : ""}`.replace("_EB_W", "_WEB"), `${nm} ${i ? "in" : "an"} ${w ? "Wand" : "Decke"}${t ? " mit Trafo" : ""}`, "licht", "Spots", spot(lab, w, i, t), spotO(w, t)))),
  // Notlicht 5.190
  S("NOTL", "Notleuchte", "licht", "Notlicht", [tri([-1.3, 0.8], [-1.3, -0.8], [0, 0], true), tri([1.3, 0.8], [1.3, -0.8], [0, 0], true)], { r: 1.6 }),
  ...[[false, false, false], [false, true, false], [true, false, false], [true, true, false], [false, false, true], [false, true, true], [true, false, true], [true, true, true]]
    .map(([w, i, t]) => S(`NOTL${i ? "_EB" : ""}${w ? "_W" : "_D"}${t ? "_TR" : ""}`.replace("_EB_W", "_WEB").replace("_EB_D", "_EB"), `Notleuchte ${i ? "in" : "an"} ${w ? "Wand" : "Decke"}${t ? " mit Trafo" : ""}`, "licht", "Notlicht", notl(w, i, t), spotO(w, t))),
  S("NOTHAND", "Nothandleuchte", "licht", "Notlicht", [...X(-1.8, 0, 0.9), ["p", "M-1.3,0.9A1.3 1.3 0 0 1 -1.3,-0.9", false], wave(-0.6, 1.6), ["p", "M1.6,-0.3h0.8v0.6h-0.8Z", true]], { r: 2.8 }),
  S("BEREIT", "Bereitschaftsschaltung", "licht", "Notlicht", [...box(-1.2, -1.8, 1.2, 1.8), L(-1.2, -1.8, 1.2, 1.8), L(-1.2, 1.8, 1.2, -1.8)], { r: 2.2 }),
  S("DAUER_S", "Dauerlicht geschaltet", "licht", "Notlicht", [...box(-1.2, -1.8, 1.2, 1.8), L(-1.2, -1.8, 1.2, 1.8), L(-1.2, 1.8, 1.2, -1.8), tri([-1.2, -1.8], [1.2, -1.8], [0, 0], true)], { r: 2.2 }),
  S("DAUER", "Dauerlicht", "licht", "Notlicht", [...box(-1.2, -1.8, 1.2, 1.8), tri([-1.2, -1.8], [1.2, -1.8], [0, 0], true), tri([-1.2, 1.8], [1.2, 1.8], [0, 0], true)], { r: 2.2 }),
  ...[["EXIT_L", "links", 180, -1], ["EXIT_R", "rechts", 0, 1], ["EXIT_DL", "abwärts links", 225, -1], ["EXIT_DR", "abwärts rechts", 315, 1], ["EXIT_UL", "aufwärts links", 135, -1], ["EXIT_UR", "aufwärts rechts", 45, 1], ["EXIT_D", "durch Ausgang", 270, -1]]
    .map(([k, nm, d, sd]) => S(k, `Notausgangsleuchte EXIT ${nm}`, "licht", "Notlicht", exitSign(d, sd), { r: 4.9 })),
  // Melder
  S("BWM", "Bewegungsmelder an Decke, 360°", "licht", "Melder", [...X(0, 0, 0.5), ...[0, 45, 90, 135, 180, 225, 270, 315].map((d) => { const u = dir(d); return L(u[0] * 0.8, u[1] * 0.8, u[0] * 1.9, u[1] * 1.9); })], { r: 2.2 }),
  S("PIR", "PIR-Melder in Einlasskasten", "licht", "Melder", [C(0, 1.3, 1.2), ["p", "M-0.4,0.8A0.7 0.7 0 0 1 -0.4,1.8", false], L(0, 2.5, 0, 4.4), L(0, 2.5, -0.4, 3.2), L(0, 2.5, 0.4, 3.2)], { wall: true, h: 110 }),
  // Geräte 5.180: Quadrat 4 mm mit Zeichen
  S("GERAET", "Elektrogerät, Geräteanschluss", "kraft", "Geräte", [...box(-2, -2, 2, 2), ["p", "M0.9,1.3L-0.5,0.1L0.5,0L-0.9,-1.3", false], L(-0.9, -1.3, -0.3, -1.25), L(-0.9, -1.3, -0.85, -0.7)]),
  S("HERD", "Elektroherd", "kraft", "Geräte", [...box(-2, -2, 2, 2), C(-0.9, -0.8, 0.45, true), C(0.9, 0.8, 0.45, true), C(0.9, -0.8, 0.45, true)]),
  S("BACKOFEN", "Backofen", "kraft", "Geräte", [...box(-2, -2, 2, 2), L(-2, 1, 2, 1), C(0, -0.6, 0.45, true)]),
  S("MIKRO", "Mikrowelle", "kraft", "Geräte", [...box(-2, -2, 2, 2), ...[-0.8, 0, 0.8].map((y) => ["p", `M-1.2,${y}q0.4,0.4 0.8,0t0.8,0t0.8,0`, false])]),
  S("GSP", "Geschirrspüler", "kraft", "Geräte", [...box(-2, -2, 2, 2), ...[[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => L(2 * a, 2 * b, 0.78 * a, 0.78 * b)), C(0, 0, 1.1), C(0, 0, 0.45, true)]), // wie Quelle: Diagonalen bis zum Kreis, Punkt in der Mitte
  S("KUEHL", "Kühlgerät", "kraft", "Geräte", [...box(-2, -2, 2, 2), L(0, -1.3, 0, 1.3), L(-1.1, -0.65, 1.1, 0.65), L(-1.1, 0.65, 1.1, -0.65)]),
  S("VENT", "Ventilator (Dampfabzug)", "kraft", "Geräte", [...box(-2, -2, 2, 2), C(-0.65, 0, 0.65), C(0.65, 0, 0.65)]),
  S("BOILER", "Wassererwärmer", "kraft", "Geräte", [C(0, 0, 2), ...[-1.2, -0.6, 0, 0.6, 1.2].map((x) => { const y = Math.sqrt(4 - x * x); return L(x, -y, x, y); })]),
  // Allgemein 5.110
  S("DOSE", "Abzweigdose", "allg", "Allgemein", [...box(-1.5, -1.5, 1.5, 1.5), C(0, 0, 0.4, true)], { r: 1.8 }),
  S("EINLASS", "Einlasskasten Gr. 1", "allg", "Allgemein", [C(0, 0, 1.5), ["p", "M0,0L1.5,0A1.5 1.5 0 0 0 0,-1.5Z", true]], { r: 1.8 }),
  S("VERTEILER", "Verteiler (Schaltgerätekombination)", "kraft", "Allgemein", [], { wall: true, c: [0, 1.2], r: 3, size: { w: 600, t: 200, parts: (W, T) => [...box(-W / 2, 0, W / 2, T), ["p", `M${r3(-W / 2)},0L${r3(W / 2)},${r3(T)}L${r3(W / 2)},0Z`, true]] } }),
  S("ANSCHLUSS", "Anschluss Elektro", "kraft", "Allgemein", [C(-1.4, -1.4, 0.4), ["p", "M-1.1,-1.1L0.4,0.4L-0.2,0.7L1.4,1.9", false], L(-1.1, -1.1, -0.45, -0.95), L(-1.1, -1.1, -0.95, -0.45)], { r: 2.1 }),
  // Steigleitungen (Leitung nach oben, nach unten, durchgehend); cat leitung = Farbe der Leitungen
  S("STEIG_AUF", "Leitung nach oben", "leitung", "Allgemein", [C(0, 0, 0.4), seg45(0.4, 4.2), ...half(3.2, 4.2)], { r: 2.4, c: [1.5, 1.5] }),
  S("STEIG_AB", "Leitung nach unten", "leitung", "Allgemein", [C(0, 0, 0.4), seg45(-4.2, -0.4), ...half(-1.5, -0.5)], { r: 2.4, c: [-1.5, -1.5] }),
  S("STEIG_DURCH", "Leitung durchgehend", "leitung", "Allgemein", [C(0, 0, 0.4), seg45(-4.2, -0.4), seg45(0.4, 4.2), ...half(-1.5, -0.5), ...half(3.2, 4.2)], { r: 3.2 }),
  // Hinweis (CJ 26.10.2026, Vorlage aus CJs Plan): runder Kasten mit Zeilen (oben, unten, Kabel), dünne Linie zum Ziel; Kasten ziehbar (lo). Zeichnung in plan.js refParts
  S("VERWEIS", "Hinweis (Kasten mit Linie)", "allg", "Allgemein", [["p", "M-11,1.6h6.4a1 1 0 0 1 1,1v3.6a1 1 0 0 1 -1,1h-6.4a1 1 0 0 1 -1,-1v-3.6a1 1 0 0 1 1,-1Z", false], L(-11.4, 4.4, -3.6, 4.4), L(-3.6, 1.6, 0, 0)], { c: [0, 0], r: 1.2, ref: true }),
])();
export const SYM_BY_KEY = /* @__PURE__ */ (() => new Map(PLAN_SYMS.map((s) => [s.key, s])))();
export const SYM_GROUPS = /* @__PURE__ */ (() => [...new Set(PLAN_SYMS.map((s) => s.group))])();
