import { mapPokemontcgSet, mapPokemontcgCard } from '../api/lib/sources/pokemontcg'
import { mapTcgdexSet, mapTcgdexCard } from '../api/lib/sources/tcgdex'

// --- pokemontcg (EN) ---

test('mapPokemontcgSet maps fields and language', () => {
  const raw = {
    id: 'base1',
    name: 'Base',
    series: 'Base',
    printedTotal: 102,
    total: 102,
    releaseDate: '1999/01/09',
    images: { symbol: 'http://s/symbol.png', logo: 'http://s/logo.png' },
  }
  expect(mapPokemontcgSet(raw)).toEqual({
    id: 'base1',
    name: 'Base',
    series: 'Base',
    language: 'EN',
    printed_total: 102,
    total: 102,
    release_date: '1999/01/09',
    symbol_url: 'http://s/symbol.png',
    logo_url: 'http://s/logo.png',
  })
})

test('mapPokemontcgCard maps images, language, and derives variants', () => {
  const raw = {
    id: 'base1-4',
    name: 'Charizard',
    number: '4',
    rarity: 'Rare Holo',
    supertype: 'Pokémon',
    images: { small: 'http://c/small.png', large: 'http://c/large.png' },
    tcgplayer: { prices: { holofoil: { market: 100 }, reverseHolofoil: { market: 50 } } },
  }
  const { card, variants, tcgplayerPrices } = mapPokemontcgCard(raw, 'base1')
  expect(card).toEqual({
    id: 'base1-4',
    set_id: 'base1',
    name: 'Charizard',
    number: '4',
    rarity: 'Rare Holo',
    supertype: 'Pokémon',
    image_small: 'http://c/small.png',
    image_large: 'http://c/large.png',
    language: 'EN',
  })
  expect(variants).toEqual(['holo', 'reverse_holo'])
  expect(tcgplayerPrices).toEqual(raw.tcgplayer.prices)
})

test('mapPokemontcgCard tolerates missing images/prices', () => {
  const { card, variants, tcgplayerPrices } = mapPokemontcgCard(
    { id: 'x-1', name: 'Pika', number: '1', rarity: 'Common' },
    'x'
  )
  expect(card.image_small).toBeNull()
  expect(card.image_large).toBeNull()
  expect(variants).toEqual(['normal'])
  expect(tcgplayerPrices).toBeUndefined()
})

// --- tcgdex (JP) ---

test('mapTcgdexSet maps cardCount and appends .png to symbol/logo', () => {
  const brief = {
    id: 'sv1',
    name: 'スカーレットex',
    cardCount: { total: 108, official: 78 },
    symbol: 'http://t/sv1/symbol',
    logo: 'http://t/sv1/logo',
  }
  expect(mapTcgdexSet(brief)).toEqual({
    id: 'sv1',
    name: 'スカーレットex',
    series: null,
    language: 'JP',
    printed_total: 78,
    total: 108,
    release_date: null,
    symbol_url: 'http://t/sv1/symbol.png',
    logo_url: 'http://t/sv1/logo.png',
  })
})

test('mapTcgdexSet nulls symbol/logo when absent', () => {
  const out = mapTcgdexSet({ id: 'sv1', name: 'X', cardCount: { total: 1 } })
  expect(out.printed_total).toBeNull()
  expect(out.total).toBe(1)
  expect(out.symbol_url).toBeNull()
  expect(out.logo_url).toBeNull()
})

test('mapTcgdexCard builds low/high image urls, JP language, normal variant', () => {
  const brief = { id: 'sv1-1', localId: '1', name: 'ニャオハ', image: 'http://t/sv1/1' }
  const { card, variants } = mapTcgdexCard(brief, 'sv1')
  expect(card).toEqual({
    id: 'sv1-1',
    set_id: 'sv1',
    name: 'ニャオハ',
    number: '1',
    rarity: null,
    supertype: null,
    image_small: 'http://t/sv1/1/low.png',
    image_large: 'http://t/sv1/1/high.png',
    language: 'JP',
  })
  expect(variants).toEqual(['normal'])
})

test('mapTcgdexCard nulls images when brief has no image', () => {
  const { card } = mapTcgdexCard({ id: 'sv1-2', localId: '2', name: 'X' }, 'sv1')
  expect(card.image_small).toBeNull()
  expect(card.image_large).toBeNull()
})
