# UI-Tests Reiter «Zeit» (Etappe 4, CJ 20.10.2026): Woche, Summen je Tag und Projekt, CSV, nur Online-Projekte; Attrappe statt Supabase. Vorher: node build.mjs elplexa
# Aufruf: python3 test/zeitreiter_tests.py [Ausgabeordner]
import sys, tempfile, json, base64, uuid, re
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
# Zeiten in einer festen Woche: Mo 2026-10-12 bis So 2026-10-18
T1 = [{"d": "2026-10-12", "h": 1.5, "n": "a"}, {"d": "2026-10-12", "h": 0.25, "n": "b"}, {"d": "2026-10-14", "h": 2, "n": ""}, {"d": "2026-10-19", "h": 9, "n": "andere Woche"}]
T2 = [{"d": "2026-10-14", "h": 3.5, "n": ""}, {"d": "2026-10-18", "h": 1, "n": ""}]
rows = [{"id": str(uuid.uuid4()), "name": n, "status": "In Arbeit", "updated_at": "2026-10-18T10:00:00+00:00", "data": {"project": {"meta": {"OBJEKT": "x"}, "time": t}}} for n, t in (("Projekt Eins", T1), ("Projekt Zwei", T2))]
def fake(route):
    req = route.request; u = urlparse(req.url); q = {k: v[0] for k, v in parse_qs(u.query).items()}; path = u.path
    J = lambda o, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(o))
    if path == "/auth/v1/token": J({"access_token": jwt, "refresh_token": "r", "expires_at": 4102444800, "user": {"email": "test@beispiel.ch"}}); return
    if path == "/rest/v1/projects" and req.method == "GET":
        col = lambda r, k: r["data"].get(k.split("->")[1]) if "->" in k else r.get(k)
        J([{k.split(":")[0]: col(r, k.split(":")[-1]) for k in q["select"].split(",")} for r in rows]); return
    J({"message": "nicht gefunden"}, 404)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True).new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.route("https://keqfieduhipnulpkhdbj.supabase.co/**", fake)
    vis = lambda s: page.is_visible(s)
    page.goto(URL); page.wait_for_timeout(300)
    page.click("#el-tab-zeit"); page.wait_for_timeout(250)
    check("Gast: Hinweis, keine Tabelle", "Nicht angemeldet" in page.inner_text(".el-pwrap") and not vis(".el-wtab"))
    page.click("#el-acct"); page.fill("#el-pf-mail", "test@beispiel.ch"); page.fill("#el-pf-pw", "attrappe"); page.click('#el-pf-form [type="submit"]'); page.wait_for_timeout(600)
    page.click("#el-tab-zeit"); page.wait_for_timeout(700)
    check("Angemeldet: Tabelle mit einer Zeile je Online-Projekt", vis(".el-wtab") and page.locator(".el-wtab tbody tr").count() == 2, page.inner_text(".el-pwrap")[:200])
    # diese Woche enthält keine Stunden → zurück bis 2026-10-12: Woche wählen über «‹» bis passende Woche
    page.evaluate("0")
    # feste Woche ansteuern: so oft ‹ drücken, bis Anzeige mit 12.10.2026 beginnt
    for _ in range(80):
        if page.inner_text(".el-wk").startswith("12.10.2026"): break
        wk = page.inner_text(".el-wk"); first = wk.split(" ")[0]; y, m, d = int(first[6:]), int(first[3:5]), int(first[:2])
        import datetime
        cur = datetime.date(y, m, d); target = datetime.date(2026, 10, 12)
        page.click('[data-elwk="-1"]' if cur > target else '[data-elwk="1"]'); page.wait_for_timeout(80)
    check("Woche 12.10. bis 18.10.2026", page.inner_text(".el-wk").startswith("12.10.2026 – 18.10.2026"), page.inner_text(".el-wk"))
    txt = lambda sel: [c.strip() for c in page.evaluate(f"[...document.querySelectorAll('{sel}')].map((e) => e.textContent)")]
    r1 = txt(".el-wtab tbody tr:nth-child(1) td"); r2 = txt(".el-wtab tbody tr:nth-child(2) td"); foot = txt(".el-wtab tfoot td")
    check("Projekt Eins: Mo 1,75, Mi 2, Summe 3,75 (andere Woche zählt nicht)", r1 == ["1,75", "–", "2", "–", "–", "–", "–", "3,75"], r1)
    check("Projekt Zwei: Mi 3,5, So 1, Summe 4,5", r2 == ["–", "–", "3,5", "–", "–", "–", "1", "4,5"], r2)
    check("Summenzeile: Mo 1,75, Mi 5,5, So 1, gesamt 8,25", foot == ["1,75", "–", "5,5", "–", "–", "–", "1", "8,25"], foot)
    check("Kopf: Gesamtsumme 8,25 h", "8,25 h" in page.inner_text(".el-sum"))
    page.screenshot(path=str(OUT / "z4_woche.png"))
    with page.expect_download() as dl:
        page.click('[data-elact="zeitcsv"]')
    f = dl.value.path(); csv = Path(f).read_bytes().decode("utf-8")
    lines = csv.strip().split("\r\n")
    check("CSV: BOM, Semikolon, Dezimalpunkt, Kopfzeile mit Wochentagen", csv.startswith("﻿") and lines[0].startswith("﻿Projekt;Mo 12.10.2026;Di 13.10.2026") and lines[-1] == "Summe;1.75;0;5.5;0;0;0;1;8.25", lines)
    check("CSV = Tabelle: Projekt Eins 3.75, Projekt Zwei 4.5", lines[1].endswith(";3.75") and lines[2].endswith(";4.5") and lines[1].startswith("Projekt Eins"), lines[1:3])
    check("Hinweis: nur Online-Projekte", "Nur Online-Projekte" in page.inner_text(".el-pwrap"))
    # Zeit-Chip im Projekt
    page.click("#el-tab-projekte"); page.click("#el-pt-cur"); page.wait_for_timeout(200)
    check("Zeit-Chip «Heute 0 h» im Projekt", "Heute 0 h" in page.inner_text(".el-chip"))
    page.click(".el-chip"); page.wait_for_timeout(200)
    check("Chip fokussiert das Stundenfeld", page.evaluate("document.activeElement.id") == "el-th")
    page.fill("#el-th", "1,5"); page.click('#el-tform [type="submit"]'); page.wait_for_timeout(250)
    check("Eintrag: Chip zeigt «Heute 1,5 h»", "Heute 1,5 h" in page.inner_text(".el-chip"), page.inner_text(".el-chip"))
    check("keine Konsolenfehler", not errors, errors[:3])
    b.close()
print("Rot:" + str(fails) if fails else "alle ok")
sys.exit(1 if fails else 0)
