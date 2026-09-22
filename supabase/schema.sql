-- ============================================================================
--  WYCENA — Beata Adamkiewicz-Dudek
--  Schemat bazy danych dla modułu "Nieruchomości" (Supabase / PostgreSQL)
--  ---------------------------------------------------------------------------
--  Jak użyć:
--    Supabase Dashboard -> SQL Editor -> New query -> wklej całość -> Run.
--  Skrypt jest idempotentny: można go uruchomić ponownie po zmianach.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Rozszerzenia
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- 2. Lista administratorów
--    Tylko użytkownicy z tej tabeli mogą dodawać/edytować ogłoszenia.
--    Rejestracja w Supabase Auth NIE daje automatycznie praw administratora —
--    trzeba ręcznie dodać user_id do tej tabeli (patrz README-BACKEND.md).
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Funkcja pomocnicza używana we wszystkich politykach RLS.
-- SECURITY DEFINER, żeby polityki nie wymagały uprawnień SELECT na admins.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "admins_select_self" on public.admins;
create policy "admins_select_self" on public.admins
  for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Tabela ogłoszeń
--    Nazwy pól odpowiadają 1:1 schematowi, którego oczekuje frontend
--    (mapowanie snake_case -> camelCase robi js/api.js).
-- ---------------------------------------------------------------------------
create table if not exists public.properties (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,

  -- podstawy
  title            text not null,
  transaction_type text not null default 'Sprzedaż'
                     check (transaction_type in ('Sprzedaż', 'Wynajem')),
  property_type    text not null default 'Mieszkanie',

  -- cena
  price            numeric(12,2),
  price_unit       text not null default '',          -- '' | '/mies.'
  price_per_m      numeric(12,2),
  rent             numeric(12,2),                     -- czynsz administracyjny
  currency         text not null default 'PLN',
  price_hidden     boolean not null default false,    -- "cena do negocjacji"

  -- lokalizacja
  location         text,                              -- gotowy napis na kartę
  street           text,
  district         text,
  city             text,
  county           text,
  voivodeship      text,
  lat              double precision,
  lng              double precision,

  -- parametry
  area             numeric(10,2),
  rooms            integer,
  bathrooms        integer,
  floor            text,                              -- 'Parter', '5/9', ...
  floors_total     integer,
  plot_area        numeric(12,2),
  year             integer,
  market           text,                              -- 'Pierwotny' | 'Wtórny'
  heating          text,
  building_type    text,
  condition        text,                              -- stan wykończenia

  -- treść
  description      text,                              -- akapity oddzielone \n\n
  features         jsonb not null default '[]'::jsonb, -- ["Balkon", ...]
  details          jsonb not null default '[]'::jsonb, -- [{label,value}, ...]

  -- publikacja
  status           text not null default 'Dostępna'
                     check (status in ('Dostępna', 'Zarezerwowana', 'Sprzedana', 'Wynajęta', 'Nieaktywna')),
  published        boolean not null default false,
  featured         boolean not null default false,
  sort_order       integer not null default 0,

  -- SEO
  meta_title       text,
  meta_description text,

  -- pochodzenie danych
  source           text not null default 'manual' check (source in ('manual', 'otodom')),
  source_url       text,
  source_id        text,
  ai_processed     boolean not null default false,
  raw              jsonb,                             -- przycięty ślad importu

  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Jedno ogłoszenie z Otodom = jeden rekord (ochrona przed podwójnym importem).
create unique index if not exists properties_source_id_uniq
  on public.properties (source, source_id)
  where source_id is not null;

create index if not exists properties_published_idx
  on public.properties (published, featured desc, sort_order desc, created_at desc);
create index if not exists properties_transaction_idx on public.properties (transaction_type);
create index if not exists properties_type_idx        on public.properties (property_type);
create index if not exists properties_city_idx        on public.properties (city);

-- ---------------------------------------------------------------------------
-- 4. Zdjęcia
--    Pliki trzymamy w Storage (bucket 'property-images'), w bazie tylko URL-e.
--    url       — wersja duża (galeria, ok. 1600 px)
--    thumb_url — miniatura (karty listy, ok. 640 px) — szybkie ładowanie na LTE
-- ---------------------------------------------------------------------------
create table if not exists public.property_images (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  url          text not null,
  thumb_url    text,
  storage_path text,
  thumb_path   text,
  alt          text,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists property_images_property_idx
  on public.property_images (property_id, position);

-- ---------------------------------------------------------------------------
-- 5. Licznik użycia funkcji serwerowych (limit kosztów OpenAI / scrapingu)
-- ---------------------------------------------------------------------------
create table if not exists public.api_usage (
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete set null,
  kind       text not null,          -- 'scrape' | 'ai' | 'images'
  meta       jsonb,
  created_at timestamptz not null default now()
);

create index if not exists api_usage_user_time_idx on public.api_usage (user_id, created_at desc);

alter table public.api_usage enable row level security;

drop policy if exists "api_usage_admin_read" on public.api_usage;
create policy "api_usage_admin_read" on public.api_usage
  for select to authenticated using (public.is_admin());
-- Zapis wyłącznie przez Edge Functions (service_role pomija RLS).

-- ---------------------------------------------------------------------------
-- 6. updated_at — trigger
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists properties_touch_updated_at on public.properties;
create trigger properties_touch_updated_at
  before update on public.properties
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7. Generator slugów (SEO-friendly adresy: /oferta.html?slug=...)
-- ---------------------------------------------------------------------------
-- Świadomie bez rozszerzenia `unaccent`: w Supabase bywa ono instalowane
-- w schemacie `extensions`, co przy innym search_path psuje tę funkcję.
-- translate() poniżej pokrywa polskie znaki (oraz kilka typowych obcych),
-- a to wszystko, czego potrzebujemy do slugów.
create or replace function public.slugify(txt text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      lower(
        translate(
          coalesce(txt, ''),
          'ĄĆĘŁŃÓŚŹŻąćęłńóśźżÄÖÜäöüßÀÉÈÊàéèêÇç',
          'ACELNOSZZacelnoszzAOUaousAEEEaeeeCc'
        )
      ),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$;

-- Zwraca wolny slug: 'dom-w-korniku', 'dom-w-korniku-2', ...
create or replace function public.unique_slug(base_text text, self_id uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base      text := nullif(public.slugify(base_text), '');
  candidate text;
  n         integer := 1;
begin
  if base is null then
    base := 'oferta';
  end if;
  base := left(base, 80);
  candidate := base;
  while exists (
    select 1 from public.properties p
    where p.slug = candidate
      and (self_id is null or p.id <> self_id)
  ) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;

grant execute on function public.slugify(text)              to anon, authenticated;
grant execute on function public.unique_slug(text, uuid)    to authenticated;

-- ---------------------------------------------------------------------------
-- 8. RLS — właściwa ochrona danych
--    Publiczność (klucz anon, widoczny w kodzie strony) widzi WYŁĄCZNIE
--    ogłoszenia z published = true. Jakikolwiek zapis wymaga bycia adminem.
-- ---------------------------------------------------------------------------
alter table public.properties      enable row level security;
alter table public.property_images enable row level security;

-- --- properties ---
drop policy if exists "properties_public_read"  on public.properties;
create policy "properties_public_read" on public.properties
  for select to anon, authenticated
  using (published = true or public.is_admin());

drop policy if exists "properties_admin_insert" on public.properties;
create policy "properties_admin_insert" on public.properties
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "properties_admin_update" on public.properties;
create policy "properties_admin_update" on public.properties
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "properties_admin_delete" on public.properties;
create policy "properties_admin_delete" on public.properties
  for delete to authenticated
  using (public.is_admin());

-- --- property_images ---
drop policy if exists "images_public_read" on public.property_images;
create policy "images_public_read" on public.property_images
  for select to anon, authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.properties p
      where p.id = property_images.property_id and p.published = true
    )
  );

drop policy if exists "images_admin_write" on public.property_images;
create policy "images_admin_write" on public.property_images
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 9. Storage — bucket na zdjęcia
--    Publiczny do czytania (zdjęcia w ogłoszeniach), zapis tylko dla adminów.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-images', 'property-images', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public             = true,
      file_size_limit    = 10485760,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

drop policy if exists "property_images_public_read" on storage.objects;
create policy "property_images_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'property-images');

drop policy if exists "property_images_admin_insert" on storage.objects;
create policy "property_images_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'property-images' and public.is_admin());

drop policy if exists "property_images_admin_update" on storage.objects;
create policy "property_images_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'property-images' and public.is_admin());

drop policy if exists "property_images_admin_delete" on storage.objects;
create policy "property_images_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'property-images' and public.is_admin());

-- ---------------------------------------------------------------------------
-- 10. Uprawnienia na poziomie tabel (RLS działa dopiero po GRANT)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.properties, public.property_images to anon, authenticated;
grant insert, update, delete on public.properties, public.property_images to authenticated;
grant select on public.admins to authenticated;

-- service_role używają WYŁĄCZNIE Edge Functions (po stronie serwera).
-- Nadajemy uprawnienia jawnie, żeby schemat działał niezależnie od ustawienia
-- „Automatically expose new tables" w konfiguracji projektu Supabase
-- (przy wyłączonej opcji nowe tabele nie dostają uprawnień automatycznie).
grant usage on schema public to service_role;
grant all on public.properties, public.property_images, public.admins, public.api_usage
  to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- 11. Opinie Google (cache widżetu na stronie)
--    JEDEN wiersz (id = 1) z ostatnio pobraną oceną i maks. 5 opiniami.
--    Zapis wykonuje WYŁĄCZNIE Edge Function `refresh-google-reviews`,
--    uruchamiana raz dziennie przez harmonogram (patrz README-BACKEND.md,
--    sekcja „Opinie Google"). Strona WWW tylko CZYTA ten wiersz — nigdy nie
--    odpytuje Google bezpośrednio, więc ruch na stronie nie zużywa limitu
--    darmowych zapytań do Google Places API.
-- ---------------------------------------------------------------------------
create table if not exists public.google_reviews (
  id                 smallint primary key default 1,
  place_id           text,
  place_name         text,
  rating             numeric(2,1),
  user_ratings_total integer,
  reviews            jsonb not null default '[]'::jsonb,
  maps_uri           text,
  fetched_at         timestamptz,
  updated_at         timestamptz not null default now(),
  constraint google_reviews_singleton check (id = 1)
);

alter table public.google_reviews enable row level security;

drop policy if exists "google_reviews_public_read" on public.google_reviews;
create policy "google_reviews_public_read" on public.google_reviews
  for select to anon, authenticated
  using (true);
-- Brak polityk insert/update/delete dla anon/authenticated — zapis wyłącznie
-- przez service_role (Edge Function), który omija RLS.

drop trigger if exists google_reviews_touch_updated_at on public.google_reviews;
create trigger google_reviews_touch_updated_at
  before update on public.google_reviews
  for each row execute function public.touch_updated_at();

grant select on public.google_reviews to anon, authenticated;
grant all on public.google_reviews to service_role;

-- ============================================================================
--  KONIEC. Następny krok: README-BACKEND.md, sekcja "3. Konto administratora".
-- ============================================================================
