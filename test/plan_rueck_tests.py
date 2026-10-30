# UI-Test Modul «Plan», Rückmeldungen CJ 24.10.2026: freier Grund ohne Papier, Ausrichtungsfang beim Rechteck, Wand = Innenlinie (Seite automatisch),
# Steckdose richtig an der Wand, Vorgabefarbe blau, Taste L, Grundriss-Werkzeuge nur auf Hintergrund, Menü «+ Modul» bleibt im Bild.
# Vorher: node build.mjs && node build.mjs elplexa. Aufruf: python3 test/plan_rueck_tests.py
import sys, math
from pathlib import Path
from playwright.sync_api import sync_playwright
from elstart import projektansicht

def plsym(page, k):  # Symbolgruppen sind zu (CJ 26.10.2026): Gruppe aufklappen, dann Symbol wählen
    page.evaluate("k => document.querySelector(`[data-plsym='${k}']`).closest('section').querySelector('[data-plgrp][aria-expanded=false]')?.click()", k)
    page.click(f'[data-plsym="{k}"]')
ROOT = Path(__file__).resolve().parent.parent
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 700}); page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; delete window.showDirectoryPicker;")
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(400); projektansicht(page)
    M = lambda: page.evaluate("window.__schemacad.model")
    of = lambda t: [x for x in M()["items"] if x["type"] == t]
    def key(k):
        page.evaluate("([k]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))", [k]); page.wait_for_timeout(60)
    def keys(s):
        for c in s: key(c)
    def at(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.locator("#svg").bounding_box()
        return r["x"] + v["x"] + x * v["z"], r["y"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): page.mouse.click(*at(x, y)); page.wait_for_timeout(80)
    near = lambda a, q, tol=0.5: math.hypot(a[0] - q[0], a[1] - q[1]) < tol

    # Menü «+ Modul» bei kleinem Fenster: bleibt im Bild
    page.click("#el-addmod"); page.wait_for_timeout(200)
    r = page.evaluate("(() => { const m = document.querySelector('.menu:not([hidden])'); const q = m.getBoundingClientRect(); return [q.top, q.bottom, q.left, q.right, innerHeight, innerWidth]; })()")
    check("Menü «+ Modul» liegt ganz im Fenster (scrollt, wenn zu hoch)", r[0] >= 0 and r[1] <= r[4] and r[2] >= 0 and r[3] <= r[5], r)
    page.locator('[data-elnew="plan"]').click(); page.wait_for_timeout(300)

    # Freier Grund
    check("Kein Papier und kein Plankopf auf dem Bildschirm", page.locator("#sheet .paper").count() == 0 and page.locator("#sheet .pl-printframe").count() == 1 and "Druckbereich A3 quer" in page.text_content("#sheet"))
    # Taste L und K
    key("l"); check("Taste L wählt Leitung", "Leitung" in page.inner_text("#hint") and page.get_attribute('[data-tool="pl-line"]', "aria-pressed") == "true"); key("v"); key("k")
    check("Taste K: Kanal, nicht mehr Leitung (CJ 27.10.2026)", page.get_attribute('[data-tool="pl-duct"]', "aria-pressed") == "true"); key("Escape"); key("v")

    # Rechteck: Raster aus, damit nur der Ausrichtungsfang wirkt. Innenlinie ab (1000|1000) im Uhrzeigersinn (Wand links = aussen).
    page.uncheck("#grid-on"); page.wait_for_timeout(80)
    key("w"); page.keyboard.down("Alt"); click(1000, 1000); page.keyboard.up("Alt")
    for L, a in [("4000", "0"), ("3000", "270")]: keys(L); key("Tab"); keys(a); key("Enter")
    page.mouse.move(*at(1030, -1980)); page.wait_for_timeout(120)  # nahe x = Anfang, y = letzter Punkt
    n_guides = page.evaluate("[...document.querySelectorAll('#svg path[stroke=\"#e08a00\"]')].length")
    check("Ausrichtungsfang: zwei orange Hilfslinien (Anfang senkrecht, letzter Punkt waagrecht)", n_guides == 2, n_guides)
    page.mouse.click(*at(1030, -1980)); page.wait_for_timeout(100)
    ws = of("wall")
    check("Wand 3 rastet auf x = Anfang: Innenlinie 5000|-2000 → 1000|-2000 (Länge 4000)", len(ws) == 3 and near(ws[2]["b"], [1000 + 0, ws[2]["b"][1]]) or False, [(w["a"], w["b"]) for w in ws])
    click(1000, 1000)  # Klick auf den Anfang schliesst
    ws = of("wall")
    ok_rect = len(ws) == 4 and near(ws[3]["b"], ws[0]["a"]) and all(abs((w["b"][0] - w["a"][0]) * (v["b"][0] - v["a"][0]) + (w["b"][1] - w["a"][1]) * (v["b"][1] - v["a"][1])) < 1e-6 for w, v in zip(ws, ws[1:] + ws[:1]))
    check("Raum geschlossen: 4 Wände, alle Ecken genau 90°, Ecke am Anfang auf Gehrung", ok_rect, [(w["a"], w["b"]) for w in ws])
    # Innenlinie: Rechteck der lichten Masse 4000 × 3000, Wände aussen
    xs = [w[k][0] for w in ws for k in ("a", "b")]; ys = [w[k][1] for w in ws for k in ("a", "b")]
    check("Wände liegen aussen: Mittellinie 4150 × 3150, Innenmass 4000 × 3000", abs(max(xs) - min(xs) - 4150) < 1e-6 and abs(max(ys) - min(ys) - 3150) < 1e-6 and abs(min(xs) - 925) < 1e-6 and abs(max(ys) - 1075) < 1e-6, (min(xs), max(xs), min(ys), max(ys)))
    key("Escape"); key("v")

    # Steckdose an der unteren (Innen-)Wand: Stiel an der Wand, Farbe blau
    page.check("#grid-on"); plsym(page, "STD"); click(3000, -1500)
    y = of("sym")[-1]
    check("Steckdose an der Wand nach oben in den Raum (r = 0, Stiel unten)", y["r"] == 0 and abs(y["at"][1] - (-2000 - 0)) < 80 + 5 and "col" not in y, y)
    check("Vorgabefarbe der Steckdose blau", "#0068c9" in page.inner_html("#items") and "#d4141c" not in page.inner_html("#items"))

    # Grundriss-Werkzeuge nur auf Hintergrund
    page.click('[data-plact="ladd"]'); page.wait_for_timeout(150); page.click(".modal [data-ok]"); page.wait_for_timeout(150)
    check("Neue Ebene aktiv: Wand, Tür/Fenster, Mass weg, Leitung bleibt", page.locator('[data-tool="pl-wall"], [data-plact="o:tuer"], [data-tool="pl-dim"]').count() == 0 and page.locator('[data-tool="pl-line"]').count() == 1)
    page.click("#pl-lay-cur"); page.wait_for_timeout(120); page.click("#pl-row-bg"); page.wait_for_timeout(100)
    check("Zurück auf Hintergrund: Grundriss-Werkzeuge wieder da", page.locator('[data-tool="pl-wall"]').count() == 1)

    # Fang aus ohne Tastatur (Touch): Knopf wirkt wie Alt, Raster 100 mm greift nicht
    key("w"); page.click('[data-plact="free"]'); page.wait_for_timeout(80)
    check("Knopf «Fang aus» gedrückt", page.get_attribute('[data-plact="free"]', "aria-pressed") == "true")
    n0 = len(of("wall")); click(2037, -513); click(3071, -513); key("Escape")
    w = of("wall")[n0:]
    check("Fang aus: Wand frei gesetzt, nicht auf dem Raster", len(w) == 1 and all(abs(v[0] % 100) > 1 for v in (w[0]["a"], w[0]["b"])), w)
    page.click('[data-plact="free"]'); page.wait_for_timeout(80); n0 = len(of("wall")); click(2537, -1213); click(3571, -1213); key("Escape")
    w = of("wall")[n0:]
    check("Fang wieder an: Wand rastet auf dem Raster (10 mm)", page.get_attribute('[data-plact="free"]', "aria-pressed") == "false" and len(w) == 1 and abs(w[0]["a"][0] % 10) < 1e-6 and abs(w[0]["a"][0] - 2537) < 10, w)
    key("v")

    # Neues Plan-Modul: eingepasst, nicht mit Zoom/Ausschnitt des vorigen Plans (lag dort, wo die Maus beim Zoomen war)
    s = page.locator("#svg").bounding_box(); page.mouse.move(s["x"] + 60, s["y"] + 60)
    for _ in range(6): page.mouse.wheel(0, -300); page.wait_for_timeout(40)
    page.click(".el-back"); page.wait_for_timeout(200)
    page.click("#el-addmod"); page.wait_for_timeout(200); page.locator('[data-elnew="plan"]').click(); page.wait_for_timeout(300)
    f = page.locator("#sheet .pl-printframe rect").bounding_box(); o = page.locator("#sheet .pl-origin").bounding_box()
    check("Neues Plan-Modul: Druckbereich ganz im Bild, Nullpunkt in der Mitte", f["x"] >= s["x"] and f["x"] + f["width"] <= s["x"] + s["width"] and f["y"] >= s["y"] and f["y"] + f["height"] <= s["y"] + s["height"] and abs(o["x"] + o["width"] / 2 - (s["x"] + s["width"] / 2)) < 5, (f, o, s))
    page.close(); b.close()
check("keine JS-Fehler", not errors, errors[:5])
if fails: print(f"{len(fails)} Fehler"); sys.exit(1)
print("plan_rueck_tests: alles ok")
