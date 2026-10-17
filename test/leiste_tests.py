# UI-Tests rechte Leiste Schema und Disposition (UI Schritt 6, 16.10.2026): Knöpfe „Schriftfeld“ und „Hauptlinien“ oben als Fenster,
# rechts nur Auswahl, Werkzeug und Stand. Aufruf aus web-src: python3 test/leiste_tests.py
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
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
    def go(i): page.click("#sheet-cur"); page.click(f'#sheet-menu [data-sheet="{i}"]'); page.wait_for_timeout(120)
    vis = lambda sel: page.is_visible(sel)
    page.goto(URL); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    page.click("[data-addsheet]"); page.wait_for_timeout(120)  # Blatt 3 und 4

    # Schema: Knöpfe oben, rechts nur Stand
    check("Schema: Knöpfe Schriftfeld und Hauptlinien oben, keine Stringplan-Knöpfe", vis("#btn-blatt") and vis("#btn-haupt") and not vis("#pv-bar"))
    check("Schema rechts ohne Auswahl: keine Felder, Stand der Hauptlinien, Blatt löschen", page.locator("#right input, #right select").count() == 0 and "kommt von Blatt 3" in page.inner_text("#right") and page.locator('#right [data-act="delsheet"]').count() == 1, page.inner_text("#right"))
    page.click("#btn-blatt"); page.wait_for_timeout(200)
    geo = page.evaluate("(() => { const m = document.querySelector('#pv-pop').getBoundingClientRect(), k = document.querySelector('#btn-blatt').getBoundingClientRect(); return [m.left - k.left, m.top - k.bottom, m.right <= innerWidth, m.bottom <= innerHeight]; })()")
    check("Fenster Schriftfeld hängt unter dem Knopf, im Bild", abs(geo[0]) < 1 and 0 <= geo[1] <= 8 and geo[2] and geo[3] and page.get_attribute("#btn-blatt", "aria-expanded") == "true", geo)
    check("Schriftfeld: Blatttitel, Blatt, Index, Projektangaben eingeklappt", page.locator("#pv-pop input[data-meta]:visible").count() == 3 and page.locator("#pv-pop details.proj").count() == 1)
    page.locator('#pv-pop input[data-meta="TITEL"]').fill("Unterverteilung UV1"); page.wait_for_timeout(80)
    check("Tippen lässt das Fenster offen", vis("#pv-pop") and page.evaluate("document.activeElement.dataset.meta") == "TITEL")
    page.keyboard.press("Escape"); page.wait_for_timeout(80)
    check("Esc schliesst, Fokus auf dem Knopf, Titel gesetzt", not vis("#pv-pop") and page.evaluate("document.activeElement.id") == "btn-blatt" and D()["sheets"][3]["meta"]["TITEL"] == "Unterverteilung UV1")
    page.click("#btn-haupt"); page.wait_for_timeout(120)
    check("Fenster Hauptlinien: Anfang, Ende, weitere Hauptlinie", page.locator("#pv-pop [data-mainl]").count() == 1 and page.locator("#pv-pop [data-mainr]").count() == 1 and page.locator('#pv-pop [data-act="addrail"]').count() == 1)
    page.select_option("#pv-pop [data-mainr]", "col:4"); page.wait_for_timeout(120)
    check("Ende ändern: Fenster bleibt offen, Stand rechts nachgeführt", vis("#pv-pop") and page.input_value("#pv-pop [data-mainr]") == "col:4" and "endet bei Spalte 4" in page.inner_text("#right"), page.inner_text("#right"))
    page.click("#btn-haupt"); page.wait_for_timeout(80)
    check("Zweiter Klick auf den Knopf schliesst", not vis("#pv-pop"))
    page.click("#btn-haupt"); page.mouse.click(800, 600); page.wait_for_timeout(80)
    check("Klick auf den Plan schliesst", not vis("#pv-pop"))
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)

    # Disposition: nur Schriftfeld
    page.click("#sheet-add", button="right"); page.click('[data-new="dispo"]'); page.wait_for_timeout(150)
    check("Dispo: Schriftfeld oben, keine Hauptlinien", vis("#btn-blatt") and not vis("#btn-haupt") and vis("#btn-handover"))
    check("Dispo rechts ohne Auswahl: keine Felder, kein doppeltes „An Schema“", page.locator("#right input").count() == 0 and page.locator('#right [data-act="handover"]').count() == 0 and page.locator('#right [data-act="delsheet"]').count() == 1)
    page.click("#btn-blatt"); page.wait_for_timeout(120)
    check("Dispo Schriftfeld: Objekt, Titel, Gezeichnet, Datum", page.locator("#pv-pop input[data-meta]").count() == 4)
    page.keyboard.press("Escape")
    # Titelseite, Stringplan: keine Schema-Knöpfe
    go(0); check("Titelseite: keine Knöpfe Schriftfeld/Hauptlinien", not vis("#doc-bar"))
    page.click("#sheet-add", button="right"); page.click('[data-new="pv"]'); page.wait_for_timeout(200)
    if page.locator(".modal").count(): page.keyboard.press("Escape")
    check("Stringplan: eigene Knöpfe, keine Schema-Knöpfe", vis("#pv-bar") and not vis("#doc-bar"))
    # Schmal: kein seitlicher Überlauf, Fenster im Bild
    go(2); page.set_viewport_size({"width": 390, "height": 800}); page.wait_for_timeout(200)
    check("390 px: kein seitlicher Überlauf", page.evaluate("document.documentElement.scrollWidth") <= 390, page.evaluate("document.documentElement.scrollWidth"))
    page.click("#btn-haupt"); page.wait_for_timeout(200)
    r = page.evaluate("(() => { const m = document.querySelector('#pv-pop').getBoundingClientRect(); return [m.left, m.right]; })()")
    check("390 px: Fenster Hauptlinien im Bild", r[0] >= 0 and r[1] <= 390, r)
    check("keine Fehler in der Konsole", not errors, errors[:3])
    b.close()
print(f"\n{len(fails)} Fehler" if fails else "\nLeiste: alle Tests ok")
sys.exit(1 if fails else 0)
