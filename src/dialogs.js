// SchemaCAD: Meldungen, Dialoge und Aufklappmenüs. Ohne Zustand des Editors.
import * as R from "./render.js";

const $ = (s) => document.querySelector(s);

export function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 150); }, kind === "error" ? 7000 : 3500);
}

// Gemeinsamer Rahmen der Dialoge. onButton(b, done) wird bei jedem Knopf aufgerufen, bis done(...) den Dialog schliesst.
// Escape oder Klick auf den Hintergrund bricht ab (Ergebnis cancel). cls = zusätzliche Klasse für den Rahmen.
export function openModal(title, body, onButton, cancel, focusSel, cls = "") {
  return new Promise((resolve) => {
    const root = $("#modal-root");
    root.innerHTML = `<div class="modal-back"><div class="modal ${cls}" role="dialog" aria-modal="true" aria-label="${R.esc(title)}"><h2>${R.esc(title)}</h2>${body}</div></div>`;
    const done = (v) => { root.removeEventListener("click", click); document.removeEventListener("keydown", key, true); root.innerHTML = ""; resolve(v); };
    const click = (e) => {
      if (e.target.classList.contains("modal-back")) { done(cancel); return; }
      const b = e.target.closest("button");
      if (b) onButton(b, done);
    };
    const key = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(cancel); } };
    root.addEventListener("click", click);
    document.addEventListener("keydown", key, true);
    root.querySelector(focusSel)?.focus();
  });
}
export function confirmDialog(title, text, okLabel) {
  return openModal(title, `<p>${R.esc(text)}</p><div class="actions"><button class="btn outline" data-r="0">Abbrechen</button><button class="btn primary" data-r="1">${R.esc(okLabel)}</button></div>`,
    (b, done) => { if (b.dataset.r !== undefined) done(b.dataset.r === "1"); }, false, '[data-r="1"]');
}

export function formDialog(title, text, fields, okLabel) {
  const f = fields.map((x, i) => x.options
    ? `<div class="field"><label>${R.esc(x.label)}</label><select data-f="${i}">${x.options.map(([v, l]) => `<option value="${R.esc(v)}"${v === x.value ? " selected" : ""}>${R.esc(l)}</option>`).join("")}</select></div>`
    : `<div class="field"><label>${R.esc(x.label)}</label><input type="text" data-f="${i}" value="${R.esc(x.value ?? "")}" autocomplete="off" spellcheck="false"></div>`).join("");
  return openModal(title, `<p>${R.esc(text)}</p>${f}<div class="actions"><button class="btn outline" data-c>Abbrechen</button><button class="btn primary" data-ok>${R.esc(okLabel)}</button></div>`, (b, done) => {
    if (b.dataset.ok !== undefined) done(fields.map((_, i) => $("#modal-root").querySelector(`[data-f="${i}"]`).value));
    else if (b.dataset.c !== undefined) done(null);
  }, null, "input,select");
}

// Auswahl aus einer Liste. Gibt den Wert zurück oder null bei Abbrechen.
export function chooseDialog(title, text, options, extra = []) {
  const list = options.map((o, i) => `<button class="choice" data-v="${i}">${R.esc(o.label)}</button>`).join("");
  const more = extra.map((e, i) => `<button class="btn outline" data-x="${i}">${R.esc(e.label)}</button>`).join("");
  return openModal(title, `<p>${R.esc(text)}</p><div class="choices">${list}</div><div class="actions">${more}<button class="btn outline" data-c>Abbrechen</button></div>`, (b, done) => {
    if (b.dataset.v !== undefined) done({ option: options[Number(b.dataset.v)] });
    else if (b.dataset.x !== undefined) done({ extra: extra[Number(b.dataset.x)] });
    else if (b.dataset.c !== undefined) done(null);
  }, null, "[data-v]");
}

const menus = []; // alle Aufklappmenüs, siehe makeMenu
// Aufklappmenüs (Export, Blattliste, Neues Blatt): Klick ausserhalb oder Esc schliesst, Pfeiltasten wählen, Fokus zurück auf den Knopf
export function makeMenu(menu, { up = false, left = false, form = false, onOpen, beforeShow } = {}) { // left: linksbündig am Knopf; form: Fenster mit Feldern, Tab bleibt im Fenster
  let anchorId = null;
  const items = () => [...menu.querySelectorAll(".mi:not([hidden])")];
  const anchor = () => anchorId && document.getElementById(anchorId); // die Blattleiste wird neu gezeichnet, daher über die ID
  const m = {
    get open() { return !menu.hidden; },
    anchorId: () => anchorId,
    show(btn, { instant = false } = {}) {
      if (!menu.hidden && anchorId === btn.id) return;
      beforeShow?.();
      for (const o of menus) if (o !== m) o.hide(false);
      anchorId = btn.id; menu.hidden = false; btn.setAttribute("aria-expanded", "true");
      menu.classList.toggle("instant", instant); // per Taste geöffnet: ohne Bewegung
      if (onOpen) onOpen(); else items()[0]?.focus();
      const r = btn.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight; // am Knopf, bleibt im Bild
      menu.style.top = `${Math.max(8, up ? r.top - 4 - h : r.bottom + 4)}px`;
      menu.style.left = `${Math.max(8, Math.min(up || left ? r.left : r.right - w, innerWidth - 8 - w))}px`;
    },
    hide(refocus = true) {
      if (menu.hidden) return;
      menu.hidden = true; anchor()?.setAttribute("aria-expanded", "false");
      if (refocus) anchor()?.focus();
    },
    toggle(btn) { if (!menu.hidden && anchorId === btn.id) m.hide(); else m.show(btn); },
  };
  menu.addEventListener("click", (e) => { if (e.target.closest(".mi")) m.hide(); }, true); // vor der Aktion schliessen, damit ein Dialog den Fokus behält
  menu.addEventListener("keydown", (e) => {
    e.stopPropagation(); // keine Tastenkürzel der Zeichenfläche, solange das Menü den Fokus hat
    const its = items(), i = its.indexOf(document.activeElement), field = e.target.tagName === "INPUT";
    if (e.key === "Escape") { e.preventDefault(); m.hide(); return; }
    if (e.key === "Tab") { if (!form) m.hide(false); return; }
    if (field) {
      if (e.key === "ArrowDown" && its.length) { e.preventDefault(); its[0].focus(); }
      if (e.key === "Enter" && its.length) { e.preventDefault(); its[0].click(); }
      return;
    }
    const input = menu.querySelector("input");
    if (e.key === "ArrowUp" && i === 0 && input) { e.preventDefault(); input.focus(); return; }
    const go = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: its.length - 1 }[e.key];
    if (go !== undefined && its.length) { e.preventDefault(); its[(go + its.length) % its.length].focus(); }
  });
  menus.push(m);
  return m;
}
document.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".modal-back")) return; // Dialog aus einem Fenster heraus (z. B. Neuer Modultyp): Fenster bleibt offen
  for (const m of menus) if (m.open && !e.target.closest(".menu") && !e.target.closest(`#${m.anchorId()}`)) m.hide(false);
}, true);
window.addEventListener("resize", () => { for (const m of menus) m.hide(false); });
