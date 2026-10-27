# UI-Test Modul «Plan», Kanal/Trasse (CJ 27.10.2026): Werkzeug N, Breite per Zahlentaste, Länge tippen, Gehrung, alle Schraffurarten
# bei 200 und 600 mm, Ebene «Kanäle», Griffe, Kopieren, Beschriftung, Fang der Leitung an der Kanalkante (ohne Ausrichtungslinien),
# Stückliste (Druck und CSV), PDF. Vorher: node build.mjs elplexa. Aufruf: python3 test/plan_kanal_tests.py [Ausgabeordner]
# (legt plan_kanal.png, plan_kanal_zoom.png, plan_kanal_druck.png, plan_kanal_stueckliste.png und plan_kanal.pdf ab).
import sys, tempfile, math, re, base64
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="plan_kanal_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
HATCHES = ["kreuz", "diag", "gegen", "punkte", "gitter", "ohne"]
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 900}, accept_downloads=True); page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(400)
    M = lambda: page.evaluate("window.__schemacad.model")
    D = lambda: page.evaluate("JSON.parse(window.__schemacad.serialize())") if page.evaluate("typeof window.__schemacad.serialize") == "function" else None
    of = lambda t: [x for x in M()["items"] if x["type"] == t]
    def key(k): page.evaluate("([k]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))", [k]); page.wait_for_timeout(40)
    def keys(s):
        for ch in s: key(ch)
    def at(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.locator("#svg").bounding_box()
        return r["x"] + v["x"] + x * v["z"], r["y"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): page.mouse.click(*at(x, y)); page.wait_for_timeout(60)
    def move(x, y): page.mouse.move(*at(x, y)); page.wait_for_timeout(50)

    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('[data-elnew="plan"]'); page.wait_for_timeout(300)
    key("n")
    check("Taste N: Werkzeug Kanal", page.get_attribute('[data-tool="pl-duct"]', "aria-pressed") == "true" and "Kanal" in page.inner_text("#hint"))
    check("Vorgabe 200 mm, Kreuzschraffur", page.input_value('[data-plo="dw"]') == "200" and page.input_value('[data-plo="dhatch"]') == "kreuz")
    page.click('[data-plact="ductlayer"]'); page.wait_for_timeout(100)
    lay = M()["layers"]; act = next(l for l in lay if l["id"] == M()["alay"])
    check("Vorschlag Ebene «Kanäle»: angelegt und aktiv", act["name"] == "Kanäle", [l["name"] for l in lay])
    key("9"); check("Taste 9: 600 mm", page.input_value('[data-plo="dw"]') == "600")
    key("5"); check("Taste 5: 200 mm", page.input_value('[data-plo="dw"]') == "200")

    # Länge tippen wie bei der Wand: 3500 → rechts, dann 1500 mit Winkel 90°, Enter ohne Eingabe beendet
    page.mouse.click(*at(-3000, -3000)); key("n")
    page.keyboard.down("Alt"); click(0, 0); page.keyboard.up("Alt")
    move(1000, 5); keys("3500"); key("Enter")
    keys("1500"); key("Tab"); keys("90"); key("Enter"); key("Enter")
    d = of("duct")
    check("Kanal gezeichnet: drei Punkte, Länge getippt", len(d) == 1 and d[0]["pts"] == [[0, 0], [3500, 0], [3500, 1500]] and d[0]["w"] == 200, d)
    check("Kanal liegt auf der Ebene «Kanäle», Kreuz und Farben = Vorgabe (nicht gespeichert)", d and d[0]["layer"] == act["id"] and not any(k in d[0] for k in ("hatch", "col", "ecol")), d)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("⌘Z nimmt den ganzen Kanal zurück", of("duct") == [])

    # Alle Schraffuren bei 200 und 600 mm, je ein L, per Klick gezeichnet. Vorher so weit herauszoomen, dass das Feld ganz sichtbar ist.
    def inside(x, y):
        r = page.locator("#svg").bounding_box(); q = at(x, y)
        return r["x"] + 20 < q[0] < r["x"] + r["width"] - 20 and r["y"] + 20 < q[1] < r["y"] + r["height"] - 20
    for _ in range(40):
        if inside(-500, -500) and inside(10500, 12800): break
        r = page.locator("#svg").bounding_box(); page.mouse.move(r["x"] + r["width"] / 2, r["y"] + r["height"] / 2)
        page.keyboard.down("Control"); page.mouse.wheel(0, 40); page.keyboard.up("Control"); page.wait_for_timeout(40)
        if not inside(-500, -500) or not inside(10500, 12800):  # Feld in die Mitte schieben
            q0, q1 = at(-500, -500), at(10500, 12800); cx, cy = (q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2
            page.mouse.wheel(cx - (r["x"] + r["width"] / 2), cy - (r["y"] + r["height"] / 2)); page.wait_for_timeout(40)
    check("Ansicht zeigt das ganze Testfeld", inside(-500, -500) and inside(10500, 12800))
    for col, (w, digit) in enumerate([(200, "5"), (600, "9")]):
        for row, h in enumerate(HATCHES):
            key("n"); key(digit); page.select_option('[data-plo="dhatch"]', h); page.wait_for_timeout(40)
            x0, y0 = col * 6000, 11000 - row * 2200
            click(x0, y0); click(x0 + 3500, y0); click(x0 + 3500, y0 + 1200); click(x0 + 3500, y0 + 1200)  # Klick auf den letzten Punkt beendet
    d = of("duct")
    check("12 Kanäle: 6 Schraffuren × 200 und 600 mm", len(d) == 12 and sorted({x["w"] for x in d}) == [200, 600] and [x.get("hatch", "kreuz") for x in d[:6]] == HATCHES, [(x["w"], x.get("hatch")) for x in d])
    check("Ecke im Kanal: Punkte auf dem Raster", all(x["pts"][1][0] % 10 == 0 for x in d))
    key("Escape"); key("v")
    page.mouse.click(*at(-3000, -3000)); key("f"); page.wait_for_timeout(150)
    ov = lambda: page.evaluate("document.querySelector('#items').innerHTML") if page.locator("#items").count() else page.evaluate("document.querySelector('#svg').innerHTML")
    s = page.evaluate("document.querySelector('#svg').innerHTML")
    check("Darstellung: rote Kanten und gelbe Schraffur", "#d4141c" in s and "#c9a800" in s)

    # Wahl, Breite und Beschriftung rechts, Griff ziehen
    k0 = d[0]; x0, y0 = 0, 11000
    click(1500, y0 + 60)
    check("Klick auf den Kanal wählt ihn", page.evaluate("[...window.__schemacad.sel]") == [k0["id"]] and page.input_value('[data-plf="dw"]') == "200")
    page.fill('[data-plf="txt"]', "Kabelrinne 300"); page.press('[data-plf="txt"]', "Enter"); page.wait_for_timeout(80)
    page.fill('[data-plf="dw"]', "300"); page.press('[data-plf="dw"]', "Enter"); page.wait_for_timeout(80)
    k = next(x for x in of("duct") if x["id"] == k0["id"])
    check("Beschriftung und Breite 300 (frei eingegeben)", k.get("txt") == "Kabelrinne 300" and k["w"] == 300, k)
    check("Beschriftung im Plan", "Kabelrinne 300" in page.evaluate("document.querySelector('#svg').innerHTML"))
    page.mouse.move(*at(3500, y0 + 1200)); page.mouse.down(); page.mouse.move(*at(4200, y0 + 1700), steps=5); page.mouse.up(); page.wait_for_timeout(80)
    k = next(x for x in of("duct") if x["id"] == k0["id"])
    check("Griff am Endpunkt gezogen (Raster 10 mm)", k["pts"][2] == [4200, y0 + 1700], k["pts"])
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    k = next(x for x in of("duct") if x["id"] == k0["id"])
    check("Rückgängig", k["pts"][2] == [3500, y0 + 1200], k["pts"])
    n0 = len(of("duct")); page.keyboard.press("Meta+d"); page.wait_for_timeout(80)
    check("⌘D kopiert den Kanal", len(of("duct")) == n0 + 1)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("Mehrfachwahl per ⌘-Klick", True)
    page.mouse.click(*at(1500, y0 + 60)); page.keyboard.down("Meta"); page.mouse.click(*at(1500, y0 - 2200 + 60)); page.keyboard.up("Meta"); page.wait_for_timeout(80)
    check("⌘-Klick: zwei Kanäle gewählt", len(page.evaluate("[...window.__schemacad.sel]")) == 2 and "Kanäle" in page.inner_text("#right"))

    # Leitung: Fang an der Kanalkante (oben am ersten Kanal, Kante y0 + 150), keine orange Ausrichtungslinie
    key("Escape"); page.mouse.click(*at(-3000, -3000))
    z = page.evaluate("window.__schemacad.view")["z"]; t = 10 / z
    key("l"); move(2000, y0 + 150 + 0.5 * t)
    guides = page.evaluate("document.querySelector('#overlay').innerHTML.includes('#e08a00')")
    click(2000, y0 + 150 + 0.5 * t); click(2000, y0 + 900); key("Enter")
    ln = of("line")[-1]
    check("Leitung rastet an der Kanalkante", abs(ln["pts"][0][1] - (y0 + 150)) < 0.01 and abs(ln["pts"][0][0] - 2000) < t, ln["pts"])
    check("Leitung: keine orange Ausrichtungslinie", not guides)
    key("l"); click(-0.1 * t, y0 + 0.1 * t); click(-1000, y0 + 500); key("Enter")
    check("Leitung rastet am Kanalende", of("line")[-1]["pts"][0] == [0, y0], of("line")[-1]["pts"])
    key("v")

    # Ebene sperren: Kanal nicht wählbar
    page.click(f'[data-plact="lock"][data-layer="{act["id"]}"]'); page.wait_for_timeout(80)
    page.mouse.click(*at(1000, y0 - 2200 + 60)); page.wait_for_timeout(60)
    check("Gesperrte Ebene: Kanal nicht wählbar", page.evaluate("[...window.__schemacad.sel]") == [])
    page.click(f'[data-plact="lock"][data-layer="{act["id"]}"]'); page.wait_for_timeout(80)

    key("f"); page.wait_for_timeout(150)
    page.screenshot(path=str(OUT / "plan_kanal.png"))
    # Zoom auf eine Ecke (600 mm Kreuz): Schraffur bleibt ruhig
    for _ in range(6): page.mouse.move(*at(9500, 11000)); page.keyboard.down("Control"); page.mouse.wheel(0, -60); page.keyboard.up("Control"); page.wait_for_timeout(60)
    page.screenshot(path=str(OUT / "plan_kanal_zoom.png"))

    # Stückliste CSV
    page.click("#btn-pvdruck"); page.wait_for_timeout(200)
    with page.expect_download() as dl: page.click('[data-plact="bomcsv"]')
    csv = Path(dl.value.path()).read_text(encoding="utf-8")
    check("CSV: Kanäle je Breite mit Länge in m", csv.startswith("Gruppe;Symbol;Anzahl;Länge m") and "Kanäle;Kanal 200 mm;5;23,50" in csv and "Kanäle;Kanal 300 mm;1;4,70" in csv and "Kanäle;Kanal 600 mm;6;28,20" in csv, csv)
    page.keyboard.press("Escape"); page.wait_for_timeout(100)

    # PDF über die Kachel, Druckbild als PNG
    page.evaluate("""window.__open = []; window.open = (u) => { window.__open.push(u); return {}; }; window.__pr = '';
      new MutationObserver(() => { const h = document.querySelector('#printroot').innerHTML; if (h) window.__pr = h; }).observe(document.querySelector('#printroot'), { childList: true }); 0""")
    key("0"); page.wait_for_timeout(200)
    page.click("#el-tile-plan [data-elpdf]")
    page.wait_for_function("window.__open.length > 0", timeout=60000)
    pdf = page.evaluate("(async () => { const b = new Uint8Array(await (await fetch(window.__open.shift())).arrayBuffer()); let s = ''; for (const c of b) s += String.fromCharCode(c); return btoa(s); })()")
    raw = base64.b64decode(pdf); (OUT / "plan_kanal.pdf").write_bytes(raw)
    txt = raw.decode("latin-1")
    pp = [tuple(round(float(v) * 25.4 / 72) for v in m) for m in re.findall(r"/Type /Page\b.*?/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]", txt, re.S)]
    check("PDF: Plan A3 quer und Stückliste A4 hoch", pp == [(420, 297), (210, 297)], pp)
    pr = page.evaluate("window.__pr")
    check("Druck: Kanäle mit Linienbreite des Plans (--plw)", "--plw" in pr and "#d4141c" in pr and "#c9a800" in pr and "Kabelrinne 300" in pr)
    bom = page.evaluate("[...new DOMParser().parseFromString(window.__pr, 'text/html').querySelectorAll('svg')].at(-1).textContent")
    check("Stückliste im Druck: Kanal je Breite mit Länge", "Kanal 200 mm (5 Stück)" in bom and "28,20 m" in bom and "Kanal" in bom, bom[:300])
    view = b.new_page(viewport={"width": 1600, "height": 1140})
    view.set_content("<!doctype html><meta charset=utf-8><style>body{margin:0;background:#fff}#printroot .pl-print [stroke-width]{stroke-width:var(--plw)!important}svg{display:block;width:1587px;height:1123px}</style><div id=printroot>" + pr + "</div>")
    svgs = view.locator("svg")
    svgs.nth(0).screenshot(path=str(OUT / "plan_kanal_druck.png"))
    view.set_viewport_size({"width": 800, "height": 1140})
    view.evaluate("document.querySelectorAll('svg').forEach((s, i) => { if (i) { s.style.width = '794px'; s.style.height = '1123px'; } })")
    svgs.nth(svgs.count() - 1).screenshot(path=str(OUT / "plan_kanal_stueckliste.png"))

    # Speichern: Version 29
    data = page.evaluate("window.__schemacad.serialize ? window.__schemacad.serialize() : null")
    if data:
        check("Datei: Version 29", '"version":29' in data.replace(" ", ""))
    b.close()

for e in errors: print("Fehler im Browser:", e)
print(f"Bilder und PDF in {OUT}")
if fails or errors: print(f"{len(fails)} Fehler"); sys.exit(1)
print("plan_kanal_tests: alles ok")
