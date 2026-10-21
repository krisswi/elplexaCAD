// Zeit über alle Projekte (Etappe 4, Review): Wochenrechnung, ISO-Kalenderwoche, Sommerzeit, unbekannte und ungültige Stunden, Summen, CSV, Rundung. Ohne Browser.
// Aufruf: node test/test_zeit.mjs [Ausgabe.dxf]
import assert from "node:assert";
import { weekStart, weekShift, weekDays, isoWeek, timeWeek, timeWeekCsv, timeTabHTML, validTime, timeSum, onlineSummary, autoOpenN, projSummary, projectData } from "../src/elplexa.js";
import { newDoc } from "../src/model.js";

// Woche beginnt am Montag; Sonntag gehört zur Woche davor
assert.strictEqual(weekStart("2026-10-12"), "2026-10-12");
assert.strictEqual(weekStart("2026-10-18"), "2026-10-12", "Sonntag");
assert.strictEqual(weekStart("2026-10-19"), "2026-10-19");
assert.strictEqual(weekStart("2027-01-01"), "2026-12-28", "Jahreswechsel");
assert.strictEqual(weekShift("2026-10-12", 1), "2026-10-19"); assert.strictEqual(weekShift("2026-10-12", -2), "2026-09-28");
// Sommerzeit (CH: 29.3.2026 und 25.10.2026): immer sieben verschiedene Tage, nie ein Tag doppelt oder verloren
for (const mon of ["2026-03-23", "2026-03-30", "2026-10-19", "2026-10-26"]) {
  const d = weekDays(mon); assert.strictEqual(d.length, 7); assert.strictEqual(new Set(d).size, 7, mon);
  assert.strictEqual(d[0], mon); assert.strictEqual(weekStart(d[6]), mon);
}
assert.deepStrictEqual(weekDays("2026-03-23"), ["2026-03-23", "2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27", "2026-03-28", "2026-03-29"]);
assert.strictEqual(weekDays("2026-12-28")[6], "2027-01-03");
// ISO-Kalenderwoche
assert.deepStrictEqual(isoWeek("2026-10-12"), { y: 2026, w: 42 });
assert.deepStrictEqual(isoWeek("2026-01-01"), { y: 2026, w: 1 });
assert.deepStrictEqual(isoWeek("2027-01-01"), { y: 2026, w: 53 }, "2026 hat 53 Wochen");
assert.deepStrictEqual(isoWeek("2024-12-30"), { y: 2025, w: 1 });
assert.deepStrictEqual(isoWeek("2020-12-31"), { y: 2020, w: 53 });
assert.deepStrictEqual(isoWeek("2026-03-30"), { y: 2026, w: 14 });

// Eintraege von aussen werden geprueft
const bad = [{ d: "2026-10-12", h: 1 }, { d: "2026-13-40", h: 1 }, { d: "x", h: 1 }, { d: "2026-10-12", h: "2" }, { d: "2026-10-12", h: -1 }, { d: "2026-10-12", h: 25 }, { d: "2026-10-12", h: NaN }, null, 5, { d: "2026-10-13", h: 2.5 }];
assert.deepStrictEqual(validTime(bad).map((e) => e.h), [1, 2.5]);
assert.deepStrictEqual(validTime(null), []); assert.deepStrictEqual(validTime("x"), []);
assert.strictEqual(validTime(Array.from({ length: 6000 }, () => ({ d: "2026-10-12", h: 1 }))).length, 5000, "höchstens 5000 Einträge");

// Woche: Summen, andere Wochen zählen nicht, unbekannte Stunden
const T = [{ d: "2026-10-12", h: 1.5 }, { d: "2026-10-12", h: 0.25 }, { d: "2026-10-14", h: 2 }, { d: "2026-10-19", h: 9 }];
const w = timeWeek([{ id: "a", name: "Eins", time: T }, { id: "b", name: "Zwei", time: [{ d: "2026-10-14", h: 3.5 }] }, { id: "c", name: "Drei", time: null }], "2026-10-12");
assert.deepStrictEqual(w.rows[0].days, [1.75, 0, 2, 0, 0, 0, 0]); assert.strictEqual(w.rows[0].sum, 3.75);
assert.deepStrictEqual(w.dayTotals, [1.75, 0, 5.5, 0, 0, 0, 0]); assert.strictEqual(w.total, 7.25);
assert.strictEqual(w.incomplete, true); assert.strictEqual(w.rows[2].known, false);
assert.deepStrictEqual(w.kw, { y: 2026, w: 42 });
assert.strictEqual(timeWeek([{ id: "a", name: "x", time: T }], "2026-10-12").incomplete, false);

// Rundung: ungerundet addieren, zuletzt runden, gleich wie die Projektsumme (timeSum)
const f = [0.1, 0.2, 0.7, 0.015, 0.015, 0.015].map((h, i) => ({ d: weekDays("2026-10-12")[i % 3], h, n: "" })); // Summe 1.045 ungerundet
const doc = newDoc(); doc.project = { time: f };
const ww = timeWeek([{ id: "a", name: "x", time: f }], "2026-10-12");
assert.strictEqual(ww.rows[0].sum, Math.round(timeSum(doc) * 100) / 100, "Wochensumme = Projektsumme (ungerundet addiert)");
assert.strictEqual(ww.total, ww.rows[0].sum);
const g = [0.004, 0.004, 0.004].map((h) => ({ d: "2026-10-12", h }));
assert.strictEqual(timeWeek([{ id: "a", name: "x", time: g }], "2026-10-12").total, 0.01, "3 × 0,004 = 0,012 → 0,01, nicht 3 × 0");

// vorläufige Zeit
assert.strictEqual(autoOpenN([{ k: "a", d: "2026-10-12", s: 600 }, { k: "b", d: "2026-10-12", s: 30 }, { k: "c", d: "2026-10-12", s: 900, x: "ok" }]), 1);
assert.strictEqual(autoOpenN(null), 0);
assert.strictEqual(timeWeek([{ id: "a", name: "x", time: T, auto: 2 }, { id: "b", name: "y", time: [], auto: 0 }], "2026-10-12").autoProjects, 1);

// CSV: Dezimalpunkt, unbekannte Stunden leer mit «?», Hinweiszeile
const csv = timeWeekCsv(w), L = csv.split("\r\n");
assert.ok(csv.startsWith("﻿Projekt;Mo 12.10.2026;"));
assert.strictEqual(L[1], "Eins;1.75;0;2;0;0;0;0;3.75");
assert.strictEqual(L[3], "Drei;;;;;;;;?");
assert.strictEqual(L[4], "Summe;1.75;0;5.5;0;0;0;0;7.25");
assert.ok(L[5].includes("nicht geladen") && L[5].includes("unvollständig"), L[5]);
assert.ok(!timeWeekCsv(timeWeek([{ id: "a", name: "x", time: T }], "2026-10-12")).includes("Hinweis"));

// Anzeige: KW, heute markiert, «?» erreichbar, «unvollständig», Stand alt, Scroll-Container, Screenreader-Text
const h = timeTabHTML({ items: [{ id: "a", name: "Eins", time: T }, { id: "c", name: "Drei", time: null }], mon: "2026-10-12", today: "2026-10-14", user: "x@y", loaded: true, at: Date.parse("2026-10-14T10:30:00"), err: "Keine Verbindung." });
assert.ok(h.includes("KW 42") && h.includes('aria-current="date"') && h.includes("(heute)"));
assert.ok(h.includes('class="el-unk"') && h.includes('aria-label="Stunden nicht geladen"') && h.includes("unvollständig"));
assert.ok(h.includes("(alt)") && h.includes("älteren Stand") && h.includes('class="el-wtab alt"'));
assert.ok(h.includes('class="el-wscroll"') && h.includes('class="sr">0 Stunden') && h.includes("<caption"));

// Objekt: online und lokal nach derselben Regel
assert.deepStrictEqual(onlineSummary({ pm: { OBJEKT: "Bärgen" }, pt: T }), { obj: "Bärgen", h: 12.75 });
assert.deepStrictEqual(onlineSummary({ pm: null, pt: null }), { obj: "", h: 0 }, "ohne Angaben leer, nie «null» oder «undefined»");
assert.strictEqual(onlineSummary({ id: "x" }), null, "alte Abfrage ohne pm/pt: keine Zusammenfassung");
const d2 = newDoc(); d2.project = { meta: { OBJEKT: "Bärgen" } };
assert.strictEqual(projSummary(d2).obj, onlineSummary({ pm: d2.project.meta, pt: [] }).obj, "lokal = online");
const d3 = newDoc(); d3.sheets[0].meta.OBJEKT = "aus Blatt";
assert.strictEqual(projectData(d3).OBJEKT, "aus Blatt", "lokal fällt auf das Arbeitsblatt zurück; online gibt es keine Blätter, dort bleibt es leer");
console.log("Zeit ok");
