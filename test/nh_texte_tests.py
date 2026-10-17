# UI-Tests Disposition 16.10.2026 (Headless-Chromium): NH Weber Silas/Vertigroup wählen, Textzeilen im Panel, Textgrösse pro Bauteil.
# Aufruf aus web-src: python3 test/nh_texte_tests.py [Ausgabeordner] [Beleg.png]
# Ohne Ausgabeordner landet alles in einem Temp-Ordner. Der Beleg zeigt alle NH-Typen nebeneinander (Datei aus test_nh_texte.mjs).
import json, subprocess, sys, tempfile
from pathlib import Path
import ezdxf
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="nh_texte_"))
SHOT = Path(sys.argv[2]) if len(sys.argv) > 2 else OUT / "nh_weber.png"
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
beleg = OUT / "NH Weber.schemacad.json"
subprocess.run(["node", str(ROOT / "test" / "test_nh_texte.mjs"), str(beleg)], check=True, cwd=ROOT, stdout=subprocess.DEVNULL)
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
    def click(x, y): X, Y = pt(x, y); page.mouse.move(X, Y); page.mouse.click(X, Y); page.wait_for_timeout(60)
    M = lambda: page.evaluate("window.__schemacad.model")
    parts = lambda k: [i for i in M()["items"] if i["type"] == "part" and i["kind"] == k]
    page.click("#sheet-add", button="right"); page.click('[data-new="dispo"]'); page.wait_for_timeout(150)

    # ---------- (a) NH Silas und Vertigroup ----------
    for s in ["NH000", "NH00", "NH1", "NH2", "NHSILAS", "NHVG"]:
        check("Palette Leistungsteil hat " + s, page.locator(f'[data-sym="D:PART:{s}"]').count() == 1)
    page.click('[data-sym="D:PART:NHSILAS"]'); click(0, 0); page.keyboard.press("Escape")
    nh = parts("NH")
    check("Silas gesetzt: Gr. 1, 184 × 308, Strom 250", len(nh) == 1 and (nh[0].get("maker"), nh[0]["size"], nh[0]["w"], nh[0]["h"], nh[0]["s"]) == ("silas", "1", 184, 308, "250"), nh)
    page.keyboard.press("f"); page.wait_for_timeout(150)
    click(90, 150); page.wait_for_timeout(100)
    opts = page.eval_on_selector('select[data-dp="size"]', "s => [...s.options].map(o => o.value)")
    check("Grössen Silas in Reihenfolge 000 bis 3", opts == ["000", "00", "1", "2", "3"], opts)
    check("Panel nennt Polteilung", "Polteilung 57 mm" in page.inner_text("#right"))
    page.select_option('select[data-dp="size"]', "3"); page.wait_for_timeout(100)
    nh = parts("NH")[0]
    check("Gr. 3: 250 × 308, Strom folgt (630)", (nh["w"], nh["h"], nh["s"]) == (250, 308, "630"), nh)
    page.fill('input[data-dp="s"]', "500"); page.wait_for_timeout(50)
    page.select_option('select[data-dp="size"]', "2"); page.wait_for_timeout(100)
    check("Strom von Hand bleibt beim Grössenwechsel", parts("NH")[0]["s"] == "500")
    page.select_option('select[data-dp="maker"]', "vertigroup"); page.wait_for_timeout(150)
    nh = parts("NH")[0]
    opts = page.eval_on_selector('select[data-dp="size"]', "s => [...s.options].map(o => o.value)")
    check("Vertigroup: Typenliste neu, Leiste 100 × 671", opts[0] == "1-3" and "00-3" in opts and "3-1" in opts and len(opts) == 11 and (nh["maker"], nh["size"], nh["w"], nh["h"]) == ("vertigroup", "1-3", 100, 671), (opts, nh))
    page.select_option('select[data-dp="maker"]', "std"); page.wait_for_timeout(150)
    nh = parts("NH")[0]
    check("zurück auf Standard: kein Hersteller in der Datei", "maker" not in nh and nh["size"] == "00" and (nh["w"], nh["h"]) == (105, 187), nh)
    page.keyboard.press("Escape")

    # ---------- (b) Textzeilen ----------
    for _ in range(3): page.keyboard.press("-")
    page.wait_for_timeout(100)
    page.click('[data-sym="D:PART:KASTEN"]'); click(300, 0); page.keyboard.press("Escape")
    k = parts("KASTEN")[0]
    click(k["x"] + 50, k["y"] + 25); page.wait_for_timeout(100)
    check("Kasten: ein Feld je Zeile, kein „|“-Hinweis", page.locator('input[data-dp="ln:0"]').count() == 1 and "„|“" not in page.inner_text("#right"))
    page.click('[data-act="dplineadd"]'); page.wait_for_timeout(100)
    focused = page.evaluate("document.activeElement?.dataset?.dp")
    check("Zeile hinzufügen: neues Feld hat den Fokus", focused == "ln:1", focused)
    page.keyboard.type("Zweite|Zeile"); page.click('[data-act="dplineadd"]'); page.wait_for_timeout(100)
    page.fill('input[data-dp="ln:2"]', "Dritte"); page.wait_for_timeout(50)
    check("drei Zeilen gespeichert, „|“ bleibt Text", parts("KASTEN")[0]["lines"] == ["Text", "Zweite|Zeile", "Dritte"], parts("KASTEN")[0])
    txt = lambda: page.evaluate("[...document.querySelectorAll('#items text')].map(t=>t.textContent)")
    check("Plan zeigt die Zeilen", all(s in txt() for s in ["Zweite|Zeile", "Dritte"]))
    page.click('[data-act="dplinedel"][data-i="0"]'); page.wait_for_timeout(100)
    check("Zeile entfernen", parts("KASTEN")[0]["lines"] == ["Zweite|Zeile", "Dritte"] and page.locator('input[data-dp^="ln:"]').count() == 2)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(100)
    check("Rückgängig holt die Zeile zurück", parts("KASTEN")[0]["lines"][0] == "Text")

    # ---------- (c) Textgrösse ----------
    fs = lambda s: page.evaluate(f"[...document.querySelectorAll('#items text')].filter(t=>t.textContent=={s!r}).map(t=>parseFloat(t.getAttribute('font-size')))[0]")
    click(k["x"] + 50, k["y"] + 25); page.wait_for_timeout(100)
    f0 = fs("Dritte")
    def dxh(t):
        f = OUT / "h.dxf"; f.write_text(page.evaluate("window.__schemacad.exportDxf()"))
        h = {e.dxf.text: e.dxf.height for e in ezdxf.readfile(f).modelspace().query("TEXT")}.get(t); f.unlink(); return h
    h0 = dxh("Dritte")
    check("Textgrösse-Feld mit Vorgabe 100", page.input_value('input[data-dp="tfp"]') == "100")
    page.fill('input[data-dp="tfp"]', "150"); page.wait_for_timeout(100)
    # seit 16.10.2026: Text innen füllt den Kasten schon, über 100 % bleibt er gleich (kleiner statt breiter); 50 % = halb
    check("150 %: Faktor 1,5 gespeichert, Kastentext bleibt im Kasten", parts("KASTEN")[0].get("tf") == 1.5 and abs(fs("Dritte") - f0) < 0.01, (f0, fs("Dritte")))
    page.fill('input[data-dp="tfp"]', "50"); page.wait_for_timeout(100)
    check("50 %: Kastentext halb so gross", abs(fs("Dritte") - 0.5 * f0) < 0.01, (f0, fs("Dritte")))
    page.fill('input[data-dp="tfp"]', "100"); page.wait_for_timeout(100)
    check("100 %: Faktor entfällt", "tf" not in parts("KASTEN")[0])
    page.fill('input[data-dp="tfp"]', "200"); page.wait_for_timeout(100)
    page.keyboard.press("Escape")
    page.click('[data-sym="D:RAIL"]'); click(120, 260); page.keyboard.press("Escape")
    page.click('[data-sym="D:DEV:LS1"]')
    click(150, 260); page.keyboard.press("Escape")
    dev = [i for i in M()["items"] if i["type"] == "device"]
    click(dev[0]["x"] + 8, 260); page.wait_for_timeout(100)
    check("Gerät hat Textgrösse-Feld", page.locator('input[data-dp="tfp"]').count() == 1)
    page.fill('input[data-dp="tfp"]', "130"); page.wait_for_timeout(50); page.keyboard.press("Escape")
    check("Gerät: Faktor 1,3", [i for i in M()["items"] if i["type"] == "device"][0].get("tf") == 1.3)
    dxf = OUT / "nh_texte.dxf"
    dxf.write_text(page.evaluate("window.__schemacad.exportDxf()"))
    d = ezdxf.readfile(dxf); a = d.audit()
    hs = {e.dxf.text: e.dxf.height for e in d.modelspace().query("TEXT")}
    check("DXF ohne Audit-Fehler, Kastentext bei 200 % im Kasten", not a.errors and abs(hs["Dritte"] - h0) < 0.01 and "DIN 00" in hs, (len(a.errors), h0, hs.get("Dritte")))
    n = page.evaluate("window.__schemacad.buildPrint()")
    html = page.evaluate("document.querySelector('#printroot').innerHTML")
    check("PDF-Seite enthält NH-Grösse und Zeilen", n >= 1 and "DIN 00" in html and "Dritte" in html)
    page.evaluate("document.querySelector('#printroot').innerHTML = ''")
    # Speichern und wieder öffnen
    with page.expect_download() as dl: page.click("#btn-save")
    saved = OUT / "nh_texte.schemacad.json"; dl.value.save_as(str(saved))
    j = json.loads(saved.read_text())
    check("Datei Version 9", j["version"] == 9)

    # ---------- Beleg: alle NH-Typen ----------
    page.click("#btn-new"); page.wait_for_timeout(100); page.click('[data-start="schema"]')
    if page.locator(".modal").count(): page.click('.modal [data-r="1"]')
    with page.expect_file_chooser() as fc: page.click("#btn-open")
    fc.value.set_files(str(beleg)); page.wait_for_timeout(400)
    check("Belegdatei geöffnet", page.evaluate("window.__schemacad.kind") == "dispo" and len(parts("NH")) == 22)  # seit 16.10.2026: Vertigroup NH1 bis NH3 je 1-/3-polig und 2 mit Wandler
    page.keyboard.press("f"); page.wait_for_timeout(200)
    page.evaluate("document.querySelectorAll('.toast').forEach(t => t.remove())")
    page.screenshot(path=str(SHOT), clip=page.locator("#svg").bounding_box())
    b.close()
check("keine JS-Fehler", not errors, errors[:3])
print(f"Beleg: {SHOT}")
sys.exit(1 if fails else 0)
