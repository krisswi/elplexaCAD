# Symbolpalette mit Varianten (Wunsch CJ 16.10.2026): jede Polzahl-Variante links als Kachel, ein Klick setzt das Gerät.
# Aufruf aus web-src: python3 test/palette_tests.py [Bild.png]
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
fails, errors = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
WANT = ["LS_1P", "LS_1PN", "LS_1PT", "LS_2P", "LS_3P", "LS_3PN", "LS_3PT", "LS_4P", "RCBO_1PN", "RCBO_4P", "NH_3PT", "FI_2P", "FI_4P",
        "SPD_2P_1", "SPD_4P_1", "SCHUETZ_1P", "SCHUETZ_4P", "VOUT_1P", "VIN_4P", "ZAEHLER_2P"]
with sync_playwright() as p:
    b = p.chromium.launch(); page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    M = lambda: page.evaluate("window.__schemacad.model")
    def click(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.evaluate("(()=>{const r=document.querySelector('#svg').getBoundingClientRect();return {l:r.left,t:r.top}})()")
        page.mouse.click(r["l"] + v["x"] + x * v["z"], r["t"] + v["y"] + (210 - y) * v["z"]); page.wait_for_timeout(60)
    for s in WANT: check(f"Kachel {s} links", page.locator(f'#left .var[data-sym="{s}"]').count() == 1)
    check("Jede Kachel nur einmal (z. B. LS_4P)", page.locator('#left [data-sym="LS_4P"]').count() == 1)
    labels = [page.locator(f'#left .var[data-sym="{s}"] .vl').inner_text() for s in ("LS_1PT", "LS_3PN", "SPD_4P_1", "FI_2P")]
    check("Kurztexte 1P+N-Tr., 3P+N, 3+1, 2P", labels == ["1P+N-Tr.", "3P+N", "3+1", "2P"], str(labels))
    check("Voller Name im Tooltip", page.get_attribute('#left .var[data-sym="LS_1PT"]', "title") == "Leitungsschutzschalter 1P + N-Trenner")
    check("Einzelgerät bleibt Zeile (Erde)", page.locator('#left .sym[data-sym="ERDE_1P"]').count() == 1)
    check("HAK und Zähler mit Varianten als Kacheln (CJ 16.10.)", page.locator('#left .var[data-sym="HAK_TNCS"]').count() == 1 and page.locator('#left .var[data-sym="ZAEHLER_4P_W"]').count() == 1)
    # Ein Klick links genügt: LS 3P+N direkt setzen, ohne Auswahl rechts
    page.click('#left .var[data-sym="LS_3PN"]')
    check("Kachel gedrückt", page.get_attribute('#left .var[data-sym="LS_3PN"]', "aria-pressed") == "true")
    check("Rechts dieselbe Variante vorgewählt", page.locator("[data-placepoles]").input_value() == "LS_3PN")
    click(100, 150); page.keyboard.press("Escape")
    syms = [i["sym"] for i in M()["items"] if i["type"] == "symbol" and not i.get("main")]
    check("LS 3P+N mit einem Klick gesetzt", "LS_3PN" in syms, str(syms))
    page.click('#left .var[data-sym="RCBO_1PN"]'); click(160, 150); page.keyboard.press("Escape")
    syms = [i["sym"] for i in M()["items"] if i["type"] == "symbol" and not i.get("main")]
    check("RCBO 1P+N mit einem Klick gesetzt", "RCBO_1PN" in syms, str(syms))
    check("Nach Esc keine Kachel gedrückt", page.locator('#left .var[aria-pressed="true"]').count() == 0)
    # Schmale Leiste (212 px): Kacheln laufen nicht über
    page.set_viewport_size({"width": 1100, "height": 800}); page.wait_for_timeout(100)
    over = page.evaluate("[...document.querySelectorAll('#left .vargrid')].some(g => g.scrollWidth > g.clientWidth + 1)")
    check("Kacheln passen in schmale Leiste", not over)
    page.set_viewport_size({"width": 1440, "height": 900}); page.wait_for_timeout(100)
    if len(sys.argv) > 1: page.locator("#left").screenshot(path=sys.argv[1])
    b.close()
check("Keine Seitenfehler", not errors, "; ".join(errors))
print("ok" if not fails else f"{len(fails)} Fehler")
sys.exit(1 if fails else 0)
