# Eingangsverdrahtung per Knopf im Fenster „Hauptlinien“ (CJ 16.10.2026), ein Rückgängig-Schritt, danach bearbeitbar.
# Aufruf aus web-src: python3 test/eingang_tests.py [Bild.png]
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
fails, errors = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch(); page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    M = lambda: page.evaluate("window.__schemacad.model")
    syms = lambda: sorted(i["sym"] for i in M()["items"] if i["type"] == "symbol" and not i.get("main"))
    n0 = len(M()["items"])
    page.click("#btn-haupt"); page.wait_for_timeout(120)
    btn = page.locator('[data-act="feed"]')
    check("Knopf im Fenster Hauptlinien", btn.count() == 1 and btn.is_enabled())
    btn.click(); page.wait_for_timeout(200)
    check("Eingangsverdrahtung eingefügt", syms() == ["ERDE_1P", "HAK_TNCS_1", "HPAS_1P", "NH_3PT", "SPD_4P_1"], str(syms()))
    blatt = M()["meta"]["BLATT"]; it = {i["sym"]: i for i in M()["items"] if i["type"] == "symbol"}
    check("BMK automatisch (Blatt F4, T4)", it["NH_3PT"]["attrs"]["BMK"] == f"{blatt}F4" and it["SPD_4P_1"]["attrs"]["BMK"] == f"{blatt}T4", str([it["NH_3PT"]["attrs"], it["SPD_4P_1"]["attrs"]]))
    check("Anfang links: Eingangsverdrahtung", M()["main"]["l"] == "feed")
    page.click("#btn-haupt"); page.wait_for_timeout(120)
    check("Knopf danach gesperrt", page.locator('[data-act="feed"]').is_disabled())
    page.keyboard.press("Escape"); page.mouse.click(1000, 120); page.wait_for_timeout(80)
    # Einzeln bearbeitbar: HPAS wählen, BMK ändern
    v = page.evaluate("window.__schemacad.view"); r = page.evaluate("(()=>{const r=document.querySelector('#svg').getBoundingClientRect();return {l:r.left,t:r.top}})()")
    hp = it["HPAS_1P"]; page.mouse.click(r["l"] + v["x"] + (hp["x"] + 6) * v["z"], r["t"] + v["y"] + (210 - hp["y"] + 3.75) * v["z"]); page.wait_for_timeout(80)
    check("HPAS einzeln gewählt", page.evaluate("window.__schemacad.sel") == [hp["id"]], str(page.evaluate("window.__schemacad.sel")))
    page.fill('[data-attr="BMK"]', "X0"); page.keyboard.press("Tab"); page.wait_for_timeout(60)
    page.fill('[data-attr="BEZ"]', "HPAS Keller"); page.keyboard.press("Tab"); page.wait_for_timeout(60)
    h2 = [i for i in M()["items"] if i["id"] == hp["id"]][0]
    check("HPAS: BMK und Bezeichnung frei", h2["attrs"] == {"BMK": "X0", "BEZ": "HPAS Keller"}, str(h2["attrs"]))
    if len(sys.argv) > 1: page.locator("#svg").screenshot(path=sys.argv[1])
    # Ein Rückgängig-Schritt nimmt alles zurück (zuerst die zwei Textänderungen)
    for _ in range(3): page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("Rückgängig: alles weg", len(M()["items"]) == n0 and M()["main"]["l"] != "feed", str(len(M()["items"])))
    check("Palette: HPAS und HAK mit Zuleitung", page.locator('#left [data-sym="HPAS_1P"]').count() == 1 and page.locator('#left .var[data-sym="HAK_TNCS_1"]').count() == 1)
    b.close()
check("Keine Seitenfehler", not errors, "; ".join(errors))
print("ok" if not fails else f"{len(fails)} Fehler")
sys.exit(1 if fails else 0)
