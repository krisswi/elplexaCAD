# Symbol- und Farbübersetzung alt → elplexaCAD

Für den Skill `plan-aufbereiten` (`.claude/skills/plan-aufbereiten/SKILL.md`). Einträge liefert CJ; neue Einträge sofort hier eintragen. Keine Kundendaten, nur Symbolarten.
Neu = `key` aus `src/plansym/*.js` (`PLAN_SYMS`), Leitungsart aus `LINE_KINDS`, Farbe aus `PLAN_COLS` (`src/plan.js`).

## Symbole

| Alt (Aussehen auf dem Plan) | Neu `key` | Ebene | Bemerkung | Seit |
|---|---|---|---|---|
| Kreis mit senkrechtem Strich an der Wand | `STD` | Apparate | mit «3f» daneben = `STD3` | 30.10.2026 |
| zwei übereinander stehende Kreise mit kleinem Strich (neben Türen) | `KOMBI` | Apparate | Kombination Schalter/Steckdose | 30.10.2026 |
| gefülltes Dreieck | `VERWEIS` | Apparate | Verweis auf die Hauptverteilung, Text «HV», Richtung wie im Scan | 30.10.2026 |
| leerer Kreis, Kreis mit Schrägstrich oder kurzem Strich, mit EB-Typ, im Korridor (Entrée, Vorraum) | `LEUCHTE_EB` | Apparate | Einbauleuchte, Typ als `txt` | 30.10.2026 |
| Kreis, von dem viele Leitungen ausgehen («Strahlen», Fächer) | `DOSE` | Apparate | Abzweigdose (Eingang, Küche); früher irrtümlich als Leuchte gelesen | 30.10.2026 |
| Kreis mit waagrechtem Strich (viele Leitungen gehen ab) | `DOSE` | Apparate | Abzweigdose | 30.10.2026 |
| drei übereinander stehende Kreise mit Haken | 3 × `SCH0` | Apparate | drei Schalter untereinander | 30.10.2026 |
| grünes Kästchen mit Schrägstrich | `TEL_STD` | Apparate | Telefon | 30.10.2026 |
| orange «TV», «UKW» | `RTV_STD` | Apparate | Antenne/TV | 30.10.2026 |
| Kreis mit Schrägstrich und Pfeil (bei Tür) | `DIMMER` | Apparate | Lichtregler | 30.10.2026 |
| Kreis mit V an der Wand (WC, «Lp») | `LEUCHTE_W` | Apparate | Wandleuchte | 30.10.2026 |
| Kreis mit T-Strich (WC, «Stdd») | `STD` | Apparate | Steckdose; mit Kreis mit Haken darunter = `KOMBI` (Kleinkombi) | 30.10.2026 |
| Kreis mit «5» (braun) | `KLINGEL` | Apparate | Gong, Sonnerie | 30.10.2026 |
| einzelner Kreis mit Haken | `SCH0` | Apparate | Schalter (wie die drei übereinander) | 30.10.2026 |
| grosser Kreis mit Kreuz an der Wand, aussen | `LEUCHTE_W` | Apparate | Aussenleuchte; Text wie im Scan (z. B. «Lp Dübel») | 30.10.2026 |
| grünes Kästchen «GS» (Eingang, Garage) | `AMTSVERT` | Apparate | Anschlusskasten Swisscom (BEP), Text «BEP Swisscom»; Symbol als Annahme gewählt | 30.10.2026 |
| Gruppe Kreise/Kästchen mit «Schaltuhr» | `SCH0` + `DOSE` | Apparate | Schalter und Abzweigdose, Hinweis als Text | 30.10.2026 |
| Kreis mit Strich, Leitung zu Querstrich (Garage) | `FL` | Apparate | FL-Armatur (Balkenleuchte) | 30.10.2026 |
| Kreis mit Schrägstrich, im Zimmer | `LEUCHTE` | Apparate | Deckenleuchte; Typangabe (z. B. «Kugel EB 3226W») als `txt` | 30.10.2026 |

## Leitungen (Strichart)

| Alt (Strichart) | Neu `kind` | Bemerkung | Seit |
|---|---|---|---|
| grüne Linie | `decke`, `curve: true`, `col` Grün `#22862a` | Telefon | 30.10.2026 |
| blaue Linie, Pfeil mit «16», «Leerrohr» | `decke`, `col` Braun `#8f5214` | Leerrohr/Schwachstrom; Angaben (R.F., AF, 16) als Text auf Beschriftung | 30.10.2026 |
| rot gestrichelt, gerade | `boden` | Strichart wie im Scan übernommen (Annahme) | 30.10.2026 |
| dünne rote Bogenlinie (Apparat → Leuchte, Apparat → HV) | `decke`, `curve: true` | Farbe = Vorgabe (blau), nicht rot übernehmen | 30.10.2026 |

## Farben

| Alt (Farbe auf dem Plan) | Neu `col` | Bedeutung | Seit |
|---|---|---|---|
| Rot (Leitungen) | Vorgabe (blau `#0068c9`) | Starkstrom; Farbe nicht übernehmen | 30.10.2026 |
| Grün | Grün `#22862a` | Telefon | 30.10.2026 |
| Blau | Braun `#8f5214` | Leerrohr, Schwachstrom | 30.10.2026 |
| Orange | Violett `#7b3a96` (Radio/TV) | Antenne; Annahme, bei RTV-Leitungen nachfragen | 30.10.2026 |
