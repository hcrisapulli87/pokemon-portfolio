import { expect, test } from 'vitest'
import { cutoffDay } from '../api/lib/refresh'

test('cutoffDay subtracts days from a fixed date', () => {
  const from = new Date('2026-07-24T00:00:00Z')
  expect(cutoffDay(400, from)).toBe('2025-06-19')
})

test('cutoffDay(0) is the same UTC day', () => {
  const from = new Date('2026-07-24T23:59:00Z')
  expect(cutoffDay(0, from)).toBe('2026-07-24')
})

test('cutoffDay crosses month/year boundaries', () => {
  const from = new Date('2026-01-05T12:00:00Z')
  expect(cutoffDay(10, from)).toBe('2025-12-26')
})
