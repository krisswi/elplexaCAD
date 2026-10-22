// Symboldefinitionen (eigene, generische Symbole). Einheit mm, y nach oben (wie DXF).
// Ursprung = oberer Anschluss von Pol 1. Alles liegt auf einem 2,5-mm-Raster.
// Dieselben Daten zeichnen das Symbol im Editor und schreiben den DXF-Block.
import { PRINZIP_SYMBOLS } from "./prinzipsym.js"; // Prinzipschema, einpolig (CJ 21.10.2026)

const line = (x1, y1, x2, y2, dashed = false) => ({ t: "l", x1, y1, x2, y2, d: dashed });
const circle = (cx, cy, r) => ({ t: "c", cx, cy, r });
export const DOT_R = 0.5; // ein Mass für alle gefüllten Punkte, auch Verbindungspunkte (CJ 18.10.: kleiner, überall gleich gross)
const dot = (cx, cy) => ({ t: "c", cx, cy, r: DOT_R, f: true }); // gefüllter Punkt (Anschluss, Abgriff)
const text = (x, y, h, s) => ({ t: "t", x, y, h, s, anchor: "mm" });
const r3 = (n) => Math.round(n * 1000) / 1000;

export const POLE = 5;
const POLE_LEN = 20;

// LS, FI und RCBO nach den Hager-Symbolen (CJ 16.10.2026: Hager-Daten für MCB und FI frei, Vorlagen F0025_LS_3xLN und FI_3PN_IEC).
// Pol (Ursprung oben, x = Leiter): Leiter bis -8.5, Festkontakt mit Querstrich, darüber das Kreuz (Leistungsschalterfunktion),
// Schaltstück schräg von (x-3, -8.5) nach (x, -15.5), dann Leiter bis -20. Auslöser (Bimetall und Freiauslösung mit Pfeil)
// links am ersten Schutzpol. Pole gekoppelt durch eine gestrichelte Linie bei y -11.
// Polarten: "s" Schutzpol, "n" N mitgeschaltet ("N", ohne Auslöser), "c" Kontakt ohne Kreuz (FI), "t" Neutralleitertrenner
// (Leiter mit zwei Querstrichen, CJ 16.10., nicht mitgeschaltet).
const CROSS_Y = -7.25; // Mitte des Kreuzes, 1,25 mm über dem Querstrich (y -8.5)
const COUPLE_Y = -11, bladeX = (x, y) => x - 3 + ((-8.5 - y) / 7) * 3; // x des Schaltstücks auf Höhe y
function tripMark(x) {
  const z = [[-7.7, -14.17], [-5.96, -13.17], [-6.96, -11.44], [-5.23, -10.44], [-4.23, -12.17], [-2, -11]];
  const p = z.slice(1).map(([a, b], i) => line(x + z[i][0], z[i][1], x + a, b)); // Bimetall
  p.push(line(x - 6.7, -15.9, x - 1.17, -12.78), line(x - 6.7, -15.9, x - 4.76, -15.38), line(x - 6.7, -15.9, x - 5.28, -14.49), line(x - 5.28, -14.49, x - 4.76, -15.38), line(x - 6.7, -15.9, x - 5.02, -14.94)); // Freiauslösung, Pfeil
  return p;
}
// N-Trenner: Querstriche auf Höhe der Kontaktlücke daneben (CJ 22.10.2026): beim LS/RCBO wie dessen Schaltstück (y -8.5 bis -15.5), sonst wie Schliesser und NH (y -6 bis -14)
const GAP_LS = [-8.5, -15.5], GAP_K = [-6, -14];
function pole(x, kind, trip = false, gap = GAP_K) {
  if (kind === "t") return [line(x, 0, x, -POLE_LEN), ...gap.map((y) => line(x - 1.2, y, x + 1.2, y)), text(x + 1.8, -2.5, 1.8, "N")];
  const p = [line(x, 0, x, -8.5), line(x - 3, -8.5, x, -15.5), line(x, -15.5, x, -POLE_LEN)];
  // Kreuz klein (CJ 16.10.), mit Abstand über dem Querstrich wie bei QElectroTech disjonct-m_3fn (CJ 16.10.)
  if (kind !== "c") p.push(line(x - 0.8, -8.5, x + 0.8, -8.5), line(x - 0.6, CROSS_Y - 0.6, x + 0.6, CROSS_Y + 0.6), line(x + 0.6, CROSS_Y - 0.6, x - 0.6, CROSS_Y + 0.6));
  if (kind === "n") p.push(text(x + 1.8, -2.5, 1.8, "N"));
  if (trip) p.push(...tripMark(x));
  return p;
}

// kinds: eine Polart je Pol, z. B. "sssn" = 3P+N. Auslöser am ersten Schutzpol, Kopplung über alle geschalteten Pole (ohne Trenner).
function poles(kinds) {
  const prims = [], pins = [];
  [...kinds].forEach((k, i) => { prims.push(...pole(i * POLE, k, k === "s" && i === kinds.indexOf("s"), GAP_LS)); pins.push({ x: i * POLE, y: 0 }, { x: i * POLE, y: -POLE_LEN }); });
  const sw = kinds.replace(/t+$/, "").length;
  if (sw > 1) prims.push(line(bladeX(0, COUPLE_Y), COUPLE_Y, bladeX((sw - 1) * POLE, COUPLE_Y), COUPLE_Y, true)); // mechanische Kopplung
  if (kinds === "ssss") prims.push(text(3 * POLE + 1.8, -2.5, 1.8, "N")); // 4-polig: 4. Pol ist der geschützte N (CJ 16.10.)
  return { prims, pins };
}

// Polzahl-Varianten: Kürzel im Namen und Text in der Polzahl-Auswahl
const KINDS = { "1P": "s", "1PN": "sn", "1PT": "st", "2P": "ss", "3P": "sss", "3PN": "sssn", "3PT": "ssst", "4P": "ssss" };
const VLABEL = { "1PN": "1P+N", "1PT": "1P + N-Trenner", "3PN": "3P+N", "3PT": "3P + N-Trenner" };
const vlabel = (v) => VLABEL[v] ?? `${v[0]}-polig`;
// Für die Tasten 1 bis 4 und N (CJ 16.10.): lp = Anzahl Aussenleiter-Pole, nm = Art des N ("" ohne, "n" mitgeschaltet, "t" Trenner, "f" Funkenstrecke)
const lpnm = (kinds) => ({ lp: kinds.replace(/[nt]/g, "").length, nm: kinds.includes("n") ? "n" : kinds.includes("t") ? "t" : "" });

const attrBMK = (def, x = -14) => ({ tag: "BMK", label: "Betriebsmittelkennzeichen", def, x, y: -4, h: 2.5 });
const attrStrom = (def, x = -14) => ({ tag: "STROM", label: "Nennstrom", def, x, y: -7.5, h: 2.5 });
const rect = (x0, y0, x1, y1, d = false) => [line(x0, y0, x1, y0, d), line(x1, y0, x1, y1, d), line(x1, y1, x0, y1, d), line(x0, y1, x0, y0, d)];
const AX = -17; // Attribute bei LS, FI, RCBO weiter links, damit sie den Auslöser nicht berühren

function lsVariant(v) {
  const g = poles(KINDS[v]);
  return {
    name: `LS_${v}`, family: "LS", poles: KINDS[v].length, ...lpnm(KINDS[v]), vlabel: vlabel(v), label: `Leitungsschutzschalter ${vlabel(v)}`, layer: "SCH_SYMBOLE",
    prims: g.prims, pins: g.pins,
    attrs: [attrBMK("F?", AX), attrStrom("13A", AX), { tag: "CHAR", label: "Charakteristik", def: "C", x: AX, y: -11, h: 2.5 }],
  };
}

// Fehlerstromteil nach Hager: Summenstromwandler als Linie quer über alle Leiter (y -4) mit Kern links, daneben das
// Auslöserelais (Kasten mit ⊣|>), gestrichelte Wirkverbindung herunter zum ersten Schaltstück.
function rcdPart(n) {
  const last = (n - 1) * POLE;
  return [line(-3, -4, last + 1.5, -4), line(-2, -2.5, -2, -5.5), ...rect(-8, -2.5, -3, -5.5),
    line(-7.75, -4, -7.25, -4), line(-7.25, -4.5, -7.25, -3.5), line(-6.25, -5, -6.25, -3), line(-5.25, -3, -3.5, -4), line(-3.5, -4, -5.25, -5),
    line(-5.5, -5.5, -5.5, -9.5, true), line(-5.5, -9.5, bladeX(0, -9.5), -9.5, true), ...testKey(n)];
}

// Prüftaste (CJ 16.10., nach QElectroTech rcbo_01): rechts neben dem letzten Pol eine Taste (Schliesser mit Betätiger)
// in Reihe mit einem Widerstand. Abgriff am letzten Pol über dem Wandler, Rückweg zum vorletzten Pol unter dem Schaltstück.
function testKey(n) {
  const last = (n - 1) * POLE, T = last + 3.5, prev = last - POLE;
  return [dot(last, -1), line(last, -1, T, -1), line(T, -1, T, -3), line(T, -6.5, T + 1.4, -3.2), // Taste offen
    line(T + 0.7, -4.85, T + 2.8, -4.85), line(T + 2.8, -3.85, T + 2.8, -5.85), // Betätiger
    line(T, -6.5, T, -9), ...rect(T - 0.6, -9, T + 0.6, -12.5), line(T, -12.5, T, -17.5), line(T, -17.5, prev, -17.5), dot(prev, -17.5)];
}

function fiVariant(n) {
  const g = poles("c".repeat(n));
  g.prims.push(...rcdPart(n), text((n - 1) * POLE + 1.8, -2.5, 1.8, "N"));
  return {
    name: `FI_${n}P`, family: "FI", poles: n, lp: n - 1, nm: "n", label: `FI-Schutzschalter ${n}-polig`, layer: "SCH_SYMBOLE",
    prims: g.prims, pins: g.pins,
    attrs: [attrBMK("Q?", AX), attrStrom("40A", AX), { tag: "IDN", label: "Bemessungsfehlerstrom", def: "30mA", x: AX, y: -11, h: 2.5 }],
  };
}

function rcboVariant(v) {
  const g = poles(KINDS[v]);
  g.prims.push(...rcdPart(KINDS[v].length));
  return {
    name: `RCBO_${v}`, family: "RCBO", poles: KINDS[v].length, ...lpnm(KINDS[v]), vlabel: vlabel(v), label: `FI/LS-Schalter (RCBO) ${vlabel(v)}`, layer: "SCH_SYMBOLE",
    prims: g.prims, pins: g.pins,
    attrs: [attrBMK("F?", AX), attrStrom("16A", AX), { tag: "CHAR", label: "Charakteristik", def: "C", x: AX, y: -11, h: 2.5 }, { tag: "IDN", label: "Bemessungsfehlerstrom", def: "30mA", x: AX, y: -14.5, h: 2.5 }],
  };
}

// Neutralleitertrenner einzeln (z. B. neben NH- oder LS-Sicherungen)
const nTrenner = {
  name: "NTRENN_1P", family: "NTRENN", poles: 1, label: "Neutralleitertrenner", layer: "SCH_SYMBOLE",
  prims: pole(0, "t"), pins: [{ x: 0, y: 0 }, { x: 0, y: -POLE_LEN }],
  attrs: [attrBMK("")],
};

// Kontakte: Schliesser (KS), Öffner (KO), Taster; Spule für Schütz und Relais. Eigene Zeichnung nach der üblichen Darstellung (Entwurf, von CJ zu prüfen).
// Öffner (CJ 22.10.2026): Querstrich am Festkontakt nach rechts, das Schaltstück läuft knapp vor dessen Ende darüber hinaus.
const NC_END = { x: 1.6, y: -5.5 }, couplingX = (nc) => (nc ? (NC_END.x * 4) / 8.5 : -1.25); // Schaltstück auf Höhe y -10
function contactPole(x, nc) {
  const p = [line(x, -14, x, -POLE_LEN)];
  if (nc) p.push(line(x, 0, x, -6), line(x, -6, x + 2.2, -6), line(x, -14, x + NC_END.x, NC_END.y));
  else p.push(line(x, 0, x, -6), line(x, -14, x - 2.5, -6));
  return p;
}
function contactVariant(nc, n, push = false) {
  const prims = [], pins = [];
  for (let i = 0; i < n; i++) { prims.push(...contactPole(i * POLE, nc)); pins.push({ x: i * POLE, y: 0 }, { x: i * POLE, y: -POLE_LEN }); }
  const cx = couplingX(nc);
  if (n > 1) prims.push(line(cx, -10, (n - 1) * POLE + cx, -10, true));
  if (push) { prims.push(line(cx, -10, -6, -10, true), line(-6, -8, -6, -12), line(-6, -8, -5.2, -8), line(-6, -12, -5.2, -12)); } // Druckknopf (CJ 22.10.)
  const fam = push ? (nc ? "TASTER_O" : "TASTER_S") : nc ? "KO" : "KS";
  const label = push ? (nc ? "Taster Öffner" : "Taster Schliesser") : nc ? "Öffner" : "Schliesser";
  return {
    name: `${fam}_${n}P`, family: fam, poles: n, label: `${label}${n > 1 ? " " + n + "-polig" : ""}`, layer: "SCH_SYMBOLE", prims, pins,
    attrs: [{ tag: "BMK", label: "Betriebsmittelkennzeichen", def: push ? "S?" : "K?", x: -14, y: -4, h: 2.5 }],
  };
}

// Schütz-Funktion (CJ 22.10.2026, nach IEC 60617): Halbkreis links am Ende des Festkontakts, aus kurzen Linien
const contactorArc = (x, r = 0.8, n = 8) => Array.from({ length: n }, (_, i) => {
  const a = (k) => Math.PI / 2 + (Math.PI * k) / n, px = (k) => r3(x + r * Math.cos(a(k))), py = (k) => r3(-6 + r + r * Math.sin(a(k)));
  return line(px(i), py(i), px(i + 1), py(i + 1));
});
// Schütz-Hauptkontakte (CJ 16.10., nach Musterschema): Schliesser mit Klemmennummern 1/2, 3/4, 5/6, 7/8 rechts an den Polen
function schuetzVariant(n) {
  const prims = [], pins = [];
  for (let i = 0; i < n; i++) {
    const x = i * POLE;
    prims.push(...contactPole(x, false), ...contactorArc(x), text(x + 1.6, -2.5, 1.6, String(2 * i + 1)), text(x + 1.6, -17.5, 1.6, String(2 * i + 2)));
    pins.push({ x, y: 0 }, { x, y: -POLE_LEN });
  }
  if (n > 1) prims.push(line(-1.2, -10, (n - 1) * POLE - 1.2, -10, true));
  return {
    name: `SCHUETZ_${n}P`, family: "SCHUETZ", poles: n, label: `Schütz Hauptkontakte ${n}-polig`, layer: "SCH_SYMBOLE", prims, pins,
    attrs: [{ tag: "BMK", label: "Betriebsmittelkennzeichen", def: "K?", x: -14, y: -4, h: 2.5 }],
  };
}

// Spule (CJ 16.10., nach Musterschema): liegendes Rechteck 8 x 4 mm, A1 oben, A2 unten, BMK links.
// Relais wie in IEC 60617 ein leeres Rechteck (CJ 22.10.2026: Schrägstrich hiess Remanenzrelais), gleich wie die Schützspule.
function coilVariant(relay) {
  const prims = [line(0, 0, 0, -8), ...rect(-4, -8, 4, -12), line(0, -12, 0, -20), text(2.2, -6.5, 1.8, "A1"), text(2.2, -13.5, 1.8, "A2")];
  return {
    name: relay ? "RELAIS_1P" : "SPULE_1P", family: relay ? "RELAIS" : "SPULE", poles: 1, label: relay ? "Spule Relais" : "Spule Schütz", layer: "SCH_SYMBOLE", prims,
    pins: [{ x: 0, y: 0 }, { x: 0, y: -20 }],
    attrs: [{ tag: "BMK", label: "Betriebsmittelkennzeichen", def: "K?", x: -14, y: -9, h: 2.5 }, { tag: "TEXT", label: "Funktion", def: "", x: -14, y: -12.5, h: 2.5 }],
  };
}

// Neue Kontakte und Relais (CJ 22.10.2026, nach der Symbolzusammenfassung IEC 60617, selbst gezeichnet). Masse wie Schliesser:
// Leiter oben bis y -6, Schaltstück von (0, -14) schräg nach oben, Betätigung links bei x -6, Wirklinie auf y -10.
const kBmk = (def, y = -4) => [{ tag: "BMK", label: "Betriebsmittelkennzeichen", def, x: -14, y, h: 2.5 }];
const kSym = (name, family, label, prims, pins, def = "K?") => ({ name, family, poles: 1, label, layer: "SCH_SYMBOLE", prims, pins, attrs: kBmk(def) });
const NO = [line(0, 0, 0, -6), line(0, -14, -2.5, -6), line(0, -14, 0, -POLE_LEN)]; // Schliesser
const NC = [line(0, 0, 0, -6), line(0, -6, 2.2, -6), line(0, -14, 1.6, -5.5), line(0, -14, 0, -POLE_LEN)]; // Öffner wie KO
const P1 = [{ x: 0, y: 0 }, { x: 0, y: -POLE_LEN }];
const handAct = [line(-6, -8, -6, -12)]; // handbetätigt allgemein
const rotAct = [line(-6.8, -12, -6, -12), line(-6, -12, -6, -8), line(-6, -8, -5.2, -8)]; // Drehbetätigung
const thermAct = [line(-6, -8, -6, -12), line(-6, -9.2, -5.2, -9.2), line(-5.2, -9.2, -5.2, -10.8), line(-5.2, -10.8, -6, -10.8)]; // thermische Betätigung
const link = (x1, nc = false) => line(x1, -10, nc ? 0.75 : -1.25, -10, true); // Wirklinie bis zum Schaltstück
const nums = (top, bot) => [text(1.8, -2.5, 1.6, top), text(1.8, -17.5, 1.6, bot)];
const kontakte = [
  { ...kSym("TRK_O_1P", "TRK", "Kontakt Thermorelais, Öffner 95/96", [...NC, ...thermAct, link(-6, true), ...nums("95", "96")], P1, "F?"), vlabel: "Öffner 95/96" },
  { ...kSym("TRK_S_1P", "TRK", "Kontakt Thermorelais, Schliesser 97/98", [...NO, ...thermAct, link(-6), ...nums("97", "98")], P1, "F?"), vlabel: "Schliesser 97/98" },
  kSym("HSCH_1P", "HSCH", "Schalter handbetätigt", [...NO, ...handAct, link(-6)], P1, "S?"),
  kSym("DSCH_1P", "DSCH", "Drehschalter mit Raste", [...NO, ...rotAct, line(-5.2, -10, -4.4, -10), line(-4.4, -10, -3.9, -10.9), line(-3.9, -10.9, -3.4, -10), line(-3.4, -10, -1.25, -10)], P1, "S?"),
  kSym("DTAST_1P", "DTAST", "Schwenktaster (Drehknopf, Rückstellung)", [...NO, ...rotAct, link(-5.2)], P1, "S?"),
  // Wechsler: gemeinsamer Anschluss unten 11, Öffner links oben 12, Schliesser rechts oben 14
  kSym("KW_1P", "KW", "Wechsler (Umschaltkontakt)", [line(-5, 0, -5, -6), line(-5, -6, -2, -6), line(0, 0, 0, -6), line(0, -14, -2.4, -5.5), line(0, -14, 0, -POLE_LEN),
    text(-3.2, -2.5, 1.6, "12"), text(1.8, -2.5, 1.6, "14"), text(1.8, -17.5, 1.6, "11")], [{ x: 0, y: 0 }, { x: -5, y: 0 }, { x: 0, y: -POLE_LEN }]),
  // Zweiweg-Umschalter mit Aus-Stellung: zwei Festkontakte oben, Schaltstück in der Mitte, Drehpunkt als Kreis
  kSym("UMS_1P", "UMS", "Umschalter mit Aus-Stellung", [line(-2.5, 0, -2.5, -6), line(2.5, 0, 2.5, -6), line(0, -13.5, 0, -8), circle(0, -14, 0.5), line(0, -14.5, 0, -POLE_LEN)],
    [{ x: -2.5, y: 0 }, { x: 2.5, y: 0 }, { x: 0, y: -POLE_LEN }], "S?"),
];
// Thermorelais (Überlastrelais, Hauptstrom): je Pol ein Kasten mit Bimetall-Zeichen, 1- oder 3-polig
function trVariant(n) {
  const prims = [], pins = [];
  for (let i = 0; i < n; i++) {
    const x = i * POLE;
    prims.push(line(x, 0, x, -6), ...rect(x - 1.8, -6, x + 1.8, -14), line(x, -6, x, -8.5), line(x, -8.5, x + 1, -8.5), line(x + 1, -8.5, x + 1, -11.5), line(x + 1, -11.5, x, -11.5), line(x, -11.5, x, -14), line(x, -14, x, -POLE_LEN));
    pins.push({ x, y: 0 }, { x, y: -POLE_LEN });
  }
  return { name: `TR_${n}P`, family: "TR", poles: n, label: `Thermorelais ${n}-polig`, layer: "SCH_SYMBOLE", prims, pins, attrs: [...kBmk("F?"), attrStrom("")] };
}
// Spulen mit Kennzeichen (wie Spule Schütz, 8 × 4 mm): Stromstossrelais, abfall- und anzugsverzögert; Unterspannungsrelais als Kasten mit U<
function coilMark(name, family, label, mark, vlabel) {
  const p = coilVariant(true);
  return { ...p, name, family, label, prims: [...p.prims, ...mark], ...(vlabel ? { vlabel } : {}) };
}
const relais = [
  coilMark("STR_1P", "STR", "Stromstossrelais", [line(-2.5, -11.2, -2.5, -10.3), line(-2.5, -10.3, 2, -10.3), line(2, -10.3, 2, -9)]),
  coilMark("ZR_AB_1P", "ZR", "Zeitrelais abfallverzögert", [line(-2.5, -8, -2.5, -12), ...[0, 1, 2, 3, 4, 5].map((k) => line(-3.75 + k * 0.25, -8, -3.75 + k * 0.25, -12))], "abfallverzögert"),
  coilMark("ZR_AN_1P", "ZR", "Zeitrelais anzugsverzögert", [line(-2.5, -8, -2.5, -12), line(-4, -8, -2.5, -12), line(-4, -12, -2.5, -8)], "anzugsverzögert"),
  { name: "USR_1P", family: "USR", poles: 1, label: "Unterspannungsrelais", layer: "SCH_SYMBOLE", prims: [line(0, 0, 0, -6), ...rect(-5, -6, 5, -14), text(0, -10, 3, "U<"), line(0, -14, 0, -POLE_LEN)],
    pins: P1, attrs: kBmk("K?", -9) },
];

// Schritt 4b (CJ 22.10.2026): Meldeleuchte, Messgeräte, Bauteile, Antriebe. Senkrecht wie die Kontakte: Anschluss oben y 0, unten y -20,
// das Zeichen sitzt in der Mitte (y -10). Bögen und Sinus aus kurzen Linien, gefüllte Flächen aus dichten Strichen (wie DXF ohne Schraffur).
const arcPts = (cx, cy, r, a0, a1, n = 10) => Array.from({ length: n }, (_, i) => {
  const a = (k) => ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
  return line(r3(cx + r * Math.cos(a(i))), r3(cy + r * Math.sin(a(i))), r3(cx + r * Math.cos(a(i + 1))), r3(cy + r * Math.sin(a(i + 1))));
});
const sineAt = (cx, cy, w = 3.5, h = 0.8) => Array.from({ length: 12 }, (_, i) => {
  const x = (k) => r3(cx - w / 2 + (w * k) / 12), y = (k) => r3(cy + h * Math.sin((2 * Math.PI * k) / 12));
  return line(x(i), y(i), x(i + 1), y(i + 1));
});
const fill = (x0, y0, x1, y1, n = 6) => Array.from({ length: n + 1 }, (_, k) => line(r3(x0 + ((x1 - x0) * k) / n), y0, r3(x0 + ((x1 - x0) * k) / n), y1));
const arrowTo = (x0, y0, x1, y1, s = 1) => { const a = Math.atan2(y1 - y0, x1 - x0), d = (t) => [r3(x1 - s * Math.cos(a + t)), r3(y1 - s * Math.sin(a + t))];
  return [line(x0, y0, x1, y1), line(x1, y1, ...d(0.45)), line(x1, y1, ...d(-0.45))]; };
const leads = (top, bot) => [line(0, 0, 0, top), line(0, bot, 0, -POLE_LEN)];
const v4b = (name, family, label, vlabel, prims, def, extra = []) => ({ ...kSym(name, family, label, prims, P1, def), vlabel, attrs: [...kBmk(def, -9), ...extra] });
const txtAttr = (def) => [{ tag: "TEXT", label: "Text", def, x: -14, y: -12.5, h: 2.5 }];
const box10 = [...rect(-5, -5, 5, -15)];
const bauteile = [
  v4b("LAMPE_1P", "LAMPE", "Meldeleuchte", "Meldeleuchte", [...leads(-7.5, -12.5), circle(0, -10, 2.5), line(-1.77, -8.23, 1.77, -11.77), line(-1.77, -11.77, 1.77, -8.23)], "P?", txtAttr("")),
  v4b("MESS_V_1P", "MESS", "Voltmeter", "Voltmeter", [...leads(-6.5, -13.5), circle(0, -10, 3.5), text(0, -10, 3, "V")], "P?"),
  v4b("MESS_A_1P", "MESS", "Amperemeter", "Amperemeter", [...leads(-6.5, -13.5), circle(0, -10, 3.5), text(0, -10, 3, "A")], "P?"),
  v4b("MESS_H_1P", "MESS", "Stundenzähler", "Stundenzähler", [...leads(-5, -15), ...rect(-3.5, -5, 3.5, -15), line(-3.5, -7.5, 3.5, -7.5), text(0, -11.25, 3, "h")], "P?"),
  v4b("R_1P", "BAUTEIL", "Widerstand", "Widerstand", [...leads(-6, -14), ...rect(-1.25, -6, 1.25, -14)], "R?"),
  v4b("C_1P", "BAUTEIL", "Kondensator", "Kondensator", [...leads(-9.25, -10.75), line(-2.5, -9.25, 2.5, -9.25), line(-2.5, -10.75, 2.5, -10.75)], "C?"),
  v4b("L_1P", "BAUTEIL", "Spule, Drossel", "Spule, Drossel", [...leads(-6, -14), ...[0, 1, 2, 3].flatMap((k) => arcPts(0, -7 - 2 * k, 1, 90, -90, 8))], "L?"),
  v4b("LED_1P", "BAUTEIL", "Leuchtdiode (LED)", "LED", [...leads(-8.5, -11.5), line(-2, -8.5, 2, -8.5), line(2, -8.5, 0, -11.5), line(0, -11.5, -2, -8.5), line(-2, -11.5, 2, -11.5),
    ...arrowTo(2, -9.5, 4, -7.5, 0.8), ...arrowTo(2.6, -10.7, 4.6, -8.7, 0.8)], "P?"),
  v4b("BATT_1P", "BAUTEIL", "Batterie", "Batterie", [...leads(-8, -12.5), line(-2.5, -8, 2.5, -8), line(-1.25, -9, 1.25, -9), line(-2.5, -11.5, 2.5, -11.5), line(-1.25, -12.5, 1.25, -12.5), text(3.5, -6.5, 2, "+")], "G?"),
  v4b("STD_1P", "STD", "Steckdose und Stecker", "Steckdose und Stecker", [line(0, 0, 0, -6.5), ...arcPts(0, -9, 2.5, 180, 0, 12), ...fill(-1, -9, 1, -13, 8), line(-1, -9, 1, -9), line(-1, -13, 1, -13), line(0, -13, 0, -POLE_LEN)], "X?"),
  v4b("FU_1P", "FU", "Frequenzumformer", "Frequenzumformer", [...leads(-5, -15), ...box10, line(-5, -15, 5, -5), ...sineAt(-2.5, -7.5), ...sineAt(2.5, -12.5), ...arrowTo(1, -14, 4, -11, 0.8)], "T?", txtAttr("")),
  v4b("SANFT_1P", "SANFT", "Sanftanlasser", "Sanftanlasser", [...leads(-5, -15), ...box10, line(-5, -5, 0, -8.5), line(0, -8.5, 5, -5), ...arrowTo(-3, -11, 6.5, -2.5, 1),
    line(-4, -12, 4, -12), line(-1.5, -10.5, -1.5, -13.5), line(-1.5, -10.5, 1.5, -12), line(-1.5, -13.5, 1.5, -12), line(1.5, -10.5, 1.5, -13.5)], "T?"),
  { name: "GEN_1P", family: "GEN", poles: 1, label: "Generator", layer: "SCH_SYMBOLE", prims: [circle(0, 0, 5), text(0, 1.2, 3.5, "G")], pins: [{ x: 0, y: 5 }],
    attrs: [{ tag: "BMK", label: "Betriebsmittelkennzeichen", def: "G?", x: 8, y: 2, h: 2.5 }, { tag: "LEISTUNG", label: "Leistung", def: "", x: 8, y: -1.5, h: 2.5 },
      { tag: "STROMART", label: "Stromart (im Kreis)", def: "3~", x: -1.2, y: -3.4, h: 2.2 }] },
];

// NH-Sicherung: Rechteck mit Schmelzleiter in jedem Pol, auf Wunsch mit Neutralleitertrenner als letztem Pol
function nhPole(x) {
  return [line(x, 0, x, -6), line(x, -14, x, -POLE_LEN), ...rect(x - 1.5, -6, x + 1.5, -14), line(x, -6, x, -14)];
}
function nhVariant(v) {
  const kinds = KINDS[v], prims = [], pins = [];
  [...kinds].forEach((k, i) => { prims.push(...(k === "t" ? pole(i * POLE, "t") : nhPole(i * POLE))); pins.push({ x: i * POLE, y: 0 }, { x: i * POLE, y: -POLE_LEN }); });
  if (kinds === "ssss") prims.push(text(3 * POLE + 1.8, -2.5, 1.8, "N")); // 4-polig mit N
  return {
    name: `NH_${v}`, family: "NH", poles: kinds.length, ...lpnm(kinds), vlabel: vlabel(v), label: `NH-Sicherung ${vlabel(v)}`, layer: "SCH_SYMBOLE", prims, pins,
    attrs: [attrBMK("F?"), attrStrom("100A"), { tag: "GROESSE", label: "Baugrösse", def: "NH00", x: -14, y: -11, h: 2.5 }],
  };
}

// Hausanschlusskasten: 3 NH-Sicherungen und Neutralleitertrenner im gestrichelten Rahmen, "HAK" rechts daneben.
// Rahmen wie das HAK-Zeichen nach IEC (CJ 22.10.2026): durchgezogen, Kasten 1,3 × so hoch wie breit, Querstrich, darunter
// Spitze zur Zuleitung (0,55 × Breite). Die Anschlüsse liegen im Rahmen (CJ: dürfen im HAK drin sein), damit alte Dateien verbunden bleiben.
// Spitze immer zwischen L2 und L3 (x 7,5), wo die Zuleitung abgeht (CJ 22.10.), auch wenn der Rahmen dann nicht ganz gleichseitig ist.
function hakFrame(x0, x1, top, tx = 7.5) {
  const w = x1 - x0, side = r3(top - 1.3 * w), ty = r3(side - 0.55 * w);
  return [line(x0, top, x1, top), line(x1, top, x1, side), line(x0, side, x0, top), line(x0, side, x1, side), line(x1, side, tx, ty), line(tx, ty, x0, side)];
}
const lNames = (n = 3) => Array.from({ length: n }, (_, i) => text(i * POLE + 1.8, -2.5, 1.8, `L${i + 1}`)); // L1 bis L3 an den Leitern, wo N und PE stehen (CJ 22.10.)
const hak = {
  // TN-S: PE läuft rechts durch (CJ 22.10.2026); Anschlüsse von L1 bis N wie bisher, PE hinten angehängt
  name: "HAK_4P", family: "HAK", poles: 5, vlabel: "TN-S", label: "Hausanschlusskasten (3 NH + N-Trenner, PE)", layer: "SCH_SYMBOLE",
  prims: [...[0, 1, 2].flatMap((i) => nhPole(i * POLE)), ...pole(3 * POLE, "t"), line(20, 0, 20, -POLE_LEN), text(21.8, -2.5, 1.8, "PE"), ...lNames(), ...hakFrame(-3.5, 25, 7), text(29.5, -10, 2.2, "HAK")],
  pins: [0, 1, 2, 3, 4].flatMap((i) => [{ x: i * POLE, y: 0 }, { x: i * POLE, y: -POLE_LEN }]),
  attrs: [attrBMK("HAK"), attrStrom("63A"), { tag: "GROESSE", label: "Baugrösse", def: "NH00", x: -14, y: -11, h: 2.5 }],
};
// HAK mit Übergang TN-C > TN-S (CJ 16.10.: passiert in der Regel im HAK). Einspeisung von unten wie TNC_TNS: unten L1, L2, L3, PEN,
// oben L1, L2, L3, N (mit N-Trenner), PE. PEN teilt sich im Kasten bei y -15.5.
const hakTncs = {
  name: "HAK_TNCS", family: "HAK", poles: 5, vlabel: "TN-C > TN-S", label: "Hausanschlusskasten mit PEN-Aufteilung", layer: "SCH_SYMBOLE",
  prims: [...[0, 1, 2].flatMap((i) => nhPole(i * POLE)), line(15, 0, 15, -POLE_LEN), line(13.8, -6, 16.2, -6), line(13.8, -14, 16.2, -14),
    dot(15, -15.5), line(15, -15.5, 20, -10.5), line(20, -10.5, 20, 0), ...hakFrame(-3.5, 25, 7), ...lNames(),
    text(16.8, -2.5, 1.8, "N"), text(21.8, -2.5, 1.8, "PE"), text(17.8, -19, 1.8, "PEN"), text(29.5, -10, 2.2, "HAK")],
  pins: [...[0, 1, 2, 3, 4].map((i) => ({ x: i * POLE, y: 0 })), ...[0, 1, 2, 3].map((i) => ({ x: i * POLE, y: -POLE_LEN }))],
  attrs: [attrBMK("HAK"), attrStrom("63A"), { tag: "GROESSE", label: "Baugrösse", def: "NH00", x: -14, y: -11, h: 2.5 }],
};

// HAK der Eingangsverdrahtung (CJ 16.10., Bild „CJ Eingangsverdrahtung“): Zuleitung einpolig von unten (Anschluss x 7,5, y -30),
// teilt sich im Kasten auf L1, L2, L3, PEN (Querstrich y -25); 3 NH, N mit Trenner, PEN-Aufteilung N/PE. Oben L1, L2, L3, N, PE.
// Der gestrichelte Rahmen (Fünfeck) schliesst die Aufteilung ein; L1, L2, L3 und PEN laufen schräg auf die Zuleitung zu (CJ 22.10.2026).
const hakFeed = {
  name: "HAK_TNCS_1", family: "HAK", poles: 5, vlabel: "TN-C > TN-S, Zuleitung", label: "Hausanschlusskasten mit PEN-Aufteilung, Zuleitung einpolig", layer: "SCH_SYMBOLE",
  prims: [...[0, 1, 2].flatMap((i) => nhPole(i * POLE)), ...[0, 1, 2, 3].map((i) => line(i * POLE, -POLE_LEN, 7.5, -25)), line(15, 0, 15, -POLE_LEN),
    line(13.8, -6, 16.2, -6), line(13.8, -14, 16.2, -14), dot(15, -15.5), line(15, -15.5, 20, -10.5), line(20, -10.5, 20, 0),
    dot(7.5, -25), line(7.5, -25, 7.5, -30), ...hakFrame(-3.5, 25, 4), ...lNames(),
    text(16.8, -2.5, 1.8, "N"), text(21.8, -2.5, 1.8, "PE"), text(18, -19, 1.8, "PEN"), text(29.5, -12.5, 2.2, "HAK")],
  pins: [...[0, 1, 2, 3, 4].map((i) => ({ x: i * POLE, y: 0 })), { x: 7.5, y: -30 }],
  attrs: [attrBMK("HAK"), attrStrom("63A"), { tag: "GROESSE", label: "Baugrösse", def: "NH00", x: -14, y: -11, h: 2.5 }],
};
// Hauptpotentialausgleichsschiene (CJ 16.10., Darstellung Annahme): Schiene 20 x 2,5 mm mit 5 Anschlusspunkten, Anschluss oben und unten
const hpas = {
  name: "HPAS_1P", family: "HPAS", poles: 1, vlabel: "HPAS", label: "Hauptpotentialausgleichsschiene (HPAS)", layer: "SCH_SYMBOLE",
  prims: [line(0, 0, 0, -2.5), ...rect(-10, -2.5, 10, -5), ...[-8, -4, 0, 4, 8].map((x) => dot(x, -3.75)), line(0, -5, 0, -7.5)],
  pins: [{ x: 0, y: 0 }, { x: 0, y: -7.5 }],
  attrs: [{ tag: "BMK", label: "Betriebsmittelkennzeichen", def: "HPAS", x: 12, y: -3, h: 2.5 }, { tag: "BEZ", label: "Bezeichnung", def: "Hauptpotentialausgleich", x: 12, y: -6.5, h: 2.5 }],
};

// Zähler (Energiezähler, CJ 16.10. nach Vorlage „CJ Zaehler Vorlage“; CJ 22.10.2026): Kasten 20 mm hoch, Kopfband oben, "kWh" im grossen Feld.
// 1 bis 8 Anschlüsse oben und unten (Tasten 1 bis 8), ohne Anschlussstücke und ohne N: die Leitung geht direkt an den Kasten.
// Rechts oben immer 5 Seitenkontakte im Abstand 2,5 mm (nur Fangpunkte auf der Kante). Kasten mindestens 15 mm breit.
const SIDE_PINS = 5;
function zaehlerVariant(n) {
  const r = Math.max((n - 1) * POLE + 2.5, 12.5), vl = `${n} Anschl${n > 1 ? "üsse" : "uss"}`, pins = [];
  const prims = [...rect(-2.5, 0, r, -POLE_LEN), text(r / 2 - 1.25, -12.5, 3, "kWh"), line(-2.5, -5, r, -5)];
  for (let i = 0; i < n; i++) pins.push({ x: i * POLE, y: 0 }, { x: i * POLE, y: -POLE_LEN }); // Anschlüsse oben 0 und unten -20 wie bisher: alte Dateien bleiben verbunden
  for (let k = 1; k <= SIDE_PINS; k++) pins.push({ x: r, y: -2.5 * k });
  return {
    name: `ZAEHLER_${n}P`, family: "ZAEHLER", poles: n, lp: n, nm: "", vlabel: vl, label: `Zähler, ${vl}`, layer: "SCH_SYMBOLE", prims, pins,
    attrs: [attrBMK("P?"), { tag: "ZAEHLERNR", label: "Zählernummer", def: "", x: -14, y: -7.5, h: 2.5 }],
  };
}
export const ZAEHLER_N = [1, 2, 3, 4, 5, 6, 7, 8];

// Wandlermessung (CJ 16.10., nach Anschlussschema Wandlermessung GEBNET, umgekehrt: bei uns laufen die Hauptlinien oben durch).
// Ursprung = L1-Hauptlinie; L2, L3, N liegen 5, 10, 15 mm darunter. Je Aussenleiter ein Stromwandler (gestrichelter Kasten mit
// Primärschlaufe) auf der Hauptlinie, S1/S2 führen nach unten; daneben der Spannungspfad mit Abgriff (Punkt) und Sicherung 10 A,
// N mit Trennstelle. Alle Leiter laufen durch die Prüfklemmen zum Zähler unten. Anschlüsse: die vier Abgriffe auf den Hauptlinien.
// Wandlermessung nach GEBNET-Anschlussschema (CJ 16.10.: „genau so wie im GEBNET-Bild“, Referenzen/CJ Wandlermessung GEBNET Ausschnitt.png),
// umgekehrt: Hauptlinien oben (L1 y 0, L2 -5, L3 -10, N -15), darunter Wandler, Spannungspfad mit Sicherung, Prüfklemmen, Zähler unten.
// Leiter 2,5 mm auseinander (Raster), je Aussenleiter k ab x = 12,5k: Spannung U, S1, Lasche, S2; N bei 37,5.
// Zwischen Prüfklemmen und Zähler tauschen U und S1 die Plätze: am Zähler gilt S1, U, S2 (wie in der Vorlage).
const lt = (x, y, h, s) => ({ ...text(x, y, h, s), al: "l" }); // linksbündig
const vt = (x, y, h, s) => ({ ...text(x, y, h, s), r: 90 }); // senkrecht, von unten zu lesen
const WM_COL = ["braun", "schwarz", "grau"];
const screw = (x, y, r = 0.55) => [circle(x, y, r), line(x - r * 0.8, y - r * 0.8, x + r * 0.8, y + r * 0.8)]; // Schraubklemme ⌀
const wandlerTop = () => {
  const prims = [];
  [0, 1, 2].forEach((k) => {
    const y = -5 * k, u = 12.5 * k, s1 = u + 2.5, ln = u + 5, s2 = u + 7.5, col = WM_COL[k];
    // Stromwandler: gestrichelter Kasten, Primärschlaufe der Hauptlinie, P1/P2 an der Linie, S1/S2 unten
    prims.push(...rect(u + 0.6, y + 1.5, u + 9.4, y - 3.2, true), line(s1 + 0.8, y, s1 + 0.8, y - 1.2), line(s1 + 0.8, y - 1.2, s2 - 0.8, y - 1.2), line(s2 - 0.8, y - 1.2, s2 - 0.8, y),
      text(s1 - 0.6, y + 0.8, 0.9, "P1"), text(s2 + 0.6, y + 0.8, 0.9, "P2"), circle(s1, y - 2, 0.35), circle(s2, y - 2, 0.35), text(s1 + 1.6, y - 2.3, 0.9, "S1"), text(s2 - 1.6, y - 2.3, 0.9, "S2"));
    // Leiter bis zu den Prüfklemmen, Farbe und Nummer, Sicherung 10 A im Spannungspfad
    prims.push(dot(u, y), line(u, y, u, -24.5), ...rect(u - 0.8, -24.5, u + 0.8, -28.5), line(u, -28.5, u, -32.5),
      line(s1, y - 2.35, s1, -32.5), line(s2, y - 2.35, s2, -32.5), text(s1 + 0.7, -16.6, 0.9, String(2 * k + 1)), text(s2 + 0.7, -16.6, 0.9, String(2 * k + 2)),
      vt(u + 1.05, -20.5, 1.1, col), vt(s1 + 1.05, -20.5, 1.1, col), vt(s2 + 1.05, -20.5, 1.1, col));
    // Prüfklemmen: U (Name L1..L3), S1, Lasche, S2; Lasche schliesst S1–S2 („3)“)
    for (const x of [u, s1, ln, s2]) prims.push(...rect(x - 1, -32.5, x + 1, -40.5), ...screw(x, -33.6), ...screw(x, -39.4));
    prims.push(line(u, -34.2, u, -38.8), vt(u, -36.5, 1.1, `L${k + 1}`), line(s1, -34.2, s1, -38.8), line(s2, -34.2, s2, -38.8), line(s1 + 1, -36.5, s2 - 1, -36.5), text(ln, -31.5, 1.1, "3)"));
    if (k) prims.push(line(u - 2.5, -30.5, u - 2.5, -41.5)); // Trennung der Gruppen
    // unter den Prüfklemmen: Farbe mit Nummer, dann tauschen U und S1 (am Zähler S1, U, S2), „5)“ = Leiterenden mit S1/S2 bezeichnen
    prims.push(line(u, -40.5, u, -53), line(u, -53, s1, -53), line(s1, -53, s1, WM_PIN_Y),
      line(s1, -40.5, s1, -52), line(s1, -52, u + 1.25, -52), line(u + 1.25, -52, u + 1.25, -54), line(u + 1.25, -54, u, -54), line(u, -54, u, WM_PIN_Y),
      line(s2, -40.5, s2, WM_PIN_Y), vt(u + 1.05, -46.5, 1.1, col), vt(s1 + 1.05, -46.5, 1.1, `${col} (${2 * k + 1})`), vt(s2 + 1.05, -46.5, 1.1, `${col} (${2 * k + 2})`),
      line(s1 - 0.6, -42.6, s1 + 0.6, -41.4), line(s2 - 0.6, -42.6, s2 + 0.6, -41.4));
  });
  // N: Trennstelle, Prüfklemme „N“, blau
  prims.push(dot(37.5, -15), line(37.5, -15, 37.5, -32.5), line(36.4, -25, 38.6, -25), line(36.4, -27, 38.6, -27), vt(38.55, -20.5, 1.1, "blau"),
    ...rect(36.5, -32.5, 38.5, -40.5), ...screw(37.5, -33.6), ...screw(37.5, -39.4), line(37.5, -34.2, 37.5, -38.8), vt(37.5, -36.5, 1.1, "N"),
    line(35, -30.5, 35, -41.5), line(37.5, -40.5, 37.5, WM_PIN_Y), vt(38.55, -46.5, 1.1, "blau"), ...rect(-2.25, -30.5, 39.75, -41.5), text(-3.6, -42.3, 1.1, "5)"),
    lt(-16, -32.5, 1.1, "Abdeckung plombierbar"), lt(-16, -35, 1.1, "Prüfklemmen, Abdeckung"), lt(-16, -36.7, 1.1, "plombierbar"),
    lt(42, -17.5, 1.5, "Leiterquerschnitte:"), lt(42, -30, 1.2, "Anstelle der Aussenleiterfarben sind auch"), lt(42, -31.8, 1.2, "schwarze nummerierte Leiter (1 bis 6) möglich"),
    lt(42, -35, 1.2, "3) Lasche erst nach Zählermontage öffnen"), lt(42, -37, 1.2, "5) Leiterenden mit S1 bzw. S2 bezeichnen,"), lt(43.6, -38.8, 1.2, "sofern unnummeriert"));
  return prims;
};
// Zähler der Wandlermessung (Ursprung = Anschluss S1 L1 an der Oberkante): Klemmen oben (S1, U, S2 je Aussenleiter, N), je Aussenleiter
// Strompfad (zwei Kreise) und Spannungspfad (Widerstand mit Pfeil, 90°), Steuerleiter 1, 11, X mit hellgrauen Klemmen (⊗, Nummern).
const wmBoxPrims = () => {
  const p = [...rect(-2.5, 0, 52.5, -16)];
  for (const x of [...WM_X, ...WM_CTRL]) p.push(line(x, 0, x, -0.95), ...screw(x, -1.5, 0.6));
  [0, 1, 2].forEach((k) => {
    const a = 12.5 * k, b = a + 2.5, c = a + 7.5;
    p.push(line(a, -2.1, a, -10), circle(a, -11, 1), line(c, -2.1, c, -10), circle(c, -11, 1), line(a, -12, c, -12),
      line(b, -2.1, b, -4), ...rect(b - 0.9, -4, b + 0.9, -8.5), line(b - 1.3, -8.9, b + 1.3, -3.6), ...rect(b + 1.6, -5.2, b + 4.4, -7.2), text(b + 3, -6.2, 0.9, "90°"), line(b, -8.5, b, -14));
  });
  p.push(line(37.5, -2.1, 37.5, -14), line(2.5, -14, 37.5, -14), lt(40.5, -5, 1.2, "Anschluss nach"), lt(40.5, -7, 1.2, "Schema auf"), lt(40.5, -9, 1.2, "Klemmendeckel"));
  WM_CTRL.forEach((x, i) => p.push(line(x, 0, x, 2.5), circle(x, 3.4, 0.9), line(x - 0.64, 2.76, x + 0.64, 4.04), line(x - 0.64, 4.04, x + 0.64, 2.76), line(x, 4.3, x, WM_CTRL_Y),
    text(x - 1.3, 5.4, 0.9, ["1", "11", "X"][i])));
  p.push(lt(49.5, 4.2, 1.2, "Steuerleiter hellgrau mit Nummern"), lt(49.5, 2.2, 1.2, "Steuerbare Lasten z. B. Wassererwärmer (Boiler)"));
  return p;
};
// Anschlüsse unten am Wandlerteil = oben am Zähler, von links: je Aussenleiter S1, U, S2, dann N
export const WM_X = [0, 2.5, 7.5, 12.5, 15, 20, 25, 27.5, 32.5, 37.5];
const WM_CTRL = [42.5, 45, 47.5], WM_CTRL_Y = 7.5; // Steuerleiter 1, 11, X: Anschlüsse über dem Zähler
export const WM_PIN_Y = -57.5, WM_BOX_Y = -60; // Anschlüsse unter dem Leitertausch, Oberkante Zähler (Abstand beim Setzen)
const WM_TAPS = [{ x: 0, y: 0 }, { x: 12.5, y: -5 }, { x: 25, y: -10 }, { x: 37.5, y: -15 }];
// Wandlermessung nach BKW-Schema (CJ 17.10.: „Symbol zum Einfügen, danach alles bearbeitbar und löschbar, Wandler und Klemmen
// bleiben ganz“). Das Palettensymbol ZAEHLER_4P_W wird beim Setzen in Einzelteile zerlegt (wandler.js): je Aussenleiter ein
// Stromwandler ZW_CT, eine Sicherung ZW_SICH und ein Prüfklemmenblock ZW_PK (4 Klemmen mit Messbrücken), Prüfklemme N ZW_PK1,
// Zähler ZW_ZAEHLER2 (Messwerke nach BKW, 10 Klemmen plus 5 unbeschriftete), dazu gewöhnliche Leitungen und Texte.
// Ursprung = L1-Hauptlinie; L2, L3, N 5, 10, 15 mm darunter. Je Aussenleiter k ab u = 15k: Spannung u, S1 u+2,5, Mitte u+5, S2 u+7,5.
// Am Zähler gilt S1, U, S2 (5 mm Teilung, ab x -5): U läuft gerade durch, S1 und S2 knicken nach links, S1 kreuzt U einmal (wie BKW).
const ct = {
  name: "ZW_CT", family: "ZWANDLER", poles: 2, label: "Stromwandler", layer: "SCH_SYMBOLE",
  prims: [...rect(-1.8, 1.5, 4.3, -3.2, true), line(0.6, 0, 0.6, -1.2), line(0.6, -1.2, 1.9, -1.2), line(1.9, -1.2, 1.9, 0),
    text(-0.9, 0.8, 0.9, "P1"), text(3.4, 0.8, 0.9, "P2"), circle(0, -2, 0.35), circle(2.5, -2, 0.35), line(0, -2.35, 0, -2.5), line(2.5, -2.35, 2.5, -2.5),
    text(-1.05, -2.3, 0.9, "S1"), text(3.55, -2.3, 0.9, "S2")],
  pins: [{ x: 0, y: -2.5 }, { x: 2.5, y: -2.5 }], attrs: [],
};
const sich = {
  name: "ZW_SICH", family: "ZSICH", poles: 1, label: "Sicherung Spannungspfad", layer: "SCH_SYMBOLE",
  prims: [line(0, 0, 0, -0.5), ...rect(-0.8, -0.5, 0.8, -4.5), line(0, -4.5, 0, -5)],
  pins: [{ x: 0, y: 0 }, { x: 0, y: -5 }],
  attrs: [{ tag: "FBMK", label: "BMK", def: "", x: -14, y: -0.5, h: 2.5 }, { tag: "FSTROM", label: "Nennstrom", def: "", x: -14, y: -3.5, h: 2.5 }],
};
// Prüfklemme: Gehäuse mit zwei Schrauben, durchverbunden. Messbrücke = Lasche über zwei Schrauben.
const pkTerm = (x) => [...rect(x - 1, 0, x + 1, -8), ...screw(x, -1.1), ...screw(x, -6.9), line(x, -1.7, x, -6.3)];
const strap = (x1, x2, y) => rect(x1, y + 0.5, x2, y - 0.5); // von Schraube zu Schraube
// Block je Aussenleiter (BKW umgekehrt, Wandler oben): U, S1, Mitte, S2. Wandlerseite (oben) Brücke Mitte–S2, Zählerseite (unten) S1–Mitte.
const pk = {
  name: "ZW_PK", family: "ZPK", poles: 4, label: "Prüfklemmen mit Messbrücken", layer: "SCH_SYMBOLE",
  prims: [...[0, 2.5, 5, 7.5].flatMap(pkTerm), ...strap(5, 7.5, -1.1), ...strap(2.5, 5, -6.9), ...rect(-2.5, 2, 10, -9)],
  pins: [0, 2.5, 5, 7.5].flatMap((x) => [{ x, y: 0 }, { x, y: -8 }]), attrs: [],
};
const pk1 = {
  name: "ZW_PK1", family: "ZPK", poles: 1, label: "Prüfklemme N", layer: "SCH_SYMBOLE",
  prims: [...pkTerm(0), ...rect(-2.5, 2, 2.5, -9)], pins: [{ x: 0, y: 0 }, { x: 0, y: -8 }], attrs: [],
};
// Zähler nach BKW (umgekehrt, CJ 18.10. nach BKW-Bild): Klemmen oben (5 mm), je Messwerk S1, U, S2. Strompfad: S1 hinunter, waagrecht
// durch die Mitten beider Kreise (Wirk- und Blindmesswerk), bei S2 wieder hinauf. Spannungspfad: zwei Senkrechte durch die Kreise
// (ergibt das Kreuz), oben (Klemmenseite) verbunden, unten an der N-Sammelleitung; U in der Mitte durch den nichtlinearen Widerstand
// zur N-Leitung; 90°-Kästchen auf der rechten Senkrechten (Blindmesswerk). N-Leitung läuft zur N-Klemme (x 45).
const Z2_EXTRA = [47.5, 50, 52.5, 55, 57.5];
const zaehler2Prims = () => {
  const p = [...rect(-2.5, 0, 62.5, -17)], yI = -12.5, yB = -5, yN = -16;
  for (let i = 0; i < 10; i++) p.push(line(5 * i, 0, 5 * i, -0.95), ...screw(5 * i, -1.5, 0.6));
  for (const x of Z2_EXTRA) p.push(line(x, 0, x, -1.05), ...screw(x, -1.5, 0.45));
  [0, 1, 2].forEach((k) => {
    const a = 15 * k, c1 = a + 2.5, m = a + 5, c2 = a + 7.5, b = a + 10;
    p.push(line(a, -2.1, a, yI), line(a, yI, b, yI), line(b, yI, b, -2.1), circle(c1, yI, 1.2), circle(c2, yI, 1.2), // Strompfad, Kreise
      line(c1, yB, c2, yB), line(c1, yB, c1, yN), line(c2, yB, c2, -7.7), line(c2, -9.3, c2, yN), // Spannungsspulen
      ...rect(c2 - 1.15, -7.7, c2 + 1.15, -9.3), text(c2, -8.5, 0.7, "90°"),
      line(m, -2.1, m, -6), ...rect(m - 0.6, -6, m + 0.6, -11), line(m, -11, m, yN), line(m - 1.2, -11.3, m + 1.2, -5.7), line(m - 1.2, -11.3, m - 1.7, -11.3));
  });
  p.push(line(2.5, yN, 45, yN), line(45, yN, 45, -2.1));
  p.push(lt(48, -6, 1.2, "Anschluss nach"), lt(48, -8, 1.2, "Schema auf"), lt(48, -10, 1.2, "Klemmendeckel"));
  return p;
};
const zaehler2 = {
  name: "ZW_ZAEHLER2", family: "ZAEHLER", poles: 4, label: "Zähler der Wandlermessung", layer: "SCH_SYMBOLE", prims: zaehler2Prims(),
  pins: [...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ x: 5 * i, y: 0 })), ...Z2_EXTRA.map((x) => ({ x, y: 0 }))],
  attrs: [{ ...attrBMK("P?"), y: -1.5 }, { tag: "ZAEHLERNR", label: "Zählernummer", def: "", x: -14, y: -5, h: 2.5 }, { tag: "WANDLER", label: "Wandler", def: "150/5A", x: -14, y: -8.5, h: 2.5 },
    { tag: "TEXT", label: "Text am Zähler", def: "Wirk-/Blindenergiezähler kombiniert", x: -2.5, y: -20, h: 2 }],
};
// Lage aller Teile (lokal zum Palettensymbol). Texte als Symboltexte (text = mittig, lt = linksbündig, vt = senkrecht mittig).
export const WM2_BOX = { x: -5, y: -60 };
export const WM2_TAPS = [{ x: 0, y: 0 }, { x: 15, y: -5 }, { x: 30, y: -10 }, { x: 42.5, y: -15 }];
export function wm2Layout() {
  const syms = [], wires = [], texts = [];
  const lvS1 = -55, lvS2 = -52.5, pkTop = -32.5, pkBot = -40.5;
  [0, 1, 2].forEach((k) => {
    const y = -5 * k, u = 15 * k, s1 = u + 2.5, ln = u + 5, s2 = u + 7.5, col = WM_COL[k], zx = WM2_BOX.x + 15 * k;
    syms.push({ sym: "ZW_CT", x: s1, y }, { sym: "ZW_SICH", x: u, y: -25, attrs: k ? {} : { FBMK: "F?", FSTROM: "10A" } }, { sym: "ZW_PK", x: u, y: pkTop });
    wires.push([[u, y], [u, -25]], [[u, -30], [u, pkTop]], [[s1, y - 2.5], [s1, pkTop]], [[ln, y - 2.5], [ln, pkTop]],
      [[s1, pkBot], [s1, lvS1], [zx, lvS1], [zx, WM2_BOX.y]], [[u, pkBot], [u, WM2_BOX.y]], [[s2, pkBot], [s2, lvS2], [zx + 10, lvS2], [zx + 10, WM2_BOX.y]],
      [[s1 - 0.6, -42.6], [s1 + 0.6, -41.4]], [[s2 - 0.6, -42.6], [s2 + 0.6, -41.4]]); // „5)“: Leiterenden bezeichnen
    texts.push(text(s1 + 0.7, -16.6, 0.9, String(2 * k + 1)), text(ln + 0.7, -16.6, 0.9, String(2 * k + 2)),
      vt(u + 1.05, -20.5, 1.1, col), vt(s1 + 1.05, -20.5, 1.1, col), vt(ln + 1.05, -20.5, 1.1, col), text(s1 + 1.25, -31.2, 1.1, "3)"),
      vt(u + 1.05, -46.5, 1.1, col), vt(s1 + 1.05, -46.5, 1.1, `${col} (${2 * k + 1})`), vt(s2 + 1.05, -46.5, 1.1, `${col} (${2 * k + 2})`));
  });
  // N: Abgriff, Trennstelle, Prüfklemme, zum Zähler
  syms.push({ sym: "ZW_PK1", x: 42.5, y: pkTop }, { sym: "ZW_ZAEHLER2", x: WM2_BOX.x, y: WM2_BOX.y });
  // N gestrichelt (CJ 18.10.: N ist bei uns gestrichelt); Trennstelle auf Höhe der Sicherungen, Striche im Abstand der Sicherungslänge
  const nw = (pts) => Object.assign(pts, { kind: "neutral" });
  wires.push(nw([[42.5, -15], [42.5, pkTop]]), [[41.4, -25.5], [43.6, -25.5]], [[41.4, -29.5], [43.6, -29.5]], nw([[42.5, pkBot], [42.5, lvS2], [40, lvS2], [40, WM2_BOX.y]]));
  texts.push(vt(43.55, -20.5, 1.1, "blau"), vt(43.55, -46.5, 1.1, "blau"), text(-3.6, -42.3, 1.1, "5)"),
    lt(-16, -32.5, 1.1, "Abdeckung plombierbar"), lt(-16, -35, 1.1, "Prüfklemmen, Abdeckung"), lt(-16, -36.7, 1.1, "plombierbar"),
    lt(48, -17.5, 1.5, "Leiterquerschnitte:"), lt(48, -20.5, 1.5, "Strompfad 4 mm²"), lt(48, -23, 1.5, "Spannungspfad 2,5 mm²"),
    lt(48, -30, 1.2, "Anstelle der Aussenleiterfarben sind auch"), lt(48, -31.8, 1.2, "schwarze nummerierte Leiter (1 bis 6) möglich"),
    lt(48, -35, 1.2, "3) Lasche erst nach Zählermontage öffnen"), lt(48, -37, 1.2, "5) Leiterenden mit S1 bzw. S2 bezeichnen,"), lt(49.6, -38.8, 1.2, "sofern unnummeriert"));
  return { syms, wires, texts };
}
// Palettensymbol: Vorschau aus denselben Teilen. Beim Setzen zerlegt wandler.js es (alte Dateien mit ZAEHLER_4P_W ebenso).
const zaehlerWandler = (() => {
  const L = wm2Layout(), parts = [ct, sich, pk, pk1, zaehler2], by = Object.fromEntries(parts.map((q) => [q.name, q]));
  const mv = (q, dx, dy) => (q.t === "l" ? { ...q, x1: q.x1 + dx, y1: q.y1 + dy, x2: q.x2 + dx, y2: q.y2 + dy } : q.t === "c" ? { ...q, cx: q.cx + dx, cy: q.cy + dy } : { ...q, x: q.x + dx, y: q.y + dy });
  const prims = [...L.syms.flatMap((o) => by[o.sym].prims.map((q) => mv(q, o.x, o.y))), ...L.wires.flatMap((w) => w.slice(1).map((q, i) => line(w[i][0], w[i][1], q[0], q[1], w.kind === "neutral"))), ...L.texts];
  return {
    name: "ZAEHLER_4P_W", family: "ZAEHLER", poles: 4, lp: 3, nm: "w", vlabel: "Wandler (>80 A)", label: "Zähler mit Wandlermessung", layer: "SCH_SYMBOLE",
    prims: [...prims, lt(WM2_BOX.x - 2.5, WM2_BOX.y - 20, 2, "Wirk-/Blindenergiezähler kombiniert")], pins: WM2_TAPS,
    attrs: [{ ...attrBMK("P?"), x: WM2_BOX.x - 14, y: WM2_BOX.y - 1.5 }, { tag: "ZAEHLERNR", label: "Zählernummer", def: "", x: WM2_BOX.x - 14, y: WM2_BOX.y - 5, h: 2.5 }, { tag: "WANDLER", label: "Wandler", def: "150/5A", x: WM2_BOX.x - 14, y: WM2_BOX.y - 8.5, h: 2.5 }],
  };
})();
// Ältere Stände (16.10.): Wandlerteil ZW_WANDLER und Zähler ZW_ZAEHLER bleiben für alte Dateien lesbar.
// Wandlerteil: Abgriffe auf den Hauptlinien, unten 10 Anschlüsse. Sicherungen im Spannungspfad beschriftet wie eine Schmelzsicherung.
const wmTrafo = {
  name: "ZW_WANDLER", family: "ZWANDLER", poles: 4, label: "Wandlermessung: Stromwandler und Spannungspfad", layer: "SCH_SYMBOLE", prims: wandlerTop(),
  pins: [...WM_TAPS, ...WM_X.map((x) => ({ x, y: WM_PIN_Y }))],
  attrs: [{ tag: "FBMK", label: "Sicherungen Spannungspfad: BMK", def: "F?", x: -14, y: -24.5, h: 2.5 }, { tag: "FSTROM", label: "Sicherungen Spannungspfad: Nennstrom", def: "10A", x: -14, y: -28, h: 2.5 },
    { tag: "QI", label: "Querschnitt Strompfad", def: "Strompfad 4 mm²", x: 42, y: -20.5, h: 1.5 }, { tag: "QU", label: "Querschnitt Spannungspfad", def: "Spannungspfad 2,5 mm²", x: 42, y: -23, h: 1.5 },
    { tag: "QK", label: "Querschnitt Steuerleiter", def: "Steuerleiter 1,5 mm²", x: 42, y: -25.5, h: 1.5 }],
};
// Zähler der Wandlermessung: frei verschiebbar, Text „Wandlermessung“ änderbar
const wmBox = {
  name: "ZW_ZAEHLER", family: "ZAEHLER", poles: 4, label: "Zähler der Wandlermessung", layer: "SCH_SYMBOLE", prims: wmBoxPrims(),
  pins: [...WM_X.map((x) => ({ x, y: 0 })), ...WM_CTRL.map((x) => ({ x, y: WM_CTRL_Y }))],
  attrs: [{ ...attrBMK("P?"), y: -1.5 }, { tag: "ZAEHLERNR", label: "Zählernummer", def: "", x: -14, y: -5, h: 2.5 }, { tag: "WANDLER", label: "Wandler", def: "150/5A", x: -14, y: -8.5, h: 2.5 },
    { tag: "TEXT", label: "Text am Zähler", def: "Wirk-/Blindenergiezähler kombiniert", x: -2.5, y: -19, h: 2 }],
};

// Erde und Netz TN-C > TN-S (CJ 16.10., nachgezeichnet nach QElectroTech terre und src_tnc_tns, CC-BY 3.0), senkrecht wie
// die übrigen Symbole. Erde: Anschluss oben, Stich 2,5 mm, drei kürzer werdende Striche.
const earth = (x, y) => [line(x, y, x, y - 2.5), line(x - 1.75, y - 2.5, x + 1.75, y - 2.5), line(x - 1.25, y - 3.25, x + 1.25, y - 3.25), line(x - 0.5, y - 4, x + 0.5, y - 4)];
const erde = {
  name: "ERDE_1P", family: "ERDE", poles: 1, vlabel: "Erdung", label: "Erde", layer: "SCH_SYMBOLE", prims: earth(0, 0), pins: [{ x: 0, y: 0 }],
  attrs: [{ tag: "BMK", label: "Betriebsmittelkennzeichen", def: "", x: -14, y: -2, h: 2.5 }],
};
// Weitere Erdungszeichen nach der Symbolzusammenfassung 5.120 (CJ 22.10.2026, selbst gezeichnet), Anschluss oben bei (0, 0)
const erdSym = (name, label, vlabel, prims, pins = [{ x: 0, y: 0 }], attrs = [{ tag: "BMK", label: "Betriebsmittelkennzeichen", def: "", x: -14, y: -2, h: 2.5 }]) =>
  ({ name, family: name === "ERDBAND" ? "ERDBAND" : "ERDE", poles: 1, vlabel, label, layer: "SCH_SYMBOLE", prims, pins, attrs });
const erdArten = [
  erdSym("ERDE_PA", "Potenzialausgleich", "Potenzialausgleich", [line(0, 0, 0, -2.5), line(-2, -2.5, 2, -2.5), line(2, -2.5, 0, -5.5), line(0, -5.5, -2, -2.5)]),
  erdSym("ERDE_ANS", "Erdungs-Anschluss", "Erdungs-Anschluss", [dot(0, -0.5), ...earth(0, -0.5)]),
  erdSym("ERDE_KK", "Erdungs-Klemmkasten", "Erdungs-Klemmkasten", [...rect(-4, 0, 4, -3.5), line(0, 0, 0, -1), line(-1.75, -1, 1.75, -1), line(-1.25, -1.75, 1.25, -1.75), line(-0.5, -2.5, 0.5, -2.5)]),
  erdSym("ERDE_SE", "Schutzerde", "Schutzerde", [circle(0, -4, 3.5), line(0, 0, 0, -4.5), line(-1.75, -4.5, 1.75, -4.5), line(-1.25, -5.25, 1.25, -5.25), line(-0.5, -6, 0.5, -6)]),
  erdSym("ERDBAND", "Erdband", "Erdband", [line(0, 0, 10, 0, true)], [{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ tag: "TEXT", label: "Text", def: "Fe 30/3", x: 1.5, y: 1, h: 2.5 }]),
];
// TN-C > TN-S (CJ 16.10.: „auf dem Kopf“, jetzt Einspeisung von unten): unten L1, L2, L3, PEN; L1 bis L3 laufen durch,
// PEN teilt sich bei y -12.5 (Punkt, geerdet) in N (gerade hoch) und PE (schräg nach rechts oben, 5 mm daneben). Oben L1, L2, L3, N, PE.
const tncTns = {
  name: "TNC_TNS", family: "TNC_TNS", poles: 4, label: "Netz TN-C > TN-S", layer: "SCH_SYMBOLE",
  prims: [...[0, 1, 2, 3].map((i) => line(i * POLE, 0, i * POLE, -POLE_LEN)), dot(15, -12.5), line(15, -12.5, 20, -7.5), line(20, -7.5, 20, 0),
    line(15, -12.5, 23.5, -12.5), ...earth(23.5, -12.5), text(17.8, -17.5, 1.8, "PEN"), text(13.2, -2.5, 1.8, "N"), text(22.2, -2.5, 1.8, "PE"), ...[0, 1, 2].map((i) => text(i * POLE - 1.8, -2.5, 1.8, `L${i + 1}`))],
  pins: [...[0, 1, 2, 3, 4].map((i) => ({ x: i * POLE, y: 0 })), ...[0, 1, 2, 3].map((i) => ({ x: i * POLE, y: -POLE_LEN }))],
  attrs: [attrBMK("")],
};

// Überspannungsschutz (SPD, nach Musterschema): je Leiter ein Ableiter (Rechteck mit Pfeil nach unten), unten gemeinsam auf PE.
// Anschlüsse: oben je Leiter, unten ein PE-Anschluss in der Mitte (auf dem Raster).
// Schaltung "x+1" (CJ 16.10.: alle Varianten): Ableiter der Aussenleiter gegen N, zwischen N und PE eine Funkenstrecke (Pfeile gegeneinander).
const SPD_VL = { 1: "1-polig", 2: "1P+N (2 gegen PE)", 3: "3-polig", 4: "3P+N (4 gegen PE)", "2_1": "1+1 (N–PE Funkenstrecke)", "4_1": "3+1 (N–PE Funkenstrecke)" };
const arrester = (x, y0, y1) => [...rect(x - 1.5, y0, x + 1.5, y1), line(x, y0 - 1, x, y1 + 1), line(x, y1 + 1, x - 0.7, y1 + 2.5), line(x, y1 + 1, x + 0.7, y1 + 2.5)];
function spdVariant(n, gap = false) {
  const prims = [], pins = [], last = (n - 1) * POLE, pe = Math.round(last / 5) * 2.5;
  for (let i = 0; i < n; i++) {
    const x = i * POLE;
    if (gap && i === n - 1) prims.push(line(x, 0, x, -12), text(x + 1.8, -2.5, 1.8, "N")); // N direkt auf die Sammelleitung
    else if (gap) prims.push(line(x, 0, x, -3), ...arrester(x, -3, -10), line(x, -10, x, -12));
    else prims.push(line(x, 0, x, -6), ...arrester(x, -6, -14), line(x, -14, x, -17));
    pins.push({ x, y: 0 });
  }
  if (gap) prims.push(line(0, -12, last, -12), line(pe, -12, pe, -13), ...rect(pe - 1.5, -13, pe + 1.5, -17),
    line(pe, -13, pe, -14.6), line(pe, -14.6, pe - 0.6, -13.8), line(pe, -14.6, pe + 0.6, -13.8),
    line(pe, -17, pe, -15.4), line(pe, -15.4, pe - 0.6, -16.2), line(pe, -15.4, pe + 0.6, -16.2));
  else if (n > 1) prims.push(line(0, -17, last, -17));
  prims.push(line(pe, -17, pe, -POLE_LEN), text(pe + 2.2, -19, 1.8, "PE"));
  pins.push({ x: pe, y: -POLE_LEN });
  const key = gap ? `${n}_1` : n, vl = SPD_VL[key];
  return {
    name: gap ? `SPD_${n}P_1` : `SPD_${n}P`, family: "SPD", poles: n, lp: n === 2 || n === 4 ? n - 1 : n, nm: gap ? "f" : n === 2 || n === 4 ? "n" : "", vlabel: vl, label: `Überspannungsschutz (SPD) ${vl}`, layer: "SCH_SYMBOLE", prims, pins,
    attrs: [attrBMK("F?"), { tag: "TYP", label: "Typ", def: "Typ 2", x: -14, y: -7.5, h: 2.5 }],
  };
}

// Verweis von Blatt zu Blatt: ein dünner Pfeil pro Leiter, zeigt nach unten. Abgehend (VOUT): Spitze unten.
// Ankommend (VIN): Spitze oben. Das Ziel (Blatt.Feld) steht rechts und wird automatisch gesetzt.
function refVariant(dir, n) {
  const prims = [], pins = [];
  for (let i = 0; i < n; i++) {
    const x = i * POLE;
    // dünner Pfeil nach unten: abgehend = Spitze am unteren Ende, ankommend = Spitze am oberen Ende
    const tip = dir === "OUT" ? -5 : -1.8;
    prims.push(line(x, dir === "OUT" ? 0 : tip, x, -5), line(x, tip, x - 0.9, tip + 1.8), line(x, tip, x + 0.9, tip + 1.8)); // ankommend: kein Strich zwischen den Flügeln (CJ 22.10.)
    pins.push(dir === "OUT" ? { x, y: 0 } : { x, y: -5 });
  }
  const out = dir === "OUT";
  return {
    name: `V${dir}_${n}P`, family: `V${dir}`, poles: n, label: `${out ? "Verweis abgehend" : "Verweis ankommend"} ${n}-polig`, layer: "SCH_SYMBOLE", prims, pins,
    attrs: [{ tag: "ZIEL", label: "Ziel (automatisch)", def: "offen", x: (n - 1) * POLE + 3.5, y: -3.5, h: 2.5, auto: true }],
  };
}

// Verweis der Grundverkabelung am Blattrand (hauptlinien.js, CJ 16.10.): waagrechte Pfeile innen am Rahmen, Ziel über L1.
// Ursprung = Pin des untersten Leiters am Linienende. Abgehend (VOUTR): Pfeil 4 mm nach rechts, Spitze am Rahmen.
// Ankommend (VINL): Pfeil 4 mm nach rechts, Spitze am Linienanfang (nach den Namen L1 bis N). Nicht in der Palette.
function edgeRef(dir, n) {
  const out = dir === "OUT", prims = [], pins = [];
  for (let i = 0; i < n; i++) {
    const y = i * POLE, tip = out ? 4 : 0, s = 1.6;
    prims.push(line(out ? 0 : -4, y, out ? 4 : 0, y), line(tip, y, tip - s, y + 0.8), line(tip, y, tip - s, y - 0.8));
    pins.push({ x: 0, y });
  }
  return {
    name: `V${dir}${out ? "R" : "L"}_${n}P`, family: `V${dir}`, poles: n, label: `Verweis ${out ? "abgehend" : "ankommend"} am Blattrand ${n}-polig`, layer: "SCH_SYMBOLE", prims, pins, hidden: true,
    attrs: [{ tag: "ZIEL", label: "Ziel (automatisch)", def: "offen", x: out ? -5 : -8, y: (n - 1) * POLE + 2, h: 2.5, auto: true }],
  };
}

// Klemme als Rechteck 5 x 8 mm, Ursprung = Mitte der oberen Kante. PE-Klemme leicht schraffiert.
const CELL_W = 5, CELL_H = 8;
function cellRect() {
  const hw = CELL_W / 2;
  return [line(-hw, 0, hw, 0), line(hw, 0, hw, -CELL_H), line(hw, -CELL_H, -hw, -CELL_H), line(-hw, -CELL_H, -hw, 0)];
}
function cellHatch(step = 1.8) {
  const out = [];
  const hw = CELL_W / 2;
  for (let c = -CELL_H - hw + 0.9; c < hw; c += step) { // Linien y = x + c, an das Rechteck geschnitten
    const xa = Math.max(-hw, -CELL_H - c), xb = Math.min(hw, -c);
    if (xb - xa > 0.3) out.push(line(r3(xa), r3(xa + c), r3(xb), r3(xb + c)));
  }
  return out;
}
const terminalCell = (name, label, hatched) => ({
  name, label, layer: "SCH_KLEMMEN", hidden: true,
  prims: hatched ? [...cellRect(), ...cellHatch()] : cellRect(),
  pins: [{ x: 0, y: 0 }, { x: 0, y: -CELL_H }],
  attrs: [], // Klemmennummern stehen als zentrierte Texte im Blatt (siehe terminals.js)
});

export const SYMBOLS = [
  ...["1P", "1PN", "1PT", "2P", "3P", "3PN", "3PT", "4P"].map(lsVariant),
  ...[2, 4].map(fiVariant),
  ...["1PN", "2P", "3PN", "4P"].map(rcboVariant),
  ...["1P", "1PT", "3P", "3PT", "4P"].map(nhVariant),
  nTrenner, hak, hakTncs, hakFeed, hpas, ...ZAEHLER_N.map(zaehlerVariant), zaehlerWandler, wmTrafo, wmBox, ct, sich, pk, pk1, zaehler2, tncTns, erde, ...erdArten, ...[1, 2, 3, 4].map((n) => spdVariant(n)), spdVariant(2, true), spdVariant(4, true),
  ...[1, 2, 3, 4].map((n) => refVariant("OUT", n)),
  ...[1, 2, 3, 4].map((n) => refVariant("IN", n)),
  ...[1, 2, 3, 4].map((n) => edgeRef("OUT", n)),
  ...[1, 2, 3, 4].map((n) => edgeRef("IN", n)),
  ...[1, 2, 3, 4].map((n) => contactVariant(false, n)),
  ...[1, 2, 3, 4].map((n) => contactVariant(true, n)),
  contactVariant(false, 1, true), contactVariant(true, 1, true),
  coilVariant(false), coilVariant(true),
  ...kontakte, trVariant(1), trVariant(3), ...relais,
  ...bauteile,
  ...[1, 2, 3, 4].map(schuetzVariant),
  {
    name: "MOTOR_3P", family: "MOTOR", poles: 3, label: "Motor", layer: "SCH_SYMBOLE", // Stromart beschriftbar, auch 1~ (CJ 22.10.2026)
    prims: [circle(0, 0, 5), text(0, 1.2, 3.5, "M")],
    pins: [{ x: 0, y: 5 }],
    attrs: [
      { tag: "BMK", label: "Betriebsmittelkennzeichen", def: "M?", x: 8, y: 2, h: 2.5 },
      { tag: "LEISTUNG", label: "Leistung", def: "0.55kW", x: 8, y: -1.5, h: 2.5 },
      { tag: "SPANNUNG", label: "Spannung", def: "400V", x: 8, y: -5, h: 2.5 },
      { tag: "STROMART", label: "Stromart (im Kreis)", def: "3~", x: -1.2, y: -3.4, h: 2.2 },
    ],
  },
  terminalCell("KLEMME_R", "Klemme", false),
  terminalCell("KLEMME_PE", "PE-Klemme", true),
  ...PRINZIP_SYMBOLS, // nicht in FAMILIES, eigene Palette (prinzipsym.js)
];

// Schutzgeräte: bekommen automatisch Nummer (F) und Klemmen unten
export const DEVICE_FAMILIES = ["LS", "FI", "RCBO", "NH"];
// Automatische BMK aus Blatt, Kennbuchstabe und Spalte (3F4). SPD: T (CJ 16.10.), Zähler: P (Vorgabe „P?“ im Symbol)
export const BMK_LETTER = { LS: "F", FI: "F", RCBO: "F", NH: "F", SPD: "T", ZAEHLER: "P" };
export const bmkLetter = (sym) => BMK_LETTER[sym.family] ?? null;
// Abstand vom ersten Pol zum Fangpunkt: bei 3 und 4 Polen der Pol L2, damit L1, L2, L3 bei beiden an derselben Stelle liegen (N kommt rechts dazu)
export const anchorX = (poles) => (Math.min(poles - 1, 2) * POLE) / 2;
export const isDevice = (sym) => DEVICE_FAMILIES.includes(sym.family);

export const SYMBOL_BY_NAME = Object.fromEntries(SYMBOLS.map((s) => [s.name, s]));

// Symbole aus Bibliotheken (importiert) kommen zur Laufzeit dazu. Gleiche Namen werden nicht überschrieben.
export function registerSymbol(sym) {
  if (SYMBOL_BY_NAME[sym.name]) return SYMBOL_BY_NAME[sym.name];
  SYMBOLS.push(sym); SYMBOL_BY_NAME[sym.name] = sym;
  return sym;
}

// Palette: eine Zeile pro Familie, Polzahl wird beim Setzen oder in den Eigenschaften gewählt
export const FAMILIES = [
  { id: "HAK", label: "Hausanschlusskasten", sub: "TN-S oder TN-C > TN-S (PEN-Aufteilung)", def: "HAK_4P", variants: ["HAK_4P", "HAK_TNCS", "HAK_TNCS_1"] },
  { id: "ZAEHLER", label: "Zähler", sub: "1 bis 8 Anschlüsse, 5 Seitenkontakte, Wandlermessung", def: "ZAEHLER_4P", variants: [...ZAEHLER_N.map((n) => `ZAEHLER_${n}P`), "ZAEHLER_4P_W"] },
  { id: "TNC_TNS", label: "Netz TN-C > TN-S", sub: "PEN teilt in N und PE", def: "TNC_TNS", variants: ["TNC_TNS"] },
  { id: "SPD", label: "Überspannungsschutz (SPD)", sub: "1 bis 4 polig, 1+1, 3+1", def: "SPD_4P", variants: ["SPD_1P", "SPD_2P", "SPD_2P_1", "SPD_3P", "SPD_4P", "SPD_4P_1"] },
  { id: "LS", label: "Leitungsschutzschalter", sub: "1 bis 4 polig, +N, + N-Trenner", def: "LS_4P", variants: ["LS_1P", "LS_1PN", "LS_1PT", "LS_2P", "LS_3P", "LS_3PN", "LS_3PT", "LS_4P"] },
  { id: "FI", label: "FI-Schutzschalter", sub: "2 oder 4 polig", def: "FI_4P", variants: ["FI_2P", "FI_4P"] },
  { id: "RCBO", label: "FI/LS-Schalter (RCBO)", sub: "1P+N, 2P, 3P+N, 4P", def: "RCBO_4P", variants: ["RCBO_1PN", "RCBO_2P", "RCBO_3PN", "RCBO_4P"] },
  { id: "NH", label: "NH-Sicherung", sub: "1 oder 3 polig, + N-Trenner", def: "NH_3PT", variants: ["NH_1P", "NH_1PT", "NH_3P", "NH_3PT", "NH_4P"], hide: ["NH_4P"] }, // NH_4P nur noch für alte Dateien (CJ 22.10.)
  { id: "NTRENN", label: "Neutralleitertrenner", sub: "einzeln", def: "NTRENN_1P", variants: ["NTRENN_1P"] },
  { id: "ERDE", label: "Erdung", sub: "Erde, Potenzialausgleich, HPAS, Schutzerde", def: "ERDE_1P", variants: ["ERDE_1P", "ERDE_PA", "HPAS_1P", "ERDE_ANS", "ERDE_KK", "ERDE_SE"] }, // HPAS zur Erdung (CJ 22.10.)
  { id: "ERDBAND", label: "Erdband", sub: "z. B. Fe 30/3", def: "ERDBAND", variants: ["ERDBAND"] },
  { id: "VOUT", label: "Verweis abgehend", sub: "weiter auf anderem Blatt", def: "VOUT_4P", variants: ["VOUT_1P", "VOUT_2P", "VOUT_3P", "VOUT_4P"] },
  { id: "VIN", label: "Verweis ankommend", sub: "von anderem Blatt", def: "VIN_4P", variants: ["VIN_1P", "VIN_2P", "VIN_3P", "VIN_4P"] },
  { id: "SPULE", label: "Spule Schütz", sub: "Betätigung A1/A2", def: "SPULE_1P", variants: ["SPULE_1P"] },
  { id: "RELAIS", label: "Spule Relais", sub: "Betätigung A1/A2", def: "RELAIS_1P", variants: ["RELAIS_1P"] },
  { id: "SCHUETZ", label: "Schütz Hauptkontakte", sub: "1 bis 4 polig, 1/2 bis 7/8", def: "SCHUETZ_3P", variants: ["SCHUETZ_1P", "SCHUETZ_2P", "SCHUETZ_3P", "SCHUETZ_4P"] },
  { id: "KS", label: "Schliesser", sub: "Kontakt, 1 bis 4 polig", def: "KS_4P", variants: ["KS_1P", "KS_2P", "KS_3P", "KS_4P"] },
  { id: "KO", label: "Öffner", sub: "Kontakt, 1 bis 4 polig", def: "KO_4P", variants: ["KO_1P", "KO_2P", "KO_3P", "KO_4P"] },
  { id: "TASTER_S", label: "Taster Schliesser", sub: "Handbetätigt", def: "TASTER_S_1P", variants: ["TASTER_S_1P"] },
  { id: "TASTER_O", label: "Taster Öffner", sub: "Handbetätigt", def: "TASTER_O_1P", variants: ["TASTER_O_1P"] },
  { id: "KW", label: "Wechsler", sub: "Umschaltkontakt 11/12/14", def: "KW_1P", variants: ["KW_1P"] },
  { id: "TRK", label: "Kontakt Thermorelais", sub: "Öffner 95/96 oder Schliesser 97/98", def: "TRK_O_1P", variants: ["TRK_O_1P", "TRK_S_1P"] },
  { id: "TR", label: "Thermorelais", sub: "Überlastrelais, 1 oder 3 polig", def: "TR_3P", variants: ["TR_1P", "TR_3P"] },
  { id: "STR", label: "Stromstossrelais", sub: "Spule mit Schrittzeichen", def: "STR_1P", variants: ["STR_1P"] },
  { id: "ZR", label: "Zeitrelais", sub: "abfall- oder anzugsverzögert", def: "ZR_AB_1P", variants: ["ZR_AB_1P", "ZR_AN_1P"] },
  { id: "USR", label: "Unterspannungsrelais", sub: "U<", def: "USR_1P", variants: ["USR_1P"] },
  { id: "HSCH", label: "Schalter", sub: "handbetätigt", def: "HSCH_1P", variants: ["HSCH_1P"] },
  { id: "DSCH", label: "Drehschalter", sub: "mit Raste", def: "DSCH_1P", variants: ["DSCH_1P"] },
  { id: "DTAST", label: "Schwenktaster", sub: "Drehknopf mit Rückstellung", def: "DTAST_1P", variants: ["DTAST_1P"] },
  { id: "UMS", label: "Umschalter mit Aus", sub: "zwei Wege, Mittelstellung Aus", def: "UMS_1P", variants: ["UMS_1P"] },
  { id: "LAMPE", label: "Meldeleuchte", sub: "Signallampe", def: "LAMPE_1P", variants: ["LAMPE_1P"] },
  { id: "MESS", label: "Messgerät", sub: "Voltmeter, Amperemeter, Stundenzähler", def: "MESS_V_1P", variants: ["MESS_V_1P", "MESS_A_1P", "MESS_H_1P"] },
  { id: "STD", label: "Steckdose und Stecker", sub: "Steckverbindung", def: "STD_1P", variants: ["STD_1P"] },
  { id: "FU", label: "Frequenzumformer", sub: "z. B. Wärmepumpe, Lüftung", def: "FU_1P", variants: ["FU_1P"] },
  { id: "SANFT", label: "Sanftanlasser", sub: "Motoranlauf", def: "SANFT_1P", variants: ["SANFT_1P"] },
  { id: "GEN", label: "Generator", sub: "Stromart beschriftbar", def: "GEN_1P", variants: ["GEN_1P"] },
  { id: "BAUTEIL", label: "Bauteil", sub: "Widerstand, Kondensator, Spule, LED, Batterie", def: "R_1P", variants: ["R_1P", "C_1P", "L_1P", "LED_1P", "BATT_1P"] },
  { id: "MOTOR", label: "Motor", sub: "Stromart beschriftbar, z. B. 3~ oder 1~", def: "MOTOR_3P", variants: ["MOTOR_3P"] },
];

// Polzahl per Taste (CJ 16.10.): 1 bis 4 wählt die Anzahl Pole (N-Art bleibt, wenn es die Variante gibt), N schaltet den
// Neutralleiter weiter: ohne → mitgeschaltet → (SPD: Funkenstrecke) → ohne; T schaltet den N-Trenner ein und aus.
// Gibt den neuen Symbolnamen oder null.
const NM_ORDER = ["", "n", "f"];
export function variantByKey(name, key) {
  const fam = FAMILIES.find((f) => f.variants.includes(name));
  if (!fam || fam.variants.length < 2) return null;
  const info = (v) => { const s = SYMBOL_BY_NAME[v]; return { v, lp: s.lp ?? s.poles, nm: s.nm ?? "", poles: s.poles }; };
  const cur = info(name), all = fam.variants.filter((v) => v === name || !fam.hide?.includes(v)).map(info);
  let pick;
  if (/^[1-8]$/.test(key)) { // 5 bis 8 nur beim Zähler (CJ 22.10.)
    if (all.every((o) => o.lp === all[0].lp)) return null; // Varianten gleicher Polzahl (z. B. Erdungsarten): Ziffer wechselt nichts
    const k = Number(key);
    pick = all.find((o) => o.lp === k && o.nm === cur.nm) ?? all.find((o) => o.lp === k && o.nm === "") ?? all.find((o) => o.poles === k) ?? all.find((o) => o.lp === k);
  } else if (key === "n" || key === "N") {
    const same = all.filter((o) => o.lp === cur.lp && NM_ORDER.includes(o.nm)).sort((a, b) => NM_ORDER.indexOf(a.nm) - NM_ORDER.indexOf(b.nm));
    const i = same.findIndex((o) => o.v === name);
    pick = i < 0 ? same.find((o) => o.nm === "n") ?? same[0] : same[(i + 1) % same.length]; // vom Trenner: auf +N
  } else if (key === "t" || key === "T") {
    pick = cur.nm === "t" ? all.find((o) => o.lp === cur.lp && o.nm === "") : all.find((o) => o.lp === cur.lp && o.nm === "t");
  }
  return pick && pick.v !== name ? pick.v : null;
}

// Familie mit N-Trenner-Variante: dort ist T die Trenner-Taste und nicht das Text-Werkzeug
export const hasTrenner = (name) => !!FAMILIES.find((f) => f.variants.includes(name))?.variants.some((v) => SYMBOL_BY_NAME[v].nm === "t");

export function localBBox(sym) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const p of sym.prims) {
    if (p.t === "l") { add(p.x1, p.y1); add(p.x2, p.y2); }
    else if (p.t === "c") { add(p.cx - p.r, p.cy - p.r); add(p.cx + p.r, p.cy + p.r); }
    else if (p.t === "t" && p.al === "l") { add(p.x, p.y - p.h); add(p.x + p.s.length * p.h * 0.5, p.y + p.h); } // linksbündig: ungefähre Breite
    else if (p.t === "t") { add(p.x - p.h, p.y - p.h); add(p.x + p.h, p.y + p.h); }
  }
  return { x0, y0, x1, y1 };
}

// Drehung um den Ursprung (rot in Grad, gegen den Uhrzeigersinn wie in DXF)
export function rotatePoint(x, y, rotDeg) {
  const a = (rotDeg * Math.PI) / 180;
  const c = Math.round(Math.cos(a) * 1e9) / 1e9;
  const s = Math.round(Math.sin(a) * 1e9) / 1e9;
  return { x: x * c - y * s, y: x * s + y * c };
}
