// Pläne für den Monteur (CJ 28.10.2026): Nummernvergabe wie sh_nr, Warteschlange und Zähler «x/n», Plantitel, Bündeln der Marken,
// Zustand «Veröffentlichen», Seite ↔ Welt. Ohne Browser. Aufruf: node test/test_monteur.mjs [Ausgabe.dxf]
import assert from "node:assert";
import * as K from "../src/monteur-kern.js";

// Nummer wie sh_nr: Wunsch, wenn frei, sonst höchste + 1 (Lücken bleiben, keine Reservierung)
assert.strictEqual(K.srvNr([], 1), 1);
assert.strictEqual(K.srvNr([1, 2, 3], 4), 4);
assert.strictEqual(K.srvNr([1, 2, 7], 7), 8, "Kollision: nächste freie über der höchsten");
assert.strictEqual(K.srvNr([1, 5], 3), 3, "Lücke ist frei, wenn gewünscht");
assert.strictEqual(K.srvNr([1, 5], null), 6, "Planer ohne Wunsch: höchste + 1");
assert.strictEqual(K.srvNr([2], 0), 3);
assert.strictEqual(K.srvNr([2], 10000), 3, "Wunsch ausserhalb 1–9999");
// zwei Geräte offline mit derselben Nummer: das zweite bekommt die nächste
const srv = []; for (const want of [7, 7]) srv.push(K.srvNr(srv, want));
assert.deepStrictEqual(srv, [7, 8]);
// auf dem Gerät: höchste bekannte im Blatt + 1, je Blatt getrennt
const notes = [{ id: "a", sheet: "1", nr: 1 }, { id: "b", sheet: "1", nr: 4 }, { id: "c", sheet: "2", nr: 9 }];
assert.strictEqual(K.nextNr(notes, "1"), 5);
assert.strictEqual(K.nextNr(notes, "3"), 1);

// Plantitel ohne «Plan»
assert.strictEqual(K.planTitle("Plan EG"), "EG");
assert.strictEqual(K.planTitle("plan: OG 1"), "OG 1");
assert.strictEqual(K.planTitle("Plan"), "Plan");
assert.strictEqual(K.planTitle("Planung Küche"), "Planung Küche", "nur das Wort Plan am Anfang");
assert.strictEqual(K.planTitle("  UG "), "UG");

// Warteschlange: neu, bearbeiten, löschen; ungesendete Notiz bearbeiten ändert nur den Eintrag
const srvNotes = [{ id: "s1", sheet: "1", nr: 1, von: "monteur", text: "alt", x: 0, y: 0, mine: true, status: "offen" }, { id: "s2", sheet: "1", nr: 2, von: "planer", text: "P", x: 1, y: 1, mine: false, status: "offen" }];
let q = [];
q = K.enqueue(q, { op: "add", id: "t-1", sheet: "1", nr: 3, x: 5, y: 6, text: "neu", author: "Marco" });
q = K.enqueue(q, { op: "edit", id: "t-1", text: "neu 2" });
assert.strictEqual(q.length, 1); assert.strictEqual(q[0].text, "neu 2");
q = K.enqueue(q, { op: "edit", id: "s1", text: "geändert" });
q = K.enqueue(q, { op: "edit", id: "s1", x: 9, y: 9 });
assert.strictEqual(q.length, 2, "zweimal dieselbe Notiz bearbeiten: ein Eintrag"); assert.deepStrictEqual([q[1].text, q[1].x], ["geändert", 9]);
let shown = K.withQueue(srvNotes, q);
assert.strictEqual(shown.find((n) => n.id === "s1").text, "geändert"); assert.ok(shown.find((n) => n.id === "s1").pend);
assert.ok(shown.find((n) => n.id === "t-1").pend && shown.find((n) => n.id === "t-1").mine);
assert.deepStrictEqual(K.queueCount(srvNotes, q, "1"), { x: 2, n: 2 }, "2 von 2 eigenen ungesendet");
assert.deepStrictEqual(K.queueCount(srvNotes, q, "2"), { x: 0, n: 0 });
q = K.enqueue(q, { op: "del", id: "t-1" });
assert.strictEqual(q.length, 1, "ungesendete neue Notiz löschen: Eintrag weg");
q = K.enqueue(q, { op: "del", id: "s1" });
assert.deepStrictEqual(q, [{ op: "del", id: "s1" }], "Löschen ersetzt das Bearbeiten");
shown = K.withQueue(srvNotes, q);
assert.ok(!shown.some((n) => n.id === "s1"));
assert.deepStrictEqual(K.queueCount(srvNotes, q, "1"), { x: 1, n: 1 });
// Kennung nach dem Senden ersetzen
assert.deepStrictEqual(K.swapId([{ op: "add", id: "t-9" }, { op: "edit", id: "t-9", text: "x" }, { op: "edit", id: "s1" }], "t-9", "uuid").map((e) => e.id), ["uuid", "uuid", "s1"]);

// Bündeln: eng beieinander zu einer Marke, offene Notiz bleibt allein, weiter weg einzeln
const pts = [{ id: "a", x: 100, y: 100 }, { id: "b", x: 120, y: 110 }, { id: "c", x: 300, y: 100 }];
assert.deepStrictEqual(K.clusterMarks(pts).map((g) => g.ids), [["a", "b"], ["c"]]);
assert.deepStrictEqual(K.clusterMarks(pts, 40, new Set(["b"])).map((g) => g.ids), [["a"], ["b"], ["c"]]);
assert.deepStrictEqual(K.clusterMarks(pts.map((p) => ({ ...p, x: p.x * 3, y: p.y * 3 }))).map((g) => g.ids), [["a"], ["b"], ["c"]], "beim Zoomen aufgefächert");
assert.strictEqual(K.clusterLabel([6, 5]), "5 6");
assert.strictEqual(K.clusterLabel([3, 9, 5, 7]), "3 5 +2");

// Zustand neben «Veröffentlichen» und am Projekt
assert.ok(K.pubState(null, "h").hot);
assert.strictEqual(K.pubState(null, "h").lines[0], "Noch nicht veröffentlicht");
const pub = { rev: 3, at: "2026-10-28T13:32:00Z", hash: "h" };
assert.ok(!K.pubState(pub, "h").hot); assert.match(K.pubState(pub, "h").lines[0], /^Veröffentlicht \d\d\.\d\d\. \d\d:\d\d, Stand 3$/);
assert.strictEqual(K.pubState(pub, "x").lines[0], "Änderungen noch nicht veröffentlicht");
assert.deepStrictEqual(K.pubState(pub, "h", 2).lines, [K.pubState(pub, "h").lines[0], "2 Notizen noch nicht veröffentlicht"]);
assert.ok(K.pubState(pub, "h", 1).hot);
const now = Date.parse("2026-10-28T12:00:00Z");
assert.deepStrictEqual(K.shareStatus(null, now), { on: false, text: "Nicht geteilt" });
assert.strictEqual(K.shareStatus({ rev: 3, expires_at: "2026-11-27T00:00:00Z" }, now).text, "Geteilt · Stand 3");
assert.strictEqual(K.shareStatus({ rev: 3, expires_at: "2026-10-01T00:00:00Z" }, now).text, "Nicht geteilt", "abgelaufen");
assert.strictEqual(K.shareStatus({ rev: 3, expires_at: "2026-11-27T00:00:00Z", revoked_at: "x" }, now).on, false);
assert.strictEqual(K.fingerprint("abc"), K.fingerprint("abc")); assert.notStrictEqual(K.fingerprint("abc"), K.fingerprint("abd"));

// Ablauf
assert.strictEqual(K.expiryOf("7", "", now), "2026-11-04T12:00:00.000Z");
assert.strictEqual(K.expiryOf("30", "", now), "2026-11-27T12:00:00.000Z");
assert.ok(K.expiryOf("end", "2027-03-31", now).startsWith("2027-03-3"));
assert.strictEqual(K.expiryOf("end", "2026-01-01", now), null);
assert.strictEqual(K.expiryOf("end", "", now), null);

// Eingabe wie die Datenbank
assert.match(K.noteError(" ", "M"), /Text/); assert.match(K.noteError("x".repeat(1001), "M"), /zu lang/); assert.match(K.noteError("ok", ""), /Namen/); assert.strictEqual(K.noteError("ok", "M"), "");

// Seite ↔ Welt (Plan-Druckseite: Mitte des Planfelds = Druckmitte, Massstab 1:50, Seite y nach unten)
const tr = { cx: 200, cy: 150, den: 50, mx: 1000, my: 2000 }, h = 297;
const p = K.worldToPage(tr, h, 1500, 2500);
assert.deepStrictEqual(p, { u: 210, v: 297 - 160 });
assert.deepStrictEqual(K.pageToWorld(tr, h, p.u, p.v), { x: 1500, y: 2500 });
console.log("test_monteur: ok");
