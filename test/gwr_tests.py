# UI-Tests Adresse und GWR am Projekt (elplexaCAD, CJ 19.10.2026). geo.admin.ch wird nachgebildet (Daten Bärgen 268, abgerufen 19.10.2026).
# Vorher: node build.mjs elplexa. Aufruf aus web-src: python3 test/gwr_tests.py [Ausgabeordner]
import sys, tempfile, json
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
from elstart import projektansicht
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "ElplexaCAD.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="gwr_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)

# 268b zuerst: der Abruf muss genau 268 nehmen
SEARCH = {"results": [
    {"attrs": {"label": "Bärgen 268b <b>6084 Hasliberg Wasserwendi</b>", "featureId": "502243702_0", "origin": "address", "detail": "baergen 268b 6084 hasliberg wasserwendi 783 hasliberg ch be"}},
    {"attrs": {"label": "Bärgen 268 <b>6084 Hasliberg Wasserwendi</b>", "featureId": "1397301_0", "origin": "address", "detail": "baergen 268 6084 hasliberg wasserwendi 783 hasliberg ch be"}}]}
FEATURE = {"feature": {"attributes": {
    "egid": "1397301", "egrid": "CH957046133515", "lparz": "1086", "ggdename": "Hasliberg", "ggdenr": 783, "gdekt": "BE", "gexpdat": "17.10.2026",
    "gkode": 2657876.307, "gkodn": 1177791.795, "gstat": 1004, "gkat": 1030, "gbauj": None, "garea": 177, "gastw": 3, "ganzwhg": 3,
    "gwaerzh1": 7430, "genh1": 7541, "gwaerzw1": 7630, "genw1": 7540, "dplz4": 6084, "dplzname": "Hasliberg Wasserwendi",
    "ewid": ["1", "2", "3"], "whgnr": [None, None, None], "wstwk": [3100, 3101, 3100], "wbez": ["West", "Ost", "Ost"],
    "warea": [147, 163, 45], "wazim": [5, 5, 1], "wbauj": [1999, 2017, 2017]}}}
srv = {"mode": "ok", "calls": []}
def geo(route):
    u = urlparse(route.request.url); srv["calls"].append(u.path)
    if srv["mode"] == "down": return route.abort()
    if u.path.endswith("/SearchServer"):
        q = parse_qs(u.query)["searchText"][0]
        body = SEARCH if "Bärg" in q else {"results": []}
    elif "/MapServer/ch.bfs.gebaeude_wohnungs_register/" in u.path:
        body = FEATURE
    elif u.path.endswith("/height"):
        body = {"height": "1261.7"}
    else: return route.fulfill(status=404, body="")
    route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(body))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1400, "height": 900}, accept_downloads=True)
    ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
    ctx.route("https://api3.geo.admin.ch/**", geo)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    D = lambda: page.evaluate("window.__schemacad.doc")
    P = lambda: D().get("project", {})
    toasts = lambda: page.evaluate("[...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent).join(' | ')")
    clear_toasts = lambda: page.evaluate("document.querySelectorAll('#toasts .toast').forEach((t) => t.remove())")
    def setp(k, v):
        page.fill(f'#el-hub [data-elp="{k}"]', v); page.press(f'#el-hub [data-elp="{k}"]', "Enter"); page.wait_for_timeout(120)
    page.goto(URL); page.wait_for_timeout(300); projektansicht(page)

    check("Übersicht: Adresszeilen da, GWR-Feld zu", page.is_visible('#el-hub [data-elp="adr:str"]') and page.is_visible('#el-hub [data-elp="adr:plz"]') and not page.evaluate("document.querySelector('#el-gwr').open"))
    check("GWR zu: Zusammenfassung „noch nicht abgerufen“", "noch nicht abgerufen" in page.inner_text("#el-gwr summary"))
    # Abruf ohne Adresse: Hinweis, kein Aufruf
    page.click("#el-gwr summary"); page.wait_for_timeout(100)
    page.click('#el-hub [data-elact="gwr"]'); page.wait_for_timeout(300)
    check("Ohne Adresse: Hinweis, keine Abfrage", "Strasse, Nr." in toasts() and not srv["calls"] and "gwr" not in P(), toasts())
    clear_toasts()
    setp("adr:str", "Bärgen"); setp("adr:nr", "268"); setp("adr:ort", "Hasliberg")
    d = D()
    check("Adresse in project.adr, nicht im Schriftfeld", d["project"].get("adr") == {"str": "Bärgen", "nr": "268", "ort": "Hasliberg"} and all("str" not in s["meta"] and "Bärgen" not in json.dumps(s["meta"], ensure_ascii=False) for s in d["sheets"]), d["project"].get("adr"))
    check("GWR-Feld bleibt nach Neuzeichnen offen", page.evaluate("document.querySelector('#el-gwr').open"))
    page.click('#el-hub [data-elact="gwr"]'); page.wait_for_timeout(600)
    g = P().get("gwr", {})
    check("Abruf: EGID 1397301 (nicht 268b), 3 Wohnungen, Höhe 1262 m", g.get("egid") == "1397301" and len(g.get("whg", [])) == 3 and g.get("h") == 1262, g)
    check("Abruf: Codes gespeichert", [g.get(k) for k in ("st", "kat", "wh", "en", "ww", "enw", "gde", "kt", "egrid", "parz", "pub")] == [1004, 1030, 7430, 7541, 7630, 7540, 783, "BE", "CH957046133515", "1086", "17.10.2026"], g)
    check("Abruf: Wohnung 2 mit Stockwerk, Lage, Fläche", g["whg"][1] == {"ewid": "2", "stwk": 3101, "lage": "Ost", "area": 163, "zi": 5, "bauj": 2017}, g["whg"][1])
    check("Leere PLZ aus dem GWR gefüllt, Ort bleibt wie eingegeben", P()["adr"] == {"str": "Bärgen", "nr": "268", "plz": "6084", "ort": "Hasliberg"}, P()["adr"])
    txt = page.inner_text("#el-gwr")
    check("Anzeige mit Bezeichnungen statt Codes", all(x in txt for x in ["Gebäude bestehend".replace("Gebäude ", ""), "Andere Wohngebäude", "Heizkessel (generisch) für ein Gebäude", "Holz (Stückholz)", "Heizkessel (generisch), Holz (generisch)", "783 Hasliberg", "CH957046133515", "1262 m", "Parterre", "1. Stock", "GWR-Stand 17.10.2026"]), txt)
    check("Zusammenfassung: EGID", "EGID 1397301" in page.inner_text("#el-gwr summary"))
    check("Knopf heisst jetzt „GWR aktualisieren“", page.inner_text('#el-hub [data-elact="gwr"]') == "GWR aktualisieren")
    check("Meldung nach dem Abruf", "EGID 1397301" in toasts(), toasts())
    page.screenshot(path=str(OUT / "g1_offen.png"), full_page=True)
    # zuklappen: Daten bleiben im Hintergrund
    page.click("#el-gwr summary"); page.wait_for_timeout(100)
    check("Zugeklappt: nur Zusammenfassung sichtbar", not page.is_visible("#el-gwr .el-ggrid") and P().get("gwr"))
    page.screenshot(path=str(OUT / "g2_zu.png"))
    # Fehler: Adresse nicht gefunden, Netz weg
    clear_toasts(); page.click("#el-gwr summary"); setp("adr:str", "Gibtsnichtweg"); page.click('#el-hub [data-elact="gwr"]'); page.wait_for_timeout(400)
    check("Unbekannte Adresse: Meldung, alte GWR-Daten bleiben", "nicht gefunden" in toasts() and P()["gwr"]["egid"] == "1397301", toasts())
    clear_toasts(); setp("adr:str", "Bärgen"); setp("adr:plz", "3011"); page.click('#el-hub [data-elact="gwr"]'); page.wait_for_timeout(400)
    check("Falsche PLZ: Meldung nennt die gefundenen Orte", "Gefunden: Bärgen 268 6084 Hasliberg Wasserwendi" in toasts(), toasts())
    clear_toasts(); setp("adr:plz", ""); setp("adr:ort", "Meiringen"); page.click('#el-hub [data-elact="gwr"]'); page.wait_for_timeout(400)
    check("Ohne PLZ, anderer Ort: nicht genommen", "nicht gefunden" in toasts(), toasts())
    clear_toasts(); setp("adr:ort", "Hasliberg"); srv["mode"] = "down"; page.click('#el-hub [data-elact="gwr"]'); page.wait_for_timeout(400)
    check("Ohne Netz: Meldung, Knopf wieder bereit", "nicht erreichbar" in toasts() and page.is_enabled('#el-hub [data-elact="gwr"]'), toasts())
    srv["mode"] = "ok"
    # Speichern und Laden ohne Datenverlust
    d1 = D()
    with page.expect_download() as dl: page.evaluate("document.activeElement?.blur()"); page.keyboard.press("Meta+s")
    f = OUT / dl.value.suggested_filename; dl.value.save_as(str(f)); page.wait_for_timeout(300)
    with page.expect_file_chooser() as fc: page.keyboard.press("Meta+o")
    fc.value.set_files(str(f)); page.wait_for_timeout(400)
    strip = lambda d: {**d, "project": {k: v for k, v in d.get("project", {}).items() if k not in ("auto", "id")}}
    check("Speichern und Laden: Adresse und GWR gleich", strip(D()) == strip(d1) and D()["project"]["gwr"]["whg"][2]["area"] == 45)
    # ---- Tab, Adresssuche, Titelseite, Tmin (CJ 19.10.2026) ----
    if not page.is_visible("#el-hub"): page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }))"); page.wait_for_timeout(200)
    act = lambda: page.evaluate("(() => { const a = document.activeElement; return a.dataset.elp || a.dataset.meta || a.dataset.pvopt || a.id || a.tagName; })()")
    page.click('#el-hub [data-elp="OBJEKT"]'); page.keyboard.type("EFH Test"); page.keyboard.press("Tab"); page.wait_for_timeout(150)
    check("Tab in der Übersicht: Objekt übernommen, weiter zu Auftrag", act() == "AUFTRAG" and P().get("meta", {}).get("OBJEKT") == "EFH Test", [act(), P().get("meta")])
    for _ in range(5): page.keyboard.press("Tab")  # Bauherr, E-Mail, Telefon (Offerte Schritt 2), Index, Strasse
    page.wait_for_timeout(100)
    check("Tab weiter bis Strasse", act() == "adr:str", act())
    page.keyboard.press("Shift+Tab"); page.wait_for_timeout(100)
    check("Shift+Tab zurück zu Index", act() == "INDEX", act())
    # Adresssuche
    clear_toasts(); page.fill('#el-hub [data-elp="adr:str"]', ""); page.keyboard.press("Tab"); page.wait_for_timeout(100)
    page.click('#el-hub [data-elp="adr:str"]'); page.keyboard.type("Bärg"); page.wait_for_timeout(500)
    opts = page.evaluate("[...document.querySelectorAll('#el-adrlist [data-adr]')].map((b) => b.textContent)")
    check("Tippen zeigt Vorschläge", page.is_visible("#el-adrlist") and opts == ["Bärgen 268b6084 Hasliberg Wasserwendi", "Bärgen 2686084 Hasliberg Wasserwendi"] and page.get_attribute('#el-hub [data-elp="adr:str"]', "aria-expanded") == "true", opts)
    page.screenshot(path=str(OUT / "g4_suche.png"))
    page.keyboard.press("ArrowDown"); page.keyboard.press("ArrowDown"); page.wait_for_timeout(50)
    check("Pfeiltasten markieren", page.get_attribute("#el-adr-1", "aria-selected") == "true" and page.get_attribute('#el-hub [data-elp="adr:str"]', "aria-activedescendant") == "el-adr-1")
    page.keyboard.press("Enter"); page.wait_for_timeout(600)
    check("Auswahl füllt die Adresse, holt GWR", P().get("adr") == {"str": "Bärgen", "nr": "268", "plz": "6084", "ort": "Hasliberg Wasserwendi"} and P().get("gwr", {}).get("egid") == "1397301" and page.is_hidden("#el-adrlist"), P().get("adr"))
    page.click('#el-hub [data-elp="adr:str"]', click_count=3); page.keyboard.type("Nirgendwo"); page.wait_for_timeout(500)
    check("Keine Treffer: Hinweis", "Keine Adresse gefunden" in page.inner_text("#el-adrlist"))
    page.keyboard.press("Escape"); page.wait_for_timeout(50)
    check("Esc schliesst die Liste", page.is_hidden("#el-adrlist"))
    page.fill('#el-hub [data-elp="adr:str"]', "Bärgen"); page.keyboard.press("Tab"); page.wait_for_timeout(100)
    # Titelseite zeigt die Objektadresse
    page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))"); page.wait_for_timeout(300)
    sv = page.evaluate("(() => { const d = window.__schemacad.doc; return d.sheets[window.__schemacad.active].kind; })()")
    if sv != "title":
        page.evaluate("document.querySelector('[data-ctx=\"0\"], #el-sh-0')?.click()")
    page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }))"); page.wait_for_timeout(200)
    page.click("#el-sh-0"); page.wait_for_timeout(300)
    check("Titelseite zeigt die Objektadresse", "Bärgen 268, 6084 Hasliberg Wasserwendi" in page.text_content("#sheet"), page.evaluate("window.__schemacad.doc.sheets[window.__schemacad.active].kind"))
    page.screenshot(path=str(OUT / "g5_titel.png"))
    # Tab in der rechten Leiste (Titelseite: Felder Objekt, Auftrag …)
    fields = page.evaluate("[...document.querySelectorAll('#right input, #right textarea')].filter((e) => e.getClientRects().length).map((e) => e.dataset.meta || e.dataset.info || e.id).slice(0, 3)")
    page.click(f"#right input >> nth=0"); page.keyboard.type(" X"); page.keyboard.press("Tab"); page.wait_for_timeout(150)
    a2 = page.evaluate("(() => { const a = document.activeElement; return a.closest('#right') ? (a.dataset.meta || a.dataset.info || a.id) : 'weg'; })()")
    check("Tab in der rechten Leiste: weiter zum zweiten Feld", a2 == fields[1], [fields, a2])
    # PV: Tmin-Vorschlag aus der Höhe
    page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }))"); page.wait_for_timeout(200)
    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('#el-addmenu [data-elnew="pv"]'); page.wait_for_timeout(400)
    page.click('#right [data-pop="wr"]'); page.wait_for_timeout(250)
    sug = page.locator('#pv-pop [data-pvact="tminset"]')
    check("PV: Vorschlag −15 °C aus 1262 m", sug.count() == 1 and "−15 °C" in sug.inner_text() and "1262 m" in page.inner_text("#pv-pop .pv-tminsug"), page.inner_text("#pv-pop")[:300])
    sug.click(); page.wait_for_timeout(200)
    check("PV: Übernehmen setzt Tmin −15", D().get("pv", {}).get("tmin") == -15 and "gesetzt" in page.inner_text("#pv-pop .pv-tminsug"))
    page.screenshot(path=str(OUT / "g6_pv.png"))
    # schmal: nichts läuft seitlich über
    if not page.is_visible("#el-hub"): page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }))"); page.wait_for_timeout(200)
    page.evaluate("document.querySelector('#el-gwr').open = true"); page.set_viewport_size({"width": 375, "height": 800}); page.wait_for_timeout(300)
    w = page.evaluate("[document.documentElement.scrollWidth, document.querySelector('#el-hub').scrollWidth, document.querySelector('#el-hub').clientWidth]")
    check("375 px: Übersicht mit GWR läuft nicht seitlich über", w[0] <= 375 and w[1] <= w[2], w)
    page.screenshot(path=str(OUT / "g3_schmal.png"), full_page=True)
    b.close()

check("Keine Fehler in der Seite", not errors, errors)
print(f"\n{len(fails)} Fehler. Bilder in {OUT}")
sys.exit(1 if fails else 0)
