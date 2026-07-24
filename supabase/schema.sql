-- PokéVault schema. Lives in its OWN Postgres schema `pokevault` inside the
-- shared Supabase project (alongside Tandem/Tally/Everafter in `public`), so it
-- never collides with those apps' tables/triggers.
--
-- Re-runnable: drop-and-recreate for policies only (Postgres has no
-- "create policy if not exists"). Contains NO DROP TABLE / DELETE / TRUNCATE and
-- never removes rows — safe past Supabase's destructive-operation warning.
--
-- After running this, you MUST expose the `pokevault` schema to the API:
--   Supabase Dashboard -> Settings -> API -> Exposed schemas -> add "pokevault".
-- The app clients are configured with { db: { schema: 'pokevault' } }.
--
-- No profiles table / auth trigger here: this is single-user and RLS keys off
-- auth.uid() directly, so there's nothing to clobber in the shared project.

create schema if not exists pokevault;

-- catalog (no user scope; readable by any authenticated user)
create table if not exists pokevault.sets (
  id text primary key,
  name text not null,
  series text,
  language text not null check (language in ('EN','JP')),
  printed_total int,
  total int,
  release_date date,
  symbol_url text,
  logo_url text
);
create table if not exists pokevault.cards (
  id text primary key,
  set_id text references pokevault.sets(id),
  name text not null,
  number text,
  rarity text,
  supertype text,
  image_small text,
  image_large text,
  language text not null check (language in ('EN','JP'))
);
create table if not exists pokevault.card_variants (
  id bigserial primary key,
  card_id text references pokevault.cards(id) on delete cascade,
  variant_type text not null,
  unique (card_id, variant_type)
);

-- user data
create table if not exists pokevault.collection (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text references pokevault.cards(id),
  variant_type text not null default 'normal',
  quantity int not null default 1,
  condition text not null default 'NM',
  notes text,
  added_at timestamptz default now()
);
create table if not exists pokevault.graded (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text references pokevault.cards(id),
  company text not null check (company in ('PSA','CGC','BGS','SGC')),
  grade numeric not null,
  cert_number text,
  notes text,
  added_at timestamptz default now()
);
create table if not exists pokevault.chased_sets (
  user_id uuid not null references auth.users(id) on delete cascade,
  set_id text references pokevault.sets(id),
  primary key (user_id, set_id)
);

-- price caches + history
create table if not exists pokevault.price_cache (
  card_id text references pokevault.cards(id),
  variant_type text not null default 'normal',
  source text not null,
  market_price numeric,
  currency text default 'AUD',
  updated_at timestamptz default now(),
  primary key (card_id, variant_type, source)
);
create table if not exists pokevault.graded_price_cache (
  card_id text references pokevault.cards(id),
  company text not null,
  grade numeric not null,
  avg_price numeric, min_price numeric, max_price numeric,
  num_listings int,
  currency text default 'AUD',
  updated_at timestamptz default now(),
  primary key (card_id, company, grade)
);
create table if not exists pokevault.price_history (
  card_id text references pokevault.cards(id),
  variant_type text not null default 'normal',
  day date not null,
  market_price numeric,
  currency text default 'AUD',
  primary key (card_id, variant_type, day)
);
create table if not exists pokevault.graded_price_history (
  card_id text references pokevault.cards(id),
  company text not null,
  grade numeric not null,
  day date not null,
  avg_price numeric,
  currency text default 'AUD',
  primary key (card_id, company, grade, day)
);

-- RLS
alter table pokevault.sets enable row level security;
alter table pokevault.cards enable row level security;
alter table pokevault.card_variants enable row level security;
alter table pokevault.collection enable row level security;
alter table pokevault.graded enable row level security;
alter table pokevault.chased_sets enable row level security;
alter table pokevault.price_cache enable row level security;
alter table pokevault.graded_price_cache enable row level security;
alter table pokevault.price_history enable row level security;
alter table pokevault.graded_price_history enable row level security;

-- catalog + prices: read for any authenticated user; writes done via service
-- role (bypasses RLS) from serverless functions
drop policy if exists catalog_read on pokevault.sets;
create policy catalog_read on pokevault.sets for select to authenticated using (true);
drop policy if exists catalog_read_cards on pokevault.cards;
create policy catalog_read_cards on pokevault.cards for select to authenticated using (true);
drop policy if exists catalog_read_variants on pokevault.card_variants;
create policy catalog_read_variants on pokevault.card_variants for select to authenticated using (true);
drop policy if exists price_read on pokevault.price_cache;
create policy price_read on pokevault.price_cache for select to authenticated using (true);
drop policy if exists gprice_read on pokevault.graded_price_cache;
create policy gprice_read on pokevault.graded_price_cache for select to authenticated using (true);
drop policy if exists ph_read on pokevault.price_history;
create policy ph_read on pokevault.price_history for select to authenticated using (true);
drop policy if exists gph_read on pokevault.graded_price_history;
create policy gph_read on pokevault.graded_price_history for select to authenticated using (true);

-- user tables: write only your own rows
drop policy if exists own_collection on pokevault.collection;
create policy own_collection on pokevault.collection for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own_graded on pokevault.graded;
create policy own_graded on pokevault.graded for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own_chased on pokevault.chased_sets;
create policy own_chased on pokevault.chased_sets for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Grants so PostgREST roles can reach the schema (RLS still enforces row rules;
-- service_role bypasses RLS for the serverless writers).
grant usage on schema pokevault to anon, authenticated, service_role;
grant all on all tables in schema pokevault to anon, authenticated, service_role;
grant all on all sequences in schema pokevault to anon, authenticated, service_role;
alter default privileges in schema pokevault grant all on tables to anon, authenticated, service_role;
alter default privileges in schema pokevault grant all on sequences to anon, authenticated, service_role;

-- Realtime: add the user-facing tables to the supabase_realtime publication so
-- the app's collection/graded subscriptions fire. Guarded so re-runs don't error.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'pokevault' and tablename = 'collection'
  ) then
    alter publication supabase_realtime add table pokevault.collection;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'pokevault' and tablename = 'graded'
  ) then
    alter publication supabase_realtime add table pokevault.graded;
  end if;
end $$;
