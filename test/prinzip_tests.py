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
    page.click('[data-sym="PZ_LEITER_3"]'); click(90, 260); key("Escape")  # Leitungsangabe neben die Leitung
    items = M()["items"]
    syms = [i["sym"] for i in items if i["type"] == "symbol"]
    check("Symbole gesetzt: FI/LS, Verbraucher, Leitungsangabe mit 3 Strichen", syms == ["PZ_FILS", "PZ_VERBR", "PZ_LEITER_3"], syms)
    fils = next(i for i in items if i.get("sym") == "PZ_FILS")
    check("Symbol auf dem Raster, Text und leere BMK", fils["x"] == 50 and fils["y"] == 250 and fils["attrs"] == {"TEXT": "FI/LS B13A 30mA", "BMK": ""}, fils)
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
    check("Eigenschaften rechts: Text und BMK von Hand, keine automatische BMK", fils["attrs"] == {"TEXT": "FI/LS C13A 30mA", "BMK": "3F1"}, fils["attrs"])
    key("Escape")
    # Leitungsangabe: Anzahl Striche rechts umstellen
    click(92.5, 260)
    sel = page.locator('#right [data-sympoles]')
    check("Leitungsangabe: Auswahl der Striche rechts", sel.count() == 1 and "5 Striche" in sel.inner_text())
    if sel.count(): sel.select_option("PZ_LEITER_5"); page.wait_for_timeout(150)
    check("Leitungsangabe auf 5 Striche", any(i.get("sym") == "PZ_LEITER_5" for i in M()["items"]))
    key("Escape"); key("Escape")
    page.screenshot(path=str(OUT / "p1_von_hand.png"))

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
    check("Übersicht: Kachel Prinzipschema mit 2 Blättern und Taste 4", tile.count() == 1 and "2 Blätter" in tile.inner_text() and "4" in tile.inner_text(), tile.inner_text() if tile.count() else "")
    key("4"); page.wait_for_timeout(200)
    check("Taste 4 öffnet das Prinzipschema", page.evaluate("window.__schemacad.kind") == "prinzip" and not page.is_visible("#el-hub"))

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
