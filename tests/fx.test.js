import { afterEach, expect, test, vi } from 'vitest'
import { usdToAud, getUsdToAudRate, FALLBACK_USD_TO_AUD } from '../api/lib/fx'

test('converts', () => { expect(usdToAud(10, 1.5)).toBe(15) })
test('null amount -> null', () => { expect(usdToAud(null, 1.5)).toBe(null) })
test('rounds to cents', () => { expect(usdToAud(10, 1.234)).toBe(12.34) })

afterEach(() => {
  vi.restoreAllMocks()
})

test('getUsdToAudRate returns the live rate when fetch succeeds', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ rates: { AUD: 1.62 } }),
  })
  expect(await getUsdToAudRate()).toBe(1.62)
})

test('getUsdToAudRate falls back when fetch throws', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
  expect(await getUsdToAudRate()).toBe(FALLBACK_USD_TO_AUD)
})

test('getUsdToAudRate falls back on non-ok response', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 })
  expect(await getUsdToAudRate()).toBe(FALLBACK_USD_TO_AUD)
})
