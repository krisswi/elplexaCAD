// Automatische Nummerierung: Blatt + Kennbuchstabe + Spalte (10F2), übereinander .1, .2 (oberstes ohne Punkt). Klemmen: X statt F.
// Kennbuchstabe je Familie (BMK_LETTER): Schutzgeräte F, SPD T, Zähler P. Gezählt wird je Spalte und Buchstabe (SPD 3T2 und LS 3F2 in derselben Spalte).
import { SYMBOL_BY_NAME, isDevice, anchorX, bmkLetter } from "./symbols.js";
import { colOf, rowOf } from "./frame.js";
import { newTerminals, termCount } from "./terminals.js";
import { syncMains } from "./hauptlinien.js";

const centerX = (it) => it.x + anchorX(SYMBOL_BY_NAME[it.sym].poles);

// Setzt BMK der Schutzgeräte und der zugehörigen Klemmenleisten. Gibt true zurück, wenn etwas geändert wurde.
export function renumber(model) {
  let changed0 = false;
  const sheet = String(model.meta.BLATT ?? "").trim();
  const devs = model.items.filter((i) => i.type === "symbol" && SYMBOL_BY_NAME[i.sym] && bmkLetter(SYMBOL_BY_NAME[i.sym]) && !i.manual);
  // Klemmen gehören immer zum untersten Gerät der Spalte (CJ 16.10.: RCD und LS übereinander, Klemmen beim LS)
  const all = model.items.filter((i) => i.type === "symbol" && isDevice(SYMBOL_BY_NAME[i.sym])), lowest = new Map();
  for (const d of all) { const c = colOf(centerX(d)), l = lowest.get(c); if (!l || d.y < l.y || (d.y === l.y && d.x < l.x)) lowest.set(c, d); }
  for (const t of model.items) {
    const d = t.type === "terminals" && t.of !== undefined && all.find((i) => i.id === t.of), low = d && lowest.get(colOf(centerX(d)));
    if (low && low !== d) { t.of = low.id; changed0 = true; }
  }
  const cols = new Map(), add = (k, d) => (cols.get(k) || cols.set(k, []).get(k)).push(d);
  // Wandlermessung (CJ 18.10.): Zähler und beschriftete Sicherung zählen in der Spalte des mittleren Stromwandlers (über ihnen, rechts von x0)
  const cts = model.items.filter((i) => i.type === "symbol" && i.sym === "ZW_CT");
  const ctCol = (x0, x1, y) => {
    const near = cts.filter((c) => c.x > x0 && c.x < x1 && c.y > y).sort((a, b) => a.x - b.x), mid = near[Math.min(1, near.length - 1)];
    return mid ? colOf(mid.x + 1.25) : null;
  };
  for (const d of devs) add(((d.sym === "ZW_ZAEHLER2" && ctCol(d.x, d.x + 45, d.y)) || colOf(centerX(d))) + bmkLetter(SYMBOL_BY_NAME[d.sym]), d);
  for (const f of model.items) {
    if (f.type !== "symbol" || f.sym !== "ZW_SICH" || f.manual || !String(f.attrs.FBMK ?? "").trim()) continue;
    add((ctCol(f.x - 1, f.x + 45, f.y) ?? colOf(f.x)) + "F", f);
  }
  let changed = changed0;
  for (const [k, list] of cols) {
    const c = parseInt(k, 10), letter = k.slice(String(c).length);
    list.sort((a, b) => b.y - a.y || a.x - b.x); // oben zuerst
    list.forEach((d, i) => {
      const suffix = i ? "." + i : "";
      const bmk = `${sheet}${letter}${c}${suffix}`;
      const tag = d.sym === "ZW_SICH" ? "FBMK" : "BMK";
      if (d.attrs[tag] !== bmk) { d.attrs[tag] = bmk; changed = true; }
      for (const t of model.items) {
        if (t.type === "terminals" && t.of === d.id && !t.manual) {
          const x = `${sheet}X${c}`; // Klemmen: Spalte ohne Zähler
          if (t.bmk !== x) { t.bmk = x; changed = true; }
        }
      }
    });
  }
  return changed;
}

// Klemmenleiste unter einem Gerät: Polzahl plus PE, oben auf der PE-Linie (sonst y 45)
export function deviceTerminals(dev, items, nextId) {
  const pe = items.find((i) => i.type === "wire" && i.kind === "pe" && i.pts.length === 2 && i.pts[0][1] === i.pts[1][1]);
  const y = pe ? pe.pts[0][1] : 45;
  return { id: nextId(), ...newTerminals(dev.x, y, { cable: "", n: SYMBOL_BY_NAME[dev.sym].poles + 1, bmk: "" }), of: dev.id };
}

// Pro Spalte bekommt nur das erste Gerät Klemmen. Gibt true zurück, wenn in der Spalte schon Auto-Klemmen stehen.
export const columnHasTerminals = (items, dev) => {
  const c = colOf(centerX(dev));
  return items.some((t) => t.type === "terminals" && t.of !== undefined && t.of !== dev.id && (() => { const d = items.find((i) => i.id === t.of); return d && colOf(centerX(d)) === c; })());
};

export const linkedTerminals = (items, ids) => items.filter((t) => t.type === "terminals" && ids.has(t.of));
export { termCount };

// ---------- Verweise von Blatt zu Blatt ----------
const OPPOSITE = { VOUT: "VIN", VIN: "VOUT" };
export const isRef = (it) => it.type === "symbol" && SYMBOL_BY_NAME[it.sym].family in OPPOSITE;
export const fieldOf = (it) => `${rowOf(it.y)}${colOf(centerX(it))}`; // zum Beispiel C3: Zeile C, Spalte 3

export function findItem(doc, id) {
  for (const sheet of doc.sheets) { const item = sheet.items.find((i) => i.id === id); if (item) return { item, sheet }; }
  return null;
}

// Alle noch nicht verknüpften Verweise der Gegenseite (abgehend zu ankommend und umgekehrt)
export function openCounterparts(doc, it) {
  const want = OPPOSITE[SYMBOL_BY_NAME[it.sym].family];
  const out = [];
  for (const sheet of doc.sheets) for (const o of sheet.items) {
    if (o.type === "symbol" && SYMBOL_BY_NAME[o.sym].family === want && o.link === undefined && !!o.rname === !!it.rname) out.push({ item: o, sheet, label: refLabel(o, sheet), same: !!it.rname && o.rname === it.rname });
  }
  return out.sort((a, b) => Number(b.same) - Number(a.same));
}
export const refLabel = (it, sheet) => `Blatt ${sheet.meta.BLATT || "?"}, Feld ${fieldOf(it)}, ${it.rname ? "Hauptlinie " + it.rname : SYMBOL_BY_NAME[it.sym].poles + "-polig"}`;

export function unlinkRef(doc, it) {
  if (it.link === undefined) return;
  const o = findItem(doc, it.link)?.item;
  if (o) delete o.link;
  delete it.link;
}
export function linkRefs(doc, a, b) {
  unlinkRef(doc, a); unlinkRef(doc, b);
  a.link = b.id; b.link = a.id;
}

// Ziel-Text jedes Verweises aus dem Gegenstück berechnen (zum Beispiel 45.C3)
export function updateRefs(doc) {
  for (const sheet of doc.sheets) for (const it of sheet.items) {
    if (!isRef(it)) continue;
    const other = it.link === undefined ? null : findItem(doc, it.link);
    if (it.link !== undefined && !other) delete it.link;
    it.attrs.ZIEL = other ? `${other.sheet.meta.BLATT || "?"}.${fieldOf(other.item)}` : "offen";
  }
}

export function renumberAll(doc) {
  for (const sheet of doc.sheets) renumber(sheet);
  syncMains(doc); // Grundverkabelung: Verweise zum nächsten Blatt
  updateRefs(doc);
}
