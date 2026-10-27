// Plansymbole Allgemein 5.110: Dosen, Verteiler, Anschluss, Steigleitungen, Verweis (aus plansym.js herausgelöst, CJ 27.10.2026)
import { r3, L, C, S, box } from "./teile.js";

// ---------- Steigleitungen 5.110: Punkt (Kreis), Linie unter 45°, halber Pfeil (offenes Dreieck links der Linie) ----------
const DG = Math.SQRT1_2, at45 = (t) => [t * DG, t * DG];
const half = (t0, t1) => { const a = at45(t0), b = at45(t1), q = [a[0] - 0.75 * DG, a[1] + 0.75 * DG]; return [L(a[0], a[1], b[0], b[1]), L(b[0], b[1], q[0], q[1]), L(q[0], q[1], a[0], a[1])]; }; // Spitze bei t1
const seg45 = (t0, t1) => L(...at45(t0), ...at45(t1));

// Tabelle als /* @__PURE__ */-Aufruf: fällt im SchemaCAD-Bau ganz weg (v3 byte-gleich), obwohl plan.js sie über plansym.js importiert
export const ALLGEMEIN = /* @__PURE__ */ (() => [
  // Allgemein 5.110
  S("DOSE", "Abzweigdose", "allg", "Allgemein", [...box(-1.5, -1.5, 1.5, 1.5), C(0, 0, 0.4, true)], { r: 1.8, edge: [-1.5, -1.5, 1.5, 1.5] }),
  S("EINLASS", "Einlasskasten Gr. 1", "allg", "Allgemein", [C(0, 0, 1.5), ["p", "M0,0L1.5,0A1.5 1.5 0 0 0 0,-1.5Z", true]], { r: 1.8 }),
  S("VERTEILER", "Verteiler (Schaltgerätekombination)", "kraft", "Allgemein", [], { wall: true, c: [0, 1.2], r: 3, size: { w: 600, t: 200, parts: (W, T) => [...box(-W / 2, 0, W / 2, T), ["p", `M${r3(-W / 2)},0L${r3(W / 2)},${r3(T)}L${r3(W / 2)},0Z`, true]] } }),
  S("ANSCHLUSS", "Anschluss Elektro", "kraft", "Allgemein", [C(-1.4, -1.4, 0.4), ["p", "M-1.1,-1.1L0.4,0.4L-0.2,0.7L1.4,1.9", false], L(-1.1, -1.1, -0.45, -0.95), L(-1.1, -1.1, -0.95, -0.45)], { r: 2.1 }),
  // Steigleitungen (Leitung nach oben, nach unten, durchgehend); cat leitung = Farbe der Leitungen
  S("STEIG_AUF", "Leitung nach oben", "leitung", "Allgemein", [C(0, 0, 0.4), seg45(0.4, 4.2), ...half(3.2, 4.2)], { r: 2.4, c: [1.5, 1.5] }),
  S("STEIG_AB", "Leitung nach unten", "leitung", "Allgemein", [C(0, 0, 0.4), seg45(-4.2, -0.4), ...half(-1.5, -0.5)], { r: 2.4, c: [-1.5, -1.5] }),
  S("STEIG_DURCH", "Leitung durchgehend", "leitung", "Allgemein", [C(0, 0, 0.4), seg45(-4.2, -0.4), seg45(0.4, 4.2), ...half(-1.5, -0.5), ...half(3.2, 4.2)], { r: 3.2 }),
  // Verweis (CJ 26.10.2026, Vorlage aus CJs Plan): runder Kasten mit ein bis drei Zeilen, Zeiger (dünne Linie) zum Ziel; Kasten frei ziehbar (lo), Farbe wählbar. Zeichnung in plan.js refParts
  S("VERWEIS", "Verweis (Kasten mit Zeiger)", "allg", "Allgemein", [["p", "M-11,1.6h6.4a1 1 0 0 1 1,1v3.6a1 1 0 0 1 -1,1h-6.4a1 1 0 0 1 -1,-1v-3.6a1 1 0 0 1 1,-1Z", false], L(-11.4, 4.4, -3.6, 4.4), L(-3.6, 1.6, 0, 0)], { c: [0, 0], r: 1.2, ref: true }),
])();
