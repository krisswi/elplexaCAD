# UI-Test Räume im Plan (CJ 30.10.2026, nur elplexaCAD): geschlossener Raum wird erkannt und auf dem Hintergrund beschriftet («Raum 1», Fläche),
# Zwischenwand → «Raum 2», umbenennen, Textgrösse, ausblenden (Druck ohne), Entf blendet aus, Rückgängig, Verschieben bleibt beim Raum.
# Vorher: node build.mjs elplexa. Aufruf: python3 test/plan_raum_tests.py [Bild.png]
import sys, tempfile, math
from pathlib import Path
from playwright.sync_api import sync_playwright
from elstart import projektansicht
ROOT = Path(__file__).resolve().parent.parent
SHOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="plan_raum_")) / "raeume.png"
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 900}); page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; delete window.showDirectoryPicker;")
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(400); projektansicht(page)
    M = lambda: page.evaluate("window.__schemacad.model")
    rooms = lambda: [i for i in M()["items"] if i["type"] == "room"]
    def key(k):
        page.evaluate("([k]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))", [k]); page.wait_for_timeout(60)
    def keys(s):
        for c in s: key(c)
    def at(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.locator("#svg").bounding_box()
        return r["x"] + v["x"] + x * v["z"], r["y"] + v["y"] + (210 - y) * v["z"]
    def field(sel_, v): page.fill(sel_, v); page.press(sel_, "Enter"); page.wait_for_timeout(120)

    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('[data-elnew="plan"]'); page.wait_for_timeout(300)
    # Raum 6000 × 4000 (Mittellinie), Innenkante gezeichnet wie in plan_tests.py
    key("w"); page.keyboard.down("Alt"); page.mouse.click(*at(75, 75)); page.keyboard.up("Alt")
    for L, a in [("5850", "0"), ("3850", "90"), ("5850", "180")]:
        keys(L); key("Tab"); keys(a); key("Enter")
    check("Offen (3 Wände): noch kein Raum", rooms() == [])
    page.mouse.click(*at(75, 75)); page.wait_for_timeout(150)
    key("Escape"); key("v"); key("f"); page.wait_for_timeout(200)
    r = rooms()
    check("Geschlossen: «Raum 1» auf dem Hintergrund, in der Mitte", len(r) == 1 and r[0]["name"] == "Raum 1" and r[0]["layer"] == "bg" and abs(r[0]["at"][0] - 3000) < 2 and abs(r[0]["at"][1] - 2000) < 2, r)
    svgt = page.evaluate("document.querySelector('#svg').textContent")
    check("Beschriftung mit Innenfläche (5,85 × 3,85 = 22,5 m²)", "Raum 1" in svgt and "22,5 m²" in svgt, svgt[-200:])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(150)
    check("Ein Rückgängig nimmt letzte Wand und Raum zurück", rooms() == [] and len([i for i in M()["items"] if i["type"] == "wall"]) == 3)
    page.keyboard.press("Shift+Meta+z"); page.wait_for_timeout(150)
    check("Wiederholen: Raum wieder da", [x["name"] for x in rooms()] == ["Raum 1"])

    # Zwischenwand bei x = 2000 (T-Stoss an den Aussenwänden): «Raum 2», Raum 1 behält den Namen
    key("w"); page.keyboard.down("Alt"); page.mouse.click(*at(2000, 75)); page.keyboard.up("Alt")
    keys("3850"); key("Tab"); keys("90"); key("Enter"); key("Escape"); key("Escape"); key("v")
    names = sorted(x["name"] for x in rooms())
    check("Zwischenwand: zweiter Raum «Raum 2»", names == ["Raum 1", "Raum 2"], rooms())

    # Wählen, umbenennen, Grösse, ausblenden
    r1 = next(x for x in rooms() if x["name"] == "Raum 1")
    page.mouse.click(*at(*r1["at"])); page.wait_for_timeout(150)
    check("Klick auf den Namen wählt den Raum", page.evaluate("[...window.__schemacad.sel]") == [r1["id"]] and "Raum" in page.inner_text("#right") and "m² innen" in page.inner_text("#right"), page.inner_text("#right")[:200])
    field('[data-plf="rname"]', "Wohnen")
    field('[data-pltf="sel"]', "150")
    r1 = next(x for x in rooms() if x["id"] == r1["id"])
    check("Umbenannt, Schriftgrösse 150 %", r1["name"] == "Wohnen" and r1.get("tf") == 1.5, r1)
    page.click('[data-plf="rna"]'); page.wait_for_timeout(120)
    check("Fläche ausblendbar", next(x for x in rooms() if x["id"] == r1["id"]).get("na") is True)
    page.click('[data-plf="rna"]'); page.wait_for_timeout(120)
    page.screenshot(path=str(SHOT))
    page.click('[data-plf="rhide"]'); page.wait_for_timeout(120)
    check("Beschriftung ausgeblendet", next(x for x in rooms() if x["id"] == r1["id"]).get("hide") is True)
    page.click('[data-plf="rhide"]'); page.wait_for_timeout(120)

    # Entf: ausblenden statt löschen (sonst käme der Raum als «Raum n» wieder)
    page.mouse.click(*at(*r1["at"])); page.wait_for_timeout(120); key("Delete"); page.wait_for_timeout(150)
    rr = rooms()
    check("Entf blendet den Raumnamen aus, löscht ihn nicht", len(rr) == 2 and next(x for x in rr if x["id"] == r1["id"]).get("hide") is True and "ausgeblendet" in page.inner_text("#toasts"), rr)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(150)
    # Verschieben bleibt beim Raum
    r2 = next(x for x in rooms() if x["name"] == "Raum 2")
    page.mouse.move(*at(*r2["at"])); page.mouse.down(); page.mouse.move(*at(r2["at"][0] + 800, r2["at"][1] + 600), steps=6); page.mouse.up(); page.wait_for_timeout(150)
    r2b = next(x for x in rooms() if x["id"] == r2["id"])
    check("Name ziehen: verschoben, kein neuer Raum", abs(r2b["at"][0] - r2["at"][0] - 800) < 20 and len(rooms()) == 2, (r2["at"], r2b["at"]))
    b.close()
check("Keine Fehler in der Konsole", not errors, errors)
print(f"Bild: {SHOT}")
if fails: print(f"{len(fails)} Fehler"); sys.exit(1)
print("Alle Raum-Tests grün.")
