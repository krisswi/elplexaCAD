# Symbole nach Musterschema (CJ 16.10.2026): DXF der neuen Symbole mit ezdxf prüfen, Polzahl-Auswahl im Browser.
# Aufruf aus web-src: python3 test/symbole_tests.py
import subprocess, tempfile, os
from pathlib import Path
import ezdxf
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "schemacad.html").as_uri()
fails, errors = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)
out = os.path.join(tempfile.mkdtemp(), "symbole.dxf")
r = subprocess.run(["node", "test/test_symbole.mjs", out], cwd=ROOT, capture_output=True, text=True)
check("Modelltests neue Symbole", r.returncode == 0 and "ok" in r.stdout, r.stderr[-500:])
doc = ezdxf.readfile(out); aud = doc.audit()
check("DXF ohne Audit-Fehler", len(aud.errors) == 0, str(len(aud.errors)))
names = {e.dxf.name for e in doc.modelspace().query("INSERT")}
want = {"LS_3PN", "LS_3PT", "NH_3PT", "HAK_4P", "ZAEHLER_4P", "SPD_4P", "RELAIS_1P", "SCHUETZ_3P"}
check("Blöcke HAK, Zähler, SPD, Schütz, Relais, 3P+N im DXF", want <= names, str(want - names))
texts = [t.dxf.text for t in doc.blocks.get("FI_4P").query("TEXT MTEXT")] if "FI_4P" in doc.blocks else []
check("FI-Block im DXF", len(doc.blocks.get("FI_4P").query("LINE")) > 20, str(texts))
check("Blöcke TN-C > TN-S und Erde im DXF", {"TNC_TNS", "ERDE_1P"} <= names, str(names))
z = doc.blocks.get("ZAEHLER_4P"); pl = [e for e in z.query("LWPOLYLINE") if e.dxf.const_width > 0] if z else []
check("Zähler-Block ohne Punkte (CJ 16.10.)", z is not None and len(pl) == 0, str(len(pl)))
check("Wandlermessung im DXF", doc.blocks.get("ZAEHLER_4P_W") is not None and len(doc.blocks.get("ZAEHLER_4P_W").query("LINE")) > 40)
r = doc.blocks.get("RCBO_4P"); check("RCBO-Block mit Prüftaste (zwei Abgriffpunkte)", r is not None and len([e for e in r.query("LWPOLYLINE") if e.dxf.const_width > 0]) == 2)
hak = [a.dxf.text for e in doc.modelspace().query("INSERT") if e.dxf.name == "HAK_4P" for a in e.attribs]
check("HAK mit Attributen BMK, Strom, Baugrösse", hak[:3] == ["HAK", "63A", "NH00"], str(hak))
with sync_playwright() as p:
    b = p.chromium.launch(); page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(100)
    for fam in ("HAK_4P", "ZAEHLER_4P", "SPD_4P", "NTRENN_1P", "RELAIS_1P", "SCHUETZ_3P", "TNC_TNS", "ERDE_1P"):
        check(f"Palette zeigt {fam}", page.locator(f'[data-sym="{fam}"]').count() == 1)
    page.click('[data-sym="SPD_4P"]'); page.wait_for_timeout(100)
    opts = page.locator("[data-placepoles] option").all_inner_texts()
    check("SPD-Auswahl mit 1+1 und 3+1", len(opts) == 6 and any(o.startswith("3+1") for o in opts) and any(o.startswith("1+1") for o in opts), str(opts))
    page.keyboard.press("Escape")
    page.click('[data-sym="LS_4P"]'); page.wait_for_timeout(100)
    opts = page.locator("[data-placepoles] option").all_inner_texts()
    check("LS-Auswahl mit 3P+N und N-Trenner", "3P+N" in opts and "3P + N-Trenner" in opts and "4-polig" in opts, str(opts))
    page.select_option("[data-placepoles]", "LS_3PN")
    v = page.evaluate("window.__schemacad.view"); r = page.evaluate("(()=>{const r=document.querySelector('#svg').getBoundingClientRect();return {l:r.left,t:r.top}})()")
    X, Y = r["l"] + v["x"] + 100 * v["z"], r["t"] + v["y"] + (210 - 150) * v["z"]
    page.mouse.move(X, Y); page.mouse.click(X, Y); page.wait_for_timeout(150); page.keyboard.press("Escape")
    items = page.evaluate("window.__schemacad.model").get("items", [])
    ls = [i for i in items if i.get("sym") == "LS_3PN"]
    term = [i for i in items if i.get("type") == "terminals"]
    check("LS 3P+N gesetzt mit Nummer und 5 Klemmen (4 Pole + PE)", len(ls) == 1 and "F" in ls[0]["attrs"]["BMK"] and term and term[-1]["n"] == 5, str(ls) + str(term[-1:] ))
    # Tasten 1 bis 4 und N beim Setzen und am gewählten Symbol (CJ 16.10.)
    page.click('[data-sym="LS_4P"]'); page.wait_for_timeout(80)
    page.keyboard.press("1"); page.keyboard.press("n"); page.wait_for_timeout(80)
    check("Taste 1 und N beim Setzen: LS 1P+N", page.locator("[data-placepoles]").input_value() == "LS_1PN", page.locator("[data-placepoles]").input_value())
    page.keyboard.press("t"); page.wait_for_timeout(80)
    check("Taste T beim Setzen: LS 1P + N-Trenner, Werkzeug bleibt", page.locator("[data-placepoles]").input_value() == "LS_1PT", page.locator("[data-placepoles]").count())
    page.keyboard.press("n"); page.wait_for_timeout(80)
    X2, Y2 = r["l"] + v["x"] + 200 * v["z"], r["t"] + v["y"] + (210 - 150) * v["z"]
    page.mouse.move(X2, Y2); page.mouse.click(X2, Y2); page.wait_for_timeout(150); page.keyboard.press("Escape")
    items = page.evaluate("window.__schemacad.model").get("items", []); new = [i for i in items if i.get("sym") == "LS_1PN"]
    check("LS 1P+N gesetzt", len(new) == 1)
    page.mouse.click(X2 + 2, Y2 + 10 * v["z"]); page.wait_for_timeout(100)
    page.keyboard.press("3"); page.wait_for_timeout(120)
    items = page.evaluate("window.__schemacad.model").get("items", [])
    one = [i for i in items if i["id"] == new[0]["id"]][0]
    term = [i for i in items if i.get("type") == "terminals" and i.get("of") == one["id"]]
    check("Taste 3 am gewählten Symbol: LS 3P+N, Klemmen 5", one["sym"] == "LS_3PN" and (not term or term[0]["n"] == 5), one["sym"] + str(term))
    b.close()
check("keine Seitenfehler", not errors, str(errors))
print("FEHLER:" if fails else "alle ok", fails if fails else "")
raise SystemExit(1 if fails else 0)
