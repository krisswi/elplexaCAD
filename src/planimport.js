// Plan-Import (CJ 30.10.2026, nur elplexaCAD): ein Stockwerk aus einer .elplexa.json in den offenen Plan (als neue Ebenen) oder als neuer Plan.
// Ohne DOM, mit node testbar. Ablauf: readImport (Datei lesen, Planblätter) → scanImport (unbekannte Symbole und Farben) → prepareImport
// (Zuordnung anwenden, mit parseModel prüfen) → mergePlan (gewählte Ebenen mit Versatz und Drehung um den Nullpunkt der Datei einfügen).
// Bedienung (Dialog, Vorschau am Mauszeiger, R, Enter, Esc) in planedit.js. Nur planedit.js lädt diese Datei, im v3-Bau fällt sie weg.
import { parseModel } from "./model.js";
import * as P from "./plan.js";
import { symDef } from "./plansym.js";

const HEX = /^#[0-9a-f]{6}$/;
const r3 = (n) => Math.round(n * 1000) / 1000 + 0;
const COL_FIELDS = ["col", "ecol", "fill"]; // Farben am Objekt: Strich/Symbol, Kanten des Kanals, Füllung der Form
// Farbe bekannt = Palette 5.100 oder bisheriger Ton (PLAN_COLS_OLD); andere gültige Hex-Farben fragt der Dialog ab
export const knownCol = (c) => P.PLAN_COLS.some(([x]) => x === c) || P.PLAN_COLS_OLD.includes(c);

// Datei lesen. Gibt { o, plans: [{ i, label, n }] } (i = Stelle in o.sheets) oder wirft mit deutscher Meldung.
export function readImport(text) {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error("Die Datei ist kein gültiges JSON."); }
  if (!o || typeof o !== "object" || !Array.isArray(o.sheets)) throw new Error("Das ist keine elplexaCAD-Datei.");
  const plans = o.sheets.map((rs, i) => ({ rs, i })).filter(({ rs }) => rs?.kind === "plan");
  if (!plans.length) throw new Error("Die Datei enthält keinen Plan.");
  return { o, plans: plans.map(({ rs, i }, k) => ({ i, label: `Plan ${rs.meta?.BLATT || k + 1}`, n: Array.isArray(rs.items) ? rs.items.length : 0 })) };
}

// Unbekannte Symbole (key fehlt in PLAN_SYMS) und Farben (nicht in der Palette) eines Planblatts, mit Anzahl. Sortiert nach Häufigkeit.
export function scanImport(o, i) {
  const syms = new Map(), cols = new Map(), add = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (const it of o.sheets[i]?.items || []) {
    if (it?.type === "sym" && !symDef(it.key)) add(syms, String(it.key ?? ""));
    for (const f of COL_FIELDS) { const c = String(it?.[f] ?? "").toLowerCase(); if (HEX.test(c) && !knownCol(c)) add(cols, c); }
  }
  const list = (m) => [...m].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n || a.k.localeCompare(b.k));
  return { syms: list(syms), cols: list(cols) };
}

// Zuordnung anwenden und das Blatt mit parseModel prüfen. symMap/colMap: { alt: neu }, neu = "" heisst überspringen
// (Symbol fällt weg, Farbe bleibt). Fehlt ein unbekanntes Symbol in symMap, fällt es ebenfalls weg. Gibt { sheet, assets, skipped }.
export function prepareImport(o, i, symMap = {}, colMap = {}) {
  const rs = JSON.parse(JSON.stringify(o.sheets[i]));
  let skipped = 0;
  rs.items = (Array.isArray(rs.items) ? rs.items : []).filter((it) => {
    if (it?.type !== "sym" || symDef(it.key)) return true;
    const k = symMap[String(it.key ?? "")];
    if (k && symDef(k)) { it.key = k; return true; }
    skipped++;
    return false;
  });
  for (const it of rs.items) for (const f of COL_FIELDS) { const c = String(it?.[f] ?? "").toLowerCase(); if (colMap[c]) it[f] = colMap[c]; }
  const doc = parseModel(JSON.stringify({ format: o.format, version: o.version, nextId: o.nextId, sheets: [rs], ...(o.assets ? { assets: o.assets } : {}) }));
  return { sheet: doc.sheets[0], assets: doc.assets || {}, skipped };
}

// Ebenen eines Blatts mit Anzahl Objekte (Öffnung und Aderzahl zählen nicht, sie hängen an Wand und Leitung)
export const layerCounts = (sh) => sh.layers.map((l) => ({ ...l, n: sh.items.filter((it) => !P.hangs(it) && it.layer === l.id).length }));

// Objekte der gewählten Ebenen (mit Öffnungen und Aderzahlen ihrer Wände und Leitungen), als Kopie
export function pickItems(sh, ids) {
  const keep = new Set(sh.items.filter((it) => !P.hangs(it) && ids.has(it.layer)).map((it) => it.id));
  return JSON.parse(JSON.stringify(sh.items.filter((it) => keep.has(it.id) || (P.hangs(it) && keep.has(P.hostId(it))))));
}

// Drehen um den Nullpunkt der Datei (rot = 0, 90, 180, 270 Grad gegen den Uhrzeigersinn), dann um at verschieben. Ändert die Objekte.
export function placeItems(items, at = [0, 0], rot = 0) {
  const q = (((Math.round(rot / 90)) % 4) + 4) % 4;
  const tp = (p) => { let [x, y] = p; for (let n = 0; n < q; n++) [x, y] = [-y, x]; return [r3(x + at[0]), r3(y + at[1])]; };
  const tr = (it) => { const r = ((it.r ?? 0) + q * 90) % 360; if (r || it.type === "sym") it.r = r; else delete it.r; };
  for (const it of items) {
    if (it.type === "wall" || it.type === "dim") { it.a = tp(it.a); it.b = tp(it.b); }
    else if (it.type === "sym" || it.type === "text") { it.at = tp(it.at); tr(it); }
    else if (it.type === "room") it.at = tp(it.at); // Raumname bleibt waagrecht
    else if (it.type === "line" || it.type === "duct") it.pts = it.pts.map(tp);
    else if (it.type === "shape") {
      if (it.k === "line") it.pts = it.pts.map(tp);
      else if (it.k === "circle") [it.x, it.y] = tp([it.x, it.y]);
      else if (it.k === "rect") { const a = tp([it.x, it.y]), b = tp([it.x + it.w, it.y + it.h]); Object.assign(it, { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: r3(Math.abs(b[0] - a[0])), h: r3(Math.abs(b[1] - a[1])) }); }
    }
  }
  return items;
}

// Name ohne Kollision: «Apparate», sonst «Apparate 2», «Apparate 3» …
export function freeName(name, taken) {
  const t = new Set(taken);
  if (!t.has(name)) return name;
  for (let n = 2; ; n++) if (!t.has(`${name} ${n}`)) return `${name} ${n}`;
}

// Gewählte Ebenen (ids) von src in target einfügen. Jede Ebene wird neu angelegt, zuoberst (Name mit Zähler, sichtbar/gesperrt wie in der
// Datei), ausser «Hintergrund» (bg) auf einen leeren Hintergrund: dann landet der Grundriss dort (Grundriss-Werkzeuge gelten nur auf bg).
// Die aktive Ebene der Datei wird aktiv, wenn sie dabei ist. Objekte bekommen neue ids (nextId), Bezüge (Öffnung → Wand, Aderzahl → Leitung,
// Mass → Wand) folgen. Wirft, wenn die Ebenen keinen Platz haben (höchstens MAX_LAYERS). Gibt { layers: [ids der Ebenen], items }.
export function mergePlan(target, src, ids, at, rot, nextId) {
  const chosen = src.layers.filter((l) => ids.has(l.id));
  const reuseBg = chosen.some((l) => l.id === "bg") && !!P.layerById(target, "bg") && !P.layerUsed(target, "bg");
  const need = chosen.length - (reuseBg ? 1 : 0);
  if (target.layers.length + need > P.MAX_LAYERS) throw new Error(`Zu viele Ebenen: Der Plan hat ${target.layers.length}, dazu kämen ${need}, erlaubt sind ${P.MAX_LAYERS}. Weniger Ebenen wählen oder als neuen Plan importieren.`);
  const lmap = new Map();
  for (const l of chosen) {
    if (l.id === "bg" && reuseBg) { Object.assign(P.layerById(target, "bg"), { show: l.show, lock: l.lock }); lmap.set("bg", "bg"); continue; }
    const nl = { id: P.newLayerId(target), name: freeName(l.name, target.layers.map((x) => x.name)), show: l.show, lock: l.lock };
    target.layers.push(nl); lmap.set(l.id, nl.id);
  }
  const items = placeItems(pickItems(src, ids), at, rot), imap = new Map(items.map((it) => [it.id, nextId()]));
  for (const it of items) {
    it.id = imap.get(it.id);
    if (!P.hangs(it)) it.layer = lmap.get(it.layer);
    if (it.type === "opening") it.wall = imap.get(it.wall);
    if (it.type === "ader") it.line = imap.get(it.line);
    if (it.type === "dim" && it.ref !== undefined) { if (imap.has(it.ref)) it.ref = imap.get(it.ref); else delete it.ref; }
  }
  target.items.push(...items);
  if (lmap.has(src.alay)) target.alay = lmap.get(src.alay);
  P.syncDims(target);
  return { layers: [...lmap.values()], items };
}
