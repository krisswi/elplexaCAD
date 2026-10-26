// Offerte Schritt 2 (CJ 26.10.2026): Speicherschicht (ablage.js) und Firmenprofil (profil.js). Ohne Browser, ohne Netz:
// localStorage und der Online-Adapter sind Attrappen. Prüft Laden/Speichern, Abgleich (neuerer Stand gewinnt, fremder Stand
// wird nie hochgeladen), alte Firmendaten, Bauherr mit Mail und Telefon in der Datei.
import assert from "node:assert";
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const A = await import("../src/ablage.js");
const P = await import("../src/profil.js");
const T = await import("../src/titel.js");
const { cleanInfo } = await import("../src/model.js");

// Online-Attrappe: eine Tabelle je Benutzer
const db = new Map(); let user = null, down = false, saves = 0;
const remote = {
  user: () => user,
  async load(name) { if (down) throw new Error("offline"); return db.get(`${user}/${name}`) ?? null; },
  async save(name, data, at) { if (down) throw new Error("offline"); saves++; db.set(`${user}/${name}`, { data: structuredClone(data), at: at.replace("Z", "+00:00") }); },
};
A.setRemote(remote);
const tick = () => new Promise((r) => setTimeout(r, 5));

// ---------- Gast: nur im Browser ----------
assert.strictEqual(A.load("profil"), null, "leer am Anfang");
assert.deepStrictEqual(P.loadProfil(), { FIRMA: "", FIRMA_ADR: "", MAIL: "", TEL: "", MWST: "" }, "leeres Profil");
assert.strictEqual(T.loadFirm(), null, "ohne Profil keine Firma für neue Titelseiten");
mem.set("schemacad.firma.v1", JSON.stringify({ FIRMA: "Alt AG", FIRMA_ADR: "Weg 1", logo: "data:image/png;base64,AAAA" }));
assert.deepStrictEqual(P.loadProfil(), { FIRMA: "Alt AG", FIRMA_ADR: "Weg 1", MAIL: "", TEL: "", MWST: "", logo: "data:image/png;base64,AAAA" }, "alte Firmendaten werden übernommen");
assert.strictEqual(await P.saveProfil({ FIRMA: "Muster Elektro", FIRMA_ADR: "Gasse 2\n3000 Bern", MAIL: "info@muster.test", TEL: "031 000 00 00", MWST: "CHE-000.000.000 MWST", x: 1, logo: "javascript:1" }), "lokal");
assert.deepStrictEqual(P.loadProfil(), { FIRMA: "Muster Elektro", FIRMA_ADR: "Gasse 2\n3000 Bern", MAIL: "info@muster.test", TEL: "031 000 00 00", MWST: "CHE-000.000.000 MWST" }, "gespeichert, fremde Felder und falsches Logo fallen weg");
assert.deepStrictEqual(P.profilLines(P.loadProfil()), ["Muster Elektro", "Gasse 2", "3000 Bern", "info@muster.test", "031 000 00 00", "MwSt-Nr. CHE-000.000.000 MWST"]);
assert.strictEqual(saves, 0, "Gast: nichts online");

// Titelseite: Firma ändern geht ins Profil, Mail und Telefon bleiben
T.saveFirm({ FIRMA: "Muster Elektro GmbH", FIRMA_ADR: "Gasse 2\n3000 Bern" });
assert.deepStrictEqual(P.loadProfil(), { FIRMA: "Muster Elektro GmbH", FIRMA_ADR: "Gasse 2\n3000 Bern", MAIL: "info@muster.test", TEL: "031 000 00 00", MWST: "CHE-000.000.000 MWST" });
assert.deepStrictEqual(T.loadFirm(), { FIRMA: "Muster Elektro GmbH", FIRMA_ADR: "Gasse 2\n3000 Bern" }, "neue Titelseiten übernehmen Firma und Adresse");

// ---------- Anmelden: Gast-Stand geht online und gehört dem Benutzer ----------
user = "a@test";
assert.strictEqual(await A.sync("profil"), false);
assert.strictEqual(db.get("a@test/profil").data.FIRMA, "Muster Elektro GmbH", "Gast-Stand hochgeladen");
assert.strictEqual(JSON.parse(mem.get("schemacad.user.profil.v1")).user, "a@test");
assert.strictEqual(await P.saveProfil({ ...P.loadProfil(), TEL: "079 111 11 11" }), "online");
assert.strictEqual(db.get("a@test/profil").data.TEL, "079 111 11 11");

// Verzögert (Tippen): nur der letzte Stand geht online, alle Aufrufe bekommen das Ergebnis
saves = 0;
const w = [1, 2, 3].map((n) => A.save("profil", { ...P.loadProfil(), MAIL: `m${n}@test` }, { wait: 20 }));
assert.deepStrictEqual(await Promise.all(w), ["online", "online", "online"]);
assert.strictEqual(saves, 1, "drei Tastendrücke, ein Upload");
assert.strictEqual(db.get("a@test/profil").data.MAIL, "m3@test");

// Offline: bleibt im Browser, der nächste Abgleich lädt den neueren Stand hoch
down = true;
assert.strictEqual(await P.saveProfil({ ...P.loadProfil(), FIRMA: "Offline AG" }), "lokal");
assert.strictEqual(P.loadProfil().FIRMA, "Offline AG");
down = false; await tick();
assert.strictEqual(await A.sync("profil"), false);
assert.strictEqual(db.get("a@test/profil").data.FIRMA, "Offline AG", "nachgeholt");

// Online neuer (anderes Gerät): Abgleich holt ihn, Zeitformat «+00:00» gegen «Z»
db.set("a@test/profil", { data: { ...P.loadProfil(), FIRMA: "Vom iPad" }, at: new Date(Date.now() + 60000).toISOString().replace("Z", "+00:00") });
assert.strictEqual(await A.sync("profil"), true);
assert.strictEqual(P.loadProfil().FIRMA, "Vom iPad");
assert.strictEqual(await A.sync("profil"), false, "gleicher Stand: nichts zu tun");

// ---------- Anderer Benutzer am selben Browser: fremder Stand wird nie hochgeladen ----------
user = "b@test"; saves = 0;
assert.strictEqual(await A.sync("profil"), true, "fremder Stand fällt weg");
assert.strictEqual(saves, 0); assert.strictEqual(db.has("b@test/profil"), false);
assert.strictEqual(A.load("profil"), null);
user = "a@test";
assert.strictEqual(await A.sync("profil"), true); assert.strictEqual(P.loadProfil().FIRMA, "Vom iPad", "zurück bei a: Stand von online");

// ---------- Projektfelder: Bauherr mit E-Mail und Telefon ----------
const info = cleanInfo({ BAUHERR: "Familie Muster", BAUHERR_MAIL: "bh@muster.test", BAUHERR_TEL: "031 222 22 22", fremd: 1 });
assert.deepStrictEqual([info.BAUHERR_MAIL, info.BAUHERR_TEL, info.fremd], ["bh@muster.test", "031 222 22 22", undefined]);
assert.ok(T.INFO_FIELDS.some((f) => f.key === "BAUHERR_MAIL") && T.INFO_FIELDS.some((f) => f.key === "BAUHERR_TEL"), "Titelseite zeigt die Felder");
console.log("Profil und Speicherschicht: alle Tests grün.");
