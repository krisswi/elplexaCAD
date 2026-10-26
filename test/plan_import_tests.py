# UI-Test Modul «Plan», CJ 24.10.2026: PDF-Plan einlesen wie im Stringplan (Seite wählen, Massstab 1:50, Fixpunkt = Nullpunkt, messen, drehen,
# Druck mit Plan, dieselbe PDF für mehrere Stockwerke nur einmal gespeichert) und geschwungene Leitung.
# Vorher: node build.mjs && node build.mjs elplexa. Aufruf: python3 test/plan_import_tests.py. Die Test-PDF entsteht hier (keine Dateien von CJ).
import sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(tempfile.mkdtemp(prefix="plan_import_"))
PT_MM = 25.4 / 72
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)

def make_pdf(pages):
    """Kleinste PDF: pages = [(Breite, Höhe, Zeichenbefehle)], Koordinaten in pt, y nach oben (wie pv_tests.py)."""
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

# UG, EG, OG auf A3 quer, 1:50: Raum 4000 × 3000 mm = 80 × 60 mm auf dem Papier, Ecke unten links bei (300 | 300) pt
W, H = 1190.55, 841.89
R = f"2 w 300 300 {80 / PT_MM:.3f} {60 / PT_MM:.3f} re S"
PDF = OUT / "plaene.pdf"; PDF.write_bytes(make_pdf([(W, H, R), (W, H, R), (W, H, R)]))
K = 50 * PT_MM  # mm in der Welt je pt

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 800}); page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; delete window.showDirectoryPicker;")
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(400)
    M = lambda: page.evaluate("window.__schemacad.model")
    def key(k):
        page.evaluate("([k]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))", [k]); page.wait_for_timeout(60)
    def at(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.locator("#svg").bounding_box()
        return r["x"] + v["x"] + x * v["z"], r["y"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): page.mouse.click(*at(x, y)); page.wait_for_timeout(100)
    def load(n):
        with page.expect_file_chooser() as fc: page.click('[data-plact="pdf"]')
        fc.value.set_files(str(PDF)); page.wait_for_timeout(600)
        page.locator(".modal .choice", has_text=f"Seite {n}").click(); page.wait_for_timeout(300)

    page.click("#el-addmod"); page.wait_for_timeout(200); page.locator('[data-elnew="plan"]').click(); page.wait_for_timeout(300)
    check("Ebene Hintergrund: Knopf «PDF-Plan laden»", page.locator('[data-plact="pdf"]').count() == 1)

    # Einlesen: Seite 2 (EG), Massstab ist mit 1:50 vorbelegt
    load(2)
    check("Massstab vorbelegt mit 50", page.input_value(".modal [data-den]") == "50")
    page.click(".modal [data-ok]"); page.wait_for_timeout(500)
    bg = M().get("bg", {})
    check("Hintergrund: Seite 2, A3 quer, Massstab 1:50", bg.get("page") == 2 and abs(bg.get("w", 0) - W) < 0.01 and abs(bg.get("mmPerPt", 0) - K) < 1e-9, bg)
    page.wait_for_function("document.querySelector('#sheet image')", timeout=10000)
    check("PDF als Bild gerendert", page.locator("#sheet image").count() == 1)
    check("Werkzeuge Massstab, Fixpunkt, Drehen da", page.locator('[data-tool="pl-measure"], [data-tool="pl-fix"], [data-tool="pl-rotate"], [data-plact="scale"]').count() == 4)

    # Fixpunkt auf die Raumecke: wird zum Nullpunkt
    page.click('[data-tool="pl-fix"]'); click(300 * K, 300 * K)
    bg = M()["bg"]
    check("Fixpunkt auf der Raumecke (300 | 541,89 pt)", abs(bg["fix"][0] - 300) < 0.5 and abs(bg["fix"][1] - (H - 300)) < 0.5, bg.get("fix"))
    fx, fy = bg["fix"]
    ox, oy = (300 - fx) * K, (fy - (H - 300)) * K  # Lage der Raumecke in der Welt (fast 0 | 0)

    # Massstab messen: Unterkante 4000 mm
    page.click('[data-tool="pl-measure"]'); page.keyboard.down("Alt"); click(ox, oy); click(ox + 4000, oy); page.keyboard.up("Alt")
    page.fill('.modal [data-f="0"]', "4000"); page.click(".modal [data-ok]"); page.wait_for_timeout(200)
    txt = page.inner_text(".modal")
    check("Messung schlägt 1:50 vor", "1:50" in txt, txt)
    page.locator(".modal .choice").first.click(); page.wait_for_timeout(200)
    bg = M()["bg"]
    check("Messstrecke gespeichert, Massstab 1:50", abs(bg["mmPerPt"] - K) < 1e-9 and bg["measure"]["mm"] == 4000, bg)

    # Plan drehen und rückgängig
    page.click('[data-tool="pl-rotate"]'); page.keyboard.down("Alt"); click(0, 0); click(4000, 200); page.keyboard.up("Alt")
    v = page.input_value('.modal [data-f="0"]')
    check("Drehen schlägt ca. −2,86° vor", abs(float(v.replace(",", ".").replace("−", "-")) + 2.86) < 0.05, v)
    page.click(".modal [data-ok]"); page.wait_for_timeout(200)
    check("Plan gedreht", abs(M()["bg"].get("rot", 0) + 2.86) < 0.05)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(150)
    check("Rückgängig: Drehung weg", "rot" not in M()["bg"])

    # Geschwungene Leitung (Vorgabe, CJ 26.10.2026): drei Punkte = B-Spline, Kurve im SVG, kein Bogenpunkt dazu
    key("l"); check("Form Vorgabe geschwungen", page.input_value('[data-plo="lcurve"]') == "1")
    page.keyboard.down("Alt"); click(500, 500); click(1500, 1500); click(2500, 500); page.keyboard.up("Alt"); key("Enter")
    ln = [i for i in M()["items"] if i["type"] == "line"]
    check("Leitung geschwungen, Punkte wie geklickt", len(ln) == 1 and ln[0].get("curve") is True and len(ln[0]["pts"]) == 3 and ln[0]["pts"][1][1] > 1400, ln)
    check("Kurve gezeichnet (Bézier)", "C" in page.get_attribute("#items .pl-items path[stroke='#0068c9']", "d"))
    key("v"); click(1500, 500 + 4 * 1000 / 6)  # Treffer am Scheitel der Kurve (nicht am Steuerpunkt)
    check("Klick auf den Bogen wählt die Leitung", page.evaluate("window.__schemacad.sel") == [ln[0]["id"]])
    page.select_option('[data-plf="lc"]', "0"); page.wait_for_timeout(100)
    check("Form gerade: curve weg, Punkte bleiben", "curve" not in [i for i in M()["items"] if i["type"] == "line"][0])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(100)

    # Druck mit PDF-Plan
    n = page.evaluate("window.__schemacad.buildPrint(null)")
    check("Druck: PDF-Plan als Bild auf der Planseite", page.locator("#printroot image").count() >= 1, n)
    page.evaluate("document.querySelector('#printroot').innerHTML = ''")

    # PDF-Plan eigener Umschalter (CJ 26.10.2026): Auge links und Taste P, unabhängig von den Ebenen; Deckkraft
    check("Zeile PDF-Plan mit Auge und Deckkraft", page.locator(".pl-bgrow [data-plact='bgshow']").count() == 1 and page.locator(".pl-bgrow [data-plbgop]").count() == 1)
    check("Deckkraft Vorgabe 60 %", page.get_attribute("#sheet .pl-bgimg", "opacity") == "0.6")
    page.click('[data-plact="ladd"]'); page.wait_for_timeout(150); page.click(".modal [data-ok]"); page.wait_for_timeout(200)  # zweite Ebene, wird aktiv
    check("Auge auch auf Ebene Elektro sichtbar", page.locator(".pl-bgrow [data-plact='bgshow']").count() == 1)
    key("p")
    check("Taste P blendet PDF-Plan aus, Ebene Hintergrund bleibt", M().get("bgOff") is True and page.locator("#sheet image").count() == 0 and all(l["show"] for l in M()["layers"]))
    n = page.evaluate("window.__schemacad.buildPrint(null)")
    check("Druck ohne ausgeblendeten PDF-Plan", page.locator("#printroot image").count() == 0, n)
    page.evaluate("document.querySelector('#printroot').innerHTML = ''")
    page.click(".pl-bgrow [data-plact='bgshow']"); page.wait_for_timeout(200)
    check("Auge blendet wieder ein", "bgOff" not in M() and page.locator("#sheet image").count() == 1)
    page.locator(".pl-bgrow [data-plbgop]").evaluate("(e) => { e.value = 30; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }"); page.wait_for_timeout(200)
    check("Deckkraft 30 % gespeichert und gezeichnet", M().get("bgOp") == 30 and page.get_attribute("#sheet .pl-bgimg", "opacity") == "0.3")
    for _ in range(3): page.keyboard.press("Meta+z"); page.wait_for_timeout(100)
    check("Rückgängig: Deckkraft und Auge zurück", "bgOp" not in M() and "bgOff" not in M())
    for _ in range(2): page.keyboard.press("Meta+z"); page.wait_for_timeout(100)
    check("Rückgängig: zweite Ebene weg, Hintergrund aktiv", len(M()["layers"]) == 1 and M()["alay"] == "bg")

    # Zweites Stockwerk aus derselben PDF: PDF nur einmal in der Datei
    page.click(".el-back"); page.wait_for_timeout(200)
    page.click("#el-addmod"); page.wait_for_timeout(200); page.locator('[data-elnew="plan"]').click(); page.wait_for_timeout(300)
    load(3); page.click(".modal [data-ok]"); page.wait_for_timeout(400)
    doc = page.evaluate("window.__schemacad.doc")
    plans = [s for s in doc["sheets"] if s.get("kind") == "plan"]
    check("Datei Version 23, zwei Pläne mit Seite 2 und 3", doc["version"] == 23 and [s["bg"]["page"] for s in plans] == [2, 3], (doc["version"], [s.get("bg", {}).get("page") for s in plans]))
    check("Dieselbe PDF nur einmal gespeichert", len(doc.get("assets", {})) == 1 and plans[0]["bg"]["asset"] == plans[1]["bg"]["asset"])
    page.close(); b.close()
check("keine JS-Fehler", not errors, errors[:5])
if fails: print(f"{len(fails)} Fehler"); sys.exit(1)
print("plan_import_tests: alles ok")
