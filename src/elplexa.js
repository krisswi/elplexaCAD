// elplexaCAD (Aufbau B, CJ 17.10.2026): getrennte Module mit Projektübersicht. Nur im Bau `node build.mjs elplexa` aktiv.
// Ein Modul ist eine Gruppe von Blattarten derselben Datei. Welches Modul offen ist, folgt aus dem aktiven Blatt.
import { esc } from "./render.js";
import { cell } from "./auswertung.js";
import { modOf, modVar, modName, MOD_STATUS, projectStatus } from "./model.js";
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
  return edit ? `<span ${d} data-elmst="${id}" title="Modulstatus: ${esc(st)}. Klick, Taste S oder Rechtsklick › Status: ändern">${esc(st)}</span>` : `<span ${d} title="Modulstatus">${esc(st)}</span>`; }; // kein role=button: steht im Kachel-Knopf
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
const objOf = (pm, w) => pm?.OBJEKT ?? w?.OBJEKT ?? ""; // eine Regel für lokal und online: Projektdaten vor Schriftfeld des Arbeitsblatts
export function projectData(doc) {
  const pm = doc.project?.meta || {}, w = workSheet(doc)?.meta || {};
  return { OBJEKT: objOf(pm, w), AUFTRAG: pm.AUFTRAG ?? w.AUFTRAG ?? "", BAUHERR: bauherrInfo(doc)?.BAUHERR ?? "", INDEX: pm.INDEX ?? w.INDEX ?? "" };
}
export const statusOf = (doc) => doc.project?.status || "In Arbeit"; // Annahme: ohne Angabe „In Arbeit“
const STATUS_IDS = () => ({ "Offerte": "of", "In Arbeit": "ia", "Abgegeben": "ab", "Abgeschlossen": "ag" });
// Zusammenfassung fürs Projekt-Index (Etappe 3a): wird beim Speichern und Öffnen in „zuletzt geöffnet“ mitgeschrieben, damit die Projektkacheln ohne Dateizugriff Objekt, Module, Blattzahl und Zeit zeigen
export const projSummary = (doc) => ({ obj: projectData(doc).OBJEKT, mods: modIds(doc).map((id) => [baseOf(id), doc.mods?.[id]?.st || MOD_STATUS[0]]), n: doc.sheets.length, h: Math.round(timeSum(doc) * 100) / 100 });
// Online: nur `pm` (project.meta), `pt` (project.time) und `pa` (project.auto) der Zeile (keine Blätter, keine PDF) → Objekt und Stunden. Ohne Blätter fehlt der Rückfall auf das Schriftfeld des Arbeitsblatts
// (objOf): hat das Projekt kein Objekt in den Projektdaten, bleibt es leer und die Kachel zeigt «–». Blattzahl und Module gibt es online ohne Supabase-Änderung nicht.
export const onlineSummary = (e) => (e && typeof e === "object" && ("pm" in e || "pt" in e) ? { obj: objOf(e.pm, null) || "", h: Math.round(validTime(e.pt).reduce((a, x) => a + x.h, 0) * 100) / 100 } : null);
export const autoOpenN = (pa) => (Array.isArray(pa) ? pa.filter((x) => x && !x.x && x.s >= 60).length : 0);
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
    return `<button class="el-tile" id="${tileId(id)}"${ro ? "" : ` draggable="true"`} data-elopen="${id}" data-exact${ro ? "" : ` data-modctx="${id}"`} title="${esc(modName(doc, id))}${ro ? "" : ". Rechtsklick oder gedrückt halten: Umbenennen, Duplizieren, Löschen"}"><span class="el-th">${dot(m)}<span class="el-tn">${esc(modName(doc, id))}</span>${n < 9 ? `<kbd>${n + 1}</kbd>` : ""}</span><span class="el-ts"><span>${idx.length} ${idx.length === 1 ? "Blatt" : "Blätter"}</span>${ro ? "" : modPill(doc, id, true)}${ro ? "" : `<span class="el-pdf" role="button" id="el-pdf-${tileId(id).slice(8)}" data-elpdf="${id}" title="${esc(modName(doc, id))} als PDF, alle Blätter">PDF</span>`}</span><span class="el-thumbs"><span class="el-shs">${thumbs(idx).map((i) => `<i id="el-sh-${i}" data-elsheet="${i}"${ro ? "" : ` data-ctx="${i}"`} title="${esc(o.label ? o.label(doc.sheets[i], i) : "")}${doc.sheets[i].meta.TITEL ? ` · ${esc(doc.sheets[i].meta.TITEL)}` : ""}. Klick öffnet das Blatt${ro ? "" : ". Rechtsklick oder gedrückt halten: Öffnen, Duplizieren, Löschen"}"></i>`).join("")}</span>${idx.length > THUMBS ? `<i class="el-more" id="el-more-${tileId(id).slice(8)}" data-elmore="${id}" role="button" aria-haspopup="menu" aria-expanded="false" title="Alle ${idx.length} Blätter zeigen">+${idx.length - THUMBS}</i>` : ""}</span></button>`;
  }).join("");
  // Pfad, Reiter und Zeit-Chip stehen seit Paket C in der Kopfleiste (Zeile 1 Projekte und Zeit, Zeile 2 Tabs und «Heute X h»)
  const sub = "";
  const tip = ro || o.tip === false ? "" : `<div class="el-tip" role="note"><span class="el-tiptxt"><b>Tipp</b> 1 bis 9 öffnet die Kachel an dieser Stelle · S Status · ⌥ ← → Reihenfolge · Rechtsklick auf die Kachel: Umbenennen, Duplizieren, Löschen · ⌘S Speichern · ⇧⌘S Speichern unter · ⌘O Öffnen · ? alle Tasten</span><button class="btn icon el-tipx" data-elact="tipoff" title="Tipp-Zeile ausblenden (wieder einblenden über ?)" aria-label="Tipp-Zeile ausblenden"><span aria-hidden="true">×</span></button></div>`;
  const tab = o.tab || "projekte", pan = tab === "zeit" ? `role="tabpanel" id="el-tabpanel" aria-labelledby="el-tab-zeit"` : tab === "projekte" && o.pview ? `role="tabpanel" id="el-tabpanel" aria-labelledby="el-tab-proj"` : `id="el-tabpanel" role="region" aria-label="${tab === "profil" ? "Profil" : "Projekte"}"`; // Tabs in Zeile 2 der Kopfleiste
  if (!ro && o.tab === "zeit") return `${sub}<div class="el-hubin el-pview" ${pan}>${timeTabHTML({ ...(o.zeit || {}), today: o.today })}</div>${tip}`;
  if (!ro && o.tab === "profil") return `${sub}<div class="el-hubin el-pview" ${pan}>${profileHTML({ ...(o.profil || {}), tip: o.tip !== false })}</div>${tip}`;
  if (!ro && (o.tab || "projekte") === "projekte" && !o.pview) return `${sub}<div class="el-hubin el-pview" ${pan}>${projectsHTML({ ...(o.projs || {}), cur: { name: o.name, status: st, ...projSummary(doc), t: o.curT, onlineId: doc.project?.online?.id } })}</div>${tip}`;
  return `${sub}<div class="el-hubin"${ro ? "" : ` ${pan}`}><div class="el-col">
    <section class="el-proj" aria-label="Projekt"><div class="el-eyerow"><span class="el-eye">Projekt</span>${ro ? statusPill(st) : `<label class="el-stsel">${statusPill(st)}<select data-elp="status" aria-label="Projektstatus">${opts}</select></label>`}</div>
      <input class="el-name" data-elp="name" value="${esc(o.name)}"${ro ? ` aria-label="Projektname" readonly` : ` aria-label="Projektname (klicken zum Umbenennen)" title="Klicken zum Umbenennen"`} spellcheck="false">${fileHint}
      ${fld("OBJEKT", "Objekt")}${fld("AUFTRAG", "Auftrag")}${fld("BAUHERR", "Bauherr")}${fld("INDEX", "Index")}
      ${adrHTML(doc.project?.adr, ro)}${gwrHTML(doc.project?.gwr, { open: o.gwrOpen, busy: o.gwrBusy, ro })}
      ${ro ? "" : `<p class="el-note">Objekt, Auftrag und Index gelten für die Schriftfelder aller Blätter und Module, Bauherr auch für die Titelseite. Einzelne Blätter lassen sich im Schriftfeld weiter ändern.</p>
      <div class="el-acts"><button class="btn primary" data-elact="pdf"><span class="ic" data-ic="pdf"></span><span>Plansatz-PDF …</span></button></div>`}</section>
    ${ro ? sharedHTML(o.shared) : o.projs?.user ? `<section class="el-projs" aria-label="Online"><div id="el-online" class="el-online"></div></section>` : ""}</div>
    <div class="el-col"><section class="el-mods" aria-label="Module dieses Projekts"><span class="el-eye">Module dieses Projekts</span><div class="el-grid">${tiles}
      ${ro || typeof ELPLEXA === "undefined" || !ELPLEXA ? "" : `<button class="el-tile el-hand" id="el-hand" data-elact="hand" title="Handschrift mit dem Apple Pencil. Privat auf diesem Gerät, nicht im Projekt und nicht im Teilen-Link"><span class="el-th"><span class="el-tn">Handnotizen</span></span><span class="el-ts">Mit dem Stift schreiben · PDF und Bilder importieren und exportieren</span></button>`}
      ${ro ? "" : `<button class="el-tile el-new" id="el-addmod" data-elact="addmod" aria-haspopup="menu" aria-expanded="false"><span class="el-th">+ Modul</span><span class="el-ts">Schema, Disposition, PV · Plan und Prinzipschema später</span></button>`}</div>
      ${ro || o.tip === false ? `<p class="el-note">Tasten: 1 bis 9 öffnet die Kachel an dieser Stelle, ${ro ? "" : "S ändert den Status, ⌥ ← → ordnet um, "}0 die Übersicht, ? alle Tasten.</p>` : ""}</section>
    ${ro ? "" : timeHTML(doc, o.today)}</div></div>${tip}`;
}

// Reiter „Projekte“ (Etappe 3b): Kacheln oder Liste aus „zuletzt geöffnet“ (lokal, höchstens 8) und den Online-Projekten. Filter nach Status, Sortierung.
// o = { recent, online (null = nicht geladen), user, err, busy, filter, sort, view }
export const projFilters = () => ["Alle", ...projectStatus()]; // als Funktion: im SchemaCAD-Bau fällt alles weg
const projWhen = (t) => { const d = new Date(t); return Number.isNaN(+d) ? "" : d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }); };
// Stabiler Schlüssel für die eigene Reihenfolge (Ziehen): lokal der Dateiname, online die Kennung
export const projKey = (x) => (x.src === "online" ? `o:${x.id}` : `l:${x.file}`);
export function projItems(o) {
  // k = Platz in der ungefilterten Liste „zuletzt geöffnet“ (EL_S.recent): öffnen und entfernen arbeiten damit, also vor dem Filtern vergeben
  const loc = (o.recent || []).map((e, k) => ({ src: "lokal", k, file: e.file, name: e.name || e.file, status: e.status || "", obj: e.sum?.obj || "", mods: e.sum?.mods || null, n: e.sum?.n ?? null, h: e.sum?.h ?? null, t: e.t || 0, hint: e.handle ? "" : "Datei wählen" }))
    .filter((x) => !(o.cur?.t != null && x.t === o.cur.t)); // das offene Projekt steht als eigene Kachel; gleichnamige andere Dateien bleiben
  const onl = (o.online || []).filter((e) => !(o.cur?.onlineId && e.id === o.cur.onlineId)).map((e) => { const s = onlineSummary(e); return { src: "online", id: e.id, name: e.name, status: e.status || "", obj: s?.obj || "", mods: null, n: null, h: s ? s.h : null, t: Date.parse(e.updated_at) || 0, hint: "" }; });
  let all = [...loc, ...onl];
  if (o.filter && o.filter !== "Alle") all = all.filter((x) => x.status === o.filter);
  if (o.sort === "name") return all.sort((a, b) => a.name.localeCompare(b.name, "de"));
  if (o.sort === "eigene") { const ord = o.order || [], pos = (x) => { const p = ord.indexOf(projKey(x)); return p < 0 ? Infinity : p; }; return all.sort((a, b) => (pos(a) === pos(b) ? b.t - a.t : pos(a) < pos(b) ? -1 : 1)); }
  return all.sort((a, b) => b.t - a.t);
}
export function projectsHTML(o) {
  const items = projItems(o), view = o.view === "liste" ? "liste" : "kacheln";
  const opt = (v, t, cur) => `<option value="${v}"${v === cur ? " selected" : ""}>${t}</option>`;
  const bar = `<div class="el-pbar"><label>Status <select data-elf="filter" aria-label="Nach Status filtern">${projFilters().map((f) => opt(f, f, o.filter || "Alle")).join("")}</select></label>
    <label>Sortierung <select data-elf="sort" aria-label="Sortierung">${opt("zuletzt", "Zuletzt", o.sort || "zuletzt")}${opt("name", "Name", o.sort)}${opt("eigene", "Eigene Reihenfolge", o.sort)}</select></label>
    <span class="el-sp"></span><div class="el-vsw" role="group" aria-label="Ansicht">${[["kacheln", "Kacheln"], ["liste", "Liste"]].map(([v, t]) => `<button class="btn small" data-elview="${v}" aria-pressed="${v === view}">${t}</button>`).join("")}</div>
    ${o.user ? `<button class="btn outline small" data-elact="onlist"${o.busy ? " disabled" : ""} title="Online-Projekte jetzt neu laden">Neu laden</button>` : ""}<button class="btn outline small" data-elact="openfile" title="Projektdatei wählen (⌘O)"><span class="ic" data-ic="open"></span><span>Öffnen …</span></button><button class="btn outline small" data-elact="newproj"><span class="ic" data-ic="plus"></span><span>Neues Projekt …</span></button></div>`;
  const dots = (x) => (x.mods ? x.mods.map(([b, st]) => { const m = MODULES.find((q) => q.id === b); return `<i class="el-pd" style="background:${m?.color || "#999"}" title="${esc(m?.label || b)}: ${esc(st)}"></i>`; }).join("") : "");
  const card = (x) => {
    const attr = x.src === "online" ? `data-elonline="${esc(x.id)}"` : `data-elrecent="${x.k}"`;
    const meta = [x.n !== null ? `${x.n} ${x.n === 1 ? "Blatt" : "Blätter"}` : "", x.h !== null ? `${fmtH(x.h)} h` : "", x.t ? projWhen(x.t) : ""].filter(Boolean).join(" · ");
    const key = x.src === "online" ? `o:${x.id}` : `l:${x.k}`, on = !!o.sel?.has(key); // key = Auswahl (Platz in der Liste), pkey = Ziehen (stabil)
    return `<button class="el-ptile${on ? " sel" : ""}" id="el-pt-${esc(key.replace(":", "-"))}" draggable="true" ${attr} data-projctx="${esc(key)}" data-selkey="${esc(key)}" data-pkey="${esc(projKey(x))}" title="${x.src === "online" ? "Online-Projekt öffnen" : x.hint ? "Dieser Browser merkt sich nur den Namen: Datei wählen" : "Öffnen"}"><span class="el-ph"><span class="el-pn">${esc(x.name)}</span>${x.status ? statusPill(x.status) : ""}</span><span class="el-po">${esc(x.obj) || "–"}</span><span class="el-pm">${dots(x)}${esc(meta)}</span><span class="el-pw">${x.src === "online" ? "online" : "lokal"}${x.hint ? " · " + x.hint : ""}${on ? `<span class="sr"> (gewählt)</span>` : ""}</span></button>`;
  };
  const cur = o.cur && (!o.filter || o.filter === "Alle" || o.filter === o.cur.status) ? o.cur : null;
  const curCard = cur ? `<button class="el-ptile cur" id="el-pt-cur" data-elact="projview" title="Dieses Projekt ist geöffnet: Projektdaten und Module"><span class="el-ph"><span class="el-pn">${esc(cur.name)}</span>${cur.status ? statusPill(cur.status) : ""}</span><span class="el-po">${esc(cur.obj) || "–"}</span><span class="el-pm">${cur.mods.map(([b, s]) => { const m = MODULES.find((q) => q.id === b); return `<i class="el-pd" style="background:${m?.color || "#999"}" title="${esc(m?.label || b)}: ${esc(s)}"></i>`; }).join("")}${cur.n} ${cur.n === 1 ? "Blatt" : "Blätter"}${cur.h ? ` · ${fmtH(cur.h)} h` : ""}</span><span class="el-pw"><b class="el-open">geöffnet</b></span></button>` : "";
  let body;
  if (!items.length && !cur) body = `<p class="el-note el-empty">${((o.filter && o.filter !== "Alle") || o.recent?.length || o.online?.length) ? "Kein Projekt mit diesem Status." : "Noch keine Projekte. Gespeicherte und geöffnete Projekte erscheinen hier."}</p>`;
  else body = view === "liste" ? `<div class="el-plist">${curCard}${items.map(card).join("")}</div>` : `<div class="el-pgrid">${curCard}${items.map(card).join("")}</div>`;
  const nSel = o.sel?.size || 0, nLoc = [...(o.sel || [])].filter((k) => k.startsWith("l:")).length;
  const selbar = nSel ? `<div class="el-selbar" role="status"><span><b>${nSel}</b> gewählt${nSel > nLoc ? ` (Online-Projekte bleiben)` : ""}</span><button class="btn outline small" data-elact="selrm"${nLoc ? "" : " disabled"}>Aus der Liste entfernen</button><button class="btn outline small" data-elact="selclr">Auswahl aufheben (Esc)</button></div>` : "";
  const notes = [`<p class="el-note">⌘-Klick wählt mehrere. Rechtsklick: Öffnen, aus der Liste entfernen, bei Online-Projekten Link teilen oder online löschen. Lokale Projekte kennt der Browser nur über «zuletzt geöffnet» (höchstens 8). Online-Projekte zeigen Objekt und Stunden, nicht Blattzahl und Module.</p>`];
  if (o.err) notes.unshift(`<div class="el-perr" role="alert"><span>${esc(o.err)}</span><button class="btn outline small" data-elact="onlist">Erneut versuchen</button></div>`);
  else if (!o.user) notes.unshift(`<p class="el-note">Nicht angemeldet: Online-Projekte erscheinen nach der Anmeldung (Konto-Kreis oben rechts).</p>`);
  else if (o.online === null) notes.unshift(`<p class="el-note">${o.busy ? "Online-Projekte werden geladen …" : `Online-Projekte noch nicht geladen. <button class="el-link" data-elact="onlist">Jetzt laden</button>`}</p>`);
  return `<section class="el-projs el-pwrap" aria-label="Projekte">${bar}${selbar}${body}${notes.join("")}</section>`;
}

// Reiter „Zeit“ (Etappe 4, CJ 20.10.2026): Woche Montag bis Sonntag, eine Zeile je Online-Projekt, Summen je Tag und Projekt. Nur Online-Projekte (lokale kennt die Liste nicht ohne Dateizugriff).
// Stunden kommen aus `pt` (project.time) der Online-Zeile (Etappe 3a); das offene, mit einer Online-Zeile verknüpfte Projekt zählt mit seinem lokalen Stand.
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
const dayNo = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5; // UTC: Sommerzeit spielt keine Rolle
const dayAt = (n) => isoDay(n * 864e5);
export const weekStart = (d) => dayAt(dayNo(d) - ((dayNo(d) + 3) % 7)); // 1970-01-01 war ein Donnerstag
export const weekShift = (mon, n) => dayAt(dayNo(mon) + 7 * n);
export const weekDays = (mon) => Array.from({ length: 7 }, (_, i) => dayAt(dayNo(mon) + i));
// ISO-Kalenderwoche (Woche mit dem Donnerstag im Jahr) als { y, w }
export function isoWeek(d) {
  const th = dayNo(weekStart(d)) + 3, y = new Date(th * 864e5).getUTCFullYear(), jan1 = Date.UTC(y, 0, 1) / 864e5;
  return { y, w: Math.floor((th - jan1) / 7) + 1 };
}
const r2 = (h) => Math.round(h * 100) / 100;
// Eintrag aus der Online-Zeile prüfen (kommt von aussen): gültiger Tag, Stunden 0 bis 24, höchstens 5000 Einträge je Projekt
const TIME_MAX = 5000;
export const validTime = (t) => (Array.isArray(t) ? t.slice(0, TIME_MAX).filter((e) => e && typeof e.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.d) && !Number.isNaN(Date.parse(e.d)) && typeof e.h === "number" && Number.isFinite(e.h) && e.h > 0 && e.h <= 24) : []);
// items = [{ id, name, time: [{d,h,n}] | null, local?, auto? }]; time null = Stunden nicht geladen. Summen werden ungerundet addiert und erst zuletzt gerundet (wie timeSum im Projekt).
export function timeWeek(items, mon) {
  const days = weekDays(mon);
  const rows = items.map((it) => {
    const t = it.time ? validTime(it.time) : null, raw = days.map((x) => (t ? t.filter((e) => e.d === x).reduce((a, e) => a + e.h, 0) : 0)), total = t ? t.filter((e) => days.includes(e.d)).reduce((a, e) => a + e.h, 0) : 0; // Summe in Eintragsfolge wie timeSum, nicht über die Tagessummen
    return { id: it.id, name: it.name, known: !!t, local: !!it.local, auto: it.auto || 0, raw, days: raw.map(r2), sum: r2(total), rawSum: total };
  });
  const dayRaw = days.map((_, i) => rows.reduce((a, r) => a + r.raw[i], 0)), grand = rows.reduce((a, r) => a + r.rawSum, 0);
  return { days, rows, dayTotals: dayRaw.map(r2), total: r2(grand), kw: isoWeek(mon), incomplete: rows.some((r) => !r.known), autoProjects: rows.filter((r) => r.auto > 0).length };
}
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
// CSV wie timeCsv: Excel de-CH, Semikolon, BOM, Dezimalpunkt. Unbekannte Stunden: Zellen leer, am Ende eine Hinweiszeile.
export function timeWeekCsv(w) {
  const row = (a) => a.map(cell).join(";"), n = (h) => String(r2(h)), unk = w.rows.filter((r) => !r.known);
  const lines = [row(["Projekt", ...w.days.map((d, i) => `${WD[i]} ${fmtD(d)}`), "Summe"]), ...w.rows.map((r) => (r.known ? row([r.name, ...r.days.map(n), n(r.sum)]) : row([r.name, ...r.days.map(() => ""), "?"]))), row(["Summe", ...w.dayTotals.map(n), n(w.total)])];
  if (unk.length) lines.push(row([`Hinweis: Stunden von ${unk.length} ${unk.length === 1 ? "Projekt" : "Projekten"} nicht geladen, Summe unvollständig`]));
  return "\ufeff" + lines.join("\r\n") + "\r\n";
}
const hhmm = (t) => new Date(t).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
// o = { items, mon, today, user, err, busy, loaded, at (Zeit des letzten Ladens) }
export function timeTabHTML(o) {
  const w = timeWeek(o.items || [], o.mon), stale = !!o.err && o.loaded;
  const cellH = (h) => (h ? fmtH(h) : `<span aria-hidden="true">–</span><span class="sr">0 Stunden</span>`);
  const head = `<div class="el-pbar"><div class="el-vsw" role="group" aria-label="Woche"><button class="btn small" data-elwk="-1" aria-label="Vorherige Woche">‹</button><button class="btn small" data-elwk="0">Diese Woche</button><button class="btn small" data-elwk="1" aria-label="Nächste Woche">›</button></div>
    <span class="el-wk"><b>KW ${w.kw.w}</b> · ${fmtD(w.days[0])} – ${fmtD(w.days[6])}</span><span class="el-sp"></span>${o.at ? `<span class="el-stand${stale ? " alt" : ""}">Stand von ${hhmm(o.at)}${stale ? " (alt)" : ""}</span>` : ""}<span class="el-sum">Summe <b>${fmtH(w.total)} h</b>${w.incomplete ? ` <i class="el-incomplete">unvollständig</i>` : ""}</span>
    ${o.user ? `<button class="btn outline small" data-elact="onlist"${o.busy ? " disabled" : ""} title="Online-Projekte jetzt neu laden">Neu laden</button>` : ""}<button class="btn outline small" data-elact="zeitcsv"${w.rows.length ? "" : " disabled"}>Woche als CSV</button></div>`;
  const unk = `<button class="el-unk" type="button" title="Stunden nicht geladen" aria-label="Stunden nicht geladen" data-elact="onlist">?</button>`;
  const table = w.rows.length ? `<div class="el-wscroll" role="region" aria-label="Wochenzeit, seitlich scrollbar" tabindex="0"><table class="el-wtab${stale ? " alt" : ""}"><caption class="sr">Stunden je Projekt und Tag, Kalenderwoche ${w.kw.w}</caption><thead><tr><th scope="col">Projekt</th>${w.days.map((d, i) => `<th scope="col"${d === o.today ? ' class="el-today" aria-current="date"' : ""}>${WD[i]} <span>${d.slice(8)}.${d.slice(5, 7)}.</span>${d === o.today ? `<span class="sr"> (heute)</span>` : ""}</th>`).join("")}<th scope="col">Summe</th></tr></thead>
    <tbody>${w.rows.map((r) => `<tr><th scope="row"><button class="el-zopen" type="button" data-elzopen="${esc(r.id)}" title="${r.local ? "Projekt zeigen" : "Projekt öffnen"}">${esc(r.name)}</button>${r.local ? ` <i class="el-loc" title="Das offene Projekt zählt mit dem Stand der Datei">offen, lokal</i>` : ""}${r.known ? "" : ` ${unk}`}</th>${r.known ? r.days.map((h) => `<td>${cellH(h)}</td>`).join("") : `<td colspan="7" class="el-unkcell">Stunden nicht geladen</td>`}<td class="el-rs2">${r.known ? cellH(r.sum) : "?"}</td></tr>`).join("")}</tbody>
    <tfoot><tr><th scope="row">Summe</th>${w.dayTotals.map((h) => `<td>${cellH(h)}</td>`).join("")}<td class="el-rs2">${cellH(w.total)}</td></tr></tfoot></table></div>` : "";
  const opts = (o.items || []).map((it) => `<option value="${esc(it.id)}"${it.id === o.pick ? " selected" : ""}>${esc(it.name)}${it.local ? " (offen)" : ""}</option>`).join("");
  const form = o.user && (o.items || []).length ? `<form class="el-tform el-zform" id="el-zform" autocomplete="off" aria-label="Zeit eintragen"><select id="el-zp" aria-label="Projekt" required>${o.pick ? "" : `<option value="">Projekt wählen …</option>`}${opts}</select><input type="date" id="el-zd" value="${o.day || o.today}" aria-label="Datum" required><input type="text" id="el-zh" inputmode="decimal" placeholder="Std." aria-label="Stunden" required><input type="text" id="el-zn" placeholder="Notiz" aria-label="Notiz" maxlength="500"><button class="btn primary" type="submit">Eintragen</button></form>` : "";
  const notes = [`<p class="el-note">Nur Online-Projekte, lokale Projekte erscheinen nicht. Die Liste wird beim Öffnen des Reiters neu geladen. Eingetragene Stunden sind gleich online gespeichert; beim offenen Projekt mit dem Projekt (⌘S). Klick auf ein Projekt öffnet es.</p>`];
  if (w.autoProjects) notes.unshift(`<p class="el-note el-autohint">${w.autoProjects} ${w.autoProjects === 1 ? "Projekt hat" : "Projekte haben"} vorläufige Zeit, sie zählt erst nach dem Übernehmen im Projekt.</p>`);
  if (o.err) notes.unshift(`<div class="el-perr" role="alert"><span>${esc(o.err)}${o.loaded ? " Die Tabelle zeigt den älteren Stand." : ""}</span><button class="btn outline small" data-elact="onlist">Erneut versuchen</button></div>`);
  else if (!o.user) notes.unshift(`<p class="el-note">Nicht angemeldet: die Zeit über alle Projekte braucht die Online-Projekte. Anmelden: Konto-Kreis oben rechts.</p>`);
  else if (!o.loaded) notes.unshift(`<p class="el-note">${o.busy ? "Online-Projekte werden geladen …" : `Online-Projekte noch nicht geladen. <button class="el-link" data-elact="onlist">Jetzt laden</button>`}</p>`);
  else if (!w.rows.length) notes.unshift(`<p class="el-note el-empty">Noch keine Online-Projekte.</p>`);
  return `<section class="el-projs el-pwrap" aria-label="Zeit über alle Projekte">${head}${form}${table}${notes.join("")}</section>`;
}

// Reiter „Profil“ (Etappe 6, CJ 20.10.2026): Anmeldung mit E-Mail und Passwort (vorher Fenster und Konto-Menü), Abmelden, Gast-Hinweis, Firma, Tipp-Zeile
// o = { user, busy, msg (Fehlertext der Anmeldung), mail, pw (Eingaben bleiben beim Neuzeichnen und nach einem Fehler, das Passwort nur bis zum Fehler), tip, locked }
export function profileHTML(o) {
  const login = o.user ? `<p class="el-prow">Angemeldet als <b>${esc(o.user)}</b></p><div class="el-acts"><button class="btn outline" id="el-pf-logout" data-elact="logout"${o.busy ? " disabled" : ""}>Abmelden</button></div>`
    : `<p class="el-note">Gast: Ohne Anmeldung arbeitest du mit Dateien auf diesem Rechner${o.locked ? "; im Netz lässt sich dann nur als DXF speichern" : ""}. Anmelden für Projektdatei, PDF, Listen und Online-Projekte.</p>
      <form class="el-pform" id="el-pf-form" autocomplete="on" novalidate><label class="el-row"><span>E-Mail</span><input id="el-pf-mail" type="email" autocomplete="username" spellcheck="false" value="${esc(o.mail || "")}"></label>
      <label class="el-row"><span>Passwort</span><input id="el-pf-pw" type="password" autocomplete="current-password" value="${esc(o.pw || "")}"></label>
      ${o.msg ? `<p class="el-perr" role="alert"><span>${esc(o.msg)}</span></p>` : ""}<div class="el-acts"><button class="btn primary" type="submit"${o.busy ? " disabled" : ""}>${o.busy ? "Anmelden …" : "Anmelden"}</button></div></form>`;
  return `<section class="el-projs el-pwrap el-profile" aria-label="Profil"><div class="el-eyerow"><span class="el-eye">Anmeldung</span></div>${login}
    <div class="el-eyerow"><span class="el-eye">Firma</span></div><label class="el-row"><span>Firma</span><select disabled aria-label="Firma wechseln"><option>–</option></select></label>
    <p class="el-note">Firma wechseln gibt es noch nicht: die App kennt noch keine Firmendaten (Mandanten-Verwaltung folgt).</p>
    <div class="el-eyerow"><span class="el-eye">Anzeige</span></div><label class="chk"><input type="checkbox" data-eltip${o.tip ? " checked" : ""}> <span>Tipp-Zeile unten zeigen</span></label></section>`;
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
export async function recentAdd(e) { // gibt den Zeitstempel t des Eintrags zurück (merkt sich das offene Projekt in der Liste)
  const list = await recentList(), keep = [];
  for (const x of list) if (!(e.handle ? await same(x.handle, e.handle) : !x.handle && x.file === e.file)) keep.push(x);
  let entry = { ...e, t: Date.now() };
  try { structuredClone(entry); } catch { entry = { ...entry, handle: null }; }
  await recentPut([entry, ...keep].slice(0, 8));
  return entry.t;
}
export async function recentDrop(k) { const list = await recentList(); list.splice(k, 1); await recentPut(list); }
export async function recentDropMany(ks) { const list = await recentList(); for (const k of [...ks].sort((a, b) => b - a)) list.splice(k, 1); await recentPut(list); } // Auswahl entfernen (Etappe 5)
export function recentHTML(list) {
  if (!list.length) return `<p class="el-note">Noch keine. Gespeicherte und geöffnete Projekte erscheinen hier.</p>`;
  const when = (t) => new Date(t).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  return list.map((e, k) => `<button class="el-rrow" data-elrecent="${k}" title="${e.handle ? "Öffnen" : "Dieser Browser merkt sich nur den Namen: Datei wählen"}"><span class="el-rn">${esc(e.name || e.file)}</span>${e.status ? statusPill(e.status) : ""}<span class="el-rs">${esc(e.file)} · ${when(e.t)}${e.handle ? "" : " · Datei wählen"}</span></button>`).join("");
}

// Online im Projekt (CJ 21.10.2026): nur angemeldet, nur dieses Projekt (Stand, Online speichern, Link teilen). Kein Login-Feld hier (Anmelden über den Konto-Kreis);
// andere Online-Projekte öffnen, teilen und löschen im Reiter Projekte (Rechtsklick). o = { user, link, busy }
const when2 = (t) => new Date(t).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
export function onlineHTML(o) {
  if (!o.user) return "";
  const head = `<div class="el-eyerow"><span class="el-eye">Online</span><span class="el-acct">${esc(o.user)}</span></div>`;
  const state = o.link ? `<p class="el-note">Online gespeichert am ${when2(o.link.at)}. Die Datei bleibt der Hauptweg.</p>` : `<p class="el-note">Eine Kopie online speichern, um sie auf einem anderen Rechner zu öffnen. Die Datei bleibt der Hauptweg.</p>`;
  return `${head}${state}<div class="el-acts"><button class="btn outline" data-elact="onsave"${o.busy ? " disabled" : ""}><span>Online speichern</span></button>${o.link ? `<button class="btn outline" data-elshare="${esc(o.link.id)}"${o.busy ? " disabled" : ""}><span>Link teilen …</span></button><button class="btn outline" data-elodel="${esc(o.link.id)}" title="Nur die Online-Kopie, die Datei bleibt"${o.busy ? " disabled" : ""}><span>Online löschen</span></button>` : ""}</div>`;
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
  ["/", "Symbolsuche unten links"], ["⌘ Klick", "zur Auswahl dazu oder wieder ab"], ["⌘ O", "Öffnen"], ["⌘ S", "Speichern"], ["⇧ ⌘ S", "Speichern unter"], ["⌘ F", "Suchen und Ersetzen"], ["Esc", "schliesst Menü oder Fenster, in der Übersicht zurück ins Modul"], ["?", "diese Hilfe"],
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
