// Modul «Plan» (CJ 23.10.2026, nur elplexaCAD), Schritt 1: Bedienung. Zeichenfläche mit Nullpunkt, Raster und Papierrahmen, Ebenenliste,
// Werkzeuge Wand (W), Öffnung (O), Mass (B), Auswahl (V) mit Verschieben und Eckpunkte ziehen, Fenster Druck mit Massstab.
// Rückmeldungen 24.10.2026: freier Grund (Papier, Raster, Plankopf erst im Druck), Wand = Innenlinie, Ausrichtungsfang, Grundriss-Werkzeuge nur auf der Ebene Hintergrund.
// Schritt 3 (CJ 24.10.2026): Leitung (K, auch L), Farben nach 5.100, Mehrfachwahl (Rahmen, Shift-Klick oder Knopf «Mehrfachwahl»), ⌘A/⌘C/⌘V/⌘D.
// CJ 24.10.2026: Leitung geschwungen (Form), PDF-Plan einlesen wie im Stringplan (Massstab eingeben oder messen, Fixpunkt = Nullpunkt, Plan drehen).
// Daten und Geometrie in plan.js. Im SchemaCAD-Bau ersetzt build.mjs diese Datei durch einen Platzhalter.
import * as P from "./plan.js";
import { PLAN_SYMS, SYM_BY_KEY, SYM_GROUPS } from "./plansym.js";
import { PAPERS, paperSize, printArea, paperLabel, fmtDen, PT_MM, mmPerPt, fixOf, bgBox, pageToWorld, worldToPage, scaleFromMeasure, nearestStd, denOf, kOfDen, parseDen, fmtPct, newBg, fixMode, rotatePlan, alignAngle, fmtDeg } from "./pv.js";
import { openPdf, pageSize, toBase64, imageFor, imageReady } from "./pdfbg.js";
import { pageSVG } from "./pvprint.js";
import * as R from "./render.js";

const BG_OPACITY = 0.6; // PDF-Plan blass, damit der Elektroplan hervortritt (wie Stringplan)
const INK = "#000000", SEL = "#2f9e58", DRAFT = "#2f6db3", GUIDE = "#e08a00", FRAME = "#6b7785";
const OPEN_W = { tuer: 900, fenster: 1200, durchgang: 900, schiebe: 900 }; // Vorgabe Breiten in mm (Annahme)
const OPEN_HV = { tuer: 2000, schiebe: 2000, fenster: 1500 }; // Vorgabe Höhe neuer Öffnungen in mm (CJ 23.10.2026)
const ICON = {
  wall: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18v6H3z"/><path d="M6 15l6-6M11 15l6-6M16 15l5-5"/></svg>',
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 18h5M17 18h5"/><path d="M7 18V8"/><path d="M7 8a10 10 0 0110 10"/></svg>',
  line: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18L10 8h10"/><circle cx="4" cy="18" r="1.6"/><circle cx="20" cy="8" r="1.6"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>',
  scale: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17h18M3 14v3M7.5 15.5V17M12 14v3M16.5 15.5V17M21 14v3"/><path d="M7 5v6M12 6.5v.01M12 9.5v.01M16 5v6"/></svg>',
  measure: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20L20 4"/><path d="M4 15v5h5M20 9V4h-5"/></svg>',
  fix: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 2v20M2 12h20"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 11-2.3-5.7"/><path d="M20 4v5h-5"/></svg>',
  free: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v7a5 5 0 0010 0V4"/><path d="M7 4h3v3H7zM14 4h3v3h-3z"/><path d="M3 21L21 3"/></svg>',
  multi: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="1.5" stroke-dasharray="3 2.5"/><path d="M8 12l3 3 5-6"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" opacity=".35"/><path d="M4 4l16 16"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5" opacity=".35"/><path d="M8 11V8a4 4 0 017.5-2" opacity=".35"/></svg>',
};
const f = R.f, pt = (p) => `${f(p[0])},${f(p[1])}`;
const num = (v) => String(Math.round(v * 10) / 10).replace(".", ",").replace("-", "−");

export function makePlan(c) {
  const { S, toast, change, setTool, renderItems, renderOverlay, renderRight, renderLeft, updateHint, fitView, pushUndo, snapshot, markDirty, nextId, chooseDialog, formDialog, confirmDialog } = c;
  const sh = () => S.model;
  const den = () => P.paperOf(sh()).den;
  // Einstellungen für neue Objekte (nur in der Sitzung): Wanddicke (letzte gemerkt), Material, Wandseite (0 automatisch nach der ersten Kurve, 1 links der Zeichenrichtung, −1 rechts), Öffnung, Kontrollmass
  const opt = { d: P.WALL_D, mat: "mauer", side: 0, okind: "tuer", ow: { ...OPEN_W }, ctrl: false, sym: "STD", symR: 0, lkind: "decke", lcurve: false, multi: false, free: false }; // sym/symR: Symbol zum Setzen, Drehung ohne Wand; lkind Leitungsart, lcurve geschwungen; multi = Klick fügt zur Wahl hinzu; free = Fang aus wie Alt (Touch, CJ 24.10.2026)
  let lineDraft = null; // Leitung im Entstehen: { pts }
  let bgDraft = null; // Messstrecke oder Kante zum Drehen (PDF-Plan): erster Punkt [x, y]
  let clip = null, clipN = 0; // Zwischenablage (nur in der Sitzung, auch in andere Pläne): kopierte Objekte, Anzahl Einfügungen
  let draft = null; // Wand im Entstehen: { a, start, len, ang, field }
  let dimDraft = null; // Mass im Entstehen: { a, b? }
  let drag = null, mouse = null, raw = null;
  const sel = () => sh().items.filter((i) => S.sel.has(i.id));
  const pickable = () => sh().items.filter((i) => P.isPickable(sh(), i));
  const visible = () => sh().items.filter((i) => P.isVisible(sh(), i));
  const tol = () => 10 / S.view.z;
  const actLayer = () => P.layerById(sh(), sh().alay);
  function layerOk() {
    const l = actLayer();
    if (l && l.show && !l.lock) return true;
    toast(`Die aktive Ebene „${l?.name ?? ""}“ ist ${l?.lock ? "gesperrt" : "ausgeblendet"}. Andere Ebene wählen oder entsperren.`, "error");
    return false;
  }
  const grid = () => (S.gridSize.plan ??= 100);
  const snapAt = (w, ortho) => P.snapPlan(sh(), visible(), [w.x, w.y], { grid: S.grid.on ? S.grid.size : 0, tol: tol(), alt: S.alt, ortho: S.shift ? ortho : undefined });
  const faces = () => P.faceGeom(visible().filter((i) => i.type === "wall"));
  const AXES = [[1, 0], [0, 1]];
  const alignDirs = (u) => (u && Math.abs(u[0] * u[1]) > 1e-4 ? [...AXES, u, [-u[1], u[0]]] : AXES); // waagrecht, senkrecht und in und quer zur letzten Wand
  // Wand zeichnen: gezeichnet wird die Innenlinie. Fang an Ecken und Flächen der Wände, Ausrichtungsfang an Anfang, letztem Punkt und Ecken (Rechteck schliessen).
  const snapWall = (w, ortho) => { const fg = faces(); return P.snapPlan(sh(), visible(), [w.x, w.y], { grid: S.grid.on ? S.grid.size : 0, tol: tol(), alt: S.alt, ortho: S.shift ? ortho : undefined, faces: fg, extra: draft?.pts ?? [], align: { refs: [...(draft?.pts ?? []), ...fg.corners], dirs: alignDirs(draft?.u) } }); }; // extra: Anfang und Punkte der Kette (Klick auf den Anfang schliesst)
  const snapDim = (w, ortho) => P.snapPlan(sh(), visible(), [w.x, w.y], { grid: S.grid.on ? S.grid.size : 0, tol: tol(), alt: S.alt, ortho: S.shift ? ortho : undefined, extra: faces().corners });
  // Leitung: zusätzlich Fang an Symbolmitten und Leitungspunkten (ohne die Leitung skip), Ausrichtung an den Punkten der Leitung und den Fangpunkten
  const lineSnaps = (skip) => visible().flatMap((i) => (i.type === "sym" ? [P.symCenter(i, den())] : i.type === "line" && i.id !== skip ? i.pts : []));
  const snapLine = (w, ortho, skip) => { const fg = faces(), sn = lineSnaps(skip); return P.snapPlan(sh(), visible(), [w.x, w.y], { grid: S.grid.on ? S.grid.size : 0, tol: tol(), alt: S.alt, ortho: S.shift ? ortho : undefined, extra: [...sn, ...fg.corners], align: { refs: [...(lineDraft?.pts ?? []), ...sn, ...fg.corners], dirs: AXES } }); };

  // ---------- Darstellung ----------
  // Druckmitte: gesetzt (sheet.pmid, Werkzeug «Druckmitte setzen» im Fenster Druck), sonst Mitte des Inhalts (auf 10 mm), ohne Inhalt der Nullpunkt
  const center = () => centerOf(sh());
  const unionBox = (a, b) => (a && b ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : a || b);
  function centerOf(S0) {
    if (S0.pmid) return S0.pmid;
    const b = P.contentBox(S0) || (S0.bg ? bgBox(S0.bg) : null); // ohne Objekte die Mitte des PDF-Plans
    return b ? [Math.round((b.x0 + b.x1) / 20) * 10, Math.round((b.y0 + b.y1) / 20) * 10] : [0, 0];
  }
  // Papier in Welt-mm: Ursprung der Seite so, dass die Mitte des Planfelds auf center() liegt
  function pageAt(at) {
    const p = P.paperOf(sh()), a = printArea(p), [cx, cy] = at ?? center(), k = p.den;
    return { p, a, k, ox: cx - ((a.x0 + a.x1) / 2) * k, oy: cy - ((a.y0 + a.y1) / 2) * k };
  }
  const info = (p) => `Plan · Massstab ${fmtDen(p.den)} · ${paperLabel(p)}`;
  // Freier Grund wie im Stringplan: kein Papier, Raster und Plankopf kommen erst im Druck. Gestrichelt der Druckbereich (Papier und Massstab aus dem Fenster Druck).
  function sheetSVG() {
    const { p, a, k, ox, oy } = pageAt(), v = c.viewBox(), z = S.view.z, x0 = ox + a.x0 * k, y0 = oy + a.y0 * k, h = 3 * k;
    let s = `<rect class="dispo-bg" x="-1e6" y="-1e6" width="2e6" height="2e6"/>` + bgImg(sh(), () => { if (sh().kind === "plan") c.renderSheet(); });
    const b = sh().bg;
    if (b?.measure && bgShown(sh()) && grundOn()) s += measureSVG(pageToWorld(b, ...b.measure.a), pageToWorld(b, ...b.measure.b), `${P.fmtLen(b.measure.mm)} mm`, z);
    if (S.grid.on && S.grid.size * z >= 7) s += `<rect x="${f(v.x0)}" y="${f(v.y0)}" width="${f(v.x1 - v.x0)}" height="${f(v.y1 - v.y0)}" fill="url(#gridpat)" stroke="none" pointer-events="none"/>`;
    s += `<g class="pl-printframe" pointer-events="none"><rect x="${f(x0)}" y="${f(y0)}" width="${f((a.x1 - a.x0) * k)}" height="${f((a.y1 - a.y0) * k)}" fill="none" stroke="${FRAME}" stroke-width="1" stroke-dasharray="8 5"/>`
      + `${txt(x0, y0 + (a.y1 - a.y0) * k + h, `Druckbereich ${paperLabel(p)}, ${fmtDen(p.den)}`, h, 0, FRAME, "start")}</g>`;
    const r = 6 / z; // Nullpunkt: gemeinsam für alle Plan-Module (Stockwerke)
    s += `<g class="pl-origin" stroke="#c0392b" stroke-width="1.5" fill="none"><circle cx="0" cy="0" r="${f(r)}"/><path d="M${f(-2 * r)},0H${f(2 * r)}M0,${f(-2 * r)}V${f(2 * r)}"/></g>`;
    return s;
  }
  // ---------- PDF-Plan (Hintergrund wie im Stringplan, pv.js) ----------
  const bgLayer = (S0) => P.layerById(S0, "bg");
  const bgShown = (S0) => !!S0.bg?.asset && bgLayer(S0)?.show !== false; // liegt auf der Ebene Hintergrund (ohne sie immer sichtbar)
  // PDF-Seite als Bild in der Welt (Massstab, Fixpunkt, Drehung). Ohne Bild ein Platzhalter, bis es gerendert ist.
  function bgImg(S0, onReady) {
    if (!bgShown(S0)) return "";
    const b = S0.bg, url = imageFor(S.doc.assets, b.asset, b.page, (err) => { if (err) toast("Der PDF-Plan lässt sich nicht anzeigen: " + err, "error"); onReady(); });
    const k = mmPerPt(b), [fu, fv] = fixOf(b), tr = `${b.rot ? `rotate(${b.rot}) ` : ""}translate(${f(-fu * k)} ${f(fv * k)}) scale(${k} ${-k})`;
    if (url) return `<g transform="${tr}" opacity="${BG_OPACITY}" pointer-events="none"><image href="${url}" x="0" y="0" width="${b.w}" height="${b.h}" preserveAspectRatio="none"/></g>`;
    return `<rect transform="${tr}" x="0" y="0" width="${b.w}" height="${b.h}" fill="#eef1f4" pointer-events="none"/>`;
  }
  function measureSVG(a, e, label, z) {
    const mx = (a.x + e.x) / 2, my = (a.y + e.y) / 2, h = 12 / z;
    return `<g pointer-events="none"><line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(e.x)}" y2="${f(e.y)}" stroke="${GUIDE}" stroke-width="2" stroke-dasharray="${f(6 / z)} ${f(4 / z)}"/>`
      + `<circle cx="${f(a.x)}" cy="${f(a.y)}" r="${f(3 / z)}" fill="${GUIDE}"/><circle cx="${f(e.x)}" cy="${f(e.y)}" r="${f(3 / z)}" fill="${GUIDE}"/>`
      + (label ? txt(mx, my + h, label, h, 0, GUIDE) : "") + "</g>";
  }
  function bgFree() {
    const l = bgLayer(sh());
    if (!l || (l.show && !l.lock)) return true;
    toast(`Die Ebene „${l.name}“ ist ${l.lock ? "gesperrt" : "ausgeblendet"}. Links unter „Ebenen“ freigeben.`, "error");
    return false;
  }
  function pickFile(accept = ".pdf,application/pdf") {
    return new Promise((res) => {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = accept;
      inp.onchange = () => res(inp.files[0] || null);
      inp.addEventListener("cancel", () => res(null));
      inp.click();
    });
  }
  // PDF wählen, Seite wählen (z. B. EG, UG, OG in einer PDF), Massstab angeben. Mit bestehendem Plan: neuer Planstand.
  async function loadPdf() {
    if (!bgFree()) return;
    const old = sh().bg;
    if (old?.asset && !(await confirmDialog("Neuen Planstand laden?", "Die Objekte bleiben relativ zum Nullpunkt, der neue Plan übernimmt die Drehung des alten. Danach den Massstab angeben oder messen und den Fixpunkt an derselben Stelle wie im alten Plan setzen. Rückgängig ist möglich.", "PDF wählen"))) return;
    const file = await pickFile();
    if (!file) return;
    let bytes, info;
    try { bytes = new Uint8Array(await file.arrayBuffer()); info = await openPdf(bytes); }
    catch (err) { toast("Die PDF lässt sich nicht öffnen: " + (err?.message || err), "error"); return; }
    let page = 1, size;
    try {
      if (info.pages > 1) {
        const ch = await chooseDialog("Seite wählen", `Die PDF hat ${info.pages} Seiten. Welche gehört zu „${c.sheetLabel(sh(), S.active)}“?`, Array.from({ length: info.pages }, (_, i) => ({ label: `Seite ${i + 1}`, n: i + 1 })));
        if (!ch?.option) return;
        page = ch.option.n;
      }
      size = await pageSize(info.doc, page);
    } catch (err) { toast("Die PDF-Seite lässt sich nicht lesen: " + (err?.message || err), "error"); return; }
    finally { info.close(); }
    const { w, h } = size, S0 = sh();
    const relink = old && !old.asset; // nur die PDF fehlte: Massstab und Fixpunkt bleiben, keine Frage
    const sc = relink ? null : await askScale(w, h);
    const data = toBase64(bytes), same = Object.entries(S.doc.assets || {}).find(([, a]) => a.data === data); // dieselbe PDF für mehrere Stockwerke nur einmal speichern
    const id = same ? same[0] : "pdf" + nextId();
    if (!same) S.doc.assets = { ...(S.doc.assets || {}), [id]: { name: file.name, type: "application/pdf", data } };
    change(() => { S0.bg = newBg(old, id, file.name, page, w, h); if (sc?.den) S0.bg.mmPerPt = kOfDen(sc.den); });
    setTool(sc?.measure ? "pl-measure" : "select"); fitView();
    const fixMsg = old ? "Jetzt den Fixpunkt an derselben Stelle wie im alten Plan setzen." : "Jetzt den Fixpunkt setzen (gleicher Punkt in allen Stockwerken).";
    if (relink) toast("Plan wieder verbunden.");
    else if (sc?.den) toast(`${old ? "Neuer Planstand" : "Plan"} geladen, Massstab ${fmtDen(sc.den)}. ${fixMsg}`);
    else toast(`${old ? "Neuer Planstand" : "Plan"} geladen. Jetzt den Massstab messen (Messstrecke), dann den Fixpunkt setzen.`);
  }
  // Massstab bekannt (1:n eingeben, vorbelegt mit dem Druckmassstab) oder Strecke messen. Ergebnis { den }, { measure: true } oder null (später).
  // Annahme Claude (wie Stringplan): Die PDF-Seite hat das Papierformat, auf dem der Massstab gilt (nicht verkleinert oder an die Seite angepasst).
  function askScale(w, h, cur) {
    const size = `${P.fmtLen(w * PT_MM)} × ${P.fmtLen(h * PT_MM)} mm`, v = cur ?? den();
    const body = `<p>Massstab des Plans? Die PDF-Seite misst ${size}. Der Massstab stimmt nur, wenn der Plan auf dieser Seitengrösse gezeichnet ist (nicht verkleinert oder an die Seite angepasst). Im Zweifel eine bekannte Strecke messen.</p>`
      + `<div class="field"><label>Massstab 1:</label><input type="text" data-den placeholder="z. B. 50" value="${String(Math.round(v * 100) / 100).replace(".", ",")}" autocomplete="off" spellcheck="false"></div>`
      + `<div class="actions"><button class="btn outline" data-c>${cur === undefined ? "Später" : "Abbrechen"}</button><button class="btn outline" data-m>Strecke messen</button><button class="btn primary" data-ok>Massstab übernehmen</button></div>`;
    return c.openModal("Massstab des Plans", body, (b, done) => {
      if (b.dataset.c !== undefined) done(null);
      else if (b.dataset.m !== undefined) done({ measure: true });
      else if (b.dataset.ok !== undefined) {
        const d = parseDen(document.querySelector("#modal-root [data-den]").value);
        if (d) done({ den: d }); else toast("Bitte einen Massstab eingeben, z. B. 50 für 1:50.", "error");
      }
    }, null, "[data-den]");
  }
  async function enterScale() {
    const b = sh().bg;
    if (!b?.asset || !bgFree()) return;
    const sc = await askScale(b.w, b.h, b.mmPerPt ? denOf(b.mmPerPt) : undefined);
    if (!sc) return;
    if (sc.measure) { setTool("pl-measure"); return; }
    const k = kOfDen(sc.den);
    if (k !== b.mmPerPt || b.measure) change(() => { b.mmPerPt = k; delete b.measure; }); // alte Messstrecke passt nicht mehr
    fitView();
    toast(`Massstab ${fmtDen(sc.den)} gesetzt.`);
  }
  async function finishMeasure(a, e) {
    const b = sh().bg, pa = worldToPage(b, a[0], a[1]), pe = worldToPage(b, e[0], e[1]);
    const r = await formDialog("Messstrecke", "Wie lang ist die Strecke in Wirklichkeit? Angabe in mm, z. B. 4500 für 4,5 m.", [{ label: "Länge in mm", value: "" }], "Weiter");
    if (!r) return;
    const mm = P.parseLen(r[0]), k = scaleFromMeasure([pa.u, pa.v], [pe.u, pe.v], mm);
    if (!k) { toast("Bitte eine Länge grösser als 0 eingeben.", "error"); return; }
    const std = nearestStd(k), d = denOf(k), prev = b.mmPerPt ? ` Bisher ${fmtDen(denOf(b.mmPerPt))}, Abweichung ${fmtPct(k / b.mmPerPt - 1)}.` : "";
    const ch = await chooseDialog("Massstab bestätigen", `Aus der Messstrecke ergibt sich ${fmtDen(d)}. Vorschlag: ${fmtDen(std)}.${prev}`,
      [{ label: `${fmtDen(std)} übernehmen (Normmassstab)`, k: kOfDen(std) }, { label: `${fmtDen(d)} übernehmen (wie gemessen)`, k }]);
    if (!ch?.option) return;
    change(() => { b.mmPerPt = ch.option.k; b.measure = { a: [pa.u, pa.v], b: [pe.u, pe.v], mm }; });
    setTool("select"); fitView();
    toast(`Massstab ${fmtDen(denOf(ch.option.k))} gesetzt.`);
  }
  // Plan drehen: Kante a→b soll waagrecht oder senkrecht liegen. Nur der PDF-Plan dreht (um den Nullpunkt), gezeichnete Objekte bleiben.
  async function finishRotate(a, e) {
    const d = alignAngle(a, e);
    const r = await formDialog("Plan drehen", "Drehung des PDF-Plans um den Nullpunkt in Grad, positiv = gegen den Uhrzeigersinn. Der Vorschlag legt die angeklickte Kante waagrecht oder senkrecht. Wände, Symbole und Leitungen bleiben.", [{ label: "Drehung in Grad", value: String(Math.round(d * 100) / 100).replace(".", ",") }], "Drehen");
    if (!r) return;
    const deg = parseFloat(r[0].replace(/\s/g, "").replace(",", ".").replace("−", "-"));
    if (!Number.isFinite(deg)) { toast("Bitte einen Winkel eingeben, z. B. 12,5.", "error"); return; }
    if (!deg) return;
    let rot;
    change(() => { rot = rotatePlan(sh(), deg); });
    c.renderSheet(); setTool("select");
    toast(`Plan gedreht, jetzt ${fmtDeg(rot)}.`);
  }
  // Fixpunkt = gemeinsamer Nullpunkt aller Pläne: in jedem Stockwerk am selben Punkt des Gebäudes setzen, dann liegen die Pläne übereinander.
  async function placeFix(p) {
    const S0 = sh(), b = S0.bg;
    let mode = fixMode(b, S0.items.length > 0);
    if (mode === "ask") {
      const ch = await chooseDialog("Fixpunkt verschieben", "Auf dem Plan liegen schon Objekte. Was soll mit ihnen geschehen?",
        [{ label: "Objekte bleiben auf dem Plan (werden mitverschoben)", m: "plan" }, { label: "Objekte bleiben am Nullpunkt (neuer Planstand)", m: "fix" }]);
      if (!ch?.option) return;
      mode = ch.option.m;
    }
    const [x, y] = p;
    change(() => {
      const q = worldToPage(b, x, y); b.fix = [q.u, q.v]; delete b.swap;
      if (mode === "plan") { P.moveItems(S0, S0.items.filter((i) => i.type !== "opening"), -x, -y); if (S0.pmid) S0.pmid = [Math.round(S0.pmid[0] - x), Math.round(S0.pmid[1] - y)]; }
    });
    S.view.x += x * S.view.z; S.view.y -= y * S.view.z; // Ansicht mitführen, der Plan bleibt auf dem Bildschirm stehen
    c.applyView(); c.renderSheet(); setTool("select");
    toast("Fixpunkt gesetzt.");
  }
  // Fang für Messen, Fixpunkt, Drehen: Ecken und Flächen der Wände, sonst frei (kein Raster, der PDF-Plan hat sein eigenes)
  const snapBg = (w, ortho) => P.snapPlan(sh(), visible(), [w.x, w.y], { tol: tol(), alt: S.alt, ortho: S.shift ? ortho : undefined, faces: faces() });
  // Vor dem Druck: Bilder der PDF-Pläne fertig rendern (files.js printSheets)
  S.planPrep = async (sheets) => {
    for (const S0 of sheets) {
      if (S0.kind !== "plan" || !bgShown(S0)) continue;
      const url = await imageReady(S.doc.assets, S0.bg.asset, S0.bg.page);
      if (url) { const img = new Image(); img.src = url; await img.decode().catch(() => {}); }
    }
  };

  function bounds() {
    const b = unionBox(P.contentBox(sh()), sh().bg ? bgBox(sh().bg) : null);
    if (b) { const pad = Math.max(500, Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.08); return { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }; }
    const { p, k, ox, oy } = pageAt(), [w, h] = paperSize(p);
    return { x0: ox, y0: oy, x1: ox + w * k, y1: oy + h * k };
  }
  const txt = (x, y, s, size, ang = 0, fill = INK, anchor = "middle") => {
    let a = ((ang % 360) + 360) % 360; if (a > 90 && a <= 270) a -= 180; // lesbar von unten oder rechts
    return `<text transform="translate(${f(x)},${f(y)}) rotate(${f(a)}) scale(1,-1)" font-size="${f(size)}" text-anchor="${anchor}" dominant-baseline="central" fill="${fill}" stroke="none">${R.esc(s)}</text>`;
  };
  function patterns(k) {
    const s = 1.5 * k, w = 0.13 * k, d = `M${-s / 2},${s / 2}L${s / 2},${1.5 * s}M0,0L${s},${s}M${s / 2},${-s / 2}L${1.5 * s},${s / 2}`;
    const e = `M${s / 2},${-s / 2}L${-s / 2},${s / 2}M${s},0L0,${s}M${1.5 * s},${s / 2}L${s / 2},${1.5 * s}`;
    const pat = (id, path) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(s)}" height="${f(s)}"><rect width="${f(s)}" height="${f(s)}" fill="#fff"/><path d="${path}" stroke="${INK}" stroke-width="${f(w)}" fill="none"/></pattern>`;
    return `<defs>${pat("pl-mauer", d)}${pat("pl-beton", d + e)}</defs>`;
  }
  // Öffnung: Linien und Bögen in Welt-mm. Tür: Flügel und Bogen auf der Seite side, Band bei hinge; Fenster: Doppellinie; Schiebetür: Flügel an der Fläche
  function openingSVG(w, o, k, stroke = INK) {
    const u = P.wallDir(w), n = P.normal(u), h = w.d / 2, at = (s, q) => [w.a[0] + u[0] * s + n[0] * q, w.a[1] + u[1] * s + n[1] * q], tw = f(0.18 * k);
    const ln = (a, b, extra = "") => `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${stroke}" stroke-width="${tw}" ${extra}/>`;
    const s0 = o.t, s1 = o.t + o.w;
    if (o.kind === "fenster") {
      let s = ln(at(s0, h), at(s1, h)) + ln(at(s0, -h), at(s1, -h)) + ln(at(s0, h / 4), at(s1, h / 4)) + ln(at(s0, -h / 4), at(s1, -h / 4));
      if (o.br !== undefined) { const q = at((s0 + s1) / 2, -h - 2.5 * k); s += txt(q[0], q[1], `BR ${Math.round(o.br)}`, 2 * k, Math.atan2(u[1], u[0]) * 180 / Math.PI, stroke); }
      return s;
    }
    if (o.kind === "durchgang") return ln(at(s0, 0), at(s1, 0), `stroke-dasharray="${f(k)} ${f(k)}"`);
    const side = o.side ?? 1, q = side * h;
    if (o.kind === "schiebe") { const t = Math.min(40, h); return `<path d="M${pt(at(s0 - o.w * 0.1, q))}L${pt(at(s1, q))}L${pt(at(s1, q + side * t))}L${pt(at(s0 - o.w * 0.1, q + side * t))}Z" fill="#fff" stroke="${stroke}" stroke-width="${tw}"/>`; }
    const sh0 = o.hinge === "r" ? s1 : s0, so = o.hinge === "r" ? s0 : s1, H = at(sh0, q), E = at(sh0, q + side * o.w), J = at(so, q);
    const cr = (E[0] - H[0]) * (J[1] - H[1]) - (E[1] - H[1]) * (J[0] - H[0]);
    return ln(H, E, `stroke-width="${f(0.25 * k)}"`) + `<path d="M${pt(E)}A${f(o.w)} ${f(o.w)} 0 0 ${cr > 0 ? 1 : 0} ${pt(J)}" fill="none" stroke="${stroke}" stroke-width="${tw}"/>`;
  }
  function dimSVG(d, k, stroke = INK) {
    const [A, B, n] = P.dimLine(d), L = P.dimLen(d), u = L ? [(d.b[0] - d.a[0]) / L, (d.b[1] - d.a[1]) / L] : [1, 0], tw = f(0.18 * k), ov = 1.5 * k * Math.sign(d.off || 1);
    const ln = (a, b, extra = "") => `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${stroke}" stroke-width="${tw}" ${extra}/>`;
    const tick = (p) => { const t = 1.2 * k, v = [(u[0] + n[0]) * t / Math.SQRT2, (u[1] + n[1]) * t / Math.SQRT2]; return ln([p[0] - v[0], p[1] - v[1]], [p[0] + v[0], p[1] + v[1]], `stroke-width="${f(0.35 * k)}"`); }; // Schrägstrich
    let s = (Math.abs(d.off) > 1e-6 ? ln(d.a, [A[0] + n[0] * ov, A[1] + n[1] * ov]) + ln(d.b, [B[0] + n[0] * ov, B[1] + n[1] * ov]) : "") + ln(A, B, d.ctrl ? `stroke-dasharray="${f(1.5 * k)} ${f(k)}"` : "") + tick(A) + tick(B);
    const ci = P.ctrlInfo(d), label = d.ctrl ? `${P.fmtLen(L)}${ci.soll ? ` (Soll ${P.fmtLen(ci.soll)}, ${ci.diff > 0 ? "+" : ""}${P.fmtLen(ci.diff)})` : ""}` : P.fmtLen(L);
    const m = [(A[0] + B[0]) / 2 + n[0] * 1.6 * k, (A[1] + B[1]) / 2 + n[1] * 1.6 * k];
    return s + txt(m[0], m[1], label, 2.5 * k, Math.atan2(u[1], u[0]) * 180 / Math.PI, d.ctrl && ci.diff && Math.abs(ci.diff) >= 1 ? "#c0392b" : stroke);
  }
  // Leitung: Strichmuster nach Art (Papier-mm × k), flexibel mit einer Welle in der Mitte jedes Abschnitts. Geschwungen: glatte Kurve durch die Punkte.
  function lineSVG(it, k, stroke = P.colOf(it), pts = it.pts, curve = it.curve) {
    const dash = P.LINE_DASH[it.kind], w = 0.35 * k, segs = curve && pts.length > 2 ? P.curveSegs(pts) : null;
    const d = segs ? `M${pt(pts[0])}${segs.map(([, b, c2, e]) => `C${pt(b)} ${pt(c2)} ${pt(e)}`).join("")}` : `M${pts.map(pt).join("L")}`;
    let s = `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${f(w)}" stroke-linejoin="round" ${dash ? `stroke-linecap="butt" stroke-dasharray="${dash.map((x) => f(x * k)).join(" ")}"` : 'stroke-linecap="round"'}/>`;
    if (it.kind === "flex") for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 4 * k) continue;
      const bz = segs && P.bezAt(segs[i - 1], 0.5), v = bz ? bz.v : [b[0] - a[0], b[1] - a[1]], lv = Math.hypot(v[0], v[1]) || 1; // geschwungen: Welle in der Mitte des Bogens, entlang der Kurve
      const u = [v[0] / lv, v[1] / lv], n = [-u[1], u[0]], m = bz ? bz.p : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], at = (t, q) => [m[0] + u[0] * t * k + n[0] * q * k, m[1] + u[1] * t * k + n[1] * q * k];
      s += `<path d="M${pt(at(-1.2, 0))}L${pt(at(1.2, 0))}" stroke="#fff" stroke-width="${f(w * 1.6)}"/><path d="M${pt(at(-1.2, 0))}Q${pt(at(-0.6, 1.1))} ${pt(at(0, 0))}Q${pt(at(0.6, -1.1))} ${pt(at(1.2, 0))}" fill="none" stroke="${stroke}" stroke-width="${f(w)}" stroke-linecap="round"/>`;
    }
    return s;
  }
  // Symbol (plansym.js): Teile in Papier-mm, in der Welt × Massstab k, gedreht um r. Texte drehen mit und bleiben lesbar (P.symTexts).
  function symSVG(it, k, stroke = INK) {
    const def = SYM_BY_KEY.get(it.key);
    let g = "";
    for (const q of it.ap && def.ap ? [...def.parts, def.ap] : def.parts) {
      if (q[0] === "l") g += `<line x1="${q[1]}" y1="${q[2]}" x2="${q[3]}" y2="${q[4]}"/>`;
      else if (q[0] === "c") g += `<circle cx="${q[1]}" cy="${q[2]}" r="${q[3]}"${q[4] ? ` fill="${stroke}"` : ""}/>`;
      else if (q[0] === "p") g += `<path d="${q[1]}"${q[2] ? ` fill="${stroke}"` : ""}/>`;
    }
    const t = P.symTexts(it, k, fmtH).map((x) => txt(x.at[0], x.at[1], x.s, x.size, x.a, stroke, x.anchor)).join("");
    return `<g transform="translate(${f(it.at[0])} ${f(it.at[1])}) rotate(${it.r}) scale(${k})" fill="none" stroke="${stroke}" stroke-width="0.18" stroke-linecap="round">${g}</g>${t}`;
  }
  const fmtH = (h) => `${String(Math.round(h * 10) / 10).replace(".", ",")}`; // Höhe in cm, ohne Einheit (wie im Plan üblich)
  // Symbol beim Setzen oder Ziehen: Wandsymbole rasten an der nächsten Wandfläche ein (bis 600 mm, Alt frei), sonst Fang und Drehung symR
  function symPlace(key, p, r0) {
    const def = SYM_BY_KEY.get(key);
    if (def.wall && !S.alt) { const ws = P.wallSnap(visible().filter((i) => i.type === "wall"), [p.x, p.y], 600); if (ws) return { at: ws.at, r: ws.r, wall: true }; }
    const q = snapAt(p);
    return { at: [q.x, q.y], r: r0 };
  }
  function itemsSVG(S0 = sh()) {
    const k = P.paperOf(S0).den, walls = S0.items.filter((i) => i.type === "wall"), ops = S0.items.filter((i) => i.type === "opening");
    const shapes = new Map(P.wallShapes(walls, ops).map((x) => [x.id, x])), byId = new Map(walls.map((w) => [w.id, w]));
    let s = patterns(k);
    for (const l of S0.layers) {
      if (!l.show) continue;
      const ws = walls.filter((w) => w.layer === l.id);
      for (const w of ws) for (const poly of shapes.get(w.id).fills) s += `<path d="M${poly.map(pt).join("L")}Z" fill="${w.mat === "leicht" ? "#fff" : `url(#pl-${w.mat})`}" stroke="none"/>`;
      const segs = ws.flatMap((w) => shapes.get(w.id).lines);
      if (segs.length) s += `<path d="${segs.map(([a, b]) => `M${pt(a)}L${pt(b)}`).join("")}" fill="none" stroke="${INK}" stroke-width="${f(0.5 * k)}" stroke-linecap="round"/>`;
      for (const o of ops) if (byId.get(o.wall)?.layer === l.id) s += openingSVG(byId.get(o.wall), o, k);
      for (const d of S0.items) if (d.type === "dim" && d.layer === l.id) s += dimSVG(d, k);
      for (const y of S0.items) if (y.type === "line" && y.layer === l.id) s += lineSVG(y, k);
      for (const y of S0.items) if (y.type === "sym" && y.layer === l.id) s += symSVG(y, k, P.colOf(y));
    }
    return `<g class="pl-items">${s}</g>`;
  }
  // Seite der Wand: von Hand (1 links, −1 rechts) oder automatisch: die erste Kurve zeigt, wo der Raum liegt (Linkskurve = Raum links, Wand rechts).
  // Bis zur ersten Kurve gilt links; nach der Kurve wird die erste Wand auf die richtige Seite gesetzt.
  const turn = (b) => (draft?.u ? draft.u[0] * (b[1] - draft.a[1]) - draft.u[1] * (b[0] - draft.a[0]) : 0);
  const wallSide = (b) => (draft?.auto && Math.abs(turn(b)) > 1e-6 ? (turn(b) > 0 ? -1 : 1) : draft?.side ?? (opt.side || 1));
  // Wand im Entstehen: Ende aus Eingabe (Länge, Winkel) oder Maus
  function draftEnd() {
    if (!draft || !mouse) return null;
    const L = P.parseLen(draft.len), deg = draft.ang.trim() ? Number(draft.ang.replace(",", ".").replace("−", "-")) : NaN;
    if (!Number.isFinite(L) && !Number.isFinite(deg)) return [mouse.x, mouse.y];
    const m = raw && S.shift ? P.orthoPt(draft.a, [raw.x, raw.y]) : [mouse.x, mouse.y];
    const dir = Number.isFinite(deg) ? deg : Math.atan2(m[1] - draft.a[1], m[0] - draft.a[0]) * 180 / Math.PI;
    const len = Number.isFinite(L) ? L : Math.hypot(m[0] - draft.a[0], m[1] - draft.a[1]);
    return P.polar(draft.a, dir, len);
  }
  function overlaySVG() {
    const z = S.view.z, px = (n) => f(n / z), k = den();
    let s = "";
    const grip = (p) => `<rect x="${f(p[0] - 4 / z)}" y="${f(p[1] - 4 / z)}" width="${px(8)}" height="${px(8)}" fill="#fff" stroke="${SEL}" stroke-width="1.5"/>`;
    const label = (p, t) => `<text transform="translate(${f(p[0] + 12 / z)},${f(p[1] + 12 / z)}) scale(1,-1)" font-size="${px(13)}" fill="${DRAFT}" stroke="#fff" stroke-width="${px(3)}" paint-order="stroke" class="pl-scale">${R.esc(t)}</text>`;
    for (const it of sel()) {
      if (it.type === "wall") { const x = P.wallShapes([it])[0]; s += `<path d="M${x.poly.map(pt).join("L")}Z" fill="none" stroke="${SEL}" stroke-width="2"/>` + grip(it.a) + grip(it.b); }
      else if (it.type === "opening") { const w = sh().items.find((i) => i.id === it.wall); if (w) s += `<g class="pl-scale">${openingSVG(w, it, k, SEL)}</g>` + edgeGrips(w, it).map((g) => grip(g.p)).join(""); }
      else if (it.type === "dim") { s += `<g class="pl-scale">${dimSVG(it, k, SEL)}</g>`; if (it.ref === undefined) s += grip(it.a) + grip(it.b); }
      else if (it.type === "sym") s += `<g class="pl-scale">${symSVG(it, k, SEL)}</g>`;
      else if (it.type === "line") s += `<g class="pl-scale">${lineSVG(it, k, SEL)}</g>` + (S.sel.size === 1 ? (it.curve ? `<path d="M${it.pts.map(pt).join("L")}" fill="none" stroke="${SEL}" stroke-width="1" stroke-dasharray="${px(4)} ${px(3)}" opacity=".6"/>` : "") + it.pts.map(grip).join("") : "");
    }
    if (lineDraft && mouse) s += `<g class="pl-scale" opacity=".85">${lineSVG({ kind: opt.lkind }, k, DRAFT, draftPts([...lineDraft.pts, [mouse.x, mouse.y]]), opt.lcurve)}</g>` + lineDraft.pts.map((q) => `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="${px(3)}" fill="${DRAFT}"/>`).join("");
    if (drag?.type === "box" && drag.started) { const b = boxOf(drag); s += `<rect x="${f(b.x0)}" y="${f(b.y0)}" width="${f(b.x1 - b.x0)}" height="${f(b.y1 - b.y0)}" fill="rgba(47,158,88,.08)" stroke="${SEL}" stroke-width="1" stroke-dasharray="5 3"/>`; }
    if (draft && mouse) {
      const b = draftEnd();
      if (Math.hypot(b[0] - draft.a[0], b[1] - draft.a[1]) > 1) {
        const side = wallSide(b), nw = { id: -1, ...P.innerWall(draft.a, b, opt.d, side), d: opt.d }, ws = [], items = sh().items;
        const prev = items.find((i) => i.id === draft.prev), first = items.find((i) => i.id === draft.first);
        if (prev) { const pc = { ...prev }; if (side !== draft.side && draft.pts.length === 2) Object.assign(pc, P.innerWall(draft.pts[0], draft.pts[1], pc.d, side)); P.mitre(pc, nw); ws.push(pc); } // Ecke zur vorigen Wand schon in der Vorschau
        if (first && first !== prev && Math.hypot(b[0] - draft.start[0], b[1] - draft.start[1]) < 1e-6) { const fc = { ...first }; P.mitre(nw, fc); ws.push(fc); }
        const x = P.wallShapes([...ws, nw]).at(-1);
        s += `<path d="M${x.poly.map(pt).join("L")}Z" fill="rgba(47,109,179,.12)" stroke="${DRAFT}" stroke-width="1.5"/>`
          + `<path d="M${pt(draft.a)}L${pt(b)}" stroke="${DRAFT}" stroke-width="1" stroke-dasharray="${px(5)} ${px(3)}" fill="none"/>`; // Innenlinie
        const L = Math.hypot(b[0] - draft.a[0], b[1] - draft.a[1]), deg = Math.atan2(b[1] - draft.a[1], b[0] - draft.a[0]) * 180 / Math.PI;
        s += label(b, `${draft.field === "len" && draft.len ? `[${draft.len}]` : P.fmtLen(L)} mm  ${draft.field === "ang" ? `[${draft.ang}]` : num(((deg % 360) + 360) % 360)}°`);
      }
    }
    if (dimDraft && mouse) {
      const b = dimDraft.b ?? [mouse.x, mouse.y], d = { a: dimDraft.a, b, off: dimDraft.b ? offAt(dimDraft.a, dimDraft.b, [raw.x, raw.y]) : 0, ctrl: opt.ctrl };
      if (Math.hypot(b[0] - d.a[0], b[1] - d.a[1]) > 1) s += `<g class="pl-scale">${dimSVG(d, k, DRAFT)}</g>`;
    }
    if (bgDraft && mouse) s += measureSVG({ x: bgDraft[0], y: bgDraft[1] }, mouse, S.tool === "pl-rotate" ? "Kante" : "", z);
    if (S.tool === "pl-pmid" && mouse) { const { a, k: d, ox, oy } = pageAt([mouse.x, mouse.y]); s += `<rect x="${f(ox + a.x0 * d)}" y="${f(oy + a.y0 * d)}" width="${f((a.x1 - a.x0) * d)}" height="${f((a.y1 - a.y0) * d)}" fill="rgba(47,109,179,.06)" stroke="${DRAFT}" stroke-width="1.5" stroke-dasharray="6 4"/>`; } // Vorschau des Planfelds
    if (S.tool === "pl-sym" && raw) { const q = symPlace(opt.sym, raw, opt.symR); s += `<g class="pl-scale" opacity=".8">${symSVG({ key: opt.sym, at: q.at, r: q.r, h: SYM_BY_KEY.get(opt.sym).h }, k, DRAFT)}</g>`; }
    if (S.tool === "pl-open" && raw) { const pv = openPreview(); if (pv) s += `<g class="pl-scale">${openingSVG(pv.w, pv.o, k, DRAFT)}</g>`; }
    if (mouse?.guides) s += mouse.guides.map(([q, r]) => `<path d="M${pt(q)}L${pt(r)}" stroke="${GUIDE}" stroke-width="1" stroke-dasharray="${px(6)} ${px(4)}" fill="none"/><circle cx="${f(q[0])}" cy="${f(q[1])}" r="${px(3)}" fill="${GUIDE}"/>`).join("");
    if (mouse && S.tool !== "select" && S.tool !== "hand" && S.tool !== "pl-sym") s += `<circle cx="${f(mouse.x)}" cy="${f(mouse.y)}" r="${px(mouse.snap && mouse.snap !== "grid" ? 5 : 3)}" fill="${mouse.snap === "end" ? "#f4c400" : mouse.snap === "align" ? GUIDE : "#fff"}" stroke="${DRAFT}" stroke-width="1.5"/>`;
    return s;
  }
  // Griffe an beiden Kanten einer Öffnung (auf der Mittellinie der Wand): Ziehen ändert die Breite, die andere Kante bleibt
  const edgeGrips = (w, o) => { const u = P.wallDir(w), at = (s) => [w.a[0] + u[0] * s, w.a[1] + u[1] * s]; return [{ edge: "t0", p: at(o.t) }, { edge: "t1", p: at(o.t + o.w) }]; };
  const offAt = (a, b, p) => { const v = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(v[0], v[1]) || 1; return Math.round(((p[0] - a[0]) * -v[1] + (p[1] - a[1]) * v[0]) / l); };
  function openPreview() {
    const w = P.hitPlan(sh(), pickable().filter((i) => i.type === "wall"), [raw.x, raw.y], tol());
    if (!w) return null;
    const ww = Math.min(opt.ow[opt.okind], P.wallLen(w)), o = { kind: opt.okind, w: ww, t: Math.max(0, Math.min(P.wallLen(w) - ww, Math.round(P.along(w, [raw.x, raw.y]) - ww / 2))), hinge: "l", side: 1, h: OPEN_HV[opt.okind] };
    return { w, o };
  }

  // ---------- Druck und PDF (Schritt 4, CJ 24.10.2026) ----------
  // Plan: Papier und Massstab aus dem Fenster Druck, um die Druckmitte, nur sichtbare Ebenen, ohne Raster und Nullpunkt, ausserhalb des
  // Planfelds abgeschnitten. Linienbreiten bleiben die des Plans: --plw je Element (elplexa.css, sonst setzt das Druck-CSS alle auf 0,35 mm).
  const keepW = (s) => s.replace(/ stroke-width="([^"]+)"/g, (m, v) => `${m} style="--plw:${v}"`);
  function printPages(S0, i = 0) {
    const p = P.paperOf(S0), a = printArea(p), [mx, my] = centerOf(S0), cx = (a.x0 + a.x1) / 2, cy = (a.y0 + a.y1) / 2, id = `plclip${i}`;
    const inner = `<clipPath id="${id}"><rect x="${f(a.x0)}" y="${f(a.y0)}" width="${f(a.x1 - a.x0)}" height="${f(a.y1 - a.y0)}"/></clipPath>`
      + `<g clip-path="url(#${id})"><g class="pl-print" transform="translate(${f(cx)} ${f(cy)}) scale(${1 / p.den}) translate(${f(-mx)} ${f(-my)})">${bgImg(S0, () => {})}${keepW(itemsSVG(S0))}</g></g>`;
    return [pageSVG(p, S0.meta, info(p), inner), ...(S0.bom === false ? [] : bomPages(S0, c.sheetLabel(S0, i)))];
  }
  // Stückliste: A4 hoch, Symbol (Farbe der Vorgabe), Bezeichnung, Anzahl, nach Gruppen; ohne Symbole keine Seite
  function bomPages(S0, name) {
    const rows = P.bomOf(S0);
    if (!rows.length) return [];
    const p = { size: "A4", quer: false }, a = printArea(p), RH = 6.5, x0 = a.x0 + 6, x1 = a.x1 - 6, lines = [];
    let g0 = null;
    for (const r of rows) { if (r.group !== g0) { lines.push({ head: r.group }); g0 = r.group; } lines.push(r); }
    const per = Math.floor((a.y1 - a.y0 - 30) / RH), pages = [], total = rows.reduce((s, r) => s + r.n, 0);
    for (let j = 0; j < lines.length; j += per) {
      let y = a.y1 - 10, s = txt(x0, y, `Stückliste · ${name}`, 5, 0, INK, "start") + txt(x1, y, `${total} Symbole`, 3, 0, INK, "end");
      y -= 9; s += txt(x0, y, "Symbol", 2.8, 0, INK, "start") + txt(x0 + 16, y, "Bezeichnung", 2.8, 0, INK, "start") + txt(x1, y, "Anzahl", 2.8, 0, INK, "end");
      s += `<line x1="${f(x0)}" y1="${f(y - 2.5)}" x2="${f(x1)}" y2="${f(y - 2.5)}" stroke="${INK}" stroke-width="0.35"/>`;
      for (const r of lines.slice(j, j + per)) {
        y -= RH;
        if (r.head) { s += txt(x0, y, r.head, 3.2, 0, INK, "start"); continue; }
        const def = SYM_BY_KEY.get(r.key), k = Math.min(1, 2.6 / def.r);
        s += symSVG({ key: r.key, at: [x0 + 6 - def.c[0] * k, y - def.c[1] * k], r: 0 }, k, P.defCol({ type: "sym", key: r.key })) + txt(x0 + 16, y, r.label, 3, 0, INK, "start") + txt(x1, y, String(r.n), 3, 0, INK, "end");
        s += `<line x1="${f(x0)}" y1="${f(y - RH / 2)}" x2="${f(x1)}" y2="${f(y - RH / 2)}" stroke="#c8ced6" stroke-width="0.15"/>`;
      }
      pages.push(pageSVG(p, S0.meta, `Stückliste · ${name}${lines.length > per ? ` · Seite ${j / per + 1}` : ""}`, `<g class="pl-print">${keepW(s)}</g>`));
    }
    return pages;
  }
  function bomCsv() {
    const rows = P.bomOf(sh());
    if (!rows.length) { toast("Keine Symbole auf sichtbaren Ebenen."); return; }
    c.download(`${c.sheetLabel(sh(), S.active).replace(/[\\/:*?"<>|]+/g, "-")}_Stückliste.csv`, P.bomCsv(rows), "text/csv");
    toast("Stückliste als CSV in den Download-Ordner geladen.");
  }
  S.planPages = printPages; // files.js buildPrint (nur elplexaCAD)

  // ---------- Zeiger ----------
  function down(w, e) {
    raw = w; S.shift = e.shiftKey; S.alt = e.altKey || opt.free;
    const T = S.tool;
    if (T === "pl-wall") {
      const p = snapWall(w, draft?.a);
      mouse = p;
      if (!draft) { if (layerOk()) draft = { a: [p.x, p.y], start: [p.x, p.y], pts: [[p.x, p.y]], side: opt.side || 1, auto: opt.side === 0, len: "", ang: "", field: "len" }; }
      else commit(draftEnd(), Math.hypot(p.x - draft.start[0], p.y - draft.start[1]) < 1e-6 && !draft.len);
      renderOverlay(); updateHint(); return;
    }
    if (T === "pl-open") {
      const pv = openPreview();
      if (!pv) { toast("Öffnung: auf eine Wand klicken (Wand auf einer wählbaren Ebene)."); return; }
      if (pv.o.w < opt.ow[opt.okind]) toast("Die Wand ist kürzer als die Öffnung, Breite gekürzt.");
      const id = nextId();
      change(() => sh().items.push(P.cleanPlanObj({ type: "opening", wall: pv.w.id, ...pv.o }, id)));
      return;
    }
    if (T === "pl-sym") {
      if (!layerOk()) return;
      const q = symPlace(opt.sym, w, opt.symR), def = SYM_BY_KEY.get(opt.sym), id = nextId();
      change(() => sh().items.push(P.cleanPlanObj({ type: "sym", layer: sh().alay, key: opt.sym, at: q.at, r: q.r, h: def.h }, id)));
      return;
    }
    if (T === "pl-line") {
      const p = snapLine(w, lineDraft?.pts.at(-1)), q = [p.x, p.y]; mouse = p;
      if (!lineDraft) { if (layerOk()) lineDraft = { pts: [q] }; }
      else if (same(q, lineDraft.pts.at(-1))) finishLine(); // Doppelklick oder Klick auf den letzten Punkt beendet
      else lineDraft.pts.push(q);
      renderOverlay(); updateHint(); return;
    }
    if (T === "pl-dim") {
      const p = snapDim(w, dimDraft?.a); mouse = p;
      if (!dimDraft) { if (layerOk()) dimDraft = { a: [p.x, p.y] }; }
      else if (!dimDraft.b) { if (Math.hypot(p.x - dimDraft.a[0], p.y - dimDraft.a[1]) > 1) dimDraft.b = [p.x, p.y]; }
      else addDim(offAt(dimDraft.a, dimDraft.b, [w.x, w.y]));
      renderOverlay(); updateHint(); return;
    }
    if (T === "pl-measure" || T === "pl-rotate") {
      const p = snapBg(w, bgDraft), q = [p.x, p.y]; mouse = p;
      if (!bgDraft) { bgDraft = q; renderOverlay(); updateHint(); return; }
      const a = bgDraft; bgDraft = null; renderOverlay(); updateHint();
      if (Math.hypot(q[0] - a[0], q[1] - a[1]) < 1) return;
      if (T === "pl-measure") finishMeasure(a, q); else finishRotate(a, q);
      return;
    }
    if (T === "pl-fix") { const p = snapBg(w); placeFix([p.x, p.y]); return; }
    if (T === "pl-pmid") { change(() => { sh().pmid = [Math.round(w.x), Math.round(w.y)]; }); setTool("select"); c.renderSheet(); toast("Druckmitte gesetzt. Oben unter „Druck“ zurück auf automatisch."); return; }
    if (T !== "select") return;
    const one = S.sel.size === 1 ? sel()[0] : null, t = tol(), near = (p) => Math.hypot(p[0] - w.x, p[1] - w.y) <= t;
    if (one?.type === "line") { const i = one.pts.findIndex(near); if (i >= 0) { drag = { type: "lpt", it: one, i, snap: snapshot(), started: false, sx: w.x, sy: w.y }; return; } }
    if (one && (one.type === "wall" || (one.type === "dim" && one.ref === undefined))) {
      const e2 = ["a", "b"].find((k) => near(one[k]));
      if (e2) { // Eckpunkt ziehen: alle Enden an diesem Punkt (Wand: Nachbarwände, freie Masse), freies Mass nur sein Ende
        drag = { type: "node", ends: one.type === "wall" ? P.nodeEnds(sh(), one[e2]) : [{ it: one, e: e2 }], from: [...one[e2]], snap: snapshot(), started: false, sx: w.x, sy: w.y };
        return;
      }
    }
    if (one?.type === "opening") {
      const wl = sh().items.find((i) => i.id === one.wall), g = wl && edgeGrips(wl, one).find((x) => near(x.p));
      if (g) { drag = { type: "edge", it: one, wall: wl, edge: g.edge, snap: snapshot(), started: false, sx: w.x, sy: w.y }; return; }
    }
    const hit = P.hitPlan(sh(), pickable(), [w.x, w.y], t), more = e.shiftKey || opt.multi;
    if (!hit) { if (!more) S.sel = new Set(); drag = { type: "box", sx: w.x, sy: w.y, ex: w.x, ey: w.y, add: more, started: false }; renderRight(); renderOverlay(); return; } // Rahmen ziehen
    if (more) { const s0 = new Set(S.sel); if (s0.has(hit.id)) s0.delete(hit.id); else s0.add(hit.id); S.sel = s0; renderRight(); renderOverlay(); return; } // Shift-Klick: dazu oder weg
    if ((S.sel.has(hit.id) && S.sel.size > 1) || hit.type === "line") { if (!S.sel.has(hit.id)) S.sel = new Set([hit.id]); drag = { type: "multi", items: sel(), sx: w.x, sy: w.y, dx: 0, dy: 0, started: false, snap: snapshot() }; renderRight(); renderOverlay(); return; }
    S.sel = new Set([hit.id]);
    drag = { type: "move", it: hit, sx: w.x, sy: w.y, started: false, snap: snapshot(), ...(hit.type === "wall" ? { ea: P.nodeEnds(sh(), hit.a), eb: P.nodeEnds(sh(), hit.b), a0: [...hit.a], b0: [...hit.b] } : hit.type === "opening" ? { t0: hit.t } : hit.type === "sym" ? { at0: [...hit.at], r0: hit.r } : { off0: hit.off }) };
    renderRight(); renderOverlay();
  }
  function move(w, e) {
    raw = w; S.shift = e.shiftKey; S.alt = e.altKey || opt.free;
    mouse = S.tool === "pl-measure" || S.tool === "pl-rotate" || S.tool === "pl-fix" ? snapBg(w, bgDraft ?? undefined) : S.tool === "pl-line" ? snapLine(w, lineDraft?.pts.at(-1)) : S.tool === "pl-wall" ? snapWall(w, draft?.a) : S.tool === "pl-dim" ? snapDim(w, dimDraft?.b ? undefined : dimDraft?.a) : snapAt(w);
    const d = drag;
    if (d) {
      if (!d.started && Math.hypot(w.x - d.sx, w.y - d.sy) * S.view.z > 3) d.started = true;
      if (d.started && d.type === "box") { d.ex = w.x; d.ey = w.y; renderOverlay(); return; }
      if (d.started) {
        if (d.type === "multi") { const g = S.grid.on && !S.alt ? S.grid.size : 1, tx = Math.round((w.x - d.sx) / g) * g, ty = Math.round((w.y - d.sy) / g) * g; P.moveItems(sh(), d.items, tx - d.dx, ty - d.dy); d.dx = tx; d.dy = ty; }
        else if (d.type === "lpt") { const o = d.it.pts[d.i > 0 ? d.i - 1 : 1], p = snapLine(w, o, d.it.id); mouse = p; d.it.pts[d.i] = [p.x, p.y]; }
        else if (d.type === "node") { const skip = new Set(d.ends.map((x) => x.it.id)), p = P.snapPlan(sh(), visible().filter((i) => !skip.has(i.id)), [w.x, w.y], { grid: S.grid.on ? S.grid.size : 0, tol: tol(), alt: S.alt, ortho: S.shift ? otherEnd(d) : undefined }); mouse = p; P.setEnds(sh(), d.ends, [p.x, p.y]); }
        else if (d.type === "edge") { P.setOpeningEdge(d.wall, d.it, d.edge, P.along(d.wall, [w.x, w.y]), S.alt ? 1 : 10); renderRight(); }
        else if (d.it.type === "wall") { const g = S.grid.on && !S.alt ? S.grid.size : 1, dx = Math.round((w.x - d.sx) / g) * g, dy = Math.round((w.y - d.sy) / g) * g; P.setEnds(sh(), d.ea, [d.a0[0] + dx, d.a0[1] + dy]); P.setEnds(sh(), d.eb, [d.b0[0] + dx, d.b0[1] + dy]); }
        else if (d.it.type === "opening") { const wl = sh().items.find((i) => i.id === d.it.wall), g = S.grid.on && !S.alt ? 10 : 1; d.it.t = d.t0 + Math.round((P.along(wl, [w.x, w.y]) - P.along(wl, [d.sx, d.sy])) / g) * g; P.clampOpening(wl, d.it); }
        else if (d.it.type === "dim") d.it.off = offAt(d.it.a, d.it.b, [w.x, w.y]);
        else if (d.it.type === "sym") { const q = symPlace(d.it.key, { x: d.at0[0] + w.x - d.sx, y: d.at0[1] + w.y - d.sy }, d.r0); d.it.at = q.at; d.it.r = q.r; }
        renderItems();
      }
    }
    renderOverlay();
  }
  const otherEnd = (d) => { const it = d.ends[0]?.it; return it ? it[d.ends[0].e === "a" ? "b" : "a"] : undefined; };
  const boxOf = (d) => ({ x0: Math.min(d.sx, d.ex), y0: Math.min(d.sy, d.ey), x1: Math.max(d.sx, d.ex), y1: Math.max(d.sy, d.ey) });
  function up() {
    const d = drag; drag = null;
    if (d?.type === "box") { if (d.started) { const ids = pickable().filter((i) => P.inBox(sh(), i, boxOf(d))).map((i) => i.id); S.sel = new Set([...(d.add ? S.sel : []), ...ids]); } renderRight(); renderOverlay(); return; }
    if (d?.type === "lpt" && d.started) { const q = d.it.pts.filter((p, i, a) => !i || !same(p, a[i - 1])); if (q.length >= 2) d.it.pts = q; }
    if (d?.started) { pushUndo(d.snap); markDirty(); renderItems(); renderOverlay(); renderRight(); }
  }
  function tap(w) {
    const hit = P.hitPlan(sh(), pickable(), [w.x, w.y], 14 / S.view.z);
    if (opt.multi && hit) { const s0 = new Set(S.sel); if (s0.has(hit.id)) s0.delete(hit.id); else s0.add(hit.id); S.sel = s0; } else S.sel = hit ? new Set([hit.id]) : new Set();
    renderRight(); renderOverlay();
  }

  // ---------- Wände und Masse anlegen ----------
  // Wand an die Innenlinie a → b: Mittellinie um die halbe Dicke zur Wandseite versetzt, Ecke mit der vorigen Wand (und beim Schliessen mit der ersten)
  function commit(b, close = false) {
    if (!draft || !b) return;
    const a = draft.a;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) { if (close) cancel(); return; }
    const id = nextId(), d0 = draft, side = wallSide(b), resolved = d0.auto && Math.abs(turn(b)) > 1e-6, shut = Math.hypot(b[0] - d0.start[0], b[1] - d0.start[1]) < 1e-6 && d0.first !== undefined;
    change(() => {
      const w = { id, type: "wall", layer: sh().alay, ...P.innerWall(a, b, opt.d, side), d: opt.d, mat: opt.mat }, items = sh().items;
      const prev = items.find((i) => i.id === d0.prev), first = items.find((i) => i.id === d0.first);
      if (resolved && side !== d0.side && first) Object.assign(first, P.innerWall(d0.pts[0], d0.pts[1], first.d, side)); // erste Wand auf die richtige Seite
      if (prev) P.mitre(prev, w);
      if (shut && first) P.mitre(w, first);
      items.push(w);
      P.syncDims(sh());
    });
    const u = [(b[0] - a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]), (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1])];
    draft = close || shut ? null : { a: [b[0], b[1]], start: d0.start, pts: [...d0.pts, [b[0], b[1]]], u, side, auto: d0.auto && !resolved, prev: id, first: d0.first ?? id, len: "", ang: "", field: "len" }; // auf den Anfang = Raum geschlossen
    renderOverlay(); updateHint();
  }
  function addDim(off) {
    const { a, b } = dimDraft, wall = opt.ctrl ? null : sh().items.find((i) => i.type === "wall" && ((same(i.a, a) && same(i.b, b)) || (same(i.a, b) && same(i.b, a))));
    const rev = wall && same(wall.a, b), id = nextId();
    change(() => { sh().items.push(P.cleanPlanObj({ type: "dim", layer: sh().alay, a: rev ? b : a, b: rev ? a : b, off: rev ? -off : off, ...(wall ? { ref: wall.id } : {}), ...(opt.ctrl ? { ctrl: true } : {}) }, id)); P.syncDims(sh()); });
    dimDraft = null;
    renderOverlay(); updateHint();
  }
  const same = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < P.EPS;
  const draftPts = (pts) => (opt.lcurve ? P.bowPts(pts) : pts); // geschwungen mit zwei Punkten: Bogen (Zwischenpunkt)
  // Leitung abschliessen (ab zwei Punkten), sonst verwerfen
  function finishLine() {
    const pts = lineDraft?.pts ?? []; lineDraft = null;
    if (pts.length >= 2) { const id = nextId(); change(() => sh().items.push(P.cleanPlanObj({ type: "line", layer: sh().alay, pts: draftPts(pts), kind: opt.lkind, curve: opt.lcurve }, id))); }
    renderOverlay(); updateHint();
  }
  // Kopieren, Einfügen (je Mal 5 mm auf dem Papier weiter versetzt), Duplizieren, alles wählen
  function copySel() { if (!S.sel.size) return; clip = P.copyItems(sh(), sel()); clipN = 0; toast(`${clip.filter((i) => i.type !== "opening").length} Objekt(e) kopiert. Einfügen mit ⌘V.`); renderRight(); }
  function pasteFrom(src, n) {
    const off = 5 * den() * n;
    change(() => { const out = P.pasteItems(sh(), src, off, -off, nextId); S.sel = new Set(out.filter((i) => i.type !== "opening").map((i) => i.id)); });
  }
  function paste() { if (!clip?.length) { toast("Nichts kopiert. Erst wählen und ⌘C (oder Knopf Kopieren)."); return; } if (S.tool !== "select") setTool("select"); pasteFrom(clip, ++clipN); }
  function dup() { if (S.sel.size) pasteFrom(P.copyItems(sh(), sel()), 1); }
  function selAll() { if (S.tool !== "select") setTool("select"); S.sel = new Set(pickable().map((i) => i.id)); renderRight(); renderOverlay(); }
  // Entwurf beenden. Gibt true, wenn etwas abgebrochen wurde.
  function cancel() {
    const had = !!(draft || dimDraft || lineDraft || bgDraft);
    draft = null; dimDraft = null; lineDraft = null; bgDraft = null;
    return had;
  }
  function del() {
    const ids = [...S.sel];
    if (!ids.length) return;
    change(() => { for (const id of ids) P.deleteItem(sh(), id); S.sel.clear(); });
  }

  // ---------- Tasten ----------
  const TOOL_KEYS = { v: "select", w: "pl-wall", o: "pl-open", b: "pl-dim", k: "pl-line", l: "pl-line" };
  const GRUND_TOOLS = ["pl-wall", "pl-open", "pl-dim", "pl-measure", "pl-fix", "pl-rotate"];
  // Grundriss-Werkzeuge (Wand, Tür/Fenster, Mass) gibt es nur auf der Ebene Hintergrund (ohne sie auf der einzigen Ebene)
  const grundOn = () => sh().alay === "bg" || !P.layerById(sh(), "bg");
  function key(e, mod) {
    const k = e.key;
    if (mod) {
      const m = k.toLowerCase();
      if (m === "a") { selAll(); return true; }
      if (m === "c") { copySel(); return true; }
      if (m === "v") { paste(); return true; }
      if (m === "d") { dup(); return true; }
      return false;
    }
    if (draft) {
      const fld = draft.field;
      if (/^[0-9.,]$/.test(k) || (fld === "len" && /^[mc ]$/i.test(k)) || (fld === "ang" && k === "-")) { draft[fld] += k; renderOverlay(); updateHint(); return true; }
      if (k === "Backspace") { draft[fld] = draft[fld].slice(0, -1); renderOverlay(); updateHint(); return true; }
      if (k === "Tab") { draft.field = fld === "len" ? "ang" : "len"; renderOverlay(); updateHint(); return true; }
      if (k === "Enter") { if (draft.len.trim() || draft.ang.trim()) { if (draft.len.trim() && !Number.isFinite(P.parseLen(draft.len))) { toast(`Länge „${draft.len}“ nicht verstanden. Beispiele: 3450, 345 cm, 3,45 m.`, "error"); return true; } commit(draftEnd()); } else { draft = null; renderOverlay(); updateHint(); } return true; }
      if (k === "Escape") { draft = null; renderOverlay(); updateHint(); return true; }
    }
    if (lineDraft) {
      if (k === "Enter" || k === "Escape") { finishLine(); return true; }
      if (k === "Backspace") { lineDraft.pts.pop(); if (!lineDraft.pts.length) lineDraft = null; renderOverlay(); updateHint(); return true; }
    }
    if (bgDraft && k === "Escape") { bgDraft = null; renderOverlay(); updateHint(); return true; }
    if (dimDraft && k === "Escape") { dimDraft = null; renderOverlay(); updateHint(); return true; }
    if (k.toLowerCase() === "x" && S.tool === "pl-wall" && !e.altKey) { opt.side = -(draft?.side ?? (opt.side || 1)); if (draft) { draft.side = opt.side; draft.auto = false; } renderRight(); renderOverlay(); updateHint(); return true; } // Wandseite wechseln
    if (TOOL_KEYS[k.toLowerCase()] && !e.altKey) { const t = TOOL_KEYS[k.toLowerCase()]; if (GRUND_TOOLS.includes(t) && !grundOn()) { toast("Grundriss-Werkzeuge gibt es nur auf der Ebene Hintergrund. Links die Ebene wechseln."); return true; } setTool(t); return true; }
    if (k.toLowerCase() === "r" && !e.altKey) { // Drehen um 90° (Shift: zurück): beim Setzen das nächste Symbol, sonst das gewählte
      const step = e.shiftKey ? 270 : 90, ys = sel().filter((i) => i.type === "sym");
      if (S.tool === "pl-sym") { opt.symR = (opt.symR + step) % 360; renderOverlay(); return true; }
      if (ys.length) { change(() => { for (const y of ys) y.r = (y.r + step) % 360; }); return true; }
      return true;
    }
    if ("tiqry".includes(k.toLowerCase()) && k.length === 1) return true; // Werkzeuge anderer Blätter: hier ohne Wirkung
    if (k.startsWith("Arrow") && S.sel.size) {
      const step = (S.grid.on ? S.grid.size : 10) * (e.shiftKey ? 5 : 1), dx = k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0, dy = k === "ArrowUp" ? step : k === "ArrowDown" ? -step : 0;
      change(() => P.moveItems(sh(), sel(), dx, dy), { panel: true });
      return true;
    }
    return false;
  }

  // ---------- Linke Leiste: Werkzeuge und Ebenen ----------
  const toolBtn = (id, icon, label, key) => `<button class="tool" data-tool="${id}" aria-pressed="${S.tool === id}" title="${label} (Taste ${key})">${icon}<span>${label}</span><span class="key">${key}</span></button>`;
  const bgTool = (id, icon, label) => `<button class="tool" data-tool="${id}" aria-pressed="${S.tool === id}">${icon}<span>${label}</span></button>`;
  function leftHTML() {
    const S0 = sh();
    let h = `<section class="section"><h2 class="section-title">Werkzeuge</h2>` + toolBtn("select", R.icons.select, "Auswählen", "V") + toolBtn("hand", R.icons.hand, "Ansicht schieben", "H")
      + `<button class="tool" data-plact="multi" aria-pressed="${opt.multi}" title="Mehrfachwahl: Klick fügt hinzu oder nimmt weg (wie Shift-Klick)">${ICON.multi}<span>Mehrfachwahl</span><span class="key">⇧</span></button>`
      + `<button class="tool" data-plact="free" aria-pressed="${opt.free}" title="Fang aus: frei setzen ohne Raster, Ecken und Ausrichtung (wie Alt gedrückt halten)">${ICON.free}<span>Fang aus</span><span class="key">⌥</span></button>`
      + `</section>` + (grundOn() ? `<section class="section"><h2 class="section-title">Plan (PDF)</h2><button class="tool" data-plact="pdf">${ICON.pdf}<span>${S0.bg?.asset ? "Neuer Planstand" : "PDF-Plan laden"}</span></button>`
        + (S0.bg?.asset ? `<button class="tool" data-plact="scale">${ICON.scale}<span>Massstab eingeben</span></button>` + bgTool("pl-measure", ICON.measure, "Massstab messen") + bgTool("pl-fix", ICON.fix, "Fixpunkt setzen") + bgTool("pl-rotate", ICON.rotate, "Plan drehen") : "")
        + (S0.bg ? `<p class="note">${S0.bg.asset ? `${R.esc(S0.bg.name)}, Seite ${S0.bg.page}, ${S0.bg.mmPerPt ? fmtDen(denOf(S0.bg.mmPerPt)) : "Massstab fehlt"}${S0.bg.fix ? "" : ", Fixpunkt fehlt"}` : `PDF „${R.esc(S0.bg.name)}“ fehlt, bitte neu laden.`}</p>` : "")
        + `</section><section class="section"><h2 class="section-title">Grundriss</h2>` + toolBtn("pl-wall", ICON.wall, "Wand", "W") + toolBtn("pl-open", ICON.open, "Tür, Fenster", "O") + toolBtn("pl-dim", R.icons.dim, "Mass", "B") + `</section>` : "")
      + `<section class="section"><h2 class="section-title">Elektro</h2>` + toolBtn("pl-line", ICON.line, "Leitung", "L")
      + `</section><section class="section pl-layers"><h2 class="section-title">Ebenen</h2>`;
    for (const l of [...S0.layers].reverse()) { // oben = zuletzt gezeichnet
      const btn = (k, on, icon, label) => `<button class="layer-btn" data-plact="${k}" data-layer="${l.id}" data-key="${k}" aria-pressed="${on}" title="${label}" aria-label="${R.esc(l.name)}: ${label}">${icon}</button>`;
      h += `<div class="layer-row${l.show ? "" : " off"}${l.id === S0.alay ? " active" : ""}"><button class="layer-name" data-plact="alay" data-layer="${l.id}" aria-pressed="${l.id === S0.alay}" title="Aktive Ebene: neue Objekte landen hier">${R.esc(l.name)}</button>`
        + btn("show", l.show, l.show ? ICON.eye : ICON.eyeOff, l.show ? "Ausblenden" : "Einblenden") + btn("lock", l.lock, l.lock ? ICON.lock : ICON.unlock, l.lock ? "Entsperren" : "Sperren (nicht wählbar, Fang bleibt)") + `</div>`;
    }
    const i = S0.layers.findIndex((l) => l.id === S0.alay), n = S0.layers.length;
    h += `<div class="row pl-layact"><button class="btn outline small" data-plact="up"${i >= n - 1 ? " disabled" : ""} title="Aktive Ebene nach oben (später gezeichnet)" aria-label="Aktive Ebene nach oben">↑</button><button class="btn outline small" data-plact="down"${i <= 0 ? " disabled" : ""} title="Aktive Ebene nach unten" aria-label="Aktive Ebene nach unten">↓</button>`
      + `<button class="btn outline small" data-plact="rename">Umbenennen</button><button class="btn outline small danger" data-plact="ldel"${n < 2 ? " disabled" : ""}>Löschen</button></div>`
      + `<div class="row"><button class="btn outline small" data-plact="ladd"${n >= P.MAX_LAYERS ? " disabled" : ""}>${R.icons.plus.replace("<svg", '<svg width="16" height="16"')}Ebene</button></div>`
      + `<p class="note">${n} von ${P.MAX_LAYERS} Ebenen. Reihenfolge = Zeichenfolge, oben liegt zuoberst.</p></section>`;
    for (const g of SYM_GROUPS) { // Elektrosymbole (Schritt 2): Klick wählt, Klick in den Plan setzt
      h += `<section class="section pl-syms"><h2 class="section-title">${R.esc(g)}</h2>`;
      for (const d of PLAN_SYMS.filter((x) => x.group === g)) h += `<button class="sym" data-plsym="${d.key}" aria-pressed="${S.tool === "pl-sym" && opt.sym === d.key}"><span class="thumb">${symThumb(d)}</span><span><span class="name">${R.esc(d.label)}</span>${d.wall ? '<br><span class="sub">an der Wand</span>' : ""}</span></button>`;
      h += `</section>`;
    }
    return h;
  }
  // Vorschau in der Palette: Symbol ohne Beschriftung, Ansicht um die Mitte
  function symThumb(d) {
    const e = d.r + 0.8, [cx, cy] = d.c;
    return `<svg viewBox="${f(cx - e)} ${f(-cy - e)} ${f(2 * e)} ${f(2 * e)}" aria-hidden="true"><g transform="scale(1,-1)">${symSVG({ key: d.key, at: [0, 0], r: 0 }, 1, "currentColor")}</g></svg>`;
  }
  async function leftAct(b) {
    const S0 = sh(), id = b.dataset.layer, a = b.dataset.plact;
    if (a === "pdf") { loadPdf(); return; }
    if (a === "scale") { enterScale(); return; }
    if (a === "free") { opt.free = !opt.free; S.alt = opt.free; renderLeft(); mod(); updateHint(); return; }
    if (a === "multi") { opt.multi = !opt.multi; if (S.tool !== "select") setTool("select"); renderLeft(); updateHint(); return; }
    if (a === "alay") { if (S0.alay !== id) { change(() => { S0.alay = id; }, { panel: false }); if (GRUND_TOOLS.includes(S.tool) && !grundOn()) { cancel(); setTool("select"); } else setTool(S.tool); } return; }
    if (a === "show" || a === "lock") { change(() => { const l = P.layerById(S0, id); l[a] = !l[a]; if (!P.isPickable(S0, { layer: id })) S.sel = new Set([...S.sel].filter((x) => P.isPickable(S0, S0.items.find((i) => i.id === x)))); }); renderLeft(); return; }
    if (a === "up" || a === "down") { change(() => P.moveLayer(S0, S0.alay, a === "up" ? 1 : -1)); renderLeft(); return; }
    if (a === "ladd") { const r = await c.formDialog("Neue Ebene", "Name der Ebene, z. B. Steckdosen, Licht, Leitungen.", [{ label: "Name", value: `Ebene ${S0.layers.length + 1}` }], "Anlegen"); if (r) { change(() => P.addLayer(S0, r[0])); setTool(S.tool); } return; }
    if (a === "rename") { const l = actLayer(), r = await c.formDialog("Ebene umbenennen", "", [{ label: "Name", value: l.name }], "Übernehmen"); if (r && r[0].trim()) { change(() => { l.name = r[0].trim().slice(0, 40); }); renderLeft(); } return; }
    if (a === "ldel") {
      const l = actLayer(), n = S0.items.filter((i) => i.type !== "opening" && i.layer === l.id).length;
      if (n && !(await c.confirmDialog("Ebene löschen?", `„${l.name}“ enthält ${n} ${n === 1 ? "Objekt" : "Objekte"}. Sie werden mit der Ebene gelöscht (Rückgängig mit ⌘Z).`, "Löschen"))) return;
      change(() => { P.deleteLayer(S0, l.id); S.sel = new Set([...S.sel].filter((x) => S0.items.some((i) => i.id === x))); }); setTool(S.tool);
    }
  }

  // ---------- Rechte Leiste ----------
  const sel1 = (k, opts, cur, label) => `<div class="field"><label>${label}</label><select data-plf="${k}">${opts.map(([v, l]) => `<option value="${v}"${String(v) === String(cur) ? " selected" : ""}>${R.esc(l)}</option>`).join("")}</select></div>`;
  const inp = (k, label, v, attr = 'data-plf') => `<div class="field"><label>${label}</label><input type="text" inputmode="decimal" ${attr}="${k}" value="${R.esc(v)}" autocomplete="off"></div>`;
  const LINE_FORMS = [["0", "gerade (Ecken)"], ["1", "geschwungen (Bogen)"]];
  const layerOpts = () => sh().layers.map((l) => [l.id, l.name]);
  const del1 = () => `<div class="row"><button class="btn outline small danger" data-act="del">${R.icons.trash.replace("<svg", '<svg width="16" height="16"')}Löschen</button></div>`;
  // Farbe (5.100): Felder für Leitungen und Symbole der Wahl, «Vorgabe» nimmt die eigene Farbe weg
  function colField(items) {
    const cs = new Set(items.map(P.colOf)), cur = cs.size === 1 ? [...cs][0] : null, own = items.some((i) => i.col !== undefined);
    const dv = new Set(items.map(P.defCol)), dname = (c) => P.PLAN_COLS.find(([x]) => x === c)?.[1].split(" –")[0] ?? c;
    return `<div class="field"><label>Farbe${cur ? ` (${R.esc(dname(cur))})` : " (verschieden)"}</label><div class="swatches">${P.PLAN_COLS.map(([c, l]) => `<button class="swatch" style="--sw:${c}" data-plcol="${c}" aria-pressed="${c === cur}" title="${R.esc(l)}" aria-label="${R.esc(l)}"></button>`).join("")}</div></div>`
      + `<div class="row"><button class="btn outline small" data-plact="coldef"${own ? "" : " disabled"}>Vorgabe${dv.size === 1 ? ` (${R.esc(dname([...dv][0]))})` : ""}</button></div>`;
  }
  const copyRow = () => `<div class="row"><button class="btn outline small" data-plact="copy">Kopieren</button><button class="btn outline small" data-plact="dup">Duplizieren</button>${clip?.length ? `<button class="btn outline small" data-plact="paste">Einfügen</button>` : ""}</div>`;
  function panelHTML(sel0, { head }) {
    const it = sel0.length === 1 ? sel0[0] : null, note = (t) => `<p class="note">${t}</p>`;
    if (it?.type === "wall") return head("Wand", P.MATS.find(([k]) => k === it.mat)[1]) + inp("len", "Länge Mittellinie in mm", P.fmtLen(P.wallLen(it))) + inp("d", "Dicke in mm", P.fmtLen(it.d))
      + sel1("mat", P.MATS, it.mat, "Material") + sel1("layer", layerOpts(), it.layer, "Ebene") + note("Länge ändern verschiebt das Ende (Griff am Ende), angeschlossene Ecken folgen. Ecken ziehen: Griff an den Enden.") + copyRow() + del1();
    if (it?.type === "opening") {
      const w = sh().items.find((i) => i.id === it.wall);
      return head(P.OPENINGS.find(([k]) => k === it.kind)[1], "Öffnung in der Wand") + sel1("kind", P.OPENINGS, it.kind, "Art") + inp("w", "Breite in mm", P.fmtLen(it.w)) + inp("t", "Abstand ab Wandecke in mm", P.fmtLen(it.t))
        + (it.kind === "tuer" ? sel1("hinge", [["l", "Band an der Ecke (links)"], ["r", "Band gegenüber (rechts)"]], it.hinge, "Anschlag") : "")
        + (it.kind === "tuer" || it.kind === "schiebe" ? sel1("side", [["1", "nach links (von Ecke a gesehen)"], ["-1", "nach rechts"]], it.side, it.kind === "tuer" ? "Aufgehrichtung" : "Seite") : "")
        + (P.OPEN_H.has(it.kind) ? inp("h", "Höhe in mm (Angabe)", it.h === undefined ? "" : P.fmtLen(it.h)) : "")
        + (it.kind === "fenster" ? inp("br", "Brüstungshöhe in mm (Angabe)", it.br === undefined ? "" : P.fmtLen(it.br)) : "")
        + note(`Wand ${P.fmtLen(P.wallLen(w))} mm. Ziehen verschiebt die Öffnung entlang der Wand, die Griffe an den Kanten ändern die Breite (Raster 10 mm, Alt frei).`) + del1();
    }
    if (it?.type === "dim") {
      const ci = P.ctrlInfo(it);
      return head(it.ctrl ? "Kontrollmass" : "Mass", it.ref !== undefined ? "an der Wand" : it.ctrl ? "Diagonale prüfen" : "frei")
        + (it.ctrl ? `<p class="note">Ist ${P.fmtLen(ci.ist)} mm${ci.soll ? `, Soll ${P.fmtLen(ci.soll)} mm, Abweichung ${ci.diff > 0 ? "+" : ""}${P.fmtLen(ci.diff)} mm` : ""}.</p>` + inp("soll", "Soll in mm (leer = ohne)", ci.soll ? P.fmtLen(ci.soll) : "")
          : inp("len", "Länge in mm", P.fmtLen(P.dimLen(it))) + note(it.ref !== undefined ? "Eintippen ändert die Wand: Ende b wandert, angeschlossene Ecken folgen." : "Eintippen verschiebt Ende b auf der Masslinie, Wände an diesem Punkt folgen."))
        + inp("off", "Abstand der Masslinie in mm", P.fmtLen(it.off)) + sel1("layer", layerOpts(), it.layer, "Ebene") + del1();
    }
    if (it?.type === "sym") {
      const def = SYM_BY_KEY.get(it.key), tin = (k, label, v) => `<div class="field"><label>${label}</label><input type="text" data-plf="${k}" value="${R.esc(v ?? "")}" autocomplete="off" spellcheck="false"></div>`;
      return head(def.label, def.group) + (def.ref ? tin("fu", "Sicherung (z. B. F3)", it.fu) + tin("nr", "Nummer (Stromkreis)", it.nr) : "") + tin("txt", "Beschriftung", it.txt)
        + inp("sh", "Höhe in cm (leer = ohne)", it.h === undefined ? "" : fmtH(it.h)) + inp("rot", "Drehung in Grad", String(it.r))
        + (def.ap ? `<label class="check"><input type="checkbox" data-plf="ap"${it.ap ? " checked" : ""}> Aufputz</label>` : "") + colField([it]) + sel1("layer", layerOpts(), it.layer, "Ebene")
        + note(`${def.wall ? "Wandsymbol: Ziehen rastet an der nächsten Wandfläche ein (Alt frei). " : ""}R dreht um 90° (Shift+R zurück). Pfeiltasten schieben.`) + copyRow() + del1();
    }
    if (it?.type === "line") return head("Leitung", P.LINE_KINDS.find(([k]) => k === it.kind)[1]) + sel1("lk", P.LINE_KINDS, it.kind, "Verlegeart") + sel1("lc", LINE_FORMS, it.curve ? "1" : "0", "Form") + colField([it]) + sel1("layer", layerOpts(), it.layer, "Ebene")
      + note(`${it.pts.length} Punkte. Griffe an den Punkten ziehen (Fang an Symbolmitten und Leitungspunkten, Shift 0/45/90°), Ziehen an der Linie verschiebt sie.`) + copyRow() + del1();
    if (it) return head(it.type) + copyRow() + del1();
    if (sel0.length > 1) {
      const n = (t) => sel0.filter((i) => i.type === t).length, parts = [["wall", "Wände"], ["opening", "Öffnungen"], ["dim", "Masse"], ["sym", "Symbole"], ["line", "Leitungen"]].filter(([t]) => n(t)).map(([t, l]) => `${n(t)} ${l}`);
      const cols = sel0.filter(P.hasCol), lays = new Set(sel0.filter((i) => i.type !== "opening").map((i) => i.layer));
      return head(`${sel0.length} Objekte`, parts.join(", ")) + (cols.length ? colField(cols) : note("Farbe nur für Leitungen und Symbole; Mauern, Öffnungen und Masse bleiben schwarz."))
        + (lays.size ? sel1("mlayer", lays.size === 1 ? layerOpts() : [["", "– verschieden –"], ...layerOpts()], lays.size === 1 ? [...lays][0] : "", "Ebene") : "")
        + note("Ziehen an einem gewählten Objekt verschiebt alle, Pfeiltasten schieben. Shift-Klick oder Mehrfachwahl nimmt einzelne weg.") + copyRow() + del1();
    }
    let h = "";
    if (S.tool === "pl-wall") h += head("Neue Wand", "Klick Start, Länge tippen, Enter") + inp("d", "Dicke in mm", P.fmtLen(opt.d), "data-plo") + sel1("mat", P.MATS, opt.mat, "Material").replace("data-plf", "data-plo")
      + sel1("side", [["0", "automatisch (nach der ersten Kurve)"], ["1", "links der Zeichenrichtung"], ["-1", "rechts der Zeichenrichtung"]], opt.side, "Wand liegt").replace("data-plf", "data-plo")
      + note("Gezeichnet wird die Innenkante, die Wand wächst nach aussen (automatisch nach der ersten Kurve, Taste X wechselt die Seite). Eingetippte Länge = lichte Länge. Gespeichert wird die Mittellinie. Orange Hilfslinien: Ausrichtung an Anfang, Ecken und letztem Punkt (Alt ohne Fang).");
    else if (S.tool === "pl-open") h += head("Neue Öffnung", "Klick auf eine Wand") + sel1("okind", P.OPENINGS, opt.okind, "Art").replace("data-plf", "data-plo") + inp("ow", "Breite in mm", P.fmtLen(opt.ow[opt.okind]), "data-plo");
    else if (S.tool === "pl-sym") { const def = SYM_BY_KEY.get(opt.sym); h += head(def.label, "Klick in den Plan setzt") + note(`${def.wall ? "Nahe an einer Wand rastet das Symbol an der Wandfläche ein und zeigt in den Raum (Alt frei). " : `Drehung ${opt.symR}°, R dreht um 90°. `}Vorgabe Höhe: ${def.h !== undefined ? `${def.h} cm` : "ohne"}. Beschriftung und Höhe danach rechts am gewählten Symbol.`); }
    else if (S.tool === "pl-line") h += head("Neue Leitung", "Klick setzt Punkte, Enter beendet") + sel1("lkind", P.LINE_KINDS, opt.lkind, "Verlegeart").replace("data-plf", "data-plo") + sel1("lcurve", LINE_FORMS, opt.lcurve ? "1" : "0", "Form").replace("data-plf", "data-plo")
      + note("Fang an Symbolmitten, Leitungspunkten und Wandecken, Shift 0/45/90°, Alt ohne Fang. Doppelklick oder Enter beendet, Rücktaste nimmt den letzten Punkt weg. Geschwungen: die Kurve läuft durch alle Punkte, mit zwei Punkten entsteht ein Bogen (Mittelpunkt danach ziehbar). Farbe Blau (Vorgabe, später in den Einstellungen), am Objekt änderbar.");
    else if (S.tool === "pl-dim") h += head("Neues Mass", "Zwei Punkte, dann Lage") + `<label class="check"><input type="checkbox" data-plo="ctrl"${opt.ctrl ? " checked" : ""}> Kontrollmass (Diagonale: Ist, optional Soll)</label>` + note("Punkte auf beiden Enden einer Wand = Mass an der Wand: Eintippen ändert die Wand.");
    if (S.tool === "select" && clip?.length) h += `<div class="row"><button class="btn outline small" data-plact="paste">Einfügen (${clip.filter((i) => i.type !== "opening").length})</button><button class="btn outline small" data-plact="all">Alles wählen</button></div>`;
    else if (S.tool === "select") h += `<div class="row"><button class="btn outline small" data-plact="all">Alles wählen</button></div>`;
    h += head(c.sheetLabel(sh(), S.active), "Plan") + note(`Massstab ${fmtDen(den())}, Papier und Plankopf oben unter „Druck“. Roter Kreis = gemeinsamer Nullpunkt aller Pläne.`)
      + `<div class="row"><button class="btn outline small" data-act="dupsheet">${R.icons.copy.replace("<svg", '<svg width="16" height="16"')}Blatt duplizieren</button><button class="btn outline small danger" data-act="delsheet"${c.workCount() < 2 ? " disabled" : ""}>${R.icons.trash.replace("<svg", '<svg width="16" height="16"')}Blatt löschen</button></div>`;
    return h;
  }
  // Eingaben rechts: Wert übernehmen beim Verlassen des Felds oder Enter (change)
  function panelChange(t) {
    const S0 = sh(), it = sel()[0];
    if (t.dataset.plo !== undefined) {
      const k = t.dataset.plo;
      if (k === "d") { const v = P.parseLen(t.value); if (v > 0) opt.d = v; else toast("Dicke nicht verstanden.", "error"); }
      else if (k === "ow") { const v = P.parseLen(t.value); if (v > 0) opt.ow[opt.okind] = v; }
      else if (k === "ctrl") opt.ctrl = t.checked;
      else if (k === "lkind") { opt.lkind = t.value; updateHint(); }
      else if (k === "lcurve") { opt.lcurve = t.value === "1"; updateHint(); }
      else if (k === "side") { opt.side = Number(t.value) < 0 ? -1 : Number(t.value) > 0 ? 1 : 0; if (draft) { draft.side = opt.side || 1; draft.auto = opt.side === 0; } }
      else opt[k] = t.value;
      renderRight(); renderOverlay(); updateHint(); return true;
    }
    if (t.dataset.plp !== undefined) { // Fenster Druck: Papier, Ausrichtung, Massstab
      const p = { ...P.paperOf(S0) }, k = t.dataset.plp;
      if (k === "bom") { change(() => { if (t.checked) delete S0.bom; else S0.bom = false; }); return true; }
      if (k === "size" && PAPERS[t.value]) p.size = t.value; else if (k === "quer") p.quer = t.value === "1"; else if (k === "den" && P.PLAN_DENS.includes(Number(t.value))) p.den = Number(t.value); else return true;
      change(() => { S0.paper = p; }); c.renderSheet(); renderItems(); return true;
    }
    if (t.dataset.plf === undefined || !it) return false;
    const k = t.dataset.plf, v = t.value;
    if (k === "mlayer") { if (P.layerById(S0, v)) change(() => { for (const x of sel()) if (x.type !== "opening") x.layer = v; }); else renderRight(); return true; }
    if (k === "lk") { change(() => { it.kind = v; }); return true; }
    if (k === "lc") { change(() => { if (v === "1") { it.curve = true; it.pts = P.bowPts(it.pts); } else delete it.curve; }); return true; }
    const L = P.parseLen(v), bad = () => { toast(`„${v}“ nicht verstanden. Beispiele: 3450, 345 cm, 3,45 m.`, "error"); renderRight(); };
    if (k === "len") { if (!(L > 0)) return bad(), true; change(() => (it.type === "wall" ? P.setWallLength(S0, it, L) : P.setDimLength(S0, it, L))); return true; }
    if (k === "soll") { const s = v.trim() ? L : undefined; if (v.trim() && !(L > 0)) return bad(), true; change(() => { if (s) it.soll = s; else delete it.soll; }); return true; }
    if (k === "off") { const o = Number(v.trim().replace(",", ".").replace("−", "-")); if (!Number.isFinite(o)) return bad(), true; change(() => { it.off = o; }); return true; }
    if (k === "d") { if (!(L > 0)) return bad(), true; change(() => { it.d = L; opt.d = L; }); return true; }
    if (k === "w" || k === "t" || k === "br" || k === "h") {
      const x = (k === "br" || k === "h") && !v.trim() ? undefined : k === "t" && /^\s*0\s*$/.test(v) ? 0 : L;
      if (x !== undefined && !(x >= 0)) return bad(), true;
      change(() => { if (x === undefined) delete it[k]; else it[k] = x; if (k === "w" || k === "t") P.clampOpening(S0.items.find((i) => i.id === it.wall), it); }); return true;
    }
    if (it.type === "sym") {
      if (k === "txt" || k === "fu" || k === "nr") { change(() => { const t0 = v.trim().slice(0, k === "txt" ? 60 : 12); if (t0) it[k] = t0; else delete it[k]; }); return true; }
      if (k === "ap") { change(() => { if (t.checked) it.ap = true; else delete it.ap; }); return true; }
      const n = Number(v.trim().replace(",", ".").replace("−", "-"));
      if (k === "sh") { if (v.trim() && !(n >= 0)) return bad(), true; change(() => { if (v.trim()) it.h = n; else delete it.h; }); return true; }
      if (k === "rot") { if (!Number.isFinite(n)) return bad(), true; change(() => { it.r = ((Math.round(n) % 360) + 360) % 360; }); return true; }
    }
    if (k === "kind") { change(() => { const o = P.cleanPlanObj({ ...it, kind: v }, it.id); S0.items[S0.items.indexOf(it)] = o; }); return true; }
    if (k === "side") { change(() => { it.side = Number(v); }); return true; }
    change(() => { it[k] = v; }); // mat, layer, hinge
    return true;
  }

  // ---------- Fenster Druck ----------
  function popHTML({ head, fieldHTML, META_FIELDS }) {
    const p = P.paperOf(sh()), a = printArea(p), m = (v) => P.fmtLen(v);
    const sel2 = (k, opts, cur, label) => `<div class="field"><label>${label}</label><select data-plp="${k}">${opts.map(([v, l]) => `<option value="${v}"${String(v) === String(cur) ? " selected" : ""}>${l}</option>`).join("")}</select></div>`;
    return head("Druck", "Papier und Massstab des Plans")
      + sel2("size", Object.keys(PAPERS).map((k) => [k, `${k} (${PAPERS[k][0]} × ${PAPERS[k][1]} mm)`]), p.size, "Papier") + sel2("quer", [["0", "hoch"], ["1", "quer"]], p.quer ? "1" : "0", "Ausrichtung")
      + sel2("den", P.PLAN_DENS.map((d) => [d, fmtDen(d)]), p.den, "Massstab")
      + `<div class="row"><button class="btn outline small" data-plact="pmid">Druckmitte setzen</button>${sh().pmid ? `<button class="btn outline small" data-plact="pmidauto">Mitte automatisch</button>` : ""}</div>`
      + `<p class="note">Gedruckt wird ${sh().pmid ? "um die gesetzte Druckmitte" : "die Mitte des Inhalts"}. Planfeld ${m((a.x1 - a.x0) * p.den)} × ${m((a.y1 - a.y0) * p.den)} mm in der Welt (${m(a.x1 - a.x0)} × ${m(a.y1 - a.y0)} mm auf dem Papier). Linien und Texte folgen dem Massstab, nur sichtbare Ebenen. PDF: Exportieren › PDF oder Knopf PDF der Kachel.</p>`
      + `<label class="check"><input type="checkbox" data-plp="bom"${sh().bom === false ? "" : " checked"}> Stückliste drucken (eigene Seite A4 hoch)</label>`
      + `<div class="row"><button class="btn outline small" data-plact="bomcsv">Stückliste als CSV</button></div>`
      + `<h3 class="pv-title">Plankopf</h3>` + META_FIELDS.map((x) => fieldHTML(x.label, `data-meta="${x.tag}"`, sh().meta[x.tag] ?? "")).join("");
  }
  const printLabel = () => { const p = P.paperOf(sh()); return { text: `${paperLabel(p)} ${fmtDen(p.den)}`, warn: false }; };

  function hint() {
    if (S.tool === "pl-wall") return draft ? `Wand: Länge tippen (Innenkante, z. B. 3450 oder 3,45 m), Tab = Winkel tippen, Enter setzt, oder klicken. Shift 0/45/90°, orange Linie = Ausrichtung (Rechteck schliessen), Alt ohne Fang, X wechselt die Wandseite, Klick auf den Anfang schliesst, Esc beendet.${draft.len || draft.ang ? `  Eingabe: ${draft.len || "–"} mm, ${draft.ang || "–"}°` : ""}` : `Wand: Klick setzt den Anfang der Innenkante (Wandecken, Wandflächen, Ausrichtung und Raster rasten ein, Alt frei). Die Wand liegt ${opt.side === 0 ? "automatisch aussen (nach der ersten Kurve)" : opt.side > 0 ? "links der Zeichenrichtung" : "rechts der Zeichenrichtung"}, X wechselt. Dicke und Material rechts.`;
    if (S.tool === "pl-open") return `Öffnung: Klick auf eine Wand setzt ${P.OPENINGS.find(([k]) => k === opt.okind)[1]} (${P.fmtLen(opt.ow[opt.okind])} mm) mittig auf den Klick. Art und Breite rechts.`;
    if (S.tool === "pl-dim") return dimDraft?.b ? "Mass: Klick setzt die Lage der Masslinie. Esc bricht ab." : dimDraft ? "Mass: zweiten Punkt klicken. Shift 0/45/90°. Esc bricht ab." : `Mass: ersten Punkt klicken (Ecken rasten ein).${opt.ctrl ? " Kontrollmass: Ist und Soll." : ""}`;
    if (S.tool === "pl-sym") return `Symbol: Klick setzt ${SYM_BY_KEY.get(opt.sym).label}. ${SYM_BY_KEY.get(opt.sym).wall ? "Rastet an der Wand ein, Alt frei." : "R dreht um 90°."} Esc oder V beendet.`;
    if (S.tool === "pl-line") return lineDraft ? `Leitung: nächster Punkt per Klick (${lineDraft.pts.length} gesetzt${opt.lcurve ? ", geschwungen" : ""}). Doppelklick, Klick auf den letzten Punkt oder Enter beendet, Rücktaste nimmt den letzten Punkt weg. Shift 0/45/90°, Alt ohne Fang.` : `Leitung (${P.LINE_KINDS.find(([x]) => x === opt.lkind)[1]}): Klick setzt den Anfang. Rastet an Symbolmitten, Leitungspunkten und Wandecken ein.`;
    if (S.tool === "pl-measure") return bgDraft ? "Massstab messen: Endpunkt der bekannten Strecke klicken (Shift 0/45/90°). Esc bricht ab." : "Massstab messen: Anfang einer bekannten Strecke auf dem PDF-Plan klicken (z. B. eine Masskette). Danach die Länge in mm eingeben.";
    if (S.tool === "pl-rotate") return bgDraft ? "Plan drehen: zweiten Punkt der Kante klicken. Esc bricht ab." : "Plan drehen: zwei Punkte einer Kante klicken, die waagrecht oder senkrecht liegen soll.";
    if (S.tool === "pl-fix") return "Fixpunkt: Punkt auf dem PDF-Plan klicken, der in allen Stockwerken gleich liegt (z. B. Ecke Treppenhaus). Er wird zum Nullpunkt.";
    if (S.tool === "pl-pmid") return "Druckmitte: in den Plan klicken, dort liegt die Mitte des Planfelds (Rahmen zeigt den Druckbereich). Esc bricht ab.";
    if (S.tool === "hand") return "Ziehen verschiebt die Ansicht.";
    return `Plan: Klick wählt, ${opt.multi ? "Mehrfachwahl an: Klick fügt hinzu oder nimmt weg" : "Shift-Klick fügt hinzu"}, Rahmen ziehen wählt mehrere. Ziehen verschiebt, Griffe ziehen Ecken und Punkte. Entf löscht, ⌘C/⌘V/⌘D kopieren. W Wand, O Tür/Fenster, B Mass, K Leitung, R dreht Symbole.`;
  }

  // Bedienung der Leisten (eigene Datenattribute, app.js kennt sie nicht)
  c.leftEl.addEventListener("click", (e) => {
    if (sh().kind !== "plan") return;
    const y = e.target.closest("[data-plsym]");
    if (y) { opt.sym = y.dataset.plsym; opt.symR = 0; setTool("pl-sym"); renderLeft(); return; }
    const b = e.target.closest("[data-plact]"); if (b) leftAct(b);
  });
  c.popEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-plact]");
    if (!b || sh().kind !== "plan") return;
    if (b.dataset.plact === "pmid") { c.hidePop(); setTool("pl-pmid"); }
    else if (b.dataset.plact === "pmidauto") { change(() => { delete sh().pmid; }); c.renderSheet(); }
    else if (b.dataset.plact === "bomcsv") bomCsv();
  });
  c.rightEl.addEventListener("click", (e) => {
    if (sh().kind !== "plan") return;
    const sw = e.target.closest("[data-plcol]");
    if (sw) { change(() => { for (const it of sel()) P.setCol(it, sw.dataset.plcol); }); return; }
    const a = e.target.closest("[data-plact]")?.dataset.plact;
    if (a === "coldef") change(() => { for (const it of sel()) P.setCol(it, ""); });
    else if (a === "copy") copySel(); else if (a === "paste") paste(); else if (a === "dup") dup(); else if (a === "all") selAll();
  });
  for (const el of [c.rightEl, c.popEl]) el.addEventListener("change", (e) => { if (sh().kind === "plan" && (e.target.dataset.plf !== undefined || e.target.dataset.plo !== undefined || e.target.dataset.plp !== undefined)) panelChange(e.target); });

  // Alt oder Shift gedrückt oder losgelassen: Fangpunkt unter dem Zeiger neu berechnen
  const mod = () => { if (raw) move(raw, { shiftKey: S.shift, altKey: S.alt }); };
  return { mod, sheetSVG, itemsSVG, overlaySVG, bounds, hint, leftHTML, panelHTML, popHTML, printLabel, down, move, up, tap, key, del, cancel, grid, pickable };
}
