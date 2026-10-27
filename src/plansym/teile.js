// Plansymbole: gemeinsame Teile für alle Kategorien (aus plansym.js herausgelöst, CJ 27.10.2026). Format und Masse siehe plansym.js.

export const r3 = (n) => Math.round(n * 1000) / 1000 + 0;
export const L = (x1, y1, x2, y2) => ["l", r3(x1), r3(y1), r3(x2), r3(y2)];
export const C = (cx, cy, r, fill = false) => ["c", cx, cy, r, fill];
export const T = (x, y, h, s) => ["t", x, y, h, s];
export const box = (x0, y0, x1, y1) => [L(x0, y0, x1, y0), L(x1, y0, x1, y1), L(x1, y1, x0, y1), L(x0, y1, x0, y0)];
export const X = (cx, cy, s) => [L(cx - s, cy - s, cx + s, cy + s), L(cx - s, cy + s, cx + s, cy - s)];

// Schalterkreis (Masse siehe schalter.js): S() und der Aufputz-Halbkreis brauchen sie
export const SC = [0, 2.2], SR = 1.5, LEV = 3.7, CY3 = 2.9, CY6 = 3.5; // LEV = SR + 2.2 (als Zahl, sonst bleibt die Rechnung im v3-Bau)
export const dir = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
// Aufputz: rechte Hälfte des Kreises gefüllt wie die Quelle (CJ 26.10.2026; Feld «Aufputz»)
export const apHalf = (cy, r = SR) => ["p", `M0,${cy + r}A${r} ${r} 0 0 0 0,${cy - r}Z`, true];
export const lpt = (deg, t, cy) => { const u = dir(deg); return [u[0] * t, cy + u[1] * t]; };
export const tri = (a, b, c, fill = false) => ["p", `M${[a, b, c].map((p) => p.map(r3).join(",")).join("L")}Z`, fill];
export const add2 = (p, x, y) => [p[0] + x, p[1] + y];

// Bogen und Halbkreis (Leuchten, Wand-Einbau)
export const halfC = (r) => ["p", `M${-r},0A${r} ${r} 0 0 0 ${r},0Z`, false];
export const arcW = (r) => ["p", `M${-r},0A${r} ${r} 0 0 0 ${r},0`, false]; // nur Bogen (Wand-Einbau: zweite Linie)
export const rect = (x0, y0, x1, y1) => box(x0, y0, x1, y1);
export const wave = (x0, x1, y = 0) => { const n = 2, w = (x1 - x0) / n; let d = `M${x0},${y}`; for (let i = 0; i < n; i++) d += `q${w / 4},${-0.6} ${w / 2},0t${w / 2},0`; return ["p", d, false]; };

// size: Grösse in echten mm (w Breite/Länge, t Tiefe), parts(W, T) zeichnet in Papier-mm; parts der Tabelle = Vorgabe bei 1:50 (Palette)
// pin = [cx, cy, r]: vier Fangpunkte für Leitungen oben, rechts, unten, links am Rand (Schalter: Kreis, Steckdosen: Bogen; CJ 26.10.2026).
// edge = [x0, y0, x1, y1]: Fang auf allen Seiten des Kastens (Abzweigdose). Ohne beides fängt die Leitung an der Mitte c.
// c = Mitte (Treffer, Fang); Schalter: Mitte des Kreises (CJ 26.10.2026: vorher [0, 2], Leitung rastete 0,2 mm Papier unter dem Kreis ein)
export const S = (key, label, cat, group, parts, o = {}) => ({ key, label, cat, group, parts: o.size ? o.size.parts(o.size.w / 50, (o.size.t ?? 0) / 50) : parts, size: o.size, wall: !!o.wall, h: o.h, ap: o.ap === true ? apHalf(o.cy ?? SC[1]) : o.ap || false, num: parts.find((q) => q[0] === "t" && q[5] === "num")?.[4], c: o.c ?? (group === "Schalter" ? [0, o.cy ?? SC[1]] : o.wall ? [0, 2] : [0, 0]), pin: o.pin ?? (group === "Schalter" ? [0, o.cy ?? SC[1], SR] : group === "Steckdosen" ? [0, 3.9, 1.5] : null), edge: o.edge ?? null, r: o.r ?? (group === "Schalter" ? 3 : 2.6), ref: !!o.ref });
