// Leiterbündel: mehrere parallele Leiter (Abstand = Polabstand) in einem Zug zeichnen.

export const BUNDLE_PRESETS = {
  1: [""],
  2: ["L", "N"],
  3: ["L1", "L2", "L3"],
  4: ["L1", "L2", "L3", "N"],
  5: ["L1", "L2", "L3", "N", "PE"],
};
export const BUNDLE_LABELS = {
  1: "1 Leiter",
  2: "2 Leiter (L, N)",
  3: "3 Leiter (L1, L2, L3)",
  4: "4 Leiter (L1, L2, L3, N)",
  5: "5 Leiter (L1, L2, L3, N, PE)",
};
export const conductorKind = (name) => (name === "N" ? "neutral" : name === "PE" ? "pe" : "leitung");

const r3 = (n) => Math.round(n * 1000) / 1000;
const sgn = (v) => (Math.abs(v) < 1e-9 ? 0 : Math.sign(v));

// Wirft pts (rechtwinklig, ohne Doppelpunkte) in n parallele Wege. Weg 0 = pts.
// Die weiteren Leiter liegen bei senkrechtem Start rechts, bei waagrechtem Start unterhalb.
export function offsetPaths(pts, n, pitch = 5) {
  if (n <= 1 || pts.length < 2) return [pts.map((p) => [p[0], p[1]])];
  const seg = [];
  for (let i = 0; i + 1 < pts.length; i++) seg.push({ dx: sgn(pts[i + 1][0] - pts[i][0]), dy: sgn(pts[i + 1][1] - pts[i][1]) });
  const first = seg[0];
  const target = first.dx === 0 ? { x: 1, y: 0 } : { x: 0, y: -1 };
  const sigma = (-first.dy === target.x && first.dx === target.y) ? 1 : -1;
  const normal = (s) => ({ x: -s.dy * sigma, y: s.dx * sigma });
  const paths = [];
  for (let k = 0; k < n; k++) {
    const off = k * pitch;
    const ov = seg.map((s) => { const nn = normal(s); return { x: nn.x * off, y: nn.y * off }; });
    const path = [[r3(pts[0][0] + ov[0].x), r3(pts[0][1] + ov[0].y)]];
    for (let j = 1; j < pts.length - 1; j++) {
      const a = seg[j - 1], b = seg[j];
      const aHoriz = a.dy === 0, bHoriz = b.dy === 0;
      let x, y;
      if (aHoriz === bHoriz) { x = pts[j][0] + ov[j - 1].x; y = pts[j][1] + ov[j - 1].y; }
      else if (aHoriz) { x = pts[j][0] + ov[j].x; y = pts[j][1] + ov[j - 1].y; }
      else { x = pts[j][0] + ov[j - 1].x; y = pts[j][1] + ov[j].y; }
      path.push([r3(x), r3(y)]);
    }
    const last = pts.length - 1;
    path.push([r3(pts[last][0] + ov[last - 1].x), r3(pts[last][1] + ov[last - 1].y)]);
    paths.push(path);
  }
  return paths;
}

// Abzweig an der Grundverkabelung: endet (oder beginnt) ein senkrechtes Bündel auf einer Schiene, endet jeder Leiter auf seiner eigenen Schiene.
// L1 liegt links und endet auf der obersten Schiene, N rechts auf der untersten. rails = { L1: y, L2: y, L3: y, N: y, PE: y }.
const railName = (nm) => (nm === "L" ? "L1" : nm);
export function snapToRails(paths, names, rails) {
  const ys = Object.values(rails);
  if (!ys.length || paths.length < 2) return paths;
  const out = paths.map((p) => p.map((q) => [q[0], q[1]]));
  const fix = (end) => {
    const idx = (p) => (end ? p.length - 1 : 0), nb = (p) => (end ? p.length - 2 : 1);
    const p0 = out[0], a = p0[idx(p0)], b = p0[nb(p0)];
    if (!ys.some((y) => Math.abs(y - a[1]) < 1e-6) || Math.abs(a[0] - b[0]) > 1e-6) return; // nur senkrecht auf einer Schiene
    out.forEach((p, k) => {
      const y = rails[railName(names[k])];
      if (y === undefined) return;
      const e = p[idx(p)], prev = p[nb(p)];
      if (Math.sign(y - prev[1]) !== Math.sign(a[1] - b[1]) || Math.abs(e[0] - prev[0]) > 1e-6) return;
      e[1] = y;
    });
  };
  fix(false); fix(true);
  return out;
}

// Waagrechter Abzweig von einem senkrechten Bündel (z. B. unter einem 4-poligen RCD): endet oder beginnt Leiter 0 waagrecht
// auf einem senkrechten Leiter, endet jeder weitere Leiter k auf dem senkrechten Leiter im Abstand k × pitch rechts davon
// (L1 links, N rechts), sofern dort einer verläuft (CJ 15.10.: N an N, nicht alle an L1). items = Objekte des Blatts.
export function snapToVerticals(paths, items, pitch = 5) {
  if (paths.length < 2) return paths;
  const vert = (x, y) => items.some((o) => o.type === "wire" && o.pts.some((q, i) => i > 0 && Math.abs(q[0] - x) < 1e-6 && Math.abs(o.pts[i - 1][0] - x) < 1e-6 && y >= Math.min(q[1], o.pts[i - 1][1]) - 1e-6 && y <= Math.max(q[1], o.pts[i - 1][1]) + 1e-6));
  const out = paths.map((p) => p.map((q) => [q[0], q[1]]));
  const fix = (end) => {
    const idx = (p) => (end ? p.length - 1 : 0), nb = (p) => (end ? p.length - 2 : 1);
    const p0 = out[0], a = p0[idx(p0)], b = p0[nb(p0)];
    if (Math.abs(a[1] - b[1]) > 1e-6 || !vert(a[0], a[1])) return; // nur waagrecht auf einem senkrechten Leiter
    out.forEach((p, k) => {
      if (!k) return;
      const e = p[idx(p)], prev = p[nb(p)], x = r3(a[0] + k * pitch);
      if (Math.abs(e[1] - prev[1]) > 1e-6 || !vert(x, e[1])) return;
      e[0] = x;
    });
  };
  fix(false); fix(true);
  return out;
}
