# UI-Tests mit Headless-Chromium. Aufruf aus dem Ordner web bzw. web-src: python3 test/ui_tests.py
import os, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent  # web-src bzw. web
URL = (ROOT / "dist" / "schemacad.html").as_uri() if (ROOT / "dist").exists() else (ROOT.parent / "schemacad.html").as_uri()
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(URL); page.wait_for_timeout(300)
    page.click('[data-start="schema"]')  # Startauswahl
    def pt(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.evaluate("(()=>{const r=document.querySelector('#svg').getBoundingClientRect();return {l:r.left,t:r.top}})()")
        return r["l"] + v["x"] + x * v["z"], r["t"] + v["y"] + (210 - y) * v["z"]
    def click(x, y, **k): X, Y = pt(x, y); page.mouse.move(X, Y); page.mouse.click(X, Y, **k)
    M = lambda: page.evaluate("window.__schemacad.model")
    def go(i): page.click("#sheet-cur"); page.click(f'#sheet-menu [data-sheet="{i}"]')  # Blatt über die Blattliste wählen
    def add_dispo(): page.click("#sheet-add", button="right"); page.click('[data-new="dispo"]')
    def meta(tag, v, proj=False):  # Schriftfeld seit UI Schritt 6 im Fenster oben (Knopf „Schriftfeld“), danach schliessen
        if page.is_hidden("#pv-pop"): page.click("#btn-blatt"); page.wait_for_timeout(60)
        if proj and not page.locator("#pv-pop details.proj").evaluate("e => e.open"): page.click("#pv-pop details.proj summary")
        page.locator(f'#pv-pop input[data-meta="{tag}"]').fill(v); page.keyboard.press("Escape"); page.wait_for_timeout(80)
    of = lambda t: [i for i in M()["items"] if i["type"] == t and not i.get("main")]  # ohne die automatischen Verweise der Grundverkabelung

    # Grundverkabelung beim Start
    m = M(); base = [i for i in m["items"] if i.get("tag") == "grund"]
    check("Grundverkabelung ohne Klemmen", len(base) == 10 and len(of("terminals")) == 0)
    check("5 Leiterlinien (L1,L2,L3,N,PE)", sorted(i["kind"] for i in of("wire")) == ["netz", "netz", "netz", "neutral", "pe"])
    page.click("#btn-haupt"); check("Fenster Hauptlinien: Grundverkabelung vorhanden, kein Einfügen-Knopf", page.locator('#pv-pop [data-act="base"]').count() == 0 and page.locator("#pv-pop [data-mainr]").count() == 1); page.keyboard.press("Escape")
    check("Blatt startet sauber", not page.evaluate("!document.querySelector('#dirty').hidden"))
    page.screenshot(path="shots/01_start.png")

    # Klemmenzahl folgt dem Kabel
    page.click('[data-sym="TERMINALS"]'); click(40, 45); page.keyboard.press("Escape"); click(41, 41); page.wait_for_timeout(100)
    check("Klemmenleiste gewählt", page.locator('input[data-term="cable"]').count() == 1)
    page.locator('input[data-term="cable"]').fill("7x2.5mm2")
    t = of("terminals")[0]; check("7x2.5 gibt 7 Klemmen", t["n"] == 7 and "7 Klemmen" in page.inner_text("[data-cablenote]"))
    page.locator('input[data-term="name"]').fill("Zuleitung TT")
    page.locator('input[data-term="cable"]').fill("xx")
    check("ungültiges Kabel behält 7", of("terminals")[0]["n"] == 7 and "nicht erkannt" in page.inner_text("[data-cablenote]"))
    page.locator('input[data-term="cable"]').fill("3x1.5")
    check("3x1.5 gibt 3 Klemmen", of("terminals")[0]["n"] == 3)
    page.screenshot(path="shots/02_klemmen.png")

    # Polzahl beim Setzen und danach
    page.click('[data-sym="LS_4P"]'); page.select_option('[data-placepoles]', "LS_2P"); click(100, 150); page.keyboard.press("Escape")
    check("LS 2-polig gesetzt", [i["sym"] for i in of("symbol")] == ["LS_2P"])
    click(102, 140); page.select_option('[data-sympoles]', "LS_4P")
    check("Polzahl nachträglich geändert", of("symbol")[0]["sym"] == "LS_4P")
    page.keyboard.press("Escape")

    # Automatik: Klemmen unter dem Gerät (LS 4-polig gibt 4 + PE), Nummer nach Blatt, Spalte
    ts = [x for x in of("terminals") if "of" in x]
    check("Auto-Klemmen unter LS", len(ts) == 1 and ts[0]["n"] == 5 and ts[0]["y"] == 45 and ts[0]["x"] == of("symbol")[0]["x"], ts)
    check("BMK 3F3 (Blatt 3 nach Titelseite und Inhalt, Spalte 3), Klemme 3X3", of("symbol")[0]["attrs"]["BMK"] == "3F3" and ts[0]["bmk"] == "3X3", [of("symbol")[0]["attrs"], ts[0]["bmk"]])
    # Leiterbündel: 4 Leiter von LS (100,130) nach unten
    page.keyboard.press("l"); page.select_option('[data-newbundle]', "4")
    click(100, 130); click(100, 100); click(100, 100)
    ws = [w for w in of("wire") if "bundle" in w]
    check("4 Leiter im Bündel", len(ws) == 4 and len({w["bundle"] for w in ws}) == 1, ws)
    check("Leiter 5 mm Abstand, Weg 0 auf Klickpunkt", sorted(w["pts"][0][0] for w in ws) == [100, 105, 110, 115])
    check("Kinds L,L,L,N", [w["kind"] for w in ws] == ["leitung", "leitung", "leitung", "neutral"])
    page.keyboard.press("v"); click(105, 115)
    check("Klick wählt ganzes Bündel", page.evaluate("document.querySelectorAll('#overlay polyline.sel-a').length") == 4)
    page.keyboard.press("Escape"); page.keyboard.down("Alt"); click(105, 115); page.keyboard.up("Alt")
    check("Alt wählt einzelnen Leiter", page.evaluate("document.querySelectorAll('#overlay polyline.sel-a').length") == 1)
    page.keyboard.press("Escape")

    # Neue Klemmenleiste setzen
    page.click('[data-sym="TERMINALS"]'); click(150, 100); page.keyboard.press("Escape")
    check("freie Klemmenleiste", len(of("terminals")) == 3 and of("terminals")[2]["n"] == 5 and "of" not in of("terminals")[2])

    # Undo/Redo, Duplizieren (Bündel bleibt Bündel)
    n0 = len(M()["items"])
    page.keyboard.press("v"); click(105, 115); page.keyboard.press("Control+d")
    dup = [w for w in of("wire") if "bundle" in w]
    check("Duplikat mit neuer Bündel-ID", len(dup) == 8 and len({w["bundle"] for w in dup}) == 2)
    page.keyboard.press("Control+z"); check("Undo", len(M()["items"]) == n0)
    page.keyboard.press("Escape")

    # Text
    page.keyboard.press("t"); click(30, 100); page.wait_for_timeout(100); page.keyboard.type("Kabel äöü"); page.keyboard.press("Enter")
    check("Text mit Umlauten", any(i["s"] == "Kabel äöü" for i in of("text")))

    # Export und JSON
    with page.expect_download() as d: page.click("#btn-export"); page.click("#btn-dxf")
    d.value.save_as("test/ui_out.dxf")
    with page.expect_download() as d2: page.click("#btn-save")
    d2.value.save_as("test/ui_out.schemacad.json")
    before = M()
    page.click("#btn-new"); page.wait_for_timeout(100); page.click('[data-start="schema"]')
    if page.locator(".modal").count(): page.click('.modal [data-r="1"]')
    check("Neues Blatt hat Grundverkabelung", len([i for i in M()["items"] if i.get("tag") == "grund"]) > 0 and len(M()["items"]) == 10)
    with page.expect_file_chooser() as fc: page.click("#btn-open")
    fc.value.set_files("test/ui_out.schemacad.json"); page.wait_for_timeout(300)
    after = M(); check("JSON-Round-Trip gleich", before["items"] == after["items"] and before["meta"] == after["meta"])
    page.screenshot(path="shots/03_full.png")
    # Kaputte Datei
    open("test/bad.json", "w").write('{"format":"schemacad","version":1,"items":[{"type":"symbol","sym":"XX","x":1,"y":2}]}')
    with page.expect_file_chooser() as fc: page.click("#btn-open")
    fc.value.set_files("test/bad.json"); page.wait_for_timeout(300)
    check("Defekte Datei gemeldet", "unbekanntes" in " ".join(page.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent)")))
    # Nummerierung, Stapel, Verschieben, Fang (auf frischem Blatt)
    page.click("#btn-new"); page.wait_for_timeout(100); page.click('[data-start="schema"]')
    if page.locator(".modal").count(): page.click('.modal [data-r="1"]')
    meta("BLATT", "10")
    bm = lambda: sorted((i["y"], i["attrs"]["BMK"]) for i in of("symbol"))
    page.click('[data-sym="LS_4P"]'); click(100, 160); click(100, 120); page.keyboard.press("Escape")
    check("Stapel: oben 10F3, darunter 10F3.1", bm() == [(120, "10F3.1"), (160, "10F3")], bm())
    page.click('[data-sym="LS_4P"]'); click(100, 180); page.keyboard.press("Escape")
    check("neues oberstes Gerät wird 10F3", [b for _, b in bm()] == ["10F3.2", "10F3.1", "10F3"], bm())
    xs = sorted(x["bmk"] for x in of("terminals") if "of" in x)
    check("nur eine Klemmenleiste pro Spalte (10X3, 5 Klemmen)", xs == ["10X3"] and [x["n"] for x in of("terminals") if "of" in x] == [5], xs)
    page.keyboard.press("v"); click(101, 150)  # oberes Gerät wählen (Symbol 160..140)
    for _ in range(3): page.keyboard.press("Shift+ArrowRight")
    s0 = [i for i in of("symbol") if i["y"] == 160][0]
    check("Gerät in Spalte 4 verschoben", s0["attrs"]["BMK"] == "10F4", s0)
    page.keyboard.press("Delete")
    check("Löschen entfernt Gerät", len(of("symbol")) == 2)
    page.click('[data-sym="NH_4P"]'); click(250, 160); page.click('[data-sym="RCBO_4P"]'); click(200, 160); page.keyboard.press("Escape")
    check("NH und RCBO gesetzt mit Nummer", sorted(i["sym"] for i in of("symbol"))[-2:] == ["NH_4P", "RCBO_4P"] and all(i["attrs"]["BMK"].startswith("10F") for i in of("symbol")))
    page.click('[data-sym="LS_4P"]'); page.select_option('[data-placepoles]', "LS_3P"); click(150, 120); page.select_option('[data-placepoles]', "LS_4P"); click(150, 80); page.keyboard.press("Escape")
    p34 = {i["sym"]: i["x"] for i in of("symbol") if i["sym"] in ("LS_3P", "LS_4P") and i["x"] > 140}
    check("3-polig und 4-polig: L1, L2, L3 auf gleicher x-Position", len(p34) == 2 and p34["LS_3P"] == p34["LS_4P"], p34)
    # Fang: Feldmitte stärker, feiner Fang weiter möglich
    page.click('[data-sym="LS_4P"]'); page.select_option('[data-placepoles]', "LS_1P"); click(97.5, 100); click(97.5, 80)
    page.keyboard.down("Alt"); page.mouse.move(*pt(97.5, 60)); page.mouse.click(*pt(97.5, 60)); page.keyboard.up("Alt")
    page.keyboard.press("Escape")
    xs1 = sorted(i["x"] for i in of("symbol") if i["sym"] == "LS_1P")
    check("Fang auf Spaltenmitte 96.563, mit Alt feiner Fang 97.5", xs1 == [96.563, 96.563, 97.5], xs1)
    page.keyboard.press("t"); page.keyboard.press("Escape")
    page.screenshot(path="shots/03b_nummern.png")
    # Fang auf bestehende Leitung (nicht auf dem Raster) und Verbindungspunkt
    page.keyboard.press("l"); page.select_option('[data-newbundle]', "1")
    click(235.9, 120); click(235.9, 90); click(235.9, 90)
    click(270, 105); click(236.0, 105); click(236.0, 105); page.wait_for_timeout(100)
    wl = [i for i in of("wire") if "bundle" not in i and i["pts"][0][0] > 200]
    check("Leitung an Leitung auf Spaltenmitte angeschlossen", len(wl) == 2 and wl[0]["pts"][0][0] == 235.063 and wl[1]["pts"][-1] == [235.063, 105], wl)
    check("Verbindungspunkt gezeichnet", page.evaluate("document.querySelectorAll('#items circle[r=\"0.5\"][stroke=\"none\"]').length") == 1)
    page.keyboard.press("Escape")
    with page.expect_download() as d5: page.click("#btn-export"); page.click("#btn-dxf")
    d5.value.save_as("test/ui_out_fang.dxf")
    # Kopieren und Einfügen, auch auf anderes Blatt (Gerät mit Klemmen)
    page.click('[data-sym="LS_4P"]'); click(30, 110); page.keyboard.press("Escape")
    src = [i for i in of("symbol") if i["x"] == 30][0]
    check("Testgerät mit Klemmen in Spalte 1", any(x.get("of") == src["id"] for x in of("terminals")))
    page.keyboard.press("v"); click(31, 100); page.keyboard.press("Control+c")
    page.click("[data-addsheet]"); page.wait_for_timeout(100)
    page.locator("#svg").focus(); page.keyboard.press("Control+v"); page.wait_for_timeout(100)
    ns = of("symbol"); nt = [x for x in of("terminals") if "of" in x]
    check("Einfügen auf anderem Blatt: gleiche Stelle, Klemmen verknüpft", len(ns) == 1 and ns[0]["x"] == 30 and ns[0]["y"] == 110 and len(nt) == 1 and nt[0]["of"] == ns[0]["id"] and ns[0]["id"] != src["id"], [ns, nt])
    check("eingefügtes Gerät bekommt Nummer des neuen Blatts (11F1)", ns[0]["attrs"]["BMK"] == "11F1", ns[0]["attrs"]["BMK"])
    page.keyboard.press("Control+v"); page.wait_for_timeout(100)
    check("zweites Einfügen auf demselben Blatt versetzt", len(of("symbol")) == 2 and of("symbol")[1]["x"] == 30)
    go(2); page.wait_for_timeout(100)
    # Klick auf Pin eines mehrpoligen Geräts: alle Pole als Bündel, Alt = ein Leiter
    page.click('[data-sym="LS_4P"]'); page.select_option('[data-placepoles]', "LS_4P"); click(230, 120); page.keyboard.press("Escape")
    s4 = [i for i in of("symbol") if i["sym"] == "LS_4P" and i["x"] > 200][0]
    n0 = len(of("wire"))
    page.keyboard.press("l"); page.select_option('[data-newbundle]', "1")
    click(s4["x"] + 10, s4["y"]); click(s4["x"] + 10, s4["y"] + 15); click(s4["x"] + 10, s4["y"] + 15)
    nw = of("wire")[n0:]
    check("Pin 3 von 4 angeklickt: 4 Leiter als Bündel ab erstem Pol", len(nw) == 4 and len({w.get("bundle") for w in nw}) == 1 and nw[0]["pts"][0] == [s4["x"], s4["y"]] and [w["kind"] for w in nw] == ["leitung", "leitung", "leitung", "neutral"], nw)
    page.keyboard.press("Escape"); page.keyboard.press("l"); page.keyboard.down("Alt")
    click(s4["x"] + 10, s4["y"] - 20); click(s4["x"] + 10, s4["y"] - 35); click(s4["x"] + 10, s4["y"] - 35); page.keyboard.up("Alt")
    nw2 = of("wire")[n0 + 4:]
    check("mit Alt nur ein Leiter", len(nw2) == 1, [len(of("wire")) - n0, nw2])
    page.keyboard.press("v")
    # Abzweig an der Grundverkabelung: jeder Leiter endet auf seiner Schiene (L1 links/oben, N rechts/unten)
    n1 = len(of("wire")); page.keyboard.press("l"); page.select_option('[data-newbundle]', "4")
    click(247.5, 70); click(247.5, 190); click(247.5, 190)  # links vom abgehenden Verweis (Hauptlinien enden bei x 265)
    nb = of("wire")[n1:]
    check("Abzweig: 4 Leiter enden auf Schiene L1, L2, L3, N", len(nb) == 4 and [w["pts"][-1][1] for w in nb] == [190, 185, 180, 175] and [w["pts"][-1][0] for w in nb] == [247.5, 252.5, 257.5, 262.5], [w["pts"] for w in nb])
    page.keyboard.press("Escape"); page.select_option('[data-newbundle]', "1") if page.locator('[data-newbundle]').count() else None
    n2 = len(of("wire")); page.keyboard.press("l"); page.select_option('[data-newbundle]', "4")
    click(200, 190); click(240, 120); click(240, 120)
    nc = of("wire")[n2:]
    check("Start auf Schiene: Abzweig zuerst senkrecht, L1 links", len(nc) == 4 and nc[0]["pts"][0] == [200.0, 190] and nc[0]["pts"][1][0] == 200.0 and [w["pts"][0][1] for w in nc] == [190, 185, 180, 175] and nc[0]["pts"][0][0] < nc[3]["pts"][0][0], [w["pts"][:2] for w in nc])
    page.keyboard.press("Escape"); page.keyboard.press("l"); page.select_option('[data-newbundle]', "1")
    # Bündel von der Schiene in ein Gerät mit versetztem x: senkrecht, Versatz, senkrecht; Ende exakt auf den Polen
    sd = [i for i in of("symbol") if i["sym"] == "LS_4P" and i["x"] > 200][0]
    n3 = len(of("wire")); page.keyboard.press("l"); page.select_option('[data-newbundle]', "4")
    click(sd["x"] + 5, 190); click(sd["x"], sd["y"]); click(sd["x"], sd["y"])
    nd = of("wire")[n3:]
    ends = [w["pts"][-1] for w in nd]
    check("Bündel Schiene zu Gerät: Enden genau auf den 4 Polen", len(nd) == 4 and ends == [[sd["x"] + 5 * k, sd["y"]] for k in range(4)] and all(len(w["pts"]) == 4 for w in nd), [w["pts"] for w in nd])
    page.screenshot(path="shots/08_abzweig.png")
    page.keyboard.press("Escape"); page.keyboard.press("l"); page.select_option('[data-newbundle]', "1")
    # Bibliothek: DXF-Symbol importieren, setzen, speichern, ohne Bibliothek wieder öffnen
    import ezdxf as _ez
    _d = _ez.new("R2010"); _m = _d.modelspace()
    for _x in (0, 10): _m.add_line((_x, 0), (_x, -20)); _m.add_line((_x - 2, -8), (_x + 2, -12))
    _m.add_line((0, -10), (10, -10)); _m.add_circle((5, -10), 1.5)
    for _t, _x, _y in (("A1", 0, 0), ("A2", 0, -20), ("A3", 10, 0), ("A4", 10, -20)): _m.add_attdef(_t, (_x + 1, _y), "", dxfattribs={"height": 2})
    _d.saveas("test/lib_sym.dxf")
    page.evaluate("localStorage.removeItem('schemacad.libraries.v1')")
    with page.expect_file_chooser() as fc2: page.click('[data-libact="import"]')
    fc2.value.set_files("test/lib_sym.dxf"); page.wait_for_timeout(200)
    page.fill('.modal [data-f="0"]', "Testbibliothek"); page.fill('.modal [data-f="1"]', "Test"); page.click(".modal [data-ok]"); page.wait_for_timeout(300)
    check("Symbol in der Bibliothek sichtbar", page.locator(".symrow .sym").count() == 1 and "4 Anschlüsse" in page.locator(".symrow .sym").inner_text(), page.locator(".symrow").all_inner_texts())
    page.click(".symrow .sym"); click(60, 60); page.keyboard.press("Escape")
    ls_ = [i for i in of("symbol") if i["sym"].startswith("LIB_")]
    check("Bibliothekssymbol gesetzt", len(ls_) == 1, ls_)
    with page.expect_download() as dlib: page.click('[data-libact="save"]')
    dlib.value.save_as("test/ui_out_lib.json")
    with page.expect_download() as dxl: page.click("#btn-export"); page.click("#btn-dxf")
    dxl.value.save_as("test/ui_out_libsym.dxf")
    check("DXF enthält Block des Bibliothekssymbols", ls_[0]["sym"] in open("test/ui_out_libsym.dxf").read())
    with page.expect_download() as dsv: page.keyboard.press("Control+s")
    dsv.value.save_as("test/ui_out_libdoc.json")
    import json as _js
    docj = _js.load(open("test/ui_out_libdoc.json"))
    check("Datei trägt das benutzte Symbol mit", any(x["name"] == ls_[0]["sym"] for x in docj.get("symbols", [])))
    lib_ok = _js.load(open("test/ui_out_lib.json"))
    check("Bibliotheksdatei gültig", lib_ok["format"] == "schemacad-lib" and lib_ok["groups"][0]["symbols"][0]["pins"].__len__() == 4, lib_ok["groups"][0]["symbols"][0]["pins"])
    page.keyboard.press("v"); page.keyboard.press("Delete")
    os.remove("test/lib_sym.dxf"); os.remove("test/ui_out_lib.json"); os.remove("test/ui_out_libsym.dxf"); os.remove("test/ui_out_libdoc.json")
    page.evaluate("localStorage.removeItem('schemacad.libraries.v1')")
    # Weitere Hauptlinie
    page.keyboard.press("v"); page.keyboard.press("Control+a"); page.keyboard.press("Escape"); page.mouse.click(5, 450); page.wait_for_timeout(100)
    nrail = len([w for w in of("wire") if w.get("tag") == "grund"])
    page.click("#btn-haupt"); page.click('#pv-pop [data-act="addrail"]'); page.wait_for_timeout(100)
    page.fill('.modal [data-f="0"]', "L1_ST"); page.click(".modal [data-ok]"); page.wait_for_timeout(100)
    nr = [w for w in of("wire") if w.get("tag") == "grund"]
    check("Weitere Hauptlinie L1_ST unter N", len(nr) == nrail + 1 and 170 in [w["pts"][0][1] for w in nr] and any(t["s"] == "L1_ST" for t in of("text")), [w["pts"][0][1] for w in nr])
    # Mehrblatt und Verweise
    page.click("#btn-new"); page.wait_for_timeout(100); page.click('[data-start="schema"]')
    if page.locator(".modal").count(): page.click('.modal [data-r="1"]')
    meta("BLATT", "58")
    D = lambda: page.evaluate("window.__schemacad.doc")
    refs = lambda: [(k, i) for k, sh in enumerate(D()["sheets"]) for i in sh["items"] if i["type"] == "symbol" and i["sym"][0] == "V" and not i.get("rname") and not i.get("main")]
    page.click('[data-sym="VOUT_4P"]'); click(100, 150); page.wait_for_timeout(100); page.keyboard.press("Escape")
    check("keine Rückfrage ohne offene Gegenseite", page.locator(".modal").count() == 0)
    check("Verweis abgehend ist offen", refs()[0][1]["attrs"]["ZIEL"] == "offen")
    page.click("[data-addsheet]"); page.wait_for_timeout(100)
    check("Blatt 59 mit Grundverkabelung und ankommendem Verweis", len(D()["sheets"]) == 5 and D()["sheets"][3]["meta"]["BLATT"] == "59" and len(M()["items"]) == 11 and any(i.get("main") == "l" for i in M()["items"]))
    page.click('[data-sym="VIN_4P"]'); click(100, 100); page.wait_for_timeout(100)
    check("Rückfrage mit einem offenen Gegenstück", page.locator(".modal .choice").count() == 1, page.locator(".modal .choice").all_inner_texts())
    check("Rückfrage nennt Blatt und Feld", "Blatt 58, Feld B3" in page.locator(".modal .choice").inner_text())
    page.click(".modal .choice"); page.wait_for_timeout(100); page.keyboard.press("Escape")
    r = refs(); zs = {k: i["attrs"]["ZIEL"] for k, i in r}
    check("verknüpft: Ziele 58.B3 und 59.D3", zs == {2: "59.D3", 3: "58.B3"}, zs)
    # Alle Blätter als DXF
    dl = []; page.on("download", lambda d: dl.append(d))
    # Export-Menü: öffnen, Pfeiltasten, Esc schliesst, Fokus zurück, Klick ausserhalb schliesst
    page.click("#btn-export")
    act = lambda: page.evaluate("document.activeElement.id")
    check("Menü offen, 5 Einträge (mit Legende als PDF), Fokus auf erstem", page.is_visible("#export-menu[role=menu]") and page.get_attribute("#btn-export", "aria-expanded") == "true" and page.locator("#export-menu .mi:visible").count() == 5 and act() == "btn-dxf", [page.locator("#export-menu .mi:visible").count(), act()])
    page.keyboard.press("ArrowDown"); a1 = act(); page.keyboard.press("ArrowUp"); page.keyboard.press("ArrowUp"); a2 = act()
    check("Pfeiltasten wandern, oben wieder nach unten", a1 == "btn-dxf-all" and a2 == "btn-lists", [a1, a2])
    tl = page.evaluate("document.querySelector('.tool[aria-pressed=true]')?.dataset.tool"); page.keyboard.press("t"); page.keyboard.press("Escape")
    check("Esc schliesst, Fokus auf Knopf, kein Tastenkürzel ausgelöst", page.is_hidden("#export-menu") and act() == "btn-export" and page.get_attribute("#btn-export", "aria-expanded") == "false" and page.evaluate("document.querySelector('.tool[aria-pressed=true]')?.dataset.tool") == tl)
    page.keyboard.press("Enter"); check("Enter öffnet wieder", page.is_visible("#export-menu"))
    page.mouse.click(600, 400); check("Klick ausserhalb schliesst", page.is_hidden("#export-menu"))
    page.keyboard.press("Escape")
    check("Button Alle Blätter sichtbar bei 2 Blättern", page.locator("#btn-dxf-all").get_attribute("hidden") is None)
    page.click("#btn-export"); page.click("#btn-dxf-all"); page.wait_for_timeout(1200)
    import zipfile, io  # seit 16.10.: ohne Ordnerwahl eine ZIP-Datei im Download-Ordner
    zf = zipfile.ZipFile(io.BytesIO(open(dl[0].path(), "rb").read())) if len(dl) == 1 else None
    names = sorted(zf.namelist()) if zf else []
    check("Eine ZIP mit 2 DXF-Dateien, Blatt 58 und 59", len(dl) == 1 and dl[0].suggested_filename.endswith("_DXF.zip") and zf.testzip() is None and len(names) == 2 and names[0].endswith("_Blatt-58.dxf") and names[1].endswith("_Blatt-59.dxf"), names)
    for k, n in enumerate(names): open(f"test/ui_out_all{k}.dxf", "wb").write(zf.read(n))
    # PDF: eine Seite pro Blatt
    nsh = page.evaluate("window.__schemacad.buildPrint()")
    page.emulate_media(media="print")
    pdf = page.pdf(width="297mm", height="210mm", prefer_css_page_size=True, print_background=True)
    page.emulate_media(media="screen")
    open("test/ui_out.pdf", "wb").write(pdf)
    import re as _re
    npages = len(_re.findall(rb"/Type\s*/Page[^s]", pdf))
    check("PDF hat eine Seite pro Blatt", npages == nsh and nsh == 5, [npages, nsh])  # Titelseite, Inhalt, Blatt 58, 59, Legende
    page.evaluate("document.querySelector('#printroot').innerHTML=''")
    # Listen: Sicherungslegende und Stückliste als CSV
    with page.expect_download() as dcsv: page.click("#btn-export"); page.click("#btn-lists")
    csv = open(dcsv.value.path(), encoding="utf-8-sig").read()
    check("Listen-CSV mit Legende und Stückliste", dcsv.value.suggested_filename.endswith("_Listen.csv") and csv.startswith("Sicherungslegende") and "Stückliste" in csv, csv[:200])
    # Hauptlinien: Gruppe L1 bis N endet bei Spalte (Querstriche), PE mit Verweis auf anderes Blatt (automatisch verknüpft, gleicher Name)
    page.keyboard.press("v"); click(60, 190); page.wait_for_timeout(100)
    page.select_option('[data-mainr]', "col:6"); page.wait_for_timeout(100)
    L1 = [w for w in M()["items"] if w["type"] == "wire" and w.get("tag") == "grund" and w["pts"][0][1] == 190][0]
    check("Hauptlinie endet bei Spalte 6", abs(L1["pts"][-1][0] - 200.4375) < 0.01 and L1.get("ends", {}).get("r") == "col:6", L1)
    click(60, 45); page.select_option('[data-railend="r"]', "ref"); page.wait_for_timeout(100)
    rs = [i for i in of("symbol") if i.get("rname") == "PE"]
    check("Verweis am Ende von PE gesetzt, offen", len(rs) == 1 and rs[0]["sym"] == "VOUT_1P" and rs[0]["attrs"]["ZIEL"] == "offen", rs)
    go(2); page.wait_for_timeout(100)
    click(60, 45); page.wait_for_timeout(100)
    page.select_option('[data-railend="l"]', "ref"); page.wait_for_timeout(200)
    check("keine Rückfrage, genau ein Gegenstück gleicher Hauptlinie", page.locator(".modal").count() == 0)
    zs = [(k, i["attrs"]["ZIEL"]) for k, sh in enumerate(D()["sheets"]) for i in sh["items"] if i.get("rname") == "PE"]
    check("Hauptlinien-Verweise verknüpft", len(zs) == 2 and all(z != "offen" for _, z in zs), zs)
    page.select_option('[data-railend="l"]', "edge"); page.wait_for_timeout(100)
    zs2 = [i["attrs"]["ZIEL"] for sh in D()["sheets"] for i in sh["items"] if i.get("rname") == "PE"]
    check("zurück auf Blattrand entfernt Verweis, Gegenseite offen", zs2 == ["offen"], zs2)
    go(3); page.wait_for_timeout(100)
    page.click('[data-sym="VIN_4P"]'); click(200, 100); page.wait_for_timeout(100)
    check("keine Rückfrage, wenn nichts offen ist", page.locator(".modal").count() == 0)
    page.keyboard.press("Escape")
    page.click('[data-sym="VOUT_4P"]'); click(200, 150); page.wait_for_timeout(100)
    check("umgekehrt: Rückfrage beim abgehenden Verweis", page.locator(".modal .choice").count() == 1)
    page.click(".modal [data-c]"); page.wait_for_timeout(100); page.keyboard.press("Escape")
    check("Abbrechen lässt Verweis offen", [i["attrs"]["ZIEL"] for k, i in refs() if k == 3 and i["x"] > 190 and i["sym"].startswith("VOUT")] == ["offen"])
    # Verknüpfung lösen und ändern
    page.keyboard.press("v"); click(101, 97); page.wait_for_timeout(100)
    page.click('[data-act="unlink"]'); page.wait_for_timeout(100)
    check("Lösen macht beide Seiten offen", all(i["attrs"]["ZIEL"] == "offen" for k, i in refs()))
    page.click('[data-act="relink"]'); page.wait_for_timeout(100)
    n_open = page.locator(".modal .choice").count()
    check("Ändern bietet offene Gegenstücke an", n_open == 2, n_open)
    page.locator(".modal .choice").first.click(); page.wait_for_timeout(100)
    check("neu verknüpft", sum(1 for k, i in refs() if "link" in i) == 2)
    page.keyboard.press("Control+z"); check("Rückgängig löst die Verknüpfung wieder", sum(1 for k, i in refs() if "link" in i) == 0)
    page.keyboard.press("Control+Shift+z")
    # Blattnummer ändern aktualisiert das Ziel
    go(2); page.wait_for_timeout(100); page.keyboard.press("Escape")
    meta("BLATT", "60")
    check("Blattnummer 60 steht im Ziel der Gegenseite", any(i["attrs"]["ZIEL"].startswith("60.") for k, i in refs() if k == 3), [i["attrs"]["ZIEL"] for k, i in refs()])
    # Löschen löst die Gegenseite
    go(3); page.wait_for_timeout(100)
    linked = [i for k, i in refs() if k == 3 and "link" in i][0]
    page.keyboard.press("v"); click(linked["x"], linked["y"] - 3); page.keyboard.press("Delete")
    check("Löschen gibt die Gegenseite frei", all("link" not in i for k, i in refs()))
    # Speichern und wieder öffnen über zwei Blätter
    with page.expect_download() as d3: page.click("#btn-export"); page.click("#btn-dxf")
    d3.value.save_as("test/ui_out_ref.dxf")
    with page.expect_download() as d4: page.click("#btn-save")
    d4.value.save_as("test/ui_out_ref.json")
    before_doc = D()
    page.click("#btn-new"); page.wait_for_timeout(100); page.click('[data-start="schema"]')
    if page.locator(".modal").count(): page.click('.modal [data-r="1"]')
    with page.expect_file_chooser() as fc: page.click("#btn-open")
    fc.value.set_files("test/ui_out_ref.json"); page.wait_for_timeout(300)
    check("Mehrblatt-Round-Trip gleich", D()["sheets"] == before_doc["sheets"] and len(D()["sheets"]) == 5)
    # Blatt löschen
    go(2); page.wait_for_timeout(100)
    page.click('[data-act="delsheet"]'); page.wait_for_timeout(100); page.click('.modal [data-r="1"]'); page.wait_for_timeout(100)
    check("Blatt löschen", len(D()["sheets"]) == 4)
    # Anschluss von Geräten oben an die Hauptleitungen (Gerät auf Feldmitte, also neben dem Raster)
    page.click("[data-addsheet]"); page.wait_for_timeout(100)
    for nm, x in (("LS_4P", 160), ("LS_1P", 60), ("LS_2P", 220)):
        page.click('[data-sym="LS_4P"]'); page.select_option('[data-placepoles]', nm); click(x, 150); page.keyboard.press("Escape")
    s4, s1, s2 = [i for i in of("symbol")]
    page.keyboard.press("l"); n0 = len(of("wire"))
    click(s4["x"], s4["y"]); click(s4["x"] + 1, 190); click(s4["x"] + 1, 190)
    nw = of("wire")[n0:]
    check("4P gerade hoch auf L1, L2, L3, N", [w["pts"] for w in nw] == [[[s4["x"] + 5 * k, s4["y"]], [s4["x"] + 5 * k, y]] for k, y in enumerate((190, 185, 180, 175))], [w["pts"] for w in nw])
    n0 = len(of("wire")); click(s1["x"], s1["y"]); click(s1["x"] - 1, 180); click(s1["x"] - 1, 180)
    nw = of("wire")[n0:]
    check("1P gibt einen Leiter gerade hoch", [w["pts"] for w in nw] == [[[s1["x"], s1["y"]], [s1["x"], 180]]], [w["pts"] for w in nw])
    n0 = len(of("wire")); click(s2["x"], s2["y"]); click(s2["x"] - 20, 190); click(s2["x"] - 20, 190)
    nw = of("wire")[n0:]
    hs = [p[1] for w in nw for p in w["pts"][1:-1]]
    check("2P versetzt: L auf L1, N auf N, Versatz unter den Schienen", [w["pts"][-1][1] for w in nw] == [190, 175] and [w["pts"][0] for w in nw] == [[s2["x"], s2["y"]], [s2["x"] + 5, s2["y"]]] and all(s2["y"] < y < 175 for y in hs), [w["pts"] for w in nw])
    page.keyboard.press("Escape"); page.keyboard.press("v")
    # Suchen und Ersetzen
    page.keyboard.press("Control+f"); page.wait_for_timeout(100)
    check("Suchfenster öffnet mit Ctrl+F", page.locator(".searchbox").count() == 1, "")
    page.fill('.searchbox [data-s=q]', "F"); page.wait_for_timeout(100)
    check("Suche zeigt Treffer", page.locator(".searchbox .hit").count() > 0, page.locator(".searchbox .hits").inner_text())
    page.click('.searchbox [data-s=close]'); page.keyboard.press("Escape")
    check("Suchfenster schliesst", page.locator(".searchbox").count() == 0, "")
    # Leitungen folgen dem Gerät, Leitungspunkte ziehen (neues Blatt)
    page.click("[data-addsheet]"); page.wait_for_timeout(100)
    page.click('[data-sym="LS_4P"]'); page.select_option('[data-placepoles]', "LS_1P"); click(150, 120); page.keyboard.press("Escape")
    sf = [i for i in of("symbol") if i["sym"] == "LS_1P"][0]; fx, fy = sf["x"], sf["y"]
    page.keyboard.press("l"); page.select_option('[data-newbundle]', "1")
    click(fx, fy - 20); click(fx, fy - 40); click(fx + 30, fy - 40); click(fx + 30, fy - 40); page.keyboard.press("v")
    nwf = len(of("wire")) - 1
    def drag(x0, y0, x1, y1):
        page.mouse.move(*pt(x0, y0)); page.mouse.down(); page.mouse.move(*pt(x1, y1), steps=6); page.mouse.up(); page.wait_for_timeout(100)
    drag(fx + 1, fy - 10, fx + 11, fy - 10)
    wf = of("wire")[nwf]
    check("Leitung folgt dem Gerät, Ecke geht mit", wf["pts"] == [[fx + 10, fy - 20], [fx + 10, fy - 40], [fx + 30, fy - 40]], wf["pts"])
    page.keyboard.press("Escape"); click(fx + 20, fy - 40); drag(fx + 30, fy - 40, fx + 40, fy - 30)
    wf = of("wire")[nwf]
    check("Leitungsende ziehen, Führung bleibt waagrecht/senkrecht", wf["pts"] == [[fx + 10, fy - 20], [fx + 10, fy - 30], [fx + 40, fy - 30]], wf["pts"])
    page.keyboard.press("Control+z"); page.wait_for_timeout(100)
    check("Rückgängig nach Punkt ziehen", of("wire")[nwf]["pts"][-1] == [fx + 30, fy - 40], of("wire")[nwf]["pts"])
    page.keyboard.press("Escape"); page.keyboard.press("l")
    click(fx + 10, fy); click(fx + 10, 190); click(fx + 10, 190); page.keyboard.press("v")
    drag(fx + 11, fy - 10, fx + 21, fy - 10)
    check("Abzweig gleitet auf der Schiene L1 mit", of("wire")[-1]["pts"] == [[fx + 20, fy], [fx + 20, 190]], of("wire")[-1]["pts"])
    page.keyboard.press("Escape")
    # Abzweig von einem senkrechten 4er-Bündel (CJ 15.10.: N an N, nicht alle an L1)
    page.click("[data-addsheet]"); page.wait_for_timeout(100)
    page.keyboard.press("l"); page.select_option('[data-newbundle]', "4")
    click(40, 130); click(40, 60); click(40, 60); page.keyboard.press("Escape")
    page.click('[data-sym="LS_4P"]'); page.select_option('[data-placepoles]', "LS_4P"); click(120, 90); page.keyboard.press("Escape")
    ls = [i for i in of("symbol") if i["sym"] == "LS_4P"][0]; n0 = len(of("wire"))
    page.keyboard.press("l"); page.select_option('[data-newbundle]', "1")
    click(ls["x"], ls["y"]); click(ls["x"], ls["y"] + 15); click(40, ls["y"] + 15); click(40, ls["y"] + 15); page.keyboard.press("Escape")
    ends = [w["pts"][-1][0] for w in of("wire")[n0:]]
    check("Abzweig vom 4er-Bündel: L1, L2, L3, N enden je auf ihrem Leiter", ends == [40, 45, 50, 55], [w["pts"] for w in of("wire")[n0:]])
    page.screenshot(path="shots/03c_abzweig.png")
    # Mobil
    page.set_viewport_size({"width": 390, "height": 800}); page.wait_for_timeout(300); page.screenshot(path="shots/04_mobile.png")
    page.click("#btn-export"); bx = page.eval_on_selector("#export-menu", "e => { const r = e.getBoundingClientRect(); return [r.left, r.right, innerWidth, document.documentElement.scrollWidth] }")
    check("Menü bleibt bei 390 px im Bild, kein seitliches Scrollen", bx[0] >= 0 and bx[1] <= bx[2] and bx[3] <= bx[2], bx)
    page.keyboard.press("Escape")
    b.close()
RT = next(c for c in (ROOT.parent / "roundtrip_check.py", ROOT.parent / "Etappe0" / "roundtrip_check.py") if c.exists())
r = subprocess.run([sys.executable, str(RT), "test/ui_out.dxf"], capture_output=True, text=True)
print(r.stdout[:700])
r2 = subprocess.run([sys.executable, str(RT), "test/ui_out_ref.dxf"], capture_output=True, text=True)
check("DXF mit Verweisen ohne Audit-Fehler, Blöcke vorhanden", "Audit-Fehler: 0" in r2.stdout and "VOUT_3P" in r2.stdout and "VIN_3P" in r2.stdout, r2.stdout[-300:] + r2.stderr[-200:])
r3 = subprocess.run([sys.executable, str(RT), "test/ui_out_fang.dxf"], capture_output=True, text=True)
import ezdxf
dots = [e for e in ezdxf.readfile("test/ui_out_fang.dxf").modelspace().query("LWPOLYLINE") if e.closed and len(e) == 2]
check("DXF mit Verbindungspunkt ohne Audit-Fehler", "Audit-Fehler: 0" in r3.stdout and len(dots) == 1, r3.stdout[:200])
check("DXF ohne Audit-Fehler", "Audit-Fehler: 0" in r.stdout, r.stderr[-300:])
for k in range(2):
    ra = subprocess.run([sys.executable, str(RT), f"test/ui_out_all{k}.dxf"], capture_output=True, text=True)
    check(f"Alle-Blätter-DXF {k} ohne Audit-Fehler", "Audit-Fehler: 0" in ra.stdout, ra.stdout[-200:])
    os.remove(f"test/ui_out_all{k}.dxf")
os.remove("test/bad.json"); os.remove("test/ui_out_fang.dxf"); os.remove("test/ui_out_ref.dxf"); os.remove("test/ui_out_ref.json")
check("keine JS-Fehler", not errors, errors)
print("FEHLER:" if fails else "ALLE OK", fails)
sys.exit(1 if fails else 0)
