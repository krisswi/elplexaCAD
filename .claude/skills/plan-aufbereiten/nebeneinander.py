# Skill plan-aufbereiten: Scan und Prüfbild nebeneinander (gleiche Höhe), über Chromium-Canvas, als Vorschau für CJ.
# Aufruf: python3 nebeneinander.py scan.png pruefbild.png aus.png hoehe
import sys, base64
from playwright.sync_api import sync_playwright
a, b, out, h = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
d = [base64.b64encode(open(x, "rb").read()).decode() for x in (a, b)]
with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(); pg.set_content("<canvas id=c></canvas>")
    pg.evaluate("""async ([d, h]) => { const im = await Promise.all(d.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
      const w = im.map((i) => Math.round(i.width * h / i.height)); const c = document.getElementById('c'); c.width = w[0] + w[1] + 40; c.height = h + 50;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im[0], 0, 50, w[0], h); g.drawImage(im[1], w[0] + 40, 50, w[1], h);
      g.fillStyle = '#222'; g.font = 'bold 30px sans-serif'; g.fillText('Scan (entzerrt, Raster 0,5 m)', 10, 36); g.fillText('elplexaCAD', w[0] + 50, 36);
      window.__png = c.toDataURL('image/png'); }""", [d, h])
    open(out, "wb").write(base64.b64decode(pg.evaluate("window.__png").split(",")[1])); br.close()
