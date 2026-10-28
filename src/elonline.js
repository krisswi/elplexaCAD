// elplexaCAD: Online-Projekte, Anmeldung, Sperre ohne Anmeldung und Speichern (Datei oder online). Aus app.js ausgelagert (Umbau, 27.10.2026), Verhalten unverändert.
// Zustand EL_S (Übersicht) und S gehören app.js. Nur im elplexaCAD-Bau benutzt.
import { toast, confirmDialog, chooseDialog } from "./dialogs.js";
import { cloudLogin, cloudLogout, cloudUser, projList, projSave, projSaved } from "./cloud.js";
import * as E from "./elplexa.js";

export function makeOnline({ S, $, EL_S, closeEditor, docText, elAcctDraw, elHub, elName, elProj, elTabLive, markClean, markDirty, saveJson }) {
  // Online-Projekte (Schritt 3, cloud.js). Datei bleibt Hauptweg; Fehler (ohne Internet, pausiert) nur als Meldung.
  function elOnlineDraw() {
    const o = $("#el-online");
    if (o) o.innerHTML = E.onlineHTML({ user: cloudUser(), list: EL_S.onlist ?? null, link: S.doc.project?.online, busy: EL_S.onbusy, locked: elLocked() });
  }
  // Sperre ohne Anmeldung (CJ 17.10.): nur wenn die App aus dem Netz läuft; als lokale Datei (file:) bleibt alles frei.
  // Ohne Anmeldung nur DXF. Keine echte Sicherung (Seite speichern umgeht sie), geschützt sind die Online-Daten über die Zugriffsregeln.
  const elLocked = () => !!S.shared || window.location.protocol !== "file:" && !cloudUser();
  async function elUnlock() {
    if (S.shared) { toast("Geteilte Ansicht: nur ansehen. Speichern, Drucken und Export gehen nicht."); return false; }
    if (!elLocked()) return true;
    toast("Ohne Anmeldung lässt sich nur als DXF speichern. Bitte anmelden.");
    return elLogin();
  }
  async function elLogin() {
    let ok = false;
    try { ok = await cloudLogin(); } catch (err) { toast(err.message || String(err), "error"); }
    if (ok) { toast(`Angemeldet als ${cloudUser()}.`); EL_S.autoTried = false; }
    elAcctDraw();
    if (!EL_S.hub.hidden) elOnlineDraw();
    return ok;
  }
  async function elOnline(fn) { // sperrt die Knöpfe während der Anfrage
    if (EL_S.onbusy) return;
    EL_S.onbusy = true; elOnlineDraw(); if (elTabLive() && !EL_S.hub.hidden) elHub(true, { keepFocus: true });
    try { await fn(); } catch (err) { toast(err.message || String(err), "error"); }
    finally { EL_S.onbusy = false; if (!EL_S.hub.hidden) { elOnlineDraw(); if (elTabLive()) elHub(true, { keepFocus: true }); } }
  }
  const elOnlineList = () => elOnline(async () => { try { const l = await projList(); if (l) { EL_S.onlist = l; EL_S.onAt = Date.now(); } EL_S.onerr = null; } catch (err) { EL_S.onerr = err.message || String(err); throw err; } });
  const elLogout = () => elOnline(async () => { await cloudLogout(); EL_S.onlist = null; EL_S.onerr = null; EL_S.autoTried = false; toast("Abgemeldet."); elAcctDraw(); });
  const elOnlineSave = () => elOnline(() => elOnlineSaveCore(false));
  // clean: über den Speichern-Knopf; der Online-Stand gilt dann als gespeichert (sonst merkt sich erst die Datei mit ⌘S den Stand)
  async function elOnlineSaveCore(clean) {
    {
      closeEditor(true);
      const doc = JSON.parse(docText()), opt = { name: elName(), status: E.statusOf(S.doc) };
      let r = await projSave(doc, S.doc.project?.online, opt);
      if (r?.conflict) { // online neuer als dieser Stand: nicht still überschreiben
        const c = await chooseDialog("Online ist neuer", `Das Online-Projekt wurde am ${new Date(r.conflict).toLocaleString("de-CH")} gespeichert, nach dem Stand dieser Datei. Überschreiben ersetzt den Online-Stand.`,
          [{ label: "Online überschreiben", v: "force" }, { label: "Als neues Online-Projekt speichern", v: "new" }]);
        const v = c?.option?.v;
        if (!v) return;
        r = await projSave(doc, v === "force" ? S.doc.project.online : null, { ...opt, force: true });
      }
      if (!r) return; // Anmeldung abgebrochen
      elProj().online = { id: r.id, at: r.at };
      if (clean) markClean(); else markDirty(); // die Datei merkt sich den Online-Stand beim nächsten Speichern
      const l = await projList().catch(() => null); if (l) EL_S.onlist = l;
      projSaved();
      toast(clean ? `Online gespeichert: „${opt.name}“.` : `Online gespeichert: „${opt.name}“. Mit ⌘S merkt sich auch die Datei diesen Stand.`);
    }
  }
  // Speichern-Knopf und ⌘S (CJ 18.10.2026): angemeldet und Projekt schon online → direkt online; angemeldet, noch nicht online → Wahl online oder Datei.
  // Ohne Anmeldung und ⇧⌘S (Speichern unter) wie bisher als Datei. Fehler online: Meldung und Angebot, als Datei zu speichern.
  async function elSave(forceAs) {
    if (forceAs || !cloudUser()) return saveJson(forceAs);
    if (EL_S.onbusy) return;
    closeEditor(true);
    if (!S.doc.project?.online) {
      const c = await chooseDialog("Speichern", "Online: auf jedem Rechner nach der Anmeldung öffnen, weitere Klicks speichern direkt online. Lokal: als Datei (.elplexa.json) auf diesem Rechner.",
        [{ label: "Online speichern", v: "on" }, { label: "Lokal speichern", v: "file" }]);
      const v = c?.option?.v;
      if (v === "file") return saveJson(false);
      if (v !== "on") return;
    }
    await elSaveOnline();
  }
  async function elSaveOnline() { // direkt online (Knopf Speichern bzw. sein Menü), Fehler → Angebot Datei
    if (EL_S.onbusy || !cloudUser()) return;
    closeEditor(true);
    EL_S.onbusy = true; if (!EL_S.hub.hidden) elOnlineDraw();
    let err = null;
    try { await elOnlineSaveCore(true); } catch (e) { err = e; }
    finally { EL_S.onbusy = false; if (!EL_S.hub.hidden) elOnlineDraw(); }
    if (err && (await confirmDialog("Online speichern hat nicht geklappt", `${err.message || err} Es ist nichts verloren. Jetzt als Datei auf diesem Rechner speichern?`, "Lokal speichern"))) await saveJson(false);
  }
  return { elOnlineDraw, elLocked, elUnlock, elLogin, elOnline, elOnlineList, elLogout, elOnlineSave, elSave, elSaveOnline };
}
