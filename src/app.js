// SchemaCAD: Editor. Zustand, Bedienung, Dateien.
import { newDoc, newSheet, parseModel, serializeModel, WIRE_KINDS, LEGEND_KEYS } from "./model.js";
import { SYMBOL_BY_NAME, FAMILIES, isDevice, anchorX, variantByKey, hasTrenner, bmkLetter } from "./symbols.js";
import { splitWandlerDoc, routeWm, wmParts } from "./wandler.js";
import { insertFeed } from "./eingang.js";
import * as LIBS from "./library.js";
import { usedCustom } from "./library.js";
import { importDxfSymbol } from "./dxfimport.js";
import { X0 as RAIL_X0, X1 as RAIL_X1 } from "./template.js";
import { renumberAll, deviceTerminals, linkedTerminals, columnHasTerminals, isRef, openCounterparts, linkRefs, unlinkRef, findItem, refLabel } from "./numbering.js";
import { BUNDLE_PRESETS, BUNDLE_LABELS, conductorKind, offsetPaths, snapToRails, snapToVerticals } from "./bundle.js";
import { parseCable, newTerminals, termCount } from "./terminals.js";
import { baseItems, hasBase, BASE_TAG } from "./template.js";
import { W, H, META_FIELDS, COL_CENTERS, ROW_CENTERS, colOf } from "./frame.js";
import { exportDxf } from "./dxf.js";
import { isGroupWire, mainSheets, mainState } from "./hauptlinien.js";
import { makeTouch } from "./mobil.js";
import { TEMPLATES, TEMPLATE_PREFIX, templateOf, abgangItems, CUSTOM, makeCustom, addCustom, removeCustom } from "./vorlagen.js";
import * as R from "./render.js";
import * as D from "./dispo.js";
import { makeFiles } from "./files.js";
import { openSearch } from "./suchen.js";
import { listsCsv } from "./auswertung.js";
import { makePv } from "./pvedit.js";
import { makeDispo } from "./dispoedit.js";
import { toast, openModal, confirmDialog, formDialog, chooseDialog, makeMenu } from "./dialogs.js";
import { fieldHTML, actions, head, dupDel, textPanelHTML } from "./panel.js";
import { startDialog } from "./start.js";
import { PV_GRID, PV_TEXT_H, DRAW_LAYERS, pruneStrings, pointLabel } from "./pv.js";
import * as T from "./titel.js";
import * as L from "./legende.js";
import { cloudMenu } from "./cloud.js";

const $ = (s) => document.querySelector(s);
const stage = $("#stage"), svg = $("#svg"), world = $("#world");
const gSheet = $("#sheet"), gItems = $("#items"), gOverlay = $("#overlay");
const leftEl = $("#left"), rightEl = $("#right"), editor = $("#texteditor");
const AUTOSAVE_KEY = "schemacad.autosave.v1";
const PX_PER_MM = 96 / 25.4;
const TERMINALS = "TERMINALS"; // Platzhalter für „Klemmenleiste setzen“
const familyOf = (name) => FAMILIES.find((f) => f.variants.includes(name));

const TOOLS = [
  { id: "select", label: "Auswählen", key: "V", icon: "select" },
  { id: "wire", label: "Leitung", key: "L", icon: "wire" },
  { id: "text", label: "Text", key: "T", icon: "text" },
  { id: "hand", label: "Ansicht schieben", key: "H", icon: "hand" },
];

const S = {
  doc: newDoc(), active: 0, // Dokument mit mehreren Blättern, active = angezeigtes Blatt
  get model() { return this.doc.sheets[this.active]; }, // das angezeigte Blatt
  sel: new Set(),
  tool: "select",
  placeSym: null, placeRot: 0,
  view: { x: 0, y: 0, z: 3 },
  grid: { on: true, size: 2.5 },
  mouse: null, // zuletzt gesnappter Punkt in mm
  mag: true, alt: false, // Fang an Feldmitten (Spalten- und Zeilenmitte), Alt schaltet ihn kurz aus
  wireDraft: null, wireKind: "leitung", bundleN: 1, shift: false,
  textH: 2.5,
  drag: null, space: false,
  undo: [], redo: [], pending: null, pendingPushed: false,
  fileHandle: null, fileName: "Unbenannt", dirty: false,
  editing: null, clip: null, legSel: null, // legSel: in der Legende gewähltes Gerät (ID)
  gridSize: { schema: 2.5, dispo: 5, pv: 100, pvtab: 100, title: 2.5, toc: 2.5, legend: 2.5 }, // Rasterweite je Blatttyp (Stringplan: Annahme 100 mm)
  // Voreinstellungen für neue Bauteile einer Disposition (mm)
  guides: [], // Hilfslinien der Disposition (Fang an Kanten und Mitten anderer Bauteile)
  dp: { devH: D.DEV_H, plateW: 500, plateH: 400, railLen: 250, freeTE: 2, freeLabel: "Gerät", textH: 15 },
};

// ---------- Hilfen ----------
const round3 = (n) => Math.round(n * 1000) / 1000;
const fmt = (n) => n.toFixed(1).replace(".", ",");
const isDispo = () => S.model.kind === "dispo";
const isPv = () => S.model.kind === "pv" || S.model.kind === "pvtab"; // Stringplan und Stringübersicht, Bedienung in pvedit.js
const isDeck = () => T.isDeck(S.model); // Titelseite oder Inhaltsverzeichnis (titel.js)
const kindKey = () => S.model.kind || "schema";
const textH = () => (isPv() ? PV_TEXT_H : isDispo() ? S.dp.textH : S.textH);
const selectedItems = () => S.model.items.filter((it) => S.sel.has(it.id));
const nextId = () => S.doc.nextId++;
const snapshot = () => JSON.stringify({ sheets: S.doc.sheets, nextId: S.doc.nextId, pv: S.doc.pv, noTitle: S.doc.noTitle, noToc: S.doc.noToc, info: S.doc.info }); // pv: Modultypen (Stringplan)
const docText = (noAssets = false) => serializeModel({ ...S.doc, active: S.active, ...(usedCustom(S.doc).length ? { symbols: usedCustom(S.doc) } : {}) }, { noAssets });
const PV = makePv({ S, $, TOOLS, toast, change, openModal, chooseDialog, formDialog, confirmDialog, setTool, renderSheet, renderItems, renderOverlay, updateHint, applyView, fitView, nextId, markDirty, renderLeft, renderRight, download: (...a) => download(...a), openEditor: (...a) => openEditor(...a) });
const { placeDown, placeGhost, draftFinish, draftEsc, draftCancel, dimDown, dimCancel, dimOverlay, autoDimPick, hideDimSel, dispoAct, ansichtHTML, setDimNum, applyDp: dispoApplyDp, cabAct: dispoCabAct, cornerKey: dispoCornerKey, plateCorner, newDispoItem, plateAt, guideSnap, edgesX, edgesY, dispoSnap, addDispoItem, dispoExtras, setPlateW, handleItem, handleAt, HANDLE_CURSOR, dragHandle, applyMass, massAt, alignSelected, addAutoRails, handOver, leftHTML: dispoLeftHTML, dispoPanel } =
  makeDispo({ S, TOOLS, round3, isDispo, selectedItems, nextId, snapBase, change, moveItem, setTool, afterSheetChange, sheetLabel, nextSheetNo, makeSheet });

function toWorld(sx, sy) { return { x: (sx - S.view.x) / S.view.z, y: H - (sy - S.view.y) / S.view.z }; }
function toScreen(x, y) { return { x: S.view.x + x * S.view.z, y: S.view.y + (H - y) * S.view.z }; }
function pointerPos(e) { const r = svg.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; }

// Fang an Feldmitten: stärker als das Raster, aber nur nahe an der Mitte, so bleibt feines Zeichnen möglich.
// offX verschiebt die Zielmitte, damit bei mehrpoligen Symbolen die Symbolmitte auf der Feldmitte liegt.
function magnet(c, offX = 0) {
  if (!S.mag || S.alt || isDispo()) return c;
  const r = Math.min(2.4, Math.max(0.8, 4 / S.view.z));
  const near = (list, v) => list.reduce((b, t) => (Math.abs(t - v) < Math.abs(b - v) ? t : b), list[0]);
  const gx = near(COL_CENTERS.map((v) => v - offX), c.x), gy = near(ROW_CENTERS, c.y);
  const out = { ...c };
  if (Math.abs(gx - c.x) <= r) { out.x = round3(gx); out.magX = round3(gx + offX); }
  if (Math.abs(gy - c.y) <= r) { out.y = round3(gy); out.magY = round3(gy); }
  return out;
}
const placeOffX = () => (S.placeSym === TERMINALS || templateOf(S.placeSym) ? 0 : anchorX(SYMBOL_BY_NAME[S.placeSym]?.poles ?? 1));

function snap(wx, wy, { pins = true, offX = 0, mag = false } = {}) {
  const c = snapBase(wx, wy, pins);
  return mag && !c.pin && !c.wire ? magnet(c, offX) : c;
}
// Gerader Anschluss an eine Leitung: liegt der Mauszeiger über (bzw. neben) dem letzten Punkt der Leitung im Bau,
// übernimmt der Fang dessen x bzw. y statt des Rasters. Bei Bündeln zählt die ganze Breite des Bündels.
function straightPrefer(wx, wy) {
  if (S.tool !== "wire" || !S.wireDraft) return null;
  const [px, py] = S.wireDraft.pts.at(-1), tol = Math.max(1.6, 9 / S.view.z), span = (bundleCount() - 1) * 5;
  const nearX = wx >= px - tol && wx <= px + span + tol, nearY = wy <= py + tol && wy >= py - span - tol;
  return nearX || nearY ? { x: nearX ? px : NaN, y: nearY ? py : NaN, tol: Infinity } : null;
}
function snapBase(wx, wy, pins, skip = null) {
  if (pins) {
    const tol = Math.max(1.6, 9 / S.view.z), items = skip ? S.model.items.filter((i) => i !== skip) : S.model.items;
    let best = null, bd = tol;
    for (const p of R.allPins(items)) {
      const d = Math.hypot(p.x - wx, p.y - wy);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) return { x: best.x, y: best.y, pin: true };
    const w = R.snapToWire(items, wx, wy, Math.max(1.2, 6 / S.view.z), S.grid.on ? S.grid.size : 0.1, straightPrefer(wx, wy));
    if (w) return { ...w, wire: true };
  }
  if (S.grid.on) { const g = S.grid.size; return { x: round3(Math.round(wx / g) * g), y: round3(Math.round(wy / g) * g) }; }
  return { x: round3(wx), y: round3(wy) };
}




// ---------- Änderungen und Rückgängig ----------
function pushUndo(snap = snapshot()) {
  S.undo.push(snap);
  if (S.undo.length > 200) S.undo.shift();
  S.redo.length = 0;
  updateUndoButtons();
}
function change(fn, { panel = true } = {}) { const snap = snapshot(); fn(); pushUndo(snap); afterChange(panel); }
function afterChange(panel = true) { const cur = S.model; splitWandlerDoc(S.doc); T.ensureDeck(S.doc, T.loadFirm(), { shift: false }); S.active = Math.max(0, S.doc.sheets.indexOf(cur)); renumberAll(S.doc); markDirty(); renderSheetBar(); renderItems(); renderOverlay(); if (panel) renderRight(); }
function restore(json) {
  const k0 = S.model.kind;
  const o = JSON.parse(json);
  S.doc = { ...S.doc, sheets: o.sheets, nextId: o.nextId, pv: o.pv, noTitle: o.noTitle, noToc: o.noToc, info: o.info };
  S.active = Math.min(S.active, S.doc.sheets.length - 1);
  if (k0 !== "legend" && S.model.kind === "legend" && S.active > 0) S.active--; // Blatt weg: aufs vorherige Arbeitsblatt, nicht auf die Legende
  const ids = new Set(S.model.items.map((i) => i.id));
  S.sel = new Set([...S.sel].filter((id) => ids.has(id)));
  markDirty(); afterSheetChange(k0); updateUndoButtons();
}
function undo() { if (!S.undo.length) return; S.redo.push(snapshot()); restore(S.undo.pop()); }
function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); restore(S.redo.pop()); }
function updateUndoButtons() { $("#btn-undo").disabled = !S.undo.length; $("#btn-redo").disabled = !S.redo.length; }

let autosaveTimer = 0;
function markDirty() {
  S.dirty = true;
  $("#dirty").hidden = false;
  clearTimeout(autosaveTimer);
  // Ist der Zwischenspeicher für eine PDF zu klein, ohne PDF speichern (der Plan muss dann neu geladen werden)
  const put = (t) => localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ name: S.fileName, text: t }));
  autosaveTimer = setTimeout(() => { try { put(docText()); } catch { try { put(docText(true)); } catch { /* ohne Speicher weiterarbeiten */ } } }, 400);
}
function markClean() { S.dirty = false; $("#dirty").hidden = true; clearTimeout(autosaveTimer); try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* egal */ } }
function setFileName(n) { S.fileName = n; $("#file-name").textContent = n; document.title = n + " – SchemaCAD"; }

// ---------- Ansicht ----------
function applyView() {
  const { x, y, z } = S.view;
  world.setAttribute("transform", `matrix(${z} 0 0 ${-z} ${x} ${y + H * z})`);
  $("#zoom-val").textContent = Math.round((z / PX_PER_MM) * 100) + "%";
}
// Sichtbarer Bereich: beim Schema das Blatt, bei der Disposition der Inhalt mit Rand
function viewBounds() {
  if (isPv()) return PV.bounds();
  if (S.model.kind === "legend") return L.bounds(S.doc);
  if (isDeck()) return T.deckBounds(S.doc, S.model);
  if (!isDispo()) return { x0: 0, y0: 0, x1: W, y1: H };
  const b = D.contentBBox(S.model.items, D.planOpts(S.model));
  if (!b) return { x0: -50, y0: -50, x1: 750, y1: 550 };
  const pad = Math.max(40, Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.06);
  return { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad };
}
function fitView() {
  const r = stage.getBoundingClientRect(), b = viewBounds(), bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const z = Math.max(isPv() ? 0.002 : isDispo() ? 0.02 : 0.5, Math.min((r.width - 60) / bw, (r.height - 60) / bh));
  S.view = { z, x: (r.width - bw * z) / 2 - b.x0 * z, y: (r.height - bh * z) / 2 - (H - b.y1) * z };
  applyView(); renderSheet();
}
function zoomAt(sx, sy, factor) {
  const w = toWorld(sx, sy);
  const z = Math.max(isPv() ? 0.002 : isDispo() ? 0.02 : 0.6, Math.min(60, S.view.z * factor));
  S.view = { z, x: sx - w.x * z, y: sy - (H - w.y) * z };
  applyView(); renderSheet(); renderOverlay();
}

// ---------- Zeichnen ----------
function renderSheet() {
  const pat = $("#gridpat");
  pat.setAttribute("width", S.grid.size); pat.setAttribute("height", S.grid.size);
  pat.querySelector("circle").setAttribute("r", isDispo() || isPv() ? Math.max(0.17, 0.9 / S.view.z) : 0.17);
  gSheet.innerHTML = S.model.kind === "legend" ? L.screenSVG(S.doc, S.model, S.legSel) : isDeck() ? (S.model.kind === "title" ? T.titleSVG(S.model) : T.tocScreenSVG(S.doc, S.model)) : isPv() ? PV.sheetSVG() : isDispo() ? D.sheetSVG(S.grid, S.view.z) : R.sheetSVG(S.model.meta, S.grid, S.view.z);
}
function renderItems() { $("#dims-on").checked = S.model.dims !== false; gItems.innerHTML = isDeck() ? "" : isPv() ? PV.itemsSVG() : R.itemsSVG(S.model.items, S.model.kind, isDispo() ? D.planOpts(S.model) : {}); }
const pickable = () => (isPv() ? PV.pickable() : S.model.items); // Stringplan: ohne ausgeblendete und gesperrte Ebenen

function railMap() {
  const rails = {};
  for (const t of S.model.items) if (t.type === "text" && t.tag === "grund") rails[t.s] = t.y + 1;
  return rails;
}
const bundlePaths = (pts, n) => snapToVerticals(snapToRails(offsetPaths(pts, n), BUNDLE_PRESETS[n], railMap()), S.model.items);
const bundleCount = () => (S.wireDraft && S.wireDraft.n) || S.bundleN;
// Bündel von Geräte-Polen auf eine Schiene mit seitlichem Versatz: die Höhe des Versatzes so wählen,
// dass alle waagrechten Stücke zwischen den Polen und der nächsten Schiene liegen. Geht das nicht, gerade hoch.
function railJog(p0, c, rails) {
  const up = c.y > p0[1], g = S.grid.on ? S.grid.size : 0.5;
  const near = up ? Math.min(...rails.filter((y) => y > p0[1])) : Math.max(...rails.filter((y) => y < p0[1]));
  const lo = Math.min(p0[1], near), hi = Math.max(p0[1], near), mid = (lo + hi) / 2;
  let best = null;
  for (let ym = Math.ceil(lo / g) * g; ym < hi; ym += g) {
    const path = [[p0[0], round3(ym)], [c.x, round3(ym)], [c.x, c.y]];
    const ok = offsetPaths([p0, ...path], bundleCount()).every((q) => q.slice(1, -1).every((pt) => pt[1] > lo + 1e-6 && pt[1] < hi - 1e-6));
    if (ok && (!best || Math.abs(ym - mid) < Math.abs(best[0][1] - mid))) best = path;
  }
  return best || [[p0[0], c.y]];
}
function draftPath(c) {
  const p0 = S.wireDraft.pts.at(-1);
  const dx = c.x - p0[0], dy = c.y - p0[1];
  if (Math.abs(dx) < 1e-6 || Math.abs(dy) < 1e-6) return [[c.x, c.y]];
  let horizFirst = Math.abs(dx) >= Math.abs(dy) ? !S.shift : S.shift;
  // Bündel an der Grundverkabelung: Abzweig immer senkrecht (Start auf Schiene: zuerst senkrecht, Ende auf Schiene: zuletzt senkrecht)
  if (bundleCount() > 1) {
    const rails = Object.values(railMap());
    const toRail = rails.some((y) => Math.abs(y - c.y) < 1e-6);
    if (S.wireDraft.pts.length === 1 && rails.some((y) => Math.abs(y - p0[1]) < 1e-6)) horizFirst = false;
    // Von den Polen eines Geräts auf eine Schiene: senkrecht aus den Polen, Versatz in der Mitte, senkrecht auf die Schiene
    else if (toRail && S.wireDraft.pts.length === 1 && S.wireDraft.pin) return railJog(p0, c, rails);
    else if (toRail) horizFirst = true;
  }
  // Bündel senkrecht zu einem Geräte-Pin mit versetztem x: senkrecht, kurzer waagrechter Versatz in der Mitte, senkrecht in den Pin
  if (bundleCount() > 1 && c.pin && !horizFirst) {
    const g = S.grid.on ? S.grid.size : 0.5;
    const ym = round3(Math.round((p0[1] + c.y) / 2 / g) * g);
    if (Math.abs(ym - p0[1]) > 1e-6 && Math.abs(ym - c.y) > 1e-6) return [[p0[0], ym], [c.x, ym], [c.x, c.y]];
  }
  return horizFirst ? [[c.x, p0[1]], [c.x, c.y]] : [[p0[0], c.y], [c.x, c.y]];
}

function renderOverlay() {
  let s = "";
  s += R.selectionSVG(selectedItems());
  // Griffe an den Punkten gewählter Leitungen (ziehen = Punkt verschieben)
  if (S.tool === "select") for (const w of selectedItems()) if (w.type === "wire") for (const p of w.pts) s += `<rect class="wire-handle" x="${p[0] - 0.9}" y="${p[1] - 0.9}" width="1.8" height="1.8"/>`;
  // Griffe und Live-Mass in der Disposition
  const hi = handleItem();
  if (hi) {
    const k = 8 / S.view.z;
    for (const p of D.handlePoints(hi)) s += `<rect class="dp-handle" x="${p.x - k / 2}" y="${p.y - k / 2}" width="${k}" height="${k}"/>`;
    const dh = D.planOpts(S.model).dimH;
    s += D.primsSVG(D.massTargets(hi, dh).filter((m) => hi.type === "rail" || S.model.dims === false).map((m) => ({ k: "text", x: m.x, y: m.y, h: dh, s: D.fmtMass(m.v), layer: "SCH_DISPO_MASS", anchor: m.anchor })));
  }
  if (isDispo()) s += dimOverlay(); // Werkzeug Bemassung, gewähltes automatisches Mass
  if (isDispo()) for (const l of S.guides) s += `<line class="dp-guide" x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke-dasharray="${5 / S.view.z} ${4 / S.view.z}"/>`;
  const showPins = S.tool === "wire";
  if (showPins) for (const p of R.allPins(S.model.items)) s += `<circle cx="${p.x}" cy="${p.y}" r="0.9" fill="#fff" stroke="#2f9e58" stroke-width="1.4"/>`;
  const placingDispo = S.tool === "place" && !!S.placeSym && S.placeSym.startsWith("D:");
  if (S.tool === "place" && S.mouse && isDispo() && placingDispo) s += placeGhost(S.mouse);
  else if (S.tool === "place" && S.mouse && !isDispo() && !placingDispo) {
    if (S.placeSym === TERMINALS) s += R.ghostSVG(newTerminals(S.mouse.x, S.mouse.y));
    else if (templateOf(S.placeSym)) { let k = 0; const a = abgangItems(templateOf(S.placeSym), colOf(S.mouse.x), S.model.items, () => --k); if (a.items) s += `<g opacity="0.55">${R.itemsSVG(a.items)}</g>`; } // Abgang: Vorschau in der Spalte unter dem Zeiger
    else s += R.ghostSVG({ type: "symbol", sym: S.placeSym, x: S.mouse.x, y: S.mouse.y, rot: S.placeRot, attrs: Object.fromEntries(SYMBOL_BY_NAME[S.placeSym].attrs.map((a) => [a.tag, a.def])) });
  }
  if (S.wireDraft) {
    const pts = S.wireDraft.pts.slice();
    if (S.mouse) pts.push(...draftPath(S.mouse));
    const line = (path, kind) => {
      const k = WIRE_KINDS[kind];
      return `<polyline points="${path.map((p) => p[0] + "," + p[1]).join(" ")}" fill="none" stroke="#17212b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${k.dashed ? 'stroke-dasharray="7 4"' : ""} opacity="0.8"/>`;
    };
    const clean = simplify(pts);
    if (bundleCount() > 1 && clean.length >= 2) bundlePaths(clean, bundleCount()).forEach((path, i) => { s += line(path, conductorKind(BUNDLE_PRESETS[bundleCount()][i])); });
    else s += line(pts, S.wireKind);
  }
  if (S.mouse && (S.tool === "wire" || S.tool === "place" || S.tool === "text")) {
    const g = (a) => `fill="none" stroke="#2f9e58" stroke-width="1" stroke-dasharray="4 3" opacity="0.7" pointer-events="none" ${a}`;
    if (S.mouse.magX !== undefined) s += `<line x1="${S.mouse.magX}" y1="0" x2="${S.mouse.magX}" y2="${H}" ${g("")}/>`;
    if (S.mouse.magY !== undefined) s += `<line x1="0" y1="${S.mouse.magY}" x2="${W}" y2="${S.mouse.magY}" ${g("")}/>`;
  }
  if (S.tool === "wire" && S.mouse) s += `<circle cx="${S.mouse.x}" cy="${S.mouse.y}" r="${S.mouse.pin || S.mouse.wire ? 1.5 : 0.8}" fill="${S.mouse.pin ? "#f4c400" : S.mouse.wire ? "#2f9e58" : "#17212b"}" stroke="#17212b" stroke-width="1.2"/>`;
  if (S.drag && S.drag.type === "band") {
    const d = S.drag;
    s += `<rect x="${Math.min(d.x0, d.x1)}" y="${Math.min(d.y0, d.y1)}" width="${Math.abs(d.x1 - d.x0)}" height="${Math.abs(d.y1 - d.y0)}" fill="rgba(47,158,88,.10)" stroke="#2f9e58" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  }
  if (isPv()) s += PV.overlaySVG();
  gOverlay.innerHTML = s;
}

// ---------- Seitenleisten ----------
function hintText() {
  if (S.model.kind === "legend") return "Sicherungslegende: entsteht aus den Schutzgeräten aller Schemablätter. Klick auf eine Zeile wählt das Gerät.";
  if (isDeck()) return S.model.kind === "title" ? "Titelseite: Angaben rechts eintragen. Objekt, Auftrag, Schema, Gezeichnet und Datum gelten für alle Blätter." : "Inhaltsverzeichnis: wird automatisch erstellt. Klick auf eine Zeile springt zum Blatt.";
  if (isPv()) return PV.hint();
  if (isDispo()) {
    if (S.tool === "place" && /^D:BAR:/.test(S.placeSym)) return S.dpDraft ? "Schiene: zweiter Klick setzt das Ende, waagrecht oder senkrecht nach dem grösseren Abstand. Esc bricht ab." : "Schiene N/PE/PEN: erster Klick setzt den Anfang auf der Mittellinie. Esc beendet.";
    if (S.tool === "place" && S.placeSym === "D:CABLE") return "Zuleitung: Klicks setzen Punkte. Enter, Esc oder ein Klick auf den letzten Punkt beendet. Text rechts ändern.";
    if (S.tool === "place" && S.placeSym === "D:TPL:AUEU") return "Systemauftrennung AÜU: Klick setzt den PEN-Anschluss unten. Ein Rückgängig-Schritt, danach jedes Teil einzeln verschiebbar. Esc beendet.";
    if (S.tool === "place" && S.placeSym === "D:RAILF") return "Freie Schiene: Klicken setzt den Anfang auf der Mittellinie, ohne Plattenrand. Länge rechts oder mit den Griffen. Esc beendet.";
    if (S.tool === "place") return S.placeSym.startsWith("D:DEV:") ? "Gerät: Klicken setzt es. Auf einer Schiene rastet es in ½-TE-Schritten ein, rot umrandet heisst überlappt oder ragt über die Schiene. Esc beendet." : S.placeSym === "D:RAIL" ? "Schiene: Klicken setzt den Anfang auf Höhe der Mittellinie. Innerhalb einer Platte nimmt sie deren Breite mit 20 mm Rand links und rechts. Esc beendet." : `Platte: Klicken setzt die Ecke ${plateCorner()}. Tab wechselt die Ecke, Shift+Tab zurück. Masse danach rechts einstellen. Esc beendet.`;
    if (S.tool === "text") return "Klicken setzt einen Text, die Eingabetaste bestätigt.";
    if (S.tool === "hand") return "Ziehen verschiebt die Ansicht.";
    if (S.tool === "dim") return S.dimDraft?.p2 ? "Bemassung: Klick setzt die Masslinie. Zwischen den Punkten = waagrecht bzw. senkrecht. Esc bricht ab." : S.dimDraft ? "Bemassung: zweiten Punkt klicken (Ecken, Kantenmitten, Kanten rasten ein, Alt = frei). Esc bricht ab." : "Bemassung: ersten Punkt klicken. Masse auswählen und mit Entf löschen, automatische Masse mit Entf ausblenden.";
    return "Klick wählt (Platte am Rand), Shift mehrere, Ziehen auf leerer Fläche wählt mit Rahmen. Griffe ändern die Grösse, Doppelklick auf ein Mass tippt es ein, Alt ohne Hilfslinien.";
  }
  if (S.tool === "place" && templateOf(S.placeSym)) return `Abgang ${templateOf(S.placeSym).label}: Klicken in eine freie Spalte setzt Geräte, Leitungen zu den Hauptlinien und Klemmen mit Kabel. Esc beendet.`;
  if (S.tool === "place") return S.placeSym === TERMINALS ? "Klemmenleiste: Klicken setzt die obere Kante auf die gewählte Stelle, die Klemmen hängen darunter. Esc beendet." : `${SYMBOL_BY_NAME[S.placeSym].label}: Klicken setzt das Symbol, R dreht${familyOf(S.placeSym)?.variants.length > 1 ? `, 1 bis 4 Polzahl, N Neutralleiter${hasTrenner(S.placeSym) ? ", T N-Trenner" : ""}` : ""}, Esc beendet. Der Fang rastet auf Feldmitten ein, Alt schaltet ihn aus.`;
  if (S.tool === "wire") return S.wireDraft ? "Klicken setzt einen Punkt. Nochmals auf den letzten Punkt klicken oder Eingabetaste beendet. Shift wechselt die Knickrichtung." : S.bundleN > 1 ? `Klicken startet ${S.bundleN} parallele Leiter. Der erste liegt auf dem Klickpunkt, die weiteren rechts oder darunter.` : "Klicken startet eine Leitung. Anschlusspunkte der Symbole rasten ein.";
  if (S.tool === "text") return "Klicken setzt einen Text, die Eingabetaste bestätigt.";
  if (S.tool === "hand") return "Ziehen verschiebt die Ansicht.";
  return "Objekt anklicken, mit Shift mehrere wählen. Auf leerer Fläche ziehen wählt mit Rahmen.";
}
function updateHint() { $("#hint").textContent = hintText(); }


function renderLeft() {
  if (isDeck()) { const k = S.model.kind; leftEl.innerHTML = `<section class="section"><h2 class="section-title">${T.kindLabel(S.model)}</h2><p class="note">${k === "title" ? "Blatt 1. Hier wird nicht gezeichnet, die Angaben stehen rechts." : k === "toc" ? "Blatt 2. Entsteht automatisch aus allen Blättern der Datei." : "Letztes Blatt, A4 hoch. Entsteht automatisch aus den Schutzgeräten aller Schemablätter."}</p></section>`; return; }
  if (isDispo()) { leftEl.innerHTML = dispoLeftHTML(); return; }
  if (isPv()) { leftEl.innerHTML = PV.leftHTML(); return; }
  let h = `<section class="section"><h2 class="section-title">Werkzeuge</h2>`;
  for (const t of TOOLS) h += `<button class="tool" data-tool="${t.id}" aria-pressed="${S.tool === t.id}">${R.icons[t.icon]}<span>${t.label}</span><span class="key">${t.key}</span></button>`;
  h += `</section>` + abgangHTML() + `<section class="section"><h2 class="section-title">Symbole</h2>`;
  for (const f of FAMILIES) { // Wunsch CJ 16.10.: jede Variante direkt wählbar, ein Klick setzt das Gerät
    if (f.variants.length > 1) { h += `<div class="symfam"><span class="name">${R.esc(f.label)}</span><div class="vargrid">${f.variants.map(varTile).join("")}</div></div>`; continue; }
    const on = S.tool === "place" && f.variants.includes(S.placeSym);
    h += `<button class="sym" data-sym="${f.def}" aria-pressed="${on}"><span class="thumb">${R.thumbSVG(SYMBOL_BY_NAME[f.def])}</span><span><span class="name">${R.esc(f.label)}</span><br><span class="sub">${R.esc(f.sub)}</span></span></button>`;
  }
  h += `<button class="sym" data-sym="${TERMINALS}" aria-pressed="${S.tool === "place" && S.placeSym === TERMINALS}"><span class="thumb">${R.terminalsThumb()}</span><span><span class="name">Klemmenleiste</span><br><span class="sub">Anzahl folgt dem Kabel</span></span></button>`;
  h += "</section>" + libraryHTML();
  leftEl.innerHTML = h;
}

// Abgänge als Schnellzugriff über den Symbolen (CJ 16.10.): feste Vorlagen und eigene (aus der Auswahl gespeichert) als
// Kacheln, eigene mit ×. „Auswahl als Abgang speichern“ nimmt die markierten Objekte samt Klemmen.
function abgangHTML() {
  const tile = (t) => {
    const key = TEMPLATE_PREFIX + t.id, sym = SYMBOL_BY_NAME[t.custom ? t.thumb : t.devs.at(-1).sym];
    const btn = `<button class="var abg" data-sym="${key}" aria-pressed="${S.tool === "place" && S.placeSym === key}" title="${R.esc(t.label + " – " + t.sub)}" aria-label="${R.esc(t.label)}"><span class="thumb">${sym ? R.thumbSVG(sym) : R.terminalsThumb()}</span><span class="vl">${R.esc(t.short ?? t.label)}</span></button>`;
    return t.custom ? `<div class="abgwrap">${btn}<button class="abgdel" data-abgdel="${t.id}" title="Eigenen Abgang löschen" aria-label="Eigenen Abgang ${R.esc(t.label)} löschen">×</button></div>` : btn;
  };
  return `<section class="section"><h2 class="section-title">Abgänge</h2><div class="vargrid abggrid">${[...TEMPLATES, ...CUSTOM].map(tile).join("")}</div>`
    + `<button class="btn outline small abgsave" data-abgsave>Auswahl als Abgang speichern</button></section>`;
}
async function saveAbgang() {
  const sel = selectedItems();
  if (!sel.length) { toast("Zuerst im Schema markieren, was zum Abgang gehört (Geräte, Leitungen, Klemmen).", "error"); return; }
  const draft = makeCustom("", [...sel, ...followers(sel)]);
  if (!draft) { toast("In der Auswahl ist kein Gerät, keine Leitung und keine Klemme.", "error"); return; }
  const r = await formDialog("Zu Abgänge hinzufügen", "Die markierten Objekte werden als eigener Abgang gespeichert (in diesem Browser, für alle Dateien). Ein Klick in eine Spalte setzt ihn dort ein.", [{ label: "Name", value: draft.sub.split(",")[0] }], "Speichern");
  if (!r) return;
  draft.label = r[0].trim() || "Eigener Abgang";
  if (!addCustom(draft)) toast("Speichern im Browser nicht möglich. Der Abgang gilt nur bis zum Neuladen.", "error"); else toast(`Abgang „${draft.label}“ gespeichert.`);
  renderLeft();
}

// Kachel einer Polzahl-Variante: Vorschau und kurzer Text (z. B. "1P+N-Tr."), voller Name im Tooltip
const shortVlabel = (sym) => (sym.vlabel ?? `${sym.poles}P`).replace(/ \(.*\)$/, "").replace(" + N-Trenner", "+N-Tr.").replace(/^(\d)-polig$/, "$1P");
function varTile(name) {
  const sym = SYMBOL_BY_NAME[name], on = S.tool === "place" && S.placeSym === name;
  return `<button class="var" data-sym="${name}" aria-pressed="${on}" title="${R.esc(sym.label)}" aria-label="${R.esc(sym.label)}"><span class="thumb">${R.thumbSVG(sym)}</span><span class="vl">${R.esc(shortVlabel(sym))}</span></button>`;
}
const symSize = (sym) => { const b = R.localBBoxOf(sym); return `${Math.round(b.x1 - b.x0)} × ${Math.round(b.y1 - b.y0)} mm`; };
function libraryHTML() {
  let h = `<section class="section"><h2 class="section-title">Bibliothek</h2><div class="libtools"><button class="btn outline small" data-libact="import">DXF-Symbol importieren</button><button class="btn outline small" data-libact="load">Bibliothek laden</button><button class="btn outline small" data-libact="cloud" title="Bibliotheken online laden oder speichern">Online</button></div>`;
  if (!LIBS.libs.length) h += `<p class="note">Noch keine Symbole. Importiere ein Symbol aus einer DXF-Datei oder lade eine Bibliothek (JSON).</p>`;
  for (const lib of LIBS.libs) {
    h += `<div class="libhead"><span>${R.esc(lib.name)}</span><button class="btn outline small" data-libact="save" data-lib="${R.esc(lib.name)}" title="Bibliothek als Datei sichern">Sichern</button></div>`;
    for (const g of lib.groups) {
      h += `<h3 class="grouptitle">${R.esc(g.name)}</h3>`;
      for (const sym of g.symbols) {
        const on = S.tool === "place" && S.placeSym === sym.name;
        h += `<div class="symrow"><button class="sym" data-sym="${sym.name}" aria-pressed="${on}"><span class="thumb">${R.thumbSVG(sym)}</span><span><span class="name">${R.esc(sym.label)}</span><br><span class="sub">${sym.pins.length} Anschlüsse, ${symSize(sym)}${sym.scaled && sym.scaled !== 1 ? ", Massstab " + sym.scaled : ""}</span></span></button><button class="symdel" data-libdel="${sym.name}" title="Aus der Bibliothek entfernen" aria-label="Aus der Bibliothek entfernen">×</button></div>`;
      }
    }
  }
  return h + "</section>";
}


const fileBase = (n) => n.replace(/\.[^.]+$/, "");
const hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36).slice(0, 5); };

async function importSymbols() {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".dxf"; inp.multiple = true;
  inp.onchange = async () => {
    const files = [...inp.files];
    if (!files.length) return;
    const lib0 = LIBS.libs[0]?.name || "Meine Bibliothek";
    const r = await formDialog("Symbole importieren", `${files.length} Datei${files.length > 1 ? "en" : ""}. Das Symbol wird aus Linien, Kreisen, Bögen und Texten gebaut. Anschlüsse stammen aus den Klemmenziffern (A1, A2 …) oder aus freien Linienenden oben und unten.`, [
      { label: "Bibliothek", value: lib0 },
      { label: "Gruppe", value: "Import" },
      { label: "Massstab", value: "auto", options: [["auto", "Automatisch (Polteilung 5 mm)"], ["h20", "Höhe 20 mm wie LS/FI (Anschluss oben bis unten)"], ["1", "1:1 (Einheit mm)"], ["0.5", "0,5"], ["2", "2"], ["0.1", "0,1 (Zeichnung in cm)"]] },
    ], "Importieren");
    if (!r) return;
    const done = [], failed = [];
    for (const f of files) {
      try {
        const base = fileBase(f.name);
        const sym = importDxfSymbol(await f.text(), { name: "x", label: base, scale: r[2] === "auto" || r[2] === "h20" ? r[2] : Number(r[2]) });
        sym.name = `LIB_${base.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Symbol"}_${hash(JSON.stringify(sym.prims))}`;
        LIBS.addSymbolToLib(r[0].trim() || "Meine Bibliothek", r[1].trim() || "Import", sym);
        done.push(base);
      } catch (err) { failed.push(`${f.name}: ${err.message}`); }
    }
    renderLeft();
    if (done.length) toast(`${done.length} Symbol${done.length > 1 ? "e" : ""} importiert. Anschlüsse und Massstab prüfen.`);
    if (failed.length) toast(failed.join(" | "), "error");
  };
  inp.click();
}
function loadLibrary() {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try { const { lib, added } = LIBS.loadLibText(await f.text()); renderLeft(); toast(`Bibliothek „${lib.name}“ geladen: ${added} neue Symbole.`); }
    catch (err) { toast("Laden hat nicht geklappt: " + err.message, "error"); }
  };
  inp.click();
}

// Online-Ablage (cloud.js): je Bibliothek ein Eintrag im Format der Bibliotheksdatei, beim Laden wie eine Datei geprüft
function cloudLibraries() {
  cloudMenu("symbol_libs", "Bibliotheken", () => LIBS.libs.map((l) => ({ name: l.name, data: JSON.parse(LIBS.libFileText(l)) })), (datas) => {
    let n = 0;
    for (const d of datas) { try { n += LIBS.loadLibText(JSON.stringify(d)).added; } catch { /* defekter Eintrag wird übersprungen */ } }
    renderLeft(); toast(datas.length ? `${datas.length} Bibliothek${datas.length > 1 ? "en" : ""} geladen: ${n} neue Symbole.` : "Online sind noch keine Bibliotheken gespeichert.");
  });
}

const railEndSelect = (side, it) => {
  const cur = it.ends?.[side] || "edge";
  const opts = [["edge", "Blattrand, durchgehend"], ...Array.from({ length: 8 }, (_, i) => [`col:${i + 1}`, `Endet bei Spalte ${i + 1}`]), ["ref", "Verweis auf anderes Blatt"]];
  return `<div class="field"><label>${side === "l" ? "Anfang links" : "Ende rechts"}</label><select data-railend="${side}">${opts.map(([v, l]) => `<option value="${v}"${v === cur ? " selected" : ""}>${l}</option>`).join("")}</select></div>`;
};
// Grundverkabelung L1 bis N als Gruppe (hauptlinien.js): Anfang links und Ende rechts mit Ziel
function mainPanelHTML() {
  const m = S.model.main;
  if (!m) return "";
  const st = mainState(S.doc, S.model), lab = (sh) => sheetLabel(sh, S.doc.sheets.indexOf(sh));
  const cols = (verb) => Array.from({ length: 8 }, (_, i) => [`col:${i + 1}`, `${verb} bei Spalte ${i + 1}`]);
  const sel = (attr, label, cur, opts) => `<div class="field"><label>${label}</label><select ${attr}>${opts.map(([v, l]) => `<option value="${v}"${v === cur ? " selected" : ""}>${R.esc(l)}</option>`).join("")}</select></div>`;
  const lOpts = [["auto", st.from ? `Kommt von ${lab(st.from)} (Verweis)` : "Kommt vom vorherigen Blatt (Verweis)"], ["start", "Beginnt am Blattrand, ohne Verweis"], ...cols("Beginnt"), ...(m.l === "feed" ? [["feed", "Eingangsverdrahtung (vom HAK)"]] : [])];
  const rOpts = [["next", "Weiter auf das nächste Blatt"], ...mainSheets(S.doc).filter((sh) => sh !== S.model).map((sh) => [`sheet:${S.doc.sheets.indexOf(sh)}`, `Weiter auf ${lab(sh)}`]), ["end", "Endet am Blattrand"], ...cols("Endet")];
  const curR = m.r === "sheet" ? `sheet:${S.doc.sheets.findIndex((sh) => sh.sid === m.to)}` : m.r;
  const note = (m.l === "auto" && !st.from ? "Kein Blatt führt hierher: die Linien beginnen am Blattrand. " : "") + (st.to ? `Weiter auf ${lab(st.to)}.` : m.r === "next" || m.r === "sheet" ? "Kein freies Ziel: die Linien enden am Blattrand mit einem Strich." : "");
  return sel("data-mainl", "Anfang links", m.l, lOpts) + sel("data-mainr", "Ende rechts", curR, rOpts) + (note ? `<p class="note">${R.esc(note)}</p>` : "");
}
// Kurzstand der Hauptlinien für die rechte Leiste (ohne Auswahl)
function mainSummary() {
  const m = S.model.main;
  if (!m) return hasBase(S.model.items) ? "nur PE und weitere Linien" : "keine Grundverkabelung";
  const st = mainState(S.doc, S.model), lab = (sh) => sheetLabel(sh, S.doc.sheets.indexOf(sh)), col = (v) => v.startsWith("col:") ? ` bei Spalte ${v.slice(4)}` : "";
  return `${st.from ? "kommt von " + lab(st.from) : m.l === "feed" ? "Eingangsverdrahtung vom HAK" : "beginnt" + (col(m.l) || " am Blattrand")}, ${st.to ? "weiter auf " + lab(st.to) : "endet" + (col(m.r) || " am Blattrand")}`;
}
// Fenster oben für Schema und Disposition (UI Schritt 6, wie im Stringplan): Schriftfeld, Hauptlinien
function sheetPopHTML(kind) {
  const plus = (act, label, dis) => `<div class="row"><button class="btn outline small" data-act="${act}"${dis ? " disabled" : ""}>${R.icons.plus.replace("<svg", '<svg width="16" height="16"')}${label}</button></div>`;
  if (kind === "ansicht") return ansichtHTML();
  if (kind === "haupt") return head("Hauptlinien", "L1, L2, L3, N oben, PE unten") + (hasBase(S.model.items) ? "" : plus("base", "Grundverkabelung einfügen")) + plus("feed", "Eingangsverdrahtung einfügen", S.model.main?.l === "feed") + mainPanelHTML() + plus("addrail", "Weitere Hauptlinie", !hasBase(S.model.items));
  if (isDispo()) return head("Schriftfeld", "Angaben dieser Disposition") + META_FIELDS.filter((f) => ["OBJEKT", "TITEL", "GEZEICHNET", "DATUM"].includes(f.tag)).map((f) => fieldHTML(f.label, `data-meta="${f.tag}"`, S.model.meta[f.tag] ?? "")).join("");
  return head("Schriftfeld", "Angaben dieses Blatts") + META_FIELDS.filter((f) => !T.PROJECT_FIELDS.includes(f.tag)).map((f) => fieldHTML(f.label, `data-meta="${f.tag}"`, S.model.meta[f.tag] ?? "")).join("")
    + `<details class="proj"><summary>Projektangaben (gelten für alle Blätter)</summary>${META_FIELDS.filter((f) => T.PROJECT_FIELDS.includes(f.tag)).map((f) => fieldHTML(f.label, `data-meta="${f.tag}"`, S.model.meta[f.tag] ?? "")).join("")}${T.titleOf(S.doc) ? `<div class="row"><button class="btn outline small" data-act="gotitle">Zur Titelseite</button></div>` : ""}</details>`;
}
// Ziel ändern: ein anderes Blatt, das schon auf dieses Ziel zeigte, geht wieder aufs nächste Blatt. Das Ziel nimmt die Linien an.
function setMainEnd(t) {
  const m = S.model.main;
  if (!m) return;
  change(() => {
    if (t.dataset.mainl !== undefined) { m.l = t.value; return; }
    delete m.to;
    if (!t.value.startsWith("sheet:")) { m.r = t.value; return; }
    const tg = S.doc.sheets[Number(t.value.slice(6))];
    if (!tg?.main) return;
    if (!tg.sid) tg.sid = nextId();
    for (const sh of S.doc.sheets) if (sh !== S.model && sh.main?.r === "sheet" && sh.main.to === tg.sid) { sh.main.r = "next"; delete sh.main.to; }
    Object.assign(m, { r: "sheet", to: tg.sid }); tg.main.l = "auto";
  });
}
const kindSelect = (attr, value) => `<div class="field"><label>Art der Leitung</label><select ${attr}>${Object.entries(WIRE_KINDS).map(([k, v]) => `<option value="${k}"${k === value ? " selected" : ""}>${v.label}</option>`).join("")}</select></div>`;
const poleSelect = (attr, family, value) => `<div class="field"><label>Polzahl</label><select ${attr}>${family.variants.map((v) => `<option value="${v}"${v === value ? " selected" : ""}>${SYMBOL_BY_NAME[v].vlabel ?? SYMBOL_BY_NAME[v].poles + "-polig"}</option>`).join("")}</select></div>`;
const bundleSelect = () => `<div class="field"><label>Anzahl Leiter pro Zug</label><select data-newbundle>${Object.entries(BUNDLE_LABELS).map(([n, l]) => `<option value="${n}"${Number(n) === S.bundleN ? " selected" : ""}>${l}</option>`).join("")}</select></div>`;
function cableNote(it) {
  const c = parseCable(it.cable);
  return c ? `Aus dem Kabel folgen ${c.n} Klemmen (${c.q} mm²).` : `Kabelangabe nicht erkannt (Beispiel 5x1.5mm2). Es bleiben ${termCount(it)} Klemmen.`;
}



// Fenster Module, Wechselrichter, Druck oben (Stringplan und Stringübersicht, UI Schritt 6 Teil 2). Hängt am Knopf, blockiert den Plan nicht.
let pvPop = null, popKind = null;
const popEl = $("#pv-pop");
const SHEET_POPS = new Set(["blatt", "haupt", "ansicht"]);
const popHTML = () => (SHEET_POPS.has(popKind) ? sheetPopHTML(popKind) : PV.popHTML(popKind, { head, fieldHTML, META_FIELDS }));
function renderPvBar() {
  const on = isPv(), doc = !on && !isDeck(); // Schema und Disposition: Schriftfeld, Hauptlinien nur im Schema
  $("#pv-bar").hidden = !on; $("#doc-bar").hidden = !doc; $("#btn-haupt").hidden = isDispo(); $("#btn-ansicht").hidden = !isDispo();
  if (!pvPop) return;
  if (pvPop.open && (SHEET_POPS.has(popKind) ? !doc || (popKind === "haupt" && isDispo()) || (popKind === "ansicht" && !isDispo()) : !on)) { pvPop.hide(false); return; }
  if (!on) { // live (z. B. Ziel der Hauptlinien), nicht während in einem Textfeld getippt wird
    const ae = document.activeElement;
    if (pvPop.open && !(popEl.contains(ae) && ae.type === "text")) { const y = popEl.scrollTop, had = popEl.contains(ae); popEl.innerHTML = popHTML(); popEl.scrollTop = y; if (had) popEl.focus(); }
    return;
  }
  const l = PV.printLabel(), b = $("#btn-pvdruck");
  $("#pv-druck-lbl").textContent = l.text; b.classList.toggle("warn", l.warn);
  b.title = `Druck: ${l.text}${l.warn ? ", Inhalt passt nicht aufs Papier" : ""}. Papier, Massstab, Plankopf`;
  if (pvPop.open) { const y = popEl.scrollTop, had = popEl.contains(document.activeElement); popEl.innerHTML = popHTML(); popEl.scrollTop = y; if (had) popEl.focus(); } // live, z. B. Passt-Hinweis
}
// Mobilansicht: ohne Auswahl zeigt die Leiste unten einen Hinweis (body.nosel, style.css)
function renderRight() { renderRightPanel(); document.body.classList.toggle("nosel", !S.sel.size && !(S.model.kind === "legend" && S.legSel != null)); }
function renderRightPanel() {
  renderPvBar();
  const sel = selectedItems();
  if (isDeck()) { rightEl.innerHTML = S.model.kind === "legend" ? L.panelHTML(S.doc, S.model, S.legSel, { head, fieldHTML }) : T.deckPanelHTML(S.doc, S.model, { head, fieldHTML }); return; }
  const special = dispoPanel(sel);
  if (special !== null) { rightEl.innerHTML = special; return; }
  const pvh = isPv() ? PV.panelHTML(sel, { head, fieldHTML, META_FIELDS, dupDel }) : null;
  if (pvh !== null) { rightEl.innerHTML = pvh; return; }
  let h = "";
  if (sel.length === 1) {
    const it = sel[0];
    if (it.type === "symbol") {
      const sym = SYMBOL_BY_NAME[it.sym];
      h += `<div class="prop-head"><h2>${R.esc(sym.label)}</h2><p>Symbol</p></div>`;
      const fam = familyOf(it.sym);
      if (fam && fam.variants.length > 1) h += poleSelect("data-sympoles", fam, it.sym);
      for (const a of sym.attrs) if (!a.auto) h += fieldHTML(a.label, `data-attr="${a.tag}"`, it.attrs[a.tag] ?? "");
      if (it.main) h += `<p class="note">Verweis der Grundverkabelung, wird automatisch gesetzt.</p>` + mainPanelHTML();
      else if (isRef(it)) {
        const cur = it.link === undefined ? null : findItem(S.doc, it.link);
        h += `<p class="note">${cur ? "Verknüpft mit " + R.esc(refLabel(cur.item, cur.sheet)) + "." : "Noch nicht verknüpft."}</p>`;
        h += `<div class="row"><button class="btn outline small" data-act="relink">${cur ? "Verknüpfung ändern" : "Verknüpfen"}</button>${cur ? '<button class="btn outline small" data-act="unlink">Lösen</button>' : ""}</div>`;
      }
      if (isDevice(sym)) h += `<div class="row"><button class="btn outline small" data-act="golegend">In Legende zeigen</button></div>`;
      h += actions([["rotate", "rotate", "Drehen"], ["dup", "copy", "Duplizieren"], ["del", "trash", "Löschen", "danger"]]);
    } else if (it.type === "terminals") {
      h += `<div class="prop-head"><h2>Klemmenleiste</h2><p>${termCount(it)} Klemmen</p></div>`;
      h += fieldHTML("Bezeichnung der Leiste (BMK)", 'data-term="bmk"', it.bmk);
      h += fieldHTML("Kabel", 'data-term="cable"', it.cable, 'placeholder="5x1.5mm2"');
      h += `<p class="note" data-cablenote>${R.esc(cableNote(it))}</p>`;
      h += fieldHTML("Bezeichnung (unter dem Kabel)", 'data-term="name"', it.name);
      h += `<div class="field"><label>Klemmen</label><select data-termdraw><option value="on"${it.noterm ? "" : " selected"}>Klemmen zeichnen</option><option value="off"${it.noterm ? " selected" : ""}>Keine Klemme (nur BMK, Kabel, Bezeichnung)</option></select></div>`;
      if (!it.noterm) h += `<div class="field"><label>Letzte Klemme</label><select data-termpe><option value="last"${it.pe !== "none" ? " selected" : ""}>PE-Klemme (schraffiert)</option><option value="none"${it.pe === "none" ? " selected" : ""}>Normale Klemme</option></select></div>`;
      h += actions([["dup", "copy", "Duplizieren"], ["del", "trash", "Löschen", "danger"]]);
    } else if (it.type === "wire") {
      h += `<div class="prop-head"><h2>Leitung</h2><p>${it.pts.length - 1} Segment${it.pts.length === 2 ? "" : "e"}</p></div>`;
      h += kindSelect('data-wirekind', it.kind);
      if (isRail(it)) h += `<p class="note">Hauptlinie ${R.esc(railName(it))}${isGroupWire(S.model.items, it) ? ", Grundverkabelung L1 bis N gemeinsam" : ""}</p>` + (isGroupWire(S.model.items, it) ? mainPanelHTML() : railEndSelect("l", it) + railEndSelect("r", it));
      h += actions([["dup", "copy", "Duplizieren"], ["del", "trash", "Löschen", "danger"]]);
    } else {
      h += textPanelHTML(it);
    }
  } else if (sel.length > 1) {
    h += `<div class="prop-head"><h2>${sel.length} Objekte</h2><p>Mehrfachauswahl</p></div>`;
    h += actions([["dup", "copy", "Duplizieren"], ["del", "trash", "Löschen", "danger"]]);
  } else {
    if (S.tool === "wire") h += `<div class="prop-head"><h2>Neue Leitung</h2></div>` + bundleSelect() + (S.bundleN === 1 ? kindSelect("data-newkind", S.wireKind) : `<p class="note">Leiter von oben links nach unten rechts: ${BUNDLE_PRESETS[S.bundleN].join(", ")}.</p>`);
    else if (S.tool === "place" && S.placeSym !== TERMINALS && familyOf(S.placeSym)?.variants.length > 1) h += `<div class="prop-head"><h2>Neues Symbol</h2></div>` + poleSelect("data-placepoles", familyOf(S.placeSym), S.placeSym);
    else if (S.tool === "text") h += `<div class="prop-head"><h2>Neuer Text</h2></div><div class="field"><label>Texthöhe in mm</label><input type="number" min="1" max="20" step="0.5" data-newth value="${S.textH}"></div>`;
    h += head(sheetLabel(S.model, S.active), S.model.meta.TITEL || "ohne Blatttitel") + `<p class="note">Hauptlinien: ${R.esc(mainSummary())}.</p>`;
    h += `<div class="row"><button class="btn outline small danger" data-act="delsheet"${workCount() < 2 ? " disabled" : ""}>${R.icons.trash.replace("<svg", '<svg width="16" height="16"')}Blatt löschen</button></div>`;
  }
  rightEl.innerHTML = h;
}

// ---------- Blätter ----------
const workCount = () => S.doc.sheets.filter((sh) => !T.isDeck(sh)).length;
function sheetLabel(sh, i) { return sh.kind === "title" ? "Titelseite" : sh.kind === "toc" ? "Inhalt" : sh.kind === "legend" ? `Legende ${sh.meta.BLATT}` : sh.kind === "pvtab" ? "Stringübersicht" : `${sh.kind === "dispo" ? "Dispo" : sh.kind === "pv" ? "Stringplan" : "Blatt"} ${sh.meta.BLATT || i + 1}`; }
// Kompakte Leiste: ‹ Blatt 58 · 1 von 12 ▾ › +. Die Mitte öffnet die Liste aller Blätter, + hält eine Auswahl bereit
function renderSheetBar() {
  const n = S.doc.sheets.length, a = S.active, sh = S.doc.sheets[a];
  $("#btn-dxf-all").hidden = n < 2;
  const open = sheetMenu?.open, keep = document.activeElement?.closest?.("#sheetbar") && document.activeElement.id;
  $("#sheetbar").innerHTML = `<button class="sheettab nav" data-step="-1" title="Vorheriges Blatt (Bild auf)" aria-label="Vorheriges Blatt"${a === 0 ? " disabled" : ""}>‹</button>`
    + `<button class="sheettab cur" id="sheet-cur" data-gosheet aria-haspopup="dialog" aria-expanded="${!!open}" title="Liste aller Blätter (G)"><span class="cl">${sh.pin ? "★ " : ""}${R.esc(sheetLabel(sh, a))}</span><span class="of">${a + 1} von ${n}</span><span class="caret" aria-hidden="true">▾</span></button>`
    + `<button class="sheettab nav" data-step="1" title="Nächstes Blatt (Bild ab)" aria-label="Nächstes Blatt"${a === n - 1 ? " disabled" : ""}>›</button>`
    + `<button class="sheettab add" id="sheet-add" data-addsheet aria-haspopup="menu" aria-expanded="false" title="Neu: ${addKindLabel()}. Gedrückt halten oder Rechtsklick: Blatttyp wählen" aria-label="Neu: ${addKindLabel()}">${R.icons.plus}</button>`;
  if (keep) document.getElementById(keep)?.focus();
  if (open) renderSheetList();
}
function renderSheetList() {
  const q = $("#sheet-find").value.trim().toLowerCase();
  const rows = S.doc.sheets.map((sh, i) => ({ sh, i, label: sheetLabel(sh, i), title: sh.meta.TITEL || "" })).filter((r) => !q || `${r.label} ${r.title}`.toLowerCase().includes(q));
  $("#sheet-menu .slist").innerHTML = rows.length ? rows.map(({ sh, i, label, title }) => `<div class="srow"><button class="mi${i === S.active ? " on" : ""}" data-sheet="${i}" tabindex="-1"${i === S.active ? ' aria-current="true"' : ""}><span class="mt"><span class="mh">${R.esc(label)}</span><span class="ms">${R.esc(title || "ohne Titel")}</span></span><span class="pos">${i + 1}</span></button><button class="pin" data-pin="${i}" tabindex="-1" title="${sh.pin ? "Markierung entfernen" : "Blatt markieren"} (M für das aktive Blatt)" aria-label="${sh.pin ? "Markierung entfernen" : "Blatt markieren"}" aria-pressed="${!!sh.pin}">${sh.pin ? "★" : "☆"}</button></div>`).join("") : `<div class="empty">Kein Blatt gefunden</div>`;
}
let sheetMenu = null;
function gotoSheet(opts) { sheetMenu.show($("#sheet-cur"), opts); }
function searchDialog() {
  openSearch({
    doc: () => S.doc,
    goto: (si, id) => { if (si !== S.active) switchSheet(si); S.sel = new Set([id]); renderRight(); renderOverlay(); },
    replace: (fn) => change(fn),
    toast,
  });
}
function stepSheet(d) { const i = S.active + d; if (S.doc.sheets[i]) switchSheet(i); }
function togglePin(i) { const sh = S.doc.sheets[i]; if (sh) change(() => { if (sh.pin) delete sh.pin; else sh.pin = true; }, { panel: false }); }
function toggleDims() {
  if (!isDispo()) return;
  change(() => { if (S.model.dims === false) delete S.model.dims; else S.model.dims = false; }, { panel: false });
}
// Rasterweite, Schalter und Knöpfe an den Typ des angezeigten Blatts anpassen
function syncKind() {
  S.grid.size = S.gridSize[kindKey()];
  const opts = isPv() ? PV_GRID : isDispo() ? [[1, "1 mm"], [5, "5 mm"], [10, "10 mm"], [25, "25 mm"], [50, "50 mm"]] : [[1, "1 mm"], [2.5, "2,5 mm"], [5, "5 mm"]];
  $("#grid-size").innerHTML = opts.map(([v, l]) => `<option value="${v}"${v === S.grid.size ? " selected" : ""}>${l}</option>`).join("");
  $("#mag-on").closest("label").style.display = isDispo() || isPv() || isDeck() ? "none" : "";
  $("#grid-on").closest("label").style.display = $("#grid-size").style.display = isDeck() ? "none" : ""; // Titelseite, Inhalt: nichts zu zeichnen
  $("#btn-handover").hidden = !isDispo();
  renderPvBar();
  $("#dims-on").closest("label").style.display = isDispo() ? "" : "none";
}
// Nach jedem Wechsel des angezeigten Blatts: bei anderem Blatttyp (oder reset) Werkzeug zurücksetzen, Ansicht einpassen, alles neu zeichnen
function afterSheetChange(prevKind, { reset = false, fit = false } = {}) {
  const kindChanged = (prevKind || "schema") !== (S.model.kind || "schema");
  if (kindChanged || reset) { S.tool = "select"; S.placeSym = null; S.sel.clear(); svg.className.baseVal = ""; }
  syncKind(); renderLeft();
  if (kindChanged || fit || isDispo() || isPv()) fitView(); else renderSheet();
  renderSheetBar(); renderItems(); renderOverlay(); renderRight(); updateHint();
}
function switchSheet(i) {
  if (i === S.active || !S.doc.sheets[i]) return;
  finishWire(); closeEditor(false);
  const k0 = S.model.kind;
  S.active = i; S.sel.clear();
  afterSheetChange(k0);
}
function addDispo() {
  setTool("select"); // ein gewähltes Setz-Werkzeug gehört zum alten Blatttyp
  const k0 = S.model.kind;
  const n = S.doc.sheets.filter((sh) => sh.kind === "dispo").length + 1;
  change(() => {
    const sh = newSheet("dispo");
    sh.sid = nextId(); sh.meta.BLATT = String(n);
    S.doc.sheets.push(sh); S.active = S.doc.sheets.length - 1; S.sel.clear();
  });
  afterSheetChange(k0);
}
function addPv() {
  setTool("select");
  const k0 = S.model.kind;
  const n = S.doc.sheets.filter((sh) => sh.kind === "pv").length + 1;
  change(() => {
    const sh = newSheet("pv");
    sh.sid = nextId(); sh.meta.BLATT = String(n);
    S.doc.sheets.push(sh); S.active = S.doc.sheets.length - 1; S.sel.clear();
  });
  afterSheetChange(k0);
}
// Stringübersicht: eine für alle Stringpläne der Datei (CJ 14.10.). Gibt es sie schon, wird sie angezeigt.
function addPvTab() {
  const i = S.doc.sheets.findIndex((sh) => sh.kind === "pvtab");
  if (i >= 0) { switchSheet(i); toast("Die Stringübersicht gibt es schon, sie gilt für alle Stringpläne."); return; }
  setTool("select");
  const k0 = S.model.kind;
  change(() => { const sh = newSheet("pvtab"); sh.meta.BLATT = "1"; S.doc.sheets.push(sh); S.active = S.doc.sheets.length - 1; S.sel.clear(); });
  afterSheetChange(k0);
}
// Plus-Knopf (CJ 16.10.): Blatt vom Typ des aktuellen Blatts. Stringplan und Stringübersicht → Stringplan, Titel, Inhalt, Legende → Schemablatt.
const addKindLabel = () => ({ dispo: "Disposition", pv: "Stringplan", pvtab: "Stringplan" }[S.model.kind] || "Schemablatt");
function addSameKind() { const k = S.model.kind; (k === "dispo" ? addDispo : k === "pv" || k === "pvtab" ? addPv : addSheet)(); }
function addSheet() {
  setTool("select");
  const k0 = S.model.kind;
  change(() => { S.doc.sheets.push(makeSheet(nextSheetNo())); S.active = S.doc.sheets.length - 1; S.sel.clear(); });
  afterSheetChange(k0);
}
// Nächste freie Blattnummer der Schemablätter, neues Schemablatt mit Grundverkabelung
function nextSheetNo() {
  const nums = S.doc.sheets.filter((sh) => !sh.kind || sh.kind === "title" || sh.kind === "toc").map((sh) => parseInt(sh.meta.BLATT, 10)).filter(Number.isFinite);
  return String(nums.length ? Math.max(...nums) + 1 : S.doc.noTitle && S.doc.noToc ? 1 : 3); // erstes Schemablatt: Titelseite und Inhalt kommen dazu (Blatt 1 und 2)
}
function makeSheet(no, { base = true } = {}) { const sh = newSheet(); sh.meta.BLATT = no; if (base) sh.items.push(...baseItems(nextId)); return sh; } // base: false = ohne Grundverkabelung (Blatt aus „An Schema“, CJ 16.10.)
// Titelseite oder Inhaltsverzeichnis löschen (CJ 15.10.). Merkt sich die Datei (noTitle, noToc), sonst kämen sie beim nächsten Schritt wieder.
async function deleteDeck() {
  const k0 = S.model.kind, name = k0 === "title" ? "Titelseite" : "Inhaltsverzeichnis";
  if (k0 !== "title" && k0 !== "toc") return;
  if (!(await confirmDialog(`${name} löschen?`, `${k0 === "title" ? "Die Titelseite mit Bauherr, Firma und Änderungsindex" : "Das Inhaltsverzeichnis"} wird gelöscht und kommt nicht von selbst wieder. Wieder einfügen: + gedrückt halten, „Titelseite und Inhalt“. Rückgängig ist möglich.`, `${name} löschen`))) return;
  setTool("select");
  change(() => { S.doc[k0 === "title" ? "noTitle" : "noToc"] = true; S.active++; S.sel.clear(); }); // aktiv: das Blatt danach
  afterSheetChange(k0);
}
// Gelöschte Titelseite und Inhalt wieder einfügen (nur mit Schemablatt)
function addDeck() {
  setTool("select");
  const k0 = S.model.kind;
  change(() => { delete S.doc.noTitle; delete S.doc.noToc; });
  S.active = Math.max(0, S.doc.sheets.findIndex(T.isDeck)); S.sel.clear();
  afterSheetChange(k0);
}
async function deleteSheet() {
  if (workCount() < 2 || isDeck()) return;
  if (!(await confirmDialog("Blatt löschen?", `${sheetLabel(S.model, S.active)} mit allen Objekten wird gelöscht. Verknüpfte Verweise auf anderen Blättern werden wieder offen. Rückgängig ist möglich.`, "Blatt löschen"))) return;
  setTool("select");
  const k0 = S.model.kind;
  change(() => {
    for (const it of S.model.items) if (isRef(it)) unlinkRef(S.doc, it);
    S.doc.sheets.splice(S.active, 1); S.active = Math.min(S.active, S.doc.sheets.length - 1); S.sel.clear();
    if (isDeck() && S.active > 0) S.active--; // nicht auf die Legende springen, sondern aufs vorherige Arbeitsblatt
  });
  afterSheetChange(k0);
}


// Nach dem Setzen eines Verweises: offene Gegenstücke anbieten. Gibt es keine, wird nicht gefragt.
async function offerLink(it) {
  const open = openCounterparts(S.doc, it);
  if (!open.length) return;
  const same = open.filter((o) => o.same);
  if (it.rname && same.length === 1) { change(() => linkRefs(S.doc, it, same[0].item)); toast(`Hauptlinie ${it.rname} verknüpft mit ${same[0].label}.`); return; }
  const abgehend = SYMBOL_BY_NAME[it.sym].family === "VOUT";
  const r = await chooseDialog("Verknüpfen?", abgehend ? "Mit welchem ankommenden Verweis soll dieser verknüpft werden?" : "Mit welchem abgehenden Verweis soll dieser verknüpft werden?", open.map((o) => ({ label: o.label, item: o.item })));
  if (r?.option) change(() => linkRefs(S.doc, it, r.option.item));
}
async function changeLink(it) {
  const open = openCounterparts(S.doc, it);
  const cur = it.link === undefined ? null : findItem(S.doc, it.link);
  const r = await chooseDialog("Verknüpfung ändern", cur ? `Aktuell verknüpft mit ${refLabel(cur.item, cur.sheet)}. Wähle ein anderes offenes Gegenstück.` : "Wähle ein offenes Gegenstück.", open.map((o) => ({ label: o.label, item: o.item })), cur ? [{ label: "Verknüpfung lösen", unlink: true }] : []);
  if (r?.option) change(() => linkRefs(S.doc, it, r.option.item));
  else if (r?.extra) change(() => unlinkRef(S.doc, it));
}

// ---------- Werkzeuge und Aktionen ----------
function cancelDraft() { S.wireDraft = null; }
function setTool(id) {
  finishWire(); PV.cancel();
  closeEditor(false);
  S.tool = id; if (id !== "place") S.placeSym = null; if (id !== "select") S.sel.clear();
  S.dimDraft = null; S.dimSel = null; draftCancel();
  svg.className.baseVal = id === "hand" ? "cursor-hand" : id === "select" ? "" : id === "text" ? "cursor-text" : "cursor-cross";
  renderLeft(); renderRight(); renderOverlay(); updateHint();
}
function startPlace(name) { finishWire(); closeEditor(false); draftCancel(); S.tool = "place"; S.placeSym = name; S.placeRot = /^V(OUT|IN)_\dP$/.test(name) ? 90 : 0; /* Verweise waagrecht (CJ 16.10.) */ S.sel.clear(); svg.className.baseVal = "cursor-cross"; renderLeft(); renderRight(); renderOverlay(); updateHint(); }

function simplify(pts) {
  const out = [];
  for (const p of pts) { const l = out.at(-1); if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p); }
  for (let i = out.length - 2; i > 0; i--) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) out.splice(i, 1);
  }
  return out;
}
function finishWire() {
  if (!S.wireDraft) return;
  const pts = simplify(S.wireDraft.pts);
  const n = bundleCount();
  S.wireDraft = null;
  if (pts.length >= 2) change(() => {
    if (n > 1) {
      const bundle = nextId();
      bundlePaths(pts, n).forEach((path, i) => S.model.items.push({ id: nextId(), type: "wire", kind: conductorKind(BUNDLE_PRESETS[n][i]), pts: path, bundle }));
    } else S.model.items.push({ id: nextId(), type: "wire", kind: S.wireKind, pts });
    S.sel.clear();
  });
  renderOverlay(); updateHint();
}

// ---------- Hauptlinien: Enden (durchgehend, bei Spalte abschliessen, Verweis auf anderes Blatt) ----------
const isRail = (it) => it && it.type === "wire" && it.tag === "grund";
const railName = (w) => S.model.items.find((t) => t.type === "text" && t.tag === "grund" && Math.abs(t.y + 1 - w.pts[0][1]) < 1e-6)?.s || "";
function railEndX(side, mode) {
  if (mode.startsWith("col:")) return COL_CENTERS[Number(mode.slice(4)) - 1];
  if (mode === "ref") return side === "l" ? RAIL_X0 + 10 : RAIL_X1 - 12;
  return side === "l" ? RAIL_X0 : RAIL_X1;
}
function applyRailEnd(w, side, mode) {
  for (const it of S.model.items.filter((i) => i.rail === w.id && i.side === side)) { if (isRef(it)) unlinkRef(S.doc, it); S.model.items = S.model.items.filter((i) => i !== it); }
  w.ends = { l: w.ends?.l || "edge", r: w.ends?.r || "edge", [side]: mode };
  const x = railEndX(side, mode), y = w.pts[0][1];
  if (side === "l") w.pts[0][0] = x; else w.pts[w.pts.length - 1][0] = x;
  if (mode !== "ref") return null;
  const name = side === "l" ? "VIN_1P" : "VOUT_1P";
  const sym = SYMBOL_BY_NAME[name];
  const ref = { id: nextId(), type: "symbol", sym: name, x: side === "l" ? x - 5 : x, y, rot: 90, attrs: Object.fromEntries(sym.attrs.map((a) => [a.tag, a.def])), rail: w.id, side, rname: railName(w) };
  S.model.items.push(ref);
  return ref.id;
}

function addSymbol(name, x, y, rot) {
  const sym = SYMBOL_BY_NAME[name];
  let placed = null;
  change(() => {
    const dev = { id: nextId(), type: "symbol", sym: name, x, y, rot, attrs: Object.fromEntries(sym.attrs.map((a) => [a.tag, a.def])) };
    S.model.items.push(dev);
    if (isDevice(sym) && !columnHasTerminals(S.model.items, dev)) S.model.items.push(deviceTerminals(dev, S.model.items, nextId));
    placed = dev;
  });
  if (placed && isRef(placed)) offerLink(S.model.items.find((i) => i.id === placed.id));
}
// Abgang aus einer Vorlage in Spalte col: ein Rückgängig-Schritt, BMK und Klemmen nummerieren sich danach (renumberAll)
function addAbgang(tpl, col) {
  const a = abgangItems(tpl, col, S.model.items, () => 0);
  if (a.error) { toast(a.error, "error"); return; }
  change(() => { const b = abgangItems(tpl, col, S.model.items, nextId); S.model.items.push(...b.items); });
}
function addTerminals(x, y) { change(() => S.model.items.push({ id: nextId(), ...newTerminals(x, y) })); }
// Stringplan „Module einschränken“ (5bc): die Auswahl sind Module für die Autoverkabelung, nicht zum Bearbeiten
const pickMode = () => isPv() && PV.picking();
function deleteSelected() {
  if (pickMode()) return;
  if (!S.sel.size) { hideDimSel(); return; } // gewähltes automatisches Mass der Disposition ausblenden
  change(() => {
    const gone = new Set([...S.sel, ...linkedTerminals(S.model.items, S.sel).map((t) => t.id), ...wmParts(S.model.items, S.sel).map((t) => t.id)]);
    for (const it of S.model.items) if (it.rail !== undefined && gone.has(it.rail)) gone.add(it.id); // Verweise am Ende einer gelöschten Hauptlinie
    for (const it of S.model.items) if (gone.has(it.id) && isRef(it)) unlinkRef(S.doc, it);
    S.model.items = S.model.items.filter((i) => !gone.has(i.id)); S.sel.clear();
    if (isPv()) pruneStrings(S.model); // Stringplan: gelöschte Module verlassen ihren String
  });
}
// Zu einem Gerät gehörende Klemmenleisten folgen ihm seitlich, Zähler und Leitungen der Wandlermessung ganz (wandler.js)
const followers = (items) => { const ids = new Set(items.map((i) => i.id)); return [...linkedTerminals(S.model.items, ids), ...wmParts(S.model.items, ids)].filter((t) => !ids.has(t.id)); };
const followDy = (t, dy) => (t.type === "terminals" ? 0 : dy);
function rotateSelected() {
  if (S.tool === "place") { S.placeRot = (S.placeRot + 90) % 360; renderOverlay(); return; }
  const syms = selectedItems().filter((i) => i.type === "symbol");
  if (syms.length) change(() => syms.forEach((i) => { i.rot = (i.rot + 90) % 360; }), { panel: false });
}
// Kopiert Objekte mit neuen IDs. src = Objekte, selIds = die davon, die danach ausgewählt sein sollen.
// Zugehörige Klemmenleisten behalten ihre Höhe. Verknüpfungen und Grundverkabelungs-Markierung entfallen.
function cloneItems(src, selIds, dx, dy) {
  const ids = new Set(), bundles = new Map(), idMap = new Map(), copies = [];
  for (const it of src) {
    if (it.type === "pvstring") continue; // Strings nicht kopieren: ein Modul gehört nur zu einem String
    const c = JSON.parse(JSON.stringify(it)); c.id = nextId(); idMap.set(it.id, c.id);
    delete c.tag; delete c.link; delete c.ends; delete c.rail; delete c.side; delete c.rname; delete c.main;
    if (c.bundle !== undefined) { if (!bundles.has(c.bundle)) bundles.set(c.bundle, nextId()); c.bundle = bundles.get(c.bundle); }
    if (c.pts) c.pts = c.pts.map((p) => [round3(p[0] + dx), round3(p[1] + dy)]);
    else { c.x = round3(c.x + dx); if (!(c.type === "terminals" && c.of !== undefined)) c.y = round3(c.y + dy); }
    S.model.items.push(c); copies.push(c);
    if (selIds.has(it.id)) ids.add(c.id);
  }
  for (const c of copies) if (c.of !== undefined) { if (idMap.has(c.of)) c.of = idMap.get(c.of); else { delete c.of; delete c.wm; } }
  return ids;
}
function duplicateSelected() {
  if (pickMode()) return;
  const sel = selectedItems();
  if (!sel.length) return;
  const d = S.grid.on ? Math.max(5, S.grid.size) : 5;
  change(() => { S.sel = cloneItems([...sel, ...followers(sel), ...dispoExtras(sel)], S.sel, d, -d); });
}
// Zwischenablage (nur in dieser Sitzung, auch für andere Blätter)
function copySelected() {
  if (pickMode()) return;
  const sel = selectedItems();
  if (!sel.length) return;
  S.clip = { items: JSON.parse(JSON.stringify([...sel, ...followers(sel), ...dispoExtras(sel)])), sel: new Set(sel.map((i) => i.id)), sheet: S.active, pasted: 0, kind: S.model.kind || "schema" };
  toast(sel.length === 1 ? "1 Objekt kopiert" : `${sel.length} Objekte kopiert`);
}
function pasteClip() {
  if (!S.clip) return;
  const c = S.clip;
  if (c.kind !== (S.model.kind || "schema")) { toast("Dieses Blatt hat einen anderen Typ. Einfügen geht nur zwischen Blättern gleichen Typs.", "error"); return; }
  const d = S.grid.on ? Math.max(5, S.grid.size) : 5;
  const k = c.sheet === S.active ? ++c.pasted : 0; // auf demselben Blatt versetzt, auf einem anderen an gleicher Stelle
  change(() => { S.sel = cloneItems(c.items, c.sel, k * d, -k * d); });
}
function nudge(dx, dy) {
  if (pickMode()) return;
  const items = selectedItems();
  if (!items.length) return;
  const links = wireLinks([...items, ...followers(items)]);
  change(() => { items.forEach((it) => moveItem(it, dx, dy)); followers(items).forEach((t) => moveItem(t, dx, followDy(t, dy))); dispoExtras(items).forEach((it) => moveItem(it, dx, dy)); followWires(links); }, { panel: false });
}
function moveItem(it, dx, dy) {
  if (it.type === "pvstring") return; // folgt seinen Modulen
  if (it.pts) it.pts = it.pts.map((p) => [round3(p[0] + dx), round3(p[1] + dy)]); else { it.x = round3(it.x + dx); it.y = round3(it.y + dy); }
}

// ---------- Leitungen folgen dem Gerät, Leitungspunkte ziehen ----------
// Nicht mitverschobene Leitungen, deren Ende auf einem Pin eines verschobenen Geräts (oder einer Klemmenleiste) liegt.
function wireLinks(movers) {
  const devs = isDispo() ? [] : movers.filter((i) => i.type === "symbol" || i.type === "terminals");
  if (!devs.length) return [];
  const moving = new Set(movers.map((i) => i.id));
  const owner = (p) => { const o = devs.find((d) => R.allPins([d]).some((q) => Math.abs(q.x - p[0]) < 1e-3 && Math.abs(q.y - p[1]) < 1e-3)); return o && { it: o, x: o.x, y: o.y }; };
  const out = [];
  for (const w of S.model.items) {
    if (w.type !== "wire" || moving.has(w.id)) continue;
    const a = owner(w.pts[0]), b = owner(w.pts.at(-1));
    if (a || b) out.push({ w, pts: w.pts.map((p) => [...p]), a, b });
  }
  return out;
}
function followWires(links) {
  const off = (o) => (o ? [round3(o.it.x - o.x), round3(o.it.y - o.y)] : [0, 0]);
  for (const l of links) {
    const oa = off(l.a), ob = off(l.b);
    if (oa[0] === ob[0] && oa[1] === ob[1]) { l.w.pts = l.pts.map((p) => [round3(p[0] + oa[0]), round3(p[1] + oa[1])]); continue; }
    if (l.w.wm !== undefined) { const a = l.pts[0], b = l.pts.at(-1); l.w.pts = routeWm([round3(a[0] + oa[0]), round3(a[1] + oa[1])], [round3(b[0] + ob[0]), round3(b[1] + ob[1])], l.w.wm); continue; } // Wandlermessung: gestaffelt
    let r = l.pts;
    if (oa[0] || oa[1]) r = moveEnd(r, oa, l.w, true);
    if (ob[0] || ob[1]) r = moveEnd(r.slice().reverse(), ob, l.w, true).reverse();
    l.w.pts = simplify(r);
  }
}
// Verschiebt den ersten Punkt einer Leitung, waagrechte und senkrechte Führung bleibt erhalten:
// der nächste Eckpunkt geht mit; ist der Nachbar das andere Ende, gleitet es auf einer Schiene mit (slide) oder es entsteht ein Versatz in der Mitte.
function moveEnd(pts, [dx, dy], self, slide) {
  const p = pts.map((q) => [...q]), [a, b] = p, c = p[2];
  const nx = round3(a[0] + dx), ny = round3(a[1] + dy), vert = a[0] === b[0], hor = a[1] === b[1];
  p[0] = [nx, ny];
  if ((!vert && !hor) || (vert && !dx) || (hor && !dy)) return p;
  if (c && (vert ? b[1] === c[1] : b[0] === c[0])) { if (vert) b[0] = nx; else b[1] = ny; return p; }
  if (!c && slide) { const s = vert ? [nx, b[1]] : [b[0], ny]; if (R.onWire(S.model.items, s[0], s[1], self)) return [p[0], s]; }
  const g = S.grid.on ? S.grid.size : 0.5, mid = (u, v) => round3(Math.round((u + v) / 2 / g) * g);
  if (vert) { const ym = mid(ny, b[1]); return [p[0], [nx, ym], [b[0], ym], ...p.slice(1)]; }
  const xm = mid(nx, b[0]);
  return [p[0], [xm, ny], [xm, b[1]], ...p.slice(1)];
}
// Ein Punkt einer Leitung wird gezogen (Ende oder Eckpunkt)
function dragVertex(pts, i, dx, dy, self) {
  const n = pts.length;
  if (i === 0) return moveEnd(pts, [dx, dy], self, false);
  if (i === n - 1) return moveEnd(pts.slice().reverse(), [dx, dy], self, false).reverse();
  const left = moveEnd(pts.slice(0, i + 1).reverse(), [dx, dy], self, false).reverse(), right = moveEnd(pts.slice(i), [dx, dy], self, false);
  return [...left, ...right.slice(1)];
}
// Punkt einer gewählten Leitung unter dem Mauszeiger
function vertexAt(x, y) {
  const tol = Math.max(0.9, 6 / S.view.z);
  for (const w of selectedItems()) {
    if (w.type !== "wire") continue;
    const i = w.pts.findIndex((p) => Math.hypot(p[0] - x, p[1] - y) <= tol);
    if (i >= 0) return { w, i };
  }
  return null;
}

// Ein Leiterbündel wird als Ganzes gewählt. Mit Alt wählt man einen einzelnen Leiter.
function groupIds(hit, single) {
  if (single || hit.type !== "wire" || hit.bundle === undefined) return [hit.id];
  return S.model.items.filter((i) => i.type === "wire" && i.bundle === hit.bundle).map((i) => i.id);
}

function hitTest(x, y, items = pickable(), px = 5) { // px: Toleranz in Bildschirmpunkten (Finger: grösser)
  const tol = Math.max(0.9, px / S.view.z);
  for (let i = items.length - 1; i >= 0; i--) if (!D.isBack(items[i]) && R.hitItem(items[i], x, y, tol)) return items[i];
  for (let i = items.length - 1; i >= 0; i--) if (items[i].type === "plate" && R.hitItem(items[i], x, y, tol)) return items[i];
  for (let i = items.length - 1; i >= 0; i--) if (items[i].type === "cabinet" && R.hitItem(items[i], x, y, tol)) return items[i]; // Schrank zuletzt
  return null;
}

// ---------- Texteingabe ----------
function openEditor(wx, wy, item, mass = null) {
  const p = toScreen(wx, wy);
  S.editing = { x: wx, y: wy, id: item ? item.id : null, snap: snapshot(), mass };
  editor.hidden = false; editor.value = item ? item.s : mass ? D.fmtMass(mass.v) : "";
  editor.classList.toggle("mass", !!mass);
  if (mass) setTimeout(() => editor.select(), 0);
  editor.style.left = Math.max(4, p.x - 4) + "px";
  editor.style.top = Math.max(4, p.y - 34) + "px";
  setTimeout(() => editor.focus(), 0);
}
function closeEditor(commit) {
  if (!S.editing || editor.hidden) { editor.hidden = true; S.editing = null; return; }
  const e = S.editing; S.editing = null; editor.hidden = true;
  const v = editor.value.trim();
  if (!commit || !v) return;
  if (e.mass) {
    const it = S.model.items.find((i) => i.id === e.mass.id), n = parseFloat(v.replace(",", "."));
    if (it && n > 0 && n !== e.mass.v) change(() => applyMass(it, e.mass.key, n));
    return;
  }
  if (e.id) { const it = S.model.items.find((i) => i.id === e.id); if (it && it.s !== v) change(() => { it.s = v; }); }
  else change(() => { const id = nextId(); S.model.items.push({ id, type: "text", x: e.x, y: e.y, h: textH(), s: v, ...(isPv() ? { layer: PV.activeLayer() } : {}) }); });
}
editor.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") closeEditor(true); else if (e.key === "Escape") closeEditor(false); });
editor.addEventListener("blur", () => closeEditor(true));

// ---------- Zeiger ----------
// Titelseite, Inhalt, Legende: nichts zeichnen. Inhalt: Zeile springt zum Blatt, Legende: Zeile wählt das Gerät
function deckTap(target) {
  const row = target.closest?.("[data-sheet]"), dev = target.closest?.("[data-dev]");
  if (row) switchSheet(Number(row.dataset.sheet));
  else if (S.model.kind === "legend") { S.legSel = dev ? Number(dev.dataset.dev) : null; renderSheet(); renderRight(); }
}
// Mobilansicht (mobil.js): Finger schiebt und zoomt, Antippen wählt (mit grösserer Toleranz), darunter die Felder
const touch = makeTouch({ S, stage, pointerPos, zoomAt, applyView, renderOverlay, tap: (e) => {
  if (!editor.hidden) closeEditor(true);
  if (isDeck()) { deckTap(e.target); return; }
  const { sx, sy } = pointerPos(e), w = toWorld(sx, sy);
  const hit = isPv() ? hitTest(w.x, w.y, PV.layerPick(), 14) : hitTest(w.x, w.y, pickable(), 14);
  S.sel = hit ? new Set(groupIds(hit, false)) : new Set();
  renderRight(); renderOverlay();
} });
stage.addEventListener("pointerdown", (e) => {
  if (touch.down(e)) return;
  if (e.target.closest("#zoombar, #sheetbar") || e.target === editor) return;
  if (!editor.hidden) closeEditor(true);
  svg.focus({ preventScroll: true });
  const { sx, sy } = pointerPos(e);
  if (e.button === 1 || S.tool === "hand" || S.space) { S.drag = { type: "pan", sx, sy, vx: S.view.x, vy: S.view.y }; stage.setPointerCapture(e.pointerId); svg.classList.add("cursor-grabbing"); return; }
  if (e.button === 2) { if (S.wireDraft) finishWire(); else if (S.tool === "place") setTool("select"); return; }
  if (e.button !== 0) return;
  if (isDeck()) { deckTap(e.target); return; }
  stage.setPointerCapture(e.pointerId);
  const w = toWorld(sx, sy);
  const add = isPv() && (e.metaKey || e.ctrlKey); // Stringplan: ⌘ + Klick oder Rahmen ergänzt die Auswahl, nur aktive Ebene (5o)
  const ha = S.tool === "select" && !e.shiftKey ? handleAt(w.x, w.y) : null;
  if (ha) {
    const o = JSON.parse(JSON.stringify(ha.it));
    S.drag = { type: "handle", it: ha.it, h: ha.h, orig: o, px: sx, py: sy, started: false, snap: snapshot(),
      rails: ha.it.type === "plate" ? D.contained(S.model.items, ha.it).filter((i) => i.type === "rail" && !i.free).map((r) => ({ r, o: { ...r }, full: D.railIsFull(r, ha.it) })) : [],
      plate: ha.it.type === "rail" && !ha.it.free ? plateAt(o.x + o.len / 2, o.y) : null }; // freie Schiene: ohne Plattenrand
  } else if (S.tool === "select" && !e.shiftKey && !hitTest(w.x, w.y) && autoDimPick(w.x, w.y)) { // automatisches Mass wählen (ausblenden mit Entf)
    S.sel.clear(); S.dimSel = autoDimPick(w.x, w.y); renderRight(); renderOverlay();
  } else if (massAt(w.x, w.y) && !hitTest(w.x, w.y)) { /* Mass: Doppelklick öffnet die Eingabe, die Auswahl bleibt */
  } else if (isPv() && S.tool === "select" && !e.shiftKey && !add && PV.gripAt(w)) {
    const g = PV.gripAt(w); // Punkt einer Dachlinie, Sperrfläche oder Leitung ziehen, oder Text eines Punkts (label)
    S.drag = { type: "pvvertex", it: g.it, i: g.i, label: !!g.label, px: sx, py: sy, started: false, snap: snapshot() };
  } else if (S.tool === "select" && !e.shiftKey && vertexAt(w.x, w.y)) {
    const v = vertexAt(w.x, w.y);
    S.drag = { type: "vertex", w: v.w, i: v.i, pts: v.w.pts.map((p) => [...p]), px: sx, py: sy, started: false, snap: snapshot() };
  } else if (S.tool === "select") {
    S.dimSel = null;
    const hit = isPv() ? hitTest(w.x, w.y, PV.layerPick()) : hitTest(w.x, w.y); // Stringplan: Klick, Shift und ⌘ nur auf der aktiven Ebene (5s)
    const other = add && !hit && hitTest(w.x, w.y, PV.otherLayers());
    if (other) toast(PV.layerNote(other)); // ⌘ + Klick auf ein Objekt einer anderen Ebene (5w)
    if (hit) {
      const ids = groupIds(hit, e.altKey);
      if (e.shiftKey || add) { const on = S.sel.has(hit.id); for (const id of ids) on ? S.sel.delete(id) : S.sel.add(id); }
      else if (!S.sel.has(hit.id)) S.sel = new Set(ids);
      const extras = dispoExtras(selectedItems());
      S.drag = { type: "move", sx0: w.x, sy0: w.y, px: sx, py: sy, started: false, snap: snapshot(), extras, links: wireLinks([...selectedItems(), ...followers(selectedItems())]), orig: new Map([...selectedItems(), ...followers(selectedItems()), ...extras].map((i) => [i.id, JSON.parse(JSON.stringify(i))])) };
    } else {
      const base = e.shiftKey || add ? new Set(S.sel) : new Set();
      S.sel = new Set(base);
      S.drag = { type: "band", x0: w.x, y0: w.y, x1: w.x, y1: w.y, base };
    }
    renderRight(); renderOverlay();
  } else if (isPv() && PV.pointerDown(w, e)) { /* Messstrecke, Fixpunkt, Werkzeuge des Stringplans */
  } else if (S.tool === "dim" && isDispo()) {
    dimDown(); renderOverlay(); renderRight();
  } else if (S.tool === "place" && isDispo()) {
    const c = dispoSnap(w.x, w.y);
    if (placeDown(c)) { renderOverlay(); updateHint(); } else addDispoItem(newDispoItem(S.placeSym, c.x, c.y, c)); // Schienen N/PE/PEN, Zuleitung, Vorlage: eigene Klickfolge
  } else if (S.tool === "place") {
    const c = snap(w.x, w.y, { pins: false, mag: true, offX: placeOffX() });
    if (templateOf(S.placeSym)) addAbgang(templateOf(S.placeSym), colOf(w.x));
    else if (S.placeSym === TERMINALS) addTerminals(c.x, c.y); else addSymbol(S.placeSym, c.x, c.y, S.placeRot);
  } else if (S.tool === "wire") {
    let c = snap(w.x, w.y, { mag: true });
    // Pin eines mehrpoligen Geräts (Start oder Ende): alle Pole als Bündel, Alt = nur ein Leiter
    const g = c.pin && !e.altKey ? R.poleGroup(S.model.items, c.x, c.y) : null;
    if (g) c = { ...c, x: g.x, y: g.y };
    if (!S.wireDraft) S.wireDraft = { pts: [[c.x, c.y]], n: g && S.bundleN === 1 ? g.n : 0, pin: !!c.pin };
    else {
      if (g && !S.wireDraft.n && S.bundleN === 1) S.wireDraft.n = g.n;
      const last = S.wireDraft.pts.at(-1);
      if (Math.hypot(c.x - last[0], c.y - last[1]) < 1e-6) { finishWire(); return; }
      S.wireDraft.pts.push(...draftPath(c));
    }
    renderOverlay(); updateHint();
  } else if (S.tool === "text") {
    const c = isPv() ? PV.snap(w) : snap(w.x, w.y, { pins: false, mag: true });
    openEditor(c.x, c.y, null);
  }
});

stage.addEventListener("pointermove", (e) => {
  if (touch.move(e)) return;
  const { sx, sy } = pointerPos(e);
  S.shift = e.shiftKey;
  const w = toWorld(sx, sy);
  const d = S.drag;
  if (d && d.type === "pan") { S.view.x = d.vx + (sx - d.sx); S.view.y = d.vy + (sy - d.sy); applyView(); return; }
  S.alt = e.altKey;
  S.mouse = isPv() ? PV.snap(w) : isDispo() ? dispoSnap(w.x, w.y) : snap(w.x, w.y, { pins: S.tool === "wire", mag: S.tool !== "select" && S.tool !== "hand", offX: S.tool === "place" ? placeOffX() : 0 });
  if (S.tool === "wire" && S.mouse.pin && !e.altKey) { const g = R.poleGroup(S.model.items, S.mouse.x, S.mouse.y); if (g) S.mouse = { ...S.mouse, x: g.x, y: g.y }; }
  $("#coords").textContent = `x ${fmt(w.x)}  y ${fmt(w.y)} mm`;
  if (d && d.type === "move") {
    if (!d.started && Math.hypot(sx - d.px, sy - d.py) > 3) d.started = true;
    if (d.started) {
      const g = S.grid.on ? S.grid.size : 0.1;
      let dx = round3(Math.round((w.x - d.sx0) / g) * g), dy = round3(Math.round((w.y - d.sy0) / g) * g);
      const mover = d.extras ? [...selectedItems(), ...d.extras] : selectedItems();
      const plan = isDispo() ? selectedItems().filter((i) => D.PLAN_TYPES.has(i.type)) : [];
      if (plan.length) {
        const b0 = D.unionBox(plan.map((i) => D.itemBBox(d.orig.get(i.id)))), b = { x0: b0.x0 + dx, x1: b0.x1 + dx, y0: b0.y0 + dy, y1: b0.y1 + dy };
        const k = guideSnap(b, edgesX(b), edgesY(b), new Set(mover.map((i) => i.id)));
        dx = round3(dx + k.dx); dy = round3(dy + k.dy);
      }
      for (const it of mover) { const o = d.orig.get(it.id); if (!o || it.type === "pvstring") continue; if (it.pts) it.pts = o.pts.map((p) => [round3(p[0] + dx), round3(p[1] + dy)]); else { it.x = round3(o.x + dx); it.y = round3(o.y + dy); } }
      // Ein einzelnes Gerät rastet beim Ziehen auf einer Schiene ein
      if (isDispo() && mover.length === 1 && mover[0].type === "device") {
        const it = mover[0], o = d.orig.get(it.id), r = D.snapDevice(S.model.items, o.x + dx, o.y + dy, it.te, it.id);
        if (r) { it.x = r.x; it.y = r.y; S.guides = []; }
      }
      // Eine einzelne Schiene in einer Platte behält ihre Länge, bleibt aber innerhalb des 20-mm-Randes (höchstens Platte − 40 mm)
      if (isDispo() && mover.length === 1 && mover[0].type === "rail" && !mover[0].free) {
        const it = mover[0], o = d.orig.get(it.id), pl = plateAt(it.x + o.len / 2, it.y), x = it.x;
        Object.assign(it, pl ? D.railClamp({ x: it.x, len: o.len }, pl) : { len: o.len });
        if (it.x !== x) S.guides = S.guides.filter((l) => l.y1 === l.y2); // am Rand begrenzt: senkrechte Hilfslinie stimmt nicht mehr
      }
      for (const t of followers(mover)) { const o = d.orig.get(t.id); if (!o) continue; if (o.pts) t.pts = o.pts.map((p) => [round3(p[0] + dx), round3(p[1] + dy)]); else { t.x = round3(o.x + dx); t.y = round3(o.y + followDy(t, dy)); } }
      followWires(d.links);
      renumberAll(S.doc);
      renderItems();
    }
  } else if (d && d.type === "handle") {
    if (!d.started && Math.hypot(sx - d.px, sy - d.py) > 3) d.started = true;
    if (d.started) { dragHandle(d, snapBase(w.x, w.y, false)); renderItems(); }
  } else if (d && d.type === "vertex") {
    if (!d.started && Math.hypot(sx - d.px, sy - d.py) > 3) d.started = true;
    if (d.started) {
      const end = d.i === 0 || d.i === d.pts.length - 1, c = snapBase(w.x, w.y, end, d.w), q = d.pts[d.i];
      d.w.pts = dragVertex(d.pts, d.i, round3(c.x - q[0]), round3(c.y - q[1]), d.w);
      renderItems();
    }
  } else if (d && d.type === "pvvertex") {
    if (!d.started && Math.hypot(sx - d.px, sy - d.py) > 3) { d.started = true; updateHint(); }
    if (d.started) { PV.dragGrip(d, S.mouse); renderItems(); }
  } else if (d && d.type === "band") { d.x1 = w.x; d.y1 = w.y; }
  if (!d && isPv()) PV.hover(S.mouse); // String: ⌥ halten und über Module fahren (Schritt 5c)
  if (!d) { const ha = isDispo() && handleAt(w.x, w.y); svg.style.cursor = ha ? HANDLE_CURSOR[ha.h] : isPv() && S.tool === "select" && PV.gripAt(w) ? "move" : ""; }
  renderOverlay();
});

function endDrag(e) {
  const d = S.drag; S.drag = null; S.guides = [];
  svg.classList.remove("cursor-grabbing");
  if (!d) return;
  if (d.type === "move" && d.started) { renumberAll(S.doc); pushUndo(d.snap); markDirty(); renderItems(); renderOverlay(); }
  else if (d.type === "handle" && d.started) { pushUndo(d.snap); markDirty(); renderItems(); renderOverlay(); renderRight(); }
  else if (d.type === "vertex" && d.started) { d.w.pts = simplify(d.w.pts); pushUndo(d.snap); markDirty(); renderItems(); renderOverlay(); }
  else if (d.type === "pvvertex" && d.started) { pushUndo(d.snap); markDirty(); renderItems(); renderOverlay(); renderRight(); updateHint(); }
  else if (d.type === "band") {
    const b = { x0: Math.min(d.x0, d.x1), y0: Math.min(d.y0, d.y1), x1: Math.max(d.x0, d.x1), y1: Math.max(d.y0, d.y1) };
    if (b.x1 - b.x0 > 0.5 || b.y1 - b.y0 > 0.5) {
      // Eine Platte wird nur gewählt, wenn der Rahmen ihren Rand kreuzt oder sie ganz umschliesst. Ein Rahmen innerhalb der Platte wählt nur den Inhalt.
      const inside = (pb) => b.x0 >= pb.x0 && b.x1 <= pb.x1 && b.y0 >= pb.y0 && b.y1 <= pb.y1;
      const hit = (isPv() ? PV.layerPick() : pickable()).filter((it) => R.boxesIntersect(R.itemBBox(it), b) && !(D.isBack(it) && inside(R.itemBBox(it)))).map((i) => i.id);
      S.sel = new Set([...d.base, ...hit]);
    }
    renderRight(); renderOverlay();
  }
}
stage.addEventListener("pointerup", (e) => { if (!touch.up(e)) endDrag(e); });
stage.addEventListener("pointercancel", (e) => { if (!touch.up(e)) endDrag(e); });
stage.addEventListener("pointerleave", () => { if (!S.drag) { S.mouse = null; renderOverlay(); } });
stage.addEventListener("contextmenu", (e) => e.preventDefault());
stage.addEventListener("dblclick", (e) => {
  if (S.tool !== "select" || e.target.closest("#zoombar, #sheetbar")) return;
  const { sx, sy } = pointerPos(e); const w = toWorld(sx, sy);
  const m = massAt(w.x, w.y);
  if (m) { openEditor(m.x, m.y, null, { id: m.it.id, key: m.key, v: m.v }); return; }
  const hit = isPv() ? hitTest(w.x, w.y, PV.layerPick()) : hitTest(w.x, w.y);
  if (!hit) return;
  if (hit.type === "text") openEditor(hit.x, hit.y, hit);
  else if (hit.type === "pvpoint") openEditor(...pointLabel(hit), hit); // Punkt mit Beschriftung (5ay)
  else if (hit.type === "symbol") { const i = rightEl.querySelector("input[data-attr]"); if (i) { i.focus(); i.select(); } }
  else if (hit.type === "device") { const i = rightEl.querySelector('input[data-dp="bmk"]'); if (i) { i.focus(); i.select(); } }
});
stage.addEventListener("wheel", (e) => {
  e.preventDefault();
  const { sx, sy } = pointerPos(e);
  if (e.ctrlKey || e.metaKey) zoomAt(sx, sy, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.004)));
  else { S.view.x -= e.deltaX; S.view.y -= e.deltaY; applyView(); renderOverlay(); }
}, { passive: false });

// ---------- Tastatur ----------
// Tasten 1 bis 4 und N (CJ 16.10.): beim Setzen die Variante des neuen Symbols, sonst die des einen gewählten Symbols
function poleKey(key) {
  if (isPv() || isDispo()) return false;
  if (S.tool === "place") {
    if (S.placeSym === TERMINALS || templateOf(S.placeSym)) return false;
    const v = variantByKey(S.placeSym, key);
    if (!v) return (key === "t" || key === "T") && hasTrenner(S.placeSym); // T nicht als Text-Werkzeug, wenn die Familie einen N-Trenner kennt
    S.placeSym = v; renderLeft(); renderRight(); renderOverlay(); updateHint();
    return true;
  }
  const sel = selectedItems();
  if (S.tool !== "select" || sel.length !== 1 || sel[0].type !== "symbol") return false;
  const one = sel[0], v = variantByKey(one.sym, key);
  if (!v) return (key === "t" || key === "T") && hasTrenner(one.sym);
  pushUndo(); one.sym = v;
  for (const tt of linkedTerminals(S.model.items, new Set([one.id]))) if (!parseCable(tt.cable)) tt.n = SYMBOL_BY_NAME[one.sym].poles + 1;
  afterChange();
  return true;
}

window.addEventListener("keydown", (e) => {
  if ($("#modal-root .modal-back")) return; // Dialog offen: keine Tastenkürzel
  const t = e.target;
  const typing = t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA");
  const mod = e.metaKey || e.ctrlKey;
  if (mod && !typing) {
    const k = e.key.toLowerCase();
    if (k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (k === "y") { e.preventDefault(); redo(); return; }
    if (k === "s") { e.preventDefault(); saveJson(e.shiftKey); return; }
    if (k === "o") { e.preventDefault(); openJson(); return; }
    if (k === "d") { e.preventDefault(); duplicateSelected(); return; }
    if (k === "c") { e.preventDefault(); copySelected(); return; }
    if (k === "v") { e.preventDefault(); pasteClip(); return; }
    if (k === "f") { e.preventDefault(); searchDialog(); return; }
    if (isPv() && /^Digit[1-5]$/.test(e.code)) { e.preventDefault(); PV.setActive(DRAW_LAYERS[Number(e.code.slice(5)) - 1]); return; } // aktive Ebene
    if (k === "a") { e.preventDefault(); S.sel = new Set((isPv() ? PV.layerPick() : pickable()).map((i) => i.id)); renderRight(); renderOverlay(); return; } // Stringplan: nur aktive Ebene (5n)
  }
  if (mod && typing && e.key.toLowerCase() === "s") { e.preventDefault(); saveJson(false); return; }
  if (typing) { if (e.key === "Escape") t.blur(); return; }
  if (e.key === " ") { e.preventDefault(); if (!S.space) { S.space = true; svg.classList.add("cursor-hand"); } return; }
  if (e.key === "Shift") { S.shift = true; renderOverlay(); }
  if (e.key === "Alt") S.alt = true;
  if (isPv() && e.key === "Tab" && !mod && !e.altKey && PV.cornerKey(e.shiftKey)) { e.preventDefault(); return; } // Bezugsecke bei Modul und Modulfeld (5x)
  if (isDispo() && e.key === "Tab" && !mod && !e.altKey && dispoCornerKey(e.shiftKey)) { e.preventDefault(); renderRight(); renderOverlay(); updateHint(); return; } // Bezugsecke neuer Platten (CJ 16.10.)
  if (isPv() && !mod && !e.altKey && PV.toolKey(e.key)) return; // S, P, E, B: Werkzeuge des Stringplans (Schritt 5d)
  if (!mod && !e.altKey && poleKey(e.key)) { e.preventDefault(); return; } // 1 bis 4 und N: Polzahl (CJ 16.10.)
  switch (e.key) {
    case "v": case "V": setTool("select"); break;
    case "l": case "L": if (!isDispo() && !isPv()) setTool("wire"); break;
    case "t": case "T": setTool("text"); break;
    case "h": case "H": setTool("hand"); break;
    case "f": case "F": fitView(); break;
    case "r": case "R": rotateSelected(); break;
    case "y": case "Y": if (!mod) toggleDims(); break;
    case "m": case "M": if (!mod) togglePin(S.active); break;
    case "b": case "B": if (!mod && isDispo()) setTool("dim"); break;
    case "g": case "G": if (!mod) { e.preventDefault(); gotoSheet({ instant: true }); } break;
    case "PageUp": e.preventDefault(); stepSheet(-1); break;
    case "PageDown": e.preventDefault(); stepSheet(1); break;
    case "+": case "=": { const r = svg.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.25); break; }
    case "-": { const r = svg.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 0.8); break; }
    case "Delete": case "Backspace": e.preventDefault(); deleteSelected(); break;
    case "Enter": if (S.wireDraft) finishWire(); else if (PV.cancel() || draftFinish()) { renderOverlay(); updateHint(); } break;
    case "Escape":
      if (PV.cancel(true) || dimCancel() || draftEsc()) { renderOverlay(); updateHint(); } // true: Leitung im Entstehen verwerfen (5ax)
      else if (S.wireDraft) { S.wireDraft.pts.length >= 2 ? finishWire() : (cancelDraft(), renderOverlay(), updateHint()); }
      else if (S.tool !== "select") setTool("select");
      else if (S.sel.size) { S.sel.clear(); renderRight(); renderOverlay(); }
      break;
    case "ArrowLeft": case "ArrowRight": case "ArrowUp": case "ArrowDown": {
      if (!S.sel.size) break;
      e.preventDefault();
      const step = (S.grid.on ? S.grid.size : 1) * (e.shiftKey ? 5 : 1);
      nudge(e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0);
      break;
    }
    default:
  }
});
window.addEventListener("keyup", (e) => {
  if (e.key === " ") { S.space = false; if (S.tool !== "hand") svg.classList.remove("cursor-hand"); }
  if (e.key === "Shift") { S.shift = false; renderOverlay(); }
  if (e.key === "Alt") S.alt = false;
});

// ---------- Seitenleisten-Ereignisse ----------
leftEl.addEventListener("click", async (e) => {
  const a = e.target.closest("[data-libact]"), del = e.target.closest("[data-libdel]");
  if (a) {
    const act = a.dataset.libact;
    if (act === "import") importSymbols(); else if (act === "load") loadLibrary(); else if (act === "cloud") cloudLibraries();
    else if (act === "save") { const lib = LIBS.libs.find((l) => l.name === a.dataset.lib); if (lib) { download(`${safeName(lib.name)}.schemacad-lib.json`, LIBS.libFileText(lib), "application/octet-stream"); toast("Bibliothek in den Download-Ordner geladen."); } }
    return;
  }
  if (del) {
    const sym = SYMBOL_BY_NAME[del.dataset.libdel];
    if (sym && await confirmDialog("Symbol entfernen?", `„${sym.label}“ wird aus der Bibliothek entfernt. Bereits gezeichnete Symbole in Dateien bleiben erhalten.`, "Entfernen")) { LIBS.removeSymbol(sym); renderLeft(); }
    return;
  }
  if (e.target.closest("[data-abgsave]")) { saveAbgang(); return; }
  const ad = e.target.closest("[data-abgdel]");
  if (ad) {
    const t = CUSTOM.find((x) => x.id === ad.dataset.abgdel);
    if (t && await confirmDialog("Abgang löschen?", `„${t.label}“ wird aus den eigenen Abgängen entfernt. Bereits gezeichnete Abgänge bleiben.`, "Löschen")) {
      if (S.placeSym === TEMPLATE_PREFIX + t.id) setTool("select");
      removeCustom(t.id); renderLeft();
    }
    return;
  }
  const pva = e.target.closest("[data-pvact]");
  if (pva) { PV.action(pva); return; }
  const t = e.target.closest("[data-tool]"), s = e.target.closest("[data-sym]");
  if (t) setTool(t.dataset.tool); else if (s) startPlace(s.dataset.sym);
  if (innerWidth <= 860) document.body.classList.remove("show-left");
});

// Rechte Leiste und Fenster Stringplan teilen die Bedienung (data-pvopt, data-pvact, data-meta)
function onPanel(ev, fn) { rightEl.addEventListener(ev, fn); popEl.addEventListener(ev, fn); }
onPanel("focusin", (e) => { if (e.target.matches("input,select,textarea")) { S.pending = snapshot(); S.pendingPushed = false; } });
function firstEdit() { if (!S.pendingPushed) { pushUndo(S.pending ?? snapshot()); S.pendingPushed = true; } }
onPanel("input", (e) => {
  const t = e.target, one = selectedItems()[0];
  if (t.dataset.attr && one) {
    firstEdit(); one.attrs[t.dataset.attr] = t.value;
    if (t.dataset.attr === "BMK" && bmkLetter(SYMBOL_BY_NAME[one.sym])) { one.manual = t.value.trim() !== ""; renumberAll(S.doc); }
  }
  else if (t.dataset.meta) { firstEdit(); const tt = T.titleOf(S.doc); (T.PROJECT_FIELDS.includes(t.dataset.meta) ? (tt ? [tt] : S.doc.sheets) : [S.model]).forEach((sh) => { sh.meta[t.dataset.meta] = t.value; }); /* ohne Titelseite: auf alle Blätter */ T.syncDeck(S.doc); renderSheet(); if (t.dataset.meta === "BLATT") { renumberAll(S.doc); renderSheetBar(); renderItems(); } }
  else if (t.dataset.info && S.model.kind === "title") { firstEdit(); S.model.info[t.dataset.info] = t.value; if (t.dataset.info.startsWith("FIRMA")) T.saveFirm(S.model.info); renderSheet(); }
  else if (t.dataset.rev && S.model.kind === "title") { firstEdit(); const [i, k] = t.dataset.rev.split(":"); S.model.info.revs[Number(i)][k] = t.value; renderSheet(); }
  else if ((t.dataset.lattr || t.dataset.lterm || t.dataset.lbez !== undefined) && S.legSel !== null) { // Legende: Werte des gewählten Geräts ändern
    const f = findItem(S.doc, S.legSel); if (!f) return;
    firstEdit();
    if (t.dataset.lbez !== undefined) { const tt = f.sheet.items.find((i) => i.type === "terminals" && i.of === f.item.id); if (tt) tt.name = t.value; else if (t.value.trim()) f.item.bez = t.value; else delete f.item.bez; } // mit Klemmen: Bezeichnung der Klemmenleiste, sonst nur Legende
    else if (t.dataset.lattr) { f.item.attrs[t.dataset.lattr] = t.value; if (t.dataset.lattr === "BMK") { f.item.manual = t.value.trim() !== ""; renumberAll(S.doc); } }
    else { const tt = f.sheet.items.find((i) => i.type === "terminals" && i.of === f.item.id); if (!tt) return; tt[t.dataset.lterm] = t.value; if (t.dataset.lterm === "cable") { const c = parseCable(t.value); if (c) tt.n = c.n; } }
    renderSheet();
  }
  else if (t.dataset.text && one) { firstEdit(); const v = t.dataset.text === "h" ? parseFloat(t.value) : t.value; if (t.dataset.text === "h" && !(v > 0)) return; one[t.dataset.text] = v; }
  else if (t.dataset.term && one && one.type === "terminals") {
    firstEdit();
    one[t.dataset.term] = t.value;
    if (t.dataset.term === "bmk" && one.of !== undefined) { one.manual = t.value.trim() !== ""; renumberAll(S.doc); }
    if (t.dataset.term === "cable") {
      const c = parseCable(t.value);
      if (c) one.n = c.n;
      const note = rightEl.querySelector("[data-cablenote]"); if (note) note.textContent = cableNote(one);
      const head = rightEl.querySelector(".prop-head p"); if (head) head.textContent = termCount(one) + " Klemmen";
    }
  }
  else if (t.dataset.dp && one) {
    const key = t.dataset.dp, numeric = t.type === "number", v = numeric ? parseFloat(t.value) : t.value;
    if (numeric && !Number.isFinite(v)) return;
    if (["w", "h", "len", "te"].includes(key) && !(v > 0)) return;
    firstEdit();
    if (one.type === "plate" && key === "w") setPlateW(one, v); else if (!dispoApplyDp(one, key, t)) one[key] = v;
  }
  else if (t.dataset.dpnew) {
    const k = t.dataset.dpnew;
    if (k === "freeLabel") S.dp[k] = t.value; else { const v = parseFloat(t.value); if (!(v > 0)) return; S.dp[k] = v; }
    renderOverlay(); return;
  }
  else if (t.dataset.newth !== undefined) { const v = parseFloat(t.value); if (v > 0) S.textH = v; return; }
  else return;
  markDirty(); renderItems(); renderOverlay();
});
onPanel("change", (e) => {
  const t = e.target, one = selectedItems()[0];
  if (t.dataset.pvopt !== undefined) { PV.option(t); return; } // Stringplan: Modul-Einstellungen
  if (t.dataset.lcol !== undefined && S.model.kind === "legend") {
    const k = t.dataset.lcol, on = t.checked;
    if (!on && S.model.show.length === 1) { t.checked = true; toast("Mindestens eine Spalte bleibt angehakt."); return; }
    change(() => { S.model.show = LEGEND_KEYS.filter((c) => (c === k ? on : S.model.show.includes(c))); }); renderSheet(); return;
  }
  if (t.dataset.mainl !== undefined || t.dataset.mainr !== undefined) { setMainEnd(t); return; }
  if (t.dataset.railend !== undefined && one && isRail(one)) {
    pushUndo(); let refId = null;
    const side = t.dataset.railend;
    refId = applyRailEnd(one, side, t.value); renumberAll(S.doc); afterChange(true);
    if (refId) { const ref = S.model.items.find((i) => i.id === refId); if (ref) offerLink(ref); }
    return;
  }
  if (t.dataset.dpnum && isDispo()) { if (!setDimNum(t.dataset.dpnum, parseFloat(t.value))) toast("Wert ausserhalb des Bereichs.", "error"); return; } // Fenster „Ansicht“: Masstext
  if (t.dataset.dpview && isDispo()) { const k = t.dataset.dpview; change(() => { if (t.checked) delete S.model[k]; else S.model[k] = false; }, { panel: false }); return; } // Fenster „Ansicht“: Masse, Türen
  if (t.dataset.dpdims !== undefined && one && one.type === "dispoview") { pushUndo(); if (t.checked) one.dims = true; else delete one.dims; afterChange(); }
  else if (t.dataset.dpden !== undefined && one && one.type === "dispoview") { pushUndo(); one.den = Number(t.value); afterChange(); }
  else if (t.dataset.wirekind !== undefined && one) { pushUndo(); one.kind = t.value; afterChange(false); }
  else if (t.dataset.newkind !== undefined) { S.wireKind = t.value; renderOverlay(); }
  else if (t.dataset.newbundle !== undefined) { S.bundleN = Number(t.value); renderRight(); renderOverlay(); updateHint(); }
  else if (t.dataset.sympoles !== undefined && one) {
    pushUndo(); one.sym = t.value;
    for (const tt of linkedTerminals(S.model.items, new Set([one.id]))) if (!parseCable(tt.cable)) tt.n = SYMBOL_BY_NAME[one.sym].poles + 1;
    afterChange();
  }
  else if (t.dataset.placepoles !== undefined) { S.placeSym = t.value; renderLeft(); renderRight(); renderOverlay(); updateHint(); }
  else if (t.dataset.termpe !== undefined && one) { pushUndo(); one.pe = t.value; afterChange(false); }
  else if (t.dataset.termdraw !== undefined && one?.type === "terminals") { pushUndo(); if (t.value === "off") one.noterm = true; else delete one.noterm; afterChange(); }
  else if (t.dataset.dp === "maker" && one?.type === "part" && isDispo()) renderRight(); // NH: Liste der Grössen folgt dem Hersteller
  if (t.tagName === "SELECT") t.blur();
});
onPanel("click", (e) => {
  const dk = e.target.closest("[data-deck]");
  if (dk) { deckAction(dk); return; } // Titelseite: Logo, Änderungsindex
  const pva = e.target.closest("[data-pvact]");
  if (pva) { if (pva.dataset.pvact === "pmid") pvPop.hide(false); PV.action(pva); return; } // Stringplan: Modultypen, Katalog. Druckmitte setzen schliesst das Fenster.
  const b = e.target.closest("[data-act]");
  if (!b) return;
  if (b.dataset.act.startsWith("dp")) { dispoAct(b.dataset.act, b); return; } // Zählerplatte bestücken, Masse aus-/einblenden
  if (b.dataset.act.startsWith("cab")) { dispoCabAct(b.dataset.act, b, selectedItems()[0]); return; } // Schrank: Feld anfügen, löschen, Montageplatten
  const one = selectedItems()[0];
  ({ rotate: rotateSelected, dup: duplicateSelected, del: deleteSelected, base: insertBase, feed: addFeed, addrail: addRail, align: () => alignSelected(b.dataset.m), delsheet: deleteSheet, gotitle: () => switchSheet(S.doc.sheets.indexOf(T.titleOf(S.doc))), golegend: () => { S.legSel = one?.id ?? null; switchSheet(S.doc.sheets.length - 1); }, relink: () => one && changeLink(one), unlink: () => one && change(() => unlinkRef(S.doc, one)), autorail: () => addAutoRails(one, Number(b.dataset.n), Number(b.dataset.p)), handover: handOver, gosrc: () => { const i = S.doc.sheets.findIndex((sh) => sh.kind === "dispo" && sh.sid === one?.src); if (i >= 0) switchSheet(i); } })[b.dataset.act]?.();
});

let addHeld = false, addTimer = 0; // langes Drücken auf + öffnet die Auswahl statt ein Blatt anzulegen
$("#sheetbar").addEventListener("click", (e) => {
  const step = e.target.closest("[data-step]");
  if (step) stepSheet(Number(step.dataset.step));
  else if (e.target.closest("[data-gosheet]")) sheetMenu.toggle($("#sheet-cur"));
  else if (e.target.closest("[data-addsheet]")) { if (addHeld) addHeld = false; else if (addMenu.open) addMenu.hide(false); else addSameKind(); }
});
$("#sheetbar").addEventListener("pointerdown", (e) => {
  const b = e.target.closest("#sheet-add");
  if (!b || e.button !== 0) return;
  addHeld = false; clearTimeout(addTimer);
  addTimer = setTimeout(() => { addHeld = true; addMenu.show(b); }, 450);
});
for (const ev of ["pointerup", "pointerleave", "pointercancel"]) $("#sheetbar").addEventListener(ev, () => clearTimeout(addTimer));
$("#sheetbar").addEventListener("contextmenu", (e) => { const b = e.target.closest("#sheet-add"); if (b) { e.preventDefault(); clearTimeout(addTimer); addMenu.show(b); } });
$("#sheetbar").addEventListener("keydown", (e) => { const b = e.target.closest("#sheet-add"); if (b && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); addMenu.show(b); } });
const addMenu = makeMenu($("#add-menu"), { up: true, beforeShow: () => { closeEditor(true); $("#add-menu [data-new=deck]").hidden = !(S.doc.sheets.some((sh) => !sh.kind) && (S.doc.noTitle || S.doc.noToc)); } });
$("#add-menu").addEventListener("click", (e) => { const b = e.target.closest("[data-new]"); if (b) ({ dispo: addDispo, pv: addPv, pvtab: addPvTab, deck: addDeck }[b.dataset.new] || addSheet)(); });
sheetMenu = makeMenu($("#sheet-menu"), { up: true, beforeShow: () => closeEditor(true), onOpen: () => { $("#sheet-find").value = ""; renderSheetList(); $("#sheet-find").focus(); $("#sheet-menu .mi.on")?.scrollIntoView({ block: "nearest" }); } });
$("#sheet-find").addEventListener("input", renderSheetList);
$("#sheet-menu").addEventListener("click", (e) => {
  const pin = e.target.closest("[data-pin]"), t = e.target.closest("[data-sheet]");
  if (pin) { togglePin(Number(pin.dataset.pin)); renderSheetList(); } else if (t) switchSheet(Number(t.dataset.sheet));
});
$("#btn-undo").addEventListener("click", undo);
$("#btn-redo").addEventListener("click", redo);
$("#btn-open").addEventListener("click", () => openJson());
$("#btn-save").addEventListener("click", () => saveJson(false));
$("#btn-dxf").addEventListener("click", () => saveDxf());
$("#btn-pdf").addEventListener("click", () => printPdf());
$("#btn-legpdf").addEventListener("click", () => printLegend());
$("#btn-dxf-all").addEventListener("click", () => saveDxfAll());
$("#btn-lists").addEventListener("click", () => { closeEditor(true); download(`${baseName()}_Listen.csv`, listsCsv(S.doc), "text/csv"); });
$("#btn-handover").addEventListener("click", handOver);

pvPop = makeMenu(popEl, { left: true, form: true, beforeShow: () => closeEditor(true), onOpen: () => popEl.focus() });
for (const b of document.querySelectorAll("#pv-bar [data-pop], #doc-bar [data-pop]")) b.addEventListener("click", () => {
  if (pvPop.open && pvPop.anchorId() === b.id) { pvPop.hide(); return; }
  popKind = b.dataset.pop; popEl.setAttribute("aria-label", { mod: "Module", wr: "Wechselrichter", druck: "Druck", blatt: "Schriftfeld", haupt: "Hauptlinien", ansicht: "Ansicht" }[popKind]);
  popEl.innerHTML = popHTML(); popEl.scrollTop = 0;
  if (pvPop.open) pvPop.hide(false);
  pvPop.show(b);
});
// WR verschieben per Drag and Drop im Fenster Wechselrichter (5aw, CJ 15.10.): Griff „⠿ WR n“ auf eine andere WR-Zeile ziehen
const WR_DT = "text/x-schemacad-wr", wrDropOff = () => popEl.querySelectorAll(".pv-wr.drop, .pv-wr.dragging").forEach((x) => x.classList.remove("drop", "dragging"));
popEl.addEventListener("dragstart", (e) => { const g = e.target.closest?.("[data-wrdrag]"); if (!g) return; e.dataTransfer.setData(WR_DT, g.dataset.wrdrag); e.dataTransfer.effectAllowed = "move"; g.closest(".pv-wr").classList.add("dragging"); });
popEl.addEventListener("dragover", (e) => {
  const r = e.target.closest?.(".pv-wr");
  if (!r || !e.dataTransfer.types.includes(WR_DT)) return;
  e.preventDefault(); e.dataTransfer.dropEffect = "move";
  for (const x of popEl.querySelectorAll(".pv-wr.drop")) if (x !== r) x.classList.remove("drop");
  r.classList.add("drop");
});
popEl.addEventListener("drop", (e) => { const r = e.target.closest?.(".pv-wr"), from = Number(e.dataTransfer.getData(WR_DT)); if (!r || !from) return; e.preventDefault(); wrDropOff(); PV.moveWr(from, Number(r.dataset.wrrow)); });
popEl.addEventListener("dragend", wrDropOff);
const exportMenu = makeMenu($("#export-menu"), { beforeShow: () => closeEditor(true) });
$("#btn-export").addEventListener("click", (e) => exportMenu.toggle(e.currentTarget));
$("#btn-export").addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { e.preventDefault(); exportMenu.show(e.currentTarget); } });
$("#btn-search").addEventListener("click", searchDialog);
$("#btn-new").addEventListener("click", newDocument);
$("#btn-left").addEventListener("click", () => { document.body.classList.toggle("show-left"); document.body.classList.remove("show-right"); });
$("#btn-right").addEventListener("click", () => { document.body.classList.toggle("show-right"); document.body.classList.remove("show-left"); });
$("#zoom-in").addEventListener("click", () => { const r = svg.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.25); });
$("#zoom-out").addEventListener("click", () => { const r = svg.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 0.8); });
$("#zoom-val").addEventListener("click", fitView);
$("#grid-on").addEventListener("change", (e) => { S.grid.on = e.target.checked; renderSheet(); });
$("#dims-on").addEventListener("change", () => toggleDims());
$("#mag-on").addEventListener("change", (e) => { S.mag = e.target.checked; });
$("#grid-size").addEventListener("change", (e) => { S.grid.size = parseFloat(e.target.value); S.gridSize[kindKey()] = S.grid.size; renderSheet(); });
window.addEventListener("resize", () => { applyView(); });
window.addEventListener("beforeunload", (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });

// ---------- Dateien (Code in files.js) ----------
const { hasFS, safeName, baseName, download, saveJson, loadText, openJson, saveDxf, saveDxfAll, buildPrint, printPdf, printLegend } = makeFiles({ S, $, adoptDeck, markDirty, docText, toast, confirmDialog, closeEditor, setFileName, markClean, updateUndoButtons, setTool, renderSheetBar, renderSheet, renderItems, renderOverlay, renderRight, afterSheetChange, pv: PV, sheetLabel });

// Titelseite: Änderung eintragen oder löschen, Logo laden (PNG, JPEG, SVG bis MAX_LOGO) oder entfernen
function deckAction(b) {
  const info = S.model.info;
  if (b.dataset.deck === "deldeck") { deleteDeck(); return; }
  if (!info && !["godev", "legpdf"].includes(b.dataset.deck)) return;
  if (b.dataset.deck === "godev") { const id = S.legSel, i = S.doc.sheets.findIndex((sh) => sh.items.some((it) => it.id === id)); if (i >= 0) { switchSheet(i); S.sel = new Set([id]); renderRight(); renderOverlay(); } return; }
  if (b.dataset.deck === "legpdf") { printLegend(); return; }
  if (b.dataset.deck === "addrev") change(() => info.revs.push({ i: T.nextRevIndex(info.revs), d: R_today(), t: "", n: S.model.meta.GEZEICHNET || "" }));
  else if (b.dataset.deck === "delrev") change(() => info.revs.splice(Number(b.dataset.i), 1));
  else if (b.dataset.deck === "nologo") { change(() => { delete info.logo; }); T.saveFirm(info); renderSheet(); }
  else if (b.dataset.deck === "logo") {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/png,image/jpeg,image/svg+xml";
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      if (!/^image\/(png|jpeg|svg\+xml)$/.test(f.type)) { toast("Das Logo muss ein PNG-, JPEG- oder SVG-Bild sein.", "error"); return; }
      if (f.size > T.MAX_LOGO) { toast(`Das Bild ist zu gross (${Math.round(f.size / 1024)} KB). Höchstens ${T.MAX_LOGO / 1024} KB, bitte verkleinern.`, "error"); return; }
      const rd = new FileReader();
      rd.onload = () => { change(() => { info.logo = String(rd.result); }); T.saveFirm(info); renderSheet(); };
      rd.readAsDataURL(f);
    };
    inp.click();
  }
}
const R_today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`; };
// Titelseite und Inhalt sicherstellen (titel.js), aktives Blatt behalten (oder erstes Arbeitsblatt). Gibt die Meldung zurück.
function adoptDeck() {
  const cur = S.model, note = T.ensureDeck(S.doc, T.loadFirm());
  const i = S.doc.sheets.indexOf(cur);
  S.active = i >= 0 ? i : Math.max(0, S.doc.sheets.findIndex((sh) => !T.isDeck(sh)));
  renumberAll(S.doc);
  return note;
}

// Neu: zuerst wählen, was gezeichnet wird (Startauswahl), dann ein leeres Dokument mit einem Blatt dieser Art
async function newDocument() {
  const kind = await startDialog();
  if (!kind) return;
  if (kind === "open") { openJson(); return; }
  if (S.dirty && !(await confirmDialog("Neu beginnen?", "Die Änderungen am aktuellen Dokument gehen verloren, wenn du sie nicht gespeichert hast.", "Neu beginnen"))) return;
  freshDoc(kind);
}
function freshDoc(kind) {
  const k0 = S.model.kind;
  S.doc = newDoc(); S.active = 0; S.sel.clear(); S.undo = []; S.redo = []; S.fileHandle = null; S.wireDraft = null;
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* egal */ }
  if (kind === "schema") S.model.items.push(...baseItems(nextId));
  else { const sh = newSheet(kind); sh.sid = nextId(); sh.meta.BLATT = "1"; S.doc.sheets = [sh]; }
  adoptDeck();
  setFileName("Unbenannt"); markClean(); updateUndoButtons(); setTool("select"); afterSheetChange(k0, { reset: true, fit: true });
}

// Weitere Hauptlinie (zum Beispiel Steuerspannung L1_ST, N_ST oder 24 V): kommt unter die unterste aktive Linie, lässt sich verschieben
async function addRail() {
  const r = await formDialog("Weitere Hauptlinie", "Die Linie kommt unter die unterste Hauptlinie. Du kannst sie danach mit den Pfeiltasten verschieben. Verweise auf andere Blätter gehen über den Namen.", [
    { label: "Name", value: "L1_ST" },
    { label: "Art", value: "netz", options: [["netz", "Aussenleiter (durchgezogen, blau)"], ["neutral", "Neutralleiter (gestrichelt)"], ["pe", "Schutzleiter (grün)"]] },
  ], "Hinzufügen");
  if (!r || !r[0].trim()) return;
  const ys = S.model.items.filter((i) => i.type === "wire" && i.tag === "grund" && i.pts[0][1] > 100).map((i) => i.pts[0][1]);
  const y = (ys.length ? Math.min(...ys) : 175) - 5;
  change(() => {
    S.model.items.push({ id: nextId(), type: "wire", kind: r[1], pts: [[RAIL_X0, y], [RAIL_X1, y]], tag: "grund" });
    S.model.items.push({ id: nextId(), type: "text", x: 12, y: y - 1, h: 2.5, s: r[0].trim(), tag: "grund" });
  });
}
// Eingangsverdrahtung (eingang.js): HAK, Zuleitung, NH, SPD, HPAS, Erde in einem Rückgängig-Schritt
function addFeed() {
  const test = JSON.parse(JSON.stringify(S.model)), msg = insertFeed(test, () => 0);
  if (msg) { toast(msg, "error"); return; }
  change(() => insertFeed(S.model, nextId));
  toast("Eingangsverdrahtung eingefügt. Alles lässt sich einzeln bearbeiten, ⌘Z nimmt sie zurück.");
}
function insertBase() {
  if (hasBase(S.model.items)) return;
  change(() => S.model.items.push(...baseItems(nextId)));
}

// ---------- Start ----------
function init() {
  for (const el of document.querySelectorAll(".ic[data-ic]")) el.innerHTML = R.icons[el.dataset.ic];
  $("#btn-undo").innerHTML = R.icons.undo; $("#btn-redo").innerHTML = R.icons.redo;
  $("#btn-left").innerHTML = R.icons.panelL; $("#btn-right").innerHTML = R.icons.panelR;
  $("#zoom-in").innerHTML = R.icons.plus; $("#zoom-out").innerHTML = R.icons.minus;
  LIBS.load(); renderLeft();
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw) { const o = JSON.parse(raw); const m = parseModel(o.text); if (m.sheets.some((sh) => sh.items.length)) { S.doc = m; S.active = m.active; setFileName(o.name || "Unbenannt"); markDirty(); toast("Letzte Sitzung wiederhergestellt. Mit „Neu“ beginnst du ein leeres Blatt."); } }
  } catch { /* kein Zwischenstand */ }
  if (!S.dirty) S.model.items.push(...baseItems(nextId));
  const note = adoptDeck();
  if (note && S.dirty) toast(note);
  syncKind(); renderLeft(); renderRight(); renderSheetBar(); updateUndoButtons(); updateHint();
  fitView(); renderItems(); renderOverlay();
  if (!S.dirty) { markClean(); startAtLaunch(); }
}
// Beim Start ohne wiederhergestellte Sitzung: Startauswahl. Abbrechen lässt das leere Schemablatt stehen.
async function startAtLaunch() {
  const kind = await startDialog();
  if (kind === "open") openJson(); else if (kind && kind !== "schema") freshDoc(kind);
}
new ResizeObserver(() => { applyView(); }).observe(stage);
init();

// Nur lesender Zugriff für Tests
window.__schemacad = { buildLegendPrint: () => buildPrint(S.doc.sheets.find((sh) => sh.kind === "legend")), get kind() { return S.model.kind || "schema"; }, get model() { return JSON.parse(JSON.stringify(S.model)); }, get doc() { return JSON.parse(docText()); }, get active() { return S.active; }, get sel() { return [...S.sel]; }, get view() { return { ...S.view }; }, exportDxf: () => exportDxf(S.model), buildPrint, preparePrint: () => PV.preparePrint() };
