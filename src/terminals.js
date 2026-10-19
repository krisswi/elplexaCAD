// Klemmenleiste: Anzahl Klemmen folgt immer aus der Kabelangabe (7x2.5 gibt 7 Klemmen).
import { textBox, unionBox } from "./geom.js";

export const T_PITCH = 5; // Klemmenabstand = Polabstand der Symbole
export const T_H = 8;     // Klemmenhöhe
const T_W = 5;
export const MAX_TERMINALS = 60;

// Liest „5x1.5mm2“, „TT 7x1,5“, „5G1.5“. Gibt Aderzahl und Querschnitt zurück oder null.
// Fernmeldekabel „U72 2x4x0.8“ oder „4x2x0.8“ (CJ 18.10.2026): Adern = Produkt der ersten beiden Zahlen, q = Aderdurchmesser, tel = true.
export function parseCable(s) {
  const t = /(\d+)\s*[xX×*]\s*(\d+)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)/.exec(String(s ?? ""));
  if (t) { const n = parseInt(t[1], 10) * parseInt(t[2], 10); return n >= 1 && n <= MAX_TERMINALS ? { n, q: t[3].replace(",", "."), tel: true } : null; }
  const m = /(\d+)\s*[xX×*gG]\s*(\d+(?:[.,]\d+)?)/.exec(String(s ?? ""));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n < 1 || n > MAX_TERMINALS) return null;
  return { n, q: m[2].replace(",", ".") };
}

export const termCount = (it) => (parseCable(it.cable)?.n ?? Math.max(1, Math.min(MAX_TERMINALS, it.n || 1)));

// Die einzelnen Klemmen als Symbolobjekte (Blöcke KLEMME_R und KLEMME_PE)
// noterm (CJ 16.10.): Leiste ohne Klemmen, nur BMK, Kabel und Bezeichnung (z. B. Abgang mit Verweis)
export function termItems(it) {
  if (it.noterm) return [];
  const n = termCount(it);
  const out = [];
  for (let i = 0; i < n; i++) {
    const pe = it.pe !== "none" && i === n - 1;
    out.push({ type: "symbol", sym: pe ? "KLEMME_PE" : "KLEMME_R", x: it.x + i * T_PITCH, y: it.y, rot: 0, attrs: {} });
  }
  return out;
}

// Klemmentext (CJ 18.10.2026): je Klemme überschreibbar (lab[i], leer = Nummer bzw. „PE“), höchstens 2 Zeilen à 5 Zeichen, Zeilen mit „|“ getrennt.
export const LAB_LINE = 5;
export const labLines = (v) => String(v ?? "").split("|").slice(0, 2).map((l) => l.trim().slice(0, LAB_LINE));
export const cleanLab = (v) => labLines(v).filter((l, i, a) => l || i < a.length - 1).join("|").replace(/\|$/, "");
// Klemmentexte, zentriert in der Klemme (Höhe 2.2, zweizeilig oder lang kleiner). vert: senkrecht (r = 90), Zeilen nebeneinander.
export function termNumbers(it) {
  if (it.noterm) return [];
  const n = termCount(it);
  const out = [];
  for (let i = 0; i < n; i++) {
    const own = labLines(it.lab?.[i]).filter(Boolean), lines = own.length ? own : [it.pe !== "none" && i === n - 1 ? "PE" : String(i + 1)];
    const long = Math.max(...lines.map((l) => l.length)), x = it.x + i * T_PITCH, y = it.y - T_H / 2;
    // Höhe: waagrecht passt eine Zeile mit 5 Zeichen in 4,6 mm Breite, senkrecht in 7,4 mm Höhe; zwei Zeilen brauchen je eine halbe Klemme
    const h = Math.min(2.2, it.vert ? 7.4 / (long * 0.55) : 4.6 / (long * 0.55), lines.length > 1 ? (it.vert ? 2.1 : 3.4) : 9);
    lines.forEach((s, k) => {
      const d = lines.length > 1 ? (k ? -1 : 1) * h * 0.6 : 0; // zwei Zeilen: erste oben (waagrecht) bzw. links (senkrecht)
      out.push(it.vert ? { x: x - d, y, h: Math.round(h * 100) / 100, s, r: 90 } : { x, y: y + d, h: Math.round(h * 100) / 100, s });
    });
  }
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
