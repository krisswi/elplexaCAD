// Monteur-Ansicht (CJ 28.10.2026, nur elplexaCAD): ?monteur=<Schlüssel> zeigt den veröffentlichten Stand des Plan-Moduls ohne Login und ohne Editor.
// Lesen (Schieber mit Plantiteln, Zoom, Wischen, Stückliste), Notizen setzen, bearbeiten, löschen (Warteschlange offline), Offline-Kopie in IndexedDB.
// Datenbank nur über m_* (cloud.js mOpen, mNotes, mNote*), PDF-Pläne über die Edge Function monteur-pdf. Kein «PDF speichern», kein «Drucken».
// Gestaltung nach dem Mockup «Pläne für den Monteur» (Version 2): Schrift ≥ 14 px, Trefferflächen ≥ 44 px, Kontrast ≥ 4,5:1 (monteur.css in elplexa.css).
import { esc } from "./render.js";
import { openPdf, renderPage } from "./pdfbg.js";
import { mOpen, mNotes, mNoteAdd, mNoteEdit, mNoteDelete, mPdfs } from "./cloud.js";
import * as K from "./monteur-kern.js";

const I = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  bubble: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  go: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/></svg>',
};
const POLL = 30e3, HOLD = 500, ZMAX = 12, WAIT = 4000;
const DB = "elplexacad-monteur";

// ---------- Offline-Kopie (IndexedDB, je Schlüssel ein Eintrag) ----------
function idb() {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore("kopie"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function copyGet(token) {
  try { const db = await idb(); return await new Promise((res) => { const q = db.transaction("kopie").objectStore("kopie").get(token); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch { return null; }
}
async function copyPut(token, v) {
  try { const db = await idb(); await new Promise((res) => { const tx = db.transaction("kopie", "readwrite"); tx.objectStore("kopie").put(v, token); tx.oncomplete = res; tx.onerror = res; tx.onabort = res; }); } catch { /* ohne Speicher: gilt bis zum Schliessen */ }
}
function guest() {
  let g = {}; try { g = JSON.parse(localStorage.getItem("elplexacad.gast")) || {}; } catch { /* ohne Speicher */ }
  if (!g.id) { g.id = crypto.randomUUID(); keepGuest(g); }
  return g;
}
function keepGuest(g) { try { localStorage.setItem("elplexacad.gast", JSON.stringify(g)); } catch { /* egal */ } }

export function startMonteur(token) {
  if (!token) return false;
  document.documentElement.classList.add("mo-on");
  document.title = "Pläne · elplexaCAD";
  if (!document.querySelector('meta[name="viewport"]')?.content.includes("viewport-fit")) document.querySelector('meta[name="viewport"]')?.setAttribute("content", "width=device-width, initial-scale=1, viewport-fit=cover");
  const logo = document.querySelector(".el-logo")?.outerHTML.replace('class="mark el-logo"', 'class="mo-logo"') || "";
  const root = document.createElement("div"); root.id = "mo-root"; root.className = "mo"; document.body.appendChild(root);
  const G = guest();
  // Zustand: c = Offline-Kopie (Stand, Notizen, Warteschlange), net = "" | "offline" | "schlaeft", dead = Grund, wenn der Link nicht mehr geht
  const V = { c: null, net: "", dead: null, newer: null, sid: null, view: "plan", listOpen: false, sheet: null, placing: null, ghost: null, compose: null, menu: null, loading: true, hidden: new Set(), z: { s: 1, x: 0, y: 0 }, open: null, flash: null, busy: false };
  const q = (s) => root.querySelector(s);
  const pad = () => window.matchMedia("(min-width: 768px)").matches;

  root.innerHTML = `<header class="mo-top"><div class="mo-ttl">${logo}<div><div class="mo-pname">Pläne</div><div class="mo-psub">Elektroplan · ansehen und notieren</div></div></div><div class="mo-seg" role="tablist" aria-label="Plan wählen"></div><div class="mo-acts"><button type="button" class="mo-btn mo-tgl" aria-pressed="false">${I.list}Stückliste</button></div></header>
  <div class="mo-band" role="status"></div>
  <main class="mo-stage"><div class="mo-pa" tabindex="0" aria-label="Plan, ziehen und zoomen"><div class="mo-cv"><div class="mo-svgw"></div><div class="mo-mks"></div></div>
    <div class="mo-skel" hidden><div class="mo-skp"></div><div class="mo-skt">Pläne werden geladen …</div></div>
    <div class="mo-cap"></div><button type="button" class="mo-fit" hidden>Einpassen</button><div class="mo-place" hidden></div>
    <div class="mo-fabs"></div></div><section class="mo-list" hidden></section></main>
  <nav class="mo-bar"><div class="mo-seg2" role="tablist" aria-label="Ansicht"><button type="button" role="tab" data-v="plan">Plan</button><button type="button" role="tab" data-v="list">Stückliste</button></div></nav>
  <div class="mo-scrim"></div><section class="mo-sheet" role="dialog" aria-modal="true" aria-label="Notizen" aria-hidden="true"></section>
  <div class="mo-mscrim" hidden></div><div class="mo-menu" role="menu" hidden></div><div class="mo-dead" hidden></div><div class="mo-toast" role="status" aria-live="polite"></div>`;
  const btns = `<button type="button" class="mo-ib mo-plus" aria-label="Neue Notiz: Stelle im Plan antippen" aria-pressed="false">${I.plus}</button><button type="button" class="mo-ib mo-notes" aria-haspopup="dialog"><span class="mo-ic">${I.bubble}<i class="mo-ndot" hidden></i></span><span>Notizen</span><span class="mo-ncnt">0</span><span class="mo-usb" hidden></span></button>`;
  const place = () => { const into = pad() ? q(".mo-fabs") : q(".mo-bar"); if (!into.querySelector(".mo-plus")) { root.querySelectorAll(".mo-plus, .mo-notes").forEach((b) => b.remove()); into.insertAdjacentHTML("beforeend", btns); } root.classList.toggle("pad", pad()); };
  place();

  // ---------- Daten ----------
  const rel = () => V.c?.release || null;
  const sheets = () => rel()?.sheets || [];
  const cur = () => sheets().find((s) => s.sid === V.sid) || sheets()[0] || null;
  const notesAll = () => K.withQueue(V.c?.notes || [], V.c?.queue || []).filter((n) => !V.hidden.has(n.id) && (n.von === "monteur" || n.published !== false));
  const notesOf = (sid) => notesAll().filter((n) => n.sheet === sid).sort((a, b) => a.nr - b.nr);
  const canEdit = (n) => n.von === "monteur" && n.status === "offen";
  const isNew = (n) => !n.mine && !n.pend && V.c?.seenNotes && V.c.seenNotes[n.id] !== n.updated_at;
  const by = () => rel()?.by || "dem Planer";
  const stampOf = () => (V.c?.at ? K.fmtStamp(V.c.at) : "");
  const save = () => V.c && copyPut(token, V.c);

  // ---------- Öffnen und Abgleich ----------
  async function boot() {
    V.c = await copyGet(token);
    let done = false;
    const first = sync(true).then(() => { done = true; });
    await Promise.race([first, new Promise((r) => setTimeout(r, WAIT))]);
    V.loading = false;
    if (!done && !V.c?.release) V.loading = true; // ohne Kopie weiter warten (Skelett)
    render();
    await first; V.loading = false; render();
    setInterval(() => { if (document.visibilityState !== "hidden" && !V.dead) sync(false); }, POLL);
    window.addEventListener("online", () => sync(false));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !V.dead) sync(false); });
  }
  // first: beim Öffnen gilt ein neuer Stand sofort (danach nur über das Band «Neuer Stand · Laden»)
  async function sync(first) {
    if (V.busy) return; V.busy = true;
    try {
      const have = V.c?.release ? V.c.rev : 0;
      const r = await mOpen(token, G.id, have);
      if (r.net) { V.net = r.net; return; }
      V.net = "";
      if (!r.ok) {
        if (r.grund === "leer") { V.dead = "leer"; return; }
        V.dead = r.grund || "ungueltig"; V.ablauf = r.ablauf;
        if (V.c) { V.c.release = null; save(); } // Pläne nicht mehr sichtbar, ungesendete Texte bleiben
        return;
      }
      V.dead = null;
      if (!V.c) V.c = { token, notes: [], queue: [], seenNotes: null, seenSheets: null };
      Object.assign(V.c, { name: r.name, ablauf: r.ablauf, phone: r.phone || "" });
      const plan = r.releases?.plan;
      if (plan && (!V.c.release || plan.rev > V.c.rev)) {
        const pdf = await loadPdfs(plan.data);
        if (pdf) {
          const fresh = { release: plan.data, rev: plan.rev, at: plan.at, pdf };
          if (first || !V.c.release) Object.assign(V.c, fresh); else V.newer = fresh;
        }
      }
      await flush();
      const n = await mNotes(token, G.id);
      if (n.ok) {
        V.c.notes = n.notes;
        if (!V.c.seenNotes) V.c.seenNotes = Object.fromEntries(n.notes.map((x) => [x.id, x.updated_at])); // erstes Öffnen: nichts ist «neu»
      } else if (n.grund === "link") V.dead = "widerrufen";
      if (V.c.release && !V.c.seenSheets) V.c.seenSheets = Object.fromEntries(sheets().map((s) => [s.sid, s.h]));
      save();
    } finally { V.busy = false; if (!V.loading) render(); }
  }
  // PDF-Pläne des Stands in die Kopie (vorhandene behalten). null = nicht vollständig, Stand nicht übernehmen.
  async function loadPdfs(data) {
    const want = [...new Set(Object.values(data.assets || {}).map((a) => a.sha))], have = { ...(V.c?.pdf || {}) }, miss = want.filter((s) => !have[s]);
    if (miss.length) {
      const r = await mPdfs(token, miss);
      if (r.net) { V.net = r.net === "fehler" ? "" : r.net; if (r.net === "fehler") toast(`PDF-Plan nicht geladen: ${r.msg}`); else return null; }
      else Object.assign(have, r);
    }
    return Object.fromEntries(want.filter((s) => have[s]).map((s) => [s, have[s]]));
  }
  function loadNewer() {
    if (!V.newer) return;
    Object.assign(V.c, V.newer); V.newer = null; save(); V.key = null; render();
    toast(`Neuer Stand geladen · Index ${V.c.rev}.`);
  }
  // Warteschlange senden, der Reihe nach. Bricht ab ohne Netz; Link tot: Text bleibt auf dem Gerät.
  async function flush() {
    const c = V.c; if (!c?.queue?.length) return;
    while (c.queue.length) {
      const e = c.queue[0];
      const r = e.op === "add" ? await mNoteAdd(token, G.id, e) : e.op === "edit" ? await mNoteEdit(token, e.id, e) : await mNoteDelete(token, e.id);
      if (r.net) { if (r.net !== "fehler") V.net = r.net; break; }
      if (!r.ok && r.grund === "link") { V.dead = "widerrufen"; break; }
      if (!r.ok && r.grund === "zu_schnell") { toast("Zu viele Notizen in kurzer Zeit. Die übrigen gehen in ein paar Minuten raus."); break; }
      c.queue.shift();
      if (e.op === "add") {
        if (r.ok) {
          c.queue = K.swapId(c.queue, e.id, r.id);
          c.notes.push({ id: r.id, mod: "plan", sheet: e.sheet, nr: r.nr, von: "monteur", published: true, x: e.x, y: e.y, text: e.text, author: e.author, rev: e.rev, created_at: r.created_at, updated_at: r.created_at, status: "offen", mine: true });
          c.seenNotes = { ...(c.seenNotes || {}), [r.id]: r.created_at };
          if (r.nr !== e.nr) toast(`Ihre Nr. ${e.nr} heisst jetzt ${r.nr}, die ${e.nr} war schon vergeben.`, 6000);
        } else toast(r.grund === "voll" ? "Der Link hat schon 300 Notizen. Bitte anrufen." : `Notiz ${e.nr} nicht gesendet: ${e.text.slice(0, 40)}`, 6000);
      } else if (!r.ok) toast(e.op === "del" ? "Die Notiz war schon gelöscht oder bestätigt." : "Die Notiz wurde inzwischen bestätigt oder gelöscht. Änderung nicht gesendet.");
      else if (e.op === "edit") { const n = c.notes.find((x) => x.id === e.id); if (n) Object.assign(n, e.text != null ? { text: e.text } : {}, e.x != null ? { x: e.x, y: e.y } : {}); }
      else c.notes = c.notes.filter((x) => x.id !== e.id);
      save();
    }
  }
  function enqueue(e) { V.c.queue = K.enqueue(V.c.queue || [], { ...e, at: new Date().toISOString() }); save(); render(); flush().then(() => { save(); render(); }); }

  // ---------- Zeichnen ----------
  function band() {
    const st = stampOf();
    if (V.loading && !rel()) return ["", `<i class="mo-spin"></i><span class="mo-bt">Pläne werden geladen …</span>`];
    if (V.net === "offline") { const x = (V.c?.queue || []).length; return ["warn", `<i class="mo-dot"></i><span class="mo-bt">Offline, Stand <b>${esc(st)}</b></span><span class="mo-bx">${x ? `${x} ${x === 1 ? "Notiz wartet" : "Notizen warten"}` : `${sheets().length} ${sheets().length === 1 ? "Plan" : "Pläne"} auf dem Gerät`}</span>`]; }
    if (V.net === "schlaeft") return ["err", `<i class="mo-dot"></i><span class="mo-b2"><span>Server schläft, bitte ${esc(by())} informieren</span><small>Pläne aus der Kopie, Stand ${esc(st)} · Notizen bleiben auf dem Gerät</small></span>`];
    if (V.newer) return ["info", `<i class="mo-dot"></i><span class="mo-bt">Neuer Stand · Index ${V.newer.rev} vom ${esc(K.fmtStamp(V.newer.at))}</span><span class="mo-bx">Laden ›</span>`];
    return ["", `<i class="mo-dot"></i><span class="mo-bt">Stand: <b>${esc(st)}</b> · aktuell</span><span class="mo-bx">Index ${V.c?.rev ?? ""}</span>`];
  }
  function render() {
    place();
    const s = cur(), list = sheets();
    if (s) V.sid = s.sid;
    q(".mo-pname").textContent = V.c?.name || "Pläne";
    const seg = q(".mo-seg"); seg.classList.toggle("many", list.length > 3);
    seg.innerHTML = list.map((x) => { const ch = V.c?.seenSheets && V.c.seenSheets[x.sid] !== x.h; return `<button type="button" role="tab" data-p="${esc(x.sid)}" aria-selected="${x.sid === V.sid}" aria-label="${esc(x.title)}${ch ? ", geändert seit dem letzten Öffnen" : ""}">${esc(x.title)}${ch ? '<i class="mo-nd"></i>' : ""}</button>`; }).join("");
    const [bc, bh] = band(), b = q(".mo-band"); b.className = `mo-band ${bc}`; b.innerHTML = bh; b.setAttribute("role", bc === "info" ? "button" : "status"); b.tabIndex = bc === "info" ? 0 : -1;
    q(".mo-skel").hidden = !(V.loading && !rel());
    // Plan
    if (s && V.key !== `${V.c.rev}|${s.sid}`) { q(".mo-svgw").innerHTML = s.svg; V.key = `${V.c.rev}|${s.sid}`; fillPdf(s); }
    if (!s) { q(".mo-svgw").innerHTML = ""; V.key = null; }
    q(".mo-cap").textContent = s ? `${s.title} · Blatt ${list.indexOf(s) + 1} von ${list.length} · Index ${V.c.rev}` : "";
    // Stückliste
    const showList = pad() ? V.listOpen : V.view === "list", L = q(".mo-list"); L.hidden = !showList || !s;
    if (showList && s) L.innerHTML = bomHTML(s);
    q(".mo-tgl").setAttribute("aria-pressed", V.listOpen);
    root.querySelectorAll(".mo-seg2 button").forEach((x) => x.setAttribute("aria-selected", x.dataset.v === V.view));
    q(".mo-cap").hidden = !pad() && V.view === "list";
    // Knöpfe
    const ns = s ? notesOf(s.sid) : [], cnt = s ? K.queueCount(V.c.notes, V.c.queue || [], s.sid) : { x: 0, n: 0 }, nNew = ns.some(isNew);
    root.querySelectorAll(".mo-notes").forEach((x) => {
      x.classList.toggle("empty", !ns.length); x.querySelector(".mo-ncnt").textContent = ns.length; x.querySelector(".mo-ndot").hidden = !nNew;
      const u = x.querySelector(".mo-usb"); u.hidden = !cnt.x; u.innerHTML = `<i></i>${cnt.x}/${cnt.n}`;
      x.setAttribute("aria-label", `Notizen zu ${s?.title || "Plan"}: ${ns.length}${nNew ? ", neue dabei" : ""}${cnt.x ? `, ${cnt.x} von ${cnt.n} noch nicht gesendet` : ""}`);
      x.disabled = !s;
    });
    root.querySelectorAll(".mo-plus").forEach((x) => { x.setAttribute("aria-pressed", !!V.placing); x.disabled = !s; });
    const pl = q(".mo-place"); pl.hidden = !V.placing; q(".mo-pa").classList.toggle("placing", !!V.placing);
    if (V.placing) pl.innerHTML = `<span class="mo-pn">${V.placing.move ? V.placing.move.nr : V.placing.nr}</span><span>${V.placing.move ? "Neue Stelle für die Marke antippen" : `Stelle für Notiz ${V.placing.nr} antippen`}</span><button type="button">Abbrechen</button>`;
    if (V.sheet === "list") sheetList();
    setSheet();
    // Link tot oder ohne Kopie
    const d = q(".mo-dead"), noCopy = !rel() && !V.loading && (V.net || V.dead === "leer"), dead = !!V.dead && V.dead !== "leer" || noCopy;
    d.hidden = !dead;
    if (dead) {
      const keep = (V.c?.queue || []).filter((e) => e.op !== "del");
      const t = V.dead === "widerrufen" ? ["Link gesperrt", "Dieser Link wurde gesperrt. Die Pläne sind nicht mehr sichtbar.", `Bitte ${by()} um einen neuen Link.`]
        : V.dead === "abgelaufen" ? ["Link abgelaufen", `Dieser Link war bis ${K.fmtDay(V.ablauf, true)} gültig. Die Pläne sind nicht mehr sichtbar.`, `Bitte ${by()} um einen neuen Link.`]
          : V.dead === "ungueltig" ? ["Link ungültig", "Diesen Link gibt es nicht. Bitte den Link nochmals genau öffnen.", ""]
            : V.dead === "leer" ? ["Noch keine Pläne", "Für diesen Link wurde noch nichts veröffentlicht.", "Später nochmals öffnen."]
              : V.net === "schlaeft" ? ["Server schläft", `Die Pläne sind noch nicht auf diesem Gerät. Bitte ${by()} informieren.`, ""]
                : ["Einmal mit Netz öffnen", "Die Pläne sind noch nicht auf diesem Gerät. Öffnen Sie den Link einmal mit Netz, danach gehen sie auch offline.", "Kein Netz gefunden."];
      d.innerHTML = `${logo}<h2>${t[0]}</h2><p>${esc(t[1])}</p>${t[2] ? `<p>${esc(t[2])}</p>` : ""}${keep.length ? `<div class="mo-keep"><b>${keep.length} ${keep.length === 1 ? "Notiz" : "Notizen"} nicht gesendet. Der Text bleibt auf diesem Gerät:</b>${keep.map((e) => `<q>${esc(e.text ?? "")}</q>`).join("")}</div>` : ""}${V.c?.phone ? `<div class="mo-ct">${esc(by())} · ${esc(V.c.phone)}</div>` : ""}`;
    }
    apply();
  }
  // PDF-Hintergrund aus der Kopie als Bild einsetzen (pdf.js), je PDF und Seite einmal
  const imgs = new Map();
  async function fillPdf(s) {
    for (const im of q(".mo-svgw").querySelectorAll("image[data-masset]")) {
      const a = rel().assets?.[im.dataset.masset], bytes = a && V.c.pdf?.[a.sha], k = `${a?.sha}|${im.dataset.mpage}`;
      if (!bytes) continue;
      if (!imgs.has(k)) imgs.set(k, (async () => { const p = await openPdf(new Uint8Array(bytes)); try { return await renderPage(p.doc, Number(im.dataset.mpage) || 1); } finally { p.close(); } })().catch(() => null));
      const url = await imgs.get(k);
      if (url && V.key?.endsWith(`|${s.sid}`)) im.setAttribute("href", url);
    }
  }
  function bomHTML(s) {
    let g0 = null, rows = "";
    for (const r of s.bom || []) {
      if (r.group !== g0) { rows += `<tr class="mo-rh"><th colspan="3">${esc(r.group)}</th></tr>`; g0 = r.group; }
      rows += `<tr><td class="mo-sym">${r.sym || ""}</td><td>${esc(r.label)}</td><td class="mo-n">${r.m != null ? `${String(r.m.toFixed(2)).replace(".", ",")} m` : r.n}</td></tr>`;
    }
    return `<h3>Stückliste ${esc(s.title)}</h3><div class="mo-lsub">ganzer Plan · Stand ${esc(stampOf())}</div>${rows ? `<table><thead><tr><th></th><th>Material</th><th class="mo-n">Menge</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="mo-lnote">Keine Symbole in diesem Plan.</p>`}<p class="mo-lnote">Je Raum gegliedert, sobald im Grundriss Räume angegeben sind.</p>`;
  }

  // ---------- Planfläche: Zoom, Verschieben, Wischen, Marken ----------
  const pa = q(".mo-pa"), cv = q(".mo-cv"), mks = q(".mo-mks");
  const box = () => { const s = cur(), W = pa.clientWidth, H = pa.clientHeight; if (!s) return { W, H, k: 1, ox: 0, oy: 0 }; const k = Math.min(W / s.w, H / s.h); return { W, H, k, ox: (W - s.w * k) / 2, oy: (H - s.h * k) / 2 }; };
  const toPx = (n) => { const s = cur(), { k, ox, oy } = box(), p = K.worldToPage(s.tr, s.h, n.x, n.y); return { x: ox + p.u * k, y: oy + p.v * k }; };
  function apply() {
    cv.style.transform = `translate(${V.z.x}px, ${V.z.y}px) scale(${V.z.s})`;
    q(".mo-fit").hidden = V.z.s <= 1.02 || !!V.placing;
    marks();
  }
  function clamp() { const { W, H } = box(), z = V.z; z.s = Math.min(ZMAX, Math.max(1, z.s)); z.x = Math.min(0, Math.max(W - W * z.s, z.x)); z.y = Math.min(0, Math.max(H - H * z.s, z.y)); apply(); }
  function zoomAt(p, s, anim) { const z = V.z, wx = (p.x - z.x) / z.s, wy = (p.y - z.y) / z.s; cv.classList.toggle("anim", !!anim); z.s = Math.min(ZMAX, Math.max(1, s)); z.x = p.x - wx * z.s; z.y = p.y - wy * z.s; clamp(); }
  const reset = (anim) => { cv.classList.toggle("anim", !!anim); V.z = { s: 1, x: 0, y: 0 }; apply(); };
  function focusNote(n, s = pad() ? 3 : 4) {
    const { W, H } = box(), p = toPx(n), sc = Math.max(V.z.s, s);
    cv.classList.add("anim"); V.z = { s: sc, x: W / 2 - p.x * sc, y: H / 2 - p.y * sc - 30 }; V.open = n.id; V.flash = n.id; clamp();
    clearTimeout(V.ft); V.ft = setTimeout(() => { V.flash = null; marks(); }, 1400);
  }
  function marks() {
    const s = cur(); if (!s || !pa.clientWidth) { mks.innerHTML = ""; return; }
    const z = V.z.s, ns = notesOf(s.sid).filter((n) => !V.placing?.move || n.id !== V.placing.move.id), pts = ns.map((n) => ({ id: n.id, ...toPx(n) })), byId = new Map(ns.map((n) => [n.id, n]));
    const groups = K.clusterMarks(pts.map((p) => ({ id: p.id, x: p.x * z, y: p.y * z })), 40, new Set([V.open].filter(Boolean)));
    let h = "";
    for (const g of groups) {
      const p0 = pts.find((p) => p.id === g.ids[0]), style = `left:${p0.x}px;top:${p0.y}px;--s:${1 / z}`;
      if (g.ids.length > 1) { const nrs = g.ids.map((id) => byId.get(id).nr); h += `<button type="button" class="mo-mk cl" data-cl="${g.ids.join(",")}" style="${style}" aria-label="${nrs.length} Notizen gebündelt: ${nrs.join(", ")}. Tippen zoomt."><span class="mo-dt">${K.clusterLabel(nrs)}</span></button>`; continue; }
      const n = byId.get(g.ids[0]), cls = `${n.von === "planer" ? "pl" : "mo"}${n.status === "erledigt" ? " done" : ""}${n.pend ? " unsync" : isNew(n) ? " isnew" : ""}${V.flash === n.id ? " flash" : ""}`;
      h += `<button type="button" class="mo-mk ${cls}" data-id="${esc(n.id)}" style="${style}" aria-label="Notiz ${n.nr} von ${esc(n.author)}: ${esc(n.text)}"><svg class="mo-ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20"/></svg><span class="mo-dt">${n.nr}${n.status === "erledigt" ? `<i class="mo-ck">${I.check}</i>` : ""}${n.pend ? '<i class="mo-us"></i>' : isNew(n) ? '<i class="mo-nw"></i>' : ""}</span>${V.open === n.id ? `<span class="mo-co"><b>${n.nr} · ${esc(n.author)}</b><br>${esc(n.text)}${n.antwort ? `<br><i>Antwort: ${esc(n.antwort)}</i>` : ""}</span>` : ""}</button>`;
    }
    if (V.ghost) { const p = toPx(V.ghost); h += `<span class="mo-mk ghost" style="left:${p.x}px;top:${p.y}px;--s:${1 / z}"><span class="mo-dt">${V.ghost.nr}</span></span>`; }
    mks.innerHTML = h;
  }
  // Marken: kurz tippen = dorthin, lange drücken (0,5 s, Ring) oder Rechtsklick = Menü
  let lp = null;
  mks.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".mo-mk"); if (!b || V.placing) return; e.stopPropagation();
    if (b.dataset.cl) { lp = { cl: b, x: e.clientX, y: e.clientY }; return; }
    if (e.button === 2) return;
    lp = { b, id: b.dataset.id, x: e.clientX, y: e.clientY }; b.classList.add("press");
    lp.t = setTimeout(() => { if (!lp) return; lp.fired = true; b.classList.remove("press"); openMenu(lp.id, b); }, HOLD);
  });
  mks.addEventListener("pointermove", (e) => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8) { clearTimeout(lp.t); lp.b?.classList.remove("press"); lp = null; } });
  mks.addEventListener("pointerup", (e) => {
    if (!lp) return; const l = lp; lp = null; clearTimeout(l.t); e.stopPropagation();
    if (l.cl) { const r = l.cl.getBoundingClientRect(), R = pa.getBoundingClientRect(); zoomAt({ x: r.left + r.width / 2 - R.left, y: r.top + r.height / 2 - R.top }, V.z.s * 2.2, true); return; }
    l.b.classList.remove("press");
    if (!l.fired) { const n = notesAll().find((x) => x.id === l.id); if (n) focusNote(n); }
  });
  mks.addEventListener("pointercancel", () => { if (lp) { clearTimeout(lp.t); lp.b?.classList.remove("press"); lp = null; } });
  mks.addEventListener("contextmenu", (e) => { e.preventDefault(); const b = e.target.closest(".mo-mk[data-id]"); if (!b) return; if (lp) { clearTimeout(lp.t); lp = null; } b.classList.remove("press"); openMenu(b.dataset.id, b); });
  mks.addEventListener("keydown", (e) => { const b = e.target.closest(".mo-mk[data-id]"); if (b && (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) { e.preventDefault(); openMenu(b.dataset.id, b); } });
  mks.addEventListener("click", (e) => { const b = e.target.closest(".mo-mk[data-id]"); if (b && e.detail === 0) { const n = notesAll().find((x) => x.id === b.dataset.id); if (n) focusNote(n); } }); // Tastatur (Enter, Leertaste)
  // Plan: ziehen, zwei Finger, Doppeltipp, Wischen zum nächsten Plan, Stelle wählen
  const P = new Map(); let g = null, lastTap = 0, lastPos = null;
  const loc = (e) => { const r = pa.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp }; };
  const dist = (p, o) => Math.hypot(p.x - o.x, p.y - o.y), mid = (p, o) => ({ x: (p.x + o.x) / 2, y: (p.y + o.y) / 2 });
  const begin = () => { const pts = [...P.values()]; if (pts.length === 1) g = { one: true, p0: pts[0], z0: { ...V.z }, moved: false, swipe: false, last: pts[0], vx: 0 }; else if (pts.length === 2) g = { pinch: true, d0: dist(pts[0], pts[1]) || 1, m0: mid(pts[0], pts[1]), z0: { ...V.z } }; };
  pa.addEventListener("pointerdown", (e) => { if (e.target.closest("button:not(.mo-mk), .mo-place") || !cur() || e.button === 2) return; pa.setPointerCapture(e.pointerId); P.set(e.pointerId, loc(e)); cv.classList.remove("anim"); begin(); }); // Marke beim Stelle-Wählen: die Stelle darunter gilt
  pa.addEventListener("pointermove", (e) => {
    if (!P.has(e.pointerId) || !g) return; const p = loc(e); P.set(e.pointerId, p);
    if (g.one) {
      const dx = p.x - g.p0.x, dy = p.y - g.p0.y;
      if (Math.hypot(dx, dy) > 6) g.moved = true;
      g.vx = (p.x - g.last.x) / Math.max(1, p.t - g.last.t); g.last = p;
      if (g.z0.s > 1.02 || V.placing) { if (g.z0.s > 1.02) { V.z.x = g.z0.x + dx; V.z.y = g.z0.y + dy; clamp(); } }
      else if (g.moved && (g.swipe || Math.abs(dx) > Math.abs(dy) * 1.3)) {
        g.swipe = true; const list = sheets(), i = list.indexOf(cur()), edge = (dx > 0 && i === 0) || (dx < 0 && i === list.length - 1);
        g.dx = edge ? dx * 0.25 : dx; cv.style.transform = `translateX(${g.dx}px)`; cv.style.opacity = String(1 - Math.min(0.5, Math.abs(g.dx) / 600));
      }
    } else if (g.pinch && P.size === 2) {
      const [p1, p2] = [...P.values()], m = mid(p1, p2), s = Math.min(ZMAX, Math.max(1, g.z0.s * dist(p1, p2) / g.d0));
      const wx = (g.m0.x - g.z0.x) / g.z0.s, wy = (g.m0.y - g.z0.y) / g.z0.s; V.z.s = s; V.z.x = m.x - wx * s; V.z.y = m.y - wy * s; clamp();
    }
  });
  const end = (e) => {
    if (!P.has(e.pointerId)) return; const p = loc(e); P.delete(e.pointerId);
    if (g?.one) {
      if (g.swipe) {
        const list = sheets(), i = list.indexOf(cur()), dx = g.dx || 0, nx = dx < 0 ? list[i + 1] : list[i - 1];
        cv.style.opacity = "1";
        if ((Math.abs(dx) > 70 || Math.abs(g.vx) > 0.5) && nx) goPlan(nx.sid, dx < 0 ? 1 : -1); else { cv.classList.add("anim"); apply(); }
      } else if (!g.moved) {
        if (V.placing) placeAt(p);
        else if (p.t - lastTap < 320 && lastPos && dist(p, lastPos) < 30) { if (V.z.s > 1.2) reset(true); else zoomAt(p, 3, true); lastTap = 0; }
        else { lastTap = p.t; lastPos = p; if (V.open) { V.open = null; marks(); } }
      }
    }
    g = null; if (P.size) begin();
  };
  pa.addEventListener("pointerup", end); pa.addEventListener("pointercancel", end);
  pa.addEventListener("wheel", (e) => { e.preventDefault(); if (cur()) zoomAt(loc(e), V.z.s * Math.exp(-e.deltaY * 0.0022)); }, { passive: false });
  pa.addEventListener("keydown", (e) => { if (e.target !== pa) return; const list = sheets(), i = list.indexOf(cur()); if (e.key === "ArrowRight" && list[i + 1]) goPlan(list[i + 1].sid, 1); if (e.key === "ArrowLeft" && list[i - 1]) goPlan(list[i - 1].sid, -1); if (e.key === "+") zoomAt({ x: pa.clientWidth / 2, y: pa.clientHeight / 2 }, V.z.s * 1.5, true); if (e.key === "-") zoomAt({ x: pa.clientWidth / 2, y: pa.clientHeight / 2 }, V.z.s / 1.5, true); });
  q(".mo-fit").addEventListener("click", () => reset(true));
  new ResizeObserver(() => { place(); clamp(); }).observe(pa);
  function goPlan(sid, dir = 0) {
    if (sid === V.sid) return;
    const list = sheets(); dir = dir || Math.sign(list.findIndex((x) => x.sid === sid) - list.indexOf(cur()));
    V.sid = sid; V.z = { s: 1, x: 0, y: 0 }; V.open = null; V.ghost = null;
    if (V.placing && !V.placing.move) V.placing.nr = K.nextNr(notesAll(), sid);
    render();
    cv.classList.remove("anim"); cv.style.opacity = "0"; cv.style.transform = `translateX(${dir * 36}px)`; void cv.offsetWidth; cv.classList.add("anim"); cv.style.opacity = "1"; apply();
    q(`.mo-seg button[data-p="${CSS.escape(sid)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    setTimeout(() => { const s = cur(); if (s && V.c?.seenSheets && s.sid === sid) { V.c.seenSheets[sid] = s.h; save(); render(); } }, 900);
  }
  q(".mo-seg").addEventListener("click", (e) => { const b = e.target.closest("button[data-p]"); if (b) goPlan(b.dataset.p); });
  q(".mo-band").addEventListener("click", () => { if (V.newer) loadNewer(); });
  q(".mo-band").addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && V.newer) { e.preventDefault(); loadNewer(); } });
  q(".mo-tgl").addEventListener("click", () => { V.listOpen = !V.listOpen; render(); requestAnimationFrame(clamp); });
  q(".mo-bar").addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (b) { V.view = b.dataset.v; render(); } });
  root.addEventListener("click", (e) => { if (e.target.closest(".mo-notes")) openSheet(V.sheet === "list" ? null : "list"); else if (e.target.closest(".mo-plus")) startNote(); });
  q(".mo-place").addEventListener("click", (e) => { if (e.target.closest("button")) { V.placing = null; V.ghost = null; render(); } });
  q(".mo-scrim").addEventListener("click", () => closeSheet());
  q(".mo-mscrim").addEventListener("click", () => closeMenu());
  root.addEventListener("keydown", (e) => { if (e.key !== "Escape") return; if (!q(".mo-menu").hidden) closeMenu(); else if (V.sheet) closeSheet(); else if (V.placing) { V.placing = null; V.ghost = null; render(); } });

  // ---------- Notizen ----------
  function startNote() {
    const s = cur(); if (!s) return;
    if (!G.name) { V.sheet = "name"; sheetName(); setSheet(); return; }
    closeSheet(); if (!pad()) V.view = "plan";
    V.placing = V.placing && !V.placing.move ? null : { nr: K.nextNr(notesAll(), s.sid) }; V.ghost = null; render();
  }
  function placeAt(p) {
    const s = cur(), { k, ox, oy } = box(), u = ((p.x - V.z.x) / V.z.s - ox) / k, v = ((p.y - V.z.y) / V.z.s - oy) / k;
    if (u < 0 || v < 0 || u > s.w || v > s.h) { toast("Bitte eine Stelle im Plan antippen."); return; }
    const w = K.pageToWorld(s.tr, s.h, u, v);
    if (V.placing.move) { const n = V.placing.move; V.placing = null; enqueue({ op: "edit", id: n.id, x: w.x, y: w.y }); toast(`Notiz ${n.nr} verschoben.`); return; }
    V.ghost = { ...w, nr: V.placing.nr }; V.placing = null; V.compose = { nr: V.ghost.nr, text: "" }; render(); openSheet("compose");
  }
  function openMenu(id, b) {
    const n = notesAll().find((x) => x.id === id); if (!n) return;
    const items = canEdit(n) ? [["go", "Dorthin", I.go], ["ed", "Bearbeiten", I.edit], ["del", "Löschen", I.trash]] : [["go", "Dorthin", I.go]];
    const m = q(".mo-menu"), R = root.getBoundingClientRect(), r = b.getBoundingClientRect();
    m.innerHTML = `<div class="mo-mt">Nr. ${n.nr} · ${esc(n.author)}${items.length === 1 ? " · nur ansehen" : ""}</div><div class="mo-mr">${items.map(([a, l, ic]) => `<button type="button" role="menuitem" data-a="${a}"${a === "del" ? ' class="dl"' : ""}>${ic}<span>${l}</span></button>`).join("")}</div>`;
    m.hidden = false; q(".mo-mscrim").hidden = false;
    const mw = m.offsetWidth, mh = m.offsetHeight, cx = r.left + r.width / 2 - R.left, top = r.top - R.top, bot = r.bottom - R.top;
    m.style.left = `${Math.max(8, Math.min(root.clientWidth - mw - 8, cx - mw / 2))}px`; m.style.top = `${top - mh - 8 > 60 ? top - mh - 8 : bot + 8}px`;
    m.onclick = (e) => { const x = e.target.closest("button[data-a]"); if (!x) return; closeMenu(); act(x.dataset.a, n.id); };
    setTimeout(() => m.querySelector("button")?.focus({ preventScroll: true }), 30);
  }
  function closeMenu() { q(".mo-menu").hidden = true; q(".mo-mscrim").hidden = true; }
  function act(a, id) {
    const n = notesAll().find((x) => x.id === id); if (!n) return;
    if (a === "go") { closeMenu(); if (V.sheet) closeSheet(); if (!pad()) V.view = "plan"; if (n.sheet !== V.sid) goPlan(n.sheet); render(); setTimeout(() => focusNote(n), n.sheet !== V.sid ? 300 : 60); }
    if (a === "ed" && canEdit(n)) { V.compose = { id: n.id, nr: n.nr, text: n.text }; openSheet("compose"); }
    if (a === "del" && canEdit(n)) {
      V.hidden.add(n.id); render();
      let undone = false; const t = setTimeout(() => { V.hidden.delete(n.id); if (!undone) enqueue({ op: "del", id: n.id }); }, 5000);
      toast(`Notiz ${n.nr} gelöscht.`, 5000, "Rückgängig", () => { undone = true; clearTimeout(t); V.hidden.delete(n.id); render(); });
    }
  }
  // Blatt von unten (Handy) bzw. Fenster (iPad): Liste, Text schreiben, Name
  function setSheet() { const on = !!V.sheet && !(V.dead && V.dead !== "leer"); q(".mo-sheet").classList.toggle("open", on); q(".mo-scrim").classList.toggle("on", on); q(".mo-sheet").setAttribute("aria-hidden", String(!on)); }
  const head = (t, sub, close) => `<div class="mo-grab"></div><div class="mo-shh"><div class="mo-shic">${I.bubble}</div><div><div class="mo-sht">${t}</div><div class="mo-shs">${sub}</div></div>${close ? `<button type="button" class="mo-btn mo-shx" data-s="close">${close}</button>` : ""}</div>`;
  function sheetList() {
    const s = cur(); if (!s) return;
    const ns = notesOf(s.sid), cnt = K.queueCount(V.c.notes, V.c.queue || [], s.sid), nNew = ns.filter(isNew).length, hint = !localStorage.getItem("elplexacad.mtipp");
    const rows = ns.map((n) => `<li class="mo-nr${n.status === "erledigt" ? " done" : ""}"><button type="button" class="mo-nb ${n.von === "planer" ? "pl" : "mo"}${n.pend ? " pend" : ""}" data-s="go" data-id="${esc(n.id)}" aria-label="Zu Notiz ${n.nr}"><span>${n.nr}</span></button>
      <div><p class="mo-ntt">${esc(n.text)}</p>
      <div class="mo-ntm">${isNew(n) ? '<i class="mo-nwd"></i><span class="mo-tag n">Neu</span>' : ""}<span>${esc(n.author)}${n.mine ? " (Sie)" : ""} · ${esc(K.fmtStamp(n.updated_at || n.created_at))}</span>${n.status === "erledigt" ? `<span class="mo-okt">${I.check}erledigt</span>` : ""}${n.pend ? '<span class="mo-ust"><i></i>nicht gesendet</span>' : ""}</div>
      ${n.antwort ? `<div class="mo-ans"><b>Antwort:</b> ${esc(n.antwort)}</div>` : ""}
      <div class="mo-nta"><button type="button" data-s="go" data-id="${esc(n.id)}">${I.go}Dorthin</button>${canEdit(n) ? `<button type="button" data-s="ed" data-id="${esc(n.id)}">${I.edit}Bearbeiten</button><button type="button" class="dl" data-s="del" data-id="${esc(n.id)}">${I.trash}Löschen</button>` : ""}</div></div></li>`).join("");
    q(".mo-sheet").innerHTML = head(`Notizen · ${esc(s.title)}`, `${ns.length ? `${ns.length} ${ns.length === 1 ? "Notiz" : "Notizen"}${nNew ? ` · ${nNew} neu` : ""}` : "noch keine"} · Stand ${esc(stampOf())}`, "Fertig") + `<div class="mo-shb">
      ${cnt.x ? `<p class="mo-sync"><i class="mo-rd"></i><span><b>${cnt.x}/${cnt.n} noch nicht gesendet.</b> Geht von selbst raus, sobald wieder Netz da ist.</span></p>` : ""}
      ${hint && ns.length ? `<p class="mo-tip"><span>Tipp: Lange auf eine Nummer drücken öffnet Dorthin, Bearbeiten und Löschen.</span><button type="button" data-s="hint">Verstanden</button></p>` : ""}
      ${ns.length ? `<ul class="mo-nl">${rows}</ul>` : `<p class="mo-empty">Noch keine Notiz zu ${esc(s.title)}. Mit «+» eine Stelle im Plan antippen und schreiben.</p>`}
      ${V.c.phone ? `<div class="mo-call"><span class="mo-callic">${I.phone}</span><div class="mo-clt">Fragen? Anrufen<span>${esc(by())} · <b>${esc(V.c.phone)}</b></span></div><button type="button" class="mo-btn" data-s="copy">${I.copy}Kopieren</button></div>` : ""}</div>`;
  }
  function sheetCompose() {
    const c = V.compose, edit = !!c.id, local = !!V.net;
    q(".mo-sheet").innerHTML = head(edit ? `Notiz ${c.nr} bearbeiten` : `Notiz ${c.nr}`, edit ? "Text ändern oder Marke verschieben" : `${esc(cur()?.title || "")} · ${esc(G.name || "")}`, "") + `<div class="mo-shb"><div class="mo-cmp">
      <textarea maxlength="${K.NOTE_MAX}" placeholder="Was soll ${esc(by())} wissen?" aria-label="Text der Notiz ${c.nr}">${esc(c.text || "")}</textarea>
      <div class="mo-cnt"><span class="mo-er" hidden>Bitte einen Text schreiben.</span><span class="mo-cc">${(c.text || "").length} / ${K.NOTE_MAX}</span></div>
      ${local ? `<p class="mo-shn">Ohne Verbindung: Die Notiz bleibt auf diesem Gerät und geht von selbst raus, sobald wieder Netz da ist.</p>` : ""}
      <div class="mo-btns">${edit ? `<button type="button" class="mo-btn" data-c="mv">${I.go}Marke verschieben</button>` : ""}<span class="mo-sp"></span><button type="button" class="mo-btn" data-c="cancel">Abbrechen</button><button type="button" class="mo-btn pri" data-c="save">Speichern</button></div></div></div>`;
    const ta = q(".mo-sheet textarea");
    ta.addEventListener("input", () => { c.text = ta.value; q(".mo-cc").textContent = `${ta.value.length} / ${K.NOTE_MAX}`; q(".mo-er").hidden = true; });
    setTimeout(() => ta.focus({ preventScroll: true }), 360);
  }
  function sheetName() {
    q(".mo-sheet").innerHTML = head("Ihr Name", "Steht bei Ihren Notizen, einmal eingeben", "") + `<div class="mo-shb"><div class="mo-cmp"><p>Damit ${esc(by())} weiss, von wem die Notiz kommt.</p><input type="text" maxlength="${K.NAME_MAX}" autocomplete="name" aria-label="Ihr Name" placeholder="Vorname"><div class="mo-cnt"><span class="mo-er" hidden>Bitte den Namen eingeben.</span></div><div class="mo-btns"><span class="mo-sp"></span><button type="button" class="mo-btn" data-s="close">Abbrechen</button><button type="button" class="mo-btn pri" data-s="name">Weiter</button></div></div></div>`;
    setTimeout(() => q(".mo-sheet input")?.focus({ preventScroll: true }), 360);
  }
  function openSheet(mode) {
    closeMenu();
    if (!mode) return closeSheet();
    V.sheet = mode;
    if (mode === "list") { if (!pad() && V.view === "list") V.view = "plan"; sheetList(); setTimeout(() => q(".mo-shx")?.focus({ preventScroll: true }), 50); }
    if (mode === "compose") sheetCompose();
    setSheet();
  }
  function closeSheet() {
    const was = V.sheet; V.sheet = null; setSheet();
    if (was === "list" && V.c) { const s = cur(); V.c.seenNotes = { ...(V.c.seenNotes || {}), ...Object.fromEntries(notesAll().filter((n) => n.sheet === s?.sid).map((n) => [n.id, n.updated_at])) }; save(); render(); }
    if (was === "compose") { V.ghost = null; V.compose = null; render(); }
  }
  q(".mo-sheet").addEventListener("click", (e) => {
    const c = e.target.closest("[data-c]");
    if (c && V.compose) {
      const ta = q(".mo-sheet textarea"), cmp = V.compose;
      if (c.dataset.c === "cancel") return closeSheet();
      if (c.dataset.c === "mv") { const n = notesAll().find((x) => x.id === cmp.id); V.compose = null; closeSheet(); V.placing = { move: n }; render(); return; }
      if (c.dataset.c === "save") {
        const err = K.noteError(ta.value, G.name);
        if (err) { q(".mo-er").textContent = err; q(".mo-er").hidden = false; ta.focus(); return; }
        const text = ta.value.trim(), s = cur();
        if (cmp.id) enqueue({ op: "edit", id: cmp.id, text });
        else { const nr = K.nextNr(notesAll(), s.sid); enqueue({ op: "add", id: `t-${crypto.randomUUID()}`, mod: "plan", sheet: s.sid, nr, x: V.ghost.x, y: V.ghost.y, text, author: G.name, rev: V.c.rev }); }
        V.compose = null; V.ghost = null; V.sheet = null; setSheet(); render();
        toast(V.net ? "Gespeichert auf dem Gerät. Geht raus, sobald wieder Netz da ist." : cmp.id ? `Notiz ${cmp.nr} geändert.` : "Notiz gespeichert.");
      }
      return;
    }
    const b = e.target.closest("[data-s]"); if (!b) return;
    const a = b.dataset.s;
    if (a === "close") closeSheet();
    else if (a === "hint") { try { localStorage.setItem("elplexacad.mtipp", "1"); } catch { /* egal */ } sheetList(); }
    else if (a === "copy") { const done = () => toast(`Nummer kopiert: ${V.c.phone}`); try { navigator.clipboard.writeText(V.c.phone).then(done, done); } catch { done(); } }
    else if (a === "name") { const inp = q(".mo-sheet input"), v = inp.value.trim(); if (!v || v.length > K.NAME_MAX) { q(".mo-er").hidden = false; inp.focus(); return; } G.name = v; keepGuest(G); V.sheet = null; setSheet(); startNote(); }
    else act(a, b.dataset.id);
  });
  q(".mo-sheet").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("input")) { e.preventDefault(); q('.mo-sheet [data-s="name"]')?.click(); } });
  // Blatt nach unten ziehen schliesst (Handy)
  let sd = null;
  q(".mo-sheet").addEventListener("pointerdown", (e) => { if (pad() || !e.target.closest(".mo-shh, .mo-grab") || e.target.closest("button")) return; sd = { y: e.clientY, id: e.pointerId }; q(".mo-sheet").classList.add("drag"); q(".mo-sheet").setPointerCapture(e.pointerId); });
  q(".mo-sheet").addEventListener("pointermove", (e) => { if (sd) q(".mo-sheet").style.transform = `translateY(${Math.max(0, e.clientY - sd.y)}px)`; });
  const sdEnd = (e) => { if (!sd) return; const dy = e.clientY - sd.y; sd = null; const el = q(".mo-sheet"); el.classList.remove("drag"); el.style.transform = ""; if (dy > 90) closeSheet(); };
  q(".mo-sheet").addEventListener("pointerup", sdEnd); q(".mo-sheet").addEventListener("pointercancel", sdEnd);

  function toast(msg, ms = 2800, actLabel, fn) {
    const el = q(".mo-toast");
    el.innerHTML = `<span>${esc(msg)}</span>${actLabel ? `<button type="button">${esc(actLabel)}</button>` : ""}`;
    el.classList.toggle("act", !!actLabel); el.classList.add("on");
    if (actLabel) el.querySelector("button").onclick = () => { fn(); el.classList.remove("on"); };
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("on"), ms);
  }
  window.__monteur = { get state() { return { net: V.net, dead: V.dead, rev: V.c?.rev, newer: V.newer?.rev ?? null, sid: V.sid, queue: V.c?.queue || [], notes: notesAll(), z: { ...V.z } }; }, sync: () => sync(false) }; // nur lesen, für Tests
  if (location.protocol === "https:") navigator.serviceWorker?.register("sw.js").catch(() => {}); // Seite offline öffnen (build.mjs)
  boot();
  return true;
}
