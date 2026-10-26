// Sollwert-Einstellungen und IC-Zeiten beim Benutzer (Offerte Schritt 4, CJ 26.10.2026). Gespeichert über die Speicherschicht
// (ablage.js, Namen "sollwerte" und "iczeiten"), nicht am Projekt. Jedes Feld darf leer bleiben (leer = 0 oder entfällt).
// Einfacher Modus: Stundenansatz und Materialfaktor direkt. Erweiterter Modus: Rechnung der Preisbasis je Rolle bis zum Sollerlös je Stunde,
// dazu Regiesatz, TB-C-Anteil je Installationsart und Materialfaktor aus den Zuschlägen. Eine neue Offerte übernimmt Ansatz und Faktor (offerDefaults).
// Datenformat sollwerte = { modus: "einfach" | "erweitert", ansatz, fak,
//   lohn: { pl, eli, mon, svc } (EK-Stundenlohn CHF/h), pzk (% vom Lohn), ugk (übrige Gemeinkosten CHF/h), vvgk, soko (% der Herstellkosten), rg (Risiko und Gewinn, % der Selbstkosten),
//   tbcSatz (CHF/h, leer = Sollerlös Projektleiter/TB-C), tbc: { e, n, a, s } (h TB-C je Installationsstunde), tbcRegie (h je Regiestunde),
//   rolle, art (Ansatz der Offerte: Sollerlös dieser Rolle + TB-C-Anteil dieser Installationsart), mat: { gkA, gkL, lager, vvgk, rg } (%) }
// iczeiten = { rows: [{ ic, std, text }] }   IC-Code → Zeit in h je Einheit, vom Benutzer selbst eingetragen (keine NPK-Richtwerte).
import * as A from "./ablage.js";
import { esc } from "./render.js";

export const ROLLEN = { pl: "Projektleiter/TB-C", eli: "Elektroinstallateur", mon: "Monteur/Lernende", svc: "Serviceinstallateur/Spezialist" };
export const INSTARTEN = { e: "einfach", n: "normal", a: "anspruchsvoll", s: "Spezialist" };
const PCT = ["pzk", "vvgk", "soko", "rg"], MAT = ["gkA", "gkL", "lager", "vvgk", "rg"];

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const num = (v, hi = 1e6) => (isNum(v) && v >= 0 && v <= hi ? v : undefined);
const put = (o, k, v) => { if (v !== undefined) o[k] = v; };
// Auf den Rappen, toFixed glättet Binärreste. Jede Zeile der Rechnung wird gerundet, die Summen rechnen mit den gerundeten Zeilen (wie im Beispiel).
export const r2 = (x) => Math.round(Number((x * 100).toFixed(6))) / 100;

export function cleanSollwerte(o) {
  o = o && typeof o === "object" ? o : {};
  const s = { modus: o.modus === "erweitert" ? "erweitert" : "einfach" };
  put(s, "ansatz", num(o.ansatz, 10000)); put(s, "fak", num(o.fak, 100));
  for (const k of PCT) put(s, k, num(o[k], 1000));
  put(s, "ugk", num(o.ugk, 10000)); put(s, "tbcSatz", num(o.tbcSatz, 10000)); put(s, "tbcRegie", num(o.tbcRegie, 10));
  const sub = (src, keys, hi) => { const x = {}; for (const k of keys) put(x, k, num(src?.[k], hi)); return Object.keys(x).length ? x : undefined; };
  put(s, "lohn", sub(o.lohn, Object.keys(ROLLEN), 10000)); put(s, "tbc", sub(o.tbc, Object.keys(INSTARTEN), 10)); put(s, "mat", sub(o.mat, MAT, 1000));
  if (Object.hasOwn(ROLLEN, o.rolle)) s.rolle = o.rolle;
  if (Object.hasOwn(INSTARTEN, o.art)) s.art = o.art;
  return s;
}

// Rechnung der Preisbasis für eine Rolle (null ohne Lohn). Zeilenfolge (Zusammenfassung Final, Lesart zur Prüfung durch CJ):
// Lohn + PZK (% vom Lohn) + üGK (CHF/h) = Herstellkosten; + VVGK + SoKo (beide % der Herstellkosten) = Selbstkosten; + R+G (% der Selbstkosten) = Sollerlös Installationsstunde.
// Regie ohne SoKo: Herstellkosten + VVGK = Selbstkosten Regie; + R+G = Regie ohne TB-C; + TB-C-Satz × TB-C-Zeit je Regiestunde = Sollerlös Regie.
export function rolle(s, key) {
  const lohn = s.lohn?.[key];
  if (!isNum(lohn)) return null;
  const pc = (k) => (s[k] || 0) / 100;
  const pzk = r2(lohn * pc("pzk")), ugk = r2(s.ugk || 0), hk = r2(lohn + pzk + ugk);
  const vvgk = r2(hk * pc("vvgk")), soko = r2(hk * pc("soko")), sk = r2(hk + vvgk + soko), rg = r2(sk * pc("rg")), soll = r2(sk + rg);
  const skRegie = r2(hk + vvgk), rgRegie = r2(skRegie * pc("rg")), regieOhne = r2(skRegie + rgRegie);
  return { lohn, pzk, ugk, hk, vvgk, soko, sk, rg, soll, skRegie, rgRegie, regieOhne };
}
// Satz der technischen Bearbeitung (TB-C) je Stunde: eingetragen, sonst Sollerlös Projektleiter/TB-C (null = keiner)
export const tbcSatz = (s) => (isNum(s.tbcSatz) ? s.tbcSatz : rolle(s, "pl")?.soll ?? null);
// Regiesatz einer Rolle: Regie ohne TB-C + TB-C-Satz × TB-C-Zeit je Regiestunde
export function regie(s, key) {
  const r = rolle(s, key); if (!r) return null;
  const tbc = r2((tbcSatz(s) || 0) * (s.tbcRegie || 0));
  return { ...r, tbc, regie: r2(r.regieOhne + tbc) };
}
// Ansatz je Installationsstunde einer Rolle und Installationsart: Sollerlös + TB-C-Satz × TB-C-Anteil (ohne Art: ohne TB-C)
export function ansatzErweitert(s, key = s.rolle || "eli", art = s.art) {
  const r = rolle(s, key); if (!r) return null;
  const h = art ? s.tbc?.[art] || 0 : 0;
  return r2(r.soll + r2((tbcSatz(s) || 0) * h));
}
// Materialfaktor aus den Zuschlägen: (1 + Gemeinkosten gemischt nach Anteil Lagermaterial) × (1 + VVGK) × (1 + R+G), auf 0.01. null ohne Angaben.
export function fakErweitert(s) {
  const m = s.mat; if (!m || !MAT.some((k) => isNum(m[k]))) return null;
  const p = (k) => (m[k] || 0) / 100, gk = (1 - p("lager")) * p("gkA") + p("lager") * p("gkL");
  return r2((1 + gk) * (1 + p("vvgk")) * (1 + p("rg")));
}
// Was eine neue Offerte übernimmt: { ansatz, fak }, fehlt ein Wert, gilt der Standard der Offerte
export function offerDefaults(s = loadSollwerte()) {
  const o = {};
  const ans = s.modus === "erweitert" ? ansatzErweitert(s) ?? s.ansatz : s.ansatz, fak = s.modus === "erweitert" ? fakErweitert(s) ?? s.fak : s.fak;
  if (isNum(ans)) o.ansatz = ans;
  if (isNum(fak) && fak > 0) o.fak = fak;
  return o;
}

// IC-Zeiten: IC-Code (Text, ohne Leerzeichen) → Zeit h je Einheit. Doppelte Codes: der erste gilt.
export function cleanIcZeiten(o) {
  const rows = [], seen = new Set();
  for (const r of Array.isArray(o?.rows) ? o.rows : []) {
    if (!r || typeof r !== "object") continue;
    const ic = String(r.ic ?? "").replace(/\s/g, "").slice(0, 10), std = num(r.std, 1000);
    if (!ic || seen.has(ic)) continue;
    seen.add(ic);
    const x = { ic }; put(x, "std", std); const t = String(r.text ?? "").trim().slice(0, 200); if (t) x.text = t;
    rows.push(x);
  }
  return { rows };
}
export const icZeit = (ic, t = loadIcZeiten()) => { const k = String(ic ?? "").replace(/\s/g, ""); return k ? t.rows.find((r) => r.ic === k)?.std : undefined; };

export const loadSollwerte = () => cleanSollwerte(A.load("sollwerte"));
export const saveSollwerte = (s, opt) => A.save("sollwerte", cleanSollwerte(s), opt);
export const loadIcZeiten = () => cleanIcZeiten(A.load("iczeiten"));
export const saveIcZeiten = (t, opt) => A.save("iczeiten", cleanIcZeiten(t), opt);
export async function syncSollwerte() { const a = await A.sync("sollwerte"), b = await A.sync("iczeiten"); return a || b; }

// ---------- Fenster «Kalkulation Firmenwerte» (beide Stände, im Profil und in der Offerte). openModal und toast aus dialogs.js, parseNum aus offedit.js. ----------
const fmt = (x) => (isNum(x) ? x.toFixed(2) : "–");
const v = (x) => (isNum(x) ? String(x) : "");
export function sollwerteDialog({ openModal, toast, parseNum }, { online = false } = {}) {
  let s = loadSollwerte(), ic = loadIcZeiten();
  const root = () => document.getElementById("modal-root");
  const f = (key, label, val, { unit = "", ph = "" } = {}) => `<label class="sw-f"><span>${esc(label)}</span><span class="sw-in"><input type="text" inputmode="decimal" data-sw="${key}" value="${esc(v(val))}"${ph ? ` placeholder="${esc(ph)}"` : ""} autocomplete="off">${unit ? `<i>${esc(unit)}</i>` : ""}</span></label>`;
  const sel = (key, label, set, cur, empty) => `<label class="sw-f"><span>${esc(label)}</span><select data-sw="${key}"><option value="">${esc(empty)}</option>${Object.entries(set).map(([k, l]) => `<option value="${k}"${k === cur ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const tab = (m) => `<button type="button" class="btn small ${s.modus === m ? "primary" : "outline"}" data-swmode="${m}" aria-pressed="${s.modus === m}">${m === "einfach" ? "Einfach" : "Erweitert"}</button>`;
  // Ergebnis der Rechnung (nur Anzeige, ändert sich beim Tippen)
  const result = () => {
    const rows = Object.keys(ROLLEN).map((k) => [k, regie(s, k)]).filter(([, r]) => r);
    if (!rows.length) return `<p class="note">Ergebnis erscheint, sobald ein Lohn eingetragen ist.</p>`;
    const line = (label, key) => `<tr><td>${esc(label)}</td>${rows.map(([, r]) => `<td>${fmt(r[key])}</td>`).join("")}</tr>`;
    return `<table class="sw-res"><thead><tr><th></th>${rows.map(([k]) => `<th>${esc(ROLLEN[k])}</th>`).join("")}</tr></thead><tbody>`
      + line("EK-Stundenlohn", "lohn") + line("+ PZK", "pzk") + line("+ übrige Gemeinkosten", "ugk") + line("= Herstellkosten", "hk") + line("+ VVGK", "vvgk") + line("+ SoKo", "soko")
      + line("= Selbstkosten", "sk") + line("+ R+G", "rg") + `<tr class="sw-strong"><td>= Sollerlös Installationsstunde</td>${rows.map(([, r]) => `<td>${fmt(r.soll)}</td>`).join("")}</tr>`
      + line("Selbstkosten Regie (ohne SoKo)", "skRegie") + line("+ R+G", "rgRegie") + line("= Regie ohne TB-C", "regieOhne") + line("+ TB-C", "tbc")
      + `<tr class="sw-strong"><td>= Sollerlös Regie</td>${rows.map(([, r]) => `<td>${fmt(r.regie)}</td>`).join("")}</tr></tbody></table>`;
  };
  const uebernahme = () => { const d = offerDefaults(s); return `<p class="sw-take">Neue Offerten übernehmen: Ansatz <b>${isNum(d.ansatz) ? `CHF ${fmt(d.ansatz)}` : "–"}</b>, Materialfaktor <b>${isNum(d.fak) ? d.fak : "1.4 (Standard)"}</b>. In jeder Offerte änderbar.</p>`; };
  const einfach = () => `<div class="sw-grid">${f("ansatz", "Stundenansatz", s.ansatz, { unit: "CHF/h" })}${f("fak", "Materialfaktor", s.fak, { ph: "1.4" })}</div>`;
  const erweitert = () => `<h3>Löhne je Rolle</h3><div class="sw-grid">${Object.entries(ROLLEN).map(([k, l]) => f(`lohn.${k}`, l, s.lohn?.[k], { unit: "CHF/h" })).join("")}</div>`
    + `<h3>Zuschläge</h3><div class="sw-grid">${f("pzk", "PZK vom Lohn", s.pzk, { unit: "%" })}${f("ugk", "Übrige Gemeinkosten", s.ugk, { unit: "CHF/h" })}${f("vvgk", "VVGK von HK", s.vvgk, { unit: "%" })}${f("soko", "SoKo von HK (nicht Regie)", s.soko, { unit: "%" })}${f("rg", "Risiko und Gewinn", s.rg, { unit: "%" })}</div>`
    + `<h3>Technische Bearbeitung (TB-C)</h3><div class="sw-grid">${f("tbcSatz", "TB-C-Satz", s.tbcSatz, { unit: "CHF/h", ph: "= Projektleiter" })}${f("tbcRegie", "TB-C je Regiestunde", s.tbcRegie, { unit: "h" })}${Object.entries(INSTARTEN).map(([k, l]) => f(`tbc.${k}`, `TB-C ${l}`, s.tbc?.[k], { unit: "h je h" })).join("")}</div>`
    + `<div id="sw-res">${result()}</div>`
    + `<h3>Material</h3><div class="sw-grid">${f("mat.gkA", "Gemeinkosten Auftragsmaterial", s.mat?.gkA, { unit: "%" })}${f("mat.gkL", "Gemeinkosten Lagermaterial", s.mat?.gkL, { unit: "%" })}${f("mat.lager", "Anteil Lagermaterial", s.mat?.lager, { unit: "%" })}${f("mat.vvgk", "VVGK Material", s.mat?.vvgk, { unit: "%" })}${f("mat.rg", "R+G Material", s.mat?.rg, { unit: "%" })}${f("fak", "Materialfaktor ohne Angaben", s.fak, { ph: "1.4" })}</div>`
    + `<h3>Für neue Offerten</h3><div class="sw-grid">${sel("rolle", "Ansatz der Rolle", ROLLEN, s.rolle, "Elektroinstallateur")}${sel("art", "mit TB-C der Installationsart", INSTARTEN, s.art, "ohne TB-C")}${f("ansatz", "Ansatz ohne Lohn", s.ansatz, { unit: "CHF/h" })}</div>`;
  const icRows = () => ic.rows.map((r, i) => `<div class="sw-ic"><input type="text" data-ic="${i}.ic" value="${esc(r.ic)}" placeholder="IC" aria-label="IC-Code" autocomplete="off"><input type="text" inputmode="decimal" data-ic="${i}.std" value="${esc(v(r.std))}" placeholder="h je EH" aria-label="Zeit h je Einheit" autocomplete="off"><input type="text" data-ic="${i}.text" value="${esc(r.text || "")}" placeholder="Bemerkung" aria-label="Bemerkung" autocomplete="off"><button type="button" class="btn icon small danger" data-icdel="${i}" title="Zeile löschen" aria-label="Zeile löschen">×</button></div>`).join("");
  const inner = () => `<div class="row sw-modes" role="group" aria-label="Modus">${tab("einfach")}${tab("erweitert")}</div>${s.modus === "erweitert" ? erweitert() : einfach()}<div id="sw-take">${uebernahme()}</div>`
    + `<h3>IC-Zeiten</h3><p class="note">Deine eigenen Zeiten je Einheit. Eine Position mit diesem IC-Code bekommt die Zeit vorbelegt, in der Position änderbar.</p><div id="sw-icrows">${icRows()}</div><button type="button" class="btn outline small" data-icadd>+ IC-Code</button>`;
  // Felder lesen: leere und ungültige Zahlen fallen weg
  const read = () => {
    const n = (x) => { const y = parseNum(x); return Number.isFinite(y) && y >= 0 ? y : undefined; };
    for (const el of root().querySelectorAll("[data-sw]")) {
      const [a, b] = el.dataset.sw.split("."), val = el.tagName === "SELECT" ? el.value || undefined : n(el.value);
      if (b) { s[a] ||= {}; if (val === undefined) delete s[a][b]; else s[a][b] = val; } else if (val === undefined) delete s[a]; else s[a] = val;
    }
    ic.rows = ic.rows.map((r, i) => { const g = (k) => root().querySelector(`[data-ic="${i}.${k}"]`)?.value ?? ""; return { ic: g("ic").trim(), std: n(g("std")), text: g("text") }; });
  };
  const body = `<p>${online ? "Gilt für alle neuen Offerten und liegt online bei deinem Konto." : "Gilt für alle neuen Offerten. Ohne Anmeldung nur in diesem Browser."} Jedes Feld darf leer bleiben.</p><div id="sw-body">${inner()}</div>
<div class="actions"><button class="btn outline" data-c>Abbrechen</button><button class="btn primary" data-ok>Speichern</button></div>`;
  const p = openModal("Kalkulation Firmenwerte", body, (b, done) => {
    if (b.dataset.c !== undefined) { done(null); return; }
    if (b.dataset.swmode) { read(); s.modus = b.dataset.swmode; document.getElementById("sw-body").innerHTML = inner(); return; }
    if (b.dataset.icadd !== undefined) { read(); ic.rows.push({ ic: "" }); document.getElementById("sw-icrows").innerHTML = icRows(); root().querySelector(`[data-ic="${ic.rows.length - 1}.ic"]`)?.focus(); return; }
    if (b.dataset.icdel !== undefined) { read(); ic.rows.splice(Number(b.dataset.icdel), 1); document.getElementById("sw-icrows").innerHTML = icRows(); return; }
    if (b.dataset.ok === undefined) return;
    read(); s = cleanSollwerte(s); ic = cleanIcZeiten(ic);
    Promise.all([saveSollwerte(s), saveIcZeiten(ic)]).then((r) => toast(r.every((x) => x === "online") ? "Sollwerte gespeichert." : online ? "Sollwerte im Browser gespeichert, online nicht erreichbar. Der nächste Abgleich holt es nach." : "Sollwerte in diesem Browser gespeichert."));
    done({ s, ic });
  }, null, "input", "sw-modal");
  // Ergebnis beim Tippen nachführen
  const live = (e) => {
    if (!e.target.dataset?.sw) return;
    read();
    const r = document.getElementById("sw-res"); if (r) r.innerHTML = result();
    document.getElementById("sw-take").innerHTML = uebernahme();
  };
  root().addEventListener("input", live);
  return p.finally(() => root().removeEventListener("input", live));
}
