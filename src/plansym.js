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

// ---------- Steigleitungen 5.110: Punkt (Kreis), Linie unter 45°, halber Pfeil (offenes Dreieck links der Linie) ----------
const DG = Math.SQRT1_2, at45 = (t) => [t * DG, t * DG];
const half = (t0, t1) => { const a = at45(t0), b = at45(t1), q = [a[0] - 0.75 * DG, a[1] + 0.75 * DG]; return [L(a[0], a[1], b[0], b[1]), L(b[0], b[1], q[0], q[1]), L(q[0], q[1], a[0], a[1])]; }; // Spitze bei t1
const seg45 = (t0, t1) => L(...at45(t0), ...at45(t1));

const S = (key, label, cat, group, parts, o = {}) => ({ key, label, cat, group, parts, wall: !!o.wall, h: o.h, ap: o.ap === true ? apHalf(o.cy ?? SC[1]) : o.ap || false, num: parts.find((q) => q[0] === "t" && q[5] === "num")?.[4], c: o.c ?? (o.wall ? [0, 2] : [0, 0]), r: o.r ?? 2.6, ref: !!o.ref });
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
  S("STD_BODEN", "Bodensteckdose", "kraft", "Steckdosen", [...box(-1.8, -1.8, 1.8, 1.8), ...SOCK(0.75, -1.4625)], {}), // Steckdose mittig im Kasten (CJ 26.10.2026)
  // KOMBI wie Quelle: Schalterkreis an der Wand, kurzer Stiel (halb so lang) zur Steckdose, Hebel waagrecht mit Querstrich zum Raum
  S("KOMBI", "KOMBI Gr. 1 Schalter/Steckdose", "kraft", "Steckdosen", [C(0, 1.2, SR), L(0, 2.2, 0, 3.4), L(-1.5, 3.4, 1.5, 3.4), ["p", "M-1.5,4.9A1.5 1.5 0 0 1 1.5,4.9", false], L(0.95, 1.5, 2.6, 1.5), L(2.6, 1.5, 2.6, 2.3)], { wall: true, h: 110, ap: apHalf(1.2), c: [0, 2.6], r: 3 }),
  // Leuchten
  S("LEUCHTE", "Leuchte an Decke", "licht", "Leuchten", X(0, 0, 1.4), { r: 2 }),
  S("LEUCHTE_EB", "Einbauleuchte an Decke", "licht", "Leuchten", [C(0, 0, 1.7), ...X(0, 0, 1.2)], { r: 2 }),
  S("LEUCHTE_W", "Leuchte an Wand", "licht", "Leuchten", [L(-1.5, 0, 1.5, 0), ...X(0, 1.5, 1.5)], { wall: true, c: [0, 1.5] }),
  S("LEUCHTE_WEB", "Wand-Einbauleuchte", "licht", "Leuchten", [halfC(1.8), L(0, 0, -1.273, 1.273), L(0, 0, 1.273, 1.273)], { wall: true, c: [0, 1] }),
  S("LED", "LED-Spot an Decke", "licht", "Leuchten", [C(0, 0, 1.8), T(0, 0, 1.35, "LED")], { r: 2.1 }),
  S("LED_EB", "LED-Spot in Decke", "licht", "Leuchten", [C(0, 0, 2.1), C(0, 0, 1.7), T(0, 0, 1.25, "LED")], { r: 2.4 }),
  S("LED_W", "LED-Spot an Wand", "licht", "Leuchten", [halfC(2), T(0, 0.85, 1.05, "LED")], { wall: true, c: [0, 1] }),
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
  S("VERTEILER", "Verteiler (Schaltgerätekombination)", "kraft", "Allgemein", [...box(-2.8, 0, 2.8, 2.4), ["p", "M-2.8,0L2.8,2.4L2.8,0Z", true]], { wall: true, c: [0, 1.2], r: 3 }),
  S("ANSCHLUSS", "Anschluss Elektro", "kraft", "Allgemein", [C(-1.4, -1.4, 0.4), ["p", "M-1.1,-1.1L0.4,0.4L-0.2,0.7L1.4,1.9", false], L(-1.1, -1.1, -0.45, -0.95), L(-1.1, -1.1, -0.95, -0.45)], { r: 2.1 }),
  // Steigleitungen (Leitung nach oben, nach unten, durchgehend); cat leitung = Farbe der Leitungen
  S("STEIG_AUF", "Leitung nach oben", "leitung", "Allgemein", [C(0, 0, 0.4), seg45(0.4, 4.2), ...half(3.2, 4.2)], { r: 2.4, c: [1.5, 1.5] }),
  S("STEIG_AB", "Leitung nach unten", "leitung", "Allgemein", [C(0, 0, 0.4), seg45(-4.2, -0.4), ...half(-1.5, -0.5)], { r: 2.4, c: [-1.5, -1.5] }),
  S("STEIG_DURCH", "Leitung durchgehend", "leitung", "Allgemein", [C(0, 0, 0.4), seg45(-4.2, -0.4), seg45(0.4, 4.2), ...half(-1.5, -0.5), ...half(3.2, 4.2)], { r: 3.2 }),
  S("VERWEIS", "Hinweispfeil (Verweis)", "allg", "Allgemein", [...box(-8, -1.3, -1.8, 1.3), ["p", "M-1.8,-1.3L0,0L-1.8,1.3Z", true]], { c: [-4, 0], r: 3.5, ref: true }),
])();
export const SYM_BY_KEY = /* @__PURE__ */ (() => new Map(PLAN_SYMS.map((s) => [s.key, s])))();
export const SYM_GROUPS = /* @__PURE__ */ (() => [...new Set(PLAN_SYMS.map((s) => s.group))])();
