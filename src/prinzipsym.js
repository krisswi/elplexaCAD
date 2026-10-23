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

// LS, FI, FI/LS nach der Symbolzusammenfassung S. 31 (CJ 23.10.2026): einpolig, um 90° gedreht (Einspeisung links), Auslöser oben.
// Schaltstück vom Schwenkpunkt (1,5|0) schräg nach (8,5|3,5), Gegenkontakt ohne Querstrich ab x 8. Auslöser senkrecht zum Schaltstück:
// u = Anteil entlang, v = Anteil quer (nach oben links), beides in Längen des Schaltstücks. Anschlüsse wie bisher (FI/LS bis 17,5).
// Beschriftung: BMK, Bezeichnung, Polzahl übereinander rechts über dem Schaltstück, damit der Auslöser frei bleibt.
const top3 = (def, pol = "LN") => [bmk(9, 10.5), attr("TEXT", "Bezeichnung", def, 9, 7.5), attr("POL", "Polzahl (Tasten 1–3 und N)", pol, 9, 4.5)];
const bp = (u, v) => [Math.round((1.5 + 7 * u - 3.5 * v) * 1000) / 1000, Math.round((3.5 * u + 7 * v) * 1000) / 1000];
const bl = (a, b) => line(...bp(...a), ...bp(...b));
const pole = (x2) => [line(0, 0, 1.5, 0), line(1.5, 0, 8.5, 3.5), line(8, 0, x2, 0)];
const bimetall = () => [[0.57, 0], [0.57, 0.3], [0.86, 0.3], [0.86, 0.55], [0.56, 0.55], [0.56, 0.85]].slice(1).map((p, i, a) => bl(i ? a[i - 1] : [0.57, 0], p));
// Pfeil vom Schaltstück weg, Spitze gefüllt; mit Fehlerstromauslöser dahinter Querstrich und Leitung
const pfeil = (u, rcd) => [bl([u, 0], [u, 0.81]), bl([u, 0.81], [u - 0.09, 0.59]), bl([u, 0.81], [u + 0.09, 0.59]), bl([u - 0.09, 0.59], [u + 0.09, 0.59]),
  bl([u - 0.045, 0.59], [u, 0.81]), bl([u + 0.045, 0.59], [u, 0.81]), ...(rcd ? [bl([u - 0.14, 0.94], [u + 0.14, 0.94]), bl([u, 0.94], [u, 1.2])] : [])];
const ls = sym("PZ_LS", "Leitungsschutzschalter (LS)", [...pole(10), ...bimetall(), ...pfeil(0.25, false)], H(10), top3("LS C 13A"));
const fi = sym("PZ_FI", "Fehlerstromschutzschalter (FI)", [...pole(10), ...pfeil(0.65, true)], H(10), top3("FI 40A 30mA"));
const fils = sym("PZ_FILS", "FI/LS-Schalter (RCBO)", [...pole(17.5), ...bimetall(), ...pfeil(0.25, true)], H(17.5), top3("FI/LS B13A 30mA"));
// Motorschutzschalter nach S. 31 rechts (CJ 23.10.2026): Bimetall weiter oben am Schaltstück, schräger Pfeil = einstellbar;
// thermisch und magnetisch zusätzlich der Pfeil wie beim LS. Polzahl nicht als Zahl am Symbol, sondern in der Zeile POL.
const bimetallMss = () => [[0.69, 0], [0.69, 0.33], [0.98, 0.33], [0.98, 0.6], [0.68, 0.6], [0.68, 0.93]].slice(1).map((p, i, a) => bl(i ? a[i - 1] : [0.69, 0], p));
const einstell = (() => { // schräg durch das Bimetall, kleine Spitze erst hinter dem Bimetall (CJ 23.10.: verdeckt es nicht)
  const [a, e] = [[0.53, 0.865], [1.12, 0.08]], du = e[0] - a[0], dv = e[1] - a[1], k = 0.1 / Math.hypot(du, dv), h = [e[0] - du * k, e[1] - dv * k], w = 0.3; // durch die Mitte des Bimetalls
  const l = [h[0] - dv * k * w, h[1] + du * k * w], r = [h[0] + dv * k * w, h[1] - du * k * w];
  return [bl(a, h), bl(e, l), bl(e, r), bl(l, r)];
})();
const mss = sym("PZ_MSS", "Motorschutzschalter, thermisch", [...pole(10), ...bimetallMss(), ...einstell], H(10), top3("MSS 4–6,3 A", "3L").map((t) => ({ ...t, x: 10.5 })));
const mssM = sym("PZ_MSS_M", "Motorschutzschalter, thermisch und magnetisch", [...pole(10), ...bimetallMss(), ...einstell, ...pfeil(0.3, false)], H(10), top3("MSS 4–6,3 A", "3L").map((t) => ({ ...t, x: 10.5 }))); // Beschriftung weiter rechts, Pfeilspitze frei

// Schaltgeräte der Verteilung nach S. 28 und 31 (CJ 23.10.2026): senkrecht wie die Sicherung, Schwenkpunkt unten (0|-8), Schaltstück
// schräg nach (-3,5|-3,5) (grössere Lücke, CJ 23.10.), Gegenkontakt von oben bis -4 mit dem Zeichen der Funktion. Beschriftung rechts: BMK, Bezeichnung, Polzahl.
const V_PINS = [{ x: 0, y: 0 }, { x: 0, y: -12.5 }];
const vAttrs = (def) => [bmk(3, -4), attr("TEXT", "Bezeichnung", def, 3, -7), attr("POL", "Polzahl (Tasten 1–3 und N)", "3L", 3, -10)];
const vPole = [line(0, -12.5, 0, -8), line(0, -8, -3.5, -3.5), line(0, 0, 0, -4)];
// Gegenkontakt (CJ 23.10.2026): Querstrich = Trenner, Querstrich mit Kreis = Lasttrenner, nur Kreuz = Leistungsschalter
const strich = [line(-0.8, -4, 0.8, -4)], kreis = [...strich, circle(0, -4.55, 0.55)], kreuz = [line(-0.55, -3.45, 0.55, -4.55), line(0.55, -3.45, -0.55, -4.55)];
const vb = (t, w) => [-3.5 * t + 0.789 * w, -8 + 4.5 * t + 0.614 * w].map((n) => Math.round(n * 1000) / 1000); // Punkt am Schaltstück, w quer
const sichImSchaltstueck = [line(...vb(0.4, -0.6), ...vb(1, -0.6)), line(...vb(1, -0.6), ...vb(1, 0.6)), line(...vb(1, 0.6), ...vb(0.4, 0.6)), line(...vb(0.4, 0.6), ...vb(0.4, -0.6))];
const ltr = sym("PZ_LTR", "Lasttrenner", [...vPole, ...kreis], V_PINS, vAttrs("63 A"));
const lts = sym("PZ_LTS", "Lasttrennsicherung", [...vPole, ...sichImSchaltstueck, ...kreis], V_PINS, vAttrs("NH00 63 A"));
const trs = sym("PZ_TRS", "Trennsicherung", [...vPole, ...sichImSchaltstueck, ...strich], V_PINS, vAttrs("D02 35 A"));
const trenn = sym("PZ_TRENN", "Trenner", [...vPole, ...strich], V_PINS, vAttrs("63 A"));
const lsch = sym("PZ_LSCH", "Leistungsschalter", [...vPole, ...kreuz], V_PINS, vAttrs("250 A"));
// Sicherung mit getrenntem Meldekontakt (S. 31 links): Sicherung wie PZ_SICH, gestrichelte Wirklinie zum Schliesser rechts
const sichM = sym("PZ_SICH_M", "Sicherung mit Meldekontakt", [line(0, 0, 0, -12.5), ...rect(-1.5, -2.5, 1.5, -10), ...[1.8, 3.2, 4.6].map((x) => line(x, -6.25, x + 0.8, -6.25)), // Wirklinie gestrichelt
  line(7.5, -12.5, 7.5, -8.5), line(7.5, -8.5, 4, -4), line(7.5, 0, 7.5, -4.5)], [...V_PINS, { x: 7.5, y: 0 }, { x: 7.5, y: -12.5 }], [bmk(10, -4), attr("TEXT", "Bezeichnung", "DII 25 A", 10, -7)]);

// Sicherung (z. B. DII): senkrecht, Rechteck mit durchgehendem Leiter
// Polzahl als waagrechte Striche im Rechteck wie in der Symbolzusammenfassung (CJ 23.10.2026): 1–3 Striche = Aussenleiter, N = Strich mit Punkt.
// Eine Variante je Polzahl, Tasten 1–3 und N wechseln sie (sichName). PZ_SICH ohne Striche bleibt für alte Pläne.
// Beschriftung rechts daneben: BMK, Bezeichnung, Polzahl untereinander.
const SICH_PINS = [{ x: 0, y: 0 }, { x: 0, y: -12.5 }];
const sichAttrs = (pol) => [bmk(3, -4), attr("TEXT", "Bezeichnung", "DII 25 A", 3, -7), attr("POL", "Polzahl (Tasten 1–3 und N)", pol, 3, -10)];
const sich = { ...sym("PZ_SICH", "Sicherung (Schmelzsicherung)", [line(0, 0, 0, -12.5), ...rect(-1.5, -2.5, 1.5, -10)], SICH_PINS, sichAttrs("")), family: "PZ_SICH" };
const SICH_POL = ["L", "LN", "2L", "2LN", "3L", "3LN"];
export const sichName = (pol) => `PZ_SICH_${pol.replace("L", "") || "1"}`.replace(/_N$/, "_1N");
function sichPol(pol) {
  // feste Plätze 1 mm auseinander (CJ 23.10.2026): L1, L2, L3 von oben, N immer zuunterst, auch wenn L2/L3 fehlen
  const k = Number(pol[0]) || 1, n = pol.endsWith("N"), y = [-4.75, -5.75, -6.75], yN = -7.75;
  const st = y.slice(0, k).map((v) => line(-1.5, v, 1.5, v));
  if (n) st.push(line(-1.5, yN, 1.5, yN), { t: "c", cx: 0, cy: yN, r: 0.4, f: true });
  return { ...sym(sichName(pol), `Sicherung ${pol}`, [line(0, 0, 0, -12.5), ...rect(-1.5, -2.5, 1.5, -10), ...st], SICH_PINS, sichAttrs(pol)), family: "PZ_SICH" };
}

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
// Stromwandler für die Wandlermessung nach der Symbolzusammenfassung S. 15 (CJ 23.10.2026): Leiter senkrecht durch den Kreis,
// Messleitung rechts ohne Leiterstriche. Anschlüsse oben, unten und am Ende der Messleitung.
const wandler = sym("PZ_WANDLER", "Stromwandler", [line(0, 0, 0, -15), circle(0, -7.5, 2.5), line(2.5, -7.5, 10, -7.5)], [{ x: 0, y: 0 }, { x: 0, y: -15 }, { x: 10, y: -7.5 }],
  [bmk(3.5, -3.5), attr("TEXT", "Bezeichnung", "150/5A", 3.5, -6.5)]);
const geraet = sym("PZ_GERAET", "Gerät mit Text", rect(-5, -10, 5, 0), [{ x: 0, y: 0 }, { x: 0, y: -10 }, { x: -5, y: -5 }, { x: 5, y: -5 }], [attr("TEXT", "Text im Kasten", "S", -3.5, -6), bmk(7, -3)]);
// Wechselrichter und Gleichrichter (CJ 22.10.2026): Kasten 10 × 10 mm mit Diagonale von unten links nach oben rechts,
// Gleichstrom = Strich über gestricheltem Strich, Wechselstrom = Sinus aus kurzen Linien. Wechselrichter: = oben links, ~ unten rechts; Gleichrichter umgekehrt.
const dcSign = (cx, cy) => [line(cx - 1.75, cy + 0.5, cx + 1.75, cy + 0.5), line(cx - 1.75, cy - 0.5, cx - 0.35, cy - 0.5), line(cx + 0.35, cy - 0.5, cx + 1.75, cy - 0.5)];
const acSign = (cx, cy) => Array.from({ length: 12 }, (_, i) => {
  const x = (k) => cx - 1.75 + (3.5 * k) / 12, y = (k) => cy + 0.8 * Math.sin((2 * Math.PI * k) / 12);
  return line(x(i), y(i), x(i + 1), y(i + 1));
});
const umformer = (name, label, tl, br, def) => sym(name, label, [...rect(-5, -10, 5, 0), line(-5, -10, 5, 0), ...tl(-2.5, -2.5), ...br(2.5, -7.5)],
  [{ x: 0, y: 0 }, { x: 0, y: -10 }, { x: -5, y: -5 }, { x: 5, y: -5 }], [attr("TEXT", "Text", def, 7, -6.5), bmk(7, -3)]);
const wr = umformer("PZ_WR", "Wechselrichter", dcSign, acSign, "Wechselrichter");
const gr = umformer("PZ_GR", "Gleichrichter", acSign, dcSign, "Gleichrichter");
// Hausanschluss (Anschlussüberstromunterbrecher): Kasten mit Spitze nach unten zum Kabel
const hak = sym("PZ_HAK", "Hausanschluss", [line(-5, 0, 5, 0), line(5, 0, 5, -12.5), line(5, -12.5, 0, -17.5), line(0, -17.5, -5, -12.5), line(-5, -12.5, -5, 0)],
  [{ x: 0, y: 0 }, { x: 0, y: -17.5 }, { x: 5, y: -5 }], [attr("TEXT", "Nennstrom", "80 A", -3.5, -7), bmk(7, -14)]);

// Erdung: Erder mit drei kürzer werdenden Strichen; Potentialausgleich = Anschlusspunkt (Kreis) mit Erde darunter
const earth = (x, y) => [line(x, y, x, y - 2.5), line(x - 2, y - 2.5, x + 2, y - 2.5), line(x - 1.3, y - 3.4, x + 1.3, y - 3.4), line(x - 0.6, y - 4.3, x + 0.6, y - 4.3)];
const erder = sym("PZ_ERDER", "Erder (Fundamenterder)", earth(0, 0), [{ x: 0, y: 0 }], [attr("TEXT", "Text", "Fundamenterder", 3.5, -4)]);
const pa = sym("PZ_PA", "Potentialausgleich", [circle(1.25, 0, 1.25), ...earth(1.25, -1.25)], H(2.5), [attr("TEXT", "Text", "", 4, -5)]);
// Weitere Erdungszeichen nach der Symbolzusammenfassung 5.120 (CJ 22.10.2026, selbst gezeichnet): Anschluss oben, Text rechts
const tx = (def = "") => [attr("TEXT", "Text", def, 3.5, -4)];
const paD = sym("PZ_PA_D", "Potenzialausgleich (Dreieck)", [line(0, 0, 0, -2.5), line(-2, -2.5, 2, -2.5), line(2, -2.5, 0, -5.5), line(0, -5.5, -2, -2.5)], [{ x: 0, y: 0 }], tx());
const erdAns = sym("PZ_ERDE_ANS", "Erdungs-Anschluss", [circle(0, -0.5, 0.5), ...earth(0, -0.5)], [{ x: 0, y: 0 }], tx());
erdAns.prims[0].f = true; // gefüllter Punkt
const erdKk = sym("PZ_ERDE_KK", "Erdungs-Klemmkasten", [...rect(-4, -3.5, 4, 0), line(0, 0, 0, -1), line(-1.75, -1, 1.75, -1), line(-1.25, -1.75, 1.25, -1.75), line(-0.5, -2.5, 0.5, -2.5)], [{ x: 0, y: 0 }], [attr("TEXT", "Text", "", 5, -4)]);
const schutzerde = sym("PZ_SCHUTZERDE", "Schutzerde", [circle(0, -4, 3.5), line(0, 0, 0, -4.5), line(-1.75, -4.5, 1.75, -4.5), line(-1.25, -5.25, 1.25, -5.25), line(-0.5, -6, 0.5, -6)], [{ x: 0, y: 0 }], [attr("TEXT", "Text", "", 5, -4)]);
const erdband = sym("PZ_ERDBAND", "Erdband", [{ ...line(0, 0, 10, 0), d: true }], H(10), [attr("TEXT", "Text", "Fe 30/3", 1.5, 1)]);

export const PRINZIP_SYMBOLS = [ls, fi, fils, mss, mssM, ltr, lts, trs, trenn, lsch, sichM, sich, ...SICH_POL.map(sichPol), ...[1, 2, 3, 4, 5].map(leiter), verbr, klemme, zaehler, rse, wandler, geraet, wr, gr, hak, erder, pa, paD, erdAns, erdKk, schutzerde, erdband];

// Palette des Prinzipschemas, gruppiert. Gleiche Form wie FAMILIES in symbols.js (Varianten: Anzahl Striche).
export const PRINZIP_GROUPS = [
  ["Abgänge", [
    { id: "PZ_FILS", label: "FI/LS-Schalter", sub: "z. B. FI/LS B13A 30mA", def: "PZ_FILS", variants: ["PZ_FILS"] },
    { id: "PZ_LS", label: "Leitungsschutzschalter", sub: "z. B. LS C 13A, LN", def: "PZ_LS", variants: ["PZ_LS"] },
    { id: "PZ_FI", label: "FI-Schutzschalter", sub: "z. B. FI 40A 30mA", def: "PZ_FI", variants: ["PZ_FI"] },
    { id: "PZ_MSS", label: "Motorschutzschalter thermisch", sub: "z. B. MSS 4–6,3 A, 3L", def: "PZ_MSS", variants: ["PZ_MSS"] },
    { id: "PZ_MSS_M", label: "Motorschutzschalter therm./magn.", sub: "z. B. MSS 4–6,3 A, 3L", def: "PZ_MSS_M", variants: ["PZ_MSS_M"] },
    { id: "PZ_LEITER", label: "Leitungsangabe", sub: "Striche = Anzahl Leiter, Text z. B. 3x1,5mm²", def: "PZ_LEITER_1", variants: [1, 2, 3, 4, 5].map((n) => `PZ_LEITER_${n}`) },
    { id: "PZ_VERBR", label: "Verbraucher", sub: "Anschlussstelle mit Text", def: "PZ_VERBR", variants: ["PZ_VERBR"] },
  ]],
  ["Verteilung", [
    { id: "PZ_ZAEHLER", label: "Zähler (kWh)", sub: "mit Kopfband, z. B. 3x400/230", def: "PZ_ZAEHLER", variants: ["PZ_ZAEHLER"] },
    { id: "PZ_WANDLER", label: "Stromwandler", sub: "Wandlermessung, z. B. 150/5A", def: "PZ_WANDLER", variants: ["PZ_WANDLER"] },
    { id: "PZ_RSE", label: "Rundsteuerempfänger", sub: "RSE", def: "PZ_RSE", variants: ["PZ_RSE"] },
    { id: "PZ_SICH", label: "Sicherung", sub: "z. B. DII 25 A, Tasten 1–3 und N", def: "PZ_SICH_3", variants: ["PZ_SICH", ...SICH_POL.map(sichName)], keys: true }, // ein Feld, Polzahl über Tasten
    { id: "PZ_SICH_M", label: "Sicherung mit Meldekontakt", sub: "gestrichelt zum Kontakt", def: "PZ_SICH_M", variants: ["PZ_SICH_M"] },
    { id: "PZ_LTR", label: "Lasttrenner", sub: "z. B. 63 A, 3L", def: "PZ_LTR", variants: ["PZ_LTR"] },
    { id: "PZ_LTS", label: "Lasttrennsicherung", sub: "z. B. NH00 63 A", def: "PZ_LTS", variants: ["PZ_LTS"] },
    { id: "PZ_TRS", label: "Trennsicherung", sub: "z. B. D02 35 A", def: "PZ_TRS", variants: ["PZ_TRS"] },
    { id: "PZ_TRENN", label: "Trenner", sub: "Trennschalter, z. B. 63 A", def: "PZ_TRENN", variants: ["PZ_TRENN"] },
    { id: "PZ_LSCH", label: "Leistungsschalter", sub: "z. B. 250 A", def: "PZ_LSCH", variants: ["PZ_LSCH"] },
    { id: "PZ_KLEMME", label: "Klemme plombierbar", sub: "Abzweig, vier Anschlüsse", def: "PZ_KLEMME", variants: ["PZ_KLEMME"] },
    { id: "PZ_GERAET", label: "Gerät mit Text", sub: "z. B. Schütz S, Smart Meter", def: "PZ_GERAET", variants: ["PZ_GERAET"] },
    { id: "PZ_WR", label: "Wechselrichter", sub: "Gleichstrom zu Wechselstrom, z. B. PV", def: "PZ_WR", variants: ["PZ_WR"] },
    { id: "PZ_GR", label: "Gleichrichter", sub: "Wechselstrom zu Gleichstrom", def: "PZ_GR", variants: ["PZ_GR"] },
    { id: "PZ_HAK", label: "Hausanschluss", sub: "Anschlussüberstromunterbrecher", def: "PZ_HAK", variants: ["PZ_HAK"] },
  ]],
  ["Erdung", [
    { id: "PZ_ERDER", label: "Erder", sub: "z. B. Fundamenterder", def: "PZ_ERDER", variants: ["PZ_ERDER"] },
    { id: "PZ_PA", label: "Potentialausgleich", sub: "Anschlusspunkt mit Erde", def: "PZ_PA", variants: ["PZ_PA"] },
    { id: "PZ_PA_D", label: "Potenzialausgleich", sub: "Dreieck (IEC)", def: "PZ_PA_D", variants: ["PZ_PA_D"] },
    { id: "PZ_ERDE_ANS", label: "Erdungs-Anschluss", sub: "Punkt mit Erde", def: "PZ_ERDE_ANS", variants: ["PZ_ERDE_ANS"] },
    { id: "PZ_ERDE_KK", label: "Erdungs-Klemmkasten", sub: "Kasten mit Erde", def: "PZ_ERDE_KK", variants: ["PZ_ERDE_KK"] },
    { id: "PZ_SCHUTZERDE", label: "Schutzerde", sub: "Kreis mit Erde", def: "PZ_SCHUTZERDE", variants: ["PZ_SCHUTZERDE"] },
    { id: "PZ_ERDBAND", label: "Erdband", sub: "z. B. Fe 30/3, gestrichelt", def: "PZ_ERDBAND", variants: ["PZ_ERDBAND"] },
  ]],
];
export const PRINZIP_FAMILIES = PRINZIP_GROUPS.flatMap(([, f]) => f);
export const PZ_ABGANG = ["PZ_LS", "PZ_FI", "PZ_FILS", "PZ_MSS", "PZ_MSS_M"]; // Geräte mit Knopf «Verdrahten»
export const PZ_POL = [...PZ_ABGANG, "PZ_LTR", "PZ_LTS", "PZ_TRS", "PZ_TRENN", "PZ_LSCH"]; // Zeile Polzahl, Tasten 1–3 und N
// Polzahl mit Tasten (CJ 21.10.2026): 1, 2, 3 = L, 2L, 3L; N schaltet den Neutralleiter. Das Symbol bleibt gleich.
export function polNext(pol, key) {
  const m = /^\s*(\d)?\s*L?\s*(N)?/i.exec(pol || "LN");
  let k = Number(m[1] || 1), n = !!m[2];
  if (/^[123]$/.test(key)) k = Number(key); else n = !n;
  return `${k > 1 ? k : ""}L${n ? "N" : ""}`;
}
export const isPrinzipSym = (name) => String(name).startsWith("PZ_");
