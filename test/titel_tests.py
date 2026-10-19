# UI-Tests für Titelseite und Inhaltsverzeichnis (Ausbau UI Schritt 3). Aufruf aus web-src: python3 test/titel_tests.py [Ausgabeordner]
import sys, json, struct, zlib, tempfile, datetime
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="titel_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
def png(path, w=40, h=16):  # kleines rotes PNG als Logo
    raw = b"".join(b"\x00" + b"\xc0\x20\x20" * w for _ in range(h))
    ch = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(raw)) + ch(b"IEND", b""))
today = datetime.date.today().strftime("%d.%m.%Y")
# Alte Datei (Version 2): Blatt 1 mit Gerät 1F2, Blatt 2, verschiedene Daten
OLD = OUT / "alt.schemacad.json"
OLD.write_text(json.dumps({"format": "schemacad", "version": 2, "active": 0, "nextId": 10, "sheets": [
    {"meta": {"BLATT": "1", "OBJEKT": "EFH Alt", "DATUM": "01.10.2026", "TITEL": "Hauptverteilung"}, "items": [{"id": 1, "type": "symbol", "sym": "LS_1P", "x": 50, "y": 150, "rot": 0, "attrs": {"BMK": "", "STROM": "13A", "CHAR": "C"}}]},
    {"meta": {"BLATT": "2", "OBJEKT": "EFH Alt", "DATUM": "02.10.2026", "TITEL": "Unterverteilung"}, "items": []}]}))
LOGO = OUT / "logo.png"; png(LOGO)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    D = lambda: page.evaluate("window.__schemacad.doc")
    kind = lambda: page.evaluate("window.__schemacad.kind")
    cur = lambda: page.inner_text("#sheet-cur")
    def go(i): page.click("#sheet-cur"); page.click(f'#sheet-menu [data-sheet="{i}"]'); page.wait_for_timeout(120)
    def fill(sel, v): page.locator(sel).fill(v); page.locator("#svg").focus(); page.wait_for_timeout(80)
    def meta(tag, v, proj=False):  # Schriftfeld seit Wunsch D1 (19.10.2026) rechts ohne Auswahl
        for _ in range(2):  # Esc: erst Werkzeug, dann Auswahl weg
            if page.locator(f'#right input[data-meta="{tag}"]').count() == 0: page.locator("#svg").focus(); page.keyboard.press("Escape"); page.wait_for_timeout(60)
        if proj and not page.locator("#right details.proj").evaluate("e => e.open"): page.click("#right details.proj summary")
        page.locator(f'#right input[data-meta="{tag}"]').fill(v); page.keyboard.press("Escape"); page.wait_for_timeout(80)
    page.goto(URL); page.wait_for_timeout(300)
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    d = D()
    check("Neu: Titelseite, Inhalt, Blatt 3, aktiv ist Blatt 3", [s.get("kind") for s in d["sheets"]] == ["title", "toc", None, "legend"] and d["active"] == 2 and "Blatt 3" in cur() and "3 von 4" in cur(), cur())
    check("Schemablatt: Schriftfeld rechts (D1), Projektangaben eingeklappt", page.locator("#right details.proj").count() == 1 and not page.locator("#right details.proj").evaluate("e => e.open") and page.locator('#right input[data-meta="TITEL"]').is_visible() and page.locator("#btn-blatt").count() == 0)
    # Titelseite: Projekt, Bauherr, Firma
    page.keyboard.press("PageUp"); page.keyboard.press("PageUp"); page.wait_for_timeout(120)
    check("Titelseite: keine Werkzeuge, kein Raster, Felder rechts", kind() == "title" and "Titelseite" in cur() and page.locator('[data-tool]').count() == 0 and page.is_hidden("#grid-size") and page.is_hidden("#mag-on") and page.locator('[data-info="BAUHERR"]').count() == 1)
    fill('#right input[data-meta="OBJEKT"]', "EFH Sonnenweg 3"); fill('#right input[data-meta="AUFTRAG"]', "A-2026-17")
    fill('input[data-info="BAUHERR"]', "Familie Muster"); fill('textarea[data-info="BAUHERR_ADR"]', "Sonnenweg 3\n3000 Bern")
    fill('input[data-info="FIRMA"]', "Elektro CJ"); fill('textarea[data-info="FIRMA_ADR"]', "Werkstrasse 1\n3000 Bern")
    d = D()
    check("Projektangaben gelten für alle Blätter", all(s["meta"]["OBJEKT"] == "EFH Sonnenweg 3" and s["meta"]["AUFTRAG"] == "A-2026-17" for s in d["sheets"]))
    check("Bauherr und Firma auf der Titelseite", d["sheets"][0]["info"]["BAUHERR_ADR"] == "Sonnenweg 3\n3000 Bern" and "Familie Muster" in page.text_content("#sheet") and "Werkstrasse 1" in page.text_content("#sheet"))
    check("Firma in der App gemerkt", json.loads(page.evaluate("localStorage.getItem('schemacad.firma.v1')"))["FIRMA"] == "Elektro CJ")
    # Änderungsindex
    page.click('[data-deck="addrev"]'); page.wait_for_timeout(80)
    fill('input[data-rev="0:t"]', "Erstausgabe")
    page.click('[data-deck="addrev"]'); page.wait_for_timeout(80)
    revs = D()["sheets"][0]["info"]["revs"]
    check("Änderung A und B mit heutigem Datum", [r["i"] for r in revs] == ["A", "B"] and revs[0]["d"] == today and revs[0]["t"] == "Erstausgabe", revs)
    page.click('[data-deck="delrev"][data-i="1"]'); page.wait_for_timeout(80)
    check("Änderung löschen", len(D()["sheets"][0]["info"]["revs"]) == 1 and "Erstausgabe" in page.text_content("#sheet"))
    page.keyboard.press("Control+z"); page.wait_for_timeout(80)
    check("Rückgängig holt die Änderung zurück", len(D()["sheets"][0]["info"]["revs"]) == 2)
    page.keyboard.press("Control+Shift+z"); page.wait_for_timeout(80)
    # Logo
    with page.expect_file_chooser() as fc: page.click('[data-deck="logo"]')
    fc.value.set_files(str(LOGO)); page.wait_for_timeout(300)
    check("Logo geladen und gezeichnet", D()["sheets"][0]["info"].get("logo", "").startswith("data:image/png;base64,") and page.locator("#sheet image").count() == 1)
    page.screenshot(path=str(OUT / "t1_titelseite.png"))
    # Klick auf die Titelseite zeichnet nichts
    page.keyboard.press("t"); page.mouse.click(700, 450); page.wait_for_timeout(100)
    check("Klick auf die Titelseite legt nichts an", D()["sheets"][0]["items"] == [] and page.locator("#texteditor").is_hidden())
    # Schemablatt: Projektfeld dort ändern wirkt auf die Titelseite
    go(2); meta("OBJEKT", "EFH Sonnenweg 3a", proj=True)
    check("Schemablatt: Raster wieder sichtbar", page.is_visible("#grid-size") and page.is_visible("#mag-on"))
    check("Projektfeld auf dem Schemablatt ändert die Titelseite", D()["sheets"][0]["meta"]["OBJEKT"] == "EFH Sonnenweg 3a" and "EFH Sonnenweg 3a" in page.text_content("#sheet"))
    check("Titelseite und Inhalt lassen sich nicht löschen, letztes Schemablatt auch nicht", page.is_disabled('[data-act="delsheet"]'))
    # Weitere Blätter, Inhaltsverzeichnis
    page.click("[data-addsheet]"); page.wait_for_timeout(120)
    meta("TITEL", "Unterverteilung")
    check("Neues Blatt 4 mit Projektangaben", D()["sheets"][3]["meta"]["BLATT"] == "4" and D()["sheets"][3]["meta"]["OBJEKT"] == "EFH Sonnenweg 3a")
    go(1)
    rows = page.locator("#sheet .toc-row")
    check("Inhalt: eine Zeile je Blatt mit Titel", rows.count() == 5 and "Sicherungslegende" in rows.nth(4).text_content() and "Unterverteilung" in rows.nth(3).text_content() and "Inhaltsverzeichnis" in rows.nth(1).text_content(), rows.all_text_contents())
    page.screenshot(path=str(OUT / "t2_inhalt.png"))
    bx = rows.nth(3).bounding_box(); page.mouse.click(bx["x"] + bx["width"] / 2, bx["y"] + bx["height"] / 2); page.wait_for_timeout(150)
    check("Klick auf eine Zeile springt zum Blatt", D()["active"] == 3 and "Blatt 4" in cur())
    # PDF und DXF
    n = page.evaluate("window.__schemacad.buildPrint()")
    t = page.evaluate("[...document.querySelectorAll('#printroot > svg')].map(s=>s.textContent)")
    check("PDF: Titelseite und Inhalt vorne", n == 5 and "Familie Muster" in t[0] and "Unterverteilung" in t[1], [n, [x[:60] for x in t]])
    page.evaluate("document.querySelector('#printroot').innerHTML=''")
    dl = []; page.on("download", lambda x: dl.append(x))
    page.click("#btn-export"); page.click("#btn-dxf-all"); page.wait_for_timeout(1000)
    import zipfile, io  # seit 16.10. ohne Ordnerwahl: eine ZIP-Datei im Download-Ordner
    zn = sorted(zipfile.ZipFile(io.BytesIO(open(dl[0].path(), "rb").read())).namelist()) if len(dl) == 1 else []
    check("DXF alle Blätter: ohne Titelseite und Inhalt", [n[-12:] for n in zn] == ["_Blatt-3.dxf", "_Blatt-4.dxf"], [x.suggested_filename for x in dl] + zn)
    # Speichern und Öffnen
    with page.expect_download() as dd: page.click("#btn-save")
    f = OUT / "neu.schemacad.json"; dd.value.save_as(f)
    saved = json.loads(f.read_text()); before = D()
    check("Gespeichert: Version 7 mit Titelseite (Hauptlinien seit 16.10.)", saved["version"] == 7 and saved["sheets"][0]["kind"] == "title" and saved["sheets"][0]["info"]["FIRMA"] == "Elektro CJ")
    page.click("#btn-new"); page.click('[data-start="schema"]'); page.wait_for_timeout(150)
    check("Neue Datei übernimmt Firma und Logo", D()["sheets"][0]["info"]["FIRMA"] == "Elektro CJ" and D()["sheets"][0]["info"].get("logo") and D()["sheets"][0]["info"]["BAUHERR"] == "")
    with page.expect_file_chooser() as fc: page.click("#btn-open")
    fc.value.set_files(str(f)); page.wait_for_timeout(300)
    check("Round-Trip gleich", D()["sheets"] == before["sheets"])
    # Alte Datei: Titelseite davor, Blätter rücken um 2, BMK folgt, Meldung
    with page.expect_file_chooser() as fc: page.click("#btn-open")
    fc.value.set_files(str(OLD)); page.wait_for_timeout(300)
    d = D(); toasts = " ".join(page.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent)"))
    check("Alte Datei: Blätter 1, 2, 3, 4", [s["meta"]["BLATT"] for s in d["sheets"]] == ["1", "2", "3", "4", "5"] and d["sheets"][0]["kind"] == "title", [s["meta"]["BLATT"] for s in d["sheets"]])
    check("Alte Datei: BMK 1F2 wird 3F2", d["sheets"][2]["items"][0]["attrs"]["BMK"] == "3F2", d["sheets"][2]["items"][0]["attrs"])
    check("Alte Datei: Meldung zu Nummern und abweichendem Datum", "rücken um 2" in toasts and "Datum" in toasts and page.is_visible("#dirty"), toasts)
    check("Alte Datei: Datum vom ersten Schemablatt, Titel je Blatt bleibt", all(s["meta"]["DATUM"] == "01.10.2026" for s in d["sheets"]) and d["sheets"][3]["meta"]["TITEL"] == "Unterverteilung" and d["active"] == 2)
    # Umbau (CJ 15.10.): nur mit Schemablatt, löschbar, wieder einfügbar
    kinds = lambda: [s.get("kind") or "schema" for s in D()["sheets"]]
    page.click("#btn-new"); page.click('[data-start="pv"]'); page.wait_for_timeout(150)
    if page.locator(".modal").count(): page.click('.modal [data-r="1"]'); page.wait_for_timeout(150)
    check("Umbau: neuer Stringplan ohne Titelseite und Inhalt", kinds() == ["pv"], kinds())
    page.click("#sheet-add", button="right"); page.click('#add-menu [data-new="sheet"]'); page.wait_for_timeout(200)  # + legt jetzt den aktuellen Typ an (CJ 16.10.)
    check("Umbau: erstes Schemablatt bringt Titelseite und Inhalt (Blatt 3)", kinds() == ["title", "toc", "schema", "legend", "pv"] and D()["sheets"][2]["meta"]["BLATT"] == "3" and kind() == "schema", (kinds(), cur()))
    go(0); page.click('#right [data-deck="deldeck"]'); page.wait_for_selector(".modal"); t = page.inner_text(".modal"); page.click('.modal [data-r="1"]'); page.wait_for_timeout(150)
    check("Umbau: Titelseite gelöscht, aktiv das Blatt danach", kinds() == ["toc", "schema", "legend", "pv"] and D().get("noTitle") is True and kind() == "toc" and "Titelseite löschen" in t, (kinds(), t))
    page.click('#right [data-deck="deldeck"]'); page.wait_for_selector(".modal"); page.click('.modal [data-r="1"]'); page.wait_for_timeout(150)
    check("Umbau: Inhaltsverzeichnis gelöscht", kinds() == ["schema", "legend", "pv"] and D().get("noToc") is True, kinds())
    page.click("#sheet-add"); page.wait_for_timeout(200)
    check("Umbau: neues Schemablatt bringt sie nicht zurück", kinds() == ["schema", "schema", "legend", "pv"], kinds())
    go(0); meta("OBJEKT", "Ohne Titel", proj=True)
    check("Umbau: ohne Titelseite gelten Projektangaben für alle Blätter", all(s["meta"]["OBJEKT"] == "Ohne Titel" for s in D()["sheets"]), [s["meta"]["OBJEKT"] for s in D()["sheets"]])
    with page.expect_download() as dd: page.click("#btn-save")
    fn = OUT / "ohne_titel.schemacad.json"; dd.value.save_as(fn)
    with page.expect_file_chooser() as fc: page.click("#btn-open")
    fc.value.set_files(str(fn)); page.wait_for_timeout(300)
    check("Umbau: nach dem Öffnen bleiben sie gelöscht", kinds() == ["schema", "schema", "legend", "pv"] and json.loads(fn.read_text())["version"] == 7, kinds())
    page.keyboard.press("Meta+z"); page.wait_for_timeout(100)
    page.click("#sheet-add", button="right"); page.wait_for_timeout(150)
    check("Umbau: + Menü bietet „Titelseite und Inhalt“", page.is_visible('#add-menu [data-new="deck"]'))
    page.click('#add-menu [data-new="deck"]'); page.wait_for_timeout(200)
    check("Umbau: wieder eingefügt, Titelseite aktiv", kinds() == ["title", "toc", "schema", "schema", "legend", "pv"] and kind() == "title" and "noTitle" not in D(), kinds())
    page.keyboard.press("Meta+z"); page.wait_for_timeout(150)
    check("Umbau: Rückgängig entfernt sie wieder", kinds() == ["schema", "schema", "legend", "pv"] and D().get("noTitle") is True, kinds())
    page.click("#sheet-add", button="right"); page.wait_for_timeout(150); page.click('#add-menu [data-new="deck"]'); page.wait_for_timeout(200)
    go(2); page.click('#right [data-act="delsheet"]'); page.wait_for_selector(".modal"); page.click('.modal [data-r="1"]'); page.wait_for_timeout(150)
    go(2); page.click('#right [data-act="delsheet"]') if page.locator('#right [data-act="delsheet"]:not([disabled])').count() else None
    if page.locator(".modal").count(): page.click('.modal [data-r="1"]'); page.wait_for_timeout(150)
    check("Umbau: letztes Schemablatt gelöscht: Titelseite, Inhalt, Legende entfallen", kinds() == ["pv"], kinds())
    page.click("#sheet-add", button="right"); page.wait_for_timeout(150)
    check("Umbau: ohne Schemablatt kein Menüpunkt „Titelseite und Inhalt“", not page.is_visible('#add-menu [data-new="deck"]'))
    page.keyboard.press("Escape")
    # Gruppe D, Datenverlust: Stringplan-Datei mit Titelseite (Stand vor dem Umbau) öffnen, speichern, öffnen, speichern
    pj = {"GEZEICHNET": "CJ", "DATUM": "15.10.2026", "OBJEKT": "EFH Sonne", "AUFTRAG": "A-7", "SCHEMA": "PV"}
    oldpv = {"format": "schemacad", "version": 5, "active": 2, "nextId": 10, "sheets": [
        {"kind": "title", "meta": {**pj, "TITEL": "Titelseite", "BLATT": "1", "INDEX": "B"}, "items": [], "info": {"BAUHERR": "Hans Muster", "BAUHERR_ADR": "", "FIRMA": "Elektro CJ", "FIRMA_ADR": "Weg 1", "logo": "data:image/png;base64,iVBORw0KGgo=", "revs": [{"i": "B", "d": "01.10.2026", "t": "PV ergänzt", "n": "CJ"}]}},
        {"kind": "toc", "meta": {**pj, "TITEL": "Inhaltsverzeichnis", "BLATT": "2", "INDEX": "B"}, "items": []},
        {"kind": "pv", "sid": 1, "meta": {**pj, "TITEL": "Dach Süd", "BLATT": "5", "INDEX": "C"}, "items": []},
        {"kind": "pvtab", "meta": {**pj, "TITEL": "Übersicht", "BLATT": "6", "INDEX": "C"}, "items": []},
        {"kind": "legend", "meta": {**pj, "TITEL": "Sicherungslegende", "BLATT": "3", "INDEX": "B"}, "items": []}]}
    fo = OUT / "alt_pv_titel.schemacad.json"; fo.write_text(json.dumps(oldpv))
    def open_save(src, dst):
        with page.expect_file_chooser() as fc:
            page.click("#btn-open"); page.wait_for_timeout(150)
            if page.locator(".modal").count(): page.click('.modal [data-r="1"]')  # ungespeicherte Änderungen verwerfen
        fc.value.set_files(str(src)); page.wait_for_timeout(300)
        t = " ".join(page.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent)"))
        with page.expect_download() as dd: page.click("#btn-save")
        dd.value.save_as(dst); return json.loads(dst.read_text()), t
    s1, t1 = open_save(fo, OUT / "alt_pv_1.schemacad.json"); s2, _ = open_save(OUT / "alt_pv_1.schemacad.json", OUT / "alt_pv_2.schemacad.json")
    heads = lambda o: [sh["meta"] for sh in o["sheets"] if sh.get("kind") in ("pv", "pvtab")]
    check("Gruppe D: Plankopf von Stringplan und Stringübersicht bleibt gleich (öffnen, speichern, öffnen, speichern)", heads(s1) == heads(oldpv) and heads(s2) == heads(oldpv) and "Firma, Logo und Änderungsindex" in t1, (heads(s2), t1))
    check("Gruppe D: Bauherr, Firma, Logo, Änderungsindex bleiben in der Datei", s2.get("info", {}).get("FIRMA") == "Elektro CJ" and s2["info"].get("logo") and s2["info"]["revs"][0]["i"] == "B" and s2 == s1, s2.get("info"))
    page.click("#sheet-add", button="right"); page.click('#add-menu [data-new="sheet"]'); page.wait_for_timeout(200)  # + legt jetzt den aktuellen Typ an (CJ 16.10.)
    check("Gruppe D: Schemablatt dazu: Titelseite mit den gespeicherten Angaben", kinds()[0] == "title" and D()["sheets"][0]["info"]["BAUHERR"] == "Hans Muster" and "info" not in D(), D()["sheets"][0].get("info"))
    page.set_viewport_size({"width": 400, "height": 800}); go(0); page.wait_for_timeout(150)
    page.screenshot(path=str(OUT / "t3_schmal.png"))
    b.close()
check("keine JS-Fehler", not errors, errors)
print("FEHLER:" if fails else "ALLE OK", fails, "| Ausgaben:", OUT)
sys.exit(1 if fails else 0)
