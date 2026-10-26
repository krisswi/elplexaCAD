// Modul «Plan» (CJ 23.10.2026, nur elplexaCAD): Elektroplan auf einem Grundriss. Datenmodell und Geometrie ohne DOM, mit node testbar.
// Welt in mm, y nach oben. Ursprung (0|0) = gemeinsamer Nullpunkt aller Plan-Module (später Stockwerke), kein Versatz je Blatt.
// Blatt: { kind: "plan", sid, var?, meta, paper: { size, quer, den }, pmid?: [x, y] (Druckmitte, fehlt = Mitte des Inhalts), layers: [{ id, name, show, lock }], alay, items }.
// Objekte: Wand { id, type: "wall", layer, a: [x, y], b: [x, y], d, mat } (Mittellinie a → b, Dicke d),
// Öffnung { id, type: "opening", wall, t, w, kind, hinge?, side?, br?, h? } (hängt an der Wand, Ebene der Wand; h = Höhe in mm, nur Angabe),
// Mass { id, type: "dim", layer, a, b, off, ref?, ctrl?, soll? } (ref = Wand-id: Mass der Mittellinie, a/b folgen der Wand),
// Symbol { id, type: "sym", layer, key, at: [x, y], r, h?, txt?, ap?, fu?, nr? } (Schritt 2, plansym.js; r Drehung in Grad, h Höhe in cm,
// txt Beschriftung, ap Aufputz, fu/nr Sicherung und Nummer am Hinweispfeil). Symbole hängen nicht an der Wand (wandern nicht mit).
// Leitung { id, type: "line", layer, pts: [[x, y] …] (mind. 2), kind, col?, curve? } (Schritt 3, CJ 24.10.2026; kind = Verlegeart nach 5.110;
// curve: true = geschwungen, glatte Kurve durch alle Punkte, CJ 24.10.2026, Dateiversion 23).
// Hintergrund bg (CJ 24.10.2026, Dateiversion 23): PDF-Seite wie im Stringplan (pv.js: Massstab, Fixpunkt = Nullpunkt, Drehung), liegt auf der Ebene «Hintergrund».
// col (Leitung und Symbol): Farbe nach 5.100, gespeichert nur wenn von der Vorgabe abweichend (Symbol: Kategorie, Leitung: LINE_COL).
import { PAPERS, orthoDir, segX, cleanPmid } from "./pv.js";
import { SYM_BY_KEY, PLAN_SYMS } from "./plansym.js";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r3 = (n) => Math.round(n * 1000) / 1000 + 0;
const isPt = (p) => Array.isArray(p) && p.length === 2 && p.every(isNum);
export const EPS = 0.5; // mm: Endpunkte näher als das gelten als gleich (Ecke, T-Stoss)

// ---------- Papier und Massstab ----------
// Massstab 1:10 bis 1:100 (Normmassstäbe), Vorgabe A3 quer 1:50 (Annahme, ❓ CJ)
export const PLAN_DENS = [10, 20, 25, 50, 75, 100]; // aus STD_DENS; als Liste, damit im v3-Bau nichts von plan.js übrig bleibt
export const PLAN_PAPER = { size: "A3", quer: true, den: 50 };
export const paperOf = (sh) => ({ ...PLAN_PAPER, ...sh.paper });
export function cleanPlanPaper(raw) {
  if (!raw || typeof raw !== "object") return { ...PLAN_PAPER };
  return { size: PAPERS[raw.size] ? raw.size : PLAN_PAPER.size, quer: raw.quer !== false, den: PLAN_DENS.includes(raw.den) ? raw.den : PLAN_PAPER.den };
}

// ---------- Ebenen ----------
// Frei benannt, Reihenfolge = Zeichenfolge (erste zuunterst). Neues Modul: nur «Hintergrund». Bis 10 Ebenen (Annahme zu «mal 10 Ebenen», ❓ CJ).
export const MAX_LAYERS = 10;
const LAYER_ID = /^[a-z0-9]{1,12}$/;
export const defLayers = () => [{ id: "bg", name: "Hintergrund", show: true, lock: false }];
export function cleanPlanLayers(raw) {
  const out = [], ids = new Set();
  for (const l of Array.isArray(raw) ? raw : []) {
    if (!l || !LAYER_ID.test(l.id) || ids.has(l.id) || out.length >= MAX_LAYERS) continue;
    ids.add(l.id);
    out.push({ id: l.id, name: String(l.name ?? "").trim().slice(0, 40) || "Ebene", show: l.show !== false, lock: l.lock === true });
  }
  return out.length ? out : defLayers();
}
export const layerById = (sh, id) => sh.layers.find((l) => l.id === id);
// Ebene eines Objekts: Öffnung = Ebene ihrer Wand
export const itemLayer = (sh, it) => (it.type === "opening" ? sh.items.find((w) => w.id === it.wall)?.layer : it.layer);
export const isVisible = (sh, it) => layerById(sh, itemLayer(sh, it))?.show !== false;
// Gesperrt = nicht wählbar, Fangpunkte bleiben
export const isPickable = (sh, it) => { const l = layerById(sh, itemLayer(sh, it)); return !!l && l.show && !l.lock; };
export function newLayerId(sh) {
  for (let n = 1; ; n++) if (!layerById(sh, "l" + n)) return "l" + n;
}
// Neue Ebene über der aktiven; gibt die Ebene oder null (schon 10)
export function addLayer(sh, name) {
  if (sh.layers.length >= MAX_LAYERS) return null;
  const l = { id: newLayerId(sh), name: String(name ?? "").trim().slice(0, 40) || `Ebene ${sh.layers.length + 1}`, show: true, lock: false };
  const i = sh.layers.findIndex((x) => x.id === sh.alay);
  sh.layers.splice(i < 0 ? sh.layers.length : i + 1, 0, l);
  sh.alay = l.id;
  return l;
}
export const layerUsed = (sh, id) => sh.items.some((it) => it.type !== "opening" && it.layer === id);
// Ebene löschen: die letzte bleibt; Objekte darauf gehen mit (Rückfrage im Editor, wenn nicht leer)
export function deleteLayer(sh, id) {
  if (sh.layers.length <= 1 || !layerById(sh, id)) return false;
  const gone = new Set(sh.items.filter((it) => it.type !== "opening" && it.layer === id).map((it) => it.id));
  sh.items = sh.items.filter((it) => !gone.has(it.id) && !(it.type === "opening" && gone.has(it.wall)));
  sh.layers = sh.layers.filter((l) => l.id !== id);
  if (sh.alay === id) sh.alay = sh.layers[sh.layers.length - 1].id;
  syncDims(sh);
  return true;
}
// Reihenfolge: dir −1 = nach unten (früher gezeichnet), +1 = nach oben
export function moveLayer(sh, id, dir) {
  const i = sh.layers.findIndex((l) => l.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= sh.layers.length) return false;
  [sh.layers[i], sh.layers[j]] = [sh.layers[j], sh.layers[i]];
  return true;
}

// ---------- Objekte ----------
export const WALL_D = 150; // Vorgabe Wanddicke in mm
export const MATS = [["beton", "Beton"], ["mauer", "Mauerwerk"], ["leicht", "Leichtbau/Gips"]]; // beton = Kreuzschraffur, mauer = Schraffur /, leicht = nur Umriss
export const OPENINGS = [["tuer", "Tür"], ["fenster", "Fenster"], ["durchgang", "Durchgang"], ["schiebe", "Schiebetür"]];
export const OPEN_H = new Set(["tuer", "fenster", "schiebe"]); // Arten mit Feld «Höhe» (CJ 23.10.2026)
export const PLAN_ITEMS = new Set(["wall", "opening", "dim", "sym", "line"]);
// Leitungsarten (Symbolzusammenfassung 5.110). Strichmuster in Papier-mm (× Massstab), flex = durchgezogen mit Welle je Abschnitt.
export const LINE_KINDS = [["decke", "in Decke (durchgezogen)"], ["boden", "in Boden (gestrichelt)"], ["wand", "in Wand (Strich-Punkt)"], ["doppel", "in Doppeldecke (Strich-kurz-kurz)"], ["flex", "flexibel (Welle)"]];
export const LINE_DASH = { decke: null, boden: [3, 1.5], wand: [3, 1, 0.8, 1], doppel: [3, 0.8, 0.6, 0.8, 0.6, 0.8], flex: null };
// Farben (Farbcodes 5.100, Hex aus dem PDF gemessen). Mauern, Öffnungen und Masse bleiben schwarz.
export const PLAN_COLS = [["#3fbbeb", "Blau – Licht"], ["#ed3f2a", "Rot – Kraft, Potenzialausgleich"], ["#7aba4b", "Grün – Notlicht, Telefon, IT"], ["#e50981", "Rosa – Zutritt, Alarm"],
  ["#f8a724", "Orange – Brandmelde"], ["#d37c24", "Braun – Schwachstrom, Audio"], ["#8d5995", "Violett – Radio/TV, KNX"], ["#f8f191", "Gelb – Trassen, Kanäle"], ["#000000", "Schwarz"]];
// Vorgabe der Leitungen: blau (CJ 24.10.2026). Später in den Einstellungen änderbar, deshalb nur hier und über lineCol() gelesen.
export const LINE_COL = "#3fbbeb";
// Vorgabe aller Symbole: blau (CJ 24.10.2026, vorher nach Kategorie: Kraft rot usw.); die Farbcodes 5.100 bleiben am Objekt wählbar
export const CAT_COL = { licht: LINE_COL, kraft: LINE_COL, kommunikation: LINE_COL, schwach: LINE_COL, allg: LINE_COL, leitung: LINE_COL };
const HEX = /^#[0-9a-f]{6}$/;
export const lineCol = () => LINE_COL;
// Vorgabe und wirksame Farbe eines Objekts
export const defCol = (it) => (it.type === "line" ? lineCol() : it.type === "sym" ? (SYM_BY_KEY.get(it.key).cat === "leitung" ? lineCol() : CAT_COL[SYM_BY_KEY.get(it.key).cat] ?? "#000000") : "#000000");
export const colOf = (it) => it.col ?? defCol(it);
export const hasCol = (it) => it.type === "line" || it.type === "sym";
// Farbe setzen: gleich der Vorgabe = Feld entfernen
export function setCol(it, col) { if (!hasCol(it)) return; const c = String(col ?? "").toLowerCase(); if (!HEX.test(c) || c === defCol(it)) delete it.col; else it.col = c; }

// Ein Objekt prüfen (ohne Bezüge auf andere Objekte, die prüft cleanPlanSheet). Gibt das saubere Objekt oder null.
export function cleanPlanObj(it, id) {
  if (it.type === "wall") {
    if (!isPt(it.a) || !isPt(it.b) || !isNum(it.d) || it.d <= 0 || Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]) < EPS) return null;
    return { id, type: "wall", layer: String(it.layer ?? ""), a: [it.a[0], it.a[1]], b: [it.b[0], it.b[1]], d: it.d, mat: MATS.some(([k]) => k === it.mat) ? it.mat : "mauer" };
  }
  if (it.type === "opening") {
    if (!isNum(it.wall) || !isNum(it.t) || !isNum(it.w) || it.w <= 0 || !OPENINGS.some(([k]) => k === it.kind)) return null;
    const o = { id, type: "opening", wall: it.wall, t: it.t, w: it.w, kind: it.kind };
    if (it.kind === "tuer") o.hinge = it.hinge === "r" ? "r" : "l"; // Anschlag: l = Band bei t, r = Band bei t + w
    if (it.kind === "tuer" || it.kind === "schiebe") o.side = it.side === -1 ? -1 : 1; // Aufgehrichtung: 1 = links der Wand (von a nach b gesehen), −1 = rechts
    if (it.kind === "fenster" && isNum(it.br) && it.br >= 0) o.br = it.br; // Brüstungshöhe in mm (nur Angabe)
    if (OPEN_H.has(it.kind) && isNum(it.h) && it.h > 0) o.h = it.h; // Höhe in mm (nur Angabe, gespeichert nur wenn gesetzt)
    return o;
  }
  if (it.type === "dim") {
    if (!isPt(it.a) || !isPt(it.b)) return null;
    const o = { id, type: "dim", layer: String(it.layer ?? ""), a: [it.a[0], it.a[1]], b: [it.b[0], it.b[1]], off: isNum(it.off) ? it.off : 0 };
    if (isNum(it.ref)) o.ref = it.ref;
    if (it.ctrl === true) { o.ctrl = true; if (isNum(it.soll) && it.soll > 0) o.soll = it.soll; } // Kontrollmass (Diagonale): Ist, optional Soll
    return o;
  }
  if (it.type === "sym") {
    const def = SYM_BY_KEY.get(it.key);
    if (!def || !isPt(it.at)) return null;
    const o = { id, type: "sym", layer: String(it.layer ?? ""), key: it.key, at: [it.at[0], it.at[1]], r: isNum(it.r) ? ((Math.round(it.r) % 360) + 360) % 360 : 0 };
    if (isNum(it.h) && it.h >= 0) o.h = it.h;
    const str = (v, n) => String(v ?? "").trim().slice(0, n);
    if (str(it.txt, 60)) o.txt = str(it.txt, 60);
    if (def.ap && it.ap === true) o.ap = true;
    if (def.ref) { if (str(it.fu, 12)) o.fu = str(it.fu, 12); if (str(it.nr, 12)) o.nr = str(it.nr, 12); }
    setCol(o, it.col);
    return o;
  }
  if (it.type === "line") {
    const pts = (Array.isArray(it.pts) ? it.pts : []).filter(isPt).map((p) => [p[0], p[1]]).filter((p, i, a) => !i || !same(p, a[i - 1]));
    if (pts.length < 2) return null;
    const o = { id, type: "line", layer: String(it.layer ?? ""), pts, kind: LINE_KINDS.some(([k]) => k === it.kind) ? it.kind : "decke" };
    setCol(o, it.col);
    if (it.curve === true) o.curve = true;
    return o;
  }
  return null;
}

// Blattfelder und Objekte aus der Datei. Bereinigung: Objekte auf unbekannter Ebene → aktive Ebene, Öffnung ohne Wand fällt weg,
// Öffnung in die Wand geklemmt, Mass mit fehlender Wand verliert den Bezug. Gibt die höchste id zurück.
export const BG_OP = 60; // Deckkraft des PDF-Plans in %: blass, damit der Elektroplan hervortritt (wie Stringplan)
export function cleanPlanSheet(rs, m, maxId) {
  m.paper = cleanPlanPaper(rs.paper);
  m.layers = cleanPlanLayers(rs.layers);
  m.alay = layerById(m, rs.alay) ? rs.alay : m.layers[0].id;
  const pm = cleanPmid(rs.pmid); if (pm) m.pmid = pm; // Druckmitte frei gewählt (wie Stringplan 5ao)
  if (rs.bom === false) m.bom = false; // Stückliste nicht drucken (Schritt 4, fehlt = drucken)
  if (rs.bgOff === true) m.bgOff = true; // PDF-Plan ausgeblendet, unabhängig von den Ebenen (CJ 26.10.2026)
  if (isNum(rs.bgOp) && rs.bgOp >= 10 && rs.bgOp <= 100 && Math.round(rs.bgOp) !== BG_OP) m.bgOp = Math.round(rs.bgOp); // Deckkraft in %, fehlt = BG_OP
  if (isNum(rs.sid) && rs.sid > 0) { m.sid = rs.sid; maxId = Math.max(maxId, rs.sid); }
  for (const it of Array.isArray(rs.items) ? rs.items : []) {
    const id = isNum(it?.id) ? it.id : ++maxId;
    maxId = Math.max(maxId, id);
    const o = it && PLAN_ITEMS.has(it.type) ? cleanPlanObj(it, id) : null;
    if (!o) throw new Error("Ein Plan enthält ein unbekanntes oder defektes Objekt (id " + id + ").");
    if (o.type !== "opening" && !layerById(m, o.layer)) o.layer = m.alay;
    m.items.push(o);
  }
  const walls = new Map(m.items.filter((i) => i.type === "wall").map((w) => [w.id, w]));
  m.items = m.items.filter((i) => i.type !== "opening" || walls.has(i.wall));
  for (const o of m.items) if (o.type === "opening") clampOpening(walls.get(o.wall), o);
  for (const d of m.items) if (d.type === "dim" && d.ref !== undefined && !walls.has(d.ref)) delete d.ref;
  syncDims(m);
  return maxId;
}
export function newPlanSheet(sh) {
  sh.paper = { ...PLAN_PAPER };
  sh.layers = defLayers();
  sh.alay = "bg";
  return sh;
}

// ---------- Geometrie ----------
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]], add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1], len = (v) => Math.hypot(v[0], v[1]);
const same = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < EPS;
export const wallLen = (w) => len(sub(w.b, w.a));
export const wallDir = (w) => { const v = sub(w.b, w.a), l = len(v); return [v[0] / l, v[1] / l]; };
const normal = (u) => [-u[1], u[0]]; // links von u
// Schnitt zweier Geraden p + s·u, q + t·v; null bei (fast) parallel
function lineX(p, u, q, v) {
  const den = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(den) < 1e-9) return null;
  const s = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / den;
  return add(p, u, s);
}
export function clampOpening(w, o) {
  const L = wallLen(w);
  if (o.w > L) o.w = L;
  o.t = Math.max(0, Math.min(L - o.w, o.t));
}
// Kante einer Öffnung ziehen (Griff): edge "t0" = Kante bei t, "t1" = Kante bei t + w; s = Lage auf der Wand ab a. Die andere Kante bleibt,
// die Breite wird auf step mm gerundet (Raster 10 mm, Alt: 1), mindestens MIN_OPEN, und bleibt in der Wand.
export const MIN_OPEN = 100; // mm (CJ 23.10.2026)
export function setOpeningEdge(w, o, edge, s, step = 10) {
  const L = wallLen(w), g = step > 0 ? step : 1, s1 = o.t + o.w;
  const fit = (x, max) => Math.max(Math.min(MIN_OPEN, max), Math.min(max, Math.round(x / g) * g));
  if (edge === "t0") { const nw = fit(s1 - s, s1); o.t = r3(s1 - nw); o.w = nw; }
  else { const nw = fit(s - o.t, L - o.t); o.w = nw; }
}

// Ende e ("a" | "b") einer Wand: Linker und rechter Eckpunkt (links/rechts von a → b gesehen), ob die Stirnseite gezeichnet wird,
// und Fugen auf anderen Wänden (T-Stoss). Ecke: alle Wände mit einem Endpunkt hier, nach Winkel sortiert; jede Seitenfläche wird mit der
// Nachbarfläche geschnitten (Gehrung, auch bei verschiedenen Dicken und mehr als zwei Wänden). T-Stoss: Ende liegt auf der Mittellinie einer
// anderen Wand (nicht an deren Ende): Seitenflächen bis an deren Fläche verlängert, dort keine Fuge, die andere Wand wird nicht verändert.
function wallEnd(walls, w, e) {
  const p = w[e], u = wallDir(w), out = e === "a" ? u : [-u[0], -u[1]], h = w.d / 2; // out = von der Ecke in die Wand
  const nl = normal(u), L = add(p, nl, h), R = add(p, nl, -h);
  const res = { L, R, cap: true, gaps: [] };
  const rays = [];
  for (const v of walls) {
    if (v.id === w.id) continue;
    for (const f of ["a", "b"]) if (same(v[f], p)) { const vu = wallDir(v); rays.push({ v, out: f === "a" ? vu : [-vu[0], -vu[1]] }); }
  }
  if (rays.length) {
    const ang = (d) => Math.atan2(d[1], d[0]), a0 = ang(out);
    const rel = (d) => { let r = ang(d) - a0; while (r <= 1e-9) r += 2 * Math.PI; return r; };
    rays.sort((x, y) => rel(x.out) - rel(y.out));
    const ccw = rays[0], cw = rays[rays.length - 1];
    // Seite links der Richtung «out» liegt zur nächsten Wand gegen den Uhrzeigersinn
    const side = (r, k) => add(p, normal(r.out), k * r.v.d / 2); // k = 1 links von r.out, −1 rechts
    const lo = normal(out), mine = (k) => add(p, lo, k * h);
    const cutL = Math.abs(rel(ccw.out) - Math.PI) > 1e-6 ? lineX(mine(1), out, side(ccw, -1), ccw.out) : null;
    const cutR = Math.abs(rel(cw.out) - Math.PI) > 1e-6 ? lineX(mine(-1), out, side(cw, 1), cw.out) : null;
    const far = (q) => !q || len(sub(q, p)) > 10 * Math.max(w.d, ...rays.map((r) => r.v.d)); // sehr spitzer Winkel: stumpf
    // «links von out» ist bei Ende a links von a → b, bei Ende b rechts davon
    const [qL, qR] = e === "a" ? [cutL, cutR] : [cutR, cutL];
    if (!far(qL)) res.L = qL;
    if (!far(qR)) res.R = qR;
    res.cap = false;
    return res;
  }
  for (const t of walls) {
    if (t.id === w.id) continue;
    const tu = wallDir(t), s = dot(sub(p, t.a), tu), tl = wallLen(t), tn = normal(tu);
    if (s <= EPS || s >= tl - EPS || Math.abs(dot(sub(p, t.a), tn)) >= EPS || Math.abs(dot(out, tn)) < 1e-6) continue;
    const k = Math.sign(dot(out, tn)), fp = add(t.a, tn, k * t.d / 2); // Fläche der durchgehenden Wand auf der Seite dieser Wand
    const qL = lineX(L, u, fp, tu), qR = lineX(R, u, fp, tu);
    res.L = qL; res.R = qR; res.cap = false;
    const ps = [dot(sub(qL, t.a), tu), dot(sub(qR, t.a), tu)].sort((x, y) => x - y);
    res.gaps.push({ wall: t.id, side: k, from: ps[0], to: ps[1] });
    return res;
  }
  return res;
}

// Abzug von Intervallen [from, to] aus [lo, hi]
function minus(lo, hi, gaps) {
  let segs = [[lo, hi]];
  for (const [g0, g1] of gaps) segs = segs.flatMap(([s0, s1]) => (g1 <= s0 || g0 >= s1 ? [[s0, s1]] : [[s0, g0], [g1, s1]].filter(([x, y]) => y - x > 1e-6)));
  return segs;
}
// Vieleck auf das Band lo ≤ (p − a)·u ≤ hi beschneiden (Sutherland–Hodgman)
function clipBand(poly, a, u, lo, hi) {
  const cut = (pts, f) => {
    const out = [];
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length], fp = f(p), fq = f(q);
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) out.push(add(p, sub(q, p), fp / (fp - fq)));
    });
    return out;
  };
  const s = (p) => dot(sub(p, a), u);
  return cut(cut(poly, (p) => s(p) - lo), (p) => hi - s(p));
}

// Umriss aller Wände eines Blatts (nur Wände der Liste walls, z. B. sichtbare). Je Wand:
// { id, poly: [4 Punkte], fills: [Vielecke ohne Öffnungen], lines: [[p, q] …] zu zeichnende Kanten (Seitenflächen ohne Fugen und Öffnungen,
// freie Stirnseiten, Leibungen der Öffnungen) }. Ecken sind auf Gehrung verschmolzen, am T-Stoss fehlt die Fuge.
export function wallShapes(walls, openings = []) {
  const ends = new Map(walls.map((w) => [w.id, { a: wallEnd(walls, w, "a"), b: wallEnd(walls, w, "b") }]));
  const gaps = new Map(walls.map((w) => [w.id, { 1: [], [-1]: [] }]));
  for (const { a, b } of ends.values()) for (const g of [...a.gaps, ...b.gaps]) gaps.get(g.wall)?.[g.side].push([g.from, g.to]);
  return walls.map((w) => {
    const { a, b } = ends.get(w.id), u = wallDir(w), h = w.d / 2, nl = normal(u), lin = [];
    const ops = openings.filter((o) => o.wall === w.id).map((o) => [o.t, o.t + o.w]);
    const face = (k, p, q) => { // Seitenfläche k (1 links, −1 rechts) von p nach q
      const base = add(w.a, nl, k * h), sp = dot(sub(p, w.a), u), sq = dot(sub(q, w.a), u);
      for (const [s0, s1] of minus(Math.min(sp, sq), Math.max(sp, sq), [...gaps.get(w.id)[k], ...ops])) lin.push([add(base, u, s0), add(base, u, s1)]);
    };
    face(1, a.L, b.L);
    face(-1, a.R, b.R);
    if (a.cap) lin.push([a.R, a.L]);
    if (b.cap) lin.push([b.L, b.R]);
    for (const [s0, s1] of ops) for (const s of [s0, s1]) lin.push([add(add(w.a, u, s), nl, -h), add(add(w.a, u, s), nl, h)]);
    const poly = [a.R, b.R, b.L, a.L];
    const cuts = [-Infinity, ...ops.flat().sort((x, y) => x - y), Infinity], fills = [];
    for (let i = 0; i < cuts.length; i += 2) { const f = clipBand(poly, w.a, u, cuts[i], cuts[i + 1]); if (f.length >= 3) fills.push(f); }
    return { id: w.id, poly, fills, lines: lin.map(([p, q]) => [p.map(r3), q.map(r3)]) };
  });
}

// ---------- Ändern ----------
// Punkt verschieben: alle Wand- und Massenden an from gehen nach to (Ecke ziehen = beide Wände folgen; Wände mit T-Stoss bleiben).
// Öffnungen behalten den Abstand ab Ende a und werden in die Wand geklemmt. Gibt die Zahl der bewegten Enden zurück.
export function moveNode(sh, from, to, skip) {
  let n = 0;
  for (const it of sh.items) {
    if ((it.type !== "wall" && it.type !== "dim") || it.id === skip) continue;
    for (const e of ["a", "b"]) if (same(it[e], from)) { it[e] = [r3(to[0]), r3(to[1])]; n++; }
  }
  fixOpenings(sh);
  syncDims(sh);
  return n;
}
// Wand oder Mass als Ganzes verschieben (Ecken bleiben mit den Nachbarn verbunden: deren Enden folgen)
export function moveItem(sh, it, dx, dy) {
  if (it.type === "sym") { it.at = [r3(it.at[0] + dx), r3(it.at[1] + dy)]; return; }
  if (it.type === "line") { it.pts = it.pts.map((p) => [r3(p[0] + dx), r3(p[1] + dy)]); return; }
  if (it.type === "opening") { const w = sh.items.find((x) => x.id === it.wall), u = wallDir(w); it.t += dx * u[0] + dy * u[1]; clampOpening(w, it); return; }
  const a = it.a, b = it.b, na = [a[0] + dx, a[1] + dy], nb = [b[0] + dx, b[1] + dy];
  if (it.type === "wall") { moveNode(sh, a, na, it.id); moveNode(sh, b, nb, it.id); }
  it.a = na.map(r3); it.b = nb.map(r3);
  fixOpenings(sh);
  syncDims(sh);
}
// Mehrere Objekte gemeinsam verschieben (Mehrfachwahl, Schritt 3): jede Ecke nur einmal; Nachbarwände ausserhalb der Wahl folgen an der Ecke
// (wie beim Verschieben einer Wand). Öffnungen gehen mit ihrer Wand, allein gewählt gleiten sie entlang der Wand. Masse mit Bezug folgen der Wand.
export function moveItems(sh, items, dx, dy) {
  const ids = new Set(items.map((i) => i.id)), nodes = [];
  for (const it of items) if (it.type === "wall" || (it.type === "dim" && it.ref === undefined)) for (const e of ["a", "b"]) if (!nodes.some((p) => same(p, it[e]))) nodes.push([...it[e]]);
  const ends = nodes.map((p) => nodeEnds(sh, p)); // erst alle Enden sammeln, dann setzen (sonst fallen verschobene Ecken auf andere)
  ends.forEach((es, i) => { for (const { it, e } of es) it[e] = [r3(nodes[i][0] + dx), r3(nodes[i][1] + dy)]; });
  for (const it of items) {
    if (it.type === "sym" || it.type === "line") moveItem(sh, it, dx, dy);
    else if (it.type === "opening" && !ids.has(it.wall)) moveItem(sh, it, dx, dy);
  }
  fixOpenings(sh);
  syncDims(sh);
}
// Kopie für die Zwischenablage: Objekte samt Öffnungen ihrer Wände; Öffnungen ohne kopierte Wand fallen weg, Masse verlieren fremde Bezüge
export function copyItems(sh, items) {
  const ids = new Set(items.filter((i) => i.type !== "opening").map((i) => i.id));
  const out = sh.items.filter((i) => (i.type === "opening" ? ids.has(i.wall) : ids.has(i.id)));
  return JSON.parse(JSON.stringify(out)).map((i) => { if (i.type === "dim" && i.ref !== undefined && !ids.has(i.ref)) delete i.ref; return i; });
}
// Einfügen: neue ids (newId()), um dx/dy versetzt, unbekannte Ebene → aktive Ebene. Gibt die neuen Objekte (schon im Blatt).
export function pasteItems(sh, clip, dx, dy, newId) {
  const map = new Map(clip.map((i) => [i.id, newId()])), out = [];
  for (const c0 of clip) {
    const c = JSON.parse(JSON.stringify(c0)); c.id = map.get(c0.id);
    if (c.type === "opening") c.wall = map.get(c0.wall);
    else if (!layerById(sh, c.layer)) c.layer = sh.alay;
    if (c.type === "dim" && c.ref !== undefined) c.ref = map.get(c.ref);
    for (const k of ["a", "b", "at"]) if (c[k]) c[k] = [r3(c[k][0] + dx), r3(c[k][1] + dy)];
    if (c.pts) c.pts = c.pts.map((p) => [r3(p[0] + dx), r3(p[1] + dy)]);
    const o = cleanPlanObj(c, c.id);
    if (o) out.push(o);
  }
  sh.items.push(...out);
  syncDims(sh);
  return out;
}
// Rahmenwahl: Objekte ganz im Rechteck (Symbol: Mitte, Öffnung: Mitte auf der Wand)
export function inBox(sh, it, b) {
  const ins = (p) => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1;
  if (it.type === "wall" || it.type === "dim") return ins(it.a) && ins(it.b);
  if (it.type === "line") return it.pts.every(ins);
  if (it.type === "sym") return ins(symCenter(it, paperOf(sh).den));
  if (it.type === "opening") { const w = sh.items.find((x) => x.id === it.wall); return !!w && ins(add(w.a, wallDir(w), it.t + it.w / 2)); }
  return false;
}
function fixOpenings(sh) {
  const walls = new Map(sh.items.filter((i) => i.type === "wall").map((w) => [w.id, w]));
  for (const o of sh.items) if (o.type === "opening" && walls.has(o.wall)) clampOpening(walls.get(o.wall), o);
}
// Masse mit Bezug auf eine Wand folgen deren Mittellinie
export function syncDims(sh) {
  const walls = new Map(sh.items.filter((i) => i.type === "wall").map((w) => [w.id, w]));
  for (const d of sh.items) if (d.type === "dim" && d.ref !== undefined && walls.has(d.ref)) { const w = walls.get(d.ref); d.a = [...w.a]; d.b = [...w.b]; }
}
// Objekt löschen; mit einer Wand gehen ihre Öffnungen, Masse mit Bezug darauf werden frei
export function deleteItem(sh, id) {
  sh.items = sh.items.filter((i) => i.id !== id && !(i.type === "opening" && i.wall === id));
  for (const d of sh.items) if (d.type === "dim" && d.ref === id) delete d.ref;
}
export const dimLen = (d) => len(sub(d.b, d.a));
// Mass eintippen treibt die Geometrie (kein Gleichungslöser): Ende b wandert auf der Geraden a → b, alles an b folgt (moveNode).
// Mass mit Bezug: Ende b der Wand. Kontrollmass: setzt nur das Soll. Gibt false bei ungültiger Länge.
export function setDimLength(sh, d, L) {
  if (!isNum(L) || L <= 0) return false;
  if (d.ctrl) { d.soll = L; return true; }
  const w = d.ref !== undefined ? sh.items.find((i) => i.id === d.ref) : null, p = w || d, u = sub(p.b, p.a), l = len(u);
  if (l < 1e-9) return false;
  const nb = add(p.a, u, L / l), old = [...p.b];
  if (!w) d.b = nb.map(r3); // freies Mass: eigenes Ende zuerst, damit moveNode es nicht doppelt nimmt
  moveNode(sh, old, nb);
  if (w) w.b = nb.map(r3);
  syncDims(sh);
  return true;
}
// Kontrollmass: Ist, Soll und Abweichung (Ist − Soll) in mm
export const ctrlInfo = (d) => ({ ist: dimLen(d), soll: d.soll, diff: d.soll ? dimLen(d) - d.soll : undefined });

// ---------- Eingabe ----------
// Länge aus dem Tippfeld in mm: «3450», «3450 mm», «345 cm», «3,45 m», «3.45m». Ohne Einheit mm. Gibt NaN bei Unsinn.
export function parseLen(s) {
  const m = String(s ?? "").trim().replace(",", ".").match(/^(\d+(?:\.\d*)?|\.\d+)\s*(mm|cm|m)?$/i);
  if (!m) return NaN;
  const v = Number(m[1]) * { mm: 1, cm: 10, m: 1000 }[(m[2] || "mm").toLowerCase()];
  return v > 0 ? r3(v) : NaN;
}
export const fmtLen = (mm) => String(Math.round(mm)).replace("-", "−");
// Wandende aus Start, Richtung (Grad, 0 = rechts, gegen den Uhrzeigersinn) und Länge
export const polar = (a, deg, L) => [r3(a[0] + L * Math.cos((deg * Math.PI) / 180)), r3(a[1] + L * Math.sin((deg * Math.PI) / 180))];
// Shift beim Zeichnen: 0/45/90° (aus pv.js, gleich wie im Stringplan)
export function orthoPt(a, p) { const u = orthoDir(p[0] - a[0], p[1] - a[1]), t = (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1]; return [r3(a[0] + t * u[0]), r3(a[1] + t * u[1])]; }

// ---------- Editor-Hilfen (ohne DOM) ----------
// Enden an einem Punkt: [{ it, e }] für Wände und freie Masse (Ecke ziehen setzt sie gemeinsam, ohne andere Enden einzusammeln)
export const nodeEnds = (sh, p) => sh.items.flatMap((it) => ((it.type === "wall" || (it.type === "dim" && it.ref === undefined)) ? ["a", "b"].filter((e) => same(it[e], p)).map((e) => ({ it, e })) : []));
export function setEnds(sh, ends, p) {
  for (const { it, e } of ends) it[e] = [r3(p[0]), r3(p[1])];
  fixOpenings(sh);
  syncDims(sh);
}
// Wandlänge eintippen: Ende b wandert, Ecken an b folgen (wie ein Mass mit Bezug)
export function setWallLength(sh, w, L) { return setDimLength(sh, { ref: w.id, a: w.a, b: w.b }, L); }
// Wand zeichnen (CJ 24.10.2026): gezeichnet wird die Innenkante (Innenlinie p → q), die Wand liegt auf der Seite side (1 = links der
// Zeichenrichtung, −1 = rechts, Vorgabe links: Raum im Uhrzeigersinn zeichnen). Gespeichert wird weiter die Mittellinie, um d/2 versetzt.
// Eingetippte Länge = Länge der Innenlinie = lichte Länge zwischen den Innenecken.
export function innerWall(p, q, d, side = 1) {
  const u = wallDir({ a: p, b: q }), n = normal(u), k = (side < 0 ? -1 : 1) * d / 2;
  return { a: add(p, n, k).map(r3), b: add(q, n, k).map(r3) };
}
// Ecke zweier aufeinanderfolgender Wände (w1.b und w2.a lagen auf demselben Punkt der Innenlinie): beide Enden in den Schnitt der Mittellinien.
// Parallel oder sehr spitzer Winkel: unverändert. Gibt true, wenn verschoben.
export function mitre(w1, w2) {
  const x = lineX(w1.a, wallDir(w1), w2.a, wallDir(w2));
  if (!x || len(sub(x, w1.b)) > 10 * Math.max(w1.d, w2.d)) return false;
  w1.b = x.map(r3); w2.a = x.map(r3);
  return true;
}
// Ecken der Wandflächen (Gehrung berücksichtigt) und die Flächenlinien aller Wände: Fang beim Zeichnen der Innenlinie
export function faceGeom(walls) {
  const polys = wallShapes(walls).map((x) => x.poly);
  return { corners: polys.flat(), edges: polys.flatMap((p) => p.map((q, i) => [q, p[(i + 1) % p.length]])) };
}

// Treffer: Öffnung vor Mass vor Wand. tol in mm. items = wählbare Objekte.
const distSeg = (p, a, b) => { const v = sub(b, a), l2 = dot(v, v), t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), v) / l2)) : 0; return len(sub(p, add(a, v, t))); };
export function dimLine(d) { // Masslinie: a, b um off nach links (von a nach b) versetzt
  const v = sub(d.b, d.a), l = len(v) || 1, n = normal([v[0] / l, v[1] / l]);
  return [add(d.a, n, d.off), add(d.b, n, d.off), n];
}
export function hitPlan(sh, items, p, tol) {
  const walls = new Map(sh.items.filter((i) => i.type === "wall").map((w) => [w.id, w])), k = paperOf(sh).den;
  for (const it of [...items].reverse()) if (it.type === "sym") { const def = SYM_BY_KEY.get(it.key); if (len(sub(p, symCenter(it, k))) <= def.r * k + tol) return it; } // zuletzt gesetzt zuerst
  for (const it of [...items].reverse()) if (it.type === "line") { const q = linePts(it); if (q.some((x, i) => i && distSeg(p, q[i - 1], x) <= tol)) return it; }
  for (const o of items) {
    if (o.type !== "opening") continue;
    const w = walls.get(o.wall), u = wallDir(w), s = dot(sub(p, w.a), u), q = Math.abs(dot(sub(p, w.a), normal(u)));
    if (s >= o.t - tol && s <= o.t + o.w + tol && q <= w.d / 2 + tol) return o;
  }
  for (const d of items) if (d.type === "dim") { const [a, b] = dimLine(d); if (distSeg(p, a, b) <= tol) return d; }
  let best = null, bd = Infinity;
  for (const w of items) if (w.type === "wall") { const dd = distSeg(p, w.a, w.b); if (dd <= w.d / 2 + tol && dd < bd) { bd = dd; best = w; } }
  return best;
}
// Ausrichtungsfang (CJ 24.10.2026): Linien durch die Bezugspunkte refs in den Richtungen dirs (Einheitsvektoren). Liegt m innerhalb tol an einer Linie,
// rastet es darauf ein, bei zwei nicht parallelen Linien im Schnittpunkt (Rechteck schliessen: Anfang und letzter Punkt). Gibt { x, y, guides } oder null.
export function alignSnap(m, refs, dirs, tol) {
  const hits = [];
  for (const r of refs) for (const u of dirs) { const v = sub(m, r), d = Math.abs(v[0] * u[1] - v[1] * u[0]); if (d <= tol) hits.push({ r, u, d }); }
  hits.sort((x, y) => x.d - y.d);
  const h1 = hits[0];
  if (!h1) return null;
  const h2 = hits.find((h) => Math.abs(h.u[0] * h1.u[1] - h.u[1] * h1.u[0]) > 0.2);
  const p = (h2 && lineX(h1.r, h1.u, h2.r, h2.u)) || add(h1.r, h1.u, dot(sub(m, h1.r), h1.u));
  return { x: r3(p[0]), y: r3(p[1]), guides: [h1, h2].filter(Boolean).map((h) => [h.r, [r3(p[0]), r3(p[1])]]) };
}
// Fang: Wand- und Massenden (auch gesperrte Ebenen), Mitte der Wand, Punkt auf der Mittellinie, Raster ab Nullpunkt. ortho = Bezugspunkt für
// Shift (0/45/90°). Rückgabe { x, y, snap, guides? }. faces = faceGeom() (Wand zeichnen, Mass): statt der Mittellinie fangen Ecken und Linien der Wandflächen
// (nur Wandenden der Liste ends: false). align = { refs, dirs }: Ausrichtungsfang vor Fläche und Raster.
export function snapPlan(sh, items, p, { grid = 0, tol = 0, alt = false, ortho, extra = [], faces, align } = {}) {
  const on = (q) => (ortho ? orthoPt(ortho, q) : q.map(r3));
  const m = on(p);
  if (alt) return { x: m[0], y: m[1] };
  const walls = items.filter((i) => i.type === "wall");
  const best = (cands, kind) => { let hit = null, bd = tol; for (const c of cands) { const d = len(sub(c, m)); if (d <= bd) { bd = d; const q = on(c); hit = { x: q[0], y: q[1], snap: kind }; } } return hit; };
  const onFace = () => { let hit = null, bd = tol; for (const [a, b] of faces.edges) { const v = sub(b, a), l2 = dot(v, v), t = l2 ? Math.max(0, Math.min(1, dot(sub(m, a), v) / l2)) : 0, c = add(a, v, t), d = len(sub(c, m)); if (d <= bd) { bd = d; hit = { x: r3(c[0]), y: r3(c[1]), snap: "edge" }; } } return hit; };
  const al = !ortho && align ? alignSnap(m, align.refs, align.dirs, tol) : null;
  return best([...(faces ? faces.corners : walls.flatMap((w) => [w.a, w.b])), ...items.filter((i) => i.type === "dim").flatMap((d) => [d.a, d.b]), ...extra], "end")
    || (al && { x: al.x, y: al.y, snap: "align", guides: al.guides })
    || (faces ? onFace() : best(walls.map((w) => [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]), "mid"))
    || (!faces && !ortho && best(walls.map((w) => { const u = wallDir(w), t = Math.max(0, Math.min(wallLen(w), dot(sub(m, w.a), u))); return add(w.a, u, t); }), "edge"))
    || (grid > 0 ? (([x, y]) => ({ x, y, snap: "grid" }))(on([Math.round(p[0] / grid) * grid, Math.round(p[1] / grid) * grid])) : { x: m[0], y: m[1] });
}
// Symbol: Mitte in der Welt (Papier-mm × Massstab k, gedreht um r)
export function symCenter(it, k) {
  const c = SYM_BY_KEY.get(it.key).c, a = (it.r * Math.PI) / 180;
  return [it.at[0] + k * (c[0] * Math.cos(a) - c[1] * Math.sin(a)), it.at[1] + k * (c[0] * Math.sin(a) + c[1] * Math.cos(a))];
}
// Text lesbar halten: Winkel 0–359 → (-90, 90], flip = um 180° gekippt (sonst stünde er auf dem Kopf)
export function readable(ang) { const a = ((ang % 360) + 360) % 360, flip = a > 90 && a <= 270; return { a: flip ? a - 180 : a > 270 ? a - 360 : a, flip }; }
// Texte eines Symbols in der Welt (CJ 24.10.2026): drehen mit dem Symbol, stehen nie auf dem Kopf. Zusatztexte (T15, USB, 3, LED) und Verweis
// mittig an ihrem Ort; Beschriftung und Höhe neben der Mitte in Richtung der x-Achse des Symbols (Wandsymbol: entlang der Wand), Zeilen untereinander.
// Gibt [{ at, s, size, a, anchor }] (size und Abstände in Papier-mm × k).
export function symTexts(it, k, fmtH = (h) => String(h)) {
  const def = SYM_BY_KEY.get(it.key), rad = (it.r * Math.PI) / 180, co = Math.cos(rad), si = Math.sin(rad), { a, flip } = readable(it.r);
  const w = (x, y) => [it.at[0] + k * (x * co - y * si), it.at[1] + k * (x * si + y * co)], out = [];
  for (const q of def.parts) if (q[0] === "t") out.push({ at: w(q[1], q[2]), s: q[4], size: q[3] * k, a, anchor: "middle" });
  if (def.ref && (it.fu || it.nr)) out.push({ at: w(-4.9, 0), s: [it.fu, it.nr].filter(Boolean).join(" / "), size: 1.4 * k, a, anchor: "middle" });
  // Abstand: hinter dem Symbol und hinter Zusatztexten rechts der Mitte (Breite ca. 0,6 × Höhe je Zeichen)
  const ext = Math.max(def.r, ...def.parts.filter((q) => q[0] === "t").map((q) => q[1] - def.c[0] + q[4].length * q[3] * 0.3));
  const lines = [it.txt, it.h !== undefined ? fmtH(it.h) : ""].filter(Boolean), c = symCenter(it, k), d = (ext + 0.6) * k, sg = flip ? -1 : 1;
  lines.forEach((s, i) => { const o = ((lines.length - 1) / 2 - i) * 2.2 * k * sg; out.push({ at: [c[0] + co * d - si * o, c[1] + si * d + co * o].map(r3), s, size: 1.8 * k, a, anchor: flip ? "end" : "start" }); });
  return out;
}
// Stückliste (Schritt 4, CJ 24.10.2026): Anzahl je Symbol auf sichtbaren Ebenen, Reihenfolge wie die Palette. Leitungen zählen nicht.
export function bomOf(sh) {
  const n = new Map();
  for (const it of sh.items) if (it.type === "sym" && isVisible(sh, it)) n.set(it.key, (n.get(it.key) ?? 0) + 1);
  return PLAN_SYMS.filter((d) => n.has(d.key)).map((d) => ({ key: d.key, label: d.label, group: d.group, n: n.get(d.key) }));
}
// CSV wie die übrigen Listen: Semikolon, Text in Anführungszeichen wenn nötig
export function bomCsv(rows) {
  const q = (s) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return ["Gruppe;Symbol;Anzahl", ...rows.map((r) => `${q(r.group)};${q(r.label)};${r.n}`)].join("\r\n") + "\r\n";
}
// Wandsymbol einrasten: nächste Wandfläche innerhalb reach (mm ab Fläche). Gibt { at, r, wall } (r: Symbol steht senkrecht zur Fläche, in den
// Raum auf der Seite von p) oder null.
export function wallSnap(walls, p, reach) {
  let best = null, bd = Infinity;
  for (const w of walls) {
    const u = wallDir(w), n = normal(u), L = wallLen(w), s = dot(sub(p, w.a), u), q = dot(sub(p, w.a), n), d = Math.abs(q) - w.d / 2;
    if (s < 0 || s > L || d > reach || d < -w.d / 2 - 1e-9 || d >= bd) continue;
    const k = q >= 0 ? 1 : -1, nn = [n[0] * k, n[1] * k];
    bd = d; best = { at: add(add(w.a, u, s), nn, w.d / 2).map(r3), r: ((Math.round((Math.atan2(nn[1], nn[0]) * 180) / Math.PI - 90) % 360) + 360) % 360, wall: w.id };
  }
  return best;
}
// Lage auf einer Wand: Abstand ab a entlang der Mittellinie
export const along = (w, p) => dot(sub(p, w.a), wallDir(w));
// Umgebendes Rechteck aller Objekte (null ohne Objekte)
export function contentBox(sh) {
  const k = paperOf(sh).den;
  const pts = sh.items.flatMap((i) => (i.type === "sym" ? (({ r }, c) => [add(c, [r * k, r * k]), add(c, [-r * k, -r * k])])(SYM_BY_KEY.get(i.key), symCenter(i, k)) : i.type === "wall" ? [add(i.a, [i.d, i.d]), add(i.a, [-i.d, -i.d]), add(i.b, [i.d, i.d]), add(i.b, [-i.d, -i.d])] : i.type === "dim" ? dimLine(i).slice(0, 2).concat([i.a, i.b]) : i.type === "line" ? linePts(i) : []));
  if (!pts.length) return null;
  return { x0: Math.min(...pts.map((q) => q[0])), y0: Math.min(...pts.map((q) => q[1])), x1: Math.max(...pts.map((q) => q[0])), y1: Math.max(...pts.map((q) => q[1])) };
}
// ---------- Geschwungene Leitung (CJ 24.10.2026) ----------
// Glatte Kurve durch alle Punkte (Catmull-Rom als kubische Bézier): je Abschnitt [p1, c1, c2, p2]. Enden: Tangente zum Nachbarpunkt.
export function curveSegs(pts) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 2)], p1 = pts[i - 1], p2 = pts[i], p3 = pts[Math.min(pts.length - 1, i + 1)];
    out.push([p1, add(p1, sub(p2, p0), 1 / 6), add(p2, sub(p3, p1), -1 / 6), p2]);
  }
  return out;
}
// Punkt und Richtung (nicht normiert) auf einem Bézier-Abschnitt bei t
export function bezAt([a, b, c, d], t) {
  const u = 1 - t, p = [0, 1].map((j) => u * u * u * a[j] + 3 * u * u * t * b[j] + 3 * u * t * t * c[j] + t * t * t * d[j]);
  const v = [0, 1].map((j) => 3 * u * u * (b[j] - a[j]) + 6 * u * t * (c[j] - b[j]) + 3 * t * t * (d[j] - c[j]));
  return { p, v };
}
const CURVE_N = 16; // Stützpunkte je Abschnitt für Treffer und Inhalt
// Linienzug der Leitung (geschwungen: angenähert), für Treffer, Rahmen und Inhalt
export const linePts = (it) => (it.curve && it.pts.length > 2 ? [it.pts[0], ...curveSegs(it.pts).flatMap((sg) => Array.from({ length: CURVE_N }, (_, j) => bezAt(sg, (j + 1) / CURVE_N).p.map(r3)))] : it.pts);
// Geschwungen mit nur zwei Punkten: Zwischenpunkt in der Mitte, um ein Fünftel der Länge nach links versetzt (ergibt einen Bogen, Punkt ziehbar)
export function bowPts(pts) {
  if (pts.length !== 2) return pts;
  const [a, b] = pts, v = sub(b, a), m = add(a, v, 0.5), n = normal([v[0], v[1]]);
  return [a, add(m, n, 0.2).map(r3), b];
}

export { segX, normal };
