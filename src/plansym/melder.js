// Plansymbole Melder (aus plansym.js herausgelöst, CJ 27.10.2026)
import { r3, L, C, S, dir } from "./teile.js";

// Balken (gefüllt, Breite w): fetter Strich wie in der Quelle
const bar = (x1, y1, x2, y2, w) => { const n = Math.hypot(x2 - x1, y2 - y1), a = ((y1 - y2) / n) * w / 2, b = ((x2 - x1) / n) * w / 2; return ["p", `M${[[x1 + a, y1 + b], [x2 + a, y2 + b], [x2 - a, y2 - b], [x1 - a, y1 - b]].map((p) => p.map(r3).join(",")).join("L")}Z`, true]; };

// Tabelle als /* @__PURE__ */-Aufruf: fällt im SchemaCAD-Bau ganz weg (v3 byte-gleich), obwohl plan.js sie über plansym.js importiert
export const MELDER = /* @__PURE__ */ (() => [
  // Melder
  // BWM wie Quelle (CJ 28.10.2026): fettes Kreuz, zwölf kurze Strahlen alle 30° (keine auf den Diagonalen)
  S("BWM", "Bewegungsmelder an Decke, 360°", "licht", "Melder", [bar(-0.85, -0.85, 0.85, 0.85, 0.35), bar(-0.85, 0.85, 0.85, -0.85, 0.35), ...[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((d) => { const u = dir(d); return L(u[0] * 1.2, u[1] * 1.2, u[0] * 1.9, u[1] * 1.9); })], { r: 2.2 }),
  S("PIR", "PIR-Melder in Einlasskasten", "licht", "Melder", [C(0, 1.3, 1.2), ["p", "M-0.4,0.8A0.7 0.7 0 0 1 -0.4,1.8", false], L(0, 2.5, 0, 4.4), L(0, 2.5, -0.4, 3.2), L(0, 2.5, 0.4, 3.2)], { wall: true, h: 110 }),
])();
