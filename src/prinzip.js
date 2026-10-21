// Prinzipschema (CJ 21.10.2026): eigenes Modul, Blatt kind "prinzip", einpolig von Hand gezeichnet.
// Gezeichnet wird mit dem Schema-Editor (Leitung, Text, Formen, Symbole aus prinzipsym.js). Papier, Rahmen, Plankopf und Druck wie im
// PV-Modul (pvprint.js, wie die Stringübersicht): Seite in Papier-mm, Massstab immer 1:1, Ursprung unten links, y nach oben.
import * as P from "./pv.js";
import * as R from "./render.js";
import { pageInner, pageSVG } from "./pvprint.js";

// Papier: A4 hoch wie die Vorlagen (Annahme Claude, ❓ CJ), wählbar A4 bis A2, hoch oder quer. sheet.paper = { size, quer }, fehlt = Vorgabe
// (beim Laden geprüft in model.js).
export const PZ_PAPER = { size: "A4", quer: false, den: 1 };
export const paperOf = (sh) => ({ ...PZ_PAPER, ...sh.paper, den: 1 });
const info = (p) => `Prinzipschema · ${P.paperLabel(p)}`;

// Bildschirm: Papier, Raster, Rahmen, Infozeile und Plankopf (gleiche Seite wie im Druck)
export function sheetSVG(sh, grid, zoom) {
  const p = paperOf(sh), [w, h] = P.paperSize(p);
  let s = `<rect class="paper" x="0" y="0" width="${w}" height="${h}"/>`;
  if (grid.on && grid.size * zoom >= 7) s += `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#gridpat)" stroke="none" pointer-events="none"/>`;
  return s + pageInner(p, sh.meta, info(p), "");
}
export function bounds(sh) {
  const [w, h] = P.paperSize(paperOf(sh));
  return { x0: -10, y0: -10, x1: w + 10, y1: h + 10 };
}
// Druck: eine Seite im gewählten Papier
export const printPages = (sh) => [pageSVG(paperOf(sh), sh.meta, info(paperOf(sh)), R.itemsSVG(sh.items, "prinzip"))];

// Fenster Druck (oben, wie im Stringplan): Papier und Plankopf
export function popHTML(sh, { head, fieldHTML, META_FIELDS }) {
  const p = paperOf(sh), a = P.printArea(p), mm = (v) => String(Math.round(v)).replace(".", ",");
  const sel = (k, opts, cur, label) => `<div class="field"><label>${label}</label><select data-pzopt="${k}">${opts.map(([v, l]) => `<option value="${v}"${v === cur ? " selected" : ""}>${l}</option>`).join("")}</select></div>`;
  return head("Druck", "Papier des Prinzipschemas")
    + sel("psize", Object.keys(P.PAPERS).map((k) => [k, `${k} (${P.PAPERS[k][0]} × ${P.PAPERS[k][1]} mm)`]), p.size, "Papier") + sel("pquer", [["0", "hoch"], ["1", "quer"]], p.quer ? "1" : "0", "Ausrichtung")
    + `<p class="note">Massstab 1:1, Zeichenfläche ${mm(a.x1 - a.x0)} × ${mm(a.y1 - a.y0)} mm über dem Plankopf. Ausgeben: Exportieren → PDF.</p>`
    + `<h3 class="pv-title">Plankopf</h3>` + META_FIELDS.map((f) => fieldHTML(f.label, `data-meta="${f.tag}"`, sh.meta[f.tag] ?? "")).join("");
}
export const printLabel = (sh) => ({ text: P.paperLabel(paperOf(sh)), warn: false });
// Neues Papier aus dem Fenster Druck. Gibt das neue Feld paper oder null (unverändert).
export function paperFrom(sh, k, v) {
  const p = paperOf(sh), np = { size: k === "psize" && P.PAPERS[v] ? v : p.size, quer: k === "pquer" ? v === "1" : p.quer };
  return sh.paper && np.size === p.size && np.quer === p.quer ? null : np;
}
