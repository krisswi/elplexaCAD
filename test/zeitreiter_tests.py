# UI-Tests Reiter «Zeit» (Etappe 4, CJ 20.10.2026, Review-Fixes): Woche, KW, Summen, CSV, nur Online-Projekte, neu laden beim Wechsel, alter Stand bei Fehler,
# unbekannte Stunden, vorläufige Zeit, Bedienbarkeit. Attrappe statt Supabase. Vorher: node build.mjs elplexa
# Aufruf: python3 test/zeitreiter_tests.py [Ausgabeordner]
import sys, tempfile, json, base64, uuid, datetime
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "ElplexaCAD.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="zeitreiter_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
UID = "11111111-1111-1111-1111-111111111111"
jwt = "x." + base64.urlsafe_b64encode(json.dumps({"sub": UID}).encode()).decode().rstrip("=") + ".y"
# Zeiten in einer festen Woche: Mo 2026-10-12 bis So 2026-10-18 (KW 42)
T1 = [{"d": "2026-10-12", "h": 1.5, "n": "a"}, {"d": "2026-10-12", "h": 0.25, "n": "b"}, {"d": "2026-10-14", "h": 2, "n": ""}, {"d": "2026-10-19", "h": 9, "n": "andere Woche"},
      {"d": "kaputt", "h": 5}, {"d": "2026-10-13", "h": "viel"}, {"d": "2026-10-13", "h": 99}]  # die letzten drei sind ungültig und werden übersprungen
T2 = [{"d": "2026-10-14", "h": 3.5, "n": ""}, {"d": "2026-10-18", "h": 1, "n": ""}]
AUTO = [{"k": "abcd", "d": "2026-10-13", "s": 1200, "m": ["schema"]}]  # vorläufige Zeit: zählt erst nach dem Übernehmen
rows = [{"id": str(uuid.uuid4()), "name": n, "status": "In Arbeit", "updated_at": "2026-10-18T10:00:00+00:00", "data": {"project": {"meta": {"OBJEKT": "x"}, "time": t, **({"auto": AUTO} if n == "Projekt Zwei" else {})}}} for n, t in (("Projekt Eins", T1), ("Projekt Zwei", T2))]
srv = {"mode": "ok", "gets": 0, "patch": 0}
def fake(route):
    req = route.request; u = urlparse(req.url); q = {k: v[0] for k, v in parse_qs(u.query).items()}; path = u.path
    J = lambda o, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(o))
    if path == "/auth/v1/token": J({"access_token": jwt, "refresh_token": "r", "expires_at": 4102444800, "user": {"email": "test@beispiel.ch"}}); return
    if path == "/rest/v1/projects" and req.method == "GET":
        srv["gets"] += 1
        if srv["mode"] == "paused": route.fulfill(status=540, body=""); return
        if srv["mode"] == "bad" and "pm:" in q["select"]: J({"message": "ungültige Abfrage"}, 400); return
        def col(r, k):
            if "->" not in k: return r.get(k)
            v = r["data"]
            for part in k.split("->")[1:]: v = v.get(part) if isinstance(v, dict) else None
            return v
        sel = [r for r in rows if "id" not in q or q["id"] == "eq." + r["id"]]
        J([{k.split(":")[0]: (UID if k == "owner" else col(r, k.split(":")[-1])) for k in q["select"].split(",")} for r in sel]); return
    if path == "/rest/v1/projects" and req.method == "PATCH":  # Zeit direkt eintragen: nur schreiben, wenn updated_at noch stimmt
        srv["patch"] += 1
        r = next(r for r in rows if q["id"] == "eq." + r["id"])
        if srv["mode"] == "conflict" or q.get("updated_at") != "eq." + r["updated_at"]: J([]); return
        body = json.loads(req.post_data); r["data"] = body["data"]; r["updated_at"] = body["updated_at"]
        J([{"updated_at": r["updated_at"]}]); return
    if path == "/rest/v1/user_settings": route.fulfill(status=200 if route.request.method == "GET" else 201, content_type="application/json", body="[]" if route.request.method == "GET" else ""); return  # Firmenprofil (Offerte Schritt 2): leer
    J({"message": "nicht gefunden"}, 404)
def weeks_back(today, target):  # Schritte «‹» von der heutigen Woche bis zur Zielwoche (negativ = vor)
    mon = lambda d: d - datetime.timedelta(days=d.weekday())
    return (mon(target) - mon(today)).days // 7
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True).new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "540" not in m.text and "400" not in m.text else None)
    page.route("https://keqfieduhipnulpkhdbj.supabase.co/**", fake)
    vis = lambda s: page.is_visible(s)
    flat = lambda sel: " ".join(page.inner_text(sel).split())
    txt = lambda sel: [c.strip() for c in page.evaluate(f"[...document.querySelectorAll('{sel}')].map((e) => e.textContent)")]
    page.add_init_script("window.__off = 0; const __n = Date.now.bind(Date); Date.now = () => __n() + window.__off;")  # Uhr vorstellbar: Reiterwechsel lädt nur bei Stand über 60 s neu
    page.goto(URL); page.wait_for_timeout(300)
    page.click("#el-nav-zeit"); page.wait_for_timeout(250)
    check("Gast: Hinweis, keine Tabelle", "Nicht angemeldet" in page.inner_text(".el-pwrap") and not vis(".el-wtab"))
    page.click("#el-acct"); page.fill("#el-pf-mail", "test@beispiel.ch"); page.fill("#el-pf-pw", "attrappe"); page.click('#el-pf-form [type="submit"]'); page.wait_for_timeout(600)
    page.click("#el-nav-zeit"); page.wait_for_timeout(700)
    check("Angemeldet: Tabelle mit einer Zeile je Online-Projekt", vis(".el-wtab") and page.locator(".el-wtab tbody tr").count() == 2, page.inner_text(".el-pwrap")[:200])
    # feste Woche ansteuern
    n = weeks_back(datetime.date.today(), datetime.date(2026, 10, 12))
    for _ in range(abs(n)): page.click('[data-elwk="-1"]' if n < 0 else '[data-elwk="1"]'); page.wait_for_timeout(40)
    check("Woche 12.10. bis 18.10.2026 mit Kalenderwoche 42", "KW 42" in page.inner_text(".el-wk") and "12.10.2026 – 18.10.2026" in page.inner_text(".el-wk"), page.inner_text(".el-wk"))
    r1 = txt(".el-wtab tbody tr:nth-child(1) td"); r2 = txt(".el-wtab tbody tr:nth-child(2) td"); foot = txt(".el-wtab tfoot td")
    z = lambda row: [c.replace("0 Stunden", "").strip() for c in row]  # «–» steht mit Screenreader-Text «0 Stunden»
    check("Projekt Eins: Mo 1,75, Mi 2, Summe 3,75; ungültige Einträge und andere Wochen zählen nicht", z(r1) == ["1,75", "–", "2", "–", "–", "–", "–", "3,75"], r1)
    check("Projekt Zwei: Mi 3,5, So 1, Summe 4,5", z(r2) == ["–", "–", "3,5", "–", "–", "–", "1", "4,5"], r2)
    check("Summenzeile: Mo 1,75, Mi 5,5, So 1, gesamt 8,25", z(foot) == ["1,75", "–", "5,5", "–", "–", "–", "1", "8,25"], foot)
    check("Kopf: Gesamtsumme 8,25 h, kein «unvollständig»", "8,25 h" in page.inner_text(".el-sum") and "unvollständig" not in page.inner_text(".el-sum"))
    check("Vorläufige Zeit: Hinweis «1 Projekt hat vorläufige Zeit …»", "1 Projekt hat vorläufige Zeit" in page.inner_text(".el-autohint"), page.inner_text(".el-pwrap")[-300:])
    check("Stand von HH:MM angezeigt", "Stand von" in page.inner_text(".el-stand"))
    # Bedienbarkeit
    check("Tabelle im Scroll-Container (Region, per Tastatur erreichbar)", page.get_attribute(".el-wscroll", "role") == "region" and page.get_attribute(".el-wscroll", "tabindex") == "0")
    check("Spaltenkopf mit Leerzeichen zwischen Wochentag und Datum", "Mo 12.10." in " ".join(t.replace(" ", " ") for t in txt(".el-wtab thead th")), txt(".el-wtab thead th"))
    check("«–» hat Text für Screenreader «0 Stunden»", page.locator(".el-wtab td .sr").count() > 0)
    page.screenshot(path=str(OUT / "z4_woche.png"))
    with page.expect_download() as dl:
        page.click('[data-elact="zeitcsv"]')
    csv = Path(dl.value.path()).read_bytes().decode("utf-8"); lines = csv.strip().split("\r\n")
    check("CSV: BOM, Semikolon, Dezimalpunkt, Kopfzeile mit Wochentagen", csv.startswith("﻿") and lines[0].startswith("﻿Projekt;Mo 12.10.2026;Di 13.10.2026") and lines[-1] == "Summe;1.75;0;5.5;0;0;0;1;8.25", lines)
    check("CSV = Tabelle: Projekt Eins 3.75, Projekt Zwei 4.5", lines[1].endswith(";3.75") and lines[2].endswith(";4.5") and lines[1].startswith("Projekt Eins"), lines[1:3])
    check("Hinweis: nur Online-Projekte", "Nur Online-Projekte" in page.inner_text(".el-pwrap"))

    # Reiterwechsel lädt nur bei Stand über 60 s neu; «Neu laden» immer
    g0 = srv["gets"]; page.click("#el-nav-projekte"); page.wait_for_timeout(400); page.click("#el-nav-zeit"); page.wait_for_timeout(400)
    check("Reiterwechsel innerhalb von 60 s: keine neue Abfrage (schont Supabase)", srv["gets"] == g0, [g0, srv["gets"]])
    page.click('.el-pbar [data-elact="onlist"]'); page.wait_for_timeout(500)
    check("«Neu laden» holt die Liste sofort", srv["gets"] == g0 + 1, [g0, srv["gets"]])
    page.evaluate("window.__off = 61000"); g1 = srv["gets"]; page.click("#el-nav-projekte"); page.wait_for_timeout(600); page.click("#el-nav-zeit"); page.wait_for_timeout(500)
    check("Reiterwechsel nach über 60 s lädt neu", srv["gets"] == g1 + 1, [g1, srv["gets"]])
    # Fehler (540): die alte Tabelle bleibt, als «alt» markiert
    srv["mode"] = "paused"; page.click('.el-pbar [data-elact="onlist"]'); page.wait_for_timeout(700)
    check("Fehler 540: alte Tabelle bleibt, markiert «alt», Hinweis auf den älteren Stand", vis(".el-wtab.alt") and "(alt)" in page.inner_text(".el-stand") and "älteren Stand" in page.inner_text(".el-perr") and page.locator(".el-wtab tbody tr").count() == 2, page.inner_text(".el-pwrap")[:300])
    srv["mode"] = "ok"; page.click('.el-perr [data-elact="onlist"]'); page.wait_for_timeout(600)
    check("Erneut versuchen: Fehler weg, Tabelle nicht mehr «alt»", not vis(".el-perr") and not vis(".el-wtab.alt"))
    # Rückfall auf die alte Abfrage: Stunden unbekannt
    srv["mode"] = "bad"; page.click('.el-pbar [data-elact="onlist"]'); page.wait_for_timeout(800)
    check("Stunden unbekannt: «?» als Knopf mit Beschreibung, Summe «unvollständig»", page.locator(".el-unk").count() == 2 and page.get_attribute(".el-unk >> nth=0", "aria-label") == "Stunden nicht geladen" and "unvollständig" in page.inner_text(".el-sum"), page.inner_text(".el-pwrap")[:300])
    with page.expect_download() as dl2:
        page.click('[data-elact="zeitcsv"]')
    c2 = Path(dl2.value.path()).read_bytes().decode("utf-8").strip().split("\r\n")
    check("CSV bei unbekannten Stunden: Zellen leer, «?», Hinweiszeile", c2[1].endswith(";;;;;;;?") and "nicht geladen" in c2[-1], c2)
    srv["mode"] = "ok"; page.click('.el-unk >> nth=0'); page.wait_for_timeout(600)
    check("Klick auf «?» lädt neu: Stunden wieder da", page.locator(".el-unk").count() == 0 and vis(".el-wtab"))

    # Zeit direkt im Reiter erfassen (Paket C, CJ 21.10.2026): nur Online-Projekte, gleich online gespeichert
    today = datetime.date.today().isoformat()
    check("Formular: Projekt aus der Liste, Datum heute", vis("#el-zform") and txt("#el-zp option") == ["Projekt wählen …", "Projekt Eins", "Projekt Zwei"] and page.input_value("#el-zd") == today, txt("#el-zp option"))
    h0 = flat(".el-chip")
    page.click(".el-chip"); page.wait_for_timeout(150)
    check("Chip im Tab Zeit fokussiert das Stundenfeld des Reiters", page.evaluate("document.activeElement.id") == "el-zh")
    page.fill("#el-zh", "2,5"); page.click('#el-zform [type="submit"]'); page.wait_for_timeout(250)
    check("Ohne Projekt: Hinweis, nichts geschrieben", srv["patch"] == 0 and page.evaluate("document.activeElement.id") == "el-zp")
    page.select_option("#el-zp", label="Projekt Zwei"); page.fill("#el-zh", "2,5"); page.fill("#el-zn", "Büro"); page.click('#el-zform [type="submit"]'); page.wait_for_timeout(500)
    zwei = next(r for r in rows if r["name"] == "Projekt Zwei")
    check("Eintrag online gespeichert, Zeile mit neuem Stand", srv["patch"] == 1 and zwei["data"]["project"]["time"][-1] == {"d": today, "h": 2.5, "n": "Büro"}, zwei["data"]["project"]["time"][-1:])
    check("Stunden und Notiz leer, Projekt bleibt gewählt, Chip zählt mit", page.input_value("#el-zh") == "" and page.input_value("#el-zn") == "" and page.evaluate("document.querySelector('#el-zp').selectedOptions[0].textContent") == "Projekt Zwei" and flat(".el-chip") != h0 and "2,5 h" in flat(".el-chip"), [h0, flat(".el-chip")])
    srv["mode"] = "conflict"; page.fill("#el-zh", "1"); page.click('#el-zform [type="submit"]'); page.wait_for_timeout(500)
    check("Anderswo gespeichert: Fehlermeldung, Eingabe bleibt", "anderen Ort" in page.inner_text("#toasts") and page.input_value("#el-zh") == "1" and len(zwei["data"]["project"]["time"]) == 3)
    srv["mode"] = "ok"
    eins = next(r for r in rows if r["name"] == "Projekt Eins")
    eins["data"] = {**page.evaluate("window.__schemacad.doc"), "project": eins["data"]["project"]}  # gültige Projektdatei, damit sie sich öffnen lässt
    page.click('.el-zopen:text("Projekt Eins")'); page.wait_for_timeout(600)
    if vis(".modal"): page.click(".modal .btn.primary"); page.wait_for_timeout(600)
    check("Klick auf ein Projekt in der Tabelle öffnet es (Projektseite)", page.evaluate("window.__schemacad.doc.project?.online?.id") == eins["id"] and vis(".el-mods") and page.get_attribute("#el-tab-proj", "aria-selected") == "true", page.inner_text("#toasts")[-200:])
    page.click("#el-tab-zeit"); page.wait_for_timeout(300)
    check("Tab Zeit bleibt offen, Klick wechselt zurück", vis(".el-wtab") and page.get_attribute("#el-tab-zeit", "aria-selected") == "true")

    # Zeit-Chip im Projekt, offenes verknüpftes Projekt zählt lokal (Vermerk)
    page.click("#el-nav-projekte"); page.click("#el-pt-cur"); page.wait_for_timeout(200)
    check("Zeit-Chip «Heute 0 h»", "Heute 0 h" in flat(".el-chip"))
    page.set_viewport_size({"width": 960, "height": 900}); page.wait_for_timeout(250)
    check("Unter 1000 px: Chip bleibt sichtbar, kompakt ohne «Heute»", vis(".el-chip") and not vis(".el-chipl") and "0 h" in flat(".el-chip"), flat(".el-chip"))
    page.set_viewport_size({"width": 1440, "height": 900}); page.wait_for_timeout(250)
    page.click(".el-chip"); page.wait_for_timeout(200)
    check("Chip fokussiert das Stundenfeld", page.evaluate("document.activeElement.id") == "el-th")
    page.fill("#el-th", "1,5"); page.click('#el-tform [type="submit"]'); page.wait_for_timeout(250)
    check("Eintrag: Chip zeigt «Heute 1,5 h»", "Heute 1,5 h" in flat(".el-chip"), flat(".el-chip"))
    check("keine Konsolenfehler", not errors, errors[:3])
    b.close()
print("Rot:" + str(fails) if fails else "alle ok")
sys.exit(1 if fails else 0)
