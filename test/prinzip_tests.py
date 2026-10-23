# UI-Test Prinzipschema (CJ 21.10.2026): Modul in der Übersicht, Blatt von Hand zeichnen (Symbole, Leitung, Text, Linie),
# Fenster Druck mit Papier und Plankopf, PDF wie PV, Speichern und Laden. Aufruf nach `npm run build`: python3 test/prinzip_tests.py [Ordner für Bilder]
import json, re, subprocess, sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="prinzip_"))
OUT.mkdir(parents=True, exist_ok=True)
SRC = OUT / "beispiel.elplexa.json"
subprocess.run(["node", "--input-type=module", "-e", f"""import fs from "fs"; const m = await import("./test/test_prinzip.mjs"); const {{ serializeModel }} = await import("./src/model.js");
fs.writeFileSync({json.dumps(str(SRC))}, serializeModel(m.beispielDoc()));"""], cwd=ROOT, check=True, capture_output=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 900}); page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; delete window.showDirectoryPicker;")
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(400)
    D = lambda: page.evaluate("window.__schemacad.doc")
    M = lambda: page.evaluate("window.__schemacad.model")
    def key(k): page.evaluate("document.activeElement?.blur()"); page.keyboard.press(k); page.wait_for_timeout(120)
    def at(x, y):  # Welt-mm → Bildschirm (app.js toScreen, H = 210)
        v = page.evaluate("window.__schemacad.view"); r = page.locator("#svg").bounding_box()
        return r["x"] + v["x"] + x * v["z"], r["y"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): page.mouse.click(*at(x, y)); page.wait_for_timeout(80)

    # ---------- Übersicht: Modul wählbar ----------
    check("Start in der Übersicht", page.is_visible("#el-hub"))
    page.click("#el-addmod"); page.wait_for_timeout(150)
    nb = page.locator('[data-elnew="prinzip"]')
    check("+ Modul: Prinzipschema wählbar (nicht mehr «später»)", nb.count() == 1 and nb.is_enabled() and "später" not in nb.inner_text(), nb.inner_text() if nb.count() else "")
    nb.click(); page.wait_for_timeout(300)
    check("Neues Modul öffnet ein Prinzipschema", page.evaluate("window.__schemacad.kind") == "prinzip" and not page.is_visible("#el-hub"))
    check("Blatt 1, A4 hoch, ohne Objekte", M()["meta"]["BLATT"] == "1" and not M()["items"] and page.inner_text("#pv-druck-lbl") == "A4 hoch", page.inner_text("#pv-druck-lbl"))
    left = page.inner_text("#left-body")
    check("Palette: Abgänge, Verteilung, Erdung, ohne Schema-Symbole und Klemmenleiste", all(t in left for t in ["Abgänge", "Verteilung", "Erdung", "FI/LS-Schalter", "Zähler (kWh)", "Erder"]) and "Klemmenleiste" not in left and "Hausanschlusskasten" not in left)
    check("Leitung ohne Menü Leiterzahl (einpolig), Text mit Menü", page.locator("#tool-wire[data-hold]").count() == 0 and page.locator("#tool-text[data-hold]").count() == 1)
    check("Kopfleiste: Druck statt Hauptlinien, kein Feldmitte-Schalter", page.is_visible("#btn-pvdruck") and not page.is_visible("#btn-haupt") and not page.is_visible("#mag-on"))

    # ---------- Von Hand zeichnen ----------
    page.click('[data-sym="PZ_FILS"]'); click(50, 250); key("Escape")
    page.click('[data-sym="PZ_VERBR"]'); click(120, 250); key("Escape")
    page.click('[data-sym="PZ_LEITUNG"]'); click(90, 260); key("Escape")  # Leitungsangabe neben die Leitung
    items = M()["items"]
    syms = [i["sym"] for i in items if i["type"] == "symbol"]
    check("Symbole gesetzt: FI/LS, Verbraucher, Leitungsangabe", syms == ["PZ_FILS", "PZ_VERBR", "PZ_LEITUNG"], syms)
    fils = next(i for i in items if i.get("sym") == "PZ_FILS")
    check("Symbol auf dem Raster, Text und leere BMK", fils["x"] == 50 and fils["y"] == 250 and fils["attrs"] == {"TEXT": "FI/LS B13A 30mA", "BMK": "", "POL": "LN"}, fils)
    key("l"); click(67.5, 250); click(120, 250); key("Escape"); key("Escape")
    w = [i for i in M()["items"] if i["type"] == "wire"]
    check("Leitung vom FI/LS zum Verbraucher, einpolig", len(w) == 1 and w[0]["pts"] == [[67.5, 250], [120, 250]] and "bundle" not in w[0], w)
    key("t"); click(130, 160); page.keyboard.type("Unterverteilung"); page.keyboard.press("Enter"); page.wait_for_timeout(100); key("Escape")
    key("i"); click(10, 150); click(200, 150); key("Escape"); key("v")
    kinds = sorted(i["type"] for i in M()["items"])
    check("Text und Bereichslinie", kinds.count("text") == 1 and kinds.count("shape") == 1, kinds)
    # Rechts: Symbol wählen, Text ändern, BMK von Hand
    click(52.5, 250)
    page.fill('#right [data-attr="TEXT"]', "FI/LS C13A 30mA"); page.fill('#right [data-attr="BMK"]', "3F1"); page.keyboard.press("Tab"); page.wait_for_timeout(150)
    fils = next(i for i in M()["items"] if i.get("sym") == "PZ_FILS")
    check("Eigenschaften rechts: Text und BMK von Hand, keine automatische BMK", fils["attrs"] == {"TEXT": "FI/LS C13A 30mA", "BMK": "3F1", "POL": "LN"}, fils["attrs"])
    key("Escape")
    # Hauptverteilung (CJ 23.10.2026): Rechteck mit Diagonale aus der Palette, Grösse frei an der Ecke
    page.click('#left [data-tool="shape-vert"]'); click(150, 120); click(170, 135); key("Escape"); key("v")
    hv = [i for i in M()["items"] if i["type"] == "shape" and i.get("diag")]
    check("Hauptverteilung: Rechteck mit Diagonale gezeichnet", len(hv) == 1 and hv[0]["w"] == 20 and hv[0]["h"] == 15, hv)
    click(160, 135); page.mouse.move(*at(170, 135)); page.mouse.down(); page.mouse.move(*at(190, 140), steps=4); page.mouse.up()
    hv = [i for i in M()["items"] if i["type"] == "shape" and i.get("diag")]
    check("Hauptverteilung: Ecke ziehen ändert die Grösse", hv[0]["w"] == 40 and hv[0]["h"] == 20, hv)
    key("Delete"); key("Escape")
    # Leitungsangabe (CJ 23.10.2026): ein Strich, Taste 5 setzt die Anzahl Leiter vorne im Text, Querschnitt bleibt
    click(92.5, 260); key("5")
    lt = next(i for i in M()["items"] if i.get("sym") == "PZ_LEITUNG")
    check("Leitungsangabe: Taste 5 → 5x1,5mm²", lt["attrs"]["KABEL"] == "5x1,5mm²", lt)
    key("Escape"); key("Escape")
    page.click('[data-sym="PZ_LEITUNG"]'); key("4"); click(90, 230); key("Escape"); key("v")
    l2 = [i for i in M()["items"] if i.get("sym") == "PZ_LEITUNG"]
    check("Leitungsangabe beim Setzen: Taste 4 → 4x1,5mm²", l2[-1]["attrs"]["KABEL"] == "4x1,5mm²", l2)
    # Gruppenänderung: beide markieren, Querschnitt im Feld gemeinsam, Taste 3 gemeinsam
    click(92.5, 260); page.keyboard.down("Shift"); click(92.5, 230); page.keyboard.up("Shift")
    check("Mehrfachauswahl gleicher Symbole: Feld Leitung rechts", page.locator('#right [data-attr="KABEL"]').count() == 1)
    if page.locator('#right [data-attr="KABEL"]').count(): page.fill('#right [data-attr="KABEL"]', "5x2,5mm²"); page.keyboard.press("Tab"); page.wait_for_timeout(150)
    key("3"); l2 = [i["attrs"]["KABEL"] for i in M()["items"] if i.get("sym") == "PZ_LEITUNG"]
    check("Gruppenänderung: Querschnitt und Taste 3 auf beide", l2 == ["3x2,5mm²", "3x2,5mm²"], l2)
    key("Escape"); key("Escape")
    page.screenshot(path=str(OUT / "p1_von_hand.png"))

    # ---------- Knopf Verdrahten (CJ 21.10.2026) und Doppelklick setzt nicht doppelt ----------
    key("l"); click(20, 200); click(20, 150); key("Escape"); key("Escape")
    page.click('[data-sym="PZ_LS"]'); click(60, 175); click(60, 175); key("Escape"); key("v")
    ls = [i for i in M()["items"] if i.get("sym") == "PZ_LS"]
    check("Doppelklick beim Setzen: nur ein Symbol", len(ls) == 1, len(ls))
    click(63, 175)
    page.fill('#right [data-attr="POL"]', "3LN"); page.keyboard.press("Tab"); page.wait_for_timeout(150)
    check("Knopf Verdrahten am LS", page.locator('#right [data-act="pzwire"]').count() == 1)
    n0 = len(M()["items"]); page.click('#right [data-act="pzwire"]'); page.wait_for_timeout(150)
    new = M()["items"][n0:]
    wires = [i["pts"] for i in new if i["type"] == "wire"]; syms = {i["sym"]: (i["x"], i["y"]) for i in new if i["type"] == "symbol"}
    check("Verdrahten: links bis zur Steigleitung, rechts Leitungsangabe und Verbraucher 30 mm weiter",
          wires == [[[20, 175], [60, 175]], [[70, 175], [90, 175]], [[95, 175], [100, 175]]] and syms == {"PZ_LEITUNG": (90, 175), "PZ_VERBR": (100, 175)}, (wires, syms))
    n1 = len(M()["items"]); page.click('#right [data-act="pzwire"]'); page.wait_for_timeout(150)
    check("Verdrahten zweimal: nichts doppelt", len(M()["items"]) == n1)
    key("Meta+z"); page.wait_for_timeout(150)
    check("Verdrahten: ein Rückgängig-Schritt", len(M()["items"]) == n0)
    # Polzahl mit Tasten 1–3 und N (CJ 21.10.2026), Symbol bleibt
    click(63, 175); key("2"); pol1 = next(i for i in M()["items"] if i.get("sym") == "PZ_LS")["attrs"]["POL"]; key("n")
    ls = next(i for i in M()["items"] if i.get("sym") == "PZ_LS")
    check("Taste 2 → 2LN, N → 2L, Symbol gleich", pol1 == "2LN" and ls["attrs"]["POL"] == "2L" and ls["sym"] == "PZ_LS", (pol1, ls))
    key("Escape"); page.click('[data-sym="PZ_FILS"]'); key("3"); key("n"); click(60, 120); key("Escape"); key("v")
    f2 = [i for i in M()["items"] if i.get("sym") == "PZ_FILS" and i["y"] == 120]
    check("Beim Setzen: 3 und N → 3L", len(f2) == 1 and f2[0]["attrs"]["POL"] == "3L", f2)
    key("Escape")
    # Sicherung: Tasten wechseln die Variante (Striche), Polzahl geht mit (CJ 23.10.2026)
    page.click('[data-sym="PZ_SICH_3"]'); key("2"); key("n"); click(150, 175); key("Escape"); key("v")
    sh = [i for i in M()["items"] if i.get("sym", "").startswith("PZ_SICH")]
    check("Sicherung setzen: 2 und N → PZ_SICH_2N, Polzahl 2LN", len(sh) == 1 and sh[0]["sym"] == "PZ_SICH_2N" and sh[0]["attrs"]["POL"] == "2LN", sh)
    click(150, 168); key("1"); sh = [i for i in M()["items"] if i.get("sym", "").startswith("PZ_SICH")]
    check("Sicherung gewählt: Taste 1 → PZ_SICH_1N, Polzahl LN", sh[0]["sym"] == "PZ_SICH_1N" and sh[0]["attrs"]["POL"] == "LN", sh)
    key("Escape")

    # ---------- Druck: Papier und Plankopf wie PV ----------
    page.click("#btn-pvdruck"); page.wait_for_timeout(200)
    pop = page.inner_text("#pv-pop")
    check("Fenster Druck: Papier, Ausrichtung, Plankopf", page.is_visible("#pv-pop") and "Papier" in pop and "Ausrichtung" in pop and "Plankopf" in pop, pop[:200])
    page.select_option('#pv-pop [data-pzopt="pquer"]', "1"); page.wait_for_timeout(200)
    check("Papier A4 quer gespeichert", M().get("paper") == {"size": "A4", "quer": True} and page.inner_text("#pv-druck-lbl") == "A4 quer", M().get("paper"))
    key("Meta+z"); page.wait_for_timeout(150)
    check("Rückgängig holt A4 hoch zurück", "paper" not in M(), M().get("paper"))
    page.click("#btn-pvdruck"); page.wait_for_timeout(200)
    if not page.is_visible("#pv-pop"): page.click("#btn-pvdruck"); page.wait_for_timeout(200)
    page.fill('#pv-pop [data-meta="TITEL"]', "Prinzipschema Test"); page.keyboard.press("Tab"); page.wait_for_timeout(150)
    check("Plankopf: Titel geändert, auch auf dem Blatt", M()["meta"]["TITEL"] == "Prinzipschema Test" and "Prinzipschema Test" in page.inner_html("#sheet"))
    page.keyboard.press("Escape"); page.wait_for_timeout(150)
    check("Esc schliesst das Fenster Druck", not page.is_visible("#pv-pop"))

    # ---------- Zweites Blatt, Taste 4, Übersicht ----------
    page.evaluate("document.querySelector('#add-menu [data-new=prinzip]').click()"); page.wait_for_timeout(200)
    check("Plus: zweites Prinzipschema-Blatt im selben Modul", M()["meta"]["BLATT"] == "2" and page.evaluate("window.__schemacad.kind") == "prinzip" and "var" not in M())
    key("0"); page.wait_for_timeout(200)
    tile = page.locator("#el-tile-prinzip")
    # Übersicht: Ziffer = Platz der Kachel (seit 20.10.2026), im Modul öffnet Taste 4 das Prinzipschema
    pos = tile.inner_text().split("\n")[1] if tile.count() else ""
    check("Übersicht: Kachel Prinzipschema mit 2 Blättern und Platznummer", tile.count() == 1 and "2 Blätter" in tile.inner_text() and pos.isdigit(), tile.inner_text() if tile.count() else "")
    key(pos); page.wait_for_timeout(200)
    check("Übersicht: Ziffer der Kachel öffnet das Prinzipschema", page.evaluate("window.__schemacad.kind") == "prinzip" and not page.is_visible("#el-hub"))
    key("1"); page.wait_for_timeout(200); key("4"); page.wait_for_timeout(200)
    check("Im Modul: Taste 4 öffnet das Prinzipschema", page.evaluate("window.__schemacad.kind") == "prinzip" and not page.is_visible("#el-hub"))

    # ---------- PDF wie PV (eigenes PDF, Papier je Seite) ----------
    key("0"); page.wait_for_timeout(200)
    page.evaluate("window.__open = []; window.open = (u) => { window.__open.push(u); return {}; }; window.print = () => { window.__printed = true; }; 0")
    page.click("#el-tile-prinzip [data-elpdf]")
    page.wait_for_function("window.__open.length > 0", timeout=60000)
    txt = page.evaluate("(async () => { const b = new Uint8Array(await (await fetch(window.__open.shift())).arrayBuffer()); let s = ''; for (const c of b) s += String.fromCharCode(c); return s; })()")
    pp = [tuple(round(float(v) * 25.4 / 72) for v in m) for m in re.findall(r"/Type /Page\b.*?/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]", txt, re.S)]
    check("PDF des Moduls: 2 Seiten A4 hoch, Schrift eingebettet", pp == [(210, 297), (210, 297)] and "BarlowSC" in txt, pp)
    check("Druckteile danach leer", page.evaluate("document.querySelector('#printroot').innerHTML === ''"))

    # ---------- Speichern und Laden ----------
    d = D()
    check("Datei: Version 19, Modul prinzip", d["version"] == 19 and [s.get("kind") for s in d["sheets"]].count("prinzip") == 2, d["version"])
    path = OUT / "rundlauf.elplexa.json"; path.write_text(json.dumps(d))
    key("Escape"); page.evaluate("document.activeElement?.blur()")
    with page.expect_file_chooser() as fc:  # ungespeichert: zuerst Rückfrage
        page.keyboard.press("Meta+o"); page.wait_for_timeout(300)
        if page.is_visible(".modal"): page.click('.modal :text("Trotzdem öffnen")')
    fc.value.set_files(str(SRC)); page.wait_for_timeout(600)
    if page.is_visible("#el-hub"): key("4"); page.wait_for_timeout(300)
    check("Beispiel geladen und offen", page.evaluate("window.__schemacad.kind") == "prinzip" and len(M()["items"]) > 40, len(M()["items"]))
    check("Laden ohne Verlust (Objekte, Papier, Plankopf)", D()["sheets"] == json.loads(SRC.read_text())["sheets"])
    page.evaluate("document.querySelectorAll('#toasts .toast').forEach((t) => t.remove())")
    key("f"); page.wait_for_timeout(200)
    page.screenshot(path=str(OUT / "p2_beispiel.png"))
    page.locator("#svg").screenshot(path=str(OUT / "p3_beispiel_blatt.png"))
    page.evaluate("document.querySelector('#btn-dxf')?.click()"); page.wait_for_timeout(200)
    check("DXF: Hinweis «kommt später»", "Prinzipschema kommt später" in page.inner_text("#toasts"))
    page.close()

    # ---------- SchemaCAD v3: liest die Datei, bietet kein Prinzipschema an ----------
    page = b.new_page(viewport={"width": 1400, "height": 900}); page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; delete window.showDirectoryPicker;")
    page.goto((ROOT / "dist" / "schemacad.html").as_uri()); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    page.evaluate("document.activeElement?.blur()")
    with page.expect_file_chooser() as fc: page.keyboard.press("Meta+o")
    fc.value.set_files(str(SRC)); page.wait_for_timeout(600)
    check("v3: Datei mit Prinzipschema öffnet, Blatt angezeigt", page.evaluate("window.__schemacad.kind") == "prinzip" and "Prinzipschema EFH" in page.inner_html("#sheet"))
    check("v3: Plus-Menü ohne Prinzipschema", page.locator("#add-menu [data-new=prinzip]").is_hidden())
    page.close()
    check("keine Fehler in der Konsole", not errors, errors[:3])
    b.close()
print(f"\n{len(fails)} Fehler" if fails else f"\nPrinzipschema: alle Tests ok | Bilder: {OUT}")
sys.exit(1 if fails else 0)
