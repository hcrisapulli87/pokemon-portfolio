import { expect, test } from 'vitest'
import { summarizePrices } from '../api/lib/sources/ebay'

test('summarizePrices computes avg/min/max/num', () => {
  expect(summarizePrices([10, 20, 30])).toEqual({ avg: 20, min: 10, max: 30, num: 3 })
})

test('summarizePrices rounds avg to 2dp', () => {
  expect(summarizePrices([10, 10, 11])).toEqual({ avg: 10.33, min: 10, max: 11, num: 3 })
})

test('summarizePrices ignores non-numeric values', () => {
  expect(summarizePrices([10, NaN, undefined, 30])).toEqual({
    avg: 20, min: 10, max: 30, num: 2,
  })
})

test('summarizePrices returns null for empty list', () => {
  expect(summarizePrices([])).toBeNull()
  expect(summarizePrices(null)).toBeNull()
})
