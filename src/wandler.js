// Wandlermessung: das Palettensymbol ZAEHLER_4P_W wird beim Setzen in Einzelteile zerlegt (seit 17.10., splitWandler).
// Stand 16.10. (alte Dateien): Wandlerteil ZW_WANDLER, Zähler ZW_ZAEHLER und 10 Leitungen; Zähler und Leitungen tragen of = Wandlerteil und folgen ihm. Der Zähler allein lässt sich frei verschieben, die Leitungen
// knicken dann gestaffelt, damit sie sich nicht überdecken (wm = Nummer des Leiters von links).
import { WM_X, WM_PIN_Y, SYMBOL_BY_NAME, rotatePoint, wm2Layout } from "./symbols.js";

const r3 = (v) => Math.round(v * 1000) / 1000;
const at = (it, x, y) => { const o = rotatePoint(x, y, it.rot || 0); return [r3(it.x + o.x), r3(it.y + o.y)]; };

// Zerlegt alle ZAEHLER_4P_W eines Blatts in Einzelteile (CJ 17.10., BKW-Schema): Stromwandler, Sicherungen, Prüfklemmen und Zähler
// als Symbole, alles andere als gewöhnliche Leitungen und Texte. Danach ist jedes Teil einzeln bearbeitbar und löschbar.
// Gibt true zurück, wenn etwas geändert wurde.
export function splitWandler(items, nextId) {
  let changed = false;
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (it.type !== "symbol" || it.sym !== "ZAEHLER_4P_W") continue;
    const a = it.attrs || {}, rot = it.rot || 0, L = wm2Layout(), out = [];
    for (const o of L.syms) {
      const def = SYMBOL_BY_NAME[o.sym], [x, y] = at(it, o.x, o.y);
      const s = { id: nextId(), type: "symbol", sym: o.sym, x, y, rot, attrs: Object.fromEntries(def.attrs.map((d) => [d.tag, (o.attrs || {})[d.tag] ?? d.def])) };
      if (o.sym === "ZW_ZAEHLER2") { for (const t of ["BMK", "ZAEHLERNR", "WANDLER"]) if (a[t] !== undefined) s.attrs[t] = a[t]; if (it.manual) s.manual = true; }
      out.push(s);
    }
    for (const w of L.wires) out.push({ id: nextId(), type: "wire", kind: "leitung", pts: w.map(([x, y]) => at(it, x, y)) });
    for (const t of L.texts) out.push(freeText(it, t, nextId()));
    items.splice(k, 1, ...out);
    k += out.length - 1;
    changed = true;
  }
  return changed;
}

// Symboltext (Mitte bzw. linksbündig, Mitte der Schrifthöhe) als freier Text (links, Grundlinie), Breite ca. 0,5 Texthöhe je Zeichen
function freeText(it, t, id) {
  const h = t.h, w = t.s.length * h * 0.5, r = t.r || 0;
  const lx = r ? 0.35 * h : t.al === "l" ? 0 : -w / 2, ly = r ? -w / 2 : -0.35 * h; // r 90: Grundlinie rechts der Mitte, Text läuft nach oben
  const [x, y] = at(it, t.x + lx, t.y + ly), rr = ((r + (it.rot || 0)) % 360 + 360) % 360;
  return { id, type: "text", x, y, h, s: t.s, ...(rr ? { r: rr } : {}) };
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
