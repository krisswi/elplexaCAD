// Gemeinsame Geometriehilfen.

// Grobe Textfläche (Schrift Barlow Semi Condensed, ca. 0,5 Texthöhe pro Zeichen)
export const textBox = (x, y, h, s) => ({ x0: x, y0: y - 0.25 * h, x1: x + Math.max(1, s.length) * h * 0.5, y1: y + 0.95 * h });
// Freier Text mit Drehung r (Grad, Gegenuhrzeigersinn um den Anfangspunkt): Fläche als umschliessendes Rechteck.
// Ausrichtung al (CJ 19.10.2026): "c" mittig, "r" rechtsbündig am Punkt, fehlt = linksbündig
export const alShift = (t) => (t.al === "c" ? 0.5 : t.al === "r" ? 1 : 0) * Math.max(1, t.s.length) * t.h * 0.5;
export function textItemBox(t) {
  const b0 = textBox(t.x, t.y, t.h, t.s), d = alShift(t), b = d ? { ...b0, x0: b0.x0 - d, x1: b0.x1 - d } : b0;
  if (!t.r) return b;
  const c = Math.cos((t.r * Math.PI) / 180), s = Math.sin((t.r * Math.PI) / 180);
  const pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].map(([x, y]) => [t.x + (x - t.x) * c - (y - t.y) * s, t.y + (x - t.x) * s + (y - t.y) * c]);
  return { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) };
}

export const unionBox = (boxes) => ({
  x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)),
  x1: Math.max(...boxes.map((b) => b.x1)), y1: Math.max(...boxes.map((b) => b.y1)),
});
