// Skill plan-aufbereiten: Leitungen nicht über fremde Symbole führen (CJ 30.10.2026). Arbeitet auf der Aufnahme (JSON) und schreibt sie zurück.
// 1. Enden an Symbolen: vom Symbolmittelpunkt auf den nächsten Anschlusspunkt des Symbols (symSnaps: Pins, Rand der Dose) setzen.
// 2. Fremde Symbole (nicht Anfang oder Ende der Leitung), die eine Leitung näher als ihr Radius + Abstand berührt: Stützpunkt nach aussen
//    schieben oder neu einfügen, bis frei (höchstens 30 Durchgänge). Meldet, was übrig bleibt.
// Aufruf (im Repo): PATH=$HOME/.local/node/bin:$PATH node .claude/skills/plan-aufbereiten/umfahren.mjs aufnahme.json [abstand_mm=80]
import { readFileSync, writeFileSync } from "node:fs";
globalThis.ELPLEXA = true;
const P = await import("../../../src/plan.js");

const [file, gapArg] = process.argv.slice(2);
const a = JSON.parse(readFileSync(file, "utf8"));
const k = a.den ?? 50, GAP = Number(gapArg ?? 80);
const syms = a.items.filter((it) => it.type === "sym").map((it) => {
  const def = P.itemDef({ r: 0, ...it }, k);
  return { it, c: P.symCenter({ r: 0, ...it }, k), R: (def.ref ? 7 : def.r) * k, snaps: P.symSnaps({ r: 0, ...it }, k) };
});
const lines = a.items.filter((it) => it.type === "line");
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]], len = (v) => Math.hypot(v[0], v[1]), add = (p, v, t = 1) => [p[0] + v[0] * t, p[1] + v[1] * t];
const near = (p, s) => len(sub(p, s.c)) <= s.R * 1.5;
const segPt = (p, a0, b0) => { const d = sub(b0, a0), L2 = d[0] ** 2 + d[1] ** 2, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a0[0]) * d[0] + (p[1] - a0[1]) * d[1]) / L2)) : 0; return add(a0, d, t); };
const r0 = (p) => p.map((v) => Math.round(v));

// 1. Enden auf Anschlusspunkte
for (const ln of lines) for (const end of [0, ln.pts.length - 1]) {
  const p = ln.pts[end], s = syms.find((x) => near(p, x));
  if (!s) continue;
  const toward = ln.pts[end === 0 ? 1 : ln.pts.length - 2];
  const cand = [...s.snaps.pts, ...s.snaps.segs.map(([q0, q1]) => segPt(toward, q0, q1))];
  if (cand.length) ln.pts[end] = r0(cand.reduce((b, q) => (len(sub(q, toward)) < len(sub(b, toward)) ? q : b)));
}
// Abtastung der Leitung wie gezeichnet (Kurve über linePts), gerade Stücke alle 50 mm
const samples = (ln) => { const q = P.linePts(ln), out = []; for (let i = 1; i < q.length; i++) { const d = sub(q[i], q[i - 1]), n = Math.max(1, Math.ceil(len(d) / 50)); for (let j = 0; j < n; j++) out.push({ p: add(q[i - 1], d, j / n), seg: i - 1, segs: q.length - 1 }); } out.push({ p: q[q.length - 1], seg: q.length - 2, segs: q.length - 1 }); return out; };
const conflicts = (ln) => {
  const own = syms.filter((s) => near(ln.pts[0], s) || near(ln.pts[ln.pts.length - 1], s) || s.snaps.pts.concat(s.snaps.segs.flat()).some((q) => len(sub(q, ln.pts[0])) < 1 || len(sub(q, ln.pts[ln.pts.length - 1])) < 1));
  const out = [];
  for (const s of syms) {
    if (own.includes(s)) continue;
    let best = null; for (const x of samples(ln)) { const d = len(sub(x.p, s.c)); if (!best || d < best.d) best = { d, x }; }
    if (best.d < s.R + GAP) out.push({ s, ...best });
  }
  return out;
};
// 2. Ausweichen
let left = [];
for (const ln of lines) {
  for (let pass = 0; pass < 30; pass++) {
    const cs = conflicts(ln); if (!cs.length) break;
    const { s, d, x } = cs[0];
    let n = sub(x.p, s.c); if (len(n) < 1) { const q = P.linePts(ln), dd = sub(q[x.seg + 1], q[x.seg]); n = [-dd[1], dd[0]]; }
    n = [n[0] / len(n), n[1] / len(n)];
    const target = add(s.c, n, s.R + GAP * 1.5);
    // Stützpunkt-Index: Anteil der Abtastung auf die Kontrollpunkte abbilden
    const f = (x.seg + 0.5) / x.segs, j = Math.min(ln.pts.length - 1, Math.max(1, Math.round(f * (ln.pts.length - 1))));
    const inner = j > 0 && j < ln.pts.length - 1 && len(sub(ln.pts[j], x.p)) < 600;
    if (inner) ln.pts[j] = r0(add(ln.pts[j], sub(target, x.p)));
    else { const at = Math.min(ln.pts.length - 1, Math.max(1, Math.ceil(f * (ln.pts.length - 1)))); ln.pts.splice(at, 0, r0(target)); }
  }
  for (const c of conflicts(ln)) left.push(`Leitung ${ln.pts[0]} → ${ln.pts[ln.pts.length - 1]} berührt ${c.s.it.key} bei ${r0(c.s.c)} (${Math.round(c.d)} mm)`);
}
writeFileSync(file, JSON.stringify(a));
console.log(left.length ? `Noch ${left.length} Berührungen:\n` + left.join("\n") : "Keine Leitung über fremden Symbolen.");
