# UI-Tests für den Stringplan (PV-Strings Schritt 2: PDF-Plan, Messstrecke, Fixpunkt, Plantausch; Schritt 3: Ebenen, Dach, Fang; Schritt 4: Module; Schritt 5: Strings, SPA; Schritt 6: Stringübersicht, Spannungsprüfung; Schritt 7: Papier, Druckmassstab, Plankopf, PDF). Headless-Chromium.
# Aufruf aus web-src: python3 test/pv_tests.py [Ausgabeordner]. Die Test-PDFs entstehen hier im Test (keine Dateien von CJ).
import base64, json, re, sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="pv_"))
OUT.mkdir(parents=True, exist_ok=True)
PT_MM = 25.4 / 72
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)

def make_pdf(pages):
    """Kleinste PDF: pages = [(Breite, Höhe, Zeichenbefehle)], Koordinaten in pt, y nach oben."""
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", None]
    kids = []
    for w, h, ops in pages:
        n = len(objs) + 1
        kids.append(f"{n} 0 R")
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w} {h}] /Contents {n + 1} 0 R >>")
        objs.append(f"<< /Length {len(ops)} >>\nstream\n{ops}\nendstream")
    objs[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>"
    out, offs = b"%PDF-1.4\n", []
    for i, o in enumerate(objs):
        offs.append(len(out)); out += f"{i + 1} 0 obj\n{o}\nendobj\n".encode()
    x = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode() + "".join(f"{o:010d} 00000 n \n" for o in offs).encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n".encode()
    return out

# Plan A: 2 Seiten A4 quer, auf Seite 2 eine Strecke (100,100)–(400,500) = 500 pt. Plan B: 1 Seite A3 quer, Rechteck.
A = OUT / "planA.pdf"; A.write_bytes(make_pdf([(842, 595, "0 0 1 rg 50 50 100 100 re f"), (842, 595, "4 w 100 100 m 400 500 l S 20 20 802 555 re S")]))
B = OUT / "planB.pdf"; B.write_bytes(make_pdf([(1190, 842, "3 w 50 50 1090 742 re S")]))

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
    M = lambda: page.evaluate("window.__schemacad.model")
    D = lambda: page.evaluate("window.__schemacad.doc")
    kind = lambda: page.evaluate("window.__schemacad.kind")
    def world(bg, u, v):  # wie pv.js pageToWorld
        k = bg.get("mmPerPt", PT_MM); fu, fv = bg.get("fix", [0, bg["h"]])
        return (u - fu) * k, (fv - v) * k
    def load(path, confirm=False):
        with page.expect_file_chooser() as fc:
            page.click('[data-pvact="pdf"]')
            if confirm: page.click('.modal [data-r="1"]')
        fc.value.set_files(str(path)); page.wait_for_timeout(400)
    def wait_image():
        try: page.wait_for_function("document.querySelector('#sheet image')?.getAttribute('href')?.startsWith('blob:')", timeout=15000)
        except Exception: check("Plan gerendert", False, str(page.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent)")) + str(errors))
    near = lambda a, b, t: abs(a - b) <= t
    # 5b: Werkzeug wählen; ist es nicht sichtbar, zuerst seine Ebene aktiv machen (⌘ + Zahl)
    TOOL_KEY = {"pv-measure": 1, "pv-fix": 1, "pv-rotate": 1, "pv-roof": 2, "pv-keepout": 2, "pv-module": 3, "pv-field": 3, "pv-string": 4, "pv-spa": 4, "pv-line": 4, "pv-point": 4}
    def use(tool):
        if page.is_visible("#pv-pop"): page.keyboard.press("Escape")  # Fenster oben zu, sonst ruhen die Tastenkürzel
        if page.locator(f'[data-tool="{tool}"]').count() == 0: page.keyboard.press(f"Meta+{TOOL_KEY[tool]}"); page.wait_for_timeout(80)
        page.click(f'[data-tool="{tool}"]')

    # Neuer Stringplan über das Menü +
    page.click("#sheet-add", button="right"); page.click('[data-new="pv"]'); page.wait_for_timeout(200)
    check("Neues Blatt ist ein Stringplan", kind() == "pv" and M().get("sid", 0) > 0)
    check("Stringplan ohne Plan: „PDF-Plan laden“ auch auf Ebene Dach, keine Leitung", page.locator('[data-pvact="pdf"]').count() == 1 and page.locator('[data-tool="pv-roof"]').count() == 1 and page.locator('[data-tool="wire"]').count() == 0)
    check("5b: Ebene Dach zeigt nur Dach-Werkzeuge", page.locator('[data-tool="pv-measure"], [data-tool="pv-module"], [data-tool="pv-string"]').count() == 0)
    page.keyboard.press("Meta+1"); page.wait_for_timeout(80)
    check("Hintergrund ohne Plan: Plan-Werkzeuge, keine Dach-Werkzeuge", page.locator('[data-tool="pv-measure"]').count() == 1 and page.locator('[data-tool="pv-roof"]').count() == 0)
    check("Raster 100 mm (Vorgabe Stringplan)", page.input_value("#grid-size") == "100")
    check("Blattleiste nennt den Stringplan", "Stringplan 1" in page.inner_text("#sheetbar"))
    page.click('[data-tool="pv-measure"]'); click(10, 10); page.wait_for_timeout(100)
    check("Messen ohne Plan: Hinweis statt Fehler", "PDF-Plan laden" in page.inner_text("body") and "bg" not in M())
    page.keyboard.press("Escape")

    # PDF laden, Seite 2 wählen
    with page.expect_file_chooser() as fc: page.click('[data-pvact="pdf"]')
    fc.value.set_files(str(A)); page.wait_for_timeout(500)
    check("Mehrseitige PDF fragt nach der Seite", page.locator(".modal .choice").count() == 2)
    page.click('.modal .choice[data-v="1"]')
    # 3c: danach Frage Massstab bekannt oder messen
    try: page.wait_for_selector(".modal [data-den]", timeout=10000)
    except Exception: pass
    check("3c: Laden fragt nach dem Massstab (Seitengrösse in mm)", page.locator(".modal [data-den]").count() == 1 and page.locator(".modal [data-m]").count() == 1 and "297 × 209,9 mm" in page.inner_text(".modal"), page.inner_text("body")[:300])
    page.click(".modal [data-m]")
    try: page.wait_for_function("window.__schemacad.model.bg", timeout=10000)
    except Exception: print("Meldungen:", page.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent)"), errors)
    bg = M()["bg"]
    check("Hintergrund: Seite 2, 842 × 595 pt", bg["page"] == 2 and near(bg["w"], 842, 0.01) and near(bg["h"], 595, 0.01), bg)
    doc = D()
    check("PDF eingebettet, byteidentisch", doc["assets"][bg["asset"]]["data"] == base64.b64encode(A.read_bytes()).decode())
    check("Datei Version 7 (mit Stringplan und Schemablatt mit Hauptlinien)", doc["version"] == 7)
    check("3c: „Strecke messen“ wählt das Werkzeug Messstrecke, kein Massstab", page.get_attribute('[data-tool="pv-measure"]', "aria-pressed") == "true" and "mmPerPt" not in bg)
    wait_image()
    check("PDF als Bild gerendert (pdf.js mit Worker)", page.locator("#sheet image").count() == 1)
    page.screenshot(path=str(OUT / "pv_plan.png"))

    # Messstrecke (100,495)–(400,95) in Seitenkoordinaten = 500 pt, wirklich 18 000 mm → Vorschlag 1:100
    page.click('[data-tool="pv-measure"]')
    click(*world(bg, 100, 495)); page.wait_for_timeout(80); click(*world(bg, 400, 95)); page.wait_for_timeout(200)
    check("Messstrecke fragt nach der Länge", page.locator('.modal [data-f="0"]').count() == 1)
    page.fill('.modal [data-f="0"]', "18000"); page.click(".modal [data-ok]"); page.wait_for_timeout(200)
    labels = [page.inner_text(f'.modal .choice[data-v="{i}"]') for i in range(2)]
    check("Vorschlag Normmassstab 1:100, gemessen ca. 1:102", "1:100" in labels[0] and "1:102" in labels[1], labels)
    page.click('.modal .choice[data-v="0"]'); page.wait_for_timeout(300)
    bg = M()["bg"]
    check("Massstab 1:100 übernommen", near(bg["mmPerPt"], 100 * PT_MM, 1e-9), bg.get("mmPerPt"))
    m = bg["measure"]
    check("Messstrecke gespeichert (Seite, mm)", m["mm"] == 18000 and near(m["a"][0], 100, 1.5) and near(m["a"][1], 495, 1.5) and near(m["b"][0], 400, 1.5) and near(m["b"][1], 95, 1.5), m)
    check("Rechte Leiste zeigt Massstab", "Massstab 1:100" in page.inner_text("#right"))

    # Fixpunkt auf den Anfang der Strecke (100,495)
    page.click('[data-tool="pv-fix"]'); fx, fy = pt(*world(bg, 100, 495)); click(*world(bg, 100, 495)); page.wait_for_timeout(200)
    bg = M()["bg"]
    check("Fixpunkt gesetzt, ohne Rückfrage (keine Objekte)", "fix" in bg and near(bg["fix"][0], 100, 1.5) and near(bg["fix"][1], 495, 1.5) and page.locator(".modal").count() == 0, bg.get("fix"))
    sx, sy = pt(0, 0)
    check("Plan bleibt stehen, Ursprung liegt am Klickpunkt", near(sx, fx, 1) and near(sy, fy, 1), (sx, sy, fx, fy))

    # Text 1000 mm rechts, 2000 mm über dem Fixpunkt (Raster 100 mm)
    # 3c: aktive Ebene, Vorgabe Dach, ⌘4 = Beschriftung
    active = lambda: page.evaluate("[...document.querySelectorAll('.layer-row.active .layer-name')].map(e=>e.dataset.layer)")
    check("3d: nach dem Laden ist der Hintergrund aktiv, alle 5 Ebenen wählbar", active() == ["bg"] and page.locator('button.layer-name').count() == 5, active())
    page.keyboard.press("Meta+5"); page.wait_for_timeout(80)
    check("3c: ⌘5 macht Beschriftung aktiv", active() == ["text"], active())
    check("3d: Plan-Werkzeuge verschwinden ohne aktiven Hintergrund", page.locator('[data-tool="pv-measure"], [data-tool="pv-fix"], [data-tool="pv-rotate"], [data-pvact="pdf"]').count() == 0)
    measure_fix = lambda: page.locator('#sheet line[stroke="#9b3d8f"], #sheet g[stroke="#c2410c"]').count()
    check("5b: Messstrecke und Fixpunkt auf dem Plan nur bei aktivem Hintergrund", measure_fix() == 0)
    page.keyboard.press("Meta+1"); page.wait_for_timeout(80)
    check("5b: ⌘1 zeigt Messstrecke und Fixpunkt wieder", measure_fix() == 2)
    page.keyboard.press("Meta+5"); page.wait_for_timeout(80)
    page.click('[data-tool="text"]'); click(1000, 2000); page.wait_for_timeout(100)
    page.keyboard.type("M1"); page.keyboard.press("Enter"); page.wait_for_timeout(150)
    t = [i for i in M()["items"] if i["type"] == "text"]
    check("Text auf dem Raster ab Fixpunkt, Ebene Beschriftung", len(t) == 1 and t[0]["x"] == 1000 and t[0]["y"] == 2000 and t[0]["layer"] == "text", t)

    # Plantausch: neue PDF (1 Seite), Text bleibt bei (1000, 2000) mm
    old_asset = bg["asset"]
    page.keyboard.press("Meta+1"); page.wait_for_timeout(80)
    check("3d: ⌘1 Hintergrund zeigt die Plan-Werkzeuge", page.locator('[data-tool="pv-rotate"]').count() == 1 and page.locator('[data-pvact="pdf"]').count() == 1)
    load(B, confirm=True)
    page.wait_for_selector(".modal [data-c]", timeout=10000); page.click(".modal [data-c]"); page.wait_for_timeout(300)  # 3c: Massstab später
    bg = M()["bg"]
    t2 = [i for i in M()["items"] if i["type"] == "text"]
    check("Plantausch: „Später“ = neuer Plan ohne Massstab und Fixpunkt", bg["asset"] != old_asset and bg.get("swap") is True and "fix" not in bg and "mmPerPt" not in bg and near(bg["w"], 1190, 0.01), bg)
    check("Plantausch: Objekt unverändert relativ zum Fixpunkt", t2 == t, t2)
    doc = D()
    check("Gespeichert wird nur die neue PDF", list(doc["assets"].keys()) == [bg["asset"]])
    wait_image()
    # neuer Fixpunkt ohne Rückfrage, Objekt bleibt
    page.click('[data-tool="pv-fix"]'); click(*world(bg, 595, 200)); page.wait_for_timeout(200)
    bg = M()["bg"]
    check("Plantausch: Fixpunkt ohne Rückfrage, Objekt bleibt", page.locator(".modal").count() == 0 and "swap" not in bg and [i for i in M()["items"] if i["type"] == "text"] == t)
    # Fixpunkt nochmals verschieben: jetzt mit Rückfrage (Objekte vorhanden)
    page.click('[data-tool="pv-fix"]'); click(*world(bg, 605, 200)); page.wait_for_timeout(200)
    check("Fixpunkt verschieben mit Objekten fragt nach", page.locator(".modal .choice").count() == 2, (M()["bg"], page.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent)")))
    page.click('.modal .choice[data-v="0"]'); page.wait_for_timeout(200)  # Objekte bleiben auf dem Plan
    tt = [i for i in M()["items"] if i["type"] == "text"][0]
    check("Objekte bleiben auf dem Plan (mitverschoben um 10 pt)", near(tt["x"], 1000 - 10 * PT_MM, 0.6) and near(tt["y"], 2000, 0.6), tt)

    # Rückgängig bis vor den Plantausch: alter Plan wieder da
    for _ in range(3): page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("Rückgängig stellt den alten Plan her, Text bleibt", M()["bg"]["asset"] == old_asset and M()["bg"]["mmPerPt"] > 0 and [i for i in M()["items"] if i["type"] == "text"] == t)
    for _ in range(3): page.keyboard.press("Meta+Shift+z"); page.wait_for_timeout(80)
    bg = M()["bg"]

    # Speichern und Öffnen: unverändert
    with page.expect_download() as d: page.click("#btn-save")
    f = OUT / "pv.schemacad.json"; d.value.save_as(f)
    saved = json.loads(f.read_text())
    check("Gespeichert: Version 7, PDF B byteidentisch", saved["version"] == 7 and list(saved["assets"].values())[0]["data"] == base64.b64encode(B.read_bytes()).decode())
    page.click("#btn-new"); page.wait_for_timeout(200); page.click('[data-start="schema"]')
    if page.locator(".modal").count(): page.click('.modal [data-r="1"]'); page.wait_for_timeout(200)
    with page.expect_file_chooser() as fc: page.click("#btn-open")
    fc.value.set_files(str(f)); page.wait_for_timeout(400)
    pi = next(i for i, sh in enumerate(saved["sheets"]) if sh.get("kind") == "pv")  # feste Reihenfolge (CJ 16.10.): Stringplan nach der Legende
    page.click("#sheet-cur"); page.click(f'#sheet-menu [data-sheet="{pi}"]'); page.wait_for_timeout(300)
    check("Geöffnet: Stringplan mit gleichem Plan und Objekten", kind() == "pv" and M()["bg"] == bg and M()["items"] == saved["sheets"][pi]["items"])
    wait_image()
    check("Geöffnet: Plan wird wieder gerendert", page.locator("#sheet image").count() == 1)
    page.screenshot(path=str(OUT / "pv_geoeffnet.png"))

    # ---------- Schritt 3: Dach nachzeichnen, Fang, Ebenen ----------
    v = page.evaluate("window.__schemacad.view"); box = page.evaluate("(()=>{const r=document.querySelector('#svg').getBoundingClientRect();return {w:r.width,h:r.height}})()")
    vx0, vx1 = -v["x"] / v["z"], (box["w"] - v["x"]) / v["z"]; vy0, vy1 = 210 - (box["h"] - v["y"]) / v["z"], 210 + v["y"] / v["z"]
    G = 100; X0 = round((vx0 + (vx1 - vx0) * 0.3) / G) * G; Y0 = round((vy0 + (vy1 - vy0) * 0.3) / G) * G
    RW = round((vx1 - vx0) * 0.3 / G) * G; RH = round((vy1 - vy0) * 0.25 / G) * G
    def click_px(x, y, dx=0, dy=0): notoast(); X, Y = pt(x, y); page.mouse.move(X + dx, Y + dy); page.mouse.click(X + dx, Y + dy); page.wait_for_timeout(40)
    # Meldungen liegen über der Zeichenfläche und schlucken Klicks (bekannt aus Schritt 2): vor Klicks entfernen
    notoast = lambda: page.evaluate("document.querySelectorAll('.toast').forEach(t=>t.remove())")
    roofs = lambda: [i for i in M()["items"] if i["type"] == "roofline"]
    keeps = lambda: [i for i in M()["items"] if i["type"] == "keepout"]
    toasts = lambda: " ".join(page.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent)"))
    page.keyboard.press("Meta+2"); page.wait_for_timeout(80)
    check("3c: ⌘2 macht Dach aktiv", active() == ["dach"], active())
    check("Dach-Werkzeuge und Ebenen links", page.locator('[data-tool="pv-roof"]').count() == 1 and page.locator('[data-tool="pv-keepout"]').count() == 1 and page.locator(".layer-row").count() == 5)
    # Umriss als geschlossene Dachlinie: 4 Ecken (Raster ab Fixpunkt), Schluss mit Klick knapp neben den ersten Punkt (Fang Endpunkt)
    page.click('[data-tool="pv-roof"]')
    for x, y in [(X0, Y0), (X0 + RW, Y0), (X0 + RW, Y0 + RH), (X0, Y0 + RH)]: click_px(x, y, 2, -1)
    check("Fangsymbol beim Zeichnen", page.locator("#overlay rect, #overlay circle").count() > 0)
    click_px(X0, Y0, 4, 3)
    r = roofs()
    check("Dachlinie geschlossen, Ecken auf dem Raster", len(r) == 1 and r[0]["closed"] is True and r[0]["pts"] == [[X0, Y0], [X0 + RW, Y0], [X0 + RW, Y0 + RH], [X0, Y0 + RH]], r)
    # Firstlinie: Start auf der Mitte der unteren Kante (Fang Mitte), Ende auf der oberen Kante (Fang Kante), Eingabetaste beendet offen
    click_px(X0 + RW / 2, Y0, 3, -3)
    ex = X0 + RW * 0.37; click_px(ex, Y0 + RH, 1, 3)
    page.keyboard.press("Enter"); page.wait_for_timeout(100)
    r = roofs()
    ok = len(r) == 2 and r[1]["closed"] is False and r[1]["pts"][0] == [X0 + RW / 2, Y0] and r[1]["pts"][1][1] == Y0 + RH and near(r[1]["pts"][1][0], ex, 4 / v["z"]) and r[1]["pts"][1][0] % G != 0
    check("Fang auf Mitte und Kante der Dachlinie", ok, r[1:] )
    # Alt schaltet den Fang aus: Punkt bleibt neben der Ecke, Esc verwirft den Entwurf mit nur einem Punkt
    notoast(); page.keyboard.down("Alt"); X, Y = pt(X0 + RW, Y0); page.mouse.move(X + 3, Y + 3); page.mouse.click(X + 3, Y + 3); page.keyboard.up("Alt")
    page.wait_for_timeout(60)
    page.mouse.move(X + 40, Y + 40); page.wait_for_timeout(40); page.mouse.click(X + 40, Y + 40); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    r = roofs()
    check("Alt: kein Fang auf die Ecke", len(r) == 3 and r[2]["pts"][0] != [X0 + RW, Y0] and near(r[2]["pts"][0][0], X0 + RW + 3 / v["z"], 1.5 / v["z"]), r[2:])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(100)
    check("Rückgängig entfernt die letzte Dachlinie", len(roofs()) == 2)
    # Sperrfläche: Dreieck, Eingabetaste schliesst; mit zwei Punkten Meldung und nichts gespeichert
    page.click('[data-tool="pv-keepout"]')
    for x, y in [(X0 + G, Y0 + G), (X0 + 3 * G, Y0 + G), (X0 + 3 * G, Y0 + 3 * G)]: click_px(x, y)
    page.keyboard.press("Enter"); page.wait_for_timeout(100)
    k = keeps()
    check("Sperrfläche mit 3 Ecken gespeichert", len(k) == 1 and k[0]["pts"] == [[X0 + G, Y0 + G], [X0 + 3 * G, Y0 + G], [X0 + 3 * G, Y0 + 3 * G]], k)
    click_px(X0 + 5 * G, Y0 + G); click_px(X0 + 6 * G, Y0 + G); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    check("Sperrfläche mit 2 Punkten: Meldung, nichts gespeichert", len(keeps()) == 1 and "mindestens drei" in toasts())
    # Auswählen: Klick in die Sperrfläche, rechte Leiste zeigt Fläche
    page.keyboard.press("Escape"); page.click('[data-tool="select"]')
    X, Y = pt(X0 + 2.6 * G, Y0 + 1.4 * G); notoast(); page.mouse.click(X, Y); page.wait_for_timeout(100)
    check("Sperrfläche innen wählbar, Fläche rechts", "Sperrfläche" in page.inner_text("#right") and "0,02 m²" in page.inner_text("#right"), page.inner_text("#right"))
    page.keyboard.press("ArrowRight"); page.wait_for_timeout(80)
    check("Pfeiltaste verschiebt die Sperrfläche um das Raster", keeps()[0]["pts"][0] == [X0 + 2 * G, Y0 + G], keeps())
    page.keyboard.press("Meta+z"); page.keyboard.press("Escape"); page.wait_for_timeout(80)

    def layer(l, key): page.click(f'[data-pvact="layer"][data-layer="{l}"][data-key="{key}"]'); page.wait_for_timeout(120)
    sel = lambda: page.evaluate("document.querySelectorAll('#overlay .sel-a').length")
    # Ebene Dach sperren: sichtbar, Fang geht, nicht wählbar, nichts Neues
    layer("dach", "lock")
    X, Y = pt(X0 + RW, Y0 + RH / 2); notoast(); page.mouse.click(X, Y); page.wait_for_timeout(80)
    check("Gesperrte Ebene: Dachlinie nicht wählbar", sel() == 0 and page.locator("#items polygon").count() == 2)
    page.keyboard.press("Meta+a"); page.wait_for_timeout(80)
    check("Gesperrte Ebene Dach aktiv: ⌘A wählt nichts (5n)", sel() == 0)
    page.keyboard.press("Meta+5"); page.wait_for_timeout(80); page.keyboard.press("Meta+a"); page.wait_for_timeout(80)
    check("Ebene Beschriftung aktiv: ⌘A wählt nur den Text (5n)", sel() == 1)
    page.keyboard.press("Escape"); page.keyboard.press("Meta+2"); page.wait_for_timeout(80)
    page.click('[data-tool="pv-roof"]'); click_px(X0, Y0)
    check("Gesperrte Ebene: keine neue Dachlinie, Meldung", "gesperrt" in toasts() and len(roofs()) == 2)
    layer("dach", "lock")
    # Ebene Dach ausblenden: nicht gezeichnet, kein Fang
    layer("dach", "show")
    check("Ausgeblendete Ebene: Dach nicht gezeichnet", page.locator("#items polygon, #items polyline").count() == 0)
    page.click('[data-tool="select"]'); X, Y = pt(X0 + RW, Y0 + RH / 2); notoast(); page.mouse.click(X, Y); page.wait_for_timeout(80)
    check("Ausgeblendete Ebene: nicht wählbar", sel() == 0)
    layer("dach", "show")
    check("Ebene wieder sichtbar", page.locator("#items polygon").count() == 2 and M()["layers"]["dach"] == {"show": True, "lock": False})
    # Beschriftung sperren: kein neuer Text
    page.click('button.layer-name[data-layer="text"]'); page.wait_for_timeout(80)
    check("3c: Klick auf den Ebenennamen macht sie aktiv", active() == ["text"], active())
    layer("text", "lock"); page.click('[data-tool="text"]'); click_px(X0, Y0 - 3 * G)
    check("Gesperrte aktive Beschriftung: kein Texteditor", page.locator("#editor").is_hidden() and "Beschriftung" in toasts())
    layer("text", "lock")
    # 5b: Dach-Werkzeuge nur auf Ebene Dach. Laufende Dachlinie: Ebenenwechsel beendet sie (wie Werkzeugwechsel), Werkzeug Auswählen
    page.keyboard.press("Escape"); page.keyboard.press("Meta+2"); page.wait_for_timeout(80)
    page.click('[data-tool="pv-roof"]'); click_px(X0 - 8 * G, Y0 - 8 * G); click_px(X0 - 6 * G, Y0 - 8 * G)
    page.keyboard.press("Meta+3"); page.wait_for_timeout(80)
    check("5b: Ebene Module: keine Dach-Werkzeuge, Modul-Werkzeuge da", page.locator('[data-tool="pv-roof"], [data-tool="pv-keepout"], [data-tool="pv-string"]').count() == 0 and page.locator('[data-tool="pv-module"]').count() == 1)
    check("5b: Ebenenwechsel beendet die Dachlinie auf Dach, Auswählen aktiv", len(roofs()) == 3 and roofs()[-1].get("layer") == "dach" and page.get_attribute('[data-tool="select"]', "aria-pressed") == "true", roofs()[-1])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    # 3c: Text auf der aktiven Ebene Module; Module sperren sperrt nur ihn (seit 5b mit Text statt Dachlinie)
    texts = lambda: [i for i in M()["items"] if i["type"] == "text"]
    page.click('[data-tool="text"]'); click_px(X0 - 8 * G, Y0 - 8 * G); page.keyboard.type("TM"); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    check("3c: neuer Text liegt auf der aktiven Ebene Module", texts()[-1].get("layer") == "module" and len(roofs()) == 2, texts()[-1])
    page.click('[data-tool="select"]'); page.keyboard.press("Escape")
    def pick_text(): X, Y = pt(X0 - 8 * G, Y0 - 8 * G); notoast(); page.mouse.click(X + 4, Y - 4); page.wait_for_timeout(80)
    pick_text()
    check("3c: Text auf Module wählbar", sel() == 1)
    layer("module", "lock"); page.keyboard.press("Escape"); pick_text()
    check("3c: Module gesperrt: Text nicht wählbar, Dach bleibt wählbar", sel() == 0)
    click_px(X0 + RW, Y0 + RH / 2)
    check("5s: Dachlinie bei aktiver Ebene Module nicht wählbar", sel() == 0)
    page.keyboard.press("Meta+2"); page.wait_for_timeout(60); click_px(X0 + RW, Y0 + RH / 2)
    check("3c: Dachlinie auf Dach weiter wählbar (Ebene Dach aktiv)", sel() == 1)
    page.keyboard.press("Meta+3"); page.wait_for_timeout(60)
    layer("module", "lock")
    for _ in range(3): page.keyboard.press("Meta+z"); page.wait_for_timeout(60)  # Sperren, Entsperren, Text
    check("3c: Rückgängig entfernt den Text auf Module", not any(t.get("layer") == "module" for t in texts()) and len(roofs()) == 2, texts())
    page.keyboard.press("Escape"); page.keyboard.press("Meta+1"); page.wait_for_timeout(80)  # Hintergrund aktiv: Plan-Werkzeuge
    # Hintergrund ausblenden und sperren
    layer("bg", "show")
    check("Hintergrund ausgeblendet: kein Planbild", page.locator("#sheet image").count() == 0)
    layer("bg", "show"); layer("bg", "lock")
    page.click('[data-tool="pv-fix"]'); fix_before = M()["bg"]["fix"]; click_px(X0, Y0)
    check("Hintergrund gesperrt: Fixpunkt unverändert, Meldung", M()["bg"]["fix"] == fix_before and "Hintergrund" in toasts())
    layer("bg", "lock"); page.keyboard.press("Escape")
    page.keyboard.press("Meta+2"); page.wait_for_timeout(80)
    check("3d: Wechsel auf Dach: Plan-Werkzeuge weg, Auswählen aktiv", page.locator('[data-tool="pv-fix"]').count() == 0 and page.get_attribute('[data-tool="select"]', "aria-pressed") == "true")
    check("Ebenen: keine JS-Fehler bis hier", not errors, errors)

    # ---------- Schritt 3b: Punkte ziehen, Shift rechtwinklig, Fang auf Schnittpunkte ----------
    items_3b = M()["items"]
    grips = lambda: page.locator("#overlay .pv-grip").count()
    def pick_roof(): page.click('[data-tool="select"]'); X, Y = pt(X0 + RW, Y0 + RH / 2); notoast(); page.mouse.click(X, Y); page.wait_for_timeout(80)
    def drag(x0, y0, x1, y1, dx=0, dy=0, shift=False):
        notoast(); X, Y = pt(x0, y0); X1, Y1 = pt(x1, y1); page.mouse.move(X, Y); page.mouse.down()
        if shift: page.keyboard.down("Shift")
        page.mouse.move((X + X1) / 2, (Y + Y1) / 2, steps=3); page.mouse.move(X1 + dx, Y1 + dy, steps=3); page.mouse.up()
        if shift: page.keyboard.up("Shift")
        page.wait_for_timeout(80)
    pick_roof()
    check("3b: gewählte Dachlinie zeigt Griffe an den 4 Ecken", grips() == 4, grips())
    r0 = roofs()[0]["pts"]
    drag(X0 + RW, Y0 + RH, X0 + RW + 2 * G, Y0 + RH + G, 2, -1)
    p3 = roofs()[0]["pts"]
    check("3b: Punkt ziehen, Ecke auf Raster, übrige Punkte bleiben", p3[2] == [X0 + RW + 2 * G, Y0 + RH + G] and p3[:2] + p3[3:] == r0[:2] + r0[3:], p3)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("3b: Punkt ziehen rückgängig", roofs()[0]["pts"] == r0)
    pick_roof()
    drag(X0 + RW, Y0 + RH, X0 + RW + 0.8 * G, Y0 + RH + 2 * G, shift=True)
    check("3b: Shift beim Ziehen = senkrecht zum vorherigen Punkt", roofs()[0]["pts"][2] == [X0 + RW, Y0 + RH + 2 * G], roofs()[0]["pts"])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    # Shift beim Zeichnen: zweiter Punkt waagrecht zum ersten
    use("pv-roof"); click_px(X0 - 5 * G, Y0 - 5 * G)
    page.keyboard.down("Shift"); click_px(X0 - 2 * G, Y0 - 4.3 * G); page.keyboard.up("Shift"); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    check("3b: Shift beim Zeichnen = waagrecht", roofs()[-1]["pts"] == [[X0 - 5 * G, Y0 - 5 * G], [X0 - 2 * G, Y0 - 5 * G]], roofs()[-1])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    # Schnittpunkt: waagrechte Linie quer über das Dach, Fang auf ihren Schnitt mit der Firstlinie (Schnitt vor Mitte)
    YM = Y0 + round(RH / 2 / G) * G; XL = X0 - round(RW * 0.2 / G) * G; XR = X0 + RW + round(RW * 0.2 / G) * G
    click_px(XL, YM); click_px(XR, YM); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    fa, fb = roofs()[1]["pts"]; xi = fa[0] + (YM - fa[1]) / (fb[1] - fa[1]) * (fb[0] - fa[0])
    notoast(); X, Y = pt(xi, YM); page.mouse.move(X + 3, Y + 2); page.wait_for_timeout(60)
    check("3b: Fangsymbol Schnittpunkt", page.locator("#overlay .snap-inter").count() == 1)
    click_px(xi, YM, 3, 2); click_px(XL, Y0 + RH); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    q = roofs()[-1]["pts"][0]
    check("3b: Punkt liegt auf dem Schnittpunkt", len(roofs()) == 4 and near(q[0], xi, 0.01) and q[1] == YM, (q, xi, YM))
    page.keyboard.press("Meta+z"); page.keyboard.press("Meta+z"); page.wait_for_timeout(100)
    check("3b: nach Rückgängig alles wie vorher", M()["items"] == items_3b)
    page.keyboard.press("Escape")
    check("3b: keine JS-Fehler", not errors, errors)

    # ---------- Schritt 3d: Plan drehen an einer Kante, Objekte drehen mit ----------
    import math
    items_r = M()["items"]; fix_r = M()["bg"]["fix"]
    page.keyboard.press("Meta+1"); page.wait_for_timeout(80); use("pv-rotate")
    ax, ay, bx2, by2 = X0, Y0, X0 + RW, Y0 + RW * math.tan(math.radians(10))
    click_px(ax, ay); click_px(bx2, by2); page.wait_for_timeout(150)
    prop = page.input_value('.modal [data-f="0"]') if page.locator('.modal [data-f="0"]').count() else "?"
    check("3d: Drehen schlägt ca. −10° vor (Kante waagrecht)", prop != "?" and near(float(prop.replace(",", ".")), -10, 0.3), prop)
    page.fill('.modal [data-f="0"]', "-10"); page.click(".modal [data-ok]"); page.wait_for_timeout(200)
    bgR = M()["bg"]; c10, s10 = math.cos(math.radians(-10)), math.sin(math.radians(-10))
    rp = lambda x, y: (x * c10 - y * s10, x * s10 + y * c10)
    ok = all(near(q[0], rp(*o)[0], 0.002) and near(q[1], rp(*o)[1], 0.002) for a, b2 in zip(items_r, M()["items"]) if "pts" in a for o, q in zip(a["pts"], b2["pts"]))
    check("3d: Plan um −10° gedreht, Fixpunkt bleibt, Objekte drehen mit", bgR.get("rot") == -10 and bgR["fix"] == fix_r and ok, (bgR, M()["items"][:1]))
    check("3d: Planbild gedreht gezeichnet, rechte Leiste nennt Drehung", "rotate(-10)" in (page.get_attribute("#sheet g[opacity]", "transform") or "") and "gedreht um -10°" in page.inner_text("#right"))
    page.keyboard.press("Meta+z"); page.wait_for_timeout(100)
    check("3d: Rückgängig dreht zurück", "rot" not in M()["bg"] and M()["items"] == items_r)
    page.keyboard.press("Escape")
    check("3d: keine JS-Fehler", not errors, errors)

    # Plantausch mit Dachlinien: Plan A laden, Fixpunkt setzen → Dach bleibt in mm am Fixpunkt
    items_before = [i for i in M()["items"]]
    page.keyboard.press("Meta+1"); page.wait_for_timeout(80)
    load(A, confirm=True)
    if page.locator(".modal .choice").count(): page.click('.modal .choice[data-v="0"]'); page.wait_for_timeout(300)
    # 3c: bekannter Massstab, ungültige Eingabe lässt den Dialog offen
    page.wait_for_selector(".modal [data-den]", timeout=10000); asset_b = M()["bg"]["asset"]
    page.fill(".modal [data-den]", "abc"); page.click(".modal [data-ok]"); page.wait_for_timeout(100)
    check("3c: ungültiger Massstab: Meldung, Dialog bleibt", page.locator(".modal [data-den]").count() == 1 and "z. B. 100" in toasts() and M()["bg"]["asset"] == asset_b)
    page.fill(".modal [data-den]", "1:200"); page.click(".modal [data-ok]"); page.wait_for_timeout(300)
    bg = M()["bg"]
    check("3c: Plantausch mit Massstab 1:200 (Eingabe), ohne Messstrecke und Fixpunkt", bg["asset"] != asset_b and bg.get("swap") is True and "fix" not in bg and near(bg.get("mmPerPt", 0), 200 * PT_MM, 1e-9) and "measure" not in bg, bg)
    check("3c: rechte Leiste zeigt Massstab 1:200", "Massstab 1:200" in page.inner_text("#right"))
    wait_image()
    bg = M()["bg"]
    use("pv-fix"); notoast(); click(*world(bg, 300, 300)); page.wait_for_timeout(200)
    check("Plantausch: Dachlinien und Sperrfläche unverändert (mm)", "swap" not in M()["bg"] and M()["items"] == items_before and page.locator(".modal").count() == 0, (M()["bg"], page.locator(".modal").count(), toasts()))

    # Speichern und Öffnen: Dach und Ebenen gleich
    layer("module", "lock")
    with page.expect_download() as d: page.click("#btn-save")
    f3 = OUT / "pv_dach.schemacad.json"; d.value.save_as(f3)
    saved3 = json.loads(f3.read_text()); sh3 = saved3["sheets"][saved3["active"]]
    page.click("#btn-new"); page.wait_for_timeout(200); page.click('[data-start="schema"]')
    if page.locator(".modal").count(): page.click('.modal [data-r="1"]'); page.wait_for_timeout(200)
    with page.expect_file_chooser() as fc: page.click("#btn-open")
    fc.value.set_files(str(f3)); page.wait_for_timeout(400)
    if kind() != "pv": page.click("#sheet-cur"); page.click('#sheet-menu [data-sheet="1"]'); page.wait_for_timeout(300)
    check("Geöffnet: Dachlinien, Sperrfläche, Ebenen gleich", M()["items"] == sh3["items"] and M()["layers"] == sh3["layers"] and sh3["layers"]["module"]["lock"] is True and len([i for i in sh3["items"] if i["type"] in ("roofline", "keepout")]) == 3)
    wait_image()
    page.screenshot(path=str(OUT / "pv_dach.png"))

    # ---------- Schritt 4: Modultyp, Katalog, Modul, Modulfeld ----------
    mods = lambda: [i for i in M()["items"] if i["type"] == "pvmodule"]
    mts = lambda: (D().get("pv") or {}).get("moduleTypes", [])
    # UI Schritt 6 Teil 2: Module, Wechselrichter und Druck in Fenstern oben (öffnet das Fenster bei Bedarf)
    POPK = {"psize": "druck", "pquer": "druck", "pden": "druck", "north": "druck", "strk": "druck", "pr": "druck", "tmin": "wr", "wr": "wr", "mppt": "wr", "str": "wr"}
    def pop(kind):
        btn = {"mod": "#btn-pvmod", "wr": "#btn-pvwr", "druck": "#btn-pvdruck"}[kind]
        if not (page.is_visible("#pv-pop") and page.get_attribute(btn, "aria-expanded") == "true"): page.click(btn); page.wait_for_timeout(60)
        return "#pv-pop"
    def setopt(k, val):
        loc = page.locator(f'{pop(POPK[k]) if k in POPK else "#right"} [data-pvopt="{k}"]')
        if loc.evaluate("e => e.tagName") == "SELECT": loc.select_option(val)
        else: loc.fill(val); loc.dispatch_event("change")
        page.wait_for_timeout(80)
    def alt_click(x, y):
        notoast(); X, Y = pt(x, y); page.keyboard.down("Alt"); page.mouse.move(X - 20, Y + 20); page.mouse.move(X, Y); page.mouse.click(X, Y); page.keyboard.up("Alt"); page.wait_for_timeout(80)
    page.keyboard.press("Escape"); use("pv-field"); page.wait_for_timeout(80)
    check("4: Werkzeuge Modul und Modulfeld links, ohne Modultyp Hinweis rechts", page.locator('[data-tool="pv-module"]').count() == 1 and "Noch kein Modultyp" in page.inner_text("#right"))
    page.click('#right [data-pvact="mtnew"]'); page.wait_for_selector('.modal [data-f="9"]')
    page.fill('.modal [data-f="0"]', "Testmodul"); page.fill('.modal [data-f="1"]', "1700"); page.fill('.modal [data-f="2"]', "abc")
    notoast(); page.click(".modal [data-ok]"); page.wait_for_timeout(150)
    check("4: ungültige Breite: Meldung, Formular wieder offen mit den Eingaben", "Breite" in toasts() and page.input_value('.modal [data-f="0"]') == "Testmodul" and page.input_value('.modal [data-f="2"]') == "abc")
    page.fill('.modal [data-f="2"]', "1000"); page.fill('.modal [data-f="9"]', "-0,3"); page.click(".modal [data-ok]"); page.wait_for_timeout(150)
    t = mts()
    check("4: Modultyp im Katalog der Datei, leere Felder fehlen", len(t) == 1 and t[0]["name"] == "Testmodul" and t[0]["l"] == 1700 and t[0]["b"] == 1000 and t[0]["tkVoc"] == -0.3 and "voc" not in t[0], t)
    check("4: Vorgabeabstand 5 mm, Spalten und Reihen rechts", page.input_value('#right [data-pvopt="gq"]') == "5" and page.input_value('#right [data-pvopt="gl"]') == "5")
    # Ebene Module ist aus dem Speichertest noch gesperrt: Meldung, nichts gesetzt
    AX = round((X0 + RW + 1000) / G) * G; AY = Y0
    click_px(AX, AY)
    check("4: gesperrte Ebene Module: Meldung, kein Modul", "gesperrt" in toasts() and not mods())
    layer("module", "lock")
    setopt("cols", "3"); setopt("rows", "2"); setopt("gq", "10")
    check("4: Feldgrösse rechts (3 × 2, 3020 × 3405 mm)", "6 Module, 3 020 × 3 405 mm" in page.inner_text("#right"), page.inner_text("#right"))
    notoast(); X, Y = pt(AX, AY); page.mouse.move(X, Y); page.wait_for_timeout(60)
    check("4: Vorschau des Feldes am Mauszeiger", page.locator("#overlay .pv-module").count() == 6)
    click_px(AX, AY)
    m = mods()
    exp = [[AX + c * 1010, AY + r * 1705] for r in range(2) for c in range(3)]
    check("4: Modulfeld 3 × 2 hoch, Abstände 10/5 mm, Ebene Module", len(m) == 6 and [[i["x"], i["y"]] for i in m] == exp and all(i["quer"] is False for i in m) and page.locator("#items .pv-module").count() == 6, m)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("4: Rückgängig entfernt das ganze Feld", not mods())
    page.keyboard.press("Meta+Shift+z"); page.wait_for_timeout(80)
    check("4: Wiederholen", len(mods()) == 6)
    # Einzelnes Modul quer auf eine Ecke der Sperrfläche: Warnung, Modul rot, trotzdem gesetzt
    use("pv-module"); setopt("quer", "1")
    kx, ky = keeps()[0]["pts"][0]
    alt_click(kx - 500, ky - 500)
    m = mods()
    check("4: Modul quer auf Sperrfläche: gesetzt, Warnung, rot", len(m) == 7 and m[-1]["quer"] is True and "Sperrfläche" in toasts() and page.locator("#items .pv-module.warn").count() == 1, (m[-1:], toasts()))
    # Fang auf Modulecken: Modul an die rechte obere Ecke des Feldes
    click_px(AX + 2 * 1010 + 1000, AY + 1705 + 1700, 2, -2)
    check("4: Fang auf Modulecke", [mods()[-1]["x"], mods()[-1]["y"]] == [AX + 3020, AY + 3405], mods()[-1])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    # Auswählen: Modul anklicken, Lage rechts ändern, Rückgängig, Pfeiltaste, Löschen
    page.click('[data-tool="select"]'); X, Y = pt(AX + 500, AY + 800); notoast(); page.mouse.click(X, Y); page.wait_for_timeout(100)
    rt = page.inner_text("#right")
    check("4: Modul wählbar, rechte Leiste nennt Typ und Lage", "Modul" in rt and "Testmodul" in rt and page.locator('#right [data-pvopt="selquer"]').count() == 1, rt)
    setopt("selquer", "1")
    check("4: Lage geändert (quer)", mods()[0]["quer"] is True)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("4: Rückgängig Lage", mods()[0]["quer"] is False)
    page.keyboard.press("ArrowRight"); page.wait_for_timeout(80)
    check("4: Pfeiltaste verschiebt das Modul um das Raster", mods()[0]["x"] == AX + G, mods()[0])
    page.keyboard.press("Meta+z"); page.keyboard.press("Backspace"); page.wait_for_timeout(80)
    check("4: Löschen entfernt das Modul", len(mods()) == 6)
    page.keyboard.press("Meta+z"); page.keyboard.press("Escape"); page.wait_for_timeout(80)
    # Katalog: Typ in Verwendung nicht löschbar, sichern, laden (gleicher Name übersprungen, neuer übernommen)
    tid = mts()[0]["id"]
    notoast(); page.click(pop("mod") + f' [data-pvact="mtdel"][data-mt="{tid}"]'); page.wait_for_timeout(100)
    check("UI 6b: Fenster Module mit Katalog, rechts ohne Katalog", "Testmodul" in page.inner_text("#pv-pop") and page.locator('#pv-pop [data-pvact="catload"]').count() == 1 and page.locator('#right [data-pvact="catload"]').count() == 0)
    check("4: Modultyp in Verwendung: Meldung, bleibt", "noch verwendet" in toasts() and len(mts()) == 1)
    with page.expect_download() as d: page.click(pop("mod") + ' [data-pvact="catsave"]')
    fk = OUT / "katalog.schemacad-katalog.json"; d.value.save_as(fk)
    kat = json.loads(fk.read_text())
    check("4: Katalog gesichert ohne ids", kat["format"] == "schemacad-katalog" and kat["moduleTypes"] == [{k: v for k, v in mts()[0].items() if k != "id"}], kat)
    kat["moduleTypes"].append({"name": "Zweites", "l": 2000, "b": 1100, "voc": 45})
    fk2 = OUT / "katalog2.schemacad-katalog.json"; fk2.write_text(json.dumps(kat))
    with page.expect_file_chooser() as fc: page.click(pop("mod") + ' [data-pvact="catload"]')
    fc.value.set_files(str(fk2)); page.wait_for_timeout(300)
    check("4: Katalog laden: nur der neue Typ übernommen", [x["name"] for x in mts()] == ["Testmodul", "Zweites"] and "1 Modultyp übernommen" in toasts(), (mts(), toasts()))
    page.keyboard.press("Escape"); page.keyboard.press("Meta+z"); page.wait_for_timeout(100)  # Fenster zu: Tastenkürzel ruhen im Fenster
    check("4: Rückgängig entfernt den geladenen Typ", [x["name"] for x in mts()] == ["Testmodul"])
    # Speichern und Öffnen: Katalog und Module gleich
    with page.expect_download() as d: page.click("#btn-save")
    f4 = OUT / "pv_module.schemacad.json"; d.value.save_as(f4)
    saved4 = json.loads(f4.read_text()); sh4 = saved4["sheets"][saved4["active"]]
    page.click("#btn-new"); page.wait_for_timeout(200); page.click('[data-start="schema"]')
    if page.locator(".modal").count(): page.click('.modal [data-r="1"]'); page.wait_for_timeout(200)
    with page.expect_file_chooser() as fc: page.click("#btn-open")
    fc.value.set_files(str(f4)); page.wait_for_timeout(400)
    if kind() != "pv": page.click("#sheet-cur"); page.click('#sheet-menu [data-sheet="1"]'); page.wait_for_timeout(300)
    check("4: Geöffnet: Katalog und 7 Module gleich, eines rot", D().get("pv") == saved4["pv"] and M()["items"] == sh4["items"] and len([i for i in sh4["items"] if i["type"] == "pvmodule"]) == 7 and page.locator("#items .pv-module").count() == 7 and page.locator("#items .pv-module.warn").count() == 1)
    wait_image()
    page.screenshot(path=str(OUT / "pv_module.png"))
    check("4: keine JS-Fehler", not errors, errors)

    # ---------- Fehler aus CJs Prüfung von Schritt 4 ----------
    # Fehler 2: Dialog „Neuer Modultyp“ bei kleiner Fensterhöhe: scrollt, Knöpfe sichtbar und klickbar
    page.set_viewport_size({"width": 1200, "height": 420}); page.wait_for_timeout(150)
    use("pv-module"); page.click('#right [data-pvact="mtnew"]'); page.wait_for_selector('.modal [data-f="9"]'); page.wait_for_timeout(250)
    r = page.evaluate("(()=>{const m=document.querySelector('.modal'),k=document.querySelector('.modal [data-ok]').getBoundingClientRect();return {sh:m.scrollHeight,ch:m.clientHeight,bot:k.bottom,top:m.getBoundingClientRect().top}})()")
    check("Fehler 2: Dialog scrollt im kleinen Fenster, Knöpfe sichtbar", r["sh"] > r["ch"] and r["top"] >= 0 and r["bot"] <= 420, r)
    page.fill('.modal [data-f="0"]', "Massmodul"); page.fill('.modal [data-f="1"]', "2000"); page.fill('.modal [data-f="2"]', "1000")
    page.locator('.modal [data-f="9"]').scroll_into_view_if_needed(); page.mouse.click(*[page.locator(".modal [data-ok]").bounding_box()[k] + 5 for k in ("x", "y")]); page.wait_for_timeout(150)
    check("Fehler 2: Anlegen im kleinen Fenster erreichbar", page.locator(".modal").count() == 0 and "Massmodul" in [x["name"] for x in mts()], mts())
    page.set_viewport_size({"width": 1440, "height": 900}); page.wait_for_timeout(150)
    # Fehler 1: Massstab. Gebäude 10 × 20 m bei 1:100 = 283,46 × 566,93 pt. Modul 1000 × 2000 mm muss 1/20 der Gebäudelänge sein.
    G1 = OUT / "gebaeude.pdf"; G1.write_bytes(make_pdf([(842, 595, "2 w 100 20 566.93 283.46 re S")]))
    page.keyboard.press("Escape"); page.click("#sheet-add", button="right"); page.click('[data-new="pv"]'); page.wait_for_timeout(200)
    with page.expect_file_chooser() as fc: page.click('[data-pvact="pdf"]')
    fc.value.set_files(str(G1)); page.wait_for_selector(".modal [data-den]")
    page.fill(".modal [data-den]", "1:100"); page.click(".modal [data-ok]"); page.wait_for_timeout(300); wait_image()
    mid = [i["id"] for i in mts() if i["name"] == "Massmodul"][0]
    def mod_ratio():  # Modulbreite / Seitenbreite auf dem Bildschirm, erwartet 1000 mm / (842 pt × mm pro pt)
        use("pv-module"); setopt("mt", mid); setopt("quer", "0"); X, Y = pt(0, 0); page.mouse.move(X - 20, Y + 20); page.mouse.move(X, Y); page.keyboard.down("Alt"); page.mouse.click(X, Y); page.keyboard.up("Alt"); page.wait_for_timeout(150)
        return page.evaluate("(()=>{const i=document.querySelector('#sheet image').getBoundingClientRect(),m=[...document.querySelectorAll('#items .pv-module')].at(-1).getBoundingClientRect();return [m.width/i.width,m.height/m.width]})()")
    q = mod_ratio(); exp = 1000 / (842 * 100 * PT_MM)
    check("Fehler 1: bekannter Massstab 1:100, Modul 1 × 2 m richtig gross auf dem Plan", near(q[0], exp, exp * 0.002) and near(q[1], 2, 0.01), (q, exp))
    # Gleich mit gemessener Strecke: lange Gebäudekante (100,575)–(666,93,575) = 20 000 mm, „wie gemessen“
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80); page.keyboard.press("Meta+1"); page.wait_for_timeout(80)
    bg = M()["bg"]; use("pv-measure")
    click(*world(bg, 100, 575)); page.wait_for_timeout(80); click(*world(bg, 666.93, 575)); page.wait_for_timeout(200)
    page.fill('.modal [data-f="0"]', "20000"); page.click(".modal [data-ok]"); page.wait_for_timeout(150)
    check("Fehler 1: Messen prüft den bekannten Massstab (bisher, Abweichung)", "Bisher 1:100, Abweichung" in page.inner_text(".modal"), page.inner_text(".modal"))
    page.click('.modal .choice[data-v="1"]'); page.wait_for_timeout(300)
    q = mod_ratio(); k = M()["bg"]["mmPerPt"]
    check("Fehler 1: gemessene Strecke 20 m, Modul richtig gross auf dem Plan", near(k, 100 * PT_MM, 0.5) and near(q[0], 1000 / (842 * k), 1000 / (842 * k) * 0.002), (q, k))
    check("Fehler 1: keine JS-Fehler", not errors, errors)

    # ---------- Schritt 5: Verkabelung, Strings, SPA ----------
    strs = lambda: [i for i in M()["items"] if i["type"] == "pvstring"]
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)  # Modul aus dem Massstabstest weg
    use("pv-field"); setopt("mt", mid); setopt("cols", "4"); setopt("rows", "1"); setopt("gq", "5")
    n0 = len(mods()); click_px(0, 3000)
    fm = mods()[n0:]; ctr = lambda m: (m["x"] + 500, m["y"] + 1000)
    check("5: Feld 4 × 1 für die Verkabelung", len(fm) == 4, fm)
    check("5b: Ebene Module zeigt keine Verkabelung", page.locator('[data-tool="pv-string"], [data-tool="pv-spa"]').count() == 0)
    page.keyboard.press("Meta+4"); page.wait_for_timeout(80)
    check("5: Werkzeuge String und SPA links (Ebene Verkabelung), keine Modul-Werkzeuge", page.locator('[data-tool="pv-string"]').count() == 1 and page.locator('[data-tool="pv-spa"]').count() == 1 and page.locator('[data-tool="pv-module"]').count() == 0)
    layer("kabel", "lock"); use("pv-string"); click_px(*ctr(fm[0]))
    check("5: Ebene Verkabelung gesperrt: Meldung, kein String", "gesperrt" in toasts() and not strs())
    layer("kabel", "lock")
    check("5: Vorschlag Bezeichnung 1.1.1 rechts", page.input_value('#right [data-pvopt="sname"]') == "1.1.1" and "WR 1, MPPT 1, String 1" in page.inner_text("#right"))
    click_px(ctr(fm[0])[0], 0)
    check("5: Klick neben ein Modul: Hinweis", "Modul anklicken" in toasts() and not strs())
    for m in fm[:3]: click_px(*ctr(m))
    X, Y = pt(*ctr(fm[3])); page.mouse.move(X, Y); page.wait_for_timeout(60)
    check("5: Vorschau String und Modul unter dem Mauszeiger", page.locator("#overlay .pv-string").count() == 1 and page.locator("#overlay .pv-hover").count() == 1 and "3 Module angeklickt" in page.inner_text("#right"))
    click_px(*ctr(fm[2]))  # nochmals auf das letzte Modul beendet
    st = strs()
    check("5: String 1.1.1 aus der Klickfolge", len(st) == 1 and st[0]["name"] == "1.1.1" and st[0]["mods"] == [m["id"] for m in fm[:3]] and "layer" not in st[0], st)
    col = page.get_attribute("#items .pv-string polyline", "stroke")
    plus = page.locator("#items .pv-plus").bounding_box(); X0p, Y0p = pt(*ctr(fm[0]))
    check("5: Linie in Stringfarbe, + am ersten Modul, − am letzten", page.locator("#items .pv-string").count() == 1 and near(plus["x"] + plus["width"] / 2, X0p, 1.5) and near(plus["y"] + plus["height"] / 2, Y0p, 1.5) and page.locator("#items .pv-minus").count() == 1 and "1.1.1" in page.text_content("#items .pv-name"), (plus, X0p, Y0p))
    fills = page.evaluate("[...document.querySelectorAll('#items .pv-module')].map(r=>r.getAttribute('fill'))")
    check("5: Module des Strings eingefärbt", fills.count(col) == 3, (fills, col))
    check("5: nächster Vorschlag 1.1.2", page.input_value('#right [data-pvopt="sname"]') == "1.1.2")
    click_px(*ctr(fm[1]))
    check("5: Modul schon in einem String: Meldung", "schon zum String 1.1.1" in toasts() and len(strs()) == 1)
    setopt("sname", "2.1")
    check("5: ungültige Bezeichnung: Meldung, Vorschlag bleibt", "WR.MPPT.String" in toasts() and page.input_value('#right [data-pvopt="sname"]') == "1.1.2")
    setopt("sname", "1.1.1")
    check("5: doppelte Bezeichnung: Meldung", "schon" in toasts())
    setopt("sname", "2.1.1"); click_px(*ctr(fm[3])); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    st = strs()
    check("5: zweiter String 2.1.1 mit Eingabetaste, eigene Farbe", len(st) == 2 and st[1]["name"] == "2.1.1" and st[1]["mods"] == [fm[3]["id"]] and page.locator("#items .pv-string").count() == 2 and len(set(page.evaluate("[...document.querySelectorAll('#items .pv-plus')].map(c=>c.getAttribute('stroke'))"))) == 2, st)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5: Rückgängig entfernt den String", len(strs()) == 1)
    # String wählen (Linie zwischen zwei Modulen), umbenennen, Modul löschen, String löschen
    page.click('[data-tool="select"]'); a, b2 = ctr(fm[0]), ctr(fm[1]); click_px((a[0] + b2[0]) / 2, a[1])
    rt = page.inner_text("#right")
    check("5: String wählbar, rechts Bezeichnung und WR/MPPT", "String 1.1.1" in rt and "3 Module" in rt and "WR 1, MPPT 1, String 1" in rt, rt)
    setopt("selname", "1.2.3")
    check("5: String umbenannt", strs()[0]["name"] == "1.2.3")
    page.evaluate("document.activeElement.blur()"); page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5: Rückgängig Umbenennen", strs()[0]["name"] == "1.1.1")
    page.keyboard.press("ArrowUp"); page.wait_for_timeout(80)
    check("5: Pfeiltaste auf String: nichts verschoben, kein Fehler", mods()[n0:] == fm and not errors, errors)
    page.keyboard.press("Escape"); page.keyboard.press("Meta+3"); page.wait_for_timeout(60); click_px(ctr(fm[1])[0], ctr(fm[1])[1] - 700)  # Modul unterhalb der Linie (Ebene Module, 5s)
    page.keyboard.press("Backspace"); page.wait_for_timeout(80)
    check("5: Modul löschen: verlässt den String", strs()[0]["mods"] == [fm[0]["id"], fm[2]["id"]], strs())
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80); page.keyboard.press("Meta+4"); page.wait_for_timeout(60)
    click_px((a[0] + b2[0]) / 2, a[1]); page.keyboard.press("Backspace"); page.wait_for_timeout(80)
    check("5: String löschen, Module bleiben", not strs() and len(mods()[n0:]) == 4)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    # Schritt 5c: ⌥ halten und über die Module fahren
    use("pv-field"); setopt("mt", mid); setopt("cols", "3"); setopt("rows", "1"); setopt("gq", "5")
    n1 = len(mods()); click_px(0, 6000); fc = mods()[n1:]
    page.keyboard.press("Meta+4"); page.wait_for_timeout(80); use("pv-string"); notoast()
    count = lambda: page.evaluate("document.querySelector('#overlay .pv-count')?.textContent ?? null")
    def glide(x, y): X, Y = pt(x, y); page.mouse.move(X, Y); page.wait_for_timeout(40)
    glide(ctr(fc[0])[0], 6000 - 400); page.keyboard.down("Alt"); glide(*ctr(fc[0])); glide(*ctr(fc[2]))  # ein Sprung über fc[1]
    check("5c: ⌥ und Überfahren: 3 Module der Reihe nach, Zähler 3, noch kein String", len(fc) == 3 and count() == "3" and "3 Module angeklickt" in page.inner_text("#right") and len(strs()) == 1, (count(), page.inner_text("#right")))
    glide(*ctr(fc[1]))
    check("5c: zurück auf das vorletzte Modul nimmt das letzte heraus", count() == "2")
    for m in fm[:3]: glide(*ctr(m))
    check("5c: Module eines anderen Strings übersprungen, eine Meldung", count() == "2" and page.locator(".toast").count() == 1 and "übersprungen" in toasts(), (count(), toasts()))
    glide(*ctr(fm[3])); page.keyboard.up("Alt")
    check("5c: freies Modul angehängt, ⌥ loslassen beendet nicht", count() == "3" and len(strs()) == 1)
    glide(*ctr(fc[2]))
    check("5c: ohne ⌥ kein Überfahren", count() == "3")
    page.keyboard.press("Enter"); page.wait_for_timeout(100)
    check("5c: Eingabetaste übernimmt den String in Überfahr-Reihenfolge", len(strs()) == 2 and strs()[1]["mods"] == [fc[0]["id"], fc[1]["id"], fm[3]["id"]] and count() is None, strs())
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5c: Rückgängig entfernt den String", len(strs()) == 1)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5c: Feld wieder weg, alter Stand", mods()[n0:] == fm and len(strs()) == 1 and not errors, errors)
    # Schritt 5d: Tasten S, P, E, B wählen das Werkzeug und machen seine Ebene aktiv
    pressed = lambda: page.get_attribute('#left .tool[aria-pressed="true"]', "data-tool")
    page.keyboard.press("Escape"); page.keyboard.press("Escape")
    for k, t, l in [("e", "pv-module", "module"), ("s", "pv-string", "kabel"), ("b", "pv-field", "module"), ("p", "pv-spa", "kabel")]:
        page.keyboard.press(k); page.wait_for_timeout(60)
        check(f"5d: Taste {k.upper()} wählt {t}, Ebene {l} aktiv", pressed() == t and active() == [l], (pressed(), active()))
    check("5d: Tooltip nennt die Taste", page.get_attribute('[data-tool="pv-spa"]', "title") == "SPA (Taste P)")
    page.keyboard.press("s"); page.focus('#right [data-pvopt="sname"]'); page.keyboard.press("e")
    check("5d: Tippen im Feld wählt kein Werkzeug", pressed() == "pv-string")
    page.fill('#right [data-pvopt="sname"]', page.input_value('#right [data-pvopt="sname"]')[:-1]); page.evaluate("document.activeElement.blur()"); notoast()
    check("5d: keine Änderung am Plan", mods()[n0:] == fm and len(strs()) == 1 and not errors, errors)
    # Schritt 5e: String umkehren, Module anhängen und einfügen (auch mit ⌥)
    def pick_str(): page.click('[data-tool="select"]'); click_px((ctr(fm[0])[0] + ctr(fm[1])[0]) / 2, ctr(fm[0])[1])
    ids = lambda ms: [m["id"] for m in ms]
    pick_str(); page.click('[data-pvact="strrev"]'); page.wait_for_timeout(80)
    check("5e: Umkehren tauscht + und −", strs()[0]["mods"] == ids(fm[:3])[::-1], strs())
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    pick_str(); page.click('[data-pvact="strapp"]'); page.wait_for_timeout(80)
    check("5e: Anhängen: Werkzeug String, rechts „bearbeiten“, alte Linie nur als Vorschau", pressed() == "pv-string" and "bearbeiten" in page.inner_text("#right") and page.locator("#items .pv-string").count() == 0 and page.locator("#overlay .pv-string").count() == 1, (pressed(), page.inner_text("#right")[:80], page.locator("#items .pv-string").count(), page.locator("#overlay .pv-string").count()))
    click_px(*ctr(fm[3])); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    check("5e: Modul am Ende angehängt, weiter ein String", len(strs()) == 1 and strs()[0]["mods"] == ids(fm[:4]) and page.locator("#items .pv-string").count() == 1, strs())
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    pick_str(); page.click('[data-pvact="strapp"]'); page.wait_for_timeout(80)
    click_px(*ctr(fm[0])); click_px(*ctr(fm[3])); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    check("5e: Klick auf Modul im String, dann neues Modul: danach eingefügt", strs()[0]["mods"] == [fm[0]["id"], fm[3]["id"], fm[1]["id"], fm[2]["id"]], strs())
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    pick_str(); page.click('[data-pvact="strapp"]'); page.wait_for_timeout(80)
    glide(*ctr(fm[2])); page.keyboard.down("Alt"); glide(*ctr(fm[3])); page.keyboard.up("Alt"); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    check("5e: mit ⌥ überfahren angehängt, Esc übernimmt", strs()[0]["mods"] == ids(fm[:4]), strs())
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5e: Rückgängig, alter String", strs()[0]["mods"] == ids(fm[:3]) and not errors, (strs(), errors))
    # 5az (CJ 17.10., ersetzt 5f): Modul auf eine Dachecke, Plan drehen: Dachlinie dreht, Modul bleibt wo und wie es ist
    page.keyboard.press("Escape")
    use("pv-roof"); click_px(0, 5500); click_px(2000, 5500); page.keyboard.press("Enter"); page.wait_for_timeout(80)
    corner = roofs()[-1]["pts"][0]; use("pv-module"); setopt("mt", mid); n2 = len(mods()); click_px(*corner)
    m0 = mods()[n2]
    page.keyboard.press("Meta+1"); page.wait_for_timeout(80); use("pv-rotate")
    click_px(*ctr(fm[0])); click_px(ctr(fm[0])[0] + 1000, ctr(fm[0])[1] + 1000 * math.tan(math.radians(10))); page.wait_for_timeout(150)
    page.fill('.modal [data-f="0"]', "-10"); page.click(".modal [data-ok]"); page.wait_for_timeout(200)
    m1 = next(m for m in mods() if m["id"] == m0["id"]); c1 = roofs()[-1]["pts"][0]
    check("5az: nach Drehen Modul unverändert (ohne rot), Dachecke gedreht", m1 == m0 and "rot" not in m1 and not near(c1[0], corner[0], 1) and M()["bg"].get("rot") == -10, (corner, m0, m1, c1))
    check("5az: kein Modul gedreht gezeichnet", page.locator('#items .pv-module[transform^="rotate("]').count() == 0)
    for _ in range(3): page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    page.keyboard.press("Escape")
    check("5az: Rückgängig, alter Stand", mods()[n0:] == fm and len(mods()) == n2 and "rot" not in M()["bg"] and not errors, errors)
    # Schritt 5g: Massstab nachträglich eingeben (Ebene Hintergrund), Objekte bleiben relativ zum Fixpunkt
    page.keyboard.press("Meta+1"); page.wait_for_timeout(80)
    bg0, it0 = M()["bg"], M()["items"]
    page.click('[data-pvact="scale"]'); page.wait_for_timeout(120)
    mt = page.inner_text(".modal")
    check("5g: Dialog 1:n mit bisherigem Massstab, Abbrechen statt Später", page.locator(".modal [data-den]").count() == 1 and page.input_value(".modal [data-den]") != "" and "Abbrechen" in mt and "Später" not in mt, (page.input_value(".modal [data-den]"), mt[-80:]))
    page.click(".modal [data-c]"); page.wait_for_timeout(80)
    check("5g: Abbrechen ändert nichts", M()["bg"] == bg0)
    page.click('[data-pvact="scale"]'); page.wait_for_timeout(120); page.fill(".modal [data-den]", "200"); page.click(".modal [data-ok]"); page.wait_for_timeout(150)
    bg1 = M()["bg"]
    check("5g: Massstab 1:200 gesetzt, Messstrecke weg, Objekte gleich (relativ zum Fixpunkt)", abs(bg1["mmPerPt"] - 200 * 25.4 / 72) < 1e-9 and "measure" not in bg1 and bg1.get("fix") == bg0.get("fix") and M()["items"] == it0, bg1)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5g: Rückgängig in einem Schritt", M()["bg"] == bg0)
    # Schritt 5h: Füllmuster für geschlossene Dachlinie (auch im Druck)
    use("pv-roof"); click_px(0, 5500); click_px(2000, 5500); click_px(2000, 7000); click_px(0, 5500); page.wait_for_timeout(80)
    rf = roofs()[-1]
    page.click('[data-tool="select"]'); click_px(1000, 5500)
    check("5h: geschlossene Dachlinie gewählt, Auswahl Füllung mit 6 Einträgen", rf.get("closed") and page.locator('#right select[data-pvopt="fill"] option').count() == 6, rf)
    setopt("fill", "ziegel-rot")
    fl = page.evaluate("(()=>{const p=[...document.querySelectorAll('#items polygon:not(.pv-keepout)')].find(e=>(e.getAttribute('fill')||'').startsWith('url(')); if(!p) return null; const id=p.getAttribute('fill').slice(5,-1); return {id, pat: !!document.getElementById(id), w: document.getElementById(id)?.getAttribute('width')}})()")
    check("5h: Füllung gespeichert und als Muster gezeichnet (Ziegel 300 mm breit)", roofs()[-1].get("fill") == "ziegel-rot" and fl and fl["pat"] and fl["w"] == "300", (roofs()[-1], fl))
    page.evaluate("window.__schemacad.preparePrint()"); page.evaluate("window.__schemacad.buildPrint()")
    pp = page.evaluate("[...document.querySelectorAll('#printroot > svg')].map(s=>{const p=[...s.querySelectorAll('polygon:not(.pv-keepout)')].find(e=>(e.getAttribute('fill')||'').startsWith('url(')); return p ? !!s.querySelector(p.getAttribute('fill').slice(4,-1)) : null}).filter(v=>v!==null)")
    page.evaluate("document.querySelector('#printroot').innerHTML=''")
    check("5h: Druck: Muster in der Druckseite selbst", pp == [True], pp)
    setopt("fdir", "90")
    check("5i: Richtung senkrecht: fdir 90, Muster gedreht", roofs()[-1].get("fdir") == 90 and page.locator('#items pattern[patternTransform="rotate(90)"]').count() == 1, roofs()[-1])
    setopt("fill", "")
    check("5h: „keine“ entfernt das Feld (und die Richtung)", "fill" not in roofs()[-1] and "fdir" not in roofs()[-1])
    for _ in range(4): page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    page.keyboard.press("Escape")
    check("5h: Rückgängig, Dachlinie wieder weg, keine JS-Fehler", len(roofs()) == len([i for i in it0 if i["type"] == "roofline"]) and not errors, (len(roofs()), errors))
    # Schritt 5j: Autoverkabelung 4 × 2 Module, 2 Strings à 4, waagrecht in Schlangenlinie
    use("pv-field"); setopt("mt", mid); setopt("cols", "4"); setopt("rows", "2"); setopt("gq", "5"); setopt("gl", "5")
    n3 = len(mods()); click_px(0, 5500); fa = mods()[n3:]
    use("pv-string"); page.click('#left [data-pvact="auto"]'); page.wait_for_timeout(60)
    check("UI 6b: Autoverkabelung ist ein Werkzeug links unter Verkabelung, rechts ihre Anleitung", page.get_attribute('#left [data-pvact="auto"]', "aria-pressed") == "true" and page.get_attribute('#left [data-tool="pv-string"]', "aria-pressed") == "false" and "Autoverkabelung" in page.inner_text("#right") and page.locator('#right [data-pvact="auto"]').count() == 0)
    click_px(*ctr(fa[0])); page.wait_for_timeout(120)
    page.fill('.modal [data-f="0"]', "2"); page.fill('.modal [data-f="1"]', "4"); page.select_option('.modal [data-f="2"]', "h"); page.click(".modal [data-ok]"); page.wait_for_timeout(150)
    st = strs()
    check("5j: 2 Strings à 4 in Schlangenlinie, Bezeichnungen fortlaufend", len(fa) == 8 and len(st) == 3 and st[1]["mods"] == ids(fa[:4]) and st[2]["mods"] == ids(fa[4:])[::-1] and [s["name"] for s in st[1:]] == ["1.1.2", "1.1.3"], st)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5j: Rückgängig in einem Schritt", len(strs()) == 1)
    page.click('[data-pvact="auto"]'); page.wait_for_timeout(60); click_px(*ctr(fa[0])); page.wait_for_timeout(120)
    page.fill('.modal [data-f="0"]', "3"); page.click(".modal [data-ok]"); page.wait_for_timeout(150)
    check("5j: zu wenige Module: 2 volle Strings und Meldung", len(strs()) == 3 and "Nur 2 von 3" in toasts(), toasts())
    for _ in range(2): page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5j: alter Stand, keine JS-Fehler", mods()[n0:n0 + 4] == fm and len(mods()) == n3 and len(strs()) == 1 and not errors, errors)
    # Schritt 5k: Anlage je Datei, WR 1 = 1 MPPT × 2 Strings, WR 2 = 2 MPPT × 1 String; Autoverkabelung je WR
    D = lambda: page.evaluate("window.__schemacad.doc")
    page.click('[data-tool="select"]'); page.keyboard.press("Escape")
    def an_set(sel, v):
        page.locator(pop("wr") + ' ' + sel).fill(v); page.locator('#pv-pop ' + sel).dispatch_event("change"); page.wait_for_timeout(60)
    page.click(pop("wr") + ' [data-pvact="wradd"]'); page.wait_for_timeout(60)
    check("5al: neuer WR startet leer", D()["pv"]["anlage"] == [{"str": []}] and page.input_value('#pv-pop [data-pvopt="mppt"][data-wr="0"]') == "", D()["pv"])
    an_set('[data-pvopt="mppt"][data-wr="0"]', "1"); an_set('[data-pvopt="str"][data-wr="0"][data-m="0"]', "2")
    page.click(pop("wr") + ' [data-pvact="wradd"]'); page.wait_for_timeout(60); an_set('[data-pvopt="mppt"][data-wr="1"]', "2")
    check("5ah: je MPPT ein Feld, neue MPPT leer", page.locator('#pv-pop [data-pvopt="str"][data-wr="1"]').count() == 2 and D()["pv"]["anlage"][1] == {"str": [0, 0]}, D()["pv"])
    an_set('[data-pvopt="str"][data-wr="1"][data-m="0"]', "1"); an_set('[data-pvopt="str"][data-wr="1"][data-m="1"]', "1")
    an = D().get("pv", {}).get("anlage")
    check("5k: Anlage in der Datei, zwei verschiedene WR", an == [{"str": [2]}, {"str": [1, 1]}] and "3 frei" in page.inner_text("#pv-pop") and page.locator("#pv-pop .pv-wr").count() == 2, (an, page.inner_text("#pv-pop")[-200:]))
    use("pv-field"); setopt("mt", mid); setopt("cols", "4"); setopt("rows", "2"); click_px(0, 5500); fa = mods()[n3:]
    use("pv-string"); page.click('[data-pvact="auto"]'); page.wait_for_timeout(60); click_px(*ctr(fa[0])); page.wait_for_timeout(120)
    sug = (page.input_value('.modal [data-f="0"]'), page.input_value('.modal [data-f="1"]'))
    page.fill('.modal [data-f="2"]', "2"); page.click(".modal [data-ok]"); page.wait_for_timeout(150)
    check("5k: Vorschlag WR 1, leer = alle freien: 1.1.2", sug == ("1", "") and [s["name"] for s in strs()] == ["1.1.1", "1.1.2"], (sug, [s["name"] for s in strs()]))
    page.click('[data-pvact="auto"]'); page.wait_for_timeout(60); click_px(*ctr(fa[2])); page.wait_for_timeout(120)
    sug2 = page.input_value('.modal [data-f="0"]'); page.fill('.modal [data-f="2"]', "2"); page.click(".modal [data-ok]"); page.wait_for_timeout(150)
    check("5k: zweiter Durchgang für WR 2: 2.1.1, 2.2.1", sug2 == "2" and [s["name"] for s in strs()] == ["1.1.1", "1.1.2", "2.1.1", "2.2.1"], (sug2, [s["name"] for s in strs()]))
    for _ in range(3): page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    page.click('[data-tool="select"]'); page.keyboard.press("Escape")
    for k in ("1", "1", "0"): page.click(pop("wr") + f' [data-pvact="wrrm"][data-wr="{k}"]'); page.wait_for_timeout(60)
    check("5k/5as: WR 2 geleert und gelöscht, WR 1 geleert (String 1.1.1 bleibt), alter Stand", D().get("pv", {}).get("anlage") == [{"str": []}] and len(mods()) == n3 and len(strs()) == 1, D().get("pv"))
    page.keyboard.press("Escape"); page.keyboard.press("Meta+z"); page.wait_for_timeout(60); page.keyboard.press("Meta+z"); page.wait_for_timeout(60)
    check("5as: Rückgängig: WR 2 wieder da (geleert)", D().get("pv", {}).get("anlage") == [{"str": [2]}, {"str": []}], D().get("pv"))
    page.keyboard.press("Meta+Shift+z"); page.wait_for_timeout(60); page.keyboard.press("Meta+Shift+z"); page.wait_for_timeout(60)
    # Schritt 5l: Teile für den Druck abwählen
    def pv_page():
        page.evaluate("window.__schemacad.preparePrint()"); page.evaluate("window.__schemacad.buildPrint()")
        r = page.evaluate("[...document.querySelectorAll('#printroot > svg')].filter(s=>s.textContent.includes('Stringplan ·')).map(s=>({mod:s.querySelectorAll('.pv-module').length,img:s.querySelectorAll('image').length,txt:s.querySelectorAll('text').length}))")
        page.evaluate("document.querySelector('#printroot').innerHTML=''"); return r
    p0 = pv_page()
    page.keyboard.press("Escape")
    check("UI 6b: Knöpfe Module, Wechselrichter, Druck oben; Druck zeigt Papier und Massstab; rechts keine Datei- und Druckangaben", page.is_visible("#pv-bar") and re.fullmatch(r"A\d · 1:[\d,]+", page.inner_text("#btn-pvdruck").strip()) is not None and not page.is_visible("#pv-pop") and page.locator("#right [data-pvopt], #right [data-meta]").count() == 0, page.inner_text("#btn-pvdruck"))
    pop("druck")
    geo = page.evaluate("(()=>{const p=document.querySelector('#pv-pop').getBoundingClientRect(),b=document.querySelector('#btn-pvdruck').getBoundingClientRect();return [p.top-b.bottom,p.left-b.left,p.right<=innerWidth,p.bottom<=innerHeight]})()")
    check("UI 6b: Fenster Druck hängt unter dem Knopf, im Bild, mit Plankopf", 0 <= geo[0] <= 8 and abs(geo[1]) < 1 and geo[2] and geo[3] and page.locator("#pv-pop [data-meta]").count() == 8 and page.get_attribute("#btn-pvdruck", "aria-expanded") == "true", geo)
    t0 = pressed(); page.locator("#pv-pop").focus(); page.keyboard.press("b"); page.wait_for_timeout(60)
    check("UI 6b: Tastenkürzel ruhen im Fenster", pressed() == t0 and page.is_visible("#pv-pop"), pressed())
    page.keyboard.press("Escape"); page.wait_for_timeout(60)
    check("UI 6b: Esc schliesst, Fokus zurück auf den Knopf", not page.is_visible("#pv-pop") and page.evaluate("document.activeElement.id") == "btn-pvdruck")
    pop("druck"); click_px(-3000, -3000); page.wait_for_timeout(60)
    check("UI 6b: Klick auf den Plan schliesst", not page.is_visible("#pv-pop"))
    pop("druck")
    for k in ("mod", "bg", "head"): page.click(f'#pv-pop [data-pvopt="pr"][data-part="{k}"]'); page.wait_for_timeout(60)
    p1 = pv_page()
    check("5l/5ai: Module, Plan und Plankopf abgewählt: fehlen im Druck und am Bildschirm, am Blatt gespeichert", M().get("hide") == ["bg", "mod", "head"] and len(p0) == len(p1) and sum(1 for a, b in zip(p0, p1) if a != b) == 1 and any(a["mod"] > 0 and b["mod"] == 0 and b["img"] == 0 and b["txt"] < a["txt"] for a, b in zip(p0, p1)) and page.locator("#items .pv-module").count() == 0, (M().get("hide"), p0, p1))  # seit 5ai auch am Bildschirm weg
    page.keyboard.press("Escape")
    for _ in range(3): page.keyboard.press("Meta+z"); page.wait_for_timeout(60)
    check("5l: Rückgängig, alles an, keine JS-Fehler", "hide" not in M() and not errors, (M().get("hide"), errors))
    page.keyboard.press("Meta+4"); page.wait_for_timeout(80)
    # SPA setzen
    use("pv-spa"); alt_click(250, 1500)
    sp = [i for i in M()["items"] if i["type"] == "spa"]
    check("5: SPA gesetzt, Ebene Verkabelung", len(sp) == 1 and near(sp[0]["x"], 250, 1) and near(sp[0]["y"], 1500, 1) and page.locator("#items .pv-spa").count() == 1 and "SPA" in page.text_content("#items .pv-spa"), sp)
    # Schritte 5n/5o/5m: ⌘A und ⌘ + Klick/Rahmen nur aktive Ebene, Verkabelung löschen
    SEL = lambda: set(page.evaluate("window.__schemacad.sel"))
    ofl = lambda *ts: {i["id"] for i in M()["items"] if i["type"] in ts}
    page.keyboard.press("Escape"); use("select"); page.keyboard.press("Escape")
    page.keyboard.press("Meta+a"); page.wait_for_timeout(60)
    check("5n: ⌘A auf Verkabelung: nur Strings und SPA", SEL() == ofl("pvstring", "spa") and SEL(), (SEL(), ofl("pvstring", "spa")))
    page.keyboard.press("Meta+3"); page.wait_for_timeout(60); page.keyboard.press("Meta+a"); page.wait_for_timeout(60)
    check("5n: ⌘A auf Module: nur Module", SEL() == ofl("pvmodule"), SEL())
    page.keyboard.press("Meta+2"); page.wait_for_timeout(60); page.keyboard.press("Meta+a"); page.wait_for_timeout(60)
    check("5n: ⌘A auf Dach: nur Dachlinien und Sperrflächen", SEL() == ofl("roofline", "keepout") - {i["id"] for i in M()["items"] if i.get("layer") not in (None, "dach")}, SEL())
    page.keyboard.press("Meta+1"); page.wait_for_timeout(60); page.keyboard.press("Meta+a"); page.wait_for_timeout(60)
    check("5n: ⌘A auf Hintergrund: nichts", SEL() == set(), SEL())
    page.keyboard.press("Meta+3"); page.wait_for_timeout(60); use("select"); page.keyboard.press("Escape")
    def meta_click(m): page.keyboard.down("Meta"); click_px(*ctr(m)); page.keyboard.up("Meta"); page.wait_for_timeout(40)
    meta_click(fm[0]); meta_click(fm[2])
    s1 = SEL(); meta_click(fm[0])
    check("5o: ⌘ + Klick nimmt Module auf und wieder heraus", s1 == {fm[0]["id"], fm[2]["id"]} and SEL() == {fm[2]["id"]}, (s1, SEL()))
    page.keyboard.press("Meta+2"); page.wait_for_timeout(60); meta_click(fm[1])
    check("5o: ⌘ + Klick auf ein Modul bei aktiver Ebene Dach: nicht aufgenommen", fm[1]["id"] not in SEL(), SEL())
    page.keyboard.press("Escape"); page.keyboard.press("Meta+4"); page.wait_for_timeout(60); page.keyboard.press("Meta+a"); page.wait_for_timeout(60)
    k0 = SEL(); page.keyboard.press("Meta+3"); page.wait_for_timeout(60)
    allm = mods(); x0 = min(m["x"] for m in allm) - 800; y0 = min(m["y"] for m in allm) - 800; x1 = max(m["x"] for m in allm) + 2500; y1 = max(m["y"] for m in allm) + 2500
    page.keyboard.down("Meta"); X0, Y0 = pt(x0, y0); X1, Y1 = pt(x1, y1)
    page.mouse.move(X0, Y0); page.mouse.down(); page.mouse.move((X0 + X1) / 2, (Y0 + Y1) / 2, steps=3); page.mouse.move(X1, Y1, steps=3); page.mouse.up(); page.keyboard.up("Meta"); page.wait_for_timeout(60)
    check("5o: ⌘ + Rahmen ergänzt die Auswahl um alle Module, nichts vom Dach", SEL() == k0 | ofl("pvmodule") and not (SEL() & ofl("roofline", "keepout")), (len(SEL()), len(k0), len(ofl("pvmodule"))))
    nm, ns, nsp = len(mods()), len(strs()), len(ofl("spa"))
    page.keyboard.press("Escape"); page.keyboard.press("Meta+4"); page.wait_for_timeout(60)
    page.click('[data-pvact="strclear"]'); page.wait_for_selector(".modal"); t = page.inner_text(".modal"); page.click('.modal [data-r="0"]'); page.wait_for_timeout(80)
    check("5m: Rückfrage nennt alle Strings der Datei, Abbrechen löscht nichts", "Verkabelung löschen?" in t and "SPA und Module bleiben" in t and len(strs()) == ns, t)
    page.click('[data-pvact="strclear"]'); page.wait_for_selector(".modal"); page.click('.modal [data-r="1"]'); page.wait_for_timeout(100)
    check("5m: ohne Markierung alle Strings gelöscht, SPA und Module bleiben", not strs() and len(mods()) == nm and len(ofl("spa")) == nsp and ns > 0, (len(strs()), ns))
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5m: ⌘Z bringt die Strings zurück", len(strs()) == ns)
    use("pv-field"); setopt("mt", mid); setopt("cols", "2"); setopt("rows", "1"); click_px(0, 9000); free = mods()[nm:]
    page.keyboard.press("Meta+4"); page.wait_for_timeout(60); use("pv-string"); click_px(*ctr(free[0])); click_px(*ctr(free[1])); page.keyboard.press("Enter"); page.wait_for_timeout(80)
    old = {st["id"] for st in strs() if free[0]["id"] not in st["mods"]}; new = {st["id"] for st in strs()} - old
    use("select"); page.keyboard.press("Escape"); meta_click(free[0])
    page.click('[data-pvact="strclear"]'); page.wait_for_selector(".modal"); t = page.inner_text(".modal"); page.click('.modal [data-r="1"]'); page.wait_for_timeout(100)
    check("5m: mit Markierung nur der markierte String, die anderen bleiben", len(new) == 1 and SEL() == set() and "Der markierte String" in t and {st["id"] for st in strs()} == old and len(ofl("spa")) == nsp, (t, old, new, [st["id"] for st in strs()]))
    for _ in range(3): page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5m–5o: Rückgängig, keine JS-Fehler", len(strs()) == ns and len(mods()) == nm and not errors, errors)
    page.keyboard.press("Escape")
    layer("kabel", "show")
    check("5: Verkabelung ausgeblendet: String und SPA nicht gezeichnet, Module bleiben eingefärbt", page.locator("#items .pv-string, #items .pv-spa").count() == 0 and page.evaluate("[...document.querySelectorAll('#items .pv-module')].map(r=>r.getAttribute('fill'))").count(col) == 3, (page.locator("#items .pv-string, #items .pv-spa").count(), page.evaluate("[...document.querySelectorAll('#items .pv-module')].map(r=>r.getAttribute('fill'))"), col))
    layer("kabel", "show")
    # Speichern und Öffnen
    with page.expect_download() as d: page.click("#btn-save")
    f5 = OUT / "pv_strings.schemacad.json"; d.value.save_as(f5)
    saved5 = json.loads(f5.read_text()); sh5 = saved5["sheets"][saved5["active"]]
    page.click("#btn-new"); page.wait_for_timeout(200); page.click('[data-start="schema"]')
    if page.locator(".modal").count(): page.click('.modal [data-r="1"]'); page.wait_for_timeout(200)
    with page.expect_file_chooser() as fc: page.click("#btn-open")
    fc.value.set_files(str(f5)); page.wait_for_timeout(400)
    if M().get("kind") != "pv" or not any(i["type"] == "pvstring" for i in M()["items"]):
        page.click("#sheet-cur"); page.click(f'#sheet-menu [data-sheet="{saved5["active"]}"]'); page.wait_for_timeout(300)
    check("5: Geöffnet: String und SPA gleich", M()["items"] == sh5["items"] and page.locator("#items .pv-string").count() == 1 and page.locator("#items .pv-spa").count() == 1)
    wait_image()
    page.screenshot(path=str(OUT / "pv_strings.png"))
    check("5: keine JS-Fehler", not errors, errors)

    # ---------- Schritt 6: Stringübersicht, WR-Datenblatt, Tmin ----------
    def reopen(f):
        page.click("#btn-new"); page.wait_for_timeout(200); page.click('[data-start="schema"]')
        if page.locator(".modal").count(): page.click('.modal [data-r="1"]'); page.wait_for_timeout(200)
        with page.expect_file_chooser() as fc: page.click("#btn-open")
        fc.value.set_files(str(f)); page.wait_for_timeout(400)
    def goto_tab():
        i = next(k for k, sh in enumerate(D()["sheets"]) if sh.get("kind") == "pvtab")
        if kind() != "pvtab": page.click("#sheet-cur"); page.click(f'#sheet-menu [data-sheet="{i}"]'); page.wait_for_timeout(300)
    rows = lambda: page.evaluate("[...document.querySelectorAll('#items .pvtab-row')].map(g=>[g.dataset.name,g.dataset.lvl,g.textContent])")
    pvd = lambda: D().get("pv") or {}
    n_sheets = len(D()["sheets"])
    page.click("#sheet-add", button="right"); page.click('[data-new="pvtab"]'); page.wait_for_timeout(200)
    check("6: neues Blatt Stringübersicht", kind() == "pvtab" and "Stringübersicht" in page.inner_text("#sheetbar") and len(D()["sheets"]) == n_sheets + 1)
    check("6: links nur Auswählen und Ansicht, keine Plan-Werkzeuge", page.locator('#left [data-tool="select"]').count() == 1 and page.locator('#left [data-tool="hand"]').count() == 1 and page.locator('#left [data-tool="text"], #left [data-tool^="pv-"], #left [data-pvact]').count() == 0)
    rw = rows()
    check("6: String 1.1.1 aus dem Stringplan in der Tabelle, ohne Voc unvollständig", len(rw) == 1 and rw[0][0] == "1.1.1" and rw[0][1] == "info" and "Voc fehlt" in rw[0][2] and "Stringplan" in rw[0][2], rw)
    setopt("tmin", "abc")
    check("6: ungültiges Tmin: Meldung, nichts gespeichert", "Tmin" in toasts() and "tmin" not in pvd())
    setopt("tmin", "−20")
    check("6: Tmin −20 für die Datei", pvd().get("tmin") == -20 and "Tmin −20 °C" in page.text_content("#items"), pvd())
    check("6: ohne WR-Typ Hinweis im Fenster Wechselrichter", "Noch kein WR-Typ" in page.inner_text(pop("wr")) and page.locator("#right [data-pvopt]").count() == 0)
    page.click(pop("wr") + ' [data-pvact="itnew"]'); page.wait_for_selector('.modal [data-f="6"]')
    page.fill('.modal [data-f="0"]', "WR Test"); notoast(); page.click(".modal [data-ok]"); page.wait_for_timeout(150)
    check("6: WR-Typ ohne Vmax: Meldung, Formular bleibt", "Vmax" in toasts() and page.locator('.modal [data-f="0"]').count() == 1)
    page.fill('.modal [data-f="1"]', "1000"); page.fill('.modal [data-f="4"]', "16"); page.fill('.modal [data-f="7"]', "2"); page.click(".modal [data-ok]"); page.wait_for_timeout(150)
    it = pvd().get("invTypes", [])
    check("6: WR-Typ im Katalog der Datei", len(it) == 1 and it[0]["name"] == "WR Test" and it[0]["vmax"] == 1000 and it[0]["iscMax"] == 16 and it[0]["mppt"] == 2 and "imppMax" not in it[0] and "vstart" not in it[0], it)
    page.locator(pop("wr") + ' [data-pvopt="wr"][data-nr="1"]').select_option(label="WR Test"); page.wait_for_timeout(100)
    check("6: WR 1 zugeordnet, Vmax in der Tabelle", pvd().get("wr") == {"1": it[0]["id"]} and "1000 V" in rows()[0][2] and "WR 1: WR Test" in page.text_content("#items"), pvd())
    page.keyboard.press("Escape"); page.keyboard.press("Meta+z"); page.wait_for_timeout(100)
    check("6: Rückgängig Zuordnung", "wr" not in pvd() and len(pvd().get("invTypes", [])) == 1)
    page.keyboard.press("Meta+Shift+z"); page.wait_for_timeout(100)
    check("6: Wiederholen Zuordnung", pvd().get("wr") == {"1": it[0]["id"]})
    notoast(); page.click(pop("wr") + f' [data-pvact="itdel"][data-it="{it[0]["id"]}"]'); page.wait_for_timeout(100)
    page.keyboard.press("Escape"); w_tab = page.inner_text(pop("wr")); page.keyboard.press("Escape")
    ipv = page.evaluate("window.__schemacad.doc.sheets.findIndex(s=>s.kind==='pv')"); itab = page.evaluate("window.__schemacad.doc.sheets.findIndex(s=>s.kind==='pvtab')")
    page.click("#sheet-cur"); page.click(f'#sheet-menu [data-sheet="{ipv}"]'); page.wait_for_timeout(300); w_pv = page.inner_text(pop("wr")); page.keyboard.press("Escape")
    page.click("#sheet-cur"); page.click(f'#sheet-menu [data-sheet="{itab}"]'); page.wait_for_timeout(300)
    check("UI 6b: Fenster Wechselrichter auf Stringplan und Stringübersicht gleich (Tmin, WR 1 mit Datenblatt, Katalog)", w_tab == w_pv and "WR 1" in w_pv and "WR Test" in w_pv and kind() == "pvtab", (w_tab, w_pv))
    check("6: zugeordneten WR-Typ löschen: Meldung, bleibt", "zugeordnet" in toasts() and len(pvd().get("invTypes", [])) == 1)
    n_items = sum(len(sh["items"]) for sh in D()["sheets"])
    page.keyboard.press("t"); click_px(50, -50); page.keyboard.press("Escape"); page.keyboard.press("Escape"); page.click('#left [data-tool="select"]'); click_px(60, -40)
    check("6: Klick und Text-Taste auf der Übersicht: keine Objekte, kein Fehler", sum(len(sh["items"]) for sh in D()["sheets"]) == n_items and not M()["items"] and not errors, errors)
    notoast(); page.click("#sheet-add", button="right"); page.click('[data-new="pvtab"]'); page.wait_for_timeout(200)
    check("6: zweite Stringübersicht: Hinweis, keine neue", "gibt es schon" in toasts() and len(D()["sheets"]) == n_sheets + 1 and kind() == "pvtab")
    with page.expect_download() as d: page.click("#btn-save")
    f6 = OUT / "pv_tab.schemacad.json"; d.value.save_as(f6)
    saved6 = json.loads(f6.read_text())
    reopen(f6); goto_tab()
    check("6: Geöffnet: Stringübersicht, WR-Katalog, Zuordnung und Tmin gleich", D()["pv"] == saved6["pv"] and saved6["pv"]["tmin"] == -20 and len(rows()) == 1 and kind() == "pvtab")
    # Rechenbeispiel als Datei (von Hand: 49,5 V × 18 × 1,1215 = 999,3 V knapp, × 19 = 1054,8 V über Vmax 1000 V)
    mA = {"id": "mA", "name": "Test 49,5", "l": 1700, "b": 1000, "voc": 49.5, "isc": 10, "tkVoc": -0.27, "vsys": 1500}
    def mods_of(n, id0): return [{"id": id0 + i, "type": "pvmodule", "mt": "mA", "x": i * 1005, "y": 0, "quer": False} for i in range(n)]
    items = mods_of(18, 100) + mods_of(19, 200) + [{"id": 900, "type": "pvstring", "name": "1.1.1", "mods": list(range(100, 118))}, {"id": 901, "type": "pvstring", "name": "1.2.1", "mods": list(range(200, 219))}]
    ex = {"format": "schemacad", "version": 4, "active": 1, "nextId": 1000, "pv": {"moduleTypes": [mA], "invTypes": [{"id": "w1", "name": "WR A", "vmax": 1000, "imax": 16, "mppt": 2}], "wr": {"1": "w1"}, "tmin": -20},
          "sheets": [{"kind": "pv", "sid": 5, "meta": {"BLATT": "1"}, "items": items}, {"kind": "pvtab", "meta": {"BLATT": "1"}, "items": []}]}
    fx = OUT / "pv_beispiel.schemacad.json"; fx.write_text(json.dumps(ex))
    reopen(fx); goto_tab()
    rw = {r[0]: r for r in rows()}
    check("6: Beispiel 18 Module: 999,3 V, knapp", rw.get("1.1.1", [0, 0, ""])[1] == "warn" and "999,3 V" in rw["1.1.1"][2] and "891 V" in rw["1.1.1"][2] and "Knapp: 99,9 % von Vmax" in rw["1.1.1"][2], rw)
    check("6: Beispiel 19 Module: 1054,8 V, über Vmax", rw.get("1.2.1", [0, 0, ""])[1] == "bad" and "1054,8 V" in rw["1.2.1"][2] and "Über Vmax 1000 V" in rw["1.2.1"][2] and "Grenze überschritten" in rw["1.2.1"][2], rw)
    page.screenshot(path=str(OUT / "pv_tab.png"))
    page.click("#btn-export"); page.click("#btn-dxf"); page.wait_for_timeout(200)
    check("6: DXF auf der Stringübersicht: Hinweis „kommt später“", "kommt später" in page.inner_text("body"))
    check("6: keine JS-Fehler", not errors, errors)
    i = next(k for k, sh in enumerate(D()["sheets"]) if sh.get("kind") == "pv"); page.click("#sheet-cur"); page.click(f'#sheet-menu [data-sheet="{i}"]'); page.wait_for_timeout(300)

    # ---------- Schritt 7: Papier, Druckmassstab, Plankopf, PDF ----------
    page.click('#left [data-tool="select"]'); page.keyboard.press("Escape")
    pa = lambda: M().get("paper")
    rt = page.inner_text(pop("druck"))
    check("7: Fenster Druck mit Plankopf und allen Feldern des Schriftfelds", "Druck" in rt and "Plankopf" in rt and page.locator("#pv-pop [data-meta]").count() == 8 and pa() is None, rt)
    check("7: Druckbereich gestrichelt, Vorgabe A3 quer 1:100 (Planfeld 400 × 257 mm = 40 × 25,7 m)", page.locator("#items .pv-printframe").count() == 1 and page.get_attribute("#items .pv-printframe rect", "width") == "40000" and "A3 quer, 1:100" in page.text_content("#items .pv-printframe") and "40 × 25,7 m" in rt, rt)
    meta = {"OBJEKT": "EFH Muster", "TITEL": "Stringplan Dach", "AUFTRAG": "A-77", "SCHEMA": "PV", "BLATT": "3", "INDEX": "B", "GEZEICHNET": "CJ"}
    for k, v in meta.items(): page.fill(f'#pv-pop [data-meta="{k}"]', v)
    page.evaluate("document.activeElement.blur()")
    check("7: Plankopf-Felder im Blatt", all(M()["meta"][k] == v for k, v in meta.items()), M()["meta"])
    setopt("pden", "20"); page.wait_for_timeout(80)
    check("7: Massstab 1:20: Inhalt 19,1 m passt nicht, passend ab 1:50", pa() == {"size": "A3", "quer": True, "den": 20} and "passt nicht, passend ab 1:50" in page.inner_text("#pv-pop") and "warn" in page.get_attribute("#btn-pvdruck", "class") and page.inner_text("#btn-pvdruck").strip() == "A3 · 1:20", (pa(), page.inner_text("#pv-pop")))
    setopt("psize", "A2"); setopt("pquer", "0"); setopt("pden", "1:50"); page.wait_for_timeout(80)
    check("7: Papier A2 hoch, Massstab 1:50", pa() == {"size": "A2", "quer": False, "den": 50} and "passt." in page.inner_text("#pv-pop") and "warn" not in page.get_attribute("#btn-pvdruck", "class") and page.get_attribute("#items .pv-printframe rect", "width") == "20000", pa())
    notoast(); setopt("pden", "abc")
    check("7: ungültiger Massstab: Meldung, bleibt 1:50", "Massstab" in toasts() and pa()["den"] == 50)
    page.evaluate("document.activeElement.blur()"); page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("7: Rückgängig Massstab", pa() == {"size": "A2", "quer": False, "den": 20}, pa())
    page.keyboard.press("Meta+Shift+z"); page.wait_for_timeout(80)
    # Speichern → Laden → Speichern gleich
    with page.expect_download() as d: page.click("#btn-save")
    f7 = OUT / "pv_druck.schemacad.json"; d.value.save_as(f7); s7 = json.loads(f7.read_text())
    reopen(f7)
    if kind() != "pv": page.click("#sheet-cur"); page.click('#sheet-menu [data-sheet="0"]'); page.wait_for_timeout(300)
    with page.expect_download() as d: page.click("#btn-save")
    f7b = OUT / "pv_druck2.schemacad.json"; d.value.save_as(f7b); s7b = json.loads(f7b.read_text())
    p7 = next(sh for sh in s7["sheets"] if sh.get("kind") == "pv")
    check("7: Speichern → Laden → Speichern gleich (Papier und Plankopf)", s7 == s7b and p7["paper"] == {"size": "A2", "quer": False, "den": 50} and p7["meta"]["OBJEKT"] == "EFH Muster" and s7["version"] == 6, p7.get("paper"))
    check("7: Datei ohne Papier (Beispiel Schritt 6) bleibt ohne", "paper" not in json.loads(fx.read_text())["sheets"][0] and all("paper" not in sh for sh in saved6["sheets"]))
    # PDF: Stringplan A2 hoch und Stringübersicht A4 quer
    page.evaluate("window.__schemacad.preparePrint()")
    n = page.evaluate("window.__schemacad.buildPrint()")
    pg = page.evaluate("[...document.querySelectorAll('#printroot > svg')].map(s=>({vb:s.getAttribute('viewBox'),st:s.getAttribute('style'),mod:s.querySelectorAll('.pv-module').length,str:s.querySelectorAll('.pv-string').length,rows:s.querySelectorAll('.pvtab-row').length,t:s.textContent}))")
    check("7: Druck: Stringplan auf A2 hoch mit Plankopf und Massstab", n == 2 and pg[0]["vb"] == "0 0 420 594" and "width:420mm;height:594mm" in pg[0]["st"] and pg[0]["mod"] == 37 and pg[0]["str"] == 2 and "Massstab 1:50" in pg[0]["t"] and "A2 hoch" in pg[0]["t"] and "EFH Muster" in pg[0]["t"] and "A-77" in pg[0]["t"], pg[0:1])  # reiner Stringplan: ohne Titelseite, Inhalt, Legende (Umbau 15.10.)
    check("7: Druck: Stringübersicht A4 quer mit Plankopf", pg[1]["vb"] == "0 0 297 210" and pg[1]["rows"] == 2 and "Stringübersicht" in pg[1]["t"] and "Seite 1 von 1" in pg[1]["t"], pg[1:])
    # Massstab im Druck: Modul 1000 mm breit = 20 mm auf dem Papier bei 1:50
    page.emulate_media(media="print")
    w = page.evaluate("(()=>{const r=document.querySelector('#printroot .pv-module').getBoundingClientRect(), s=document.querySelector('#printroot .pv-module').closest('#printroot > svg').getBoundingClientRect(); return r.width / s.width * 420})()")
    pdf = page.pdf(prefer_css_page_size=True, print_background=True)
    page.emulate_media(media="screen")
    (OUT / "pv_druck.pdf").write_bytes(pdf)
    boxes = [tuple(round(float(v)) for v in m) for m in re.findall(rb"/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]", pdf)]
    check("7: Modul 1000 mm = 20 mm auf dem Papier (1:50)", w is not None and abs(w - 20) < 0.05, w)
    check("7: PDF mit 2 Seiten: A2 hoch, A4 quer (ohne Titelseite, Inhalt, Legende)", boxes == [(1191, 1684), (842, 595)], boxes)
    page.evaluate("document.querySelector('#printroot').innerHTML=''")
    # Lange Stringübersicht: 40 Strings auf mehreren A4-Seiten, jede Zeile genau einmal
    items40 = mods_of(40, 100) + [{"id": 300 + i, "type": "pvstring", "name": f"1.1.{i + 1}", "mods": [100 + i]} for i in range(40)]
    ex40 = {**ex, "sheets": [{"kind": "pv", "sid": 5, "meta": {"BLATT": "1"}, "items": items40}, {"kind": "pvtab", "meta": {"BLATT": "1", "OBJEKT": "Lang"}, "items": []}]}
    f40 = OUT / "pv_lang.schemacad.json"; f40.write_text(json.dumps(ex40)); reopen(f40)
    page.evaluate("window.__schemacad.preparePrint()"); n = page.evaluate("window.__schemacad.buildPrint()")
    rows40 = page.evaluate("[...document.querySelectorAll('#printroot > svg')].slice(1).map(s=>s.querySelectorAll('.pvtab-row').length)")
    names40 = page.evaluate("[...document.querySelectorAll('#printroot .pvtab-row')].map(g=>g.dataset.name)")
    check("7: 40 Strings: Stringübersicht auf mehreren Seiten, jede Zeile einmal, „Seite 1 von …“", n >= 3 and len(rows40) == n - 1 and sum(rows40) == 40 and len(set(names40)) == 40 and "Seite 1 von" in page.text_content("#printroot"), (n, rows40))
    page.evaluate("document.querySelector('#printroot').innerHTML=''")
    # Stringplan mit PDF-Plan (Datei aus Schritt 5, ohne Papierangabe = alte Datei): Plan als Bild im Druck, Vorgabe A3 quer
    reopen(f5)
    if M().get("kind") != "pv" or not any(i["type"] == "pvstring" for i in M()["items"]):
        page.click("#sheet-cur"); page.click(f'#sheet-menu [data-sheet="{saved5["active"]}"]'); page.wait_for_timeout(300)
    check("7: alte Datei ohne Papier lädt, Vorgabe A3 quer 1:100", "paper" not in M() and "A3 quer, 1:100" in page.text_content("#items .pv-printframe"))
    page.evaluate("window.__schemacad.preparePrint()"); page.evaluate("window.__schemacad.buildPrint()")
    hrefs = page.evaluate("[...document.querySelectorAll('#printroot image')].map(i=>i.getAttribute('href'))")
    check("7: PDF-Plan als Bild im Druck", len(hrefs) >= 1 and all(h.startswith("blob:") for h in hrefs), hrefs)
    page.evaluate("document.querySelector('#printroot').innerHTML=''")
    check("7: keine JS-Fehler", not errors, errors)

    # ---------- Gruppe A: 5q, 5r, 5s, 5v, 5w, 5af, 5aj ----------
    ga_ctr = lambda i: ((i - 100) * 1005 + 500, 850)
    sid = lambda: [st for st in strs() if st["name"] == "1.1.1"]
    exA = {"format": "schemacad", "version": 4, "active": 0, "nextId": 1000, "pvLayer": "module", "pv": {"moduleTypes": [mA]},
           "sheets": [{"kind": "pv", "sid": 5, "meta": {"BLATT": "1"}, "items": mods_of(6, 100) + [{"id": 900, "type": "pvstring", "name": "1.1.1", "mods": [101, 102, 103, 104]},
                      {"id": 910, "type": "spa", "x": 3000, "y": 4000}, {"id": 950, "type": "text", "x": 0, "y": 3000, "h": 250, "s": "BG", "layer": "bg"}]},
                      {"kind": "pv", "sid": 6, "meta": {"BLATT": "2"}, "items": [{"id": 960, "type": "pvmodule", "mt": "mA", "x": 0, "y": 0, "quer": False}, {"id": 961, "type": "pvstring", "name": "2.1.1", "mods": [960]}]}]}
    fA = OUT / "pv_gruppeA.schemacad.json"; fA.write_text(json.dumps(exA)); reopen(fA)
    check("5q: aktive Ebene aus der Datei (Module)", active() == ["module"], active())
    page.keyboard.press("Meta+4"); page.wait_for_timeout(60)
    with page.expect_download() as d: page.click("#btn-save")
    fA2 = OUT / "pv_gruppeA2.schemacad.json"; d.value.save_as(fA2)
    reopen(fA2)
    check("5q: Ebene Verkabelung gespeichert und wieder aktiv", json.loads(fA2.read_text()).get("pvLayer") == "kabel" and active() == ["kabel"], active())
    use("select"); page.keyboard.press("Escape")
    click_px(*ga_ctr(105))
    check("5s: Klick auf Modul bei Ebene Verkabelung wählt nichts", SEL() == set(), SEL())
    click_px((ga_ctr(101)[0] + ga_ctr(102)[0]) / 2, 850)
    check("5s: Klick auf String bei Ebene Verkabelung wählt ihn", SEL() == {900}, SEL())
    page.keyboard.down("Shift"); click_px(*ga_ctr(105)); page.keyboard.up("Shift")
    check("5s: Shift + Klick auf Modul ergänzt nicht", SEL() == {900}, SEL())
    page.keyboard.press("Escape"); X0b, Y0b = pt(-150, -150); X1b, Y1b = pt(6150, 4150)
    page.mouse.move(X0b, Y0b); page.mouse.down(); page.mouse.move(X1b, Y1b, steps=4); page.mouse.up(); page.wait_for_timeout(60)
    check("5s: Rahmen wählt nur String und SPA (aktive Ebene)", SEL() == {900, 910}, (SEL(), page.evaluate("window.__schemacad.view")))
    page.keyboard.press("Escape"); page.keyboard.press("Meta+3"); page.wait_for_timeout(60); notoast()
    page.keyboard.down("Meta"); click_px(3000, 4000); page.keyboard.up("Meta"); page.wait_for_timeout(60)
    check("5w: ⌘ + Klick auf SPA bei Ebene Module: Meldung „liegt auf Ebene Verkabelung“, nicht gewählt", "Liegt auf Ebene Verkabelung" in toasts() and SEL() == set(), (toasts(), SEL()))
    page.keyboard.press("Meta+1"); page.wait_for_timeout(60)
    X, Y = pt(0, 3000); notoast(); page.mouse.click(X + 4, Y - 4); page.wait_for_timeout(60)
    check("5v: Klick wählt eigenen Text auf Hintergrund", SEL() == {950}, SEL())
    page.keyboard.press("Escape"); page.keyboard.press("Meta+a"); page.wait_for_timeout(60)
    check("5v: ⌘A auf Hintergrund wählt die eigenen Objekte", SEL() == {950}, SEL())
    page.keyboard.down("Meta"); page.mouse.click(X + 4, Y - 4); page.keyboard.up("Meta"); page.wait_for_timeout(60)
    check("5v: ⌘ + Klick nimmt ihn wieder heraus", SEL() == set(), SEL())
    page.keyboard.press("Meta+2"); page.wait_for_timeout(60); use("pv-roof"); nr = len(roofs())
    click_px(4000, 2500); page.keyboard.down("Shift"); click_px(5000, 3400); page.keyboard.up("Shift"); page.keyboard.press("Enter"); page.wait_for_timeout(80)
    r45 = roofs()[-1]["pts"] if len(roofs()) > nr else None
    check("5r: Shift zeichnet unter 45°", r45 is not None and abs((r45[1][0] - r45[0][0]) - (r45[1][1] - r45[0][1])) < 0.01 and r45[1][0] - r45[0][0] > 500, (r45, toasts()))
    page.keyboard.press("Meta+z"); page.wait_for_timeout(60)
    page.keyboard.press("Meta+4"); page.wait_for_timeout(60); use("select"); page.keyboard.press("Escape")
    click_px((ga_ctr(101)[0] + ga_ctr(102)[0]) / 2, 850); page.click('[data-pvact="strfront"]'); page.wait_for_timeout(60)
    click_px(*ga_ctr(100)); page.keyboard.press("Enter"); page.wait_for_timeout(80)
    check("5af: am Anfang einfügen: neues + vorne", sid()[0]["mods"] == [100, 101, 102, 103, 104], sid())
    use("pv-string"); page.keyboard.down("Shift"); click_px(*ga_ctr(102)); page.keyboard.up("Shift"); page.wait_for_timeout(60)
    check("5af: Shift + Klick nimmt Modul mitten aus dem String", sid()[0]["mods"] == [100, 101, 103, 104], sid())
    use("select"); page.keyboard.press("Escape"); click_px((ga_ctr(100)[0] + ga_ctr(101)[0]) / 2, 850); page.click('[data-pvact="strapp"]'); page.wait_for_timeout(60)
    click_px(*ga_ctr(105)); page.keyboard.down("Shift"); click_px(*ga_ctr(103)); page.keyboard.up("Shift"); page.keyboard.press("Enter"); page.wait_for_timeout(80)
    check("5af: beim Verkabeln mit Shift abwählen, Kabel schliesst die Lücke", sid()[0]["mods"] == [100, 101, 104, 105], sid())
    use("select"); page.keyboard.press("Escape")
    page.click('[data-pvact="strclear"]'); page.wait_for_selector(".modal"); t = page.inner_text(".modal"); page.click('.modal [data-r="1"]'); page.wait_for_timeout(100)
    other = [i for k, sh in enumerate(D()["sheets"]) if k != D()["active"] for i in sh["items"] if i["type"] == "pvstring"]
    check("5aj: ohne Markierung nur der offene Stringplan, anderer Plan bleibt", "dieses Stringplans" in t and not strs() and len(other) == 1, (t, len(strs()), other))
    check("Gruppe A: keine JS-Fehler", not errors, errors)

    # ---------- Gruppe B: 5p, 5t, 5u, 5x, 5y, 5z, 5aa, 5ab ----------
    exB = {"format": "schemacad", "version": 4, "active": 0, "nextId": 1000, "pvLayer": "module", "pv": {"moduleTypes": [mA]},
           "assets": {"a1": {"name": "planA.pdf", "type": "application/pdf", "data": base64.b64encode(A.read_bytes()).decode()}},
           "sheets": [{"kind": "pv", "sid": 5, "meta": {"BLATT": "1"}, "bg": {"asset": "a1", "name": "planA.pdf", "page": 1, "w": 842, "h": 595, "fix": [100, 500], "mmPerPt": 100 * PT_MM},
                       "items": [{"id": 700, "type": "roofline", "pts": [[0, 8000], [3000, 8000], [3000, 10000]], "closed": False},
                                 {"id": 710, "type": "keepout", "pts": [[20000, 0], [22000, 0], [22000, 2000], [20000, 2000]], "fill": "ziegel-rot"},
                                 {"id": 720, "type": "pvmodule", "mt": "mA", "x": 0, "y": 0, "quer": False}]}]}
    fB = OUT / "pv_gruppeB_v4.schemacad.json"; fB.write_text(json.dumps(exB)); notoast(); reopen(fB)
    mB = lambda: {i["id"]: i for i in M()["items"]}
    check("5ab: alte Datei (Version 4) lädt, Dachmuster an der Sperrfläche fällt weg (5u)", kind() == "pv" and len(M()["items"]) == 3 and "fill" not in mB()[710], (kind(), M()["items"], toasts()))
    hp = page.evaluate("(()=>{const p=document.querySelector('#items polygon.pv-keepout'); const f=p&&p.getAttribute('fill'); const pat=f&&f.startsWith('url(')&&document.getElementById(f.slice(5,-1)); return pat?{t:pat.getAttribute('patternTransform'),s:p.getAttribute('stroke')}:null})()")
    check("5u: Sperrfläche mit grauer Kreuzschraffur, roter Rand", hp is not None and hp["t"] == "rotate(45)" and hp["s"] == "#b42318", hp)
    page.keyboard.press("Meta+2"); page.wait_for_timeout(60); use("select"); click_px(21000, 1000)
    check("5u: Sperrfläche gewählt: keine Füllungswahl", SEL() == {710} and page.locator('#right [data-pvopt="fill"]').count() == 0 and "Kreuzschraffur" in page.inner_text("#right"), (SEL(), page.inner_text("#right")))
    page.keyboard.press("Escape"); click_px(1500, 8000)
    check("5t: offene Dachlinie gewählt: Füllung wählbar mit Hinweis", SEL() == {700} and page.locator('#right [data-pvopt="fill"]').count() == 1 and "schliesst die Linie" in page.inner_text("#right"), (SEL(), page.inner_text("#right")))
    setopt("fill", "trapez-hell")
    check("5t: Füllung schliesst die Dachlinie und wird gezeichnet", mB()[700].get("closed") is True and mB()[700].get("fill") == "trapez-hell" and page.locator("#items polygon:not(.pv-keepout)[fill^='url(']").count() == 1, mB()[700])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5t: Rückgängig: wieder offen, ohne Füllung", mB()[700].get("closed") is False and "fill" not in mB()[700], mB()[700])
    page.keyboard.press("Escape"); use("pv-field"); setopt("mt", "mA"); setopt("quer", "1")
    rt = page.inner_text("#right")
    check("5y: Abstände heissen quer und längs zum Modul", "Abstand quer zum Modul" in rt and "Abstand längs zum Modul" in rt and "waagrecht in mm" not in rt, rt)
    setopt("cols", "2"); setopt("rows", "2"); setopt("gq", "20"); setopt("gl", "7")
    check("5y: quer liegend: längs = waagrecht, quer = senkrecht (3 407 × 2 020 mm)", "4 Module, 3 407 × 2 020 mm" in page.inner_text("#right"), page.inner_text("#right"))
    n0 = len(mods()); X, Y = pt(0, 0); page.mouse.move(X - 20, Y - 20); page.mouse.move(X, Y); page.wait_for_timeout(60)
    rt = page.inner_text("#right")
    check("5x: Vorgabe Ecke unten links, Hinweis nennt Tab", "Ecke unten links" in rt and "Tab wechselt" in page.inner_text("#hint") and page.locator("#overlay .pv-anchor").count() == 1, (rt, page.inner_text("#hint")))
    foc = lambda: page.evaluate("document.activeElement.outerHTML.slice(0, 80)"); f0 = foc()
    page.keyboard.press("Tab"); page.keyboard.press("Tab"); page.keyboard.press("Tab"); page.wait_for_timeout(60)
    check("5x: dreimal Tab: oben links, Fokus bleibt", "jetzt: oben links" in page.inner_text("#hint") and "Ecke oben links" in page.inner_text("#right") and foc() == f0, (page.inner_text("#hint"), f0, foc()))
    page.mouse.move(X + 30, Y + 30); page.mouse.move(X, Y); page.wait_for_timeout(60); page.mouse.click(X, Y); page.wait_for_timeout(100)
    nf = mods()[n0:]
    check("5x: Ecke oben links: Feld hängt unter dem Punkt (Mausrichtung egal)", len(nf) == 4 and min(m["x"] for m in nf) == 0 and max(m["y"] for m in nf) + 1000 == 0 and min(m["y"] for m in nf) == -2020, [(m["x"], m["y"]) for m in nf])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    use("pv-module"); use("pv-field"); page.keyboard.press("Shift+Tab"); page.keyboard.press("Shift+Tab"); page.wait_for_timeout(60)
    X, Y = pt(1000, 0); page.mouse.move(X - 20, Y - 20); page.mouse.move(X, Y); page.wait_for_timeout(60); page.mouse.click(X, Y); page.wait_for_timeout(100)
    nf = mods()[n0:]
    check("5x: Ecke bleibt beim Werkzeugwechsel, Shift+Tab zweimal: unten rechts", len(nf) == 4 and max(m["x"] for m in nf) + 1700 == 1000 and min(m["y"] for m in nf) == 0, [(m["x"], m["y"]) for m in nf])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    page.keyboard.press("Tab"); page.keyboard.press("Tab"); page.keyboard.press("Tab"); page.wait_for_timeout(40) # zurück auf unten links für die folgenden Tests
    use("pv-module"); setopt("quer", "0"); n0 = len(mods()); alt_click(19000, 300)
    check("5z: Modul berührt die Sperrfläche nur: Warnung, rot", len(mods()) == n0 + 1 and "Sperrfläche" in toasts() and page.locator("#items .pv-module.warn").count() == 1, (mods()[n0:], toasts()))
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    page.keyboard.press("Meta+1"); page.wait_for_timeout(60); use("pv-rotate"); click_px(0, 0); click_px(5000, 500); page.wait_for_timeout(150)
    page.fill('.modal [data-f="0"]', "-10"); page.click(".modal [data-ok]"); page.wait_for_timeout(200)
    check("3d: Plan um −10° gedreht", M()["bg"].get("rot") == -10, M()["bg"])
    page.keyboard.press("Meta+3"); page.wait_for_timeout(60); use("pv-module"); n0 = len(mods()); alt_click(8000, 3000)
    nm = mods()[n0:]
    check("5az: neues Modul im gedrehten Plan ohne Drehung (5aa aufgehoben)", len(nm) == 1 and "rot" not in nm[0] and page.locator('#items .pv-module[transform^="rotate("]').count() == 0, nm)
    page.keyboard.press("Meta+1"); page.wait_for_timeout(60); load(B, confirm=True)
    page.wait_for_selector(".modal [data-c]", timeout=10000); page.click(".modal [data-c]"); page.wait_for_timeout(300)
    check("5p: Plantausch übernimmt die Drehung (−10°)", M()["bg"].get("swap") is True and M()["bg"].get("rot") == -10 and M()["bg"]["name"] == "planB.pdf", M()["bg"])
    with page.expect_download() as d: page.click("#btn-save")
    fB2 = OUT / "pv_gruppeB.schemacad.json"; d.value.save_as(fB2); sB = json.loads(fB2.read_text())
    reopen(fB2)
    check("5ab: gespeichert als Version 6, Drehung des Plans bleibt beim Laden", sB["version"] == 6 and M()["bg"].get("rot") == -10, sB["version"])
    check("Gruppe B: keine JS-Fehler", not errors, errors)

    # ---------- Gruppe C: 5ac, 5ad, 5ae, 5ag, 5ah, 5ak, 5am (5al oben bei 5k) ----------
    mC = {"id": "mA", "name": "C", "l": 1700, "b": 1000, "voc": 40, "isc": 10, "tkVoc": -0.3, "vsys": 1000}
    def mods_c(n, id0): return [{"id": id0 + i, "type": "pvmodule", "mt": "mA", "x": i * 1005, "y": 0, "quer": False} for i in range(n)]
    exC = {"format": "schemacad", "version": 6, "active": 1, "nextId": 1000, "pvLayer": "kabel",
           "pv": {"moduleTypes": [mC], "invTypes": [{"id": "w1", "name": "WR", "vmax": 1000, "imax": 24, "mppt": 2}], "wr": {"1": "w1"}, "tmin": -10, "anlage": [{"str": [2, 1]}]},
           "sheets": [{"kind": "pv", "sid": 5, "meta": {"BLATT": "1"}, "items": mods_c(2, 100) + [{"id": 150, "type": "pvstring", "name": "1.1.1", "mods": [100]}]},
                      {"kind": "pv", "sid": 6, "meta": {"BLATT": "2"}, "items": mods_c(4, 200)}, {"kind": "pvtab", "meta": {"BLATT": "1"}, "items": []}]}
    fC = OUT / "pv_gruppeC.schemacad.json"; fC.write_text(json.dumps(exC)); notoast(); reopen(fC)
    check("Umbau Titelblatt: reiner Stringplan ohne Titelseite, Inhalt, Legende", [sh.get("kind") for sh in D()["sheets"]] == ["pv", "pv", "pvtab"], [sh.get("kind") for sh in D()["sheets"]])
    use("pv-string"); setopt("sname", "1.1.1")
    check("5ad: Bezeichnung von Stringplan 1 auf Stringplan 2 abgelehnt", "schon auf Stringplan 1" in toasts(), toasts())
    page.click('[data-pvact="auto"]'); page.wait_for_timeout(60); click_px(500, 1000); page.wait_for_timeout(120)
    page.fill('.modal [data-f="2"]', "2"); page.click(".modal [data-ok]"); page.wait_for_timeout(150)
    check("5ag/5ah: Autoverkabelung nach der Anlage (MPPT 1: 2 Strings, MPPT 2: 1 String)", [st["name"] for st in strs()] == ["1.1.2", "1.2.1"], [st["name"] for st in strs()])
    nm = page.evaluate("[...document.querySelectorAll('#items .pv-name')].map(t=>[t.textContent,t.getAttribute('font-size'),t.getAttribute('fill')])")
    check("5ae/5ac: Stringnummer 300 mm hoch (1,2 ×), Farben aus 24 (1.1.2, 1.2.1)", nm == [["1.1.2", "300", "#d06f00"], ["1.2.1", "300", "#a88400"]], nm)
    goto_tab(); rw = {r[0]: r for r in rows()}
    check("5ak/5au: altes Feld imax als Isc max geladen", D()["pv"]["invTypes"][0].get("iscMax") == 24 and "imax" not in D()["pv"]["invTypes"][0], D()["pv"]["invTypes"])
    check("5ak: Strom mit Zuschlag: MPPT 1 = 2 × 10 A × 1,25 = 25 A über 24 A", "Über Isc max: Isc × 1,25 von 2 Strings 25 A, max 24 A" in rw["1.1.1"][2] and rw["1.1.2"][1] == "bad", rw)
    check("5am: MPPT 2 mit 12,5 A von 24 A ohne „knapp“, kein Knapp bei Strom und Systemspannung", rw["1.2.1"][1] == "ok" and "knapp" not in rw["1.2.1"][2].lower(), rw)
    check("Gruppe C: keine JS-Fehler", not errors, errors)

    # ---------- Gruppe D: 5an, 5ap (Stringübersicht), 5ai, 5ao, 5aq (Stringplan) ----------
    def prints():
        page.evaluate("window.__schemacad.preparePrint()"); page.evaluate("window.__schemacad.buildPrint()")
        r = page.evaluate("[...document.querySelectorAll('#printroot > svg')].map(s=>({vb:s.getAttribute('viewBox'),t:s.textContent,north:s.querySelector('.pv-north')?.dataset.dir??null,bar:s.querySelector('.pv-bar')?.dataset.len??null}))")
        page.evaluate("document.querySelector('#printroot').innerHTML=''"); return r
    page.keyboard.press("Escape")
    pages_scr = page.evaluate("[...document.querySelectorAll('#items .pvtab-page')].map(g=>({w:g.querySelector('rect.paper').getAttribute('width'),t:g.textContent}))")
    check("5an: Stringübersicht am Bildschirm mit Rahmen und Plankopf (Seite auf Papier)", len(pages_scr) == 1 and pages_scr[0]["w"] == "297" and "Stringübersicht · Seite 1 von 1 · A4 quer" in pages_scr[0]["t"] and len(rows()) == 3, pages_scr)
    setopt("psize", "A3")
    check("5ap: Papier A3 gewählt, am Bildschirm 420 mm breit", M().get("paper") == {"size": "A3", "quer": True} and page.locator('#items .pvtab-page rect.paper[width="420"]').count() == 1, M().get("paper"))
    page.keyboard.press("Escape"); page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5ap: Rückgängig: wieder A4 quer (ohne Feld)", "paper" not in M(), M().get("paper"))
    setopt("pquer", "0")
    tp = [x for x in prints() if "Stringübersicht ·" in x["t"]]
    check("5ap: A4 hoch im Druck (Tabelle verkleinert), Hinweis rechts", M().get("paper") == {"size": "A4", "quer": False} and tp and all(x["vb"] == "0 0 210 297" for x in tp) and "verkleinert" in page.inner_text("#pv-pop") and page.inner_text("#btn-pvdruck").strip() == "A4 hoch", (M().get("paper"), [x["vb"] for x in tp]))
    page.keyboard.press("Escape")  # Fenster Druck zu (seit 18.10. weiter links, deckt sonst die Blattleiste)
    page.click("#sheet-cur"); page.click('#sheet-menu [data-sheet="0"]'); page.wait_for_timeout(300)
    page.keyboard.press("Escape"); page.keyboard.press("Meta+3"); page.wait_for_timeout(80); use("select"); page.keyboard.press("Escape")
    nmod = page.locator("#items .pv-module").count()
    page.click(pop("druck") + ' [data-pvopt="pr"][data-part="mod"]'); page.wait_for_timeout(80)
    page.keyboard.press("Escape"); page.keyboard.press("Meta+a"); page.wait_for_timeout(60)
    check("5ai: Module abgewählt: am Bildschirm weg, nicht wählbar, Hinweis links", nmod == 2 and page.locator("#items .pv-module").count() == 0 and SEL() == set() and "ausgeblendet: Module" in page.inner_text("#left"), (nmod, SEL(), page.inner_text("#left")[-120:]))
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5ai: Rückgängig: Module wieder da", page.locator("#items .pv-module").count() == 2 and "hide" not in M())
    page.click(pop("druck") + ' [data-pvact="pmid"]'); page.wait_for_timeout(60)
    check("UI 6b: Druckmitte setzen schliesst das Fenster und startet das Werkzeug", not page.is_visible("#pv-pop"))
    click_px(1500, 400); page.wait_for_timeout(80)
    fr = page.evaluate("(()=>{const r=document.querySelector('#items .pv-printframe rect');return [+r.getAttribute('x')+r.getAttribute('width')/2,+r.getAttribute('y')+r.getAttribute('height')/2]})()")
    pm = M().get("pmid")
    check("5ao: Druckmitte per Klick gesetzt, Rahmen folgt", pm and near(pm[0], 1500, 60) and near(pm[1], 400, 60) and near(fr[0], pm[0], 1) and near(fr[1], pm[1], 1) and page.locator(pop("druck") + ' [data-pvact="pmidauto"]').count() == 1, (pm, fr))
    setopt("north", "30")
    sp = [x for x in prints() if "Stringplan ·" in x["t"]]
    check("5aq: Nordpfeil 30° und Massstabsleiste 5 m (1:100) im Druck", M().get("north") == 30 and sp and sp[0]["north"] == "30" and sp[0]["bar"] == "5000", (M().get("north"), sp[:1]))
    page.click(pop("druck") + ' [data-pvopt="pr"][data-part="north"]'); page.wait_for_timeout(80)
    sp = [x for x in prints() if "Stringplan ·" in x["t"]]
    check("5aq: Nordpfeil abgewählt: nur Massstabsleiste, Bildschirm unverändert", sp and sp[0]["north"] is None and sp[0]["bar"] == "5000" and page.locator("#items .pv-module").count() == 2, sp[:1])
    with page.expect_download() as d: page.click("#btn-save")
    fD = OUT / "pv_gruppeD.schemacad.json"; d.value.save_as(fD); sD = json.loads(fD.read_text())
    notoast(); reopen(fD); sD2 = D()
    check("5ao/5aq/5ap: Speichern → Öffnen: Druckmitte, Nordrichtung, Papier bleiben", sD["sheets"][0].get("north") == 30 and sD["sheets"][0].get("pmid") == pm and pm and sD["sheets"][2].get("paper") == {"size": "A4", "quer": False} and [sh.get("pmid") for sh in sD2["sheets"]] == [sh.get("pmid") for sh in sD["sheets"]] and sD2["sheets"][2].get("paper") == {"size": "A4", "quer": False}, sD["sheets"][0])
    page.click(pop("druck") + ' [data-pvact="pmidauto"]'); page.wait_for_timeout(80)
    check("5ao: Mitte automatisch: Feld weg", "pmid" not in M(), M().get("pmid"))
    check("Gruppe D: keine JS-Fehler", not errors, errors)

    # ---------- 5ar–5aw (CJ 15.10.) ----------
    mE = {"id": "mE", "name": "E", "l": 1700, "b": 1000, "voc": 40, "isc": 10, "impp": 9.5, "tkVoc": -0.3, "vsys": 1000}
    def mods_e(n, id0): return [{"id": id0 + i, "type": "pvmodule", "mt": "mE", "x": i * 1005, "y": 0, "quer": False} for i in range(n)]
    exE = {"format": "schemacad", "version": 6, "active": 0, "nextId": 1000, "pvLayer": "kabel",
           "pv": {"moduleTypes": [mE], "invTypes": [{"id": "w1", "name": "WR klein", "vmax": 1000, "iscMax": 30, "imppMax": 9, "mppt": 2}, {"id": "w2", "name": "WR alt", "vmax": 1000, "imax": 12}], "wr": {"1": "w1", "3": "w2"}, "tmin": -10,
                  "anlage": [{"str": [1]}, {"str": [1]}, {"str": [1]}]},
           "sheets": [{"kind": "pv", "sid": 5, "meta": {"BLATT": "1"}, "items": mods_e(3, 100) + [{"id": 150, "type": "pvstring", "name": "1.1.1", "mods": [100]}, {"id": 151, "type": "pvstring", "name": "2.1.1", "mods": [101]}, {"id": 152, "type": "pvstring", "name": "3.1.1", "mods": [102]}]},
                      {"kind": "pvtab", "meta": {"BLATT": "1"}, "items": []}]}
    fE = OUT / "pv_5ar.schemacad.json"; fE.write_text(json.dumps(exE)); notoast(); reopen(fE)
    names = lambda: sorted(st["name"] for st in strs())
    check("5ar: + und − Kreis grösser (r 216 statt 180)", page.locator('#items circle.pv-plus[r="216"]').count() == 3 and page.locator('#items circle.pv-minus[r="216"]').count() == 3)
    page.click('#left [data-tool="select"]'); page.keyboard.press("Escape")
    wt = page.inner_text(pop("wr"))
    check("5at: Hinweis Tmin nach NIN SN 411000 7.12.5.1.2.1.1", "NIN SN 411000 7.12.5.1.2.1.1" in wt and "0 °C (Neigung unter 15°)" in wt and "−5 °C" in wt and "−15 °C" in wt and "−25 °C" in wt and "Abweichung nur mit Nachweis" in wt, wt[:400])
    check("5aw: WR-Zeilen mit Griff zum Ziehen", page.locator('#pv-pop [data-wrdrag][draggable="true"]').count() == 3)
    # Ziehen mit der Maus in einer frischen Seite (in dieser langen Sitzung startet Chromium kein Ziehen mehr, Grund nicht gefunden), hier mit DragEvents
    p2 = ctx.new_page(); p2.goto(URL); p2.wait_for_timeout(300); p2.click('[data-start="schema"]')
    with p2.expect_file_chooser() as fc: p2.click("#btn-open")
    fc.value.set_files(str(fE)); p2.wait_for_timeout(400); p2.click("#btn-pvwr"); p2.wait_for_timeout(80)
    p2.drag_and_drop('#pv-pop [data-wrdrag="3"]', '#pv-pop [data-wrrow="1"]'); p2.wait_for_timeout(120)
    check("5aw: Ziehen mit der Maus (frische Seite): WR 3 wird WR 1", p2.evaluate("window.__schemacad.doc.pv.wr") == {"1": "w2", "2": "w1"}, p2.evaluate("window.__schemacad.doc.pv.wr"))
    p2.close()
    page.evaluate("""(()=>{const dt=new DataTransfer(), q=(s)=>document.querySelector('#pv-pop '+s), ev=(el,t)=>el.dispatchEvent(new DragEvent(t,{bubbles:true,cancelable:true,dataTransfer:dt}));
      ev(q('[data-wrdrag="3"]'),'dragstart'); ev(q('[data-wrrow="1"]'),'dragover'); ev(q('[data-wrrow="1"]'),'drop'); })()"""); page.wait_for_timeout(120)
    pv = D()["pv"]
    check("5aw: WR 3 nach oben gezogen: wird WR 1, Strings und Datenblatt folgen", names() == ["1.1.1", "2.1.1", "3.1.1"] and {st["id"]: st["name"] for st in strs()} == {152: "1.1.1", 150: "2.1.1", 151: "3.1.1"} and pv["wr"] == {"1": "w2", "2": "w1"} and page.inner_text("#pv-pop .pv-wr-head >> nth=0").startswith("⠿ WR 1"), ({st["id"]: st["name"] for st in strs()}, pv))
    page.keyboard.press("Escape"); page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5aw: Rückgängig: alte Reihenfolge", {st["id"]: st["name"] for st in strs()} == {150: "1.1.1", 151: "2.1.1", 152: "3.1.1"} and D()["pv"]["wr"] == {"1": "w1", "3": "w2"})
    notoast(); page.click(pop("wr") + ' [data-pvact="wrrm"][data-wr="1"]'); page.wait_for_timeout(80)
    check("5as: 1. Klick leert WR 2 (Anlage leer, String bleibt)", D()["pv"]["anlage"] == [{"str": [1]}, {"str": []}, {"str": [1]}] and names() == ["1.1.1", "2.1.1", "3.1.1"] and "geleert" in toasts(), (D()["pv"], toasts()))
    notoast(); page.click(pop("wr") + ' [data-pvact="wrrm"][data-wr="1"]'); page.wait_for_timeout(120)
    check("5as: 2. Klick fragt nach (String von WR 2 wird gelöscht)", page.locator('.modal [data-r="1"]').count() == 1 and "WR 2 löschen" in page.inner_text(".modal"))
    page.click('.modal [data-r="1"]'); page.wait_for_timeout(120); pv = D()["pv"]
    check("5as: WR 2 gelöscht, WR 3 rückt nach (3.1.1 → 2.1.1), Module bleiben", {st["id"]: st["name"] for st in strs()} == {150: "1.1.1", 152: "2.1.1"} and pv["wr"] == {"1": "w1", "2": "w2"} and pv["anlage"] == [{"str": [1]}, {"str": [1]}] and len(mods()) == 3 and page.locator("#pv-pop .pv-wr").count() == 2, pv)
    page.keyboard.press("Escape"); page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5as: Rückgängig: WR 2 und sein String wieder da", names() == ["1.1.1", "2.1.1", "3.1.1"] and len(D()["pv"]["anlage"]) == 3)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    page.click(pop("wr") + ' [data-pvact="itnew"]'); page.wait_for_selector('.modal [data-f="7"]'); ml = page.inner_text(".modal"); page.keyboard.press("Escape"); page.wait_for_timeout(80)
    check("5au: WR-Typ mit getrennten Feldern Isc max und Impp max", "Isc max je MPPT in A" in ml and "Impp max je MPPT in A" in ml and "Imax" not in ml, ml)
    page.keyboard.press("Escape"); goto_tab(); rw = {r[0]: r for r in rows()}
    check("5au: Impp 9,5 A über Impp max 9 A: Warnung Ertragseinbusse, Isc 12,5 A unter 30 A ok", rw["1.1.1"][1] == "warn" and "Ertragseinbusse möglich: Impp 9,5 A, Impp max 9 A" in rw["1.1.1"][2] and "Isc max" not in rw["1.1.1"][2], rw.get("1.1.1"))
    check("5au: altes imax 12 als Isc max: 12,5 A darüber = Fehler, ohne Impp max keine Impp-Prüfung", rw["3.1.1"][1] == "bad" and "Über Isc max: Isc × 1,25 12,5 A, max 12 A" in rw["3.1.1"][2] and "Impp" not in rw["3.1.1"][2] and "Isc max 30 A, Impp max 9 A" in page.text_content("#items"), rw.get("3.1.1"))
    page.click("#sheet-cur"); page.click('#sheet-menu [data-sheet="0"]'); page.wait_for_timeout(300); page.keyboard.press("Escape")
    for part in ("mod", "name", "head"): page.click(pop("druck") + f' [data-pvopt="pr"][data-part="{part}"]'); page.wait_for_timeout(60)
    hid = M().get("hide"); page.keyboard.press("Escape")
    page.evaluate("window.print = () => setTimeout(() => window.dispatchEvent(new Event('afterprint')), 50)")
    page.click("#btn-export"); page.click("#btn-pdf"); page.wait_for_selector(".modal [data-ok]"); page.click(".modal [data-ok]"); page.wait_for_timeout(400)
    check("5av: nach Druck/PDF alle Druckteile wieder an", hid == ["mod", "name", "head"] and "hide" not in M() and page.locator("#items .pv-module").count() == 3 and page.locator(pop("druck") + ' [data-pvopt="pr"]:not(:checked)').count() == 0, (hid, M().get("hide")))
    page.keyboard.press("Escape"); page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5av: Rückgängig holt die Auswahl zurück", M().get("hide") == ["mod", "name", "head"], M().get("hide"))
    check("5ar–5aw: keine JS-Fehler", not errors, errors)

    # ---------- 5ax Leitungen, 5ay Punkte mit Beschriftung (CJ 17.10.) ----------
    page.keyboard.press("Escape"); page.keyboard.press("Escape"); page.keyboard.press("f"); page.wait_for_timeout(150)
    lines = lambda: [i for i in M()["items"] if i["type"] == "pvline"]
    pts_ = lambda: [i for i in M()["items"] if i["type"] == "pvpoint"]
    blur = lambda: page.evaluate("document.activeElement?.blur()")  # Eingabefeld rechts verlassen, sonst gehen Tasten ins Feld
    bx, by = min(m["x"] for m in mods()), min(m["y"] for m in mods())
    page.keyboard.press("k"); page.wait_for_timeout(80)
    check("5ax: Taste K wählt Leitung, Ebene Verkabelung aktiv", page.get_attribute('[data-tool="pv-line"]', "aria-pressed") == "true" and page.get_attribute('[data-pvact="active"][data-layer="kabel"]', "aria-pressed") == "true" and 'data-pvopt="lw"' in page.inner_html("#right"))
    alt_click(bx + 100, by + 100)
    notoast(); X, Y = pt(bx + 1500, by + 300); page.keyboard.down("Alt"); page.keyboard.down("Shift"); page.mouse.move(X, Y); page.mouse.click(X, Y); page.keyboard.up("Shift"); page.keyboard.up("Alt"); page.wait_for_timeout(60)
    X, Y = pt(bx + 1500, by + 1200); page.keyboard.down("Alt"); page.mouse.move(X, Y); page.mouse.dblclick(X, Y); page.keyboard.up("Alt"); page.wait_for_timeout(100)
    L = lines()
    check("5ax: Linienzug mit 3 Punkten, Doppelklick beendet, Vorgabe 50 mm gelb", len(L) == 1 and len(L[0]["pts"]) == 3 and L[0]["w"] == 50 and L[0]["col"] == "#f5c400", L)
    check("5ax: Shift legt den zweiten Punkt waagrecht", len(L) == 1 and near(L[0]["pts"][1][1], L[0]["pts"][0][1], 1e-6), L)
    check("5ax: Leitung massstäblich gezeichnet (stroke-width 50 mm im Plan)", page.locator("#items .pv-line").count() == 1 and "stroke-width:50" in (page.get_attribute("#items .pv-line", "style") or ""))
    alt_click(bx + 200, by + 1600); alt_click(bx + 900, by + 1600); page.keyboard.press("Escape"); page.wait_for_timeout(80)
    check("5ax: Esc bricht die Leitung ab", len(lines()) == 1, lines())
    setopt("lw", "80"); alt_click(bx + 200, by + 1600); alt_click(bx + 900, by + 1600); page.keyboard.press("Enter"); page.wait_for_timeout(80)
    check("5ax: Breite für neue Leitung wählbar, Eingabetaste beendet", len(lines()) == 2 and lines()[1]["w"] == 80, lines())
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80); setopt("lw", "50"); blur()
    page.keyboard.press("v"); page.wait_for_timeout(60); a0, a1 = L[0]["pts"][0], L[0]["pts"][1]
    click_px((a0[0] + a1[0]) / 2, a0[1] + 10)
    check("5ax: Leitung anklicken wählt sie, Breite und Farbe rechts", page.evaluate("window.__schemacad.sel") == [L[0]["id"]] and page.locator('#right [data-pvopt="selw"]').count() == 1 and page.locator('#right input[type="color"][data-pvopt="selcol"]').count() == 1, page.inner_text("#right"))
    setopt("selw", "120"); page.wait_for_timeout(60)
    page.fill('#right [data-pvopt="selcol"]', "#1f6fd1"); page.dispatch_event('#right [data-pvopt="selcol"]', "change"); page.wait_for_timeout(60); blur()
    check("5ax: nachträglich Breite 120 mm und Farbe blau", lines()[0]["w"] == 120 and lines()[0]["col"] == "#1f6fd1", lines())
    page.keyboard.press("Meta+z"); page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5ax: Rückgängig: wieder 50 mm gelb", lines()[0]["w"] == 50 and lines()[0]["col"] == "#f5c400", lines())
    click_px((a0[0] + a1[0]) / 2, a0[1] + 10); p2 = lines()[0]["pts"][2]
    X, Y = pt(*p2); page.keyboard.down("Alt"); page.mouse.move(X, Y); page.mouse.down(); page.mouse.move(X + 40, Y + 10, steps=4); page.mouse.up(); page.keyboard.up("Alt"); page.wait_for_timeout(80)
    q2 = lines()[0]["pts"][2]
    check("5ax: Punkt der Leitung ziehbar", not near(q2[0], p2[0], 1) and len(lines()[0]["pts"]) == 3, (p2, q2))
    page.keyboard.press("Meta+z"); page.wait_for_timeout(60)
    check("5ax: Rückgängig: Punkt zurück", lines()[0]["pts"][2] == p2)
    page.keyboard.press("Delete"); page.wait_for_timeout(60); n_del = len(lines()); page.keyboard.press("Meta+z"); page.wait_for_timeout(60)
    check("5ax: löschen und Rückgängig", n_del == 0 and len(lines()) == 1)
    # 5ay: Punkt setzen, Text eingeben, Doppelklick ändert, Text ziehbar
    page.keyboard.press("Escape"); page.keyboard.press("o"); page.wait_for_timeout(60)
    alt_click(bx + 600, by + 1400); page.wait_for_timeout(80)
    page.keyboard.type("Abzweigdose"); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    P_ = pts_()
    check("5ay: Taste O, Klick setzt Punkt, Text dazu", len(P_) == 1 and P_[0]["s"] == "Abzweigdose" and "Abzweigdose" in page.text_content("#items .pv-point"), P_)
    page.keyboard.press("v"); page.wait_for_timeout(60)
    X, Y = pt(P_[0]["x"], P_[0]["y"]); page.mouse.dblclick(X, Y); page.wait_for_timeout(100)
    page.keyboard.press("End"); page.keyboard.type(" 1"); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    check("5ay: Doppelklick bearbeitet den Text", pts_()[0]["s"] == "Abzweigdose 1", pts_())
    click_px(P_[0]["x"], P_[0]["y"]); page.wait_for_timeout(60)
    lx, ly = P_[0]["x"] + 120, P_[0]["y"] + 120  # PT_OFF = 1,6 × 75 mm
    X, Y = pt(lx, ly); page.mouse.move(X, Y); page.mouse.down(); page.mouse.move(X + 60, Y + 30, steps=4); page.mouse.up(); page.wait_for_timeout(80)
    q = pts_()[0]
    check("5ay: Text am Griff ziehbar, Punkt bleibt", "ox" in q and q["ox"] > 120 and q["oy"] < 120 and q["x"] == P_[0]["x"] and q["y"] == P_[0]["y"], q)
    page.click('#right [data-pvact="ptreset"]'); page.wait_for_timeout(60)
    check("5ay: Text zurück neben den Punkt", "ox" not in pts_()[0], pts_())
    page.keyboard.press("Meta+z"); page.wait_for_timeout(60)
    # Druck: Leitung und Punkt auf der Seite, Druckteile einzeln abwählbar
    page.evaluate("window.__schemacad.preparePrint()"); page.evaluate("window.__schemacad.buildPrint()")
    pr = page.evaluate("(()=>{const s=[...document.querySelectorAll('#printroot > svg')].find(s=>s.textContent.includes('Stringplan ·')&&s.querySelector('.pv-line')); if(!s) return null; const l=s.querySelector('.pv-line'); return {w:getComputedStyle(l).strokeWidth, txt:s.querySelector('.pv-point')?.textContent}})()")
    page.evaluate("document.querySelector('#printroot').innerHTML=''")
    check("5ax/5ay: Leitung massstäblich und Punkt mit Text im Druck", pr is not None and pr["w"] in ("50px", "50") and pr["txt"] == "Abzweigdose 1", pr)
    for part in ("line", "point"): page.click(pop("druck") + f' [data-pvopt="pr"][data-part="{part}"]'); page.wait_for_timeout(60)
    page.keyboard.press("Escape")
    check("5ax/5ay: Druckteile Leitungen und Punkte ausblendbar", {"line", "point"} <= set(M().get("hide") or []) and page.locator("#items .pv-line, #items .pv-point").count() == 0, M().get("hide"))
    page.keyboard.press("Meta+z"); page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    page.click('[data-pvact="layer"][data-layer="kabel"][data-key="show"]'); page.wait_for_timeout(60)
    check("5ax/5ay: Auge Verkabelung blendet Leitungen und Punkte aus", page.locator("#items .pv-line, #items .pv-point").count() == 0)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    with page.expect_download() as d: page.click("#btn-save")
    fL = OUT / "pv_leitungen.schemacad.json"; d.value.save_as(fL); sL = json.loads(fL.read_text()); before = M()["items"]
    reopen(fL)
    check("5ax/5ay: Datei Version 13, Laden gibt Leitung und Punkt unverändert zurück", sL["version"] == 13 and [i for i in M()["items"] if i["type"] in ("pvline", "pvpoint")] == [i for i in before if i["type"] in ("pvline", "pvpoint")], sL["version"])
    check("5ax/5ay: keine JS-Fehler", not errors, errors)

    # ---------- Druck: Blätter wählen, Papier je Blatt (CJ 17.10.) ----------
    mixdoc = {"format": "schemacad", "version": 6, "active": 0, "nextId": 10, "sheets": [
      {"meta": {"BLATT": "1", "TITEL": "Hauptverteilung"}, "items": []},
      {"kind": "pv", "sid": 2, "meta": {}, "items": [], "paper": {"size": "A3", "quer": True, "den": 100}},
      {"kind": "pvtab", "meta": {}, "items": []}]}
    fM = OUT / "druck_gemischt.schemacad.json"; fM.write_text(json.dumps(mixdoc)); reopen(fM)
    page.evaluate("window.__prints = []; window.print = () => { window.__prints.push({ t: document.title, pages: [...document.querySelectorAll('#printroot > svg')].map(s => s.style.page || 'A4q') }); setTimeout(() => window.dispatchEvent(new Event('afterprint')), 20); }; 0")
    page.click("#btn-export"); page.click("#btn-pdf"); page.wait_for_selector(".modal [data-psheet]")
    labels = page.locator(".modal .print-list label").all_inner_texts(); nsh = len(D()["sheets"])
    check("Druck: Fenster listet alle Blätter mit Papier, alle angehakt", len(labels) == nsh and page.locator(".modal [data-psheet]:checked").count() == nsh and any("A3 quer" in l and "Stringplan" in l for l in labels), labels)
    check("Druck: kein Hinweis mehr auf mehrere Drucke, Knopf „Drucken“", page.locator(".modal [data-pmix]").count() == 0 and page.inner_text(".modal [data-ok]") == "Drucken", page.inner_text(".modal"))
    page.click(".modal [data-ok]"); page.wait_for_timeout(500); pr = page.evaluate("window.__prints")
    # ein Druck mit gemischtem Papier (Nachweis echter Chrome 18.10.2026): Seiten in Dateireihenfolge, jede mit ihrem Papier
    check("Druck: ein Druck ohne Rückfrage, alle Blätter, Papier je Seite (A4 quer, A4 hoch Legende, A3 quer, A4 quer)", len(pr) == 1 and page.locator(".modal").count() == 0
          and pr[0]["pages"][-3:] == ["pA4h", "pA3q", "pA4q"] and all(x in ("A4q", "pA4q") for x in pr[0]["pages"][:-3]) and len(pr[0]["pages"]) >= 6 and not pr[0]["t"].endswith(("-quer", "-hoch")), pr)
    check("Druck: danach leer, keine JS-Fehler", page.evaluate("document.querySelector('#printroot').innerHTML") == "" and not errors, errors)
    # nur aktuelles Blatt: zum Stringplan, Schnellwahl
    i_pv = next(k for k, sh in enumerate(D()["sheets"]) if sh.get("kind") == "pv")
    page.click("#sheet-cur"); page.click(f'#sheet-menu [data-sheet="{i_pv}"]'); page.wait_for_timeout(200); page.keyboard.press("Escape")
    page.evaluate("window.__prints = []")
    page.click("#btn-export"); page.click("#btn-pdf"); page.wait_for_selector(".modal [data-pcur]"); page.click(".modal [data-pcur]")
    check("Druck: „Nur aktuelles Blatt“ hakt nur den Stringplan an, ein Druck", page.locator(".modal [data-psheet]:checked").count() == 1 and page.locator(f'.modal [data-psheet="{i_pv}"]:checked').count() == 1 and page.inner_text(".modal [data-ok]") == "Drucken")
    page.click(".modal [data-ok]"); page.wait_for_timeout(300); pr = page.evaluate("window.__prints")
    check("Druck: nur der Stringplan in A3 quer, ohne Rückfrage", len(pr) == 1 and pr[0]["pages"] == ["pA3q"] and page.locator(".modal").count() == 0, pr)
    page.click("#btn-export"); page.click("#btn-pdf"); page.wait_for_selector(".modal [data-pall]")
    page.locator(".modal [data-psheet]").first.uncheck(); page.click(".modal [data-pall]")
    ok_all = page.locator(".modal [data-psheet]:checked").count() == nsh
    page.locator(".modal [data-psheet]").evaluate_all("bs => bs.forEach(b => { b.checked = false; b.dispatchEvent(new Event('change', { bubbles: true })); })")
    check("Druck: „Alle“ hakt alles an, ohne Auswahl ist Drucken gesperrt", ok_all and page.is_disabled(".modal [data-ok]"))
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    check("Druck: Abbrechen druckt nichts", len(page.evaluate("window.__prints")) == 1 and page.locator(".modal").count() == 0)
    # PDF je Gruppe hat das eigene Papier (Headless-Chromium, preferCSSPageSize)
    page.evaluate("window.__schemacad.buildPrint()"); page.emulate_media(media="print")
    mb = [tuple(round(float(v) * 25.4 / 72) for v in m.decode().split()[2:4]) for m in re.findall(rb"/MediaBox \[([^\]]+)\]", page.pdf(prefer_css_page_size=True, print_background=True))]
    page.emulate_media(media="screen"); page.evaluate("document.querySelector('#printroot').innerHTML=''")
    check("Druck: Stringplan A3 quer, übrige A4 (quer bzw. Legende hoch)", (420, 297) in mb and all(x in ((297, 210), (210, 297), (420, 297)) for x in mb), mb)

    # ---------- 5bc Autoverkabelung einschränken, 5bb Stringbeschriftung, 5ba Texthöhe (CJ 17.10.) ----------
    rowdoc = {"format": "schemacad", "version": 6, "active": 0, "nextId": 50, "pv": {"moduleTypes": [{"id": "mA", "name": "T", "l": 1700, "b": 1000}]},
      "sheets": [{"kind": "pv", "sid": 1, "meta": {}, "items": [{"id": 10 + i, "type": "pvmodule", "mt": "mA", "x": i * 1005, "y": 0, "quer": False} for i in range(10)]}]}
    fR = OUT / "auto_eingeschraenkt.schemacad.json"; fR.write_text(json.dumps(rowdoc)); reopen(fR)
    page.keyboard.press("Meta+4"); page.wait_for_timeout(80); page.keyboard.press("f"); page.wait_for_timeout(150)
    mc = lambda i: (i * 1005 + 500, 850)
    page.click('[data-pvact="auto"]'); page.wait_for_timeout(80)
    check("5bc: Fenster Autoverkabelung mit Knopf „Module einschränken“, ohne Wahl alle", page.locator('#right [data-pvact="autopick"]').count() == 1 and "Alle freien Module" in page.inner_text("#right"))
    page.click('#right [data-pvact="autopick"]'); page.wait_for_timeout(80)
    for i in range(2, 8): click_px(*mc(i))
    click_px(*mc(7))  # nochmals = abwählen
    check("5bc: Module anklicken wählt sie, Zähler „5 Module gewählt“, hervorgehoben", "5 Module gewählt" in page.inner_text("#right") and len(page.evaluate("window.__schemacad.sel")) == 5, page.inner_text("#right"))
    page.keyboard.press("Delete"); page.keyboard.press("ArrowLeft"); page.wait_for_timeout(80)
    check("5bc: im Wahlmodus kein Löschen, kein Verschieben", len(mods()) == 10 and mods()[2]["x"] == 2010)
    page.click('#right [data-pvact="autodone"]'); page.wait_for_timeout(100)
    check("5bc: übernommen, zurück in der Autoverkabelung, 5 Module grün", "Eingeschränkt auf 5 Module" in page.inner_text("#right") and page.locator("#overlay .pv-allowed, svg .pv-allowed").count() == 5 and page.evaluate("window.__schemacad.sel") == [], page.inner_text("#right"))
    notoast(); click_px(*mc(0)); page.wait_for_timeout(100)
    check("5bc: Start ausserhalb der Wahl: Meldung, kein Dialog", "nicht unter den gewählten" in toasts() and page.locator(".modal").count() == 0, toasts())
    click_px(*mc(2)); page.wait_for_selector('.modal [data-f="1"]')
    page.fill('.modal [data-f="0"]', "3"); page.fill('.modal [data-f="1"]', "2"); page.click(".modal [data-ok]"); page.wait_for_timeout(150)
    ss = [i for i in M()["items"] if i["type"] == "pvstring"]
    check("5bc: verkabelt nur gewählte Module (2 Strings à 2, Meldung fehlende Module)", [st["mods"] for st in ss] == [[12, 13], [14, 15]] and "Nur 2 von 3" in toasts(), (ss, toasts()))
    page.click('[data-pvact="auto"]'); page.wait_for_timeout(80); page.click('#right [data-pvact="autopick"]'); page.wait_for_timeout(80)
    keep = len(page.evaluate("window.__schemacad.sel")); click_px(*mc(9)); page.keyboard.press("Escape"); page.wait_for_timeout(80)
    check("5bc: Wahl zeigt die bisherige Einschränkung, Esc lässt sie unverändert", keep == 5 and "Eingeschränkt auf 5 Module" in page.inner_text("#right"), page.inner_text("#right"))
    page.click('#right [data-pvact="autoclear"]'); page.wait_for_timeout(80)
    check("5bc: Einschränkung aufheben", "Alle freien Module" in page.inner_text("#right") and page.locator(".pv-allowed").count() == 0)
    page.keyboard.press("Escape"); page.keyboard.press("Escape")
    # 5bb: Stringbeschriftung je Stringplan grösser, Bildschirm und Druck
    r0 = float(page.get_attribute("#items .pv-plus", "r")); f0 = float(page.get_attribute("#items .pv-name", "font-size"))
    setopt("strk", "150"); page.keyboard.press("Escape"); page.wait_for_timeout(80)
    r1 = float(page.get_attribute("#items .pv-plus", "r")); f1 = float(page.get_attribute("#items .pv-name", "font-size"))
    check("5bb: 150 %: Bezeichnung und + − im gleichen Verhältnis grösser", M().get("strk") == 1.5 and near(r1, r0 * 1.5, 0.01) and near(f1, f0 * 1.5, 0.01), (r0, r1, f0, f1))
    page.evaluate("window.__schemacad.buildPrint()")
    pf = page.evaluate("parseFloat(document.querySelector('#printroot .pv-name')?.getAttribute('font-size'))")
    page.evaluate("document.querySelector('#printroot').innerHTML=''")
    check("5bb: im Druck dieselbe Grösse (Plan-mm, Massstab wie Plan)", near(pf, f1, 0.01), pf)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5bb: Rückgängig: 100 %", "strk" not in M() and near(float(page.get_attribute("#items .pv-name", "font-size")), f0, 0.01))
    # 5ba: Punkt und Text, Texthöhe einzeln und gemeinsam
    page.keyboard.press("o"); alt_click(3000, 3500); page.keyboard.type("P1"); page.keyboard.press("Enter"); page.wait_for_timeout(80)
    page.keyboard.press("t"); alt_click(3000, 4500); page.keyboard.type("Notiz"); page.keyboard.press("Enter"); page.wait_for_timeout(80)
    page.keyboard.press("v"); pt0 = next(i for i in M()["items"] if i["type"] == "pvpoint"); tx0 = next(i for i in M()["items"] if i["type"] == "text")
    click_px(pt0["x"], pt0["y"]); page.wait_for_timeout(60)
    check("5ba: Punkt gewählt: Feld Texthöhe 250 mm", page.input_value('#right [data-pvopt="th"]') == "250" and "2,5 mm bei 1:100" in page.inner_text("#right"))
    setopt("th", "500"); page.wait_for_timeout(60)
    check("5ba: Punkt Texthöhe 500 mm, gezeichnet", next(i for i in M()["items"] if i["type"] == "pvpoint").get("h") == 500 and page.get_attribute("#items .pv-point text", "font-size") == "500")
    page.evaluate("document.activeElement?.blur()")
    X, Y = pt(tx0["x"] + 100, tx0["y"] + 100); page.keyboard.down("Meta"); page.mouse.click(X, Y); page.keyboard.up("Meta"); page.wait_for_timeout(80)
    check("5ba: Punkt und Text gewählt: gemeinsames Feld leer (verschieden)", "2 Texte und Punkte" in page.inner_text("#right") and page.input_value('#right [data-pvopt="th"]') == "", page.inner_text("#right"))
    setopt("th", "320"); page.wait_for_timeout(60)
    hs = [i.get("h") for i in M()["items"] if i["type"] in ("text", "pvpoint")]
    page.evaluate("window.__schemacad.buildPrint()")
    pfs = page.evaluate("[...document.querySelectorAll('#printroot text')].filter(t => ['P1','Notiz'].includes(t.textContent)).map(t => t.getAttribute('font-size'))")
    page.evaluate("document.querySelector('#printroot').innerHTML=''")
    check("5ba: beide 320 mm, auch im Druck", hs == [320, 320] and sorted(pfs) == ["320", "320"], (hs, pfs))
    page.evaluate("document.activeElement?.blur()"); page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("5ba: Rückgängig", [i.get("h") for i in M()["items"] if i["type"] in ("text", "pvpoint")] == [500, 250])
    check("5ba–5bc: keine JS-Fehler", not errors, errors)

    # DXF und PDF für Stringpläne folgen später: Hinweis, kein Absturz
    page.click("#btn-export"); page.click("#btn-dxf"); page.wait_for_timeout(200)
    check("DXF auf Stringplan: Hinweis „kommt später“", "kommt später" in page.inner_text("body"))
    check("keine JS-Fehler", not errors, errors)
    b.close()
print("FEHLER:" if fails else "ALLE OK", fails, "| Ausgaben:", OUT)
