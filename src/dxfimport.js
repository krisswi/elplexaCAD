// DXF-Import für Symbole: liest ein ASCII-DXF (LINE, CIRCLE, ARC, LWPOLYLINE, TEXT, MTEXT, INSERT, ATTDEF) und baut daraus ein Symbol.
// Eigener kleiner Leser, damit die App eine einzelne Datei bleibt. HATCH, SOLID, BLOCK-Attribute und Kurven mit Bulge werden nicht übernommen.

const r3 = (n) => Math.round(n * 1000) / 1000;

export function parseDxf(text) {
  if (/^AC10/.test(text)) throw new Error("Das ist eine DWG-Datei mit der Endung .dxf. Speichere sie in AutoCAD als DXF (Speichern unter) und importiere sie dann.");
  if (/^AutoCAD Binary DXF/.test(text)) throw new Error("Das ist ein binäres DXF. Speichere es in AutoCAD als ASCII-DXF.");
  const L = text.split(/\r?\n/);
  const sections = { ENTITIES: [], BLOCKS: {} };
  let sec = "", cur = null, block = null;
  for (let i = 0; i + 1 < L.length; i += 2) {
    const code = parseInt(L[i].trim(), 10), val = L[i + 1];
    if (Number.isNaN(code)) throw new Error("Das ist keine lesbare DXF-Datei.");
    if (code === 0) {
      const v = val.trim();
      if (v === "SECTION" || v === "ENDSEC" || v === "EOF") { cur = null; if (v === "ENDSEC") sec = ""; continue; }
      if (v === "ENDBLK") { block = null; cur = null; continue; }
      cur = { type: v, g: [] };
      if (sec === "ENTITIES") sections.ENTITIES.push(cur);
      else if (sec === "BLOCKS") { if (v === "BLOCK") { block = { name: "", ents: [] }; cur.block = block; } else if (block) block.ents.push(cur); }
    } else if (code === 2 && !cur && !sec) { sec = val.trim(); }
    else if (cur) {
      cur.g.push([code, val]);
      if (cur.block && code === 2) { cur.block.name = val.trim(); sections.BLOCKS[cur.block.name] = cur.block.ents; }
    }
  }
  return sections;
}

const num = (e, c, d = 0) => { const r = e.g.find((p) => p[0] === c); return r ? parseFloat(r[1]) : d; };
const str = (e, c, d = "") => { const r = e.g.find((p) => p[0] === c); return r ? r[1].trim() : d; };

function xform(m) {
  const a = (m.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return (x, y) => { const X = x * m.sx, Y = y * m.sy; return [m.dx + X * c - Y * s, m.dy + X * s + Y * c]; };
}

// Alle Entities zu Linien, Kreisen, Texten und Attributdefinitionen (alles im Zeichnungskoordinatensystem)
export function flatten(sections, ents = sections.ENTITIES, m = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0 }, depth = 0, out = { lines: [], circles: [], texts: [], attdefs: [] }) {
  const T = xform(m);
  for (const e of ents) {
    if (e.type === "LINE") {
      const a = T(num(e, 10), num(e, 20)), b = T(num(e, 11), num(e, 21));
      out.lines.push([...a, ...b, /DASH|HIDDEN|CENTER|PHANTOM/i.test(str(e, 6))]);
    } else if (e.type === "CIRCLE") {
      const c = T(num(e, 10), num(e, 20));
      out.circles.push([...c, num(e, 40) * Math.abs(m.sx)]);
    } else if (e.type === "ARC") {
      const cx = num(e, 10), cy = num(e, 20), r = num(e, 40);
      let a0 = num(e, 50), a1 = num(e, 51);
      if (a1 <= a0) a1 += 360;
      const n = Math.max(2, Math.ceil((a1 - a0) / 15));
      let prev = null;
      for (let k = 0; k <= n; k++) {
        const t = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
        const p = T(cx + r * Math.cos(t), cy + r * Math.sin(t));
        if (prev) out.lines.push([...prev, ...p, false]);
        prev = p;
      }
    } else if (e.type === "LWPOLYLINE") {
      const pts = [];
      for (const [c, v] of e.g) { if (c === 10) pts.push([parseFloat(v), 0]); else if (c === 20 && pts.length) pts[pts.length - 1][1] = parseFloat(v); }
      const closed = (num(e, 70) & 1) === 1;
      const P = pts.map(([x, y]) => T(x, y));
      for (let k = 0; k + 1 < P.length; k++) out.lines.push([...P[k], ...P[k + 1], false]);
      if (closed && P.length > 2) out.lines.push([...P.at(-1), ...P[0], false]);
    } else if (e.type === "TEXT" || e.type === "MTEXT") {
      const p = T(num(e, 10), num(e, 20));
      const s = str(e, 1).replace(/\\[A-Za-z][^;]*;|[{}]/g, "").replace(/\\P/g, " ").trim();
      if (s) out.texts.push({ x: p[0], y: p[1], h: (num(e, 40, 2.5) || 2.5) * Math.abs(m.sy), s });
    } else if (e.type === "ATTDEF") {
      const p = T(num(e, 10), num(e, 20));
      out.attdefs.push({ tag: str(e, 2), def: str(e, 1), x: p[0], y: p[1], h: num(e, 40, 2.5) * Math.abs(m.sy) });
    } else if (e.type === "INSERT" && depth < 3) {
      const b = sections.BLOCKS[str(e, 2)];
      if (b) {
        const ip = T(num(e, 10), num(e, 20));
        flatten(sections, b, { dx: ip[0], dy: ip[1], sx: num(e, 41, 1) * m.sx, sy: num(e, 42, 1) * m.sy, rot: num(e, 50) + m.rot }, depth + 1, out);
      }
    }
  }
  return out;
}

const key = (x, y) => `${r3(x)},${r3(y)}`;

// Symbol aus dem Rohmodell: Anschlüsse aus den Klemmenziffern (A1, A2 …) oder den freien Linienenden oben und unten
export function buildSymbol(raw, { name, label, scale = "auto", sizeMax = 400 }) {
  if (!raw.lines.length && !raw.circles.length) throw new Error("Die Datei enthält keine Linien oder Kreise (nur diese werden übernommen).");
  const ends = new Map();
  for (const l of raw.lines) for (const [x, y] of [[l[0], l[1]], [l[2], l[3]]]) { const k = key(x, y); ends.set(k, { x, y, n: (ends.get(k)?.n || 0) + 1 }); }
  const endList = [...ends.values()];
  let pins = [];
  const numbered = raw.attdefs.filter((a) => /^A\d+$/.test(a.tag));
  if (numbered.length) {
    for (const a of numbered) {
      let best = null, bd = 3;
      for (const e of endList) { const d = Math.hypot(e.x - a.x, e.y - a.y); if (d < bd) { bd = d; best = e; } }
      if (best && !pins.some((p) => key(p.x, p.y) === key(best.x, best.y))) pins.push({ x: best.x, y: best.y });
    }
  }
  if (!pins.length) {
    const ys = endList.map((e) => e.y), top = Math.max(...ys), bot = Math.min(...ys);
    pins = endList.filter((e) => e.n === 1 && (Math.abs(e.y - top) < 1e-3 || Math.abs(e.y - bot) < 1e-3)).map((e) => ({ x: e.x, y: e.y }));
  }
  if (pins.length > 40) pins = [];
  // Ursprung: linker oberer Anschluss, sonst linke obere Ecke
  const allY = [...raw.lines.flatMap((l) => [l[1], l[3]]), ...raw.circles.map((c) => c[1] + c[2])];
  const allX = [...raw.lines.flatMap((l) => [l[0], l[2]]), ...raw.circles.map((c) => c[0] - c[2])];
  let ox, oy;
  if (pins.length) { const top = Math.max(...pins.map((p) => p.y)); const row = pins.filter((p) => Math.abs(p.y - top) < 1e-3); ox = Math.min(...row.map((p) => p.x)); oy = top; }
  else { ox = Math.min(...allX); oy = Math.max(...allY); }
  // Massstab: Polteilung 5 mm, wenn mehrere Anschlüsse in einer Reihe liegen
  let k = 1;
  if (scale === "auto") {
    let best = Infinity;
    for (const p of pins) for (const q of pins) if (p !== q && Math.abs(p.y - q.y) < 1e-3 && Math.abs(p.x - q.x) > 1e-3) best = Math.min(best, Math.abs(p.x - q.x));
    if (Number.isFinite(best) && best > 0) { const f = 5 / best; if (f > 0.1 && f < 10) k = r3(f); }
  } else if (scale === "h20") {
    // Höhe wie die eigenen Symbole: Abstand oberster bis unterster Anschluss = 20 mm
    const ys = pins.map((p) => p.y), h = ys.length ? Math.max(...ys) - Math.min(...ys) : Math.max(...allY) - Math.min(...allY);
    if (h > 0) k = r3(20 / h);
  } else k = Number(scale) > 0 ? Number(scale) : 1;
  const X = (x) => r3((x - ox) * k), Y = (y) => r3((y - oy) * k);
  const prims = [];
  for (const l of raw.lines) { if (Math.hypot(l[2] - l[0], l[3] - l[1]) > 1e-6) prims.push({ t: "l", x1: X(l[0]), y1: Y(l[1]), x2: X(l[2]), y2: Y(l[3]), d: !!l[4] }); }
  for (const c of raw.circles) prims.push({ t: "c", cx: X(c[0]), cy: Y(c[1]), r: r3(c[2] * k) });
  for (const t of raw.texts) prims.push({ t: "t", x: X(t.x), y: Y(t.y), h: r3(t.h * k), s: t.s, anchor: "mm" });
  const attrs = [];
  for (const a of raw.attdefs) {
    if (a.h < 0.5) continue; // versteckte Hilfsfelder (ID, AN, CODE)
    if (/^(A\d+|BMKIN\d+)$/.test(a.tag)) { if (a.def) prims.push({ t: "t", x: X(a.x), y: Y(a.y), h: r3(a.h * k), s: a.def, anchor: "mm" }); }
    else if (!attrs.some((q) => q.tag === a.tag)) attrs.push({ tag: a.tag, label: a.tag === "BMK" ? "Betriebsmittelkennzeichen" : a.tag, def: a.def, x: X(a.x), y: Y(a.y), h: r3(a.h * k) });
  }
  const sym = {
    name, family: "LIB", poles: 1, label, layer: "SCH_SYMBOLE", custom: true, scaled: k,
    prims, pins: pins.map((p) => ({ x: X(p.x), y: Y(p.y) })), attrs,
  };
  const b = { x: Math.max(...prims.filter((p) => p.t === "l").flatMap((p) => [Math.abs(p.x1), Math.abs(p.x2), Math.abs(p.y1), Math.abs(p.y2)]), 0) };
  if (b.x > sizeMax) throw new Error("Das Symbol ist nach der Skalierung grösser als " + sizeMax + " mm. Prüfe den Massstab.");
  return sym;
}

export function importDxfSymbol(text, opts) {
  return buildSymbol(flatten(parseDxf(text)), opts);
}
