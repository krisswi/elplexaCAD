// Titelseite (Blatt 1) und Inhaltsverzeichnis (Blatt 2), Ausbau UI Schritt 3 (CJ 14.10.2026, siehe Entscheidungen).
// Beide sind Blätter (kind "title" und "toc") ohne Objekte, immer an Position 1 und 2. Die App fügt sie ein (ensureDeck),
// das Dateimodell (model.js) prüft nur. Projektangaben stehen auf der Titelseite und werden auf alle Blätter gespiegelt (syncDeck),
// so bleiben Schriftfeld, DXF und PDF der übrigen Blätter unverändert.
import { W, H, M_OUT, M_IN, TB_H } from "./frame.js";
import * as R from "./render.js";
import { cleanInfo, LEGEND_DEFAULT } from "./model.js";
export { cleanInfo };

export const DECK = new Set(["title", "toc", "legend"]); // ohne Zeichenobjekte, von der App verwaltet
export const isDeck = (sh) => DECK.has(sh?.kind);
export const PROJECT_FIELDS = ["OBJEKT", "AUFTRAG", "SCHEMA", "GEZEICHNET", "DATUM"]; // gelten für alle Blätter
export const INFO_FIELDS = [ // nur Titelseite. Firma merkt sich die App (CJ 14.10.)
  { key: "BAUHERR", label: "Bauherr" },
  { key: "BAUHERR_ADR", label: "Adresse Bauherr / Objekt", multi: true },
  { key: "FIRMA", label: "Firma", firm: true },
  { key: "FIRMA_ADR", label: "Adresse Firma", multi: true, firm: true },
];
export const MAX_LOGO = 300 * 1024; // Bytes der Bilddatei (Annahme Claude)
const KIND_LABEL = { title: "Titelseite", toc: "Inhaltsverzeichnis", legend: "Sicherungslegende", dispo: "Disposition", pv: "Stringplan", pvtab: "Stringübersicht" };
export const kindLabel = (sh) => KIND_LABEL[sh.kind] || "Schema";

// ---------- Modell ----------
const titleSheet = (meta, info) => ({ meta: { ...meta, TITEL: "Titelseite", BLATT: "1", INDEX: meta.INDEX || "A" }, items: [], kind: "title", info });
const legendSheet = (meta) => ({ meta: { ...meta, TITEL: "Sicherungslegende", INDEX: meta.INDEX || "A" }, items: [], kind: "legend", show: [...LEGEND_DEFAULT] });
const tocSheet = (meta) => ({ meta: { ...meta, TITEL: "Inhaltsverzeichnis", BLATT: "2", INDEX: meta.INDEX || "A" }, items: [], kind: "toc" });

// Titelseite und Inhalt sicherstellen. Sie gibt es nur, wenn die Datei ein Schemablatt hat (CJ 15.10.), die Legende ebenso.
// doc.noTitle / doc.noToc: vom Nutzer gelöscht, kommen nicht von selbst wieder. Fehlt die Titelseite (alte Datei, neues Dokument),
// kommt sie an Position 1, das Inhaltsverzeichnis an 2. shift (Öffnen, Neu): Schemablätter mit Nummer rücken um 2 (1 → 3), BMK folgen
// über renumberAll. Ohne shift (Blatt hinzugefügt) bleiben die Nummern. Projektangaben vom ersten Schemablatt.
// Gibt die Meldung zurück ("" ohne Meldung). Den aktiven Index rechnet der Aufrufer über das bisher aktive Blatt nach.
export function ensureDeck(doc, firm = null, { shift = true } = {}) {
  const sh = doc.sheets, work = sh.filter((s) => !isDeck(s)), schema = work.some((s) => !s.kind);
  const want = [schema && !doc.noTitle && "title", schema && !doc.noToc && "toc"].filter(Boolean);
  const done = want.every((k, i) => sh[i]?.kind === k) && sh.filter(isDeck).length === want.length + (schema ? 1 : 0) && (!schema || sh.some((s) => s.kind === "legend"));
  if (done) { syncDeck(doc); return ""; }
  const oldTitle = sh.find((s) => s.kind === "title");
  const src = work.find((s) => !s.kind) || work[0] || { meta: {} };
  const notes = [];
  const newTitle = want.includes("title") && !oldTitle;
  if (newTitle && shift) {
    const diff = PROJECT_FIELDS.filter((k) => new Set(work.map((s) => String(s.meta[k] ?? "").trim()).filter(Boolean)).size > 1); // leere Felder sind kein Verlust
    let moved = 0;
    for (const s of work) if (!s.kind && /^\d+$/.test(String(s.meta.BLATT ?? "").trim())) { s.meta.BLATT = String(Number(s.meta.BLATT) + 2); moved++; }
    if (moved) notes.push(`Titelseite und Inhaltsverzeichnis sind jetzt Blatt 1 und 2. Die Schemablätter rücken um 2 nach hinten (Blatt 1 wird 3), die BMK folgen.`);
    if (diff.length) notes.push(`Die Blätter hatten verschiedene Angaben bei ${diff.map(label).join(", ")}. Jetzt gelten für alle Blätter die Angaben vom ersten Schemablatt (Titelseite), die anderen Werte sind ersetzt.`);
  }
  if (!schema && shift && sh.some(isDeck)) notes.push("Titelseite, Inhaltsverzeichnis und Sicherungslegende gibt es nur in Dateien mit Schemablatt. Sie entfallen hier, die Projektangaben bleiben auf den Blättern. Bauherr, Firma, Logo und Änderungsindex der Titelseite bleiben in der Datei.");
  // Titelseite fällt weg (ohne Schemablatt oder gelöscht): Bauherr, Firma, Logo, Änderungsindex bleiben im Dokument (doc.info, Gruppe D), eine neue Titelseite übernimmt sie
  if (oldTitle && !want.includes("title") && hasInfo(oldTitle.info)) doc.info = cleanInfo(oldTitle.info);
  // Je Feld: Wert vom ersten Schemablatt, ist er leer, der erste ausgefüllte eines anderen Blatts
  const meta = oldTitle ? oldTitle.meta : { ...src.meta, ...Object.fromEntries(PROJECT_FIELDS.map((k) => [k, String(src.meta[k] ?? "").trim() ? src.meta[k] : work.map((s) => s.meta[k]).find((v) => String(v ?? "").trim()) ?? ""])) };
  const front = [];
  if (want.includes("title")) front.push(oldTitle ? { ...oldTitle, info: oldTitle.info ? cleanInfo(oldTitle.info) : cleanInfo(firm || {}) } : titleSheet(pick(meta), cleanInfo(doc.info || firm || {})));
  if (want.includes("title")) delete doc.info;
  if (want.includes("toc")) front.push(sh.find((s) => s.kind === "toc") || tocSheet(pick(meta)));
  const legend = schema ? [sh.find((s) => s.kind === "legend") || legendSheet(pick(meta))] : []; // Legende immer am Ende (Schritt 4)
  doc.sheets = [...front, ...work, ...legend];
  syncDeck(doc);
  return notes.join(" ");
}
const hasInfo = (i) => !!i && (INFO_FIELDS.some((f) => String(i[f.key] ?? "").trim()) || !!i.logo || i.revs?.length > 0);
const pick = (m) => Object.fromEntries(PROJECT_FIELDS.map((k) => [k, m[k] ?? ""]).concat([["INDEX", m.INDEX ?? ""]]));
const label = (k) => ({ OBJEKT: "Objekt", AUFTRAG: "Auftrag", SCHEMA: "Schema", GEZEICHNET: "Gezeichnet", DATUM: "Datum" }[k]);

// Projektangaben der Titelseite auf alle Blätter, Titelseite und Inhalt mit fester Nummer und festem Titel.
// Feste Blattreihenfolge (CJ 16.10.): Titelseite, Inhalt, Schemablätter, Legende, Disposition, Stringpläne, Stringübersicht.
// Innerhalb eines Typs bleibt die Reihenfolge. Neue Blätter werden hinten angehängt und hier einsortiert, der Aufrufer rechnet den
// aktiven Index nach. Legende: Nummer = letztes Schemablatt + 1.
// Ohne Titelseite (gelöscht) setzt die App die Projektangaben direkt auf allen Blättern (app.js).
export const SHEET_ORDER = ["title", "toc", "schema", "legend", "dispo", "pv", "pvtab"];
export function syncDeck(doc) {
  // Module mehrfach (18.10.2026): je Modul nacheinander (Schema 1, Schema 2, Legende, Dispo 1, Dispo 2, PV 1 mit Übersicht, PV 2 mit Übersicht)
  const rank = (s) => { const k = s.kind || "schema", v = s.var || 1; return k === "title" ? 0 : k === "toc" ? 1 : k === "schema" ? 100 + v : k === "legend" ? 199 : k === "dispo" ? 200 + v : 300 + v * 2 + (k === "pvtab" ? 1 : 0); };
  doc.sheets = doc.sheets.map((s, i) => [s, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((e) => e[0]);
  const leg = doc.sheets.find((s) => s.kind === "legend");
  if (leg?.kind === "legend") {
    const nums = doc.sheets.filter((s) => !s.kind || s.kind === "title" || s.kind === "toc").map((s) => parseInt(s.meta.BLATT, 10)).filter(Number.isFinite);
    Object.assign(leg.meta, { TITEL: "Sicherungslegende", BLATT: String(Math.max(0, ...nums) + 1) });
  }
  const t = titleOf(doc), toc = doc.sheets.find((s) => s.kind === "toc");
  if (t) {
    for (const s of doc.sheets) for (const k of PROJECT_FIELDS) s.meta[k] = t.meta[k] ?? "";
    Object.assign(t.meta, { TITEL: "Titelseite", BLATT: "1" });
  }
  if (toc) Object.assign(toc.meta, { TITEL: "Inhaltsverzeichnis", BLATT: "2" });
}
export const titleOf = (doc) => doc.sheets.find((s) => s.kind === "title");

// Firma und Logo in der App merken (localStorage), neue Dateien übernehmen sie. Fehler: ohne Speicher weiter.
const FIRM_KEY = "schemacad.firma.v1";
export function loadFirm() { try { return JSON.parse(localStorage.getItem(FIRM_KEY) || "null"); } catch { return null; } }
export function saveFirm(info) {
  const o = { FIRMA: info.FIRMA, FIRMA_ADR: info.FIRMA_ADR, ...(info.logo ? { logo: info.logo } : {}) };
  try { localStorage.setItem(FIRM_KEY, JSON.stringify(o)); } catch { /* ohne Speicher weiter */ }
}

// Nächster Index für das Änderungsverzeichnis: A, B, … Z, dann leer
export function nextRevIndex(revs) {
  const last = revs.map((r) => r.i.trim().toUpperCase()).filter((s) => /^[A-Y]$/.test(s)).sort().at(-1);
  return last ? String.fromCharCode(last.charCodeAt(0) + 1) : "A";
}

// ---------- Zeichnen (Welt in mm, y nach oben, wie das Schemablatt) ----------
export const INK = "#17212b", MUTED = "#4a5562", SOFT = "#6b7785";
export const clip = (s, w, h) => (s.length * 0.55 * h <= w ? s : s.slice(0, Math.max(1, Math.floor(w / (0.55 * h)) - 1)) + "…");
export const txt = (x, y, s, { h = 3, w = 400, anchor = "start", fill = INK, bold = false } = {}) =>
  `<text x="${R.f(x)}" y="${R.f(-y)}" transform="scale(1 -1)" font-size="${h}"${bold ? ' font-weight="600"' : ""} text-anchor="${anchor}" fill="${fill}" stroke="none" style="font-family:var(--sheet-font)">${R.esc(clip(String(s), w, h))}</text>`;
export const line = (x1, y1, x2, y2, wd = 0.25) => `<line x1="${R.f(x1)}" y1="${R.f(y1)}" x2="${R.f(x2)}" y2="${R.f(y2)}" stroke="${INK}" stroke-width="${wd}"/>`;
export const lines = (s) => String(s || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

// Seite mit Aussen- und Innenrahmen (ohne Feldeinteilung) und Schriftfeld des Blatts
function pageSVG(meta, inner) {
  return `<rect class="paper" x="0" y="0" width="${W}" height="${H}"/>`
    + `<rect x="${M_OUT}" y="${M_OUT}" width="${W - 2 * M_OUT}" height="${H - 2 * M_OUT}" fill="none" stroke="${INK}" stroke-width="0.5"/>`
    + `<rect x="${M_IN}" y="${M_IN}" width="${W - 2 * M_IN}" height="${H - 2 * M_IN}" fill="none" stroke="${INK}" stroke-width="0.35"/>`
    + inner + R.titleBlockSVG(meta);
}

// Titelseite: oben Firma mit Logo, Mitte Objekt, Auftrag, Schema, unten links Bauherr, unten rechts Änderungsindex
export function titleSVG(sheet) {
  const m = sheet.meta, info = sheet.info || cleanInfo({});
  let s = "";
  const top = H - M_IN - 8, L = M_IN + 8, Rr = W - M_IN - 8;
  if (info.logo) s += `<image href="${info.logo}" x="${L}" y="${R.f(-(top + 2))}" width="60" height="24" preserveAspectRatio="xMinYMid meet" transform="scale(1 -1)"/>`;
  const fx = info.logo ? L + 66 : L;
  if (info.FIRMA) s += txt(fx, top - 6, info.FIRMA, { h: 4.5, bold: true, w: Rr - fx });
  lines(info.FIRMA_ADR).slice(0, 4).forEach((l, i) => { s += txt(fx, top - 12 - i * 4.2, l, { h: 3, fill: MUTED, w: Rr - fx }); });
  s += line(L, top - 30, Rr, top - 30, 0.35);
  // Mitte
  const cy = 128;
  s += txt(L, cy + 12, "Elektroschema", { h: 3.5, fill: SOFT });
  s += txt(L, cy, m.OBJEKT || "Objekt (rechts eingeben)", { h: 9, bold: true, w: Rr - L, fill: m.OBJEKT ? INK : SOFT });
  const sub = [m.AUFTRAG && `Auftrag ${m.AUFTRAG}`, m.SCHEMA && `Schema ${m.SCHEMA}`].filter(Boolean).join("  ·  ");
  if (sub) s += txt(L, cy - 10, sub, { h: 4, fill: MUTED, w: Rr - L });
  // Bauherr
  const by = 92;
  s += txt(L, by, "Bauherr", { h: 2.8, fill: SOFT, bold: true });
  const bl = [info.BAUHERR, ...lines(info.BAUHERR_ADR)].filter(Boolean);
  (bl.length ? bl : ["–"]).slice(0, 6).forEach((l, i) => { s += txt(L, by - 6 - i * 4.6, l, { h: 3.4, w: 120, bold: i === 0 && !!info.BAUHERR }); });
  // Änderungsindex
  s += revTableSVG(info.revs, 150, by + 2, Rr);
  return pageSVG(m, s);
}
const REV_COLS = [["Index", 14], ["Datum", 22], ["Änderung", 0], ["Name", 20]];
function revTableSVG(revs, x0, yTop, x1) {
  const w3 = x1 - x0 - 56, ws = REV_COLS.map(([, w], i) => (i === 2 ? w3 : w)), rh = 5, max = 9;
  let s = txt(x0, yTop - 2, "Änderungsindex", { h: 2.8, fill: SOFT, bold: true }), y = yTop - 5;
  s += `<rect x="${x0}" y="${R.f(y - rh)}" width="${R.f(x1 - x0)}" height="${rh}" fill="#eef1f4" stroke="${INK}" stroke-width="0.25"/>`;
  let x = x0;
  REV_COLS.forEach(([l], i) => { s += txt(x + 1.2, y - rh + 1.6, l, { h: 2.5, bold: true }); x += ws[i]; });
  y -= rh;
  const rows = revs.length ? revs.slice(-max) : [{ i: "", d: "", t: "Noch keine Änderung", n: "" }];
  for (const r of rows) {
    s += `<rect x="${x0}" y="${R.f(y - rh)}" width="${R.f(x1 - x0)}" height="${rh}" fill="none" stroke="${INK}" stroke-width="0.2"/>`;
    x = x0;
    [r.i, r.d, r.t, r.n].forEach((v, i) => { s += txt(x + 1.2, y - rh + 1.6, v, { h: 2.5, w: ws[i] - 2, fill: revs.length ? INK : SOFT }); x += ws[i]; });
    y -= rh;
  }
  x = x0;
  for (const w of ws.slice(0, -1)) { x += w; s += line(x, yTop - 5, x, y, 0.2); }
  if (revs.length > max) s += txt(x0, y - 3.5, `Ältere Einträge (${revs.length - max}) im Eigenschaftsfeld`, { h: 2.2, fill: SOFT });
  return s;
}

// Inhaltsverzeichnis: eine Zeile pro Blatt (Blatt, Art, Titel, Index). Mehr als ROWS Blätter: weitere Seiten.
const TOC_COLS = [["Blatt", 34], ["Art", 40], ["Titel", 160], ["Index", 18]];
const TOC_X = M_IN + 12, TOC_TOP = H - M_IN - 26, TOC_RH = 5.5, TOC_ROWS = 26;
export const sheetNo = (sh, i) => (sh.kind === "pvtab" ? "–" : `${sh.kind === "dispo" ? "Dispo " : sh.kind === "pv" ? "Stringplan " : ""}${sh.meta.BLATT || i + 1}`);
export function tocRows(doc) { return doc.sheets.map((sh, i) => ({ i, no: sheetNo(sh, i), art: kindLabel(sh), titel: sh.meta.TITEL || "", idx: sh.meta.INDEX || "" })); }
export const tocPageCount = (doc) => Math.max(1, Math.ceil(doc.sheets.length / TOC_ROWS));
// Eine Seite des Inhaltsverzeichnisses (p = 0, 1, …). Zeilen tragen data-sheet zum Anspringen.
export function tocSVG(doc, sheet, p = 0) {
  const n = tocPageCount(doc), rows = tocRows(doc).slice(p * TOC_ROWS, (p + 1) * TOC_ROWS);
  let s = txt(TOC_X, H - M_IN - 14, "Inhaltsverzeichnis", { h: 6, bold: true });
  if (n > 1) s += txt(W - M_IN - 12, H - M_IN - 14, `Seite ${p + 1} von ${n}`, { h: 3, anchor: "end", fill: SOFT });
  let y = TOC_TOP, x = TOC_X;
  const wAll = TOC_COLS.reduce((a, c) => a + c[1], 0);
  s += `<rect x="${TOC_X}" y="${R.f(y - TOC_RH)}" width="${wAll}" height="${TOC_RH}" fill="#eef1f4" stroke="${INK}" stroke-width="0.25"/>`;
  for (const [l, w] of TOC_COLS) { s += txt(x + 1.5, y - TOC_RH + 1.8, l, { h: 2.8, bold: true }); x += w; }
  y -= TOC_RH;
  for (const r of rows) {
    s += `<g class="toc-row" data-sheet="${r.i}" style="cursor:pointer"><rect x="${TOC_X}" y="${R.f(y - TOC_RH)}" width="${wAll}" height="${TOC_RH}" fill="#fff" fill-opacity="0" stroke="${INK}" stroke-width="0.15"/>`;
    x = TOC_X;
    [r.no, r.art, r.titel, r.idx].forEach((v, k) => { s += txt(x + 1.5, y - TOC_RH + 1.8, v, { h: 2.8, w: TOC_COLS[k][1] - 3 }); x += TOC_COLS[k][1]; });
    s += "</g>";
    y -= TOC_RH;
  }
  return pageSVG(sheet.meta, s);
}
// Ansicht: alle Seiten des Inhalts untereinander, 10 mm Abstand
export const TOC_GAP = 10;
export function tocScreenSVG(doc, sheet) {
  let s = "";
  for (let p = 0; p < tocPageCount(doc); p++) s += `<g transform="translate(0 ${-p * (H + TOC_GAP)})">${tocSVG(doc, sheet, p)}</g>`;
  return s;
}
export function deckBounds(doc, sheet) {
  const n = sheet.kind === "toc" ? tocPageCount(doc) : 1;
  return { x0: 0, y0: H - n * H - (n - 1) * TOC_GAP, x1: W, y1: H };
}
// Druck: eine A4-Seite (quer) je Seite, Aufbau wie das Schemablatt in files.js
export function deckPrintPages(doc, sheet) {
  const page = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><g transform="matrix(1 0 0 -1 0 ${H})">${inner}</g></svg>`;
  if (sheet.kind === "title") return [page(titleSVG(sheet))];
  return Array.from({ length: tocPageCount(doc) }, (_, p) => page(tocSVG(doc, sheet, p)));
}

// ---------- Eigenschaften-Leiste ----------
const area = (label, attr, v) => { const id = "a" + Math.random().toString(36).slice(2, 8); return `<div class="field"><label for="${id}">${R.esc(label)}</label><textarea id="${id}" ${attr} rows="3" spellcheck="false">${R.esc(v)}</textarea></div>`; };
const delDeckHTML = (name) => `<div class="row"><button class="btn outline small danger" data-deck="deldeck">${R.icons.trash.replace("<svg", '<svg width="16" height="16"')}${name} löschen</button></div>`;
export function deckPanelHTML(doc, sheet, { head, fieldHTML }) {
  if (sheet.kind === "toc") {
    return head("Inhaltsverzeichnis", "Blatt 2, wird automatisch erstellt")
      + `<p class="note">Listet alle Blätter mit Titel und Index. Klick auf eine Zeile springt zum Blatt. Titel und Index trägst du auf jedem Blatt ein.</p>`
      + fieldHTML("Index", 'data-meta="INDEX"', sheet.meta.INDEX ?? "") + delDeckHTML("Inhaltsverzeichnis");
  }
  const m = sheet.meta, info = sheet.info;
  let h = head("Projekt", "Gilt für alle Blätter (Schriftfeld)");
  for (const [k, l] of [["OBJEKT", "Objekt"], ["AUFTRAG", "Auftrag"], ["SCHEMA", "Schema"], ["GEZEICHNET", "Gezeichnet"], ["DATUM", "Datum"]]) h += fieldHTML(l, `data-meta="${k}"`, m[k] ?? "");
  h += fieldHTML("Index der Titelseite", 'data-meta="INDEX"', m.INDEX ?? "");
  h += head("Bauherr");
  for (const f of INFO_FIELDS.filter((x) => !x.firm)) h += f.multi ? area(f.label, `data-info="${f.key}"`, info[f.key]) : fieldHTML(f.label, `data-info="${f.key}"`, info[f.key]);
  h += head("Firma", "Die App merkt sich Firma und Logo für neue Dateien");
  for (const f of INFO_FIELDS.filter((x) => x.firm)) h += f.multi ? area(f.label, `data-info="${f.key}"`, info[f.key]) : fieldHTML(f.label, `data-info="${f.key}"`, info[f.key]);
  h += `<div class="row"><button class="btn outline small" data-deck="logo">${info.logo ? "Logo ersetzen" : "Logo laden"}</button>${info.logo ? '<button class="btn outline small danger" data-deck="nologo">Logo entfernen</button>' : ""}</div>`;
  h += head("Änderungsindex", info.revs.length ? `${info.revs.length} ${info.revs.length === 1 ? "Eintrag" : "Einträge"}` : "Noch keine Änderung");
  info.revs.forEach((r, i) => {
    h += `<div class="rev"><input type="text" data-rev="${i}:i" value="${R.esc(r.i)}" aria-label="Index" placeholder="Index"><input type="text" data-rev="${i}:d" value="${R.esc(r.d)}" aria-label="Datum" placeholder="Datum">`
      + `<input type="text" data-rev="${i}:t" value="${R.esc(r.t)}" aria-label="Änderung" placeholder="Änderung"><input type="text" data-rev="${i}:n" value="${R.esc(r.n)}" aria-label="Name" placeholder="Name">`
      + `<button class="btn ghost small" data-deck="delrev" data-i="${i}" aria-label="Eintrag ${R.esc(r.i)} löschen" title="Eintrag löschen">×</button></div>`;
  });
  h += `<div class="row"><button class="btn outline small" data-deck="addrev">${R.icons.plus.replace("<svg", '<svg width="16" height="16"')}Änderung eintragen</button></div>`;
  return h + delDeckHTML("Titelseite");
}
