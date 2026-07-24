// TCGdex adapter (Japanese catalog). No API key, no User-Agent spoof server-side.
//
// Live-API shapes (verified 2026-07-24):
//   GET /sets       -> [{ id, name, cardCount:{ total, official } }]  (no logo/symbol/date)
//   GET /sets/{id}  -> { id, name, releaseDate, serie:{id,name}, cardCount, cards:[ {id,localId,name,image?} ] }
// Card/set `image`/`logo` assets are base URLs WITHOUT extension: append
// `/low.png` | `/high.png` for cards. JP sets have NO logo asset (all 404), so
// we use the set's first card image as its cover. Brand-new sets can ship before
// their card scans exist, so `image` is sometimes missing — handled, not thrown.
//
// English annotation: TCGdex JP names are katakana only (パラス, リザードン…). We
// add an English species name (jp-species-map.json) per card, and a curated
// English set name (jp-set-names.json) per set, so the collection is
// searchable/readable in English. Both are best-effort; unmatched -> null.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SPECIES_MAP = JSON.parse(
  readFileSync(join(__dirname, '..', 'jp-species-map.json'), 'utf8')
)
const SET_NAMES = JSON.parse(
  readFileSync(join(__dirname, '..', 'jp-set-names.json'), 'utf8')
)

const BASE_URL = 'https://api.tcgdex.net/v2/ja'

// --- English-name derivation (pure) ---

const REGION_PREFIXES = [
  ['アローラ', 'Alolan '],
  ['ガラル', 'Galarian '],
  ['ヒスイ', 'Hisuian '],
  ['パルデア', 'Paldean '],
]
// Longest first so 'VMAX'/'VSTAR' win over 'V'.
const SUFFIXES = [
  ['VMAX', ' VMAX'],
  ['VSTAR', ' VSTAR'],
  ['V-UNION', ' V-UNION'],
  ['GX', ' GX'],
  ['ex', ' ex'],
  ['EX', ' ex'],
  ['V', ' V'],
]

// Best-effort English name for a Japanese (katakana) card name. Handles region
// forms (Alolan…), Mega, and V/VMAX/ex/GX suffixes. Non-Pokémon or unmatched
// names return null (no English shown).
export function deriveEnglishName(jpName) {
  if (!jpName) return null
  let s = String(jpName).trim()

  let prefix = ''
  for (const [k, v] of REGION_PREFIXES) {
    if (s.startsWith(k)) {
      prefix = v
      s = s.slice(k.length)
      break
    }
  }

  let mega = false
  if (s.startsWith('メガ')) {
    mega = true
    s = s.slice(2)
  }

  let suffix = ''
  for (const [k, v] of SUFFIXES) {
    if (s.length > k.length && s.endsWith(k)) {
      suffix = v
      s = s.slice(0, -k.length)
      break
    }
  }

  s = s.trim()
  const base = SPECIES_MAP[s]
  if (!base) return null

  return `${prefix}${mega ? 'Mega ' : ''}${base}${suffix}`
}

// --- pure mappers (unit-tested; no network) ---

export function mapTcgdexSet(brief) {
  const cardCount = brief.cardCount
  return {
    id: brief.id,
    name: brief.name,
    name_en: SET_NAMES[brief.id] ?? null,
    series: null,
    language: 'JP',
    printed_total: cardCount?.official ?? null,
    total: cardCount?.total ?? null,
    release_date: null,
    symbol_url: null,
    logo_url: null,
  }
}

// Returns { card, variants }. Brief lacks reliable variant data -> ['normal'].
export function mapTcgdexCard(brief, setId) {
  const image = brief.image ?? null
  const card = {
    id: brief.id,
    set_id: setId,
    name: brief.name,
    name_en: deriveEnglishName(brief.name),
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

// GET /sets/{setId} -> full set with `cards` brief array + release/serie.
// Returns { items:[{card,variants}], setPatch } where setPatch backfills the set
// row's release_date, series, English name, and a cover (first card image, since
// JP sets have no logo asset). Empty/missing cards -> items:[] (warn, no throw).
export async function fetchSetCards(setId) {
  const set = await getJson(`/sets/${setId}`)
  const cards = set && Array.isArray(set.cards) ? set.cards : null
  const items = cards && cards.length ? cards.map((b) => mapTcgdexCard(b, setId)) : []
  if (items.length === 0) console.warn(`tcgdex set ${setId} returned no cards`)

  const cover = items.find((it) => it.card.image_small)?.card.image_small ?? null
  const setPatch = {
    release_date: set?.releaseDate ?? null,
    series: set?.serie?.name ?? null,
    name_en: SET_NAMES[setId] ?? null,
    logo_url: cover,
  }
  return { items, setPatch }
}
