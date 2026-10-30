# UI-Test Plan-Import (CJ 30.10.2026, nur elplexaCAD): Knopf «Import», Datei (.elplexa.json) laden, Dialog mit Ebenen, unbekannte Symbole
# und Farben zuordnen (im Browser gemerkt), Fixpunkt per Maus mit Fang und R, Enter übernimmt (ein Rückgängig-Schritt), Esc bricht ab,
# defekte Datei ändert nichts, «Als neuer Plan». Vorher: node build.mjs elplexa. Aufruf: python3 test/plan_dateiimport_tests.py [Bild.png]
# Testdatei entsteht hier (erfunden, keine Kundendaten).
import sys, tempfile, json, math
from pathlib import Path
from playwright.sync_api import sync_playwright
from elstart import projektansicht
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(tempfile.mkdtemp(prefix="plan_dimport_"))
SHOT = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT / "import.png"
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)

# Stockwerk wie vom Skill «plan-aufbereiten»: Hintergrund gesperrt, Apparate aktiv, Leitungen, Beschriftung; ein unbekanntes Symbol, eine fremde Farbe
LAYERS = [{"id": "bg", "name": "Hintergrund", "lock": True}, {"id": "app", "name": "Apparate"}, {"id": "ltg", "name": "Leitungen"}, {"id": "txt", "name": "Beschriftung"}]
ITEMS = [
    {"id": 1, "type": "wall", "layer": "bg", "a": [0, 0], "b": [3000, 0], "d": 150, "mat": "mauer"},
    {"id": 2, "type": "wall", "layer": "bg", "a": [3000, 0], "b": [3000, 2000], "d": 150, "mat": "mauer"},
    {"id": 3, "type": "opening", "wall": 1, "t": 500, "w": 900, "kind": "tuer", "hinge": "l", "side": 1},
    {"id": 4, "type": "sym", "layer": "app", "key": "STD", "at": [1000, 300], "r": 0},
    {"id": 5, "type": "sym", "layer": "app", "key": "ALT_DOSE", "at": [2000, 300], "r": 0},
    {"id": 6, "type": "sym", "layer": "app", "key": "ALT_DOSE", "at": [2500, 300], "r": 0},
    {"id": 7, "type": "line", "layer": "ltg", "pts": [[1000, 300], [1000, 1000], [2000, 1000]], "kind": "decke", "col": "#123456"},
    {"id": 8, "type": "text", "layer": "txt", "at": [1500, 1500], "txt": "Büro"},
]
FILE = OUT / "Test-EG.elplexa.json"
FILE.write_text(json.dumps({"format": "schemacad", "version": 33, "nextId": 9, "sheets": [{"kind": "plan", "meta": {"BLATT": "1"}, "paper": {"size": "A3", "quer": True, "den": 50}, "layers": LAYERS, "alay": "app", "items": ITEMS}]}))
BAD = OUT / "kaputt.elplexa.json"; BAD.write_text("{nicht json")

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 900}); page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; delete window.showDirectoryPicker;")
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(400); projektansicht(page)
    M = lambda: page.evaluate("window.__schemacad.model")
    of = lambda t: [x for x in M()["items"] if x["type"] == t]
    def key(k, shift=False):
        page.evaluate("([k, s]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: s, bubbles: true, cancelable: true }))", [k, shift]); page.wait_for_timeout(60)
    def keys(s):
        for c in s: key(c)
    def at(x, y):  # Welt-mm → Bildschirm (app.js toScreen, H = 210)
        v = page.evaluate("window.__schemacad.view"); r = page.locator("#svg").bounding_box()
        return r["x"] + v["x"] + x * v["z"], r["y"] + v["y"] + (210 - y) * v["z"]
    def importiere(path):
        with page.expect_file_chooser() as fc: page.click("#el-plimport")
        fc.value.set_files(str(path)); page.wait_for_timeout(300)
    near = lambda a, q, tol=0.5: math.hypot(a[0] - q[0], a[1] - q[1]) < tol

    # ---------- Plan mit einer Wand (4000 mm ab dem Nullpunkt nach rechts) ----------
    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('[data-elnew="plan"]'); page.wait_for_timeout(300)
    check("Knopf «Import» im Plan sichtbar", page.locator("#el-plimport").is_visible())
    key("w"); page.keyboard.down("Alt"); page.mouse.click(*at(0, 0)); page.keyboard.up("Alt")
    keys("4000"); key("Tab"); keys("0"); key("Enter"); key("Escape"); key("v"); key("f"); page.wait_for_timeout(200)
    W0 = of("wall")
    check("Ausgangsplan: eine Wand", len(W0) == 1, W0)
    before = page.evaluate("JSON.stringify(window.__schemacad.doc.sheets)")

    # ---------- Defekte Datei: Meldung, nichts verändert ----------
    importiere(BAD)
    check("Defekte Datei: deutsche Meldung", "kein gültiges JSON" in page.inner_text("#toasts"), page.inner_text("#toasts"))
    check("Defekte Datei: kein Dialog, Plan unverändert", page.locator("#modal-root .modal").count() == 0 and page.evaluate("JSON.stringify(window.__schemacad.doc.sheets)") == before)

    # ---------- Dialog: Ebenen, Zuordnung ----------
    importiere(FILE)
    dl = page.locator("#modal-root .modal")
    check("Dialog offen", dl.count() == 1)
    txt = dl.inner_text()
    check("Ebenen mit Anzahl, alle vorgewählt", all(s in txt for s in ["Hintergrund (2 Objekte)", "Apparate (3 Objekte)", "Leitungen (1 Objekt)", "Beschriftung (1 Objekt)"]) and page.locator("[data-implay]:checked").count() == 4, txt)
    check("Unbekanntes Symbol mit Anzahl", "ALT_DOSE (2×)" in txt and page.locator('[data-impsym="ALT_DOSE"]').input_value() == "", txt)
    check("Unbekannte Farbe mit Anzahl", "#123456 (1×)" in txt)
    check("Ziel: In offenen Plan vorgewählt", page.locator('[data-impziel][value="open"]').is_checked())
    page.select_option('[data-impsym="ALT_DOSE"]', "STD3")
    page.select_option('[data-impcol="#123456"]', "#d4141c")
    page.uncheck('[data-implay="txt"]')
    page.click("#modal-root [data-ok]"); page.wait_for_timeout(200)
    check("Gemerkt im Browser", page.evaluate("JSON.parse(localStorage.getItem('elplexa-plimport-map'))") == {"syms": {"ALT_DOSE": "STD3"}, "cols": {"#123456": "#d4141c"}})

    # ---------- Fixpunkt: Vorschau am Mauszeiger, R dreht, Klick am Wandende (Fang), Enter ----------
    page.mouse.move(*at(3000, 1500)); page.wait_for_timeout(100)
    check("Vorschau halbtransparent sichtbar", page.locator("#overlay .pl-imppv, .pl-imppv").count() == 1)
    check("Hinweis: Enter übernimmt, Esc bricht ab", "Enter übernimmt" in page.inner_text("#hint"), page.inner_text("#hint"))
    check("Noch nichts eingefügt", page.evaluate("JSON.stringify(window.__schemacad.doc.sheets)") == before)
    key("r")
    check("R dreht (90°)", "jetzt 90°" in page.inner_text("#hint"), page.inner_text("#hint"))
    page.mouse.move(*at(4003, 4), steps=4); page.mouse.click(*at(4003, 4)); page.wait_for_timeout(100)  # knapp neben dem Wandende: Fang
    page.screenshot(path=str(SHOT))
    key("Enter"); page.wait_for_timeout(200)
    m = M()
    names = [l["name"] for l in m["layers"]]
    check("Ebenen kollisionsfrei angelegt, Beschriftung weggelassen", names == ["Hintergrund", "Hintergrund 2", "Apparate", "Leitungen"], names)
    lay = {l["name"]: l for l in m["layers"]}
    check("Eigenschaften bleiben: Hintergrund 2 gesperrt, Apparate aktiv", lay["Hintergrund 2"]["lock"] and m["alay"] == lay["Apparate"]["id"])
    ws = [w for w in of("wall") if w["layer"] == lay["Hintergrund 2"]["id"]]
    check("Fixpunkt am Wandende, um 90° gedreht", len(ws) == 2 and near(ws[0]["a"], [4000, 0]) and near(ws[0]["b"], [4000, 3000]) and near(ws[1]["b"], [2000, 3000]), [(w["a"], w["b"]) for w in ws])
    op = of("opening")
    check("Tür hängt an der importierten Wand", len(op) == 1 and op[0]["wall"] == ws[0]["id"])
    sy = sorted(of("sym"), key=lambda s: s["at"][1])
    check("Symbole zugeordnet und gedreht", [s["key"] for s in sy] == ["STD", "STD3", "STD3"] and all(s["r"] == 90 for s in sy) and near(sy[0]["at"], [3700, 1000]), [(s["key"], s["at"], s["r"]) for s in sy])
    ln = of("line")
    check("Farbe zugeordnet", len(ln) == 1 and ln[0].get("col") == "#d4141c")
    check("Kein Text (Ebene abgewählt)", of("text") == [])
    check("Meldung nach dem Import", "Importiert: 7 Objekte auf 3 Ebenen, gedreht 90°" in page.inner_text("#toasts"), page.inner_text("#toasts"))
    page.keyboard.press("Meta+z"); page.wait_for_timeout(200)
    check("Ein Rückgängig-Schritt nimmt den ganzen Import zurück", page.evaluate("JSON.stringify(window.__schemacad.doc.sheets)") == before)

    # ---------- Esc bricht ab, Zuordnung vorgeschlagen ----------
    importiere(FILE)
    check("Zuordnung beim nächsten Import vorgeschlagen", page.locator('[data-impsym="ALT_DOSE"]').input_value() == "STD3" and page.locator('[data-impcol="#123456"]').input_value() == "#d4141c")
    page.click("#modal-root [data-ok]"); page.wait_for_timeout(200)
    page.mouse.move(*at(1000, 1000)); key("w"); key("1")
    check("Werkzeugtasten ruhen während der Vorschau", M()["items"] == json.loads(before)[-1]["items"] and page.locator(".pl-imppv").count() == 1)
    key("Escape"); page.wait_for_timeout(100)
    check("Esc bricht ab, nichts verändert", page.locator(".pl-imppv").count() == 0 and page.evaluate("JSON.stringify(window.__schemacad.doc.sheets)") == before)

    # ---------- Als neuer Plan ----------
    n0 = page.evaluate("window.__schemacad.doc.sheets.filter((s) => s.kind === 'plan').length")
    importiere(FILE)
    page.check('[data-impziel][value="new"]'); page.click("#modal-root [data-ok]"); page.wait_for_timeout(300)
    m = M()
    check("Neuer Plan angelegt und offen", page.evaluate("window.__schemacad.doc.sheets.filter((s) => s.kind === 'plan').length") == n0 + 1 and len(m["items"]) == 8)
    check("Neuer Plan: Grundriss auf dem Hintergrund, Lage wie in der Datei", [l["name"] for l in m["layers"]] == ["Hintergrund", "Apparate", "Leitungen", "Beschriftung"] and near(of("wall")[0]["b"], [3000, 0]) and m["alay"] != "bg")
    page.keyboard.press("Meta+z"); page.wait_for_timeout(200)
    check("Rückgängig: neuer Plan wieder weg", page.evaluate("window.__schemacad.doc.sheets.filter((s) => s.kind === 'plan').length") == n0)

    b.close()
check("Keine Fehler in der Konsole", not errors, errors)
print(f"Bild: {SHOT}")
if fails: print(f"{len(fails)} Fehler"); sys.exit(1)
print("Alle Plan-Import-Tests grün.")
