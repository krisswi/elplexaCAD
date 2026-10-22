# UI-Tests automatische Zeit in elplexaCAD (CJ 18.10.2026): Leerlauf mit gefälschter Uhr, Hintergrund, Übersicht, Module in der Notiz,
# Sicherung im Browser, Wiederherstellen beim Öffnen, Übernehmen (auch ⌘Z), Verwerfen. Vorher: node build.mjs elplexa
# Aufruf aus web-src: python3 test/zeit_tests.py
import tempfile, json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "ElplexaCAD.html").as_uri()
TMP = Path(tempfile.mkdtemp(prefix="elplexa_zeit_"))
T0 = datetime(2026, 10, 18, 7, 0, tzinfo=timezone.utc)  # 09:00 in Zürich
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
MIN = 60_000
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1400, "height": 900}, timezone_id="Europe/Zurich", accept_downloads=True)
    ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
    def start(t):
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.clock.install(time=t); pg.goto(URL); pg.wait_for_timeout(300)
        return pg
    page = start(T0)
    D = lambda: page.evaluate("window.__schemacad.doc")
    hub = lambda: page.is_visible("#el-hub")
    n = [0]
    def act():
        n[0] += 1; page.mouse.move(300 + n[0] % 50 * 7, 300 + n[0] % 30 * 5)
    def work(minutes):  # jede Minute eine Mausbewegung
        for _ in range(minutes): act(); page.clock.run_for(MIN)
    def opn(d): return [e for e in d.get("project", {}).get("auto", []) if not e.get("x")]
    secs = lambda: sum(e["s"] for e in opn(D()))
    near = lambda a, want: abs(a - want) <= 20
    def key(k, **o):
        page.evaluate("([k, o]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }))", [k, o]); page.wait_for_timeout(120)
    def save():
        page.evaluate("document.activeElement?.blur()")
        with page.expect_download() as dl: page.keyboard.press("Meta+s")
        out = TMP / dl.value.suggested_filename; dl.value.save_as(str(out)); page.wait_for_timeout(300); return out
    def open_file(path):
        page.evaluate("document.activeElement?.blur()")
        with page.expect_file_chooser() as fc: page.keyboard.press("Meta+o")
        fc.value.set_files(str(path)); page.wait_for_timeout(300)

    page.click("#el-nav-projekte"); page.click('#el-hub [data-elact="newproj"]'); page.wait_for_timeout(150)
    page.fill('.modal [data-f="0"]', "Zeittest"); page.click(".modal [data-ok]"); page.wait_for_timeout(200)
    check("Neues Projekt: Schema offen, noch keine Zeit", not hub() and secs() == 0)

    # Leerlauf: 4 min arbeiten (letzte Bewegung bei 3 min), 20 min nichts (zählt bis 3 + 5 = 8 min), 2 min arbeiten = 10 min
    work(4); check("4 min Arbeit = 4 min", near(secs(), 240), secs())
    page.clock.run_for(20 * MIN); check("20 min Leerlauf: nur 5 min nach der letzten Bewegung gezählt", near(secs(), 480), secs())
    work(2); check("weiter 2 min: 10 min, Leerlauf über 5 min zählt nicht", near(secs(), 600), secs())
    page.evaluate("document.hasFocus = () => false; window.dispatchEvent(new Event('blur'))")
    s0 = secs()  # erst nach dem Blur messen: die Uhr läuft in echter Zeit weiter, auf langsamen Rechnern zählt sonst noch ein Takt davor
    work(3); check("Fenster im Hintergrund: keine Zeit", abs(secs() - s0) < 1, (s0, secs()))
    page.evaluate("delete document.hasFocus")
    s0 = secs(); key("0"); work(2)
    check("Übersicht offen: keine Zeit", hub() and secs() == s0, (s0, secs()))
    check("Übersicht zeigt den laufenden Tag als vorläufig, Summe 0 h", page.is_visible(".el-auto") and "heute" in page.inner_text(".el-auto") and "0 h" in page.inner_text(".el-sum"))
    page.click("#el-addmod"); page.wait_for_timeout(120); page.click('#el-addmenu [data-elnew="dispo"]'); page.wait_for_timeout(200)
    work(2)
    d = D(); e = opn(d)
    check("ein vorläufiger Eintrag für den Tag, Module Schema und Dispo", len(e) == 1 and e[0]["d"] == "2026-10-18" and e[0]["m"] == ["schema", "dispo"], e)
    check("Projekt hat eine Kennung", bool(d["project"].get("id")))
    bk = json.loads(page.evaluate(f"localStorage.getItem('elplexacad.zeit.{d['project']['id']}')") or "null")
    check("im Browser gesichert", bk and near(bk["auto"][0]["s"], e[0]["s"]), bk)
    out = save(); raw = json.loads(out.read_text())
    check("in der Datei gespeichert", raw["project"]["auto"][0]["k"] == e[0]["k"] and near(raw["project"]["auto"][0]["s"], e[0]["s"]))
    s_file = raw["project"]["auto"][0]["s"]
    work(4); s_more = secs()   # nicht mehr gespeichert
    check("weiter gezählt nach dem Speichern", near(s_more, s_file + 240), (s_file, s_more))
    check("die Zeit allein macht die Datei nicht „ungespeichert“", page.is_hidden("#dirty"))
    page.clock.run_for(MIN); page.close()

    # Nächster Tag, neues Fenster: Datei (älterer Stand) öffnen, Sicherung aus dem Browser kommt dazu
    page = start(T0 + timedelta(days=1))
    D = lambda: page.evaluate("window.__schemacad.doc")
    open_file(out); page.wait_for_timeout(200)
    e = opn(D())
    check("Wiederhergestellt aus dem Browser: Stand ohne Speichern", len(e) == 1 and near(e[0]["s"], s_more + 60), (e, s_more))
    check("Hinweis beim Öffnen", "Vorläufige Zeit" in page.inner_text("body"))
    if not hub(): key("0")
    row = page.locator(".el-auto .el-arow")
    check("Übersicht: vorläufiger Eintrag vom 18.10.2026", row.count() == 1 and "18.10.2026" in row.inner_text())
    want_h = str(max(0.25, round(s_more / 900) / 4)).replace(".", ",").removesuffix(",0")
    check("Vorschlag auf 0,25 h gerundet, Notiz mit Modulen", row.locator(".el-ah").input_value() == want_h and row.locator(".el-an").input_value() == "Schema, Dispo", (row.locator(".el-ah").input_value(), want_h, row.locator(".el-an").input_value()))
    page.screenshot(path=str(TMP / "z1_vorlaeufig.png"))
    row.locator(".el-ah").fill("0,75"); row.locator(".el-an").fill("Schema, Dispo, Besprechung")
    row.locator("[data-elzok]").click(); page.wait_for_timeout(150)
    d = D()
    check("Übernommen: normaler Eintrag mit geänderten Stunden und Notiz", d["project"]["time"] == [{"d": "2026-10-18", "h": 0.75, "n": "Schema, Dispo, Besprechung"}], d["project"].get("time"))
    check("… vorläufiger Eintrag weg, Summe 0,75 h", not opn(d) and not page.is_visible(".el-auto") and "0,75 h" in page.inner_text(".el-sum"))
    key("0"); page.evaluate("document.activeElement?.blur()"); page.keyboard.press("Meta+z"); page.wait_for_timeout(150)
    d = D()
    check("⌘Z hebt das Übernehmen auf: Eintrag wieder vorläufig", "time" not in d["project"] and [e["d"] for e in opn(d) if e["s"] >= 60] == ["2026-10-18"], d["project"])
    page.keyboard.press("Meta+Shift+z"); page.wait_for_timeout(150)
    d = D(); check("⇧⌘Z: wieder übernommen", len(d["project"].get("time", [])) == 1 and all(e["d"] != "2026-10-18" for e in opn(d)))

    # Heute arbeiten, dann verwerfen
    work(3)
    e = opn(D()); check("neuer Tag: eigener vorläufiger Eintrag", len(e) == 1 and e[0]["d"] == "2026-10-19", e)
    key("0")
    check("heute als vorläufig sichtbar", "heute" in page.inner_text(".el-auto"))
    page.click(".el-auto [data-elzweg]"); page.wait_for_timeout(150)
    d = D()
    check("Verworfen: kein Eintrag, nichts in Summe", not opn(d) and len(d["project"]["time"]) == 1 and not page.is_visible(".el-auto"))
    bk = json.loads(page.evaluate(f"localStorage.getItem('elplexacad.zeit.{d['project']['id']}')"))
    check("Sicherung kennt übernommen und verworfen", sorted(x.get("x", "") for x in bk["auto"]) == ["ok", "weg"], bk)
    out2 = save(); page.close()
    page = start(T0 + timedelta(days=1, hours=2)); D = lambda: page.evaluate("window.__schemacad.doc")
    open_file(out2); d = D()
    check("wieder geöffnet: nichts Vorläufiges mehr, Zeit bleibt", not opn(d) and len(d["project"]["time"]) == 1 and not page.is_visible(".el-auto"))
    b.close()
check("keine Fehler in der Konsole", not errors, errors[:5])
print(f"\n{len(fails)} Fehler" if fails else "\nalle Tests ok")
raise SystemExit(1 if fails else 0)
