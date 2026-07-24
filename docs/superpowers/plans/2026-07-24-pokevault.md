# PokéVault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build PokéVault — a single responsive PWA (installable on desktop + mobile, shared live DB) for tracking a Pokémon card collection with real raw + graded prices, full English + Japanese support, and master-set completion.

**Architecture:** React + Vite PWA on Vercel; Supabase (Postgres + Realtime + magic-link Auth) as the shared backend; Vercel serverless functions + nightly cron for all third-party API calls (pokemontcg.io EN, TCGdex JP, eBay-AU graded), which populate catalog + price caches in Postgres. Client reads Postgres via `@supabase/supabase-js`; master-set completion is derived, never stored.

**Tech Stack:** React 18, Vite, Tailwind CSS, `@supabase/supabase-js`, `vite-plugin-pwa`, Vercel serverless (Node), Vitest + React Testing Library, Vitest for serverless units.

**Scope:** Phase 1 (core) only. Phase 2 (mobile camera scan) is a separate follow-up plan.

**Reference spec:** `docs/superpowers/specs/2026-07-24-pokevault-design.md`

---

## File Structure

```
pokevault/
├── api/                         # Vercel serverless functions
│   ├── catalog-sync.js          # sync sets/cards/variants/images
│   ├── price-refresh.js         # raw + graded price lookups
│   ├── cron-snapshot.js         # nightly price-history snapshot
│   ├── search.js                # unified EN/JP search proxy
│   └── lib/
│       ├── supabaseAdmin.js     # service-role client (server only)
│       ├── sources/
│       │   ├── pokemontcg.js    # EN adapter (keyed)
│       │   ├── tcgdex.js        # JP adapter
│       │   └── ebay.js          # graded asking-price adapter (EBAY_AU)
│       ├── normalize.js         # map raw API rows -> our schema
│       └── fx.js                # USD->AUD
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── lib/
│   │   ├── supabase.js          # browser client (publishable key)
│   │   └── completion.js        # pure master-set completion math
│   ├── context/AuthContext.jsx
│   ├── components/              # Nav, CardTile, VariantBadge, PriceLabel, etc.
│   └── pages/                   # Dashboard, Collection, Graded, MasterSets, SetDetail, Search, Login
├── supabase/schema.sql
├── public/                      # icons, manifest assets
├── tests/                       # vitest (client + api units)
├── .env.example
├── vercel.json                  # cron + function config
├── vite.config.js
├── tailwind.config.js
├── package.json
└── README.md
```

---

## Task 1: Scaffold Vite + React + Tailwind + PWA

**Files:**
- Create: `package.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`, `src/index.css`, `.gitignore`, `.env.example`

- [ ] **Step 1: Init package.json + deps**

```bash
cd pokevault
npm init -y
npm i react react-dom react-router-dom @supabase/supabase-js
npm i -D vite @vitejs/plugin-react tailwindcss postcss autoprefixer vite-plugin-pwa vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: vite.config.js** (React + PWA + vitest)

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'PokéVault',
        short_name: 'PokéVault',
        theme_color: '#0b1020',
        background_color: '#0b1020',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: { environment: 'jsdom', globals: true, setupFiles: './tests/setup.js' },
})
```

- [ ] **Step 3: Tailwind init + config**

```bash
npx tailwindcss init -p
```

Set `content: ['./index.html', './src/**/*.{js,jsx}']` in `tailwind.config.js`; add `@tailwind base; @tailwind components; @tailwind utilities;` to `src/index.css`. Dark theme by default (mirrors old app's DM Sans dark aesthetic).

- [ ] **Step 4: Minimal App renders**

`src/App.jsx` returns `<div>PokéVault</div>`; `src/main.jsx` mounts it. `index.html` has `<div id="root">` + `<script type="module" src="/src/main.jsx">`.

- [ ] **Step 5: `.gitignore` + `.env.example`**

`.gitignore`: `node_modules`, `dist`, `.env`, `.vercel`.
`.env.example`:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
# server-only (Vercel env, never VITE_ prefixed):
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
POKEMONTCG_API_KEY=
EBAY_APP_ID=
EBAY_CERT_ID=
```

- [ ] **Step 6: Verify + commit**

Run: `npm run build` → expect success.
```bash
git add -A && git commit -m "feat: scaffold Vite+React+Tailwind+PWA"
```

---

## Task 2: Supabase schema

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1: Write schema.sql** — catalog + collection + prices + RLS. Uses the re-runnable drop-and-recreate pattern for policies/triggers (Postgres has no `create policy if not exists`); contains NO `DROP TABLE`/`DELETE`/`TRUNCATE` (safe past Supabase's destructive-op warning).

```sql
-- profiles (single user, but RLS-guarded)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz default now()
);

-- catalog (no user scope; readable by authenticated)
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

-- profile auto-create trigger + backfill
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

-- catalog + prices: read for any authenticated user; writes done via service role (bypasses RLS)
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
create policy own_profile on profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists own_collection on collection;
create policy own_collection on collection for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own_graded on graded;
create policy own_graded on graded for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own_chased on chased_sets;
create policy own_chased on chased_sets for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Commit** (no run here — schema is executed in Supabase by Harrison at hand-off)

```bash
git add supabase/schema.sql && git commit -m "feat: Postgres schema + RLS"
```

---

## Task 3: Supabase browser client + auth context

**Files:**
- Create: `src/lib/supabase.js`, `src/context/AuthContext.jsx`, `src/pages/Login.jsx`

- [ ] **Step 1: Browser client**

```js
// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)
```

- [ ] **Step 2: AuthContext** — tracks session via `supabase.auth.onAuthStateChange`, exposes `session`, `signInWithOtp(email)`, `signOut()`.

```jsx
// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
const Ctx = createContext(null)
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  const value = {
    session, loading,
    signInWithOtp: (email) => supabase.auth.signInWithOtp({ email }),
    signOut: () => supabase.auth.signOut(),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export const useAuth = () => useContext(Ctx)
```

- [ ] **Step 3: Login page** — email input → `signInWithOtp`, shows "check your email" state.

- [ ] **Step 4: Verify + commit**

Run: `npm run build`. Commit: `feat: supabase client + magic-link auth`.

---

## Task 4: Responsive app shell + routing

**Files:**
- Modify: `src/App.jsx`
- Create: `src/components/Nav.jsx`, `src/components/ProtectedRoute.jsx`

- [ ] **Step 1: Routing** — `BrowserRouter` with routes: `/` Dashboard, `/collection`, `/graded`, `/sets` (MasterSets), `/sets/:setId` (SetDetail), `/search`, `/login`. Wrap protected routes so unauthenticated → `/login`.

- [ ] **Step 2: Nav** — bottom tab bar on mobile (`fixed bottom-0`), left sidebar on desktop (`md:` breakpoint). Links: Dashboard, Collection, Graded, Sets, Search. Sign-out button.

- [ ] **Step 3: Verify + commit** — `npm run build`; commit `feat: app shell + responsive nav`.

---

## Task 5: Completion math util (TDD)

**Files:**
- Create: `src/lib/completion.js`, `tests/completion.test.js`, `tests/setup.js`

- [ ] **Step 1: Write failing test**

```js
// tests/completion.test.js
import { setCompletion } from '../src/lib/completion'
test('counts owned variants over total variants', () => {
  const variants = [
    { card_id: 'a', variant_type: 'normal' },
    { card_id: 'a', variant_type: 'reverse_holo' },
    { card_id: 'b', variant_type: 'normal' },
  ]
  const owned = [{ card_id: 'a', variant_type: 'normal' }]
  expect(setCompletion(variants, owned)).toEqual({ owned: 1, total: 3, pct: 33 })
})
test('empty set is 0/0 and pct 0', () => {
  expect(setCompletion([], [])).toEqual({ owned: 0, total: 0, pct: 0 })
})
```

- [ ] **Step 2: Run → fails** (`npx vitest run tests/completion.test.js`).

- [ ] **Step 3: Implement**

```js
// src/lib/completion.js
export function setCompletion(variants, owned) {
  const total = variants.length
  const ownedKeys = new Set(owned.map(o => `${o.card_id}|${o.variant_type}`))
  const have = variants.filter(v => ownedKeys.has(`${v.card_id}|${v.variant_type}`)).length
  const pct = total === 0 ? 0 : Math.round((have / total) * 100)
  return { owned: have, total, pct }
}
```

- [ ] **Step 4: Run → passes. Commit** `feat: master-set completion math`.

---

## Task 6: FX + price normalization utils (TDD)

**Files:**
- Create: `api/lib/fx.js`, `api/lib/normalize.js`, `tests/normalize.test.js`

- [ ] **Step 1: Failing tests** — `usdToAud(amount, rate)` and `pickTcgVariantPrice(tcgplayerPrices)` (maps pokemontcg `tcgplayer.prices.{normal,holofoil,reverseHolofoil}.market` → `{variant_type, market_price}[]`).

```js
import { usdToAud } from '../api/lib/fx'
import { pickTcgVariantPrice } from '../api/lib/normalize'
test('usdToAud', () => { expect(usdToAud(10, 1.5)).toBe(15) })
test('maps tcgplayer prices to variant rows', () => {
  const prices = { normal: { market: 2 }, reverseHolofoil: { market: 5 } }
  expect(pickTcgVariantPrice(prices)).toEqual([
    { variant_type: 'normal', market_price: 2 },
    { variant_type: 'reverse_holo', market_price: 5 },
  ])
})
```

- [ ] **Step 2: Run → fails. Step 3: Implement** (map `holofoil→holo`, `reverseHolofoil→reverse_holo`, `1stEditionHolofoil→holo`, skip null markets). **Step 4: Run → passes. Commit** `feat: fx + price normalization`.

---

## Task 7: Catalog source adapters (EN + JP)

**Files:**
- Create: `api/lib/sources/pokemontcg.js`, `api/lib/sources/tcgdex.js`, `tests/sources.test.js`

- [ ] **Step 1: pokemontcg adapter** — `fetchSets()` and `fetchSetCards(setId)` hitting `https://api.pokemontcg.io/v2` with header `X-Api-Key: process.env.POKEMONTCG_API_KEY`. Return normalized `{set}` / `{card, variants[], tcgplayerPrices}`. Derive variants from `card.tcgplayer.prices` keys + `rarity` (secret/hyper/special when number > printedTotal or rarity matches).

- [ ] **Step 2: tcgdex adapter** — `fetchSets()` / `fetchSetCards(setId)` hitting `https://api.tcgdex.net/v2/ja`. Language `'JP'`. Handle known empty-`cards:[]` sets by skipping (log, don't throw). No UA spoof needed server-side.

- [ ] **Step 3: Variant derivation test** — feed a sample card JSON (base + reverse) and assert variant rows. Keep variant logic in `normalize.js` (`deriveVariants(card)`), unit-tested — this replaces the old app's hardcoded per-set counts.

- [ ] **Step 4: Commit** `feat: EN + JP catalog adapters`.

---

## Task 8: catalog-sync serverless function

**Files:**
- Create: `api/lib/supabaseAdmin.js`, `api/catalog-sync.js`

- [ ] **Step 1: Admin client** — `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` (bypasses RLS for catalog writes).

- [ ] **Step 2: catalog-sync** — query param `?lang=EN|JP&set=<id>` (or all). Upsert sets, cards, card_variants. Idempotent (`upsert` on primary keys). Batches to avoid payload limits. Returns `{ setsUpserted, cardsUpserted, variantsUpserted }`.

- [ ] **Step 3: Verify** — with real env locally (`vercel dev`), call `/api/catalog-sync?lang=EN&set=<a modern SV set>`; confirm rows appear in Supabase and a set's variant count roughly matches pokedata.io (base + reverse + secrets).

- [ ] **Step 4: Commit** `feat: catalog-sync function`.

---

## Task 9: Pricing adapters + price-refresh function

**Files:**
- Create: `api/lib/sources/ebay.js`, `api/price-refresh.js`

- [ ] **Step 1: eBay adapter** — OAuth client-credentials token (`api.ebay.com/identity/v1/oauth2/token`, Basic auth from `EBAY_APP_ID`/`EBAY_CERT_ID`), search `buy/browse/v1/item_summary/search` on `EBAY_AU`. Query = card name + number + `"PSA 10"` etc. Return `{avg,min,max,num}` from active listing prices. **Comment clearly: asking prices, not sold.** For JP, query by set code + number (Japanese-script names don't match eBay listings — salvaged from old app).

- [ ] **Step 2: price-refresh** — body `{cardId}`: fetch raw prices (pokemontcg for EN, tcgdex/cardmarket for JP) → `pickTcgVariantPrice` → convert to AUD via `fx` → upsert `price_cache` + upsert today's `price_history` row. For graded: for each requested company/grade, eBay lookup → upsert `graded_price_cache` (+ history). Missing price → write nothing (never fake 0).

- [ ] **Step 3: Verify** — refresh a Charizard (EN) and a JP card; confirm `price_cache` populated and one `price_history` row per card/variant/day.

- [ ] **Step 4: Commit** `feat: pricing adapters + price-refresh`.

---

## Task 10: search serverless proxy + Search page

**Files:**
- Create: `api/search.js`, `src/pages/Search.jsx`, `src/components/CardTile.jsx`

- [ ] **Step 1: search.js** — `?q=<name>`: query Postgres `cards` (EN + JP) by name ILIKE, join image + set; return combined results grouped by language. (Catalog already synced into Postgres, so search is a DB query, not a live upstream call.)

- [ ] **Step 2: Search page** — search box; results show EN and JP matches together (language badge), image thumbnail, set name. Each tile → "Add to collection" (variant + condition + qty) or "Add as graded" (company + grade + cert).

- [ ] **Step 3: CardTile component** — image, name, number, set, language badge, price label (PriceLabel component reads `price_cache`).

- [ ] **Step 4: Verify + commit** — `npm run build`; commit `feat: unified EN/JP search`.

---

## Task 11: Collection page + add/edit

**Files:**
- Create: `src/pages/Collection.jsx`, `src/components/AddToCollectionModal.jsx`, `src/components/PriceLabel.jsx`

- [ ] **Step 1: Collection query** — select from `collection` join `cards` + `price_cache` for current user; responsive grid (CardTile). Sort by value desc (default).
- [ ] **Step 2: Add/edit** — modal writes to `collection` (card_id, variant_type, quantity, condition, notes). One row per card+variant+condition. Uses Supabase insert with `.select()` to get the id (no last_insert_rowid pitfalls — Postgres).
- [ ] **Step 3: Delete + quantity edit.** Realtime subscription so changes reflect live.
- [ ] **Step 4: PriceLabel** — shows AUD market price or "no data"; graded values suffixed "(asking)".
- [ ] **Step 5: Verify + commit** — `npm run build`; commit `feat: collection view + add/edit`.

---

## Task 12: Graded page

**Files:**
- Create: `src/pages/Graded.jsx`, `src/components/AddGradedModal.jsx`

- [ ] **Step 1: Graded query** — from `graded` join `cards` + `graded_price_cache` (matched on company+grade). Grid with company/grade badge, cert, asking value (labelled).
- [ ] **Step 2: Add/edit/delete graded.** On add, optionally trigger `price-refresh` for that company/grade.
- [ ] **Step 3: Verify + commit** — `npm run build`; commit `feat: graded cards view`.

---

## Task 13: Master Sets browse + chase

**Files:**
- Create: `src/pages/MasterSets.jsx`

- [ ] **Step 1: Sets list** — from `sets` (EN + JP), filter tabs EN/JP, search by name. Each set shows logo, name, total, and — if chased — completion % (via `setCompletion` over its variants + user's owned).
- [ ] **Step 2: Chase toggle** — insert/delete `chased_sets` row. Realtime.
- [ ] **Step 3: Verify + commit** — `npm run build`; commit `feat: master sets browse + chase`.

---

## Task 14: Set Detail — completion grid

**Files:**
- Create: `src/pages/SetDetail.jsx`

- [ ] **Step 1: Load set** — cards + card_variants for `:setId`; user's `collection` rows for those cards. Build variant checklist.
- [ ] **Step 2: Grid** — every card × every applicable variant; owned = filled, missing = dimmed. Toggle owned writes/deletes a `collection` row (qty 1). Header shows `setCompletion` result (derived, live).
- [ ] **Step 3: "Refresh prices" button** — calls `price-refresh` for the set's cards.
- [ ] **Step 4: Verify + commit** — `npm run build`; commit `feat: set detail completion grid`.

---

## Task 15: Dashboard

**Files:**
- Create: `src/pages/Dashboard.jsx`

- [ ] **Step 1: Totals** — sum of `collection` current values (from price_cache) + `graded` asking values; render stat cards.
- [ ] **Step 2: Value trend** — line from `price_history` aggregated per day for owned cards (auto-captured; no manual cost basis).
- [ ] **Step 3: Completion summary** — chased sets with progress bars.
- [ ] **Step 4: Verify + commit** — `npm run build`; commit `feat: dashboard`.

---

## Task 16: Nightly cron snapshot

**Files:**
- Create: `api/cron-snapshot.js`, `vercel.json`

- [ ] **Step 1: cron-snapshot** — iterate owned + chased-set cards, call price-refresh logic (shared module), write today's history rows. Prune history older than ~400 days.
- [ ] **Step 2: vercel.json** — schedule `cron-snapshot` daily; declare function runtime.

```json
{ "crons": [ { "path": "/api/cron-snapshot", "schedule": "0 14 * * *" } ] }
```

- [ ] **Step 3: Commit** `feat: nightly price snapshot cron`.

---

## Task 17: PWA polish + icons + install

**Files:**
- Create: `public/icon-192.png`, `public/icon-512.png`; Modify: `index.html`

- [ ] **Step 1: Icons** — generate branded PokéVault icons (192/512).
- [ ] **Step 2: Manifest already in vite.config (Task 1)** — verify install prompt works; offline shell loads.
- [ ] **Step 3: Verify** — `npm run build && npm run preview`; install on desktop Chrome + confirm add-to-home-screen on mobile.
- [ ] **Step 4: Commit** `feat: PWA icons + install`.

---

## Task 18: Deploy config + README hand-off

**Files:**
- Create: `README.md`; verify `vercel.json`, `.env.example`

- [ ] **Step 1: README** — setup + the account-bound hand-off checklist (Harrison's steps): create dedicated Supabase project, run `supabase/schema.sql`, get pokemontcg.io + eBay keys, connect repo to Vercel, set env vars (`VITE_*` public + server-only keys), run initial `catalog-sync`, click magic-link.
- [ ] **Step 2: Commit** `docs: README + deploy hand-off`.

---

## Verification (end-to-end)

- **Catalog:** run `catalog-sync` for an EN + a JP set; confirm images load and variant counts roughly match pokedata.io/sets.
- **Prices:** refresh a Charizard EN + a JP card; raw price populates; a PSA 10 asking value appears (labelled asking); a `price_history` row is written.
- **Master set:** mark a small set chasing, toggle owned variants, completion % is correct and derived.
- **Cross-device:** change on phone reflects on desktop live (Realtime).
- **PWA:** installs on desktop, add-to-home-screen on mobile, offline shell loads.
- **Build/tests:** `npm run build` green; `npx vitest run` green (completion, fx, normalize, variant derivation).

## Account-bound hand-offs (Harrison, at execution)

Confirm dedicated vs shared Supabase (recommend dedicated). Create project + run schema BEFORE
pushing app code. Get pokemontcg.io + eBay API keys. Connect repo to Vercel + set env vars. Click
magic-link to sign in. Run initial catalog-sync.
```
