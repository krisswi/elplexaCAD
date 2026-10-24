// Elektrosymbole für das Modul «Plan» (CJ 24.10.2026, Schritt 2): selbst gezeichnet nach der Symbolzusammenfassung (IEC 60617, Haustechnik
// 5.110–5.190, Clean-Room, nichts übernommen). Ohne DOM und ohne Importe, mit node testbar.
// Masse in Papier-mm (Symbol ca. 5 mm, fest auf dem Papier wie Texte; in der Welt × Massstab), y nach oben, Ursprung = Einsetzpunkt.
// Wandsymbole (wall: true): Ursprung auf der Wandfläche, das Symbol steht nach +y in den Raum. Übrige: Ursprung = Mitte.
// Teile: ["l", x1, y1, x2, y2] Linie, ["c", cx, cy, r, fill] Kreis, ["p", d, fill] Pfad (SVG, y nach oben: Bogen-Flag 1 = gegen den Uhrzeigersinn), ["t", x, y, h, s] Text (Mitte; dreht mit, steht nie auf dem Kopf).
// ap = Aufputz-Teil (Halbkreis) oder false. cat = Kategorie für die Farben (Farbcodes 5.100, CAT_COL in plan.js): kraft, licht, kommunikation, schwach, allg, leitung (wie die Leitungen). h = Vorgabe Höhe in cm.

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
function lever(deg = 45, ticks = 1, cy = SC[1], len = 3.2) {
  const u = dir(deg), t = dir(deg - 90), out = [L(u[0] * SR, cy + u[1] * SR, u[0] * len, cy + u[1] * len)];
  for (let i = 0; i < ticks; i++) { const s = len - i * 0.55, p = [u[0] * s, cy + u[1] * s]; out.push(L(p[0], p[1], p[0] + t[0] * 0.9, p[1] + t[1] * 0.9)); }
  return out;
}
const sw = (extra = [], cy = SC[1]) => [C(SC[0], cy, SR), ...extra];
// Aufputz: linke Hälfte des Kreises gefüllt (nur Schalter, Feld «Aufputz»)
const apHalf = (cy) => ["p", `M0,${cy + SR}A1 1 0 0 1 0,${cy - SR}Z`, true];

// ---------- Steckdosen 5.160: Stiel von der Wand, Bogen am Ende (Öffnung zum Raum), Querstrich = Schutzkontakt ----------
const SOCK = (s = 1, oy = 0, pe = true) => [["p", `M${-1.5 * s},${oy + 3.3 * s}A${1.5 * s} ${1.5 * s} 0 0 1 ${1.5 * s},${oy + 3.3 * s}`, false], L(0, oy, 0, oy + 1.8 * s), ...(pe ? [L(-1.1 * s, oy + 1.2 * s, 1.1 * s, oy + 1.2 * s)] : [])]; // CJ 24.10.2026: Stiel an der Wand, Bogen zum Raum offen (vorher 180° gedreht)

// ---------- Leuchten 5.190 ----------
const halfC = (r) => ["p", `M${-r},0A${r} ${r} 0 0 0 ${r},0Z`, false];

// ---------- Steigleitungen 5.110: Punkt (Kreis), Linie unter 45°, halber Pfeil (offenes Dreieck links der Linie) ----------
const DG = Math.SQRT1_2, at45 = (t) => [t * DG, t * DG];
const half = (t0, t1) => { const a = at45(t0), b = at45(t1), q = [a[0] - 0.75 * DG, a[1] + 0.75 * DG]; return [L(a[0], a[1], b[0], b[1]), L(b[0], b[1], q[0], q[1]), L(q[0], q[1], a[0], a[1])]; }; // Spitze bei t1
const seg45 = (t0, t1) => L(...at45(t0), ...at45(t1));

const S = (key, label, cat, group, parts, o = {}) => ({ key, label, cat, group, parts, wall: !!o.wall, h: o.h, ap: o.ap ? apHalf(o.cy ?? SC[1]) : false, c: o.c ?? (o.wall ? [0, 2] : [0, 0]), r: o.r ?? 2.6, ref: !!o.ref });
// Tabellen als /* @__PURE__ */-Aufrufe: so fallen sie im SchemaCAD-Bau ganz weg (v3 byte-gleich), obwohl plan.js sie importiert
export const PLAN_SYMS = /* @__PURE__ */ (() => [
  // Schalter (Unterputz; Aufputz über Feld)
  S("SCH0", "Schalter Sch. 0, 1-polig", "licht", "Schalter", sw(lever()), { wall: true, h: 110, ap: true }),
  S("SCH0_2", "Schalter Sch. 0, 2-polig", "licht", "Schalter", sw(lever(45, 2)), { wall: true, h: 110, ap: true }),
  S("SCH3", "Schalter Sch. 3 (Wechsel)", "licht", "Schalter", sw([...lever(45, 1, CY3), ...lever(225, 1, CY3)], CY3), { wall: true, h: 110, ap: true, cy: CY3, c: [0, CY3], r: 3 }),
  S("SCH6", "Schalter Sch. 6 (Kreuz)", "licht", "Schalter", sw([...lever(45, 1, CY6), ...lever(135, 1, CY6), ...lever(225, 1, CY6), ...lever(315, 1, CY6)], CY6), { wall: true, h: 110, ap: true, cy: CY6, c: [0, CY6], r: 3.3 }),
  S("TASTER", "Drucktaster", "licht", "Schalter", sw([L(0.71, 2.91, 2.4, 4.6), L(1.8, 5.2, 3, 4)]), { wall: true, h: 110, ap: true }),
  S("DIMMER", "Lichtregler (Dimmer)", "licht", "Schalter", sw([...lever(), L(1.5, 3.7, 1.0, 4.9), L(1.0, 4.9, 2.2, 4.5)]), { wall: true, h: 110, ap: true }),
  S("STOREN", "Storenschalter", "kraft", "Schalter", sw([...lever(), ["p", "M2.9,4.9L3.7,4.9L3.3,4.3Z", false], ["p", "M3.9,4.3L4.7,4.3L4.3,4.9Z", true]]), { wall: true, h: 110, ap: true }),
  S("SCH_LAMPE", "Schalter mit Signallampe", "licht", "Schalter", sw([...X(SC[0], SC[1], 0.7), ...lever()]), { wall: true, h: 110 }),
  // Steckdosen
  S("STD", "Steckdose T13 (Schutzkontakt)", "kraft", "Steckdosen", SOCK(), { wall: true, h: 110 }),
  S("STD3", "Steckdose 3-fach", "kraft", "Steckdosen", [...SOCK(), T(1.6, 3.6, 1.6, "3")], { wall: true, h: 110 }),
  S("STD_T15", "Steckdose T15", "kraft", "Steckdosen", [...SOCK(), T(2.9, 1.0, 1.4, "T15")], { wall: true, h: 110 }),
  S("STD_USB", "Steckdose T13 mit 2 × USB", "kraft", "Steckdosen", [...SOCK(), T(3.4, 1.0, 1.2, "2×USB")], { wall: true, h: 110 }),
  S("STD_BODEN", "Bodensteckdose", "kraft", "Steckdosen", [...box(-1.8, -1.8, 1.8, 1.8), ...SOCK(0.75, -1.3)], {}),
  S("KOMBI", "KOMBI Gr. 1 Schalter/Steckdose", "kraft", "Steckdosen", [...SOCK(), C(0, 4.1, 0.8), L(0.57, 4.67, 1.6, 5.7), L(1.6, 5.7, 2.2, 5.1)], { wall: true, h: 110, c: [0, 2.6] }),
  // Leuchten
  S("LEUCHTE", "Leuchte an Decke", "licht", "Leuchten", X(0, 0, 1.4), { r: 2 }),
  S("LEUCHTE_EB", "Einbauleuchte an Decke", "licht", "Leuchten", [C(0, 0, 1.7), ...X(0, 0, 1.2)], { r: 2 }),
  S("LEUCHTE_W", "Leuchte an Wand", "licht", "Leuchten", [L(-1.5, 0, 1.5, 0), ...X(0, 1.5, 1.5)], { wall: true, h: 200, c: [0, 1.5] }),
  S("LEUCHTE_WEB", "Wand-Einbauleuchte", "licht", "Leuchten", [halfC(1.8), L(-1.1, 0.25, 1.1, 1.45), L(-1.1, 1.45, 1.1, 0.25)], { wall: true, h: 200, c: [0, 1] }),
  S("LED", "LED-Spot an Decke", "licht", "Leuchten", [C(0, 0, 1.8), T(0, 0, 1.1, "LED")], { r: 2.1 }),
  S("LED_EB", "LED-Spot in Decke", "licht", "Leuchten", [C(0, 0, 2.1), C(0, 0, 1.7), T(0, 0, 1.0, "LED")], { r: 2.4 }),
  S("LED_W", "LED-Spot an Wand", "licht", "Leuchten", [halfC(2), T(0, 0.85, 0.9, "LED")], { wall: true, h: 200, c: [0, 1] }),
  // Melder
  S("BWM", "Bewegungsmelder an Decke, 360°", "licht", "Melder", [C(0, 0, 0.5), ...[0, 45, 90, 135, 180, 225, 270, 315].map((d) => { const u = dir(d); return L(u[0] * 0.8, u[1] * 0.8, u[0] * 1.9, u[1] * 1.9); })], { r: 2.2 }),
  S("PIR", "PIR-Melder in Einlasskasten", "licht", "Melder", [C(0, 1.3, 1.2), ["p", "M-0.4,0.8A0.7 0.7 0 0 1 -0.4,1.8", false], L(0, 2.5, 0, 4.4), L(0, 2.5, -0.4, 3.2), L(0, 2.5, 0.4, 3.2)], { wall: true, h: 110 }),
  // Geräte 5.180: Quadrat 4 mm mit Zeichen
  S("GERAET", "Elektrogerät, Geräteanschluss", "kraft", "Geräte", [...box(-2, -2, 2, 2), ["p", "M0.9,1.3L-0.5,0.1L0.5,0L-0.9,-1.3", false], L(-0.9, -1.3, -0.3, -1.25), L(-0.9, -1.3, -0.85, -0.7)]),
  S("HERD", "Elektroherd", "kraft", "Geräte", [...box(-2, -2, 2, 2), C(-0.9, -0.8, 0.45, true), C(0.9, 0.8, 0.45, true), C(0.9, -0.8, 0.45, true)]),
  S("BACKOFEN", "Backofen", "kraft", "Geräte", [...box(-2, -2, 2, 2), L(-2, 1, 2, 1), C(0, -0.6, 0.45, true)]),
  S("MIKRO", "Mikrowelle", "kraft", "Geräte", [...box(-2, -2, 2, 2), ...[-0.8, 0, 0.8].map((y) => ["p", `M-1.2,${y}q0.4,0.4 0.8,0t0.8,0t0.8,0`, false])]),
  S("GSP", "Geschirrspüler", "kraft", "Geräte", [...box(-2, -2, 2, 2), ...X(0, 0, 2), C(0, 0, 1.1)]),
  S("KUEHL", "Kühlgerät", "kraft", "Geräte", [...box(-2, -2, 2, 2), L(0, -1.3, 0, 1.3), L(-1.1, -0.65, 1.1, 0.65), L(-1.1, 0.65, 1.1, -0.65)]),
  S("VENT", "Ventilator (Dampfabzug)", "kraft", "Geräte", [...box(-2, -2, 2, 2), C(-0.65, 0, 0.65), C(0.65, 0, 0.65)]),
  S("BOILER", "Wassererwärmer", "kraft", "Geräte", [C(0, 0, 2), ...[-1.2, -0.6, 0, 0.6, 1.2].map((x) => { const y = Math.sqrt(4 - x * x); return L(x, -y, x, y); })]),
  // Allgemein 5.110
  S("DOSE", "Abzweigdose", "allg", "Allgemein", [...box(-1.5, -1.5, 1.5, 1.5), C(0, 0, 0.4, true)], { r: 1.8 }),
  S("EINLASS", "Einlasskasten Gr. 1", "allg", "Allgemein", [C(0, 0, 1.5), ["p", "M0,0L1.5,0A1.5 1.5 0 0 0 0,-1.5Z", true]], { r: 1.8 }),
  S("VERTEILER", "Verteiler (Schaltgerätekombination)", "kraft", "Allgemein", [...box(-2.8, 0, 2.8, 2.4), ["p", "M-2.8,0L2.8,2.4L2.8,0Z", true]], { wall: true, c: [0, 1.2], r: 3 }),
  S("ANSCHLUSS", "Anschluss Elektro", "kraft", "Allgemein", [C(-1.4, -1.4, 0.4), ["p", "M-1.1,-1.1L0.4,0.4L-0.2,0.7L1.4,1.9", false], L(1.4, 1.9, 0.7, 1.8), L(1.4, 1.9, 1.15, 1.25)], { r: 2.1 }),
  // Steigleitungen (Leitung nach oben, nach unten, durchgehend); cat leitung = Farbe der Leitungen
  S("STEIG_AUF", "Leitung nach oben", "leitung", "Allgemein", [C(0, 0, 0.4), seg45(0.4, 4.2), ...half(3.2, 4.2)], { r: 2.4, c: [1.5, 1.5] }),
  S("STEIG_AB", "Leitung nach unten", "leitung", "Allgemein", [C(0, 0, 0.4), seg45(-4.2, -0.4), ...half(-1.5, -0.5)], { r: 2.4, c: [-1.5, -1.5] }),
  S("STEIG_DURCH", "Leitung durchgehend", "leitung", "Allgemein", [C(0, 0, 0.4), seg45(-4.2, -0.4), seg45(0.4, 4.2), ...half(-1.5, -0.5), ...half(3.2, 4.2)], { r: 3.2 }),
  S("VERWEIS", "Hinweispfeil (Verweis)", "allg", "Allgemein", [...box(-8, -1.3, -1.8, 1.3), ["p", "M-1.8,-1.3L0,0L-1.8,1.3Z", true]], { c: [-4, 0], r: 3.5, ref: true }),
])();
export const SYM_BY_KEY = /* @__PURE__ */ (() => new Map(PLAN_SYMS.map((s) => [s.key, s])))();
export const SYM_GROUPS = /* @__PURE__ */ (() => [...new Set(PLAN_SYMS.map((s) => s.group))])();
