// Stringplan bearbeiten (Modul PV-Strings): Werkzeuge, Seitenleisten, Hintergrund zeichnen. Rechnen in pv.js, PDF in pdfbg.js.
// Bekommt die Editor-Funktionen von app.js übergeben (wie files.js). Schritt 2: PDF-Plan, Messstrecke, Fixpunkt. Schritt 3: Ebenen, Dach nachzeichnen, Fang.
// Schritt 4: Modultypen (Katalog), Modul und Modulfeld setzen. Schritt 5: Verkabelung (Strings per Klickfolge, 5c: oder ⌥ und Überfahren), SPA.
// Schritt 6: Blatt Stringübersicht (kind "pvtab") wird hier an pvtab.js weitergereicht, app.js behandelt es wie einen Stringplan.
// Schritt 7: Papier, Druckmassstab, Plankopf, Druck (Seiten in pvprint.js).
import * as P from "./pv.js";
import * as T from "./pvtab.js";
import { openPdf, pageSize, toBase64, imageFor, imageReady } from "./pdfbg.js";
import * as PR from "./pvprint.js";
import * as R from "./render.js";
import { cloudMenu } from "./cloud.js";
import { modOf, modVar, modName } from "./model.js";

const ICON = {
  measure: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 16.5L16.5 3 21 7.5 7.5 21z"/><path d="M7 12.5l2 2M10 9.5l2 2M13 6.5l2 2"/></svg>',
  roof: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18L9 7l7 4 5-6"/><circle cx="3" cy="18" r="1.4"/><circle cx="9" cy="7" r="1.4"/><circle cx="16" cy="11" r="1.4"/></svg>',
  keepout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M4 11l6-6M4 17L16 5M8 19L20 7M14 19l6-6"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" opacity=".35"/><path d="M4 4l16 16"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5" opacity=".35"/><path d="M8 11V8a4 4 0 017.5-2" opacity=".35"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 11-2.3-5.6"/><path d="M20 4v5h-5"/></svg>',
  module: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="1"/><path d="M7 9h10M7 15h10M12 3v18"/></svg>',
  field: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="5" height="7"/><rect x="9.5" y="4" width="5" height="7"/><rect x="16" y="4" width="5" height="7"/><rect x="3" y="13" width="5" height="7"/><rect x="9.5" y="13" width="5" height="7"/><rect x="16" y="13" width="5" height="7"/></svg>',
  string: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="6" height="7"/><rect x="16" y="13" width="6" height="7"/><path d="M5 7.5h7v9h7"/></svg>',
  auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h14a3.5 3.5 0 010 7H7a3.5 3.5 0 000 7h14"/><path d="M18 16l3 3-3 3"/></svg>',
  spa: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="12" r="5"/><path d="M5.5 8.5l7 7M12.5 8.5l-7 7M16 12h6"/></svg>',
  scale: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17h18M3 14v3M7.5 15.5V17M12 14v3M16.5 15.5V17M21 14v3"/><path d="M7 5v6M12 6.5v.01M12 9.5v.01M16 5v6"/></svg>',
  line: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19V9h9V4h9" stroke-width="3" stroke-linejoin="miter"/></svg>',
  point: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="2.6" fill="currentColor"/><path d="M11 9h10M11 13h7"/></svg>',
  fix: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/></svg>',
};
const FIX_COLOR = "#c2410c", MEASURE_COLOR = "#9b3d8f";
const BG_OPACITY = 0.6; // Plan blass, damit Module und Strings hervortreten (Annahme Claude)
const ROOF_COLOR = "#17212b", KEEPOUT_COLOR = "#b42318", SNAP_COLOR = "#2f9e58";
const SNAP_PX = 8; // Fangradius in Bildschirm-Pixeln (Annahme Claude)
const GRIP_PX = 4; // Griff an den Punkten gewählter Dachobjekte, halbe Seitenlänge in Pixeln
const DRAW_TOOLS = { "pv-roof": "Dachlinie", "pv-keepout": "Sperrfläche" };
const PLAN_TOOLS = ["pv-measure", "pv-fix", "pv-rotate"]; // nur bei aktiver Ebene Hintergrund sichtbar
const MOD_TOOLS = { "pv-module": "Modul", "pv-field": "Modulfeld" }; // Module liegen immer auf der Ebene Module (Annahme Claude)
const MOD_COLOR = "#1f4e79", MOD_FILL = "#dbe6f1"; // Modul auf einer Sperrfläche: KEEPOUT_COLOR
const WIRE_TOOLS = { "pv-string": "String", "pv-spa": "SPA", "pv-line": "Leitung", "pv-point": "Punkt" }; // Strings, SPA, Leitungen und Punkte liegen immer auf der Ebene Verkabelung (wie Module auf Module)
// Werkzeuge je Ebene (Schritt 5b, CJ 14.10.): links erscheinen nur die Werkzeuge der aktiven Ebene
const toolLayer = (t) => (PLAN_TOOLS.includes(t) ? "bg" : DRAW_TOOLS[t] ? "dach" : MOD_TOOLS[t] ? "module" : WIRE_TOOLS[t] || t === "pv-autopick" ? "kabel" : null); // pv-autopick: Module für die Autoverkabelung wählen (5bc)
// Tasten für Werkzeuge (Schritt 5d, Vorschlag Claude): M und F sind schon belegt (Blatt anheften, Einpassen). K Leitung (Kabelweg), O Punkt (5ax, 5ay, Wahl Claude: frei)
const TOOL_KEYS = { s: "pv-string", p: "pv-spa", e: "pv-module", b: "pv-field", k: "pv-line", o: "pv-point" };
const keyOf = (t) => Object.keys(TOOL_KEYS).find((k) => TOOL_KEYS[k] === t)?.toUpperCase() ?? "";
const MARK_R = 216; // Kreis für + und − (5ar, CJ 15.10.: leicht grösser, 1,2 × von 180 mm)
// Füllmuster (5h): massstäblich in mm, dezent, damit Module lesbar bleiben. Masse und Farben Annahme Claude.
const FILL_DEF = { "ziegel-rot": ["ziegel", "#b5583a"], "ziegel-dunkel": ["ziegel", "#4b4542"], "trapez-hell": ["trapez", "#a3a9af"], "trapez-dunkel": ["trapez", "#5b6166"], "trapez-braun": ["trapez", "#7b5638"] };
const TILE_W = 300, TILE_H = 340, RIB = 250; // Ziegelbreite, Lattweite, Rippenabstand Trapezblech in mm
// ang = Richtung in Grad (5i: 0 oder 90, dazu die Drehung des Plans)
const HATCH = 200, HATCH_COLOR = "#6b7785"; // Sperrfläche (5u): graue Kreuzschraffur, Linienabstand 200 mm (Annahme Claude)
function patternSVG(id, f, ang) {
  if (f === "kreuz") return `<pattern id="${id}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)" width="${HATCH}" height="${HATCH}"><path d="M0 0H${HATCH}M0 0V${HATCH}" fill="none" stroke="${HATCH_COLOR}" stroke-opacity="0.6" stroke-width="10" style="vector-effect:none"/></pattern>`;
  const [kind, col] = FILL_DEF[f], tr = ang ? ` patternTransform="rotate(${ang})"` : "", ln = `fill="none" stroke="${col}" stroke-opacity="0.55" stroke-width="12" style="vector-effect:none"`;
  if (kind === "ziegel") return `<pattern id="${id}" patternUnits="userSpaceOnUse"${tr} width="${TILE_W}" height="${2 * TILE_H}"><rect width="${TILE_W}" height="${2 * TILE_H}" fill="${col}" fill-opacity="0.2" stroke="none"/>`
    + `<path d="M0 0H${TILE_W}M0 ${TILE_H}H${TILE_W}M0 0V${TILE_H}M${TILE_W / 2} ${TILE_H}V${2 * TILE_H}" ${ln}/></pattern>`; // Reihen versetzt
  return `<pattern id="${id}" patternUnits="userSpaceOnUse"${tr} width="${RIB}" height="${RIB}"><rect width="${RIB}" height="${RIB}" fill="${col}" fill-opacity="0.18" stroke="none"/>`
    + `<rect x="${RIB * 0.4}" width="${RIB * 0.2}" height="${RIB}" fill="${col}" fill-opacity="0.3" stroke="none"/><path d="M${RIB * 0.4} 0V${RIB}M${RIB * 0.6} 0V${RIB}" ${ln}/></pattern>`; // Rippen senkrecht
}
let fillSeq = 0; // Muster-ids je Zeichnung eindeutig (Bildschirm und jede Druckseite) // Kreis für + und − in mm (Annahme Claude: 1,8 mm bei 1:100)

export function makePv(c) {
  const { S, $, TOOLS, toast, change, chooseDialog, formDialog, confirmDialog, setTool, renderSheet, applyView, fitView } = c;
  const isPv = () => S.model.kind === "pv";
  P.setTypeSource(() => S.doc.pv?.moduleTypes ?? []);
  P.setItemSource(() => S.model.items);
  P.setDocSource(() => S.doc); // Anlage je Datei (5k)
  const types = () => S.doc.pv?.moduleTypes ?? [];
  // Einstellungen für neue Module (nur in der Sitzung): Modultyp, Lage, Feldgrösse, Abstände in mm
  // gq/gl: Abstand quer bzw. längs zum Modul (5y, CJ 15.10.).
  const opt = { mt: null, quer: false, cols: 5, rows: 2, gq: P.GAP, gl: P.GAP, lw: P.LINE_W, lcol: P.LINE_COL }; // lw, lcol: neue Leitungen (5ax)
  let corner = P.CORNERS[0]; // Bezugsecke neuer Module, Tab wechselt (5x, CJ 15.10.), bleibt in der Sitzung
  // Tab bzw. Shift+Tab bei Modul oder Modulfeld: nächste bzw. vorherige Ecke. Rückgabe: Taste behandelt?
  function cornerKey(back) {
    if (!MOD_TOOLS[S.tool]) return false;
    corner = P.nextCorner(corner, back ? -1 : 1);
    c.renderRight(); c.renderOverlay(); c.updateHint();
    return true;
  }
  const curType = () => P.modType(opt.mt) ?? types()[0];
  const bg = () => S.model.bg;
  let draft = null; // Messstrecke oder Kante zum Drehen: erster Punkt (Welt)
  let path = null; // Dachlinie oder Sperrfläche im Entstehen: { type, pts, sheet, layer }
  let wire = null; // String im Entstehen: { sheet, name, mods: [ids] }
  let lpath = null; // Leitung im Entstehen (5ax): { sheet, pts }
  let autoSet = null; // Autoverkabelung eingeschränkt (5bc): { sheet, ids: Set }, nur in der Sitzung
  const picking = () => S.tool === "pv-autopick";
  // Erlaubte Module des offenen Stringplans (gelöschte fallen weg), null = keine Einschränkung
  function autoIds() {
    if (autoSet?.sheet !== S.model) return null;
    const ids = new Set(S.model.items.filter((m) => m.type === "pvmodule" && autoSet.ids.has(m.id)).map((m) => m.id));
    return ids.size ? ids : null;
  }
  let sname = null; // Bezeichnung für den nächsten String, null = Vorschlag (P.nextName)
  const nextName = () => sname ?? P.nextName(S.model);
  // Aktive Ebene (Schritt 3c, wie AutoCAD): neue Objekte landen darauf. Seit 5q (CJ 15.10.) in der Datei gespeichert, eine für die ganze Datei:
  // doc.pvLayer, fehlt = Dach. Ausserhalb des Rückgängig-Speichers (snapshot), Wechsel markiert die Datei als geändert.
  const act = () => S.doc.pvLayer ?? "dach";
  const storeAct = (l) => { if (l === "dach") delete S.doc.pvLayer; else S.doc.pvLayer = l; c.markDirty(); };
  function setActive(l) {
    if (!P.DRAW_LAYERS.includes(l) || l === act()) return;
    storeAct(l);
    const t = toolLayer(S.tool);
    if (t && t !== l) setTool("select"); // Werkzeug der alten Ebene verschwindet, Entwurf wird wie beim Werkzeugwechsel beendet
    renderSheet(); c.renderLeft(); c.updateHint(); // Messstrecke und Fixpunkt nur bei aktivem Hintergrund
  }
  // Plan-Werkzeuge, Messstrecke und Fixpunkt zeigen: nur bei aktivem Hintergrund (ohne Plan auch das Fixpunktkreuz)
  const planShown = () => act() === "bg" || !bg();
  const lay = (l) => P.layerState(S.model, l);
  const layerName = (l) => P.LAYERS.find(([k]) => k === l)[1];
  // Darf auf der Ebene gezeichnet werden? Sonst Meldung.
  function layerFree(l) {
    const s = lay(l);
    if (s.show && !s.lock) return true;
    toast(`Die Ebene ${layerName(l)} ist ${s.show ? "gesperrt" : "ausgeblendet"}. Links unter „Ebenen“ freigeben.`, "error");
    return false;
  }

  // ---------- Zeichnen ----------
  function sheetSVG() {
    const z = S.view.z, b = bg();
    let s = `<rect class="dispo-bg" x="-1e6" y="-1e6" width="2e6" height="2e6"/>`;
    if (b?.asset && lay("bg").show && !S.model.hide?.includes("bg")) { // Druckteil Hintergrundplan gilt auch hier (5ai)
      const url = imageFor(S.doc.assets, b.asset, b.page, (err) => {
        if (err) toast("Der PDF-Plan lässt sich nicht anzeigen: " + err, "error");
        if (isPv()) renderSheet();
      });
      s += bgSVG(b, url);
    }
    if (S.grid.on && S.grid.size * z >= 7) s += `<rect x="-1e6" y="-1e6" width="2e6" height="2e6" fill="url(#gridpat)" stroke="none" pointer-events="none"/>`;
    if (b?.measure && lay("bg").show && act() === "bg") {
      const a = P.pageToWorld(b, ...b.measure.a), e = P.pageToWorld(b, ...b.measure.b);
      s += measureSVG(a, e, `${fmtMm(b.measure.mm)} mm`, z);
    }
    // Fixpunkt = Ursprung der Welt, blass solange er nur vorläufig unten links auf dem Plan liegt
    if (!planShown()) return s;
    const r = 7 / z, l = 16 / z;
    s += `<g stroke="${FIX_COLOR}" stroke-width="1.6" fill="none" pointer-events="none"${b && !b.fix ? ' opacity="0.35"' : ""}><circle cx="0" cy="0" r="${r}"/><path d="M${-l} 0H${l}M0 ${-l}V${l}"/></g>`;
    return s;
  }
  // PDF-Seite als Bild in der Welt (Massstab, Fixpunkt, Drehung). Ohne Bild ein Platzhalter, bis es gerendert ist.
  function bgSVG(b, url) {
    const k = P.mmPerPt(b), [fu, fv] = P.fixOf(b), tr = `${b.rot ? `rotate(${b.rot}) ` : ""}translate(${-fu * k} ${fv * k}) scale(${k} ${-k})`;
    if (url) return `<g transform="${tr}" opacity="${BG_OPACITY}"><image href="${url}" x="0" y="0" width="${b.w}" height="${b.h}" preserveAspectRatio="none"/></g>`;
    return `<rect transform="${tr}" x="0" y="0" width="${b.w}" height="${b.h}" fill="#eef1f4"/>`;
  }
  // Druckbereich (Schritt 7): Planfeld des gewählten Papiers im Massstab, gestrichelt, mit Beschriftung
  function printFrameSVG(c0 = printCenter(S.model)) {
    const p = P.paperOf(S.model), a = P.printArea(p), hw = (a.x1 - a.x0) * p.den / 2, hh = (a.y1 - a.y0) * p.den / 2, h = 3 * p.den; // Beschriftung 3 mm auf dem Papier
    return `<g class="pv-printframe" pointer-events="none"><rect x="${R.f(c0.x - hw)}" y="${R.f(c0.y - hh)}" width="${R.f(2 * hw)}" height="${R.f(2 * hh)}" fill="none" stroke="#6b7785" stroke-width="1" stroke-dasharray="8 5"/>`
      + `<text x="${R.f(c0.x - hw)}" y="${R.f(-(c0.y + hh) - h * 0.5)}" transform="scale(1 -1)" font-size="${h}" fill="#6b7785" style="font-family:var(--sheet-font)">Druckbereich ${P.paperLabel(p)}, ${P.fmtDen(p.den)}</text></g>`;
  }
  // Mitte des Drucks: gesetzte Druckmitte (5ao, CJ 15.10.: Klick im Plan), sonst Mitte aller sichtbaren Objekte, ohne Objekte die Mitte des Plans
  function contentBox(sh) {
    const boxes = sh.items.filter((it) => it.type !== "pvstring" && P.visible(sh, it)).map((i) => R.itemBBox(i)); // String liegt auf seinen Modulen
    if (!boxes.length && sh.bg) boxes.push(P.bgBox(sh.bg));
    if (!boxes.length) return null;
    return { x0: Math.min(...boxes.map((q) => q.x0)), y0: Math.min(...boxes.map((q) => q.y0)), x1: Math.max(...boxes.map((q) => q.x1)), y1: Math.max(...boxes.map((q) => q.y1)) };
  }
  function printCenter(sh) { if (sh.pmid) return { x: sh.pmid[0], y: sh.pmid[1] }; const b = contentBox(sh); return b ? { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 } : { x: 0, y: 0 }; }
  function measureSVG(a, e, label, z) {
    const mx = (a.x + e.x) / 2, my = (a.y + e.y) / 2, h = 12 / z;
    return `<g pointer-events="none"><line x1="${a.x}" y1="${a.y}" x2="${e.x}" y2="${e.y}" stroke="${MEASURE_COLOR}" stroke-width="2" stroke-dasharray="${6 / z} ${4 / z}"/>`
      + `<circle cx="${a.x}" cy="${a.y}" r="${3 / z}" fill="${MEASURE_COLOR}"/><circle cx="${e.x}" cy="${e.y}" r="${3 / z}" fill="${MEASURE_COLOR}"/>`
      + (label ? `<text x="${mx}" y="${-my - h * 0.6}" transform="scale(1 -1)" font-size="${h}" text-anchor="middle" fill="${MEASURE_COLOR}" style="font-family:var(--sheet-font)">${R.esc(label)}</text>` : "") + "</g>";
  }
  // Objekte des Stringplans: Dach unten, Beschriftung oben. Ausgeblendete Ebenen fehlen.
  // H = Teile, die nicht gezeichnet werden (Druckteile 5l, seit 5ai auch am Bildschirm).
  function itemsSVG(sh = S.model, H = new Set(sh.hide ?? [])) {
    const vis = sh.items.filter((it) => P.visible(sh, it) && !H.has(P.partOf(it)));
    let s = "";
    const pid = `pvfill${++fillSeq}-`, pats = new Map(); // je Füllung und Richtung ein Muster
    const url = (it) => { const k = `${it.fill}@${it.fdir || 0}`; if (!pats.has(k)) pats.set(k, [pid + pats.size, it.fill, it.fdir || 0]); return `url(#${pats.get(k)[0]})`; };
    let paths = "";
    for (const it of vis) if (P.PV_TYPES.has(it.type)) {
      const f = it.type === "keepout" ? url({ fill: "kreuz" }) : it.fill && P.fillable(it) && !H.has("fill") ? url(it) : ""; // Sperrfläche: Kreuzschraffur (5u)
      if (it.type === "roofline" && H.has("roof")) { if (f) paths += `<polygon points="${it.pts.map((p) => R.f(p[0]) + "," + R.f(p[1])).join(" ")}" fill="${f}" stroke="none"/>`; } // nur die Füllung
      else paths += pathSVG(it.type, it.pts, P.isClosed(it), "", f);
    }
    if (pats.size) s += `<defs>${[...pats.values()].map(([id, f, a]) => patternSVG(id, f, a)).join("")}</defs>`;
    s += paths;
    const tint = new Map(); // Module eines Strings leicht eingefärbt (auch wenn die Verkabelung ausgeblendet ist)
    for (const st of P.strings(sh)) for (const id of st.mods) tint.set(id, P.stringColor(st.name));
    for (const it of vis) if (it.type === "pvmodule") s += modSVG(P.modRect(it), P.onKeepout(sh, it), modRot(it), tint.get(it.id));
    for (const it of vis) if (it.type === "pvline") s += lineSVG(it.pts, it.w, it.col); // Leitungen über den Modulen, unter den Strings
    for (const it of vis) if (it.type === "pvstring" && !(wire?.edit === it.id && wire.sheet === sh)) s += stringSVG(it.name, P.strPts(it, sh.items), "", H, sh.strk || 1); // String in Bearbeitung: Vorschau im Overlay
    for (const it of vis) if (it.type === "spa") s += spaSVG(it.x, it.y);
    for (const it of vis) if (it.type === "pvpoint") s += pointSVG(it);
    return s + R.itemsSVG(vis.filter((it) => it.type === "text"), "schema");
  }
  function pathSVG(type, pts, closed, extra = "", fill = "") {
    const pp = pts.map((p) => R.f(p[0]) + "," + R.f(p[1])).join(" ");
    if (type === "keepout") return `<polygon class="pv-keepout" points="${pp}" ${fill ? `fill="${fill}"` : `fill="${KEEPOUT_COLOR}" fill-opacity="0.12"`} stroke="${KEEPOUT_COLOR}" stroke-width="1.4" stroke-dasharray="6 4" stroke-linejoin="round" ${extra}/>`;
    return `<${closed ? "polygon" : "polyline"} points="${pp}" fill="${fill || "none"}" stroke="${ROOF_COLOR}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
  }
  // Gedrehtes Modul (nach „Plan drehen“, Schritt 5f): Rechteck um die Ecke unten links gedreht
  const modRot = (m) => (m.rot ? `transform="rotate(${m.rot} ${R.f(m.x)} ${R.f(m.y)})"` : "");
  // Modul als Rechteck, auf einer Sperrfläche rot (Warnung, CJ 14.10.), in einem String in dessen Farbe eingefärbt
  function modSVG(b, warn, extra = "", tint) {
    const c = warn ? KEEPOUT_COLOR : MOD_COLOR, fill = warn ? `fill="#f6d4d1"` : tint ? `fill="${tint}" fill-opacity="0.22"` : `fill="${MOD_FILL}"`;
    return `<rect class="pv-module${warn ? " warn" : ""}" x="${R.f(b.x0)}" y="${R.f(b.y0)}" width="${R.f(b.x1 - b.x0)}" height="${R.f(b.y1 - b.y0)}" ${fill} stroke="${c}" stroke-width="1.2" ${extra}/>`;
  }
  // Text in der Welt (y nach oben), Höhe h in mm
  const wText = (x, y, str, h, color, anchor = "middle", cls = "") => `<text${cls ? ` class="${cls}"` : ""} x="${R.f(x)}" y="${R.f(-y)}" transform="scale(1 -1)" font-size="${h}" font-weight="600" text-anchor="${anchor}" dominant-baseline="central" fill="${color}" style="font-family:var(--sheet-font)">${R.esc(str)}</text>`;
  // String: Kabellinie durch die Modulmitten, + am ersten Modul, − am letzten (CJ 14.10.), Bezeichnung neben dem +
  // k = Grösse der Beschriftung (5bb, Blattfeld strk), Bezeichnung und + − im gleichen Verhältnis
  function stringSVG(name, pts, extra = "", H = new Set(), k = 1) {
    if (!pts.length) return "";
    const col = P.stringColor(name), one = pts.length === 1, mr = MARK_R * k, d = one ? mr * 1.3 : 0; // ein Modul: + links, − rechts
    const mark = ([x, y], sign, cls) => `<circle class="${cls}" cx="${R.f(x)}" cy="${R.f(y)}" r="${R.f(mr)}" fill="#fff" stroke="${col}" stroke-width="1.6"/>` + wText(x, y, sign, mr * 1.6, col);
    const a = [pts[0][0] - d, pts[0][1]], e = [pts.at(-1)[0] + d, pts.at(-1)[1]];
    return `<g class="pv-string" data-name="${R.esc(name)}" ${extra}>`
      + (one || H.has("str") ? "" : `<polyline points="${pts.map((p) => R.f(p[0]) + "," + R.f(p[1])).join(" ")}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`)
      + (H.has("pm") ? "" : mark(a, "+", "pv-plus") + mark(e, "−", "pv-minus")) + (H.has("name") ? "" : wText(a[0] - mr * 1.4, a[1] + mr * 1.4, name, P.PV_NAME_H * k, col, "end", "pv-name")) + "</g>";
  }
  // Leitung (5ax): massstäblich breit (style, damit weder Bildschirm noch Druck die Linienbreite ersetzen), Ecken spitz wie ein Kabelkanal
  const lineSVG = (pts, w, col, extra = "") => `<polyline class="pv-line" points="${pts.map((p) => R.f(p[0]) + "," + R.f(p[1])).join(" ")}" fill="none" stroke="${col}" style="stroke-width:${R.f(w)};vector-effect:none" stroke-linejoin="miter" stroke-linecap="butt" ${extra}/>`;
  // Punkt mit Beschriftung (5ay): gefüllter Kreis, Text daneben (verschiebbar über ox/oy)
  function pointSVG(it, extra = "") {
    const [lx, ly] = P.pointLabel(it);
    return `<g class="pv-point" ${extra}><circle cx="${R.f(it.x)}" cy="${R.f(it.y)}" r="${P.PT_R}" fill="${ROOF_COLOR}" stroke="none"/>${it.s ? wText(lx, ly, it.s, it.h ?? P.PV_TEXT_H, ROOF_COLOR, "start") : ""}</g>`;
  }
  // SPA: Kreis mit Kreuz und Beschriftung (Platzhalter bis Phase 2)
  function spaSVG(x, y, extra = "") {
    const r = P.SPA_R, q = r * 0.7, c = "#17212b";
    return `<g class="pv-spa" ${extra}><circle cx="${R.f(x)}" cy="${R.f(y)}" r="${r}" fill="#fff" stroke="${c}" stroke-width="1.6"/><path d="M${R.f(x - q)} ${R.f(y - q)}L${R.f(x + q)} ${R.f(y + q)}M${R.f(x - q)} ${R.f(y + q)}L${R.f(x + q)} ${R.f(y - q)}" stroke="${c}" stroke-width="1.4"/>`
      + wText(x + r * 1.4, y, "SPA", P.PV_TEXT_H, c, "start") + "</g>";
  }
  // Module, die ein Klick an Punkt p setzt (gewählte Ecke, 5x): ein Modul oder ein Feld
  function newModules(p) {
    const t = curType();
    if (!t) return [];
    const size = P.modSize(t, opt.quer), field = S.tool === "pv-field", [gx, gy] = P.gapsXY(opt.quer, opt.gq, opt.gl);
    return P.fieldAt(p, field ? opt.cols : 1, field ? opt.rows : 1, size, gx, gy, corner).map((q) => ({ type: "pvmodule", mt: t.id, x: q.x, y: q.y, quer: opt.quer })); // 5x; seit 5az (CJ 17.10.) ohne Drehung des Plans
  }
  function overlaySVG() {
    const z = S.view.z;
    if ((S.tool === "pv-measure" || S.tool === "pv-rotate") && draft && S.mouse) return measureSVG(draft, S.mouse, "", z);
    let s = "";
    if (S.tool === "pv-pmid" && S.mouse) s += printFrameSVG(S.mouse); // Vorschau des Druckbereichs (5ao)
    if (path && path.sheet === S.model) {
      const pts = S.mouse ? [...path.pts, [S.mouse.x, S.mouse.y]] : path.pts;
      s += pathSVG(path.type, pts, false, 'opacity="0.75" pointer-events="none"');
      const r = 4 / z; // erster Punkt: hier klicken schliesst
      s += `<rect x="${path.pts[0][0] - r}" y="${path.pts[0][1] - r}" width="${2 * r}" height="${2 * r}" fill="#fff" stroke="${SNAP_COLOR}" stroke-width="1.4" pointer-events="none"/>`;
    }
    if (lpath && lpath.sheet === S.model) s += lineSVG(S.mouse ? [...lpath.pts, [S.mouse.x, S.mouse.y]] : lpath.pts, opt.lw, opt.lcol, 'opacity="0.75" pointer-events="none"'); // Leitung im Entstehen
    if (S.tool === "pv-line" && !lpath && S.mouse) s += lineSVG([[S.mouse.x - opt.lw, S.mouse.y], [S.mouse.x + opt.lw, S.mouse.y]], opt.lw, opt.lcol, 'opacity="0.55" pointer-events="none"');
    if (S.tool === "pv-point" && S.mouse) s += pointSVG({ x: S.mouse.x, y: S.mouse.y, s: "" }, 'opacity="0.55" pointer-events="none"');
    if (S.tool === "select") for (const it of gripItems()) for (const [x, y] of it.pts ?? [P.pointLabel(it)]) { // Punkt (5ay): Griff am Textanfang
      const r = GRIP_PX / z;
      s += `<rect class="pv-grip" x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="#fff" stroke="${SNAP_COLOR}" stroke-width="1.4" pointer-events="none"/>`;
    }
    if (MOD_TOOLS[S.tool] && S.mouse) {
      for (const m of newModules(S.mouse)) s += modSVG(P.modRect(m), false, `opacity="0.55" pointer-events="none" ${modRot(m)}`);
      if (curType()) s += `<circle class="pv-anchor" cx="${R.f(S.mouse.x)}" cy="${R.f(S.mouse.y)}" r="${R.f(4 / z)}" fill="${SNAP_COLOR}" pointer-events="none"/>`; // Bezugsecke (5x)
    }
    const lim = (S.tool === "pv-string" && auto) && autoIds(); // 5bc: erlaubte Module hervorheben
    if (lim) for (const m of S.model.items) if (lim.has(m.id)) { const b = P.modRect(m); s += `<rect class="pv-allowed" x="${R.f(b.x0)}" y="${R.f(b.y0)}" width="${R.f(b.x1 - b.x0)}" height="${R.f(b.y1 - b.y0)}" ${modRot(m)} fill="${SNAP_COLOR}" fill-opacity="0.18" stroke="${SNAP_COLOR}" stroke-width="2" pointer-events="none"/>`; }
    if (S.tool === "pv-string") { // String im Entstehen (auch ohne Maus über dem Plan) und Modul unter dem Mauszeiger
      const m = S.mouse && modAt(S.mouse), own = wire?.sheet === S.model ? wire : null, col = P.stringColor(own?.name ?? nextName());
      const b = m && P.modRect(m);
      if (m) s += `<rect class="pv-hover" x="${R.f(b.x0)}" y="${R.f(b.y0)}" width="${R.f(b.x1 - b.x0)}" height="${R.f(b.y1 - b.y0)}" ${modRot(m)} fill="none" stroke="${P.stringOf(S.model, m.id) ? KEEPOUT_COLOR : col}" stroke-width="2.4" pointer-events="none"/>`;
      if (own) {
        const pts = P.strPts(own);
        s += stringSVG(own.name, own.front ? [...pts].reverse() : pts, 'opacity="0.8" pointer-events="none"', undefined, S.model.strk || 1); // am Anfang einfügen: + bleibt vorne
        const q = pts[own.at - 1] ?? pts.at(-1); // Linie ab der Einfügestelle (5e)
        if (q && S.mouse) s += `<line x1="${R.f(q[0])}" y1="${R.f(q[1])}" x2="${R.f(S.mouse.x)}" y2="${R.f(S.mouse.y)}" stroke="${col}" stroke-width="1.6" stroke-dasharray="6 4" pointer-events="none"/>`;
        if (S.mouse) s += wText(S.mouse.x + 14 / z, S.mouse.y - 14 / z, String(own.mods.length), 13 / z, col, "start", "pv-count"); // Zähler neben dem Mauszeiger (5c)
      }
    }
    if (S.tool === "pv-spa" && S.mouse) s += spaSVG(S.mouse.x, S.mouse.y, 'opacity="0.55" pointer-events="none"');
    if (S.mouse && (DRAW_TOOLS[S.tool] || MOD_TOOLS[S.tool] || S.tool === "pv-spa" || S.tool === "pv-line" || S.tool === "pv-point" || S.drag?.type === "pvvertex" && S.drag.started && !S.drag.label)) s += snapMarker(S.mouse, z);
    return s;
  }
  // Fangsymbol: Quadrat = Endpunkt, Kreis mit Kreuz = Schnittpunkt, Dreieck = Mitte, Kreuz = Kante, kleiner Punkt = Raster
  function snapMarker(m, z) {
    const r = 6 / z, a = `class="snap-${m.snap}" fill="none" stroke="${SNAP_COLOR}" stroke-width="1.6" pointer-events="none"`;
    if (m.snap === "end") return `<rect x="${m.x - r}" y="${m.y - r}" width="${2 * r}" height="${2 * r}" ${a}/>`;
    if (m.snap === "inter") { const q = r * 0.7; return `<g ${a}><circle cx="${m.x}" cy="${m.y}" r="${r}"/><path d="M${m.x - q} ${m.y - q}L${m.x + q} ${m.y + q}M${m.x - q} ${m.y + q}L${m.x + q} ${m.y - q}"/></g>`; }
    if (m.snap === "mid") return `<path d="M${m.x - r} ${m.y - r * 0.8}L${m.x + r} ${m.y - r * 0.8}L${m.x} ${m.y + r}Z" ${a}/>`;
    if (m.snap === "edge") return `<path d="M${m.x - r} ${m.y - r}L${m.x + r} ${m.y + r}M${m.x - r} ${m.y + r}L${m.x + r} ${m.y - r}" ${a}/>`;
    return `<circle cx="${m.x}" cy="${m.y}" r="${2.5 / z}" fill="${SNAP_COLOR}" pointer-events="none"/>`;
  }
  // Sichtbarer Bereich: Plan und Objekte mit Rand
  function bounds() {
    const boxes = S.model.items.map((i) => R.itemBBox(i));
    if (bg()) boxes.push(P.bgBox(bg()));
    if (!boxes.length) return { x0: -1000, y0: -1000, x1: 20000, y1: 12000 };
    const b = { x0: Math.min(...boxes.map((q) => q.x0)), y0: Math.min(...boxes.map((q) => q.y0)), x1: Math.max(...boxes.map((q) => q.x1)), y1: Math.max(...boxes.map((q) => q.y1)) };
    const pad = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.04 || 200;
    return { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad };
  }

  // Fang: Messstrecke und Fixpunkt ohne Raster (genau auf den Plan), sonst Raster ab Fixpunkt, Alt schaltet aus
  // Beim Zeichnen (Dachlinie, Sperrfläche, Text) zusätzlich Fang auf Dachlinien und Sperrflächen
  // Shift: rechtwinklig zum letzten Punkt (Zeichnen) bzw. zum vorherigen Punkt (Punkt ziehen)
  function snap(w) {
    if (PLAN_TOOLS.includes(S.tool) || S.tool === "pv-string") return { x: w.x, y: w.y };
    const grid = S.grid.on ? S.grid.size : 0, tol = SNAP_PX / S.view.z, d = S.drag?.type === "pvvertex" ? S.drag : null;
    if (d?.label) return { x: w.x, y: w.y }; // Text eines Punkts frei ziehen (5ay)
    if (d) return P.snapPv(S.model, w, { grid, tol, alt: S.alt, skip: d.it.id, extra: d.it.pts.filter((_, k) => k !== d.i), ortho: S.shift ? prevPt(d.it, d.i) : undefined });
    const drawing = !!DRAW_TOOLS[S.tool] || !!MOD_TOOLS[S.tool] || S.tool === "pv-spa" || S.tool === "pv-line" || S.tool === "pv-point" || S.tool === "text", own = path?.sheet === S.model, lown = lpath?.sheet === S.model;
    if (lown) return P.snapPv(S.model, w, { grid, tol, alt: S.alt, extra: lpath.pts, ortho: S.shift ? lpath.pts.at(-1) : undefined }); // Leitung: Shift 0°, 45°, 90° wie beim Dach (5ax)
    return P.snapPv(S.model, w, { grid, tol: drawing ? tol : 0, alt: S.alt, extra: own ? path.pts : [], ortho: own && S.shift && DRAW_TOOLS[S.tool] ? path.pts.at(-1) : undefined });
  }
  // Bezugspunkt für Shift beim Ziehen: vorheriger Punkt; beim ersten Punkt der letzte (geschlossen) bzw. der zweite (offen)
  const prevPt = (it, i) => it.pts[i > 0 ? i - 1 : P.isClosed(it) ? it.pts.length - 1 : 1];
  // Gewählte Objekte mit Griffen (nur auf freier Ebene): Dachobjekte und Leitungen an jedem Punkt, Punkte am Textanfang (5ax, 5ay)
  const gripItems = () => S.model.items.filter((it) => S.sel.has(it.id) && (P.PV_TYPES.has(it.type) || it.type === "pvline" || it.type === "pvpoint") && P.pickable(S.model, it));
  // Griff unter dem Mauszeiger: { it, i } oder { it, label: true } (Text eines Punkts) oder null
  function gripAt(w) {
    const tol = (GRIP_PX + 2) / S.view.z, items = gripItems();
    for (let k = items.length - 1; k >= 0; k--) {
      const it = items[k];
      if (it.type === "pvpoint") { const [x, y] = P.pointLabel(it); if (Math.hypot(x - w.x, y - w.y) <= tol) return { it, label: true }; continue; }
      const i = it.pts.findIndex((p) => Math.hypot(p[0] - w.x, p[1] - w.y) <= tol);
      if (i >= 0) return { it, i };
    }
    return null;
  }
  // Griff ziehen (app.js, Zieh-Art pvvertex): Punkt eines Linienzugs oder Textanfang eines Punkts auf m
  function dragGrip(d, m) {
    if (!d.label) { d.it.pts[d.i] = [m.x, m.y]; return; }
    d.it.ox = Math.round((m.x - d.it.x) * 1000) / 1000; d.it.oy = Math.round((m.y - d.it.y) * 1000) / 1000;
  }

  // ---------- Werkzeuge ----------
  function pointerDown(w, e) {
    if (S.tool === "text") return !layerFree(act()); // gesperrt: kein neuer Text
    if (DRAW_TOOLS[S.tool]) { addPoint(snap(w)); return true; }
    if (MOD_TOOLS[S.tool]) { placeModules(snap(w)); return true; }
    if (S.tool === "pv-string") { if (e?.shiftKey) unwire(w); else stringClick(w); return true; }
    if (S.tool === "pv-spa") { const p = snap(w); if (layerFree("kabel")) change(() => S.model.items.push({ id: c.nextId(), type: "spa", x: p.x, y: p.y })); return true; }
    if (S.tool === "pv-line") { addLinePoint(snap(w)); return true; }
    if (picking()) { pickDown(w); return true; }
    if (S.tool === "pv-point") { placePoint(snap(w)); return true; }
    if (S.tool === "pv-pmid") { change(() => { S.model.pmid = [Math.round(w.x), Math.round(w.y)]; }); setTool("select"); toast("Druckmitte gesetzt. Oben unter „Druck“ zurück auf automatisch."); return true; } // 5ao
    if (!PLAN_TOOLS.includes(S.tool)) return false;
    if (!lay("bg").show || lay("bg").lock) { layerFree("bg"); return true; }
    if (!bg()?.asset) { toast("Zuerst einen PDF-Plan laden.", "error"); return true; }
    if (S.tool === "pv-fix") { placeFix(w); return true; }
    if (!draft) draft = { x: w.x, y: w.y };
    else { const a = draft; draft = null; if (Math.hypot(w.x - a.x, w.y - a.y) > 1e-9) (S.tool === "pv-rotate" ? finishRotate : finishMeasure)(a, w); }
    c.renderOverlay(); c.updateHint();
    return true;
  }
  // Modul oder Modulfeld setzen. Ohne Modultyp: zuerst einen anlegen. Auf einer Sperrfläche nur Warnung (CJ 14.10.).
  async function placeModules(p) {
    if (!curType()) { toast("Zuerst einen Modultyp anlegen.", "error"); await editType(null); return; }
    if (!layerFree("module")) return;
    const ms = newModules(p).map((m) => ({ id: c.nextId(), ...m }));
    change(() => S.model.items.push(...ms));
    const n = ms.filter((m) => P.onKeepout(S.model, m)).length;
    if (n) toast(`${n === 1 ? "Ein Modul liegt" : `${n} Module liegen`} auf einer Sperrfläche (rot markiert).`, "error");
  }

  // ---------- Leitungen und Punkte (5ax, 5ay, CJ 17.10.) ----------
  // Leitung: Klicks setzen Punkte, Klick auf den letzten Punkt (Doppelklick) oder Eingabetaste beendet, Esc bricht ab.
  function addLinePoint(p) {
    if (lpath && lpath.sheet !== S.model) lpath = null;
    if (!lpath) { if (!layerFree("kabel")) return; lpath = { sheet: S.model, pts: [[p.x, p.y]] }; }
    else if (Math.hypot(lpath.pts.at(-1)[0] - p.x, lpath.pts.at(-1)[1] - p.y) <= 3 / S.view.z) { finishLine(); return; } // zweiter Klick des Doppelklicks
    else lpath.pts.push([p.x, p.y]);
    c.renderOverlay(); c.updateHint();
  }
  // Übernimmt die Leitung ab zwei Punkten. Gibt zurück, ob ein Entwurf da war.
  function finishLine() {
    const d = lpath; lpath = null;
    if (!d) return false;
    if (d.pts.length >= 2 && S.doc.sheets.includes(d.sheet)) change(() => d.sheet.items.push({ id: c.nextId(), type: "pvline", pts: d.pts, w: opt.lw, col: opt.lcol }));
    c.renderOverlay(); c.updateHint();
    return true;
  }
  // Punkt setzen, danach gleich die Beschriftung eingeben (leer = Punkt ohne Text)
  function placePoint(p) {
    if (!layerFree("kabel")) return;
    const it = { id: c.nextId(), type: "pvpoint", x: p.x, y: p.y, s: "" };
    change(() => S.model.items.push(it));
    c.openEditor(...P.pointLabel(it), it);
  }

  // ---------- Verkabelung (Schritt 5) ----------
  // Oberstes sichtbares Modul unter dem Punkt
  const modAt = (w) => S.model.items.findLast((it) => it.type === "pvmodule" && P.visible(S.model, it) && R.hitItem(it, w.x, w.y, 0));
  // Klickfolge = String. Erster Klick legt den String an (Bezeichnung rechts), nochmals auf das letzte Modul, Eingabetaste oder Esc beendet.
  function stringClick(w) {
    if (!layerFree("kabel")) return;
    const m = modAt(w);
    if (auto && m && autoIds() && !autoIds().has(m.id)) { toast("Dieses Modul ist nicht unter den gewählten Modulen. Ein grün markiertes Modul als Start anklicken.", "error"); return; } // 5bc
    if (auto && m) { auto = false; c.updateHint(); c.renderLeft(); c.renderRight(); autoWire(m); return; }
    if (!m) { toast("Ein Modul anklicken. Die Reihenfolge der Klicks ist die Reihenfolge im String, das erste Modul ist +.", "error"); return; }
    if (wire && wire.sheet !== S.model) finishString();
    if (!wire && !startWire()) return;
    if (wire.mods[wire.at - 1] === m.id) { finishString(); return; }
    const i = wire.mods.indexOf(m.id);
    if (i >= 0) wire.at = i + 1; // Klick auf ein Modul im String: weitere Module danach einfügen (5e)
    else {
      const other = P.stringOf(S.model, m.id);
      if (other) { toast(`Dieses Modul gehört schon zum String ${other.name}.`, "error"); return; }
      addMod(m.id);
    }
    c.renderOverlay(); c.updateHint(); c.renderRight();
  }
  // Shift + Klick (5af, CJ 15.10.): Modul aus dem String nehmen, auch mitten heraus, das Kabel schliesst die Lücke.
  // Mit String in Arbeit: aus diesem. Sonst aus dem bestehenden String des Moduls (ein Rückgängig-Schritt, letztes Modul löscht den String).
  function unwire(w) {
    if (!layerFree("kabel")) return;
    const m = modAt(w);
    if (!m) return;
    if (wire && wire.sheet === S.model) {
      const i = wire.mods.indexOf(m.id);
      if (i < 0) { toast("Dieses Modul gehört nicht zum String in Arbeit.", "error"); return; }
      wire.mods.splice(i, 1);
      if (i < wire.at) wire.at--;
      c.renderOverlay(); c.updateHint(); c.renderRight();
      return;
    }
    const st = P.stringOf(S.model, m.id);
    if (!st) { toast("Dieses Modul ist in keinem String.", "error"); return; }
    const last = st.mods.length === 1;
    change(() => { if (!last) st.mods = st.mods.filter((id) => id !== m.id); else { S.model.items = S.model.items.filter((it) => it !== st); S.sel.delete(st.id); } });
    toast(last ? `String ${st.name} gelöscht (letztes Modul).` : `Modul aus String ${st.name} genommen.`);
  }
  // Autoverkabelung (5j, CJ 15.10.): Knopf „Auto“, erstes Modul anklicken, Anzahl Strings, Module je String, Richtung. Ein Rückgängig-Schritt.
  let auto = false, autoOpt = ["2", "18", "h"];
  async function autoWire(m) {
    if (P.stringOf(S.model, m.id)) { toast("Dieses Modul ist schon in einem String. Ein freies Modul als Start anklicken.", "error"); return; }
    const name = nextName(), err = P.nameError(S.model, name);
    if (err) { toast(err, "error"); return; }
    // Mit Anlage (5k): ein WR je Durchgang, Anzahl leer = alle freien Strings dieses WR, Bezeichnungen aus der Anlage
    const an = S.doc.pv?.anlage, wrs = an ? an.map((_, i) => [String(i + 1), `WR ${i + 1} (${P.anlageFree(i + 1, S.model).length} frei)`]) : null;
    const wr0 = an ? String(Math.max(1, an.findIndex((_, i) => P.anlageFree(i + 1, S.model).length) + 1)) : "";
    const r = await formDialog("Autoverkabelung", an ? "Start beim angeklickten Modul (+ des ersten Strings), weiter in Schlangenlinie über die freien Module. Bezeichnungen aus der Anlage, ein WR je Durchgang." : `Start beim angeklickten Modul (+ des ersten Strings), weiter in Schlangenlinie über die freien Module. Erste Bezeichnung ${name}, dann fortlaufend.`,
      [...(an ? [{ label: "Wechselrichter", value: wr0, options: wrs }] : []), { label: an ? "Anzahl Strings (leer = alle freien des WR)" : "Anzahl Strings", value: an ? "" : autoOpt[0] }, { label: "Module je String", value: autoOpt[1] }, { label: "Richtung", value: autoOpt[2], options: [["h", "waagrecht (Reihen)"], ["v", "senkrecht (Spalten)"]] }], "Verkabeln");
    if (!r) return;
    const [nv, kv, dir] = an ? r.slice(1) : r, names = an ? P.anlageFree(Number(r[0]), S.model) : null;
    if (an && !names.length) { toast(`WR ${r[0]} hat keine freien Strings mehr.`, "error"); return; }
    const n = an && !nv.trim() ? names.length : Number(nv), k = Number(kv);
    if (!Number.isInteger(n) || !Number.isInteger(k) || n < 1 || k < 1) { toast("Bitte ganze Zahlen ab 1 eingeben.", "error"); return; }
    if (an && n > names.length) { toast(`WR ${r[0]} hat nur ${names.length} freie Strings.`, "error"); return; }
    autoOpt = [an ? autoOpt[0] : nv, kv, dir];
    const list = P.autoStrings(S.model, m.id, n, k, dir, autoIds() ?? undefined); // 5bc: nur gewählte Module
    if (!list.length) { toast(`Zu wenige freie Module für einen String mit ${k} Modulen.`, "error"); return; }
    change(() => list.forEach((mods, i) => S.model.items.push({ id: c.nextId(), type: "pvstring", name: names ? names[i] : i ? P.nextName(S.model) : name.trim(), mods })));
    sname = null;
    if (list.length < n) toast(`Nur ${list.length} von ${n} Strings angelegt, es fehlen freie Module.`, "error");
    else toast(`${n} String${n > 1 ? "s" : ""} mit je ${k} Modulen angelegt.`);
  }
  // 5bc: Wahlmodus. Klick auf ein Modul schaltet es um, Rahmen auf freier Fläche ergänzt (app.js „band“ mit layerPick = Module).
  // Die Wahl liegt solange in S.sel (Auswahl-Rahmen sichtbar); Löschen, Verschieben und Kopieren sind dabei gesperrt (app.js pickMode).
  function pickDown(w) {
    const m = modAt(w);
    if (m) { if (S.sel.has(m.id)) S.sel.delete(m.id); else S.sel.add(m.id); c.renderRight(); c.renderOverlay(); return; }
    S.drag = { type: "band", x0: w.x, y0: w.y, x1: w.x, y1: w.y, base: new Set(S.sel) };
  }
  const pickMods = () => S.model.items.filter((it) => it.type === "pvmodule" && P.visible(S.model, it));
  function startPick() {
    const ids = autoIds();
    setActive("kabel"); setTool("pv-autopick");
    S.sel = new Set(ids ?? []);
    c.renderRight(); c.renderOverlay(); c.renderLeft();
  }
  function endPick(apply) {
    const ids = new Set([...S.sel].filter((id) => S.model.items.some((m) => m.id === id && m.type === "pvmodule")));
    if (apply) autoSet = ids.size ? { sheet: S.model, ids } : null;
    setTool("pv-string"); auto = true; // setTool leert die Auswahl
    c.renderLeft(); c.renderRight(); c.renderOverlay(); c.updateHint();
    if (apply) toast(ids.size ? `Autoverkabelung auf ${ids.size} Module eingeschränkt.` : "Keine Module gewählt: Autoverkabelung wieder über alle Module.");
  }

  // Neuen String im Entstehen anlegen. Ungültige Bezeichnung: Meldung (beim Überfahren nur einmal je Bezeichnung).
  let badName = null;
  function startWire(quiet) {
    const name = nextName(), err = P.nameError(S.model, name);
    if (err) { if (!quiet || badName !== name) toast(err, "error"); badName = name; return false; }
    wire = { sheet: S.model, name: name.trim(), mods: [], at: 0 };
    return true;
  }
  // Modul an der Einfügestelle at einfügen (neuer String: am Ende)
  const addMod = (id) => wire.mods.splice(wire.at++, 0, id);
  // Schritt 5c (CJ 15.10.): ⌥ halten und über die Module fahren, ohne Klick. Zwischenpunkte ab der letzten Position (alle 50 mm),
  // damit schnelles Fahren kein Modul auslässt. Module anderer Strings: höchstens eine Meldung je String.
  let lastHover = null;
  function hover(w) {
    const a = lastHover;
    lastHover = S.tool === "pv-string" && S.alt && w ? { x: w.x, y: w.y } : null;
    if (!lastHover || !lay("kabel").show || lay("kabel").lock) return;
    const p = a ?? w, n = Math.min(200, Math.ceil(Math.hypot(w.x - p.x, w.y - p.y) / 50));
    let changed = false;
    for (let k = n ? 1 : 0; k <= n; k++) {
      const t = n ? k / n : 1, m = modAt({ x: p.x + (w.x - p.x) * t, y: p.y + (w.y - p.y) * t });
      if (m && hoverMod(m)) changed = true;
    }
    if (changed) { c.updateHint(); c.renderRight(); }
  }
  function hoverMod(m) {
    if (wire && wire.sheet !== S.model) finishString();
    if (wire?.mods.slice(wire.at).includes(m.id)) return false; // hinter der Einfügestelle: schon im String
    const step = P.hoverStep(S.model, wire?.mods.slice(0, wire.at) ?? [], m.id);
    if (step === "back") { wire.mods.splice(--wire.at, 1); return true; }
    if (step === "other" && wire && !wire.warned) { wire.warned = true; toast(`Module, die schon in einem String sind (z. B. ${P.stringOf(S.model, m.id).name}), werden übersprungen.`, "error"); }
    if (step !== "add" || (!wire && !startWire(true))) return false;
    addMod(m.id);
    return true;
  }
  // Übernimmt den String im Entstehen (mindestens ein Modul). Gibt zurück, ob ein Entwurf da war.
  function finishString() {
    const d = wire; wire = null;
    if (!d) return false;
    const ids = new Set(d.sheet.items.filter((it) => it.type === "pvmodule").map((it) => it.id)), mods = d.mods.filter((id) => ids.has(id)); // nach Rückgängig fehlen evtl. Module
    if (d.front) mods.reverse(); // am Anfang einfügen (5af): umgekehrt bearbeitet
    if (d.edit) { // bestehender String (5e): Module und Bezeichnung übernehmen
      const st = d.sheet.items.find((it) => it.id === d.edit && it.type === "pvstring"), name = st && !P.nameError(d.sheet, d.name, st) ? d.name.trim() : st?.name;
      if (st && mods.length && (mods.join() !== st.mods.join() || name !== st.name)) {
        change(() => { st.mods = mods; st.name = name; });
        toast(`String ${name} hat jetzt ${mods.length} Modul${mods.length > 1 ? "e" : ""}.`);
      }
      sname = null;
      c.renderItems(); c.renderOverlay(); c.updateHint(); c.renderRight();
      return true;
    }
    if (mods.length && S.doc.sheets.includes(d.sheet) && !P.nameError(d.sheet, d.name)) {
      change(() => d.sheet.items.push({ id: c.nextId(), type: "pvstring", name: d.name, mods }));
      sname = null;
      toast(`String ${d.name} mit ${mods.length} Modul${mods.length > 1 ? "en" : ""} angelegt.`);
    }
    c.renderOverlay(); c.updateHint(); c.renderRight();
    return true;
  }

  // ---------- Modultypen (Katalog im Dokument) ----------
  // Neuer (t = null) oder bestehender Modultyp. Ungültige Eingabe: Meldung, Formular erneut mit den Eingaben.
  async function editType(t) {
    let vals = P.MT_FIELDS.map(([k]) => (t?.[k] === undefined ? "" : String(t[k]).replace(".", ",")));
    for (;;) {
      const r = await formDialog(t ? "Modultyp ändern" : "Neuer Modultyp", "Werte aus dem Datenblatt. Pflicht: Name, Länge und Breite. Die übrigen Felder dürfen leer bleiben, sie werden für die Spannungsprüfung (Schritt 6) gebraucht.",
        P.MT_FIELDS.map(([, label, unit], i) => ({ label: unit ? `${label} in ${unit}` : label, value: vals[i] })), t ? "Übernehmen" : "Anlegen");
      if (!r) return;
      const res = P.typeFromForm(r, t?.id ?? "m" + c.nextId());
      if (res.error) { toast(res.error, "error"); vals = r; continue; }
      change(() => {
        const list = ((S.doc.pv ??= {}).moduleTypes ??= []), i = list.findIndex((x) => x.id === res.type.id);
        if (i >= 0) list[i] = res.type; else list.push(res.type);
        S.doc.pv = P.tidyPv(S.doc.pv);
      });
      opt.mt = res.type.id;
      c.renderRight(); c.renderOverlay();
      return;
    }
  }
  async function deleteType(id) {
    if (S.doc.sheets.some((sh) => sh.items.some((it) => it.type === "pvmodule" && it.mt === id))) { toast("Dieser Modultyp wird noch verwendet. Zuerst die Module löschen oder einem anderen Typ zuweisen.", "error"); return; }
    const t = P.modType(id);
    if (!t || !(await confirmDialog("Modultyp löschen?", `„${t.name}“ wird aus dem Katalog dieser Datei entfernt.`, "Löschen"))) return;
    change(() => { S.doc.pv.moduleTypes = types().filter((x) => x.id !== id); S.doc.pv = P.tidyPv(S.doc.pv); }); // WR-Daten und Tmin bleiben
  }
  // Katalog sichern (JSON-Datei) und laden (gleiche Namen werden übersprungen)
  function saveCatalog() {
    if (!types().length) { toast("Der Katalog ist leer.", "error"); return; }
    c.download("Modulkatalog.schemacad-katalog.json", P.catalogText(types()), "application/octet-stream");
    toast("Katalog in den Download-Ordner geladen.");
  }
  async function loadCatalog() {
    const file = await pickFile(".json,application/json");
    if (!file) return;
    let list;
    try { list = P.parseCatalog(await file.text()); } catch (err) { toast(err.message, "error"); return; }
    addTypes(list);
  }
  // Online-Ablage (cloud.js): Datenblätter ohne id, beim Laden wie aus einer Katalogdatei geprüft
  const cloudCatalog = () => cloudMenu("module_types", "Modulkatalog", () => types().map(({ id: _, ...t }) => ({ name: t.name, data: t })),
    (datas) => addTypes(datas.map((t) => P.cleanModuleType(t, "neu")).filter(Boolean)));
  function addTypes(list) {
    let n = 0;
    change(() => { n = P.mergeCatalog(((S.doc.pv ??= {}).moduleTypes ??= []), list, () => "m" + c.nextId()); S.doc.pv = P.tidyPv(S.doc.pv); });
    toast(n ? `${n} Modultyp${n > 1 ? "en" : ""} übernommen.` : "Keine neuen Modultypen (gleiche Namen werden übersprungen).", n ? undefined : "error");
  }
  // Auswahlfelder rechts (data-pvopt): Einstellungen für neue Module oder Änderung gewählter Module
  // Strings fortsetzen (CJ 18.10.2026): jedes PV-Modul zählt ab 1.1.1. Mit Haken schlägt es die Bezeichnungen nach dem gewählten
  // PV-Modul vor (doc.mods[Modul].cont = dessen Nummer). Die Module bleiben getrennt, jedes mit eigener Stringübersicht.
  const myMod = () => modOf(S.model), otherMods = () => [...new Set(S.doc.sheets.filter((sh) => sh.kind === "pv").map(modOf))].filter((id) => id !== myMod());
  function contHTML() {
    const others = otherMods(), c = S.doc.mods?.[myMod()]?.cont, on = !!c && others.some((id) => modVar(id) === c);
    if (!others.length) return "";
    let h = `<h3 class="pv-title">Strings</h3><label class="check"><input type="checkbox" data-pvopt="cont"${on ? " checked" : ""}> Strings fortsetzen</label>`;
    if (on) h += `<div class="field"><label>Nach dem Modul</label><select data-pvopt="contto">${others.map((id) => `<option value="${modVar(id)}"${modVar(id) === c ? " selected" : ""}>${R.esc(modName(S.doc, id))}</option>`).join("")}</select></div>`
      + `<p class="note">Neue Strings zählen nach den Strings von „${R.esc(modName(S.doc, others.find((id) => modVar(id) === c)))}“ weiter.</p>`;
    else h += `<p class="note">Dieses PV-Modul beginnt bei 1.1.1. Haken setzen, um nach einem anderen PV-Modul weiterzuzählen.</p>`;
    return h;
  }
  function setCont(v) {
    const id = myMod();
    change(() => { const m = (S.doc.mods ??= {}); if (v) m[id] = { ...m[id], cont: v }; else if (m[id]) { delete m[id].cont; if (!Object.keys(m[id]).length) delete m[id]; } if (!Object.keys(m).length) delete S.doc.mods; });
  }
  function option(el) {
    const k = el.dataset.pvopt, v = el.value;
    if (k === "cont") { setCont(el.checked ? modVar(otherMods()[0]) : 0); return; } // Haken: nach dem ersten anderen PV-Modul
    if (k === "contto") { setCont(Number(v)); return; }
    if (k === "sname" || k === "selname") { // Bezeichnung des nächsten bzw. des gewählten Strings
      const st = k === "selname" ? S.model.items.find((it) => S.sel.has(it.id) && it.type === "pvstring") : null, err = P.nameError(S.model, v, st);
      if (err) { toast(err, "error"); c.renderRight(); return; }
      if (st) { if (st.name !== v.trim()) change(() => { st.name = v.trim(); }); return; } // unverändert: kein Rückgängig-Schritt
      sname = v.trim();
      if (wire) wire.name = sname;
      c.renderRight(); c.renderOverlay(); c.updateHint();
      return;
    }
    if (k === "psize" || k === "pquer" || k === "pden") { // Papier und Druckmassstab des Blatts (Schritt 7)
      const p = P.paperOf(S.model), den = k === "pden" ? P.parseDen(v) : p.den;
      if (!den) { toast("Bitte einen Massstab eingeben, z. B. 100 für 1:100.", "error"); c.renderRight(); return; }
      const np = { size: k === "psize" ? v : p.size, quer: k === "pquer" ? v === "1" : p.quer, den };
      if (!S.model.paper || np.size !== p.size || np.quer !== p.quer || np.den !== p.den) change(() => { S.model.paper = np; });
      return;
    }
    if (k === "pr") { // Druckteile (5l), wirken auch am Bildschirm (5ai)
      const part = el.dataset.part, h = (S.model.hide ?? []).filter((x) => x !== part);
      if (!el.checked) h.push(part);
      const nh = P.cleanHide(h);
      change(() => { if (nh) S.model.hide = nh; else delete S.model.hide; });
      for (const it of S.model.items) if (S.sel.has(it.id) && !P.pickable(S.model, it)) S.sel.delete(it.id); // nicht mehr sichtbar: nicht mehr gewählt
      c.renderLeft(); c.renderOverlay();
      return;
    }
    if (k === "north") { // Nordrichtung (5aq): Grad im Uhrzeigersinn ab oben im Plan ohne Drehung, leer = kein Nordpfeil
      const t = v.trim().replace(",", ".").replace("−", "-").replace("°", ""), n = Number(t);
      if (t !== "" && !Number.isFinite(n)) { toast("Nordrichtung in Grad eingeben, z. B. 30 (im Uhrzeigersinn ab oben im Plan).", "error"); c.renderRight(); return; }
      const nv = t === "" ? undefined : P.normNorth(n);
      if (nv !== S.model.north) change(() => { if (nv === undefined) delete S.model.north; else S.model.north = nv; });
      return;
    }
    if (k === "lw" || k === "selw") { // Breite der Leitung in mm im Planmass (5ax)
      const n = Number(v.trim().replace(",", "."));
      if (!(n > 0)) { toast("Bitte eine Breite grösser als 0 mm eingeben (Planmass, z. B. 50).", "error"); c.renderRight(); return; }
      if (k === "lw") { opt.lw = n; c.renderOverlay(); return; }
      const ls = S.model.items.filter((it) => S.sel.has(it.id) && it.type === "pvline");
      if (ls.some((l) => l.w !== n)) change(() => { for (const l of ls) l.w = n; });
      return;
    }
    if (k === "lcol" || k === "selcol") { // Farbe der Leitung (5ax)
      if (!/^#[0-9a-f]{6}$/i.test(v)) return;
      if (k === "lcol") { opt.lcol = v.toLowerCase(); c.renderOverlay(); return; }
      const ls = S.model.items.filter((it) => S.sel.has(it.id) && it.type === "pvline");
      if (ls.some((l) => l.col !== v.toLowerCase())) change(() => { for (const l of ls) l.col = v.toLowerCase(); });
      return;
    }
    if (k === "th") { // Texthöhe der gewählten Texte und Punkte (5ba), mm im Planmass
      const n = Number(v.trim().replace(",", "."));
      if (!(n > 0)) { toast("Bitte eine Texthöhe grösser als 0 mm eingeben (Planmass, z. B. 250).", "error"); c.renderRight(); return; }
      const ts = S.model.items.filter((it) => S.sel.has(it.id) && (it.type === "text" || it.type === "pvpoint"));
      if (ts.some((t) => (t.h ?? P.PV_TEXT_H) !== n)) change(() => { for (const t of ts) { if (t.type === "pvpoint" && n === P.PV_TEXT_H) delete t.h; else t.h = n; } });
      return;
    }
    if (k === "strk") { // Grösse der Stringbeschriftung in % (5bb), je Stringplan
      const n = Number(v.trim().replace(",", ".").replace("%", "")) / 100;
      if (!(n >= P.STRK_MIN && n <= P.STRK_MAX)) { toast("Bitte 25 bis 400 % eingeben.", "error"); c.renderRight(); return; }
      if (n !== (S.model.strk || 1)) change(() => { if (n === 1) delete S.model.strk; else S.model.strk = n; });
      return;
    }
    if (k === "pts") { // Beschriftung des gewählten Punkts (5ay)
      const pt = S.model.items.find((it) => S.sel.has(it.id) && it.type === "pvpoint");
      if (pt && pt.s !== v.trim()) change(() => { pt.s = v.trim(); });
      return;
    }
    if (k === "mppt" || k === "str") { // Anlage je Datei (5k): MPPT bzw. Strings je MPPT eines WR
      const n = v.trim() === "" ? 0 : Number(v.trim()), i = Number(el.dataset.wr);
      if (!Number.isInteger(n) || n < 0 || n > 99) { toast("Bitte eine ganze Zahl von 0 bis 99 eingeben.", "error"); c.renderRight(); return; }
      setAnlage((a) => { while (a.length <= i) a.push({ str: [] }); const str = a[i].str; a[i] = { str: k === "mppt" ? Array.from({ length: n }, (_, m) => str[m] ?? 0) : str.map((x, m) => (m === Number(el.dataset.m) ? n : x)) }; }); // neue MPPT leer (0)
      return;
    }
    if (k === "fill") { // Füllmuster der gewählten Fläche (5h)
      const it = S.model.items.find((x) => S.sel.has(x.id) && P.canFill(x));
      if (it && (it.fill ?? "") !== v) change(() => P.setFill(it, v)); // offene Dachlinie wird geschlossen (5t)
      return;
    }
    if (k === "fdir") { // Richtung des Musters (5i): 0° oder 90°, Drehung des Plans bleibt erhalten
      const it = S.model.items.find((x) => S.sel.has(x.id) && P.fillable(x)), f = it?.fdir || 0, r = f - 90 * Math.round(f / 90), n = r + (v === "90" ? 90 : 0);
      if (it && Math.abs(n - f) > 1e-9) change(() => { if (Math.abs(n) < 1e-9) delete it.fdir; else it.fdir = Math.round(n * 1e6) / 1e6; });
      return;
    }
    if (k === "mt") opt.mt = v;
    else if (k === "quer") opt.quer = v === "1";
    else if (k === "selmt" || k === "selquer") {
      const mods = S.model.items.filter((it) => S.sel.has(it.id) && it.type === "pvmodule");
      change(() => { for (const m of mods) if (k === "selmt") m.mt = v; else m.quer = v === "1"; });
      return;
    } else {
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n) || (k === "cols" || k === "rows" ? n < 1 || n > 100 : n < 0)) { toast(k === "cols" || k === "rows" ? "Bitte 1 bis 100 eingeben." : "Bitte einen Abstand ab 0 mm eingeben.", "error"); c.renderRight(); return; }
      opt[k] = k === "cols" || k === "rows" ? Math.round(n) : n;
    }
    c.renderRight(); c.renderOverlay(); c.updateHint();
  }

  // Dachlinie/Sperrfläche: Klick setzt einen Punkt. Klick auf den ersten Punkt schliesst, nochmals auf den letzten Punkt beendet offen.
  function addPoint(p) {
    if (!path) {
      if (!layerFree(act())) return;
      path = { type: S.tool === "pv-keepout" ? "keepout" : "roofline", pts: [[p.x, p.y]], sheet: S.model, layer: act() };
    } else {
      const same = (q) => Math.hypot(q[0] - p.x, q[1] - p.y) < 1e-6;
      if (path.pts.length >= 2 && same(path.pts[0])) { finishPath(true); return; }
      if (same(path.pts.at(-1))) { finishPath(false); return; }
      path.pts.push([p.x, p.y]);
    }
    c.renderOverlay(); c.updateHint();
  }
  // Übernimmt den Linienzug, wenn er gültig ist (Dachlinie ab 2, Sperrfläche ab 3 Punkten). Gibt zurück, ob ein Entwurf da war.
  function finishPath(closed) {
    const p = path; path = null;
    if (!p) return false;
    const it = P.cleanPvItem({ type: p.type, pts: p.pts, closed: closed && p.pts.length >= 3, layer: p.layer }, 0);
    if (it && S.doc.sheets.includes(p.sheet)) change(() => { p.sheet.items.push({ ...it, id: c.nextId() }); });
    else if (p.type === "keepout" && p.pts.length > 1) toast("Eine Sperrfläche braucht mindestens drei Punkte.", "error");
    c.renderOverlay(); c.updateHint();
    return true;
  }
  // Esc, Eingabetaste, Werkzeugwechsel: Linienzug übernehmen (offen), Messstrecke verwerfen. Leitung (5ax): Esc (abort) verwirft, sonst übernehmen.
  const cancel = (abort) => {
    if (abort && lpath) { lpath = null; c.renderOverlay(); c.updateHint(); return true; }
    if (abort && picking()) { endPick(false); return true; } // Esc im Wahlmodus (5bc): zurück zur Autoverkabelung, Einschränkung wie vorher
    const had = !!draft || auto, wasAuto = auto; draft = null; auto = false; if (wasAuto) { c.renderLeft(); c.renderRight(); }
    return finishString() || finishPath(false) || finishLine() || had;
  };

  async function finishMeasure(a, e) {
    const b = bg(), pa = P.worldToPage(b, a.x, a.y), pe = P.worldToPage(b, e.x, e.y);
    const r = await formDialog("Messstrecke", "Wie lang ist die Strecke in Wirklichkeit? Angabe in mm, z. B. 18000 für 18 m.", [{ label: "Länge in mm", value: "" }], "Weiter");
    if (!r) return;
    const mm = parseFloat(r[0].replace(/\s|'/g, "").replace(",", "."));
    const k = P.scaleFromMeasure([pa.u, pa.v], [pe.u, pe.v], mm);
    if (!k) { toast("Bitte eine Länge grösser als 0 eingeben.", "error"); return; }
    const std = P.nearestStd(k), den = P.denOf(k);
    // Prüfen eines schon gesetzten Massstabs (z. B. aus dem GIS, Fehler aus CJs Prüfung von Schritt 4): Abweichung nennen
    const prev = b.mmPerPt ? ` Bisher ${P.fmtDen(P.denOf(b.mmPerPt))}, Abweichung ${P.fmtPct(k / b.mmPerPt - 1)}.` : "";
    const ch = await chooseDialog("Massstab bestätigen", `Aus der Messstrecke ergibt sich ${P.fmtDen(den)}. Vorschlag: ${P.fmtDen(std)}.${prev}`,
      [{ label: `${P.fmtDen(std)} übernehmen (Normmassstab)`, k: P.kOfDen(std) }, { label: `${P.fmtDen(den)} übernehmen (wie gemessen)`, k }]);
    if (!ch?.option) return;
    change(() => { b.mmPerPt = ch.option.k; b.measure = { a: [pa.u, pa.v], b: [pe.u, pe.v], mm }; });
    setTool("select"); fitView();
    toast(`Massstab ${P.fmtDen(P.denOf(ch.option.k))} gesetzt.`);
  }

  // Plan drehen: Kante a→b soll waagrecht oder senkrecht liegen. Der Winkel lässt sich im Dialog ändern (auch frei eingeben).
  async function finishRotate(a, e) {
    const d = P.alignAngle([a.x, a.y], [e.x, e.y]);
    const r = await formDialog("Plan drehen", "Drehung um den Fixpunkt in Grad, positiv = gegen den Uhrzeigersinn. Der Vorschlag legt die angeklickte Kante waagrecht oder senkrecht. Dachlinien und Sperrflächen drehen mit, Module, Strings, SPA, Leitungen, Punkte und Texte bleiben.", [{ label: "Drehung in Grad", value: String(Math.round(d * 100) / 100).replace(".", ",") }], "Drehen");
    if (!r) return;
    const deg = parseFloat(r[0].replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(deg)) { toast("Bitte einen Winkel eingeben, z. B. 12,5.", "error"); return; }
    if (!deg) return;
    let rot;
    change(() => { rot = P.rotatePlan(S.model, deg); });
    renderSheet(); setTool("select");
    toast(`Plan gedreht, jetzt ${P.fmtDeg(rot)}.`);
  }

  async function placeFix(w) {
    let mode = P.fixMode(bg(), S.model.items.length > 0);
    if (mode === "ask") {
      const ch = await chooseDialog("Fixpunkt verschieben", "Auf dem Plan liegen schon Objekte. Was soll mit ihnen geschehen?",
        [{ label: "Objekte bleiben auf dem Plan (werden mitverschoben)", m: "plan" }, { label: "Objekte bleiben am Fixpunkt (neuer Planstand)", m: "fix" }]);
      if (!ch?.option) return;
      mode = ch.option.m;
    }
    change(() => P.setFix(S.model, w.x, w.y, mode));
    // Ansicht mitführen, damit der Plan auf dem Bildschirm stehen bleibt
    S.view.x += w.x * S.view.z; S.view.y -= w.y * S.view.z;
    applyView(); renderSheet(); setTool("select");
    toast("Fixpunkt gesetzt.");
  }

  // PDF wählen, Seite wählen, als Hintergrund setzen. Mit bestehendem Plan: Plantausch.
  async function loadPdf() {
    if (!layerFree("bg")) return;
    const old = bg();
    if (old?.asset && !(await confirmDialog("Neuen Planstand laden?", "Die Objekte bleiben relativ zum Fixpunkt, der neue Plan übernimmt die Drehung des alten. Danach für den neuen Plan den Massstab angeben oder messen und den Fixpunkt an derselben Stelle wie im alten Plan setzen. Rückgängig ist möglich.", "PDF wählen"))) return;
    const file = await pickFile();
    if (!file) return;
    let bytes, info;
    try { bytes = new Uint8Array(await file.arrayBuffer()); info = await openPdf(bytes); }
    catch (err) { toast("Die PDF lässt sich nicht öffnen: " + (err?.message || err), "error"); return; }
    let page = 1, size;
    try {
      if (info.pages > 1) {
        const ch = await chooseDialog("Seite wählen", `Die PDF hat ${info.pages} Seiten. Welche ist der Dachplan?`, Array.from({ length: info.pages }, (_, i) => ({ label: `Seite ${i + 1}`, n: i + 1 })));
        if (!ch?.option) return;
        page = ch.option.n;
      }
      size = await pageSize(info.doc, page);
    } catch (err) { toast("Die PDF-Seite lässt sich nicht lesen: " + (err?.message || err), "error"); return; }
    finally { info.close(); }
    const { w, h } = size;
    const relink = old && !old.asset; // nur die PDF fehlte: Massstab und Fixpunkt bleiben, keine Frage
    const sc = relink ? null : await askScale(w, h);
    const data = toBase64(bytes), id = "pdf" + c.nextId();
    S.doc.assets = { ...(S.doc.assets || {}), [id]: { name: file.name, type: "application/pdf", data } };
    change(() => { S.model.bg = P.newBg(old, id, file.name, page, w, h); if (sc?.den) S.model.bg.mmPerPt = P.kOfDen(sc.den); });
    if (act() !== "bg") storeAct("bg"); // nach dem Laden: Massstab, Fixpunkt, Drehung auf dem Hintergrund
    setTool(sc?.measure ? "pv-measure" : "select"); fitView();
    const fixMsg = old ? "Jetzt den Fixpunkt an derselben Stelle wie im alten Plan setzen." : "Jetzt den Fixpunkt setzen.";
    if (relink) toast("Plan wieder verbunden.");
    else if (sc?.den) toast(`${old ? "Neuer Planstand" : "Plan"} geladen, Massstab ${P.fmtDen(sc.den)}. ${fixMsg}`);
    else toast(`${old ? "Neuer Planstand" : "Plan"} geladen. Jetzt den Massstab messen (Messstrecke), dann den Fixpunkt setzen.`);
  }
  // Nach dem Laden fragen: Massstab bekannt (1:n eingeben) oder Strecke auf dem Plan messen.
  // Ergebnis { den } oder { measure: true }; null = später (Plan ohne Massstab, wie bisher).
  // Annahme Claude: Die PDF-Seite hat das Papierformat, auf dem der Massstab gilt (1 pt = 1/72 Zoll, z. B. Export aus CAD ohne „an Seite anpassen“).
  // cur = bisheriger Massstab (nachträglich eingeben, 5g): Feld vorbelegt, „Abbrechen“ statt „Später“
  function askScale(w, h, cur) {
    const size = `${fmtMm(w * P.PT_MM)} × ${fmtMm(h * P.PT_MM)} mm`;
    const body = `<p>Ist der Massstab des Plans bekannt? Die PDF-Seite misst ${size}. Der Massstab stimmt nur, wenn der Plan auf dieser Seitengrösse gezeichnet ist (nicht verkleinert oder an die Seite angepasst).</p>`
      + `<p><strong>GIS-Pläne:</strong> Der Massstab aus dem GIS gilt oft nicht für die PDF-Seite. Bitte eine bekannte Strecke messen oder den Massstab danach mit „Massstab messen“ prüfen.</p>`
      + `<div class="field"><label>Massstab 1:</label><input type="text" data-den placeholder="z. B. 100" value="${cur ? String(Math.round(cur * 100) / 100).replace(".", ",") : ""}" autocomplete="off" spellcheck="false"></div>`
      + `<div class="actions"><button class="btn outline" data-c>${cur === undefined ? "Später" : "Abbrechen"}</button><button class="btn outline" data-m>Strecke messen</button><button class="btn primary" data-ok>Massstab übernehmen</button></div>`;
    return c.openModal("Massstab des Plans", body, (b, done) => {
      if (b.dataset.c !== undefined) done(null);
      else if (b.dataset.m !== undefined) done({ measure: true });
      else if (b.dataset.ok !== undefined) {
        const den = P.parseDen($("#modal-root [data-den]").value);
        if (den) done({ den }); else toast("Bitte einen Massstab eingeben, z. B. 100 für 1:100.", "error");
      }
    }, null, "[data-den]");
  }
  // Massstab nachträglich eingeben (5g, CJ 15.10.). Objekte bleiben relativ zum Fixpunkt (wie Messstrecke und Plantausch).
  async function enterScale() {
    const b = bg();
    if (!b?.asset || !layerFree("bg")) return;
    const sc = await askScale(b.w, b.h, b.mmPerPt ? P.denOf(b.mmPerPt) : "");
    if (!sc) return;
    if (sc.measure) { setTool("pv-measure"); return; }
    const k = P.kOfDen(sc.den);
    if (k !== b.mmPerPt || b.measure) change(() => { b.mmPerPt = k; delete b.measure; }); // alte Messstrecke passt nicht mehr zum Massstab
    fitView();
    toast(`Massstab ${P.fmtDen(sc.den)} gesetzt.`);
  }
  // Klick links auf [data-pvact]: PDF laden oder Ebene umschalten
  function action(el) {
    if (el.dataset.pvact === "pdf") { loadPdf(); return; }
    if (el.dataset.pvact === "scale") { enterScale(); return; }
    if (el.dataset.pvact === "wradd") { setAnlage((a) => a.push({ str: [] })); return; } // neuer WR startet leer (5al, CJ 15.10.)
    if (el.dataset.pvact === "wrrm") { removeWr(Number(el.dataset.wr)); return; }
    if (el.dataset.pvact === "auto") { // 5j, seit UI Schritt 6 Teil 2 ein Werkzeug links unter Verkabelung
      finishString(); setActive("kabel"); if (S.tool !== "pv-string") setTool("pv-string");
      auto = true; c.renderLeft(); c.renderRight(); c.updateHint(); return;
    }
    if (el.dataset.pvact === "active") { setActive(el.dataset.layer); return; }
    if (el.dataset.pvact === "autopick") { startPick(); return; } // 5bc
    if (el.dataset.pvact === "autodone") { endPick(true); return; }
    if (el.dataset.pvact === "autonone") { S.sel.clear(); c.renderRight(); c.renderOverlay(); return; }
    if (el.dataset.pvact === "autoclear") { autoSet = null; c.renderRight(); c.renderOverlay(); toast("Einschränkung aufgehoben: Autoverkabelung über alle Module."); return; }
    if (el.dataset.pvact === "pmid") { setTool("pv-pmid"); return; } // Druckmitte per Klick (5ao)
    if (el.dataset.pvact === "pmidauto") { change(() => { delete S.model.pmid; }); return; }
    if (el.dataset.pvact === "strclear") { clearWiring(); return; }
    if (el.dataset.pvact === "ptreset") { resetLabel(); return; } // Text zurück neben den Punkt (5ay)
    const st = S.model.items.find((it) => S.sel.has(it.id) && it.type === "pvstring");
    if (el.dataset.pvact === "strrev" && st) { change(() => st.mods.reverse()); return; } // + und − tauschen (5e)
    if ((el.dataset.pvact === "strapp" || el.dataset.pvact === "strfront") && st) { // Module anhängen oder einfügen (5e): String wie beim Zeichnen weiterführen
      setActive("kabel"); setTool("pv-string");
      const front = el.dataset.pvact === "strfront"; // am Anfang einfügen (5af): String umgekehrt weiterführen, beim Beenden zurückdrehen
      wire = { sheet: S.model, name: st.name, mods: front ? [...st.mods].reverse() : [...st.mods], at: st.mods.length, edit: st.id, front };
      c.renderItems(); c.renderOverlay(); c.updateHint(); c.renderRight();
      return;
    }
    const mt = { mtnew: () => editType(null), mtedit: () => editType(P.modType(el.dataset.mt)), mtdel: () => deleteType(el.dataset.mt), catsave: saveCatalog, catload: loadCatalog, catcloud: cloudCatalog }[el.dataset.pvact];
    if (mt) { mt(); return; }
    const l = el.dataset.layer, key = el.dataset.key;
    change(() => P.toggleLayer(S.model, l, key));
    for (const it of S.model.items) if (S.sel.has(it.id) && !P.pickable(S.model, it)) S.sel.delete(it.id); // nicht mehr wählbar
    c.renderLeft(); renderSheet(); c.renderRight(); c.renderOverlay();
  }
  // WR entfernen (5as, CJ 15.10.): 1. Klick leert den WR (Anlage und Datenblatt), 2. Klick auf den geleerten WR löscht ihn ganz, egal wo in der Liste.
  // Die folgenden WR rücken nach (WR 3 wird WR 2, seine Strings 3.x.y heissen dann 2.x.y). Hat der WR noch Strings, fragt eine Rückfrage, sie werden gelöscht.
  const wrRows = () => Math.max(S.doc.pv?.anlage?.length ?? 0, 0, ...P.wrNumbers(S.doc));
  const wrStrings = (nr) => S.doc.sheets.filter((sh) => sh.kind === "pv").flatMap((sh) => P.strings(sh)).filter((st) => P.parseName(st.name)?.wr === nr).length;
  async function removeWr(i) {
    const nr = i + 1, a = S.doc.pv?.anlage ?? [];
    if (a[i]?.str.length || S.doc.pv?.wr?.[nr]) {
      setAnlage((x) => { if (i < x.length) x[i] = { str: [] }; if (S.doc.pv.wr) delete S.doc.pv.wr[nr]; });
      toast(`WR ${nr} geleert. Nochmals × löscht ihn ganz.`); return;
    }
    const k = wrStrings(nr), n = wrRows();
    if (k && !(await confirmDialog(`WR ${nr} löschen?`, `${k === 1 ? "Ein String" : `${k} Strings`} von WR ${nr} ${k === 1 ? "wird" : "werden"} gelöscht, die Module bleiben.${nr < n ? " Die folgenden WR rücken nach." : ""} Rückgängig mit ⌘Z.`, "Löschen"))) return;
    change(() => { S.sel.clear(); P.renumberWr(S.doc, Array.from({ length: n }, (_, j) => j + 1).filter((j) => j !== nr)); });
    toast(nr < n ? `WR ${nr} gelöscht. WR ${nr + 1} bis ${n} rücken nach.` : `WR ${nr} gelöscht.`);
  }
  // WR verschieben (5aw, CJ 15.10.: Drag and Drop im Fenster Wechselrichter): WR from (1 …) kommt an die Stelle to, Nummern und Strings folgen
  function moveWr(from, to) {
    const n = wrRows();
    if (from === to || from < 1 || to < 1 || from > n || to > n) return;
    const order = Array.from({ length: n }, (_, j) => j + 1);
    order.splice(to - 1, 0, ...order.splice(from - 1, 1));
    change(() => P.renumberWr(S.doc, order));
    toast(`WR ${from} ist jetzt WR ${to}.`);
  }
  // Nach Druck/PDF alle Druckteile wieder an (5av, CJ 15.10.). Ein Rückgängig-Schritt holt die Auswahl zurück.
  function resetPrintParts() {
    if (S.doc.sheets.some((sh) => sh.kind === "pv" && sh.hide)) change(() => { for (const sh of S.doc.sheets) if (sh.kind === "pv") delete sh.hide; });
  }
  const pickable = () => S.model.items.filter((it) => P.pickable(S.model, it));
  function resetLabel() { const pt = S.model.items.find((it) => S.sel.has(it.id) && it.type === "pvpoint"); if (pt && pt.ox !== undefined) change(() => { delete pt.ox; delete pt.oy; }); }
  // Verkabelung löschen (5m): markierte Strings, ohne Markierung alle Strings des offenen Stringplans (5aj, CJ 15.10.). Ein Rückgängig-Schritt.
  async function clearWiring() {
    finishString(); auto = false;
    if (!layerFree("kabel")) return;
    const ids = new Set(S.model.items.filter((it) => S.sel.has(it.id) && it.type === "pvstring").map((it) => it.id));
    const list = P.stringsToClear([S.model], ids), n = list.length;
    if (!n) { toast("Keine Strings zum Löschen."); return; }
    const what = ids.size ? (n === 1 ? "Der markierte String wird" : `${n} markierte Strings werden`) : n === 1 ? "Der String dieses Stringplans wird" : `Alle ${n} Strings dieses Stringplans werden`;
    const text = `${what} gelöscht. SPA und Module bleiben, andere Stringpläne auch. Rückgängig mit ⌘Z.`;
    if (!(await confirmDialog("Verkabelung löschen?", text, "Löschen"))) return;
    change(() => { P.clearStrings(list); for (const x of list) S.sel.delete(x.st.id); });
  }
  function pickFile(accept = ".pdf,application/pdf") {
    return new Promise((res) => {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = accept;
      inp.onchange = () => res(inp.files[0] || null);
      inp.addEventListener("cancel", () => res(null));
      inp.click();
    });
  }

  // ---------- Druck (Schritt 7) ----------
  // Bilder der PDF-Pläne fertig rendern und laden, bevor der Druckdialog kommt
  async function preparePrint() {
    for (const sh of S.doc.sheets) {
      const b = sh.bg;
      if (sh.kind !== "pv" || !b?.asset || !P.layerState(sh, "bg").show || sh.hide?.includes("bg")) continue;
      const url = await imageReady(S.doc.assets, b.asset, b.page);
      if (url) { const img = new Image(); img.src = url; await img.decode().catch(() => {}); }
    }
  }
  // Seiten eines Blatts als SVG-Text: Stringplan eine Seite, Stringübersicht so viele wie nötig
  function printPages(sh, i) {
    if (sh.kind === "pvtab") return PR.tablePagesSVG(sh, S.doc);
    const b = sh.bg;
    let content = "";
    const H = new Set(sh.hide ?? []);
    if (b?.asset && P.layerState(sh, "bg").show && !H.has("bg")) content += bgSVG(b, imageFor(S.doc.assets, b.asset, b.page, () => {}));
    return [PR.planPageSVG(sh, content + itemsSVG(sh, H), printCenter(sh), "pvclip" + i, H)];
  }

  // ---------- Seitenleisten ----------
  const toolBtn = (id, icon, label, key = keyOf(id), on = S.tool === id) => `<button class="tool" data-tool="${id}" aria-pressed="${on}"${key ? ` title="${label} (Taste ${key})"` : ""}>${icon}<span>${label}</span><span class="key">${key}</span></button>`;
  function leftHTML() {
    let h = `<section class="section"><h2 class="section-title">Werkzeuge</h2>`;
    for (const t of TOOLS.filter((t) => t.id !== "wire")) h += toolBtn(t.id, R.icons[t.icon], t.label, t.key);
    // Nur die Werkzeuge der aktiven Ebene (Schritt 5b). Ohne Plan bleibt „PDF-Plan laden“ auf jeder Ebene sichtbar.
    const sec = (title) => `</section><section class="section"><h2 class="section-title">${title}</h2>`;
    if (act() === "bg" || !bg()) h += sec("Plan") + `<button class="tool" data-pvact="pdf">${R.icons.pdf}<span>${bg()?.asset ? "Neuer Planstand" : "PDF-Plan laden"}</span></button>`;
    if (act() === "bg") h += (bg()?.asset ? `<button class="tool" data-pvact="scale">${ICON.scale}<span>Massstab eingeben</span></button>` : "") + toolBtn("pv-measure", ICON.measure, "Massstab messen") + toolBtn("pv-fix", ICON.fix, "Fixpunkt setzen") + toolBtn("pv-rotate", ICON.rotate, "Plan drehen");
    if (act() === "dach") h += sec("Dach") + toolBtn("pv-roof", ICON.roof, "Dachlinie") + toolBtn("pv-keepout", ICON.keepout, "Sperrfläche");
    if (act() === "module") h += sec("Module") + toolBtn("pv-module", ICON.module, "Modul") + toolBtn("pv-field", ICON.field, "Modulfeld");
    if (act() === "kabel") h += sec("Verkabelung") + toolBtn("pv-string", ICON.string, "String", undefined, S.tool === "pv-string" && !auto) + `<button class="tool" data-pvact="auto" aria-pressed="${auto || picking()}" title="Autoverkabelung: erstes Modul anklicken, dann Anzahl und Richtung wählen">${ICON.auto}<span>Autoverkabelung</span></button>` + toolBtn("pv-spa", ICON.spa, "SPA") + toolBtn("pv-line", ICON.line, "Leitung") + toolBtn("pv-point", ICON.point, "Punkt") + `<button class="tool" data-pvact="strclear" title="Markierte Strings, ohne Markierung alle Strings dieses Stringplans">${R.icons.trash}<span>Verkabelung löschen</span></button>`;
    h += `</section><section class="section"><h2 class="section-title">Ebenen</h2>`;
    for (const [k, name] of P.LAYERS) {
      const n = P.DRAW_LAYERS.indexOf(k) + 1; // ⌘1 bis ⌘5
      const label = `<button class="layer-name" data-pvact="active" data-layer="${k}" aria-pressed="${k === act()}" title="Aktive Ebene (⌘${n})">${name}<span class="key">⌘${n}</span></button>`;
      const s = lay(k), btn = (key, on, icon, label) => `<button class="layer-btn" data-pvact="layer" data-layer="${k}" data-key="${key}" aria-pressed="${on}" title="${label}" aria-label="${name}: ${label}">${icon}</button>`;
      h += `<div class="layer-row${s.show ? "" : " off"}${k === act() ? " active" : ""}">${label}${btn("show", s.show, s.show ? ICON.eye : ICON.eyeOff, s.show ? "Ausblenden" : "Einblenden")}${btn("lock", s.lock, s.lock ? ICON.lock : ICON.unlock, s.lock ? "Entsperren" : "Sperren")}</div>`;
    }
    const off = (S.model.hide ?? []).filter((k) => !P.PRINT_ONLY.has(k)).map((k) => P.PRINT_PARTS.find(([x]) => x === k)[1]);
    if (off.length) h += `<p class="note">Über „Druck“ ausgeblendet: ${off.join(", ")}.</p>`; // 5ai
    return h + "</section>";
  }
  // Rechte Leiste. null = app.js zeigt die Standardleiste (Text, Mehrfachauswahl).
  function panelHTML(sel, { head, fieldHTML, META_FIELDS, dupDel }) {
    const b = bg(), note = (t) => `<p class="note">${t}</p>`;
    if (picking()) return pickPanel(head); // 5bc: vor allem anderen, die Auswahl sind hier Module
    if (sel.length === 1 && P.PV_TYPES.has(sel[0].type)) {
      const it = sel[0], n = it.pts.length;
      const turned = Math.abs(Math.round((it.fdir || 0) / 90)) % 2 === 1, zg = it.fill?.startsWith("ziegel");
      const dirSel = it.fill ? choice("fdir", [["0", zg ? "Reihen waagrecht" : "Rippen senkrecht"], ["90", zg ? "Reihen senkrecht" : "Rippen waagrecht"]], turned ? "90" : "0", "Richtung") : ""; // 5i
      const fill = P.canFill(it) ? choice("fill", P.FILLS, it.fill ?? "", "Füllung") + dirSel + (it.closed ? "" : note("Eine Füllung schliesst die Linie (letzter Punkt zum ersten).")) : note("Füllung ab drei Punkten."); // 5h, 5t
      if (it.type === "keepout") return head("Sperrfläche", `${n} Eckpunkte, Ebene ${layerName(P.layerOf(it))}`) + note(`Fläche ${String(Math.round(P.area(it.pts) / 1e4) / 100).replace(".", ",")} m², Umfang ${fmtMm(P.pathLen(it))} mm`) + note("Bereich ohne Module, graue Kreuzschraffur.") + dupDel(); // 5u
      return head("Dachlinie", `${n} Punkte, ${it.closed ? "geschlossen" : "offen"}, Ebene ${layerName(P.layerOf(it))}`) + note(`Länge ${fmtMm(P.pathLen(it))} mm`) + fill + dupDel();
    }
    if (sel.length && sel.every((it) => it.type === "pvmodule")) return modPanel(sel, head, dupDel);
    if (sel.length === 1 && sel[0].type === "pvstring") return strPanel(sel[0], head);
    if (sel.length && sel.every((it) => it.type === "pvline")) return linePanel(sel, head, dupDel);
    if (sel.length === 1 && sel[0].type === "pvpoint") return head("Punkt", "Ebene Verkabelung") + `<div class="field"><label>Beschriftung</label><input type="text" data-pvopt="pts" value="${R.esc(sel[0].s)}" autocomplete="off" spellcheck="false"></div>`
      + thField(sel) + note("Doppelklick auf den Punkt ändert den Text. Griff am Text ziehen setzt ihn frei neben den Punkt.") + (sel[0].ox !== undefined ? `<div class="row"><button class="btn outline small" data-pvact="ptreset">Text zurück neben den Punkt</button></div>` : "") + dupDel();
    if (sel.length === 1 && sel[0].type === "text") return head("Text", `Ebene ${layerName(P.layerOf(sel[0]))}`) + fieldHTML("Inhalt", 'data-text="s"', sel[0].s) + thField(sel) + dupDel(); // 5ba
    if (sel.length > 1 && sel.every((it) => it.type === "text" || it.type === "pvpoint")) return head(`${sel.length} Texte und Punkte`, "Texthöhe für alle") + thField(sel) + dupDel();
    if (sel.length === 1 && sel[0].type === "spa") return head("SPA", "Ebene Verkabelung") + note("Potentialanschluss, Platzhalter bis Phase 2 (Unterkonstruktion).") + dupDel();
    if (sel.length) return null;
    if (MOD_TOOLS[S.tool]) return toolPanel(head);
    if (S.tool === "pv-line") return head("Leitung", "Neue Leitungen auf der Ebene Verkabelung") + lineFields("lw", "lcol", opt.lw, opt.lcol) + note("Breite im Planmass: 50 mm sind bei 1:100 auf dem Papier 0,5 mm.");
    if (S.tool === "pv-point") return head("Punkt", "Neue Punkte auf der Ebene Verkabelung") + note("Klick setzt den Punkt, danach die Beschriftung eingeben (Eingabetaste). Leer = Punkt ohne Text.");
    if (S.tool === "pv-string" && auto) return head("Autoverkabelung", "Neue Strings auf der Ebene Verkabelung") + limitHTML() + note("Erstes Modul anklicken (+ des ersten Strings). Danach Anzahl Strings, Module je String und Richtung wählen. Ein Schritt rückgängig.") + note(S.doc.pv?.anlage ? "Bezeichnungen aus der Anlage (rechts ohne Auswahl unter „Wechselrichter“)." : "Ohne Anlage: Bezeichnungen fortlaufend ab dem nächsten freien String.");
    if (S.tool === "pv-string") return stringToolPanel(head);
    let h = head("Stringplan", "PV-Strangplan, Einheit mm");
    h += `<h3 class="pv-title">Plan</h3>`;
    if (!b) h += note("Noch kein Plan. Links „PDF-Plan laden“ wählen.");
    else {
      h += note(`${R.esc(b.name || "PDF")}, Seite ${b.page}`);
      if (!b.asset) h += note("Die PDF-Datei fehlt (zum Beispiel nach dem Wiederherstellen). Bitte den Plan neu laden, Massstab und Fixpunkt bleiben.");
      h += note(b.mmPerPt ? `Massstab ${P.fmtDen(P.denOf(b.mmPerPt))}${b.measure ? `, Messstrecke ${fmtMm(b.measure.mm)} mm` : ""}` : "Massstab fehlt: Messstrecke über eine bekannte Länge ziehen.");
      h += note(b.fix ? "Fixpunkt gesetzt." : "Fixpunkt fehlt: einen markanten Punkt (z. B. Dachecke) wählen.");
      if (b.rot) h += note(`Plan gedreht um ${P.fmtDeg(b.rot)}.`);
      if (act() !== "bg") h += note("Plan-Werkzeuge: links Ebene Hintergrund wählen (⌘1).");
      if (b.swap) h += note("Neuer Planstand: Massstab messen und Fixpunkt an derselben Stelle wie im alten Plan setzen.");
    }
    h += contHTML();
    h += fileRowsHTML();
    h += `<div class="row pv-last"><button class="btn outline small" data-act="dupsheet" title="Blatt kopieren, die Kopie ist unabhängig">${R.icons.copy.replace("<svg", '<svg width="16" height="16"')}Blatt duplizieren</button><button class="btn outline small danger" data-act="delsheet"${S.doc.sheets.length < 2 ? " disabled" : ""}>${R.icons.trash.replace("<svg", '<svg width="16" height="16"')}Blatt löschen</button></div>`;
    return h;
  }
  // Papier und Druckmassstab (Schritt 7). Hinweis, ob der Inhalt ins Planfeld passt, sonst der kleinste passende Normmassstab.
  function printFit() {
    const p = P.paperOf(S.model), a = P.printArea(p), box = contentBox(S.model);
    return { p, a, box, ok: !box || ((box.x1 - box.x0) / p.den <= a.x1 - a.x0 && (box.y1 - box.y0) / p.den <= a.y1 - a.y0) };
  }
  function paperHTML() {
    const { p, a, box, ok } = printFit(), m = (v) => String(Math.round(v / 100) / 10).replace(".", ",");
    const tip = `Gedruckt wird ${S.model.pmid ? "um die gesetzte Druckmitte" : "die Mitte des Inhalts"} (gestrichelter Rahmen). Ausgeben: Exportieren → PDF alle Blätter.`;
    let h = choice("psize", Object.keys(P.PAPERS).map((k) => [k, `${k} (${P.PAPERS[k][0]} × ${P.PAPERS[k][1]} mm)`]), p.size, "Papier");
    h += choice("pquer", [["1", "quer"], ["0", "hoch"]], p.quer ? "1" : "0", "Ausrichtung");
    h += `<div class="field"><label>Massstab 1:</label><input type="text" data-pvopt="pden" value="${String(p.den).replace(".", ",")}" autocomplete="off" spellcheck="false"></div>`;
    // Ein Satz sichtbar, Rest als Tooltip
    h += `<p class="note" data-pvprint title="${R.esc(tip)}">Planfeld ${fmtMm(a.x1 - a.x0)} × ${fmtMm(a.y1 - a.y0)} mm = ${m((a.x1 - a.x0) * p.den)} × ${m((a.y1 - a.y0) * p.den)} m${box ? `, Inhalt ${m(box.x1 - box.x0)} × ${m(box.y1 - box.y0)} m ${ok ? "passt" : `<b class="warn">passt nicht, passend ab ${P.fmtDen(P.fitDen(box, p))}</b>`}` : ""}.</p>`;
    h += `<div class="row"><button class="btn outline small" data-pvact="pmid">Druckmitte setzen</button>${S.model.pmid ? `<button class="btn outline small" data-pvact="pmidauto">Mitte automatisch</button>` : ""}</div>`; // 5ao
    const no = S.model.north, turned = P.northOnPaper(S.model);
    h += `<div class="field"><label>Nordrichtung in Grad (im Uhrzeigersinn ab oben im Plan)</label><input type="text" data-pvopt="north" value="${no === undefined ? "" : P.fmtNum(no)}" placeholder="leer = kein Nordpfeil" autocomplete="off" spellcheck="false"></div>`; // 5aq
    if (turned !== null && bg()?.rot) h += `<p class="note">Der Nordpfeil dreht mit dem Plan und zeigt im Druck ${P.fmtNum(turned)}°.</p>`;
    h += strkField(); // 5bb
    h += `<p class="note">Auf Druck und Bildschirm (Plankopf, Nordpfeil und Massstabsleiste nur im Druck):</p>`;
    for (const [k, l] of P.PRINT_PARTS) h += `<label class="chk"><input type="checkbox" data-pvopt="pr" data-part="${k}"${(S.model.hide ?? []).includes(k) ? "" : " checked"}> ${l}</label>`;
    return h;
  }
  // Fenster Wechselrichter (UI Schritt 6 Teil 2): Tmin, je WR eine Zeile mit Datenblatt, Anzahl MPPT und Strings je MPPT (Anlage 5k), dazu der WR-Katalog.
  // Zeilen: alle WR der Anlage und alle WR-Nummern aus Strings oder Zuordnungen. Gleiche Daten auf Stringplan und Stringübersicht.
  function wrHTML() {
    const a = S.doc.pv?.anlage ?? [], n = Math.max(a.length, 0, ...P.wrNumbers(S.doc));
    const inp = (attrs, v, label) => `<input type="text" inputmode="numeric" ${attrs} value="${v || ""}" placeholder="0" aria-label="${label}" autocomplete="off" spellcheck="false">`;
    let h = TAB.tminHTML() + `<h3 class="pv-title">Anlage</h3>`;
    h += `<div class="row"><button class="btn outline small" data-pvact="wradd">${R.icons.plus.replace("<svg", '<svg width="16" height="16"')}WR hinzufügen</button></div>`;
    for (let i = 0; i < n; i++) {
      const w = a[i] ?? { str: [] }, nr = i + 1;
      const empty = !w.str.length && !S.doc.pv?.wr?.[nr]; // 5as: geleert → nächster Klick löscht
      h += `<div class="pv-wr" data-wrrow="${nr}"><div class="pv-wr-head"><span class="pv-wr-grip" draggable="true" data-wrdrag="${nr}" title="Ziehen verschiebt den WR, die Nummern folgen der Reihenfolge">⠿ WR ${nr}</span><button class="btn outline small danger" data-pvact="wrrm" data-wr="${i}" title="${empty ? "WR löschen (folgende WR rücken nach)" : "WR leeren (nochmals × löscht ihn)"}" aria-label="WR ${nr} ${empty ? "löschen" : "leeren"}">×</button></div>`;
      h += `<div class="pv-wr-grid"><div class="field"><label>Datenblatt</label>${TAB.wrSelect(nr)}</div><div class="field"><label>MPPT</label>${inp(`data-pvopt="mppt" data-wr="${i}"`, w.str.length, `WR ${nr}: Anzahl MPPT`)}</div></div>`;
      if (w.str.length) h += `<div class="field"><label>Strings je MPPT</label><div class="pv-mppt">${w.str.map((k, m) => `<label><span>${m + 1}</span>${inp(`data-pvopt="str" data-wr="${i}" data-m="${m}"`, k, `WR ${nr}, MPPT ${m + 1}: Strings`)}</label>`).join("")}</div></div>`;
      h += `</div>`;
    }
    const total = a.reduce((s, w) => s + w.str.reduce((x, k) => x + k, 0), 0);
    h += `<p class="note">${a.length ? `${total} Strings vorgesehen, ${P.anlageFree(undefined, S.model).length} frei. Vorschlag beim Zeichnen und in der Autoverkabelung in dieser Reihenfolge.` : "Ohne Anlage: Bezeichnungen der Strings frei (WR.MPPT.String)."}</p>`;
    return h + `<h3 class="pv-title">WR-Typen (Datenblätter)</h3>` + TAB.invCatHTML();
  }
  // Rechts ohne Auswahl (Stringplan und Stringübersicht, 18.10.2026): Daten der Datei als Zeilen mit Kurzstand, Klick öffnet das Fenster daneben (app.js togglePop)
  function fileRowsHTML() {
    const nt = types().length, nw = wrRows(), tmin = S.doc.pv?.tmin;
    const row = (id, pop, ic, label, sub, warn) => `<button class="pv-open${warn ? " warn" : ""}" id="${id}" data-pop="${pop}" aria-haspopup="dialog" aria-expanded="false" aria-controls="pv-pop"><span class="ic">${R.icons[ic]}</span><span class="mt"><span class="mh">${label}</span><span class="ms">${sub}</span></span><span class="chev" aria-hidden="true">›</span></button>`;
    return `<h3 class="pv-title">Daten der Datei</h3>`
      + row("btn-pvmod", "mod", "pvmod", "Module", nt ? `${nt} ${nt === 1 ? "Typ" : "Typen"}` : "noch kein Modultyp", !nt)
      + row("btn-pvwr", "wr", "pvwr", "Wechselrichter", `${nw ? `${nw} WR` : "keine Anlage"}, ${typeof tmin === "number" ? `Tmin ${P.fmtNum(tmin)} °C` : "Tmin fehlt"}`, typeof tmin !== "number");
  }
  // Fenster: Module, Wechselrichter (rechts), Druck (oben, mit Plankopf). kind: "mod", "wr", "druck"
  function popHTML(kind, { head, fieldHTML, META_FIELDS }) {
    if (kind === "mod") return head("Module", "Modultypen dieser Datei") + typesHTML();
    if (kind === "wr") return head("Wechselrichter", "Für die ganze Datei") + wrHTML();
    const kopf = `<h3 class="pv-title">Plankopf</h3>` + META_FIELDS.map((f) => fieldHTML(f.label, `data-meta="${f.tag}"`, S.model.meta[f.tag] ?? "")).join("");
    return head("Druck", isTab() ? "Papier der Stringübersicht" : "Papier und Massstab für die PDF") + (isTab() ? TAB.paperHTML() : paperHTML()) + kopf;
  }
  // Aufschrift des Knopfs Druck: „A3 · 1:100“, warn = Inhalt passt nicht. Stringübersicht: ihr Papier.
  function printLabel() {
    if (isTab()) { const pp = { size: "A4", quer: true, ...S.model.paper }; return { text: `${pp.size} ${pp.quer ? "quer" : "hoch"}`, warn: false }; }
    const f = printFit();
    return { text: `${f.p.size} · ${P.fmtDen(f.p.den)}`, warn: !f.ok };
  }
  const setAnlage = (fn) => change(() => { S.doc.pv ??= {}; const a = (S.doc.pv.anlage ?? []).map((w) => ({ str: [...w.str] })); fn(a); S.doc.pv.anlage = a.length ? a : undefined; S.doc.pv = P.tidyPv(S.doc.pv); });
  const choice = (k, opts, cur, label) => `<div class="field"><label>${label}</label><select data-pvopt="${k}">${opts.map(([v, l]) => `<option value="${R.esc(v)}"${v === cur ? " selected" : ""}>${R.esc(l)}</option>`).join("")}</select></div>`;
  const num = (k, label, step) => `<div class="field"><label>${label}</label><input type="number" data-pvopt="${k}" value="${opt[k]}" step="${step}" min="${step === 1 ? 1 : 0}"></div>`;
  const LAGE = [["0", "hoch (lange Seite senkrecht)"], ["1", "quer (lange Seite waagrecht)"]];
  const typeOpts = () => types().map((t) => [t.id, t.name]);
  const typeLine = (t) => `${fmtMm(t.l)} × ${fmtMm(t.b)} mm${t.pmax ? `, ${fmtMm(t.pmax)} W` : ""}`;
  // Einstellungen für das Werkzeug Modul bzw. Modulfeld
  function toolPanel(head) {
    const field = S.tool === "pv-field", t = curType(), note = (x) => `<p class="note">${x}</p>`;
    let h = head(field ? "Modulfeld" : "Modul", "Neue Module auf der Ebene Module");
    const neu = `<div class="row"><button class="btn outline small" data-pvact="mtnew">Neuer Modultyp</button></div>`;
    if (!t) return h + note("Noch kein Modultyp. Alle Modultypen: rechts ohne Auswahl unter „Module“.") + neu;
    h += choice("mt", typeOpts(), t.id, "Modultyp") + choice("quer", LAGE, opt.quer ? "1" : "0", "Lage");
    if (field) h += num("cols", "Spalten", 1) + num("rows", "Reihen", 1) + num("gq", "Abstand quer zum Modul in mm (zwischen den langen Seiten)", 1) + num("gl", "Abstand längs zum Modul in mm (zwischen den kurzen Seiten)", 1); // 5y
    h += neu;
    const [w, hh] = P.modSize(t, opt.quer), [gx, gy] = P.gapsXY(opt.quer, opt.gq, opt.gl), W = field ? opt.cols * w + (opt.cols - 1) * gx : w, H = field ? opt.rows * hh + (opt.rows - 1) * gy : hh;
    return h + note(`${field ? `${opt.cols * opt.rows} Module, ` : ""}${fmtMm(W)} × ${fmtMm(H)} mm. Klick setzt die Ecke ${P.cornerName(corner)} (Punkt). Tab wechselt die Ecke, Shift+Tab zurück.`);
  }
  // Leitung (5ax): Breite und Farbe, für neue Leitungen (lw, lcol) oder die gewählten (selw, selcol)
  const lineFields = (kw, kc, w, col) => `<div class="field"><label>Breite in mm (Planmass)</label><input type="text" inputmode="decimal" data-pvopt="${kw}" value="${w === undefined ? "" : fmtMm(w)}" placeholder="(verschieden)" autocomplete="off" spellcheck="false"></div>`
    + `<div class="field"><label>Farbe</label><input type="color" data-pvopt="${kc}" value="${col ?? P.LINE_COL}"></div>`;
  function linePanel(ls, head, dupDel) {
    const one = ls[0], n = ls.length, same = (k) => ls.every((l) => l[k] === one[k]);
    return head(n === 1 ? "Leitung" : `${n} Leitungen`, `Ebene Verkabelung${n === 1 ? `, ${one.pts.length} Punkte` : ""}`) + lineFields("selw", "selcol", same("w") ? one.w : undefined, same("col") ? one.col : undefined)
      + `<p class="note">${n === 1 ? `Länge ${fmtMm(P.pathLen(one))} mm. ` : ""}Griffe ziehen verschiebt einzelne Punkte (Shift = 0°, 45° oder 90°).</p>` + dupDel();
  }
  // 5ba: Texthöhe der Auswahl in mm im Planmass, leer bei verschiedenen Höhen
  function thField(sel) {
    const hs = new Set(sel.map((t) => t.h ?? P.PV_TEXT_H)), h = hs.size === 1 ? [...hs][0] : undefined, den = P.paperOf(S.model).den;
    return `<div class="field"><label>Texthöhe in mm (Planmass)</label><input type="text" inputmode="decimal" data-pvopt="th" value="${h === undefined ? "" : fmtMm(h)}" placeholder="(verschieden)" autocomplete="off" spellcheck="false"></div>`
      + `<p class="note">${h === undefined ? "Gilt für alle gewählten." : `Auf dem Papier ${fmtMm(h / den)} mm bei ${P.fmtDen(den)}.`}</p>`;
  }
  // 5bb: Grösse der Stringbeschriftung (Bezeichnung, + und −) in %, für diesen Stringplan
  const strkField = () => `<div class="field"><label>Stringbeschriftung (Bezeichnung, + und −) in %</label><input type="text" inputmode="decimal" data-pvopt="strk" value="${fmtMm((S.model.strk || 1) * 100)}" autocomplete="off" spellcheck="false"></div>`;
  // 5bc: Einschränkung der Autoverkabelung (Zeile im Fenster Autoverkabelung)
  function limitHTML() {
    const ids = autoIds();
    return `<p class="note" data-pvlimit>${ids ? `Eingeschränkt auf ${ids.size} Module (grün).` : "Alle freien Module."}</p><div class="row"><button class="btn outline small" data-pvact="autopick">Module einschränken</button>${ids ? `<button class="btn outline small" data-pvact="autoclear">Einschränkung aufheben</button>` : ""}</div>`;
  }
  function pickPanel(head) {
    const n = [...S.sel].filter((id) => S.model.items.some((m) => m.id === id && m.type === "pvmodule")).length;
    return head("Module einschränken", "Für die Autoverkabelung") + `<p class="note" data-pvpickcount><b>${n} Modul${n === 1 ? "" : "e"} gewählt.</b></p>`
      + `<p class="note">Module anklicken (nochmals = abwählen) oder einen Rahmen ziehen, ⌘A wählt alle. Ohne Wahl verkabelt die Autoverkabelung wie bisher alle freien Module.</p>`
      + `<div class="row"><button class="btn primary small" data-pvact="autodone">Übernehmen</button><button class="btn outline small" data-pvact="autonone"${n ? "" : " disabled"}>Alle abwählen</button></div>`;
  }
  // Werkzeug String: Bezeichnung des nächsten Strings, Liste der Strings auf dem Plan
  const swatch = (name) => `<span class="pv-swatch" style="background:${P.stringColor(name)}"></span>`;
  const nameField = (k, v) => `<div class="field"><label>Bezeichnung (WR.MPPT.String)</label><input type="text" data-pvopt="${k}" value="${R.esc(v)}" autocomplete="off" spellcheck="false"></div>`;
  function stringToolPanel(head) {
    const own = wire?.sheet === S.model ? wire : null, name = own?.name ?? nextName(), n = P.parseName(name), list = P.strings(S.model);
    let h = (own?.edit ? head(`String ${own.name} bearbeiten`, own.front ? "Module am Anfang einfügen (vor dem +)" : "Module anhängen oder einfügen") : head("String", "Neue Strings auf der Ebene Verkabelung")) + nameField("sname", name);
    if (n) h += `<p class="note">${swatch(name)}WR ${n.wr}, MPPT ${n.mppt}, String ${n.str}${own ? `, ${own.mods.length} Modul${own.mods.length === 1 ? "" : "e"} angeklickt` : ""}</p>`;
    h += `<p class="note">${own?.front ? "Module vom bisherigen + weg anklicken, das zuletzt angeklickte wird das neue +." : "Module der Reihe nach anklicken, das erste ist +, das letzte −."} Klick auf ein Modul im String: weitere Module danach einfügen. Shift + Klick nimmt ein Modul heraus.</p>`;
    h += strkField() + head("Strings auf diesem Plan");
    h += list.length ? list.map((st) => `<p class="note">${swatch(st.name)}${R.esc(st.name)}: ${st.mods.length} Module</p>`).join("") : `<p class="note">Noch keine.</p>`;
    return h;
  }
  // Gewählter String: Bezeichnung ändern, Angaben, Löschen
  function strPanel(st, head) {
    const n = P.parseName(st.name);
    let h = head(`String ${st.name}`, `Ebene Verkabelung, ${st.mods.length} Modul${st.mods.length === 1 ? "" : "e"}`) + nameField("selname", st.name);
    if (n) h += `<p class="note">${swatch(st.name)}WR ${n.wr}, MPPT ${n.mppt}, String ${n.str}</p>`;
    h += `<p class="note">+ am ersten, − am letzten angeklickten Modul. Module verschieben: die Linie folgt.</p>`;
    h += `<div class="row"><button class="btn outline small" data-pvact="strapp">Module anhängen</button><button class="btn outline small" data-pvact="strfront">Am Anfang einfügen</button><button class="btn outline small" data-pvact="strrev">Umkehren</button></div>`;
    h += `<p class="note">Spannungsprüfung: Blatt Stringübersicht (Menü +).</p>`;
    return h + `<div class="row"><button class="btn outline small danger" data-act="del">${R.icons.trash.replace("<svg", '<svg width="16" height="16"')}Löschen</button></div>`;
  }
  // Katalog: Modultypen der Datei
  function typesHTML() {
    let h = types().length ? "" : `<p class="note">Noch kein Modultyp.</p>`;
    for (const t of types()) h += `<div class="libhead"><span>${R.esc(t.name)}<br><span class="note">${typeLine(t)}</span></span><span><button class="btn outline small" data-pvact="mtedit" data-mt="${R.esc(t.id)}">Ändern</button> <button class="btn outline small danger" data-pvact="mtdel" data-mt="${R.esc(t.id)}" aria-label="Modultyp ${R.esc(t.name)} löschen">×</button></span></div>`;
    return h + `<div class="row"><button class="btn outline small" data-pvact="mtnew">Neuer Modultyp</button><button class="btn outline small" data-pvact="catload">Katalog laden</button><button class="btn outline small" data-pvact="catsave"${types().length ? "" : " disabled"}>Katalog sichern</button><button class="btn outline small" data-pvact="catcloud" title="Datenblätter online laden oder speichern">Online</button></div>`;
  }
  // Gewählte Module: Typ und Lage ändern, Warnung Sperrfläche
  function modPanel(mods, head, dupDel) {
    const one = mods[0], same = (k) => mods.every((m) => m[k] === one[k]), t = P.modType(one.mt), n = mods.length;
    let h = head(n === 1 ? "Modul" : `${n} Module`, `Ebene Module${same("mt") && t ? `, ${t.name}` : ""}`);
    h += choice("selmt", [...(same("mt") ? [] : [["", "(verschieden)"]]), ...typeOpts()], same("mt") ? one.mt : "", "Modultyp");
    h += choice("selquer", [...(same("quer") ? [] : [["", "(verschieden)"]]), ...LAGE], same("quer") ? (one.quer ? "1" : "0") : "", "Lage");
    const warn = mods.filter((m) => P.onKeepout(S.model, m)).length;
    if (warn) h += `<p class="note">${warn === 1 && n === 1 ? "Das Modul liegt" : `${warn} Module liegen`} auf einer Sperrfläche.</p>`;
    if (n === 1 && t) h += `<p class="note">${typeLine(t)}, Ecke unten links bei x ${fmtMm(one.x)}, y ${fmtMm(one.y)} mm${one.rot ? `, mit dem Plan gedreht ${P.fmtDeg(one.rot)}` : ""}</p>`;
    return h + dupDel();
  }
  function hint() {
    if (S.tool === "pv-measure") return draft ? "Endpunkt der Strecke anklicken. Danach die wirkliche Länge eingeben. Esc bricht ab." : "Messstrecke: Anfang einer bekannten Strecke anklicken (zum Vergrössern zoomen).";
    if (S.tool === "pv-rotate") return draft ? "Zweiten Punkt der Kante anklicken. Danach den Winkel bestätigen oder ändern. Esc bricht ab." : "Plan drehen: zwei Punkte auf einer Kante anklicken, die waagrecht oder senkrecht liegen soll (Drehpunkt = Fixpunkt).";
    if (S.tool === "pv-pmid") return "Druckmitte: in den Plan klicken, dort liegt die Mitte des Druckbereichs. Esc bricht ab.";
    if (S.tool === "pv-fix") return "Fixpunkt: einen markanten Punkt anklicken, der auch im nächsten Planstand vorkommt (z. B. Dachecke).";
    if (DRAW_TOOLS[S.tool]) return path ? `${DRAW_TOOLS[S.tool]} auf Ebene ${layerName(path.layer)}: weitere Punkte klicken, Shift = 0°, 45° oder 90°. Klick auf den ersten Punkt schliesst, Eingabetaste oder Esc beendet. Fang: Ecke ▢, Schnitt ⊗, Mitte △, Kante ✕, Alt schaltet ihn aus.` : `${DRAW_TOOLS[S.tool]} auf Ebene ${layerName(act())}: ersten Punkt klicken. Fängt auf Ecken, Schnittpunkte, Mitten und Kanten der Dachlinien und auf das Raster ab Fixpunkt.`;
    if (MOD_TOOLS[S.tool]) return curType() ? `${MOD_TOOLS[S.tool]} auf Ebene Module: Klick setzt die Ecke ${P.cornerName(corner)}. Tab wechselt die Ecke, jetzt: ${P.cornerName(corner)}. Fängt auf Ecken von Dach und Modulen, sonst Raster, Alt schaltet den Fang aus. Einstellungen rechts.` : "Zuerst rechts einen Modultyp anlegen.";
    if (picking()) return "Module einschränken: Module anklicken oder Rahmen ziehen, ⌘A alle. Rechts „Übernehmen“, Esc bricht ab.";
    if (S.tool === "pv-string" && auto) return `Autoverkabelung: erstes Modul anklicken (+ des ersten Strings)${autoIds() ? ", nur grün markierte Module" : ""}. Esc bricht ab.`;
    if (S.tool === "pv-string") return wire ? `String ${wire.name}: nächstes Modul anklicken oder ⌥ halten und darüberfahren (zurück auf das vorletzte nimmt das letzte heraus). Klick auf ein Modul im String fügt danach ein, Shift + Klick nimmt es heraus. Nochmals auf das zuletzt gesetzte Modul, Eingabetaste oder Esc beendet.` : `String ${nextName()} auf Ebene Verkabelung: erstes Modul (+) anklicken, dann die weiteren der Reihe nach, oder ⌥ halten und über die Module fahren. Shift + Klick nimmt ein Modul aus seinem String. Bezeichnung rechts.`;
    if (S.tool === "pv-line") return lpath ? "Leitung: weitere Punkte klicken, Shift = 0°, 45° oder 90°. Doppelklick oder Eingabetaste beendet, Esc bricht ab. Fang: Ecke ▢, Schnitt ⊗, Mitte △, Kante ✕, Alt schaltet ihn aus." : "Leitung auf Ebene Verkabelung: ersten Punkt klicken. Breite und Farbe rechts. Fängt auf Ecken von Dach, Modulen und Leitungen, sonst Raster.";
    if (S.tool === "pv-point") return "Punkt auf Ebene Verkabelung: Klick setzt den Punkt, dann die Beschriftung eingeben. Doppelklick auf einen Punkt (Auswahl) ändert den Text.";
    if (S.tool === "pv-spa") return "SPA auf Ebene Verkabelung: Klick setzt den Punkt. Fängt auf Ecken von Dach und Modulen, sonst Raster, Alt schaltet den Fang aus.";
    if (S.drag?.label) return "Text ziehen: frei, ohne Fang.";
    if (S.drag?.type === "pvvertex") return "Punkt ziehen: fängt wie beim Zeichnen, Shift = 0°, 45° oder 90° zum vorherigen Punkt, Alt ohne Fang.";
    if (S.tool === "text") return `Text auf Ebene ${layerName(act())}: klicken setzt einen Text, die Eingabetaste bestätigt.`;
    if (S.tool === "hand") return "Ziehen verschiebt die Ansicht.";
    if (!bg()) return "Stringplan: zuerst links „PDF-Plan laden“, dann Massstab messen und Fixpunkt setzen.";
    if (gripItems().length) return "Griffe ziehen verschiebt einzelne Punkte (Shift = 0°, 45° oder 90°). Objekt anklicken, ⌘ + Klick oder ⌘ + Rahmen ergänzt die Auswahl (aktive Ebene), ⌘A wählt die aktive Ebene. Alt schaltet den Fang aus.";
    return "Objekt anklicken, ⌘ + Klick oder ⌘ + Rahmen ergänzt die Auswahl (aktive Ebene), ⌘A wählt die aktive Ebene. Raster beginnt am Fixpunkt, Alt schaltet den Fang aus.";
  }

  // Taste wählt ein Werkzeug und macht seine Ebene aktiv (5d). Rückgabe: Taste behandelt?
  function toolKey(k) {
    const t = TOOL_KEYS[k.toLowerCase()];
    if (!t) return false;
    setActive(toolLayer(t));
    if (S.tool !== t || auto) setTool(t); // S beendet auch die Autoverkabelung
    return true;
  }

  // Stringübersicht: keine Objekte und keine Zeichenwerkzeuge, Tabelle statt Plan (pvtab.js)
  const TAB = T.makePvTab({ ...c, pickFile, cloudMenu }), isTab = () => S.model.kind === "pvtab";
  const tab = (f, g) => (...a) => (isTab() ? g(...a) : f(...a));
  // Fenster Module und Wechselrichter: Daten der Datei, auf Stringplan und Stringübersicht dieselben Aktionen
  const TAB_ACTS = new Set(["itnew", "itedit", "itdel", "itcatsave", "itcatload", "itcatcloud"]), DOC_ACTS = new Set(["mtnew", "mtedit", "mtdel", "catsave", "catload", "catcloud", "wradd", "wrrm"]);
  const TAB_OPTS = new Set(["tmin", "wr"]), DOC_OPTS = new Set(["mppt", "str"]);
  return { isPv, activeLayer: act, setActive: tab(setActive, () => {}), sheetSVG: tab(sheetSVG, () => `<rect class="dispo-bg" x="-1e6" y="-1e6" width="2e6" height="2e6"/>`),
    itemsSVG: tab(() => itemsSVG() + printFrameSVG(), () => PR.tableScreenSVG(S.model, S.doc)), overlaySVG: tab(overlaySVG, () => ""), bounds: tab(bounds, () => PR.tableScreenBounds(S.model, S.doc)), snap: tab(snap, (w) => ({ x: w.x, y: w.y })),
    gripAt: tab(gripAt, () => null), dragGrip, pointerDown: tab(pointerDown, () => true), hover: tab(hover, () => {}), toolKey: tab(toolKey, () => false), cornerKey: tab(cornerKey, () => false), cancel, action: (el) => (TAB_ACTS.has(el.dataset.pvact) ? TAB.action(el) : DOC_ACTS.has(el.dataset.pvact) ? action(el) : tab(action, TAB.action)(el)),
    option: (el) => (TAB_OPTS.has(el.dataset.pvopt) ? TAB.option(el) : DOC_OPTS.has(el.dataset.pvopt) ? option(el) : tab(option, TAB.option)(el)), popHTML, printLabel, pickable: tab(pickable, () => []), layerPick: tab(() => (picking() ? pickMods() : P.layerPick(S.model, act())), () => []), picking,
    otherLayers: tab(() => P.otherLayers(S.model, act()), () => []), layerNote: (it) => { const l = P.layerOf(it); return `Liegt auf Ebene ${layerName(l)}. Wechseln mit ⌘${P.DRAW_LAYERS.indexOf(l) + 1}.`; },
    leftHTML: tab(leftHTML, () => TAB.leftHTML(TOOLS, toolBtn)), panelHTML: tab(panelHTML, (sel, o) => TAB.panelHTML({ ...o, fileRowsHTML })), hint: tab(hint, TAB.hint), printPages, preparePrint, moveWr, resetPrintParts, paperOf: (sh) => (sh.kind === "pvtab" ? PR.tabPaper(sh) : P.paperOf(sh)) };
}

const fmtMm = (v) => String(Math.round(v * 10) / 10).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
