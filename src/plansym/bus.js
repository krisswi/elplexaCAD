// Plansymbole BUS/KNX 5.260 (CJ 28.10.2026, Plan Runde 3): Taster 1-, 2-, 4-fach ohne/mit LED, PIR-Melder, IR- und Funkempfänger, Displays.
// Selbst gezeichnet nach der Symbolzusammenfassung (IEC 60617), Format und Masse siehe plansym.js. Farbe wie Kommunikation (gleiche Kategorie).
import { L, C, T, S, box, tri } from "./teile.js";

// ---------- BUS-Taster: Querstrich an der Wand, Stiel, Kasten zum Raum; 2-fach senkrecht geteilt, 4-fach zusätzlich waagrecht ----------
// LED: gefülltes Dreieck in der Ecke links zum Raum wie die Quelle
const BT = (n, led) => [L(-0.7, 0, 0.7, 0), L(0, 0, 0, 1.4), ...box(-1.2, 1.4, 1.2, 3.8),
  ...(n > 1 ? [L(0, 1.4, 0, 3.8)] : []), ...(n > 2 ? [L(-1.2, 2.6, 1.2, 2.6)] : []), ...(led ? [tri([-1.2, 3.8], [-1.2, 2.8], [-0.2, 3.8], true)] : [])];
const BTO = { wall: true, h: 110, c: [0, 2.6], r: 2.2, edge: [-1.2, 1.4, 1.2, 3.8] };
// Empfang (IR, Funk): Pfeilspitze in den Kasten, zwei Wellen davor
const RX = (x) => [tri([x - 0.75, 0.3], [x - 0.75, -0.3], [x - 0.25, 0], true), ["p", `M${x - 1},0.4A0.55 0.55 0 0 1 ${x - 1},-0.4`, false], ["p", `M${x - 1.3},0.55A0.75 0.75 0 0 1 ${x - 1.3},-0.55`, false]];

// Tabelle als /* @__PURE__ */-Aufruf: fällt im SchemaCAD-Bau ganz weg (v3 byte-gleich), obwohl plan.js sie über plansym.js importiert
export const BUS = /* @__PURE__ */ (() => [
  S("BUS_T1", "BUS-Taster 1-fach ohne LED", "kommunikation", "BUS/KNX", BT(1, false), BTO),
  S("BUS_T2", "BUS-Taster 2-fach ohne LED", "kommunikation", "BUS/KNX", BT(2, false), BTO),
  S("BUS_T4", "BUS-Taster 4-fach ohne LED", "kommunikation", "BUS/KNX", BT(4, false), BTO),
  S("BUS_T1L", "BUS-Taster 1-fach mit LED", "kommunikation", "BUS/KNX", BT(1, true), BTO),
  S("BUS_T2L", "BUS-Taster 2-fach mit LED", "kommunikation", "BUS/KNX", BT(2, true), BTO),
  S("BUS_T4L", "BUS-Taster 4-fach mit LED", "kommunikation", "BUS/KNX", BT(4, true), BTO),
  // PIR: drei Strahlen links, Kasten mit Pfeil und Wellen
  S("BUS_PIR", "BUS-PIR-Melder", "kommunikation", "BUS/KNX", [...box(-0.4, -0.8, 2, 0.8), L(-0.4, 0, -2, 0.8), L(-0.4, 0, -2, 0), L(-0.4, 0, -2, -0.8), L(0, 0, 0.6, 0), tri([0.6, 0.3], [0.6, -0.3], [1.1, 0], true), ["p", "M1.3,0.35A0.5 0.5 0 0 0 1.3,-0.35", false], ["p", "M1.55,0.45A0.65 0.65 0 0 0 1.55,-0.45", false]], { r: 2.2 }),
  S("BUS_IR", "Infrarotempfänger", "kommunikation", "BUS/KNX", [...RX(-0.6), ...box(-0.6, -0.8, 1.8, 0.8), T(0.6, 0, 1, "IR")], { r: 2.2, c: [0.2, 0] }),
  S("BUS_FUNK", "Funkempfänger", "kommunikation", "BUS/KNX", [...RX(-0.6), ...box(-0.6, -0.8, 1, 0.8)], { r: 1.9, c: [-0.2, 0] }),
  S("BUS_INFO", "BUS-Info-Display", "kommunikation", "BUS/KNX", [...box(-1, -1, 1, 1), ...box(-0.6, -0.05, 0.6, 0.55)], { r: 1.4 }),
  S("BUS_TABLEAU", "BUS-Anzeige, Bedientableau", "kommunikation", "BUS/KNX", [...box(-3, -1.3, 3, 1.3), ...box(-2.6, -0.9, 2.6, 0.9), T(0, 0, 1, "121.22")], { r: 3.3 }),
])();
