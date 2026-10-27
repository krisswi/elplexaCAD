// Modul «Offerten», Schritt 5 (CJ 26.10.2026): PDF der Offerte im Stil Messerli/NPK. A4 hoch, Seiten als SVG für den Druckweg (#printroot,
// files.js buildPrint): elplexaCAD macht daraus ein eigenes PDF (pdfout.js), SchemaCAD v3 den Druckdialog.
// Seite 1: Absender (Firmenprofil mit Logo und MwSt-Nr.), Kundenadresse (Projektfelder Bauherr), Kopf der Offerte. Folgeseiten: Kopfzeile.
// Spalten Pos, Text, IC, Menge, EH, Preis, Betrag; je Kapitel «Total … BKP nnn», am Ende die Schlusszusammenstellung wie im Editor.
// Gliederung (CJ 26.10.2026): Knoten als Kopfzeile «Wohnung 1 [RGL]» wie im Messerli-Muster, darunter seine Kapitel und Unterknoten, danach «Total …» des Knotens.
// prices = false: ohne Preis, Betrag und Summen. EK, Faktor, Zeit, Zeitfaktor und Ansatz kommen nie auf die Seite.
import * as O from "./offerte.js";
import { profilLines } from "./profil.js";
import { esc } from "./render.js";

export const PW = 210, PH = 297; // A4 hoch, mm
const L = 18, R = PW - 12, TOP = 14, BOT = PH - 16; // Satzspiegel (links Lochrand)
const INK = "#17212b", SOFT = "#6b7785", LINE = "#9aa3ad";
const FS = 2.9, LH = 3.8; // Schrift der Tabelle (mm) und Zeilenabstand

// Textbreite in mm. Im Browser über ein Canvas mit der Plan-Schrift, sonst geschätzt (Barlow Semi Condensed ≈ 0.5 × Höhe je Zeichen).
let ctx = null;
function measure(s, h, bold = false) {
  if (typeof document !== "undefined") {
    ctx ||= document.createElement("canvas").getContext("2d");
    if (ctx) { ctx.font = `${bold ? 600 : 400} 100px "Barlow Semi Condensed", "Barlow", sans-serif`; return ctx.measureText(s).width * h / 100; }
  }
  return s.length * h * (bold ? 0.52 : 0.5);
}
// Text auf Breite w umbrechen (Wörter, zu lange Wörter hart), Absätze bleiben
export function wrap(s, w, h = FS, bold = false) {
  const out = [];
  for (const para of String(s ?? "").split(/\r?\n/)) {
    let cur = "";
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (measure(word, h, bold) > w) { // Wort länger als die Spalte
        let n = word.length; while (n > 1 && measure(word.slice(0, n), h, bold) > w) n--;
        if (cur) { out.push(cur); cur = ""; }
        out.push(word.slice(0, n)); word = word.slice(n);
      }
      const t = cur ? `${cur} ${word}` : word;
      if (measure(t, h, bold) <= w) cur = t; else { out.push(cur); cur = word; }
    }
    out.push(cur);
  }
  while (out.length > 1 && out.at(-1) === "") out.pop();
  return out;
}

const t = (x, y, s, { h = FS, bold = false, anchor = "start", fill = INK } = {}) =>
  `<text x="${f(x)}" y="${f(y)}" font-size="${h}"${bold ? ' font-weight="600"' : ""}${anchor !== "start" ? ` text-anchor="${anchor}"` : ""} fill="${fill}" stroke="none">${esc(s)}</text>`;
const hl = (x1, x2, y, c = LINE) => `<rect x="${f(x1)}" y="${f(y)}" width="${f(x2 - x1)}" height="0.2" fill="${c}" stroke="none"/>`; // Linie als Fläche (Druck-CSS setzt stroke-width fest)
const f = (v) => String(Math.round(v * 100) / 100);

// Spalten (x = linke Kante, rechtsbündige Zahlen an x + w)
function columns(prices) {
  const c = { pos: { x: L, w: 17 } }, right = prices ? [["ic", 8], ["menge", 15], ["eh", 10], ["preis", 19], ["betrag", 22]] : [["ic", 8], ["menge", 17], ["eh", 10]];
  let x = R; for (const [k, w] of right.reverse()) { x -= w; c[k] = { x, w }; }
  c.txt = { x: L + 18, w: x - (L + 18) - 2 };
  return c;
}

// Inhalt als Blöcke (Höhe, Zeichnen bei y). keep = mit dem nächsten Block auf derselben Seite (Überschrift).
function blocks(of, prices, tot) {
  const C = columns(prices), out = [];
  const num = (x, y, s, col, bold = false) => t(C[col].x + C[col].w, y, s, { anchor: "end", bold });
  const order = O.kapOrder(of);
  for (const e of O.outline(of)) {
    if (e.t === "kn") { out.push({ h: 11, keep: true, draw: (y) => t(L, y + 7, O.knTitel(e.n), { h: 4, bold: true }) + hl(L, R, y + 8.8, INK) }); continue; }
    if (e.t === "end") { if (prices) out.push({ h: 11, draw: (y) => hl(L, R, y + 1, INK) + hl(L, R, y + 1.6, INK) + t(L, y + 5.6, `Total ${e.n.titel || "Ohne Titel"}`, { bold: true, h: 3.4 }) + num(0, y + 5.6, O.fmtChf(tot.kn.get(e.n.id) || 0), "betrag", true) }); continue; }
    const k = e.k, ki = order.indexOf(k);
    out.push({ h: 9, keep: true, draw: (y) => t(L, y + 6, k.bkp, { h: 3.6, bold: true }) + t(C.txt.x, y + 6, k.titel || O.bkpTitle(k.bkp), { h: 3.6, bold: true }) + hl(L, R, y + 7.6, INK) });
    k.grp.forEach((g, gi) => {
      if (g.titel) out.push({ h: 7, keep: true, draw: (y) => t(C.txt.x, y + 5, g.titel, { h: 3.2, bold: true }) });
      g.pos.forEach((p, pi) => {
        const off = p.opt && !p.an, head = wrap(p.titel || "", C.txt.w, FS, true), body = p.text ? wrap(p.text, C.txt.w) : [];
        const opt = p.opt ? [off ? "Option, nicht in der Angebotssumme" : "Option, in der Angebotssumme"] : [];
        const n = Math.max(1, head.length + body.length + opt.length), ep = O.unitPrice(p, of), amt = tot.pos.get(p.id) || 0;
        out.push({ h: n * LH + 2.2, draw: (y) => {
          let s = "", yy = y + 3.4;
          s += t(L, yy, O.posNo(p, ki, gi, pi), { fill: SOFT });
          if (p.ic) s += t(C.ic.x, yy, p.ic);
          if (O.isNumber(p.menge)) s += num(0, yy, fmtQty(p.menge), "menge");
          if (p.eh) s += t(C.eh.x + 2, yy, p.eh);
          if (prices) { s += num(0, yy, O.fmtChf(ep), "preis"); s += t(C.betrag.x + C.betrag.w, yy, off ? `(${O.fmtChf(amt)})` : O.fmtChf(amt), { anchor: "end", fill: off ? SOFT : INK }); }
          head.forEach((l) => { s += t(C.txt.x, yy, l, { bold: true }); yy += LH; });
          body.forEach((l) => { s += t(C.txt.x, yy, l); yy += LH; });
          opt.forEach((l) => { s += t(C.txt.x, yy, l, { fill: SOFT, h: 2.6 }); yy += LH; });
          return s;
        } });
      });
      if (prices && g.titel && k.grp.length > 1) out.push({ h: 6, draw: (y) => hl(C.betrag.x, R, y + 0.8) + t(C.txt.x, y + 4, `Total ${g.titel}`) + num(0, y + 4, O.fmtChf(tot.grp.get(g.id) || 0), "betrag") });
    });
    if (prices) out.push({ h: 10, draw: (y) => hl(L, R, y + 1, INK) + t(C.txt.x, y + 5.2, `Total ${k.titel || ""} BKP ${O.bkpMain(k.bkp) || k.bkp}`.replace(/\s+/g, " "), { bold: true }) + num(0, y + 5.2, O.fmtChf(tot.kapSum.get(k.id) || 0), "betrag", true) });
  }
  if (prices && of.kap.length) {
    const { rows, notes } = O.summaryRows(of, tot), rh = 5.2;
    out.push({ h: 14 + rows.length * rh + notes.length * 4.6 + 4, draw: (y) => {
      let s = t(L, y + 8, "Schlusszusammenstellung", { h: 4, bold: true }) + hl(L, R, y + 9.6, INK), yy = y + 15;
      for (const r of rows) {
        const big = r.art === "total", strong = big || r.art === "zs";
        if (big) s += hl(C.txt.x, R, yy - 3.8, INK);
        s += t(C.txt.x + (r.lv || 0) * 4, yy, r.text, { bold: strong || r.art === "kn", h: big ? 3.4 : FS }) + t(R, yy, (big ? "CHF " : "") + O.fmtSigned(r.betrag), { anchor: "end", bold: strong, h: big ? 3.4 : FS });
        yy += rh;
      }
      yy += 1.5;
      for (const n of notes) { s += t(C.txt.x, yy, n, { fill: SOFT }); yy += 4.6; }
      return s;
    } });
  }
  return out;
}
const fmtQty = (x) => String(Math.round(x * 1000) / 1000);

// Kopf Seite 1: Absender links mit Logo, Kundenadresse rechts (Fensterkuvert), darunter Titel und Kopfdaten. Gibt [SVG, Höhe] zurück.
function firstHead(of, ctx2) {
  const { profil, kunde, projekt, prices } = ctx2;
  let s = "", y = TOP;
  if (profil?.logo) s += `<image href="${profil.logo}" x="${L}" y="${y}" width="50" height="18" preserveAspectRatio="xMinYMin meet"/>`;
  const sender = profil ? profilLines(profil) : [];
  let sy = y + (profil?.logo ? 23 : 3);
  sender.forEach((l, i) => { s += t(L, sy, l, { h: i ? 2.7 : 3.2, bold: !i, fill: i ? SOFT : INK }); sy += i ? 3.4 : 4.2; });
  const kx = 118; let ky = 50; // Fensterposition rechts
  const kl = [kunde.BAUHERR, ...String(kunde.BAUHERR_ADR || "").split(/\r?\n/)].map((l) => String(l ?? "").trim()).filter(Boolean).slice(0, 6);
  kl.forEach((l, i) => { s += t(kx, ky, l, { h: 3.4, bold: !i }); ky += 4.6; });
  y = (kl.length ? Math.max(sy, ky, 80) : sy) + 6; // ohne Kunde kein Platz fürs Fenster
  s += t(L, y, `Offerte${of.nr ? ` ${of.nr}` : ""}${prices ? "" : " (ohne Preise)"}`, { h: 6, bold: true }); y += 5;
  if (projekt) { s += t(L, y + 1.5, projekt, { h: 3.6 }); y += 6; }
  const meta = [["Datum", of.datum], ["Version", of.ver], ["Gültig bis", of.gueltig], ["Abrechnungsart", O.ARTEN[of.art]], ["Bauart", O.BAUARTEN[of.bau]], ["E-Mail", kunde.BAUHERR_MAIL], ["Telefon", kunde.BAUHERR_TEL]].filter(([, v]) => v);
  y += 2;
  meta.forEach(([k, v], i) => { const x = L + (i % 2) * 90, yy = y + Math.floor(i / 2) * 4.4; s += t(x, yy, k, { fill: SOFT }) + t(x + 26, yy, v); });
  y += Math.ceil(meta.length / 2) * 4.4 + 2;
  return [s, y];
}
// Tabellenkopf (jede Seite)
function tableHead(prices, y) {
  const C = columns(prices), r = (k, s) => t(C[k].x + C[k].w, y + 4, s, { anchor: "end", bold: true, fill: SOFT });
  let s = t(L, y + 4, "Pos", { bold: true, fill: SOFT }) + t(C.txt.x, y + 4, "Text", { bold: true, fill: SOFT }) + t(C.ic.x, y + 4, "IC", { bold: true, fill: SOFT }) + r("menge", "Menge") + t(C.eh.x + 2, y + 4, "EH", { bold: true, fill: SOFT });
  if (prices) s += r("preis", "Preis") + r("betrag", "Betrag");
  return [s + hl(L, R, y + 5.6, INK), 7.5];
}

// Seiten als SVG-Strings. c: { profil, kunde (Projektfelder Bauherr), projekt (Name), prices }
export function offertePages(of, c = {}) {
  const ctx2 = { profil: null, kunde: {}, projekt: "", prices: true, ...c }, prices = ctx2.prices, tot = O.totals(of), bl = blocks(of, prices, tot);
  const pages = [];
  let s = "", y = 0;
  const start = (first) => {
    if (first) { const [h, yy] = firstHead(of, ctx2); s = h; y = yy; }
    else { s = t(L, TOP + 2, [`Offerte${of.nr ? ` ${of.nr}` : ""}`, ctx2.projekt, of.datum].filter(Boolean).join(" · "), { fill: SOFT }) + hl(L, R, TOP + 3.5); y = TOP + 7; }
    const [th, h] = tableHead(prices, y); s += th; y += h;
  };
  start(true);
  for (let i = 0; i < bl.length; i++) {
    let need = bl[i].h; for (let j = i; bl[j]?.keep && bl[j + 1]; j++) need += bl[j + 1].h; // Überschrift nicht allein am Seitenende
    if (y + need > BOT && y > TOP + 30) { pages.push(s); start(false); }
    s += bl[i].draw(y); y += bl[i].h;
  }
  pages.push(s);
  return pages.map((p, i) => p + t(R, PH - 9, `Seite ${i + 1} von ${pages.length}`, { anchor: "end", h: 2.6, fill: SOFT }));
}
// Seite als SVG für #printroot (A4 hoch, benannte Seite pA4h in style.css)
export const printPages = (of, c) => offertePages(of, c).map((s) => `<svg xmlns="http://www.w3.org/2000/svg" class="of-page" viewBox="0 0 ${PW} ${PH}" style="width:${PW}mm;height:${PH}mm;page:pA4h;--pw:0.2"><rect x="0" y="0" width="${PW}" height="${PH}" fill="#fff" stroke="none"/>${s}</svg>`);
