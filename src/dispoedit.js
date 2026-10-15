// SchemaCAD: Disposition bearbeiten (Verteileraufbau): neue Bauteile, Fang und Hilfslinien, Griffe, Ausrichten, Übergabe ans Schema,
// linke Leiste und Eigenschaften. Rechnen und Zeichnen in dispo.js. Bekommt die Editor-Funktionen von app.js übergeben (wie files.js).
import * as D from "./dispo.js";
import * as R from "./render.js";
import { META_FIELDS } from "./frame.js";
import { toast, formDialog } from "./dialogs.js";
import { fieldHTML, head, numField, dupDel, textPanelHTML } from "./panel.js";

export function makeDispo({ S, TOOLS, round3, isDispo, selectedItems, nextId, snapBase, change, moveItem, setTool, afterSheetChange, sheetLabel, nextSheetNo, makeSheet }) {
  // ---------- Disposition: neue Bauteile und Fang ----------
  // Vorlage für ein neues Bauteil an Stelle (x, y). c ist der Fangpunkt (bei der Schiene optional mit Länge der Platte).
  function newDispoItem(sym, x, y, c = {}) {
    const dp = S.dp;
    if (sym === "D:PLATE:zaehler") { const p = D.PLATE_PRESETS.zaehler; return { type: "plate", x, y, w: p.w, h: p.h, name: p.name, fixed: true }; }
    if (sym === "D:PLATE:frei") return { type: "plate", x, y, w: dp.plateW, h: dp.plateH, name: D.PLATE_PRESETS.frei.name };
    if (sym === "D:RAIL") return { type: "rail", x, y, len: c.len ?? dp.railLen };
    const pr = D.PRESET_BY_ID[sym.slice("D:DEV:".length)], free = pr.id === "FREI";
    return { type: "device", x, y, te: free ? dp.freeTE : pr.te, h: dp.devH, kind: pr.id, label: free ? dp.freeLabel : pr.type, bmk: "" };
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
    const g = snapBase(wx, wy, false);
    if (S.tool !== "place" || !S.placeSym) return g;
    if (S.placeSym.startsWith("D:DEV:")) {
      const te = newDispoItem(S.placeSym, 0, 0).te, gs = S.grid.on ? S.grid.size : 0.1, left = wx - te * D.TE / 2;
      const r = D.snapDevice(S.model.items, left, wy, te);
      return r ? { x: r.x, y: r.y, rail: r.rail } : { x: round3(Math.round(left / gs) * gs), y: g.y };
    }
    const pl = S.placeSym === "D:RAIL" ? plateAt(wx, wy) : null, c = pl ? { ...D.railFit(pl), y: g.y } : g;
    const b = D.itemBBox(newDispoItem(S.placeSym, c.x, c.y, c)), k = guideSnap(b, pl ? [] : edgesX(b), edgesY(b), new Set());
    return { ...c, x: round3(c.x + k.dx), y: round3(c.y + k.dy) };
  }
  function addDispoItem(it) { change(() => { S.model.items.push({ id: nextId(), ...it }); }); }
  // Teile innerhalb gewählter Platten wandern mit der Platte (beim Verschieben, Kopieren, Duplizieren)
  function dispoExtras(items) {
    if (!isDispo()) return [];
    const have = new Set(items.map((i) => i.id)), out = new Map();
    for (const p of items) if (p.type === "plate") for (const o of D.contained(S.model.items, p)) if (!have.has(o.id)) out.set(o.id, o);
    return [...out.values()];
  }
  // Neue Plattenbreite: Schienen mit voller Länge wachsen mit (20 mm Rand), gekürzte bleiben, aber innerhalb des Randes. Die Höhe bleibt.
  function setPlateW(plate, w) {
    const rails = D.contained(S.model.items, plate).filter((i) => i.type === "rail").map((r) => ({ r, o: { ...r }, full: D.railIsFull(r, plate) }));
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
    Object.assign(d.it, D.resizePlate(d.orig, d.h, c.x, c.y));
    if (d.it.x !== d.orig.x || d.it.w !== d.orig.w) fitRails(d.rails, d.it);
  }
  // Eingetipptes Mass übernehmen (Doppelklick auf das Mass)
  function applyMass(it, key, v) {
    if (it.type === "rail") Object.assign(it, D.resizeRail(it, "e", it.x + v, plateAt(it.x + it.len / 2, it.y)));
    else if (key === "w") setPlateW(it, Math.max(D.MIN_PLATE, v));
    else it.h = Math.max(D.MIN_PLATE, v);
  }
  // Mass unter dem Zeiger: das der gewählten Platte oder Schiene, bei eingeschalteter Bemassung auch jede andere Platte
  function massAt(x, y) {
    if (!isDispo() || S.tool !== "select") return null;
    const tol = Math.max(D.DIM_H, 10 / S.view.z), sel = handleItem();
    const cands = [sel, ...(S.model.dims !== false ? S.model.items.filter((i) => i.type === "plate" && i !== sel) : [])].filter(Boolean);
    for (const it of cands) {
      const t = D.massTargets(it).find((m) => Math.abs((m.anchor === "lm" ? m.x + D.DIM_H : m.anchor === "rm" ? m.x - D.DIM_H : m.x) - x) <= tol * 1.5 && Math.abs(m.y - y) <= tol);
      if (t) return { it, ...t };
    }
    return null;
  }
  // Ausrichten und Verteilen: Bauteile der Auswahl. Was in einer gewählten Platte liegt, wandert mit der Platte.
  function alignTargets() {
    const sel = selectedItems().filter((i) => D.PLAN_TYPES.has(i.type)), inner = new Set(dispoExtras(sel).map((i) => i.id));
    for (const p of sel) if (p.type === "plate") for (const o of D.contained(S.model.items, p)) inner.add(o.id);
    return sel.filter((i) => !inner.has(i.id));
  }
  function alignSelected(mode) {
    const t = alignTargets(), moves = D.alignMoves(t.map(D.itemBBox), mode);
    const carried = t.map((it) => (it.type === "plate" ? D.contained(S.model.items, it) : []));
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
    const dimsOn = src.dims !== false;
    const bbAt = (den) => D.contentBBox(src.items, dimsOn, Math.max(D.DIM_H, D.MIN_TEXT * den)); // die Bemassung wächst mit dem Massstab
    const bb = bbAt(1);
    if (!bb) { toast("Die Disposition ist leer. Es gibt nichts zu übergeben.", "error"); return; }
    const targets = S.doc.sheets.map((sh, i) => [i, sh]).filter(([, sh]) => !sh.kind); // nur Schemablätter (nicht Titelseite, Inhalt, Stringplan)
    const sz = (d) => { const b = bbAt(d); return { w: round3(b.x1 - b.x0), h: round3(b.y1 - b.y0) }; };
    const FIT = { w: 260, h: 150 }; // nutzbarer Platz im Blattrahmen in mm
    const fits = (d) => sz(d).w / d <= FIT.w && sz(d).h / d <= FIT.h;
    const best = DENS.find(fits) ?? DENS.at(-1);
    const old = (i) => S.doc.sheets[i].items.find((it) => it.type === "dispoview" && it.src === src.sid);
    const r = await formDialog("An Schema übergeben", `Die Disposition (${Math.round(sz(1).w)} × ${Math.round(sz(1).h)} mm${dimsOn ? " mit Bemassung" : ""}) wird als Ansicht mit Massstab auf das Schemablatt gelegt. Spätere Änderungen erscheinen dort erst nach erneutem Übergeben.`, [
      { label: "Schemablatt", value: targets.length ? String(targets[0][0]) : "new", options: [...targets.map(([i, sh]) => [String(i), sheetLabel(sh, i) + (old(i) ? " (bestehende Ansicht wird ersetzt)" : "")]), ["new", "Neues Blatt"]] },
      { label: "Massstab", value: String(best), options: DENS.map((d) => [String(d), `1:${d}  →  ${Math.round(sz(d).w / d)} × ${Math.round(sz(d).h / d)} mm auf dem Blatt${fits(d) ? "" : " (zu gross für den Rahmen)"}`]) },
      { label: "Blattnummer (nur für neues Blatt)", value: nextSheetNo() },
    ], "Übergeben");
    if (!r) return;
    const den = Number(r[1]), k0 = S.model.kind;
    let ti = Number(r[0]);
    const b2 = bbAt(den), bw = round3(b2.x1 - b2.x0), bh = round3(b2.y1 - b2.y0);
    change(() => {
      if (r[0] === "new") { S.doc.sheets.push(makeSheet(r[2].trim() || nextSheetNo())); ti = S.doc.sheets.length - 1; }
      const sh = S.doc.sheets[ti], prev = old(ti);
      const g = 2.5;
      const x = prev ? prev.x : Math.max(12, round3(Math.round((148.5 - bw / den / 2) / g) * g));
      const y = prev ? prev.y : Math.max(28, round3(Math.round((112.5 - bh / den / 2) / g) * g));
      const v = { id: prev ? prev.id : nextId(), type: "dispoview", x, y, den, bx: b2.x0, by: b2.y0, bw, bh, ...(dimsOn ? { dims: true } : {}), title: src.meta.TITEL || "Disposition", src: src.sid, items: JSON.parse(JSON.stringify(src.items)) };
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
  function leftHTML() {
    let h = `<section class="section"><h2 class="section-title">Werkzeuge</h2>`;
    for (const t of TOOLS.filter((t) => t.id !== "wire")) h += `<button class="tool" data-tool="${t.id}" aria-pressed="${S.tool === t.id}">${R.icons[t.icon]}<span>${t.label}</span><span class="key">${t.key}</span></button>`;
    h += `</section><section class="section"><h2 class="section-title">Bauteile</h2>`;
    h += symButton("D:PLATE:zaehler", D.thumbSVG("plate"), "Zählerplatte", "250 × 400 mm, fest");
    h += symButton("D:PLATE:frei", D.thumbSVG("plate"), "Montageplatte", "Masse frei einstellbar");
    h += symButton("D:RAIL", D.thumbSVG("rail"), "DIN-Schiene", "TH35, frei platzierbar");
    h += `</section><section class="section"><h2 class="section-title">Geräte</h2>`;
    for (const p of D.DEVICE_PRESETS) h += symButton("D:DEV:" + p.id, D.thumbSVG("device", p.te), p.label, p.sub);
    return h + "</section>";
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
          + numField("Position X (linke Kante)", "x", one.x, { step: 5 }) + numField("Position Y (untere Kante)", "y", one.y, { step: 5 })
          + (one.fixed ? `<p class="note">Die Zählerplatte hat ein festes Mass.</p>` : "")
          + head("Schienen", `Mitte zu Mitte, ${D.RAIL_MARGIN} mm Rand zum Plattenrand ringsum`)
          + `<div class="row">${btn(2, 180)}${btn(3, 120)}</div>` + dupDel();
      } else if (one.type === "rail") {
        h += head("DIN-Schiene", "TH35, Position = Mittellinie")
          + numField("Länge (mm)", "len", one.len, { min: 1 }) + numField("Position X (Anfang)", "x", one.x, { step: 2.5 }) + numField("Position Y (Mittellinie)", "y", one.y, { step: 5 }) + dupDel();
      } else if (one.type === "device") {
        const bad = D.deviceIssues(S.model.items).has(one.id);
        h += head(one.label || "Gerät", `${one.te} TE = ${D.devW(one)} mm breit`)
          + fieldHTML("Betriebsmittel (BMK)", 'data-dp="bmk"', one.bmk) + fieldHTML("Beschriftung im Gerät", 'data-dp="label"', one.label)
          + numField("Breite in TE", "te", one.te, { step: 0.5, min: 0.5 }) + numField("Höhe (mm)", "h", one.h, { min: 1 })
          + numField("Position X (linke Kante)", "x", one.x, { step: 8.75 }) + numField("Position Y (Mitte)", "y", one.y, { step: 5 })
          + (bad ? `<p class="note">Rot umrandet: überlappt ein anderes Gerät oder ragt über das Schienenende.</p>` : "") + dupDel();
      } else h += textPanelHTML(one, true);
      return h;
    }
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
    if (sym === "D:PLATE:frei") h += head("Neue Montageplatte") + np("Breite (mm)", "plateW") + np("Höhe (mm)", "plateH");
    else if (sym === "D:PLATE:zaehler") h += head("Neue Zählerplatte") + `<p class="note">250 × 400 mm, festes Mass.</p>`;
    else if (sym === "D:RAIL") h += head("Neue Schiene") + np("Länge (mm)", "railLen") + `<p class="note">Innerhalb einer Platte nimmt die Schiene deren Breite, links und rechts bleiben 20 mm Rand.</p>`;
    else if (sym && sym.startsWith("D:DEV:")) {
      h += head("Neues Gerät") + np("Höhe (mm)", "devH") + `<p class="note">83 mm gilt für den Hager MCN110. Andere Geräte (FI, Schütz) sind höher: Höhe pro Gerät anpassen.</p>`;
      if (sym === "D:DEV:FREI") h += np("Breite in TE", "freeTE", { step: 0.5, min: 0.5 }) + fieldHTML("Beschriftung", 'data-dpnew="freeLabel"', S.dp.freeLabel);
    } else if (S.tool === "text") h += head("Neuer Text") + np("Texthöhe in mm", "textH");
    h += head("Disposition", "Verteileraufbau, Einheit mm");
    for (const f of META_FIELDS) if (["OBJEKT", "TITEL", "GEZEICHNET", "DATUM"].includes(f.tag)) h += fieldHTML(f.label, `data-meta="${f.tag}"`, S.model.meta[f.tag] ?? "");
    h += `<div class="row"><button class="btn outline small" data-act="handover">An Schema übergeben</button></div>`;
    h += `<div class="row"><button class="btn outline small danger" data-act="delsheet"${S.doc.sheets.length < 2 ? " disabled" : ""}>${R.icons.trash.replace("<svg", '<svg width="16" height="16"')}Blatt löschen</button></div>`;
    return h;
  }

  return { newDispoItem, plateAt, guideSnap, edgesX, edgesY, dispoSnap, addDispoItem, dispoExtras, setPlateW, handleItem, handleAt, HANDLE_CURSOR, dragHandle, applyMass, massAt, alignSelected, addAutoRails, handOver, leftHTML, dispoPanel };
}
