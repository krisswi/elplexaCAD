// Symboldefinitionen (eigene, generische Symbole). Einheit mm, y nach oben (wie DXF).
// Ursprung = oberer Anschluss von Pol 1. Alles liegt auf einem 2,5-mm-Raster.
// Dieselben Daten zeichnen das Symbol im Editor und schreiben den DXF-Block.

const line = (x1, y1, x2, y2, dashed = false) => ({ t: "l", x1, y1, x2, y2, d: dashed });
const circle = (cx, cy, r) => ({ t: "c", cx, cy, r });
const text = (x, y, h, s) => ({ t: "t", x, y, h, s, anchor: "mm" });
const r3 = (n) => Math.round(n * 1000) / 1000;

export const POLE = 5;
const POLE_LEN = 20;

function pole(x, withCross) {
  const p = [line(x, 0, x, -6), line(x, -14, x, -POLE_LEN), line(x, -14, x - 2.5, -6)];
  if (withCross) p.push(line(x - 3.5, -5, x - 1.5, -7), line(x - 3.5, -7, x - 1.5, -5));
  return p;
}

function poles(n, withCross) {
  const prims = [];
  const pins = [];
  for (let i = 0; i < n; i++) {
    prims.push(...pole(i * POLE, withCross));
    pins.push({ x: i * POLE, y: 0 }, { x: i * POLE, y: -POLE_LEN });
  }
  if (n > 1) prims.push(line(-1.2, -10, (n - 1) * POLE - 1.2, -10, true)); // mechanische Kopplung
  return { prims, pins };
}

const attrBMK = (def) => ({ tag: "BMK", label: "Betriebsmittelkennzeichen", def, x: -14, y: -4, h: 2.5 });
const attrStrom = (def) => ({ tag: "STROM", label: "Nennstrom", def, x: -14, y: -7.5, h: 2.5 });

function lsVariant(n) {
  const g = poles(n, true);
  return {
    name: `LS_${n}P`, family: "LS", poles: n, label: `Leitungsschutzschalter ${n}-polig`, layer: "SCH_SYMBOLE",
    prims: g.prims, pins: g.pins,
    attrs: [attrBMK("F?"), attrStrom("13A"), { tag: "CHAR", label: "Charakteristik", def: "C", x: -14, y: -11, h: 2.5 }],
  };
}

function fiVariant(n) {
  const g = poles(n, false);
  g.prims.push(circle(((n - 1) * POLE) / 2, -10, 1.2)); // Summenstromwandler (vereinfacht)
  return {
    name: `FI_${n}P`, family: "FI", poles: n, label: `FI-Schutzschalter ${n}-polig`, layer: "SCH_SYMBOLE",
    prims: g.prims, pins: g.pins,
    attrs: [attrBMK("Q?"), attrStrom("40A"), { tag: "IDN", label: "Bemessungsfehlerstrom", def: "30mA", x: -14, y: -11, h: 2.5 }],
  };
}

function rcboVariant(n) {
  const g = poles(n, true);
  g.prims.push(circle(((n - 1) * POLE) / 2, -10, 1.2));
  return {
    name: `RCBO_${n}P`, family: "RCBO", poles: n, label: `FI/LS-Schalter (RCBO) ${n}-polig`, layer: "SCH_SYMBOLE",
    prims: g.prims, pins: g.pins,
    attrs: [attrBMK("F?"), attrStrom("16A"), { tag: "CHAR", label: "Charakteristik", def: "B", x: -14, y: -11, h: 2.5 }, { tag: "IDN", label: "Bemessungsfehlerstrom", def: "30mA", x: -14, y: -14.5, h: 2.5 }],
  };
}


// Kontakte: Schliesser (KS), Öffner (KO), Taster; Spule für Schütz und Relais. Eigene Zeichnung nach der üblichen Darstellung (Entwurf, von CJ zu prüfen).
function contactPole(x, nc) {
  const p = [line(x, -14, x, -POLE_LEN)];
  if (nc) p.push(line(x, 0, x, -6), line(x, -6, x - 2.5, -6), line(x, -14, x - 2.5, -6));
  else p.push(line(x, 0, x, -6), line(x, -14, x - 2.5, -6));
  return p;
}
function contactVariant(nc, n, push = false) {
  const prims = [], pins = [];
  for (let i = 0; i < n; i++) { prims.push(...contactPole(i * POLE, nc)); pins.push({ x: i * POLE, y: 0 }, { x: i * POLE, y: -POLE_LEN }); }
  if (n > 1) prims.push(line(-1.2, -10, (n - 1) * POLE - 1.2, -10, true));
  if (push) { prims.push(line(-1.2, -10, -6, -10, true), line(-6, -8, -6, -12)); }
  const fam = push ? (nc ? "TASTER_O" : "TASTER_S") : nc ? "KO" : "KS";
  const label = push ? (nc ? "Taster Öffner" : "Taster Schliesser") : nc ? "Öffner" : "Schliesser";
  return {
    name: `${fam}_${n}P`, family: fam, poles: n, label: `${label}${n > 1 ? " " + n + "-polig" : ""}`, layer: "SCH_SYMBOLE", prims, pins,
    attrs: [{ tag: "BMK", label: "Betriebsmittelkennzeichen", def: push ? "S?" : "K?", x: -14, y: -4, h: 2.5 }],
  };
}
const coil = {
  name: "SPULE_1P", family: "SPULE", poles: 1, label: "Spule Schütz/Relais", layer: "SCH_SYMBOLE",
  prims: [line(0, 0, 0, -5), line(-3, -5, 3, -5), line(3, -5, 3, -15), line(3, -15, -3, -15), line(-3, -15, -3, -5), line(0, -15, 0, -20), text(-5.2, -1.5, 1.8, "A1"), text(-5.2, -18.5, 1.8, "A2")],
  pins: [{ x: 0, y: 0 }, { x: 0, y: -20 }],
  attrs: [{ tag: "BMK", label: "Betriebsmittelkennzeichen", def: "K?", x: 5, y: -8, h: 2.5 }, { tag: "TEXT", label: "Funktion", def: "", x: 5, y: -12, h: 2.5 }],
};

// NH-Sicherung: Rechteck mit Schmelzleiter in jedem Pol
function nhVariant(n) {
  const prims = [], pins = [];
  for (let i = 0; i < n; i++) {
    const x = i * POLE;
    prims.push(line(x, 0, x, -6), line(x, -14, x, -POLE_LEN), line(x - 1.5, -6, x + 1.5, -6), line(x + 1.5, -6, x + 1.5, -14), line(x + 1.5, -14, x - 1.5, -14), line(x - 1.5, -14, x - 1.5, -6), line(x, -6, x, -14));
    pins.push({ x, y: 0 }, { x, y: -POLE_LEN });
  }
  return {
    name: `NH_${n}P`, family: "NH", poles: n, label: `NH-Sicherung ${n}-polig`, layer: "SCH_SYMBOLE", prims, pins,
    attrs: [attrBMK("F?"), attrStrom("100A"), { tag: "GROESSE", label: "Baugrösse", def: "NH00", x: -14, y: -11, h: 2.5 }],
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
    prims.push(line(x, 0, x, -5), line(x, tip, x - 0.9, tip + 1.8), line(x, tip, x + 0.9, tip + 1.8));
    pins.push(dir === "OUT" ? { x, y: 0 } : { x, y: -5 });
  }
  const out = dir === "OUT";
  return {
    name: `V${dir}_${n}P`, family: `V${dir}`, poles: n, label: `${out ? "Verweis abgehend" : "Verweis ankommend"} ${n}-polig`, layer: "SCH_SYMBOLE", prims, pins,
    attrs: [{ tag: "ZIEL", label: "Ziel (automatisch)", def: "offen", x: (n - 1) * POLE + 3.5, y: -3.5, h: 2.5, auto: true }],
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
  ...[1, 2, 3, 4].map(lsVariant),
  ...[2, 4].map(fiVariant),
  ...[2, 4].map(rcboVariant),
  ...[1, 3, 4].map(nhVariant),
  ...[1, 2, 3, 4].map((n) => refVariant("OUT", n)),
  ...[1, 2, 3, 4].map((n) => refVariant("IN", n)),
  ...[1, 2, 3, 4].map((n) => contactVariant(false, n)),
  ...[1, 2, 3, 4].map((n) => contactVariant(true, n)),
  contactVariant(false, 1, true), contactVariant(true, 1, true),
  coil,
  {
    name: "MOTOR_3P", family: "MOTOR", poles: 3, label: "Motor 3-phasig", layer: "SCH_SYMBOLE",
    prims: [circle(0, 0, 5), text(0, 0, 3.5, "M")],
    pins: [{ x: 0, y: 5 }],
    attrs: [
      { tag: "BMK", label: "Betriebsmittelkennzeichen", def: "M?", x: 8, y: 2, h: 2.5 },
      { tag: "LEISTUNG", label: "Leistung", def: "0.55kW", x: 8, y: -1.5, h: 2.5 },
      { tag: "SPANNUNG", label: "Spannung", def: "400V", x: 8, y: -5, h: 2.5 },
    ],
  },
  terminalCell("KLEMME_R", "Klemme", false),
  terminalCell("KLEMME_PE", "PE-Klemme", true),
];

// Schutzgeräte: bekommen automatisch Nummer (F) und Klemmen unten
export const DEVICE_FAMILIES = ["LS", "FI", "RCBO", "NH"];
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
  { id: "LS", label: "Leitungsschutzschalter", sub: "1 bis 4 polig", def: "LS_4P", variants: ["LS_1P", "LS_2P", "LS_3P", "LS_4P"] },
  { id: "FI", label: "FI-Schutzschalter", sub: "2 oder 4 polig", def: "FI_4P", variants: ["FI_2P", "FI_4P"] },
  { id: "RCBO", label: "FI/LS-Schalter (RCBO)", sub: "2 oder 4 polig", def: "RCBO_4P", variants: ["RCBO_2P", "RCBO_4P"] },
  { id: "NH", label: "NH-Sicherung", sub: "1, 3 oder 4 polig", def: "NH_4P", variants: ["NH_1P", "NH_3P", "NH_4P"] },
  { id: "VOUT", label: "Verweis abgehend", sub: "weiter auf anderem Blatt", def: "VOUT_4P", variants: ["VOUT_1P", "VOUT_2P", "VOUT_3P", "VOUT_4P"] },
  { id: "VIN", label: "Verweis ankommend", sub: "von anderem Blatt", def: "VIN_4P", variants: ["VIN_1P", "VIN_2P", "VIN_3P", "VIN_4P"] },
  { id: "SPULE", label: "Spule (Schütz, Relais)", sub: "Betätigung A1/A2", def: "SPULE_1P", variants: ["SPULE_1P"] },
  { id: "KS", label: "Schliesser", sub: "Kontakt, 1 bis 4 polig", def: "KS_4P", variants: ["KS_1P", "KS_2P", "KS_3P", "KS_4P"] },
  { id: "KO", label: "Öffner", sub: "Kontakt, 1 bis 4 polig", def: "KO_4P", variants: ["KO_1P", "KO_2P", "KO_3P", "KO_4P"] },
  { id: "TASTER_S", label: "Taster Schliesser", sub: "Handbetätigt", def: "TASTER_S_1P", variants: ["TASTER_S_1P"] },
  { id: "TASTER_O", label: "Taster Öffner", sub: "Handbetätigt", def: "TASTER_O_1P", variants: ["TASTER_O_1P"] },
  { id: "MOTOR", label: "Motor 3-phasig", sub: "mit Leistung und Spannung", def: "MOTOR_3P", variants: ["MOTOR_3P"] },
];

export function localBBox(sym) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const p of sym.prims) {
    if (p.t === "l") { add(p.x1, p.y1); add(p.x2, p.y2); }
    else if (p.t === "c") { add(p.cx - p.r, p.cy - p.r); add(p.cx + p.r, p.cy + p.r); }
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
