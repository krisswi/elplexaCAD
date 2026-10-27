# UI-Tests Bedienung der Übersicht (Etappe 5, CJ 20.10.2026): Module ziehen, Rechtsklick-Menü und ⌘-Klick-Mehrfachwahl bei Projektkacheln, alles auch per Tastatur. Vorher: node build.mjs elplexa
# Aufruf: python3 test/bedienung_tests.py [Ausgabeordner]
import sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from elstart import projektansicht
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
    page.goto(URL); page.wait_for_timeout(300); projektansicht(page)
    for kind in ("dispo", "pv"):
        page.click("#el-addmod"); page.wait_for_timeout(150); page.click(f'#el-addmenu [data-elnew="{kind}"]'); page.wait_for_timeout(250)
        page.evaluate("document.activeElement?.blur()"); key("0")

    # Module ziehen
    check("Ausgangsfolge Schema, Dispo, PV", tiles() == ["schema", "dispo", "pv", "legende"], tiles())
    check("Kacheln sind ziehbar", page.evaluate("[...document.querySelectorAll('.el-tile[data-modctx]')].every((t) => t.draggable)"))
    page.drag_and_drop("#el-tile-pv", "#el-tile-schema"); page.wait_for_timeout(300)
    check("PV auf Schema ziehen: PV steht vorn", tiles() == ["pv", "schema", "dispo", "legende"], tiles())
    check("Reihenfolge in der Datei gespeichert", page.evaluate("Object.fromEntries(Object.entries(window.__schemacad.doc.mods || {}).map(([k, v]) => [k, v.o]))") == {"pv": 1, "schema": 2, "dispo": 3, "legende": 4})
    page.focus("#el-tile-pv"); key("ArrowRight", altKey=True)
    check("Tastatur: ⌥ → bleibt gleichwertig", tiles() == ["schema", "pv", "dispo", "legende"], tiles())
    page.screenshot(path=str(OUT / "b5_module.png"))

    # Projektkacheln: drei lokale Einträge durch Speichern
    for name in ("Alpha", "Beta", "Gamma"):
        page.evaluate("(n) => { window.showSaveFilePicker = async () => ({ name: n + '.elplexa.json', createWritable: async () => ({ write: async () => {}, close: async () => {} }), isSameEntry: async () => false }); return 0; }", name)
        page.fill(".el-name", name); page.keyboard.press("Tab"); page.wait_for_timeout(150)
        page.click("#btn-save"); page.wait_for_timeout(400)
        page.click("#el-nav-projekte"); page.click('#el-hub [data-elact="newproj"]'); page.wait_for_timeout(300)
        if page.is_visible(".modal"): page.fill(".modal input", "Neues Projekt"); page.click(".modal [data-ok]"); page.wait_for_timeout(300)
        if not vis("#el-hub"): page.evaluate("document.activeElement?.blur()"); key("0")
        page.click("#el-nav-projekte"); page.wait_for_timeout(200)
        page.click("#el-pt-cur"); page.wait_for_timeout(200)
    # offenes Projekt aus einer Datei: «Delta» gespeichert, sein Eintrag steht vorn in «zuletzt geöffnet», die Kachel «geöffnet» ersetzt ihn
    page.evaluate("window.showSaveFilePicker = async () => ({ name: 'Delta.elplexa.json', createWritable: async () => ({ write: async () => {}, close: async () => {} }), isSameEntry: async () => false }); 0")
    page.fill(".el-name", "Delta"); page.keyboard.press("Tab"); page.wait_for_timeout(150); page.click("#btn-save"); page.wait_for_timeout(400)
    page.click("#el-nav-projekte"); page.wait_for_timeout(300)
    idb = lambda: page.evaluate("() => new Promise((res) => { const r = indexedDB.open('elplexacad', 1); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('recent'); q.onsuccess = () => res((q.result || []).map((e) => e.file)); }; })")
    check("Drei lokale Kacheln und das geöffnete Projekt (sein Eintrag wird nicht doppelt gezeigt)", ptiles() == ["Delta", "Gamma", "Beta", "Alpha"], ptiles())
    check("Liste im Browser: Delta, Gamma, Beta, Alpha", idb() == ["Delta.elplexa.json", "Gamma.elplexa.json", "Beta.elplexa.json", "Alpha.elplexa.json"], idb())
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
    check("Es wurde Gamma entfernt, nicht das offene Projekt Delta (Platz in der ungefilterten Liste)", idb() == ["Delta.elplexa.json", "Beta.elplexa.json", "Alpha.elplexa.json"], idb())
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
    # Auswahl und Filter: ändert sich die Liste, ist die Auswahl weg
    page.select_option('[data-elf="filter"]', "In Arbeit"); page.wait_for_timeout(250)
    check("Filter ändern leert die Auswahl", not vis(".el-selbar") and page.locator(".el-ptile.sel").count() == 0)
    page.select_option('[data-elf="filter"]', "Alle"); page.wait_for_timeout(250)
    page.click(".el-ptile:not(.cur) >> nth=0", modifiers=["Meta"]); page.click(".el-ptile:not(.cur) >> nth=1", modifiers=["Meta"]); page.wait_for_timeout(150)
    page.click('[data-elact="selrm"]'); page.wait_for_timeout(300)
    check("Auswahl entfernen: Delta (offen) bleibt, die gewählten zwei sind weg", idb() == ["Delta.elplexa.json"] and ptiles() == ["Delta"], [idb(), ptiles()])
    check("Auswahl entfernen: nur das geöffnete Projekt bleibt", len(ptiles()) == 1 and page.locator(".el-ptile.cur").count() == 1, ptiles())
    check("keine Konsolenfehler", not errors, errors[:3])

    # Projektkacheln ziehen: eigene Reihenfolge (neue Seite, drei vorbereitete Einträge ohne Dateizugriff)
    pg = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(300); projektansicht(pg)
    pg.evaluate("() => new Promise((res) => { const r = indexedDB.open('elplexacad', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put([{ file: 'c.elplexa.json', name: 'Cäsar', status: 'In Arbeit', handle: null, t: 3 }, { file: 'b.elplexa.json', name: 'Berta', status: 'In Arbeit', handle: null, t: 2 }, { file: 'a.elplexa.json', name: 'Anton', status: 'In Arbeit', handle: null, t: 1 }], 'recent'); tx.oncomplete = () => res(); }; })")
    pg.reload(); pg.wait_for_timeout(400); projektansicht(pg); pg.click("#el-nav-projekte"); pg.wait_for_timeout(300)
    names = lambda: pg.evaluate("[...document.querySelectorAll('.el-ptile:not(.cur) .el-pn')].map((t) => t.textContent)")
    check("Ausgangsfolge «zuletzt»: Cäsar, Berta, Anton", names() == ["Cäsar", "Berta", "Anton"], names())
    check("Sortierung bietet «Eigene Reihenfolge»", "Eigene Reihenfolge" in pg.inner_text('[data-elf="sort"]'))
    pg.drag_and_drop(".el-ptile[data-pkey='l:a.elplexa.json']", ".el-ptile[data-pkey='l:c.elplexa.json']"); pg.wait_for_timeout(300)
    check("Anton auf Cäsar ziehen: Anton vorn, Sortierung wechselt auf «Eigene Reihenfolge»", names() == ["Anton", "Cäsar", "Berta"] and pg.input_value('[data-elf="sort"]') == "eigene", [names(), pg.input_value('[data-elf="sort"]')])
    pg.reload(); pg.wait_for_timeout(400); projektansicht(pg); pg.click("#el-nav-projekte"); pg.select_option('[data-elf="sort"]', "eigene"); pg.wait_for_timeout(300)
    check("Eigene Reihenfolge bleibt nach Neuladen", names() == ["Anton", "Cäsar", "Berta"], names())
    pg.select_option('[data-elf="sort"]', "name"); pg.wait_for_timeout(250)
    check("Sortierung nach Name unabhängig davon", names() == ["Anton", "Berta", "Cäsar"], names())
    check("keine Konsolenfehler (Ziehen)", not errors, errors[:3])
    b.close()
print("Rot:" + str(fails) if fails else "alle ok")
sys.exit(1 if fails else 0)
