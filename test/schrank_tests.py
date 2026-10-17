# UI-Tests Schrank und Symbole der Disposition (Headless-Chromium). Aufruf aus web-src: python3 test/schrank_tests.py [Ausgabeordner] [Beleg.png]
# Setzt Schrank, Teile und Geräte über die Palette, ändert Felder und Türen im Panel, öffnet die nachgezeichnete UV Bärgen,
# prüft PDF-Druckseite und DXF (ezdxf) und speichert einen Screenshot als Beleg.
import json, subprocess, sys, tempfile
from pathlib import Path
import ezdxf
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="schrank_"))
SHOT = Path(sys.argv[2]) if len(sys.argv) > 2 else OUT / "baergen_uv.png"
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
uv = OUT / "Baergen UV.schemacad.json"
subprocess.run(["node", str(ROOT / "test" / "baergen_uv.mjs"), str(uv)], check=True, cwd=ROOT)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(URL); page.wait_for_timeout(300)
    page.click('[data-start="schema"]')
    def pt(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.evaluate("(()=>{const r=document.querySelector('#svg').getBoundingClientRect();return {l:r.left,t:r.top}})()")
        return r["l"] + v["x"] + x * v["z"], r["t"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): X, Y = pt(x, y); page.mouse.move(X, Y); page.mouse.click(X, Y)
    M = lambda: page.evaluate("window.__schemacad.model")
    of = lambda t: [i for i in M()["items"] if i["type"] == t]
    page.click("#sheet-add", button="right"); page.click('[data-new="dispo"]'); page.wait_for_timeout(150)

    # Palette
    for s in ["D:CAB:rittal", "D:CAB:saa", "D:PART:CALIP", "D:PART:NH1", "D:PART:NTA", "D:PART:SSW", "D:PART:NHABD", "D:PART:RAB", "D:DEV:FILS", "D:DEV:KL", "D:DEV:DIAZED"]:
        check("Palette hat " + s, page.locator(f'[data-sym="{s}"]').count() == 1)
    # Schrank setzen (Ecke unten links = Sockelunterkante)
    page.click('[data-sym="D:CAB:rittal"]'); click(0, 0); page.keyboard.press("Escape")
    cab = of("cabinet")
    check("Schrank gesetzt: Feld 1100, Höhe 2000, Sockel 100, Tiefe 400", len(cab) == 1 and cab[0]["fields"][0]["w"] == 1100 and (cab[0]["h"], cab[0]["plinth"], cab[0]["depth"], cab[0]["y"]) == (2000, 100, 400, 100), cab)
    page.keyboard.press("F" if False else "f"); page.wait_for_timeout(100)
    click(0, 1000); page.wait_for_timeout(100)
    check("Schrank am Rand gewählt, Panel zeigt aussen 1150", "aussen 1150" in page.inner_text("#right"))
    page.click('[data-act="cabadd"]'); page.wait_for_timeout(100)
    check("Feld angefügt: aussen 2250", len(of("cabinet")[0]["fields"]) == 2 and "aussen 2250" in page.inner_text("#right"))
    page.fill('input[data-dp="f:1:w"]', "600"); page.select_option('select[data-dp="f:1:door"]', "d"); page.select_option('select[data-dp="plinth"]', "200")
    c = of("cabinet")[0]
    check("Feldbreite, Doppeltür und Sockel 200 übernommen", c["fields"][1] == {"w": 600, "door": "d", "t": ""} and c["plinth"] == 200, c)
    page.fill('input[data-dp="ip"]', "IP43"); page.wait_for_timeout(50)
    check("IP-Text im Plan", "IP43" in page.evaluate("document.querySelector('#items').innerHTML"))
    page.click('[data-act="cabplates"]'); page.wait_for_timeout(100)
    check("Montageplatten je Feld eingesetzt", len(of("plate")) == 2 and of("plate")[0]["w"] == 1050)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(100)
    check("Rückgängig nimmt die Platten wieder weg", len(of("plate")) == 0)

    # Fenster „Ansicht“: Bemassung und Türen
    check("Knopf Ansicht nur in der Disposition sichtbar", page.is_visible("#btn-ansicht"))
    page.click("#btn-ansicht"); page.wait_for_timeout(100)
    ink = lambda: page.evaluate("document.querySelectorAll('#items rect[fill=\"#17212b\"]').length")
    n_doors = ink()
    page.click('[data-dpview="doors"]'); page.wait_for_timeout(100)
    check("Türen aus: Bänder weg, im Blatt gespeichert", ink() < n_doors and M().get("doors") is False, (n_doors, ink()))
    page.click('[data-dpview="dims"]'); page.wait_for_timeout(100)
    check("Bemassung aus, Kästchen Masse gekoppelt", M().get("dims") is False and not page.is_checked("#dims-on"))
    page.click('[data-dpview="dims"]'); page.click('[data-dpview="doors"]'); page.wait_for_timeout(100)
    check("wieder ein", "dims" not in M() and "doors" not in M() and ink() == n_doors)
    page.keyboard.press("Escape")

    # Teil setzen und Grösse wechseln
    page.click('[data-sym="D:PART:NH00"]'); click(200, 300); page.keyboard.press("Escape")
    nh = [i for i in of("part") if i["kind"] == "NH"]
    check("NH DIN 00 gesetzt, 105 × 187", len(nh) == 1 and (nh[0]["w"], nh[0]["h"]) == (105, 187), nh)
    click(250, 380); page.wait_for_timeout(100)
    page.select_option('select[data-dp="size"]', "1"); page.wait_for_timeout(50)
    nh = [i for i in of("part") if i["kind"] == "NH"][0]
    check("Grösse 1: 185 × 265", (nh["w"], nh["h"], nh["size"]) == (185, 265, "1"), nh)
    # Klemmenblock auf einer Schiene
    page.click('[data-sym="D:RAIL"]'); click(100, 1500); page.keyboard.press("Escape")
    page.click('[data-sym="D:DEV:KL"]'); click(140, 1500); page.keyboard.press("Escape")
    kl = [i for i in of("device") if i["kind"] == "KL"]
    check("Klemmenblock 5×10 auf der Schiene", len(kl) == 1 and kl[0]["y"] == of("rail")[0]["y"] and abs(kl[0]["te"] * 17.5 - 51) < 0.01, kl)
    click(kl[0]["x"] + 20, 1500); page.wait_for_timeout(100)
    page.select_option('select[data-dp="qs"]', "16"); page.wait_for_timeout(50)
    kl = [i for i in of("device") if i["kind"] == "KL"][0]
    check("Querschnitt 16: Breite 61 mm", abs(kl["te"] * 17.5 - 61) < 0.01, kl)

    # UV Bärgen öffnen, Beleg, PDF, DXF
    page.click("#btn-new"); page.wait_for_timeout(100); page.click('[data-start="schema"]')
    if page.locator(".modal").count(): page.click('.modal [data-r="1"]')
    with page.expect_file_chooser() as fc: page.click("#btn-open")
    fc.value.set_files(str(uv)); page.wait_for_timeout(400)
    check("UV Bärgen geöffnet", page.evaluate("window.__schemacad.kind") == "dispo" and len(of("part")) > 20 and len(of("cabinet")) == 1)
    page.keyboard.press("f"); page.wait_for_timeout(200)
    page.screenshot(path=str(SHOT))
    page.click("#btn-ansicht"); page.click('[data-dpview="doors"]'); page.wait_for_timeout(100); page.keyboard.press("Escape")
    dx_off = page.evaluate("window.__schemacad.exportDxf()")
    page.click("#btn-ansicht"); page.click('[data-dpview="doors"]'); page.wait_for_timeout(100); page.keyboard.press("Escape")
    check("Türen aus: DXF kürzer (Bänder nicht ausgegeben)", len(dx_off) < len(page.evaluate("window.__schemacad.exportDxf()")))
    n = page.evaluate("window.__schemacad.buildPrint()")
    html = page.evaluate("document.querySelector('#printroot').innerHTML")
    check("PDF-Seite enthält Schrank und Symbole", n >= 1 and "R-AB 5/10" in html and "NT 250 A" in html and "DIN 1" in html and "IP4" in html)
    page.evaluate("document.querySelector('#printroot').innerHTML = ''")
    dxf = OUT / "baergen_uv.dxf"
    dxf.write_text(page.evaluate("window.__schemacad.exportDxf()"))
    d = ezdxf.readfile(dxf); a = d.audit()
    txt = [e.dxf.text for e in d.modelspace().query("TEXT")]
    check("DXF ohne Audit-Fehler, Layer Schrank, Texte", not a.errors and "SCH_DISPO_SCHRANK" in d.layers and "R-AB 5/10" in txt and "120mm2" in txt and "400" in txt, (len(a.errors), txt[:5]))
    check("DXF Trennwand gestrichelt", any(e.dxf.linetype == "SCH_STRICH" for e in d.modelspace().query("LINE")))
    b.close()
check("keine JS-Fehler", not errors, errors[:3])
print(f"Beleg: {SHOT}")
sys.exit(1 if fails else 0)
