# UI-Tests Blatt duplizieren und löschen (Wunsch CJ 18.10.2026): Disposition, Stringplan (Variante mit eigener Stringübersicht), Schemablatt.
# Kopie unabhängig (neue IDs, Verweise offen, eigene sid), Speichern/Laden ohne Verlust, Druck und DXF mit beiden, Löschen mit Rückfrage
# und Rückgängig, elplexaCAD (Blattliste im Modul). Aufruf aus web-src nach `node build.mjs` und `node build.mjs elplexa`:
# python3 test/blatt_kopie_tests.py
import base64, json, sys, tempfile, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parent))
ROOT = Path(__file__).resolve().parent.parent
TMP = Path(tempfile.mkdtemp(prefix="blatt_kopie_"))
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)

# Kleinste PDF (eine Seite A4 quer mit Rechteck) als Dachplan
def make_pdf(w, h, ops):
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w} {h}] /Contents 4 0 R >>", f"<< /Length {len(ops)} >>\nstream\n{ops}\nendstream"]
    out, offs = b"%PDF-1.4\n", []
    for i, o in enumerate(objs): offs.append(len(out)); out += f"{i + 1} 0 obj\n{o}\nendobj\n".encode()
    x = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode() + "".join(f"{o:010d} 00000 n \n" for o in offs).encode()
    return out + f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n".encode()
PDF = base64.b64encode(make_pdf(842, 595, "2 w 50 50 742 495 re S")).decode()
mA = {"id": "mA", "name": "Test 49,5", "l": 1700, "b": 1000, "voc": 49.5, "isc": 10, "tkVoc": -0.27, "vsys": 1500}
FIX = {"format": "schemacad", "version": 13, "active": 0, "nextId": 100, "noTitle": True, "noToc": True, "pvLayer": "kabel",
       "pv": {"moduleTypes": [mA]}, "assets": {"a1": {"name": "dach.pdf", "type": "application/pdf", "data": PDF}},
       "sheets": [
           {"meta": {"BLATT": "3", "TITEL": "Hauptverteilung"}, "items": [
               {"id": 10, "type": "symbol", "sym": "LS_1P", "x": 60, "y": 120, "rot": 0, "attrs": {}},
               {"id": 11, "type": "symbol", "sym": "VOUT_1P", "x": 250, "y": 120, "rot": 0, "attrs": {}, "link": 21}]},
           {"meta": {"BLATT": "4", "TITEL": "UV"}, "items": [{"id": 21, "type": "symbol", "sym": "VIN_1P", "x": 30, "y": 120, "rot": 0, "attrs": {}, "link": 11}]},
           {"kind": "dispo", "sid": 50, "meta": {"BLATT": "1", "TITEL": "UV Stall"}, "items": [
               {"id": 30, "type": "plate", "x": 100, "y": 100, "w": 250, "h": 400, "name": "", "fixed": True},
               {"id": 31, "type": "text", "x": 120, "y": 520, "h": 15, "s": "Original"}]},
           {"kind": "pv", "sid": 60, "meta": {"BLATT": "1", "TITEL": "Dach Süd"},
            "bg": {"asset": "a1", "name": "dach.pdf", "page": 1, "w": 842, "h": 595, "fix": [100, 500], "mmPerPt": 100 * 25.4 / 72},
            "items": [{"id": 40, "type": "pvmodule", "mt": "mA", "x": 0, "y": 0, "quer": False},
                      {"id": 41, "type": "pvmodule", "mt": "mA", "x": 1005, "y": 0, "quer": False},
                      {"id": 42, "type": "pvstring", "name": "1.1.1", "mods": [40, 41]}]},
           {"kind": "pvtab", "meta": {"BLATT": "1"}, "items": []}]}
F0 = TMP / "Kopie.schemacad.json"; F0.write_text(json.dumps(FIX))

def run(b, html, elplexa):
    tag = "elplexa: " if elplexa else ""
    page = b.new_page(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; delete window.showDirectoryPicker;")
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "favicon" not in m.text else None)
    page.goto((ROOT / "dist" / html).as_uri()); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    D = lambda: page.evaluate("window.__schemacad.doc")
    A = lambda: page.evaluate("window.__schemacad.active")
    def open_file(path):
        page.evaluate("document.activeElement?.blur()")
        with page.expect_file_chooser() as fc: page.keyboard.press("Meta+o")
        fc.value.set_files(str(path)); page.wait_for_timeout(500)
        if page.locator("#el-hub").count() and page.is_visible("#el-hub"): page.keyboard.press("Escape"); page.wait_for_timeout(150)
    def save(name):
        page.evaluate("document.activeElement?.blur()")
        with page.expect_download() as dl: page.keyboard.press("Meta+s")
        out = TMP / name; dl.value.save_as(str(out)); page.wait_for_timeout(300); return no_auto(json.loads(out.read_text()))
    def modid(sh):
        k = sh.get("kind") or "schema"; b = "dispo" if k == "dispo" else "pv" if k in ("pv", "pvtab") else "schema"
        v = 1 if k in ("title", "toc", "legend") else sh.get("var", 1)
        return b if v == 1 else f"{b}-{v}"
    def goto(pred):
        i = next(k for k, sh in enumerate(D()["sheets"]) if pred(sh))
        if elplexa and A() != i and modid(D()["sheets"][A()]) != modid(D()["sheets"][i]):  # anderes Modul: über die Kachel der Übersicht
            page.evaluate("document.activeElement?.blur()")
            if not page.is_visible("#el-hub"): page.keyboard.press("0"); page.wait_for_timeout(300)
            page.click(f"#el-tile-{modid(D()['sheets'][i])}"); page.wait_for_timeout(300)
        if A() != i:
            page.click("#sheet-cur"); page.wait_for_timeout(100)
            page.click(f'#sheet-menu [data-sheet="{i}"]')
            page.wait_for_timeout(300)
        return i
    def sheet_act(a):
        page.click("#sheet-cur"); page.wait_for_timeout(100); page.click(f'#sheet-menu [data-sheetact="{a}"]'); page.wait_for_timeout(250)
    def confirm(): page.wait_for_selector(".modal"); t = page.inner_text(".modal"); page.click('.modal [data-r="1"]'); page.wait_for_timeout(250); return t
    def undo(): page.evaluate("document.activeElement?.blur()"); page.keyboard.press("Meta+z"); page.wait_for_timeout(150)
    ids = lambda sh: [i["id"] for i in sh["items"]]
    kinds = lambda d: [(s.get("kind") or "schema", s.get("var", 1)) for s in d["sheets"]]

    open_file(F0)
    d0 = D()
    check(tag + "Datei geladen", len([s for s in d0["sheets"] if s.get("kind") != "legend"]) == 5, kinds(d0))  # Legende ergänzt die App

    # ---------- Disposition ----------
    if elplexa: page.evaluate("document.activeElement?.blur()"); page.keyboard.press("2"); page.wait_for_timeout(300)  # Modul Disposition
    goto(lambda s: s.get("kind") == "dispo")
    page.click("#sheet-cur"); page.wait_for_timeout(100)
    foot = page.locator("#sheet-menu .sfoot [data-sheetact]")
    check(tag + "Blattliste: Fusszeile Duplizieren und Löschen", foot.count() == 2 and "Duplizieren" in page.inner_text("#sheet-menu .sfoot") and "Löschen" in page.inner_text("#sheet-menu .sfoot"))
    page.keyboard.press("Escape")
    sheet_act("dup")
    d = D(); dis = [s for s in d["sheets"] if s.get("kind") == "dispo"]
    cur = d["sheets"][A()]
    check(tag + "Dispo dupliziert: Kopie aktiv, Blatt 2, Titel „UV Stall – Variante 2“", len(dis) == 2 and cur is not None and cur["meta"]["BLATT"] == "2" and cur["meta"]["TITEL"] == "UV Stall – Variante 2", [(s["meta"]["BLATT"], s["meta"]["TITEL"]) for s in dis])
    check(tag + "Dispo-Kopie: neue sid und neue IDs, gleicher Inhalt", dis[1]["sid"] != dis[0]["sid"] and not set(ids(dis[1])) & set(ids(dis[0]))
          and [{k: v for k, v in i.items() if k != "id"} for i in dis[1]["items"]] == [{k: v for k, v in i.items() if k != "id"} for i in dis[0]["items"]])
    check(tag + "Blattleiste zeigt die Kopie", "Dispo 2" in page.inner_text("#sheetbar"))
    # Kopie ändern: alles wählen und löschen; Original bleibt
    page.evaluate("document.activeElement?.blur()"); page.keyboard.press("Meta+a"); page.keyboard.press("Delete"); page.wait_for_timeout(150)
    dis = [s for s in D()["sheets"] if s.get("kind") == "dispo"]
    check(tag + "Kopie geändert (leer), Original unverändert", dis[1]["items"] == [] and len(dis[0]["items"]) == 2, [len(s["items"]) for s in dis])
    undo()
    sheet_act("dup")  # Kopie der Kopie: Variante 3
    dis = [s for s in D()["sheets"] if s.get("kind") == "dispo"]
    check(tag + "Kopie der Kopie heisst „UV Stall – Variante 3“, Blatt 3", len(dis) == 3 and dis[2]["meta"]["TITEL"] == "UV Stall – Variante 3" and dis[2]["meta"]["BLATT"] == "3", [s["meta"]["TITEL"] for s in dis])
    t = (sheet_act("del"), confirm())[1]
    check(tag + "Löschen mit Rückfrage", "gelöscht" in t and len([s for s in D()["sheets"] if s.get("kind") == "dispo"]) == 2, t)
    undo()
    check(tag + "Rückgängig holt das gelöschte Blatt zurück", len([s for s in D()["sheets"] if s.get("kind") == "dispo"]) == 3)
    sheet_act("del"); confirm()
    if not elplexa:  # rechte Leiste: Knopf Blatt duplizieren
        check("Rechte Leiste Dispo: Blatt duplizieren und Blatt löschen", page.locator('#right [data-act="dupsheet"]').count() == 1 and page.locator('#right [data-act="delsheet"]').count() == 1)

    # ---------- Stringplan: neue Variante mit eigener Stringübersicht ----------
    if elplexa: page.evaluate("document.activeElement?.blur()"); page.keyboard.press("3"); page.wait_for_timeout(300)
    goto(lambda s: s.get("kind") == "pv")
    sheet_act("dup")
    d = D(); k = kinds(d)
    pvs = [s for s in d["sheets"] if s.get("kind") == "pv"]; tabs = [s for s in d["sheets"] if s.get("kind") == "pvtab"]
    check(tag + "Stringplan dupliziert: Variante 2 mit eigener Stringübersicht, Reihenfolge je Variante", k[-4:] == [("pv", 1), ("pvtab", 1), ("pv", 2), ("pvtab", 2)], k)
    c = pvs[1]; o = pvs[0]
    st = [i for i in c["items"] if i["type"] == "pvstring"][0]
    cm = [i["id"] for i in c["items"] if i["type"] == "pvmodule"]
    check(tag + "PV-Kopie: Blatt 2, Titel „Dach Süd – Variante 2“, neue sid", c["meta"]["BLATT"] == "2" and c["meta"]["TITEL"] == "Dach Süd – Variante 2" and c["sid"] != o["sid"], (c["meta"], c.get("sid")))
    check(tag + "PV-Kopie: String 1.1.1 zeigt auf die neuen Module", st["name"] == "1.1.1" and st["mods"] == cm and not set(cm) & set(ids(o)), (st, cm))
    check(tag + "PV-Kopie: gleicher PDF-Dachplan (geteilt), Massstab und Fixpunkt", c["bg"] == o["bg"] and c["bg"]["asset"] == "a1" and list(d.get("assets", {}).keys()) in ([], ["a1"]))
    check(tag + "Blattleiste: Stringplan 2 · V2", "Stringplan 2 · V2" in page.inner_text("#sheetbar"), page.inner_text("#sheetbar"))
    # Kopie ändern: Verkabelung löschen; Original behält den String
    page.click('[data-pvact="strclear"]'); confirm()
    pvs = [s for s in D()["sheets"] if s.get("kind") == "pv"]
    check(tag + "Variante 2 ohne String, Variante 1 mit String", [len([i for i in s["items"] if i["type"] == "pvstring"]) for s in pvs] == [1, 0], ([len([i for i in s["items"] if i["type"] == "pvstring"]) for s in pvs], page.inner_text("#toasts")))
    undo()
    # Stringübersicht je Variante: keine Meldung „auch auf“, jede nur mit ihren Strings
    goto(lambda s: s.get("kind") == "pvtab" and s.get("var", 1) == 1)
    rows1 = page.evaluate("[...document.querySelectorAll('#items .pvtab-row')].map(g=>[g.dataset.name,g.dataset.lvl,g.textContent])")
    txt1 = page.evaluate("document.querySelector('#sheet').textContent + document.querySelector('#items').textContent")
    check(tag + "Stringübersicht V1: ein String aus Stringplan 1, keine Doppelmeldung, „Variante 1“", len(rows1) == 1 and "Stringplan 1" in rows1[0][2] and "auch auf" not in rows1[0][2] and "Variante 1" in txt1, (rows1, txt1[:200]))
    goto(lambda s: s.get("kind") == "pvtab" and s.get("var", 1) == 2)
    rows2 = page.evaluate("[...document.querySelectorAll('#items .pvtab-row')].map(g=>[g.dataset.name,g.dataset.lvl,g.textContent])")
    check(tag + "Stringübersicht V2: nur Stringplan 2", len(rows2) == 1 and "Stringplan 2" in rows2[0][2] and "auch auf" not in rows2[0][2], rows2)
    # Neuer Stringplan aus Variante 2 gehört zu Variante 2; Stringübersicht V2 gibt es schon
    page.click("#sheet-add", button="right"); page.click('[data-new="pvtab"]'); page.wait_for_timeout(200)
    check(tag + "Plus Stringübersicht in V2: zeigt die vorhandene", len([s for s in D()["sheets"] if s.get("kind") == "pvtab"]) == 2 and "PV-Stringplan 2" in page.inner_text("#toasts"), page.inner_text("#toasts"))
    # Stringübersicht duplizieren = ganze Variante
    sheet_act("dup")
    k = kinds(D())
    check(tag + "Stringübersicht dupliziert: Variante 3 mit Stringplan und Übersicht", k[-2:] == [("pv", 3), ("pvtab", 3)] and D()["sheets"][A()].get("kind") == "pvtab", k)
    sheet_act("del"); confirm()
    goto(lambda s: s.get("kind") == "pv" and s.get("var") == 3); sheet_act("del"); confirm()
    check(tag + "Variante 3 einzeln gelöscht", [x for x in kinds(D()) if x[1] == 3] == [], kinds(D()))
    # Strings fortsetzen (CJ 18.10.2026): Einstellung des PV-Moduls, Strings bleiben, Module getrennt
    goto(lambda s: s.get("kind") == "pv" and s.get("var") == 2); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    cb = page.locator('#right [data-pvopt="cont"]')
    check(tag + "Panel Stringplan: „Strings fortsetzen“ ohne Haken, beginnt bei 1.1.1", cb.count() == 1 and not cb.is_checked() and "beginnt bei 1.1.1" in page.inner_text("#right"), page.inner_text("#right")[-300:])
    cb.check(); page.wait_for_timeout(200)
    d = D(); c = d["sheets"][A()]
    check(tag + "Haken: Modul zählt nach PV-Stringplan weiter, eigene Strings bleiben", d.get("mods") == {"pv:2": {"cont": 1}} and c.get("var") == 2 and [i["name"] for i in c["items"] if i["type"] == "pvstring"] == ["1.1.1"], d.get("mods"))
    undo()
    check(tag + "Rückgängig: ohne Haken", "mods" not in D())
    # Neuer Stringplan im offenen PV-Modul: leer
    goto(lambda s: s.get("kind") == "pv" and s.get("var") == 2)
    page.click("#sheet-add", button="right"); page.click('#add-menu [data-new="pv"]'); page.wait_for_timeout(300)
    c = D()["sheets"][A()]
    check(tag + "Neuer Stringplan: im offenen PV-Modul (2), leer, ohne Plan", c.get("kind") == "pv" and c.get("var") == 2 and c["items"] == [] and "bg" not in c, (c.get("var"), c.get("bg")))
    sheet_act("del"); confirm()

    if not elplexa:
        # ---------- Schemablatt: Verweis auf ein anderes Blatt bleibt beim Original ----------
        goto(lambda s: s["meta"].get("BLATT") == "3" and not s.get("kind"))
        sheet_act("dup")
        d = D(); sc = [s for s in d["sheets"] if not s.get("kind")]
        c = d["sheets"][A()]
        vout = [i for i in c["items"] if i.get("sym") == "VOUT_1P"]
        o = [s for s in sc if s["meta"]["BLATT"] == "3"][0]
        check("Schema dupliziert: Blatt 5, „Hauptverteilung – Variante 2“", c["meta"]["BLATT"] == "5" and c["meta"]["TITEL"] == "Hauptverteilung – Variante 2", c["meta"])
        check("Schema-Kopie: Verweis offen, Original bleibt verknüpft", vout and "link" not in vout[0] and [i for i in o["items"] if i.get("sym") == "VOUT_1P"][0].get("link") == 21, vout)
        lsc = [i for i in c["items"] if i.get("sym") == "LS_1P"]
        check("Schema-Kopie: BMK mit neuer Blattnummer", lsc and lsc[0]["attrs"].get("BMK", "").startswith("5F"), lsc and lsc[0]["attrs"])

    # ---------- Speichern, Laden, Speichern: ohne Verlust ----------
    s1 = save("rt1.schemacad.json")
    open_file(TMP / "rt1.schemacad.json")
    s2 = save("rt2.schemacad.json")
    s1.pop("active", None); s2.pop("active", None)
    check(tag + "Speichern → Laden → Speichern gleich, Version 16, Varianten erhalten", s1 == s2 and s1["version"] == 16 and [s.get("var") for s in s1["sheets"] if s.get("kind") in ("pv", "pvtab")] == [None, None, 2, 2], (s1["version"], kinds(s1)))
    check(tag + "PDF-Dachplan einmal in der Datei", list(s1["assets"].keys()) == ["a1"])

    # ---------- Druck: beide Dispos, beide Stringpläne, beide Übersichten ----------
    page.evaluate("window.__schemacad.preparePrint()")
    n = page.evaluate("window.__schemacad.buildPrint()")
    pg = page.evaluate("[...document.querySelectorAll('#printroot > svg')].map(s=>s.textContent)")
    page.evaluate("document.querySelector('#printroot').innerHTML=''")
    check(tag + "Druck mit beiden Varianten (Dispo und Stringplan)", sum(t.startswith("Original") for t in pg) == 2 and sum("Dach Süd – Variante" in t for t in pg) == 1 and sum("StringübersichtVariante 2" in t for t in pg) == 1 and sum("StringübersichtVariante 1" in t for t in pg) == 1, (n, [t[:80] for t in pg]))

    # ---------- DXF alle Blätter: beide Dispos ----------
    if not elplexa:
        page.evaluate("document.activeElement?.blur()")
        with page.expect_download() as dl: page.click("#btn-export"); page.click("#btn-dxf-all")
        z = TMP / "alle.zip"; dl.value.save_as(str(z)); names = zipfile.ZipFile(z).namelist()
        check("DXF alle Blätter: Dispo-1 und Dispo-2", any(x.endswith("_Dispo-1.dxf") for x in names) and any(x.endswith("_Dispo-2.dxf") for x in names), names)
    # ---------- Blattmenü per Rechtsklick und gedrückt halten (CJ 18.10.2026) ----------
    ctx = lambda: page.is_visible("#sheet-ctx")
    ndis = lambda: len([s for s in D()["sheets"] if s.get("kind") == "dispo"])
    if elplexa: page.evaluate("document.activeElement?.blur()"); page.keyboard.press("2"); page.wait_for_timeout(300)
    goto(lambda s: s.get("kind") == "dispo")
    page.click("#sheet-cur", button="right"); page.wait_for_timeout(150)
    check(tag + "Rechtsklick auf den Blattnamen: Blattmenü mit Öffnen, Duplizieren, Löschen", ctx() and "Dispo 1" in page.inner_text("#sheet-ctx") and all(x in page.inner_text("#sheet-ctx") for x in ("Öffnen", "Duplizieren", "Löschen")) and not page.is_visible("#sheet-menu"), page.inner_text("#sheet-ctx") if ctx() else "zu")
    n0 = ndis(); page.click('#sheet-ctx [data-ctxact="dup"]'); page.wait_for_timeout(250)
    check(tag + "Blattmenü Duplizieren", ndis() == n0 + 1 and not ctx())
    b = page.locator("#sheet-cur").bounding_box(); page.mouse.move(b["x"] + 20, b["y"] + 10); page.mouse.down(); page.wait_for_timeout(650); page.mouse.up(); page.wait_for_timeout(150)
    check(tag + "Gedrückt halten auf dem Blattnamen: Blattmenü, Blattliste bleibt zu", ctx() and not page.is_visible("#sheet-menu"))
    page.click('#sheet-ctx [data-ctxact="del"]'); t = confirm()
    check(tag + "Blattmenü Löschen mit Rückfrage", "gelöscht" in t and ndis() == n0, t)
    page.click("#sheet-cur"); page.wait_for_timeout(100)
    row = page.locator('#sheet-menu [data-ctx]').first; ri = int(row.get_attribute("data-ctx")); row.click(button="right"); page.wait_for_timeout(150)
    check(tag + "Rechtsklick auf eine Zeile der Blattliste: Blattmenü für dieses Blatt", ctx() and not page.is_visible("#sheet-menu"))
    page.click('#sheet-ctx [data-ctxact="open"]'); page.wait_for_timeout(250)
    check(tag + "Blattmenü Öffnen", A() == ri and not ctx(), (A(), ri))
    page.click("#sheet-cur", button="right"); page.click('#sheet-ctx [data-ctxact="ren"]'); page.wait_for_selector(".modal input")
    page.fill(".modal input", "Schema HV"); page.click(".modal [data-ok]"); page.wait_for_timeout(200)
    check(tag + "Umbenennen: Titel gesetzt, in der Blattleiste sichtbar", D()["sheets"][A()]["meta"]["TITEL"] == "Schema HV" and "Schema HV" in page.inner_text("#sheetbar"), page.inner_text("#sheetbar"))
    undo()
    check(tag + "Umbenennen rückgängig", D()["sheets"][A()]["meta"]["TITEL"] != "Schema HV")
    if elplexa:  # Übersicht: Blatt-Kachel
        page.evaluate("document.activeElement?.blur()"); page.keyboard.press("0"); page.wait_for_timeout(300)
        i = next(k for k, sh in enumerate(D()["sheets"]) if sh.get("kind") == "dispo")
        page.click(f"#el-sh-{i}", button="right"); page.wait_for_timeout(150)
        check("elplexa: Übersicht, Rechtsklick auf Blatt-Kachel: Blattmenü", ctx() and "Dispo" in page.inner_text("#sheet-ctx"))
        page.click('#sheet-ctx [data-ctxact="dup"]'); page.wait_for_timeout(300)
        check("elplexa: aus der Übersicht duplizieren öffnet die Kopie", ndis() == n0 + 1 and not page.is_visible("#el-hub") and "Variante" in D()["sheets"][A()]["meta"]["TITEL"])
        page.evaluate("document.activeElement?.blur()"); page.keyboard.press("0"); page.wait_for_timeout(300)
        j = A(); page.click(f"#el-sh-{j}", button="right"); page.wait_for_timeout(150); page.click('#sheet-ctx [data-ctxact="del"]'); confirm()
        check("elplexa: aus der Übersicht löschen, Übersicht bleibt offen", ndis() == n0 and page.is_visible("#el-hub"))

        # ---------- Module mehrfach (CJ 18.10.2026): Kachelmenü, + Modul, Strings fortsetzen ----------
        hub = lambda: page.is_visible("#el-hub")
        def tiles(): return page.evaluate("[...document.querySelectorAll('#el-hub .el-tile[data-modctx]')].map(t=>[t.dataset.modctx,t.querySelector('.el-tn').textContent])")
        def modact(tid, a): page.click(f"#{tid}", button="right"); page.wait_for_timeout(150); page.click(f'#el-modctx [data-elmodact="{a}"]'); page.wait_for_timeout(300)
        def to_hub():
            if not hub(): page.evaluate("document.activeElement?.blur()"); page.keyboard.press("0"); page.wait_for_timeout(300)
        to_hub()
        t0 = tiles()
        check("elplexa: je Modul eine Kachel (PV 1 und PV 2 aus der Blatt-Kopie)", [x[0] for x in t0] == ["schema", "dispo", "pv", "pv:2"], t0)
        page.click("#el-tile-pv", button="right"); page.wait_for_timeout(150)
        check("elplexa: Rechtsklick auf Kachel: Kachelmenü", page.is_visible("#el-modctx") and all(x in page.inner_text("#el-modctx") for x in ("Öffnen", "Umbenennen", "Duplizieren", "Löschen")), page.inner_text("#el-modctx") if page.is_visible("#el-modctx") else "zu")
        page.keyboard.press("Escape")
        modact("el-tile-pv", "dup")
        d = D(); p3 = [s for s in d["sheets"] if s.get("var") == 3]
        check("elplexa: PV-Modul dupliziert: Kachel „PV-Stringplan (Kopie)“, Stringplan und Übersicht, Übersicht bleibt offen",
              hub() and ["pv:3", "PV-Stringplan (Kopie)"] in tiles() and [s["kind"] for s in p3] == ["pv", "pvtab"] and [i["name"] for i in p3[0]["items"] if i["type"] == "pvstring"] == ["1.1.1"], (tiles(), [s.get("kind") for s in p3]))
        modact("el-tile-pv-3", "ren"); page.fill(".modal input", "PV Variante Ost"); page.click(".modal [data-ok]"); page.wait_for_timeout(300)
        check("elplexa: Modul umbenannt", ["pv:3", "PV Variante Ost"] in tiles() and D()["mods"]["pv:3"]["name"] == "PV Variante Ost", tiles())
        page.click("#el-addmod"); page.wait_for_timeout(150)
        check("elplexa: + Modul: Schema auch als zweites", page.is_enabled('#el-addmenu [data-elnew="schema"]') and "2." in page.inner_text("#el-addmenu"))
        page.click('#el-addmenu [data-elnew="schema"]'); page.wait_for_timeout(400)
        c = D()["sheets"][A()]
        check("elplexa: neues Schema-Modul mit erstem Blatt, offen", not hub() and not c.get("kind") and c.get("var") == 2 and "Schema 2" in page.inner_text("#sheetbar"), (c.get("var"), page.inner_text("#sheetbar")))
        to_hub(); modact("el-tile-schema-2", "ren"); page.fill(".modal input", "Schema UV"); page.click(".modal [data-ok]"); page.wait_for_timeout(300)
        check("elplexa: Schema HV / UV benennbar", ["schema:2", "Schema UV"] in tiles())
        # Neues PV-Modul: Strings ab 1.1.1, mit Haken nach „PV-Stringplan“ weiter (1.1.2)
        page.click("#el-addmod"); page.click('#el-addmenu [data-elnew="pv"]'); page.wait_for_timeout(400)
        c = D()["sheets"][A()]
        page.click('[data-tool="pv-string"]'); page.wait_for_timeout(150)
        n1 = page.input_value('#right [data-pvopt="sname"]')
        page.keyboard.press("Escape"); page.click('[data-tool="select"]'); page.keyboard.press("Escape"); page.wait_for_timeout(150)
        check("elplexa: neues PV-Modul (4) beginnt bei 1.1.1, Haken „Strings fortsetzen“ aus", c.get("var") == 4 and n1 == "1.1.1" and not page.is_checked('#right [data-pvopt="cont"]'), (c.get("var"), n1))
        page.check('#right [data-pvopt="cont"]'); page.wait_for_timeout(200)
        page.select_option('#right [data-pvopt="contto"]', "1"); page.wait_for_timeout(200)
        page.click('[data-tool="pv-string"]'); page.wait_for_timeout(150)
        n2 = page.input_value('#right [data-pvopt="sname"]')
        page.keyboard.press("Escape"); page.click('[data-tool="select"]')
        check("elplexa: Strings fortsetzen nach „PV-Stringplan“: Vorschlag 1.1.2", D()["mods"]["pv:4"]["cont"] == 1 and n2 == "1.1.2", (D().get("mods"), n2))
        # Modul löschen, Rückgängig
        to_hub(); modact("el-tile-schema-2", "del"); t = confirm(); page.wait_for_timeout(200)
        check("elplexa: Modul löschen mit Rückfrage, Kachel weg", "Schema UV" in t and "schema:2" not in [x[0] for x in tiles()] and hub(), t)
        page.keyboard.press("Escape"); page.wait_for_timeout(200); undo(); to_hub()
        check("elplexa: Rückgängig holt das Modul zurück", ["schema:2", "Schema UV"] in tiles(), tiles())
        # Speichern, Laden: Module und Namen bleiben
        page.keyboard.press("Escape"); r1 = save("mod1.elplexa.json"); open_file(TMP / "mod1.elplexa.json"); r2 = save("mod2.elplexa.json")
        r1.pop("active", None); r2.pop("active", None); r1.pop("project", None); r2.pop("project", None)
        check("elplexa: Module speichern → laden → speichern gleich", r1 == r2 and r1["mods"] == {"pv:3": {"name": "PV Variante Ost"}, "schema:2": {"name": "Schema UV"}, "pv:4": {"cont": 1}}, r1.get("mods"))
    check(tag + "keine JS-Fehler", not errors, errors)
    page.close()

def no_auto(d):  # automatische Zeit (project.id, project.auto) läuft mit und hat eigene Tests in zeit_tests.py
    p = d.get("project")
    if isinstance(p, dict):
        p.pop("auto", None); p.pop("id", None)
        if not p: d.pop("project")
    return d
with sync_playwright() as p:
    b = p.chromium.launch()
    run(b, "schemacad.html", False)
    if (ROOT / "dist" / "ElplexaCAD.html").exists(): run(b, "ElplexaCAD.html", True)
    else: check("ElplexaCAD.html gebaut", False)
    b.close()
print(f"\n{len(fails)} Fehler" if fails else "\nAlle Prüfungen bestanden")
sys.exit(1 if fails else 0)
