// Price-refresh endpoint: refresh raw + graded prices for a single card.
//
// POST (or GET) with:
//   cardId : string (required)
//   graded : optional array of { company, grade } to refresh asking prices for
//
// Raw prices:
//   EN -> pokemontcg tcgplayer market prices, converted USD->AUD.
//   JP -> skipped for now (see TODO).
// Graded prices: eBay AU asking prices (best-guess; label "asking" in UI).
//
// Never writes a fake 0 — a missing price simply writes nothing for that entry.

import { supabaseAdmin } from './lib/supabaseAdmin.js'
import { pickTcgVariantPrice } from './lib/normalize.js'
import { usdToAud, getUsdToAudRate } from './lib/fx.js'
import * as ebay from './lib/sources/ebay.js'

const POKEMONTCG_BASE = 'https://api.pokemontcg.io/v2'

function utcDay() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

async function fetchTcgplayerPrices(cardId) {
  const res = await fetch(`${POKEMONTCG_BASE}/cards/${encodeURIComponent(cardId)}`, {
    headers: { 'X-Api-Key': process.env.POKEMONTCG_API_KEY },
  })
  if (!res.ok) {
    throw new Error(`pokemontcg GET /cards/${cardId} -> ${res.status} ${res.statusText}`)
  }
  const body = await res.json()
  return body?.data?.tcgplayer?.prices
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

export default async function handler(req, res) {
  try {
    const cardId = req.body?.cardId ?? req.query?.cardId
    const graded = req.body?.graded ?? null

    if (!cardId) {
      return res.status(400).json({ error: 'cardId is required' })
    }

    const { data: card, error: cardErr } = await supabaseAdmin
      .from('cards')
      .select('id, language, name, number, set_id')
      .eq('id', cardId)
      .single()
    if (cardErr || !card) {
      return res.status(404).json({ error: `card not found: ${cardId}` })
    }

    let rawCount = 0
    if (card.language === 'EN') {
      rawCount = await refreshRawEn(card)
    } else {
      // TODO: JP raw pricing via TCGdex / Cardmarket — pokemontcg has no JP data.
    }

    let gradedCount = 0
    if (Array.isArray(graded) && graded.length > 0) {
      gradedCount = await refreshGraded(card, graded)
    }

    return res.status(200).json({ raw: rawCount, graded: gradedCount })
  } catch (error) {
    console.error('price-refresh failed:', error)
    return res.status(500).json({ error: String(error?.message ?? error) })
  }
}
