# UI-Tests Handnotizen (elplexaCAD, CJ 20.10.2026). Vorher: node build.mjs && node build.mjs elplexa. Aufruf: python3 test/hand_tests.py [Ausgabeordner]
# Stift und Finger werden mit eigenen Pointer Events nachgebildet (pointerType pen/touch, Druck): echter Apple Pencil nur auf dem iPad prüfbar.
import sys, tempfile, json
from pathlib import Path
from playwright.sync_api import sync_playwright
from elstart import projektansicht
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "ElplexaCAD.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="hand_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)

# v3 enthält nichts von den Handnotizen
v3 = (ROOT / "dist" / "schemacad.html").read_text()
check("v3-Bau ohne Handnotizen", "elplexacad-hand" not in v3 and "Handnotizen" not in v3 and "hn-page" not in v3)

PEN = """([type, pts, id]) => { const sc = document.querySelector('#hn-scroll'); const r = sc.querySelector('.hn-page').getBoundingClientRect();
  const mk = (t, x, y, p, extra) => new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: id, pointerType: type, isPrimary: true, clientX: r.left + x, clientY: r.top + y, pressure: p, button: 0, buttons: t === 'pointerup' ? 0 : 1, ...extra });
  const tgt = sc.querySelector('.hn-page canvas');
  pts.forEach(([x, y, p], i) => tgt.dispatchEvent(mk(i === 0 ? 'pointerdown' : 'pointermove', x, y, p)));
  const l = pts[pts.length - 1]; tgt.dispatchEvent(mk('pointerup', l[0], l[1], 0)); }"""
def imp(page, f):
    with page.expect_file_chooser() as fc: page.click("[data-a=imp]")
    fc.value.set_files(str(f))
def strokes(page): return page.evaluate("new Promise(r => { const q = indexedDB.open('elplexacad-hand'); q.onsuccess = () => { const g = q.result.transaction('books').objectStore('books').getAll(); g.onsuccess = () => r(g.result.map(b => ({ title: b.title, pages: b.pages.length, n: b.pages.map(p => p.strokes.length), text: b.pages.map(p => p.text).join('|') }))); }; })")

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1180, "height": 820}, accept_downloads=True)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(URL); page.wait_for_selector("#el-hub:not([hidden])"); projektansicht(page)
    check("Kachel Handnotizen in der Übersicht", page.is_visible("#el-hand"))
    page.click("#el-hand"); page.wait_for_selector("#hn .hn-lib, #hn.hn-lib")
    check("Bibliothek leer mit Hinweis", "Noch keine Notiz" in page.inner_text("#hn"))
    check("Hinweis privat", "nicht im Teilen-Link" in page.inner_text("#hn .hn-foot"))
    page.click("[data-a=new]"); page.wait_for_selector(".hn-page canvas")
    page.wait_for_timeout(300)
    # Stift mit Druck: Linie
    page.evaluate(PEN, ["pen", [[100, 100, .2], [150, 130, .5], [220, 140, .9], [300, 200, .6]], 7]); page.wait_for_timeout(100)
    page.screenshot(path=str(OUT / "h1_stift.png"))
    # Finger schreibt nicht, sondern schiebt
    page.evaluate(PEN, ["touch", [[100, 300, .5], [200, 320, .5]], 8]); page.wait_for_timeout(100)
    # Handballen während Stift: abgewiesen (Stift hat gerade geendet)
    page.evaluate(PEN, ["pen", [[100, 400, .5], [180, 420, .5]], 9])
    page.evaluate(PEN, ["touch", [[300, 500, .5], [340, 520, .5]], 10])
    page.wait_for_timeout(1000)
    page.click("[data-a=undo]"); page.click("[data-a=redo]")
    page.fill(".hn-title", "Besprechung Bärgen"); page.click("[data-a=text]"); page.fill(".hn-textp textarea", "Zähler versetzen, Steigzone"); page.wait_for_timeout(1000)
    s = strokes(page)
    check("2 Striche gespeichert (Stift), Finger schrieb nicht", s and s[0]["n"] == [2], s)
    check("Titel und Text gespeichert", s[0]["title"] == "Besprechung Bärgen" and "Steigzone" in s[0]["text"], s)
    # Radierer entfernt Strich, Rückgängig bringt ihn zurück
    page.click("[data-tool=eraser]"); page.evaluate(PEN, ["pen", [[150, 130, .5], [152, 131, .5]], 11]); page.wait_for_timeout(1000)
    check("Radierer löscht einen Strich", strokes(page)[0]["n"] == [1], strokes(page))
    page.click("[data-a=undo]"); page.wait_for_timeout(1000)
    check("Rückgängig bringt ihn zurück", strokes(page)[0]["n"] == [2], strokes(page))
    # Marker, Seite hinzufügen
    page.click("[data-tool=marker]"); page.evaluate(PEN, ["mouse", [[100, 600, .5], [300, 600, .5]], 12])
    page.click("[data-a=addpage]"); page.wait_for_timeout(300)
    check("Zweite Seite", "Seite 2 von 2" in page.inner_text(".hn-pg"), page.inner_text(".hn-pg"))
    # Stifttest-Anzeige
    page.click("[data-a=more]"); page.click("[data-m=diag]")
    page.evaluate(PEN, ["pen", [[50, 50, .7], [60, 60, .7]], 13])
    check("Stifttest zeigt Gerät und Handballen", "Gerät pen" in page.inner_text(".hn-diag") and "abgewiesen" in page.inner_text(".hn-diag"), page.inner_text(".hn-diag"))
    page.screenshot(path=str(OUT / "h2_editor.png"))
    # Export PDF
    page.click("[data-a=more]")
    with page.expect_download() as d: page.click("[data-m=pdf]")
    pdf = OUT / "export.pdf"; d.value.save_as(str(pdf)); raw = pdf.read_bytes()
    check("PDF-Export: gültige PDF mit 2 Seiten", raw[:5] == b"%PDF-" and raw.count(b"/Type /Page\n") + raw.count(b"/Type /Page ") >= 2 or raw.count(b"/Type/Page") >= 2, (raw[:8], raw.count(b"/Page")))
    page.click("[data-a=more]")
    with page.expect_download() as d: page.click("[data-m=png]")
    d.value.save_as(str(OUT / "export.png")); check("PNG-Export", (OUT / "export.png").read_bytes()[:4] == b"\x89PNG")
    page.click("[data-a=more]")
    with page.expect_download() as d: page.click("[data-m=save]")
    d.value.save_as(str(OUT / "export.handnotizen.json"))
    j = json.loads((OUT / "export.handnotizen.json").read_text())
    check("Sicherung enthält Striche", j["format"] == "elplexa-handnotizen" and len(j["book"]["pages"][0]["strokes"]) == 4)
    # Bibliothek, Suche, Import
    page.click("[data-a=lib]"); page.wait_for_selector(".hn-card")
    page.fill(".hn-search", "steigzone"); page.wait_for_timeout(300)
    check("Suche findet über getippten Text", page.locator(".hn-card").count() == 1)
    page.fill(".hn-search", "gibtsnicht"); page.wait_for_timeout(300)
    check("Suche ohne Treffer", page.locator(".hn-card").count() == 0)
    page.fill(".hn-search", ""); page.wait_for_timeout(300)
    imp(page, str(pdf)); page.wait_for_timeout(2500)
    check("PDF-Import legt neue Notiz mit 2 Seiten an", page.locator(".hn-card").count() == 2 and "2 Seiten" in page.inner_text("#hn .hn-grid"), page.inner_text("#hn .hn-grid"))
    imp(page, str(OUT / "export.handnotizen.json")); page.wait_for_timeout(1500)
    check("Sicherung wiederherstellen", page.locator(".hn-card").count() == 3)
    png = OUT / "export.png"; imp(page, str(png)); page.wait_for_timeout(1500)
    check("Bild-Import", page.locator(".hn-card").count() == 4)
    page.screenshot(path=str(OUT / "h3_bibliothek.png"))
    # Blätter aus dem Projekt
    page.click("[data-a=proj]"); page.wait_for_selector("#modal-root .hn-pick input")
    page.locator("#modal-root .hn-pick input").first.check(); page.click("#modal-root [data-ok]"); page.wait_for_timeout(5000)
    check("Blatt aus Projekt wird Notiz", page.locator(".hn-card").count() == 5, page.inner_text("#hn .hn-grid"))
    # Löschen, Neuladen: bleibt erhalten
    page.reload(); page.wait_for_selector("#el-hub:not([hidden])"); projektansicht(page); page.click("#el-hand"); page.wait_for_selector(".hn-card")
    check("Nach Neuladen noch da", page.locator(".hn-card").count() == 5)
    page.screenshot(path=str(OUT / "h4_projekt.png"))
    page.click(".hn-card >> nth=0"); page.wait_for_selector(".hn-page canvas"); page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / "h5_projektblatt.png"))
    page.click("[data-a=lib]"); page.click("[data-a=exit]"); page.wait_for_timeout(200)
    check("Zurück zur Übersicht", page.locator("#hn").count() == 0 and page.is_visible("#el-hub"))
    # iPad-Hochformat
    page.set_viewport_size({"width": 820, "height": 1180}); page.click("#el-hand"); page.wait_for_selector(".hn-card"); page.click("[data-a=new]"); page.wait_for_selector(".hn-page canvas"); page.wait_for_timeout(300)
    w = page.evaluate("[document.documentElement.scrollWidth, document.querySelector('.hn-page').getBoundingClientRect().width, document.querySelector('#hn-scroll').clientWidth]")
    check("iPad 820 px: Seite passt in die Breite", w[1] <= w[2] and w[0] <= 820, w)
    page.screenshot(path=str(OUT / "h6_ipad.png"))
    b.close()

check("Keine Fehler in der Seite", not errors, errors)
print(f"\n{len(fails)} Fehler. Bilder in {OUT}")
sys.exit(1 if fails else 0)
