// Gemeinsame Geometriehilfen.

// Grobe Textfläche (Schrift Barlow Semi Condensed, ca. 0,5 Texthöhe pro Zeichen)
export const textBox = (x, y, h, s) => ({ x0: x, y0: y - 0.25 * h, x1: x + Math.max(1, s.length) * h * 0.5, y1: y + 0.95 * h });

export const unionBox = (boxes) => ({
  x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)),
  x1: Math.max(...boxes.map((b) => b.x1)), y1: Math.max(...boxes.map((b) => b.y1)),
});
