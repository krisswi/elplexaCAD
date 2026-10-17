// Eingangsverdrahtung per Knopf (CJ 16.10., Vorlage Referenzen/CJ Eingangsverdrahtung.png): Zuleitung VNB von unten in den HAK
// (PEN-Aufteilung im Kasten), L1 bis N senkrecht hoch in die Hauptlinien (Anfang links "feed"), PE-Linie ab dem HAK nach rechts
// auf 90 mm mit HPAS und Erde. Von den Hauptlinien in Spalte 4: NH 3-polig + N-Trenner, darunter SPD 3+1 auf PE.
// Alles sind gewöhnliche Objekte, danach einzeln bearbeitbar. BMK von NH und SPD vergibt renumber (3F4, 3T4).
import { SYMBOL_BY_NAME, anchorX } from "./symbols.js";
import { COL_CENTERS } from "./frame.js";
import { baseItems, hasBase, BASE_TAG } from "./template.js";
import { groupWires, FEED_X } from "./hauptlinien.js";

export const FEED_PE_Y = 90; // PE-Linie nach CJs Zeichnung
const r3 = (v) => Math.round(v * 1000) / 1000;

// Fügt die Eingangsverdrahtung in das Schemablatt sh ein. Gibt eine Fehlermeldung oder "" zurück.
export function insertFeed(sh, nextId) {
  if (sh.kind) return "Die Eingangsverdrahtung gehört auf ein Schemablatt.";
  if (sh.main?.l === "feed") return "Auf diesem Blatt ist die Eingangsverdrahtung schon eingefügt.";
  if (!hasBase(sh.items)) sh.items.push(...baseItems(nextId));
  const ws = groupWires(sh.items); // N bis L1
  if (ws.length !== 4) return "Die Eingangsverdrahtung braucht die Hauptlinien L1, L2, L3 und N.";
  const pe = sh.items.find((w) => w.type === "wire" && w.tag === BASE_TAG && w.kind === "pe" && w.pts.length === 2);
  if (!pe) return "Die Eingangsverdrahtung braucht die PE-Linie der Grundverkabelung.";
  const sym = (name, x, y, attrs = {}) => {
    const it = { id: nextId(), type: "symbol", sym: name, x: r3(x), y: r3(y), rot: 0, attrs: Object.fromEntries(SYMBOL_BY_NAME[name].attrs.map((a) => [a.tag, attrs[a.tag] ?? a.def])) };
    sh.items.push(it); return it;
  };
  const wire = (kind, pts) => sh.items.push({ id: nextId(), type: "wire", kind, pts: pts.map(([x, y]) => [r3(x), r3(y)]) });
  sh.main = { ...(sh.main || { r: "next" }), l: "feed" }; // Linien beginnen über den Leitern vom HAK (syncMains)
  const railY = [...ws].reverse().map((w) => w.pts[0][1]); // L1, L2, L3, N
  // PE-Linie: beginnt am PE des HAK, liegt auf 90 mm; der Name „PE“ folgt (Zuordnung über die Höhe)
  const peLabel = sh.items.find((t) => t.type === "text" && t.tag === BASE_TAG && Math.abs(t.y + 1 - pe.pts[0][1]) < 1e-6);
  pe.pts = [[FEED_X + 20, FEED_PE_Y], [pe.pts[1][0], FEED_PE_Y]];
  if (peLabel) peLabel.y = FEED_PE_Y - 1;
  // HAK: Anschlüsse oben auf der PE-Höhe, L1 bis N senkrecht in die Hauptlinien, Zuleitung VNB von unten
  sym("HAK_TNCS_1", FEED_X, FEED_PE_Y, { BMK: "HAK in HV", STROM: "200A", GROESSE: "NH1" });
  railY.forEach((y, i) => wire(i === 3 ? "neutral" : "netz", [[FEED_X + i * 5, FEED_PE_Y], [FEED_X + i * 5, y]]));
  const zx = FEED_X + 7.5, zy = FEED_PE_Y - 30;
  wire("leitung", [[zx, zy], [zx, 35]]);
  sh.items.push({ id: nextId(), type: "text", x: zx - 8, y: 31, h: 2.5, s: "Zuleitung VNB" });
  // HPAS an der PE-Linie, darunter die Erde
  const hx = 107.5; // rechts vom Text „HAK“
  wire("pe", [[hx, FEED_PE_Y], [hx, 80]]);
  sym("HPAS_1P", hx, 80);
  wire("pe", [[hx, 72.5], [hx, 65]]);
  sym("ERDE_1P", hx, 65);
  // Spalte 4: NH 3P + N-Trenner an den Hauptlinien, darunter SPD 3+1 auf PE
  const nx = COL_CENTERS[3] - anchorX(4), nhY = 160, spdY = FEED_PE_Y + 20;
  sym("NH_3PT", nx, nhY, { STROM: "TM", GROESSE: "NH00" });
  railY.forEach((y, i) => wire(i === 3 ? "neutral" : "netz", [[nx + i * 5, nhY], [nx + i * 5, y]]));
  sym("SPD_4P_1", nx, spdY, { TYP: "Typ 1+2 200A" });
  for (let i = 0; i < 4; i++) wire(i === 3 ? "neutral" : "netz", [[nx + i * 5, nhY - 20], [nx + i * 5, spdY]]);
  return "";
}
