// elplexaCAD: Teilen per Link (Ersteller und geteilte Ansicht) und Notizen/Markierungen darin. Aus app.js ausgelagert (Umbau, 27.10.2026), Verhalten unverändert.
// Zustand: EL_N (Notizen) hier, EL_S (Übersicht) und S gehören app.js. Nur im elplexaCAD-Bau benutzt.
import { H } from "./frame.js";
import { modName } from "./model.js";
import { toast, openModal, confirmDialog } from "./dialogs.js";
import { cloudUser, shareCreate, shareList, shareNoteAdd, shareNoteDelete, shareNotes, shareOpen, shareRevoke, shareUrl } from "./cloud.js";
import * as E from "./elplexa.js";
import * as N from "./notizen.js";
import * as OF from "./offedit.js";

export function makeTeilen({ S, $, EL_S, stage, applyView, elHub, elKey, elLogin, elMod, elName, elSaveOnline, loadText, pointerPos, renderSheet, setTool, sheetLabel, switchSheet, toWorld }) {
  // Teilen per Link (Meilenstein 2, Schritt 1, 18.10.2026). Ersteller: Fenster „Link teilen“ je Online-Projekt (cloud.js share*).
  // Empfänger: ?teilen=<Schlüssel> öffnet die geteilte Ansicht (S.shared): ohne Login, alles gesperrt (change, markDirty, Tasten, Zeichenfläche
  // nur verschieben und zoomen, Speichern/Drucken/Export über elUnlock), keine Absturz-Sicherung, keine Zeit, nicht unter „zuletzt geöffnet“.
  const elShareStart = () => (S.shared = new URLSearchParams(window.location.search).get("teilen") || null);
  async function elShareLoad() {
    document.body.classList.add("el-shared", "el-sharewait"); // wait: bis geladen ohne Dateiname und Status im Kopf
    const badge = document.createElement("span"); badge.className = "el-sharebadge"; badge.setAttribute("role", "status"); badge.textContent = "Geteilte Ansicht · nur ansehen";
    $("#el-crumb").after(badge);
    for (const el of document.querySelectorAll("#left, #right")) el.inert = true;
    try {
      const r = await shareOpen(S.shared);
      if (r.grund) EL_S.shareFail = { grund: r.grund };
      else {
        EL_S.fromOnline = true;
        OF.setMode({ ro: true, prices: r.prices }); // Offerte im Link: nur lesen, Preise nur wenn freigegeben
        try { await loadText(JSON.stringify(r.doc), r.name || "Geteiltes Projekt", null); } finally { EL_S.fromOnline = false; }
        EL_S.shareInfo = { at: r.at, ablauf: r.ablauf, mods: r.modules ? E.modIds(S.doc).filter((id) => !E.modById(id)?.auto).map((id) => modName(S.doc, id)) : null };
        setTool("hand"); document.body.classList.remove("el-sharewait");
        elNotesInit(r.doc.sheets);
      }
    } catch (err) { EL_S.shareFail = { msg: err.message || String(err) }; }
    elHub(true);
  }
  function elShareKey(e) { // true = Taste gesperrt oder erledigt; erlaubt sind Ansehen und Blättern
    if (e.metaKey || e.ctrlKey || e.altKey) { e.preventDefault(); return true; }
    if (EL_N.keys && !e.shiftKey && ["n", "m", "l", "N", "M", "L"].includes(e.key)) { e.preventDefault(); elNoteCmd({ n: "notiz", m: "mark", l: "liste" }[e.key.toLowerCase()]); return true; }
    if (e.key === "Escape" && (EL_N.tool || EL_N.drag)) { e.preventDefault(); elNoteTool(null); return true; }
    if (/^[0-9?§`]$/.test(e.key)) { e.preventDefault(); if (EL_S.shareInfo) elKey(e); return true; }
    if (["PageUp", "PageDown", "f", "F", "+", "-", "=", "g", "G", " ", "Escape", "Tab", "Enter"].includes(e.key)) return false;
    e.preventDefault(); return true;
  }
  // Notizen und Markierungen im Teilen-Link (Meilenstein 2, Schritt 2, CJ 20.10.2026; notizen.js, cloud.js shareNote*). Empfänger setzen sie
  // auf den geteilten Blättern, die Zeichnung bleibt gesperrt (S.shared). Ebene #el-notes über der Zeichnung, nie in Datei, PDF oder DXF.
  // Alle mit dem Link sehen alle Notizen zum Link (CJ 20.10.). Gast-Name und Zufallskennung im Browser (localStorage elplexacad.gast).
  const EL_N = { list: [], keys: null, tool: null, mark: "rechteck", drag: null, off: false, bar: null, layer: null };
  function elGuest() {
    let g = {}; try { g = JSON.parse(localStorage.getItem("elplexacad.gast")) || {}; } catch { /* ohne Speicher: Kennung gilt bis zum Schliessen */ }
    if (!g.id) { g.id = crypto.randomUUID(); elGuestKeep(g); }
    return g;
  }
  function elGuestKeep(g) { EL_N.guest = g; try { localStorage.setItem("elplexacad.gast", JSON.stringify(g)); } catch { /* egal */ } }
  async function elNotesInit(raw) {
    EL_N.keys = N.sheetNoteKeys(raw, S.doc.sheets); EL_N.guest = elGuest();
    EL_N.layer = document.createElementNS("http://www.w3.org/2000/svg", "g"); EL_N.layer.id = "el-notes"; world.appendChild(EL_N.layer);
    EL_N.bar = document.createElement("div"); EL_N.bar.id = "el-notebar"; EL_N.bar.setAttribute("role", "toolbar"); EL_N.bar.setAttribute("aria-label", "Notizen");
    stage.appendChild(EL_N.bar);
    EL_N.bar.addEventListener("click", (e) => { const b = e.target.closest("[data-elnote]"); if (b && !b.disabled) elNoteCmd(b.dataset.elnote); });
    stage.addEventListener("pointerdown", elNoteDown, true); // vor dem Verschieben der Ansicht (Zeichenfläche)
    elNoteBar();
    await elNotesLoad();
  }
  async function elNotesLoad() {
    try { const r = await shareNotes(S.shared, EL_N.guest.id); if (r.grund) return elNoteDead(); EL_N.list = r.notes || []; }
    catch (err) { toast("Notizen: " + (err.message || err), "error"); }
    elNoteBar(); elNotesDraw();
  }
  function elNoteDead() { EL_N.off = true; elNoteTool(null); toast(N.NOTE_GRUND.link.replace(" Die Notiz wurde nicht gespeichert.", ""), "error"); }
  const elNoteKey = () => EL_N.keys?.get(S.model);
  function elNoteBar() { if (EL_N.bar) EL_N.bar.innerHTML = N.noteBarHTML(EL_N.tool, EL_N.list.length, EL_N.off); }
  function elNotesDraw() { if (EL_N.layer) EL_N.layer.innerHTML = N.notesSVG(EL_N.list, elNoteKey(), S.view.z, EL_N.drag?.box ? { kind: EL_N.tool, ...EL_N.drag.box } : null); }
  function elNoteTool(t) {
    EL_N.tool = EL_N.off ? null : t; EL_N.drag = null;
    svg.classList.toggle("el-noting", !!EL_N.tool);
    elNoteBar(); elNotesDraw();
  }
  function elNoteCmd(c) {
    if (c === "liste") return elNoteList();
    if (EL_N.off) return toast(N.NOTE_GRUND.link.replace(" Die Notiz wurde nicht gespeichert.", ""), "error");
    if (!EL_N.keys.get(S.model)) return toast("Auf diesem Blatt gehen keine Notizen.");
    if (c === "mark") { if (EL_N.tool === "kreis" || EL_N.tool === "rechteck") EL_N.mark = EL_N.tool === "kreis" ? "rechteck" : "kreis"; return elNoteTool(EL_N.mark); } // nochmals M wechselt Kreis und Rechteck
    elNoteTool(EL_N.tool === c ? null : c);
  }
  function elNoteDown(e) {
    const pin = e.target.closest?.("[data-note]");
    if (pin && !EL_N.tool) { e.stopPropagation(); e.preventDefault(); window.addEventListener("pointerup", () => setTimeout(() => elNoteView(pin.dataset.note)), { once: true }); return; }
    if (!EL_N.tool || e.button !== 0 || !e.target.closest("#svg")) return;
    e.stopPropagation(); e.preventDefault();
    const { sx, sy } = pointerPos(e), a = toWorld(sx, sy);
    if (EL_N.tool === "notiz") { // Fenster erst nach dem Loslassen, sonst trifft der Klick ein Feld oder „Abbrechen“ im Fenster
      window.addEventListener("pointerup", () => setTimeout(() => elNoteForm({ kind: "notiz", x: a.x, y: a.y, w: 0, h: 0 })), { once: true });
      return;
    }
    EL_N.drag = { a, box: null };
    const move = (ev) => { const p = pointerPos(ev); EL_N.drag.box = N.boxOf(a, toWorld(p.sx, p.sy)); elNotesDraw(); };
    const up = (ev) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      const p = pointerPos(ev), box = N.boxOf(a, toWorld(p.sx, p.sy)), d = EL_N.drag; EL_N.drag = null;
      if (!d) return;
      if (Math.max(box.w, box.h) * S.view.z < 8) { elNotesDraw(); toast("Markierung aufziehen: Maus gedrückt halten und ziehen."); return; } // nur geklickt
      const kind = EL_N.tool; setTimeout(() => elNoteForm({ kind, ...box })); // nach dem Klick, siehe Notiz
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
  // Text eingeben und speichern; bei Fehler bleibt das Fenster mit dem Text offen (zum Kopieren oder nochmals Versuchen)
  async function elNoteForm(pos, text = "", msg = "", author = "") {
    const kind = pos.kind, drawBox = kind !== "notiz" ? { ...pos } : null;
    if (drawBox) { EL_N.drag = { box: drawBox }; elNotesDraw(); } // Markierung bleibt sichtbar, solange das Fenster offen ist
    const name = EL_N.guest.name || "";
    const r = await openModal(kind === "notiz" ? "Notiz" : "Markierung", N.noteFormHTML(kind, name, text, msg, author), (b, done) => {
      if (b.dataset.c !== undefined) done(null);
      else if (b.dataset.ok !== undefined) { const f = (k) => $(`#modal-root [data-nf="${k}"]`)?.value; done({ text: f("text") ?? "", author: name || f("author") || "" }); }
    }, null, name || author ? "textarea" : "input");
    EL_N.drag = null; elNotesDraw();
    if (!r) return;
    const sheet = elNoteKey(), c = N.cleanNote({ ...pos, ...r, sheet, sheet_label: elShName(S.model) });
    const again = (m) => elNoteForm(pos, r.text, m, r.author); // Fenster wieder mit Text und Name
    if (c.error) return again(c.error);
    if (!name) elGuestKeep({ ...EL_N.guest, name: c.note.author });
    let res;
    try { res = await shareNoteAdd(S.shared, EL_N.guest.id, c.note); } catch (err) { return again(err.message || String(err)); }
    if (res.grund === "link") { elNoteDead(); return again(N.NOTE_GRUND.link); }
    if (res.grund) return again(N.NOTE_GRUND[res.grund] || N.NOTE_GRUND.eingabe);
    EL_N.list.push({ ...c.note, id: res.id, created_at: res.created_at, status: "offen", mine: true });
    elNoteTool(null); toast(`${kind === "notiz" ? "Notiz" : "Markierung"} ${EL_N.list.length} gespeichert.`);
  }
  const elNoteSheet = (n) => S.doc.sheets.find((sh) => EL_N.keys.get(sh) === n.sheet);
  const elShName = (sh) => sheetLabel(sh, S.doc.sheets.indexOf(sh));
  function elNoteView(id) {
    const i = EL_N.list.findIndex((n) => n.id === id), n = EL_N.list[i];
    if (!n) return;
    openModal(`${n.kind === "notiz" ? "Notiz" : "Markierung"} ${i + 1}`, N.noteViewHTML(n, i + 1, elNoteSheet(n) ? elShName(elNoteSheet(n)) : n.sheet_label), (b, done) => {
      if (b.dataset.c !== undefined) done();
      else if (b.dataset.ndel) { done(); elNoteDelete(b.dataset.ndel); }
    }, null, "[data-c]");
  }
  async function elNoteDelete(id) {
    if (!(await confirmDialog("Notiz löschen", "Die eigene Notiz wird für alle mit diesem Link gelöscht.", "Löschen"))) return;
    let r;
    try { r = await shareNoteDelete(S.shared, EL_N.guest.id, id); } catch (err) { toast(err.message || String(err), "error"); return; }
    if (r.grund === "link") return elNoteDead();
    if (r.grund) { toast(N.NOTE_GRUND[r.grund] || N.NOTE_GRUND.fehlt); return elNotesLoad(); }
    EL_N.list = EL_N.list.filter((n) => n.id !== id); elNoteBar(); elNotesDraw(); toast("Notiz gelöscht.");
  }
  function elNoteList() {
    openModal("Notizen zu diesem Link", N.noteListHTML(EL_N.list, (n) => { const sh = elNoteSheet(n); return sh ? elShName(sh) : null; }), (b, done) => {
      if (b.dataset.c !== undefined) done();
      else if (b.dataset.ngo) { done(); elNoteGo(b.dataset.ngo); }
      else if (b.dataset.ndel) { done(); elNoteDelete(b.dataset.ndel); }
    }, null, "[data-ngo],[data-c]", "el-nlistmodal");
  }
  function elNoteGo(id) { // zum Blatt springen, Notiz in die Mitte
    const n = EL_N.list.find((x) => x.id === id), sh = n && elNoteSheet(n);
    if (!sh) return;
    if (EL_S.hub && !EL_S.hub.hidden) elHub(false);
    switchSheet(S.doc.sheets.indexOf(sh));
    const r = stage.getBoundingClientRect(), cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    S.view = { ...S.view, x: r.width / 2 - cx * S.view.z, y: r.height / 2 - (H - cy) * S.view.z };
    applyView(); renderSheet();
  }
  // Fenster „Link teilen“ (Ersteller): gültige Links zeigen, kopieren, widerrufen, neuen Link (30 Tage, Vorgabe der Datenbank) erstellen.
  // Ist es das offene Projekt, wählen Häkchen die Module (CJ 18.10.2026); only = Vorwahl ein Modul (Exportieren › Modul teilen). Alle Häkchen = ganzes Projekt.
  async function elShareDialog(id, only = null) {
    const name = EL_S.onlist?.find((x) => x.id === id)?.name || elName(), mine = S.doc.project?.online?.id === id;
    const ids = mine ? E.modIds(S.doc).filter((m) => !E.modById(m)?.auto) : [], pick = mine ? { ids, on: new Set(only ? [only] : ids), prices: false } : null, nm = (m) => modName(mine ? S.doc : {}, m);
    let links = null;
    const draw = () => { const m = $("#modal-root .modal"); if (m) m.querySelector(".el-shbody").innerHTML = E.shareDialogHTML(name, links, shareUrl, pick, nm); };
    const load = async (fn) => { try { const l = await fn(); if (l) links = l; } catch (err) { toast(err.message || String(err), "error"); } draw(); };
    const copy = async (token) => {
      const url = shareUrl(token);
      try { await navigator.clipboard.writeText(url); toast("Link kopiert. Gültig 30 Tage, nur zum Ansehen."); }
      catch { const i = [...document.querySelectorAll("#modal-root .el-shurl")].find((x) => x.value === url); i?.select(); toast("Kopieren ging nicht automatisch: Link ist markiert, mit ⌘C kopieren."); }
    };
    const tick = (e) => { if (pick && e.target.matches?.("[data-shprices]")) { pick.prices = e.target.checked; return; } const b = e.target.closest("[data-shmod]"); if (!b || !pick) return; if (b.checked) pick.on.add(b.dataset.shmod); else pick.on.delete(b.dataset.shmod); draw(); };
    const shown = openModal("Link teilen", `<div class="el-shbody">${E.shareDialogHTML(name, null, shareUrl, pick, nm)}</div>`, async (b, done) => {
      if (b.dataset.c !== undefined) done(null);
      else if (b.dataset.shnew !== undefined) {
        b.disabled = true; let n = null;
        // Mit Offerte immer als Liste: «ganzes Projekt» (ohne Liste) zeigt die Datenbank ohne Offerte (Migration 20261026_share_offerte)
        const mods = pick && (pick.on.size < ids.length || ids.some((m) => E.baseOf(m) === "offerte")) ? ids.filter((m) => pick.on.has(m)) : null;
        const prices = !!(pick?.prices && mods?.some((m) => E.baseOf(m) === "offerte"));
        await load(async () => { n = await shareCreate(id, mods, prices); return n ? [n, ...links] : null; }); if (n) copy(n.token);
      }
      else if (b.dataset.shcopy) copy(b.dataset.shcopy);
      else if (b.dataset.shrev) { b.disabled = true; const n0 = links.length; await load(async () => ((await shareRevoke(b.dataset.shrev))?.length ? links.filter((l) => l.id !== b.dataset.shrev) : null)); if (links.length < n0) toast("Link widerrufen. Wer ihn öffnet, sieht nur noch einen Hinweis."); }
    }, null, "[data-c]", "el-sharemodal");
    const root = $("#modal-root"); root.addEventListener("change", tick);
    await load(() => shareList(id));
    try { return await shown; } finally { root.removeEventListener("change", tick); }
  }
  // Exportieren › Modul teilen (CJ 18.10.2026): Link nur für das offene Modul. Geteilt wird der Online-Stand, darum vorher online speichern.
  async function elShareModule() {
    if (S.shared) return;
    if (!cloudUser() && !(await elLogin())) return;
    if (!S.doc.project?.online || S.dirty) {
      if (!(await confirmDialog("Zuerst online speichern", "Geteilt wird der online gespeicherte Stand. Jetzt online speichern und dann den Link erstellen?", "Online speichern"))) return;
      await elSaveOnline();
      if (!S.doc.project?.online || S.dirty) return;
    }
    return elShareDialog(S.doc.project.online.id, elMod());
  }
  return { elShareStart, elShareLoad, elShareKey, elNotesDraw, elShareDialog, elShareModule };
}
