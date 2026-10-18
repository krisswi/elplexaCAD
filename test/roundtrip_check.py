#!/usr/bin/env python3
"""Liest ein DXF wieder ein, prueft es und listet Bloecke/Attribute (Round-Trip-Test)."""
import sys
import ezdxf
from ezdxf import recover

path = sys.argv[1]
try:
    doc = ezdxf.readfile(path)
except ezdxf.DXFStructureError:
    doc, aud = recover.readfile(path)
    print("WARNUNG: Datei musste repariert werden:", len(aud.errors), "Fehler")
aud = doc.audit()
print(f"Version: {doc.dxfversion}  Einheiten: {doc.units}  Audit-Fehler: {len(aud.errors)}")
print("Layer:", sorted(l.dxf.name for l in doc.layers if l.dxf.name != "0"))
print("Bloecke:", sorted(b.name for b in doc.blocks if not b.name.startswith("*")))
refs = {}
for e in doc.modelspace().query("INSERT"):
    refs.setdefault(e.dxf.name, []).append({a.dxf.tag: a.dxf.text for a in e.attribs})
for name, items in sorted(refs.items()):
    print(f"  {name}: {len(items)}x")
    for it in items:
        print("     ", it)
