// Suchen und Ersetzen über alle Blätter. Bereich "bmk": nur Betriebsmittelkennzeichen, "alle": auch Attribute, Klemmenname und freie Texte.
// Ersetzte BMK von Geräten und Klemmen werden manuell (manual), sonst würde die Auto-Nummerierung sie zurücksetzen.
import { SYMBOL_BY_NAME } from "./symbols.js";
import { esc } from "./render.js";

const SKIP = new Set(["ZIEL"]); // automatisch berechnet

// Alle durchsuchbaren Felder: { get, set, sheet, id, label, bmk }
function* fields(doc, scope) {
  for (const [si, sh] of doc.sheets.entries()) for (const it of sh.items) {
    const at = (get, set, label, bmk) => ({ get, set, sheet: si, id: it.id, label, bmk });
    if (it.type === "symbol") {
      for (const a of SYMBOL_BY_NAME[it.sym]?.attrs ?? []) {
        if (SKIP.has(a.tag) || (scope === "bmk" && a.tag !== "BMK")) continue;
        yield at(() => it.attrs[a.tag], (v) => { it.attrs[a.tag] = v; if (a.tag === "BMK") it.manual = true; }, a.tag === "BMK" ? "BMK" : a.label, a.tag === "BMK");
      }
    } else if (it.type === "terminals") {
      yield at(() => it.bmk, (v) => { it.bmk = v; it.manual = true; }, "BMK Klemmen", true);
      if (scope === "alle") yield at(() => it.name, (v) => { it.name = v; }, "Name Klemmen", false);
    } else if (it.type === "text" && scope === "alle") {
      yield at(() => it.s, (v) => { it.s = v; }, "Text", false);
    }
  }
}

const rx = (q, matchCase) => new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), matchCase ? "g" : "gi");

// Treffer: [{ sheet, id, label, value }]
export function findHits(doc, q, { scope = "bmk", matchCase = false } = {}) {
  if (!q) return [];
  const re = rx(q, matchCase), out = [];
  for (const f of fields(doc, scope)) { const v = String(f.get() ?? ""); re.lastIndex = 0; if (re.test(v)) out.push({ sheet: f.sheet, id: f.id, label: f.label, value: v }); }
  return out;
}

// Ersetzt in allen Treffern. Gibt die Anzahl geänderter Felder zurück.
export function replaceAll(doc, q, repl, { scope = "bmk", matchCase = false } = {}) {
  if (!q) return 0;
  const re = rx(q, matchCase);
  let n = 0;
  for (const f of fields(doc, scope)) {
    const v = String(f.get() ?? ""); re.lastIndex = 0;
    if (!re.test(v)) continue;
    re.lastIndex = 0;
    f.set(v.replace(re, () => repl)); n++;
  }
  return n;
}

// Suchfenster (ohne abgedunkelten Hintergrund, die Zeichenfläche bleibt bedienbar).
// ctx: { doc(), goto(sheet, id), replace(fn) → führt fn als eine Änderung aus (Rückgängig), toast(msg) }
export function openSearch(ctx) {
  const root = document.querySelector("#modal-root");
  if (root.querySelector(".searchbox")) { root.querySelector("[data-s=q]").focus(); return; }
  const box = document.createElement("div");
  box.className = "searchbox"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Suchen und Ersetzen");
  box.innerHTML = `<h2>Suchen und Ersetzen</h2>
    <div class="field"><label>Suchen</label><input type="text" data-s="q" autocomplete="off" spellcheck="false"></div>
    <div class="field"><label>Ersetzen durch</label><input type="text" data-s="r" autocomplete="off" spellcheck="false"></div>
    <div class="field"><label>Bereich</label><select data-s="scope"><option value="bmk">Nur BMK</option><option value="alle">Alle Texte</option></select></div>
    <label class="chk"><input type="checkbox" data-s="case"> Gross-/Kleinschreibung beachten</label>
    <div class="hits" data-s="hits"></div>
    <div class="actions"><button class="btn outline" data-s="close">Schliessen</button><button class="btn" data-s="next">Weiter</button><button class="btn primary" data-s="all">Alle ersetzen</button></div>`;
  root.appendChild(box);
  const g = (k) => box.querySelector(`[data-s=${k}]`);
  let hits = [], cur = -1;
  const opts = () => ({ scope: g("scope").value, matchCase: g("case").checked });
  const show = () => {
    hits = findHits(ctx.doc(), g("q").value, opts());
    cur = Math.min(cur, hits.length - 1);
    g("hits").innerHTML = g("q").value ? (hits.length ? `${hits.length} Treffer` : "Keine Treffer") + hits.slice(0, 50).map((h, i) => `<button class="hit${i === cur ? " on" : ""}" data-i="${i}">Blatt ${esc(String(ctx.doc().sheets[h.sheet].meta.BLATT || h.sheet + 1))}: ${esc(h.label)} = ${esc(h.value)}</button>`).join("") + (hits.length > 50 ? `<div class="more">… ${hits.length - 50} weitere (mit „Weiter“ erreichbar)</div>` : "") : "";
  };
  const jump = (i) => { cur = i; const h = hits[i]; if (h) ctx.goto(h.sheet, h.id); show(); };
  const close = () => box.remove();
  const replaceAllNow = () => {
    if (!g("q").value) return;
    let n = 0;
    ctx.replace(() => { n = replaceAll(ctx.doc(), g("q").value, g("r").value, opts()); });
    ctx.toast(n ? `${n} ${n === 1 ? "Feld" : "Felder"} ersetzt.` : "Keine Treffer.");
    show();
  };
  box.addEventListener("input", () => { cur = -1; show(); });
  box.addEventListener("change", () => { cur = -1; show(); });
  box.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.i !== undefined) jump(Number(b.dataset.i));
    else if (b.dataset.s === "next") hits.length && jump((cur + 1) % hits.length);
    else if (b.dataset.s === "all") replaceAllNow();
    else if (b.dataset.s === "close") close();
  });
  box.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") close();
    else if (e.key === "Enter") { e.preventDefault(); hits.length && jump((cur + 1) % hits.length); }
  });
  g("q").focus();
}
