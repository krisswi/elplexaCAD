// Wandlermessung (CJ 16.10.): das Symbol ZAEHLER_4P_W (Palette, alte Dateien, Vorlagen) wird in drei Teile zerlegt:
// Wandlerteil ZW_WANDLER (Stromwandler, Spannungspfad mit Sicherungen, Prüfklemmen), Zähler ZW_ZAEHLER und 10 Leitungen dazwischen.
// Zähler und Leitungen tragen of = Wandlerteil und folgen ihm. Der Zähler allein lässt sich frei verschieben, die Leitungen
// knicken dann gestaffelt, damit sie sich nicht überdecken (wm = Nummer des Leiters von links).
import { WM_X, WM_PIN_Y, WM_BOX_Y, SYMBOL_BY_NAME, rotatePoint } from "./symbols.js";

const r3 = (v) => Math.round(v * 1000) / 1000;
const at = (it, x, y) => { const o = rotatePoint(x, y, it.rot || 0); return [r3(it.x + o.x), r3(it.y + o.y)]; };

// Zerlegt alle ZAEHLER_4P_W eines Blatts. Gibt true zurück, wenn etwas geändert wurde.
export function splitWandler(items, nextId) {
  let changed = false;
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (it.type !== "symbol" || it.sym !== "ZAEHLER_4P_W") continue;
    const a = it.attrs || {};
    const trafo = { ...it, sym: "ZW_WANDLER", attrs: Object.fromEntries(SYMBOL_BY_NAME.ZW_WANDLER.attrs.map((x) => [x.tag, x.def])) };
    delete trafo.manual;
    const [bx, by] = at(it, 0, WM_BOX_Y);
    const box = { id: nextId(), type: "symbol", sym: "ZW_ZAEHLER", x: bx, y: by, rot: it.rot || 0, of: it.id,
      attrs: { BMK: a.BMK ?? "P?", ZAEHLERNR: a.ZAEHLERNR ?? "", WANDLER: a.WANDLER ?? "150/5A", TEXT: SYMBOL_BY_NAME.ZW_ZAEHLER.attrs.find((x) => x.tag === "TEXT").def } };
    if (it.manual) box.manual = true;
    const wires = WM_X.map((x, i) => ({ id: nextId(), type: "wire", kind: "leitung", pts: [at(it, x, WM_PIN_Y), at(it, x, WM_BOX_Y)], of: it.id, wm: i }));
    items.splice(k, 1, trafo, box, ...wires);
    k += 1 + wires.length;
    changed = true;
  }
  return changed;
}

export function splitWandlerDoc(doc) {
  const nextId = () => doc.nextId++;
  let changed = false;
  for (const sh of doc.sheets) if (!sh.kind && (splitWandler(sh.items, nextId) | fixWandler(sh.items))) changed = true;
  return changed;
}

// Grössen geändert (16.10., Leiter auf 2,5-mm-Raster): Leitungen aus Dateien mit der ersten Teilung führen neu an die Anschlüsse.
// Der Zähler bleibt, wo er ist. Gibt true zurück, wenn etwas geändert wurde.
export function fixWandler(items) {
  let changed = false;
  for (const tr of items) {
    if (tr.type !== "symbol" || tr.sym !== "ZW_WANDLER") continue;
    const box = items.find((i) => i.of === tr.id && i.sym === "ZW_ZAEHLER");
    for (const w of items) {
      if (w.type !== "wire" || w.of !== tr.id || w.wm === undefined || w.wm >= WM_X.length) continue;
      const a = at(tr, WM_X[w.wm], WM_PIN_Y), b = box ? at(box, WM_X[w.wm], 0) : w.pts.at(-1);
      const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
      if (same(w.pts[0], a) && same(w.pts.at(-1), b)) continue;
      w.pts = routeWm(a, b, w.wm); changed = true;
    }
  }
  return changed;
}

// Leitung zwischen Wandlerteil (a) und Zähler (b): gerade, wenn möglich, sonst ein Knick je Leiter in eigener Höhe.
// Beim Verschieben nach rechts knickt der rechte Leiter zuerst (nahe a), nach links der linke: so kreuzen sie sich nicht.
export function routeWm(a, b, i, n = WM_X.length) {
  if (a[0] === b[0] || a[1] === b[1]) return [a, b];
  const span = Math.abs(b[1] - a[1]), sg = Math.sign(b[1] - a[1]);
  const k = b[0] > a[0] ? n - 1 - i : i, step = Math.min(1, Math.max(0, span - 1) / (n - 1)); // Knicke 1 mm auseinander, bei wenig Platz enger
  const jy = r3(span < 1 ? (a[1] + b[1]) / 2 : a[1] + sg * (0.5 + k * step));
  return [a, [a[0], jy], [b[0], jy], b];
}

// Teile, die einem Wandlerteil folgen (Zähler und Leitungen)
export const wmParts = (items, ids) => items.filter((i) => i.of !== undefined && i.type !== "terminals" && ids.has(i.of));
