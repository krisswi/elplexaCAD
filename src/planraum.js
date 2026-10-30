// Räume im Plan (CJ 30.10.2026, nur elplexaCAD, Dateiversion 34): geschlossene Räume aus den Wänden erkennen und beschriften. Ohne DOM, mit node testbar.
// Erkennung: Mittellinien aller Wände (alle Ebenen) als ebener Graph. Öffnungen (Tür, Fenster, Durchgang) liegen in der Wand und gelten als geschlossen.
// T-Stoss: Ende einer Wand an oder in einer anderen Wand (Abstand zur Mittellinie höchstens halbe Dicke) wird auf deren Mittellinie gezogen, die Wand dort geteilt.
// Kreuzungen ohne Endpunkt teilen nicht (Annahme: Wände stossen an Ecken oder T-Stössen). Lose Enden fallen weg, dann bilden die kleinsten Umläufe
// gegen den Uhrzeigersinn die Räume. Fläche = Innenfläche: jede Kante um die halbe Dicke ihrer Wand nach innen versetzt.
// Raumobjekt in plan.js (type "room"); at bestimmt den Raum. Neue Räume heissen «Raum n» (nächste freie Nummer), bestehende behalten Name und Lage.
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]], add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1], len = (v) => Math.hypot(v[0], v[1]);
export const ROOM_MIN = 0.3e6; // mm²: kleinere Innenflächen (Schlitz zwischen zwei Wänden) sind kein Raum
const NODE_TOL = 1; // mm: Knoten näher als das gelten als gleich

export const polyArea = (q) => q.reduce((s, p, i) => { const r = q[(i + 1) % q.length]; return s + p[0] * r[1] - r[0] * p[1]; }, 0) / 2;
export function inPoly(p, q) {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const [xi, yi] = q[i], [xj, yj] = q[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function lineX(p, u, q, v) {
  const den = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(den) < 1e-9) return null;
  return add(p, u, ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / den);
}

// Ebener Graph der Mittellinien: Knoten [x, y], Kanten { u, v, d }
function wallGraph(walls) {
  const segs = walls.map((w) => ({ a: [...w.a], b: [...w.b], d: w.d, cuts: [0, 1] }));
  for (const s of segs) for (const e of ["a", "b"]) for (const t of segs) {
    if (t === s) continue;
    const u = sub(t.b, t.a), L2 = dot(u, u), tt = dot(sub(s[e], t.a), u) / L2;
    if (tt <= 1e-6 || tt >= 1 - 1e-6) continue;
    const q = add(t.a, u, tt);
    if (len(sub(q, s[e])) <= t.d / 2 + NODE_TOL) { s[e] = q; t.cuts.push(tt); break; }
  }
  const nodes = [], node = (p) => { let i = nodes.findIndex((n) => len(sub(n, p)) <= NODE_TOL); if (i < 0) { i = nodes.length; nodes.push(p); } return i; };
  const edges = [], seen = new Set();
  for (const s of segs) {
    const u = sub(s.b, s.a), ts = [...new Set(s.cuts)].sort((x, y) => x - y);
    for (let i = 1; i < ts.length; i++) {
      const a = node(add(s.a, u, ts[i - 1])), b = node(add(s.a, u, ts[i])), k = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (a !== b && !seen.has(k)) { seen.add(k); edges.push({ u: a, v: b, d: s.d }); }
    }
  }
  return { nodes, edges };
}

// Räume: [{ poly (Mittellinien, gegen den Uhrzeigersinn), inner (Innenkanten), area (m²), lab (Punkt sicher innen) }], sortiert von oben links nach unten rechts
export function roomFaces(walls) {
  const { nodes, edges } = wallGraph(walls);
  let es = edges;
  for (;;) { // lose Enden weg
    const deg = new Map();
    for (const e of es) { deg.set(e.u, (deg.get(e.u) || 0) + 1); deg.set(e.v, (deg.get(e.v) || 0) + 1); }
    const nx = es.filter((e) => deg.get(e.u) > 1 && deg.get(e.v) > 1);
    if (nx.length === es.length) break;
    es = nx;
  }
  const out = new Map(); // Knoten → ausgehende Halbkanten, nach Winkel sortiert
  for (const e of es) for (const [a, b] of [[e.u, e.v], [e.v, e.u]]) { if (!out.has(a)) out.set(a, []); out.get(a).push({ to: b, d: e.d, ang: Math.atan2(nodes[b][1] - nodes[a][1], nodes[b][0] - nodes[a][0]) }); }
  for (const l of out.values()) l.sort((x, y) => x.ang - y.ang);
  const used = new Set(), faces = [];
  for (const [a0, l0] of out) for (const h0 of l0) {
    if (used.has(`${a0}>${h0.to}`)) continue;
    const ids = [], ds = [];
    let a = a0, h = h0;
    for (let n = 0; n <= es.length * 2 && !used.has(`${a}>${h.to}`); n++) {
      used.add(`${a}>${h.to}`); ids.push(a); ds.push(h.d);
      const l = out.get(h.to), i = l.findIndex((x) => x.to === a);
      a = h.to; h = l[(i - 1 + l.length) % l.length]; // nächste Kante im Uhrzeigersinn: der Raum liegt links
    }
    const poly = ids.map((i) => nodes[i]);
    if (poly.length < 3 || polyArea(poly) <= 0) continue; // äussere Umrandung läuft im Uhrzeigersinn
    const inner = poly.map((p, i) => { // Ecke i zwischen Kante i−1 und Kante i
      const j = (i - 1 + poly.length) % poly.length, off = (k) => { const v = sub(poly[(k + 1) % poly.length], poly[k]), L = len(v); return { p: add(poly[k], [-v[1] / L, v[0] / L], ds[k] / 2), u: [v[0] / L, v[1] / L] }; };
      const e0 = off(j), e1 = off(i);
      return lineX(e0.p, e0.u, e1.p, e1.u) ?? add(p, [-e1.u[1], e1.u[0]], ds[i] / 2);
    });
    const A = polyArea(inner);
    if (A < ROOM_MIN) continue;
    faces.push({ poly, inner, area: A / 1e6, lab: labelPoint(inner) });
  }
  const top = (f) => Math.max(...f.poly.map((p) => p[1])), left = (f) => Math.min(...f.poly.map((p) => p[0]));
  return faces.sort((x, y) => top(y) - top(x) || left(x) - left(y));
}

// Punkt für die Beschriftung: Schwerpunkt, liegt er ausserhalb (L-Form), die Mitte des breitesten Stücks der Waagrechten durch ihn
export function labelPoint(q) {
  const A = polyArea(q);
  let cx = 0, cy = 0;
  q.forEach((p, i) => { const r = q[(i + 1) % q.length], c = p[0] * r[1] - r[0] * p[1]; cx += (p[0] + r[0]) * c; cy += (p[1] + r[1]) * c; });
  const c = [cx / (6 * A), cy / (6 * A)];
  if (inPoly(c, q)) return c;
  const xs = [];
  q.forEach((p, i) => { const r = q[(i + 1) % q.length]; if ((p[1] > c[1]) !== (r[1] > c[1])) xs.push(p[0] + ((c[1] - p[1]) * (r[0] - p[0])) / (r[1] - p[1])); });
  xs.sort((x, y) => x - y);
  let best = null;
  for (let i = 0; i + 1 < xs.length; i += 2) if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
  return best ? [(best[0] + best[1]) / 2, c[1]] : q[0];
}

// Raum zur Beschriftung (Fläche, die at enthält) oder null
export const faceOf = (faces, at) => faces.find((f) => inPoly(at, f.poly)) ?? null;
// Neue Räume beschriften: jeder erkannte Raum ohne Beschriftung bekommt «Raum n» (n = höchste Nummer + 1) auf der Ebene «Hintergrund»
// (fehlt sie, auf der untersten). Bestehende bleiben, auch ohne Raum (Wände weg): dann ohne Fläche. Gibt die neuen Räume.
export function syncRooms(sh, nextId) {
  const faces = roomFaces(sh.items.filter((i) => i.type === "wall")), rooms = sh.items.filter((i) => i.type === "room"), made = [];
  if (!faces.length) return made;
  let n = Math.max(0, ...rooms.map((r) => Number(/^Raum (\d+)$/.exec(r.name)?.[1] ?? 0)));
  const layer = sh.layers.some((l) => l.id === "bg") ? "bg" : sh.layers[0].id;
  for (const f of faces) if (!rooms.some((r) => inPoly(r.at, f.poly))) { const r = { id: nextId(), type: "room", layer, at: f.lab.map((v) => Math.round(v)), name: `Raum ${++n}` }; sh.items.push(r); made.push(r); }
  return made;
}
// Fläche für die Anzeige: «12,4 m²» (eine Stelle)
export const fmtArea = (a) => `${(Math.round(a * 10) / 10).toFixed(1).replace(".", ",")} m²`;
