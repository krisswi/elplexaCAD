# UI-Tests für die Startauswahl (Schema, Disposition, Stringplan). Aufruf aus web-src: python3 test/start_tests.py [Ausgabeordner]
import sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="start_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    D = lambda: page.evaluate("window.__schemacad.doc")
    kind = lambda: page.evaluate("window.__schemacad.kind")
    page.goto(URL); page.wait_for_timeout(300)
    check("Startauswahl erscheint beim Öffnen", page.is_visible(".modal.start") and page.locator(".start-tile").count() == 3)
    page.screenshot(path=str(OUT / "s1_start.png"))
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    check("Abbrechen lässt das leere Schemablatt stehen", kind() == "schema" and len(D()["sheets"]) == 4 and len(D()["sheets"][2]["items"]) > 0)
    page.click("#btn-new"); page.click('[data-start="dispo"]'); page.wait_for_timeout(150)
    d = D()
    check("Neu → Disposition: ein Dispositionsblatt, ohne Titelseite und Inhalt (Umbau 15.10.)", kind() == "dispo" and len(d["sheets"]) == 1 and d["sheets"][0].get("sid") and d["sheets"][0]["meta"]["BLATT"] == "1" and page.is_visible("#btn-handover"))
    page.click("#btn-new"); page.click('[data-start="pv"]'); page.wait_for_timeout(150)
    check("Neu → Stringplan: ein Stringplan-Blatt, ohne Titelseite und Inhalt", kind() == "pv" and len(D()["sheets"]) == 1)
    page.click("#btn-new"); page.click(".modal [data-c]"); page.wait_for_timeout(100)
    check("Neu → Abbrechen ändert nichts", kind() == "pv" and page.locator(".modal").count() == 0)
    page.click("#btn-new"); page.click('[data-start="schema"]'); page.wait_for_timeout(150)
    check("Neu → Schema: Blatt mit Grundverkabelung", kind() == "schema" and any(i.get("tag") == "grund" for i in D()["sheets"][2]["items"]) and D()["sheets"][2]["meta"]["BLATT"] == "3")
    d = D()
    check("Neu: Titelseite Blatt 1 und Inhalt Blatt 2 davor", [s.get("kind") for s in d["sheets"][:2]] == ["title", "toc"] and [s["meta"]["BLATT"] for s in d["sheets"][:2]] == ["1", "2"] and d["active"] == 2 and d["version"] == 5)
    # Ungespeicherte Änderung: erst wählen, dann Rückfrage
    page.locator('input[data-meta="TITEL"]').fill("Test"); page.locator("#svg").focus(); page.wait_for_timeout(500)
    page.click("#btn-new"); page.click('[data-start="dispo"]'); page.wait_for_timeout(100)
    check("Bei Änderungen kommt die Rückfrage", page.is_visible('.modal [data-r="1"]'))
    page.click('.modal [data-r="0"]'); page.wait_for_timeout(100)
    check("Rückfrage abbrechen behält das Dokument", kind() == "schema" and D()["sheets"][2]["meta"].get("TITEL") == "Test")
    # Wiederhergestellte Sitzung: keine Startauswahl
    page.reload(); page.wait_for_timeout(300)
    check("Nach Wiederherstellen keine Startauswahl", page.locator(".modal").count() == 0 and D()["sheets"][2]["meta"].get("TITEL") == "Test")
    page.set_viewport_size({"width": 400, "height": 800})
    page.evaluate("localStorage.clear()"); page.reload(); page.wait_for_timeout(300)
    w = page.evaluate("(()=>{const m=document.querySelector('.modal.start');return m && m.scrollWidth <= m.clientWidth})()")
    check("Schmales Fenster: Kacheln untereinander, nichts läuft über", w)
    page.screenshot(path=str(OUT / "s2_schmal.png"))
    b.close()
check("keine JS-Fehler", not errors, errors)
print("FEHLER:" if fails else "ALLE OK", fails, "| Ausgaben:", OUT)
sys.exit(1 if fails else 0)
