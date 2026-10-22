# UI-Tests Modulstatus und Reihenfolge der Module in der Projektübersicht (CJ 20.10.2026, Etappe 1). Vorher: node build.mjs elplexa
# Aufruf: python3 test/modstatus_tests.py [Ausgabeordner]
import sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "ElplexaCAD.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="modstatus_"))
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
    mods = lambda: page.evaluate("window.__schemacad.doc.mods || {}")
    tiles = lambda: page.evaluate("[...document.querySelectorAll('#el-hub .el-tile[data-elopen]')].map((t) => t.dataset.elopen)")
    pill = lambda i: page.evaluate("(i) => document.querySelectorAll('#el-hub .el-tile[data-elopen] .el-mst')[i]?.textContent.replace('▾','').trim()", i)
    def key(k, **o):
        page.evaluate("([k, o]) => (document.activeElement || window).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }))", [k, o])
        page.wait_for_timeout(150)
    def add(kind):
        page.click("#el-addmod"); page.wait_for_timeout(150); page.click(f'#el-addmenu [data-elnew="{kind}"]'); page.wait_for_timeout(250)
        key("0")
    page.goto(URL); page.wait_for_timeout(300)
    add("dispo"); add("pv")
    check("Standardfolge Schema, Dispo, PV, Legende", tiles() == ["schema", "dispo", "pv", "legende"], tiles())
    check("Status Standard Offen, nichts in der Datei", pill(0) == "Offen" and not any("st" in v for v in mods().values()))
    page.screenshot(path=str(OUT / "ms_vorher.png"))

    # Status per Pille
    page.click('[data-elmst="dispo"]'); page.wait_for_timeout(150)
    labels = page.evaluate("[...document.querySelectorAll('#el-mstpop [data-elmstset]')].map((b) => b.dataset.elmstset)")
    check("Menü mit den sechs Status in CJs Reihenfolge", labels == ["Offen", "In Arbeit", "Geprüft", "Versendet", "Revision", "Archiviert"], labels)
    page.click('#el-mstpop [data-elmstset="Geprüft"]'); page.wait_for_timeout(200)
    check("Status gesetzt, Kachel zeigt ihn, Projektstatus unabhängig", pill(1) == "Geprüft" and mods()["dispo"]["st"] == "Geprüft" and page.evaluate("window.__schemacad.doc.project?.status || 'In Arbeit'") == "In Arbeit")
    check("Datei steigt auf Version 18", page.evaluate("window.__schemacad.doc.version") == 18)
    # ⌘Z in der Übersicht: Status und Reihenfolge sind Änderungen der Datei
    page.focus("#el-tile-dispo"); page.keyboard.press("Meta+z"); page.wait_for_timeout(250)
    check("⌘Z in der Übersicht nimmt den Status zurück", pill(1) == "Offen" and "st" not in mods().get("dispo", {}), mods())
    page.focus("#el-tile-dispo"); page.keyboard.press("Meta+Shift+z"); page.wait_for_timeout(250)
    check("⇧⌘Z stellt ihn wieder her", pill(1) == "Geprüft", pill(1))
    # Taste S an gewählter Kachel
    page.focus("#el-tile-pv"); key("s"); page.wait_for_timeout(100)
    check("Taste S öffnet das Statusmenü der Kachel", page.is_visible("#el-mstpop"))
    check("Menü fokussiert den gewählten Eintrag", page.evaluate("document.activeElement.dataset.elmstset") == "Offen")
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    check("Esc: Menü zu, Fokus zurück auf der Kachel", not page.is_visible("#el-mstpop") and page.evaluate("!!document.activeElement.closest('#el-tile-pv')"))
    key("s"); page.keyboard.press("ArrowDown"); page.keyboard.press("ArrowDown"); page.keyboard.press("ArrowDown"); page.keyboard.press("ArrowDown"); page.keyboard.press("Enter"); page.wait_for_timeout(250)
    check("S, Pfeile, Enter wählt Revision, Fokus auf der Kachel", mods()["pv"]["st"] == "Revision" and page.evaluate("document.activeElement.id") == "el-tile-pv", [mods().get("pv"), page.evaluate("document.activeElement.id")])
    page.click('[data-elmst="pv"]'); page.click('#el-mstpop [data-elmstset="Offen"]'); page.wait_for_timeout(200)
    check("Offen entfernt den Eintrag", "pv" not in mods() or "st" not in mods()["pv"])

    # Umordnen
    page.focus("#el-tile-dispo"); key("ArrowLeft", altKey=True)
    check("⌥ ← schiebt Dispo nach vorn", tiles() == ["dispo", "schema", "pv", "legende"], tiles())
    check("Fokus bleibt auf der Kachel", page.evaluate("document.activeElement.id") == "el-tile-dispo")
    key("ArrowLeft", altKey=True)
    check("am Anfang bleibt es", tiles() == ["dispo", "schema", "pv", "legende"])
    page.focus("#el-tile-legende"); key("ArrowRight", altKey=True)  # Legende eigenes Modul (21.10.2026), letzte Kachel
    check("am Ende bleibt es", tiles() == ["dispo", "schema", "pv", "legende"])
    page.focus("#el-tile-schema"); key("ArrowRight", altKey=True)
    check("⌥ → schiebt nach hinten", tiles() == ["dispo", "pv", "schema", "legende"], tiles())

    # Taste N = N-te Kachel
    check("Kachel zeigt ihre Taste", page.evaluate("[...document.querySelectorAll('#el-hub .el-tile[data-elopen] kbd')].map((k) => k.textContent).join('')") == "1234")
    key("2")
    check("Taste 2 öffnet die zweite Kachel (PV)", not page.is_visible("#el-hub") and page.evaluate("window.__schemacad.kind") == "pv", page.evaluate("window.__schemacad.kind"))
    key("0"); key("9")
    check("Taste 9 ohne Kachel: Hinweis, Übersicht bleibt", page.is_visible("#el-hub") and "Kein Modul" in page.inner_text("#toasts"))
    page.screenshot(path=str(OUT / "ms_nachher.png"))

    # Duplizieren: Kopie startet Offen, ohne Platz; Löschen räumt auf
    page.click('[data-elmst="dispo"]'); page.click('#el-mstpop [data-elmstset="Versendet"]'); page.wait_for_timeout(200)
    page.click("#el-tile-dispo", button="right"); page.wait_for_timeout(150); page.click('[data-elmodact="dup"]'); page.wait_for_timeout(250)
    ids = tiles()
    check("Kopie da, am Ende", len(ids) == 5 and ids[:4] == ["dispo", "pv", "schema", "legende"] and ids[4] == "dispo:2", ids)
    check("Kopie startet Offen", pill(4) == "Offen" and "st" not in mods().get("dispo:2", {}))
    page.click("#el-tile-dispo-2", button="right"); page.wait_for_timeout(150); page.click('[data-elmodact="del"]'); page.wait_for_timeout(200)
    page.click('.modal [data-r="1"]'); page.wait_for_timeout(300)
    check("Löschen entfernt Kachel und Eintrag", tiles() == ["dispo", "pv", "schema", "legende"] and "dispo:2" not in mods(), mods())
    check("Löschen lässt Status der anderen", mods()["dispo"]["st"] == "Versendet")
    page.click("#el-tile-pv", button="right"); page.wait_for_timeout(150); page.click('[data-elmodact="ren"]'); page.wait_for_timeout(200)
    page.fill(".modal input", "PV Ost"); page.click(".modal [data-ok]"); page.wait_for_timeout(250)
    check("Umbenennen behält Platz", mods()["pv"]["name"] == "PV Ost" and mods()["pv"].get("o") == 2 and tiles() == ["dispo", "pv", "schema", "legende"])
    # Rückgängig
    page.evaluate("document.activeElement?.blur()"); key("0")  # Rückgängig gilt im Editor, nicht in der Übersicht
    page.keyboard.press("Meta+z"); page.wait_for_timeout(250)
    check("Rückgängig nimmt den Namen zurück, Status bleibt", "name" not in mods().get("pv", {}) and mods()["dispo"]["st"] == "Versendet")
    # Letztes Blatt eines Moduls gelöscht: Eintrag weg, ein neues Modul gleicher Kennung erbt nichts
    page.evaluate("document.activeElement?.blur()")
    if not page.is_visible("#el-hub"): key("0")
    page.click("#el-tile-dispo", button="right"); page.click('[data-elmodact="dup"]'); page.wait_for_timeout(250)
    page.click('[data-elmst="dispo:2"]'); page.click('#el-mstpop [data-elmstset="Revision"]'); page.wait_for_timeout(200)
    key("5")  # Kachel 5 = dispo:2
    page.click("#sheet-cur", button="right"); page.wait_for_timeout(150); page.click('#sheet-ctx [data-ctxact="del"]'); page.wait_for_timeout(200)
    page.click('.modal [data-r="1"]'); page.wait_for_timeout(300)
    check("Letztes Blatt gelöscht: Modulkachel und Eintrag weg", "dispo:2" not in mods(), mods())
    key("0"); page.click("#el-addmod"); page.wait_for_timeout(150); page.click('#el-addmenu [data-elnew="dispo"]'); page.wait_for_timeout(300); key("0")
    check("Neues Modul gleicher Kennung startet Offen, ohne Platz", "dispo:2" in tiles() and "st" not in mods().get("dispo:2", {}) and "o" not in mods().get("dispo:2", {}), mods())
    check("keine Konsolenfehler", not errors, errors)
    b.close()
print("Rot:" + str(fails) if fails else "alle ok")
sys.exit(1 if fails else 0)
