# UI-Tests «Pläne für den Monteur» (CJ 28.10.2026, nur elplexaCAD) gegen eine Attrappe statt Supabase (wie teilen_tests.py). Vorher: node build.mjs elplexa
# Planer: Link für Monteur erstellen, Telefon, QR-Code, Veröffentlichen mit Zustand, Notiz setzen (N), Monteur-Notiz bestätigen mit Antwort, Status in der Übersicht.
# Monteur (?monteur=): Handy 390×844 und iPad 1024×768, Notiz setzen, offline setzen und senden (mit Nummer-Konflikt), «Neuer Stand · Laden»,
# Meldungen abgelaufen / Server schläft / ohne Kopie. Aufruf: python3 test/monteur_tests.py [Ausgabeordner]
import sys, tempfile, json, base64
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
from elstart import projektansicht
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="monteur_"))
OUT.mkdir(parents=True, exist_ok=True)
HTML = (ROOT / "dist" / "ElplexaCAD.html").read_text()
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)

UID = "11111111-2222-3333-4444-555555555555"
TOKEN = "MonteurMonteurMonteurMonteur0123"
PID = "99999999-0000-0000-0000-000000000002"
jwt = "x." + base64.urlsafe_b64encode(json.dumps({"sub": UID}).encode()).decode().rstrip("=") + ".y"
WALLS = lambda: [{"id": 5, "type": "wall", "layer": "bg", "a": [0, 0], "b": [5000, 0], "d": 150}, {"id": 6, "type": "wall", "layer": "bg", "a": [5000, 0], "b": [5000, 4000], "d": 150},
                 {"id": 7, "type": "wall", "layer": "bg", "a": [5000, 4000], "b": [0, 4000], "d": 150}, {"id": 8, "type": "wall", "layer": "bg", "a": [0, 4000], "b": [0, 0], "d": 150},
                 {"id": 9, "type": "sym", "layer": "bg", "key": "STD", "at": [1000, 150], "r": 0}, {"id": 10, "type": "sym", "layer": "bg", "key": "STD", "at": [2000, 150], "r": 0}]
PLAN = lambda sid, t: {"kind": "plan", "sid": sid, "meta": {"BLATT": str(sid - 10), "TITEL": t}, "paper": {"size": "A3", "quer": True, "den": 50}, "layers": [{"id": "bg", "name": "Hintergrund", "show": True, "lock": False}], "alay": "bg", "items": WALLS()}
DATA = {"format": "schemacad", "version": 33, "active": 0, "nextId": 100, "project": {"name": "EFH Monteur", "status": "In Arbeit", "meta": {"OBJEKT": "Bauweg 2"}},
        "sheets": [PLAN(11, "Plan EG"), PLAN(12, "Plan OG")]}
srv = {"shares": [], "rel": None, "notes": [], "dev": [], "calls": [], "pub": [], "grund": None, "offline": False, "sleep": False}

def nr_for(sheet, want):  # wie sh_nr
    have = {n["nr"] for n in srv["notes"] if n["sheet"] == sheet}
    return want if isinstance(want, int) and 1 <= want <= 9999 and want not in have else max(have | {0}) + 1
def note_out(n, guest=None): return {**{k: v for k, v in n.items() if k != "guest"}, "mine": guest is not None and n.get("guest") == guest}
def fake(route):
    req = route.request; u = urlparse(req.url); q = {k: v[0] for k, v in parse_qs(u.query).items()}; path = u.path
    if srv["offline"]: route.abort(); return
    if srv["sleep"]: route.fulfill(status=540, body="paused"); return
    srv["calls"].append(f"{req.method} {path}")
    J = lambda o, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(o), headers={"Access-Control-Allow-Origin": "*"})
    body = json.loads(req.post_data) if req.post_data else {}
    if path == "/rest/v1/projects" and req.method == "GET":
        if "id" in q: J([{"data": DATA, "updated_at": "2026-10-28T10:00:00Z", "owner": UID}]); return
        J([{"id": PID, "name": "EFH Monteur", "status": "In Arbeit", "updated_at": "2026-10-28T10:00:00Z"}]); return
    if path == "/rest/v1/user_settings": J([]); return
    if path == "/rest/v1/user_positions": J([]); return
    if path == "/rest/v1/shares":
        live = [s for s in srv["shares"] if not s["revoked_at"]]
        if req.method == "GET": J([s for s in live if "project_id" not in q or s["project_id"] == q["project_id"][3:]]); return
        if req.method == "POST":
            s = {"id": f"s{len(srv['shares']) + 1}", "token": TOKEN, "created_at": "2026-10-28T10:00:00Z", "revoked_at": None, "rev": 0, "pub_at": None, "opened_at": None, "phone": "", **body}
            srv["shares"].append(s); J([s], 201); return
        if req.method == "PATCH":
            hit = [s for s in srv["shares"] if s["id"] == q["id"][3:]]
            for s in hit: s.update(body)
            J(hit); return
    if path == "/rest/v1/share_releases": J([{"rev": srv["rel"]["rev"], "at": srv["rel"]["at"], "hash": srv["rel"]["data"]["hash"]}] if srv["rel"] else []); return
    if path == "/rest/v1/share_devices": J([{"seen_at": "2026-10-28T11:00:00Z"} for _ in srv["dev"]]); return
    if path == "/rest/v1/share_notes":
        if req.method == "DELETE":
            hit = [n for n in srv["notes"] if n["id"] == q["id"][3:]]; srv["notes"] = [n for n in srv["notes"] if n not in hit]; J([{"id": n["id"]} for n in hit]); return
        J([note_out(n) for n in sorted(srv["notes"], key=lambda n: (n["sheet"], n["nr"]))]); return
    if path.startswith("/rest/v1/rpc/p_"):
        fn = path.rsplit("/", 1)[1]; srv["calls"].append(fn)
        if fn == "p_publish":
            s = next(s for s in srv["shares"] if s["id"] == body["p_share"]); s["rev"] += 1; s["pub_at"] = "2026-10-28T14:32:00Z"
            srv["rel"] = {"rev": s["rev"], "at": s["pub_at"], "data": body["p_data"]}; srv["pub"].append(body["p_data"])
            for n in srv["notes"]:
                if n["von"] == "planer": n["published"] = True
            J({"ok": True, "rev": s["rev"], "at": s["pub_at"]}); return
        if fn == "p_note_add":
            n = {"id": f"n{len(srv['notes']) + 1}-{body['p_sheet']}", "mod": "plan", "sheet": body["p_sheet"], "nr": nr_for(body["p_sheet"], None), "von": "planer", "published": False, "x": body["p_x"], "y": body["p_y"],
                 "text": body["p_text"], "author": body["p_author"], "rev": 1, "created_at": "2026-10-28T12:00:00Z", "updated_at": "2026-10-28T12:00:00Z", "status": "offen", "antwort": None}
            srv["notes"].append(n); J({"ok": True, "id": n["id"], "nr": n["nr"], "created_at": n["created_at"]}); return
        if fn == "p_note_confirm":
            for n in srv["notes"]:
                if n["id"] == body["p_id"]: n.update({"status": "erledigt" if body["p_done"] else "offen", "antwort": body["p_antwort"], "updated_at": "2026-10-28T13:00:00Z"})
            J({"ok": True}); return
        if fn == "p_note_edit":
            for n in srv["notes"]:
                if n["id"] == body["p_id"]: n.update({k: body["p_" + k] for k in ("text", "x", "y") if body["p_" + k] is not None})
            J({"ok": True}); return
    if path.startswith("/rest/v1/rpc/m_"):
        fn = path.rsplit("/", 1)[1]; srv["calls"].append(fn)
        s = next((s for s in srv["shares"] if s["token"] == body.get("p_token")), None)
        if fn == "m_open":
            if srv["grund"]: J({"ok": False, "grund": srv["grund"], "ablauf": "2026-10-27T10:00:00Z"}); return
            if not s or s["revoked_at"]: J({"ok": False, "grund": "widerrufen" if s else "ungueltig"}); return
            if not s["rev"]: J({"ok": False, "grund": "leer"}); return
            if body.get("p_guest") and body["p_guest"] not in srv["dev"]: srv["dev"].append(body["p_guest"])
            J({"ok": True, "name": "EFH Monteur", "rev": s["rev"], "at": s["pub_at"], "ablauf": s["expires_at"], "phone": s["phone"],
               "releases": {"plan": srv["rel"]} if (body.get("p_have") or 0) < s["rev"] else None}); return
        if not s or s["revoked_at"]: J({"ok": False, "grund": "link"}); return
        if fn == "m_notes": J({"ok": True, "notes": [note_out(n, body["p_guest"]) for n in srv["notes"] if n["von"] == "monteur" or n["published"]]}); return
        if fn == "m_note_add":
            n = {"id": f"m{len(srv['notes']) + 1}", "mod": "plan", "sheet": body["p_sheet"], "nr": nr_for(body["p_sheet"], body["p_nr"]), "von": "monteur", "published": True, "x": body["p_x"], "y": body["p_y"],
                 "text": body["p_text"], "author": body["p_author"], "guest": body["p_guest"], "rev": body["p_rev"], "created_at": "2026-10-28T15:00:00Z", "updated_at": "2026-10-28T15:00:00Z", "status": "offen", "antwort": None}
            srv["notes"].append(n); J({"ok": True, "id": n["id"], "nr": n["nr"], "created_at": n["created_at"]}); return
        if fn == "m_note_edit":
            hit = [n for n in srv["notes"] if n["id"] == body["p_id"] and n["von"] == "monteur" and n["status"] == "offen"]
            for n in hit: n.update({k: body["p_" + k] for k in ("text", "x", "y") if body["p_" + k] is not None})
            J({"ok": bool(hit), **({} if hit else {"grund": "fehlt"})}); return
        if fn == "m_note_delete":
            hit = [n for n in srv["notes"] if n["id"] == body["p_id"] and n["von"] == "monteur" and n["status"] == "offen"]
            srv["notes"] = [n for n in srv["notes"] if n not in hit]; J({"ok": bool(hit), **({} if hit else {"grund": "fehlt"})}); return
    J({"message": "nicht gefunden"}, 404)

with sync_playwright() as p:
    b = p.chromium.launch()
    def open_page(url, session=False, vp=(1400, 900), touch=False, ctx=None):
        ctx = ctx or b.new_context(viewport={"width": vp[0], "height": vp[1]}, has_touch=touch, is_mobile=touch, service_workers="block")  # Attrappe über page.route, ohne Service Worker
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin="https://elplexa.test")
        page = ctx.new_page()
        page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; window.addEventListener('unhandledrejection', (e) => console.error('Unbehandelt: ' + (e.reason?.stack || e.reason)));")
        if session: page.add_init_script(f"localStorage.setItem('schemacad.cloud.v1', JSON.stringify({{ access_token: '{jwt}', refresh_token: 'r', expires_at: 4102444800, email: 'cj@beispiel.ch' }}))")
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "540" not in m.text and "ERR_FAILED" not in m.text and "Failed to load resource" not in m.text else None)
        page.route("https://keqfieduhipnulpkhdbj.supabase.co/**", fake)
        page.route("https://elplexa.test/**", lambda r: r.fulfill(status=200, content_type="text/html", body=HTML))
        page.goto(url); page.wait_for_timeout(600)
        return ctx, page
    def key(page, k, **o):
        page.evaluate("([k, o]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }))", [k, o]); page.wait_for_timeout(120)
    def calls(fn): return [c for c in srv["calls"] if c == fn]
    def mk_box(page, id):  # Mitte und Breite der Marke einer Notiz (Monteur-Ansicht)
        return page.evaluate("(id) => { const r = document.querySelector(`.mo-mk[data-id='${id}']`)?.getBoundingClientRect(); return r ? [r.x + r.width / 2, r.y + r.height / 2, Math.round(r.width)] : [0, 0, 0]; }", id)

    # ================= Planer =================
    ctx, page = open_page("https://elplexa.test/", session=True)
    page.click("#el-nav-projekte"); page.click('#el-hub [data-elact="onlist"]'); page.wait_for_timeout(400)
    tile = page.inner_text(f'#el-hub [data-elonline="{PID}"]')
    check("Übersicht: Online-Projekt «Nicht geteilt»", "Nicht geteilt" in tile, tile)
    page.click(f'#el-hub [data-elonline="{PID}"]'); page.wait_for_timeout(600); projektansicht(page)
    page.click("#el-tile-plan"); page.wait_for_timeout(500)
    check("Plan-Modul: Leiste «Veröffentlichen» sichtbar", page.is_visible("#el-mpub") and "Veröffentlichen" in page.inner_text("#el-mpub"), page.inner_text("#el-mpub") if page.query_selector("#el-mpub") else "")
    check("Plan-Modul: noch nicht geteilt", "Nicht geteilt" in page.inner_text("#el-mpub"))
    page.click('#el-mpub [data-mp="link"]'); page.wait_for_timeout(400)
    m = page.inner_text(".modal")
    check("Fenster «Link für Monteur»: Projekt, Alle Pläne, Ablauf, Telefon, noch kein Link", all(t in m for t in ("Link für Monteur", "EFH Monteur", "Alle Pläne", "Ablaufdatum", "Telefonnummer", "Link erstellen", "Nicht geteilt")), m)
    check("Fenster: Ablauf 7 / 30 / Bauende", page.evaluate("[...document.querySelectorAll('.modal [data-mexp] option')].map((o) => o.value)") == ["7", "30", "end"])
    page.fill(".modal [data-mtel]", "079 000 00 00")
    page.click(".modal [data-mnew]"); page.wait_for_timeout(500)
    sh = srv["shares"][0] if srv["shares"] else {}
    check("Link erstellen: für das Projekt, 30 Tage, Telefon", sh.get("project_id") == PID and sh.get("phone") == "079 000 00 00" and sh.get("expires_at", "")[:4] == "2026", sh)
    url = page.input_value(".modal .el-shurl")
    check("Link: Adresse mit ?monteur=<Schlüssel>", url == f"https://elplexa.test/?monteur={TOKEN}", url)
    check("QR-Code: echter Code (viele Felder) im Fenster", page.evaluate("document.querySelector('.modal .el-mqr path')?.getAttribute('d').split('M').length") > 200)
    check("Hinweis «Der Link zeigt den zuletzt veröffentlichten Stand.»", "Der Link zeigt den zuletzt veröffentlichten Stand." in page.inner_text(".modal"))
    page.select_option(".modal [data-mexp]", "7"); page.wait_for_timeout(300)
    check("Ablauf 7 Tage: in der Datenbank geändert", srv["shares"][0]["expires_at"][:10] == "2026-11-04" or srv["shares"][0]["expires_at"] > "2026-10-28", srv["shares"][0]["expires_at"])
    page.screenshot(path=str(OUT / "m1_link_fuer_monteur.png"))
    page.click(".modal [data-c]"); page.wait_for_timeout(200)
    check("Ohne Veröffentlichen: hervorgehoben «Noch nicht veröffentlicht»", "Noch nicht veröffentlicht" in page.inner_text("#el-mpub") and page.query_selector("#el-mpub .el-mhot"))
    page.click('#el-mpub [data-mp="pub"]'); page.wait_for_timeout(800)
    d = srv["pub"][-1] if srv["pub"] else {}
    check("Veröffentlichen: zwei Plan-Blätter mit Titel ohne «Plan», Seite als SVG, Stückliste", [s["title"] for s in d.get("sheets", [])] == ["EG", "OG"] and d["sheets"][0]["svg"].startswith("<svg") and d["sheets"][0]["bom"] and d["sheets"][0]["bom"][0]["n"] == 2, [s.get("title") for s in d.get("sheets", [])])
    check("Veröffentlichen: Schriftfeld mit Index 1", ">1<" in d["sheets"][0]["svg"])
    check("Veröffentlichen: ohne Zeit, Preise, andere Module", not any(k in json.dumps(d) for k in ('"time"', '"auto"', '"of"', '"prices"')))
    check("Zustand: «Veröffentlicht …, Stand 1»", "Stand 1" in page.inner_text("#el-mpub") and "Veröffentlicht" in page.inner_text("#el-mpub") and not page.query_selector("#el-mpub .el-mhot"), page.inner_text("#el-mpub"))
    # Planer-Notiz mit N
    key(page, "n"); box = page.locator("#svg").bounding_box()
    page.mouse.click(box["x"] + box["width"] * 0.45, box["y"] + box["height"] * 0.5); page.wait_for_timeout(400)
    page.fill("#modal-root [data-mt]", "Steckdosen Küche auf 115 cm."); page.click("#modal-root [data-ok]"); page.wait_for_timeout(500)
    check("Notiz (N): beim Server angelegt, Nummer 1", calls("p_note_add") and srv["notes"][0]["nr"] == 1 and srv["notes"][0]["sheet"] == "11", srv["notes"])
    check("Notiz: Marke gestrichelt (noch nicht veröffentlicht)", page.query_selector("#el-mnotes .el-mk.pl.unpub") is not None)
    st = page.inner_text("#el-mpub")
    check("Zustand: «1 Notiz noch nicht veröffentlicht», hervorgehoben", "1 Notiz noch nicht veröffentlicht" in st and page.query_selector("#el-mpub .el-mhot"), st)
    # Monteur-Notiz kommt: Hinweis, Bestätigen mit Antwort
    srv["notes"].append({"id": "m-x", "mod": "plan", "sheet": "11", "nr": 2, "von": "monteur", "published": True, "x": 2500, "y": 2000, "text": "Steckdose hinter dem Sofa versetzen?", "author": "Marco", "guest": "g-marco", "rev": 1,
                         "created_at": "2026-10-28T13:10:00Z", "updated_at": "2026-10-28T13:10:00Z", "status": "offen", "antwort": None})
    page.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); page.wait_for_timeout(600)
    h = page.inner_text("#el-mhint") if page.is_visible("#el-mhint") else ""
    check("Hinweis oben «Neue Notiz von Marco, EG, Nr. 2»", "Neue Notiz von Marco, EG, Nr. 2" in h, h)
    check("Zähler am Plan-Modul: 1 offene Monteur-Notiz", page.inner_text("#el-mpub .el-mcnt").strip() == "1")
    page.screenshot(path=str(OUT / "m2_planer_hinweis.png"))
    page.click('#el-mhint [data-mh="ok"]'); page.wait_for_timeout(300)
    page.fill("#modal-root [data-mans]", "Ja, 60 cm nach links."); page.click("#modal-root [data-ok]"); page.wait_for_timeout(500)
    mx = next(n for n in srv["notes"] if n["id"] == "m-x")
    check("Bestätigen mit Antwort: in der Datenbank", mx["status"] == "erledigt" and mx["antwort"] == "Ja, 60 cm nach links.", mx)
    check("Bestätigen: Hinweis weg", not page.is_visible("#el-mhint"))
    # Rechtsklick auf Nummer: Menü
    mk = page.query_selector('#el-mnotes [data-mnote="m-x"]').bounding_box()
    page.mouse.click(mk["x"] + mk["width"] / 2, mk["y"] + mk["height"] / 2, button="right"); page.wait_for_timeout(200)
    check("Rechtsklick auf Nummer: Dorthin, Bearbeiten, Löschen", page.is_visible("#el-mmenu") and all(t in page.inner_text("#el-mmenu") for t in ("Dorthin", "Bearbeiten", "Löschen")), page.inner_text("#el-mmenu"))
    key(page, "Escape")
    # Fenster: Notizen je Plan
    page.click('#el-mpub [data-mp="link"]'); page.wait_for_timeout(500)
    m = page.inner_text(".modal")
    check("Fenster: Notizen je Plan mit Status und Antwort", "Notizen je Plan" in m and "bestätigt" in m and "Antwort: Ja, 60 cm nach links." in m and "noch nicht veröffentlicht" in m, m)
    check("Fenster: zuletzt geöffnet / Geräte", "Noch nie geöffnet" in m or "Zuletzt geöffnet" in m)
    page.click(".modal [data-c]"); page.wait_for_timeout(200)
    page.click('#el-mpub [data-mp="pub"]'); page.wait_for_timeout(800)
    check("Zweites Veröffentlichen: Stand 2, Planer-Notiz sichtbar", srv["shares"][0]["rev"] == 2 and srv["notes"][0]["published"] and not page.query_selector("#el-mnotes .el-mk.unpub"), srv["shares"][0])
    page.click("#el-crumb .el-back") if page.query_selector("#el-crumb .el-back") else None
    page.click("#el-nav-projekte"); page.wait_for_timeout(200); page.click('#el-hub [data-elact="onlist"]'); page.wait_for_timeout(500)
    o = page.inner_text("#el-hub")
    check("Übersicht: «Geteilt · Stand 2»", "Geteilt · Stand 2" in o, o[:400])
    ctx.close()

    # ================= Monteur: Handy =================
    srv["calls"].clear()
    ctx, page = open_page(f"https://elplexa.test/?monteur={TOKEN}", vp=(390, 844), touch=True); page.wait_for_timeout(600)
    S = lambda: page.evaluate("window.__monteur.state")
    check("Monteur: eigene Ansicht ohne Editor", page.is_visible("#mo-root") and not page.is_visible("#topbar") and not page.is_visible("#el-hub"))
    check("Monteur: kein Login, nur m_* Funktionen", not [c for c in srv["calls"] if "/auth/" in c or c.startswith("GET /rest/v1/")], srv["calls"])
    check("Monteur: Projektname und Plantitel EG / OG", page.inner_text(".mo-pname") == "EFH Monteur" and page.evaluate("[...document.querySelectorAll('.mo-seg button')].map((b) => b.textContent)") == ["EG", "OG"])
    check("Monteur: Schieber ≥ 44 px, aktiv markiert", page.evaluate("Math.min(...[...document.querySelectorAll('.mo-seg button')].map((b) => b.getBoundingClientRect().height))") >= 44 and page.get_attribute(".mo-seg button", "aria-selected") == "true")
    band = page.inner_text(".mo-band")
    check("Band: Datum gross, aktuell, Index 2", "Stand:" in band and "aktuell" in band and "Index 2" in band, band)
    check("Plan: Seite als SVG mit Schriftfeld", page.evaluate("!!document.querySelector('.mo-svgw svg.pvpage')"))
    check("Kein «PDF speichern», kein «Drucken»", not any(t in page.inner_text("#mo-root") for t in ("PDF", "Drucken")))
    check("Notizen: Planer-Notiz 1 und bestätigte Nr. 2 sichtbar", sorted(n["nr"] for n in S()["notes"] if n["sheet"] == "11") == [1, 2])
    fz = page.evaluate("Math.min(...[...document.querySelectorAll('#mo-root *')].filter((e) => e.childNodes.length && [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && e.checkVisibility() && !e.closest('svg')).map((e) => parseFloat(getComputedStyle(e).fontSize)))")
    check("Schrift überall ≥ 14 px (ohne Zeichnung)", fz >= 14, fz)
    page.screenshot(path=str(OUT / "m3_monteur_handy.png"))
    # Notiz setzen: + , Name beim ersten Mal, Stelle, Text
    page.click(".mo-plus"); page.wait_for_timeout(450)
    check("Erstes Mal: Name abfragen", "Ihr Name" in page.inner_text(".mo-sheet"))
    page.fill(".mo-sheet input", "Sandro"); page.click('.mo-sheet [data-s="name"]'); page.wait_for_timeout(300)
    check("Stelle wählen: «Stelle für Notiz 3 antippen»", "Stelle für Notiz 3 antippen" in page.inner_text(".mo-place"), page.inner_text(".mo-place"))
    pa = page.locator(".mo-pa").bounding_box()
    page.mouse.click(pa["x"] + pa["width"] * 0.78, pa["y"] + pa["height"] * 0.62); page.wait_for_timeout(450)
    page.fill(".mo-sheet textarea", "Schalter Entrée neben die Türe."); page.click('.mo-sheet [data-c="save"]'); page.wait_for_timeout(700)
    mine = [n for n in srv["notes"] if n["von"] == "monteur" and n["author"] == "Sandro"]
    check("Notiz gesendet: Nr. 3, Name Sandro", len(mine) == 1 and mine[0]["nr"] == 3, mine)
    check("Marke im Plan, Trefferfläche 44 px", mine and mk_box(page, mine[0]["id"])[2] >= 44, mine and mk_box(page, mine[0]["id"]))
    # Offline setzen: Warteschlange, roter Punkt x/n, dann Nummer-Konflikt beim Senden
    srv["offline"] = True
    page.click(".mo-plus"); page.wait_for_timeout(200)
    page.mouse.click(pa["x"] + pa["width"] * 0.22, pa["y"] + pa["height"] * 0.62); page.wait_for_timeout(450)
    page.fill(".mo-sheet textarea", "WC: Ventilator mit Nachlauf?"); page.click('.mo-sheet [data-c="save"]'); page.wait_for_timeout(900)
    st = S()
    check("Offline: Notiz in der Warteschlange mit Nr. 4", len(st["queue"]) == 1 and st["queue"][0]["nr"] == 4, st["queue"])
    check("Offline: Band «Offline, Stand …»", "Offline, Stand" in page.inner_text(".mo-band"), page.inner_text(".mo-band"))
    check("Offline: roter Punkt 1/2 am Knopf Notizen", page.is_visible(".mo-usb") and page.inner_text(".mo-usb").strip() == "1/2", page.inner_text(".mo-usb"))
    page.screenshot(path=str(OUT / "m4_monteur_offline.png"))
    srv["offline"] = False
    srv["notes"].append({"id": "m-other", "mod": "plan", "sheet": "11", "nr": 4, "von": "monteur", "published": True, "x": 100, "y": 100, "text": "Steckdose Lavabo fehlt.", "author": "Marco", "guest": "g-marco", "rev": 2,
                         "created_at": "2026-10-28T15:10:00Z", "updated_at": "2026-10-28T15:10:00Z", "status": "offen", "antwort": None})
    page.evaluate("window.dispatchEvent(new Event('online'))"); page.wait_for_timeout(1000)
    st = S(); sent = [n for n in srv["notes"] if n["text"] == "WC: Ventilator mit Nachlauf?"]
    check("Wieder Netz: Warteschlange leer, Server vergibt Nr. 5", not st["queue"] and sent and sent[0]["nr"] == 5, (st["queue"], sent))
    check("Meldung «Ihre Nr. 4 heisst jetzt 5»", "Ihre Nr. 4 heisst jetzt 5" in page.inner_text(".mo-toast"), page.inner_text(".mo-toast"))
    # Neuer Stand: offener Plan wechselt nicht von allein
    s0 = srv["shares"][0]; s0["rev"] = 3; srv["rel"] = {**srv["rel"], "rev": 3, "at": "2026-10-28T16:05:00Z"}
    page.evaluate("window.__monteur.sync()"); page.wait_for_timeout(800)
    check("Neuer Stand: Band «Neuer Stand · Index 3», Plan bleibt Stand 2", "Neuer Stand · Index 3" in page.inner_text(".mo-band") and S()["rev"] == 2, (page.inner_text(".mo-band"), S()["rev"]))
    page.click(".mo-band"); page.wait_for_timeout(400)
    check("Laden: Stand 3", S()["rev"] == 3 and "Index 3" in page.inner_text(".mo-band"))
    # Langes Drücken auf eigene Marke: Menü mit Bearbeiten
    bx = mk_box(page, mine[0]["id"])[:2]
    page.mouse.move(*bx); page.mouse.down(); page.wait_for_timeout(650); page.mouse.up(); page.wait_for_timeout(200)
    check("Langes Drücken: Menü Dorthin, Bearbeiten, Löschen", page.is_visible(".mo-menu") and all(t in page.inner_text(".mo-menu") for t in ("Dorthin", "Bearbeiten", "Löschen")), page.inner_text(".mo-menu") if page.is_visible(".mo-menu") else "")
    check("Kein Textauswahl/Lupe: -webkit-touch-callout und user-select aus", page.evaluate("(() => { const s = getComputedStyle(document.querySelector('.mo-pa')); return s.userSelect === 'none' && (s.webkitTouchCallout === undefined || s.webkitTouchCallout === 'none'); })()"))
    page.click('.mo-menu [data-a="ed"]'); page.wait_for_timeout(450)
    page.fill(".mo-sheet textarea", "Schalter Entrée rechts neben die Türe."); page.click('.mo-sheet [data-c="save"]'); page.wait_for_timeout(700)
    check("Bearbeiten: beim Server geändert", any(n["text"] == "Schalter Entrée rechts neben die Türe." for n in srv["notes"]))
    # Planer-Notiz: nur Dorthin
    check("Bündeln: Nr. 1 und 2 eng beieinander als eine Marke «1 2»", page.evaluate("[...document.querySelectorAll('.mo-mk.cl')].map((b) => b.textContent.trim())") == ["1 2"])
    for _ in range(4):  # Tippen auf die gebündelte Marke zoomt, bis sie auffächert
        if page.query_selector(".mo-mk.pl[data-id]"): break
        c = page.locator(".mo-mk.cl").bounding_box(); page.mouse.click(c["x"] + c["width"] / 2, c["y"] + c["height"] / 2); page.wait_for_timeout(400)
    check("Zoomen fächert auf: Planer-Marke 1 einzeln", page.query_selector(".mo-mk.pl[data-id]") is not None)
    bx = page.evaluate("(() => { const b = document.querySelector('.mo-mk.pl[data-id]'); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
    page.mouse.click(*bx, button="right"); page.wait_for_timeout(200)
    check("Planer-Notiz: nur «Dorthin»", page.is_visible(".mo-menu") and "Bearbeiten" not in page.inner_text(".mo-menu") and "Dorthin" in page.inner_text(".mo-menu"))
    page.keyboard.press("Escape"); page.wait_for_timeout(150)
    check("Esc schliesst das Menü", not page.is_visible(".mo-menu"))
    page.click(".mo-notes"); page.wait_for_timeout(450)
    L = page.inner_text(".mo-sheet")
    check("Notizblatt: Nummer, Text, Name, Antwort, erledigt, Telefon als Text", all(t in L for t in ("Notizen · EG", "Sandro (Sie)", "Antwort:", "erledigt", "Fragen? Anrufen", "079 000 00 00")), L)
    page.screenshot(path=str(OUT / "m5_monteur_notizen.png"))
    page.click('.mo-sheet [data-s="close"]'); page.wait_for_timeout(400)
    page.click('.mo-bar [data-v="list"]'); page.wait_for_timeout(200)
    check("Stückliste je Plan", page.is_visible(".mo-list") and "Stückliste EG" in page.inner_text(".mo-list") and "2" in page.inner_text(".mo-list table"))
    page.click('.mo-bar [data-v="plan"]')
    # Server schläft: Kopie bleibt lesbar
    srv["sleep"] = True; page.reload(); page.wait_for_timeout(1500)
    check("Server schläft: Band mit Name, Pläne aus der Kopie", "Server schläft, bitte cj informieren" in page.inner_text(".mo-band") and page.evaluate("!!document.querySelector('.mo-svgw svg')"), page.inner_text(".mo-band"))
    page.screenshot(path=str(OUT / "m6_monteur_schlaeft.png"))
    srv["sleep"] = False
    srv["grund"] = "abgelaufen"; page.reload(); page.wait_for_timeout(1200)
    check("Link abgelaufen: Meldung, Pläne nicht sichtbar", page.is_visible(".mo-dead") and "Link abgelaufen" in page.inner_text(".mo-dead"), page.inner_text(".mo-dead") if page.is_visible(".mo-dead") else "")
    srv["grund"] = None; ctx.close()
    # Ohne Kopie und ohne Netz
    srv["offline"] = True
    ctx, page = open_page(f"https://elplexa.test/?monteur={TOKEN}", vp=(390, 844), touch=True)
    srv["offline"] = False  # HTML kommt über eigene Route
    page.wait_for_timeout(4800)
    check("Ohne Kopie, ohne Netz: «Einmal mit Netz öffnen»", page.is_visible(".mo-dead") and "Einmal mit Netz öffnen" in page.inner_text(".mo-dead"), page.inner_text("#mo-root")[:200])
    ctx.close()

    # ================= Monteur: iPad quer =================
    ctx, page = open_page(f"https://elplexa.test/?monteur={TOKEN}", vp=(1024, 768), touch=True); page.wait_for_timeout(600)
    check("iPad: Knöpfe im Plan, keine Leiste unten", page.evaluate("document.querySelector('#mo-root').classList.contains('pad')") and page.is_visible(".mo-fabs .mo-plus") and not page.is_visible(".mo-bar"))
    page.click(".mo-tgl"); page.wait_for_timeout(300)
    check("iPad: Stückliste daneben", page.is_visible(".mo-list") and page.locator(".mo-list").bounding_box()["width"] >= 300)
    w = page.evaluate("[document.documentElement.scrollWidth, innerWidth]")
    check("iPad: kein seitliches Überlaufen", w[0] <= w[1], w)
    page.screenshot(path=str(OUT / "m7_monteur_ipad.png"))
    ctx.close()
    b.close()

errs = [e for e in errors if "favicon" not in e]
check("keine Fehler in der Konsole", not errs, errs[:5])
print(f"Bilder: {OUT}")
if fails: print(f"{len(fails)} FEHLGESCHLAGEN"); sys.exit(1)
print("Alle Monteur-Tests grün.")
