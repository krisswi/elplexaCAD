// elplexaCAD (Aufbau B, CJ 17.10.2026): getrennte Module mit Projektübersicht. Nur im Bau `node build.mjs elplexa` aktiv.
// Ein Modul ist eine Gruppe von Blattarten derselben Datei. Welches Modul offen ist, folgt aus dem aktiven Blatt.
import { esc } from "./render.js";
import { cell } from "./auswertung.js";
import { modOf, modVar, modName, MOD_STATUS } from "./model.js";
import { adrHTML, gwrHTML } from "./gwr.js";

export const MODULES = [
  { id: "schema", label: "Schema", sub: "Stromlaufschema mit Grundverkabelung", color: "#2f6db3" },
  { id: "dispo", label: "Disposition", sub: "Verteileraufbau, massstäblich", color: "#2f9e58" },
  { id: "pv", label: "PV-Stringplan", short: "PV", sub: "Strangplan auf dem Dachplan", color: "#d4a900" },
  { id: "plan", label: "Plan", sub: "Installationsplan auf dem Grundriss", color: "#b45309", later: true },
  { id: "prinzip", label: "Prinzipschema", sub: "Übersicht der Verteiler und Zuleitungen", color: "#7a4fb0", later: true },
];
// Module mehrfach (CJ 18.10.2026): Kennung „schema“, „pv:2“ … (model.js modOf), Art = Teil vor dem Doppelpunkt
export const baseOf = (id) => String(id).split(":")[0];
export const modById = (id) => MODULES.find((m) => m.id === baseOf(id)); // als Funktion: im SchemaCAD-Bau fällt alles weg

// Titelseite, Inhalt und Legende gehören vorerst zum ersten Schema (sie gibt es nur mit Schemablatt)
export const moduleOf = modOf;
// Module des Projekts: zuerst die mit eigenem Platz (doc.mods[id].o, ⌥ + ←/→ in der Übersicht), dann in fester Folge: Art wie MODULES, dann Nummer
const ordNo = (doc, id) => doc.mods?.[id]?.o ?? Infinity;
export const modIds = (doc) => [...new Set(doc.sheets.map(modOf))].sort((a, b) => (ordNo(doc, a) === ordNo(doc, b) ? 0 : ordNo(doc, a) < ordNo(doc, b) ? -1 : 1) || MODULES.indexOf(modById(a)) - MODULES.indexOf(modById(b)) || modVar(a) - modVar(b));
// Modulstatus (CJ 20.10.2026), unabhängig vom Projektstatus (Annahme). Ohne Eintrag: Offen
export const modStatus = (doc, id) => doc.mods?.[id]?.st || MOD_STATUS[0];
const MST_IDS = ["of", "ia", "ge", "ve", "re", "ar"];
export const modPill = (doc, id, edit) => { const st = modStatus(doc, id), d = `class="el-mst" data-ms="${MST_IDS[MOD_STATUS.indexOf(st)]}"`;
  return edit ? `<span ${d} role="button" aria-haspopup="menu" aria-expanded="false" id="el-ms-${tileId(id).slice(8)}" tabindex="-1" data-elmst="${id}" title="Modulstatus: ${esc(st)}. Klick oder Taste S: ändern">${esc(st)}</span>` : `<span ${d} title="Modulstatus">${esc(st)}</span>`; };
export function modStatusMenuHTML(doc, id) {
  const cur = modStatus(doc, id);
  return `<div class="ctx-head">Status · ${esc(modName(doc, id))}</div>` + MOD_STATUS.map((s, i) => `<button class="mi" role="menuitemradio" aria-checked="${s === cur}" data-elmstset="${esc(s)}" tabindex="-1"><span class="el-mst" data-ms="${MST_IDS[i]}">${esc(s)}</span></button>`).join("");
}
export const tileId = (id) => `el-tile-${String(id).replace(":", "-")}`;
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
// Automatische Zeit (CJ 18.10.2026): vorläufige Einträge in doc.project.auto (Sekunden je Tag, Module). Zählen nicht in Summe und CSV.
// Offen = weder übernommen noch verworfen und mindestens 1 min. Vorschlag beim Übernehmen: auf 0,25 h gerundet, mindestens 0,25 h.
export const autoOpen = (doc) => (doc.project?.auto || []).filter((e) => !e.x && e.s >= 60).sort((a, b) => a.d.localeCompare(b.d));
export const autoHours = (s) => Math.max(0.25, Math.round(s / 900) / 4);
const AUTO_LBL = () => ({ schema: "Schema", dispo: "Dispo", pv: "PV" });
export const autoNote = (e) => MODULES.filter((m) => e.m.includes(m.id)).map((m) => AUTO_LBL()[m.id]).join(", ");
const fmtDur = (s) => { const m = Math.round(s / 60), h = Math.floor(m / 60); return h ? `${h} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`; };
// Zwei Stände zusammenführen (gleiche Kennung k): längere Zeit, alle Module. Übernommen/verworfen: beim Laden gilt, was eine Seite meldet;
// beim Rückgängig (undo = true) der Stand von a (dem zurückgeholten), damit ⌘Z ein Übernehmen aufhebt.
export function mergeAuto(a = [], b = [], undo = false) {
  const out = a.map((e) => ({ ...e, m: [...e.m] })), by = new Map(out.map((e) => [e.k, e]));
  for (const e of b) {
    const o = by.get(e.k);
    if (!o) { out.push({ ...e, m: [...e.m] }); continue; }
    o.s = Math.max(o.s, e.s); for (const m of e.m) if (!o.m.includes(m)) o.m.push(m);
    if (!undo && e.x && !o.x) o.x = e.x;
  }
  return out;
}
function autoHTML(doc, today) {
  const open = autoOpen(doc);
  if (!open.length) return "";
  const rows = open.map((e) => `<div class="el-arow" data-elz="${e.k}"><span class="el-ad">${fmtD(e.d)}${e.d === today ? ` <i>heute</i>` : ""}</span><span class="el-adur">${fmtDur(e.s)} erfasst</span>`
    + `<input class="el-ah" value="${fmtH(autoHours(e.s))}" inputmode="decimal" aria-label="Stunden vom ${fmtD(e.d)}"><input class="el-an" value="${esc(autoNote(e))}" maxlength="500" aria-label="Notiz vom ${fmtD(e.d)}">`
    + `<button class="btn primary small" data-elzok="${e.k}">Übernehmen</button><button class="btn icon el-tdel" data-elzweg="${e.k}" title="Verwerfen" aria-label="Vorläufigen Eintrag vom ${fmtD(e.d)} verwerfen"><span aria-hidden="true">×</span></button></div>`).join("");
  return `<div class="el-auto" role="group" aria-label="Vorläufige Zeit"><p class="el-ahead"><b>Vorläufig erfasst</b> beim Arbeiten in den Modulen. Prüfen, dann übernehmen oder verwerfen. Zählt erst nach dem Übernehmen.</p>${rows}</div>`;
}
function timeHTML(doc, today) {
  const t = (doc.project?.time || []).map((e, k) => [e, k]).sort((a, b) => b[0].d.localeCompare(a[0].d) || b[1] - a[1]);
  const rows = t.map(([e, k]) => `<div class="el-trow"><span>${fmtD(e.d)}</span><span class="el-th2">${fmtH(e.h)} h</span><span class="el-tn">${esc(e.n) || "–"}</span><button class="btn icon el-tdel" data-eltdel="${k}" title="Eintrag löschen" aria-label="Eintrag vom ${fmtD(e.d)} löschen"><span aria-hidden="true">×</span></button></div>`).join("");
  return `<section class="el-time" aria-label="Zeit"><div class="el-eyerow"><span class="el-eye">Zeit</span><span class="el-sum">Summe <b>${fmtH(timeSum(doc))} h</b></span></div>
    ${autoHTML(doc, today)}<form class="el-tform" id="el-tform" autocomplete="off"><input type="date" id="el-td" value="${today}" aria-label="Datum" required><input type="text" id="el-th" inputmode="decimal" placeholder="Std." aria-label="Stunden" required><input type="text" id="el-tn" placeholder="Notiz" aria-label="Notiz" maxlength="500"><button class="btn primary" type="submit">Eintragen</button></form>
    <div class="el-tlist">${rows || `<p class="el-note">Noch keine Einträge. Stunden mit Komma oder Punkt, z. B. 1,5.</p>`}</div>
    <div class="el-acts"><button class="btn outline" data-elact="csv"${t.length ? "" : " disabled"}><span>Als CSV exportieren</span></button></div></section>`;
}

// Blatt-Kacheln einer Modulkarte (CJ 18.10.2026): eine Reihe, höchstens 5, danach „+N“ (öffnet das Modul)
const THUMBS = 5, thumbs = (idx) => idx.slice(0, THUMBS);
// o.shared: geteilte Ansicht (Meilenstein 2, Schritt 1): alles nur lesbar, ohne Kachelmenüs, PDF, Projekte und Zeit
export function hubHTML(doc, o) {
  const pd = projectData(doc), st = statusOf(doc), ro = !!o.shared, roA = ro ? " readonly" : "";
  const fld = (k, label) => `<label class="el-row"><span>${label}</span><input data-elp="${k}" value="${esc(pd[k])}" placeholder="–" spellcheck="false"${roA}></label>`;
  const opts = ["Offerte", "In Arbeit", "Abgegeben", "Abgeschlossen"].map((x) => `<option${x === st ? " selected" : ""}>${x}</option>`).join("");
  const fileHint = o.file && o.suggest !== o.file ? `<p class="el-note">Datei: ${esc(o.file)}. Speichern unter (⇧⌘S) schlägt „${esc(o.suggest)}“ vor.</p>` : "";
  const tiles = modIds(doc).map((id, n) => { // Taste N = N-te Kachel (CJ 20.10.2026, nur in der Übersicht), bis 9
    const m = modById(id), idx = modIdx(doc, id);
    return `<button class="el-tile" id="${tileId(id)}" data-elopen="${id}" data-exact${ro ? "" : ` data-modctx="${id}"`} title="${esc(modName(doc, id))}${ro ? "" : ". Rechtsklick oder gedrückt halten: Umbenennen, Duplizieren, Löschen"}"><span class="el-th">${dot(m)}<span class="el-tn">${esc(modName(doc, id))}</span>${n < 9 ? `<kbd>${n + 1}</kbd>` : ""}</span><span class="el-ts"><span>${idx.length} ${idx.length === 1 ? "Blatt" : "Blätter"}</span>${modPill(doc, id, !ro)}${ro ? "" : `<span class="el-pdf" role="button" id="el-pdf-${tileId(id).slice(8)}" data-elpdf="${id}" title="${esc(modName(doc, id))} als PDF, alle Blätter">PDF</span>`}</span><span class="el-thumbs"><span class="el-shs">${thumbs(idx).map((i) => `<i id="el-sh-${i}" data-elsheet="${i}"${ro ? "" : ` data-ctx="${i}"`} title="${esc(o.label ? o.label(doc.sheets[i], i) : "")}${doc.sheets[i].meta.TITEL ? ` · ${esc(doc.sheets[i].meta.TITEL)}` : ""}. Klick öffnet das Blatt${ro ? "" : ". Rechtsklick oder gedrückt halten: Öffnen, Duplizieren, Löschen"}"></i>`).join("")}</span>${idx.length > THUMBS ? `<i class="el-more" id="el-more-${tileId(id).slice(8)}" data-elmore="${id}" role="button" aria-haspopup="menu" aria-expanded="false" title="Alle ${idx.length} Blätter zeigen">+${idx.length - THUMBS}</i>` : ""}</span></button>`;
  }).join("");
  return `<div class="el-hubin"><div class="el-col">
    <section class="el-proj" aria-label="Projekt"><div class="el-eyerow"><span class="el-eye">Projekt</span>${ro ? statusPill(st) : `<label class="el-stsel">${statusPill(st)}<select data-elp="status" aria-label="Projektstatus">${opts}</select></label>`}</div>
      <input class="el-name" data-elp="name" value="${esc(o.name)}"${ro ? ` aria-label="Projektname" readonly` : ` aria-label="Projektname (klicken zum Umbenennen)" title="Klicken zum Umbenennen"`} spellcheck="false">${fileHint}
      ${fld("OBJEKT", "Objekt")}${fld("AUFTRAG", "Auftrag")}${fld("BAUHERR", "Bauherr")}${fld("INDEX", "Index")}
      ${adrHTML(doc.project?.adr, ro)}${gwrHTML(doc.project?.gwr, { open: o.gwrOpen, busy: o.gwrBusy, ro })}
      ${ro ? "" : `<p class="el-note">Objekt, Auftrag und Index gelten für die Schriftfelder aller Blätter und Module, Bauherr auch für die Titelseite. Einzelne Blätter lassen sich im Schriftfeld weiter ändern.</p>
      <div class="el-acts"><button class="btn primary" data-elact="pdf"><span class="ic" data-ic="pdf"></span><span>Plansatz-PDF …</span></button></div>`}</section>
    ${ro ? sharedHTML(o.shared) : `<section class="el-projs" aria-label="Projekte"><div class="el-eyerow"><span class="el-eye">Projekte</span><button class="btn outline small" data-elact="newproj"><span class="ic" data-ic="plus"></span><span>Neues Projekt …</span></button></div>
      <div id="el-recent" class="el-recent"></div>
      <div id="el-online" class="el-online"></div></section>`}</div>
    <div class="el-col"><section class="el-mods" aria-label="Module dieses Projekts"><span class="el-eye">Module dieses Projekts</span><div class="el-grid">${tiles}
      ${ro ? "" : `<button class="el-tile el-new" id="el-addmod" data-elact="addmod" aria-haspopup="menu" aria-expanded="false"><span class="el-th">+ Modul</span><span class="el-ts">Schema, Disposition, PV · Plan und Prinzipschema später</span></button>`}</div>
      <p class="el-note">Tasten: 1 bis 9 öffnet die Kachel an dieser Stelle, ${ro ? "" : "S ändert den Status, ⌥ ← → ordnet um, "}0 die Übersicht, ? alle Tasten.</p></section>
    ${ro ? "" : timeHTML(doc, o.today)}</div></div>`;
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
  const head = `<div class="el-eyerow"><span class="el-eye">Online</span>${o.user ? `<span class="el-acct">${esc(o.user)}</span>` : `<span class="el-acct">Nicht angemeldet</span>`}</div>${o.locked ? `<p class="el-note el-lock">Ohne Anmeldung lässt sich nur als DXF speichern. Projektdatei, PDF, Listen, Kataloge und Online-Projekte gibt es mit Anmeldung. Anmelden: Konto-Kreis oben rechts.</p>` : ""}`;
  const state = o.locked ? "" : o.link ? `<p class="el-note">Online gespeichert am ${when2(o.link.at)}. Die Datei bleibt der Hauptweg.</p>${o.user ? `<div class="el-acts"><button class="btn outline small" data-elshare="${esc(o.link.id)}"${o.busy ? " disabled" : ""}><span>Link teilen …</span></button></div>` : ""}` : `<p class="el-note">Eine Kopie online speichern, um sie auf einem anderen Rechner zu öffnen. Die Datei bleibt der Hauptweg.</p>`;
  const rows = o.list === null ? "" : o.list.length ? o.list.map((e) => `<div class="el-orow"><button class="el-rrow" data-elonline="${esc(e.id)}"${o.link?.id === e.id ? ' aria-current="true"' : ""}><span class="el-rn">${esc(e.name)}</span>${e.status ? statusPill(e.status) : ""}<span class="el-rs">${when2(e.updated_at)}${o.link?.id === e.id ? " · dieses Projekt" : ""}</span></button><button class="btn icon el-oshare" data-elshare="${esc(e.id)}" title="Link teilen (nur ansehen)" aria-label="Online-Projekt ${esc(e.name)} per Link teilen"${o.busy ? " disabled" : ""}><span aria-hidden="true">↗</span></button><button class="btn icon el-tdel" data-elodel="${esc(e.id)}" title="Online-Projekt löschen" aria-label="Online-Projekt ${esc(e.name)} löschen"${o.busy ? " disabled" : ""}><span aria-hidden="true">×</span></button></div>`).join("")
    : `<p class="el-note">Noch keine Online-Projekte.</p>`;
  return `${head}${state}<div class="el-acts"><button class="btn outline" data-elact="onsave"${o.busy ? " disabled" : ""}><span>Online speichern</span></button><button class="btn outline" data-elact="onlist"${o.busy ? " disabled" : ""}><span>${o.list === null ? "Online-Projekte zeigen" : "Liste aktualisieren"}</span></button></div>${rows ? `<div class="el-recent el-onlist">${rows}</div>` : ""}`;
}

// Übersicht aller Blätter eines Moduls (Knopf „+N“ der Modulkarte, CJ 18.10.2026): Mini-Kachel, Blattname, Titel; Klick öffnet das Blatt
export function sheetPopHTML(doc, id, label) {
  const idx = modIdx(doc, id);
  return `<div class="ctx-head">${esc(modName(doc, id))} · ${idx.length} ${idx.length === 1 ? "Blatt" : "Blätter"}</div><div class="el-shlist">${idx.map((i) => {
    const sh = doc.sheets[i], t = sh.meta.TITEL && sh.meta.TITEL !== label(sh, i) ? sh.meta.TITEL : "";
    return `<button class="mi" role="menuitem" data-elsheet="${i}" tabindex="-1"><i aria-hidden="true"></i><span class="mt"><span class="mh">${esc(label(sh, i))}</span>${t ? `<span class="ms">${esc(t)}</span>` : ""}</span></button>`;
  }).join("")}</div>`;
}

// Menü „+ Modul“: neues Modul anlegen, auch ein weiteres derselben Art (CJ 18.10.2026), spätere Module ausgegraut
export function addModMenuHTML(doc) {
  return MODULES.map((m) => {
    const n = modIds(doc).filter((id) => baseOf(id) === m.id).length;
    return `<button class="mi" role="menuitem" data-elnew="${m.id}" tabindex="-1"${m.later ? " disabled" : ""}>${dot(m)}<span class="mt"><span class="mh">${m.label}${m.later ? " (später)" : n ? ` (${n + 1}.)` : ""}</span><span class="ms">${n && !m.later ? `Weiteres Modul, unabhängig vom bestehenden` : m.sub}</span></span></button>`;
  }).join("");
}

export function modMenuHTML(doc, cur) {
  const ids = modIds(doc), act = MODULES.filter((m) => !m.later);
  // vorhandene Module in der Reihenfolge der Übersicht (eigene Reihenfolge), danach die noch nicht angelegten Arten
  const rows = ids.map((id) => ({ id, m: modById(id), has: true })).concat(act.filter((m) => !ids.some((id) => baseOf(id) === m.id)).map((m) => ({ id: m.id, m, has: false })));
  return rows.map(({ id, m, has }) => `<button class="mi" role="menuitem" data-elopen="${id}"${has ? " data-exact" : ""} tabindex="-1"${id === cur ? ' aria-current="true"' : ""}>${dot(m)}<span class="mt"><span class="mh">${esc(has ? modName(doc, id) : m.label)}</span><span class="ms">${id === cur ? "Jetzt offen" : has ? `Taste ${act.indexOf(m) + 1}` : "Noch nicht im Projekt: wird angelegt"}</span></span></button>`).join("") + `<button class="mi" role="menuitem" data-elact="hub" tabindex="-1"><span class="el-dot" aria-hidden="true"></span><span class="mt"><span class="mh">Projektübersicht</span><span class="ms">Taste 0</span></span></button>`;
}

export function crumbHTML(cur, st, name) {
  const m = modById(cur);
  return `<button class="btn el-back" data-elact="hub" title="Projektübersicht (0)">‹ Übersicht</button><span class="el-sl" aria-hidden="true">/</span>`
    + `<button class="btn el-cur" id="el-mod" data-elact="modmenu" aria-haspopup="menu" aria-expanded="false" title="Anderes Modul öffnen (1 bis 3)">${dot(m)}<span class="el-lbl">${esc(name || m.label)}</span><span class="caret" aria-hidden="true">▾</span></button>${statusPill(st)}`;
}

export const keysHTML = () => `<div class="el-keys">${[
  ["1 2 3", "Schema, Disposition, PV öffnen (in der Übersicht: die Kachel an dieser Stelle)"], ["0", "Projektübersicht"], ["S", "Übersicht, Kachel gewählt: Modulstatus ändern"], ["⌥ ← →", "Übersicht, Kachel gewählt: Modul nach vorn oder hinten"], ["§", "Seitenleisten aus und ein (Taste links neben der 1)"],
  ["Bild ↑ ↓", "Blatt zurück und vor, innerhalb des Moduls"], ["G", "Liste der Blätter des Moduls (Zeile ziehen oder Alt ↑ ↓ sortiert)"], ["M", "Blatt mit ★ markieren"], ["⇧ Bild ↑ ↓", "zum vorherigen und nächsten ★-Blatt, auch über Module"],
  ["/", "Symbolsuche unten links"], ["⌘ Klick", "zur Auswahl dazu oder wieder ab"], ["?", "diese Hilfe"],
].map(([k, t]) => `<kbd>${k}</kbd><span>${t}</span>`).join("")}</div><p>Im Schema gelten 1 bis 4 beim Setzen eines Geräts oder bei einem gewählten Gerät weiter für die Polzahl.</p>`;

// Teilen per Link (Meilenstein 2, Schritt 1, 18.10.2026)
const fmtDay = (t) => new Date(t).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
// Übersicht beim Empfänger: statt Projekte und Online ein Hinweis. s = { at, ablauf } oder { grund } (Link geht nicht) oder {} (lädt)
export function sharedHTML(s) {
  const what = s.mods ? `${s.mods.length === 1 ? "das Modul" : "die Module"} ${s.mods.map((m) => `„${esc(m)}“`).join(", ")}` : "alle Module und Blätter";
  return `<section class="el-projs el-shared-info" aria-label="Geteilte Ansicht"><div class="el-eyerow"><span class="el-eye">Geteilte Ansicht</span><span class="el-st el-shpill">Nur ansehen</span></div>
    <p>Mit dir geteilt: ${what}. Du kannst ansehen, aber nichts ändern, speichern oder drucken.</p>
    ${s.at ? `<p class="el-note">Stand vom ${when2(s.at)}. Link gültig bis ${fmtDay(s.ablauf)}.</p>` : ""}</section>`;
}
const SHARE_GRUND = { abgelaufen: "Dieser Link ist abgelaufen.", widerrufen: "Dieser Link wurde vom Absender widerrufen.", modul_fehlt: "Das geteilte Modul gibt es in diesem Projekt nicht mehr.", ungueltig: "Dieser Link ist ungültig. Vielleicht ist er unvollständig kopiert oder das Projekt wurde gelöscht." };
export function shareFailHTML(grund, msg) {
  return `<div class="el-hubin el-sharefail"><section class="el-proj" role="alert"><span class="el-eye">Geteilte Ansicht</span><h2>${esc(grund ? SHARE_GRUND[grund] || SHARE_GRUND.ungueltig : "Das geteilte Projekt liess sich nicht laden.")}</h2>
    <p>${grund ? "Bitte beim Absender einen neuen Link anfragen." : esc(msg || "")}</p><div class="el-acts"><a class="btn outline" href="${esc(window.location.pathname)}">elplexaCAD ohne Link öffnen</a></div></section></div>`;
}
// Fenster „Link teilen“ beim Ersteller: gültige Links mit Umfang, Kopieren und Widerrufen, neuer Link. links = [{ id, token, expires_at, modules }] oder null (lädt).
// pick = null (nur ganzes Projekt, z. B. ein anderes Online-Projekt als das offene) oder { ids, on: Set } = Häkchen je Modul (CJ 18.10.2026). nm(id) = Modulname.
export function shareDialogHTML(name, links, url, pick, nm) {
  const scope = (l) => (l.modules ? l.modules.map(nm).join(", ") : "Ganzes Projekt");
  const rows = links === null ? `<p class="el-note">Lädt …</p>` : links.length ? links.map((l) => `<div class="el-shrow"><input class="el-shurl" readonly value="${esc(url(l.token))}" aria-label="Link für ${esc(scope(l))}, gültig bis ${fmtDay(l.expires_at)}"><span class="el-shexp">${esc(scope(l))} · bis ${fmtDay(l.expires_at)}</span><button class="btn outline small" data-shcopy="${esc(l.token)}">Kopieren</button><button class="btn outline small el-danger" data-shrev="${esc(l.id)}">Widerrufen</button></div>`).join("")
    : `<p class="el-note">Noch kein gültiger Link.</p>`;
  const boxes = pick && pick.ids.length > 1 ? `<fieldset class="el-shpick"><legend>Neuer Link zeigt</legend>${pick.ids.map((id) => `<label class="chk"><input type="checkbox" data-shmod="${esc(id)}"${pick.on.has(id) ? " checked" : ""}> <span>${esc(nm(id))}</span></label>`).join("")}</fieldset>` : "";
  return `<p>Wer den Link hat, sieht „${esc(name)}“ ohne Login, nur zum Ansehen: den zuletzt online gespeicherten Stand, ohne Zeiterfassung. Ein Link gilt 30 Tage und lässt sich jederzeit widerrufen.</p>
    <div class="el-shlinks">${rows}</div>${boxes}<div class="actions"><button class="btn outline" data-c>Schliessen</button><button class="btn primary" data-shnew${links === null || (pick && !pick.on.size) ? " disabled" : ""}>Neuen Link erstellen</button></div>`;
}
export const shareLoadHTML = () => `<div class="el-hubin el-sharefail"><section class="el-proj" role="status"><span class="el-eye">Geteilte Ansicht</span><p>Das geteilte Projekt wird geladen …</p></section></div>`;
