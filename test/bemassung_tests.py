# UI-Tests Zählerplatte bestücken, Bemassung einstellbar, Werkzeug Bemassung (16.10.2026). Headless-Chromium.
# Aufruf aus web-src: python3 test/bemassung_tests.py [Ausgabeordner] [Beleg Zählerplatte.png] [Beleg UV.png]
import json, subprocess, sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="bemassung_"))
SHOT_Z = Path(sys.argv[2]) if len(sys.argv) > 2 else OUT / "zaehlerplatte.png"
SHOT_UV = Path(sys.argv[3]) if len(sys.argv) > 3 else OUT / "baergen_uv.png"
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
uv = OUT / "Baergen UV.schemacad.json"
subprocess.run(["node", str(ROOT / "test" / "baergen_uv.mjs"), str(uv)], check=True, cwd=ROOT)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(URL); page.wait_for_timeout(300)
    page.click('[data-start="schema"]')
    def pt(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.evaluate("(()=>{const r=document.querySelector('#svg').getBoundingClientRect();return {l:r.left,t:r.top}})()")
        return r["l"] + v["x"] + x * v["z"], r["t"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): X, Y = pt(x, y); page.mouse.move(X, Y); page.mouse.click(X, Y); page.wait_for_timeout(60)
    M = lambda: page.evaluate("window.__schemacad.model")
    parts = lambda k: [i for i in M()["items"] if i["type"] == "part" and i["kind"] == k]
    def setnum(sel, v): page.fill(sel, v); page.press(sel, "Enter"); page.wait_for_timeout(80)
    page.click("#sheet-add", button="right"); page.click('[data-new="dispo"]'); page.wait_for_timeout(150)

    # ---------- Zählerplatte bestücken ----------
    for s in ["ZBOX", "RSE", "ZFE", "ZKL", "PKZ", "SPF"]:
        check("Palette Zählerplatte hat " + s, page.locator(f'[data-sym="D:PART:{s}"]').count() == 1)
    for x in (0, 260, 520):
        page.click('[data-sym="D:PLATE:zaehler"]'); click(x, 0)
    page.keyboard.press("Escape"); page.keyboard.press("f"); page.wait_for_timeout(150)
    pl = [i for i in M()["items"] if i["type"] == "plate"]
    check("drei Zählerplatten", len(pl) == 3 and all(i.get("fixed") for i in pl))
    click(0, 200); page.click('[data-act="dpzaehler"]'); page.wait_for_timeout(100)
    z, kl = parts("ZBOX"), parts("ZKL")
    check("Zähler einsetzen: Kasten 170 × 195 und Klemmenreihe auf der Platte", len(z) == 1 and len(kl) == 1 and 0 < z[0]["x"] and z[0]["x"] + z[0]["w"] < 250 and kl[0]["y"] < z[0]["y"], (z, kl))
    click(z[0]["x"] + 85, z[0]["y"] + 100)
    [page.fill(f'input[data-dp="ln:{i}"]', t) for i, t in enumerate(["Zähler", "Gewerbe", "H5.EG.11", "EG"])]; page.fill('input[data-dp="bmk"]', "122F1"); page.wait_for_timeout(80)
    txt = lambda: page.evaluate("[...document.querySelectorAll('#items text')].map(t=>t.textContent)")
    check("Zähler mit mehrzeiligem Text und BMK darunter", parts("ZBOX")[0].get("bmk") == "122F1" and all(s in txt() for s in ["Gewerbe", "H5.EG.11", "EG", "122F1"]))
    page.keyboard.press("Escape")
    click(260, 200); page.click('[data-act="dpmessung"]'); page.wait_for_timeout(100)
    pk, sp = parts("PKZ"), parts("SPF")
    check("Messung einsetzen: Prüfklemme und Sicherungen Spannungspfad", len(pk) == 1 and len(sp) == 1 and 260 < pk[0]["x"] < 510)
    click(pk[0]["x"] + 100, pk[0]["y"] + 35); page.fill('input[data-dp="bmk"]', "115X1")
    page.keyboard.press("Escape")
    # frei verschieben: Prüfklemme 15 mm nach rechts und 10 mm nach unten ziehen (kein Raster auf einer Schiene)
    x0, y0 = pk[0]["x"], pk[0]["y"]
    X, Y = pt(x0 + 100, y0 + 35); page.mouse.move(X, Y); page.mouse.down()
    X2, Y2 = pt(x0 + 115, y0 + 25); page.mouse.move(X2, Y2, steps=6); page.mouse.up(); page.wait_for_timeout(80)
    pk = parts("PKZ")[0]
    check("Prüfklemme frei verschiebbar", abs(pk["x"] - x0 - 15) <= 5 and abs(pk["y"] - y0 + 10) <= 5 and pk.get("bmk") == "115X1", pk)
    page.keyboard.press("Escape")
    click(sp[0]["x"] + 70, sp[0]["y"] + 45); page.fill('input[data-dp="bmk"]', "115F2"); page.fill('input[data-dp="n"]', "3"); page.keyboard.press("Escape")
    page.click('[data-sym="D:PART:RSE"]'); click(545, 215); page.keyboard.press("Escape")
    page.click('[data-sym="D:PART:ZFE"]'); click(660, 215); page.keyboard.press("Escape")
    page.click('[data-sym="D:PART:ZKL"]'); click(530, 40); page.keyboard.press("Escape")
    r = parts("KASTEN")
    check("RSE und ZFE als Kasten gesetzt", sorted(i["lines"][0] for i in r) == ["RsE", "ZFE"], r)
    click(r[0]["x"] + 45, r[0]["y"] + 70); page.fill('input[data-dp="bmk"]', "110P1"); page.keyboard.press("Escape")
    click(260, 200); page.keyboard.press("ArrowRight"); page.wait_for_timeout(80)
    check("Platte nimmt ihre Teile mit", parts("SPF")[0]["x"] == sp[0]["x"] + 5, parts("SPF")[0]["x"])
    page.keyboard.press("Meta+z"); page.keyboard.press("Escape"); page.wait_for_timeout(80)

    # ---------- Bemassung kleiner und einstellbar ----------
    fs = lambda s: page.evaluate(f"[...document.querySelectorAll('#items text')].filter(t=>t.textContent==='{s}').map(t=>+t.getAttribute('font-size'))")
    check("Vorgabe Masstext 5 mm im Plan", fs("400") and max(fs("400")) == 5, fs("400"))
    page.click("#btn-ansicht"); page.wait_for_timeout(100)
    check("Fenster Ansicht hat Masstext im Plan und auf dem Schema", page.locator('[data-dpnum="dimH"]').count() == 1 and page.locator('[data-dpnum="dimP"]').count() == 1)
    setnum('[data-dpnum="dimH"]', "3")
    check("Masstext 3 mm übernommen und gezeichnet", M().get("dimH") == 3 and max(fs("400")) == 3, (M().get("dimH"), fs("400")))
    setnum('[data-dpnum="dimP"]', "2")
    check("Masstext auf dem Schema 2 mm", M().get("dimP") == 2)
    page.keyboard.press("Escape"); page.evaluate("document.activeElement.blur()"); page.wait_for_timeout(50)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("Rückgängig: dimP weg", "dimP" not in M() and M().get("dimH") == 3, {k: M().get(k) for k in ("dimP", "dimH")})
    page.keyboard.press("Meta+Shift+z"); page.wait_for_timeout(80)

    # ---------- Werkzeug Bemassung ----------
    page.keyboard.press("b"); page.wait_for_timeout(50)
    check("Taste B wählt das Werkzeug Bemassung", page.locator('[data-tool="dim"][aria-pressed="true"]').count() == 1)
    click(1, 399); click(769, 398); click(400, 450)
    dims = lambda: [i for i in M()["items"] if i["type"] == "dim"]
    d = dims()
    check("Mass über drei Zählerplatten: 770 waagrecht, Ecken gefangen", len(d) == 1 and d[0]["dir"] == "h" and d[0]["dx"] == 770 and (d[0]["x"], d[0]["y"]) == (0, 400) and "770" in txt(), d)
    click(250, 1); click(250, 399); click(255, 200)
    d = dims()
    check("senkrechtes Mass 400 an einer Kante", len(d) == 2 and d[1]["dir"] == "v" and d[1]["dy"] == 400, d[1:] )
    click(10, 10); page.keyboard.press("Escape"); page.wait_for_timeout(50)
    check("Esc bricht das angefangene Mass ab", len(dims()) == 2 and page.locator('[data-tool="dim"][aria-pressed="true"]').count() == 1)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("Rückgängig nimmt das Mass weg", len(dims()) == 1)
    page.keyboard.press("Meta+Shift+z"); page.wait_for_timeout(80)
    check("Wiederholen setzt es wieder", len(dims()) == 2)
    page.keyboard.press("Escape"); page.keyboard.press("v")
    dh = M()["dimH"]
    click(385, 400 + d[0]["off"]); page.wait_for_timeout(50)
    check("gesetztes Mass wählbar", page.evaluate("window.__schemacad.sel") == [d[0]["id"]])
    page.keyboard.press("Delete"); page.wait_for_timeout(80)
    # seit 16.10.2026 steht 770 auch als Gesamtmass der äusseren Kette da (Bau-Chat Dispo)
    check("Entf löscht das gesetzte Mass", len(dims()) == 1 and txt().count("770") == 1)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("Rückgängig bringt es zurück", len(dims()) == 2 and txt().count("770") == 2)
    page.keyboard.press("Escape")

    # automatisches Mass ausblenden: seit Korrektur CJ 16.10.2026 liegen die Plattenbreiten als äussere Teilkette oben (Oberkante 400 + 18 Plattentext + 2,5 × Masstext)
    click(125, 418 + 2.5 * dh); page.wait_for_timeout(80)
    check("Klick wählt das automatische Mass", "Automatisches Mass" in page.inner_text("#right"))
    page.keyboard.press("Delete"); page.wait_for_timeout(80)
    check("Entf blendet es aus (gespeichert)", M().get("dimsOff") == ["ox"], M().get("dimsOff"))
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("Rückgängig blendet es wieder ein", "dimsOff" not in M())
    page.keyboard.press("Meta+Shift+z"); page.wait_for_timeout(80)
    dx = page.evaluate("window.__schemacad.exportDxf()")
    import re
    dt = re.findall(r"\n1\n([^\n]*)\n", dx[dx.index("ENTITIES"):])
    check("DXF ohne ausgeblendete Teilkette (keine Plattenbreiten), mit gesetztem Mass", "770" in dt and dt.count("250") == 0, dt.count("250"))
    page.click("#btn-ansicht"); page.wait_for_timeout(80)
    page.click('[data-act="dpdimson"]'); page.wait_for_timeout(80)
    check("Fenster Ansicht: ausgeblendete Masse einblenden", "dimsOff" not in M())
    page.keyboard.press("Escape")
    doc = page.evaluate("window.__schemacad.doc")
    sh = [s for s in doc["sheets"] if s.get("kind") == "dispo"][0]
    check("Datei enthält Masse und Masstext (Version 9, seit 16.10. mit Textzeilen)", doc["version"] == 9 and sh["dimH"] == 3 and sum(i["type"] == "dim" for i in sh["items"]) == 2)
    page.keyboard.press("f"); page.wait_for_timeout(150)
    page.evaluate("document.querySelectorAll('.toast').forEach(t=>t.remove())"); page.screenshot(path=str(SHOT_Z))

    # PDF und An Schema
    n = page.evaluate("window.__schemacad.buildPrint()")
    html = page.evaluate("document.querySelector('#printroot').innerHTML")
    check("PDF enthält Zähler, BMK und gesetztes Mass", n >= 1 and "H5.EG.11" in html and "115X1" in html and "770" in html)
    page.evaluate("document.querySelector('#printroot').innerHTML = ''")
    page.click("#btn-ansicht"); setnum('[data-dpnum="dimP"]', "2"); page.keyboard.press("Escape")
    page.click("#btn-handover"); page.wait_for_timeout(150)
    page.click("#modal-root button.primary, #modal-root .btn.primary"); page.wait_for_timeout(200)
    v = [i for i in M()["items"] if i["type"] == "dispoview"]
    check("An Schema: Ansicht trägt Masstext 2 mm Papier", len(v) == 1 and v[0].get("dimP") == 2, v and {k: v[0].get(k) for k in ("dimP", "den")})
    hs = page.evaluate("[...document.querySelectorAll('#items text')].filter(t=>t.textContent==='770').map(t=>+t.getAttribute('font-size'))")
    check("Masstext auf dem Schemablatt 2 mm", hs and abs(hs[0] - 2) < 1e-6, hs)

    # Nachzeichnung UV Bärgen mit kleinerer Bemassung
    page.click("#btn-new"); page.wait_for_timeout(100); page.click('[data-start="schema"]')
    if page.locator(".modal").count(): page.click('.modal [data-r="1"]')
    with page.expect_file_chooser() as fc: page.click("#btn-open")
    fc.value.set_files(str(uv)); page.wait_for_timeout(400)
    check("UV Bärgen geöffnet, Bemassung 5 mm", page.evaluate("window.__schemacad.kind") == "dispo" and max(fs("2000")) == 5, fs("2000"))
    page.keyboard.press("f"); page.wait_for_timeout(200)
    page.evaluate("document.querySelectorAll('.toast').forEach(t=>t.remove())"); page.screenshot(path=str(SHOT_UV))
    b.close()
check("keine JS-Fehler", not errors, errors[:3])
print(f"Belege: {SHOT_Z}, {SHOT_UV}")
sys.exit(1 if fails else 0)
