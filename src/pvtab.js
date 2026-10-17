// Stringübersicht (Modul PV-Strings, Schritt 6): ein Blatt (kind "pvtab") für alle Stringpläne der Datei (CJ 14.10.), ohne eigene Objekte.
// Inhalt wird beim Zeichnen aus den Strings berechnet (pv.js stringReport). Rechts: Tmin, Zuordnung WR-Nummer → WR-Typ, WR-Katalog.
// Tabelle in Papier-mm (1:1), y nach oben, oben links bei (0, 0). Druck (Schritt 7): A4 quer mit Plankopf, über mehrere Seiten (tablePages).
import * as P from "./pv.js";
import * as R from "./render.js";

const COLS = [ // Bezeichnung, Breite in mm, Wert, rechtsbündig
  ["Plan", 30, (r, doc) => `Stringplan ${doc.sheets[r.si].meta?.BLATT || r.si + 1}`],
  ["String", 18, (r) => r.name],
  ["Module", 14, (r) => String(r.n), true],
  ["Modultyp", 42, (r) => r.types.join(", ") || "–"],
  ["Voc STC", 20, (r) => (r.voc === null ? "–" : `${P.fmtNum(r.voc)} V`), true],
  ["Voc bei Tmin", 22, (r) => (r.vt === null ? "–" : `${P.fmtNum(r.vt)} V`), true],
  ["WR-Eingang", 30, (r) => `WR ${r.wr}, MPPT ${r.mppt}`],
  ["Vmax", 17, (r) => (r.inv ? `${P.fmtNum(r.inv.vmax, 0)} V` : "–"), true],
  ["Prüfhinweis", 84, null],
];
export const WIDTH = COLS.reduce((a, c) => a + c[1], 0); // 277 mm = A4 quer mit Rand
const COLOR = { ok: "#1b7a3a", warn: "#b45309", bad: "#b42318", info: "#6b7785" };
const FS = 2.5, LH = 3.6, PAD = 1.4, HEAD_H = 7; // Schrift, Zeilenabstand, Rand, Kopfzeile in mm
const rowH = (r) => 2 * PAD + (1 + r.notes.length) * LH;
// Text kürzen, damit er in die Spalte passt (Breite je Zeichen etwa 0,55 × Schrifthöhe)
const clip = (s, w, h = FS) => (s.length * 0.55 * h <= w - 2 ? s : s.slice(0, Math.max(1, Math.floor((w - 2) / (0.55 * h)) - 1)) + "…");
const txt = (x, y, s, { h = FS, w = 400, anchor = "start", fill = "#17212b", bold = false, cls = "" } = {}) =>
  `<text${cls ? ` class="${cls}"` : ""} x="${R.f(x)}" y="${R.f(-y)}" transform="scale(1 -1)" font-size="${h}"${bold ? ' font-weight="600"' : ""} text-anchor="${anchor}" fill="${fill}" style="font-family:var(--sheet-font)">${R.esc(clip(s, w, h))}</text>`;

const TOP = -26; // Oberkante der Tabelle
// Höhe des ganzen Inhalts in mm (für die Ansicht)
export function tableHeight(doc, rows = P.stringReport(doc)) {
  return -TOP + HEAD_H + (rows.length ? rows.reduce((a, r) => a + rowH(r), 0) : 8) + 12 + (P.wrNumbers(doc).length + 1) * LH;
}
export const bounds = (doc) => ({ x0: -10, y0: -tableHeight(doc) - 10, x1: WIDTH + 10, y1: 10 });

// Tabelle als SVG (Welt in mm). Zeile: class "pvtab-row", data-name, data-lvl.
export const tableSVG = (doc) => partSVG(doc, P.stringReport(doc));
// Druck (Schritt 7): Tabelle auf Seiten mit höchstens avail mm Höhe verteilen. Jede Seite mit Titel und Kopfzeile, WR-Liste und Hinweis auf der letzten.
export function tablePages(doc, avail) {
  const rows = P.stringReport(doc), base = -TOP + HEAD_H, tail = 12 + (P.wrNumbers(doc).length + 1) * LH, pages = [[]];
  let h = base;
  for (const r of rows) {
    if (pages.at(-1).length && h + rowH(r) > avail) { pages.push([]); h = base; }
    pages.at(-1).push(r); h += rowH(r);
  }
  if (rows.length && h + tail > avail && pages.at(-1).length > 1) pages.push([pages.at(-1).pop()]); // WR-Liste passt nicht mehr: letzte Zeile auf eine neue Seite
  return pages.map((part, i) => partSVG(doc, part, { empty: !rows.length, tail: i === pages.length - 1 }));
}
function partSVG(doc, rows, { empty = !rows.length, tail = true } = {}) {
  const tmin = doc.pv?.tmin;
  let s = txt(0, -7, "Stringübersicht", { h: 6, bold: true });
  s += txt(0, -14, `Alle Stringpläne der Datei · ${typeof tmin === "number" ? `Tmin ${P.fmtNum(tmin)} °C` : "Tmin fehlt (oben unter „Wechselrichter“ eingeben)"}`, { h: 3 });
  s += txt(0, -20, "Voc bei Tmin = Σ Voc × (1 + Tk/100 × (Tmin − 25 °C)), Tk in %/K. Knapp ab 95 % der Grenze.", { h: FS, fill: "#4a5562" });
  let y = TOP;
  s += `<rect x="0" y="${R.f(y - HEAD_H)}" width="${WIDTH}" height="${HEAD_H}" fill="#eef1f4" stroke="#17212b" stroke-width="0.25"/>`;
  let x = 0;
  for (const [label, w, , right] of COLS) { s += txt(right ? x + w - 1.5 : x + 1.5, y - HEAD_H / 2 - FS * 0.35, label, { w, anchor: right ? "end" : "start", bold: true }); x += w; }
  y -= HEAD_H;
  if (empty) {
    s += `<rect x="0" y="${R.f(y - 8)}" width="${WIDTH}" height="8" fill="none" stroke="#17212b" stroke-width="0.25"/>` + txt(1.5, y - 5, "Noch keine Strings. Strings auf einem Stringplan anlegen (Ebene Verkabelung, Werkzeug String).", { fill: "#6b7785" });
    y -= 8;
  }
  rows.forEach((r, i) => {
    const h = rowH(r), base = y - PAD - FS * 0.8;
    s += `<g class="pvtab-row" data-name="${R.esc(r.name)}" data-lvl="${r.lvl}"><rect x="0" y="${R.f(y - h)}" width="${WIDTH}" height="${R.f(h)}" fill="${i % 2 ? "#f7f8fa" : "#fff"}" stroke="#17212b" stroke-width="0.25"/>`;
    x = 0;
    for (const [label, w, val, right] of COLS) {
      if (val) s += txt(right ? x + w - 1.5 : x + (label === "String" ? 4.5 : 1.5), base, val(r, doc), { w: label === "String" ? w - 3 : w, anchor: right ? "end" : "start" });
      if (label === "String") s += `<rect x="${R.f(x + 1.5)}" y="${R.f(base - 0.2)}" width="2" height="2" fill="${P.stringColor(r.name)}"/>`;
      else if (!val) { // Prüfhinweis: Urteil, darunter die Gründe
        s += txt(x + 1.5, base, P.LEVEL_TEXT[r.lvl], { w, fill: COLOR[r.lvl], bold: true, cls: "pvtab-lvl" });
        r.notes.forEach((n, k) => { s += txt(x + 1.5, base - (k + 1) * LH, n.t, { w, fill: COLOR[n.lvl] }); });
      }
      x += w;
    }
    y -= h;
    s += "</g>";
  });
  x = 0;
  for (const [, w] of COLS.slice(0, -1)) { x += w; s += `<line x1="${x}" y1="${R.f(TOP)}" x2="${x}" y2="${R.f(y)}" stroke="#17212b" stroke-width="0.18"/>`; }
  if (!tail) return s;
  // Wechselrichter und Hinweis unter der Tabelle
  y -= 7;
  const its = new Map((doc.pv?.invTypes ?? []).map((t) => [t.id, t]));
  for (const nr of P.wrNumbers(doc)) { s += txt(0, y, `WR ${nr}: ${invLine(its.get(doc.pv?.wr?.[nr]))}`); y -= LH; }
  s += txt(0, y - 1, "Ergebnis nur als Hinweis, keine Freigabe. Geprüft: Spannung bei Tmin gegen Vmax und Systemspannung, Summe Isc × 1,25 je MPPT gegen Isc max, Summe Impp je MPPT gegen Impp max.", { fill: "#4a5562" });
  return s;
}
// WR-Typ als eine Zeile
export function invLine(t) {
  if (!t) return "kein Datenblatt zugeordnet";
  const v = (k, u, d = 0) => (t[k] ? `${P.fmtNum(t[k], d)} ${u}` : null);
  return [t.name, `Vmax ${v("vmax", "V")}`, t.vmppMin && t.vmppMax ? `MPP ${P.fmtNum(t.vmppMin, 0)}–${v("vmppMax", "V")}` : null, t.iscMax ? `Isc max ${v("iscMax", "A", 1)}` : null, t.imppMax ? `Impp max ${v("imppMax", "A", 1)}` : null, t.vstart ? `Start ${v("vstart", "V")}` : null, t.mppt ? `${t.mppt} MPPT` : null].filter(Boolean).join(", ");
}

// Hinweis Tmin (5at, CJ 15.10.): Werte nach NIN SN 411000 7.12.5.1.2.1.1 (Angabe CJ, von Claude nicht nachgelesen). Nur Hinweis, nichts erzwungen.
const TMIN_NOTE = `<p class="note pv-tmin-note">Tiefste Temperatur nach NIN SN 411000 7.12.5.1.2.1.1: bis 800 m ü. M. 0 °C (Neigung unter 15°) bzw. −5 °C (über 15°), über 800 bis 1500 m −15 °C, über 1500 m −25 °C. Abweichung nur mit Nachweis.</p>`;
// Bedienung (bekommt die Editor-Funktionen über pvedit.js)
export function makePvTab(c) {
  const { S, toast, change, formDialog, confirmDialog, pickFile } = c;
  const invTypes = () => S.doc.pv?.invTypes ?? [];
  const setPv = (fn) => change(() => { S.doc.pv ??= {}; fn(S.doc.pv); S.doc.pv = P.tidyPv(S.doc.pv); });

  async function editInv(t) {
    let vals = P.IT_FIELDS.map(([k]) => (t?.[k] === undefined ? "" : String(t[k]).replace(".", ",")));
    for (;;) {
      const r = await formDialog(t ? "WR-Typ ändern" : "Neuer WR-Typ", "Werte aus dem Datenblatt des Wechselrichters. Pflicht: Name und Vmax. MPP-Bereich und Startspannung werden erfasst, aber noch nicht geprüft.",
        P.IT_FIELDS.map(([, label, unit], i) => ({ label: unit ? `${label} in ${unit}` : label, value: vals[i] })), t ? "Übernehmen" : "Anlegen");
      if (!r) return;
      const res = P.typeFromForm(r, t?.id ?? "w" + c.nextId(), true);
      if (res.error) { toast(res.error, "error"); vals = r; continue; }
      setPv((pv) => { const list = (pv.invTypes ??= []), i = list.findIndex((x) => x.id === res.type.id); if (i >= 0) list[i] = res.type; else list.push(res.type); });
      return;
    }
  }
  async function deleteInv(id) {
    const nr = Object.keys(S.doc.pv?.wr ?? {}).find((k) => S.doc.pv.wr[k] === id);
    if (nr) { toast(`Dieser WR-Typ ist WR ${nr} zugeordnet. Zuerst die Zuordnung ändern.`, "error"); return; }
    const t = invTypes().find((x) => x.id === id);
    if (!t || !(await confirmDialog("WR-Typ löschen?", `„${t.name}“ wird aus dem Katalog dieser Datei entfernt.`, "Löschen"))) return;
    setPv((pv) => { pv.invTypes = pv.invTypes.filter((x) => x.id !== id); });
  }
  function saveCatalog() {
    if (!invTypes().length) { toast("Der WR-Katalog ist leer.", "error"); return; }
    c.download("WR-Katalog.schemacad-katalog.json", P.catalogText(invTypes(), "invTypes"), "application/octet-stream");
    toast("WR-Katalog in den Download-Ordner geladen.");
  }
  async function loadCatalog() {
    const file = await pickFile(".json,application/json");
    if (!file) return;
    let list;
    try { list = P.parseCatalog(await file.text(), "invTypes"); } catch (err) { toast(err.message, "error"); return; }
    addTypes(list);
  }
  const cloudCatalog = () => c.cloudMenu("inv_types", "WR-Katalog", () => invTypes().map(({ id: _, ...t }) => ({ name: t.name, data: t })),
    (datas) => addTypes(datas.map((t) => P.cleanInvType(t, "neu")).filter(Boolean)));
  function addTypes(list) {
    let n = 0;
    setPv((pv) => { n = P.mergeCatalog((pv.invTypes ??= []), list, () => "w" + c.nextId()); });
    toast(n ? `${n} WR-Typ${n > 1 ? "en" : ""} übernommen.` : "Keine neuen WR-Typen (gleiche Namen werden übersprungen).", n ? undefined : "error");
  }
  function action(el) {
    ({ itnew: () => editInv(null), itedit: () => editInv(invTypes().find((t) => t.id === el.dataset.it)), itdel: () => deleteInv(el.dataset.it), itcatsave: saveCatalog, itcatload: loadCatalog, itcatcloud: cloudCatalog })[el.dataset.pvact]?.();
  }
  // Rechts: Tmin (Text, Komma und − erlaubt, leer = keine Angabe) und Zuordnung WR-Nummer → WR-Typ
  function option(el) {
    if (el.dataset.pvopt === "tmin") {
      const v = el.value.trim().replace(",", ".").replace("−", "-"), n = Number(v);
      if (v !== "" && !(Number.isFinite(n) && n >= -60 && n <= 25)) { toast("Tmin in °C eingeben, z. B. −20 (zwischen −60 und 25).", "error"); c.renderRight(); return; }
      if ((v === "" ? undefined : n) !== S.doc.pv?.tmin) setPv((pv) => { if (v === "") delete pv.tmin; else pv.tmin = n; });
      return;
    }
    if (el.dataset.pvopt === "psize" || el.dataset.pvopt === "pquer") { // Papier der Stringübersicht (5ap), fehlt = A4 quer
      const cur = { size: "A4", quer: true, ...S.model.paper }, np = { ...cur, [el.dataset.pvopt === "psize" ? "size" : "quer"]: el.dataset.pvopt === "psize" ? el.value : el.value === "1" };
      if (np.size !== cur.size || np.quer !== cur.quer) change(() => { S.model.paper = { size: np.size, quer: np.quer }; });
      return;
    }
    if (el.dataset.pvopt === "wr") setPv((pv) => { pv.wr ??= {}; if (el.value) pv.wr[el.dataset.nr] = el.value; else delete pv.wr[el.dataset.nr]; });
  }

  const leftHTML = (TOOLS, toolBtn) => `<section class="section"><h2 class="section-title">Werkzeuge</h2>${TOOLS.filter((t) => t.id === "select" || t.id === "hand").map((t) => toolBtn(t.id, R.icons[t.icon], t.label, t.key)).join("")}</section>`
    + `<section class="section"><h2 class="section-title">Stringübersicht</h2><p class="note">Füllt sich automatisch aus den Strings aller Stringpläne. Tmin, Wechselrichter und Druck: oben in der Leiste.</p></section>`;
  // Teile für das Fenster Wechselrichter und Druck (UI Schritt 6 Teil 2, pvedit.js popHTML)
  const note = (t) => `<p class="note">${t}</p>`;
  const tminHTML = () => { const tmin = S.doc.pv?.tmin; return `<div class="field"><label>Tmin in °C (tiefste Modultemperatur)</label><input type="text" data-pvopt="tmin" value="${tmin === undefined ? "" : P.fmtNum(tmin)}" placeholder="z. B. −20" autocomplete="off" spellcheck="false"></div>` + note("Gilt für die ganze Datei. Kein Vorgabewert, bitte für den Standort eingeben.") + TMIN_NOTE; };
  // Datenblatt (WR-Typ) für WR-Nummer nr
  const wrSelect = (nr) => { const cur = S.doc.pv?.wr?.[nr] ?? ""; return `<select data-pvopt="wr" data-nr="${nr}" aria-label="WR ${nr}: Datenblatt"><option value="">(kein Datenblatt)</option>${invTypes().map((t) => `<option value="${R.esc(t.id)}"${t.id === cur ? " selected" : ""}>${R.esc(t.name)}</option>`).join("")}</select>`; };
  function invCatHTML() {
    const its = invTypes();
    let h = its.length ? "" : note("Noch kein WR-Typ. Werte aus dem Datenblatt des Wechselrichters.");
    for (const t of its) h += `<div class="libhead"><span>${R.esc(t.name)}<br><span class="note">${R.esc(invLine(t).slice(t.name.length + 2))}</span></span><span><button class="btn outline small" data-pvact="itedit" data-it="${R.esc(t.id)}">Ändern</button> <button class="btn outline small danger" data-pvact="itdel" data-it="${R.esc(t.id)}" aria-label="WR-Typ ${R.esc(t.name)} löschen">×</button></span></div>`;
    h += `<div class="row"><button class="btn outline small" data-pvact="itnew">Neuer WR-Typ</button><button class="btn outline small" data-pvact="itcatload">Katalog laden</button><button class="btn outline small" data-pvact="itcatsave"${its.length ? "" : " disabled"}>Katalog sichern</button><button class="btn outline small" data-pvact="itcatcloud" title="Datenblätter online laden oder speichern">Online</button></div>`;
    return h + note("Ergebnis der Prüfung nur als Hinweis, keine Freigabe.");
  }
  function paperHTML() {
    const pp = { size: "A4", quer: true, ...S.model.paper }, sel = (k, opts, cur, label) => `<div class="field"><label>${label}</label><select data-pvopt="${k}">${opts.map(([v, l]) => `<option value="${v}"${v === cur ? " selected" : ""}>${l}</option>`).join("")}</select></div>`;
    return sel("psize", Object.keys(P.PAPERS).map((k) => [k, `${k} (${P.PAPERS[k][0]} × ${P.PAPERS[k][1]} mm)`]), pp.size, "Papier") + sel("pquer", [["1", "quer"], ["0", "hoch"]], pp.quer ? "1" : "0", "Ausrichtung")
      + note(`Massstab 1:1, lange Tabellen auf mehreren Seiten (wie angezeigt).${P.printArea({ ...pp, den: 1 }).x1 - P.PRINT_M < WIDTH ? " Die Tabelle ist breiter als das Papier und wird verkleinert." : ""} Ausgeben: Exportieren → PDF alle Blätter.`);
  }
  // Rechts ohne Auswahl: nur Hinweis und Blatt löschen
  function panelHTML({ head }) {
    return head("Stringübersicht", "Alle Stringpläne der Datei") + note("Tmin, Wechselrichter und Druck: oben in der Leiste.")
      + `<div class="row pv-last"><button class="btn outline small danger" data-act="delsheet"${S.doc.sheets.length < 2 ? " disabled" : ""}>${R.icons.trash.replace("<svg", '<svg width="16" height="16"')}Blatt löschen</button></div>`;
  }
  const hint = () => (S.tool === "hand" ? "Ziehen verschiebt die Ansicht." : "Stringübersicht: füllt sich aus allen Stringplänen. Tmin und Wechselrichter oben unter „Wechselrichter“. Ergebnis nur als Hinweis, keine Freigabe.");
  return { action, option, leftHTML, panelHTML, hint, tminHTML, wrSelect, invCatHTML, paperHTML };
}
