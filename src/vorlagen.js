// Abgang als Vorlage (16.10.2026): Schutzgeräte, Leitungen zur Grundverkabelung und Klemmenleiste mit Kabel in einem Klick.
// Eine Vorlage ist reine Daten: Geräte von oben nach unten, Leiter von links nach rechts, Kabel. Eigene Vorlagen (später)
// brauchen nur dieselbe Form, zum Beispiel aus einer Datei oder der Online-Ablage.
import { SYMBOL_BY_NAME, POLE, anchorX, isDevice } from "./symbols.js";
import { COL_CENTERS, colOf } from "./frame.js";
import { BASE_TAG } from "./template.js";
import { conductorKind } from "./bundle.js";
import { newTerminals, parseCable } from "./terminals.js";

export const TEMPLATE_PREFIX = "A:";
export const TEMPLATES = [
  { id: "ls1", short: "LS 1P+N", label: "LS 1-polig, L und N", sub: "C13A, Kabel 3x1.5mm2", devs: [{ sym: "LS_1P" }], cond: ["L1", "N"], cable: "3x1.5mm2" },
  { id: "ls3", short: "LS 3P+N", label: "LS 3-polig, L1 bis N", sub: "C16A, Kabel 5x2.5mm2", devs: [{ sym: "LS_3P", attrs: { STROM: "16A" } }], cond: ["L1", "L2", "L3", "N"], cable: "5x2.5mm2" },
  { id: "rcbo2", short: "RCBO", label: "FI/LS (RCBO) 2-polig", sub: "B16A 30mA, Kabel 3x1.5mm2", devs: [{ sym: "RCBO_2P" }], cond: ["L1", "N"], cable: "3x1.5mm2" },
  { id: "fils", short: "FI + LS", label: "FI 2-polig und LS 1-polig", sub: "40A 30mA, C13A, Kabel 3x1.5mm2", devs: [{ sym: "FI_2P" }, { sym: "LS_1P" }], cond: ["L1", "N"], cable: "3x1.5mm2" },
];
export const templateOf = (key) => [...TEMPLATES, ...CUSTOM].find((t) => TEMPLATE_PREFIX + t.id === key) || null;

// Eigene Abgänge (CJ 16.10.: „Zu Abgänge hinzufügen“): Auswahl im Schema als Vorlage speichern. Gespeichert im Browser
// (localStorage), gilt damit für alle Dateien auf diesem Rechner. Form: { id, label, sub, custom, cx, thumb, items }.
const STORE_KEY = "schemacad.abgaenge";
function loadCustom() { try { const a = JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } }
function storeCustom() { try { localStorage.setItem(STORE_KEY, JSON.stringify(CUSTOM)); return true; } catch { return false; } }
export const CUSTOM = loadCustom();
const DROP = ["tag", "link", "ends", "rail", "side", "rname", "main", "manual"];
const devCenter = (d) => d.x + anchorX(SYMBOL_BY_NAME[d.sym].poles);

// Vorlage aus Objekten (Auswahl samt Klemmen). Gibt null, wenn kein Gerät, keine Leitung und keine Klemme dabei ist.
export function makeCustom(label, picked) {
  const keep = picked.filter((i) => ["symbol", "wire", "terminals", "text"].includes(i.type) && i.tag !== BASE_TAG && !i.main && !(i.type === "symbol" && !SYMBOL_BY_NAME[i.sym]));
  if (!keep.some((i) => i.type !== "text")) return null;
  const items = keep.map((i) => { const c = JSON.parse(JSON.stringify(i)); for (const k of DROP) delete c[k]; if (c.type === "symbol" && isDevice(SYMBOL_BY_NAME[c.sym])) c.attrs.BMK = ""; return c; });
  const devs = items.filter((i) => i.type === "symbol").sort((a, b) => b.y - a.y);
  const xs = items.flatMap((i) => (i.pts ? i.pts.map((p) => p[0]) : [i.x]));
  const cx = devs.length ? devCenter(devs[0]) : (Math.min(...xs) + Math.max(...xs)) / 2;
  const term = items.find((i) => i.type === "terminals");
  const sub = [devs.map((d) => SYMBOL_BY_NAME[d.sym].label.replace("Leitungsschutzschalter", "LS").replace("FI-Schutzschalter", "FI").replace("FI/LS-Schalter (RCBO)", "RCBO")).join(" + "), term?.cable ? "Kabel " + term.cable : ""].filter(Boolean).join(", ");
  return { id: "u" + Date.now().toString(36), label: label.trim() || "Eigener Abgang", sub: sub || "eigener Abgang", custom: true, cx: r3(cx), thumb: devs.at(-1)?.sym ?? null, items };
}
export function addCustom(tpl) { CUSTOM.push(tpl); return storeCustom(); }
export function removeCustom(id) { const i = CUSTOM.findIndex((t) => t.id === id); if (i >= 0) CUSTOM.splice(i, 1); return storeCustom(); }

// Eigener Abgang in Spalte col: Kopie mit neuen IDs, waagrecht auf die Spaltenmitte geschoben, Höhe wie gespeichert.
function customItems(tpl, col, items, ids) {
  if (tpl.items.some((i) => i.type === "symbol" && isDevice(SYMBOL_BY_NAME[i.sym])) && items.some((i) => i.type === "symbol" && isDevice(SYMBOL_BY_NAME[i.sym]) && colOf(devCenter(i)) === col)) return { error: `In Spalte ${col} steht schon ein Gerät. Wähle eine freie Spalte.` };
  const dx = r3(COL_CENTERS[col - 1] - tpl.cx), idMap = new Map(), bundles = new Map();
  const out = tpl.items.map((it) => {
    const c = JSON.parse(JSON.stringify(it)); c.id = ids(); idMap.set(it.id, c.id);
    if (c.bundle !== undefined) { if (!bundles.has(c.bundle)) bundles.set(c.bundle, ids()); c.bundle = bundles.get(c.bundle); }
    if (c.pts) c.pts = c.pts.map((p) => [r3(p[0] + dx), p[1]]); else c.x = r3(c.x + dx);
    return c;
  });
  for (const c of out) if (c.type === "terminals" && c.of !== undefined) { if (idMap.has(c.of)) c.of = idMap.get(c.of); else delete c.of; }
  return { items: out };
}

const TOP = 160, GAP = 10, LEN = 20; // oberes Gerät: Pins oben bei y 160, Pollänge 20 mm, Abstand zwischen Geräten
const r3 = (n) => Math.round(n * 1000) / 1000;

// Schienen der Grundverkabelung: Name -> { y, x0, x1 } (Text der Grundverkabelung liegt 1 mm unter der Linie)
function rails(items) {
  const out = {};
  for (const t of items) if (t.type === "text" && t.tag === BASE_TAG) {
    const w = items.find((i) => i.type === "wire" && i.tag === BASE_TAG && Math.abs(i.pts[0][1] - (t.y + 1)) < 1e-6);
    if (w) out[t.s] = { y: w.pts[0][1], x0: Math.min(w.pts[0][0], w.pts.at(-1)[0]), x1: Math.max(w.pts[0][0], w.pts.at(-1)[0]) };
  }
  return out;
}

// Objekte des Abgangs in Spalte col (1 bis 8). Gibt { items } oder { error } zurück. ids: Funktion für neue IDs.
export function abgangItems(tpl, col, items, ids) {
  if (tpl.custom) return customItems(tpl, col, items, ids);
  const r = rails(items), pe = r.PE;
  const miss = tpl.cond.filter((n) => !r[n]);
  if (miss.length || !pe) return { error: `Auf diesem Blatt fehlt die Grundverkabelung (${[...miss, ...(pe ? [] : ["PE"])].join(", ")}).` };
  if (items.some((i) => i.type === "symbol" && isDevice(SYMBOL_BY_NAME[i.sym]) && colOf(i.x + anchorX(SYMBOL_BY_NAME[i.sym].poles)) === col)) return { error: `In Spalte ${col} steht schon ein Gerät. Wähle eine freie Spalte.` };
  const x0 = r3(COL_CENTERS[col - 1] - anchorX(SYMBOL_BY_NAME[tpl.devs[0].sym].poles));
  const xs = tpl.cond.map((_, k) => r3(x0 + k * POLE));
  if (tpl.cond.some((n, k) => xs[k] < r[n].x0 || xs[k] > r[n].x1) || xs.at(-1) + POLE > pe.x1) return { error: `In Spalte ${col} erreicht der Abgang die Hauptlinien nicht. Wähle eine Spalte weiter innen.` };
  const out = [], devs = [];
  let y = TOP;
  for (const d of tpl.devs) {
    const sym = SYMBOL_BY_NAME[d.sym];
    const dev = { id: ids(), type: "symbol", sym: d.sym, x: x0, y, rot: 0, attrs: Object.fromEntries(sym.attrs.map((a) => [a.tag, d.attrs?.[a.tag] ?? a.def])) };
    out.push(dev); devs.push(dev); y -= LEN + GAP;
  }
  // Je Leiter: Schiene → durch alle Geräte mit diesem Pol → Klemme. Ein Leiter ohne Pol (N beim LS 1-polig) geht gerade durch.
  tpl.cond.forEach((name, k) => {
    let from = r[name].y;
    for (const dev of devs) {
      if (k >= SYMBOL_BY_NAME[dev.sym].poles) continue;
      out.push({ id: ids(), type: "wire", kind: conductorKind(name), pts: [[xs[k], from], [xs[k], dev.y]] });
      from = dev.y - LEN;
    }
    out.push({ id: ids(), type: "wire", kind: conductorKind(name), pts: [[xs[k], from], [xs[k], pe.y]] });
  });
  const n = parseCable(tpl.cable)?.n ?? tpl.cond.length + 1;
  out.push({ id: ids(), ...newTerminals(x0, pe.y, { cable: tpl.cable, n, bmk: "" }), of: devs.at(-1).id }); // Klemmen gehören zum untersten Gerät
  return { items: out };
}
