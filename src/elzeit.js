// elplexaCAD: Projektzeit (Erfassung von Hand, automatische Zeit, Zeit-Reiter, CSV). Aus app.js ausgelagert (Umbau, 27.10.2026), Verhalten unverändert.
// Zustand: EL_Z (Zeitzähler) hier, EL_S (Übersicht) gehört app.js. Nur im elplexaCAD-Bau benutzt.
import { cleanProject } from "./model.js";
import { cloudUser, projTimeAdd } from "./cloud.js";
import * as E from "./elplexa.js";

export const elDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function makeZeit({ S, $, toast, change, EL_S, elMod, elProj, elHub, elOnlineOpen, download, baseName }) {
  function elTimeAdd() {
    const d = $("#el-td").value, h = Number($("#el-th").value.trim().replace(",", ".")), n = $("#el-tn").value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { toast("Bitte ein Datum wählen.", "error"); return; }
    if (!(h > 0 && h <= 24)) { toast("Stunden zwischen 0 und 24 eingeben, z. B. 1,5.", "error"); $("#el-th").focus(); return; }
    change(() => { (elProj().time ||= []).push({ d, h: Math.round(h * 100) / 100, n }); }, { panel: false });
    elHub(true); $("#el-th")?.focus();
  }
  function elTimeDel(k) {
    change(() => { const t = S.doc.project.time; t.splice(k, 1); if (!t.length) delete S.doc.project.time; }, { panel: false });
    elHub(true); $("#el-th")?.focus();
  }
  // Automatische Zeit (CJ 18.10.2026): läuft in den Modulen mit, Aktivität = Maus, Taste, Klick, Scrollen, Touch. 5 min ohne Aktivität,
  // Fenster im Hintergrund oder Übersicht offen = Pause. Ein vorläufiger Eintrag je Tag in doc.project.auto, ausserhalb von Rückgängig
  // und ohne „ungespeichert“; mit der Datei und online gespeichert und laufend im Browser gesichert (localStorage je Projekt-Kennung).
  // Zeit wird nur bis zur letzten Aktivität plus 5 min gezählt (from = zuletzt abgerechnet, until = Ende der aktiven Zeit).
  const EL_IDLE = 300e3, EL_ZK = "elplexacad.zeit.", EL_Z = { doc: null, from: 0, until: 0, mod: "schema", dirty: false };
  const elRid = (n) => Math.random().toString(36).slice(2, 2 + n).padEnd(n, "0");
  function elZeitSettle(t = Date.now()) {
    if (S.shared) return; // geteilte Ansicht: keine Zeit
    const doc = EL_Z.doc, ms = Math.min(t, EL_Z.until) - EL_Z.from;
    EL_Z.from = t;
    if (!doc || ms <= 0) return;
    const p = (doc.project ||= {}), d = elDay(t);
    p.id ||= elRid(10);
    let e = (p.auto ||= []).find((x) => x.d === d && !x.x);
    if (!e) p.auto.push((e = { k: elRid(8), d, s: 0, m: [] }));
    e.s = Math.min(86400, e.s + ms / 1000);
    if (!e.m.includes(EL_Z.mod)) e.m.push(EL_Z.mod);
    EL_Z.dirty = true;
  }
  function elZeitBackup(doc = EL_Z.doc) {
    if (S.shared) return;
    const p = doc?.project;
    if (!p?.id || !p.auto) return;
    try { localStorage.setItem(EL_ZK + p.id, JSON.stringify({ f: S.fileName, auto: p.auto })); } catch { /* ohne Sicherung weiterzählen */ }
  }
  function elZeitPause() { elZeitDoc(); elZeitSettle(); EL_Z.until = 0; if (EL_Z.dirty) { elZeitBackup(); EL_Z.dirty = false; } }
  // Anderes Projekt offen (Öffnen, Neu, Online): altes abrechnen und sichern, beim neuen die Sicherung aus dem Browser dazunehmen.
  // file: aus einer Datei geöffnet; nur dann gilt eine Sicherung mit gleichem Dateinamen für eine Datei ohne Kennung (nie gespeichert).
  function elZeitDoc({ file = false } = {}) {
    if (EL_Z.doc === S.doc || S.shared) return;
    if (EL_Z.doc) { elZeitSettle(); elZeitBackup(); }
    EL_Z.doc = S.doc; EL_Z.from = Date.now(); EL_Z.until = 0; EL_Z.dirty = false;
    let id = S.doc.project?.id, b = null;
    try {
      if (id) b = JSON.parse(localStorage.getItem(EL_ZK + id) || "null");
      else if (file) for (let i = 0; i < localStorage.length && !b; i++) {
        const k = localStorage.key(i);
        if (k.startsWith(EL_ZK)) { const x = JSON.parse(localStorage.getItem(k)); if (x?.f === S.fileName) { b = x; id = k.slice(EL_ZK.length); } }
      }
    } catch { b = null; }
    const auto = cleanProject({ auto: b?.auto })?.auto;
    if (auto) { const p = (S.doc.project ||= {}); p.id ||= id; p.auto = E.mergeAuto(p.auto, auto); }
    const old = E.autoOpen(S.doc).filter((e) => e.d !== elDay(Date.now())).length;
    if (old) toast(`Vorläufige Zeit: ${old === 1 ? "ein Eintrag" : `${old} Einträge`} in der Übersicht übernehmen oder verwerfen (Taste 0).`);
  }
  function elZeitAct() {
    elZeitDoc();
    if (!EL_S.hub || !EL_S.hub.hidden || document.hidden || !document.hasFocus()) return;
    const t = Date.now();
    elZeitSettle(t); EL_Z.until = t + EL_IDLE; EL_Z.mod = E.baseOf(elMod());
  }
  function elZeitUndo(za, zid) { // Rückgängig: vorläufige Zeit nicht zurückdrehen, übernommen/verworfen aber schon
    if (!za) return;
    const p = (S.doc.project ||= {});
    p.id ||= zid; p.auto = E.mergeAuto(p.auto, za, true);
    EL_Z.doc = S.doc; elZeitBackup();
  }
  function elZeitInit() {
    for (const ev of ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"]) addEventListener(ev, elZeitAct, { capture: true, passive: true });
    addEventListener("visibilitychange", elZeitPause); addEventListener("blur", elZeitPause); addEventListener("pagehide", elZeitPause);
    setInterval(() => { elZeitDoc(); if (document.hidden || !document.hasFocus()) { elZeitPause(); return; } elZeitSettle(); if (EL_Z.dirty) { elZeitBackup(); EL_Z.dirty = false; } }, 15e3);
    elZeitDoc();
  }
  // Vorläufigen Eintrag übernehmen (mit den Stunden und der Notiz aus der Zeile) oder verwerfen. Ein Rückgängig-Schritt.
  function elZeitResolve(k, ok) {
    const e = S.doc.project?.auto?.find((x) => x.k === k), row = $(`#el-hub [data-elz="${k}"]`);
    if (!e || !row) return;
    const h = Number(row.querySelector(".el-ah").value.trim().replace(",", ".")), n = row.querySelector(".el-an").value.trim();
    if (ok && !(h > 0 && h <= 24)) { toast("Stunden zwischen 0 und 24 eingeben, z. B. 1,5.", "error"); row.querySelector(".el-ah").focus(); return; }
    change(() => { const a = S.doc.project.auto.find((x) => x.k === k); a.x = ok ? "ok" : "weg"; if (ok) (elProj().time ||= []).push({ d: e.d, h: Math.round(h * 100) / 100, n }); }, { panel: false });
    EL_Z.doc = S.doc; elZeitBackup();
    elHub(true, { keepFocus: true });
    toast(ok ? `Übernommen: ${E.fmtH(Math.round(h * 100) / 100)} h am ${E.fmtD(e.d)}.` : `Vorläufiger Eintrag vom ${E.fmtD(e.d)} verworfen.`);
  }
  // Zeit über alle Projekte (Etappe 4): Woche und Online-Projekte; das offene, verknüpfte Projekt zählt mit dem Stand der Datei
  function elZeitData() {
    const mon = EL_S.week || E.weekStart(elDay(Date.now())), on = S.doc.project?.online?.id;
    const items = (EL_S.onlist || []).map((e) => e.id === on ? { id: e.id, name: e.name, time: S.doc.project?.time || [], local: true, auto: E.autoOpen(S.doc).length }
      : { id: e.id, name: e.name, time: Array.isArray(e.pt) ? e.pt : "pt" in e ? [] : null, auto: E.autoOpenN(e.pa) }); // pt fehlt ganz = alte Abfrage: Stunden unbekannt
    return { items, mon, user: cloudUser(), err: EL_S.onerr, busy: EL_S.onbusy, loaded: EL_S.onlist != null, at: EL_S.onAt, pick: EL_S.zp || on || "", day: EL_S.zd || "" };
  }
  // Zeit-Reiter (CJ 21.10.2026): Klick auf ein Projekt öffnet es. Das offene Projekt zeigt seine Projektseite, ein anderes wird aus der Online-Ablage geladen
  function elZeitOpen(id) {
    if (id === S.doc.project?.online?.id) { EL_S.tab = "projekte"; EL_S.pview = true; elHub(true); return; }
    elOnlineOpen(id);
  }
  // Zeit direkt im Reiter erfassen, ohne das Projekt zu öffnen (nur Online-Projekte). Gleich gespeichert: das offene Projekt bekommt den
  // Eintrag in die Datei (wie im Projekt, sonst hätte die Datei einen älteren Online-Stand), jedes andere direkt online.
  async function elZeitAdd() {
    const id = $("#el-zp").value, d = $("#el-zd").value, h = Number($("#el-zh").value.trim().replace(",", ".")), n = $("#el-zn").value.trim();
    if (!id) { toast("Bitte ein Projekt wählen.", "error"); $("#el-zp").focus(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { toast("Bitte ein Datum wählen.", "error"); return; }
    if (!(h > 0 && h <= 24)) { toast("Stunden zwischen 0 und 24 eingeben, z. B. 1,5.", "error"); $("#el-zh").focus(); return; }
    const e = { d, h: Math.round(h * 100) / 100, n };
    EL_S.zp = id; // gewähltes Projekt bleibt für den nächsten Eintrag
    if (id === S.doc.project?.online?.id) {
      change(() => { (elProj().time ||= []).push(e); }, { panel: false });
      elHub(true, { keepFocus: true }); $("#el-zh")?.focus();
      toast(`${E.fmtH(e.h)} h im offenen Projekt eingetragen. Mit dem Projekt speichern (⌘S).`);
      return;
    }
    if (EL_S.zbusy) return;
    EL_S.zbusy = true; EL_S.zd = d; const btn = $("#el-zform [type=submit]"); if (btn) btn.disabled = true; // Eingaben bleiben stehen, bis es gespeichert ist
    let ok = false;
    try {
      const r = await projTimeAdd(id, e);
      if (r) {
        const row = (EL_S.onlist || []).find((x) => x.id === id);
        if (row) { row.pt = r.time; row.updated_at = r.at; }
        toast(`${E.fmtH(e.h)} h bei „${row?.name || "Projekt"}“ eingetragen und online gespeichert.`); ok = true;
      }
    } catch (err) { toast(err.message || String(err), "error"); }
    finally { EL_S.zbusy = false; if (btn?.isConnected) btn.disabled = false; }
    if (ok && !EL_S.hub.hidden && EL_S.tab === "zeit") { elHub(true, { keepFocus: true }); $("#el-zh")?.focus(); } // Tabelle und Chip mit dem neuen Eintrag, Stunden und Notiz leer
  }
  function elZeitCsv() { const d = elZeitData(); download(`Zeit_Woche_${d.mon}.csv`, E.timeWeekCsv(E.timeWeek(d.items, d.mon)), "text/csv"); toast("Wochenzeit als CSV in den Download-Ordner geladen."); }
  function elCsv() { download(`${baseName()}_Zeit.csv`, E.timeCsv(S.doc), "text/csv"); toast("Zeit als CSV in den Download-Ordner geladen."); }
  // Stunden heute: im Tab Zeit über alle geladenen Projekte, sonst für das offene Projekt
  function elTodayH(all) {
    const today = elDay(Date.now()), sum = (t) => (Array.isArray(t) ? t : []).filter((e) => e.d === today).reduce((a, e) => a + (Number(e.h) || 0), 0);
    if (!all) return Math.round(sum(S.doc.project?.time) * 100) / 100;
    const on = S.doc.project?.online?.id, rows = (EL_S.onlist || []).filter((e) => e.id !== on);
    return Math.round((sum(S.doc.project?.time) + rows.reduce((a, e) => a + sum(e.pt), 0)) * 100) / 100;
  }
  return { elTodayH, elTimeAdd, elTimeDel, elZeitDoc, elZeitInit, elZeitPause, elZeitUndo, elZeitResolve, elZeitData, elZeitOpen, elZeitAdd, elZeitCsv, elCsv };
}
