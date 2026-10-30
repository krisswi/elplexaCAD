# UI-Test Modul «Plan», freies Zeichnen (CJ 27.10.2026, Aufgaben Plan 21): Linie I, Rechteck Q, Kreis C, Mass tippen, Ziehen, Shift,
# Fang an Wandecken (nicht an Leitungen), Ebene «Zeichnung», Farbe, Stärke, gestrichelt, Füllung, R dreht, Griffe, Kopieren, Mehrfachwahl,
# Rückgängig, PDF ohne Stückliste, Dateiversion 32. Vorher: node build.mjs elplexa. Aufruf: python3 test/plan_formen_tests.py [Ausgabeordner]
import sys, tempfile, re, base64
from pathlib import Path
from playwright.sync_api import sync_playwright
from elstart import projektansicht

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="plan_formen_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1400, "height": 900}); page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto((ROOT / "dist" / "ElplexaCAD.html").as_uri()); page.wait_for_timeout(400); projektansicht(page)
    M = lambda: page.evaluate("window.__schemacad.model")
    of = lambda t: [x for x in M()["items"] if x["type"] == t]
    rd = lambda o: [round(v, 2) for v in o] if isinstance(o, list) else round(o, 2)  # Fang an Wandflächen rechnet auf 0,001 mm genau
    shapes = lambda: [{k: (rd(v) if k in ("x", "y", "w", "h", "r") else [rd(q) for q in v] if k == "pts" else v) for k, v in x.items()} for x in of("shape")]
    sel = lambda: page.evaluate("[...window.__schemacad.sel]")
    def key(k): page.evaluate("([k]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))", [k]); page.wait_for_timeout(40)
    def keys(s):
        for ch in s: key(ch)
    def at(x, y):
        v = page.evaluate("window.__schemacad.view"); r = page.locator("#svg").bounding_box()
        return r["x"] + v["x"] + x * v["z"], r["y"] + v["y"] + (210 - y) * v["z"]
    def click(x, y): page.mouse.click(*at(x, y)); page.wait_for_timeout(60)
    def move(x, y): page.mouse.move(*at(x, y)); page.wait_for_timeout(50)
    pressed = lambda t: page.get_attribute(f'[data-tool="{t}"]', "aria-pressed") == "true"

    page.click("#el-addmod"); page.wait_for_timeout(150); page.click('[data-elnew="plan"]'); page.wait_for_timeout(300)
    # Ansicht auf das Testfeld (−5 m bis 12 m) wie im Kanal-Test: herauszoomen und in die Mitte schieben
    def inside(x, y):
        r = page.locator("#svg").bounding_box(); q = at(x, y)
        return r["x"] + 20 < q[0] < r["x"] + r["width"] - 20 and r["y"] + 20 < q[1] < r["y"] + r["height"] - 20
    for _ in range(40):
        if inside(-5000, -1000) and inside(12000, 10000): break
        r = page.locator("#svg").bounding_box(); page.mouse.move(r["x"] + r["width"] / 2, r["y"] + r["height"] / 2)
        page.keyboard.down("Control"); page.mouse.wheel(0, 40); page.keyboard.up("Control"); page.wait_for_timeout(40)
        if not inside(-5000, -1000) or not inside(12000, 10000):
            q0, q1 = at(-5000, -1000), at(12000, 10000); cx, cy = (q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2
            page.mouse.wheel(cx - (r["x"] + r["width"] / 2), cy - (r["y"] + r["height"] / 2)); page.wait_for_timeout(40)
    check("Ansicht zeigt das ganze Testfeld", inside(-5000, -1000) and inside(12000, 10000))
    z = page.evaluate("window.__schemacad.view")["z"]; t = 10 / z  # Fangradius in mm

    # Tasten: I, Q, C; O bleibt Tür/Fenster
    key("i"); check("Taste I: Linie", pressed("pl-sline") and "Linie" in page.inner_text("#hint"))
    key("q"); check("Taste Q: Rechteck", pressed("pl-srect"))
    key("c"); check("Taste C: Kreis", pressed("pl-scircle"))
    key("o"); check("Taste O bleibt Tür", page.get_attribute('[data-plact="o:tuer"]', "aria-pressed") == "true")

    # Grundriss: eine Wand (Innenkante 0,5000 → 4000,5000) und eine Leitung mit krummem Endpunkt, beide auf Hintergrund
    key("w"); click(0, 5000); click(4000, 5000); key("Escape")
    check("Wand gezeichnet", len(of("wall")) == 1)
    key("l"); page.keyboard.down("Alt"); click(7003, 7007); click(9003, 7007); page.keyboard.up("Alt"); key("Enter")
    lp = of("line")[0]["pts"][0] if of("line") else [0, 0]
    check("Leitung gezeichnet (frei, ohne Raster)", abs(lp[0] - 7003) < t / 3 and abs(lp[1] - 7007) < t / 3 and (lp[0] % 10 or lp[1] % 10), lp)

    # Vorschlag Ebene «Zeichnung»
    key("q"); page.click('[data-plact="ownlayer"]'); page.wait_for_timeout(100)
    act = next(l for l in M()["layers"] if l["id"] == M()["alay"])
    check("Vorschlag Ebene «Zeichnung»: angelegt und aktiv", act["name"] == "Zeichnung", [l["name"] for l in M()["layers"]])

    # Rechteck: Klick, Breite x Höhe tippen, Enter (Seite nach dem Zeiger)
    click(0, 0); move(500, 400); keys("3000x2000"); key("Enter")
    s = shapes()
    check("Rechteck getippt: 3000 × 2000 ab (0|0)", len(s) == 1 and [s[0]["k"], s[0]["x"], s[0]["y"], s[0]["w"], s[0]["h"]] == ["rect", 0, 0, 3000, 2000], s)
    check("Form auf Ebene «Zeichnung», Vorgaben nicht gespeichert", s and s[0]["layer"] == act["id"] and not any(k in s[0] for k in ("col", "lw", "d", "fill")), s)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(80)
    check("⌘Z nimmt das Rechteck zurück", shapes() == [])
    click(0, 0); move(-500, 400); keys("3000"); key("Tab"); keys("2000"); key("Enter")
    s = shapes()
    check("Zeiger links: Rechteck wächst nach links (Tab statt x)", s and [s[0]["x"], s[0]["y"], s[0]["w"], s[0]["h"]] == [-3000, 0, 3000, 2000], s)

    # Linie: Länge und Winkel tippen
    key("i"); click(5000, 0); move(5500, 10); keys("2500"); key("Tab"); keys("90"); key("Enter")
    ln = shapes()[-1]
    check("Linie getippt: 2500 mm, 90°", ln["k"] == "line" and ln["pts"] == [[5000, 0], [5000, 2500]], ln)
    # Linie Klick/Klick mit Shift: waagrecht
    click(6000, 3000); page.keyboard.down("Shift"); click(8000, 3400); page.keyboard.up("Shift")
    ln = shapes()[-1]
    check("Shift: Linie waagrecht", ln["pts"][0][1] == ln["pts"][1][1] == 3000 and ln["pts"][1][0] > 7500, ln["pts"])
    # Kreis: Mitte, Radius tippen
    key("c"); click(10000, 1000); keys("50cm"); key("Enter")
    ci = shapes()[-1]
    check("Kreis getippt: r 500 (50cm)", [ci["k"], ci["x"], ci["y"], ci["r"]] == ["circle", 10000, 1000, 500], ci)
    # Rechteck ziehen: Maustaste unten, ziehen, loslassen
    key("q"); page.mouse.move(*at(1000, 8000)); page.mouse.down(); page.mouse.move(*at(2500, 9000), steps=6); page.mouse.up(); page.wait_for_timeout(80)
    rz = shapes()[-1]
    check("Rechteck gezogen", [rz["k"], rz["x"], rz["y"], rz["w"], rz["h"]] == ["rect", 1000, 8000, 1500, 1000], rz)

    # Fang: an der Wandecke ja, an der Leitung nein
    key("i"); click(4000 + 0.4 * t, 5000 - 0.3 * t); click(4000, 6500)
    check("Fang an der Wandecke", shapes()[-1]["pts"][0] == [4000, 5000], shapes()[-1]["pts"])
    click(lp[0] + 0.2 * t, lp[1] - 0.2 * t); click(8000, 8000)
    p0 = shapes()[-1]["pts"][0]
    check("Kein Fang an der Leitung", abs(p0[0] - lp[0]) + abs(p0[1] - lp[1]) > 1, [p0, lp])
    n_all = len(shapes())

    # Eigenschaften: Rechteck wählen, Farbe, Füllung, Stärke, gestrichelt
    key("v"); click(-1500, 2000 + 0.2 * t)
    check("Klick auf die Kante wählt das Rechteck", len(sel()) == 1 and "Rechteck" in page.inner_text("#right"))
    rid = sel()[0]; R = lambda: next(x for x in shapes() if x["id"] == rid)
    page.click('[data-plscol="#d4141c"]'); page.wait_for_timeout(60)
    page.click('[data-plsfill="#c9a800"]'); page.wait_for_timeout(60)
    page.select_option('[data-pls="slw"]', "0.7"); page.wait_for_timeout(60)
    page.check('[data-pls="sd"]'); page.wait_for_timeout(60)
    r = R()
    check("Farbe rot, Füllung gelb, 0,7 mm, gestrichelt", [r.get("col"), r.get("fill"), r.get("lw"), r.get("d")] == ["#d4141c", "#c9a800", 0.7, True], r)
    svg = page.evaluate("document.querySelector('#svg').innerHTML")
    check("Darstellung: Füllung halbtransparent und Strich im Plan", 'fill="#c9a800" fill-opacity="0.35"' in svg and "stroke-dasharray" in svg)
    click(-1500, 1000)
    check("Gefüllt: Klick innen wählt", sel() == [rid])
    page.fill('[data-plf="sw"]', "2500"); page.press('[data-plf="sw"]', "Enter"); page.wait_for_timeout(80)
    check("Breite rechts eingegeben", R()["w"] == 2500, R())
    key("r"); r = R()
    check("R dreht um die Mitte: Breite und Höhe getauscht", [r["w"], r["h"]] == [2000, 2500], r)
    key("R"); page.keyboard.press("Meta+z"); page.wait_for_timeout(60); page.keyboard.press("Meta+z"); page.wait_for_timeout(60)
    check("Rückgängig: wieder 2500 × 2000", [R()["w"], R()["h"]] == [2500, 2000], R())
    page.keyboard.press("Meta+z"); page.wait_for_timeout(60)
    check("Rückgängig: wieder 3000 breit", R()["w"] == 3000, R())
    # Griff: Ecke oben links (x0, y1) ziehen, Gegenecke (0|0) bleibt
    page.mouse.move(*at(-3000, 2000)); page.mouse.down(); page.mouse.move(*at(-4000, 2500), steps=5); page.mouse.up(); page.wait_for_timeout(80)
    r = R()
    check("Griff gezogen: Gegenecke bleibt", [r["x"], r["y"], r["w"], r["h"]] == [-4000, 0, 4000, 2500], r)
    # Ziehen verschiebt
    page.mouse.move(*at(-2000, 1000)); page.mouse.down(); page.mouse.move(*at(-1500, 1300), steps=5); page.mouse.up(); page.wait_for_timeout(80)
    check("Ziehen verschiebt (Raster)", [R()["x"], R()["y"]] == [-3500, 300], R())
    # Kopieren
    page.keyboard.press("Meta+d"); page.wait_for_timeout(80)
    check("⌘D kopiert die Form", len(shapes()) == n_all + 1 and shapes()[-1].get("fill") == "#c9a800")
    page.keyboard.press("Meta+z"); page.wait_for_timeout(60)
    # Mehrfachwahl: ⌘-Klick auf den Kreis
    click(-2000, 1000); page.keyboard.down("Meta"); click(10500, 1000); page.keyboard.up("Meta")
    check("⌘-Klick: zwei Formen gewählt, Felder gemeinsam", len(sel()) == 2 and "2 Formen" in page.inner_text("#right"))
    page.click('[data-plscol="#0068c9"]'); page.wait_for_timeout(60)
    check("Farbe für beide", all(x.get("col") == "#0068c9" for x in shapes() if x["id"] in sel()))
    page.keyboard.press("Meta+z"); page.wait_for_timeout(60)

    key("Escape"); key("v"); key("f"); page.wait_for_timeout(150)
    page.screenshot(path=str(OUT / "plan_formen.png"))

    # PDF: Formen in Farbe, keine Stückliste (keine Symbole)
    page.evaluate("""window.__open = []; window.open = (u) => { window.__open.push(u); return {}; }; window.__pr = '';
      new MutationObserver(() => { const h = document.querySelector('#printroot').innerHTML; if (h) window.__pr = h; }).observe(document.querySelector('#printroot'), { childList: true }); 0""")
    key("0"); page.wait_for_timeout(200)
    page.click("#el-tile-plan [data-elpdf]")
    page.wait_for_function("window.__open.length > 0", timeout=60000)
    pdf = page.evaluate("(async () => { const b = new Uint8Array(await (await fetch(window.__open.shift())).arrayBuffer()); let s = ''; for (const c of b) s += String.fromCharCode(c); return btoa(s); })()")
    raw = base64.b64decode(pdf); (OUT / "plan_formen.pdf").write_bytes(raw)
    pp = [tuple(round(float(v) * 25.4 / 72) for v in m) for m in re.findall(r"/Type /Page\b.*?/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]", raw.decode("latin-1"), re.S)]
    check("PDF: nur der Plan (Formen nicht in der Stückliste)", pp == [(420, 297)], pp)
    pr = page.evaluate("window.__pr")
    check("Druck: Formen in Farbe mit Linienbreite (--plw)", "--plw" in pr and "#d4141c" in pr and 'fill="#c9a800"' in pr and "<circle" in pr)
    data = page.evaluate("window.__schemacad.serialize ? window.__schemacad.serialize() : null")
    if data: check("Datei: Version 32", '"version":32' in data.replace(" ", ""))
    b.close()

for e in errors: print("Fehler im Browser:", e)
print(f"Bild und PDF in {OUT}")
if fails or errors: print(f"{len(fails)} Fehler"); sys.exit(1)
print("plan_formen_tests: alles ok")
