// Dateien im Projekt (CJ 27.10.2026): Ordner und Dateien in der Projektdatei, Rundlauf, Abweisung ungültiger Einträge. Logik ohne Browser.
// Aufruf: node test/test_dateien.mjs
import assert from "node:assert";

globalThis.ELPLEXA = true; // Projekt in der Datei gibt es nur in elplexaCAD
import { newDoc, newSheet, parseModel, serializeModel, cleanProject, MAX_FOLDERS } from "../src/model.js";
import { filesHTML } from "../src/elplexa.js";

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

// Anzeige: Filter nach Ordner, Ordner-Knöpfe nur bis 4
const h = filesHTML(back, {});
assert.ok(h.includes("Offerte.pdf") && h.includes("Legende.pdf"), "Alle zeigt beide");
const hf = filesHTML(back, { fFolder: "ab12cd" });
assert.ok(hf.includes("Offerte.pdf") && !hf.includes("Legende.pdf"), "Ordnerfilter");
assert.ok(h.includes("data-elfnew"), "unter 4 Ordnern: + Ordner");
const full = cleanProject({ folders: ["a1", "b2", "c3", "d4"].map((id) => ({ id: id + "xxxx", n: id })) });
assert.ok(!filesHTML({ project: full, sheets: [] }).includes("data-elfnew"), "4 Ordner: kein + Ordner mehr");

console.log("ok test_dateien");
