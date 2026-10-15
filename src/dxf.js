// DXF-Export mit der Bibliothek @tarikjabiri/dxf (MIT). Einheit mm, Blöcke mit Attributen, Layer SCH_*.
import { DxfWriter, Units, point3d, TextHorizontalAlignment, TextVerticalAlignment } from "@tarikjabiri/dxf";
import { SYMBOLS, SYMBOL_BY_NAME, rotatePoint } from "./symbols.js";
import { frameGeometry, titleBlockGeometry, META_FIELDS, META_H, TB_ORIGIN, metaText } from "./frame.js";
import { LAYERS, WIRE_KINDS } from "./model.js";
import { junctions } from "./render.js";
import { termItems, termTexts, termNumbers } from "./terminals.js";
import * as D from "./dispo.js";

const P = (x, y) => point3d(x, y);
const V = (pts) => pts.map(([x, y]) => ({ point: { x, y } }));

// Die Bibliothek schreibt nach jedem ATTRIB ein eigenes SEQEND. Gültig ist nur eines nach dem letzten ATTRIB.
// Diese Funktion entfernt jedes SEQEND, dem direkt ein weiteres ATTRIB folgt.
export function fixSeqend(text) {
  const lines = text.split(/\r?\n/);
  const starts = [];
  for (let k = 0; k + 1 < lines.length; k += 2) if (lines[k].trim() === "0") starts.push(k);
  const keep = new Array(lines.length).fill(true);
  for (let r = 0; r < starts.length - 1; r++) {
    const s = starts[r], n = starts[r + 1];
    if (lines[s + 1].trim() === "SEQEND" && lines[n + 1].trim() === "ATTRIB") for (let k = s; k < n; k++) keep[k] = false;
  }
  return lines.filter((_, k) => keep[k]).join("\n");
}

function addPrims(target, prims, layerName) {
  for (const p of prims) {
    if (p.t === "l") target.addLine(P(p.x1, p.y1), P(p.x2, p.y2), { layerName, ...(p.d ? { lineType: "DASHED" } : {}) });
    else if (p.t === "c") target.addCircle(P(p.cx, p.cy), p.r, { layerName });
    else if (p.t === "t") addCenteredText(target, p.x, p.y, p.h, p.s, layerName);
  }
}

function addCenteredText(target, x, y, h, s, layerName, hAlign = TextHorizontalAlignment.Center) {
  target.addText(P(x, y), h, s, {
    layerName,
    horizontalAlignment: hAlign,
    verticalAlignment: TextVerticalAlignment.Middle,
    secondAlignmentPoint: P(x, y),
  });
}

// Bausteine der Disposition (Rechteck, Linie, Text) in die Zeichnung schreiben. m bildet auf das Blatt ab (siehe dispo.js).
function addPlan(d, prims, m) {
  const X = (x) => Math.round((m.ox + (x - m.bx) * m.k) * 1000) / 1000, Y = (y) => Math.round((m.oy + (y - m.by) * m.k) * 1000) / 1000;
  for (const p of prims) {
    if (p.k === "rect") {
      const x0 = X(p.x), y0 = Y(p.y), x1 = X(p.x + p.w), y1 = Y(p.y + p.h);
      d.addLWPolyline(V([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]), { layerName: p.layer, flags: 1 });
    } else if (p.k === "line") d.addLine(P(X(p.x1), Y(p.y1)), P(X(p.x2), Y(p.y2)), { layerName: p.layer });
    else if (p.k === "text") {
      const h = Math.round(Math.max(p.h * m.k, m.minText) * 1000) / 1000;
      if (p.anchor === "c") addCenteredText(d, X(p.x), Y(p.y), h, p.s, p.layer);
      else if (p.anchor === "lm") addCenteredText(d, X(p.x), Y(p.y), h, p.s, p.layer, TextHorizontalAlignment.Left);
      else if (p.anchor === "rm") addCenteredText(d, X(p.x), Y(p.y), h, p.s, p.layer, TextHorizontalAlignment.Right);
      else d.addText(P(X(p.x), Y(p.y)), h, p.s, { layerName: p.layer });
    }
  }
}

// Eine Disposition als eigene Zeichnung: 1:1 in mm, ohne Rahmen und Schriftfeld
function exportPlanDxf(model) {
  const d = new DxfWriter();
  d.setUnits(Units.Millimeters);
  for (const [name, l] of Object.entries(LAYERS)) if (name.startsWith("SCH_DISPO") || name === "SCH_TEXT") d.addLayer(name, l.color, "CONTINUOUS");
  addPlan(d, D.planPrims(model.items, { dims: model.dims !== false }), D.IDENT);
  return d.stringify();
}

export function exportDxf(model) {
  if (model.kind === "dispo") return exportPlanDxf(model);
  const d = new DxfWriter();
  d.setUnits(Units.Millimeters);
  d.addLType("DASHED", "__ __", [4, -2]);
  for (const [name, l] of Object.entries(LAYERS)) d.addLayer(name, l.color, "CONTINUOUS");

  // Blockdefinitionen für alle Symbole
  const usedLib = new Set(model.items.filter((i) => i.type === "symbol" && SYMBOL_BY_NAME[i.sym]?.custom).map((i) => i.sym));
  for (const sym of SYMBOLS) {
    if (sym.custom && !usedLib.has(sym.name)) continue;
    const b = d.addBlock(sym.name);
    addPrims(b, sym.prims, sym.layer);
    for (const a of sym.attrs) b.addAttdef(P(a.x, a.y), a.h, a.tag, a.def, { layerName: "SCH_TEXT" });
  }

  // Schriftfeld als Block mit Attributen
  const tb = titleBlockGeometry();
  const tbBlock = d.addBlock("SCHRIFTFELD");
  for (const poly of tb.polys) tbBlock.addLWPolyline(V(poly), { layerName: "SCH_SCHRIFTFELD" });
  for (const [x1, y1, x2, y2] of tb.lines) tbBlock.addLine(P(x1, y1), P(x2, y2), { layerName: "SCH_SCHRIFTFELD" });
  for (const f of META_FIELDS) tbBlock.addAttdef(P(f.x, f.y), META_H, f.tag, f.def || " ", { layerName: "SCH_SCHRIFTFELD" });

  // Blattrahmen
  const fr = frameGeometry();
  for (const poly of fr.polys) d.addLWPolyline(V(poly), { layerName: "SCH_RAHMEN" });
  for (const [x1, y1, x2, y2] of fr.lines) d.addLine(P(x1, y1), P(x2, y2), { layerName: "SCH_RAHMEN" });
  for (const l of fr.labels) addCenteredText(d, l.x, l.y, 3, l.s, "SCH_RAHMEN");

  const tbIns = d.addInsert("SCHRIFTFELD", P(TB_ORIGIN.x, TB_ORIGIN.y), { layerName: "SCH_SCHRIFTFELD" });
  tbIns.attributesFollowFlag = 1;
  for (const f of META_FIELDS) {
    d.addAttrib(P(TB_ORIGIN.x + f.x, TB_ORIGIN.y + f.y), META_H, f.tag, model.meta[f.tag] ? metaText(f, model.meta[f.tag]) : " ", tbIns, { layerName: "SCH_SCHRIFTFELD" });
  }

  // Zeichnungsobjekte
  for (const it of model.items) {
    if (it.type === "terminals") {
      for (const c of termItems(it)) d.addInsert(c.sym, P(c.x, c.y), { layerName: "SCH_KLEMMEN" });
      for (const n of termNumbers(it)) addCenteredText(d, n.x, n.y, n.h, n.s, "SCH_KLEMMEN");
      for (const t of termTexts(it)) d.addText(P(t.x, t.y), t.h, t.s, { layerName: "SCH_TEXT" });
    } else if (it.type === "wire") {
      const k = WIRE_KINDS[it.kind] || WIRE_KINDS.leitung;
      d.addLWPolyline(V(it.pts), { layerName: k.layer, ...(k.dashed ? { lineType: "DASHED" } : {}) });
    } else if (it.type === "text") {
      d.addText(P(it.x, it.y), it.h, it.s, { layerName: "SCH_TEXT" });
    } else if (it.type === "dispoview") {
      addPlan(d, D.viewPrims(it), D.viewMap(it));
      d.addText(P(it.x, it.y - 4.5), 2.5, D.viewCaption(it), { layerName: "SCH_TEXT" });
    } else if (it.type === "symbol") {
      const sym = SYMBOL_BY_NAME[it.sym];
      const ins = d.addInsert(it.sym, P(it.x, it.y), { layerName: sym.layer, rotationAngle: it.rot || 0 });
      ins.attributesFollowFlag = 1;
      for (const a of sym.attrs) {
        const o = rotatePoint(a.x, a.y, it.rot || 0);
        d.addAttrib(P(it.x + o.x, it.y + o.y), a.h, a.tag, it.attrs[a.tag] || " ", ins, { layerName: "SCH_TEXT" });
      }
    }
  }
  // Verbindungspunkte als gefüllter Kreis: geschlossene Polylinie aus zwei Halbkreisen mit Breite
  for (const j of junctions(model.items)) {
    d.addLWPolyline([{ point: { x: j.x - 0.4, y: j.y }, bulge: 1 }, { point: { x: j.x + 0.4, y: j.y }, bulge: 1 }], { layerName: "SCH_LEITUNG", flags: 1, constantWidth: 0.8 });
  }
  return fixSeqend(d.stringify());
}
