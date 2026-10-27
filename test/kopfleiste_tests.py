# UI-Tests Kopfleiste elplexaCAD (Paket C, Etappe 1, CJ 21.10.2026): zwei Zeilen, kein Datei-Menü, Tabs Projekt und Zeit, rechte Gruppe je Ansicht,
# Kürzel, Speichern-Menü, Speicherstand, Konto-Kreis, Handy-Knöpfe, Platz bei 390 bis 1440 px. Vorher: node build.mjs elplexa
# Aufruf: python3 test/kopfleiste_tests.py [Ausgabeordner]
import sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from elstart import projektansicht
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
    page.goto(URL); page.wait_for_timeout(300); projektansicht(page)
    vis = lambda s: page.is_visible(s)
    inr1 = lambda sel: page.evaluate(f"!!document.querySelector('.el-r1 {sel}')")
    inr2 = lambda sel: page.evaluate(f"!!document.querySelector('.el-r2 {sel}')")
    # Zeile 1: Logo · Projekte · Zeit · Rückgängig/Wiederholen · Suchen · Konto-Kreis; kein Datei-Menü
    check("Zeile 1: Logo, Projekte, Zeit, Rückgängig, Wiederholen, Suchen, Konto-Kreis", all(inr1(x) for x in (".brand", "#el-nav-projekte", "#el-nav-zeit", "#btn-undo", "#btn-redo", "#btn-search", "#el-acct")) and all(vis(x) for x in ("#el-nav-projekte", "#el-nav-zeit", "#btn-undo", "#btn-search", "#el-acct")))
    check("Kein Datei-Menü, Neu und Öffnen nicht in der Leiste", page.locator("#el-file, #el-filemenu").count() == 0 and not vis("#btn-new") and not vis("#btn-open"))
    check("Zeile 2: Tab des Projekts, rechts Heute-Chip, Speichern, Speicherstand, Exportieren", inr2("#el-ptabs") and vis("#el-tab-proj") and all(inr2(x) and vis(x) for x in ("#el-daychip", "#btn-save", "#el-savestate", "#btn-export")))
    check("Zeile 2 unter Zeile 1", page.evaluate("document.querySelector('.el-r2').getBoundingClientRect().top >= document.querySelector('.el-r1').getBoundingClientRect().bottom - 1"))
    check("Speichern ohne Beschriftung, Hover-Text „Speichern“", not page.evaluate("[...document.querySelectorAll('#btn-save .lbl')].some((e) => e.offsetParent)") and page.get_attribute("#btn-save", "title").startswith("Speichern"))
    check("Kein Suchfeld, nur der Knopf Suchen", not vis("#topbar input") and vis("#btn-search"))
    check("Speicherstand neu: Text „Neu“, grüner Punkt, gelber Punkt aus", page.inner_text("#el-savetxt") == "Neu" and vis("#el-okdot") and not vis("#dirty"))
    check("Tipp-Zeile nennt die Kürzel ⌘S, ⇧⌘S, ⌘O", all(k in page.inner_text(".el-tip") for k in ("⌘S", "⇧⌘S", "⌘O")))
    page.screenshot(path=str(OUT / "kf_1440.png"))

    # Speichern-Menü (Rechtsklick) statt Datei-Menü: lokal, Speichern unter; online nur mit Konto
    page.click("#btn-save", button="right"); page.wait_for_timeout(150)
    items = page.evaluate("[...document.querySelectorAll('#el-savectx .mi:not([hidden])')].map((x) => x.dataset.elsaveact)")
    check("Rechtsklick auf Speichern: Lokal, Speichern unter (Online nur mit Konto)", items == ["file", "as"], items)
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    check("Esc schliesst das Menü", not vis("#el-savectx"))
    # Kürzel: ⌘O öffnet die Dateiauswahl, nicht in Textfeldern; ⌘N, ⌘T, ⌘W bleiben beim Browser
    page.evaluate("window.__open = 0; window.showOpenFilePicker = async () => { window.__open++; throw new DOMException('', 'AbortError'); }; 0")
    page.evaluate("document.activeElement?.blur()"); page.keyboard.press("Meta+o"); page.wait_for_timeout(200)
    check("⌘O öffnet die Dateiauswahl", page.evaluate("window.__open") == 1)
    page.focus('#el-hub [data-elp="OBJEKT"]'); page.keyboard.press("Meta+o"); page.wait_for_timeout(200)
    check("⌘O im Textfeld löst nichts aus", page.evaluate("window.__open") == 1)
    page.evaluate("document.activeElement?.blur()")
    prev = page.evaluate("""() => ['n', 't', 'w'].map((k) => { const e = new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })""")
    check("⌘N, ⌘T, ⌘W nicht belegt", prev == [False, False, False], prev)

    # Speicherstand folgt den Änderungen
    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('#el-addmenu [data-elnew="dispo"]'); page.wait_for_timeout(300)
    check("Nach Änderung: „Ungespeichert“ mit gelbem Punkt", page.inner_text("#el-savetxt") == "Ungespeichert" and vis("#dirty") and not vis("#el-okdot"), page.inner_text("#el-savetxt"))
    page.evaluate("window.__as = 0; window.showSaveFilePicker = async () => { window.__as++; return { name: 'test.elplexa.json', createWritable: async () => ({ write: async () => {}, close: async () => {} }), isSameEntry: async () => false }; }; 0")
    page.click("#btn-save"); page.wait_for_timeout(600)
    check("Nach Speichern: „Gespeichert“", page.inner_text("#el-savetxt") == "Gespeichert" and not vis("#dirty"), page.inner_text("#el-savetxt"))
    page.evaluate("document.activeElement?.blur()"); page.keyboard.press("Meta+Shift+s"); page.wait_for_timeout(400)
    check("⇧⌘S im Modul: Speichern unter (neue Dateiauswahl)", page.evaluate("window.__as") == 2, page.evaluate("window.__as"))

    # Im Modul: Tabs weichen, Projektname · ‹ Übersicht / Modul; Klick auf den Namen zeigt die offenen Tabs
    if vis("#el-hub"): page.evaluate("document.activeElement?.blur()"); page.keyboard.press("1"); page.wait_for_timeout(250)
    check("Im Modul: Projektname und Pfad statt Tabs, rechte Gruppe bleibt", vis("#el-projname") and vis("#el-crumb .el-back") and vis("#el-mod") and not vis("#el-ptabs") and vis("#btn-save") and vis("#btn-export") and vis("#el-daychip"))
    page.click("#el-projname"); page.wait_for_timeout(150)
    check("Klick auf den Projektnamen: Liste der offenen Tabs", vis("#el-tabmenu") and page.locator("#el-tabmenu [data-eltabgo]").count() == 1)
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    # Zeit: eigener Tab, Speichern und Export ausgeblendet, nur der Chip
    page.click("#el-nav-zeit"); page.wait_for_timeout(250)
    check("Zeit öffnet einen eigenen Tab und wählt ihn", vis("#el-tab-zeit") and page.get_attribute("#el-tab-zeit", "aria-selected") == "true" and page.get_attribute("#el-nav-zeit", "aria-current") == "page")
    check("Tab Zeit: nur «Heute X h ＋», kein Speichern, Stand, Export", vis("#el-daychip") and not vis("#btn-save") and not vis("#el-savestate") and not vis("#btn-export"))
    page.click("#el-tab-proj"); page.wait_for_timeout(200)
    check("Tab des Projekts: zurück zur Projektseite, Tab Zeit bleibt", vis(".el-mods") and vis("#el-tab-zeit") and page.get_attribute("#el-tab-proj", "aria-selected") == "true")
    page.click("#el-nav-projekte"); page.wait_for_timeout(200)
    check("Projekte: Liste, kein Tab gewählt, kein Speichern und Export", vis(".el-pwrap") and page.evaluate("[...document.querySelectorAll('.el-ptab')].every((t) => t.getAttribute('aria-selected') === 'false')") and not vis("#btn-save") and not vis("#btn-export"))
    page.click("#el-pt-cur"); page.wait_for_timeout(200)

    # Konto-Kreis: Gast (file: = nicht gesperrt); Klick führt zum Profil
    check("Konto-Kreis zeigt «Gast»", "Gast" in page.inner_text("#el-acct"))
    page.click("#el-acct"); page.wait_for_timeout(200)
    t = page.inner_text(".el-profile")
    check("Konto-Kreis führt zum Profil: Gast-Hinweis, Anmeldeformular", vis(".el-profile") and "Gast" in t and vis("#el-pf-form"), t[:120])
    page.screenshot(path=str(OUT / "kf_konto.png"))
    page.click("#el-tab-proj"); page.wait_for_timeout(200)

    # Platz: Hauptknöpfe bleiben im Bild, keine Zeile läuft über (auch iPad und Handy)
    MAIN = ['#el-nav-projekte', '#el-nav-zeit', '#el-acct', '#btn-save', '#btn-export', '#el-daychip']
    def room():
        return page.evaluate("""(ids) => { const t = document.querySelector('#topbar'), q = (s) => document.querySelector(s).getBoundingClientRect();
          return { over: t.scrollWidth > t.clientWidth, out: ids.filter((s) => !(q(s).width > 0 && q(s).left >= 0 && q(s).right <= innerWidth)) }; }""", MAIN)
    for w in (390, 768, 1024, 1100, 1280, 1440):
        page.set_viewport_size({"width": w, "height": 900}); page.wait_for_timeout(250)
        r = room()
        check(f"{w} px Projekt: ohne Überlauf, Hauptknöpfe im Bild", not r["over"] and not r["out"], r)
        page.evaluate("document.activeElement?.blur()"); page.keyboard.press("1"); page.wait_for_timeout(250)
        r2 = room()
        check(f"{w} px im Editor: ohne Überlauf, Hauptknöpfe im Bild", not r2["over"] and not r2["out"], r2)
        if w <= 860:
            check(f"{w} px: Tabs als ein Knopf mit dem Projektnamen", vis("#el-tabsel") and not vis("#el-ptabs") and page.inner_text("#el-tabsel").strip().startswith(page.evaluate("document.querySelector('#el-tab-proj').textContent")))
            page.click("#el-tabsel"); page.wait_for_timeout(150)
            n = page.locator("#el-tabmenu [data-eltabgo]").count()
            page.click('#el-tabmenu [data-eltabgo="zeit"]'); page.wait_for_timeout(250)
            check(f"{w} px: Liste der Tabs, Wahl öffnet Zeit und schliesst die Liste", n == 2 and not vis("#el-tabmenu") and vis(".el-wtab, .el-pwrap") and page.get_attribute("#el-tab-zeit", "aria-selected") == "true")
            page.click("#el-tabsel"); page.click('#el-tabmenu [data-eltabgo="proj"]'); page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / f"kf_{w}_editor.png"))
        page.evaluate("document.activeElement?.blur()"); page.keyboard.press("0"); page.wait_for_timeout(150)
    check("keine Konsolenfehler", not errors, errors)
    b.close()
print("Rot:" + str(fails) if fails else "alle ok")
sys.exit(1 if fails else 0)
