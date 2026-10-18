// Eigenes PDF statt Druckdialog (nur elplexaCAD, Wunsch CJ 18.10.2026). Grundlage sind die Druckseiten in #printroot (buildPrint in files.js):
// je SVG eine PDF-Seite in seiner Papiergrösse, Linien und Text als Vektor (svg2pdf.js), Dachpläne als Bild. Schrift Barlow Semi Condensed
// eingebettet (pdf-fonts, in build.mjs aus den woff-Dateien gewandelt). Im SchemaCAD-Bau ersetzt build.mjs diese Datei durch einen leeren Platzhalter.
import { jsPDF } from "jspdf";
import "svg2pdf.js";
import FONTS from "pdf-fonts";

const PX_MM = 25.4 / 96;
// Darstellung, die heute nur aus style.css kommt (#printroot: Linienstärke über --pw, Schrift), wird ins SVG übernommen, weil svg2pdf.js kein CSS des Dokuments liest
const PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "font-size", "text-anchor", "dominant-baseline"];
const FAMILY = "BarlowSC";

function inline(src, dst) {
  const cs = getComputedStyle(src);
  if (cs.display === "none") { dst.remove(); return; }
  // Chrome liefert Werte aus calc() als „calc(0.875px)“, svg2pdf.js liest daraus keine Zahl (Fehler „jsPDF.scale“, Bärgen 18.10.): Hülle entfernen
  if (!(src instanceof SVGSVGElement) || src.ownerSVGElement) for (const p of PROPS) { const v = cs.getPropertyValue(p).replace(/^calc\(\s*([^()]+)\s*\)$/, "$1"); if (v) dst.setAttribute(p, v); }
  if (src.tagName === "text") {
    dst.setAttribute("font-family", FAMILY);
    dst.setAttribute("font-weight", Number(cs.fontWeight) >= 550 || cs.fontWeight === "bold" ? "bold" : "normal");
    dst.removeAttribute("style");
    // „central“ setzt svg2pdf.js anders als Chrome (bis gut 1 mm Versatz): Versatz zur Grundlinie im Browser messen und als y übernehmen
    if (cs.dominantBaseline === "central") {
      const a = src.getBBox().y; src.style.dominantBaseline = "auto"; const d = a - src.getBBox().y; src.style.dominantBaseline = "";
      dst.setAttribute("dominant-baseline", "auto"); dst.setAttribute("y", (parseFloat(src.getAttribute("y")) || 0) + d);
    }
  }
  [...src.children].forEach((c, i) => inline(c, dst.children[i]));
}

// Seitengrösse in mm aus dem Druck-CSS (A4 quer als Vorgabe, Stringplan und Legende mit eigener Grösse)
function pageMm(svg) {
  const cs = getComputedStyle(svg), w = parseFloat(cs.width) * PX_MM, h = parseFloat(cs.height) * PX_MM;
  return w > 0 && h > 0 ? [Math.round(w * 10) / 10, Math.round(h * 10) / 10] : [297, 210];
}

// svgs: die Seiten aus #printroot. Gibt ein Blob (application/pdf) zurück.
export async function makePdf(svgs, title) {
  const sizes = svgs.map(pageMm), fmt = ([w, h]) => [[w, h], w > h ? "l" : "p"];
  const doc = new jsPDF({ unit: "mm", format: sizes[0], orientation: fmt(sizes[0])[1], compress: true });
  for (const [k, b64] of Object.entries(FONTS)) { doc.addFileToVFS(`${FAMILY}-${k}.ttf`, b64); doc.addFont(`${FAMILY}-${k}.ttf`, FAMILY, k); }
  doc.setFont(FAMILY, "normal");
  doc.setProperties({ title, creator: "elplexaCAD" });
  const root = svgs[0]?.parentElement, old = root?.getAttribute("style");
  if (root) root.setAttribute("style", "display:block;position:fixed;left:-100000px;top:0"); // zum Messen der Texte sichtbar, aber ausserhalb
  try {
    for (let i = 0; i < svgs.length; i++) {
      if (i) doc.addPage(...fmt(sizes[i]));
      const copy = svgs[i].cloneNode(true);
      inline(svgs[i], copy);
      await doc.svg(copy, { x: 0, y: 0, width: sizes[i][0], height: sizes[i][1] });
    }
  } finally { if (root) { if (old === null) root.removeAttribute("style"); else root.setAttribute("style", old); } }
  return doc.output("blob");
}

// Knopf PDF (CJ 18.10.2026): PDF bauen und im neuen Tab öffnen. Blockiert der Browser den Tab (Bau dauerte zu lange), öffnet ein Klick im Hinweis es.
// Die Adresse bleibt 10 min gültig, damit Neuladen und Sichern im PDF-Tab gehen.
export async function showPdf(svgs, name, toast, confirmDialog) {
  toast("PDF wird erstellt …");
  let blob;
  try { blob = await makePdf(svgs, name); }
  catch (err) { toast("Das PDF liess sich nicht erstellen: " + (err.message || err), "error"); return; }
  const url = URL.createObjectURL(new File([blob], name + ".pdf", { type: "application/pdf" }));
  setTimeout(() => URL.revokeObjectURL(url), 600000);
  if (window.open(url, "_blank")) { toast("PDF im neuen Tab geöffnet: " + name); return; }
  if (await confirmDialog("PDF ist fertig", "Der Browser hat den neuen Tab blockiert. Mit einem Klick öffnet sich das PDF.", "PDF öffnen")) window.open(url, "_blank");
}
