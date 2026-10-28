# UI-Test Modul «Plan», Kommunikationssymbole (CJ 27.10.2026, Aufgaben Plan 6): Gruppen Telefon/EDV, Video/TV, Sonnerie in der Symbolleiste,
# Suche, Anschlüsse rasten an der Wand ein (wie die Steckdose), vier Fangpunkte, Anzahl am IT-Anschluss 4-fach, Drehen mit R, Stückliste (CSV),
# Datei Version 31. Vorher: node build.mjs elplexa. Aufruf: python3 test/plan_komm_tests.py [Ausgabeordner] (legt plan_komm.png ab).
import sys, tempfile, math
from pathlib import Path
from playwright.sync_api import sync_playwright
from elstart import projektansicht

def plsym(page, k):  # Symbolgruppen sind zu (CJ 26.10.2026): Gruppe aufklappen, dann Symbol wählen
    page.evaluate("k => document.querySelector(`[data-plsym='${k}']`).closest('section').querySelector('[data-plgrp][aria-expanded=false]')?.click()", k)
    page.click(f'[data-plsym="{k}"]')
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="plan_komm_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
WALL = ["TEL_STD", "TEL_ANS", "IT_RJ", "IT_RJ4", "RTV_STD"]
FREE = ["TEL_APP", "AMTSVERT", "ZWVERT", "RTV_VERT", "KAMERA", "KLINGEL", "SON_TASTER", "TUEROEFFNER", "GEGENSPRECH", "AUSSENSPRECH"]
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 900}, accept_downloads=True); page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(400); projektansicht(page)
    M = lambda: page.evaluate("window.__schemacad.model")
    of = lambda t: [x for x in M()["items"] if x["type"] == t]
    def key(k): page.evaluate("([k]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))", [k]); page.wait_for_timeout(60)
    def at(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.locator("#svg").bounding_box()
        return r["x"] + v["x"] + x * v["z"], r["y"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): page.mouse.click(*at(x, y)); page.wait_for_timeout(80)
    def move(x, y): page.mouse.move(*at(x, y)); page.wait_for_timeout(60)
    pins = lambda: page.locator('#overlay circle[stroke="#f4c400"]').count()

    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('[data-elnew="plan"]'); page.wait_for_timeout(300)
    body = page.inner_text("#left-body")
    check("Symbolleiste: Gruppen Telefon/EDV, Video/TV, Sonnerie", all(g in body for g in ["Telefon/EDV", "Video/TV", "Sonnerie"]), body[-400:])
    page.evaluate("document.activeElement?.blur()"); key("/"); page.keyboard.type("RJ"); page.wait_for_timeout(50)
    check("Suche «RJ»: IT-Anschlüsse auch in zugeklappter Gruppe", page.is_visible('[data-plsym="IT_RJ"]') and page.is_visible('[data-plsym="IT_RJ4"]') and not page.is_visible('[data-plsym="STD"]'))
    page.keyboard.press("Escape"); page.wait_for_timeout(50)

    # Wand unten (Innenfläche y 225), Anschlüsse an der Wand, übrige frei
    key("w"); page.keyboard.down("Alt"); click(75, 75); page.keyboard.up("Alt"); page.keyboard.type("8000"); page.keyboard.press("Enter"); page.wait_for_timeout(100); key("Escape"); key("Escape")
    for n, k in enumerate(WALL): plsym(page, k); click(600 + n * 1200, 200)
    for n, k in enumerate(FREE): plsym(page, k); click(600 + (n % 5) * 1500, 1500 + (n // 5) * 1200)
    key("Escape"); key("v")
    sy = {i["key"]: i for i in of("sym")}
    check("alle 15 Symbole gesetzt", sorted(sy) == sorted(WALL + FREE), sorted(sy))
    check("Anschlüsse rasten an der Wand ein (Innenfläche y 225, r 0), Standardhöhe nicht gespeichert", all(sy[k]["at"][1] == 225 and sy[k]["r"] == 0 and "h" not in sy[k] for k in WALL), [sy[k] for k in WALL])
    check("übrige frei gesetzt", all(sy[k]["at"][1] >= 1500 for k in FREE), [sy[k]["at"] for k in FREE])
    # Fang: vier Punkte am Ende des Anschlusses (wie Steckdose)
    page.mouse.click(*at(-2000, -2000)); key("l"); x0 = sy["IT_RJ"]["at"][0]; move(x0, 225 + 3.6 * 50 + 30)
    check("Leitung nah am IT-Anschluss: vier Fangpunkte", pins() == 4, pins())
    key("Escape"); key("Escape"); key("v")

    # IT-Anschluss 4-fach: Anzahl änderbar
    x4 = sy["IT_RJ4"]["at"][0]; click(x4, 225 + 60)
    check("IT-Anschluss 4-fach gewählt: Feld Anzahl (4)", page.locator('[data-plf="num"]').count() == 1 and page.input_value('[data-plf="num"]') == "4")
    page.fill('[data-plf="num"]', "8"); page.press('[data-plf="num"]', "Enter"); page.wait_for_timeout(100)
    it = next(i for i in of("sym") if i["key"] == "IT_RJ4")
    check("Anzahl 8 gespeichert und im Plan", it.get("num") == "8" and ">8<" in page.inner_html("#items"), it)
    page.evaluate("document.activeElement?.blur()")
    kl = sy["KLINGEL"]; click(kl["at"][0], kl["at"][1]); key("r")
    check("R dreht die Klingel", next(i for i in of("sym") if i["key"] == "KLINGEL")["r"] == 90)
    page.mouse.click(*at(-2000, -2000)); key("f"); page.wait_for_timeout(150)
    page.screenshot(path=str(OUT / "plan_komm.png"))

    # Stückliste CSV: neue Gruppen
    page.click("#btn-pvdruck"); page.wait_for_timeout(200)
    with page.expect_download() as dl: page.click('[data-plact="bomcsv"]')
    csv = Path(dl.value.path()).read_text(encoding="utf-8")
    check("CSV: Gruppen Telefon/EDV, Video/TV, Sonnerie", "Telefon/EDV;IT-Anschluss RJ 4-fach;1" in csv and "Video/TV;Kamera;1" in csv and "Sonnerie;Türöffner;1" in csv, csv)
    page.keyboard.press("Escape"); page.wait_for_timeout(100)

    d = page.evaluate("window.__schemacad.doc")
    check("Datei: Version 31 mit Kommunikationssymbolen", d["version"] == 31, d["version"])
    b.close()

check("keine Fehler in der Konsole", not errors, errors[:5])
print(f"\nBild: {OUT}")
if fails: print(f"{len(fails)} Fehler"); sys.exit(1)
print("Alle Kommunikationssymbol-Tests grün.")
