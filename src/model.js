// Datenmodell (internes JSON-Format). Koordinaten in mm, y nach oben, Ursprung unten links auf dem Blatt.
import { META_FIELDS } from "./frame.js";
import { SYMBOL_BY_NAME, bmkLetter, isDevice } from "./symbols.js";
import { registerDocSymbols } from "./library.js";
import { parseCable, MAX_TERMINALS, cleanLab } from "./terminals.js";
import { cleanCtrl } from "./steuerung.js";
import { DISPO_LAYERS, PLAN_TYPES, cleanPlanItem } from "./dispo.js";
import { syncMains, cleanMain } from "./hauptlinien.js";
import { splitWandlerDoc } from "./wandler.js";
import { cleanShape, isColor, SHAPE_LAYER } from "./formen.js";
import { cleanAssets, cleanBg, usedAssets, cleanLayers, cleanPvItem, cleanLayerId, cleanPvDoc, PV_ITEMS, checkStrings, cleanPaper, anlageFromSheet, tidyPv, cleanHide, cleanPmid, cleanNorth, cleanStrk } from "./pv.js";
import { cleanAdr, cleanGwr } from "./gwr.js";

export const FORMAT = "schemacad";
export const VERSION = 19; // 19: Prinzipschema (kind "prinzip", Symbole PZ_*), seit 21.10.2026. // 18: Modulstatus (doc.mods[Modul].st) und eigene Reihenfolge der Module (.o), seit 20.10.2026. // 17: Text ausgerichtet (al), Klemmentexte (lab, vert), Steuerkasten (ctrl), seit 19.10.2026. // 16: Module mehrfach (Blattfeld var, Namen doc.mods), seit 18.10.2026. // 15: freies Zeichnen im Schema (shape: Linie, Rechteck, Kreis) oder Textfarbe (c), seit 18.10.2026. // 14: Wandlermessung in Einzelteilen nach BKW (ZW_CT, ZW_SICH, ZW_PK, ZW_PK1, ZW_ZAEHLER2) oder gedrehter Text (r), seit 17.10.2026. // 13: Stringplan mit Leitungen (pvline) und Punkten (pvpoint), seit 17.10.2026. // 12: Disposition mit freier Schiene (free), Schiene N/PE/PEN (BAR), Zuleitung (cable), Beschriftung (beschr), Vertigroup NH1–NH3 oder mit Wandler (wr, wl), seit 16.10.2026. 11: 11: Eingangsverdrahtung (Hauptlinien main.l "feed", HAK_TNCS_1, HPAS_1P), seit 16.10.2026.
// 10: // 10: Wandlermessung in Teilen (ZW_WANDLER, ZW_ZAEHLER, Leitungen mit of/wm) oder Klemmenleiste ohne Klemmen (noterm), seit 16.10.2026. // 9: Disposition mit NH-Hersteller (maker), Textzeilen (lines) oder Textgrösse (tf) (seit 16.10.2026; Stände mit 8 lehnen ab, statt die Angaben still zu verlieren). 8: Disposition mit Schrank, Teilen oder neuen Geräteangaben (seit 16.10.2026, schrank.js; ältere Stände lehnen ab statt still zu verlieren). 7: 7: Hauptlinien neu (seit 16.10.2026, Blatt main, Gruppenverweise mit main; ältere Stände lehnen ab, sonst entstünden doppelte Verweise). 6: mit Stringplan (seit 15.10.2026, Umbau 5ab: gedrehte Module, ältere Stände lehnen ab). 5: mit Titelseite und Inhaltsverzeichnis (kind "title", "toc", titel.js). höchste lesbare Version. 2: mehrere Blätter (sheets), Version 1 (ein Blatt) wird beim Öffnen umgewandelt. 3: wie 2, mit Blättern vom Typ Disposition (nur dann wird 3 geschrieben). 4: mit Stringplan (kind "pv", PDF unter assets) oder Stringübersicht (kind "pvtab").

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
  SCH_NETZ: { color: 7, css: "#17212b" }, // schwarz wie die übrigen Leitungen (CJ 16.10., vorher blau)
  SCH_SYMBOLE: { color: 7, css: "#17212b" },
  SCH_LEITUNG: { color: 7, css: "#17212b" },
  SCH_PE: { color: 3, css: "#1b8a4b" },
  SCH_TEXT: { color: 7, css: "#17212b" },
  SCH_KLEMMEN: { color: 7, css: "#17212b" },
  [SHAPE_LAYER]: { color: 7, css: "#17212b" }, // freie Formen (formen.js), Farbe am Objekt
  ...DISPO_LAYERS,
};

// elplexaCAD: Projektdaten aus der Übersicht (doc.project.meta) gelten auch für neue Blätter. Setzt elplexaCAD bei jedem Dokumentwechsel.
// typeof: Node-Tests laden model.js ohne esbuild-define.
let projMeta = null;
export function setProjectMeta(m) { projMeta = m || null; }
export function newMeta() {
  const m = {};
  for (const f of META_FIELDS) m[f.tag] = f.def;
  if (typeof ELPLEXA !== "undefined" && ELPLEXA && projMeta) Object.assign(m, projMeta);
  const d = new Date();
  m.DATUM = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  return m;
}

// Ein Blatt: Schriftfeldangaben und Objekte. kind "dispo" = Disposition (Verteileraufbau, freie Fläche in mm), "pv" = Stringplan (pv.js), "pvtab" = Stringübersicht (pvtab.js, ohne eigene Objekte),
// "prinzip" = Prinzipschema (prinzip.js, einpolig, Papier-mm), sonst Schema.
// Eine Disposition trägt eine sid, damit eine Ansicht auf dem Schemablatt ihre Quelle wiederfindet.
export const KINDS = ["dispo", "pv", "pvtab", "prinzip", "title", "toc", "legend"];
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
    if (m.kind === "dispo") { m.sid = isNum(rs.sid) ? rs.sid : 0; if (rs.dims === false) m.dims = false; if (rs.doors === false) m.doors = false; // Fenster „Ansicht“
      if (isNum(rs.dimH) && rs.dimH > 0) m.dimH = rs.dimH; if (isNum(rs.dimP) && rs.dimP > 0) m.dimP = rs.dimP; // Masstext im Plan und auf dem Schema (seit 16.10.2026)
      if (Array.isArray(rs.dimsOff) && rs.dimsOff.length) m.dimsOff = rs.dimsOff.filter((k) => typeof k === "string"); // ausgeblendete automatische Masse
      if (Number.isInteger(rs.ins) && rs.ins >= 1 && rs.ins <= 99) m.ins = rs.ins; } // übergebene Dispo zwischen den Blättern von Schema-Modul ins (D3, 19.10.2026)
    if (m.kind === "pv") { m.sid = isNum(rs.sid) ? rs.sid : 0; const bg = cleanBg(rs.bg, assets); if (bg) m.bg = bg; const ly = cleanLayers(rs.layers); if (ly) m.layers = ly; }
    if (m.kind === "pv") { const pa = cleanPaper(rs.paper); if (pa) m.paper = pa; } // Papier und Druckmassstab (Schritt 7)
    if (m.kind === "pv") { const hi = cleanHide(rs.hide); if (hi) m.hide = hi; } // Druckteile (5l)
    if (m.kind === "pv") { const pm = cleanPmid(rs.pmid), no = cleanNorth(rs.north); if (pm) m.pmid = pm; if (no !== undefined) m.north = no; const sk = cleanStrk(rs.strk); if (sk) m.strk = sk; } // Druckmitte (5ao), Nordrichtung (5aq), Grösse Stringbeschriftung (5bb)
    if (m.kind === "pvtab") { const pa = cleanPaper(rs.paper); if (pa) m.paper = { size: pa.size, quer: pa.quer }; } // Papier der Stringübersicht (5ap), Massstab immer 1:1
    if (m.kind === "prinzip") { const pa = cleanPaper(rs.paper); if (pa) m.paper = { size: pa.size, quer: rs.paper.quer === true }; } // Papier des Prinzipschemas, fehlt = A4 hoch (prinzip.js)
    if (!["title", "toc", "legend"].includes(m.kind) && Number.isInteger(rs.var) && rs.var >= 2 && rs.var <= 99) m.var = rs.var; // Modul Nr. (CJ 18.10.2026), fehlt = 1
    if (rs.pin === true) m.pin = true;
    if (!m.kind) { if (isNum(rs.sid)) { m.sid = rs.sid; maxId = Math.max(maxId, rs.sid); } if (rs.main) m.main = cleanMain(rs.main); } // Hauptlinien (hauptlinien.js): Ziel über sid
    Object.assign(m.meta, rs.meta || {});
    doc.sheets.push(m);
    maxId = parseItems(rs.items || [], m, maxId);
    if (m.kind === "dispo" && m.items.some((i) => !isDispoItem(i))) throw new Error("Eine Disposition darf nur Bauteile und Texte enthalten.");
    if (m.kind !== "dispo" && m.items.some((i) => PLAN_TYPES.has(i.type))) throw new Error("Bauteile der Disposition gehören auf ein Dispositionsblatt.");
    if (m.kind !== "pv" && m.items.some((i) => PV_ITEMS.has(i.type))) throw new Error("Dachlinien, Sperrflächen und Module gehören auf einen Stringplan.");
    if (m.kind === "pv" && m.items.some((i) => i.type !== "text" && !PV_ITEMS.has(i.type))) throw new Error("Ein Stringplan enthält ein Objekt, das diese Version nicht kennt.");
    if (m.items.some((i) => i.type === "pvmodule" && !mts.has(i.mt))) throw new Error("Ein Modul verweist auf einen Modultyp, der im Katalog fehlt.");
    if (m.kind === "pv") checkStrings(m); // Strings: Bezeichnung, Module (Schritt 5)
    if (m.kind === "prinzip" && m.items.some((i) => !PRINZIP_ITEMS.has(i.type))) throw new Error("Ein Prinzipschema enthält nur Symbole, Leitungen, Texte und Formen.");
    if (m.kind === "pvtab" && m.items.length) throw new Error("Eine Stringübersicht enthält keine eigenen Objekte.");
    if ((m.kind === "title" || m.kind === "toc" || m.kind === "legend") && m.items.length) throw new Error("Titelseite, Inhaltsverzeichnis und Legende enthalten keine eigenen Objekte.");
  }
  for (const sh of doc.sheets) if ((sh.kind === "dispo" || sh.kind === "pv") && !sh.sid) sh.sid = ++maxId;
  if (typeof ELPLEXA !== "undefined" && ELPLEXA) for (const sh of doc.sheets) if (!sh.kind && !sh.sid) sh.sid = ++maxId; // elplexaCAD: feste Kennung auch fürs Schemablatt (Notizen im Teilen-Link, 20.10.2026); v3 behält sie
  if (Object.keys(assets).length) doc.assets = assets;
  const oldAn = !pv?.anlage && rawSheets.map((rs) => rs.kind === "pv" && anlageFromSheet(rs.anlage)).find(Boolean); // erste Fassung 5k: Anlage am Blatt
  if (oldAn) doc.pv = tidyPv({ ...pv, anlage: oldAn }); else if (pv) doc.pv = pv; // Katalog: Modultypen (Schritt 4), WR-Typen, Zuordnung und Tmin (Schritt 6)
  doc.nextId = Math.max(maxId + 1, Number(o.nextId) || 1);
  doc.active = Math.max(0, Math.min(doc.sheets.length - 1, Number(o.active) || 0));
  splitWandlerDoc(doc); // alte Wandlermessung (ein Symbol) in Wandlerteil, Zähler und Leitungen zerlegen
  const mods = cleanMods(o.mods);
  if (mods) { for (const k of Object.keys(mods)) if (!doc.sheets.some((sh) => modOf(sh) === k)) delete mods[k]; } // Eintrag ohne Modul (z. B. gelöscht in älterem Stand) würde auf ein neues Modul gleicher Kennung übergehen
  if (mods && Object.keys(mods).length) doc.mods = mods; // Namen der Module, PV: Strings fortsetzen (18.10.2026)
  if (o.noTitle === true) doc.noTitle = true; // Titelseite gelöscht (CJ 15.10.), kommt nicht von selbst wieder
  if (o.noToc === true) doc.noToc = true;
  if (typeof ELPLEXA !== "undefined" && ELPLEXA) { const pj = cleanProject(o.project); if (pj) doc.project = pj; } // elplexaCAD: Name, Status, Projektdaten, Zeit (SchemaCAD v3 liest das nicht)
  if (o.info && !doc.sheets.some((s) => s.kind === "title")) doc.info = cleanInfo(o.info); // Angaben einer weggefallenen Titelseite (Gruppe D)
  if (cleanLayerId(o.pvLayer) && o.pvLayer !== "dach") doc.pvLayer = o.pvLayer; // aktive Ebene der Stringpläne (5q), fehlt = Dach
  // Verweise: Verknüpfung nur behalten, wenn die Gegenseite existiert und zurückzeigt
  const all = new Map(doc.sheets.flatMap((s) => s.items).map((i) => [i.id, i]));
  for (const i of all.values()) if (i.link !== undefined && all.get(i.link)?.link !== i.id) delete i.link;
  syncMains(doc); // alte Dateien: Hauptlinien umrechnen
  return doc;
}

// Module mehrfach (CJ 18.10.2026): ein Modul = Blätter einer Art (Schema mit Titelseite, Inhalt; Disposition; PV mit Stringübersicht)
// Legende als eigenes Modul (CJ 21.10.2026): Kennung „legende“, immer nur eines, entsteht mit dem Schema (titel.js ensureDeck).
// und gleicher Nummer var (fehlt = 1). Kennung „schema“, „dispo“, „pv“ für Nr. 1, sonst „pv:2“. doc.mods[Kennung] = { name, cont }:
// name = eigener Name (z. B. „Schema HV“), cont = PV: Strings fortsetzen nach dem PV-Modul mit dieser Nummer.
export const MOD_LABELS = { schema: "Schema", dispo: "Disposition", pv: "PV-Stringplan", prinzip: "Prinzipschema", legende: "Legende" };
export const modBase = (sh) => (sh.kind === "dispo" ? "dispo" : sh.kind === "pv" || sh.kind === "pvtab" ? "pv" : sh.kind === "prinzip" ? "prinzip" : sh.kind === "legend" ? "legende" : "schema");
export const modKey = (base, v) => (v > 1 ? `${base}:${v}` : base);
export const modOf = (sh) => modKey(modBase(sh), ["title", "toc", "legend"].includes(sh.kind) ? 1 : sh.var || 1);
export const modVar = (id) => Number(String(id).split(":")[1]) || 1;
export const modName = (doc, id) => doc.mods?.[id]?.name || `${MOD_LABELS[String(id).split(":")[0]]}${modVar(id) > 1 ? ` ${modVar(id)}` : ""}`;
// Modulstatus (CJ 20.10.2026), Reihenfolge wie hier; „Offen“ ist der Standard und steht nicht in der Datei
export const MOD_STATUS = ["Offen", "In Arbeit", "Geprüft", "Versendet", "Revision", "Archiviert"];
const MOD_ID = /^((schema|dispo|pv|prinzip)(:([2-9]|[1-9]\d))?|legende)$/;
export function cleanMods(o) {
  if (!o || typeof o !== "object") return null;
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (!MOD_ID.test(k) || !v || typeof v !== "object") continue;
    const e = {};
    if (typeof v.name === "string" && v.name.trim()) e.name = v.name.trim().slice(0, 80);
    if (k.startsWith("pv") && Number.isInteger(v.cont) && v.cont >= 1 && v.cont <= 99 && v.cont !== modVar(k)) e.cont = v.cont;
    if (MOD_STATUS.includes(v.st) && v.st !== MOD_STATUS[0]) e.st = v.st;
    if (Number.isInteger(v.o) && v.o >= 1 && v.o <= 99) e.o = v.o; // Platz in der Übersicht; Module ohne Platz folgen in der Standardfolge
    if (Object.keys(e).length) out[k] = e;
  }
  return Object.keys(out).length ? out : null;
}

// elplexaCAD (CJ 17.10.2026): Projekt in der Datei. name, status (feste Liste), meta = Projektdaten fürs Schriftfeld, time = Zeiteinträge, online = Online-Kopie.
export const projectStatus = () => ["Offerte", "In Arbeit", "Abgegeben", "Abgeschlossen"];
export const PROJECT_META = () => ["OBJEKT", "AUFTRAG", "INDEX"];
export function cleanProject(o) {
  if (!o || typeof o !== "object") return null;
  const p = {};
  if (typeof o.name === "string" && o.name.trim()) p.name = o.name.trim().slice(0, 200);
  if (projectStatus().includes(o.status)) p.status = o.status;
  if (o.meta && typeof o.meta === "object") { const m = {}; for (const k of PROJECT_META()) if (typeof o.meta[k] === "string") m[k] = o.meta[k]; if (Object.keys(m).length) p.meta = m; }
  if (Array.isArray(o.time)) {
    const t = o.time.filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.d) && isNum(e.h) && e.h > 0 && e.h <= 24).map((e) => ({ d: e.d, h: e.h, n: String(e.n ?? "").slice(0, 500) }));
    if (t.length) p.time = t;
  }
  // Automatische Zeit (CJ 18.10.2026): id = Kennung fürs Sichern im Browser, auto = vorläufige Einträge { k, d, s Sekunden, m Module, x „ok“/„weg“ = übernommen/verworfen }
  if (typeof o.id === "string" && /^[a-z0-9]{6,20}$/.test(o.id)) p.id = o.id;
  if (Array.isArray(o.auto)) {
    const a = o.auto.filter((e) => e && /^[a-z0-9]{4,16}$/.test(e.k) && /^\d{4}-\d{2}-\d{2}$/.test(e.d) && isNum(e.s) && e.s >= 0 && e.s <= 86400)
      .map((e) => ({ k: e.k, d: e.d, s: Math.round(e.s), m: (Array.isArray(e.m) ? e.m : []).filter((x) => ["schema", "dispo", "pv", "prinzip", "legende"].includes(x)), ...(e.x === "ok" || e.x === "weg" ? { x: e.x } : {}) }));
    if (a.length) p.auto = a;
  }
  // Adresse und GWR (CJ 19.10.2026, gwr.js)
  const adr = cleanAdr(o.adr), gwr = cleanGwr(o.gwr);
  if (adr) p.adr = adr;
  if (gwr) p.gwr = gwr;
  // Online-Kopie (Schritt 3): ID der Zeile und Stand beim letzten Online-Speichern, für die Konfliktprüfung
  if (o.online && /^[0-9a-f-]{36}$/.test(o.online.id) && typeof o.online.at === "string") p.online = { id: o.online.id, at: o.online.at };
  return Object.keys(p).length ? p : null;
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

const PRINZIP_ITEMS = new Set(["symbol", "wire", "text", "shape"]);
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
      if (it.doors === false) v.doors = false;
      if (isNum(it.dimP) && it.dimP > 0) v.dimP = it.dimP;
      if (Array.isArray(it.off) && it.off.length) v.off = it.off.filter((k) => typeof k === "string");
      m.items.push(withTag(v, it));
    } else if (it.type === "symbol" && SYMBOL_BY_NAME[it.sym] && isNum(it.x) && isNum(it.y)) {
      const attrs = {};
      for (const a of SYMBOL_BY_NAME[it.sym].attrs) attrs[a.tag] = String((it.attrs || {})[a.tag] ?? a.def);
      const o = { id, type: "symbol", sym: it.sym, x: it.x, y: it.y, rot: ((Number(it.rot) || 0) % 360 + 360) % 360, attrs };
      if (it.manual === true || ownBmk(o, m.meta.BLATT)) o.manual = true;
      if (isNum(it.link)) o.link = it.link;
      if (it.main === "l" || it.main === "r") o.main = it.main; // Verweis der Grundverkabelung (hauptlinien.js)
      if (typeof it.bez === "string" && it.bez) o.bez = it.bez; // Bezeichnung in der Legende für Geräte ohne eigene Klemmen, z. B. RCD über dem LS (CJ 16.10.)
      if (isNum(it.of)) o.of = it.of; // Zähler der Wandlermessung gehört zum Wandlerteil (wandler.js)
      if (isNum(it.rail)) { o.rail = it.rail; o.side = it.side === "l" ? "l" : "r"; o.rname = String(it.rname ?? ""); }
      m.items.push(withTag(o, it));
    } else if (it.type === "wire" && Array.isArray(it.pts) && it.pts.length >= 2 && it.pts.every((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]))) {
      const w = { id, type: "wire", kind: WIRE_KINDS[it.kind] ? it.kind : "leitung", pts: it.pts.map((p) => [p[0], p[1]]) };
      if (isNum(it.bundle)) w.bundle = it.bundle;
      if (isNum(it.of) && Number.isInteger(it.wm) && it.wm >= 0) { w.of = it.of; w.wm = it.wm; } // Leiter der Wandlermessung (wandler.js)
      if (it.ends && typeof it.ends === "object") { const ok = (v) => (typeof v === "string" && /^(edge|ref|end|col:[1-8])$/.test(v) ? v : "edge"); w.ends = { l: ok(it.ends.l), r: ok(it.ends.r) }; }
      m.items.push(withTag(w, it));
    } else if (it.type === "text" && isNum(it.x) && isNum(it.y)) {
      const t = { id, type: "text", x: it.x, y: it.y, h: isNum(it.h) && it.h > 0 ? it.h : 2.5, s: String(it.s ?? "") };
      if (m.kind === "pv" && cleanLayerId(it.layer)) t.layer = it.layer; // Stringplan: Ebene des Textes
      if (isNum(it.r) && it.r % 360) t.r = ((it.r % 360) + 360) % 360; // gedreht (Leiterfarben der Wandlermessung, seit 17.10.)
      if (isColor(it.c)) t.c = it.c; // Farbe (formen.js, seit 18.10.2026)
      if (it.al === "c" || it.al === "r") t.al = it.al; // Ausrichtung mittig/rechts (seit 19.10.2026)
      m.items.push(withTag(t, it));
    } else if (it.type === "ctrl" && cleanCtrl(it, id)) {
      m.items.push(withTag(cleanCtrl(it, id), it)); // Steuerkasten mit freien Klemmen (steuerung.js, seit 19.10.2026)
    } else if (it.type === "shape" && cleanShape(it, id)) {
      m.items.push(withTag(cleanShape(it, id), it)); // Linie, Rechteck, Kreis (formen.js)
    } else if (it.type === "terminals" && isNum(it.x) && isNum(it.y)) {
      const cable = String(it.cable ?? "");
      const n = parseCable(cable)?.n ?? Math.max(1, Math.min(MAX_TERMINALS, Math.round(Number(it.n)) || 1));
      const t = { id, type: "terminals", x: it.x, y: it.y, cable, n, name: String(it.name ?? ""), bmk: String(it.bmk ?? ""), pe: it.pe === "none" ? "none" : "last" };
      if (isNum(it.of)) t.of = it.of;
      if (it.manual === true) t.manual = true;
      if (it.noterm === true) t.noterm = true; // keine Klemmen zeichnen, BMK, Kabel und Bezeichnung bleiben (CJ 16.10.)
      if (Array.isArray(it.lab) && it.lab.some((v) => cleanLab(v))) t.lab = it.lab.slice(0, MAX_TERMINALS).map(cleanLab); // Klemmentexte (seit 19.10.2026)
      if (it.vert === true) t.vert = true; // Klemmentexte senkrecht
      m.items.push(withTag(t, it));
    } else {
      throw new Error("Die Datei enthält ein unbekanntes oder defektes Objekt (id " + id + ").");
    }
  }
  return maxId;
}

// SPD und Zähler haben erst seit 16.10.2026 eine automatische BMK: ein früher von Hand eingetragener Wert bleibt (gilt als manuell),
// wenn er weder die Vorgabe (F?, P?) noch die automatische Form (Blatt, Buchstabe, Spalte) hat.
function ownBmk(o, blatt) {
  const sym = SYMBOL_BY_NAME[o.sym], letter = bmkLetter(sym), v = String(o.attrs.BMK ?? "").trim();
  if (!letter || isDevice(sym) || !v || v === sym.attrs.find((a) => a.tag === "BMK")?.def) return false;
  const esc = String(blatt ?? "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return !new RegExp(`^${esc}${letter}\\d+(\\.\\d+)?$`).test(v);
}
const withTag = (o, src) => { if (typeof src.tag === "string" && src.tag) o.tag = src.tag; return o; };
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Version 7, sobald ein Schemablatt Hauptlinien hat (Gruppe L1 bis N). Sonst: Version 3 nur, wenn eine Disposition vorkommt, 5 mit Titelseite, 6 immer mit Stringplan oder Stringübersicht (5ab, CJ 15.10.; vorher 4).
// So bleiben Dateien ohne Stringplan mit älteren Ständen lesbar. Dateien mit Version 4 und 5 werden weiter gelesen.
// PDF-Dateien (assets) nur, wenn ein Blatt darauf zeigt. noAssets: ohne PDF (Zwischenspeicher im Browser ist zu klein).
export function serializeModel(m, { noAssets = false } = {}) {
  const sheets = m.sheets || [];
  const usesDispo = sheets.some((sh) => sh.kind === "dispo" || sh.items.some((i) => i.type === "dispoview"));
  const usesPv = sheets.some((sh) => sh.kind === "pv" || sh.kind === "pvtab"), usesDeck = sheets.some((sh) => ["title", "toc", "legend"].includes(sh.kind));
  const { assets: _a, ...rest } = m, assets = noAssets ? {} : usedAssets(m);
  const usesSchrank = sheets.some((sh) => [...sh.items, ...sh.items.flatMap((i) => (i.type === "dispoview" ? i.items : []))].some((i) => i.type === "cabinet" || i.type === "part" || i.type === "dim" || (i.type === "device" && (i.top || i.l2 || i.n))))
    || sheets.some((sh) => sh.dimH || sh.dimP || sh.dimsOff || sh.items.some((i) => i.type === "dispoview" && (i.dimP || i.off))); // Bemassung einstellbar (16.10.2026)
  const usesV9 = sheets.some((sh) => [...sh.items, ...sh.items.flatMap((i) => (i.type === "dispoview" ? i.items : []))].some((i) => i.tf || (i.type === "part" && (i.maker || i.lines)))); // NH-Hersteller, Textzeilen, Textgrösse (16.10.2026)
  const usesV10 = sheets.some((sh) => sh.items.some((i) => i.noterm || i.of !== undefined && i.type !== "terminals")); // Wandlermessung in Teilen, Klemmen ausgeblendet (16.10.2026)
  const usesV11 = sheets.some((sh) => sh.main?.l === "feed" || sh.items.some((i) => i.sym === "HAK_TNCS_1" || i.sym === "HPAS_1P"));
  const usesV12 = sheets.some((sh) => [...sh.items, ...sh.items.flatMap((i) => (i.type === "dispoview" ? i.items : []))].some((i) => i.free || i.beschr || i.type === "cable"
    || (i.type === "part" && (i.kind === "BAR" || i.maker === "vgw" || (i.maker === "vertigroup" && /^\d-\d$/.test(i.size)))))); // Disposition 16.10.2026 (Bau-Chat Dispo)
  const usesV13 = sheets.some((sh) => sh.strk || sh.items.some((i) => i.type === "pvline" || i.type === "pvpoint")); // Stringplan: Leitungen, Punkte (5ax, 5ay), Grösse Stringbeschriftung (5bb)
  const usesV14 = sheets.some((sh) => sh.items.some((i) => (i.type === "text" && i.r) || /^ZW_(CT|SICH|PK1?|ZAEHLER2)$/.test(i.sym || ""))); // Wandlermessung BKW, gedrehte Texte (17.10.2026)
  const usesV15 = sheets.some((sh) => sh.items.some((i) => i.type === "shape" || (i.type === "text" && i.c))); // freies Zeichnen, Textfarbe (18.10.2026)
  const usesV16 = sheets.some((sh) => sh.var) || !!m.mods; // Module mehrfach (18.10.2026): ältere Stände würden Module vermischen
  const usesV17 = sheets.some((sh) => sh.items.some((i) => (i.type === "text" && i.al) || (i.type === "terminals" && (i.lab || i.vert)) || i.type === "ctrl")) || sheets.some((sh) => sh.ins); // Wünsche CJ 19.10.2026: Textausrichtung, Klemmentexte, Steuerkasten, Dispo im Schema (ins)
  const usesV18 = Object.values(m.mods || {}).some((e) => e.st || e.o); // Modulstatus, Reihenfolge (20.10.2026)
  const usesV19 = sheets.some((sh) => sh.kind === "prinzip"); // Prinzipschema (21.10.2026): ältere Stände machten daraus still ein Schemablatt
  return JSON.stringify({ ...rest, version: usesV19 ? 19 : usesV18 ? 18 : usesV17 ? 17 : usesV16 ? 16 : usesV15 ? 15 : usesV14 ? 14 : usesV13 ? 13 : usesV12 ? 12 : usesV11 ? 11 : usesV10 ? 10 : usesV9 ? 9 : usesSchrank ? 8 : sheets.some((sh) => sh.main) ? 7 : usesPv ? 6 : usesDeck ? 5 : usesDispo ? 3 : 2, ...(Object.keys(assets).length ? { assets } : {}) }, null, 1);
}
