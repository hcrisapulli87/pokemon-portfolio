# PokéVault — Design Spec

**Date:** 2026-07-24
**Status:** Approved (design)

## Context

Replaces the `pokemon-portfolio` Electron app, which has structural problems too deep to keep
building on: sql.js full-DB-rewrite-per-write (doesn't scale, corrupted `last_insert_rowid()`),
keyless pokemontcg.io calls (rate-throttled), JP + graded prices crammed into one raw column, a
706-line IPC monolith, schema-in-code migrations, hardcoded per-set variant counts, eBay
asking-not-sold prices, and desktop-only (no shared DB with a phone).

PokéVault is a clean restart: **one responsive PWA, usable on desktop and mobile with a shared
live DB**, single user, showing **real raw + graded prices**, **full English + Japanese**
support, **master-set completion tracking**, **card images**, and (phase 2) **mobile camera
scan**. The JP support, master-set concept, and eBay-AU graded lookups from the old app are the
salvageable ideas; the Electron/sql.js foundation is discarded.

## Goals

- Single codebase installable as a desktop app and add-to-home-screen mobile app, sharing one DB.
- Automatic, real pricing for raw and graded cards — no manual purchase-price entry.
- First-class English **and** Japanese cards (search shows both), with images for both.
- Master-set completion tracking (every variant) for user-selected sets.
- Free-tier data sources first; documented paid upgrade path.

## Non-Goals

- Multi-user / sharing / social features (single user).
- Manual cost-basis / purchase-price gain-loss (proven dead weight in old app).
- Native Electron desktop build.
- Camera scan in v1 (phase 2).

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| Platform | One responsive PWA (React/Vite + Supabase + Vercel), installable desktop + mobile. |
| Pricing budget | Free-first; add paid API later only if free coverage/limits fall short. |
| Camera scan | Phase 2. |
| Master-set scope | Browse any EN/JP set; user marks sets "chasing"; completion tracked for chased sets only. |

## Architecture

Mirrors the established hosted-PWA stack (Tandem / Tally / Everafter):

- **Frontend** — React + Vite PWA on Vercel. Responsive (desktop grid ↔ mobile single column),
  installable (web manifest + service worker). `@supabase/supabase-js` browser client; `VITE_*`
  env; publishable key in committed config; real `.env` gitignored.
- **Backend** — Supabase (Postgres + Realtime + magic-link Auth). Single user, but auth + RLS
  ("write only your own rows") applied as cheap safety. **Dedicated project** (recommended over
  reusing the shared Tandem project — catalog is tens of thousands of card rows, unrelated to the
  household apps). Confirm at schema-run.
- **Serverless (Vercel functions + cron)** — all third-party API calls run server-side (avoids
  browser CORS, hides any future paid key, enables caching):
  - `catalog-sync` — sets + cards + variants + images from pokemontcg.io (EN) and TCGdex (JP).
  - `price-refresh` — raw + graded lookups → cache + daily history.
  - **cron** (nightly) — price-history snapshot for owned/chased cards (PriceWatch pattern).
- **Realtime** — Supabase Realtime; a change on the phone reflects on desktop live.

### Data sources (free tier to start)

| Need | Source | Notes |
|---|---|---|
| EN catalog + images + raw price | pokemontcg.io v2 | **Use a free API key** — the old app's #1 mistake was omitting it. |
| JP catalog + images | TCGdex `/v2/ja` | Free, no key. Server-side (no UA spoof needed off-browser). |
| Raw market price (EN/JP) | pokemontcg.io (TCGplayer) + TCGdex markets/Cardmarket | Per-variant, per-source. |
| Graded price (EN/JP) | eBay Browse API (EBAY_AU) | Free. Returns **asking** (active) prices, not sold — label in UI as asking/best-guess. |
| Master-set structure | Derived from catalog rarity/variant fields | No hardcoded per-set counts. |
| USD→AUD | open.er-api.com | Free. |

**Paid upgrade path (not built now):** PokemonPriceTracker — 50k+ EN & JP cards, PSA 1-10 + real
sold comps + pop reports, daily. Slot behind the same `price-refresh` interface if free sources
prove insufficient.

## Data model (Postgres)

Normalized; no overloaded columns; variants as first-class rows.

- **sets** — `id, name, series, language ('EN'|'JP'), printed_total, total, release_date, symbol_url, logo_url`
- **cards** — `id, set_id, name, number, rarity, supertype, image_small, image_large, language`
- **card_variants** — `id, card_id, variant_type`. Master-set checklist backbone: a set's master
  set = all its cards' applicable variants (`normal`, `reverse_holo`, `holo`, `secret`,
  `special_art`, `hyper`, …).
- **collection** — `id, user_id, card_id, variant_type, quantity, condition, notes, added_at`
  (raw owned; one row per card+variant+condition).
- **graded** — `id, user_id, card_id, company ('PSA'|'CGC'|'BGS'|'SGC'), grade, cert_number, notes, added_at`
- **chased_sets** — `user_id, set_id`.
- **price_cache** — `card_id, variant_type, source, market_price, currency, updated_at`
- **graded_price_cache** — `card_id, company, grade, avg_price, min_price, max_price, num_listings, updated_at` (asking basis; labelled)
- **price_history** / **graded_price_history** — one snapshot per card(+variant/grade) per UTC day; pruned ~400 days.
- **profiles** — single-user profile (magic-link); RLS write-own.

Master-set completion is **derived** (owned variants ÷ total variants per chased set) — never a
stored count that can drift.

## Components (isolation boundaries)

- **catalog service** (serverless) — fetch + normalize sets/cards/variants from both sources into
  Postgres. Input: language + set filter. Output: upserted rows. Idempotent.
- **pricing service** (serverless) — given a card+variant (or card+company+grade), return current
  value from the right source, write cache + history. Source adapters (pokemontcg, tcgdex, ebay)
  behind one interface so a paid source can be swapped in.
- **completion util** (client) — pure function: owned variants + set variant list → completion %.
  Unit-tested.
- **search** (client → serverless proxy) — one query returns matched EN and JP cards together.
- **collection / graded / master-sets / dashboard** — React views over Supabase, Realtime-backed.

## Features / phases

### Phase 1 — Core (v1)
1. Auth + responsive shell + PWA manifest/service worker.
2. Catalog sync (EN with key, JP via TCGdex); idempotent, re-runnable.
3. Unified EN + JP search; add to collection (raw) or as graded.
4. Collection view — condition, quantity, per-card current value, images, responsive grid.
5. Graded view — company/grade/cert, eBay-AU asking value (labelled).
6. Master sets — browse any EN/JP set; mark chasing; completion grid + progress %.
7. Prices — `price-refresh` + nightly cron; automatic price-history value trend (no manual cost basis).
8. Dashboard — total value, value trend, completion summaries.

### Phase 2 — Mobile camera scan
- `getUserMedia` capture in the PWA.
- On-device Tesseract.js OCR of collector number (`025/165`) + name → catalog match.
- Confidence score shown; user confirms before add. Optional server-side vision fallback (Claude)
  when OCR confidence is low.

## Error handling

- Serverless fetches: retry with backoff; on upstream gap (known TCGdex empty-set cases) record
  and skip, never crash the sync.
- Prices: missing price → show "no data", never a fake 0. Graded values always labelled asking.
- Auth: magic-link failure → clear retry path.

## Testing

- Unit: master-set completion math, price parsing/normalization, USD→AUD, JP-name handling.
- Integration: `catalog-sync` populates a known set with correct variant count; `price-refresh`
  writes cache + one history row.
- E2E (manual, verification section of plan): cross-device Realtime, PWA install both platforms.

## Salvage vs discard

**Reuse (reimplement clean):** TCGdex JP integration, master-set variant concept, eBay-AU graded
query strategy (set-code + number for JP), daily price-history snapshots, USD→AUD, gain/loss from
history.

**Discard:** Electron, sql.js + full-DB export, keyless pokemontcg.io, overloaded price columns,
706-line IPC monolith, schema-in-code migrations, hardcoded variant counts, plaintext eBay creds
(→ serverless env vars).

## Account-bound hand-offs (Harrison)

Create Supabase project + run schema; click magic-link to sign in; connect repo to Vercel + set
env vars; obtain pokemontcg.io + eBay API keys. Stand up backend/schema BEFORE pushing app code
that depends on it.
