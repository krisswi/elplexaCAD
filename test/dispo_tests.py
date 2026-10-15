# UI-Tests für den Blatttyp Disposition (Headless-Chromium). Aufruf aus web-src: python3 test/dispo_tests.py [Ausgabeordner]
import os, subprocess, sys, tempfile
from pathlib import Path
import ezdxf
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="dispo_"))
OUT.mkdir(parents=True, exist_ok=True)
RT = next(c for c in (ROOT.parent / "roundtrip_check.py", ROOT.parent / "Etappe0" / "roundtrip_check.py") if c.exists())
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
    def drag(x0, y0, x1, y1):
        X0, Y0 = pt(x0, y0); X1, Y1 = pt(x1, y1)
        page.mouse.move(X0, Y0); page.mouse.down(); page.mouse.move((X0 + X1) / 2, (Y0 + Y1) / 2, steps=3); page.mouse.move(X1, Y1, steps=3); page.mouse.up()
    D = lambda: page.evaluate("window.__schemacad.doc")
    M = lambda: page.evaluate("window.__schemacad.model")
    def go(i): page.click("#sheet-cur"); page.click(f'#sheet-menu [data-sheet="{i}"]')  # Blatt über die Blattliste wählen
    def add_dispo(): page.click("#sheet-add", button="right"); page.click('[data-new="dispo"]')
    of = lambda t: [i for i in M()["items"] if i["type"] == t]
    kind = lambda: page.evaluate("window.__schemacad.kind")
    items_html = lambda: page.evaluate("document.querySelector('#items').innerHTML")
    RED = "#d02b20"

    # Neue Disposition
    check("Start ist ein Schemablatt", kind() == "schema" and page.locator('[data-tool="wire"]').count() == 1)
    add_dispo(); page.wait_for_timeout(150)
    check("Disposition ist aktiv", kind() == "dispo" and len(D()["sheets"]) == 5 and D()["sheets"][3]["kind"] == "dispo" and D()["sheets"][3]["sid"] > 0)
    check("Tab heisst Dispo 1", "Dispo 1" in page.inner_text("#sheetbar"))
    check("Palette der Disposition, keine Leitung", page.locator('[data-sym="D:PLATE:zaehler"]').count() == 1 and page.locator('[data-sym="D:DEV:NTR"]').count() == 1 and page.locator('[data-tool="wire"]').count() == 0)
    check("Raster hat 10 mm, Feldmitte ausgeblendet", page.locator('#grid-size option[value="10"]').count() == 1 and not page.locator("#mag-on").is_visible() and page.is_visible("#btn-handover"))
    page.screenshot(path=str(OUT / "01_leer.png"))

    # Zählerplatte und Schienen
    page.click('[data-sym="D:PLATE:zaehler"]'); click(100, 100); page.keyboard.press("Escape")
    pl = of("plate")
    check("Zählerplatte 250 x 400 fest bei 100/100", len(pl) == 1 and (pl[0]["x"], pl[0]["y"], pl[0]["w"], pl[0]["h"], pl[0].get("fixed")) == (100, 100, 250, 400, True), pl)
    click(100, 250); page.wait_for_timeout(100)
    check("Platte am Rand wählbar, Breite gesperrt", page.is_disabled('input[data-dp="w"]') and page.is_enabled('[data-act="autorail"][data-n="3"]'))
    click(225, 250); check("Innerhalb der Platte nichts gewählt (Rahmenwahl möglich)", page.locator('[data-act="autorail"]').count() == 0)
    click(100, 250); page.click('[data-act="autorail"][data-n="3"]')
    rl = of("rail")
    check("3 Schienen à 120 mm im Abstand, 20 mm Rand ringsum", sorted(r["y"] for r in rl) == [180, 300, 420] and all(r["x"] == 120 and r["len"] == 210 for r in rl), rl)
    click(100, 250)
    check("Schienen nur einmal einfügbar", page.is_disabled('[data-act="autorail"][data-n="3"]'))

    # Geräte
    def place(sym, x, y): page.click(f'[data-sym="D:DEV:{sym}"]'); click(x, y)
    place("LS3", 150, 180); place("LS1", 185, 180); place("NTR", 198, 180); place("LS4", 290, 180)
    ds = sorted(of("device"), key=lambda d: d["x"])
    check("Geräte rasten auf der Schiene ein (x, y)", [(d["x"], d["y"]) for d in ds] == [(120, 180), (172.5, 180), (190, 180), (251.25, 180)], [(d["x"], d["y"]) for d in ds])
    check("TE und Beschriftung", [(d["te"], d["label"]) for d in ds] == [(3, "LS 3P"), (1, "LS 1P"), (0.5, "N"), (4, "LS 4P")] and all(d["h"] == 83 for d in ds))
    check("aneinander gereiht, nichts rot", RED not in items_html())
    place("LS1", 110, 180)
    check("Überlappung wird rot", RED in items_html() and len(of("device")) == 5)
    page.keyboard.press("Escape"); page.keyboard.press("Control+z"); page.wait_for_timeout(100)
    check("Rückgängig entfernt das Gerät, Rot weg", len(of("device")) == 4 and RED not in items_html())
    place("LS3", 320, 180)
    d5 = [d for d in of("device") if d["te"] == 3 and d["x"] > 200][0]
    check("Gerät am Schienenende wird zurückgesetzt (ragt nicht über)", d5["x"] + 52.5 <= 330 + 1e-6, d5)
    page.keyboard.press("Escape"); page.keyboard.press("Control+z"); page.wait_for_timeout(100)

    # Eigenschaften eines Geräts
    click(130, 180); page.wait_for_timeout(100)
    page.locator('input[data-dp="bmk"]').fill("2F1"); page.locator('input[data-dp="h"]').fill("90")
    d0 = sorted(of("device"), key=lambda d: d["x"])[0]
    check("BMK und Höhe im Panel gesetzt", d0["bmk"] == "2F1" and d0["h"] == 90 and ">2F1<" in items_html(), d0)
    page.keyboard.press("Escape")
    page.screenshot(path=str(OUT / "02_dispo.png"))

    # Platte nimmt Inhalt mit
    before = {i["id"]: (i["x"], i["y"]) for i in M()["items"]}
    drag(100, 250, 150, 300); page.wait_for_timeout(100)
    after = {i["id"]: (i["x"], i["y"]) for i in M()["items"]}
    check("Platte samt Schienen und Geräten um 50/50 verschoben", len(before) == len(after) == 8 and all(after[k] == (before[k][0] + 50, before[k][1] + 50) for k in before), (before, after))
    page.keyboard.press("Control+z"); page.wait_for_timeout(100)
    check("Ein Rückgängig stellt alles her", {i["id"]: (i["x"], i["y"]) for i in M()["items"]} == before)
    # einzelnes Gerät ziehen rastet auf der Schiene ein (auch auf einer anderen)
    ls1 = [d for d in of("device") if d["te"] == 1][0]
    drag(ls1["x"] + 8, 180, ls1["x"] + 8 + 30, 300); page.wait_for_timeout(100)
    mv = [d for d in of("device") if d["id"] == ls1["id"]][0]
    check("Gerät auf die mittlere Schiene gezogen, y = 300, Raster 8,75", mv["y"] == 300 and abs(((mv["x"] - 120) / 8.75) - round((mv["x"] - 120) / 8.75)) < 1e-9, mv)
    page.keyboard.press("Control+z"); page.wait_for_timeout(100)

    # Übergabe an das Schema
    page.keyboard.press("Escape"); page.click("#btn-handover"); page.wait_for_timeout(150)
    check("Dialog fragt Schemablatt und Massstab", page.locator('.modal [data-f="0"]').count() == 1 and page.locator('.modal [data-f="1"]').count() == 1)
    check("Vorschlag Massstab 1:5 (Platz im Rahmen)", page.eval_on_selector('.modal [data-f="1"]', "e => e.value") == "5", page.eval_on_selector('.modal [data-f="1"]', "e => e.value"))
    page.click(".modal [data-ok]"); page.wait_for_timeout(200)
    sch = D()["sheets"][2]; views = [i for i in sch["items"] if i["type"] == "dispoview"]
    n_src = len(D()["sheets"][3]["items"])
    check("Schemablatt hat eine Ansicht 1:5 mit allen Bauteilen", kind() == "schema" and len(views) == 1 and views[0]["den"] == 5 and len(views[0]["items"]) == n_src == 8 and views[0]["src"] == D()["sheets"][3]["sid"], views)
    v = views[0]
    check("Ansicht liegt im Blattrahmen", v["x"] >= 10 and v["y"] >= 25 and v["x"] + v["bw"] / 5 <= 287 and v["y"] + v["bh"] / 5 <= 200, (v["x"], v["y"], v["bw"], v["bh"]))
    check("Ansicht gezeichnet mit Beschriftung", "Massstab 1:5" in items_html())
    page.screenshot(path=str(OUT / "03_schema_mit_ansicht.png"))
    # Ansicht wählen, Massstab ändern
    click(v["x"] + 10, v["y"] + 10); page.wait_for_timeout(100)
    check("Panel der Ansicht", page.locator("select[data-dpden]").count() == 1)
    page.select_option("select[data-dpden]", "10"); page.wait_for_timeout(100)
    check("Massstab 1:10 geändert", [i for i in D()["sheets"][2]["items"] if i["type"] == "dispoview"][0]["den"] == 10 and "Massstab 1:10" in items_html())
    page.select_option("select[data-dpden]", "5")
    # Einfügen zwischen Blatttypen ist gesperrt
    page.keyboard.press("Control+c"); page.keyboard.press("Escape")
    n0 = len(M()["items"])
    go(3); page.wait_for_timeout(150)
    check("Wechsel zur Disposition stellt Palette um", kind() == "dispo" and page.locator('[data-sym="D:RAIL"]').count() == 1)
    page.keyboard.press("Control+v"); page.wait_for_timeout(100)
    check("Einfügen einer Schema-Ansicht in die Disposition abgelehnt", len(M()["items"]) == 8 and page.locator(".toast.error").count() >= 1)

    # DXF
    dxf_d = page.evaluate("window.__schemacad.exportDxf()"); (OUT / "dispo.dxf").write_text(dxf_d)
    doc = ezdxf.readfile(OUT / "dispo.dxf"); msp = doc.modelspace()
    layer = lambda n: [e for e in msp.query("LWPOLYLINE") if e.dxf.layer == n]
    box = lambda e: (min(p[0] for p in e.get_points()), min(p[1] for p in e.get_points()), max(p[0] for p in e.get_points()), max(p[1] for p in e.get_points()))
    check("Dispositions-DXF: 1 Platte, 3 Schienen, 4 Geräte", len(layer("SCH_DISPO_PLATTE")) == 1 and len(layer("SCH_DISPO_SCHIENE")) == 3 and len(layer("SCH_DISPO_GERAET")) == 4)
    check("Platte 1:1 in mm", box(layer("SCH_DISPO_PLATTE")[0]) == (100, 100, 350, 500), box(layer("SCH_DISPO_PLATTE")[0]))
    check("Dispositions-DXF ohne Rahmen und Schriftfeld", not any(e.dxftype() == "INSERT" for e in msp) and "SCH_RAHMEN" not in {l.dxf.name for l in doc.layers})
    r = subprocess.run([sys.executable, str(RT), str(OUT / "dispo.dxf")], capture_output=True, text=True)
    check("Dispositions-DXF ohne Audit-Fehler", "Audit-Fehler: 0" in r.stdout, r.stdout[:200] + r.stderr[-200:])
    go(2); page.wait_for_timeout(150)
    dxf_s = page.evaluate("window.__schemacad.exportDxf()"); (OUT / "schema.dxf").write_text(dxf_s)
    doc = ezdxf.readfile(OUT / "schema.dxf"); msp = doc.modelspace()
    pl_s = [e for e in msp.query("LWPOLYLINE") if e.dxf.layer == "SCH_DISPO_PLATTE"]
    bx = box(pl_s[0]); vw = [i for i in D()["sheets"][2]["items"] if i["type"] == "dispoview"][0]
    check("Schema-DXF: Platte skaliert 1:5 an der Stelle der Ansicht", len(pl_s) == 1 and all(abs(a - b_) < 1e-6 for a, b_ in zip(bx, (vw["x"] + (100 - vw["bx"]) / 5, vw["y"] + (100 - vw["by"]) / 5, vw["x"] + (100 - vw["bx"]) / 5 + 50, vw["y"] + (100 - vw["by"]) / 5 + 80))), (bx, vw["x"], vw["y"]))
    heights = [e.dxf.height for e in msp.query("TEXT") if e.dxf.layer == "SCH_TEXT"]
    check("Texte der Ansicht nie unter 1,2 mm", min(heights) >= 1.2 - 1e-9, min(heights))
    r = subprocess.run([sys.executable, str(RT), str(OUT / "schema.dxf")], capture_output=True, text=True)
    check("Schema-DXF mit Ansicht ohne Audit-Fehler", "Audit-Fehler: 0" in r.stdout, r.stdout[:200] + r.stderr[-200:])

    # Speichern, Neu, Öffnen
    with page.expect_download() as dl: page.click("#btn-save")
    dl.value.save_as(OUT / "doc.schemacad.json")
    import json
    saved = json.loads((OUT / "doc.schemacad.json").read_text())
    check("Datei hat Version 5 (mit Titelseite)", saved["version"] == 5)
    before_doc = D()
    page.click("#btn-new"); page.wait_for_timeout(100); page.click('[data-start="schema"]')
    if page.locator(".modal").count(): page.click('.modal [data-r="1"]')
    check("Neu ist wieder ein Schemablatt mit einem Blatt", kind() == "schema" and len(D()["sheets"]) == 4 and page.locator('[data-tool="wire"]').count() == 1)
    with page.expect_file_chooser() as fc: page.click("#btn-open")
    fc.value.set_files(str(OUT / "doc.schemacad.json")); page.wait_for_timeout(300)
    check("Round-Trip gleich (2 Blätter, Ansicht, Disposition)", D()["sheets"] == before_doc["sheets"] and len(D()["sheets"]) == 5)

    # Erneut übergeben ersetzt die Ansicht
    go(3); page.wait_for_timeout(150)
    place("LS2", 130, 300); page.keyboard.press("Escape")
    page.click("#btn-handover"); page.wait_for_timeout(150)
    check("Dialog nennt die bestehende Ansicht", "bestehende Ansicht wird ersetzt" in page.inner_text('.modal [data-f="0"]'))
    page.click(".modal [data-ok]"); page.wait_for_timeout(200)
    views = [i for i in D()["sheets"][2]["items"] if i["type"] == "dispoview"]
    check("Ansicht ersetzt, nicht verdoppelt, neues Gerät drin", len(views) == 1 and len(views[0]["items"]) == 9, [len(v["items"]) for v in views])
    # Übergabe auf ein neues Blatt mit eigener Blattnummer, ein Schritt rückgängig
    go(3); page.wait_for_timeout(150); page.keyboard.press("Escape")
    page.click("#btn-handover"); page.wait_for_timeout(150)
    check("Dialog bietet Neues Blatt und schlägt die nächste Nummer vor", page.locator('.modal [data-f="0"] option[value="new"]').count() == 1 and page.input_value('.modal [data-f="2"]') == "4", page.input_value('.modal [data-f="2"]'))
    page.select_option('.modal [data-f="0"]', "new"); page.fill('.modal [data-f="2"]', "77"); page.click(".modal [data-ok]"); page.wait_for_timeout(200)
    sh = D()["sheets"]
    check("Neues Schemablatt 77 mit Grundverkabelung und Ansicht, aktiv", len(sh) == 6 and sh[4].get("kind") is None and sh[4]["meta"]["BLATT"] == "77" and len([i for i in sh[4]["items"] if i["type"] == "dispoview"]) == 1 and len(sh[4]["items"]) == 11 and D()["active"] == 4, [len(sh), sh[-1]["meta"].get("BLATT"), len(sh[-1]["items"])])
    page.keyboard.press("Control+z"); page.wait_for_timeout(150)
    check("Rückgängig entfernt das neue Blatt", len(D()["sheets"]) == 5)

    # PDF
    n = page.evaluate("window.__schemacad.buildPrint()")
    svgs = page.evaluate("[...document.querySelectorAll('#printroot svg')].map(s => s.getAttribute('viewBox'))")
    check("PDF: eine Seite je Blatt, Disposition eingepasst", n == 5 and len(svgs) == 5 and svgs[:3] == ["0 0 297 210"] * 3 and svgs[3] != "0 0 297 210" and svgs[4] == "0 0 210 297", svgs)
    page.evaluate("document.querySelector('#printroot').innerHTML = ''")

    # Disposition löschen
    go(3); page.wait_for_timeout(100)
    page.keyboard.press("Escape")
    page.click('[data-act="delsheet"]'); page.wait_for_timeout(100); page.click('.modal [data-r="1"]'); page.wait_for_timeout(150)
    check("Disposition gelöscht, zurück im Schema", kind() == "schema" and len(D()["sheets"]) == 4 and page.locator('[data-tool="wire"]').count() == 1)
    check("Ansicht bleibt als Momentaufnahme", len([i for i in D()["sheets"][2]["items"] if i["type"] == "dispoview"]) == 1)

    # Weitere Bedienung: Platte mit freien Massen, Schiene in der Platte, Text, Rahmenwahl, Pfeiltasten, Rückgängig beim Blattanlegen
    page.click('[data-sym="LS_4P"]')  # Schema-Werkzeug aktiv, dann Wechsel auf neue Disposition setzt zurück
    add_dispo(); page.wait_for_timeout(150)
    check("Werkzeugwechsel beim Blatttyp: Auswahl statt Schema-Symbol", kind() == "dispo" and page.evaluate("document.querySelector('.tool[aria-pressed=true]')?.dataset.tool") == "select")
    page.click('[data-sym="D:PLATE:frei"]'); page.wait_for_timeout(50)
    page.locator('input[data-dpnew="plateW"]').fill("600"); page.locator('input[data-dpnew="plateH"]').fill("500")
    click(0, 0)
    pl = of("plate")[0]
    check("Montageplatte mit freien Massen 600 x 500 bei 0/0", (pl["x"], pl["y"], pl["w"], pl["h"], pl.get("fixed")) == (0, 0, 600, 500, None) and pl["name"] == "Montageplatte", pl)
    page.click('[data-sym="D:RAIL"]'); click(300, 250)
    rl = of("rail")[0]
    check("Schiene in der Platte übernimmt deren Breite mit 20 mm Rand", (rl["x"], rl["len"], rl["y"]) == (20, 560, 250), rl)
    page.keyboard.press("t"); page.locator('input[data-dpnew="textH"]').fill("20"); click(20, 450); page.wait_for_timeout(100); page.keyboard.type("Feld 1"); page.keyboard.press("Enter")
    tx = of("text")[0]
    check("Text in der Disposition mit 20 mm Höhe", tx["s"] == "Feld 1" and tx["h"] == 20, tx)
    page.keyboard.press("v"); page.keyboard.press("Escape")
    drag(20, 100, 580, 400); page.wait_for_timeout(100)
    sel = page.evaluate("document.querySelectorAll('#overlay .sel-a').length")
    check("Rahmen innerhalb der Platte wählt die Schiene, nicht die Platte", sel == 1 and page.locator('[data-dp="len"]').count() == 1, sel)
    page.keyboard.press("Escape"); drag(-30, 100, 650, 400); page.wait_for_timeout(100)
    check("Rahmen über den Plattenrand wählt auch die Platte", page.evaluate("document.querySelectorAll('#overlay .sel-a').length") == 2)
    page.keyboard.press("Escape"); click(0, 100); page.keyboard.press("ArrowRight"); page.wait_for_timeout(100)
    check("Pfeiltaste verschiebt Platte samt Schiene und Text um 5 mm", of("plate")[0]["x"] == 5 and of("rail")[0]["x"] == 25 and of("text")[0]["x"] == 25, [of("plate")[0]["x"], of("rail")[0]["x"], of("text")[0]["x"]])
    page.keyboard.press("Control+d"); page.wait_for_timeout(100)
    check("Duplizieren der Platte nimmt Schiene und Text mit", len(of("plate")) == 2 and len(of("rail")) == 2 and len(of("text")) == 2)
    page.keyboard.press("Delete"); page.wait_for_timeout(100)
    check("Löschen der Platte lässt den Inhalt stehen", len(of("plate")) == 1 and len(of("rail")) == 2)
    for _ in range(7): page.keyboard.press("Control+z")  # Löschen, Duplizieren, Verschieben, Text, Schiene, Platte, Blatt anlegen
    page.wait_for_timeout(150)
    check("Rückgängig bis vor das Anlegen: wieder Schemablatt", kind() == "schema" and len(D()["sheets"]) == 4 and page.locator('[data-tool="wire"]').count() == 1, (kind(), len(D()["sheets"])))
    page.screenshot(path=str(OUT / "04_nach_undo.png"))

    # 20-mm-Rand (CJ 14.10.): Plattenbreite ändern, Schiene in die Platte ziehen
    add_dispo(); page.wait_for_timeout(150)
    page.click('[data-sym="D:PLATE:frei"]'); page.locator('input[data-dpnew="plateW"]').fill("500"); page.locator('input[data-dpnew="plateH"]').fill("400")
    click(0, 0); page.keyboard.press("Escape")
    click(0, 200); page.click('[data-act="autorail"][data-n="2"]'); click(0, 200)
    page.locator('input[data-dp="w"]').fill("700"); page.wait_for_timeout(100)
    rl = sorted(of("rail"), key=lambda r: r["y"])
    check("Breitere Platte: Schienen wachsen mit, 20 mm Rand, Höhe bleibt", [(r["x"], r["len"], r["y"]) for r in rl] == [(20, 660, 110), (20, 660, 290)], rl)
    page.locator('input[data-dp="w"]').fill("300"); page.wait_for_timeout(100)
    check("Schmalere Platte: Schienen 260 mm", all((r["x"], r["len"]) == (20, 260) for r in of("rail")), of("rail"))
    page.keyboard.press("Escape"); page.click('[data-sym="D:RAIL"]'); page.locator('input[data-dpnew="railLen"]').fill("400"); click(400, 600); page.keyboard.press("Escape")
    free = [r for r in of("rail") if r["y"] == 600][0]
    check("Schiene ausserhalb einer Platte behält ihre Länge", (free["x"], free["len"]) == (400, 400), free)
    drag(450, 600, 100, 200); page.wait_for_timeout(100)
    mv = [r for r in of("rail") if r["id"] == free["id"]][0]
    check("Zu lange Schiene in die Platte gezogen: höchstens Platte − 40, 20 mm Rand", (mv["x"], mv["len"], mv["y"]) == (20, 260, 200), mv)

    # Griffe mit Live-Mass (Schritt 1)
    handles = lambda: page.evaluate("document.querySelectorAll('#overlay .dp-handle').length")
    ov_texts = lambda: page.evaluate("[...document.querySelectorAll('#overlay text')].map(t=>t.textContent)")
    plate = lambda: (lambda p: (p["x"], p["y"], p["w"], p["h"]))(of("plate")[0])
    rails = lambda: sorted(((r["x"], r["len"], r["y"]) for r in of("rail")), key=lambda r: r[2])
    page.keyboard.press("Escape"); click(0, 100); page.wait_for_timeout(100)
    check("Platte gewählt: 8 Griffe", handles() == 8, handles())
    drag(300, 200, 400, 200); page.wait_for_timeout(100)
    check("Griff rechts: Platte 400 breit, Schienen 360 lang", plate() == (0, 0, 400, 400) and rails() == [(20, 360, 110), (20, 360, 200), (20, 360, 290)], (plate(), rails()))
    drag(200, 400, 200, 450); page.wait_for_timeout(100)
    check("Griff oben: Platte 450 hoch, Schienen bleiben", plate() == (0, 0, 400, 450) and rails() == [(20, 360, 110), (20, 360, 200), (20, 360, 290)], (plate(), rails()))
    drag(0, 0, -50, -50); page.wait_for_timeout(100)
    check("Griff Ecke unten links: Schienen wachsen mit, Höhe bleibt", plate() == (-50, -50, 450, 500) and rails() == [(-30, 410, 110), (-30, 410, 200), (-30, 410, 290)], (plate(), rails()))
    page.keyboard.press("Control+z"); page.wait_for_timeout(100)
    check("Rückgängig nimmt einen Griffzug zurück", plate() == (0, 0, 400, 450) and rails()[0] == (20, 360, 110), (plate(), rails()))
    page.keyboard.press("Escape"); click(100, 110); page.wait_for_timeout(100)
    check("Schiene gewählt: 2 Griffe, Live-Mass 360", handles() == 2 and "360" in ov_texts(), (handles(), ov_texts()))
    drag(380, 110, 500, 110); page.wait_for_timeout(100)
    check("Schienenende bleibt 20 mm vor dem Plattenrand", rails()[0] == (20, 360, 110), rails())
    drag(380, 110, 300, 110); page.wait_for_timeout(100)
    check("Schiene kürzer gezogen: 280, Live-Mass folgt", rails()[0] == (20, 280, 110) and "280" in ov_texts(), (rails(), ov_texts()))
    drag(20, 110, -100, 110); page.wait_for_timeout(100)
    check("Schienenanfang bleibt 20 mm nach dem Plattenrand", rails()[0] == (20, 280, 110), rails())
    X, Y = pt(160, 135.5); page.mouse.dblclick(X, Y); page.wait_for_timeout(100)
    check("Doppelklick auf das Live-Mass öffnet die Eingabe", page.is_visible("#texteditor") and page.input_value("#texteditor") == "280", page.input_value("#texteditor"))
    page.fill("#texteditor", "200"); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    check("Schienenlänge eingetippt: 200", rails()[0] == (20, 200, 110), rails())
    page.keyboard.press("Escape")
    X, Y = pt(200, -18); page.mouse.dblclick(X, Y); page.wait_for_timeout(100)
    check("Doppelklick auf die Bemassung der Plattenbreite", page.is_visible("#texteditor") and page.input_value("#texteditor") == "400", page.input_value("#texteditor"))
    page.fill("#texteditor", "500"); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    check("Plattenbreite eingetippt: 500, volle Schienen 460, gekürzte bleibt 200", plate() == (0, 0, 500, 450) and rails() == [(20, 200, 110), (20, 460, 200), (20, 460, 290)], (plate(), rails()))
    page.keyboard.press("Control+z"); page.wait_for_timeout(100)
    check("Rückgängig nach eingetipptem Mass", plate() == (0, 0, 400, 450), plate())
    page.click('[data-sym="D:PLATE:zaehler"]'); click(450, 0); page.keyboard.press("Escape"); click(450, 200); page.wait_for_timeout(100)
    check("Zählerplatte gewählt: keine Griffe", handles() == 0 and page.is_disabled('input[data-dp="w"]'), handles())
    page.screenshot(path=str(OUT / "05_griffe.png"))

    # Hilfslinien beim Fang (Schritt 2): Kanten und Mitten anderer Bauteile, Alt schaltet aus
    guides = lambda: page.evaluate("document.querySelectorAll('#overlay .dp-guide').length")
    zp = lambda: [p for p in of("plate") if p.get("fixed")][0]
    check("Fangweite reicht für 5 mm", 8 / page.evaluate("window.__schemacad.view")["z"] > 5)
    page.keyboard.press("Escape")
    X0, Y0 = pt(450, 200); X1, Y1 = pt(450, 245)
    page.mouse.move(X0, Y0); page.mouse.down(); page.mouse.move(X1, Y1, steps=4); g_mid = guides(); page.mouse.up(); page.wait_for_timeout(100)
    check("Hilfslinie beim Ziehen, Oberkante rastet auf Oberkante der Nachbarplatte", g_mid >= 1 and zp()["y"] == 50 and guides() == 0, (g_mid, zp()["y"], guides()))
    page.keyboard.press("Control+z"); page.wait_for_timeout(100)
    page.keyboard.down("Alt"); drag(450, 200, 450, 245); page.keyboard.up("Alt"); page.wait_for_timeout(100)
    check("Mit Alt kein Fang an Hilfslinien (nur Raster)", zp()["y"] == 45, zp()["y"])
    page.keyboard.press("Control+z"); page.keyboard.press("Escape"); click(0, 100); page.wait_for_timeout(100)
    X0, Y0 = pt(400, 225); X1, Y1 = pt(445, 225)
    page.mouse.move(X0, Y0); page.mouse.down(); page.mouse.move(X1, Y1, steps=4); g_mid = guides(); page.mouse.up(); page.wait_for_timeout(100)
    check("Griff rastet an der Kante der Zählerplatte, Schienen wachsen mit", g_mid >= 1 and plate() == (0, 0, 450, 450) and rails()[1][:2] == (20, 410) and rails()[0][:2] == (20, 200), (g_mid, plate(), rails()))
    page.keyboard.press("Control+z"); page.keyboard.press("Escape")

    # Ausrichten und Verteilen bei Mehrfachauswahl (Schritt 3)
    page.click('[data-sym="D:PLATE:frei"]'); page.locator('input[data-dpnew="plateW"]').fill("200"); page.locator('input[data-dpnew="plateH"]').fill("300")
    click(760, 100); page.keyboard.press("Escape"); page.keyboard.press("f"); page.wait_for_timeout(100)
    plates = lambda: sorted(((p["x"], p["y"]) for p in of("plate")), key=lambda p: p[0])
    page.keyboard.press("Control+a"); page.wait_for_timeout(100)
    check("Mehrfachauswahl: Ausrichten-Knöpfe aktiv, Hinweis auf Plattenteile", page.is_enabled('[data-act="align"][data-m="l"]') and page.is_enabled('[data-act="align"][data-m="dh"]') and "wandern mit der Platte" in page.inner_text("#right"))
    page.click('[data-act="align"][data-m="r"]'); page.wait_for_timeout(100)
    check("Rechts bündig: Platten an 960, Schienen wandern mit", plates() == [(560, 0), (710, 0), (760, 100)] and all(r[0] == 580 for r in rails()), (plates(), rails()))
    page.keyboard.press("Control+z"); page.wait_for_timeout(100)
    page.click('[data-act="align"][data-m="t"]'); page.wait_for_timeout(100)
    check("Oben bündig: Oberkanten auf 450", plates() == [(0, 0), (450, 50), (760, 150)], plates())
    page.click('[data-act="align"][data-m="dh"]'); page.wait_for_timeout(100)
    check("Waagrecht verteilen: gleiche Abstände 55 mm", plates() == [(0, 0), (455, 50), (760, 150)], plates())
    page.keyboard.press("Control+z"); page.keyboard.press("Control+z"); page.wait_for_timeout(100)
    check("Rückgängig je Knopf ein Schritt", plates() == [(0, 0), (450, 0), (760, 100)], plates())
    page.keyboard.press("Escape"); click(0, 100); page.keyboard.down("Shift"); click(450, 200); page.keyboard.up("Shift"); page.wait_for_timeout(100)
    check("Zwei Teile: Verteilen gesperrt, Ausrichten frei", page.is_disabled('[data-act="align"][data-m="dh"]') and page.is_enabled('[data-act="align"][data-m="cy"]'))
    page.screenshot(path=str(OUT / "06_ausrichten.png"))

    # CJ 14.10.: gekürzte Schiene behält beim Ziehen ihre Länge, Plattenmitte ist Fangpunkt mit Hilfslinie, kein Zwang
    page.keyboard.press("Escape"); click(60, 110); page.wait_for_timeout(100)
    check("Gekürzte Schiene gewählt", rails()[0] == (20, 200, 110), rails())
    X0, Y0 = pt(60, 110); X1, Y1 = pt(135, 110)
    page.mouse.move(X0, Y0); page.mouse.down(); page.mouse.move(X1, Y1, steps=4); g_mid = guides(); page.mouse.up(); page.wait_for_timeout(100)
    check("Nahe der Plattenmitte rastet die Schienenmitte ein, Länge bleibt", g_mid >= 1 and rails()[0][:2] == (100, 200), (g_mid, rails()))
    drag(150, 117.5, 120, 117.5); page.wait_for_timeout(100)
    check("Weiter weg bleibt die Schiene, wo man sie loslässt", rails()[0][:2] == (70, 200), rails())
    drag(150, 117.5, 270, 117.5); page.wait_for_timeout(100)
    check("Am Rand begrenzt: Ende 20 mm vor der Plattenkante, Länge bleibt", rails()[0][:2] == (180, 200), rails())
    b.close()
check("keine JS-Fehler", not errors, errors)
print("FEHLER:" if fails else "ALLE OK", fails, "| Ausgaben:", OUT)
sys.exit(1 if fails else 0)
