-- PokéVault schema. Re-runnable: drops-and-recreates policies/triggers only
-- (Postgres has no "create policy if not exists"). Contains NO DROP TABLE /
-- DELETE / TRUNCATE and never removes rows — safe past Supabase's
-- destructive-operation warning.

-- profiles (single user, but RLS-guarded)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz default now()
);

-- catalog (no user scope; readable by any authenticated user)
create table if not exists sets (
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
create table if not exists cards (
  id text primary key,
  set_id text references sets(id),
  name text not null,
  number text,
  rarity text,
  supertype text,
  image_small text,
  image_large text,
  language text not null check (language in ('EN','JP'))
);
create table if not exists card_variants (
  id bigserial primary key,
  card_id text references cards(id) on delete cascade,
  variant_type text not null,
  unique (card_id, variant_type)
);

-- user data
create table if not exists collection (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text references cards(id),
  variant_type text not null default 'normal',
  quantity int not null default 1,
  condition text not null default 'NM',
  notes text,
  added_at timestamptz default now()
);
create table if not exists graded (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text references cards(id),
  company text not null check (company in ('PSA','CGC','BGS','SGC')),
  grade numeric not null,
  cert_number text,
  notes text,
  added_at timestamptz default now()
);
create table if not exists chased_sets (
  user_id uuid not null references auth.users(id) on delete cascade,
  set_id text references sets(id),
  primary key (user_id, set_id)
);

-- price caches + history
create table if not exists price_cache (
  card_id text references cards(id),
  variant_type text not null default 'normal',
  source text not null,
  market_price numeric,
  currency text default 'AUD',
  updated_at timestamptz default now(),
  primary key (card_id, variant_type, source)
);
create table if not exists graded_price_cache (
  card_id text references cards(id),
  company text not null,
  grade numeric not null,
  avg_price numeric, min_price numeric, max_price numeric,
  num_listings int,
  currency text default 'AUD',
  updated_at timestamptz default now(),
  primary key (card_id, company, grade)
);
create table if not exists price_history (
  card_id text references cards(id),
  variant_type text not null default 'normal',
  day date not null,
  market_price numeric,
  currency text default 'AUD',
  primary key (card_id, variant_type, day)
);
create table if not exists graded_price_history (
  card_id text references cards(id),
  company text not null,
  grade numeric not null,
  day date not null,
  avg_price numeric,
  currency text default 'AUD',
  primary key (card_id, company, grade, day)
);

-- profile auto-create trigger + backfill (order-independent setup)
create or replace function handle_new_user() returns trigger as $$
begin
  insert into profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$ language plpgsql security definer;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
insert into profiles (id, email)
  select id, email from auth.users on conflict (id) do nothing;

-- RLS
alter table profiles enable row level security;
alter table collection enable row level security;
alter table graded enable row level security;
alter table chased_sets enable row level security;
alter table sets enable row level security;
alter table cards enable row level security;
alter table card_variants enable row level security;
alter table price_cache enable row level security;
alter table graded_price_cache enable row level security;
alter table price_history enable row level security;
alter table graded_price_history enable row level security;

-- catalog + prices: read for any authenticated user; writes done via service
-- role (bypasses RLS) from serverless functions
drop policy if exists catalog_read on sets;
create policy catalog_read on sets for select to authenticated using (true);
drop policy if exists catalog_read_cards on cards;
create policy catalog_read_cards on cards for select to authenticated using (true);
drop policy if exists catalog_read_variants on card_variants;
create policy catalog_read_variants on card_variants for select to authenticated using (true);
drop policy if exists price_read on price_cache;
create policy price_read on price_cache for select to authenticated using (true);
drop policy if exists gprice_read on graded_price_cache;
create policy gprice_read on graded_price_cache for select to authenticated using (true);
drop policy if exists ph_read on price_history;
create policy ph_read on price_history for select to authenticated using (true);
drop policy if exists gph_read on graded_price_history;
create policy gph_read on graded_price_history for select to authenticated using (true);

-- user tables: write only your own rows
drop policy if exists own_profile on profiles;
create policy own_profile on profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists own_collection on collection;
create policy own_collection on collection for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own_graded on graded;
create policy own_graded on graded for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own_chased on chased_sets;
create policy own_chased on chased_sets for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
