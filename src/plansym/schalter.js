// Plansymbole Schalter 5.140 (aus plansym.js herausgelöst, CJ 27.10.2026)
import { L, X, C, S, SC, SR, LEV, CY3, CY6, dir, lpt, tri, add2 } from "./teile.js";

// ---------- Schalter 5.140: Kreis, Hebel nach rechts oben, Querstrich(e) am Ende ----------
// Kreis über der Wand (Höhe cy); Sch. 3 und 6 höher, damit die Hebel nach unten nicht in die Wand ragen
// CJ 27.10.2026: Schalter wirkten kleiner als Steckdosen. Kreis neu so breit wie der Bogen der Steckdose (r 1,5 statt 1), Hebel 2,2 mm über den Kreis
// hinaus wie bisher; Abstand des Kreises zur Wand 0,7 mm (Mitte gleich), Sch. 3 und 6 entsprechend höher.
// out: Querstrich waagrecht nach aussen statt quer zum Hebel (Sch. 6, CJ 26.10.2026: gespiegelt wie die Quelle, nicht im Kreis gedreht)
function lever(deg = 45, ticks = 1, cy = SC[1], len = LEV, out0 = false) {
  const u = dir(deg), t = out0 ? [Math.sign(u[0]), 0] : dir(deg - 90), out = [L(u[0] * SR, cy + u[1] * SR, u[0] * len, cy + u[1] * len)];
  for (let i = 0; i < ticks; i++) { const s = len - i * 0.55, p = [u[0] * s, cy + u[1] * s]; out.push(L(p[0], p[1], p[0] + t[0] * 0.9, p[1] + t[1] * 0.9)); }
  return out;
}
const sw = (extra = [], cy = SC[1]) => [C(SC[0], cy, SR), ...extra];

// Tabelle als /* @__PURE__ */-Aufruf: fällt im SchemaCAD-Bau ganz weg (v3 byte-gleich), obwohl plan.js sie über plansym.js importiert
export const SCHALTER = /* @__PURE__ */ (() => [
  // Schalter (Unterputz; Aufputz über Feld)
  S("SCH0", "Schalter Sch. 0, 1-polig", "licht", "Schalter", sw(lever()), { wall: true, h: 110, ap: true }),
  S("SCH0_2", "Schalter Sch. 0, 2-polig", "licht", "Schalter", sw(lever(45, 2)), { wall: true, h: 110, ap: true }),
  S("SCH3", "Schalter Sch. 3 (Wechsel)", "licht", "Schalter", sw([...lever(45, 1, CY3), ...lever(225, 1, CY3)], CY3), { wall: true, h: 110, ap: true, cy: CY3, c: [0, CY3], r: 3.6 }),
  S("SCH6", "Schalter Sch. 6 (Kreuz)", "licht", "Schalter", sw([45, 135, 225, 315].flatMap((d) => lever(d, 1, CY6, LEV, true)), CY6), { wall: true, h: 110, ap: true, cy: CY6, c: [0, CY6], r: 3.9 }),
  S("TASTER", "Drucktaster", "licht", "Schalter", sw((() => { const a = lpt(45, SR, SC[1]), e = lpt(45, SR + 2.4, SC[1]); return [L(...a, ...e), L(e[0] - 0.6, e[1] + 0.6, e[0] + 0.6, e[1] - 0.6)]; })()), { wall: true, h: 110, ap: true }),
  S("DIMMER", "Lichtregler (Dimmer)", "licht", "Schalter", sw([...lever(45, 0), (() => { const a = lpt(45, SR + 0.7, SC[1]); return tri(a, add2(a, 1.6, 0.8), add2(a, 1.6, 0)); })()]), { wall: true, h: 110, ap: true }),
  S("STOREN", "Storenschalter", "kraft", "Schalter", sw([...lever(45, 0), ...(() => { const e = lpt(45, LEV, SC[1]); return [tri(add2(e, -0.65, 0.95), add2(e, 0.35, 0.95), add2(e, -0.15, 0.15)), tri(add2(e, 0.35, -0.45), add2(e, 1.35, -0.45), add2(e, 0.85, 0.35))]; })()]), { wall: true, h: 110, ap: true }),
  S("SCH_LAMPE", "Schalter mit Signallampe", "licht", "Schalter", sw([...X(SC[0], SC[1], SR * 0.7), ...lever()]), { wall: true, h: 110 }),
])();
