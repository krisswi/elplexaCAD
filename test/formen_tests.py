# UI-Tests freies Zeichnen (Wunsch CJ 18.10.2026): Linie, Rechteck, Kreis, Farbe, Strich, Füllung, Textfarbe und -höhe,
# Griffe, Rückgängig, Kopieren, Speichern/Laden, DXF (ezdxf), Druck. Aufruf aus web-src: python3 test/formen_tests.py [Bild.png]
import sys, tempfile
from pathlib import Path
import ezdxf
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
TMP = Path(tempfile.mkdtemp())
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(URL); page.wait_for_timeout(300); page.click('[data-start="schema"]')
    def pt(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.evaluate("(()=>{const r=document.querySelector('#svg').getBoundingClientRect();return {l:r.left,t:r.top}})()")
        return r["l"] + v["x"] + x * v["z"], r["t"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): X, Y = pt(x, y); page.mouse.move(X, Y); page.mouse.click(X, Y); page.wait_for_timeout(60)
    def drag(a, c, mods=None):
        X, Y = pt(*a); page.mouse.move(X, Y); page.mouse.down()
        if mods: page.keyboard.down(mods)
        X, Y = pt(*c); page.mouse.move(X, Y, steps=6); page.mouse.up()
        if mods: page.keyboard.up(mods)
        page.wait_for_timeout(60)
    M = lambda: page.evaluate("window.__schemacad.model")
    shapes = lambda: [i for i in M()["items"] if i["type"] == "shape"]
    sel = lambda: page.evaluate("window.__schemacad.sel")

    # Werkzeuge links im Schema, Tasten I, Q, O
    check("drei neue Werkzeuge links", all(page.locator(f'#left [data-tool="shape-{k}"]').count() == 1 for k in ("line", "rect", "circle")))
    page.keyboard.press("i"); page.wait_for_timeout(60)
    check("Taste I: Linie aktiv, Panel Neue Form", page.get_attribute('[data-tool="shape-line"]', "aria-pressed") == "true" and "Neue Form" in page.inner_text("#right"))
    page.click('#right [data-shc="rot"]'); page.select_option("#right [data-shd]", "dash")
    drag((20.3, 30.2), (80.1, 31.4), "Shift")  # Raster 2,5 und Shift = waagrecht
    s = shapes()
    check("Linie gezogen, auf Raster, waagrecht, rot gestrichelt", len(s) == 1 and s[0]["k"] == "line" and s[0]["pts"] == [[20, 30], [80, 30]] and s[0].get("c") == "rot" and s[0].get("d") is True, s)
    page.keyboard.press("q"); click(100, 20); click(140, 50)  # zweimal klicken
    page.keyboard.press("o"); drag((200, 40), (210, 40))
    s = shapes()
    check("Rechteck mit zwei Klicks, Kreis gezogen (Darstellung der letzten Wahl)", len(s) == 3 and [s[1]["x"], s[1]["y"], s[1]["w"], s[1]["h"]] == [100, 20, 40, 30] and s[2]["k"] == "circle" and s[2]["r"] == 10 and s[2].get("c") == "rot", s)
    page.keyboard.press("q"); X, Y = pt(150, 60); page.mouse.move(X, Y); page.mouse.click(X, Y); page.keyboard.press("Escape"); page.wait_for_timeout(60)
    check("Esc bricht die Form ab", len(shapes()) == 3)
    page.keyboard.press("Escape")

    # Wählen, Panel: Farbe, Strich, Füllung
    click(100, 35)  # linke Kante des Rechtecks
    rid = s[1]["id"]
    check("Rechteck gewählt, Panel mit Farbe, Strich, Füllung", sel() == [rid] and all(page.locator(f"#right {q}").count() for q in ("[data-shc]", "[data-shd]", "[data-shf]")))
    page.click('#right [data-shc="blau"]'); page.click('#right [data-shf="orange"]'); page.select_option("#right [data-shd]", "solid")
    r = [i for i in shapes() if i["id"] == rid][0]
    check("Rechteck blau, orange gefüllt, durchgezogen", r.get("c") == "blau" and r.get("fill") == "orange" and "d" not in r, r)
    click(120, 35)
    check("gefülltes Rechteck innen wählbar", sel() == [rid])
    # Griff: Ecke oben rechts ziehen
    drag((140, 50), (150, 60))
    r = [i for i in shapes() if i["id"] == rid][0]
    check("Griff ändert die Grösse, Gegenecke bleibt", [r["x"], r["y"], r["w"], r["h"]] == [100, 20, 50, 40], r)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(60)
    r = [i for i in shapes() if i["id"] == rid][0]
    check("Rückgängig nimmt den Griff zurück", [r["w"], r["h"]] == [40, 30], r)
    # Verschieben, Kopieren, Löschen
    drag((100, 35), (105, 35))
    r = [i for i in shapes() if i["id"] == rid][0]
    check("Rechteck verschoben", r["x"] == 105, r)
    page.keyboard.press("Meta+c"); page.keyboard.press("Meta+v"); page.wait_for_timeout(60)
    check("Kopieren und Einfügen", len(shapes()) == 4)
    page.keyboard.press("Delete"); page.wait_for_timeout(60)
    check("Löschen", len(shapes()) == 3)
    # Symbol über gefülltem Rechteck bleibt wählbar (Formen liegen hinten)
    page.click('[data-sym="LS_1P"]'); click(120, 35); page.keyboard.press("Escape"); page.keyboard.press("Escape")
    click(120, 35)
    check("Symbol vor der Form gewählt", [i for i in M()["items"] if i["id"] == sel()[0]][0]["type"] == "symbol")
    page.keyboard.press("Delete")

    # Text: Farbe und Höhe
    page.keyboard.press("t"); page.click('#right [data-shc="gruen"]')
    click(20, 70); page.keyboard.type("Grüner Text"); page.keyboard.press("Enter"); page.wait_for_timeout(60)
    t = [i for i in M()["items"] if i.get("s") == "Grüner Text"][0]
    check("neuer Text mit gewählter Farbe", t.get("c") == "gruen", t)
    page.keyboard.press("Escape"); click(22, 71)
    page.fill('#right [data-text="h"]', "6"); page.click('#right [data-shc="rot"]')
    t = [i for i in M()["items"] if i.get("s") == "Grüner Text"][0]
    check("Text: Höhe 6, Farbe rot im Panel", t["h"] == 6 and t.get("c") == "rot", t)
    check("Text rot gezeichnet", page.locator('#items text[fill="#d1302b"]').count() == 1)
    if len(sys.argv) > 1: page.screenshot(path=sys.argv[1])

    # Speichern, Neu, Laden: gleich
    before = M()
    with page.expect_download() as dsv: page.click("#btn-save")
    jf = TMP / "formen.schemacad.json"; dsv.value.save_as(jf)
    check("Datei Version 15", '"version": 15' in jf.read_text())
    page.click("#btn-new"); page.wait_for_timeout(100); page.click('[data-start="schema"]')
    if page.locator(".modal").count(): page.click('.modal [data-r="1"]')
    with page.expect_file_chooser() as fc: page.click("#btn-open")
    fc.value.set_files(str(jf)); page.wait_for_timeout(300)
    after = M()
    check("Laden ohne Datenverlust", before["items"] == after["items"])

    # DXF
    with page.expect_download() as dd: page.click("#btn-export"); page.click("#btn-dxf")
    df = TMP / "formen.dxf"; dd.value.save_as(df)
    doc = ezdxf.readfile(df); au = doc.audit()
    ents = doc.modelspace().query('*[layer=="SCH_FORMEN"]')
    kinds = sorted(e.dxftype() for e in ents)
    check("DXF ohne Audit-Fehler, Layer SCH_FORMEN mit Linie, 1 Rechteck, Kreis, Füllung", not au.has_errors and kinds == ["CIRCLE", "HATCH", "LINE", "LWPOLYLINE"], kinds)
    col = {e.dxftype(): e.dxf.color for e in ents}
    check("DXF-Farben: Linie rot 1, Rechteck blau 5, Füllung orange 30, Kreis rot 1", col == {"LINE": 1, "LWPOLYLINE": 5, "HATCH": 30, "CIRCLE": 1}, col)
    tx = [e for e in doc.modelspace().query("TEXT") if e.dxf.text == "Grüner Text"][0]
    check("DXF-Text rot, Höhe 6", tx.dxf.color == 1 and tx.dxf.height == 6)

    # Druck/PDF: Formen und Farbe in der Druckseite
    html = page.evaluate("(() => { const s = window.__schemacad; s.buildPrint(); const h = document.querySelector('#printroot').innerHTML; document.querySelector('#printroot').innerHTML = ''; return h; })()")
    check("Druck enthält Formen und roten Text", 'stroke="#1f5fbf"' in html and 'fill="#e07800"' in html and 'fill="#d1302b"' in html)
    # Formen nicht auf Disposition und Stringplan: Taste ohne Wirkung
    page.click("#sheet-add", button="right"); page.click('[data-new="dispo"]'); page.wait_for_timeout(150)
    page.keyboard.press("q"); page.wait_for_timeout(60)
    check("Disposition: keine Formwerkzeuge", page.locator('#left [data-tool^="shape-"]').count() == 0 and page.locator('#left [data-tool="select"][aria-pressed="true"]').count() == 1)
    check("keine Fehler", not errors, errors[:3])
    b.close()
print(f"\n{len(fails)} Fehler" if fails else "\nFormen UI: alle Tests ok")
sys.exit(1 if fails else 0)
