// elplexaCAD: Feedback melden (CJ 18.10.2026). Screenshot der Zeichenfläche ohne Bibliothek: SVG mit den Regeln der Seite
// als Bild in ein Canvas zeichnen. Klappt das nicht (oder Übersicht offen), geht es ohne Screenshot weiter.
import { openModal, toast } from "./dialogs.js";
import * as R from "./render.js";

const MAX_W = 1600; // Breite des Screenshots in Pixeln höchstens

// Screenshot des SVG wie auf dem Bildschirm. Gibt ein Canvas oder null zurück (PNG erst beim Senden, das Kodieren dauert).
export async function snapSvg(svg) {
  const r = svg.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  // Schriften als data:-URL sind gross: nur die Blattschrift mitgeben (die Oberflächenschriften braucht das Blatt nicht), sonst dauert es Sekunden
  const css = [...document.querySelectorAll("style")].map((s) => s.textContent).join("\n").replace(/@font-face\{[^}]*\}/g, (f) => f.includes('"Barlow Semi Condensed"') ? f : "");
  const c = svg.cloneNode(true);
  c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  c.setAttribute("width", r.width); c.setAttribute("height", r.height);
  // Farben stehen in CSS-Variablen (zum Teil an body): die berechneten Werte mitgeben
  const cs = getComputedStyle(svg), vars = [...new Set(css.match(/--[\w-]+/g) || [])];
  c.setAttribute("style", vars.map((v) => `${v}:${cs.getPropertyValue(v)}`).filter((x) => !x.endsWith(":")).join(";"));
  const st = document.createElementNS("http://www.w3.org/2000/svg", "style");
  st.textContent = css;
  c.prepend(st);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(c)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
    const k = Math.min(1, MAX_W / r.width), cv = document.createElement("canvas");
    cv.width = Math.round(r.width * k); cv.height = Math.round(r.height * k);
    const g = cv.getContext("2d");
    g.fillStyle = getComputedStyle(svg.parentElement).backgroundColor || "#fff";
    g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, 0, 0, cv.width, cv.height);
    return cv;
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}
// Canvas als PNG, bei grossen Bildern JPEG (Bucket erlaubt 5 MB)
async function toImage(cv) {
  const blob = (t, q) => new Promise((ok) => cv.toBlob(ok, t, q));
  const png = await blob("image/png");
  return png && png.size > 4.5e6 ? blob("image/jpeg", 0.85) : png;
}

// Dialog. ctx = { shot (Canvas|null), noShot (Grund, warum keiner), send(f) → true gesendet, null abgebrochen; wirft bei Fehler }
export function feedbackDialog({ shot, noShot, send }) {
  const pic = !!shot;
  const arts = [["fehler", "Fehler"], ["anregung", "Anregung"], ["wunsch", "Wunsch"]];
  const body = `<div class="field"><label>Art</label><div class="el-fbart" role="radiogroup" aria-label="Art">${arts.map(([v, l], i) => `<label><input type="radio" name="el-fbart" value="${v}"${i ? "" : " checked"}><span>${l}</span></label>`).join("")}</div></div>
<div class="field"><label for="el-fbt">Titel</label><input type="text" id="el-fbt" maxlength="200" autocomplete="off" placeholder="Kurz, z. B. Klemme springt beim Drehen"></div>
<div class="field"><label for="el-fbd">Beschreibung</label><textarea id="el-fbd" rows="4" maxlength="10000" placeholder="Was hast du gemacht, was ist passiert, was hast du erwartet?"></textarea></div>
${pic ? `<label class="chk el-fbchk"><input type="checkbox" id="el-fbshot" checked> <span>Screenshot der Ansicht mitsenden</span></label><div class="el-fbpic" role="img" aria-label="Screenshot der aktuellen Ansicht"></div>` : `<p class="el-note">${R.esc(noShot || "Ohne Screenshot.")}</p>`}
<div class="actions"><button class="btn outline" data-c>Abbrechen</button><button class="btn primary" data-ok>Senden</button></div>`;
  const root = document.querySelector("#modal-root");
  let busy = false;
  const res = openModal("Feedback melden", body, async (b, done) => {
    if (b.dataset.c !== undefined) { if (!busy) done(false); return; }
    if (b.dataset.ok === undefined || busy) return;
    const q = (s) => root.querySelector(s);
    const titel = q("#el-fbt").value.trim();
    if (!titel) { toast("Bitte einen Titel eingeben.", "error"); q("#el-fbt").focus(); return; }
    busy = true; b.disabled = true; b.textContent = "Senden …";
    try {
      const ok = await send({ art: q("[name=el-fbart]:checked").value, titel, beschreibung: q("#el-fbd").value.trim(), shot: pic && q("#el-fbshot").checked ? await toImage(shot) : null });
      if (ok) { done(true); return; }
    } catch (err) { toast(`Feedback nicht gesendet: ${err.message || err} Der Text bleibt im Fenster.`, "error"); }
    busy = false; b.disabled = false; b.textContent = "Senden";
  }, false, "#el-fbt", "el-fbmodal");
  root.querySelector(".el-fbpic")?.append(shot);
  root.querySelector(".el-fbpic")?.addEventListener("click", () => { const x = root.querySelector("#el-fbshot"); x.checked = !x.checked; root.querySelector(".el-fbpic").classList.toggle("off", !x.checked); });
  root.querySelector("#el-fbshot")?.addEventListener("change", (e) => root.querySelector(".el-fbpic").classList.toggle("off", !e.target.checked));
  return res;
}
