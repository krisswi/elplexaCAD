// Darstellung als SVG-Text und Trefferprüfung. Koordinaten wie im Modell (mm, y nach oben).
import { SYMBOL_BY_NAME, localBBox, rotatePoint } from "./symbols.js";
import { W, H, frameGeometry, titleBlockGeometry, META_FIELDS, META_H, TB_ORIGIN, metaText } from "./frame.js";
import { LAYERS, WIRE_KINDS } from "./model.js";
import { textBox, textItemBox } from "./geom.js";
import { termItems, termTexts, termNumbers, termBBox, termPins } from "./terminals.js";
import * as D from "./dispo.js";
import { railStubs } from "./hauptlinien.js";
import { PV_TYPES, hitPv, isClosed, modBox, hitMod, strPts, spaBox, pointBox, hitLine } from "./pv.js";
export { textBox };

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const f = (n) => Math.round(n * 1000) / 1000;
const INK = "#17212b";
const SW = 1.4; // Linienstärke in Bildschirm-Pixeln

// ---------- Icons (24er Raster) ----------
const I = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const icons = {
  select: I('<path d="M6 3.5l12 7.2-5.4 1.4-2.6 5.4z"/>'),
  wire: I('<path d="M4 18h7V7h9"/><circle cx="4" cy="18" r="1.4"/><circle cx="20" cy="7" r="1.4"/>'),
  text: I('<path d="M5 7V5h14v2M12 5v14M9 19h6"/>'),
  dim: I('<path d="M4 6v12M20 6v12M4 12h16M7 9.5l-3 2.5 3 2.5M17 9.5l3 2.5-3 2.5"/>'),
  hand: I('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>'),
  undo: I('<path d="M9 14L4 9l5-5M4 9h9a6 6 0 010 12H8"/>'),
  redo: I('<path d="M15 14l5-5-5-5M20 9h-9a6 6 0 000 12h5"/>'),
  new: I('<path d="M7 3h7l4 4v14H7zM14 3v4h4M12 11v6M9 14h6"/>'),
  open: I('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),
  save: I('<path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"/>'),
  export: I('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'),
  search: I('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>'),
  pdf: I('<path d="M7 3h7l4 4v14H7zM14 3v4h4M10 13h5M10 17h5"/>'),
  list: I('<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>'),
  sheets: I('<path d="M8 3h8l4 4v11H8zM16 3v4h4M4 7v14h11"/>'),
  handover: I('<path d="M4 12h11M11 8l4 4-4 4M15 4h5v16h-5"/>'),
  pvmod: I('<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 12h16M9.3 5v14M14.7 5v14"/>'),
  pvwr: I('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 9c1-1.6 2-1.6 3 0s2 1.6 3 0M9 15h6"/>'),
  print: I('<path d="M7 9V3h10v6M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2"/><rect x="7" y="14" width="10" height="7"/>'),
  eye: I('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  frame: I('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M11 15h10M11 15v5M16 15v5"/>'),
  rails: I('<path d="M3 7h14M3 11h14M3 15h14M17 5l4 6-4 6"/>'),
  trash: I('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/>'),
  copy: I('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>'),
  rotate: I('<path d="M20 12a8 8 0 11-2.6-5.9M20 4v5h-5"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  minus: I('<path d="M5 12h14"/>'),
  panelL: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>'),
  panelR: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>'),
};

// ---------- Symbole ----------
function primsSVG(prims, color) {
  let s = "";
  for (const p of prims) {
    if (p.t === "l") s += `<line x1="${f(p.x1)}" y1="${f(p.y1)}" x2="${f(p.x2)}" y2="${f(p.y2)}"${p.d ? ' stroke-dasharray="5 3"' : ""}/>`;
    else if (p.t === "c") s += `<circle cx="${f(p.cx)}" cy="${f(p.cy)}" r="${f(p.r)}"${p.f ? ` fill="${color}"` : ""}/>`;
    else if (p.t === "t") s += `<text transform="translate(${f(p.x)},${f(p.y)})${p.r ? ` rotate(${p.r})` : ""} scale(1,-1)" font-size="${p.h}" text-anchor="${p.al === "l" ? "start" : "middle"}" dominant-baseline="central" fill="${color}" stroke="none">${esc(p.s)}</text>`;
  }
  return s;
}

const strokeAttrs = (color) => `stroke="${color}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;

export function symbolBodySVG(sym) {
  return `<g ${strokeAttrs(LAYERS[sym.layer].css)}>${primsSVG(sym.prims, LAYERS[sym.layer].css)}</g>`;
}

export const localBBoxOf = (sym) => localBBox(sym);
export function thumbSVG(sym) {
  const b = localBBox(sym);
  const pad = 3;
  const w = b.x1 - b.x0 + 2 * pad, h = b.y1 - b.y0 + 2 * pad;
  const side = Math.max(w, h);
  const vx = b.x0 - pad - (side - w) / 2, vy = -(b.y1 + pad) - (side - h) / 2;
  return `<svg viewBox="${f(vx)} ${f(vy)} ${f(side)} ${f(side)}" aria-hidden="true"><g transform="scale(1,-1)">${symbolBodySVG(sym)}</g></svg>`;
}

// ---------- Geometrie für Treffer und Auswahl ----------
const bboxCache = {};
function symBBoxLocal(sym) { return (bboxCache[sym.name] ||= localBBox(sym)); }

export function symbolBBox(it, pad = 1) {
  const b = symBBoxLocal(SYMBOL_BY_NAME[it.sym]);
  const corners = [[b.x0 - pad, b.y0 - pad], [b.x1 + pad, b.y0 - pad], [b.x1 + pad, b.y1 + pad], [b.x0 - pad, b.y1 + pad]].map(([x, y]) => rotatePoint(x, y, it.rot || 0));
  const xs = corners.map((c) => c.x + it.x), ys = corners.map((c) => c.y + it.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export function attrPos(it, a) {
  const o = rotatePoint(a.x, a.y, it.rot || 0);
  return { x: it.x + o.x, y: it.y + o.y };
}

export function attrBoxes(it) {
  const sym = SYMBOL_BY_NAME[it.sym];
  const out = [];
  for (const a of sym.attrs) {
    const v = it.attrs[a.tag];
    if (!v) continue;
    const p = attrPos(it, a);
    out.push(textBox(p.x, p.y, a.h, v));
  }
  return out;
}

export function itemBBox(it) {
  if (it.type === "symbol") return symbolBBox(it, 0);
  if (it.type === "terminals") return termBBox(it);
  if (it.type === "text") return textItemBox(it);
  if (D.isPlanType(it.type)) return D.itemBBox(it);
  if (it.type === "pvmodule") return modBox(it);
  if (it.type === "spa") return spaBox(it);
  if (it.type === "pvpoint") return pointBox(it);
  const pts = it.type === "pvstring" ? strPts(it) : it.pts; // String: Kabellinie durch die Modulmitten
  if (it.type === "pvstring" && pts.length === 1) return { x0: pts[0][0] - 300, y0: pts[0][1] - 300, x1: pts[0][0] + 300, y1: pts[0][1] + 300 }; // String aus einem Modul
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

const inBox = (b, x, y, t) => x >= b.x0 - t && x <= b.x1 + t && y >= b.y0 - t && y <= b.y1 + t;
export const boxesIntersect = (a, b) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function hitItem(it, x, y, tol) {
  if (it.type === "symbol") return inBox(symbolBBox(it, 0.5), x, y, tol) || attrBoxes(it).some((b) => inBox(b, x, y, tol * 0.5));
  if (it.type === "text") return inBox(textItemBox(it), x, y, tol);
  if (it.type === "terminals") return inBox(termBBox(it), x, y, tol);
  if (D.isPlanType(it.type)) return D.hitItem(it, x, y, tol);
  if (PV_TYPES.has(it.type)) return hitPv(it, x, y, tol);
  if (it.type === "pvmodule") return hitMod(it, x, y, tol);
  if (it.type === "spa") return inBox(spaBox(it), x, y, tol);
  if (it.type === "pvpoint") return inBox(pointBox(it), x, y, tol);
  if (it.type === "pvline") return hitLine(it, x, y, tol);
  const pts = it.type === "pvstring" ? strPts(it) : it.pts;
  if (pts.length === 1) return Math.hypot(x - pts[0][0], y - pts[0][1]) <= tol; // String aus einem Modul
  for (let i = 0; i + 1 < pts.length; i++) if (segDist(x, y, ...pts[i], ...pts[i + 1]) <= tol) return true;
  return false;
}

// Nächster Punkt auf einer waagrechten oder senkrechten Leitung (ohne die Enden, die sind Anschlusspunkte).
// Quer zur Leitung liegt der Punkt auf der Leitung, entlang der Leitung auf dem Raster (step).
// prefer: Punkt, dessen x (bei waagrechter) bzw. y (bei senkrechter Leitung) übernommen wird, wenn er nahe liegt (gerader Anschluss).
export function snapToWire(items, wx, wy, tol, step, prefer = null) {
  let best = null, bd = tol;
  for (const it of items) {
    if (it.type !== "wire") continue;
    for (let i = 0; i + 1 < it.pts.length; i++) {
      const [x1, y1] = it.pts[i], [x2, y2] = it.pts[i + 1];
      const vertical = x1 === x2, horizontal = y1 === y2;
      if (!vertical && !horizontal) continue;
      const d = segDist(wx, wy, x1, y1, x2, y2);
      if (d >= bd) continue;
      const lo = vertical ? Math.min(y1, y2) : Math.min(x1, x2), hi = vertical ? Math.max(y1, y2) : Math.max(x1, x2);
      const along = vertical ? wy : wx;
      const pv = prefer && (vertical ? prefer.y : prefer.x);
      const g = prefer && Math.abs(pv - along) <= prefer.tol && pv >= lo && pv <= hi ? pv : Math.min(hi, Math.max(lo, Math.round(along / step) * step));
      best = vertical ? { x: x1, y: f(g) } : { x: f(g), y: y1 };
      bd = d;
    }
  }
  return best;
}

// Liegt der Punkt auf einer Leitung (ausser skip)?
export const onWire = (items, x, y, skip) => items.some((o) => o.type === "wire" && o !== skip && o.pts.some((q, i) => i > 0 && segDist(x, y, ...o.pts[i - 1], ...q) < 1e-6));

// Verbindungspunkte: Ein Leitungsende liegt mitten auf einer anderen Leitung
export function junctions(items) {
  const wires = items.filter((i) => i.type === "wire");
  // Klemmen sitzen oben auf der PE-Linie: ein Leitungsende auf einer Klemme ist mit der Klemme verbunden, nicht mit PE
  const seen = new Set(items.filter((i) => i.type === "terminals").flatMap((t) => termPins(t)).map((q) => q.x + "," + q.y)), out = [];
  for (const w of wires) {
    for (const p of [w.pts[0], w.pts.at(-1)]) {
      for (const o of wires) {
        if (o === w) continue;
        for (let i = 0; i + 1 < o.pts.length; i++) {
          const [x1, y1] = o.pts[i], [x2, y2] = o.pts[i + 1];
          const onSeg = segDist(p[0], p[1], x1, y1, x2, y2) < 1e-6;
          const atEnd = (p[0] === x1 && p[1] === y1) || (p[0] === x2 && p[1] === y2);
          const key = p[0] + "," + p[1];
          if (onSeg && !atEnd && !seen.has(key)) { seen.add(key); out.push({ x: p[0], y: p[1] }); }
        }
      }
    }
  }
  return out;
}

export function allPins(items) {
  const pins = [];
  for (const it of items) {
    if (it.type === "symbol") for (const p of SYMBOL_BY_NAME[it.sym].pins) { const o = rotatePoint(p.x, p.y, it.rot || 0); pins.push({ x: f(it.x + o.x), y: f(it.y + o.y) }); }
    else if (it.type === "terminals") pins.push(...termPins(it));
    else if (it.type === "wire") { pins.push({ x: it.pts[0][0], y: it.pts[0][1] }, { x: it.pts.at(-1)[0], y: it.pts.at(-1)[1] }); }
  }
  return pins;
}

// Mehrpoliges Gerät: alle Pole in der Reihe des angeklickten Pins. Erster Pol = links bzw. unten.
export function poleGroup(items, x, y) {
  for (const it of items) {
    if (it.type !== "symbol") continue;
    const sym = SYMBOL_BY_NAME[it.sym];
    if (sym.hidden || sym.pins.length < 2) continue;
    const pins = sym.pins.map((p) => { const o = rotatePoint(p.x, p.y, it.rot || 0); return { x: f(it.x + o.x), y: f(it.y + o.y), py: p.y }; });
    const hit = pins.find((p) => Math.abs(p.x - x) < 1e-3 && Math.abs(p.y - y) < 1e-3);
    if (!hit) continue;
    // Pole einer Reihe: gleiches y im ungedrehten Symbol (oben oder unten), auch bei gedrehtem Gerät
    const row = pins.filter((p) => Math.abs(p.py - hit.py) < 1e-3);
    if (row.length < 2 || row.length > 5) return null;
    row.sort((a, b) => a.x - b.x || a.y - b.y);
    return { x: row[0].x, y: row[0].y, n: row.length };
  }
  return null;
}

// ---------- Blatt, Objekte, Auswahl ----------
const txt = (x, y, h, s, extra = "") => `<text transform="translate(${f(x)},${f(y)}) scale(1,-1)" font-size="${h}" fill="${INK}" stroke="none" ${extra}>${esc(s)}</text>`;
const ctr = 'text-anchor="middle" dominant-baseline="central"';
const poly = (pts, color, extra = "") => `<polyline points="${pts.map((p) => f(p[0]) + "," + f(p[1])).join(" ")}" ${strokeAttrs(color)} ${extra}/>`;

export function sheetSVG(meta, grid, zoom) {
  let s = `<rect class="paper" x="0" y="0" width="${W}" height="${H}"/>`;
  if (grid.on && grid.size * zoom >= 7) s += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#gridpat)" stroke="none" pointer-events="none"/>`;
  const fr = frameGeometry();
  const ink = LAYERS.SCH_RAHMEN.css;
  for (const p of fr.polys) s += poly(p, ink);
  for (const l of fr.lines) s += poly([[l[0], l[1]], [l[2], l[3]]], ink);
  for (const l of fr.labels) s += txt(l.x, l.y, 3, l.s, ctr);
  return s + titleBlockSVG(meta);
}
// Schriftfeld mit den Angaben des Blatts, Ecke unten links bei (ox, oy). Auch Plankopf von Stringplan und Stringübersicht (PV-Strings Schritt 7).
export function titleBlockSVG(meta, ox = TB_ORIGIN.x, oy = TB_ORIGIN.y) {
  let s = "";
  const ink = LAYERS.SCH_RAHMEN.css, tb = titleBlockGeometry();
  const tx = (p) => [p[0] + ox, p[1] + oy];
  for (const p of tb.polys) s += poly(p.map(tx), ink);
  for (const l of tb.lines) s += poly([tx([l[0], l[1]]), tx([l[2], l[3]])], ink);
  for (const fld of META_FIELDS) if (meta[fld.tag]) s += txt(ox + fld.x, oy + fld.y, META_H, metaText(fld, meta[fld.tag]));
  return s;
}

function symbolSVG(it, opacity = 1) {
  const sym = SYMBOL_BY_NAME[it.sym];
  let s = `<g${opacity < 1 ? ` opacity="${opacity}"` : ""}><g transform="translate(${f(it.x)},${f(it.y)}) rotate(${it.rot || 0})">${symbolBodySVG(sym)}</g>`;
  for (const a of sym.attrs) {
    const v = it.attrs[a.tag];
    if (!v) continue;
    const p = attrPos(it, a);
    s += txt(p.x, p.y, a.h, v);
  }
  return s + "</g>";
}

function terminalsSVG(it) {
  let s = "";
  for (const c of termItems(it)) s += symbolSVG(c);
  for (const n of termNumbers(it)) s += txt(n.x, n.y, n.h, n.s, ctr);
  for (const t of termTexts(it)) s += txt(t.x, t.y, t.h, t.s);
  return s;
}

export const ghostSVG = (it) => `<g opacity="0.55">${it.type === "terminals" ? terminalsSVG(it) : symbolSVG(it)}</g>`;

// Vorschaubild für die Palette: drei Klemmen, die letzte als PE-Klemme
export function terminalsThumb() {
  const it = { type: "terminals", x: 0, y: 0, cable: "", n: 3, pe: "last" };
  const cells = termItems(it).map((c) => `<g transform="translate(${c.x},${c.y})">${symbolBodySVG(SYMBOL_BY_NAME[c.sym])}</g>`).join("");
  return `<svg viewBox="-5 -14 20 20" aria-hidden="true"><g transform="scale(1,-1)">${cells}</g></svg>`;
}

export function itemsSVG(items, kind = "schema", o = {}) {
  if (kind === "dispo") return D.planSVG(items, o); // o wie D.planOpts
  let s = "";
  for (const it of items) {
    if (it.type === "dispoview") { s += D.viewSVG(it); continue; }
    if (it.type === "symbol") s += symbolSVG(it);
    else if (it.type === "wire") {
      const k = WIRE_KINDS[it.kind] || WIRE_KINDS.leitung;
      s += poly(it.pts, LAYERS[k.layer].css, k.dashed ? 'stroke-dasharray="7 4"' : "");
    } else if (it.type === "text") s += it.r ? `<text transform="translate(${f(it.x)},${f(it.y)}) rotate(${it.r}) scale(1,-1)" font-size="${it.h}" fill="${INK}" stroke="none">${esc(it.s)}</text>` : txt(it.x, it.y, it.h, it.s);
    else if (it.type === "terminals") s += terminalsSVG(it);
  }
  for (const t of railStubs(items)) s += poly([[t.x1, t.y1], [t.x2, t.y2]], LAYERS[(WIRE_KINDS[t.w.kind] || WIRE_KINDS.leitung).layer].css, ""); // Abschluss der Hauptlinie
  for (const j of junctions(items)) s += `<circle cx="${f(j.x)}" cy="${f(j.y)}" r="0.9" fill="${INK}" stroke="none"/>`;
  return s;
}

const rect = (b, cls) => `<rect class="${cls}" x="${f(b.x0)}" y="${f(b.y0)}" width="${f(b.x1 - b.x0)}" height="${f(b.y1 - b.y0)}" rx="0.8"/>`;
const pePair = (mk) => mk("sel-a") + mk("sel-b");

// Auswahl: gelb-grün gestreifter Rahmen, wie die Aderfarbe des Schutzleiters
export function selectionSVG(items) {
  let s = "";
  for (const it of items) {
    const pts = it.type === "pvstring" ? strPts(it) : it.pts;
    if (pts?.length > 1) s += pePair((c) => `<polyline class="${c}" points="${[...pts, ...(isClosed(it) ? [pts[0]] : [])].map((p) => f(p[0]) + "," + f(p[1])).join(" ")}"/>`);
    else {
      const b = it.type === "symbol" ? symbolBBox(it, 1) : it.type === "terminals" ? termBBox(it) : D.isPlanType(it.type) ? D.itemBBox(it) : it.type === "pvmodule" ? modBox(it) : it.type === "spa" ? spaBox(it) : it.type === "pvpoint" ? pointBox(it) : pts ? itemBBox(it) : textBox(it.x, it.y, it.h, it.s);
      const g = it.type !== "symbol" ? { x0: b.x0 - 0.8, y0: b.y0 - 0.8, x1: b.x1 + 0.8, y1: b.y1 + 0.8 } : b;
      s += pePair((c) => rect(g, c));
    }
  }
  return s;
}
