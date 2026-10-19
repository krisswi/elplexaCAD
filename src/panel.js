// SchemaCAD: Bausteine für die Eigenschaften-Leiste (HTML-Text).
import * as R from "./render.js";

export function fieldHTML(label, attr, value, extra = "") {
  const id = "f" + Math.random().toString(36).slice(2, 8);
  return `<div class="field"><label for="${id}">${R.esc(label)}</label><input id="${id}" type="text" ${attr} value="${R.esc(value)}" ${extra} autocomplete="off" spellcheck="false"></div>`;
}
export const actions = (list) => `<div class="row">${list.map(([act, ic, label, cls]) => `<button class="btn outline small ${cls || ""}" data-act="${act}">${R.icons[ic].replace("<svg", '<svg width="16" height="16"')}${label}</button>`).join("")}</div>`;
export const head = (title, sub = "") => `<div class="prop-head"><h2>${R.esc(title)}</h2>${sub ? `<p>${R.esc(sub)}</p>` : ""}</div>`;
export const numField = (label, key, val, { step = 1, min, dis = false, attr = "data-dp" } = {}) => `<div class="field"><label>${R.esc(label)}</label><input type="number" ${attr}="${key}" value="${val}" step="${step}"${min !== undefined ? ` min="${min}"` : ""}${dis ? " disabled" : ""}></div>`;
// Drehung und Ausrichtung eines Texts (Schema, CJ 19.10.2026). pre: Attribut-Vorsilbe, "data-text" (gewählter Text) oder "data-newt" (neuer Text)
export const turnHTML = (r, al, pre) => `<div class="field"><label>Drehung</label><select ${pre}r>${[0, 90, 180, 270].map((v) => `<option value="${v}"${(r || 0) === v ? " selected" : ""}>${v}°</option>`).join("")}</select></div>`
  + `<div class="field"><label>Ausrichtung</label><select ${pre}al>${[["", "Links"], ["c", "Mittig"], ["r", "Rechts"]].map(([v, l]) => `<option value="${v}"${(al || "") === v ? " selected" : ""}>${l}</option>`).join("")}</select></div>`;
export const textPanelHTML = (it, big = false, turn = false) => head("Text", "Freier Text auf dem Blatt") + fieldHTML("Inhalt", 'data-text="s"', it.s)
  + `<div class="field"><label>Texthöhe in mm</label><input type="number" min="1" max="${big ? 200 : 20}" step="${big ? 1 : 0.5}" data-text="h" value="${it.h}"></div>`
  + (turn ? turnHTML(it.r, it.al, "data-text") : "")
  + actions([["dup", "copy", "Duplizieren"], ["del", "trash", "Löschen", "danger"]]);
export const dupDel = () => actions([["dup", "copy", "Duplizieren"], ["del", "trash", "Löschen", "danger"]]);
