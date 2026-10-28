// Plansymbole Steckdosen 5.160 (aus plansym.js herausgelöst, CJ 27.10.2026)
import { L, C, T, S, box, tri, SC, SR } from "./teile.js";

// ---------- Steckdosen 5.160: Stiel von der Wand, Bogen am Ende (Öffnung zum Raum), Querstrich = Schutzkontakt ----------
// Aufputz Steckdose (CJ 26.10.2026): rechte Hälfte der Fläche im Bogen gefüllt, wie beim Schalter
const apSock = (oy = 0) => ["p", `M0,${oy + 3.9}L1.5,${oy + 3.9}A1.5 1.5 0 0 0 0,${oy + 2.4}Z`, true];
// Mehrfachsteckdose 5.160: Schrägstrich durch den Stiel zur Zahl (Text ["t", …, "num"]: am Symbol änderbar, Feld num)
const multi = (n, oy = 0) => [L(-0.7, oy + 2.95, 1.3, oy + 1.45), ["t", 2.0, oy + 1.2, 1.4, n, "num"]];
// Fang der Leitungen (CJ 28.10.2026): hinten am Stiel (Wand) statt vorne in der Öffnung, dazu Bogenenden und Querstrich
const SO = { wall: true, h: 30, ap: apSock(), snap: [[0, 0], [1.5, 3.9], [0, 2.4], [-1.5, 3.9]] };
const SOCK = (s = 1, oy = 0, pe = true) => [["p", `M${-1.5 * s},${oy + 3.9 * s}A${1.5 * s} ${1.5 * s} 0 0 1 ${1.5 * s},${oy + 3.9 * s}`, false], L(0, oy, 0, oy + 2.4 * s), ...(pe ? [L(-1.5 * s, oy + 2.4 * s, 1.5 * s, oy + 2.4 * s)] : [])]; // CJ 24.10.2026: Stiel an der Wand, Bogen zum Raum offen; Variante B: Querstrich am Bogenscheitel, so breit wie der Bogen (5.160)

// Tabelle als /* @__PURE__ */-Aufruf: fällt im SchemaCAD-Bau ganz weg (v3 byte-gleich), obwohl plan.js sie über plansym.js importiert
export const STECKDOSEN = /* @__PURE__ */ (() => [
  // Steckdosen
  S("STD", "Steckdose T13 (Schutzkontakt)", "kraft", "Steckdosen", SOCK(), SO),
  S("STD2", "Steckdose 2-fach", "kraft", "Steckdosen", [...SOCK(), ...multi("2")], SO),
  S("STD3", "Steckdose 3-fach", "kraft", "Steckdosen", [...SOCK(), ...multi("3")], SO),
  S("STD_T15", "Steckdose T15", "kraft", "Steckdosen", [...SOCK(), T(2.9, 1.0, 1.4, "T15")], SO),
  // T13 mit USB wie Quelle: T13 und USB-Zeichen über dem Bogen (CJ 28.10.2026: höher, sonst deckt Aufputz sie zu), Schrägstrich zur Anzahl (änderbar)
  S("STD_USB", "Steckdose T13 mit USB", "kraft", "Steckdosen", [...SOCK(), ...multi("2"), T(0, 5.9, 1.1, "T13"), L(-0.85, 4.65, 0.75, 4.65), C(-0.85, 4.65, 0.18, true), tri([0.75, 4.42], [1.1, 4.65], [0.75, 4.88], true), L(-0.35, 4.65, -0.1, 5), L(-0.1, 5, 0.3, 5), L(0.05, 4.65, 0.3, 4.35), L(0.3, 4.35, 0.55, 4.35)], SO),
  S("STD_BODEN", "Bodensteckdose", "kraft", "Steckdosen", [...box(-1.8, -1.8, 1.8, 1.8), ...SOCK(0.75, -1.4625)], { pin: [0, 0, 1.8] }), // Steckdose mittig im Kasten (CJ 26.10.2026)
  // KOMBI wie Quelle (CJ 28.10.2026): Schalterkreis so gross wie bei den Schaltern, Steckdose ohne Stiel direkt auf dem Kreis, Hebel waagrecht mit Querstrich zur Wand
  S("KOMBI", "KOMBI Gr. 1 Schalter/Steckdose", "kraft", "Steckdosen", [C(0, SC[1], SR), L(-1.5, 3.7, 1.5, 3.7), ["p", "M-1.5,5.2A1.5 1.5 0 0 1 1.5,5.2", false], L(SR, SC[1], 3.7, SC[1]), L(3.7, SC[1], 3.7, SC[1] - 0.9)], { pin: [0, 5.2, 1.5], wall: true, h: 110, ap: true, c: [0, 3.7], r: 3.8 }),
])();
