# UI-Tests Übersicht elplexaCAD, Stufe 2: Pfad, Reiter, Tipp-Zeile, Kürzel-Liste (Etappe 2b, CJ 20.10.2026). Vorher: node build.mjs elplexa
# Aufruf: python3 test/uebersicht_tests.py [Ausgabeordner]
import sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "ElplexaCAD.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="uebersicht_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    vis = lambda s: page.is_visible(s)
    page.goto(URL); page.wait_for_timeout(300)
    page.evaluate("localStorage.removeItem('elplexacad.tipp')"); page.reload(); page.wait_for_timeout(300)
    check("Pfad und nur Reiter, die etwas tun: Projekte (gewählt), Zeit, Profil", vis(".el-subbar") and "Projekte" in page.inner_text(".el-path") and page.evaluate("[...document.querySelectorAll('.el-tab')].map((t) => t.textContent)") == ["Projekte", "Zeit", "Profil"] and page.get_attribute("#el-tab-projekte", "aria-selected") == "true")
    check("Tipp-Zeile da", vis(".el-tip") and "Tipp" in page.inner_text(".el-tip"))
    page.screenshot(path=str(OUT / "u2b_1440.png"))
    order = page.evaluate("""() => { const n = (s) => document.querySelector(s), f = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return [f(n('#topbar'), n('.el-subbar')), f(n('.el-subbar'), n('.el-hubin')), f(n('.el-hubin'), n('.el-tip'))]; }""")
    check("Tab-Reihenfolge: Kopfleiste, Reiter, Inhalt, Tipp-Zeile", all(order), order)

    # Kürzel-Liste
    page.click(".el-helpbtn"); page.wait_for_timeout(200)
    t = page.inner_text(".modal")
    check("Knopf ? öffnet die Kürzel-Liste mit Datei- und Esc-Kürzeln", "Tasten" in t and "Speichern unter" in t and "Esc" in t)
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    check("Esc schliesst das Fenster, Übersicht bleibt", not vis(".modal") and vis("#el-hub"))
    page.evaluate("document.activeElement?.blur()"); page.keyboard.press("?"); page.wait_for_timeout(200)
    check("Taste ? öffnet die Liste", vis(".modal"))
    page.click("[data-tip]"); page.wait_for_timeout(250)
    check("Im Fenster: Tipp-Zeile ausblenden", not vis(".el-tip") and not vis(".modal"))
    page.reload(); page.wait_for_timeout(300)
    check("Ausgeblendet bleibt nach Neuladen", not vis(".el-tip"))
    page.evaluate("document.activeElement?.blur()"); page.keyboard.press("?"); page.wait_for_timeout(200)
    check("Fenster bietet «einblenden»", "einblenden" in page.inner_text("[data-tip]")); page.click("[data-tip]"); page.wait_for_timeout(250)
    check("Wieder eingeblendet", vis(".el-tip"))
    page.click(".el-tipx"); page.wait_for_timeout(200)
    check("× blendet die Tipp-Zeile aus", not vis(".el-tip"))
    page.evaluate("localStorage.removeItem('elplexacad.tipp')"); page.reload(); page.wait_for_timeout(300)

    # Esc: erst Menü, dann Übersicht bleibt
    page.click("#el-file"); page.wait_for_timeout(120); page.keyboard.press("Escape"); page.wait_for_timeout(150)
    check("Esc schliesst das Menü, Übersicht bleibt", not vis("#el-filemenu") and vis("#el-hub"))
    # schmal: heutiges Verhalten, keine zweite Stufe
    page.set_viewport_size({"width": 800, "height": 900}); page.wait_for_timeout(250)
    check("Unter 860 px: keine zweite Stufe", not vis(".el-subbar") and not vis(".el-tip"))
    check("keine Konsolenfehler", not errors, errors)
    b.close()
print("Rot:" + str(fails) if fails else "alle ok")
sys.exit(1 if fails else 0)
