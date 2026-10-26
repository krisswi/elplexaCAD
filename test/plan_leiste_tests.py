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
    check("keine Fehler in der Konsole", not errors, errors)
    b.close()
if fails: print(f"{len(fails)} FAIL"); sys.exit(1)
print("plan_leiste_tests: alles ok")
