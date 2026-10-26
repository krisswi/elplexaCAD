// Firmenprofil beim Benutzer (Offerte Schritt 2, CJ 26.10.2026): Firma, Adresse, Logo, Mail, Telefon. Alle Module übernehmen es von hier:
// neue Titelseiten (titel.js loadFirm), der Absender der Offerte. Gespeichert über die Speicherschicht (ablage.js, Name "profil").
// Vorher lag nur Firma, Adresse und Logo im Browser (schemacad.firma.v1); das wird beim ersten Lesen übernommen.
import * as A from "./ablage.js";
import { esc } from "./render.js";

export const PROFIL_FIELDS = [
  { key: "FIRMA", label: "Firma" },
  { key: "FIRMA_ADR", label: "Adresse", multi: true },
  { key: "MAIL", label: "E-Mail" },
  { key: "TEL", label: "Telefon" },
  { key: "MWST", label: "MwSt-Nr." }, // CJ 26.10.2026, steht im Absender der Offerte
];
export const MAX_LOGO = 300 * 1024; // Bytes der Bilddatei, wie die Titelseite
const LOGO = /^data:image\/(png|jpeg|svg\+xml);base64,/;
const OLD_KEY = "schemacad.firma.v1";

export function cleanProfil(o) {
  const p = {};
  for (const f of PROFIL_FIELDS) p[f.key] = String(o?.[f.key] ?? "").slice(0, f.multi ? 1000 : 200);
  if (typeof o?.logo === "string" && LOGO.test(o.logo) && o.logo.length <= Math.ceil(MAX_LOGO * 4 / 3) + 40) p.logo = o.logo;
  return p;
}
export const hasProfil = (p) => !!p && (PROFIL_FIELDS.some((f) => String(p[f.key] ?? "").trim()) || !!p.logo);

function legacy() { try { return JSON.parse(localStorage.getItem(OLD_KEY) || "null"); } catch { return null; } }
export const loadProfil = () => cleanProfil(A.load("profil") ?? legacy());
export const saveProfil = (p, opt) => A.save("profil", cleanProfil(p), opt);
export const syncProfil = () => A.sync("profil");

// Absender in einer Zeile je Angabe (Offerte, Profil-Reiter)
export const profilLines = (p) => [p.FIRMA, ...String(p.FIRMA_ADR || "").split("\n"), p.MAIL, p.TEL, p.MWST && `MwSt-Nr. ${String(p.MWST).trim().replace(/^MwSt-Nr\.?\s*/i, "")}`].map((s) => String(s ?? "").trim()).filter(Boolean);

// Fenster «Firmenprofil» (beide Stände). openModal und toast aus dialogs.js. Gibt das gespeicherte Profil zurück oder null (abgebrochen).
export function profilDialog({ openModal, toast }, { online = false } = {}) {
  let p = loadProfil();
  const field = (f) => `<div class="field"><label for="pf-${f.key}">${esc(f.label)}</label>${f.multi
    ? `<textarea id="pf-${f.key}" data-pf="${f.key}" rows="3" spellcheck="false">${esc(p[f.key])}</textarea>`
    : `<input id="pf-${f.key}" type="text"${f.key === "MAIL" ? ' inputmode="email"' : f.key === "TEL" ? ' inputmode="tel"' : ""} data-pf="${f.key}" value="${esc(p[f.key])}" autocomplete="off" spellcheck="false">`}</div>`;
  const logoRow = () => `<div class="row pf-logo">${p.logo ? `<img src="${p.logo}" alt="Logo" style="max-height:40px;max-width:160px">` : ""}<button type="button" class="btn outline small" data-pfl="load">${p.logo ? "Logo ersetzen" : "Logo laden"}</button>${p.logo ? '<button type="button" class="btn outline small danger" data-pfl="del">Logo entfernen</button>' : ""}</div>`;
  const body = `<p>${online ? "Gilt für alle Module und liegt online bei deinem Konto." : "Gilt für alle Module. Ohne Anmeldung nur in diesem Browser."}</p>${PROFIL_FIELDS.map(field).join("")}<div id="pf-logo">${logoRow()}</div>
<div class="actions"><button class="btn outline" data-c>Abbrechen</button><button class="btn primary" data-ok>Speichern</button></div>`;
  const read = () => { for (const f of PROFIL_FIELDS) p[f.key] = document.querySelector(`#modal-root [data-pf="${f.key}"]`).value; };
  return openModal("Firmenprofil", body, (b, done) => {
    if (b.dataset.c !== undefined) { done(null); return; }
    if (b.dataset.pfl === "del") { delete p.logo; document.getElementById("pf-logo").innerHTML = logoRow(); return; }
    if (b.dataset.pfl === "load") {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/png,image/jpeg,image/svg+xml";
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        if (!/^image\/(png|jpeg|svg\+xml)$/.test(f.type)) { toast("Das Logo muss ein PNG-, JPEG- oder SVG-Bild sein.", "error"); return; }
        if (f.size > MAX_LOGO) { toast(`Das Bild ist zu gross (${Math.round(f.size / 1024)} KB). Höchstens ${MAX_LOGO / 1024} KB, bitte verkleinern.`, "error"); return; }
        const rd = new FileReader();
        rd.onload = () => { p.logo = String(rd.result); document.getElementById("pf-logo").innerHTML = logoRow(); };
        rd.readAsDataURL(f);
      };
      inp.click(); return;
    }
    if (b.dataset.ok === undefined) return;
    read(); p = cleanProfil(p);
    saveProfil(p).then((r) => toast(r === "online" ? "Firmenprofil gespeichert." : online ? "Firmenprofil im Browser gespeichert, online nicht erreichbar. Der nächste Abgleich holt es nach." : "Firmenprofil in diesem Browser gespeichert."));
    done(p);
  }, null, "input");
}
