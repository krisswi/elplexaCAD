// Modul «Offerten», Schritt 5 (CJ 26.10.2026): bestehende Excel-Offerte (.xlsx) als neue Offerte einlesen. Ohne Bibliothek: ZIP lesen, XML der Blätter
// mit den gespeicherten Werten (bei Formeln der zuletzt von Excel berechnete Wert). Deutung (mit CJ an Offerte.xlsx abgesprochen):
// - Kopfzeile = erste Zeile mit einer Textspalte (Artikel, Titel, Bezeichnung, Beschreibung) und einer Mengenspalte (Menge, Anzahl, Stunden).
// - Zeile mit Text, ohne Menge, EK und Preis: Gruppe; steht dazu eine BKP-Nummer (Spalte BKP oder Pos), ein Kapitel.
// - Zeile mit Text und Menge, EK oder Preis: Position. EK wird EK (Preis = EK × Materialfaktor wie im Editor), ein abweichender Preis gilt als Preis von Hand.
//   Ohne EK gilt der Preis (bei Stunden der Ansatz). Zeilen «Total …», «Zwischensumme …» fallen weg, «Schlusszusammenstellung» beendet das Blatt.
// - Materialfaktor aus einer Zelle «Faktor» über der Kopfzeile. Jedes weitere Blatt mit Kopfzeile wird eine eigene Gruppe (Stunden: «Arbeit»).
// - Ohne BKP kommt alles in ein Kapitel ohne Nummer (BKP trägt CJ nach). Die eigene Excel aus dem Export (offxlsx.js) liest sich gleich wieder ein.
import * as O from "./offerte.js";

// ---------- .xlsx lesen ----------
// bytes: Uint8Array, inflate: async (Uint8Array, roh deflate) => Uint8Array. Gibt [{ name, rows }] zurück, rows[r][c] (0-basiert) = Text oder Zahl.
export async function readXlsx(bytes, inflate) {
  const files = await unzip(bytes, inflate), dec = new TextDecoder(), txt = (n) => (files.has(n) ? dec.decode(files.get(n)) : "");
  const shared = [...txt("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const rels = new Map([...txt("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target")]));
  const out = [];
  for (const m of txt("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)) {
    const t = rels.get(attr(m[0], "r:id")) || "", path = t.startsWith("/") ? t.slice(1) : `xl/${t.replace(/^\.\//, "")}`;
    out.push({ name: unesc(attr(m[0], "name")), rows: sheetRows(txt(path), shared) });
  }
  return out;
}
const attr = (tag, k) => (new RegExp(`\\s${k.replace(":", "\\:")}="([^"]*)"`).exec(tag) || [])[1] || "";
const unesc = (s) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e) => ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[e.toLowerCase()] ?? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))));
const texts = (x) => unesc([...x.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
const colNo = (ref) => { let n = 0; for (const ch of /^[A-Z]+/.exec(ref)?.[0] || "") n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
function sheetRows(xml, shared) {
  const rows = [];
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(attr(rm[0], "r")) - 1, row = [];
    for (const cm of (rm[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = cm[0], body = cm[2] || "", t = attr(tag, "t"), v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val;
      if (t === "s") val = shared[Number(v)] ?? "";
      else if (t === "inlineStr") val = texts(body);
      else if (t === "str" || t === "e") val = v === undefined ? "" : unesc(v);
      else if (t === "b") val = v === "1" ? "WAHR" : "FALSCH";
      else val = v === undefined || v === "" ? undefined : Number(v);
      if (val !== undefined && val !== "") row[colNo(attr(tag, "r"))] = val;
    }
    if (r >= 0 && row.length) rows[r] = row;
  }
  return rows;
}
// ZIP über das zentrale Verzeichnis (Grössen stehen dort sicher), Methode 0 (ohne) und 8 (deflate)
async function unzip(b, inflate) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), out = new Map(), dec = new TextDecoder();
  let e = b.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("Keine Excel-Datei (.xlsx)");
  let p = dv.getUint32(e + 16, true);
  for (let i = 0, n = dv.getUint16(e + 10, true); i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const meth = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nl)), start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = b.subarray(start, start + size);
    if (/\.(xml|rels)$/.test(name)) out.set(name, meth === 8 ? await inflate(data) : data);
    p += 46 + nl + xl + cl;
  }
  return out;
}

// ---------- Deutung ----------
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-zäöü0-9]/g, "");
const HEAD = { // Spaltenkopf → Feld; Reihenfolge zählt (EK vor Preis)
  bkp: (h) => /^bkp/.test(h), pos: (h) => /^pos(ition)?(nr)?$/.test(h), ek: (h) => /^ek|preisek|ekpreis|einkauf|netto/.test(h),
  her: (h) => /hersteller|fabrikat|marke/.test(h), ic: (h) => /^ic/.test(h), enr: (h) => /^enr|^enum/.test(h), opt: (h) => /^option/.test(h),
  titel: (h) => /artikel|titel|bezeichnung|leistung/.test(h), text: (h) => /beschreibung|^text/.test(h),
  menge: (h) => /menge|anzahl|vorausmass|stunden|^anz/.test(h), eh: (h) => /^eh$|einheit/.test(h), preis: (h) => /^preis$|^ep$|einheitspreis|ansatz/.test(h),
};
function header(rows) {
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const col = {};
    (rows[r] || []).forEach((v, c) => { if (typeof v !== "string") return; const h = norm(v); for (const [k, f] of Object.entries(HEAD)) if (col[k] === undefined && f(h)) { col[k] = c; break; } });
    if (col.titel === undefined && col.text !== undefined) { col.titel = col.text; delete col.text; }
    if (col.titel !== undefined && col.menge !== undefined) return { r, col, hours: /stunden/.test(norm(rows[r][col.menge])) };
  }
  return null;
}
// Materialfaktor: Zelle mit «Faktor» über der Kopfzeile, Zahl rechts daneben
function factor(rows, upto) {
  for (let r = 0; r < upto; r++) { const row = rows[r] || []; for (let c = 0; c < row.length; c++) if (/faktor/.test(norm(row[c])) && typeof row[c + 1] === "number" && row[c + 1] > 0 && row[c + 1] < 100) return row[c + 1]; }
  return undefined;
}
const BKP_NR = /^\d{2,3}(\.\d{1,2})*$/, AUTO_NO = /^\d+\.\d+\.\d+$/, SKIP = /^(total|zwischensumme|summe|übertrag|rabatt|mwst|rundung)\b/i;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^-?[\d']+([.,]\d+)?$/.test(v.trim()) ? Number(v.replace(/'/g, "").replace(",", ".")) : undefined);
const str = (v) => (v === undefined || v === null ? "" : String(v).trim());

// sheets aus readXlsx. Gibt { kap (ohne IDs, für cleanOfferte), fak, info: { blaetter, positionen, ohnePreis, uebersprungen } } zurück.
export function parseOfferte(sheets, { titel = "" } = {}) {
  const kap = [], info = { blaetter: [], positionen: 0, ohnePreis: 0, uebersprungen: 0 };
  let fak, k = null, g = null;
  const newKap = (bkp, t) => { k = { bkp, titel: t ?? O.bkpTitle(bkp), grp: [] }; kap.push(k); g = null; return k; };
  const newGrp = (t) => { if (!k) newKap("", titel); g = { titel: t, pos: [] }; k.grp.push(g); return g; };
  sheets.forEach((sh, si) => {
    const h = header(sh.rows); if (!h) return;
    info.blaetter.push(sh.name);
    fak ??= factor(sh.rows, h.r);
    const c = h.col, cell = (row, f) => (c[f] === undefined ? undefined : row[c[f]]);
    if (si > 0 || h.hours) newGrp(h.hours ? "Arbeit" : sh.name); // weiteres Blatt: eigene Gruppe
    for (let r = h.r + 1; r < sh.rows.length; r++) {
      const row = sh.rows[r]; if (!row) continue;
      const tx = str(cell(row, "titel")), desc = str(cell(row, "text"));
      if (/^schlusszusammenstellung/i.test(tx)) break;
      if (!tx && !desc) continue;
      if (SKIP.test(tx)) { info.uebersprungen++; continue; }
      const menge = num(cell(row, "menge")), ek = num(cell(row, "ek")), preis = num(cell(row, "preis")), pos = str(cell(row, "pos"));
      const bkp = str(cell(row, "bkp")) || (BKP_NR.test(pos) ? pos : "");
      if (menge === undefined && !ek && !preis) { if (bkp) newKap(bkp, tx || undefined); else newGrp(tx); continue; }
      if (!g) newGrp("");
      const p = { titel: tx || desc };
      if (desc && tx) p.text = desc;
      if (menge !== undefined) p.menge = menge;
      const eh = str(cell(row, "eh")) || (h.hours ? "h" : ""); if (eh) p.eh = eh;
      for (const f of ["her", "ic", "enr"]) { const v = str(cell(row, f)); if (v) p[f] = v; }
      if (pos && !AUTO_NO.test(pos) && !BKP_NR.test(pos)) p.npk = pos;
      if (bkp && bkp !== k.bkp) p.bkp = bkp;
      if (ek) { p.ek = ek; if (preis !== undefined && Math.abs(preis - ek * (fak ?? O.DEF.fak)) > 0.005) p.preis = preis; } // abweichender Preis = Preis von Hand
      else if (preis !== undefined) p.preis = preis;
      if (!ek && !preis) info.ohnePreis++;
      const o = norm(cell(row, "opt")); if (o.startsWith("option")) { p.opt = true; if (o.includes("aktiv")) p.an = true; }
      g.pos.push(p); info.positionen++;
    }
  });
  return { kap, fak, info };
}
// Neue Offerte aus der Deutung. base: Standardwerte (Ansatz, Faktor aus den Sollwerten), off: Gruppen (Index über alle Kapitel), deren Positionen Optionen werden.
export function buildOfferte(res, base = {}, off = new Set()) {
  let n = 0;
  const kap = res.kap.map((k) => ({ ...k, grp: k.grp.map((g) => { const o = off.has(n++); return { ...g, pos: g.pos.map((p) => (o ? { ...p, opt: true } : p)) }; }) }));
  return O.cleanOfferte({ ...O.newOfferte(), ...base, ...(res.fak ? { fak: res.fak } : {}), kap });
}
