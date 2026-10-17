// Einfache ZIP-Datei ohne Kompression (Methode „stored“), für „DXF alle Blätter“ als eine Datei (16.10.2026).
// files: [[Name, Text], ...]. Gibt ein Uint8Array zurück. Namen in UTF-8 (Flag 0x800).
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export function zipFiles(files, date = new Date()) {
  const enc = new TextEncoder(), parts = [], dir = [];
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  let off = 0;
  const head = (sig, size) => { const b = new DataView(new ArrayBuffer(size)); b.setUint32(0, sig, true); return b; };
  for (const [name, text] of files) {
    const n = enc.encode(name), d = enc.encode(text), crc = crc32(d);
    const l = head(0x04034b50, 30);
    [[4, 20], [6, 0x800], [8, 0], [10, time], [12, day]].forEach(([o, v]) => l.setUint16(o, v, true));
    l.setUint32(14, crc, true); l.setUint32(18, d.length, true); l.setUint32(22, d.length, true); l.setUint16(26, n.length, true);
    const c = head(0x02014b50, 46);
    [[4, 20], [6, 20], [8, 0x800], [10, 0], [12, time], [14, day]].forEach(([o, v]) => c.setUint16(o, v, true));
    c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true);
    parts.push(new Uint8Array(l.buffer), n, d); dir.push(new Uint8Array(c.buffer), n);
    off += 30 + n.length + d.length;
  }
  const size = dir.reduce((s, p) => s + p.length, 0), e = head(0x06054b50, 22);
  e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  const all = [...parts, ...dir, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}
