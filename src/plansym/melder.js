// Plansymbole Melder (aus plansym.js herausgelöst, CJ 27.10.2026)
import { L, C, S, X, dir } from "./teile.js";

// Tabelle als /* @__PURE__ */-Aufruf: fällt im SchemaCAD-Bau ganz weg (v3 byte-gleich), obwohl plan.js sie über plansym.js importiert
export const MELDER = /* @__PURE__ */ (() => [
  // Melder
  S("BWM", "Bewegungsmelder an Decke, 360°", "licht", "Melder", [...X(0, 0, 0.5), ...[0, 45, 90, 135, 180, 225, 270, 315].map((d) => { const u = dir(d); return L(u[0] * 0.8, u[1] * 0.8, u[0] * 1.9, u[1] * 1.9); })], { r: 2.2 }),
  S("PIR", "PIR-Melder in Einlasskasten", "licht", "Melder", [C(0, 1.3, 1.2), ["p", "M-0.4,0.8A0.7 0.7 0 0 1 -0.4,1.8", false], L(0, 2.5, 0, 4.4), L(0, 2.5, -0.4, 3.2), L(0, 2.5, 0.4, 3.2)], { wall: true, h: 110 }),
])();
