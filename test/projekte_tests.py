# UI-Tests Reiter «Projekte» (Etappe 3b, CJ 20.10.2026): Kacheln, Filter, Sortierung, Liste, Leerzustand, Fehlerfälle; Online gegen eine Attrappe. Vorher: node build.mjs elplexa
# Aufruf: python3 test/projekte_tests.py [Ausgabeordner]
import sys, tempfile, json, base64, uuid
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "ElplexaCAD.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="projekte_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
UID = "11111111-1111-1111-1111-111111111111"
jwt = "x." + base64.urlsafe_b64encode(json.dumps({"sub": UID}).encode()).decode().rstrip("=") + ".y"
N_ON = 50
rows = []
for i in range(N_ON):
    rows.append({"id": str(uuid.uuid4()), "name": f"Online {i:02d}", "status": ["Offerte", "In Arbeit", "Abgegeben", "Abgeschlossen"][i % 4], "updated_at": f"2026-10-{1 + i % 28:02d}T10:00:00+00:00",
                 "data": {"project": {"meta": {"OBJEKT": f"Objekt {i}"}, "time": [{"d": "2026-10-01", "h": 1.5, "n": ""}]}, "sheets": ["gross"] * 3}})
srv = {"mode": "ok", "selects": [], "bad": False}
def fake(route):
    req = route.request; u = urlparse(req.url); q = {k: v[0] for k, v in parse_qs(u.query).items()}; path = u.path
    if srv["mode"] == "offline": route.abort(); return
    if srv["mode"] == "paused": route.fulfill(status=540, body=""); return
    J = lambda o, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(o))
    if path == "/auth/v1/token": J({"access_token": jwt, "refresh_token": "r", "expires_at": 4102444800, "user": {"email": "test@beispiel.ch"}}); return
    if path == "/rest/v1/projects" and req.method == "GET":
        srv["selects"].append(q["select"])
        if srv["bad"] and "pm:" in q["select"]: J({"message": "ungültige Abfrage"}, 400); return
        def col(r, k):  # „alias:data->a->b“ wie PostgREST: Pfad in der Spalte data
            if "->" not in k: return r.get(k)
            v = r["data"]
            for part in k.split("->")[1:]: v = v.get(part) if isinstance(v, dict) else None
            return v
        J([{k.split(":")[0]: col(r, k.split(":")[-1]) for k in q["select"].split(",")} for r in sorted(rows, key=lambda r: r["updated_at"], reverse=True)]); return
    J({"message": "nicht gefunden"}, 404)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "540" not in m.text and "400" not in m.text and "ERR_FAILED" not in m.text else None)
    page.route("https://keqfieduhipnulpkhdbj.supabase.co/**", fake)
    vis = lambda s: page.is_visible(s)
    cnt = lambda: page.locator(".el-ptile").count()
    page.goto(URL); page.wait_for_timeout(300)
    check("Reiter Projekte, Zeit (Profil nur über den Konto-Kreis)", [t for t in page.evaluate("[...document.querySelectorAll('.el-tab')].map((t) => t.textContent)")] == ["Projekte", "Zeit"])
    page.click("#el-tab-projekte"); page.wait_for_timeout(250)
    check("Nur das geöffnete Projekt: erste Kachel mit «geöffnet»", cnt() == 1 and "geöffnet" in page.inner_text(".el-ptile.cur"))
    page.select_option('[data-elf="filter"]', "Abgeschlossen"); page.wait_for_timeout(200)
    check("Leerzustand: kein Projekt mit diesem Status", "Kein Projekt mit diesem Status" in page.inner_text(".el-pwrap") and cnt() == 0)
    page.select_option('[data-elf="filter"]', "Alle"); page.wait_for_timeout(200)
    check("Gast: Hinweis zur Anmeldung, keine Fehlermeldung", "Nicht angemeldet" in page.inner_text(".el-pwrap") and not vis(".el-perr"))
    page.screenshot(path=str(OUT / "p3b_leer.png"))

    # lokale Projekte: durch Speichern merkt sich der Browser Name, Status, Zusammenfassung
    page.evaluate("window.showSaveFilePicker = async () => ({ name: 'Lokal A.elplexa.json', createWritable: async () => ({ write: async () => {}, close: async () => {} }), isSameEntry: async () => false }); 0")
    page.click("#el-pt-cur"); page.wait_for_timeout(200); page.fill('[data-elp="OBJEKT"]', "Bärgen 268"); page.keyboard.press("Tab"); page.wait_for_timeout(200)
    page.click("#btn-save"); page.wait_for_timeout(500)
    page.click("#el-file"); page.click('#el-filemenu [data-elfile="new"]'); page.wait_for_timeout(300)
    if page.is_visible(".modal"): page.fill(".modal input", "Neues Projekt"); page.click(".modal [data-ok]"); page.wait_for_timeout(300)  # neues Projekt: das gespeicherte wird zu «zuletzt geöffnet»
    if not vis("#el-hub"): page.evaluate("document.activeElement?.blur()"); page.keyboard.press("0"); page.wait_for_timeout(250)
    page.click("#el-tab-projekte"); page.wait_for_timeout(300)
    check("Lokales Projekt als Kachel mit Objekt, Blattzahl, «lokal»", cnt() == 2 and "Bärgen 268" in page.inner_text(".el-ptile:not(.cur)") and "lokal" in page.inner_text(".el-ptile:not(.cur)") and "Blätter" in page.inner_text(".el-ptile:not(.cur)"), [page.inner_text(".el-ptile:not(.cur)") if cnt() > 1 else "", cnt()])
    check("Kachel zeigt Modul-Punkte", page.locator(".el-ptile:not(.cur) .el-pd").count() >= 1)

    # Online-Projekte: 50 Kacheln + 1 lokal
    page.click("#el-acct"); page.fill("#el-pf-mail", "test@beispiel.ch"); page.fill("#el-pf-pw", "attrappe"); page.click('#el-pf-form [type="submit"]'); page.wait_for_timeout(600)
    page.click("#el-tab-projekte"); page.wait_for_timeout(600)
    check(f"Angemeldet: {N_ON} Online- und 1 lokales Projekt plus das geöffnete als Kacheln", cnt() == N_ON + 2, cnt())
    check("Online-Abfrage ohne ganzes data (nur project)", any("pm:data->project->meta" in s for s in srv["selects"]) and not any(s.endswith("data") or ",data" in s or "data," in s for s in srv["selects"]), srv["selects"])
    check("Online-Kachel zeigt Objekt und Stunden", "Objekt" in page.inner_text(".el-ptile[data-elonline]") and "1,5 h" in page.inner_text(".el-ptile[data-elonline]"))
    page.screenshot(path=str(OUT / "p3b_kacheln.png"))
    # Filter
    page.select_option('[data-elf="filter"]', "Offerte"); page.wait_for_timeout(250)
    exp = len([r for r in rows if r["status"] == "Offerte"])
    check("Filter Offerte", cnt() >= exp and all("Offerte" in t for t in page.evaluate("[...document.querySelectorAll('.el-ptile .el-st')].map((e) => e.textContent)")), cnt())
    page.select_option('[data-elf="filter"]', "Abgeschlossen"); page.wait_for_timeout(250)
    check("Filter Abgeschlossen", cnt() == len([r for r in rows if r["status"] == "Abgeschlossen"]))
    page.select_option('[data-elf="filter"]', "Alle"); page.wait_for_timeout(250)
    # Sortierung
    page.select_option('[data-elf="sort"]', "name"); page.wait_for_timeout(250)
    names = page.evaluate("[...document.querySelectorAll('.el-pn')].map((e) => e.textContent)")
    check("Sortierung nach Name (das geöffnete Projekt bleibt vorn)", names[1:] == sorted(names[1:], key=lambda s: s.lower()), names[:4])
    page.select_option('[data-elf="sort"]', "zuletzt"); page.wait_for_timeout(250)
    # Liste
    page.click('[data-elview="liste"]'); page.wait_for_timeout(250)
    check("Umschalten auf Liste: gleiche Anzahl, Listenform", vis(".el-plist") and cnt() == N_ON + 2 and not vis(".el-pgrid"))
    page.screenshot(path=str(OUT / "p3b_liste.png"))
    page.click('[data-elview="kacheln"]'); page.wait_for_timeout(250)
    check("Zurück auf Kacheln", vis(".el-pgrid"))

    # Projekt-Index (Etappe 3a): recentAdd schreibt die Zusammenfassung, alte Einträge ohne sum laufen weiter
    idb = lambda: page.evaluate("() => new Promise((res) => { const r = indexedDB.open('elplexacad', 1); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('recent'); q.onsuccess = () => res((q.result || []).map((e) => ({ file: e.file, sum: e.sum || null }))); }; })")
    ent = idb()
    check("recentAdd speichert die Zusammenfassung (Objekt, Module, Blattzahl, Stunden)", ent and ent[0]["sum"] and ent[0]["sum"]["obj"] == "Bärgen 268" and isinstance(ent[0]["sum"]["n"], int) and isinstance(ent[0]["sum"]["mods"], list) and "h" in ent[0]["sum"], ent[:1])
    page.evaluate("() => new Promise((res) => { const r = indexedDB.open('elplexacad', 1); r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'), st = tx.objectStore('kv'), g = st.get('recent'); g.onsuccess = () => { st.put([...g.result, { file: 'alt.elplexa.json', name: 'Alter Eintrag', status: 'Offerte', handle: null, t: 1 }], 'recent'); }; tx.oncomplete = () => res(); }; })")
    page.goto(URL); page.wait_for_timeout(400); page.click("#el-tab-projekte"); page.wait_for_timeout(600)
    alt = page.locator(".el-ptile:has-text('Alter Eintrag')")
    txt = alt.inner_text() if alt.count() else ""
    check("Alter Eintrag ohne sum: Kachel mit «–», nichts «undefined» oder «null»", alt.count() == 1 and "–" in txt and "undefined" not in txt and "null" not in txt and "NaN" not in txt, txt)
    # Rückfall: lehnt der Server die schlanke Abfrage ab (400), gilt die alte
    srv["selects"].clear(); srv["bad"] = True
    page.click('.el-pbar [data-elact="onlist"]'); page.wait_for_timeout(700)
    check("Status 400: zweite, alte Abfrage ohne pm/pt, Liste lädt trotzdem", len(srv["selects"]) >= 2 and any("pm:" in x for x in srv["selects"]) and any("pm:" not in x for x in srv["selects"]) and cnt() >= N_ON, [srv["selects"], cnt()])
    srv["bad"] = False

    # Fehlerfälle
    srv["mode"] = "offline"
    page.goto(URL); page.wait_for_timeout(300)
    # nach Neuladen: Sitzung bleibt, Netz weg
    page.click("#el-tab-projekte"); page.wait_for_timeout(600)
    check("Kein Netz: Fehlerzeile mit «Erneut versuchen», lokale Kacheln bleiben", vis(".el-perr") and "Keine Verbindung" in page.inner_text(".el-perr"), page.inner_text(".el-pwrap")[:200])
    srv["mode"] = "paused"; page.click('.el-perr [data-elact="onlist"]'); page.wait_for_timeout(500)
    check("Online pausiert (540): Hinweis auf Resume", "pausiert" in page.inner_text(".el-perr"), page.inner_text(".el-pwrap")[:200])
    srv["mode"] = "ok"; page.click('.el-perr [data-elact="onlist"]'); page.wait_for_timeout(600)
    check("Erneut versuchen: Fehler weg, Online-Kacheln da", not vis(".el-perr") and cnt() >= N_ON, cnt())
    # Gast: nicht in der geteilten Ansicht
    check("keine Konsolenfehler", not errors, errors[:3])
    b.close()
print("Rot:" + str(fails) if fails else "alle ok")
sys.exit(1 if fails else 0)
