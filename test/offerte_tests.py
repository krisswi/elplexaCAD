# UI-Tests für das Modul Offerte (Schritt 1, CJ 26.10.2026) in SchemaCAD v3 und elplexaCAD. Aufruf: python3 test/offerte_tests.py [Ausgabeordner]
# Kapitel aus dem BKP-Katalog, Position per Tastatur (Tab), Summen mit Rundung, Option, Rabatt, Rückgängig, Datei Version 25, Absender aus dem Firmenprofil (Schritt 2).
# Schritt 5: PDF mit und ohne Preise (v3 Druckseiten, elplexaCAD echtes PDF), Excel-Download mit Formeln, ohne EK und Zeit; Blattleiste als Kapitelliste, Variante und Nachtrag.
import sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="offerte_"))
OUT.mkdir(parents=True, exist_ok=True)
errors, fails = [], []
def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {info}" if info and not cond else ""))
    if not cond: fails.append(name)

def flow(page, tag):
    D = lambda: page.evaluate("window.__schemacad.doc")
    txt = lambda s: page.locator(s).first.inner_text()
    check(f"{tag}: Offerte offen, Zeichenfläche weg", page.evaluate("window.__schemacad.kind") == "offerte" and page.is_visible("#of-view") and not page.is_visible("#svg"))
    page.click('[data-ofact="addkap"][data-bkp="232.51"]'); page.wait_for_timeout(100)
    check(f"{tag}: Kapitel 232.51 mit Titel aus dem BKP", page.input_value('.of-kh .of-kt') == "Lichtinstallationen allgemein")
    page.keyboard.type("Küche"); page.keyboard.press("Tab")
    page.click('[data-ofact="addpos"]'); page.wait_for_timeout(100)
    for v in ["Steckdose T13", "UP", "22", "3", "Stk", "58,47"]: page.keyboard.type(v); page.keyboard.press("Tab")
    page.wait_for_timeout(100)
    off = lambda d: next(s for s in d["sheets"] if s.get("kind") == "offerte")  # elplexaCAD: Projekt kann weitere Module haben
    pos = off(D())["of"]["kap"][0]["grp"][0]["pos"][0]
    check(f"{tag}: Tab füllt die Position", [pos.get(k) for k in ["titel", "text", "ic", "menge", "eh", "preis"]] == ["Steckdose T13", "UP", "22", 3, "Stk", 58.47], pos)
    check(f"{tag}: Betrag ungerundet wie im Excel (3 × 58.47 = 175.41)", txt(".of-amt") == "175.41", txt(".of-amt"))
    check(f"{tag}: nur Total auf 5 Rappen (175.41 + 8.1 % = 189.62 → 189.60), Rundung als Zeile", txt(".of-total").endswith("189.60") and "Rundung" in page.inner_text(".of-end"), txt(".of-total"))
    page.click('[data-ofact="addpos"]'); page.keyboard.type("Option"); page.keyboard.press("Tab")
    page.fill('.of-pos >> nth=1 >> [data-of$=".menge"]', "1"); page.keyboard.press("Tab")
    page.fill('.of-pos >> nth=1 >> [data-of$=".preis"]', "80"); page.keyboard.press("Tab")
    page.check('.of-pos >> nth=1 >> [data-of$=".opt"]'); page.wait_for_timeout(100)
    check(f"{tag}: Option zählt nicht, eigene Summe", txt(".of-total").endswith("189.60") and "80.00" in page.inner_text(".of-end"))
    page.fill('[data-of="o.rabatt"]', "5"); page.keyboard.press("Tab"); page.wait_for_timeout(100)
    end = page.inner_text(".of-end")
    check(f"{tag}: Rabatt 5 % = 8.77, Total 180.15", "Rabatt 5 % auf 175.41" in end and "8.77" in end and txt(".of-total").endswith("180.15"), end)
    page.click("#btn-undo"); page.wait_for_timeout(100)
    check(f"{tag}: Rückgängig nimmt den Rabatt zurück", txt(".of-total").endswith("189.60"), txt(".of-total"))
    d = D()
    check(f"{tag}: Datei Version 25", d["version"] == 25 and off(d)["of"]["rabatt"] == 0, d["version"])
    # Schritt 2: Absender aus dem Firmenprofil (gilt für alle Module, beide Stände)
    check(f"{tag}: Absender ohne Profil", "Noch kein Firmenprofil" in page.inner_text("#right"))
    page.click('[data-ofact="profil"]'); page.wait_for_timeout(150)
    page.fill('.modal [data-pf="FIRMA"]', "Muster Elektro"); page.fill('.modal [data-pf="TEL"]', "031 000 00 00"); page.fill('.modal [data-pf="MWST"]', "CHE-000.000.000 MWST"); page.click(".modal [data-ok]"); page.wait_for_timeout(200)
    check(f"{tag}: Absender zeigt das Profil mit MwSt-Nr.", "Muster Elektro" in page.inner_text(".of-sender") and "031 000 00 00" in page.inner_text(".of-sender") and "MwSt-Nr. CHE-000.000.000 MWST" in page.inner_text(".of-sender"))
    page.uncheck('[data-of="o.mwstan"]'); page.wait_for_timeout(100)
    check(f"{tag}: MwSt aus: Total ohne MwSt 175.40", "Total ohne MwSt" in txt(".of-end") and txt(".of-total").endswith("175.40") and not page.is_visible('[data-of="o.mwst"]'), txt(".of-total"))
    page.check('[data-of="o.mwstan"]'); page.wait_for_timeout(100)
    check(f"{tag}: MwSt wieder ein: 8.1 %", txt(".of-total").endswith("189.60") and page.input_value('[data-of="o.mwst"]') == "8.1", txt(".of-total"))
    check(f"{tag}: Mausrad scrollt die Offerte (Zeichenfläche hält es nicht an)", not page.evaluate("(() => { const e = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }); document.querySelector('#of-view').dispatchEvent(e); return e.defaultPrevented; })()"))
    check(f"{tag}: Profil im Browser gespeichert", page.evaluate("JSON.parse(localStorage.getItem('schemacad.user.profil.v1')).data.FIRMA") == "Muster Elektro")
    # Schritt 3: Positionsdatenbank beim Benutzer (erfundene Werte)
    check(f"{tag}: Datenbank leer", "Noch keine Position" in page.inner_text("#left"))
    page.click('.of-pos >> nth=0 >> [data-ofact="det"]'); page.wait_for_timeout(100)
    page.fill('[data-of$=".her"]', "Muster AG"); page.keyboard.press("Tab")
    page.fill('[data-of$=".enr"]', "111 222 333"); page.keyboard.press("Tab"); page.wait_for_timeout(100)
    page.click('[data-ofact="dbsave"]'); page.wait_for_timeout(200)
    check(f"{tag}: Position in der Datenbank gespeichert", "1 Position in deiner Datenbank" in page.inner_text("#left"), page.inner_text("#left")[:200])
    page.fill("#of-posfind", "111222"); page.wait_for_timeout(100)
    check(f"{tag}: Suche nach E-Nr. ohne Leerzeichen", page.locator(".of-dbadd").count() == 1 and "Steckdose T13" in txt(".of-dbadd"))
    page.click('[data-ofact="addgrp"]'); page.wait_for_timeout(100); page.keyboard.type("Bad"); page.keyboard.press("Tab"); page.wait_for_timeout(100)
    page.click(".of-dbadd"); page.wait_for_timeout(150)
    g = off(D())["of"]["kap"][0]["grp"]
    cp = g[1]["pos"][0] if len(g) > 1 and g[1]["pos"] else {}
    check(f"{tag}: Treffer in die zuletzt bearbeitete Gruppe kopiert, ohne Menge", cp.get("titel") == "Steckdose T13" and cp.get("enr") == "111 222 333" and "menge" not in cp and cp.get("id") != pos.get("id"), g)
    page.keyboard.type("4"); page.keyboard.press("Tab"); page.wait_for_timeout(100)
    check(f"{tag}: Kopie frei änderbar, Fokus auf Menge", off(D())["of"]["kap"][0]["grp"][1]["pos"][0].get("menge") == 4)
    # Schritt 5: PDF und Excel, mit und ohne Preise. EK, Faktor, Zeit und Ansatz nie in der Ausgabe (EK 9.99 und Zeit 0.77 als Merkmal).
    page.fill('[data-of$=".ek"] >> nth=0', "9.99"); page.keyboard.press("Tab"); page.wait_for_timeout(50)
    page.fill('[data-of$=".std"] >> nth=0', "0.77"); page.keyboard.press("Tab"); page.wait_for_timeout(100)
    page.evaluate("""() => { window.__cap = []; window.print = () => { window.__cap.push(document.querySelector('#printroot').innerHTML); setTimeout(() => dispatchEvent(new Event('afterprint')), 10); };
      window.open = (u) => { window.__cap.push(u); return {}; }; }""")
    for prices in ["1", "0"]:
        page.click(f'[data-ofact="out"][data-kind="pdf"][data-prices="{prices}"]'); page.wait_for_timeout(3000 if tag == "elplexa" else 400)
    cap = page.evaluate("window.__cap")
    if tag == "v3":
        strip = lambda s: __import__("re").sub(r"<[^>]+>", " ", s)
        a, b = (strip(x) for x in cap) if len(cap) == 2 else ("", "")
        check(f"{tag}: PDF mit Preisen: Kopf, Kapitelsumme, Schluss, Firma", all(x in a for x in ["Offerte", "Muster Elektro", "Total Lichtinstallationen allgemein BKP 232", "Schlusszusammenstellung", "Seite 1 von 1"]), a[:300])
        check(f"{tag}: PDF ohne Preise ohne Beträge", "(ohne Preise)" in b and "Betrag" not in b and "175.41" not in b and "Schlusszusammenstellung" not in b, b[:300])
        check(f"{tag}: PDF ohne EK und Zeit", not any(x in a + b for x in ["9.99", "0.77"]))
    else:
        pdfs = [page.evaluate("async (u) => { const b = new Uint8Array(await (await fetch(u)).arrayBuffer()); let s = ''; for (const c of b) s += String.fromCharCode(c); return btoa(s); }", u) for u in cap]
        for i, b64 in enumerate(pdfs): (OUT / f"offerte_{'mit' if i == 0 else 'ohne'}_preise.pdf").write_bytes(__import__("base64").b64decode(b64))
        check(f"{tag}: zwei PDF erstellt (mit und ohne Preise), A4 hoch", len(pdfs) == 2 and all(b"/MediaBox [0 0 595.27" in __import__("base64").b64decode(x) for x in pdfs), len(pdfs))
    with page.expect_download() as dl: page.click('[data-ofact="out"][data-kind="xlsx"][data-prices="1"]')
    x = OUT / f"{tag}_offerte.xlsx"; dl.value.save_as(x)
    import zipfile
    sh = zipfile.ZipFile(x).read("xl/worksheets/sheet1.xml").decode()
    check(f"{tag}: Excel mit Formeln, ohne EK und Zeit", dl.value.suggested_filename.endswith("_Offerte.xlsx") and "<f>SUMIFS(" in sh and "Muster Elektro" in sh and "9.99" not in sh and "0.77" not in sh, dl.value.suggested_filename)
    # Blattleiste (CJ 26.10.2026): Kapitel springen, Plus = Variante oder Nachtrag als eigenes Offerten-Modul
    page.click('[data-ofact="addkap"][data-bkp="236"]'); page.wait_for_timeout(150)
    page.evaluate("document.querySelector('#of-view').scrollTop = 0"); page.wait_for_timeout(100)
    page.click("#sheetbar [data-ofkap]"); page.wait_for_timeout(200)
    items = page.locator("#of-menu [data-ofm]").all_inner_texts()
    check(f"{tag}: Kapitelliste mit Schlusszusammenstellung", len(items) == 3 and "BKP 236" in items[1] and items[2] == "Schlusszusammenstellung", items)
    page.click('#of-menu [data-ofm="k:2"]'); page.wait_for_timeout(200)
    check(f"{tag}: Sprung zur Schlusszusammenstellung", page.evaluate("(() => { const v = document.querySelector('#of-view'), e = document.querySelector('.of-end'); return Math.abs(e.getBoundingClientRect().top - v.getBoundingClientRect().top - 8) < 3 || v.scrollTop + v.clientHeight >= v.scrollHeight - 2; })()"))
    if tag == "elplexa":
        check(f"{tag}: Leiste zeigt das Kapitel", "von 3" in page.inner_text("#sheetbar"), page.inner_text("#sheetbar"))
        page.click('#sheetbar [data-ofstep="-1"]'); page.wait_for_timeout(200)
        check(f"{tag}: ‹ springt ein Kapitel zurück", "BKP 236" in page.inner_text("#sheetbar") and "2 von 3" in page.inner_text("#sheetbar"), page.inner_text("#sheetbar"))
    else: check(f"{tag}: v3 blättert weiter durch die Blätter", page.locator('#sheetbar [data-step="-1"]').count() == 1 and page.locator("#sheetbar .of-kapbtn").count() == 1)
    n0 = len([x for x in D()["sheets"] if x.get("kind") == "offerte"])
    page.click("#sheetbar [data-ofplus]"); page.wait_for_timeout(150); page.click('#of-menu [data-ofm="var"]'); page.wait_for_timeout(300)
    d = D(); offs = [x for x in d["sheets"] if x.get("kind") == "offerte"]
    check(f"{tag}: Variante = Kopie als eigenes Modul mit Namen", len(offs) == n0 + 1 and offs[-1].get("var") == 2 and len(offs[-1]["of"]["kap"]) == 2 and offs[-1]["of"]["ver"] == "Variante 2" and d.get("mods", {}).get("offerte:2", {}).get("name") == "Offerte – Variante 2", d.get("mods"))
    page.click("#sheetbar [data-ofplus]"); page.wait_for_timeout(150); page.click('#of-menu [data-ofm="nach"]'); page.wait_for_timeout(300)
    d = D(); o = [x for x in d["sheets"] if x.get("kind") == "offerte"][-1]
    check(f"{tag}: Nachtrag = leere Offerte, gleiche Nummer", o.get("var") == 3 and not o["of"]["kap"] and o["of"]["ver"] == "Nachtrag 1" and d["mods"]["offerte:3"]["name"] == "Offerte – Nachtrag 1", o["of"])
    page.screenshot(path=str(OUT / f"{tag}.png"))

with sync_playwright() as p:
    b = p.chromium.launch()
    for tag, file in [("v3", "schemacad.html"), ("elplexa", "ElplexaCAD.html")]:
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto((ROOT / "dist" / file).as_uri()); page.evaluate("localStorage.clear()"); page.reload(); page.wait_for_timeout(400)
        if tag == "v3": page.click('[data-start="offerte"]')
        else:
            if page.is_visible(".modal.start"): page.click('[data-start="offerte"]')
            else: page.click("#el-addmod"); page.click('[data-elnew="offerte"]')
        page.wait_for_timeout(300)
        flow(page, tag)
        ctx.close()
    b.close()
check("keine JS-Fehler", not errors, errors)
print("FEHLER:" if fails else "ALLE OK", fails, "| Ausgaben:", OUT)
sys.exit(1 if fails else 0)
