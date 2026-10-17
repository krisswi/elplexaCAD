// Disposition (Verteileraufbau, massstäblich): Bauteile, Geometrie, Fang, Darstellung und Zeichen-Bausteine für den DXF-Export.
// Einheit mm, y nach oben. Dieses Modul importiert nichts aus model.js (sonst entstünde ein Zirkelbezug).
import { textBox } from "./geom.js";
import * as S from "./schrank.js";

export const TE = 17.5; // Teilungseinheit: 17,5 mm (CJ, Hager MCN110)
export const SNAP_TE = TE / 2; // kleinste Raststufe auf der Schiene (ein Neutralleitertrenner ist 0,5 TE breit)
export const RAIL_H = 35; // Hutschiene TH35, 35 mm breit
export const DEV_H = 83; // Gerätehöhe laut Hager MCN110, pro Gerät einstellbar
export const RAIL_MARGIN = 20; // Rand zwischen Plattenkante und Schienenfeld (für die Abdeckung)
export const MIN_TEXT = 1.2; // kleinste Texthöhe auf dem Schemablatt in mm
export const DIM_H = 10; // bisherige Texthöhe der Bemassung (gilt noch für Ansichten auf dem Schema ohne dimP, damit alte Dateien gleich aussehen)
export const DIM_PLAN = 5; // Vorgabe Masstext im Plan in mm (CJ 16.10.: 10 mm „viel zu gross“), im Fenster „Ansicht“ einstellbar (dimH)
export const DIM_PAPER = MIN_TEXT; // Vorgabe Masstext auf dem Schemablatt in mm Papier (dimP), nicht kleiner als MIN_TEXT
// Einstellungen eines Dispositionsblatts für Zeichnen, DXF, PDF: Bemassung, Türen, Masstext, ausgeblendete automatische Masse
export const planOpts = (m) => ({ dims: m.dims !== false, doors: m.doors !== false, dimH: m.dimH ?? DIM_PLAN, off: m.dimsOff || [] });

export const DISPO_LAYERS = {
  SCH_DISPO_PLATTE: { color: 8, css: "#6b7785" },
  SCH_DISPO_SCHIENE: { color: 4, css: "#0f7f96" },
  SCH_DISPO_GERAET: { color: 7, css: "#17212b" },
  SCH_DISPO_MASS: { color: 6, css: "#9b3d8f" },
  SCH_DISPO_SCHRANK: { color: 7, css: "#3b4652" },
  // Schienen N, PE, PEN (16.10.2026): Farben wie im Schema
  SCH_DISPO_N: { color: 5, css: "#2563c9" },
  SCH_DISPO_PE: { color: 3, css: "#1b8a4b" },
  SCH_DISPO_GELB: { color: 2, css: "#b89400" },
};
const FILL = { SCH_DISPO_PLATTE: "#f1f4f7", SCH_DISPO_SCHIENE: "#dbe9ee", SCH_DISPO_GERAET: "#ffffff", SCH_DISPO_SCHRANK: "#fafbfc" };
const INK = "#17212b";

// Bauteile der Disposition (Typen im Blatt). Die Ansicht auf dem Schemablatt heisst dispoview.
export const PLAN_TYPES = new Set(["plate", "rail", "device", "cabinet", "part", "dim", "cable"]); // Schrank und Teile seit 16.10.2026 (schrank.js), dim = gesetztes Mass (Werkzeug Bemassung), cable = gezeichnete Leitung mit Text (Zuleitung VNB)
// Hintergrund-Bauteile: nur am Rand wählbar, Inhalt wandert mit
export const isBack = (it) => it.type === "plate" || it.type === "cabinet";
export const isPlanType = (t) => PLAN_TYPES.has(t) || t === "dispoview";

// Gerätevorlagen. Breiten laut CJ (1, 3, 4 TE; Neutralleitertrenner 0,5 TE). LS 2-polig mit 2 TE ist eine Annahme.
export const DEVICE_PRESETS = [
  { id: "LS1", label: "LS 1-polig", type: "LS 1P", te: 1, sub: "1 TE" },
  { id: "LS2", label: "LS 2-polig", type: "LS 2P", te: 2, sub: "2 TE (Annahme)" },
  { id: "LS3", label: "LS 3-polig", type: "LS 3P", te: 3, sub: "3 TE" },
  { id: "LS4", label: "LS 4-polig", type: "LS 4P", te: 4, sub: "4 TE" },
  { id: "NTR", label: "Neutralleitertrenner", type: "N", te: 0.5, sub: "0,5 TE" },
  { id: "FILS", label: "FILS (RCBO)", type: "13A", l2: "30mA", top: "FILS", te: 2, sub: "Strom und mA, 2 TE (Annahme)" },
  { id: "FI", label: "FI (RCD)", type: "63A", l2: "30mA", top: "FI", te: 4, sub: "Strom und mA, 4 TE" },
  { id: "UHR", label: "Schaltuhr", type: "Uhr", te: 2, sub: "2 TE (Annahme aus Dossier)" },
  { id: "SCH", label: "Schütz", type: "R20-20", top: "S", te: 1, sub: "1 TE (Annahme)" },
  { id: "LEER", label: "Leerfeld", type: "", te: 1, sub: "Breite in TE frei" },
  { id: "ZAEHLER", label: "Zähler", type: "", top: "Bilanz", te: 4, sub: "Hutschiene, 4 TE (Annahme)" },
  { id: "DIAZED", label: "Diazed-Element", type: "II", te: 1.5, sub: "Kreis, II = Grösse 2, 1,5 TE (Annahme)" },
  { id: "SPD", label: "SPD", type: "DVA M NG 3P 100 FM", te: 4, sub: "Kasten mit Text, 4 TE (Annahme)" },
  { id: "KL", label: "Klemmenblock", type: "", te: 0, n: 5, qs: "10", sub: "Anzahl × Querschnitt, z. B. 5×10" },
  { id: "PK", label: "Prüfklemme", type: "", te: 3, h: 45, sub: "3 TE × 45 mm (Annahme aus Dossier)" },
  { id: "FREI", label: "Gerät frei", type: "Gerät", te: 2, sub: "TE und Text selbst wählen" },
];
// Klemmenblock: Breite aus Anzahl und Querschnitt, Höhe aus dem Querschnitt
export const klemmFit = (d) => ({ te: S.klW(d) / TE, h: S.klH(d.qs) });
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
  if (it.type === "cabinet") return S.cabBox(it);
  if (it.type === "part") return { x0: it.x, y0: it.y, x1: r3(it.x + it.w), y1: r3(it.y + it.h) };
  if (it.type === "dim") { const q = dimGeo(it); return unionBox([...q.pts, ...q.line].map(([x, y]) => ({ x0: x, y0: y, x1: x, y1: y }))); }
  if (it.type === "cable") return unionBox(it.pts.map(([x, y]) => ({ x0: x, y0: y, x1: x, y1: y })));
  if (it.type === "dispoview") return { x0: it.x, y0: it.y - 6, x1: it.x + it.bw / it.den, y1: it.y + it.bh / it.den };
  throw new Error("kein Bauteil: " + it.type);
}
export const unionBox = (boxes) => boxes.length ? {
  x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)),
  x1: Math.max(...boxes.map((b) => b.x1)), y1: Math.max(...boxes.map((b) => b.y1)),
} : null;

// Ausdehnung aller Bauteile und Texte einer Disposition
// o: Einstellungen wie planOpts (true = mit Bemassung in der Vorgabegrösse)
export function contentBBox(items, o = {}) {
  if (typeof o === "boolean") o = { dims: o };
  const { dims = false, dimH = DIM_PLAN, off = [] } = o;
  const boxes = items.map((it) => (it.type === "text" ? textBox(it.x, it.y, it.h, it.s) : isPlanType(it.type) && it.type !== "dim" ? itemBBox(it) : null)).filter(Boolean);
  if (dims) boxes.push(primsBBox(planPrims(items, { dims: true, dimH, off }).filter((p) => p.layer === "SCH_DISPO_MASS")));
  // Schrank (IP, Tiefe), Teile und Texte über Geräten ragen über ihre Box hinaus
  boxes.push(primsBBox(items.flatMap((it) => scaleText(it, it.type === "cabinet" ? S.cabPrims(it, dimH, false) : it.type === "part" ? S.partPrims(it) : it.type === "device" ? S.devDeco(it, devW(it)) : it.type === "cable" ? cablePrims(it) : []))));
  return unionBox(boxes.filter(Boolean));
}
function primsBBox(prims) {
  const boxes = [];
  for (const p of prims) {
    if (p.k === "rect" || p.k === "slot") boxes.push({ x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h });
    else if (p.k === "circle") boxes.push({ x0: p.x - p.r, y0: p.y - p.r, x1: p.x + p.r, y1: p.y + p.r });
    else if (p.k === "line") boxes.push({ x0: Math.min(p.x1, p.x2), y0: Math.min(p.y1, p.y2), x1: Math.max(p.x1, p.x2), y1: Math.max(p.y1, p.y2) });
    else if (p.k === "text") {
      const w = p.s.length * p.h * 0.55, a = p.anchor;
      const x0 = a === "c" ? p.x - w / 2 : a === "rm" ? p.x - w : p.x;
      const b = { x0, x1: x0 + w, y0: p.y - 0.5 * p.h, y1: p.y + 0.5 * p.h };
      boxes.push(p.rot ? { x0: p.x - (b.y1 - b.y0) / 2, x1: p.x + (b.y1 - b.y0) / 2, y0: p.y - w / 2, y1: p.y + w / 2 } : b);
    }
  }
  return unionBox(boxes);
}

// Treffer: Eine Platte nur am Rand (so lässt sich innerhalb der Platte mit einem Rahmen wählen), alles andere in der Fläche
export function hitItem(it, x, y, tol) {
  if (it.type === "dim") { // gesetztes Mass: auf der Masslinie oder am Text
    const q = dimGeo(it), [a, b] = q.line;
    return segDist(x, y, a[0], a[1], b[0], b[1]) <= Math.max(tol, 2) || Math.hypot(x - q.tx, y - q.ty) <= Math.max(tol, 8);
  }
  if (it.type === "cable") return it.pts.some((p, i) => i > 0 && segDist(x, y, ...it.pts[i - 1], ...p) <= Math.max(tol, 3));
  const b = itemBBox(it);
  if (!isBack(it)) return inBox(b, x, y, tol);
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
  if (!(it.type === "plate" && !it.fixed) && !(it.type === "part" && S.PART_KINDS[it.kind]?.free)) return [];
  const xs = { w: it.x, "": it.x + it.w / 2, e: it.x + it.w }, ys = { s: it.y, "": it.y + it.h / 2, n: it.y + it.h };
  const out = [];
  for (const v of ["s", "", "n"]) for (const u of ["w", "", "e"]) if (u || v) out.push({ h: v + u, x: r3(xs[u]), y: r3(ys[v]) });
  return out;
}
export const MIN_PLATE = 2 * RAIL_MARGIN + 10; // kleinste Platte beim Ziehen
// Platte o mit Griff h auf Punkt (x, y) ziehen: die gegenüberliegende Kante bleibt
export function resizePlate(o, h, x, y, min = MIN_PLATE) {
  let x0 = o.x, x1 = o.x + o.w, y0 = o.y, y1 = o.y + o.h;
  if (h.includes("w")) x0 = Math.min(x, x1 - min);
  if (h.includes("e")) x1 = Math.max(x, x0 + min);
  if (h.includes("s")) y0 = Math.min(y, y1 - min);
  if (h.includes("n")) y1 = Math.max(y, y0 + min);
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
export function massTargets(it, h = DIM_PLAN) {
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
    if (!PLAN_TYPES.has(it.type) || it.type === "dim" || skip.has(it.id)) continue;
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
// doors: Türen (Bänder, Griffe, Mittelstoss) zeichnen; aus im Fenster „Ansicht“ (CJ 16.10.: zum Bestücken nicht nötig)
// Textgrösse pro Bauteil (CJ 16.10.2026): Faktor tf (fehlt = 1 = bisherige Grösse), gilt für alle Texte des Bauteils ausser der Bemassung
// Seit 16.10.2026: Texte innen mit fit werden danach höchstens so breit wie der Platz (kleiner statt breiter), Texte aussen (st) sind schon gestapelt.
export function scaleText(it, ps) {
  const tf = it.tf > 0 ? it.tf : 1;
  return ps.map((p) => {
    if (p.k !== "text" || p.layer === "SCH_DISPO_MASS" || p.st) return p;
    const h = r3(Math.min(p.fit ? S.fitH(p.h * tf, p.s, p.fit) : p.h * tf, p.cap ?? Infinity));
    return h === p.h ? p : { ...p, h };
  });
}
export function planPrims(items, { dims = false, dimH = DIM_PLAN, doors = true, off = [] } = {}) {
  const bad = deviceIssues(items);
  const out = [];
  for (const c of items.filter((i) => i.type === "cabinet")) out.push(...scaleText(c, S.cabPrims(c, dimH, doors)));
  for (const p of items.filter((i) => i.type === "plate")) {
    out.push({ k: "rect", x: p.x, y: p.y, w: p.w, h: p.h, layer: "SCH_DISPO_PLATTE" });
    const label = (dims ? [p.name] : [p.name, `${p.w} × ${p.h}`]).filter(Boolean).join("  ");
    out.push(...scaleText(p, [{ k: "text", x: p.x, y: p.y + p.h + 6, h: 12, s: label, layer: "SCH_TEXT", anchor: "l" }]));
  }
  for (const r of items.filter((i) => i.type === "rail")) out.push({ k: "rect", x: r.x, y: r.y - RAIL_H / 2, w: r.len, h: RAIL_H, layer: "SCH_DISPO_SCHIENE" });
  const parts = items.filter((i) => i.type === "part").sort((a, b) => (b.kind === "BAR") - (a.kind === "BAR")); // Schienen zuerst, N-Trenner liegen darauf
  for (const p of parts.filter((i) => i.kind !== "NHABD")) out.push(...scaleText(p, S.partPrims(p)));
  for (const d of items.filter((i) => i.type === "device")) {
    const w = devW(d);
    out.push({ k: "rect", x: d.x, y: d.y - d.h / 2, w, h: d.h, layer: "SCH_DISPO_GERAET", bad: bad.has(d.id) });
    out.push(...scaleText(d, S.devDeco(d, w)));
  }
  for (const p of parts.filter((i) => i.kind === "NHABD")) out.push(...scaleText(p, S.partPrims(p))); // Abdeckung liegt vor den NH
  for (const c of items.filter((i) => i.type === "cable")) out.push(...cablePrims(c));
  for (const t of items.filter((i) => i.type === "text")) out.push({ k: "text", x: t.x, y: t.y, h: t.h, s: t.s, layer: "SCH_TEXT", anchor: "l" });
  if (dims) {
    const n = out.length, hide = new Set(off);
    dimPrims(items, dimH, out);
    if (hide.size) out.splice(n, out.length - n, ...out.slice(n).filter((p) => !hide.has(p.dk)));
    for (const d of items.filter((i) => i.type === "dim")) out.push(...dimItemPrims(d, dimH));
  }
  return out;
}

// Gezeichnete Leitung (Zuleitung VNB, CJ 16.10.2026): Polylinie, kräftig; Text am längsten Abschnitt, waagrecht darüber, senkrecht links davon (gedreht)
export const CABLE_TEXT = "Zuleitung VNB";
export function cablePrims(c) {
  const out = [];
  let best = 0, bl = -1;
  for (let i = 1; i < c.pts.length; i++) {
    const [a, b] = [c.pts[i - 1], c.pts[i]], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    out.push({ k: "line", x1: a[0], y1: a[1], x2: b[0], y2: b[1], layer: "SCH_DISPO_GERAET", wt: 1 });
    if (l > bl) { bl = l; best = i; }
  }
  if (c.s && best) {
    const [a, b] = [c.pts[best - 1], c.pts[best]], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, h = r3(S.OUT_H * (c.tf > 0 ? c.tf : 1));
    out.push(Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? { k: "text", x: r3(mx), y: r3(my + h), h, s: c.s, layer: "SCH_TEXT", anchor: "c", st: true }
      : { k: "text", x: r3(mx - h), y: r3(my), h, s: c.s, layer: "SCH_TEXT", anchor: "c", rot: 90, st: true });
  }
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
// up = 1: Kette über dem Bauteil (Hilfslinie reicht nach oben über die Masslinie)
function chainH(out, pts, yl, h, extFrom, up = -1) {
  const q = mergePoints(pts, (l) => fmtMass(l).length * h * 0.55 + h * 0.6);
  const ln = (x1, y1, x2, y2) => out.push({ k: "line", x1, y1, x2, y2, layer: LAYER_M });
  ln(q[0], yl, q[q.length - 1], yl);
  for (const x of q) { ln(x, extFrom(x), x, yl + up * 0.3 * h); ln(x - 0.25 * h, yl - 0.25 * h, x + 0.25 * h, yl + 0.25 * h); }
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

// Jedes automatische Mass trägt einen Schlüssel dk (Bauteil-Id und Art), damit es sich einzeln ausblenden lässt (dimsOff)
// Seit 16.10.2026 (CJ): alle automatischen Masse ausserhalb der Dispo bzw. des Schranks (outerChains). Im Schrank keine
// automatischen Masse mehr (Platten, Schienen, Geräte). Platten ausserhalb eines Schranks: eigene Masse nur, solange keine äussere Kette steht.
function dimPrims(items, h, out) {
  const tag = (dk, fn) => { const n = out.length; fn(); for (let i = n; i < out.length; i++) out[i].dk = dk; };
  const cabs = items.filter((i) => i.type === "cabinet");
  const inCab = (it) => { const b = itemBBox(it); return cabs.some((c) => { const k = S.cabBox(c); return b.x0 >= k.x0 - 0.01 && b.x1 <= k.x1 + 0.01 && b.y0 >= k.y0 - 0.01 && b.y1 <= k.y1 + 0.01; }); };
  const outer = outerChains(items, h, out, tag, inCab);
  for (const p of items.filter((i) => i.type === "plate" && !inCab(i))) {
    if (!outer) {
      tag(`p${p.id}w`, () => chainH(out, [p.x, p.x + p.w], p.y - 2.5 * h, h, () => p.y - 0.2 * h));
      tag(`p${p.id}h`, () => chainV(out, [p.y, p.y + p.h], p.x - 2.5 * h, -1, h, () => p.x - 0.2 * h));
    }
    const rails = contained(items, p).filter((o) => o.type === "rail").sort((a, b) => a.y - b.y);
    if (rails.length) {
      const endX = new Map([[p.y, p.x + p.w], [p.y + p.h, p.x + p.w]]);
      for (const r of rails) endX.set(r3(r.y), Math.max(endX.get(r3(r.y)) ?? -Infinity, r.x + r.len));
      const tmp = [];
      const q = chainV(tmp, [p.y, ...rails.map((r) => r.y), p.y + p.h], p.x + p.w + 2.5 * h, 1, h, (y) => (endX.get(r3(y)) ?? p.x + p.w) + 0.2 * h);
      if (q.length > 2) out.push(...tmp.map((t) => ({ ...t, dk: `p${p.id}r` }))); // sonst wäre es nur das Gesamtmass
    }
  }
  for (const r of items.filter((i) => i.type === "rail" && !inCab(i))) {
    const devs = items.filter((d) => d.type === "device" && railOf(items, d) === r).sort((a, b) => a.x - b.x);
    if (!devs.length) continue;
    const x1 = r.x + r.len, maxH = Math.max(...devs.map((d) => d.h));
    const pts = [r.x, x1], reach = new Map(); // Hilfslinie startet an der Geräteunterkante, am Schienenende an der Schiene
    const mark = (x, hh) => { pts.push(x); reach.set(r3(x), Math.max(reach.get(r3(x)) ?? 0, hh)); };
    for (const d of devs) { mark(Math.max(r.x, d.x), d.h); mark(Math.min(x1, d.x + devW(d)), d.h); }
    tag(`r${r.id}`, () => chainH(out, pts, r.y - maxH / 2 - 1.6 * h, h, (x) => r.y - (reach.get(r3(x)) ?? RAIL_H) / 2 - 0.2 * h));
  }
}

// Äussere Bemassung (CJ 16.10.2026). Hauptteile = Schränke und Platten ausserhalb eines Schranks. Mit Schrank oder ab zwei Hauptteilen:
// oben waagrecht, von innen nach aussen: Platten (ox), Felder bzw. Hauptteile (of), ganz aussen das Gesamtmass (oX);
// links senkrecht: Platten (oy), Schrank mit Sockel bzw. Hauptteile (oh), ganz aussen die Gesamthöhe (oY).
// Gleiche Werte bleiben einzeln (250 | 250). Eine Kette mit denselben Punkten wie die nächst innere liegt doppelt und entfällt,
// ebenso eine Kette mit nur einem Mass (sie wäre das Gesamtmass). Hilfslinien nur ausserhalb der Gesamtausdehnung.
// Rückgabe: true, wenn äussere Ketten stehen.
function outerChains(items, h, out, tag, inCab) {
  const cabs = items.filter((i) => i.type === "cabinet"), free = items.filter((i) => i.type === "plate" && !inCab(i)), tops = [...cabs, ...free];
  if (!cabs.length && tops.length < 2) return false;
  const plates = items.filter((i) => i.type === "plate"), B = unionBox(tops.map(itemBBox));
  // Oberkante inkl. Schranktext (IP, Bezeichnung) und Plattenbezeichnung
  const T = Math.max(B.y1, ...cabs.filter((c) => c.ip || c.name).map((c) => c.y + c.h + 1.5 * S.CAB_TEXT * (c.tf || 1)), ...free.map((p) => p.y + p.h + 18 * (p.tf || 1)));
  const xsP = plates.flatMap((p) => [p.x, p.x + p.w]), ysP = plates.flatMap((p) => [p.y, p.y + p.h]);
  const xsF = [...cabs.flatMap((c) => [c.x, ...S.fieldXs(c), c.x + S.cabW(c)]), ...free.flatMap((p) => [p.x, p.x + p.w])];
  const ysF = [...cabs.flatMap((c) => [c.y - c.plinth, c.y, c.y + c.h]), ...free.flatMap((p) => [p.y, p.y + p.h])];
  const key = (pts) => [...new Set(pts.map(r3))].sort((a, b) => a - b).join(" ");
  // Ketten von innen nach aussen; doppelte (gleiche Punkte wie die innere) und solche mit nur einem Mass fallen weg
  const levels = (list, tot) => {
    const keep = [], seen = new Set([key(tot)]);
    for (const [dk, pts] of list) { const k = key(pts); if (pts.length && !seen.has(k)) { keep.push([dk, pts]); seen.add(k); } }
    return [...keep, ["", tot]]; // zuletzt das Gesamtmass
  };
  const hor = levels([["ox", xsP], ["of", xsF]], [B.x0, B.x1]), ver = levels([["oy", ysP], ["oh", ysF]], [B.y0, B.y1]);
  hor.forEach(([dk, pts], i) => tag(i === hor.length - 1 ? "oX" : dk, () => chainH(out, pts, r3(T + (2.5 + 2 * i) * h), h, () => T + 0.2 * h, 1)));
  ver.forEach(([dk, pts], i) => tag(i === ver.length - 1 ? "oY" : dk, () => chainV(out, pts, r3(B.x0 - (2.5 + 2 * i) * h), -1, h, () => B.x0 - 0.2 * h)));
  return true;
}

// ---------- Gesetzte Masse (Werkzeug Bemassung, CJ 16.10.) ----------
// Mass d: Punkt 1 = (x, y), Punkt 2 = (x + dx, y + dy), dir h = waagrecht gemessen, v = senkrecht.
// off = Lage der Masslinie quer zur Messrichtung, gemessen ab Punkt 1. So wandert das Mass beim Verschieben als Ganzes.
export function dimGeo(d) {
  const pts = [[d.x, d.y], [r3(d.x + d.dx), r3(d.y + d.dy)]], H = d.dir === "h";
  const at = r3((H ? d.y : d.x) + d.off), P = (u, v) => (H ? [u, v] : [v, u]);
  const u0 = H ? pts[0][0] : pts[0][1], u1 = H ? pts[1][0] : pts[1][1];
  const line = [P(u0, at), P(u1, at)], v = Math.abs(u1 - u0);
  return { pts, at, P, H, line, v, tx: H ? (u0 + u1) / 2 : at, ty: H ? at : (u0 + u1) / 2 };
}
export function dimItemPrims(d, h) {
  const out = [], g = dimGeo(d), ln = (a, b) => out.push({ k: "line", x1: r3(a[0]), y1: r3(a[1]), x2: r3(b[0]), y2: r3(b[1]), layer: LAYER_M });
  ln(...g.line);
  for (const q of g.pts) {
    const u = g.H ? q[0] : q[1], w = g.H ? q[1] : q[0], s = Math.sign(g.at - w);
    if (s) ln(g.P(u, w + s * 0.2 * h), g.P(u, g.at + s * 0.3 * h)); // Hilfslinie vom Punkt bis kurz über die Masslinie
    ln(g.P(u - 0.25 * h, g.at - 0.25 * h), g.P(u + 0.25 * h, g.at + 0.25 * h)); // Schrägstrich
  }
  const side = d.off >= 0 ? 1 : -1;
  out.push(g.H ? { k: "text", x: r3(g.tx), y: r3(g.at + 0.7 * h), h, s: fmtMass(g.v), layer: LAYER_M, anchor: "c" }
    : { k: "text", x: r3(g.at + side * 0.6 * h), y: r3(g.ty), h, s: fmtMass(g.v), layer: LAYER_M, anchor: side > 0 ? "lm" : "rm" });
  return out;
}
// Neues Mass aus zwei Punkten und der Lage m des Zeigers: zwischen den Punkten in x = waagrecht, in y = senkrecht, sonst nach dem grösseren Abstand
export function makeDim(p1, p2, m) {
  const dx = r3(p2.x - p1.x), dy = r3(p2.y - p1.y);
  const inX = m.x > Math.min(p1.x, p2.x) && m.x < Math.max(p1.x, p2.x), inY = m.y > Math.min(p1.y, p2.y) && m.y < Math.max(p1.y, p2.y);
  let dir = inX && !inY ? "h" : inY && !inX ? "v" : Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
  if ((dir === "h" ? dx : dy) === 0) dir = dir === "h" ? "v" : "h";
  if ((dir === "h" ? dx : dy) === 0) return null;
  return { type: "dim", x: p1.x, y: p1.y, dx, dy, dir, off: r3(dir === "h" ? m.y - p1.y : m.x - p1.x) };
}
// Fang für das Werkzeug Bemassung: Ecken und Kantenmitten der Bauteile (auch Feldgrenzen im Schrank), sonst ein Punkt auf einer Kante
export function dimSnap(items, x, y, tol) {
  const segs = [];
  for (const it of items) {
    if (!PLAN_TYPES.has(it.type) || it.type === "dim") continue;
    const b = itemBBox(it);
    segs.push([b.x0, b.y0, b.x1, b.y0], [b.x1, b.y0, b.x1, b.y1], [b.x1, b.y1, b.x0, b.y1], [b.x0, b.y1, b.x0, b.y0]);
    if (it.type === "cabinet") { for (const fx of S.fieldXs(it)) segs.push([fx, it.y, fx, it.y + it.h]); if (it.plinth > 0) segs.push([b.x0, it.y, b.x1, it.y]); }
  }
  let best = null;
  const take = (px, py, k) => { const d = Math.hypot(px - x, py - y); if (d <= tol && (!best || d < best.d)) best = { d, x: r3(px), y: r3(py), k }; };
  for (const s of segs) { take(s[0], s[1], "corner"); take(s[2], s[3], "corner"); take((s[0] + s[2]) / 2, (s[1] + s[3]) / 2, "mid"); }
  if (best) return best;
  for (const s of segs) {
    const vx = s[2] - s[0], vy = s[3] - s[1], l2 = vx * vx + vy * vy, t = l2 ? Math.max(0, Math.min(1, ((x - s[0]) * vx + (y - s[1]) * vy) / l2)) : 0;
    take(s[0] + t * vx, s[1] + t * vy, "edge");
  }
  return best;
}
// Automatisches Mass unter dem Zeiger: Schlüssel dk oder null
export function autoDimAt(items, o, x, y, tol) {
  for (const p of planPrims(items, { ...o, dims: true })) {
    if (!p.dk) continue;
    if (p.k === "line" && segDist(x, y, p.x1, p.y1, p.x2, p.y2) <= tol) return p.dk;
    if (p.k === "text") { const w = p.s.length * p.h * 0.55, x0 = p.anchor === "c" ? p.x - w / 2 : p.anchor === "rm" ? p.x - w : p.x; if (x >= x0 - tol && x <= x0 + w + tol && Math.abs(y - p.y) <= p.h / 2 + tol) return p.dk; }
  }
  return null;
}
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Abbildung der Disposition auf ein Schemablatt: Ursprung (bx, by) der Disposition kommt nach (ox, oy), Faktor k.
export const IDENT = { ox: 0, oy: 0, bx: 0, by: 0, k: 1, minText: 0 };
export const viewMap = (v) => ({ ox: v.x, oy: v.y, bx: v.bx, by: v.by, k: 1 / v.den, minText: MIN_TEXT });
const mx = (m, x) => r3(m.ox + (x - m.bx) * m.k);
const my = (m, y) => r3(m.oy + (y - m.by) * m.k);
const mh = (m, h) => r3(Math.max(h * m.k, m.minText));

const ANCH = { c: ' text-anchor="middle" dominant-baseline="central"', lm: ' text-anchor="start" dominant-baseline="central"', rm: ' text-anchor="end" dominant-baseline="central"' };
const f = r3;
// Füllung: ink = schwarz gefüllt, cover = Abdeckung (halb durchsichtig), none = leer, sonst nach Layer
export const SOLID = { n: "#3b78e0", pe: "#2fa055", ye: "#f3d22a" }; // Schienen N, PE (grün), gelber Streifen
const fillOf = (p) => (p.fill === "ink" ? INK : p.fill === "cover" ? "#c3ccd5" : p.fill === "none" ? "none" : SOLID[p.fill] || FILL[p.layer] || "none");
// Strichart in mm der Disposition: Strich (Trennwand) oder Punkte (Abdeckstreifen)
const dashOf = (p, m) => (p.dash === "dash" ? ` stroke-dasharray="${f(20 * m.k)} ${f(12 * m.k)}"` : p.dash === "dot" ? ` stroke-dasharray="0 ${f(6 * m.k)}" stroke-linecap="round"` : "");
export function primsSVG(prims, m = IDENT, { opacity = 1 } = {}) {
  const css = (layer) => (DISPO_LAYERS[layer]?.css) || INK;
  let s = opacity < 1 ? `<g opacity="${opacity}">` : "<g>";
  for (const p of prims) {
    if (p.k === "rect") {
      const stroke = p.bad ? "#d02b20" : css(p.layer), r = p.r ? ` rx="${f(p.r * m.k)}"` : "", op = p.fill === "cover" ? ' fill-opacity="0.75"' : "";
      s += `<rect x="${mx(m, p.x)}" y="${my(m, p.y)}" width="${f(p.w * m.k)}" height="${f(p.h * m.k)}"${r} fill="${fillOf(p)}"${op} stroke="${stroke}" stroke-width="${p.bad ? 2 : 1.3}" stroke-linejoin="round"/>`;
    } else if (p.k === "slot") {
      s += `<rect x="${mx(m, p.x)}" y="${my(m, p.y)}" width="${f(p.w * m.k)}" height="${f(p.h * m.k)}" rx="${f((Math.min(p.w, p.h) / 2) * m.k)}" fill="none" stroke="${css(p.layer)}" stroke-width="1.3"/>`;
    } else if (p.k === "circle") {
      s += `<circle cx="${mx(m, p.x)}" cy="${my(m, p.y)}" r="${f(p.r * m.k)}" fill="${p.fill === "ink" ? INK : "none"}" stroke="${css(p.layer)}" stroke-width="1.3"${dashOf(p, m)}/>`;
    } else if (p.k === "line") {
      s += `<line x1="${mx(m, p.x1)}" y1="${my(m, p.y1)}" x2="${mx(m, p.x2)}" y2="${my(m, p.y2)}" stroke="${css(p.layer)}" stroke-width="${p.layer === "SCH_DISPO_MASS" ? 0.8 : p.wt ? 3.5 : 1.3}"${p.wt ? ' stroke-linecap="round" class="dp-cable"' : ""}${dashOf(p, m)}/>`;
    } else if (p.k === "text") {
      s += `<text transform="translate(${mx(m, p.x)},${my(m, p.y)}) scale(1,-1)${p.rot ? ` rotate(${-p.rot})` : ""}" font-size="${mh(m, p.h)}" fill="${p.layer === "SCH_DISPO_MASS" ? css(p.layer) : INK}" stroke="none"${ANCH[p.anchor] || ""}>${esc(p.s)}</text>`;
    }
  }
  return s + "</g>";
}

export const planSVG = (items, o = {}) => primsSVG(planPrims(items, o));
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
// Seit 16.10.2026 trägt die Ansicht dimP (Masstext auf dem Blatt in mm Papier); ältere Ansichten behalten die bisherige Regel.
export const viewDimH = (v) => (v.dimP ? Math.max(v.dimP, MIN_TEXT) * v.den : Math.max(DIM_H, MIN_TEXT * v.den));
export const viewPrims = (v) => planPrims(v.items, { dims: v.dims === true, dimH: viewDimH(v), doors: v.doors !== false, off: v.off || [] });
export function viewSVG(v) {
  const cap = { k: "text", x: v.x, y: v.y - 4.5, h: 2.5, s: viewCaption(v), layer: "SCH_TEXT", anchor: "l" };
  return primsSVG(viewPrims(v), viewMap(v)) + primsSVG([cap]);
}

// Vorschaubild aus den Bausteinen eines Bauteils (Schrank, Teil, Gerät), eingepasst
export function itemThumb(it) {
  const prims = planPrims(Array.isArray(it) ? it : [it]), b = primsBBox(prims), pad = 0.06 * Math.max(b.x1 - b.x0, b.y1 - b.y0);
  return `<svg viewBox="${f(b.x0 - pad)} ${f(-b.y1 - pad)} ${f(b.x1 - b.x0 + 2 * pad)} ${f(b.y1 - b.y0 + 2 * pad)}" aria-hidden="true"><g transform="scale(1,-1)">${primsSVG(prims.filter((p) => p.k !== "text" || p.layer !== "SCH_DISPO_MASS"))}</g></svg>`;
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
const withTf = (o, it) => { if (isNum(it.tf) && it.tf > 0 && it.tf !== 1) o.tf = it.tf; return o; };
export function cleanPlanItem(it, id) {
  if (it.type === "plate" && [it.x, it.y, it.w, it.h].every(isNum) && it.w > 0 && it.h > 0) {
    const o = { id, type: "plate", x: it.x, y: it.y, w: it.w, h: it.h, name: String(it.name ?? "") };
    if (it.fixed === true) o.fixed = true;
    return withTf(o, it);
  }
  if (it.type === "rail" && [it.x, it.y, it.len].every(isNum) && it.len > 0) return { id, type: "rail", x: it.x, y: it.y, len: it.len, ...(it.free === true ? { free: true } : {}) }; // free: freie Schiene (16.10.2026)
  if (it.type === "device" && [it.x, it.y, it.te, it.h].every(isNum) && it.te > 0 && it.h > 0) {
    const o = { id, type: "device", x: it.x, y: it.y, te: it.te, h: it.h, kind: String(it.kind ?? "FREI"), label: String(it.label ?? ""), bmk: String(it.bmk ?? "") };
    for (const k of ["top", "l2", "qs", "beschr"]) if (typeof it[k] === "string" && it[k]) o[k] = it[k]; // seit 16.10.2026: Text darüber, zweite Zeile, Querschnitt, Beschriftung
    if (isNum(it.n) && it.n >= 1) o.n = Math.round(it.n);
    for (const k of ["trenn", "haupt"]) if (it[k] === true) o[k] = true;
    return withTf(o, it);
  }
  if (it.type === "cabinet" && [it.x, it.y, it.h, it.depth, it.plinth, it.side].every(isNum) && it.h > 0 && Array.isArray(it.fields) && it.fields.length && it.fields.every((f) => isNum(f?.w) && f.w > 0)) {
    return withTf({ id, type: "cabinet", x: it.x, y: it.y, maker: S.CAB_MAKERS[it.maker] ? it.maker : "frei", h: it.h, depth: Math.max(0, it.depth), plinth: Math.max(0, it.plinth), side: Math.max(0, it.side),
      ip: String(it.ip ?? ""), name: String(it.name ?? ""), fields: it.fields.map((f) => ({ w: f.w, door: S.DOORS[f.door] ? f.door : "r", t: String(f.t ?? "") })) }, it);
  }
  if (it.type === "part" && S.PART_KINDS[it.kind] && [it.x, it.y, it.w, it.h].every(isNum) && it.w > 0 && it.h > 0) {
    const o = { id, type: "part", kind: it.kind, x: it.x, y: it.y, w: it.w, h: it.h };
    if (it.kind === "PEN") { o.kind = "BAR"; o.c = "PEN"; } // alte PEN-Schiene geht in der Schiene N/PE/PEN auf (16.10.2026)
    if (o.kind === "BAR") o.c = S.BAR_KINDS[it.c] ? it.c : o.c || "N";
    for (const k of ["s", "s2", "size", "bmk"]) if (typeof it[k] === "string") o[k] = it[k]; // bmk seit 16.10.2026 (Zählerplatte)
    for (const k of ["beschr", "wr"]) if (typeof it[k] === "string" && it[k]) o[k] = it[k]; // Beschriftung, Wandler-Verhältnis (16.10.2026)
    if (S.WANDLER_LAGE[it.wl]) o.wl = it.wl;
    if (isNum(it.n) && it.n >= 1) o.n = Math.round(it.n);
    for (const k of ["round", "vert", "fill", "ct"]) if (it[k] === true) o[k] = true;
    if (it.kind === "NH" && it.maker !== "std" && S.NH_MAKERS[it.maker]) o.maker = it.maker; // Hersteller seit 16.10.2026 (fehlt = frei/Standard)
    if (it.kind === "NH" && o.maker === "vertigroup" && S.OLD_VG[o.size]) o.size = S.OLD_VG[o.size]; // „Gr. 1–3“ bis 16.10.2026 = NH1
    if (it.kind === "NH" && !S.nhMaker(o).sizes[o.size]) o.size = S.nhDefault(o.maker);
    if (it.kind === "SSW" && !o.n) o.n = 3;
    if (S.LINE_KINDS.has(it.kind)) { o.lines = S.textLines(it).map(String); delete o.s; } // Zeilen statt „|“ (seit 16.10.2026)
    return withTf(o, it);
  }
  if (it.type === "dim" && [it.x, it.y, it.dx, it.dy, it.off].every(isNum) && (it.dir === "h" || it.dir === "v")) return { id, type: "dim", x: it.x, y: it.y, dx: it.dx, dy: it.dy, dir: it.dir, off: it.off };
  if (it.type === "cable" && Array.isArray(it.pts) && it.pts.length >= 2 && it.pts.every((p) => Array.isArray(p) && p.length === 2 && p.every(isNum))) return withTf({ id, type: "cable", pts: it.pts.map((p) => [p[0], p[1]]), s: String(it.s ?? "") }, it);
  return null;
}
