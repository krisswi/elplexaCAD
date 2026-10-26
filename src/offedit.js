// Modul «Offerten» (CJ 26.10.2026), Schritt 1: Bedienung. Die Offerte ist eine Tabelle statt einer Zeichenfläche (#of-view über dem Blatt).
// Links der BKP-Katalog (Klick legt ein Kapitel an), rechts Kopf und Rechenwerte, in der Mitte Kapitel → Gruppen → Positionen und die Schlusszusammenstellung.
// Felder tragen data-of="<Ziel>.<Feld>" (o = Offerte, k/g/p + ID), Knöpfe data-ofact. apply() und action() ändern nur die Daten, die App zeichnet neu (change).
import { esc } from "./render.js";
import * as O from "./offerte.js";

const open = new Set(); // Positionen mit aufgeklappten Angaben (nur Anzeige, nicht in der Datei)
let bkpFind = "";
const val = (v) => (v === undefined || v === null ? "" : esc(String(v)));
const opts = (set, cur, empty) => (empty !== undefined ? `<option value="">${esc(empty)}</option>` : "") + Object.entries(set).map(([k, l]) => `<option value="${k}"${k === cur ? " selected" : ""}>${esc(l)}</option>`).join("");
const inp = (key, v, { cls = "", ph = "", num = false, lab = "" } = {}) => `<input type="text"${num ? ' inputmode="decimal"' : ""} class="${cls}" data-of="${key}" value="${val(v)}"${ph ? ` placeholder="${esc(ph)}"` : ""}${lab ? ` aria-label="${esc(lab)}"` : ""} autocomplete="off" spellcheck="false">`;
const fld = (label, key, v, o = {}) => `<div class="field"><label for="of-${key}">${esc(label)}</label>${inp(key, v, o).replace("<input ", `<input id="of-${key}" `)}</div>`;
const sel = (label, key, set, cur, empty) => `<div class="field"><label for="of-${key}">${esc(label)}</label><select id="of-${key}" data-of="${key}">${opts(set, cur, empty)}</select></div>`;
const btn = (act, attrs, label, txt, cls = "btn icon small") => `<button type="button" class="${cls}" data-ofact="${act}" ${attrs} title="${esc(label)}" aria-label="${esc(label)}">${txt}</button>`;

// ---------- Mitte: Gliederung und Positionen ----------
export function viewHTML(of) {
  const t = O.totals(of);
  let h = `<div class="of-wrap"><div class="of-title"><h1>Offerte${of.nr ? ` ${esc(of.nr)}` : ""}</h1><p>${[of.ver && `Version ${esc(of.ver)}`, of.datum && esc(of.datum), of.art && esc(O.ARTEN[of.art]), of.bau && esc(O.BAUARTEN[of.bau])].filter(Boolean).join(" · ") || "Kopf und Rechenwerte rechts"}</p></div>`;
  if (!of.kap.length) h += `<p class="of-empty">Noch kein Kapitel. Links ein BKP-Kapitel wählen oder ein eigenes anlegen.</p>`;
  of.kap.forEach((k, ki) => {
    h += `<section class="of-kap" aria-label="Kapitel ${esc(k.bkp)} ${esc(k.titel)}"><div class="of-kh">${inp(`k${k.id}.bkp`, k.bkp, { cls: "of-bkp", ph: "BKP", lab: "BKP-Nummer" })}${inp(`k${k.id}.titel`, k.titel, { cls: "of-kt", ph: "Titel des Kapitels", lab: "Titel des Kapitels" })}`
      + `<span class="of-acts">${btn("kup", `data-k="${k.id}"`, "Kapitel nach oben", "↑")}${btn("kdown", `data-k="${k.id}"`, "Kapitel nach unten", "↓")}${btn("addgrp", `data-k="${k.id}"`, "Gruppe hinzufügen (z. B. Raum, Wohnung)", "+ Gruppe", "btn outline small")}${btn("delkap", `data-k="${k.id}"`, "Kapitel löschen", "×", "btn icon small danger")}</span></div>`;
    k.grp.forEach((g, gi) => {
      const eigen = O.isNumber(g.rab);
      h += `<div class="of-grp"><div class="of-gh">${inp(`g${g.id}.titel`, g.titel, { cls: "of-gt", ph: k.grp.length > 1 ? "Gruppe (z. B. Raum, Wohnung)" : "Gruppe ohne Titel (z. B. Raum, Wohnung)", lab: "Titel der Gruppe" })}`
        + `<label class="of-rab"><span>Rabatt</span><select data-of="g${g.id}.rab" aria-label="Rabatt der Gruppe"><option value=""${g.rab === undefined ? " selected" : ""}>Gesamtrabatt gilt</option><option value="nein"${g.rab === false ? " selected" : ""}>gilt nicht</option><option value="eigen"${eigen ? " selected" : ""}>eigener Satz</option></select>${eigen ? `${inp(`g${g.id}.rabp`, g.rab, { cls: "of-pct", num: true, lab: "Eigener Rabattsatz in Prozent" })}<span>%</span>` : ""}</label>`
        + `<span class="of-acts">${btn("gup", `data-g="${g.id}"`, "Gruppe nach oben", "↑")}${btn("gdown", `data-g="${g.id}"`, "Gruppe nach unten", "↓")}${btn("delgrp", `data-g="${g.id}"`, "Gruppe löschen", "×", "btn icon small danger")}</span></div>`;
      h += `<table class="of-tab"><thead><tr><th class="c-pos">Pos</th><th class="c-txt">Text</th><th class="c-ic">IC</th><th class="c-n">Menge</th><th class="c-eh">EH</th><th class="c-n">Preis</th><th class="c-n">Betrag</th><th class="c-opt" title="Optionale Position">Opt.</th><th class="c-act"><span class="sr">Aktionen</span></th></tr></thead><tbody>`;
      g.pos.forEach((p, pi) => { h += posRow(of, t, p, `${ki + 1}.${gi + 1}.${pi + 1}`); });
      h += `</tbody><tfoot><tr><td colspan="6">${btn("addpos", `data-g="${g.id}"`, "Position hinzufügen", "+ Position", "btn outline small")}</td><td class="c-n of-sum">${O.fmtChf(t.grp.get(g.id) || 0)}</td><td colspan="2"></td></tr></tfoot></table></div>`;
    });
    const ks = t.kap[ki];
    h += `<div class="of-ksum"><span>Total ${esc(k.titel || "")} BKP ${esc(O.bkpMain(k.bkp) || k.bkp)}</span><b>${O.fmtChf(ks.summe)}</b></div></section>`;
  });
  return h + summaryHTML(of, t) + `</div>`;
}
function posRow(of, t, p, no) {
  const id = p.id, k = (f) => `p${id}.${f}`, ep = O.unitPrice(p, of), det = open.has(id), off = p.opt && !p.an;
  let h = `<tr class="of-pos${off ? " off" : ""}" data-pid="${id}"><td class="c-pos">${esc(p.npk || no)}</td>`
    + `<td class="c-txt">${inp(k("titel"), p.titel, { cls: "of-pt", ph: "Text", lab: "Text der Position" })}<textarea data-of="${k("text")}" rows="1" placeholder="Beschreibung" aria-label="Beschreibung">${val(p.text)}</textarea></td>`
    + `<td class="c-ic">${inp(k("ic"), p.ic, { lab: "IC-Code" })}</td><td class="c-n">${inp(k("menge"), p.menge, { num: true, lab: "Menge" })}</td><td class="c-eh">${inp(k("eh"), p.eh, { ph: "Stk", lab: "Einheit" })}</td>`
    + `<td class="c-n">${inp(k("preis"), p.preis, { num: true, ph: ep ? O.fmtChf(ep) : "", lab: "Einheitspreis (leer = aus EK und Zeit)" })}</td>`
    + `<td class="c-n of-amt">${O.fmtChf(t.pos.get(id) || 0)}</td>`
    + `<td class="c-opt"><input type="checkbox" data-of="${k("opt")}"${p.opt ? " checked" : ""} aria-label="Optionale Position" title="Optionale Position">${p.opt ? `<label class="of-an" title="Option in die Angebotssumme nehmen"><input type="checkbox" data-of="${k("an")}"${p.an ? " checked" : ""}><span>aktiv</span></label>` : ""}</td>`
    + `<td class="c-act">${btn("det", `data-p="${id}" aria-expanded="${det}"`, det ? "Angaben zuklappen" : "Weitere Angaben: NPK, Typ, Form, EK, Zeit, Gliederung", "⋯")}${btn("pup", `data-p="${id}"`, "Position nach oben", "↑")}${btn("pdown", `data-p="${id}"`, "Position nach unten", "↓")}${btn("cpos", `data-p="${id}"`, "Position kopieren", "⧉")}${btn("delpos", `data-p="${id}"`, "Position löschen", "×", "btn icon small danger")}</td></tr>`;
  if (det) {
    const f = (label, key, v, o = {}) => `<label class="of-df"><span>${esc(label)}</span>${inp(k(key), v, { ...o, lab: label })}</label>`;
    const s = (label, key, set, cur, empty) => `<label class="of-df"><span>${esc(label)}</span><select data-of="${k(key)}" aria-label="${esc(label)}">${opts(set, cur, empty)}</select></label>`;
    h += `<tr class="of-det"><td></td><td colspan="8"><div class="of-dgrid">${f("NPK-Nr.", "npk", p.npk, { ph: "X XX.XXX.XXX.XXX.XX" })}${f("BKP", "bkp", p.bkp)}${s("Typ", "typ", O.TYPEN, p.typ || "lp")}${s("Form", "form", O.FORMEN, p.form || "r")}`
      + `${f("Hersteller", "her", p.her)}${f("E-Nr.", "enr", p.enr)}${f("EK-Preis", "ek", p.ek, { num: true })}${f("Faktor", "fak", p.fak, { num: true, ph: O.fmtNum(of.fak) })}${f("Zeit h je EH", "std", p.std, { num: true })}`
      + Object.entries(O.GLIEDERUNG).map(([gk, gl]) => `<label class="of-df"><span>${esc(gl)}</span>${inp(`${k("gl")}.${gk}`, p.gl?.[gk], { lab: gl })}</label>`).join("")
      + `</div></td></tr>`;
  }
  return h;
}
function summaryHTML(of, t) {
  if (!of.kap.length) return "";
  const row = (a, b, cls = "") => `<tr${cls ? ` class="${cls}"` : ""}><td>${a}</td><td class="c-n">${b}</td></tr>`;
  let h = `<section class="of-end" aria-label="Schlusszusammenstellung"><h2>Schlusszusammenstellung</h2><table class="of-stab"><tbody>`;
  for (const k of t.kap) h += row(`BKP ${esc(k.bkp)} ${esc(k.titel)}`, O.fmtChf(k.summe));
  h += row("Zwischensumme", O.fmtChf(t.zwischensumme), "of-strong");
  for (const r of t.rabatt) h += row(`Rabatt ${O.fmtNum(r.satz)} % auf ${O.fmtChf(r.basis)}`, `− ${O.fmtChf(r.betrag)}`);
  if (t.rabatt.length) h += row("Total nach Rabatt", O.fmtChf(t.netto));
  h += row(`MwSt ${O.fmtNum(of.mwst)} %`, O.fmtChf(t.mwst));
  h += row("Total inkl. MwSt", O.fmtChf(t.total), "of-total");
  h += `</tbody></table>`;
  if (t.skonto) h += `<p class="of-note">Skonto ${O.fmtNum(t.skonto.satz)} %${t.skonto.tage ? ` bei Zahlung innert ${t.skonto.tage} Tagen` : ""}: CHF ${O.fmtChf(t.skonto.betrag)}</p>`;
  if (t.optionen) h += `<p class="of-note">Optionen (nicht in der Angebotssumme): CHF ${O.fmtChf(t.optionen)}</p>`;
  return h + `</section>`;
}

// ---------- Links: BKP-Katalog ----------
export function leftHTML() {
  const q = bkpFind.trim().toLowerCase(), list = O.BKP.filter(([n, l]) => !q || n.startsWith(q) || l.toLowerCase().includes(q));
  return `<section class="section"><h2 class="section-title">Kapitel nach BKP</h2><p class="note">Klick legt das Kapitel in der Offerte an.</p>`
    + `<div class="field"><input type="text" id="of-bkpfind" value="${val(bkpFind)}" placeholder="BKP suchen: Nummer oder Text" aria-label="BKP suchen" autocomplete="off" spellcheck="false"></div>`
    + `<div class="of-bkplist" role="list">${list.map(([n, l]) => `<button type="button" class="of-bkpi lv${n.split(".")[1]?.length || (n.length > 2 ? 0 : -1)}" role="listitem" data-ofact="addkap" data-bkp="${n}"><b>${n}</b><span>${esc(l)}</span></button>`).join("") || `<p class="note">Kein Treffer.</p>`}</div>`
    + `<button type="button" class="btn outline small" data-ofact="addkap" data-bkp="">Eigenes Kapitel</button></section>`;
}
export const setBkpFind = (s) => { bkpFind = s; };

// ---------- Rechts: Kopf und Rechenwerte ----------
export function panelHTML(of) {
  const t = O.totals(of);
  return `<div class="prop-head"><h2>Offerte</h2><p>Pflicht sind nur Text, Menge und Preis.</p></div>`
    + `<section class="section"><h2 class="section-title">Kopf</h2>${fld("Offertnummer", "o.nr", of.nr)}${fld("Version (Revision, Nachtrag)", "o.ver", of.ver)}${fld("Datum", "o.datum", of.datum)}${fld("Gültig bis", "o.gueltig", of.gueltig, { ph: "z. B. 3 Monate" })}`
    + `${sel("Abrechnungsart", "o.art", O.ARTEN, of.art, "–")}${sel("Bauart", "o.bau", O.BAUARTEN, of.bau, "–")}</section>`
    + `<section class="section"><h2 class="section-title">Rechenwerte</h2>${fld("Materialfaktor", "o.fak", of.fak, { num: true })}${fld("Stundenansatz CHF", "o.ansatz", of.ansatz, { num: true })}${fld("Gesamtrabatt %", "o.rabatt", of.rabatt, { num: true })}`
    + `<div class="of-two">${fld("Skonto %", "o.skonto", of.skonto, { num: true })}${fld("innert Tagen", "o.skTage", of.skTage, { num: true })}</div>${fld("MwSt %", "o.mwst", of.mwst, { num: true })}</section>`
    + `<section class="section"><h2 class="section-title">Summe</h2><p class="of-psum">Total inkl. MwSt <b>CHF ${O.fmtChf(t.total)}</b></p></section>`;
}

// ---------- Änderungen ----------
// Zahl aus dem Feld: 1'234,50 und 1234.5 gehen, leer = nicht gesetzt
export const parseNum = (s) => { const t = String(s).replace(/['’\s]/g, "").replace(",", "."); if (!t) return undefined; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
const NUM = new Set(["menge", "preis", "ek", "fak", "std", "ansatz", "rabatt", "skonto", "skTage", "mwst", "rabp"]);
function target(of, key) {
  const [ref, ...path] = key.split("."), id = Number(ref.slice(1));
  if (ref === "o") return { obj: of, f: path[0] };
  if (ref[0] === "k") { const k = of.kap.find((x) => x.id === id); return k && { obj: k, f: path[0] }; }
  if (ref[0] === "g") { const g = O.findGrp(of, id)?.g; return g && { obj: g, f: path[0] }; }
  const p = O.findPos(of, id)?.p; if (!p) return null;
  if (path[0] === "gl") return { obj: p, f: "gl", sub: path[1], p };
  return { obj: p, f: path[0], p };
}
// Wert eines Felds übernehmen. Gibt false zurück, wenn nichts zu ändern ist (ungültige Zahl: Feld zeigt beim Neuzeichnen den alten Wert).
export function apply(of, el) {
  const tg = target(of, el.dataset.of); if (!tg) return false;
  const { obj, f } = tg, v = el.type === "checkbox" ? el.checked : el.value;
  if (f === "gl") { const s = String(v).trim(); obj.gl ||= {}; if (s) obj.gl[tg.sub] = s; else delete obj.gl[tg.sub]; if (!Object.keys(obj.gl).length) delete obj.gl; return true; }
  if (f === "opt") { if (v) obj.opt = true; else { delete obj.opt; delete obj.an; } return true; }
  if (f === "an") { if (v) obj.an = true; else delete obj.an; return true; }
  if (f === "rab") { if (v === "nein") obj.rab = false; else if (v === "eigen") obj.rab = O.isNumber(obj.rab) ? obj.rab : of.rabatt || 0; else delete obj.rab; return true; }
  if (f === "rabp") { const n = parseNum(v); if (!(n >= 0 && n <= 100)) return false; obj.rab = n; return true; }
  if (f === "typ") { if (v === "regie") { if (!obj.eh) obj.eh = "h"; if (obj.std === undefined) obj.std = 1; } if (v && v !== "lp") obj.typ = v; else delete obj.typ; return true; }
  if (f === "form") { if (v && v !== "r") obj.form = v; else delete obj.form; return true; }
  if (NUM.has(f)) {
    const n = parseNum(v);
    if (Number.isNaN(n) || (n !== undefined && n < 0 && f !== "menge" && f !== "preis")) return false;
    if (obj === of) { if (n === undefined) { if (f === "skTage") delete of.skTage; else of[f] = O.DEF[f]; } else of[f] = n; return true; }
    if (n === undefined) delete obj[f]; else obj[f] = n;
    return true;
  }
  if (obj === of && (f === "art" || f === "bau")) { of[f] = v; return true; }
  const s = f === "text" ? String(v) : String(v).trim();
  if (obj === of || "grp" in obj || "pos" in obj) obj[f] = s; // Kopf, Kapitel, Gruppe: Feld bleibt (leer erlaubt)
  else if (s) obj[f] = s; else delete obj[f];
  return true;
}
// Knopf: gibt { fn, focus } (ändert Daten, Fokus danach auf data-of="focus") oder { ui: true } (nur neu zeichnen) zurück
export function action(of, b) {
  const a = b.dataset.ofact, pid = Number(b.dataset.p), gid = Number(b.dataset.g), kid = Number(b.dataset.k);
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
  if (a === "det") { if (open.has(pid)) open.delete(pid); else open.add(pid); return { ui: true, focus: null, keep: `[data-ofact="det"][data-p="${pid}"]` }; }
  if (a === "addkap") { let k; return { fn: () => { k = O.addKapitel(of, b.dataset.bkp); }, focus: () => (b.dataset.bkp ? `g${k.grp[0].id}.titel` : `k${k.id}.bkp`) }; }
  if (a === "addgrp") { let g; return { fn: () => { g = O.addGruppe(of, of.kap.find((k) => k.id === kid)); }, focus: () => `g${g.id}.titel` }; }
  if (a === "addpos") { let p; return { fn: () => { p = O.addPosition(of, O.findGrp(of, gid).g, {}); }, focus: () => `p${p.id}.titel` }; }
  if (a === "cpos") { let p; return { fn: () => { const f = O.findPos(of, pid); p = O.copyPosition(of, f.g, f.p, f.i + 1); }, focus: () => `p${p.id}.titel` }; }
  if (a === "delpos") return { fn: () => { const f = O.findPos(of, pid); f.g.pos.splice(f.i, 1); open.delete(pid); } };
  if (a === "delgrp") return { fn: () => { const f = O.findGrp(of, gid); f.k.grp.splice(f.i, 1); } };
  if (a === "delkap") return { fn: () => { of.kap.splice(of.kap.findIndex((k) => k.id === kid), 1); } };
  if (a === "pup" || a === "pdown") return { fn: () => { const f = O.findPos(of, pid); move(f.g.pos, f.i, a === "pup" ? -1 : 1); }, keep: `[data-ofact="${a}"][data-p="${pid}"]` };
  if (a === "gup" || a === "gdown") return { fn: () => { const f = O.findGrp(of, gid); move(f.k.grp, f.i, a === "gup" ? -1 : 1); }, keep: `[data-ofact="${a}"][data-g="${gid}"]` };
  if (a === "kup" || a === "kdown") return { fn: () => { move(of.kap, of.kap.findIndex((k) => k.id === kid), a === "kup" ? -1 : 1); }, keep: `[data-ofact="${a}"][data-k="${kid}"]` };
  return null;
}
