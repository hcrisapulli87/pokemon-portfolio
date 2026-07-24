// Nightly cron: snapshot prices for every card the household cares about, then
// prune old history. Triggered by Vercel Cron (Authorization: Bearer ${CRON_SECRET})
// or manually with the admin token — gated by requireAdmin.
//
// Cards to snapshot = union of:
//   - every card in `collection`
//   - every card in `graded` (with its company+grade pairs)
//   - every card belonging to a `chased_sets` set
//
// A single card failure is caught and logged, never aborts the run.

import { supabaseAdmin } from './lib/supabaseAdmin.js'
import { requireAdmin } from './lib/auth.js'
import { refreshCard, cutoffDay } from './lib/refresh.js'

const HISTORY_RETENTION_DAYS = 400
const BATCH_SIZE = 5

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return
  try {
    // 1. Gather the distinct set of card ids + per-card graded lists.
    const cardIds = new Set()
    const gradedByCard = new Map() // card_id -> [{ company, grade }]

    const { data: collectionRows, error: collErr } = await supabaseAdmin
      .from('collection')
      .select('card_id')
    if (collErr) throw new Error(`collection select failed: ${collErr.message}`)
    for (const row of collectionRows ?? []) cardIds.add(row.card_id)

    const { data: gradedRows, error: gradedErr } = await supabaseAdmin
      .from('graded')
      .select('card_id, company, grade')
    if (gradedErr) throw new Error(`graded select failed: ${gradedErr.message}`)
    for (const row of gradedRows ?? []) {
      cardIds.add(row.card_id)
      if (!gradedByCard.has(row.card_id)) gradedByCard.set(row.card_id, [])
      gradedByCard.get(row.card_id).push({ company: row.company, grade: row.grade })
    }

    const { data: chasedRows, error: chasedErr } = await supabaseAdmin
      .from('chased_sets')
      .select('set_id')
    if (chasedErr) throw new Error(`chased_sets select failed: ${chasedErr.message}`)
    const setIds = [...new Set((chasedRows ?? []).map((r) => r.set_id))]
    if (setIds.length > 0) {
      const { data: setCards, error: setCardsErr } = await supabaseAdmin
        .from('cards')
        .select('id')
        .in('set_id', setIds)
      if (setCardsErr) throw new Error(`cards-by-set select failed: ${setCardsErr.message}`)
      for (const row of setCards ?? []) cardIds.add(row.id)
    }

    // 2. Load the card rows for everything we plan to snapshot.
    const ids = [...cardIds]
    let cards = []
    if (ids.length > 0) {
      const { data: cardRows, error: cardsErr } = await supabaseAdmin
        .from('cards')
        .select('id, language, name, number, set_id')
        .in('id', ids)
      if (cardsErr) throw new Error(`cards select failed: ${cardsErr.message}`)
      cards = cardRows ?? []
    }

    // 3. Refresh each card, in small batches, tolerating per-card failures.
    let cardsProcessed = 0
    let rawTotal = 0
    let gradedTotal = 0
    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      const batch = cards.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map((card) => refreshCard(card, gradedByCard.get(card.id) ?? []))
      )
      for (let j = 0; j < results.length; j += 1) {
        const r = results[j]
        if (r.status === 'fulfilled') {
          cardsProcessed += 1
          rawTotal += r.value.raw
          gradedTotal += r.value.graded
        } else {
          console.error(`cron-snapshot: card ${batch[j].id} failed:`, r.reason)
        }
      }
    }

    // 4. Prune history older than the retention window.
    const cutoff = cutoffDay(HISTORY_RETENTION_DAYS)
    const { data: prunedPrice, error: prunePriceErr } = await supabaseAdmin
      .from('price_history')
      .delete()
      .lt('day', cutoff)
      .select('card_id')
    if (prunePriceErr) throw new Error(`price_history prune failed: ${prunePriceErr.message}`)

    const { data: prunedGraded, error: pruneGradedErr } = await supabaseAdmin
      .from('graded_price_history')
      .delete()
      .lt('day', cutoff)
      .select('card_id')
    if (pruneGradedErr) {
      throw new Error(`graded_price_history prune failed: ${pruneGradedErr.message}`)
    }

    return res.status(200).json({
      cardsProcessed,
      raw: rawTotal,
      graded: gradedTotal,
      pruned: {
        price_history: prunedPrice?.length ?? 0,
        graded_price_history: prunedGraded?.length ?? 0,
      },
    })
  } catch (error) {
    console.error('cron-snapshot failed:', error)
    return res.status(500).json({ error: String(error?.message ?? error) })
  }
}
