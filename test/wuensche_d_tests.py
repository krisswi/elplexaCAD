# UI-Test Wunsch D3 Nachtrag (CJ 19.10.2026): übergebene Dispo in der Blattliste zwischen die Schemablätter ziehen (v3) bzw. mit Alt+↑ (elplexaCAD),
# Nummern nach dem Beispiel von CJ, Inhaltsverzeichnis folgt. Aufruf aus web-src nach `node build.mjs` und `node build.mjs elplexa`: python3 test/wuensche_d_tests.py
import json, subprocess, sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
TMP = Path(tempfile.mkdtemp(prefix="wuensche_d_"))
SRC = TMP / "beispiel.schemacad.json"
subprocess.run(["node", "--input-type=module", "-e", f"""import fs from "fs"; const m = await import("./test/test_wuensche_d.mjs"); const {{ serializeModel }} = await import("./src/model.js");
fs.writeFileSync({json.dumps(str(SRC))}, serializeModel(m.beispielDoc()));"""], cwd=ROOT, check=True, capture_output=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
SOLL = ["Schema 2=2", "Schema 3=3", "Dispo UV=4", "Schema 4=5", "Schema 5=6", "Schema 10=10", "Schema 40=40"]
with sync_playwright() as p:
    b = p.chromium.launch()
    for html in ["schemacad.html", "ElplexaCAD.html"]:
        el = html.startswith("Elplexa")
        page = b.new_page(viewport={"width": 1400, "height": 900}); page.on("pageerror", lambda e: errors.append(str(e)))
        page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; delete window.showDirectoryPicker;")
        page.goto((ROOT / "dist" / html).as_uri()); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(100)
        D = lambda: page.evaluate("window.__schemacad.doc")
        page.evaluate("document.activeElement?.blur()")
        with page.expect_file_chooser() as fc: page.keyboard.press("Meta+o")
        fc.value.set_files(str(SRC)); page.wait_for_timeout(500)
        if page.locator("#el-hub").count() and page.is_visible("#el-hub"): page.keyboard.press("Escape"); page.wait_for_timeout(150)
        lst = lambda: [s["meta"]["TITEL"] + "=" + s["meta"]["BLATT"] for s in D()["sheets"] if s.get("kind") != "legend"]
        dpi = lambda: next(i for i, s in enumerate(D()["sheets"]) if s.get("kind") == "dispo")
        page.keyboard.press("g"); page.wait_for_timeout(150)
        check(f"{html}: übergebene Dispo steht in der Blattliste", page.locator(f'#sheet-menu [data-sheet="{dpi()}"]').count() == 1)
        if not el:  # ziehen: Dispo auf die Zeile von Blatt 4 (oberhalb einfügen)
            b4 = next(i for i, s in enumerate(D()["sheets"]) if s["meta"]["BLATT"] == "4" and not s.get("kind"))
            page.evaluate("(() => { const l = document.querySelector('#sheet-menu .slist'); l.scrollTop = l.scrollHeight; })()")  # Liste rollt: Dispo unten ins Bild
            src = page.locator(f'#sheet-menu [data-sheet="{dpi()}"]').bounding_box(); dst = page.locator(f'#sheet-menu [data-sheet="{b4}"]').bounding_box()
            page.mouse.move(src["x"] + 30, src["y"] + src["height"] / 2); page.mouse.down()
            page.mouse.move(dst["x"] + 30, dst["y"] + dst["height"] / 2, steps=8); page.mouse.up(); page.wait_for_timeout(200)
        else:  # Alt+↑: erst über die Legende hinter Blatt 40, dann weiter nach vorn bis zwischen 3 und 4
            for _ in range(5):
                page.focus(f'#sheet-menu [data-sheet="{dpi()}"]'); page.keyboard.press("Alt+ArrowUp"); page.wait_for_timeout(120)
        check(f"{html}: Beispiel CJ, Dispo 4, alte 4 → 5, alte 5 → 6, 10 und 40 bleiben", lst() == SOLL, lst())
        check(f"{html}: Dispo im Schema (ins)", D()["sheets"][dpi()].get("ins") == 1)
        page.keyboard.press("Escape")
        txt = page.evaluate("window.__schemacad.docText()") if page.evaluate("typeof window.__schemacad.docText === 'function'") else json.dumps(D())
        check(f"{html}: Datei behält ins", '"ins":1' in txt.replace(" ", ""))
        if el:  # Seitenleiste schmal
            page.set_viewport_size({"width": 375, "height": 812}); page.wait_for_timeout(200)
            check(f"{html} 375 px: kein seitlicher Überlauf", page.evaluate("document.documentElement.scrollWidth") <= 375)
        page.close()
    check("keine Fehler in der Konsole", not errors, errors[:3])
    b.close()
print(f"\n{len(fails)} Fehler" if fails else "\nWünsche D: alle Tests ok")
sys.exit(1 if fails else 0)
