// Modul «Offerten» (CJ 26.10.2026), Schritt 1: Datenmodell, BKP-Gliederung, Positionen, Summen mit Rundung. Ohne Browser, ohne Supabase.
// Eine Offerte ist ein Blatt (kind "offerte") mit den Daten in sh.of. Aufbau nach dem Messerli-Muster: BKP-Kapitel → Gruppen → Positionen.
// Pflicht sind nur Text, Menge und Preis, alle übrigen Felder dürfen fehlen (Einmannbetrieb).
// Datenformat (fehlende Felder = leer bzw. Standard):
//   of = { nid, nr, ver, datum, gueltig, art, bau, fak, ansatz, rabatt, skonto, skTage, mwst, rg: [Rabattgruppe], kap: [Kapitel] }
//   Rabattgruppe = { id, kz, name, satz }   selbst angelegt (CJ 26.10.2026), kz = Buchstabe (z. B. R, N); satz fehlt = Gesamtrabatt, 0 = kein Rabatt, Zahl = eigener Satz in %
//   Kapitel = { id, bkp, titel, grp: [Gruppe] }
//   Gruppe = { id, titel, rg, pos: [Position] }   rg = ID der Rabattgruppe, fehlt = Gesamtrabatt
//   Position = { id, titel, text, menge, eh, preis, npk, bkp, typ, form, her, enr, ek, fak, std, ic, opt, an, gl: { ogl, psl, rgl, ngl, et } }
//     id fest (ändert sich nie), preis = Einheitspreis von Hand (fehlt = aus EK × Faktor + Zeit × Ansatz), opt = optionale Position, an = Option aktiviert.

// BKP 23 nach EIT.swiss 2018 (BKP CRB 2017, erweitert): Kapitel 230 bis 239 mit allen Unterstufen (237 bis 239 seit CJ 26.10.2026). Eigene Nummern ergänzt die Offerte.
export const BKP = [
  ["23", "Elektroanlagen"],
  ["230", "Übergangsposition"],
  ["231", "Starkstromanlagen"], ["231.0", "Netzersatzanlagen"], ["231.01", "Notstromgeneratoren"], ["231.02", "USV-Anlagen"], ["231.03", "Notlichtanlagen"],
  ["231.1", "Hoch- und Mittelspannungsanlagen"], ["231.11", "Trafostationen"], ["231.2", "Schaltgerätekombinationen"], ["231.21", "Hauptverteilungen"],
  ["231.22", "Unterverteilungen"], ["231.23", "Steuerverteilungen"], ["231.3", "Blindstromkompensations-Anlagen"], ["231.4", "Sicherheitsanlagen"],
  ["231.5", "Energieerzeugungsanlagen"], ["231.51", "Photovoltaikanlagen"], ["231.9", "Übriges"],
  ["232", "Starkstrominstallationen"], ["232.0", "Erschliessungen"], ["232.01", "Hauseinführungen"], ["232.02", "Zuleitungen bis Hauptverteilungen"],
  ["232.1", "Erdungen und Schutzpotenzialausgleich"], ["232.11", "Erder"], ["232.12", "Schutz-Potenzialausgleich"], ["232.13", "Innerer Blitzschutz"], ["232.14", "Äusserer Blitzschutz"],
  ["232.2", "Rohranlagen"], ["232.3", "Installationssysteme"], ["232.31", "Kabeltrassen"], ["232.32", "Kabeltrassen mit Funktionserhalt"], ["232.33", "Bodenkanäle"],
  ["232.34", "Brüstungskanäle"], ["232.35", "Steigzonen"], ["232.36", "Steigzonen mit Funktionserhalt"], ["232.37", "Installationskanäle"],
  ["232.4", "Haupt- und Steigleitungen"], ["232.5", "Lichtinstallationen"], ["232.51", "Lichtinstallationen allgemein"], ["232.52", "Notlichtinstallationen"],
  ["232.6", "Kraftinstallationen"], ["232.7", "HLKS-Installationen"], ["232.71", "Heizungsinstallationen"], ["232.72", "Lüftungsinstallationen"], ["232.73", "Klimainstallationen"],
  ["232.74", "Sanitärinstallationen"], ["232.75", "Gewerbliche Kälteinstallationen"], ["232.76", "Rauch- und Wärmeabzugsinstallationen"], ["232.9", "Übriges"], ["232.91", "Starkstromleitungen"],
  ["233", "Leuchten und Lampen"], ["233.0", "Lieferung"], ["233.01", "Lieferung von Leuchten allgemein"], ["233.02", "Lieferung von Notleuchten"], ["233.03", "Lieferung von Aussenleuchten"],
  ["233.04", "Lieferung von Ersatzmaterial"], ["233.1", "Montage"], ["233.11", "Montage von Leuchten allgemein"], ["233.12", "Montage von Notleuchten"], ["233.13", "Montage von Aussenleuchten"],
  ["234", "Elektrogeräte"],
  ["235", "Schwachstromanlagen"], ["235.0", "Telekommunikationsanlagen"], ["235.01", "Teilnehmervermittlungsanlagen"], ["235.02", "Telekommunikation Endgeräte"],
  ["235.03", "Telekommunikation Applikationen, Lizenzen"], ["235.04", "Telekommunikation Dienstleistungen"], ["235.1", "Radio- und Fernsehanlagen"], ["235.2", "Multimediaanlagen"],
  ["235.3", "Informatikanlagen"], ["235.4", "Kommunikationsanlagen"], ["235.41", "Sonnerie-, Türsprechanlagen"], ["235.42", "Besuchermeldeanlagen"], ["235.43", "Patientenrufanlagen"],
  ["235.44", "Signalanlagen"], ["235.5", "Audio-, Video- und Uhrenanlagen"], ["235.51", "Audioanlagen"], ["235.52", "Videoanlagen"], ["235.53", "Uhrenanlagen"],
  ["235.8", "Sicherheitsanlagen"], ["235.81", "Einbruch-, Überfallmeldeanlagen"], ["235.82", "Zutrittskontrollanlagen"], ["235.83", "Videoüberwachungsanlagen"], ["235.84", "Umgebungsschutz"],
  ["235.85", "Brandmeldeanlagen"], ["235.86", "Gasmeldeanlagen"], ["235.9", "Übriges"],
  ["236", "Schwachstrominstallationen"], ["236.1", "Installationen zu Telekommunikationsanlagen"], ["236.11", "Telekommunikation Gebäudeerschliessung"],
  ["236.12", "Zuleitungen Telekommunikation-Verteiler"], ["236.13", "Telekommunikation-Verteiler"], ["236.14", "Telekommunikation-Verteilinstallationen"],
  ["236.2", "Radio- und Fernsehinstallationen"], ["236.21", "R/TV-Gebäudeerschliessung"], ["236.22", "Zuleitungen R/TV-Verteiler"], ["236.23", "R/TV-Verteiler"], ["236.24", "R/TV-Verteilinstallationen"],
  ["236.3", "Multimedia-Installationen"], ["236.31", "Multimedia-Gebäudeerschliessung"], ["236.32", "Zuleitungen Multimedia-Verteiler"], ["236.33", "Multimedia-Verteiler"], ["236.34", "Multimedia-Verteilinstallationen"],
  ["236.4", "UKV-Installationen"], ["236.41", "UKV-Gebäudeerschliessung"], ["236.42", "Zuleitungen UKV-Verteiler"], ["236.43", "UKV-Verteiler"], ["236.44", "UKV-Verteilinstallationen"], ["236.45", "UKV-Patch-, Anschlusskabel"],
  ["236.5", "Installationen zu Kommunikationsanlagen"], ["236.51", "Sonnerie-, Türsprechinstallationen"], ["236.52", "Besuchermeldeinstallationen"], ["236.53", "Patientenrufinstallationen"], ["236.54", "Signalinstallationen"],
  ["236.6", "Audio-, Video- und Uhreninstallationen"], ["236.61", "Audioinstallationen"], ["236.62", "Videoinstallationen"], ["236.63", "Uhreninstallationen"],
  ["236.7", "Sicherheitsinstallationen"], ["236.71", "Einbruch-, Überfallmeldeinstallationen"], ["236.72", "Zutrittskontrollinstallationen"], ["236.73", "Videoüberwachungsinstallationen"],
  ["236.74", "Umgebungsschutz"], ["236.75", "Brandmeldeinstallationen"], ["236.76", "Gasmeldeinstallationen"], ["236.77", "Löschinstallationen"], ["236.8", "Brandschutzinstallationen"],
  ["236.9", "Übriges"], ["236.91", "Schwachstromleitungen"],
  ["237", "Gebäudeautomations-Installationen"], ["237.1", "Gebäudeautomation-Anlagen"], ["237.2", "Gebäudeautomation-Installationen"],
  ["238", "Provisorische Installationen"],
  ["239", "Übriges"], ["239.1", "Demontagen, Entsorgungen"], ["239.2", "Diverses"], ["239.21", "Brandabschottungen, Schallschutz"], ["239.22", "Höhenzuschläge"],
  ["239.23", "Bemusterungen"], ["239.24", "Unvorhergesehenes"], ["239.25", "Unabhängige Kontrollen"], ["239.3", "Planerische Leistungen"],
];
export const bkpTitle = (nr) => BKP.find((b) => b[0] === nr)?.[1] || "";
// Hauptstufe eines Kapitels für die Summenzeile «Total … [BKP] nnn» (232.51 → 232)
export const bkpMain = (nr) => String(nr || "").split(".")[0];

export const ARTEN = { pauschal: "Pauschal", regie: "Regie", ep: "Einheitspreis", global: "Global" }; // Abrechnungsart
export const BAUARTEN = { wohn: "Wohnbau (NPK 585)", zweck: "Zweckbau (NPK 583)" };
export const TYPEN = { lp: "Leistungsposition", it: "Installationsteil", mat: "Material", regie: "Regie" }; // fehlt = Leistungsposition
export const FORMEN = { g: "geschlossen", o: "offen", r: "Reserveposition" }; // fehlt = Reserveposition (eigene Position)
export const GLIEDERUNG = { ogl: "Objekt", psl: "Lage/Geschoss", rgl: "Raum", ngl: "Nutzung", et: "Einrichtungstyp" }; // NPK-Gliederung, für IfA 18
export const DEF = { fak: 1.4, ansatz: 0, mwst: 8.1, rabatt: 0, skonto: 0 }; // Standardwerte der Offerte (Materialfaktor 1.40, MwSt 8.1 %)

// Rundung (CJ 26.10.2026): Positionen und Zwischensummen ungerundet wie im Excel (Anzeige auf den Rappen), nur das Total inkl. MwSt auf 5 Rappen.
// toFixed glättet Binärreste wie 1.005.
const rp05 = (x) => Math.round(Number((x * 20).toFixed(6))) * 5; // Franken → Rappen, auf 5 Rappen gerundet
export const round05 = (x) => rp05(x) / 100;
export const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
export const fmtNum = (x) => (isNumber(x) ? String(x) : ""); // Satz oder Faktor wie eingegeben: 8.1, 1.4
export const fmtChf = (x) => { const [a, b] = (Math.round(x * 100) / 100).toFixed(2).split("."); return `${a.replace(/\B(?=(\d{3})+(?!\d))/g, "'")}.${b}`; }; // 4'981.85

export const newOfferte = (datum = "") => ({ nid: 1, nr: "", ver: "", datum, gueltig: "", art: "", bau: "", fak: DEF.fak, ansatz: DEF.ansatz, rabatt: DEF.rabatt, skonto: DEF.skonto, mwst: DEF.mwst, rg: [], kap: [] });
const nextId = (of) => of.nid++;
export function addKapitel(of, bkp, titel) {
  const k = { id: nextId(of), bkp: String(bkp || "").trim(), titel: titel ?? bkpTitle(String(bkp || "").trim()), grp: [] };
  k.grp.push({ id: nextId(of), titel: "", pos: [] }); // eine Gruppe ohne Titel: Positionen gleich erfassen, weitere Gruppen (Raum, Wohnung) bei Bedarf
  of.kap.push(k); return k;
}
export function addRabattgruppe(of, kz = "", name = "") { const r = { id: nextId(of), kz, name }; of.rg.push(r); return r; }
// Rabattgruppe löschen: Gruppen, die sie nutzen, fallen auf den Gesamtrabatt zurück
export function delRabattgruppe(of, id) { of.rg = of.rg.filter((r) => r.id !== id); for (const k of of.kap) for (const g of k.grp) if (g.rg === id) delete g.rg; }
export const rabattgruppe = (of, g) => (g.rg ? of.rg.find((r) => r.id === g.rg) : null);
export function addGruppe(of, kap, titel = "") { const g = { id: nextId(of), titel, pos: [] }; kap.grp.push(g); return g; }
export function addPosition(of, grp, p = {}) { const n = { ...p, id: nextId(of) }; grp.pos.push(n); return n; }
// Kopie bekommt eine neue feste ID (die ID einer Position ändert sich nie und gilt nur einmal)
export const copyPosition = (of, grp, p, at = grp.pos.length) => { const n = { ...structuredClone(p), id: nextId(of) }; grp.pos.splice(at, 0, n); return n; };
export const findPos = (of, id) => { for (const k of of.kap) for (const g of k.grp) { const i = g.pos.findIndex((p) => p.id === id); if (i >= 0) return { k, g, p: g.pos[i], i }; } return null; };
export const findGrp = (of, id) => { for (const k of of.kap) { const i = k.grp.findIndex((g) => g.id === id); if (i >= 0) return { k, g: k.grp[i], i }; } return null; };

// Einheitspreis einer Position (Franken, ungerundet wie im Excel). Von Hand gesetzt gilt der Preis. Sonst Material: EK × Faktor (der Position, sonst der Offerte),
// Arbeit: Zeit × Ansatz. Regie rechnet nur Zeit × Ansatz.
export function unitRaw(p, of) {
  if (isNum(p.preis)) return p.preis;
  const t = (p.std || 0) * (of.ansatz || 0);
  return p.typ === "regie" ? t : (p.ek || 0) * (isNum(p.fak) ? p.fak : of.fak ?? DEF.fak) + t;
}
export const unitPrice = unitRaw;
// Positionsbetrag: Menge × Einheitspreis, ungerundet
export const posAmount = (p, of) => (p.menge || 0) * unitPrice(p, of);
// zählt die Position zur Angebotssumme? Optionen erst nach Aktivierung
export const counts = (p) => !p.opt || p.an === true;
// Rabattsatz einer Gruppe: aus ihrer Rabattgruppe (eigener Satz, 0 = kein Rabatt), sonst Gesamtrabatt der Offerte
export const groupRate = (g, of) => { const r = rabattgruppe(of, g); return r && isNum(r.satz) ? r.satz : of.rabatt || 0; };

// Alle Summen der Offerte in Franken. Alles ungerundet bis auf total (5 Rappen); die Anzeige rundet auf den Rappen.
export function totals(of) {
  let zs = 0, opt = 0;
  const rab = new Map(), kap = [], grp = new Map(), pos = new Map();
  for (const k of of.kap) {
    let ks = 0;
    for (const g of k.grp) {
      let gs = 0;
      for (const p of g.pos) {
        const b = posAmount(p, of); pos.set(p.id, b);
        if (counts(p)) gs += b; else opt += b;
      }
      grp.set(g.id, gs); ks += gs;
      const r = groupRate(g, of), rg = rabattgruppe(of, g), key = rg ? rg.id : 0; // je Rabattgruppe eine Zeile, ohne Gruppe: Gesamtrabatt
      if (r && gs) { const e = rab.get(key) || { satz: r, basis: 0, ...(rg ? { kz: rg.kz, name: rg.name } : {}) }; e.basis += gs; rab.set(key, e); }
    }
    kap.push({ id: k.id, bkp: k.bkp, titel: k.titel, summe: ks }); zs += ks;
  }
  const rabatt = [...rab.entries()].sort((a, b) => a[0] - b[0]).map(([, e]) => ({ ...e, betrag: e.basis * e.satz / 100 })); // Gesamtrabatt zuerst, dann Rabattgruppen in der Reihenfolge ihrer Anlage
  const rabSum = rabatt.reduce((s, e) => s + e.betrag, 0), netto = zs - rabSum, mwst = netto * (of.mwst ?? DEF.mwst) / 100, total = round05(netto + mwst);
  return { pos, grp, kap, zwischensumme: zs, rabatt, rabattTotal: rabSum, netto, mwst, total, optionen: opt,
    skonto: of.skonto ? { satz: of.skonto, tage: of.skTage || 0, betrag: total * of.skonto / 100 } : null }; // Skonto nur als Hinweis
}

// Laden: prüft und säubert die Offerte aus der Datei. Unbekannte Felder fallen weg, fehlende bleiben leer. IDs bleiben, doppelte bekommen eine neue.
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const str = (v, n = 4000) => (typeof v === "string" ? v.slice(0, n) : "");
const num = (v, lo = -1e9, hi = 1e9) => (isNum(v) && v >= lo && v <= hi ? v : undefined);
const pick = (v, set) => (typeof v === "string" && Object.hasOwn(set, v) ? v : undefined);
const put = (o, k, v) => { if (v !== undefined && v !== "") o[k] = v; };
export function cleanOfferte(o) {
  if (!o || typeof o !== "object") return newOfferte();
  const of = newOfferte(str(o.datum, 40)), seen = new Set();
  let max = 0;
  const id = (v) => { const n = Number.isInteger(v) && v > 0 && !seen.has(v) ? v : 0; if (n) { seen.add(n); max = Math.max(max, n); } return n; };
  for (const k of ["nr", "ver", "gueltig"]) of[k] = str(o[k], 200);
  of.art = pick(o.art, ARTEN) || ""; of.bau = pick(o.bau, BAUARTEN) || "";
  for (const k of ["fak", "ansatz", "rabatt", "skonto", "mwst"]) { const v = num(o[k], 0, k === "fak" ? 100 : k === "ansatz" ? 10000 : 100); of[k] = v ?? DEF[k]; }
  put(of, "skTage", num(o.skTage, 0, 365));
  for (const r of Array.isArray(o.rg) ? o.rg : []) { if (!r || typeof r !== "object") continue; const x = { id: id(r.id), kz: str(r.kz, 3), name: str(r.name, 80) }; put(x, "satz", num(r.satz, 0, 100)); if (x.id) of.rg.push(x); }
  const rgs = new Set(of.rg.map((r) => r.id));
  const late = []; // ohne gültige ID: neue Nummer nach dem Laden
  for (const rk of Array.isArray(o.kap) ? o.kap : []) {
    if (!rk || typeof rk !== "object") continue;
    const k = { id: id(rk.id), bkp: str(rk.bkp, 40), titel: str(rk.titel, 200), grp: [] };
    if (!k.id) late.push(k);
    for (const rg of Array.isArray(rk.grp) ? rk.grp : []) {
      if (!rg || typeof rg !== "object") continue;
      const g = { id: id(rg.id), titel: str(rg.titel, 200), pos: [] };
      if (!g.id) late.push(g);
      if (rgs.has(rg.rg)) g.rg = rg.rg; // Verweis auf eine Rabattgruppe, die es gibt
      for (const rp0 of Array.isArray(rg.pos) ? rg.pos : []) { if (rp0 && typeof rp0 === "object") { const p = cleanPos(rp0, id); if (!p.id) late.push(p); g.pos.push(p); } }
      k.grp.push(g);
    }
    of.kap.push(k);
  }
  of.nid = Math.max(max + 1, Number.isInteger(o.nid) ? o.nid : 1);
  for (const x of late) x.id = of.nid++;
  return of;
}
// Position prüfen und säubern (auch für die Positionsdatenbank, positionen.js). id(v) gibt die gültige ID zurück, 0 = neue Nummer.
export function cleanPos(r, id) {
  const p = { id: id(r.id) };
  for (const k of ["titel", "eh", "npk", "bkp", "her", "enr", "ic"]) put(p, k, str(r[k], 200));
  put(p, "text", str(r.text));
  for (const k of ["menge", "preis", "ek", "fak", "std"]) put(p, k, num(r[k]));
  put(p, "typ", pick(r.typ, TYPEN)); put(p, "form", pick(r.form, FORMEN));
  if (r.opt === true) { p.opt = true; if (r.an === true) p.an = true; }
  if (r.gl && typeof r.gl === "object") { const gl = {}; for (const k of Object.keys(GLIEDERUNG)) put(gl, k, str(r.gl[k], 200)); if (Object.keys(gl).length) p.gl = gl; }
  return p;
}
