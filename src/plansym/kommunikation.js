// Plansymbole Kommunikation (CJ 27.10.2026, Aufgaben Plan 6): Telefon 5.200, IT 5.250, Video/Radio/TV 5.240, Sonnerie 5.220.
// Selbst gezeichnet nach der Symbolzusammenfassung (IEC 60617), Format und Masse siehe plansym.js.
import { L, C, S, box, halfC } from "./teile.js";

// ---------- Anschlüsse 5.200/5.240/5.250: Stiel von der Wand, Querstrich, zwei kurze Schenkel zum Raum (wie die Steckdose, Fang gleich) ----------
const TSOCK = [L(0, 0, 0, 2.4), L(-1.5, 2.4, 1.5, 2.4), L(-1.5, 2.4, -1.5, 3.6), L(1.5, 2.4, 1.5, 3.6)];
const RJ = ["p", "M-0.9,2.75L0.9,2.75L0.9,3.25L-0.9,3.25Z", true]; // IT: gefüllter Balken zwischen den Schenkeln
const TS = { wall: true, h: 30, pin: [0, 3.6, 1.5] };
// Sprechstellen 5.220: hoher Kasten, Lautsprecher (Kreis) oben
const SPRECH = [...box(-1.1, -1.7, 1.1, 1.7), C(0, 0.65, 0.5)];

// Tabelle als /* @__PURE__ */-Aufruf: fällt im SchemaCAD-Bau ganz weg (v3 byte-gleich), obwohl plan.js sie über plansym.js importiert
export const KOMMUNIKATION = /* @__PURE__ */ (() => [
  // Telefon und EDV 5.200, 5.250
  S("TEL_STD", "Telefon-Steckdose", "kommunikation", "Telefon/EDV", TSOCK, TS),
  S("TEL_ANS", "Telefon-Anschlussdose", "kommunikation", "Telefon/EDV", [...TSOCK, L(-1.5, 3.6, 1.5, 3.6), C(0, 3.6, 0.35, true)], TS),
  S("IT_RJ", "IT-Anschluss RJ (EDV)", "kommunikation", "Telefon/EDV", [...TSOCK, RJ], TS),
  // 4-fach wie Quelle: Strich vom Balken zur Zahl (Zahl am Symbol änderbar, Feld num)
  S("IT_RJ4", "IT-Anschluss RJ 4-fach", "kommunikation", "Telefon/EDV", [...TSOCK, RJ, L(0.9, 3.1, 2.1, 4.0), ["t", 2.6, 4.5, 1.4, "4", "num"]], TS),
  S("TEL_APP", "Telefonapparat", "kommunikation", "Telefon/EDV", [...box(-1.5, -1.5, 1.5, 1.5), C(-0.6, 0, 0.3, true), C(0.6, 0, 0.3, true)], { r: 1.8 }),
  S("AMTSVERT", "Amtsverteiler (Hauptverteiler)", "kommunikation", "Telefon/EDV", [...box(-2.5, -1, 2.5, 1), L(-2.5, -1, 2.5, 1), L(-2.5, 1, 2.5, -1)], { r: 2.7 }),
  S("ZWVERT", "Zwischenverteiler", "kommunikation", "Telefon/EDV", [...box(-2.5, -1, 2.5, 1), L(-2.5, -1, 2.5, 1)], { r: 2.7 }),
  // Video, Radio, TV 5.240
  S("RTV_STD", "RTV-Steckdose (TV/Radio)", "kommunikation", "Video/TV", [...TSOCK, L(-0.8, 2.9, 0.8, 2.9), L(-0.8, 2.9, -0.8, 3.6), L(0.8, 2.9, 0.8, 3.6)], TS),
  S("RTV_VERT", "RTV-Verteiler", "kommunikation", "Video/TV", [...box(-1.5, -1.5, 1.5, 1.5), L(0, -1.5, 0, 1.5), L(0, 0.4, 1.5, 1.5)], { r: 1.8 }),
  S("KAMERA", "Kamera", "kommunikation", "Video/TV", [...box(-2.2, -0.7, 0.8, 0.7), ["p", "M0.8,0.3L2,0.8L2,-0.8L0.8,-0.3", false]], { r: 2.3 }),
  // Sonnerie 5.220
  S("KLINGEL", "Glocke, Klingel", "kommunikation", "Sonnerie", [halfC(1.5), L(-0.7, 0, -0.7, -0.9), L(0.7, 0, 0.7, -0.9)], { r: 1.8, c: [0, 0.3] }),
  S("SON_TASTER", "Sonnerietaster", "kommunikation", "Sonnerie", [C(0, 0, 1.1), C(0, 0, 0.5)], { r: 1.4, h: 110 }),
  S("TUEROEFFNER", "Türöffner", "kommunikation", "Sonnerie", [["p", "M-2,-0.55L2,-0.55L0.8,0.55L-2,0.55Z", false], L(0.8, 0.55, 0.8, -0.55), ["p", "M-1.5,-0.2L-1.5,0A0.3 0.3 0 0 0 -0.9,0A0.3 0.3 0 0 0 -0.3,0L-0.3,-0.2", false]], { r: 2.2 }),
  S("GEGENSPRECH", "Gegensprechanlage (Innensprechstelle)", "kommunikation", "Sonnerie", [...SPRECH, ["p", "M-0.75,-1.2L-0.15,-1.2L-0.15,-0.85L-0.75,-0.85Z", true], ["p", "M0.15,-1.2L0.75,-1.2L0.75,-0.85L0.15,-0.85Z", true]], { r: 2 }),
  S("AUSSENSPRECH", "Aussensprechstelle (Torsprechstelle)", "kommunikation", "Sonnerie", [...SPRECH, C(-0.55, -0.35, 0.12, true), C(-0.55, -1.0, 0.12, true), ...box(-0.3, -0.55, 0.65, -0.15), ...box(-0.3, -1.2, 0.65, -0.8)], { r: 2 }),
])();
