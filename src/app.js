// SchemaCAD: Editor. Zustand, Bedienung, Dateien.
import { newDoc, newSheet, parseModel, serializeModel, WIRE_KINDS, LEGEND_KEYS, setProjectMeta, cleanInfo, cleanProject, modBase, modOf, modKey, modName, modVar, MOD_STATUS } from "./model.js";
import { SYMBOL_BY_NAME, FAMILIES, isDevice, anchorX, variantByKey, hasTrenner, bmkLetter } from "./symbols.js";
import { splitWandlerDoc, routeWm, wmParts } from "./wandler.js";
import { insertFeed } from "./eingang.js";
import * as LIBS from "./library.js";
import { usedCustom } from "./library.js";
import { importDxfSymbol } from "./dxfimport.js";
import { X0 as RAIL_X0, X1 as RAIL_X1 } from "./template.js";
import { renumberAll, deviceTerminals, linkedTerminals, columnHasTerminals, isRef, openCounterparts, linkRefs, unlinkRef, findItem, refLabel } from "./numbering.js";
import { BUNDLE_PRESETS, BUNDLE_LABELS, conductorKind, offsetPaths, snapToRails, snapToVerticals } from "./bundle.js";
import { parseCable, newTerminals, termCount, cleanLab } from "./terminals.js";
import { newCtrl, ctrlTerms } from "./steuerung.js";
import { baseItems, hasBase, BASE_TAG } from "./template.js";
import { W, H, META_FIELDS, COL_CENTERS, ROW_CENTERS, colOf } from "./frame.js";
import { exportDxf } from "./dxf.js";
import { isGroupWire, mainSheets, mainState } from "./hauptlinien.js";
import { makeTouch } from "./mobil.js";
import { autoWireItems, TEMPLATES, TEMPLATE_PREFIX, templateOf, abgangItems, CUSTOM, makeCustom, addCustom, removeCustom } from "./vorlagen.js";
import * as R from "./render.js";
import * as D from "./dispo.js";
import { makeFiles } from "./files.js";
import { openSearch } from "./suchen.js";
import { listsCsv } from "./auswertung.js";
import { makePv } from "./pvedit.js";
import { makePlan } from "./planedit.js";
import { newPlanSheet } from "./plan.js";
import { makeDispo } from "./dispoedit.js";
import * as OF from "./offedit.js";
import { readXlsx, parseOfferte, buildOfferte } from "./offimport.js";
import { totals as O_totals, fmtChf as OF_fmt, bkpOf as O_bkpOf, knFind as O_knFind, knSub as O_knSub } from "./offerte.js";
import { toast, openModal, confirmDialog, formDialog, chooseDialog, makeMenu } from "./dialogs.js";
import { fieldHTML, actions, head, dupDel, textPanelHTML, turnHTML } from "./panel.js";
import { startDialog } from "./start.js";
import { PV_GRID, PV_TEXT_H, DRAW_LAYERS, pruneStrings, pointLabel, varOf, newVar } from "./pv.js";
import * as T from "./titel.js";
import * as L from "./legende.js";
import { userStore, posStore, cloudMenu, cloudUser, cloudSignIn, cloudOnSession, cloudLogin, cloudLogout, projList, projSave, projSaved, projOpen, projDelete, projTimeAdd, feedbackSend, shareUrl, shareList, shareCreate, shareRevoke, shareOpen, shareNotes, shareNoteAdd, shareNoteDelete } from "./cloud.js";
import * as N from "./notizen.js";
import { snapSvg, feedbackDialog } from "./feedback.js";
import * as E from "./elplexa.js";
import { openHand } from "./hand.js";
import { makePdf } from "./pdfout.js";
import { SHAPE_TOOLS, SHAPE_KINDS, shapeTool, shapeFrom, shapeEmpty, shapeHandles, dragShapeHandle, shapeSVG, COLORS } from "./formen.js";
import { fetchGwr, searchAdr, adrText } from "./gwr.js";
import * as PZ from "./prinzip.js";
import { setRemote } from "./ablage.js";
import * as PD from "./positionen.js";
import { loadProfil, syncProfil, profilDialog } from "./profil.js";
import { offerDefaults, syncSollwerte, sollwerteDialog } from "./sollwerte.js";
import { PRINZIP_GROUPS, PRINZIP_FAMILIES, PZ_ABGANG, PZ_POL, polNext, sichName, kabelN } from "./prinzipsym.js";


const $ = (s) => document.querySelector(s);
const stage = $("#stage"), svg = $("#svg"), world = $("#world");
const gSheet = $("#sheet"), gItems = $("#items"), gOverlay = $("#overlay");
// Linke Leiste: Inhalt in #left-body (wird neu gezeichnet), darunter die Symbolsuche (CJ 18.10.2026), bleibt stehen und behält den Fokus
const leftEl = (() => { const b = document.createElement("div"); b.id = "left-body"; $("#left").append(b); return b; })(), rightEl = $("#right"), editor = $("#texteditor");
const ofView = $("#of-view"); // Offerte (offedit.js)
const AUTOSAVE_KEY = "schemacad.autosave.v1";
const PX_PER_MM = 96 / 25.4;
const TERMINALS = "TERMINALS"; // Platzhalter für „Klemmenleiste setzen“
const CTRL = "CTRL"; // Platzhalter für „Steuerung (Kasten) setzen“ (steuerung.js)
const familyOf = (name) => [...FAMILIES, ...PRINZIP_FAMILIES].find((f) => f.variants.includes(name)); // mit Prinzipschema (Anzahl Striche)
const isSich = (name) => SYMBOL_BY_NAME[name]?.family === "PZ_SICH"; // Prinzipschema-Sicherung, Polzahl über Varianten
const sameSymbols = (sel) => (sel.length > 1 && sel.every((i) => i.type === "symbol" && i.sym === sel[0].sym) ? sel[0].sym : null); // Mehrfachauswahl gleicher Symbole
// Polzahl beim Setzen: zuletzt mit den Tasten gewählte je Symbol, sonst die Vorgabe des Symbols (LS LN, Motorschutz und Verteilung 3L)
const pzPolOf = (name) => S.pzPol?.[name] ?? SYMBOL_BY_NAME[name].attrs.find((a) => a.tag === "POL").def;

const TOOLS = [
  { id: "select", label: "Auswählen", key: "V", icon: "select" },
  { id: "wire", label: "Leitung", key: "L", icon: "wire" },
  { id: "text", label: "Text", key: "T", icon: "text" },
  { id: "hand", label: "Ansicht schieben", key: "H", icon: "hand" },
];
const HOLD_TOOLS = { wire: "Leitung (L). Rechtsklick oder gedrückt halten: Leiterzahl und Art", text: "Text (T). Rechtsklick oder gedrückt halten: Drehung und Ausrichtung" };

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
  shapeDraft: null, shapeStyle: {}, textC: null, textR: 0, textAl: "", // freies Zeichnen (formen.js): Form im Entstehen, Darstellung neuer Formen, Farbe neuer Texte
  drag: null, space: false,
  undo: [], redo: [], pending: null, pendingPushed: false,
  fileHandle: null, fileName: "Unbenannt", dirty: false,
  editing: null, clip: null, legSel: null, // legSel: in der Legende gewähltes Gerät (ID)
  gridSize: { schema: 2.5, dispo: 5, pv: 100, pvtab: 100, prinzip: 2.5, offerte: 2.5, title: 2.5, toc: 2.5, legend: 2.5 }, // Rasterweite je Blatttyp (Stringplan: Annahme 100 mm)
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
const isPrinzip = () => S.model.kind === "prinzip"; // Prinzipschema (prinzip.js): Schema-Editor auf eigenem Papier, ohne Spalten, BMK und Hauptlinien
const kindKey = () => S.model.kind || "schema";
const textH = () => (isPv() ? PV_TEXT_H : isDispo() ? S.dp.textH : S.textH);
const selectedItems = () => S.model.items.filter((it) => S.sel.has(it.id));
const nextId = () => S.doc.nextId++;
const snapshot = () => JSON.stringify({ sheets: S.doc.sheets, nextId: S.doc.nextId, pv: S.doc.pv, noTitle: S.doc.noTitle, noToc: S.doc.noToc, info: S.doc.info, mods: S.doc.mods, ...(ELPLEXA ? { project: S.doc.project } : {}) }); // pv: Modultypen (Stringplan), project: elplexaCAD
const docText = (noAssets = false) => serializeModel({ ...S.doc, active: S.active, ...(usedCustom(S.doc).length ? { symbols: usedCustom(S.doc) } : {}) }, { noAssets });
const PV = makePv({ S, $, TOOLS, toast, change, openModal, chooseDialog, formDialog, confirmDialog, setTool, renderSheet, renderItems, renderOverlay, updateHint, applyView, fitView, nextId, markDirty, renderLeft, renderRight, download: (...a) => download(...a), openEditor: (...a) => openEditor(...a) });
const { placeDown, placeGhost, draftFinish, draftEsc, draftCancel, dimDown, dimCancel, dimOverlay, autoDimPick, hideDimSel, dispoAct, ansichtHTML, setDimNum, applyDp: dispoApplyDp, setTfAll, cabAct: dispoCabAct, cornerKey: dispoCornerKey, plateCorner, newDispoItem, plateAt, guideSnap, edgesX, edgesY, dispoSnap, addDispoItem, dispoExtras, setPlateW, handleItem, handleAt, HANDLE_CURSOR, dragHandle, applyMass, massAt, alignSelected, addAutoRails, handOver, leftHTML: dispoLeftHTML, dispoPanel } =
  makeDispo({ S, TOOLS, round3, isDispo, selectedItems, nextId, snapBase, change, moveItem, setTool, afterSheetChange, sheetLabel, nextSheetNo, makeSheet, blattHTML });

const isOff = () => S.model.kind === "offerte"; // Offerte (offedit.js, CJ 26.10.2026): Tabelle in #of-view statt Zeichenfläche
const isPlan = () => S.model.kind === "plan"; // Plan (planedit.js, nur elplexaCAD, CJ 23.10.2026): immer als ELPLEXA && isPlan(), fällt im v3-Bau weg
// Plan (nur elplexaCAD): eigene Bedienung, app.js leitet Zeiger, Tasten und Leisten weiter
const PL = ELPLEXA ? makePlan({ S, toast, change, setTool, renderItems, renderOverlay, renderRight, renderLeft, renderSheet, updateHint, fitView, applyView, pushUndo, snapshot, markDirty, nextId, formDialog, confirmDialog, chooseDialog, openModal, sheetLabel, workCount: () => workCount(), download: (...a) => download(...a),
  leftEl, rightEl, popEl: $("#pv-pop"), hidePop: () => pvPop?.hide(false), viewBox: () => { const r = stage.getBoundingClientRect(), a = toWorld(0, r.height), b = toWorld(r.width, 0); return { x0: a.x, y0: a.y, x1: b.x, y1: b.y }; } }) : null;
function toWorld(sx, sy) { return { x: (sx - S.view.x) / S.view.z, y: H - (sy - S.view.y) / S.view.z }; }
function toScreen(x, y) { return { x: S.view.x + x * S.view.z, y: S.view.y + (H - y) * S.view.z }; }
function pointerPos(e) { const r = svg.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; }

// Fang an Feldmitten: stärker als das Raster, aber nur nahe an der Mitte, so bleibt feines Zeichnen möglich.
// offX verschiebt die Zielmitte, damit bei mehrpoligen Symbolen die Symbolmitte auf der Feldmitte liegt.
function magnet(c, offX = 0) {
  if (!S.mag || S.alt || isDispo() || isPrinzip()) return c;
  const r = Math.min(2.4, Math.max(0.8, 4 / S.view.z));
  const near = (list, v) => list.reduce((b, t) => (Math.abs(t - v) < Math.abs(b - v) ? t : b), list[0]);
  const gx = near(COL_CENTERS.map((v) => v - offX), c.x), gy = near(ROW_CENTERS, c.y);
  const out = { ...c };
  if (Math.abs(gx - c.x) <= r) { out.x = round3(gx); out.magX = round3(gx + offX); }
  if (Math.abs(gy - c.y) <= r) { out.y = round3(gy); out.magY = round3(gy); }
  return out;
}
const placeOffX = () => (S.placeSym === TERMINALS || S.placeSym === CTRL || templateOf(S.placeSym) ? 0 : anchorX(SYMBOL_BY_NAME[S.placeSym]?.poles ?? 1));

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

// Alt beim Ziehen (CJ 16.10.2026): schaltet den Fang um, solange Alt gedrückt ist. Raster an → frei (ohne Pins und Leitungen), Raster aus → Raster.
const altGrid = (e) => S.grid.on !== !!e.altKey;
function dragSnap(e, wx, wy, pins, skip = null) {
  if (!e.altKey) return snapBase(wx, wy, pins, skip);
  const g = altGrid(e) ? S.grid.size : 0;
  return g ? { x: round3(Math.round(wx / g) * g), y: round3(Math.round(wy / g) * g) } : { x: round3(wx), y: round3(wy) };
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
let elCurT = null; // elplexaCAD: Zeitstempel des Eintrags „zuletzt geöffnet“, der zum offenen Projekt gehört (null = keiner)
function markDirty() {
  if (ELPLEXA && S.shared) return; // geteilte Ansicht: nie „ungespeichert“, keine Absturz-Sicherung
  S.dirty = true;
  $("#dirty").hidden = false; if (ELPLEXA) elSaveState();
  clearTimeout(autosaveTimer);
  // Ist der Zwischenspeicher für eine PDF zu klein, ohne PDF speichern (der Plan muss dann neu geladen werden)
  const put = (t) => localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ name: S.fileName, text: t }));
  autosaveTimer = setTimeout(() => { try { put(docText()); } catch { try { put(docText(true)); } catch { /* ohne Speicher weiterarbeiten */ } } }, 400);
}
function markClean() { S.dirty = false; $("#dirty").hidden = true; if (ELPLEXA) elSaveState(); clearTimeout(autosaveTimer); if (ELPLEXA && S.shared) return; try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* egal */ } } // geteilte Ansicht: Sicherung eigener Projekte bleibt
function setFileName(n) { S.fileName = n; $("#file-name").textContent = n; if (ELPLEXA) elSaveState(); document.title = n + (ELPLEXA ? " – elplexaCAD" : " – SchemaCAD"); }

// ---------- Ansicht ----------
function applyView() {
  const { x, y, z } = S.view;
  world.setAttribute("transform", `matrix(${z} 0 0 ${-z} ${x} ${y + H * z})`);
  $("#zoom-val").textContent = Math.round((z / PX_PER_MM) * 100) + "%";
  if (ELPLEXA && S.shared) elNotesDraw(); // Notizen im Teilen-Link: gleich grosse Stecknadeln bei jedem Zoom, auch nach Blattwechsel
}
// Sichtbarer Bereich: beim Schema das Blatt, bei der Disposition der Inhalt mit Rand
function viewBounds() {
  if (ELPLEXA && isPlan()) return PL.bounds();
  if (isPv()) return PV.bounds();
  if (S.model.kind === "legend") return L.bounds(S.doc);
  if (isDeck()) return T.deckBounds(S.doc, S.model);
  if (isPrinzip()) return PZ.bounds(S.model);
  if (!isDispo()) return { x0: 0, y0: 0, x1: W, y1: H };
  const b = D.contentBBox(S.model.items, D.planOpts(S.model));
  if (!b) return { x0: -50, y0: -50, x1: 750, y1: 550 };
  const pad = Math.max(40, Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.06);
  return { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad };
}
function fitView() {
  const r = stage.getBoundingClientRect(), b = viewBounds(), bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const z = Math.max(isPv() || ELPLEXA && isPlan() ? 0.002 : isDispo() ? 0.02 : 0.5, Math.min((r.width - 60) / bw, (r.height - 60) / bh));
  S.view = { z, x: (r.width - bw * z) / 2 - b.x0 * z, y: (r.height - bh * z) / 2 - (H - b.y1) * z };
  applyView(); renderSheet();
}
function zoomAt(sx, sy, factor) {
  const w = toWorld(sx, sy);
  const z = Math.max(isPv() || ELPLEXA && isPlan() ? 0.002 : isDispo() ? 0.02 : 0.6, Math.min(60, S.view.z * factor));
  S.view = { z, x: sx - w.x * z, y: sy - (H - w.y) * z };
  applyView(); renderSheet(); renderOverlay();
}

// ---------- Zeichnen ----------
function renderSheet() {
  const pat = $("#gridpat");
  pat.setAttribute("width", S.grid.size); pat.setAttribute("height", S.grid.size);
  pat.querySelector("circle").setAttribute("r", isDispo() || isPv() || ELPLEXA && isPlan() ? Math.max(0.17, 0.9 / S.view.z) : 0.17);
  gSheet.innerHTML = ELPLEXA && isPlan() ? PL.sheetSVG() : S.model.kind === "legend" ? L.screenSVG(S.doc, S.model, S.legSel) : isDeck() ? (S.model.kind === "title" ? T.titleSVG(S.model, adrText(S.doc.project?.adr)) : T.tocScreenSVG(S.doc, S.model)) : isPv() ? PV.sheetSVG() : isDispo() ? D.sheetSVG(S.grid, S.view.z) : isPrinzip() ? PZ.sheetSVG(S.model, S.grid, S.view.z) : R.sheetSVG(S.model.meta, S.grid, S.view.z);
}
// Offerte: nach dem Neuzeichnen auch die linke Spalte (Gliederung, Kapitel des Knotens) und die Leiste (Kapitel der Offerte)
function renderItems() { $("#dims-on").checked = S.model.dims !== false; if (isOff()) { gItems.innerHTML = ""; ofView.innerHTML = OF.viewHTML(S.model.of); ofLeft(); renderSheetBar(); return; } gItems.innerHTML = isDeck() ? "" : ELPLEXA && isPlan() ? PL.itemsSVG() : isPv() ? PV.itemsSVG() : R.itemsSVG(S.model.items, S.model.kind, isDispo() ? D.planOpts(S.model) : {}); }
const pickable = () => (ELPLEXA && isPlan() ? PL.pickable() : isPv() ? PV.pickable() : S.model.items); // Stringplan: ohne ausgeblendete und gesperrte Ebenen

function railMap() {
  const rails = {};
  for (const t of S.model.items) if (t.type === "text" && t.tag === "grund") rails[t.s] = t.y + 1;
  return rails;
}
const bundlePaths = (pts, n) => snapToVerticals(snapToRails(offsetPaths(pts, n), BUNDLE_PRESETS[n], railMap()), S.model.items);
const bundleCount = () => (isPrinzip() ? 1 : (S.wireDraft && S.wireDraft.n) || S.bundleN); // Prinzipschema: einpolig, nie Bündel
const poleSnap = () => !isPrinzip() && (!S.wireDraft || bundleCount() > 1); // Pole als Gruppe fangen: beim Start oder wenn ein Bündel im Bau ist (Prinzipschema: nie)
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
  if (ELPLEXA && isPlan()) { gOverlay.innerHTML = PL.overlaySVG(); return; } // Plan: Auswahl, Griffe, Entwürfe (planedit.js)
  let s = "";
  s += R.selectionSVG(selectedItems());
  // Griffe an den Punkten gewählter Leitungen (ziehen = Punkt verschieben)
  if (S.tool === "select") for (const w of selectedItems()) if (w.type === "wire") for (const p of w.pts) s += `<rect class="wire-handle" x="${p[0] - 0.9}" y="${p[1] - 0.9}" width="1.8" height="1.8"/>`;
  if (S.tool === "select") for (const it of selectedItems()) if (it.type === "shape") for (const p of shapeHandles(it)) s += `<rect class="wire-handle" x="${p.x - 0.9}" y="${p.y - 0.9}" width="1.8" height="1.8"/>`; // Griffe der Formen
  if (S.shapeDraft && S.mouse) s += `<g opacity="0.8" pointer-events="none">${shapeSVG(shapeFrom(shapeTool(S.tool).k, S.shapeDraft.a, S.mouse, S.shift, { ...S.shapeStyle, diag: shapeTool(S.tool).diag }))}</g>`;
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
    else if (S.placeSym === CTRL) s += R.ghostSVG(newCtrl(S.mouse.x, S.mouse.y));
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
  if (isOff()) return "Offerte: links ein BKP-Kapitel wählen, Positionen in der Tabelle erfassen. Tab springt ins nächste Feld, Enter übernimmt. Kopf und Rechenwerte rechts.";
  if (S.model.kind === "legend") return "Sicherungslegende: entsteht aus den Schutzgeräten aller Schemablätter. Klick auf eine Zeile wählt das Gerät.";
  if (isDeck()) return S.model.kind === "title" ? "Titelseite: Angaben rechts eintragen. Objekt, Auftrag, Schema, Gezeichnet und Datum gelten für alle Blätter." : "Inhaltsverzeichnis: wird automatisch erstellt. Klick auf eine Zeile springt zum Blatt.";
  if (isPv()) return PV.hint();
  if (ELPLEXA && isPlan()) return PL.hint();
  if (isPrinzip() && S.tool === "select") return "Prinzipschema: Symbole links setzen, Leitung (L) zwischen den Anschlüssen ziehen, Texte (T) und Bereichslinien (I) frei. Klick wählt, Ziehen verschiebt.";
  if (isDispo()) {
    if (S.tool === "place" && /^D:BAR:/.test(S.placeSym)) return S.dpDraft ? "Schiene: zweiter Klick setzt das Ende, waagrecht oder senkrecht nach dem grösseren Abstand. Esc bricht ab." : "Schiene N/PE/PEN: erster Klick setzt den Anfang auf der Mittellinie. Esc beendet.";
    if (S.tool === "place" && S.placeSym === "D:CABLE") return "Zuleitung: Klicks setzen Punkte. Enter, Esc oder ein Klick auf den letzten Punkt beendet. Text rechts ändern.";
    if (S.tool === "place" && S.placeSym === "D:TPL:AUEU") return "Systemauftrennung AÜU: Klick setzt den PEN-Anschluss unten. Ein Rückgängig-Schritt, danach jedes Teil einzeln verschiebbar. Esc beendet.";
    if (S.tool === "place" && S.placeSym === "D:RAILF") return "Freie Schiene: Klicken setzt den Anfang auf der Mittellinie, ohne Plattenrand. Länge rechts oder mit den Griffen. Esc beendet.";
    if (S.tool === "place") return S.placeSym.startsWith("D:DEV:") ? "Gerät: Klicken setzt es. Auf einer Schiene rastet es in ½-TE-Schritten ein, rot umrandet heisst überlappt oder ragt über die Schiene. Esc beendet." : S.placeSym === "D:RAIL" ? "Schiene: Klicken setzt den Anfang auf Höhe der Mittellinie. Innerhalb einer Platte nimmt sie deren Breite mit 20 mm Rand links und rechts. Esc beendet." : `Platte: Klicken setzt die Ecke ${plateCorner()}. Tab wechselt die Ecke, Shift+Tab zurück. Masse danach rechts einstellen. Esc beendet.`;
    if (S.tool === "text") return "Klicken setzt einen Text, die Eingabetaste bestätigt.";
    if (S.tool === "hand") return "Ziehen verschiebt die Ansicht.";
    if (S.tool === "dim") return S.dimDraft?.p2 ? "Bemassung: Klick setzt die Masslinie. Zwischen den Punkten = waagrecht bzw. senkrecht. Esc bricht ab." : S.dimDraft ? "Bemassung: zweiten Punkt klicken (Ecken, Kantenmitten, Kanten rasten ein, Alt = frei). Esc bricht ab." : "Bemassung: ersten Punkt klicken. Masse auswählen und mit Entf löschen, automatische Masse mit Entf ausblenden.";
    return "Klick wählt (Platte am Rand), Shift oder ⌘ mehrere (nochmals klicken wählt ab), Ziehen auf leerer Fläche wählt mit Rahmen. Griffe ändern die Grösse, Doppelklick auf ein Mass tippt es ein, Alt ohne Hilfslinien.";
  }
  if (S.tool === "place" && templateOf(S.placeSym)) return `Abgang ${templateOf(S.placeSym).label}: Klicken in eine freie Spalte setzt Geräte, Leitungen zu den Hauptlinien und Klemmen mit Kabel. Esc beendet.`;
  if (S.tool === "place" && S.placeSym === CTRL) return "Steuerung: Klicken setzt die linke obere Ecke. Klemmen oben und unten rechts frei eintragen, Leitungen rasten an den Klemmen ein. Esc beendet.";
  if (S.tool === "place" && isPrinzip() && S.placeSym === "PZ_LEITUNG") return `Leitungsangabe: Klicken setzt sie auf die Leitung, R dreht, 1 bis 5 = Anzahl Leiter (jetzt ${kabelN(SYMBOL_BY_NAME.PZ_LEITUNG.attrs[0].def, S.pzLeiter || 3)}), Esc beendet. Markierte Leitungsangaben ändern die Tasten gemeinsam.`;
  if (S.tool === "place" && isPrinzip() && isSich(S.placeSym)) return `Sicherung: Klicken setzt das Symbol, R dreht, 1 bis 3 = Striche für L, 2L, 3L, N Strich mit Punkt (jetzt ${SYMBOL_BY_NAME[S.placeSym].attrs.find((a) => a.tag === "POL").def || "ohne"}), Esc beendet.`;
  if (S.tool === "place" && isPrinzip() && PZ_POL.includes(S.placeSym)) return `${SYMBOL_BY_NAME[S.placeSym].label}: Klicken setzt das Symbol, R dreht, 1 bis 3 = L, 2L, 3L, N mit/ohne Neutralleiter (jetzt ${pzPolOf(S.placeSym)}), Esc beendet.`;
  if (S.tool === "place") return S.placeSym === TERMINALS ? "Klemmenleiste: Klicken setzt die obere Kante auf die gewählte Stelle, die Klemmen hängen darunter. Esc beendet." : `${SYMBOL_BY_NAME[S.placeSym].label}: Klicken setzt das Symbol, R dreht${familyOf(S.placeSym)?.variants.length > 1 ? (familyOf(S.placeSym).id === "ZAEHLER" ? ", 1 bis 8 Anschlüsse" : `, 1 bis 4 Polzahl, N Neutralleiter${hasTrenner(S.placeSym) ? ", T N-Trenner" : ""}`) : ""}, Esc beendet. Der Fang rastet auf Feldmitten ein, Alt schaltet ihn aus.${isDevice(SYMBOL_BY_NAME[S.placeSym]) ? " Alt+V verdrahtet das zuletzt gesetzte Gerät." : ""}`;
  if (S.tool === "wire") return S.wireDraft ? "Klicken setzt einen Punkt. Nochmals auf den letzten Punkt klicken oder Eingabetaste beendet. Shift wechselt die Knickrichtung." : S.bundleN > 1 ? `Klicken startet ${S.bundleN} parallele Leiter. Der erste liegt auf dem Klickpunkt, die weiteren rechts oder darunter.` : "Klicken startet eine Leitung. Anschlusspunkte der Symbole rasten ein.";
  if (S.tool === "text") return `Klicken setzt einen Text, die Eingabetaste bestätigt. R dreht (jetzt ${S.textR || 0}°), Ausrichtung rechts.`;
  if (S.tool === "hand") return "Ziehen verschiebt die Ansicht.";
  if (shapeTool(S.tool)) { const t = shapeTool(S.tool); return S.shapeDraft ? `${t.label}: zweiter Klick oder Loslassen setzt ${t.k === "circle" ? "den Radius" : "das Ende"}${t.k === "line" ? ", Shift waagrecht oder senkrecht" : t.k === "rect" ? ", Shift = Quadrat" : ""}. Esc bricht ab.` : `${t.label}: klicken und ziehen (oder zweimal klicken)${t.k === "circle" ? ", erst die Mitte" : ""}. Rastet auf dem Raster ein, Alt = frei. Farbe und Strich rechts.`; }
  return "Objekt anklicken, mit ⌘ oder Shift mehrere wählen (nochmals klicken wählt ab). Auf leerer Fläche ziehen wählt mit Rahmen.";
}
function updateHint() { $("#hint").textContent = ELPLEXA && S.shared ? "Geteilte Ansicht: Ziehen verschiebt, Scrollen oder Pinch zoomt, F passt ein, Bild ↑ ↓ blättert. N Notiz, M Markierung, L Liste der Notizen." : hintText(); }


// Symbolsuche unten links (CJ 18.10.2026): immer sichtbar in Schema und Disposition, filtert die Kacheln der Leiste nach Name,
// Untertitel und Polzahl. Enter setzt den ersten Treffer, Esc leert, Taste / springt ins Feld.
const symFind = (() => {
  const w = document.createElement("div"); w.className = "symsearch"; w.setAttribute("role", "search");
  w.innerHTML = `<span class="ic" aria-hidden="true">${R.icons.search}</span><input id="sym-find" type="search" placeholder="Symbol suchen (/)" aria-label="Symbol suchen" autocomplete="off" spellcheck="false">`;
  $("#left").append(w); return w;
})();
const symQ = () => $("#sym-find").value.trim().toLowerCase();
function applySymFind() {
  const q = symQ(), words = q.split(/\s+/).filter(Boolean);
  leftEl.classList.toggle("searching", !!q);
  for (const el of leftEl.querySelectorAll(ELPLEXA ? "[data-sym], [data-plsym]" : "[data-sym]")) { // Plan: gleiche Suche über die Symbolkacheln (CJ 26.10.2026)
    const fam = el.closest(".symfam")?.querySelector(".name")?.textContent || "";
    const hay = `${fam} ${el.textContent} ${el.title || ""} ${el.getAttribute("aria-label") || ""} ${(ELPLEXA ? el.dataset.sym ?? el.dataset.plsym : el.dataset.sym).replace(/^D:\w+:/, "").replace(/_/g, " ")}`.toLowerCase(); // auch der interne Name (LS_1P)
    el.hidden = !!q && !words.every((x) => hay.includes(x));
  }
  for (const g of leftEl.querySelectorAll(".symfam")) g.hidden = !!q && !g.querySelector("[data-sym]:not([hidden])");
  for (const sec of leftEl.querySelectorAll("section")) sec.hidden = !!q && !sec.querySelector(ELPLEXA ? "[data-sym]:not([hidden]), [data-plsym]:not([hidden])" : "[data-sym]:not([hidden])");
  let none = leftEl.querySelector(".symnone");
  if (q && !leftEl.querySelector(ELPLEXA ? "[data-sym]:not([hidden]), [data-plsym]:not([hidden])" : "[data-sym]:not([hidden])")) { if (!none) { none = document.createElement("p"); none.className = "note symnone"; leftEl.append(none); } none.textContent = `Kein Symbol für „${$("#sym-find").value.trim()}“.`; }
  else none?.remove();
}
$("#sym-find").addEventListener("input", applySymFind);
$("#sym-find").addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Enter") { e.preventDefault(); const first = symQ() && leftEl.querySelector(ELPLEXA ? "[data-sym]:not([hidden]), [data-plsym]:not([hidden])" : "[data-sym]:not([hidden])"); if (first) { first.click(); svg.focus({ preventScroll: true }); } }
  else if (e.key === "Escape") { e.preventDefault(); e.target.value = ""; applySymFind(); svg.focus({ preventScroll: true }); }
});
function renderLeft() {
  renderLeftBody();
  symFind.hidden = isDeck() || isPv() || isOff();
  if (!symFind.hidden) applySymFind();
}
function renderLeftBody() {
  if (isDeck()) { const k = S.model.kind; leftEl.innerHTML = `<section class="section"><h2 class="section-title">${T.kindLabel(S.model)}</h2><p class="note">${k === "title" ? "Blatt 1. Hier wird nicht gezeichnet, die Angaben stehen rechts." : k === "toc" ? "Blatt 2. Entsteht automatisch aus allen Blättern der Datei." : "Letztes Blatt, A4 hoch. Entsteht automatisch aus den Schutzgeräten aller Schemablätter."}</p></section>`; return; }
  if (isOff()) { leftEl.innerHTML = OF.leftHTML(S.model.of); return; }
  if (isDispo()) { leftEl.innerHTML = dispoLeftHTML(); return; }
  if (isPv()) { leftEl.innerHTML = PV.leftHTML(); return; }
  if (ELPLEXA && isPlan()) { leftEl.innerHTML = PL.leftHTML(); return; }
  let h = `<section class="section"><h2 class="section-title">Werkzeuge</h2>`;
  if (isPrinzip()) { leftEl.innerHTML = prinzipLeftHTML(h); return; }
  for (const t of [...TOOLS, ...SHAPE_TOOLS.filter((t) => !t.hidden)]) h += `<button class="tool" data-tool="${t.id}" id="tool-${t.id}" aria-pressed="${S.tool === t.id}"${HOLD_TOOLS[t.id] ? ` data-hold="${t.id}" aria-haspopup="menu" title="${HOLD_TOOLS[t.id]}"` : ""}>${R.icons[t.icon]}<span>${t.label}</span><span class="key">${t.key}</span></button>`; // Linie, Rechteck, Kreis nur im Schema (CJ 18.10.)
  h += `</section>` + abgangHTML() + `<section class="section"><h2 class="section-title">Symbole</h2>`;
  for (const f of FAMILIES) { // Wunsch CJ 16.10.: jede Variante direkt wählbar, ein Klick setzt das Gerät
    if (f.variants.length > 1) { h += `<div class="symfam"><span class="name">${R.esc(f.label)}</span><div class="vargrid">${shownVariants(f).map(varTile).join("")}</div></div>`; continue; }
    const on = S.tool === "place" && f.variants.includes(S.placeSym);
    h += `<button class="sym" data-sym="${f.def}" aria-pressed="${on}"><span class="thumb">${R.thumbSVG(SYMBOL_BY_NAME[f.def])}</span><span><span class="name">${R.esc(f.label)}</span><br><span class="sub">${R.esc(f.sub)}</span></span></button>`;
  }
  h += `<button class="sym" data-sym="${TERMINALS}" aria-pressed="${S.tool === "place" && S.placeSym === TERMINALS}"><span class="thumb">${R.terminalsThumb()}</span><span><span class="name">Klemmenleiste</span><br><span class="sub">Anzahl folgt dem Kabel</span></span></button>`;
  h += `<button class="sym" data-sym="${CTRL}" aria-pressed="${S.tool === "place" && S.placeSym === CTRL}" title="Steuerung KNX Energiemanagement Aktor"><span class="thumb"><svg viewBox="-2 -2 28 20" aria-hidden="true"><rect x="0" y="0" width="24" height="16" fill="none" stroke="currentColor" stroke-width="1.4"/>${[5, 10, 15].map((x) => `<path d="M${x} 0v2.5M${x} 16v-2.5" stroke="currentColor" stroke-width="1.4"/>`).join("")}</svg></span><span><span class="name">Steuerung (Kasten)</span><br><span class="sub">KNX, Energiemanagement, Klemmen frei</span></span></button>`;
  h += "</section>" + libraryHTML();
  leftEl.innerHTML = h;
}

// Prinzipschema (CJ 21.10.2026): Werkzeuge wie im Schema (Leitung ohne Menü Leiterzahl), Symbole einpolig in Gruppen, ohne Abgänge, Klemmen und Bibliothek
function prinzipLeftHTML(h) {
  for (const t of [...TOOLS, ...SHAPE_TOOLS.filter((t) => !t.hidden)]) h += `<button class="tool" data-tool="${t.id}" id="tool-${t.id}" aria-pressed="${S.tool === t.id}"${HOLD_TOOLS[t.id] && t.id !== "wire" ? ` data-hold="${t.id}" aria-haspopup="menu" title="${HOLD_TOOLS[t.id]}"` : ""}>${R.icons[t.icon]}<span>${t.label}</span><span class="key">${t.key}</span></button>`;
  for (const [title, fams] of PRINZIP_GROUPS) {
    h += `</section><section class="section"><h2 class="section-title">${title}</h2>`;
    for (const f of fams) {
      if (f.tool) { h += `<button class="sym" data-tool="${f.tool}" aria-pressed="${S.tool === f.tool}"><span class="thumb">${R.icons.srect}</span><span><span class="name">${R.esc(f.label)}</span><br><span class="sub">${R.esc(f.sub)}</span></span></button>`; continue; } // Form statt Symbol
      if (f.variants.length > 1 && !f.keys) { h += `<div class="symfam"><span class="name">${R.esc(f.label)}</span><div class="vargrid">${shownVariants(f).map(varTile).join("")}</div></div>`; continue; }
      h += `<button class="sym" data-sym="${f.def}" aria-pressed="${S.tool === "place" && (f.keys ? f.variants.includes(S.placeSym) : S.placeSym === f.def)}"><span class="thumb">${R.thumbSVG(SYMBOL_BY_NAME[f.def])}</span><span><span class="name">${R.esc(f.label)}</span><br><span class="sub">${R.esc(f.sub)}</span></span></button>`;
    }
  }
  return h + "</section>";
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
  return "";
}
// Schriftfeld (Wunsch D1, CJ 19.10.2026): im Schema und in der Disposition wieder rechts in der Leiste ohne Auswahl (vorher Knopf oben),
// im Stringplan bleibt es im Fenster Druck. Schema: Felder des Blatts, Projektangaben eingeklappt; Dispo: Objekt, Titel, Gezeichnet, Datum.
function blattHTML() {
  const f = (list) => list.map((m) => fieldHTML(m.label, `data-meta="${m.tag}"`, S.model.meta[m.tag] ?? "")).join("");
  if (isDispo()) return f(META_FIELDS.filter((m) => ["OBJEKT", "TITEL", "GEZEICHNET", "DATUM"].includes(m.tag)));
  return f(META_FIELDS.filter((m) => !T.PROJECT_FIELDS.includes(m.tag)))
    + `<details class="proj"><summary>Projektangaben (gelten für alle Blätter)</summary>${f(META_FIELDS.filter((m) => T.PROJECT_FIELDS.includes(m.tag)))}${T.titleOf(S.doc) ? `<div class="row"><button class="btn outline small" data-act="gotitle">Zur Titelseite</button></div>` : ""}</details>`;
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
const shownVariants = (f, keep) => f.variants.filter((v) => v === keep || !f.hide?.includes(v)); // hide: nur für alte Dateien
const poleSelect = (attr, family, value) => `<div class="field"><label>Polzahl</label><select ${attr}>${shownVariants(family, value).map((v) => `<option value="${v}"${v === value ? " selected" : ""}>${SYMBOL_BY_NAME[v].vlabel ?? SYMBOL_BY_NAME[v].poles + "-polig"}</option>`).join("")}</select></div>`;
const bundleSelect = () => `<div class="field"><label>Anzahl Leiter pro Zug</label><select data-newbundle>${Object.entries(BUNDLE_LABELS).map(([n, l]) => `<option value="${n}"${Number(n) === S.bundleN ? " selected" : ""}>${l}</option>`).join("")}</select></div>`;
// Klemmentexte (CJ 18.10.2026): je Klemme ein Feld, leer = Nummer; 2 Zeilen à 5 Zeichen mit „|“; Haken senkrecht
const termLabCells = (it) => { const n = termCount(it); return Array.from({ length: n }, (_, i) => `<input type="text" data-tlab="${i}" value="${R.esc(it.lab?.[i] ?? "")}" placeholder="${it.pe !== "none" && i === n - 1 ? "PE" : i + 1}" maxlength="11" aria-label="Klemme ${i + 1}" autocomplete="off" spellcheck="false">`).join(""); };
function termLabHTML(it) {
  return `<div class="field"><label>Klemmentexte</label><div class="tlab">${termLabCells(it)}</div></div><p class="note">Leer = Nummer. Höchstens 2 Zeilen à 5 Zeichen, Zeilen mit | trennen (z. B. L1|12345).</p>`
    + `<label class="check"><input type="checkbox" data-tvert${it.vert ? " checked" : ""}> Klemmentexte senkrecht</label>`;
}
function cableNote(it) {
  const c = parseCable(it.cable);
  return c?.tel ? `Fernmeldekabel: ${c.n} Adern = ${c.n} Klemmen (Ø ${c.q} mm), ohne PE-Klemme.` : c ? `Aus dem Kabel folgen ${c.n} Klemmen (${c.q} mm²).` : `Kabelangabe nicht erkannt (Beispiel 5x1.5mm2). Es bleiben ${termCount(it)} Klemmen.`;
}



// Fenster Module, Wechselrichter (rechte Leiste) und Druck (oben) im Stringplan und in der Stringübersicht (UI Schritt 6 Teil 2, 18.10.2026). Hängt am Knopf, blockiert den Plan nicht.
let pvPop = null, popKind = null;
const popEl = $("#pv-pop");
const SHEET_POPS = new Set(["haupt", "ansicht"]);
const popHTML = () => (SHEET_POPS.has(popKind) ? sheetPopHTML(popKind) : ELPLEXA && isPlan() ? PL.popHTML({ head, fieldHTML, META_FIELDS }) : isPrinzip() ? PZ.popHTML(S.model, { head, fieldHTML, META_FIELDS }) : PV.popHTML(popKind, { head, fieldHTML, META_FIELDS }));
function renderPvBar() {
  if (ELPLEXA && isPlan()) { planPvBar(); return; }
  const on = isPv() || isPrinzip(), doc = !on && !isDeck() && !isOff(); // Schema: Hauptlinien, Disposition: Ansicht (Schriftfeld rechts, D1); Prinzipschema: Druck wie PV
  $("#pv-bar").hidden = !on; $("#doc-bar").hidden = !doc; $("#btn-haupt").hidden = isDispo(); $("#btn-ansicht").hidden = !isDispo();
  if (!pvPop) return;
  if (pvPop.open && (SHEET_POPS.has(popKind) ? !doc || (popKind === "haupt" && isDispo()) || (popKind === "ansicht" && !isDispo()) : !on)) { pvPop.hide(false); return; }
  if (!on) { // live (z. B. Ziel der Hauptlinien), nicht während in einem Textfeld getippt wird
    const ae = document.activeElement;
    if (pvPop.open && !(popEl.contains(ae) && ae.type === "text")) { const y = popEl.scrollTop, had = popEl.contains(ae); popEl.innerHTML = popHTML(); popEl.scrollTop = y; if (had) popEl.focus(); }
    return;
  }
  const l = isPrinzip() ? PZ.printLabel(S.model) : PV.printLabel(), b = $("#btn-pvdruck");
  $("#pv-druck-lbl").textContent = l.text; b.classList.toggle("warn", l.warn);
  b.title = `Druck: ${l.text}${l.warn ? ", Inhalt passt nicht aufs Papier" : ""}. Papier${isPrinzip() ? "" : ", Massstab"}, Plankopf`;
  if (pvPop.open) { const y = popEl.scrollTop, had = popEl.contains(document.activeElement); popEl.innerHTML = popHTML(); popEl.scrollTop = y; if (had) popEl.focus(); } // live, z. B. Passt-Hinweis
}
// Plan (nur elplexaCAD): Knopf Druck oben wie im Stringplan
function planPvBar() {
  $("#pv-bar").hidden = false; $("#doc-bar").hidden = true;
  if (pvPop?.open && SHEET_POPS.has(popKind)) { pvPop.hide(false); return; }
  const l = PL.printLabel(), b = $("#btn-pvdruck");
  $("#pv-druck-lbl").textContent = l.text; b.classList.remove("warn"); b.title = `Druck: ${l.text}. Papier, Massstab, Plankopf`;
  if (pvPop?.open) { const y = popEl.scrollTop, had = popEl.contains(document.activeElement); popEl.innerHTML = popHTML(); popEl.scrollTop = y; if (had) popEl.focus(); }
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
  if (isOff()) { rightEl.innerHTML = OF.panelHTML(S.model.of, loadProfil()); return; }
  if (ELPLEXA && isPlan()) { rightEl.innerHTML = PL.panelHTML(sel, { head }); return; }
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
      if (isPrinzip() && PZ_ABGANG.includes(it.sym)) h += `<div class="row"><button class="btn outline small" data-act="pzwire" title="Links bis zur Steigleitung, rechts Leitungsangabe und Verbraucher">Verdrahten</button></div>`;
      if (isDevice(sym)) h += `<div class="row"><button class="btn outline small" data-act="golegend">In Legende zeigen</button><button class="btn outline small" data-act="autowire" title="Leitungen von den Hauptlinien und zu den Klemmen (Alt+V)">Autoverkabelung</button></div>`;
      h += actions([["rotate", "rotate", "Drehen"], ["dup", "copy", "Duplizieren"], ["del", "trash", "Löschen", "danger"]]);
    } else if (it.type === "terminals") {
      h += `<div class="prop-head"><h2>Klemmenleiste</h2><p>${termCount(it)} Klemmen</p></div>`;
      h += fieldHTML("Bezeichnung der Leiste (BMK)", 'data-term="bmk"', it.bmk);
      h += fieldHTML("Kabel", 'data-term="cable"', it.cable, 'placeholder="5x1.5mm2"');
      h += `<p class="note" data-cablenote>${R.esc(cableNote(it))}</p>`;
      h += fieldHTML("Bezeichnung (unter dem Kabel)", 'data-term="name"', it.name);
      h += `<div class="field"><label>Klemmen</label><select data-termdraw><option value="on"${it.noterm ? "" : " selected"}>Klemmen zeichnen</option><option value="off"${it.noterm ? " selected" : ""}>Keine Klemme (nur BMK, Kabel, Bezeichnung)</option></select></div>`;
      if (!it.noterm) h += termLabHTML(it);
      if (!it.noterm) h += `<div class="field"><label>Letzte Klemme</label><select data-termpe><option value="last"${it.pe !== "none" ? " selected" : ""}>PE-Klemme (schraffiert)</option><option value="none"${it.pe === "none" ? " selected" : ""}>Normale Klemme</option></select></div>`;
      h += actions([["dup", "copy", "Duplizieren"], ["del", "trash", "Löschen", "danger"]]);
    } else if (it.type === "ctrl") {
      h += head("Steuerung", `${ctrlTerms(it.top).length + ctrlTerms(it.bot).length} Klemmen`);
      h += fieldHTML("Bezeichnung im Kasten", 'data-ctrl="name"', it.name, 'placeholder="z. B. KNX Schaltaktor"');
      h += fieldHTML("BMK", 'data-ctrl="bmk"', it.bmk, 'placeholder="z. B. 12A1"');
      h += fieldHTML("Klemmen oben (mit Komma getrennt)", 'data-ctrl="top"', it.top, 'placeholder="L, N, KNX+, KNX-"');
      h += fieldHTML("Klemmen unten (mit Komma getrennt)", 'data-ctrl="bot"', it.bot, 'placeholder="1, 2, 3, 4"');
      h += `<p class="note">Je Klemme höchstens 8 Zeichen, Abstand 5 mm. Die Breite folgt aus der Klemmenzahl.</p>`;
      h += `<div class="field"><label>Höhe in mm</label><input type="number" min="10" max="200" step="2.5" data-ctrl="h" value="${it.h}"></div>`;
      h += actions([["dup", "copy", "Duplizieren"], ["del", "trash", "Löschen", "danger"]]);
    } else if (it.type === "wire") {
      h += `<div class="prop-head"><h2>Leitung</h2><p>${it.pts.length - 1} Segment${it.pts.length === 2 ? "" : "e"}</p></div>`;
      h += kindSelect('data-wirekind', it.kind);
      if (isRail(it)) h += `<p class="note">Hauptlinie ${R.esc(railName(it))}${isGroupWire(S.model.items, it) ? ", Grundverkabelung L1 bis N gemeinsam" : ""}</p>` + (isGroupWire(S.model.items, it) ? mainPanelHTML() : railEndSelect("l", it) + railEndSelect("r", it));
      h += actions([["dup", "copy", "Duplizieren"], ["del", "trash", "Löschen", "danger"]]);
    } else if (it.type === "shape") {
      h += head(it.diag ? "Hauptverteilung" : SHAPE_KINDS[it.k], it.diag ? "Rechteck mit Diagonale, Grösse an den Ecken ziehen" : "Freie Form") + styleHTML(sel) + actions([["dup", "copy", "Duplizieren"], ["del", "trash", "Löschen", "danger"]]);
    } else {
      h += textPanelHTML(it, false, isSchema()).replace('<div class="row">', styleHTML(sel) + '<div class="row">');
    }
  } else if (sel.length > 1) {
    const same = sameSymbols(sel);
    h += `<div class="prop-head"><h2>${same ? `${sel.length} × ${R.esc(SYMBOL_BY_NAME[same].label)}` : `${sel.length} Objekte`}</h2><p>Mehrfachauswahl</p></div>`;
    if (same) for (const a of SYMBOL_BY_NAME[same].attrs) if (!a.auto) { const v = new Set(sel.map((i) => i.attrs[a.tag] ?? "")); h += fieldHTML(a.label + (v.size > 1 ? " (verschieden)" : ""), `data-attr="${a.tag}"`, v.size === 1 ? [...v][0] : ""); }
    if (sel.every((i) => i.type === "shape" || i.type === "text")) h += styleHTML(sel);
    h += actions([["dup", "copy", "Duplizieren"], ["del", "trash", "Löschen", "danger"]]);
  } else {
    if (S.tool === "wire" && isPrinzip()) h += `<div class="prop-head"><h2>Neue Leitung</h2></div>` + kindSelect("data-newkind", S.wireKind);
    else if (S.tool === "wire") h += `<div class="prop-head"><h2>Neue Leitung</h2></div>` + bundleSelect() + (S.bundleN === 1 ? kindSelect("data-newkind", S.wireKind) : `<p class="note">Leiter von oben links nach unten rechts: ${BUNDLE_PRESETS[S.bundleN].join(", ")}.</p>`);
    else if (S.tool === "place" && S.placeSym !== TERMINALS && familyOf(S.placeSym)?.variants.length > 1) h += `<div class="prop-head"><h2>Neues Symbol</h2></div>` + poleSelect("data-placepoles", familyOf(S.placeSym), S.placeSym);
    else if (S.tool === "text") h += `<div class="prop-head"><h2>Neuer Text</h2></div><div class="field"><label>Texthöhe in mm</label><input type="number" min="1" max="20" step="0.5" data-newth value="${S.textH}"></div>` + (isSchema() ? turnHTML(S.textR, S.textAl, "data-newt") : "") + styleHTML([{ type: "text", c: S.textC }]);
    else if (shapeTool(S.tool)) h += head(`Neue Form: ${shapeTool(S.tool).label}`) + styleHTML([{ type: "shape", k: shapeTool(S.tool).k, ...S.shapeStyle }]);
    if (isPrinzip()) h += head(sheetLabel(S.model, S.active), "Einpolig, von Hand gezeichnet") + `<p class="note">Symbole links, Leitung (L) und Text (T) wie im Schema, Bereiche mit der Linie (I) trennen. Papier und Plankopf oben unter „Druck“.</p>`;
    else h += head(sheetLabel(S.model, S.active), "Schriftfeld") + blattHTML() + `<p class="note">Hauptlinien: ${R.esc(mainSummary())}.</p>`;
    h += `<div class="row"><button class="btn outline small" data-act="dupsheet" title="Blatt kopieren, die Kopie ist unabhängig">${R.icons.copy.replace("<svg", '<svg width="16" height="16"')}Blatt duplizieren</button><button class="btn outline small danger" data-act="delsheet"${workCount() < 2 ? " disabled" : ""}>${R.icons.trash.replace("<svg", '<svg width="16" height="16"')}Blatt löschen</button></div>`;
  }
  rightEl.innerHTML = h;
}

// ---------- Blätter ----------
const workCount = () => S.doc.sheets.filter((sh) => !T.isDeck(sh)).length;
function sheetLabel(sh, i) { const v = sh.var > 1 ? ` · V${sh.var}` : ""; return sh.kind === "title" ? "Titelseite" : sh.kind === "toc" ? "Inhalt" : sh.kind === "legend" ? `Legende ${sh.meta.BLATT}` : sh.kind === "pvtab" ? `Stringübersicht${v}` : `${sh.kind === "dispo" ? "Dispo" : sh.kind === "pv" ? "Stringplan" : sh.kind === "prinzip" ? "Prinzipschema" : sh.kind === "offerte" ? "Offerte" : ELPLEXA && sh.kind === "plan" ? "Plan" : "Blatt"} ${sh.meta.BLATT || i + 1}${v}`; } // V2: Variante (18.10.2026)
// Kompakte Leiste: ‹ Blatt 58 · 1 von 12 ▾ › +. Die Mitte öffnet die Liste aller Blätter, + hält eine Auswahl bereit
function renderSheetBar() {
  if (ELPLEXA) { elSheetBar(); return; }
  const n = S.doc.sheets.length, a = S.active, sh = S.doc.sheets[a];
  $("#btn-dxf-all").hidden = n < 2;
  const open = sheetMenu?.open, keep = document.activeElement?.closest?.("#sheetbar") && document.activeElement.id;
  $("#sheetbar").innerHTML = `<button class="sheettab nav" data-step="-1" title="Vorheriges Blatt (Bild auf)" aria-label="Vorheriges Blatt"${a === 0 ? " disabled" : ""}>‹</button>`
    + `<button class="sheettab cur" id="sheet-cur" data-gosheet aria-haspopup="dialog" aria-expanded="${!!open}" title="Liste aller Blätter (G). Rechtsklick oder gedrückt halten: Duplizieren, Löschen" data-ctx="${a}"><span class="cl">${sh.pin ? "★ " : ""}${R.esc(sheetLabel(sh, a))}</span>${sh.meta.TITEL && !T.isDeck(sh) ? `<span class="ct">${R.esc(sh.meta.TITEL)}</span>` : ""}<span class="of">${a + 1} von ${n}</span><span class="caret" aria-hidden="true">▾</span></button>`
    + `<button class="sheettab nav" data-step="1" title="Nächstes Blatt (Bild ab)" aria-label="Nächstes Blatt"${a === n - 1 ? " disabled" : ""}>›</button>`
    + (isOff() ? ofKapBtn("") + ofPlusBtn() : `<button class="sheettab add" id="sheet-add" data-addsheet aria-haspopup="menu" aria-expanded="false" title="Neu: ${addKindLabel()}. Gedrückt halten oder Rechtsklick: Blatttyp wählen" aria-label="Neu: ${addKindLabel()}">${R.icons.plus}</button>`) + starBtn();
  if (keep) document.getElementById(keep)?.focus();
  if (open) renderSheetList();
}
// Blattleiste der Offerte (CJ 26.10.2026): Inhaltsverzeichnis der Offerte statt «Offerte 2» im selben Modul. ‹ › und die Liste springen zu den
// BKP-Kapiteln und zur Schlusszusammenstellung. Plus fragt «Variante» (Kopie) oder «Nachtrag» (leer, gleiche Nummer), beides als eigenes Offerten-Modul.
// elplexaCAD: die ganze Leiste ist das Inhaltsverzeichnis. SchemaCAD v3: die Leiste blättert weiter durch alle Blätter (sonst kein Weg zurück zum Schema),
// dazu der Knopf «Kapitel» mit derselben Liste.
// Gliederung (CJ 26.10.2026): die Leiste kennt nur die Kapitel, die der Hauptbereich zeigt (angewählter Knoten mit allem darunter).
const ofParts = () => [...ofView.querySelectorAll(".of-kap, .of-end")];
const ofTargets = () => ofParts().map((el) => el.dataset.label || "Schlusszusammenstellung");
const ofJumpKap = (kid) => { const i = ofParts().findIndex((el) => el.dataset.kid === String(kid)); if (i >= 0) ofJump(i); };
let ofPin = null; // angesprungenes Kapitel { i, top }: gilt, bis von Hand gescrollt wird (kurze Offerte scrollt beim Sprung nicht)
function ofCur() { // Kapitel oben in der Ansicht
  if (ofPin && Math.abs(ofView.scrollTop - ofPin.top) < 2 && ofPin.i < ofParts().length) return ofPin.i;
  ofPin = null;
  const top = ofView.getBoundingClientRect().top + 40; let i = 0;
  ofParts().forEach((el, n) => { if (el.getBoundingClientRect().top <= top) i = n; });
  return i;
}
function ofJump(i) { const el = ofParts()[i]; if (!el) return; ofView.scrollTop += el.getBoundingClientRect().top - ofView.getBoundingClientRect().top - 8; ofPin = { i, top: ofView.scrollTop }; renderSheetBar(); }
const ofStep = (d) => ofJump(Math.max(0, Math.min(ofTargets().length - 1, ofCur() + d)));
let ofShown = -1;
ofView.addEventListener("scroll", () => { if (isOff() && ofCur() !== ofShown) renderSheetBar(); }, { passive: true });
function ofKapBtn(id = ' id="sheet-cur"') {
  const t = ofTargets(), i = (ofShown = Math.min(ofCur(), t.length - 1));
  if (!id) return `<button class="sheettab nav of-kapbtn" id="of-kap" data-ofkap aria-haspopup="menu" title="Kapitel der Offerte"${t.length ? "" : " disabled"}>Kapitel ▾</button>`;
  return `<button class="sheettab cur"${id} data-ofkap aria-haspopup="menu" title="Kapitel der Offerte: Liste zum Springen"${t.length ? "" : " disabled"}><span class="cl">${R.esc(t[i] || "Noch kein Kapitel")}</span>${t.length ? `<span class="of">${i + 1} von ${t.length}</span>` : ""}<span class="caret" aria-hidden="true">▾</span></button>`;
}
const ofPlusBtn = () => `<button class="sheettab add" id="sheet-add" data-ofplus aria-haspopup="menu" title="Neu: Variante oder Nachtrag dieser Offerte (je ein eigenes Modul)" aria-label="Neu: Variante oder Nachtrag">${R.icons.plus}</button>`;
// Variante (Kopie dieser Offerte) oder Nachtrag (leere Offerte mit gleicher Nummer) als neues Offerten-Modul mit eigenem Namen
function ofNew(kind, imported = null, label = "") { // imported: fertige Offerte aus dem Excel-Import, label: Name des Moduls
  const src = S.model.of, k0 = S.model.kind, v = Math.max(...S.doc.sheets.filter((sh) => modBase(sh) === "offerte").map(varOf)) + 1;
  const names = E_modNames("offerte"), word = kind === "var" ? "Variante" : "Nachtrag";
  const n = names.filter((x) => x.includes(`– ${word} `)).length + (kind === "var" ? 2 : 1), name = imported ? label : `Offerte – ${word} ${n}`;
  setTool("select");
  change(() => {
    const sh = setVar(newSheet("offerte"), v);
    if (imported) sh.of = imported;
    else if (kind === "var") sh.of = structuredClone(src);
    else Object.assign(sh.of, offerDefaults(), { nr: src.nr });
    if (!imported) sh.of.ver = `${word} ${n}`;
    sh.meta.BLATT = String(maxNo("offerte") + 1);
    S.doc.sheets.push(sh); S.active = S.doc.sheets.length - 1; S.sel.clear();
    (S.doc.mods ??= {})[modKey("offerte", v)] = { name };
  });
  afterSheetChange(k0);
  if (!imported) toast(`Neues Modul «${name}»${kind === "var" ? ": Kopie der Offerte" : ""}.`);
}
// Excel-Offerte einlesen (Schritt 5, CJ 26.10.2026): Datei wählen, Deutung im Fenster zeigen, Gruppen abwählbar (werden Optionen, z. B. Variante V1).
// Leere Offerte wird gefüllt, sonst entsteht ein neues Offerten-Modul mit dem Dateinamen. Ein Schritt im Rückgängig.
async function ofImport() {
  const file = await new Promise((res) => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; inp.onchange = () => res(inp.files[0] || null); inp.addEventListener("cancel", () => res(null)); inp.click(); });
  if (!file) return;
  const base = file.name.replace(/\.xlsx$/i, "");
  let res;
  try {
    const inflate = async (d) => new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    res = parseOfferte(await readXlsx(new Uint8Array(await file.arrayBuffer()), inflate), { titel: base });
  } catch (err) { toast("Die Excel-Datei liess sich nicht lesen: " + (err.message || err), "error"); return; }
  if (!res.info.positionen) { toast("Keine Positionen gefunden. Erwartet wird eine Kopfzeile mit Text (Artikel, Titel, Beschreibung) und Menge.", "error"); return; }
  const defs = offerDefaults(), probe = buildOfferte(res, defs), t = O_totals(probe), rows = [];
  let gi = 0; // je Kapitel eine Zeile (Gliederung: Knoten · BKP)
  probe.kap.forEach((k) => { const n = k.grp.reduce((s, g) => s + g.pos.length, 0); rows.push(`<label class="chk of-imp"><input type="checkbox" data-impg="${gi++}" checked> <span>${R.esc([O_knFind(probe, k.kn)?.titel, k.bkp ? `BKP ${k.bkp}` : !k.kn && (k.titel || "ohne Titel")].filter(Boolean).join(" · "))}</span><span class="note">${n} Pos. · ${OF_fmt(t.kapSum.get(k.id) || 0)}</span></label>`); });
  const i = res.info, body = `<p>${R.esc(file.name)}: Blätter ${R.esc(i.blaetter.join(", "))}, ${i.positionen} Positionen${probe.kn.length ? ` in ${probe.kn.length} Knoten der Gliederung` : ""}${res.fak ? `, Materialfaktor ${res.fak}` : ""}. `
    + `Summen- und Totalzeilen übernimmt der Import nicht, die Offerte rechnet selbst.${i.ohnePreis ? ` ${i.ohnePreis} Position${i.ohnePreis === 1 ? "" : "en"} ohne Preis.` : ""}</p>`
    + `<p class="note">Textzeilen ohne Menge und Preis (z. B. Räume) werden Knoten der Gliederung. Abgewählte Zeilen kommen als Optionen (nicht in der Angebotssumme), z. B. eine Variante V1.</p>`
    + `<div class="print-list">${rows.join("")}</div><p class="of-imp-sum">Zwischensumme <b data-impsum>${OF_fmt(t.zwischensumme)}</b></p>`
    + `<div class="actions"><button class="btn outline" data-c>Abbrechen</button><button class="btn primary" data-ok>Importieren</button></div>`;
  const root = $("#modal-root"), off = () => new Set([...root.querySelectorAll("[data-impg]")].filter((b) => !b.checked).map((b) => Number(b.dataset.impg)));
  const upd = () => { const el = root.querySelector("[data-impsum]"); if (el) el.textContent = OF_fmt(O_totals(buildOfferte(res, defs, off())).zwischensumme); };
  const ask = openModal("Excel-Offerte importieren", body, (b, done) => { if (b.dataset.ok !== undefined) done(off()); else if (b.dataset.c !== undefined) done(null); }, null, "[data-ok]", "sw-modal");
  root.addEventListener("change", upd);
  const sel = await ask;
  root.removeEventListener("change", upd);
  if (!sel) return;
  const of = buildOfferte(res, defs, sel);
  if (!S.model.of.kap.length) { const keep = S.model.of; of.nr = keep.nr; of.datum = keep.datum || of.datum; change(() => { S.model.of = of; }); }
  else ofNew("imp", of, `Offerte – ${base}`);
  toast(`${i.positionen} Positionen aus «${file.name}» übernommen. BKP und Texte sind frei änderbar.`);
}
// Menü der Offerten-Leiste: geht nach oben auf wie die Blattliste (Kapitelliste, Variante oder Nachtrag)
const ofMenuEl = document.createElement("div"); ofMenuEl.className = "menu"; ofMenuEl.id = "of-menu"; ofMenuEl.setAttribute("role", "menu"); ofMenuEl.hidden = true; $("#app").append(ofMenuEl);
const ofMenu = makeMenu(ofMenuEl, { up: true, left: true, beforeShow: () => closeEditor(true) });
function ofMenuOpen(b) {
  const mi = (act, title, on = false, sub = "") => `<button class="mi${on ? " on" : ""}" role="menuitem" data-ofm="${act}" tabindex="-1" aria-checked="${on}"><span class="mt"><span class="mh">${R.esc(title)}</span>${sub ? `<span class="ms">${R.esc(sub)}</span>` : ""}</span></button>`;
  const kap = b.dataset.ofkap !== undefined, cur = ofCur();
  ofMenuEl.setAttribute("aria-label", kap ? "Kapitel der Offerte" : "Variante oder Nachtrag");
  ofMenuEl.innerHTML = kap ? `<div class="ctx-head">Kapitel der Offerte</div>` + ofTargets().map((l, i) => mi(`k:${i}`, l, i === cur)).join("")
    : `<div class="ctx-head">Neu als eigenes Offerten-Modul</div>` + mi("var", "Variante", false, "Kopie dieser Offerte") + mi("nach", "Nachtrag", false, "Leere Offerte mit gleicher Offertnummer");
  ofMenu.toggle(b);
}
ofMenuEl.addEventListener("click", (e) => { const a = e.target.closest("[data-ofm]")?.dataset.ofm; if (!a) return; if (a.startsWith("k:")) ofJump(Number(a.slice(2))); else ofNew(a); });
const E_modNames = (base) => [...new Set(S.doc.sheets.filter((sh) => modBase(sh) === base).map(modOf))].map((id) => modName(S.doc, id));
// Sprünge zu wichtigen Blättern (CJ 18.10.2026): mit M (★) markierte Blätter. Knopf ★ in der Blattleiste: Klick = nächstes markiertes
// Blatt, Rechtsklick oder gedrückt halten = Liste aller markierten (Klick-Regel). Tasten ⇧Bild ab / ⇧Bild auf. Über alle Module.
const pinned = () => S.doc.sheets.map((sh, i) => (sh.pin ? i : -1)).filter((i) => i >= 0);
const starBtn = () => (pinned().length ? `<button class="sheettab star" id="sheet-star" data-starjump data-hold="star" aria-haspopup="menu" title="Nächstes markierte Blatt (⇧Bild ab). Rechtsklick oder gedrückt halten: alle markierten Blätter" aria-label="Markierte Blätter: ${pinned().length}">★<span class="n">${pinned().length}</span></button>` : "");
function jumpStar(d) {
  const p = pinned(); if (!p.length) { toast("Kein Blatt markiert. M markiert das offene Blatt mit ★."); return; }
  const i = d > 0 ? p.find((k) => k > S.active) ?? p[0] : [...p].reverse().find((k) => k < S.active) ?? p.at(-1);
  if (i !== S.active) switchSheet(i);
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
  if (ELPLEXA && isPlan()) S.grid.size = PL.grid(); // Raster Plan: Vorgabe 10 mm (CJ 26.10.2026)
  const opts = isPv() || ELPLEXA && isPlan() ? PV_GRID : isDispo() ? [[1, "1 mm"], [5, "5 mm"], [10, "10 mm"], [25, "25 mm"], [50, "50 mm"]] : [[1, "1 mm"], [2.5, "2,5 mm"], [5, "5 mm"]];
  $("#grid-size").innerHTML = opts.map(([v, l]) => `<option value="${v}"${v === S.grid.size ? " selected" : ""}>${l}</option>`).join("");
  $("#mag-on").closest("label").style.display = isDispo() || isPv() || isDeck() || isPrinzip() || ELPLEXA && isPlan() ? "none" : ""; // Feldmitte: nur Schema (Spalten im Rahmen)
  $("#grid-on").closest("label").style.display = $("#grid-size").style.display = isDeck() ? "none" : ""; // Titelseite, Inhalt: nichts zu zeichnen
  $("#btn-handover").hidden = !isDispo();
  renderPvBar();
  $("#dims-on").closest("label").style.display = isDispo() ? "" : "none";
  ofView.hidden = !isOff(); document.body.classList.toggle("is-offerte", isOff()); // Offerte: Tabelle über der Zeichenfläche, Raster und Zoom ausgeblendet (style.css)
  if (isOff()) { ofView.innerHTML = ""; $("#grid-on").closest("label").style.display = $("#grid-size").style.display = $("#mag-on").closest("label").style.display = "none"; }
  if (ELPLEXA) elSync();
}
// Nach jedem Wechsel des angezeigten Blatts: bei anderem Blatttyp (oder reset) Werkzeug zurücksetzen, Ansicht einpassen, alles neu zeichnen
function afterSheetChange(prevKind, { reset = false, fit = false } = {}) {
  const kindChanged = (prevKind || "schema") !== (S.model.kind || "schema");
  if (kindChanged || reset) { S.tool = "select"; S.placeSym = null; S.sel.clear(); svg.className.baseVal = ""; }
  OF.closeDetails(); // aufgeklappte Angaben gehören zur bisherigen Offerte (IDs gelten je Offerte)
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
// Prinzipschema (CJ 21.10.2026): leeres Blatt im offenen Prinzipschema-Modul, Nummer fortlaufend je Art
function addPrinzip(v) {
  setTool("select");
  const k0 = S.model.kind;
  v = varIn("prinzip", v);
  change(() => {
    const sh = setVar(newSheet("prinzip"), v);
    sh.meta.BLATT = String(maxNo("prinzip") + 1);
    S.doc.sheets.push(sh); S.active = S.doc.sheets.length - 1; S.sel.clear();
  });
  afterSheetChange(k0);
}
// Plan (nur elplexaCAD, CJ 23.10.2026): leeres Blatt im offenen Plan-Modul, Ebene «Hintergrund», A3 quer 1:50, eigene sid (Notizen im Teilen-Link)
function addPlan(v) {
  setTool("select");
  const k0 = S.model.kind;
  v = varIn("plan", v);
  change(() => {
    const sh = setVar(newPlanSheet(newSheet("plan")), v);
    sh.sid = nextId(); sh.meta.BLATT = String(maxNo("plan") + 1);
    S.doc.sheets.push(sh); S.active = S.doc.sheets.length - 1; S.sel.clear();
  });
  afterSheetChange(k0, { fit: true }); // CJ 24.10.2026: neuer Plan eingepasst, nicht mit Zoom/Ausschnitt des vorigen Plans (lag dort, wo die Maus beim Zoomen war)
}
// Offerte (CJ 26.10.2026): neues Blatt im offenen Offerten-Modul, mit leerer Offerte (Datum von heute)
function addOfferte(v) {
  setTool("select");
  const k0 = S.model.kind;
  v = varIn("offerte", v);
  change(() => {
    const sh = setVar(newSheet("offerte"), v);
    Object.assign(sh.of, offerDefaults()); // Ansatz und Faktor aus den Sollwerten des Benutzers (Schritt 4), in der Offerte änderbar
    sh.meta.BLATT = String(maxNo("offerte") + 1);
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
const addKindLabel = () => (ELPLEXA && isPlan() ? "Plan" : { dispo: "Disposition", pv: "Stringplan", pvtab: "Stringplan", prinzip: "Prinzipschema", offerte: "Offerte" }[S.model.kind] || "Schemablatt");
function addSameKind() { const k = S.model.kind; (k === "dispo" ? addDispo : k === "pv" || k === "pvtab" ? addPv : k === "prinzip" ? addPrinzip : k === "offerte" ? addOfferte : ELPLEXA && k === "plan" ? addPlan : addSheet)(); }
function addSheet(v) {
  setTool("select");
  const k0 = S.model.kind;
  v = varIn("schema", v);
  change(() => { S.doc.sheets.push(setVar(makeSheet(nextSheetNo()), v)); S.active = S.doc.sheets.length - 1; S.sel.clear(); });
  afterSheetChange(k0);
}
// Nächste freie Blattnummer der Schemablätter, neues Schemablatt mit Grundverkabelung
function nextSheetNo() {
  const nums = S.doc.sheets.filter((sh) => !sh.kind || sh.kind === "title" || sh.kind === "toc" || sh.ins).map((sh) => parseInt(sh.meta.BLATT, 10)).filter(Number.isFinite);
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
      if (ELPLEXA && it.type === "opening") it.wall = ids.get(it.wall) ?? it.wall; // Plan: Öffnung an der kopierten Wand
      if (ELPLEXA && it.type === "dim" && it.ref !== undefined) { if (ids.has(it.ref)) it.ref = ids.get(it.ref); else delete it.ref; }
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
      target.meta.BLATT = k === "dispo" || k === "prinzip" || ELPLEXA && k === "plan" ? String(maxNo(k) + 1) : nextSheetNo();
      S.doc.sheets.push(target);
    }
    S.active = S.doc.sheets.indexOf(target); S.sel.clear();
  });
  afterSheetChange(k, { fit: true });
  toast(`Kopie angelegt: ${sheetLabel(S.model, S.active)} „${S.model.meta.TITEL}“. Umbenennen: Feld Titel im ${k === "pv" || k === "pvtab" || k === "prinzip" ? "Plankopf (Fenster Druck)" : "Schriftfeld"}.`);
}
// ---------- Module (CJ 18.10.2026): Schema, Disposition und PV mehrfach, je Modul eigener Name (doc.mods, model.js) ----------
const modSheets = (id) => S.doc.sheets.filter((sh) => modOf(sh) === id && !T.isDeck(sh));
const maxNo = (kind) => Math.max(0, ...S.doc.sheets.filter((s) => s.kind === kind).map((s) => parseInt(s.meta.BLATT, 10)).filter(Number.isFinite));
// Eintrag eines gelöschten Moduls samt Verweisen „PV fortsetzen“ entfernen (Modul gelöscht oder letztes Blatt gefallen)
function dropModEntry(id) {
  const m = S.doc.mods; if (!m) return;
  delete m[id];
  if (id.startsWith("pv")) for (const e of Object.values(m)) if (e.cont === (Number(id.split(":")[1]) || 1)) delete e.cont;
  tidyMods();
}
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
// Modulstatus und Platz in der Übersicht (CJ 20.10.2026): doc.mods[id].st / .o, reisen mit Umbenennen, Rückgängig; Löschen räumt auf, Kopie startet ohne beides
function setModStatus(id, st) {
  if (!MOD_STATUS.includes(st) || E.modStatus(S.doc, id) === st) return;
  change(() => { const m = (S.doc.mods ??= {}); m[id] = { ...m[id] }; if (st === MOD_STATUS[0]) delete m[id].st; else m[id].st = st; tidyMods(); }, { panel: false });
}
const setModOrder = (ids) => change(() => { const m = (S.doc.mods ??= {}); ids.forEach((x, k) => { m[x] = { ...m[x], o: k + 1 }; }); }, { panel: false });
function moveModule(id, dir) {
  const ids = E.modIds(S.doc), i = ids.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return false;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  setModOrder(ids);
  return true;
}
// Ziehen (Etappe 5): die gezogene Kachel nimmt den Platz der Ziel-Kachel ein
function moveModuleTo(id, target) {
  const ids = E.modIds(S.doc), i = ids.indexOf(id), j = ids.indexOf(target);
  if (i < 0 || j < 0 || i === j) return false;
  ids.splice(i, 1); ids.splice(j, 0, id);
  setModOrder(ids);
  return true;
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
    dropModEntry(id);
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
  const k0 = S.model.kind, gone = modOf(S.model);
  change(() => {
    for (const it of S.model.items) if (isRef(it)) unlinkRef(S.doc, it);
    S.doc.sheets.splice(S.active, 1); S.active = Math.min(S.active, S.doc.sheets.length - 1); S.sel.clear();
    if (!S.doc.sheets.some((sh) => modOf(sh) === gone)) dropModEntry(gone); // letztes Blatt des Moduls: Name, Status, Platz gehen nicht auf ein neues Modul gleicher Kennung über
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
  finishWire(); PV.cancel(); if (ELPLEXA) PL.cancel();
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
  const sh = shapeFrom(t.k, f.a, c, shift, { ...S.shapeStyle, diag: t.diag }); // Hauptverteilung: mit Diagonale
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
  const same = S.model.items.find((i) => i.type === "symbol" && i.sym === name && i.x === x && i.y === y && (i.rot || 0) === (rot || 0));
  if (same) { S.sel = new Set([same.id]); renderRight(); renderOverlay(); return; } // gleiches Symbol am gleichen Ort (z. B. Doppelklick): nicht doppelt setzen
  change(() => {
    const dev = { id: nextId(), type: "symbol", sym: name, x, y, rot, attrs: Object.fromEntries(sym.attrs.map((a) => [a.tag, a.def])) };
    if (name === "PZ_LEITUNG" && S.pzLeiter) dev.attrs.KABEL = kabelN(dev.attrs.KABEL, S.pzLeiter); // zuletzt mit 1–5 gewählte Anzahl Leiter
    if (isPrinzip() && PZ_POL.includes(name)) dev.attrs.POL = pzPolOf(name); // zuletzt mit 1–3/N gewählte Polzahl je Symbol (Sicherung: Variante)
    S.model.items.push(dev);
    if (isDevice(sym) && !columnHasTerminals(S.model.items, dev)) S.model.items.push(deviceTerminals(dev, S.model.items, nextId));
    placed = dev;
  });
  if (placed && isDevice(sym)) S.lastDev = placed.id; // für die Autoverkabelung (Alt+V) direkt nach dem Setzen
  if (placed && isRef(placed)) offerLink(S.model.items.find((i) => i.id === placed.id));
}
// Autoverkabelung (CJ 18.10.2026): Alt+V verdrahtet die gewählten Geräte, ohne Auswahl das zuletzt gesetzte (vorlagen.js autoWireItems).
// Ein Rückgängig-Schritt; Geräte von oben nach unten, damit übereinander stehende Geräte aneinander anschliessen.
function autoWire() {
  if (!isSchema()) return;
  let devs = selectedItems().filter((i) => i.type === "symbol" && isDevice(SYMBOL_BY_NAME[i.sym]));
  if (!devs.length) { const last = S.model.items.find((i) => i.id === S.lastDev); if (last) devs = [last]; }
  if (!devs.length) { toast("Autoverkabelung: zuerst ein Gerät (LS, FI, RCBO, NH) setzen oder wählen, dann Alt+V."); return; }
  devs.sort((a, b) => b.y - a.y);
  const snap0 = snapshot(); let n = 0; const skipped = [];
  for (const d of devs) { const a = autoWireItems(d, S.model.items, nextId); S.model.items.push(...a.items); n += a.items.length; skipped.push(...a.skipped); }
  if (!n) { toast(skipped.includes("gedreht") ? "Autoverkabelung geht nur bei ungedrehten Geräten." : "Autoverkabelung: alle Pole sind schon verbunden oder es fehlen Hauptlinien bzw. Klemmen darunter."); return; }
  pushUndo(snap0); afterChange();
  toast(`Autoverkabelung: ${n} Leitung${n === 1 ? "" : "en"} gezogen.${skipped.length ? ` Nicht verbunden: ${[...new Set(skipped)].join(", ")}.` : ""}`);
}
// Prinzipschema, Knopf «Verdrahten» (CJ 21.10.2026): am gewählten LS, FI oder FI/LS links eine Leitung waagrecht bis zur nächsten
// senkrechten Leitung (Steigleitung), rechts Leitung, Leitungsangabe (Striche aus der Polzahl) und Verbraucher 30 mm weiter.
// Seiten mit schon angeschlossener Leitung bleiben, wie sie sind. Ein Rückgängig-Schritt.
const pzStriche = (pol) => { const m = /^\s*(\d)?\s*L?\s*(N)?/i.exec(pol || "LN"); return Math.min(5, Math.max(1, Number(m[1] || 1) + (m[2] ? 1 : 0) + 1)); }; // + PE
function pzWire(dev) {
  if (dev.rot) { toast("Verdrahten geht nur bei ungedrehten Geräten (waagrechter Abgang)."); return; }
  const sym = SYMBOL_BY_NAME[dev.sym], y = dev.y, xl = dev.x, xr = dev.x + sym.pins[1].x;
  const wires = S.model.items.filter((i) => i.type === "wire");
  const used = (x) => wires.some((w) => [w.pts[0], w.pts.at(-1)].some((p) => p[0] === x && p[1] === y));
  let riser = null;
  for (const w of wires) for (let i = 0; i + 1 < w.pts.length; i++) {
    const [[x1, y1], [x2, y2]] = [w.pts[i], w.pts[i + 1]];
    if (x1 === x2 && x1 < xl && y >= Math.min(y1, y2) && y <= Math.max(y1, y2) && (riser === null || x1 > riser)) riser = x1;
  }
  const add = [], notes = [];
  if (used(xl)) notes.push("links schon verbunden"); else if (riser === null) notes.push("links keine Steigleitung gefunden");
  else add.push({ type: "wire", kind: S.wireKind, pts: [[riser, y], [xl, y]] });
  if (used(xr)) notes.push("rechts schon verbunden");
  else {
    const n = pzStriche(dev.attrs.POL);
    add.push({ type: "wire", kind: S.wireKind, pts: [[xr, y], [xr + 20, y]] },
      { type: "symbol", sym: "PZ_LEITUNG", x: xr + 20, y, rot: 0, attrs: { KABEL: `${n}x1,5mm²` } },
      { type: "wire", kind: S.wireKind, pts: [[xr + 25, y], [xr + 30, y]] },
      { type: "symbol", sym: "PZ_VERBR", x: xr + 30, y, rot: 0, attrs: { TEXT: "Verbraucher" } });
  }
  if (!add.length) { toast(`Verdrahten: nichts zu tun (${notes.join(", ")}).`); return; }
  change(() => S.model.items.push(...add.map((it) => ({ id: nextId(), ...it }))));
  toast(`Verdrahtet.${notes.length ? ` ${notes.join(", ")}.` : ""}`);
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
  if (ELPLEXA && isPlan()) { PL.del(); return; }
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
  if (ELPLEXA && isPlan()) return;
  if (S.tool === "place") { S.placeRot = (S.placeRot + 90) % 360; renderOverlay(); return; }
  if (S.tool === "text" && isSchema()) { S.textR = ((S.textR || 0) + 90) % 360; renderRight(); updateHint(); return; } // nächster Text gedreht (CJ 19.10.2026)
  const syms = selectedItems().filter((i) => i.type === "symbol"), texts = isSchema() ? selectedItems().filter((i) => i.type === "text") : [];
  if (syms.length || texts.length) change(() => { syms.forEach((i) => { i.rot = (i.rot + 90) % 360; }); texts.forEach((i) => { const r = ((i.r || 0) + 90) % 360; if (r) i.r = r; else delete i.r; }); }, { panel: texts.length > 0 });
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
  if (ELPLEXA && isPlan()) return;
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
  const devs = isDispo() ? [] : movers.filter((i) => i.type === "symbol" || i.type === "terminals" || i.type === "ctrl");
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
  else change(() => { const id = nextId(); S.model.items.push({ id, type: "text", x: e.x, y: e.y, h: textH(), s: v, ...(isPv() ? { layer: PV.activeLayer() } : {}), ...(S.textC && isSchema() ? { c: S.textC } : {}), ...(S.textR && isSchema() ? { r: S.textR } : {}), ...(S.textAl && isSchema() ? { al: S.textAl } : {}) }); });
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
  if (ELPLEXA && isPlan()) { PL.tap(w); return; }
  const hit = isPv() ? hitTest(w.x, w.y, PV.layerPick(), 14) : hitTest(w.x, w.y, pickable(), 14);
  S.sel = hit ? new Set(groupIds(hit, false)) : new Set();
  renderRight(); renderOverlay();
} });
stage.addEventListener("pointerdown", (e) => {
  if (touch.down(e)) return;
  if (e.target.closest("#zoombar, #sheetbar, #of-view") || e.target === editor) return; // Offerte: Tabelle bedient sich selbst
  if (!editor.hidden) closeEditor(true);
  svg.focus({ preventScroll: true });
  const { sx, sy } = pointerPos(e);
  if (e.button === 1 || S.tool === "hand" || S.space || ELPLEXA && S.shared) { S.drag = { type: "pan", sx, sy, vx: S.view.x, vy: S.view.y }; stage.setPointerCapture(e.pointerId); svg.classList.add("cursor-grabbing"); return; }
  if (ELPLEXA && isPlan()) { if (e.button === 0) { stage.setPointerCapture(e.pointerId); PL.down(toWorld(sx, sy), e); } return; }
  if (e.button === 2) { if (S.wireDraft) finishWire(); else if (S.tool === "place") setTool("select"); return; }
  if (e.button !== 0) return;
  if (isDeck()) { deckTap(e.target); return; }
  stage.setPointerCapture(e.pointerId);
  const w = toWorld(sx, sy);
  const add = e.metaKey || e.ctrlKey; // ⌘ + Klick oder Rahmen ergänzt die Auswahl bzw. wählt einzeln ab; Stringplan nur aktive Ebene (5o), Disposition seit 19.10.2026, überall seit 19.10.2026 (CJ 18.10.)
  const ha = S.tool === "select" && !e.shiftKey && !add ? handleAt(w.x, w.y) : null;
  if (ha) {
    const o = JSON.parse(JSON.stringify(ha.it));
    S.drag = { type: "handle", it: ha.it, h: ha.h, orig: o, px: sx, py: sy, started: false, snap: snapshot(),
      rails: ha.it.type === "plate" ? D.contained(S.model.items, ha.it).filter((i) => i.type === "rail" && !i.free).map((r) => ({ r, o: { ...r }, full: D.railIsFull(r, ha.it) })) : [],
      plate: ha.it.type === "rail" && !ha.it.free ? plateAt(o.x + o.len / 2, o.y) : null }; // freie Schiene: ohne Plattenrand
  } else if (S.tool === "select" && !e.shiftKey && !add && !hitTest(w.x, w.y) && autoDimPick(w.x, w.y)) { // automatisches Mass wählen (ausblenden mit Entf)
    S.sel.clear(); S.dimSel = autoDimPick(w.x, w.y); renderRight(); renderOverlay();
  } else if (massAt(w.x, w.y) && !hitTest(w.x, w.y)) { /* Mass: Doppelklick öffnet die Eingabe, die Auswahl bleibt */
  } else if (isPv() && S.tool === "select" && !e.shiftKey && !add && PV.gripAt(w)) {
    const g = PV.gripAt(w); // Punkt einer Dachlinie, Sperrfläche oder Leitung ziehen, oder Text eines Punkts (label)
    S.drag = { type: "pvvertex", it: g.it, i: g.i, label: !!g.label, px: sx, py: sy, started: false, snap: snapshot() };
  } else if (S.tool === "select" && !e.shiftKey && !add && shapeHandleAt(w.x, w.y)) {
    const g = shapeHandleAt(w.x, w.y); // Griff einer gewählten Form ziehen
    S.drag = { type: "shapeh", it: g.it, h: g.h, orig: JSON.parse(JSON.stringify(g.it)), px: sx, py: sy, started: false, snap: snapshot() };
  } else if (S.tool === "select" && !e.shiftKey && !add && vertexAt(w.x, w.y)) {
    const v = vertexAt(w.x, w.y);
    S.drag = { type: "vertex", w: v.w, i: v.i, pts: v.w.pts.map((p) => [...p]), px: sx, py: sy, started: false, snap: snapshot() };
  } else if (S.tool === "select") {
    S.dimSel = null;
    const hit = isPv() ? hitTest(w.x, w.y, PV.layerPick()) : hitTest(w.x, w.y); // Stringplan: Klick, Shift und ⌘ nur auf der aktiven Ebene (5s)
    const other = add && isPv() && !hit && hitTest(w.x, w.y, PV.otherLayers());
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
    const c = snap(w.x, w.y, { pins: false, mag: S.placeSym !== CTRL, offX: placeOffX() }); // Steuerkasten: nur Raster, damit seine Klemmen auf dem Raster liegen
    if (templateOf(S.placeSym)) addAbgang(templateOf(S.placeSym), colOf(w.x));
    else if (S.placeSym === TERMINALS) addTerminals(c.x, c.y); else if (S.placeSym === CTRL) change(() => S.model.items.push({ id: nextId(), ...newCtrl(c.x, c.y) })); else addSymbol(S.placeSym, c.x, c.y, S.placeRot);
  } else if (S.tool === "wire") {
    let c = snap(w.x, w.y, { mag: true });
    // Start an einem Pin eines mehrpoligen Geräts: so viele Leiter wie Pole (Bündel), Alt = nur ein Leiter. Am Ende (Fang) wird ein
    // einzelner Leiter nicht zum Bündel (CJ 18.10.2026: „am Fang nichts automatisch“); ein Bündel rastet dort mit allen Polen ein.
    const g = c.pin && !e.altKey && poleSnap() ? R.poleGroup(S.model.items, c.x, c.y) : null;
    if (g) c = { ...c, x: g.x, y: g.y };
    if (!S.wireDraft) S.wireDraft = { pts: [[c.x, c.y]], n: g && S.bundleN === 1 ? g.n : 0, pin: !!c.pin };
    else {
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
  if (ELPLEXA && isPlan()) { PL.move(w, e); $("#coords").textContent = `x ${Math.round(w.x)}  y ${Math.round(w.y)} mm`; return; }
  S.alt = e.altKey;
  S.mouse = isPv() ? PV.snap(w) : isDispo() ? dispoSnap(w.x, w.y) : shapeTool(S.tool) ? shapeSnap(w) : snap(w.x, w.y, { pins: S.tool === "wire", mag: S.tool !== "select" && S.tool !== "hand" && !(S.tool === "place" && S.placeSym === CTRL), offX: S.tool === "place" ? placeOffX() : 0 });
  if (S.tool === "wire" && S.mouse.pin && !e.altKey && poleSnap()) { const g = R.poleGroup(S.model.items, S.mouse.x, S.mouse.y); if (g) S.mouse = { ...S.mouse, x: g.x, y: g.y }; }
  $("#coords").textContent = `x ${fmt(w.x)}  y ${fmt(w.y)} mm`;
  if (d && d.type === "move") {
    if (!d.started && Math.hypot(sx - d.px, sy - d.py) > 3) d.started = true;
    if (d.started) {
      const g = altGrid(e) ? S.grid.size : 0.1; // Alt schaltet das Raster beim Ziehen um
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
    if (d.started) { dragHandle(d, dragSnap(e, w.x, w.y, false)); renderItems(); }
  } else if (d && d.type === "shapeh") {
    if (!d.started && Math.hypot(sx - d.px, sy - d.py) > 3) d.started = true;
    if (d.started) { dragShapeHandle(d.it, d.orig, d.h, shapeSnap(w)); renderItems(); }
  } else if (d && d.type === "vertex") {
    if (!d.started && Math.hypot(sx - d.px, sy - d.py) > 3) d.started = true;
    if (d.started) {
      const end = d.i === 0 || d.i === d.pts.length - 1, c = dragSnap(e, w.x, w.y, end, d.w), q = d.pts[d.i];
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
  if (ELPLEXA && isPlan()) PL.up();
  if (f?.down) { const { sx, sy } = pointerPos(e); f.down = false; if (Math.hypot(sx - f.px, sy - f.py) > 3 && S.mouse) finishShape(S.mouse, e.shiftKey); } // gezogen: Loslassen setzt die Form
  endDrag(e);
});
stage.addEventListener("pointercancel", (e) => { if (!touch.up(e)) endDrag(e); });
stage.addEventListener("pointerleave", () => { if (!S.drag) { S.mouse = null; renderOverlay(); } });
stage.addEventListener("contextmenu", (e) => e.preventDefault());
stage.addEventListener("dblclick", (e) => {
  if (ELPLEXA && (S.shared || isPlan())) return; // Plan: Doppelklick erkennt planedit.js selbst (Leitung beenden, Beschriftung zurück)
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
  if (isOff()) return; // Offerte: Tabelle scrollt normal (#of-view), kein Verschieben der Zeichenfläche
  e.preventDefault();
  const { sx, sy } = pointerPos(e);
  if (e.ctrlKey || e.metaKey) zoomAt(sx, sy, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.004)));
  else { S.view.x -= e.deltaX; S.view.y -= e.deltaY; applyView(); renderOverlay(); }
}, { passive: false });

// ---------- Tastatur ----------
// Tasten 1 bis 4 und N (CJ 16.10.): beim Setzen die Variante des neuen Symbols, sonst die des einen gewählten Symbols
// Prinzipschema: Tasten 1, 2, 3 und N setzen die Polzahl (Feld POL) beim Setzen bzw. an den gewählten Schutzgeräten
// Sicherung (CJ 23.10.2026): die Tasten wechseln die Variante (Striche im Rechteck), die Zeile Polzahl geht mit
function pzPolKey(key) {
  if (/^[1-5]$/.test(key)) { // Leitungsangabe: Anzahl Leiter vorne im Text, beim Setzen oder für alle markierten
    if (S.tool === "place" && S.placeSym === "PZ_LEITUNG") { S.pzLeiter = Number(key); renderRight(); updateHint(); return true; }
    const ls = S.tool === "select" ? selectedItems().filter((i) => i.type === "symbol" && i.sym === "PZ_LEITUNG") : [];
    if (ls.length) { change(() => { for (const it of ls) it.attrs.KABEL = kabelN(it.attrs.KABEL, key); }); return true; }
  }
  if (!/^[123nN]$/.test(key)) return false;
  if (S.tool === "place" && isSich(S.placeSym)) {
    S.placeSym = sichName(polNext(SYMBOL_BY_NAME[S.placeSym].attrs.find((a) => a.tag === "POL").def, key)); renderLeft(); renderRight(); renderOverlay(); updateHint(); return true;
  }
  if (S.tool === "select") {
    const fs = selectedItems().filter((i) => i.type === "symbol" && isSich(i.sym));
    if (fs.length) change(() => { for (const it of fs) { it.attrs.POL = polNext(it.attrs.POL, key); it.sym = sichName(it.attrs.POL); } });
    if (fs.length && !selectedItems().some((i) => i.type === "symbol" && PZ_POL.includes(i.sym))) return true;
  }
  if (S.tool === "place") {
    if (!PZ_POL.includes(S.placeSym)) return false;
    (S.pzPol ||= {})[S.placeSym] = polNext(pzPolOf(S.placeSym), key); renderRight(); updateHint(); return true;
  }
  const sel = selectedItems().filter((i) => i.type === "symbol" && PZ_POL.includes(i.sym));
  if (S.tool !== "select" || !sel.length) return false;
  change(() => { for (const it of sel) it.attrs.POL = polNext(it.attrs.POL, key); });
  return true;
}
function poleKey(key) {
  if (isPrinzip()) return pzPolKey(key);
  if (isPv() || isDispo()) return false;
  if (S.tool === "place") {
    if (S.placeSym === TERMINALS || S.placeSym === CTRL || templateOf(S.placeSym)) return false;
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
  const root = t.closest("#right, #pv-pop, #el-hub, #of-view");
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
  if (isOff() && !mod && t instanceof HTMLElement && t.closest("#of-view, #left, #right")) return; // Offerte: Tasten gehören den Feldern und Knöpfen
  if (ELPLEXA && isPlan() && !typing && PL.key(e, mod)) { e.preventDefault(); return; } // Plan: Werkzeuge, Länge tippen, Pfeiltasten (planedit.js)
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
  if (e.key === "Alt") { S.alt = true; if (ELPLEXA && isPlan()) PL.mod(); }
  if (isPv() && e.key === "Tab" && !mod && !e.altKey && PV.cornerKey(e.shiftKey)) { e.preventDefault(); return; } // Bezugsecke bei Modul und Modulfeld (5x)
  if (isDispo() && e.key === "Tab" && !mod && !e.altKey && dispoCornerKey(e.shiftKey)) { e.preventDefault(); renderRight(); renderOverlay(); updateHint(); return; } // Bezugsecke neuer Platten (CJ 16.10.)
  if (isPv() && !mod && !e.altKey && PV.toolKey(e.key)) return; // S, P, E, B: Werkzeuge des Stringplans (Schritt 5d)
  if (!mod && !e.altKey && poleKey(e.key)) { e.preventDefault(); return; } // 1 bis 4 und N: Polzahl (CJ 16.10.)
  if (ELPLEXA && !mod && !e.altKey && elKey(e)) { e.preventDefault(); return; } // Module, Übersicht, Leisten, Hilfe
  if (e.altKey && !mod && e.code === "KeyV") { e.preventDefault(); autoWire(); return; } // Autoverkabelung (CJ 18.10.2026; e.code, weil Alt+V auf dem Mac „√“ tippt)
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
    case "/": if (!symFind.hidden) { e.preventDefault(); $("#sym-find").focus(); $("#sym-find").select(); } break;
    case "g": case "G": if (!mod) { e.preventDefault(); gotoSheet({ instant: true }); } break;
    case "PageUp": e.preventDefault(); if (e.shiftKey) jumpStar(-1); else stepSheet(-1); break;
    case "PageDown": e.preventDefault(); if (e.shiftKey) jumpStar(1); else stepSheet(1); break;
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
  if (e.key === "Alt") { S.alt = false; if (ELPLEXA && isPlan()) PL.mod(); }
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
  if (t.dataset.attr && one && selectedItems().length > 1 && sameSymbols(selectedItems())) { firstEdit(); for (const it of selectedItems()) it.attrs[t.dataset.attr] = t.value; if (t.dataset.attr === "BMK") renumberAll(S.doc); } // gleiche Symbole gemeinsam (CJ 23.10.)
  else if (t.dataset.attr && one) {
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
  else if (t.dataset.ctrl && one?.type === "ctrl") {
    const k = t.dataset.ctrl, v = k === "h" ? parseFloat(t.value) : t.value;
    if (k === "h" && !(v >= 10 && v <= 200)) return;
    firstEdit(); one[k] = v;
    if (k === "top" || k === "bot") { const hd = rightEl.querySelector(".prop-head p"); if (hd) hd.textContent = `${ctrlTerms(one.top).length + ctrlTerms(one.bot).length} Klemmen`; }
  }
  else if (t.dataset.tlab !== undefined && one?.type === "terminals") {
    firstEdit();
    const lab = Array.from({ length: termCount(one) }, (_, i) => one.lab?.[i] ?? "");
    lab[Number(t.dataset.tlab)] = cleanLab(t.value);
    if (lab.some(Boolean)) one.lab = lab; else delete one.lab;
  }
  else if (t.dataset.term && one && one.type === "terminals") {
    firstEdit();
    one[t.dataset.term] = t.value;
    if (t.dataset.term === "bmk" && one.of !== undefined) { one.manual = t.value.trim() !== ""; renumberAll(S.doc); }
    if (t.dataset.term === "cable") {
      const c = parseCable(t.value);
      if (c) one.n = c.n;
      if (c?.tel && one.pe !== "none") { one.pe = "none"; const pe = rightEl.querySelector("[data-termpe]"); if (pe) pe.value = "none"; } // Fernmeldekabel: ohne PE-Klemme
      const note = rightEl.querySelector("[data-cablenote]"); if (note) note.textContent = cableNote(one);
      const head = rightEl.querySelector(".prop-head p"); if (head) head.textContent = termCount(one) + " Klemmen";
      const tl = rightEl.querySelector(".tlab"); if (tl && tl.children.length !== termCount(one)) tl.innerHTML = termLabCells(one);
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
  if (t.dataset.pzopt !== undefined && isPrinzip()) { const np = PZ.paperFrom(S.model, t.dataset.pzopt, t.value); if (np) { change(() => { S.model.paper = np; }); fitView(); } return; } // Prinzipschema: Papier (Fenster Druck)
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
  if (t.dataset.dptfall !== undefined && isDispo()) { const v = parseFloat(t.value); if (v >= 10) setTfAll({ v }); return; } // Textgrösse für Auswahl oder ganzes Blatt (CJ 19.10.)
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
  else if (t.dataset.textr !== undefined && one?.type === "text") { pushUndo(); const r = Number(t.value); if (r) one.r = r; else delete one.r; afterChange(false); }
  else if (t.dataset.textal !== undefined && one?.type === "text") { pushUndo(); if (t.value) one.al = t.value; else delete one.al; afterChange(false); }
  else if (t.dataset.newtr !== undefined) S.textR = Number(t.value);
  else if (t.dataset.newtal !== undefined) S.textAl = t.value;
  else if (t.dataset.tvert !== undefined && one?.type === "terminals") { pushUndo(); if (t.checked) one.vert = true; else delete one.vert; afterChange(false); }
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
  ({ autowire: autoWire, pzwire: () => one && pzWire(one), rotate: rotateSelected, dup: duplicateSelected, del: deleteSelected, base: insertBase, feed: addFeed, addrail: addRail, align: () => alignSelected(b.dataset.m), delsheet: deleteSheet, dupsheet: duplicateSheet, gotitle: () => switchSheet(S.doc.sheets.indexOf(T.titleOf(S.doc))), golegend: () => { S.legSel = one?.id ?? null; switchSheet(S.doc.sheets.length - 1); }, relink: () => one && changeLink(one), unlink: () => one && change(() => unlinkRef(S.doc, one)), autorail: () => addAutoRails(one, Number(b.dataset.n), Number(b.dataset.p)), handover: handOver, gosrc: () => { const i = S.doc.sheets.findIndex((sh) => sh.kind === "dispo" && sh.sid === one?.src); if (i >= 0) switchSheet(i); } })[b.dataset.act]?.();
});

let addHeld = false, addTimer = 0; // langes Drücken auf + öffnet die Auswahl statt ein Blatt anzulegen
$("#sheetbar").addEventListener("click", (e) => {
  const step = e.target.closest("[data-step]"), ofs = e.target.closest("[data-ofstep]"), ofm = e.target.closest("[data-ofkap], [data-ofplus]");
  if (ofs) ofStep(Number(ofs.dataset.ofstep));
  else if (ofm) ofMenuOpen(ofm); // Kapitelliste, Variante oder Nachtrag
  else if (step) stepSheet(Number(step.dataset.step));
  else if (e.target.closest("[data-gosheet]")) sheetMenu.toggle($("#sheet-cur"));
  else if (e.target.closest("[data-starjump]")) jumpStar(1);
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
$("#add-menu").addEventListener("click", (e) => { const b = e.target.closest("[data-new]"); if (b) ({ dispo: addDispo, pv: addPv, pvtab: addPvTab, prinzip: addPrinzip, offerte: addOfferte, deck: addDeck }[b.dataset.new] || addSheet)(); });
// ---------- Firmenprofil beim Benutzer (profil.js, Offerte Schritt 2) ----------
// Abgleich mit online beim Start und wenn ein anderer Benutzer sich anmeldet (nicht bei jeder Erneuerung der Anmeldung)
let profUser = null;
async function profSync() {
  const u = cloudUser();
  if (u === profUser) return;
  profUser = u;
  try { if (await syncProfil()) profShown(); } catch { /* online nicht erreichbar: Stand im Browser gilt */ }
  try { await PD.sync(); } catch { /* Positionsdatenbank: Stand im Browser gilt */ }
  try { await syncSollwerte(); } catch { /* Sollwerte und IC-Zeiten: Stand im Browser gilt */ }
}
function profShown() { if (isOff()) renderRight(); if (ELPLEXA && EL_S.hub && !EL_S.hub.hidden && EL_S.tab === "profil") elHub(true, { keepFocus: true }); }
// Kalkulation Firmenwerte (sollwerte.js, Offerte Schritt 4): beim Benutzer, nicht in der Offerte. Bestehende Offerten bleiben gleich.
const kalkFirma = () => sollwerteDialog({ openModal, toast, parseNum: OF.parseNum }, { online: !!cloudUser() });
async function firmProfil() { if (await profilDialog({ openModal, toast }, { online: !!cloudUser() })) profShown(); }

// ---------- Offerte (offedit.js, CJ 26.10.2026) ----------
// Feld übernehmen: an einer Kopie prüfen, damit ungültige oder gleiche Werte keinen Schritt im Rückgängig anlegen (Feld zeigt dann den alten Wert)
function ofRefocus(sel) { const el = sel && document.querySelector(sel); if (!el) return; el.focus(); if (el.matches("input[type=text]")) el.select(); }
function ofChange(e) {
  const t = e.target;
  if (!isOff() || !(t instanceof HTMLElement) || !t.dataset.of) return;
  const c = structuredClone(S.model.of);
  if (!OF.apply(c, t) || JSON.stringify(c) === JSON.stringify(S.model.of)) { renderItems(); renderRight(); return; }
  change(() => { S.model.of = c; });
}
async function ofClick(e) {
  const b = e.target.closest?.("[data-ofact]");
  if (!isOff() || !b) return;
  if (b.dataset.ofact === "profil") { firmProfil(); return; }
  if (b.dataset.ofact === "sollwerte") { kalkFirma(); return; }
  if (b.dataset.ofact === "dbsave") { ofDbSave(Number(b.dataset.p)); return; }
  if (b.dataset.ofact === "import") { ofImport(); return; }
  if (b.dataset.ofact === "out") { offerteOut(S.model, b.dataset.kind, b.dataset.prices === "1"); return; } // PDF oder Excel (Schritt 5)
  if (b.dataset.ofact === "kapjump") { ofJumpKap(Number(b.dataset.k)); return; } // Kapitel des Knotens im Hauptbereich zeigen
  if (b.dataset.ofact === "lupe") { ofLupe(Number(b.dataset.p)); return; }
  if (b.dataset.ofact === "kndel" && !(await ofKnDelOk(Number(b.dataset.n)))) return;
  const r = OF.action(S.model.of, b); if (!r) return;
  if (r.ui) { renderItems(); if (r.top) { ofView.scrollTop = 0; ofPin = null; renderSheetBar(); } } else change(r.fn);
  ofRefocus(r.focus ? `[data-of="${r.focus()}"]` : r.keep);
}
for (const el of [ofView, leftEl, rightEl]) { el.addEventListener("change", ofChange); el.addEventListener("click", ofClick); }
for (const el of [ofView, rightEl]) el.addEventListener("keydown", (e) => { const t = e.target; if (isOff() && e.key === "Enter" && t.matches?.("input[type=text][data-of]")) { e.preventDefault(); const k = t.dataset.of; t.blur(); ofRefocus(`[data-of="${k}"]`); } }); // Enter übernimmt
for (const el of [leftEl]) el.addEventListener("keydown", (e) => { const t = e.target; if (isOff() && e.key === "Enter" && t.matches?.("input[type=text][data-of]")) { e.preventDefault(); const k = t.dataset.of; t.blur(); ofRefocus(`[data-of="${k}"]`); } }); // Titel des Knotens: Enter übernimmt
leftEl.addEventListener("input", (e) => { const id = e.target.id; if (!isOff() || id !== "of-bkpfind") return; OF.setBkpFind(e.target.value); renderLeftBody(); const f = $(`#${id}`); f.focus(); f.setSelectionRange(f.value.length, f.value.length); });
// Linke Spalte neu zeichnen, der Fokus bleibt auf demselben Feld oder Knopf
function ofLeft() {
  const a = document.activeElement, sel = leftEl.contains(a) ? (a.dataset.of ? `[data-of="${a.dataset.of}"]` : a.id ? `#${a.id}` : a.dataset.ofact ? `[data-ofact="${a.dataset.ofact}"]${a.dataset.n ? `[data-n="${a.dataset.n}"]` : ""}${a.dataset.area ? `[data-area="${a.dataset.area}"]` : ""}` : null) : null;
  leftEl.innerHTML = OF.leftHTML(S.model.of);
  if (sel) leftEl.querySelector(sel)?.focus();
}
// Knoten löschen: mit allem darunter. Hat er Positionen, fragt die App (Rückgängig geht trotzdem).
async function ofKnDelOk(id) {
  const of = S.model.of, ids = O_knSub(of, id), n = of.kap.filter((k) => ids.has(k.kn)).reduce((s, k) => s + k.grp.reduce((a, g) => a + g.pos.length, 0), 0);
  return !n || confirmDialog("Knoten löschen?", `«${O_knFind(of, id)?.titel || "Ohne Titel"}» wird mit allen Knoten darunter, ${n} Position${n === 1 ? "" : "en"} und ihren Kapiteln gelöscht.`, "Löschen");
}
// Lupe (CJ 26.10.2026): Positionsdatenbank im Fenster. Ein Treffer füllt die Position; hat sie schon Inhalt, fragt die App «ersetzen» oder «darunter einfügen».
async function ofLupe(pid) {
  const root = $("#modal-root"), list = () => root.querySelector("[data-dbhits]");
  const body = `<div class="field"><input type="text" id="of-dbfind" placeholder="Titel, Text, E-Nr., Hersteller, NPK" aria-label="Positionen suchen" autocomplete="off" spellcheck="false"></div>`
    + `<div class="of-dblist" role="list" data-dbhits>${OF.dbHitsHTML("")}</div><div class="actions"><button class="btn outline" data-c>Abbrechen</button></div>`;
  const find = () => { const l = list(); if (l) l.innerHTML = OF.dbHitsHTML(root.querySelector("#of-dbfind")?.value || ""); };
  const ask = openModal("Position aus der Datenbank", body, async (b, done) => {
    if (b.dataset.c !== undefined) done(null);
    else if (b.dataset.dbpick) done(b.dataset.dbpick);
    else if (b.dataset.dbdel) { // zweiter Klick löscht
      if (b.dataset.sure === undefined) { b.dataset.sure = ""; b.textContent = "Löschen?"; b.classList.remove("icon"); return; }
      await PD.remove(b.dataset.dbdel); find();
    }
  }, null, "#of-dbfind", "of-dbmodal");
  root.addEventListener("input", find);
  const id = await ask;
  root.removeEventListener("input", find);
  const e = id && PD.list().find((x) => x.id === id), p = e && O_findPos(pid); if (!p) return;
  let how = "replace";
  if (OF.hasContent(p)) {
    how = await openModal("Position hat schon Inhalt", `<p>«${R.esc(e.titel || e.text)}» übernehmen:</p><div class="actions"><button class="btn outline" data-c>Abbrechen</button><button class="btn outline" data-h="below">Darunter einfügen</button><button class="btn primary" data-h="replace">Ersetzen</button></div>`,
      (b, done) => { if (b.dataset.h) done(b.dataset.h); else if (b.dataset.c !== undefined) done(null); }, null, '[data-h="replace"]');
    if (!how) return;
  }
  let n; change(() => { n = OF.dbFill(S.model.of, pid, e, how); });
  if (n) ofRefocus(`[data-of="p${n.id}.menge"]`);
}
// Ziehen (CJ 26.10.2026): Positionen und Gruppen verschieben, auch über Gruppen und Kapitel hinweg. Ein Schritt im Rückgängig.
let ofDrag = null, ofMark = null;
const ofMarkSet = (t) => { if (ofMark && (!t || ofMark.el !== t.el || ofMark.mark !== t.mark)) ofMark.el.classList.remove("drop-before", "drop-after", "drop-in"); ofMark = t; if (t) t.el.classList.add(`drop-${t.mark}`); };
const ofDragEnd = () => { ofMarkSet(null); ofView.querySelector(".dragging")?.classList.remove("dragging"); ofDrag = null; };
ofView.addEventListener("dragstart", (e) => {
  const h = e.target.closest?.("[data-drag]"); if (!isOff() || !h) return;
  ofDrag = h.dataset.drag; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", ofDrag);
  h.closest(ofDrag[0] === "p" ? "tr" : ".of-grp").classList.add("dragging");
});
ofView.addEventListener("dragover", (e) => { if (!ofDrag) return; const t = OF.dropAt(ofDrag, e.target, e.clientY); ofMarkSet(t); if (t) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } });
ofView.addEventListener("drop", (e) => {
  if (!ofDrag) return; e.preventDefault();
  const t = OF.dropAt(ofDrag, e.target, e.clientY); ofDragEnd();
  const c = structuredClone(S.model.of);
  if (t && t.fn(c)) change(() => { S.model.of = c; });
});
ofView.addEventListener("dragend", ofDragEnd);
// Positionsdatenbank (positionen.js, Offerte Schritt 3): Position speichern oder Eintrag löschen. Ändert die Offerte nicht.
async function ofDbSave(pid) {
  const p = O_findPos(pid); if (!p) return;
  const r = await PD.save({ ...p, bkp: O_bkpOf(S.model.of, pid) || undefined }); // BKP aus dem Kapitel als Hinweis in der Datenbank
  if (!r) { toast("Ohne Text gibt es nichts zu speichern.", "error"); return; }
  toast(`${r.neu ? "In der Datenbank gespeichert" : "Eintrag in der Datenbank ersetzt"}${r.wo === "lokal" && cloudUser() ? " (vorerst nur im Browser)" : ""}.`);
}
const O_findPos = (pid) => { for (const k of S.model.of.kap) for (const g of k.grp) { const p = g.pos.find((x) => x.id === pid); if (p) return p; } return null; };
sheetMenu = makeMenu($("#sheet-menu"), { up: true, beforeShow: () => closeEditor(true), onOpen: () => { $("#sheet-find").value = ""; renderSheetList(); $("#sheet-find").focus(); $("#sheet-menu .mi.on")?.scrollIntoView({ block: "nearest" }); } });
$("#sheet-find").addEventListener("input", renderSheetList);
// Blattmenü (CJ 18.10.2026): Rechtsklick oder gedrückt halten auf dem Blattnamen, einer Zeile der Blattliste oder (elplexaCAD) einer
// Blatt-Kachel der Übersicht. data-ctx = Index des Blatts. Gedrückt halten wie beim Plus-Knopf (450 ms), der folgende Klick fällt weg.
let ctxSheet = -1, ctxHub = false, ctxTimer = 0, ctxHeld = false;
const CTX_SEL = "[data-ctx], [data-modctx], [data-projctx], [data-savectx], [data-hold]";
// Klick-Regel überall (CJ 18.10.2026): kurzer Klick = Standard, Rechtsklick oder gedrückt halten (450 ms) = Menü, gleich wie beim
// Plus-Knopf und am Blattnamen. Elemente mit data-hold: Werkzeug Leitung (Leiterzahl, Art), Text (Drehung, Ausrichtung),
// Speichern (v3: Speichern unter), Exportieren (Klick öffnet hier schon das Menü, es gibt keinen Standard).
const holdEl = document.createElement("div"); holdEl.className = "menu"; holdEl.id = "hold-menu"; holdEl.setAttribute("role", "menu"); holdEl.hidden = true; $("#app").append(holdEl);
const holdMenu = makeMenu(holdEl, { left: true, beforeShow: () => closeEditor(true) });
const holdMi = (act, title, on = false, sub = "") => `<button class="mi${on ? " on" : ""}" role="menuitem" data-hact="${act}" tabindex="-1" aria-checked="${on}"><span class="mt"><span class="mh">${R.esc(title)}</span>${sub ? `<span class="ms">${R.esc(sub)}</span>` : ""}</span></button>`;
function holdHTML(k) {
  if (k === "wire") return `<div class="ctx-head">Leitung: Leiter pro Zug</div>` + Object.entries(BUNDLE_LABELS).map(([n, l]) => holdMi(`b:${n}`, l, Number(n) === S.bundleN)).join("")
    + `<div class="ctx-head">Art der Leitung</div>` + Object.entries(WIRE_KINDS).map(([v, o]) => holdMi(`k:${v}`, o.label, v === S.wireKind)).join("");
  if (k === "text") return `<div class="ctx-head">Text: Drehung</div>` + [0, 90, 180, 270].map((v) => holdMi(`r:${v}`, `${v}°`, (S.textR || 0) === v)).join("")
    + `<div class="ctx-head">Ausrichtung</div>` + [["", "Links"], ["c", "Mittig"], ["r", "Rechts"]].map(([v, l]) => holdMi(`a:${v}`, l, (S.textAl || "") === v)).join("");
  if (k === "star") return `<div class="ctx-head">Markierte Blätter (★)</div>` + pinned().map((i) => holdMi(`go:${i}`, `${sheetLabel(S.doc.sheets[i], i)}${S.doc.sheets[i].meta.TITEL && !T.isDeck(S.doc.sheets[i]) ? ` · ${S.doc.sheets[i].meta.TITEL}` : ""}`, i === S.active)).join("");
  return holdMi("save", "Speichern", false, "In die geöffnete Datei (⌘S)") + holdMi("as", "Speichern unter …", false, "Neue Datei wählen (⇧⌘S)");
}
function holdOpen(el) {
  const k = el.dataset.hold;
  if (k === "export") { exportMenu.show(el); return; }
  holdEl.dataset.k = k; holdEl.setAttribute("aria-label", k === "save" ? "Speichern" : el.textContent.trim());
  holdEl.innerHTML = holdHTML(k); holdMenu.show(el);
  const r = el.getBoundingClientRect(); // unten kein Platz (Blattleiste): über dem Knopf
  if (holdEl.getBoundingClientRect().bottom > innerHeight - 8) holdEl.style.top = `${Math.max(8, r.top - 4 - holdEl.offsetHeight)}px`;
}
holdEl.addEventListener("click", (e) => {
  const a = e.target.closest("[data-hact]")?.dataset.hact; if (!a) return;
  const [t, v] = a.split(":");
  if (t === "save" || t === "as") { saveJson(t === "as"); return; }
  if (t === "go") { switchSheet(Number(v)); return; }
  if (t === "b") S.bundleN = Number(v); else if (t === "k") S.wireKind = v; else if (t === "r") S.textR = Number(v); else if (t === "a") S.textAl = v;
  const tool = t === "b" || t === "k" ? "wire" : "text";
  if (S.tool !== tool) setTool(tool); else { renderRight(); renderOverlay(); updateHint(); }
});
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
const ctxOpen = (el) => (ELPLEXA && S.shared ? null : el.dataset.projctx ? elProjCtx(el) : el.dataset.hold !== undefined ? holdOpen(el) : el.dataset.savectx !== undefined ? ELPLEXA && EL_S.saveCtx.show(el) : el.dataset.modctx ? ELPLEXA && elModCtx(el) : openCtx(el)); // Speichern-Knopf, Modul-Kachel (elplexaCAD) oder Blatt
document.addEventListener("contextmenu", (e) => { const el = e.target.closest?.(CTX_SEL); if (el) { e.preventDefault(); clearTimeout(ctxTimer); ctxOpen(el); } });
document.addEventListener("pointerdown", (e) => {
  ctxHeld = false; clearTimeout(ctxTimer);
  const el = e.target.closest?.(CTX_SEL);
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
// Blätter umsortieren (CJ 18.10.2026): in der Blattliste eine Zeile ziehen oder Alt+Pfeil. Nur innerhalb derselben Art und desselben
// Moduls (gleicher Rang in titel.js), die Arten bleiben in ihrer festen Folge. Wunsch D3 (CJ 19.10.2026): das Blatt nimmt die Nummer
// seines neuen Platzes, die folgenden zählen bis zur nächsten Lücke hoch (T.renumberMoved); BMK folgen über renumberAll in change.
// Übergebene Dispo (CJ 19.10.2026): lässt sich zwischen Schemablätter ziehen (Feld ins = Schema-Modul) und auf eine andere Dispo zurück.
function crossMove(A, B) {
  if (A?.kind !== "dispo" || !B) return false;
  if (!B.kind || (B.kind === "dispo" && B.ins)) return T.handedOver(S.doc).has(A.sid) && (B.kind ? B.ins : B.var || 1) !== A.ins ? "in" : false;
  return B.kind === "dispo" && A.ins && !B.ins ? "out" : false;
}
const canMove = (a, b) => a !== b && S.doc.sheets[a] && S.doc.sheets[b] && !T.isDeck(S.doc.sheets[a]) && (T.sheetRank(S.doc.sheets[a]) === T.sheetRank(S.doc.sheets[b]) || !!crossMove(S.doc.sheets[a], S.doc.sheets[b]));
function moveSheet(from, to, after = false) { // after: hinter das Zielblatt (Alt+↑ über die Legende hinweg)
  if (!canMove(from, to)) return false;
  const moved = S.doc.sheets[from];
  let re = [];
  change(() => {
    const cur = S.model, A = S.doc.sheets[from], B = S.doc.sheets[to], cross = T.sheetRank(A) !== T.sheetRank(B) && crossMove(A, B);
    const g0 = cross ? undefined : S.doc.sheets.filter((s) => T.sheetRank(s) === T.sheetRank(A)).indexOf(A); // von aussen: gilt wie nach vorn
    if (cross === "in") A.ins = B.kind ? B.ins : B.var || 1; else if (cross === "out") delete A.ins;
    const [sh] = S.doc.sheets.splice(from, 1); S.doc.sheets.splice(after && from > to ? to + 1 : to, 0, sh); S.active = S.doc.sheets.indexOf(cur); // offenes Blatt bleibt offen
    const rank = T.sheetRank(sh), grp = S.doc.sheets.filter((s) => T.sheetRank(s) === rank);
    re = T.renumberMoved(grp, grp.indexOf(sh), g0);
  }, { panel: false });
  if (re.length) { renderRight(); toast(`Neue Blattnummer: ${re.map((s) => sheetLabel(s, S.doc.sheets.indexOf(s))).join(", ")}.`); }
  if (sheetMenu.open) { renderSheetList(); document.querySelector(`#sheet-menu [data-sheet="${S.doc.sheets.indexOf(moved)}"]`)?.focus(); }
  return true;
}
let sDrag = null, sDragJust = false; // { from, y, on, el, to }
$("#sheet-menu .slist").addEventListener("pointerdown", (e) => {
  const b = e.target.closest("[data-sheet]");
  if (!b || e.button !== 0 || $("#sheet-find").value.trim()) return; // gefilterte Liste: nicht ziehen
  sDrag = { from: Number(b.dataset.sheet), y: e.clientY, on: false, el: null };
});
document.addEventListener("pointermove", (e) => {
  if (!sDrag) return;
  if (!sDrag.on && Math.abs(e.clientY - sDrag.y) > 6) { sDrag.on = true; clearTimeout(ctxTimer); document.querySelector(`#sheet-menu [data-sheet="${sDrag.from}"]`)?.closest(".srow").classList.add("drag-src"); }
  if (!sDrag.on) return;
  const row = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("#sheet-menu [data-sheet]"), to = row ? Number(row.dataset.sheet) : -1;
  sDrag.el?.classList.remove("drop-above", "drop-below");
  sDrag.el = canMove(sDrag.from, to) ? row.closest(".srow") : null;
  sDrag.el?.classList.add(to < sDrag.from ? "drop-above" : "drop-below"); sDrag.to = to;
});
document.addEventListener("pointerup", () => {
  const d = sDrag; sDrag = null; if (!d?.on) return;
  document.querySelectorAll("#sheet-menu .drag-src, #sheet-menu .drop-above, #sheet-menu .drop-below").forEach((el) => el.classList.remove("drag-src", "drop-above", "drop-below"));
  sDragJust = true; setTimeout(() => { sDragJust = false; }, 0); // der folgende Klick öffnet das Blatt nicht
  if (d.el) moveSheet(d.from, d.to);
});
$("#sheet-menu").addEventListener("keydown", (e) => {
  const b = e.target.closest?.("[data-sheet]");
  if (!b || !e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
  e.preventDefault(); e.stopPropagation();
  const rows = [...document.querySelectorAll("#sheet-menu [data-sheet]")].map((r) => Number(r.dataset.sheet)), i = rows.indexOf(Number(b.dataset.sheet));
  const d = e.key === "ArrowUp" ? -1 : 1;
  let j = i + d; while (rows[j] !== undefined && T.isDeck(S.doc.sheets[rows[j]]) && !canMove(rows[i], rows[j])) j += d; // übergebene Dispo springt über die Legende
  const to = rows[j];
  if (to !== undefined && !moveSheet(rows[i], to, j !== i + d)) toast("Nur innerhalb derselben Blattart und desselben Moduls verschiebbar, übergebene Dispos auch zwischen die Schemablätter.");
}, true);
$("#sheet-menu").addEventListener("click", (e) => {
  const sa = e.target.closest("[data-sheetact]");
  if (sa) { (sa.dataset.sheetact === "dup" ? duplicateSheet : deleteSheet)(); return; } // aktives Blatt (CJ 18.10.2026)
  if (sDragJust) return;
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
  popKind = b.dataset.pop; popEl.setAttribute("aria-label", { mod: "Module", wr: "Wechselrichter", druck: "Druck", haupt: "Hauptlinien", ansicht: "Ansicht" }[popKind]);
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
const sideEl = (side) => (side === "left" ? $("#left") : rightEl);
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
$("#btn-export").dataset.hold = "export"; // Rechtsklick oder halten öffnet dasselbe Menü (Klick-Regel)
if (!ELPLEXA) { $("#btn-save").dataset.hold = "save"; $("#btn-save").title = "Speichern (⌘S). Rechtsklick oder gedrückt halten: Speichern unter …"; }
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
// Offerte im PDF und Excel (Schritt 5): Absender aus dem Firmenprofil, Kunde aus den Projektfeldern Bauherr, Projektname
const offCtx = () => ({ profil: loadProfil(), kunde: E.bauherrInfo(S.doc) || {}, projekt: (ELPLEXA && S.doc.project?.name) || S.doc.sheets.find((sh) => sh.kind === "title")?.meta?.OBJEKT || "" });
const { hasFS, safeName, baseName, download, saveJson, loadText, openJson, saveDxf, saveDxfAll, buildPrint, printPdf, printLegend, offerteOut } = makeFiles({ S, $, adoptDeck, markDirty, docText, toast, confirmDialog, closeEditor, setFileName, markClean, updateUndoButtons, setTool, renderSheetBar, renderSheet, renderItems, renderOverlay, renderRight, afterSheetChange, pv: PV, sheetLabel, offCtx });

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
  elCurT = null;
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
const EL_S = { tab: "projekte", pview: true, pf: {}, hub: null, last: {}, lastOf: {}, modMenu: null, addMenu: null };
const elMod = () => E.moduleOf(S.model);
const elIdx = () => E.modIdx(S.doc, elMod());
function elSheetBar() {
  const a = S.active, sh = S.model, idx = elIdx(), pos = idx.indexOf(a), m = E.modById(elMod());
  $("#btn-dxf-all").hidden = S.doc.sheets.length < 2;
  const open = sheetMenu?.open, keep = document.activeElement?.closest?.("#sheetbar") && document.activeElement.id;
  const mn = S.doc.mods?.[elMod()]?.name || `${m.short || m.label}${varOf(sh) > 1 && !T.isDeck(sh) ? ` ${varOf(sh)}` : ""}`; // eigener Name des Moduls (18.10.2026)
  const mod = `<span class="el-sbmod" title="Modul ${R.esc(modName(S.doc, elMod()))}"><span class="el-dot" style="background:${m.color}" aria-hidden="true"></span>${R.esc(mn)}</span>`;
  if (isOff()) { // Offerte: Inhaltsverzeichnis (Kapitel), Plus = Variante oder Nachtrag
    const t = ofTargets(), i = Math.min(ofCur(), t.length - 1);
    $("#sheetbar").innerHTML = mod + `<button class="sheettab nav" data-ofstep="-1" title="Vorheriges Kapitel (Bild auf)" aria-label="Vorheriges Kapitel"${i <= 0 ? " disabled" : ""}>‹</button>`
      + ofKapBtn() + `<button class="sheettab nav" data-ofstep="1" title="Nächstes Kapitel (Bild ab)" aria-label="Nächstes Kapitel"${i >= t.length - 1 ? " disabled" : ""}>›</button>` + ofPlusBtn() + starBtn();
    if (keep) document.getElementById(keep)?.focus();
    return;
  }
  $("#sheetbar").innerHTML = mod
    + `<button class="sheettab nav" data-step="-1" title="Vorheriges Blatt im Modul (Bild auf)" aria-label="Vorheriges Blatt"${pos <= 0 ? " disabled" : ""}>‹</button>`
    + `<button class="sheettab cur" id="sheet-cur" data-gosheet aria-haspopup="dialog" aria-expanded="${!!open}" title="Blätter dieses Moduls (G). Rechtsklick oder gedrückt halten: Duplizieren, Löschen" data-ctx="${a}"><span class="cl">${sh.pin ? "★ " : ""}${R.esc(sheetLabel(sh, a))}</span>${sh.meta.TITEL && !T.isDeck(sh) ? `<span class="ct">${R.esc(sh.meta.TITEL)}</span>` : ""}<span class="of">${pos + 1} von ${idx.length}</span><span class="caret" aria-hidden="true">▾</span></button>`
    + `<button class="sheettab nav" data-step="1" title="Nächstes Blatt im Modul (Bild ab)" aria-label="Nächstes Blatt"${pos >= idx.length - 1 ? " disabled" : ""}>›</button>`
    + `<button class="sheettab add" id="sheet-add" data-addsheet aria-haspopup="menu" aria-expanded="false" title="Neu: ${addKindLabel()}. Gedrückt halten oder Rechtsklick: Blatttyp wählen" aria-label="Neu: ${addKindLabel()}">${R.icons.plus}</button>` + starBtn();
  if (keep) document.getElementById(keep)?.focus();
  if (open) renderSheetList();
}
function elSheetList() {
  const q = $("#sheet-find").value.trim().toLowerCase(), m = elMod(), ho = T.handedOver(S.doc);
  // Schema-Modul: übergebene Dispos dazu, damit sie sich zwischen die Schemablätter ziehen lassen (CJ 19.10.2026)
  const idx = E.baseOf(m) !== "schema" ? elIdx() : S.doc.sheets.map((sh, i) => (E.moduleOf(sh) === m || (sh.kind === "dispo" && ho.has(sh.sid) && (!sh.ins || sh.ins === modVar(m))) ? i : -1)).filter((i) => i >= 0);
  const rows = idx.map((i) => ({ sh: S.doc.sheets[i], i, label: sheetLabel(S.doc.sheets[i], i), title: S.doc.sheets[i].meta.TITEL || "" })).filter((r) => !q || `${r.label} ${r.title}`.toLowerCase().includes(q));
  $("#sheet-menu .slist").innerHTML = rows.length ? rows.map(({ sh, i, label, title }, n) => `<div class="srow"><button class="mi${i === S.active ? " on" : ""}" data-sheet="${i}" data-ctx="${i}" tabindex="-1"${i === S.active ? ' aria-current="true"' : ""}><span class="mt"><span class="mh">${R.esc(label)}</span><span class="ms">${R.esc(title || "ohne Titel")}</span></span><span class="pos">${idx.indexOf(i) + 1}</span></button><button class="pin" data-pin="${i}" tabindex="-1" title="${sh.pin ? "Markierung entfernen" : "Blatt markieren"} (M für das aktive Blatt)" aria-label="${sh.pin ? "Markierung entfernen" : "Blatt markieren"}" aria-pressed="${!!sh.pin}">${sh.pin ? "★" : "☆"}</button></div>`).join("") : `<div class="empty">Kein Blatt gefunden</div>`;
}
function elStep(d) { if (isOff()) { ofStep(d); return; } const idx = elIdx(), i = idx[idx.indexOf(S.active) + d]; if (i !== undefined) switchSheet(i); }
function elAddFilter() { const ok = E.ADD_KINDS[E.baseOf(elMod())] || []; for (const b of document.querySelectorAll("#add-menu [data-new]")) if (!ok.includes(b.dataset.new)) b.hidden = true; else if (b.dataset.new !== "deck") b.hidden = false; } // deck: eigene Regel davor
function elSync() {
  const id = elMod(), m = E.modById(id);
  EL_S.last[id] = S.active;
  document.documentElement.style.setProperty("--el-band", m.color);
  document.body.dataset.elmod = E.baseOf(id); EL_S.lastOf[E.baseOf(id)] = id;
  setProjectMeta(S.doc.project?.meta); // neue Blätter bekommen die Projektdaten (model.js newMeta)
  const c = $("#el-crumb"); if (c && EL_S.hub?.hidden !== false) c.innerHTML = E.crumbHTML(id, E.statusOf(S.doc), modName(S.doc, id));
  if ($("#el-ptabs")) elBarSync();
}
// Kopfleiste in zwei Zeilen (Paket C, Etappe 1, CJ 21.10.2026). Zeile 1 gilt für die ganze App: Logo · Projekte · Zeit · Rückgängig/Wiederholen · Suchen · Konto-Kreis.
// Zeile 2 ist die Arbeitsleiste: links die offenen Tabs (Projekt, Zeit) oder im Modul Projektname · ‹ Übersicht / Modul; rechts «Heute X h ＋» · Speichern · Speicherstand · Exportieren.
// Kein Datei-Menü mehr: Neu und Öffnen in der Projektliste, Speichern unter und online im Menü am Knopf Speichern, Kürzel ⌘O, ⌘S, ⇧⌘S bleiben.
function elSaveState() {
  const t = $("#el-savetxt"); if (!t) return;
  const saved = !S.dirty && (S.fileHandle || S.doc.project?.online || S.fileName !== "Unbenannt");
  $("#el-okdot").hidden = !!S.dirty;
  t.textContent = S.dirty ? "Ungespeichert" : saved ? "Gespeichert" : "Neu";
  $("#el-savestate").dataset.state = S.dirty ? "dirty" : saved ? "saved" : "new";
}
const ACCT_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="3.5"/><path d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5"/></svg>`;
function elAcctDraw() {
  const b = $("#el-acct"), u = cloudUser(); if (!b) return;
  b.innerHTML = `<span class="av">${u ? R.esc(u[0].toUpperCase()) : ACCT_SVG}</span><span class="nm">${u ? R.esc(u.split("@")[0]) : "Gast"}</span>`;
  b.classList.toggle("in", !!u); b.classList.toggle("lock", !u && elLocked());
  b.title = u ? `Angemeldet als ${u}. Klick: Profil` : elLocked() ? "Nicht angemeldet. Klick: im Profil anmelden (ohne Anmeldung nur DXF)" : "Gast, nicht angemeldet. Klick: Profil";
  b.setAttribute("aria-label", b.title);
}
function elBarInit() {
  const tb = $("#topbar"), r1 = document.createElement("div"), r2 = document.createElement("div");
  r1.className = "el-r1"; r2.className = "el-r2"; r2.setAttribute("role", "group"); r2.setAttribute("aria-label", "Arbeitsleiste");
  // Zeile 1: Projekte und Zeit (Navigation), Hilfe, Konto-Kreis
  const nav = document.createElement("nav"); nav.className = "el-nav"; nav.setAttribute("aria-label", "Bereiche");
  nav.innerHTML = [["projekte", "Projekte", "Alle Projekte"], ["zeit", "Zeit", "Zeit über alle Projekte, öffnet den Tab Zeit"]].map(([k, t, ti]) => `<button class="btn el-navbtn" id="el-nav-${k}" data-elnav="${k}" type="button" title="${ti}">${t}</button>`).join("");
  const help = document.createElement("button"); help.className = "btn icon el-helpbtn"; help.dataset.elact = "help"; help.type = "button"; help.title = "Alle Tasten (?)"; help.setAttribute("aria-label", "Alle Tasten zeigen"); help.textContent = "?";
  const ab = document.createElement("button"); ab.className = "el-acctbtn"; ab.id = "el-acct"; ab.type = "button";
  ab.addEventListener("click", () => elHub(true, { tab: "profil" })); // Konto-Kreis: Profil (Anmeldung, Abmelden)
  const sp1 = document.createElement("div"); sp1.className = "spacer";
  r1.append($("#topbar .brand"), nav, sp1, $("#btn-undo"), $("#btn-redo"), $("#topbar .sep"), $("#btn-search"), help, ab);
  // Zeile 2: Tabs (Handy: ein Knopf mit dem Namen), Projektname, Pfad im Modul, Leisten der Module, rechte Gruppe
  const tabs = document.createElement("div"); tabs.className = "el-ptabs"; tabs.id = "el-ptabs"; tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Offene Tabs");
  const tsel = document.createElement("button"); tsel.className = "btn el-tabsel"; tsel.id = "el-tabsel"; tsel.type = "button"; tsel.setAttribute("aria-haspopup", "menu"); tsel.setAttribute("aria-expanded", "false"); tsel.title = "Offene Tabs";
  const fc = $("#topbar .filechip"); fc.id = "el-projname"; fc.setAttribute("role", "button"); fc.tabIndex = 0; fc.setAttribute("aria-haspopup", "menu"); fc.setAttribute("aria-expanded", "false"); fc.title = "Offene Tabs zeigen";
  const chip = document.createElement("button"); chip.className = "btn small el-chip"; chip.id = "el-daychip"; chip.dataset.elact = "timechip"; chip.type = "button";
  const ss = document.createElement("div"); ss.id = "el-savestate"; ss.className = "el-savestate"; ss.setAttribute("role", "status");
  ss.innerHTML = `<span class="el-okdot" id="el-okdot"></span><span id="el-savetxt"></span>`; ss.prepend($("#dirty"));
  const sp2 = document.createElement("div"); sp2.className = "spacer";
  const right = document.createElement("div"); right.className = "el-right";
  right.append(chip, $("#btn-save"), ss, $("#topbar .menuwrap"));
  r2.append($("#btn-left"), tabs, tsel, fc, $("#pv-bar"), $("#doc-bar"), $("#btn-handover"), sp2, right, $("#btn-right"));
  for (const x of [...tb.children]) if (x !== r1 && x !== r2 && !x.matches(".spacer")) r2.insertBefore(x, sp2); // was sonst noch in der Leiste liegt (ausgeblendete Knöpfe)
  tb.querySelector(":scope > .spacer")?.remove();
  tb.append(r1, r2); document.body.classList.add("el-2rows");
  // Menü der offenen Tabs: am Projektnamen (im Modul) und am Handy-Knopf
  const tm = document.createElement("div"); tm.className = "menu"; tm.id = "el-tabmenu"; tm.setAttribute("role", "menu"); tm.setAttribute("aria-label", "Offene Tabs"); tm.hidden = true;
  $("#app").append(tm);
  EL_S.tabMenu = makeMenu(tm, { left: true, beforeShow: () => { closeEditor(true); tm.innerHTML = elTabList().map((t) => `<button class="mi" role="menuitem" data-eltabgo="${t.k}" tabindex="-1"${t.on ? ' aria-current="true"' : ""}><span class="mt"><span class="mh">${R.esc(t.name)}</span><span class="ms">${t.on ? "Jetzt offen" : t.k === "zeit" ? "Zeit über alle Projekte" : "Projekt"}</span></span></button>`).join(""); } });
  tsel.addEventListener("click", () => EL_S.tabMenu.toggle(tsel));
  fc.addEventListener("click", () => EL_S.tabMenu.toggle(fc));
  fc.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); EL_S.tabMenu.show(fc); } });
  tm.addEventListener("click", (e) => { const k = e.target.closest("[data-eltabgo]")?.dataset.eltabgo; if (k) elTabGo(k); });
  elAcctDraw(); elSaveState();
}
// Offene Tabs (Etappe 1: das eine offene Projekt, dazu Zeit, sobald einmal geöffnet). on = gerade sichtbar
function elTabList() {
  const hub = EL_S.hub && !EL_S.hub.hidden, l = [{ k: "proj", name: elName(), on: !hub || (EL_S.tab === "projekte" && EL_S.pview) }];
  if (EL_S.zeitTab) l.push({ k: "zeit", name: "Zeit", on: hub && EL_S.tab === "zeit" });
  return l;
}
function elTabGo(k) {
  if (k === "zeit") { EL_S.zeitTab = true; elNavTo("zeit"); }
  else if (EL_S.hub.hidden) { /* Projekt-Tab im Modul: bleibt im Modul */ }
  else { EL_S.tab = "projekte"; EL_S.pview = true; elHub(true); }
}
// Zeile 1: Projekte (Liste) oder Zeit (öffnet den Tab Zeit). Lädt die Online-Liste neu, wenn sie älter als 60 s ist
function elNavTo(k) {
  if (k === "zeit") EL_S.zeitTab = true;
  const reload = !S.shared && cloudUser() && !EL_S.onbusy && (!EL_S.onAt || Date.now() - EL_S.onAt > LIST_MAX_AGE);
  if (reload) EL_S.autoTried = true;
  elHub(true, { keepFocus: true, tab: k }); // tab: auch aus dem Modul direkt in diesen Bereich if (EL_S.hub.contains(document.activeElement)) { /* Fokus bleibt */ } else document.getElementById(k === "zeit" ? "el-tab-zeit" : "el-nav-projekte")?.focus();
  if (reload) elOnlineList();
}
// Stunden heute: im Tab Zeit über alle geladenen Projekte, sonst für das offene Projekt
function elTodayH(all) {
  const today = elDay(Date.now()), sum = (t) => (Array.isArray(t) ? t : []).filter((e) => e.d === today).reduce((a, e) => a + (Number(e.h) || 0), 0);
  if (!all) return Math.round(sum(S.doc.project?.time) * 100) / 100;
  const on = S.doc.project?.online?.id, rows = (EL_S.onlist || []).filter((e) => e.id !== on);
  return Math.round((sum(S.doc.project?.time) + rows.reduce((a, e) => a + sum(e.pt), 0)) * 100) / 100;
}
// Zeile 2 nachführen: Tabs, Handy-Knopf, Navigation, Tages-Chip, welche Teile sichtbar sind
function elBarSync() {
  const hub = EL_S.hub && !EL_S.hub.hidden, zeit = hub && EL_S.tab === "zeit", tabs = elTabList(), cur = tabs.find((t) => t.on);
  document.body.dataset.elbar = !hub ? "modul" : zeit ? "zeit" : EL_S.tab === "projekte" && EL_S.pview ? "projekt" : EL_S.tab === "profil" ? "profil" : "liste";
  $("#el-ptabs").innerHTML = tabs.map((t) => `<button class="el-ptab${t.k === "zeit" ? " el-ptab-zeit" : ""}" role="tab" id="el-tab-${t.k === "zeit" ? "zeit" : "proj"}" data-eltabgo="${t.k}" aria-controls="el-tabpanel" aria-selected="${t.on}" tabindex="${t.on || (!cur && t.k === "proj") ? 0 : -1}" title="${R.esc(t.name)}"><span class="el-ptn">${R.esc(t.name)}</span></button>`).join("");
  const ts = $("#el-tabsel"); ts.innerHTML = `<span class="el-ptn">${R.esc(cur ? cur.name : hub && EL_S.tab === "profil" ? "Profil" : "Projekte")}</span><span class="caret" aria-hidden="true">▾</span>`;
  for (const k of ["projekte", "zeit"]) { const b = $(`#el-nav-${k}`), on = hub && EL_S.tab === k && !(k === "projekte" && EL_S.pview); b.classList.toggle("on", on); if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); }
  const h = elTodayH(zeit), c = $("#el-daychip");
  c.innerHTML = `<span class="el-chipl">Heute </span>${E.fmtH(h)} h <span aria-hidden="true">＋</span>`;
  c.title = zeit ? "Stunden für ein Online-Projekt eintragen" : "Stunden für dieses Projekt eintragen";
  c.setAttribute("aria-label", `Heute ${E.fmtH(h)} Stunden, Zeit eintragen`);
}
function elInit() {
  elBarInit();
  cloudOnSession(() => { elAcctDraw(); if (EL_S.hub && !EL_S.hub.hidden && EL_S.tab === "profil" && !EL_S.pfBusy) elHub(true, { keepFocus: true }); }); // Anmeldung geändert (Fenster, abgelaufen, Abmelden im Katalog)
  const crumb = document.createElement("div"); crumb.id = "el-crumb"; crumb.className = "el-crumb";
  $("#topbar .filechip").after(crumb);
  const bare = document.createElement("button"); bare.className = "btn icon el-barebtn"; bare.id = "el-bare"; bare.dataset.elact = "bare";
  bare.title = "Seitenleisten aus und ein (§)"; bare.setAttribute("aria-label", "Seitenleisten aus und ein"); bare.setAttribute("aria-pressed", "false"); bare.innerHTML = R.icons.panelL;
  $("#topbar .el-r2 .el-right").before(bare);
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
  mc.innerHTML = `<div class="ctx-head"></div>` + [["open", "list", "Öffnen", ""], ["st", "list", "Status …", "Offen, In Arbeit, Geprüft, Versendet, Revision, Archiviert"], ["ren", "text", "Umbenennen", "Eigener Name, z. B. Schema HV"], ["dup", "copy", "Duplizieren", "Ganzes Modul, unabhängig vom Original"], ["del", "trash", "Löschen", "Mit allen Blättern, Rückgängig möglich"]]
    .map(([a, ic, t, sub]) => `<button class="mi${a === "del" ? " danger" : ""}" role="menuitem" data-elmodact="${a}" tabindex="-1"><span class="ic">${R.icons[ic]}</span><span class="mt"><span class="mh">${t}</span>${sub ? `<span class="ms">${sub}</span>` : ""}</span></button>`).join("");
  $("#app").append(mc);
  EL_S.modCtx = makeMenu(mc, { left: true, beforeShow: () => {
    const id = EL_S.ctxMod, n = E.modIdx(S.doc, id).filter((i) => !T.isDeck(S.doc.sheets[i])).length;
    mc.querySelector(".ctx-head").textContent = `${modName(S.doc, id)} · ${n} ${n === 1 ? "Blatt" : "Blätter"}`;
    mc.querySelector("[data-elmodact=del]").disabled = !S.doc.sheets.some((sh) => !T.isDeck(sh) && modOf(sh) !== id) || !!E.modById(id)?.auto;
    mc.querySelector("[data-elmodact=dup]").disabled = !!E.modById(id)?.auto; // Legende: gibt es nur einmal
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
  const pc = mm.cloneNode(); pc.id = "el-projctx"; pc.setAttribute("aria-label", "Projekt");
  pc.innerHTML = `<div class="ctx-head"></div>` + [["open", "list", "Öffnen", ""], ["rm", "trash", "Aus der Liste entfernen", "Nur der Eintrag, die Datei bleibt"], ["share", "list", "Link teilen …", "Nur ansehen, ohne Login"], ["odel", "trash", "Online löschen", "Nur die Online-Kopie, Dateien bleiben"]]
    .map(([a, ic, t, sub]) => `<button class="mi${a === "odel" ? " danger" : ""}" role="menuitem" data-elprojact="${a}" tabindex="-1"><span class="ic">${R.icons[ic]}</span><span class="mt"><span class="mh">${t}</span>${sub ? `<span class="ms">${sub}</span>` : ""}</span></button>`).join("");
  $("#app").append(pc);
  EL_S.projCtx = makeMenu(pc, { left: true, beforeShow: () => {
    const k = EL_S.ctxProj || "", loc = k.startsWith("l:");
    pc.querySelector(".ctx-head").textContent = loc ? "Lokales Projekt" : "Online-Projekt";
    pc.querySelector('[data-elprojact="rm"]').hidden = !loc;
    for (const a of ["share", "odel"]) pc.querySelector(`[data-elprojact="${a}"]`).hidden = loc; // Online-Projekte (vorher Liste im Projekt, CJ 21.10.2026)
  } });
  pc.addEventListener("click", (e) => { const a = e.target.closest("[data-elprojact]")?.dataset.elprojact; if (a) elProjAct(a); });
  const mp = mm.cloneNode(); mp.id = "el-mstpop"; mp.setAttribute("aria-label", "Modulstatus"); $("#app").append(mp);
  EL_S.stPop = makeMenu(mp, { left: true, onOpen: () => mp.querySelector('[aria-checked="true"]')?.focus(), beforeShow: () => { mp.innerHTML = E.modStatusMenuHTML(S.doc, EL_S.stMod); } });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-eltab], [data-elnav], [data-elzopen], [data-elwk], [data-elview], [data-elsheet], [data-elmore], [data-elmst], [data-elmstset], [data-elpdf], [data-elact], [data-elopen], [data-elnew], [data-eltdel], [data-elrecent], [data-elonline], [data-elodel], [data-elzok], [data-elzweg]");
    if (!b || b.disabled) return;
    if ((e.metaKey || e.ctrlKey) && b.classList.contains("el-ptile") && b.dataset.selkey) { e.preventDefault(); const k = b.dataset.selkey; (EL_S.sel ??= new Set())[EL_S.sel.has(k) ? "delete" : "add"](k); elHub(true, { keepFocus: true }); document.querySelector(`.el-ptile[data-selkey="${k}"]`)?.focus(); return; } // ⌘-Klick oder ⌘ Enter: mehrere wählen
    if (b.dataset.eltab) {
      EL_S.tab = b.dataset.eltab; if (EL_S.tab === "projekte") EL_S.pview = false;
      const reload = ["projekte", "zeit"].includes(EL_S.tab) && !S.shared && cloudUser() && !EL_S.onbusy && (!EL_S.onAt || Date.now() - EL_S.onAt > LIST_MAX_AGE); // beim Wechsel in den Reiter neu laden, wenn der Stand älter als 60 s ist (sonst «Neu laden»)
      if (reload) EL_S.autoTried = true;
      elHub(true, { keepFocus: true }); document.getElementById("el-tab-" + EL_S.tab)?.focus();
      if (reload) elOnlineList();
    }
    else if (b.dataset.elnav) elNavTo(b.dataset.elnav);
    else if (b.dataset.elzopen) elZeitOpen(b.dataset.elzopen);
    else if (b.dataset.elwk) { const cur = EL_S.week || E.weekStart(elDay(Date.now())); EL_S.week = b.dataset.elwk === "0" ? E.weekStart(elDay(Date.now())) : E.weekShift(cur, Number(b.dataset.elwk)); elHub(true, { keepFocus: true }); }
    else if (b.dataset.elview) { EL_S.pf.view = b.dataset.elview; elHub(true, { keepFocus: true }); }
    else if (b.dataset.elmst) { EL_S.stMod = b.dataset.elmst; EL_S.stPop.toggle(b.closest(".el-tile") || b); } // Modulstatus wählen; Menü an der Kachel, Fokus kehrt dorthin zurück
    else if (b.dataset.elmstset) { setModStatus(EL_S.stMod, b.dataset.elmstset); elHub(true, { keepFocus: true }); document.getElementById(E.tileId(EL_S.stMod))?.focus(); } // Fokus zurück auf die Kachel
    else if (b.dataset.elmore) { EL_S.popMod = b.dataset.elmore; EL_S.shPop.toggle(b); } // alle Blätter des Moduls
    else if (b.dataset.elpdf) printPdf(E.modIdx(S.doc, b.dataset.elpdf).map((i) => S.doc.sheets[i]), `_${modName(S.doc, b.dataset.elpdf)}`); // Modul als PDF, Login-Regel in printPdf
    else if (b.dataset.elsheet) { elHub(false); switchSheet(Number(b.dataset.elsheet)); } // Blatt-Kachel: genau dieses Blatt (CJ 18.10.2026)
    else if (b.dataset.elopen) elOpen(b.dataset.elopen, { exact: b.dataset.exact !== undefined }); // exact: genau dieses Modul (Kachel), sonst Art
    else if (b.dataset.elnew) elNew(b.dataset.elnew);
    else if (b.dataset.eltdel) elTimeDel(Number(b.dataset.eltdel));
    else if (b.dataset.elzok || b.dataset.elzweg) elZeitResolve(b.dataset.elzok || b.dataset.elzweg, !!b.dataset.elzok);
    else if (b.dataset.elrecent) elOpenRecent(Number(b.dataset.elrecent));
    else if (b.dataset.elonline) elOnlineOpen(b.dataset.elonline);
    else if (b.dataset.elodel) elOnlineDelete(b.dataset.elodel);
    else ({ hub: () => elHub(true), bare: elBare, pdf: () => printPdf(), modmenu: () => EL_S.modMenu.toggle(b), addmod: () => EL_S.addMenu.toggle(b), newproj: elNewProject, openfile: () => openJson(), csv: elCsv, zeitcsv: elZeitCsv, projview: () => { EL_S.tab = "projekte"; EL_S.pview = true; elHub(true); }, selrm: elSelRemove, selclr: () => { EL_S.sel?.clear(); elHub(true, { keepFocus: true }); }, timechip: () => { if (!EL_S.hub.hidden && EL_S.tab === "zeit") { $("#el-zh")?.focus(); return; } EL_S.tab = "projekte"; EL_S.pview = true; elHub(true, { keepFocus: true }); document.getElementById("el-th")?.scrollIntoView({ block: "center" }); document.getElementById("el-th")?.focus(); }, help: elHelp, tipoff: () => elTipSet(false),
      hand: elHand, gwr: elGwr, onsave: elOnlineSave, onlist: elOnlineList, logout: elLogout, feedback: elFeedback, firmprof: firmProfil, kalk: kalkFirma }[b.dataset.elact] || (() => {}))();
  });
  hub.addEventListener("keydown", (e) => { // Reiter mit Pfeiltasten (Roving-Tabindex)
    const t = e.target.closest?.(".el-tab"); if (!t || e.altKey || e.metaKey || e.ctrlKey) return;
    const tabs = [...hub.querySelectorAll(".el-tab")], i = tabs.indexOf(t), n = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (n < 0) return; e.preventDefault(); e.stopPropagation(); tabs[n].click();
  });
  hub.addEventListener("dragstart", (e) => { // Projektkachel ziehen: eigene Reihenfolge
    const p = e.target.closest?.(".el-ptile[data-pkey]"); if (!p) return;
    EL_S.pdrag = p.dataset.pkey; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.dataset.pkey); p.classList.add("el-drag");
  });
  hub.addEventListener("dragover", (e) => { const p = e.target.closest?.(".el-ptile[data-pkey]"); if (!EL_S.pdrag || !p) return; e.preventDefault(); for (const x of hub.querySelectorAll(".el-ptile.el-over")) if (x !== p) x.classList.remove("el-over"); p.classList.toggle("el-over", p.dataset.pkey !== EL_S.pdrag); });
  hub.addEventListener("drop", (e) => {
    const p = e.target.closest?.(".el-ptile[data-pkey]"); if (!EL_S.pdrag || !p) return; e.preventDefault();
    const keys = [...hub.querySelectorAll(".el-ptile[data-pkey]")].map((x) => x.dataset.pkey), from = keys.indexOf(EL_S.pdrag), to = keys.indexOf(p.dataset.pkey); EL_S.pdrag = null;
    if (from < 0 || to < 0 || from === to) return;
    keys.splice(to, 0, ...keys.splice(from, 1)); elProjOrderSet(keys); EL_S.pf.sort = "eigene"; EL_S.sel?.clear(); elHub(true, { keepFocus: true });
  });
  hub.addEventListener("dragend", () => { EL_S.pdrag = null; for (const x of hub.querySelectorAll(".el-ptile.el-drag, .el-ptile.el-over")) x.classList.remove("el-drag", "el-over"); });
  hub.addEventListener("dragstart", (e) => { const t = e.target.closest?.(".el-tile[data-modctx]"); if (!t) return; EL_S.drag = t.dataset.modctx; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.dataset.modctx); t.classList.add("el-drag"); });
  hub.addEventListener("dragover", (e) => { const t = e.target.closest?.(".el-tile[data-modctx]"); if (!EL_S.drag || !t) return; e.preventDefault(); for (const x of hub.querySelectorAll(".el-over")) if (x !== t) x.classList.remove("el-over"); t.classList.toggle("el-over", t.dataset.modctx !== EL_S.drag); });
  hub.addEventListener("drop", (e) => { const t = e.target.closest?.(".el-tile[data-modctx]"); if (!EL_S.drag || !t) return; e.preventDefault(); const id = EL_S.drag; EL_S.drag = null; if (moveModuleTo(id, t.dataset.modctx)) { elHub(true, { keepFocus: true }); document.getElementById(E.tileId(id))?.focus(); } });
  hub.addEventListener("dragend", () => { EL_S.drag = null; for (const x of hub.querySelectorAll(".el-drag, .el-over")) x.classList.remove("el-drag", "el-over"); });
  hub.addEventListener("change", (e) => { if (e.target.dataset?.eltip !== undefined) { elTipSet(e.target.checked); return; } const k = e.target.dataset?.elp; if (k) elSetProject(k, e.target.value); else if (e.target.dataset?.elf) { EL_S.pf[e.target.dataset.elf] = e.target.value; EL_S.sel?.clear(); elHub(true, { keepFocus: true }); } });
  hub.addEventListener("input", (e) => { if (e.target.id === "el-pf-mail") EL_S.pfMail = e.target.value; else if (e.target.id === "el-pf-pw") EL_S.pfPw = e.target.value; });
  hub.addEventListener("submit", (e) => { e.preventDefault(); if (e.target.id === "el-pf-form") elProfileLogin(); else if (e.target.id === "el-zform") elZeitAdd(); else elTimeAdd(); });
  adrInit(hub);
  hub.addEventListener("keydown", (e) => { const r = e.key === "Enter" && e.target.closest?.("[data-elz]"); if (r) { e.preventDefault(); elZeitResolve(r.dataset.elz, true); } }); // Enter in der Zeile übernimmt
  hub.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches?.("input[data-elp]")) { e.preventDefault(); e.target.blur(); } }); // Enter übernimmt
  hub.addEventListener("click", (e) => { const b = e.target.closest("[data-elshare]"); if (b && !b.disabled) elShareDialog(b.dataset.elshare); });
  addEventListener("el-file", (e) => { // files.js: gespeichert oder geöffnet
    elZeitDoc({ file: !EL_S.fromOnline });
    if (EL_S.fromOnline) { elCurT = null; return; } // aus der Online-Ablage geöffnet: keine Datei, nicht unter „zuletzt geöffnet“
    E.recentAdd({ file: e.detail.file, name: elName(), status: E.statusOf(S.doc), handle: e.detail.handle || null, sum: E.projSummary(S.doc) }).then((t) => { elCurT = t; EL_S.sel?.clear(); if (!EL_S.hub.hidden) elHub(true, { keepFocus: true }); });
  });
  $("#el-ptabs").addEventListener("click", (e) => { const k = e.target.closest("[data-eltabgo]")?.dataset.eltabgo; if (k) elTabGo(k); });
  $("#el-ptabs").addEventListener("keydown", (e) => { // Tabs mit Pfeiltasten (Roving-Tabindex)
    const t = e.target.closest?.(".el-ptab"); if (!t || e.altKey || e.metaKey || e.ctrlKey) return;
    const all = [...$("#el-ptabs").querySelectorAll(".el-ptab")], i = all.indexOf(t), n = e.key === "ArrowRight" ? (i + 1) % all.length : e.key === "ArrowLeft" ? (i + all.length - 1) % all.length : e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : -1;
    if (n < 0) return; e.preventDefault(); e.stopPropagation(); elTabGo(all[n].dataset.eltabgo); document.getElementById(all[n].id)?.focus();
  });
  elZeitInit(); elSync(); elHub(true, S.shared ? {} : { tab: "projekte" }); // Start: Liste «Projekte» (CJ 27.10.2026), geteilte Ansicht: das Projekt
  if (S.shared) elShareLoad();
}
// Übersicht zeigen (show) oder schliessen; beim Schliessen bleibt das zuletzt offene Modul. keepFocus: neu zeichnen, Fokus bleibt
function elHub(show, { keepFocus = false, tab = null } = {}) {
  if (!show && S.shared && !EL_S.shareInfo) return; // geteilte Ansicht: Übersicht bleibt, bis das Projekt geladen ist
  const h = EL_S.hub, f = keepFocus && document.activeElement?.closest?.("#el-hub") ? (document.activeElement.id ? "#" + document.activeElement.id : document.activeElement.dataset.elp ? `[data-elp="${document.activeElement.dataset.elp}"]` : document.activeElement.dataset.elf ? `[data-elf="${document.activeElement.dataset.elf}"]` : document.activeElement.dataset.elview ? `[data-elview="${document.activeElement.dataset.elview}"]` : null) : null;
  if (show) {
    if (EL_S.hub.hidden) { EL_S.tab = "projekte"; EL_S.pview = true; } // aus dem Modul zurück: das offene Projekt
    if (tab) { EL_S.tab = tab; if (tab === "projekte") EL_S.pview = false; }
    finishWire(); closeEditor(true); elZeitPause(); // in der Übersicht läuft keine Zeit
    const today = elDay(Date.now());
    const file = S.fileHandle?.name || "", suggest = `${baseName()}.elplexa.json`;
    const gd = h.querySelector("#el-gwr"); if (gd) EL_S.gwrOpen = gd.open; // GWR-Feld bleibt beim Neuzeichnen offen oder zu
    h.innerHTML = S.shared && !EL_S.shareInfo ? (EL_S.shareFail ? E.shareFailHTML(EL_S.shareFail.grund, EL_S.shareFail.msg) : E.shareLoadHTML())
      : E.hubHTML(S.doc, { name: elName(), file, suggest, today, label: sheetLabel, shared: S.shared ? EL_S.shareInfo : null, gwrOpen: !!EL_S.gwrOpen, gwrBusy: !!EL_S.gwrBusy, tip: elTipOn(), tab: EL_S.tab, pview: EL_S.pview, curT: elCurT, profil: { user: cloudUser(), busy: EL_S.pfBusy, msg: EL_S.pfMsg, mail: EL_S.pfMail, pw: EL_S.pfPw, locked: elLocked() }, zeit: elZeitData(), projs: { recent: EL_S.recent, online: EL_S.onlist ?? null, user: cloudUser(), err: EL_S.onerr, busy: EL_S.onbusy, ...EL_S.pf, sel: EL_S.sel, order: elProjOrder() } });
    for (const el of h.querySelectorAll(".ic[data-ic]")) el.innerHTML = R.icons[el.dataset.ic];
    E.recentList().then((l) => {
      const key = (x) => JSON.stringify((x || []).map((e) => [e.file, e.t])), changed = key(EL_S.recent) !== key(l);
      if (changed) EL_S.sel?.clear(); // Plätze in der Liste haben sich geändert
      EL_S.recent = l; const r = h.querySelector("#el-recent"); if (r) r.innerHTML = E.recentHTML(l);
      if (changed && EL_S.tab === "projekte" && !EL_S.pview && !EL_S.hub.hidden) elHub(true, { keepFocus: true }); // Kacheln mit den geladenen Einträgen
    });
    elOnlineDraw();
    if (elTabLive() && EL_S.tab !== "profil" && !S.shared && cloudUser() && EL_S.onlist == null && !EL_S.onbusy && !EL_S.autoTried) { EL_S.autoTried = true; elOnlineList(); } // einmal je Anmeldung automatisch laden
  }
  h.hidden = !show; document.body.classList.toggle("el-hubopen", show);
  elBarSync(); // Zeile 2: Tabs, Chip, sichtbare Teile je Ansicht (data-elbar)
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
    else if (k.startsWith("BAUHERR")) { const info = E.bauherrInfo(S.doc) || (S.doc.info = cleanInfo({})); info[k] = v; } // Bauherr, E-Mail, Telefon
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
// Zeit über alle Projekte (Etappe 4): Woche und Online-Projekte; das offene, verknüpfte Projekt zählt mit dem Stand der Datei
function elZeitData() {
  const mon = EL_S.week || E.weekStart(elDay(Date.now())), on = S.doc.project?.online?.id;
  const items = (EL_S.onlist || []).map((e) => e.id === on ? { id: e.id, name: e.name, time: S.doc.project?.time || [], local: true, auto: E.autoOpen(S.doc).length }
    : { id: e.id, name: e.name, time: Array.isArray(e.pt) ? e.pt : "pt" in e ? [] : null, auto: E.autoOpenN(e.pa) }); // pt fehlt ganz = alte Abfrage: Stunden unbekannt
  return { items, mon, user: cloudUser(), err: EL_S.onerr, busy: EL_S.onbusy, loaded: EL_S.onlist != null, at: EL_S.onAt, pick: EL_S.zp || on || "", day: EL_S.zd || "" };
}
// Zeit-Reiter (CJ 21.10.2026): Klick auf ein Projekt öffnet es. Das offene Projekt zeigt seine Projektseite, ein anderes wird aus der Online-Ablage geladen
function elZeitOpen(id) {
  if (id === S.doc.project?.online?.id) { EL_S.tab = "projekte"; EL_S.pview = true; elHub(true); return; }
  elOnlineOpen(id);
}
// Zeit direkt im Reiter erfassen, ohne das Projekt zu öffnen (nur Online-Projekte). Gleich gespeichert: das offene Projekt bekommt den
// Eintrag in die Datei (wie im Projekt, sonst hätte die Datei einen älteren Online-Stand), jedes andere direkt online.
async function elZeitAdd() {
  const id = $("#el-zp").value, d = $("#el-zd").value, h = Number($("#el-zh").value.trim().replace(",", ".")), n = $("#el-zn").value.trim();
  if (!id) { toast("Bitte ein Projekt wählen.", "error"); $("#el-zp").focus(); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { toast("Bitte ein Datum wählen.", "error"); return; }
  if (!(h > 0 && h <= 24)) { toast("Stunden zwischen 0 und 24 eingeben, z. B. 1,5.", "error"); $("#el-zh").focus(); return; }
  const e = { d, h: Math.round(h * 100) / 100, n };
  EL_S.zp = id; // gewähltes Projekt bleibt für den nächsten Eintrag
  if (id === S.doc.project?.online?.id) {
    change(() => { (elProj().time ||= []).push(e); }, { panel: false });
    elHub(true, { keepFocus: true }); $("#el-zh")?.focus();
    toast(`${E.fmtH(e.h)} h im offenen Projekt eingetragen. Mit dem Projekt speichern (⌘S).`);
    return;
  }
  if (EL_S.zbusy) return;
  EL_S.zbusy = true; EL_S.zd = d; const btn = $("#el-zform [type=submit]"); if (btn) btn.disabled = true; // Eingaben bleiben stehen, bis es gespeichert ist
  let ok = false;
  try {
    const r = await projTimeAdd(id, e);
    if (r) {
      const row = (EL_S.onlist || []).find((x) => x.id === id);
      if (row) { row.pt = r.time; row.updated_at = r.at; }
      toast(`${E.fmtH(e.h)} h bei „${row?.name || "Projekt"}“ eingetragen und online gespeichert.`); ok = true;
    }
  } catch (err) { toast(err.message || String(err), "error"); }
  finally { EL_S.zbusy = false; if (btn?.isConnected) btn.disabled = false; }
  if (ok && !EL_S.hub.hidden && EL_S.tab === "zeit") { elHub(true, { keepFocus: true }); $("#el-zh")?.focus(); } // Tabelle und Chip mit dem neuen Eintrag, Stunden und Notiz leer
}
function elZeitCsv() { const d = elZeitData(); download(`Zeit_Woche_${d.mon}.csv`, E.timeWeekCsv(E.timeWeek(d.items, d.mon)), "text/csv"); toast("Wochenzeit als CSV in den Download-Ordner geladen."); }
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
    EL_S.tab = "projekte"; EL_S.pview = true; // geöffnet: zurück zum Projekt
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
  if (ok) { toast(`Angemeldet als ${cloudUser()}.`); EL_S.autoTried = false; }
  elAcctDraw();
  if (!EL_S.hub.hidden) elOnlineDraw();
  return ok;
}
async function elOnline(fn) { // sperrt die Knöpfe während der Anfrage
  if (EL_S.onbusy) return;
  EL_S.onbusy = true; elOnlineDraw(); if (elTabLive() && !EL_S.hub.hidden) elHub(true, { keepFocus: true });
  try { await fn(); } catch (err) { toast(err.message || String(err), "error"); }
  finally { EL_S.onbusy = false; if (!EL_S.hub.hidden) { elOnlineDraw(); if (elTabLive()) elHub(true, { keepFocus: true }); } }
}
const elOnlineList = () => elOnline(async () => { try { const l = await projList(); if (l) { EL_S.onlist = l; EL_S.onAt = Date.now(); } EL_S.onerr = null; } catch (err) { EL_S.onerr = err.message || String(err); throw err; } });
const elLogout = () => elOnline(async () => { await cloudLogout(); EL_S.onlist = null; EL_S.onerr = null; EL_S.autoTried = false; toast("Abgemeldet."); elAcctDraw(); });
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
// Handnotizen (Meilenstein 2, CJ 20.10.2026): eigenes Modul über der Übersicht, Daten in eigener Datenbank (hand.js). Blätter des Projekts
// kommen über das eigene PDF (makePdf) als Hintergrund hinein, das Projekt bleibt unverändert.
async function elHand() {
  if (!openHand) return;
  await openHand({
    sheets: () => S.doc.sheets.map((sh, i) => ({ i, label: `${sheetLabel(sh, i)}${sh.meta?.TITEL ? ` · ${sh.meta.TITEL}` : ""}` })),
    sheetsPdf: async (idx) => {
      const list = idx.map((i) => S.doc.sheets[i]);
      if (list.some((sh) => sh.kind === "pv" || sh.kind === "pvtab")) await PV.preparePrint();
      if (ELPLEXA) await S.planPrep(list); // PDF-Pläne im Modul Plan
      buildPrint(list);
      return makePdf([...$("#printroot").children], "Blätter");
    },
    toast, confirm: confirmDialog, onClose: () => {},
  });
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
    const e = EL_S.onlist?.find((x) => x.id === id) || (S.doc.project?.online?.id === id ? { name: elName() } : null); // auch aus dem Projekt, ohne geladene Liste
    if (!(await confirmDialog("Online-Projekt löschen?", `„${e?.name || "Projekt"}“ wird online gelöscht, samt PDF, die kein anderes Online-Projekt braucht. Dateien auf dem Rechner bleiben.`, "Online löschen"))) return;
    if (!(await projDelete(id))) return;
    if (S.doc.project?.online?.id === id) delete S.doc.project.online;
    if (EL_S.onlist) EL_S.onlist = EL_S.onlist.filter((x) => x.id !== id);
    toast(`Online gelöscht: „${e?.name || "Projekt"}“.`);
  });
}
function elOnlineOpen(id) {
  return elOnline(async () => {
    if (S.dirty && !(await confirmDialog("Ungespeicherte Änderungen", "Beim Öffnen gehen die Änderungen am aktuellen Dokument verloren.", "Trotzdem öffnen"))) return;
    const doc = await projOpen(id);
    if (!doc) return;
    EL_S.tab = "projekte"; EL_S.pview = true;
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
  const add = { schema: addSheet, dispo: addDispo, pv: addPv, prinzip: addPrinzip, plan: addPlan, offerte: addOfferte }[id];
  if (!add) { toast(`${E.modById(id).label} kommt später.`); return; }
  const vs = S.doc.sheets.filter((sh) => modBase(sh) === id && !T.isDeck(sh)).map(varOf);
  elHub(false); add(vs.length ? Math.max(...vs) + 1 : 1);
}
// Kachelmenü der Übersicht (CJ 18.10.2026): Rechtsklick oder gedrückt halten auf eine Modul-Kachel
function elModCtx(el) {
  EL_S.ctxMod = el.dataset.modctx;
  EL_S.modCtx.show(el);
}
// Projektkacheln im Reiter Projekte (Etappe 5): Rechtsklick-Menü, ⌘-Klick-Mehrfachwahl
function elProjCtx(el) { EL_S.ctxProj = el.dataset.projctx; EL_S.projCtx.show(el); }
async function elProjAct(a) {
  const k = EL_S.ctxProj || "";
  if (a === "open") { k.startsWith("l:") ? elOpenRecent(Number(k.slice(2))) : elOnlineOpen(k.slice(2)); return; }
  if (a === "share" && k.startsWith("o:")) { elShareDialog(k.slice(2)); return; }
  if (a === "odel" && k.startsWith("o:")) { elOnlineDelete(k.slice(2)); return; }
  if (a === "rm" && k.startsWith("l:")) { await E.recentDrop(Number(k.slice(2))); EL_S.sel?.clear(); elHub(true, { keepFocus: true }); toast("Aus der Liste entfernt. Die Datei bleibt."); }
}
async function elSelRemove() {
  const ks = [...(EL_S.sel || [])].filter((k) => k.startsWith("l:")).map((k) => Number(k.slice(2)));
  if (!ks.length) return;
  await E.recentDropMany(ks); EL_S.sel.clear(); elHub(true, { keepFocus: true });
  toast(`${ks.length} ${ks.length === 1 ? "Eintrag" : "Einträge"} aus der Liste entfernt. Die Dateien bleiben.`);
}
async function elModAct(a) {
  const id = EL_S.ctxMod;
  if (!id) return;
  if (a === "open") { elOpen(id, { exact: true }); return; }
  if (a === "st") { EL_S.stMod = id; const t = document.getElementById(E.tileId(id)); if (t) setTimeout(() => EL_S.stPop.show(t), 0); return; }
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
const LIST_MAX_AGE = 60000; // ms: Reiterwechsel lädt die Online-Liste nur neu, wenn der Stand älter ist (schont das Gratis-Supabase)
const elTabLive = () => !(EL_S.tab === "projekte" && EL_S.pview); // Listen, Zeit und Profil zeichnen sich bei Online-Antworten neu
// Eigene Reihenfolge der Projektkacheln (Etappe 6): Schlüssel in der Reihenfolge, im Browser gemerkt (localStorage)
const elProjOrder = () => { try { const a = JSON.parse(localStorage.getItem("elplexacad.projorder") || "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch { return []; } };
function elProjOrderSet(keys) { try { localStorage.setItem("elplexacad.projorder", JSON.stringify(keys.slice(0, 500))); } catch { /* egal */ } }
// Tipp-Zeile der Übersicht (2b): ein- und ausblendbar, im Browser gemerkt
const elTipOn = () => { try { return localStorage.getItem("elplexacad.tipp") !== "0"; } catch { return true; } };
function elTipSet(on) { try { localStorage.setItem("elplexacad.tipp", on ? "1" : "0"); } catch { /* egal */ } if (!EL_S.hub.hidden) elHub(true, { keepFocus: true }); }
// Anmeldung im Reiter Profil (Etappe 6): Fehler stehen im Reiter (falsche Daten, kein Netz)
async function elProfileLogin() {
  const email = $("#el-pf-mail")?.value.trim() || "", pw = $("#el-pf-pw")?.value || "";
  if (EL_S.pfBusy) return;
  EL_S.pfMail = email; EL_S.pfPw = pw; // bleiben beim Neuzeichnen stehen
  if (!email || !pw) { EL_S.pfMsg = "Bitte E-Mail und Passwort eingeben."; elHub(true, { keepFocus: true }); return; }
  EL_S.pfBusy = true; EL_S.pfMsg = null; elHub(true, { keepFocus: true });
  try { await cloudSignIn(email, pw); toast(`Angemeldet als ${cloudUser()}.`); EL_S.autoTried = false; EL_S.onlist = null; EL_S.pfMail = ""; EL_S.pfPw = ""; }
  catch (err) { EL_S.pfMsg = err.status === 400 ? "E-Mail oder Passwort falsch." : err.message || String(err); EL_S.pfPw = ""; } // E-Mail bleibt, Passwort nicht
  finally { EL_S.pfBusy = false; elAcctDraw(); if (!EL_S.hub.hidden) { elHub(true); if (EL_S.pfMsg) document.getElementById("el-pf-pw")?.focus(); } }
}
function elHelp() { openModal("Tasten in elplexaCAD", E.keysHTML() + `<div class="actions"><button class="btn outline" data-tip>${elTipOn() ? "Tipp-Zeile ausblenden" : "Tipp-Zeile einblenden"}</button><button class="btn primary" data-c>Schliessen</button></div>`, (b, done) => { if (b.matches("[data-tip]")) { elTipSet(!elTipOn()); done(null); } else done(null); }, null, "[data-c]"); }
// Tasten ohne ⌘: 1 bis 9 Module (nur in der Projektansicht), 0 Übersicht, § Leisten, ? Hilfe. true = Taste gehört elplexaCAD
function elKey(e) {
  if (/^[1-9]$/.test(e.key) && EL_S.hub && !EL_S.hub.hidden && !(EL_S.tab === "projekte" && EL_S.pview)) return false; // Projekte, Zeit, Profil haben keine Modulkacheln
  if (/^[1-9]$/.test(e.key) && EL_S.hub && !EL_S.hub.hidden) { const id = E.modIds(S.doc)[Number(e.key) - 1]; if (id) elOpen(id, { exact: true }); else toast(`Kein Modul an Stelle ${e.key}.`); return true; } // Übersicht: N-te Kachel (20.10.2026)
  if (/^[1-9]$/.test(e.key)) return false; // im Modul gehören Ziffern dem Werkzeug (Polzahl, Linienart, Kanalbreite), CJ 27.10.2026
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
  if (e.metaKey || e.ctrlKey) {
    const k = e.key.toLowerCase();
    if (k === "z" && EL_S.tab === "projekte" && EL_S.pview) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); elHub(true, { keepFocus: true }); return true; } // Status und Reihenfolge der Module sind Änderungen der Datei: ⌘Z gilt auch hier
    return !(k === "s" || k === "o");
  }
  if (e.key === "Escape") { if (EL_S.sel?.size) { EL_S.sel.clear(); elHub(true, { keepFocus: true }); return true; } elHub(false); return true; } // erst die Auswahl aufheben
  const tile = t instanceof HTMLElement ? t.closest(".el-tile[data-modctx]") : null; // Kachel gewählt: S = Status, ⌥ ← → = Platz tauschen
  if (tile && e.altKey && !e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); if (moveModule(tile.dataset.modctx, e.key === "ArrowLeft" ? -1 : 1)) elHub(true, { keepFocus: true }); return true; }
  if (tile && !e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); EL_S.stMod = tile.dataset.modctx; EL_S.stPop.toggle(tile); return true; }
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
      OF.setMode({ ro: true, prices: r.prices }); // Offerte im Link: nur lesen, Preise nur wenn freigegeben
      try { await loadText(JSON.stringify(r.doc), r.name || "Geteiltes Projekt", null); } finally { EL_S.fromOnline = false; }
      EL_S.shareInfo = { at: r.at, ablauf: r.ablauf, mods: r.modules ? E.modIds(S.doc).filter((id) => !E.modById(id)?.auto).map((id) => modName(S.doc, id)) : null };
      setTool("hand"); document.body.classList.remove("el-sharewait");
      elNotesInit(r.doc.sheets);
    }
  } catch (err) { EL_S.shareFail = { msg: err.message || String(err) }; }
  elHub(true);
}
function elShareKey(e) { // true = Taste gesperrt oder erledigt; erlaubt sind Ansehen und Blättern
  if (e.metaKey || e.ctrlKey || e.altKey) { e.preventDefault(); return true; }
  if (EL_N.keys && !e.shiftKey && ["n", "m", "l", "N", "M", "L"].includes(e.key)) { e.preventDefault(); elNoteCmd({ n: "notiz", m: "mark", l: "liste" }[e.key.toLowerCase()]); return true; }
  if (e.key === "Escape" && (EL_N.tool || EL_N.drag)) { e.preventDefault(); elNoteTool(null); return true; }
  if (/^[0-9?§`]$/.test(e.key)) { e.preventDefault(); if (EL_S.shareInfo) elKey(e); return true; }
  if (["PageUp", "PageDown", "f", "F", "+", "-", "=", "g", "G", " ", "Escape", "Tab", "Enter"].includes(e.key)) return false;
  e.preventDefault(); return true;
}
// Notizen und Markierungen im Teilen-Link (Meilenstein 2, Schritt 2, CJ 20.10.2026; notizen.js, cloud.js shareNote*). Empfänger setzen sie
// auf den geteilten Blättern, die Zeichnung bleibt gesperrt (S.shared). Ebene #el-notes über der Zeichnung, nie in Datei, PDF oder DXF.
// Alle mit dem Link sehen alle Notizen zum Link (CJ 20.10.). Gast-Name und Zufallskennung im Browser (localStorage elplexacad.gast).
const EL_N = { list: [], keys: null, tool: null, mark: "rechteck", drag: null, off: false, bar: null, layer: null };
function elGuest() {
  let g = {}; try { g = JSON.parse(localStorage.getItem("elplexacad.gast")) || {}; } catch { /* ohne Speicher: Kennung gilt bis zum Schliessen */ }
  if (!g.id) { g.id = crypto.randomUUID(); elGuestKeep(g); }
  return g;
}
function elGuestKeep(g) { EL_N.guest = g; try { localStorage.setItem("elplexacad.gast", JSON.stringify(g)); } catch { /* egal */ } }
async function elNotesInit(raw) {
  EL_N.keys = N.sheetNoteKeys(raw, S.doc.sheets); EL_N.guest = elGuest();
  EL_N.layer = document.createElementNS("http://www.w3.org/2000/svg", "g"); EL_N.layer.id = "el-notes"; world.appendChild(EL_N.layer);
  EL_N.bar = document.createElement("div"); EL_N.bar.id = "el-notebar"; EL_N.bar.setAttribute("role", "toolbar"); EL_N.bar.setAttribute("aria-label", "Notizen");
  stage.appendChild(EL_N.bar);
  EL_N.bar.addEventListener("click", (e) => { const b = e.target.closest("[data-elnote]"); if (b && !b.disabled) elNoteCmd(b.dataset.elnote); });
  stage.addEventListener("pointerdown", elNoteDown, true); // vor dem Verschieben der Ansicht (Zeichenfläche)
  elNoteBar();
  await elNotesLoad();
}
async function elNotesLoad() {
  try { const r = await shareNotes(S.shared, EL_N.guest.id); if (r.grund) return elNoteDead(); EL_N.list = r.notes || []; }
  catch (err) { toast("Notizen: " + (err.message || err), "error"); }
  elNoteBar(); elNotesDraw();
}
function elNoteDead() { EL_N.off = true; elNoteTool(null); toast(N.NOTE_GRUND.link.replace(" Die Notiz wurde nicht gespeichert.", ""), "error"); }
const elNoteKey = () => EL_N.keys?.get(S.model);
function elNoteBar() { if (EL_N.bar) EL_N.bar.innerHTML = N.noteBarHTML(EL_N.tool, EL_N.list.length, EL_N.off); }
function elNotesDraw() { if (EL_N.layer) EL_N.layer.innerHTML = N.notesSVG(EL_N.list, elNoteKey(), S.view.z, EL_N.drag?.box ? { kind: EL_N.tool, ...EL_N.drag.box } : null); }
function elNoteTool(t) {
  EL_N.tool = EL_N.off ? null : t; EL_N.drag = null;
  svg.classList.toggle("el-noting", !!EL_N.tool);
  elNoteBar(); elNotesDraw();
}
function elNoteCmd(c) {
  if (c === "liste") return elNoteList();
  if (EL_N.off) return toast(N.NOTE_GRUND.link.replace(" Die Notiz wurde nicht gespeichert.", ""), "error");
  if (!EL_N.keys.get(S.model)) return toast("Auf diesem Blatt gehen keine Notizen.");
  if (c === "mark") { if (EL_N.tool === "kreis" || EL_N.tool === "rechteck") EL_N.mark = EL_N.tool === "kreis" ? "rechteck" : "kreis"; return elNoteTool(EL_N.mark); } // nochmals M wechselt Kreis und Rechteck
  elNoteTool(EL_N.tool === c ? null : c);
}
function elNoteDown(e) {
  const pin = e.target.closest?.("[data-note]");
  if (pin && !EL_N.tool) { e.stopPropagation(); e.preventDefault(); window.addEventListener("pointerup", () => setTimeout(() => elNoteView(pin.dataset.note)), { once: true }); return; }
  if (!EL_N.tool || e.button !== 0 || !e.target.closest("#svg")) return;
  e.stopPropagation(); e.preventDefault();
  const { sx, sy } = pointerPos(e), a = toWorld(sx, sy);
  if (EL_N.tool === "notiz") { // Fenster erst nach dem Loslassen, sonst trifft der Klick ein Feld oder „Abbrechen“ im Fenster
    window.addEventListener("pointerup", () => setTimeout(() => elNoteForm({ kind: "notiz", x: a.x, y: a.y, w: 0, h: 0 })), { once: true });
    return;
  }
  EL_N.drag = { a, box: null };
  const move = (ev) => { const p = pointerPos(ev); EL_N.drag.box = N.boxOf(a, toWorld(p.sx, p.sy)); elNotesDraw(); };
  const up = (ev) => {
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    const p = pointerPos(ev), box = N.boxOf(a, toWorld(p.sx, p.sy)), d = EL_N.drag; EL_N.drag = null;
    if (!d) return;
    if (Math.max(box.w, box.h) * S.view.z < 8) { elNotesDraw(); toast("Markierung aufziehen: Maus gedrückt halten und ziehen."); return; } // nur geklickt
    const kind = EL_N.tool; setTimeout(() => elNoteForm({ kind, ...box })); // nach dem Klick, siehe Notiz
  };
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
}
// Text eingeben und speichern; bei Fehler bleibt das Fenster mit dem Text offen (zum Kopieren oder nochmals Versuchen)
async function elNoteForm(pos, text = "", msg = "", author = "") {
  const kind = pos.kind, drawBox = kind !== "notiz" ? { ...pos } : null;
  if (drawBox) { EL_N.drag = { box: drawBox }; elNotesDraw(); } // Markierung bleibt sichtbar, solange das Fenster offen ist
  const name = EL_N.guest.name || "";
  const r = await openModal(kind === "notiz" ? "Notiz" : "Markierung", N.noteFormHTML(kind, name, text, msg, author), (b, done) => {
    if (b.dataset.c !== undefined) done(null);
    else if (b.dataset.ok !== undefined) { const f = (k) => $(`#modal-root [data-nf="${k}"]`)?.value; done({ text: f("text") ?? "", author: name || f("author") || "" }); }
  }, null, name || author ? "textarea" : "input");
  EL_N.drag = null; elNotesDraw();
  if (!r) return;
  const sheet = elNoteKey(), c = N.cleanNote({ ...pos, ...r, sheet, sheet_label: elShName(S.model) });
  const again = (m) => elNoteForm(pos, r.text, m, r.author); // Fenster wieder mit Text und Name
  if (c.error) return again(c.error);
  if (!name) elGuestKeep({ ...EL_N.guest, name: c.note.author });
  let res;
  try { res = await shareNoteAdd(S.shared, EL_N.guest.id, c.note); } catch (err) { return again(err.message || String(err)); }
  if (res.grund === "link") { elNoteDead(); return again(N.NOTE_GRUND.link); }
  if (res.grund) return again(N.NOTE_GRUND[res.grund] || N.NOTE_GRUND.eingabe);
  EL_N.list.push({ ...c.note, id: res.id, created_at: res.created_at, status: "offen", mine: true });
  elNoteTool(null); toast(`${kind === "notiz" ? "Notiz" : "Markierung"} ${EL_N.list.length} gespeichert.`);
}
const elNoteSheet = (n) => S.doc.sheets.find((sh) => EL_N.keys.get(sh) === n.sheet);
const elShName = (sh) => sheetLabel(sh, S.doc.sheets.indexOf(sh));
function elNoteView(id) {
  const i = EL_N.list.findIndex((n) => n.id === id), n = EL_N.list[i];
  if (!n) return;
  openModal(`${n.kind === "notiz" ? "Notiz" : "Markierung"} ${i + 1}`, N.noteViewHTML(n, i + 1, elNoteSheet(n) ? elShName(elNoteSheet(n)) : n.sheet_label), (b, done) => {
    if (b.dataset.c !== undefined) done();
    else if (b.dataset.ndel) { done(); elNoteDelete(b.dataset.ndel); }
  }, null, "[data-c]");
}
async function elNoteDelete(id) {
  if (!(await confirmDialog("Notiz löschen", "Die eigene Notiz wird für alle mit diesem Link gelöscht.", "Löschen"))) return;
  let r;
  try { r = await shareNoteDelete(S.shared, EL_N.guest.id, id); } catch (err) { toast(err.message || String(err), "error"); return; }
  if (r.grund === "link") return elNoteDead();
  if (r.grund) { toast(N.NOTE_GRUND[r.grund] || N.NOTE_GRUND.fehlt); return elNotesLoad(); }
  EL_N.list = EL_N.list.filter((n) => n.id !== id); elNoteBar(); elNotesDraw(); toast("Notiz gelöscht.");
}
function elNoteList() {
  openModal("Notizen zu diesem Link", N.noteListHTML(EL_N.list, (n) => { const sh = elNoteSheet(n); return sh ? elShName(sh) : null; }), (b, done) => {
    if (b.dataset.c !== undefined) done();
    else if (b.dataset.ngo) { done(); elNoteGo(b.dataset.ngo); }
    else if (b.dataset.ndel) { done(); elNoteDelete(b.dataset.ndel); }
  }, null, "[data-ngo],[data-c]", "el-nlistmodal");
}
function elNoteGo(id) { // zum Blatt springen, Notiz in die Mitte
  const n = EL_N.list.find((x) => x.id === id), sh = n && elNoteSheet(n);
  if (!sh) return;
  if (EL_S.hub && !EL_S.hub.hidden) elHub(false);
  switchSheet(S.doc.sheets.indexOf(sh));
  const r = stage.getBoundingClientRect(), cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  S.view = { ...S.view, x: r.width / 2 - cx * S.view.z, y: r.height / 2 - (H - cy) * S.view.z };
  applyView(); renderSheet();
}
// Fenster „Link teilen“ (Ersteller): gültige Links zeigen, kopieren, widerrufen, neuen Link (30 Tage, Vorgabe der Datenbank) erstellen.
// Ist es das offene Projekt, wählen Häkchen die Module (CJ 18.10.2026); only = Vorwahl ein Modul (Exportieren › Modul teilen). Alle Häkchen = ganzes Projekt.
async function elShareDialog(id, only = null) {
  const name = EL_S.onlist?.find((x) => x.id === id)?.name || elName(), mine = S.doc.project?.online?.id === id;
  const ids = mine ? E.modIds(S.doc).filter((m) => !E.modById(m)?.auto) : [], pick = mine ? { ids, on: new Set(only ? [only] : ids), prices: false } : null, nm = (m) => modName(mine ? S.doc : {}, m);
  let links = null;
  const draw = () => { const m = $("#modal-root .modal"); if (m) m.querySelector(".el-shbody").innerHTML = E.shareDialogHTML(name, links, shareUrl, pick, nm); };
  const load = async (fn) => { try { const l = await fn(); if (l) links = l; } catch (err) { toast(err.message || String(err), "error"); } draw(); };
  const copy = async (token) => {
    const url = shareUrl(token);
    try { await navigator.clipboard.writeText(url); toast("Link kopiert. Gültig 30 Tage, nur zum Ansehen."); }
    catch { const i = [...document.querySelectorAll("#modal-root .el-shurl")].find((x) => x.value === url); i?.select(); toast("Kopieren ging nicht automatisch: Link ist markiert, mit ⌘C kopieren."); }
  };
  const tick = (e) => { if (pick && e.target.matches?.("[data-shprices]")) { pick.prices = e.target.checked; return; } const b = e.target.closest("[data-shmod]"); if (!b || !pick) return; if (b.checked) pick.on.add(b.dataset.shmod); else pick.on.delete(b.dataset.shmod); draw(); };
  const shown = openModal("Link teilen", `<div class="el-shbody">${E.shareDialogHTML(name, null, shareUrl, pick, nm)}</div>`, async (b, done) => {
    if (b.dataset.c !== undefined) done(null);
    else if (b.dataset.shnew !== undefined) {
      b.disabled = true; let n = null;
      // Mit Offerte immer als Liste: «ganzes Projekt» (ohne Liste) zeigt die Datenbank ohne Offerte (Migration 20261026_share_offerte)
      const mods = pick && (pick.on.size < ids.length || ids.some((m) => E.baseOf(m) === "offerte")) ? ids.filter((m) => pick.on.has(m)) : null;
      const prices = !!(pick?.prices && mods?.some((m) => E.baseOf(m) === "offerte"));
      await load(async () => { n = await shareCreate(id, mods, prices); return n ? [n, ...links] : null; }); if (n) copy(n.token);
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
  setRemote(userStore); PD.setRemote(posStore); cloudOnSession(profSync); profSync();
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
