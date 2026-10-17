// Schrank mit Feldern und weitere Bauteile der Disposition (Frontansicht, massstäblich, mm, y nach oben).
// Alles wird in Bausteine zerlegt wie in dispo.js (rect, line, text, circle, slot), daraus entstehen SVG, PDF und DXF.
// Masse: Quelle steht beim Wert. „Annahme“ = aus dem Dossier Bärgen 268 abgeschätzt oder gesetzt, nicht belegt.
const r3 = (n) => Math.round(n * 1000) / 1000;
export const LAYER_S = "SCH_DISPO_SCHRANK";
const LG = "SCH_DISPO_GERAET", LT = "SCH_TEXT", LN = "SCH_DISPO_N", LPE = "SCH_DISPO_PE", LYE = "SCH_DISPO_GELB";

// ---------- Schrank ----------
// Rittal VX25: Breiten 400, 600, 800, 1200, Höhen 2000, 2200, Tiefen 500, 600, 800, Sockel 200 in Rittal-Datenblättern gesehen (16.10.2026).
// Breite 1000, Höhe 1800, Tiefe 400 nicht belegt (offen). SAA: keine Katalogmasse gefunden (offen), Masse frei.
export const CAB_MAKERS = {
  rittal: { name: "Rittal VX25", widths: [400, 600, 800, 1000, 1200], heights: [1800, 2000, 2200], depths: [400, 500, 600, 800] },
  saa: { name: "SAA", widths: [], heights: [], depths: [] },
  frei: { name: "Schrank frei", widths: [], heights: [], depths: [] },
};
export const PLINTHS = [0, 100, 200];
export const DOORS = { l: "Anschlag links", r: "Anschlag rechts", d: "Doppeltür" };
export const CAB_SIDE = 25; // Seitenwand: aus dem Dossier (aussen 1150, Feld 1100) und dem Beispiel 4 Felder (je 25 mm)
export const CAB_TEXT = 25; // Texthöhe IP-Angabe und Feldtitel (Annahme)

// Beispiel UV Bärgen: aussen 1150, Feld 1100, Höhe 2000, Sockel 100, Tiefe 400
export const newCabinet = (x, y, maker = "rittal") => ({ type: "cabinet", x, y, maker, h: 2000, depth: 400, plinth: 100, side: CAB_SIDE, ip: "IP4", name: "", fields: [{ w: 1100, door: "r", t: "" }] });
export const cabW = (c) => r3(c.fields.reduce((s, f) => s + f.w, 0) + 2 * c.side);
export const cabBox = (c) => ({ x0: c.x, y0: c.y - c.plinth, x1: r3(c.x + cabW(c)), y1: c.y + c.h });
// Feldgrenzen: linke Innenkante, Feldtrennungen, rechte Innenkante
export function fieldXs(c) {
  const xs = [r3(c.x + c.side)];
  for (const f of c.fields) xs.push(r3(xs.at(-1) + f.w));
  return xs;
}

export function cabPrims(c, dimH, doors = true) {
  const out = [], W = cabW(c), xs = fieldXs(c), L = LAYER_S;
  const line = (x1, y1, x2, y2, o = {}) => out.push({ k: "line", x1: r3(x1), y1: r3(y1), x2: r3(x2), y2: r3(y2), layer: L, ...o });
  const rect = (x, y, w, h, o = {}) => out.push({ k: "rect", x: r3(x), y: r3(y), w: r3(w), h: r3(h), layer: L, ...o });
  rect(c.x, c.y, W, c.h);
  for (const x of xs) line(x, c.y, x, c.y + c.h); // Seitenwände innen und Feldtrennungen
  if (c.plinth > 0) rect(c.x + c.side, c.y - c.plinth, W - 2 * c.side, c.plinth, { fill: "none" });
  if (c.ip) out.push({ k: "text", x: c.x + c.side, y: c.y + c.h + CAB_TEXT, h: CAB_TEXT, s: c.ip, layer: LT, anchor: "lm" });
  if (c.name) out.push({ k: "text", x: c.x + W / 2, y: c.y + c.h + CAB_TEXT, h: CAB_TEXT, s: c.name, layer: LT, anchor: "c" });
  // Tiefe als Schrägstrich unten rechts mit Mass (wie im Dossier)
  const d = 50;
  line(c.x + W, c.y, c.x + W + d, c.y + d);
  line(c.x + W + d, c.y + d, c.x + W + d, c.y + 2 * d);
  out.push({ k: "text", x: c.x + W + d + 0.5 * dimH, y: c.y + d + 0.8 * dimH, h: dimH, s: String(c.depth), layer: "SCH_DISPO_MASS", anchor: "lm" });
  // Türen: Bänder (zwei Rechtecke an der Anschlagseite), Griff an der Schliessseite, Doppeltür mit Griff in der Mitte
  const hinge = (x) => { for (const f of [0.15, 0.85]) rect(x - 6, c.y + f * c.h - 40, 12, 80, { fill: "ink" }); };
  const grip = (x) => rect(x - 4, c.y + c.h / 2 - 40, 8, 80);
  c.fields.forEach((f, i) => {
    const x0 = xs[i], x1 = xs[i + 1];
    if (f.t) out.push({ k: "text", x: (x0 + x1) / 2, y: c.y + c.h - 1.5 * CAB_TEXT, h: CAB_TEXT, s: f.t, layer: LT, anchor: "c" });
    if (!doors) return;
    if (f.door === "l" || f.door === "d") hinge(x0);
    if (f.door === "r" || f.door === "d") hinge(x1);
    if (f.door === "l") grip(x1 - 30); else if (f.door === "r") grip(x0 + 30); else { grip((x0 + x1) / 2 - 15); grip((x0 + x1) / 2 + 15); line((x0 + x1) / 2, c.y, (x0 + x1) / 2, c.y + c.h, { dash: "dash" }); }
  });
  return out;
}

// ---------- Teile (Bauteile mit freier Lage, Bezug linke untere Ecke) ----------
// NH-Trenner senkrecht: Grösse 000 laut Rittal SV 3431.020 (Datenblatt: 53 × 213 mm), 00 laut Händlerangabe ABB XLP00 (105 × 187 mm),
// 1 und 2: Annahme (1 aus dem Dossier abgemessen, 2 geschätzt).
export const NH_SIZES = { "000": { w: 53, h: 213, amp: "63" }, "00": { w: 105, h: 187, amp: "160" }, 1: { w: 185, h: 265, amp: "250" }, 2: { w: 230, h: 300, amp: "400" } };
// Hersteller (CJ 16.10.2026, Projekt Bärgen 268). Nur Masse aus den Massblättern und DXF von Weber (CJ, Downloads) übernommen, Umriss selbst gezeichnet.
// Silas: Aufbaumontage, Frontansicht, Höhe mit Befestigungslaschen, pitch = Polteilung, d = Tiefe. Quelle MB_<Gr>_A.pdf, Höhe 00 aus m_3407x_Gr00_Aufbau_SU_3.dxf.
// Breite gilt laut DXF auch für 1- und 4-polig. Vertigroup: senkrechte Leiste, Masse aus der Frontansicht der DXF (Massstab 1:5) abgegriffen, auf 1 mm gerundet.
const SILAS = {
  "000": { w: 53, h: 216, d: 94, amp: "63", label: "000" },
  "00": { w: 106, h: 206, d: 80, pitch: 33, amp: "160", label: "Gr.00" },
  1: { w: 184, h: 308, d: 110, pitch: 57, amp: "250", label: "Gr.1" },
  2: { w: 210, h: 308, d: 130, pitch: 65, amp: "400", label: "Gr.2" },
  3: { w: 250, h: 308, d: 130, pitch: 80, amp: "630", label: "Gr.3" },
};
// NH1, NH2, NH3 (CJ 16.10.): je 100 mm breit, Höhe und Tiefe aus LVSG2CP/LVSG2CE (Gr. 1–3). Alte Dateien mit „13-3“/„13-1“ öffnen als NH1 (OLD_VG).
const VG_1_3 = Object.fromEntries([1, 2, 3].flatMap((n) => [3, 1].map((pol) => [`${n}-${pol}`, { w: 100, h: 671, d: 190, amp: "", label: "NH" + n, name: `NH${n}, ${pol}-polig (Masse ${pol === 3 ? "LVSG2CP" : "LVSG2CE"})` }])));
const VERTIGROUP = {
  ...VG_1_3,
  // Nachtrag CJ 16.10.: Hager-Katalog LVS00100RP (Schaltleiste NH00, 3-polig, 160 A, Schienenabstand 100): Höhe 401, Tiefe 123. Breite 50 von CJ bestätigt (16.10., Weber-Katalog S. 35).
  "00-3": { w: 50, h: 401, d: 123, amp: "160", label: "NH00", name: "NH00, 3-polig 160 A (LVS00100RP)" },
  1000: { w: 100, h: 745, d: 226, amp: "1000", label: "1000A", name: "1000 A (LVTR1000CE/CP)" },
  "1000TE": { w: 100, h: 665, d: 132, amp: "1000", label: "1000A", name: "1000 A (LVTR1000TE)" },
  2000: { w: 200, h: 746, d: 207, amp: "2000", label: "2000A", name: "2000 A (LVTR2000CE kurz)" },
  "2000TE": { w: 200, h: 665, d: 132, amp: "2000", label: "2000A", name: "2000 A (LVTR2000TE)" },
};
export const OLD_VG = { "13-3": "1-3", "13-1": "1-1" };
// Vertigroup mit Wandler (CJ 16.10.2026): Masse aus Hager-Katalogseiten und Weber-Katalog cat_vertigroup_DE.pdf S. 35, Höhe 741 laut Hager (Weber 745)
const VG_WANDLER = {
  "00W": { w: 50, h: 741, d: 177, amp: "160", label: "NH00", name: "NH00, 3P 160 A, Schienenabstand 185 (LVSGW00TRPX)" },
  "1W": { w: 100, h: 671, d: 190, amp: "250", label: "NH1", name: "NH1, 3P 250 A, M12 (LVSG1CPX)" },
};
// Lage der Wandler: Phasen von oben (L1) nach unten (L3)
export const WANDLER_LAGE = { L1: { name: "L1", ph: [0] }, L2: { name: "L2", ph: [1] }, L123: { name: "L1–L3", ph: [0, 1, 2] } };
// order: Reihenfolge in der Auswahl (Zahlen-Schlüssel stünden in JS sonst vorne), erste = Vorgabe
export const NH_MAKERS = {
  std: { name: "frei / Standard", sizes: NH_SIZES, order: ["000", "00", "1", "2"] },
  silas: { name: "Weber Silas", sizes: SILAS, order: ["000", "00", "1", "2", "3"], def: "1" },
  vertigroup: { name: "Weber Vertigroup (Leiste)", sizes: VERTIGROUP, order: [...Object.keys(VG_1_3), "00-3", "1000", "1000TE", "2000", "2000TE"] },
  vgw: { name: "Vertigroup mit Wandler", sizes: VG_WANDLER, order: ["00W", "1W"] },
};
export const nhDefault = (maker) => { const t = NH_MAKERS[maker] || NH_MAKERS.std; return t.def || (maker && maker !== "std" ? t.order[0] : "00"); };
export const nhMaker = (p) => NH_MAKERS[p.maker] || NH_MAKERS.std;
export const nhSize = (p) => nhMaker(p).sizes[p.size] || NH_SIZES["00"];
export const nhSizeName = (maker, z) => { const e = (NH_MAKERS[maker] || NH_MAKERS.std).sizes[z]; return maker === "silas" ? "Gr. " + z : maker === "vertigroup" || maker === "vgw" ? e.name : sizeLabel(z); };
// Neutralleitertrenner NT: klein mit Grösse (Annahme aus dem Dossier 30 × 36), mit Text nach Strom als grosser Kasten (Annahme 100 × 110)
export const NT_SIZES = { "000": { w: 30, h: 36 }, "00": { w: 30, h: 36 }, 1: { w: 36, h: 44 }, 2: { w: 40, h: 50 } };
export const NT_TEXT = { w: 100, h: 110 };
export const SSW_PITCH = 100; // Sammelschiene: Phasenabstand (Annahme aus dem Dossier)
export const sswW = (n) => (n - 1) * SSW_PITCH + 30 + 96;

// free: Grösse frei (Griffe), sonst aus Grösse oder Anzahl gerechnet
export const PART_KINDS = {
  CALIP: { name: "Calip-Schiene", free: true },
  ABDECK: { name: "Abdeckstreifen", free: true },
  EINF: { name: "Kabeleinführung", free: true },
  TW: { name: "Trennwand TW", free: true },
  PTP: { name: "Plattentrennprofil", free: true },
  NHABD: { name: "NH-Abdeckung", free: true },
  KASTEN: { name: "Kasten mit Text", free: true },
  NH: { name: "NH-Trenner senkrecht" },
  NT: { name: "Neutralleitertrenner NT" },
  SSW: { name: "Sammelschiene mit Stromwandlern" },
  WKL: { name: "Wandlerklemme", free: true },
  PEN: { name: "PEN-Schiene (alt)", free: true }, // seit 16.10.2026 als BAR (Leiter PEN) gezeichnet, alte Dateien werden beim Öffnen umgerechnet
  BAR: { name: "Schiene N/PE/PEN", free: true },
  // Zählerplatte bestücken (CJ 16.10., Beispiel Schrankansicht 4 Felder, Felder „Messungen“): frei auf der Platte
  ZBOX: { name: "Zähler (Kasten)", free: true },
  ZKL: { name: "Klemmenreihe Zählerplatte", free: true },
  PKZ: { name: "Prüfklemme Messung", free: true },
  SPF: { name: "Sicherungen Spannungspfad", free: true },
};
// Betriebsmittel mit BMK und freier Beschriftung (CJ 16.10.2026: jedes Betriebsmittel). Texte aussen gestapelt (stackTexts):
// unter dem Kasten bei Zähler, Kasten und Klemmenreihe (wie bisher die BMK), sonst darüber.
export const BMK_KINDS = new Set(["ZBOX", "KASTEN", "PKZ", "SPF", "ZKL", "NH", "NT", "SSW", "WKL", "BAR"]);
const BMK_BELOW = new Set(["ZBOX", "KASTEN", "ZKL"]);
// Leiter der Schienen (CJ 16.10.2026): Farben wie im Schema, N blau, PE grün-gelb, PEN grün-gelb mit blauer Markierung an den Enden
export const BAR_KINDS = { N: "N-Schiene", PE: "PE-Schiene", PEN: "PEN-Schiene" };
export const BAR_T = 20; // Dicke der Schiene in mm (Annahme)
// Schiene aus zwei Punkten: waagrecht oder senkrecht nach dem grösseren Abstand, Punkt 1 = Anfang auf der Mittellinie
export function barFrom(c, p1, p2, t = BAR_T) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y, H = Math.abs(dx) >= Math.abs(dy), L = Math.max(t, Math.abs(H ? dx : dy));
  return H ? { type: "part", kind: "BAR", c, x: r3(dx < 0 ? p1.x - L : p1.x), y: r3(p1.y - t / 2), w: r3(L), h: t }
    : { type: "part", kind: "BAR", c, x: r3(p1.x - t / 2), y: r3(dy < 0 ? p1.y - L : p1.y), w: t, h: r3(L) };
}
// ---------- Texte (CJ 16.10.2026) ----------
// Eine Grundgrösse je Bauteil: 100 % = OUT_H für Texte aussen. Texte innen tragen fit (Platz in Schreibrichtung):
// sie werden kleiner statt breiter (scaleText in dispo.js). Texte aussen tragen st (schon skaliert) und werden vom Rand weg gestapelt.
export const OUT_H = 10;
export const CHAR_W = 0.6; // Zeichenbreite / Schrifthöhe (grob, eher gross geschätzt)
export const fitH = (h, s, room) => Math.min(h, room / Math.max(1, String(s).length) / CHAR_W);
// side 1 = über der Kante edge (y nach oben), -1 = darunter. Abstand je ½ Schrifthöhe zur Kante und zwischen den Zeilen.
// fit (optional): Texte höchstens so breit (bei Geräten auf der Schiene die Gerätebreite, damit Nachbarn nicht überlappen).
export function stackTexts(cx, edge, side, list, tf = 1, fit = 0) {
  const out = [], H = OUT_H * tf;
  let pos = edge;
  for (const s of list) {
    if (!s) continue;
    const h = r3(fit ? fitH(H, s, fit) : H);
    pos += side * 0.5 * h;
    out.push({ k: "text", x: r3(cx), y: r3(pos + side * 0.5 * h), h, s, layer: LT, anchor: "c", st: true });
    pos += side * h;
  }
  return out;
}
// Vorlagen der Palette: id, Teil, Text unter dem Namen, Startwerte
export const PART_PRESETS = [
  { id: "CALIP", kind: "CALIP", sub: "Kabelbefestigung, 20 mm hoch (Annahme)", p: { w: 1000, h: 20, s: "Calip" } },
  { id: "ABDECK", kind: "ABDECK", sub: "punktiert, Masse frei", p: { w: 600, h: 30 } },
  { id: "EINF", kind: "EINF", sub: "Langloch, Masse frei", p: { w: 150, h: 25, s: "" } },
  { id: "TW", kind: "TW", sub: "gestrichelt, waagrecht oder senkrecht", p: { w: 500, h: 10, s: "TW" } },
  { id: "PTP", kind: "PTP", sub: "senkrecht oder waagrecht", p: { w: 10, h: 400, s: "Plattentrennprofil" } },
  { id: "KASTEN", kind: "KASTEN", sub: "freier Text, mehrzeilig", p: { w: 100, h: 50, lines: ["Text"] } },
  { id: "RAB", kind: "KASTEN", name: "R-AB 5/10", sub: "Kasten, Text senkrecht (Bedeutung offen)", p: { w: 83, h: 200, lines: ["R-AB 5/10"], vert: true } },
  { id: "PKTXT", kind: "KASTEN", name: "Prüfklemme Lief.baus.", sub: "Kasten mit runden Ecken", p: { w: 220, h: 110, lines: ["Prüfklemme", "Lief.baus."], round: true } },
  { id: "NH000", kind: "NH", name: "NH-Trenner 000", sub: "53 × 213 mm (Rittal)", p: { size: "000", s: "63" } },
  { id: "NH00", kind: "NH", name: "NH-Trenner DIN 00", sub: "105 × 187 mm (ABB, Händler)", p: { size: "00", s: "160" } },
  { id: "NH1", kind: "NH", name: "NH-Trenner DIN 1", sub: "185 × 265 mm (Annahme)", p: { size: "1", s: "250" } },
  { id: "NH2", kind: "NH", name: "NH-Trenner DIN 2", sub: "230 × 300 mm (Annahme)", p: { size: "2", s: "400" } },
  { id: "NHSILAS", kind: "NH", name: "NH-Trenner Silas", sub: "Weber, Gr. 000 bis 3, Grösse rechts", p: { maker: "silas", size: "1", s: "250" } },
  { id: "NHVG", kind: "NH", name: "NH-Leiste Vertigroup", sub: "Weber, NH1 bis NH3 und weitere, Typ rechts", p: { maker: "vertigroup", size: "1-3", s: "" } },
  { id: "VGW00", kind: "NH", name: "Vertigroup NH00 mit Wandler", sub: "LVSGW00TRPX, 50 × 741 mm, 160 A", p: { maker: "vgw", size: "00W", s: "160", wr: "150/5", wl: "L123" } },
  { id: "VGW1", kind: "NH", name: "Vertigroup NH1 mit Wandler", sub: "LVSG1CPX, 100 × 671 mm, 250 A", p: { maker: "vgw", size: "1W", s: "250", wr: "150/5", wl: "L123" } },
  { id: "NHABD", kind: "NHABD", sub: "Streifen vor den NH, Text und Schrauben", p: { w: 360, h: 40, s: "Nicht durch Laien bedienbar" } },
  { id: "NT", kind: "NT", name: "NT nach Grösse", sub: "Kästchen „NT 00“", p: { size: "00", s: "" } },
  { id: "NTA", kind: "NT", name: "NT nach Strom", sub: "Kasten „NT 250 A“", p: { size: "00", s: "NT 250 A" } },
  { id: "SSW", kind: "SSW", sub: "3 Phasen, Querschnitt als Text", p: { n: 3, s: "120mm2", ct: true } },
  { id: "WKL", kind: "WKL", sub: "80 × 30 mm (Annahme)", p: { w: 80, h: 30 } },
  { id: "PEN", kind: "BAR", name: "PEN-Schiene", sub: "bisherige Grösse 25 × 215 mm (nicht in der Palette)", p: { c: "PEN", w: 25, h: 215 } },
  { id: "BAR_N", kind: "BAR", name: "N-Schiene", sub: "2 Klicks: Anfang, Ende", p: { c: "N", w: 200, h: BAR_T } },
  { id: "BAR_PE", kind: "BAR", name: "PE-Schiene", sub: "2 Klicks, grün-gelb", p: { c: "PE", w: 200, h: BAR_T } },
  { id: "BAR_PEN", kind: "BAR", name: "PEN-Schiene", sub: "2 Klicks, grün-gelb, Enden blau", p: { c: "PEN", w: 200, h: BAR_T } },
  // Zählerplatte: Masse aus dem Beispiel abgegriffen (Platte 250 × 400 ≈ 100 × 160 Bildpunkte), Annahme
  { id: "ZBOX", kind: "ZBOX", name: "Zähler", sub: "170 × 195 mm, mehrzeilig, BMK darunter", p: { w: 170, h: 195, lines: ["Zähler", "Gewerbe", "H5.EG.11", "EG"], bmk: "" } },
  { id: "RSE", kind: "KASTEN", name: "RSE", sub: "Rundsteuerempfänger, 90 × 140 mm", p: { w: 90, h: 140, lines: ["RsE"], bmk: "" } },
  { id: "ZFE", kind: "KASTEN", name: "ZFE", sub: "Kasten 90 × 140 mm", p: { w: 90, h: 140, lines: ["ZFE"], bmk: "" } },
  { id: "ZKL", kind: "ZKL", sub: "unten auf der Platte, 230 mm, 7 Klemmen", p: { w: 230, h: 25, n: 7 } },
  { id: "PKZ", kind: "PKZ", sub: "Messung: Prüfklemme 210 × 75 mm", p: { w: 210, h: 75, bmk: "" } },
  { id: "SPF", kind: "SPF", sub: "Messung: 3 Sicherungen, 140 × 90 mm", p: { w: 140, h: 90, n: 3, bmk: "" } },
];
// Mehrzeiliger Text von Kasten und Zähler (seit 16.10.2026 je Zeile ein Feld). Alte Dateien mit „|“ rechnet cleanPlanItem in Zeilen um.
export const LINE_KINDS = new Set(["KASTEN", "ZBOX"]);
export const textLines = (p) => (Array.isArray(p.lines) ? p.lines : String(p.s || "").split("|"));
export const PART_PRESET_BY_ID = Object.fromEntries(PART_PRESETS.map((p) => [p.id, p]));
export const presetName = (pr) => pr.name || PART_KINDS[pr.kind].name;

// Grösse eines Teils, wenn sie aus Grösse oder Anzahl folgt
export function partSize(p) {
  if (p.kind === "NH") { const z = nhSize(p); return { w: z.w, h: z.h }; }
  if (p.kind === "NT") return p.s ? NT_TEXT : NT_SIZES[p.size] || NT_SIZES["00"];
  if (p.kind === "SSW") return { w: sswW(p.n), h: 215 };
  return { w: p.w, h: p.h };
}
export function newPart(id, x, y) {
  const pr = PART_PRESET_BY_ID[id], p = { type: "part", kind: pr.kind, x, y, w: 0, h: 0, ...structuredClone(pr.p) };
  return { ...p, ...partSize(p) };
}
export const sizeLabel = (size) => (size === "000" ? "000" : "DIN " + size);

// Bausteine eines Teils (absolut)
export function partPrims(p) {
  const out = [], { x, y, w, h } = p;
  const rect = (x, y, w, h, o = {}) => out.push({ k: "rect", x: r3(x), y: r3(y), w: r3(w), h: r3(h), layer: LG, ...o });
  const line = (x1, y1, x2, y2, o = {}) => out.push({ k: "line", x1: r3(x1), y1: r3(y1), x2: r3(x2), y2: r3(y2), layer: LG, ...o });
  const text = (x, y, h, s, o = {}) => out.push({ k: "text", x: r3(x), y: r3(y), h: r3(h), s, layer: LT, anchor: "c", ...o });
  const circle = (x, y, r, o = {}) => out.push({ k: "circle", x: r3(x), y: r3(y), r: r3(r), layer: LG, ...o });
  const vert = h > w, cx = x + w / 2, cy = y + h / 2;
  switch (p.kind) {
    case "CALIP": { // Schiene mit Zähnen (Zukaufteil, Masse offen)
      rect(x, y, w, h, { fill: "none" });
      for (let t = x + 10; t < x + w - 5; t += 20) line(t, y, t, y + h / 2);
      if (p.s) text(cx, y + h + 12, 14, p.s);
      break;
    }
    case "ABDECK": { // Abdeckstreifen punktiert
      rect(x, y, w, h, { fill: "none" });
      for (let i = 1; i <= 3; i++) line(x, y + (i * h) / 4, x + w, y + (i * h) / 4, { dash: "dot" });
      break;
    }
    case "EINF": out.push({ k: "slot", x, y, w, h, layer: LG }); if (p.s) text(cx, y + h + 10, 10, p.s); break;
    case "TW": // Trennwand: gestrichelte Linie längs, Text am Anfang
      if (vert) { line(cx, y, cx, y + h, { dash: "dash" }); if (p.s) text(cx, y - 10, 12, p.s); }
      else { line(x, cy, x + w, cy, { dash: "dash" }); if (p.s) text(x - 4, cy + 10, 12, p.s, { anchor: "rm" }); }
      break;
    case "PTP": { // Plattentrennprofil: schmales Profil, Punkte an den Enden, Text längs
      rect(x, y, w, h, { fill: "none" });
      const r = Math.min(w, h) * 0.3;
      if (vert) { circle(cx, y + 8, r, { fill: "ink" }); circle(cx, y + h - 8, r, { fill: "ink" }); if (p.s) text(x - 10, cy, 12, p.s, { rot: 90 }); }
      else { circle(x + 8, cy, r, { fill: "ink" }); circle(x + w - 8, cy, r, { fill: "ink" }); if (p.s) text(cx, y + h + 10, 12, p.s); }
      break;
    }
    case "NHABD": { // Abdeckung vor den NH (CJ 16.10.): Text, links und rechts je eine Schraube (Kreis mit Kreuz)
      rect(x, y, w, h, { fill: "cover" });
      const r = Math.min(6, h * 0.3), sx = Math.min(15, w * 0.1);
      for (const xx of [x + sx, x + w - sx]) { circle(xx, cy, r); line(xx - r * 0.7, cy - r * 0.7, xx + r * 0.7, cy + r * 0.7); line(xx - r * 0.7, cy + r * 0.7, xx + r * 0.7, cy - r * 0.7); }
      if (p.s) text(cx, cy, Math.max(2, Math.min(h * 0.4, (w - 4 * sx) / p.s.length / 0.6)), p.s, { fit: w - 4 * sx, cap: h * 0.8 });
      break;
    }
    case "KASTEN": {
      rect(x, y, w, h, { fill: p.fill ? "ink" : undefined, r: p.round ? Math.min(w, h) * 0.12 : 0 });
      const lines = textLines(p).filter((s, i, a) => s || a.length > 1);
      if (!lines.length || p.fill) break;
      const long = Math.max(...lines.map((s) => s.length), 1), along = p.vert ? h : w, across = p.vert ? w : h;
      // Der Text füllt den Kasten schon: Textgrösse über 100 % ändert nichts (kleiner statt breiter), darunter wird er kleiner
      const th = r3(Math.max(2, Math.min((along * 0.9) / long / 0.6, (across * 0.8) / lines.length / 1.25) * Math.min(1, p.tf || 1)));
      lines.forEach((s, i) => {
        const o = (i - (lines.length - 1) / 2) * th * 1.25;
        if (p.vert) text(cx + o, cy, th, s, { rot: 90, st: true, inner: true }); else text(cx, cy - o, th, s, { st: true, inner: true });
      });
      break;
    }
    case "NH": { // senkrechter NH-Trenner: Grösse, Griff, drei Sicherungen, Strom darüber, Abgang darunter
      if (p.maker === "silas" || p.maker === "vertigroup" || p.maker === "vgw") { nhMakerPrims(p, rect, text, circle); break; }
      rect(x, y, w, h);
      const big = p.size !== "000", th = big ? Math.min(18, w * 0.1) : 10;
      if (big) rect(x + 6, y + 6, w - 12, h - 12, { r: 8, fill: "none" });
      if (big) { const gw = w * 0.55; rect(cx - gw / 2, y + h - 40, gw, 18, { fill: "none" }); line(cx - gw / 2, y + h - 22, cx - gw / 2 + 10, y + h - 14); line(cx + gw / 2, y + h - 22, cx + gw / 2 - 10, y + h - 14); line(cx - gw / 2 + 10, y + h - 14, cx + gw / 2 - 10, y + h - 14); }
      else rect(x + 8, y + h - 70, w - 16, 7, { fill: "none" });
      text(cx, big ? y + 0.16 * h : y + h - 25, th, sizeLabel(p.size), { fit: w - 2 * mIn(w) });
      const sw = big ? w * 0.12 : w * 0.18, sh = big ? h * 0.2 : h * 0.16, sy = big ? y + 0.42 * h : y + 0.4 * h;
      for (const k of [-1, 0, 1]) rect(cx + k * (big ? w * 0.25 : w * 0.28) - sw / 2, sy, sw, sh, { fill: "none" });
      break;
    }
    case "NT": {
      rect(x, y, w, h);
      if (p.s) { text(cx, cy, Math.min(w * 0.4, (h * 0.9) / p.s.length / 0.6), p.s, { rot: 90, fit: h * 0.9, cap: w * 0.8 }); circle(cx, y - 14, 8, { fill: "ink" }); rect(cx - 12, y - 26, 24, 24, { fill: "none" }); }
      else { const o = { fit: w - 2 * mIn(w), cap: h * 0.38 }; text(cx, y + h * 0.7, h * 0.3, "NT", o); text(cx, y + h * 0.3, h * 0.3, p.size, o); line(x, cy, x + w, cy); }
      break;
    }
    case "SSW": { // Sammelschiene: zwei Tragschienen, n Leiter mit Bohrungen, Stromwandler, Querschnitt
      const n = p.n, x0 = x + 48;
      rect(x, y + 40, w, 15, { fill: "ink" }); rect(x, y + h - 55, w, 15, { fill: "ink" });
      for (let i = 0; i < n; i++) {
        const bx = x0 + i * SSW_PITCH;
        rect(bx, y, 30, h);
        circle(bx + 15, y + 15, 3, { fill: "ink" }); circle(bx + 15, y + h - 15, 3, { fill: "ink" });
        if (p.ct) { rect(bx - 15, cy - 40, 60, 80); circle(bx + 15, cy - 8, 22); circle(bx + 15, cy + 8, 22); }
      }
      if (p.s) text(cx, y - 25, 14, p.s);
      break;
    }
    case "WKL": rect(x, y, w, h); circle(cx - h * 0.18, cy, h * 0.3); circle(cx + h * 0.18, cy, h * 0.3); break;
    case "ZBOX": { // Zähler: erste Zeile oben, die übrigen in der Mitte darunter
      rect(x, y, w, h);
      const lines = textLines(p), long = Math.max(...lines.map((t) => t.length), 1);
      const th = r3(Math.max(2, Math.min(14, (w * 0.85) / long / 0.6, h / (lines.length + 1) / 1.35)));
      const o = { fit: w * 0.85, cap: th }; // Zeilen stehen fest im Kasten: nicht grösser als Platz
      if (lines[0]) text(cx, y + h - 1.2 * th, th, lines[0], o);
      const rest = lines.slice(1), mid = y + (h - 2 * th) / 2;
      rest.forEach((t, i) => { if (t) text(cx, mid + ((rest.length - 1) / 2 - i) * th * 1.35, th, t, o); });
      break;
    }
    case "ZKL": { // Klemmenreihe: Tragschiene mit Endhaltern, Klemmen als Kreise darunter
      line(x, y + h, x + w, y + h); line(x, y + h * 0.4, x, y + h); line(x + w, y + h * 0.4, x + w, y + h);
      const n = p.n || 7, gap = w / (n + 1), r = Math.min(h * 0.2, gap * 0.3);
      for (let i = 1; i <= n; i++) circle(x + i * gap, y + h * 0.35, r);
      break;
    }
    case "PKZ": { // Prüfklemme der Messung: abgerundeter Kasten, zwei Reihen Kontakte
      rect(x, y, w, h, { r: h * 0.3 });
      rect(x + w * 0.06, y + h * 0.2, w * 0.88, h * 0.6, { fill: "none", r: h * 0.15 });
      const n = 10, gap = (w * 0.8) / (n - 1), r = Math.min(h * 0.07, gap * 0.25);
      for (let i = 0; i < n; i++) for (const f of [0.38, 0.62]) circle(x + w * 0.1 + i * gap, y + h * f, r);
      break;
    }
    case "SPF": { // Sicherungen Spannungspfad: n Elemente mit Kreis
      rect(x, y, w, h);
      const n = p.n || 3, cell = w / n, sz = Math.min(h * 0.5, cell * 0.7);
      for (let i = 0; i < n; i++) { const ex = x + (i + 0.5) * cell; rect(ex - sz / 2, cy - sz / 2, sz, sz, { fill: "none" }); circle(ex, cy, sz * 0.25); }
      break;
    }
    case "PEN": { // alte PEN-Schiene (bis 16.10.2026), wird beim Öffnen zur BAR
      rect(x, y, w, h);
      for (const yy of [y + 25, y + h - 25]) { circle(cx, yy, w * 0.15, { fill: "ink" }); circle(cx, yy, w * 0.7, { dash: "dash" }); }
      if (p.s) text(cx, y + h + 10, 10, p.s);
      break;
    }
    case "BAR": { // N-, PE-, PEN-Schiene: gefüllt in der Leiterfarbe, PE/PEN mit gelbem Längsstreifen, PEN an den Enden blau, Leiter als Text innen
      const H = w >= h, t = H ? h : w, L = H ? w : h, n = p.c === "N";
      const along = (a, b, o) => (H ? rect(x + a, y, b, h, o) : rect(x, y + a, w, b, o));
      rect(x, y, w, h, { fill: n ? "n" : "pe", layer: n ? LN : LPE });
      if (!n) H ? rect(x, cy - t * 0.17, w, t * 0.34, { fill: "ye", layer: LYE }) : rect(cx - t * 0.17, y, t * 0.34, h, { fill: "ye", layer: LYE });
      if (p.c === "PEN") { const e = Math.min(30, L * 0.12); along(0, e, { fill: "n", layer: LN }); along(L - e, e, { fill: "n", layer: LN }); }
      const name = p.c || "N", room = L - (p.c === "PEN" ? 2 * Math.min(30, L * 0.12) : 0) - 4;
      if (H) text(cx, cy, t * 0.7, name, { fit: room, cap: t * 0.8 }); else text(cx, cy, t * 0.7, name, { rot: 90, fit: room, cap: t * 0.8 }); // cap: höchstens so hoch wie die Schiene
      break;
    }
  }
  if (BMK_KINDS.has(p.kind)) {
    const tops = p.kind === "NH" ? [p.s] : [], below = BMK_BELOW.has(p.kind), labs = [p.beschr, p.bmk];
    out.push(...stackTexts(cx, y + h, 1, below ? tops : [...tops, ...labs], p.tf));
    out.push(...stackTexts(cx, y, -1, below ? labs : p.kind === "NH" ? [p.s2] : [], p.tf));
  }
  return out;
}
const mIn = (w) => Math.max(2, w * 0.06); // Rand innen für Texte (Annahme)

// NH von Weber, eigene einfache Zeichnung (nur die Masse stammen vom Hersteller).
// Silas: Kasten, Abdeckung innen, drei Sicherungen nebeneinander in der Polteilung, Grösse oben.
// Vertigroup: senkrechte Leiste, drei Sicherungen übereinander, Typ oben.
function nhMakerPrims(p, rect, text, circle) {
  const { x, y, w, h } = p, z = nhSize(p), cx = x + w / 2, room = w - 2 * mIn(w);
  rect(x, y, w, h);
  if (p.maker === "silas") {
    const big = !!z.pitch, m = Math.min(6, w * 0.06);
    rect(x + m, y + m, w - 2 * m, h - 2 * m, { r: big ? 8 : 4, fill: "none" });
    text(cx, y + h - Math.max(14, h * 0.09), Math.min(18, w * 0.17), z.label, { fit: room });
    const pitch = z.pitch || w * 0.28, sw = Math.min(pitch * 0.55, w * 0.2), sh = h * (big ? 0.42 : 0.3), sy = y + h * 0.18;
    for (const k of [-1, 0, 1]) rect(cx + k * pitch - sw / 2, sy, sw, sh, { fill: "none", r: 2 });
  } else {
    const sw = w * 0.6, sh = h * 0.2, gap = (h * 0.8 - 3 * sh) / 4, fy = (i) => y + 0.04 * h + gap + i * (sh + gap); // i = 0 unten (L3)
    text(cx, y + h - 0.08 * h, Math.min(16, w * 0.15), z.label, { fit: room });
    for (let i = 0; i < 3; i++) rect(cx - sw / 2, fy(i), sw, sh, { fill: "none", r: 3 });
    if (p.maker === "vgw") { // Wandlerringe über den Sicherungen der gewählten Phasen, Verhältnis unten im Feld
      const r = Math.min(sw / 2, gap * 0.45);
      for (const ph of (WANDLER_LAGE[p.wl] || WANDLER_LAGE.L123).ph) { const yy = fy(2 - ph) + sh + gap / 2; circle(cx, yy, r); circle(cx, yy, r * 0.55); }
      if (p.wr) text(cx, y + (0.04 * h + gap) / 2, Math.min(12, w * 0.14), p.wr, { fit: room });
    }
  }
}

// ---------- Reiheneinbaugeräte: Zeichnung im Gerätekasten ----------
// Klemmen: Teilung je Querschnitt (Annahme nach üblichen Reihenklemmen, im Dossier 5×10 ≈ 50 mm), Höhe je Grösse (Annahme)
export const KL_PITCH = { "2.5": 5.2, 4: 6.2, 6: 8.2, 10: 10.2, 16: 12.2, 35: 16, 50: 20, 70: 22, 95: 25, 120: 31 };
export const klH = (qs) => (Number(qs) <= 16 ? 45 : Number(qs) <= 50 ? 60 : 85);
export const klW = (d) => r3(d.n * (KL_PITCH[d.qs] ?? 10.2));

// Bausteine im Gerät (zusätzlich zum Kasten): w = Breite, sowie Texte darüber und darunter
export function devDeco(d, w) {
  const out = [], cx = d.x + w / 2, top = d.y + d.h / 2, bot = d.y - d.h / 2;
  const text = (x, y, h, s, o = {}) => out.push({ k: "text", x: r3(x), y: r3(y), h: r3(h), s, layer: LT, anchor: "c", ...o });
  const fit = (s, room, max) => Math.max(2, Math.min(max, room / Math.max(1, s.length) / 0.55)); // wie bisher beim LS
  if (d.kind === "KL") {
    for (let i = 1; i < d.n; i++) out.push({ k: "line", x1: r3(d.x + (i * w) / d.n), y1: bot, x2: r3(d.x + (i * w) / d.n), y2: top, layer: LG });
    if (d.haupt) out.push({ k: "rect", x: r3(d.x - 8), y: r3(bot - 8), w: r3(w + 16), h: r3(d.h + 16), layer: LG, fill: "none" });
    if (d.trenn) text(d.x, bot - 5, 4, "Trennkl", { anchor: "lm" });
  } else if (d.kind === "DIAZED") {
    const r = Math.min(w, d.h) * 0.4;
    out.push({ k: "circle", x: r3(cx), y: d.y, r: r3(r), layer: LG });
    if (d.label) text(cx, d.y, r * 0.8, d.label, { fit: 1.6 * r, cap: r });
  } else if (d.kind === "ZAEHLER") out.push({ k: "rect", x: d.x, y: r3(top - 4), w, h: 4, layer: LG, fill: "ink" });
  else if (d.kind === "PK") for (let i = 1; i < 7; i++) out.push({ k: "line", x1: r3(d.x + (i * w) / 7), y1: r3(bot + 4), x2: r3(d.x + (i * w) / 7), y2: r3(top - 4), layer: LG });
  else if (d.kind === "FILS") out.push({ k: "rect", x: r3(d.x + w - 6), y: r3(d.y - 12), w: 4, h: 4, layer: LG, fill: "ink" });
  if (d.kind !== "DIAZED" && d.label) {
    // Textgrösse (tf) schon hier, damit der Zeilenabstand mitwächst; höchstens gerätebreit (kleiner statt breiter)
    const two = !!d.l2, tf = d.tf || 1, cap = two ? d.h * 0.38 : d.h * 0.8, f2 = (s) => r3(Math.min(fit(s, w - 2, 5) * tf, fitH(5 * tf, s, w - 2), cap));
    const th = f2(d.label), t2 = two ? f2(d.l2) : 0, dy = Math.max(th, t2) * 0.65;
    text(cx, two ? d.y + dy : d.y, th, d.label, { st: true, inner: true });
    if (two) text(cx, d.y - dy, t2, d.l2, { st: true, inner: true });
  }
  // Texte aussen (CJ 16.10.2026): Text darüber, Beschriftung, BMK vom Gerät weg gestapelt, höchstens gerätebreit (Nachbarn auf der Schiene)
  const tt = d.top ?? (d.kind === "KL" ? `${d.n}x${d.qs}` : ""); // Klemmen: Anzahl × Querschnitt darüber
  out.push(...stackTexts(cx, top, 1, [tt, d.beschr, d.bmk], d.tf, w));
  return out;
}
