# Start von elplexaCAD (CJ 27.10.2026): die App öffnet in der Liste «Projekte». Tests, die danach die Projektansicht mit den
# Modulkacheln erwarten, wechseln mit projektansicht(page) dorthin (Karte des offenen Projekts). Ohne Liste (z. B. geteilte Ansicht) nichts.
def projektansicht(page):
    if page.locator("#el-pt-cur").count():
        page.click("#el-pt-cur"); page.wait_for_timeout(150)
