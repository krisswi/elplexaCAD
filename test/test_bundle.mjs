import assert from "node:assert";
import { offsetPaths, snapToVerticals } from "../src/bundle.js";
import { parseCable, termCount } from "../src/terminals.js";
// senkrecht nach unten: weitere Leiter rechts
let p = offsetPaths([[100, 150], [100, 100]], 3);
assert.deepStrictEqual(p, [[[100, 150], [100, 100]], [[105, 150], [105, 100]], [[110, 150], [110, 100]]]);
// waagrecht nach rechts: weitere Leiter darunter
p = offsetPaths([[20, 100], [60, 100]], 2);
assert.deepStrictEqual(p[1], [[20, 95], [60, 95]]);
// Knick: runter, dann rechts. Abstand bleibt 5 überall
p = offsetPaths([[100, 150], [100, 100], [140, 100]], 3);
for (const k of [1, 2]) {
  for (const q of p[k]) assert.ok(Number.isFinite(q[0]) && Number.isFinite(q[1]));
  assert.strictEqual(p[k].length, 3);
}
console.log("Knick:", JSON.stringify(p));
// Kabel
assert.strictEqual(parseCable("5x1.5mm2").n, 5);
assert.strictEqual(parseCable("TT 7x2,5").n, 7);
assert.strictEqual(parseCable("5G1.5").n, 5);
assert.strictEqual(parseCable("abc"), null);
assert.strictEqual(termCount({ cable: "7x2.5", n: 2 }), 7);
assert.strictEqual(termCount({ cable: "??", n: 4 }), 4);
// Abzweig waagrecht von einem senkrechten 4er-Bündel (unter RCD 4F2, x 30..45): jeder Leiter auf seinem Leiter (CJ 15.10.)
const src = [30, 35, 40, 45].map((x, i) => ({ type: "wire", kind: i === 3 ? "neutral" : "leitung", pts: [[x, 140], [x, 90]] }));
// von unten (Pole 4F4 bei x 100) hoch und nach links: Ende auf L1 bei x 30
let q = snapToVerticals(offsetPaths([[100, 70], [100, 110], [30, 110]], 4), src);
assert.deepStrictEqual(q.map((w) => w.at(-1)), [[30, 110], [35, 115], [40, 120], [45, 125]], "Enden auf L1, L2, L3, N");
// Start auf L1 und nach rechts: weitere Leiter unterhalb, jeder beginnt auf seinem Leiter
q = snapToVerticals(offsetPaths([[30, 120], [150, 120], [150, 70]], 4), src);
assert.deepStrictEqual(q.map((w) => w[0]), [[30, 120], [35, 115], [40, 110], [45, 105]], "Anfänge auf L1, L2, L3, N");
// ohne parallele Leiter (nur ein senkrechter Leiter) bleibt alles wie bisher
q = snapToVerticals(offsetPaths([[100, 70], [100, 110], [30, 110]], 4), src.slice(0, 1));
assert.deepStrictEqual(q.map((w) => w.at(-1)[0]), [30, 30, 30, 30]);
console.log("ok");
