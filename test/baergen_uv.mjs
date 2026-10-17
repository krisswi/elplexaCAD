// UV Bärgen 268 (Neubau Stall) nach dem Dossier nachgezeichnet: Beleg für Schrank und Symbole.
// Lagen aus dem Bild Referenzen/Dossier Baergen UV Stall.png abgegriffen (1 px ≈ 1,484 mm, Schrank aussen 1150 = 775 px).
// Aufruf: node test/baergen_uv.mjs <Ausgabe.schemacad.json>  (ohne Argument nur das Dokument zurückgeben, für Tests)
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import * as D from "../src/dispo.js";
import * as K from "../src/schrank.js";
import { newDoc, newSheet, serializeModel } from "../src/model.js";

const PX = 1150 / 775, X0 = 203, Y0 = 1857; // Bildpunkt der linken unteren Schrankecke (über dem Sockel)
const r = (n) => Math.round(n / 5) * 5; // auf 5 mm runden
const mx = (X) => r((X - X0) * PX), my = (Y) => r(100 + (Y0 - Y) * PX); // Sockel 100 unter y = 100

export function baergenUV() {
  let id = 0;
  const items = [], add = (o) => { const it = { id: ++id, ...o }; items.push(it); return it; };
  const cab = add({ ...K.newCabinet(0, 100), ip: "IP4", fields: [{ w: 1100, door: "r", t: "" }] });
  // Montageplatten (Feldaufteilung wie im Dossier)
  const plate = (x0, x1, y0, y1) => add({ type: "plate", x: mx(x0), y: my(y1), w: mx(x1) - mx(x0), h: my(y0) - my(y1), name: "" });
  const A = plate(255, 591, 590, 813), B = plate(591, 928, 590, 813), C = plate(255, 591, 813, 1015), Dp = plate(591, 928, 813, 1015);
  const E = plate(255, 591, 1015, 1150), F = plate(591, 928, 1015, 1150);
  plate(255, 422, 1150, 1420); const H = plate(422, 591, 1150, 1420); plate(591, 928, 1150, 1420);
  plate(255, 607, 1420, 1822); plate(607, 928, 1420, 1822);
  const part = (pid, X, Y, o = {}) => add({ ...K.newPart(pid, mx(X), my(Y)), ...o }); // X, Y = linke untere Ecke im Bild
  part("CALIP", 220, 577, { w: 1100 });
  part("ABDECK", 255, 810, { w: mx(928) - mx(255), h: 35 });
  // Schienen und Geräte. Geräte 83 mm hoch (CJ 16.10.: das Dossier zeigt nur den 45-mm-Ausschnitt der Abdeckung).
  const rail = (pl, Y) => add({ type: "rail", y: my(Y), ...D.railFit(pl) });
  let cur = 0;
  const row = (rl, X) => { cur = X === undefined ? rl.x : Math.max(rl.x, Math.round((mx(X) - rl.x) / D.SNAP_TE) * D.SNAP_TE + rl.x); return rl; };
  const dev = (rl, pid, o = {}) => {
    const pr = D.PRESET_BY_ID[pid], d = { type: "device", x: cur, y: rl.y, te: pr.te, h: pr.h ?? D.DEV_H, kind: pid, label: pr.type, bmk: "" };
    for (const k of ["top", "l2", "n", "qs"]) if (pr[k] !== undefined) d[k] = pr[k];
    Object.assign(d, o);
    for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k];
    if (pid === "KL") Object.assign(d, D.klemmFit(d));
    add(d); cur = Math.round((cur + D.devW(d)) * 1000) / 1000;
  };
  // Klemmen oben links: 5×120 Hauptklemme, 5×2.5 Trennklemme, 5×10 und 5×16
  const r1 = row(add({ type: "rail", y: my(727), x: A.x + 20, len: B.x + B.w - A.x - 40 })); // Schiene über beide Platten wie im Dossier
  cur += 10; dev(r1, "KL", { n: 5, qs: "120", haupt: true });
  cur += 10; dev(r1, "KL", { n: 5, qs: "2.5", trenn: true });
  for (const q of ["10", "10", "10", "10", "10", "10", "16", "16", "16", "10"]) dev(r1, "KL", { n: 5, qs: q });
  add({ type: "text", x: mx(285), y: my(670), h: 15, s: "5x95mm2 ab HV" });
  const r2 = row(rail(B, 645));
  for (const n of [5, 5, 5, 5, 8, 3, 3, 3]) dev(r2, "KL", { n, qs: "2.5" });
  // LS 40/32 A, FILS, Uhr, Schütze
  const r3 = row(rail(C, 878));
  for (const a of ["40", "40", "40", "40", "32", "32"]) dev(r3, "LS3", { label: "", top: a });
  const r4 = row(rail(Dp, 878));
  for (let i = 0; i < 3; i++) dev(r4, "FILS", { ...(i ? { top: undefined } : {}), label: "13", l2: "30" });
  cur += 2 * D.TE; dev(r4, "FILS", { te: 3.5, label: "13A" });
  dev(r4, "UHR"); for (let i = 0; i < 4; i++) dev(r4, "SCH");
  const r5 = row(rail(C, 962), 430);
  dev(r5, "FI"); dev(r5, "FREI", { te: 3, label: "KRN199" });
  const r6 = row(rail(Dp, 962));
  dev(r6, "FILS", { te: 3.5, label: "16A" }); dev(r6, "FREI", { te: 3, label: "KRN199" });
  for (const a of ["16A", "16A", "16A", "32A"]) dev(r6, "FILS", { te: 3.5, label: a });
  // Diazed, Bilanzzähler, FI 300 mA
  const r7 = row(rail(E, 1097));
  dev(r7, "DIAZED"); dev(r7, "DIAZED", { label: "" }); dev(r7, "DIAZED", { label: "" });
  dev(r7, "ZAEHLER", { te: 5, top: "Bilanz PVA" }); dev(r7, "ZAEHLER", { te: 5, top: "Stall" });
  const r8 = row(rail(F, 1097));
  for (let i = 0; i < 3; i++) dev(r8, "FI", { l2: "300mA" });
  // Feld PVA: Kabeleinführung, Trennwände
  add({ type: "text", x: mx(290), y: my(1168), h: 25, s: "PVA" });
  part("EINF", 288, 1385, { w: 150, h: 30, s: "110,111,112,113,114" });
  part("TW", 255, 1425, { w: mx(422) - mx(255), h: 10 });
  part("TW", 383, 1420, { w: 10, h: my(1140) - my(1420), s: "" });
  // Prüfklemme Lieferant, Diazed, Prüfklemme
  part("PKTXT", 432, 1260, { w: 220, h: 130 });
  const r9 = row(rail(H, 1301));
  cur += 30; dev(r9, "DIAZED"); dev(r9, "DIAZED", { label: "" }); dev(r9, "DIAZED", { label: "" });
  const r10 = row(rail(H, 1370), 490);
  dev(r10, "PK");
  // NH 000 für die Wechselrichter, R-AB, NT 00
  part("NH000", 676, 1388, { s: "63", s2: "WR1" }); part("NH000", 714, 1388, { s: "63", s2: "Wr2" });
  part("RAB", 752, 1385, { w: 80, h: 200 });
  part("NH000", 808, 1388, { s: "63", s2: "Wr3" });
  for (const X of [676, 716, 808]) part("NT", X, 1215);
  // Einspeisung: DIN 00 160 A, R-AB, 000 80 A, DIN 1 250 A, NH-Abdeckung, NT, SPD
  part("NH00", 290, 1625, { s: "160", s2: "Ue-Abl" });
  part("RAB", 364, 1625, { w: 80, h: 200 });
  part("NH000", 419, 1625, { s: "80", s2: "Stall" });
  part("NH1", 457, 1632, { s: "250", s2: "PVA" });
  part("NHABD", 262, 1585, { w: mx(605) - mx(262) });
  part("NT", 349, 1722); part("KASTEN", 383, 1722, { w: 22, h: 50, lines: [""] }); part("NT", 423, 1722);
  part("NTA", 503, 1750);
  part("KASTEN", 270, 1787, { w: 70, h: 40, lines: ["E"] });
  add({ type: "text", x: mx(270), y: my(1752), h: 10, s: "DVA M NG 3P 100 FM" });
  add({ type: "text", x: mx(278), y: my(1800), h: 10, s: "Ue-Abl" });
  // Sammelschiene mit Stromwandlern, Wandlerklemmen, PEN
  for (const X of [651, 722, 793]) part("WKL", X, 1527);
  part("SSW", 636, 1710);
  part("PEN", 870, 1708);
  // Texte rechts
  ["inkl. PPK", "inkl. Verdr.", "inkl. Beschriftung", "inkl. Lieferung", "ohne Montage"].forEach((s, i) => add({ type: "text", x: 1300, y: 2030 - i * 50, h: 30, s }));
  const doc = newDoc();
  const sh = newSheet("dispo");
  sh.sid = 900; sh.meta.TITEL = "UV Neubau Stall"; sh.meta.OBJEKT = "Bärgen 268";
  sh.items = items;
  doc.sheets = [sh]; doc.nextId = id + 1; doc.active = 0;
  return { doc, cab };
}

if (process.argv[2] && import.meta.url === pathToFileURL(process.argv[1]).href) { // nur als Skript aufgerufen
  const { doc } = baergenUV();
  fs.writeFileSync(process.argv[2], serializeModel(doc));
  console.log("geschrieben:", process.argv[2], doc.sheets[0].items.length, "Objekte");
}
