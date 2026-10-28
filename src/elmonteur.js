// Pläne für den Monteur, Seite Planer (CJ 28.10.2026, nur elplexaCAD): im Plan-Modul «Veröffentlichen» mit Zustand, Fenster «Link für Monteur»
// (Ablauf, Telefon, Link, QR-Code, Widerrufen, Notizen je Plan) und Notizen im Plan (Taste N, Marken mit fester Nummer, Monteur-Notizen alle 30 s).
// Daten: cloud.js mShare*, mPublish, mPNote* (Migration 20261028_monteur). Der alte Teilen-Link (elteilen.js) bleibt daneben unverändert.
// Annahmen (im Vault unter «Offen»): Auswahl «Alle Pläne» / einzelne Pläne merkt sich der Browser je Link; Veröffentlichen verlangt einen online
// gespeicherten Stand, damit die PDF-Pläne im Speicher liegen; die Stand-Nummer im Schriftfeld ist die nächste Nummer des Links (ein Planer je Link).
import qrcode from "qrcode-generator";
import { H } from "./frame.js";
import { esc } from "./render.js";
import { toast, openModal, confirmDialog } from "./dialogs.js";
import { loadProfil } from "./profil.js";
import { fromBase64 } from "./pdfbg.js";
import { cloudUser, monteurUrl, mShareGet, mShareCreate, mShareUpdate, mRelease, mDevices, mPlanerNotes, mPublish, mPNoteAdd, mPNoteEdit, mPNoteConfirm, mPNoteDelete } from "./cloud.js";
import * as K from "./monteur-kern.js";

const ICON = {
  go: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg>',
  move: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  bubble: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
};
const POLL = 30e3, HOLD = 500;
const ls = { get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ohne Speicher */ } } };

export function makeMonteurPlaner({ S, $, EL_S, stage, applyView, renderSheet, switchSheet, sheetLabel, pointerPos, toWorld, elLogin, elSaveOnline, isPlan }) {
  const M = { pid: null, share: undefined, pub: null, notes: [], tool: null, busy: false, hash: "", timer: null, hint: null, hidden: new Set(), flash: null, open: null, devices: null };
  const world = $("#world");
  const bar = document.createElement("div"); bar.id = "el-mpub"; bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Pläne für den Monteur"); bar.hidden = true; stage.appendChild(bar);
  const hintEl = document.createElement("div"); hintEl.id = "el-mhint"; hintEl.hidden = true; hintEl.setAttribute("role", "status"); stage.appendChild(hintEl);
  const menu = document.createElement("div"); menu.id = "el-mmenu"; menu.setAttribute("role", "menu"); menu.hidden = true; stage.appendChild(menu);
  const tst = document.createElement("div"); tst.id = "el-mtoast"; tst.setAttribute("role", "status"); stage.appendChild(tst);
  const layer = document.createElementNS("http://www.w3.org/2000/svg", "g"); layer.id = "el-mnotes"; world.appendChild(layer);

  const proj = () => S.doc.project?.online?.id || null;
  const planSheets = () => S.doc.sheets.filter((sh) => sh.kind === "plan");
  const sid = (sh) => String(sh.sid);
  const shOf = (key) => planSheets().find((sh) => sid(sh) === key);
  const shName = (sh) => K.planTitle(sh.meta.TITEL || sheetLabel(sh, S.doc.sheets.indexOf(sh)));
  const pickKey = () => `elplexacad.mpick.${M.share?.id}`;
  const picked = () => { const p = M.share ? ls.get(pickKey()) : null; const all = planSheets(); return Array.isArray(p) ? all.filter((sh) => p.includes(sid(sh))) : all; };
  const seenKey = () => `elplexacad.mseen.${M.share?.id}`;
  const active = () => isPlan() && !S.shared && !(EL_S.hub && !EL_S.hub.hidden);
  const myName = () => String(cloudUser() || "").split("@")[0] || "Planer"; // Annahme: Name der Planer-Notiz = Konto ohne @…
  const vis = () => M.notes.filter((n) => !M.hidden.has(n.id));

  // ---------- Laden und Abfrage ----------
  async function load(quiet = true) {
    const pid = proj();
    if (!pid || !cloudUser()) { M.pid = pid; M.share = pid ? undefined : null; M.notes = []; draw(); return; }
    try {
      if (pid !== M.pid) { M.pid = pid; M.share = undefined; M.notes = []; M.pub = null; }
      const s = await mShareGet(pid);
      if (s === undefined) return;
      M.share = s;
      if (s) { const [rel, notes] = await Promise.all([mRelease(s.id), mPlanerNotes(s.id)]); M.pub = rel; M.notes = notes; seeNew(); }
      else { M.pub = null; M.notes = []; }
    } catch (err) { if (!quiet) toast(err.message || String(err), "error"); }
    draw();
  }
  function poll() {
    clearTimeout(M.timer);
    M.timer = setTimeout(async () => { if (proj() && cloudUser() && document.visibilityState !== "hidden" && planSheets().length) await load(); poll(); }, POLL);
  }
  // Neue oder geänderte Monteur-Notizen: Hinweis oben (die neueste), gesehen merkt sich der Browser je Link
  function seeNew() {
    const seen = ls.get(seenKey()) || {};
    const fresh = M.notes.filter((n) => n.von === "monteur" && n.status === "offen" && seen[n.id] !== n.updated_at).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
    M.hint = fresh.length ? { id: fresh[0].id, more: fresh.length - 1 } : null;
  }
  function markSeen(ids) { const seen = ls.get(seenKey()) || {}; for (const id of ids) { const n = M.notes.find((x) => x.id === id); if (n) seen[n.id] = n.updated_at; } ls.set(seenKey(), seen); seeNew(); drawHint(); }

  // ---------- Zustand neben «Veröffentlichen» ----------
  function stateHash() { return K.fingerprint(JSON.stringify([S.doc.project?.name, picked().map((sh) => [sh.sid, sh.meta, sh.items, sh.bg, sh.bgOff, sh.bgOp, sh.layers, sh.paper, sh.pmid, sh.tf, sh.bom])])); }
  let syncT = null;
  const sync = () => { clearTimeout(syncT); syncT = setTimeout(draw, 300); };
  function draw() {
    const on = active();
    bar.hidden = !on; if (!on) { hintEl.hidden = true; menu.hidden = true; layer.innerHTML = ""; return; }
    if (proj() !== M.pid) { load(); poll(); }
    M.hash = stateHash();
    const unpub = vis().filter((n) => n.von === "planer" && !n.published).length, open = vis().filter((n) => n.von === "monteur" && n.status === "offen").length;
    const st = !proj() ? { hot: false, lines: ["Nicht geteilt"], sub: "Für den Monteur zuerst online speichern" } : M.share === undefined ? { hot: false, lines: [cloudUser() ? "Link wird geladen …" : "Nicht angemeldet"], sub: "" } : !M.share ? { hot: false, lines: ["Nicht geteilt"], sub: "Noch kein Link für Monteur" } : K.pubState(M.pub, M.hash, unpub);
    bar.innerHTML = `<div class="el-mp-st${st.hot ? " hot" : ""}"><b>${esc(st.lines[0])}</b>${st.lines[1] ? `<span class="warn">${esc(st.lines[1])}</span>` : st.sub ? `<span>${esc(st.sub)}</span>` : ""}</div>`
      + `<button class="btn outline" data-mp="note" aria-pressed="${M.tool === "add"}" title="Notiz für den Monteur setzen (N)"${M.share ? "" : " disabled"}>${ICON.bubble}<span>Notiz</span><kbd>N</kbd></button>`
      + `<button class="btn outline" data-mp="link" title="Link für Monteur: Ablauf, Telefon, QR-Code, Notizen">Link für Monteur …${open ? `<span class="el-mcnt" title="${open} offene Notizen der Monteure">${open}</span>` : ""}</button>`
      + `<button class="btn ${st.hot && M.share ? "el-mhot" : "primary"}" data-mp="pub"${M.busy ? " disabled" : ""} title="Plan-Blätter für den Monteur veröffentlichen (ohne Zeit, Preise, andere Module)">Veröffentlichen</button>`;
    drawHint(); drawNotes();
  }
  bar.addEventListener("click", (e) => { const b = e.target.closest("[data-mp]"); if (!b || b.disabled) return; ({ note: () => setTool(M.tool === "add" ? null : "add"), link: () => dialog(), pub: () => publish() })[b.dataset.mp](); });

  // ---------- Veröffentlichen ----------
  async function sha256(bytes) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
  async function ensureShare() {
    if (!cloudUser() && !(await elLogin())) return null;
    if (!proj() || S.dirty) {
      if (!(await confirmDialog("Zuerst online speichern", "Der Monteur bekommt die Pläne aus der Online-Ablage (auch die PDF-Pläne). Jetzt online speichern und dann veröffentlichen?", "Online speichern"))) return null;
      await elSaveOnline();
      if (!proj() || S.dirty) return null;
    }
    if (M.pid !== proj() || M.share === undefined) await load(false);
    if (!M.share) {
      const s = await mShareCreate(proj(), K.expiryOf("30"), String(loadProfil().TEL || "").slice(0, 30));
      if (!s) return null;
      M.share = s; M.pub = null; M.notes = []; toast("Link für Monteur erstellt (30 Tage).");
    }
    return M.share;
  }
  async function publish() {
    if (M.busy) return;
    const s = await ensureShare();
    if (!s) return;
    const sheets = picked();
    if (!sheets.length) { toast("Kein Plan gewählt. Im Fenster «Link für Monteur» Pläne wählen.", "error"); return; }
    M.busy = true; draw();
    try {
      const rev = (s.rev || 0) + 1, now = new Date(), day = K.fmtDay(now, true), assets = {};
      for (const sh of sheets) {
        const a = sh.bg?.asset && !sh.bgOff ? S.doc.assets?.[sh.bg.asset] : null;
        if (a && !assets[sh.bg.asset]) assets[sh.bg.asset] = { name: a.name, sha: await sha256(fromBase64(a.data)) };
      }
      const data = { v: 1, hash: M.hash, by: myName(), assets, sheets: sheets.map((sh) => {
        const i = S.doc.sheets.indexOf(sh), r = S.planRelease(sh, i, { ...sh.meta, INDEX: String(rev), DATUM: day });
        return { sid: sid(sh), title: shName(sh), h: K.fingerprint(JSON.stringify([sh.meta, sh.items, sh.bg, sh.layers, sh.paper, sh.pmid])), ...r };
      }) };
      const r = await mPublish(s.id, data);
      if (!r) return;
      if (r.grund) { toast(r.grund === "gross" ? "Der Stand ist zu gross für den Link (über 5 MB). Weniger Pläne wählen." : "Veröffentlichen ging nicht: Link ungültig.", "error"); return; }
      M.share = { ...s, rev: r.rev, pub_at: r.at }; M.pub = { rev: r.rev, at: r.at, hash: data.hash };
      for (const n of M.notes) if (n.von === "planer") n.published = true;
      toast(`Veröffentlicht, Stand ${r.rev}. Offene Links zeigen «Neuer Stand · Laden».`);
    } catch (err) { toast(err.message || String(err), "error"); }
    finally { M.busy = false; draw(); }
  }

  // ---------- Notizen im Plan ----------
  const z = () => S.view.z;
  const scr = (n) => ({ x: S.view.x + n.x * z(), y: S.view.y + (H - n.y) * z() });
  function drawNotes() {
    if (!active() || !S.model.sid) { layer.innerHTML = ""; return; }
    const key = sid(S.model), list = vis().filter((n) => n.sheet === key).sort((a, b) => a.nr - b.nr), k = 1 / z();
    const by = new Map(list.map((n) => [n.id, n]));
    const groups = K.clusterMarks(list.map((n) => ({ id: n.id, ...scr(n) })), 40, new Set([M.open, M.move?.id].filter(Boolean)));
    let s = "";
    for (const g of groups) {
      const n0 = by.get(g.ids[0]), at = `translate(${n0.x} ${n0.y}) scale(${k} ${-k})`;
      if (g.ids.length > 1) { const lab = K.clusterLabel(g.ids.map((id) => by.get(id).nr)), w = Math.max(30, lab.length * 8 + 14); s += `<g class="el-mk cl" data-mcl="${g.ids.join(",")}" transform="${at}" role="button" aria-label="${g.ids.length} Notizen gebündelt: ${esc(lab)}"><rect x="${-w / 2}" y="-15" width="${w}" height="30" rx="15"/><text text-anchor="middle" dominant-baseline="central">${esc(lab)}</text></g>`; continue; }
      const n = n0, cls = `${n.von === "planer" ? "pl" : "mo"}${n.status === "erledigt" ? " done" : ""}${n.von === "planer" && !n.published ? " unpub" : ""}${M.flash === n.id ? " flash" : ""}`;
      s += `<g class="el-mk ${cls}" data-mnote="${esc(n.id)}" transform="${at}" role="button" aria-label="Notiz ${n.nr} von ${esc(n.author)}: ${esc(n.text)}"><circle class="hit" r="22"/><circle class="ring" r="19"/><circle class="dt" r="15"/><text text-anchor="middle" dominant-baseline="central">${n.nr}</text>${n.status === "erledigt" ? `<circle class="ck" cx="12" cy="12" r="6"/>` : ""}`
        + (M.open === n.id ? `<foreignObject x="-120" y="24" width="240" height="120"><div xmlns="http://www.w3.org/1999/xhtml" class="el-mco"><b>${n.nr} · ${esc(n.author)}</b><br>${esc(n.text)}${n.antwort ? `<br><i>Antwort: ${esc(n.antwort)}</i>` : ""}</div></foreignObject>` : "") + "</g>";
    }
    if (M.ghost) s += `<g class="el-mk ghost" transform="translate(${M.ghost.x} ${M.ghost.y}) scale(${k} ${-k})"><circle class="dt" r="15"/><text text-anchor="middle" dominant-baseline="central">+</text></g>`;
    layer.innerHTML = s;
  }
  function setTool(t, move = null) {
    M.tool = t; M.move = move; svgEl().classList.toggle("el-mplacing", !!t);
    if (t === "add") toast("Stelle im Plan klicken. Esc bricht ab.");
    if (t === "move") toast(`Neue Stelle für Notiz ${move.nr} klicken. Esc bricht ab.`);
    draw();
  }
  const svgEl = () => $("#svg");
  // Zeiger: Marke kurz = dorthin und Text, lange (0,5 s, Ring) oder Rechtsklick = Menü; Werkzeug Notiz: Stelle wählen
  let hold = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest?.("#el-mpub, #el-mhint, #el-mmenu, #el-mtoast")) { e.stopPropagation(); return; } // eigene Knöpfe: nicht die Zeichenfläche (setPointerCapture schluckt sonst den Klick)
    if (!active()) return;
    const mk = e.target.closest?.("[data-mnote],[data-mcl]");
    if (mk && !M.tool) {
      e.stopPropagation(); e.preventDefault();
      if (mk.dataset.mcl) { const p = pointerPos(e); zoomAt(p.sx, p.sy, 2.2); return; }
      if (e.button === 2) return;
      mk.classList.add("press");
      hold = { id: mk.dataset.mnote, x: e.clientX, y: e.clientY, el: mk, t: setTimeout(() => { if (!hold) return; hold.fired = true; mk.classList.remove("press"); openMenu(hold.id, e.clientX, e.clientY); }, HOLD) };
      return;
    }
    if (!M.tool || e.button !== 0 || !e.target.closest("#svg")) return;
    e.stopPropagation(); e.preventDefault();
    const { sx, sy } = pointerPos(e), w = toWorld(sx, sy), at = { x: Math.round(w.x * 10) / 10, y: Math.round(w.y * 10) / 10 };
    window.addEventListener("pointerup", () => setTimeout(() => (M.tool === "move" ? moveTo(at) : compose(at))), { once: true }); // Fenster nach dem Loslassen
  }, true);
  window.addEventListener("pointermove", (e) => { if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 8) { clearTimeout(hold.t); hold.el.classList.remove("press"); hold = null; } });
  window.addEventListener("pointerup", () => { if (!hold) return; const h = hold; hold = null; clearTimeout(h.t); h.el.classList.remove("press"); if (!h.fired) focus(h.id); });
  stage.addEventListener("contextmenu", (e) => { const mk = e.target.closest?.("[data-mnote]"); if (!mk || !active()) return; e.preventDefault(); e.stopPropagation(); if (hold) { clearTimeout(hold.t); hold = null; } openMenu(mk.dataset.mnote, e.clientX, e.clientY); }, true);
  function zoomAt(sx, sy, f) {
    const z0 = S.view.z, z1 = z0 * f;
    S.view = { ...S.view, z: z1, x: sx - (sx - S.view.x) * (z1 / z0), y: sy - (sy - S.view.y) * (z1 / z0) };
    applyView(); renderSheet();
  }
  // Dorthin: Blatt wechseln, Marke in die Mitte, aufleuchten, Text darunter
  function focus(id) {
    const n = M.notes.find((x) => x.id === id), sh = n && shOf(n.sheet);
    if (!sh) { toast("Diesen Plan gibt es im Projekt nicht mehr."); return; }
    closeMenu();
    const i = S.doc.sheets.indexOf(sh); if (i !== S.active) switchSheet(i);
    const r = stage.getBoundingClientRect();
    S.view = { ...S.view, x: r.width / 2 - n.x * S.view.z, y: r.height / 2 - (H - n.y) * S.view.z };
    M.open = M.open === id && i === S.active ? null : id; M.flash = id; applyView(); renderSheet(); drawNotes();
    clearTimeout(M.ft); M.ft = setTimeout(() => { M.flash = null; drawNotes(); }, 1400);
    if (n.von === "monteur") markSeen([id]);
  }
  function openMenu(id, cx, cy) {
    const n = M.notes.find((x) => x.id === id); if (!n) return;
    const items = [["go", "Dorthin", ICON.go], ["edit", "Bearbeiten", ICON.edit], ["move", "Verschieben", ICON.move], ...(n.von === "monteur" ? [n.status === "erledigt" ? ["reopen", "Wieder offen", ICON.ok] : ["ok", "Bestätigen", ICON.ok]] : []), ["del", "Löschen", ICON.trash]];
    menu.innerHTML = `<div class="m-t">Nr. ${n.nr} · ${esc(n.author)}</div><div class="m-r">${items.map(([a, l, ic]) => `<button type="button" role="menuitem" data-ma="${a}"${a === "del" ? ' class="dl"' : ""}>${ic}<span>${l}</span></button>`).join("")}</div>`;
    menu.hidden = false;
    const r = stage.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = `${Math.max(8, Math.min(r.width - w - 8, cx - r.left - w / 2))}px`; menu.style.top = `${cy - r.top - h - 16 > 8 ? cy - r.top - h - 16 : cy - r.top + 24}px`;
    menu.dataset.id = id; menu.querySelector("button").focus();
  }
  const closeMenu = () => { menu.hidden = true; };
  menu.addEventListener("click", (e) => { const b = e.target.closest("[data-ma]"); if (!b) return; const id = menu.dataset.id; closeMenu(); act(b.dataset.ma, id); });
  document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); }, true);
  function act(a, id) {
    const n = M.notes.find((x) => x.id === id); if (!n) return;
    if (a === "go") focus(id);
    else if (a === "edit") edit(n);
    else if (a === "move") setTool("move", n);
    else if (a === "ok") confirmNote(n);
    else if (a === "reopen") doConfirm(n, false, null);
    else if (a === "del") del(n);
  }
  function textForm(title, text, hint, extra = "") {
    return openModal(title, `<div class="el-mform"><textarea data-mt maxlength="${K.NOTE_MAX}" rows="5" aria-label="Text der Notiz">${esc(text)}</textarea><div class="el-mcc"><span class="er" hidden>Bitte einen Text schreiben.</span><span>${hint}</span></div>${extra}</div><div class="actions"><button class="btn outline" data-c>Abbrechen</button><button class="btn primary" data-ok>Speichern</button></div>`, (b, done) => {
      if (b.dataset.c !== undefined) done(null);
      else if (b.dataset.ok !== undefined) { const t = $("#modal-root [data-mt]").value.trim(); if (!t) { $("#modal-root .er").hidden = false; return; } done(t); }
      else if (b.dataset.mmove !== undefined) done({ move: true });
    }, null, "[data-mt]");
  }
  async function compose(at) {
    const sh = S.model; if (!M.share || sh.kind !== "plan") return;
    M.ghost = at; drawNotes();
    const t = await textForm("Notiz für den Monteur", "", "Monteure sehen die Notiz erst nach «Veröffentlichen».");
    M.ghost = null; setTool(null);
    if (!t) return;
    const r = await mPNoteAdd(M.share.id, { sheet: sid(sh), x: at.x, y: at.y, text: t, author: myName() }).catch((err) => ({ grund: err.message }));
    if (!r) return;
    if (r.grund) { toast(r.grund === "voll" ? "Der Link hat schon 300 Notizen." : `Notiz nicht gespeichert: ${r.grund}`, "error"); return; }
    M.notes.push({ id: r.id, share_id: M.share.id, mod: "plan", sheet: sid(sh), nr: r.nr, von: "planer", published: false, x: at.x, y: at.y, text: t, author: myName(), created_at: r.created_at, updated_at: r.created_at, status: "offen" });
    toast(`Notiz ${r.nr} gespeichert. Für den Monteur mit «Veröffentlichen».`); draw();
  }
  async function edit(n) {
    const r = await textForm(`Notiz ${n.nr} bearbeiten`, n.text, `${esc(n.author)} · ${K.fmtStamp(n.created_at)}`, `<button class="btn outline" data-mmove>${ICON.move}Marke verschieben</button>`);
    if (r?.move) return setTool("move", n);
    if (!r || r === n.text) return;
    const res = await mPNoteEdit(n.id, { text: r }).catch((err) => ({ grund: err.message }));
    if (res?.grund) { toast(`Nicht gespeichert: ${res.grund}`, "error"); return; }
    if (res) { n.text = r; n.updated_at = new Date().toISOString(); draw(); toast(`Notiz ${n.nr} geändert.`); }
  }
  async function moveTo(at) {
    const n = M.move; setTool(null); if (!n) return;
    const res = await mPNoteEdit(n.id, { x: at.x, y: at.y }).catch((err) => ({ grund: err.message }));
    if (res?.grund) { toast(`Nicht verschoben: ${res.grund}`, "error"); return; }
    if (res) { n.x = at.x; n.y = at.y; draw(); toast(`Notiz ${n.nr} verschoben.`); }
  }
  async function confirmNote(n) {
    const r = await openModal(`Notiz ${n.nr} bestätigen`, `<p class="el-mq">«${esc(n.text)}»<br><span>${esc(n.author)} · ${K.fmtStamp(n.created_at)}</span></p><div class="field"><label for="el-mans">Antwort (freiwillig, sofort beim Monteur sichtbar)</label><input id="el-mans" type="text" maxlength="${K.NOTE_MAX}" autocomplete="off" data-mans></div><div class="actions"><button class="btn outline" data-c>Abbrechen</button><button class="btn primary" data-ok>Bestätigen</button></div>`,
      (b, done) => { if (b.dataset.c !== undefined) done(null); else if (b.dataset.ok !== undefined) done({ a: $("#modal-root [data-mans]").value.trim() }); }, null, "[data-mans]");
    if (r) await doConfirm(n, true, r.a || null);
  }
  async function doConfirm(n, done, antwort) {
    const res = await mPNoteConfirm(n.id, done, antwort).catch((err) => ({ grund: err.message }));
    if (res?.grund) { toast(`Nicht bestätigt: ${res.grund}`, "error"); return; }
    if (!res) return;
    Object.assign(n, { status: done ? "erledigt" : "offen", antwort: done ? antwort : null, updated_at: new Date().toISOString() });
    markSeen([n.id]); draw(); toast(done ? `Notiz ${n.nr} bestätigt${antwort ? " mit Antwort" : ""}.` : `Notiz ${n.nr} wieder offen.`);
  }
  // Löschen mit Rückgängig: 5 s nur ausgeblendet, dann in der Datenbank
  function del(n) {
    M.hidden.add(n.id); draw();
    let undone = false;
    const t = setTimeout(async () => {
      if (undone) return;
      const r = await mPNoteDelete(n.id).catch((err) => ({ grund: err.message }));
      M.hidden.delete(n.id);
      if (r?.ok) M.notes = M.notes.filter((x) => x.id !== n.id); else if (r?.grund) toast(`Nicht gelöscht: ${r.grund}`, "error");
      draw();
    }, 5000);
    showToast(`Notiz ${n.nr} gelöscht.`, "Rückgängig", () => { undone = true; clearTimeout(t); M.hidden.delete(n.id); draw(); });
  }
  function showToast(msg, actLabel, fn) {
    tst.innerHTML = `<span>${esc(msg)}</span>${actLabel ? `<button type="button">${esc(actLabel)}</button>` : ""}`; tst.classList.add("on");
    if (actLabel) tst.querySelector("button").onclick = () => { fn(); tst.classList.remove("on"); };
    clearTimeout(tst._t); tst._t = setTimeout(() => tst.classList.remove("on"), 5000);
  }
  function drawHint() {
    const n = M.hint && M.notes.find((x) => x.id === M.hint.id), sh = n && shOf(n.sheet);
    hintEl.hidden = !n || !active();
    if (hintEl.hidden) return;
    hintEl.innerHTML = `<span class="el-mh-ic">${ICON.bubble}</span><span class="el-mh-t"><b>Neue Notiz von ${esc(n.author)}, ${esc(sh ? shName(sh) : "Plan")}, Nr. ${n.nr}</b><span>${esc(n.text)}${M.hint.more ? ` · ${M.hint.more} weitere` : ""}</span></span>`
      + `<button class="btn outline" data-mh="go">Dorthin</button><button class="btn primary" data-mh="ok">Bestätigen</button><button class="el-mh-x" data-mh="x" aria-label="Hinweis schliessen">×</button>`;
    hintEl.dataset.id = n.id;
  }
  hintEl.addEventListener("click", (e) => { const b = e.target.closest("[data-mh]"); if (!b) return; const id = hintEl.dataset.id, n = M.notes.find((x) => x.id === id); if (!n) return; if (b.dataset.mh === "go") focus(id); else if (b.dataset.mh === "ok") confirmNote(n); else markSeen([id]); });

  // Taste N: Notiz setzen, Esc bricht ab (Plan-Modul, Tastenkürzel-Index)
  function key(e) {
    if (!active()) return false;
    if (e.key === "Escape" && (M.tool || !menu.hidden || M.open)) { setTool(null); closeMenu(); M.open = null; drawNotes(); return true; }
    if ((e.key === "n" || e.key === "N") && !e.altKey && !e.shiftKey) { if (!M.share) { toast("Zuerst einen Link für Monteur erstellen (Knopf «Link für Monteur …»)."); return true; } setTool(M.tool === "add" ? null : "add"); return true; }
    return false;
  }

  // ---------- Fenster «Link für Monteur» ----------
  function qrSVG(text) {
    const q = qrcode(0, "M"); q.addData(text); q.make();
    const n = q.getModuleCount(); let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return `<svg class="el-mqr" viewBox="0 0 ${n + 8} ${n + 8}" role="img" aria-label="QR-Code des Links" shape-rendering="crispEdges"><rect width="${n + 8}" height="${n + 8}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  const dlgState = { exp: "keep", end: "", phone: "" };
  function dialogHTML() {
    const s = M.share, st = K.shareStatus(s), all = planSheets(), on = new Set(picked().map(sid)), allOn = on.size === all.length;
    const exp = s ? `<option value="keep"${dlgState.exp === "keep" ? " selected" : ""}>Wie bisher · bis ${K.fmtDay(s.expires_at, true)}</option>` : "";
    const d = (n) => K.fmtDay(Date.now() + n * 864e5, true);
    const left = `<div><span class="lab">Projekt</span><div class="el-mproj">${esc(S.doc.project?.name || "Projekt")}<span>Plan-Modul · ${all.length ? all.map(shName).map(esc).join(", ") : "noch keine Pläne"} · ohne Login, lesen und Notizen setzen</span></div></div>
      <div><label class="el-mchk"><input type="checkbox" data-mall${allOn ? " checked" : ""}> Alle Pläne <small>(Standard)</small></label>
      ${allOn ? "" : `<div class="el-mpick">${all.map((sh) => `<label class="el-mchk"><input type="checkbox" data-mpk="${esc(sid(sh))}"${on.has(sid(sh)) ? " checked" : ""}> ${esc(shName(sh))}</label>`).join("")}</div>${on.size ? "" : `<div class="el-mwarn">Mindestens einen Plan wählen.</div>`}`}</div>
      <label><span class="lab">Ablaufdatum</span><select data-mexp>${exp}<option value="7"${dlgState.exp === "7" ? " selected" : ""}>In 7 Tagen · ${d(7)}</option><option value="30"${dlgState.exp === "30" || (!s && dlgState.exp === "keep") ? " selected" : ""}>In 30 Tagen · ${d(30)}</option><option value="end"${dlgState.exp === "end" ? " selected" : ""}>Bis Bauende (Datum wählen)</option></select></label>
      ${dlgState.exp === "end" ? `<label><span class="lab">Bauende</span><input type="date" data-mend value="${esc(dlgState.end)}"></label>` : ""}
      <label><span class="lab">Telefonnummer für Rückfragen</span><input type="tel" data-mtel maxlength="30" value="${esc(dlgState.phone)}" autocomplete="off"><span class="el-mfh">Vom Profil vorbelegt. Steht beim Monteur unter «Fragen? Anrufen».</span></label>`;
    let link;
    if (!s) link = `<p class="el-mnh">Noch kein Link für Monteur. Der Link zeigt den zuletzt veröffentlichten Stand.</p><div class="actions"><button class="btn primary" data-mnew>Link erstellen</button></div>`;
    else {
      const url = monteurUrl(s.token), dev = M.devices;
      link = `<div><span class="lab">Link</span><div class="el-mlink"><input class="el-shurl" readonly value="${esc(url)}" aria-label="Link"><button class="btn primary" data-mcopy>Link kopieren</button></div></div>
        <div class="el-mqrrow">${qrSVG(url)}<p>QR-Code für den Monteur: mit der Handykamera vom Bildschirm abfotografieren.</p></div>
        <p class="el-mnh">${ICON.bubble}<span><b>Der Link zeigt den zuletzt veröffentlichten Stand.</b> ${s.rev ? `Jetzt Stand ${s.rev} vom ${K.fmtStamp(s.pub_at)}.` : "Noch nichts veröffentlicht: im Plan-Modul «Veröffentlichen»."}</span></p>
        <div class="el-mrev"><button class="btn outline el-mdanger" data-mrev>Widerrufen</button><span class="el-mseen">${s.opened_at ? `Zuletzt geöffnet: ${K.fmtStamp(s.opened_at)}${dev ? ` · ${dev.length} ${dev.length === 1 ? "Gerät" : "Geräte"}` : ""}` : "Noch nie geöffnet"}</span></div>`;
    }
    const sheets = all.filter((sh) => vis().some((n) => n.sheet === sid(sh)));
    const noteRow = (n) => `<li class="el-mnr${n.status === "erledigt" ? " done" : ""}"><button class="el-mnb ${n.von === "planer" ? "pl" : "mo"}${n.von === "planer" && !n.published ? " unpub" : ""}" data-mgo="${esc(n.id)}" aria-label="Zu Notiz ${n.nr}"><span>${n.nr}</span></button><div><p>${esc(n.text)}</p>
      <div class="el-mnm"><span>${esc(n.author)} · ${K.fmtStamp(n.created_at)}</span>${n.von === "planer" ? `<span class="el-mtag ${n.published ? "e" : "o"}">${n.published ? "veröffentlicht" : "noch nicht veröffentlicht"}</span>` : n.status === "erledigt" ? `<span class="el-mtag e">bestätigt</span>` : `<span class="el-mtag n">offen</span>`}</div>
      ${n.antwort ? `<div class="el-mans">Antwort: ${esc(n.antwort)}</div>` : ""}
      <div class="el-mna"><button data-mgo="${esc(n.id)}">${ICON.go}Dorthin</button><button data-med="${esc(n.id)}">${ICON.edit}Bearbeiten</button>${n.von === "monteur" ? (n.status === "erledigt" ? `<button data-mreo="${esc(n.id)}">${ICON.ok}Wieder offen</button>` : `<button class="ok" data-mok="${esc(n.id)}">${ICON.ok}Bestätigen</button>`) : ""}<button class="dl" data-mdel="${esc(n.id)}">${ICON.trash}Löschen</button></div></div></li>`;
    const right = `<h3 class="el-mnh3">Notizen je Plan</h3>${sheets.length ? sheets.map((sh) => `<h4>${esc(shName(sh))} <span>${vis().filter((n) => n.sheet === sid(sh)).length} Notizen</span></h4><ul class="el-mnl">${vis().filter((n) => n.sheet === sid(sh)).sort((a, b) => a.nr - b.nr).map(noteRow).join("")}</ul>`).join("") : `<p class="el-note">Noch keine Notizen. Im Plan mit «Notiz» (Taste N) setzen, Monteure setzen ihre über den Link.</p>`}`;
    return `<header class="el-mdh"><span class="el-mpill${st.on ? "" : " off"}"><i></i>${esc(st.text)}</span></header><div class="el-mgrid"><div class="col">${left}${link}</div><div class="col">${right}</div></div><div class="actions"><button class="btn outline" data-c>Schliessen</button></div>`;
  }
  async function dialog() {
    if (!cloudUser() && !(await elLogin())) return;
    if (!proj()) { if (!(await confirmDialog("Zuerst online speichern", "Der Link für Monteur gehört zu einem Online-Projekt. Jetzt online speichern?", "Online speichern"))) return; await elSaveOnline(); if (!proj()) return; }
    await load(false);
    dlgState.exp = "keep"; dlgState.end = ""; dlgState.phone = M.share?.phone || String(loadProfil().TEL || "").slice(0, 30);
    M.devices = null;
    const redraw = () => { const m = $("#modal-root .el-mbody"); if (m) m.innerHTML = dialogHTML(); };
    if (M.share) mDevices(M.share.id).then((d) => { M.devices = d; redraw(); }).catch(() => {});
    const root = $("#modal-root");
    const patch = async (p) => { if (!M.share) return; try { const s = await mShareUpdate(M.share.id, p); if (s) M.share = s; } catch (err) { toast(err.message || String(err), "error"); } redraw(); draw(); };
    const expOf = () => (dlgState.exp === "end" ? K.expiryOf("end", dlgState.end) : K.expiryOf(dlgState.exp === "keep" ? "30" : dlgState.exp));
    const change = (e) => {
      const t = e.target;
      if (t.matches("[data-mall]")) { ls.set(pickKey(), t.checked ? null : planSheets().map(sid)); redraw(); draw(); }
      else if (t.matches("[data-mpk]")) { const on = new Set(picked().map(sid)); if (t.checked) on.add(t.dataset.mpk); else on.delete(t.dataset.mpk); ls.set(pickKey(), planSheets().map(sid).filter((x) => on.has(x))); redraw(); draw(); }
      else if (t.matches("[data-mexp]")) { dlgState.exp = t.value; if (t.value !== "end" && t.value !== "keep") patch({ expires_at: expOf() }); else redraw(); }
      else if (t.matches("[data-mend]")) { dlgState.end = t.value; const x = expOf(); if (x) patch({ expires_at: x }); else toast("Das Datum liegt zurück.", "error"); }
      else if (t.matches("[data-mtel]")) { dlgState.phone = t.value.trim().slice(0, 30); patch({ phone: dlgState.phone }); }
    };
    root.addEventListener("change", change);
    const shown = openModal("Link für Monteur", `<div class="el-mbody">${dialogHTML()}</div>`, async (b, done) => {
      const id = b.dataset.mgo || b.dataset.med || b.dataset.mok || b.dataset.mreo || b.dataset.mdel, n = id && M.notes.find((x) => x.id === id);
      if (b.dataset.c !== undefined) done();
      else if (b.dataset.mnew !== undefined) {
        b.disabled = true;
        try { const x = expOf(); if (!x) { toast("Bitte ein Datum in der Zukunft wählen.", "error"); b.disabled = false; return; } const s = await mShareCreate(proj(), x, dlgState.phone); if (s) { M.share = s; M.notes = []; M.pub = null; dlgState.exp = "keep"; toast("Link für Monteur erstellt."); } }
        catch (err) { toast(err.message || String(err), "error"); }
        redraw(); draw();
      } else if (b.dataset.mcopy !== undefined) {
        const url = monteurUrl(M.share.token);
        try { await navigator.clipboard.writeText(url); toast("Link kopiert."); } catch { $("#modal-root .el-shurl")?.select(); toast("Kopieren ging nicht automatisch: Link ist markiert, mit ⌘C kopieren."); }
      } else if (b.dataset.mrev !== undefined) {
        done();
        if (!(await confirmDialog("Link sperren?", "Die Monteure sehen die Pläne sofort nicht mehr. Nicht gesendete Notizen bleiben auf ihren Geräten.", "Sperren"))) return dialog();
        try { await mShareUpdate(M.share.id, { revoked_at: new Date().toISOString() }); M.share = null; M.notes = []; M.pub = null; toast("Link widerrufen. Wer ihn öffnet, sieht nur noch einen Hinweis."); } catch (err) { toast(err.message || String(err), "error"); }
        draw(); dialog();
      } else if (n && b.dataset.mgo) { done(); focus(n.id); }
      else if (n && b.dataset.med) { done(); await edit(n); }
      else if (n && b.dataset.mok) { done(); await confirmNote(n); }
      else if (n && b.dataset.mreo) { await doConfirm(n, false, null); redraw(); }
      else if (n && b.dataset.mdel) { if (await confirmDialog(`Notiz ${n.nr} löschen`, "Die Notiz wird für alle mit dem Link gelöscht. Die Nummer bleibt frei.", "Löschen")) { const r = await mPNoteDelete(n.id).catch((err) => ({ grund: err.message })); if (r?.ok) M.notes = M.notes.filter((x) => x.id !== n.id); else if (r?.grund) toast(r.grund, "error"); draw(); } dialog(); }
    }, null, "[data-c]", "el-mdlg");
    try { return await shown; } finally { root.removeEventListener("change", change); }
  }

  // Übersicht: «Geteilt · Stand 3» / «Nicht geteilt» (elplexa.js projectsHTML)
  const status = (share) => K.shareStatus(share);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && active() && M.share) load(); });
  poll();
  return { draw: sync, drawNotes, key, dialog, status, reload: () => load() };
}
