// SchemaCAD: Dateien (JSON speichern/öffnen, DXF, PDF). Bekommt die Editor-Funktionen von app.js übergeben.
import { parseModel } from "./model.js";
import { exportDxf } from "./dxf.js";
import { W, H } from "./frame.js";
import * as R from "./render.js";
import * as D from "./dispo.js";
import * as T from "./titel.js";
import * as L from "./legende.js";
import { zipFiles } from "./zip.js";
import { openModal } from "./dialogs.js";

export function makeFiles(c) {
  const { S, $, adoptDeck, markDirty, docText, toast, confirmDialog, closeEditor, setFileName, markClean, updateUndoButtons, setTool, renderSheetBar, renderSheet, renderItems, renderOverlay, renderRight, afterSheetChange, pv, sheetLabel } = c;
  const hasFS = "showSaveFilePicker" in window && "showOpenFilePicker" in window;
  const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, "-").trim();
  function baseName() {
    if (ELPLEXA) { const n = S.doc.project?.name || (S.fileName !== "Unbenannt" ? S.fileName : ""); if (n) return safeName(n) || "Projekt"; } // elplexaCAD: Projektname, sonst Dateiname
    const m = S.model.meta; return safeName((T.isDeck(S.model) ? "" : m.TITEL) || m.OBJEKT || "Schema") || "Schema"; }
  // elplexaCAD speichert als .elplexa.json, öffnet aber auch alte .schemacad.json; Projektname ohne Endung.
  // elplexaCAD: Projektname ohne .elplexa.json, .schemacad.json oder .json (alte Dateien öffnen weiter).
  const sheetName = (sh) => baseName() + (sh.kind === "dispo" ? "_Dispo" : "");

  function download(name, text, type) {
    if (ELPLEXA && S.elLocked() && !/\.(dxf|zip)$/i.test(name)) { S.elUnlock(); return; } // elplexaCAD im Netz ohne Anmeldung: nur DXF (CJ 17.10.)
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function writeHandle(handle, text) { const w = await handle.createWritable(); await w.write(text); await w.close(); }

  async function saveJson(forceAs) {
    closeEditor(true);
    if (ELPLEXA && !(await S.elUnlock())) return;
    const text = docText();
    try {
      if (hasFS) {
        let h = S.fileHandle;
        if (!h || forceAs) h = await window.showSaveFilePicker({ suggestedName: `${baseName()}${ELPLEXA ? ".elplexa.json" : ".schemacad.json"}`, types: [{ description: ELPLEXA ? "elplexaCAD-Datei" : "SchemaCAD-Datei", accept: { "application/json": [".json"] } }] });
        await writeHandle(h, text);
        S.fileHandle = h; setFileName(ELPLEXA ? h.name.replace(/(\.elplexa|\.schemacad)?\.json$/i, "") || h.name : h.name); markClean(); toast("Gespeichert: " + h.name);
        if (ELPLEXA) dispatchEvent(new CustomEvent("el-file", { detail: { file: h.name, handle: h } })); // zuletzt geöffnete Projekte
      } else {
        const name = `${baseName()}${ELPLEXA ? ".elplexa.json" : ".schemacad.json"}`;
        download(name, text, "application/json"); setFileName(ELPLEXA ? name.replace(/(\.elplexa|\.schemacad)?\.json$/i, "") || name : name); markClean(); toast("Die Datei wurde in den Download-Ordner geladen: " + name);
        if (ELPLEXA) dispatchEvent(new CustomEvent("el-file", { detail: { file: name, handle: null } }));
      }
    } catch (err) { if (err && err.name === "AbortError") return; toast("Speichern hat nicht geklappt: " + (err.message || err) + ". Prüfe, ob der Ordner beschreibbar ist, oder speichere unter einem anderen Namen (⇧⌘S).", "error"); }
  }

  async function loadText(text, name, handle) {
    const m = parseModel(text);
    S.doc = m; S.active = m.active; S.sel.clear(); S.undo = []; S.redo = []; S.fileHandle = handle || null; S.wireDraft = null;
    const note = adoptDeck(); // alte Datei: Titelseite und Inhalt kommen dazu, Schemablätter rücken um 2
    setFileName(ELPLEXA ? name.replace(/(\.elplexa|\.schemacad)?\.json$/i, "") || name : name); markClean(); updateUndoButtons(); setTool("select"); afterSheetChange(null, { reset: true, fit: true });
    if (note) { markDirty(); toast(note); }
    if (ELPLEXA) dispatchEvent(new CustomEvent("el-file", { detail: { file: name, handle: handle || null } }));
  }
  async function openJson() {
    if (S.dirty && !(await confirmDialog("Ungespeicherte Änderungen", "Beim Öffnen gehen die Änderungen am aktuellen Blatt verloren.", "Trotzdem öffnen"))) return;
    try {
      if (hasFS) {
        const [h] = await window.showOpenFilePicker({ types: [{ description: ELPLEXA ? "elplexaCAD-Datei" : "SchemaCAD-Datei", accept: { "application/json": [".json"] } }] });
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

  // Druckseiten in #printroot: eine Seite pro Blatt (Stringübersicht und Legende auch mehrere). Gibt die Anzahl Seiten zurück.
  // Stringplan: eigenes Papier und Massstab, Stringübersicht: eigenes Papier (PV-Strings Schritt 7, pvprint.js).
  // only: null = alle Blätter, ein Blatt oder eine Liste von Blättern (Reihenfolge immer wie in der Datei)
  function buildPrint(only = null) {
    closeEditor(true);
    const pick = only === null ? null : new Set(Array.isArray(only) ? only : [only]);
    const pages = S.doc.sheets.map((sh, i) => [sh, i]).filter(([sh]) => !pick || pick.has(sh)).flatMap(([sh, i]) => {
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
  // Papier eines Blatts im Druck: Stringplan und Stringübersicht ihr eigenes, Legende A4 hoch, alles andere A4 quer
  function sheetPaper(sh) {
    const p = sh.kind === "pv" || sh.kind === "pvtab" ? pv.paperOf(sh) : { size: "A4", quer: sh.kind !== "legend" };
    return { key: p.size + (p.quer ? "q" : "h"), label: `${p.size} ${p.quer ? "quer" : "hoch"}` };
  }
  // Druck in Gruppen gleichen Papiers (CJ 17.10.: mit Schema und Stringplan in einer Datei kamen Stringplan und Stringübersicht in A4 quer).
  // Chrome übernimmt im Druckdialog das Papier der ersten Seite für alle Seiten (Annahme Claude aus CJs Befund, Headless-Chromium mischt richtig).
  // Darum je Papier ein eigener Druckdialog, in der Reihenfolge der Datei. Ab dem zweiten fragt ein Fenster, damit der Druck einen Klick als Auslöser hat.
  // Rückgabe: Gruppen [{ key, label, sheets }]
  function paperGroups(sheets) {
    const groups = [];
    for (const sh of S.doc.sheets.filter((x) => sheets.includes(x))) {
      const p = sheetPaper(sh), g = groups.find((x) => x.key === p.key);
      if (g) g.sheets.push(sh); else groups.push({ ...p, sheets: [sh] });
    }
    return groups;
  }
  async function printSheets(sheets, suffix = "") {
    const groups = paperGroups(sheets), old = document.title, pvUsed = sheets.some((sh) => sh.kind === "pv" || sh.kind === "pvtab");
    if (!groups.length) return;
    if (pvUsed) await pv.preparePrint(); // PDF-Pläne der Stringpläne fertig rendern
    const finish = () => { document.title = old; $("#printroot").innerHTML = ""; if (pvUsed) pv.resetPrintParts(); }; // 5av: Druckteile wieder an
    for (let k = 0; k < groups.length; k++) {
      const g = groups[k];
      if (k && !(await confirmDialog("Nächstes Papierformat", `Druck ${k + 1} von ${groups.length}: ${g.label}, ${g.sheets.map((sh) => sheetLabel(sh, S.doc.sheets.indexOf(sh))).join(", ")}. Im Druckdialog wieder „Als PDF sichern“ wählen.`, "Drucken"))) break;
      buildPrint(g.sheets);
      document.title = baseName() + suffix + (groups.length > 1 ? `_${g.label.replace(" ", "-")}` : "");
      await new Promise((res) => { const done = () => { window.removeEventListener("afterprint", done); setTimeout(res, 0); }; window.addEventListener("afterprint", done); window.print(); });
    }
    finish();
  }
  // Knopf PDF (CJ 17.10.): Blätter wählen, Vorgabe alle, Schnellwahl aktuelles Blatt. only: gleich drucken ohne Auswahl (Legende).
  async function printPdf(only = null) {
    closeEditor(true);
    if (ELPLEXA && !(await S.elUnlock())) return;
    if (only) { await printSheets([only], only.kind === "legend" ? "_Legende" : ""); return; }
    const sh = S.doc.sheets, row = (s, i) => `<label class="chk"><input type="checkbox" data-psheet="${i}" checked> <span>${R.esc(sheetLabel(s, i))}${s.meta?.TITEL && s.meta.TITEL !== sheetLabel(s, i) ? ` · ${R.esc(s.meta.TITEL)}` : ""}</span><span class="note print-paper">${sheetPaper(s).label}</span></label>`;
    const body = `<p>Welche Blätter? Reihenfolge wie in der Datei. Im Druckdialog „Als PDF sichern“ wählen.</p>`
      + `<div class="row"><button class="btn outline small" data-pall>Alle</button><button class="btn outline small" data-pcur>Nur aktuelles Blatt</button></div>`
      + `<div class="print-list">${sh.map(row).join("")}</div><p class="note" data-pmix></p>`
      + `<div class="actions"><button class="btn outline" data-c>Abbrechen</button><button class="btn primary" data-ok>Drucken</button></div>`;
    const root = $("#modal-root"), boxes = () => [...root.querySelectorAll("[data-psheet]")];
    const chosen = () => boxes().filter((b) => b.checked).map((b) => sh[Number(b.dataset.psheet)]);
    const mix = () => { // Hinweis bei mehreren Papierformaten, Knopf zeigt die Anzahl Druckdialoge
      const g = paperGroups(chosen()), n = root.querySelector("[data-pmix]"), ok = root.querySelector("[data-ok]");
      if (n) n.textContent = g.length > 1 ? `Verschiedene Papierformate (${g.map((x) => x.label).join(", ")}): Chrome druckt alle Seiten im Format der ersten. Darum ${g.length} Drucke nacheinander, je Format eine PDF.` : "";
      if (ok) { ok.textContent = g.length > 1 ? `Drucken (${g.length}×)` : "Drucken"; ok.disabled = !g.length; }
    };
    const res = openModal("PDF / Drucken", body, (b, done) => {
      if (b.dataset.pall !== undefined || b.dataset.pcur !== undefined) { boxes().forEach((x) => { x.checked = b.dataset.pall !== undefined || Number(x.dataset.psheet) === S.active; }); mix(); }
      else if (b.dataset.ok !== undefined) done(chosen());
      else if (b.dataset.c !== undefined) done(null);
    }, null, "[data-ok]", "print-modal");
    root.addEventListener("change", mix); mix();
    const list = await res;
    root.removeEventListener("change", mix);
    if (list?.length) await printSheets(list);
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
  const printLegend = () => { const l = S.doc.sheets.find((sh) => sh.kind === "legend"); if (l) printPdf(l); else toast("Diese Datei hat keine Legende."); };
  return { hasFS, safeName, baseName, download, saveJson, loadText, openJson, saveDxf, saveDxfAll, buildPrint, printPdf, printLegend, paperGroups };
}
