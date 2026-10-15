# UI-Tests für die Legende der Sicherungsgruppen (Ausbau UI Schritt 4). Aufruf aus web-src: python3 test/legende_tests.py [Ausgabeordner]
import sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="legende_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
BLUE = "#2556b8"
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    D = lambda: page.evaluate("window.__schemacad.doc")
    M = lambda: page.evaluate("window.__schemacad.model")
    kind = lambda: page.evaluate("window.__schemacad.kind")
    def go(i): page.click("#sheet-cur"); page.click(f'#sheet-menu [data-sheet="{i}"]'); page.wait_for_timeout(120)
    def fill(sel, v): page.locator(sel).fill(v); page.locator("#svg").focus(); page.wait_for_timeout(80)
    def pt(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.evaluate("(()=>{const r=document.querySelector('#svg').getBoundingClientRect();return {l:r.left,t:r.top}})()")
        return r["l"] + v["x"] + x * v["z"], r["t"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): X, Y = pt(x, y); page.mouse.move(X, Y); page.mouse.click(X, Y)
    page.goto(URL); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    # Projekt auf der Titelseite
    go(0); fill('input[data-meta="OBJEKT"]', "EFH Sonnenweg 3"); fill('input[data-info="BAUHERR"]', "Familie Muster"); fill('input[data-info="FIRMA"]', "Elektro CJ")
    # Geräte auf Blatt 3: RCD, LS mit Klemmenleiste, RCBO
    go(2)
    for sym, x in (("FI_4P", 40), ("LS_1P", 110), ("RCBO_2P", 180)):
        fam = sym.split("_")[0]
        page.click(f'[data-sym="{ {"FI": "FI_4P", "LS": "LS_4P", "RCBO": "RCBO_4P"}[fam] }"]'); page.select_option('[data-placepoles]', sym); click(x, 150); page.keyboard.press("Escape")
    d = D()
    check("Legende ist das letzte Blatt, Nummer 4", d["sheets"][-1]["kind"] == "legend" and d["sheets"][-1]["meta"]["BLATT"] == "4" and len(d["sheets"]) == 4)
    go(3)
    rows = page.locator("#sheet .leg-row")
    t = page.text_content("#sheet")
    check("Legende: 3 Geräte, Kopf mit Objekt, Eigentümer, Firma", kind() == "legend" and rows.count() == 3 and "EFH Sonnenweg 3" in t and "Familie Muster" in t and "Elektro CJ" in t, [rows.count(), t[:120]])
    check("Prüfhinweis unten", "Fehlerstromschutzschalter müssen regelmässig geprüft werden" in t)
    blue = page.evaluate(f"[...document.querySelectorAll('#sheet .leg-row')].map(r => r.querySelector('text').getAttribute('fill') === '{BLUE}')")
    check("RCD und RCBO blau, LS schwarz", blue == [True, False, True], blue)
    check("Vorgabe nur BMK, Nennstrom, Bezeichnung", all(h in t for h in ("BMK", "Nennstrom", "Bezeichnung")) and not any(h in t for h in ("Char.", "IΔn", "Ort", "Kabel")) and M()["show"] == ["BMK", "STROM", "NAME"], M().get("show"))
    check("Alle 11 Kontrollkästchen vorhanden", page.locator("[data-lcol]").count() == 11)
    page.check('[data-lcol="KABEL"]'); page.wait_for_timeout(100)
    check("Kontrollkästchen Kabel: Spalte erscheint, gespeichert", "Kabel" in page.text_content("#sheet") and "KABEL" in M()["show"])
    page.check('[data-lcol="ORT"]'); page.wait_for_timeout(100)
    check("Ort zuschaltbar, steht am Ende", "Ort" in page.text_content("#sheet") and M()["show"][-1] == "ORT")
    page.uncheck('[data-lcol="ORT"]'); page.wait_for_timeout(100)
    check("Ort abschaltbar", "Ort" not in page.text_content("#sheet") and "ORT" not in M()["show"])
    page.uncheck('[data-lcol="BMK"]'); page.wait_for_timeout(100)
    check("BMK abschaltbar", "BMK" not in page.text_content("#sheet") and "BMK" not in M()["show"])
    page.keyboard.press("Control+z"); page.wait_for_timeout(100)
    check("Rückgängig wählt BMK wieder", "BMK" in M()["show"] and page.is_checked('[data-lcol="BMK"]'))
    for k in ("BMK", "STROM", "KABEL"):
        page.uncheck(f'[data-lcol="{k}"]'); page.wait_for_timeout(60)
    page.click('[data-lcol="NAME"]'); page.wait_for_timeout(100)
    check("Letzte Spalte bleibt angehakt", M()["show"] == ["NAME"] and page.is_checked('[data-lcol="NAME"]'), M()["show"])
    for k in ("BMK", "STROM"):
        page.check(f'[data-lcol="{k}"]'); page.wait_for_timeout(60)
    page.screenshot(path=str(OUT / "l1_legende.png"))
    # Zeile wählen, Wert ändern wirkt aufs Gerät
    bx = rows.nth(1).bounding_box(); page.mouse.click(bx["x"] + bx["width"] / 2, bx["y"] + bx["height"] / 2); page.wait_for_timeout(120)
    check("Zeile gewählt: Felder des LS rechts, Zeile hervorgehoben", page.locator('input[data-lattr="STROM"]').count() == 1 and page.locator('#sheet .leg-row rect[fill="#fff4cc"]').count() == 1)
    fill('input[data-lattr="STROM"]', "16A"); fill('input[data-lterm="name"]', "Küche")
    ls = [i for i in D()["sheets"][2]["items"] if i.get("sym") == "LS_1P"][0]
    tl = [i for i in D()["sheets"][2]["items"] if i["type"] == "terminals" and i.get("of") == ls["id"]]
    check("Nennstrom 16A und Bezeichnung Küche im Schema", ls["attrs"]["STROM"] == "16A" and tl and tl[0]["name"] == "Küche" and "Küche" in page.text_content("#sheet"), [ls["attrs"], tl])
    page.click('[data-deck="godev"]'); page.wait_for_timeout(150)
    check("Zum Gerät: Blatt 3, Gerät gewählt", D()["active"] == 2 and page.locator('[data-act="golegend"]').count() == 1)
    page.click('[data-act="golegend"]'); page.wait_for_timeout(150)
    check("In Legende zeigen: Legende mit gewählter Zeile", kind() == "legend" and page.locator('#sheet .leg-row rect[fill="#fff4cc"]').count() == 1)
    # PDF: nur die Legende (A4 hoch) und alle Blätter
    n = page.evaluate("window.__schemacad.buildLegendPrint()")
    vb = page.evaluate("[...document.querySelectorAll('#printroot > svg')].map(s=>s.getAttribute('viewBox'))")
    check("Legende als PDF: eine Seite A4 hoch", n == 1 and vb == ["0 0 210 297"], [n, vb])
    page.emulate_media(media="print")
    pdf = page.pdf(prefer_css_page_size=True, print_background=True)
    page.emulate_media(media="screen")
    (OUT / "legende.pdf").write_bytes(pdf)
    import re
    boxes = [tuple(round(float(v)) for v in m) for m in re.findall(rb"/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]", pdf)]
    check("PDF-Seite A4 hoch (595 × 842 pt)", boxes == [(595, 842)], boxes)
    page.evaluate("document.querySelector('#printroot').innerHTML=''")
    check("Export-Menü hat Sicherungslegende (PDF)", page.locator("#btn-legpdf").count() == 1)
    # Neues Schemablatt: Legende bleibt hinten, Nummer wandert mit
    go(2); page.click("[data-addsheet]"); page.wait_for_timeout(150)
    d = D()
    check("Neues Blatt 4, Legende jetzt Blatt 5 und letzte", d["sheets"][3]["meta"]["BLATT"] == "4" and d["sheets"][-1]["kind"] == "legend" and d["sheets"][-1]["meta"]["BLATT"] == "5" and d["active"] == 3 and kind() == "schema")
    go(4); check("Auf der Legende kein Löschen-Knopf, keine Werkzeuge", page.locator('[data-act="delsheet"]').count() == 0 and page.locator("[data-tool]").count() == 0)
    page.set_viewport_size({"width": 400, "height": 800}); page.wait_for_timeout(200); page.keyboard.press("f")
    page.screenshot(path=str(OUT / "l2_schmal.png"))
    b.close()
check("keine JS-Fehler", not errors, errors)
print("FEHLER:" if fails else "ALLE OK", fails, "| Ausgaben:", OUT)
sys.exit(1 if fails else 0)
