# UI-Tests Disposition, Wunsch CJ 16.10.2026 (Headless-Chromium): Vertigroup NH1–NH3 und mit Wandler, freie Schiene,
# Schienen N/PE/PEN mit 2 Klicks, N-Trenner darauf, Zuleitung, Vorlage Systemauftrennung AÜU, Beschriftung, äussere Bemassung.
# Aufruf aus web-src: python3 test/dispo_wunsch_tests.py [Ausgabeordner] [Beleg.png]
import json, subprocess, sys, tempfile
from pathlib import Path
import ezdxf
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="dispo_wunsch_"))
SHOT = Path(sys.argv[2]) if len(sys.argv) > 2 else OUT / "dispo_wunsch.png"
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
beleg = OUT / "Dispo Wunsch.schemacad.json"
subprocess.run(["node", str(ROOT / "test" / "test_dispo_wunsch.mjs"), str(beleg)], check=True, cwd=ROOT, stdout=subprocess.DEVNULL)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True, device_scale_factor=2)
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
    items = lambda t: [i for i in M()["items"] if i["type"] == t]
    parts = lambda k: [i for i in items("part") if i["kind"] == k]
    page.click("#sheet-add", button="right"); page.click('[data-new="dispo"]'); page.wait_for_timeout(150)
    for _ in range(4): page.keyboard.press("-")
    page.wait_for_timeout(100)

    # ---------- Palette ----------
    for s in ["D:RAILF", "D:PART:VGW00", "D:PART:VGW1", "D:BAR:N", "D:BAR:PE", "D:BAR:PEN", "D:CABLE", "D:TPL:AUEU"]:
        check("Palette hat " + s, page.locator(f'[data-sym="{s}"]').count() == 1)
    check("Palettengruppe „Vertigroup mit Wandler“", "Vertigroup mit Wandler" in page.inner_text("#left"))
    check("alte PEN-Kachel weg (geht in der PEN-Schiene auf)", page.locator('[data-sym="D:PART:PEN"]').count() == 0)

    # ---------- 1. Vertigroup NH1 bis NH3 ----------
    page.click('[data-sym="D:PART:NHVG"]'); click(0, 0); page.keyboard.press("Escape")
    nh = parts("NH")[0]
    check("Vertigroup gesetzt: NH1 3-polig, 100 × 671", (nh["size"], nh["w"], nh["h"]) == ("1-3", 100, 671), nh)
    click(50, 300); page.wait_for_timeout(100)
    opts = page.eval_on_selector('select[data-dp="size"]', "s => [...s.options].map(o => o.textContent)")
    check("Typen NH1, NH2, NH3 (3- und 1-polig), kein „Gr. 1–3“", sum(o.startswith(("NH1,", "NH2,", "NH3,")) for o in opts) == 6 and not any("1–3" in o for o in opts), opts)
    page.select_option('select[data-dp="size"]', "3-1"); page.wait_for_timeout(100)
    check("NH3 1-polig gewählt, Masse bleiben", (parts("NH")[0]["size"], parts("NH")[0]["w"]) == ("3-1", 100))
    check("Feld Beschriftung beim NH", page.locator('input[data-dp="beschr"]').count() == 1)
    page.fill('input[data-dp="beschr"]', "Hauptsicherung"); page.fill('input[data-dp="bmk"]', "-1F1"); page.wait_for_timeout(50)
    page.keyboard.press("Escape")

    # ---------- 2. Vertigroup mit Wandler ----------
    page.click('[data-sym="D:PART:VGW00"]'); click(200, 0); page.keyboard.press("Escape")
    vw = [i for i in parts("NH") if i.get("maker") == "vgw"][0]
    check("Wandler-Leiste: 50 × 741, 160 A, 150/5, L1–L3", (vw["w"], vw["h"], vw["s"], vw["wr"], vw["wl"]) == (50, 741, "160", "150/5", "L123"), vw)
    click(225, 300); page.wait_for_timeout(100)
    check("Panel: Wandler und Lage", page.locator('input[data-dp="wr"]').count() == 1 and page.locator('select[data-dp="wl"]').count() == 1)
    page.fill('input[data-dp="wr"]', "200/5"); page.select_option('select[data-dp="wl"]', "L2"); page.wait_for_timeout(100)
    vw = [i for i in parts("NH") if i.get("maker") == "vgw"][0]
    check("Wandler 200/5 an L2", (vw["wr"], vw["wl"]) == ("200/5", "L2"), vw)
    page.select_option('select[data-dp="size"]', "1W"); page.wait_for_timeout(100)
    vw = [i for i in parts("NH") if i.get("maker") == "vgw"][0]
    check("Typ LVSG1CPX: 100 × 671, Strom folgt (250)", (vw["w"], vw["h"], vw["s"]) == (100, 671, "250"), vw)
    page.keyboard.press("Escape")

    # ---------- 3. Freie Schiene in einer Platte ----------
    page.click('[data-sym="D:PLATE:frei"]'); click(400, 0); page.keyboard.press("Escape")
    plate = items("plate")[0]
    page.click('[data-sym="D:RAILF"]'); click(plate["x"] + 2, plate["y"] + 200); page.keyboard.press("Escape")
    rf = [r for r in items("rail") if r.get("free")]
    check("freie Schiene ohne 20-mm-Rand gesetzt", len(rf) == 1 and abs(rf[0]["x"] - plate["x"] - 2) < 3, rf)
    page.click('[data-sym="D:DEV:KL"]'); click(plate["x"] + 30, plate["y"] + 200); page.keyboard.press("Escape")
    kl = items("device")
    check("Klemmenblock rastet auf der freien Schiene", len(kl) == 1 and kl[0]["y"] == rf[0]["y"], kl)
    click(rf[0]["x"] + rf[0]["len"] - 20, rf[0]["y"]); page.wait_for_timeout(80)
    check("Panel: freie Schiene mit Haken", page.locator('input[data-dp="free"]').is_checked())
    page.fill('input[data-dp="len"]', "800"); page.wait_for_timeout(80)
    check("Länge frei, über die Platte hinaus", [r for r in items("rail") if r.get("free")][0]["len"] == 800)
    page.keyboard.press("Escape")

    # ---------- 4. Schienen N/PE mit 2 Klicks, N-Trenner darauf ----------
    page.click('[data-sym="D:BAR:N"]'); click(0, -300); click(300, -290); page.keyboard.press("Escape")
    bars = parts("BAR")
    check("N-Schiene waagrecht aus 2 Klicks", len(bars) == 1 and (bars[0]["c"], bars[0]["w"], bars[0]["h"]) == ("N", 300, 20), bars)
    page.click('[data-sym="D:BAR:PE"]'); click(400, -300); click(410, -600); page.keyboard.press("Escape")
    pe = [i for i in parts("BAR") if i["c"] == "PE"]
    check("PE-Schiene senkrecht", len(pe) == 1 and (pe[0]["w"], pe[0]["h"]) == (20, 300), pe)
    fill = page.evaluate("[...document.querySelectorAll('#items rect')].map(r=>r.getAttribute('fill'))")
    check("Farben: blau, grün, gelb", all(c in fill for c in ["#3b78e0", "#2fa055", "#f3d22a"]), set(fill))
    page.click('[data-sym="D:PART:NT"]'); click(150, -295); page.keyboard.press("Escape")
    nt = parts("NT")[0]; n = bars[0]
    check("N-Trenner rastet mittig auf der Schiene", abs(nt["y"] + nt["h"] / 2 - (n["y"] + n["h"] / 2)) < 0.01, (nt, n))
    page.keyboard.press("Meta+z"); page.wait_for_timeout(50)
    check("Rückgängig: N-Trenner weg, Schienen bleiben", not parts("NT") and len(parts("BAR")) == 2)
    page.keyboard.press("Meta+Shift+z"); page.wait_for_timeout(50)

    # ---------- 5. Zuleitung ----------
    page.click('[data-sym="D:CABLE"]'); click(600, -700); click(600, -400); click(700, -400); page.keyboard.press("Enter"); page.wait_for_timeout(60)
    cb = items("cable")
    check("Zuleitung mit 3 Punkten und Text", len(cb) == 1 and len(cb[0]["pts"]) == 3 and cb[0]["s"] == "Zuleitung VNB", cb)
    page.keyboard.press("Escape")
    click(600, -550); page.wait_for_timeout(80)
    check("Zuleitung wählbar, Text änderbar", page.locator('input[data-dp="s"]').count() == 1)
    page.fill('input[data-dp="s"]', "Zuleitung VNB 4x150"); page.wait_for_timeout(50)
    check("Text übernommen", items("cable")[0]["s"] == "Zuleitung VNB 4x150")
    page.evaluate("document.activeElement.blur()"); page.keyboard.press("ArrowRight"); page.wait_for_timeout(50)
    check("Zuleitung verschiebbar", items("cable")[0]["pts"][0][0] > cb[0]["pts"][0][0] and items("cable")[0]["pts"][0][1] == cb[0]["pts"][0][1], items("cable")[0]["pts"])
    page.keyboard.press("Escape")

    # ---------- 6. Vorlage Systemauftrennung AÜU ----------
    n0 = len(M()["items"])
    page.click('[data-sym="D:TPL:AUEU"]'); click(1000, -700); page.keyboard.press("Escape")
    new = M()["items"][n0:]
    kinds = sorted((i.get("c") or i.get("kind") or i["type"]) for i in new)
    check("Vorlage: PEN, N, PE, N-Trenner, Zuleitung", kinds == ["N", "NT", "PE", "PEN", "cable"], kinds)
    pen = [i for i in new if i.get("c") == "PEN"][0]; nn = [i for i in new if i.get("c") == "N"][0]; pp = [i for i in new if i.get("c") == "PE"][0]
    zul = [i for i in new if i["type"] == "cable"][0]
    check("PEN senkrecht, Zuleitung von unten", pen["h"] > pen["w"] and zul["pts"][-1][1] == pen["y"] and zul["pts"][0][1] < pen["y"], (pen, zul))
    check("N oben über dem N-Trenner, PE rechts oben", nn["y"] > pen["y"] + pen["h"] and pp["x"] >= pen["x"] + pen["w"] and pp["y"] > pen["y"] + pen["h"] / 2, (nn, pp))
    page.keyboard.press("Meta+z"); page.wait_for_timeout(60)
    check("ein Rückgängig-Schritt nimmt die ganze Vorlage weg", len(M()["items"]) == n0)
    page.keyboard.press("Meta+Shift+z"); page.wait_for_timeout(60)
    click(nn["x"] + 10, nn["y"] + 100); page.evaluate("document.activeElement.blur()"); page.keyboard.press("ArrowUp"); page.wait_for_timeout(50)
    moved = [i for i in M()["items"] if i["id"] == nn["id"]][0]
    check("danach Teile einzeln verschiebbar", moved["y"] > nn["y"] and [i for i in M()["items"] if i["id"] == pen["id"]][0]["y"] == pen["y"])
    page.keyboard.press("Escape")

    # ---------- 7. Beschriftung beim Gerät, Texte gestapelt ----------
    click(kl[0]["x"] + 5, kl[0]["y"]); page.wait_for_timeout(80)
    check("Gerät: Felder Beschriftung und BMK", page.locator('input[data-dp="beschr"]').count() == 1 and page.locator('input[data-dp="bmk"]').count() == 1)
    page.fill('input[data-dp="beschr"]', "Abgang"); page.fill('input[data-dp="bmk"]', "-X1"); page.wait_for_timeout(50)
    page.keyboard.press("Escape")
    ty = lambda s: page.evaluate(f"[...document.querySelectorAll('#items text')].filter(t=>t.textContent=={s!r}).map(t=>t.getBoundingClientRect().top)[0]")
    check("BMK über der Beschriftung (vom Gerät weg)", ty("-X1") < ty("Abgang"))

    # ---------- 8. Speichern, Version 12, DXF ----------
    with page.expect_download() as dl: page.click("#btn-save")
    saved = OUT / "dispo_wunsch.schemacad.json"; dl.value.save_as(str(saved))
    j = json.loads(saved.read_text())
    check("Datei Version 12", j["version"] == 12)
    dxf = OUT / "dispo_wunsch.dxf"; dxf.write_text(page.evaluate("window.__schemacad.exportDxf()"))
    d = ezdxf.readfile(dxf); a = d.audit()
    lay = {e.dxf.layer for e in d.modelspace()}
    tx = {e.dxf.text for e in d.modelspace().query("TEXT")}
    check("DXF ohne Audit-Fehler, Leiterfarben als Layer, Texte", not a.errors and {"SCH_DISPO_N", "SCH_DISPO_PE", "SCH_DISPO_GELB"} <= lay and {"Zuleitung VNB 4x150", "200/5", "Hauptsicherung"} <= tx, (len(a.errors), lay))
    n = page.evaluate("window.__schemacad.buildPrint()")
    html = page.evaluate("document.querySelector('#printroot').innerHTML")
    check("PDF-Seite mit Zuleitung (kräftig)", n >= 1 and "dp-cable" in html)
    page.evaluate("document.querySelector('#printroot').innerHTML = ''")

    # ---------- Beleg ----------
    page.click("#btn-new"); page.wait_for_timeout(100); page.click('[data-start="schema"]')
    if page.locator(".modal").count(): page.click('.modal [data-r="1"]')
    with page.expect_file_chooser() as fc: page.click("#btn-open")
    fc.value.set_files(str(beleg)); page.wait_for_timeout(400)
    check("Belegdatei geöffnet", page.evaluate("window.__schemacad.kind") == "dispo" and len(items("cable")) == 1)
    txts = page.evaluate("[...document.querySelectorAll('#items text')].map(t=>t.textContent)")
    check("Beleg: Schrank mit Gesamtbreite 1850 und Höhe 2000 aussen, Zählerplatten 400 | 400", "1850" in txts and "2000" in txts and txts.count("400") >= 2)
    page.keyboard.press("f"); page.wait_for_timeout(200)
    page.evaluate("document.querySelectorAll('.toast').forEach(t => t.remove())")
    page.screenshot(path=str(SHOT), clip=page.locator("#svg").bounding_box())
    b.close()
check("keine JS-Fehler", not errors, errors[:3])
print(f"Beleg: {SHOT}")
sys.exit(1 if fails else 0)
