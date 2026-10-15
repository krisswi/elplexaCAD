// Datenmodell (internes JSON-Format). Koordinaten in mm, y nach oben, Ursprung unten links auf dem Blatt.
import { META_FIELDS } from "./frame.js";
import { SYMBOL_BY_NAME } from "./symbols.js";
import { registerDocSymbols } from "./library.js";
import { parseCable, MAX_TERMINALS } from "./terminals.js";
import { DISPO_LAYERS, PLAN_TYPES, cleanPlanItem } from "./dispo.js";
import { cleanAssets, cleanBg, usedAssets, cleanLayers, cleanPvItem, cleanLayerId, cleanPvDoc, PV_ITEMS, checkStrings, cleanPaper, anlageFromSheet, tidyPv, cleanHide, cleanPmid, cleanNorth } from "./pv.js";

export const FORMAT = "schemacad";
export const VERSION = 6; // 6: mit Stringplan (seit 15.10.2026, Umbau 5ab: gedrehte Module, ältere Stände lehnen ab). 5: mit Titelseite und Inhaltsverzeichnis (kind "title", "toc", titel.js). höchste lesbare Version. 2: mehrere Blätter (sheets), Version 1 (ein Blatt) wird beim Öffnen umgewandelt. 3: wie 2, mit Blättern vom Typ Disposition (nur dann wird 3 geschrieben). 4: mit Stringplan (kind "pv", PDF unter assets) oder Stringübersicht (kind "pvtab").

export const WIRE_KINDS = {
  leitung: { label: "Leitung", layer: "SCH_LEITUNG", dashed: false },
  netz: { label: "Netz (L1, L2, L3)", layer: "SCH_NETZ", dashed: false },
  neutral: { label: "Neutralleiter (gestrichelt)", layer: "SCH_NETZ", dashed: true },
  pe: { label: "Schutzleiter PE", layer: "SCH_PE", dashed: false },
};

// Layer wie im Etappe-0-Demo (Farbe = AutoCAD-Farbindex)
export const LAYERS = {
  SCH_RAHMEN: { color: 7, css: "#17212b" },
  SCH_SCHRIFTFELD: { color: 7, css: "#17212b" },
  SCH_NETZ: { color: 5, css: "#2556b8" },
  SCH_SYMBOLE: { color: 7, css: "#17212b" },
  SCH_LEITUNG: { color: 7, css: "#17212b" },
  SCH_PE: { color: 3, css: "#1b8a4b" },
  SCH_TEXT: { color: 7, css: "#17212b" },
  SCH_KLEMMEN: { color: 7, css: "#17212b" },
  ...DISPO_LAYERS,
};

export function newMeta() {
  const m = {};
  for (const f of META_FIELDS) m[f.tag] = f.def;
  const d = new Date();
  m.DATUM = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  return m;
}

// Ein Blatt: Schriftfeldangaben und Objekte. kind "dispo" = Disposition (Verteileraufbau, freie Fläche in mm), "pv" = Stringplan (pv.js), "pvtab" = Stringübersicht (pvtab.js, ohne eigene Objekte), sonst Schema.
// Eine Disposition trägt eine sid, damit eine Ansicht auf dem Schemablatt ihre Quelle wiederfindet.
export const KINDS = ["dispo", "pv", "pvtab", "title", "toc", "legend"];
export const newSheet = (kind = "schema") => ({ meta: newMeta(), items: [], ...(KINDS.includes(kind) ? { kind } : {}) });
// Ein Dokument: mehrere Blätter, Objekt-IDs gelten im ganzen Dokument (wichtig für Verweise von Blatt zu Blatt)
export const newDoc = () => ({ format: FORMAT, version: 2, active: 0, nextId: 1, sheets: [newSheet()] });

// Prüft eine geladene Datei und gibt ein sauberes Modell zurück. Wirft bei Fehlern mit verständlicher Meldung.
export function parseModel(text) {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error("Die Datei ist kein gültiges JSON."); }
  if (!o || o.format !== FORMAT) throw new Error("Das ist keine SchemaCAD-Datei.");
  if (typeof o.version !== "number" || o.version > VERSION) throw new Error("Die Datei stammt aus einer neueren Version von SchemaCAD.");
  const rawSheets = o.version >= 2 ? o.sheets : [{ meta: o.meta, items: o.items }];
  if (!Array.isArray(rawSheets) || !rawSheets.length) throw new Error("Die Datei enthält kein Blatt.");
  registerDocSymbols(o.symbols);
  const doc = newDoc();
  doc.sheets = [];
  const assets = cleanAssets(o.assets), pv = cleanPvDoc(o.pv), mts = new Set(pv?.moduleTypes.map((t) => t.id));
  let maxId = 0;
  for (const rs of rawSheets) {
    const m = newSheet(KINDS.includes(rs.kind) ? rs.kind : "schema");
    if (m.kind === "title") m.info = cleanInfo(rs.info); // Titelseite: Bauherr, Firma, Logo, Änderungsindex
    if (m.kind === "legend") m.show = cleanShow(rs.show, rs.cols); // Legende: angehakte Spalten (legende.js)
    if (m.kind === "dispo") { m.sid = isNum(rs.sid) ? rs.sid : 0; if (rs.dims === false) m.dims = false; }
    if (m.kind === "pv") { m.sid = isNum(rs.sid) ? rs.sid : 0; const bg = cleanBg(rs.bg, assets); if (bg) m.bg = bg; const ly = cleanLayers(rs.layers); if (ly) m.layers = ly; }
    if (m.kind === "pv") { const pa = cleanPaper(rs.paper); if (pa) m.paper = pa; } // Papier und Druckmassstab (Schritt 7)
    if (m.kind === "pv") { const hi = cleanHide(rs.hide); if (hi) m.hide = hi; } // Druckteile (5l)
    if (m.kind === "pv") { const pm = cleanPmid(rs.pmid), no = cleanNorth(rs.north); if (pm) m.pmid = pm; if (no !== undefined) m.north = no; } // Druckmitte (5ao), Nordrichtung (5aq)
    if (m.kind === "pvtab") { const pa = cleanPaper(rs.paper); if (pa) m.paper = { size: pa.size, quer: pa.quer }; } // Papier der Stringübersicht (5ap), Massstab immer 1:1
    if (rs.pin === true) m.pin = true;
    Object.assign(m.meta, rs.meta || {});
    doc.sheets.push(m);
    maxId = parseItems(rs.items || [], m, maxId);
    if (m.kind === "dispo" && m.items.some((i) => !isDispoItem(i))) throw new Error("Eine Disposition darf nur Bauteile und Texte enthalten.");
    if (m.kind !== "dispo" && m.items.some((i) => PLAN_TYPES.has(i.type))) throw new Error("Bauteile der Disposition gehören auf ein Dispositionsblatt.");
    if (m.kind !== "pv" && m.items.some((i) => PV_ITEMS.has(i.type))) throw new Error("Dachlinien, Sperrflächen und Module gehören auf einen Stringplan.");
    if (m.kind === "pv" && m.items.some((i) => i.type !== "text" && !PV_ITEMS.has(i.type))) throw new Error("Ein Stringplan enthält ein Objekt, das diese Version nicht kennt.");
    if (m.items.some((i) => i.type === "pvmodule" && !mts.has(i.mt))) throw new Error("Ein Modul verweist auf einen Modultyp, der im Katalog fehlt.");
    if (m.kind === "pv") checkStrings(m); // Strings: Bezeichnung, Module (Schritt 5)
    if (m.kind === "pvtab" && m.items.length) throw new Error("Eine Stringübersicht enthält keine eigenen Objekte.");
    if ((m.kind === "title" || m.kind === "toc" || m.kind === "legend") && m.items.length) throw new Error("Titelseite, Inhaltsverzeichnis und Legende enthalten keine eigenen Objekte.");
  }
  for (const sh of doc.sheets) if ((sh.kind === "dispo" || sh.kind === "pv") && !sh.sid) sh.sid = ++maxId;
  if (Object.keys(assets).length) doc.assets = assets;
  const oldAn = !pv?.anlage && rawSheets.map((rs) => rs.kind === "pv" && anlageFromSheet(rs.anlage)).find(Boolean); // erste Fassung 5k: Anlage am Blatt
  if (oldAn) doc.pv = tidyPv({ ...pv, anlage: oldAn }); else if (pv) doc.pv = pv; // Katalog: Modultypen (Schritt 4), WR-Typen, Zuordnung und Tmin (Schritt 6)
  doc.nextId = Math.max(maxId + 1, Number(o.nextId) || 1);
  doc.active = Math.max(0, Math.min(doc.sheets.length - 1, Number(o.active) || 0));
  if (o.noTitle === true) doc.noTitle = true; // Titelseite gelöscht (CJ 15.10.), kommt nicht von selbst wieder
  if (o.noToc === true) doc.noToc = true;
  if (o.info && !doc.sheets.some((s) => s.kind === "title")) doc.info = cleanInfo(o.info); // Angaben einer weggefallenen Titelseite (Gruppe D)
  if (cleanLayerId(o.pvLayer) && o.pvLayer !== "dach") doc.pvLayer = o.pvLayer; // aktive Ebene der Stringpläne (5q), fehlt = Dach
  // Verweise: Verknüpfung nur behalten, wenn die Gegenseite existiert und zurückzeigt
  const all = new Map(doc.sheets.flatMap((s) => s.items).map((i) => [i.id, i]));
  for (const i of all.values()) if (i.link !== undefined && all.get(i.link)?.link !== i.id) delete i.link;
  return doc;
}

// Titelseite (titel.js): Bauherr, Firma, Logo (Bild als data-URL), Änderungsindex
export const INFO_KEYS = ["BAUHERR", "BAUHERR_ADR", "FIRMA", "FIRMA_ADR"];
export function cleanInfo(o) {
  const info = { revs: [] };
  for (const k of INFO_KEYS) info[k] = String(o?.[k] ?? "");
  if (typeof o?.logo === "string" && /^data:image\/(png|jpeg|svg\+xml);base64,/.test(o.logo)) info.logo = o.logo;
  if (Array.isArray(o?.revs)) for (const r of o.revs) info.revs.push({ i: String(r?.i ?? ""), d: String(r?.d ?? ""), t: String(r?.t ?? ""), n: String(r?.n ?? "") });
  return info;
}

// Legende der Sicherungsgruppen (legende.js): Spalten, die neben BMK, Nennstrom und Ort zugeschaltet werden können (CJ 15.10.)
export const LEGEND_KEYS = ["BMK", "STROM", "CHAR", "IDN", "GERAET", "POLE", "GROESSE", "NAME", "KABEL", "KLEMMEN", "ORT"]; // Reihenfolge der Spalten
export const LEGEND_DEFAULT = ["BMK", "STROM", "NAME"]; // CJ 15.10.2026
// show = angehakte Spalten. Altes Feld cols (bis 15.10.: nur die zuschaltbaren, BMK, Nennstrom, Ort fest) wird umgerechnet.
export const cleanShow = (show, cols) => {
  const pick = (a) => LEGEND_KEYS.filter((k) => a.includes(k));
  if (Array.isArray(show)) return pick(show).length ? pick(show) : [...LEGEND_DEFAULT];
  if (Array.isArray(cols)) return pick(["BMK", "STROM", ...cols, "ORT"]);
  return [...LEGEND_DEFAULT];
};

const isDispoItem = (i) => PLAN_TYPES.has(i.type) || i.type === "text";

function parseItems(list, m, maxId) {
  for (const it of list) {
    const id = Number(it.id) || ++maxId;
    maxId = Math.max(maxId, id);
    const plan = PLAN_TYPES.has(it.type) ? cleanPlanItem(it, id) : null, pv = PV_ITEMS.has(it.type) ? cleanPvItem(it, id) : null;
    if (plan) {
      m.items.push(withTag(plan, it));
    } else if (pv) {
      m.items.push(pv);
    } else if (it.type === "dispoview" && [it.x, it.y, it.bx, it.by, it.bw, it.bh].every(isNum) && isNum(it.den) && it.den > 0 && Array.isArray(it.items)) {
      const inner = { items: [] };
      parseItems(it.items, inner, 0);
      if (inner.items.some((i) => !isDispoItem(i))) throw new Error("Die Ansicht der Disposition enthält ungültige Objekte (id " + id + ").");
      const v = { id, type: "dispoview", x: it.x, y: it.y, den: it.den, bx: it.bx, by: it.by, bw: it.bw, bh: it.bh, title: String(it.title ?? ""), items: inner.items };
      if (isNum(it.src)) v.src = it.src;
      if (it.dims === true) v.dims = true;
      m.items.push(withTag(v, it));
    } else if (it.type === "symbol" && SYMBOL_BY_NAME[it.sym] && isNum(it.x) && isNum(it.y)) {
      const attrs = {};
      for (const a of SYMBOL_BY_NAME[it.sym].attrs) attrs[a.tag] = String((it.attrs || {})[a.tag] ?? a.def);
      const o = { id, type: "symbol", sym: it.sym, x: it.x, y: it.y, rot: ((Number(it.rot) || 0) % 360 + 360) % 360, attrs };
      if (it.manual === true) o.manual = true;
      if (isNum(it.link)) o.link = it.link;
      if (isNum(it.rail)) { o.rail = it.rail; o.side = it.side === "l" ? "l" : "r"; o.rname = String(it.rname ?? ""); }
      m.items.push(withTag(o, it));
    } else if (it.type === "wire" && Array.isArray(it.pts) && it.pts.length >= 2 && it.pts.every((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]))) {
      const w = { id, type: "wire", kind: WIRE_KINDS[it.kind] ? it.kind : "leitung", pts: it.pts.map((p) => [p[0], p[1]]) };
      if (isNum(it.bundle)) w.bundle = it.bundle;
      if (it.ends && typeof it.ends === "object") { const ok = (v) => (typeof v === "string" && /^(edge|ref|col:[1-8])$/.test(v) ? v : "edge"); w.ends = { l: ok(it.ends.l), r: ok(it.ends.r) }; }
      m.items.push(withTag(w, it));
    } else if (it.type === "text" && isNum(it.x) && isNum(it.y)) {
      const t = { id, type: "text", x: it.x, y: it.y, h: isNum(it.h) && it.h > 0 ? it.h : 2.5, s: String(it.s ?? "") };
      if (m.kind === "pv" && cleanLayerId(it.layer)) t.layer = it.layer; // Stringplan: Ebene des Textes
      m.items.push(withTag(t, it));
    } else if (it.type === "terminals" && isNum(it.x) && isNum(it.y)) {
      const cable = String(it.cable ?? "");
      const n = parseCable(cable)?.n ?? Math.max(1, Math.min(MAX_TERMINALS, Math.round(Number(it.n)) || 1));
      const t = { id, type: "terminals", x: it.x, y: it.y, cable, n, name: String(it.name ?? ""), bmk: String(it.bmk ?? ""), pe: it.pe === "none" ? "none" : "last" };
      if (isNum(it.of)) t.of = it.of;
      if (it.manual === true) t.manual = true;
      m.items.push(withTag(t, it));
    } else {
      throw new Error("Die Datei enthält ein unbekanntes oder defektes Objekt (id " + id + ").");
    }
  }
  return maxId;
}

const withTag = (o, src) => { if (typeof src.tag === "string" && src.tag) o.tag = src.tag; return o; };
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Version 3 nur, wenn eine Disposition vorkommt, 5 mit Titelseite, 6 immer mit Stringplan oder Stringübersicht (5ab, CJ 15.10.; vorher 4).
// So bleiben Dateien ohne Stringplan mit älteren Ständen lesbar. Dateien mit Version 4 und 5 werden weiter gelesen.
// PDF-Dateien (assets) nur, wenn ein Blatt darauf zeigt. noAssets: ohne PDF (Zwischenspeicher im Browser ist zu klein).
export function serializeModel(m, { noAssets = false } = {}) {
  const sheets = m.sheets || [];
  const usesDispo = sheets.some((sh) => sh.kind === "dispo" || sh.items.some((i) => i.type === "dispoview"));
  const usesPv = sheets.some((sh) => sh.kind === "pv" || sh.kind === "pvtab"), usesDeck = sheets.some((sh) => ["title", "toc", "legend"].includes(sh.kind));
  const { assets: _a, ...rest } = m, assets = noAssets ? {} : usedAssets(m);
  return JSON.stringify({ ...rest, version: usesPv ? 6 : usesDeck ? 5 : usesDispo ? 3 : 2, ...(Object.keys(assets).length ? { assets } : {}) }, null, 1);
}
