# UI-Test Modul «Plan», Spiegeln (CJ 28.10.2026, Taste S): beim Setzen für die nächsten Symbole, an der Auswahl (Mehrfachwahl gemischt → alle
# gespiegelt, alle gespiegelt → normal), Feld «gespiegelt», Rückgängig, Symbol an Symbol übernimmt nur die Drehung, Speichern/Laden, Dateiversion 33.
# Bild der gespiegelten Schalter (links gespiegelt, rechts normal). Vorher: node build.mjs elplexa. Aufruf: python3 test/plan_spiegeln_tests.py [Ausgabeordner]
import sys, tempfile, json
from pathlib import Path
from playwright.sync_api import sync_playwright
from elstart import projektansicht

def plsym(page, k):  # Symbolgruppen sind zu (CJ 26.10.2026): Gruppe aufklappen, dann Symbol wählen
    page.evaluate("k => document.querySelector(`[data-plsym='${k}']`).closest('section').querySelector('[data-plgrp][aria-expanded=false]')?.click()", k)
    page.click(f'[data-plsym="{k}"]')
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="plan_spiegeln_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 900}, accept_downloads=True); page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; delete window.showDirectoryPicker;")
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(400); projektansicht(page)
    M = lambda: page.evaluate("window.__schemacad.model")
    sel = lambda: page.evaluate("[...window.__schemacad.sel]")
    syms = lambda: [x for x in M()["items"] if x["type"] == "sym"]
    def key(k): page.evaluate("([k]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))", [k]); page.wait_for_timeout(60)
    def at(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.locator("#svg").bounding_box()
        return r["x"] + v["x"] + x * v["z"], r["y"] + v["y"] + (210 - y) * v["z"]
    def click(x, y, mod=None):
        page.evaluate("document.querySelectorAll('#toasts .toast').forEach((e) => e.remove())") # Meldungen der Taste S lägen sonst über dem Plan
        if mod: page.keyboard.down(mod)
        page.mouse.click(*at(x, y)); page.wait_for_timeout(80)
        if mod: page.keyboard.up(mod)
    def blur(): page.evaluate("document.activeElement?.blur()")

    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('[data-elnew="plan"]'); page.wait_for_timeout(300)
    # Wand unten (Innenfläche y 225)
    key("w"); page.keyboard.down("Alt"); click(75, 75); page.keyboard.up("Alt"); page.keyboard.type("8000"); page.keyboard.press("Enter"); page.wait_for_timeout(100); key("Escape"); key("Escape")
    key("v"); key("f"); page.wait_for_timeout(150) # einpassen: Wand füllt das Bild, Klicks genau genug

    # ---------- beim Setzen ----------
    plsym(page, "SCH0"); key("s")
    check("S beim Setzen: Haken «gespiegelt», Hinweis, Meldung", page.is_checked('[data-plo="m"]') and "S spiegelt" in page.inner_text("#hint") and "Gespiegelt für die nächsten" in page.inner_text("body"))
    check("Vorschau gespiegelt (Hebel nach links)", 'x2="-3.7"' in page.inner_html("#overlay"))
    click(1000, 300)
    s1 = syms()[-1]
    check("gesetzt: gespiegelt, an der Wand", s1.get("m") is True and s1["at"][1] == 225 and s1["r"] == 0, s1)
    check("Zeichnung: Hebel nach links", 'x2="-3.7"' in page.inner_html("#items"))
    key("s"); check("S noch einmal: nicht mehr gespiegelt", not page.is_checked('[data-plo="m"]'))
    click(1170, 300)
    s2 = syms()[-1]
    check("Symbol an Symbol: Drehung vom Nachbarn, Spiegeln nicht", "m" not in s2 and s2["r"] == s1["r"] and abs(s2["at"][0] - 1150) < 1 and s2["at"][1] == 225, s2)
    click(2500, 300); s3 = syms()[-1]  # dritter, weit weg (normal)
    key("Escape"); key("v")

    # ---------- an der Auswahl ----------
    click(870, 335); check("ersten gewählt: Feld «gespiegelt» an", sel() == [s1["id"]] and page.is_checked('[data-plf="m"]'), sel())
    key("s"); check("S an der Auswahl: normal", "m" not in syms()[0])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80); check("Rückgängig: wieder gespiegelt", syms()[0].get("m") is True)
    click(2500, 335, "Meta"); check("Mehrfachwahl: zwei", sorted(sel()) == sorted([s1["id"], s3["id"]]), sel())
    key("s"); check("gemischt → alle gespiegelt", [s.get("m") for s in syms()] == [True, None, True])
    key("s"); check("alle gespiegelt → alle normal", all("m" not in s for s in syms()))
    key("Escape"); click(2500, 335); page.check('[data-plf="m"]'); page.wait_for_timeout(100)
    check("Feld «gespiegelt» setzt m", syms()[2].get("m") is True)
    key("Escape")

    # ---------- Bild: Schalter an der Wand, links gespiegelt, rechts normal ----------
    for n, k in enumerate(["SCH0", "SCH0_2", "SCH3", "SCH6", "TASTER", "DIMMER", "STOREN", "SCH_LAMPE"]):
        x = 3500 + n * 500
        plsym(page, k)
        if not page.is_checked('[data-plo="m"]'): key("s")
        click(x, 300); key("s"); click(x + 180, 300)
    key("Escape"); key("v"); key("Escape")
    page.evaluate("window.__schemacad.view.z")
    page.mouse.move(*at(5350, 330)); page.keyboard.down("Control")
    page.mouse.wheel(0, -90); page.wait_for_timeout(60)
    page.keyboard.up("Control"); page.wait_for_timeout(100)
    r = page.locator("#svg").bounding_box(); cx, cy = at(5340, 330); page.mouse.wheel(cx - r["x"] - r["width"] / 2, cy - r["y"] - r["height"] / 2); page.wait_for_timeout(150) # Schalter in die Mitte
    x0, y0 = at(3300, 700); x1, y1 = at(7350, 150)
    page.screenshot(path=str(OUT / "plan_spiegeln.png"), clip={"x": max(0, x0), "y": max(0, y0), "width": x1 - max(0, x0), "height": y1 - max(0, y0)})
    ms = [s for s in syms() if s["at"][0] >= 3400]
    check("Bild: 16 Schalter, je einer gespiegelt", len(ms) == 16 and sum(1 for s in ms if s.get("m")) == 8, [(s["key"], s.get("m")) for s in ms])

    # ---------- Speichern / Laden ----------
    d = page.evaluate("window.__schemacad.doc"); check("Datei: Version 33", d["version"] == 33, d["version"])
    blur()
    with page.expect_download() as dl: page.keyboard.press("Shift+Meta+s")
    out = OUT / "plan_spiegeln.elplexa.json"; dl.value.save_as(str(out)); page.wait_for_timeout(300)
    raw = json.loads(out.read_text())
    pl = next(s for s in raw["sheets"] if s.get("kind") == "plan")
    check("Gespeichert: Version 33, m nur an gespiegelten", raw["version"] == 33 and sum(1 for i in pl["items"] if i.get("m") is True) == 9 and all(i.get("m") in (True, None) for i in pl["items"]))
    blur()
    with page.expect_file_chooser() as fc:
        page.keyboard.press("Meta+o"); page.wait_for_timeout(300)
        if page.is_visible(".modal"): page.click('.modal :text("Trotzdem öffnen")')
    fc.value.set_files(str(out)); page.wait_for_timeout(600)
    pl2 = next(s for s in page.evaluate("window.__schemacad.doc")["sheets"] if s.get("kind") == "plan")
    check("Laden: Spiegeln bleibt", [i.get("m") for i in pl2["items"]] == [i.get("m") for i in pl["items"]])
    b.close()

check("keine Fehler in der Konsole", not errors, errors[:5])
print(f"\nBild: {OUT}")
if fails: print(f"{len(fails)} Fehler"); sys.exit(1)
print("Alle Spiegel-Tests grün.")
