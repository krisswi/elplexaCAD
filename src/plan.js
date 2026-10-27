// Modul «Plan» (CJ 23.10.2026, nur elplexaCAD): Elektroplan auf einem Grundriss. Datenmodell und Geometrie ohne DOM, mit node testbar.
// Welt in mm, y nach oben. Ursprung (0|0) = gemeinsamer Nullpunkt aller Plan-Module (später Stockwerke), kein Versatz je Blatt.
// Blatt: { kind: "plan", sid, var?, meta, paper: { size, quer, den }, pmid?: [x, y] (Druckmitte, fehlt = Mitte des Inhalts), layers: [{ id, name, show, lock }], alay, items }.
// Objekte: Wand { id, type: "wall", layer, a: [x, y], b: [x, y], d, mat } (Mittellinie a → b, Dicke d),
// Öffnung { id, type: "opening", wall, t, w, kind, hinge?, side?, br?, h? } (hängt an der Wand, Ebene der Wand; h = Höhe in mm, nur Angabe),
// Mass { id, type: "dim", layer, a, b, off, ref?, ctrl?, soll? } (ref = Wand-id: Mass der Mittellinie, a/b folgen der Wand),
// Symbol { id, type: "sym", layer, key, at: [x, y], r, h?, txt?, ap?, fu?, nr? } (Schritt 2, plansym.js; r Drehung in Grad, h Höhe in cm,
// txt Beschriftung, ap Aufputz, fu/nr Sicherung und Nummer am Hinweispfeil). Symbole hängen nicht an der Wand (wandern nicht mit).
// Leitung { id, type: "line", layer, pts: [[x, y] …] (mind. 2), kind, col?, curve? } (Schritt 3, CJ 24.10.2026; kind = Verlegeart nach 5.110;
// curve: true = geschwungen, glatte Kurve (B-Spline, Punkte = Steuerpunkte), CJ 24.10.2026, Dateiversion 23).
// Kanal/Trasse { id, type: "duct", layer, pts: [[x, y] …] (mind. 2, Mittellinie), w, hatch?, col?, ecol?, txt?, tf? } (CJ 27.10.2026, Dateiversion 29):
// Breite w in echten mm, zwei Aussenkanten (ecol, Vorgabe rot) mit Schraffur dazwischen (col, Vorgabe gelb), Ecken auf Gehrung.
// Aderzahl { id, type: "ader", line, t, txt, tf? } (CJ 27.10.2026, Dateiversion 30): kurzer Querstrich senkrecht zur Leitung mit Text (z. B. 3 oder 5x1.5),
// hängt an der Leitung wie die Öffnung an der Wand (Ebene und Farbe der Leitung), t = Anteil der Länge ab dem ersten Punkt (0 bis 1), wandert mit.
// Hintergrund bg (CJ 24.10.2026, Dateiversion 23): PDF-Seite wie im Stringplan (pv.js: Massstab, Fixpunkt = Nullpunkt, Drehung), liegt auf der Ebene «Hintergrund».
// col (Leitung und Symbol): Farbe nach 5.100, gespeichert nur wenn von der Vorgabe abweichend (Symbol: Kategorie, Leitung: LINE_COL).
import { PAPERS, orthoDir, segX, cleanPmid } from "./pv.js";
import { symDef, PLAN_SYMS } from "./plansym.js";

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
export const hangs = (it) => it.type === "opening" || it.type === "ader"; // hängt an einem anderen Objekt (host), ohne eigene Ebene
export const hostId = (it) => (it.type === "opening" ? it.wall : it.type === "ader" ? it.line : undefined);
export const itemLayer = (sh, it) => (hangs(it) ? sh.items.find((w) => w.id === hostId(it))?.layer : it.layer);
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
export const layerUsed = (sh, id) => sh.items.some((it) => !hangs(it) && it.layer === id);
// Ebene löschen: die letzte bleibt; Objekte darauf gehen mit (Rückfrage im Editor, wenn nicht leer)
export function deleteLayer(sh, id) {
  if (sh.layers.length <= 1 || !layerById(sh, id)) return false;
  const gone = new Set(sh.items.filter((it) => !hangs(it) && it.layer === id).map((it) => it.id));
  sh.items = sh.items.filter((it) => !gone.has(it.id) && !(hangs(it) && gone.has(hostId(it))));
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
export const MATS = [["beton", "Beton"], ["mauer", "Mauerwerk"], ["leicht", "Leichtbau/Gips"], ["doppel", "Doppelschale (Stein, Isolation, Stein)"]]; // beton = Kreuzschraffur, mauer = Schraffur /, leicht = nur Umriss, doppel = zwei Schalen Schraffur / mit Isolation dazwischen
// Doppelschalenmauerwerk (CJ 26.10.2026): Stein st je Schale und Isolation iso in mm, Dicke d = 2 × st + iso (Vorgabe 12 + 8 + 12 = 32 cm)
export const DOPPEL = { st: 120, iso: 80 };
export const doppelD = (st, iso) => 2 * st + iso;
export const OPENINGS = [["tuer", "Tür"], ["fenster", "Fenster"], ["durchgang", "Durchgang"], ["schiebe", "Schiebetür"]];
export const OPEN_H = new Set(["tuer", "fenster", "schiebe"]); // Arten mit Feld «Höhe» (CJ 23.10.2026)
export const PLAN_ITEMS = new Set(["wall", "opening", "dim", "sym", "line", "duct", "ader"]);
// Leitungsarten (Symbolzusammenfassung 5.110). Strichmuster in Papier-mm (× Massstab), flex = durchgezogen mit Welle je Abschnitt.
export const LINE_KINDS = [["decke", "in Decke (durchgezogen)"], ["boden", "in Boden (gestrichelt)"], ["wand", "in Wand (Strich-Punkt)"], ["doppel", "in Doppeldecke (Strich-kurz-kurz)"], ["flex", "flexibel (Welle)"]];
export const LINE_DASH = { decke: null, boden: [3, 1.5], wand: [3, 1, 0.8, 1], doppel: [3, 0.8, 0.6, 0.8, 0.6, 0.8], flex: null };
// Farben (Farbcodes 5.100). Mauern, Öffnungen und Masse bleiben schwarz. Seit 27.10.2026 kräftiger (CJ: Blau zu hell), auf Weiss und im Druck
// gut lesbar (Kontrast zu Weiss ab 4,5:1, Orange 3,3, Gelb 2,3). Bisherige Töne (aus dem PDF gemessen) in PLAN_COLS_OLD: gespeicherte Farben bleiben.
export const PLAN_COLS = [["#0068c9", "Blau – Licht"], ["#d4141c", "Rot – Kraft, Potenzialausgleich"], ["#22862a", "Grün – Notlicht, Telefon, IT"], ["#c80a78", "Rosa – Zutritt, Alarm"],
  ["#e06d00", "Orange – Brandmelde"], ["#8f5214", "Braun – Schwachstrom, Audio"], ["#7b3a96", "Violett – Radio/TV, KNX"], ["#c9a800", "Gelb – Trassen, Kanäle"], ["#000000", "Schwarz"]];
export const PLAN_COLS_OLD = ["#3fbbeb", "#ed3f2a", "#7aba4b", "#e50981", "#f8a724", "#d37c24", "#8d5995", "#f8f191"]; // gleiche Reihenfolge, nur für den Namen
// Name einer Farbe: Palette, bisheriger Ton mit «(bisher)», sonst Hex
export const colName = (c) => PLAN_COLS.find(([x]) => x === c)?.[1].split(" –")[0] ?? (PLAN_COLS_OLD.includes(c) ? `${PLAN_COLS[PLAN_COLS_OLD.indexOf(c)][1].split(" –")[0]} (bisher)` : c);
// Vorgabe der Leitungen: blau (CJ 24.10.2026). Später in den Einstellungen änderbar, deshalb nur hier und über lineCol() gelesen.
export const LINE_COL = "#0068c9";
// Vorgabe aller Symbole: blau (CJ 24.10.2026, vorher nach Kategorie: Kraft rot usw.); die Farbcodes 5.100 bleiben am Objekt wählbar
export const CAT_COL = { licht: LINE_COL, kraft: LINE_COL, kommunikation: LINE_COL, schwach: LINE_COL, allg: LINE_COL, leitung: LINE_COL };
const HEX = /^#[0-9a-f]{6}$/;
export const lineCol = () => LINE_COL;
// Vorgabe und wirksame Farbe eines Objekts
export const defCol = (it) => (it.type === "duct" ? DUCT_COL : it.type === "line" ? lineCol() : it.type === "sym" ? (symDef(it.key).cat === "leitung" ? lineCol() : CAT_COL[symDef(it.key).cat] ?? "#000000") : "#000000");
export const colOf = (it) => it.col ?? defCol(it);
export const hasCol = (it) => it.type === "line" || it.type === "sym" || it.type === "duct";
// Textgrösse (CJ 27.10.2026, Muster Disposition): Faktor tf (1 = Vorgabe), gesamt am Blatt (sh.tf) und einzeln an Symbol, Verweis und Mass (it.tf).
// Der Einzelwert überschreibt den Gesamtwert. Gilt für Beschriftung, Höhe, Verweis-Zeilen und Masstext; Zusatztexte im Symbol (T15, LED, Zahl) bleiben fest.
export const TF_MIN = 0.25, TF_MAX = 4;
const cleanTf = (v) => (isNum(v) && v >= TF_MIN && v <= TF_MAX ? r3(v) : undefined);
export const tfOf = (it, sh) => it.tf ?? sh?.tf ?? 1;
// Farbe setzen: gleich der Vorgabe = Feld entfernen
export function setCol(it, col) { if (!hasCol(it)) return; const c = String(col ?? "").toLowerCase(); if (!HEX.test(c) || c === defCol(it)) delete it.col; else it.col = c; }
// Kanal (CJ 27.10.2026): Breiten zum Wählen (Zahlentasten 1 bis 9 im Werkzeug), Schraffurarten, Farben. Schraffur gelb, Kanten rot (Farbcodes 5.100).
export const DUCT_WS = [20, 40, 60, 100, 200, 300, 400, 500, 600];
export const DUCT_W = 200; // Vorgabe Breite in mm (Annahme)
export const DUCT_MAX = 5000;
export const HATCHES = [["kreuz", "Kreuzschraffur"], ["diag", "Diagonale /"], ["gegen", "Gegendiagonale \\"], ["punkte", "Punkte"], ["gitter", "Gitter (Leiter, Quersprossen)"], ["ohne", "ohne Schraffur"]];
export const DUCT_COL = "#c9a800", DUCT_ECOL = "#d4141c";
export const ecolOf = (it) => it.ecol ?? DUCT_ECOL;
export function setEcol(it, col) { const c = String(col ?? "").toLowerCase(); if (!HEX.test(c) || c === DUCT_ECOL) delete it.ecol; else it.ecol = c; }

// Ein Objekt prüfen (ohne Bezüge auf andere Objekte, die prüft cleanPlanSheet). Gibt das saubere Objekt oder null.
export function cleanPlanObj(it, id) {
  if (it.type === "wall") {
    if (!isPt(it.a) || !isPt(it.b) || !isNum(it.d) || it.d <= 0 || Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]) < EPS) return null;
    const o = { id, type: "wall", layer: String(it.layer ?? ""), a: [it.a[0], it.a[1]], b: [it.b[0], it.b[1]], d: it.d, mat: MATS.some(([k]) => k === it.mat) ? it.mat : "mauer" };
    if (o.mat === "doppel") { o.st = isNum(it.st) && it.st > 0 ? it.st : DOPPEL.st; o.iso = isNum(it.iso) && it.iso >= 0 ? it.iso : DOPPEL.iso; o.d = doppelD(o.st, o.iso); } // Dicke folgt den Schichten
    return o;
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
    const tf = cleanTf(it.tf); if (tf !== undefined) o.tf = tf; // Textgrösse einzeln (auch 1: überschreibt den Gesamtwert)
    return o;
  }
  if (it.type === "sym") {
    const def = symDef(it.key);
    if (!def || !isPt(it.at)) return null;
    const o = { id, type: "sym", layer: String(it.layer ?? ""), key: it.key, at: [it.at[0], it.at[1]], r: isNum(it.r) ? ((Math.round(it.r) % 360) + 360) % 360 : 0 };
    if (isNum(it.h) && it.h >= 0 && it.h !== def.h) o.h = it.h; // nur abweichend von der Standardhöhe gespeichert (CJ 26.10.2026)
    const str = (v, n) => String(v ?? "").trim().slice(0, n);
    if (str(it.txt, 60)) o.txt = str(it.txt, 60);
    if (def.ap && it.ap === true) o.ap = true;
    if (def.ref) { if (str(it.fu, 20)) o.fu = str(it.fu, 20); if (str(it.nr, 20)) o.nr = str(it.nr, 20); }
    const lo = cleanLo(it.lo); if (lo) o.lo = lo;
    const z = sizeOf(it.key); if (z) for (const f of ["w", "t"]) if (z[f] !== undefined && isNum(it[f]) && it[f] >= 10 && it[f] <= 20000 && Math.round(it[f]) !== z[f]) o[f] = Math.round(it[f]); // Grösse in mm, Vorgabe nicht gespeichert
    if (def.num !== undefined && str(it.num, 6) && str(it.num, 6) !== def.num) o.num = str(it.num, 6); // Zahl der Mehrfachsteckdose (CJ 26.10.2026)
    const tf = cleanTf(it.tf); if (tf !== undefined) o.tf = tf;
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
  if (it.type === "ader") {
    if (!isNum(it.line) || !isNum(it.t)) return null;
    const o = { id, type: "ader", line: it.line, t: r3(Math.max(0, Math.min(1, it.t))), txt: String(it.txt ?? "").trim().slice(0, 20) || ADER_DEF };
    const tf = cleanTf(it.tf); if (tf !== undefined) o.tf = tf;
    return o;
  }
  if (it.type === "duct") {
    const pts = (Array.isArray(it.pts) ? it.pts : []).filter(isPt).map((p) => [p[0], p[1]]).filter((p, i, a) => !i || !same(p, a[i - 1]));
    if (pts.length < 2 || !isNum(it.w) || it.w <= 0) return null;
    const o = { id, type: "duct", layer: String(it.layer ?? ""), pts, w: r3(Math.min(DUCT_MAX, it.w)) };
    if (HATCHES.some(([k]) => k === it.hatch) && it.hatch !== "kreuz") o.hatch = it.hatch; // fehlt = Kreuzschraffur
    setCol(o, it.col); setEcol(o, it.ecol);
    const t = String(it.txt ?? "").trim().slice(0, 60); if (t) o.txt = t;
    const tf = cleanTf(it.tf); if (tf !== undefined) o.tf = tf;
    return o;
  }
  return null;
}

// Blattfelder und Objekte aus der Datei. Bereinigung: Objekte auf unbekannter Ebene → aktive Ebene, Öffnung ohne Wand fällt weg,
// Öffnung in die Wand geklemmt, Mass mit fehlender Wand verliert den Bezug. Gibt die höchste id zurück.
// Dateiversion 24 (Plan Schritt 5, CJ 26.10.2026): ältere Stände kennen diese Felder nicht
const OLD_KEYS = new Set(["SCH0", "SCH0_2", "SCH3", "SCH6", "TASTER", "DIMMER", "STOREN", "SCH_LAMPE", "STD", "STD3", "STD_T15", "STD_USB", "STD_BODEN", "KOMBI", "LEUCHTE", "LEUCHTE_EB", "LEUCHTE_W", "LEUCHTE_WEB", "LED", "LED_EB", "LED_W", "BWM", "PIR", "GERAET", "HERD", "BACKOFEN", "MIKRO", "GSP", "KUEHL", "VENT", "BOILER", "DOSE", "EINLASS", "VERTEILER", "ANSCHLUSS", "STEIG_AUF", "STEIG_AB", "STEIG_DURCH", "VERWEIS"]); // Symbole bis Dateiversion 23
export const V24_SYMS = { has: (k) => !!k && !OLD_KEYS.has(k) }; // Symbole, die ältere Stände nicht kennen
export const planV24 = (sh) => sh.items.some((i) => i.lo || i.num !== undefined || (i.type === "sym" && (i.w !== undefined || i.t !== undefined)) || i.mat === "doppel" || V24_SYMS.has(i.key) || (i.ap && !symDef(i.key)?.group?.startsWith("Schalter")));
// Dateiversion 28 (CJ 27.10.2026): Textgrösse gesamt (sh.tf) oder einzeln (it.tf); ältere Stände würden sie still verlieren
export const planV28 = (sh) => sh.tf !== undefined || sh.items.some((i) => i.tf !== undefined);
// Dateiversion 29 (CJ 27.10.2026): Kanal/Trasse (type "duct"); ältere Stände lehnen das Objekt ab
export const planV29 = (sh) => sh.items.some((i) => i.type === "duct");
// Dateiversion 30 (CJ 27.10.2026): Aderzahl an der Leitung (type "ader"); ältere Stände lehnen das Objekt ab
export const planV30 = (sh) => sh.items.some((i) => i.type === "ader");
// Dateiversion eines Planblatts: 20 Plan (23.10.2026), 21 mit Symbolen, 22 mit Leitungen oder Farben, 23 mit PDF-Hintergrund oder geschwungener Leitung (24.10.2026), 24 planV24, 28 planV28, 29 planV29
export const planVer = (sh) => (planV30(sh) ? 30 : planV29(sh) ? 29 : planV28(sh) ? 28 : planV24(sh) ? 24 : sh.bg || sh.items.some((i) => i.curve) ? 23 : sh.items.some((i) => i.type === "line" || i.col !== undefined) ? 22 : sh.items.some((i) => i.type === "sym") ? 21 : 20);
const VERSION_NOW = 30;
export const BG_OP = 60; // Deckkraft des PDF-Plans in %: blass, damit der Elektroplan hervortritt (wie Stringplan)
// ver: Dateiversion. Bis 23 trugen Steckdosen (110) und Wandleuchten (200) ihre Vorgabehöhe fest eingetragen; sie fällt weg (CJ 26.10.2026: keine vorausgefüllte Höhe)
const OLD_H = { STD: 110, STD3: 110, STD_T15: 110, STD_USB: 110, LEUCHTE_W: 200, LEUCHTE_WEB: 200, LED_W: 200 };
export function cleanPlanSheet(rs, m, maxId, ver = VERSION_NOW) {
  m.paper = cleanPlanPaper(rs.paper);
  m.layers = cleanPlanLayers(rs.layers);
  m.alay = layerById(m, rs.alay) ? rs.alay : m.layers[0].id;
  const pm = cleanPmid(rs.pmid); if (pm) m.pmid = pm; // Druckmitte frei gewählt (wie Stringplan 5ao)
  if (rs.bom === false) m.bom = false; // Stückliste nicht drucken (Schritt 4, fehlt = drucken)
  if (rs.bgOff === true) m.bgOff = true; // PDF-Plan ausgeblendet, unabhängig von den Ebenen (CJ 26.10.2026)
  const tf = cleanTf(rs.tf); if (tf !== undefined && tf !== 1) m.tf = tf; // Textgrösse des ganzen Plans, fehlt = 1
  if (isNum(rs.bgOp) && rs.bgOp >= 10 && rs.bgOp <= 100 && Math.round(rs.bgOp) !== BG_OP) m.bgOp = Math.round(rs.bgOp); // Deckkraft in %, fehlt = BG_OP
  if (isNum(rs.sid) && rs.sid > 0) { m.sid = rs.sid; maxId = Math.max(maxId, rs.sid); }
  for (const it of Array.isArray(rs.items) ? rs.items : []) {
    const id = isNum(it?.id) ? it.id : ++maxId;
    maxId = Math.max(maxId, id);
    const o = it && PLAN_ITEMS.has(it.type) ? cleanPlanObj(it, id) : null;
    if (!o) throw new Error("Ein Plan enthält ein unbekanntes oder defektes Objekt (id " + id + ").");
    if (!hangs(o) && !layerById(m, o.layer)) o.layer = m.alay;
    if (ver < 24 && o.type === "sym" && o.h !== undefined && o.h === OLD_H[o.key]) delete o.h;
    m.items.push(o);
  }
  const walls = new Map(m.items.filter((i) => i.type === "wall").map((w) => [w.id, w]));
  m.items = m.items.filter((i) => i.type !== "opening" || walls.has(i.wall));
  for (const o of m.items) if (o.type === "opening") clampOpening(walls.get(o.wall), o);
  const lines = new Set(m.items.filter((i) => i.type === "line").map((i) => i.id));
  m.items = m.items.filter((i) => i.type !== "ader" || lines.has(i.line)); // Aderzahl ohne Leitung fällt weg
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
    const iso = w.mat === "doppel" && w.iso > 0 ? fills.map((f) => clipBand(f, w.a, nl, -w.iso / 2, w.iso / 2)).filter((f) => f.length >= 3) : []; // Isolation mittig, Ecken auf Gehrung wie die Wand
    return { id: w.id, poly, fills, iso, lines: lin.map(([p, q]) => [p.map(r3), q.map(r3)]) };
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
  if (it.type === "line" || it.type === "duct") { it.pts = it.pts.map((p) => [r3(p[0] + dx), r3(p[1] + dy)]); return; }
  if (it.type === "opening") { const w = sh.items.find((x) => x.id === it.wall), u = wallDir(w); it.t += dx * u[0] + dy * u[1]; clampOpening(w, it); return; }
  if (it.type === "ader") { const l = sh.items.find((x) => x.id === it.line); if (l) it.t = aderT(l, add(aderAt(l, it.t).p, [dx, dy])); return; } // gleitet entlang der Leitung
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
    if (it.type === "sym" || it.type === "line" || it.type === "duct") moveItem(sh, it, dx, dy);
    else if (hangs(it) && !ids.has(hostId(it))) moveItem(sh, it, dx, dy);
  }
  fixOpenings(sh);
  syncDims(sh);
}
// Kopie für die Zwischenablage: Objekte samt Öffnungen ihrer Wände; Öffnungen ohne kopierte Wand fallen weg, Masse verlieren fremde Bezüge
export function copyItems(sh, items) {
  const ids = new Set(items.filter((i) => !hangs(i)).map((i) => i.id));
  const out = sh.items.filter((i) => (hangs(i) ? ids.has(hostId(i)) : ids.has(i.id)));
  return JSON.parse(JSON.stringify(out)).map((i) => { if (i.type === "dim" && i.ref !== undefined && !ids.has(i.ref)) delete i.ref; return i; });
}
// Einfügen: neue ids (newId()), um dx/dy versetzt, unbekannte Ebene → aktive Ebene. Gibt die neuen Objekte (schon im Blatt).
export function pasteItems(sh, clip, dx, dy, newId) {
  const map = new Map(clip.map((i) => [i.id, newId()])), out = [];
  for (const c0 of clip) {
    const c = JSON.parse(JSON.stringify(c0)); c.id = map.get(c0.id);
    if (c.type === "opening") c.wall = map.get(c0.wall);
    else if (c.type === "ader") c.line = map.get(c0.line);
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
  if (it.type === "line" || it.type === "duct") return it.pts.every(ins);
  if (it.type === "sym") return ins(symCenter(it, paperOf(sh).den));
  if (it.type === "opening") { const w = sh.items.find((x) => x.id === it.wall); return !!w && ins(add(w.a, wallDir(w), it.t + it.w / 2)); }
  if (it.type === "ader") { const l = sh.items.find((x) => x.id === it.line); return !!l && ins(aderAt(l, it.t).p); }
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
  sh.items = sh.items.filter((i) => i.id !== id && !(hangs(i) && hostId(i) === id));
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
  for (const it of [...items].reverse()) if (it.type === "sym") { const def = itemDef(it, k); if (len(sub(p, symCenter(it, k))) <= def.r * k + tol) return it; } // zuletzt gesetzt zuerst
  const lines = new Map(sh.items.filter((i) => i.type === "line").map((l) => [l.id, l]));
  for (const it of [...items].reverse()) if (it.type === "ader" && lines.has(it.line)) { const g = aderGeom(lines.get(it.line), it, k, tfOf(it, sh)); if (distSeg(p, g.a, g.b) <= tol || len(sub(p, g.at)) <= g.size * Math.max(0.6, it.txt.length * 0.32) + tol) return it; } // Aderzahl vor ihrer Leitung
  for (const it of [...items].reverse()) if (it.type === "line") { const q = linePts(it); if (q.some((x, i) => i && distSeg(p, q[i - 1], x) <= tol)) return it; }
  for (const it of [...items].reverse()) if (it.type === "duct" && it.pts.some((x, i) => i && distSeg(p, it.pts[i - 1], x) <= it.w / 2 + tol)) return it; // Kanal: ganze Breite, unter Leitungen und Symbolen
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
// (nur Wandenden der Liste ends: false). align = { refs, dirs }: Ausrichtungsfang vor Fläche und Raster. segs = Strecken [[a, b]] (nach den Punkten).
export function snapPlan(sh, items, p, { grid = 0, tol = 0, alt = false, ortho, extra = [], segs = [], faces, align } = {}) {
  const on = (q) => (ortho ? orthoPt(ortho, q) : q.map(r3));
  const m = on(p);
  if (alt) return { x: m[0], y: m[1] };
  const walls = items.filter((i) => i.type === "wall");
  const best = (cands, kind) => { let hit = null, bd = tol; for (const c of cands) { const d = len(sub(c, m)); if (d <= bd) { bd = d; const q = on(c); hit = { x: q[0], y: q[1], snap: kind }; } } return hit; };
  const onSegs = (list) => { let hit = null, bd = tol; for (const [a, b] of list) { const v = sub(b, a), l2 = dot(v, v), t = l2 ? Math.max(0, Math.min(1, dot(sub(m, a), v) / l2)) : 0, c = add(a, v, t), d = len(sub(c, m)); if (d <= bd) { bd = d; hit = { x: r3(c[0]), y: r3(c[1]), snap: "edge" }; } } return hit; };
  const onFace = () => onSegs(faces.edges);
  const al = !ortho && align ? alignSnap(m, align.refs, align.dirs, tol) : null;
  return best([...(faces ? faces.corners : walls.flatMap((w) => [w.a, w.b])), ...items.filter((i) => i.type === "dim").flatMap((d) => [d.a, d.b]), ...extra], "end")
    || (segs.length ? onSegs(segs) : null)
    || (al && { x: al.x, y: al.y, snap: "align", guides: al.guides })
    || (faces ? onFace() : best(walls.map((w) => [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]), "mid"))
    || (!faces && !ortho && best(walls.map((w) => { const u = wallDir(w), t = Math.max(0, Math.min(wallLen(w), dot(sub(m, w.a), u))); return add(w.a, u, t); }), "edge"))
    || (grid > 0 ? (([x, y]) => ({ x, y, snap: "grid" }))(on([Math.round(p[0] / grid) * grid, Math.round(p[1] / grid) * grid])) : { x: m[0], y: m[1] });
}
// Symbol: Mitte in der Welt (Papier-mm × Massstab k, gedreht um r)
export function symCenter(it, k) {
  const c = itemDef(it, k).c, a = (it.r * Math.PI) / 180;
  return [it.at[0] + k * (c[0] * Math.cos(a) - c[1] * Math.sin(a)), it.at[1] + k * (c[0] * Math.sin(a) + c[1] * Math.cos(a))];
}
// Fang einer Leitung am Symbol (CJ 26.10.2026), in der Welt, dreht mit r: { pts, segs }. pin: vier Punkte oben, rechts, unten, links am Rand;
// edge: alle Seiten des Kastens (Abzweigdose); sonst die Mitte.
export function symSnaps(it, k) {
  const def = itemDef(it, k), a = (it.r * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
  const w = ([x, y]) => [r3(it.at[0] + k * (x * co - y * si)), r3(it.at[1] + k * (x * si + y * co))];
  if (def.edge) { const [x0, y0, x1, y1] = def.edge, c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(w); return { pts: [], segs: c.map((p, i) => [p, c[(i + 1) % 4]]) }; }
  if (def.pin) { const [cx, cy, r] = def.pin; return { pts: [[cx, cy + r], [cx + r, cy], [cx, cy - r], [cx - r, cy]].map(w), segs: [] }; }
  return { pts: [symCenter(it, k)], segs: [] };
}
// Text lesbar halten: Winkel 0–359 → (-90, 90], flip = um 180° gekippt (sonst stünde er auf dem Kopf)
export function readable(ang) { const a = ((ang % 360) + 360) % 360, flip = a > 90 && a <= 270; return { a: flip ? a - 180 : a > 270 ? a - 360 : a, flip }; }
// Versatz der Beschriftung (CJ 26.10.2026): [x, y] in Papier-mm im System des Symbols (dreht mit R), 0,1 mm genau, höchstens 60 mm; [0, 0] = Standardlage
export function cleanLo(v) {
  if (!Array.isArray(v) || v.length !== 2 || !v.every(isNum)) return null;
  const q = v.map((n) => Math.round(Math.max(-60, Math.min(60, n)) * 10) / 10 + 0);
  return q[0] || q[1] ? q : null;
}
// Verteilung (CJ 26.10.2026): Grösse in echten mm wie Wände und Türen, Breite w entlang der Wand, Tiefe t in den Raum; das Zeichen wächst mit
// Gilt auch für Balkenleuchten (FL …), Vorgaben und Zeichnung in plansym.js (size)
export const sizeOf = (key) => symDef(key)?.size ?? null;
export const symSize = (it) => { const z = sizeOf(it.key); return z ? { w: it.w ?? z.w, ...(z.t !== undefined ? { t: it.t ?? z.t } : {}) } : null; };
// Symboldefinition für ein Objekt: bei Verteilungen Teile, Mitte und Radius aus w und t (Papier-mm = Welt-mm / k)
export function itemDef(it, k, tf = 1) {
  const def = symDef(it.key), z = symSize(it);
  if (def.ref) return { ...def, parts: refParts(it, tf) };
  if (!z) return def;
  const W = z.w / k, T = (z.t ?? 0) / k, r = (n) => Math.round(n * 1000) / 1000;
  return { ...def, parts: def.size.parts(W, T), c: def.wall ? [0, r(T / 2)] : [0, 0], r: r(Math.max(1, Math.hypot(W / 2, def.wall ? T / 2 : T / 2))) };
}
// Hinweis (VERWEIS): Kasten um die Zeilen oben (fu), unten (nr) und Kabel (txt), Mitte = Vorgabe + Versatz lo (Papier-mm im System des Symbols)
const REF_H = 2.2, REF_LH = REF_H * 1.45, REF_DEF = [-8, 4];
// tf: Textgrösse (tfOf), der Kasten wächst mit
export function refBox(it, tf = 1) {
  const rows = [it.fu, it.nr, it.txt].filter(Boolean), lo = it.lo ?? [0, 0], H = REF_H * tf;
  const w = Math.max(5, ...rows.map((s) => s.length * H * 0.62)) + 2 * Math.max(1, tf), h = Math.max(1, rows.length) * REF_LH * tf + 0.6 * tf;
  return { rows: rows.length ? rows : [], x: REF_DEF[0] + lo[0], y: REF_DEF[1] + lo[1], w, h, lh: REF_LH * tf, th: H };
}
function refParts(it, tf = 1) {
  const b = refBox(it, tf), r3 = (n) => Math.round(n * 1000) / 1000, x0 = b.x - b.w / 2, y0 = b.y - b.h / 2, R = 1, out = [];
  out.push(["p", `M${r3(x0 + R)},${r3(y0)}h${r3(b.w - 2 * R)}a${R} ${R} 0 0 1 ${R},${R}v${r3(b.h - 2 * R)}a${R} ${R} 0 0 1 ${-R},${R}h${r3(-(b.w - 2 * R))}a${R} ${R} 0 0 1 ${-R},${-R}v${r3(-(b.h - 2 * R))}a${R} ${R} 0 0 1 ${R},${-R}Z`, false]);
  for (let i = 1; i < b.rows.length; i++) { const y = b.y + ((b.rows.length - 1) / 2 - i + 0.5) * b.lh; out.push(["l", r3(x0), r3(y), r3(x0 + b.w), r3(y)]); } // Trennstrich zwischen den Zeilen
  // Linie vom Ziel (0|0) zum nächsten Punkt auf dem Kastenrand
  const cx = Math.max(x0, Math.min(0, x0 + b.w)), cy = Math.max(y0, Math.min(0, y0 + b.h));
  const inside = cx === 0 && cy === 0, ex = inside ? b.x : cx, ey = inside ? y0 : cy;
  if (Math.hypot(ex, ey) > 0.3) out.push(["l", 0, 0, r3(ex), r3(ey)]);
  return out;
}
// Höhe eines Symbols in cm: eingetragen oder Standardhöhe des Symbols (undefined = ohne)
export const symH = (it) => it.h ?? symDef(it.key)?.h;
// Texte eines Symbols in der Welt (CJ 24.10.2026): drehen mit dem Symbol, stehen nie auf dem Kopf. Zusatztexte (T15, USB, 3, LED) und Verweis
// mittig an ihrem Ort; Beschriftung und Höhe neben der Mitte in Richtung der x-Achse des Symbols (Wandsymbol: entlang der Wand), Zeilen untereinander.
// Gibt [{ at, s, size, a, anchor }] (size und Abstände in Papier-mm × k).
export function symTexts(it, k, fmtH = (h) => String(h), tf = 1) {
  const def = itemDef(it, k, tf), rad = (it.r * Math.PI) / 180, co = Math.cos(rad), si = Math.sin(rad), { a, flip } = readable(it.r);
  const w = (x, y) => [it.at[0] + k * (x * co - y * si), it.at[1] + k * (x * si + y * co)], out = [];
  for (const q of def.parts) if (q[0] === "t") out.push({ at: w(q[1], q[2]), s: q[5] === "num" ? (it.num ?? q[4]) : q[4], size: q[3] * k, a, anchor: "middle" }); // num: Zahl am Symbol änderbar
  if (def.ref) { const b = refBox(it, tf); b.rows.forEach((s, i) => out.push({ at: w(b.x, b.y + ((b.rows.length - 1) / 2 - i) * b.lh * (flip ? -1 : 1)), s, size: b.th * k, a, anchor: "middle", label: true })); return out; } // Hinweis: Zeilen im Kasten, ziehbar wie eine Beschriftung
  // Abstand: hinter dem Symbol und hinter Zusatztexten rechts der Mitte (Breite ca. 0,6 × Höhe je Zeichen)
  const ext = Math.max(def.r, ...def.parts.filter((q) => q[0] === "t").map((q) => q[1] - def.c[0] + q[4].length * q[3] * 0.3));
  const lines = [it.txt, it.h !== undefined && it.h !== def.h ? fmtH(it.h) : ""].filter(Boolean), c = symCenter(it, k), d = (ext + 0.6) * k, sg = flip ? -1 : 1;
  const [lx, ly] = it.lo ?? [0, 0], ox = k * (lx * co - ly * si), oy = k * (lx * si + ly * co); // Versatz dreht mit dem Symbol
  lines.forEach((s, i) => { const o = ((lines.length - 1) / 2 - i) * 2.2 * tf * k * sg; out.push({ at: [c[0] + co * d - si * o + ox, c[1] + si * d + co * o + oy].map(r3), s, size: 1.8 * tf * k, a, anchor: flip ? "end" : "start", label: true }); });
  return out;
}
// Trifft p die Beschriftung (Bezeichnung, Höhe) eines Symbols? Kasten je Zeile: Breite ca. 0,6 × Höhe je Zeichen, ab dem Ankerpunkt.
export function labelHit(it, k, p, tol, fmtH, tf = 1) {
  return symTexts(it, k, fmtH, tf).some((t) => {
    if (!t.label) return false;
    const r = (t.a * Math.PI) / 180, dx = p[0] - t.at[0], dy = p[1] - t.at[1], u = dx * Math.cos(r) + dy * Math.sin(r), v = -dx * Math.sin(r) + dy * Math.cos(r), wd = t.s.length * t.size * 0.6;
    return (t.anchor === "end" ? u >= -wd - tol && u <= tol : u >= -tol && u <= wd + tol) && Math.abs(v) <= t.size / 2 + tol;
  });
}
// Stückliste (Schritt 4, CJ 24.10.2026): Anzahl je Symbol auf sichtbaren Ebenen, Reihenfolge wie die Palette. Leitungen zählen nicht.
// Symbole mit Aufputz-Variante getrennt nach UP und AP (CJ 26.10.2026), UP zuerst. Danach Kanäle je Breite (CJ 27.10.2026): Anzahl und
// Gesamtlänge m in Metern (Mittellinie, echte mm der Welt, also unabhängig vom Druckmassstab), schmal zuerst.
export function bomOf(sh) {
  const n = new Map(), id = (key, ap) => `${key}${ap ? ":ap" : ""}`, ducts = new Map();
  for (const it of sh.items) if (it.type === "sym" && isVisible(sh, it)) { const k = id(it.key, it.ap && symDef(it.key).ap); n.set(k, (n.get(k) ?? 0) + 1); }
  for (const it of sh.items) if (it.type === "duct" && isVisible(sh, it)) { const d = ducts.get(it.w) ?? { n: 0, mm: 0 }; d.n++; d.mm += ductLen(it); ducts.set(it.w, d); }
  return PLAN_SYMS.flatMap((d) => (d.ap ? [false, true] : [false]).filter((ap) => n.has(id(d.key, ap)))
    .map((ap) => ({ key: d.key, label: d.ap ? `${d.label}, ${ap ? "AP" : "UP"}` : d.label, group: d.group, n: n.get(id(d.key, ap)), ...(ap ? { ap } : {}) })))
    .concat([...ducts].sort((x, y) => x[0] - y[0]).map(([w, d]) => ({ key: `duct:${w}`, duct: w, label: `Kanal ${fmtLen(w)} mm`, group: "Kanäle", n: d.n, m: Math.round(d.mm / 10) / 100 })));
}
// CSV wie die übrigen Listen: Semikolon, Text in Anführungszeichen wenn nötig. Mit Kanälen eine Spalte «Länge m» (Dezimalkomma).
export function bomCsv(rows) {
  const q = (s) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s), m = rows.some((r) => r.m !== undefined);
  return [`Gruppe;Symbol;Anzahl${m ? ";Länge m" : ""}`, ...rows.map((r) => `${q(r.group)};${q(r.label)};${r.n}${m ? `;${r.m !== undefined ? r.m.toFixed(2).replace(".", ",") : ""}` : ""}`)].join("\r\n") + "\r\n";
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
  const pts = sh.items.flatMap((i) => (i.type === "sym" ? (({ r }, c) => [add(c, [r * k, r * k]), add(c, [-r * k, -r * k])])(itemDef(i, k), symCenter(i, k)) : i.type === "wall" ? [add(i.a, [i.d, i.d]), add(i.a, [-i.d, -i.d]), add(i.b, [i.d, i.d]), add(i.b, [-i.d, -i.d])] : i.type === "dim" ? dimLine(i).slice(0, 2).concat([i.a, i.b]) : i.type === "line" ? linePts(i) : i.type === "duct" ? (({ L, R }) => [...L, ...R])(ductSides(i.pts, i.w)) : []));
  if (!pts.length) return null;
  return { x0: Math.min(...pts.map((q) => q[0])), y0: Math.min(...pts.map((q) => q[1])), x1: Math.max(...pts.map((q) => q[0])), y1: Math.max(...pts.map((q) => q[1])) };
}
// ---------- Geschwungene Leitung (CJ 24.10.2026, B-Spline CJ 26.10.2026) ----------
// Glatte Kurve als kubischer B-Spline: die Punkte sind Steuerpunkte, die Kurve läuft durch Anfang und Ende, sonst nur in die Nähe der Punkte
// und wird nie wellig (liegt in der Hülle der Punkte). Enden: gespiegelter Hilfspunkt, so beginnt die Kurve gerade in Richtung des zweiten Punkts
// (zwei Punkte = Gerade). Je Abschnitt ein kubisches Bézier [p1, c1, c2, p2], Anzahl = Punkte − 1.
export function curveSegs(pts) {
  const n = pts.length, q = [add(pts[0], sub(pts[0], pts[1])), ...pts, add(pts[n - 1], sub(pts[n - 1], pts[n - 2]))], out = [];
  const mix = (a, b, c, wa, wb, wc) => [0, 1].map((j) => (wa * a[j] + wb * b[j] + wc * c[j]) / (wa + wb + wc));
  for (let i = 1; i < n; i++) {
    const [q0, q1, q2, q3] = q.slice(i - 1, i + 3);
    out.push([mix(q0, q1, q2, 1, 4, 1), mix(q1, q2, q2, 2, 1, 0), mix(q1, q2, q2, 1, 2, 0), mix(q1, q2, q3, 1, 4, 1)]);
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

// ---------- Kanal/Trasse (CJ 27.10.2026) ----------
// Aussenkanten L (links von der Zeichenrichtung) und R im Abstand w/2 von der Mittellinie. Ecken auf Gehrung: der Punkt liegt auf der
// Winkelhalbierenden, Abstand w/2 / cos(halber Knick); bei sehr spitzem Knick höchstens MITRE × w/2 (sonst schiesst die Ecke weit hinaus).
const MITRE = 4;
export function ductSides(pts, w) {
  const h = w / 2, n = pts.length, dirs = [], L = [], R = [];
  for (let i = 1; i < n; i++) { const v = sub(pts[i], pts[i - 1]), l = len(v) || 1; dirs.push([v[0] / l, v[1] / l]); }
  for (let i = 0; i < n; i++) {
    const n0 = normal(dirs[Math.max(0, i - 1)]), n1 = normal(dirs[Math.min(n - 2, i)]), m0 = [n0[0] + n1[0], n0[1] + n1[1]], lm = len(m0);
    const m = lm < 1e-9 ? n0 : [m0[0] / lm, m0[1] / lm], d = Math.min(h / Math.max(dot(m, n0), 1e-9), MITRE * h);
    L.push(add(pts[i], m, d).map(r3)); R.push(add(pts[i], m, -d).map(r3));
  }
  return { L, R };
}
export const ductLen = (it) => it.pts.reduce((s, p, i) => (i ? s + len(sub(p, it.pts[i - 1])) : s), 0);
// Abstand der Schraffur in Welt-mm: halbe Breite, aber nie enger als 1,5 mm auf dem Papier (k = Massstab), so bleibt sie im Druck und beim
// Zoomen ruhig (eigene Linien statt Füllmuster, kein Moiré). Gitter: Sprossen im doppelten Abstand.
export const ductStep = (w, k) => Math.max(w / 2, 1.5 * k);
// Strecke p→q auf ein konvexes Vieleck beschneiden (Cyrus-Beck); null wenn ausserhalb
function clipSeg(p, q, poly) {
  let t0 = 0, t1 = 1;
  const d = sub(q, p), cw = poly.reduce((s, a, i) => { const b = poly[(i + 1) % poly.length]; return s + (b[0] - a[0]) * (b[1] + a[1]); }, 0) > 0; // Umlaufsinn
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], e = sub(b, a), nin = cw ? [e[1], -e[0]] : [-e[1], e[0]]; // Normale nach innen
    const num = dot(nin, sub(p, a)), den = dot(nin, d);
    if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [add(p, d, t0).map(r3), add(p, d, t1).map(r3)];
}
const inPoly = (p, poly) => { let s0 = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); if (Math.abs(c) < 1e-9) continue; if (s0 && Math.sign(c) !== s0) return false; s0 = Math.sign(c); } return true; };
// Zeichnung eines Kanals in der Welt: { L, R, quads, lines: Schraffurlinien [[p, q] …], dots: Punkte, r: Punktradius }. Je Abschnitt ein Viereck
// (Gehrung an den Knicken), die Schraffur läuft über die Länge weiter (Lage ab dem Anfang des Kanals) und wird je Viereck beschnitten.
export function ductGeom(it, k) {
  const { L, R } = ductSides(it.pts, it.w), h = it.w / 2, hatch = it.hatch ?? "kreuz", sp = ductStep(it.w, k), lines = [], dots = [], quads = [];
  let s0 = 0;
  for (let i = 1; i < it.pts.length; i++) {
    const a = it.pts[i - 1], v = sub(it.pts[i], a), l = len(v), u = [v[0] / l, v[1] / l], nl = normal(u), quad = [L[i - 1], L[i], R[i], R[i - 1]];
    quads.push(quad);
    const loc = (s, q) => add(add(a, u, s - s0), nl, q); // s ab Anfang des Kanals, q quer (links +)
    const ss = quad.map((p) => dot(sub(p, a), u) + s0), lo = Math.min(...ss), hi = Math.max(...ss), H = 2 * h;
    const fam = (sg) => { for (let c = Math.floor((lo - H) / sp) * sp; c <= hi + H; c += sp) { const x = clipSeg(loc(c - sg * H, -H), loc(c + sg * H, H), quad); if (x && len(sub(x[1], x[0])) > 1e-6) lines.push(x); } };
    if (hatch === "kreuz" || hatch === "diag") fam(1);
    if (hatch === "kreuz" || hatch === "gegen") fam(-1);
    if (hatch === "gitter") for (let c = Math.ceil(lo / (2 * sp)) * 2 * sp; c <= hi; c += 2 * sp) { const x = clipSeg(loc(c, -H), loc(c, H), quad); if (x && len(sub(x[1], x[0])) >= it.w - 1e-6) lines.push(x); } // nur ganze Sprossen (in der Gehrung keine Stummel)
    if (hatch === "punkte") {
      const rows = Math.max(0, Math.floor((h - sp / 4) / sp)), qs = h > sp / 2 ? Array.from({ length: 2 * rows + 1 }, (_, j) => (j - rows) * sp) : [0]; // Reihen im Abstand sp, mittig
      for (let c = Math.ceil(lo / sp) * sp; c <= hi; c += sp) for (const q of qs) { const p = loc(c + (Math.abs(q / sp) % 2 ? sp / 2 : 0), q).map(r3); if (inPoly(p, quad)) dots.push(p); } // versetzt wie Mauerwerk
    }
    s0 += l;
  }
  return { L, R, quads, lines, dots, r: r3(Math.min(0.3 * k, it.w / 6)) };
}
// Beschriftung: Mitte des längsten Abschnitts, links neben dem Kanal (gegen den Uhrzeigersinn gedreht = über dem Kanal bei Zeichnung nach rechts)
export function ductLabel(it, k, tf = 1) {
  let i0 = 1, best = -1;
  for (let i = 1; i < it.pts.length; i++) { const l = len(sub(it.pts[i], it.pts[i - 1])); if (l > best) { best = l; i0 = i; } }
  const a = it.pts[i0 - 1], b = it.pts[i0], u = [(b[0] - a[0]) / best, (b[1] - a[1]) / best], { a: ang, flip } = readable(Math.atan2(u[1], u[0]) * 180 / Math.PI);
  const size = 2 * tf * k, off = it.w / 2 + 0.6 * k + size / 2, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], nl = normal(u);
  return { at: add(m, nl, flip ? -off : off).map(r3), a: ang, size };
}

export { segX, normal };

// ---------- Aderzahl an der Leitung (CJ 27.10.2026) ----------
export const ADER_DEF = "3";
export const ADER_TXTS = ["2", "3", "4", "5", "7"]; // Vorschläge, frei eingebbar (z. B. 5x1.5)
// Punkt und Einheitsrichtung (Tangente) beim Anteil t der Länge eines Linienzugs q
export function polyAt(q, t) {
  const ls = q.map((p, i) => (i ? len(sub(p, q[i - 1])) : 0)), tot = ls.reduce((a, b) => a + b, 0);
  let s = Math.max(0, Math.min(1, t)) * tot;
  for (let i = 1; i < q.length; i++) {
    if (!ls[i]) continue;
    if (s <= ls[i] || i === q.length - 1) { const v = sub(q[i], q[i - 1]), u = [v[0] / ls[i], v[1] / ls[i]], f = Math.min(1, s / ls[i]); return { p: add(q[i - 1], v, f), u }; }
    s -= ls[i];
  }
  return { p: q[0], u: [1, 0] };
}
// Anteil t (0 bis 1) des Punkts auf dem Linienzug q, der p am nächsten liegt, und Abstand d
export function polyNear(q, p) {
  const ls = q.map((x, i) => (i ? len(sub(x, q[i - 1])) : 0)), tot = ls.reduce((a, b) => a + b, 0) || 1;
  let best = { t: 0, d: Infinity }, s0 = 0;
  for (let i = 1; i < q.length; i++) {
    const v = sub(q[i], q[i - 1]), l2 = dot(v, v), f = l2 ? Math.max(0, Math.min(1, dot(sub(p, q[i - 1]), v) / l2)) : 0, d = len(sub(p, add(q[i - 1], v, f)));
    if (d < best.d) best = { t: (s0 + f * ls[i]) / tot, d };
    s0 += ls[i];
  }
  return { t: r3(best.t), d: best.d };
}
export const aderAt = (line, t) => polyAt(linePts(line), t);
export const aderT = (line, p) => polyNear(linePts(line), p).t;
// Zeichnung in der Welt: Strich a–b senkrecht zur Leitung (2,4 mm Papier), Text darüber (lesbar, entlang der Leitung), Grösse 2 mm × tf
export const ADER_H = 1.2, ADER_TH = 2;
export function aderGeom(line, it, k, tf = 1) {
  const { p, u } = aderAt(line, it.t), ra = readable((Math.atan2(u[1], u[0]) * 180) / Math.PI).a, rad = (ra * Math.PI) / 180, n = [-Math.sin(rad), Math.cos(rad)]; // n = «oben» des Texts
  const size = ADER_TH * tf;
  return { p, a: add(p, n, -ADER_H * k), b: add(p, n, ADER_H * k), at: add(p, n, (ADER_H + 0.5 + size / 2) * k), size: size * k, ang: ra };
}
// Liegt p in einem der Kanäle (Mittellinie ± halbe Breite)? Aderzahl im Kanal: Text mit weissem Rand (CJ 27.10.2026)
export const inDuct = (ducts, p) => ducts.some((d) => d.pts.some((x, i) => i && distSeg(p, d.pts[i - 1], x) <= d.w / 2));

// ---------- Symbol an Symbol (CJ 27.10.2026) ----------
// Randpunkte als Kasten im System des Symbols (Papier-mm): Mitte cx, cy, halbe Breite hx, hy. pin: Kreis bzw. Bogen, edge: Kasten. Ohne beides null.
export function symRim(key) {
  const d = symDef(key);
  if (d?.pin) { const [cx, cy, r] = d.pin; return { cx, cy, hx: r, hy: r, wall: d.wall }; }
  if (d?.edge) { const [x0, y0, x1, y1] = d.edge; return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hx: (x1 - x0) / 2, hy: (y1 - y0) / 2, wall: d.wall }; }
  return null;
}
// Symbol key bündig an ein Nachbarsymbol aus items legen: gleiche Drehung wie der Nachbar, Rand an Rand an einer seiner vier Seiten (rechts, links,
// oben, unten im System des Nachbarn; Wandsymbole nicht unten, dort ist die Wand). Nebeneinander bleiben Wandsymbole auf der Wandlinie (Ursprung), sonst stehen die Mitten auf einer Linie.
// p = freie Lage des Ursprungs, k = Massstab, reach = wie weit p von der Lage am Nachbarn weg sein darf (fehlt: halbe Grösse des Symbols).
// Lagen, die ein drittes Symbol überdecken, fallen weg. Gibt { at, r, nb (id), c (Berührpunkt) } oder null.
export function symSnapTo(items, key, p, k, reach) {
  const A = symRim(key); if (!A) return null;
  const syms = items.filter((i) => i.type === "sym" && symRim(i.key)), R0 = reach ?? Math.max(A.hx, A.hy) * k;
  const mid = (it) => { const B = symRim(it.key), a = (it.r * Math.PI) / 180; return { c: [it.at[0] + k * (B.cx * Math.cos(a) - B.cy * Math.sin(a)), it.at[1] + k * (B.cx * Math.sin(a) + B.cy * Math.cos(a))], h: Math.min(B.hx, B.hy) * k }; };
  let best = null;
  for (const n of syms) {
    const B = symRim(n.key), a = (n.r * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
    const w = ([x, y]) => [r3(n.at[0] + k * (x * co - y * si)), r3(n.at[1] + k * (x * si + y * co))];
    const dy = A.wall && B.wall ? 0 : B.cy - A.cy; // nebeneinander
    const sides = [[B.cx + B.hx + A.hx - A.cx, dy, [B.cx + B.hx, B.cy]], [B.cx - B.hx - A.hx - A.cx, dy, [B.cx - B.hx, B.cy]],
      [B.cx - A.cx, B.cy + B.hy + A.hy - A.cy, [B.cx, B.cy + B.hy]], [B.cx - A.cx, B.cy - B.hy - A.hy - A.cy, [B.cx, B.cy - B.hy]]];
    for (const [x, y, cp] of sides) {
      if (B.wall && cp[1] < B.cy) continue; // unter einem Wandsymbol liegt die Wand
      const at = w([x, y]), d = len(sub(at, p));
      if (d > R0 || (best && d >= best.d)) continue;
      const cA = add(at, [k * (A.cx * co - A.cy * si), k * (A.cx * si + A.cy * co)]), hA = Math.min(A.hx, A.hy) * k;
      if (syms.some((o) => { if (o === n) return false; const m = mid(o); return len(sub(cA, m.c)) < 0.9 * (hA + m.h); })) continue; // kein Überlappen
      best = { at, r: n.r, nb: n.id, c: w(cp), d };
    }
  }
  return best && { at: best.at, r: best.r, nb: best.nb, c: best.c };
}
