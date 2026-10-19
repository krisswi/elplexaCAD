// elplexaCAD (CJ 19.10.2026): Adresse und Gebäudedaten aus dem GWR (Eidg. Gebäude- und Wohnungsregister, BFS) am Projekt.
// Abruf über den Kartendienst des Bundes (api3.geo.admin.ch): ohne Schlüssel, ohne Server, direkt aus dem Browser (CORS offen, getestet 19.10.2026).
// Ablauf: Adresssuche → EGID, Gebäude-Abfrage → Merkmale und Wohnungen (EWID), Höhenabfrage → Höhe ü. M. (für die Tiefsttemperatur im PV-Modul).
// Gespeichert werden die Codes, Bezeichnungen kommen aus der Code-Liste des BFS (kodes_codes_codici.csv, Stand 19.10.2026).
import { esc } from "./render.js";

const API = "https://api3.geo.admin.ch/rest/services";
const LAYER = "ch.bfs.gebaeude_wohnungs_register";

const CODES = {
  st: { 1001: "Gebäude projektiert", 1002: "Gebäude bewilligt", 1003: "Gebäude im Bau", 1004: "Gebäude bestehend", 1005: "Gebäude nicht nutzbar", 1007: "Gebäude abgebrochen", 1008: "Gebäude nicht realisiert" },
  kat: { 1010: "Provisorische Unterkunft", 1020: "Gebäude mit ausschliesslicher Wohnnutzung", 1030: "Andere Wohngebäude (Wohngebäude mit Nebennutzung)", 1040: "Gebäude mit teilweiser Wohnnutzung", 1060: "Gebäude ohne Wohnnutzung", 1080: "Sonderbau" },
  wh: { 7400: "Kein Wärmeerzeuger", 7410: "Wärmepumpe für ein Gebäude", 7411: "Wärmepumpe für mehrere Gebäude", 7420: "Thermische Solaranlage für ein Gebäude", 7421: "Thermische Solaranlage für mehrere Gebäude", 7430: "Heizkessel (generisch) für ein Gebäude", 7431: "Heizkessel (generisch) für mehrere Gebäude", 7432: "Heizkessel nicht kondensierend für ein Gebäude", 7433: "Heizkessel nicht kondensierend für mehrere Gebäude", 7434: "Heizkessel kondensierend für ein Gebäude", 7435: "Heizkessel kondensierend für mehrere Gebäude", 7436: "Ofen", 7440: "Wärmekraftkopplungsanlage für ein Gebäude", 7441: "Wärmekraftkopplungsanlage für mehrere Gebäude", 7450: "Elektrospeicher-Zentralheizung für ein Gebäude", 7451: "Elektrospeicher-Zentralheizung für mehrere Gebäude", 7452: "Elektro direkt", 7460: "Wärmetauscher (einschliesslich für Fernwärme) für ein Gebäude", 7461: "Wärmetauscher (einschliesslich für Fernwärme) für mehrere Gebäude", 7499: "Andere" },
  en: { 7500: "Keine", 7501: "Luft", 7510: "Erdwärme (generisch)", 7511: "Erdwärmesonde", 7512: "Erdregister", 7513: "Wasser (Grundwasser, Oberflächenwasser, Abwasser)", 7520: "Gas", 7530: "Heizöl", 7540: "Holz (generisch)", 7541: "Holz (Stückholz)", 7542: "Holz (Pellets)", 7543: "Holz (Schnitzel)", 7550: "Abwärme (innerhalb des Gebäudes)", 7560: "Elektrizität", 7570: "Sonne (thermisch)", 7580: "Fernwärme (generisch)", 7581: "Fernwärme (Hochtemperatur)", 7582: "Fernwärme (Niedertemperatur)", 7598: "Unbestimmt", 7599: "Andere" },
  ww: { 7600: "Kein Wärmeerzeuger", 7610: "Wärmepumpe", 7620: "Thermische Solaranlage", 7630: "Heizkessel (generisch)", 7632: "Heizkessel nicht kondensierend", 7634: "Heizkessel kondensierend", 7640: "Wärmekraftkopplungsanlage", 7650: "Zentraler Elektroboiler", 7651: "Kleinboiler", 7660: "Wärmetauscher (einschliesslich für Fernwärme)", 7699: "Andere" },
};
const code = (k, c) => (c == null ? "" : CODES[k][c] || String(c));
// Stockwerk: 3100 Parterre, 3101–3199 = 1. bis 99. Stock, 3401–3419 = 1. bis 19. Untergeschoss
export const stockwerk = (c) => (c === 3100 ? "Parterre" : c > 3100 && c < 3200 ? `${c - 3100}. Stock` : c > 3400 && c < 3420 ? `${c - 3400}. Untergeschoss` : c == null ? "" : String(c));

// Datei: project.adr = { str, nr, plz, ort } (von Hand), project.gwr = Auszug aus dem GWR (beim Abruf ersetzt)
export const ADR_KEYS = ["str", "nr", "plz", "ort"];
const str = (v, n = 200) => (typeof v === "string" ? v.slice(0, n) : "");
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
export function cleanAdr(o) {
  if (!o || typeof o !== "object") return null;
  const a = {};
  for (const k of ADR_KEYS) if (typeof o[k] === "string" && o[k].trim()) a[k] = o[k].trim().slice(0, 100);
  return Object.keys(a).length ? a : null;
}
const GWR_NUM = ["st", "kat", "bauj", "area", "geschosse", "whgn", "gde", "wh", "en", "ww", "enw", "e", "n", "h"];
const GWR_STR = ["egid", "egrid", "parz", "gdename", "kt", "plz", "ort", "pub", "at"];
const WHG_NUM = ["stwk", "area", "zi", "bauj"];
export function cleanGwr(o) {
  if (!o || typeof o !== "object" || !/^\d{1,12}$/.test(o.egid)) return null;
  const g = {};
  for (const k of GWR_STR) if (str(o[k])) g[k] = str(o[k]);
  for (const k of GWR_NUM) if (num(o[k]) != null) g[k] = o[k];
  if (Array.isArray(o.whg)) {
    g.whg = o.whg.filter((w) => w && /^\d{1,3}$/.test(w.ewid)).slice(0, 999).map((w) => {
      const x = { ewid: w.ewid };
      for (const k of WHG_NUM) if (num(w[k]) != null) x[k] = w[k];
      for (const k of ["nr", "lage"]) if (str(w[k], 50)) x[k] = str(w[k], 50);
      return x;
    });
  }
  return g;
}

// Abruf. adr = { str, nr, plz, ort }. Liefert { gwr, adr } (adr: PLZ und Ort aus dem GWR, wo leer) oder wirft Error mit Text für CJ.
const norm = (s) => String(s ?? "").toLowerCase().replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
async function getJson(url) {
  let r;
  try { r = await fetch(url, { signal: AbortSignal.timeout(15000) }); } catch { throw new Error("GWR nicht erreichbar. Internet prüfen und nochmals versuchen."); }
  if (!r.ok) throw new Error(`GWR antwortet mit Fehler ${r.status}.`);
  return r.json();
}
export async function fetchGwr(adr) {
  const a = cleanAdr(adr) || {};
  if (!a.str || !a.nr || !(a.plz || a.ort)) throw new Error("Für den Abruf Strasse, Nr. und PLZ oder Ort eingeben.");
  const q = [a.str, a.nr, a.plz, a.ort].filter(Boolean).join(" ");
  const s = await getJson(`${API}/ech/SearchServer?type=locations&origins=address&limit=20&searchText=${encodeURIComponent(q)}`);
  // Treffer: Strasse und Nr. genau (nicht 268b für 268), dazu PLZ oder, ohne PLZ, Ort (Ortschaft oder Gemeinde)
  const head = `${norm(a.str)} ${norm(a.nr)}`;
  const same = (s.results || []).map((x) => x.attrs || {}).filter((t) => { const l = norm(t.label); return l === head || l.startsWith(head + " "); });
  const hit = same.find((t) => (a.plz ? ` ${norm(t.label)} `.includes(` ${norm(a.plz)} `) : `${norm(t.label)} ${norm(t.detail)}`.includes(norm(a.ort))));
  if (!hit?.featureId) {
    const other = same.slice(0, 3).map((t) => String(t.label).replace(/<[^>]*>/g, "")).join(", ");
    throw new Error(`Adresse „${q}“ im GWR nicht gefunden.${other ? ` Gefunden: ${other}. PLZ oder Ort prüfen.` : " Schreibweise prüfen (z. B. „Bahnhofstrasse“ statt „Bahnhofstr.“)."}`);
  }
  const f = await getJson(`${API}/ech/MapServer/${LAYER}/${encodeURIComponent(hit.featureId)}?returnGeometry=false`);
  const t = f.feature?.attributes;
  if (!t?.egid) throw new Error("Gebäude im GWR ohne Daten.");
  let h = null;
  if (num(t.gkode) != null && num(t.gkodn) != null) {
    try { h = Number((await getJson(`${API}/height?easting=${t.gkode}&northing=${t.gkodn}&sr=2056`)).height); } catch { h = null; } // Höhe ist Zugabe: Abruf gilt auch ohne
  }
  const arr = (v) => (Array.isArray(v) ? v : []);
  const gwr = cleanGwr({
    egid: String(t.egid), egrid: t.egrid || "", parz: t.lparz || "", st: t.gstat, kat: t.gkat, bauj: t.gbauj, area: t.garea, geschosse: t.gastw, whgn: t.ganzwhg,
    gde: t.ggdenr, gdename: t.ggdename || "", kt: t.gdekt || "", plz: t.dplz4 != null ? String(t.dplz4) : "", ort: t.dplzname || "",
    wh: t.gwaerzh1, en: t.genh1, ww: t.gwaerzw1, enw: t.genw1, e: t.gkode, n: t.gkodn, h: Number.isFinite(h) ? Math.round(h) : null,
    pub: t.gexpdat || "", at: new Date().toISOString().slice(0, 10),
    whg: arr(t.ewid).map((ewid, i) => ({ ewid: String(ewid), nr: arr(t.whgnr)[i] || "", stwk: arr(t.wstwk)[i], lage: arr(t.wbez)[i] || "", area: arr(t.warea)[i], zi: arr(t.wazim)[i], bauj: arr(t.wbauj)[i] })),
  });
  return { gwr, adr: { ...a, ...(a.plz ? {} : gwr.plz ? { plz: gwr.plz } : {}), ...(a.ort ? {} : gwr.ort ? { ort: gwr.ort } : {}) } };
}

// Adresssuche beim Tippen (CJ 19.10.2026): Vorschläge aus dem amtlichen Gebäudeadressverzeichnis über dieselbe Suche.
// Label „Bärgen 268 <b>6084 Hasliberg Wasserwendi</b>“ → { str, nr, plz, ort }; ohne Hausnummer bleibt nr leer.
const unent = (s) => s.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
export function parseAdrLabel(label) {
  const m = String(label ?? "").match(/^(.*?)\s*<b>(.*?)<\/b>/);
  if (!m) return null;
  const a = unent(m[1].trim()), b = unent(m[2].trim()), i = a.lastIndexOf(" "), j = b.indexOf(" ");
  const hasNr = i > 0 && /^\d/.test(a.slice(i + 1));
  return { str: hasNr ? a.slice(0, i) : a, nr: hasNr ? a.slice(i + 1) : "", plz: j < 0 ? b : b.slice(0, j), ort: j < 0 ? "" : b.slice(j + 1) };
}
export async function searchAdr(q) {
  const s = await getJson(`${API}/ech/SearchServer?type=locations&origins=address&limit=8&searchText=${encodeURIComponent(q)}`);
  return (s.results || []).map((x) => parseAdrLabel(x.attrs?.label)).filter(Boolean);
}
// Eine Zeile für Titelseite und Module: „Bärgen 268, 6084 Hasliberg“
export const adrText = (a) => (a ? [[a.str, a.nr].filter(Boolean).join(" "), [a.plz, a.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "");
// Tmin nach NIN SN 411000 7.12.5.1.2.1.1 aus der Höhe: bis 800 m 0 °C (Neigung unter 15°) bzw. −5 °C (über 15°), über 800 bis 1500 m −15 °C, über 1500 m −25 °C
export const tminNin = (h) => (typeof h !== "number" ? [] : h > 1500 ? [-25] : h > 800 ? [-15] : [0, -5]);

// Anzeige in der Projektübersicht: Adresszeilen und aufklappbares Feld „Gebäude (GWR)“ (zu = Daten nur im Hintergrund).
// open: Feld offen (bleibt beim Neuzeichnen), busy: Abruf läuft, ro: geteilte Ansicht
export function adrHTML(adr, ro) {
  const a = adr || {}, roA = ro ? " readonly" : "";
  const inp = (k, ph, label, cls = "") => `<input data-elp="adr:${k}" class="${cls}" value="${esc(a[k] || "")}" placeholder="${ph}" aria-label="${label}" spellcheck="false"${roA}>`;
  const str = `<input data-elp="adr:str" value="${esc(a.str || "")}" placeholder="${ro ? "–" : "Adresse suchen …"}" aria-label="Strasse (tippen sucht Adressen)" spellcheck="false" autocomplete="off"${ro ? roA : ` role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="el-adrlist"`}>`;
  return `<div class="el-row el-row2"><span>Strasse, Nr.</span>${str}${inp("nr", "Nr.", "Hausnummer", "el-nr")}</div>`
    + `<div class="el-row el-row2"><span>PLZ, Ort</span>${inp("plz", "PLZ", "Postleitzahl", "el-plz")}${inp("ort", "–", "Ort")}</div>`;
}
export function gwrHTML(g, { open = false, busy = false, ro = false } = {}) {
  const sum = g ? `EGID ${esc(g.egid)}` : "noch nicht abgerufen";
  const btn = ro ? "" : `<button class="btn outline small" data-elact="gwr"${busy ? " disabled" : ""}><span>${busy ? "Wird abgerufen …" : g ? "GWR aktualisieren" : "GWR abrufen"}</span></button>`;
  const cell = (label, v) => `<div class="el-gv"><span>${label}</span><b>${v === "" || v == null ? "–" : esc(String(v))}</b></div>`;
  const body = !g ? `<p class="el-note">Strasse, Nr. und PLZ oder Ort eingeben, dann abrufen. Daten: Eidg. Gebäude- und Wohnungsregister (BFS) über geo.admin.ch.</p>`
    : `<div class="el-ggrid">${[
      cell("EGID", g.egid), cell("Baujahr", g.bauj), cell("Gebäudestatus", code("st", g.st).replace(/^Gebäude /, "")),
      cell("Kategorie", code("kat", g.kat)), cell("Geschosse", g.geschosse), cell("Gebäudefläche", g.area != null ? `${g.area} m²` : ""),
      cell("Heizung", code("wh", g.wh)), cell("Energieträger Heizung", code("en", g.en)), cell("Warmwasser", g.ww != null ? `${code("ww", g.ww)}${g.enw != null ? (code("en", g.enw).includes("(") ? `, ${code("en", g.enw)}` : ` (${code("en", g.enw)})`) : ""}` : ""),
      cell("Gemeinde (BFS-Nr.)", g.gde != null ? `${g.gde} ${g.gdename || ""}`.trim() : g.gdename), cell("Kanton", g.kt), cell("Parzelle", g.parz),
      cell("E-GRID", g.egrid), cell("LV95 Ost / Nord", g.e != null ? `${g.e} / ${g.n}` : ""), cell("Höhe ü. M.", g.h != null ? `${g.h} m` : ""),
    ].join("")}</div>
    <p class="el-note">GWR-Stand ${esc(g.pub || "–")} · abgerufen ${esc(g.at ? g.at.split("-").reverse().join(".") : "–")} · Quelle BFS, geo.admin.ch</p>
    ${g.whg?.length ? `<span class="el-eye">Wohnungen (EWID)</span><div class="el-wtab" role="region" aria-label="Wohnungen" tabindex="0"><table><thead><tr><th>EWID</th><th>Nr.</th><th>Stockwerk</th><th>Lage</th><th>m²</th><th>Zi.</th><th>Baujahr</th></tr></thead><tbody>${g.whg.map((w) => `<tr><td>${esc(w.ewid)}</td><td>${esc(w.nr || "–")}</td><td>${esc(stockwerk(w.stwk) || "–")}</td><td>${esc(w.lage || "–")}</td><td>${w.area ?? "–"}</td><td>${w.zi ?? "–"}</td><td>${w.bauj ?? "–"}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  return `<details class="el-gwr" id="el-gwr"${open ? " open" : ""}><summary><span class="el-gsum"><span class="el-gt">Gebäude (GWR)</span><span class="el-gs">${sum}</span></span></summary>
    <div class="el-gbody">${btn ? `<div class="el-gacts">${btn}</div>` : ""}${body}</div></details>`;
}
