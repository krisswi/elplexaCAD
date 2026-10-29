// Pläne für den Monteur (CJ 28.10.2026, nur elplexaCAD): reine Funktionen ohne DOM und ohne Netz, für die Monteur-Ansicht (monteur.js),
// das Plan-Modul beim Planer (elmonteur.js) und die node-Tests. Datenbank: Migration 20261028_monteur (shares, share_releases, share_notes).

export const NOTE_MAX = 1000, NAME_MAX = 60, NR_MAX = 9999;

// Nummer wie sh_nr in der Datenbank: Wunsch (offline vergeben), wenn frei, sonst eins mehr als die höchste. nrs = vergebene Nummern im Blatt.
export function srvNr(nrs, want) {
  const have = new Set(nrs);
  if (Number.isInteger(want) && want >= 1 && want <= NR_MAX && !have.has(want)) return want;
  return Math.max(0, ...have) + 1;
}
// Nächste Nummer auf dem Gerät: eins mehr als die höchste bekannte im Blatt (auch ungesendete). Lücken bleiben, Nummern bleiben fest.
export const nextNr = (notes, sheet) => Math.max(0, ...notes.filter((n) => n.sheet === sheet).map((n) => n.nr)) + 1;

// Plantitel im Schieber: ohne «Plan» am Anfang («Plan EG» → «EG», «Plan» allein → bleibt)
export function planTitle(s) {
  const t = String(s ?? "").trim(), r = t.replace(/^plan\b[\s:·–-]*/i, "").trim();
  return r && !/^\d+$/.test(r) ? r : t; // «Plan 2» bleibt (nur eine Nummer)
}
// Name eines Plans für den Monteur (CJ 29.10.2026: wie in der Projektübersicht). mod = eigener Modulname (leer = Standard), def = Standardname
// des Moduls («Plan», «Plan 2»), title = Blatttitel, label = «Plan 3», many = das Modul hat mehrere Pläne.
// Ein Plan im Modul: eigener Modulname, sonst Blatttitel, sonst Standardname. Mehrere: Blatttitel, sonst Modulname · Blattnummer.
export function sheetTitle({ mod, def, title, label, many }) {
  const m = String(mod || "").trim(), t = String(title || "").trim();
  return planTitle(many ? t || `${m || def} · ${label}` : m || t || def);
}

// Datum und Zeit für Band und Notizen (Schweizer Schreibweise, Ortszeit)
const two = (n) => String(n).padStart(2, "0");
export function fmtDay(iso, year = false) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "";
  return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${year ? d.getFullYear() : ""}`;
}
export function fmtStamp(iso) { const d = new Date(iso); return Number.isNaN(+d) ? "" : `${fmtDay(iso)} ${two(d.getHours())}:${two(d.getMinutes())}`; }

// Status am Projekt (Übersicht, Fenster): share = Zeile aus shares oder null
export function shareStatus(share, now = Date.now()) {
  if (!share || share.revoked_at || Date.parse(share.expires_at) <= now) return { on: false, text: "Nicht geteilt" };
  return { on: true, text: share.rev ? `Geteilt · Stand ${share.rev}` : "Geteilt · noch nicht veröffentlicht" };
}
// Zustand neben «Veröffentlichen» im Plan-Modul. pub = { rev, at, hash } (null = nie), hash = Fingerabdruck des jetzigen Stands, open = unveröffentlichte Planer-Notizen
export function pubState(pub, hash, open = 0) {
  const changed = !pub?.rev || pub.hash !== hash;
  const parts = [changed ? (pub?.rev ? "Änderungen noch nicht veröffentlicht" : "Noch nicht veröffentlicht") : `Veröffentlicht ${fmtStamp(pub.at)}, Stand ${pub.rev}`];
  if (open) parts.push(`${open} ${open === 1 ? "Notiz" : "Notizen"} noch nicht veröffentlicht`);
  return { hot: changed || open > 0, lines: parts, sub: !changed ? "" : pub?.rev ? `Zuletzt Stand ${pub.rev} vom ${fmtStamp(pub.at)}` : "" };
}

// Fingerabdruck (FNV-1a, 2 × 32 Bit) für «Änderungen noch nicht veröffentlicht»: gleicher Text = gleicher Wert
export function fingerprint(s) {
  let a = 0x811c9dc5, b = 0x9747b28c;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x5bd1e995); b ^= b >>> 13; }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

// Ablauf im Fenster «Link für Monteur»: 7 / 30 Tage oder bis Bauende (Datum). Ergebnis ISO-Zeit oder null (Datum fehlt, liegt zurück)
export function expiryOf(kind, date, now = Date.now()) {
  if (kind === "7" || kind === "30") return new Date(now + Number(kind) * 864e5).toISOString();
  const t = Date.parse(`${date}T23:59:59`);
  return Number.isFinite(t) && t > now ? new Date(t).toISOString() : null;
}

// Notiz prüfen wie die Datenbank (Länge 1 bis 1000, Name 1 bis 60). Ergebnis Text der Meldung oder "".
export function noteError(text, author) {
  const t = String(text ?? "").trim(), a = String(author ?? "").trim();
  if (!t) return "Bitte einen Text schreiben.";
  if (t.length > NOTE_MAX) return `Der Text ist zu lang (höchstens ${NOTE_MAX} Zeichen).`;
  if (!a) return "Bitte den Namen eingeben.";
  if (a.length > NAME_MAX) return `Der Name ist zu lang (höchstens ${NAME_MAX} Zeichen).`;
  return "";
}

// ---------- Warteschlange (offline gesetzt, bearbeitet, gelöscht) ----------
// Einträge in Reihenfolge: { op: "add", id: "t-…", sheet, nr, x, y, text, author, rev, mod } | { op: "edit", id, text?, x?, y? } | { op: "del", id }.
// Ungesendete neue Notizen haben eine Kennung "t-…". Bearbeiten oder Löschen einer ungesendeten Notiz ändert nur den add-Eintrag.
export const isTmp = (id) => String(id).startsWith("t-");
export function enqueue(queue, e) {
  const q = queue.map((x) => ({ ...x }));
  if (e.op === "add") return [...q, { ...e }];
  const add = q.find((x) => x.op === "add" && x.id === e.id);
  if (add) {
    if (e.op === "del") return q.filter((x) => x.id !== e.id);
    for (const k of ["text", "x", "y"]) if (e[k] != null) add[k] = e[k];
    return q;
  }
  if (e.op === "del") return [...q.filter((x) => x.id !== e.id), { op: "del", id: e.id }];
  const ed = q.find((x) => x.op === "edit" && x.id === e.id);
  if (ed) { for (const k of ["text", "x", "y"]) if (e[k] != null) ed[k] = e[k]; return q; }
  return [...q, { op: "edit", id: e.id, ...(e.text != null ? { text: e.text } : {}), ...(e.x != null ? { x: e.x, y: e.y } : {}) }];
}
// Was das Gerät zeigt: Notizen vom Server mit der Warteschlange darüber. pend = noch nicht gesendet.
export function withQueue(notes, queue) {
  let out = notes.map((n) => ({ ...n }));
  for (const e of queue) {
    if (e.op === "add") out.push({ id: e.id, mod: e.mod || "plan", sheet: e.sheet, nr: e.nr, von: "monteur", x: e.x, y: e.y, text: e.text, author: e.author, rev: e.rev, status: "offen", created_at: e.at, updated_at: e.at, mine: true, pend: true });
    else if (e.op === "del") out = out.filter((n) => n.id !== e.id);
    else { const n = out.find((x) => x.id === e.id); if (n) Object.assign(n, e.text != null ? { text: e.text } : {}, e.x != null ? { x: e.x, y: e.y } : {}, { pend: true }); }
  }
  return out;
}
// Zähler «x/n» am Knopf Notizen: x = ungesendete Notizen in diesem Plan, n = Notizen dieses Geräts im Plan (gesendet und ungesendet)
export function queueCount(notes, queue, sheet) {
  const shown = withQueue(notes, queue).filter((n) => n.sheet === sheet);
  const sheetOf = (id) => shown.find((n) => n.id === id)?.sheet ?? notes.find((n) => n.id === id)?.sheet;
  const ids = new Set(queue.filter((e) => (e.op === "add" ? e.sheet : sheetOf(e.id)) === sheet).map((e) => e.id));
  return { x: ids.size, n: shown.filter((n) => n.mine).length + queue.filter((e) => e.op === "del" && ids.has(e.id) && notes.find((n) => n.id === e.id)?.mine).length };
}
// Nach dem Senden eines add: Kennung "t-…" in späteren Einträgen durch die vom Server ersetzen
export const swapId = (queue, tmp, id) => queue.map((e) => (e.id === tmp ? { ...e, id } : e));

// ---------- Marken bündeln ----------
// pts = [{ id, x, y }] in Bildschirm-Pixeln; gap = Abstand, unter dem Marken zu einer werden; solo = Kennungen, die nie gebündelt werden
// (offene Notiz, Marke beim Verschieben). Ergebnis [{ x, y, ids }] mit x, y der ersten Marke der Gruppe.
export function clusterMarks(pts, gap = 40, solo = new Set()) {
  const groups = [];
  for (const p of pts) {
    const g = solo.has(p.id) ? null : groups.find((q) => !q.solo && Math.hypot(q.x - p.x, q.y - p.y) < gap);
    if (g) g.ids.push(p.id); else groups.push({ x: p.x, y: p.y, ids: [p.id], solo: solo.has(p.id) });
  }
  return groups.map(({ x, y, ids }) => ({ x, y, ids }));
}
// Beschriftung einer gebündelten Marke: «5 6», ab vier «3 5 +2»
export const clusterLabel = (nrs) => { const s = [...nrs].sort((a, b) => a - b); return s.length > 3 ? `${s.slice(0, 2).join(" ")} +${s.length - 2}` : s.join(" "); };

// Seite ↔ Welt: Plan-Druckseite (planedit.js releaseSheet) mit tr = { cx, cy, den, mx, my } und Seitenhöhe h (mm). Seite: y nach unten.
export const worldToPage = (tr, h, x, y) => ({ u: tr.cx + (x - tr.mx) / tr.den, v: h - (tr.cy + (y - tr.my) / tr.den) });
export const pageToWorld = (tr, h, u, v) => ({ x: Math.round((tr.mx + (u - tr.cx) * tr.den) * 10) / 10, y: Math.round((tr.my + (h - v - tr.cy) * tr.den) * 10) / 10 });
