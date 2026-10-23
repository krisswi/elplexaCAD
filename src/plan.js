// Modul «Plan» (CJ 23.10.2026, nur elplexaCAD): Elektroplan auf einem Grundriss. Datenmodell und Geometrie ohne DOM, mit node testbar.
// Welt in mm, y nach oben. Ursprung (0|0) = gemeinsamer Nullpunkt aller Plan-Module (später Stockwerke), kein Versatz je Blatt.
// Blatt: { kind: "plan", sid, var?, meta, paper: { size, quer, den }, pmid?: [x, y] (Druckmitte, fehlt = Mitte des Inhalts), layers: [{ id, name, show, lock }], alay, items }.
// Objekte: Wand { id, type: "wall", layer, a: [x, y], b: [x, y], d, mat } (Mittellinie a → b, Dicke d),
// Öffnung { id, type: "opening", wall, t, w, kind, hinge?, side?, br? } (hängt an der Wand, Ebene der Wand),
// Mass { id, type: "dim", layer, a, b, off, ref?, ctrl?, soll? } (ref = Wand-id: Mass der Mittellinie, a/b folgen der Wand).
import { PAPERS, orthoDir, segX, cleanPmid } from "./pv.js";

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
export const PLAN_ITEMS = new Set(["wall", "opening", "dim"]);

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
    return o;
  }
  if (it.type === "dim") {
    if (!isPt(it.a) || !isPt(it.b)) return null;
    const o = { id, type: "dim", layer: String(it.layer ?? ""), a: [it.a[0], it.a[1]], b: [it.b[0], it.b[1]], off: isNum(it.off) ? it.off : 0 };
    if (isNum(it.ref)) o.ref = it.ref;
    if (it.ctrl === true) { o.ctrl = true; if (isNum(it.soll) && it.soll > 0) o.soll = it.soll; } // Kontrollmass (Diagonale): Ist, optional Soll
    return o;
  }
  return null;
}

// Blattfelder und Objekte aus der Datei. Bereinigung: Objekte auf unbekannter Ebene → aktive Ebene, Öffnung ohne Wand fällt weg,
// Öffnung in die Wand geklemmt, Mass mit fehlender Wand verliert den Bezug. Gibt die höchste id zurück.
export function cleanPlanSheet(rs, m, maxId) {
  m.paper = cleanPlanPaper(rs.paper);
  m.layers = cleanPlanLayers(rs.layers);
  m.alay = layerById(m, rs.alay) ? rs.alay : m.layers[0].id;
  const pm = cleanPmid(rs.pmid); if (pm) m.pmid = pm; // Druckmitte frei gewählt (wie Stringplan 5ao)
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
  if (it.type === "opening") { const w = sh.items.find((x) => x.id === it.wall), u = wallDir(w); it.t += dx * u[0] + dy * u[1]; clampOpening(w, it); return; }
  const a = it.a, b = it.b, na = [a[0] + dx, a[1] + dy], nb = [b[0] + dx, b[1] + dy];
  if (it.type === "wall") { moveNode(sh, a, na, it.id); moveNode(sh, b, nb, it.id); }
  it.a = na.map(r3); it.b = nb.map(r3);
  fixOpenings(sh);
  syncDims(sh);
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
// Länge beim Zeichnen: eingetippt an Innen- oder Aussenkante, gespeichert wird die Mittellinie. Annahme: rechtwinklige Ecken an beiden
// Enden mit gleich dicken Wänden, also Mittellinie = Innenkante + d bzw. Aussenkante − d.
export const LEN_REFS = [["mitte", "Mittellinie"], ["innen", "Innenkante"], ["aussen", "Aussenkante"]];
export const centerLen = (L, ref, d) => (ref === "innen" ? L + d : ref === "aussen" ? L - d : L);

// Treffer: Öffnung vor Mass vor Wand. tol in mm. items = wählbare Objekte.
const distSeg = (p, a, b) => { const v = sub(b, a), l2 = dot(v, v), t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), v) / l2)) : 0; return len(sub(p, add(a, v, t))); };
export function dimLine(d) { // Masslinie: a, b um off nach links (von a nach b) versetzt
  const v = sub(d.b, d.a), l = len(v) || 1, n = normal([v[0] / l, v[1] / l]);
  return [add(d.a, n, d.off), add(d.b, n, d.off), n];
}
export function hitPlan(sh, items, p, tol) {
  const walls = new Map(sh.items.filter((i) => i.type === "wall").map((w) => [w.id, w]));
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
// Fang: Wand- und Massenden (auch gesperrte Ebenen), Mitte der Wand, Punkt auf der Mittellinie, Raster ab Nullpunkt. ortho = Bezugspunkt für
// Shift (0/45/90°). Rückgabe { x, y, snap }.
export function snapPlan(sh, items, p, { grid = 0, tol = 0, alt = false, ortho, extra = [] } = {}) {
  const on = (q) => (ortho ? orthoPt(ortho, q) : q.map(r3));
  const m = on(p);
  if (alt) return { x: m[0], y: m[1] };
  const walls = items.filter((i) => i.type === "wall");
  const best = (cands, kind) => { let hit = null, bd = tol; for (const c of cands) { const d = len(sub(c, m)); if (d <= bd) { bd = d; const q = on(c); hit = { x: q[0], y: q[1], snap: kind }; } } return hit; };
  return best([...walls.flatMap((w) => [w.a, w.b]), ...items.filter((i) => i.type === "dim").flatMap((d) => [d.a, d.b]), ...extra], "end")
    || best(walls.map((w) => [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]), "mid")
    || (!ortho && best(walls.map((w) => { const u = wallDir(w), t = Math.max(0, Math.min(wallLen(w), dot(sub(m, w.a), u))); return add(w.a, u, t); }), "edge"))
    || (grid > 0 ? (([x, y]) => ({ x, y, snap: "grid" }))(on([Math.round(p[0] / grid) * grid, Math.round(p[1] / grid) * grid])) : { x: m[0], y: m[1] });
}
// Lage auf einer Wand: Abstand ab a entlang der Mittellinie
export const along = (w, p) => dot(sub(p, w.a), wallDir(w));
// Umgebendes Rechteck aller Objekte (null ohne Objekte)
export function contentBox(sh) {
  const pts = sh.items.flatMap((i) => (i.type === "wall" ? [add(i.a, [i.d, i.d]), add(i.a, [-i.d, -i.d]), add(i.b, [i.d, i.d]), add(i.b, [-i.d, -i.d])] : i.type === "dim" ? dimLine(i).slice(0, 2).concat([i.a, i.b]) : []));
  if (!pts.length) return null;
  return { x0: Math.min(...pts.map((q) => q[0])), y0: Math.min(...pts.map((q) => q[1])), x1: Math.max(...pts.map((q) => q[0])), y1: Math.max(...pts.map((q) => q[1])) };
}
export { segX, normal };
