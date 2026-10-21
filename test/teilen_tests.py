# UI-Tests Teilen per Link (Meilenstein 2, Schritt 1 und Module teilen, 18.10.2026) gegen eine Attrappe statt Supabase. Vorher: node build.mjs elplexa
# Ersteller: Link erstellen, kopieren, widerrufen. Empfänger (?teilen=): ohne Login nur ansehen, nichts änderbar, eigene Sicherung bleibt.
# Aufruf aus web-src: python3 test/teilen_tests.py [Ausgabeordner]
import sys, tempfile, json, base64, hashlib, re
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="teilen_"))
OUT.mkdir(parents=True, exist_ok=True)
HTML = (ROOT / "dist" / "ElplexaCAD.html").read_text()
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)

UID = "11111111-2222-3333-4444-555555555555"
TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012345"
TOKEN2 = "ModulLinkModulLinkModulLinkModul"  # Modul-Link (CJ 18.10.2026)
PID = "99999999-0000-0000-0000-000000000001"
PDF = (ROOT / "test" / "ui_out.pdf").read_bytes(); B64 = base64.b64encode(PDF).decode(); SHA = hashlib.sha256(PDF).hexdigest()
jwt = "x." + base64.urlsafe_b64encode(json.dumps({"sub": UID}).encode()).decode().rstrip("=") + ".y"
# Online-Stand wie in `projects.data`: PDF nur als Verweis (sha), Zeit entfernt die Datenbankfunktion (hier schon weggelassen)
DATA = {"format": "schemacad", "version": 6, "active": 0, "nextId": 100, "pv": {"moduleTypes": []},
        "project": {"name": "EFH Geteilt", "status": "Abgegeben", "meta": {"OBJEKT": "Sonnenweg 1"}},
        "assets": {"a1": {"name": "dach.pdf", "type": "application/pdf", "sha": SHA}},
        "sheets": [{"meta": {"BLATT": "1", "TITEL": "Hauptverteilung"}, "sid": 1, "items": [{"id": 5, "type": "text", "x": 50, "y": 100, "h": 5, "s": "Geteilter Text"}]},
                   {"kind": "pv", "sid": 2, "meta": {"BLATT": "1"}, "bg": {"asset": "a1", "name": "dach.pdf", "page": 1, "w": 842, "h": 595}, "items": []}]}
srv = {"shares": [], "calls": [], "grund": None, "saved": []}

def fake(route):
    req = route.request; u = urlparse(req.url); q = {k: v[0] for k, v in parse_qs(u.query).items()}; path = u.path
    srv["calls"].append(f"{req.method} {path}")
    J = lambda o, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(o), headers={"Access-Control-Allow-Origin": "*"})
    if path == "/rest/v1/projects" and req.method == "PATCH":  # Online speichern vor „Modul teilen“
        srv["saved"].append(json.loads(req.post_data)); J([{"id": PID, "updated_at": "2026-10-18T12:00:00Z"}]); return
    if path == "/storage/v1/object/list/projekt-pdf": J([]); return
    if path == "/rest/v1/projects" and req.method == "GET":
        J([{"id": PID, "name": "EFH Geteilt", "status": "Abgegeben", "updated_at": "2026-10-18T10:00:00Z"}]); return
    if path == "/rest/v1/project_shares":
        if req.method == "GET":
            J([{k: s.get(k) for k in ("id", "token", "expires_at", "modules")} for s in srv["shares"] if s["project_id"] == q["project_id"][3:] and not s["revoked_at"]]); return
        body = json.loads(req.post_data)
        if req.method == "POST":
            s = {"id": f"s{len(srv['shares']) + 1}", "token": TOKEN2 if body.get("modules") else TOKEN, "expires_at": "2026-11-17T10:00:00Z", "revoked_at": None, **body}
            srv["shares"].append(s); J([{k: s.get(k) for k in ("id", "token", "expires_at", "modules")}], 201); return
        if req.method == "PATCH":
            hit = [s for s in srv["shares"] if s["id"] == q["id"][3:]]
            for s in hit: s.update(body)
            J([{"id": s["id"]} for s in hit]); return
    if path == "/rest/v1/rpc/share_open":
        tok = json.loads(req.post_data)["p_token"]
        if tok == TOKEN2 and not srv["grund"]:  # wie share_open in der Datenbank: nur Blätter der freigegebenen Module, Pläne nur von diesen
            J({"ok": True, "name": "EFH Geteilt", "status": "Abgegeben", "data": {**DATA, "assets": {}, "sheets": [sh for sh in DATA["sheets"] if sh.get("kind") != "pv"]},
               "updated_at": "2026-10-18T10:00:00Z", "ablauf": "2026-11-17T10:00:00Z", "modules": ["schema"]}); return
        ok = tok == TOKEN and not srv["grund"]
        J({"ok": True, "name": "EFH Geteilt", "status": "Abgegeben", "data": DATA, "updated_at": "2026-10-18T10:00:00Z", "ablauf": "2026-11-17T10:00:00Z"} if ok
          else {"ok": False, "grund": srv["grund"] or "ungueltig"}); return
    if path == "/functions/v1/teilen-pdf":
        J({"ok": True, "urls": {SHA: "https://keqfieduhipnulpkhdbj.supabase.co/storage/v1/object/sign/projekt-pdf/x.pdf?token=t"}}); return
    if path.startswith("/storage/v1/object/sign/"): route.fulfill(status=200, content_type="application/pdf", body=PDF, headers={"Access-Control-Allow-Origin": "*"}); return
    J({"message": "nicht gefunden"}, 404)

with sync_playwright() as p:
    b = p.chromium.launch()
    def open_page(url, session=False, seed=None):
        ctx = b.new_context(viewport={"width": 1400, "height": 900}, accept_downloads=True)
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin="https://elplexa.test")
        page = ctx.new_page()
        page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
        if session: page.add_init_script(f"localStorage.setItem('schemacad.cloud.v1', JSON.stringify({{ access_token: '{jwt}', refresh_token: 'r', expires_at: 4102444800, email: 'cj@beispiel.ch' }}))")
        if seed: page.add_init_script(f"if (!sessionStorage.getItem('seeded')) {{ sessionStorage.setItem('seeded', '1'); for (const [k, v] of Object.entries({json.dumps(seed)})) localStorage.setItem(k, v); }}")
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.route("https://keqfieduhipnulpkhdbj.supabase.co/**", fake)
        page.route("https://elplexa.test/**", lambda r: r.fulfill(status=200, content_type="text/html", body=HTML))
        page.goto(url); page.wait_for_timeout(500)
        return ctx, page
    def key(page, k, **o):
        page.evaluate("([k, o]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }))", [k, o])
        page.wait_for_timeout(120)

    # ---- Ersteller: Link erstellen, kopieren, widerrufen ----
    ctx, page = open_page("https://elplexa.test/", session=True)
    def share_ctx():  # Rechtsklick auf die Online-Projektkachel im Reiter Projekte (CJ 21.10.2026, vorher Liste im Projekt)
        page.click(f'#el-hub [data-elonline="{PID}"]', button="right"); page.wait_for_timeout(150); page.click('#el-projctx [data-elprojact="share"]'); page.wait_for_timeout(300)
    page.click("#el-nav-projekte"); page.click('#el-hub [data-elact="onlist"]'); page.wait_for_timeout(300)
    page.click(f'#el-hub [data-elonline="{PID}"]', button="right"); page.wait_for_timeout(150)
    check("Rechtsklick Online-Projekt: „Link teilen …“", page.is_visible('#el-projctx [data-elprojact="share"]'))
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    share_ctx()
    m = page.inner_text(".modal")
    check("Fenster „Link teilen“: noch kein Link, Hinweis 30 Tage und nur ansehen", "Link teilen" in m and "Noch kein gültiger Link" in m and "30 Tage" in m and "nur zum Ansehen" in m, m)
    page.click(".modal [data-shnew]"); page.wait_for_timeout(400)
    url = page.input_value(".modal .el-shurl")
    check("Neuer Link: Adresse mit ?teilen=<Schlüssel>", url == f"https://elplexa.test/?teilen={TOKEN}", url)
    check("Neuer Link: für das richtige Projekt angelegt", srv["shares"] and srv["shares"][0]["project_id"] == PID, srv["shares"])
    clip = page.evaluate("navigator.clipboard.readText()")
    check("Neuer Link: gleich in die Zwischenablage kopiert", clip == url, clip)
    check("Neuer Link: Ablauf sichtbar", "17.11.2026" in page.inner_text(".modal"))
    page.screenshot(path=str(OUT / "t1_link_teilen.png"))
    page.evaluate("navigator.clipboard.writeText('')"); page.click(".modal [data-shcopy]"); page.wait_for_timeout(200)
    check("Kopieren: Link in der Zwischenablage", page.evaluate("navigator.clipboard.readText()") == url)
    page.click(".modal [data-c]"); page.wait_for_timeout(150)
    share_ctx()
    check("Wieder geöffnet: gültiger Link aus der Datenbank", page.input_value(".modal .el-shurl") == url)
    page.click(".modal [data-shrev]"); page.wait_for_timeout(300)
    check("Widerrufen: Link weg, in der Datenbank revoked_at gesetzt", "Noch kein gültiger Link" in page.inner_text(".modal") and srv["shares"][0]["revoked_at"], srv["shares"])
    check("Widerrufen: Meldung", "widerrufen" in page.inner_text("#toasts"))
    page.click(".modal [data-c]"); ctx.close()

    # ---- Empfänger ohne Login: geteilte Ansicht ----
    srv["shares"][0]["revoked_at"] = None; srv["calls"].clear()
    OWN = json.dumps({"name": "Mein Projekt", "text": json.dumps({"format": "schemacad", "version": 6, "sheets": [{"meta": {}, "items": [{"id": 1, "type": "text", "x": 1, "y": 1, "h": 3, "s": "eigen"}]}]})})
    seed = {"schemacad.autosave.v1": OWN, "elplexacad.zeit.abc": json.dumps({"f": "Mein Projekt", "auto": []})}
    ctx, page = open_page(f"https://elplexa.test/?teilen={TOKEN}", seed=seed)
    D = lambda: page.evaluate("window.__schemacad.doc")
    ls = lambda: page.evaluate("Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))")
    hub = page.inner_text("#el-hub").lower()
    check("Empfänger: Übersicht mit „Geteilte Ansicht“ und Stand/Ablauf", "geteilte ansicht" in hub and "17.11.2026" in hub and "nichts ändern" in hub, hub)
    check("Empfänger: Hinweis oben „Geteilte Ansicht · nur ansehen“", page.is_visible(".el-sharebadge") and "nur ansehen" in page.inner_text(".el-sharebadge"))
    check("Empfänger: Projektname und Projektdaten geladen", page.input_value('#el-hub [data-elp="name"]') == "EFH Geteilt" and page.input_value('#el-hub [data-elp="OBJEKT"]') == "Sonnenweg 1")
    check("Empfänger: Felder nur lesbar, kein Status-Auswahlfeld", page.evaluate("[...document.querySelectorAll('#el-hub input[data-elp]')].every((i) => i.readOnly)") and not page.query_selector('#el-hub select[data-elp]'))
    check("Empfänger: keine Projekte, Online, Zeit, + Modul, PDF, Kachelmenü", not page.query_selector("#el-online, #el-recent, .el-time, #el-addmod, [data-elpdf], [data-modctx], #el-hub [data-ctx], [data-elact=pdf]"))
    check("Empfänger: Speichern, Neu, Öffnen, Export, Rückgängig, Feedback ausgeblendet", page.evaluate("['#btn-save', '#btn-new', '#btn-open', '#btn-export', '#btn-undo', '#el-fb', '#sheet-add'].every((s) => !document.querySelector(s)?.checkVisibility())"))
    check("Empfänger: Kopfleiste ohne Projekte, Zeit, Tabs, Heute-Chip, Konto (Paket C)", not any(page.is_visible(x) for x in ("#el-nav-projekte", "#el-nav-zeit", "#el-ptabs", "#el-tabsel", "#el-daychip", "#el-acct", ".el-helpbtn")) and page.is_visible(".el-sharebadge"))
    check("Empfänger: PDF-Dachplan über signierte Adresse geladen", D().get("assets", {}).get("a1", {}).get("data") == B64)
    check("Empfänger: kein Login, kein Zugriff auf projects oder project_shares", not [c for c in srv["calls"] if "/auth/" in c or "/rest/v1/projects" in c or "/rest/v1/project_shares" in c], srv["calls"])
    page.screenshot(path=str(OUT / "t2_empfaenger_uebersicht.png"))
    d0 = json.dumps(D()["sheets"])
    page.click("#el-hub [data-elopen]"); page.wait_for_timeout(300)
    check("Empfänger: Modul öffnet (Schema)", not page.is_visible("#el-hub") and "Schema" in page.inner_text("#el-crumb"))
    check("Empfänger: Seitenleisten ausgeblendet und gesperrt", page.evaluate("['#left', '#right'].every((s) => document.querySelector(s).inert && getComputedStyle(document.querySelector(s)).visibility === 'hidden')"))
    box = page.query_selector("#stage").bounding_box(); cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    v0 = page.evaluate("window.__schemacad.view")
    page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx + 80, cy + 40, steps=5); page.mouse.up(); page.wait_for_timeout(150)
    check("Empfänger: Ziehen verschiebt nur die Ansicht", page.evaluate("window.__schemacad.view")["x"] != v0["x"] and json.dumps(D()["sheets"]) == d0)
    page.mouse.dblclick(cx, cy); page.wait_for_timeout(150)
    page.evaluate("window.__schemacad.sel") ;
    for k in ["Delete", "Backspace", "l", "t", "r", "ArrowLeft", "n"]: key(page, k)
    for k in ["z", "d", "v", "s", "a"]: key(page, k, metaKey=True)
    key(page, "z", metaKey=True, shiftKey=True)
    page.wait_for_timeout(300)
    check("Empfänger: Tasten (Entf, Werkzeuge, ⌘Z, ⌘D, ⌘V, ⌘S, ⌘A) ändern nichts", json.dumps(D()["sheets"]) == d0 and not page.is_visible(".modal") and not page.is_visible("#texteditor:not([hidden])"))
    check("Empfänger: nie „ungespeichert“", not page.evaluate("document.querySelector('#dirty').checkVisibility()"))
    page.evaluate("document.querySelector('#btn-save').click(); document.querySelector('#btn-dxf').click(); document.querySelector('#btn-pdf').click(); document.querySelector('#btn-lists').click()"); page.wait_for_timeout(400)
    check("Empfänger: Speichern, DXF, PDF, Listen auch per Klick gesperrt", not page.is_visible(".modal") and "nur ansehen" in page.inner_text("#toasts"))
    key(page, "PageDown"); page.wait_for_timeout(200)
    key(page, "3"); page.wait_for_timeout(400)
    check("Empfänger: PV-Modul mit Dachplan zu sehen", D()["sheets"][D()["active"]].get("kind") == "pv" and json.dumps(D()["sheets"]) == d0)
    page.screenshot(path=str(OUT / "t3_empfaenger_pv.png"))
    page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx - 60, cy, steps=4); page.mouse.up(); page.wait_for_timeout(200)
    check("Empfänger: auch im PV nichts verschoben", json.dumps(D()["sheets"]) == d0)
    key(page, "0"); page.wait_for_timeout(200)
    page.click("#el-hub [data-elsheet]", button="right"); page.wait_for_timeout(200)
    check("Empfänger: Rechtsklick auf Blatt-Kachel ohne Menü", not page.evaluate("document.querySelector('#sheet-ctx').checkVisibility()"))
    page.wait_for_timeout(16000)  # Zeit-Takt (15 s) läuft einmal durch
    st = ls()
    check("Empfänger: eigene Absturz-Sicherung bleibt unverändert", st.get("schemacad.autosave.v1") == OWN, st.get("schemacad.autosave.v1", "")[:80])
    check("Empfänger: keine Zeit-Sicherung angelegt", sorted(k for k in st if k.startswith("elplexacad.zeit.")) == ["elplexacad.zeit.abc"], list(st))
    check("Empfänger: keine Zeit im Projekt", "auto" not in (D().get("project") or {}))
    rec = page.evaluate("new Promise((res) => { const r = indexedDB.open('elplexacad', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('recent'); q.onsuccess = () => res(q.result || []); }; })")
    check("Empfänger: nicht unter „zuletzt geöffnet“", rec == [], rec)
    page.reload(); page.wait_for_timeout(600)
    check("Neu laden: wieder geteilte Ansicht, eigene Sicherung nicht geladen", "geteilte ansicht" in page.inner_text("#el-hub").lower() and page.input_value('#el-hub [data-elp="name"]') == "EFH Geteilt" and ls().get("schemacad.autosave.v1") == OWN)
    page.set_viewport_size({"width": 375, "height": 800}); page.wait_for_timeout(200)
    w = page.evaluate("[document.documentElement.scrollWidth, document.querySelector('#el-hub').scrollWidth, document.querySelector('#el-hub').clientWidth]")
    check("375 px: geteilte Übersicht läuft nicht seitlich über", w[0] <= 375 and w[1] <= w[2], w)
    page.screenshot(path=str(OUT / "t4_empfaenger_schmal.png"))
    page.click("#el-hub [data-elopen]"); page.wait_for_timeout(400)  # Fehler CJ 18.10.2026: auf dem Handy war die Zeichenfläche 0 px breit
    st = page.evaluate("(() => { const r = document.querySelector('#stage').getBoundingClientRect(); return [r.width, r.height, document.querySelectorAll('#world *').length]; })()")
    check("375 px: Modul offen, Zeichenfläche ganze Breite und bis unten, Zeichnung da", st[0] >= 370 and st[1] > 600 and st[2] > 0, st)
    check("375 px: „Übersicht“ oben sichtbar", page.is_visible("#el-crumb .el-back") and page.evaluate("document.querySelector('#el-crumb').getBoundingClientRect().width") > 60)
    page.screenshot(path=str(OUT / "t4b_empfaenger_schmal_modul.png"))
    ctx.close()

    # ---- Ungültig, abgelaufen, widerrufen: klare Meldung, nichts zu sehen ----
    for grund, text in [("widerrufen", "widerrufen"), ("abgelaufen", "abgelaufen"), (None, "ungültig")]:
        srv["grund"] = grund
        ctx, page = open_page(f"https://elplexa.test/?teilen={TOKEN if grund else 'falsch'}")
        h = page.inner_text("#el-hub")
        check(f"Link {text}: Meldung „{text}“ und Hinweis neuer Link", text in h and "neuen Link" in h and page.is_visible('#el-hub a[href="/"]'), h)
        key(page, "Escape"); key(page, "1")
        check(f"Link {text}: Übersicht bleibt, kein Modul", page.is_visible("#el-hub") and not page.query_selector("#el-hub [data-elopen]"))
        if grund == "widerrufen": page.screenshot(path=str(OUT / "t5_widerrufen.png"))
        ctx.close()
    srv["grund"] = None

    # ---- Module teilen (CJ 18.10.2026): Exportieren › Modul teilen, Häkchen je Modul, Empfänger sieht nur das Modul ----
    LINKED = dict(DATA, project={**DATA["project"], "online": {"id": PID, "at": "2026-10-18T10:00:00Z"}}); LINKED.pop("assets"); LINKED["sheets"] = [DATA["sheets"][0], {k: v for k, v in DATA["sheets"][1].items() if k != "bg"}]
    srv["shares"].clear(); srv["calls"].clear()
    ctx, page = open_page("https://elplexa.test/", session=True, seed={"schemacad.autosave.v1": json.dumps({"name": "EFH Geteilt", "text": json.dumps(LINKED)})})
    key(page, "1"); page.wait_for_timeout(200)
    page.click("#btn-export"); page.wait_for_timeout(150)
    check("Exportieren: „Modul teilen …“ im Menü", page.is_visible("#export-menu #el-btn-share"))
    page.click("#el-btn-share"); page.wait_for_timeout(300)
    m = page.inner_text(".modal") if page.is_visible(".modal") else ""
    check("Modul teilen mit ungespeicherten Änderungen: zuerst online speichern", "Zuerst online speichern" in m, m)
    page.click('.modal [data-r="1"]'); page.wait_for_timeout(600)
    check("Modul teilen: online gespeichert, dann Fenster „Link teilen“", len(srv["saved"]) == 1 and page.is_visible(".modal .el-shpick"), [len(srv["saved"]), srv["calls"][-4:]])
    boxes = page.evaluate("[...document.querySelectorAll('.modal [data-shmod]')].map((b) => [b.dataset.shmod, b.checked])")
    check("Häkchen je Modul, nur das offene Modul gewählt", boxes == [["schema", True], ["pv", False]], boxes)
    page.click(".modal [data-shnew]"); page.wait_for_timeout(400)
    check("Modul-Link: Datenbank bekommt nur dieses Modul", srv["shares"] and srv["shares"][-1].get("modules") == ["schema"], srv["shares"])
    check("Modul-Link: Umfang in der Liste sichtbar", "Schema · bis 17.11.2026" in page.inner_text(".modal"), page.inner_text(".modal"))
    page.screenshot(path=str(OUT / "t6_modul_teilen.png"))
    page.click('.modal [data-shmod="schema"]'); page.wait_for_timeout(150)
    check("Kein Modul gewählt: „Neuen Link erstellen“ gesperrt", page.is_disabled(".modal [data-shnew]"))
    page.click('.modal [data-shmod="schema"]'); page.click('.modal [data-shmod="pv"]'); page.wait_for_timeout(150); page.click(".modal [data-shnew]"); page.wait_for_timeout(400)
    check("Alle Module gewählt = ganzes Projekt (ohne Modulliste)", "modules" not in srv["shares"][-1] and "Ganzes Projekt" in page.inner_text(".modal"), srv["shares"][-1])
    page.click(".modal [data-c]"); ctx.close()
    srv["calls"].clear()
    ctx, page = open_page(f"https://elplexa.test/?teilen={TOKEN2}")
    hub = page.inner_text("#el-hub")
    tiles = page.evaluate("[...document.querySelectorAll('#el-hub [data-elopen]')].map((b) => b.dataset.elopen)")
    check("Empfänger Modul-Link: nur das Modul Schema, Hinweis nennt es", tiles == ["schema"] and "das Modul „Schema“" in hub, [tiles, hub[:200]])
    check("Empfänger Modul-Link: kein Dachplan geholt (gehört nicht zum Modul)", not [c for c in srv["calls"] if "teilen-pdf" in c or "/storage/" in c], srv["calls"])
    page.screenshot(path=str(OUT / "t7_empfaenger_modul.png")); ctx.close()
    srv["grund"] = "modul_fehlt"
    ctx, page = open_page(f"https://elplexa.test/?teilen={TOKEN2}")
    check("Modul gibt es nicht mehr: klare Meldung", "gibt es in diesem Projekt nicht mehr" in page.inner_text("#el-hub"), page.inner_text("#el-hub"))
    ctx.close(); srv["grund"] = None

    # ---- Ohne Internet: Meldung statt Absturz ----
    ctx = b.new_context(); page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("https://keqfieduhipnulpkhdbj.supabase.co/**", lambda r: r.abort())
    page.route("https://elplexa.test/**", lambda r: r.fulfill(status=200, content_type="text/html", body=HTML))
    page.goto(f"https://elplexa.test/?teilen={TOKEN}"); page.wait_for_timeout(500)
    check("Ohne Internet: Meldung „nicht laden“", "nicht laden" in page.inner_text("#el-hub") and "Keine Verbindung" in page.inner_text("#el-hub"))
    ctx.close()
    b.close()

errors = [e for e in errors if "ERR_FAILED" not in e and "Failed to load resource" not in e]
check("keine JS-Fehler", not errors, errors[:5])
print(f"\n{len(fails)} Fehler" if fails else "\nAlle Teilen-Tests ok", "· Bilder:", OUT)
sys.exit(1 if fails else 0)
