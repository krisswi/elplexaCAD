-- Angewendet am 26.10.2026 mit OK von CJ.
-- Zeitfaktor der Offerte (CJ 26.10.2026, Dateiversion 26): of.zf wirkt auf alle Zeiten ausser Regie, fehlt = 1 (offerte.js unitRaw).
-- share_offer_strip rechnet den Verkaufspreis im Teilen-Link mit dem Zeitfaktor und entfernt zf wie Faktor und Ansatz. Sonst unverändert.

-- Offerte für den Teilen-Link: ohne EK, Faktor, Zeit, Ansatz, Zeitfaktor; ohne Preise auch ohne Preise, Rabatte und MwSt
create or replace function public.share_offer_strip(sh jsonb, prices boolean)
 returns jsonb language plpgsql immutable set search_path to ''
as $function$
declare
  o jsonb; kap jsonb := '[]'; k jsonb; grp jsonb; g jsonb; pos jsonb; p jsonb; ep numeric;
begin
  if sh->>'kind' is distinct from 'offerte' or jsonb_typeof(sh->'of') is distinct from 'object' then return sh; end if;
  o := sh->'of';
  for k in select value from jsonb_array_elements(case when jsonb_typeof(o->'kap') = 'array' then o->'kap' else '[]' end) where jsonb_typeof(value) = 'object' loop
    grp := '[]';
    for g in select value from jsonb_array_elements(case when jsonb_typeof(k->'grp') = 'array' then k->'grp' else '[]' end) where jsonb_typeof(value) = 'object' loop
      pos := '[]';
      for p in select value from jsonb_array_elements(case when jsonb_typeof(g->'pos') = 'array' then g->'pos' else '[]' end) where jsonb_typeof(value) = 'object' loop
        if prices then -- Verkaufspreis wie in der App (offerte.js unitRaw): Preis von Hand, sonst EK × Faktor + Zeit × Zeitfaktor × Ansatz, Regie nur Zeit × Ansatz
          ep := case when jsonb_typeof(p->'preis') = 'number' then (p->>'preis')::numeric else
                  (case when p->>'typ' = 'regie' then 0 else (case when jsonb_typeof(p->'ek') = 'number' then (p->>'ek')::numeric else 0 end)
                     * coalesce(case when jsonb_typeof(p->'fak') = 'number' then (p->>'fak')::numeric end, case when jsonb_typeof(o->'fak') = 'number' then (o->>'fak')::numeric end, 1.4) end)
                  + (case when jsonb_typeof(p->'std') = 'number' then (p->>'std')::numeric else 0 end) * (case when jsonb_typeof(o->'ansatz') = 'number' then (o->>'ansatz')::numeric else 0 end)
                    * (case when p->>'typ' = 'regie' then 1 when jsonb_typeof(o->'zf') = 'number' and (o->>'zf')::numeric > 0 then (o->>'zf')::numeric else 1 end) end;
          p := (p - array['ek', 'fak', 'std']) || jsonb_build_object('preis', ep);
        else
          p := p - array['ek', 'fak', 'std', 'preis'];
        end if;
        pos := pos || jsonb_build_array(p);
      end loop;
      grp := grp || jsonb_build_array(g || jsonb_build_object('pos', pos));
    end loop;
    kap := kap || jsonb_build_array(k || jsonb_build_object('grp', grp));
  end loop;
  o := o - array['fak', 'ansatz', 'zf'] - (case when prices then array[]::text[] else array['rabatt', 'skonto', 'skTage', 'mwst', 'rg'] end);
  return sh || jsonb_build_object('of', o || jsonb_build_object('kap', kap));
end;
$function$;

revoke execute on function public.share_offer_strip(jsonb, boolean) from public, anon, authenticated; -- nur für share_open (security definer)
