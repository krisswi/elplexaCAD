// Druck von Stringplan und Stringübersicht (Modul PV-Strings, Schritt 7). Eine Seite = ein SVG in Papiergrösse (mm, y nach oben).
// Rahmen 10 mm, unten der Plankopf (gleiche Felder wie das Schriftfeld des Schemas, render.js titleBlockSVG), darüber eine Zeile mit Massstab und Papier.
// 5an/5ap: Die Stringübersicht zeigt dieselben Seiten (Rahmen, Plankopf, gewähltes Papier) auch am Bildschirm. 5aq: Nordpfeil und Massstabsleiste.
import * as P from "./pv.js";
import * as R from "./render.js";
import { TB_W } from "./frame.js";
import { tablePages, WIDTH } from "./pvtab.js";

const INK = "#17212b";
// Inhalt einer Seite in Papier-mm (y nach oben, Ursprung unten links): inner, Rahmen, Infozeile, Plankopf. p: Papier wie P.paperOf.
function pageInner(p, meta, info, inner, head = true) {
  const a = P.printArea(p), { w, h, k } = a, m = P.PRINT_M;
  const frame = `<rect x="${m}" y="${m}" width="${w - 2 * m}" height="${h - 2 * m}" fill="none" stroke="${INK}" stroke-width="1"/>`
    + `<line x1="${m}" y1="${R.f(a.y0)}" x2="${w - m}" y2="${R.f(a.y0)}" stroke="${INK}" stroke-width="1"/>`
    + `<text transform="translate(${m + 2},${R.f(a.y0 - P.INFO_H / 2)}) scale(1,-1)" font-size="2.5" dominant-baseline="central" fill="${INK}" stroke="none">${R.esc(info)}</text>`;
  const tb = !head ? "" : `<g transform="translate(${R.f(w - m - TB_W * k)} ${m}) scale(${R.f(k)})">${R.titleBlockSVG(meta, 0, 0)}</g>`;
  return inner + frame + tb;
}
// Seite mit Rahmen, Plankopf und Infozeile als eigenes SVG (Druck)
export function pageSVG(p, meta, info, inner, head = true) {
  const [w, h] = P.paperSize(p);
  return `<svg xmlns="http://www.w3.org/2000/svg" class="pvpage" viewBox="0 0 ${w} ${h}" style="width:${w}mm;height:${h}mm;page:${pageName(p)}"><g transform="matrix(1 0 0 -1 0 ${h})">${pageInner(p, meta, info, inner, head)}</g></svg>`;
}
// Benannte Seiten für den Druckdialog (style.css @page pA4q usw.)
const pageName = (p) => `p${p.size}${p.quer ? "q" : "h"}`;

// Stringplan: Inhalt (Welt-mm) um center auf das Planfeld, Massstab 1:den, ausserhalb abgeschnitten. Linien 0,25 mm auf Papier (style.css).
// H: abgewählte Druckteile (5l), davon hier Plankopf, Nordpfeil und Massstabsleiste.
export function planPageSVG(sheet, content, center, id, H = new Set()) {
  const p = P.paperOf(sheet), a = P.printArea(p), s = 1 / p.den;
  const cx = (a.x0 + a.x1) / 2, cy = (a.y0 + a.y1) / 2;
  const inner = `<clipPath id="${id}"><rect x="${a.x0}" y="${R.f(a.y0)}" width="${a.x1 - a.x0}" height="${R.f(a.y1 - a.y0)}"/></clipPath>`
    + `<g clip-path="url(#${id})"><g transform="translate(${R.f(cx)} ${R.f(cy)}) scale(${s}) translate(${R.f(-center.x)} ${R.f(-center.y)})" style="--pw:${R.f(0.25 * p.den)}">${content}</g></g>`
    + legendSVG(a, p.den, H.has("north") ? null : P.northOnPaper(sheet), !H.has("bar"));
  return pageSVG(p, sheet.meta, `Stringplan · Massstab ${P.fmtDen(p.den)} · ${P.paperLabel(p)}`, inner, !H.has("head"));
}
// Nordpfeil und Massstabsleiste (5aq) unten links im Planfeld, auf weissem Grund. dir = Pfeil im Uhrzeigersinn ab oben (null = ohne Pfeil).
function legendSVG(a, den, dir, bar) {
  const L = bar ? P.barLen(den) : null;
  if (dir === null && !L) return "";
  const x = a.x0 + 3, y = a.y0 + 3, bw = L ? L / den : 0, nw = dir === null ? 0 : 16, w = nw + (L ? bw + 12 : 0) + 2, h = 20;
  let s = `<g class="pv-legend"><rect x="${R.f(x)}" y="${R.f(y)}" width="${R.f(w)}" height="${h}" fill="#fff" stroke="${INK}" stroke-width="0.25"/>`;
  const t = (tx, ty, str, anchor = "middle") => `<text transform="translate(${R.f(tx)},${R.f(ty)}) scale(1,-1)" font-size="2.5" text-anchor="${anchor}" dominant-baseline="central" fill="${INK}" stroke="none">${R.esc(str)}</text>`;
  if (dir !== null) { // Pfeil um den Kreismittelpunkt gedreht, N an der Spitze
    const cx = x + 9, cy = y + 9, [nx, ny] = P.rotPt(0, 8.5, -dir);
    s += `<g class="pv-north" data-dir="${R.f(dir)}"><circle cx="${R.f(cx)}" cy="${R.f(cy)}" r="6" fill="none" stroke="${INK}" stroke-width="0.25"/>`
      + `<polygon transform="translate(${R.f(cx)} ${R.f(cy)}) rotate(${R.f(-dir)})" points="0,5 2.2,-4 0,-2.2 -2.2,-4" fill="${INK}" stroke="${INK}" stroke-width="0.25"/>`
      + t(cx + nx, cy + ny, "N") + "</g>";
  }
  if (L) { // vier Felder schwarz/weiss, Beschriftung 0, Mitte, Länge in m
    const bx = x + nw + 4, by = y + 10, q = bw / 4, m = (v) => P.fmtNum(v / 1000);
    s += `<g class="pv-bar" data-len="${L}">` + [0, 1, 2, 3].map((i) => `<rect x="${R.f(bx + i * q)}" y="${R.f(by)}" width="${R.f(q)}" height="1.5" fill="${i % 2 ? "#fff" : INK}" stroke="${INK}" stroke-width="0.25"/>`).join("")
      + t(bx, by - 3, "0") + t(bx + bw / 2, by - 3, m(L / 2)) + t(bx + bw, by - 3, `${m(L)} m`) + "</g>";
  }
  return s + "</g>";
}

// Stringübersicht: Papier wählbar (5ap, CJ 15.10.), Vorgabe A4 quer, immer 1:1. Ist das Planfeld schmaler als die Tabelle (277 mm, z. B. A4 hoch),
// wird die Tabelle verkleinert (Umsetzung Claude). So viele Seiten wie nötig.
export const TAB_PAPER = { size: "A4", quer: true, den: 1 };
export const tabPaper = (sheet) => ({ ...TAB_PAPER, ...sheet.paper, den: 1 });
function tableParts(sheet, doc) {
  const p = tabPaper(sheet), a = P.printArea(p), k = Math.min(1, (a.x1 - a.x0) / WIDTH), parts = tablePages(P.varDoc(doc, sheet), (a.y1 - a.y0 - 2) / k); // nur die Variante dieser Übersicht
  return parts.map((t, i) => pageInner(p, sheet.meta, `Stringübersicht · Seite ${i + 1} von ${parts.length} · ${P.paperLabel(p)}`, `<g transform="translate(${a.x0} ${a.y1 - 2}) scale(${R.f(k)})" style="--pw:0.2">${t}</g>`));
}
export function tablePagesSVG(sheet, doc) {
  const p = tabPaper(sheet), [w, h] = P.paperSize(p);
  return tableParts(sheet, doc).map((s) => `<svg xmlns="http://www.w3.org/2000/svg" class="pvpage" viewBox="0 0 ${w} ${h}" style="width:${w}mm;height:${h}mm;page:${pageName(p)}"><g transform="matrix(1 0 0 -1 0 ${h})">${s}</g></svg>`);
}
// Bildschirm (5an): die Druckseiten untereinander, Seite 1 oben, Oberkante bei y = 0, Abstand 20 mm
const GAP = 20;
export function tableScreenSVG(sheet, doc) {
  const [w, h] = P.paperSize(tabPaper(sheet));
  return tableParts(sheet, doc).map((s, i) => `<g class="pvtab-page" transform="translate(0 ${-(i + 1) * h - i * GAP})"><rect class="paper" x="0" y="0" width="${w}" height="${h}"/>${s}</g>`).join("");
}
export function tableScreenBounds(sheet, doc) {
  const [w, h] = P.paperSize(tabPaper(sheet)), n = tableParts(sheet, doc).length;
  return { x0: -10, y0: -(n * h + (n - 1) * GAP) - 10, x1: w + 10, y1: 10 };
}
