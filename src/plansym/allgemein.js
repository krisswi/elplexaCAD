// Plansymbole Allgemein 5.110: Dosen, Verteiler, Anschluss, Steigleitungen, Verweis (aus plansym.js herausgelöst, CJ 27.10.2026)
import { r3, L, C, S, box, half45, seg45 } from "./teile.js";

// Tabelle als /* @__PURE__ */-Aufruf: fällt im SchemaCAD-Bau ganz weg (v3 byte-gleich), obwohl plan.js sie über plansym.js importiert
export const ALLGEMEIN = /* @__PURE__ */ (() => [
  // Allgemein 5.110
  S("DOSE", "Abzweigdose", "allg", "Allgemein", [...box(-1.5, -1.5, 1.5, 1.5), C(0, 0, 0.4, true)], { r: 1.8, edge: [-1.5, -1.5, 1.5, 1.5] }),
  S("EINLASS", "Einlasskasten Gr. 1", "allg", "Allgemein", [C(0, 0, 1.5), ["p", "M0,0L1.5,0A1.5 1.5 0 0 0 0,-1.5Z", true]], { r: 1.8 }),
  S("VERTEILER", "Verteiler (Schaltgerätekombination)", "kraft", "Allgemein", [], { wall: true, c: [0, 1.2], r: 3, size: { w: 600, t: 200, parts: (W, T) => [...box(-W / 2, 0, W / 2, T), ["p", `M${r3(-W / 2)},0L${r3(W / 2)},${r3(T)}L${r3(W / 2)},0Z`, true]] } }),
  // Anschluss wie Quelle (CJ 28.10.2026): Blitz als gefüllte Fläche (dicker), dünner Strich mit Pfeil zum Ring
  S("ANSCHLUSS", "Anschluss Elektro", "kraft", "Allgemein", [C(-1.4, -1.4, 0.4), L(-1.1, -1.1, -0.7, -0.8), ["p", "M-0.7,-0.8L0.44,0.07L-0.61,0.4L1.87,1.4L0.35,0.37L1.35,0.05Z", true], L(-1.1, -1.1, -0.45, -0.95), L(-1.1, -1.1, -0.95, -0.45)], { r: 2.4, snap: [[-1.4, -1.4]] }), // Fang am Kreis (CJ 28.10.2026)
  // Steigleitungen 5.110 (Leitung nach oben, nach unten, durchgehend; Zeichen in teile.js); cat leitung = Farbe der Leitungen
  S("STEIG_AUF", "Leitung nach oben", "leitung", "Allgemein", [C(0, 0, 0.4), seg45(0.4, 4.2), ...half45(3.2, 4.2)], { r: 2.4, c: [1.5, 1.5] }),
  S("STEIG_AB", "Leitung nach unten", "leitung", "Allgemein", [C(0, 0, 0.4), seg45(-4.2, -0.4), ...half45(-1.5, -0.5)], { r: 2.4, c: [-1.5, -1.5] }),
  S("STEIG_DURCH", "Leitung durchgehend", "leitung", "Allgemein", [C(0, 0, 0.4), seg45(-4.2, -0.4), seg45(0.4, 4.2), ...half45(-1.5, -0.5), ...half45(3.2, 4.2)], { r: 3.2 }),
  // Verweis (CJ 26.10.2026, Vorlage aus CJs Plan): runder Kasten mit ein bis drei Zeilen, Zeiger (dünne Linie) zum Ziel (Bild in der Leiste ohne Zeiger, CJ 28.10.2026); Kasten frei ziehbar (lo), Farbe wählbar. Zeichnung in plan.js refParts
  S("VERWEIS", "Verweis (Kasten mit Zeiger)", "allg", "Allgemein", [["p", "M-11,1.6h6.4a1 1 0 0 1 1,1v3.6a1 1 0 0 1 -1,1h-6.4a1 1 0 0 1 -1,-1v-3.6a1 1 0 0 1 1,-1Z", false], L(-11.4, 4.4, -3.6, 4.4)], { c: [0, 0], r: 1.2, ref: true }),
])();
