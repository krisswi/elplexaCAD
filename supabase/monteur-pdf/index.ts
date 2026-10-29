// Edge Function „monteur-pdf“ (Pläne für den Monteur, CJ 28.10.2026): kurzlebige signierte Adressen für die PDF-Pläne im veröffentlichten Stand
// eines Links für Monteur (Tabellen shares, share_releases, Migration 20261028_monteur). Monteure ohne Login schicken nur den Schlüssel;
// gültig = nicht widerrufen, nicht abgelaufen. Nur PDF, die im veröffentlichten Stand stehen (data.assets[].sha), nie andere Dateien des Kontos.
// Adressen gelten 5 Minuten. Bucket `projekt-pdf` bleibt privat, Signieren nur hier mit dem Dienstschlüssel. Bereitgestellt mit verify_jwt = false.
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
  const r = await fetch(`${BASE}/rest/v1/shares?token=eq.${token}&select=id,owner,revoked_at,expires_at`, { headers: sr });
  const s = r.ok ? (await r.json())[0] : null;
  if (!s) return json({ ok: false, grund: "ungueltig" });
  if (s.revoked_at) return json({ ok: false, grund: "widerrufen" });
  if (Date.parse(s.expires_at) <= Date.now()) return json({ ok: false, grund: "abgelaufen" });
  const rel = await fetch(`${BASE}/rest/v1/share_releases?share_id=eq.${s.id}&select=assets:data->assets`, { headers: sr });
  const rows = rel.ok ? await rel.json() : [];
  const shas = [...new Set(rows.flatMap((x: any) => Object.values(x?.assets || {}).map((a: any) => String(a?.sha || ""))).filter((h: string) => /^[0-9a-f]{64}$/.test(h)))];
  if (!shas.length) return json({ ok: true, urls: {} });
  const sg = await fetch(`${BASE}/storage/v1/object/sign/projekt-pdf`, { method: "POST", headers: sr, body: JSON.stringify({ expiresIn: 300, paths: shas.map((h) => `${s.owner}/${h}.pdf`) }) });
  if (!sg.ok) return json({ error: `Signieren fehlgeschlagen (${sg.status})` }, 502);
  const urls: Record<string, string> = {};
  for (const x of await sg.json()) if (x.signedURL) urls[x.path.split("/").pop().replace(".pdf", "")] = `${BASE}/storage/v1${x.signedURL}`;
  return json({ ok: true, urls });
});
