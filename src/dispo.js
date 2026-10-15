// Disposition (Verteileraufbau, massstäblich): Bauteile, Geometrie, Fang, Darstellung und Zeichen-Bausteine für den DXF-Export.
// Einheit mm, y nach oben. Dieses Modul importiert nichts aus model.js (sonst entstünde ein Zirkelbezug).
import { textBox } from "./geom.js";

export const TE = 17.5; // Teilungseinheit: 17,5 mm (CJ, Hager MCN110)
export const SNAP_TE = TE / 2; // kleinste Raststufe auf der Schiene (ein Neutralleitertrenner ist 0,5 TE breit)
export const RAIL_H = 35; // Hutschiene TH35, 35 mm breit
export const DEV_H = 83; // Gerätehöhe laut Hager MCN110, pro Gerät einstellbar
export const RAIL_MARGIN = 20; // Rand zwischen Plattenkante und Schienenfeld (für die Abdeckung)
export const MIN_TEXT = 1.2; // kleinste Texthöhe auf dem Schemablatt in mm
export const DIM_H = 10; // Texthöhe der Bemassung in mm (in der Disposition 1:1)

export const DISPO_LAYERS = {
  SCH_DISPO_PLATTE: { color: 8, css: "#6b7785" },
  SCH_DISPO_SCHIENE: { color: 4, css: "#0f7f96" },
  SCH_DISPO_GERAET: { color: 7, css: "#17212b" },
  SCH_DISPO_MASS: { color: 6, css: "#9b3d8f" },
};
const FILL = { SCH_DISPO_PLATTE: "#f1f4f7", SCH_DISPO_SCHIENE: "#dbe9ee", SCH_DISPO_GERAET: "#ffffff" };
const INK = "#17212b";

// Bauteile der Disposition (Typen im Blatt). Die Ansicht auf dem Schemablatt heisst dispoview.
export const PLAN_TYPES = new Set(["plate", "rail", "device"]);
export const isPlanType = (t) => PLAN_TYPES.has(t) || t === "dispoview";

// Gerätevorlagen. Breiten laut CJ (1, 3, 4 TE; Neutralleitertrenner 0,5 TE). LS 2-polig mit 2 TE ist eine Annahme.
export const DEVICE_PRESETS = [
  { id: "LS1", label: "LS 1-polig", type: "LS 1P", te: 1, sub: "1 TE" },
  { id: "LS2", label: "LS 2-polig", type: "LS 2P", te: 2, sub: "2 TE (Annahme)" },
  { id: "LS3", label: "LS 3-polig", type: "LS 3P", te: 3, sub: "3 TE" },
  { id: "LS4", label: "LS 4-polig", type: "LS 4P", te: 4, sub: "4 TE" },
  { id: "NTR", label: "Neutralleitertrenner", type: "N", te: 0.5, sub: "0,5 TE" },
  { id: "FREI", label: "Gerät frei", type: "Gerät", te: 2, sub: "TE und Text selbst wählen" },
];
export const PRESET_BY_ID = Object.fromEntries(DEVICE_PRESETS.map((p) => [p.id, p]));
export const PLATE_PRESETS = {
  zaehler: { name: "Zählerplatte", w: 250, h: 400, fixed: true },
  frei: { name: "Montageplatte", w: 500, h: 400 },
};

const r3 = (n) => Math.round(n * 1000) / 1000;
const inBox = (b, x, y, t) => x >= b.x0 - t && x <= b.x1 + t && y >= b.y0 - t && y <= b.y1 + t;
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- Geometrie ----------
export const devW = (d) => r3(d.te * TE);
export function itemBBox(it) {
  if (it.type === "plate") return { x0: it.x, y0: it.y, x1: it.x + it.w, y1: it.y + it.h };
  if (it.type === "rail") return { x0: it.x, y0: it.y - RAIL_H / 2, x1: it.x + it.len, y1: it.y + RAIL_H / 2 };
  if (it.type === "device") return { x0: it.x, y0: it.y - it.h / 2, x1: it.x + devW(it), y1: it.y + it.h / 2 };
  if (it.type === "dispoview") return { x0: it.x, y0: it.y - 6, x1: it.x + it.bw / it.den, y1: it.y + it.bh / it.den };
  throw new Error("kein Bauteil: " + it.type);
}
export const unionBox = (boxes) => boxes.length ? {
  x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)),
  x1: Math.max(...boxes.map((b) => b.x1)), y1: Math.max(...boxes.map((b) => b.y1)),
} : null;

// Ausdehnung aller Bauteile und Texte einer Disposition
export function contentBBox(items, dims = false, dimH = DIM_H) {
  const boxes = items.map((it) => (it.type === "text" ? textBox(it.x, it.y, it.h, it.s) : isPlanType(it.type) ? itemBBox(it) : null)).filter(Boolean);
  if (dims) boxes.push(primsBBox(planPrims(items, { dims: true, dimH }).filter((p) => p.layer === "SCH_DISPO_MASS")));
  return unionBox(boxes.filter(Boolean));
}
function primsBBox(prims) {
  const boxes = [];
  for (const p of prims) {
    if (p.k === "line") boxes.push({ x0: Math.min(p.x1, p.x2), y0: Math.min(p.y1, p.y2), x1: Math.max(p.x1, p.x2), y1: Math.max(p.y1, p.y2) });
    else if (p.k === "text") {
      const w = p.s.length * p.h * 0.55, a = p.anchor;
      const x0 = a === "c" ? p.x - w / 2 : a === "rm" ? p.x - w : p.x;
      boxes.push({ x0, x1: x0 + w, y0: p.y - 0.5 * p.h, y1: p.y + 0.5 * p.h });
    }
  }
  return unionBox(boxes);
}

// Treffer: Eine Platte nur am Rand (so lässt sich innerhalb der Platte mit einem Rahmen wählen), alles andere in der Fläche
export function hitItem(it, x, y, tol) {
  const b = itemBBox(it);
  if (it.type !== "plate") return inBox(b, x, y, tol);
  if (!inBox(b, x, y, tol)) return false;
  const inner = { x0: b.x0 + tol, y0: b.y0 + tol, x1: b.x1 - tol, y1: b.y1 - tol };
  return inner.x0 >= inner.x1 || inner.y0 >= inner.y1 || !inBox(inner, x, y, 0);
}

// Teile innerhalb einer Platte (Mittelpunkt liegt in der Platte). Sie wandern mit der Platte.
export function contained(items, plate) {
  const pb = itemBBox(plate);
  return items.filter((o) => {
    if (o === plate || o.id === plate.id) return false;
    const b = o.type === "text" ? textBox(o.x, o.y, o.h, o.s) : isPlanType(o.type) ? itemBBox(o) : null;
    return b && (b.x0 + b.x1) / 2 >= pb.x0 && (b.x0 + b.x1) / 2 <= pb.x1 && (b.y0 + b.y1) / 2 >= pb.y0 && (b.y0 + b.y1) / 2 <= pb.y1;
  });
}

// Schiene, auf der ein Gerät sitzt (gleiche Mittellinie, Gerät beginnt innerhalb der Schiene)
export const railOf = (items, d) => items.find((r) => r.type === "rail" && Math.abs(r.y - d.y) < 0.01 && d.x < r.x + r.len - 0.01 && d.x + devW(d) > r.x + 0.01) || null;

// Geräte, die sich überlappen oder über das Schienenende ragen
export function deviceIssues(items) {
  const bad = new Set();
  const devs = items.filter((i) => i.type === "device");
  for (let i = 0; i < devs.length; i++) {
    const a = devs[i];
    const rail = railOf(items, a);
    if (rail && (a.x < rail.x - 0.01 || a.x + devW(a) > rail.x + rail.len + 0.01)) bad.add(a.id);
    for (let j = i + 1; j < devs.length; j++) {
      const b = devs[j];
      if (Math.abs(a.y - b.y) < 0.01 && a.x < b.x + devW(b) - 0.01 && b.x < a.x + devW(a) - 0.01) { bad.add(a.id); bad.add(b.id); }
    }
  }
  return bad;
}

// Fang eines Geräts auf eine Schiene: left = linke Kante, cy = Mitte in y. Raststufe ½ TE ab Schienenanfang.
export function snapDevice(items, left, cy, te, excludeId) {
  const w = te * TE;
  let best = null, bd = 50;
  for (const r of items) {
    if (r.type !== "rail" || r.id === excludeId) continue;
    const d = Math.abs(cy - r.y);
    if (d > bd || left < r.x - 25 || left > r.x + r.len + 25 - w) continue;
    bd = d; best = r;
  }
  if (!best) return null;
  const x = best.x + Math.round((left - best.x) / SNAP_TE) * SNAP_TE;
  return { x: r3(Math.max(best.x, Math.min(best.x + best.len - w, x))), y: best.y, rail: best.id };
}

// Schiene in einer Platte: links und rechts je RAIL_MARGIN Abstand zum Plattenrand (CJ, 14.10.)
export const railFit = (plate) => ({ x: r3(plate.x + RAIL_MARGIN), len: r3(Math.max(1, plate.w - 2 * RAIL_MARGIN)) });
// Schiene r in der Platte halten: Länge höchstens Platte − 40 mm, Lage innerhalb des Randes. Kürzere Schienen behalten ihre Länge.
export function railClamp(r, plate) {
  const f = railFit(plate), len = Math.min(r.len, f.len);
  return { x: r3(Math.max(f.x, Math.min(f.x + f.len - len, r.x))), len: r3(len) };
}
// Volle Länge in der Platte (wächst mit, wenn die Platte breiter wird)
export const railIsFull = (r, plate) => { const f = railFit(plate); return Math.abs(r.x - f.x) < 0.01 && Math.abs(r.len - f.len) < 0.01; };

// Schienen automatisch in eine Platte: n Schienen im Abstand pitch (Mitte zu Mitte), je RAIL_MARGIN Rand oben und unten
export function fitsRails(plate, n, pitch) { return plate.h >= n * pitch + 2 * RAIL_MARGIN; }
export function autoRails(plate, n, pitch, nextId) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ id: nextId(), type: "rail", y: r3(plate.y + RAIL_MARGIN + pitch / 2 + i * pitch), ...railFit(plate) });
  return out;
}

// ---------- Griffe (Grösse ändern) ----------
// Platte: Ecken und Kantenmitten, Schiene: beide Enden. Die Zählerplatte hat ein festes Mass und keine Griffe.
// h nennt die bewegten Kanten: w = links, e = rechts, s = unten, n = oben.
export function handlePoints(it) {
  if (it.type === "rail") return [{ h: "w", x: it.x, y: it.y }, { h: "e", x: r3(it.x + it.len), y: it.y }];
  if (it.type !== "plate" || it.fixed) return [];
  const xs = { w: it.x, "": it.x + it.w / 2, e: it.x + it.w }, ys = { s: it.y, "": it.y + it.h / 2, n: it.y + it.h };
  const out = [];
  for (const v of ["s", "", "n"]) for (const u of ["w", "", "e"]) if (u || v) out.push({ h: v + u, x: r3(xs[u]), y: r3(ys[v]) });
  return out;
}
export const MIN_PLATE = 2 * RAIL_MARGIN + 10; // kleinste Platte beim Ziehen
// Platte o mit Griff h auf Punkt (x, y) ziehen: die gegenüberliegende Kante bleibt
export function resizePlate(o, h, x, y) {
  let x0 = o.x, x1 = o.x + o.w, y0 = o.y, y1 = o.y + o.h;
  if (h.includes("w")) x0 = Math.min(x, x1 - MIN_PLATE);
  if (h.includes("e")) x1 = Math.max(x, x0 + MIN_PLATE);
  if (h.includes("s")) y0 = Math.min(y, y1 - MIN_PLATE);
  if (h.includes("n")) y1 = Math.max(y, y0 + MIN_PLATE);
  return { x: r3(x0), y: r3(y0), w: r3(x1 - x0), h: r3(y1 - y0) };
}
// Schiene o am Ende h auf x ziehen. In einer Platte bleibt der Rand von 20 mm frei.
export function resizeRail(o, h, x, plate = null) {
  const fit = plate && railFit(plate), lo = fit ? fit.x : -Infinity, hi = fit ? fit.x + fit.len : Infinity, min = SNAP_TE;
  let x0 = o.x, x1 = o.x + o.len;
  if (h === "w") x0 = Math.max(lo, Math.min(x, x1 - min)); else x1 = Math.min(hi, Math.max(x, x0 + min));
  return { x: r3(x0), len: r3(x1 - x0) };
}

// Eintippbare Masse: Gesamtbreite und -höhe einer Platte (Ort wie in der Bemassung), Länge einer Schiene (über ihrer Mitte)
export function massTargets(it, h = DIM_H) {
  if (it.type === "rail") return [{ key: "len", v: it.len, x: r3(it.x + it.len / 2), y: r3(it.y + RAIL_H / 2 + 0.8 * h), anchor: "c" }];
  if (it.type !== "plate" || it.fixed) return [];
  return [{ key: "w", v: it.w, x: r3(it.x + it.w / 2), y: r3(it.y - 1.8 * h), anchor: "c" },
    { key: "h", v: it.h, x: r3(it.x - 3.1 * h), y: r3(it.y + it.h / 2), anchor: "rm" }];
}

// ---------- Hilfslinien beim Fang ----------
// Kanten und Mitten der anderen Bauteile (ohne die Ids in skip). xs: senkrechte Linien, ys: waagrechte.
export function guideLines(items, skip) {
  const xs = [], ys = [];
  for (const it of items) {
    if (!PLAN_TYPES.has(it.type) || skip.has(it.id)) continue;
    const b = itemBBox(it);
    for (const v of [b.x0, (b.x0 + b.x1) / 2, b.x1]) xs.push({ v: r3(v), b });
    for (const v of [b.y0, (b.y0 + b.y1) / 2, b.y1]) ys.push({ v: r3(v), b });
  }
  return { xs, ys };
}
// Nächste Linie zu einem der Werte cands, höchstens tol entfernt: { v = Linie, c = Wert, b = Bauteil der Linie } oder null
export function nearestGuide(cands, lines, tol) {
  let best = null;
  for (const c of cands) for (const l of lines) { const d = Math.abs(l.v - c); if (d <= tol && (!best || d < best.d)) best = { d, v: l.v, c, b: l.b }; }
  return best;
}
// Linie zum Zeichnen: von der Bauteilbox der Linie bis zur Box des gezogenen Teils
export function guideSeg(g, axis, box) {
  return axis === "x" ? { x1: g.v, y1: Math.min(g.b.y0, box.y0), x2: g.v, y2: Math.max(g.b.y1, box.y1) }
    : { x1: Math.min(g.b.x0, box.x0), y1: g.v, x2: Math.max(g.b.x1, box.x1), y2: g.v };
}

// ---------- Ausrichten und Verteilen (Mehrfachauswahl) ----------
// boxes = Ausdehnungen der gewählten Teile. Ausrichten an der gemeinsamen Ausdehnung: l, cx, r (waagrecht), b, cy, t (senkrecht).
// Verteilen dh/dv: erstes und letztes Teil bleiben, dazwischen gleiche Abstände (ab 3 Teilen). Ergebnis: [dx, dy] je Box.
export function alignMoves(boxes, mode) {
  const u = unionBox(boxes), cx = (b) => (b.x0 + b.x1) / 2, cy = (b) => (b.y0 + b.y1) / 2;
  const one = { l: (b) => [u.x0 - b.x0, 0], r: (b) => [u.x1 - b.x1, 0], cx: (b) => [cx(u) - cx(b), 0],
    b: (b) => [0, u.y0 - b.y0], t: (b) => [0, u.y1 - b.y1], cy: (b) => [0, cy(u) - cy(b)] }[mode];
  if (one) return boxes.map((b) => one(b).map(r3));
  const [a0, a1, c] = mode === "dh" ? ["x0", "x1", cx] : ["y0", "y1", cy];
  const out = boxes.map(() => [0, 0]);
  if (boxes.length < 3) return out;
  const order = boxes.map((b, i) => i).sort((i, j) => c(boxes[i]) - c(boxes[j]));
  const first = boxes[order[0]], last = boxes[order.at(-1)];
  const gap = (last[a0] - first[a1] - order.slice(1, -1).reduce((s, i) => s + boxes[i][a1] - boxes[i][a0], 0)) / (order.length - 1);
  let pos = first[a1] + gap;
  for (const i of order.slice(1, -1)) { const d = r3(pos - boxes[i][a0]); out[i] = mode === "dh" ? [d, 0] : [0, d]; pos += boxes[i][a1] - boxes[i][a0] + gap; }
  return out;
}

// ---------- Zeichen-Bausteine ----------
// Alles wird in einfache Bausteine (Rechteck, Linie, Text) zerlegt. Daraus entstehen SVG und DXF, so bleiben beide gleich.
export function planPrims(items, { dims = false, dimH = DIM_H } = {}) {
  const bad = deviceIssues(items);
  const out = [];
  for (const p of items.filter((i) => i.type === "plate")) {
    out.push({ k: "rect", x: p.x, y: p.y, w: p.w, h: p.h, layer: "SCH_DISPO_PLATTE" });
    const label = (dims ? [p.name] : [p.name, `${p.w} × ${p.h}`]).filter(Boolean).join("  ");
    out.push({ k: "text", x: p.x, y: p.y + p.h + 6, h: 12, s: label, layer: "SCH_TEXT", anchor: "l" });
  }
  for (const r of items.filter((i) => i.type === "rail")) out.push({ k: "rect", x: r.x, y: r.y - RAIL_H / 2, w: r.len, h: RAIL_H, layer: "SCH_DISPO_SCHIENE" });
  for (const d of items.filter((i) => i.type === "device")) {
    const w = devW(d);
    out.push({ k: "rect", x: d.x, y: d.y - d.h / 2, w, h: d.h, layer: "SCH_DISPO_GERAET", bad: bad.has(d.id) });
    const cx = d.x + w / 2;
    if (d.label) out.push({ k: "text", x: cx, y: d.y, h: Math.max(2, Math.min(5, (w - 2) / Math.max(1, d.label.length) / 0.55)), s: d.label, layer: "SCH_TEXT", anchor: "c" });
    if (d.bmk) out.push({ k: "text", x: cx, y: d.y + d.h / 2 + 4, h: 5, s: d.bmk, layer: "SCH_TEXT", anchor: "c" });
  }
  for (const t of items.filter((i) => i.type === "text")) out.push({ k: "text", x: t.x, y: t.y, h: t.h, s: t.s, layer: "SCH_TEXT", anchor: "l" });
  if (dims) dimPrims(items, dimH, out);
  return out;
}

// ---------- Bemassung (abgeleitet, wird nicht gespeichert) ----------
// Platte: Gesamtbreite unten, Gesamthöhe links. Rechts eine Kette Platte unten, Schienenmitten, Platte oben.
// Unter jeder Schiene mit Geräten eine Kette: Schienenanfang, Geräteblöcke, Schienenende.
// Ist ein Mass für seinen Text zu klein, wird es mit dem kleineren Nachbarn zusammengerechnet.
export const fmtMass = (v) => String(Math.round(v * 10) / 10).replace(".", ",");
const LAYER_M = "SCH_DISPO_MASS";

export function mergePoints(pts, need) {
  const p = [...new Set(pts.map(r3))].sort((a, b) => a - b);
  for (;;) {
    let bi = -1, bl = Infinity;
    for (let i = 0; i < p.length - 1; i++) { const l = p[i + 1] - p[i]; if (l < need(l) && l < bl) { bl = l; bi = i; } }
    if (bi < 0 || p.length < 3) return p;
    const left = bi > 0 ? p[bi] - p[bi - 1] : Infinity, right = bi + 1 < p.length - 1 ? p[bi + 2] - p[bi + 1] : Infinity;
    p.splice(left <= right ? bi : bi + 1, 1);
  }
}

// Waagrechte Kette: Linie auf Höhe yl, Hilfslinien ab extFrom(x)
function chainH(out, pts, yl, h, extFrom) {
  const q = mergePoints(pts, (l) => fmtMass(l).length * h * 0.55 + h * 0.6);
  const ln = (x1, y1, x2, y2) => out.push({ k: "line", x1, y1, x2, y2, layer: LAYER_M });
  ln(q[0], yl, q[q.length - 1], yl);
  for (const x of q) { ln(x, extFrom(x), x, yl - 0.3 * h); ln(x - 0.25 * h, yl - 0.25 * h, x + 0.25 * h, yl + 0.25 * h); }
  for (let i = 0; i + 1 < q.length; i++) out.push({ k: "text", x: (q[i] + q[i + 1]) / 2, y: yl + 0.7 * h, h, s: fmtMass(q[i + 1] - q[i]), layer: LAYER_M, anchor: "c" });
  return q;
}
// Senkrechte Kette: Linie auf x = xl, Texte rechts (side 1) oder links (side -1)
function chainV(out, pts, xl, side, h, extFrom) {
  const q = mergePoints(pts, () => h * 1.5);
  const ln = (x1, y1, x2, y2) => out.push({ k: "line", x1, y1, x2, y2, layer: LAYER_M });
  ln(xl, q[0], xl, q[q.length - 1]);
  for (const y of q) { ln(extFrom(y), y, xl + side * 0.3 * h, y); ln(xl - 0.25 * h, y - 0.25 * h, xl + 0.25 * h, y + 0.25 * h); }
  for (let i = 0; i + 1 < q.length; i++) out.push({ k: "text", x: xl + side * 0.6 * h, y: (q[i] + q[i + 1]) / 2, h, s: fmtMass(q[i + 1] - q[i]), layer: LAYER_M, anchor: side > 0 ? "lm" : "rm" });
  return q;
}

function dimPrims(items, h, out) {
  for (const p of items.filter((i) => i.type === "plate")) {
    chainH(out, [p.x, p.x + p.w], p.y - 2.5 * h, h, () => p.y - 0.2 * h);
    chainV(out, [p.y, p.y + p.h], p.x - 2.5 * h, -1, h, () => p.x - 0.2 * h);
    const rails = contained(items, p).filter((o) => o.type === "rail").sort((a, b) => a.y - b.y);
    if (rails.length) {
      const endX = new Map([[p.y, p.x + p.w], [p.y + p.h, p.x + p.w]]);
      for (const r of rails) endX.set(r3(r.y), Math.max(endX.get(r3(r.y)) ?? -Infinity, r.x + r.len));
      const tmp = [];
      const q = chainV(tmp, [p.y, ...rails.map((r) => r.y), p.y + p.h], p.x + p.w + 2.5 * h, 1, h, (y) => (endX.get(r3(y)) ?? p.x + p.w) + 0.2 * h);
      if (q.length > 2) out.push(...tmp); // sonst wäre es nur das Gesamtmass
    }
  }
  for (const r of items.filter((i) => i.type === "rail")) {
    const devs = items.filter((d) => d.type === "device" && railOf(items, d) === r).sort((a, b) => a.x - b.x);
    if (!devs.length) continue;
    const x1 = r.x + r.len, maxH = Math.max(...devs.map((d) => d.h));
    const pts = [r.x, x1], reach = new Map(); // Hilfslinie startet an der Geräteunterkante, am Schienenende an der Schiene
    const mark = (x, hh) => { pts.push(x); reach.set(r3(x), Math.max(reach.get(r3(x)) ?? 0, hh)); };
    for (const d of devs) { mark(Math.max(r.x, d.x), d.h); mark(Math.min(x1, d.x + devW(d)), d.h); }
    chainH(out, pts, r.y - maxH / 2 - 1.6 * h, h, (x) => r.y - (reach.get(r3(x)) ?? RAIL_H) / 2 - 0.2 * h);
  }
}

// Abbildung der Disposition auf ein Schemablatt: Ursprung (bx, by) der Disposition kommt nach (ox, oy), Faktor k.
export const IDENT = { ox: 0, oy: 0, bx: 0, by: 0, k: 1, minText: 0 };
export const viewMap = (v) => ({ ox: v.x, oy: v.y, bx: v.bx, by: v.by, k: 1 / v.den, minText: MIN_TEXT });
const mx = (m, x) => r3(m.ox + (x - m.bx) * m.k);
const my = (m, y) => r3(m.oy + (y - m.by) * m.k);
const mh = (m, h) => r3(Math.max(h * m.k, m.minText));

const ANCH = { c: ' text-anchor="middle" dominant-baseline="central"', lm: ' text-anchor="start" dominant-baseline="central"', rm: ' text-anchor="end" dominant-baseline="central"' };
const f = r3;
export function primsSVG(prims, m = IDENT, { opacity = 1 } = {}) {
  const css = (layer) => (DISPO_LAYERS[layer]?.css) || INK;
  let s = opacity < 1 ? `<g opacity="${opacity}">` : "<g>";
  for (const p of prims) {
    if (p.k === "rect") {
      const stroke = p.bad ? "#d02b20" : css(p.layer);
      s += `<rect x="${mx(m, p.x)}" y="${my(m, p.y)}" width="${f(p.w * m.k)}" height="${f(p.h * m.k)}" fill="${FILL[p.layer] || "none"}" stroke="${stroke}" stroke-width="${p.bad ? 2 : 1.3}" stroke-linejoin="round"/>`;
    } else if (p.k === "line") {
      s += `<line x1="${mx(m, p.x1)}" y1="${my(m, p.y1)}" x2="${mx(m, p.x2)}" y2="${my(m, p.y2)}" stroke="${css(p.layer)}" stroke-width="${p.layer === "SCH_DISPO_MASS" ? 0.8 : 1.3}"/>`;
    } else if (p.k === "text") {
      s += `<text transform="translate(${mx(m, p.x)},${my(m, p.y)}) scale(1,-1)" font-size="${mh(m, p.h)}" fill="${p.layer === "SCH_DISPO_MASS" ? css(p.layer) : INK}" stroke="none"${ANCH[p.anchor] || ""}>${esc(p.s)}</text>`;
    }
  }
  return s + "</g>";
}

export const planSVG = (items, dims = false) => primsSVG(planPrims(items, { dims }));
export const ghostSVG = (items) => primsSVG(planPrims(items), IDENT, { opacity: 0.55 });

// Hintergrund und Raster einer Disposition (unbegrenzte Fläche, kein Papierrand)
export function sheetSVG(grid, zoom) {
  let s = `<rect class="dispo-bg" x="-30000" y="-30000" width="60000" height="60000"/>`;
  if (grid.on && grid.size * zoom >= 7) s += `<rect x="-30000" y="-30000" width="60000" height="60000" fill="url(#gridpat)" stroke="none" pointer-events="none"/>`;
  s += `<path d="M0 0H60M0 0V60" stroke="#8d99a6" stroke-width="1" fill="none"/>`; // Nullpunkt
  return s;
}

// Ansicht einer Disposition auf einem Schemablatt (Momentaufnahme mit Massstab)
export function viewCaption(v) { return `${v.title || "Disposition"}  Massstab 1:${v.den}`; }
// Auf dem Schemablatt soll das Mass mindestens MIN_TEXT hoch sein, darum wächst die Bemassung mit dem Massstab
export const viewDimH = (v) => Math.max(DIM_H, MIN_TEXT * v.den);
export const viewPrims = (v) => planPrims(v.items, { dims: v.dims === true, dimH: viewDimH(v) });
export function viewSVG(v) {
  const cap = { k: "text", x: v.x, y: v.y - 4.5, h: 2.5, s: viewCaption(v), layer: "SCH_TEXT", anchor: "l" };
  return primsSVG(viewPrims(v), viewMap(v)) + primsSVG([cap]);
}

// Vorschaubilder für die Palette (viewBox 0 0 100 100)
export function thumbSVG(kind, te = 1) {
  const sw = 4;
  if (kind === "plate") return `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="12" y="10" width="76" height="80" rx="3" fill="${FILL.SCH_DISPO_PLATTE}" stroke="${DISPO_LAYERS.SCH_DISPO_PLATTE.css}" stroke-width="${sw}"/></svg>`;
  if (kind === "rail") return `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="6" y="38" width="88" height="24" fill="${FILL.SCH_DISPO_SCHIENE}" stroke="${DISPO_LAYERS.SCH_DISPO_SCHIENE.css}" stroke-width="${sw}"/></svg>`;
  const w = Math.max(10, Math.min(84, te * 20));
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="${50 - w / 2}" y="14" width="${w}" height="72" rx="2" fill="#fff" stroke="${INK}" stroke-width="${sw}"/></svg>`;
}

// ---------- Prüfung beim Laden ----------
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
export function cleanPlanItem(it, id) {
  if (it.type === "plate" && [it.x, it.y, it.w, it.h].every(isNum) && it.w > 0 && it.h > 0) {
    const o = { id, type: "plate", x: it.x, y: it.y, w: it.w, h: it.h, name: String(it.name ?? "") };
    if (it.fixed === true) o.fixed = true;
    return o;
  }
  if (it.type === "rail" && [it.x, it.y, it.len].every(isNum) && it.len > 0) return { id, type: "rail", x: it.x, y: it.y, len: it.len };
  if (it.type === "device" && [it.x, it.y, it.te, it.h].every(isNum) && it.te > 0 && it.h > 0) {
    return { id, type: "device", x: it.x, y: it.y, te: it.te, h: it.h, kind: String(it.kind ?? "FREI"), label: String(it.label ?? ""), bmk: String(it.bmk ?? "") };
  }
  return null;
}
