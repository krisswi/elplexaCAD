# UI-Tests Dateien im Projekt und Archiv-Schalter (CJ 27.10.2026). Vorher: node build.mjs elplexa
# Aufruf: python3 test/dateien_tests.py [Ausgabeordner]. Läuft über file:, dort ist PDF ohne Anmeldung frei (elLocked).
import sys, tempfile, re
from pathlib import Path
from playwright.sync_api import sync_playwright
from elstart import projektansicht
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "ElplexaCAD.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="dateien_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 1440, "height": 1000}).new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    files = lambda: page.evaluate("window.__schemacad.doc.project?.files || []")
    folders = lambda: page.evaluate("window.__schemacad.doc.project?.folders || []")
    rows = lambda: page.evaluate("[...document.querySelectorAll('#el-hub .el-frow')].map((r) => r.querySelector('.el-fname').innerText.replace(/\\s+/g, ' ').trim())")
    tiles = lambda: page.evaluate("[...document.querySelectorAll('#el-hub .el-tile[data-elopen]')].map((t) => t.dataset.elopen)")
    toasts = lambda: page.evaluate("[...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent)")
    idb = lambda: page.evaluate("""new Promise((res) => { const r = indexedDB.open('elplexacad-dateien', 1); r.onupgradeneeded = () => r.result.createObjectStore('pdf');
      r.onsuccess = () => { const q = r.result.transaction('pdf').objectStore('pdf').getAllKeys(); q.onsuccess = () => res(q.result); }; })""")
    def key(k, **o):
        page.evaluate("([k, o]) => (document.activeElement || window).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }))", [k, o])
        page.wait_for_timeout(150)
    def wait_files(n):
        page.wait_for_function(f"(window.__schemacad.doc.project?.files || []).length === {n}", timeout=20000); page.wait_for_timeout(200)
    def modal_ok(): page.click("#modal-root [data-ok], #modal-root [data-r='1']"); page.wait_for_timeout(200)

    page.goto(URL); page.wait_for_timeout(300); projektansicht(page)
    page.evaluate("window.__open = []; window.open = (u) => { window.__open.push(u); return {}; }; 0")
    check("ohne Dateien: Hinweis", "Noch keine Dateien" in page.inner_text("#el-hub .el-files"))

    # PDF aus der Kachel Schema, Legende, Plansatz, Offerte: jedes landet unter Dateien
    page.click("#el-tile-schema [data-elpdf]"); wait_files(1)
    f = files()[0]; today = page.evaluate("new Date().toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })")
    check("Schema-PDF abgelegt: Name, Datum, Modul, Grösse", f["n"].endswith(".pdf") and f["m"] == "Schema" and f["s"] > 1000 and re.match(r"\d{4}-\d{2}-\d{2}$", f["d"]), f)
    check("Zeile zeigt Datum, Modul, KB", rows() and today in rows()[0] and "Schema" in rows()[0] and "KB" in rows()[0], [rows(), today])
    check("PDF liegt im Browser (IndexedDB)", f["id"] in idb(), idb())
    page.click("#el-tile-legende [data-elpdf]"); wait_files(2)
    check("Legende-PDF abgelegt", files()[0]["m"] == "Legende" and "_Legende" in files()[0]["n"], files()[0])
    page.click('#el-hub [data-elact="pdf"]'); page.wait_for_timeout(300); page.click("#modal-root [data-c]"); page.wait_for_timeout(500)
    check("Plansatz abgebrochen: nichts abgelegt", len(files()) == 2, len(files()))
    page.click('#el-hub [data-elact="pdf"]'); page.wait_for_timeout(300); modal_ok(); wait_files(3)
    check("Plansatz: alle Module in der Bezeichnung", files()[0]["m"] == "Schema, Legende", files()[0])
    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('#el-addmenu [data-elnew="offerte"]'); page.wait_for_timeout(300); key("0")
    page.click("#el-tile-offerte [data-elpdf]"); wait_files(4)
    check("Offerte-PDF abgelegt", files()[0]["m"].startswith("Offerte"), files()[0])
    check("Version 30 mit Dateien", page.evaluate("window.__schemacad.doc.version") == 30)
    page.screenshot(path=str(OUT / "dateien_liste.png"), full_page=True)

    # Ordner anlegen, zuweisen, filtern, löschen
    page.click("#el-hub [data-elfnew]"); page.wait_for_timeout(200); page.fill('#modal-root [data-f="0"]', "Pläne"); modal_ok()
    fid = folders()[0]["id"] if folders() else None
    check("Ordner angelegt und gewählt", folders() == [{"id": fid, "n": "Pläne"}] and rows() == [], folders())
    page.click('#el-hub [data-elffolder=""]'); page.wait_for_timeout(150)
    leg = [x for x in files() if x["m"] == "Legende"][0]["id"]
    page.select_option(f'#el-hub [data-elfmv="{leg}"]', fid); page.wait_for_timeout(200)
    check("Datei zugewiesen", [x.get("f") for x in files() if x["id"] == leg] == [fid])
    page.click(f'#el-hub [data-elffolder="{fid}"]'); page.wait_for_timeout(150)
    check("Filter zeigt nur den Ordner", len(rows()) == 1 and "Legende" in rows()[0], rows())
    page.screenshot(path=str(OUT / "dateien_ordner.png"), full_page=True)
    page.click(f'#el-hub [data-elfdelf="{fid}"]'); page.wait_for_timeout(200); modal_ok()
    check("Ordner gelöscht, Datei ohne Ordner", folders() == [] and all("f" not in x for x in files()) and len(rows()) == 4, [folders(), rows()])

    # Öffnen und Löschen, auch wenn das PDF auf diesem Gerät fehlt
    n0 = len(page.evaluate("window.__open")); page.click(f'#el-hub [data-elfopen="{leg}"]'); page.wait_for_timeout(300)
    check("Öffnen: neuer Tab", len(page.evaluate("window.__open")) == n0 + 1)
    page.evaluate("""(id) => new Promise((res) => { const r = indexedDB.open('elplexacad-dateien', 1); r.onsuccess = () => { const t = r.result.transaction('pdf', 'readwrite'); t.objectStore('pdf').delete(id); t.oncomplete = res; }; })""", leg)
    page.click(f'#el-hub [data-elfopen="{leg}"]'); page.wait_for_timeout(300)
    check("PDF fehlt: Meldung statt Tab", any("nicht auf diesem Gerät" in t for t in toasts()) and len(page.evaluate("window.__open")) == n0 + 1, toasts())
    page.click(f'#el-hub [data-elfrm="{leg}"]'); page.wait_for_timeout(200); modal_ok()
    check("Löschen ohne PDF: Eintrag weg", len(files()) == 3 and leg not in [x["id"] for x in files()])
    sch = [x for x in files() if x["m"] == "Schema"][0]["id"]
    page.click(f'#el-hub [data-elfrm="{sch}"]'); page.wait_for_timeout(200); modal_ok()
    check("Löschen: Eintrag und PDF weg", len(files()) == 2 and sch not in idb())

    # Archiv-Schalter: archiviertes Modul ausgeblendet, Tasten 1–9 zählen nur sichtbare Kacheln
    page.click('[data-elmst="schema"]'); page.wait_for_timeout(150); page.click('#el-mstpop [data-elmstset="Archiviert"]'); page.wait_for_timeout(200)
    vis = tiles()
    check("archiviert: ausgeblendet, Schalter da", "schema" not in vis and page.locator("#el-hub [data-elarch]").count() == 1, vis)
    check("Kachel 1 hat Taste 1", page.evaluate("document.querySelector('#el-hub .el-tile[data-elopen] kbd')?.textContent") == "1")
    page.focus("#el-hub"); key("1")
    cur = page.evaluate("window.__schemacad.doc.sheets[window.__schemacad.active]?.kind")
    check("Taste 1 öffnet die erste sichtbare Kachel", cur != "schema" and cur is not None, [vis, cur])
    key("0"); page.click("#el-hub [data-elarch]"); page.wait_for_timeout(200)
    check("Schalter an: alle Kacheln", "schema" in tiles(), tiles())
    page.screenshot(path=str(OUT / "dateien_archiv.png"), full_page=True)
    b.close()
real = [e for e in errors if "favicon" not in e]
check("keine JS-Fehler", not real, real)
print(f"Bilder: {OUT}")
sys.exit(1 if fails else 0)
