// Plansymbole Geräte 5.180 (aus plansym.js herausgelöst, CJ 27.10.2026)
import { L, C, S, box } from "./teile.js";

// Tabelle als /* @__PURE__ */-Aufruf: fällt im SchemaCAD-Bau ganz weg (v3 byte-gleich), obwohl plan.js sie über plansym.js importiert
export const GERAETE = /* @__PURE__ */ (() => [
  // Geräte 5.180: Quadrat 4 mm mit Zeichen
  S("GERAET", "Elektrogerät, Geräteanschluss", "kraft", "Geräte", [...box(-2, -2, 2, 2), ["p", "M0.9,1.3L-0.5,0.1L0.5,0L-0.9,-1.3", false], L(-0.9, -1.3, -0.3, -1.25), L(-0.9, -1.3, -0.85, -0.7)]),
  S("HERD", "Elektroherd", "kraft", "Geräte", [...box(-2, -2, 2, 2), C(-0.9, -0.8, 0.45, true), C(0.9, 0.8, 0.45, true), C(0.9, -0.8, 0.45, true)]),
  S("BACKOFEN", "Backofen", "kraft", "Geräte", [...box(-2, -2, 2, 2), L(-2, 1, 2, 1), C(0, -0.6, 0.45, true)]),
  S("MIKRO", "Mikrowelle", "kraft", "Geräte", [...box(-2, -2, 2, 2), ...[-0.8, 0, 0.8].map((y) => ["p", `M-1.2,${y}q0.4,0.4 0.8,0t0.8,0t0.8,0`, false])]),
  S("GSP", "Geschirrspüler", "kraft", "Geräte", [...box(-2, -2, 2, 2), ...[[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => L(2 * a, 2 * b, 0.78 * a, 0.78 * b)), C(0, 0, 1.1), C(0, 0, 0.45, true)]), // wie Quelle: Diagonalen bis zum Kreis, Punkt in der Mitte
  S("KUEHL", "Kühlgerät", "kraft", "Geräte", [...box(-2, -2, 2, 2), L(0, -1.3, 0, 1.3), L(-1.1, -0.65, 1.1, 0.65), L(-1.1, 0.65, 1.1, -0.65)]),
  S("VENT", "Ventilator (Dampfabzug)", "kraft", "Geräte", [...box(-2, -2, 2, 2), C(-0.65, 0, 0.65), C(0.65, 0, 0.65)]),
  S("BOILER", "Wassererwärmer", "kraft", "Geräte", [C(0, 0, 2), ...[-1.2, -0.6, 0, 0.6, 1.2].map((x) => { const y = Math.sqrt(4 - x * x); return L(x, -y, x, y); })]),
])();
