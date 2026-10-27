// Plansymbole (src/plansym.js und src/plansym/, CJ 27.10.2026): jedes Symbol hat Schlüssel, Gruppe, Fangpunkte und Beschriftung,
// und die Zeichnung jedes Symbols ist SVG für SVG gleich wie in der Referenz test/ref/plansymbole.json (Bildvergleich vorher/nachher).
// Aufruf: node test/test_plansym.mjs. Referenz bewusst neu schreiben: NEU=1 node test/test_plansym.mjs.
// Übersichtsbild aller Symbole: BILD=pfad.html node test/test_plansym.mjs
import assert from "node:assert";
import fs from "node:fs";
const S = await import("../src/plansym.js");
const REF = new URL("./ref/plansymbole.json", import.meta.url);

// Teile → SVG (y nach oben wie im Plan, darum scale(1,-1); Texte ohne Spiegelung)
const f = (n) => String(Math.round(n * 1000) / 1000);
function partSvg(q) {
  if (q[0] === "l") return `<line x1="${f(q[1])}" y1="${f(q[2])}" x2="${f(q[3])}" y2="${f(q[4])}"/>`;
  if (q[0] === "c") return `<circle cx="${f(q[1])}" cy="${f(q[2])}" r="${f(q[3])}" fill="${q[4] ? "currentColor" : "none"}"/>`;
  if (q[0] === "p") return `<path d="${q[1]}" fill="${q[2] === true || q[2] === "w" ? (q[2] === "w" ? "#fff" : "currentColor") : "none"}"${q[2] === "wl" ? ` stroke="#fff" stroke-width="${q[3]}"` : ""}/>`;
  if (q[0] === "t") return `<text x="${f(q[1])}" y="${f(-q[2])}" font-size="${f(q[3])}" transform="scale(1,-1)"${q[5] ? ` data-f="${q[5]}"` : ""}>${q[4]}</text>`;
  throw new Error(`unbekannter Teil ${q[0]}`);
}
const svg = (parts) => parts.map(partSvg).join("");
// Alles, was die Darstellung und den Fang bestimmt; Grössen-Symbole zusätzlich bei einer zweiten Grösse
const snap = (d) => ({ label: d.label, cat: d.cat, group: d.group, wall: d.wall, h: d.h ?? null, c: d.c, r: d.r, pin: d.pin, edge: d.edge, num: d.num ?? null, ref: d.ref,
  size: d.size ? { w: d.size.w, t: d.size.t ?? null, alt: svg(d.size.parts(30, 4)) } : null, svg: svg(d.parts), ap: d.ap ? svg([d.ap]) : null });
const now = Object.fromEntries(S.PLAN_SYMS.map((d) => [d.key, snap(d)]));

// ---------- Grundregeln je Symbol ----------
assert.strictEqual(S.SYM_BY_KEY.size, S.PLAN_SYMS.length, "Schlüssel eindeutig");
for (const d of S.PLAN_SYMS) {
  assert.ok(/^[A-Z][A-Z0-9_]*$/.test(d.key), `${d.key}: Schlüssel`);
  assert.ok(d.label && d.group && d.cat, `${d.key}: Beschriftung, Gruppe, Kategorie`);
  assert.ok(S.SYM_GROUPS.includes(d.group), `${d.key}: Gruppe in der Symbolleiste`);
  assert.ok(d.parts.length, `${d.key}: Zeichnung`);
  assert.ok(d.pin?.length === 3 || d.edge?.length === 4 || d.c?.length === 2, `${d.key}: Fangpunkte`);
  assert.strictEqual(S.symDef(d.key), d, `${d.key}: symDef`);
}
assert.strictEqual(S.symDef("GIBT_ES_NICHT"), undefined, "unbekannter Schlüssel");

// ---------- Bildvergleich gegen die Referenz ----------
if (process.env.NEU) { fs.mkdirSync(new URL("./ref/", import.meta.url), { recursive: true }); fs.writeFileSync(REF, JSON.stringify({ order: Object.keys(now), groups: S.SYM_GROUPS, syms: now }, null, 1) + "\n"); console.log("Referenz neu geschrieben:", S.PLAN_SYMS.length, "Symbole"); }
const ref = JSON.parse(fs.readFileSync(REF, "utf8"));
assert.deepStrictEqual(S.SYM_GROUPS, ref.groups, "Gruppen und Reihenfolge in der Symbolleiste");
assert.deepStrictEqual(Object.keys(now), ref.order, "Reihenfolge der Symbole (Symbolleiste, Stückliste)");
for (const k of ref.order) assert.deepStrictEqual(now[k], ref.syms[k], `${k}: Zeichnung oder Angaben anders als in der Referenz`);

// ---------- Übersichtsbild ----------
if (process.env.BILD) {
  let h = `<!doctype html><meta charset="utf-8"><title>Plansymbole</title><style>body{font:12px sans-serif;margin:16px}h2{margin:18px 0 6px}div.g{display:flex;flex-wrap:wrap;gap:6px}figure{margin:0;width:110px;text-align:center}svg{width:100px;height:100px;border:1px solid #ddd;color:#0068c9}figcaption{font-size:10px}</style>`;
  for (const g of S.SYM_GROUPS) {
    h += `<h2>${g}</h2><div class="g">`;
    for (const d of S.PLAN_SYMS.filter((x) => x.group === g)) h += `<figure><svg viewBox="-6 -6 12 12"><g transform="scale(1,-1)" fill="none" stroke="currentColor" stroke-width="0.18" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">${svg(d.ap ? [...d.parts, d.ap] : d.parts)}</g></svg><figcaption>${d.key}<br>${d.label}</figcaption></figure>`;
    h += "</div>";
  }
  fs.writeFileSync(process.env.BILD, h);
}
console.log(`Plansymbole: ${S.PLAN_SYMS.length} Symbole in ${S.SYM_GROUPS.length} Gruppen, gleich wie die Referenz.`);
