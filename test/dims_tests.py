# UI-Tests für Bemassung (Taste Y) und Blattleiste mit Stern (Headless-Chromium). Aufruf aus web-src: python3 test/dims_tests.py [Ausgabeordner]
import subprocess, sys, tempfile
from pathlib import Path
import ezdxf
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="dims_"))
OUT.mkdir(parents=True, exist_ok=True)
RT = ROOT / "test" / "roundtrip_check.py"
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(URL); page.wait_for_timeout(300)
    page.click('[data-start="schema"]')  # Startauswahl
    def pt(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.evaluate("(()=>{const r=document.querySelector('#svg').getBoundingClientRect();return {l:r.left,t:r.top}})()")
        return r["l"] + v["x"] + x * v["z"], r["t"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): X, Y = pt(x, y); page.mouse.move(X, Y); page.mouse.click(X, Y)
    D = lambda: page.evaluate("window.__schemacad.doc")
    M = lambda: page.evaluate("window.__schemacad.model")
    def go(i): page.click("#sheet-cur"); page.click(f'#sheet-menu [data-sheet="{i}"]')  # Blatt über die Blattliste wählen
    def add_dispo(): page.click("#sheet-add", button="right"); page.click('[data-new="dispo"]')
    texts = lambda: page.evaluate("[...document.querySelectorAll('#items text')].map(t=>t.textContent)")
    cur = lambda: page.inner_text("#sheet-cur").replace("\n", " ")
    rows = lambda: page.locator("#sheet-menu .mi[data-sheet]")

    # Disposition mit Zählerplatte, 3 Schienen, Geräten
    add_dispo(); page.wait_for_timeout(150)
    page.click('[data-sym="D:PLATE:zaehler"]'); click(100, 100); page.keyboard.press("Escape")
    click(100, 250); page.click('[data-act="autorail"][data-n="3"]')
    for s, x, y in [("LS3", 150, 180), ("LS1", 185, 180), ("NTR", 198, 180), ("LS4", 290, 180), ("LS1", 150, 300), ("LS1", 168, 300)]:
        page.click(f'[data-sym="D:DEV:{s}"]'); click(x, y)
    page.keyboard.press("Escape"); page.keyboard.press("f"); page.wait_for_timeout(150)
    t = texts()
    check("Masse sind standardmässig ein", page.is_checked("#dims-on") and M().get("dims") is None)
    check("Gesamtmass der Platte 250 und 400", "250" in t and "400" in t, t)
    check("Schienenkette 80, 120, 120, 80", t.count("120") == 2 and t.count("80") == 2, t)
    check("Geräteketten (Masstext 5 mm seit 16.10.: 17,5 bleibt einzeln, Zusammenfassen in test_dispo.mjs)", t.count("52,5") == 2 and t.count("17,5") == 3 and "78,8" in t and "157,5" in t, t)
    check("Plattenname ohne Mass im Titel, wenn Masse ein", "Zählerplatte" in t and not any("×" in x for x in t), t)
    page.keyboard.press("y"); page.wait_for_timeout(100)
    t = texts()
    check("Y schaltet Masse aus (gespeichert als dims false)", M().get("dims") is False and not page.is_checked("#dims-on") and "157,5" not in t and "Zählerplatte  250 × 400" in t, t)
    page.keyboard.press("y"); page.wait_for_timeout(100)
    check("Y schaltet wieder ein, Schlüssel entfällt", M().get("dims") is None and "157,5" in texts())
    page.keyboard.press("y"); page.keyboard.press("Control+z"); page.wait_for_timeout(100)
    check("Rückgängig stellt Masse wieder her", M().get("dims") is None and "157,5" in texts())
    page.keyboard.press("Control+Shift+z"); page.wait_for_timeout(100); page.click("#dims-on"); page.wait_for_timeout(100)
    check("Kontrollkästchen Masse wirkt wie Y", M().get("dims") is None and "157,5" in texts())
    page.screenshot(path=str(OUT / "d1_masse.png"))

    # Übergabe: Ansicht mit Massen
    page.keyboard.press("Escape"); page.click("#btn-handover"); page.wait_for_timeout(150)
    page.click("#modal-root button.primary, #modal-root .btn.primary"); page.wait_for_timeout(200)
    v = [i for i in D()["sheets"][2]["items"] if i["type"] == "dispoview"][0]
    check("Ansicht trägt dims und ist grösser als die Bauteile", v.get("dims") is True and v["bw"] > 250 and v["bh"] > 400, v["bw"])
    ts = page.evaluate("[...document.querySelectorAll('#items text')].map(t=>[t.textContent,+t.getAttribute('font-size')])")
    check("Masstexte auf dem Schemablatt mindestens 1,2 mm", [h for s, h in ts if s in ("157,5", "78,8")] and min(h for s, h in ts) >= 1.2 - 1e-9, ts)
    page.screenshot(path=str(OUT / "d2_ansicht.png"))
    page.keyboard.press("Escape"); click(v["x"] + 1, v["y"] + 1)
    page.evaluate("window.__schemacad")
    check("Panel der Ansicht hat Masse-Schalter", page.locator("[data-dpdims]").count() == 1)
    page.uncheck("[data-dpdims]"); page.wait_for_timeout(100)
    check("Ansicht ohne Masse", [i for i in D()["sheets"][2]["items"] if i["type"] == "dispoview"][0].get("dims") is None and "157,5" not in texts())
    page.check("[data-dpdims]"); page.wait_for_timeout(100)

    # DXF
    dxf = page.evaluate("window.__schemacad.exportDxf()"); (OUT / "schema.dxf").write_text(dxf)
    doc = ezdxf.readfile(OUT / "schema.dxf"); msp = doc.modelspace()
    mt = [e for e in msp.query("TEXT") if e.dxf.layer == "SCH_DISPO_MASS"]
    check("Schema-DXF: Masstexte auf Layer SCH_DISPO_MASS, Höhe ≥ 1,2", len(mt) >= 10 and min(e.dxf.height for e in mt) >= 1.2 - 1e-9 and any(e.dxf.text == "157,5" for e in mt), len(mt))
    check("Schema-DXF: Masslinien vorhanden", len([e for e in msp.query("LINE") if e.dxf.layer == "SCH_DISPO_MASS"]) > 20)
    r = subprocess.run([sys.executable, str(RT), str(OUT / "schema.dxf")], capture_output=True, text=True)
    check("Schema-DXF ohne Audit-Fehler", "Audit-Fehler: 0" in r.stdout, r.stdout[:200] + r.stderr[-200:])
    go(4); page.wait_for_timeout(150)
    dxf = page.evaluate("window.__schemacad.exportDxf()"); (OUT / "dispo.dxf").write_text(dxf)
    doc = ezdxf.readfile(OUT / "dispo.dxf")
    mt = [e for e in doc.modelspace().query("TEXT") if e.dxf.layer == "SCH_DISPO_MASS"]
    check("Dispositions-DXF 1:1: Masstexte 5 mm hoch (Vorgabe seit 16.10.)", len(mt) >= 10 and all(abs(e.dxf.height - 5) < 1e-9 for e in mt))
    r = subprocess.run([sys.executable, str(RT), str(OUT / "dispo.dxf")], capture_output=True, text=True)
    check("Dispositions-DXF ohne Audit-Fehler", "Audit-Fehler: 0" in r.stdout, r.stdout[:200] + r.stderr[-200:])
    page.keyboard.press("y"); page.wait_for_timeout(100)
    dxf = page.evaluate("window.__schemacad.exportDxf()")
    check("Masse aus: keine Masselemente im DXF", "SCH_DISPO_MASS" not in dxf.split("ENTITIES")[1])
    page.keyboard.press("y")

    # Blattleiste (kompakt) und Blattliste
    go(2); page.wait_for_timeout(100)
    for _ in range(8): page.click("[data-addsheet]")
    n = len(D()["sheets"])
    check("Viele Blätter: Leiste zeigt aktives Blatt und Position", n == 13 and D()["active"] == 10 and "Blatt 11" in cur() and "11 von 13" in cur(), cur())
    check("Leiste bleibt kompakt (unter 320 px)", page.locator("#sheetbar").bounding_box()["width"] < 320, page.locator("#sheetbar").bounding_box())
    for _ in range(8): page.keyboard.press("PageUp")
    page.keyboard.press("m"); page.wait_for_timeout(100)
    check("M markiert das aktive Blatt mit Stern (gespeichert, in der Leiste)", D()["sheets"][2].get("pin") is True and "★" in cur())
    for _ in range(8): page.click('[data-step="1"]')
    page.wait_for_timeout(100)
    page.keyboard.press("PageUp"); page.wait_for_timeout(100)
    check("Bild auf geht zum vorherigen Blatt", D()["active"] == 9)
    page.keyboard.press("PageDown"); page.keyboard.press("PageDown"); page.keyboard.press("PageDown"); page.wait_for_timeout(100)
    check("Bild ab am Ende bleibt am Ende (Disposition ist das letzte Blatt, CJ 16.10.)", D()["active"] == 12 and page.is_disabled('[data-step="1"]'))
    page.keyboard.press("g"); page.wait_for_timeout(100)
    check("G öffnet die Blattliste mit allen Blättern, Fokus im Suchfeld", rows().count() == n and page.evaluate("document.activeElement.id") == "sheet-find")
    page.keyboard.type("blatt 3"); page.wait_for_timeout(50)
    check("Suchfeld filtert", rows().count() == 1, rows().all_inner_texts())
    page.keyboard.press("Enter"); page.wait_for_timeout(100)
    check("Enter springt zum Treffer, Liste zu, Fokus auf der Mitte", D()["active"] == 2 and page.is_hidden("#sheet-menu") and page.evaluate("document.activeElement.id") == "sheet-cur")
    page.click("#sheet-cur"); page.keyboard.type("xyz"); page.wait_for_timeout(50)
    check("Kein Treffer: Hinweis", rows().count() == 0 and "Kein Blatt" in page.inner_text("#sheet-menu"))
    page.keyboard.press("Escape"); page.wait_for_timeout(50)
    check("Blattliste: Escape schliesst", page.is_hidden("#sheet-menu") and D()["active"] == 2)
    page.keyboard.press("g"); page.keyboard.press("ArrowDown"); page.keyboard.press("ArrowDown"); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    check("Pfeiltasten und Enter in der Liste", D()["active"] == 1, D()["active"])
    page.keyboard.press("g"); page.wait_for_timeout(50); page.mouse.click(700, 300); page.wait_for_timeout(50)
    check("Blattliste: Klick ausserhalb schliesst", page.is_hidden("#sheet-menu"))
    page.click("#sheet-cur"); rows().nth(0).click(); page.wait_for_timeout(100)
    check("Klick in der Liste springt zum Blatt", D()["active"] == 0 and "1 von 13" in cur() and "Titelseite" in cur())
    page.click("#sheet-cur"); page.click('#sheet-menu [data-pin="2"]'); page.wait_for_timeout(100)
    check("Stern in der Liste entfernt die Markierung, Liste bleibt offen", D()["sheets"][2].get("pin") is None and page.is_visible("#sheet-menu"))
    page.keyboard.press("Escape"); page.keyboard.press("Control+z"); page.wait_for_timeout(100)
    check("Markierung ist rückgängig machbar", D()["sheets"][2].get("pin") is True)
    # + : Klick legt ein Blatt an, langes Drücken bietet Blatt oder Disposition an
    bx = page.locator("#sheet-add").bounding_box(); page.mouse.move(bx["x"] + 8, bx["y"] + 8); page.mouse.down(); page.wait_for_timeout(600); page.mouse.up(); page.wait_for_timeout(100)
    check("Langes Drücken auf + öffnet die Auswahl, legt nichts an", page.is_visible("#add-menu") and len(D()["sheets"]) == n)
    page.keyboard.press("ArrowDown"); page.keyboard.press("Enter"); page.wait_for_timeout(150)
    check("Auswahl Neue Disposition", len(D()["sheets"]) == n + 1 and D()["sheets"][-1].get("kind") == "dispo" and D()["sheets"][-3].get("kind") == "legend" and page.is_hidden("#add-menu"))
    page.screenshot(path=str(OUT / "d3_leiste.png"))
    b.close()
check("keine JS-Fehler", not errors, errors)
print("FEHLER:" if fails else "ALLE OK", fails, "| Ausgaben:", OUT)
sys.exit(1 if fails else 0)
