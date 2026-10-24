// Modul «Plan» (CJ 23.10.2026, nur elplexaCAD), Schritt 1: Bedienung. Zeichenfläche mit Nullpunkt, Raster und Papierrahmen, Ebenenliste,
// Werkzeuge Wand (W), Öffnung (O), Mass (B), Auswahl (V) mit Einzelwahl, Verschieben und Eckpunkte ziehen, Fenster Druck mit Massstab.
// Daten und Geometrie in plan.js. Im SchemaCAD-Bau ersetzt build.mjs diese Datei durch einen Platzhalter.
import * as P from "./plan.js";
import { PLAN_SYMS, SYM_BY_KEY, SYM_GROUPS, AP_HALF } from "./plansym.js";
import { PAPERS, paperSize, printArea, paperLabel, fmtDen } from "./pv.js";
import { pageInner } from "./pvprint.js";
import * as R from "./render.js";

const INK = "#000000", SEL = "#2f9e58", DRAFT = "#2f6db3";
const OPEN_W = { tuer: 900, fenster: 1200, durchgang: 900, schiebe: 900 }; // Vorgabe Breiten in mm (Annahme)
const OPEN_HV = { tuer: 2000, schiebe: 2000, fenster: 1500 }; // Vorgabe Höhe neuer Öffnungen in mm (CJ 23.10.2026)
const ICON = {
  wall: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18v6H3z"/><path d="M6 15l6-6M11 15l6-6M16 15l5-5"/></svg>',
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 18h5M17 18h5"/><path d="M7 18V8"/><path d="M7 8a10 10 0 0110 10"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" opacity=".35"/><path d="M4 4l16 16"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5" opacity=".35"/><path d="M8 11V8a4 4 0 017.5-2" opacity=".35"/></svg>',
};
const f = R.f, pt = (p) => `${f(p[0])},${f(p[1])}`;
const num = (v) => String(Math.round(v * 10) / 10).replace(".", ",").replace("-", "−");

export function makePlan(c) {
  const { S, toast, change, setTool, renderItems, renderOverlay, renderRight, renderLeft, updateHint, fitView, pushUndo, snapshot, markDirty, nextId } = c;
  const sh = () => S.model;
  const den = () => P.paperOf(sh()).den;
  // Einstellungen für neue Objekte (nur in der Sitzung): Wanddicke (letzte gemerkt), Material, Längenbezug, Öffnung, Kontrollmass
  const opt = { d: P.WALL_D, mat: "mauer", lref: "mitte", okind: "tuer", ow: { ...OPEN_W }, ctrl: false, sym: "STD", symR: 0 }; // sym/symR: Symbol zum Setzen, Drehung ohne Wand
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

  // ---------- Darstellung ----------
  // Druckmitte: gesetzt (sheet.pmid, Werkzeug «Druckmitte setzen» im Fenster Druck), sonst Mitte des Inhalts (auf 10 mm), ohne Inhalt der Nullpunkt
  function center() {
    if (sh().pmid) return sh().pmid;
    const b = P.contentBox(sh());
    return b ? [Math.round((b.x0 + b.x1) / 20) * 10, Math.round((b.y0 + b.y1) / 20) * 10] : [0, 0];
  }
  // Papier in Welt-mm: Ursprung der Seite so, dass die Mitte des Planfelds auf center() liegt
  function pageAt(at) {
    const p = P.paperOf(sh()), a = printArea(p), [cx, cy] = at ?? center(), k = p.den;
    return { p, a, k, ox: cx - ((a.x0 + a.x1) / 2) * k, oy: cy - ((a.y0 + a.y1) / 2) * k };
  }
  const info = (p) => `Plan · Massstab ${fmtDen(p.den)} · ${paperLabel(p)}`;
  function sheetSVG() {
    const { p, k, ox, oy } = pageAt(), [w, h] = paperSize(p), v = c.viewBox(), z = S.view.z;
    let s = `<g transform="translate(${f(ox)} ${f(oy)}) scale(${k})"><rect class="paper" x="0" y="0" width="${w}" height="${h}"/>${pageInner(p, sh().meta, info(p), "")}</g>`;
    if (S.grid.on && S.grid.size * z >= 7) s += `<rect x="${f(v.x0)}" y="${f(v.y0)}" width="${f(v.x1 - v.x0)}" height="${f(v.y1 - v.y0)}" fill="url(#gridpat)" stroke="none" pointer-events="none"/>`;
    const r = 6 / z; // Nullpunkt: gemeinsam für alle Plan-Module (Stockwerke)
    s += `<g class="pl-origin" stroke="#c0392b" stroke-width="1.5" fill="none"><circle cx="0" cy="0" r="${f(r)}"/><path d="M${f(-2 * r)},0H${f(2 * r)}M0,${f(-2 * r)}V${f(2 * r)}"/></g>`;
    return s;
  }
  function bounds() {
    const b = P.contentBox(sh());
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
  // Symbol (plansym.js): Teile in Papier-mm, in der Welt × Massstab k, gedreht um r. Texte aufrecht; Beschriftung und Höhe rechts der Mitte.
  function symSVG(it, k, stroke = INK) {
    const def = SYM_BY_KEY.get(it.key), a = (it.r * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
    const w = (x, y) => [it.at[0] + k * (x * co - y * si), it.at[1] + k * (x * si + y * co)];
    let g = "", t = "";
    for (const q of it.ap ? [...def.parts, AP_HALF] : def.parts) {
      if (q[0] === "l") g += `<line x1="${q[1]}" y1="${q[2]}" x2="${q[3]}" y2="${q[4]}"/>`;
      else if (q[0] === "c") g += `<circle cx="${q[1]}" cy="${q[2]}" r="${q[3]}"${q[4] ? ` fill="${stroke}"` : ""}/>`;
      else if (q[0] === "p") g += `<path d="${q[1]}"${q[2] ? ` fill="${stroke}"` : ""}/>`;
      else if (q[0] === "t") { const m = w(q[1], q[2]); t += txt(m[0], m[1], q[4], q[3] * k, 0, stroke); }
    }
    if (def.ref && (it.fu || it.nr)) { const m = w(-4.9, 0); t += txt(m[0], m[1], [it.fu, it.nr].filter(Boolean).join(" / "), 1.4 * k, it.r, stroke); }
    // Beschriftung und Höhe neben dem Symbol, in Richtung seiner x-Achse (Wandsymbol: entlang der Wand), Texte aufrecht und waagrecht
    const c = P.symCenter(it, k), lines = [it.txt, it.h !== undefined ? fmtH(it.h) : ""].filter(Boolean), d = (def.r + 0.6) * k;
    const ax = co > 0.5 ? "start" : co < -0.5 ? "end" : "middle", up = ax === "middle" ? Math.sign(si) * (d + (lines.length - 1) * 1.1 * k) : 0;
    lines.forEach((s0, i) => { t += txt(c[0] + (ax === "middle" ? 0 : co * d), c[1] + up + ((lines.length - 1) / 2 - i) * 2.2 * k, s0, 1.8 * k, 0, stroke, ax); });
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
  function itemsSVG() {
    const S0 = sh(), k = den(), walls = S0.items.filter((i) => i.type === "wall"), ops = S0.items.filter((i) => i.type === "opening");
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
      for (const y of S0.items) if (y.type === "sym" && y.layer === l.id) s += symSVG(y, k);
    }
    return `<g class="pl-items">${s}</g>`;
  }
  // Wand im Entstehen: Ende aus Eingabe (Länge, Winkel) oder Maus
  function draftEnd() {
    if (!draft || !mouse) return null;
    const L = P.parseLen(draft.len), deg = draft.ang.trim() ? Number(draft.ang.replace(",", ".").replace("−", "-")) : NaN;
    if (!Number.isFinite(L) && !Number.isFinite(deg)) return [mouse.x, mouse.y];
    const m = raw && S.shift ? P.orthoPt(draft.a, [raw.x, raw.y]) : [mouse.x, mouse.y];
    const dir = Number.isFinite(deg) ? deg : Math.atan2(m[1] - draft.a[1], m[0] - draft.a[0]) * 180 / Math.PI;
    const len = Number.isFinite(L) ? P.centerLen(L, opt.lref, opt.d) : Math.hypot(m[0] - draft.a[0], m[1] - draft.a[1]);
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
    }
    if (draft && mouse) {
      const b = draftEnd(), w = { id: -1, a: draft.a, b, d: opt.d };
      if (Math.hypot(b[0] - draft.a[0], b[1] - draft.a[1]) > 1) {
        const x = P.wallShapes([w])[0];
        s += `<path d="M${x.poly.map(pt).join("L")}Z" fill="rgba(47,109,179,.12)" stroke="${DRAFT}" stroke-width="1.5"/>`;
        const L = Math.hypot(b[0] - draft.a[0], b[1] - draft.a[1]), deg = Math.atan2(b[1] - draft.a[1], b[0] - draft.a[0]) * 180 / Math.PI;
        const shown = opt.lref === "mitte" ? L : opt.lref === "innen" ? L - opt.d : L + opt.d;
        s += label(b, `${draft.field === "len" && draft.len ? `[${draft.len}]` : P.fmtLen(shown)} mm  ${draft.field === "ang" ? `[${draft.ang}]` : num(((deg % 360) + 360) % 360)}°`);
      }
    }
    if (dimDraft && mouse) {
      const b = dimDraft.b ?? [mouse.x, mouse.y], d = { a: dimDraft.a, b, off: dimDraft.b ? offAt(dimDraft.a, dimDraft.b, [raw.x, raw.y]) : 0, ctrl: opt.ctrl };
      if (Math.hypot(b[0] - d.a[0], b[1] - d.a[1]) > 1) s += `<g class="pl-scale">${dimSVG(d, k, DRAFT)}</g>`;
    }
    if (S.tool === "pl-pmid" && mouse) { const { a, k: d, ox, oy } = pageAt([mouse.x, mouse.y]); s += `<rect x="${f(ox + a.x0 * d)}" y="${f(oy + a.y0 * d)}" width="${f((a.x1 - a.x0) * d)}" height="${f((a.y1 - a.y0) * d)}" fill="rgba(47,109,179,.06)" stroke="${DRAFT}" stroke-width="1.5" stroke-dasharray="6 4"/>`; } // Vorschau des Planfelds
    if (S.tool === "pl-sym" && raw) { const q = symPlace(opt.sym, raw, opt.symR); s += `<g class="pl-scale" opacity=".8">${symSVG({ key: opt.sym, at: q.at, r: q.r, h: SYM_BY_KEY.get(opt.sym).h }, k, DRAFT)}</g>`; }
    if (S.tool === "pl-open" && raw) { const pv = openPreview(); if (pv) s += `<g class="pl-scale">${openingSVG(pv.w, pv.o, k, DRAFT)}</g>`; }
    if (mouse && S.tool !== "select" && S.tool !== "hand" && S.tool !== "pl-sym") s += `<circle cx="${f(mouse.x)}" cy="${f(mouse.y)}" r="${px(mouse.snap && mouse.snap !== "grid" ? 5 : 3)}" fill="${mouse.snap === "end" ? "#f4c400" : "#fff"}" stroke="${DRAFT}" stroke-width="1.5"/>`;
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

  // ---------- Zeiger ----------
  function down(w, e) {
    raw = w; S.shift = e.shiftKey; S.alt = e.altKey;
    const T = S.tool;
    if (T === "pl-wall") {
      const p = snapAt(w, draft?.a);
      mouse = p;
      if (!draft) { if (layerOk()) draft = { a: [p.x, p.y], start: [p.x, p.y], len: "", ang: "", field: "len" }; }
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
    if (T === "pl-dim") {
      const p = snapAt(w, dimDraft?.a); mouse = p;
      if (!dimDraft) { if (layerOk()) dimDraft = { a: [p.x, p.y] }; }
      else if (!dimDraft.b) { if (Math.hypot(p.x - dimDraft.a[0], p.y - dimDraft.a[1]) > 1) dimDraft.b = [p.x, p.y]; }
      else addDim(offAt(dimDraft.a, dimDraft.b, [w.x, w.y]));
      renderOverlay(); updateHint(); return;
    }
    if (T === "pl-pmid") { change(() => { sh().pmid = [Math.round(w.x), Math.round(w.y)]; }); setTool("select"); c.renderSheet(); toast("Druckmitte gesetzt. Oben unter „Druck“ zurück auf automatisch."); return; }
    if (T !== "select") return;
    const one = sel()[0], t = tol(), near = (p) => Math.hypot(p[0] - w.x, p[1] - w.y) <= t;
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
    const hit = P.hitPlan(sh(), pickable(), [w.x, w.y], t);
    S.sel = hit ? new Set([hit.id]) : new Set();
    if (hit) drag = { type: "move", it: hit, sx: w.x, sy: w.y, started: false, snap: snapshot(), ...(hit.type === "wall" ? { ea: P.nodeEnds(sh(), hit.a), eb: P.nodeEnds(sh(), hit.b), a0: [...hit.a], b0: [...hit.b] } : hit.type === "opening" ? { t0: hit.t } : hit.type === "sym" ? { at0: [...hit.at], r0: hit.r } : { off0: hit.off }) };
    renderRight(); renderOverlay();
  }
  function move(w, e) {
    raw = w; S.shift = e.shiftKey; S.alt = e.altKey;
    mouse = S.tool === "pl-wall" ? snapAt(w, draft?.a) : S.tool === "pl-dim" ? snapAt(w, dimDraft?.b ? undefined : dimDraft?.a) : snapAt(w);
    const d = drag;
    if (d) {
      if (!d.started && Math.hypot(w.x - d.sx, w.y - d.sy) * S.view.z > 3) d.started = true;
      if (d.started) {
        if (d.type === "node") { const skip = new Set(d.ends.map((x) => x.it.id)), p = P.snapPlan(sh(), visible().filter((i) => !skip.has(i.id)), [w.x, w.y], { grid: S.grid.on ? S.grid.size : 0, tol: tol(), alt: S.alt, ortho: S.shift ? otherEnd(d) : undefined }); mouse = p; P.setEnds(sh(), d.ends, [p.x, p.y]); }
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
  function up() {
    const d = drag; drag = null;
    if (d?.started) { pushUndo(d.snap); markDirty(); renderItems(); renderOverlay(); renderRight(); }
  }
  function tap(w) { const hit = P.hitPlan(sh(), pickable(), [w.x, w.y], 14 / S.view.z); S.sel = hit ? new Set([hit.id]) : new Set(); renderRight(); renderOverlay(); }

  // ---------- Wände und Masse anlegen ----------
  function commit(b, close = false) {
    if (!draft || !b) return;
    const a = draft.a;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) { if (close) cancel(); return; }
    const id = nextId();
    change(() => sh().items.push({ id, type: "wall", layer: sh().alay, a: [...a], b: [b[0], b[1]], d: opt.d, mat: opt.mat }));
    const start = draft.start;
    draft = close || Math.hypot(b[0] - start[0], b[1] - start[1]) < 1e-6 ? null : { a: [b[0], b[1]], start, len: "", ang: "", field: "len" }; // auf den Anfang = Raum geschlossen
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
  // Entwurf beenden. Gibt true, wenn etwas abgebrochen wurde.
  function cancel() {
    const had = !!(draft || dimDraft);
    draft = null; dimDraft = null;
    return had;
  }
  function del() {
    const ids = [...S.sel];
    if (!ids.length) return;
    change(() => { for (const id of ids) P.deleteItem(sh(), id); S.sel.clear(); });
  }

  // ---------- Tasten ----------
  const TOOL_KEYS = { v: "select", w: "pl-wall", o: "pl-open", b: "pl-dim" };
  function key(e, mod) {
    const k = e.key;
    if (mod) {
      if (["a", "d", "c", "v"].includes(k.toLowerCase())) { toast("Im Plan gibt es in Schritt 1 nur Einzelwahl. Mehrfachwahl, Kopieren und Einfügen folgen."); return true; }
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
    if (dimDraft && k === "Escape") { dimDraft = null; renderOverlay(); updateHint(); return true; }
    if (TOOL_KEYS[k.toLowerCase()] && !e.altKey) { setTool(TOOL_KEYS[k.toLowerCase()]); return true; }
    if (k.toLowerCase() === "r" && !e.altKey) { // Drehen um 90° (Shift: zurück): beim Setzen das nächste Symbol, sonst das gewählte
      const step = e.shiftKey ? 270 : 90, one = sel()[0];
      if (S.tool === "pl-sym") { opt.symR = (opt.symR + step) % 360; renderOverlay(); return true; }
      if (one?.type === "sym") { change(() => { one.r = (one.r + step) % 360; }); return true; }
      return true;
    }
    if ("ltiqry".includes(k.toLowerCase()) && k.length === 1) return true; // Werkzeuge anderer Blätter: hier ohne Wirkung
    if (k.startsWith("Arrow") && S.sel.size) {
      const step = (S.grid.on ? S.grid.size : 10) * (e.shiftKey ? 5 : 1), dx = k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0, dy = k === "ArrowUp" ? step : k === "ArrowDown" ? -step : 0;
      change(() => { for (const it of sel()) P.moveItem(sh(), it, dx, dy); }, { panel: true });
      return true;
    }
    return false;
  }

  // ---------- Linke Leiste: Werkzeuge und Ebenen ----------
  const toolBtn = (id, icon, label, key) => `<button class="tool" data-tool="${id}" aria-pressed="${S.tool === id}" title="${label} (Taste ${key})">${icon}<span>${label}</span><span class="key">${key}</span></button>`;
  function leftHTML() {
    const S0 = sh();
    let h = `<section class="section"><h2 class="section-title">Werkzeuge</h2>` + toolBtn("select", R.icons.select, "Auswählen", "V") + toolBtn("hand", R.icons.hand, "Ansicht schieben", "H")
      + `</section><section class="section"><h2 class="section-title">Grundriss</h2>` + toolBtn("pl-wall", ICON.wall, "Wand", "W") + toolBtn("pl-open", ICON.open, "Tür, Fenster", "O") + toolBtn("pl-dim", R.icons.dim, "Mass", "B")
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
    if (a === "alay") { if (S0.alay !== id) { change(() => { S0.alay = id; }, { panel: false }); setTool(S.tool); } return; }
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
  const layerOpts = () => sh().layers.map((l) => [l.id, l.name]);
  const del1 = () => `<div class="row"><button class="btn outline small danger" data-act="del">${R.icons.trash.replace("<svg", '<svg width="16" height="16"')}Löschen</button></div>`;
  function panelHTML(sel0, { head }) {
    const it = sel0.length === 1 ? sel0[0] : null, note = (t) => `<p class="note">${t}</p>`;
    if (it?.type === "wall") return head("Wand", P.MATS.find(([k]) => k === it.mat)[1]) + inp("len", "Länge Mittellinie in mm", P.fmtLen(P.wallLen(it))) + inp("d", "Dicke in mm", P.fmtLen(it.d))
      + sel1("mat", P.MATS, it.mat, "Material") + sel1("layer", layerOpts(), it.layer, "Ebene") + note("Länge ändern verschiebt das Ende (Griff am Ende), angeschlossene Ecken folgen. Ecken ziehen: Griff an den Enden.") + del1();
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
        + (def.ap ? `<label class="check"><input type="checkbox" data-plf="ap"${it.ap ? " checked" : ""}> Aufputz</label>` : "") + sel1("layer", layerOpts(), it.layer, "Ebene")
        + note(`${def.wall ? "Wandsymbol: Ziehen rastet an der nächsten Wandfläche ein (Alt frei). " : ""}R dreht um 90° (Shift+R zurück). Pfeiltasten schieben.`) + del1();
    }
    if (sel0.length > 1) return head(`${sel0.length} Objekte`) + del1();
    let h = "";
    if (S.tool === "pl-wall") h += head("Neue Wand", "Klick Start, Länge tippen, Enter") + inp("d", "Dicke in mm", P.fmtLen(opt.d), "data-plo") + sel1("mat", P.MATS, opt.mat, "Material").replace("data-plf", "data-plo")
      + sel1("lref", P.LEN_REFS, opt.lref, "Eingetippte Länge gilt für").replace("data-plf", "data-plo") + note("Gespeichert wird immer die Mittellinie. Innen-/Aussenkante: Annahme rechtwinklige Ecken mit gleich dicken Wänden (± Dicke).");
    else if (S.tool === "pl-open") h += head("Neue Öffnung", "Klick auf eine Wand") + sel1("okind", P.OPENINGS, opt.okind, "Art").replace("data-plf", "data-plo") + inp("ow", "Breite in mm", P.fmtLen(opt.ow[opt.okind]), "data-plo");
    else if (S.tool === "pl-sym") { const def = SYM_BY_KEY.get(opt.sym); h += head(def.label, "Klick in den Plan setzt") + note(`${def.wall ? "Nahe an einer Wand rastet das Symbol an der Wandfläche ein und zeigt in den Raum (Alt frei). " : `Drehung ${opt.symR}°, R dreht um 90°. `}Vorgabe Höhe: ${def.h !== undefined ? `${def.h} cm` : "ohne"}. Beschriftung und Höhe danach rechts am gewählten Symbol.`); }
    else if (S.tool === "pl-dim") h += head("Neues Mass", "Zwei Punkte, dann Lage") + `<label class="check"><input type="checkbox" data-plo="ctrl"${opt.ctrl ? " checked" : ""}> Kontrollmass (Diagonale: Ist, optional Soll)</label>` + note("Punkte auf beiden Enden einer Wand = Mass an der Wand: Eintippen ändert die Wand.");
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
      else opt[k] = t.value;
      renderRight(); renderOverlay(); return true;
    }
    if (t.dataset.plp !== undefined) { // Fenster Druck: Papier, Ausrichtung, Massstab
      const p = { ...P.paperOf(S0) }, k = t.dataset.plp;
      if (k === "size" && PAPERS[t.value]) p.size = t.value; else if (k === "quer") p.quer = t.value === "1"; else if (k === "den" && P.PLAN_DENS.includes(Number(t.value))) p.den = Number(t.value); else return true;
      change(() => { S0.paper = p; }); c.renderSheet(); renderItems(); return true;
    }
    if (t.dataset.plf === undefined || !it) return false;
    const k = t.dataset.plf, v = t.value, L = P.parseLen(v), bad = () => { toast(`„${v}“ nicht verstanden. Beispiele: 3450, 345 cm, 3,45 m.`, "error"); renderRight(); };
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
      + `<p class="note">Gedruckt wird ${sh().pmid ? "um die gesetzte Druckmitte" : "die Mitte des Inhalts"}. Planfeld ${m((a.x1 - a.x0) * p.den)} × ${m((a.y1 - a.y0) * p.den)} mm in der Welt (${m(a.x1 - a.x0)} × ${m(a.y1 - a.y0)} mm auf dem Papier). Linien und Texte folgen dem Massstab. PDF folgt in Schritt 4.</p>`
      + `<h3 class="pv-title">Plankopf</h3>` + META_FIELDS.map((x) => fieldHTML(x.label, `data-meta="${x.tag}"`, sh().meta[x.tag] ?? "")).join("");
  }
  const printLabel = () => { const p = P.paperOf(sh()); return { text: `${paperLabel(p)} ${fmtDen(p.den)}`, warn: false }; };

  function hint() {
    if (S.tool === "pl-wall") return draft ? `Wand: Länge tippen (${{ mitte: "Mittellinie", innen: "Innenkante", aussen: "Aussenkante" }[opt.lref]}, z. B. 3450 oder 3,45 m), Tab = Winkel tippen, Enter setzt, oder klicken. Shift 0/45/90°, Alt ohne Fang, Klick auf den Anfang schliesst, Esc beendet.${draft.len || draft.ang ? `  Eingabe: ${draft.len || "–"} mm, ${draft.ang || "–"}°` : ""}` : "Wand: Klick setzt den Anfang (Ecken, Wandmitte und Raster rasten ein). Dicke und Material rechts.";
    if (S.tool === "pl-open") return `Öffnung: Klick auf eine Wand setzt ${P.OPENINGS.find(([k]) => k === opt.okind)[1]} (${P.fmtLen(opt.ow[opt.okind])} mm) mittig auf den Klick. Art und Breite rechts.`;
    if (S.tool === "pl-dim") return dimDraft?.b ? "Mass: Klick setzt die Lage der Masslinie. Esc bricht ab." : dimDraft ? "Mass: zweiten Punkt klicken. Shift 0/45/90°. Esc bricht ab." : `Mass: ersten Punkt klicken (Ecken rasten ein).${opt.ctrl ? " Kontrollmass: Ist und Soll." : ""}`;
    if (S.tool === "pl-sym") return `Symbol: Klick setzt ${SYM_BY_KEY.get(opt.sym).label}. ${SYM_BY_KEY.get(opt.sym).wall ? "Rastet an der Wand ein, Alt frei." : "R dreht um 90°."} Esc oder V beendet.`;
    if (S.tool === "pl-pmid") return "Druckmitte: in den Plan klicken, dort liegt die Mitte des Planfelds (Rahmen zeigt den Druckbereich). Esc bricht ab.";
    if (S.tool === "hand") return "Ziehen verschiebt die Ansicht.";
    return "Plan: Klick wählt ein Objekt, Ziehen verschiebt, Griffe an den Enden ziehen Ecken (Nachbarwände folgen), an Tür/Fenster die Breite. Entf löscht, Pfeiltasten schieben. W Wand, O Tür/Fenster, B Mass, R dreht ein Symbol.";
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
  });
  for (const el of [c.rightEl, c.popEl]) el.addEventListener("change", (e) => { if (sh().kind === "plan" && (e.target.dataset.plf !== undefined || e.target.dataset.plo !== undefined || e.target.dataset.plp !== undefined)) panelChange(e.target); });

  return { sheetSVG, itemsSVG, overlaySVG, bounds, hint, leftHTML, panelHTML, popHTML, printLabel, down, move, up, tap, key, del, cancel, grid, pickable };
}
