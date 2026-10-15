// Legende der Sicherungsgruppen (Ausbau UI Schritt 4, CJ 15.10.2026, siehe Entscheidungen): letztes Blatt (kind "legend"),
// A4 hoch, Kopf mit Objekt, Eigentümer, Firma und Logo. Jede Spalte per Kontrollkästchen wählbar (sheet.show).
// RCD und RCBO blau, Prüfhinweis unten auf jeder Seite. Inhalt wird aus den Geräten der Schemablätter berechnet, nichts gespeichert.
import * as R from "./render.js";
import { SYMBOL_BY_NAME, isDevice } from "./symbols.js";
import { fieldOf } from "./numbering.js";
import { LEGEND_KEYS } from "./model.js";
import { txt, line, lines, INK, MUTED, SOFT } from "./titel.js";

export const PW = 210, PH = 297; // A4 hoch
export const BLUE = "#2556b8"; // wie die Netzlinien (SCH_NETZ)
export const NOTICE = "Fehlerstromschutzschalter müssen regelmässig geprüft werden (1x pro Jahr Prüftaste drücken).";
const RCD = new Set(["FI", "RCBO"]);

// Spalten: key, Überschrift, Breite in mm (0 = Rest), Wert aus der Zeile. Reihenfolge nach CJ.
export const COLS = [
  { key: "BMK", label: "BMK", w: 22, v: (r) => r.bmk },
  { key: "STROM", label: "Nennstrom", w: 20, v: (r) => r.strom },
  { key: "CHAR", label: "Char.", w: 13, v: (r) => r.char },
  { key: "IDN", label: "IΔn", w: 15, v: (r) => r.idn },
  { key: "GERAET", label: "Gerät", w: 34, v: (r) => r.geraet },
  { key: "POLE", label: "Pole", w: 11, v: (r) => String(r.pole) },
  { key: "GROESSE", label: "Baugrösse", w: 18, v: (r) => r.groesse },
  { key: "NAME", label: "Bezeichnung", w: 0, v: (r) => r.name },
  { key: "KABEL", label: "Kabel", w: 26, v: (r) => r.kabel },
  { key: "KLEMMEN", label: "Klemmen", w: 17, v: (r) => r.klemmen },
  { key: "ORT", label: "Ort", w: 17, v: (r) => r.ort },
];
export const OPT_LABEL = { BMK: "BMK (Betriebsmittelkennzeichen)", STROM: "Nennstrom", ORT: "Ort (Blatt.Feld)", CHAR: "Charakteristik", IDN: "Bemessungsfehlerstrom IΔn", GERAET: "Gerät", POLE: "Pole", GROESSE: "Baugrösse (NH)", NAME: "Bezeichnung (Verbraucher)", KABEL: "Kabel", KLEMMEN: "Klemmenleiste" };
const shortLabel = (sym) => ({ LS: "LS", FI: "RCD", RCBO: "RCBO", NH: "NH-Sicherung" }[sym.family] + ` ${sym.poles}-polig`);

// Eine Zeile je Schutzgerät (LS, FI, RCBO, NH) aller Schemablätter, sortiert nach Blatt und BMK
export function legendRows(doc) {
  const rows = [];
  doc.sheets.forEach((sh, si) => {
    if (sh.kind) return;
    for (const it of sh.items) {
      const sym = it.type === "symbol" && SYMBOL_BY_NAME[it.sym];
      if (!sym || !isDevice(sym)) continue;
      const a = it.attrs, t = sh.items.find((i) => i.type === "terminals" && i.of === it.id);
      rows.push({ id: it.id, si, blatt: String(sh.meta.BLATT ?? ""), ort: `${sh.meta.BLATT || si + 1}.${fieldOf(it)}`, bmk: a.BMK ?? "", strom: a.STROM ?? "", char: a.CHAR ?? "", idn: a.IDN ?? "", groesse: a.GROESSE ?? "",
        geraet: shortLabel(sym), pole: sym.poles, name: t?.name ?? "", kabel: t?.cable ?? "", klemmen: t?.bmk ?? "", rcd: RCD.has(sym.family) });
    }
  });
  const nat = (a, b) => String(a).localeCompare(String(b), "de", { numeric: true });
  return rows.sort((a, b) => nat(a.blatt, b.blatt) || nat(a.bmk, b.bmk));
}

// Sichtbare Spalten mit Breiten auf 180 mm verteilt (Bezeichnung nimmt den Rest, mindestens 30 mm)
const X0 = 15, TW = PW - 30;
export function visibleCols(sheet) {
  const on = new Set(sheet.show || []);
  const cols = COLS.filter((c) => on.has(c.key)).map((c) => ({ ...c }));
  const fixed = cols.reduce((a, c) => a + c.w, 0), rest = cols.find((c) => c.w === 0);
  if (rest) rest.w = Math.max(30, TW - fixed);
  const sum = cols.reduce((a, c) => a + c.w, 0), k = sum > TW || !rest ? TW / sum : 1;
  for (const c of cols) c.w *= k;
  return cols;
}

// Seitenaufbau (mm, y nach oben): Kopf bis HEAD_Y, Tabelle, Fuss mit Prüfhinweis
const HEAD_Y = PH - 52, RH = 6.5, TH = 7.5, FOOT_Y = 30;
export const ROWS_PER_PAGE = Math.floor((HEAD_Y - 6 - TH - FOOT_Y) / RH);
export const pageCount = (doc) => Math.max(1, Math.ceil(legendRows(doc).length / ROWS_PER_PAGE));

function headSVG(doc, sheet) {
  const m = sheet.meta, info = doc.sheets.find((s) => s.kind === "title")?.info || {}, top = PH - 15;
  let s = txt(X0, top - 3, "Sicherungslegende", { h: 3, fill: SOFT, bold: true });
  s += txt(X0, top - 12, m.OBJEKT || "Objekt (auf der Titelseite eingeben)", { h: 6.5, bold: true, w: 110, fill: m.OBJEKT ? INK : SOFT });
  const own = [info.BAUHERR, ...lines(info.BAUHERR_ADR)].filter(Boolean).slice(0, 3);
  if (own.length) s += txt(X0, top - 19, "Eigentümer", { h: 2.6, fill: SOFT });
  own.forEach((l, i) => { s += txt(X0, top - 24 - i * 4, l, { h: 3.2, w: 110, bold: i === 0 && !!info.BAUHERR }); });
  const xr = PW - 15;
  if (info.logo) s += `<image href="${info.logo}" x="${xr - 50}" y="${R.f(-top)}" width="50" height="16" preserveAspectRatio="xMaxYMin meet" transform="scale(1 -1)"/>`;
  const fy = info.logo ? top - 21 : top - 3;
  if (info.FIRMA) s += txt(xr, fy, info.FIRMA, { h: 3.4, bold: true, anchor: "end", w: 70 });
  lines(info.FIRMA_ADR).slice(0, 3).forEach((l, i) => { s += txt(xr, fy - 4.6 - i * 3.8, l, { h: 2.8, anchor: "end", fill: MUTED, w: 70 }); });
  return s + line(X0, HEAD_Y, PW - 15, HEAD_Y, 0.35);
}
function footSVG(sheet, p, n) {
  const m = sheet.meta;
  let s = line(X0, FOOT_Y - 4, PW - 15, FOOT_Y - 4, 0.25);
  s += txt(X0, FOOT_Y - 10, NOTICE, { h: 3, fill: BLUE, bold: true, w: TW });
  s += txt(X0, 16, `Blatt ${m.BLATT || ""}${n > 1 ? ` · Seite ${p + 1} von ${n}` : ""}${m.AUFTRAG ? ` · Auftrag ${m.AUFTRAG}` : ""}`, { h: 2.6, fill: SOFT });
  s += txt(PW - 15, 16, [m.DATUM, m.GEZEICHNET, m.INDEX && `Index ${m.INDEX}`].filter(Boolean).join(" · "), { h: 2.6, fill: SOFT, anchor: "end" });
  return s;
}
// Eine Seite (p = 0, 1, …). sel = gewählte Geräte-ID (nur Ansicht). Zeilen tragen data-dev zum Anwählen.
export function pageSVG(doc, sheet, p = 0, sel = null) {
  const all = legendRows(doc), n = Math.max(1, Math.ceil(all.length / ROWS_PER_PAGE)), rows = all.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE), cols = visibleCols(sheet);
  let s = `<rect class="paper" x="0" y="0" width="${PW}" height="${PH}"/>` + headSVG(doc, sheet);
  let y = HEAD_Y - 6, x = X0;
  s += `<rect x="${X0}" y="${R.f(y - TH)}" width="${TW}" height="${TH}" fill="#eef1f4" stroke="${INK}" stroke-width="0.25"/>`;
  for (const c of cols) { s += txt(x + 1.5, y - TH + 2.4, c.label, { h: 2.8, bold: true, w: c.w - 2 }); x += c.w; }
  y -= TH;
  if (!rows.length) s += txt(X0 + 1.5, y - RH + 2.2, "Noch keine Schutzgeräte auf den Schemablättern.", { h: 2.8, fill: SOFT });
  for (const r of rows) {
    const fill = r.rcd ? BLUE : INK;
    s += `<g class="leg-row" data-dev="${r.id}" style="cursor:pointer"><rect x="${X0}" y="${R.f(y - RH)}" width="${TW}" height="${RH}" fill="${r.id === sel ? "#fff4cc" : "#fff"}" fill-opacity="${r.id === sel ? 1 : 0}" stroke="${INK}" stroke-width="0.15"/>`;
    x = X0;
    for (const c of cols) { s += txt(x + 1.5, y - RH + 2.2, c.v(r), { h: 2.9, w: c.w - 2.5, fill, bold: c.key === "BMK" }); x += c.w; }
    s += "</g>";
    y -= RH;
  }
  x = X0;
  for (const c of cols.slice(0, -1)) { x += c.w; s += line(x, HEAD_Y - 6, x, y, 0.15); }
  return s + footSVG(sheet, p, n);
}
// Ansicht: Seiten nebeneinander mit 10 mm Abstand (Welt-y wie beim Schemablatt: 0 unten)
const GAP = 10;
export function screenSVG(doc, sheet, sel) {
  let s = "";
  for (let p = 0; p < pageCount(doc); p++) s += `<g transform="translate(${p * (PW + GAP)} 0)">${pageSVG(doc, sheet, p, sel)}</g>`;
  return s;
}
export const bounds = (doc) => ({ x0: 0, y0: 0, x1: pageCount(doc) * (PW + GAP) - GAP, y1: PH });
// Druck: A4 hoch je Seite (style.css @page pA4h)
export function printPages(doc, sheet) {
  return Array.from({ length: pageCount(doc) }, (_, p) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PW} ${PH}" style="width:${PW}mm;height:${PH}mm;page:pA4h"><g transform="matrix(1 0 0 -1 0 ${PH})">${pageSVG(doc, sheet, p)}</g></svg>`);
}

// ---------- Eigenschaften-Leiste ----------
// Spalten zuschalten, Legende als PDF. Gewählte Zeile: Werte des Geräts ändern (wirken auf das Gerät), zum Gerät springen.
export function panelHTML(doc, sheet, sel, { head, fieldHTML }) {
  const rows = legendRows(doc), r = rows.find((x) => x.id === sel);
  let h = head("Sicherungslegende", `Blatt ${sheet.meta.BLATT}, ${rows.length} ${rows.length === 1 ? "Gerät" : "Geräte"}, wird automatisch erstellt`);
  if (r) {
    const sh = doc.sheets[r.si], it = sh.items.find((i) => i.id === r.id), sym = SYMBOL_BY_NAME[it.sym], t = sh.items.find((i) => i.type === "terminals" && i.of === it.id);
    h += head(r.bmk || "Gerät", `${sym.label}, Ort ${r.ort}`);
    for (const a of sym.attrs) if (!a.auto) h += fieldHTML(a.label, `data-lattr="${a.tag}"`, it.attrs[a.tag] ?? "");
    if (t) h += fieldHTML("Bezeichnung (Verbraucher)", 'data-lterm="name"', t.name) + fieldHTML("Kabel", 'data-lterm="cable"', t.cable, 'placeholder="5x1.5mm2"');
    else h += `<p class="note">Ohne Klemmenleiste: Bezeichnung und Kabel stehen dort.</p>`;
    h += `<div class="row"><button class="btn outline small" data-deck="godev">Zum Gerät im Schema</button></div>`;
  } else {
    h += `<p class="note">Klick auf eine Zeile wählt das Gerät. Hier änderst du dann seine Werte, sie gelten auch im Schema.</p>`;
  }
  h += head("Spalten");
  for (const k of LEGEND_KEYS) h += `<label class="chk"><input type="checkbox" data-lcol="${k}"${(sheet.show || []).includes(k) ? " checked" : ""}> ${R.esc(OPT_LABEL[k])}</label>`;
  h += `<div class="row"><button class="btn outline small" data-deck="legpdf">${R.icons.pdf.replace("<svg", '<svg width="16" height="16"')}Legende als PDF</button></div>`;
  return h;
}
