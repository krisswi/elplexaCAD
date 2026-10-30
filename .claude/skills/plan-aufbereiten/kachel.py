# Skill plan-aufbereiten: Ausschnitt eines entzerrten Bildes nach Weltkoordinaten (mm), zum Ablesen in Vollauflösung.
# Aufruf: python3 kachel.py entzerrt.png k x0 y1 aus.png xa xb ya yb  (k, x0, y1 wie bei entzerren.py; Welt x = x0 + px·k, y = y1 − py·k)
import sys, subprocess
img, k, x0w, y1w, name, xa, xb, ya, yb = sys.argv[1], *map(float, sys.argv[2:5]), sys.argv[5], *map(float, sys.argv[6:10])
i, j = int((xa - x0w) / k), int((y1w - yb) / k)
subprocess.run(["sips", "-c", str(int((yb - ya) / k)), str(int((xb - xa) / k)), "--cropOffset", str(j), str(i), img, "--out", name], check=True, capture_output=True)
