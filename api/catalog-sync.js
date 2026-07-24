// Admin/manual endpoint: sync EN and/or JP catalog (sets, cards, card_variants)
// into Supabase via the service-role client (bypasses RLS).
//
// Query params:
//   lang = 'EN' | 'JP'  (default: both)
//   set  = <set id>      (optional: sync only this one set)
//
// This is intentionally large/slow for a full run — it's manual, not on a hot path.

import { supabaseAdmin } from './lib/supabaseAdmin.js'
import { requireAdmin } from './lib/auth.js'
import * as pokemontcg from './lib/sources/pokemontcg.js'
import * as tcgdex from './lib/sources/tcgdex.js'

const CHUNK = 500

function adapterFor(lang) {
  if (lang === 'EN') return pokemontcg
  if (lang === 'JP') return tcgdex
  return null
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function upsertSets(sets) {
  let count = 0
  for (const batch of chunk(sets, CHUNK)) {
    const { error } = await supabaseAdmin
      .from('sets')
      .upsert(batch, { onConflict: 'id' })
    if (error) throw new Error(`sets upsert failed: ${error.message}`)
    count += batch.length
  }
  return count
}

async function upsertCards(cards) {
  let count = 0
  for (const batch of chunk(cards, CHUNK)) {
    const { error } = await supabaseAdmin
      .from('cards')
      .upsert(batch, { onConflict: 'id' })
    if (error) throw new Error(`cards upsert failed: ${error.message}`)
    count += batch.length
  }
  return count
}

async function upsertVariants(variantRows) {
  let count = 0
  for (const batch of chunk(variantRows, CHUNK)) {
    const { error } = await supabaseAdmin
      .from('card_variants')
      .upsert(batch, { onConflict: 'card_id,variant_type' })
    if (error) throw new Error(`card_variants upsert failed: ${error.message}`)
    count += batch.length
  }
  return count
}

// Backfill set columns discovered while fetching cards (JP: release_date,
// series, English name, first-card cover). Only writes non-null fields.
async function applySetPatch(setId, patch) {
  if (!patch) return
  const update = {}
  for (const k of ['release_date', 'series', 'name_en', 'logo_url']) {
    if (patch[k] != null) update[k] = patch[k]
  }
  if (Object.keys(update).length === 0) return
  const { error } = await supabaseAdmin.from('sets').update(update).eq('id', setId)
  if (error) throw new Error(`set patch failed: ${error.message}`)
}

// Sync one set's cards + variants. Failures are contained by the caller.
async function syncSetCards(adapter, setId, totals) {
  const { items, setPatch } = await adapter.fetchSetCards(setId)
  await applySetPatch(setId, setPatch)

  if (!items || items.length === 0) return

  const cards = items.map((it) => it.card)
  const variantRows = []
  for (const it of items) {
    for (const variant_type of it.variants) {
      variantRows.push({ card_id: it.card.id, variant_type })
    }
  }

  totals.cardsUpserted += await upsertCards(cards)
  totals.variantsUpserted += await upsertVariants(variantRows)
}

async function syncLang(lang, setFilter, totals, errors) {
  const adapter = adapterFor(lang)
  if (!adapter) return

  let sets = await adapter.fetchSets()
  if (setFilter) sets = sets.filter((s) => s.id === setFilter)

  if (sets.length > 0) {
    totals.setsUpserted += await upsertSets(sets)
  }

  for (const set of sets) {
    try {
      await syncSetCards(adapter, set.id, totals)
    } catch (err) {
      // A single set's failure/empty cards must not abort the whole run.
      errors.push({ lang, set: set.id, error: String(err?.message ?? err) })
      console.warn(`catalog-sync: set ${set.id} (${lang}) failed:`, err)
    }
  }
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return
  try {
    const lang = req.query?.lang
    const setFilter = req.query?.set || null

    const langs = lang ? [lang] : ['EN', 'JP']
    for (const l of langs) {
      if (l !== 'EN' && l !== 'JP') {
        return res.status(400).json({ error: `invalid lang: ${l}` })
      }
    }

    const totals = { setsUpserted: 0, cardsUpserted: 0, variantsUpserted: 0 }
    const errors = []

    for (const l of langs) {
      await syncLang(l, setFilter, totals, errors)
    }

    return res.status(200).json({ ...totals, errors })
  } catch (error) {
    console.error('catalog-sync failed:', error)
    return res.status(500).json({ error: String(error?.message ?? error) })
  }
}
