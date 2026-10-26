-- Angewendet am 26.10.2026 mit OK von CJ.
-- Teilen mit Offerte (CJ 26.10.2026): jedes Modul wird beim Teilen angekreuzt, die Offerte zusätzlich «mit Preisen» oder «ohne Preise».
-- EK, Faktor, Zeit und Ansatz verlassen die Datenbank nie: share_open entfernt sie, mit Preisen steht nur der Verkaufspreis (EK × Faktor + Zeit × Ansatz) als preis.
-- Nebenbei: share_mod_of kennt jetzt prinzip, plan und offerte (vorher landeten diese Blätter unter «schema»).

alter table public.project_shares add column if not exists prices boolean not null default false;
grant insert (prices), select (prices) on public.project_shares to authenticated; -- Rechte sind je Spalte vergeben

create or replace function public.share_mod_of(sh jsonb)
 returns text language sql immutable set search_path to ''
as $function$
  select (case when sh->>'kind' = 'dispo' then 'dispo' when sh->>'kind' in ('pv', 'pvtab') then 'pv'
               when sh->>'kind' in ('prinzip', 'plan', 'offerte') then sh->>'kind' else 'schema' end)
    || case when coalesce(sh->>'kind', '') in ('title', 'toc', 'legend') then ''
            when coalesce(nullif(sh->>'var', '')::int, 1) > 1 then ':' || (sh->>'var') else '' end
$function$;

-- Offerte für den Teilen-Link: ohne EK, Faktor, Zeit, Ansatz; ohne Preise auch ohne Preise, Rabatte und MwSt
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
        if prices then -- Verkaufspreis wie in der App (offerte.js unitRaw): Preis von Hand, sonst EK × Faktor + Zeit × Ansatz, Regie nur Zeit × Ansatz
          ep := case when jsonb_typeof(p->'preis') = 'number' then (p->>'preis')::numeric else
                  (case when p->>'typ' = 'regie' then 0 else (case when jsonb_typeof(p->'ek') = 'number' then (p->>'ek')::numeric else 0 end)
                     * coalesce(case when jsonb_typeof(p->'fak') = 'number' then (p->>'fak')::numeric end, case when jsonb_typeof(o->'fak') = 'number' then (o->>'fak')::numeric end, 1.4) end)
                  + (case when jsonb_typeof(p->'std') = 'number' then (p->>'std')::numeric else 0 end) * (case when jsonb_typeof(o->'ansatz') = 'number' then (o->>'ansatz')::numeric else 0 end) end;
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
  o := o - array['fak', 'ansatz'] - (case when prices then array[]::text[] else array['rabatt', 'skonto', 'skTage', 'mwst', 'rg'] end);
  return sh || jsonb_build_object('of', o || jsonb_build_object('kap', kap));
end;
$function$;

revoke execute on function public.share_offer_strip(jsonb, boolean) from public, anon, authenticated; -- nur für share_open (security definer)

-- share_open wie bisher, dazu: Offerte nur, wenn angekreuzt (ganzes Projekt = ohne Offerte), immer durch share_offer_strip; Rückgabe prices
create or replace function public.share_open(p_token text)
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  s public.project_shares;
  p public.projects;
  d jsonb;
  keep jsonb;
  used text[];
begin
  if p_token is null or length(p_token) <> 32 then
    return jsonb_build_object('ok', false, 'grund', 'ungueltig');
  end if;
  select * into s from public.project_shares where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'grund', 'ungueltig'); end if;
  if s.revoked_at is not null then return jsonb_build_object('ok', false, 'grund', 'widerrufen'); end if;
  if s.expires_at <= now() then return jsonb_build_object('ok', false, 'grund', 'abgelaufen', 'ablauf', s.expires_at); end if;
  select * into p from public.projects where id = s.project_id;
  if not found then return jsonb_build_object('ok', false, 'grund', 'ungueltig'); end if;
  d := p.data;
  if jsonb_typeof(d->'project') = 'object' then
    d := jsonb_set(d, '{project}', (d->'project') - 'time' - 'auto' - 'id' - 'online');
  end if;
  if jsonb_typeof(d->'sheets') = 'array' then
    d := jsonb_set(d, '{sheets}', (select coalesce(jsonb_agg(public.share_offer_strip(sh, s.prices) || jsonb_build_object('nk',
           coalesce(sh->>'sid', case when sh->>'kind' in ('title', 'toc', 'legend') then sh->>'kind' end, 'n' || i)) order by i), '[]'::jsonb)
         from jsonb_array_elements(d->'sheets') with ordinality as t(sh, i)
         where s.modules is not null or sh->>'kind' is distinct from 'offerte'));
  end if;
  if s.modules is not null then
    select coalesce(jsonb_agg(sh order by i), '[]'::jsonb) into keep
      from jsonb_array_elements(coalesce(d->'sheets', '[]'::jsonb)) with ordinality as t(sh, i)
      where public.share_mod_of(sh) = any (s.modules);
    if jsonb_array_length(keep) = 0 then return jsonb_build_object('ok', false, 'grund', 'modul_fehlt'); end if;
    select coalesce(array_agg(distinct sh->'bg'->>'asset'), '{}') into used from jsonb_array_elements(keep) as t(sh) where sh->'bg'->>'asset' is not null;
    d := jsonb_set(d, '{sheets}', keep);
    d := jsonb_set(d, '{active}', '0'::jsonb);
    if jsonb_typeof(d->'mods') = 'object' then
      d := jsonb_set(d, '{mods}', coalesce((select jsonb_object_agg(k, v) from jsonb_each(d->'mods') as m(k, v) where k = any (s.modules)), '{}'::jsonb));
    end if;
    if jsonb_typeof(d->'assets') = 'object' then
      d := jsonb_set(d, '{assets}', coalesce((select jsonb_object_agg(k, v) from jsonb_each(d->'assets') as a(k, v) where k = any (used)), '{}'::jsonb));
    end if;
  end if;
  return jsonb_build_object('ok', true, 'name', p.name, 'status', p.status, 'data', d, 'updated_at', p.updated_at, 'ablauf', s.expires_at, 'modules', to_jsonb(s.modules), 'prices', s.prices);
end;
$function$;
