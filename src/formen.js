// Freies Zeichnen im Schema (Wunsch CJ 18.10.2026): Linie, Rechteck, Kreis und Farbe freier Texte.
// Objekt { type: "shape", k: "line" | "rect" | "circle" }: Linie pts [[x, y], [x, y]], Rechteck x, y (Ecke unten links), w, h, Kreis x, y (Mitte), r.
// Darstellung: c = Farbe (fehlt = schwarz), d = gestrichelt, fill = Füllfarbe (nur Rechteck und Kreis, fehlt = keine). Text: c = Farbe.
import { HatchBoundaryPaths, HatchPolylineBoundary, HatchPredefinedPatterns, pattern, point3d } from "@tarikjabiri/dxf";

// Feste Palette: Schlüssel in der Datei, Farbe am Bildschirm, AutoCAD-Farbindex im DXF
export const COLORS = [
  { k: "schwarz", label: "Schwarz", css: "#17212b", aci: 7 },
  { k: "rot", label: "Rot", css: "#d1302b", aci: 1 },
  { k: "blau", label: "Blau", css: "#1f5fbf", aci: 5 },
  { k: "gruen", label: "Grün", css: "#1b8a4b", aci: 3 },
  { k: "orange", label: "Orange", css: "#e07800", aci: 30 },
  { k: "grau", label: "Grau", css: "#7a838c", aci: 8 },
];
const BY_KEY = Object.fromEntries(COLORS.map((c) => [c.k, c]));
export const colorCss = (k) => (BY_KEY[k] || COLORS[0]).css;
export const colorAci = (k) => (BY_KEY[k] || COLORS[0]).aci;
export const isColor = (k) => k !== "schwarz" && !!BY_KEY[k]; // schwarz wird nicht gespeichert
export const SHAPE_LAYER = "SCH_FORMEN";
export const SHAPE_KINDS = { line: "Linie", rect: "Rechteck", circle: "Kreis" };
export const SHAPE_TOOLS = [
  { id: "shape-line", k: "line", label: "Linie", key: "I", icon: "sline" },
  { id: "shape-rect", k: "rect", label: "Rechteck", key: "Q", icon: "srect" },
  { id: "shape-circle", k: "circle", label: "Kreis", key: "O", icon: "scircle" },
];
export const shapeTool = (id) => SHAPE_TOOLS.find((t) => t.id === id);

const r3 = (n) => Math.round(n * 1000) / 1000;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Darstellung übernehmen (für neue Formen und beim Laden)
function style(o, src) {
  if (isColor(src.c)) o.c = src.c;
  if (src.d === true) o.d = true;
  if (o.k !== "line" && BY_KEY[src.fill]) o.fill = src.fill;
  return o;
}
// Beim Laden prüfen. null = defekt.
export function cleanShape(it, id) {
  if (it.k === "line" && Array.isArray(it.pts) && it.pts.length === 2 && it.pts.every((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1])))
    return style({ id, type: "shape", k: "line", pts: it.pts.map((p) => [p[0], p[1]]) }, it);
  if (it.k === "rect" && [it.x, it.y, it.w, it.h].every(isNum) && it.w > 0 && it.h > 0) return style({ id, type: "shape", k: "rect", x: it.x, y: it.y, w: it.w, h: it.h }, it);
  if (it.k === "circle" && [it.x, it.y, it.r].every(isNum) && it.r > 0) return style({ id, type: "shape", k: "circle", x: it.x, y: it.y, r: it.r }, it);
  return null;
}

// Neue Form aus zwei Punkten (Anfang a, Zeiger b). Linie: Shift = waagrecht oder senkrecht, Rechteck: Shift = Quadrat. Kreis: a = Mitte.
export function shapeFrom(k, a, b, shift = false, st = {}) {
  if (k === "line") {
    let [x, y] = [b.x, b.y];
    if (shift) { if (Math.abs(x - a.x) >= Math.abs(y - a.y)) y = a.y; else x = a.x; }
    return style({ type: "shape", k, pts: [[a.x, a.y], [r3(x), r3(y)]] }, st);
  }
  if (k === "rect") {
    let w = b.x - a.x, h = b.y - a.y;
    if (shift) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
    return style({ type: "shape", k, x: r3(Math.min(a.x, a.x + w)), y: r3(Math.min(a.y, a.y + h)), w: r3(Math.abs(w)), h: r3(Math.abs(h)) }, st);
  }
  return style({ type: "shape", k, x: a.x, y: a.y, r: r3(Math.hypot(b.x - a.x, b.y - a.y)) }, st);
}
export const shapeEmpty = (s) => (s.k === "line" ? s.pts[0][0] === s.pts[1][0] && s.pts[0][1] === s.pts[1][1] : s.k === "rect" ? !(s.w > 0 && s.h > 0) : !(s.r > 0));

export function shapeBox(s) {
  if (s.k === "line") { const [[x1, y1], [x2, y2]] = s.pts; return { x0: Math.min(x1, x2), y0: Math.min(y1, y2), x1: Math.max(x1, x2), y1: Math.max(y1, y2) }; }
  if (s.k === "rect") return { x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.h };
  return { x0: s.x - s.r, y0: s.y - s.r, x1: s.x + s.r, y1: s.y + s.r };
}
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
// Treffer: auf dem Strich, bei Füllung auch innen
export function hitShape(s, x, y, tol) {
  if (s.k === "line") return segDist(x, y, ...s.pts[0], ...s.pts[1]) <= tol;
  if (s.k === "circle") { const d = Math.hypot(x - s.x, y - s.y); return Math.abs(d - s.r) <= tol || (!!s.fill && d <= s.r); }
  const inside = x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
  if (s.fill && inside) return true;
  const c = [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]];
  return c.some((p, i) => segDist(x, y, ...p, ...c[(i + 1) % 4]) <= tol);
}

const dash = (s) => (s.d ? ' stroke-dasharray="7 4"' : "");
export function shapeSVG(s) {
  const col = colorCss(s.c), base = `stroke="${col}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="${s.fill ? colorCss(s.fill) : "none"}"${dash(s)}`;
  if (s.k === "line") return `<line x1="${s.pts[0][0]}" y1="${s.pts[0][1]}" x2="${s.pts[1][0]}" y2="${s.pts[1][1]}" ${base}/>`;
  if (s.k === "rect") return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" ${base}/>`;
  return `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" ${base}/>`;
}

// Griffe: Linie an beiden Enden, Rechteck an den Ecken (die Gegenecke bleibt), Kreis rechts, oben, links, unten (Radius)
export function shapeHandles(s) {
  if (s.k === "line") return s.pts.map((p, i) => ({ x: p[0], y: p[1], h: i }));
  if (s.k === "rect") return [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]].map(([x, y], i) => ({ x: r3(x), y: r3(y), h: i }));
  return [[s.r, 0], [0, s.r], [-s.r, 0], [0, -s.r]].map(([dx, dy], i) => ({ x: r3(s.x + dx), y: r3(s.y + dy), h: i }));
}
// Griff h von o (Stand beim Anfassen) auf den Punkt c ziehen
export function dragShapeHandle(s, o, h, c) {
  if (s.k === "line") { s.pts = o.pts.map((p, i) => (i === h ? [c.x, c.y] : [...p])); return; }
  if (s.k === "circle") { s.r = Math.max(0.1, r3(Math.hypot(c.x - o.x, c.y - o.y))); return; }
  const corners = [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]], [fx, fy] = corners[(h + 2) % 4];
  Object.assign(s, { x: r3(Math.min(fx, c.x)), y: r3(Math.min(fy, c.y)), w: Math.max(0.1, r3(Math.abs(c.x - fx))), h: Math.max(0.1, r3(Math.abs(c.y - fy))) });
}

// DXF: eigener Layer SCH_FORMEN, Farbe als Farbindex am Objekt, gestrichelt mit Linientyp DASHED, Füllung als Schraffur SOLID unter dem Umriss
export function shapeDxf(d, s) {
  const o = { layerName: SHAPE_LAYER, colorNumber: colorAci(s.c), ...(s.d ? { lineType: "DASHED" } : {}) };
  if (s.fill) {
    const v = s.k === "rect" ? [[s.x, s.y, 0], [s.x + s.w, s.y, 0], [s.x + s.w, s.y + s.h, 0], [s.x, s.y + s.h, 0]] : [[s.x - s.r, s.y, 1], [s.x + s.r, s.y, 1]];
    const bp = new HatchBoundaryPaths();
    bp.addPolylineBoundary(new HatchPolylineBoundary(v.map(([x, y, bulge]) => ({ x: r3(x), y: r3(y), bulge }))));
    d.addHatch(bp, pattern({ name: HatchPredefinedPatterns.SOLID }), { layerName: SHAPE_LAYER, colorNumber: colorAci(s.fill) });
  }
  if (s.k === "line") d.addLine(point3d(...s.pts[0]), point3d(...s.pts[1]), o);
  else if (s.k === "rect") d.addLWPolyline([[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]].map(([x, y]) => ({ point: { x: r3(x), y: r3(y) } })), { ...o, flags: 1 });
  else d.addCircle(point3d(s.x, s.y), s.r, o);
}
