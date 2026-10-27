// Plansymbole Leuchten, Spots und Notlicht 5.190 (aus plansym.js herausgelöst, CJ 27.10.2026)
import { r3, L, C, T, S, X, box, tri, halfC, arcW, rect, wave } from "./teile.js";

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

// Tabelle als /* @__PURE__ */-Aufruf: fällt im SchemaCAD-Bau ganz weg (v3 byte-gleich), obwohl plan.js sie über plansym.js importiert
export const LICHT = /* @__PURE__ */ (() => [
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
])();
