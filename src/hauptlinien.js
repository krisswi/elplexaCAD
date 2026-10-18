// Hauptlinien (Umbau 16.10.2026): Die Grundverkabelung L1, L2, L3, N läuft als Gruppe über den Blattrand.
// Rechts ein abgehender Verweis auf das nächste Schemablatt, links ein ankommender vom vorherigen. Beides wird hier abgeleitet.
// Am Blatt steht nur die Einstellung main = { l, r, to }:
//   l: "auto" (kommt vom Blatt, das hierher zeigt; sonst Beginn am Blattrand) | "start" (Beginn hier, kein Verweis) | "col:N"
//      | "feed" (Eingangsverdrahtung, eingang.js: jede Linie beginnt über ihrem Leiter vom HAK, L1 bei FEED_X, die nächste 5 mm weiter rechts)
//   r: "next" (weiter aufs nächste Schemablatt) | "sheet" (weiter auf Blatt mit sid = to) | "end" (endet am Blattrand) | "col:N"
// Ziel schon belegt oder Ziel beginnt selbst: die Linie endet (Striche). Blätter ohne Grundverkabelung werden übersprungen.
// PE und weitere Hauptlinien behalten ihre eigenen Enden (w.ends, Verweis über den Namen).
import { SYMBOL_BY_NAME } from "./symbols.js";
import { COL_CENTERS, W, M_IN } from "./frame.js";
import { X0, X1, BASE_TAG } from "./template.js";

export const GROUP = ["L1", "L2", "L3", "N"];
export const EDGE_R = W - M_IN, ARROW = 4, AIR = 2; // Rahmenlinie rechts, Pfeillänge, Luft zwischen Pfeilspitze und Rahmen (CJ 16.10.)
export const REF_L = X0, REF_R = EDGE_R - AIR - ARROW; // ankommend: Pfeil endet am Linienanfang hinter den Namen; abgehend: Linie bis zum Pfeil, Spitze 2 mm vor dem Rahmen
export const STUB = 1.2;
export const FEED_X = 57.5; // Eingangsverdrahtung: L1 senkrecht in Spalte 2 (nach CJs Zeichnung 16.10.) // halbe Länge des Abschlussstrichs in mm

const isSchema = (sh) => !sh.kind;
const railName = (items, w) => items.find((t) => t.type === "text" && t.tag === BASE_TAG && Math.abs(t.y + 1 - w.pts[0][1]) < 1e-6)?.s || "";
// Leitungen der Gruppe, von unten (N) nach oben (L1)
export function groupWires(items) {
  return items.filter((w) => w.type === "wire" && w.tag === BASE_TAG && GROUP.includes(railName(items, w))).sort((a, b) => a.pts[0][1] - b.pts[0][1]);
}
export const isGroupWire = (items, w) => groupWires(items).includes(w);
export const colX = (mode) => COL_CENTERS[Number(mode.slice(4)) - 1];
const okCol = (v) => typeof v === "string" && /^col:[1-8]$/.test(v);
export function cleanMain(o) {
  const m = { l: ["auto", "start", "feed"].includes(o?.l) || okCol(o?.l) ? o.l : "auto", r: ["next", "sheet", "end"].includes(o?.r) || okCol(o?.r) ? o.r : "next" };
  if (m.r === "sheet") { if (Number.isFinite(o?.to)) m.to = o.to; else m.r = "next"; }
  return m;
}

// Alte Datei (bis Version 6): Enden der Gruppenleitungen in main umrechnen, alte Einzelverweise der Gruppe entfernen
function convertOld(doc, sh, ws, all) {
  const ids = new Set(ws.map((w) => w.id)), l1 = ws.at(-1), m = { l: "auto", r: "next" };
  if (okCol(l1.ends?.l)) m.l = l1.ends.l;
  if (okCol(l1.ends?.r)) m.r = l1.ends.r;
  const old = sh.items.filter((i) => ids.has(i.rail));
  const out = old.find((i) => i.rail === l1.id && i.side === "r" && i.link !== undefined);
  const tgt = out && doc.sheets.find((s) => isSchema(s) && s !== sh && s.items.some((i) => i.id === out.link));
  if (tgt && m.r === "next") { if (!tgt.sid) tgt.sid = doc.nextId++; m.r = "sheet"; m.to = tgt.sid; }
  for (const i of old) { const o = all.get(i.link); if (o) delete o.link; }
  sh.items = sh.items.filter((i) => !old.includes(i));
  for (const w of ws) delete w.ends;
  return m;
}

// Gleicht alle Schemablätter ab: Enden der Gruppenleitungen, Verweise links und rechts, Verknüpfungen. Zählt doc.nextId hoch.
export function syncMains(doc) {
  const all = new Map(doc.sheets.flatMap((s) => s.items).map((i) => [i.id, i]));
  const list = [];
  for (const sh of doc.sheets) {
    if (!isSchema(sh)) continue;
    const ws = groupWires(sh.items);
    if (!ws.length) { delete sh.main; sh.items = sh.items.filter((i) => !i.main); continue; }
    sh.main = sh.main ? cleanMain(sh.main) : convertOld(doc, sh, ws, all);
    list.push({ sh, ws });
  }
  // Ziel je Blatt: zuerst die festen Ziele (in Blattfolge, das erste gewinnt), dann „nächstes Blatt“
  const src = new Map(), dst = new Map();
  const take = (a, b) => { if (b && b !== a && b.sh.main.l === "auto" && !src.has(b)) { src.set(b, a); dst.set(a, b); } };
  for (const a of list) if (a.sh.main.r === "sheet") take(a, list.find((b) => b.sh.sid === a.sh.main.to));
  for (const [k, a] of list.entries()) if (a.sh.main.r === "next" || (a.sh.main.r === "sheet" && !list.some((b) => b.sh.sid === a.sh.main.to))) { if ((list[k + 1]?.sh.var || 1) === (a.sh.var || 1)) take(a, list[k + 1]); } // „nächstes Blatt“ nur im selben Modul (18.10.2026)
  for (const a of list) {
    const { sh, ws } = a, m = sh.main, inc = src.has(a), out = dst.has(a);
    const lx0 = inc ? REF_L : okCol(m.l) ? colX(m.l) : X0, rx = out ? REF_R : okCol(m.r) ? colX(m.r) : X1;
    const ends = { l: inc ? "ref" : okCol(m.l) ? m.l : "edge", r: out ? "ref" : okCol(m.r) ? m.r : "end" };
    const lx = (k) => (m.l === "feed" ? FEED_X + (ws.length - 1 - k) * 5 : lx0);
    ws.forEach((w, k) => { w.pts[0][0] = lx(k); w.pts[w.pts.length - 1][0] = rx; w.ends = ends; });
    a.refs = { l: placeRef(doc, sh, "l", inc, ws, lx0), r: placeRef(doc, sh, "r", out, ws, rx) };
  }
  for (const [b, a] of src) { a.refs.r.link = b.refs.l.id; b.refs.l.link = a.refs.r.id; }
  // Gegenstücke, die auf einen weggefallenen Gruppenverweis zeigten, werden wieder offen
  const live = new Map(doc.sheets.flatMap((s) => s.items).map((i) => [i.id, i]));
  for (const i of live.values()) if (i.link !== undefined && live.get(i.link)?.link !== i.id) delete i.link;
}

// Verweis der Gruppe auf einer Seite setzen (1 Symbol, so viele Pole wie Leiter) oder entfernen
function placeRef(doc, sh, side, on, ws, x) {
  const sym = `${side === "l" ? "VINL" : "VOUTR"}_${ws.length}P`;
  let ref = sh.items.find((i) => i.main === side);
  if (!on || (ref && ref.sym !== sym)) { sh.items = sh.items.filter((i) => i !== ref); ref = null; }
  if (!on) return null;
  if (!ref) { ref = { id: doc.nextId++, type: "symbol", sym, x: 0, y: 0, rot: 90, attrs: Object.fromEntries(SYMBOL_BY_NAME[sym].attrs.map((a) => [a.tag, a.def])), main: side }; sh.items.push(ref); }
  Object.assign(ref, { x, y: ws[0].pts[0][1], rot: 0 });
  return ref;
}

// Abschlussstriche: kurzer Querstrich am Ende jeder Hauptlinie, die ohne Verweis endet (Gruppe: auch am Blattrand; sonst bei Spalte)
export function railStubs(items) {
  const out = [];
  for (const w of items) {
    if (w.type !== "wire" || w.tag !== BASE_TAG || !w.ends) continue;
    const y = w.pts[0][1];
    if (okCol(w.ends.l)) out.push({ w, x: w.pts[0][0], y });
    if (okCol(w.ends.r) || w.ends.r === "end") out.push({ w, x: w.pts.at(-1)[0], y });
  }
  return out.map(({ w, x, y }) => ({ w, x1: x, y1: y - STUB, x2: x, y2: y + STUB }));
}

// Schemablätter mit Grundverkabelung in Blattfolge (für die Auswahl des Ziels)
export const mainSheets = (doc) => doc.sheets.filter((sh) => isSchema(sh) && groupWires(sh.items).length);
// Wohin die Gruppe dieses Blatts tatsächlich geht und woher sie kommt (nach syncMains)
export function mainState(doc, sh) {
  const find = (id) => doc.sheets.find((s) => s.items.some((i) => i.id === id));
  const r = sh.items.find((i) => i.main === "r"), l = sh.items.find((i) => i.main === "l");
  return { to: r?.link !== undefined ? find(r.link) : null, from: l?.link !== undefined ? find(l.link) : null };
}
