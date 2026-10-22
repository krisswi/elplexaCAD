// Symbole des Prinzipschemas (CJ 21.10.2026): einpolige Darstellung, selbst gezeichnet (Clean-Room, nichts übernommen).
// Gleiche Form wie symbols.js (mm, y nach oben, Ursprung = erster Anschluss, Raster 2,5 mm). Ohne Importe, symbols.js hängt sie an SYMBOLS.
// Abgänge waagrecht (Anschlüsse links und rechts), Teile der Hauptverteilung senkrecht (oben und unten). R dreht wie im Schema.
// BMK: leeres Feld an den Geräten, von Hand ausfüllbar. Die Verknüpfung mit Schema und Disposition kommt später (CJ 21.10.).

const line = (x1, y1, x2, y2) => ({ t: "l", x1, y1, x2, y2, d: false });
const circle = (cx, cy, r) => ({ t: "c", cx, cy, r });
const text = (x, y, h, s) => ({ t: "t", x, y, h, s, anchor: "mm" });
const rect = (x0, y0, x1, y1) => [line(x0, y0, x1, y0), line(x1, y0, x1, y1), line(x1, y1, x0, y1), line(x0, y1, x0, y0)];
const attr = (tag, label, def, x, y, h = 2.5) => ({ tag, label, def, x, y, h });
const bmk = (x, y) => attr("BMK", "Betriebsmittelkennzeichen", "", x, y);
const sym = (name, label, prims, pins, attrs) => ({ name, family: name.replace(/_\d$/, ""), poles: 1, label, layer: "SCH_SYMBOLE", prims, pins, attrs });
const H = (x) => [{ x: 0, y: 0 }, { x, y: 0 }]; // Anschlüsse waagrecht, links und rechts

// Schaltstück offen: Leiter, Schwenkpunkt bei x0, Festkontakt mit Querstrich bei x1, Kreuz = Leitungsschutz
// Beschriftung der Abgangsgeräte (CJ 21.10.2026): immer drei Zeilen oberhalb, zuoberst BMK, darunter Bezeichnung, unten Polzahl (LN, 3LN)
const top3 = (def) => [bmk(-1, 9.5), attr("TEXT", "Bezeichnung", def, -1, 6.5), attr("POL", "Polzahl (Tasten 1–3 und N)", "LN", -1, 3.5)]; // eng am Gerät (CJ 21.10.)
const blade = (x0, x1, cross) => [line(x0, 0, x1, 2.5), line(x1, -0.8, x1, 0.8), ...(cross ? [line(x1 + 0.6, 1.2, x1 + 1.8, 2.4), line(x1 + 1.8, 1.2, x1 + 0.6, 2.4)] : [])];
const ls = sym("PZ_LS", "Leitungsschutzschalter (LS)", [line(0, 0, 2.5, 0), ...blade(2.5, 7.5, true), line(7.5, 0, 10, 0)], H(10), top3("LS C 13A"));
const fi = sym("PZ_FI", "Fehlerstromschutzschalter (FI)", [line(0, 0, 1.5, 0), ...rect(1.5, -2.5, 8.5, 2.5), text(5, 0, 2.5, "FI"), line(8.5, 0, 10, 0)], H(10), top3("FI 40A 30mA"));
const fils = sym("PZ_FILS", "FI/LS-Schalter (RCBO)", [line(0, 0, 1.5, 0), ...rect(1.5, -2.5, 16, 2.5), line(7, -2.5, 7, 2.5), text(4.25, 0, 2.2, "FI"), line(7, 0, 8.5, 0), line(8.5, 0, 12.5, 2), line(12.5, -0.8, 12.5, 0.8), line(13.1, 0.6, 14.1, 1.6), line(14.1, 0.6, 13.1, 1.6), line(12.5, 0, 17.5, 0)], H(17.5),
  top3("FI/LS B13A 30mA"));
// Sicherung (z. B. DII): senkrecht, Rechteck mit durchgehendem Leiter
const sich = sym("PZ_SICH", "Sicherung (Schmelzsicherung)", [line(0, 0, 0, -12.5), ...rect(-1.5, -2.5, 1.5, -10)], [{ x: 0, y: 0 }, { x: 0, y: -12.5 }], [attr("TEXT", "Bezeichnung", "DII 25 A", 3, -7), bmk(3, -3.5)]);

// Leitungsangabe: Stück Leitung mit Strichen (Anzahl Leiter), darüber Kabel und Querschnitt. Auf eine Leitung legen oder einfügen.
const STRICH = ["", "1 Strich", "2 Striche", "3 Striche", "4 Striche", "5 Striche"];
function leiter(n) {
  const p = [line(0, 0, 5, 0)];
  for (let i = 0; i < n; i++) { const x = 2.5 + (i - (n - 1) / 2); p.push(line(x - 0.75, -1.5, x + 0.75, 1.5)); }
  return { ...sym(`PZ_LEITER_${n}`, `Leitungsangabe, ${STRICH[n]}`, p, H(5), [attr("KABEL", "Leitung", "3x1,5mm²", -2, 2.5)]), vlabel: STRICH[n] };
}
// Verbraucher bzw. Anschlussstelle am Ende des Abgangs: Kreis, rechts der Text
const verbr = sym("PZ_VERBR", "Verbraucher (Anschlussstelle)", [circle(1.25, 0, 1.25)], [{ x: 0, y: 0 }], [attr("TEXT", "Verbraucher", "Verbraucher", 5, -1)]);
// Klemme bzw. Abzweig plombierbar: Quadrat mit Diagonale, Anschlüsse auf allen vier Seiten
const klemme = sym("PZ_KLEMME", "Klemme, plombierbar", [...rect(-2.5, -5, 2.5, 0), line(-2.5, -5, 2.5, 0)], [{ x: 0, y: 0 }, { x: 0, y: -5 }, { x: -2.5, y: -2.5 }, { x: 2.5, y: -2.5 }], [attr("TEXT", "Text", "", 4, -3.5)]);

// Hauptverteilung, senkrecht. Kasten 15 × 20 mm mit Kopfband (Text klein, z. B. Spannung), Anschluss oben, unten und rechts.
const BOX = [...rect(-7.5, -20, 7.5, 0), line(-7.5, -5, 7.5, -5)], BOX_PINS = [{ x: 0, y: 0 }, { x: 0, y: -20 }, { x: 7.5, y: -15 }];
const zaehler = sym("PZ_ZAEHLER", "Zähler (kWh)", [...BOX, text(0, -12.5, 3, "kWh")], BOX_PINS, [attr("TEXT", "Kopfband", "3x400/230", -6.5, -3.2, 1.8), bmk(9.5, -3)]);
const rse = sym("PZ_RSE", "Rundsteuerempfänger (RSE)", [...BOX, text(0, -12.5, 3, "RSE")], BOX_PINS, [attr("TEXT", "Kopfband", "", -6.5, -3.2, 1.8), bmk(9.5, -3)]);
// Gerät mit eigenem Text (z. B. Schütz S, Smart Meter, Schaltuhr): Kasten 10 × 10 mm
const geraet = sym("PZ_GERAET", "Gerät mit Text", rect(-5, -10, 5, 0), [{ x: 0, y: 0 }, { x: 0, y: -10 }, { x: -5, y: -5 }, { x: 5, y: -5 }], [attr("TEXT", "Text im Kasten", "S", -3.5, -6), bmk(7, -3)]);
// Hausanschluss (Anschlussüberstromunterbrecher): Kasten mit Spitze nach unten zum Kabel
const hak = sym("PZ_HAK", "Hausanschluss", [line(-5, 0, 5, 0), line(5, 0, 5, -12.5), line(5, -12.5, 0, -17.5), line(0, -17.5, -5, -12.5), line(-5, -12.5, -5, 0)],
  [{ x: 0, y: 0 }, { x: 0, y: -17.5 }, { x: 5, y: -5 }], [attr("TEXT", "Nennstrom", "80 A", -3.5, -7), bmk(7, -14)]);

// Erdung: Erder mit drei kürzer werdenden Strichen; Potentialausgleich = Anschlusspunkt (Kreis) mit Erde darunter
const earth = (x, y) => [line(x, y, x, y - 2.5), line(x - 2, y - 2.5, x + 2, y - 2.5), line(x - 1.3, y - 3.4, x + 1.3, y - 3.4), line(x - 0.6, y - 4.3, x + 0.6, y - 4.3)];
const erder = sym("PZ_ERDER", "Erder (Fundamenterder)", earth(0, 0), [{ x: 0, y: 0 }], [attr("TEXT", "Text", "Fundamenterder", 3.5, -4)]);
const pa = sym("PZ_PA", "Potentialausgleich", [circle(1.25, 0, 1.25), ...earth(1.25, -1.25)], H(2.5), [attr("TEXT", "Text", "", 4, -5)]);

export const PRINZIP_SYMBOLS = [ls, fi, fils, sich, ...[1, 2, 3, 4, 5].map(leiter), verbr, klemme, zaehler, rse, geraet, hak, erder, pa];

// Palette des Prinzipschemas, gruppiert. Gleiche Form wie FAMILIES in symbols.js (Varianten: Anzahl Striche).
export const PRINZIP_GROUPS = [
  ["Abgänge", [
    { id: "PZ_FILS", label: "FI/LS-Schalter", sub: "z. B. FI/LS B13A 30mA", def: "PZ_FILS", variants: ["PZ_FILS"] },
    { id: "PZ_LS", label: "Leitungsschutzschalter", sub: "z. B. LS C 13A, LN", def: "PZ_LS", variants: ["PZ_LS"] },
    { id: "PZ_FI", label: "FI-Schutzschalter", sub: "z. B. FI 40A 30mA", def: "PZ_FI", variants: ["PZ_FI"] },
    { id: "PZ_LEITER", label: "Leitungsangabe", sub: "Striche = Anzahl Leiter, Text z. B. 3x1,5mm²", def: "PZ_LEITER_1", variants: [1, 2, 3, 4, 5].map((n) => `PZ_LEITER_${n}`) },
    { id: "PZ_VERBR", label: "Verbraucher", sub: "Anschlussstelle mit Text", def: "PZ_VERBR", variants: ["PZ_VERBR"] },
  ]],
  ["Verteilung", [
    { id: "PZ_ZAEHLER", label: "Zähler (kWh)", sub: "mit Kopfband, z. B. 3x400/230", def: "PZ_ZAEHLER", variants: ["PZ_ZAEHLER"] },
    { id: "PZ_RSE", label: "Rundsteuerempfänger", sub: "RSE", def: "PZ_RSE", variants: ["PZ_RSE"] },
    { id: "PZ_SICH", label: "Sicherung", sub: "z. B. DII 25 A", def: "PZ_SICH", variants: ["PZ_SICH"] },
    { id: "PZ_KLEMME", label: "Klemme plombierbar", sub: "Abzweig, vier Anschlüsse", def: "PZ_KLEMME", variants: ["PZ_KLEMME"] },
    { id: "PZ_GERAET", label: "Gerät mit Text", sub: "z. B. Schütz S, Smart Meter", def: "PZ_GERAET", variants: ["PZ_GERAET"] },
    { id: "PZ_HAK", label: "Hausanschluss", sub: "Anschlussüberstromunterbrecher", def: "PZ_HAK", variants: ["PZ_HAK"] },
  ]],
  ["Erdung", [
    { id: "PZ_ERDER", label: "Erder", sub: "z. B. Fundamenterder", def: "PZ_ERDER", variants: ["PZ_ERDER"] },
    { id: "PZ_PA", label: "Potentialausgleich", sub: "Anschlusspunkt mit Erde", def: "PZ_PA", variants: ["PZ_PA"] },
  ]],
];
export const PRINZIP_FAMILIES = PRINZIP_GROUPS.flatMap(([, f]) => f);
export const PZ_ABGANG = ["PZ_LS", "PZ_FI", "PZ_FILS"]; // Geräte mit Knopf «Verdrahten»
// Polzahl mit Tasten (CJ 21.10.2026): 1, 2, 3 = L, 2L, 3L; N schaltet den Neutralleiter. Das Symbol bleibt gleich.
export function polNext(pol, key) {
  const m = /^\s*(\d)?\s*L?\s*(N)?/i.exec(pol || "LN");
  let k = Number(m[1] || 1), n = !!m[2];
  if (/^[123]$/.test(key)) k = Number(key); else n = !n;
  return `${k > 1 ? k : ""}L${n ? "N" : ""}`;
}
export const isPrinzipSym = (name) => String(name).startsWith("PZ_");
