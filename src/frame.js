// Blattrahmen und Schriftfeld (A4 quer, mm, y nach oben). Geometrie wie im Etappe-0-Demo.

export const W = 297, H = 210;
export const M_OUT = 5, M_IN = 10, TB_H = 15, COLS = 8, ROWS = 6;

const x0 = M_IN, x1 = W - M_IN, y0 = M_IN + TB_H, y1 = H - M_IN;
const cw = (x1 - x0) / COLS, rh = (y1 - y0) / ROWS;

// Feldmitten (Mitte der Zahl bzw. des Buchstabens im Rahmen)
export const COL_CENTERS = Array.from({ length: COLS }, (_, c) => x0 + cw * (c + 0.5));
export const ROW_CENTERS = Array.from({ length: ROWS }, (_, r) => y1 - rh * (r + 0.5));
// Spalte 1 bis 8 zu einer x-Koordinate
export const colOf = (x) => Math.max(1, Math.min(COLS, Math.floor((x - x0) / cw) + 1));

// Zeile A bis F zu einer y-Koordinate
export const rowOf = (y) => String.fromCharCode(65 + Math.max(0, Math.min(ROWS - 1, Math.floor((y1 - y) / rh))));

export function frameGeometry() {
  const polys = [
    [[M_OUT, M_OUT], [W - M_OUT, M_OUT], [W - M_OUT, H - M_OUT], [M_OUT, H - M_OUT], [M_OUT, M_OUT]],
    [[x0, M_IN], [x1, M_IN], [x1, y1], [x0, y1], [x0, M_IN]],
  ];
  const lines = [];
  const labels = [];
  for (let c = 0; c < COLS; c++) {
    const cx = x0 + cw * (c + 0.5);
    labels.push({ x: cx, y: H - (M_OUT + M_IN) / 2, s: String(c + 1) });
    labels.push({ x: cx, y: (M_OUT + M_IN) / 2, s: String(c + 1) });
    if (c) {
      lines.push([x0 + cw * c, y1, x0 + cw * c, H - M_OUT]);
      lines.push([x0 + cw * c, M_OUT, x0 + cw * c, M_IN]);
    }
  }
  for (let r = 0; r < ROWS; r++) {
    const cy = y1 - rh * (r + 0.5);
    const s = String.fromCharCode(65 + r);
    labels.push({ x: (M_OUT + M_IN) / 2, y: cy, s });
    labels.push({ x: W - (M_OUT + M_IN) / 2, y: cy, s });
    if (r) {
      lines.push([M_OUT, y1 - rh * r, M_IN, y1 - rh * r]);
      lines.push([x1, y1 - rh * r, W - M_OUT, y1 - rh * r]);
    }
  }
  return { polys, lines, labels };
}

// Schriftfeld: Ursprung (M_IN, M_IN). Linien und Felder in lokalen Koordinaten.
export const TB_ORIGIN = { x: M_IN, y: M_IN };
export const TB_W = W - 2 * M_IN;

const TB_COLS = [45, 120, 200, 235]; // senkrechte Trennlinien im Schriftfeld

export function titleBlockGeometry() {
  const fw = TB_W;
  const polys = [[[0, 0], [fw, 0], [fw, TB_H], [0, TB_H], [0, 0]]];
  const lines = TB_COLS.map((x) => [x, 0, x, TB_H]);
  lines.push([200, TB_H / 2, fw, TB_H / 2]);
  return { polys, lines };
}

export const META_FIELDS = [
  { tag: "GEZEICHNET", label: "Gezeichnet", x: 2, y: 10, def: "" },
  { tag: "DATUM", label: "Datum", x: 2, y: 4, def: "" },
  { tag: "OBJEKT", label: "Objekt", x: 47, y: 10, def: "" },
  { tag: "TITEL", label: "Blattitel", x: 122, y: 10, def: "" },
  { tag: "AUFTRAG", label: "Auftrag", x: 202, y: 10, def: "" },
  { tag: "SCHEMA", label: "Schema", x: 202, y: 3.5, def: "" },
  { tag: "BLATT", label: "Blatt", x: 237, y: 10, def: "1" },
  { tag: "INDEX", label: "Index", x: 237, y: 3.5, def: "A" },
];
export const META_H = 3;

// Text im Schriftfeld auf die Zellbreite kürzen, gleich für Anzeige, PDF und DXF. Das Modell behält den vollen Text.
// Zeichenbreite geschätzt mit 0,55 × Texthöhe (Barlow Semi Condensed: Grossbuchstaben ca. 0,51). "..." statt "…", weil die DXF-Schrift txt nur ASCII sicher kann.
export function metaText(f, s) {
  const w = [...TB_COLS, TB_W].find((x) => x > f.x) - f.x - 1, n = Math.floor(w / (0.55 * META_H)), c = [...String(s)];
  return c.length > n ? c.slice(0, n - 3).join("") + "..." : String(s);
}
