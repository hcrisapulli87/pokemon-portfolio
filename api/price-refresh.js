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
import { requireUser } from './lib/auth.js'
import { refreshCard } from './lib/refresh.js'

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return
  try {
    const cardId = req.body?.cardId ?? req.query?.cardId
    const graded = req.body?.graded ?? null

    if (!cardId) {
      return res.status(400).json({ error: 'cardId is required' })
    }

    const { data: card, error: cardErr } = await supabaseAdmin
      .from('cards')
      .select('id, language, name, name_en, number, set_id')
      .eq('id', cardId)
      .single()
    if (cardErr || !card) {
      return res.status(404).json({ error: `card not found: ${cardId}` })
    }

    const gradedList = Array.isArray(graded) ? graded : []
    const { raw, graded: gradedCount } = await refreshCard(card, gradedList)

    return res.status(200).json({ raw, graded: gradedCount })
  } catch (error) {
    console.error('price-refresh failed:', error)
    return res.status(500).json({ error: String(error?.message ?? error) })
  }
}
