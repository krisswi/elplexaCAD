# UI-Tests Reiter Profil und Reiter-Aufbau (Etappe 6, CJ 20.10.2026): Anmeldung im Profil (falsches Passwort, kein Netz, leere Felder), Abmelden, Gast-Hinweis, Tipp-Zeile, Pfad «Projekte › Name». Vorher: node build.mjs elplexa
# Aufruf: python3 test/profil_tests.py [Ausgabeordner]
import sys, tempfile, json, base64
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "ElplexaCAD.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="profil_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
UID = "11111111-1111-1111-1111-111111111111"
jwt = "x." + base64.urlsafe_b64encode(json.dumps({"sub": UID}).encode()).decode().rstrip("=") + ".y"
srv = {"mode": "ok"}
store = {}  # user_settings der Attrappe (Offerte Schritt 2): name → { data, updated_at }
def fake(route):
    u = urlparse(route.request.url); path = u.path
    if srv["mode"] == "offline": route.abort(); return
    J = lambda o, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(o))
    if path == "/auth/v1/token":
        body = json.loads(route.request.post_data or "{}")
        if srv["mode"] == "wrong" or body.get("password") != "attrappe": J({"error_description": "Invalid login credentials"}, 400); return
        J({"access_token": jwt, "refresh_token": "r", "expires_at": 4102444800, "user": {"email": "test@beispiel.ch"}}); return
    if path == "/auth/v1/logout": route.fulfill(status=204, body=""); return
    if path == "/rest/v1/projects": J([]); return
    if path == "/rest/v1/user_settings":
        if route.request.method == "POST": r = json.loads(route.request.post_data); store[r["name"]] = {"data": r["data"], "updated_at": r["updated_at"]}; route.fulfill(status=201, body=""); return
        name = parse_qs(u.query).get("name", [""])[0].removeprefix("eq."); J([store[name]] if name in store else []); return
    J({"message": "nicht gefunden"}, 404)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "ERR_FAILED" not in m.text and "400" not in m.text else None)
    page.route("https://keqfieduhipnulpkhdbj.supabase.co/**", fake)
    vis = lambda s: page.is_visible(s)
    tabs = lambda: page.evaluate("[...document.querySelectorAll('.el-navbtn')].map((t) => t.textContent)")
    page.goto(URL); page.wait_for_timeout(300)
    check("Zeile 1: Projekte, Zeit; kein Reiter «Projekt», Profil nur über den Konto-Kreis (CJ 21.10.2026)", tabs() == ["Projekte", "Zeit"])
    check("Start: das offene Projekt direkt geöffnet, sein Tab gewählt", vis(".el-mods") and page.get_attribute("#el-tab-proj", "aria-selected") == "true" and page.inner_text("#el-tab-proj").strip() != "")
    page.click("#el-nav-projekte"); page.wait_for_timeout(250)
    check("Klick auf «Projekte» in Zeile 1: Projektliste, erste Kachel «geöffnet»", vis(".el-pwrap") and not vis(".el-mods") and "geöffnet" in page.inner_text(".el-ptile.cur"))
    page.click("#el-pt-cur"); page.wait_for_timeout(250)
    check("Klick auf die Kachel: Projekt mit Modulen und Projektdaten", vis(".el-mods") and vis(".el-proj") and vis("#el-tform"))
    page.evaluate("document.activeElement?.blur()"); page.keyboard.press("0"); page.wait_for_timeout(200)
    check("Taste 0 schliesst die Übersicht", not vis("#el-hub"))
    page.keyboard.press("0"); page.wait_for_timeout(200)
    check("Taste 0 zurück: das offene Projekt, nicht die Liste", vis(".el-mods"))

    # Profil als Gast
    page.click("#el-acct"); page.wait_for_timeout(200)
    check("Konto-Kreis zeigt «Gast» und führt zum Profil", vis(".el-profile") and "Gast" in page.inner_text("#el-acct"))
    t = page.inner_text(".el-profile")
    check("Profil: Gast-Hinweis, Anmeldung, Firmenprofil, Tipp-Zeile", "Gast" in t and vis("#el-pf-form") and vis("#el-pf-firm") and "Noch keine Firmendaten" in t and vis("[data-eltip]"))
    # Firmenprofil (Offerte Schritt 2): als Gast nur im Browser
    page.click("#el-pf-firm"); page.wait_for_timeout(200)
    check("Fenster Firmenprofil: Firma, Adresse, E-Mail, Telefon, Logo", all(vis(f'.modal [data-pf="{k}"]') for k in ["FIRMA", "FIRMA_ADR", "MAIL", "TEL"]) and vis('.modal [data-pfl="load"]'))
    page.fill('.modal [data-pf="FIRMA"]', "Muster Elektro"); page.fill('.modal [data-pf="FIRMA_ADR"]', "Gasse 2\n3000 Bern"); page.fill('.modal [data-pf="MAIL"]', "info@muster.test"); page.fill('.modal [data-pf="TEL"]', "031 000 00 00")
    page.click(".modal [data-ok]"); page.wait_for_timeout(250)
    t = page.inner_text(".el-profile")
    check("Profil zeigt die Firmendaten", all(x in t for x in ["Muster Elektro", "3000 Bern", "info@muster.test", "031 000 00 00"]), t[:300])
    check("Als Gast nichts online", not store)
    check("Altes Anmeldefeld ist weg: kein Anmelden im Bereich Online, kein Konto-Menü", not vis('[data-elact="login"]') and page.locator("#el-acctmenu").count() == 0)
    page.screenshot(path=str(OUT / "pr_gast.png"))
    page.uncheck("[data-eltip]"); page.wait_for_timeout(200)
    check("Tipp-Zeile im Profil ausschalten", not vis(".el-tip") and not page.is_checked("[data-eltip]"))
    page.check("[data-eltip]"); page.wait_for_timeout(200)
    check("Tipp-Zeile im Profil einschalten", vis(".el-tip"))
    # leere Felder
    page.click('#el-pf-form [type="submit"]'); page.wait_for_timeout(200)
    check("Leere Felder: Hinweis", "Bitte E-Mail und Passwort" in page.inner_text(".el-profile .el-perr"))
    # falsches Passwort
    page.fill("#el-pf-mail", "test@beispiel.ch"); page.fill("#el-pf-pw", "falsch"); page.click('#el-pf-form [type="submit"]'); page.wait_for_timeout(400)
    check("Falsches Passwort: Meldung im Profil, weiter Gast", "falsch" in page.inner_text(".el-profile .el-perr") and "Gast" in page.inner_text("#el-acct"), page.inner_text(".el-profile")[:200])
    check("Falsches Passwort: E-Mail bleibt stehen, Passwort leer", page.input_value("#el-pf-mail") == "test@beispiel.ch" and page.input_value("#el-pf-pw") == "")
    # kein Netz
    srv["mode"] = "offline"
    page.fill("#el-pf-mail", "test@beispiel.ch"); page.fill("#el-pf-pw", "attrappe"); page.click('#el-pf-form [type="submit"]'); page.wait_for_timeout(400)
    check("Kein Netz: Meldung «Keine Verbindung», weiter Gast", "Keine Verbindung" in page.inner_text(".el-profile .el-perr") and "Gast" in page.inner_text("#el-acct"), page.inner_text(".el-profile")[:200])
    check("Kein Netz: E-Mail bleibt stehen", page.input_value("#el-pf-mail") == "test@beispiel.ch")
    page.fill("#el-pf-pw", "tipp"); page.evaluate("window.dispatchEvent(new Event('resize'))"); page.click("#el-nav-zeit"); page.click("#el-acct"); page.wait_for_timeout(200)
    check("E-Mail bleibt auch beim Wechsel der Reiter stehen", page.input_value("#el-pf-mail") == "test@beispiel.ch")
    # richtig
    srv["mode"] = "ok"
    page.fill("#el-pf-mail", "test@beispiel.ch"); page.fill("#el-pf-pw", "attrappe"); page.click('#el-pf-form [type="submit"]'); page.wait_for_timeout(500)
    check("Angemeldet: Profil zeigt E-Mail und Abmelden, Konto-Kreis den Namen", "test@beispiel.ch" in page.inner_text(".el-profile") and vis("#el-pf-logout") and not vis("#el-pf-form") and "test" in page.inner_text("#el-acct"), page.inner_text(".el-profile")[:200])
    page.screenshot(path=str(OUT / "pr_angemeldet.png"))
    check("Nach dem Anmelden: Firmenprofil online beim Benutzer", store.get("profil", {}).get("data", {}).get("MAIL") == "info@muster.test", str(store)[:200])
    page.click("#el-pf-logout"); page.wait_for_timeout(400)
    check("Abmelden: wieder Gast mit Anmeldeformular", vis("#el-pf-form") and "Gast" in page.inner_text("#el-acct"))
    # Reiter: Barrierefreiheit, Pfeiltasten, Tasten 1 bis 9 nur bei Modulkacheln
    # Profil ohne Reiter (CJ 21.10.2026): Fläche mit eigenem Namen, Pfad «Profil», kein Reiter gewählt
    check("Profil: kein Reiter Profil, Fläche als Bereich «Profil», kein Tab und kein Bereich gewählt", page.locator("#el-tab-profil").count() == 0 and page.get_attribute("#el-tabpanel", "aria-label") == "Profil" and page.evaluate("[...document.querySelectorAll('.el-ptab')].every((t) => t.getAttribute('aria-selected') === 'false') && !document.querySelector('.el-navbtn.on')"))
    page.click("#el-nav-zeit"); page.wait_for_timeout(200)
    check("Reiterfläche: tabpanel mit aria-labelledby auf den gewählten Reiter, Reiter mit aria-controls", page.get_attribute("#el-tabpanel", "role") == "tabpanel" and page.get_attribute("#el-tabpanel", "aria-labelledby") == "el-tab-zeit" and page.get_attribute("#el-tab-zeit", "aria-controls") == "el-tabpanel")
    check("Roving-Tabindex: nur der gewählte Tab ist per Tab erreichbar", page.evaluate("[...document.querySelectorAll('.el-ptab')].map((t) => t.tabIndex)") == [-1, 0])
    page.focus("#el-tab-zeit"); page.keyboard.press("ArrowLeft"); page.wait_for_timeout(250)
    check("Pfeil links: Tab des Projekts gewählt und fokussiert", page.get_attribute("#el-tab-proj", "aria-selected") == "true" and page.evaluate("document.activeElement.id") == "el-tab-proj")
    page.keyboard.press("End"); page.wait_for_timeout(250)
    check("Ende: letzter Tab (Zeit)", page.get_attribute("#el-tab-zeit", "aria-selected") == "true")
    page.click("#el-acct"); page.wait_for_timeout(200)
    page.evaluate("document.activeElement.blur()"); page.keyboard.press("1"); page.wait_for_timeout(250)
    check("Taste 1 im Reiter Profil öffnet kein Modul", vis("#el-hub") and vis(".el-profile"))
    page.click("#el-nav-projekte"); page.click("#el-pt-cur"); page.wait_for_timeout(200)
    check("Statuspille ist kein Knopf im Knopf (kein role=button)", page.locator(".el-mst[role=button]").count() == 0 and page.locator(".el-tile .el-mst[data-elmst]").count() >= 1)
    page.click("#el-tile-schema", button="right"); page.click('[data-elmodact="st"]'); page.wait_for_timeout(250)
    check("Rechtsklick › Status … öffnet das Statusmenü der Kachel", vis("#el-mstpop"))
    page.keyboard.press("Escape"); page.wait_for_timeout(150)

    # Anmeldung über das Fenster (Feedback ohne Login): der Konto-Kreis zeichnet sich von selbst neu
    page.click("#el-acct"); page.wait_for_timeout(150)
    check("Wieder Gast", "Gast" in page.inner_text("#el-acct"))
    page.click("#el-fb"); page.wait_for_timeout(300)
    page.fill('.modal [data-f="e"]', "test@beispiel.ch"); page.fill('.modal [data-f="p"]', "attrappe"); page.click(".modal [data-ok]"); page.wait_for_timeout(600)
    if vis(".modal"): page.keyboard.press("Escape"); page.wait_for_timeout(200)
    check("Anmeldung über das Fenster: Konto-Kreis zeigt sofort den Namen, Profil den Abmelden-Knopf", "test" in page.inner_text("#el-acct") and vis("#el-pf-logout"), page.inner_text("#el-acct"))
    page.click("#el-pf-logout"); page.wait_for_timeout(300)

    # Konto-Kreis aus dem Modul
    page.click("#el-nav-projekte"); page.click("#el-pt-cur"); page.wait_for_timeout(200)
    page.click(".el-mod-open, #el-tile-schema") if vis("#el-tile-schema") else None
    page.wait_for_timeout(250)
    page.click("#el-acct"); page.wait_for_timeout(250)
    check("Konto-Kreis aus dem Modul: Übersicht mit Reiter Profil", vis("#el-hub") and vis(".el-profile"))
    check("keine Konsolenfehler", not errors, errors[:3])
    b.close()
print("Rot:" + str(fails) if fails else "alle ok")
sys.exit(1 if fails else 0)
