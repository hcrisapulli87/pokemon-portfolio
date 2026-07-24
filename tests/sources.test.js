import { mapPokemontcgSet, mapPokemontcgCard } from '../api/lib/sources/pokemontcg'
import {
  mapTcgdexSet,
  mapTcgdexCard,
  deriveEnglishName,
} from '../api/lib/sources/tcgdex'

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
    name_en: null,
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
    name_en: null,
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

test('mapTcgdexSet maps cardCount, nulls logo/symbol, adds curated name_en', () => {
  // S12a is in the curated jp-set-names map -> "VSTAR Universe".
  const brief = {
    id: 'S12a',
    name: 'VSTARユニバース',
    cardCount: { total: 254, official: 172 },
  }
  expect(mapTcgdexSet(brief)).toEqual({
    id: 'S12a',
    name: 'VSTARユニバース',
    name_en: 'VSTAR Universe',
    series: null,
    language: 'JP',
    printed_total: 172,
    total: 254,
    release_date: null,
    symbol_url: null,
    logo_url: null,
  })
})

test('mapTcgdexSet name_en is null for uncurated sets', () => {
  const out = mapTcgdexSet({ id: 'zz9', name: 'X', cardCount: { total: 1 } })
  expect(out.name_en).toBeNull()
  expect(out.total).toBe(1)
  expect(out.logo_url).toBeNull()
})

test('mapTcgdexCard builds image urls, JP language, English species name', () => {
  const brief = { id: 'sv1-1', localId: '1', name: 'ニャオハ', image: 'http://t/sv1/1' }
  const { card, variants } = mapTcgdexCard(brief, 'sv1')
  expect(card).toEqual({
    id: 'sv1-1',
    set_id: 'sv1',
    name: 'ニャオハ',
    name_en: 'Sprigatito',
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
  const { card } = mapTcgdexCard({ id: 'sv1-2', localId: '2', name: 'リザードン' }, 'sv1')
  expect(card.image_small).toBeNull()
  expect(card.image_large).toBeNull()
  expect(card.name_en).toBe('Charizard')
})

test('deriveEnglishName: plain, suffixes, mega, region forms, non-matches', () => {
  expect(deriveEnglishName('パラス')).toBe('Paras')
  expect(deriveEnglishName('リザードンex')).toBe('Charizard ex')
  expect(deriveEnglishName('リザードンV')).toBe('Charizard V')
  expect(deriveEnglishName('リザードンVMAX')).toBe('Charizard VMAX')
  expect(deriveEnglishName('リザードンVSTAR')).toBe('Charizard VSTAR')
  expect(deriveEnglishName('メガリザードンex')).toBe('Mega Charizard ex')
  expect(deriveEnglishName('アローラロコン')).toBe('Alolan Vulpix')
  expect(deriveEnglishName('博士の研究')).toBeNull() // trainer card
  expect(deriveEnglishName('')).toBeNull()
})
