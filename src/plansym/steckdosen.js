// Plansymbole Steckdosen 5.160 (aus plansym.js herausgelöst, CJ 27.10.2026)
import { L, C, T, S, box, tri, apHalf } from "./teile.js";

// ---------- Steckdosen 5.160: Stiel von der Wand, Bogen am Ende (Öffnung zum Raum), Querstrich = Schutzkontakt ----------
// Aufputz Steckdose (CJ 26.10.2026): rechte Hälfte der Fläche im Bogen gefüllt, wie beim Schalter
const apSock = (oy = 0) => ["p", `M0,${oy + 3.9}L1.5,${oy + 3.9}A1.5 1.5 0 0 0 0,${oy + 2.4}Z`, true];
// Mehrfachsteckdose 5.160: Schrägstrich durch den Stiel zur Zahl (Text ["t", …, "num"]: am Symbol änderbar, Feld num)
const multi = (n, oy = 0) => [L(-0.7, oy + 2.95, 1.3, oy + 1.45), ["t", 2.0, oy + 1.2, 1.4, n, "num"]];
const SOCK = (s = 1, oy = 0, pe = true) => [["p", `M${-1.5 * s},${oy + 3.9 * s}A${1.5 * s} ${1.5 * s} 0 0 1 ${1.5 * s},${oy + 3.9 * s}`, false], L(0, oy, 0, oy + 2.4 * s), ...(pe ? [L(-1.5 * s, oy + 2.4 * s, 1.5 * s, oy + 2.4 * s)] : [])]; // CJ 24.10.2026: Stiel an der Wand, Bogen zum Raum offen; Variante B: Querstrich am Bogenscheitel, so breit wie der Bogen (5.160)

// Tabelle als /* @__PURE__ */-Aufruf: fällt im SchemaCAD-Bau ganz weg (v3 byte-gleich), obwohl plan.js sie über plansym.js importiert
export const STECKDOSEN = /* @__PURE__ */ (() => [
  // Steckdosen
  S("STD", "Steckdose T13 (Schutzkontakt)", "kraft", "Steckdosen", SOCK(), { wall: true, h: 30, ap: apSock() }),
  S("STD2", "Steckdose 2-fach", "kraft", "Steckdosen", [...SOCK(), ...multi("2")], { wall: true, h: 30, ap: apSock() }),
  S("STD3", "Steckdose 3-fach", "kraft", "Steckdosen", [...SOCK(), ...multi("3")], { wall: true, h: 30, ap: apSock() }),
  S("STD_T15", "Steckdose T15", "kraft", "Steckdosen", [...SOCK(), T(2.9, 1.0, 1.4, "T15")], { wall: true, h: 30, ap: apSock() }),
  // T13 mit USB wie Quelle: T13 über dem Bogen, USB-Zeichen im Bogen, Schrägstrich zur Anzahl (änderbar)
  S("STD_USB", "Steckdose T13 mit USB", "kraft", "Steckdosen", [...SOCK(), ...multi("2"), T(0, 5.1, 1.1, "T13"), L(-0.85, 3.35, 0.75, 3.35), C(-0.85, 3.35, 0.18, true), tri([0.75, 3.12], [1.1, 3.35], [0.75, 3.58], true), L(-0.35, 3.35, -0.1, 3.7), L(-0.1, 3.7, 0.3, 3.7), L(0.05, 3.35, 0.3, 3.05), L(0.3, 3.05, 0.55, 3.05)], { wall: true, h: 30, ap: apSock() }),
  S("STD_BODEN", "Bodensteckdose", "kraft", "Steckdosen", [...box(-1.8, -1.8, 1.8, 1.8), ...SOCK(0.75, -1.4625)], { pin: [0, 0, 1.8] }), // Steckdose mittig im Kasten (CJ 26.10.2026)
  // KOMBI wie Quelle: Schalterkreis an der Wand, kurzer Stiel (halb so lang) zur Steckdose, Hebel waagrecht mit Querstrich zum Raum
  S("KOMBI", "KOMBI Gr. 1 Schalter/Steckdose", "kraft", "Steckdosen", [C(0, 1.2, 1), L(0, 2.2, 0, 3.4), L(-1.5, 3.4, 1.5, 3.4), ["p", "M-1.5,4.9A1.5 1.5 0 0 1 1.5,4.9", false], L(0.95, 1.5, 2.6, 1.5), L(2.6, 1.5, 2.6, 2.3)], { pin: [0, 4.9, 1.5], wall: true, h: 110, ap: apHalf(1.2, 1), c: [0, 2.6], r: 3 }),
])();
