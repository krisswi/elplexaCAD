// Elektrosymbole für das Modul «Plan» (CJ 24.10.2026, Schritt 2): selbst gezeichnet nach der Symbolzusammenfassung (IEC 60617, Haustechnik
// 5.110–5.190, Clean-Room, nichts übernommen). Ohne DOM, mit node testbar.
// Masse in Papier-mm (Symbol ca. 5 mm, fest auf dem Papier wie Texte; in der Welt × Massstab), y nach oben, Ursprung = Einsetzpunkt.
// Wandsymbole (wall: true): Ursprung auf der Wandfläche, das Symbol steht nach +y in den Raum. Übrige: Ursprung = Mitte.
// Teile: ["l", x1, y1, x2, y2] Linie, ["c", cx, cy, r, fill] Kreis, ["p", d, fill] Pfad (SVG, y nach oben: Bogen-Flag 1 = gegen den Uhrzeigersinn), ["t", x, y, h, s] Text (Mitte; dreht mit, steht nie auf dem Kopf).
// ap = Aufputz-Teil (Halbkreis) oder false. cat = Kategorie für die Farben (Farbcodes 5.100, CAT_COL in plan.js): kraft, licht, kommunikation, schwach, allg, leitung (wie die Leitungen).
// h = Standardhöhe in cm (CJ 26.10.2026: Steckdose 30, Schalter 110, Leuchten ohne); im Plan beschriftet wird nur eine abweichende Höhe.
//
// Aufbau (CJ 27.10.2026): je Kategorie eine Datei in src/plansym/ (Teile in teile.js), diese Datei fügt sie in der Reihenfolge
// der Symbolleiste zusammen und ist der einzige Zugriff von aussen: symDef(key), PLAN_SYMS, SYM_GROUPS. Neue Kategorie = neue Datei + Eintrag unten.

import { SCHALTER } from "./plansym/schalter.js";
import { STECKDOSEN } from "./plansym/steckdosen.js";
import { LICHT } from "./plansym/licht.js";
import { MELDER } from "./plansym/melder.js";
import { GERAETE } from "./plansym/geraete.js";
import { KOMMUNIKATION } from "./plansym/kommunikation.js";
import { ALLGEMEIN } from "./plansym/allgemein.js";

// Tabellen als /* @__PURE__ */-Aufrufe: so fallen sie im SchemaCAD-Bau ganz weg (v3 byte-gleich), obwohl plan.js sie importiert
export const PLAN_SYMS = /* @__PURE__ */ (() => [...SCHALTER, ...STECKDOSEN, ...LICHT, ...MELDER, ...GERAETE, ...KOMMUNIKATION, ...ALLGEMEIN])();
export const SYM_BY_KEY = /* @__PURE__ */ (() => new Map(PLAN_SYMS.map((s) => [s.key, s])))();
export const SYM_GROUPS = /* @__PURE__ */ (() => [...new Set(PLAN_SYMS.map((s) => s.group))])();
// Gemeinsamer Zugriff auf ein Plansymbol (CJ 27.10.2026): Definition zum Schlüssel oder undefined
export const symDef = (key) => SYM_BY_KEY.get(key);
