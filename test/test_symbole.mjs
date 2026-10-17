// Symbole nach Musterschema (CJ 16.10.2026): 3P+N und 4P, N-Trenner, HAK, Zähler, SPD, Schütz, Relais.
// Aufruf aus web-src: node test/test_symbole.mjs <Ausgabe.dxf>  (schreibt die DXF für symbole_tests.py)
import fs from "fs";
import assert from "node:assert";
import { newDoc, parseModel, serializeModel } from "../src/model.js";
import { exportDxf } from "../src/dxf.js";
import { SYMBOL_BY_NAME, FAMILIES, isDevice, variantByKey, hasTrenner } from "../src/symbols.js";

// Jede Variante der Palette existiert, Anschlüsse liegen auf dem 2,5-mm-Raster, Varianten einer Familie haben eigene Texte
for (const f of FAMILIES) {
  const labels = f.variants.map((v) => SYMBOL_BY_NAME[v].vlabel ?? SYMBOL_BY_NAME[v].poles + "-polig");
  assert.strictEqual(new Set(labels).size, labels.length, f.id);
  for (const v of f.variants) for (const p of SYMBOL_BY_NAME[v].pins) assert.ok(Math.abs((p.x / 2.5) % 1) < 1e-9 && Math.abs((p.y / 2.5) % 1) < 1e-9, v);
}
// 3P+N und 3P + N-Trenner: 4 Pole wie 4P (gleiche Klemmenzahl und Bündel), N-Pol ohne Auslöser, Trenner ohne Kopplung
// Nach Hager: Kreuz am Festkontakt jedes geschalteten LS-Pols (auch N), Auslöser (Pfeil) nur einmal am ersten Schutzpol, N mit "N"
const crosses = (s) => s.prims.filter((p) => p.t === "l" && Math.abs(Math.abs(p.x2 - p.x1) - 1.2) < 1e-9 && Math.abs(Math.abs(p.y2 - p.y1) - 1.2) < 1e-9).length / 2;
const trips = (s) => s.prims.filter((p) => p.t === "l" && Math.abs(p.y1 + 15.9) < 1e-9 && Math.abs(p.x2 - p.x1 - 5.53) < 1e-9).length;
const nLabel = (s) => s.prims.some((p) => p.t === "t" && p.s === "N");
assert.strictEqual(SYMBOL_BY_NAME.LS_3PN.poles, 4); assert.strictEqual(crosses(SYMBOL_BY_NAME.LS_3PN), 4); assert.strictEqual(trips(SYMBOL_BY_NAME.LS_3PN), 1); assert.ok(nLabel(SYMBOL_BY_NAME.LS_3PN));
assert.strictEqual(crosses(SYMBOL_BY_NAME.LS_4P), 4); assert.ok(nLabel(SYMBOL_BY_NAME.LS_4P) && nLabel(SYMBOL_BY_NAME.RCBO_4P) && nLabel(SYMBOL_BY_NAME.NH_4P) && !nLabel(SYMBOL_BY_NAME.LS_3P)); // 4-polig: N am 4. Pol (CJ 16.10.)
assert.strictEqual(SYMBOL_BY_NAME.LS_1PN.poles, 2); assert.strictEqual(trips(SYMBOL_BY_NAME.LS_1PN), 1); assert.strictEqual(crosses(SYMBOL_BY_NAME.LS_3PT), 3);
const coupling = (s) => s.prims.find((p) => p.t === "l" && p.d);
assert.ok(Math.abs(coupling(SYMBOL_BY_NAME.LS_3PT).x2 - (10 - 3 + 2.5 / 7 * 3)) < 1e-9); // Kopplung nur über L1 bis L3
assert.ok(!coupling(SYMBOL_BY_NAME.LS_1PT));
// N-Trenner: zwei Querstriche (CJ 16.10.), keine Kreise
const strokes = (s) => s.prims.filter((p) => p.t === "l" && p.y1 === p.y2 && Math.abs(p.x2 - p.x1 - 2.4) < 1e-9).length;
assert.strictEqual(SYMBOL_BY_NAME.NH_3PT.prims.filter((p) => p.t === "c").length, 0); assert.strictEqual(strokes(SYMBOL_BY_NAME.NH_3PT), 2); assert.strictEqual(strokes(SYMBOL_BY_NAME.NTRENN_1P), 2);
// FI/RCBO nach Hager: Summenstromwandler quer über alle Leiter (y -4), Relais links, Wirklinie (2 gestrichelt) plus Kopplung
const wandler = (s) => s.prims.find((p) => p.t === "l" && p.y1 === -4 && p.y2 === -4 && p.x1 === -3);
for (const n of ["FI_2P", "FI_4P", "RCBO_1PN", "RCBO_3PN"]) { const s = SYMBOL_BY_NAME[n]; assert.ok(wandler(s) && wandler(s).x2 === (s.poles - 1) * 5 + 1.5, n); assert.strictEqual(s.prims.filter((p) => p.t === "l" && p.d).length, 3, n); assert.ok(nLabel(s) || n === "RCBO_2P", n); }
assert.strictEqual(crosses(SYMBOL_BY_NAME.FI_4P), 0); assert.strictEqual(trips(SYMBOL_BY_NAME.FI_4P), 0);
assert.strictEqual(crosses(SYMBOL_BY_NAME.RCBO_3PN), 4); assert.strictEqual(trips(SYMBOL_BY_NAME.RCBO_3PN), 1);
// SPD 1+1 und 3+1: gleiche Anschlüsse wie 1P+N und 3P+N
assert.deepStrictEqual(SYMBOL_BY_NAME.SPD_4P_1.pins, SYMBOL_BY_NAME.SPD_4P.pins); assert.deepStrictEqual(SYMBOL_BY_NAME.SPD_2P_1.pins, SYMBOL_BY_NAME.SPD_2P.pins);
assert.ok(["LS_1PN", "LS_3PT", "RCBO_1PN", "RCBO_3PN", "NH_3PT"].every((n) => isDevice(SYMBOL_BY_NAME[n])));
assert.ok(["HAK_4P", "ZAEHLER_4P", "SPD_4P", "NTRENN_1P", "SCHUETZ_3P", "RELAIS_1P"].every((n) => !isDevice(SYMBOL_BY_NAME[n])));
// SPD: oben je Leiter ein Anschluss, unten ein PE-Anschluss
assert.deepStrictEqual(SYMBOL_BY_NAME.SPD_4P.pins.at(-1), { x: 7.5, y: -20 }); assert.strictEqual(SYMBOL_BY_NAME.SPD_4P.pins.length, 5);

// Nach Sichtung QElectroTech (CJ 16.10.): Kreuz mit Abstand über dem Querstrich, Prüftaste bei FI/RCBO, Zähler hoch mit Punkten, Erde, TN-C > TN-S
const cross = (s) => s.prims.find((p) => p.t === "l" && Math.abs(Math.abs(p.x2 - p.x1) - 1.2) < 1e-9 && Math.abs(Math.abs(p.y2 - p.y1) - 1.2) < 1e-9);
assert.ok(Math.min(cross(SYMBOL_BY_NAME.LS_1P).y1, cross(SYMBOL_BY_NAME.LS_1P).y2) - -8.5 >= 0.5); // mindestens 0,5 mm Luft zum Querstrich
const dots = (s) => s.prims.filter((p) => p.t === "c" && p.f);
for (const n of ["FI_2P", "FI_4P", "RCBO_1PN", "RCBO_2P", "RCBO_3PN", "RCBO_4P"]) { const s = SYMBOL_BY_NAME[n], last = (s.poles - 1) * 5; assert.deepStrictEqual(dots(s).map((p) => [p.cx, p.cy]), [[last, -1], [last - 5, -17.5]], n); }
assert.strictEqual(dots(SYMBOL_BY_NAME.LS_4P).length, 0);
for (const n of ["ZAEHLER_2P", "ZAEHLER_4P"]) { const s = SYMBOL_BY_NAME[n]; assert.strictEqual(dots(s).length, 0); // ohne Punkte (CJ 16.10.)
 assert.ok(s.prims.some((p) => p.t === "t" && p.s === "kWh" && p.y > -7)); assert.strictEqual(s.pins.length, s.poles * 2); }
assert.deepStrictEqual(SYMBOL_BY_NAME.ZAEHLER_4P.pins.slice(0, 2), [{ x: 0, y: 0 }, { x: 0, y: -20 }]); // Anschlüsse wie bisher: alte Dateien bleiben verbunden
assert.deepStrictEqual(SYMBOL_BY_NAME.ERDE_1P.pins, [{ x: 0, y: 0 }]);
assert.deepStrictEqual(SYMBOL_BY_NAME.TNC_TNS.pins[4], { x: 20, y: 0 }); // umgedreht (CJ 16.10.): PE oben, PEN unten
assert.ok(FAMILIES.some((f) => f.id === "TNC_TNS") && FAMILIES.some((f) => f.id === "ERDE") && !isDevice(SYMBOL_BY_NAME.TNC_TNS));

// Tasten 1 bis 4 und N (CJ 16.10.)
const K = variantByKey;
assert.strictEqual(K("LS_4P", "1"), "LS_1P"); assert.strictEqual(K("LS_1P", "3"), "LS_3P"); assert.strictEqual(K("LS_3P", "4"), "LS_4P");
assert.strictEqual(K("LS_3P", "n"), "LS_3PN"); assert.strictEqual(K("LS_3PN", "N"), "LS_3P"); assert.strictEqual(K("LS_3PT", "n"), "LS_3PN");
// T = N-Trenner ein/aus (CJ 16.10.)
assert.strictEqual(K("LS_1P", "t"), "LS_1PT"); assert.strictEqual(K("LS_1PN", "T"), "LS_1PT"); assert.strictEqual(K("LS_1PT", "t"), "LS_1P"); assert.strictEqual(K("LS_3P", "T"), "LS_3PT");
assert.strictEqual(K("NH_3P", "t"), "NH_3PT"); assert.strictEqual(K("FI_2P", "t"), null); assert.strictEqual(K("LS_2P", "t"), null);
assert.ok(hasTrenner("LS_2P") && hasTrenner("NH_4P") && !hasTrenner("FI_2P") && !hasTrenner("SPD_4P"));
// RCBO Standard C (CJ 16.10.), TN-C > TN-S mit Einspeisung von unten, HAK mit PEN-Aufteilung
// Zähler mit Wandler: 3 Stromwandler, Anschlüsse wie 3P+N, Taste 1 führt auf 1P+N
// Wandlermessung nach GEBNET, umgekehrt (CJ 16.10.): Abgriffe auf den Hauptlinien L1 bis N, 3 Wandler (gestrichelt), Zähler unten
{ const w = SYMBOL_BY_NAME.ZAEHLER_4P_W; assert.deepStrictEqual(w.pins, [{ x: 0, y: 0 }, { x: 15, y: -5 }, { x: 30, y: -10 }, { x: 42.5, y: -15 }]); // BKW-Schema (17.10.): Aussenleiter 15 mm
  assert.strictEqual(w.prims.filter((p) => p.t === "l" && p.d).length, 12); const tx = w.prims.filter((p) => p.t === "t").map((p) => p.s);
  assert.ok(tx.some((s) => s.startsWith("Prüfklemmen")) && tx.includes("braun (1)") && tx.includes("grau (6)") && !tx.includes("Steuerleiter hellgrau mit Nummern") && tx.includes("S1") && tx.includes("P2")); }
assert.strictEqual(SYMBOL_BY_NAME.ZAEHLER_4P.vlabel, "4-polig (3P+N)"); assert.strictEqual(K("ZAEHLER_4P_W", "3"), null); assert.strictEqual(K("ZAEHLER_4P_W", "1"), "ZAEHLER_2P"); assert.strictEqual(K("ZAEHLER_4P", "n"), null);
assert.strictEqual(SYMBOL_BY_NAME.RCBO_1PN.attrs.find((a) => a.tag === "CHAR").def, "C");
assert.strictEqual(SYMBOL_BY_NAME.TNC_TNS.pins.filter((p) => p.y === 0).length, 5); assert.strictEqual(SYMBOL_BY_NAME.TNC_TNS.pins.filter((p) => p.y === -20).length, 4);
assert.strictEqual(SYMBOL_BY_NAME.HAK_TNCS.pins.filter((p) => p.y === 0).length, 5); assert.ok(FAMILIES.find((f) => f.id === "HAK").variants.includes("HAK_TNCS"));
assert.strictEqual(K("LS_3PN", "1"), "LS_1PN"); assert.strictEqual(K("LS_1PN", "4"), "LS_4P"); assert.strictEqual(K("LS_2P", "n"), null);
assert.strictEqual(K("RCBO_1PN", "3"), "RCBO_3PN"); assert.strictEqual(K("RCBO_3PN", "n"), "RCBO_3P" in SYMBOL_BY_NAME ? "RCBO_3P" : null);
assert.strictEqual(K("FI_4P", "2"), "FI_2P"); assert.strictEqual(K("FI_2P", "4"), "FI_4P"); assert.strictEqual(K("FI_2P", "n"), null);
assert.strictEqual(K("NH_3P", "n"), null); assert.strictEqual(K("SPD_3P", "n"), "SPD_4P"); assert.strictEqual(K("SPD_4P", "n"), "SPD_4P_1"); assert.strictEqual(K("SPD_4P_1", "n"), "SPD_3P");
assert.strictEqual(K("SCHUETZ_3P", "4"), "SCHUETZ_4P"); assert.strictEqual(K("HAK_4P", "1"), null); assert.strictEqual(K("LS_4P", "5"), null);

// Alle neuen Symbole auf einem Blatt: Speichern und Laden unverändert, DXF schreibt jeden Block
const NEW = ["LS_1PN", "LS_1PT", "LS_3PN", "LS_3PT", "RCBO_1PN", "RCBO_3PN", "NH_1PT", "NH_3PT", "NTRENN_1P", "HAK_4P", "ZAEHLER_2P", "ZAEHLER_4P", "ZW_WANDLER", "ZW_ZAEHLER", "SPD_2P", "SPD_4P", "SPD_2P_1", "SPD_4P_1", "HAK_TNCS", "TNC_TNS", "SPULE_1P", "RELAIS_1P", "SCHUETZ_3P", "SCHUETZ_4P", "FI_4P", "RCBO_4P", "TNC_TNS", "ERDE_1P"];
const d = newDoc(), m = d.sheets[0];
NEW.forEach((n, i) => m.items.push({ id: i + 1, type: "symbol", sym: n, x: 30 + (i % 8) * 30, y: 170 - Math.floor(i / 8) * 50, rot: 0, attrs: Object.fromEntries(SYMBOL_BY_NAME[n].attrs.map((a) => [a.tag, a.def])) }));
const back = parseModel(serializeModel(d));
assert.deepStrictEqual(back.sheets[0].items, m.items);
fs.writeFileSync(process.argv[2] || "test_symbole.dxf", exportDxf(m));
console.log("ok");
