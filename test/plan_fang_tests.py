# UI-Test Modul «Plan», Rückmeldung CJ 26.10.2026: Raster 10 mm, Leitung geschwungen (B-Spline, erstes Stück gerade), kein Ausrichtungsfang
# bei Leitungen, Fang am Schalter (Kreismitte, vier Punkte am Rand, dreht mit R), Steckdose vier Punkte, Abzweigdose alle Seiten, Fangpunkte bei
# Annäherung sichtbar. Vorher: node build.mjs elplexa. Aufruf: python3 test/plan_fang_tests.py [Ausgabeordner] (legt plan_fang.png ab).
import sys, tempfile, math
from pathlib import Path
from playwright.sync_api import sync_playwright

def plsym(page, k):  # Symbolgruppen sind zu (CJ 26.10.2026): Gruppe aufklappen, dann Symbol wählen
    page.evaluate("k => document.querySelector(`[data-plsym='${k}']`).closest('section').querySelector('[data-plgrp][aria-expanded=false]')?.click()", k)
    page.click(f'[data-plsym="{k}"]')
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="plan_fang_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 900}); page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(400)
    M = lambda: page.evaluate("window.__schemacad.model")
    of = lambda t: [x for x in M()["items"] if x["type"] == t]
    def key(k): page.evaluate("([k]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))", [k]); page.wait_for_timeout(60)
    def at(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.locator("#svg").bounding_box()
        return r["x"] + v["x"] + x * v["z"], r["y"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): page.mouse.click(*at(x, y)); page.wait_for_timeout(80)
    def move(x, y): page.mouse.move(*at(x, y)); page.wait_for_timeout(60)
    near = lambda a, q, tol=0.5: math.hypot(a[0] - q[0], a[1] - q[1]) < tol
    pins = lambda: page.locator('#overlay circle[stroke="#f4c400"]').count()

    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('[data-elnew="plan"]'); page.wait_for_timeout(300)
    check("Raster Vorgabe 10 mm", page.input_value("#grid-size") == "10", page.input_value("#grid-size"))

    # Wand unten (Innenkante y 75), Schalter und Steckdose an der Wand, Abzweigdose frei
    key("w"); page.keyboard.down("Alt"); click(75, 75); page.keyboard.up("Alt"); page.keyboard.type("3850"); page.keyboard.press("Enter"); page.wait_for_timeout(100); key("Escape"); key("Escape")
    plsym(page, "SCH0"); click(1000, 200)
    plsym(page, "STD"); click(3000, 200)
    plsym(page, "DOSE"); click(2000, 1500)
    key("Escape"); key("v")
    sw, so, ab = (next(i for i in of("sym") if i["key"] == k) for k in ("SCH0", "STD", "DOSE"))
    check("Schalter und Steckdose an der Wand, Dose frei", sw["at"][1] == 225 and so["at"][1] == 225 and ab["at"] == [2000, 1500], (sw, so, ab))
    page.mouse.click(*at(-2000, -2000)); key("f"); page.wait_for_timeout(150)
    z = page.evaluate("window.__schemacad.view")["z"]; t = 10 / z  # Fangweite in mm

    # Fangpunkte erst bei Annäherung sichtbar
    key("l"); move(500, 1500)
    check("Fern: keine Fangpunkte", pins() == 0, pins())
    move(1000, 400)
    check("Nah am Schalter: vier Fangpunkte", pins() == 4, pins())
    move(2000, 1500 + 90)
    check("Nah an der Dose: Seiten markiert", page.locator('#overlay path[stroke="#f4c400"]').count() == 4)

    # Leitung: oben am Schalter (Kreis 225 + 2,2 × 50 = 335, oben 385), Punkt über der Dose, an der Dosenseite oben
    cx, cy = sw["at"][0], sw["at"][1] + 110
    click(cx + 0.4 * t, cy + 50 + 0.4 * t); click(1600, 1300); click(1993 + 0.3 * t, 1575 + 0.4 * t); key("Enter")
    ln = of("line")[-1]
    check("Leitung beginnt am oberen Fangpunkt des Schalters", near(ln["pts"][0], [cx, cy + 50]), ln["pts"])
    check("Leitung endet auf der oberen Seite der Dose, frei entlang der Seite", abs(ln["pts"][-1][1] - 1575) < 1e-6 and abs(ln["pts"][-1][0] - (1993 + 0.3 * t)) < 2, ln["pts"])
    check("Mittelpunkt auf dem 10-mm-Raster", ln["pts"][1] == [1600, 1300], ln["pts"])
    check("Neue Leitung geschwungen (Vorgabe)", ln.get("curve") is True and len(ln["pts"]) == 3)
    d = page.get_attribute("#items .pl-items path[stroke='#0068c9']", "d")
    check("Kurve als Bézier gezeichnet", d and "C" in d, d)
    # Abzweigdose: andere Seiten, ohne Ausrichtungslinien
    key("l"); click(2075 + 0.4 * t, 1460); move(2600, 1460 + 0.3 * t)
    check("Leitung: keine orangen Ausrichtungslinien", page.locator('#overlay path[stroke="#e08a00"]').count() == 0)
    click(2600, 1000); key("Enter")
    l2 = of("line")[-1]
    check("Rechte Seite der Dose fängt", abs(l2["pts"][0][0] - 2075) < 1e-6 and abs(l2["pts"][0][1] - 1460) < 2, l2["pts"])

    # Schalter mit R drehen: Fangpunkte drehen mit
    key("v"); page.mouse.click(*at(cx, cy)); page.wait_for_timeout(80); key("r"); page.wait_for_timeout(100)
    sw2 = next(i for i in of("sym") if i["key"] == "SCH0")
    if sw2["r"] != sw["r"]:
        a = math.radians(sw2["r"]); top = [sw2["at"][0] - math.sin(a) * 160, sw2["at"][1] + math.cos(a) * 160]
        key("l"); click(top[0] + 0.3 * t, top[1] - 0.3 * t); page.keyboard.down("Alt"); click(top[0] - 800, top[1] + 800); page.keyboard.up("Alt"); key("Enter")
        check("Gedrehter Schalter: Fangpunkt mitgedreht", near(of("line")[-1]["pts"][0], top, 1), (of("line")[-1]["pts"][0], top))
        page.keyboard.press("Meta+z"); page.wait_for_timeout(80); key("v"); page.mouse.click(*at(cx, cy)); key("r"); key("r"); key("r")
    else:
        check("R dreht den gewählten Schalter", False, sw2)
    # Fang aus: keine Fangpunkte
    key("l"); page.keyboard.down("Alt"); move(1000, 401); check("Alt: keine Fangpunkte", pins() == 0, pins()); page.keyboard.up("Alt"); key("Escape"); key("v")

    # Zickzack mit fünf Punkten: glatt, ohne Wellen, bleibt zwischen den Punkten
    key("l"); page.keyboard.down("Alt")
    for q in [(300, 2500), (1000, 3200), (1700, 2500), (2400, 3200), (3100, 2500)]: click(*q)
    page.keyboard.up("Alt"); key("Enter"); key("Escape"); key("v")
    zz = of("line")[-1]
    ys = page.evaluate("(() => { const p = document.querySelectorAll(\"#items .pl-items path[stroke='#0068c9']\"); const e = p[p.length - 1]; const n = e.getTotalLength(), out = []; for (let i = 0; i <= 100; i++) out.push(e.getPointAtLength(n * i / 100).y); return out; })()")
    check("Zickzack: Kurve bleibt zwischen den Punkten (keine Welle darüber hinaus)", len(zz["pts"]) == 5 and min(ys) >= 2500 - 1 and max(ys) <= 3200 + 1, (min(ys), max(ys)))

    # Bild: Leitung glatt, erstes Stück gerade
    page.mouse.click(*at(-2000, -2000)); page.mouse.move(5, 5); page.wait_for_timeout(150)
    page.locator("#stage").screenshot(path=str(OUT / "plan_fang.png"))
    print("Bild:", OUT / "plan_fang.png")
    check("keine Fehler in der Konsole", not errors, errors)
    b.close()
if fails: print(f"{len(fails)} FAIL"); sys.exit(1)
print("plan_fang_tests: alles ok")
