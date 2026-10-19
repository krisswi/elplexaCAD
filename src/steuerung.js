// Steuerung als Kasten mit frei wählbaren Klemmen (Wunsch CJ 18.10.2026: KNX, Energiemanagement). Objekt `ctrl`:
// x, y = linke obere Ecke, h = Höhe (mm), name = Bezeichnung im Kasten, bmk = Betriebsmittelkennzeichen links daneben,
// top / bot = Klemmen oben bzw. unten, mit Komma getrennt (z. B. "L, N, KNX+, KNX-"). Klemmen im Polabstand 5 mm,
// Anschlusspunkte auf der Kastenkante, Klemmentext innen. Breite folgt aus der grössten Klemmenzahl (mindestens 20 mm).
import { textBox, unionBox } from "./geom.js";

export const CTRL_PITCH = 5;
export const MAX_CTRL_TERMS = 40;
const TH = 1.8, BH = 2.5; // Klemmentext, BMK und Bezeichnung
const r3 = (n) => Math.round(n * 1000) / 1000;

export const ctrlTerms = (s) => String(s ?? "").split(",").map((t) => t.trim().slice(0, 8)).filter(Boolean).slice(0, MAX_CTRL_TERMS);
export const ctrlWidth = (it) => Math.max(20, (Math.max(ctrlTerms(it.top).length, ctrlTerms(it.bot).length) + 1) * CTRL_PITCH);
export const newCtrl = (x, y) => ({ type: "ctrl", x, y, h: 25, name: "Steuerung", bmk: "", top: "L, N", bot: "1, 2, 3, 4" });

// Anschlusspunkte: oben auf y, unten auf y - h, von links ab x + 5
export function ctrlPins(it) {
  const pins = [];
  ctrlTerms(it.top).forEach((_, i) => pins.push({ x: r3(it.x + (i + 1) * CTRL_PITCH), y: it.y }));
  ctrlTerms(it.bot).forEach((_, i) => pins.push({ x: r3(it.x + (i + 1) * CTRL_PITCH), y: r3(it.y - it.h) }));
  return pins;
}

// Zeichnung als einfache Teile: l = Linie, t = Text (c: mittig, sonst linksbündig). Gleich für SVG und DXF.
export function ctrlPrims(it) {
  const w = ctrlWidth(it), x0 = it.x, y0 = it.y, x1 = r3(x0 + w), y1 = r3(y0 - it.h), out = [];
  out.push({ t: "l", x1: x0, y1: y0, x2: x1, y2: y0 }, { t: "l", x1, y1: y0, x2: x1, y2: y1 }, { t: "l", x1, y1, x2: x0, y2: y1 }, { t: "l", x1: x0, y1, x2: x0, y2: y0 });
  const fit = (s) => Math.min(TH, 4.6 / (Math.max(1, s.length) * 0.55)); // Text passt in den Klemmenabstand
  ctrlTerms(it.top).forEach((s, i) => { const x = r3(x0 + (i + 1) * CTRL_PITCH); out.push({ t: "l", x1: x, y1: y0, x2: x, y2: r3(y0 - 1) }, { t: "t", x, y: r3(y0 - 2.6), h: r3(fit(s)), s, c: true }); });
  ctrlTerms(it.bot).forEach((s, i) => { const x = r3(x0 + (i + 1) * CTRL_PITCH); out.push({ t: "l", x1: x, y1, x2: x, y2: r3(y1 + 1) }, { t: "t", x, y: r3(y1 + 2.6), h: r3(fit(s)), s, c: true }); });
  if (it.name) out.push({ t: "t", x: r3(x0 + w / 2), y: r3(y0 - it.h / 2), h: BH, s: it.name, c: true });
  if (it.bmk) out.push({ t: "t", x: r3(x0 - 1.5 - it.bmk.length * BH * 0.5), y: r3(y0 - BH - 0.5), h: BH, s: it.bmk });
  return out;
}

export function ctrlBBox(it) {
  const boxes = [{ x0: it.x, y0: it.y - it.h, x1: it.x + ctrlWidth(it), y1: it.y }];
  for (const p of ctrlPrims(it)) if (p.t === "t" && !p.c) boxes.push(textBox(p.x, p.y, p.h, p.s));
  return unionBox(boxes);
}

// Aus der Datei: unbekannte Felder fallen weg, Werte begrenzt. Gibt null bei unbrauchbarem Objekt.
export function cleanCtrl(it, id) {
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  if (!num(it.x) || !num(it.y)) return null;
  return { id, type: "ctrl", x: it.x, y: it.y, h: num(it.h) && it.h >= 10 && it.h <= 200 ? it.h : 25, name: String(it.name ?? ""), bmk: String(it.bmk ?? ""), top: String(it.top ?? ""), bot: String(it.bot ?? "") };
}
