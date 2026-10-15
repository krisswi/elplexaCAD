// PV-Strangplan (Modul PV-Strings): Datenmodell, Massstab, Fixpunkt. Ohne DOM, damit mit node testbar.
// Welt in mm, y nach oben, Ursprung = Fixpunkt. Alle Objekte liegen damit relativ zum Fixpunkt.
// Der Hintergrund (eine PDF-Seite) wird über bg auf die Welt abgebildet. Seitenkoordinaten u, v in PDF-Punkten
// (pt = 1/72 Zoll), Ursprung oben links, v nach unten, wie der pdf.js-Viewport mit scale 1.
// bg = { asset, name, page, w, h, fix?: [u, v], mmPerPt?, measure?: { a: [u, v], b: [u, v], mm }, swap?: true, rot? }
// rot: Drehung des Plans in Grad um den Fixpunkt, positiv = gegen den Uhrzeigersinn (Schritt 3d). Fehlt = 0.
// Fehlt fix, liegt der Fixpunkt vorläufig unten links auf der Seite. Fehlt mmPerPt, gilt 1:1 (Papiermass).
// swap: neuer Planstand geladen, Fixpunkt noch nicht gesetzt (siehe fixMode).
import { TB_W, TB_H } from "./frame.js";

export const PT_MM = 25.4 / 72; // 1 pt auf dem Papier in mm
export const STD_DENS = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000]; // Normmassstäbe 1:n
export const PV_GRID = [[10, "10 mm"], [50, "50 mm"], [100, "100 mm"], [500, "500 mm"]]; // Annahme Claude, Vorgabe 100 mm (❓ CJ)
export const PV_TEXT_H = 250; // Texthöhe in mm auf dem Plan (Annahme Claude: 2,5 mm auf Papier bei 1:100)
export const PV_NAME_H = 300; // Stringnummer (Bezeichnung) 1,2 × grösser (5ae, CJ 15.10.: „2 px“ bei ca. 10 px Schrift), Druck im gleichen Verhältnis: 3 mm bei 1:100

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isPt = (p) => Array.isArray(p) && p.length === 2 && p.every(isNum);

export const mmPerPt = (bg) => bg.mmPerPt ?? PT_MM;
export const fixOf = (bg) => bg.fix ?? [0, bg.h];

// Punkt um den Ursprung (Fixpunkt) drehen, Winkel in Grad
export function rotPt(x, y, deg) {
  if (!deg) return [x, y];
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}
export function pageToWorld(bg, u, v) {
  const k = mmPerPt(bg), [fu, fv] = fixOf(bg), [x, y] = rotPt((u - fu) * k, (fv - v) * k, bg.rot);
  return { x, y };
}
export function worldToPage(bg, x, y) {
  const k = mmPerPt(bg), [fu, fv] = fixOf(bg), [rx, ry] = rotPt(x, y, -(bg.rot || 0));
  return { u: fu + rx / k, v: fv - ry / k };
}
// Ausdehnung der Seite in der Welt (auch gedreht)
export function bgBox(bg) {
  const c = [[0, 0], [bg.w, 0], [bg.w, bg.h], [0, bg.h]].map(([u, v]) => pageToWorld(bg, u, v)), xs = c.map((p) => p.x), ys = c.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
// Plan drehen um den Fixpunkt. Die Objekte drehen mit, damit sie auf dem Plan bleiben (Annahme Claude). Rückgabe: neuer Winkel.
// Module drehen zusätzlich um ihre Ecke unten links (Feld rot, Schritt 5f), sonst lägen sie verschoben auf dem Plan.
const normDeg = (d) => (((d % 360) + 540) % 360) - 180; // −180 … 180
export function rotatePlan(sheet, deg) {
  const r = normDeg((sheet.bg.rot || 0) + deg);
  if (Math.abs(r) < 1e-9) delete sheet.bg.rot; else sheet.bg.rot = Math.round(r * 1e6) / 1e6;
  for (const it of sheet.items) {
    if (it.pts) it.pts = it.pts.map(([x, y]) => rotPt(x, y, deg).map(r3));
    else if (isNum(it.x)) [it.x, it.y] = rotPt(it.x, it.y, deg).map(r3);
    if (it.fill) { const f = normDeg((it.fdir || 0) + deg); if (Math.abs(f) < 1e-9) delete it.fdir; else it.fdir = Math.round(f * 1e6) / 1e6; } // Muster dreht mit (5i)
    if (it.type === "pvmodule") { const m = normDeg((it.rot || 0) + deg); if (Math.abs(m) < 1e-9) delete it.rot; else it.rot = Math.round(m * 1e6) / 1e6; }
  }
  if (sheet.pmid) sheet.pmid = rotPt(...sheet.pmid, deg).map(r3); // gesetzte Druckmitte bleibt auf derselben Planstelle (5ao)
  return sheet.bg.rot || 0;
}
// Drehung, die die Strecke a→b waagrecht oder senkrecht legt (die kleinere), in Grad
export function alignAngle(a, b) {
  const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return -(ang - 90 * Math.round(ang / 90)) || 0; // ohne −0
}
// Winkel als Text, z. B. "12,35°"
export const fmtDeg = (d) => String(Math.round(d * 100) / 100).replace(".", ",") + "°";

// Massstab aus der Messstrecke: Länge in mm geteilt durch den Abstand der zwei Punkte in pt. null bei ungültiger Eingabe.
export function scaleFromMeasure(a, b, mm) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return d > 0 && mm > 0 ? mm / d : null;
}
export const denOf = (k) => k / PT_MM; // mm/pt → n in 1:n
export const kOfDen = (den) => den * PT_MM;
// Eingabe eines bekannten Massstabs: "100", "1:100", "1 : 100" oder "98,5" → 100 bzw. 98.5. null bei ungültiger Eingabe.
export function parseDen(str) {
  const m = /^\s*(?:1\s*:\s*)?(\d+(?:[.,]\d+)?)\s*$/.exec(String(str ?? ""));
  const den = m ? parseFloat(m[1].replace(",", ".")) : NaN;
  return den > 0 ? den : null;
}
// Nächster Normmassstab (Verhältnis, nicht Differenz: 1:98 liegt näher bei 1:100 als bei 1:75)
export const nearestStd = (k) => STD_DENS.reduce((a, b) => (Math.abs(Math.log(b / denOf(k))) < Math.abs(Math.log(a / denOf(k))) ? b : a));

// Neue PDF-Seite als Hintergrund. Gibt es schon einen Plan, ist das ein Plantausch: die Objekte bleiben relativ zum Fixpunkt,
// Massstab und Fixpunkt müssen für den neuen Plan neu gesetzt werden. Fehlte nur die PDF-Datei (asset), bleiben Massstab und Fixpunkt.
export function newBg(old, asset, name, page, w, h) {
  const bg = { asset, name, page, w, h };
  if (old && !old.asset) { for (const k of ["fix", "mmPerPt", "measure", "swap", "rot"]) if (old[k] !== undefined) bg[k] = old[k]; }
  else if (old) { bg.swap = true; if (old.rot) bg.rot = old.rot; } // Plantausch übernimmt die Drehung (5p, CJ 15.10.)
  return bg;
}

// Fixpunkt setzen: wie verhalten sich die Objekte? "plan" = sie bleiben auf dem Plan (werden mitverschoben),
// "fix" = sie bleiben relativ zum Fixpunkt (Plantausch). "ask" = Rückfrage, weil beides sinnvoll sein kann.
export function fixMode(bg, hasItems) {
  if (!hasItems) return "fix";
  if (!bg.fix) return bg.swap ? "fix" : "plan";
  return "ask";
}
// Setzt den Fixpunkt auf die Weltkoordinate (x, y). Bei mode "plan" werden die Objekte um (−x, −y) verschoben.
export function setFix(sheet, x, y, mode) {
  const p = worldToPage(sheet.bg, x, y);
  sheet.bg.fix = [p.u, p.v];
  delete sheet.bg.swap;
  if (mode === "plan") for (const it of sheet.items) moveBy(it, -x, -y);
}
const r3 = (n) => Math.round(n * 1000) / 1000 + 0; // + 0: ohne −0
function moveBy(it, dx, dy) {
  if (it.pts) it.pts = it.pts.map((p) => [r3(p[0] + dx), r3(p[1] + dy)]);
  else if (isNum(it.x)) { it.x = r3(it.x + dx); it.y = r3(it.y + dy); }
}

// Prüft den Hintergrund aus einer Datei. assets = geprüfte PDF-Dateien des Dokuments. Fehlt die PDF, bleibt der Rest (Massstab, Fixpunkt).
export function cleanBg(raw, assets) {
  if (!raw || typeof raw !== "object") return undefined;
  if (![raw.w, raw.h].every((v) => isNum(v) && v > 0)) throw new Error("Der Hintergrund eines Stringplans ist defekt.");
  const bg = { name: String(raw.name ?? ""), page: Math.max(1, Math.round(Number(raw.page)) || 1), w: raw.w, h: raw.h };
  if (typeof raw.asset === "string" && assets[raw.asset]) bg.asset = raw.asset;
  if (isPt(raw.fix)) bg.fix = [raw.fix[0], raw.fix[1]];
  if (isNum(raw.mmPerPt) && raw.mmPerPt > 0) bg.mmPerPt = raw.mmPerPt;
  if (raw.measure && isPt(raw.measure.a) && isPt(raw.measure.b) && isNum(raw.measure.mm)) bg.measure = { a: [...raw.measure.a], b: [...raw.measure.b], mm: raw.measure.mm };
  if (raw.swap === true) bg.swap = true;
  if (isNum(raw.rot) && raw.rot !== 0) bg.rot = raw.rot;
  return bg;
}
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
export function cleanAssets(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, a] of Object.entries(raw)) if (a && a.type === "application/pdf" && typeof a.data === "string" && B64.test(a.data)) out[id] = { name: String(a.name ?? ""), type: a.type, data: a.data };
  return out;
}
// Nur PDF-Dateien speichern, auf die noch ein Blatt zeigt (nach Plantausch fällt der alte Plan weg)
export function usedAssets(doc) {
  const ids = new Set(doc.sheets.map((sh) => sh.bg?.asset).filter(Boolean)), out = {};
  for (const id of ids) if (doc.assets?.[id]) out[id] = doc.assets[id];
  return out;
}

// Abweichung als Text mit Vorzeichen, z. B. "+12,5 %" oder "−0,4 %"
export const fmtPct = (r) => (r < 0 ? "−" : "+") + String(Math.round(Math.abs(r) * 1000) / 10).replace(".", ",") + " %";
// Massstab als Text, z. B. "1:100" oder "1:98,6"
export const fmtDen = (den) => "1:" + String(Math.round(den * 10) / 10).replace(".", ",");

// ---------- Ebenen (Schritt 3) ----------
// Ebene: it.layer (aktive Ebene beim Zeichnen, Schritt 3c), sonst aus dem Objekttyp (Dateien vor 3c). Ausgeblendet: nicht gezeichnet, nicht wählbar, kein Fang. Gesperrt: gezeichnet und Fang, aber nicht wählbar
// und nichts Neues darauf. Hintergrund gesperrt: Plan laden, Massstab und Fixpunkt gesperrt.
// sheet.layers fehlt, solange nichts umgeschaltet wurde (Dateien aus Schritt 2 bleiben beim Speichern gleich).
export const LAYERS = [["bg", "Hintergrund"], ["dach", "Dach"], ["module", "Module"], ["kabel", "Verkabelung"], ["text", "Beschriftung"]];
const LAYER_OF = { roofline: "dach", keepout: "dach", pvmodule: "module", pvstring: "kabel", spa: "kabel", text: "text" };
export const layerOf = (it) => it.layer ?? LAYER_OF[it.type];
// Ebenen, die aktiv sein können (⌘1 bis ⌘5, Reihenfolge der Liste). Auch der Hintergrund (CJ 14.10.): Plan-Werkzeuge und eigene Linien.
export const DRAW_LAYERS = LAYERS.map(([k]) => k);
export const cleanLayerId = (v) => (DRAW_LAYERS.includes(v) ? v : undefined);
const defLayer = () => ({ show: true, lock: false }); // Annahme Claude: alles sichtbar und frei, auch der Hintergrund (❓ CJ)
export const layerState = (sheet, l) => sheet.layers?.[l] ?? defLayer();
export function toggleLayer(sheet, l, key) {
  sheet.layers ??= Object.fromEntries(LAYERS.map(([k]) => [k, defLayer()]));
  sheet.layers[l][key] = !sheet.layers[l][key];
}
// Druckteile (5l) gelten seit 5ai auch am Bildschirm (CJ 15.10.): sichtbar ist nur, was Ebene (Auge) und Druckteil beide erlauben.
// Ganz weg: Module, Sperrflächen, SPA, Texte; Dachlinie ohne Linie nur, wenn auch ihre Füllung aus ist; String nur, wenn Linie, Bezeichnung und + − aus sind.
const PART_OF = { pvmodule: "mod", keepout: "keepout", spa: "spa", text: "text" };
export function partShown(sheet, it) {
  const h = sheet.hide;
  if (!h) return true;
  if (it.type === "roofline") return !h.includes("roof") || (!!it.fill && fillable(it) && !h.includes("fill"));
  if (it.type === "pvstring") return !(h.includes("str") && h.includes("name") && h.includes("pm"));
  return !h.includes(PART_OF[it.type]);
}
export const visible = (sheet, it) => layerState(sheet, layerOf(it)).show && partShown(sheet, it);
export const pickable = (sheet, it) => visible(sheet, it) && !layerState(sheet, layerOf(it)).lock;
// Klick, Shift, Rahmen, ⌘A und ⌘-Klick (5n/5o/5s, CJ 15.10.): nur wählbare Objekte der aktiven Ebene. Auch eigene Linien und Texte auf dem Hintergrund (5v).
export const layerPick = (sheet, l) => sheet.items.filter((it) => layerOf(it) === l && pickable(sheet, it));
// Sichtbare Objekte der anderen Ebenen (5w: Meldung „liegt auf Ebene X“ bei ⌘ + Klick)
export const otherLayers = (sheet, l) => sheet.items.filter((it) => layerOf(it) !== l && visible(sheet, it));
export function cleanLayers(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  return Object.fromEntries(LAYERS.map(([k]) => [k, { show: raw[k]?.show !== false, lock: raw[k]?.lock === true }]));
}

// ---------- Dach: Dachlinien und Sperrflächen ----------
// roofline: Linienzug (Umriss, Kanten), closed = geschlossen. keepout: Sperrfläche, immer geschlossen, mindestens 3 Punkte.
// Sperrfläche = Bereich ohne Module. Ein Modul darauf wird nur gewarnt (CJ 14.10.), siehe onKeepout.
export const PV_TYPES = new Set(["roofline", "keepout"]);
export const PV_ITEMS = new Set([...PV_TYPES, "pvmodule", "pvstring", "spa"]); // alle Objekte, die nur auf einen Stringplan gehören
export const isClosed = (it) => it.type === "keepout" || it.closed === true;
// Füllmuster (Schritt 5h, CJ 15.10.): Feld fill an geschlossener Dachlinie, fehlt = keine Füllung.
// Sperrfläche (5u, CJ 15.10.): immer eigene graue Kreuzschraffur, keine Wahl. Eine alte Füllung an der Sperrfläche fällt beim Laden weg.
export const FILLS = [["", "keine"], ["ziegel-rot", "Ziegel rötlich"], ["ziegel-dunkel", "Ziegel dunkel"], ["trapez-hell", "Trapezblech grau hell"], ["trapez-dunkel", "Trapezblech grau dunkel"], ["trapez-braun", "Trapezblech braun"]];
export const fillable = (it) => it.type === "roofline" && it.closed === true;
// Offene Dachlinie ab 3 Punkten lässt sich füllen: sie wird dabei geschlossen gespeichert (5t, CJ 15.10.)
export const canFill = (it) => it.type === "roofline" && it.pts.length >= 3;
export function setFill(it, v) {
  if (!v) { delete it.fill; delete it.fdir; return; } // „keine“: Linie bleibt geschlossen
  it.closed = true; it.fill = v;
}
export function cleanPvItem(it, id) {
  if (it.type === "pvmodule") return typeof it.mt === "string" && isNum(it.x) && isNum(it.y) ? { id, type: "pvmodule", mt: it.mt, x: it.x, y: it.y, quer: it.quer === true, ...(isNum(it.rot) && it.rot ? { rot: it.rot } : {}) } : null;
  if (it.type === "pvstring") return typeof it.name === "string" && Array.isArray(it.mods) && it.mods.length && it.mods.every(Number.isInteger) ? { id, type: "pvstring", name: it.name, mods: [...it.mods] } : null;
  if (it.type === "spa") return isNum(it.x) && isNum(it.y) ? { id, type: "spa", x: it.x, y: it.y } : null;
  if (!PV_TYPES.has(it.type) || !Array.isArray(it.pts) || !it.pts.every(isPt)) return null;
  const pts = it.pts.map((p) => [p[0], p[1]]);
  if (pts.length < (it.type === "keepout" ? 3 : 2)) return null;
  const o = { id, type: it.type, pts };
  if (it.type === "roofline") o.closed = it.closed === true;
  if (cleanLayerId(it.layer)) o.layer = it.layer;
  if (fillable(o) && FILLS.some(([k]) => k && k === it.fill)) o.fill = it.fill;
  if (o.fill && isNum(it.fdir) && it.fdir) o.fdir = it.fdir; // Richtung des Musters in Grad (5i), fehlt = 0
  return o;
}
// Kanten eines Linienzugs als Punktpaare
export function edges(it) {
  const p = it.pts, out = [];
  for (let i = 0; i + 1 < p.length; i++) out.push([p[i], p[i + 1]]);
  if (isClosed(it) && p.length > 2) out.push([p.at(-1), p[0]]);
  return out;
}
function nearestOnSeg(x, y, [a, b]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0;
  return [a[0] + t * dx, a[1] + t * dy];
}
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Treffer: auf einer Kante, bei der Sperrfläche auch innen
export function hitPv(it, x, y, tol) {
  if (edges(it).some((e) => { const q = nearestOnSeg(x, y, e); return Math.hypot(q[0] - x, q[1] - y) <= tol; })) return true;
  return it.type === "keepout" && inPoly(x, y, it.pts);
}
export const pathLen = (it) => edges(it).reduce((s, [a, b]) => s + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
export const area = (pts) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

// ---------- Fang ----------
// Reihenfolge: Endpunkt/Eckpunkt (auch Modulecken, Schritt 4) vor Schnittpunkt vor Mitte vor Kante, dann Raster ab Fixpunkt (Ursprung). Alt schaltet den Fang aus.
// items = Objekte des Blatts (nur sichtbare Dachobjekte fangen, auch gesperrte), extra = weitere Eckpunkte (z. B. der Linienzug im Entstehen).
// skip = id eines Objekts, das nicht fängt (Punkt wird gezogen). ortho = Bezugspunkt [x, y] für Shift: Punkt liegt waagrecht, senkrecht
// dazu oder unter 45° (5r, CJ 15.10.: die Richtung näher an der Maus). Fangpunkte werden auf die Achse projiziert, Kanten fangen im Schnitt mit der Achse.
// tol in mm (Bildschirm-Pixel / Zoom). Rückgabe { x, y, snap: "end" | "inter" | "mid" | "edge" | "grid" | undefined }.
export function snapPv(sheet, w, { grid = 0, tol = 0, alt = false, extra = [], skip, ortho } = {}) {
  const u = ortho && orthoDir(w.x - ortho[0], w.y - ortho[1]);
  const on = ([x, y]) => { if (!u) return [x, y]; if (!u[1]) return [x, ortho[1]]; if (!u[0]) return [ortho[0], y]; const t = (x - ortho[0]) * u[0] + (y - ortho[1]) * u[1]; return [ortho[0] + t * u[0], ortho[1] + t * u[1]]; }; // auf die Achse
  const [mx, my] = on([w.x, w.y]);
  if (alt) return { x: mx, y: my };
  const roof = sheet.items.filter((it) => PV_TYPES.has(it.type) && visible(sheet, it) && it.id !== skip);
  const mods = sheet.items.filter((it) => it.type === "pvmodule" && visible(sheet, it) && it.id !== skip).flatMap(modCorners);
  const best = (cands, kind) => {
    let hit = null, bd = tol;
    for (const c of cands) { const d = Math.hypot(c[0] - mx, c[1] - my); if (d <= bd) { bd = d; const [x, y] = on(c); hit = { x: r3(x), y: r3(y), snap: kind }; } }
    return hit;
  };
  const segs = roof.flatMap(edges), ax = u && [[mx - u[0] * tol, my - u[1] * tol], [mx + u[0] * tol, my + u[1] * tol]];
  return best([...roof.flatMap((it) => it.pts), ...mods, ...extra], "end")
    || best(crossings(segs), "inter")
    || best(segs.map(([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), "mid")
    || best(u ? segs.map((e) => segX(ax, e)).filter(Boolean) : segs.map((e) => nearestOnSeg(mx, my, e)), "edge")
    || (grid > 0 ? (([x, y]) => ({ x: r3(x), y: r3(y), snap: "grid" }))(on([Math.round(w.x / grid) * grid, Math.round(w.y / grid) * grid])) : { x: mx, y: my });
}
// Shift (5r): Richtung 0°, 45°, 90° … zum Vektor dx, dy (die nächste), als Einheitsvektor. Waagrecht und senkrecht exakt.
const D45 = Math.SQRT1_2, DIRS = [[1, 0], [D45, D45], [0, 1], [-D45, D45], [-1, 0], [-D45, -D45], [0, -1], [D45, -D45]];
export const orthoDir = (dx, dy) => DIRS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
// Schnittpunkt zweier Strecken oder null (parallel oder ausserhalb)
export function segX([a, b], [c, d]) {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1], den = rx * sy - ry * sx;
  if (Math.abs(den) <= 1e-12 * Math.hypot(rx, ry) * Math.hypot(sx, sy)) return null;
  const qx = c[0] - a[0], qy = c[1] - a[1], t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den, e = 1e-9;
  return t >= -e && t <= 1 + e && u >= -e && u <= 1 + e ? [a[0] + t * rx, a[1] + t * ry] : null;
}
// Alle Schnittpunkte der Kanten (auch innerhalb eines Objekts). Gemeinsame Eckpunkte fängt schon "end".
const crossings = (segs) => segs.flatMap((s, i) => segs.slice(i + 1).map((t) => segX(s, t)).filter(Boolean));

// ---------- Module (Schritt 4) ----------
// Modultyp (Katalog im Dokument, doc.pv.moduleTypes): { id, name, l, b, d?, pmax?, voc?, isc?, vmpp?, impp?, tkVoc? }.
// l = Länge (lange Seite), b = Breite, d = Dicke in mm; Pmax W, Voc/Vmpp V, Isc/Impp A, Tk Voc %/K (negativ). Pflicht: Name, l, b > 0.
// Modul: { id, type: "pvmodule", mt, x, y, quer }. x, y = Ecke unten links in mm. hoch: lange Seite senkrecht (Annahme Claude), quer: waagrecht.
// Modulfeld = lose Module (CJ 14.10.), nicht drehbar. Abstand zwischen Modulen waagrecht gx und senkrecht gy, Vorgabe 5 mm (CJ 14.10.).
export const MT_FIELDS = [["name", "Name", ""], ["l", "Länge (lange Seite)", "mm"], ["b", "Breite", "mm"], ["d", "Dicke", "mm"], ["pmax", "Pmax", "W"], ["voc", "Voc", "V"], ["isc", "Isc", "A"], ["vmpp", "Vmpp", "V"], ["impp", "Impp", "A"], ["tkVoc", "Tk Voc", "%/K"], ["vsys", "Systemspannung", "V"]]; // vsys: Schritt 6 (CJ 14.10.)
export const GAP = 5;
// Prüft einen Modultyp. null, wenn Name, Länge oder Breite fehlen. Leere oder ungültige Datenblattwerte fallen weg (nichts erfinden).
export function cleanModuleType(raw, id = raw?.id) {
  if (!raw || typeof raw !== "object" || typeof id !== "string" || !id) return null;
  const name = String(raw.name ?? "").trim(), o = { id, name };
  if (!name || !(isNum(raw.l) && raw.l > 0) || !(isNum(raw.b) && raw.b > 0)) return null;
  for (const [k] of MT_FIELDS.slice(1)) if (isNum(raw[k]) && (k === "tkVoc" || raw[k] > 0)) o[k] = raw[k];
  return o;
}
// Katalog und Projektwerte im Dokument (doc.pv): { moduleTypes?, invTypes?, wr?: { "2": WR-Typ-id }, tmin? } (Schritt 6: WR und Tmin für die ganze Datei, CJ 14.10.).
// Wirft bei defekten Typen, doppelten ids oder einer Zuordnung auf einen fehlenden WR-Typ.
export function cleanPvDoc(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const list = (key, clean, msg) => {
    if (!Array.isArray(raw[key]) || !raw[key].length) return undefined;
    const ts = raw[key].map((t) => clean(t));
    if (ts.some((t) => !t) || new Set(ts.map((t) => t.id)).size !== ts.length) throw new Error(msg);
    return ts;
  };
  const o = { moduleTypes: list("moduleTypes", cleanModuleType, "Ein Modultyp im Katalog ist defekt."), invTypes: list("invTypes", cleanInvType, "Ein WR-Typ im Katalog ist defekt."), wr: {}, tmin: raw.tmin, anlage: cleanAnlage(raw.anlage) };
  const ids = new Set(o.invTypes?.map((t) => t.id));
  for (const [nr, id] of Object.entries(raw.wr && typeof raw.wr === "object" ? raw.wr : {})) {
    if (!/^\d{1,3}$/.test(nr) || !ids.has(id)) throw new Error("Ein Wechselrichter verweist auf einen WR-Typ, der im Katalog fehlt.");
    o.wr[nr] = id;
  }
  return tidyPv(o);
}
// Feste Reihenfolge der Felder, leere Felder weg, undefined ohne Inhalt (Speichern → Laden → Speichern bleibt gleich)
export function tidyPv(pv) {
  if (!pv) return undefined;
  const o = {}, wr = Object.keys(pv.wr ?? {}).sort((a, b) => a - b);
  if (pv.moduleTypes?.length) o.moduleTypes = pv.moduleTypes;
  if (pv.invTypes?.length) o.invTypes = pv.invTypes;
  if (wr.length) o.wr = Object.fromEntries(wr.map((k) => [k, pv.wr[k]]));
  if (isNum(pv.tmin)) o.tmin = pv.tmin;
  if (pv.anlage?.length) o.anlage = pv.anlage;
  return Object.keys(o).length ? o : undefined;
}
// Katalogdatei (JSON-Bibliothek, ohne ids) sichern und laden. Beim Laden werden gleiche Namen übersprungen.
// key: "moduleTypes" (Modulkatalog) oder "invTypes" (WR-Katalog, Schritt 6).
export const CATALOG_FORMAT = "schemacad-katalog";
export const catalogText = (types, key = "moduleTypes") => JSON.stringify({ format: CATALOG_FORMAT, version: 1, [key]: types.map(({ id: _, ...t }) => t) }, null, 1);
export function parseCatalog(text, key = "moduleTypes") {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error("Die Datei ist kein gültiges JSON."); }
  if (!o || o.format !== CATALOG_FORMAT || !Array.isArray(o[key])) throw new Error(`Das ist keine SchemaCAD-Katalogdatei${key === "invTypes" ? " mit Wechselrichtern" : ""}.`);
  return o[key].map((t) => (key === "invTypes" ? cleanInvType : cleanModuleType)(t, "neu")).filter(Boolean);
}
// Hängt neue Typen an list an (newId liefert die ids). Rückgabe: Anzahl übernommen.
export function mergeCatalog(list, types, newId) {
  const names = new Set(list.map((t) => t.name));
  let n = 0;
  for (const t of types) if (!names.has(t.name)) { list.push({ ...t, id: newId() }); names.add(t.name); n++; }
  return n;
}
// Formular (Texte in der Reihenfolge von MT_FIELDS bzw. IT_FIELDS, Komma erlaubt) → { type } oder { error }
export function typeFromForm(vals, id, inv = false) {
  const fields = inv ? IT_FIELDS : MT_FIELDS, raw = { name: vals[0] };
  for (let i = 1; i < fields.length; i++) {
    const v = String(vals[i] ?? "").trim().replace(",", ".").replace("−", "-");
    if (v === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n)) return { error: `${fields[i][1]}: bitte eine Zahl eingeben.` };
    raw[fields[i][0]] = n;
  }
  const t = (inv ? cleanInvType : cleanModuleType)(raw, id);
  return t ? { type: t } : { error: inv ? "Name und Vmax (grösser als 0) sind nötig, Anzahl MPPT als ganze Zahl." : "Name, Länge und Breite (grösser als 0) sind nötig." };
}

// ---------- Wechselrichter (Schritt 6) ----------
// WR-Typ (Katalog im Dokument, doc.pv.invTypes): { id, name, vmax, vmppMin?, vmppMax?, imax?, vstart?, mppt? }. Pflicht: Name und Vmax (Annahme Claude:
// ohne Vmax keine Spannungsprüfung). Vmax = max. Eingangsspannung in V, imax = max. Eingangsstrom je MPPT in A, mppt = Anzahl MPPT.
// Zuordnung: die WR-Nummer aus der Bezeichnung (2 in 2.1.1) zeigt über doc.pv.wr auf einen WR-Typ (CJ 14.10.: Typ im Katalog + Zuordnung).
// MPP-Bereich und Startspannung werden nur erfasst, geprüft wird später (CJ 14.10.).
export const IT_FIELDS = [["name", "Name", ""], ["vmax", "Vmax (max. Eingangsspannung)", "V"], ["vmppMin", "MPP-Spannung von", "V"], ["vmppMax", "MPP-Spannung bis", "V"], ["imax", "Imax je MPPT", "A"], ["vstart", "Startspannung", "V"], ["mppt", "Anzahl MPPT", ""]];
export function cleanInvType(raw, id = raw?.id) {
  if (!raw || typeof raw !== "object" || typeof id !== "string" || !id) return null;
  const name = String(raw.name ?? "").trim(), o = { id, name };
  if (!name || !(isNum(raw.vmax) && raw.vmax > 0) || (raw.mppt !== undefined && !(Number.isInteger(raw.mppt) && raw.mppt > 0))) return null;
  for (const [k] of IT_FIELDS.slice(1)) if (isNum(raw[k]) && raw[k] > 0) o[k] = raw[k];
  return o;
}

// ---------- Stringübersicht mit Spannungsprüfung (Schritt 6) ----------
// Leerlaufspannung eines Moduls bei Tmin:  Voc(Tmin) = Voc × (1 + Tk/100 × (Tmin − 25 °C)).
// Für einen String die Summe über seine Module, bei gleichem Modultyp also  Voc_String = Voc × n × (1 + Tk/100 × (Tmin − 25 °C)).
// Tk Voc in %/K und negativ (z. B. −0,27), daher durch 100 (sonst Fehler Faktor 100). 25 °C = Modultemperatur bei STC. Tmin gibt der Nutzer ein.
// Beispiel: Voc 49,5 V, Tk −0,27 %/K, Tmin −20 °C → Faktor 1 + (−0,0027) × (−45) = 1,1215; 18 Module → 999,3 V.
export const vocAt = (voc, tk, tmin) => voc * (1 + (tk / 100) * (tmin - 25));
// Bewertung gegen eine Grenze: "bad" darüber, "warn" ab 95 %, sonst "ok". Nur Hinweis, keine Freigabe.
// „Knapp“ nur für Vmax (5am, CJ 15.10.): Systemspannung und Strom mit knapp = false, dort nur ok oder über.
export const KNAPP = 0.95;
export const level = (v, max, knapp = true) => (v > max ? "bad" : knapp && v >= KNAPP * max ? "warn" : "ok");
// Strom mit Zuschlag (5ak, CJ 15.10.): Isc max = Isc Modul × 1,25 (Einstrahlung). Norm laut CJ: NIN Kapitel 7.12, von Claude nicht nachgelesen.
export const ISC_FACTOR = 1.25;
const LV = { info: 1, ok: 0, warn: 2, bad: 3 }; // info = Angabe fehlt, Prüfung nicht möglich
export const fmtNum = (v, d = 1) => String(Math.round(v * 10 ** d) / 10 ** d).replace(".", ",").replace("-", "−");
const pct = (v, max) => `${fmtNum((v / max) * 100)} %`; // eine Nachkommastelle, damit 999,3 V nicht als 100 % erscheint
// Alle Strings aller Stringpläne der Datei (CJ 14.10.: eine Übersicht für alle), sortiert nach WR, MPPT, String.
// Zeile: { si, name, wr, mppt, str, n, types, voc, vt, isc, inv, lvl, notes: [{ t, lvl }] }. voc = STC, vt = bei Tmin (null = nicht berechenbar).
// Strom (CJ 14.10.): Summe Isc der Strings am selben WR-Eingang (WR.MPPT, über alle Pläne) gegen Imax je MPPT. Isc eines Strings = grösstes Isc
// seiner Module × 1,25 (5ak, CJ 15.10.), auch ohne Tmin.
export function stringReport(doc) {
  const pv = doc.pv ?? {}, mts = new Map((pv.moduleTypes ?? []).map((t) => [t.id, t])), its = new Map((pv.invTypes ?? []).map((t) => [t.id, t])), tmin = pv.tmin;
  const rows = [], seen = new Map();
  doc.sheets.forEach((sh, si) => {
    if (sh.kind !== "pv") return;
    const mods = new Map(sh.items.filter((m) => m.type === "pvmodule").map((m) => [m.id, m]));
    for (const s of strings(sh)) {
      const p = parseName(s.name), ts = s.mods.map((id) => mts.get(mods.get(id)?.mt)).filter(Boolean), inv = its.get(pv.wr?.[p.wr]) ?? null, notes = [];
      const note = (t, lvl) => notes.push({ t, lvl }), names = [...new Set(ts.map((t) => t.name))];
      if (seen.has(s.name)) note(`Bezeichnung auch auf ${seen.get(s.name)}`, "bad");
      if (names.length > 1) note("Verschiedene Modultypen im String", "warn");
      const voc = ts.every((t) => isNum(t.voc)) ? ts.reduce((a, t) => a + t.voc, 0) : null;
      let vt = null;
      if (voc === null) note("Voc fehlt im Modultyp", "info");
      else if (!isNum(tmin)) note("Tmin fehlt", "info");
      else if (!ts.every((t) => isNum(t.tkVoc))) note("Tk Voc fehlt im Modultyp", "info");
      else vt = ts.reduce((a, t) => a + vocAt(t.voc, t.tkVoc, tmin), 0);
      if (!inv) note(`WR ${p.wr} ohne Datenblatt`, "info");
      else if (inv.mppt && p.mppt > inv.mppt) note(`MPPT ${p.mppt} gibt es nicht (${inv.mppt} MPPT)`, "bad");
      if (inv && vt !== null) { const l = level(vt, inv.vmax); note(l === "bad" ? `Über Vmax ${fmtNum(inv.vmax, 0)} V` : `${l === "warn" ? "Knapp: " : ""}${pct(vt, inv.vmax)} von Vmax`, l); }
      const vsys = ts.some((t) => !isNum(t.vsys)) ? null : Math.min(...ts.map((t) => t.vsys));
      if (vt !== null && vsys === null) note("Systemspannung fehlt im Modultyp", "info");
      else if (vt !== null && level(vt, vsys, false) === "bad") note(`Über Systemspannung ${fmtNum(vsys, 0)} V`, "bad");
      const isc = ts.length && ts.every((t) => isNum(t.isc)) ? Math.max(...ts.map((t) => t.isc)) * ISC_FACTOR : null;
      rows.push({ si, name: s.name, ...p, n: s.mods.length, types: names, voc, vt, isc, inv, notes });
      if (!seen.has(s.name)) seen.set(s.name, `Stringplan ${sh.meta?.BLATT || si + 1}`);
    }
  });
  rows.sort((a, b) => a.wr - b.wr || a.mppt - b.mppt || a.str - b.str || a.si - b.si);
  // Strom je WR-Eingang
  const groups = new Map();
  for (const r of rows) { const k = `${r.wr}.${r.mppt}`; groups.set(k, [...(groups.get(k) ?? []), r]); }
  for (const g of groups.values()) {
    const inv = g[0].inv;
    if (!inv) continue;
    if (!inv.imax) { for (const r of g) r.notes.push({ t: "Imax fehlt im WR-Typ, Strom nicht geprüft", lvl: "info" }); continue; }
    if (g.some((r) => r.isc === null)) { for (const r of g) r.notes.push({ t: "Isc fehlt im Modultyp, Strom nicht geprüft", lvl: "info" }); continue; }
    const sum = g.reduce((a, r) => a + r.isc, 0);
    if (level(sum, inv.imax, false) === "bad") for (const r of g) r.notes.push({ t: `Über Imax: Isc × 1,25${g.length > 1 ? ` von ${g.length} Strings` : ""} ${fmtNum(sum)} A, Imax ${fmtNum(inv.imax)} A`, lvl: "bad" });
  }
  for (const r of rows) r.lvl = r.notes.reduce((a, x) => (LV[x.lvl] > LV[a] ? x.lvl : a), "ok");
  return rows;
}
// Gesamturteil einer Zeile als Text
export const LEVEL_TEXT = { ok: "ok", info: "unvollständig", warn: "knapp", bad: "Grenze überschritten" };
// Verwendete WR-Nummern (aus den Bezeichnungen aller Stringpläne und den Zuordnungen), aufsteigend
export const wrNumbers = (doc) => [...new Set([...doc.sheets.filter((sh) => sh.kind === "pv").flatMap((sh) => strings(sh).map((s) => parseName(s.name).wr)), ...Object.keys(doc.pv?.wr ?? {}).map(Number)])].sort((a, b) => a - b);
// Die Modultypen liegen im Dokument. pvedit.js setzt die Quelle (immer das aktuelle Dokument), Tests setzen sie direkt.
let typeSource = () => [];
export const setTypeSource = (fn) => { typeSource = fn; };
export const modType = (id) => typeSource().find((t) => t.id === id);
// Grösse in der Welt [w, h]. mt = id oder Modultyp.
export function modSize(mt, quer) { const t = typeof mt === "string" ? modType(mt) : mt; return !t ? [0, 0] : quer ? [t.l, t.b] : [t.b, t.l]; }
// Rechteck ohne Drehung. rot = Drehung in Grad um die Ecke unten links (nur nach „Plan drehen“, Schritt 5f).
export function modRect(it) { const [w, h] = modSize(it.mt, it.quer); return { x0: it.x, y0: it.y, x1: it.x + w, y1: it.y + h }; }
// Punkt in Modulkoordinaten (Drehung herausgerechnet), dort gilt modRect
const toLocal = (it, x, y) => { if (!it.rot) return [x, y]; const [a, b] = rotPt(x - it.x, y - it.y, -it.rot); return [it.x + a, it.y + b]; };
const modCorners = (it) => { const b = modRect(it); return [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].map(([x, y]) => (it.rot ? rotPt(x - it.x, y - it.y, it.rot).map((v, i) => v + (i ? it.y : it.x)) : [x, y])); };
// Umgebendes Rechteck (achsparallel, auch gedreht)
export function modBox(it) {
  if (!it.rot) return modRect(it);
  const c = modCorners(it), xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
// Trifft der Punkt das Modul (Toleranz tol)?
export function hitMod(it, x, y, tol = 0) { const [u, v] = toLocal(it, x, y), b = modRect(it); return u >= b.x0 - tol && u <= b.x1 + tol && v >= b.y0 - tol && v <= b.y1 + tol; }
// Modulfeld: Ecken unten links aller Module, Spalten nach rechts, Reihen nach oben
export function fieldPositions(x, y, cols, rows, [w, h], gx, gy) {
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([r3(x + c * (w + gx)), r3(y + r * (h + gy))]);
  return out;
}
// Abstände quer und längs zum Modul (5y, CJ 15.10.) → [gx, gy] im Plan. Quer = zwischen den langen Seiten, längs = zwischen den kurzen.
// hoch (lange Seite senkrecht): quer = waagrecht, längs = senkrecht; quer liegend umgekehrt.
export const gapsXY = (quer, gq, gl) => (quer ? [gl, gq] : [gq, gl]);
// Feld am Bezugspunkt p (5x, Ecke mit Tab wählbar): corner = [hx, vy], hx "l"/"r" = Bezugspunkt links/rechts, vy "b"/"t" = unten/oben.
// rot = Drehung des Plans (5aa, CJ 15.10.): das Feld liegt im gedrehten Plan, jedes Modul bekommt rot. Rückgabe: [{ x, y, rot? }]
export function fieldAt(p, cols, rows, size, gx, gy, corner = ["l", "b"], rot = 0) {
  const W = cols * size[0] + (cols - 1) * gx, H = rows * size[1] + (rows - 1) * gy;
  const ox = corner[0] === "r" ? -W : 0, oy = corner[1] === "t" ? -H : 0;
  return fieldPositions(ox, oy, cols, rows, size, gx, gy).map(([x, y]) => {
    const [u, v] = rotPt(x, y, rot);
    return { x: r3(p.x + u), y: r3(p.y + v), ...(rot ? { rot } : {}) };
  });
}
// Ecken reihum mit Tab (5x, CJ 15.10.): unten links → unten rechts → oben rechts → oben links. dir = -1 rückwärts (Shift+Tab).
export const CORNERS = [["l", "b"], ["r", "b"], ["r", "t"], ["l", "t"]];
const CORNER_NAMES = { lb: "unten links", rb: "unten rechts", rt: "oben rechts", lt: "oben links" };
export function nextCorner(corner, dir = 1) {
  const i = CORNERS.findIndex((k) => k[0] === corner[0] && k[1] === corner[1]);
  return CORNERS[(i + dir + CORNERS.length) % CORNERS.length];
}
export const cornerName = (corner) => CORNER_NAMES[corner.join("")];
// Liegt das Modul ganz oder teilweise auf einer Sperrfläche? Berühren am Rand zählt auch (5z, CJ 15.10.), Toleranz 0,01 mm.
export function onKeepout(sheet, it) {
  const b = modRect(it), e = 0.01, r = { x0: b.x0 - e, y0: b.y0 - e, x1: b.x1 + e, y1: b.y1 + e };
  const rc = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]], re = rc.map((p, i) => [p, rc[(i + 1) % 4]]);
  return sheet.items.filter((k) => k.type === "keepout").map((k) => ({ type: "keepout", pts: k.pts.map(([x, y]) => toLocal(it, x, y)) })).some((k) => (rc.some(([x, y]) => inPoly(x, y, k.pts))
    || k.pts.some(([x, y]) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1)
    || edges(k).some((ke) => re.some((se) => segX(ke, se)))));
}

// ---------- Verkabelung: Strings und SPA (Schritt 5) ----------
// String: { id, type: "pvstring", name: "2.1.1", mods: [Modul-ids] }. mods = Reihenfolge der Klicks, erstes Modul = + (CJ 14.10.), letztes = −.
// name ist die einzige Quelle: WR, MPPT, Stringnummer und Farbe folgen daraus. Ein Modul gehört zu höchstens einem String.
// Die Kabellinie wird nicht gespeichert, sie läuft durch die Modulmitten und folgt verschobenen Modulen.
// SPA: { id, type: "spa", x, y }, frei gesetzter Punkt mit Beschriftung (Platzhalter bis Phase 2). Beide liegen immer auf der Ebene Verkabelung.
// Bezeichnung WR.MPPT.String, je eine ganze Zahl ab 1 (bis 3 Stellen) → { wr, mppt, str } oder null
export function parseName(name) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(name ?? "").trim());
  if (!m) return null;
  const [wr, mppt, str] = m.slice(1).map(Number);
  return wr && mppt && str ? { wr, mppt, str } : null;
}
// Farbe je String (CJ 14.10.: je String eigene Farbe), feste Liste, gut unterscheidbar. Gleiche Bezeichnung = gleiche Farbe.
// 24 Farben (5ac, CJ 15.10.; Auswahl Claude): die ersten 12 wie bisher (Gelb und Orange dunkler für den Druck), 12 neue.
// Alle mit Kontrast ab 3:1 auf Weiss (gedruckt lesbar), kein Rot wie die Sperrfläche, Farbabstand ΔE76 mindestens 20.
// Platz aus der Bezeichnung: je WR 8 Plätze (2 MPPT × 4 Strings), MPPT 4 Plätze. Bis 3 WR mit je 2 MPPT und 4 Strings: alle verschieden.
export const STRING_COLORS = ["#1f6fd1", "#d06f00", "#2e9d48", "#b03fa3", "#a88400", "#0a9bb0", "#d6335f", "#5a55c9", "#7a5b3a", "#6f9a1c", "#e05a2b", "#3d6b8f",
  "#5a1638", "#2929e0", "#165a3f", "#986416", "#bc29e0", "#5a620e", "#16165a", "#7d3212", "#161698", "#aa4175", "#1f2e51", "#620e62"];
export function stringColor(name) {
  const n = parseName(name);
  return n ? STRING_COLORS[((n.wr - 1) * 8 + (n.mppt - 1) * 4 + (n.str - 1)) % STRING_COLORS.length] : "#6b7785";
}
// Vorschlag für den nächsten String: nach dem zuletzt angelegten die nächste freie Stringnummer am selben MPPT, sonst 1.1.1
// 5ad (CJ 15.10.): Bezeichnungen gelten für die ganze Datei, darum zählen die Strings aller Stringpläne
const fileStrings = (sheet) => { const doc = docSource(); return doc?.sheets.includes(sheet) ? doc.sheets.filter((sh) => sh.kind === "pv").flatMap((sh) => strings(sh).map((st) => ({ st, sh }))) : strings(sheet).map((st) => ({ st, sh: sheet })); };
export function nextName(sheet) {
  const names = new Set(fileStrings(sheet).map((x) => x.st.name));
  const pre = anlageFree().find((n) => !names.has(n)); // Anlage vorbestimmt (5k): erste freie Bezeichnung der Datei
  if (pre) return pre;
  const last = parseName(strings(sheet).at(-1)?.name) ?? { wr: 1, mppt: 1, str: 0 };
  let k = last.str + 1;
  while (names.has(`${last.wr}.${last.mppt}.${k}`)) k++;
  return `${last.wr}.${last.mppt}.${k}`;
}
export const strings = (sheet) => sheet.items.filter((it) => it.type === "pvstring");
// Verkabelung löschen (5m, CJ 15.10.): markierte Strings (ids) oder ohne Markierung alle Strings der Stringpläne.
// SPA und Module bleiben. Stringpläne mit gesperrter Ebene Verkabelung bleiben unverändert. Rückgabe: [{ sheet, st }]
// 5aj (CJ 15.10.): ohne Markierung nur die Strings des offenen Stringplans, darum ruft pvedit.js mit [S.model] auf
export const stringsToClear = (sheets, ids) => sheets.filter((sh) => sh.kind === "pv" && !layerState(sh, "kabel").lock)
  .flatMap((sh) => strings(sh).filter((st) => !ids.size || ids.has(st.id)).map((st) => ({ sheet: sh, st })));
export function clearStrings(list) {
  const gone = new Set(list.map((x) => x.st));
  for (const sh of new Set(list.map((x) => x.sheet))) sh.items = sh.items.filter((it) => !gone.has(it));
}
// Autoverkabelung (Schritt 5j): ab Modul startId in Schlangenlinie über die freien Module, Reihen (dir "h") oder Spalten ("v").
// Reihen/Spalten aus den Modulmitten, Toleranz halbe kurze Modulseite. In der Startreihe ab dem Startmodul zum entfernteren Ende,
// danach Reihe für Reihe zum entfernteren Rand hin, jede Reihe in Gegenrichtung. Rückgabe: Listen von Modul-ids, nur volle Strings.
export function autoStrings(sheet, startId, nStr, perStr, dir) {
  const used = new Set(strings(sheet).flatMap((s) => s.mods)), start = sheet.items.find((m) => m.id === startId);
  if (!start || used.has(startId)) return [];
  const a = dir === "v" ? 0 : 1, b = 1 - a; // a = Achse quer zur Reihe, b = entlang der Reihe
  const free = sheet.items.filter((m) => m.type === "pvmodule" && !used.has(m.id) && visible(sheet, m)).map((m) => ({ id: m.id, c: modCenter(m) }));
  const tol = Math.min(...modSize(start.mt, start.quer)) / 2, lines = [];
  for (const m of free.sort((p, q) => p.c[a] - q.c[a])) {
    const l = lines.at(-1);
    if (l && Math.abs(m.c[a] - l.k) <= tol) l.m.push(m); else lines.push({ k: m.c[a], m: [m] });
  }
  for (const l of lines) l.m.sort((p, q) => p.c[b] - q.c[b]);
  const li = lines.findIndex((l) => l.m.some((m) => m.id === startId)), L = lines[li].m, si = L.findIndex((m) => m.id === startId);
  let fwd = L.length - 1 - si >= si; // in der Startreihe zum entfernteren Ende
  const step = lines.length - 1 - li >= li ? 1 : -1, seq = (fwd ? L.slice(si) : L.slice(0, si + 1).reverse()).map((m) => m.id);
  for (let i = li + step; i >= 0 && i < lines.length; i += step) { fwd = !fwd; const r = lines[i].m.map((m) => m.id); seq.push(...(fwd ? r : r.reverse())); }
  const out = [];
  for (let k = 0; k < nStr && (k + 1) * perStr <= seq.length; k++) out.push(seq.slice(k * perStr, (k + 1) * perStr));
  return out;
}
// String eines Moduls oder undefined
export const stringOf = (sheet, modId) => strings(sheet).find((s) => s.mods.includes(modId));
// Schritt 5c: was das Überfahren eines Moduls mit ⌥ bewirkt. mods = String im Entstehen.
// "add" anhängen, "back" vorletztes Modul = letztes herausnehmen, "same" letztes Modul, "own" schon im String, "other" in einem anderen String
export function hoverStep(sheet, mods, modId) {
  if (mods.at(-1) === modId) return "same";
  if (mods.at(-2) === modId) return "back";
  if (mods.includes(modId)) return "own";
  return stringOf(sheet, modId) ? "other" : "add";
}
// Bezeichnung prüfen. Rückgabe: Fehlertext oder null. skip = String, der umbenannt wird.
export function nameError(sheet, name, skip) {
  if (!parseName(name)) return "Bezeichnung als WR.MPPT.String eingeben, z. B. 2.1.1 (ganze Zahlen ab 1).";
  const dup = fileStrings(sheet).find((x) => x.st !== skip && x.st.name === name.trim());
  if (dup) return dup.sh === sheet ? `Den String ${name.trim()} gibt es auf diesem Plan schon.` : `Den String ${name.trim()} gibt es schon auf Stringplan ${dup.sh.meta?.BLATT || "?"}. Bezeichnungen gelten für die ganze Datei.`;
  return null;
}
// Modulmitte
export function modCenter(m) { const c = modCorners(m); return [(c[0][0] + c[2][0]) / 2, (c[0][1] + c[2][1]) / 2]; }
// Punkte der Kabellinie (Modulmitten in Klickfolge). Die Objekte des Blatts setzt pvedit.js (wie die Modultypen), Tests direkt.
let itemSource = () => [];
export const setItemSource = (fn) => { itemSource = fn; };
export function strPts(it, items = itemSource()) {
  const byId = new Map(items.filter((m) => m.type === "pvmodule").map((m) => [m.id, m]));
  return it.mods.map((id) => byId.get(id)).filter(Boolean).map(modCenter);
}
// Nach dem Löschen von Modulen: fehlende Module aus den Strings entfernen, leere Strings löschen
export function pruneStrings(sheet) {
  const ids = new Set(sheet.items.filter((m) => m.type === "pvmodule").map((m) => m.id));
  for (const s of strings(sheet)) s.mods = s.mods.filter((id) => ids.has(id));
  sheet.items = sheet.items.filter((it) => it.type !== "pvstring" || it.mods.length);
}
// Prüft die Strings eines Stringplans beim Laden. Wirft bei ungültiger oder doppelter Bezeichnung, fehlendem Modul oder Modul in zwei Strings.
export function checkStrings(sheet) {
  const mods = new Set(sheet.items.filter((m) => m.type === "pvmodule").map((m) => m.id)), used = new Set(), names = new Set();
  for (const s of strings(sheet)) {
    if (!parseName(s.name)) throw new Error(`Ein String hat eine ungültige Bezeichnung („${s.name}“).`);
    if (names.has(s.name)) throw new Error(`Der String ${s.name} kommt doppelt vor.`);
    names.add(s.name);
    for (const id of s.mods) {
      if (!mods.has(id)) throw new Error(`Der String ${s.name} verweist auf ein Modul, das fehlt.`);
      if (used.has(id)) throw new Error(`Ein Modul gehört zu zwei Strings (${s.name}).`);
      used.add(id);
    }
  }
}
export const SPA_R = 150; // Radius des SPA-Kreises in mm (Annahme Claude: 1,5 mm bei 1:100)
export const spaBox = (it) => ({ x0: it.x - SPA_R, y0: it.y - SPA_R, x1: it.x + SPA_R + 2.6 * PV_TEXT_H, y1: it.y + SPA_R });

// ---------- Papier und Druckmassstab (Schritt 7) ----------
// sheet.paper = { size: "A4" | "A3" | "A2", quer: true | false, den: n für 1:n }. Fehlt, solange nichts gewählt wurde (Dateien vor Schritt 7 bleiben gleich).
// Papier in mm. Rand 10 mm, unten der Plankopf (Schriftfeld des Schemas, 277 × 15 mm, auf A4 hoch verkleinert), darüber eine Zeile mit Massstab und Papier.
export const PAPERS = { A4: [297, 210], A3: [420, 297], A2: [594, 420] };
export const PAPER_DEF = { size: "A3", quer: true, den: 100 }; // Annahme Claude (❓ CJ)
export const PRINT_M = 10, INFO_H = 5;
export const paperOf = (sheet) => ({ ...PAPER_DEF, ...sheet.paper });
export function paperSize(p) { const [a, b] = PAPERS[p.size]; return p.quer ? [a, b] : [b, a]; }
export const paperLabel = (p) => `${p.size} ${p.quer ? "quer" : "hoch"}`;
// Länge in der Welt (mm) → auf dem Papier (mm). 1:100: 18 000 mm → 180 mm.
export const toPaper = (mm, den) => mm / den;
// Seite: Papier, Massstab des Plankopfs (k ≤ 1), Planfeld in Papier-mm (y nach oben)
export function printArea(p) {
  const [w, h] = paperSize(p), k = Math.min(1, (w - 2 * PRINT_M) / TB_W), y0 = PRINT_M + TB_H * k + INFO_H;
  return { w, h, k, x0: PRINT_M, y0, x1: w - PRINT_M, y1: h - PRINT_M };
}
// Kleinster Normmassstab, bei dem box (Welt-mm) ins Planfeld passt
export function fitDen(box, p) {
  const a = printArea(p), need = Math.max((box.x1 - box.x0) / (a.x1 - a.x0), (box.y1 - box.y0) / (a.y1 - a.y0));
  return STD_DENS.find((d) => d >= need) ?? Math.ceil(need);
}
// Anlage vorbestimmt (Schritt 5k, CJ 15.10.: je Datei): doc.pv.anlage = [{ str: [n1, n2, …] }, …], Eintrag i = WR i+1,
// str[m-1] = Strings an MPPT m (5ah, CJ 15.10.: je MPPT einzeln), 0 bis 99. Anzahl MPPT = Länge, 0 bis 99. Neuer WR: str [] (leer, 5al).
// Fassung vor 5ah { mppt, str } (gleich viele je MPPT) wird beim Laden umgerechnet.
// Bezeichnungen 1.1.1, 1.1.2, 1.2.1 … 2.1.1 …, frei = auf keinem Stringplan der Datei vergeben.
const okN = (v) => Number.isInteger(v) && v >= 1 && v <= 99, ok0 = (v) => Number.isInteger(v) && v >= 0 && v <= 99;
export function cleanAnlage(raw) {
  if (raw === undefined) return undefined;
  const one = (w) => (w && Array.isArray(w.str) && w.str.length <= 99 && w.str.every(ok0) ? { str: [...w.str] } : w && okN(w.mppt) && okN(w.str) ? { str: Array(w.mppt).fill(w.str) } : null);
  const list = Array.isArray(raw) && raw.length && raw.length <= 99 ? raw.map(one) : null;
  if (!list || list.some((w) => !w)) throw new Error("Die Anlage (Wechselrichter, MPPT, Strings) ist defekt.");
  return list;
}
// Erste Fassung (Schritt 5k, nur kurz in v2): { wr, mppt, str } am Stringplan → Liste für die Datei
export const anlageFromSheet = (a) => (a && okN(a.wr) && okN(a.mppt) && okN(a.str) ? Array.from({ length: a.wr }, () => ({ str: Array(a.mppt).fill(a.str) })) : undefined);
export function anlageNames(list, wr) { // wr = nur dieser WR (1 …), sonst alle
  const out = [];
  list.forEach((w, i) => { if (!wr || wr === i + 1) w.str.forEach((n, m) => { for (let s = 1; s <= n; s++) out.push(`${i + 1}.${m + 1}.${s}`); }); });
  return out;
}
let docSource = () => null;
export const setDocSource = (fn) => { docSource = fn; };
// Freie Bezeichnungen der Anlage (eines WR oder aller), über alle Stringpläne der Datei
export function anlageFree(wr) {
  const doc = docSource(), list = doc?.pv?.anlage;
  if (!list) return [];
  const used = new Set(doc.sheets.filter((sh) => sh.kind === "pv").flatMap((sh) => strings(sh).map((s) => s.name)));
  return anlageNames(list, wr).filter((n) => !used.has(n));
}
// Was auf den gedruckten Stringplan kommt (Schritt 5l). Blattfeld hide = ausgeschaltete Teile, fehlt = alles an.
export const PRINT_PARTS = [["bg", "Hintergrundplan"], ["roof", "Dachlinien"], ["fill", "Füllung"], ["keepout", "Sperrflächen"], ["mod", "Module"], ["str", "Strings"], ["name", "Bezeichnungen"], ["pm", "+ und −"], ["spa", "SPA"], ["text", "Texte"], ["head", "Plankopf"], ["north", "Nordpfeil"], ["bar", "Massstabsleiste"]];
// Nur im Druck (kein Objekt am Bildschirm): Plankopf, Nordpfeil, Massstabsleiste
export const PRINT_ONLY = new Set(["head", "north", "bar"]);
export function cleanHide(raw) {
  if (!Array.isArray(raw)) return undefined;
  const h = PRINT_PARTS.map(([k]) => k).filter((k) => raw.includes(k));
  return h.length ? h : undefined;
}
export function cleanPaper(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  return { size: PAPERS[raw.size] ? raw.size : PAPER_DEF.size, quer: raw.quer !== false, den: isNum(raw.den) && raw.den > 0 ? raw.den : PAPER_DEF.den };
}
// Druckmitte (5ao, CJ 15.10.: per Klick im Plan): Blattfeld pmid = [x, y] in Welt-mm. Fehlt = Mitte der sichtbaren Objekte wie bisher.
export const cleanPmid = (raw) => (Array.isArray(raw) && raw.length === 2 && raw.every(isNum) ? [raw[0], raw[1]] : undefined);
// Nordrichtung (5aq, CJ 15.10.): Blattfeld north = Winkel in Grad im Uhrzeigersinn ab oben, bezogen auf den Plan ohne Drehung (0 bis unter 360).
// Fehlt = kein Nordpfeil. Der Pfeil auf dem Druck zeigt north − Drehung des Plans (Drehung im Gegenuhrzeigersinn, rotPt).
export const normNorth = (v) => { const d = Math.round((((v % 360) + 360) % 360) * 1e6) / 1e6; return d === 360 ? 0 : d; };
export const cleanNorth = (raw) => (isNum(raw) ? normNorth(raw) : undefined);
export const northOnPaper = (sheet) => (isNum(sheet.north) ? normNorth(sheet.north - (sheet.bg?.rot || 0)) : null);
// Massstabsleiste (5aq): längste runde Länge (Welt-mm), die auf dem Papier höchstens 60 mm lang ist
export const barLen = (den) => [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].map((m) => m * 1000).filter((L) => L / den <= 60).at(-1) ?? null;
