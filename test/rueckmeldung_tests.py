# Rückmeldung Schema CJ 16.10.2026 in der App: Verweise waagrecht, BMK SPD T, Wandlermessung (Zähler verschiebbar, Texte),
# Klemmenleiste ohne Klemmen, feste Blattreihenfolge, Plus-Knopf nach Blatttyp.
# Aufruf aus web-src: python3 test/rueckmeldung_tests.py [Bild.png]
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
fails, errors = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch(); page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    M = lambda: page.evaluate("window.__schemacad.model")
    D = lambda: page.evaluate("window.__schemacad.doc")
    def click(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.evaluate("(()=>{const r=document.querySelector('#svg').getBoundingClientRect();return {l:r.left,t:r.top}})()")
        page.mouse.click(r["l"] + v["x"] + x * v["z"], r["t"] + v["y"] + (210 - y) * v["z"]); page.wait_for_timeout(60)
    own = lambda: [i for i in M()["items"] if i["type"] == "symbol" and not i.get("main")]
    blatt = M()["meta"]["BLATT"]

    # 1. Verweis wird waagrecht gesetzt (gedreht wie die Verweise der Grundverkabelung)
    page.click('#left .var[data-sym="VOUT_4P"]'); click(200, 120); page.keyboard.press("Escape")
    ref = [i for i in own() if i["sym"] == "VOUT_4P"]
    check("Verweis abgehend waagrecht (rot 90)", len(ref) == 1 and ref[0]["rot"] == 90, str(ref))
    page.click('#left .var[data-sym="VIN_2P"]'); click(230, 120); page.keyboard.press("Escape")
    check("Verweis ankommend waagrecht", [i["rot"] for i in own() if i["sym"] == "VIN_2P"] == [90])
    page.click('#left .var[data-sym="LS_1P"]'); click(250, 150); page.keyboard.press("Escape")
    check("Andere Geräte weiter senkrecht", [i["rot"] for i in own() if i["sym"] == "LS_1P"] == [0])

    # 2. SPD bekommt BMK mit T aus Blatt und Spalte
    page.click('#left .var[data-sym="SPD_4P"]'); click(160, 120); page.keyboard.press("Escape")
    spd = [i for i in own() if i["sym"] == "SPD_4P"][0]
    check("SPD-BMK Blatt + T + Spalte", spd["attrs"]["BMK"].startswith(blatt + "T") and "-" not in spd["attrs"]["BMK"], spd["attrs"]["BMK"])

    # 3. Wandlermessung: ein Klick setzt Wandlerteil, Zähler und 10 Leitungen
    page.click('#left .var[data-sym="ZAEHLER_4P_W"]'); click(40, 185); page.keyboard.press("Escape")
    tr = [i for i in own() if i["sym"] == "ZW_WANDLER"]; box = [i for i in own() if i["sym"] == "ZW_ZAEHLER"]
    wires = [i for i in M()["items"] if i["type"] == "wire" and "wm" in i]
    check("Wandlermessung in Teilen gesetzt", len(tr) == 1 and len(box) == 1 and len(wires) == 10, f"{len(tr)} {len(box)} {len(wires)}")
    tr, box = tr[0], box[0]
    check("Zähler gehört zum Wandlerteil", box.get("of") == tr["id"] and all(w["of"] == tr["id"] for w in wires))
    check("Zähler-BMK automatisch mit P", box["attrs"]["BMK"].startswith(blatt + "P"), box["attrs"]["BMK"])
    # Zähler wählen und nach rechts und unten schieben: Leitungen folgen, knicken gestaffelt
    click(box["x"] + 17.5, box["y"] - 5)
    check("Zähler gewählt", page.evaluate("window.__schemacad.sel") == [box["id"]], str(page.evaluate("window.__schemacad.sel")))
    for _ in range(3): page.keyboard.press("ArrowRight")
    for _ in range(2): page.keyboard.press("ArrowDown")
    nb = [i for i in own() if i["sym"] == "ZW_ZAEHLER"][0]; ntr = [i for i in own() if i["sym"] == "ZW_WANDLER"][0]
    check("Zähler verschoben, Wandlerteil bleibt", nb["x"] > box["x"] and nb["y"] < box["y"] and (ntr["x"], ntr["y"]) == (tr["x"], tr["y"]))
    ws = sorted([i for i in M()["items"] if i["type"] == "wire" and "wm" in i], key=lambda w: w["wm"])
    ends_ok = all(abs(w["pts"][-1][0] - (nb["x"] + (w["pts"][0][0] - tr["x"]))) < 1e-6 and abs(w["pts"][-1][1] - nb["y"]) < 1e-6 for w in ws)
    check("Leitungen enden am verschobenen Zähler", ends_ok, str([w["pts"] for w in ws[:2]]))
    jy = [w["pts"][1][1] for w in ws]
    check("Jede Leitung knickt auf eigener Höhe", all(len(w["pts"]) == 4 for w in ws) and len(set(jy)) == 10, str(jy))
    # Texte: Wandlermessung änderbar, Sicherungen mit BMK und Nennstrom
    page.fill('[data-attr="TEXT"]', "Wandler 300/5"); page.keyboard.press("Tab"); page.wait_for_timeout(60)
    check("Text im Zähler geändert", [i for i in own() if i["sym"] == "ZW_ZAEHLER"][0]["attrs"]["TEXT"] == "Wandler 300/5")
    click(tr["x"] + 7.5, tr["y"] - 1)
    check("Wandlerteil gewählt", page.evaluate("window.__schemacad.sel") == [tr["id"]], str(page.evaluate("window.__schemacad.sel")))
    check("Felder Sicherung BMK und Nennstrom", page.locator('[data-attr="FBMK"]').count() == 1 and page.locator('[data-attr="FSTROM"]').input_value() == "10A")
    page.fill('[data-attr="FBMK"]', "F11"); page.keyboard.press("Tab"); page.wait_for_timeout(60)
    page.fill('[data-attr="FSTROM"]', "6A"); page.keyboard.press("Tab"); page.wait_for_timeout(60)
    t2 = [i for i in own() if i["sym"] == "ZW_WANDLER"][0]
    check("Sicherungen beschriftet", t2["attrs"]["FBMK"] == "F11" and t2["attrs"]["FSTROM"] == "6A", str(t2["attrs"]))
    # Wandlerteil verschieben: Zähler und Leitungen kommen mit
    click(tr["x"] + 7.5, tr["y"] - 1); page.keyboard.press("Shift+ArrowLeft")
    t3 = [i for i in own() if i["sym"] == "ZW_WANDLER"][0]; b3 = [i for i in own() if i["sym"] == "ZW_ZAEHLER"][0]
    check("Zähler folgt dem Wandlerteil", round(t3["x"] - t2["x"], 3) == round(b3["x"] - nb["x"], 3) != 0)
    check("DXF enthält den Zähler", "ZW_ZAEHLER" in page.evaluate("window.__schemacad.exportDxf()"))
    # Löschen nimmt Zähler und Leitungen mit, Rückgängig bringt sie zurück
    page.keyboard.press("Delete")
    check("Löschen entfernt alle Teile", not [i for i in M()["items"] if i.get("sym", "").startswith("ZW_") or "wm" in i])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(60)
    check("Rückgängig bringt die Teile zurück", len([i for i in M()["items"] if "wm" in i]) == 10)

    # 5. Klemmenleiste ohne Klemmen
    t = [i for i in M()["items"] if i["type"] == "terminals"]
    check("Klemmenleiste vorhanden", len(t) >= 1)
    t = t[0]
    click(t["x"], t["y"] - 4)
    page.select_option("[data-termdraw]", "off"); page.wait_for_timeout(60)
    t1 = [i for i in M()["items"] if i["id"] == t["id"]][0]
    check("Option keine Klemme", t1.get("noterm") is True and t1["bmk"] == t["bmk"] and t1["cable"] == t["cable"])
    check("Feld letzte Klemme ausgeblendet", page.locator("[data-termpe]").count() == 0)
    page.select_option("[data-termdraw]", "on"); page.wait_for_timeout(60)
    check("Wieder mit Klemmen", "noterm" not in [i for i in M()["items"] if i["id"] == t["id"]][0])
    page.select_option("[data-termdraw]", "off"); page.wait_for_timeout(60)

    # 6. Plus-Knopf: Blatt vom aktuellen Typ; Rechtsklick öffnet das Menü. 4. Reihenfolge fest
    kinds = lambda: [s.get("kind", "schema") for s in D()["sheets"]]
    n0 = kinds().count("schema"); page.click("#sheet-add"); page.wait_for_timeout(100)
    check("Plus auf Schema: Schemablatt", kinds().count("schema") == n0 + 1 and page.evaluate("window.__schemacad.kind") == "schema", str(kinds()))
    page.click("#sheet-add", button="right"); page.wait_for_timeout(100)
    check("Rechtsklick öffnet Menü", page.locator("#add-menu").is_visible())
    page.click('#add-menu [data-new="dispo"]'); page.wait_for_timeout(150)
    check("Disposition über Menü", page.evaluate("window.__schemacad.kind") == "dispo")
    page.click("#sheet-add"); page.wait_for_timeout(150)
    check("Plus auf Disposition: Disposition", kinds().count("dispo") == 2 and page.evaluate("window.__schemacad.kind") == "dispo", str(kinds()))
    page.click("#sheet-add", button="right"); page.wait_for_timeout(100); page.click('#add-menu [data-new="pv"]'); page.wait_for_timeout(150)
    page.click("#sheet-add"); page.wait_for_timeout(150)
    check("Plus auf Stringplan: Stringplan", kinds().count("pv") == 2 and page.evaluate("window.__schemacad.kind") == "pv", str(kinds()))
    page.click("#sheet-add", button="right"); page.wait_for_timeout(100); page.click('#add-menu [data-new="sheet"]')
    page.wait_for_timeout(150)
    k = kinds()
    check("Reihenfolge Titel, Inhalt, Schema, Legende, Dispo, PV", k == ["title", "toc"] + ["schema"] * k.count("schema") + ["legend"] + ["dispo"] * 2 + ["pv"] * 2, str(k))
    check("Neues Schemablatt vor der Legende aktiv", page.evaluate("window.__schemacad.kind") == "schema" and k[page.evaluate("window.__schemacad.active")] == "schema")
    check("Titel des Plus-Knopfs nennt den Typ", "Schemablatt" in page.get_attribute("#sheet-add", "title"))
    if len(sys.argv) > 1:  # Bild der Wandlermessung mit verschobenem Zähler (erstes Schemablatt)
        page.click("#sheet-cur"); page.wait_for_timeout(100); page.locator("#sheet-menu .mi").nth(2).click(); page.wait_for_timeout(200)
        page.locator("#svg").screenshot(path=sys.argv[1])
    b.close()
check("Keine Seitenfehler", not errors, "; ".join(errors))
print("ok" if not fails else f"{len(fails)} Fehler")
sys.exit(1 if fails else 0)
