# Skill plan-aufbereiten: Ausschnitt aus dem entzerrten Bild mit roten Ringen und Nummern, zum Mitschicken bei Rückfragen («welches Zeichen?»).
# Aufruf: python3 markieren.py entzerrt.png k x0 y1 aus.png xa xb ya yb "x,y,nr;x,y,nr"  (Welt-mm; k, x0, y1 wie bei entzerren.py)
import sys, base64
from playwright.sync_api import sync_playwright
img, K, X0, Y1 = sys.argv[1], *map(float, sys.argv[2:5])
out, xa, xb, ya, yb, marks = sys.argv[5], *map(float, sys.argv[6:10]), sys.argv[10]
M = [tuple(m.split(",")) for m in marks.split(";")]
d = base64.b64encode(open(img, "rb").read()).decode()
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); pg.set_content("<canvas id=c></canvas>")
    pg.evaluate("""async ([d, r, M, K, X0, Y1]) => { const im = new Image(); im.src = 'data:image/png;base64,' + d; await im.decode();
      const [xa, xb, ya, yb] = r, i0 = (xa - X0) / K, j0 = (Y1 - yb) / K, w = (xb - xa) / K, h = (yb - ya) / K;
      const c = document.getElementById('c'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(im, i0, j0, w, h, 0, 0, w, h);
      g.lineWidth = 5; g.strokeStyle = '#e00'; g.fillStyle = '#e00'; g.font = 'bold 34px sans-serif';
      for (const [x, y, n] of M) { const px = (x - xa) / K, py = (yb - y) / K; g.beginPath(); g.arc(px, py, 45, 0, 7); g.stroke(); g.fillText(n, px + 48, py - 30); }
      window.__png = c.toDataURL('image/png'); }""", [d, [xa, xb, ya, yb], M, K, X0, Y1])
    open(out, "wb").write(base64.b64decode(pg.evaluate("window.__png").split(",")[1])); b.close()
