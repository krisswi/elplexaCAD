// Notizen im Teilen-Link (Meilenstein 2, Schritt 2, 20.10.2026): Bereinigung wie in der Datenbank, Kennung je Blatt, Darstellung. Ohne Browser.
// Aufruf: node test/test_notizen.mjs [Ausgabe.dxf]
import assert from "node:assert";
import { cleanNote, boxOf, sheetNoteKeys, notesSVG, noteListHTML, noteViewHTML, NOTE_MAX, NAME_MAX } from "../src/notizen.js";
import { parseModel, serializeModel } from "../src/model.js";

const base = { sheet: "1", sheet_label: "Blatt 1", kind: "notiz", x: 10, y: 20, text: "Bitte FI prüfen", author: "Test Person" };
// gültig: Text und Name getrimmt, Notiz ohne Kasten
let r = cleanNote({ ...base, text: "  Bitte FI prüfen \n", author: " Test Person ", w: 5, h: 5 });
assert.deepStrictEqual(r.note, { sheet: "1", sheet_label: "Blatt 1", kind: "notiz", x: 10, y: 20, w: 0, h: 0, text: "Bitte FI prüfen", author: "Test Person" });
// Markierung behält den Kasten, Koordinaten auf 3 Stellen
r = cleanNote({ ...base, kind: "rechteck", x: 1.23456, y: -2, w: 30.5, h: 12 });
assert.deepStrictEqual([r.note.x, r.note.y, r.note.w, r.note.h], [1.235, -2, 30.5, 12]);
assert.ok(cleanNote({ ...base, kind: "kreis", w: 4, h: 4 }).note);
// Grenzen: leer, zu lang, Name, Art, Zahlen, Blatt
assert.match(cleanNote({ ...base, text: "   " }).error, /Text/);
assert.ok(cleanNote({ ...base, text: "a".repeat(NOTE_MAX) }).note, "genau 1000 Zeichen gehen");
assert.match(cleanNote({ ...base, text: "a".repeat(NOTE_MAX + 1) }).error, /zu lang/);
assert.match(cleanNote({ ...base, author: "" }).error, /Namen/);
assert.match(cleanNote({ ...base, author: "b".repeat(NAME_MAX + 1) }).error, /Name ist zu lang/);
assert.ok(cleanNote({ ...base, kind: "pfeil" }).error);
assert.ok(cleanNote({ ...base, x: NaN }).error);
assert.ok(cleanNote({ ...base, x: 2e6 }).error);
assert.ok(cleanNote({ ...base, kind: "rechteck", w: -1, h: 3 }).error);
assert.ok(cleanNote({ ...base, sheet: "" }).error);
assert.ok(cleanNote({ ...base, sheet: "x".repeat(41) }).error);
assert.strictEqual(cleanNote({ ...base, sheet_label: "L".repeat(100) }).note.sheet_label.length, 80);
// Kasten aus zwei Ecken in jeder Richtung
assert.deepStrictEqual(boxOf({ x: 10, y: 5 }, { x: 4, y: 9 }), { x: 4, y: 5, w: 6, h: 4 });

// Kennung je Blatt: wie share_open (sid, title/toc/legend, sonst n<Platz>); Zuordnung nach dem Laden über die Reihenfolge je Art
const raw = [{ kind: "title", nk: "title" }, { meta: { BLATT: "1" }, items: [], nk: "n2" }, { meta: { BLATT: "2" }, sid: 9, items: [], nk: "9" }, { kind: "pv", sid: 4, items: [], nk: "4" }, { kind: "pvtab", items: [], nk: "n5" }];
const sheets = [{ kind: "title" }, { meta: {}, sid: 11 }, { meta: {}, sid: 9 }, { kind: "pv", sid: 4 }, { kind: "pvtab" }];
const keys = sheetNoteKeys(raw, sheets);
assert.deepStrictEqual(sheets.map((s) => keys.get(s)), ["title", "n2", "9", "4", "n5"]);
assert.deepStrictEqual([...sheetNoteKeys(null, sheets).values()], ["title"], "ohne Rohdaten nur Titelseite, Inhalt, Legende");

// elplexaCAD: Schemablätter bekommen beim Laden eine feste sid (sonst nur Dispo/PV), v3 nicht
const file = JSON.stringify({ format: "schemacad", version: 6, sheets: [{ meta: { BLATT: "1" }, items: [] }, { meta: { BLATT: "2" }, sid: 3, items: [] }] });
globalThis.ELPLEXA = false;
assert.strictEqual(parseModel(file).sheets[0].sid, undefined, "v3: keine neue sid");
globalThis.ELPLEXA = true;
const d = parseModel(file);
assert.ok(d.sheets[0].sid > 0 && d.sheets[0].sid !== 3, "elplexaCAD: neue sid am Schemablatt");
assert.strictEqual(d.sheets[1].sid, 3, "vorhandene sid bleibt");
assert.ok(d.nextId > d.sheets[0].sid, "nextId über allen sid");
assert.strictEqual(JSON.parse(serializeModel(parseModel(serializeModel(d)))).sheets[0].sid, d.sheets[0].sid, "sid bleibt beim Speichern und Laden");
// Notizen kommen nie in die Datei
assert.ok(!serializeModel(d).includes("project_notes") && !("notes" in JSON.parse(serializeModel(d))));
delete globalThis.ELPLEXA;

// Darstellung: nur Notizen des offenen Blatts, Nummer = Platz in der Liste, Text maskiert
const notes = [
  { id: "a", sheet: "9", kind: "notiz", x: 10, y: 20, w: 0, h: 0, text: "<b>x</b>", author: "A & B", created_at: "2026-10-20T10:00:00Z", status: "offen", mine: true },
  { id: "b", sheet: "4", kind: "kreis", x: 0, y: 0, w: 10, h: 6, text: "PV", author: "C", created_at: "2026-10-20T11:00:00Z", status: "offen", mine: false },
  { id: "c", sheet: "9", kind: "rechteck", x: 5, y: 5, w: 10, h: 6, text: "R", author: "C", created_at: "2026-10-20T12:00:00Z", status: "erledigt", mine: false },
];
const svg = notesSVG(notes, "9", 2);
assert.ok(svg.includes('data-note="a"') && svg.includes('data-note="c"') && !svg.includes('data-note="b"'));
assert.ok(svg.includes(">1</text>") && svg.includes(">3</text>") && svg.includes("scale(0.5 -0.5)"));
assert.ok(svg.includes('<rect x="5" y="5" width="10" height="6"/>') && svg.includes("el-nmark done"));
assert.ok(notesSVG(notes, "4", 1).includes('<ellipse cx="5" cy="3" rx="5" ry="3"/>'));
assert.ok(notesSVG([], "9", 1, { kind: "rechteck", x: 1, y: 2, w: 3, h: 4 }).includes("draft"));
const list = noteListHTML(notes, (n) => (n.sheet === "4" ? null : "Blatt 2"));
assert.ok(list.includes("&lt;b&gt;x&lt;/b&gt;") && list.includes("A &amp; B") && !list.includes("<b>x"));
assert.strictEqual((list.match(/data-ndel=/g) || []).length, 1, "löschen nur eigene, offene");
assert.ok(list.includes("(nicht zu sehen)") && list.includes("disabled"), "Blatt nicht geteilt: kein Sprung");
assert.ok(noteListHTML([], () => "").includes("Noch keine Notizen"));
assert.ok(noteViewHTML(notes[0], 1, "Blatt 2").includes("data-ndel") && !noteViewHTML(notes[2], 3, "Blatt 2").includes("data-ndel"));
console.log("Notizen-Tests ok");
