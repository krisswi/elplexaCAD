# UI-Tests Mobilansicht (UI Schritt 5, mobil.js, 16.10.2026): Handy 390 × 844 mit Touch. Schema oben, Felder unten,
# ein Finger schiebt, zwei Finger zoomen, Antippen wählt. Aufruf aus web-src: python3 test/mobil_tests.py [Ausgabeordner für Bilder]
import sys, tempfile, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
KEEP = len(sys.argv) > 1
OUT = Path(sys.argv[1]) if KEEP else Path(tempfile.mkdtemp(prefix="mobil_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
def helpers(page):
    def pt(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.evaluate("(()=>{const r=document.querySelector('#svg').getBoundingClientRect();return {l:r.left,t:r.top}})()")
        return r["l"] + v["x"] + x * v["z"], r["t"] + v["y"] + (210 - y) * v["z"]
    return pt
with sync_playwright() as p:
    b = p.chromium.launch()
    # 1. Am Desktop eine Datei anlegen: LS auf Blatt 3, Disposition mit Zählerplatte
    dk = b.new_context(viewport={"width": 1440, "height": 900}); dk.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
    page = dk.new_page(); pt = helpers(page)
    page.goto(URL); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    def click(x, y): X, Y = pt(x, y); page.mouse.click(X, Y); page.wait_for_timeout(60)
    page.click('[data-sym="LS_4P"]'); page.select_option('[data-placepoles]', "LS_1P"); click(100, 150); page.keyboard.press("Escape")
    page.click("#sheet-add", button="right"); page.click('[data-new="dispo"]'); page.wait_for_timeout(150)
    page.click('[data-sym="D:PLATE:zaehler"]'); click(100, 100); page.keyboard.press("Escape")
    with page.expect_download() as dd: page.click("#btn-save")
    f = OUT / "mobil.schemacad.json"; dd.value.save_as(f)
    dk.close()

    # 2. Handy
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
    ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
    page = ctx.new_page(); pt = helpers(page)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    cdp = ctx.new_cdp_session(page)
    M = lambda: page.evaluate("window.__schemacad.model")
    V = lambda: page.evaluate("window.__schemacad.view")
    SEL = lambda: page.evaluate("window.__schemacad.sel")
    def touch(kind, points): cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(points)]})
    def go(i): page.tap("#sheet-cur"); page.tap(f'#sheet-menu [data-sheet="{i}"]'); page.wait_for_timeout(150)
    page.goto(URL); page.wait_for_timeout(300)
    if page.locator(".modal").count(): page.keyboard.press("Escape"); page.wait_for_timeout(100)
    with page.expect_file_chooser() as fc: page.tap("#btn-open")
    fc.value.set_files(str(f)); page.wait_for_timeout(300)
    go(2)
    box = lambda sel: page.evaluate(f"(() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }})()")
    st, rt = box("#stage"), box("#right")
    check("Schema oben, Leiste unten, volle Breite", st[3] <= rt[1] + 1 and rt[0] == 0 and rt[2] == 390 and rt[3] <= 844 and st[3] - st[1] > 300, [st, rt])
    check("Keine Werkzeuge, keine Statuszeile, kein seitlicher Überlauf", page.is_hidden("#left") and page.is_hidden("#statusbar") and page.is_hidden("#btn-left") and page.evaluate("document.documentElement.scrollWidth") <= 390)
    check("Hinweis ohne Auswahl", "antippen" in page.evaluate("getComputedStyle(document.querySelector('#right'), '::before').content"))
    page.screenshot(path=str(OUT / "m1_schema.png"))

    ls = [i for i in M()["items"] if i.get("sym") == "LS_1P"][0]
    v0 = V(); X, Y = pt(ls["x"], ls["y"] - 10)
    page.touchscreen.tap(X, Y); page.wait_for_timeout(150)
    check("Antippen wählt das Gerät, Felder unten", SEL() == [ls["id"]] and page.locator('#right input[data-attr="BMK"]').count() == 1, SEL())
    check("Antippen verschiebt nichts", [i for i in M()["items"] if i["id"] == ls["id"]][0]["x"] == ls["x"] and V() == v0)
    page.tap('#right input[data-attr="BMK"]'); page.fill('#right input[data-attr="BMK"]', "Q1"); page.wait_for_timeout(100)
    check("BMK umbenennen", [i for i in M()["items"] if i["id"] == ls["id"]][0]["attrs"]["BMK"] == "Q1")
    page.screenshot(path=str(OUT / "m2_gewaehlt.png"))
    # Ein Finger schiebt die Ansicht, das Gerät bleibt
    touch("touchStart", [(200, 250)])
    for k in range(1, 7): touch("touchMove", [(200 + 10 * k, 250 + 6 * k)])
    touch("touchEnd", []); page.wait_for_timeout(100)
    v1 = V()
    check("Ein Finger schiebt (60, 36 px)", abs(v1["x"] - v0["x"] - 60) < 1 and abs(v1["y"] - v0["y"] - 36) < 1 and v1["z"] == v0["z"], [v0, v1])
    check("Schieben ändert nichts am Schema, Auswahl bleibt", [i for i in M()["items"] if i["id"] == ls["id"]][0]["x"] == ls["x"] and SEL() == [ls["id"]])
    # Zwei Finger zoomen
    touch("touchStart", [(160, 250), (230, 250)])
    for k in range(1, 6): touch("touchMove", [(160 - 10 * k, 250), (230 + 10 * k, 250)])
    touch("touchEnd", []); page.wait_for_timeout(100)
    v2 = V()
    check("Zwei Finger zoomen hinein (Faktor ca. 2,4)", 2.2 < v2["z"] / v1["z"] < 2.6, [v1["z"], v2["z"]])
    page.touchscreen.tap(30, 120); page.wait_for_timeout(100)
    check("Antippen ins Leere hebt die Auswahl auf", SEL() == [])
    # Disposition und Stringplan: ansehen und wählen
    go(4); page.wait_for_timeout(150)
    check("Disposition sichtbar, Felder unten", page.evaluate("window.__schemacad.kind") == "dispo" and page.is_visible("#right"))
    pl = [i for i in M()["items"] if i["type"] == "plate"][0]
    X, Y = pt(pl["x"] + 2, pl["y"] + pl["h"] / 2)  # am linken Rand: Platten wählt man am Rand
    page.touchscreen.tap(X, Y); page.wait_for_timeout(150)
    check("Platte am Rand antippen zeigt ihre Felder", page.locator('#right input[data-dp="name"]').count() == 1, SEL())
    page.screenshot(path=str(OUT / "m3_dispo.png"))
    go(0); page.wait_for_timeout(150)
    check("Titelseite ansehen", page.evaluate("window.__schemacad.kind") == "title")
    page.screenshot(path=str(OUT / "m4_titel.png"))
    check("keine Fehler in der Konsole", not errors, errors[:3])
    b.close()
if not KEEP: shutil.rmtree(OUT)
print(f"\n{len(fails)} Fehler" if fails else "\nMobil: alle Tests ok")
sys.exit(1 if fails else 0)
