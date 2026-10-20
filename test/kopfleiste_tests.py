# UI-Tests Kopfleiste elplexaCAD (Übersicht Etappe 2a, CJ 20.10.2026): Datei-Menü, Speicherstand, Konto-Kreis, Platz bei 1100 bis 1440 px. Vorher: node build.mjs elplexa
# Aufruf: python3 test/kopfleiste_tests.py [Ausgabeordner]
import sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "ElplexaCAD.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="kopf_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True).new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(URL); page.wait_for_timeout(300)
    vis = lambda s: page.is_visible(s)
    check("Datei, Speicherstand, Konto-Kreis, Speichern-Symbol da; Neu und Öffnen nicht mehr in der Leiste", all(vis(s) for s in ("#el-file", "#el-savestate", "#el-acct", "#btn-save")) and not vis("#btn-new") and not vis("#btn-open"))
    check("Speichern ohne Beschriftung, Hover-Text „Speichern“", not page.evaluate("[...document.querySelectorAll('#btn-save .lbl')].some((e) => e.offsetParent)") and page.get_attribute("#btn-save", "title").startswith("Speichern"))
    check("Kein Suchfeld, nur der Knopf Suchen", not vis("#topbar input") and vis("#btn-search"))
    check("Speicherstand neu: Text „Neu“, grüner Punkt, gelber Punkt aus", page.inner_text("#el-savetxt") == "Neu" and vis("#el-okdot") and not vis("#dirty"))
    page.screenshot(path=str(OUT / "kf_1440.png"))

    # Datei-Menü
    page.click("#el-file"); page.wait_for_timeout(120)
    items = page.evaluate("[...document.querySelectorAll('#el-filemenu .mi:not([hidden])')].map((x) => x.dataset.elfile)")
    check("Datei-Menü: Neu, Öffnen, Speichern, Speichern unter (Online nur mit Konto)", items == ["new", "open", "save", "as"], items)
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    check("Esc schliesst das Datei-Menü", not vis("#el-filemenu"))
    page.click("#el-file"); page.click('#el-filemenu [data-elfile="new"]'); page.wait_for_timeout(200)
    check("Datei > Neu in der Übersicht = Neues Projekt", vis(".modal") or vis("#el-hub"))
    page.keyboard.press("Escape"); page.wait_for_timeout(150)
    page.evaluate("window.__open = 0; window.showOpenFilePicker = async () => { window.__open++; throw new DOMException('', 'AbortError'); }; 0")
    page.click("#el-file"); page.click('#el-filemenu [data-elfile="open"]'); page.wait_for_timeout(200)
    check("Datei > Öffnen: Dateiauswahl", page.evaluate("window.__open") == 1)

    # Speicherstand folgt den Änderungen
    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('#el-addmenu [data-elnew="dispo"]'); page.wait_for_timeout(300)
    check("Nach Änderung: „Ungespeichert“ mit gelbem Punkt", page.inner_text("#el-savetxt") == "Ungespeichert" and vis("#dirty") and not vis("#el-okdot"), page.inner_text("#el-savetxt"))
    page.evaluate("window.showSaveFilePicker = async () => ({ name: 'test.elplexa.json', createWritable: async () => ({ write: async () => {}, close: async () => {} }), isSameEntry: async () => false }); 0")
    page.click("#btn-save"); page.wait_for_timeout(300)
    page.wait_for_timeout(300)
    check("Nach Speichern: „Gespeichert“", page.inner_text("#el-savetxt") == "Gespeichert" and not vis("#dirty"), page.inner_text("#el-savetxt"))

    # Konto-Kreis: Gast (file: = nicht gesperrt); Klick führt zum Reiter Profil
    check("Konto-Kreis zeigt «Gast»", "Gast" in page.inner_text("#el-acct"))
    page.click("#el-acct"); page.wait_for_timeout(200)
    t = page.inner_text(".el-profile")
    check("Konto-Kreis führt zum Reiter Profil: Gast-Hinweis, Anmeldeformular", page.get_attribute("#el-tab-profil", "aria-selected") == "true" and "Gast" in t and vis("#el-pf-form"), t[:120])
    page.screenshot(path=str(OUT / "kf_konto.png"))

    # Platz: Hauptknöpfe bleiben im Bild, Leiste läuft nicht über
    for w in (1100, 1280, 1440):
        page.set_viewport_size({"width": w, "height": 900}); page.wait_for_timeout(250)
        r = page.evaluate("""() => { const q = (s) => document.querySelector(s).getBoundingClientRect(), t = document.querySelector('#topbar');
          return { over: t.scrollWidth > t.clientWidth, ids: ['#el-file', '#btn-save', '#btn-export', '#el-acct'].map((s) => [s, q(s).left >= 0 && q(s).right <= innerWidth]) }; }""")
        check(f"{w} px: Leiste ohne Überlauf, Datei, Speichern, Exportieren, Konto im Bild", not r["over"] and all(x[1] for x in r["ids"]), r)
        # auch im Editor (Schema offen), mit Blatt-Knöpfen
        page.keyboard.press("1"); page.wait_for_timeout(200)
        r2 = page.evaluate("""() => { const t = document.querySelector('#topbar'), q = (s) => document.querySelector(s).getBoundingClientRect();
          return { over: t.scrollWidth > t.clientWidth, ids: ['#el-file', '#btn-save', '#btn-export', '#el-acct'].map((s) => [s, q(s).left >= 0 && q(s).right <= innerWidth]) }; }""")
        check(f"{w} px im Editor: ohne Überlauf, Hauptknöpfe im Bild", not r2["over"] and all(x[1] for x in r2["ids"]), r2)
        page.screenshot(path=str(OUT / f"kf_{w}_editor.png"))
        page.keyboard.press("0"); page.wait_for_timeout(150)
    check("keine Konsolenfehler", not errors, errors)
    b.close()
print("Rot:" + str(fails) if fails else "alle ok")
sys.exit(1 if fails else 0)
