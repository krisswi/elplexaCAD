# UI-Tests für elplexaCAD (Module mit Projektübersicht, Aufbau B 17.10.2026; Projekt, Status, Projektdaten, Zeit, zuletzt geöffnet 17.10.; Online-Projekte gegen eine Attrappe). Vorher: node build.mjs elplexa
# Aufruf aus web-src: python3 test/elplexa_tests.py [Ausgabeordner]
import re, sys, tempfile, json, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "ElplexaCAD.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="elplexa_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
def no_auto(d):  # automatische Zeit (project.id, project.auto) läuft mit und hat eigene Tests in zeit_tests.py
    p = d.get("project")
    if isinstance(p, dict):
        p.pop("auto", None); p.pop("id", None)
        if not p: d.pop("project")
    return d
MOD = {"dispo": "dispo", "pv": "pv", "pvtab": "pv"}
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    D = lambda: no_auto(page.evaluate("window.__schemacad.doc"))
    active = lambda: page.evaluate("window.__schemacad.active")
    mods = lambda d: [MOD.get(s.get("kind"), "schema") for s in d["sheets"]]
    cur = lambda: MOD.get(D()["sheets"][active()].get("kind"), "schema")
    hub = lambda: page.is_visible("#el-hub")
    def key(k, **o):
        page.evaluate("([k, o]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }))", [k, o])
        page.wait_for_timeout(120)
    def add_entries():  # sichtbare Einträge im Plus-Menü der Blattleiste
        page.click("#sheet-add", button="right"); page.wait_for_timeout(120)
        r = page.evaluate("[...document.querySelectorAll('#add-menu [data-new]')].filter((b) => !b.hidden).map((b) => b.dataset.new)")
        page.keyboard.press("Escape"); page.wait_for_timeout(100)
        return r
    page.goto(URL); page.wait_for_timeout(300)

    # Start ohne Projekt: immer in der Projektübersicht, keine Startauswahl (CJ 18.10.2026); dann Neues Projekt mit PV
    check("Start ohne Projekt: Projektübersicht, keine Startauswahl", hub() and not page.is_visible(".modal") and "Projektübersicht" in page.inner_text("#el-crumb"))
    check("Start: Fokus in der Übersicht, „Neu“ im Datei-Menü da", page.evaluate("!!document.activeElement.closest('#el-hub')") and page.is_visible("#el-file") and page.locator('#el-filemenu [data-elfile="new"]').count() == 1)
    page.screenshot(path=str(OUT / "e1_start.png"))
    page.click("#el-file"); page.click('#el-filemenu [data-elfile="new"]'); page.wait_for_timeout(150) # Knopf „Neu“ in der Übersicht = Neues Projekt (CJ 18.10.2026)
    check("Neu in der Übersicht: Dialog „Neues Projekt“, keine Startauswahl", page.is_visible('.modal [data-f="2"]') and not page.is_visible("[data-start]"))
    page.select_option('.modal [data-f="2"]', "pv"); page.click(".modal [data-ok]"); page.wait_for_timeout(200)
    d = D()
    check("Start mit PV: nur Stringplan", mods(d) == ["pv"] and d["sheets"][0].get("kind") == "pv", mods(d))
    crumb = page.inner_text("#el-crumb")
    check("Kopf zeigt „‹ Übersicht / PV-Stringplan“", "‹ Übersicht" in crumb and "/" in crumb and "PV-Stringplan" in crumb, crumb)
    check("Fenstertitel endet auf „– elplexaCAD“", page.title().endswith("– elplexaCAD"), page.title())
    check("Plus-Menü PV: nur pv und pvtab", add_entries() == ["pv", "pvtab"])

    # Taste 1 ohne Schema: Übersicht mit Meldung, nichts angelegt
    n0 = len(D()["sheets"])
    key("1")
    check("Taste 1 ohne Schema öffnet die Übersicht", hub())
    check("… mit Meldung und ohne neues Blatt", "noch nicht" in page.inner_text("body") and len(D()["sheets"]) == n0 and mods(D()) == ["pv"])
    page.screenshot(path=str(OUT / "e2_hub_pv.png"))

    # + Modul: Plan und Prinzipschema ausgegraut, Schema anlegen
    page.click("#el-addmod"); page.wait_for_timeout(150)
    dis = page.evaluate("Object.fromEntries([...document.querySelectorAll('#el-addmenu [data-elnew]')].map((b) => [b.dataset.elnew, b.disabled]))")
    check("+ Modul: Plan und Prinzipschema ausgegraut, weiteres PV möglich (Module mehrfach)", dis.get("plan") and dis.get("prinzip") and not dis.get("pv") and not dis.get("schema") and not dis.get("dispo"), dis)
    page.screenshot(path=str(OUT / "e3_addmod.png"))
    page.click('#el-addmenu [data-elnew="schema"]'); page.wait_for_timeout(200)
    d = D()
    check("+ Modul → Schema legt Schemablätter an", not hub() and "schema" in mods(d) and any(not s.get("kind") for s in d["sheets"]) and cur() == "schema", [s.get("kind") for s in d["sheets"]])
    check("Kopf zeigt Schema", "Schema" in page.inner_text("#el-crumb"))
    check("Plus-Menü Schema: nur sheet", add_entries() == ["sheet"])

    # Blattleiste nur Modulblätter
    ns = mods(D()).count("schema")
    of = page.inner_text("#sheet-cur .of")
    check(f"Blattleiste Schema: „x von {ns}“", of.endswith(f"von {ns}") and ns < len(D()["sheets"]), of)
    for _ in range(ns + 2): key("PageDown")
    check("Bild ab bleibt im Modul Schema", cur() == "schema" and page.inner_text("#sheet-cur .of") == f"{ns} von {ns}")
    key("g")
    rows = page.evaluate("[...document.querySelectorAll('#sheet-menu .slist [data-sheet]')].map((b) => +b.dataset.sheet)")
    check("Liste (G) nur Modulblätter", len(rows) == ns and all(mods(D())[i] == "schema" for i in rows), rows)
    page.screenshot(path=str(OUT / "e4_liste.png"))
    page.keyboard.press("Escape"); page.wait_for_timeout(100)

    # Tasten 1/2/3, 0
    key("3")
    check("Taste 3 öffnet PV", cur() == "pv" and not hub() and page.inner_text("#sheet-cur .of") == "1 von 1")
    check("Plus-Menü PV nach Wechsel: pv und pvtab", add_entries() == ["pv", "pvtab"])
    key("1")
    check("Taste 1 öffnet Schema (zuletzt offenes Blatt)", cur() == "schema" and page.inner_text("#sheet-cur .of") == f"{ns} von {ns}")
    check("Plus-Menü Schema nach Wechsel hin und zurück: nur sheet", add_entries() == ["sheet"])
    a = active(); key("2")
    check("Taste 2 ohne Disposition: Übersicht, nichts angelegt", hub() and "dispo" not in mods(D()))
    key("0")
    check("0 schliesst die Übersicht, Schema bleibt", not hub() and active() == a)
    key("0")
    check("0 öffnet die Übersicht", hub() and page.locator("#el-hub [data-elopen]").count() == 2)
    key("0")

    # Entf bei offener Übersicht löscht nichts
    while D()["sheets"][active()].get("kind"): key("PageUp")  # Schemablatt mit Grundverkabelung
    key("a", ctrlKey=True)
    sel = page.evaluate("window.__schemacad.sel.length")
    before = D()
    key("0"); key("Delete"); key("Backspace")
    after = D(); diff = [k for k in set(before) | set(after) if before.get(k) != after.get(k)]
    check("Entf bei offener Übersicht löscht nichts", sel > 0 and hub() and not diff, [sel, hub(), diff, [len(s["items"]) for s in before["sheets"]], [len(s["items"]) for s in after["sheets"]]])
    key("Escape")
    check("Esc schliesst die Übersicht", not hub())

    # § Seitenleisten, ? Hilfe
    key("§")
    check("§ blendet die Seitenleisten aus (body.el-bare)", page.evaluate("document.body.classList.contains('el-bare') && getComputedStyle(document.querySelector('#left')).visibility === 'hidden'"))
    page.screenshot(path=str(OUT / "e5_bare.png"))
    key("§")
    check("§ zweimal: Seitenleisten wieder da", not page.evaluate("document.body.classList.contains('el-bare')"))
    key("?")
    check("? öffnet „Tasten in elplexaCAD“", page.is_visible(".modal") and "Tasten in elplexaCAD" in page.inner_text(".modal"))
    page.click(".modal [data-c]"); page.wait_for_timeout(100)
    check("Fenstertitel nach Modulwechsel weiter „– elplexaCAD“", page.title().endswith("– elplexaCAD"), page.title())

    # Wiederhergestellte Sitzung startet ebenfalls in der Übersicht (zweites Fenster, gleicher Browser-Speicher)
    page.wait_for_timeout(600)
    p2 = ctx.new_page(); p2.goto(URL); p2.wait_for_timeout(400)
    check("Start mit wiederhergestellter Sitzung: Projektübersicht", p2.is_visible("#el-hub") and not p2.is_visible(".modal") and "wiederhergestellt" in p2.inner_text("#toasts") and len(p2.evaluate("window.__schemacad.doc")["sheets"]) == len(D()["sheets"]))
    p2.close()

    # Schmales Fenster
    page.set_viewport_size({"width": 375, "height": 800}); page.wait_for_timeout(300)
    w = page.evaluate("(() => { const t = document.querySelector('#topbar'); return [t.scrollWidth, t.clientWidth, document.documentElement.scrollWidth] })()")
    check("375 px: Kopfleiste läuft nicht seitlich über", w[0] <= w[1] and w[2] <= 375, w)
    page.screenshot(path=str(OUT / "e6_schmal.png"))
    key("0"); page.wait_for_timeout(150)
    w = page.evaluate("(() => { const t = document.querySelector('#topbar'); return [t.scrollWidth, t.clientWidth, document.documentElement.scrollWidth] })()")
    check("375 px mit Übersicht: kein Überlaufen", w[0] <= w[1] and w[2] <= 375, w)
    page.screenshot(path=str(OUT / "e7_schmal_hub.png"))
    # ---- Projekt in der Übersicht (Schritt 1 und 2, 17.10.2026) ----
    page.set_viewport_size({"width": 1400, "height": 900}); page.wait_for_timeout(200)
    if not hub(): key("0")
    def setp(k, v):
        page.fill(f'#el-hub [data-elp="{k}"]', v); page.press(f'#el-hub [data-elp="{k}"]', "Enter"); page.wait_for_timeout(120)
    setp("name", "MFH Bärgen")
    setp("OBJEKT", "MFH Bärgenstrasse 5"); setp("AUFTRAG", "A-2026-17"); setp("INDEX", "B"); setp("BAUHERR", "Muster AG")
    page.select_option('#el-hub [data-elp="status"]', "Offerte"); page.wait_for_timeout(150)
    d = D(); pj = d.get("project", {})
    check("Name, Status, Projektdaten in der Datei", pj.get("name") == "MFH Bärgen" and pj.get("status") == "Offerte" and pj.get("meta") == {"OBJEKT": "MFH Bärgenstrasse 5", "AUFTRAG": "A-2026-17", "INDEX": "B"}, pj)
    check("Projektdaten in allen Schriftfeldern", all(s["meta"]["OBJEKT"] == "MFH Bärgenstrasse 5" and s["meta"]["AUFTRAG"] == "A-2026-17" and s["meta"]["INDEX"] == "B" for s in d["sheets"]), [s["meta"].get("OBJEKT") for s in d["sheets"]])
    ti = next((s for s in d["sheets"] if s.get("kind") == "title"), None)
    check("Bauherr auf der Titelseite", ti and ti["info"]["BAUHERR"] == "Muster AG")
    check("Status in Übersicht und Kopf", "Offerte" in page.inner_text("#el-hub .el-proj") and "Offerte" in page.inner_text("#el-crumb"))
    check("Name bleibt sichtbar nach Neuzeichnen", page.input_value('#el-hub [data-elp="name"]') == "MFH Bärgen")
    page.screenshot(path=str(OUT / "e8_projekt.png"))
    # neues Blatt (Disposition) bekommt die Projektdaten
    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('#el-addmenu [data-elnew="dispo"]'); page.wait_for_timeout(200)
    dm = next(s for s in D()["sheets"] if s.get("kind") == "dispo")["meta"]
    check("Neue Disposition hat Objekt, Auftrag, Index des Projekts", dm["OBJEKT"] == "MFH Bärgenstrasse 5" and dm["AUFTRAG"] == "A-2026-17" and dm["INDEX"] == "B", dm)
    check("Kopf im Modul zeigt den Status", "Offerte" in page.inner_text("#el-crumb"))
    key("z", metaKey=True)
    check("⌘Z nimmt die Disposition zurück, Projekt bleibt", "dispo" not in mods(D()) and D().get("project", {}).get("status") == "Offerte")
    # Zeit
    key("0")
    def tadd(dt, h, n):
        page.fill("#el-td", dt); page.fill("#el-th", h); page.fill("#el-tn", n); page.press("#el-tn", "Enter"); page.wait_for_timeout(120)
    tadd("2026-10-16", "1,5", "Aufnahme vor Ort"); tadd("2026-10-17", "2", "Schema; Seite 3"); tadd("2026-10-17", "0,25", "=Telefon")
    tadd("2026-10-17", "30", "zu viel")
    t = D()["project"].get("time", [])
    check("Zeit: drei Einträge, 30 h abgelehnt", [e["h"] for e in t] == [1.5, 2, 0.25] and t[0] == {"d": "2026-10-16", "h": 1.5, "n": "Aufnahme vor Ort"}, t)
    check("Summe 3,75 h", "3,75 h" in page.inner_text("#el-hub .el-sum"), page.inner_text("#el-hub .el-sum"))
    with page.expect_download() as dl: page.click('#el-hub [data-elact="csv"]')
    csv = Path(dl.value.path()).read_text(encoding="utf-8-sig")
    check("CSV wie die Listen: BOM, Semikolon, Formelschutz, sortiert, Summe", dl.value.suggested_filename == "MFH Bärgen_Zeit.csv" and csv.splitlines() == ["Datum;Stunden;Notiz", "16.10.2026;1.5;Aufnahme vor Ort", '17.10.2026;2;"Schema; Seite 3"', "17.10.2026;0.25;'=Telefon", "Summe;3.75;"] and Path(dl.value.path()).read_bytes()[:3] == b"\xef\xbb\xbf", [dl.value.suggested_filename, csv])
    page.click('#el-hub [data-eltdel="2"]'); page.wait_for_timeout(120)
    check("Eintrag löschen: Summe 3,5 h", len(D()["project"]["time"]) == 2 and "3,5 h" in page.inner_text("#el-hub .el-sum"))
    page.screenshot(path=str(OUT / "e9_zeit.png"), full_page=True)
    # 375 px mit voller Übersicht
    page.set_viewport_size({"width": 375, "height": 800}); page.wait_for_timeout(300)
    w = page.evaluate("[document.documentElement.scrollWidth, document.querySelector('#el-hub').scrollWidth, document.querySelector('#el-hub').clientWidth, document.querySelector('#topbar').scrollWidth, document.querySelector('#topbar').clientWidth]")
    check("375 px: Übersicht mit Projekt und Zeit läuft nicht seitlich über", w[0] <= 375 and w[1] <= w[2] and w[3] <= w[4], w)
    page.screenshot(path=str(OUT / "e10_schmal_projekt.png"), full_page=True)
    page.evaluate("document.querySelector('.el-time').scrollIntoView()"); page.screenshot(path=str(OUT / "e11_schmal_zeit.png"))
    page.set_viewport_size({"width": 1400, "height": 900}); page.wait_for_timeout(200)
    b.close()

    # ---- Speichern und Laden ohne Datenverlust (Download- und Datei-Eingabe-Weg), Neues Projekt, zuletzt geöffnet ----
    b = p.chromium.launch()
    TMP = Path(tempfile.mkdtemp(prefix="elplexa_rt_"))
    page = b.new_page(viewport={"width": 1400, "height": 900}, accept_downloads=True)
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    def open_file(path):
        page.evaluate("document.activeElement?.blur()")  # ⌘O wirkt nicht in einem Eingabefeld (wie im ganzen Editor)
        with page.expect_file_chooser() as fc: page.keyboard.press("Meta+o")
        fc.value.set_files(str(path)); page.wait_for_timeout(300)
    def save(k="Meta+s"):
        with page.expect_download() as dl: page.keyboard.press(k)
        out = TMP / dl.value.suggested_filename; dl.value.save_as(str(out)); page.wait_for_timeout(400); return out  # Liste „zuletzt geöffnet“ schreibt im Hintergrund
    OLD = ROOT / "test" / "ui_out.schemacad.json"
    for src in (OLD, shutil.copy(OLD, TMP / "Alt.elplexa.json")):
        open_file(src); d1 = D()
        check(f"{Path(src).name}: ohne Projekt, Name = Dateiname", "project" not in d1 and page.evaluate("document.querySelector('#file-name').textContent") == Path(src).name.split(".")[0])
        out = save(); open_file(out); d2 = D()
        check(f"{Path(src).name}: Speichern und Laden ohne Datenverlust", d1 == d2 and out.name == Path(src).name.split(".")[0] + ".elplexa.json", out.name)
        raw = json.loads(Path(src).read_text())
        check(f"{Path(src).name}: Blätter und Objekte wie in der Datei", [len(s["items"]) for s in raw["sheets"]] == [len(s["items"]) for s in d2["sheets"]])
    key("0")
    page.fill('#el-hub [data-elp="name"]', "Projekt Rundlauf"); page.press('#el-hub [data-elp="name"]', "Enter"); page.wait_for_timeout(120)
    page.select_option('#el-hub [data-elp="status"]', "Abgegeben"); page.wait_for_timeout(120)
    page.fill("#el-th", "1.25"); page.fill("#el-tn", "Ümlaut \"Test\""); page.press("#el-tn", "Enter"); page.wait_for_timeout(120)
    d1 = D(); out = save()
    check("Dateiname nach Projektname", out.name == "Projekt Rundlauf.elplexa.json", out.name)
    open_file(out); d2 = D()
    check("Projekt mit Name, Status, Zeit: Speichern und Laden gleich", d1 == d2 and d2["project"]["status"] == "Abgegeben" and d2["project"]["time"][0]["h"] == 1.25, d2.get("project"))
    page.wait_for_timeout(300); key("0") if not hub() else None; page.wait_for_timeout(300)
    page.click("#el-tab-projekte"); page.wait_for_timeout(200)  # zuletzt geöffnet steht im Reiter Projekte (CJ 21.10.2026)
    rec = page.inner_text("#el-tabpanel")
    check("Zuletzt geöffnet: Projekt mit Status (ohne Dateizugriff nur Name)", "Projekt Rundlauf" in rec and "Abgegeben" in rec, rec)
    check("Reiter Projekte: Kopfleiste ohne Datei-Menü, Projektname, Speicherstand", all(page.is_hidden(s) for s in ("#el-file", "#topbar .filechip", "#el-savestate", "#btn-save")))
    page.click("#el-pt-cur"); page.wait_for_timeout(150)
    check("Im Projekt: Datei-Menü und Speicherstand wieder da, kein Reiter Profil", page.is_visible("#el-file") and page.is_visible("#el-savestate") and page.locator("#el-tab-profil").count() == 0)
    # Neues Projekt: bei ungespeicherten Änderungen nachfragen
    page.fill('#el-hub [data-elp="OBJEKT"]', "geändert"); page.press('#el-hub [data-elp="OBJEKT"]', "Enter"); page.wait_for_timeout(120)
    page.click("#el-tab-projekte"); page.click('#el-hub [data-elact="newproj"]'); page.wait_for_timeout(150)
    page.fill('.modal [data-f="0"]', "EFH Sonnenweg"); page.fill('.modal [data-f="1"]', "Familie Muster"); page.select_option('.modal [data-f="2"]', "dispo")
    page.click(".modal [data-ok]"); page.wait_for_timeout(150)
    asked = page.is_visible(".modal") and "Neu beginnen?" in page.inner_text(".modal")
    page.click('.modal [data-r="1"]'); page.wait_for_timeout(250)
    d = D()
    check("Neues Projekt fragt bei Änderungen nach", asked)
    check("Neues Projekt: Name, Status, Bauherr, nur Disposition", d["project"] == {"name": "EFH Sonnenweg", "status": "In Arbeit"} and mods(d) == ["dispo"] and d.get("info", {}).get("BAUHERR") == "Familie Muster" and not hub(), [d.get("project"), mods(d), d.get("info")])
    check("Kopf zeigt Modul und Status", "Disposition" in page.inner_text("#el-crumb") and "In Arbeit" in page.inner_text("#el-crumb"))
    key("0")
    check("Übersicht zeigt neuen Namen und Bauherr", page.input_value('#el-hub [data-elp="name"]') == "EFH Sonnenweg" and page.input_value('#el-hub [data-elp="BAUHERR"]') == "Familie Muster")
    page.screenshot(path=str(OUT / "e12_neues_projekt.png"))
    out = save()
    check("Neues Projekt speichert als EFH Sonnenweg.elplexa.json", out.name == "EFH Sonnenweg.elplexa.json", out.name)
    b.close()

    # ---- Online-Projekte (Schritt 3, 17.10.2026) gegen eine Attrappe statt Supabase ----
    import base64, hashlib, uuid, re as _re
    from urllib.parse import urlparse, parse_qs, unquote
    UID = "11111111-2222-3333-4444-555555555555"
    srv = {"rows": {}, "files": {}, "ftime": {}, "calls": [], "mode": "ok", "uploads": 0, "fb": [], "fbfiles": {}}
    jwt = "x." + base64.urlsafe_b64encode(json.dumps({"sub": UID}).encode()).decode().rstrip("=") + ".y"
    def fake(route):
        req = route.request; u = urlparse(req.url); q = {k: v[0] for k, v in parse_qs(u.query).items()}; path = u.path
        srv["calls"].append(f"{req.method} {path}")
        if srv["mode"] == "offline": route.abort(); return
        if srv["mode"] == "paused": route.fulfill(status=540, body=""); return
        J = lambda o, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(o))
        if path == "/auth/v1/token": J({"access_token": jwt, "refresh_token": "r", "expires_at": 4102444800, "user": {"email": "test@beispiel.ch"}}); return
        if path == "/auth/v1/logout": route.fulfill(status=204, body=""); return
        if path == "/rest/v1/projects":
            rid = q.get("id", "")[3:] if "id" in q else None
            if req.method == "GET":
                rows = [r for r in srv["rows"].values() if rid is None or r["id"] == rid]
                if q["select"] == "assets:data->assets": J([{"assets": r["data"].get("assets")} for r in rows]); return
                def col(r, k):  # „alias:data->a->b“ wie PostgREST: Pfad in der Spalte data
                    if "->" not in k: return r.get(k)
                    v = r["data"]
                    for part in k.split("->")[1:]: v = v.get(part) if isinstance(v, dict) else None
                    return v
                J([{k.split(":")[0]: col(r, k.split(":")[-1]) for k in q["select"].split(",")} for r in sorted(rows, key=lambda r: r["updated_at"], reverse=True)]); return
            if req.method == "DELETE":
                r = srv["rows"].pop(rid, None); J([{"id": r["id"]}] if r else []); return
            body = json.loads(req.post_data)
            if req.method == "POST":
                r = {"id": str(uuid.uuid4()), "owner": UID, **body}; srv["rows"][r["id"]] = r; J([{"id": r["id"], "updated_at": r["updated_at"]}], 201); return
            if req.method == "PATCH":
                r = srv["rows"].get(rid)
                if not r or ("updated_at" in q and q["updated_at"][3:] != r["updated_at"]): J([]); return
                r.update(body); J([{"id": r["id"], "updated_at": r["updated_at"]}]); return
        if path == "/rest/v1/feedback" and req.method == "POST":  # Feedback (18.10.2026)
            r = {"id": str(uuid.uuid4()), "user_id": UID, **json.loads(req.post_data)}; srv["fb"].append(r); J([{"id": r["id"]}], 201); return
        mf = _re.match(r"^/storage/v1/object/feedback/(.+)$", path)
        if mf and req.method == "POST": srv["fbfiles"][mf.group(1)] = (req.headers.get("content-type"), req.post_data_buffer); J({"Key": "feedback/" + mf.group(1)}); return
        if path == "/storage/v1/object/list/projekt-pdf":
            pre = json.loads(req.post_data)["prefix"]; J([{"name": k.split("/")[-1], "created_at": srv["ftime"].get(k, "2026-10-17T20:00:00Z")} for k in srv["files"] if k.startswith(pre + "/")]); return
        if path == "/storage/v1/object/projekt-pdf" and req.method == "DELETE":
            gone = [k for k in json.loads(req.post_data)["prefixes"] if srv["files"].pop(k, None) is not None]; J([{"name": k} for k in gone]); return
        m = _re.match(r"^/storage/v1/object/(authenticated/)?projekt-pdf/(.+)$", path)
        if m and req.method == "POST":
            from datetime import datetime, timezone
            srv["files"][m.group(2)] = req.post_data_buffer; srv["ftime"][m.group(2)] = datetime.now(timezone.utc).isoformat(); srv["uploads"] += 1; J({"Key": m.group(2)}); return
        if m and req.method == "GET" and m.group(2) in srv["files"]: route.fulfill(status=200, content_type="application/pdf", body=srv["files"][m.group(2)]); return
        J({"message": "nicht gefunden"}, 404)
    b = p.chromium.launch()
    TMP = Path(tempfile.mkdtemp(prefix="elplexa_on_"))
    page = b.new_page(viewport={"width": 1400, "height": 900}, accept_downloads=True)
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "540" not in m.text and "ERR_FAILED" not in m.text else None)
    page.route("https://keqfieduhipnulpkhdbj.supabase.co/**", fake)
    page.goto(URL); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    PDF = (ROOT / "test" / "ui_out.pdf").read_bytes(); B64 = base64.b64encode(PDF).decode(); SHA = hashlib.sha256(PDF).hexdigest()
    fx = {"format": "schemacad", "version": 6, "active": 0, "nextId": 100, "pv": {"moduleTypes": []},
          "project": {"name": "PV Online", "status": "Offerte", "time": [{"d": "2026-10-17", "h": 1.5, "n": "Dach"}]},
          "assets": {"a1": {"name": "dach.pdf", "type": "application/pdf", "data": B64}},
          "sheets": [{"kind": "pv", "sid": 1, "meta": {"BLATT": "1"}, "bg": {"asset": "a1", "name": "dach.pdf", "page": 1, "w": 842, "h": 595}, "items": []}]}
    FX = TMP / "PV Online.elplexa.json"; FX.write_text(json.dumps(fx))
    open_file(FX); d0 = D()
    toasts = lambda: page.evaluate("[...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent).join(' | ')")
    def clear_toasts(): page.evaluate("document.querySelectorAll('#toasts .toast').forEach((t) => t.remove())")
    key("0"); page.wait_for_timeout(150)
    check("Online: ohne Anmeldung im Projekt kein Online-Bereich und kein Login-Feld (CJ 21.10.2026)", page.locator("#el-online").count() == 0 and page.locator("#el-hub #el-pf-form").count() == 0)
    check("Online: ohne Klick keine Anfrage an den Server", srv["calls"] == [], srv["calls"])
    check("Online: Datei mit PDF geladen", d0.get("assets", {}).get("a1", {}).get("data") == B64 and d0["project"]["name"] == "PV Online")
    page.screenshot(path=str(OUT / "e13_online_leer.png"))
    # Anmelden über den Konto-Kreis (Profil), dann online speichern (Testwerte für die Attrappe)
    page.click("#el-acct"); page.wait_for_timeout(150)
    page.fill("#el-pf-mail", "test@beispiel.ch"); page.fill("#el-pf-pw", "attrappe"); page.click('#el-pf-form [type="submit"]'); page.wait_for_timeout(500)
    page.click("#el-tab-projekte"); page.click("#el-pt-cur"); page.wait_for_timeout(200)
    on = page.inner_text("#el-online")
    check("Angemeldet: Online-Bereich im Projekt mit „Online speichern“", "test@beispiel.ch" in on and "Online speichern" in on, on)
    page.click('#el-hub [data-elact="onsave"]'); page.wait_for_timeout(600)
    rows = list(srv["rows"].values()); d1 = D()
    r0 = rows[0] if rows else {}
    check("Online gespeichert: eine Zeile mit Name und Status", len(rows) == 1 and r0["name"] == "PV Online" and r0["status"] == "Offerte", rows and {k: r0[k] for k in ("name", "status")})
    check("PDF im Storage unter Konto/SHA-256, Zeile ohne PDF-Inhalt", srv["files"].get(f"{UID}/{SHA}.pdf") == PDF and r0.get("data", {}).get("assets") == {"a1": {"name": "dach.pdf", "type": "application/pdf", "sha": SHA}} and B64 not in json.dumps(r0.get("data")), list(srv["files"]))
    check("Zeile ohne Online-Verknüpfung, Datei mit Verknüpfung", "online" not in r0.get("data", {}).get("project", {}) and d1["project"].get("online") == {"id": r0.get("id"), "at": r0.get("updated_at")}, d1["project"].get("online"))
    on = page.inner_text("#el-online")
    check("Übersicht: angemeldet, gespeichert, Link teilen und Online löschen", "test@beispiel.ch" in on and "Online gespeichert am" in on and "Link teilen" in on and "Online löschen" in on, on)
    check("Datei als geändert markiert (merkt sich den Online-Stand mit ⌘S)", page.evaluate("document.title").startswith("PV Online") and "⌘S" in toasts(), toasts())
    page.screenshot(path=str(OUT / "e14_online_gespeichert.png"))
    # zweites Speichern: gleiche Zeile, PDF nicht nochmals hochladen
    at1 = r0["updated_at"]; page.wait_for_timeout(20)
    page.click('#el-hub [data-elact="onsave"]'); page.wait_for_timeout(500)
    check("Nochmals speichern: gleiche Zeile, neuer Stand, PDF nicht erneut", len(srv["rows"]) == 1 and r0["updated_at"] != at1 and srv["uploads"] == 1 and D()["project"]["online"]["at"] == r0["updated_at"], [len(srv["rows"]), srv["uploads"]])
    # Konflikt: online neuer (anderer Rechner)
    r0["updated_at"] = "2099-01-01T10:00:00.000Z"; r0["name"] = "vom anderen Rechner"
    page.click('#el-hub [data-elact="onsave"]'); page.wait_for_timeout(400)
    txt = page.inner_text(".modal") if page.is_visible(".modal") else ""
    check("Konflikt: Frage „Online ist neuer“ mit drei Wegen", "Online ist neuer" in txt and "Online überschreiben" in txt and "Als neues Online-Projekt speichern" in txt and "Abbrechen" in txt, txt)
    page.click(".modal [data-c]"); page.wait_for_timeout(200)
    check("Konflikt abbrechen: Online-Stand bleibt", r0["name"] == "vom anderen Rechner" and len(srv["rows"]) == 1)
    page.click('#el-hub [data-elact="onsave"]'); page.wait_for_timeout(400)
    page.click('.modal .choice:has-text("Online überschreiben")'); page.wait_for_timeout(500)
    check("Konflikt überschreiben: Online-Stand ersetzt", r0["name"] == "PV Online" and len(srv["rows"]) == 1 and D()["project"]["online"]["at"] == r0["updated_at"])
    r0["updated_at"] = "2099-01-02T10:00:00.000Z"
    page.click('#el-hub [data-elact="onsave"]'); page.wait_for_timeout(400)
    page.click('.modal .choice:has-text("Als neues Online-Projekt")'); page.wait_for_timeout(500)
    ids = list(srv["rows"])
    check("Konflikt als neues Projekt: zweite Zeile, Datei zeigt auf die neue", len(ids) == 2 and D()["project"]["online"]["id"] == ids[1] and srv["uploads"] == 1, [len(ids), srv["uploads"]])
    # Datei speichern und laden: Verknüpfung bleibt
    clear_toasts(); out = save("Meta+Shift+s"); open_file(out); d2 = D()  # online verknüpft: ⌘S speichert online, ⇧⌘S als Datei (18.10.2026)
    check("Datei speichern/laden: Online-Verknüpfung und Projekt bleiben", d2["project"].get("online", {}).get("id") == ids[1] and d2["assets"] == d0["assets"] and d2["sheets"] == d0["sheets"], d2["project"])
    # Öffnen aus der Liste (erste Zeile) bei ungespeicherter Änderung
    key("0") if not hub() else None; page.wait_for_timeout(100)
    page.select_option('#el-hub [data-elp="status"]', "Abgegeben"); page.wait_for_timeout(120)
    nrecent = lambda: page.evaluate("new Promise((res) => { const r = indexedDB.open('elplexacad', 1); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('recent'); q.onsuccess = () => res((q.result || []).length); }; })")
    page.click("#el-tab-projekte"); page.click('#el-hub [data-elact="onlist"]'); page.wait_for_timeout(400)
    nrec = nrecent()
    page.click(f'#el-hub [data-elonline="{ids[0]}"]'); page.wait_for_timeout(200)
    asked = page.is_visible(".modal") and "Ungespeicherte Änderungen" in page.inner_text(".modal")
    page.click('.modal [data-r="1"]'); page.wait_for_timeout(600)
    d3 = D()
    check("Öffnen fragt bei ungespeicherten Änderungen", asked)
    check("Online öffnen: gleiche Blätter, PDF zurück, Status und Zeit wie online", d3["sheets"] == d0["sheets"] and d3["assets"] == d0["assets"] and d3["project"]["status"] == "Offerte" and d3["project"]["time"] == d0["project"]["time"], d3.get("project"))
    check("Online öffnen: Verknüpfung auf die Zeile, Projektname", d3["project"]["online"] == {"id": ids[0], "at": srv["rows"][ids[0]]["updated_at"]} and page.inner_text("#file-name") == "PV Online", [d3["project"].get("online"), page.inner_text("#file-name")])
    page.wait_for_timeout(300)
    check("Online geöffnet: kein neuer Eintrag unter „zuletzt geöffnet“", nrec > 0 and nrecent() == nrec, [nrec, nrecent()])
    PKEY = f"{UID}/{SHA}.pdf"
    check("Junge PDF bleibt beim Aufräumen nach dem Speichern", PKEY in srv["files"])
    srv["ftime"][PKEY] = "2026-10-01T00:00:00Z"  # PDF älter als eine Stunde
    # Online löschen: zweites Projekt (PDF noch vom ersten gebraucht), dann das offene erste
    # Online löschen (CJ 21.10.2026): anderes Projekt per Rechtsklick im Reiter Projekte, das offene im Projekt
    def odel_ctx(pid): page.click(f'#el-hub [data-elonline="{pid}"]', button="right"); page.wait_for_timeout(150); page.click('#el-projctx [data-elprojact="odel"]'); page.wait_for_timeout(200)
    page.click("#el-tab-projekte"); page.wait_for_timeout(200)
    page.click(f'#el-hub [data-elonline="{ids[1]}"]', button="right"); page.wait_for_timeout(150)
    menu = page.inner_text("#el-projctx")
    check("Rechtsklick Online-Projekt: Link teilen und Online löschen, kein „Aus der Liste entfernen“", "Link teilen" in menu and "Online löschen" in menu and page.is_hidden('#el-projctx [data-elprojact="rm"]'), menu)
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    odel_ctx(ids[1])
    asked = page.is_visible(".modal") and "Online-Projekt löschen?" in page.inner_text(".modal")
    page.click('.modal [data-r="0"]'); page.wait_for_timeout(200)
    check("Löschen fragt nach, Abbrechen lässt es online", asked and len(srv["rows"]) == 2)
    odel_ctx(ids[1]); page.click('.modal [data-r="1"]'); page.wait_for_timeout(500)
    check("Online löschen: Zeile weg, PDF bleibt (anderes Projekt braucht sie)", list(srv["rows"]) == [ids[0]] and PKEY in srv["files"] and f'data-elonline="{ids[1]}"' not in page.inner_html("#el-hub"), [list(srv["rows"]), list(srv["files"])])
    page.screenshot(path=str(OUT / "e15_online_liste.png"))
    page.click("#el-pt-cur"); page.wait_for_timeout(150)
    page.click(f'#el-online [data-elodel="{ids[0]}"]'); page.wait_for_timeout(200); page.click('.modal [data-r="1"]'); page.wait_for_timeout(500)
    check("Letztes Projekt gelöscht: unbenutzte PDF aufgeräumt", not srv["rows"] and not srv["files"], [list(srv["rows"]), list(srv["files"])])
    check("Offenes Projekt verliert die Online-Verknüpfung, Blätter bleiben", "online" not in D()["project"] and D()["sheets"] == d0["sheets"] and "Online gespeichert am" not in page.inner_text("#el-online"), D()["project"])
    # ---- Speichern-Knopf (CJ 18.10.2026): angemeldet, noch nicht online → Wahl; danach direkt online ----
    key("0") if not hub() else None; page.wait_for_timeout(150); clear_toasts()
    page.click("#btn-save"); page.wait_for_timeout(250)
    txt = page.inner_text(".modal") if page.is_visible(".modal") else ""
    check("Speichern, angemeldet, nicht online: Wahl Online / Lokal", "Online speichern" in txt and "Lokal speichern" in txt, txt)
    page.screenshot(path=str(OUT / "e18_speichern_wahl.png"))
    page.click('.modal .choice:has-text("Online speichern")'); page.wait_for_timeout(500)
    rid = D()["project"].get("online", {}).get("id")
    check("Online speichern über den Knopf: neue Zeile, Datei verknüpft, nicht mehr „ungespeichert“", len(srv["rows"]) == 1 and rid in srv["rows"] and page.is_hidden("#dirty") and "Online gespeichert" in toasts(), [len(srv["rows"]), toasts()])
    at1 = srv["rows"][rid]["updated_at"]; clear_toasts(); page.wait_for_timeout(20)
    page.select_option('#el-hub [data-elp="status"]', "Abgegeben"); page.wait_for_timeout(120)
    page.evaluate("document.activeElement?.blur()"); page.keyboard.press("Meta+s"); page.wait_for_timeout(500)
    check("⌘S bei Online-Projekt: ohne Frage direkt online", not page.is_visible(".modal") and len(srv["rows"]) == 1 and srv["rows"][rid]["updated_at"] != at1 and srv["rows"][rid]["status"] == "Abgegeben" and "Online gespeichert" in toasts(), toasts())
    # Fehlerfall: Meldung und Angebot, als Datei zu speichern; nichts verloren
    before = D(); clear_toasts(); srv["mode"] = "offline"
    page.select_option('#el-hub [data-elp="status"]', "Offerte"); page.wait_for_timeout(120)
    page.click("#btn-save"); page.wait_for_timeout(400)
    txt = page.inner_text(".modal") if page.is_visible(".modal") else ""
    check("Online-Fehler: klare Meldung mit Angebot „Lokal speichern“", "Online speichern hat nicht geklappt" in txt and "Keine Verbindung" in txt and "Lokal speichern" in txt, txt)
    page.screenshot(path=str(OUT / "e19_speichern_fehler.png"))
    with page.expect_download() as dl: page.click('.modal [data-r="1"]')
    out = TMP / dl.value.suggested_filename; dl.value.save_as(str(out)); page.wait_for_timeout(300)
    check("Nach Fehler lokal gespeichert: Datei mit aktuellem Stand", no_auto(json.loads(out.read_text()))["project"]["status"] == "Offerte" and D()["sheets"] == before["sheets"], out.name)
    srv["mode"] = "ok"
    # ---- Feedback melden (CJ 18.10.2026) ----
    key("0") if hub() else None; page.wait_for_timeout(150)  # Übersicht zu: Zeichenfläche sichtbar
    check("Feedback-Knopf unten rechts in der Statusleiste", page.is_visible("#statusbar #el-fb") and page.evaluate("(() => { const r = document.querySelector('#el-fb').getBoundingClientRect(); return r.right > innerWidth - 200 && r.bottom > innerHeight - 40; })()"))
    page.click("#el-fb"); page.wait_for_selector(".modal #el-fbt", timeout=3000); page.wait_for_timeout(300)
    check("Feedback: Dialog mit Art, Titel, Beschreibung und Screenshot-Vorschau", page.is_visible(".modal") and page.locator(".modal [name=el-fbart]").count() == 3 and page.is_visible(".modal #el-fbt") and page.is_visible(".modal #el-fbd") and page.evaluate("document.querySelector('.el-fbpic canvas')?.width || 0") > 100)
    page.screenshot(path=str(OUT / "e20_feedback.png"))
    page.click(".modal [data-ok]"); page.wait_for_timeout(200)
    check("Feedback ohne Titel: nicht gesendet, Fenster bleibt", page.is_visible(".modal") and not srv["fb"])
    page.click('.modal .el-fbart span:has-text("Wunsch")'); page.fill("#el-fbt", "Testzeile"); page.fill("#el-fbd", "Beschreibung"); clear_toasts()
    srv["mode"] = "offline"; page.click(".modal [data-ok]"); page.wait_for_timeout(400)
    check("Feedback offline: Meldung, Fenster und Text bleiben", page.is_visible(".modal") and page.input_value("#el-fbt") == "Testzeile" and "Keine Verbindung" in toasts() and not srv["fb"], toasts())
    srv["mode"] = "ok"; page.click(".modal [data-ok]"); page.wait_for_timeout(600)
    f = srv["fb"][0] if srv["fb"] else {}
    shot = srv["fbfiles"].get(f.get("screenshot_path") or "", (None, b""))
    check("Feedback gesendet: Zeile mit Art, Titel, Modul, Version, Projekt, Browser", f.get("art") == "wunsch" and f.get("titel") == "Testzeile" and f.get("beschreibung") == "Beschreibung" and f.get("app_version", "").startswith("elplexaCAD ") and f.get("modul") and f.get("projekt_id") == rid and f.get("user_agent"), f)
    check("Screenshot als PNG unter Konto/…", (f.get("screenshot_path") or "").startswith(UID + "/") and shot[0] == "image/png" and shot[1][:4] == b"\x89PNG", [f.get("screenshot_path"), shot[0]])
    check("Feedback: Fenster zu, Dank", not page.is_visible(".modal") and "Danke" in toasts(), toasts())
    page.click("#el-fb"); page.wait_for_timeout(800)
    page.uncheck("#el-fbshot"); page.fill("#el-fbt", "Ohne Bild"); page.click(".modal [data-ok]"); page.wait_for_timeout(500)
    check("Screenshot abgewählt: Zeile ohne Bild", len(srv["fb"]) == 2 and srv["fb"][1]["screenshot_path"] is None and len(srv["fbfiles"]) == 1, srv["fb"][-1:])
    key("0"); page.wait_for_timeout(150)
    page.click("#el-fb"); page.wait_for_timeout(300)
    check("Feedback in der Übersicht: ohne Screenshot, mit Hinweis", page.is_visible(".modal") and not page.is_visible(".el-fbpic") and "Ohne Screenshot" in page.inner_text(".modal"))
    page.keyboard.press("Escape"); page.wait_for_timeout(150)
    # ohne Internet, pausiert: Meldung, nichts geändert
    before = D(); clear_toasts(); srv["mode"] = "offline"
    page.click('#el-hub [data-elact="onsave"]'); page.wait_for_timeout(400)
    check("Ohne Internet: Meldung, Projekt unverändert", "Keine Verbindung" in toasts() and D() == before and not page.is_visible(".modal"), toasts())
    clear_toasts(); srv["mode"] = "paused"
    page.click("#el-tab-projekte"); page.click('#el-hub [data-elact="onlist"]'); page.wait_for_timeout(400)
    check("Pausiert (Gratis-Plan): Meldung mit „Resume project“", "pausiert" in toasts() and "Resume project" in toasts(), toasts())
    page.click("#el-pt-cur"); page.wait_for_timeout(150)
    check("Nach Fehler: Knöpfe wieder bedienbar", page.is_enabled('#el-hub [data-elact="onsave"]'))
    srv["mode"] = "ok"
    page.click("#el-acct"); page.click("#el-pf-logout"); page.wait_for_timeout(300)
    gone = "Abgemeldet" in toasts()
    page.click("#el-tab-projekte"); page.click("#el-pt-cur"); page.wait_for_timeout(200)  # Projekt unter «Projekte» (Etappe 6)
    check("Abmelden: Online-Bereich im Projekt weg", page.locator("#el-online").count() == 0 and gone)
    page.set_viewport_size({"width": 375, "height": 800}); page.wait_for_timeout(300)
    w = page.evaluate("[document.documentElement.scrollWidth, document.querySelector('#el-hub').scrollWidth, document.querySelector('#el-hub').clientWidth]")
    check("375 px: Übersicht läuft nicht seitlich über", w[0] <= 375 and w[1] <= w[2], w)
    page.screenshot(path=str(OUT / "e16_online_schmal.png"))
    b.close()

    # ---- Sperre ohne Anmeldung, wenn die App aus dem Netz läuft (CJ 17.10.); als Datei (file:) alles frei, siehe oben ----
    HTML = (ROOT / "dist" / "ElplexaCAD.html").read_text()
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 900}, accept_downloads=True)
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
    page.on("pageerror", lambda e: errors.append(str(e)))
    srv.update({"mode": "ok", "calls": []})
    page.route("https://keqfieduhipnulpkhdbj.supabase.co/**", fake)
    page.route("https://elplexa.test/**", lambda r: r.fulfill(status=200, content_type="text/html", body=HTML))
    page.goto("https://elplexa.test/"); page.wait_for_timeout(300)
    check("Im Netz: Start in der Projektübersicht", hub() and not page.is_visible(".modal"))
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    downloads = []; page.on("download", lambda d: downloads.append(d.suggested_filename))
    key("0"); page.wait_for_timeout(150)
    check("Im Netz ohne Anmeldung: Konto-Kreis gesperrt, im Projekt kein Login-Feld", page.evaluate("document.querySelector('#el-acct').classList.contains('lock')") and page.locator("#el-online, #el-hub #el-pf-form").count() == 0)
    page.screenshot(path=str(OUT / "e17_gesperrt.png"))
    key("0"); page.evaluate("document.activeElement?.blur()"); page.keyboard.press("Meta+s"); page.wait_for_timeout(400)
    check("⌘S ohne Anmeldung: keine Datei, Anmeldung erscheint", not downloads and page.is_visible(".modal") and "Anmelden" in page.inner_text(".modal") and "nur als DXF" in page.inner_text("#toasts"), downloads)
    page.click(".modal [data-c]"); page.wait_for_timeout(200)
    page.evaluate("document.querySelector('#btn-pdf').click()"); page.wait_for_timeout(300)
    check("PDF ohne Anmeldung: keine Blattauswahl, Anmeldung", page.is_visible(".modal") and "Anmelden" in page.inner_text(".modal") and "Welche Blätter" not in page.inner_text(".modal"))
    page.click(".modal [data-c]"); page.wait_for_timeout(200)
    page.evaluate("document.querySelector('#btn-lists').click()"); page.wait_for_timeout(300)
    check("Listen-CSV ohne Anmeldung: keine Datei", not downloads, downloads)
    if page.is_visible(".modal"): page.click(".modal [data-c]"); page.wait_for_timeout(200)
    page.evaluate("document.querySelector('#btn-dxf').click()"); page.wait_for_timeout(500)
    check("DXF ohne Anmeldung erlaubt", len(downloads) == 1 and downloads[0].endswith(".dxf"), downloads)
    check("Sperre: keine Anfrage an den Server ohne Anmeldung", not [c for c in srv["calls"] if "/rest/" in c or "/storage/" in c], srv["calls"])
    page.evaluate("document.querySelectorAll('#toasts .toast').forEach((t) => t.remove())")
    page.click("#el-fb"); page.wait_for_timeout(300)
    check("Feedback ohne Anmeldung: Hinweis „nur mit Login“, Anmeldung, kein Feedback-Fenster", "Feedback nur mit Login" in page.inner_text("#toasts") and page.is_visible(".modal") and "Anmelden" in page.inner_text(".modal") and not page.is_visible("#el-fbt"))
    page.click(".modal [data-c]"); page.wait_for_timeout(200)
    check("Feedback abgebrochen: nichts gesendet", not [c for c in srv["calls"] if "feedback" in c], srv["calls"])
    key("0"); page.wait_for_timeout(150)
    page.click("#el-acct"); page.wait_for_timeout(150)  # Konto-Kreis führt zum Reiter Profil (Etappe 6)
    page.fill("#el-pf-mail", "test@beispiel.ch"); page.fill("#el-pf-pw", "attrappe"); page.click('#el-pf-form [type="submit"]'); page.wait_for_timeout(500)
    page.click("#el-tab-projekte"); page.click("#el-pt-cur"); page.wait_for_timeout(200)
    on = page.inner_text("#el-online")
    check("Anmelden in der Übersicht: Konto sichtbar, Hinweis weg", "test@beispiel.ch" in on and "nur als DXF" not in on, on)
    key("0"); page.evaluate("document.activeElement?.blur()"); page.keyboard.press("Meta+s"); page.wait_for_timeout(300)
    page.click('.modal .choice:has-text("Lokal speichern")'); page.wait_for_timeout(500)
    check("Nach Anmeldung: ⌘S, „Lokal speichern“ speichert die Projektdatei", len(downloads) == 2 and downloads[1].endswith(".elplexa.json"), downloads)
    # Menü am Knopf Speichern (CJ 18.10.2026): Rechtsklick oder gedrückt halten; kurzer Klick wie bisher
    page.click("#btn-save", button="right"); page.wait_for_timeout(150)
    acts = page.evaluate("[...document.querySelectorAll('#el-savectx [data-elsaveact]')].filter((b) => !b.hidden).map((b) => b.dataset.elsaveact)")
    check("Speichern-Menü per Rechtsklick: Lokal, Speichern unter, Online (angemeldet)", page.is_visible("#el-savectx") and acts == ["file", "as", "on"], acts)
    page.click('#el-savectx [data-elsaveact="file"]'); page.wait_for_timeout(500)
    check("Speichern-Menü: „Lokal speichern (Datei)“ speichert die Projektdatei", not page.is_visible("#el-savectx") and len(downloads) == 3 and downloads[2].endswith(".elplexa.json"), downloads)
    bx = page.locator("#btn-save").bounding_box(); page.mouse.move(bx["x"] + 10, bx["y"] + 10); page.mouse.down(); page.wait_for_timeout(600); page.mouse.up(); page.wait_for_timeout(200)
    check("Speichern-Menü per gedrückt halten, ohne zu speichern", page.is_visible("#el-savectx") and not page.is_visible(".modal") and len(downloads) == 3, downloads)
    page.keyboard.press("Escape"); page.wait_for_timeout(100)

    # Modulkarte mit vielen Blättern (CJ 18.10.2026): eine Reihe, höchstens 5 Blatt-Kacheln und „+N“, nichts ragt hinaus; Klick öffnet genau dieses Blatt
    page.keyboard.press("Escape"); page.wait_for_timeout(100); key("1"); page.wait_for_timeout(150)
    page.evaluate("async () => { for (let k = 0; k < 12; k++) { document.querySelector('#add-menu [data-new=sheet]').click(); await new Promise((r) => setTimeout(r, 20)); } }")
    key("0"); page.wait_for_timeout(200)
    t = page.evaluate("""() => { const t = document.querySelector('#el-tile-schema'), r = t.getBoundingClientRect(), sh = [...t.querySelectorAll('[data-elsheet]')], more = t.querySelector('.el-more');
      const n = window.__schemacad.doc.sheets.filter((s) => !['dispo', 'pv', 'pvtab'].includes(s.kind)).length;
      return { n, k: sh.length, more: more?.textContent, out: [...t.querySelectorAll('.el-thumbs i')].some((i) => { const b = i.getBoundingClientRect(); return b.width && b.top < t.querySelector('.el-shs').getBoundingClientRect().bottom && b.right > r.right - 1; }), i: Number(sh[3].dataset.elsheet) }; }""")
    check("Modulkarte: 5 Blatt-Kacheln, „+N“ mit Rest, nichts ragt hinaus", t["k"] == 5 and t["more"] == f"+{t['n'] - 5}" and not t["out"], t)
    page.click(f"#el-sh-{t['i']}"); page.wait_for_timeout(150)
    check("Klick auf Blatt-Kachel öffnet genau dieses Blatt", not hub() and active() == t["i"], active())
    # „+N“: Übersicht aller Blätter des Moduls, Esc schliesst, Klick auf ein Blatt öffnet es; Knopf PDF druckt das Modul
    key("0"); page.wait_for_timeout(200); page.click("#el-tile-schema .el-more"); page.wait_for_timeout(150)
    pop = page.evaluate("[...document.querySelectorAll('#el-shpop [data-elsheet]')].map((b) => Number(b.dataset.elsheet))")
    check("+N: Übersicht mit allen Blättern des Moduls", page.is_visible("#el-shpop") and len(pop) == t["n"] and hub(), len(pop))
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    check("+N: Esc schliesst die Übersicht, Übersicht bleibt", not page.is_visible("#el-shpop") and hub())
    page.click("#el-tile-schema .el-more"); page.wait_for_timeout(150); page.click(f"#el-shpop [data-elsheet='{pop[-1]}']"); page.wait_for_timeout(150)
    check("+N: Klick auf das letzte Blatt öffnet genau dieses", not hub() and active() == pop[-1] and not page.is_visible("#el-shpop"), active())
    key("0"); page.wait_for_timeout(200)
    check("Modulkarte: Anzahl Blätter und Knopf PDF statt Beschreibung, dazu Modulstatus", page.inner_text("#el-tile-schema .el-ts").split() == [str(t["n"]), "Blätter", "Offen", "PDF"], page.inner_text("#el-tile-schema .el-ts"))
    # Eigenes PDF (CJ 18.10.2026): öffnet im neuen Tab statt Druckdialog. Seiten = „/Type /Page“ im PDF, Grössen aus /MediaBox (pt).
    page.evaluate("window.__open = []; window.open = (u) => { window.__open.push(u); return {}; }; window.print = () => { window.__printed = true; }; 0")
    def pdf_pages():
        page.wait_for_function("window.__open.length > 0", timeout=60000)
        txt = page.evaluate("(async () => { const b = new Uint8Array(await (await fetch(window.__open.shift())).arrayBuffer()); let s = ''; for (const c of b) s += String.fromCharCode(c); return s; })()")
        pdf_pages.txt = txt
        return [tuple(round(float(v) * 25.4 / 72) for v in m) for m in re.findall(r"/Type /Page\b.*?/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]", txt, re.S)]
    page.click("#el-tile-schema [data-elpdf]"); pp = pdf_pages()
    check("PDF: Schrift Barlow Semi Condensed eingebettet (normal und fett)", "/FontFile2" in pdf_pages.txt and "BarlowSC" in pdf_pages.txt)
    check("Knopf PDF: ein PDF im neuen Tab mit allen Blättern des Moduls, ohne Rückfrage und Druckdialog, Übersicht bleibt", len(pp) == t["n"] and not page.evaluate("!!window.__printed") and not page.is_visible(".modal") and hub(), pp)
    # Knopf PDF mit gemischtem Papier (CJ 18.10.2026: A3 und A4 gab scheinbar nur 1 Seite): neues PV-Modul mit Stringplan (A3) und Stringübersicht (A4)
    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('[data-elnew="pv"]'); page.wait_for_timeout(300)
    page.evaluate("document.querySelector('#add-menu [data-new=pvtab]').click()"); page.wait_for_timeout(300); key("0"); page.wait_for_timeout(200)
    pvt = page.evaluate("[...document.querySelectorAll('[id^=el-tile-pv]')].at(-1).id")
    page.click(f"#{pvt} [data-elpdf]"); pp = pdf_pages()
    check("PDF gemischtes Papier: ein PDF, Stringplan A3 quer und Stringübersicht A4 quer", pp == [(420, 297), (297, 210)] and not page.is_visible(".modal") and hub(), pp)
    check("PDF: Druckteile wieder leer", page.evaluate("document.querySelector('#printroot').innerHTML === ''"))
    key("1"); page.wait_for_timeout(150)
    page.click("#el-file"); page.click('#el-filemenu [data-elfile="new"]'); page.wait_for_timeout(150)
    check("Neu im Modul: Startauswahl wie bisher", page.is_visible("[data-start]") and not page.is_visible('.modal [data-f="2"]'))
    page.click(".modal [data-c]"); page.wait_for_timeout(100)
    b.close()

check("keine JS-Fehler", not errors, errors)
print("FEHLER:" if fails else "ALLE OK", fails, "| Ausgaben:", OUT)
sys.exit(1 if fails else 0)
