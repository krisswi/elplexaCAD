import esbuild from "esbuild";
import fs from "fs";
import zlib from "zlib";
const b64 = (p) => fs.readFileSync(p).toString("base64");
const face = (family, weight, file) => `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64(file)}) format("woff2");}`;
const fonts = [
  face("Barlow", 400, "node_modules/@fontsource/barlow/files/barlow-latin-400-normal.woff2"),
  face("Barlow", 500, "node_modules/@fontsource/barlow/files/barlow-latin-500-normal.woff2"),
  face("Barlow", 600, "node_modules/@fontsource/barlow/files/barlow-latin-600-normal.woff2"),
  face("Barlow Semi Condensed", 400, "node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-400-normal.woff2"),
  face("Barlow Semi Condensed", 500, "node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-500-normal.woff2"),
].join("\n");
// pdf.js-Worker als Text einbetten (Modul "pdf-worker-src"), damit die HTML-Datei ohne Zusatzdatei offline läuft.
// Als klassisches Skript (iife): ein Modul-Worker aus einer Blob-URL startet unter file:// nicht (Ursprung "null").
const pdfWorker = { name: "pdf-worker-src", setup(b) {
  b.onResolve({ filter: /^pdf-worker-src$/ }, () => ({ path: "pdf-worker-src", namespace: "pdfw" }));
  b.onLoad({ filter: /.*/, namespace: "pdfw" }, async () => {
    const src = fs.readFileSync("node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", "utf8");
    const { code } = await esbuild.transform(src, { format: "iife", minify: true, target: "chrome110", legalComments: "none" });
    return { contents: code, loader: "text" };
  });
} };
// `node build.mjs` baut SchemaCAD (v3, online). `node build.mjs elplexa` baut elplexaCAD (Aufbau B, CJ 17.10.2026): gleicher Quellcode,
// Teile nur für elplexaCAD stehen hinter ELPLEXA und fallen im SchemaCAD-Bau ganz weg.
const EL = process.argv[2] === "elplexa";
// Eigenes PDF (nur elplexaCAD, src/pdfout.js): Schrift Barlow Semi Condensed als TrueType für jsPDF, aus den woff-Dateien entpackt (WOFF 1 = sfnt-Tabellen
// einzeln mit zlib gepackt). Im SchemaCAD-Bau wird pdfout.js durch einen leeren Platzhalter ersetzt, jsPDF und svg2pdf.js kommen nicht in v3.
function woffToTtf(file) {
  const w = fs.readFileSync(file), n = w.readUInt16BE(12), tables = [];
  for (let i = 0; i < n; i++) {
    const e = 44 + i * 20, off = w.readUInt32BE(e + 4), comp = w.readUInt32BE(e + 8), orig = w.readUInt32BE(e + 12), raw = w.subarray(off, off + comp);
    tables.push({ tag: w.subarray(e, e + 4), sum: w.readUInt32BE(e + 16), data: comp < orig ? zlib.inflateSync(raw) : raw });
  }
  const head = Buffer.alloc(12 + 16 * n); w.copy(head, 0, 4, 8); head.writeUInt16BE(n, 4);
  const sel = Math.floor(Math.log2(n)); head.writeUInt16BE(16 * 2 ** sel, 6); head.writeUInt16BE(sel, 8); head.writeUInt16BE(16 * n - 16 * 2 ** sel, 10);
  const parts = [head]; let pos = head.length;
  tables.forEach((t, i) => {
    const d = 12 + i * 16; t.tag.copy(head, d); head.writeUInt32BE(t.sum, d + 4); head.writeUInt32BE(pos, d + 8); head.writeUInt32BE(t.data.length, d + 12);
    const pad = (4 - (t.data.length % 4)) % 4; parts.push(t.data, Buffer.alloc(pad)); pos += t.data.length + pad;
  });
  return Buffer.concat(parts).toString("base64");
}
const pdfOut = { name: "pdf-out", setup(b) {
  b.onResolve({ filter: /^pdf-fonts$/ }, () => ({ path: "pdf-fonts", namespace: "pdff" }));
  b.onLoad({ filter: /.*/, namespace: "pdff" }, () => ({ loader: "json", contents: JSON.stringify({
    normal: woffToTtf("node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-400-normal.woff"),
    bold: woffToTtf("node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-600-normal.woff") }) }));
  if (!EL) b.onResolve({ filter: /\/pdfout\.js$/ }, () => ({ path: "pdfout", namespace: "pdfstub" }));
  b.onLoad({ filter: /.*/, namespace: "pdfstub" }, () => ({ contents: "export const makePdf = null, showPdf = null;" }));
  // Handnotizen (src/hand.js) nur im elplexaCAD-Bau: sonst Platzhalter, jsPDF und pdf.js-Anteile für Notizen kommen nicht in v3
  if (!EL) b.onResolve({ filter: /\/hand\.js$/ }, () => ({ path: "hand", namespace: "handstub" }));
  b.onLoad({ filter: /.*/, namespace: "handstub" }, () => ({ contents: "export const openHand = null;" }));
  // Modul Plan (src/planedit.js, CJ 23.10.2026) nur im elplexaCAD-Bau
  if (!EL) b.onResolve({ filter: /\/planedit\.js$/ }, () => ({ path: "planedit", namespace: "planstub" }));
  b.onLoad({ filter: /.*/, namespace: "planstub" }, () => ({ contents: "export const makePlan = null;" }));
} };
const js = await esbuild.build({ entryPoints: ["src/app.js"], bundle: true, format: "iife", minify: true, write: false, target: "chrome110", legalComments: "none", plugins: [pdfWorker, pdfOut], external: ["html2canvas", "dompurify", "canvg"], define: { ELPLEXA: String(EL), APP_BUILD: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ")) } });
const css = fs.readFileSync("src/style.css", "utf8") + (EL ? "\n" + fs.readFileSync("src/elplexa.css", "utf8") : "");
let html = fs.readFileSync("src/index.template.html", "utf8");
// elplexaCAD: Elplexa-CI (Handbuch 1.0, 17.10.2026): Figur als Logo und Favicon, Schrift Source Sans 3 für die Oberfläche.
const elFonts = EL ? ["400", "500", "600"].map((w) => face("Source Sans 3", w, `node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-${w}-normal.woff2`)).join("\n") : "";
if (EL) {
  const fig = fs.readFileSync("src/elplexa-figur.svg", "utf8").replace(/<!--.*?-->\n?/s, "").trim();
  html = html.replace("<title>SchemaCAD v3</title>", "<title>elplexaCAD</title>").replace('<span class="brand-name">SchemaCAD</span>', '<span class="brand-name">elplexaCAD</span>')
    .replace('<span class="mark" aria-hidden="true"></span>', () => fig.replace("<svg ", '<svg class="mark el-logo" aria-hidden="true" '))
    .replace('title="Im Druckdialog als Ziel „Als PDF sichern“ wählen"><span class="ic" data-ic="pdf"></span><span class="mt"><span class="mh">PDF / Drucken …</span><span class="ms">Blätter wählen, dann Druckdialog</span>',
      'title="PDF der gewählten Blätter, öffnet im neuen Tab"><span class="ic" data-ic="pdf"></span><span class="mt"><span class="mh">PDF …</span><span class="ms">Blätter wählen, PDF im neuen Tab</span>')
    .replace('id="btn-legpdf" tabindex="-1" title="Im Druckdialog als Ziel „Als PDF sichern“ wählen"', 'id="btn-legpdf" tabindex="-1" title="PDF der Legende, öffnet im neuen Tab"')
    .replace(/<link rel="icon" href="[^"]*">/, () => `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(fig).toString("base64")}">`);
}
html = html.replace("/*CSS*/", () => fonts + "\n" + (EL ? elFonts + "\n" : "") + css).replace("/*JS*/", () => js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script"));
fs.mkdirSync("dist", { recursive: true });
const out = EL ? "dist/ElplexaCAD.html" : "dist/schemacad.html";
fs.writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(0) + " KB");
