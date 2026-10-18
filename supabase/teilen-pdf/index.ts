// Edge Function „teilen-pdf“ (Meilenstein 2, Schritt 1, 18.10.2026): kurzlebige signierte Adressen für die PDF-Dachpläne
// eines geteilten Online-Projekts. Empfänger ohne Login schicken nur den geheimen Schlüssel; gültig = nicht widerrufen,
// nicht abgelaufen. Adressen gelten 5 Minuten. Der Bucket `projekt-pdf` bleibt privat, Signieren nur hier mit dem Dienstschlüssel.
// Bereitgestellt mit verify_jwt = false (Empfänger haben kein Login), Schutz ist der Schlüssel (192 Bit Zufall).
const BASE = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const sr = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  const token = (await req.json().catch(() => ({})))?.token;
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(token)) return json({ ok: false, grund: "ungueltig" });
  // Gültigkeit und Pläne aus share_open: dieselbe Prüfung wie für die Projektdaten, bei Modul-Links nur die Pläne der freigegebenen Module (18.10.2026)
  const o = await fetch(`${BASE}/rest/v1/rpc/share_open`, { method: "POST", headers: sr, body: JSON.stringify({ p_token: token }) });
  const open = o.ok ? await o.json() : null;
  if (!open?.ok) return json({ ok: false, grund: open?.grund || "ungueltig" });
  const r = await fetch(`${BASE}/rest/v1/project_shares?token=eq.${token}&select=projects(owner)`, { headers: sr });
  const owner = r.ok ? (await r.json())[0]?.projects?.owner : null;
  if (!owner) return json({ ok: false, grund: "ungueltig" });
  const shas = [...new Set(Object.values(open.data?.assets || {}).map((a: any) => String(a?.sha || "")).filter((s) => /^[0-9a-f]{64}$/.test(s)))];
  if (!shas.length) return json({ ok: true, urls: {} });
  const s = await fetch(`${BASE}/storage/v1/object/sign/projekt-pdf`, { method: "POST", headers: sr, body: JSON.stringify({ expiresIn: 300, paths: shas.map((h) => `${owner}/${h}.pdf`) }) });
  if (!s.ok) return json({ error: `Signieren fehlgeschlagen (${s.status})` }, 502);
  const urls: Record<string, string> = {};
  for (const x of await s.json()) if (x.signedURL) urls[x.path.split("/").pop().replace(".pdf", "")] = `${BASE}/storage/v1${x.signedURL}`;
  return json({ ok: true, urls });
});
