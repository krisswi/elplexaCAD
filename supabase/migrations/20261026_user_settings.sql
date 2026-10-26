-- Offerte Schritt 2 (26.10.2026, CJ): Daten beim Benutzer statt beim Projekt. Heute das Firmenprofil (name 'profil'),
-- später Sollwert-Einstellungen und IC-Zeiten unter eigenem Namen. Die Positionsdatenbank bekommt in Schritt 3 eine eigene Tabelle.
-- Eine Zeile je Benutzer und Name. Nur der Benutzer selbst liest und schreibt (RLS), anon hat keinen Zugriff.
-- updated_at setzt die App (Zeit der Änderung), damit der Abgleich Browser ↔ online den neueren Stand erkennt.

create table public.user_settings (
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (name ~ '^[a-z][a-z0-9_]{0,39}$'),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 1000000), -- Logo bis 300 KB als data-URL
  updated_at timestamptz not null default now(),
  primary key (owner, name)
);

alter table public.user_settings enable row level security;
create policy "lesen: eigene" on public.user_settings for select to authenticated
  using (owner = (select auth.uid()));
create policy "anlegen: eigene" on public.user_settings for insert to authenticated
  with check (owner = (select auth.uid()));
create policy "ändern: eigene" on public.user_settings for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "löschen: eigene" on public.user_settings for delete to authenticated
  using (owner = (select auth.uid()));
revoke all on public.user_settings from anon, authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;
