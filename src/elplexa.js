// elplexaCAD (Aufbau B, CJ 17.10.2026): getrennte Module mit Projektübersicht. Nur im Bau `node build.mjs elplexa` aktiv.
// Ein Modul ist eine Gruppe von Blattarten derselben Datei. Welches Modul offen ist, folgt aus dem aktiven Blatt.
import { esc } from "./render.js";
import { cell } from "./auswertung.js";

export const MODULES = [
  { id: "schema", label: "Schema", sub: "Stromlaufschema mit Grundverkabelung", color: "#2f6db3" },
  { id: "dispo", label: "Disposition", sub: "Verteileraufbau, massstäblich", color: "#2f9e58" },
  { id: "pv", label: "PV-Stringplan", short: "PV", sub: "Strangplan auf dem Dachplan", color: "#d4a900" },
  { id: "plan", label: "Plan", sub: "Installationsplan auf dem Grundriss", color: "#b45309", later: true },
  { id: "prinzip", label: "Prinzipschema", sub: "Übersicht der Verteiler und Zuleitungen", color: "#7a4fb0", later: true },
];
export const modById = (id) => MODULES.find((m) => m.id === id); // als Funktion: im SchemaCAD-Bau fällt alles weg

// Titelseite, Inhalt und Legende gehören vorerst zum Schema (sie gibt es nur mit Schemablatt)
export const moduleOf = (sh) => (sh.kind === "dispo" ? "dispo" : sh.kind === "pv" || sh.kind === "pvtab" ? "pv" : "schema");
export const modIdx = (doc, id) => doc.sheets.map((sh, i) => (moduleOf(sh) === id ? i : -1)).filter((i) => i >= 0);
// Neues Blatt im Modul: welche Einträge des Plus-Menüs (data-new) dazugehören
export const ADD_KINDS = { schema: ["sheet", "deck"], dispo: ["dispo"], pv: ["pv", "pvtab"] };

const dot = (m) => `<span class="el-dot" style="background:${m.color}" aria-hidden="true"></span>`;

// Projektdaten: aus der Übersicht (doc.project.meta), sonst wie bisher Schriftfeld des ersten Arbeitsblatts; Bauherr von der Titelseite
const workSheet = (doc) => doc.sheets.find((sh) => !["title", "toc", "legend"].includes(sh.kind)) || doc.sheets[0];
export const bauherrInfo = (doc) => doc.sheets.find((sh) => sh.kind === "title")?.info || doc.info || null;
export function projectData(doc) {
  const pm = doc.project?.meta || {}, w = workSheet(doc)?.meta || {};
  return { OBJEKT: pm.OBJEKT ?? w.OBJEKT ?? "", AUFTRAG: pm.AUFTRAG ?? w.AUFTRAG ?? "", BAUHERR: bauherrInfo(doc)?.BAUHERR ?? "", INDEX: pm.INDEX ?? w.INDEX ?? "" };
}
export const statusOf = (doc) => doc.project?.status || "In Arbeit"; // Annahme: ohne Angabe „In Arbeit“
const STATUS_IDS = () => ({ "Offerte": "of", "In Arbeit": "ia", "Abgegeben": "ab", "Abgeschlossen": "ag" });
export const statusPill = (st) => `<span class="el-st" data-st="${STATUS_IDS()[st] || "ia"}" title="Projektstatus">${esc(st)}</span>`;

// Zeit: Stunden mit Komma, Datum JJJJ-MM-TT → TT.MM.JJJJ
export const fmtH = (h) => String(Math.round(h * 100) / 100).replace(".", ",");
export const fmtD = (d) => d.split("-").reverse().join(".");
export const timeSum = (doc) => (doc.project?.time || []).reduce((a, e) => a + e.h, 0);
// CSV zum direkten Öffnen in Excel, gleiche Art wie die Listen (auswertung.js: BOM, Semikolon, Formelschutz cell).
// Dezimalpunkt (Excel de-CH). Nach Datum sortiert, Summe am Schluss.
export function timeCsv(doc) {
  const r = (h) => String(Math.round(h * 100) / 100), row = (a) => a.map(cell).join(";");
  const rows = [...(doc.project?.time || [])].sort((a, b) => a.d.localeCompare(b.d)).map((e) => row([fmtD(e.d), r(e.h), e.n]));
  return "\ufeff" + [row(["Datum", "Stunden", "Notiz"]), ...rows, row(["Summe", r(timeSum(doc)), ""])].join("\r\n") + "\r\n";
}
function timeHTML(doc, today) {
  const t = (doc.project?.time || []).map((e, k) => [e, k]).sort((a, b) => b[0].d.localeCompare(a[0].d) || b[1] - a[1]);
  const rows = t.map(([e, k]) => `<div class="el-trow"><span>${fmtD(e.d)}</span><span class="el-th2">${fmtH(e.h)} h</span><span class="el-tn">${esc(e.n) || "–"}</span><button class="btn icon el-tdel" data-eltdel="${k}" title="Eintrag löschen" aria-label="Eintrag vom ${fmtD(e.d)} löschen"><span aria-hidden="true">×</span></button></div>`).join("");
  return `<section class="el-time" aria-label="Zeit"><div class="el-eyerow"><span class="el-eye">Zeit</span><span class="el-sum">Summe <b>${fmtH(timeSum(doc))} h</b></span></div>
    <form class="el-tform" id="el-tform" autocomplete="off"><input type="date" id="el-td" value="${today}" aria-label="Datum" required><input type="text" id="el-th" inputmode="decimal" placeholder="Std." aria-label="Stunden" required><input type="text" id="el-tn" placeholder="Notiz" aria-label="Notiz" maxlength="500"><button class="btn primary" type="submit">Eintragen</button></form>
    <div class="el-tlist">${rows || `<p class="el-note">Noch keine Einträge. Stunden mit Komma oder Punkt, z. B. 1,5.</p>`}</div>
    <div class="el-acts"><button class="btn outline" data-elact="csv"${t.length ? "" : " disabled"}><span>Als CSV exportieren</span></button></div></section>`;
}

export function hubHTML(doc, o) {
  const pd = projectData(doc), st = statusOf(doc);
  const fld = (k, label) => `<label class="el-row"><span>${label}</span><input data-elp="${k}" value="${esc(pd[k])}" placeholder="–" spellcheck="false"></label>`;
  const opts = ["Offerte", "In Arbeit", "Abgegeben", "Abgeschlossen"].map((x) => `<option${x === st ? " selected" : ""}>${x}</option>`).join("");
  const fileHint = o.file && o.suggest !== o.file ? `<p class="el-note">Datei: ${esc(o.file)}. Speichern unter (⇧⌘S) schlägt „${esc(o.suggest)}“ vor.</p>` : "";
  const tiles = MODULES.filter((m) => !m.later).map((m, n) => {
    const idx = modIdx(doc, m.id);
    if (!idx.length) return "";
    return `<button class="el-tile" data-elopen="${m.id}"><span class="el-th">${dot(m)}${m.label}<kbd>${n + 1}</kbd></span><span class="el-ts">${idx.length} ${idx.length === 1 ? "Blatt" : "Blätter"} · ${m.sub}</span><span class="el-thumbs">${idx.slice(0, 6).map(() => "<i></i>").join("")}</span></button>`;
  }).join("");
  return `<div class="el-hubin"><div class="el-col">
    <section class="el-proj" aria-label="Projekt"><div class="el-eyerow"><span class="el-eye">Projekt</span><label class="el-stsel">${statusPill(st)}<select data-elp="status" aria-label="Projektstatus">${opts}</select></label></div>
      <input class="el-name" data-elp="name" value="${esc(o.name)}" aria-label="Projektname (klicken zum Umbenennen)" title="Klicken zum Umbenennen" spellcheck="false">${fileHint}
      ${fld("OBJEKT", "Objekt")}${fld("AUFTRAG", "Auftrag")}${fld("BAUHERR", "Bauherr")}${fld("INDEX", "Index")}
      <p class="el-note">Gilt für die Schriftfelder aller Blätter und Module, Bauherr auch für die Titelseite. Einzelne Blätter lassen sich im Schriftfeld weiter ändern.</p>
      <div class="el-acts"><button class="btn primary" data-elact="pdf"><span class="ic" data-ic="pdf"></span><span>Plansatz-PDF …</span></button></div></section>
    <section class="el-projs" aria-label="Projekte"><div class="el-eyerow"><span class="el-eye">Projekte</span><button class="btn outline small" data-elact="newproj"><span class="ic" data-ic="plus"></span><span>Neues Projekt …</span></button></div>
      <div id="el-recent" class="el-recent"></div>
      <div id="el-online" class="el-online"></div></section></div>
    <div class="el-col"><section class="el-mods" aria-label="Module dieses Projekts"><span class="el-eye">Module dieses Projekts</span><div class="el-grid">${tiles}
      <button class="el-tile el-new" id="el-addmod" data-elact="addmod" aria-haspopup="menu" aria-expanded="false"><span class="el-th">+ Modul</span><span class="el-ts">Schema, Disposition, PV · Plan und Prinzipschema später</span></button></div>
      <p class="el-note">Tasten: 1 bis ${MODULES.filter((m) => !m.later).length} öffnet ein Modul, 0 die Übersicht, ? alle Tasten.</p></section>
    ${timeHTML(doc, o.today)}</div></div>`;
}

// Zuletzt geöffnete Projekte (im Browser, IndexedDB): Name, Status, Zeit und, wo der Browser es kann, der Dateizugriff (FileSystemFileHandle).
// Ohne Dateizugriff (Safari, Firefox) nur der Name; Öffnen geht dann über die Dateiauswahl.
function idb() {
  return new Promise((res, rej) => { const r = indexedDB.open("elplexacad", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
export async function recentList() {
  try { const db = await idb(); return await new Promise((res) => { const q = db.transaction("kv").objectStore("kv").get("recent"); q.onsuccess = () => res(Array.isArray(q.result) ? q.result : []); q.onerror = () => res([]); }); } catch { return []; }
}
async function recentPut(list) {
  try { const db = await idb(); await new Promise((res) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(list, "recent"); tx.oncomplete = res; tx.onerror = res; tx.onabort = res; }); } catch { /* ohne Liste weiterarbeiten */ }
}
const same = async (a, b) => { try { return !!(a && b && (await a.isSameEntry(b))); } catch { return false; } };
// e = { file, name, status, handle }; gleiche Datei (oder ohne Dateizugriff gleicher Dateiname) kommt nach vorn, höchstens 8
export async function recentAdd(e) {
  const list = await recentList(), keep = [];
  for (const x of list) if (!(e.handle ? await same(x.handle, e.handle) : !x.handle && x.file === e.file)) keep.push(x);
  let entry = { ...e, t: Date.now() };
  try { structuredClone(entry); } catch { entry = { ...entry, handle: null }; }
  await recentPut([entry, ...keep].slice(0, 8));
}
export async function recentDrop(k) { const list = await recentList(); list.splice(k, 1); await recentPut(list); }
export function recentHTML(list) {
  if (!list.length) return `<p class="el-note">Noch keine. Gespeicherte und geöffnete Projekte erscheinen hier.</p>`;
  const when = (t) => new Date(t).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  return list.map((e, k) => `<button class="el-rrow" data-elrecent="${k}" title="${e.handle ? "Öffnen" : "Dieser Browser merkt sich nur den Namen: Datei wählen"}"><span class="el-rn">${esc(e.name || e.file)}</span>${e.status ? statusPill(e.status) : ""}<span class="el-rs">${esc(e.file)} · ${when(e.t)}${e.handle ? "" : " · Datei wählen"}</span></button>`).join("");
}

// Online-Projekte (Schritt 3): Knöpfe, Anmeldung, Liste der eigenen Online-Projekte. o = { user, list (null = noch nicht geladen), link, busy, locked }
const when2 = (t) => new Date(t).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
export function onlineHTML(o) {
  const head = `<div class="el-eyerow"><span class="el-eye">Online</span>${o.user ? `<span class="el-acct">${esc(o.user)} · <button class="el-link" data-elact="logout">Abmelden</button></span>`
    : `<button class="btn ${o.locked ? "primary" : "outline"} small" data-elact="login">Anmelden</button>`}</div>${o.locked ? `<p class="el-note el-lock">Ohne Anmeldung lässt sich nur als DXF speichern. Projektdatei, PDF, Listen, Kataloge und Online-Projekte gibt es mit Anmeldung.</p>` : ""}`;
  const state = o.locked ? "" : o.link ? `<p class="el-note">Online gespeichert am ${when2(o.link.at)}. Die Datei bleibt der Hauptweg.</p>` : `<p class="el-note">Eine Kopie online speichern, um sie auf einem anderen Rechner zu öffnen. Die Datei bleibt der Hauptweg.</p>`;
  const rows = o.list === null ? "" : o.list.length ? o.list.map((e) => `<div class="el-orow"><button class="el-rrow" data-elonline="${esc(e.id)}"${o.link?.id === e.id ? ' aria-current="true"' : ""}><span class="el-rn">${esc(e.name)}</span>${e.status ? statusPill(e.status) : ""}<span class="el-rs">${when2(e.updated_at)}${o.link?.id === e.id ? " · dieses Projekt" : ""}</span></button><button class="btn icon el-tdel" data-elodel="${esc(e.id)}" title="Online-Projekt löschen" aria-label="Online-Projekt ${esc(e.name)} löschen"${o.busy ? " disabled" : ""}><span aria-hidden="true">×</span></button></div>`).join("")
    : `<p class="el-note">Noch keine Online-Projekte.</p>`;
  return `${head}${state}<div class="el-acts"><button class="btn outline" data-elact="onsave"${o.busy ? " disabled" : ""}><span>Online speichern</span></button><button class="btn outline" data-elact="onlist"${o.busy ? " disabled" : ""}><span>${o.list === null ? "Online-Projekte zeigen" : "Liste aktualisieren"}</span></button></div>${rows ? `<div class="el-recent el-onlist">${rows}</div>` : ""}`;
}

// Menü „+ Modul“: fehlende Module anlegen, spätere Module ausgegraut
export function addModMenuHTML(doc) {
  return MODULES.map((m) => {
    const has = modIdx(doc, m.id).length > 0, off = m.later || has;
    return `<button class="mi" role="menuitem" data-elnew="${m.id}" tabindex="-1"${off ? " disabled" : ""}>${dot(m)}<span class="mt"><span class="mh">${m.label}${m.later ? " (später)" : has ? " (schon da)" : ""}</span><span class="ms">${m.sub}</span></span></button>`;
  }).join("");
}

export function modMenuHTML(doc, cur) {
  return MODULES.filter((m) => !m.later).map((m, n) => {
    const has = modIdx(doc, m.id).length > 0;
    return `<button class="mi" role="menuitem" data-elopen="${m.id}" tabindex="-1"${m.id === cur ? ' aria-current="true"' : ""}>${dot(m)}<span class="mt"><span class="mh">${m.label}</span><span class="ms">${m.id === cur ? "Jetzt offen" : has ? `Taste ${n + 1}` : "Noch nicht im Projekt: wird angelegt"}</span></span></button>`;
  }).join("") + `<button class="mi" role="menuitem" data-elact="hub" tabindex="-1"><span class="el-dot" aria-hidden="true"></span><span class="mt"><span class="mh">Projektübersicht</span><span class="ms">Taste 0</span></span></button>`;
}

export function crumbHTML(cur, st) {
  const m = modById(cur);
  return `<button class="btn el-back" data-elact="hub" title="Projektübersicht (0)">‹ Übersicht</button><span class="el-sl" aria-hidden="true">/</span>`
    + `<button class="btn el-cur" id="el-mod" data-elact="modmenu" aria-haspopup="menu" aria-expanded="false" title="Anderes Modul öffnen (1 bis 3)">${dot(m)}<span class="el-lbl">${m.label}</span><span class="caret" aria-hidden="true">▾</span></button>${statusPill(st)}`;
}

export const keysHTML = () => `<div class="el-keys">${[
  ["1 2 3", "Schema, Disposition, PV öffnen"], ["0", "Projektübersicht"], ["§", "Seitenleisten aus und ein (Taste links neben der 1)"],
  ["Bild ↑ ↓", "Blatt zurück und vor, innerhalb des Moduls"], ["G", "Liste der Blätter des Moduls"], ["?", "diese Hilfe"],
].map(([k, t]) => `<kbd>${k}</kbd><span>${t}</span>`).join("")}</div><p>Im Schema gelten 1 bis 4 beim Setzen eines Geräts oder bei einem gewählten Gerät weiter für die Polzahl.</p>`;
