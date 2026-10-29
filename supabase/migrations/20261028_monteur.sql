-- Angewendet 28.10.2026 (Freigabe CJ im Auftrag Monteur-Ansicht Bau).
-- Teilen neu (CJ 28.10.2026): Link mit veröffentlichtem Stand je Modul, Monteur-Ansicht, Notizen mit fester Nummer.
-- Eigene Tabellen, der alte Teilen-Link (project_shares, project_notes, share_open) bleibt unverändert, bis der neue geprüft ist.
-- Entscheide 28.10.: «Veröffentlichen» füllt den Link, Stand-Nummer = Revisionsindex; eine Nummernreihe je Plan, Kollision = nächste
-- freie Nummer, keine Reservierung; Monteur-Notizen bearbeiten/löschen alle mit dem Link; nach dem Bestätigen löscht nur der Planer;
-- Antwort beim Bestätigen sofort sichtbar. Grenzen wie bisher: 1000 Zeichen, 300 Notizen je Link, 30 in 10 min.

-- Link
create table public.shares (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token      text not null unique default translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz,
  phone      text not null default '' check (length(phone) <= 30),
  rev        int not null default 0 check (rev >= 0),   -- Stand-Nummer, zählt bei jedem Veröffentlichen hoch (0 = nie)
  pub_at     timestamptz,
  opened_at  timestamptz                                  -- zuletzt vom Monteur geöffnet
);
create index shares_project on public.shares (project_id);

-- Veröffentlichter Stand je Modul (nur der neuste; mod = Modul-Kennung wie model.js modOf, zuerst nur «plan»)
create table public.share_releases (
  share_id uuid not null references public.shares(id) on delete cascade,
  mod      text not null check (mod ~ '^[a-z]{2,12}(:[0-9]{1,2})?$'),
  rev      int not null,
  at       timestamptz not null default now(),
  data     jsonb not null check (octet_length(data::text) <= 5000000),
  primary key (share_id, mod)
);

-- Notizen. sheet = feste Blatt-ID (sid als Text), nie der Platz in der Liste. x, y im Blattmass (Weltkoordinaten, y nach oben).
create table public.share_notes (
  id          uuid primary key default gen_random_uuid(),
  share_id    uuid not null references public.shares(id) on delete cascade,
  mod         text not null default 'plan',
  sheet       text not null check (length(sheet) between 1 and 40),
  nr          int not null check (nr between 1 and 9999),
  von         text not null check (von in ('monteur', 'planer')),
  published   boolean not null default true,              -- Planer-Notiz: false bis «Veröffentlichen»
  x real not null check (x between -1000000 and 1000000),
  y real not null check (y between -1000000 and 1000000),
  text        text not null check (length(text) between 1 and 1000),
  author      text not null check (length(author) between 1 and 60),
  guest       uuid,                                       -- Gerät des Monteurs (Zufallskennung), wird nie ausgeliefert
  rev         int not null default 0,                     -- Stand, auf dem die Notiz gesetzt wurde
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  status      text not null default 'offen' check (status in ('offen', 'erledigt')),
  erledigt_at timestamptz,
  antwort     text check (antwort is null or length(antwort) between 1 and 1000),
  antwort_at  timestamptz,
  unique (share_id, sheet, nr)
);
create index share_notes_share on public.share_notes (share_id, updated_at);

-- Geräte, die den Link geöffnet haben («zuletzt geöffnet · 2 Geräte»)
create table public.share_devices (
  share_id uuid not null references public.shares(id) on delete cascade,
  guest    uuid not null,
  seen_at  timestamptz not null default now(),
  primary key (share_id, guest)
);

-- Zugriff: Planer direkt nur lesen, Link anlegen, Ablauf/Telefon/Widerruf ändern, Notizen löschen; alles andere über Funktionen.
alter table public.shares enable row level security;
alter table public.share_releases enable row level security;
alter table public.share_notes enable row level security;
alter table public.share_devices enable row level security;
revoke all on public.shares, public.share_releases, public.share_notes, public.share_devices from anon, authenticated;
create policy "eigene" on public.shares for all to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner = (select auth.uid())));
grant select, delete on public.shares to authenticated;
grant insert (project_id, expires_at, phone), update (expires_at, phone, revoked_at) on public.shares to authenticated;
create policy "eigene" on public.share_releases for select to authenticated
  using (exists (select 1 from public.shares s where s.id = share_id and s.owner = (select auth.uid())));
grant select on public.share_releases to authenticated;
create policy "eigene lesen" on public.share_notes for select to authenticated
  using (exists (select 1 from public.shares s where s.id = share_id and s.owner = (select auth.uid())));
create policy "eigene löschen" on public.share_notes for delete to authenticated
  using (exists (select 1 from public.shares s where s.id = share_id and s.owner = (select auth.uid())));
grant select (id, share_id, mod, sheet, nr, von, published, x, y, text, author, rev, created_at, updated_at, status, erledigt_at, antwort, antwort_at),
  delete on public.share_notes to authenticated;
create policy "eigene" on public.share_devices for select to authenticated
  using (exists (select 1 from public.shares s where s.id = share_id and s.owner = (select auth.uid())));
grant select on public.share_devices to authenticated;

-- Hilfen (nicht aufrufbar von aussen)
create function public.sh_token(p_token text) returns public.shares
language plpgsql stable security definer set search_path = '' as $$
declare s public.shares;
begin
  if p_token is null or length(p_token) <> 32 then return null; end if;
  select * into s from public.shares where token = p_token and revoked_at is null and expires_at > now();
  return s;
end $$;
create function public.sh_mine(p_share uuid) returns public.shares
language sql stable security definer set search_path = '' as $$
  select * from public.shares where id = p_share and owner = (select auth.uid()) and revoked_at is null
$$;
-- Nächste freie Nummer je Link und Blatt: Wunsch (offline vergeben) wenn frei, sonst eins mehr als die höchste
create function public.sh_nr(p_share uuid, p_sheet text, p_want int) returns int
language sql stable security definer set search_path = '' as $$
  select case when p_want between 1 and 9999 and not exists (select 1 from public.share_notes where share_id = p_share and sheet = p_sheet and nr = p_want)
    then p_want else coalesce((select max(nr) from public.share_notes where share_id = p_share and sheet = p_sheet), 0) + 1 end
$$;
revoke all on function public.sh_token(text), public.sh_mine(uuid), public.sh_nr(uuid, text, int) from public, anon, authenticated;

-- ===== Monteur (ohne Login, nur mit Schlüssel) =====
-- Öffnen: Stände nur, wenn neuer als p_have (Stand der Kopie auf dem Gerät); merkt Gerät und Zeit.
-- grund: ungueltig | widerrufen | abgelaufen | leer (noch nie veröffentlicht)
create function public.m_open(p_token text, p_guest uuid, p_have int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.shares; nm text; pname text;
begin
  if p_token is null or length(p_token) <> 32 then return jsonb_build_object('ok', false, 'grund', 'ungueltig'); end if;
  select * into s from public.shares where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'grund', 'ungueltig'); end if;
  if s.revoked_at is not null then return jsonb_build_object('ok', false, 'grund', 'widerrufen'); end if;
  if s.expires_at <= now() then return jsonb_build_object('ok', false, 'grund', 'abgelaufen', 'ablauf', s.expires_at); end if;
  if s.rev = 0 then return jsonb_build_object('ok', false, 'grund', 'leer'); end if;
  update public.shares set opened_at = now() where id = s.id;
  if p_guest is not null then
    insert into public.share_devices (share_id, guest) values (s.id, p_guest) on conflict (share_id, guest) do update set seen_at = now();
  end if;
  select name into pname from public.projects where id = s.project_id;
  return jsonb_build_object('ok', true, 'name', pname, 'rev', s.rev, 'at', s.pub_at, 'ablauf', s.expires_at, 'phone', s.phone,
    'releases', case when coalesce(p_have, 0) < s.rev then
      (select coalesce(jsonb_object_agg(mod, jsonb_build_object('rev', rev, 'at', at, 'data', data)), '{}'::jsonb) from public.share_releases where share_id = s.id) end);
end $$;

-- Notizen lesen: Monteur-Notizen und veröffentlichte Planer-Notizen. mine = von diesem Gerät (nur Anzeige, keine Berechtigung).
create function public.m_notes(p_token text, p_guest uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.shares;
begin
  s := public.sh_token(p_token);
  if s.id is null then return jsonb_build_object('ok', false, 'grund', 'link'); end if;
  return jsonb_build_object('ok', true, 'notes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'mod', mod, 'sheet', sheet, 'nr', nr, 'von', von, 'x', x, 'y', y, 'text', text, 'author', author,
      'rev', rev, 'created_at', created_at, 'updated_at', updated_at, 'status', status, 'erledigt_at', erledigt_at,
      'antwort', antwort, 'antwort_at', antwort_at, 'mine', guest is not null and guest = p_guest) order by sheet, nr)
    from public.share_notes where share_id = s.id and (von = 'monteur' or published)), '[]'::jsonb));
end $$;

-- Notiz setzen (auch aus der Warteschlange). p_nr = Wunschnummer; Ergebnis nennt die vergebene (kann höher sein).
create function public.m_note_add(p_token text, p_guest uuid, p_mod text, p_sheet text, p_nr int, p_x real, p_y real,
  p_text text, p_author text, p_rev int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.shares; n public.share_notes;
begin
  s := public.sh_token(p_token);
  if s.id is null then return jsonb_build_object('ok', false, 'grund', 'link'); end if;
  if p_guest is null then return jsonb_build_object('ok', false, 'grund', 'eingabe'); end if;
  if (select count(*) from public.share_notes where share_id = s.id) >= 300 then return jsonb_build_object('ok', false, 'grund', 'voll'); end if;
  if (select count(*) from public.share_notes where share_id = s.id and von = 'monteur' and created_at > now() - interval '10 minutes') >= 30
    then return jsonb_build_object('ok', false, 'grund', 'zu_schnell'); end if;
  perform pg_advisory_xact_lock(hashtext(s.id::text || coalesce(p_sheet, ''))); -- zwei Geräte gleichzeitig: nacheinander nummerieren
  insert into public.share_notes (share_id, mod, sheet, nr, von, x, y, text, author, guest, rev)
    values (s.id, coalesce(p_mod, 'plan'), p_sheet, public.sh_nr(s.id, p_sheet, p_nr), 'monteur', p_x, p_y, btrim(p_text), btrim(p_author), p_guest, coalesce(p_rev, 0))
    returning * into n;
  return jsonb_build_object('ok', true, 'id', n.id, 'nr', n.nr, 'created_at', n.created_at);
exception when check_violation or not_null_violation then
  return jsonb_build_object('ok', false, 'grund', 'eingabe');
end $$;

-- Text ändern oder Marke verschieben (null = unverändert): jede offene Monteur-Notiz, alle mit dem Link
create function public.m_note_edit(p_token text, p_id uuid, p_text text, p_x real, p_y real) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.shares;
begin
  s := public.sh_token(p_token);
  if s.id is null then return jsonb_build_object('ok', false, 'grund', 'link'); end if;
  update public.share_notes set text = coalesce(btrim(p_text), text), x = coalesce(p_x, x), y = coalesce(p_y, y), updated_at = now()
    where id = p_id and share_id = s.id and von = 'monteur' and status = 'offen';
  return case when found then jsonb_build_object('ok', true) else jsonb_build_object('ok', false, 'grund', 'fehlt') end;
exception when check_violation then
  return jsonb_build_object('ok', false, 'grund', 'eingabe');
end $$;

-- Löschen: offene Monteur-Notizen, alle mit dem Link; bestätigte nur der Planer
create function public.m_note_delete(p_token text, p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.shares;
begin
  s := public.sh_token(p_token);
  if s.id is null then return jsonb_build_object('ok', false, 'grund', 'link'); end if;
  delete from public.share_notes where id = p_id and share_id = s.id and von = 'monteur' and status = 'offen';
  return case when found then jsonb_build_object('ok', true) else jsonb_build_object('ok', false, 'grund', 'fehlt') end;
end $$;

-- ===== Planer (angemeldet, eigener Link) =====
-- Veröffentlichen: Stand des Moduls (vom Gerät, schon ohne Zeit/Preise usw.) in den Link, Stand +1, Planer-Notizen sichtbar machen
create function public.p_publish(p_share uuid, p_mod text, p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.shares; n int;
begin
  s := public.sh_mine(p_share);
  if s.id is null then return jsonb_build_object('ok', false, 'grund', 'link'); end if;
  if jsonb_typeof(p_data) <> 'object' or jsonb_typeof(p_data->'sheets') <> 'array' then return jsonb_build_object('ok', false, 'grund', 'eingabe'); end if;
  update public.shares set rev = rev + 1, pub_at = now() where id = s.id returning rev into n;
  insert into public.share_releases (share_id, mod, rev, data) values (s.id, p_mod, n, p_data)
    on conflict (share_id, mod) do update set rev = excluded.rev, at = now(), data = excluded.data;
  update public.share_notes set published = true, updated_at = now() where share_id = s.id and mod = p_mod and von = 'planer' and not published;
  return jsonb_build_object('ok', true, 'rev', n, 'at', now());
exception when check_violation then
  return jsonb_build_object('ok', false, 'grund', 'gross');
end $$;

-- Planer-Notiz setzen: Nummer sofort fest (Kollision = nächste freie), beim Monteur erst nach dem Veröffentlichen
create function public.p_note_add(p_share uuid, p_mod text, p_sheet text, p_x real, p_y real, p_text text, p_author text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.shares; n public.share_notes;
begin
  s := public.sh_mine(p_share);
  if s.id is null then return jsonb_build_object('ok', false, 'grund', 'link'); end if;
  if (select count(*) from public.share_notes where share_id = s.id) >= 300 then return jsonb_build_object('ok', false, 'grund', 'voll'); end if;
  perform pg_advisory_xact_lock(hashtext(s.id::text || coalesce(p_sheet, '')));
  insert into public.share_notes (share_id, mod, sheet, nr, von, published, x, y, text, author, rev)
    values (s.id, coalesce(p_mod, 'plan'), p_sheet, public.sh_nr(s.id, p_sheet, null), 'planer', false, p_x, p_y, btrim(p_text), btrim(p_author), s.rev)
    returning * into n;
  return jsonb_build_object('ok', true, 'id', n.id, 'nr', n.nr, 'created_at', n.created_at);
exception when check_violation or not_null_violation then
  return jsonb_build_object('ok', false, 'grund', 'eingabe');
end $$;

-- Planer: Text ändern / verschieben (jede Notiz des eigenen Links)
create function public.p_note_edit(p_id uuid, p_text text, p_x real, p_y real) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.share_notes n set text = coalesce(btrim(p_text), n.text), x = coalesce(p_x, n.x), y = coalesce(p_y, n.y), updated_at = now()
    where n.id = p_id and exists (select 1 from public.shares s where s.id = n.share_id and s.owner = (select auth.uid()));
  return case when found then jsonb_build_object('ok', true) else jsonb_build_object('ok', false, 'grund', 'fehlt') end;
exception when check_violation then
  return jsonb_build_object('ok', false, 'grund', 'eingabe');
end $$;

-- Bestätigen (erledigt) mit optionaler Antwort, sofort live; p_done = false macht wieder offen
create function public.p_note_confirm(p_id uuid, p_done boolean, p_antwort text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare a text := nullif(btrim(coalesce(p_antwort, '')), '');
begin
  update public.share_notes n set status = case when p_done then 'erledigt' else 'offen' end,
         erledigt_at = case when p_done then now() end, antwort = a, antwort_at = case when a is not null then now() end, updated_at = now()
    where n.id = p_id and exists (select 1 from public.shares s where s.id = n.share_id and s.owner = (select auth.uid()));
  return case when found then jsonb_build_object('ok', true) else jsonb_build_object('ok', false, 'grund', 'fehlt') end;
exception when check_violation then
  return jsonb_build_object('ok', false, 'grund', 'eingabe');
end $$;
-- Löschen durch den Planer (auch bestätigte): RLS-Regel «eigene löschen» oben

revoke all on function public.m_open(text, uuid, int), public.m_notes(text, uuid),
  public.m_note_add(text, uuid, text, text, int, real, real, text, text, int), public.m_note_edit(text, uuid, text, real, real),
  public.m_note_delete(text, uuid), public.p_publish(uuid, text, jsonb), public.p_note_add(uuid, text, text, real, real, text, text),
  public.p_note_edit(uuid, text, real, real), public.p_note_confirm(uuid, boolean, text) from public;
grant execute on function public.m_open(text, uuid, int), public.m_notes(text, uuid),
  public.m_note_add(text, uuid, text, text, int, real, real, text, text, int), public.m_note_edit(text, uuid, text, real, real),
  public.m_note_delete(text, uuid) to anon, authenticated;
grant execute on function public.p_publish(uuid, text, jsonb), public.p_note_add(uuid, text, text, real, real, text, text),
  public.p_note_edit(uuid, text, real, real), public.p_note_confirm(uuid, boolean, text) to authenticated;
-- Nachtrag (angewendet als 20261028_monteur_p_ohne_anon): Supabase gibt anon standardmässig Ausführungsrecht, Planer-Funktionen nur mit Login
revoke execute on function public.p_publish(uuid, text, jsonb), public.p_note_add(uuid, text, text, real, real, text, text),
  public.p_note_edit(uuid, text, real, real), public.p_note_confirm(uuid, boolean, text) from anon;
