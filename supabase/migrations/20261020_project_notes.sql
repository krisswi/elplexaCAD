-- Teilen per Link, Meilenstein 2 Schritt 2 (20.10.2026, OK CJ): Empfänger setzen Notizen und Markierungen.
-- Tabelle project_notes (nur Ersteller liest/erledigt/löscht über RLS), Empfänger nur über Funktionen mit Schlüssel.
-- share_open gibt je Blatt die Notiz-Kennung `nk` mit (sid, sonst title/toc/legend, sonst n<Platz in der vollen Liste).

create table public.project_notes (
  id          uuid primary key default gen_random_uuid(),
  share_id    uuid not null references public.project_shares(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  sheet       text not null check (length(sheet) between 1 and 40),
  sheet_label text not null default '' check (length(sheet_label) <= 80),
  kind        text not null check (kind in ('notiz', 'kreis', 'rechteck')),
  x real not null check (x between -1000000 and 1000000),  -- Blattmass (Weltkoordinaten des Blatts, y nach oben)
  y real not null check (y between -1000000 and 1000000),
  w real not null default 0 check (w between 0 and 1000000),
  h real not null default 0 check (h between 0 and 1000000),
  text        text not null check (length(text) between 1 and 1000),
  author      text not null check (length(author) between 1 and 60),
  guest       uuid not null,  -- Zufallskennung des Browsers, nur für «eigene löschen», wird nie ausgeliefert
  created_at  timestamptz not null default now(),
  status      text not null default 'offen' check (status in ('offen', 'erledigt')),
  erledigt_at timestamptz
);
create index project_notes_share on public.project_notes (share_id, created_at);
create index project_notes_project on public.project_notes (project_id);

alter table public.project_notes enable row level security;
create policy "lesen: eigene Projekte" on public.project_notes for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner = (select auth.uid())));
create policy "erledigen: eigene Projekte" on public.project_notes for update to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner = (select auth.uid())));
create policy "löschen: eigene Projekte" on public.project_notes for delete to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner = (select auth.uid())));
revoke all on public.project_notes from anon, authenticated;
grant select, delete on public.project_notes to authenticated;
grant update (status, erledigt_at) on public.project_notes to authenticated;

create or replace function public.share_check(p_token text) returns public.project_shares
language plpgsql stable security definer set search_path = '' as $$
declare s public.project_shares;
begin
  if p_token is null or length(p_token) <> 32 then return null; end if;
  select * into s from public.project_shares where token = p_token and revoked_at is null and expires_at > now();
  return s;
end $$;
revoke all on function public.share_check(text) from public, anon, authenticated;

create or replace function public.share_note_add(p_token text, p_guest uuid, p_sheet text, p_label text, p_kind text,
  p_x real, p_y real, p_w real, p_h real, p_text text, p_author text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.project_shares; n public.project_notes;
begin
  s := public.share_check(p_token);
  if s.id is null then return jsonb_build_object('ok', false, 'grund', 'link'); end if;
  if (select count(*) from public.project_notes where share_id = s.id) >= 300 then return jsonb_build_object('ok', false, 'grund', 'voll'); end if;
  if (select count(*) from public.project_notes where share_id = s.id and created_at > now() - interval '10 minutes') >= 30
    then return jsonb_build_object('ok', false, 'grund', 'zu_schnell'); end if;
  insert into public.project_notes (share_id, project_id, sheet, sheet_label, kind, x, y, w, h, text, author, guest)
    values (s.id, s.project_id, p_sheet, left(coalesce(p_label, ''), 80), p_kind, p_x, p_y,
            case when p_kind = 'notiz' then 0 else p_w end, case when p_kind = 'notiz' then 0 else p_h end,
            btrim(p_text), btrim(p_author), p_guest)
    returning * into n;
  return jsonb_build_object('ok', true, 'id', n.id, 'created_at', n.created_at);
exception when check_violation or not_null_violation then
  return jsonb_build_object('ok', false, 'grund', 'eingabe');
end $$;

create or replace function public.share_notes_list(p_token text, p_guest uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.project_shares;
begin
  s := public.share_check(p_token);
  if s.id is null then return jsonb_build_object('ok', false, 'grund', 'link'); end if;
  return jsonb_build_object('ok', true, 'notes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'sheet', sheet, 'sheet_label', sheet_label, 'kind', kind, 'x', x, 'y', y, 'w', w, 'h', h,
      'text', text, 'author', author, 'created_at', created_at, 'status', status, 'mine', guest = p_guest) order by created_at)
    from public.project_notes where share_id = s.id), '[]'::jsonb));
end $$;

create or replace function public.share_note_delete(p_token text, p_guest uuid, p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.project_shares;
begin
  s := public.share_check(p_token);
  if s.id is null then return jsonb_build_object('ok', false, 'grund', 'link'); end if;
  delete from public.project_notes where id = p_id and share_id = s.id and guest = p_guest and status = 'offen';
  return jsonb_build_object('ok', found);
end $$;

revoke all on function public.share_note_add(text, uuid, text, text, text, real, real, real, real, text, text) from public;
revoke all on function public.share_notes_list(text, uuid) from public;
revoke all on function public.share_note_delete(text, uuid, uuid) from public;
grant execute on function public.share_note_add(text, uuid, text, text, text, real, real, real, real, text, text) to anon, authenticated;
grant execute on function public.share_notes_list(text, uuid) to anon, authenticated;
grant execute on function public.share_note_delete(text, uuid, uuid) to anon, authenticated;

-- share_open wie bisher, neu mit `nk` je Blatt (vor dem Modulfilter, damit der Platz in der vollen Liste zählt)
create or replace function public.share_open(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
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
  -- Notiz-Kennung je Blatt (Meilenstein 2, Schritt 2)
  if jsonb_typeof(d->'sheets') = 'array' then
    d := jsonb_set(d, '{sheets}', (select coalesce(jsonb_agg(sh || jsonb_build_object('nk',
           coalesce(sh->>'sid', case when sh->>'kind' in ('title', 'toc', 'legend') then sh->>'kind' end, 'n' || i)) order by i), '[]'::jsonb)
         from jsonb_array_elements(d->'sheets') with ordinality as t(sh, i)));
  end if;
  -- nur freigegebene Module: Blätter, Modulnamen und eingebettete PDF-Pläne der übrigen fallen hier weg, nicht erst in der App
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
  return jsonb_build_object('ok', true, 'name', p.name, 'status', p.status, 'data', d, 'updated_at', p.updated_at, 'ablauf', s.expires_at, 'modules', to_jsonb(s.modules));
end;
$function$;
