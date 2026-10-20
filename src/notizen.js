// Notizen und Markierungen im Teilen-Link (Meilenstein 2, Schritt 2, CJ 20.10.2026). Nur elplexaCAD, nur Funktionen ohne Zustand.
// Notizen liegen nur in der Datenbank (Tabelle project_notes), nie in der Datei, nie im PDF oder DXF. Lage im Blattmass (Weltkoordinaten
// des Blatts, y nach oben): Notiz = Punkt x, y; Markierung (kreis, rechteck) = Kasten x, y (linke untere Ecke), w, h.
import { esc } from "./render.js";

export const NOTE_MAX = 1000, NAME_MAX = 60, NOTE_KINDS = ["notiz", "kreis", "rechteck"];
const LIM = 1e6; // wie die Prüfung in der Datenbank

// Eingabe prüfen und bereinigen wie die Datenbank (share_note_add). Ergebnis { note } oder { error } (Text für die Meldung).
export function cleanNote(n) {
  const text = String(n?.text ?? "").trim(), author = String(n?.author ?? "").trim();
  if (!text) return { error: "Bitte einen Text eingeben." };
  if (text.length > NOTE_MAX) return { error: `Der Text ist zu lang (höchstens ${NOTE_MAX} Zeichen).` };
  if (!author) return { error: "Bitte deinen Namen eingeben." };
  if (author.length > NAME_MAX) return { error: `Der Name ist zu lang (höchstens ${NAME_MAX} Zeichen).` };
  if (!NOTE_KINDS.includes(n.kind)) return { error: "Unbekannte Art." };
  const num = (v) => Math.round(Number(v) * 1000) / 1000;
  const x = num(n.x), y = num(n.y), pt = n.kind === "notiz";
  const w = pt ? 0 : num(n.w), h = pt ? 0 : num(n.h);
  if (![x, y, w, h].every((v) => Number.isFinite(v) && Math.abs(v) <= LIM) || w < 0 || h < 0) return { error: "Die Stelle liegt ausserhalb des Blatts." };
  const sheet = String(n.sheet ?? "");
  if (!sheet || sheet.length > 40) return { error: "Das Blatt ist unbekannt." };
  return { note: { sheet, sheet_label: String(n.sheet_label ?? "").slice(0, 80), kind: n.kind, x, y, w, h, text, author } };
}

// Kasten aus zwei Ecken (Ziehen in beliebiger Richtung)
export const boxOf = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });

// Notiz-Kennung je Blatt: share_open liefert sie als `nk` an den Rohblättern (sid, sonst title/toc/legend, sonst n<Platz>). Beim Laden
// entstehen neue Blatt-Objekte (parseModel), daher Zuordnung über die Reihenfolge je Blattart. Ergebnis: Map Blatt → Kennung.
export function sheetNoteKeys(raw, sheets) {
  const by = new Map(), out = new Map();
  for (const r of raw || []) { const k = r?.kind || "schema"; if (!by.has(k)) by.set(k, []); by.get(k).push(r?.nk); }
  const seen = new Map();
  for (const sh of sheets) {
    if (["title", "toc", "legend"].includes(sh.kind)) { out.set(sh, sh.kind); continue; } // je Projekt höchstens einmal, auch wenn die App sie erst beim Laden anlegt
    const k = sh.kind || "schema", i = seen.get(k) || 0; seen.set(k, i + 1);
    const nk = by.get(k)?.[i];
    if (nk != null && nk !== "") out.set(sh, String(nk));
  }
  return out;
}

// Ebene über der Zeichnung. z = Zoom (px je Einheit): Stecknadeln und Nummern bleiben auf dem Bildschirm gleich gross.
// notes = alle Notizen zum Link (Nummer = Platz in der Liste + 1), key = Kennung des offenen Blatts, draft = Markierung im Ziehen.
export function notesSVG(notes, key, z, draft = null) {
  // Stecknadel: Spitze auf dem Punkt (tail), sonst Nummer an der Ecke der Markierung; scale mit −k dreht die Schrift wieder aufrecht
  const k = 1 / z, label = (x, y, n, cls, tail = false) => `<g class="el-npin ${cls}" transform="translate(${x} ${y}) scale(${k} ${-k})${tail ? " translate(0 -24)" : ""}">${tail ? `<path d="M-6 8 L0 24 L6 8 Z"/>` : ""}<circle r="11"/><text text-anchor="middle" dominant-baseline="central">${n}</text></g>`;
  let s = "";
  notes.forEach((n, i) => {
    if (n.sheet !== key) return;
    const cls = (n.status === "erledigt" ? "done" : "") + (n.mine ? " mine" : "");
    const hit = `data-note="${esc(n.id)}"`;
    if (n.kind === "notiz") { s += `<g ${hit} class="el-note-g" role="button" aria-label="Notiz ${i + 1}">${label(n.x, n.y, i + 1, cls, true)}</g>`; return; }
    const shape = n.kind === "kreis" ? `<ellipse cx="${n.x + n.w / 2}" cy="${n.y + n.h / 2}" rx="${n.w / 2}" ry="${n.h / 2}"/>` : `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}"/>`;
    s += `<g ${hit} class="el-note-g el-nmark ${cls}" role="button" aria-label="Markierung ${i + 1}">${shape}${label(n.x, n.y + n.h, i + 1, cls)}</g>`;
  });
  if (draft) s += `<g class="el-nmark draft">${draft.kind === "kreis" ? `<ellipse cx="${draft.x + draft.w / 2}" cy="${draft.y + draft.h / 2}" rx="${draft.w / 2}" ry="${draft.h / 2}"/>` : `<rect x="${draft.x}" y="${draft.y}" width="${draft.w}" height="${draft.h}"/>`}</g>`;
  return s;
}

const fmt = (t) => new Date(t).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const KIND_LABEL = { notiz: "Notiz", kreis: "Markierung (Kreis)", rechteck: "Markierung (Rechteck)" };

// Werkzeugleiste in der geteilten Ansicht. tool = null | "notiz" | "kreis" | "rechteck"; off = Link nicht mehr gültig.
export function noteBarHTML(tool, count, off) {
  const b = (t, label, keyc, extra = "") => `<button class="btn small${tool === t || (t === "mark" && (tool === "kreis" || tool === "rechteck")) ? " on" : ""}" data-elnote="${t}" aria-pressed="${tool === t || (t === "mark" && (tool === "kreis" || tool === "rechteck"))}" title="${label} (${keyc})"${off ? " disabled" : ""}>${label}${extra}</button>`;
  return `${b("notiz", "Notiz", "N")}${b("mark", tool === "kreis" ? "Kreis" : "Rechteck", "M, nochmals M wechselt")}<button class="btn small" data-elnote="liste" title="Liste der Notizen (L)">Notizen <span class="el-ncount">${count}</span></button>`;
}

// Fenster: Text eingeben. name = gemerkter Gast-Name (leer = Feld zeigen).
export function noteFormHTML(kind, name, text = "", msg = "", author = "") {
  return `<p>${kind === "notiz" ? "Notiz an dieser Stelle." : "Markierung mit Text."} Alle mit diesem Link sehen sie, die Zeichnung bleibt unverändert.</p>
    ${name ? "" : `<div class="field"><label>Dein Name</label><input type="text" data-nf="author" maxlength="${NAME_MAX}" value="${esc(author)}" autocomplete="name" spellcheck="false"></div>`}
    <div class="field"><label>Text</label><textarea data-nf="text" rows="4" maxlength="${NOTE_MAX}">${esc(text)}</textarea></div>
    ${msg ? `<p class="el-nmsg" role="alert">${esc(msg)}</p>` : ""}
    <div class="actions"><button class="btn outline" data-c>Abbrechen</button><button class="btn primary" data-ok>Speichern</button></div>`;
}

// Fenster: eine Notiz ansehen (Klick auf die Stecknadel). Löschen nur eigene und offene.
export function noteViewHTML(n, nr, sheetName) {
  return `<p class="el-nmeta">${esc(KIND_LABEL[n.kind] || "Notiz")} ${nr} · ${esc(sheetName)} · ${esc(n.author)} · ${fmt(n.created_at)}${n.status === "erledigt" ? " · erledigt" : ""}</p>
    <p class="el-ntext">${esc(n.text)}</p>
    <div class="actions">${n.mine && n.status !== "erledigt" ? `<button class="btn outline el-danger" data-ndel="${esc(n.id)}">Löschen</button>` : ""}<button class="btn primary" data-c>Schliessen</button></div>`;
}

// Fenster: Liste aller Notizen zum Link. sheetName(n) = Blattname oder null (Blatt nicht geteilt oder nicht mehr da).
export function noteListHTML(notes, sheetName) {
  const rows = notes.length ? notes.map((n, i) => { const sn = sheetName(n);
    return `<div class="el-nrow"><button class="el-nitem" data-ngo="${esc(n.id)}"${sn ? "" : " disabled"}><span class="el-nnr">${i + 1}</span><span class="el-nt"><span class="el-nmeta">${esc(sn || `${n.sheet_label || "Blatt"} (nicht zu sehen)`)} · ${esc(n.author)} · ${fmt(n.created_at)}${n.status === "erledigt" ? " · erledigt" : ""}</span><span class="el-ntx">${esc(n.text)}</span></span></button>${n.mine && n.status !== "erledigt" ? `<button class="btn icon el-tdel" data-ndel="${esc(n.id)}" title="Eigene Notiz löschen" aria-label="Notiz ${i + 1} löschen"><span aria-hidden="true">×</span></button>` : ""}</div>`; }).join("")
    : `<p class="el-note">Noch keine Notizen. Mit N eine Notiz setzen, mit M eine Markierung aufziehen.</p>`;
  return `<div class="el-nlist">${rows}</div><div class="actions"><button class="btn primary" data-c>Schliessen</button></div>`;
}

// Meldungen zu Gründen aus der Datenbank
export const NOTE_GRUND = {
  link: "Der Link ist nicht mehr gültig (widerrufen oder abgelaufen). Die Notiz wurde nicht gespeichert.",
  voll: "Zu diesem Link gibt es schon 300 Notizen, mehr gehen nicht.",
  zu_schnell: "Zu viele Notizen in kurzer Zeit. Bitte in ein paar Minuten nochmals versuchen.",
  eingabe: "Die Eingabe ist ungültig (Text oder Name zu lang oder leer).",
  fehlt: "Diese Notiz gibt es nicht mehr oder sie ist schon erledigt.",
};
