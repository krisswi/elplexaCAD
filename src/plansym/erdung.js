// Plansymbole Erdung und Blitzschutz (CJ 27.10.2026, Aufgaben Plan 20): Erdung/Potenzialausgleich 5.120, Blitzschutz 5.130, Hausanschlusskasten.
// Selbst gezeichnet nach der Symbolzusammenfassung (IEC 60617), Format und Masse siehe plansym.js. Auswahl CJ 27.10.2026: alles aus 5.120,
// PA-Schiene, Erder, Tiefenerder, Mess-Trennstelle, Verbindungen und Geräte aus 5.130, HAK. Erdleitungen sind Leitungsarten (plan.js LINE_KINDS).
import { r3, L, C, S, box, tri, wave, half45, seg45 } from "./teile.js";

// Erdzeichen: drei kürzer werdende Striche unter y, Stiel von y bis top
const earth = (y, top) => [L(0, y, 0, top), L(-1.5, y, 1.5, y), L(-1, y - 0.5, 1, y - 0.5), L(-0.5, y - 1, 0.5, y - 1)];
// Leitungsstummel links und rechts (Geräte in der Leitung): Fang an den Enden über edge auf der Mittellinie
const stubs = (a, b) => [L(-b, 0, -a, 0), L(a, 0, b, 0)];
// Tabelle als /* @__PURE__ */-Aufruf: fällt im SchemaCAD-Bau ganz weg (v3 byte-gleich), obwohl plan.js sie über plansym.js importiert
export const ERDUNG = /* @__PURE__ */ (() => [
  // Hausanschlusskasten: Kasten an der Wand, Grösse in echten mm wie der Verteiler; wie Quelle (CJ 28.10.2026): gefülltes Kreissegment auf der Raumseite statt «HAK»
  S("HAK", "Hausanschlusskasten (HAK)", "erdung", "Erdung/PA", [], { wall: true, c: [0, 1.5], r: 3, size: { w: 400, t: 150, parts: (W, T) => { const c = 0.8 * W, s = 0.35 * T, R = (c * c / 4 + s * s) / (2 * s); return [...box(-W / 2, 0, W / 2, T), ["p", `M${r3(-c / 2)},${r3(T)}A${r3(R)} ${r3(R)} 0 0 1 ${r3(c / 2)},${r3(T)}Z`, true]]; } } }),
  // Erdung und Potenzialausgleich 5.120
  S("ERDE", "Erdung, allgemein", "erdung", "Erdung/PA", earth(0, 1.6), { r: 1.9, c: [0, 0.3] }),
  S("PA", "Potenzialausgleich", "erdung", "Erdung/PA", [L(0, 1.6, 0, 0.6), tri([-1.4, 0.6], [1.4, 0.6], [0, -1.4])], { r: 1.9, c: [0, 0.1] }),
  S("ERDE_ANS", "Erdungs-Anschluss", "erdung", "Erdung/PA", [...earth(0, 1.4), C(0, 1.7, 0.35, true)], { r: 2, c: [0, 0.4] }),
  S("ERDE_KK", "Erdungs-Klemmkasten", "erdung", "Erdung/PA", [...box(-2.2, -1.4, 2.2, 1.4), L(0, 0.9, 0, 0.3), L(-1.2, 0.3, 1.2, 0.3), L(-0.8, -0.2, 0.8, -0.2), L(-0.4, -0.7, 0.4, -0.7)], { r: 2.6, edge: [-2.2, -1.4, 2.2, 1.4] }),
  S("SCHUTZERDE", "Schutzerde", "erdung", "Erdung/PA", [C(0, 0, 1.8), L(0, 1.1, 0, 0.3), L(-1.1, 0.3, 1.1, 0.3), L(-0.7, -0.2, 0.7, -0.2), L(-0.35, -0.7, 0.35, -0.7)], { r: 2 }),
  S("ERDBAND", "Erdband Fe 30 × 3 mm", "erdung", "Erdung/PA", [["t", 0, 0.7, 1.1, "Fe 30/3"], L(-2.4, -0.4, -1.4, -0.4), L(-0.9, -0.4, 0.1, -0.4), L(0.6, -0.4, 1.6, -0.4), L(2.1, -0.4, 2.4, -0.4)], { r: 2.5 }),
  // Potenzialausgleichsschiene (HPAS): Schiene mit vier Klemmen, Leiter nach unten; Fang auf allen Seiten
  S("PA_SCHIENE", "Potenzialausgleichsschiene (HPAS)", "erdung", "Erdung/PA", [...box(-3, -0.7, 3, 0.9), ...[-1.8, -0.6, 0.6, 1.8].flatMap((x) => [C(x, 0.2, 0.35), L(x, -0.15, x, -1.7)])], { r: 3.2, edge: [-3, -0.7, 3, 0.9] }),
  S("ERDER", "Erder, allgemein", "erdung", "Erdung/PA", earth(-0.4, 1.8), { r: 2, c: [0, 0.2] }),
  S("TIEFENERDER", "Tiefenerder (vertikaler Erder)", "erdung", "Erdung/PA", [...earth(-0.6, 1.2), C(0, 1.6, 0.4)], { r: 2.2, c: [0, 0.4] }),
  S("MESSTRENN", "Mess-Trennstelle", "erdung", "Erdung/PA", [...stubs(1.1, 2.6), C(-0.55, 0, 0.55), C(0.55, 0, 0.55)], { r: 2.7, edge: [-2.6, 0, 2.6, 0] }),
  S("VERB_ANS", "Verbindung oder Anschluss", "erdung", "Erdung/PA", [L(0, -2, 0, 2), L(-1.8, 0, 0, 0), C(0, 0, 0.3, true)], { r: 2.1 }),
  // Blitzschutz 5.130: Geräte in der Leitung und Verbindungen
  S("SPD", "Überspannungsableiter (SPD)", "erdung", "Blitzschutz", [...box(-2, -0.9, 2, 0.9), ...stubs(2, 3), ["t", 0, 0, 1.1, "SPD"]], { r: 3.1, edge: [-3, 0, 3, 0] }),
  S("FUNKEN", "Trennfunkenstrecke", "erdung", "Blitzschutz", [...box(-2, -0.9, 2, 0.9), ...stubs(1.5, 3), tri([-1.5, 0.55], [-1.5, -0.55], [-0.3, 0], true), tri([1.5, 0.55], [1.5, -0.55], [0.3, 0], true)], { r: 3.1, edge: [-3, 0, 3, 0] }),
  S("DEHNBOGEN", "Dehnungsbogen", "erdung", "Blitzschutz", [...stubs(1, 2.5), ["p", "M-1,0A1 1 0 0 0 1,0", false], C(-1, 0, 0.25, true), C(1, 0, 0.25, true)], { r: 2.6, edge: [-2.5, 0, 2.5, 0] }),
  S("FLEXVERB", "Flexible Verbindung", "erdung", "Blitzschutz", [...stubs(1.2, 2.5), wave(-1.2, 1.2)], { r: 2.6, edge: [-2.5, 0, 2.5, 0] }),
  // Verbindungen nach oben/unten wie Quelle (CJ 28.10.2026): gleiche Zeichen wie die Steigleitungen 5.110 (halber Pfeil, Ring am Ende)
  S("VERB_AUF", "Verbindung nach oben", "erdung", "Blitzschutz", [C(0, 0, 0.4), seg45(0.4, 4.2), ...half45(3.2, 4.2)], { r: 2.4, c: [1.5, 1.5] }),
  S("VERB_AB", "Verbindung nach unten", "erdung", "Blitzschutz", [C(0, 0, 0.4), seg45(-4.2, -0.4), ...half45(-1.5, -0.5)], { r: 2.4, c: [-1.5, -1.5] }),
  S("VERB_DURCH", "Verbindung nach oben und unten", "erdung", "Blitzschutz", [C(0, 0, 0.4), seg45(-4.2, -0.4), seg45(0.4, 4.2), ...half45(-1.5, -0.5), ...half45(3.2, 4.2)], { r: 3.2 }),
])();
