import esbuild from "esbuild";
import fs from "fs";
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
const js = await esbuild.build({ entryPoints: ["src/app.js"], bundle: true, format: "iife", minify: true, write: false, target: "chrome110", legalComments: "none", plugins: [pdfWorker], define: { ELPLEXA: String(EL) } });
const css = fs.readFileSync("src/style.css", "utf8") + (EL ? "\n" + fs.readFileSync("src/elplexa.css", "utf8") : "");
let html = fs.readFileSync("src/index.template.html", "utf8");
if (EL) html = html.replace("<title>SchemaCAD v3</title>", "<title>elplexaCAD</title>").replace('<span class="brand-name">SchemaCAD</span>', '<span class="brand-name">elplexaCAD</span>');
html = html.replace("/*CSS*/", () => fonts + "\n" + css).replace("/*JS*/", () => js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script"));
fs.mkdirSync("dist", { recursive: true });
const out = EL ? "dist/ElplexaCAD.html" : "dist/schemacad.html";
fs.writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(0) + " KB");
