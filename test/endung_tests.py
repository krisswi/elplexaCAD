# elplexaCAD-Dateiendung (files.js): Speichern als .elplexa.json, alte .schemacad.json öffnen. Vorher: node build.mjs elplexa. Aufruf aus web-src: python3 test/endung_tests.py
import shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "ElplexaCAD.html").as_uri()
OLD = ROOT / "test" / "ui_out.schemacad.json"
TMP = Path(tempfile.mkdtemp(prefix="endung_"))
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")  # Download- und Datei-Eingabe-Weg
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_timeout(300)
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    with page.expect_download() as dl:
        page.keyboard.press("Meta+s")
    name = dl.value.suggested_filename
    check("Speichern-Name endet auf .elplexa.json", name.endswith(".elplexa.json"), name)
    for src, want in ((OLD, "ui_out"), (shutil.copy(OLD, TMP / "Neu.elplexa.json"), "Neu")):
        with page.expect_file_chooser() as fc:
            page.keyboard.press("Meta+o")
        fc.value.set_files(str(src)); page.wait_for_timeout(300)
        st = page.evaluate("({ n: document.querySelector('#file-name').textContent, s: window.__schemacad.doc.sheets.length })")
        check(f"{Path(src).name} öffnet, Projektname ohne Endung", st["n"] == want and st["s"] > 0, str(st))
    check("keine Seitenfehler", not errors, "; ".join(errors[:3]))
    b.close()
print("FEHLER: " + ", ".join(fails) if fails else "Alle Tests grün")
raise SystemExit(1 if fails else 0)
