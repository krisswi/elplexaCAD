# UI-Test Räume im Plan (CJ 30.10.2026, nur elplexaCAD): geschlossener Raum wird erkannt und auf dem Hintergrund beschriftet («Raum 1», Fläche),
# Zwischenwand → «Raum 2», umbenennen, Textgrösse, ausblenden (Druck ohne), Entf blendet aus, Rückgängig, Verschieben bleibt beim Raum.
# Werkzeug Raum (U): Grenze von Hand im offenen Grundriss, Linie nur auf der Ebene Hintergrund, Ecke ziehen, Entf löscht.
# Stückliste nach Räumen (CJ 31.10.2026): Druck (Raumblöcke, Total) und CSV (Spalte Raum).
# Vorher: node build.mjs elplexa. Aufruf: python3 test/plan_raum_tests.py [Bild.png]
import sys, tempfile, math
from pathlib import Path
from playwright.sync_api import sync_playwright
from elstart import projektansicht
ROOT = Path(__file__).resolve().parent.parent
SHOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="plan_raum_")) / "raeume.png"
errors, fails = [], []
def plsym(page, k):  # Gruppe aufklappen, dann Symbol wählen
    page.evaluate("k => document.querySelector(`[data-plsym='${k}']`).closest('section').querySelector('[data-plgrp][aria-expanded=false]')?.click()", k)
    page.click(f'[data-plsym="{k}"]')
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

    # Stückliste nach Räumen: Steckdose in «Raum 2» (links), zwei Leuchten in «Wohnen» (rechts)
    key("Escape"); plsym(page, "STD"); page.mouse.click(*at(1000, 2000)); key("Escape")
    plsym(page, "LEUCHTE"); page.mouse.click(*at(3500, 1500)); page.mouse.click(*at(4500, 2500)); key("Escape"); key("v")
    page.click("#btn-pvdruck"); page.wait_for_timeout(200)
    with page.expect_download() as dl: page.click('[data-plact="bomcsv"]')
    csv = Path(dl.value.path()).read_bytes().decode("utf-8").split("\r\n")
    check("CSV: Spalte Raum, Blöcke nach Name, dann Total", csv[:5] == ["Raum;Gruppe;Symbol;Anzahl", "Raum 2;Steckdosen;Steckdose T13 (Schutzkontakt), UP;1", "Wohnen;Leuchten;Leuchte an Decke;2", "Total;Steckdosen;Steckdose T13 (Schutzkontakt), UP;1", "Total;Leuchten;Leuchte an Decke;2"], csv)
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    page.evaluate("""window.__open = []; window.open = (u) => { window.__open.push(u); return {}; }; window.__pr = '';
      new MutationObserver(() => { const h = document.querySelector('#printroot').innerHTML; if (h) window.__pr = h; }).observe(document.querySelector('#printroot'), { childList: true }); 0""")
    key("0"); page.wait_for_timeout(200); page.click("#el-tile-plan [data-elpdf]")
    page.wait_for_function("window.__open.length > 0", timeout=60000)
    bom = page.evaluate("[...new DOMParser().parseFromString(window.__pr, 'text/html').querySelectorAll('svg')].at(-1).textContent")
    check("Druck: Raum 2, Wohnen mit Fläche, dann Total mit Gruppen", 0 < bom.index("Raum 2") < bom.index("Wohnen") < bom.index("Total") < bom.index("Steckdosen") and "m²" in bom and bom.index("Leuchten") > bom.index("Total"), bom[:400])
    (SHOT.parent / "stueckliste.html").write_text("<!doctype html><meta charset=utf-8><style>svg{display:block;width:210mm;border:1px solid #ccc}</style>" + page.evaluate("[...new DOMParser().parseFromString(window.__pr, 'text/html').querySelectorAll('svg')].at(-1).outerHTML"))
    page.click("#el-tile-plan"); page.wait_for_timeout(300)

    # Werkzeug Raum (U, CJ 30.10.2026): frische Seite, neuer Plan, drei Wände (offen), Grenze von Hand
    page = b.new_page(viewport={"width": 1400, "height": 900}); page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; delete window.showDirectoryPicker;")
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(400); projektansicht(page)
    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('[data-elnew="plan"]'); page.wait_for_timeout(300)
    key("w"); page.keyboard.down("Alt"); page.mouse.click(*at(75, 75)); page.keyboard.up("Alt")
    for L, a in [("5850", "0"), ("3850", "90"), ("5850", "180")]:
        keys(L); key("Tab"); keys(a); key("Enter")
    key("Escape"); key("Escape")
    check("Offener Grundriss: kein Raum erkannt", rooms() == [])
    key("u"); page.wait_for_timeout(80)
    check("Taste U: Werkzeug Raum", "Neuer Raum" in page.inner_text("#right"), page.inner_text("#right")[:120])
    for x, y in [(75, 75), (5925, 75), (5925, 3925), (75, 3925), (75, 75)]:
        page.mouse.click(*at(x, y)); page.wait_for_timeout(60)
    r = rooms()
    check("Grenze von Hand: «Raum 1» mit 4 Ecken, 22,5 m²", len(r) == 1 and r[0]["name"] == "Raum 1" and len(r[0].get("poly", [])) == 4 and "22,5 m²" in page.evaluate("document.querySelector('#svg').textContent"), r)
    edge = lambda: page.evaluate("document.querySelector('#svg .pl-items').innerHTML.includes('#2f9e58')")
    check("Grüne Grenze auf der Ebene Hintergrund sichtbar", edge())
    page.click('[data-plact="ladd"]'); page.wait_for_timeout(150); page.click(".modal [data-ok]"); page.wait_for_timeout(200)  # zweite Ebene, wird aktiv
    check("Andere Ebene aktiv: Grenze weg, Name bleibt", not edge() and "Raum 1" in page.evaluate("document.querySelector('#svg').textContent"), page.evaluate("window.__schemacad.model.alay"))
    page.click('[data-plact="lstep"]:not([disabled])'); page.wait_for_timeout(150)
    key("v"); rid = r[0]["id"]
    page.mouse.click(*at(*r[0]["at"])); page.wait_for_timeout(120)
    check("Rechts: Grenze von Hand", "Grenze von Hand" in page.inner_text("#right"), page.inner_text("#right")[:200])
    page.mouse.move(*at(5925, 3925)); page.mouse.down(); page.keyboard.down("Alt"); page.mouse.move(*at(6925, 3925), steps=6); page.keyboard.up("Alt"); page.mouse.up(); page.wait_for_timeout(150)
    pr = next(x for x in rooms() if x["id"] == rid)
    check("Ecke ziehen ändert die Grenze", any(abs(q[0] - 6925) < 30 and abs(q[1] - 3925) < 30 for q in pr["poly"]), pr["poly"])
    key("Delete"); page.wait_for_timeout(150)
    check("Entf löscht den Raum mit Grenze", rooms() == [], rooms())
    page.keyboard.press("Meta+z"); page.wait_for_timeout(150)
    check("Rückgängig: Raum wieder da", len(rooms()) == 1)
    b.close()
check("Keine Fehler in der Konsole", not errors, errors)
print(f"Bild: {SHOT}")
if fails: print(f"{len(fails)} Fehler"); sys.exit(1)
print("Alle Raum-Tests grün.")
