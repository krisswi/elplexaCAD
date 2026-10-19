# UI-Tests Wünsche CJ 18.10.2026, gebaut 19.10.2026 (Gruppen A bis C). Aufruf aus web-src: python3 test/wuensche_tests.py
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
    page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    M = lambda: page.evaluate("window.__schemacad.model")
    D = lambda: page.evaluate("window.__schemacad.doc")
    def pt(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.evaluate("(()=>{const r=document.querySelector('#svg').getBoundingClientRect();return {l:r.left,t:r.top}})()")
        return r["l"] + v["x"] + x * v["z"], r["t"] + v["y"] + (210 - y) * v["z"]
    def click(x, y, **kw): X, Y = pt(x, y); page.mouse.move(X, Y); page.mouse.click(X, Y, **kw); page.wait_for_timeout(80)
    def items(t): return [i for i in M()["items"] if i["type"] == t]
    page.goto(URL); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    page.click("[data-addsheet]"); page.wait_for_timeout(100)

    # ---------- A1: Text drehen (R) und ausrichten ----------
    page.keyboard.press("t"); page.keyboard.press("r"); page.wait_for_timeout(50)
    check("Text-Werkzeug: R dreht den nächsten Text, Hinweis zeigt 90°", "90°" in page.inner_text("#statusbar"))
    page.select_option("#right [data-newtal]", "c")
    click(120, 120); page.keyboard.type("Gedreht"); page.keyboard.press("Enter"); page.wait_for_timeout(100)
    tx = [i for i in items("text") if i["s"] == "Gedreht"]
    check("Neuer Text gedreht 90° und mittig", len(tx) == 1 and tx[0].get("r") == 90 and tx[0].get("al") == "c", tx)
    page.keyboard.press("Escape"); page.keyboard.press("v"); click(120, 120.5)
    check("Text per Klick gewählt", page.evaluate("window.__schemacad.sel") == [tx[0]["id"]])
    page.keyboard.press("r"); page.wait_for_timeout(80)
    tx = [i for i in items("text") if i["s"] == "Gedreht"][0]
    check("Gewählter Text: R dreht weiter auf 180°", tx.get("r") == 180, tx)
    check("Rechts: Drehung und Ausrichtung", page.locator("#right [data-textr]").count() == 1 and page.input_value("#right [data-textr]") == "180")
    page.select_option("#right [data-textal]", "r"); page.wait_for_timeout(80)
    tx = [i for i in items("text") if i["s"] == "Gedreht"][0]
    check("Ausrichtung rechts gespeichert, SVG mit text-anchor end", tx.get("al") == "r" and 'text-anchor="end"' in page.inner_html("#svg"))
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("Rückgängig nimmt die Ausrichtung zurück", [i for i in items("text") if i["s"] == "Gedreht"][0].get("al") == "c")

    # ---------- A2/A3: Klemmenleiste ----------
    page.keyboard.press("Escape")
    page.click('[data-sym="TERMINALS"]'); click(200, 60); page.keyboard.press("Escape")
    kl = items("terminals")[-1]
    page.keyboard.press("v"); click(201, 56)
    check("Klemmenleiste gewählt", page.evaluate("window.__schemacad.sel") == [kl["id"]])
    page.fill('#right [data-term="cable"]', "U72 2x4x0.8"); page.wait_for_timeout(80)
    kl = [i for i in items("terminals") if i["id"] == kl["id"]][0]
    check("U72 2x4x0.8 = 8 Klemmen, ohne PE, 8 Felder für Klemmentexte", kl["n"] == 8 and kl["pe"] == "none" and page.locator("#right [data-tlab]").count() == 8, kl)
    check("Hinweis Fernmeldekabel", "8 Adern" in page.inner_text("#right"))
    page.fill('#right [data-tlab="0"]', "L1|123456"); page.wait_for_timeout(80)
    kl = [i for i in items("terminals") if i["id"] == kl["id"]][0]
    check("Klemmentext gekürzt auf 2 Zeilen à 5 Zeichen", kl.get("lab", [None])[0] == "L1|12345", kl.get("lab"))
    check("Klemmentext im Schema", ">12345<" in page.inner_html("#svg"))
    page.check("#right [data-tvert]"); page.wait_for_timeout(80)
    kl = [i for i in items("terminals") if i["id"] == kl["id"]][0]
    check("Senkrecht umstellbar", kl.get("vert") is True and "rotate(90) scale(1,-1)" in page.inner_html("#svg"))
    page.fill('#right [data-term="cable"]', "4x2x0.8"); page.wait_for_timeout(80)
    check("4x2x0.8 = 8 Klemmen", [i for i in items("terminals") if i["id"] == kl["id"]][0]["n"] == 8)

    # ---------- B4: ⌘-Klick wählt an und ab ----------
    page.keyboard.press("Escape"); page.keyboard.press("Escape")
    page.click('[data-sym="LS_1P"]'); click(60, 120); click(100, 120); page.keyboard.press("Escape")
    ls = [i for i in items("symbol") if i["sym"] == "LS_1P"]
    page.keyboard.press("v"); click(ls[0]["x"], ls[0]["y"] - 5)
    X, Y = pt(ls[1]["x"], ls[1]["y"] - 5); page.keyboard.down("Meta"); page.mouse.click(X, Y); page.keyboard.up("Meta"); page.wait_for_timeout(80)
    check("⌘-Klick wählt dazu (Schema)", sorted(page.evaluate("window.__schemacad.sel")) == sorted([ls[0]["id"], ls[1]["id"]]))
    page.keyboard.down("Meta"); page.mouse.click(X, Y); page.keyboard.up("Meta"); page.wait_for_timeout(80)
    check("⌘-Klick wählt wieder ab", page.evaluate("window.__schemacad.sel") == [ls[0]["id"]])

    # ---------- B5: kurzer Klick = Standard, Rechtsklick/halten = Menü ----------
    page.click("#tool-wire", button="right"); page.wait_for_timeout(80)
    check("Rechtsklick auf Leitung: Menü Leiterzahl und Art", page.is_visible("#hold-menu") and "Art der Leitung" in page.inner_text("#hold-menu"))
    page.click('#hold-menu [data-hact="b:3"]'); page.wait_for_timeout(80)
    check("Wahl im Menü: Werkzeug Leitung mit 3 Leitern", page.get_attribute("#tool-wire", "aria-pressed") == "true" and page.input_value("#right [data-newbundle]") == "3")
    page.keyboard.press("v"); bb = page.locator("#tool-text").bounding_box()
    page.mouse.move(bb["x"] + 20, bb["y"] + 10); page.mouse.down(); page.wait_for_timeout(600); page.mouse.up(); page.wait_for_timeout(80)
    check("Gedrückt halten auf Text: Menü statt Werkzeug", page.is_visible("#hold-menu") and "Drehung" in page.inner_text("#hold-menu") and page.get_attribute("#tool-text", "aria-pressed") == "false")
    page.keyboard.press("Escape"); page.click("#tool-text"); page.wait_for_timeout(50)
    check("Kurzer Klick auf Text: Werkzeug Text", page.get_attribute("#tool-text", "aria-pressed") == "true" and not page.is_visible("#hold-menu"))
    page.keyboard.press("Escape")
    page.click("#btn-save", button="right"); page.wait_for_timeout(80)
    check("v3: Rechtsklick auf Speichern = Speichern unter", page.is_visible("#hold-menu") and "Speichern unter" in page.inner_text("#hold-menu"))
    page.keyboard.press("Escape")
    page.click("#btn-export", button="right"); page.wait_for_timeout(80)
    check("Rechtsklick auf Exportieren öffnet das Menü", page.is_visible("#export-menu"))
    page.keyboard.press("Escape")

    # ---------- B6: Blätter umsortieren ----------
    page.click("[data-addsheet]"); page.wait_for_timeout(100)
    page.evaluate("window.__schemacad.doc.sheets.forEach((s, i) => { if (!s.kind) s.meta.TITEL = 'T' + i; })")  # Blätter erkennen am Titel (Nummern ändern sich seit D3)
    order = lambda: [s["meta"]["TITEL"] for s in D()["sheets"] if not s.get("kind")]
    nums = lambda: [s["meta"]["BLATT"] for s in D()["sheets"] if not s.get("kind")]
    n0 = nums()
    before = order(); page.keyboard.press("g"); page.wait_for_timeout(100)
    act = page.evaluate("window.__schemacad.active")
    page.focus(f'#sheet-menu [data-sheet="{act}"]'); page.keyboard.press("Alt+ArrowUp"); page.wait_for_timeout(100)
    after = order()
    check("Alt+↑ in der Blattliste: Schemablatt eine Stelle nach vorn", after == before[:-2] + [before[-1], before[-2]], (before, after))
    check("offenes Blatt bleibt offen", D()["sheets"][page.evaluate("window.__schemacad.active")]["meta"]["TITEL"] == before[-1])
    check("D3: verschobenes Blatt nimmt die Nummer seines Platzes, das nächste zählt hoch", nums() == n0 and "Neue Blattnummer" in page.inner_text("body"), (n0, nums()))
    rows = page.locator("#sheet-menu .srow"); n = rows.count()
    src = page.locator(f'#sheet-menu [data-sheet="{page.evaluate("window.__schemacad.active")}"]').bounding_box()
    dst = page.locator(f'#sheet-menu [data-sheet="{page.evaluate("window.__schemacad.active") + 1}"]').bounding_box()
    page.mouse.move(src["x"] + 30, src["y"] + src["height"] / 2); page.mouse.down()
    page.mouse.move(dst["x"] + 30, dst["y"] + dst["height"] / 2, steps=6); page.mouse.up(); page.wait_for_timeout(120)
    check("Ziehen in der Blattliste stellt die Reihenfolge wieder her, Nummern wieder in Folge", order() == before and nums() == n0, (order(), nums()))
    tt = [s.get("kind") for s in D()["sheets"]]
    check("Titelseite und Inhalt bleiben vorn", tt[:2] == ["title", "toc"], tt)
    page.keyboard.press("Escape")

    # ---------- B7: Symbolsuche unten links ----------
    sb = page.locator(".symsearch").bounding_box(); lb = page.locator("#left").bounding_box()
    check("Symbolsuche sichtbar unten links", page.is_visible("#sym-find") and abs((sb["y"] + sb["height"]) - (lb["y"] + lb["height"])) < 2)
    page.keyboard.press("/"); page.keyboard.type("rcbo 2p"); page.wait_for_timeout(80)
    vis = page.evaluate("[...document.querySelectorAll('#left-body [data-sym]')].filter((e) => !e.hidden).map((e) => e.dataset.sym)")
    check("Suche filtert die Kacheln", len(vis) >= 1 and all("RCBO" in v or "FILS" in v for v in vis), vis)
    page.keyboard.press("Enter"); page.wait_for_timeout(80)
    pr = page.evaluate("document.querySelector('#left-body [data-sym][aria-pressed=true]')?.dataset.sym"); check("Enter setzt den ersten Treffer", pr == vis[0], (pr, vis, page.input_value("#sym-find")))
    page.focus("#sym-find"); page.keyboard.press("Escape"); page.keyboard.press("Escape")
    check("Esc leert die Suche", page.input_value("#sym-find") == "" and page.locator("#left-body [data-sym][hidden]").count() == 0)

    # ---------- B8: Sprünge zu ★-Blättern ----------
    act = page.evaluate("window.__schemacad.active"); page.keyboard.press("m"); page.wait_for_timeout(80)
    check("M markiert, Knopf ★ in der Blattleiste", page.locator("#sheet-star").count() == 1)
    page.keyboard.press("PageUp"); page.keyboard.press("PageUp"); page.wait_for_timeout(80)
    page.click("#sheet-star"); page.wait_for_timeout(100)
    check("Klick auf ★ springt zum markierten Blatt", page.evaluate("window.__schemacad.active") == act)
    page.keyboard.press("PageDown"); page.keyboard.press("Shift+PageDown"); page.wait_for_timeout(100)
    check("⇧Bild ab springt zum markierten Blatt", page.evaluate("window.__schemacad.active") == act)
    page.click("#sheet-star", button="right"); page.wait_for_timeout(80)
    check("Rechtsklick auf ★: Liste der markierten Blätter", page.is_visible("#hold-menu") and page.locator('#hold-menu [data-hact^="go:"]').count() == 1)
    page.keyboard.press("Escape")

    # ---------- C9: Leitung vom mehrpoligen Gerät = Bündel, am Fang nichts automatisch ----------
    page.click('[data-addsheet]'); page.wait_for_timeout(100)
    page.click('[data-sym="LS_3P"]'); click(150, 150); page.keyboard.press("Escape")
    dev = [i for i in items("symbol") if i["sym"] == "LS_3P"][0]
    page.keyboard.press("l"); page.select_option("#right [data-newbundle]", "1"); page.wait_for_timeout(50)
    n0 = len(items("wire"))
    click(dev["x"], 100); click(dev["x"], dev["y"] - 20); page.keyboard.press("Enter"); page.wait_for_timeout(80)
    nw = items("wire")[n0:]
    check("Einzelne Leitung endet am Gerät: bleibt ein Leiter", len(nw) == 1 and "bundle" not in nw[0], nw)
    n0 = len(items("wire"))
    click(dev["x"] + 5, dev["y"]); click(dev["x"] + 5, 130); page.keyboard.press("Enter"); page.wait_for_timeout(80)
    nw = items("wire")[n0:]
    check("Start am 3-poligen Gerät: 3 Leiter, auch beim Klick auf den mittleren Pol", len(nw) == 3 and len({w.get("bundle") for w in nw}) == 1 and sorted(w["pts"][0][0] for w in nw) == [dev["x"], dev["x"] + 5, dev["x"] + 10], [w["pts"] for w in nw])
    n0 = len(items("wire"))
    X, Y = pt(dev["x"] + 10, dev["y"]); page.mouse.move(X, Y); page.keyboard.down("Alt"); page.mouse.click(X, Y); page.keyboard.up("Alt")
    click(dev["x"] + 10, 175); page.keyboard.press("Enter"); page.wait_for_timeout(80)
    check("Alt: nur ein Leiter vom Gerät", len(items("wire")) - n0 == 1)
    page.keyboard.press("Meta+z"); page.keyboard.press("Meta+z"); page.keyboard.press("Meta+z"); page.wait_for_timeout(80)

    # ---------- C10: Alt beim Ziehen, Suchfenster ----------
    page.keyboard.press("Escape"); page.keyboard.press("v")
    X, Y = pt(dev["x"] + 5, dev["y"] - 10); page.mouse.move(X, Y); page.mouse.down()
    page.mouse.move(X + 20, Y, steps=4); page.keyboard.down("Alt"); page.mouse.move(*pt(dev["x"] + 5 + 3.3, dev["y"] - 10), steps=3); page.mouse.up(); page.keyboard.up("Alt"); page.wait_for_timeout(80)
    d2 = [i for i in items("symbol") if i["id"] == dev["id"]][0]
    check("Alt beim Ziehen: frei neben dem Raster", abs(d2["x"] - dev["x"] - 3.3) < 0.3 and abs(round(d2["x"] / 2.5) * 2.5 - d2["x"]) > 0.2, d2["x"])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(60)
    page.keyboard.press("Meta+f"); page.wait_for_timeout(80)
    check("Suchfenster mit Schliessen und Weiter", page.locator('.searchbox [data-s="close"]').count() == 1 and page.locator('.searchbox [data-s="next"]').inner_text() == "Weiter")
    page.click('.searchbox [data-s="close"]'); page.wait_for_timeout(50)
    check("Schliessen schliesst", page.locator(".searchbox").count() == 0)

    # ---------- C11: Steuerung als Kasten mit freien Klemmen ----------
    page.click('[data-sym="CTRL"]'); click(200, 120); page.keyboard.press("Escape")
    ct = items("ctrl")
    check("Steuerkasten gesetzt", len(ct) == 1 and ct[0]["x"] == 200 and ct[0]["y"] == 120, ct)
    page.keyboard.press("v"); click(201, 110)
    check("Steuerkasten gewählt, rechts Klemmen oben und unten", page.locator('#right [data-ctrl="top"]').count() == 1)
    page.fill('#right [data-ctrl="top"]', "L, N, KNX+, KNX-"); page.fill('#right [data-ctrl="name"]', "KNX Schaltaktor"); page.wait_for_timeout(80)
    ct = items("ctrl")[0]
    check("Klemmen frei eingetragen, im Schema sichtbar", ct["top"] == "L, N, KNX+, KNX-" and ">KNX-<" in page.inner_html("#svg") and ">KNX Schaltaktor<" in page.inner_html("#svg"))
    page.keyboard.press("Escape"); page.keyboard.press("l"); n0 = len(items("wire"))
    click(215, 120); click(215, 160); page.keyboard.press("Enter"); page.wait_for_timeout(80)
    nw = items("wire")[n0:]
    check("Leitung rastet an der Klemme KNX+ ein", len(nw) == 1 and nw[0]["pts"][0] == [215, 120], nw)
    page.keyboard.press("Escape"); page.keyboard.press("v"); click(201, 110)
    X, Y = pt(201, 110); page.mouse.move(X, Y); page.mouse.down(); page.mouse.move(*pt(211, 110), steps=4); page.mouse.up(); page.wait_for_timeout(80)
    check("Leitung folgt dem verschobenen Kasten", [w for w in items("wire") if w["id"] == nw[0]["id"]][0]["pts"][0] == [225, 120])

    # ---------- C12: Autoverkabelung Alt+V ----------
    page.keyboard.press("Escape"); page.keyboard.press("Escape")
    page.click('[data-sym="LS_4P"]'); click(60, 150); n0 = len(items("wire"))
    page.keyboard.press("Alt+v"); page.wait_for_timeout(100)
    ls4 = [i for i in items("symbol") if i["sym"] == "LS_4P"][0]; nw = items("wire")[n0:]
    check("Alt+V nach dem Setzen: 4 Leitungen von L1 bis N, 4 zu den Klemmen", len(nw) == 8 and sorted(w["pts"][0][1] for w in nw[:4]) == [175, 180, 185, 190] and all(w["pts"][-1][1] == 45 for w in nw[4:]), [w["pts"] for w in nw])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(60)
    check("Ein Rückgängig-Schritt", len(items("wire")) == n0)
    page.keyboard.press("Escape"); page.keyboard.press("v"); click(ls4["x"] + 7.5, ls4["y"] - 10)
    page.click('#right [data-act="autowire"]'); page.wait_for_timeout(80)
    check("Knopf Autoverkabelung beim gewählten Gerät", len(items("wire")) == n0 + 8)

    check("keine Fehler im Browser", not errors, errors)
    b.close()
print("FEHLER:" if fails else "Alle Prüfungen bestanden.", ", ".join(fails))
sys.exit(1 if fails else 0)
