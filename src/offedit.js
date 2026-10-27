// Modul «Offerten» (CJ 26.10.2026), Schritt 1: Bedienung. Die Offerte ist eine Tabelle statt einer Zeichenfläche (#of-view über dem Blatt).
// Links zwei einklappbare Bereiche (CJ 26.10.2026): «Gliederung» (Baum der Knoten) und «BKP-Kapitel» des angewählten Knotens (Klick im Katalog legt ein Kapitel an).
// Rechts Kopf und Rechenwerte, in der Mitte der angewählte Knoten mit allem darunter: Kapitel → Gruppen → Positionen, am Ende die Schlusszusammenstellung.
// Felder tragen data-of="<Ziel>.<Feld>" (o = Offerte, n/k/g/p + ID), Knöpfe data-ofact. apply() und action() ändern nur die Daten, die App zeichnet neu (change).
import { esc } from "./render.js";
import * as O from "./offerte.js";
import { profilLines } from "./profil.js";
import * as PD from "./positionen.js";
import { icZeit, loadIcZeiten } from "./sollwerte.js";

// Teilen-Link (CJ 26.10.2026): ro = nur lesen (Felder als Text, keine Knöpfe), prices = Preise freigegeben. EK, Faktor und Zeit kommen nie an (share_open).
let mode = { ro: false, prices: true };
export const setMode = (m) => { mode = { ro: false, prices: true, ...m }; };
const open = new Set(); // Positionen mit aufgeklappten Angaben (nur Anzeige, nicht in der Datei)
// selKn: angewählter Knoten (0 = ganze Offerte), area: aufgeklappte Bereiche links { gl, bkp } (null = nach dem Inhalt). Nur Anzeige, gilt je Offerte.
let bkpFind = "", selKn = 0, area = null;
export const closeDetails = () => { open.clear(); selKn = 0; area = null; };
export const selected = () => selKn;
const fixSel = (of) => { if (selKn && !O.knFind(of, selKn)) selKn = 0; };
// Ist noch nichts angelegt, ist die Gliederung offen und BKP zu, sonst umgekehrt
const areas = (of) => (area ||= of.kn.length || of.kap.length ? { gl: false, bkp: true } : { gl: true, bkp: false });
const val = (v) => (v === undefined || v === null ? "" : esc(String(v)));
const opts = (set, cur, empty) => (empty !== undefined ? `<option value="">${esc(empty)}</option>` : "") + Object.entries(set).map(([k, l]) => `<option value="${k}"${k === cur ? " selected" : ""}>${esc(l)}</option>`).join("");
const inp = (key, v, { cls = "", ph = "", num = false, lab = "" } = {}) => mode.ro ? `<span class="of-ro ${cls}">${val(v)}</span>` : `<input type="text"${num ? ' inputmode="decimal"' : ""} class="${cls}" data-of="${key}" value="${val(v)}"${ph ? ` placeholder="${esc(ph)}"` : ""}${lab ? ` aria-label="${esc(lab)}"` : ""} autocomplete="off" spellcheck="false">`;
const fld = (label, key, v, o = {}) => `<div class="field"><label for="of-${key}">${esc(label)}</label>${inp(key, v, o).replace("<input ", `<input id="of-${key}" `)}</div>`;
const sel = (label, key, set, cur, empty) => `<div class="field"><label for="of-${key}">${esc(label)}</label><select id="of-${key}" data-of="${key}">${opts(set, cur, empty)}</select></div>`;
const btn = (act, attrs, label, txt, cls = "btn icon small") => mode.ro ? "" : `<button type="button" class="${cls}" data-ofact="${act}" ${attrs} title="${esc(label)}" aria-label="${esc(label)}">${txt}</button>`;

// Ziehgriff (CJ 26.10.2026): Positionsnummer bzw. ⠿ vor dem Gruppentitel. Geteilte Ansicht: nur der Text.
const drag = (key, txt, title) => (mode.ro ? (key[0] === "p" ? txt : "") : `<span class="of-drag" draggable="true" data-drag="${key}" title="${esc(title)}">${txt}</span>`);

// ---------- Mitte: Gliederung und Positionen ----------
export function viewHTML(of) {
  fixSel(of);
  const t = O.totals(of), order = O.kapOrder(of), items = O.outline(of, { root: selKn, all: true }), path = O.knPath(of, selKn);
  let h = `<div class="of-wrap"><div class="of-title"><h1>Offerte${of.nr ? ` ${esc(of.nr)}` : ""}</h1><p>${[of.ver && `Version ${esc(of.ver)}`, of.datum && esc(of.datum), of.art && esc(O.ARTEN[of.art]), of.bau && esc(O.BAUARTEN[of.bau])].filter(Boolean).join(" · ") || "Kopf und Rechenwerte rechts"}</p>`
    + (path.length ? `<p class="of-path">${path.map((n) => esc(n.titel || "Ohne Titel")).join(" › ")}</p>` : "") + `</div>`;
  if (!items.some((e) => e.t === "kap")) h += `<p class="of-empty">${selKn ? `Noch kein BKP-Kapitel in «${esc(path.at(-1).titel || "Ohne Titel")}». Links unter «BKP-Kapitel» eines wählen.` : "Noch kein Kapitel. Links eine Gliederung anlegen (z. B. Räume) oder gleich ein BKP-Kapitel wählen."}</p>`;
  for (const e of items) {
    if (e.t === "kn") h += `<div class="of-kn lv${Math.min(e.lv, 3)}" data-knid="${e.n.id}">${mode.ro ? `<span class="of-knh">${esc(O.knLabel(e.n))}</span>` : `<button type="button" class="of-knh" data-ofact="knsel" data-n="${e.n.id}" title="Knoten anwählen">${esc(O.knLabel(e.n))}</button>`}</div>`; // geteilt: Text (links ist ausgeblendet, kein Weg zurück)
    else if (e.t === "end") { if (mode.prices && t.kn.has(e.n.id)) h += `<div class="of-knsum lv${Math.min(e.lv, 3)}"><span>Total ${esc(e.n.titel || "Ohne Titel")}</span><b>${O.fmtChf(t.kn.get(e.n.id))}</b></div>`; }
    else h += kapHTML(of, t, e.k, order.indexOf(e.k));
  }
  if (!selKn && of.kn.length && !mode.ro) h += `<p class="of-addbkp">${btn("bkpopen", "", "Katalog und Suche links öffnen, Kapitel kommt in die ganze Offerte", "+ BKP hinzufügen", "btn outline small")}</p>`;
  return h + (mode.prices ? summaryHTML(of, t) : "") + `</div>`;
}
// Bezeichnung eines Kapitels in der Blattleiste: mit Knoten, wenn er nicht der angewählte ist
const kapLabel = (of, k) => (k.bkp ? `BKP ${k.bkp} ${k.titel}`.trim() : k.titel || "Ohne BKP") + (k.kn && k.kn !== selKn ? ` · ${O.knFind(of, k.kn)?.titel || "Ohne Titel"}` : "");
function kapHTML(of, t, k, ki) {
  let h = `<section class="of-kap" data-kid="${k.id}" data-label="${esc(kapLabel(of, k))}" aria-label="Kapitel ${esc(k.bkp)} ${esc(k.titel)}"><div class="of-kh">${inp(`k${k.id}.bkp`, k.bkp, { cls: "of-bkp", ph: "BKP", lab: "BKP-Nummer" })}${inp(`k${k.id}.titel`, k.titel, { cls: "of-kt", ph: "Titel des Kapitels", lab: "Titel des Kapitels" })}`
    + `<span class="of-acts">${btn("kup", `data-k="${k.id}"`, "Kapitel nach oben", "↑")}${btn("kdown", `data-k="${k.id}"`, "Kapitel nach unten", "↓")}${btn("addgrp", `data-k="${k.id}"`, "Gruppe hinzufügen (eigene Rabattgruppe oder Unterteilung)", "+ Gruppe", "btn outline small")}${btn("delkap", `data-k="${k.id}"`, "Kapitel löschen", "×", "btn icon small danger")}</span></div>`;
  k.grp.forEach((g, gi) => {
    h += `<div class="of-grp" data-gid="${g.id}"><div class="of-gh">${drag(`g${g.id}`, "⠿", "Gruppe ziehen: an eine andere Stelle oder in ein anderes Kapitel")}${inp(`g${g.id}.titel`, g.titel, { cls: "of-gt", ph: k.grp.length > 1 ? "Gruppe" : "Gruppe ohne Titel", lab: "Titel der Gruppe" })}`
      + (mode.ro ? "" : `<label class="of-rab"><span>Rabatt</span><select data-of="g${g.id}.rg" aria-label="Rabattgruppe"><option value="">Gesamtrabatt</option>${of.rg.map((r) => `<option value="${r.id}"${g.rg === r.id ? " selected" : ""}>${esc([r.kz, r.name].filter(Boolean).join(" – ") || "Rabattgruppe")}</option>`).join("")}</select></label>`)
      + `<span class="of-acts">${btn("gup", `data-g="${g.id}"`, "Gruppe nach oben", "↑")}${btn("gdown", `data-g="${g.id}"`, "Gruppe nach unten", "↓")}${btn("delgrp", `data-g="${g.id}"`, "Gruppe löschen", "×", "btn icon small danger")}</span></div>`;
    h += `<table class="of-tab"><thead><tr><th class="c-pos">Pos</th><th class="c-txt">Text</th><th class="c-ic">IC</th><th class="c-n">Menge</th><th class="c-eh">EH</th>${mode.prices ? `<th class="c-n">Preis</th><th class="c-n">Betrag</th>` : ""}<th class="c-opt" title="Optionale Position">Opt.</th><th class="c-act"><span class="sr">Aktionen</span></th></tr></thead><tbody>`;
    g.pos.forEach((p, pi) => { h += posRow(of, t, p, O.posNo(p, ki, gi, pi)); });
    if (!mode.ro || mode.prices) h += `</tbody><tfoot><tr><td colspan="${mode.prices ? 6 : 5}">${btn("addpos", `data-g="${g.id}"`, "Position hinzufügen", "+ Position", "btn outline small")}</td>${mode.prices ? `<td class="c-n of-sum">${O.fmtChf(t.grp.get(g.id) || 0)}</td>` : ""}<td colspan="2"></td></tr></tfoot>`;
    else h += `</tbody>`;
    h += `</table></div>`;
  });
  return h + (mode.prices ? `<div class="of-ksum"><span>Total ${esc(k.titel || "")} BKP ${esc(O.bkpMain(k.bkp) || k.bkp)}</span><b>${O.fmtChf(t.kapSum.get(k.id) || 0)}</b></div>` : "") + `</section>`;
}
function posRow(of, t, p, no) {
  const id = p.id, k = (f) => `p${id}.${f}`, ep = O.unitPrice(p, of), det = open.has(id), off = p.opt && !p.an;
  let h = `<tr class="of-pos${off ? " off" : ""}" data-pid="${id}"><td class="c-pos">${drag(`p${id}`, esc(no), "Position ziehen: an eine andere Stelle, auch in eine andere Gruppe oder ein anderes Kapitel")}</td>`
    + `<td class="c-txt">${mode.ro ? "" : `<span class="of-ptw">`}${inp(k("titel"), p.titel, { cls: "of-pt", ph: "Text", lab: "Text der Position" })}${mode.ro ? "" : `${btn("lupe", `data-p="${id}" tabindex="-1"`, "In der Positionsdatenbank suchen (Titel, Text, E-Nr., Hersteller, NPK)", LUPE, "btn icon small of-lupe")}</span>`}${mode.ro ? (p.text ? `<span class="of-ro of-rtext">${val(p.text)}</span>` : "") : `<textarea data-of="${k("text")}" rows="1" placeholder="Beschreibung" aria-label="Beschreibung">${val(p.text)}</textarea>`}</td>`
    + `<td class="c-ic">${inp(k("ic"), p.ic, { lab: "IC-Code" })}</td><td class="c-n">${inp(k("menge"), p.menge, { num: true, lab: "Menge" })}</td><td class="c-eh">${inp(k("eh"), p.eh, { ph: "Stk", lab: "Einheit" })}</td>`
    + (mode.prices ? `<td class="c-n">${mode.ro ? `<span class="of-ro">${O.fmtChf(ep)}</span>` : inp(k("preis"), p.preis, { num: true, ph: ep ? O.fmtChf(ep) : "", lab: "Einheitspreis (leer = aus EK und Zeit)" })}</td>`
    + `<td class="c-n of-amt">${O.fmtChf(t.pos.get(id) || 0)}</td>` : "")
    + `<td class="c-opt">${mode.ro ? (p.opt ? `<span class="of-ro">${p.an ? "Option, aktiv" : "Option"}</span>` : "") : `<input type="checkbox" data-of="${k("opt")}"${p.opt ? " checked" : ""} aria-label="Optionale Position" title="Optionale Position">${p.opt ? `<label class="of-an" title="Option in die Angebotssumme nehmen"><input type="checkbox" data-of="${k("an")}"${p.an ? " checked" : ""}><span>aktiv</span></label>` : ""}`}</td>`
    + `<td class="c-act">${btn("det", `data-p="${id}" aria-expanded="${det}"`, det ? "Angaben zuklappen" : "Weitere Angaben: NPK, Typ, Form, EK, Zeit, Gliederung", "⋯")}${btn("pup", `data-p="${id}"`, "Position nach oben", "↑")}${btn("pdown", `data-p="${id}"`, "Position nach unten", "↓")}${btn("cpos", `data-p="${id}"`, "Position kopieren", "⧉")}${btn("delpos", `data-p="${id}"`, "Position löschen", "×", "btn icon small danger")}</td></tr>`;
  if (det && !mode.ro) {
    const f = (label, key, v, o = {}) => `<label class="of-df"><span>${esc(label)}</span>${inp(k(key), v, { ...o, lab: label })}</label>`;
    const s = (label, key, set, cur, empty) => `<label class="of-df"><span>${esc(label)}</span><select data-of="${k(key)}" aria-label="${esc(label)}">${opts(set, cur, empty)}</select></label>`;
    const gl = O.glOf(of, id), inh = [...Object.entries(O.GLIEDERUNG).filter(([gk]) => gl[gk]).map(([gk, l]) => `${l} ${gl[gk]}`), O.bkpOf(of, id) && `BKP ${O.bkpOf(of, id)}`].filter(Boolean);
    h += `<tr class="of-det"><td></td><td colspan="8"><div class="of-dgrid">${f("NPK-Nr.", "npk", p.npk, { ph: "X XX.XXX.XXX.XXX.XX" })}${s("Typ", "typ", O.TYPEN, p.typ || "lp")}${s("Form", "form", O.FORMEN, p.form || "r")}`
      + `${f("Hersteller", "her", p.her)}${f("E-Nr.", "enr", p.enr)}${f("EK-Preis", "ek", p.ek, { num: true })}${f("Faktor", "fak", p.fak, { num: true, ph: O.fmtNum(of.fak) })}${f("Zeit h je EH", "std", p.std, { num: true })}`
      + `</div><p class="note of-inh">Aus der Auswahl links: ${esc(inh.join(" · ") || "ohne Gliederung und BKP")}</p><div class="row">${btn("dbsave", `data-p="${id}"`, "Position in der eigenen Positionsdatenbank speichern (gleicher Titel, Hersteller und E-Nr. wird ersetzt)", "In Datenbank speichern", "btn outline small")}</div></td></tr>`;
  }
  return h;
}
const totLabel = O.totalLabel;
function summaryHTML(of, t) {
  if (!of.kap.length) return "";
  const cls = { zs: "of-strong", total: "of-total" }, { rows, notes } = O.summaryRows(of, t);
  let h = `<section class="of-end" aria-label="Schlusszusammenstellung"><h2>Schlusszusammenstellung</h2><table class="of-stab"><tbody>`;
  for (const r of rows) h += `<tr${cls[r.art] ? ` class="${cls[r.art]}"` : ""}><td${r.lv ? ` style="padding-left:${r.lv * 1.2}em"` : ""}${r.art === "kn" ? ' class="of-strong"' : ""}>${esc(r.text)}</td><td class="c-n">${O.fmtSigned(r.betrag)}</td></tr>`;
  h += `</tbody></table>`;
  return h + notes.map((n) => `<p class="of-note">${esc(n)}</p>`).join("") + `</section>`;
}

// Ablageort beim Ziehen. drag = "p12" (Position) oder "g5" (Gruppe), el = Element unter der Maus, y = Mausposition.
// Gibt { el, mark, fn } zurück (mark: before, after, in; fn verschiebt in der Offerte) oder null.
export function dropAt(drag, el, y) {
  if (!el?.closest) return null;
  const id = Number(drag.slice(1)), half = (e) => { const r = e.getBoundingClientRect(); return y > r.top + r.height / 2; };
  const grpEl = el.closest(".of-grp"), kapEl = el.closest(".of-kap");
  if (drag[0] === "p") {
    const row = el.closest("tr.of-pos");
    if (row && grpEl) {
      const pid = Number(row.dataset.pid), gid = Number(grpEl.dataset.gid), after = half(row);
      return { el: row, mark: after ? "after" : "before", fn: (of) => { const g = O.findGrp(of, gid)?.g; if (!g) return false; const i = g.pos.findIndex((p) => p.id === pid);
        return O.movePos(of, id, gid, after ? g.pos[i + 1]?.id ?? null : pid); } };
    }
    if (grpEl) { const gid = Number(grpEl.dataset.gid); return { el: grpEl, mark: "in", fn: (of) => O.movePos(of, id, gid) }; }
    if (kapEl) { const k0 = Number(kapEl.dataset.kid); return { el: kapEl, mark: "in", fn: (of) => { const g = of.kap.find((k) => k.id === k0)?.grp.at(-1); return !!g && O.movePos(of, id, g.id); } }; }
    return null;
  }
  if (grpEl && kapEl) {
    const gid = Number(grpEl.dataset.gid), kid = Number(kapEl.dataset.kid), after = half(grpEl);
    return { el: grpEl, mark: after ? "after" : "before", fn: (of) => { const k = of.kap.find((x) => x.id === kid); if (!k) return false; const i = k.grp.findIndex((g) => g.id === gid);
      return O.moveGrp(of, id, kid, after ? k.grp[i + 1]?.id ?? null : gid); } };
  }
  if (kapEl) { const kid = Number(kapEl.dataset.kid); return { el: kapEl, mark: "in", fn: (of) => O.moveGrp(of, id, kid) }; }
  return null;
}

// ---------- Links: Gliederung und BKP-Kapitel ----------
// Lupe ohne Tab-Halt: Tab springt weiter von Feld zu Feld wie bisher
const LUPE = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>`;
const areaHead = (key, label, on, sub) => `<h2 class="section-title of-areah"><button type="button" class="of-area" data-ofact="area" data-area="${key}" aria-expanded="${on}"><span class="of-caret" aria-hidden="true">${on ? "▾" : "▸"}</span>${esc(label)}${sub ? `<span class="of-areas">${esc(sub)}</span>` : ""}</button></h2>`;
export function leftHTML(of) {
  fixSel(of);
  const a = areas(of), cur = O.knFind(of, selKn), name = cur ? cur.titel || "Ohne Titel" : of.kn.length ? "ohne Gliederung" : "";
  return glHTML(of, a.gl, cur) + bkpHTML(of, a.bkp, name);
}
// Baum: «Ganze Offerte» und die Knoten mit Einzug. Klick wählt an (Bereiche links bleiben, wie sie sind). Darunter die Angaben des angewählten Knotens.
function glHTML(of, on, cur) {
  const item = (id, label, kurz, lv) => `<button type="button" class="of-kni${id === selKn ? " on" : ""}" style="--lv:${lv}" data-ofact="knsel" data-n="${id}" aria-current="${id === selKn}"><span>${esc(label)}</span>${kurz ? `<small>${kurz}</small>` : ""}</button>`;
  const tree = (up, lv) => O.knKids(of, up).map((n) => item(n.id, n.titel || "Ohne Titel", O.GL_KURZ[O.knArt(n)], lv) + tree(n.id, lv + 1)).join("");
  let h = `<section class="section of-gl">${areaHead("gl", "Gliederung", on, on ? "" : cur ? cur.titel || "Ohne Titel" : "Ganze Offerte")}`;
  if (!on) return h + `</section>`;
  h += `<div class="of-tree" role="list">${item(0, "Ganze Offerte", "", 0)}${tree(0, 1)}</div>`;
  if (!of.kn.length && !mode.ro) h += `<p class="note">Keine Ebene ist Pflicht. Knoten gliedern die Offerte z. B. nach Haus, Geschoss, Raum.</p>`;
  if (cur && !mode.ro) {
    const n = `n${cur.id}`;
    h += `<div class="of-knedit">${fld("Titel", `${n}.titel`, cur.titel, { ph: "z. B. Wohnzimmer" })}${sel("Art", `${n}.art`, O.GLIEDERUNG, O.knArt(cur))}`
      + `<div class="row">${btn("knmove", `data-n="${cur.id}" data-how="up"`, "Nach oben", "↑")}${btn("knmove", `data-n="${cur.id}" data-how="down"`, "Nach unten", "↓")}${btn("knmove", `data-n="${cur.id}" data-how="out"`, "Eine Ebene höher", "←")}${btn("knmove", `data-n="${cur.id}" data-how="in"`, "Unter den Knoten darüber", "→")}`
      + `${btn("knadd", `data-up="${cur.id}"`, "Unterknoten anlegen", "+ Unterknoten", "btn outline small")}${btn("kndel", `data-n="${cur.id}"`, "Knoten löschen (mit allem darunter)", "×", "btn icon small danger")}</div></div>`;
  }
  return h + btn("knadd", `data-up="${cur?.up || 0}"`, "Knoten auf derselben Ebene anlegen", "+ Knoten", "btn outline small") + `</section>`;
}
// Kapitel des angewählten Knotens (Klick springt hin), darunter der BKP-Katalog (Klick legt ein Kapitel im Knoten an)
function bkpHTML(of, on, name) {
  let h = `<section class="section of-bkpa">${areaHead("bkp", "BKP-Kapitel", on, name)}`;
  if (!on) return h + `</section>`;
  const own = of.kap.filter((k) => (k.kn || 0) === selKn);
  h += own.length ? `<div class="of-kaplist" role="list">${own.map((k) => `<button type="button" class="of-kapi" role="listitem" data-ofact="kapjump" data-k="${k.id}"><b>${esc(k.bkp)}</b><span>${esc(k.titel || "Ohne Titel")}</span></button>`).join("")}</div>`
    : `<p class="note">${selKn ? "Noch kein Kapitel in diesem Knoten." : "Noch kein Kapitel."}</p>`;
  if (mode.ro) return h + `</section>`;
  const q = bkpFind.trim().toLowerCase(), list = O.BKP.filter(([n, l]) => !q || n.startsWith(q) || l.toLowerCase().includes(q));
  return h + `<p class="note">Klick im Katalog legt das Kapitel${name ? ` in «${esc(name)}»` : ""} an.</p>`
    + `<div class="field"><input type="text" id="of-bkpfind" value="${val(bkpFind)}" placeholder="BKP suchen: Nummer oder Text" aria-label="BKP suchen" autocomplete="off" spellcheck="false"></div>`
    + `<div class="of-bkplist" role="list">${list.map(([n, l]) => `<button type="button" class="of-bkpi lv${n.split(".")[1]?.length || (n.length > 2 ? 0 : -1)}" role="listitem" data-ofact="addkap" data-bkp="${n}"><b>${n}</b><span>${esc(l)}</span></button>`).join("") || `<p class="note">Kein Treffer.</p>`}</div>`
    + `<button type="button" class="btn outline small" data-ofact="addkap" data-bkp="">Eigenes Kapitel</button></section>`;
}
export const setBkpFind = (s) => { bkpFind = s; };

// Lupe (CJ 26.10.2026): Positionsdatenbank im Fenster, Suche über Titel, Text, E-Nr., Hersteller, NPK-Nr. (positionen.js). Ohne Suchwort die ersten Einträge.
export function dbHitsHTML(q) {
  const n = PD.count(), hits = q.trim() ? PD.search(q) : PD.list().slice(0, 40);
  if (!n) return `<p class="note">Noch keine Position in deiner Datenbank. Unter ⋯ einer Position: «In Datenbank speichern».</p>`;
  return hits.map((e) => `<div class="of-dbi"><button type="button" class="of-dbadd" data-dbpick="${esc(e.id)}"><b>${esc(e.titel || e.text)}</b><span>${esc([e.her, e.enr && `E-Nr. ${e.enr}`, e.npk && `NPK ${e.npk}`].filter(Boolean).join(" · "))}</span></button>`
    + `<button type="button" class="btn icon small danger" data-dbdel="${esc(e.id)}" title="Aus der Datenbank löschen" aria-label="Aus der Datenbank löschen">×</button></div>`).join("") || `<p class="note">Kein Treffer.</p>`;
}
// hat die Position schon Inhalt? Dann fragt die Lupe «ersetzen» oder «darunter einfügen»
export const hasContent = (p) => ["titel", "text", "menge", "preis", "ek"].some((k) => p[k] !== undefined && p[k] !== "");
// Treffer übernehmen: how = "replace" füllt die Position (ID, Menge und Option bleiben), "below" fügt eine neue Position darunter ein. Danach frei änderbar.
export function dbFill(of, pid, e, how = "replace") {
  const f = O.findPos(of, pid); if (!f) return null;
  const p = PD.cleanEntry(e), t = icZeit(p.ic);
  delete p.gl; delete p.bkp; // erbt die Position aus Knoten und Kapitel
  if (p.std === undefined && t !== undefined) p.std = t; // Zeit aus der eigenen IC-Tabelle (Schritt 4)
  if (how === "below") return O.copyPosition(of, f.g, p, f.i + 1);
  const n = { id: f.p.id, ...p };
  for (const k of ["menge", "opt", "an"]) if (f.p[k] !== undefined) n[k] = f.p[k];
  f.g.pos[f.i] = n; return n;
}

// ---------- Rechts: Kopf und Rechenwerte ----------
// profil = Firmenprofil des Benutzers (profil.js), Absender der Offerte
export function panelHTML(of, profil = null) {
  const t = O.totals(of);
  if (mode.ro) return `<div class="prop-head"><h2>Offerte${of.nr ? ` ${esc(of.nr)}` : ""}</h2><p>Geteilte Ansicht${mode.prices ? "" : ", ohne Preise"}.</p></div>`
    + `<section class="section">${[["Version", of.ver], ["Datum", of.datum], ["Gültig bis", of.gueltig], ["Abrechnungsart", O.ARTEN[of.art]], ["Bauart", O.BAUARTEN[of.bau]]].filter(([, v]) => v).map(([l, v]) => `<p class="of-psum">${esc(l)}<b>${esc(v)}</b></p>`).join("")}`
    + (mode.prices ? `<p class="of-psum">${totLabel(of)} <b>CHF ${O.fmtChf(t.total)}</b></p>` : "") + `</section>`;
  return `<div class="prop-head"><h2>Offerte</h2><p>Pflicht sind nur Text, Menge und Preis.</p></div>`
    + senderHTML(profil)
    + `<section class="section"><h2 class="section-title">Kopf</h2>${fld("Offertnummer", "o.nr", of.nr)}${fld("Version (Revision, Nachtrag)", "o.ver", of.ver)}${fld("Datum", "o.datum", of.datum)}${fld("Gültig bis", "o.gueltig", of.gueltig, { ph: "z. B. 3 Monate" })}`
    + `${sel("Abrechnungsart", "o.art", O.ARTEN, of.art, "–")}${sel("Bauart", "o.bau", O.BAUARTEN, of.bau, "–")}</section>`
    + `<section class="section"><h2 class="section-title">Rechenwerte</h2>${fld("Materialfaktor", "o.fak", of.fak, { num: true })}<div class="of-two">${fld("Stundenansatz CHF", "o.ansatz", of.ansatz, { num: true })}${fld("Zeitfaktor", "o.zf", of.zf, { num: true, ph: "1" })}</div>${fld("Gesamtrabatt %", "o.rabatt", of.rabatt, { num: true })}`
    + `<div class="of-two">${fld("Skonto %", "o.skonto", of.skonto, { num: true })}${fld("innert Tagen", "o.skTage", of.skTage, { num: true })}</div><label class="of-chk"><input type="checkbox" data-of="o.mwstan"${of.mwst ? " checked" : ""}> MwSt aufrechnen</label>${of.mwst ? fld("MwSt %", "o.mwst", of.mwst, { num: true }) : ""}`
    + `<div class="row"><button type="button" class="btn outline small" data-ofact="sollwerte" title="Ansatz und Faktor für neue Offerten, Rechnung der Preisbasis, IC-Zeiten (gilt für dein Konto, nicht nur diese Offerte)">Kalkulation Firmenwerte …</button></div></section>`
    + rgHTML(of)
    + outHTML()
    + `<section class="section"><h2 class="section-title">Summe</h2><p class="of-psum">${totLabel(of)} <b>CHF ${O.fmtChf(t.total)}</b></p></section>`;
}

// Ausgabe (Schritt 5): PDF und Excel, je mit oder ohne Preise. EK, Faktor, Zeit, Zeitfaktor und Ansatz kommen nie hinein.
const outHTML = () => `<section class="section"><h2 class="section-title">Ausgabe</h2><p class="note">Ohne EK, Faktor, Zeit und Ansatz.</p><div class="of-two">`
  + [["pdf", 1, "PDF mit Preisen"], ["pdf", 0, "PDF ohne Preise"], ["xlsx", 1, "Excel mit Preisen"], ["xlsx", 0, "Excel ohne Preise"]].map(([k, p, l]) => `<button type="button" class="btn outline small" data-ofact="out" data-kind="${k}" data-prices="${p}">${l}</button>`).join("")
  + `</div><div class="row"><button type="button" class="btn outline small" data-ofact="import" title="Bestehende Excel-Offerte einlesen: leere Offerte wird gefüllt, sonst entsteht ein neues Offerten-Modul">Excel-Offerte importieren …</button></div></section>`;

// Absender aus dem Firmenprofil (Schritt 2): nur Anzeige, geändert wird im Fenster «Firmenprofil» (gilt für alle Offerten und Module)
function senderHTML(p) {
  const lines = p ? profilLines(p) : [];
  return `<section class="section"><h2 class="section-title">Absender</h2>${lines.length ? `<p class="of-sender">${p.logo ? `<img src="${p.logo}" alt="Logo" class="of-logo"><br>` : ""}${lines.map(esc).join("<br>")}</p>` : `<p class="note">Noch kein Firmenprofil.</p>`}`
    + `<div class="row"><button type="button" class="btn outline small" data-ofact="profil">Firmenprofil …</button></div></section>`;
}

// Rabattgruppen (CJ 26.10.2026): selbst angelegt mit Buchstabe und Bezeichnung, Regel Gesamtrabatt / kein Rabatt / eigener Satz. Die Gruppe in der Tabelle wählt sie.
const RG_REGEL = { "": "Gesamtrabatt", kein: "kein Rabatt", eigen: "eigener Satz" };
function rgHTML(of) {
  const rows = of.rg.map((r) => { const reg = r.satz === undefined ? "" : r.satz === 0 ? "kein" : "eigen";
    return `<div class="of-rg">${inp(`r${r.id}.kz`, r.kz, { cls: "of-rgkz", ph: "R", lab: "Buchstabe" })}${inp(`r${r.id}.name`, r.name, { ph: "Bezeichnung", lab: "Bezeichnung" })}`
      + `<select data-of="r${r.id}.regel" aria-label="Regel">${opts(RG_REGEL, reg)}</select>${reg === "eigen" ? `${inp(`r${r.id}.satz`, r.satz, { cls: "of-pct", num: true, lab: "Satz in Prozent" })}<span>%</span>` : ""}`
      + `${btn("delrg", `data-r="${r.id}"`, "Rabattgruppe löschen", "×", "btn icon small danger")}</div>`; }).join("");
  return `<section class="section"><h2 class="section-title">Rabattgruppen</h2>${rows || `<p class="note">Ohne Rabattgruppe gilt überall der Gesamtrabatt.</p>`}${btn("addrg", "", "Rabattgruppe anlegen", "+ Rabattgruppe", "btn outline small")}</section>`;
}

// ---------- Änderungen ----------
// Zahl aus dem Feld: 1'234,50 und 1234.5 gehen, leer = nicht gesetzt
export const parseNum = (s) => { const t = String(s).replace(/['’\s]/g, "").replace(",", "."); if (!t) return undefined; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
const NUM = new Set(["menge", "preis", "ek", "fak", "std", "ansatz", "zf", "rabatt", "skonto", "skTage", "mwst"]);
function target(of, key) {
  const [ref, ...path] = key.split("."), id = Number(ref.slice(1));
  if (ref === "o") return { obj: of, f: path[0] };
  if (ref[0] === "r") { const r = of.rg.find((x) => x.id === id); return r && { obj: r, f: path[0] }; }
  if (ref[0] === "n") { const n = O.knFind(of, id); return n && { obj: n, f: path[0], kn: true }; }
  if (ref[0] === "k") { const k = of.kap.find((x) => x.id === id); return k && { obj: k, f: path[0] }; }
  if (ref[0] === "g") { const g = O.findGrp(of, id)?.g; return g && { obj: g, f: path[0] }; }
  const p = O.findPos(of, id)?.p; if (!p) return null;
  return { obj: p, f: path[0], p };
}
// Wert eines Felds übernehmen. Gibt false zurück, wenn nichts zu ändern ist (ungültige Zahl: Feld zeigt beim Neuzeichnen den alten Wert).
export function apply(of, el) {
  const tg = target(of, el.dataset.of); if (!tg) return false;
  const { obj, f } = tg, v = el.type === "checkbox" ? el.checked : el.value;
  if (tg.kn && f === "art") { if (v !== "rgl" && Object.hasOwn(O.GLIEDERUNG, v)) obj.art = v; else delete obj.art; return true; } // Art des Knotens, fehlt = Raum
  if (f === "opt") { if (v) obj.opt = true; else { delete obj.opt; delete obj.an; } return true; }
  if (f === "an") { if (v) obj.an = true; else delete obj.an; return true; }
  if (f === "rg") { const n = Number(v); if (n && of.rg.some((r) => r.id === n)) obj.rg = n; else delete obj.rg; return true; }
  if (f === "regel") { if (v === "kein") obj.satz = 0; else if (v === "eigen") obj.satz = obj.satz || of.rabatt || 0; else delete obj.satz; return true; }
  if (f === "satz") { const n = parseNum(v); if (!(n >= 0 && n <= 100)) return false; obj.satz = n; return true; }
  // IC-Code (Schritt 4): Zeit aus der eigenen IC-Tabelle vorbelegen, wenn die Position keine eigene Zeit hat (leer oder die Zeit des bisherigen IC-Codes)
  if (f === "ic" && tg.p) {
    const t = loadIcZeiten(), old = icZeit(obj.ic, t), s = String(v).trim(), nu = icZeit(s, t);
    if (s) obj.ic = s; else delete obj.ic;
    if (nu !== undefined && (obj.std === undefined || obj.std === old)) obj.std = nu;
    return true;
  }
  if (f === "kz") { obj.kz = String(v).trim().slice(0, 3); return true; }
  if (f === "typ") { if (v === "regie") { if (!obj.eh) obj.eh = "h"; if (obj.std === undefined) obj.std = 1; } if (v && v !== "lp") obj.typ = v; else delete obj.typ; return true; }
  if (f === "form") { if (v && v !== "r") obj.form = v; else delete obj.form; return true; }
  if (NUM.has(f)) {
    const n = parseNum(v);
    if (Number.isNaN(n) || (n !== undefined && n < 0 && f !== "menge" && f !== "preis")) return false;
    if (obj === of && f === "zf") { if (n === undefined || n === 1) delete of.zf; else if (n >= 0.01 && n <= 10) of.zf = n; else return false; return true; } // Zeitfaktor: leer = 1
    if (obj === of) { if (n === undefined) { if (f === "skTage") delete of.skTage; else of[f] = O.DEF[f]; } else of[f] = n; return true; }
    if (n === undefined) delete obj[f]; else obj[f] = n;
    return true;
  }
  if (obj === of && (f === "art" || f === "bau")) { of[f] = v; return true; }
  if (obj === of && f === "mwstan") { of.mwst = v ? of.mwst || O.DEF.mwst : 0; return true; }
  const s = f === "text" ? String(v) : String(v).trim();
  if (obj === of || tg.kn || "grp" in obj || "pos" in obj || of.rg.includes(obj)) obj[f] = s; // Kopf, Knoten, Kapitel, Gruppe: Feld bleibt (leer erlaubt)
  else if (s) obj[f] = s; else delete obj[f];
  return true;
}
// Knopf: gibt { fn, focus } (ändert Daten, Fokus danach auf data-of="focus") oder { ui: true } (nur neu zeichnen) zurück
export function action(of, b) {
  const a = b.dataset.ofact, pid = Number(b.dataset.p), gid = Number(b.dataset.g), kid = Number(b.dataset.k);
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
  if (a === "det") { if (open.has(pid)) open.delete(pid); else open.add(pid); return { ui: true, focus: null, keep: `[data-ofact="det"][data-p="${pid}"]` }; }
  const nid = Number(b.dataset.n);
  if (a === "bkpopen") { areas(of).bkp = true; return { ui: true, left: true, keep: "#of-bkpfind" }; }
  if (a === "area") { const ar = areas(of), k = b.dataset.area; ar[k] = !ar[k]; return { ui: true, left: true, keep: `[data-ofact="area"][data-area="${k}"]` }; }
  if (a === "knsel") { selKn = O.knFind(of, nid) ? nid : 0; areas(of); return { ui: true, left: true, top: true, keep: `[data-ofact="knsel"][data-n="${selKn}"]` }; }
  if (a === "knadd") { let n; return { fn: () => { n = O.addKnoten(of, Number(b.dataset.up) || 0); selKn = n.id; }, focus: () => `n${n.id}.titel` }; }
  if (a === "kndel") return { fn: () => { const up = O.knFind(of, nid)?.up || 0; O.delKnoten(of, nid); selKn = up; } };
  if (a === "knmove") return { fn: () => { O.moveKnoten(of, nid, b.dataset.how); }, keep: `[data-ofact="knmove"][data-how="${b.dataset.how}"]` };
  if (a === "addrg") { let r; return { fn: () => { r = O.addRabattgruppe(of); }, focus: () => `r${r.id}.kz` }; }
  if (a === "delrg") return { fn: () => { O.delRabattgruppe(of, Number(b.dataset.r)); } };
  if (a === "addkap") { let k; return { fn: () => { k = O.addKapitel(of, b.dataset.bkp, undefined, selKn); }, focus: () => (b.dataset.bkp ? `g${k.grp[0].id}.titel` : `k${k.id}.bkp`) }; }
  if (a === "addgrp") { let g; return { fn: () => { g = O.addGruppe(of, of.kap.find((k) => k.id === kid)); }, focus: () => `g${g.id}.titel` }; }
  if (a === "addpos") { let p; return { fn: () => { p = O.addPosition(of, O.findGrp(of, gid).g, {}); }, focus: () => `p${p.id}.titel` }; }
  if (a === "cpos") { let p; return { fn: () => { const f = O.findPos(of, pid); p = O.copyPosition(of, f.g, f.p, f.i + 1); }, focus: () => `p${p.id}.titel` }; }
  if (a === "delpos") return { fn: () => { const f = O.findPos(of, pid); f.g.pos.splice(f.i, 1); open.delete(pid); } };
  if (a === "delgrp") return { fn: () => { const f = O.findGrp(of, gid); f.k.grp.splice(f.i, 1); } };
  if (a === "delkap") return { fn: () => { of.kap.splice(of.kap.findIndex((k) => k.id === kid), 1); } };
  if (a === "pup" || a === "pdown") return { fn: () => { const f = O.findPos(of, pid); move(f.g.pos, f.i, a === "pup" ? -1 : 1); }, keep: `[data-ofact="${a}"][data-p="${pid}"]` };
  if (a === "gup" || a === "gdown") return { fn: () => { const f = O.findGrp(of, gid); move(f.k.grp, f.i, a === "gup" ? -1 : 1); }, keep: `[data-ofact="${a}"][data-g="${gid}"]` };
  if (a === "kup" || a === "kdown") return { fn: () => { // nur unter den Kapiteln desselben Knotens
    const k = of.kap.find((x) => x.id === kid), sib = of.kap.filter((x) => (x.kn || 0) === (k.kn || 0)), o = sib[sib.indexOf(k) + (a === "kup" ? -1 : 1)]; if (!o) return;
    const i = of.kap.indexOf(k), j = of.kap.indexOf(o); [of.kap[i], of.kap[j]] = [of.kap[j], of.kap[i]]; }, keep: `[data-ofact="${a}"][data-k="${kid}"]` };
  return null;
}
