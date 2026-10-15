// PDF als Hintergrund eines Stringplans. pdf.js (Mozilla, Apache-2.0) ist gebündelt, legacy-Variante: die normale nutzt
// sehr neue Browserfunktionen (z. B. Map.getOrInsertComputed). Der Worker steckt als Text in der HTML-Datei (build.mjs, Modul "pdf-worker-src"),
// als klassisches Skript, weil ein Modul-Worker aus einer Blob-URL unter file:// nicht startet.
import { getDocument, PDFWorker } from "pdfjs-dist/legacy/build/pdf.min.mjs";
import workerSrc from "pdf-worker-src";

const MAX_PX = 5000; // längste Bildseite beim Rendern (Annahme: bei A1 ca. 150 dpi, ca. 100 MB Speicher)

// Ein Worker je PDF: so beendet das Schliessen einer PDF nicht die anderen
let workerUrl = null;
function newWorker() {
  workerUrl ??= URL.createObjectURL(new Blob([workerSrc], { type: "text/javascript" }));
  const port = new Worker(workerUrl);
  return { port, worker: new PDFWorker({ port }) };
}

export function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(b64) {
  const s = atob(b64), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Öffnet eine PDF (Bytes werden kopiert, pdf.js übernimmt den Puffer). Gibt { doc, pages, close } zurück.
export async function openPdf(bytes) {
  const { port, worker } = newWorker();
  const task = getDocument({ data: bytes.slice(), isEvalSupported: false, worker }), doc = await task.promise;
  return { doc, pages: doc.numPages, close: () => { task.destroy().finally(() => { worker.destroy(); port.terminate(); }); } };
}
// Seitengrösse in pt (mit Drehung der Seite), Ursprung oben links
export async function pageSize(doc, n) {
  const vp = (await doc.getPage(n)).getViewport({ scale: 1 });
  return { w: vp.width, h: vp.height };
}
// Seite als PNG (Objekt-URL)
export async function renderPage(doc, n) {
  const page = await doc.getPage(n), vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: MAX_PX / Math.max(vp1.width, vp1.height) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  canvas.width = canvas.height = 0; // Speicher freigeben
  return URL.createObjectURL(blob);
}

// Bilder je PDF-Datei und Seite, einmal gerendert. onReady wird aufgerufen, sobald ein Bild fertig ist.
// Die ID allein reicht nicht (eine andere Datei kann dieselbe ID tragen), daher zählt auch der Inhalt.
const images = new Map(), docs = new Map();
export function imageFor(assets, id, page, onReady) {
  const data = assets[id].data, key = id + "|" + page, hit = images.get(key);
  if (hit && hit.data === data) return hit.url || null;
  const entry = { data };
  images.set(key, entry);
  if (docs.get(id)?.data !== data) docs.set(id, { data, p: openPdf(fromBase64(data)) });
  const pending = docs.get(id).p;
  entry.p = (async () => {
    try {
      const { doc } = await pending;
      entry.url = await renderPage(doc, page);
    } catch (err) { entry.error = String(err?.message || err); }
    onReady(entry.error);
  })();
  return null;
}
// Wie imageFor, wartet aber, bis das Bild fertig ist (Druck, PV-Strings Schritt 7). Gibt die URL oder null zurück.
export async function imageReady(assets, id, page) {
  const url = imageFor(assets, id, page, () => {});
  if (url) return url;
  const e = images.get(id + "|" + page);
  await e.p;
  return e.url || null;
}
