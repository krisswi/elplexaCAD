// Modul «Offerten» (CJ 26.10.2026), Schritt 1: Datenmodell, BKP-Gliederung, Positionen, Summen mit Rundung. Ohne Browser, ohne Supabase.
// Eine Offerte ist ein Blatt (kind "offerte") mit den Daten in sh.of. Aufbau (CJ 26.10.2026): Gliederung → BKP-Kapitel → Gruppen → Positionen.
// Pflicht sind nur Text, Menge und Preis, alle übrigen Felder dürfen fehlen (Einmannbetrieb).
// Datenformat (fehlende Felder = leer bzw. Standard):
//   of = { nid, nr, ver, datum, gueltig, art, bau, fak, ansatz, zf, rabatt, skonto, skTage, mwst, rg: [Rabattgruppe], kn: [Knoten], kap: [Kapitel] }
//   Rabattgruppe = { id, kz, name, satz }   selbst angelegt (CJ 26.10.2026), kz = Buchstabe (z. B. R, N); satz fehlt = Gesamtrabatt, 0 = kein Rabatt, Zahl = eigener Satz in %
//   Knoten = { id, up, art, titel }   Gliederung (CJ 26.10.2026, Dateiversion 27): flache Liste, up = oberer Knoten (fehlt = oberste Ebene), Reihenfolge der Liste gilt
//     unter Geschwistern. art = ogl, psl, rgl, ngl, et (fehlt = rgl, Raum). Keine Ebene ist Pflicht, ohne Knoten ist die Offerte wie bisher.
//   Kapitel = { id, kn, bkp, titel, grp: [Gruppe] }   kn = Knoten (fehlt = ohne Gliederung). Dieselbe BKP-Nummer darf unter mehreren Knoten stehen.
//   Gruppe = { id, titel, rg, pos: [Position] }   rg = ID der Rabattgruppe, fehlt = Gesamtrabatt
//   Position = { id, titel, text, menge, eh, preis, npk, typ, form, her, enr, ek, fak, std, ic, opt, an }
//     Gliederung und BKP erbt die Position aus Knoten und Kapitel (glOf, bkpOf: { ogl, psl, rgl, ngl, et } für IfA 18), sie trägt sie nicht selbst.
//     id fest (ändert sich nie), preis = Einheitspreis von Hand (fehlt = aus EK × Faktor + Zeit × Zeitfaktor × Ansatz), opt = optionale Position, an = Option aktiviert.
//   zf = Zeitfaktor der Offerte (CJ 26.10.2026, Dateiversion 26): wirkt auf alle Zeiten ausser Regie, fehlt = 1.

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
export const GLIEDERUNG = { ogl: "Objekt", psl: "Lage/Geschoss", rgl: "Raum", ngl: "Nutzung", et: "Einrichtungstyp" }; // Art eines Knotens, NPK-Gliederung für IfA 18
export const GL_KURZ = { ogl: "OGL", psl: "PSL", rgl: "RGL", ngl: "NGL", et: "ET" }; // Kopfzeile im Messerli-Muster: «Wohnung 1 [ET]»
export const DEF = { fak: 1.4, ansatz: 0, mwst: 8.1, rabatt: 0, skonto: 0 }; // Standardwerte der Offerte (Materialfaktor 1.40, MwSt 8.1 %)

// Rundung (CJ 26.10.2026): Positionen und Zwischensummen ungerundet wie im Excel (Anzeige auf den Rappen), nur das Total inkl. MwSt auf 5 Rappen.
// toFixed glättet Binärreste wie 1.005.
const rp05 = (x) => Math.round(Number((x * 20).toFixed(6))) * 5; // Franken → Rappen, auf 5 Rappen gerundet
export const round05 = (x) => rp05(x) / 100;
export const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
export const fmtNum = (x) => (isNumber(x) ? String(x) : ""); // Satz oder Faktor wie eingegeben: 8.1, 1.4
export const fmtChf = (x) => { const [a, b] = (Math.round(x * 100) / 100).toFixed(2).split("."); return `${a.replace(/\B(?=(\d{3})+(?!\d))/g, "'")}.${b}`; }; // 4'981.85

export const newOfferte = (datum = "") => ({ nid: 1, nr: "", ver: "", datum, gueltig: "", art: "", bau: "", fak: DEF.fak, ansatz: DEF.ansatz, rabatt: DEF.rabatt, skonto: DEF.skonto, mwst: DEF.mwst, rg: [], kn: [], kap: [] });
const nextId = (of) => of.nid++;
// kn = Knoten der Gliederung (0 = ohne Gliederung)
export function addKapitel(of, bkp, titel, kn = 0) {
  const k = { id: nextId(of), ...(kn ? { kn } : {}), bkp: String(bkp || "").trim(), titel: titel ?? bkpTitle(String(bkp || "").trim()), grp: [] };
  k.grp.push({ id: nextId(of), titel: "", pos: [] }); // eine Gruppe ohne Titel: Positionen gleich erfassen, weitere Gruppen (Raum, Wohnung) bei Bedarf
  of.kap.push(k); return k;
}
// ---------- Gliederung (Knoten) ----------
export const knArt = (n) => n.art || "rgl";
export const knFind = (of, id) => (id ? of.kn.find((n) => n.id === id) : undefined);
export const knKids = (of, id = 0) => of.kn.filter((n) => (n.up || 0) === id);
export const knLabel = (n) => `${n.titel || "Ohne Titel"} [${GL_KURZ[knArt(n)]}]`;
export const knTitel = (n) => n.titel || "Ohne Titel"; // gedruckt ohne Kürzel (NGL, ET …)
// Weg von oben bis zum Knoten (Haus A › 1. OG › Wohnzimmer)
export function knPath(of, id) { const out = []; for (let n = knFind(of, id); n && out.length <= of.kn.length; n = knFind(of, n.up)) out.unshift(n); return out; }
// IDs des Knotens und aller Knoten darunter
export function knSub(of, id) { const out = new Set([id]); for (let grow = true; grow;) { grow = false; for (const n of of.kn) if (n.up && out.has(n.up) && !out.has(n.id)) { out.add(n.id); grow = true; } } return out; }
export function addKnoten(of, up = 0, titel = "", art = "rgl") { const n = { id: nextId(of), ...(up ? { up } : {}), ...(art !== "rgl" ? { art } : {}), titel }; of.kn.push(n); return n; }
// Knoten löschen: mit allen Knoten darunter und ihren Kapiteln
export function delKnoten(of, id) { const ids = knSub(of, id); of.kn = of.kn.filter((n) => !ids.has(n.id)); of.kap = of.kap.filter((k) => !ids.has(k.kn)); }
// Knoten verschieben: up/down unter den Geschwistern, in = unter den vorherigen Geschwister, out = eine Ebene höher (nach dem bisherigen oberen Knoten).
// Gibt false zurück, wenn es nicht geht.
export function moveKnoten(of, id, how) {
  const n = knFind(of, id); if (!n) return false;
  const sib = knKids(of, n.up || 0), i = sib.indexOf(n), at = (x) => of.kn.indexOf(x);
  if (how === "up" || how === "down") { const o = sib[i + (how === "up" ? -1 : 1)]; if (!o) return false; const a = at(n), b = at(o); [of.kn[a], of.kn[b]] = [of.kn[b], of.kn[a]]; return true; }
  if (how === "in") { const prev = sib[i - 1]; if (!prev) return false; n.up = prev.id; of.kn.splice(at(n), 1); of.kn.push(n); return true; }
  if (how === "out") { const par = knFind(of, n.up); if (!par) return false; if (par.up) n.up = par.up; else delete n.up; of.kn.splice(at(n), 1); of.kn.splice(at(par) + 1, 0, n); return true; }
  return false;
}
// Reihenfolge der Offerte (Editor, PDF, Excel, Summen): zuerst die Kapitel ohne Gliederung, dann der Baum von oben nach unten, je Knoten seine Kapitel und danach
// seine Unterknoten. Einträge { t: "kn", n, lv } (Kopf), { t: "kap", k, lv }, { t: "end", n, lv } (Abschluss des Knotens, für «Total …»).
// root = nur dieser Knoten mit allem darunter (0 = ganze Offerte), all = auch Knoten ohne Kapitel (Editor).
export function outline(of, { root = 0, all = false } = {}) {
  const out = [], own = (id) => of.kap.filter((k) => (k.kn || 0) === id);
  const has = (id) => own(id).length > 0 || knKids(of, id).some((c) => has(c.id));
  const node = (n, lv) => {
    if (!all && !has(n.id)) return;
    out.push({ t: "kn", n, lv });
    for (const k of own(n.id)) out.push({ t: "kap", k, lv: lv + 1 });
    for (const c of knKids(of, n.id)) node(c, lv + 1);
    out.push({ t: "end", n, lv });
  };
  const r = knFind(of, root);
  if (r) node(r, 0);
  else { for (const k of own(0)) out.push({ t: "kap", k, lv: 0 }); for (const n of knKids(of)) node(n, 0); }
  return out;
}
export const kapOrder = (of) => outline(of).filter((e) => e.t === "kap").map((e) => e.k);
// Vererbung: Gliederung und BKP einer Position aus ihrem Knoten und Kapitel. Haben zwei Knoten auf dem Weg dieselbe Art, gilt der untere.
export function glOf(of, pid) { const f = findPos(of, pid), gl = {}; if (f) for (const n of knPath(of, f.k.kn)) if (n.titel) gl[knArt(n)] = n.titel; return gl; }
export const bkpOf = (of, pid) => findPos(of, pid)?.k.bkp || "";

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

// Ziehen (CJ 26.10.2026): Position in eine Gruppe vor die Position before (null = ans Ende), auch über Gruppen und Kapitel hinweg.
// Gruppe in ein Kapitel vor die Gruppe before. Die feste ID bleibt. Gibt false zurück, wenn nichts zu tun ist.
export function movePos(of, pid, gid, before = null) {
  const f = findPos(of, pid), to = findGrp(of, gid)?.g;
  if (!f || !to || pid === before) return false;
  f.g.pos.splice(f.i, 1);
  const at = before === null ? -1 : to.pos.findIndex((p) => p.id === before);
  to.pos.splice(at < 0 ? to.pos.length : at, 0, f.p);
  return true;
}
export function moveGrp(of, gid, kid, before = null) {
  const f = findGrp(of, gid), to = of.kap.find((k) => k.id === kid);
  if (!f || !to || gid === before) return false;
  f.k.grp.splice(f.i, 1);
  const at = before === null ? -1 : to.grp.findIndex((g) => g.id === before);
  to.grp.splice(at < 0 ? to.grp.length : at, 0, f.g);
  return true;
}

// Einheitspreis einer Position (Franken, ungerundet wie im Excel). Von Hand gesetzt gilt der Preis. Sonst Material: EK × Faktor (der Position, sonst der Offerte),
// Arbeit: Zeit × Zeitfaktor × Ansatz. Regie rechnet nur Zeit × Ansatz (Regiestunden sind tatsächliche Stunden, ohne Zeitfaktor).
export function unitRaw(p, of) {
  if (isNum(p.preis)) return p.preis;
  if (p.typ === "regie") return (p.std || 0) * (of.ansatz || 0);
  return (p.ek || 0) * (isNum(p.fak) ? p.fak : of.fak ?? DEF.fak) + (p.std || 0) * zeitfaktor(of) * (of.ansatz || 0);
}
export const unitPrice = unitRaw;
export const zeitfaktor = (of) => (isNum(of.zf) && of.zf > 0 ? of.zf : 1);
// Positionsbetrag: Menge × Einheitspreis, ungerundet
export const posAmount = (p, of) => (p.menge || 0) * unitPrice(p, of);
// zählt die Position zur Angebotssumme? Optionen erst nach Aktivierung
export const counts = (p) => !p.opt || p.an === true;
// Rabattsatz einer Gruppe: aus ihrer Rabattgruppe (eigener Satz, 0 = kein Rabatt), sonst Gesamtrabatt der Offerte
export const groupRate = (g, of) => { const r = rabattgruppe(of, g); return r && isNum(r.satz) ? r.satz : of.rabatt || 0; };

// Alle Summen der Offerte in Franken. Alles ungerundet bis auf total (5 Rappen); die Anzeige rundet auf den Rappen.
export function totals(of) {
  let zs = 0, opt = 0;
  const rab = new Map(), kap = [], kapSum = new Map(), kn = new Map(), grp = new Map(), pos = new Map();
  for (const k of kapOrder(of)) {
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
    kap.push({ id: k.id, bkp: k.bkp, titel: k.titel, summe: ks }); kapSum.set(k.id, ks); zs += ks;
    for (const n of knPath(of, k.kn)) kn.set(n.id, (kn.get(n.id) || 0) + ks); // Summe je Knoten mit allem darunter
  }
  const rabatt = [...rab.entries()].sort((a, b) => a[0] - b[0]).map(([, e]) => ({ ...e, betrag: e.basis * e.satz / 100 })); // Gesamtrabatt zuerst, dann Rabattgruppen in der Reihenfolge ihrer Anlage
  const rabSum = rabatt.reduce((s, e) => s + e.betrag, 0), netto = zs - rabSum, mwst = netto * (of.mwst ?? DEF.mwst) / 100, total = round05(netto + mwst);
  return { pos, grp, kap, kapSum, kn, zwischensumme: zs, rabatt, rabattTotal: rabSum, netto, mwst, total, optionen: opt,
    skonto: of.skonto ? { satz: of.skonto, tage: of.skTage || 0, betrag: total * of.skonto / 100 } : null }; // Skonto nur als Hinweis
}

// Schlusszusammenstellung als Zeilen (Editor, PDF und Excel, Schritt 5): { text, betrag, art } mit art = kn (Summe je Knoten), kap, zs, rab, netto, mwst, rund, total.
// kn und kap tragen id und lv (Einzug nach der Gliederung).
// betrag in Franken (Rabatt negativ). notes: Skonto-Hinweis und Optionen (nicht in der Angebotssumme).
export const totalLabel = (of) => (of.mwst ? "Total inkl. MwSt" : "Total ohne MwSt"); // MwSt nur am Schluss, aus = Satz 0
export function summaryRows(of, t = totals(of)) {
  const rows = [];
  for (const e of outline(of)) {
    if (e.t === "kn") rows.push({ art: "kn", id: e.n.id, lv: e.lv, text: knTitel(e.n), betrag: t.kn.get(e.n.id) || 0 });
    else if (e.t === "kap") rows.push({ art: "kap", id: e.k.id, lv: e.lv, text: e.k.bkp ? `BKP ${e.k.bkp} ${e.k.titel}`.trim() : e.k.titel || "Ohne BKP", betrag: t.kapSum.get(e.k.id) || 0 });
  }
  rows.push({ art: "zs", text: "Zwischensumme", betrag: t.zwischensumme });
  for (const r of t.rabatt) rows.push({ art: "rab", text: `Rabatt${r.kz || r.name ? ` ${[r.kz, r.name].filter(Boolean).join(" ")}` : ""} ${fmtNum(r.satz)} % auf ${fmtChf(r.basis)}`, betrag: -r.betrag, satz: r.satz, basis: r.basis });
  if (t.rabatt.length) rows.push({ art: "netto", text: "Total nach Rabatt", betrag: t.netto });
  if (of.mwst) rows.push({ art: "mwst", text: `MwSt ${fmtNum(of.mwst)} %`, betrag: t.mwst });
  const c = (x) => Math.round(x * 100), rd = c(t.total) - c(t.netto) - c(t.mwst); // Rundung auf 5 Rappen, damit die Zeilen sichtbar aufgehen
  if (rd) rows.push({ art: "rund", text: "Rundung", betrag: rd / 100 });
  rows.push({ art: "total", text: totalLabel(of), betrag: t.total });
  const notes = [];
  if (t.skonto) notes.push(`Skonto ${fmtNum(t.skonto.satz)} %${t.skonto.tage ? ` bei Zahlung innert ${t.skonto.tage} Tagen` : ""}: CHF ${fmtChf(t.skonto.betrag)}`);
  if (t.optionen) notes.push(`Optionen (nicht in der Angebotssumme): CHF ${fmtChf(t.optionen)}`);
  return { rows, notes };
}
// Betrag mit Vorzeichen für die Anzeige: − 12.50
export const fmtSigned = (x) => (Math.round(x * 100) < 0 ? `− ${fmtChf(-x)}` : fmtChf(x));
// Positionsnummer wie im Editor: NPK-Nr. oder Kapitel.Gruppe.Position (Kapitel gezählt in der Reihenfolge der Offerte, kapOrder)
export const posNo = (p, ki, gi, pi) => p.npk || `${ki + 1}.${gi + 1}.${pi + 1}`;

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
  const zf = num(o.zf, 0.01, 10); if (zf !== undefined && zf !== 1) of.zf = zf;
  for (const r of Array.isArray(o.rg) ? o.rg : []) { if (!r || typeof r !== "object") continue; const x = { id: id(r.id), kz: str(r.kz, 3), name: str(r.name, 80) }; put(x, "satz", num(r.satz, 0, 100)); if (x.id) of.rg.push(x); }
  const rgs = new Set(of.rg.map((r) => r.id));
  // Gliederung: Knoten ohne gültige ID fallen weg (Kapitel verweisen auf sie), oberer Knoten nur, wenn es ihn gibt und kein Kreis entsteht
  const rkn = (Array.isArray(o.kn) ? o.kn : []).filter((r) => r && typeof r === "object").map((r) => [r, { id: id(r.id) }]).filter(([, n]) => n.id);
  const kns = new Set(rkn.map(([, n]) => n.id));
  for (const [r, n] of rkn) { if (kns.has(r.up) && r.up !== n.id) n.up = r.up; const a = pick(r.art, GLIEDERUNG); if (a && a !== "rgl") n.art = a; n.titel = str(r.titel, 200); of.kn.push(n); }
  for (const n of of.kn) { let x = n, i = 0; while (x?.up && i++ <= of.kn.length) x = knFind(of, x.up); if (i > of.kn.length) delete n.up; }
  const late = []; // ohne gültige ID: neue Nummer nach dem Laden
  for (const rk of Array.isArray(o.kap) ? o.kap : []) {
    if (!rk || typeof rk !== "object") continue;
    const k = { id: id(rk.id), ...(kns.has(rk.kn) ? { kn: rk.kn } : {}), bkp: str(rk.bkp, 40), titel: str(rk.titel, 200), grp: [] };
    if (!k.id) late.push(k);
    for (const rg of Array.isArray(rk.grp) ? rk.grp : []) {
      if (!rg || typeof rg !== "object") continue;
      const g = { id: id(rg.id), titel: str(rg.titel, 200), pos: [] };
      if (!g.id) late.push(g);
      if (rgs.has(rg.rg)) g.rg = rg.rg; // Verweis auf eine Rabattgruppe, die es gibt
      for (const rp0 of Array.isArray(rg.pos) ? rg.pos : []) { if (rp0 && typeof rp0 === "object") { const p = cleanPos(rp0, id); delete p.gl; delete p.bkp; if (!p.id) late.push(p); g.pos.push(p); } } // Gliederung und BKP erbt die Position
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
