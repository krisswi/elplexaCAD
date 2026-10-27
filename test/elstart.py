# Start von elplexaCAD (CJ 27.10.2026): die App öffnet in der Liste «Projekte». Tests, die danach die Projektansicht mit den
# Modulkacheln erwarten, wechseln mit projektansicht(page) dorthin (Karte des offenen Projekts). Ohne Liste (z. B. geteilte Ansicht) nichts.
def projektansicht(page):
    if page.locator("#el-pt-cur").count():
        page.click("#el-pt-cur"); page.wait_for_timeout(150)

# Dateien im Projekt (CJ 27.10.2026): jedes PDF landet unter Dateien und hebt die Datei auf Version 30. Tests, die danach eine
# bestimmte Dateiversion prüfen, entfernen die Einträge vorher über die Projektübersicht (× und Bestätigen).
def dateien_leeren(page):
    while page.locator("#el-hub [data-elfrm]").count():
        page.locator("#el-hub [data-elfrm]").first.dispatch_event("click"); page.wait_for_timeout(150) # Knopf kann unter einer Leiste liegen
        page.click("#modal-root [data-r='1']"); page.wait_for_timeout(200)
