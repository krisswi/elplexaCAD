// Dateien im Projekt (CJ 27.10.2026): Ordner und Dateien in der Projektdatei, Rundlauf, Abweisung ungültiger Einträge. Logik ohne Browser.
// Aufruf: node test/test_dateien.mjs
import assert from "node:assert";

globalThis.ELPLEXA = true; // Projekt in der Datei gibt es nur in elplexaCAD; vor dem Laden setzen (VERSION hängt daran), darum dynamisch importieren
const { newDoc, newSheet, parseModel, serializeModel, cleanProject, MAX_FOLDERS } = await import("../src/model.js");
const { filesHTML, hubHTML } = await import("../src/elplexa.js");

assert.strictEqual(MAX_FOLDERS, 4, "höchstens 4 Ordner");

// Ordner: höchstens 4, Name gekürzt, ungültige Kennungen fliegen raus
const p = cleanProject({ name: "A", folders: [{ id: "ab12cd", n: " Archiv " }, { id: "x" }, { id: "ef34gh", n: "Pläne" }, { id: "ij56kl", n: "B" }, { id: "mn78op", n: "C" }, { id: "qr90st", n: "D" }] });
assert.deepStrictEqual(p.folders, [{ id: "ab12cd", n: "Archiv" }, { id: "ef34gh", n: "Pläne" }, { id: "ij56kl", n: "B" }, { id: "mn78op", n: "C" }], "höchstens 4 Ordner, Name gekürzt");

// Dateien: Ordner, der nicht existiert, fällt weg; Datum und Kennung müssen stimmen
const q = cleanProject({ name: "A", folders: [{ id: "ab12cd", n: "Archiv" }], files: [
  { id: "f1f1f1", n: "Offerte.pdf", d: "2026-10-27", m: "Offerte", s: 12.6, f: "ab12cd" },
  { id: "f2f2f2", n: "Legende.pdf", d: "2026-10-27", m: "Legende", s: 3, f: "gone99" },
  { id: "bad", n: "x.pdf", d: "2026-10-27" },
  { id: "f3f3f3", n: "y.pdf", d: "27.10.2026" },
] });
assert.deepStrictEqual(q.files, [
  { id: "f1f1f1", n: "Offerte.pdf", d: "2026-10-27", m: "Offerte", s: 13, f: "ab12cd" },
  { id: "f2f2f2", n: "Legende.pdf", d: "2026-10-27", m: "Legende", s: 3 },
], "ungültige fliegen raus, unbekannter Ordner entfällt");

// Rundlauf über die Datei
const d = newDoc(); d.sheets.push(newSheet("schema"));
d.project = q;
const back = parseModel(serializeModel(d));
assert.deepStrictEqual(back.project.files, q.files, "Dateien bleiben in der Projektdatei");
assert.deepStrictEqual(back.project.folders, q.folders, "Ordner bleiben in der Projektdatei");

// Dateiversion 30 mit Dateien oder Ordnern (ältere Stände lehnen ab, statt sie still zu verlieren), ohne bleibt sie tiefer
assert.strictEqual(JSON.parse(serializeModel(d)).version, 30, "mit Dateien: Version 30");
const nur = newDoc(); nur.sheets.push(newSheet("schema")); nur.project = { name: "A", folders: [{ id: "ab12cd", n: "Archiv" }] };
assert.strictEqual(JSON.parse(serializeModel(nur)).version, 30, "nur Ordner: Version 30");
const ohne = newDoc(); ohne.sheets.push(newSheet("schema")); ohne.project = { name: "A" };
assert.ok(JSON.parse(serializeModel(ohne)).version < 30, "ohne Dateien: tiefere Version");

// Ordner löschen (app.js elFolderDel): f = undefined fällt beim Speichern weg, die Datei liegt ohne Ordner
const del = parseModel(serializeModel(d)); del.project.folders = []; for (const f of del.project.files) if (f.f === "ab12cd") f.f = undefined;
const delBack = parseModel(serializeModel(del));
assert.ok(delBack.project.files.every((f) => !("f" in f)) && !delBack.project.folders, "nach Ordner löschen: keine Zuordnung, keine Ordner");

// Anzeige: Filter nach Ordner, Ordner-Knöpfe nur bis 4
const h = filesHTML(back, {});
assert.ok(h.includes("Offerte.pdf") && h.includes("Legende.pdf"), "Alle zeigt beide");
const hf = filesHTML(back, { fFolder: "ab12cd" });
assert.ok(hf.includes("Offerte.pdf") && !hf.includes("Legende.pdf"), "Ordnerfilter");
assert.ok(h.includes("data-elfnew"), "unter 4 Ordnern: + Ordner");
const full = cleanProject({ folders: ["a1", "b2", "c3", "d4"].map((id) => ({ id: id + "xxxx", n: id })) });
assert.ok(!filesHTML({ project: full, sheets: [] }).includes("data-elfnew"), "4 Ordner: kein + Ordner mehr");

// Geteilte Ansicht: keine Dateien, kein Archiv-Schalter
const ro = hubHTML({ ...back, mods: { schema: { st: "Archiviert" } } }, { name: "T", today: "2026-10-27", label: () => "B", shared: {} });
assert.ok(!ro.includes("el-files") && !ro.includes("data-elf") && !ro.includes("data-elarch"), "geteilt: nichts von Dateien sichtbar oder ausführbar");

console.log("ok test_dateien");
