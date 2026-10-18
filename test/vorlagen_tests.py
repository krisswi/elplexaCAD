# UI-Tests Abgang als Vorlage (vorlagen.js) und Kleinkram (Suchfenster-Knöpfe, Enter im Anmeldedialog), 16.10.2026.
# Aufruf aus web-src: python3 test/vorlagen_tests.py
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    M = lambda: page.evaluate("window.__schemacad.model")
    def pt(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.evaluate("(()=>{const r=document.querySelector('#svg').getBoundingClientRect();return {l:r.left,t:r.top}})()")
        return r["l"] + v["x"] + x * v["z"], r["t"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): X, Y = pt(x, y); page.mouse.move(X, Y); page.mouse.click(X, Y); page.wait_for_timeout(80)
    toasts = lambda: " ".join(page.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent)"))
    page.goto(URL); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(100)

    # A) Abgang: links wählen, Vorschau in der Spalte, Klick setzt alles, ein Schritt rückgängig
    check("Abschnitt Abgänge mit 4 Vorlagen", page.locator('#left [data-sym^="A:"]').count() == 4)
    n0 = len(M()["items"])
    page.click('[data-sym="A:ls1"]'); X, Y = pt(60, 120); page.mouse.move(X, Y); page.wait_for_timeout(80)
    check("Vorschau zeigt den Abgang in Spalte 2", page.locator("#overlay g[opacity='0.55'] polyline").count() >= 3 and "Abgang" in page.inner_text("#statusbar"))
    click(60, 120)
    it = M()["items"]
    ls = [i for i in it if i.get("sym") == "LS_1P"]; tm = [i for i in it if i["type"] == "terminals"]
    check("Klick setzt LS, 3 Leitungen und Klemmen mit Kabel", len(it) == n0 + 5 and len(ls) == 1 and len(tm) == 1 and tm[0]["cable"] == "3x1.5mm2" and tm[0]["n"] == 3, len(it) - n0)
    check("BMK 3F2 und Klemmen 3X2", ls[0]["attrs"]["BMK"] == "3F2" and tm[0]["bmk"] == "3X2", [ls[0]["attrs"], tm[0]["bmk"]])
    check("Abzweigpunkte auf L1 und N, keiner auf PE", page.evaluate("[...document.querySelectorAll('#items circle[r=\"0.5\"][stroke=\"none\"]')].map(c => +c.getAttribute('cy'))").count(45) == 0 and page.locator('#items circle[r="0.5"][stroke="none"]').count() == 2)
    click(65, 120)
    check("Belegte Spalte: Meldung, nichts gesetzt", len(M()["items"]) == n0 + 5 and "schon ein Gerät" in toasts())
    page.keyboard.press("Escape"); page.keyboard.press("Meta+z"); page.wait_for_timeout(100)
    check("Ein Schritt rückgängig entfernt den ganzen Abgang", len(M()["items"]) == n0)
    page.keyboard.press("Meta+Shift+z"); page.wait_for_timeout(100)
    with page.expect_download() as dd: page.click("#btn-export"); page.click("#btn-dxf")
    import tempfile, os, ezdxf
    f = os.path.join(tempfile.mkdtemp(), "abgang.dxf"); dd.value.save_as(f)
    doc = ezdxf.readfile(f); aud = doc.audit()
    check("DXF ohne Audit-Fehler, LS als Block", len(aud.errors) == 0 and any(e.dxf.name == "LS_1P" for e in doc.modelspace().query("INSERT")))
    os.remove(f)

    # B1) Suchfenster: Weiter ist der Hauptknopf, Schliessen und Alle ersetzen gleich gewichtet
    page.keyboard.press("Meta+f"); page.wait_for_timeout(100)
    cls = lambda k: page.get_attribute(f'.searchbox [data-s="{k}"]', "class")
    check("Suchen: Weiter primär, Schliessen und Alle ersetzen umrandet", "primary" in cls("next") and "outline" in cls("close") and "outline" in cls("all") and "primary" not in cls("all"), [cls("close"), cls("all"), cls("next")])
    page.click('.searchbox [data-s="close"]')

    # B2) Anmeldedialog: Enter schickt ab (Online-Ablage nachgebildet: Anmeldung schlägt mit 400 fehl)
    calls = []
    page.route("https://keqfieduhipnulpkhdbj.supabase.co/**", lambda r: (calls.append(r.request.url), r.fulfill(status=400, content_type="application/json", body='{"error":"invalid_grant"}')))
    page.click('[data-libact="cloud"]'); page.wait_for_timeout(100)
    page.locator(".modal .choice").first.click(); page.wait_for_timeout(100)
    check("Anmeldedialog offen", page.locator('.modal [data-f="e"]').count() == 1)
    page.fill('.modal [data-f="e"]', "test@example.ch"); page.fill('.modal [data-f="p"]', "falsch"); page.press('.modal [data-f="p"]', "Enter"); page.wait_for_timeout(300)
    check("Enter im Passwortfeld schickt ab", any("/auth/v1/token" in u for u in calls) and "falsch" in toasts(), calls)
    page.keyboard.press("Escape")

    # C) Abgänge über den Symbolen, eigener Abgang aus der Auswahl (CJ 16.10.)
    order = page.evaluate("[...document.querySelectorAll('#left .section-title')].map(e => e.textContent)")
    check("Abgänge stehen über den Symbolen", order.index("Abgänge") < order.index("Symbole"), order)
    page.keyboard.press("Escape"); page.keyboard.press("Escape")
    page.click("[data-addsheet]"); page.wait_for_timeout(150)
    page.click('[data-sym="A:fils"]'); click(100, 120); page.keyboard.press("Escape"); page.wait_for_timeout(80)
    n1 = len(M()["items"])
    X0, Y0 = pt(84, 197); X1, Y1 = pt(122, 30)
    page.mouse.move(X0, Y0); page.mouse.down(); page.mouse.move(X1, Y1, steps=6); page.mouse.up(); page.wait_for_timeout(100)
    nsel = len(page.evaluate("window.__schemacad.sel"))
    check("Abgang mit Rahmen gewählt", nsel >= 3, nsel)
    page.click("[data-abgsave]"); page.wait_for_timeout(100)
    page.fill('.modal [data-f="0"]', "Bad FI+LS"); page.click(".modal [data-ok]"); page.wait_for_timeout(150)
    tile = page.locator('#left .abg', has_text="Bad FI+LS")
    check("Eigener Abgang als Kachel links", tile.count() == 1)
    stored = page.evaluate("JSON.parse(localStorage.getItem('schemacad.abgaenge') || '[]').map(t => t.label)")
    check("Im Browser gespeichert", stored == ["Bad FI+LS"], stored)
    k = page.evaluate("JSON.parse(localStorage.getItem('schemacad.abgaenge'))[0].items.length")
    tile.click(); click(200, 120); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    check("Eigener Abgang in Spalte gesetzt (alle Objekte)", len(M()["items"]) == n1 + k, [n1, k, len(M()["items"])])
    if len(sys.argv) > 1: page.screenshot(path=sys.argv[1], clip={"x": 0, "y": 40, "width": 270, "height": 520})
    page.hover('#left .abgwrap'); page.click('#left [data-abgdel]'); page.click('.modal [data-r="1"]'); page.wait_for_timeout(100)
    check("Eigener Abgang gelöscht", page.locator('#left .abg', has_text="Bad FI+LS").count() == 0 and page.evaluate("localStorage.getItem('schemacad.abgaenge')") == "[]")
    check("keine Fehler", not errors, errors[:3])
    b.close()
print(f"\n{len(fails)} Fehler" if fails else "\nVorlagen und Kleinkram: alle Tests ok")
sys.exit(1 if fails else 0)
