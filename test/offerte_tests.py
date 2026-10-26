# UI-Tests für das Modul Offerte (Schritt 1, CJ 26.10.2026) in SchemaCAD v3 und elplexaCAD. Aufruf: python3 test/offerte_tests.py [Ausgabeordner]
# Kapitel aus dem BKP-Katalog, Position per Tastatur (Tab), Summen mit Rundung, Option, Rabatt, Rückgängig, Datei Version 25.
import sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="offerte_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)

def flow(page, tag):
    D = lambda: page.evaluate("window.__schemacad.doc")
    txt = lambda s: page.locator(s).first.inner_text()
    check(f"{tag}: Offerte offen, Zeichenfläche weg", page.evaluate("window.__schemacad.kind") == "offerte" and page.is_visible("#of-view") and not page.is_visible("#svg"))
    page.click('[data-ofact="addkap"][data-bkp="232.51"]'); page.wait_for_timeout(100)
    check(f"{tag}: Kapitel 232.51 mit Titel aus dem BKP", page.input_value('.of-kh .of-kt') == "Lichtinstallationen allgemein")
    page.keyboard.type("Küche"); page.keyboard.press("Tab")
    page.click('[data-ofact="addpos"]'); page.wait_for_timeout(100)
    for v in ["Steckdose T13", "UP", "22", "3", "Stk", "58,47"]: page.keyboard.type(v); page.keyboard.press("Tab")
    page.wait_for_timeout(100)
    off = lambda d: next(s for s in d["sheets"] if s.get("kind") == "offerte")  # elplexaCAD: Projekt kann weitere Module haben
    pos = off(D())["of"]["kap"][0]["grp"][0]["pos"][0]
    check(f"{tag}: Tab füllt die Position", [pos.get(k) for k in ["titel", "text", "ic", "menge", "eh", "preis"]] == ["Steckdose T13", "UP", "22", 3, "Stk", 58.47], pos)
    check(f"{tag}: Betrag ungerundet wie im Excel (3 × 58.47 = 175.41)", txt(".of-amt") == "175.41", txt(".of-amt"))
    check(f"{tag}: nur Total auf 5 Rappen (175.41 + 8.1 % = 189.62 → 189.60), Rundung als Zeile", txt(".of-total").endswith("189.60") and "Rundung" in page.inner_text(".of-end"), txt(".of-total"))
    page.click('[data-ofact="addpos"]'); page.keyboard.type("Option"); page.keyboard.press("Tab")
    page.fill('.of-pos >> nth=1 >> [data-of$=".menge"]', "1"); page.keyboard.press("Tab")
    page.fill('.of-pos >> nth=1 >> [data-of$=".preis"]', "80"); page.keyboard.press("Tab")
    page.check('.of-pos >> nth=1 >> [data-of$=".opt"]'); page.wait_for_timeout(100)
    check(f"{tag}: Option zählt nicht, eigene Summe", txt(".of-total").endswith("189.60") and "80.00" in page.inner_text(".of-end"))
    page.fill('[data-of="o.rabatt"]', "5"); page.keyboard.press("Tab"); page.wait_for_timeout(100)
    end = page.inner_text(".of-end")
    check(f"{tag}: Rabatt 5 % = 8.77, Total 180.15", "Rabatt 5 % auf 175.41" in end and "8.77" in end and txt(".of-total").endswith("180.15"), end)
    page.click("#btn-undo"); page.wait_for_timeout(100)
    check(f"{tag}: Rückgängig nimmt den Rabatt zurück", txt(".of-total").endswith("189.60"), txt(".of-total"))
    d = D()
    check(f"{tag}: Datei Version 25", d["version"] == 25 and off(d)["of"]["rabatt"] == 0, d["version"])
    page.screenshot(path=str(OUT / f"{tag}.png"))

with sync_playwright() as p:
    b = p.chromium.launch()
    for tag, file in [("v3", "schemacad.html"), ("elplexa", "ElplexaCAD.html")]:
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto((ROOT / "dist" / file).as_uri()); page.evaluate("localStorage.clear()"); page.reload(); page.wait_for_timeout(400)
        if tag == "v3": page.click('[data-start="offerte"]')
        else:
            if page.is_visible(".modal.start"): page.click('[data-start="offerte"]')
            else: page.click("#el-addmod"); page.click('[data-elnew="offerte"]')
        page.wait_for_timeout(300)
        flow(page, tag)
        ctx.close()
    b.close()
check("keine JS-Fehler", not errors, errors)
print("FEHLER:" if fails else "ALLE OK", fails, "| Ausgaben:", OUT)
sys.exit(1 if fails else 0)
