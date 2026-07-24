// Currency conversion helpers.

export function usdToAud(amount, rate) {
  if (amount === null || amount === undefined) return null
  return Math.round(amount * rate * 100) / 100
}
