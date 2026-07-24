// TCGdex adapter (Japanese catalog). No API key, no User-Agent spoof server-side.
//
// NOTE (verify against live API at hand-off): assumed response shapes are —
//   GET /sets       -> array of set briefs { id, name, cardCount: { total, official }, symbol?, logo? }
//   GET /sets/{id}  -> full set { ..., cards: [ { id, localId, name, image } ] }
// where `symbol`/`logo`/`image` are base URLs WITHOUT extension (append .png / /low.png / /high.png).
// Some sets legitimately return an empty or missing `cards` array — handled, not thrown.

const BASE_URL = 'https://api.tcgdex.net/v2/ja'

// --- pure mappers (unit-tested; no network) ---

export function mapTcgdexSet(brief) {
  const cardCount = brief.cardCount
  return {
    id: brief.id,
    name: brief.name,
    series: null,
    language: 'JP',
    printed_total: cardCount?.official ?? null,
    total: cardCount?.total ?? null,
    release_date: null,
    symbol_url: brief.symbol ? `${brief.symbol}.png` : null,
    logo_url: brief.logo ? `${brief.logo}.png` : null,
  }
}

// Returns { card, variants }. Brief lacks reliable variant data -> ['normal'].
export function mapTcgdexCard(brief, setId) {
  const image = brief.image ?? null
  const card = {
    id: brief.id,
    set_id: setId,
    name: brief.name,
    number: brief.localId ?? null,
    rarity: null,
    supertype: null,
    image_small: image ? `${image}/low.png` : null,
    image_large: image ? `${image}/high.png` : null,
    language: 'JP',
  }
  return { card, variants: ['normal'] }
}

// --- thin async fetch wrappers ---

async function getJson(path) {
  const res = await fetch(`${BASE_URL}${path}`)
  if (!res.ok) {
    throw new Error(`tcgdex GET ${path} -> ${res.status} ${res.statusText}`)
  }
  return res.json()
}

// GET /sets -> array of set briefs.
export async function fetchSets() {
  const data = await getJson('/sets')
  const arr = Array.isArray(data) ? data : []
  return arr.map(mapTcgdexSet)
}

// GET /sets/{setId} -> full set with `cards` brief array.
// Returns array of { card, variants }. Empty/missing cards -> [] (warn, no throw).
export async function fetchSetCards(setId) {
  const set = await getJson(`/sets/${setId}`)
  const cards = set && Array.isArray(set.cards) ? set.cards : null
  if (!cards || cards.length === 0) {
    console.warn(`tcgdex set ${setId} returned no cards`)
    return []
  }
  return cards.map((brief) => mapTcgdexCard(brief, setId))
}
