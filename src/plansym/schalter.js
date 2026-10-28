// Plansymbole Schalter 5.140 (aus plansym.js herausgelöst, CJ 27.10.2026)
import { L, X, C, S, SC, SR, LEV, dir, lpt, tri, add2 } from "./teile.js";

// ---------- Schalter 5.140: Kreis, Hebel zur Seite, Querstrich(e) am Ende ----------
// CJ 27.10.2026: Kreis so breit wie der Bogen der Steckdose (r 1,5), Hebel 2,2 mm über den Kreis hinaus, Abstand des Kreises zur Wand 0,7 mm.
// Fähnchen zur Seite (CJ 28.10.2026, Symbolvergleich Plan 2): Hebel waagrecht (0° = rechts), Querstrich zur Wand, damit Schalter sauber
// nebeneinander stehen. Sch. 3 und Sch. 6 brauchen darum keinen höheren Kreis mehr.
// axis: Querstrich zur Mittellinie statt quer nach rechts (Sch. 6 wie CJs Bild: Fliege); tl = Länge des Querstrichs
function lever(deg = 0, ticks = 1, cy = SC[1], len = LEV, axis = false, tl = 0.9) {
  const u = dir(deg), t0 = dir(deg - 90), t = axis && t0[1] * u[1] > 0 ? [-t0[0], -t0[1]] : t0, out = [L(u[0] * SR, cy + u[1] * SR, u[0] * len, cy + u[1] * len)];
  for (let i = 0; i < ticks; i++) { const s = len - i * 0.55, p = [u[0] * s, cy + u[1] * s]; out.push(L(p[0], p[1], p[0] + t[0] * tl, p[1] + t[1] * tl)); }
  return out;
}
const sw = (extra = [], cy = SC[1]) => [C(SC[0], cy, SR), ...extra];

// Tabelle als /* @__PURE__ */-Aufruf: fällt im SchemaCAD-Bau ganz weg (v3 byte-gleich), obwohl plan.js sie über plansym.js importiert
export const SCHALTER = /* @__PURE__ */ (() => [
  // Schalter (Unterputz; Aufputz über Feld)
  S("SCH0", "Schalter Sch. 0, 1-polig", "licht", "Schalter", sw(lever()), { wall: true, h: 110, ap: true }),
  S("SCH0_2", "Schalter Sch. 0, 2-polig", "licht", "Schalter", sw(lever(0, 2)), { wall: true, h: 110, ap: true }),
  S("SCH3", "Schalter Sch. 3 (Wechsel)", "licht", "Schalter", sw([...lever(0), ...lever(180)]), { wall: true, h: 110, ap: true, r: 3.7 }),
  // Sch. 6 wie CJs Bild (28.10.2026): je zwei Hebel links und rechts unter 25°, Querstriche zur Mittellinie
  S("SCH6", "Schalter Sch. 6 (Kreuz)", "licht", "Schalter", sw([25, 155, 205, 335].flatMap((d) => lever(d, 1, SC[1], LEV, true, 1.05))), { wall: true, h: 110, ap: true, r: 3.9 }),
  S("TASTER", "Drucktaster", "licht", "Schalter", sw((() => { const a = lpt(0, SR, SC[1]), e = lpt(0, SR + 2.4, SC[1]); return [L(...a, ...e), L(e[0], e[1] + 0.85, e[0], e[1] - 0.85)]; })()), { wall: true, h: 110, ap: true }),
  S("DIMMER", "Lichtregler (Dimmer)", "licht", "Schalter", sw([...lever(0, 0), (() => { const a = lpt(0, SR + 0.7, SC[1]); return tri(a, add2(a, 1.7, -0.57), add2(a, 1.13, -1.13)); })()]), { wall: true, h: 110, ap: true }),
  // Storenschalter wie CJs Bild (28.10.2026): einfacher Kreis (der Ring gehört zum Storentaster, CJ 28.10.2026), Hebel waagrecht zu einem kurzen Stiel, Dreieck auf und ab
  S("STOREN", "Storenschalter", "kraft", "Schalter", sw([L(SR, SC[1], 2.7, SC[1]), L(2.7, SC[1] - 0.45, 2.7, SC[1] + 0.45), tri([1.95, SC[1] + 0.45], [3.45, SC[1] + 0.45], [2.7, SC[1] + 1.5]), tri([1.95, SC[1] - 0.45], [3.45, SC[1] - 0.45], [2.7, SC[1] - 1.5])]), { wall: true, h: 110, ap: true }),
  S("SCH_LAMPE", "Schalter mit Signallampe", "licht", "Schalter", sw([...X(SC[0], SC[1], SR * 0.7), ...lever()]), { wall: true, h: 110 }),
])();
