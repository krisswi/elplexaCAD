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

    # 3. Wandlermessung nach BKW (CJ 17.10.): ein Klick setzt Einzelteile, jedes Teil einzeln bearbeitbar und löschbar
    n0 = len(M()["items"])
    page.click('#left .var[data-sym="ZAEHLER_4P_W"]'); click(40, 190); page.keyboard.press("Escape")
    cnt = lambda s: len([i for i in own() if i["sym"] == s])
    check("Wandlermessung in Einzelteilen gesetzt", [cnt(s) for s in ["ZW_CT", "ZW_SICH", "ZW_PK", "ZW_PK1", "ZW_ZAEHLER2", "ZAEHLER_4P_W"]] == [3, 3, 3, 1, 1, 0],
          str([cnt(s) for s in ["ZW_CT", "ZW_SICH", "ZW_PK", "ZW_PK1", "ZW_ZAEHLER2"]]))
    box = [i for i in own() if i["sym"] == "ZW_ZAEHLER2"][0]
    check("Zähler-BMK automatisch mit P", box["attrs"]["BMK"].startswith(blatt + "P"), box["attrs"]["BMK"])
    # Sicherung wählen und beschriften
    f1 = [i for i in own() if i["sym"] == "ZW_SICH"][0]
    click(f1["x"], f1["y"] - 2.5)
    check("Sicherung gewählt", page.evaluate("window.__schemacad.sel") == [f1["id"]], str(page.evaluate("window.__schemacad.sel")))
    page.fill('[data-attr="FSTROM"]', "6A"); page.keyboard.press("Tab"); page.wait_for_timeout(60)
    check("Sicherung beschriftet", [i for i in own() if i["id"] == f1["id"]][0]["attrs"]["FSTROM"] == "6A")
    # Zähler allein verschieben und löschen: der Rest bleibt
    click(box["x"] + 12.5, box["y"] - 8)
    check("Zähler gewählt", page.evaluate("window.__schemacad.sel") == [box["id"]], str(page.evaluate("window.__schemacad.sel")))
    page.fill('[data-attr="TEXT"]', "Wandler 300/5"); page.keyboard.press("Tab"); page.wait_for_timeout(60)
    check("Text am Zähler geändert", [i for i in own() if i["id"] == box["id"]][0]["attrs"]["TEXT"] == "Wandler 300/5")
    n1 = len(M()["items"])
    click(box["x"] + 12.5, box["y"] - 8); page.keyboard.press("Delete")
    check("Nur der Zähler gelöscht", cnt("ZW_ZAEHLER2") == 0 and cnt("ZW_PK") == 3 and len(M()["items"]) == n1 - 1, f"{n1} {len(M()['items'])}")
    page.keyboard.press("Meta+z"); page.wait_for_timeout(60)
    check("Rückgängig bringt den Zähler zurück", cnt("ZW_ZAEHLER2") == 1)
    # Eine Leitung einzeln löschen
    wn = len([i for i in M()["items"] if i["type"] == "wire"])
    click(box["x"] + 5, box["y"] + 10); page.keyboard.press("Delete")
    check("Einzelne Leitung gelöscht", len([i for i in M()["items"] if i["type"] == "wire"]) == wn - 1)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(60)
    dxf = page.evaluate("window.__schemacad.exportDxf()")
    check("DXF enthält Zähler und Prüfklemmen", "ZW_ZAEHLER2" in dxf and "ZW_PK" in dxf)

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
