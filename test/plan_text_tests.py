# UI-Test Modul «Plan», Text-Werkzeug (CJ 28.10.2026, Plan Runde 3, Taste T): Klick setzt, Text eingeben, Wahl, Text und Grösse ändern,
# Farbe, R dreht (lesbar), Ziehen, Rückgängig, Kopieren, Stückliste ohne Texte, Dateiversion 33, Speichern/Laden.
# Vorher: node build.mjs elplexa. Aufruf: python3 test/plan_text_tests.py [Ausgabeordner]
import sys, tempfile, json
from pathlib import Path
from playwright.sync_api import sync_playwright
from elstart import projektansicht

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="plan_text_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 900}, accept_downloads=True); page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; delete window.showDirectoryPicker;")
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(400); projektansicht(page)
    M = lambda: page.evaluate("window.__schemacad.model")
    sel = lambda: page.evaluate("[...window.__schemacad.sel]")
    texts = lambda: [x for x in M()["items"] if x["type"] == "text"]
    def key(k): page.evaluate("([k]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))", [k]); page.wait_for_timeout(60)
    def at(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.locator("#svg").bounding_box()
        return r["x"] + v["x"] + x * v["z"], r["y"] + v["y"] + (210 - y) * v["z"]
    def click(x, y):
        page.evaluate("document.querySelectorAll('#toasts .toast').forEach((e) => e.remove())")
        page.mouse.click(*at(x, y)); page.wait_for_timeout(80)
    def blur(): page.evaluate("document.activeElement?.blur()")
    def dialog(t):
        page.wait_for_selector(".modal input"); page.fill(".modal input", t); page.click('.modal :text("Setzen")'); page.wait_for_timeout(100)

    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('[data-elnew="plan"]'); page.wait_for_timeout(300)
    # Wand als Bezug, dann einpassen (sonst 1 % Zoom)
    key("w"); page.keyboard.down("Alt"); click(75, 75); page.keyboard.up("Alt"); page.keyboard.type("8000"); page.keyboard.press("Enter"); page.wait_for_timeout(100); key("Escape"); key("Escape")
    key("v"); key("f"); page.wait_for_timeout(150)

    key("t")
    check("Taste T: Werkzeug Text", page.get_attribute('[data-tool="pl-text"]', "aria-pressed") == "true" and "Text" in page.inner_text("#hint"))
    click(2000, 2000); dialog("Küche")
    t = texts()
    check("Klick + Eingabe setzt Text (Raster 10 mm)", len(t) == 1 and t[0]["txt"] == "Küche" and t[0]["at"] == [2000, 2000] and "r" not in t[0] and "col" not in t[0], t)
    check("Text im Plan", ">Küche<" in page.inner_html("#items"))
    click(4000, 2000); page.wait_for_selector(".modal input"); page.click('.modal :text("Abbrechen")'); page.wait_for_timeout(100)
    check("Abbrechen setzt nichts", len(texts()) == 1)
    key("Escape"); key("v")

    # Wahl und rechte Leiste
    click(2000, 2000)
    tid = texts()[0]["id"]
    check("Klick wählt den Text", sel() == [tid] and page.input_value('[data-plf="ttxt"]') == "Küche", sel())
    page.fill('[data-plf="ttxt"]', "Wohnen / Essen"); page.press('[data-plf="ttxt"]', "Enter"); page.wait_for_timeout(80)
    page.fill('[data-pltf="sel"]', "150"); page.press('[data-pltf="sel"]', "Enter"); page.wait_for_timeout(80)
    page.click('[data-plcol="#d4141c"]'); page.wait_for_timeout(80)
    t = texts()[0]
    check("Text, Grösse 150 %, Farbe rot", t["txt"] == "Wohnen / Essen" and t.get("tf") == 1.5 and t.get("col") == "#d4141c", t)
    blur(); key("r"); key("r")
    check("R zweimal: 180° (Text bleibt lesbar)", texts()[0].get("r") == 180 and 'rotate(0)' in page.inner_html("#items"), texts()[0])
    key("r"); key("r"); check("R noch zweimal: 0°, Feld fällt weg", "r" not in texts()[0])

    # Ziehen, Rückgängig, Kopieren
    page.mouse.move(*at(2000, 2000)); page.mouse.down(); page.mouse.move(*at(2500, 1500), steps=5); page.mouse.up(); page.wait_for_timeout(80)
    check("Ziehen verschiebt den Text", texts()[0]["at"] == [2500, 1500], texts()[0]["at"])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("Rückgängig", texts()[0]["at"] == [2000, 2000], texts()[0]["at"])
    page.keyboard.press("Meta+d"); page.wait_for_timeout(80)
    check("⌘D kopiert den Text", len(texts()) == 2 and texts()[1]["txt"] == "Wohnen / Essen")

    page.screenshot(path=str(OUT / "plan_text.png"))
    d = page.evaluate("window.__schemacad.doc"); check("Datei: Version 33", d["version"] == 33, d["version"])
    blur()
    with page.expect_download() as dl: page.keyboard.press("Shift+Meta+s")
    out = OUT / "plan_text.elplexa.json"; dl.value.save_as(str(out)); page.wait_for_timeout(300)
    raw = json.loads(out.read_text())
    pl = next(s for s in raw["sheets"] if s.get("kind") == "plan")
    check("Gespeichert: Version 33, zwei Texte", raw["version"] == 33 and sum(1 for i in pl["items"] if i["type"] == "text") == 2)
    blur()
    with page.expect_file_chooser() as fc:
        page.keyboard.press("Meta+o"); page.wait_for_timeout(300)
        if page.is_visible(".modal"): page.click('.modal :text("Trotzdem öffnen")')
    fc.value.set_files(str(out)); page.wait_for_timeout(600)
    pl2 = next(s for s in page.evaluate("window.__schemacad.doc")["sheets"] if s.get("kind") == "plan")
    check("Laden: Texte bleiben", [i for i in pl2["items"] if i["type"] == "text"] == [i for i in pl["items"] if i["type"] == "text"])
    b.close()

check("keine Fehler in der Konsole", not errors, errors[:5])
print(f"\nBild: {OUT}")
if fails: print(f"{len(fails)} Fehler"); sys.exit(1)
print("plan_text_tests: alles ok")
