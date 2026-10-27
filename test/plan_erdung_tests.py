# UI-Test Modul «Plan», Erdung und Blitzschutz (CJ 27.10.2026, Aufgaben Plan 20): Gruppen Erdung/PA und Blitzschutz in der Symbolleiste, Suche,
# HAK rastet an der Wand ein (Grösse in mm), Fang an der PA-Schiene, Drehen mit R, Erdleitungen als Verlegeart (Fundamenterder, Erdleiter,
# Blitzschutzleitung dick), Stückliste (CSV), Dateiversion 32. Vorher: node build.mjs elplexa. Aufruf: python3 test/plan_erdung_tests.py [Ausgabeordner]
import sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from elstart import projektansicht

def plsym(page, k):  # Symbolgruppen sind zu (CJ 26.10.2026): Gruppe aufklappen, dann Symbol wählen
    page.evaluate("k => document.querySelector(`[data-plsym='${k}']`).closest('section').querySelector('[data-plgrp][aria-expanded=false]')?.click()", k)
    page.click(f'[data-plsym="{k}"]')
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="plan_erdung_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
FREE = ["ERDE", "PA", "ERDE_ANS", "ERDE_KK", "SCHUTZERDE", "ERDBAND", "PA_SCHIENE", "ERDER", "TIEFENERDER", "MESSTRENN", "VERB_ANS",
        "SPD", "FUNKEN", "DEHNBOGEN", "FLEXVERB", "VERB_AUF", "VERB_AB", "VERB_DURCH"]
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 900}, accept_downloads=True); page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(400); projektansicht(page)
    M = lambda: page.evaluate("window.__schemacad.model")
    of = lambda t: [x for x in M()["items"] if x["type"] == t]
    def key(k): page.evaluate("([k]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))", [k]); page.wait_for_timeout(60)
    def at(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.locator("#svg").bounding_box()
        return r["x"] + v["x"] + x * v["z"], r["y"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): page.mouse.click(*at(x, y)); page.wait_for_timeout(80)
    def move(x, y): page.mouse.move(*at(x, y)); page.wait_for_timeout(60)
    pins = lambda: page.locator('#overlay path[stroke="#f4c400"]').count()

    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('[data-elnew="plan"]'); page.wait_for_timeout(300)
    body = page.inner_text("#left-body")
    check("Symbolleiste: Gruppen Erdung/PA und Blitzschutz", "Erdung/PA" in body and "Blitzschutz" in body, body[-300:])
    page.evaluate("document.activeElement?.blur()"); key("/"); page.keyboard.type("Potenzial"); page.wait_for_timeout(50)
    check("Suche «Potenzial»: PA und PA-Schiene", page.is_visible('[data-plsym="PA"]') and page.is_visible('[data-plsym="PA_SCHIENE"]') and not page.is_visible('[data-plsym="ERDE"]'))
    page.keyboard.press("Escape"); page.wait_for_timeout(50)

    # Wand unten (Innenfläche y 225), HAK an der Wand, übrige frei
    key("w"); page.keyboard.down("Alt"); click(75, 75); page.keyboard.up("Alt"); page.keyboard.type("8000"); page.keyboard.press("Enter"); page.wait_for_timeout(100); key("Escape"); key("Escape")
    plsym(page, "HAK"); click(1000, 300)
    for n, k in enumerate(FREE): plsym(page, k); click(600 + (n % 6) * 1200, 1500 + (n // 6) * 1200)
    key("Escape"); key("v")
    sy = {i["key"]: i for i in of("sym")}
    check("alle 19 Symbole gesetzt", sorted(sy) == sorted(FREE + ["HAK"]), sorted(sy))
    check("HAK rastet an der Wand ein, Grösse 400 × 150 nicht gespeichert", sy["HAK"]["at"][1] == 225 and sy["HAK"]["r"] == 0 and "w" not in sy["HAK"], sy["HAK"])
    page.mouse.click(*at(1000, 300)); page.wait_for_timeout(80)
    check("HAK gewählt: Breite und Tiefe in mm", page.locator('[data-plf="vw"]').count() == 1 and page.input_value('[data-plf="vw"]') == "400")
    # Fang: PA-Schiene auf allen Seiten (wie Abzweigdose)
    page.mouse.click(*at(-2000, -2000)); key("l"); ps = sy["PA_SCHIENE"]["at"]; move(ps[0] + 60, ps[1] + 70)
    check("Leitung nah an der PA-Schiene: Fang am Rand", pins() >= 1, pins())
    key("Escape"); key("Escape"); key("v")
    sp = sy["SPD"]; click(sp["at"][0], sp["at"][1]); key("r")
    check("R dreht den Überspannungsableiter", next(i for i in of("sym") if i["key"] == "SPD")["r"] == 90)

    # Erdleitungen: Verlegeart wählen, je eine Leitung
    page.mouse.click(*at(-2000, -2000))
    for n, kind in enumerate(["fund", "erdl", "blitz"]):
        key("l"); page.select_option('[data-plo="lkind"]', kind); page.select_option('[data-plo="lcurve"]', "0")
        click(600, 6000 + n * 600); click(6000, 6000 + n * 600); key("Enter")
    ls = of("line")
    check("drei Erdleitungen mit Verlegeart", [l["kind"] for l in ls] == ["fund", "erdl", "blitz"], [l.get("kind") for l in ls])
    items = page.inner_html("#items")
    check("Darstellung: Fundamenterder Strich-Punkt-Punkt, Blitzschutzleitung dick (0,7 mm × 50)", 'stroke-dasharray="200 40 12.5 40 12.5 40"' in items and 'stroke-width="35"' in items, items[-600:])
    key("Escape"); key("v"); key("f"); page.wait_for_timeout(150)
    page.screenshot(path=str(OUT / "plan_erdung.png"))

    # Stückliste CSV: neue Gruppen
    page.click("#btn-pvdruck"); page.wait_for_timeout(200)
    with page.expect_download() as dl: page.click('[data-plact="bomcsv"]')
    csv = Path(dl.value.path()).read_text(encoding="utf-8")
    check("CSV: Gruppen Erdung/PA und Blitzschutz", "Erdung/PA;Potenzialausgleichsschiene (HPAS);1" in csv and "Erdung/PA;Hausanschlusskasten (HAK);1" in csv and "Blitzschutz;Überspannungsableiter (SPD);1" in csv, csv)
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    d = page.evaluate("window.__schemacad.doc")
    check("Datei: Version 32 mit Erdungssymbolen", d["version"] == 32, d["version"])
    b.close()

check("keine Fehler in der Konsole", not errors, errors[:5])
print(f"\nBild: {OUT}")
if fails: print(f"{len(fails)} Fehler"); sys.exit(1)
print("Alle Erdungssymbol-Tests grün.")
