// elplexaCAD: Modul Handnotizen (Meilenstein 2, CJ 20.10.2026). Mit dem Apple Pencil handschriftlich schreiben, wie GoodNotes / Apple Notizen.
// Eigenständig: eigene Datenbank (IndexedDB "elplexacad-hand"), nie im Projekt, nie im Teilen-Link, nie im PDF des Plansatzes. Privat in diesem Browser.
// Eingabe: Pointer Events. Stift (pointerType "pen") und Maus schreiben, Finger schieben und zoomen (Palm-Rejection: Finger zählt nicht
// während und kurz nach dem Stift, grosse Auflage = Handballen). Schalter «Finger schreibt» für Geräte ohne Stift.
// Import: PDF (pdf.js), Bilder (JPG/PNG), Sicherung (.json), einzelne Blätter aus dem Projekt (über das eigene PDF). Export: PDF (Vektor), PNG, Sicherung.
import { jsPDF } from "jspdf";
import { openPdf } from "./pdfbg.js";
import { openModal } from "./dialogs.js";

const DB = "elplexacad-hand", SC = 2, PW = 595, PH = 842; // SC = Pixel je Seiteneinheit (1 Einheit = 1 pt, A4 = 595 × 842)
const COLORS = ["#1b1b1b", "#1f4fd8", "#c62828", "#2e7d32"];
const WIDTHS = [1.2, 2.4, 4.5];
const TOOLS = [["pen", "Stift"], ["marker", "Marker"], ["eraser", "Radierer"]];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---- Speicher (IndexedDB) ----
let dbp = null;
const db = () => dbp ??= new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore("books", { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction("books", mode), q = fn(t.objectStore("books")); t.oncomplete = () => res(q?.result); t.onerror = t.onabort = () => rej(t.error); }); };
export const listBooks = () => tx("readonly", (s) => s.getAll()).then((l) => (l || []).sort((a, b) => b.changed - a.changed));
const putBook = (b) => tx("readwrite", (s) => s.put(b));
const delBook = (id) => tx("readwrite", (s) => s.delete(id));

// ---- Modell ----
export const newPage = (w = PW, h = PH, bg = null) => ({ w, h, bg, strokes: [], text: "" });
export const newBook = (title = "Neue Notiz") => ({ id: uid(), title, created: Date.now(), changed: Date.now(), thumb: "", pages: [newPage()] });
export const bookText = (b) => `${b.title}\n${b.pages.map((p) => p.text).join("\n")}`.toLowerCase();
export const searchBooks = (list, q) => { const k = q.trim().toLowerCase(); return k ? list.filter((b) => bookText(b).includes(k)) : list; };
export const sizeOf = (b) => b.pages.reduce((n, p) => n + (p.bg?.size || 0) + p.strokes.reduce((m, s) => m + s.d.length * 6, 0), 0);
const fmtSize = (n) => n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB";

// ---- Zeichnen ----
// Stift: Breite folgt dem Druck (Maus: konstant), weiche Kurve über die Mittelpunkte. Marker: konstant, durchscheinend.
export function drawStroke(g, s, k = 1) {
  const d = s.d, n = d.length / 3;
  g.save(); g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = g.fillStyle = s.c;
  if (s.t === "marker") { g.globalAlpha = 0.35; g.lineWidth = s.w * 4 * k; g.lineCap = "butt"; }
  if (n === 1) { g.beginPath(); g.arc(d[0] * k, d[1] * k, Math.max(0.5, (s.t === "marker" ? s.w * 2 : s.w * (0.4 + d[2]) / 2)) * k, 0, 7); g.fill(); g.restore(); return; }
  if (s.t === "marker") { g.beginPath(); g.moveTo(d[0] * k, d[1] * k); for (let i = 1; i < n; i++) g.lineTo(d[i * 3] * k, d[i * 3 + 1] * k); g.stroke(); g.restore(); return; }
  for (let i = 1; i < n; i++) {
    const a = (i - 1) * 3, b = i * 3, p = (d[a + 2] + d[b + 2]) / 2;
    g.lineWidth = s.w * (0.4 + 1.2 * p) * k;
    g.beginPath(); g.moveTo(d[a] * k, d[a + 1] * k);
    if (i < n - 1) { const c = (i + 1) * 3; g.quadraticCurveTo(d[b] * k, d[b + 1] * k, (d[b] + d[c]) / 2 * k, (d[b + 1] + d[c + 1]) / 2 * k); } else g.lineTo(d[b] * k, d[b + 1] * k);
    g.stroke();
  }
  g.restore();
}
const hitStroke = (s, x, y, r) => { // Radierer trifft, wenn ein Punkt oder eine Strecke näher als r liegt
  const d = s.d, rr = r + (s.t === "marker" ? s.w * 2 : s.w);
  for (let i = 0; i < d.length; i += 3) {
    if (Math.hypot(d[i] - x, d[i + 1] - y) < rr) return true;
    if (i >= 3) { const ax = d[i - 3], ay = d[i - 2], bx = d[i], by = d[i + 1], l = (bx - ax) ** 2 + (by - ay) ** 2 || 1, t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l)); if (Math.hypot(ax + t * (bx - ax) - x, ay + t * (by - ay) - y) < rr) return true; }
  }
  return false;
};
const bgImage = (blob) => new Promise((ok) => { if (!blob) return ok(null); const u = URL.createObjectURL(blob), im = new Image(); im.onload = () => { ok(im); URL.revokeObjectURL(u); }; im.onerror = () => { ok(null); URL.revokeObjectURL(u); }; im.src = u; });

// Seite als Canvas (Hintergrund + Tinte), k = Pixel je Einheit
export async function renderPageCanvas(p, k = SC) {
  const cv = document.createElement("canvas"); cv.width = Math.round(p.w * k); cv.height = Math.round(p.h * k);
  const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
  const im = await bgImage(p.bg); if (im) g.drawImage(im, 0, 0, cv.width, cv.height);
  for (const s of p.strokes) drawStroke(g, s, k);
  return cv;
}

// ---- Export / Import ----
const blobToData = (b) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
const dataToBlob = async (u) => (await fetch(u)).blob();
export async function bookToPdf(b) {
  const doc = new jsPDF({ unit: "pt", format: [b.pages[0].w, b.pages[0].h], orientation: b.pages[0].w > b.pages[0].h ? "l" : "p", compress: true });
  doc.setProperties({ title: b.title, creator: "elplexaCAD Handnotizen" });
  for (let i = 0; i < b.pages.length; i++) {
    const p = b.pages[i]; if (i) doc.addPage([p.w, p.h], p.w > p.h ? "l" : "p");
    if (p.bg) { const t = p.bg.type === "image/png" ? "PNG" : "JPEG"; doc.addImage(await blobToData(p.bg), t, 0, 0, p.w, p.h, undefined, "FAST"); }
    doc.setLineCap("round"); doc.setLineJoin("round");
    for (const s of p.strokes) {
      const d = s.d, n = d.length / 3, rgb = [1, 3, 5].map((j) => parseInt(s.c.slice(j, j + 2), 16));
      doc.setDrawColor(...rgb); doc.setFillColor(...rgb);
      if (s.t === "marker") {
        doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: 0.35, "stroke-opacity": 0.35 })); doc.setLineCap("butt"); doc.setLineWidth(s.w * 4);
        for (let j = 1; j < n; j++) doc.line(d[(j - 1) * 3], d[(j - 1) * 3 + 1], d[j * 3], d[j * 3 + 1]);
        doc.restoreGraphicsState(); doc.setLineCap("round");
      } else if (n === 1) doc.circle(d[0], d[1], Math.max(0.5, s.w * (0.4 + d[2]) / 2), "F");
      else for (let j = 1; j < n; j++) { doc.setLineWidth(s.w * (0.4 + 1.2 * (d[(j - 1) * 3 + 2] + d[j * 3 + 2]) / 2)); doc.line(d[(j - 1) * 3], d[(j - 1) * 3 + 1], d[j * 3], d[j * 3 + 1]); }
    }
  }
  return doc.output("blob");
}
export async function bookToJson(b) {
  const pages = []; for (const p of b.pages) pages.push({ ...p, bg: p.bg ? await blobToData(p.bg) : null });
  return new Blob([JSON.stringify({ format: "elplexa-handnotizen", version: 1, book: { ...b, thumb: "", pages } })], { type: "application/json" });
}
export async function bookFromJson(text) {
  const j = JSON.parse(text);
  if (j?.format !== "elplexa-handnotizen" || !Array.isArray(j.book?.pages)) throw new Error("Das ist keine Sicherung von Handnotizen.");
  const pages = []; for (const p of j.book.pages) pages.push({ w: +p.w || PW, h: +p.h || PH, bg: p.bg ? await dataToBlob(p.bg) : null, text: String(p.text || ""), strokes: (p.strokes || []).filter((s) => Array.isArray(s.d) && s.d.length >= 3 && s.d.length % 3 === 0).map((s) => ({ t: s.t === "marker" ? "marker" : "pen", c: /^#[0-9a-f]{6}$/i.test(s.c) ? s.c : COLORS[0], w: +s.w || 2.4, d: s.d.map(Number) })) });
  if (!pages.length) pages.push(newPage());
  return { id: uid(), title: String(j.book.title || "Importiert").slice(0, 120), created: Date.now(), changed: Date.now(), thumb: "", pages };
}
const canvasBlob = (cv, t, q) => new Promise((ok) => cv.toBlob(ok, t, q));
// Seiten aus einer PDF als Hintergrundbilder (längste Seite ca. 1800 px, JPEG: klein genug für den Browserspeicher)
export async function pagesFromPdf(bytes) {
  const { doc, pages, close } = await openPdf(bytes), out = [];
  try {
    for (let n = 1; n <= pages; n++) {
      const pg = await doc.getPage(n), v1 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: Math.min(3, 1800 / Math.max(v1.width, v1.height)) });
      const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
      await pg.render({ canvas: cv, canvasContext: g, viewport: vp }).promise;
      const fit = Math.min(1, 842 / Math.max(v1.width, v1.height)) || 1; // Seiteneinheit: höchstens A4-Grösse, Seitenverhältnis bleibt
      out.push(newPage(Math.round(v1.width * fit), Math.round(v1.height * fit), await canvasBlob(cv, "image/jpeg", 0.85)));
      cv.width = cv.height = 0;
    }
  } finally { close(); }
  return out;
}
export async function pageFromImage(file) {
  const im = await bgImage(file); if (!im) throw new Error("Das Bild liess sich nicht lesen.");
  const k = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight)), cv = document.createElement("canvas");
  cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
  const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
  const w = Math.min(PW, cv.width), h = Math.round(w * cv.height / cv.width);
  return newPage(w, h, await canvasBlob(cv, "image/jpeg", 0.88));
}
export async function importFile(file) { // -> { title, pages } oder { book }
  const name = file.name.replace(/\.[^.]+$/, "") || "Importiert", ext = (file.name.match(/\.([^.]+)$/)?.[1] || "").toLowerCase();
  if (ext === "json" || file.type === "application/json") return { book: await bookFromJson(await file.text()) };
  if (ext === "pdf" || file.type === "application/pdf") return { title: name, pages: await pagesFromPdf(new Uint8Array(await file.arrayBuffer())) };
  if (/^image\//.test(file.type) || /^(jpe?g|png|gif|webp|heic)$/.test(ext)) return { title: name, pages: [await pageFromImage(file)] };
  throw new Error("Dieses Format kann ich nicht lesen. Erlaubt sind PDF, Bilder (JPG, PNG) und Sicherungen (.json).");
}
async function saveBlob(blob, name, toast) {
  const f = new File([blob], name, { type: blob.type });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [f] })) { // iPad: Teilen-Fenster (In Dateien sichern, GoodNotes, Mail …)
    try { await navigator.share({ files: [f], title: name }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000); toast?.(`Gesichert: ${name}`);
}
const safe = (s) => String(s).replace(/[^\w.\-äöüÄÖÜ ]+/g, "_").trim() || "Notiz";

// ---- Oberfläche ----
const IC = { back: "M15 5l-7 7 7 7", plus: "M12 5v14M5 12h14", undo: "M9 7L4 12l5 5M4 12h10a6 6 0 010 12", redo: "M15 7l5 5-5 5M20 12H10a6 6 0 000 12" };
const ico = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

// o = { sheets(): [{i, label}], sheetsPdf(indices): Promise<Blob>, toast(msg, kind), confirm(title, text, ok): Promise<bool>, onClose() }
export async function openHand(o) {
  document.getElementById("hn")?.remove();
  const root = document.createElement("div"); root.id = "hn"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Handnotizen");
  document.body.append(root);
  const toast = (m, k) => o.toast?.(m, k);
  let books = [], q = "", ed = null, saveT = 0, diag = false;
  const cleanup = [];
  try { await db(); books = await listBooks(); } catch { toast("Der Browser erlaubt hier keinen Speicher (privates Fenster?). Notizen gehen beim Schliessen verloren.", "error"); }
  const mem = new Map(books.map((b) => [b.id, b]));
  const persist = async (b) => { b.changed = Date.now(); mem.set(b.id, b); try { await putBook(b); } catch { toast("Speichern nicht möglich (Speicher voll?). Bitte als Sicherung exportieren.", "error"); } };
  const close = async () => { await flush(); cleanup.forEach((f) => f()); root.remove(); o.onClose?.(); };
  const flush = async () => { clearTimeout(saveT); saveT = 0; if (ed) { await makeThumb(ed.book); await persist(ed.book); } };
  const later = () => { clearTimeout(saveT); saveT = setTimeout(() => { saveT = 0; persist(ed.book); }, 700); };
  async function makeThumb(b) { const c = await renderPageCanvas(b.pages[0], 0.35); b.thumb = c.toDataURL("image/jpeg", 0.6); }
  async function addBook(b) { await makeThumb(b); await persist(b); }

  // -- Bibliothek --
  async function library() {
    ed = null; root.className = "hn-lib";
    const all = [...mem.values()].sort((a, b) => b.changed - a.changed), list = searchBooks(all, q);
    let est = ""; try { const e = await navigator.storage?.estimate?.(); if (e?.usage) est = ` · Browser-Speicher belegt: ${fmtSize(e.usage)}${e.quota ? " von " + fmtSize(e.quota) : ""}`; } catch { /* ohne Angabe */ }
    root.innerHTML = `<header class="hn-bar"><button class="hn-btn" data-a="exit">${ico(IC.back)}<span>Übersicht</span></button><h1>Handnotizen</h1>
      <input type="search" class="hn-search" placeholder="Suchen in Titel und Text" value="${esc(q)}" aria-label="Suchen in Titel und getipptem Text" enterkeyhint="search">
      <button class="hn-btn" data-a="proj"><span>Aus Projekt …</span></button><button class="hn-btn" data-a="imp"><span>Importieren</span></button><button class="hn-btn primary" data-a="new">${ico(IC.plus)}<span>Neue Notiz</span></button></header>
      <main class="hn-grid">${list.map((b) => `<article class="hn-card" tabindex="0" data-id="${b.id}"><div class="hn-th">${b.thumb ? `<img src="${b.thumb}" alt="">` : ""}</div><div class="hn-ct"><strong>${esc(b.title)}</strong><span>${b.pages.length} ${b.pages.length === 1 ? "Seite" : "Seiten"} · ${new Date(b.changed).toLocaleDateString("de-CH")} · ${fmtSize(sizeOf(b))}</span></div><button class="hn-del" data-del="${b.id}" aria-label="${esc(b.title)} löschen">×</button></article>`).join("")
        || `<p class="hn-empty">${all.length ? "Nichts gefunden." : "Noch keine Notiz. «Neue Notiz» legt ein leeres Blatt an, «Importieren» nimmt PDF, Bilder oder eine Sicherung, «Aus Projekt» einzelne Blätter dieses Projekts."}</p>`}</main>
      <footer class="hn-foot">Privat: bleibt in diesem Browser auf diesem Gerät, nicht im Projekt und nicht im Teilen-Link${est}. Zum Sichern oder Weitergeben: Export als PDF oder Sicherung.</footer>
      <input type="file" id="hn-file" hidden accept=".pdf,application/pdf,image/*,.json,application/json" multiple>`;
    const s = root.querySelector(".hn-search"); s.oninput = () => { q = s.value; const pos = s.selectionStart; library().then(() => { const n = root.querySelector(".hn-search"); n.focus(); n.setSelectionRange(pos, pos); }); };
  }
  async function adoptImport(r, into) {
    if (r.book) { await addBook(r.book); toast(`Importiert: „${r.book.title}“`); return r.book; }
    if (into) { into.pages.push(...r.pages); return into; }
    const b = newBook(r.title); b.pages = r.pages; await addBook(b); toast(`Importiert: „${b.title}“, ${b.pages.length} ${b.pages.length === 1 ? "Seite" : "Seiten"}`); return b;
  }
  async function doImport(files, into) {
    for (const f of files) {
      try { toast(`Lese ${f.name} …`); const b = await adoptImport(await importFile(f), into); if (into) { later(); await openBook(b, ed?.page); return; } }
      catch (e) { toast(e.message || String(e), "error"); }
    }
    if (!into) library();
  }
  function projDialog(into) {
    const sh = o.sheets?.() || [];
    if (!sh.length) return toast("Das Projekt hat keine Blätter.", "error");
    openModal("Blätter aus dem Projekt", `<p>Die gewählten Blätter werden als Hintergrund kopiert; das Projekt bleibt unverändert. Danach schreibst du darauf.</p><div class="hn-pick">${sh.map((s) => `<label><input type="checkbox" value="${s.i}"> ${esc(s.label)}</label>`).join("")}</div><div class="actions"><button class="btn outline" data-c>Abbrechen</button><button class="btn primary" data-ok>Übernehmen</button></div>`, async (b, done) => {
      if (b.dataset.c !== undefined) return done(null);
      const idx = [...document.querySelectorAll("#modal-root .hn-pick input:checked")].map((x) => Number(x.value));
      if (!idx.length) return;
      done(true);
      try { toast("Blätter werden umgewandelt …"); const pdf = await o.sheetsPdf(idx); const pages = await pagesFromPdf(new Uint8Array(await pdf.arrayBuffer())); await adoptImport({ title: "Blätter aus Projekt", pages }, into); if (into) { later(); await openBook(into, into.pages.length - pages.length); } else library(); }
      catch (e) { toast("Übernehmen ging nicht: " + (e.message || e), "error"); }
    }, null, ".hn-pick input");
  }

  // -- Editor --
  async function openBook(b, page = 0) {
    await flush();
    const st = { tool: "pen", ci: 0, wi: 1, zoom: 0, finger: false, undo: [], redo: [] };
    ed = { book: b, page };
    root.className = "hn-ed";
    root.innerHTML = `<header class="hn-bar"><button class="hn-btn" data-a="lib">${ico(IC.back)}<span>Notizen</span></button>
      <input class="hn-title" value="${esc(b.title)}" aria-label="Titel" maxlength="120" spellcheck="false">
      <div class="hn-tools" role="toolbar" aria-label="Werkzeuge">${TOOLS.map(([k, l]) => `<button class="hn-btn hn-tl" data-tool="${k}" aria-pressed="${k === st.tool}">${l}</button>`).join("")}
        <span class="hn-sep"></span>${COLORS.map((c, i) => `<button class="hn-col" data-ci="${i}" style="--c:${c}" aria-label="Farbe ${i + 1}" aria-pressed="${i === st.ci}"></button>`).join("")}
        <span class="hn-sep"></span>${WIDTHS.map((w, i) => `<button class="hn-w" data-wi="${i}" aria-label="Strichstärke ${i + 1}" aria-pressed="${i === st.wi}"><i style="height:${w + 1}px"></i></button>`).join("")}
        <span class="hn-sep"></span><button class="hn-btn icon" data-a="undo" aria-label="Rückgängig" title="Rückgängig">${ico(IC.undo)}</button><button class="hn-btn icon" data-a="redo" aria-label="Wiederholen" title="Wiederholen">${ico(IC.redo)}</button></div>
      <div class="hn-right"><button class="hn-btn" data-a="text" aria-pressed="false" title="Text zur Seite, nur für die Suche">Text</button><button class="hn-btn" data-a="more" aria-haspopup="menu">Mehr</button></div></header>
      <div class="hn-scroll" id="hn-scroll"><div class="hn-pages"></div></div>
      <div class="hn-textp" hidden><label>Text zu dieser Seite (zum Suchen, nicht auf der Seite sichtbar) <textarea rows="3" spellcheck="true"></textarea></label></div>
      <div class="hn-status"><button class="hn-btn" data-a="prev" aria-label="Vorige Seite">‹</button><span class="hn-pg"></span><button class="hn-btn" data-a="next" aria-label="Nächste Seite">›</button>
        <button class="hn-btn" data-a="addpage">＋ Seite</button><button class="hn-btn" data-a="zoomout" aria-label="Verkleinern">−</button><button class="hn-btn" data-a="fit">Einpassen</button><button class="hn-btn" data-a="zoomin" aria-label="Vergrössern">＋</button>
        <span class="hn-diag" hidden></span></div>
      <div class="hn-menu" hidden role="menu"></div>
      <input type="file" id="hn-file" hidden accept=".pdf,application/pdf,image/*" multiple>`;
    const sc = root.querySelector("#hn-scroll"), host = root.querySelector(".hn-pages"), diagEl = root.querySelector(".hn-diag");
    const els = [];
    const base = () => Math.min(1, (sc.clientWidth - 32) / PW);
    const pageW = () => (st.zoom || base()) * PW; // CSS-Breite der Seite von 595 Einheiten
    const sizePage = (i) => { const p = b.pages[i], w = pageW() * p.w / PW; els[i].wrap.style.width = w + "px"; els[i].wrap.style.height = w * p.h / p.w + "px"; };
    const redraw = async (i) => {
      const e = els[i], p = b.pages[i]; if (!e.on) return;
      const k = Math.min(SC, 3600 / Math.max(p.w, p.h)); e.k = k; e.cv.width = Math.round(p.w * k); e.cv.height = Math.round(p.h * k);
      const g = e.cv.getContext("2d"); g.clearRect(0, 0, e.cv.width, e.cv.height); for (const s of p.strokes) drawStroke(g, s, k);
    };
    const mount = (i) => {
      const p = b.pages[i], wrap = document.createElement("div"); wrap.className = "hn-page"; wrap.dataset.i = i;
      const img = document.createElement("img"); img.alt = ""; img.draggable = false; if (p.bg) { img.src = URL.createObjectURL(p.bg); wrap.append(img); }
      const cv = document.createElement("canvas"); wrap.append(cv); host.append(wrap);
      els[i] = { wrap, cv, img, on: false, k: SC, url: img.src };
      sizePage(i);
      io.observe(wrap);
    };
    const io = new IntersectionObserver((en) => en.forEach((x) => { const i = Number(x.target.dataset.i), e = els[i]; if (!e) return; if (x.isIntersecting && !e.on) { e.on = true; redraw(i); } else if (!x.isIntersecting && e.on) { e.on = false; e.cv.width = e.cv.height = 1; } }), { root: sc, rootMargin: "600px 0px" });
    cleanup.push(() => io.disconnect());
    const build = () => { host.innerHTML = ""; els.length = 0; b.pages.forEach((_, i) => mount(i)); status(); };
    const status = () => {
      const ctr = sc.scrollTop + sc.clientHeight / 3; let cur = 0;
      els.forEach((e, i) => { if (e.wrap.offsetTop <= ctr) cur = i; }); ed.page = cur;
      root.querySelector(".hn-pg").textContent = `Seite ${cur + 1} von ${b.pages.length}`;
      const tp = root.querySelector(".hn-textp textarea"); if (tp !== document.activeElement) tp.value = b.pages[cur].text;
      root.querySelector('[data-a="undo"]').disabled = !st.undo.length; root.querySelector('[data-a="redo"]').disabled = !st.redo.length;
    };
    const goto = (i) => { i = Math.max(0, Math.min(b.pages.length - 1, i)); sc.scrollTo({ top: els[i].wrap.offsetTop - 8, behavior: "auto" }); status(); };
    const setZoom = (z) => { const keep = ed.page, f = z / (st.zoom || base()); st.zoom = z; els.forEach((_, i) => sizePage(i)); sc.scrollTop = els[keep].wrap.offsetTop - 8 + (sc.scrollTop - (els[keep].wrap.offsetTop - 8)) * f; };
    build(); goto(page);
    sc.addEventListener("scroll", status, { passive: true });
    const onResize = () => { if (!st.zoom) els.forEach((_, i) => sizePage(i)); };
    window.addEventListener("resize", onResize); cleanup.push(() => window.removeEventListener("resize", onResize));

    // Stift
    const pt = (e, i) => { const r = els[i].wrap.getBoundingClientRect(), p = b.pages[i]; return [(e.clientX - r.left) / r.width * p.w, (e.clientY - r.top) / r.height * p.h]; };
    const pageAt = (t) => { const w = t.closest?.(".hn-page"); return w ? Number(w.dataset.i) : -1; };
    const touches = new Map(); let cur = null, penT = 0, pan = null, pinch = null, stats = { pen: 0, touch: 0, mouse: 0, palm: 0, pr: 0, tilt: "–", co: 0, pt: "–" };
    const showDiag = () => { diagEl.hidden = !diag; if (diag) diagEl.textContent = `Gerät ${stats.pt} · Druck ${stats.pr.toFixed(2)} · Neigung ${stats.tilt} · Stift ${stats.pen} Finger ${stats.touch} Maus ${stats.mouse} · Handballen abgewiesen ${stats.palm} · Zwischenpunkte ${stats.co}`; };
    const canvasOf = (i) => els[i].cv, ctxOf = (i) => canvasOf(i).getContext("2d");
    const draws = (e) => e.pointerType === "pen" || e.pointerType === "mouse" || (e.pointerType === "touch" && st.finger);
    const penBusy = () => cur?.pen || performance.now() - penT < 500;
    sc.addEventListener("pointerdown", (e) => {
      stats.pt = e.pointerType; stats[e.pointerType] = (stats[e.pointerType] || 0) + 1; stats.pr = e.pressure; stats.tilt = `${Math.round(e.tiltX || 0)}°/${Math.round(e.tiltY || 0)}°`;
      if (e.pointerType === "pen") penT = performance.now();
      if (e.pointerType === "touch" && !st.finger && (penBusy() || Math.max(e.width, e.height) > 40)) { stats.palm++; showDiag(); return; } // Handballen
      showDiag();
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const i = pageAt(e.target);
      if (draws(e) && i >= 0 && !cur) {
        e.preventDefault(); try { sc.setPointerCapture(e.pointerId); } catch { /* Ereignis ohne aktiven Zeiger */ }
        const [x, y] = pt(e, i), pr = e.pointerType === "pen" ? e.pressure || 0.5 : 0.5;
        if (st.tool === "eraser") { cur = { i, pen: e.pointerType === "pen", id: e.pointerId, erase: [], x, y }; erase(x, y); return; }
        cur = { i, pen: e.pointerType === "pen", id: e.pointerId, s: { t: st.tool, c: COLORS[st.ci], w: WIDTHS[st.wi], d: [r1(x), r1(y), r2(pr)] } };
        dot(cur);
        return;
      }
      if (e.pointerType === "touch") { // Finger: schieben, zwei Finger zoomen
        try { sc.setPointerCapture(e.pointerId); } catch { /* Ereignis ohne aktiven Zeiger */ } touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 1) pan = { x: e.clientX, y: e.clientY, top: sc.scrollTop, left: sc.scrollLeft };
        if (touches.size === 2) { pan = null; const [a, c] = [...touches.values()]; pinch = { d: Math.hypot(a.x - c.x, a.y - c.y), z: st.zoom || base() }; }
      }
    });
    const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
    function dot(c) { const g = ctxOf(c.i), k = els[c.i].k; if (c.s.t === "marker") return live(c); drawStroke(g, { ...c.s }, k); }
    function live(c) { // Marker: ganze Seite neu, damit der Strich beim Zeichnen nicht an sich selbst dunkler wird
      const e = els[c.i]; const g = e.cv.getContext("2d"); g.clearRect(0, 0, e.cv.width, e.cv.height); for (const s of b.pages[c.i].strokes) drawStroke(g, s, e.k); drawStroke(g, c.s, e.k);
    }
    function erase(x, y) {
      const c = cur, p = b.pages[c.i], r = 8 + WIDTHS[st.wi] * 2; let hit = false;
      for (let j = p.strokes.length - 1; j >= 0; j--) if (hitStroke(p.strokes[j], x, y, r)) { c.erase.push({ j, s: p.strokes[j] }); p.strokes.splice(j, 1); hit = true; }
      if (hit) redraw(c.i);
    }
    sc.addEventListener("pointermove", (e) => {
      if (cur && e.pointerId === cur.id) {
        e.preventDefault();
        const evs = e.getCoalescedEvents?.(); const list = evs?.length ? evs : [e]; stats.co += list.length - 1; stats.pr = e.pressure; stats.tilt = `${Math.round(e.tiltX || 0)}°/${Math.round(e.tiltY || 0)}°`;
        if (diag) showDiag();
        for (const ev of list) {
          const [x, y] = pt(ev, cur.i);
          if (cur.erase) { erase(x, y); continue; }
          const s = cur.s, d = s.d, n = d.length; if (Math.hypot(d[n - 3] - x, d[n - 2] - y) < 0.6) continue;
          d.push(r1(x), r1(y), r2(cur.pen ? ev.pressure || 0.5 : 0.5));
          if (s.t === "marker") live(cur);
          else if (d.length >= 6) { const g = ctxOf(cur.i); drawStroke(g, { ...s, d: d.slice(-9) }, els[cur.i].k); }
        }
        return;
      }
      const t = touches.get(e.pointerId); if (!t) return;
      t.x = e.clientX; t.y = e.clientY;
      if (touches.size === 1 && pan) { sc.scrollTop = pan.top - (e.clientY - pan.y); sc.scrollLeft = pan.left - (e.clientX - pan.x); }
      else if (touches.size === 2 && pinch) { const [a, c] = [...touches.values()]; setZoom(Math.max(0.3, Math.min(4, pinch.z * Math.hypot(a.x - c.x, a.y - c.y) / pinch.d))); }
    }, { passive: false });
    const up = (e) => {
      if (cur && e.pointerId === cur.id) {
        const c = cur; cur = null; if (c.pen) penT = performance.now();
        if (c.erase) { if (c.erase.length) { st.undo.push({ k: "del", i: c.i, list: c.erase }); st.redo = []; later(); } }
        else { b.pages[c.i].strokes.push(c.s); st.undo.push({ k: "add", i: c.i, s: c.s }); st.redo = []; later(); if (c.s.t === "marker") redraw(c.i); }
        status(); return;
      }
      if (touches.delete(e.pointerId)) { if (touches.size < 2) pinch = null; if (!touches.size) pan = null; else if (touches.size === 1) { const t = [...touches.values()][0]; pan = { x: t.x, y: t.y, top: sc.scrollTop, left: sc.scrollLeft }; } }
    };
    sc.addEventListener("pointerup", up); sc.addEventListener("pointercancel", up);
    sc.addEventListener("contextmenu", (e) => e.preventDefault());
    sc.addEventListener("wheel", (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(Math.max(0.3, Math.min(4, (st.zoom || base()) * (e.deltaY < 0 ? 1.1 : 0.9)))); } }, { passive: false });

    const undo = () => { const a = st.undo.pop(); if (!a) return; const p = b.pages[a.i]; if (a.k === "add") p.strokes.splice(p.strokes.indexOf(a.s), 1); else [...a.list].sort((x, y) => x.j - y.j).forEach(({ j, s }) => p.strokes.splice(j, 0, s)); st.redo.push(a); redraw(a.i); later(); status(); };
    const redo = () => { const a = st.redo.pop(); if (!a) return; const p = b.pages[a.i]; if (a.k === "add") p.strokes.push(a.s); else a.list.forEach(({ s }) => p.strokes.splice(p.strokes.indexOf(s), 1)); st.undo.push(a); redraw(a.i); later(); status(); };
    const menu = root.querySelector(".hn-menu");
    const actions = {
      lib: async () => { await flush(); library(); }, undo, redo,
      text: (btn) => { const t = root.querySelector(".hn-textp"); t.hidden = !t.hidden; btn.setAttribute("aria-pressed", String(!t.hidden)); if (!t.hidden) t.querySelector("textarea").focus(); },
      prev: () => goto(ed.page - 1), next: () => goto(ed.page + 1),
      addpage: () => { const last = b.pages[ed.page]; b.pages.splice(ed.page + 1, 0, newPage(last.w, last.h)); const at = ed.page + 1; build(); goto(at); later(); },
      zoomin: () => setZoom(Math.min(4, (st.zoom || base()) * 1.25)), zoomout: () => setZoom(Math.max(0.3, (st.zoom || base()) / 1.25)), fit: () => { st.zoom = 0; els.forEach((_, i) => sizePage(i)); goto(ed.page); },
      more: (btn) => { menu.hidden = !menu.hidden; if (!menu.hidden) { menu.innerHTML = [["pdf", "Export als PDF"], ["png", "Export dieser Seite als Bild (PNG)"], ["save", "Sicherung (.json, zum Wiederherstellen)"], ["appendfile", "PDF oder Bild anhängen …"], ["appendproj", "Blätter aus dem Projekt anhängen …"], ["delpage", "Diese Seite löschen"], ["finger", `Finger schreibt: ${st.finger ? "an" : "aus"}`], ["diag", `Stifttest anzeigen: ${diag ? "an" : "aus"}`]].map(([k, l]) => `<button class="hn-mi" role="menuitem" data-m="${k}">${l}</button>`).join(""); } },
    };
    const menuActs = {
      pdf: async () => { toast("PDF wird erstellt …"); await saveBlob(await bookToPdf(b), safe(b.title) + ".pdf", toast); },
      png: async () => { const cv = await renderPageCanvas(b.pages[ed.page], 2); await saveBlob(await canvasBlob(cv, "image/png"), `${safe(b.title)}-${ed.page + 1}.png`, toast); },
      save: async () => saveBlob(await bookToJson(b), safe(b.title) + ".handnotizen.json", toast),
      appendfile: () => { const f = root.querySelector("#hn-file"); f.onchange = () => { doImport([...f.files], b); f.value = ""; }; f.click(); },
      appendproj: () => projDialog(b),
      delpage: async () => { if (b.pages.length < 2) return toast("Die letzte Seite bleibt. Die ganze Notiz löschst du in der Übersicht.", "error"); if (!(await o.confirm("Seite löschen?", `Seite ${ed.page + 1} mit allem, was darauf steht, wird gelöscht.`, "Löschen"))) return; const at = ed.page; b.pages.splice(at, 1); st.undo = []; st.redo = []; build(); goto(Math.min(at, b.pages.length - 1)); later(); },
      finger: () => { st.finger = !st.finger; toast(st.finger ? "Finger schreibt jetzt auch." : "Finger schiebt und zoomt, nur der Stift schreibt."); },
      diag: () => { diag = !diag; showDiag(); },
    };
    root.onclick = async (e) => {
      const t = e.target.closest("button"); if (!t || !root.contains(t)) { menu.hidden = true; return; }
      if (t.dataset.m) { menu.hidden = true; return menuActs[t.dataset.m]?.(); }
      if (!t.closest(".hn-menu") && t.dataset.a !== "more") menu.hidden = true;
      if (t.dataset.tool) { st.tool = t.dataset.tool; root.querySelectorAll("[data-tool]").forEach((x) => x.setAttribute("aria-pressed", String(x === t))); }
      else if (t.dataset.ci) { st.ci = +t.dataset.ci; if (st.tool === "eraser") st.tool = "pen"; root.querySelectorAll("[data-ci]").forEach((x) => x.setAttribute("aria-pressed", String(x === t))); root.querySelectorAll("[data-tool]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.tool === st.tool))); }
      else if (t.dataset.wi) { st.wi = +t.dataset.wi; root.querySelectorAll("[data-wi]").forEach((x) => x.setAttribute("aria-pressed", String(x === t))); }
      else actions[t.dataset.a]?.(t);
    };
    root.querySelector(".hn-title").oninput = (e) => { b.title = e.target.value; later(); };
    root.querySelector(".hn-textp textarea").oninput = (e) => { b.pages[ed.page].text = e.target.value; later(); };
    const onKey = (e) => {
      if (!root.isConnected || !ed || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    };
    document.addEventListener("keydown", onKey); cleanup.push(() => document.removeEventListener("keydown", onKey));
    status();
  }

  // -- Bibliothek-Klicks --
  root.addEventListener("click", async (e) => {
    if (!root.classList.contains("hn-lib")) return;
    const t = e.target.closest("button, .hn-card"); if (!t) return;
    if (t.dataset.del) { e.stopPropagation(); const b = mem.get(t.dataset.del); if (b && await o.confirm("Notiz löschen?", `„${b.title}“ mit ${b.pages.length} Seiten wird gelöscht. Das lässt sich nicht rückgängig machen (vorher als Sicherung exportieren).`, "Löschen")) { mem.delete(b.id); try { await delBook(b.id); } catch { /* Liste stimmt trotzdem */ } library(); } return; }
    if (t.dataset.a === "exit") return close();
    if (t.dataset.a === "new") { const b = newBook(); await addBook(b); return openBook(b); }
    if (t.dataset.a === "imp") { const f = root.querySelector("#hn-file"); f.onchange = () => { doImport([...f.files]); f.value = ""; }; return f.click(); }
    if (t.dataset.a === "proj") return projDialog(null);
    if (t.classList.contains("hn-card")) openBook(mem.get(t.dataset.id));
  });
  root.addEventListener("keydown", (e) => { if (root.classList.contains("hn-lib") && e.key === "Enter" && e.target.classList?.contains("hn-card")) openBook(mem.get(e.target.dataset.id)); if (e.key === "Escape" && root.classList.contains("hn-lib") && !document.querySelector("#modal-root .modal")) close(); });
  const hide = () => { if (document.visibilityState === "hidden") flush(); };
  document.addEventListener("visibilitychange", hide); cleanup.push(() => document.removeEventListener("visibilitychange", hide));
  navigator.storage?.persist?.().catch(() => {}); // bittet den Browser, die Notizen nicht von sich aus zu löschen
  await library();
  return { root, mem, close };
}
