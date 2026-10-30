// Skill plan-aufbereiten: Aufnahme (JSON, siehe SKILL.md) → .elplexa.json über parseModel/serializeModel.
// Aufruf (im Repo): PATH=$HOME/.local/node/bin:$PATH node .claude/skills/plan-aufbereiten/schreiben.mjs aufnahme.json ausgabe.elplexa.json
// Prüft: nichts geht beim Einlesen verloren (cleanPlanObj wirft Unbekanntes still weg), Laden → Speichern → Laden unverändert.
import { readFileSync, writeFileSync } from "node:fs";
globalThis.ELPLEXA = true; // vor dem Laden: model.js nimmt «plan» nur im elplexa-Bau auf
const M = await import("../../../src/model.js");

const [inp, out] = process.argv.slice(2);
if (!inp || !out) { console.error("Aufruf: node schreiben.mjs aufnahme.json ausgabe.elplexa.json"); process.exit(2); }
if (/\/Developer\/elplexaCAD\//.test(new URL(out, "file://" + process.cwd() + "/").pathname)) { console.error("Ausgabe nicht ins Repo (Kundendaten)."); process.exit(2); }
const a = JSON.parse(readFileSync(inp, "utf8"));

const items = a.items.map((it, i) => ({ id: i + 1, ...it }));
const sheet = { kind: "plan", meta: { BLATT: "1", TITEL: a.stockwerk }, paper: { size: a.papier ?? "A3", quer: a.quer !== false, den: a.den ?? 50 }, layers: a.ebenen, alay: a.aktiv, items };
const raw = { format: "schemacad", version: M.VERSION, active: 0, nextId: items.length + 1, sheets: [sheet], mods: { plan: { name: a.stockwerk } }, project: { name: a.projekt } };

const doc = M.parseModel(JSON.stringify(raw));
const txt = M.serializeModel(doc);
const sh = doc.sheets[0];
const lost = items.length - sh.items.length;
const ok = JSON.stringify(M.parseModel(txt)) === JSON.stringify(doc);
const count = {};
for (const it of sh.items) { const k = `${it.layer ?? "(hängt)"} ${it.type}`; count[k] = (count[k] ?? 0) + 1; }
console.log(JSON.stringify({ version: JSON.parse(txt).version, ebenen: sh.layers.map((l) => `${l.id}:${l.name}${l.lock ? " (gesperrt)" : ""}`), aktiv: sh.alay, objekte: count, verloren: lost, rundlauf: ok }, null, 1));
if (lost || !ok) { console.error(lost ? `${lost} Objekte beim Einlesen verloren: Felder mit src/plan.js (cleanPlanObj) vergleichen.` : "Rundlauf ungleich."); process.exit(1); }
writeFileSync(out, txt);
console.log("geschrieben: " + out);
