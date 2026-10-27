# UI-Test (CJ 27.10.2026, Zweig wunsch/plan-startseite-aderzahl, nur elplexaCAD): Start in der Liste «Projekte», Ziffern nur in der
# Projektansicht (im Schema und im Plan springen sie nicht hinaus), Plan: Aderzahl an gerader und geschwungener Leitung (Taste D, Ziffern,
# Text gemeinsam, Ziehen entlang der Leitung, PDF), Messstrecke nur beim Messen, drei Schalter Symbol an Symbol.
# Vorher: node build.mjs elplexa. Aufruf: python3 test/plan_ader_tests.py [Ausgabeordner]
# (legt start.png, plan_ader.png, plan_schalter.png, plan_ader_druck.png und plan_ader.pdf ab).
import sys, tempfile, re, base64
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="plan_ader_"))
OUT.mkdir(parents=True, exist_ok=True)
PT_MM = 25.4 / 72
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)

def make_pdf(w, h, ops):
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w} {h}] /Contents 4 0 R >>", f"<< /Length {len(ops)} >>\nstream\n{ops}\nendstream"]
    out, offs = b"%PDF-1.4\n", []
    for i, o in enumerate(objs):
        offs.append(len(out)); out += f"{i + 1} 0 obj\n{o}\nendobj\n".encode()
    x = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode() + "".join(f"{o:010d} 00000 n \n" for o in offs).encode()
    return out + f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n".encode()
PDF = OUT / "grundriss.pdf"; PDF.write_bytes(make_pdf(1190.55, 841.89, f"2 w 300 300 {80 / PT_MM:.3f} {60 / PT_MM:.3f} re S"))
K = 50 * PT_MM

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 900}); page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker; delete window.showDirectoryPicker;")
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(400)
    M = lambda: page.evaluate("window.__schemacad.model")
    of = lambda t: [x for x in M()["items"] if x["type"] == t]
    hub = lambda: page.evaluate("!document.querySelector('#el-hub').hidden")
    kind = lambda: page.evaluate("window.__schemacad.kind")
    def key(k): page.evaluate("([k]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))", [k]); page.wait_for_timeout(60)
    def at(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.locator("#svg").bounding_box()
        return r["x"] + v["x"] + x * v["z"], r["y"] + v["y"] + (210 - y) * v["z"]
    def click(x, y, alt=True):
        if alt: page.keyboard.down("Alt")
        page.mouse.click(*at(x, y)); page.wait_for_timeout(80)
        if alt: page.keyboard.up("Alt")
    def move(x, y): page.mouse.move(*at(x, y)); page.wait_for_timeout(60)

    # ---------- 1. Start: Liste «Projekte», nicht die Projektansicht ----------
    check("Start: Übersicht offen", hub())
    check("Start: Liste «Projekte» (Karte des offenen Projekts, keine Modulkacheln)", page.locator("#el-pt-cur").count() == 1 and page.locator("#el-addmod").count() == 0)
    check("Start: Reiter Projekte aktiv", page.get_attribute("#el-nav-projekte", "aria-current") == "page")
    key("1"); check("Ziffer in der Liste: kein Modul geöffnet", hub() and page.locator("#el-pt-cur").count() == 1)
    page.screenshot(path=str(OUT / "start.png"))

    # ---------- 2. Ziffern nur in der Projektansicht ----------
    page.click("#el-pt-cur"); page.wait_for_timeout(200)
    check("Karte öffnet die Projektansicht mit Modulkacheln", hub() and page.locator("#el-addmod").count() == 1)
    key("1"); page.wait_for_timeout(200)
    check("Projektansicht: Ziffer 1 öffnet das erste Modul (Schema)", not hub() and kind() == "schema", kind())
    for d in "56789":
        key(d)
    check("Schema: Ziffern 5–9 springen nicht hinaus", not hub() and kind() == "schema", kind())
    key("0"); page.wait_for_timeout(150)
    check("0: zurück in die Projektansicht", hub() and page.locator("#el-addmod").count() == 1)
    page.click("#el-addmod"); page.wait_for_timeout(150); page.locator('[data-elnew="plan"]').click(); page.wait_for_timeout(300)
    check("Plan angelegt und offen", not hub() and kind() == "plan")
    for d in "123456789":
        key(d)
    check("Plan: Ziffern springen nicht hinaus", not hub() and kind() == "plan", kind())
    key("k"); key("9")
    check("Plan, Werkzeug Kanal: Ziffer 9 = 600 mm (Werkzeug bekommt die Zahl)", page.input_value('[data-plo="dw"]') == "600" and not hub())
    key("Escape"); key("v")

    # ---------- 5. Massstab messen: Strecke nur beim Messen ----------
    with page.expect_file_chooser() as fc: page.click('[data-plact="pdf"]')
    fc.value.set_files(str(PDF)); page.wait_for_timeout(700)
    page.click(".modal [data-ok]"); page.wait_for_timeout(400)
    meas = lambda: page.locator("#overlay line[stroke='#e08a00'], #sheet line[stroke='#e08a00']").count()
    page.click('[data-tool="pl-measure"]'); click(0, 0); click(4000, 0)
    page.fill('.modal [data-f="0"]', "4000"); page.click(".modal [data-ok]"); page.wait_for_timeout(200)
    page.locator(".modal .choice").first.click(); page.wait_for_timeout(200)
    check("Massstab gesetzt, Messstrecke gespeichert", M()["bg"].get("measure", {}).get("mm") == 4000)
    check("nach dem Setzen: Messstrecke ausgeblendet", meas() == 0, meas())
    page.click('[data-tool="pl-fix"]'); click(0, 0); page.wait_for_timeout(200)
    check("nach dem Fixpunkt: ausgeblendet", meas() == 0)
    page.click('[data-tool="pl-measure"]'); page.wait_for_timeout(100)
    check("erneut messen: alte Strecke wieder sichtbar", meas() == 1, meas())
    key("Escape"); key("v")
    check("Werkzeug gewechselt: wieder weg", meas() == 0)
    page.click('[data-plact="bgshow"]'); page.wait_for_timeout(100)  # PDF-Plan ausblenden, damit die Bilder ruhig sind

    # ---------- 6. Drei Schalter aneinander ----------
    grp = {"SCH0": "Schalter", "SCH3": "Schalter", "SCH6": "Schalter", "TASTER": "Schalter", "STD": "Steckdosen", "STD2": "Steckdosen"}
    def sym(key0, x, y, alt=False):
        if not page.locator(f'[data-plsym="{key0}"]').is_visible(): page.locator(f'[data-plgrp="{grp[key0]}"]').click(); page.wait_for_timeout(80)
        page.click(f'[data-plsym="{key0}"]'); page.wait_for_timeout(80); move(x, y); click(x, y, alt)
    sym("SCH0", 1000, 3000)
    sym("SCH3", 1170, 3030)
    sym("SCH6", 1310, 3020)
    ys = of("sym")
    check("drei Schalter in einer Reihe, bündig (150 mm = 3 mm Papier bei 1:50)", [y["at"] for y in ys] == [[1000, 3000], [1150, 3000], [1300, 3000]] and all(y["r"] == 0 for y in ys), [(y["key"], y["at"]) for y in ys])
    sym("SCH0", 1160, 3010)
    check("über einem belegten Platz: kein Fang (liegt am Raster)", of("sym")[-1]["at"] == [1160, 3010], of("sym")[-1]["at"])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(100)
    sym("TASTER", 1460, 3010, alt=True)
    check("Alt: frei, kein Fang am Nachbarn", max(abs(u - v) for u, v in zip(of("sym")[-1]["at"], [1460, 3010])) < 0.5, of("sym")[-1]["at"])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(100)
    # gedrehter Nachbar: das neue Symbol übernimmt die Drehung
    sym("STD", 3000, 3000); key("v"); click(3000, 3100, alt=False); key("r")
    check("Steckdose gedreht", of("sym")[-1]["r"] == 90)
    sym("STD2", 2900, 3150)
    check("Steckdose an gedrehter Steckdose: gleiche Drehung, bündig", of("sym")[-1]["r"] == 90 and of("sym")[-1]["at"] == [3000, 3150], of("sym")[-1])
    # Ziehen: Schalter an die Reihe heranziehen rastet ein
    key("v")
    sym("SCH0", 1000, 2000, alt=True); key("v")
    page.mouse.move(*at(1000, 2110)); page.mouse.down(); page.mouse.move(*at(1200, 2900), steps=6); page.mouse.move(*at(1440, 3010), steps=4); page.mouse.up(); page.wait_for_timeout(100)
    check("Ziehen: rastet rechts an der Reihe ein", of("sym")[-1]["at"] == [1450, 3000], of("sym")[-1]["at"])

    # ---------- 4. Aderzahl ----------
    key("l"); click(0, 1000); click(2000, 1000); key("Enter")
    key("l"); click(0, -500); click(1000, 500); click(2000, -500); click(3000, 500); key("Enter")
    lines = of("line")
    check("zwei Leitungen: gerade und geschwungen", len(lines) == 2 and lines[1].get("curve") is True, lines)
    key("d")
    check("Taste D: Werkzeug Aderzahl", page.get_attribute('[data-tool="pl-ader"]', "aria-pressed") == "true" and "Aderzahl" in page.inner_text("#hint"))
    move(500, 1010); check("Vorschau auf der Leitung", page.locator("#overlay text").count() >= 1)
    click(500, 1010, alt=False)
    a = of("ader")
    check("gerade: Strich bei 25 %, Text 3", len(a) == 1 and a[0]["line"] == lines[0]["id"] and abs(a[0]["t"] - 0.25) < 0.01 and a[0]["txt"] == "3", a)
    key("5")
    mid = page.evaluate("""(() => { const p = [...document.querySelectorAll('#items .pl-items path')].find((q) => (q.getAttribute('d') || '').includes('C'));
      const pt = p.getPointAtLength(p.getTotalLength() / 2); return [pt.x, pt.y]; })()""")
    click(mid[0], mid[1], alt=False)
    a = of("ader")
    check("geschwungen: Strich in der Mitte, Taste 5 = Text 5", len(a) == 2 and a[1]["line"] == lines[1]["id"] and abs(a[1]["t"] - 0.5) < 0.03 and a[1]["txt"] == "5", a)
    click(1000, 2500, alt=False)
    check("Klick daneben: keine Aderzahl", len(of("ader")) == 2)
    # Strich senkrecht zur Tangente der Kurve (im gezeichneten SVG)
    perp = page.evaluate("""(() => { const p = [...document.querySelectorAll('#items .pl-items path')].find((q) => (q.getAttribute('d') || '').includes('C')), L = p.getTotalLength();
      const a = p.getPointAtLength(L / 2 - 1), b = p.getPointAtLength(L / 2 + 1), u = [b.x - a.x, b.y - a.y];
      const t = [...document.querySelectorAll('#items .pl-items path')].filter((q) => /^M[^LC]+L[^LC]+$/.test(q.getAttribute('d') || '')).map((q) => q.getAttribute('d').slice(1).split('L').map((s) => s.split(',').map(Number)));
      return t.map(([[x1, y1], [x2, y2]]) => Math.abs((x2 - x1) * u[0] + (y2 - y1) * u[1]) / Math.hypot(x2 - x1, y2 - y1) / Math.hypot(...u)); })()""")
    check("Kurve: ein Strich senkrecht zur Tangente", any(c < 0.02 for c in perp), perp)
    # Text ändern (einzeln, dann gemeinsam), Ziehen entlang der Leitung
    key("v"); click(500, 1000, alt=False)
    check("Klick wählt die Aderzahl, Feld rechts", M() and page.locator('[data-plf="atxt"]').count() == 1)
    page.fill('[data-plf="atxt"]', "5x1.5"); page.press('[data-plf="atxt"]', "Enter"); page.wait_for_timeout(100)
    check("Text frei: 5x1.5", of("ader")[0]["txt"] == "5x1.5" and "5x1.5" in page.text_content("#items"))
    page.keyboard.down("Meta"); page.mouse.click(*at(mid[0], mid[1])); page.keyboard.up("Meta"); page.wait_for_timeout(100)
    check("Mehrfachwahl: Feld «verschieden»", page.get_attribute('[data-plf="atxt"]', "placeholder") == "verschieden")
    key("4")
    check("Mehrfachwahl: Taste 4 setzt beide", [x["txt"] for x in of("ader")] == ["4", "4"])
    page.fill('[data-plf="atxt"]', "3x1.5"); page.press('[data-plf="atxt"]', "Enter"); page.wait_for_timeout(100)
    check("Mehrfachwahl: Text gemeinsam", [x["txt"] for x in of("ader")] == ["3x1.5", "3x1.5"])
    page.mouse.click(*at(-1000, -2000)); page.wait_for_timeout(80)
    page.mouse.move(*at(500, 1000)); page.mouse.down(); page.mouse.move(*at(1200, 1300), steps=5); page.mouse.move(*at(1500, 1200), steps=3); page.mouse.up(); page.wait_for_timeout(100)
    check("Ziehen: Strich gleitet entlang der Leitung (75 %)", abs(of("ader")[0]["t"] - 0.75) < 0.01, of("ader")[0])
    # wandert mit: Leitung verlängern
    key("v"); click(1000, 1000, alt=False)
    page.mouse.move(*at(2000, 1000)); page.mouse.down(); page.mouse.move(*at(3000, 1000), steps=5); page.mouse.up(); page.wait_for_timeout(100)
    check("Leitungspunkt gezogen, Aderzahl bleibt bei 75 %", of("line")[0]["pts"][1][0] > 2900 and abs(of("ader")[0]["t"] - 0.75) < 0.01)
    # Farbe wie die Leitung
    page.click('[data-plcol="#d4141c"]'); page.wait_for_timeout(100)
    check("Leitung rot: Strich und Text rot", page.locator("#items text[fill='#d4141c']").count() == 1 and page.locator("#items path[stroke='#d4141c']").count() >= 2)
    check("ohne Kanal: Text ohne weissen Rand", page.locator("#items text.pl-halo").count() == 0)
    key("k"); click(0, 1000); click(3000, 1000); key("Enter"); key("Enter"); key("Escape"); key("v")
    check("Leitung im Kanal: Aderzahl-Text mit weissem Rand (CJ 27.10.2026)", len(of("duct")) == 1 and page.locator("#items text.pl-halo").count() == 1)
    page.mouse.click(*at(-1000, -2000)); page.wait_for_timeout(80)
    # Ansicht für das Bild
    def zoom(x, y, n):
        for _ in range(n): page.mouse.move(*at(x, y)); page.keyboard.down("Control"); page.mouse.wheel(0, -60); page.keyboard.up("Control"); page.wait_for_timeout(60)
    key("f"); page.wait_for_timeout(150); zoom(1500, 1200, 3); page.mouse.move(*at(-9000, -9000)); page.wait_for_timeout(3000)
    page.locator("#svg").screenshot(path=str(OUT / "plan_ader.png"))
    zoom(1250, 3050, 6); page.mouse.move(*at(-9000, -9000)); page.wait_for_timeout(100)
    page.locator("#svg").screenshot(path=str(OUT / "plan_schalter.png"))

    # PDF
    page.evaluate("""window.__open = []; window.open = (u) => { window.__open.push(u); return {}; }; window.__pr = '';
      new MutationObserver(() => { const h = document.querySelector('#printroot').innerHTML; if (h) window.__pr = h; }).observe(document.querySelector('#printroot'), { childList: true }); 0""")
    key("0"); page.wait_for_timeout(200)
    page.click("#el-tile-plan [data-elpdf]")
    page.wait_for_function("window.__open.length > 0", timeout=60000)
    pdf = page.evaluate("(async () => { const b = new Uint8Array(await (await fetch(window.__open.shift())).arrayBuffer()); let s = ''; for (const c of b) s += String.fromCharCode(c); return btoa(s); })()")
    raw = base64.b64decode(pdf); (OUT / "plan_ader.pdf").write_bytes(raw)
    check("PDF erzeugt", raw.startswith(b"%PDF") and len(raw) > 2000)
    pr = page.evaluate("window.__pr")
    check("Druck: Aderzahlen als Text und Strich in Leitungsfarbe", pr.count(">3x1.5<") == 2 and "pl-halo" in pr and "#d4141c" in pr and "--plw" in pr)
    view = b.new_page(viewport={"width": 1600, "height": 1140})
    view.set_content("<!doctype html><meta charset=utf-8><style>body{margin:0;background:#fff}#printroot .pl-print [stroke-width]{stroke-width:var(--plw)!important}svg{display:block;width:1587px;height:1123px}</style><div id=printroot>" + pr + "</div>")
    view.locator("svg").nth(0).screenshot(path=str(OUT / "plan_ader_druck.png"))

    # Speichern: Version 30
    d = page.evaluate("window.__schemacad.doc")
    check("Datei: Version 30 mit Aderzahl", d["version"] == 30 and any(i["type"] == "ader" for s in d["sheets"] if s.get("kind") == "plan" for i in s["items"]))
    b.close()

check("keine Fehler in der Konsole", not errors, errors[:5])
print(f"\nBilder: {OUT}")
if fails: print(f"{len(fails)} Fehler"); sys.exit(1)
print("plan_ader_tests: alles ok")
