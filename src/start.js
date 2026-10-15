// SchemaCAD: Startauswahl beim Öffnen der App und bei „Neu“. Weitere Blatttypen kommen als neuer Eintrag in KINDS dazu.
import { openModal } from "./dialogs.js";
import * as R from "./render.js";

const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const KINDS = [
  { id: "schema", label: "Schema", sub: "Stromlaufschema mit Grundverkabelung", icon: svg('<path d="M3 5h18M3 19h18M8 5v4M8 15v4M16 5v14"/><rect x="5.5" y="9" width="5" height="6" rx="1"/>') },
  { id: "dispo", label: "Disposition", sub: "Verteileraufbau mit Montageplatten, massstäblich", icon: svg('<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M6 9h12M6 15h12"/><path d="M8 7.5v3M11 7.5v3M14 7.5v3"/>') },
  { id: "pv", label: "Stringplan", sub: "PV-Strangplan auf einem PDF-Dachplan", icon: svg('<rect x="3" y="5" width="8" height="6"/><rect x="13" y="5" width="8" height="6"/><rect x="3" y="13" width="8" height="6"/><rect x="13" y="13" width="8" height="6"/><path d="M7 11v2M17 11v2"/>') },
];

// Gibt "schema", "dispo", "pv", "open" oder null (abgebrochen) zurück
export function startDialog() {
  const tiles = KINDS.map((k) => `<button class="start-tile" data-start="${k.id}"><span class="start-ic">${k.icon}</span><span class="start-t">${R.esc(k.label)}</span><span class="start-s">${R.esc(k.sub)}</span></button>`).join("");
  return openModal("Was möchtest du zeichnen?", `<p>Weitere Blätter anderer Art fügst du später unten über + hinzu.</p><div class="start-grid">${tiles}</div><div class="actions"><button class="btn outline" data-start="open">Datei öffnen …</button><button class="btn outline" data-c>Abbrechen</button></div>`, (b, done) => {
    if (b.dataset.start) done(b.dataset.start);
    else if (b.dataset.c !== undefined) done(null);
  }, null, '[data-start="schema"]', "start");
}
