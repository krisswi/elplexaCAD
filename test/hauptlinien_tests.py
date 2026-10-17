# UI-Tests Hauptlinien neu (hauptlinien.js, 16.10.2026): Gruppe L1 bis N über den Blattrand, Ziel ändern, Abschlussstriche in Bild, PDF und DXF.
# Aufruf aus web-src: python3 test/hauptlinien_tests.py
import sys, tempfile, re, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
import ezdxf
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
OUT = Path(tempfile.mkdtemp(prefix="hauptlinien_"))
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
COL6 = 10 + 277 / 8 * 5.5  # Mitte Spalte 6
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    D = lambda: page.evaluate("window.__schemacad.doc")
    M = lambda: page.evaluate("window.__schemacad.model")
    def go(i): page.click("#sheet-cur"); page.click(f'#sheet-menu [data-sheet="{i}"]'); page.wait_for_timeout(120)
    def pt(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.evaluate("(()=>{const r=document.querySelector('#svg').getBoundingClientRect();return {l:r.left,t:r.top}})()")
        return r["l"] + v["x"] + x * v["z"], r["t"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): X, Y = pt(x, y); page.mouse.move(X, Y); page.mouse.click(X, Y); page.wait_for_timeout(80)
    ref = lambda sh, side: next((i for i in sh["items"] if i.get("main") == side), None)
    schema = lambda: [s for s in D()["sheets"] if not s.get("kind")]
    page.goto(URL); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(100)

    # Drei Schemablätter: 3 → 4 → 5 automatisch
    page.click("[data-addsheet]"); page.wait_for_timeout(100); page.click("[data-addsheet]"); page.wait_for_timeout(100)
    s3, s4, s5 = schema()
    check("Blätter 3, 4, 5", [s["meta"]["BLATT"] for s in (s3, s4, s5)] == ["3", "4", "5"])
    check("Abgehend auf 3 und 4, ankommend auf 4 und 5", [bool(ref(s, "r")) for s in (s3, s4, s5)] == [True, True, False] and [bool(ref(s, "l")) for s in (s3, s4, s5)] == [False, True, True])
    check("Ziel auf Blatt 3 zeigt Blatt 4", ref(s3, "r")["attrs"]["ZIEL"].startswith("4."), ref(s3, "r")["attrs"]["ZIEL"])
    check("Datei Version 7", D()["version"] == 7)

    # Blatt 3: Hauptlinie L1 anklicken, Panel zeigt Ziel, auf Blatt 5 umstellen
    go(2); page.keyboard.press("v"); click(150, 190)
    check("L1 gewählt: Ende rechts als Gruppe", page.locator("select[data-mainr]").count() == 1 and "Grundverkabelung" in page.inner_text("#right"))
    opts = page.eval_on_selector_all("select[data-mainr] option", "os => os.map(o => [o.value, o.textContent])")
    v5 = next(v for v, t in opts if t.endswith("Blatt 5"))
    page.select_option("select[data-mainr]", v5); page.wait_for_timeout(120)
    s3, s4, s5 = schema()
    check("3 geht auf 5", ref(s3, "r")["attrs"]["ZIEL"].startswith("5.") and ref(s5, "l")["attrs"]["ZIEL"].startswith("3."))
    check("Blatt 4 dazwischen: kein Verweis links, endet rechts mit Strichen", not ref(s4, "l") and not ref(s4, "r") and all(w.get("ends", {}).get("r") == "end" for w in s4["items"] if w["type"] == "wire" and w["kind"] != "pe"))
    page.keyboard.press("Meta+z"); page.wait_for_timeout(120)
    s3, s4, s5 = schema()
    check("Rückgängig: wieder 3 → 4", ref(s3, "r")["attrs"]["ZIEL"].startswith("4.") and ref(s4, "l") is not None)

    # Blatt 5: endet bei Spalte 6 → Striche im Bild, im PDF und im DXF
    go(4); page.keyboard.press("Escape"); click(150, 120)
    page.click("#btn-haupt"); page.wait_for_timeout(80)
    check("Fenster Hauptlinien: Anfang und Ende", page.locator("#pv-pop select[data-mainl]").count() == 1 and page.locator("#pv-pop select[data-mainr]").count() == 1)
    page.select_option("#pv-pop select[data-mainr]", "col:6"); page.wait_for_timeout(120); page.keyboard.press("Escape")
    svg = page.inner_html("#items")
    check("4 Abschlussstriche im Bild", len(re.findall(r'points="([\d.]+),([\d.]+) \1,([\d.]+)"', svg)) >= 4 and all(w["pts"][-1][0] == round(COL6, 4) or abs(w["pts"][-1][0] - COL6) < 1e-6 for w in M()["items"] if w["type"] == "wire" and w["kind"] != "pe"))
    page.evaluate("window.__schemacad.buildPrint()")
    pr = page.inner_html("#printroot")
    xs = re.findall(r'points="([\d.]+),([\d.]+) \1,([\d.]+)"', pr)
    check("Striche auch im PDF (Druckseite)", sum(1 for x, y1, y2 in xs if abs(float(x) - COL6) < 0.01 and abs(float(y2) - float(y1) - 2.4) < 0.01) == 4, xs[:6])
    dxf = OUT / "blatt5.dxf"; dxf.write_text(page.evaluate("window.__schemacad.exportDxf()"))
    doc = ezdxf.readfile(dxf); aud = doc.audit()
    stubs = [e for e in doc.modelspace().query("LINE") if abs(e.dxf.start.x - COL6) < 0.01 and abs(e.dxf.end.x - COL6) < 0.01 and e.dxf.layer == "SCH_NETZ"]
    check("DXF ohne Audit-Fehler", len(aud.errors) == 0, [str(e) for e in aud.errors][:3])
    check("4 Abschlussstriche im DXF (SCH_NETZ)", len(stubs) == 4, len(stubs))
    ins = [e for e in doc.modelspace().query("INSERT") if e.dxf.name == "VINL_4P"]
    check("Ankommender Verweis als Block VINL_4P mit Ziel, Pfeil innen vor der Linie (x 16 bis 20)", len(ins) == 1 and abs(ins[0].dxf.insert.x - 20) < 1e-6 and any(a.dxf.text.startswith("4.") for a in ins[0].attribs))
    # Verweis anklicken zeigt das Panel der Gruppe, keine Verknüpfen-Knöpfe
    page.keyboard.press("Escape"); click(18, 177)
    check("Gruppenverweis gewählt: Panel ohne Verknüpfen", page.locator("#right select[data-mainl]").count() == 1 and page.locator('#right [data-act="relink"]').count() == 0)
    check("keine Fehler in der Konsole", not errors, errors[:3])
    b.close()
shutil.rmtree(OUT)
print(f"\n{len(fails)} Fehler" if fails else "\nHauptlinien UI: alle Tests ok")
sys.exit(1 if fails else 0)
