// SchemaCAD: Editor. Zustand, Bedienung, Dateien.
import { newDoc, newSheet, parseModel, serializeModel, WIRE_KINDS, LEGEND_KEYS, setProjectMeta, cleanInfo, cleanProject, modBase, modOf, modKey, modName } from "./model.js";
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
import { PV_GRID, PV_TEXT_H, DRAW_LAYERS, pruneStrings, pointLabel, varOf, newVar } from "./pv.js";
import * as T from "./titel.js";
import * as L from "./legende.js";
import { cloudMenu, cloudUser, cloudLogin, cloudLogout, projList, projSave, projSaved, projOpen, projDelete, feedbackSend, shareUrl, shareList, shareCreate, shareRevoke, shareOpen } from "./cloud.js";
import { snapSvg, feedbackDialog } from "./feedback.js";
import * as E from "./elplexa.js";
import { SHAPE_TOOLS, SHAPE_KINDS, shapeTool, shapeFrom, shapeEmpty, shapeHandles, dragShapeHandle, shapeSVG, COLORS } from "./formen.js";
import { fetchGwr, searchAdr, adrText } from "./gwr.js";


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
  shapeDraft: null, shapeStyle: {}, textC: null, // freies Zeichnen (formen.js): Form im Entstehen, Darstellung neuer Formen, Farbe neuer Texte
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
const snapshot = () => JSON.stringify({ sheets: S.doc.sheets, nextId: S.doc.nextId, pv: S.doc.pv, noTitle: S.doc.noTitle, noToc: S.doc.noToc, info: S.doc.info, mods: S.doc.mods, ...(ELPLEXA ? { project: S.doc.project } : {}) }); // pv: Modultypen (Stringplan), project: elplexaCAD
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

// Formen: Raster wie bei den Leitungen, Alt = frei
const shapeSnap = (w) => (S.alt ? { x: round3(w.x), y: round3(w.y) } : snapBase(w.x, w.y, false));
const isSchema = () => !isDispo() && !isPv() && !isDeck();

// ---------- Änderungen und Rückgängig ----------
function pushUndo(snap = snapshot()) {
  S.undo.push(snap);
  if (S.undo.length > 200) S.undo.shift();
  S.redo.length = 0;
  updateUndoButtons();
}
function change(fn, { panel = true } = {}) { if (ELPLEXA && S.shared) return; const snap = snapshot(); fn(); pushUndo(snap); afterChange(panel); }
function afterChange(panel = true) { const cur = S.model; splitWandlerDoc(S.doc); T.ensureDeck(S.doc, T.loadFirm(), { shift: false }); S.active = Math.max(0, S.doc.sheets.indexOf(cur)); renumberAll(S.doc); markDirty(); renderSheetBar(); renderItems(); renderOverlay(); if (panel) renderRight(); }
function restore(json) {
  const k0 = S.model.kind;
  const o = JSON.parse(json);
  S.doc = { ...S.doc, sheets: o.sheets, nextId: o.nextId, pv: o.pv, noTitle: o.noTitle, noToc: o.noToc, info: o.info, mods: o.mods }; // mods: Modulnamen (18.10.2026)
  if (ELPLEXA) { const ol = S.doc.project?.online, za = S.doc.project?.auto, zid = S.doc.project?.id; S.doc.project = o.project; if (ol) (S.doc.project ||= {}).online = ol; elZeitUndo(za, zid); } // Online-Verknüpfung bleibt bei Rückgängig, die automatische Zeit läuft weiter
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
  if (ELPLEXA && S.shared) return; // geteilte Ansicht: nie „ungespeichert“, keine Absturz-Sicherung
  S.dirty = true;
  $("#dirty").hidden = false;
  clearTimeout(autosaveTimer);
  // Ist der Zwischenspeicher für eine PDF zu klein, ohne PDF speichern (der Plan muss dann neu geladen werden)
  const put = (t) => localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ name: S.fileName, text: t }));
  autosaveTimer = setTimeout(() => { try { put(docText()); } catch { try { put(docText(true)); } catch { /* ohne Speicher weiterarbeiten */ } } }, 400);
}
function markClean() { S.dirty = false; $("#dirty").hidden = true; clearTimeout(autosaveTimer); if (ELPLEXA && S.shared) return; try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* egal */ } } // geteilte Ansicht: Sicherung eigener Projekte bleibt
function setFileName(n) { S.fileName = n; $("#file-name").textContent = n; document.title = n + (ELPLEXA ? " – elplexaCAD" : " – SchemaCAD"); }

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
  gSheet.innerHTML = S.model.kind === "legend" ? L.screenSVG(S.doc, S.model, S.legSel) : isDeck() ? (S.model.kind === "title" ? T.titleSVG(S.model, adrText(S.doc.project?.adr)) : T.tocScreenSVG(S.doc, S.model)) : isPv() ? PV.sheetSVG() : isDispo() ? D.sheetSVG(S.grid, S.view.z) : R.sheetSVG(S.model.meta, S.grid, S.view.z);
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
  if (S.tool === "select") for (const it of selectedItems()) if (it.type === "shape") for (const p of shapeHandles(it)) s += `<rect class="wire-handle" x="${p.x - 0.9}" y="${p.y - 0.9}" width="1.8" height="1.8"/>`; // Griffe der Formen
  if (S.shapeDraft && S.mouse) s += `<g opacity="0.8" pointer-events="none">${shapeSVG(shapeFrom(shapeTool(S.tool).k, S.shapeDraft.a, S.mouse, S.shift, S.shapeStyle))}</g>`;
  if (shapeTool(S.tool) && S.mouse) s += `<circle cx="${S.mouse.x}" cy="${S.mouse.y}" r="0.6" fill="#17212b" stroke="none" pointer-events="none"/>`;
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
  if (shapeTool(S.tool)) { const t = shapeTool(S.tool); return S.shapeDraft ? `${t.label}: zweiter Klick oder Loslassen setzt ${t.k === "circle" ? "den Radius" : "das Ende"}${t.k === "line" ? ", Shift waagrecht oder senkrecht" : t.k === "rect" ? ", Shift = Quadrat" : ""}. Esc bricht ab.` : `${t.label}: klicken und ziehen (oder zweimal klicken)${t.k === "circle" ? ", erst die Mitte" : ""}. Rastet auf dem Raster ein, Alt = frei. Farbe und Strich rechts.`; }
  return "Objekt anklicken, mit Shift mehrere wählen. Auf leerer Fläche ziehen wählt mit Rahmen.";
}
function updateHint() { $("#hint").textContent = ELPLEXA && S.shared ? "Geteilte Ansicht: Ziehen verschiebt, Scrollen oder Pinch zoomt, F passt ein, Bild ↑ ↓ blättert." : hintText(); }


function renderLeft() {
  if (isDeck()) { const k = S.model.kind; leftEl.innerHTML = `<section class="section"><h2 class="section-title">${T.kindLabel(S.model)}</h2><p class="note">${k === "title" ? "Blatt 1. Hier wird nicht gezeichnet, die Angaben stehen rechts." : k === "toc" ? "Blatt 2. Entsteht automatisch aus allen Blättern der Datei." : "Letztes Blatt, A4 hoch. Entsteht automatisch aus den Schutzgeräten aller Schemablätter."}</p></section>`; return; }
  if (isDispo()) { leftEl.innerHTML = dispoLeftHTML(); return; }
  if (isPv()) { leftEl.innerHTML = PV.leftHTML(); return; }
  let h = `<section class="section"><h2 class="section-title">Werkzeuge</h2>`;
  for (const t of [...TOOLS, ...SHAPE_TOOLS]) h += `<button class="tool" data-tool="${t.id}" aria-pressed="${S.tool === t.id}">${R.icons[t.icon]}<span>${t.label}</span><span class="key">${t.key}</span></button>`; // Linie, Rechteck, Kreis nur im Schema (CJ 18.10.)
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



// Fenster Module, Wechselrichter (rechte Leiste) und Druck (oben) im Stringplan und in der Stringübersicht (UI Schritt 6 Teil 2, 18.10.2026). Hängt am Knopf, blockiert den Plan nicht.
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
function renderRight() {
  renderRightPanel(); document.body.classList.toggle("nosel", !S.sel.size && !(S.model.kind === "legend" && S.legSel != null));
  if (pvPop?.open) document.getElementById(pvPop.anchorId())?.setAttribute("aria-expanded", "true"); // Zeile rechts neu gezeichnet: Zustand des offenen Fensters
}
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
    } else if (it.type === "shape") {
      h += head(SHAPE_KINDS[it.k], "Freie Form") + styleHTML(sel) + actions([["dup", "copy", "Duplizieren"], ["del", "trash", "Löschen", "danger"]]);
    } else {
      h += textPanelHTML(it).replace('<div class="row">', styleHTML(sel) + '<div class="row">');
    }
  } else if (sel.length > 1) {
    h += `<div class="prop-head"><h2>${sel.length} Objekte</h2><p>Mehrfachauswahl</p></div>`;
    if (sel.every((i) => i.type === "shape" || i.type === "text")) h += styleHTML(sel);
    h += actions([["dup", "copy", "Duplizieren"], ["del", "trash", "Löschen", "danger"]]);
  } else {
    if (S.tool === "wire") h += `<div class="prop-head"><h2>Neue Leitung</h2></div>` + bundleSelect() + (S.bundleN === 1 ? kindSelect("data-newkind", S.wireKind) : `<p class="note">Leiter von oben links nach unten rechts: ${BUNDLE_PRESETS[S.bundleN].join(", ")}.</p>`);
    else if (S.tool === "place" && S.placeSym !== TERMINALS && familyOf(S.placeSym)?.variants.length > 1) h += `<div class="prop-head"><h2>Neues Symbol</h2></div>` + poleSelect("data-placepoles", familyOf(S.placeSym), S.placeSym);
    else if (S.tool === "text") h += `<div class="prop-head"><h2>Neuer Text</h2></div><div class="field"><label>Texthöhe in mm</label><input type="number" min="1" max="20" step="0.5" data-newth value="${S.textH}"></div>` + styleHTML([{ type: "text", c: S.textC }]);
    else if (shapeTool(S.tool)) h += head(`Neue Form: ${shapeTool(S.tool).label}`) + styleHTML([{ type: "shape", k: shapeTool(S.tool).k, ...S.shapeStyle }]);
    h += head(sheetLabel(S.model, S.active), S.model.meta.TITEL || "ohne Blatttitel") + `<p class="note">Hauptlinien: ${R.esc(mainSummary())}.</p>`;
    h += `<div class="row"><button class="btn outline small" data-act="dupsheet" title="Blatt kopieren, die Kopie ist unabhängig">${R.icons.copy.replace("<svg", '<svg width="16" height="16"')}Blatt duplizieren</button><button class="btn outline small danger" data-act="delsheet"${workCount() < 2 ? " disabled" : ""}>${R.icons.trash.replace("<svg", '<svg width="16" height="16"')}Blatt löschen</button></div>`;
  }
  rightEl.innerHTML = h;
}

// ---------- Blätter ----------
const workCount = () => S.doc.sheets.filter((sh) => !T.isDeck(sh)).length;
function sheetLabel(sh, i) { const v = sh.var > 1 ? ` · V${sh.var}` : ""; return sh.kind === "title" ? "Titelseite" : sh.kind === "toc" ? "Inhalt" : sh.kind === "legend" ? `Legende ${sh.meta.BLATT}` : sh.kind === "pvtab" ? `Stringübersicht${v}` : `${sh.kind === "dispo" ? "Dispo" : sh.kind === "pv" ? "Stringplan" : "Blatt"} ${sh.meta.BLATT || i + 1}${v}`; } // V2: Variante (18.10.2026)
// Kompakte Leiste: ‹ Blatt 58 · 1 von 12 ▾ › +. Die Mitte öffnet die Liste aller Blätter, + hält eine Auswahl bereit
function renderSheetBar() {
  if (ELPLEXA) { elSheetBar(); return; }
  const n = S.doc.sheets.length, a = S.active, sh = S.doc.sheets[a];
  $("#btn-dxf-all").hidden = n < 2;
  const open = sheetMenu?.open, keep = document.activeElement?.closest?.("#sheetbar") && document.activeElement.id;
  $("#sheetbar").innerHTML = `<button class="sheettab nav" data-step="-1" title="Vorheriges Blatt (Bild auf)" aria-label="Vorheriges Blatt"${a === 0 ? " disabled" : ""}>‹</button>`
    + `<button class="sheettab cur" id="sheet-cur" data-gosheet aria-haspopup="dialog" aria-expanded="${!!open}" title="Liste aller Blätter (G). Rechtsklick oder gedrückt halten: Duplizieren, Löschen" data-ctx="${a}"><span class="cl">${sh.pin ? "★ " : ""}${R.esc(sheetLabel(sh, a))}</span>${sh.meta.TITEL && !T.isDeck(sh) ? `<span class="ct">${R.esc(sh.meta.TITEL)}</span>` : ""}<span class="of">${a + 1} von ${n}</span><span class="caret" aria-hidden="true">▾</span></button>`
    + `<button class="sheettab nav" data-step="1" title="Nächstes Blatt (Bild ab)" aria-label="Nächstes Blatt"${a === n - 1 ? " disabled" : ""}>›</button>`
    + `<button class="sheettab add" id="sheet-add" data-addsheet aria-haspopup="menu" aria-expanded="false" title="Neu: ${addKindLabel()}. Gedrückt halten oder Rechtsklick: Blatttyp wählen" aria-label="Neu: ${addKindLabel()}">${R.icons.plus}</button>`;
  if (keep) document.getElementById(keep)?.focus();
  if (open) renderSheetList();
}
// Fusszeile der Blattliste: Duplizieren und Löschen gelten fürs aktive Blatt (CJ 18.10.2026)
function sheetFoot() {
  $("#sheet-menu [data-sheetact=dup]").disabled = isDeck();
  $("#sheet-menu [data-sheetact=del]").disabled = isDeck() || workCount() < 2;
}
function renderSheetList() {
  sheetFoot();
  if (ELPLEXA) { elSheetList(); return; }
  const q = $("#sheet-find").value.trim().toLowerCase();
  const rows = S.doc.sheets.map((sh, i) => ({ sh, i, label: sheetLabel(sh, i), title: sh.meta.TITEL || "" })).filter((r) => !q || `${r.label} ${r.title}`.toLowerCase().includes(q));
  $("#sheet-menu .slist").innerHTML = rows.length ? rows.map(({ sh, i, label, title }) => `<div class="srow"><button class="mi${i === S.active ? " on" : ""}" data-sheet="${i}" data-ctx="${i}" tabindex="-1"${i === S.active ? ' aria-current="true"' : ""}><span class="mt"><span class="mh">${R.esc(label)}</span><span class="ms">${R.esc(title || "ohne Titel")}</span></span><span class="pos">${i + 1}</span></button><button class="pin" data-pin="${i}" tabindex="-1" title="${sh.pin ? "Markierung entfernen" : "Blatt markieren"} (M für das aktive Blatt)" aria-label="${sh.pin ? "Markierung entfernen" : "Blatt markieren"}" aria-pressed="${!!sh.pin}">${sh.pin ? "★" : "☆"}</button></div>`).join("") : `<div class="empty">Kein Blatt gefunden</div>`;
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
function stepSheet(d) { if (ELPLEXA) { elStep(d); return; } const i = S.active + d; if (S.doc.sheets[i]) switchSheet(i); }
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
  if (ELPLEXA) elSync();
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
// Modul-Nummer für ein neues Blatt (CJ 18.10.2026): v vorgegeben (neues Modul), sonst das Modul des offenen Blatts, wenn es dieselbe Art ist
const varIn = (base, v) => (typeof v === "number" ? v : modBase(S.model) === base && !T.isDeck(S.model) ? varOf(S.model) : 1);
const setVar = (sh, v) => { if (v > 1) sh.var = v; return sh; };
function addDispo(v) {
  setTool("select"); // ein gewähltes Setz-Werkzeug gehört zum alten Blatttyp
  const k0 = S.model.kind;
  const n = S.doc.sheets.filter((sh) => sh.kind === "dispo").length + 1;
  v = varIn("dispo", v);
  change(() => {
    const sh = setVar(newSheet("dispo"), v);
    sh.sid = nextId(); sh.meta.BLATT = String(n);
    S.doc.sheets.push(sh); S.active = S.doc.sheets.length - 1; S.sel.clear();
  });
  afterSheetChange(k0);
}
function addPv(v) {
  setTool("select");
  const k0 = S.model.kind;
  const n = S.doc.sheets.filter((sh) => sh.kind === "pv").length + 1;
  v = varIn("pv", v);
  change(() => {
    const sh = setVar(newSheet("pv"), v); // im offenen PV-Modul (Strings zählen im Modul weiter)
    sh.sid = nextId(); sh.meta.BLATT = String(n);
    S.doc.sheets.push(sh); S.active = S.doc.sheets.length - 1; S.sel.clear();
  });
  afterSheetChange(k0);
}
// Stringübersicht: eine für alle Stringpläne der Datei (CJ 14.10.), seit 18.10.2026 eine je PV-Modul. Gibt es sie schon, wird sie angezeigt.
function addPvTab() {
  const v = S.model.kind === "pv" || S.model.kind === "pvtab" ? varOf(S.model) : 1, i = S.doc.sheets.findIndex((sh) => sh.kind === "pvtab" && varOf(sh) === v);
  if (i >= 0) { switchSheet(i); toast(`Die Stringübersicht gibt es schon, sie gilt für alle Stringpläne von „${modName(S.doc, modKey("pv", v))}“.`); return; }
  setTool("select");
  const k0 = S.model.kind;
  change(() => { const sh = newSheet("pvtab"); sh.meta.BLATT = "1"; if (v > 1) sh.var = v; S.doc.sheets.push(sh); S.active = S.doc.sheets.length - 1; S.sel.clear(); });
  afterSheetChange(k0);
}
// Plus-Knopf (CJ 16.10.): Blatt vom Typ des aktuellen Blatts. Stringplan und Stringübersicht → Stringplan, Titel, Inhalt, Legende → Schemablatt.
const addKindLabel = () => ({ dispo: "Disposition", pv: "Stringplan", pvtab: "Stringplan" }[S.model.kind] || "Schemablatt");
function addSameKind() { const k = S.model.kind; (k === "dispo" ? addDispo : k === "pv" || k === "pvtab" ? addPv : addSheet)(); }
function addSheet(v) {
  setTool("select");
  const k0 = S.model.kind;
  v = varIn("schema", v);
  change(() => { S.doc.sheets.push(setVar(makeSheet(nextSheetNo()), v)); S.active = S.doc.sheets.length - 1; S.sel.clear(); });
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
// Blatt duplizieren (CJ 18.10.2026): die Kopie ist ganz unabhängig. Neue IDs, Verweise auf andere Blätter bleiben offen, Disposition und
// Stringplan mit neuer sid (Ansichten „An Schema“ zeigen weiter aufs Original). Stringplan: neue Variante, mit eigener Stringübersicht, wenn
// die Variante eine hat. Stringübersicht: die ganze Variante. PDF-Dachplan: derselbe Eintrag in assets (wird nie verändert, Plantausch legt
// einen neuen an), so bleibt die Datei klein. Titel: „… – Variante 2“, umbenennen über den Blatttitel.
// Mehrere Blätter auf einmal (ganzes Modul): Verweise und Hauptlinien-Ziele zwischen den kopierten Blättern zeigen auf die Kopien
function copySheets(list) {
  const cs = list.map((sh) => structuredClone(sh)), ids = new Map(), sids = new Map(), bundles = new Map();
  for (const c of cs) {
    delete c.pin;
    for (const it of c.items) { const n = nextId(); ids.set(it.id, n); it.id = n; }
    if (c.sid) { const n = nextId(); sids.set(c.sid, n); c.sid = n; }
  }
  for (const c of cs) {
    for (const it of c.items) {
      if (it.link !== undefined) { if (ids.has(it.link)) it.link = ids.get(it.link); else delete it.link; } // Verweis auf ein anderes Blatt: offen
      for (const k of ["of", "rail"]) if (it[k] !== undefined && ids.has(it[k])) it[k] = ids.get(it[k]); // Wandlermessung, alte Gruppenverweise
      if (it.bundle !== undefined) { if (!bundles.has(it.bundle)) bundles.set(it.bundle, nextId()); it.bundle = bundles.get(it.bundle); }
      if (it.type === "pvstring") it.mods = it.mods.map((id) => ids.get(id) ?? id);
    }
    if (c.main?.r === "sheet" && sids.has(c.main.to)) c.main = { ...c.main, to: sids.get(c.main.to) };
    else if (c.main?.r === "sheet") { c.main = { ...c.main, r: "next" }; delete c.main.to; } // Hauptlinien: Ziel ausserhalb gehört dem Original
  }
  return cs;
}
const copySheet = (sh) => copySheets([sh])[0];
const VAR_RE = /\s*–\s*Variante \d+$|^Variante \d+$/;
const varTitle = (t, n) => { const b = String(t || "").replace(VAR_RE, "").trim(); return b ? `${b} – Variante ${n}` : `Variante ${n}`; };
function duplicateSheet() {
  const sh = S.model, k = sh.kind || "schema";
  if (isDeck()) { toast("Titelseite, Inhalt und Legende gibt es nur einmal."); return; }
  setTool("select"); finishWire(); closeEditor(false);
  let target = null;
  change(() => {
    if (k === "pv" || k === "pvtab") {
      const v = newVar(S.doc), v0 = varOf(sh);
      const src = S.doc.sheets.filter((s) => varOf(s) === v0 && (k === "pvtab" ? s.kind === "pv" || s.kind === "pvtab" : s === sh || s.kind === "pvtab"));
      let no = maxNo("pv");
      for (const s of src) {
        const c = copySheet(s); c.var = v; c.meta.TITEL = varTitle(s.meta.TITEL, v);
        if (c.kind === "pv") c.meta.BLATT = String(++no);
        S.doc.sheets.push(c); if (s === sh) target = c;
      }
    } else {
      const base = String(sh.meta.TITEL || "").replace(VAR_RE, "").trim(), same = S.doc.sheets.filter((s) => (s.kind || "schema") === k && String(s.meta.TITEL || "").replace(VAR_RE, "").trim() === base);
      const n = Math.max(1, ...same.map((s) => Number(/Variante (\d+)$/.exec(s.meta.TITEL || "")?.[1]) || 1)) + 1;
      target = copySheet(sh); target.meta.TITEL = varTitle(sh.meta.TITEL, n);
      target.meta.BLATT = k === "dispo" ? String(maxNo("dispo") + 1) : nextSheetNo();
      S.doc.sheets.push(target);
    }
    S.active = S.doc.sheets.indexOf(target); S.sel.clear();
  });
  afterSheetChange(k, { fit: true });
  toast(`Kopie angelegt: ${sheetLabel(S.model, S.active)} „${S.model.meta.TITEL}“. Umbenennen: Feld Titel im ${k === "pv" || k === "pvtab" ? "Plankopf (Fenster Druck)" : "Schriftfeld"}.`);
}
// ---------- Module (CJ 18.10.2026): Schema, Disposition und PV mehrfach, je Modul eigener Name (doc.mods, model.js) ----------
const modSheets = (id) => S.doc.sheets.filter((sh) => modOf(sh) === id && !T.isDeck(sh));
const maxNo = (kind) => Math.max(0, ...S.doc.sheets.filter((s) => s.kind === kind).map((s) => parseInt(s.meta.BLATT, 10)).filter(Number.isFinite));
function tidyMods() { const m = S.doc.mods; if (!m) return; for (const k of Object.keys(m)) if (!Object.keys(m[k]).length) delete m[k]; if (!Object.keys(m).length) delete S.doc.mods; }
// Ganzes Modul kopieren: neue Nummer, alle Blätter (ohne Titelseite, Inhalt, Legende), Name „… (Kopie)“. Rückgabe: Kennung des neuen Moduls.
function duplicateModule(id) {
  const base = id.split(":")[0], list = modSheets(id);
  if (!list.length) return null;
  const v = Math.max(...S.doc.sheets.filter((sh) => modBase(sh) === base).map(varOf)) + 1, nid = modKey(base, v);
  setTool("select"); finishWire(); closeEditor(false);
  change(() => {
    let nd = maxNo("dispo"), np = maxNo("pv");
    for (const c of copySheets(list)) {
      c.var = v;
      c.meta.BLATT = !c.kind ? nextSheetNo() : c.kind === "dispo" ? String(++nd) : c.kind === "pv" ? String(++np) : c.meta.BLATT;
      S.doc.sheets.push(c);
    }
    const m = (S.doc.mods ??= {}), cont = m[id]?.cont;
    m[nid] = { name: `${modName(S.doc, id)} (Kopie)`, ...(cont ? { cont } : {}) };
  });
  return nid;
}
async function renameModule(id) {
  const r = await formDialog("Modul umbenennen", "Name in der Projektübersicht, zum Beispiel „Schema HV“ oder „PV Variante Ost“. Leer = Standardname.", [{ label: "Name", value: modName(S.doc, id) }], "Umbenennen");
  if (!r) return;
  const name = r[0].trim().slice(0, 80);
  change(() => { const m = (S.doc.mods ??= {}); m[id] = { ...m[id] }; if (name) m[id].name = name; else delete m[id].name; tidyMods(); }, { panel: false });
}
async function deleteModule(id) {
  const list = modSheets(id), rest = S.doc.sheets.filter((sh) => !T.isDeck(sh) && !list.includes(sh));
  if (!list.length) return;
  if (!rest.length) { toast("Das letzte Modul des Projekts lässt sich nicht löschen."); return; }
  if (!(await confirmDialog("Modul löschen?", `„${modName(S.doc, id)}“ mit ${list.length === 1 ? "einem Blatt" : `${list.length} Blättern`} wird gelöscht. Verknüpfte Verweise auf anderen Blättern werden wieder offen. Rückgängig ist möglich.`, "Modul löschen"))) return;
  setTool("select"); finishWire(); closeEditor(false);
  const k0 = S.model.kind, cur = S.model;
  change(() => {
    for (const sh of list) for (const it of sh.items) if (isRef(it)) unlinkRef(S.doc, it);
    S.doc.sheets = S.doc.sheets.filter((sh) => !list.includes(sh));
    if (S.doc.mods) { delete S.doc.mods[id]; if (id.startsWith("pv")) for (const m of Object.values(S.doc.mods)) if (m.cont === (Number(id.split(":")[1]) || 1)) delete m.cont; tidyMods(); }
    S.active = Math.max(0, S.doc.sheets.indexOf(cur)); S.sel.clear();
  });
  afterSheetChange(k0, { reset: true });
}
// Blatt umbenennen (CJ 18.10.2026): Blatttitel (Schriftfeld TITEL), erscheint in Blattleiste, Blattliste, Inhaltsverzeichnis
async function renameSheet() {
  if (isDeck()) return;
  const r = await formDialog("Blatt umbenennen", `Titel von ${sheetLabel(S.model, S.active)}, zum Beispiel „Schema HV“. Steht im Schriftfeld und in der Blattliste.`, [{ label: "Titel", value: S.model.meta.TITEL || "" }], "Umbenennen");
  if (!r || r[0].trim() === (S.model.meta.TITEL || "")) return;
  change(() => { S.model.meta.TITEL = r[0].trim(); });
  renderSheet();
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
  S.dimDraft = null; S.dimSel = null; draftCancel(); S.shapeDraft = null;
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

// ---------- Freies Zeichnen (formen.js, CJ 18.10.2026) ----------
// Form aus dem Anfangspunkt und c setzen. Das Werkzeug bleibt aktiv, wie bei der Leitung.
function finishShape(c, shift) {
  const f = S.shapeDraft, t = shapeTool(S.tool);
  S.shapeDraft = null;
  if (!f || !t) return;
  const sh = shapeFrom(t.k, f.a, c, shift, S.shapeStyle);
  if (!shapeEmpty(sh)) change(() => { S.model.items.push({ id: nextId(), ...sh }); S.sel.clear(); });
  renderOverlay(); updateHint();
}
// Griff einer gewählten Form unter dem Zeiger
function shapeHandleAt(x, y) {
  const tol = Math.max(0.9, 6 / S.view.z);
  for (const it of selectedItems()) if (it.type === "shape") { const p = shapeHandles(it).find((q) => Math.hypot(q.x - x, q.y - y) <= tol); if (p) return { it, h: p.h }; }
  return null;
}
// Farbe (c), Strichart (d), Füllung (fill) für die Auswahl; ohne Auswahl für neue Formen bzw. neue Texte. Die letzte Wahl gilt auch für die nächste neue Form.
const swatches = (attr, cur, none = false) => `<div class="swatches">${none ? `<button class="swatch none" ${attr}="keine" aria-pressed="${!cur}" title="Keine" aria-label="Keine Füllung"></button>` : ""}${COLORS.map((c) => `<button class="swatch" ${attr}="${c.k}" style="--sw:${c.css}" aria-pressed="${(cur || "schwarz") === c.k && (!none || !!cur)}" title="${c.label}" aria-label="${c.label}"></button>`).join("")}</div>`;
function styleHTML(items) {
  const one = (k) => { const v = new Set(items.map((i) => i[k] || "")); return v.size === 1 ? [...v][0] : undefined; };
  const shapes = items.filter((i) => i.type === "shape"), c = one("c");
  let h = `<div class="field"><label>Farbe</label>${swatches("data-shc", c === undefined ? "-" : c)}</div>`;
  if (shapes.length) {
    const d = new Set(shapes.map((i) => !!i.d));
    h += `<div class="field"><label>Strich</label><select data-shd>${d.size > 1 ? "<option selected disabled>(verschieden)</option>" : ""}<option value="solid"${d.size === 1 && !d.has(true) ? " selected" : ""}>Durchgezogen</option><option value="dash"${d.size === 1 && d.has(true) ? " selected" : ""}>Gestrichelt</option></select></div>`;
  }
  const filled = shapes.filter((i) => i.k !== "line");
  if (filled.length) { const v = new Set(filled.map((i) => i.fill || "")); h += `<div class="field"><label>Füllung</label>${swatches("data-shf", v.size === 1 ? [...v][0] : "-", true)}</div>`; }
  return h;
}
function setStyle(key, v) {
  const sel = selectedItems().filter((i) => i.type === "shape" || (i.type === "text" && key === "c"));
  const put = (o) => { if (key === "d") { if (v) o.d = true; else delete o.d; } else if (v === "schwarz" && key === "c" || v === "keine") delete o[key]; else if (key !== "fill" || o.k !== "line") o[key] = v; };
  if (sel.some((i) => i.type === "shape") || (!sel.length && shapeTool(S.tool))) put(S.shapeStyle);
  if (key === "c" && (sel.some((i) => i.type === "text") || (!sel.length && S.tool === "text"))) S.textC = v === "schwarz" ? null : v;
  if (sel.length) change(() => sel.forEach(put)); else { renderRight(); renderOverlay(); }
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
  for (let i = items.length - 1; i >= 0; i--) if (!D.isBack(items[i]) && items[i].type !== "shape" && R.hitItem(items[i], x, y, tol)) return items[i];
  for (let i = items.length - 1; i >= 0; i--) if (items[i].type === "shape" && R.hitItem(items[i], x, y, tol)) return items[i]; // Formen liegen hinter allem
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
  else change(() => { const id = nextId(); S.model.items.push({ id, type: "text", x: e.x, y: e.y, h: textH(), s: v, ...(isPv() ? { layer: PV.activeLayer() } : {}), ...(S.textC && isSchema() ? { c: S.textC } : {}) }); });
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
  if (e.button === 1 || S.tool === "hand" || S.space || ELPLEXA && S.shared) { S.drag = { type: "pan", sx, sy, vx: S.view.x, vy: S.view.y }; stage.setPointerCapture(e.pointerId); svg.classList.add("cursor-grabbing"); return; }
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
  } else if (S.tool === "select" && !e.shiftKey && shapeHandleAt(w.x, w.y)) {
    const g = shapeHandleAt(w.x, w.y); // Griff einer gewählten Form ziehen
    S.drag = { type: "shapeh", it: g.it, h: g.h, orig: JSON.parse(JSON.stringify(g.it)), px: sx, py: sy, started: false, snap: snapshot() };
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
  } else if (shapeTool(S.tool)) {
    S.alt = e.altKey;
    const c = shapeSnap(w);
    if (!S.shapeDraft) S.shapeDraft = { a: c, px: sx, py: sy, down: true }; else finishShape(c, e.shiftKey);
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
  S.mouse = isPv() ? PV.snap(w) : isDispo() ? dispoSnap(w.x, w.y) : shapeTool(S.tool) ? shapeSnap(w) : snap(w.x, w.y, { pins: S.tool === "wire", mag: S.tool !== "select" && S.tool !== "hand", offX: S.tool === "place" ? placeOffX() : 0 });
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
  } else if (d && d.type === "shapeh") {
    if (!d.started && Math.hypot(sx - d.px, sy - d.py) > 3) d.started = true;
    if (d.started) { dragShapeHandle(d.it, d.orig, d.h, shapeSnap(w)); renderItems(); }
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
  else if (d.type === "shapeh" && d.started) { pushUndo(d.snap); markDirty(); renderItems(); renderOverlay(); renderRight(); }
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
stage.addEventListener("pointerup", (e) => {
  if (touch.up(e)) return;
  const f = S.shapeDraft;
  if (f?.down) { const { sx, sy } = pointerPos(e); f.down = false; if (Math.hypot(sx - f.px, sy - f.py) > 3 && S.mouse) finishShape(S.mouse, e.shiftKey); } // gezogen: Loslassen setzt die Form
  endDrag(e);
});
stage.addEventListener("pointercancel", (e) => { if (!touch.up(e)) endDrag(e); });
stage.addEventListener("pointerleave", () => { if (!S.drag) { S.mouse = null; renderOverlay(); } });
stage.addEventListener("contextmenu", (e) => e.preventDefault());
stage.addEventListener("dblclick", (e) => {
  if (ELPLEXA && S.shared) return;
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

// Tab überall (CJ 19.10.2026): rechte Leiste, Fenster am Stringplan und Übersicht zeichnen beim Verlassen eines Felds neu (change),
// der Fokus ginge dabei verloren. Darum führt Tab das selbst aus: Feld übernehmen (blur → change), dann im neu gezeichneten Bereich
// das nächste bzw. (Shift) vorherige Feld wählen. Das Feld wird nach id oder erstem data-Attribut wiedergefunden.
const TAB_FOCUS = "input:not([type=hidden]), select, textarea, button, summary, a[href], [tabindex]";
const tabList = (root) => [...root.querySelectorAll(TAB_FOCUS)].filter((el) => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
function tabKey(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const a = [...el.attributes].find((x) => x.name.startsWith("data-") && x.value);
  return a ? `[${a.name}="${CSS.escape(a.value)}"]` : null;
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || e.altKey || e.metaKey || e.ctrlKey) return;
  const t = e.target;
  if (!(t instanceof HTMLElement) || !t.matches("input, select, textarea")) return;
  const root = t.closest("#right, #pv-pop, #el-hub");
  if (!root) return;
  const before = tabList(root), at = before.indexOf(t), key = tabKey(t), nth = key ? [...root.querySelectorAll(key)].indexOf(t) : -1;
  e.preventDefault(); e.stopPropagation();
  t.blur(); // übernimmt den Wert, zeichnet ggf. neu
  const now = tabList(root), same = t.isConnected ? t : key ? root.querySelectorAll(key)[nth] : null;
  let k = same ? now.indexOf(same) : -1;
  if (k < 0) k = Math.min(at, now.length) - (e.shiftKey ? 0 : 1); // Feld weg: an gleicher Stelle weiter
  const next = now[k + (e.shiftKey ? -1 : 1)] || (same && now.includes(same) ? same : null);
  if (next) { next.focus(); if (next.select && next.matches("input:not([type=checkbox]):not([type=radio]):not([type=date])")) next.select(); }
}, true);

window.addEventListener("keydown", (e) => {
  if ($("#modal-root .modal-back")) return; // Dialog offen: keine Tastenkürzel
  if (ELPLEXA && elHubKey(e)) return;
  if (ELPLEXA && S.shared && elShareKey(e)) return;
  const t = e.target;
  const typing = t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA");
  const mod = e.metaKey || e.ctrlKey;
  if (mod && !typing) {
    const k = e.key.toLowerCase();
    if (k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (k === "y") { e.preventDefault(); redo(); return; }
    if (k === "s") { e.preventDefault(); if (ELPLEXA) elSave(e.shiftKey); else saveJson(e.shiftKey); return; }
    if (k === "o") { e.preventDefault(); openJson(); return; }
    if (k === "d") { e.preventDefault(); duplicateSelected(); return; }
    if (k === "c") { e.preventDefault(); copySelected(); return; }
    if (k === "v") { e.preventDefault(); pasteClip(); return; }
    if (k === "f") { e.preventDefault(); searchDialog(); return; }
    if (isPv() && /^Digit[1-5]$/.test(e.code)) { e.preventDefault(); PV.setActive(DRAW_LAYERS[Number(e.code.slice(5)) - 1]); return; } // aktive Ebene
    if (k === "a") { e.preventDefault(); S.sel = new Set((isPv() ? PV.layerPick() : pickable()).map((i) => i.id)); renderRight(); renderOverlay(); return; } // Stringplan: nur aktive Ebene (5n)
  }
  if (mod && typing && e.key.toLowerCase() === "s") { e.preventDefault(); if (ELPLEXA) elSave(false); else saveJson(false); return; }
  if (typing) { if (e.key === "Escape") t.blur(); return; }
  if (e.key === " ") { e.preventDefault(); if (!S.space) { S.space = true; svg.classList.add("cursor-hand"); } return; }
  if (e.key === "Shift") { S.shift = true; renderOverlay(); }
  if (e.key === "Alt") S.alt = true;
  if (isPv() && e.key === "Tab" && !mod && !e.altKey && PV.cornerKey(e.shiftKey)) { e.preventDefault(); return; } // Bezugsecke bei Modul und Modulfeld (5x)
  if (isDispo() && e.key === "Tab" && !mod && !e.altKey && dispoCornerKey(e.shiftKey)) { e.preventDefault(); renderRight(); renderOverlay(); updateHint(); return; } // Bezugsecke neuer Platten (CJ 16.10.)
  if (isPv() && !mod && !e.altKey && PV.toolKey(e.key)) return; // S, P, E, B: Werkzeuge des Stringplans (Schritt 5d)
  if (!mod && !e.altKey && poleKey(e.key)) { e.preventDefault(); return; } // 1 bis 4 und N: Polzahl (CJ 16.10.)
  if (ELPLEXA && !mod && !e.altKey && elKey(e)) { e.preventDefault(); return; } // Module, Übersicht, Leisten, Hilfe
  switch (e.key) {
    case "v": case "V": setTool("select"); break;
    case "l": case "L": if (!isDispo() && !isPv()) setTool("wire"); break;
    case "t": case "T": setTool("text"); break;
    case "h": case "H": setTool("hand"); break;
    case "i": case "I": case "q": case "Q": case "o": case "O": if (isSchema()) setTool(SHAPE_TOOLS.find((t) => t.key === e.key.toUpperCase()).id); break; // Linie, Rechteck, Kreis
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
      else if (S.shapeDraft) { S.shapeDraft = null; renderOverlay(); updateHint(); }
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
    if ((t.dataset.attr === "BMK" && bmkLetter(SYMBOL_BY_NAME[one.sym])) || (t.dataset.attr === "FBMK" && one.sym === "ZW_SICH")) { one.manual = t.value.trim() !== ""; renumberAll(S.doc); }
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
  else if (t.dataset.shd !== undefined) setStyle("d", t.value === "dash");
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
  const sw = e.target.closest("[data-shc], [data-shf]");
  if (sw) { setStyle(sw.dataset.shc !== undefined ? "c" : "fill", sw.dataset.shc ?? sw.dataset.shf); return; } // Farbe, Füllung (formen.js)
  const dk = e.target.closest("[data-deck]");
  if (dk) { deckAction(dk); return; } // Titelseite: Logo, Änderungsindex
  const pva = e.target.closest("[data-pvact]");
  if (pva) { if (pva.dataset.pvact === "pmid") pvPop.hide(false); PV.action(pva); return; } // Stringplan: Modultypen, Katalog. Druckmitte setzen schliesst das Fenster.
  const b = e.target.closest("[data-act]");
  if (!b) return;
  if (b.dataset.act.startsWith("dp")) { dispoAct(b.dataset.act, b); return; } // Zählerplatte bestücken, Masse aus-/einblenden
  if (b.dataset.act.startsWith("cab")) { dispoCabAct(b.dataset.act, b, selectedItems()[0]); return; } // Schrank: Feld anfügen, löschen, Montageplatten
  const one = selectedItems()[0];
  ({ rotate: rotateSelected, dup: duplicateSelected, del: deleteSelected, base: insertBase, feed: addFeed, addrail: addRail, align: () => alignSelected(b.dataset.m), delsheet: deleteSheet, dupsheet: duplicateSheet, gotitle: () => switchSheet(S.doc.sheets.indexOf(T.titleOf(S.doc))), golegend: () => { S.legSel = one?.id ?? null; switchSheet(S.doc.sheets.length - 1); }, relink: () => one && changeLink(one), unlink: () => one && change(() => unlinkRef(S.doc, one)), autorail: () => addAutoRails(one, Number(b.dataset.n), Number(b.dataset.p)), handover: handOver, gosrc: () => { const i = S.doc.sheets.findIndex((sh) => sh.kind === "dispo" && sh.sid === one?.src); if (i >= 0) switchSheet(i); } })[b.dataset.act]?.();
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
const addMenu = makeMenu($("#add-menu"), { up: true, beforeShow: () => { closeEditor(true); $("#add-menu [data-new=deck]").hidden = !(S.doc.sheets.some((sh) => !sh.kind) && (S.doc.noTitle || S.doc.noToc)); if (ELPLEXA) elAddFilter(); } });
$("#add-menu").addEventListener("click", (e) => { const b = e.target.closest("[data-new]"); if (b) ({ dispo: addDispo, pv: addPv, pvtab: addPvTab, deck: addDeck }[b.dataset.new] || addSheet)(); });
sheetMenu = makeMenu($("#sheet-menu"), { up: true, beforeShow: () => closeEditor(true), onOpen: () => { $("#sheet-find").value = ""; renderSheetList(); $("#sheet-find").focus(); $("#sheet-menu .mi.on")?.scrollIntoView({ block: "nearest" }); } });
$("#sheet-find").addEventListener("input", renderSheetList);
// Blattmenü (CJ 18.10.2026): Rechtsklick oder gedrückt halten auf dem Blattnamen, einer Zeile der Blattliste oder (elplexaCAD) einer
// Blatt-Kachel der Übersicht. data-ctx = Index des Blatts. Gedrückt halten wie beim Plus-Knopf (450 ms), der folgende Klick fällt weg.
let ctxSheet = -1, ctxHub = false, ctxTimer = 0, ctxHeld = false;
const ctxMenu = makeMenu($("#sheet-ctx"), { up: true, beforeShow: () => {
  const sh = S.doc.sheets[ctxSheet], deck = T.isDeck(sh);
  $("#sheet-ctx .ctx-head").textContent = `${sheetLabel(sh, ctxSheet)}${sh.meta.TITEL ? ` · ${sh.meta.TITEL}` : ""}`;
  $("#sheet-ctx [data-ctxact=dup]").disabled = $("#sheet-ctx [data-ctxact=ren]").disabled = deck;
  $("#sheet-ctx [data-ctxact=del]").disabled = deck || workCount() < 2;
} });
function openCtx(el) {
  const i = Number(el.dataset.ctx);
  if (!S.doc.sheets[i]) return;
  ctxSheet = i; ctxHub = !!el.closest("#el-hub");
  ctxMenu.show(el.closest("#sheet-menu") ? $("#sheet-cur") : el); // Zeile der Blattliste: die Liste schliesst, Menü am Blattnamen
}
const ctxOpen = (el) => (ELPLEXA && S.shared ? null : el.dataset.savectx !== undefined ? ELPLEXA && EL_S.saveCtx.show(el) : el.dataset.modctx ? ELPLEXA && elModCtx(el) : openCtx(el)); // Speichern-Knopf, Modul-Kachel (elplexaCAD) oder Blatt
document.addEventListener("contextmenu", (e) => { const el = e.target.closest?.("[data-ctx], [data-modctx], [data-savectx]"); if (el) { e.preventDefault(); clearTimeout(ctxTimer); ctxOpen(el); } });
document.addEventListener("pointerdown", (e) => {
  ctxHeld = false; clearTimeout(ctxTimer);
  const el = e.target.closest?.("[data-ctx], [data-modctx], [data-savectx]");
  if (el && e.button === 0) ctxTimer = setTimeout(() => { ctxHeld = true; ctxOpen(el); }, 450);
});
for (const ev of ["pointerup", "pointercancel", "pointermove"]) document.addEventListener(ev, (e) => { if (ev !== "pointermove" || Math.abs(e.movementX) + Math.abs(e.movementY) > 4) clearTimeout(ctxTimer); });
document.addEventListener("click", (e) => { if (ctxHeld) { ctxHeld = false; e.stopPropagation(); e.preventDefault(); setTimeout(() => document.querySelector(".menu:not([hidden]) .mi:not([hidden]):not(:disabled)")?.focus(), 0); } }, true); // Touch: der Klick nach dem Loslassen nahm dem Menü den Fokus
$("#sheet-ctx").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-ctxact]"), i = ctxSheet, hub = ELPLEXA && ctxHub;
  if (!b || !S.doc.sheets[i]) return;
  if (hub) elHub(false);
  if (i !== S.active) switchSheet(i);
  if (b.dataset.ctxact === "ren") { await renameSheet(); if (hub) elHub(true); }
  else if (b.dataset.ctxact === "dup") duplicateSheet();
  else if (b.dataset.ctxact === "del") { await deleteSheet(); if (hub) elHub(true); }
});
$("#sheet-menu").addEventListener("click", (e) => {
  const sa = e.target.closest("[data-sheetact]");
  if (sa) { (sa.dataset.sheetact === "dup" ? duplicateSheet : deleteSheet)(); return; } // aktives Blatt (CJ 18.10.2026)
  const pin = e.target.closest("[data-pin]"), t = e.target.closest("[data-sheet]");
  if (pin) { togglePin(Number(pin.dataset.pin)); renderSheetList(); } else if (t) switchSheet(Number(t.dataset.sheet));
});
$("#btn-undo").addEventListener("click", undo);
$("#btn-redo").addEventListener("click", redo);
$("#btn-open").addEventListener("click", () => openJson());
$("#btn-save").addEventListener("click", () => ELPLEXA ? (EL_S.saveCtx.open ? EL_S.saveCtx.hide() : elSave(false)) : saveJson(false)); // offenes Menü: Klick schliesst es
$("#btn-dxf").addEventListener("click", () => saveDxf());
$("#btn-pdf").addEventListener("click", () => printPdf());
$("#btn-legpdf").addEventListener("click", () => printLegend());
$("#btn-dxf-all").addEventListener("click", () => saveDxfAll());
$("#btn-lists").addEventListener("click", () => { closeEditor(true); download(`${baseName()}_Listen.csv`, listsCsv(S.doc), "text/csv"); });
$("#btn-handover").addEventListener("click", handOver);

pvPop = makeMenu(popEl, { left: true, form: true, beforeShow: () => closeEditor(true), onOpen: () => popEl.focus() });
// Knöpfe oben (Druck, Schriftfeld, Hauptlinien, Ansicht) und im Stringplan rechts ohne Auswahl die Zeilen Module und Wechselrichter (18.10.2026)
function togglePop(b) {
  if (pvPop.open && pvPop.anchorId() === b.id) { pvPop.hide(); return; }
  popKind = b.dataset.pop; popEl.setAttribute("aria-label", { mod: "Module", wr: "Wechselrichter", druck: "Druck", blatt: "Schriftfeld", haupt: "Hauptlinien", ansicht: "Ansicht" }[popKind]);
  popEl.innerHTML = popHTML(); popEl.scrollTop = 0;
  if (pvPop.open) pvPop.hide(false);
  pvPop.show(b, { beside: rightEl.contains(b) && innerWidth > 600 ? rightEl : null }); // Handy: rechte Leiste liegt unten, Fenster unter der Zeile
}
for (const b of document.querySelectorAll("#pv-bar [data-pop], #doc-bar [data-pop]")) b.addEventListener("click", () => togglePop(b));
rightEl.addEventListener("click", (e) => { const b = e.target.closest("button[data-pop]"); if (b) togglePop(b); });

// Kopfleiste (18.10.2026): Beschriftungen nach Platz ausblenden, gemessen statt fester Fensterbreite. Stufen tb-1 … tb-6 (style.css) der Reihe nach,
// bis nichts mehr überläuft. Neu messen bei anderer Breite und wenn sich Knöpfe oder Texte in der Leiste ändern.
const topbar = $("#topbar"), TB_STEPS = ["tb-1", "tb-2", "tb-3", "tb-4", "tb-5", "tb-6"];
function fitTopbar() {
  topbar.classList.remove(...TB_STEPS);
  for (const c of TB_STEPS) { if (topbar.scrollWidth <= topbar.clientWidth) break; topbar.classList.add(c); }
}
new ResizeObserver(fitTopbar).observe(topbar);
new MutationObserver(fitTopbar).observe(topbar, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });
document.fonts?.ready.then(fitTopbar);

// Seitenleisten ziehbar (CJ 18.10.2026): Griff am Rand der Zeichenfläche, 200 bis 440 px, Doppelklick = Standardbreite, Pfeiltasten ±16 px.
// Breite je Gerät in localStorage (fehlt = Standard aus style.css), ohne Animation. Unter 860 px Overlay-Leisten, dort ist der Griff aus.
const SIDE_KEY = "schemacad.leisten", SIDE_MIN = 200, SIDE_MAX = 440, SIDE_VAR = { left: "--lw", right: "--rw" }, appEl = $("#app");
const sideEl = (side) => (side === "left" ? leftEl : rightEl);
function sideSet(side, w) {
  if (w == null) appEl.style.removeProperty(SIDE_VAR[side]);
  else appEl.style.setProperty(SIDE_VAR[side], `${Math.round(Math.min(SIDE_MAX, Math.max(SIDE_MIN, w)))}px`);
  $(`#grip-${side}`).setAttribute("aria-valuenow", String(Math.round(sideEl(side).getBoundingClientRect().width)));
}
function sideSave() {
  const v = {}; for (const side in SIDE_VAR) { const x = parseFloat(appEl.style.getPropertyValue(SIDE_VAR[side])); if (x) v[side] = x; }
  try { localStorage.setItem(SIDE_KEY, JSON.stringify(v)); } catch { /* ohne Speicher: Breite gilt bis zum Neuladen */ }
}
try { const v = JSON.parse(localStorage.getItem(SIDE_KEY) || "{}"); for (const side in SIDE_VAR) if (Number.isFinite(v?.[side])) sideSet(side, v[side]); } catch { /* Standardbreite */ }
for (const g of document.querySelectorAll(".side-grip")) {
  const side = g.dataset.side, dir = side === "left" ? 1 : -1;
  let start = null;
  g.addEventListener("pointerdown", (e) => {
    e.stopPropagation(); // nicht die Zeichenfläche (sie würde den Zeiger übernehmen)
    if (e.button !== 0 || start) return; // ein Finger, eine Maustaste
    e.preventDefault(); g.setPointerCapture(e.pointerId);
    start = { x: e.clientX, w: sideEl(side).getBoundingClientRect().width, id: e.pointerId };
    g.classList.add("on"); document.body.classList.add("side-drag");
  });
  g.addEventListener("pointermove", (e) => { e.stopPropagation(); if (start && e.pointerId === start.id) sideSet(side, start.w + (e.clientX - start.x) * dir); });
  const end = (e) => { e.stopPropagation(); if (!start || e.pointerId !== start.id) return; start = null; g.classList.remove("on"); document.body.classList.remove("side-drag"); sideSave(); };
  g.addEventListener("pointerup", end); g.addEventListener("pointercancel", end); g.addEventListener("lostpointercapture", end);
  g.addEventListener("dblclick", () => { sideSet(side, null); sideSave(); });
  g.addEventListener("keydown", (e) => {
    const d = { ArrowLeft: -16, ArrowRight: 16 }[e.key];
    if (e.key === "Home" || e.key === "End") { e.preventDefault(); e.stopPropagation(); sideSet(side, e.key === "Home" ? SIDE_MIN : SIDE_MAX); sideSave(); return; }
    if (!d) return;
    e.preventDefault(); e.stopPropagation(); // keine Pfeiltasten der Zeichenfläche
    sideSet(side, sideEl(side).getBoundingClientRect().width + d * dir); sideSave();
  });
  g.setAttribute("aria-valuenow", String(Math.round(sideEl(side).getBoundingClientRect().width)));
}
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
$("#btn-new").addEventListener("click", ELPLEXA ? () => (EL_S.hub && !EL_S.hub.hidden ? elNewProject() : newDocument()) : newDocument); // elplexaCAD: in der Übersicht neues Projekt (CJ 18.10.2026)
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

// ---------- elplexaCAD (Aufbau B, CJ 17.10.2026; nur im Bau `node build.mjs elplexa`) ----------
// Module = Blattarten derselben Datei (elplexa.js). Das offene Modul folgt aus dem aktiven Blatt; Blattleiste, Plus-Menü
// und Blatt vor/zurück bleiben im Modul. Projektübersicht über allem ausser Kopf- und Statusleiste.
const EL_S = { hub: null, last: {}, lastOf: {}, modMenu: null, addMenu: null };
const elMod = () => E.moduleOf(S.model);
const elIdx = () => E.modIdx(S.doc, elMod());
function elSheetBar() {
  const a = S.active, sh = S.model, idx = elIdx(), pos = idx.indexOf(a), m = E.modById(elMod());
  $("#btn-dxf-all").hidden = S.doc.sheets.length < 2;
  const open = sheetMenu?.open, keep = document.activeElement?.closest?.("#sheetbar") && document.activeElement.id;
  const mn = S.doc.mods?.[elMod()]?.name || `${m.short || m.label}${varOf(sh) > 1 && !T.isDeck(sh) ? ` ${varOf(sh)}` : ""}`; // eigener Name des Moduls (18.10.2026)
  $("#sheetbar").innerHTML = `<span class="el-sbmod" title="Modul ${R.esc(modName(S.doc, elMod()))}"><span class="el-dot" style="background:${m.color}" aria-hidden="true"></span>${R.esc(mn)}</span>`
    + `<button class="sheettab nav" data-step="-1" title="Vorheriges Blatt im Modul (Bild auf)" aria-label="Vorheriges Blatt"${pos <= 0 ? " disabled" : ""}>‹</button>`
    + `<button class="sheettab cur" id="sheet-cur" data-gosheet aria-haspopup="dialog" aria-expanded="${!!open}" title="Blätter dieses Moduls (G). Rechtsklick oder gedrückt halten: Duplizieren, Löschen" data-ctx="${a}"><span class="cl">${sh.pin ? "★ " : ""}${R.esc(sheetLabel(sh, a))}</span>${sh.meta.TITEL && !T.isDeck(sh) ? `<span class="ct">${R.esc(sh.meta.TITEL)}</span>` : ""}<span class="of">${pos + 1} von ${idx.length}</span><span class="caret" aria-hidden="true">▾</span></button>`
    + `<button class="sheettab nav" data-step="1" title="Nächstes Blatt im Modul (Bild ab)" aria-label="Nächstes Blatt"${pos >= idx.length - 1 ? " disabled" : ""}>›</button>`
    + `<button class="sheettab add" id="sheet-add" data-addsheet aria-haspopup="menu" aria-expanded="false" title="Neu: ${addKindLabel()}. Gedrückt halten oder Rechtsklick: Blatttyp wählen" aria-label="Neu: ${addKindLabel()}">${R.icons.plus}</button>`;
  if (keep) document.getElementById(keep)?.focus();
  if (open) renderSheetList();
}
function elSheetList() {
  const q = $("#sheet-find").value.trim().toLowerCase(), idx = elIdx();
  const rows = idx.map((i) => ({ sh: S.doc.sheets[i], i, label: sheetLabel(S.doc.sheets[i], i), title: S.doc.sheets[i].meta.TITEL || "" })).filter((r) => !q || `${r.label} ${r.title}`.toLowerCase().includes(q));
  $("#sheet-menu .slist").innerHTML = rows.length ? rows.map(({ sh, i, label, title }, n) => `<div class="srow"><button class="mi${i === S.active ? " on" : ""}" data-sheet="${i}" data-ctx="${i}" tabindex="-1"${i === S.active ? ' aria-current="true"' : ""}><span class="mt"><span class="mh">${R.esc(label)}</span><span class="ms">${R.esc(title || "ohne Titel")}</span></span><span class="pos">${idx.indexOf(i) + 1}</span></button><button class="pin" data-pin="${i}" tabindex="-1" title="${sh.pin ? "Markierung entfernen" : "Blatt markieren"} (M für das aktive Blatt)" aria-label="${sh.pin ? "Markierung entfernen" : "Blatt markieren"}" aria-pressed="${!!sh.pin}">${sh.pin ? "★" : "☆"}</button></div>`).join("") : `<div class="empty">Kein Blatt gefunden</div>`;
}
function elStep(d) { const idx = elIdx(), i = idx[idx.indexOf(S.active) + d]; if (i !== undefined) switchSheet(i); }
function elAddFilter() { const ok = E.ADD_KINDS[E.baseOf(elMod())] || []; for (const b of document.querySelectorAll("#add-menu [data-new]")) if (!ok.includes(b.dataset.new)) b.hidden = true; else if (b.dataset.new !== "deck") b.hidden = false; } // deck: eigene Regel davor
function elSync() {
  const id = elMod(), m = E.modById(id);
  EL_S.last[id] = S.active;
  document.documentElement.style.setProperty("--el-band", m.color);
  document.body.dataset.elmod = E.baseOf(id); EL_S.lastOf[E.baseOf(id)] = id;
  setProjectMeta(S.doc.project?.meta); // neue Blätter bekommen die Projektdaten (model.js newMeta)
  const c = $("#el-crumb"); if (c && EL_S.hub?.hidden !== false) c.innerHTML = E.crumbHTML(id, E.statusOf(S.doc), modName(S.doc, id));
}
function elInit() {
  const crumb = document.createElement("div"); crumb.id = "el-crumb"; crumb.className = "el-crumb";
  $("#topbar .filechip").after(crumb);
  const bare = document.createElement("button"); bare.className = "btn icon el-barebtn"; bare.id = "el-bare"; bare.dataset.elact = "bare";
  bare.title = "Seitenleisten aus und ein (§)"; bare.setAttribute("aria-label", "Seitenleisten aus und ein"); bare.setAttribute("aria-pressed", "false"); bare.innerHTML = R.icons.panelL;
  $("#btn-undo").before(bare);
  const fb = document.createElement("button"); fb.className = "btn el-fbbtn"; fb.id = "el-fb"; fb.dataset.elact = "feedback"; fb.type = "button";
  fb.title = "Fehler, Anregung oder Wunsch melden, mit Screenshot der Ansicht"; fb.innerHTML = `<span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v10H10l-4 4v-4H5z"/><path d="M9 9.5h6M9 12h4"/></svg></span><span class="lbl">Feedback melden</span>`;
  $("#statusbar").append(fb);
  const shm = document.createElement("button"); shm.className = "mi"; shm.id = "el-btn-share"; shm.setAttribute("role", "menuitem"); shm.tabIndex = -1; shm.title = "Link nur für dieses Modul, ohne Login ansehen";
  shm.innerHTML = `<span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg></span><span class="mt"><span class="mh">Modul teilen …</span><span class="ms">Link zum Ansehen, ohne Login</span></span>`;
  shm.addEventListener("click", () => elShareModule()); // das Menü schliesst sich selbst (makeMenu)
  $("#export-menu").append(shm);
  const hub = document.createElement("div"); hub.id = "el-hub"; hub.hidden = true; hub.setAttribute("role", "region"); hub.setAttribute("aria-label", "Projektübersicht");
  const mm = document.createElement("div"); mm.className = "menu"; mm.id = "el-modmenu"; mm.setAttribute("role", "menu"); mm.setAttribute("aria-label", "Modul öffnen"); mm.hidden = true;
  const am = mm.cloneNode(); am.id = "el-addmenu"; am.setAttribute("aria-label", "Modul anlegen");
  $("#app").append(hub, mm, am);
  EL_S.hub = hub;
  S.elLocked = elLocked; S.elUnlock = elUnlock; // für files.js (Speichern, PDF, Downloads)
  EL_S.modMenu = makeMenu(mm, { left: true, beforeShow: () => { mm.innerHTML = E.modMenuHTML(S.doc, EL_S.hub.hidden ? elMod() : null); } });
  EL_S.addMenu = makeMenu(am, { left: true, beforeShow: () => { am.innerHTML = E.addModMenuHTML(S.doc); } });
  const mc = mm.cloneNode(); mc.id = "el-modctx"; mc.setAttribute("aria-label", "Modul");
  mc.innerHTML = `<div class="ctx-head"></div>` + [["open", "list", "Öffnen", ""], ["ren", "text", "Umbenennen", "Eigener Name, z. B. Schema HV"], ["dup", "copy", "Duplizieren", "Ganzes Modul, unabhängig vom Original"], ["del", "trash", "Löschen", "Mit allen Blättern, Rückgängig möglich"]]
    .map(([a, ic, t, sub]) => `<button class="mi${a === "del" ? " danger" : ""}" role="menuitem" data-elmodact="${a}" tabindex="-1"><span class="ic">${R.icons[ic]}</span><span class="mt"><span class="mh">${t}</span>${sub ? `<span class="ms">${sub}</span>` : ""}</span></button>`).join("");
  $("#app").append(mc);
  EL_S.modCtx = makeMenu(mc, { left: true, beforeShow: () => {
    const id = EL_S.ctxMod, n = E.modIdx(S.doc, id).filter((i) => !T.isDeck(S.doc.sheets[i])).length;
    mc.querySelector(".ctx-head").textContent = `${modName(S.doc, id)} · ${n} ${n === 1 ? "Blatt" : "Blätter"}`;
    mc.querySelector("[data-elmodact=del]").disabled = !S.doc.sheets.some((sh) => !T.isDeck(sh) && modOf(sh) !== id);
  } });
  mc.addEventListener("click", (e) => { const b = e.target.closest("[data-elmodact]"); if (b) elModAct(b.dataset.elmodact); });
  // Menü am Knopf Speichern (CJ 18.10.2026, Klick-Regel): Rechtsklick oder gedrückt halten; Online nur mit Login
  const sv = mm.cloneNode(); sv.id = "el-savectx"; sv.setAttribute("aria-label", "Speichern");
  sv.innerHTML = [["file", "Lokal speichern (Datei)", "Als .elplexa.json auf diesem Rechner"], ["as", "Speichern unter …", "Neue Datei wählen (⇧⌘S)"], ["on", "Online speichern", "In der Online-Ablage, auf jedem Rechner öffnen"]]
    .map(([a, t, sub]) => `<button class="mi" role="menuitem" data-elsaveact="${a}" tabindex="-1"><span class="ic">${R.icons.save}</span><span class="mt"><span class="mh">${t}</span><span class="ms">${sub}</span></span></button>`).join("");
  $("#app").append(sv); $("#btn-save").dataset.savectx = ""; $("#btn-save").title = "Speichern (⌘S). Rechtsklick oder gedrückt halten: Lokal oder online speichern";
  EL_S.saveCtx = makeMenu(sv, { beforeShow: () => { closeEditor(true); sv.querySelector('[data-elsaveact="on"]').hidden = !cloudUser(); } });
  sv.addEventListener("click", (e) => { const a = e.target.closest("[data-elsaveact]")?.dataset.elsaveact; if (a === "on") elSaveOnline(); else if (a) saveJson(a === "as"); });
  const sp = mm.cloneNode(); sp.id = "el-shpop"; sp.setAttribute("aria-label", "Blätter des Moduls"); $("#app").append(sp); // „+N“ der Modulkarte (CJ 18.10.2026)
  EL_S.shPop = makeMenu(sp, { left: true, beforeShow: () => { sp.innerHTML = E.sheetPopHTML(S.doc, EL_S.popMod, sheetLabel); } });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-elsheet], [data-elmore], [data-elpdf], [data-elact], [data-elopen], [data-elnew], [data-eltdel], [data-elrecent], [data-elonline], [data-elodel], [data-elzok], [data-elzweg]");
    if (!b || b.disabled) return;
    if (b.dataset.elmore) { EL_S.popMod = b.dataset.elmore; EL_S.shPop.toggle(b); } // alle Blätter des Moduls
    else if (b.dataset.elpdf) printPdf(E.modIdx(S.doc, b.dataset.elpdf).map((i) => S.doc.sheets[i]), `_${modName(S.doc, b.dataset.elpdf)}`); // Modul als PDF, Login-Regel in printPdf
    else if (b.dataset.elsheet) { elHub(false); switchSheet(Number(b.dataset.elsheet)); } // Blatt-Kachel: genau dieses Blatt (CJ 18.10.2026)
    else if (b.dataset.elopen) elOpen(b.dataset.elopen, { exact: b.dataset.exact !== undefined }); // exact: genau dieses Modul (Kachel), sonst Art
    else if (b.dataset.elnew) elNew(b.dataset.elnew);
    else if (b.dataset.eltdel) elTimeDel(Number(b.dataset.eltdel));
    else if (b.dataset.elzok || b.dataset.elzweg) elZeitResolve(b.dataset.elzok || b.dataset.elzweg, !!b.dataset.elzok);
    else if (b.dataset.elrecent) elOpenRecent(Number(b.dataset.elrecent));
    else if (b.dataset.elonline) elOnlineOpen(b.dataset.elonline);
    else if (b.dataset.elodel) elOnlineDelete(b.dataset.elodel);
    else ({ hub: () => elHub(true), bare: elBare, pdf: () => printPdf(), modmenu: () => EL_S.modMenu.toggle(b), addmod: () => EL_S.addMenu.toggle(b), newproj: elNewProject, csv: elCsv,
      gwr: elGwr, onsave: elOnlineSave, onlist: elOnlineList, logout: elLogout, login: elLogin, feedback: elFeedback }[b.dataset.elact] || (() => {}))();
  });
  hub.addEventListener("change", (e) => { const k = e.target.dataset?.elp; if (k) elSetProject(k, e.target.value); });
  hub.addEventListener("submit", (e) => { e.preventDefault(); elTimeAdd(); });
  adrInit(hub);
  hub.addEventListener("keydown", (e) => { const r = e.key === "Enter" && e.target.closest?.("[data-elz]"); if (r) { e.preventDefault(); elZeitResolve(r.dataset.elz, true); } }); // Enter in der Zeile übernimmt
  hub.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches?.("input[data-elp]")) { e.preventDefault(); e.target.blur(); } }); // Enter übernimmt
  hub.addEventListener("click", (e) => { const b = e.target.closest("[data-elshare]"); if (b && !b.disabled) elShareDialog(b.dataset.elshare); });
  addEventListener("el-file", (e) => { // files.js: gespeichert oder geöffnet
    elZeitDoc({ file: !EL_S.fromOnline });
    if (EL_S.fromOnline) return; // aus der Online-Ablage geöffnet: keine Datei, nicht unter „zuletzt geöffnet“
    E.recentAdd({ file: e.detail.file, name: elName(), status: E.statusOf(S.doc), handle: e.detail.handle || null }).then(() => { if (!EL_S.hub.hidden) elHub(true, { keepFocus: true }); });
  });
  elZeitInit(); elSync(); elHub(true);
  if (S.shared) elShareLoad();
}
// Übersicht zeigen (show) oder schliessen; beim Schliessen bleibt das zuletzt offene Modul. keepFocus: neu zeichnen, Fokus bleibt
function elHub(show, { keepFocus = false } = {}) {
  if (!show && S.shared && !EL_S.shareInfo) return; // geteilte Ansicht: Übersicht bleibt, bis das Projekt geladen ist
  const h = EL_S.hub, f = keepFocus && document.activeElement?.closest?.("#el-hub") ? (document.activeElement.id ? "#" + document.activeElement.id : document.activeElement.dataset.elp ? `[data-elp="${document.activeElement.dataset.elp}"]` : null) : null;
  if (show) {
    finishWire(); closeEditor(true); elZeitPause(); // in der Übersicht läuft keine Zeit
    const today = elDay(Date.now());
    const file = S.fileHandle?.name || "", suggest = `${baseName()}.elplexa.json`;
    const gd = h.querySelector("#el-gwr"); if (gd) EL_S.gwrOpen = gd.open; // GWR-Feld bleibt beim Neuzeichnen offen oder zu
    h.innerHTML = S.shared && !EL_S.shareInfo ? (EL_S.shareFail ? E.shareFailHTML(EL_S.shareFail.grund, EL_S.shareFail.msg) : E.shareLoadHTML())
      : E.hubHTML(S.doc, { name: elName(), file, suggest, today, label: sheetLabel, shared: S.shared ? EL_S.shareInfo : null, gwrOpen: !!EL_S.gwrOpen, gwrBusy: !!EL_S.gwrBusy });
    for (const el of h.querySelectorAll(".ic[data-ic]")) el.innerHTML = R.icons[el.dataset.ic];
    E.recentList().then((l) => { EL_S.recent = l; const r = h.querySelector("#el-recent"); if (r) r.innerHTML = E.recentHTML(l); });
    elOnlineDraw();
  }
  h.hidden = !show; document.body.classList.toggle("el-hubopen", show);
  $("#btn-new").title = show ? "Neues Projekt anlegen" : "Neues Dokument: Schema, Disposition oder Stringplan";
  $("#el-crumb").innerHTML = show ? `<span class="el-hubtitle">Projektübersicht</span>${E.statusPill(E.statusOf(S.doc))}` : E.crumbHTML(elMod(), E.statusOf(S.doc), modName(S.doc, elMod()));
  if (f) h.querySelector(f)?.focus(); else if (keepFocus) { /* Fokus nicht auf eine Kachel springen lassen */ } else if (show) h.querySelector(".el-tile")?.focus(); else svg.focus();
}
// Projektname: in der Datei (doc.project.name), alte Dateien ohne Namen nehmen den Dateinamen
const elName = () => S.doc.project?.name || S.fileName;
const elProj = () => (S.doc.project ||= {});
// Feld der Übersicht ändern: Name, Status oder Projektdaten. Projektdaten gehen in die Schriftfelder aller Blätter
// (und in doc.project.meta für neue Blätter), Bauherr auf die Titelseite. Ein Rückgängig-Schritt.
function elSetProject(k, v) {
  v = v.trim();
  if (k === "name" && !v) { elHub(true, { keepFocus: true }); return; } // leerer Name: alter bleibt
  change(() => {
    const p = elProj();
    if (k === "name") p.name = v;
    else if (k === "status") p.status = v;
    else if (k.startsWith("adr:")) { const a = (p.adr ||= {}); if (v) a[k.slice(4)] = v; else delete a[k.slice(4)]; if (!Object.keys(a).length) delete p.adr; }
    else if (k === "BAUHERR") { const info = E.bauherrInfo(S.doc) || (S.doc.info = cleanInfo({})); info.BAUHERR = v; }
    else { (p.meta ||= {})[k] = v; for (const sh of S.doc.sheets) sh.meta[k] = v; }
  }, { panel: false });
  setProjectMeta(S.doc.project?.meta);
  if (k === "name" && !S.fileHandle) setFileName(v); // noch ohne Datei: Kopf zeigt den Projektnamen
  elHub(true, { keepFocus: true });
}
// GWR abrufen (CJ 19.10.2026, gwr.js): ersetzt project.gwr, füllt leere PLZ/Ort
async function elGwr() {
  if (EL_S.gwrBusy) return;
  EL_S.gwrBusy = true; EL_S.gwrOpen = true; elHub(true, { keepFocus: true });
  try {
    const doc = S.doc, r = await fetchGwr(doc.project?.adr);
    if (S.doc !== doc) return; // inzwischen anderes Projekt geöffnet
    change(() => { const p = elProj(); p.adr = r.adr; p.gwr = r.gwr; }, { panel: false });
    toast(`GWR abgerufen: EGID ${r.gwr.egid}.`);
  } catch (err) { toast(err.message, "error"); }
  finally { EL_S.gwrBusy = false; if (!EL_S.hub.hidden) elHub(true, { keepFocus: true }); }
}
// Adresssuche beim Tippen (CJ 19.10.2026): im Feld Strasse tippen (ab 3 Zeichen), Vorschläge darunter. Pfeiltasten und Enter oder Klick wählen,
// Esc schliesst. Die Auswahl füllt Strasse, Nr., PLZ, Ort und holt gleich das GWR. Ältere Antworten werden verworfen (seq).
const ADR = { list: null, items: [], i: -1, seq: 0, timer: 0, input: null };
function adrInit(hub) {
  const l = document.createElement("div");
  l.id = "el-adrlist"; l.className = "menu instant el-adrlist"; l.setAttribute("role", "listbox"); l.setAttribute("aria-label", "Adressvorschläge"); l.hidden = true;
  $("#app").append(l); ADR.list = l;
  l.addEventListener("mousedown", (e) => { e.preventDefault(); const o = e.target.closest("[data-adr]"); if (o) adrPick(Number(o.dataset.adr)); }); // Fokus bleibt im Feld
  hub.addEventListener("input", (e) => { if (e.target.dataset?.elp === "adr:str") adrQuery(e.target); });
  hub.addEventListener("focusout", (e) => { if (e.target === ADR.input) adrClose(); });
  hub.addEventListener("scroll", adrClose, { passive: true });
  hub.addEventListener("keydown", (e) => {
    if (e.target !== ADR.input || l.hidden) return;
    const n = ADR.items.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); if (n) adrMark(e.key === "ArrowDown" ? (ADR.i + 1) % n : ADR.i <= 0 ? n - 1 : ADR.i - 1); }
    else if (e.key === "Enter" && n) { e.preventDefault(); e.stopPropagation(); adrPick(Math.max(0, ADR.i)); } // Enter ohne Auswahl nimmt den ersten Vorschlag
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); adrClose(); }
  }, true);
}
function adrQuery(input) {
  ADR.input = input; clearTimeout(ADR.timer);
  const q = input.value.trim();
  if (q.length < 3) { ADR.seq++; adrClose(); return; }
  ADR.timer = setTimeout(async () => {
    const seq = ++ADR.seq;
    let r;
    try { r = await searchAdr(q); } catch { r = null; }
    if (seq !== ADR.seq || document.activeElement !== input) return;
    adrShow(r);
  }, 200);
}
function adrShow(r) {
  const l = ADR.list, inp = ADR.input;
  ADR.items = r || []; ADR.i = -1;
  l.innerHTML = r === null ? `<p class="el-adrnone">Suche nicht erreichbar. Adresse von Hand eingeben.</p>` : !r.length ? `<p class="el-adrnone">Keine Adresse gefunden.</p>`
    : r.map((a, k) => `<button class="mi" role="option" id="el-adr-${k}" data-adr="${k}" tabindex="-1" aria-selected="false"><span class="mt"><span class="mh">${R.esc([a.str, a.nr].filter(Boolean).join(" "))}</span><span class="ms">${R.esc([a.plz, a.ort].filter(Boolean).join(" "))}</span></span></button>`).join("");
  const row = inp.closest(".el-row").getBoundingClientRect();
  Object.assign(l.style, { left: `${row.left}px`, top: `${row.bottom + 4}px`, width: `${row.width}px` });
  l.hidden = false; inp.setAttribute("aria-expanded", "true"); inp.removeAttribute("aria-activedescendant");
}
function adrMark(i) {
  ADR.i = i;
  ADR.list.querySelectorAll("[data-adr]").forEach((b, k) => b.setAttribute("aria-selected", String(k === ADR.i)));
  const o = ADR.i >= 0 ? $(`#el-adr-${ADR.i}`) : null;
  if (o) { ADR.input.setAttribute("aria-activedescendant", o.id); o.scrollIntoView({ block: "nearest" }); } else ADR.input.removeAttribute("aria-activedescendant");
}
function adrClose() {
  clearTimeout(ADR.timer);
  if (!ADR.list || ADR.list.hidden) return;
  ADR.list.hidden = true; ADR.items = []; ADR.i = -1;
  ADR.input?.setAttribute("aria-expanded", "false"); ADR.input?.removeAttribute("aria-activedescendant");
}
function adrPick(k) {
  const a = ADR.items[k];
  if (!a) return;
  adrClose(); ADR.seq++;
  ADR.input.value = a.str; ADR.input.blur(); // übernimmt die Strasse statt des Suchworts (change), bevor neu gezeichnet wird
  const adr = Object.fromEntries(Object.entries(a).filter(([, v]) => v));
  change(() => { elProj().adr = adr; }, { panel: false });
  elHub(true);
  $('#el-hub [data-elp="adr:str"]')?.focus();
  elGwr();
}
function elTimeAdd() {
  const d = $("#el-td").value, h = Number($("#el-th").value.trim().replace(",", ".")), n = $("#el-tn").value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { toast("Bitte ein Datum wählen.", "error"); return; }
  if (!(h > 0 && h <= 24)) { toast("Stunden zwischen 0 und 24 eingeben, z. B. 1,5.", "error"); $("#el-th").focus(); return; }
  change(() => { (elProj().time ||= []).push({ d, h: Math.round(h * 100) / 100, n }); }, { panel: false });
  elHub(true); $("#el-th")?.focus();
}
function elTimeDel(k) {
  change(() => { const t = S.doc.project.time; t.splice(k, 1); if (!t.length) delete S.doc.project.time; }, { panel: false });
  elHub(true); $("#el-th")?.focus();
}
// Automatische Zeit (CJ 18.10.2026): läuft in den Modulen mit, Aktivität = Maus, Taste, Klick, Scrollen, Touch. 5 min ohne Aktivität,
// Fenster im Hintergrund oder Übersicht offen = Pause. Ein vorläufiger Eintrag je Tag in doc.project.auto, ausserhalb von Rückgängig
// und ohne „ungespeichert“; mit der Datei und online gespeichert und laufend im Browser gesichert (localStorage je Projekt-Kennung).
// Zeit wird nur bis zur letzten Aktivität plus 5 min gezählt (from = zuletzt abgerechnet, until = Ende der aktiven Zeit).
const EL_IDLE = 300e3, EL_ZK = "elplexacad.zeit.", EL_Z = { doc: null, from: 0, until: 0, mod: "schema", dirty: false };
const elDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const elRid = (n) => Math.random().toString(36).slice(2, 2 + n).padEnd(n, "0");
function elZeitSettle(t = Date.now()) {
  if (S.shared) return; // geteilte Ansicht: keine Zeit
  const doc = EL_Z.doc, ms = Math.min(t, EL_Z.until) - EL_Z.from;
  EL_Z.from = t;
  if (!doc || ms <= 0) return;
  const p = (doc.project ||= {}), d = elDay(t);
  p.id ||= elRid(10);
  let e = (p.auto ||= []).find((x) => x.d === d && !x.x);
  if (!e) p.auto.push((e = { k: elRid(8), d, s: 0, m: [] }));
  e.s = Math.min(86400, e.s + ms / 1000);
  if (!e.m.includes(EL_Z.mod)) e.m.push(EL_Z.mod);
  EL_Z.dirty = true;
}
function elZeitBackup(doc = EL_Z.doc) {
  if (S.shared) return;
  const p = doc?.project;
  if (!p?.id || !p.auto) return;
  try { localStorage.setItem(EL_ZK + p.id, JSON.stringify({ f: S.fileName, auto: p.auto })); } catch { /* ohne Sicherung weiterzählen */ }
}
function elZeitPause() { elZeitDoc(); elZeitSettle(); EL_Z.until = 0; if (EL_Z.dirty) { elZeitBackup(); EL_Z.dirty = false; } }
// Anderes Projekt offen (Öffnen, Neu, Online): altes abrechnen und sichern, beim neuen die Sicherung aus dem Browser dazunehmen.
// file: aus einer Datei geöffnet; nur dann gilt eine Sicherung mit gleichem Dateinamen für eine Datei ohne Kennung (nie gespeichert).
function elZeitDoc({ file = false } = {}) {
  if (EL_Z.doc === S.doc || S.shared) return;
  if (EL_Z.doc) { elZeitSettle(); elZeitBackup(); }
  EL_Z.doc = S.doc; EL_Z.from = Date.now(); EL_Z.until = 0; EL_Z.dirty = false;
  let id = S.doc.project?.id, b = null;
  try {
    if (id) b = JSON.parse(localStorage.getItem(EL_ZK + id) || "null");
    else if (file) for (let i = 0; i < localStorage.length && !b; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(EL_ZK)) { const x = JSON.parse(localStorage.getItem(k)); if (x?.f === S.fileName) { b = x; id = k.slice(EL_ZK.length); } }
    }
  } catch { b = null; }
  const auto = cleanProject({ auto: b?.auto })?.auto;
  if (auto) { const p = (S.doc.project ||= {}); p.id ||= id; p.auto = E.mergeAuto(p.auto, auto); }
  const old = E.autoOpen(S.doc).filter((e) => e.d !== elDay(Date.now())).length;
  if (old) toast(`Vorläufige Zeit: ${old === 1 ? "ein Eintrag" : `${old} Einträge`} in der Übersicht übernehmen oder verwerfen (Taste 0).`);
}
function elZeitAct() {
  elZeitDoc();
  if (!EL_S.hub || !EL_S.hub.hidden || document.hidden || !document.hasFocus()) return;
  const t = Date.now();
  elZeitSettle(t); EL_Z.until = t + EL_IDLE; EL_Z.mod = E.baseOf(elMod());
}
function elZeitUndo(za, zid) { // Rückgängig: vorläufige Zeit nicht zurückdrehen, übernommen/verworfen aber schon
  if (!za) return;
  const p = (S.doc.project ||= {});
  p.id ||= zid; p.auto = E.mergeAuto(p.auto, za, true);
  EL_Z.doc = S.doc; elZeitBackup();
}
function elZeitInit() {
  for (const ev of ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"]) addEventListener(ev, elZeitAct, { capture: true, passive: true });
  addEventListener("visibilitychange", elZeitPause); addEventListener("blur", elZeitPause); addEventListener("pagehide", elZeitPause);
  setInterval(() => { elZeitDoc(); if (document.hidden || !document.hasFocus()) { elZeitPause(); return; } elZeitSettle(); if (EL_Z.dirty) { elZeitBackup(); EL_Z.dirty = false; } }, 15e3);
  elZeitDoc();
}
// Vorläufigen Eintrag übernehmen (mit den Stunden und der Notiz aus der Zeile) oder verwerfen. Ein Rückgängig-Schritt.
function elZeitResolve(k, ok) {
  const e = S.doc.project?.auto?.find((x) => x.k === k), row = $(`#el-hub [data-elz="${k}"]`);
  if (!e || !row) return;
  const h = Number(row.querySelector(".el-ah").value.trim().replace(",", ".")), n = row.querySelector(".el-an").value.trim();
  if (ok && !(h > 0 && h <= 24)) { toast("Stunden zwischen 0 und 24 eingeben, z. B. 1,5.", "error"); row.querySelector(".el-ah").focus(); return; }
  change(() => { const a = S.doc.project.auto.find((x) => x.k === k); a.x = ok ? "ok" : "weg"; if (ok) (elProj().time ||= []).push({ d: e.d, h: Math.round(h * 100) / 100, n }); }, { panel: false });
  EL_Z.doc = S.doc; elZeitBackup();
  elHub(true, { keepFocus: true });
  toast(ok ? `Übernommen: ${E.fmtH(Math.round(h * 100) / 100)} h am ${E.fmtD(e.d)}.` : `Vorläufiger Eintrag vom ${E.fmtD(e.d)} verworfen.`);
}
function elCsv() { download(`${baseName()}_Zeit.csv`, E.timeCsv(S.doc), "text/csv"); toast("Zeit als CSV in den Download-Ordner geladen."); }
// Neues Projekt aus der Übersicht: Name, Bauherr, erstes Modul. Ungespeicherte Änderungen: nachfragen wie bei „Neu“.
async function elNewProject() {
  const r = await formDialog("Neues Projekt", "Name und Bauherr lassen sich später in der Übersicht ändern. Weitere Module legst du mit „+ Modul“ an.", [
    { label: "Projektname", value: "" }, { label: "Bauherr", value: "" },
    { label: "Erstes Modul", value: "schema", options: E.MODULES.filter((m) => !m.later).map((m) => [m.id, m.label]) },
  ], "Anlegen");
  if (!r) return;
  if (S.dirty && !(await confirmDialog("Neu beginnen?", "Die Änderungen am aktuellen Dokument gehen verloren, wenn du sie nicht gespeichert hast.", "Neu beginnen"))) return;
  const name = r[0].trim() || "Unbenannt", bh = r[1].trim();
  elHub(false); freshDoc(r[2]);
  S.doc.project = { name, status: "In Arbeit" };
  if (bh) { const info = E.bauherrInfo(S.doc) || (S.doc.info = cleanInfo({})); info.BAUHERR = bh; }
  setFileName(name); elSync(); renderSheet(); renderRight();
  toast(`Projekt „${name}“ angelegt. Speichern mit ⌘S.`);
}
// Zuletzt geöffnet: mit Dateizugriff direkt öffnen (Browser fragt einmal nach Erlaubnis), sonst Dateiauswahl
async function elOpenRecent(k) {
  const e = EL_S.recent?.[k];
  if (!e) return;
  if (!e.handle) { openJson(); return; }
  if (S.dirty && !(await confirmDialog("Ungespeicherte Änderungen", "Beim Öffnen gehen die Änderungen am aktuellen Dokument verloren.", "Trotzdem öffnen"))) return;
  try {
    let p = await e.handle.queryPermission({ mode: "readwrite" });
    if (p !== "granted") p = await e.handle.requestPermission({ mode: "readwrite" });
    if (p !== "granted") { toast("Ohne Erlaubnis lässt sich die Datei nicht öffnen. Datei über Öffnen (⌘O) wählen."); return; }
    const f = await e.handle.getFile();
    await loadText(await f.text(), e.handle.name, e.handle);
  } catch (err) {
    toast(`„${e.file}“ liess sich nicht öffnen (${err.message || err}). Sie ist vielleicht verschoben; Eintrag entfernt.`, "error");
    await E.recentDrop(k); elHub(true);
  }
}
// Online-Projekte (Schritt 3, cloud.js). Datei bleibt Hauptweg; Fehler (ohne Internet, pausiert) nur als Meldung.
function elOnlineDraw() {
  const o = $("#el-online");
  if (o) o.innerHTML = E.onlineHTML({ user: cloudUser(), list: EL_S.onlist ?? null, link: S.doc.project?.online, busy: EL_S.onbusy, locked: elLocked() });
}
// Sperre ohne Anmeldung (CJ 17.10.): nur wenn die App aus dem Netz läuft; als lokale Datei (file:) bleibt alles frei.
// Ohne Anmeldung nur DXF. Keine echte Sicherung (Seite speichern umgeht sie), geschützt sind die Online-Daten über die Zugriffsregeln.
const elLocked = () => !!S.shared || window.location.protocol !== "file:" && !cloudUser();
async function elUnlock() {
  if (S.shared) { toast("Geteilte Ansicht: nur ansehen. Speichern, Drucken und Export gehen nicht."); return false; }
  if (!elLocked()) return true;
  toast("Ohne Anmeldung lässt sich nur als DXF speichern. Bitte anmelden.");
  return elLogin();
}
async function elLogin() {
  let ok = false;
  try { ok = await cloudLogin(); } catch (err) { toast(err.message || String(err), "error"); }
  if (ok) toast(`Angemeldet als ${cloudUser()}.`);
  if (!EL_S.hub.hidden) elOnlineDraw();
  return ok;
}
async function elOnline(fn) { // sperrt die Knöpfe während der Anfrage
  if (EL_S.onbusy) return;
  EL_S.onbusy = true; elOnlineDraw();
  try { await fn(); } catch (err) { toast(err.message || String(err), "error"); }
  finally { EL_S.onbusy = false; if (!EL_S.hub.hidden) elOnlineDraw(); }
}
const elOnlineList = () => elOnline(async () => { const l = await projList(); if (l) EL_S.onlist = l; });
const elLogout = () => elOnline(async () => { await cloudLogout(); EL_S.onlist = null; toast("Abgemeldet."); });
const elOnlineSave = () => elOnline(() => elOnlineSaveCore(false));
// clean: über den Speichern-Knopf; der Online-Stand gilt dann als gespeichert (sonst merkt sich erst die Datei mit ⌘S den Stand)
async function elOnlineSaveCore(clean) {
  {
    closeEditor(true);
    const doc = JSON.parse(docText()), opt = { name: elName(), status: E.statusOf(S.doc) };
    let r = await projSave(doc, S.doc.project?.online, opt);
    if (r?.conflict) { // online neuer als dieser Stand: nicht still überschreiben
      const c = await chooseDialog("Online ist neuer", `Das Online-Projekt wurde am ${new Date(r.conflict).toLocaleString("de-CH")} gespeichert, nach dem Stand dieser Datei. Überschreiben ersetzt den Online-Stand.`,
        [{ label: "Online überschreiben", v: "force" }, { label: "Als neues Online-Projekt speichern", v: "new" }]);
      const v = c?.option?.v;
      if (!v) return;
      r = await projSave(doc, v === "force" ? S.doc.project.online : null, { ...opt, force: true });
    }
    if (!r) return; // Anmeldung abgebrochen
    elProj().online = { id: r.id, at: r.at };
    if (clean) markClean(); else markDirty(); // die Datei merkt sich den Online-Stand beim nächsten Speichern
    const l = await projList().catch(() => null); if (l) EL_S.onlist = l;
    projSaved();
    toast(clean ? `Online gespeichert: „${opt.name}“.` : `Online gespeichert: „${opt.name}“. Mit ⌘S merkt sich auch die Datei diesen Stand.`);
  }
}
// Speichern-Knopf und ⌘S (CJ 18.10.2026): angemeldet und Projekt schon online → direkt online; angemeldet, noch nicht online → Wahl online oder Datei.
// Ohne Anmeldung und ⇧⌘S (Speichern unter) wie bisher als Datei. Fehler online: Meldung und Angebot, als Datei zu speichern.
async function elSave(forceAs) {
  if (forceAs || !cloudUser()) return saveJson(forceAs);
  if (EL_S.onbusy) return;
  closeEditor(true);
  if (!S.doc.project?.online) {
    const c = await chooseDialog("Speichern", "Online: auf jedem Rechner nach der Anmeldung öffnen, weitere Klicks speichern direkt online. Lokal: als Datei (.elplexa.json) auf diesem Rechner.",
      [{ label: "Online speichern", v: "on" }, { label: "Lokal speichern", v: "file" }]);
    const v = c?.option?.v;
    if (v === "file") return saveJson(false);
    if (v !== "on") return;
  }
  await elSaveOnline();
}
async function elSaveOnline() { // direkt online (Knopf Speichern bzw. sein Menü), Fehler → Angebot Datei
  if (EL_S.onbusy || !cloudUser()) return;
  closeEditor(true);
  EL_S.onbusy = true; if (!EL_S.hub.hidden) elOnlineDraw();
  let err = null;
  try { await elOnlineSaveCore(true); } catch (e) { err = e; }
  finally { EL_S.onbusy = false; if (!EL_S.hub.hidden) elOnlineDraw(); }
  if (err && (await confirmDialog("Online speichern hat nicht geklappt", `${err.message || err} Es ist nichts verloren. Jetzt als Datei auf diesem Rechner speichern?`, "Lokal speichern"))) await saveJson(false);
}
// Feedback melden (CJ 18.10.2026): nur angemeldet (Gäste: Hinweis und Anmeldung), Screenshot der Zeichenfläche, Zeile in Supabase `feedback`
async function elFeedback() {
  if (!cloudUser()) { toast("Feedback nur mit Login. Bitte anmelden."); if (!(await elLogin())) return; }
  closeEditor(true);
  const hub = !EL_S.hub.hidden;
  const shot = hub ? null : await snapSvg(svg);
  const modul = hub ? "Übersicht" : `${modName(S.doc, elMod())} · ${sheetLabel(S.model, S.active)}`;
  const ok = await feedbackDialog({ shot, noShot: hub ? "Ohne Screenshot: in der Projektübersicht gibt es keine Zeichenfläche." : "Ohne Screenshot: die Ansicht liess sich nicht als Bild erfassen.",
    send: (f) => feedbackSend({ ...f, app_version: `elplexaCAD ${APP_BUILD}`, modul: modul.slice(0, 100), projekt_id: S.doc.project?.online?.id || null }) });
  if (ok) toast("Danke, Feedback gesendet.");
}
// Online-Projekt löschen (nur die Online-Kopie, Dateien bleiben). Zeigt die offene Datei darauf, fällt die Verknüpfung weg.
function elOnlineDelete(id) {
  return elOnline(async () => {
    const e = EL_S.onlist?.find((x) => x.id === id);
    if (!(await confirmDialog("Online-Projekt löschen?", `„${e?.name || "Projekt"}“ wird online gelöscht, samt PDF, die kein anderes Online-Projekt braucht. Dateien auf dem Rechner bleiben.`, "Online löschen"))) return;
    if (!(await projDelete(id))) return;
    if (S.doc.project?.online?.id === id) delete S.doc.project.online;
    EL_S.onlist = EL_S.onlist.filter((x) => x.id !== id);
    toast(`Online gelöscht: „${e?.name || "Projekt"}“.`);
  });
}
function elOnlineOpen(id) {
  return elOnline(async () => {
    if (S.dirty && !(await confirmDialog("Ungespeicherte Änderungen", "Beim Öffnen gehen die Änderungen am aktuellen Dokument verloren.", "Trotzdem öffnen"))) return;
    const doc = await projOpen(id);
    if (!doc) return;
    EL_S.fromOnline = true;
    try { await loadText(JSON.stringify(doc), doc.project?.name || "Online-Projekt", null); } finally { EL_S.fromOnline = false; }
    elHub(true);
    toast(`Online-Projekt „${elName()}“ geöffnet. Speichern als Datei mit ⌘S.`);
  });
}
function elOpen(id, { create = true, exact = false } = {}) { // create: false = per Taste, legt kein fehlendes Modul an
  if (!exact && !id.includes(":")) { const ids = E.modIds(S.doc).filter((x) => E.baseOf(x) === id); if (ids.length) id = ids.includes(EL_S.lastOf[id]) ? EL_S.lastOf[id] : ids[0]; } // Art: zuletzt offenes Modul dieser Art
  const idx = E.modIdx(S.doc, id);
  if (!idx.length) { if (create && !E.modById(id)?.later) elNew(id); else { elHub(true); toast(`${E.modById(id).label} gibt es in diesem Projekt noch nicht. Anlegen mit „+ Modul“.`); } return; }
  const want = EL_S.last[id];
  elHub(false);
  switchSheet(idx.includes(want) ? want : idx[0]);
}
// Neues Modul (auch ein weiteres derselben Art, CJ 18.10.2026): nächste freie Nummer, erstes Blatt
function elNew(id) {
  const add = { schema: addSheet, dispo: addDispo, pv: addPv }[id];
  if (!add) { toast(`${E.modById(id).label} kommt später.`); return; }
  const vs = S.doc.sheets.filter((sh) => modBase(sh) === id && !T.isDeck(sh)).map(varOf);
  elHub(false); add(vs.length ? Math.max(...vs) + 1 : 1);
}
// Kachelmenü der Übersicht (CJ 18.10.2026): Rechtsklick oder gedrückt halten auf eine Modul-Kachel
function elModCtx(el) {
  EL_S.ctxMod = el.dataset.modctx;
  EL_S.modCtx.show(el);
}
async function elModAct(a) {
  const id = EL_S.ctxMod;
  if (!id) return;
  if (a === "open") { elOpen(id, { exact: true }); return; }
  if (a === "ren") await renameModule(id);
  else if (a === "dup") { const nid = duplicateModule(id); if (nid) toast(`Kopie angelegt: „${modName(S.doc, nid)}“. Umbenennen: Rechtsklick auf die Kachel.`); }
  else if (a === "del") await deleteModule(id);
  elHub(true);
}
function elBare() {
  const on = document.body.classList.toggle("el-bare");
  $("#el-bare").setAttribute("aria-pressed", String(on));
  requestAnimationFrame(() => applyView());
}
function elHelp() { openModal("Tasten in elplexaCAD", E.keysHTML() + `<div class="actions"><button class="btn primary" data-c>Schliessen</button></div>`, (b, done) => done(null), null, "[data-c]"); }
// Tasten ohne ⌘: 1 bis 3 Module, 0 Übersicht, § Leisten, ? Hilfe. true = Taste gehört elplexaCAD
function elKey(e) {
  const mods = E.MODULES.filter((m) => !m.later);
  if (/^[1-9]$/.test(e.key)) { const n = Number(e.key); if (n <= mods.length) elOpen(mods[n - 1].id, { create: false }); else if (E.MODULES[n - 1]) toast(`${E.MODULES[n - 1].label} kommt später.`); else return false; return true; }
  if (e.key === "0") { elHub(EL_S.hub.hidden); return true; }
  if (e.key === "§" || e.key === "`" || e.code === "Backquote") { if (EL_S.hub.hidden) elBare(); return true; }
  if (e.key === "?") { elHelp(); return true; }
  return false;
}
// Übersicht offen: nur ihre Tasten, ⌘S und ⌘O bleiben; nichts wirkt unsichtbar auf das Blatt dahinter
function elHubKey(e) {
  if (!EL_S.hub || EL_S.hub.hidden) return false;
  const t = e.target, typing = t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA");
  if (typing) return false;
  if (e.metaKey || e.ctrlKey) { const k = e.key.toLowerCase(); return !(k === "s" || k === "o"); }
  if (e.key === "Escape") { elHub(false); return true; }
  if (!e.altKey && elKey(e)) e.preventDefault();
  return !["Tab", "Enter", " "].includes(e.key); // Tab und Enter bedienen die Kacheln
}
// Teilen per Link (Meilenstein 2, Schritt 1, 18.10.2026). Ersteller: Fenster „Link teilen“ je Online-Projekt (cloud.js share*).
// Empfänger: ?teilen=<Schlüssel> öffnet die geteilte Ansicht (S.shared): ohne Login, alles gesperrt (change, markDirty, Tasten, Zeichenfläche
// nur verschieben und zoomen, Speichern/Drucken/Export über elUnlock), keine Absturz-Sicherung, keine Zeit, nicht unter „zuletzt geöffnet“.
const elShareStart = () => (S.shared = new URLSearchParams(window.location.search).get("teilen") || null);
async function elShareLoad() {
  document.body.classList.add("el-shared", "el-sharewait"); // wait: bis geladen ohne Dateiname und Status im Kopf
  const badge = document.createElement("span"); badge.className = "el-sharebadge"; badge.setAttribute("role", "status"); badge.textContent = "Geteilte Ansicht · nur ansehen";
  $("#el-crumb").after(badge);
  for (const el of document.querySelectorAll("#left, #right")) el.inert = true;
  try {
    const r = await shareOpen(S.shared);
    if (r.grund) EL_S.shareFail = { grund: r.grund };
    else {
      EL_S.fromOnline = true;
      try { await loadText(JSON.stringify(r.doc), r.name || "Geteiltes Projekt", null); } finally { EL_S.fromOnline = false; }
      EL_S.shareInfo = { at: r.at, ablauf: r.ablauf, mods: r.modules ? E.modIds(S.doc).map((id) => modName(S.doc, id)) : null };
      setTool("hand"); document.body.classList.remove("el-sharewait");
    }
  } catch (err) { EL_S.shareFail = { msg: err.message || String(err) }; }
  elHub(true);
}
function elShareKey(e) { // true = Taste gesperrt oder erledigt; erlaubt sind Ansehen und Blättern
  if (e.metaKey || e.ctrlKey || e.altKey) { e.preventDefault(); return true; }
  if (/^[0-9?§`]$/.test(e.key)) { e.preventDefault(); if (EL_S.shareInfo) elKey(e); return true; }
  if (["PageUp", "PageDown", "f", "F", "+", "-", "=", "g", "G", " ", "Escape", "Tab", "Enter"].includes(e.key)) return false;
  e.preventDefault(); return true;
}
// Fenster „Link teilen“ (Ersteller): gültige Links zeigen, kopieren, widerrufen, neuen Link (30 Tage, Vorgabe der Datenbank) erstellen.
// Ist es das offene Projekt, wählen Häkchen die Module (CJ 18.10.2026); only = Vorwahl ein Modul (Exportieren › Modul teilen). Alle Häkchen = ganzes Projekt.
async function elShareDialog(id, only = null) {
  const name = EL_S.onlist?.find((x) => x.id === id)?.name || elName(), mine = S.doc.project?.online?.id === id;
  const ids = mine ? E.modIds(S.doc) : [], pick = mine ? { ids, on: new Set(only ? [only] : ids) } : null, nm = (m) => modName(mine ? S.doc : {}, m);
  let links = null;
  const draw = () => { const m = $("#modal-root .modal"); if (m) m.querySelector(".el-shbody").innerHTML = E.shareDialogHTML(name, links, shareUrl, pick, nm); };
  const load = async (fn) => { try { const l = await fn(); if (l) links = l; } catch (err) { toast(err.message || String(err), "error"); } draw(); };
  const copy = async (token) => {
    const url = shareUrl(token);
    try { await navigator.clipboard.writeText(url); toast("Link kopiert. Gültig 30 Tage, nur zum Ansehen."); }
    catch { const i = [...document.querySelectorAll("#modal-root .el-shurl")].find((x) => x.value === url); i?.select(); toast("Kopieren ging nicht automatisch: Link ist markiert, mit ⌘C kopieren."); }
  };
  const tick = (e) => { const b = e.target.closest("[data-shmod]"); if (!b || !pick) return; if (b.checked) pick.on.add(b.dataset.shmod); else pick.on.delete(b.dataset.shmod); draw(); };
  const shown = openModal("Link teilen", `<div class="el-shbody">${E.shareDialogHTML(name, null, shareUrl, pick, nm)}</div>`, async (b, done) => {
    if (b.dataset.c !== undefined) done(null);
    else if (b.dataset.shnew !== undefined) {
      b.disabled = true; let n = null;
      const mods = pick && pick.on.size < ids.length ? ids.filter((m) => pick.on.has(m)) : null;
      await load(async () => { n = await shareCreate(id, mods); return n ? [n, ...links] : null; }); if (n) copy(n.token);
    }
    else if (b.dataset.shcopy) copy(b.dataset.shcopy);
    else if (b.dataset.shrev) { b.disabled = true; const n0 = links.length; await load(async () => ((await shareRevoke(b.dataset.shrev))?.length ? links.filter((l) => l.id !== b.dataset.shrev) : null)); if (links.length < n0) toast("Link widerrufen. Wer ihn öffnet, sieht nur noch einen Hinweis."); }
  }, null, "[data-c]", "el-sharemodal");
  const root = $("#modal-root"); root.addEventListener("change", tick);
  await load(() => shareList(id));
  try { return await shown; } finally { root.removeEventListener("change", tick); }
}
// Exportieren › Modul teilen (CJ 18.10.2026): Link nur für das offene Modul. Geteilt wird der Online-Stand, darum vorher online speichern.
async function elShareModule() {
  if (S.shared) return;
  if (!cloudUser() && !(await elLogin())) return;
  if (!S.doc.project?.online || S.dirty) {
    if (!(await confirmDialog("Zuerst online speichern", "Geteilt wird der online gespeicherte Stand. Jetzt online speichern und dann den Link erstellen?", "Online speichern"))) return;
    await elSaveOnline();
    if (!S.doc.project?.online || S.dirty) return;
  }
  return elShareDialog(S.doc.project.online.id, elMod());
}

// ---------- Start ----------
function init() {
  for (const el of document.querySelectorAll(".ic[data-ic]")) el.innerHTML = R.icons[el.dataset.ic];
  $("#btn-undo").innerHTML = R.icons.undo; $("#btn-redo").innerHTML = R.icons.redo;
  $("#btn-left").innerHTML = R.icons.panelL; $("#btn-right").innerHTML = R.icons.panelR;
  $("#zoom-in").innerHTML = R.icons.plus; $("#zoom-out").innerHTML = R.icons.minus;
  LIBS.load(); renderLeft();
  try {
    const raw = ELPLEXA && elShareStart() ? null : localStorage.getItem(AUTOSAVE_KEY); // geteilte Ansicht: eigene Sicherung nicht laden
    if (raw) { const o = JSON.parse(raw); const m = parseModel(o.text); if (m.sheets.some((sh) => sh.items.length)) { S.doc = m; S.active = m.active; setFileName(o.name || "Unbenannt"); markDirty(); toast("Letzte Sitzung wiederhergestellt. Mit „Neu“ beginnst du ein leeres Blatt."); } }
  } catch { /* kein Zwischenstand */ }
  if (!S.dirty) S.model.items.push(...baseItems(nextId));
  const note = adoptDeck();
  if (note && S.dirty) toast(note);
  syncKind(); renderLeft(); renderRight(); renderSheetBar(); updateUndoButtons(); updateHint();
  fitView(); renderItems(); renderOverlay();
  if (ELPLEXA) elInit(); // startet immer in der Projektübersicht (CJ 18.10.2026), ohne Startauswahl
  if (!S.dirty) { markClean(); if (!ELPLEXA) startAtLaunch(); }
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
