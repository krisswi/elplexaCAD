// Symbol-Bibliotheken: Bereich (Bibliothek) > Gruppe > Symbol. Liegen beim Benutzer (Browser-Speicher und JSON-Datei), nicht in der App.
// Ein Dokument bringt die benutzten Symbole selbst mit (doc.symbols), damit Dateien ohne die Bibliothek offen bleiben.
import { registerSymbol, SYMBOL_BY_NAME } from "./symbols.js";

export const LIB_FORMAT = "schemacad-lib";
const KEY = "schemacad.libraries.v1";

export const libs = []; // [{ id, name, groups: [{ name, symbols: [sym] }] }]

const clean = (s) => String(s ?? "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
let counter = 0;
export function uniqueName(base) {
  let n = `LIB_${clean(base) || "Symbol"}`, i = 1;
  while (SYMBOL_BY_NAME[n]) n = `LIB_${clean(base) || "Symbol"}_${++i}`;
  counter++;
  return n;
}

export function validSymbol(s) {
  return s && typeof s.name === "string" && /^[A-Za-z0-9_]+$/.test(s.name) && Array.isArray(s.prims) && Array.isArray(s.pins) && Array.isArray(s.attrs)
    && s.prims.every((p) => (p.t === "l" && [p.x1, p.y1, p.x2, p.y2].every(Number.isFinite)) || (p.t === "c" && [p.cx, p.cy, p.r].every(Number.isFinite)) || (p.t === "t" && [p.x, p.y, p.h].every(Number.isFinite) && typeof p.s === "string"))
    && s.pins.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    && s.attrs.every((a) => typeof a.tag === "string" && /^[A-Za-z0-9_]+$/.test(a.tag) && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.h));
}
const normalize = (s) => ({ ...s, family: "LIB", poles: 1, layer: "SCH_SYMBOLE", custom: true, label: String(s.label || s.name) });

export function save() { try { localStorage.setItem(KEY, JSON.stringify(libs)); } catch { /* ohne Speicher weiterarbeiten */ } }
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    for (const l of JSON.parse(raw)) addLib(l, false);
  } catch { /* defekter Speicher wird ignoriert */ }
}

function addLib(l, persist = true) {
  const lib = libs.find((x) => x.name === l.name) || (libs.push({ id: libs.length + 1, name: String(l.name || "Bibliothek"), groups: [] }), libs.at(-1));
  for (const g of l.groups || []) {
    const grp = lib.groups.find((x) => x.name === g.name) || (lib.groups.push({ name: String(g.name || "Import"), symbols: [] }), lib.groups.at(-1));
    for (const s of g.symbols || []) {
      if (!validSymbol(s)) continue;
      const have = SYMBOL_BY_NAME[s.name];
      const sym = have || registerSymbol(normalize(s));
      if (!grp.symbols.includes(sym)) grp.symbols.push(sym);
    }
  }
  if (persist) save();
  return lib;
}

export function addSymbolToLib(libName, groupName, sym) {
  registerSymbol(sym);
  addLib({ name: libName, groups: [{ name: groupName, symbols: [sym] }] });
}
export function removeSymbol(sym) {
  for (const l of libs) for (const g of l.groups) g.symbols = g.symbols.filter((s) => s !== sym);
  for (const l of libs) l.groups = l.groups.filter((g) => g.symbols.length);
  save();
}
export function removeLib(lib) { libs.splice(libs.indexOf(lib), 1); save(); }

export function libFileText(lib) {
  return JSON.stringify({ format: LIB_FORMAT, version: 1, name: lib.name, groups: lib.groups.map((g) => ({ name: g.name, symbols: g.symbols })) }, null, 1);
}
export function loadLibText(text) {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error("Die Datei ist kein gültiges JSON."); }
  if (!o || o.format !== LIB_FORMAT) throw new Error("Das ist keine SchemaCAD-Bibliothek.");
  const before = libs.reduce((n, l) => n + l.groups.reduce((m, g) => m + g.symbols.length, 0), 0);
  const lib = addLib(o);
  const after = libs.reduce((n, l) => n + l.groups.reduce((m, g) => m + g.symbols.length, 0), 0);
  return { lib, added: after - before };
}

// Symbole eines Dokuments: benutzte Symbole aus Bibliotheken werden in der Datei mitgespeichert
export const usedCustom = (doc) => {
  const names = new Set();
  for (const sh of doc.sheets) for (const it of sh.items) if (it.type === "symbol" && SYMBOL_BY_NAME[it.sym]?.custom) names.add(it.sym);
  return [...names].map((n) => SYMBOL_BY_NAME[n]);
};
export function registerDocSymbols(list) {
  if (!Array.isArray(list)) return;
  for (const s of list) if (validSymbol(s)) registerSymbol(normalize(s));
}
export { counter };
