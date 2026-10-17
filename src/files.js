// SchemaCAD: Dateien (JSON speichern/öffnen, DXF, PDF). Bekommt die Editor-Funktionen von app.js übergeben.
import { parseModel } from "./model.js";
import { exportDxf } from "./dxf.js";
import { W, H } from "./frame.js";
import * as R from "./render.js";
import * as D from "./dispo.js";
import * as T from "./titel.js";
import * as L from "./legende.js";
import { zipFiles } from "./zip.js";

export function makeFiles(c) {
  const { S, $, adoptDeck, markDirty, docText, toast, confirmDialog, closeEditor, setFileName, markClean, updateUndoButtons, setTool, renderSheetBar, renderSheet, renderItems, renderOverlay, renderRight, afterSheetChange, pv } = c;
  const hasFS = "showSaveFilePicker" in window && "showOpenFilePicker" in window;
  const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, "-").trim();
  function baseName() { const m = S.model.meta; return safeName((T.isDeck(S.model) ? "" : m.TITEL) || m.OBJEKT || "Schema") || "Schema"; }
  const sheetName = (sh) => baseName() + (sh.kind === "dispo" ? "_Dispo" : "");

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function writeHandle(handle, text) { const w = await handle.createWritable(); await w.write(text); await w.close(); }

  async function saveJson(forceAs) {
    closeEditor(true);
    const text = docText();
    try {
      if (hasFS) {
        let h = S.fileHandle;
        if (!h || forceAs) h = await window.showSaveFilePicker({ suggestedName: `${baseName()}.schemacad.json`, types: [{ description: "SchemaCAD-Datei", accept: { "application/json": [".json"] } }] });
        await writeHandle(h, text);
        S.fileHandle = h; setFileName(h.name); markClean(); toast("Gespeichert: " + h.name);
      } else {
        const name = `${baseName()}.schemacad.json`;
        download(name, text, "application/json"); setFileName(name); markClean(); toast("Die Datei wurde in den Download-Ordner geladen: " + name);
      }
    } catch (err) { if (err && err.name === "AbortError") return; toast("Speichern hat nicht geklappt: " + (err.message || err) + ". Prüfe, ob der Ordner beschreibbar ist, oder speichere unter einem anderen Namen (⇧⌘S).", "error"); }
  }

  async function loadText(text, name, handle) {
    const m = parseModel(text);
    S.doc = m; S.active = m.active; S.sel.clear(); S.undo = []; S.redo = []; S.fileHandle = handle || null; S.wireDraft = null;
    const note = adoptDeck(); // alte Datei: Titelseite und Inhalt kommen dazu, Schemablätter rücken um 2
    setFileName(name); markClean(); updateUndoButtons(); setTool("select"); afterSheetChange(null, { reset: true, fit: true });
    if (note) { markDirty(); toast(note); }
  }
  async function openJson() {
    if (S.dirty && !(await confirmDialog("Ungespeicherte Änderungen", "Beim Öffnen gehen die Änderungen am aktuellen Blatt verloren.", "Trotzdem öffnen"))) return;
    try {
      if (hasFS) {
        const [h] = await window.showOpenFilePicker({ types: [{ description: "SchemaCAD-Datei", accept: { "application/json": [".json"] } }] });
        const file = await h.getFile();
        await loadText(await file.text(), h.name, h);
      } else {
        const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json";
        inp.onchange = async () => { const f = inp.files[0]; if (!f) return; try { await loadText(await f.text(), f.name, null); } catch (err) { toast("Öffnen hat nicht geklappt: " + err.message, "error"); } };
        inp.click();
      }
    } catch (err) { if (err && err.name === "AbortError") return; toast("Öffnen hat nicht geklappt: " + (err.message || err), "error"); }
  }

  async function saveDxf() {
    closeEditor(true);
    if (S.model.kind === "pv" || S.model.kind === "pvtab") { toast("DXF für Stringpläne kommt später."); return; }
    if (T.isDeck(S.model)) { toast("DXF für Titelseite und Inhaltsverzeichnis kommt später. Sie sind im PDF enthalten."); return; }
    let text;
    try { text = exportDxf(S.model); } catch (err) { toast("Der DXF-Export ist fehlgeschlagen: " + (err.message || err) + ". Speichere das Blatt als JSON und melde den Fehler.", "error"); return; }
    const name = `${sheetName(S.model)}.dxf`;
    try {
      if (hasFS) {
        const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: "DXF-Zeichnung", accept: { "application/dxf": [".dxf"] } }] });
        await writeHandle(h, text); toast("DXF exportiert: " + h.name);
      } else { download(name, text, "application/octet-stream"); toast("Die DXF-Datei wurde in den Download-Ordner geladen: " + name); }
    } catch (err) { if (err && err.name === "AbortError") return; toast("DXF-Export hat nicht geklappt: " + (err.message || err), "error"); }
  }

  // Alle Blätter als eine PDF: eine Seite pro Blatt im Druckdialog (Ziel: Als PDF sichern). Gibt die Anzahl Seiten zurück.
  // Stringplan: eigenes Papier und Massstab, Stringübersicht: A4 quer, eine oder mehrere Seiten (PV-Strings Schritt 7, pvprint.js).
  // only: nur dieses Blatt (z. B. die Legende allein)
  function buildPrint(only = null) {
    closeEditor(true);
    const pages = S.doc.sheets.filter((sh) => !only || sh === only).flatMap((sh, i) => {
      if (sh.kind === "pv" || sh.kind === "pvtab") return pv.printPages(sh, i);
      if (sh.kind === "legend") return L.printPages(S.doc, sh); // A4 hoch
      if (T.isDeck(sh)) return T.deckPrintPages(S.doc, sh);
      if (sh.kind === "dispo") { // freie Fläche: Inhalt mit Rand auf eine Seite einpassen, Linienstärke in Papier-mm
        const o = D.planOpts(sh), b = D.contentBBox(sh.items, o) || { x0: 0, y0: 0, x1: W, y1: H }, pad = Math.max(20, (b.x1 - b.x0) * 0.03);
        const x0 = b.x0 - pad, w = b.x1 - b.x0 + 2 * pad, h = b.y1 - b.y0 + 2 * pad, y1 = b.y1 + pad;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${-y1} ${w} ${h}" style="--pw:${0.35 * Math.max(w / W, h / H)}"><g transform="scale(1 -1)">${R.itemsSVG(sh.items, "dispo", o)}</g></svg>`;
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><g transform="matrix(1 0 0 -1 0 ${H})">${R.sheetSVG(sh.meta, { on: false, size: S.grid.size }, 1)}${R.itemsSVG(sh.items, sh.kind)}</g></svg>`;
    });
    $("#printroot").innerHTML = pages.join("");
    return pages.length;
  }
  async function printPdf(only = null) {
    const old = document.title;
    if (!only) await pv.preparePrint(); // PDF-Pläne der Stringpläne fertig rendern
    buildPrint(only);
    document.title = baseName() + (only ? "_Legende" : "");
    const done = () => { document.title = old; $("#printroot").innerHTML = ""; window.removeEventListener("afterprint", done); if (!only) pv.resetPrintParts(); }; // 5av: Druckteile wieder an
    window.addEventListener("afterprint", done);
    window.print();
  }

  async function saveDxfAll() {
    closeEditor(true);
    const files = [];
    try {
      S.doc.sheets.forEach((sh, i) => sh.kind !== "pv" && sh.kind !== "pvtab" && !T.isDeck(sh) && files.push([`${baseName()}_${sh.kind === "dispo" ? "Dispo" : "Blatt"}-${safeName(String(sh.meta.BLATT || i + 1))}.dxf`, exportDxf(sh)]));
    } catch (err) { toast("Der DXF-Export ist fehlgeschlagen: " + (err.message || err), "error"); return; }
    // Ordner wählen. Chrome sperrt in der Ordnerwahl Systemordner (z. B. ~/Library und damit iCloud Drive) und meldet
    // „Dieser Ordner kann nicht geöffnet werden“; die App erfährt nur „abgebrochen“. Darum danach immer die ZIP anbieten.
    let why = "";
    if (hasFS && window.showDirectoryPicker) {
      try {
        const dir = await window.showDirectoryPicker({ id: "schemacad-dxf", mode: "readwrite" });
        for (const [n, t] of files) { const h = await dir.getFileHandle(n, { create: true }); await writeHandle(h, t); }
        toast(`${files.length} DXF-Dateien exportiert nach: ${dir.name}`);
        return;
      } catch (err) { why = err && err.name === "AbortError" ? "Kein Ordner gewählt." : `Der Ordner liess sich nicht beschreiben (${err.message || err}).`; }
      if (!(await confirmDialog("Als ZIP laden?", `${why} Chrome kann manche Ordner nicht öffnen, zum Beispiel iCloud Drive. Alle ${files.length} DXF-Dateien lassen sich stattdessen als eine ZIP-Datei in den Download-Ordner laden.`, "ZIP laden"))) return;
    }
    saveZip(files);
  }
  // Alle DXF als eine ZIP-Datei direkt in den Download-Ordner: kein weiterer Dateidialog, der wieder an einem gesperrten Ordner scheitern könnte
  function saveZip(files) {
    const name = `${baseName()}_DXF.zip`;
    download(name, zipFiles(files), "application/zip");
    toast(`${files.length} DXF-Dateien als ZIP in den Download-Ordner geladen: ${name}`);
  }
  const printLegend = () => printPdf(S.doc.sheets.find((sh) => sh.kind === "legend") || null);
  return { hasFS, safeName, baseName, download, saveJson, loadText, openJson, saveDxf, saveDxfAll, buildPrint, printPdf, printLegend };
}
