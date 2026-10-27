// Dateien im Projekt (CJ 27.10.2026): die erzeugten PDFs je Projekt, bis 4 Ordner. Name, Datum, Modul, Ordner und Grösse stehen in der Projektdatei (doc.project.files, doc.project.folders, siehe model.js cleanProject).
// Die PDF-Dateien selbst liegen im Browser dieses Geräts (IndexedDB, Schlüssel = Kennung der Datei), nicht in der Projektdatei: sonst würde sie zu gross.
// Auf einem anderen Gerät sieht man den Eintrag, das PDF fehlt dort.
const DB = "elplexacad-dateien";
let dbp = null;
const db = () => dbp ??= new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore("pdf"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// Ein Schreib- oder Lesevorgang am Speicher; tx.oncomplete meldet den Abschluss, nicht der Request
async function run(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => { const tx = d.transaction("pdf", mode), q = fn(tx.objectStore("pdf")); tx.oncomplete = () => res(q?.result ?? null); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
}
export const putPdf = (id, blob) => run("readwrite", (s) => s.put(blob, id));
export const delPdf = (id) => run("readwrite", (s) => s.delete(id));
export const getPdf = (id) => run("readonly", (s) => s.get(id)); // null, wenn das PDF auf diesem Gerät fehlt

export const newId = () => Math.random().toString(36).slice(2, 10); // Kennung von Datei und Ordner, passt zu cleanProject

// Öffnet ein gespeichertes PDF im neuen Tab (wie beim Knopf PDF); die Adresse bleibt 10 min gültig
export function openPdf(blob, name) {
  const url = URL.createObjectURL(new File([blob], name, { type: "application/pdf" }));
  setTimeout(() => URL.revokeObjectURL(url), 600000);
  return window.open(url, "_blank");
}
