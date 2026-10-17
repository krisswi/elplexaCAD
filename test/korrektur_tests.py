# UI-Tests Korrekturen aus dem Prüfdurchgang CJ 16.10.2026: DXF alle Blätter mit ZIP-Rückfall, Navigation mittig,
# „An Schema“ ohne Grundverkabelung (siehe dispo_tests), Tab-Ecke bei Platten, Bezeichnung in der Legende. Aufruf aus web-src: python3 test/korrektur_tests.py
import sys, io, zipfile
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
    # Chrome-Ordnerwahl nachgebildet: wie bei einem gesperrten Ordner (iCloud) kommt nur „abgebrochen“ zurück
    ctx.add_init_script("window.showDirectoryPicker = async () => { throw new DOMException('Abgebrochen', 'AbortError'); };")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    D = lambda: page.evaluate("window.__schemacad.doc")
    M = lambda: page.evaluate("window.__schemacad.model")
    def go(i): page.click("#sheet-cur"); page.click(f'#sheet-menu [data-sheet="{i}"]'); page.wait_for_timeout(120)
    def pt(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.evaluate("(()=>{const r=document.querySelector('#svg').getBoundingClientRect();return {l:r.left,t:r.top}})()")
        return r["l"] + v["x"] + x * v["z"], r["t"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): X, Y = pt(x, y); page.mouse.move(X, Y); page.mouse.click(X, Y); page.wait_for_timeout(80)
    page.goto(URL); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    page.click("[data-addsheet]"); page.wait_for_timeout(100)

    # 1. DXF alle Blätter: Ordnerwahl scheitert → Rückfrage → eine ZIP im Download-Ordner
    page.click("#btn-export"); page.click("#btn-dxf-all"); page.wait_for_timeout(200)
    check("Ordnerwahl abgebrochen: Rückfrage ZIP mit Hinweis auf iCloud", page.locator(".modal").count() == 1 and "iCloud" in page.inner_text(".modal"))
    with page.expect_download() as dd: page.click('.modal [data-r="1"]')
    zf = zipfile.ZipFile(io.BytesIO(open(dd.value.path(), "rb").read()))
    names = sorted(zf.namelist())
    check("ZIP mit Blatt 3 und 4, gültig, DXF-Inhalt", dd.value.suggested_filename.endswith("_DXF.zip") and zf.testzip() is None and [n.split("_")[-1] for n in names] == ["Blatt-3.dxf", "Blatt-4.dxf"] and b"SECTION" in zf.read(names[0])[:200], names)

    # 2. Navigation: Text senkrecht in der Mitte
    gap = page.evaluate("(() => { const c = document.querySelector('#sheet-cur').getBoundingClientRect(), s = document.querySelector('#sheet-cur .cl').getBoundingClientRect(); return [s.top - c.top, c.bottom - s.bottom]; })()")
    check("Blattname mittig im Knopf (oben = unten)", abs(gap[0] - gap[1]) <= 1, gap)

    # 4. Disposition: Tab wechselt die Bezugsecke neuer Platten
    page.click("#sheet-add", button="right"); page.click('[data-new="dispo"]'); page.wait_for_timeout(150)
    page.click('[data-sym="D:PLATE:zaehler"]'); page.keyboard.press("Tab"); page.wait_for_timeout(60)
    check("Tab: Ecke unten rechts, Hinweis", "unten rechts" in page.inner_text("#statusbar") and "unten rechts" in page.inner_text("#right"))
    page.keyboard.press("Tab"); page.keyboard.press("Shift+Tab"); page.wait_for_timeout(60)
    X, Y = pt(500, 500); page.mouse.move(X, Y); page.mouse.click(X, Y); page.wait_for_timeout(100); page.keyboard.press("Escape")
    pl = [i for i in M()["items"] if i["type"] == "plate"][0]
    check("Platte mit Ecke unten rechts am Klickpunkt", abs(pl["x"] + pl["w"] - 500) < 3 and abs(pl["y"] - 500) < 3, pl)

    # 5. Legende: RCD oben, LS unten. Klemmen beim LS, Bezeichnung für den RCD in der Legende
    go(2); page.click('[data-sym="A:fils"]'); click(60, 120); page.keyboard.press("Escape")
    it = M()["items"]; fi = [i for i in it if i.get("sym") == "FI_2P"][0]; ls = [i for i in it if i.get("sym") == "LS_1P"][0]
    check("Vorlage FI + LS: Klemmen beim unteren LS", [t for t in it if t["type"] == "terminals"][0]["of"] == ls["id"])
    leg = [sh.get("kind") for sh in D()["sheets"]].index("legend"); go(leg)  # Legende vor der Disposition (CJ 16.10.)
    page.click(f'#sheet [data-dev="{fi["id"]}"]'); page.wait_for_timeout(100)
    check("RCD gewählt: Feld Bezeichnung und Hinweis zum unteren Gerät", page.locator("#right [data-lbez]").count() == 1 and "unteren Gerät" in page.inner_text("#right"))
    page.fill("#right [data-lbez]", "RCD Küche"); page.wait_for_timeout(100)
    check("Bezeichnung des RCD in der Legende", "RCD Küche" in page.text_content("#sheet") and [i for i in D()["sheets"][2]["items"] if i["id"] == fi["id"]][0].get("bez") == "RCD Küche")
    page.click(f'#sheet [data-dev="{ls["id"]}"]'); page.wait_for_timeout(100)
    page.fill("#right [data-lbez]", "Steckdosen"); page.wait_for_timeout(100)
    check("LS: Bezeichnung jederzeit änderbar, gilt für die Klemmenleiste (auch im Schema)", [t for t in D()["sheets"][2]["items"] if t["type"] == "terminals"][0]["name"] == "Steckdosen" and "Steckdosen" in page.text_content("#sheet"))
    check("keine Fehler", not errors, errors[:3])
    b.close()
print(f"\n{len(fails)} Fehler" if fails else "\nKorrekturen UI: alle Tests ok")
sys.exit(1 if fails else 0)
