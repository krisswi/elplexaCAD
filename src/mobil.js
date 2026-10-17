// Mobilansicht (UI Schritt 5, 16.10.2026): auf schmalen Bildschirmen (bis 600 px) mit dem Finger ansehen und wählen, nicht zeichnen.
// Ein Finger schiebt, zwei Finger zoomen und schieben, kurzes Antippen wählt. Maus und Stift bleiben wie am Desktop.
export const MOBILE = "(max-width: 600px)";
export const isMobile = () => matchMedia(MOBILE).matches;
const TAP_MOVE = 8, TAP_MS = 500; // Antippen: weniger als 8 px Bewegung, kürzer als 0,5 s

export function makeTouch({ S, stage, pointerPos, zoomAt, applyView, renderOverlay, tap }) {
  const pts = new Map(); // aktive Finger: id -> { sx, sy }
  let g = null; // laufende Geste
  const mid = () => { const a = [...pts.values()]; return { sx: (a[0].sx + a[1].sx) / 2, sy: (a[0].sy + a[1].sy) / 2, d: Math.hypot(a[0].sx - a[1].sx, a[0].sy - a[1].sy) || 1 }; };
  const mine = (e) => e.pointerType === "touch" && isMobile();
  return {
    down(e) {
      if (!mine(e)) return false;
      if (e.target.closest("#zoombar, #sheetbar")) return true;
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, pointerPos(e));
      if (pts.size === 1) g = { type: "pan", ...pointerPos(e), vx: S.view.x, vy: S.view.y, moved: false, t0: performance.now(), e };
      else if (pts.size === 2) g = { type: "pinch", ...mid() };
      return true;
    },
    move(e) {
      if (!mine(e) || !pts.has(e.pointerId)) return mine(e);
      pts.set(e.pointerId, pointerPos(e));
      if (g?.type === "pan" && pts.size === 1) {
        const p = pointerPos(e);
        if (!g.moved && Math.hypot(p.sx - g.sx, p.sy - g.sy) < TAP_MOVE) return true;
        g.moved = true; S.view.x = g.vx + (p.sx - g.sx); S.view.y = g.vy + (p.sy - g.sy); applyView(); renderOverlay();
      } else if (g?.type === "pinch" && pts.size === 2) {
        const m = mid();
        S.view.x += m.sx - g.sx; S.view.y += m.sy - g.sy; applyView();
        zoomAt(m.sx, m.sy, m.d / g.d);
        g = { type: "pinch", ...m };
      }
      return true;
    },
    up(e) {
      if (!mine(e)) return false;
      pts.delete(e.pointerId);
      if (g?.type === "pan" && !g.moved && e.type === "pointerup" && performance.now() - g.t0 < TAP_MS) tap(g.e);
      if (pts.size === 0) g = null;
      else if (g?.type === "pinch") { const [p] = pts.values(); g = { type: "pan", ...p, vx: S.view.x, vy: S.view.y, moved: true, t0: 0 }; } // ein Finger bleibt: weiter schieben
      return true;
    },
  };
}
