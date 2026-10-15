// Grundverkabelung: aktive Leiter oben, PE-Linie unten. Klemmen entstehen erst mit den Geräten.

export const BASE_TAG = "grund";
export const X0 = 20, X1 = 277;

export function baseItems(nextId) {
  const items = [];
  const line = (name, kind, y) => {
    items.push({ id: nextId(), type: "wire", kind, pts: [[X0, y], [X1, y]], tag: BASE_TAG });
    items.push({ id: nextId(), type: "text", x: 12, y: y - 1, h: 2.5, s: name, tag: BASE_TAG });
  };
  line("L1", "netz", 190);
  line("L2", "netz", 185);
  line("L3", "netz", 180);
  line("N", "neutral", 175);
  line("PE", "pe", 45);
  return items;
}

export const hasBase = (items) => items.some((i) => i.tag === BASE_TAG);
