# Skill plan-aufbereiten: .elplexa.json in dist/ElplexaCAD.html öffnen, Plan einpassen, Bild speichern.
# Aufruf (im Repo, vorher gebaut): python3 .claude/skills/plan-aufbereiten/pruefen.py datei.elplexa.json bild.png
# Meldet Fehler der Seite und die Zahl der Objekte, die die App geladen hat.
import sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[3]
src, png = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1600, "height": 1000}, device_scale_factor=2)  # scharf genug für Ausschnitte
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; delete window.showDirectoryPicker;")
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(500)
    with page.expect_file_chooser() as fc: page.locator('[data-elact="openfile"]').first.click()
    fc.value.set_files(str(src)); page.wait_for_timeout(800)
    # Plan-Modul öffnen: Kachel in der Projektansicht, sonst Blatt schon offen
    if page.locator("#el-pt-cur").count(): page.click("#el-pt-cur"); page.wait_for_timeout(200)
    tile = page.locator('[data-elmod="plan"], [data-elopen="plan"]')
    if tile.count(): tile.first.click(); page.wait_for_timeout(500)
    page.evaluate("document.activeElement?.blur()")
    for k in ["Escape", "v", "f"]:
        page.evaluate("([k]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))", [k]); page.wait_for_timeout(150)
    page.wait_for_timeout(400)
    page.screenshot(path=str(png))
    m = page.evaluate("window.__schemacad.model")
    print(json.dumps({"kind": m.get("kind"), "objekte": len(m.get("items", [])), "ebenen": [l["name"] for l in m.get("layers", [])], "fehler": errors}, ensure_ascii=False))
    b.close()
sys.exit(1 if errors else 0)
