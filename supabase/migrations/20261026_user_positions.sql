-- Offerte Schritt 3 (26.10.2026, CJ): Positionsdatenbank beim Benutzer. Eine Zeile je Position, gehört dem Benutzer, nicht dem Projekt.
-- data = Felder der Offertposition ohne Menge und Option (titel, text, eh, npk, bkp, typ, form, her, enr, ek, fak, std, ic, preis, gl).
-- id vergibt die App (fest, ändert sich nie). updated_at setzt die App (Zeit der Änderung), damit der Abgleich je Eintrag den neueren Stand erkennt.
-- Nur der Benutzer selbst liest und schreibt (RLS), anon hat keinen Zugriff. Geteilte Offerten brauchen die Tabelle nicht (Position ist kopiert).

create table public.user_positions (
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id         text not null check (id ~ '^[A-Za-z0-9_-]{1,40}$'),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 20000),
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);

alter table public.user_positions enable row level security;
create policy "lesen: eigene" on public.user_positions for select to authenticated
  using (owner = (select auth.uid()));
create policy "anlegen: eigene" on public.user_positions for insert to authenticated
  with check (owner = (select auth.uid()));
create policy "ändern: eigene" on public.user_positions for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "löschen: eigene" on public.user_positions for delete to authenticated
  using (owner = (select auth.uid()));
revoke all on public.user_positions from anon, authenticated;
grant select, insert, update, delete on public.user_positions to authenticated;
