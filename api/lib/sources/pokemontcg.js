// pokemontcg.io adapter (English catalog).
// ALWAYS sends X-Api-Key — omitting it was the old app's biggest mistake.

import { deriveVariants } from '../normalize.js'

const BASE_URL = 'https://api.pokemontcg.io/v2'

function headers() {
  return { 'X-Api-Key': process.env.POKEMONTCG_API_KEY }
}

// --- pure mappers (unit-tested; no network) ---

export function mapPokemontcgSet(rawSet) {
  return {
    id: rawSet.id,
    name: rawSet.name,
    series: rawSet.series ?? null,
    language: 'EN',
    printed_total: rawSet.printedTotal ?? null,
    total: rawSet.total ?? null,
    release_date: rawSet.releaseDate ?? null,
    symbol_url: rawSet.images?.symbol ?? null,
    logo_url: rawSet.images?.logo ?? null,
  }
}

// Returns { card, variants, tcgplayerPrices }.
export function mapPokemontcgCard(rawCard, setId) {
  const card = {
    id: rawCard.id,
    set_id: setId,
    name: rawCard.name,
    number: rawCard.number ?? null,
    rarity: rawCard.rarity ?? null,
    supertype: rawCard.supertype ?? null,
    image_small: rawCard.images?.small ?? null,
    image_large: rawCard.images?.large ?? null,
    language: 'EN',
  }
  return {
    card,
    variants: deriveVariants(rawCard),
    tcgplayerPrices: rawCard.tcgplayer?.prices,
  }
}

// --- thin async fetch wrappers ---

async function getJson(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: headers() })
  if (!res.ok) {
    throw new Error(`pokemontcg GET ${path} -> ${res.status} ${res.statusText}`)
  }
  return res.json()
}

// GET /sets?pageSize=250 with pagination.
export async function fetchSets() {
  const pageSize = 250
  let page = 1
  const out = []
  for (;;) {
    const body = await getJson(`/sets?pageSize=${pageSize}&page=${page}`)
    const data = body.data ?? []
    for (const rawSet of data) out.push(mapPokemontcgSet(rawSet))
    const totalCount = body.totalCount ?? out.length
    if (out.length >= totalCount || data.length === 0) break
    page += 1
  }
  return out
}

// GET /cards?q=set.id:${setId}&pageSize=250 with pagination.
// Returns array of { card, variants, tcgplayerPrices }.
export async function fetchSetCards(setId) {
  const pageSize = 250
  let page = 1
  const out = []
  for (;;) {
    const q = encodeURIComponent(`set.id:${setId}`)
    const body = await getJson(`/cards?q=${q}&pageSize=${pageSize}&page=${page}`)
    const data = body.data ?? []
    for (const rawCard of data) out.push(mapPokemontcgCard(rawCard, setId))
    const totalCount = body.totalCount ?? out.length
    if (out.length >= totalCount || data.length === 0) break
    page += 1
  }
  return out
}
