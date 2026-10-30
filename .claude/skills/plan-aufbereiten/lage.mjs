// Skill plan-aufbereiten: prüft die Lage von Symbolen und Leitungen («nichts in der Luft», CJ 30.10.2026).
// Aufruf (im Repo): PATH=$HOME/.local/node/bin:$PATH node .claude/skills/plan-aufbereiten/lage.mjs aufnahme.json [--marken]
// Liest die Aufnahme (JSON) oder eine fertige .elplexa.json. Meldet (Welt-mm, Nummer = Stelle in der Aufnahme, ab 1):
//   wand      Wandsymbol nicht auf der Wandfläche (> 20 mm daneben) oder falsch gedreht (+y zeigt nicht in den Raum), mit Vorschlag at/r
//   verweis   Verweis, an dessen Spitze (at) keine Leitung endet (± 100 mm)
//   offenEnde Leitungsende, das weder an einem Symbol noch an einer anderen Leitung liegt
//   ohneLtg   Apparat ohne Leitung (nur Hinweis, alte Pläne zeigen nicht jede Leitung)
// --marken gibt zusätzlich die Marken für markieren.py aus. Exit 1, wenn wand, verweis oder offenEnde etwas melden.
import { readFileSync } from "node:fs";
globalThis.ELPLEXA = true;
const { symDef } = await import("../../../src/plansym.js");
const P = await import("../../../src/plan.js");

const args = process.argv.slice(2), marks = args.includes("--marken");
const [inp] = args.filter((x) => !x.startsWith("--"));
if (!inp) { console.error("Aufruf: node lage.mjs aufnahme.json [--marken]"); process.exit(2); }
const raw = JSON.parse(readFileSync(inp, "utf8"));
const k = raw.den ?? raw.sheets?.find((s) => s.kind === "plan").paper?.den ?? 50;
const items = (raw.items ?? raw.sheets.find((s) => s.kind === "plan").items).map((it, i) => ({ n: it.id ?? i + 1, ...it }));

const FACE = 20, NEAR = 400, END = 100; // Toleranzen in mm
const walls = items.filter((i) => i.type === "wall"), lines = items.filter((i) => i.type === "line" && i.pts?.length > 1);
const syms = items.filter((i) => i.type === "sym"), mm = (p) => p.map((v) => Math.round(v));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], len = (v) => Math.hypot(v[0], v[1]);
function onSeg(p, a, b) { const ab = sub(b, a), L2 = ab[0] ** 2 + ab[1] ** 2, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / L2)) : 0; return [a[0] + t * ab[0], a[1] + t * ab[1]]; }
// Richtung, in die +y des Symbols zeigt: r = 0 nach Norden, 90 nach Westen, -90 nach Osten, 180 nach Süden
const dirOf = (r) => { const a = (r * Math.PI) / 180; return [-Math.sin(a), Math.cos(a)]; };
const rOf = (n) => (Math.abs(n[0]) > Math.abs(n[1]) ? (n[0] > 0 ? -90 : 90) : n[1] > 0 ? 0 : 180);

// Wand als Rechteck (Mittellinie ± d/2, auch die Stirnseiten): nächster Punkt q auf dem Rand, Normale n nach aussen, Abstand off zum Rand
function face(p, w) {
  const ab = sub(w.b, w.a), L = len(ab), t = [ab[0] / L, ab[1] / L], nn = [-t[1], t[0]], h = w.d / 2, rp = sub(p, w.a);
  const u = rp[0] * t[0] + rp[1] * t[1], v = rp[0] * nn[0] + rp[1] * nn[1], W = (uu, vv) => [w.a[0] + uu * t[0] + vv * nn[0], w.a[1] + uu * t[1] + vv * nn[1]];
  const cu = Math.max(0, Math.min(L, u)), cv = Math.max(-h, Math.min(h, v));
  if (cu !== u || cv !== v) { const q = W(cu, cv), d = len(sub(p, q)), du = u - cu, dv = v - cv, l = Math.hypot(du, dv); return { q, off: d, n: [(du * t[0] + dv * nn[0]) / l, (du * t[1] + dv * nn[1]) / l] }; }
  const sides = [[h - v, 0, h, nn], [h + v, 0, -h, nn.map((x) => -x)], [u, -1, 0, t.map((x) => -x)], [L - u, 1, 0, t]].sort((x, y) => x[0] - y[0]); // im Innern: nächste Seite
  const [off, eu, ev, n] = sides[0];
  return { q: eu ? W(eu < 0 ? 0 : L, v) : W(u, ev), off, n };
}

const wand = [];
for (const s of syms) {
  if (!symDef(s.key)?.wall) continue;
  let best = null;
  for (const w of walls) { const f = face(s.at, w); if (!best || f.off < best.off) best = { w, ...f }; }
  if (!best || best.off > NEAR) { wand.push({ n: s.n, key: s.key, at: mm(s.at), fehler: "keine Wand in der Nähe" }); continue; }
  const dir = dirOf(s.r ?? 0), turned = best.n[0] * dir[0] + best.n[1] * dir[1] < 0.7;
  if (best.off <= FACE && !turned) continue;
  wand.push({ n: s.n, key: s.key, at: mm(s.at), r: s.r ?? 0, wand: best.w.n, ...(best.off > FACE ? { daneben: Math.round(best.off) } : {}), ...(turned ? { gedreht: true } : {}), vorschlag: { at: mm(best.q), r: rOf(best.n) } });
}

const ends = lines.flatMap((l) => [{ l, p: l.pts[0] }, { l, p: l.pts.at(-1) }]);
const near = (a, b, t = END) => len(sub(a, b)) <= t;
// Leitung hängt am Symbol: Ende beim Einsetzpunkt, an einem Anschlusspunkt (umfahren.mjs setzt die Enden dorthin) oder im Symbolkreis
const atSym = (p, s) => { const o = { r: 0, ...s }, d = P.itemDef(o, k); return near(p, s.at) || (({ pts, segs }) => pts.some((q) => near(p, q, 30)) || segs.some(([a, b]) => near(p, onSeg(p, a, b), 30)))(P.symSnaps(o, k)) || len(sub(p, P.symCenter(o, k))) <= (d.ref ? 7 : d.r) * k * 1.2; };
const verweis = syms.filter((s) => s.key === "VERWEIS" && s.layer !== "offen" && !ends.some((e) => near(e.p, s.at)))
  .map((s) => { const e = ends.reduce((m, e) => (!m || len(sub(e.p, s.at)) < len(sub(m.p, s.at)) ? e : m), null);
    return { n: s.n, fu: s.fu, at: mm(s.at), naechstesEnde: e && { leitung: e.l.n, at: mm(e.p), abstand: Math.round(len(sub(e.p, s.at))) } }; });
const offenEnde = ends.filter((e) => !syms.some((s) => atSym(e.p, s)) && !lines.some((l) => l !== e.l && l.pts.some((p) => near(e.p, p))))
  .map((e) => ({ leitung: e.l.n, at: mm(e.p), ...(e.l.col ? { farbe: e.l.col } : {}) }));
const ohneLtg = syms.filter((s) => s.key !== "VERWEIS" && s.layer === "app" && !ends.some((e) => atSym(e.p, s)))
  .map((s) => ({ n: s.n, key: s.key, at: mm(s.at) }));

console.log(JSON.stringify({ geprueft: { wandsymbole: syms.filter((s) => symDef(s.key)?.wall).length, verweise: syms.filter((s) => s.key === "VERWEIS").length, leitungen: lines.length }, wand, verweis, offenEnde, ohneLtg }, null, 1));
if (marks) {
  const m = [...wand.map((x) => [...x.at, "W" + x.n]), ...verweis.map((x) => [...x.at, "V" + x.n]), ...offenEnde.map((x) => [...x.at, "L" + x.leitung]), ...ohneLtg.map((x) => [...x.at, "A" + x.n])];
  console.log("marken: " + m.map((x) => x.join(",")).join(";"));
}
process.exit(wand.length + verweis.length + offenEnde.length ? 1 : 0);
