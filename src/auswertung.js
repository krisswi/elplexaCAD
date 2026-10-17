// Auswertung: Sicherungslegende und Stückliste aus den Attributen aller Schemablätter, Ausgabe als CSV (Excel, Semikolon).
// Annahmen (CJ prüft): Legende nur Schutzgeräte (LS, FI, RCBO, NH), Kabel und Bezeichnung aus der zugehörigen Klemmenleiste.
// Stückliste: gleiche Symbole mit gleichen Werten zusammengezählt, Verweise und Dispositionsblätter nicht enthalten.
import { SYMBOL_BY_NAME, isDevice } from "./symbols.js";
import { termCount } from "./terminals.js";

const schemaSheets = (doc) => doc.sheets.filter((sh) => sh.kind !== "dispo");
const sym = (it) => SYMBOL_BY_NAME[it.sym];
const isRefSym = (s) => s.family === "VOUT" || s.family === "VIN";

export const LEGEND_HEAD = ["Blatt", "BMK", "Gerät", "Pole", "Nennstrom", "Charakteristik", "IΔn", "Baugrösse", "Klemmen", "Kabel", "Bezeichnung"];

export function fuseLegend(doc) {
  const rows = [];
  for (const sh of schemaSheets(doc)) {
    for (const it of sh.items) {
      if (it.type !== "symbol" || !isDevice(sym(it))) continue;
      const a = it.attrs, t = sh.items.find((i) => i.type === "terminals" && i.of === it.id);
      rows.push([sh.meta.BLATT ?? "", a.BMK ?? "", sym(it).label, sym(it).poles, a.STROM ?? "", a.CHAR ?? "", a.IDN ?? "", a.GROESSE ?? "", t?.bmk ?? "", t?.cable ?? "", t?.name || it.bez || ""]);
    }
  }
  const nat = (a, b) => String(a).localeCompare(String(b), "de", { numeric: true });
  return rows.sort((a, b) => nat(a[0], b[0]) || nat(a[1], b[1]));
}

export const PARTS_HEAD = ["Anzahl", "Bauteil", "Daten", "BMK"];

export function partsList(doc) {
  const map = new Map();
  const add = (name, data, bmk, n = 1) => {
    const k = name + "|" + data;
    const r = map.get(k) || map.set(k, { n: 0, name, data, bmk: [] }).get(k);
    r.n += n; if (bmk) r.bmk.push(bmk);
  };
  for (const sh of schemaSheets(doc)) {
    for (const it of sh.items) {
      if (it.type === "symbol" && sym(it) && !sym(it).hidden && !isRefSym(sym(it))) {
        const s = sym(it);
        const data = s.attrs.filter((d) => d.tag !== "BMK" && !d.auto).map((d) => it.attrs[d.tag]).filter(Boolean).join(" ");
        add(s.label, data, it.attrs.BMK);
      } else if (it.type === "terminals" && !it.noterm) {
        const n = termCount(it), pe = it.pe !== "none" ? 1 : 0;
        if (n - pe) add("Reihenklemme", "", it.bmk, n - pe);
        if (pe) add("PE-Klemme", "", it.bmk, pe);
      }
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "de") || a.data.localeCompare(b.data, "de", { numeric: true }))
    .map((r) => [r.n, r.name, r.data, [...new Set(r.bmk)].join(", ")]);
}

// Formelschutz: Excel soll Texte wie "=…", "+…", "-…" oder "@…" nicht als Formel ausführen.
export const cell = (v) => { const s = /^[=+\-@]/.test(String(v)) ? "'" + v : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const lines = (rows) => rows.map((r) => r.map(cell).join(";"));

// Eine Datei, beide Listen nacheinander. BOM, damit Excel Umlaute richtig liest.
export function listsCsv(doc) {
  return "﻿" + [
    "Sicherungslegende", ...lines([LEGEND_HEAD, ...fuseLegend(doc)]), "",
    "Stückliste", ...lines([PARTS_HEAD, ...partsList(doc)]),
  ].join("\r\n") + "\r\n";
}
