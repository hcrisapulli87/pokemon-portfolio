import { pickTcgVariantPrice, deriveVariants } from '../api/lib/normalize'

test('maps tcgplayer prices to variant rows', () => {
  const prices = { normal: { market: 2 }, reverseHolofoil: { market: 5 } }
  expect(pickTcgVariantPrice(prices)).toEqual([
    { variant_type: 'normal', market_price: 2 },
    { variant_type: 'reverse_holo', market_price: 5 },
  ])
})
test('maps holofoil and 1stEdition, skips null markets', () => {
  const prices = { holofoil: { market: 8 }, '1stEditionHolofoil': { market: null } }
  expect(pickTcgVariantPrice(prices)).toEqual([
    { variant_type: 'holo', market_price: 8 },
  ])
})
test('undefined prices -> empty array', () => {
  expect(pickTcgVariantPrice(undefined)).toEqual([])
})

test('deriveVariants from a card with normal + reverse tcgplayer prices', () => {
  const card = { rarity: 'Common', tcgplayer: { prices: { normal: {}, reverseHolofoil: {} } } }
  expect(deriveVariants(card).sort()).toEqual(['normal', 'reverse_holo'])
})
test('deriveVariants for a secret rare has secret variant', () => {
  const card = { rarity: 'Rare Secret', tcgplayer: { prices: { holofoil: {} } } }
  const v = deriveVariants(card)
  expect(v).toContain('holo')
  expect(v).toContain('secret')
})
test('deriveVariants falls back to normal when no price keys', () => {
  expect(deriveVariants({ rarity: 'Common' })).toEqual(['normal'])
})
