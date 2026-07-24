// pokemontcg.io price + variant mapping.

// Maps tcgplayer price keys to our internal variant_type.
const PRICE_KEY_TO_VARIANT = {
  normal: 'normal',
  holofoil: 'holo',
  reverseHolofoil: 'reverse_holo',
  '1stEditionHolofoil': 'holo',
  '1stEdition': 'normal',
  unlimitedHolofoil: 'holo',
}

// For each known price key present with a numeric `market`, emit
// { variant_type, market_price }. Preserves input key order and dedups
// variant_type keeping the first occurrence.
export function pickTcgVariantPrice(prices) {
  if (!prices || typeof prices !== 'object') return []

  const seen = new Set()
  const rows = []
  for (const key of Object.keys(prices)) {
    const variant_type = PRICE_KEY_TO_VARIANT[key]
    if (!variant_type) continue
    if (seen.has(variant_type)) continue

    const entry = prices[key]
    const market = entry && entry.market
    if (typeof market !== 'number') continue

    seen.add(variant_type)
    rows.push({ variant_type, market_price: market })
  }
  return rows
}

// Derive the set of variant_types a card has, from its tcgplayer price keys
// plus rarity hints. Returns a plain string array.
export function deriveVariants(card) {
  const seen = new Set()
  const variants = []
  const add = (v) => {
    if (!seen.has(v)) {
      seen.add(v)
      variants.push(v)
    }
  }

  const prices = card && card.tcgplayer && card.tcgplayer.prices
  if (prices && typeof prices === 'object') {
    for (const key of Object.keys(prices)) {
      const variant_type = PRICE_KEY_TO_VARIANT[key]
      if (variant_type) add(variant_type)
    }
  }

  if (variants.length === 0) add('normal')

  const rarity = (card && card.rarity ? String(card.rarity) : '').toLowerCase()
  if (rarity.includes('secret')) add('secret')
  if (rarity.includes('hyper')) add('hyper')
  if (rarity.includes('illustration') || rarity.includes('special')) add('special_art')

  return variants
}
