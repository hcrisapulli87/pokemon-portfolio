# PokéVault

Single-user Pokémon card collection tracker. One responsive PWA (installable on
desktop and mobile) sharing a live database — track raw + graded card values,
full English **and** Japanese support, and master-set completion.

Rebuild of the old Electron `pokemon-portfolio` app. See
`docs/superpowers/specs/2026-07-24-pokevault-design.md` and
`docs/superpowers/plans/2026-07-24-pokevault.md`.

## Stack

- **Frontend:** React + Vite + Tailwind, PWA (`vite-plugin-pwa`), on Vercel.
- **Backend:** Supabase (Postgres + Realtime + magic-link Auth), RLS write-own.
- **Serverless (Vercel functions + cron):** all third-party API calls run
  server-side — pokemontcg.io (EN catalog + raw prices), TCGdex (JP catalog),
  eBay-AU Browse (graded asking prices).

## Data sources (free tier)

| Need | Source |
|---|---|
| EN catalog + images + raw price | pokemontcg.io v2 (API key) |
| JP catalog + images | TCGdex `/v2/ja` (no key) |
| Graded prices (EN/JP) | eBay Browse API, EBAY_AU — **asking** prices, labelled as such |
| USD→AUD | open.er-api.com |

Graded values are eBay *active-listing asking* prices (the sold/Finding API is
gone), so they are best-guess and labelled "(asking)" everywhere in the UI.

Paid upgrade path (not built): PokemonPriceTracker slots behind the same
`api/lib/refresh.js` interface if free coverage/limits fall short.

## Local dev

```bash
npm install
cp .env.example .env    # fill in the values below
npm run dev             # vite dev server (frontend only)
npm run test            # vitest
npm run build           # production build
```

Serverless functions (`api/*.js`) run under `vercel dev` (needs the Vercel CLI)
or in Vercel's cloud — not the plain vite dev server.

## Environment variables

Client (safe to ship — RLS enforces security, publishable key is public):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server-only (Vercel env — never `VITE_`-prefixed):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `POKEMONTCG_API_KEY` — free key from dev.pokemontcg.io
- `EBAY_APP_ID`, `EBAY_CERT_ID` — eBay developer app (Browse API)
- `ADMIN_SYNC_TOKEN` — long random string; gates the admin/cron write endpoints
- `CRON_SECRET` — set automatically by Vercel Cron; also accepted by the gate

## API endpoints (serverless)

- `POST /api/price-refresh` — refresh one card's prices. **Requires** an
  authenticated Supabase user: send `Authorization: Bearer <access_token>`.
  Body `{ cardId, graded?: [{company, grade}] }`.
- `GET /api/catalog-sync?lang=EN|JP&set=<id>` — **admin only**: send
  `x-admin-token: <ADMIN_SYNC_TOKEN>`. Populates sets/cards/variants.
- `GET|POST /api/cron-snapshot` — nightly (Vercel Cron); writes daily price
  history and prunes >400 days. Gated by `CRON_SECRET`/`ADMIN_SYNC_TOKEN`.

## Setup / hand-off checklist (account-bound — do these yourself)

1. **Supabase project** — reuse the **shared** Tandem/Tally/Everafter project
   (free-tier project limit reached). PokéVault is fully isolated in its own
   `pokevault` Postgres schema, so it never touches the other apps' tables.
2. **Run the schema** — paste `supabase/schema.sql` into the Supabase SQL Editor
   and run. It creates the `pokevault` schema + all tables/policies/grants. Uses
   idempotent drop-and-recreate for policies only; the destructive-op warning is
   about those `drop policy … if exists` lines, not data — there is no
   `DROP TABLE`/`DELETE`/`TRUNCATE`. Safe to re-run.
3. **Expose the schema** — Dashboard → Settings → API → **Exposed schemas** →
   add `pokevault` (alongside `public`). The app clients are configured with
   `{ db: { schema: 'pokevault' } }`, so without this every query 404s.
4. **API keys** — get a free `POKEMONTCG_API_KEY` (dev.pokemontcg.io) and an
   eBay developer app (`EBAY_APP_ID` / `EBAY_CERT_ID`, Browse API).
5. **Vercel** — connect the repo; set all env vars above (client + server);
   generate a random `ADMIN_SYNC_TOKEN`. Deploy.
6. **Seed the catalog** — call `catalog-sync` (with the admin token) to populate
   sets/cards/variants/images. Start with `?lang=EN` and a single `&set=<id>` to
   sanity-check, then run full.
7. **Sign in** — open the app, request a magic link, click it in your email.
8. **Verify** — search a card (EN + JP both show), add to collection, mark a set
   as chasing, toggle variants (completion %), refresh a Charizard's price, and
   confirm the dashboard totals + trend populate.

Stand up the Supabase backend + schema **before** the first Vercel deploy that
depends on it.
