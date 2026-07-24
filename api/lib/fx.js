// Currency conversion helpers.

export function usdToAud(amount, rate) {
  if (amount === null || amount === undefined) return null
  return Math.round(amount * rate * 100) / 100
}

// Fallback rate used when the live FX endpoint is unreachable.
export const FALLBACK_USD_TO_AUD = 1.5

// Fetch the live USD->AUD rate from open.er-api.com (no API key required).
// Falls back to FALLBACK_USD_TO_AUD on any failure so callers never crash.
export async function getUsdToAudRate() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    if (!res.ok) return FALLBACK_USD_TO_AUD
    const data = await res.json()
    const aud = data?.rates?.AUD
    return typeof aud === 'number' ? aud : FALLBACK_USD_TO_AUD
  } catch {
    return FALLBACK_USD_TO_AUD
  }
}
