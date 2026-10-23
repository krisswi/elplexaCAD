# UI-Test Modul «Plan» (CJ 23.10.2026, nur elplexaCAD): Küche zeichnen, Tür, Fenster, Griffe, Masse, Diagonale, Ebenen, Ecke ziehen,
# Elektrosymbole (Schritt 2: Wandfang, Drehen, Beschriftung, Höhe, Aufputz, Verweis), Massstab, Druckmitte, zweites Plan-Modul, Speichern/Laden,
# v3 lehnt die Datei ab. Vorher: node build.mjs && node build.mjs elplexa
# Aufruf: python3 test/plan_tests.py [Ausgabeordner]. Tasten im Plan als keydown-Ereignis (page.type schickt keinen keydown an window).
import sys, tempfile, json, math
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="plan_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
def no_auto(d):  # automatische Zeit läuft mit (eigene Tests in zeit_tests.py)
    p = d.get("project")
    if isinstance(p, dict):
        p.pop("auto", None); p.pop("id", None)
        if not p: d.pop("project")
    return d
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 900}, accept_downloads=True); page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; delete window.showDirectoryPicker;")
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(400)
    D = lambda: no_auto(page.evaluate("window.__schemacad.doc"))
    M = lambda: page.evaluate("window.__schemacad.model")
    sel = lambda: page.evaluate("[...window.__schemacad.sel]")
    item = lambda i: next(x for x in M()["items"] if x["id"] == i)
    of = lambda t: [x for x in M()["items"] if x["type"] == t]
    def key(k):
        page.evaluate("([k]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))", [k]); page.wait_for_timeout(60)
    def keys(s):
        for c in s: key(c)
    def at(x, y):  # Welt-mm → Bildschirm (app.js toScreen, H = 210)
        v = page.evaluate("window.__schemacad.view"); r = page.locator("#svg").bounding_box()
        return r["x"] + v["x"] + x * v["z"], r["y"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): page.mouse.click(*at(x, y)); page.wait_for_timeout(80)
    def drag(x0, y0, x1, y1, alt=False):
        page.mouse.move(*at(x0, y0)); page.mouse.down()
        if alt: page.keyboard.down("Alt")
        page.mouse.move(*at(x1, y1), steps=6)
        if alt: page.keyboard.up("Alt")
        page.mouse.up(); page.wait_for_timeout(100)
    def field(sel_, v): page.fill(sel_, v); page.press(sel_, "Enter"); page.wait_for_timeout(100)
    def blur(): page.evaluate("document.activeElement?.blur()")
    near = lambda a, q, tol=0.5: math.hypot(a[0] - q[0], a[1] - q[1]) < tol

    # ---------- Plan-Modul anlegen ----------
    page.click("#el-addmod"); page.wait_for_timeout(150)
    nb = page.locator('[data-elnew="plan"]')
    check("+ Modul: Plan wählbar", nb.count() == 1 and nb.is_enabled())
    nb.click(); page.wait_for_timeout(300)
    check("Neues Modul öffnet einen Plan: A3 quer 1:50, nur Ebene Hintergrund", M()["kind"] == "plan" and M()["paper"] == {"size": "A3", "quer": True, "den": 50} and [l["name"] for l in M()["layers"]] == ["Hintergrund"] and page.inner_text("#pv-druck-lbl") == "A3 quer 1:50", page.inner_text("#pv-druck-lbl"))
    check("Nullpunkt sichtbar markiert", page.locator("#sheet .pl-origin").count() == 1)

    # ---------- Küche: 4 Wände per Länge und Tab-Winkel, Raum schliessen ----------
    key("w"); click(0, 0)
    for L, a in [("4000", "0"), ("3,0 m", "90"), ("400 cm", "180")]:
        keys(L); key("Tab"); keys(a); key("Enter")
    click(0, 0)  # Klick auf den Anfang schliesst den Raum
    ws = of("wall")
    check("4 Wände, Raum geschlossen 4000 × 3000 (Mittellinie)", len(ws) == 4 and [w["a"] for w in ws] == [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] and ws[3]["b"] == [0, 0], [(w["a"], w["b"]) for w in ws])
    check("Wanddicke 150, Material Mauerwerk, Ebene Hintergrund", all(w["d"] == 150 and w["mat"] == "mauer" and w["layer"] == "bg" for w in ws))
    check("Nach dem Schliessen kein Entwurf mehr (Enter ohne Länge nötig nicht)", "Klick setzt den Anfang" in page.inner_text("#hint"), page.inner_text("#hint"))
    W1, W2, W3, W4 = (w["id"] for w in ws)
    key("Escape"); key("v"); key("f"); page.wait_for_timeout(150)  # Ansicht auf den Inhalt: Klicks auf wenige mm genau
    check("Gehrung: Ecken ohne Stirnseite (alle Wände verbunden)", page.evaluate("window.__schemacad.model.items.filter((i) => i.type === 'wall').length") == 4)

    # ---------- Tür und Fenster ----------
    key("o"); page.select_option('[data-plo="okind"]', "tuer"); click(1000, 0)
    page.select_option('[data-plo="okind"]', "fenster"); click(2000, 3000)
    ops = of("opening")
    check("Tür auf Wand 1 (900 mm, Höhe 2000), Fenster auf Wand 3 (1200 mm, Höhe 1500)", len(ops) == 2 and ops[0]["wall"] == W1 and ops[0]["kind"] == "tuer" and ops[0]["w"] == 900 and abs(ops[0]["t"] - 550) <= 10 and ops[0].get("h") == 2000
          and ops[1]["wall"] == W3 and ops[1]["kind"] == "fenster" and ops[1]["w"] == 1200 and ops[1].get("h") == 1500, ops)
    T, F = ops[0]["id"], ops[1]["id"]

    # ---------- Öffnung über Griff breiter ziehen ----------
    key("v"); click(1000, 0)
    check("Tür gewählt, Griffe sichtbar", sel() == [T] and "Höhe in mm" in page.inner_text("#right"))
    t0 = item(T)["t"]
    drag(t0 + 900, 0, t0 + 1057, 0)  # rechte Kante +157 → Breite ≈ 1060, auf 10 mm, linke Kante bleibt
    o = item(T); check("Griff rechts: Breite ≈ 1060 im Raster 10 mm, linke Kante bleibt", o["t"] == t0 and o["w"] % 10 == 0 and abs(o["w"] - 1060) <= 10, o)
    r0 = o["t"] + o["w"]
    drag(t0, 0, t0 - 103, 0, alt=True)  # linke Kante −103 mit Alt (frei), rechte Kante bleibt
    o = item(T); check("Griff links mit Alt: frei, rechte Kante bleibt", abs(o["t"] + o["w"] - r0) < 1e-6 and abs(o["t"] - (t0 - 103)) <= 8, o)
    w1 = o["w"]; check("Feld Breite folgt dem Griff", page.input_value('[data-plf="w"]') == str(round(w1)), page.input_value('[data-plf="w"]'))
    drag(r0, 0, 9000, 0)
    o = item(T); check("Griff: rechte Kante höchstens am Wandende, linke bleibt", abs(o["t"] + o["w"] - 4000) < 1e-6 and abs(o["t"] + w1 - r0) < 1e-6, o)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(100)
    check("Rückgängig nach dem Griff", item(T)["w"] == w1)
    field('[data-plf="w"]', "1000"); check("Breite eintippen", item(T)["w"] == 1000)

    # ---------- Diagonale als Kontrollmass mit Soll ----------
    blur(); key("b"); page.check('[data-plo="ctrl"]'); page.wait_for_timeout(80)
    click(0, 0); click(4000, 3000); click(1800, 1700)
    dg = [d for d in of("dim") if d.get("ctrl")]
    check("Diagonale = Kontrollmass, Ist 5000", len(dg) == 1 and near(dg[0]["a"], [0, 0]) and near(dg[0]["b"], [4000, 3000]), dg)
    DG = dg[0]["id"]
    blur(); key("v"); click(*[(0 + 4000) / 2 + dg[0]["off"] * -0.6, 1500 + dg[0]["off"] * 0.8])
    check("Kontrollmass gewählt", sel() == [DG], sel())
    field('[data-plf="soll"]', "5000"); check("Soll 5000, Abweichung 0", item(DG).get("soll") == 5000 and "Abweichung 0" in page.inner_text("#right"), page.inner_text("#right"))

    # ---------- Wandmass: Eintippen treibt die Wand ----------
    blur(); key("b"); page.uncheck('[data-plo="ctrl"]'); page.wait_for_timeout(80)
    click(0, 0); click(4000, 0); click(2000, -800)
    wd = [d for d in of("dim") if d.get("ref") == W1]
    check("Mass an Wand 1 (Bezug auf die Wand)", len(wd) == 1 and wd[0]["off"] < 0, of("dim"))
    WD = wd[0]["id"]
    blur(); key("v"); click(2000, wd[0]["off"])
    check("Wandmass gewählt", sel() == [WD], sel())
    field('[data-plf="len"]', "4,2 m")
    check("Wandmass 4200: Wand 1 endet bei 4200, Ecke von Wand 2 folgt", item(W1)["b"] == [4200, 0] and item(W2)["a"] == [4200, 0] and item(WD)["b"] == [4200, 0], [item(W1)["b"], item(W2)["a"]])
    check("Diagonale (Ecke 4000|3000 unverändert) bleibt Ist 5000", near(item(DG)["b"], [4000, 3000]))
    field('[data-plf="len"]', "4000"); check("zurück auf 4000", item(W1)["b"] == [4000, 0] and item(W2)["a"] == [4000, 0])

    # ---------- Ecke ziehen: beide Wände folgen ----------
    click(800, 3000)  # Wand 3 ausserhalb des Fensters (1400–2600)
    check("Wand 3 gewählt", sel() == [W3], sel())
    drag(0, 3000, 0, 3200)
    check("Ecke ziehen: Wand 3 und Wand 4 folgen, Diagonale bleibt", item(W3)["b"] == [0, 3200] and item(W4)["a"] == [0, 3200] and near(item(DG)["a"], [0, 0]), [item(W3)["b"], item(W4)["a"]])
    check("Fenster bleibt in Wand 3", item(F)["wall"] == W3 and item(F)["t"] + item(F)["w"] <= math.hypot(4000, 200) + 1e-6)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(100)
    check("Rückgängig: Ecke zurück", item(W3)["b"] == [0, 3000] and item(W4)["a"] == [0, 3000])

    # ---------- Ebene anlegen, Wand darauf, sperren ----------
    page.click('[data-plact="ladd"]'); page.wait_for_timeout(150)
    page.fill('.modal [data-f="0"]', "Installation"); page.click(".modal [data-ok]"); page.wait_for_timeout(150)
    ly = M()["layers"]
    check("Ebene «Installation» angelegt und aktiv", [l["name"] for l in ly] == ["Hintergrund", "Installation"] and M()["alay"] == ly[1]["id"], ly)
    LI = ly[1]["id"]
    blur(); key("w"); click(2000, 0); keys("1500"); key("Tab"); keys("90"); key("Enter"); key("Escape")
    iw = [w for w in of("wall") if w["layer"] == LI]
    check("Innenwand auf Ebene Installation (T-Stoss an Wand 1)", len(iw) == 1 and iw[0]["a"] == [2000, 0] and iw[0]["b"] == [2000, 1500], iw)
    IW = iw[0]["id"]
    blur(); key("v"); click(2000, 900); check("Innenwand wählbar", sel() == [IW], sel())
    page.click(f'[data-plact="lock"][data-layer="{LI}"]'); page.wait_for_timeout(100)
    check("Ebene gesperrt, Auswahl aufgehoben", next(l for l in M()["layers"] if l["id"] == LI)["lock"] is True and IW not in sel())
    click(2000, 900); check("Gesperrte Wand nicht wählbar", sel() == [], sel())
    blur(); key("w"); click(3000, 1000)
    check("Zeichnen auf gesperrter Ebene: Hinweis", "gesperrt" in page.inner_text("#toasts"))
    key("Escape"); page.click('[data-plact="alay"][data-layer="bg"]'); page.wait_for_timeout(100)
    check("Aktive Ebene wieder Hintergrund", M()["alay"] == "bg")
    blur(); key("v")

    # ---------- Schritt 2: Elektrosymbole ----------
    check("Palette: ca. 30 Symbole in Gruppen", page.locator("[data-plsym]").count() >= 30 and all(g in page.inner_text("#left-body") for g in ["Schalter", "Steckdosen", "Leuchten", "Geräte"]), page.locator("[data-plsym]").count())
    page.click('[data-plsym="STD"]'); page.wait_for_timeout(80)
    check("Symbol gewählt: Werkzeug Symbol, Hinweis", "Steckdose T13" in page.inner_text("#hint") and page.get_attribute('[data-plsym="STD"]', "aria-pressed") == "true")
    click(3750, 600)  # nahe an der rechten Wand: rastet an der Innenfläche ein, zeigt in den Raum
    y = of("sym")[-1]; STD = y["id"]
    check("Steckdose an der Wand: auf der Innenfläche (x 3925), Drehung 90, Höhe 110", near(y["at"], [3925, y["at"][1]]) and abs(y["at"][1] - 600) <= 10 and y["r"] == 90 and y.get("h") == 110 and y["layer"] == "bg", y)
    page.click('[data-plsym="LEUCHTE"]'); key("r"); click(2000, 2000)
    y = of("sym")[-1]; LE = y["id"]
    check("Deckenleuchte frei, R dreht beim Setzen um 90°, ohne Höhe", y["key"] == "LEUCHTE" and y["r"] == 90 and "h" not in y and abs(y["at"][0] - 2000) <= 10, y)
    page.click('[data-plsym="VERWEIS"]'); click(1200, 1800)
    VW = of("sym")[-1]["id"]
    page.click('[data-plsym="SCH0"]'); click(3000, 300)
    SW = of("sym")[-1]["id"]
    check("Schalter an der unteren Wand (y 75, r 0)", near(item(SW)["at"], [item(SW)["at"][0], 75]) and item(SW)["r"] == 0, item(SW))
    blur(); key("v"); c0 = page.evaluate(f"(() => {{ const i = window.__schemacad.model.items.find((x) => x.id === {STD}); return i.at; }})()")
    click(c0[0] - 100, c0[1])
    check("Steckdose wählbar, rechts Beschriftung und Höhe", sel() == [STD] and "Beschriftung" in page.inner_text("#right") and page.input_value('[data-plf="sh"]') == "110", sel())
    field('[data-plf="txt"]', "Kühlschrank"); field('[data-plf="sh"]', "40")
    check("Beschriftung und Höhe gesetzt, im Plan sichtbar", item(STD).get("txt") == "Kühlschrank" and item(STD).get("h") == 40 and "Kühlschrank" in page.inner_html("#items"), item(STD))
    blur(); drag(c0[0] - 100, c0[1], 3700, 1500)
    check("Wandsymbol ziehen: bleibt an der Wand", near(item(STD)["at"], [3925, item(STD)["at"][1]]) and abs(item(STD)["at"][1] - 1500) <= 10 and item(STD)["r"] == 90, item(STD))
    key("r"); check("R dreht das gewählte Symbol", item(STD)["r"] == 180)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(100); check("Rückgängig: Drehung zurück", item(STD)["r"] == 90)
    click(item(SW)["at"][0], 75 + 110); check("Schalter gewählt: Feld Aufputz", sel() == [SW] and page.locator('[data-plf="ap"]').count() == 1, sel())
    page.check('[data-plf="ap"]'); page.wait_for_timeout(100); check("Aufputz gesetzt", item(SW).get("ap") is True)
    blur(); click(1200 - 200, 1800); check("Hinweispfeil gewählt: Sicherung und Nummer", sel() == [VW] and page.locator('[data-plf="fu"]').count() == 1, sel())
    field('[data-plf="fu"]', "F3"); field('[data-plf="nr"]', "2")
    check("Verweis F3 / 2 im Plan", item(VW).get("fu") == "F3" and item(VW).get("nr") == "2" and "F3 / 2" in page.inner_html("#items"))
    blur(); click(2000, 2000)
    check("Leuchte wählbar", sel() == [LE], sel())
    blur(); key("v"); page.mouse.click(*at(-2000, -2000)); page.wait_for_timeout(80)

    # ---------- Massstab und Druckmitte ----------
    page.click("#btn-pvdruck"); page.wait_for_timeout(200)
    page.select_option('[data-plp="den"]', "100"); page.wait_for_timeout(150)
    check("Massstab 1:100", M()["paper"]["den"] == 100 and page.inner_text("#pv-druck-lbl") == "A3 quer 1:100", page.inner_text("#pv-druck-lbl"))
    page.click('[data-plact="pmid"]'); page.wait_for_timeout(150)
    check("Werkzeug Druckmitte (Hinweis unten)", "Druckmitte: in den Plan klicken" in page.inner_text("#hint"), page.inner_text("#hint"))
    click(2000, 1500)
    pm = M().get("pmid"); check("Druckmitte gesetzt", pm and near(pm, [2000, 1500], 15), pm)
    page.click("#btn-pvdruck"); page.wait_for_timeout(200)
    check("Fenster Druck: Mitte automatisch angeboten", page.locator('[data-plact="pmidauto"]').count() == 1)
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    page.evaluate("document.querySelectorAll('#toasts .toast').forEach((t) => t.remove())")
    key("f"); page.wait_for_timeout(200)
    page.screenshot(path=str(OUT / "plan1_kueche.png"))
    page.locator("#svg").screenshot(path=str(OUT / "plan2_kueche_blatt.png"))

    # ---------- Zweites Plan-Modul: gleicher Nullpunkt ----------
    key("0"); page.wait_for_timeout(200)
    check("Übersicht", page.is_visible("#el-hub"))
    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('[data-elnew="plan"]'); page.wait_for_timeout(300)
    d = D()
    check("Zweites Plan-Modul (plan:2), eigenes Blatt, eigene sid", M()["kind"] == "plan" and M().get("var") == 2 and len([s for s in d["sheets"] if s.get("kind") == "plan"]) == 2 and len({s["sid"] for s in d["sheets"] if s.get("kind") == "plan"}) == 2, M().get("var"))
    check("Zweiter Plan leer, nur Hintergrund", M()["items"] == [] and [l["name"] for l in M()["layers"]] == ["Hintergrund"])
    key("w"); click(0, 0); keys("4000"); key("Tab"); keys("0"); key("Enter"); key("Escape")
    p1 = next(s for s in D()["sheets"] if s.get("kind") == "plan" and "var" not in s)
    check("Gleicher Nullpunkt: Wand OG ab (0|0) liegt auf Wand 1 EG, kein Versatz je Blatt", of("wall")[0]["a"] == [0, 0] and of("wall")[0]["b"] == [4000, 0] and p1["items"][0]["a"] == [0, 0] and not any(k in M() for k in ("ox", "oy", "off", "origin")))
    key("0"); page.wait_for_timeout(200)
    hubt = page.locator("#el-hub").inner_text()
    check("Übersicht: zwei Plan-Kacheln «Plan» und «Plan 2»", "Plan 2" in hubt and hubt.count("Plan") >= 2, hubt[:300])

    # ---------- Speichern / Laden ohne Datenverlust ----------
    d1 = D()
    check("Datei: Version 21 (Plan mit Symbolen)", d1["version"] == 21, d1["version"])
    blur()
    with page.expect_download() as dl: page.keyboard.press("Shift+Meta+s")
    out = OUT / "plan_rundlauf.elplexa.json"; dl.value.save_as(str(out)); page.wait_for_timeout(300)
    raw = json.loads(out.read_text())
    check("Gespeichert: Version 21, zwei Pläne", raw["version"] == 21 and [s.get("kind") for s in raw["sheets"]].count("plan") == 2)
    blur()
    with page.expect_file_chooser() as fc:
        page.keyboard.press("Meta+o"); page.wait_for_timeout(300)
        if page.is_visible(".modal"): page.click('.modal :text("Trotzdem öffnen")')
    fc.value.set_files(str(out)); page.wait_for_timeout(600)
    d2 = D()
    check("Laden ohne Datenverlust (Wände, Öffnungen mit Höhe, Masse, Symbole, Ebenen, Papier, Druckmitte)", d1["sheets"] == d2["sheets"] and d1.get("mods") == d2.get("mods"))
    pl = next(s for s in d2["sheets"] if s.get("kind") == "plan" and "var" not in s)
    check("Nach dem Laden: Ebene gesperrt, Druckmitte, Tür 1000 mm", pl["layers"][1]["lock"] is True and pl["pmid"] == pm and next(i for i in pl["items"] if i["id"] == T)["w"] == 1000)
    page.close()

    # ---------- SchemaCAD v3: Datei mit Plan (Version 21) wird abgelehnt ----------
    page = b.new_page(viewport={"width": 1400, "height": 900}); page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; delete window.showDirectoryPicker;")
    page.goto((ROOT / "dist" / "schemacad.html").as_uri()); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    page.evaluate("document.activeElement?.blur()")
    with page.expect_file_chooser() as fc: page.keyboard.press("Meta+o")
    fc.value.set_files(str(out)); page.wait_for_timeout(600)
    msg = page.inner_text("body")
    check("v3: Datei mit Plan abgelehnt (neuere Version)", page.evaluate("window.__schemacad.doc.sheets.every((s) => s.kind !== 'plan')") and ("neuer" in msg or "Version" in msg), msg[-300:])
    page.close()
    b.close()

check("keine JS-Fehler", not errors, errors[:5])
print(f"Bilder in {OUT}")
if fails: print(f"{len(fails)} Fehler"); sys.exit(1)
print("plan_tests: alles ok")
