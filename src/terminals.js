// Klemmenleiste: Anzahl Klemmen folgt immer aus der Kabelangabe (7x2.5 gibt 7 Klemmen).
import { textBox, unionBox } from "./geom.js";

export const T_PITCH = 5; // Klemmenabstand = Polabstand der Symbole
export const T_H = 8;     // Klemmenhöhe
const T_W = 5;
export const MAX_TERMINALS = 60;

// Liest „5x1.5mm2“, „TT 7x1,5“, „5G1.5“. Gibt Aderzahl und Querschnitt zurück oder null.
export function parseCable(s) {
  const m = /(\d+)\s*[xX×*gG]\s*(\d+(?:[.,]\d+)?)/.exec(String(s ?? ""));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n < 1 || n > MAX_TERMINALS) return null;
  return { n, q: m[2].replace(",", ".") };
}

export const termCount = (it) => (parseCable(it.cable)?.n ?? Math.max(1, Math.min(MAX_TERMINALS, it.n || 1)));

// Die einzelnen Klemmen als Symbolobjekte (Blöcke KLEMME_R und KLEMME_PE)
export function termItems(it) {
  const n = termCount(it);
  const out = [];
  for (let i = 0; i < n; i++) {
    const pe = it.pe !== "none" && i === n - 1;
    out.push({ type: "symbol", sym: pe ? "KLEMME_PE" : "KLEMME_R", x: it.x + i * T_PITCH, y: it.y, rot: 0, attrs: {} });
  }
  return out;
}

// Klemmennummern, zentriert in der Klemme (Höhe 2.2). Die PE-Klemme trägt „PE“.
export function termNumbers(it) {
  const n = termCount(it);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: it.x + i * T_PITCH, y: it.y - T_H / 2, h: 2.2, s: it.pe !== "none" && i === n - 1 ? "PE" : String(i + 1) });
  return out;
}

const TH = 2.5;
export function termTexts(it) {
  const out = [];
  if (it.bmk) out.push({ x: it.x - T_W / 2 - 1 - it.bmk.length * TH * 0.5 - 0.5, y: it.y - T_H / 2 - 1, h: TH, s: it.bmk });
  if (it.cable) out.push({ x: it.x - T_W / 2, y: it.y - T_H - 4.5, h: TH, s: it.cable });
  if (it.name) out.push({ x: it.x - T_W / 2, y: it.y - T_H - 8.5, h: TH, s: it.name });
  return out;
}

export function termBBox(it) {
  const n = termCount(it);
  const boxes = [{ x0: it.x - T_W / 2, y0: it.y - T_H, x1: it.x + (n - 1) * T_PITCH + T_W / 2, y1: it.y }];
  for (const t of termTexts(it)) boxes.push(textBox(t.x, t.y, t.h, t.s));
  return unionBox(boxes);
}

export function termPins(it) {
  const pins = [];
  for (let i = 0; i < termCount(it); i++) pins.push({ x: it.x + i * T_PITCH, y: it.y }, { x: it.x + i * T_PITCH, y: it.y - T_H });
  return pins;
}

export const newTerminals = (x, y, over = {}) => ({ type: "terminals", x, y, cable: "5x1.5mm2", n: 5, name: "", bmk: "X1", pe: "last", ...over });
