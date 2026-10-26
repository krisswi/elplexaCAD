// Modul «Offerten», Schritt 5 (CJ 26.10.2026): Excel-Export der Offerte (.xlsx, ein Blatt «Offerte»), gleicher Inhalt wie das PDF.
// Zahlen als Formeln mit dem Wert des Editors (Excel zeigt sofort dieselben Beträge, rechnet bei Änderungen nach):
// Betrag = Menge × Preis, Kapitel = SUMMEWENNS über die Positionen ohne nicht aktivierte Optionen, Zwischensumme, Rabatt (Basis als Wert),
// MwSt, Total auf 5 Rappen. EK, Faktor, Zeit, Zeitfaktor und Ansatz stehen nie in der Datei. prices = false: ohne Preis, Betrag, Summen.
// Spalten (auch für den späteren Import): A Pos, B Titel, C Beschreibung, D IC, E Menge, F EH, G Preis, H Betrag, I Option.
// Gliederung (CJ 26.10.2026): Knoten als Kopfzeile «Wohnung 1 [RGL]» (Spalte B), «Total …» des Knotens = Summe seiner Kapitelsummen.
import * as O from "./offerte.js";
import { profilLines } from "./profil.js";
import { zipFiles } from "./zip.js";

const x = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
// Stile (styles.xml): 0 normal, 1 fett, 2 Franken, 3 Franken fett, 4 Text mit Umbruch, 5 grau, 6 Titel gross
const ST = { b: 1, chf: 2, chfB: 3, wrap: 4, soft: 5, big: 6 };
const OPT_OFF = "Option", OPT_ON = "Option aktiv";

// Zeilen aufbauen: je Zelle { v } (Text oder Zahl) oder { f, v } (Formel mit Wert), s = Stil
export function sheetRows(of, { profil = null, kunde = {}, projekt = "", prices = true } = {}) {
  const tot = O.totals(of), rows = [], add = (cells = []) => { rows.push(cells); return rows.length; }; // gibt die Excel-Zeilennummer zurück
  const sender = profil ? profilLines(profil) : [];
  sender.forEach((l, i) => add([{ v: l, s: i ? ST.soft : ST.b }]));
  if (sender.length) add();
  for (const [i, l] of [kunde.BAUHERR, ...String(kunde.BAUHERR_ADR || "").split(/\r?\n/), kunde.BAUHERR_MAIL, kunde.BAUHERR_TEL].map((s) => String(s ?? "").trim()).filter(Boolean).entries()) add([{ v: l, s: i ? 0 : ST.b }]);
  add();
  add([{ v: `Offerte${of.nr ? ` ${of.nr}` : ""}${prices ? "" : " (ohne Preise)"}`, s: ST.big }]);
  if (projekt) add([{ v: projekt }]);
  for (const [k, v] of [["Datum", of.datum], ["Version", of.ver], ["Gültig bis", of.gueltig], ["Abrechnungsart", O.ARTEN[of.art]], ["Bauart", O.BAUARTEN[of.bau]]]) if (v) add([{ v: k, s: ST.soft }, { v }]);
  add();
  add(["Pos", "Titel", "Beschreibung", "IC", "Menge", "EH", ...(prices ? ["Preis", "Betrag", "Option"] : ["Option"])].map((v) => ({ v, s: ST.b })));
  const optCol = prices ? "I" : "G", kapCells = new Map(), order = O.kapOrder(of), knKap = new Map(); // knKap: Kapitelsummen-Zeilen je Knoten (mit allem darunter)
  for (const e of O.outline(of)) {
    if (e.t === "kn") { add([{ v: "" }, { v: O.knLabel(e.n), s: ST.big }]); continue; }
    if (e.t === "end") { if (prices) add([{ v: "" }, { v: `Total ${e.n.titel || "Ohne Titel"}`, s: ST.b }, ...Array(5).fill({ v: "" }), { f: `SUM(${(knKap.get(e.n.id) || []).map((c) => `H${c}`).join(",")})`, v: tot.kn.get(e.n.id) || 0, s: ST.chfB }]); add(); continue; }
    const k = e.k, ki = order.indexOf(k);
    const r0 = add([{ v: k.bkp, s: ST.b }, { v: k.titel || O.bkpTitle(k.bkp), s: ST.b }]);
    k.grp.forEach((g, gi) => {
      if (g.titel) add([{ v: "" }, { v: g.titel, s: ST.b }]);
      g.pos.forEach((p, pi) => {
        const r = rows.length + 1, ep = O.unitPrice(p, of), opt = p.opt ? { v: p.an ? OPT_ON : OPT_OFF } : { v: "" };
        add([{ v: O.posNo(p, ki, gi, pi) }, { v: p.titel || "" }, { v: p.text || "", s: ST.wrap }, { v: p.ic || "" }, O.isNumber(p.menge) ? { v: p.menge } : { v: "" }, { v: p.eh || "" },
          ...(prices ? [{ v: ep, s: ST.chf }, { f: `E${r}*G${r}`, v: tot.pos.get(p.id) || 0, s: ST.chf }] : []), opt]);
      });
    });
    const r1 = rows.length;
    if (prices) {
      const label = `Total ${k.titel || ""} BKP ${O.bkpMain(k.bkp) || k.bkp}`.replace(/\s+/g, " ");
      // Kapitelsumme: Positionen (Spalte A gefüllt) ohne nicht aktivierte Optionen
      const rs = add([{ v: "" }, { v: label, s: ST.b }, ...Array(5).fill({ v: "" }), { f: `SUMIFS(H${r0 + 1}:H${r1},${optCol}${r0 + 1}:${optCol}${r1},"<>${OPT_OFF}",A${r0 + 1}:A${r1},"<>")`, v: tot.kapSum.get(k.id) || 0, s: ST.chfB }]);
      kapCells.set(k.id, rs);
      for (const n of O.knPath(of, k.kn)) { if (!knKap.has(n.id)) knKap.set(n.id, []); knKap.get(n.id).push(rs); }
    }
    add();
  }
  if (prices && of.kap.length) {
    const { rows: sr, notes } = O.summaryRows(of, tot), at = {};
    add([{ v: "" }, { v: "Schlusszusammenstellung", s: ST.big }]);
    for (const r of sr) {
      const n = rows.length + 1, ind = "   ".repeat(r.lv || 0), cell = (f, s = ST.chf) => [{ v: "" }, { v: ind + r.text, s: s === ST.chfB ? ST.b : 0 }, ...Array(5).fill({ v: "" }), { f, v: r.betrag, s }];
      if (r.art === "kn") { add(cell(`SUM(${(knKap.get(r.id) || []).map((c) => `H${c}`).join(",")})`, ST.chfB)); continue; } // Summe je Knoten
      if (r.art === "kap") { add(cell(`H${kapCells.get(r.id)}`)); continue; }
      if (r.art === "zs") { at.zs = n; add(cell(`SUM(${[...kapCells.values()].map((c) => `H${c}`).join(",")})`, ST.chfB)); continue; }
      if (r.art === "rab") { (at.rab ||= []).push(n); add(cell(`-${r.basis}*${r.satz}/100`)); continue; } // Basis als Wert: Summe der Gruppen dieser Rabattgruppe
      if (r.art === "netto") { at.netto = n; add(cell(`H${at.zs}+${at.rab.map((c) => `H${c}`).join("+")}`)); continue; }
      const netto = `H${at.netto || at.zs}`;
      if (r.art === "mwst") { at.mwst = n; add(cell(`${netto}*${of.mwst}/100`)); continue; }
      const sum = at.mwst ? `${netto}+H${at.mwst}` : netto, round = `ROUND((${sum})*20,0)/20`;
      if (r.art === "rund") { add(cell(`${round}-ROUND(${netto},2)${at.mwst ? `-ROUND(H${at.mwst},2)` : ""}`)); continue; } // wie im Editor: auf den Rappen sichtbar aufgehend
      if (r.art === "total") add(cell(round, ST.chfB));
    }
    for (const t of notes) add([{ v: "" }, { v: t, s: ST.soft }]);
  }
  return rows;
}

const col = (i) => String.fromCharCode(65 + i);
function sheetXml(rows, prices) {
  const widths = [12, 38, 60, 6, 9, 7, ...(prices ? [12, 13, 11] : [11])];
  const cell = (c, i, r) => {
    const ref = `${col(i)}${r}`, s = c.s ? ` s="${c.s}"` : "";
    if (c.f) return `<c r="${ref}"${s}><f>${x(c.f)}</f><v>${c.v}</v></c>`;
    if (typeof c.v === "number") return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
    return c.v === "" ? "" : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${x(c.v)}</t></is></c>`;
  };
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>`
    + rows.map((cells, i) => `<row r="${i + 1}">${cells.map((c, j) => cell(typeof c === "string" ? { v: c } : c, j, i + 1)).join("")}</row>`).join("")
    + `</sheetData><pageSetup paperSize="9" orientation="portrait"/></worksheet>`;
}
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
  + `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>`
  + `<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF6B7785"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>`
  + `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders>`
  + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7">`
  + `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>`
  + `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>`
  + `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>`
  + `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

// Ganze Datei als Uint8Array (ZIP ohne Kompression, zip.js)
export function offerteXlsx(of, c = {}) {
  const prices = c.prices !== false, ct = "http://schemas.openxmlformats.org/", rel = `${ct}officeDocument/2006/relationships`;
  return zipFiles([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="${ct}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
      + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${ct}package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${ct}spreadsheetml/2006/main" xmlns:r="${rel}"><sheets><sheet name="Offerte" sheetId="1" r:id="rId1"/></sheets><calcPr fullCalcOnLoad="1"/></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${ct}package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", sheetXml(sheetRows(of, c), prices)],
    ["xl/styles.xml", STYLES],
  ]);
}
