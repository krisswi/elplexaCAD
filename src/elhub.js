// elplexaCAD: Projektübersicht (Hub), Projektdaten, GWR-Abruf und Adresssuche. Aus app.js ausgelagert (Umbau, 27.10.2026), Verhalten unverändert.
// Zustand EL_S (Übersicht) und S gehören app.js. Nur im elplexaCAD-Bau benutzt.
import { setProjectMeta, cleanInfo, modName } from "./model.js";
import { toast } from "./dialogs.js";
import { cloudUser } from "./cloud.js";
import { fetchGwr, searchAdr } from "./gwr.js";
import * as R from "./render.js";
import * as E from "./elplexa.js";

export function makeHub({ S, $, EL_S, change, closeEditor, finishWire, baseName, setFileName, sheetLabel, elDay, elMod, elBarSync, curT, elLocked, elOnlineDraw, elOnlineList, elProjOrder, elTabLive, elTipOn, elZeitData, elZeitPause }) {
  // Übersicht zeigen (show) oder schliessen; beim Schliessen bleibt das zuletzt offene Modul. keepFocus: neu zeichnen, Fokus bleibt
  function elHub(show, { keepFocus = false, tab = null } = {}) {
    if (!show && S.shared && !EL_S.shareInfo) return; // geteilte Ansicht: Übersicht bleibt, bis das Projekt geladen ist
    const h = EL_S.hub, f = keepFocus && document.activeElement?.closest?.("#el-hub") ? (document.activeElement.id ? "#" + document.activeElement.id : document.activeElement.dataset.elp ? `[data-elp="${document.activeElement.dataset.elp}"]` : document.activeElement.dataset.elf ? `[data-elf="${document.activeElement.dataset.elf}"]` : document.activeElement.dataset.elview ? `[data-elview="${document.activeElement.dataset.elview}"]` : null) : null;
    if (show) {
      if (EL_S.hub.hidden) { EL_S.tab = "projekte"; EL_S.pview = true; } // aus dem Modul zurück: das offene Projekt
      if (tab) { EL_S.tab = tab; if (tab === "projekte") EL_S.pview = false; }
      finishWire(); closeEditor(true); elZeitPause(); // in der Übersicht läuft keine Zeit
      const today = elDay(Date.now());
      const file = S.fileHandle?.name || "", suggest = `${baseName()}.elplexa.json`;
      const gd = h.querySelector("#el-gwr"); if (gd) EL_S.gwrOpen = gd.open; // GWR-Feld bleibt beim Neuzeichnen offen oder zu
      h.innerHTML = S.shared && !EL_S.shareInfo ? (EL_S.shareFail ? E.shareFailHTML(EL_S.shareFail.grund, EL_S.shareFail.msg) : E.shareLoadHTML())
        : E.hubHTML(S.doc, { name: elName(), file, suggest, today, label: sheetLabel, shared: S.shared ? EL_S.shareInfo : null, gwrOpen: !!EL_S.gwrOpen, gwrBusy: !!EL_S.gwrBusy, tip: elTipOn(), tab: EL_S.tab, pview: EL_S.pview, showArch: !!EL_S.showArch, fFolder: EL_S.fFolder, curT: curT(), profil: { user: cloudUser(), busy: EL_S.pfBusy, msg: EL_S.pfMsg, mail: EL_S.pfMail, pw: EL_S.pfPw, locked: elLocked() }, zeit: elZeitData(), projs: { recent: EL_S.recent, online: EL_S.onlist ?? null, shares: EL_S.mshares ?? null, user: cloudUser(), err: EL_S.onerr, busy: EL_S.onbusy, ...EL_S.pf, sel: EL_S.sel, order: elProjOrder() } });
      for (const el of h.querySelectorAll(".ic[data-ic]")) el.innerHTML = R.icons[el.dataset.ic];
      E.recentList().then((l) => {
        const key = (x) => JSON.stringify((x || []).map((e) => [e.file, e.t])), changed = key(EL_S.recent) !== key(l);
        if (changed) EL_S.sel?.clear(); // Plätze in der Liste haben sich geändert
        EL_S.recent = l; const r = h.querySelector("#el-recent"); if (r) r.innerHTML = E.recentHTML(l);
        if (changed && EL_S.tab === "projekte" && !EL_S.pview && !EL_S.hub.hidden) elHub(true, { keepFocus: true }); // Kacheln mit den geladenen Einträgen
      });
      elOnlineDraw();
      if (elTabLive() && EL_S.tab !== "profil" && !S.shared && cloudUser() && EL_S.onlist == null && !EL_S.onbusy && !EL_S.autoTried) { EL_S.autoTried = true; elOnlineList(); } // einmal je Anmeldung automatisch laden
    }
    h.hidden = !show; document.body.classList.toggle("el-hubopen", show);
    elBarSync(); // Zeile 2: Tabs, Chip, sichtbare Teile je Ansicht (data-elbar)
    $("#btn-new").title = show ? "Neues Projekt anlegen" : "Neues Dokument: Schema, Disposition oder Stringplan";
    $("#el-crumb").innerHTML = show ? `<span class="el-hubtitle">Projektübersicht</span>${E.statusPill(E.statusOf(S.doc))}` : E.crumbHTML(elMod(), E.statusOf(S.doc), modName(S.doc, elMod()));
    if (f) h.querySelector(f)?.focus(); else if (keepFocus) { /* Fokus nicht auf eine Kachel springen lassen */ } else if (show) h.querySelector(".el-tile")?.focus(); else svg.focus();
  }
  // Projektname: in der Datei (doc.project.name), alte Dateien ohne Namen nehmen den Dateinamen
  const elName = () => S.doc.project?.name || S.fileName;
  const elProj = () => (S.doc.project ||= {});
  // Feld der Übersicht ändern: Name, Status oder Projektdaten. Projektdaten gehen in die Schriftfelder aller Blätter
  // (und in doc.project.meta für neue Blätter), Bauherr auf die Titelseite. Ein Rückgängig-Schritt.
  function elSetProject(k, v) {
    v = v.trim();
    if (k === "name" && !v) { elHub(true, { keepFocus: true }); return; } // leerer Name: alter bleibt
    change(() => {
      const p = elProj();
      if (k === "name") p.name = v;
      else if (k === "status") p.status = v;
      else if (k.startsWith("adr:")) { const a = (p.adr ||= {}); if (v) a[k.slice(4)] = v; else delete a[k.slice(4)]; if (!Object.keys(a).length) delete p.adr; }
      else if (k.startsWith("BAUHERR")) { const info = E.bauherrInfo(S.doc) || (S.doc.info = cleanInfo({})); info[k] = v; } // Bauherr, E-Mail, Telefon
      else { (p.meta ||= {})[k] = v; for (const sh of S.doc.sheets) sh.meta[k] = v; }
    }, { panel: false });
    setProjectMeta(S.doc.project?.meta);
    if (k === "name" && !S.fileHandle) setFileName(v); // noch ohne Datei: Kopf zeigt den Projektnamen
    elHub(true, { keepFocus: true });
  }
  // GWR abrufen (CJ 19.10.2026, gwr.js): ersetzt project.gwr, füllt leere PLZ/Ort
  async function elGwr() {
    if (EL_S.gwrBusy) return;
    EL_S.gwrBusy = true; EL_S.gwrOpen = true; elHub(true, { keepFocus: true });
    try {
      const doc = S.doc, r = await fetchGwr(doc.project?.adr);
      if (S.doc !== doc) return; // inzwischen anderes Projekt geöffnet
      change(() => { const p = elProj(); p.adr = r.adr; p.gwr = r.gwr; }, { panel: false });
      toast(`GWR abgerufen: EGID ${r.gwr.egid}.`);
    } catch (err) { toast(err.message, "error"); }
    finally { EL_S.gwrBusy = false; if (!EL_S.hub.hidden) elHub(true, { keepFocus: true }); }
  }
  // Adresssuche beim Tippen (CJ 19.10.2026): im Feld Strasse tippen (ab 3 Zeichen), Vorschläge darunter. Pfeiltasten und Enter oder Klick wählen,
  // Esc schliesst. Die Auswahl füllt Strasse, Nr., PLZ, Ort und holt gleich das GWR. Ältere Antworten werden verworfen (seq).
  const ADR = { list: null, items: [], i: -1, seq: 0, timer: 0, input: null };
  function adrInit(hub) {
    const l = document.createElement("div");
    l.id = "el-adrlist"; l.className = "menu instant el-adrlist"; l.setAttribute("role", "listbox"); l.setAttribute("aria-label", "Adressvorschläge"); l.hidden = true;
    $("#app").append(l); ADR.list = l;
    l.addEventListener("mousedown", (e) => { e.preventDefault(); const o = e.target.closest("[data-adr]"); if (o) adrPick(Number(o.dataset.adr)); }); // Fokus bleibt im Feld
    hub.addEventListener("input", (e) => { if (e.target.dataset?.elp === "adr:str") adrQuery(e.target); });
    hub.addEventListener("focusout", (e) => { if (e.target === ADR.input) adrClose(); });
    hub.addEventListener("scroll", adrClose, { passive: true });
    hub.addEventListener("keydown", (e) => {
      if (e.target !== ADR.input || l.hidden) return;
      const n = ADR.items.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); if (n) adrMark(e.key === "ArrowDown" ? (ADR.i + 1) % n : ADR.i <= 0 ? n - 1 : ADR.i - 1); }
      else if (e.key === "Enter" && n) { e.preventDefault(); e.stopPropagation(); adrPick(Math.max(0, ADR.i)); } // Enter ohne Auswahl nimmt den ersten Vorschlag
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); adrClose(); }
    }, true);
  }
  function adrQuery(input) {
    ADR.input = input; clearTimeout(ADR.timer);
    const q = input.value.trim();
    if (q.length < 3) { ADR.seq++; adrClose(); return; }
    ADR.timer = setTimeout(async () => {
      const seq = ++ADR.seq;
      let r;
      try { r = await searchAdr(q); } catch { r = null; }
      if (seq !== ADR.seq || document.activeElement !== input) return;
      adrShow(r);
    }, 200);
  }
  function adrShow(r) {
    const l = ADR.list, inp = ADR.input;
    ADR.items = r || []; ADR.i = -1;
    l.innerHTML = r === null ? `<p class="el-adrnone">Suche nicht erreichbar. Adresse von Hand eingeben.</p>` : !r.length ? `<p class="el-adrnone">Keine Adresse gefunden.</p>`
      : r.map((a, k) => `<button class="mi" role="option" id="el-adr-${k}" data-adr="${k}" tabindex="-1" aria-selected="false"><span class="mt"><span class="mh">${R.esc([a.str, a.nr].filter(Boolean).join(" "))}</span><span class="ms">${R.esc([a.plz, a.ort].filter(Boolean).join(" "))}</span></span></button>`).join("");
    const row = inp.closest(".el-row").getBoundingClientRect();
    Object.assign(l.style, { left: `${row.left}px`, top: `${row.bottom + 4}px`, width: `${row.width}px` });
    l.hidden = false; inp.setAttribute("aria-expanded", "true"); inp.removeAttribute("aria-activedescendant");
  }
  function adrMark(i) {
    ADR.i = i;
    ADR.list.querySelectorAll("[data-adr]").forEach((b, k) => b.setAttribute("aria-selected", String(k === ADR.i)));
    const o = ADR.i >= 0 ? $(`#el-adr-${ADR.i}`) : null;
    if (o) { ADR.input.setAttribute("aria-activedescendant", o.id); o.scrollIntoView({ block: "nearest" }); } else ADR.input.removeAttribute("aria-activedescendant");
  }
  function adrClose() {
    clearTimeout(ADR.timer);
    if (!ADR.list || ADR.list.hidden) return;
    ADR.list.hidden = true; ADR.items = []; ADR.i = -1;
    ADR.input?.setAttribute("aria-expanded", "false"); ADR.input?.removeAttribute("aria-activedescendant");
  }
  function adrPick(k) {
    const a = ADR.items[k];
    if (!a) return;
    adrClose(); ADR.seq++;
    ADR.input.value = a.str; ADR.input.blur(); // übernimmt die Strasse statt des Suchworts (change), bevor neu gezeichnet wird
    const adr = Object.fromEntries(Object.entries(a).filter(([, v]) => v));
    change(() => { elProj().adr = adr; }, { panel: false });
    elHub(true);
    $('#el-hub [data-elp="adr:str"]')?.focus();
    elGwr();
  }
  return { elHub, elName, elProj, elSetProject, elGwr, adrInit };
}
