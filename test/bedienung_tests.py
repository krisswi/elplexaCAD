# UI-Tests Bedienung der Übersicht (Etappe 5, CJ 20.10.2026): Module ziehen, Rechtsklick-Menü und ⌘-Klick-Mehrfachwahl bei Projektkacheln, alles auch per Tastatur. Vorher: node build.mjs elplexa
# Aufruf: python3 test/bedienung_tests.py [Ausgabeordner]
import sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "ElplexaCAD.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="bedienung_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    vis = lambda s: page.is_visible(s)
    tiles = lambda: page.evaluate("[...document.querySelectorAll('#el-hub .el-tile[data-elopen]')].map((t) => t.dataset.elopen)")
    ptiles = lambda: page.evaluate("[...document.querySelectorAll('.el-ptile .el-pn')].map((t) => t.textContent)")
    def key(k, **o):
        page.evaluate("([k, o]) => (document.activeElement || window).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }))", [k, o])
        page.wait_for_timeout(150)
    page.goto(URL); page.wait_for_timeout(300)
    for kind in ("dispo", "pv"):
        page.click("#el-addmod"); page.wait_for_timeout(150); page.click(f'#el-addmenu [data-elnew="{kind}"]'); page.wait_for_timeout(250)
        page.evaluate("document.activeElement?.blur()"); key("0")

    # Module ziehen
    check("Ausgangsfolge Schema, Dispo, PV", tiles() == ["schema", "dispo", "pv"], tiles())
    check("Kacheln sind ziehbar", page.evaluate("[...document.querySelectorAll('.el-tile[data-modctx]')].every((t) => t.draggable)"))
    page.drag_and_drop("#el-tile-pv", "#el-tile-schema"); page.wait_for_timeout(300)
    check("PV auf Schema ziehen: PV steht vorn", tiles() == ["pv", "schema", "dispo"], tiles())
    check("Reihenfolge in der Datei gespeichert", page.evaluate("Object.fromEntries(Object.entries(window.__schemacad.doc.mods || {}).map(([k, v]) => [k, v.o]))") == {"pv": 1, "schema": 2, "dispo": 3})
    page.focus("#el-tile-pv"); key("ArrowRight", altKey=True)
    check("Tastatur: ⌥ → bleibt gleichwertig", tiles() == ["schema", "pv", "dispo"], tiles())
    page.screenshot(path=str(OUT / "b5_module.png"))

    # Projektkacheln: drei lokale Einträge durch Speichern
    for name in ("Alpha", "Beta", "Gamma"):
        page.evaluate("(n) => { window.showSaveFilePicker = async () => ({ name: n + '.elplexa.json', createWritable: async () => ({ write: async () => {}, close: async () => {} }), isSameEntry: async () => false }); return 0; }", name)
        page.fill(".el-name", name); page.keyboard.press("Tab"); page.wait_for_timeout(150)
        page.click("#btn-save"); page.wait_for_timeout(400)
        page.click("#el-file"); page.click('#el-filemenu [data-elfile="new"]'); page.wait_for_timeout(300)
        if page.is_visible(".modal"): page.fill(".modal input", "Neues Projekt"); page.click(".modal [data-ok]"); page.wait_for_timeout(300)
        if not vis("#el-hub"): page.evaluate("document.activeElement?.blur()"); key("0")
        page.click("#el-tab-projekte"); page.wait_for_timeout(200)
        page.click("#el-pt-cur"); page.wait_for_timeout(200)
    page.click("#el-tab-projekte"); page.wait_for_timeout(300)
    check("Drei lokale Kacheln und das geöffnete neue Projekt", len(ptiles()) == 4, ptiles())
    # Rechtsklick-Menü
    page.click(".el-ptile:not(.cur) >> nth=0", button="right"); page.wait_for_timeout(150)
    check("Rechtsklick: Menü Öffnen und Aus der Liste entfernen", vis("#el-projctx") and "Öffnen" in page.inner_text("#el-projctx") and "Aus der Liste entfernen" in page.inner_text("#el-projctx"))
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    check("Esc schliesst das Menü, Übersicht bleibt", not vis("#el-projctx") and vis("#el-hub"))
    # Tastatur: Menü-Taste (contextmenu am fokussierten Element)
    page.focus(".el-ptile:not(.cur) >> nth=1"); page.evaluate("document.activeElement.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))"); page.wait_for_timeout(150)
    check("Menü per Tastatur (Kontextmenü am fokussierten Element)", vis("#el-projctx"))
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    # Entfernen per Menü
    page.click(".el-ptile:not(.cur) >> nth=0", button="right"); page.click('#el-projctx [data-elprojact="rm"]'); page.wait_for_timeout(300)
    check("Entfernen per Menü: zwei lokale Kacheln und das geöffnete", len(ptiles()) == 3, ptiles())
    # ⌘-Klick Mehrfachwahl
    page.click(".el-ptile:not(.cur) >> nth=0", modifiers=["Meta"]); page.click(".el-ptile:not(.cur) >> nth=1", modifiers=["Meta"]); page.wait_for_timeout(200)
    check("⌘-Klick wählt beide, Leiste «2 gewählt», nichts wurde geöffnet", vis(".el-selbar") and "2" in page.inner_text(".el-selbar") and vis("#el-hub") and page.locator(".el-ptile.sel").count() == 2)
    page.click(".el-ptile:not(.cur) >> nth=0", modifiers=["Meta"]); page.wait_for_timeout(200)
    check("⌘-Klick wählt wieder ab", page.locator(".el-ptile.sel").count() == 1)
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    check("Esc hebt die Auswahl auf, Übersicht bleibt", not vis(".el-selbar") and vis("#el-hub") and page.locator(".el-ptile.sel").count() == 0)
    page.focus(".el-ptile:not(.cur) >> nth=0"); key("Enter", metaKey=True)
    page.evaluate("document.activeElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }))"); page.wait_for_timeout(200)
    check("Tastatur: ⌘ Enter wählt (als ⌘-Klick)", page.locator(".el-ptile.sel").count() == 1)
    page.click(".el-ptile:not(.cur) >> nth=1", modifiers=["Meta"]); page.wait_for_timeout(150)
    page.screenshot(path=str(OUT / "b5_auswahl.png"))
    page.click('[data-elact="selrm"]'); page.wait_for_timeout(300)
    check("Auswahl entfernen: nur das geöffnete Projekt bleibt", len(ptiles()) == 1 and page.locator(".el-ptile.cur").count() == 1, ptiles())
    check("keine Konsolenfehler", not errors, errors[:3])
    b.close()
print("Rot:" + str(fails) if fails else "alle ok")
sys.exit(1 if fails else 0)
