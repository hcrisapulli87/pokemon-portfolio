// Shared price-refresh core, reused by the user-triggered price-refresh endpoint
// and the nightly cron-snapshot job.
//
// Raw prices:
//   EN -> pokemontcg tcgplayer market prices, converted USD->AUD.
//   JP -> skipped for now (see TODO).
// Graded prices: eBay AU asking prices (best-guess; label "asking" in UI).
//
// Never writes a fake 0 — a missing price simply writes nothing for that entry.

import { supabaseAdmin } from './supabaseAdmin.js'
import { pickTcgVariantPrice } from './normalize.js'
import { usdToAud, getUsdToAudRate } from './fx.js'
import * as ebay from './sources/ebay.js'

const POKEMONTCG_BASE = 'https://api.pokemontcg.io/v2'

export function utcDay() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

// Pure helper: the YYYY-MM-DD date `daysAgo` days before `from` (default: now).
// Used to compute the history-pruning cutoff. Network-free, easy to unit test.
export function cutoffDay(daysAgo, from = new Date()) {
  const d = new Date(from)
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchTcgplayerPrices(cardId) {
  // pokemontcg.io 5xxs intermittently under load — retry those with backoff so a
  // flaky moment doesn't leave a collection card priceless.
  let lastErr
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${POKEMONTCG_BASE}/cards/${encodeURIComponent(cardId)}`, {
      headers: { 'X-Api-Key': process.env.POKEMONTCG_API_KEY },
    })
    if (res.ok) {
      const body = await res.json()
      return body?.data?.tcgplayer?.prices
    }
    lastErr = new Error(`pokemontcg GET /cards/${cardId} -> ${res.status} ${res.statusText}`)
    if (res.status < 500) throw lastErr
    await sleep(600 * (attempt + 1))
  }
  throw lastErr
}

async function refreshRawEn(card) {
  const prices = await fetchTcgplayerPrices(card.id)
  const variantRows = pickTcgVariantPrice(prices) // [{ variant_type, market_price(USD) }]
  if (variantRows.length === 0) return 0

  const rate = await getUsdToAudRate()
  const now = new Date().toISOString()
  const day = utcDay()

  let count = 0
  for (const { variant_type, market_price } of variantRows) {
    const aud = usdToAud(market_price, rate)
    if (aud === null || aud === undefined) continue // never write a fake 0

    const { error: cacheErr } = await supabaseAdmin.from('price_cache').upsert(
      {
        card_id: card.id,
        variant_type,
        source: 'tcgplayer',
        market_price: aud,
        currency: 'AUD',
        updated_at: now,
      },
      { onConflict: 'card_id,variant_type,source' }
    )
    if (cacheErr) throw new Error(`price_cache upsert failed: ${cacheErr.message}`)

    const { error: histErr } = await supabaseAdmin.from('price_history').upsert(
      {
        card_id: card.id,
        variant_type,
        day,
        market_price: aud,
        currency: 'AUD',
      },
      { onConflict: 'card_id,variant_type,day' }
    )
    if (histErr) throw new Error(`price_history upsert failed: ${histErr.message}`)

    count += 1
  }
  return count
}

// JP raw prices via eBay AU asking (pokemontcg has no JP data). ASKING signal —
// labelled "asking" in the UI. Stored under source 'ebay', variant 'normal'.
async function refreshRawJp(card) {
  const result = await ebay.searchRaw({
    name: card.name,
    nameEn: card.name_en,
    number: card.number,
    isJapanese: true,
  })
  if (!result) return 0

  const now = new Date().toISOString()
  const day = utcDay()

  const { error: cacheErr } = await supabaseAdmin.from('price_cache').upsert(
    {
      card_id: card.id,
      variant_type: 'normal',
      source: 'ebay',
      market_price: result.price,
      currency: 'AUD',
      updated_at: now,
    },
    { onConflict: 'card_id,variant_type,source' }
  )
  if (cacheErr) throw new Error(`price_cache upsert failed: ${cacheErr.message}`)

  const { error: histErr } = await supabaseAdmin.from('price_history').upsert(
    {
      card_id: card.id,
      variant_type: 'normal',
      day,
      market_price: result.price,
      currency: 'AUD',
    },
    { onConflict: 'card_id,variant_type,day' }
  )
  if (histErr) throw new Error(`price_history upsert failed: ${histErr.message}`)

  return 1
}

async function refreshGraded(card, gradedList) {
  const isJapanese = card.language === 'JP'
  // Keep it simple: pass the set_id through as the set code for JP queries.
  const setCode = card.set_id
  const now = new Date().toISOString()
  const day = utcDay()

  let count = 0
  for (const { company, grade } of gradedList) {
    const result = await ebay.searchGraded({
      name: card.name,
      number: card.number,
      company,
      grade,
      setCode,
      isJapanese,
    })
    if (!result) continue // no listings -> write nothing

    const { error: cacheErr } = await supabaseAdmin
      .from('graded_price_cache')
      .upsert(
        {
          card_id: card.id,
          company,
          grade,
          avg_price: result.avg,
          min_price: result.min,
          max_price: result.max,
          num_listings: result.num,
          currency: 'AUD',
          updated_at: now,
        },
        { onConflict: 'card_id,company,grade' }
      )
    if (cacheErr) throw new Error(`graded_price_cache upsert failed: ${cacheErr.message}`)

    const { error: histErr } = await supabaseAdmin
      .from('graded_price_history')
      .upsert(
        {
          card_id: card.id,
          company,
          grade,
          day,
          avg_price: result.avg,
          currency: 'AUD',
        },
        { onConflict: 'card_id,company,grade,day' }
      )
    if (histErr) throw new Error(`graded_price_history upsert failed: ${histErr.message}`)

    count += 1
  }
  return count
}

// Refresh raw + graded prices for a single card. Returns { raw, graded } counts.
export async function refreshCard(card, gradedList = []) {
  let raw = 0
  if (card.language === 'EN') {
    raw = await refreshRawEn(card)
  } else {
    // JP: eBay AU asking price (pokemontcg has no JP data).
    raw = await refreshRawJp(card)
  }

  let graded = 0
  if (Array.isArray(gradedList) && gradedList.length > 0) {
    graded = await refreshGraded(card, gradedList)
  }

  return { raw, graded }
}
