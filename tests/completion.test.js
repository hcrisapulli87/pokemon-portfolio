import { setCompletion } from '../src/lib/completion'

test('counts owned variants over total variants', () => {
  const variants = [
    { card_id: 'a', variant_type: 'normal' },
    { card_id: 'a', variant_type: 'reverse_holo' },
    { card_id: 'b', variant_type: 'normal' },
  ]
  const owned = [{ card_id: 'a', variant_type: 'normal' }]
  expect(setCompletion(variants, owned)).toEqual({ owned: 1, total: 3, pct: 33 })
})

test('empty set is 0/0 pct 0', () => {
  expect(setCompletion([], [])).toEqual({ owned: 0, total: 0, pct: 0 })
})

test('duplicate owned rows do not double-count', () => {
  const variants = [{ card_id: 'a', variant_type: 'normal' }]
  const owned = [
    { card_id: 'a', variant_type: 'normal' },
    { card_id: 'a', variant_type: 'normal' },
  ]
  expect(setCompletion(variants, owned)).toEqual({ owned: 1, total: 1, pct: 100 })
})
