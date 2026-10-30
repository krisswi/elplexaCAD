# Skill plan-aufbereiten: Scan entzerren. Welt (mm, Nullpunkt Aussenecke unten links) → Bildpunkt über bilineare Abbildung der vier Aussenecken
# (gleicht Schräglage und leichte Verzerrung von Fotos aus). Ausgabe mit Welt-Raster (0,5 m dünn, 1 m kräftig, Meterzahlen), 1 px = k mm.
# Aufruf: python3 entzerren.py scan.jpg aus.png '{"bl":[x,y],"br":[x,y],"tl":[x,y],"tr":[x,y],"W":10000,"H":9500,"x0":-1000,"y0":-1000,"x1":13000,"y1":16500,"k":5}'
# bl/br/tl/tr = Pixel der Aussenecken im Scan (unten links, unten rechts, oben links, oben rechts), W/H = Aussenmasse in mm aus den Massketten.
import sys, base64, json
from playwright.sync_api import sync_playwright
img, out = sys.argv[1], sys.argv[2]
C = json.loads(sys.argv[3])  # {"bl":[x,y],"br":..,"tl":..,"tr":..,"W":10000,"H":9500,"x0":-1000,"y0":-1000,"x1":13000,"y1":16500,"k":10}
data = base64.b64encode(open(img, "rb").read()).decode()
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.set_content("<canvas id=c></canvas>")
    pg.evaluate("""async ([d, C]) => { const im = new Image(); im.src = 'data:image/jpeg;base64,' + d; await im.decode();
      const s = document.createElement('canvas'); s.width = im.width; s.height = im.height; const sg = s.getContext('2d'); sg.drawImage(im, 0, 0);
      const src = sg.getImageData(0, 0, im.width, im.height).data, W = im.width;
      const k = C.k, ow = Math.round((C.x1 - C.x0) / k), oh = Math.round((C.y1 - C.y0) / k);
      const c = document.getElementById('c'); c.width = ow; c.height = oh; const g = c.getContext('2d'); const o = g.createImageData(ow, oh);
      const map = (X, Y) => { const u = X / C.W, v = Y / C.H; const bx = C.bl[0] + (C.br[0]-C.bl[0])*u, by = C.bl[1] + (C.br[1]-C.bl[1])*u, tx = C.tl[0] + (C.tr[0]-C.tl[0])*u, ty = C.tl[1] + (C.tr[1]-C.tl[1])*u; return [bx + (tx-bx)*v, by + (ty-by)*v]; };
      for (let j = 0; j < oh; j++) for (let i = 0; i < ow; i++) { const X = C.x0 + i*k, Y = C.y1 - j*k; const [px, py] = map(X, Y); const xi = Math.round(px), yi = Math.round(py);
        const q = (j*ow + i)*4; if (xi < 0 || yi < 0 || xi >= W || yi >= im.height) { o.data[q+3] = 255; continue; } const r = (yi*W + xi)*4; o.data[q] = src[r]; o.data[q+1] = src[r+1]; o.data[q+2] = src[r+2]; o.data[q+3] = 255; }
      g.putImageData(o, 0, 0); g.font = '11px sans-serif';
      for (let X = Math.ceil(C.x0/500)*500; X <= C.x1; X += 500) { const i = (X - C.x0)/k; g.strokeStyle = X % 1000 ? 'rgba(0,150,255,.3)' : 'rgba(0,100,255,.7)'; g.beginPath(); g.moveTo(i,0); g.lineTo(i,oh); g.stroke(); if (!(X % 1000)) { g.fillStyle = '#05f'; for (let yy = 12; yy < oh; yy += 300) g.fillText(X/1000, i+2, yy); } }
      for (let Y = Math.ceil(C.y0/500)*500; Y <= C.y1; Y += 500) { const j = (C.y1 - Y)/k; g.strokeStyle = Y % 1000 ? 'rgba(0,150,255,.3)' : 'rgba(0,100,255,.7)'; g.beginPath(); g.moveTo(0,j); g.lineTo(ow,j); g.stroke(); if (!(Y % 1000)) { g.fillStyle = '#05f'; for (let xx = 2; xx < ow; xx += 300) g.fillText(Y/1000, xx, j-2); } }
      window.__png = c.toDataURL('image/png'); }""", [data, C])
    open(out, "wb").write(base64.b64decode(pg.evaluate("window.__png").split(",")[1])); b.close()
