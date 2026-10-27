# UI-Test Modul «Plan», Symbolleiste (CJ 26.10.2026): Taste A Aufputz/Unterputz (beim Setzen, am gewählten Symbol, Mehrfachwahl),
# Darstellung halb gefüllt, Stückliste getrennt UP/AP. Vorher: node build.mjs elplexa. Aufruf: python3 test/plan_leiste_tests.py [Ausgabeordner]
# (legt plan_ap.png ab).
import sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

def plsym(page, k):  # Symbolgruppen sind zu: Gruppe aufklappen, dann Symbol wählen
    page.evaluate("k => document.querySelector(`[data-plsym='${k}']`).closest('section').querySelector('[data-plgrp][aria-expanded=false]')?.click()", k)
    page.click(f'[data-plsym="{k}"]')
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="plan_leiste_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 900}); page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(400)
    M = lambda: page.evaluate("window.__schemacad.model")
    of = lambda t: [x for x in M()["items"] if x["type"] == t]
    item = lambda i: next(x for x in M()["items"] if x["id"] == i)
    sel = lambda: page.evaluate("[...window.__schemacad.sel]")
    def key(k): page.evaluate("([k]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))", [k]); page.wait_for_timeout(60)
    def at(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.locator("#svg").bounding_box()
        return r["x"] + v["x"] + x * v["z"], r["y"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): page.mouse.click(*at(x, y)); page.wait_for_timeout(80)

    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('[data-elnew="plan"]'); page.wait_for_timeout(300)
    check("A ist im Plan sonst nicht belegt: ohne Auswahl keine Änderung", (key("a"), M()["items"])[1] == [])

    # ---------- Taste A: beim Setzen für die nächsten Symbole ----------
    keys = ["SCH0", "SCH3", "SCH6", "TASTER", "DIMMER", "STOREN", "STD", "STD2", "STD3", "STD_T15", "STD_USB", "KOMBI"]
    plsym(page, "SCH0"); key("a")
    check("A beim Setzen: Haken Aufputz rechts, Hinweis AP", page.is_checked('[data-plo="ap"]') and " AP." in page.inner_text("#hint"), page.inner_text("#hint"))
    page.mouse.move(*at(1000, 1000)); page.wait_for_timeout(80)
    check("Vorschau halb gefüllt", page.evaluate("document.querySelectorAll('#overlay path[fill]:not([fill=none])').length") > 0)
    for i, k in enumerate(keys):
        plsym(page, k); click(400 + (i % 6) * 600, 2000 - (i // 6) * 800)
    ys = of("sym")
    check("Alle Schalter und Steckdosen AP gesetzt", len(ys) == len(keys) and all(y.get("ap") is True for y in ys), [(y["key"], y.get("ap")) for y in ys])
    plsym(page, "LEUCHTE"); click(2000, 3000)
    check("Leuchte (ohne AP-Variante): ap fällt weg", "ap" not in of("sym")[-1])
    plsym(page, "STD"); key("a"); click(3800, 3000)
    check("A nochmals: nächstes Symbol UP", "ap" not in of("sym")[-1] and not page.is_checked('[data-plo="ap"]'))
    key("Escape"); key("v")
    page.mouse.click(*at(-2000, -2000)); key("f"); page.wait_for_timeout(150)

    # Darstellung: je AP-Symbol ein gefülltes Teil mehr als UP
    filled = lambda: page.evaluate("[...document.querySelectorAll('#items .pl-items path')].filter((e) => e.getAttribute('fill') && e.getAttribute('fill') !== 'none').length")
    n_ap = filled()

    # ---------- Taste A am gewählten Symbol und bei Mehrfachwahl ----------
    first = ys[0]["id"]; sw = item(first)
    click(sw["at"][0], sw["at"][1] + 110)
    check("Schalter gewählt", page.evaluate("window.__schemacad.sel") == [first], page.evaluate("window.__schemacad.sel"))
    key("a")
    check("A am gewählten Schalter: UP", "ap" not in item(first), item(first))
    check("Darstellung: ein gefülltes Teil weniger", filled() == n_ap - 1, (filled(), n_ap))
    key("a"); check("A nochmals: wieder AP", item(first).get("ap") is True)
    page.keyboard.press("Meta+a"); page.wait_for_timeout(80); key("a")
    check("Mehrfachwahl gemischt (letzte Steckdose UP): A setzt alle mit Variante auf AP, Leuchte ohne", all(y.get("ap") is True for y in of("sym") if y["key"] != "LEUCHTE") and "ap" not in next(y for y in of("sym") if y["key"] == "LEUCHTE"))
    key("a"); check("A nochmals: alle UP", all("ap" not in y for y in of("sym")), [(y["key"], y.get("ap")) for y in of("sym")])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("Rückgängig: wieder alle AP", all(y.get("ap") is True for y in of("sym") if y["key"] != "LEUCHTE"))
    last = of("sym")[-1]; key("Escape"); click(last["at"][0], last["at"][1] + 100); key("a")  # letzte Steckdose wieder UP
    check("Letzte Steckdose allein gewählt und UP", page.evaluate("window.__schemacad.sel") == [last["id"]] and "ap" not in item(last["id"]) and item(first).get("ap") is True)

    # ---------- Stückliste getrennt UP/AP (Druck) ----------
    page.evaluate("""window.__open = []; window.open = (u) => { window.__open.push(u); return {}; }; window.__pr = '';
      new MutationObserver(() => { const h = document.querySelector('#printroot').innerHTML; if (h) window.__pr = h; }).observe(document.querySelector('#printroot'), { childList: true }); 0""")
    key("0"); page.wait_for_timeout(200); page.click("#el-tile-plan [data-elpdf]")
    page.wait_for_function("window.__open.length > 0", timeout=60000)
    bom = page.evaluate("[...new DOMParser().parseFromString(window.__pr, 'text/html').querySelectorAll('svg')].at(-1).textContent")
    check("Stückliste: Steckdose T13 getrennt UP und AP", "Steckdose T13 (Schutzkontakt), UP" in bom and "Steckdose T13 (Schutzkontakt), AP" in bom and "Schalter Sch. 0, 1-polig, AP" in bom and "Leuchte an Decke" in bom and "Leuchte an Decke, " not in bom, bom[:400])
    page.click("#el-tile-plan"); page.wait_for_timeout(300)
    key("Escape"); key("f"); page.mouse.move(5, 5); page.evaluate("document.querySelector('#toasts').innerHTML = ''"); page.wait_for_timeout(150)
    page.locator("#stage").screenshot(path=str(OUT / "plan_ap.png"))
    print("Bild:", OUT / "plan_ap.png")
    page.close()

    # ---------- Verweis: Suche, Farbe vor dem Setzen, Zeilen, Kasten frei ziehen ----------
    page = b.new_page(viewport={"width": 1400, "height": 900}); page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(400)
    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('[data-elnew="plan"]'); page.wait_for_timeout(300)
    key("w"); page.keyboard.down("Alt"); click(0, 0); page.keyboard.up("Alt"); page.keyboard.type("4000"); page.keyboard.press("Enter"); page.wait_for_timeout(100); key("Escape"); key("Escape")
    plsym(page, "STD"); click(1000, 100); plsym(page, "STD2"); click(2200, 100); plsym(page, "DOSE"); click(3300, 900); key("Escape"); key("v")
    page.evaluate("document.activeElement?.blur()"); key("/"); page.keyboard.type("Verweis"); page.wait_for_timeout(60)
    vis = page.evaluate("[...document.querySelectorAll('[data-plsym]')].filter((e) => e.offsetParent).map((e) => e.dataset.plsym)")
    check("Suche «Verweis» findet nur den Verweis (Gruppe Allgemein)", vis == ["VERWEIS"] and page.locator('[data-plsym="VERWEIS"]').evaluate("e => e.closest('section').textContent").startswith("▸Allgemein"), vis)
    page.keyboard.press("Enter"); page.wait_for_timeout(80)
    check("Enter wählt den Verweis zum Setzen, Farbfelder rechts", page.locator("[data-plnewcol]").count() == 9 and "Verweis" in page.inner_text("#hint"))
    def verweis(x, y, col, rows, box):
        plsym(page, "VERWEIS")
        if col: page.click(f'[data-plnewcol="{col}"]'); page.wait_for_timeout(50)
        click(x, y); i = of("sym")[-1]["id"]
        ok = (page.evaluate("document.activeElement.dataset.plf"), page.evaluate("window.__schemacad.sel"), i)
        for k, v in zip(["fu", "nr"], rows): page.fill(f'[data-plf="{k}"]', v); page.press(f'[data-plf="{k}"]', "Enter"); page.wait_for_timeout(50)
        t = page.evaluate(f"(() => {{ const r = [...document.querySelectorAll('#items text')].filter((x) => x.textContent === {rows[0]!r}).at(-1).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }})()")
        page.mouse.move(*t); page.mouse.down(); page.mouse.move(*at(*box), steps=6); page.mouse.up(); page.wait_for_timeout(80)
        return i, ok
    key("Escape"); key("v"); key("f"); page.wait_for_timeout(100)
    v1, ok1 = verweis(1000, 230, "#0068c9", ["UV EG", "11X4"], (600, 1100))
    v2, ok2 = verweis(2200, 230, None, ["UV EG", "11X6"], (2000, 1300))
    v3, ok3 = verweis(3300, 900, "#d4141c", ["HZV WHG EG"], (3300, 1700))
    check("Nach dem Setzen gewählt, Zeile 1 im Fokus", all(o[0] == "fu" and o[1] == [o[2]] for o in (ok1, ok2, ok3)), (ok1, ok2, ok3))
    V = [item(v) for v in (v1, v2, v3)]
    check("Verweise: zwei blau (Vorgabe, ohne Feld col), einer rot", "col" not in V[0] and "col" not in V[1] and V[2].get("col") == "#d4141c", V)
    check("Zeilen gespeichert", [v.get("fu") for v in V] == ["UV EG", "UV EG", "HZV WHG EG"] and V[1].get("nr") == "11X6" and "nr" not in V[2])
    check("Kasten frei gezogen (Versatz lo), Ziel bleibt", all(v.get("lo") for v in V) and [v["at"] for v in V] == [[1000, 230], [2200, 230], [3300, 900]], [v.get("lo") for v in V])
    red = page.evaluate("[...document.querySelectorAll('#items text')].filter((t) => t.textContent === 'HZV WHG EG').map((t) => t.getAttribute('fill'))")
    check("Roter Verweis: Text rot", red == ["#d4141c"], red)
    key("Escape"); key("f"); page.mouse.move(5, 5); page.evaluate("document.querySelector('#toasts').innerHTML = ''"); page.wait_for_timeout(150)
    page.locator("#stage").screenshot(path=str(OUT / "plan_verweis.png"))

    # ---------- Mehrfachwahl per ⌘-Klick, Shift wählt nicht mehr dazu (CJ 27.10.2026) ----------
    so = [item(v1), item(v3)]  # zwei Verweise weit auseinander
    pick = lambda y: click(*y["at"])
    key("Escape"); pick(so[0])
    page.keyboard.down("Shift"); pick(so[1]); page.keyboard.up("Shift")
    check("Shift-Klick ersetzt die Wahl (kein Dazuwählen)", page.evaluate("window.__schemacad.sel") == [so[1]["id"]], page.evaluate("window.__schemacad.sel"))
    page.keyboard.down("Meta"); pick(so[0]); page.keyboard.up("Meta")
    check("⌘-Klick wählt dazu", sorted(page.evaluate("window.__schemacad.sel")) == sorted(y["id"] for y in so), page.evaluate("window.__schemacad.sel"))
    page.keyboard.down("Meta"); pick(so[1]); page.keyboard.up("Meta")
    check("⌘-Klick nimmt wieder weg", page.evaluate("window.__schemacad.sel") == [so[0]["id"]], page.evaluate("window.__schemacad.sel"))
    page.keyboard.down("Control"); pick(so[1]); page.keyboard.up("Control")
    check("Ctrl-Klick wie ⌘ (Windows)", len(page.evaluate("window.__schemacad.sel")) == 2)
    check("Knopf Mehrfachwahl zeigt ⌘", "⌘" in page.inner_text('[data-plact="multi"]') and "⌘-Klick" in page.inner_text("#hint"), page.inner_text("#hint"))
    print("Bild:", OUT / "plan_verweis.png")
    check("keine Fehler in der Konsole", not errors, errors)
    b.close()
if fails: print(f"{len(fails)} FAIL"); sys.exit(1)
print("plan_leiste_tests: alles ok")
