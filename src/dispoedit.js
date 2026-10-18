// SchemaCAD: Disposition bearbeiten (Verteileraufbau): neue Bauteile, Fang und Hilfslinien, Griffe, Ausrichten, Übergabe ans Schema,
// linke Leiste und Eigenschaften. Rechnen und Zeichnen in dispo.js. Bekommt die Editor-Funktionen von app.js übergeben (wie files.js).
import * as D from "./dispo.js";
import * as K from "./schrank.js";
import { CORNERS, nextCorner, cornerName } from "./pv.js";
import * as R from "./render.js";
import { toast, formDialog } from "./dialogs.js";
import { fieldHTML, head, numField, dupDel, textPanelHTML } from "./panel.js";

const DIM_TOOL = { id: "dim", label: "Bemassung", key: "B", icon: "dim" };

export function makeDispo({ S, TOOLS, round3, isDispo, selectedItems, nextId, snapBase, change, moveItem, setTool, afterSheetChange, sheetLabel, nextSheetNo, makeSheet }) {
  // ---------- Disposition: neue Bauteile und Fang ----------
  // Vorlage für ein neues Bauteil an Stelle (x, y). c ist der Fangpunkt (bei der Schiene optional mit Länge der Platte).
  // Bezugsecke neuer Platten: Tab wechselt wie beim Modul im Stringplan (CJ 16.10.), bleibt in der Sitzung
  let corner = CORNERS[0];
  const placingPlate = () => S.tool === "place" && /^D:(PLATE|CAB|PART):/.test(S.placeSym || "");
  function cornerKey(back) { if (!placingPlate()) return false; corner = nextCorner(corner, back ? -1 : 1); return true; }
  const plateCorner = () => cornerName(corner);
  const atCorner = (p, cab = false) => { // Klickpunkt = gewählte Ecke (Schrank: Ecke mit Sockel)
    const b = cab ? K.cabBox(p) : { x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h };
    return { ...p, x: corner[0] === "r" ? round3(p.x - (b.x1 - b.x0)) : p.x, y: round3((corner[1] === "t" ? p.y - (b.y1 - b.y0) : p.y) + (p.y - b.y0)) };
  };
  function newDispoItem(sym, x, y, c = {}) {
    const dp = S.dp;
    if (sym === "D:PLATE:zaehler") { const p = D.PLATE_PRESETS.zaehler; return atCorner({ type: "plate", x, y, w: p.w, h: p.h, name: p.name, fixed: true }); }
    if (sym === "D:PLATE:frei") return atCorner({ type: "plate", x, y, w: dp.plateW, h: dp.plateH, name: D.PLATE_PRESETS.frei.name });
    if (sym === "D:RAIL") return { type: "rail", x, y, len: c.len ?? dp.railLen };
    if (sym === "D:RAILF") return { type: "rail", x, y, len: dp.railLen, free: true }; // freie Schiene für Abgangsklemmen (CJ 16.10.)
    if (sym.startsWith("D:PART:") && c.bar) return K.newPart(sym.slice(7), x, y); // N-Trenner auf einer Schiene: schon mittig gesetzt
    if (sym.startsWith("D:CAB:")) return atCorner(K.newCabinet(x, y, sym.slice(6)), true);
    if (sym.startsWith("D:PART:")) return atCorner(K.newPart(sym.slice(7), x, y));
    const pr = D.PRESET_BY_ID[sym.slice("D:DEV:".length)], free = pr.id === "FREI";
    const d = { type: "device", x, y, te: free ? dp.freeTE : pr.te, h: pr.h ?? dp.devH, kind: pr.id, label: free ? dp.freeLabel : pr.type, bmk: "" };
    for (const k of ["top", "l2", "n", "qs"]) if (pr[k] !== undefined) d[k] = pr[k];
    return pr.id === "KL" ? { ...d, ...D.klemmFit(d) } : d;
  }
  const plateAt = (x, y) => [...S.model.items].reverse().find((i) => i.type === "plate" && x >= i.x && x <= i.x + i.w && y >= i.y && y <= i.y + i.h);
  // Hilfslinien: Kanten und Mitten anderer Bauteile ziehen an (Alt schaltet sie aus). box = Ausdehnung des gezogenen Teils,
  // xc und yc = Werte, die einrasten dürfen. Gibt die Korrektur zurück, die Linien stehen danach in S.guides.
  function guideSnap(box, xc, yc, skip) {
    S.guides = [];
    if (S.alt) return { dx: 0, dy: 0 };
    const L = D.guideLines(S.model.items, skip), tol = 8 / S.view.z;
    const gx = D.nearestGuide(xc, L.xs, tol), gy = D.nearestGuide(yc, L.ys, tol);
    const dx = gx ? round3(gx.v - gx.c) : 0, dy = gy ? round3(gy.v - gy.c) : 0;
    const b = { x0: box.x0 + dx, x1: box.x1 + dx, y0: box.y0 + dy, y1: box.y1 + dy };
    if (gx) S.guides.push(D.guideSeg(gx, "x", b));
    if (gy) S.guides.push(D.guideSeg(gy, "y", b));
    return { dx, dy };
  }
  const edgesX = (b) => [b.x0, (b.x0 + b.x1) / 2, b.x1], edgesY = (b) => [b.y0, (b.y0 + b.y1) / 2, b.y1];
  function dispoSnap(wx, wy) {
    S.guides = [];
    if (S.tool === "dim") { // Werkzeug Bemassung: Ecken, Kantenmitten, Kanten; Alt = frei
      const c = S.alt ? null : D.dimSnap(S.model.items, wx, wy, 10 / S.view.z);
      return c || { x: round3(wx), y: round3(wy), k: "free" };
    }
    const g = snapBase(wx, wy, false);
    if (S.tool !== "place" || !S.placeSym) return g;
    if (S.placeSym.startsWith("D:DEV:")) {
      const te = newDispoItem(S.placeSym, 0, 0).te, gs = S.grid.on ? S.grid.size : 0.1, left = wx - te * D.TE / 2;
      const r = D.snapDevice(S.model.items, left, wy, te);
      return r ? { x: r.x, y: r.y, rail: r.rail } : { x: round3(Math.round(left / gs) * gs), y: g.y };
    }
    if (MULTI.test(S.placeSym)) return g; // Schienen N/PE/PEN, Zuleitung, Vorlage: Punkt auf dem Raster
    if (/^D:PART:NTA?$/.test(S.placeSym)) { const b = barSnap(newDispoItem(S.placeSym, 0, 0), wx, wy); if (b) return b; }
    const pl = S.placeSym === "D:RAIL" ? plateAt(wx, wy) : null, c = pl ? { ...D.railFit(pl), y: g.y } : g;
    const b = D.itemBBox(newDispoItem(S.placeSym, c.x, c.y, c)), k = guideSnap(b, pl ? [] : edgesX(b), edgesY(b), new Set());
    return { ...c, x: round3(c.x + k.dx), y: round3(c.y + k.dy) };
  }
  function addDispoItem(it) { change(() => { S.model.items.push({ id: nextId(), ...it }); }); }

  // ---------- Schienen N/PE/PEN, Zuleitung, Vorlage AÜU (CJ 16.10.2026) ----------
  // Schiene: 2 Klicks (Anfang, Ende). Zuleitung: Klicks setzen Punkte, Klick auf den letzten Punkt, Enter oder Esc beendet.
  // S.dpDraft = { sym, pts } während des Zeichnens.
  const MULTI = /^D:(BAR:|CABLE$|TPL:)/;
  // N-Trenner auf eine Schiene setzen: mittig auf die Achse der Schiene unter dem Zeiger
  function barSnap(nt, wx, wy) {
    const tol = 10 / S.view.z, bar = [...S.model.items].reverse().find((i) => i.type === "part" && i.kind === "BAR" && wx >= i.x - tol && wx <= i.x + i.w + tol && wy >= i.y - tol && wy <= i.y + i.h + tol);
    if (!bar) return null;
    return bar.w >= bar.h ? { x: round3(wx - nt.w / 2), y: round3(bar.y + bar.h / 2 - nt.h / 2), bar: bar.id } : { x: round3(bar.x + bar.w / 2 - nt.w / 2), y: round3(wy - nt.h / 2), bar: bar.id };
  }
  // Vorlage Systemauftrennung AÜU: Klickpunkt = Anschluss PEN unten (Mitte). PEN senkrecht mit Zuleitung von unten,
  // oben der N-Trenner, darüber die N-Schiene, rechts oben die PE-Schiene. Masse gesetzt (Annahme), Teile danach einzeln.
  function aueuItems(x, y) {
    const t = K.BAR_T, nt = K.newPart("NT", 0, 0);
    return [
      { ...K.barFrom("PEN", { x, y }, { x, y: y + 200 }), bmk: "" },
      { type: "cable", pts: [[x, round3(y - 150)], [x, y]], s: D.CABLE_TEXT },
      { ...nt, x: round3(x - nt.w / 2), y: round3(y + 200) },
      K.barFrom("N", { x, y: round3(y + 200 + nt.h) }, { x, y: round3(y + 350 + nt.h) }),
      K.barFrom("PE", { x: round3(x + t / 2), y: round3(y + 200 - t) }, { x: round3(x + t / 2 + 200), y: round3(y + 200 - t) }),
    ];
  }
  function placeDown(c) {
    const sym = S.placeSym;
    if (!MULTI.test(sym || "")) return false;
    if (sym === "D:TPL:AUEU") { change(() => { for (const it of aueuItems(c.x, c.y)) S.model.items.push({ id: nextId(), ...it }); }); return true; } // ein Rückgängig-Schritt
    const d = S.dpDraft && S.dpDraft.sym === sym ? S.dpDraft : (S.dpDraft = { sym, pts: [] });
    const last = d.pts.at(-1);
    if (sym.startsWith("D:BAR:")) {
      if (!last) { d.pts.push([c.x, c.y]); return true; }
      if (Math.hypot(c.x - last[0], c.y - last[1]) < 1e-6) return true;
      S.dpDraft = null;
      addDispoItem({ ...K.barFrom(sym.slice(6), { x: last[0], y: last[1] }, c), bmk: "" });
      return true;
    }
    if (last && Math.hypot(c.x - last[0], c.y - last[1]) < 1e-6) { draftFinish(); return true; } // Klick auf den letzten Punkt beendet
    d.pts.push([c.x, c.y]);
    return true;
  }
  function draftFinish() {
    const d = S.dpDraft;
    if (!d) return false;
    S.dpDraft = null;
    if (d.sym === "D:CABLE" && d.pts.length >= 2) addDispoItem({ type: "cable", pts: d.pts, s: D.CABLE_TEXT });
    return true;
  }
  // Vorschau beim Setzen
  function placeGhost(m) {
    const sym = S.placeSym, d = S.dpDraft?.sym === sym ? S.dpDraft : null, last = d?.pts.at(-1);
    if (sym === "D:TPL:AUEU") return D.ghostSVG(aueuItems(m.x, m.y));
    if (sym.startsWith("D:BAR:")) return last ? D.ghostSVG([K.barFrom(sym.slice(6), { x: last[0], y: last[1] }, m)]) : `<circle class="dp-snap" cx="${m.x}" cy="${m.y}" r="${4 / S.view.z}"/>`;
    if (sym === "D:CABLE") return d ? D.ghostSVG([{ type: "cable", pts: [...d.pts, [m.x, m.y]], s: D.CABLE_TEXT }]) : `<circle class="dp-snap" cx="${m.x}" cy="${m.y}" r="${4 / S.view.z}"/>`;
    return D.ghostSVG([newDispoItem(sym, m.x, m.y, m)]);
  }
  // Teile innerhalb gewählter Platten wandern mit der Platte (beim Verschieben, Kopieren, Duplizieren)
  function dispoExtras(items) {
    if (!isDispo()) return [];
    const have = new Set(items.map((i) => i.id)), out = new Map();
    for (const p of items) if (D.isBack(p)) for (const o of D.contained(S.model.items, p)) if (!have.has(o.id)) out.set(o.id, o);
    return [...out.values()];
  }
  // Neue Plattenbreite: Schienen mit voller Länge wachsen mit (20 mm Rand), gekürzte bleiben, aber innerhalb des Randes. Die Höhe bleibt.
  function setPlateW(plate, w) {
    const rails = D.contained(S.model.items, plate).filter((i) => i.type === "rail" && !i.free).map((r) => ({ r, o: { ...r }, full: D.railIsFull(r, plate) }));
    plate.w = w;
    fitRails(rails, plate);
  }
  const fitRails = (rails, plate) => { for (const { r, o, full } of rails) Object.assign(r, full ? D.railFit(plate) : D.railClamp(o, plate)); };
  // Griffe: nur bei genau einer gewählten Platte (nicht Zählerplatte) oder Schiene
  const handleItem = () => { const sel = selectedItems(); return isDispo() && S.tool === "select" && sel.length === 1 && D.handlePoints(sel[0]).length ? sel[0] : null; };
  function handleAt(x, y) {
    const it = handleItem(), tol = 7 / S.view.z;
    const h = it && D.handlePoints(it).find((p) => Math.abs(p.x - x) <= tol && Math.abs(p.y - y) <= tol);
    return h ? { it, h: h.h } : null;
  }
  const HANDLE_CURSOR = { w: "ew-resize", e: "ew-resize", n: "ns-resize", s: "ns-resize", sw: "nesw-resize", ne: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };
  // Grösse per Griff ändern. Wird die Platte breiter oder schmaler, wachsen ihre Schienen mit (20 mm Rand), in der Höhe bleiben sie.
  function dragHandle(d, c) {
    const hx = d.it.type === "rail" || /[we]/.test(d.h), hy = d.it.type === "plate" && /[ns]/.test(d.h);
    const k = guideSnap({ x0: c.x, x1: c.x, y0: c.y, y1: c.y }, hx ? [c.x] : [], hy ? [c.y] : [], new Set([d.it.id, ...d.rails.map((r) => r.r.id)]));
    c = { x: round3(c.x + k.dx), y: round3(c.y + k.dy) };
    if (d.it.type === "rail") { Object.assign(d.it, D.resizeRail(d.orig, d.h, c.x, d.plate)); return; }
    Object.assign(d.it, D.resizePlate(d.orig, d.h, c.x, c.y, d.it.type === "part" ? 2 : D.MIN_PLATE));
    if (d.it.x !== d.orig.x || d.it.w !== d.orig.w) fitRails(d.rails, d.it);
  }
  // Eingetipptes Mass übernehmen (Doppelklick auf das Mass)
  function applyMass(it, key, v) {
    if (it.type === "rail") Object.assign(it, D.resizeRail(it, "e", it.x + v, it.free ? null : plateAt(it.x + it.len / 2, it.y)));
    else if (key === "w") setPlateW(it, Math.max(D.MIN_PLATE, v));
    else it.h = Math.max(D.MIN_PLATE, v);
  }
  // Mass unter dem Zeiger: das der gewählten Platte oder Schiene, bei eingeschalteter Bemassung auch jede andere Platte
  function massAt(x, y) {
    if (!isDispo() || S.tool !== "select") return null;
    const h = D.planOpts(S.model).dimH, tol = Math.max(h, 10 / S.view.z), sel = handleItem();
    const cands = [sel, ...(S.model.dims !== false ? S.model.items.filter((i) => i.type === "plate" && i !== sel) : [])].filter(Boolean);
    for (const it of cands) {
      const t = D.massTargets(it, h).find((m) => Math.abs((m.anchor === "lm" ? m.x + h : m.anchor === "rm" ? m.x - h : m.x) - x) <= tol * 1.5 && Math.abs(m.y - y) <= tol);
      if (t) return { it, ...t };
    }
    return null;
  }
  // Ausrichten und Verteilen: Bauteile der Auswahl. Was in einer gewählten Platte liegt, wandert mit der Platte.
  function alignTargets() {
    const sel = selectedItems().filter((i) => D.PLAN_TYPES.has(i.type)), inner = new Set(dispoExtras(sel).map((i) => i.id));
    for (const p of sel) if (D.isBack(p)) for (const o of D.contained(S.model.items, p)) inner.add(o.id);
    return sel.filter((i) => !inner.has(i.id));
  }
  function alignSelected(mode) {
    const t = alignTargets(), moves = D.alignMoves(t.map(D.itemBBox), mode);
    const carried = t.map((it) => (D.isBack(it) ? D.contained(S.model.items, it) : []));
    change(() => t.forEach((it, i) => { const [dx, dy] = moves[i]; if (dx || dy) [it, ...carried[i]].forEach((o) => moveItem(o, dx, dy)); }), { panel: false });
  }
  function addAutoRails(plate, n, pitch) {
    if (!plate || plate.type !== "plate") return;
    if (!D.fitsRails(plate, n, pitch)) { toast(`Die Platte ist für ${n} Schienen à ${pitch} mm zu niedrig.`, "error"); return; }
    if (D.contained(S.model.items, plate).some((i) => i.type === "rail")) { toast("In dieser Platte liegen schon Schienen.", "error"); return; }
    change(() => { S.model.items.push(...D.autoRails(plate, n, pitch, nextId)); });
  }

  // Disposition als Ansicht mit Massstab auf ein Schemablatt legen (Momentaufnahme)
  async function handOver() {
    const src = S.model;
    if (src.kind !== "dispo") return;
    setTool("select");
    const o = D.planOpts(src), dimsOn = o.dims, dimP = src.dimP ?? D.DIM_PAPER;
    const bbAt = (den) => D.contentBBox(src.items, { ...o, dimH: dimP * den }); // Masstext in mm Papier (Fenster „Ansicht“), wächst mit dem Massstab
    const bb = bbAt(1);
    if (!bb) { toast("Die Disposition ist leer. Es gibt nichts zu übergeben.", "error"); return; }
    const targets = S.doc.sheets.map((sh, i) => [i, sh]).filter(([, sh]) => !sh.kind); // nur Schemablätter (nicht Titelseite, Inhalt, Stringplan)
    const sz = (d) => { const b = bbAt(d); return { w: round3(b.x1 - b.x0), h: round3(b.y1 - b.y0) }; };
    const FIT = { w: 265, h: 165 }; // nutzbarer Platz im Blattrahmen in mm (neues Blatt ohne Grundverkabelung, CJ 16.10.)
    const fits = (d) => sz(d).w / d <= FIT.w && sz(d).h / d <= FIT.h;
    const best = DENS.find(fits) ?? DENS.at(-1);
    const old = (i) => S.doc.sheets[i].items.find((it) => it.type === "dispoview" && it.src === src.sid);
    const r = await formDialog("An Schema übergeben", `Die Disposition (${Math.round(sz(1).w)} × ${Math.round(sz(1).h)} mm${dimsOn ? " mit Bemassung" : ""}) wird als Ansicht mit Massstab auf das Schemablatt gelegt. Spätere Änderungen erscheinen dort erst nach erneutem Übergeben.`, [
      { label: "Schemablatt", value: targets.length ? String(targets[0][0]) : "new", options: [...targets.map(([i, sh]) => [String(i), sheetLabel(sh, i) + (old(i) ? " (bestehende Ansicht wird ersetzt)" : "")]), ["new", "Neues Blatt (ohne Grundverkabelung, grösserer Massstab möglich)"]] },
      { label: "Massstab", value: String(best), options: DENS.map((d) => [String(d), `1:${d}  →  ${Math.round(sz(d).w / d)} × ${Math.round(sz(d).h / d)} mm auf dem Blatt${fits(d) ? "" : " (zu gross für den Rahmen)"}`]) },
      { label: "Blattnummer (nur für neues Blatt)", value: nextSheetNo() },
    ], "Übergeben");
    if (!r) return;
    const den = Number(r[1]), k0 = S.model.kind;
    let ti = Number(r[0]);
    const b2 = bbAt(den), bw = round3(b2.x1 - b2.x0), bh = round3(b2.y1 - b2.y0);
    change(() => {
      if (r[0] === "new") { S.doc.sheets.push(makeSheet(r[2].trim() || nextSheetNo(), { base: false })); ti = S.doc.sheets.length - 1; }
      const sh = S.doc.sheets[ti], prev = old(ti);
      const g = 2.5;
      const x = prev ? prev.x : Math.max(12, round3(Math.round((148.5 - bw / den / 2) / g) * g));
      const y = prev ? prev.y : Math.max(28, round3(Math.round((112.5 - bh / den / 2) / g) * g));
      const v = { id: prev ? prev.id : nextId(), type: "dispoview", x, y, den, bx: b2.x0, by: b2.y0, bw, bh, ...(dimsOn ? { dims: true } : {}), ...(src.doors === false ? { doors: false } : {}), dimP, ...(o.off.length ? { off: [...o.off] } : {}), title: src.meta.TITEL || "Disposition", src: src.sid, items: JSON.parse(JSON.stringify(src.items)) };
      if (prev) Object.assign(prev, v); else sh.items.push(v);
      S.active = ti; S.sel = new Set([v.id]);
    });
    afterSheetChange(k0);
    toast("Disposition auf das Schemablatt übergeben.");
  }

  function symButton(sym, thumb, name, sub) {
    const on = S.tool === "place" && S.placeSym === sym;
    return `<button class="sym" data-sym="${sym}" aria-pressed="${on}"><span class="thumb">${thumb}</span><span><span class="name">${R.esc(name)}</span><br><span class="sub">${R.esc(sub)}</span></span></button>`;
  }
  const partButton = (id) => { const pr = K.PART_PRESET_BY_ID[id]; return symButton("D:PART:" + id, D.itemThumb({ id: 0, ...K.newPart(id, 0, 0) }), K.presetName(pr), pr.sub); };
  function leftHTML() {
    let h = `<section class="section"><h2 class="section-title">Werkzeuge</h2>`;
    for (const t of [...TOOLS.filter((t) => t.id !== "wire"), DIM_TOOL]) h += `<button class="tool" data-tool="${t.id}" aria-pressed="${S.tool === t.id}">${R.icons[t.icon]}<span>${t.label}</span><span class="key">${t.key}</span></button>`;
    h += `</section><section class="section"><h2 class="section-title">Bauteile</h2>`;
    h += symButton("D:PLATE:zaehler", D.thumbSVG("plate"), "Zählerplatte", "250 × 400 mm, fest");
    h += symButton("D:PLATE:frei", D.thumbSVG("plate"), "Montageplatte", "Masse frei einstellbar");
    h += symButton("D:RAIL", D.thumbSVG("rail"), "DIN-Schiene", "TH35, frei platzierbar");
    h += symButton("D:RAILF", D.thumbSVG("rail"), "DIN-Schiene frei", "für Abgangsklemmen, ohne Rand, Länge frei");
    for (const id of ["CALIP", "ABDECK", "EINF", "TW", "PTP", "KASTEN", "RAB", "PKTXT"]) h += partButton(id);
    h += `</section><section class="section"><h2 class="section-title">Zählerplatte</h2>`;
    for (const id of ["ZBOX", "RSE", "ZFE", "ZKL", "PKZ", "SPF"]) h += partButton(id);
    h += `</section><section class="section"><h2 class="section-title">Schrank</h2>`;
    for (const [m, c] of Object.entries(K.CAB_MAKERS)) h += symButton("D:CAB:" + m, D.itemThumb(K.newCabinet(0, 0, m)), c.name, m === "rittal" ? "Felder, Türen, Sockel, Masse frei" : m === "saa" ? "Katalogmasse offen, Masse frei" : "alle Masse frei");
    h += `</section><section class="section"><h2 class="section-title">Geräte (Hutschiene)</h2>`;
    for (const p of D.DEVICE_PRESETS) h += symButton("D:DEV:" + p.id, D.itemThumb({ id: 0, ...newDispoItem("D:DEV:" + p.id, 0, 0) }), p.label, p.sub);
    h += `</section><section class="section"><h2 class="section-title">Leistungsteil</h2>`;
    for (const id of ["NH000", "NH00", "NH1", "NH2", "NHSILAS", "NHVG", "NHABD", "NT", "NTA", "SSW", "WKL"]) h += partButton(id);
    h += `</section><section class="section"><h2 class="section-title">Vertigroup mit Wandler</h2>`;
    for (const id of ["VGW00", "VGW1"]) h += partButton(id);
    h += `</section><section class="section"><h2 class="section-title">Schienen und Zuleitung</h2>`;
    for (const id of ["BAR_N", "BAR_PE", "BAR_PEN"]) { const pr = K.PART_PRESET_BY_ID[id]; h += symButton("D:BAR:" + pr.p.c, D.itemThumb({ id: 0, ...K.newPart(id, 0, 0) }), pr.name, pr.sub); }
    h += symButton("D:CABLE", D.itemThumb({ id: 0, type: "cable", pts: [[0, 0], [0, 120], [80, 160]], s: "" }), "Zuleitung VNB", "Leitung mit Text, Klicks setzen Punkte");
    h += symButton("D:TPL:AUEU", D.itemThumb(aueuItems(0, 0).map((it, i) => ({ id: i, ...it }))), "Systemauftrennung AÜU", "Vorlage: PEN unten, N oben über NT, PE rechts");
    return h + "</section>";
  }

  // ---------- Schrank und Teile: Eigenschaften ----------
  const selField = (label, key, val, opts) => `<div class="field"><label>${R.esc(label)}</label><select data-dp="${key}">${opts.map(([v, t]) => `<option value="${R.esc(v)}"${String(v) === String(val) ? " selected" : ""}>${R.esc(t)}</option>`).join("")}</select></div>`;
  const check = (key, on, label) => `<label class="check"><input type="checkbox" data-dp="${key}"${on ? " checked" : ""}> ${R.esc(label)}</label>`;
  const listField = (label, key, val, list) => { const id = "dl" + key.replace(/\W/g, ""); return `<div class="field"><label>${R.esc(label)}</label><input type="number" data-dp="${key}" value="${val}" min="1" step="5" list="${id}"><datalist id="${id}">${list.map((v) => `<option value="${v}">`).join("")}</datalist></div>`; };
  function cabPanel(c) {
    const m = K.CAB_MAKERS[c.maker] || K.CAB_MAKERS.frei, W = K.cabW(c);
    let h = head(c.name || m.name, `aussen ${W} × ${c.h} mm, Sockel ${c.plinth}, Tiefe ${c.depth}`)
      + selField("Typ", "maker", c.maker, Object.entries(K.CAB_MAKERS).map(([k, v]) => [k, v.name]))
      + (c.maker === "saa" ? `<p class="note">SAA: Katalogmasse nicht gefunden (offen), Masse frei eingeben.</p>` : c.maker === "rittal" ? `<p class="note">Vorschläge aus dem Katalog im Feld (Pfeil), jede Zahl erlaubt.</p>` : "")
      + fieldHTML("Bezeichnung (über dem Schrank)", 'data-dp="name"', c.name) + fieldHTML("Schutzart (Text)", 'data-dp="ip"', c.ip)
      + listField("Höhe ohne Sockel (mm)", "h", c.h, m.heights) + listField("Tiefe (mm)", "depth", c.depth, m.depths)
      + selField("Sockel", "plinth", c.plinth, [...new Set([...K.PLINTHS, c.plinth])].map((v) => [v, v ? v + " mm" : "ohne"]))
      + numField("Seitenwand (mm)", "side", c.side, { min: 0 })
      + head("Felder", "Breite innen, Gesamtmass = Felder + 2 Seitenwände");
    c.fields.forEach((f, i) => {
      h += `<div class="field"><label>Feld ${i + 1}: Breite (mm)</label><input type="number" data-dp="f:${i}:w" value="${f.w}" min="1" step="50" list="dlcabw"></div>`
        + `<div class="row">${selField("Türanschlag", `f:${i}:door`, f.door, Object.entries(K.DOORS))}${c.fields.length > 1 ? `<button class="btn outline small" data-act="cabdel" data-i="${i}">Feld löschen</button>` : ""}</div>`
        + fieldHTML(`Feld ${i + 1}: Titel (optional)`, `data-dp="f:${i}:t"`, f.t);
    });
    h += `<datalist id="dlcabw">${m.widths.map((v) => `<option value="${v}">`).join("")}</datalist>`
      + `<div class="row"><button class="btn outline small" data-act="cabadd">Feld anfügen</button><button class="btn outline small" data-act="cabplates" title="Je Feld eine Montageplatte mit 25 mm Rand">Montageplatten einsetzen</button></div>`
      + tfField(c) + numField("Position X (links aussen)", "x", c.x, { step: 5 }) + numField("Position Y (Unterkante Schrank, über dem Sockel)", "y", c.y, { step: 5 }) + dupDel();
    return h;
  }
  // Beschriftung und BMK eines Betriebsmittels (CJ 16.10.2026): aussen gestapelt, Beschriftung näher am Bauteil
  const labFields = (it, where) => fieldHTML(`Beschriftung (frei, ${where})`, 'data-dp="beschr"', it.beschr ?? "") + fieldHTML(`Betriebsmittel (BMK, ${where})`, 'data-dp="bmk"', it.bmk ?? "");
  function cablePanel(c) {
    return head("Zuleitung", `${c.pts.length - 1} Abschnitt${c.pts.length === 2 ? "" : "e"}`) + fieldHTML("Text (am längsten Abschnitt)", 'data-dp="s"', c.s) + tfField(c)
      + `<p class="note">Neu zeichnen: Zuleitung VNB links in der Leiste, Klicks setzen Punkte, Enter oder Klick auf den letzten Punkt beendet.</p>` + dupDel();
  }
  // Textgrösse pro Bauteil (CJ 16.10.): Prozent der bisherigen Grösse, gespeichert als Faktor tf. Texte aussen: 100 % = 10 mm (16.10.2026)
  const tfField = (it) => numField("Textgrösse (%, 100 = Vorgabe)", "tfp", Math.round((it.tf ?? 1) * 100), { min: 10, step: 10 });
  // Mehrzeiliger Text: je Zeile ein Feld (CJ 16.10., ersetzt „|“)
  function linesHTML(p) {
    const ls = K.textLines(p);
    let h = `<div class="field"><label>Text, je Zeile ein Feld</label></div>`;
    ls.forEach((t, i) => { h += `<div class="row line-row"><input type="text" data-dp="ln:${i}" value="${R.esc(t)}" aria-label="Zeile ${i + 1}">${ls.length > 1 ? `<button class="btn outline small" data-act="dplinedel" data-i="${i}" title="Zeile ${i + 1} entfernen" aria-label="Zeile ${i + 1} entfernen">×</button>` : ""}</div>`; });
    return h + `<div class="row"><button class="btn outline small" data-act="dplineadd">Zeile hinzufügen</button></div>`;
  }
  function partPanel(p) {
    const k = p.kind, name = K.PART_KINDS[k].name;
    let h = head(k === "NH" && p.maker ? K.nhMaker(p).name : name, `${r1(p.w)} × ${r1(p.h)} mm`);
    if (k === "NH") h += selField("Hersteller", "maker", p.maker || "std", Object.entries(K.NH_MAKERS).map(([m, v]) => [m, v.name]))
      + selField(p.maker === "vertigroup" || p.maker === "vgw" ? "Typ" : "Grösse", "size", p.size, K.nhMaker(p).order.map((z) => [z, K.nhSizeName(p.maker, z) + `  (${K.nhMaker(p).sizes[z].w} × ${K.nhMaker(p).sizes[z].h} mm)`]))
      + (p.maker === "vgw" ? fieldHTML("Wandler (Verhältnis, z. B. 150/5)", 'data-dp="wr"', p.wr ?? "") + selField("Lage der Wandler", "wl", p.wl || "L123", Object.entries(K.WANDLER_LAGE).map(([v, l]) => [v, l.name])) : "")
      + (p.maker ? `<p class="note">Masse ${p.maker === "vgw" ? "aus Hager- und Weber-Katalog" : "aus den Weber-Massblättern"}${K.nhSize(p).d ? `, Tiefe ${K.nhSize(p).d} mm` : ""}${K.nhSize(p).pitch ? `, Polteilung ${K.nhSize(p).pitch} mm` : ""}.</p>` : "") + fieldHTML("Strom (über dem Trenner)", 'data-dp="s"', p.s ?? "") + fieldHTML("Abgang (unter dem Trenner)", 'data-dp="s2"', p.s2 ?? "");
    else if (k === "BAR") h += selField("Leiter", "c", p.c, Object.entries(K.BAR_KINDS)) + numField("Länge (mm)", p.w >= p.h ? "w" : "h", Math.max(p.w, p.h), { min: 1 }) + numField("Dicke (mm)", p.w >= p.h ? "h" : "w", Math.min(p.w, p.h), { min: 1 })
      + `<p class="note">Breiter als hoch = waagrecht. N-Trenner aus „Leistungsteil“ rasten mittig auf der Schiene ein.</p>`;
    else if (k === "NT") h += fieldHTML("Text nach Strom (z. B. NT 250 A, leer = nach Grösse)", 'data-dp="s"', p.s ?? "") + (p.s ? "" : selField("Grösse", "size", p.size, Object.keys(K.NT_SIZES).map((z) => [z, z])));
    else if (k === "SSW") h += numField("Anzahl Leiter", "n", p.n, { min: 1 }) + fieldHTML("Querschnitt (Text)", 'data-dp="s"', p.s ?? "") + check("ct", p.ct, "Stromwandler");
    else {
      if (K.LINE_KINDS.has(k)) h += linesHTML(p);
      else if (!["ABDECK", "WKL", "ZKL", "PKZ", "SPF"].includes(k)) h += fieldHTML("Text", 'data-dp="s"', p.s ?? "");
      if (k === "ZKL" || k === "SPF") h += numField(k === "ZKL" ? "Anzahl Klemmen" : "Anzahl Sicherungen", "n", p.n ?? 3, { min: 1 });
      if (k === "KASTEN") h += check("vert", p.vert, "Text senkrecht") + check("round", p.round, "Runde Ecken") + check("fill", p.fill, "Schwarz gefüllt");
      h += numField("Breite (mm)", "w", p.w, { min: 1 }) + numField("Höhe (mm)", "h", p.h, { min: 1 });
      if (k === "TW" || k === "PTP") h += `<p class="note">Höher als breit = senkrecht.</p>`;
    }
    if (K.BMK_KINDS.has(k)) h += labFields(p, ["ZBOX", "KASTEN", "ZKL"].includes(k) ? "darunter" : "darüber");
    return h + tfField(p) + numField("Position X (linke Kante)", "x", p.x, { step: 5 }) + numField("Position Y (Unterkante)", "y", p.y, { step: 5 }) + dupDel();
  }
  // Eingabe im Panel für Schrank, Teil und Gerät. Gibt true zurück, wenn hier erledigt.
  const BOOL = new Set(["round", "vert", "fill", "ct", "trenn", "haupt", "free"]);
  function applyDp(one, key, t) {
    if (key === "tfp") { const v = parseFloat(t.value); if (v > 0) { if (v === 100) delete one.tf; else one.tf = v / 100; } return true; }
    const ln = key.match(/^ln:(\d+)$/);
    if (ln && one.type === "part") { one.lines = [...K.textLines(one)]; one.lines[Number(ln[1])] = t.value; delete one.s; return true; }
    if (one.type === "part" && one.kind === "NH" && (key === "maker" || key === "size")) { // Strom folgt der Grösse, solange er nicht von Hand geändert ist
      const was = K.nhSize(one).amp ?? "";
      if (key === "maker") { if (t.value === "std") delete one.maker; else one.maker = t.value; if (!K.nhMaker(one).sizes[one.size]) one.size = K.nhDefault(one.maker); }
      else one.size = t.value;
      if ((one.s ?? "") === was) one.s = K.nhSize(one).amp ?? "";
      Object.assign(one, K.partSize(one)); return true;
    }
    const f = key.match(/^f:(\d+):(w|door|t)$/);
    if (f && one.type === "cabinet") {
      const fl = one.fields[Number(f[1])], v = f[2] === "w" ? parseFloat(t.value) : t.value;
      if (f[2] === "w" && !(v > 0)) return true;
      fl[f[2]] = v; return true;
    }
    if (BOOL.has(key)) { if (t.checked) one[key] = true; else delete one[key]; if (key === "free" && !t.checked) { const pl = plateAt(one.x + one.len / 2, one.y); if (pl) Object.assign(one, D.railClamp(one, pl)); } return true; }
    if (key === "beschr" || key === "wr") { if (t.value) one[key] = t.value; else delete one[key]; return true; }
    if (one.type === "cabinet" && ["plinth", "side", "depth"].includes(key)) { const v = parseFloat(t.value); if (v >= 0) one[key] = v; return true; }
    if (one.type === "device" && one.kind === "KL" && (key === "n" || key === "qs")) {
      const v = key === "n" ? Math.round(parseFloat(t.value)) : t.value;
      if (key === "n" && !(v >= 1)) return true;
      one[key] = v; Object.assign(one, D.klemmFit(one)); return true;
    }
    if (one.type === "device" && (key === "top" || key === "l2")) { if (t.value) one[key] = t.value; else delete one[key]; return true; }
    if (one.type === "part" && key === "n" && !["NH", "NT", "SSW"].includes(one.kind)) { const v = Math.round(parseFloat(t.value)); if (v >= 1) one.n = v; return true; }
    if (one.type === "part" && ["size", "s", "n"].includes(key) && ["NH", "NT", "SSW"].includes(one.kind)) {
      const v = key === "n" ? Math.round(parseFloat(t.value)) : t.value;
      if (key === "n" && !(v >= 1)) return true;
      one[key] = v; Object.assign(one, K.partSize(one)); return true;
    }
    return false;
  }
  // Knöpfe im Schrank-Panel
  function cabAct(act, b, c) {
    if (!c || c.type !== "cabinet") return;
    if (act === "cabadd") change(() => { c.fields.push({ w: c.fields.at(-1).w, door: "r", t: "" }); });
    else if (act === "cabdel") change(() => { c.fields.splice(Number(b.dataset.i), 1); });
    else if (act === "cabplates") {
      const xs = K.fieldXs(c), m = 25;
      change(() => { c.fields.forEach((f, i) => S.model.items.push({ id: nextId(), type: "plate", x: round3(xs[i] + m), y: round3(c.y + m), w: round3(f.w - 2 * m), h: round3(c.h - 2 * m), name: "" })); });
    }
  }

  const DENS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500]; // Massstäbe 1:n für die Ansicht auf dem Schemablatt
  const r1 = (n) => Math.round(n * 10) / 10;

  // Eigenschaften für die Disposition. Gibt null zurück, wenn das normale Schema-Panel zuständig ist.
  function dispoPanel(sel) {
    const one = sel.length === 1 ? sel[0] : null;
    if (one && one.type === "dispoview") {
      const srcOk = S.doc.sheets.some((sh) => sh.kind === "dispo" && sh.sid === one.src);
      return head("Disposition", `${one.title || "Ansicht"}, Massstab 1:${one.den}`)
        + `<div class="field"><label>Massstab</label><select data-dpden>${(DENS.includes(one.den) ? DENS : [...DENS, one.den]).map((d) => `<option value="${d}"${d === one.den ? " selected" : ""}>1:${d}</option>`).join("")}</select></div>`
        + `<label class="check"><input type="checkbox" data-dpdims${one.dims ? " checked" : ""}> Masse anzeigen</label>`
        + `<p class="note">Grösse auf dem Blatt: ${r1(one.bw / one.den)} × ${r1(one.bh / one.den)} mm.</p>`
        + numField("Position X (links)", "x", one.x, { step: 0.5 }) + numField("Position Y (unten)", "y", one.y, { step: 0.5 })
        + `<p class="note">Momentaufnahme: Änderungen an der Disposition erscheinen hier erst, wenn du sie erneut übergibst.</p>`
        + (srcOk ? `<div class="row"><button class="btn outline small" data-act="gosrc">Zur Disposition</button></div>` : "") + dupDel();
    }
    if (!isDispo()) return null;
    let h = "";
    if (one) {
      if (one.type === "plate") {
        const hasRails = D.contained(S.model.items, one).some((i) => i.type === "rail");
        const btn = (n, p) => `<button class="btn outline small" data-act="autorail" data-n="${n}" data-p="${p}"${D.fitsRails(one, n, p) && !hasRails ? "" : " disabled"}>${n} Schienen à ${p} mm</button>`;
        h += head(one.fixed ? "Zählerplatte" : "Montageplatte", `${one.w} × ${one.h} mm`)
          + fieldHTML("Bezeichnung", 'data-dp="name"', one.name)
          + numField("Breite (mm)", "w", one.w, { min: 1, dis: !!one.fixed }) + numField("Höhe (mm)", "h", one.h, { min: 1, dis: !!one.fixed })
          + tfField(one) + numField("Position X (linke Kante)", "x", one.x, { step: 5 }) + numField("Position Y (untere Kante)", "y", one.y, { step: 5 })
          + (one.fixed ? `<p class="note">Die Zählerplatte hat ein festes Mass.</p>` + head("Bestücken", "wie im Beispiel, danach frei verschieben")
            + `<div class="row"><button class="btn outline small" data-act="dpzaehler" title="Zähler mit Text und Klemmenreihe unten">Zähler einsetzen</button><button class="btn outline small" data-act="dpmessung" title="Prüfklemme und Sicherungen für den Spannungspfad">Messung einsetzen</button></div>` : "")
          + head("Schienen", `Mitte zu Mitte, ${D.RAIL_MARGIN} mm Rand zum Plattenrand ringsum`)
          + `<div class="row">${btn(2, 180)}${btn(3, 120)}</div>` + dupDel();
      } else if (one.type === "rail") {
        h += head(one.free ? "DIN-Schiene frei" : "DIN-Schiene", "TH35, Position = Mittellinie")
          + check("free", one.free, "Frei (nicht an Platte und 20-mm-Rand gebunden)")
          + numField("Länge (mm)", "len", one.len, { min: 1 }) + numField("Position X (Anfang)", "x", one.x, { step: 2.5 }) + numField("Position Y (Mittellinie)", "y", one.y, { step: 5 }) + dupDel();
      } else if (one.type === "cabinet") h += cabPanel(one);
      else if (one.type === "part") h += partPanel(one);
      else if (one.type === "cable") h += cablePanel(one);
      else if (one.type === "device") {
        const bad = D.deviceIssues(S.model.items).has(one.id), kl = one.kind === "KL";
        h += head(kl ? `Klemmenblock ${one.n}×${one.qs}` : one.label || D.PRESET_BY_ID[one.kind]?.label || "Gerät", `${r1(one.te)} TE = ${D.devW(one)} mm breit`)
          + labFields(one, "über dem Gerät")
          + (kl ? numField("Anzahl Klemmen", "n", one.n, { min: 1 }) + selField("Querschnitt (mm²)", "qs", one.qs, Object.keys(K.KL_PITCH).map((q) => [q, q]))
            + check("trenn", one.trenn, "Trennklemme") + check("haupt", one.haupt, "Hauptklemme (Rahmen)")
            : fieldHTML(one.kind === "DIAZED" ? "Text im Kreis (II = Grösse 2, leer = leerer Kreis)" : "Beschriftung im Gerät", 'data-dp="label"', one.label) + fieldHTML("Zweite Zeile (z. B. 30mA)", 'data-dp="l2"', one.l2 ?? ""))
          + fieldHTML("Text über dem Gerät (z. B. 40, FILS)", 'data-dp="top"', one.top ?? "")
          + (kl ? "" : numField("Breite in TE", "te", one.te, { step: 0.5, min: 0.5 })) + numField("Höhe (mm)", "h", one.h, { min: 1 }) + tfField(one)
          + numField("Position X (linke Kante)", "x", one.x, { step: 8.75 }) + numField("Position Y (Mitte)", "y", one.y, { step: 5 })
          + (bad ? `<p class="note">Rot umrandet: überlappt ein anderes Gerät oder ragt über das Schienenende.</p>` : "") + dupDel();
      } else h += textPanelHTML(one, true);
      return h;
    }
    if (!sel.length && S.dimSel) return head("Automatisches Mass", "aus der Bemassung, wird nicht gespeichert")
      + `<div class="row"><button class="btn outline small" data-act="dpdimoff">Ausblenden</button></div><p class="note">Entf blendet es ebenfalls aus. Wieder einblenden im Fenster „Ansicht“.</p>`;
    if (sel.length > 1) {
      const n = alignTargets().length, b = (m, label, title, min = 2) => `<button class="btn outline small" data-act="align" data-m="${m}" title="${title}"${n >= min ? "" : " disabled"}>${label}</button>`;
      return head(`${sel.length} Objekte`, "Mehrfachauswahl")
        + head("Ausrichten", "an der gemeinsamen Ausdehnung der Auswahl")
        + `<div class="row">${b("l", "Links", "Linke Kanten bündig")}${b("cx", "Mitte", "Senkrechte Mitten bündig")}${b("r", "Rechts", "Rechte Kanten bündig")}</div>`
        + `<div class="row">${b("b", "Unten", "Unterkanten bündig")}${b("cy", "Mitte", "Waagrechte Mitten bündig")}${b("t", "Oben", "Oberkanten bündig")}</div>`
        + head("Verteilen", "gleiche Abstände, äussere Teile bleiben (ab 3 Teilen)")
        + `<div class="row">${b("dh", "Waagrecht", "Gleiche Abstände von links nach rechts", 3)}${b("dv", "Senkrecht", "Gleiche Abstände von unten nach oben", 3)}</div>`
        + (n < sel.filter((i) => D.PLAN_TYPES.has(i.type)).length ? `<p class="note">Teile in einer gewählten Platte wandern mit der Platte.</p>` : "") + dupDel();
    }
    const np = (label, key, opt = {}) => numField(label, key, S.dp[key], { attr: "data-dpnew", min: 1, ...opt });
    const sym = S.tool === "place" ? S.placeSym : null;
    if (sym === "D:PLATE:frei") h += head("Neue Montageplatte") + np("Breite (mm)", "plateW") + np("Höhe (mm)", "plateH") + `<p class="note">Klick setzt die Ecke ${cornerName(corner)}, Tab wechselt die Ecke, Shift+Tab zurück.</p>`;
    else if (sym === "D:PLATE:zaehler") h += head("Neue Zählerplatte") + `<p class="note">250 × 400 mm, festes Mass. Klick setzt die Ecke ${cornerName(corner)}, Tab wechselt die Ecke, Shift+Tab zurück.</p>`;
    else if (sym && /^D:(CAB|PART):/.test(sym)) h += head(sym.startsWith("D:CAB:") ? "Neuer Schrank" : "Neues Bauteil") + `<p class="note">Klick setzt die Ecke ${cornerName(corner)}${sym.startsWith("D:CAB:") ? " (mit Sockel)" : ""}, Tab wechselt die Ecke. Masse danach rechts ändern.</p>`;
    else if (sym && MULTI.test(sym)) h += head(sym === "D:CABLE" ? "Neue Zuleitung" : sym === "D:TPL:AUEU" ? "Vorlage Systemauftrennung AÜU" : "Neue " + K.BAR_KINDS[sym.slice(6)])
      + `<p class="note">${sym === "D:CABLE" ? "Klicks setzen Punkte. Enter, Esc oder ein Klick auf den letzten Punkt beendet." : sym === "D:TPL:AUEU" ? "Klick setzt den PEN-Anschluss unten. PEN mit Zuleitung von unten, N oben über den N-Trenner, PE rechts oben. Danach jedes Teil einzeln verschiebbar." : "Erster Klick Anfang, zweiter Klick Ende (waagrecht oder senkrecht). Esc bricht ab."}</p>`;
    else if (sym === "D:RAILF") h += head("Neue freie Schiene") + np("Länge (mm)", "railLen") + `<p class="note">Ohne Rand und nicht an die Platte gebunden, Klemmen rasten wie auf jeder Schiene ein.</p>`;
    else if (sym === "D:RAIL") h += head("Neue Schiene") + np("Länge (mm)", "railLen") + `<p class="note">Innerhalb einer Platte nimmt die Schiene deren Breite, links und rechts bleiben 20 mm Rand.</p>`;
    else if (sym && sym.startsWith("D:DEV:")) {
      h += head("Neues Gerät") + np("Höhe (mm)", "devH") + `<p class="note">83 mm gilt für den Hager MCN110. Andere Geräte (FI, Schütz) sind höher: Höhe pro Gerät anpassen.</p>`;
      if (sym === "D:DEV:FREI") h += np("Breite in TE", "freeTE", { step: 0.5, min: 0.5 }) + fieldHTML("Beschriftung", 'data-dpnew="freeLabel"', S.dp.freeLabel);
    } else if (S.tool === "text") h += head("Neuer Text") + np("Texthöhe in mm", "textH");
    else if (S.tool === "dim") h += head("Bemassung") + `<p class="note">Zwei Punkte klicken, dann die Lage der Masslinie. Zwischen den Punkten gezogen = waagrecht bzw. senkrecht. Fängt Ecken, Kantenmitten und Kanten, Alt = frei. Esc bricht ab.</p>`;
    h += head("Disposition", S.model.meta.TITEL || "Verteileraufbau, Einheit mm") + `<p class="note">${S.model.items.filter((i) => i.type === "plate").length} Platten, ${S.model.items.filter((i) => i.type === "device").length} Geräte. Schriftfeld und „An Schema“ oben.</p>`;
    h += `<div class="row"><button class="btn outline small" data-act="dupsheet" title="Blatt kopieren, die Kopie ist unabhängig">${R.icons.copy.replace("<svg", '<svg width="16" height="16"')}Blatt duplizieren</button><button class="btn outline small danger" data-act="delsheet"${S.doc.sheets.length < 2 ? " disabled" : ""}>${R.icons.trash.replace("<svg", '<svg width="16" height="16"')}Blatt löschen</button></div>`;
    return h;
  }

  // ---------- Werkzeug Bemassung (CJ 16.10.) ----------
  // S.dimDraft: { p1, p2 } während des Setzens. Drei Klicks: Punkt 1, Punkt 2, Lage der Masslinie.
  function dimDown() {
    const c = S.mouse;
    if (!c) return;
    const d = S.dimDraft;
    if (!d) S.dimDraft = { p1: { x: c.x, y: c.y } };
    else if (!d.p2) { if (Math.hypot(c.x - d.p1.x, c.y - d.p1.y) > 1e-6) d.p2 = { x: c.x, y: c.y }; }
    else {
      const it = D.makeDim(d.p1, d.p2, c);
      S.dimDraft = null;
      if (it) { if (S.model.dims === false) delete S.model.dims; addDispoItem(it); return; } // gesetztes Mass soll sichtbar sein
    }
  }
  const dimCancel = () => { if (!S.dimDraft) return false; S.dimDraft = null; return true; };
  function dimOverlay() {
    let s = "";
    const h = D.planOpts(S.model).dimH, k = 7 / S.view.z;
    if (S.tool === "dim" && S.mouse) {
      const m = S.mouse, d = S.dimDraft;
      if (m.k && m.k !== "free") s += m.k === "edge" ? `<circle class="dp-snap" cx="${m.x}" cy="${m.y}" r="${k / 2}"/>` : `<rect class="dp-snap" x="${m.x - k / 2}" y="${m.y - k / 2}" width="${k}" height="${k}"/>`;
      if (d && !d.p2) s += `<line class="dp-guide" x1="${d.p1.x}" y1="${d.p1.y}" x2="${m.x}" y2="${m.y}" stroke-dasharray="${5 / S.view.z} ${4 / S.view.z}"/>`;
      if (d && d.p2) { const it = D.makeDim(d.p1, d.p2, m); if (it) s += D.primsSVG(D.dimItemPrims(it, h)); }
    }
    if (S.dimSel && S.tool === "select") { // gewähltes automatisches Mass hervorheben
      const ps = D.planPrims(S.model.items, { ...D.planOpts(S.model), dims: true }).filter((p) => p.dk === S.dimSel && p.k === "line");
      for (const p of ps) s += `<line class="dp-dimsel" x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke-width="6"/>`;
    }
    return s;
  }
  // Klick im Auswahlwerkzeug auf ein automatisches Mass: wählt es (Schlüssel in S.dimSel)
  function autoDimPick(x, y) {
    if (!isDispo() || S.model.dims === false) return null;
    return D.autoDimAt(S.model.items, D.planOpts(S.model), x, y, Math.max(1, 5 / S.view.z));
  }
  function hideDimSel() {
    if (!isDispo() || !S.dimSel) return false;
    const k = S.dimSel; S.dimSel = null;
    change(() => { S.model.dimsOff = [...new Set([...(S.model.dimsOff || []), k])]; });
    return true;
  }
  // Zählerplatte bestücken: Lagen aus dem Beispiel (Platte 250 × 400), danach frei verschiebbar
  function fillMeter(plate, kind) {
    if (!plate || plate.type !== "plate") return;
    const at = (id, dx, dy) => ({ id: nextId(), ...K.newPart(id, round3(plate.x + dx), round3(plate.y + dy)) });
    change(() => {
      if (kind === "zaehler") S.model.items.push(at("ZBOX", 40, 155), at("ZKL", 10, 40));
      else S.model.items.push(at("PKZ", 20, 275), at("SPF", 55, 75));
    });
  }
  function dispoAct(act, b) {
    const one = selectedItems()[0];
    if ((act === "dplineadd" || act === "dplinedel") && one?.type === "part") {
      change(() => { one.lines = [...K.textLines(one)]; delete one.s; if (act === "dplineadd") one.lines.push(""); else one.lines.splice(Number(b.dataset.i), 1); });
      if (act === "dplineadd") document.getElementById("right")?.querySelector(`[data-dp="ln:${one.lines.length - 1}"]`)?.focus();
      return;
    }
    if (act === "dpzaehler" || act === "dpmessung") fillMeter(one, act === "dpzaehler" ? "zaehler" : "messung");
    else if (act === "dpdimoff") hideDimSel();
    else if (act === "dpdimson") change(() => { delete S.model.dimsOff; }, { panel: false });
  }
  // Fenster „Ansicht“ der Disposition
  function ansichtHTML() {
    const o = D.planOpts(S.model), n = o.off.length;
    return head("Ansicht", "Gilt für diese Disposition, wird gespeichert. Ausgeblendetes fehlt auch in DXF, PDF und „An Schema“.")
      + `<label class="check"><input type="checkbox" data-dpview="dims"${o.dims ? " checked" : ""}> Bemassung (Taste Y)</label>`
      + `<label class="check"><input type="checkbox" data-dpview="doors"${o.doors ? " checked" : ""}> Türen (Bänder, Griffe)</label>`
      + `<div class="row"><div class="field"><label>Masstext im Plan (mm)</label><input type="number" data-dpnum="dimH" value="${o.dimH}" min="1" max="50" step="0.5"></div>`
      + `<div class="field"><label>auf dem Schema (mm Papier)</label><input type="number" data-dpnum="dimP" value="${S.model.dimP ?? D.DIM_PAPER}" min="${D.MIN_TEXT}" max="5" step="0.1"></div></div>`
      + `<p class="note">Pfeile und Abstände wachsen mit. Im Plan gilt für Bildschirm, PDF und DXF (1:1), auf dem Schema für „An Schema“.</p>`
      + (n ? `<div class="row"><button class="btn outline small" data-act="dpdimson">${n} ausgeblendete${n > 1 ? "" : "s"} Mass${n > 1 ? "e" : ""} einblenden</button></div>` : "");
  }
  function setDimNum(key, v) {
    const lim = key === "dimH" ? [1, 50] : [D.MIN_TEXT, 5];
    if (!(v >= lim[0] && v <= lim[1])) return false;
    if (v === (key === "dimH" ? D.planOpts(S.model).dimH : S.model.dimP ?? D.DIM_PAPER)) return true; // unverändert: kein Rückgängig-Schritt
    change(() => { if (key === "dimH" && v === D.DIM_PLAN) delete S.model.dimH; else S.model[key] = v; }, { panel: false });
    return true;
  }

  const draftCancel = () => { if (!S.dpDraft) return false; S.dpDraft = null; return true; };
  const draftEsc = () => (S.dpDraft?.sym === "D:CABLE" && S.dpDraft.pts.length >= 2 ? draftFinish() : draftCancel());
  return { placeDown, placeGhost, draftFinish, draftEsc, draftCancel, dimDown, dimCancel, dimOverlay, autoDimPick, hideDimSel, dispoAct, ansichtHTML, setDimNum, applyDp, cabAct, cornerKey, plateCorner, newDispoItem, plateAt, guideSnap, edgesX, edgesY, dispoSnap, addDispoItem, dispoExtras, setPlateW, handleItem, handleAt, HANDLE_CURSOR, dragHandle, applyMass, massAt, alignSelected, addAutoRails, handOver, leftHTML, dispoPanel };
}
